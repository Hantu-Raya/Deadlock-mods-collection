#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const harness = require('./poker-panorama-vm');

const ROOT = path.resolve(__dirname, '..');
const LAYOUT_PATH = path.join(ROOT, 'panorama', 'layout', 'chat.xml');
const MENU_LAYOUT_PATH = path.join(ROOT, 'panorama', 'layout', 'hud_escape_menu.xml');
const SCRIPT_PATH = path.join(ROOT, 'panorama', 'scripts', 'poker_chat_debug.js');
const MENU_SCRIPT_PATH = path.join(ROOT, 'panorama', 'scripts', 'poker_escape_menu.js');
const MENU_STYLE_PATH = path.join(ROOT, 'panorama', 'styles', 'poker_escape_menu.css');
const CARD_IMAGE_DIR = path.join(ROOT, 'panorama', 'images', 'poker', 'cards');
const REQUIRED_CARD_IMAGE_NAMES = [
  'card_face_ace.png',
  'card_face_jack.png',
  'card_face_joker.png',
  'card_face_king.png',
  'card_face_queen.png',
  'card_suit_club.png',
  'card_suit_diamond.png',
  'card_suit_heart.png',
  'card_suit_spade.png',
];
const EXPECTED_CARD_IMAGE_SIZE = 512;
const CHIP_IMAGE_DIR = path.join(ROOT, 'panorama', 'images', 'poker', 'chips');
const REQUIRED_CHIP_IMAGE_NAMES = [
  'pot_100_red_chips_512.png',
  'pot_300_green_chips_512.png',
  'pot_500_green_chips_512.png',
  'pot_1000_black_chips_512.png',
  'pot_2500_plus_mixed_chips_512.png',
];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ADAM7_PASSES = [
  { x: 0, y: 0, dx: 8, dy: 8 },
  { x: 4, y: 0, dx: 8, dy: 8 },
  { x: 0, y: 4, dx: 4, dy: 8 },
  { x: 2, y: 0, dx: 4, dy: 4 },
  { x: 0, y: 2, dx: 2, dy: 4 },
  { x: 1, y: 0, dx: 2, dy: 2 },
  { x: 0, y: 1, dx: 1, dy: 2 },
];
const failures = [];
const LEGACY_RUNTIME_BASELINE = 6264;
const BLUFF_DECK_RUNTIME_BUDGET = 1600;
const RUNTIME_LINE_LIMIT = LEGACY_RUNTIME_BASELINE + BLUFF_DECK_RUNTIME_BUDGET;

function normalizePath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function readSource(label, filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    failures.push(`${label} missing or unreadable: ${normalizePath(filePath)} (${error.message})`);
    return '';
  }
}

function physicalLineCount(source) {
  let normalized = String(source || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (normalized.endsWith('\n')) normalized = normalized.slice(0, -1);
  return normalized ? normalized.split('\n').length : 0;
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertIncludes(label, source, token, reason) {
  assert(source.includes(token), `${label} ${reason}: ${token}`);
}

function assertMatches(label, source, pattern, reason) {
  assert(pattern.test(source), `${label} ${reason}: ${pattern}`);
}

function countOccurrences(source, token) {
  return String(source || '').split(token).length - 1;
}

function createChatBridgeRuntime() {
  const runtime = harness.createValidatorContext({ rootId: 'Chat', nowStep: 1 });
  harness.runScript(runtime.sandbox, SCRIPT_PATH);
  return {
    config: runtime.config,
    dispatches: runtime.dispatches,
    hooks: runtime.sandbox.__PokerChatDebugTestHooks,
    logs: runtime.messages,
    panels: runtime.panels,
    schedules: runtime.schedules,
  };
}

function cssBlock(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`(?:^|\\})\\s*${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'));
  return match ? match[1] : '';
}

function cssLastBlock(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = Array.from(source.matchAll(new RegExp(`(?:^|\\})\\s*${escapedSelector}\\s*\\{([^}]*)\\}`, 'gm')));
  return matches.length ? matches[matches.length - 1][1] : '';
}

function cssLastBlockContainingSelector(source, selector) {
  let result = '';
  for (const block of source.matchAll(/(?:^|})\s*([^{}]+)\{([^}]*)\}/gm)) {
    const selectors = block[1].split(',').map((value) => value.trim());
    if (selectors.includes(selector)) result = block[2];
  }
  return result;
}

function cssBlockContainingSelector(source, selector) {
  const blocks = source.matchAll(/(?:^|})\s*([^{}]+)\{([^}]*)\}/gm);
  for (const block of blocks) {
    const selectors = block[1].split(',').map((value) => value.trim());
    if (selectors.includes(selector)) return block[2];
  }
  return '';
}

function sourceSliceFromId(source, id) {
  const match = new RegExp(`\\bid=["']${id}["']`).exec(source);
  return match ? source.slice(match.index) : '';
}

function sourceSliceBetweenIds(source, startId, endId) {
  const start = sourceSliceFromId(source, startId);
  if (!start) return '';
  const endMatch = new RegExp(`\\bid=["']${endId}["']`).exec(start.slice(1));
  return endMatch ? start.slice(0, endMatch.index + 1) : start;
}

function parseXmlTree(source) {
  const root = { name: '__root__', attrs: {}, children: [], parent: null };
  const stack = [root];
  const tokenPattern = /<!--[\s\S]*?-->|<[^>]+>/g;
  let match;
  while ((match = tokenPattern.exec(String(source || '')))) {
    const token = match[0];
    if (token.startsWith('<!--') || token.startsWith('<?') || token.startsWith('<!')) continue;
    if (/^<\s*\//.test(token)) {
      const closeMatch = /^<\s*\/\s*([A-Za-z0-9_:-]+)\s*>$/.exec(token);
      if (!closeMatch || stack.length <= 1 || stack[stack.length - 1].name !== closeMatch[1]) return null;
      stack.pop();
      continue;
    }
    const openMatch = /^<\s*([A-Za-z0-9_:-]+)([\s\S]*?)\/?\s*>$/.exec(token);
    if (!openMatch) return null;
    const node = { name: openMatch[1], attrs: {}, children: [], parent: stack[stack.length - 1] };
    const attrSource = openMatch[2].replace(/\/\s*$/, '');
    for (const attrMatch of attrSource.matchAll(/([A-Za-z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      node.attrs[attrMatch[1]] = attrMatch[2] === undefined ? attrMatch[3] : attrMatch[2];
    }
    node.parent.children.push(node);
    if (!/\/\s*>$/.test(token)) stack.push(node);
  }
  return stack.length === 1 ? root : null;
}

function findXmlNodeById(root, id) {
  if (!root) return null;
  if (root.attrs && root.attrs.id === id) return root;
  for (const child of root.children || []) {
    const found = findXmlNodeById(child, id);
    if (found) return found;
  }
  return null;
}

function xmlDescendant(root, predicate) {
  if (!root) return null;
  for (const child of root.children || []) {
    if (predicate(child)) return child;
    const found = xmlDescendant(child, predicate);
    if (found) return found;
  }
  return null;
}

function cssDeclarationValue(block, property) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\b${escapedProperty}\\s*:\\s*([^;]+);`).exec(block || '');
  return match ? match[1].trim() : '';
}


function cssColorLuminance(red, green, blue) {
  return (red * 0.2126) + (green * 0.7152) + (blue * 0.0722);
}

function cssColorTokenLuminance(color) {
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (hexMatch) {
    const hex = hexMatch[1].length === 3
      ? hexMatch[1].split('').map((part) => part + part).join('')
      : hexMatch[1];
    return cssColorLuminance(
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    );
  }
  const rgbMatch = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/i.exec(color);
  if (!rgbMatch) return NaN;
  const alpha = rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]);
  if (!Number.isFinite(alpha) || alpha <= 0.05) return NaN;
  return cssColorLuminance(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
}

function cssValueContainsDarkColor(value) {
  const hexColors = value.match(/#[0-9a-f]{3}(?:[0-9a-f]{3})?\b/gi) || [];
  const rgbColors = value.match(/rgba?\([^)]*\)/gi) || [];
  return hexColors.concat(rgbColors).some((color) => {
    const luminance = cssColorTokenLuminance(color);
    return Number.isFinite(luminance) && luminance < 96;
  });
}

function cssColorTokenIsTransparent(color) {
  if (/\btransparent\b/i.test(color)) return true;
  const rgbMatch = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/i.exec(color);
  if (!rgbMatch || rgbMatch[4] === undefined) return false;
  const alpha = Number(rgbMatch[4]);
  return Number.isFinite(alpha) && alpha <= 0.05;
}

function cssValuePaintIsTransparent(value) {
  const normalized = (value || '').trim();
  if (!normalized) return false;
  const colorTokens = normalized.match(/#[0-9a-f]{3}(?:[0-9a-f]{3})?\b|rgba?\([^)]*\)|\btransparent\b/gi) || [];
  return colorTokens.length > 0 && colorTokens.every(cssColorTokenIsTransparent);
}

function cssValueRemovesVisiblePaint(value) {
  const normalized = (value || '').trim().toLowerCase();
  if (/^(?:none|0|0px)$/.test(normalized)) return true;
  if (/^0(?:px)?\b/.test(normalized)) return true;
  return cssValuePaintIsTransparent(value);
}

function cssFirstDeclarationValue(block, properties) {
  for (const property of properties) {
    const value = cssDeclarationValue(block, property);
    if (value) return value;
  }
  return '';
}

function cssSelectorBlocks(source) {
  const entries = [];
  const blocks = source.matchAll(/(?:^|})\s*([^{}]+)\{([^}]*)\}/gm);
  for (const block of blocks) {
    for (const selector of block[1].split(',').map((value) => value.trim()).filter(Boolean)) {
      entries.push({ selector, block: block[2] });
    }
  }
  return entries;
}

function cssBlockContainingSelectorDeclaration(source, selector, property) {
  const blocks = source.matchAll(/(?:^|})\s*([^{}]+)\{([^}]*)\}/gm);
  for (const block of blocks) {
    const selectors = block[1].split(',').map((value) => value.trim());
    if (selectors.includes(selector) && cssDeclarationValue(block[2], property)) return block[2];
  }
  return '';
}

function assertCssDeclarationMatches(label, block, property, pattern, reason) {
  const value = cssDeclarationValue(block, property);
  assert(pattern.test(value), `${label} ${reason}: ${property}: ${value || '<missing>'}`);
}

function cssDeclarationForSelector(source, selector, property) {
  return cssDeclarationValue(cssBlockContainingSelectorDeclaration(source, selector, property), property);
}

function assertSharedCssDeclaration(label, source, firstSelector, secondSelector, property, pattern, reason) {
  const firstValue = cssDeclarationForSelector(source, firstSelector, property);
  const secondValue = cssDeclarationForSelector(source, secondSelector, property);
  assert(pattern.test(firstValue), `${label} ${firstSelector} ${reason}: ${property}: ${firstValue || '<missing>'}`);
  assert(pattern.test(secondValue), `${label} ${secondSelector} ${reason}: ${property}: ${secondValue || '<missing>'}`);
  assert(
    firstValue === secondValue,
    `${label} ${firstSelector} and ${secondSelector} must share ${property} so stable cards and flip layers align: ${firstValue || '<missing>'} vs ${secondValue || '<missing>'}`,
  );
}

function cssPxValue(block, property) {
  const value = cssDeclarationValue(block, property);
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value);
  return match ? Number(match[1]) : NaN;
}

function assertResponsiveWindowPosition(selector, options) {
  const block = cssBlock(menuStyle, selector);
  assert(block, `menu style must define ${selector} for responsive floating window positioning`);
  const verticalProperty = options.verticalProperty || 'margin-top';
  assertCssDeclarationMatches(`menu style ${selector}`, block, 'width', /^\d+(?:\.\d+)?%$/, 'must use percentage width');
  assert(!/\bmax-height\s*:/.test(block), `menu style ${selector} must not cap floating window height; percentage max-height caused Panorama clipping`);
  assertCssDeclarationMatches(`menu style ${selector}`, block, verticalProperty, /^\d+(?:\.\d+)?%$/, `must use percentage ${verticalProperty} positioning`);
  assertCssDeclarationMatches(`menu style ${selector}`, block, 'align', options.align, `must align to ${options.alignDescription}`);
  assertCssDeclarationMatches(`menu style ${selector}`, block, options.horizontalProperty, /^\d+(?:\.\d+)?%$/, `must use percentage ${options.horizontalProperty}`);
  assert(
    !new RegExp(`\\b${options.forbiddenHorizontalProperty}\\s*:`).test(block),
    `menu style ${selector} must not mix ${options.forbiddenHorizontalProperty} with ${options.horizontalProperty}`,
  );
  assert(
    !/\b(?:width|margin-left|margin-right|margin-top|margin-bottom)\s*:\s*-?\d+(?:\.\d+)?px\s*;/.test(block),
    `menu style ${selector} must not use fixed pixel sizing or offsets for responsive floating window positioning`,
  );
}

function parsePng(buffer) {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('not a PNG file');
  }

  let offset = PNG_SIGNATURE.length;
  let ihdr = null;
  let sawIend = false;
  const idatChunks = [];

  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) throw new Error('truncated PNG chunk header');

    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const nextOffset = dataEnd + 4;
    if (nextOffset > buffer.length) throw new Error(`truncated ${type} chunk`);

    const data = buffer.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      if (length !== 13) throw new Error(`IHDR chunk must be 13 bytes, got ${length}`);
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compressionMethod: data[10],
        filterMethod: data[11],
        interlaceMethod: data[12],
      };
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      sawIend = true;
      break;
    }

    offset = nextOffset;
  }

  if (!ihdr) throw new Error('missing IHDR chunk');
  if (idatChunks.length === 0) throw new Error('missing IDAT chunk');
  if (!sawIend) throw new Error('missing IEND chunk');

  return {
    ...ihdr,
    idatData: Buffer.concat(idatChunks),
  };
}

function passDimension(size, start, step) {
  if (size <= start) return 0;
  return Math.floor((size - start + step - 1) / step);
}

function paethPredictor(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function unfilterPngRow(filter, source, previousRow, bytesPerPixel) {
  const row = Buffer.alloc(source.length);
  for (let index = 0; index < source.length; index += 1) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
    const up = previousRow ? previousRow[index] : 0;
    const upperLeft = previousRow && index >= bytesPerPixel ? previousRow[index - bytesPerPixel] : 0;
    let value;

    if (filter === 0) {
      value = source[index];
    } else if (filter === 1) {
      value = source[index] + left;
    } else if (filter === 2) {
      value = source[index] + up;
    } else if (filter === 3) {
      value = source[index] + Math.floor((left + up) / 2);
    } else if (filter === 4) {
      value = source[index] + paethPredictor(left, up, upperLeft);
    } else {
      throw new Error(`unsupported PNG row filter ${filter}`);
    }

    row[index] = value & 0xff;
  }
  return row;
}

function rowHasTransparentAlpha(row, bytesPerSample, bytesPerPixel) {
  const alphaOffset = 3 * bytesPerSample;
  const fullAlpha = bytesPerSample === 1 ? 0xff : 0xffff;

  for (let offset = alphaOffset; offset < row.length; offset += bytesPerPixel) {
    const alpha = bytesPerSample === 1 ? row[offset] : (row[offset] << 8) | row[offset + 1];
    if (alpha < fullAlpha) return true;
  }
  return false;
}

function pngHasTransparentAlpha(png) {
  if (png.compressionMethod !== 0) throw new Error(`unsupported compression method ${png.compressionMethod}`);
  if (png.filterMethod !== 0) throw new Error(`unsupported filter method ${png.filterMethod}`);
  if (png.interlaceMethod !== 0 && png.interlaceMethod !== 1) {
    throw new Error(`unsupported interlace method ${png.interlaceMethod}`);
  }
  if (png.bitDepth !== 8 && png.bitDepth !== 16) {
    throw new Error(`unsupported RGBA bit depth ${png.bitDepth}`);
  }

  const bytesPerSample = png.bitDepth / 8;
  const bytesPerPixel = 4 * bytesPerSample;
  const passes = png.interlaceMethod === 0
    ? [{ x: 0, y: 0, dx: 1, dy: 1 }]
    : ADAM7_PASSES;
  const inflated = zlib.inflateSync(png.idatData);
  let offset = 0;
  let hasTransparentPixel = false;

  for (const pass of passes) {
    const width = passDimension(png.width, pass.x, pass.dx);
    const height = passDimension(png.height, pass.y, pass.dy);
    if (width === 0 || height === 0) continue;
    const rowBytes = width * bytesPerPixel;
    let previousRow = null;

    for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
      if (offset >= inflated.length) throw new Error('truncated decompressed image data');

      const filter = inflated[offset];
      offset += 1;
      if (offset + rowBytes > inflated.length) throw new Error('truncated decompressed scanline data');

      const sourceRow = inflated.subarray(offset, offset + rowBytes);
      offset += rowBytes;
      const row = unfilterPngRow(filter, sourceRow, previousRow, bytesPerPixel);
      if (rowHasTransparentAlpha(row, bytesPerSample, bytesPerPixel)) hasTransparentPixel = true;
      previousRow = row;
    }
  }

  if (offset !== inflated.length) {
    throw new Error(`unexpected ${inflated.length - offset} trailing decompressed bytes`);
  }
  return hasTransparentPixel;
}

function validatePngImage(imageName, directory, label, expectedSize) {
  const filePath = path.join(directory, imageName);
  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (error) {
    failures.push(`${label} image missing or unreadable: ${normalizePath(filePath)} (${error.message})`);
    return;
  }

  let png;
  try {
    png = parsePng(buffer);
  } catch (error) {
    failures.push(`${label} image ${imageName} must be a readable PNG: ${error.message}`);
    return;
  }

  assert(
    png.width === expectedSize && png.height === expectedSize,
    `${label} image ${imageName} must be ${expectedSize}x${expectedSize}, got ${png.width}x${png.height}`,
  );
  assert(
    png.colorType === 6,
    `${label} image ${imageName} must be PNG color type 6 (RGBA), got color type ${png.colorType}`,
  );

  if (png.colorType !== 6) return;

  try {
    assert(
      pngHasTransparentAlpha(png),
      `${label} image ${imageName} must contain at least one transparent pixel (alpha below full opacity)`,
    );
  } catch (error) {
    failures.push(`${label} image ${imageName} alpha data unreadable: ${error.message}`);
  }
}

function validateRequiredCardImages() {
  for (const imageName of REQUIRED_CARD_IMAGE_NAMES) {
    validatePngImage(imageName, CARD_IMAGE_DIR, 'card', EXPECTED_CARD_IMAGE_SIZE);
  }
}

function validateRequiredChipImages() {
  for (const imageName of REQUIRED_CHIP_IMAGE_NAMES) {
    validatePngImage(imageName, CHIP_IMAGE_DIR, 'chip', EXPECTED_CARD_IMAGE_SIZE);
    const vtexPath = path.join(CHIP_IMAGE_DIR, imageName.replace(/\.png$/, '.vtex'));
    assert(fs.existsSync(vtexPath), `chip VTEX source missing: ${normalizePath(vtexPath)}`);
  }
}

const layout = readSource('layout', LAYOUT_PATH);
const script = readSource('script', SCRIPT_PATH);
const menuScript = readSource('menu script', MENU_SCRIPT_PATH);
const menuLayout = readSource('menu layout', MENU_LAYOUT_PATH);
const menuStyle = readSource('menu style', MENU_STYLE_PATH);
const menuRuntimeLines = physicalLineCount(menuScript);
const bridgeRuntimeLines = physicalLineCount(script);
const totalRuntimeLines = menuRuntimeLines + bridgeRuntimeLines;
const bluffDeckRuntimeDelta = totalRuntimeLines - LEGACY_RUNTIME_BASELINE;
const remainingRuntimeBudget = RUNTIME_LINE_LIMIT - totalRuntimeLines;
assert(
  totalRuntimeLines <= RUNTIME_LINE_LIMIT,
  `Poker runtime physical-line limit exceeded: ${totalRuntimeLines} total (${menuRuntimeLines} menu + ${bridgeRuntimeLines} bridge), limit ${RUNTIME_LINE_LIMIT}`,
);
console.log(`Poker runtime baseline: ${LEGACY_RUNTIME_BASELINE}`);
console.log(`Bluff Deck runtime delta: ${bluffDeckRuntimeDelta}`);
console.log(`Bluff Deck runtime budget remaining: ${remainingRuntimeBudget}`);
console.log(`Poker runtime lines: ${menuRuntimeLines} menu + ${bridgeRuntimeLines} bridge = ${totalRuntimeLines} <= ${RUNTIME_LINE_LIMIT}`);
validateRequiredCardImages();
validateRequiredChipImages();

const bridgeContractLiterals = [
  'ClientUI_FireOutput',
  'PokerReadySeatsChanged',
  'PokerReadySeatsRequest',
  'PokerReadySeatsClearRequest',
  'PokerChatMessage',
  'PokerChatSnapshotRequest',
  'PokerReadySeats',
  'PokerReadyRevision',
  'PokerChatMessages',
  'PokerChatSequence',
  'PokerLastReadyEvent',
  'PokerLocalPlayerKey',
  'PokerLocalPlayerName',
  'PokerPendingSelfAction',
  'PokerPartyState',
  'PokerProgressState',
];

for (const [label, source] of [
  ['chat bridge script', script],
  ['menu script', menuScript],
]) {
  assertIncludes(label, source, 'const BridgeContract = {', 'must define the bridge contract module');
  for (const literal of bridgeContractLiterals) {
    assertIncludes(label, source, `"${literal}"`, 'must keep the shared bridge literal');
  }
}


for (const selector of [
  '.PokerPrimaryButton.Disabled',
  '.PokerSecondaryButton.Disabled',
  '.PokerStartButton.Disabled',
  '.PokerActionButton.Disabled',
  '.PokerActionButton.ReadOnly',
  '.PokerActionButton.Disabled:hover',
  '.PokerActionButton.ReadOnly:hover',
]) {
  assert(cssBlock(menuStyle, selector), `menu style must define ${selector} for disabled/read-only controls`);
}


assertIncludes('layout', layout, 's2r://panorama/styles/chat.vcss_c', 'must include the stock chat style');
assertIncludes('layout', layout, 's2r://panorama/scripts/poker_chat_debug.vjs_c', 'must load the compiled poker chat debug script');

for (const snippet of [
  'ChatMessageSource',
  'ChatMessageContents_Text',
  'ChatMessageContents_Ping',
]) {
  assertMatches('layout', layout, new RegExp(`<snippet\\s+name=["']${snippet}["']`), `must preserve stock snippet ${snippet}`);
}

assertMatches('layout', layout, /<CitadelChat[\s>]/, 'must preserve the CitadelChat root');
assertMatches('layout', layout, /id=["']ChatMessages["']/, 'must preserve #ChatMessages');
assertMatches('layout', layout, /id=["']ChatInput["']/, 'must preserve #ChatInput');
assertIncludes('layout', layout, 'CitadelChatInputSubmitted', 'must preserve the stock chat input submit handler');
assertMatches('layout', layout, /id=["']MessageContents["']/, 'must preserve #MessageContents for message text traversal');
assertMatches('menu layout', menuLayout, /id=["']PokerAnnouncerOverlay["']/, 'must expose #PokerAnnouncerOverlay for the ESC menu renderer');
assertMatches('menu layout', menuLayout, /id=["']PokerAnnouncerTitle["']/, 'must expose #PokerAnnouncerTitle for announcement headlines');
assertMatches('menu layout', menuLayout, /id=["']PokerAnnouncerBody["']/, 'must expose #PokerAnnouncerBody for announcement details');
for (const id of [
  'PokerPartyControls',
  'PokerHostPartyButton',
  'PokerJoinPartyButton',
  'PokerPartyStatusLabel',
  'PokerProgressControls',
  'PokerExportProgressButton',
  'PokerImportProgressButton',
  'PokerProgressCodeInput',
  'PokerProgressCodeLabel',
  'PokerResumeControls',
  'PokerResumeLeaderButton',
  'PokerResumeReadyButton',
  'PokerResumeStatusLabel',
  'PokerResumeLeaderList',
]) {
  assertMatches('menu layout', menuLayout, new RegExp(`id=["']${id}["']`), `must expose #${id} for poker sync controls`);
}

for (const token of [
  'PokerFloatingWindow',
  'PokerLobbyWindow',
  'PokerTableWindow',
  'PokerPlayersWindow',
  'PokerHistoryWindow',
  'PokerActionsWindow',
  'PokerFloatingHeader',
  'PokerLobbyBar',
  'PokerLobbyMeta',
  'PokerTableActionButtonsRow',
  'PokerTableFelt',
  'PokerTableSeats',
]) {
  assertIncludes('menu layout', menuLayout, token, `must expose ${token} for the four floating poker window layout`);
}
assertMatches(
  'menu layout',
  menuLayout,
  /id=["']PokerAnitaPanel["'][^>]*class=["'][^"']*\bPokerHidden\b/,
  'must keep #PokerAnitaPanel as a hidden compatibility anchor, not a visible floating panel',
);
for (const [id, className] of [
  ['PokerLobbyWindow', 'PokerLobbyWindow'],
  ['PokerTableWindow', 'PokerTableWindow'],
  ['PokerPlayersWindow', 'PokerPlayersWindow'],
  ['PokerActionsWindow', 'PokerActionsWindow'],
  ['PokerHistoryWindow', 'PokerHistoryWindow'],
]) {
  assertMatches(
    'menu layout',
    menuLayout,
    new RegExp(`id=["']${id}["'][^>]*class=["'][^"']*\\b${className}\\b`),
    `must expose #${id} as one of the four floating poker windows`,
  );
  assertMatches(
    'menu layout',
    menuLayout,
    new RegExp(`id=["']${id}["'][^>]*class=["'][^"']*\\bPokerFloatingWindow\\b`),
    `must expose #${id} with the shared PokerFloatingWindow class`,
  );
}
const bluffWindowLayout = sourceSliceBetweenIds(menuLayout, 'BluffDeckWindow', 'PokerAnitaPanel');
assertMatches(
  'menu layout #BluffDeckWindow',
  bluffWindowLayout,
  /id=["']BluffDeckPartyControls["'][\s\S]*id=["']BluffDeckHostButton["'][\s\S]*id=["']BluffDeckJoinButton["'][\s\S]*id=["']BluffDeckLeaveButton["'][\s\S]*<\/Panel>\s*<Panel id=["']BluffDeckMatchControls["'][\s\S]*id=["']BluffDeckStartButton["'][\s\S]*id=["']BluffDeckEndButton["']/,
  'must separate Bluff lobby controls from match controls so HOST cannot overlap JOIN',
);

const menuXmlTree = parseXmlTree(menuLayout);
assert(menuXmlTree, 'menu layout XML must remain balanced');
const bluffSurface = findXmlNodeById(menuXmlTree, 'BluffDeckTableSurface');
const bluffWindow = findXmlNodeById(menuXmlTree, 'BluffDeckWindow');
const bluffCardSlots = findXmlNodeById(menuXmlTree, 'BluffDeckCardSlots');
assert(bluffWindow && bluffCardSlots && bluffCardSlots.parent === bluffWindow, '#BluffDeckCardSlots must be a sibling picker panel outside BluffDeckTableSurface');
const bluffLifecycleControls = findXmlNodeById(menuXmlTree, 'BluffDeckLifecycleControls');
const bluffPartyControls = findXmlNodeById(menuXmlTree, 'BluffDeckPartyControls');
const bluffMatchControls = findXmlNodeById(menuXmlTree, 'BluffDeckMatchControls');
assert(bluffLifecycleControls && bluffPartyControls && bluffMatchControls, 'Bluff lifecycle controls must expose a shared compact row');
assert(bluffPartyControls.parent === bluffLifecycleControls && bluffMatchControls.parent === bluffLifecycleControls, 'Bluff leave/end control groups must share the compact lifecycle row');
const bluffCardTable = findXmlNodeById(menuXmlTree, 'BluffDeckCardTable');
const bluffFelt = bluffCardTable && bluffCardTable.children.find((node) => node.attrs && /\bPokerTableFelt\b/.test(node.attrs.class || ''));
const bluffSeats = findXmlNodeById(menuXmlTree, 'BluffDeckTableSeats');
const bluffTargetCard = findXmlNodeById(menuXmlTree, 'BluffDeckTargetCard');
const bluffPlayedCards = findXmlNodeById(menuXmlTree, 'BluffDeckPlayedCards');
assert(bluffSurface && /\bPokerTableSurface\b/.test(bluffSurface.attrs.class || ''), '#BluffDeckTableSurface must reuse PokerTableSurface');
assert(bluffCardTable && /\bPokerTableStage\b/.test(bluffCardTable.attrs.class || ''), '#BluffDeckCardTable must reuse PokerTableStage');
assert(bluffFelt, '#BluffDeckCardTable must contain a PokerTableFelt');
assert(bluffSeats && /\bPokerTableSeats\b/.test(bluffSeats.attrs.class || ''), '#BluffDeckTableSeats must reuse PokerTableSeats');
assert(bluffSeats && bluffSeats.parent === bluffCardTable, '#BluffDeckTableSeats must sit under the Bluff table stage');
assert(bluffTargetCard, 'menu layout must expose #BluffDeckTargetCard');
assert(bluffPlayedCards, 'menu layout must expose #BluffDeckPlayedCards');
assert(bluffTargetCard && bluffTargetCard.parent === bluffFelt, '#BluffDeckTargetCard must sit on the table felt');
assert(bluffPlayedCards && bluffPlayedCards.parent === bluffFelt, '#BluffDeckPlayedCards must sit on the table felt');
assert(
  bluffTargetCard && bluffPlayedCards
    && bluffFelt.children.indexOf(bluffTargetCard) < bluffFelt.children.indexOf(bluffPlayedCards),
  '#BluffDeckTargetCard must precede #BluffDeckPlayedCards in the centered card lane',
);
const bluffTargetLabel = findXmlNodeById(menuXmlTree, 'BluffDeckTargetLabel');
const bluffPreviousPlayLabel = findXmlNodeById(menuXmlTree, 'BluffDeckPreviousPlayLabel');
assert(
  bluffTargetLabel && bluffTargetLabel.parent && bluffTargetLabel.parent.parent === bluffFelt,
  '#BluffDeckTargetLabel must remain inside the card lane fallback label group',
);
assert(
  bluffPreviousPlayLabel && bluffPreviousPlayLabel.parent && bluffPreviousPlayLabel.parent.parent === bluffFelt,
  '#BluffDeckPreviousPlayLabel must remain inside the card lane fallback label group',
);
assert(findXmlNodeById(menuXmlTree, 'BluffDeckTurnLabel'), 'menu layout must expose #BluffDeckTurnLabel');
for (let slotIndex = 0; slotIndex < 5; slotIndex += 1) {
  const slot = findXmlNodeById(menuXmlTree, `BluffDeckSlot${slotIndex}`);
  assert(slot && slot.name === 'Button', `#BluffDeckSlot${slotIndex} must remain a Button`);
  assertEqual(
    slot && slot.attrs.onactivate,
    `PokerEscapeMenuSelectBluffSlot( ${slotIndex} )`,
    `#BluffDeckSlot${slotIndex} must preserve its activation handler`,
  );
  assert(xmlDescendant(slot, (node) => node.name === 'Label' && /\bBluffDeckSlotRankGlyph\b/.test(node.attrs.class || '')), `#BluffDeckSlot${slotIndex} must expose a rank glyph child`);
  assert(!xmlDescendant(slot, (node) => node.name === 'Label' && /\[[A-Z]+\]/.test(node.attrs.text || '')), `#BluffDeckSlot${slotIndex} must not expose bracket rank text`);
}
const bluffChallengeButton = findXmlNodeById(menuXmlTree, 'BluffDeckChallengeButton');
assert(bluffChallengeButton && bluffChallengeButton.name === 'Button', '#BluffDeckChallengeButton must remain a Button');
assertEqual(
  bluffChallengeButton && bluffChallengeButton.attrs.onactivate,
  'PokerEscapeMenuBluffChallenge()',
  '#BluffDeckChallengeButton must preserve its activation handler',
);
assert(
  xmlDescendant(bluffChallengeButton, (node) => node.name === 'Label' && node.attrs.text === 'LIE'),
  '#BluffDeckChallengeButton must visibly read LIE',
);
for (const selector of [
  '.BluffDeckCardTable',
  '.BluffDeckTableSeats',
  '.BluffDeckCardTable .PokerTableSeat.SeatTopLeft',
  '.BluffDeckCardTable .PokerTableSeat.SeatTopRight',
  '.BluffDeckCardTable .PokerTableSeat.SeatBottomRight',
  '.BluffDeckCardTable .PokerTableSeat.SeatBottomLeft',
  '.BluffDeckFelt',
  '.BluffDeckTargetCard',
  '.BluffDeckTargetFace',
  '.BluffDeckPlayedCards',
  '.BluffDeckPlayedCard',
  '.BluffDeckPlayedCard.CardBack',
  '.BluffDeckPlayedCard.Revealed',
  '.BluffDeckCardSlots',
  '.BluffDeckCardSlot.Selected',
]) {
  assert(cssBlockContainingSelector(menuStyle, selector), `menu style must define ${selector} for the Bluff card table`);
}
const bluffTableCss = cssLastBlock(menuStyle, '.BluffDeckCardTable');
const bluffFeltCss = cssBlock(menuStyle, '.BluffDeckFelt');
const bluffSeatsCss = cssBlock(menuStyle, '.BluffDeckTableSeats');
assertCssDeclarationMatches('menu style .BluffDeckFelt', bluffFeltCss, 'align', /^center\s+center$/, 'must center Bluff target and committed cards on the felt');
assertCssDeclarationMatches('menu style .BluffDeckTableSeats', bluffSeatsCss, 'ignore-parent-flow', /^true$/, 'must keep Bluff seats outside felt flow');
const bluffWindowCss = cssBlock(menuStyle, '.BluffDeckWindow');
assertCssDeclarationMatches('menu style .BluffDeckWindow', bluffWindowCss, 'align', /^left\s+center$/, 'must center Bluff Deck vertically inside the ESC safe content area');
assertCssDeclarationMatches('menu style .BluffDeckWindow', bluffWindowCss, 'margin-top', /^0px$/, 'must not inherit a top offset');
const bluffWindowWidth = Number.parseFloat(cssDeclarationValue(bluffWindowCss, 'width'));
const bluffWindowLeftInset = Number.parseFloat(cssDeclarationValue(bluffWindowCss, 'margin-left'));
const bluffWindowRightInset = Number.parseFloat(cssDeclarationValue(bluffWindowCss, 'margin-right'));
assert(Number.isFinite(bluffWindowWidth) && bluffWindowWidth <= 55, 'menu style .BluffDeckWindow must leave room for the ESC player-list column');
assert(Number.isFinite(bluffWindowLeftInset) && bluffWindowLeftInset > 0, 'menu style .BluffDeckWindow must retain a nonzero left safe inset');
assert(Number.isFinite(bluffWindowRightInset) && bluffWindowRightInset >= 20, 'menu style .BluffDeckWindow must retain a nonzero right player-list safe inset');
assert(bluffWindowLeftInset + bluffWindowWidth + bluffWindowRightInset <= 100, 'menu style .BluffDeckWindow width and safe insets must fit the viewport');
const bluffStageHeight = Number.parseFloat(cssDeclarationValue(bluffTableCss, 'height'));
const bluffFeltWidth = Number.parseFloat(cssDeclarationValue(bluffFeltCss, 'width'));
const bluffFeltHeight = Number.parseFloat(cssDeclarationValue(bluffFeltCss, 'height'));
const bluffFeltRadius = Number.parseFloat(cssDeclarationValue(bluffFeltCss, 'border-radius'));
assert(bluffFeltWidth === bluffFeltHeight, 'menu style .BluffDeckFelt width and height must be equal for a circle');
assert(bluffFeltRadius >= bluffFeltWidth / 2, 'menu style .BluffDeckFelt border radius must be at least half its diameter');
assert(bluffStageHeight > bluffFeltHeight, 'menu style .BluffDeckCardTable must provide outer seat gutters beyond the circular felt');
const bluffLeftSeatCss = cssBlockContainingSelector(menuStyle, '.BluffDeckCardTable .PokerTableSeat.SeatLeft');
const bluffRightSeatCss = cssBlockContainingSelector(menuStyle, '.BluffDeckCardTable .PokerTableSeat.SeatRight');
assert(Number.parseFloat(cssDeclarationValue(bluffLeftSeatCss, 'margin-left')) > 0, 'menu style Bluff left seat must stay inside its outer gutter');
assert(Number.parseFloat(cssDeclarationValue(bluffRightSeatCss, 'margin-right')) > 0, 'menu style Bluff right seat must stay inside its outer gutter');
const bluffTargetCss = cssBlock(menuStyle, '.BluffDeckTargetCard');
const bluffTargetFaceCss = cssBlockContainingSelector(menuStyle, '.BluffDeckTargetFace');
const bluffOpponentCss = cssLastBlockContainingSelector(menuStyle, '.BluffDeckOpponentList');
const bluffSlotsCss = cssLastBlock(menuStyle, '.BluffDeckCardSlots');
const bluffHandCss = cssLastBlockContainingSelector(menuStyle, '.BluffDeckHandLabel');
const bluffActionControlsCss = cssLastBlock(menuStyle, '.BluffDeckActionControls');
const bluffLifecycleCss = cssLastBlock(menuStyle, '.BluffDeckLifecycleControls');
assertCssDeclarationMatches('menu style .BluffDeckOpponentList', bluffOpponentCss, 'visibility', /^collapse$/, 'must retire the duplicate clipped opponent summary');
assertCssDeclarationMatches('menu style .BluffDeckHandLabel', bluffHandCss, 'visibility', /^collapse$/, 'must retire the duplicate textual hand');
assertCssDeclarationMatches('menu style .BluffDeckCardSlots', bluffSlotsCss, 'width', /^fit-children$/, 'must center the visual picker by intrinsic width');
assertCssDeclarationMatches('menu style .BluffDeckCardSlots', bluffSlotsCss, 'horizontal-align', /^center$/, 'must center the intrinsic visual picker');
assertCssDeclarationMatches('menu style .BluffDeckActionControls', bluffActionControlsCss, 'width', /^fit-children$/, 'must keep the primary action compact');
assertCssDeclarationMatches('menu style .BluffDeckLifecycleControls', bluffLifecycleCss, 'flow-children', /^right$/, 'must place lifecycle control groups inline');
assert(Number.parseFloat(cssDeclarationValue(bluffWindowCss, 'max-height')) <= 90, 'menu style .BluffDeckWindow must fit below the viewport edge');
assert(bluffStageHeight <= 380, 'menu style .BluffDeckCardTable must not consume the controls viewport');
const bluffPlayedCss = cssBlock(menuStyle, '.BluffDeckPlayedCards');
const bluffPlayedCardCss = cssBlock(menuStyle, '.BluffDeckPlayedCard');
const bluffSelectedCss = cssBlockContainingSelector(menuStyle, '.BluffDeckCardSlot.Selected');
assertCssDeclarationMatches('menu style .BluffDeckCardTable', bluffTableCss, 'horizontal-align', /^center$/, 'must center the target/played lane');
assertCssDeclarationMatches('menu style .BluffDeckTargetCard', bluffTargetCss, 'z-index', /^2$/, 'must keep the target face beneath played cards');
assertCssDeclarationMatches('menu style .BluffDeckTargetFace', bluffTargetFaceCss, 'border', /pokerNoirGold/, 'must give the target face a noir rank border');
assertCssDeclarationMatches('menu style .BluffDeckPlayedCards', bluffPlayedCss, 'ignore-parent-flow', /^true$/, 'must overlay played cards without moving the target face');
assertCssDeclarationMatches('menu style .BluffDeckPlayedCards', bluffPlayedCss, 'width', /^200px$/, 'must keep the centered reveal row within the table');
assertCssDeclarationMatches('menu style .BluffDeckPlayedCards', bluffPlayedCss, 'align', /^center\s+center$/, 'must keep concealed and revealed cards over the target center');
assertCssDeclarationMatches('menu style .BluffDeckPlayedCards', bluffPlayedCss, 'z-index', /^[4-9]\d*$/, 'must layer played cards above the target face');
assertCssDeclarationMatches('menu style .BluffDeckPlayedCard', bluffPlayedCardCss, 'ignore-parent-flow', /^true$/, 'must stack every played card in the same centered lane');
for (let tilt = 0; tilt < 7; tilt += 1) {
  assert(cssBlock(menuStyle, `.BluffDeckPlayedCard.BluffDeckStackTilt${tilt}`), `menu style must define stable public-data played-card tilt ${tilt}`);
}
for (const selector of [
  '.BluffDeckPlayedCard.Revealed.BluffDeckRevealCount1.BluffDeckRevealSlot0',
  '.BluffDeckPlayedCard.Revealed.BluffDeckRevealCount2.BluffDeckRevealSlot0',
  '.BluffDeckPlayedCard.Revealed.BluffDeckRevealCount2.BluffDeckRevealSlot1',
  '.BluffDeckPlayedCard.Revealed.BluffDeckRevealCount3.BluffDeckRevealSlot0',
  '.BluffDeckPlayedCard.Revealed.BluffDeckRevealCount3.BluffDeckRevealSlot1',
  '.BluffDeckPlayedCard.Revealed.BluffDeckRevealCount3.BluffDeckRevealSlot2',
]) {
  assert(cssBlock(menuStyle, selector), `menu style must define centered side-by-side reveal slot ${selector}`);
}
assertCssDeclarationMatches('menu style .BluffDeckCardSlot.Selected', bluffSelectedCss, 'pre-transform-scale2d', /^1\.0?6$/, 'must visibly lift selected hand cards');
assertCssDeclarationMatches('menu style .BluffDeckCardSlot.Selected', bluffSelectedCss, 'border', /pokerNoirGold/, 'must clearly border selected hand cards');
const bluffControlButtonCss = cssBlock(menuStyle, '.BluffDeckControlButton');
const bluffDisabledSlotCss = cssBlock(menuStyle, '.BluffDeckCardSlot.Disabled');
const bluffSlotArtCss = cssLastBlockContainingSelector(menuStyle, '.BluffDeckCardSlot .PokerCardArt');
const bluffSlotGlyphCss = cssLastBlock(menuStyle, '.BluffDeckSlotRankGlyph');
assertCssDeclarationMatches('menu style .BluffDeckCardSlot.Disabled', bluffDisabledSlotCss, 'opacity', /^0\.[3-6]\d?$/, 'must visibly mute cards when selection is unavailable');
assertCssDeclarationMatches('menu style .BluffDeckCardSlot.Disabled', bluffDisabledSlotCss, 'saturation', /^0(\.0)?$/, 'must desaturate cards when selection is unavailable');
assertCssDeclarationMatches('menu style .BluffDeckCardSlot .PokerCardArt', bluffSlotArtCss, 'opacity', /^1(\.0)?$/, 'must render card buttons from full-opacity VTex art');
assertCssDeclarationMatches('menu style .BluffDeckSlotRankGlyph', bluffSlotGlyphCss, 'opacity', /^0(\.0)?$/, 'must keep text glyph behind the card artwork');
assert(bluffControlButtonCss, 'menu style must define .BluffDeckControlButton');
const bluffLeftSeatTextCss = cssLastBlockContainingSelector(menuStyle, '.BluffDeckCardTable .PokerTableSeat.SeatLeft .PokerTableSeatText');
const bluffRightSeatTextCss = cssLastBlockContainingSelector(menuStyle, '.BluffDeckCardTable .PokerTableSeat.SeatRight .PokerTableSeatText');
const bluffSeatNameCss = cssLastBlock(menuStyle, '.BluffDeckCardTable .PokerTableSeatName');
assertCssDeclarationMatches('menu style Bluff left seat text', bluffLeftSeatTextCss, 'width', /^130px$/, 'must reserve avatar space instead of overlapping it');
assertCssDeclarationMatches('menu style Bluff left seat text', bluffLeftSeatTextCss, 'margin-right', /^36px$/, 'must leave a fixed gap before the avatar');
assertCssDeclarationMatches('menu style Bluff right seat text', bluffRightSeatTextCss, 'width', /^130px$/, 'must reserve avatar space instead of overlapping it');
assertCssDeclarationMatches('menu style Bluff right seat text', bluffRightSeatTextCss, 'margin-left', /^36px$/, 'must leave a fixed gap after the avatar');
assertCssDeclarationMatches('menu style Bluff seat name', bluffSeatNameCss, 'text-overflow', /^shrink$/, 'must fit long player names inside reserved text width');
assertMatches(
  'menu style .BluffDeckControlButton',
  bluffControlButtonCss,
  /\bwidth\s*:\s*fill-parent-flow\(\s*1(?:\.0)?\s*\)\s*;/,
  'must divide each horizontal Bluff control row without full-width overlap',
);
assertMatches(
  'menu style .BluffDeckControlButton',
  bluffControlButtonCss,
  /\bmin-width\s*:\s*0px\s*;/,
  'must allow Bluff controls to fit their row instead of overflowing adjacent buttons',
);
const bluffActionButtonCss = cssBlockContainingSelector(menuStyle, '.BluffDeckActionButton');
assert(bluffActionButtonCss, 'menu style must define .BluffDeckActionButton');
assertMatches(
  'menu style .BluffDeckActionButton',
  bluffActionButtonCss,
  /\bwidth\s*:\s*fill-parent-flow\(\s*1(?:\.0)?\s*\)\s*;/,
  'must keep action buttons inside their shared row',
);
assertMatches(
  'menu style .BluffDeckActionButton',
  bluffActionButtonCss,
  /\bmin-width\s*:\s*0px\s*;/,
  'must allow action buttons to shrink without owning the row',
);
const bluffActionLabelCss = cssBlockContainingSelector(menuStyle, '.BluffDeckActionButton Label');
assertMatches(
  'menu style .BluffDeckActionButton Label',
  bluffActionLabelCss,
  /\bwhite-space\s*:\s*nowrap\s*;/,
  'must keep Bluff action labels on one line',
);
assertMatches(
  'menu style Bluff action final-child rule',
  menuStyle,
  /\.BluffDeckActionButton:last-child[\s\S]*?margin-right\s*:\s*0px\s*;/,
  'must remove trailing action-row margin from the final action',
);
const lobbyWindowLayout = sourceSliceBetweenIds(menuLayout, 'PokerLobbyWindow', 'PokerTableWindow');
const playersWindowLayout = sourceSliceBetweenIds(menuLayout, 'PokerPlayersWindow', 'PokerHistoryWindow');
const historyWindowLayout = sourceSliceBetweenIds(menuLayout, 'PokerHistoryWindow', 'PokerActionsWindow');
const actionsWindowLayout = sourceSliceFromId(menuLayout, 'PokerActionsWindow');
assertMatches(
  'menu layout #PokerLobbyWindow',
  lobbyWindowLayout,
  /class=["']PokerLobbyBar["'][\s\S]*id=["']PokerPartyControls["'][\s\S]*id=["']PokerProgressControls["'][\s\S]*id=["']PokerResumeControls["'][\s\S]*id=["']PokerReadyChatButton["']/,
  'must keep lobby controls in the top floating lobby window',
);
assertMatches(
  'menu layout #PokerPlayersWindow',
  playersWindowLayout,
  /id=["']PokerSeatsList["'][\s\S]*id=["']PokerPlayersList["'][\s\S]*class=["']PokerPlayerWindowControls["'][\s\S]*id=["']PokerEndMatchButton["'][\s\S]*id=["']PokerLeaveLobbyButton["']/,
  'must keep ready seats, player list, end-match, and leave-lobby controls in the separate players window',
);
assert(
  !/id=["']PokerGameLog["']/.test(playersWindowLayout),
  'menu layout must not keep #PokerGameLog in #PokerPlayersWindow',
);
assertMatches(
  'menu layout #PokerActionsWindow',
  actionsWindowLayout,
  /id=["']PokerActionButtons["'][\s\S]*id=["']PokerStartButton["']/,
  'must keep action/start controls in the separate bottom actions window',
);
assertMatches(
  'menu layout #PokerHistoryWindow',
  historyWindowLayout,
  /id=["']PokerGameLog["']/,
  'must keep the 12-row history log inside the separate right history window',
);
assert(
  !/id=["']PokerEndMatchButton["']/.test(actionsWindowLayout),
  'menu layout must not keep #PokerEndMatchButton in #PokerActionsWindow',
);
assert(
  !/id=["']PokerLeaveLobbyButton["']/.test(actionsWindowLayout),
  'menu layout must not keep #PokerLeaveLobbyButton in #PokerActionsWindow',
);
assert(
  !/id=["']PokerGameLog["']/.test(actionsWindowLayout),
  'menu layout must not keep #PokerGameLog in #PokerActionsWindow',
);
assertIncludes('menu script', menuScript, 'const MAX_GAME_LOG_ENTRIES = 12;', 'must retain the 12-row right-side history cap');
assertIncludes('menu script', menuScript, 'const MAX_TABLE_PLAYERS = 12;', 'must cap poker table players at 12 seats');
assertIncludes('menu script', menuScript, 'exportProgress: makeButtonDecision(!finishedProgressAvailable', 'must hide COPY PROGRESS until a finished match can be exported');

for (const selector of [
  '.PokerFloatingWindow',
  '.PokerLobbyWindow',
  '.PokerTableWindow',
  '.PokerPlayersWindow',
  '.PokerActionsWindow',
  '.PokerHistoryWindow',
  '.PokerFloatingHeader',
  '.PokerLobbyBar',
  '.PokerLobbyMeta',
  '.PokerTableActionButtonsRow',
  '.PokerPlayersWindow .PokerSeatsList',
  '.PokerPlayersWindow .PokerPlayersList',
  '.PokerPlayersWindow .PokerPlayerRow',
  '.PokerPlayersWindow .PokerPlayerName',
  '.PokerPlayersWindow .PokerHoleCards',
  '.PokerPlayersWindow .PokerPlayerState',
  '.PokerPlayerWindowControls',
  '.PokerPlayerWindowControls .PokerSecondaryButton',
  '.PokerHistoryWindow .PokerGameLog',
  '.PokerTableActionButtonsRow #PokerActionButtons',
  '.PokerTableActionButtonsRow #PokerStartButton',
  '.PokerTableFelt',
  '.PokerTableSeats',
  '.PokerTableSeat',
  '.PokerTableSeat.Current',
  '.PokerTableSeatCards',
]) {
  assert(cssBlock(menuStyle, selector), `menu style must define ${selector} for the four floating poker window layout`);
}
for (const [selector, options] of [
  ['.PokerLobbyWindow', { align: /^left\s+top$/, alignDescription: 'the left top layout column', horizontalProperty: 'margin-left', forbiddenHorizontalProperty: 'margin-right' }],
  ['.PokerTableWindow', { align: /^left\s+top$/, alignDescription: 'the left top layout column', horizontalProperty: 'margin-left', forbiddenHorizontalProperty: 'margin-right' }],
  ['.PokerActionsWindow', { align: /^left\s+top$/, alignDescription: 'the visible lower action rail', horizontalProperty: 'margin-left', forbiddenHorizontalProperty: 'margin-right' }],
  ['.PokerPlayersWindow', { align: /^right\s+top$/, alignDescription: 'the right top layout column', horizontalProperty: 'margin-right', forbiddenHorizontalProperty: 'margin-left' }],
  ['.PokerHistoryWindow', { align: /^right\s+top$/, alignDescription: 'the right top history column', horizontalProperty: 'margin-right', forbiddenHorizontalProperty: 'margin-left' }],
]) {
  assertResponsiveWindowPosition(selector, options);
}
for (const selector of ['.PokerLobbyWindow', '.PokerTableWindow', '.PokerActionsWindow']) {
  const block = cssBlock(menuStyle, selector);
  assertCssDeclarationMatches(
    `menu style ${selector}`,
    block,
    'width',
    /^51%$/,
    'must keep the main poker windows inside the reserved right rail',
  );
  assertCssDeclarationMatches(
    `menu style ${selector}`,
    block,
    'margin-left',
    /^22%$/,
    'must keep the main poker window offset clear of the stock ESC menu while moving the windows left',
  );
}
for (const selector of ['.PokerPlayersWindow', '.PokerHistoryWindow']) {
  assertCssDeclarationMatches(
    `menu style ${selector}`,
    cssBlock(menuStyle, selector),
    'width',
    /^20%$/,
    'must reserve enough right rail width for player cards and history',
  );
}
for (const selector of ['.PokerPlayersWindow', '.PokerHistoryWindow']) {
  assertCssDeclarationMatches(
    `menu style ${selector}`,
    cssBlock(menuStyle, selector),
    'margin-right',
    /^3\.25%$/,
    'must move the right rail left with the main poker windows',
  );
}
assertCssDeclarationMatches(
  'menu style .PokerTableWindow',
  cssBlock(menuStyle, '.PokerTableWindow'),
  'margin-top',
  /^23%$/,
  'must lift the poker table away from the action window',
);
const playerHoleCardsBlock = cssBlock(menuStyle, '.PokerPlayersWindow .PokerHoleCards');
assertCssDeclarationMatches(
  'menu style .PokerPlayersWindow .PokerHoleCards',
  playerHoleCardsBlock,
  'width',
  /^96px$/,
  'must fit two compact player cards without truncation',
);
assertCssDeclarationMatches(
  'menu style .PokerPlayersWindow .PokerHoleCards',
  playerHoleCardsBlock,
  'overflow',
  /^noclip$/,
  'must not clip compact player cards during reveal animations',
);
assertCssDeclarationMatches(
  'menu style .PokerActionButtons',
  cssBlock(menuStyle, '.PokerActionButtons'),
  'flow-children',
  /^down$/,
  'must stack the custom amount controls above the visible action button row',
);
assertCssDeclarationMatches(
  'menu style .PokerActionButtonRow',
  cssBlock(menuStyle, '.PokerActionButtonRow'),
  'flow-children',
  /^right$/,
  'must preserve left-to-right action order so FOLD stays at the far right of active choices',
);
const tableWindowBlock = cssBlock(menuStyle, '.PokerTableWindow');
assertCssDeclarationMatches(
  'menu style .PokerTableWindow',
  tableWindowBlock,
  'z-index',
  /^9990$/,
  'must stay below the top lobby/rail/history/action windows',
);
const actionsWindowBlock = cssBlock(menuStyle, '.PokerActionsWindow');
assertCssDeclarationMatches(
  'menu style .PokerActionsWindow',
  actionsWindowBlock,
  'margin-top',
  /^80%$/,
  'must keep action controls in a visible lower rail instead of offscreen',
);
assertCssDeclarationMatches(
  'menu style .PokerActionsWindow',
  actionsWindowBlock,
  'padding',
  /^10px\s+14px$/,
  'must use compact bottom action padding',
);
for (const selector of ['.PokerLobbyWindow', '.PokerPlayersWindow', '.PokerHistoryWindow', '.PokerActionsWindow']) {
  const raisedBlock = cssBlockContainingSelectorDeclaration(menuStyle, selector, 'z-index');
  assertCssDeclarationMatches(
    `menu style ${selector}`,
    raisedBlock,
    'z-index',
    /^10020$/,
    'must render above the lowered table window',
  );
}
const floatingWindowBlock = cssBlock(menuStyle, '.PokerFloatingWindow');
assertCssDeclarationMatches(
  'menu style .PokerFloatingWindow',
  floatingWindowBlock,
  'pre-transform-scale2d',
  /^0\.96$/,
  'must use Panorama-supported pre-transform-scale2d before windows open',
);
assert(
  !/\bscale3d\s*[:(]/i.test(menuStyle),
  'menu style must not use unsupported scale3d transforms for floating poker windows',
);
assert(
  !/\bclip-path\s*:/i.test(menuStyle),
  'menu style must not use unsupported clip-path for floating poker windows',
);
const lobbyWindowBlock = cssBlock(menuStyle, '.PokerLobbyWindow');
const floatingZIndex = Number(cssDeclarationValue(floatingWindowBlock, 'z-index'));
const tableZIndex = Number(cssDeclarationValue(tableWindowBlock, 'z-index'));
const raisedWindowBlock = cssBlockContainingSelectorDeclaration(menuStyle, '.PokerLobbyWindow', 'z-index');
const raisedZIndex = Number(cssDeclarationValue(raisedWindowBlock, 'z-index'));
assert(
  Number.isFinite(floatingZIndex) && Number.isFinite(tableZIndex) && Number.isFinite(raisedZIndex) && tableZIndex < floatingZIndex && floatingZIndex < raisedZIndex,
  `menu style z-index order must keep the table (${tableZIndex}) below base floating windows (${floatingZIndex}) and open lobby windows (${raisedZIndex})`,
);
assertCssDeclarationMatches(
  'menu style .PokerLobbyWindow',
  lobbyWindowBlock,
  'margin-top',
  /^4%$/,
  'must keep the minimized top lobby bar near the top of the screen',
);
const minimizedLobbyLabelBlock = cssBlockContainingSelector(menuStyle, '.PokerLobbyWindow .PokerPartyStatusLabel');
assertCssDeclarationMatches(
  'menu style minimized lobby labels',
  minimizedLobbyLabelBlock,
  'height',
  /^0px$/,
  'must collapse verbose lobby metadata labels',
);
assertCssDeclarationMatches(
  'menu style minimized lobby labels',
  minimizedLobbyLabelBlock,
  'visibility',
  /^collapse$/,
  'must hide verbose lobby metadata labels',
);
assertCssDeclarationMatches(
  'menu style .PokerLobbyWindow .PokerAnitaTitle',
  cssBlock(menuStyle, '.PokerLobbyWindow .PokerAnitaTitle'),
  'font-size',
  /^20px$/,
  'must keep the lobby title reduced for the minimized top bar',
);
assertCssDeclarationMatches(
  'menu style .PokerLobbyWindow .PokerProgressCodeInput',
  cssBlock(menuStyle, '.PokerLobbyWindow .PokerProgressCodeInput'),
  'height',
  /^34px$/,
  'must keep the progress input reduced for the minimized top bar',
);
assertCssDeclarationMatches(
  'menu style .PokerLobbyWindow .PokerLobbyBar',
  cssBlock(menuStyle, '.PokerLobbyWindow .PokerLobbyBar'),
  'margin-top',
  /^5px$/,
  'must keep compact spacing in the minimized top lobby bar',
);
const playersWindowBlock = cssBlock(menuStyle, '.PokerPlayersWindow');
assertCssDeclarationMatches(
  'menu style .PokerPlayersWindow',
  playersWindowBlock,
  'margin-top',
  /^7%$/,
  'must keep the right player rail near the top at 7%',
);
assertMatches(
  'menu layout #PokerPlayersWindow ready summary',
  playersWindowLayout,
  /class=["']PokerReadySummary["'][\s\S]*text=["']MAX SEATS["'][\s\S]*id=["']PokerReadyCountLabel["'][^>]*text=["']12["']/,
  'must label the rail summary as MAX SEATS with the 12-seat cap',
);
const playersWindowSeatsBlock = cssBlock(menuStyle, '.PokerPlayersWindow .PokerSeatsList');
for (const [property, pattern] of [
  ['height', /^0px$/],
  ['min-height', /^0px$/],
  ['max-height', /^0px$/],
  ['margin-bottom', /^0px$/],
  ['padding', /^0px$/],
  ['visibility', /^collapse$/],
]) {
  assertCssDeclarationMatches(
    'menu style .PokerPlayersWindow .PokerSeatsList',
    playersWindowSeatsBlock,
    property,
    pattern,
    'must visually collapse the ready-seat list in the right player rail',
  );
}
const playersWindowListBlock = cssBlock(menuStyle, '.PokerPlayersWindow .PokerPlayersList');
assertCssDeclarationMatches(
  'menu style .PokerPlayersWindow .PokerPlayersList',
  playersWindowListBlock,
  'overflow',
  /\bscroll\b/,
  'must scroll the right player list once the compact visible rows are full',
);
const playersWindowRowBlock = cssBlock(menuStyle, '.PokerPlayersWindow .PokerPlayerRow');
assertCssDeclarationMatches(
  'menu style .PokerPlayersWindow .PokerPlayerRow',
  playersWindowRowBlock,
  'min-height',
  /^48px$/,
  'must use compact right-panel player rows',
);
assertCssDeclarationMatches(
  'menu style .PokerPlayersWindow .PokerPlayerRow',
  playersWindowRowBlock,
  'margin-bottom',
  /^4px$/,
  'must use compact right-panel player row spacing',
);
assertCssDeclarationMatches(
  'menu style .PokerPlayersWindow .PokerPlayerRow',
  playersWindowRowBlock,
  'padding',
  /^5px\s+7px$/,
  'must use compact right-panel player row padding',
);
const playersWindowListMaxHeight = cssPxValue(playersWindowListBlock, 'max-height');
const playersWindowRowHeight = cssPxValue(playersWindowRowBlock, 'min-height');
const playersWindowRowMargin = cssPxValue(playersWindowRowBlock, 'margin-bottom');
const compactRowFootprint = playersWindowRowHeight + playersWindowRowMargin;
assert(
  playersWindowListMaxHeight >= compactRowFootprint * 6,
  `menu style .PokerPlayersWindow .PokerPlayersList must fit six compact rows before scrolling: max-height ${playersWindowListMaxHeight || '<missing>'}px, row footprint ${compactRowFootprint || '<missing>'}px`,
);
assert(
  playersWindowListMaxHeight < compactRowFootprint * 12,
  `menu style .PokerPlayersWindow .PokerPlayersList must rely on scrolling for 7-12 players instead of requiring all 12 rows visible: max-height ${playersWindowListMaxHeight || '<missing>'}px, row footprint ${compactRowFootprint || '<missing>'}px`,
);
for (const selector of [
  '.PokerMenuVisible #PokerLobbyWindow',
  '.PokerLobbyWindow.Open',
  '.PokerMenuVisible #PokerTableWindow',
  '.PokerTableWindow.Open',
  '.PokerMenuVisible #PokerPlayersWindow',
  '.PokerPlayersWindow.Open',
  '.PokerMenuVisible #PokerActionsWindow',
  '.PokerActionsWindow.Open',
  '.PokerMenuVisible #PokerHistoryWindow',
  '.PokerHistoryWindow.Open',
]) {
  const openBlock = cssBlockContainingSelector(menuStyle, selector);
  assert(openBlock, `menu style must define ${selector} visibility for the four floating poker windows`);
  assertMatches(
    `menu style ${selector}`,
    openBlock,
    /\bvisibility\s*:\s*visible\s*;/,
    'must make each floating poker window visible while the poker menu is open',
  );
  assertMatches(
    `menu style ${selector}`,
    openBlock,
    /\bopacity\s*:\s*1\s*;/,
    'must make each floating poker window opaque while the poker menu is open',
  );
}

for (const id of [
  'PokerLobbyWindow',
  'PokerTableWindow',
  'PokerPlayersWindow',
  'PokerHistoryWindow',
  'PokerActionsWindow',
]) {
  const selector = `.PokerMenuVisible #${id}.PokerHidden`;
  const hiddenOverride = cssBlockContainingSelector(menuStyle, selector);
  assert(hiddenOverride, `menu style must explicitly collapse ${selector} while the game picker is active`);
  assertMatches(
    `menu style ${selector}`,
    hiddenOverride,
    /\bvisibility\s*:\s*collapse\s*;/,
    'must override the root menu-visible rule until Poker is selected',
  );
  assertMatches(
    `menu style ${selector}`,
    hiddenOverride,
    /\bopacity\s*:\s*0\s*;/,
    'must keep the unselected Poker surface transparent',
  );
}

const pokerCardVtexArtCss = cssBlock(menuStyle, '.PokerCardVtexArt');
assert(pokerCardVtexArtCss, 'menu style must define .PokerCardVtexArt for visible card image art');
assertMatches(
  'menu style .PokerCardVtexArt',
  pokerCardVtexArtCss,
  /\bwash-color\s*:\s*[^;]+;/,
  'must define the card image wash-color tint',
);
assert(
  !/\bopacity\s*:\s*0(?:\.0+)?\s*;/.test(pokerCardVtexArtCss),
  'menu style .PokerCardVtexArt must remain visible and not set opacity to 0',
);

const redSuitVtexArtCss = cssBlock(menuStyle, '.PokerCard.RedSuit .PokerCardVtexArt');
assert(redSuitVtexArtCss, 'menu style must define .PokerCard.RedSuit .PokerCardVtexArt for red card image tinting');
assertMatches(
  'menu style .PokerCard.RedSuit .PokerCardVtexArt',
  redSuitVtexArtCss,
  /\bwash-color\s*:\s*[^;]+;/,
  'must override wash-color for red suit card images',
);



assertMatches(
  'script',
  script,
  /^\s*(?:\(\(\)\s*=>\s*\{|\(function\s*\(\)\s*\{)\s*["']use strict["'];/,
  'must start as an IIFE whose first statement is strict mode',
);
assertMatches('script', script, /\}\)\(\);\s*$/, 'must close and invoke its IIFE');

for (const token of [
  '$.Schedule',
  '$.Msg',
  'ChatMessages',
  'SenderName',
  'MessageContents',
  '[PokerDebug]',
]) {
  assertIncludes('script', script, token, 'missing first-step chat debug token');
}

for (const token of [
  'function isPartyLeaderMessage',
  'function isPartyJoinMessage',
  'function isPartyLeaveMessage',
  'function isResumeLeaderMessage',
  'function isResumeReadyMessage',
  'function isResumeStartMessage',
  'function isShortResumeStartMessage',
  'function isProgressOfferMessage',
  'function isProgressChunkMessage',
  'function isPartyAuthorityMessage',
  'function isResumeAuthorityMessage',
]) {
  assert(!script.includes(token), `chat debug must not keep deleted shallow predicate wrapper ${token}`);
}

assertMatches('script', script, /\$\.Msg[\s\S]*record\.sender[\s\S]*record\.message/, 'must log sender and message content through $.Msg');
const commandFamiliesStart = script.indexOf('const COMMAND_FAMILIES = [');
const commandFamiliesEnd = script.indexOf('];', commandFamiliesStart);
const commandFamiliesBlock = commandFamiliesStart >= 0 && commandFamiliesEnd > commandFamiliesStart
  ? script.slice(commandFamiliesStart, commandFamiliesEnd)
  : '';
assert(commandFamiliesBlock, 'chat bridge must expose one COMMAND_FAMILIES topology table');
for (const metadata of [
  { name: 'bd1-start', delay: 'always', wire: 's' },
  { name: 'bd1-play', delay: 'none', wire: 'p' },
  { name: 'bd1-challenge', delay: 'none', wire: 'c' },
  { name: 'bd1-end', delay: 'always', wire: 'e' },
]) {
  const metadataPattern = new RegExp(
    `\\{\\s*name:\\s*"${metadata.name}"\\s*,\\s*family:\\s*"bluff-deck"\\s*,\\s*authority:\\s*"bluff-deck"\\s*,\\s*unknownSenderDelay:\\s*"${metadata.delay}"\\s*,\\s*prefix:\\s*"bd1 ${metadata.wire} "\\s*\\}`,
  );
  assertEqual(
    (commandFamiliesBlock.match(metadataPattern) || []).length,
    1,
    `COMMAND_FAMILIES must contain exactly one direct ${metadata.name} metadata entry`,
  );
}
assertEqual(
  (commandFamiliesBlock.match(/\bname:\s*"bd1-(?:start|play|challenge|end)"/g) || []).length,
  4,
  'COMMAND_FAMILIES must contain exactly four direct bd1 metadata entries',
);
const scopedLeaveRegex = /^\[party leave\]\s+poker party\s+\S+\s+bd1\s+[0-9a-f]{8}\s+[1-9]\d*$/i;
const scopedLeaveSource = String.raw`const BLUFF_SCOPED_LEAVE_RE = /^\[party leave\]\s+poker party\s+\S+\s+bd1\s+[0-9a-f]{8}\s+[1-9]\d*$/i;`;
assertIncludes(
  'chat bridge script',
  script,
  scopedLeaveSource,
  `must define the strict scoped Bluff leave classifier ${scopedLeaveRegex}`,
);
const scopedLeaveClassifierIndex = script.indexOf('if (BLUFF_SCOPED_LEAVE_RE.test(raw)) return BLUFF_LEAVE_FAMILY;');
const genericFamilyLoopIndex = script.indexOf('for (let i = 0; i < COMMAND_FAMILIES.length', scopedLeaveClassifierIndex);
assert(
  scopedLeaveClassifierIndex >= 0 && genericFamilyLoopIndex > scopedLeaveClassifierIndex,
  'scoped Bluff leave classification must precede generic COMMAND_FAMILIES prefix matching',
);
assertEqual(
  (script.match(/function\s+scanChatMessages\s*\(\)/g) || []).length,
  1,
  'chat bridge must keep exactly one recurring scan function',
);
assertEqual(
  (script.match(/\$\.Schedule\([^;\n]*\bscanChatMessages\b[^;\n]*\);/g) || []).length,
  1,
  'chat bridge must keep exactly one recurring scanner schedule',
);

const bridgeRuntime = createChatBridgeRuntime();
const bridgeHooks = bridgeRuntime.hooks;
if (bridgeHooks) {
  const unknownResumeStart = 'poker resume r2pzo6p hand 2 leader jdbeast seed smr8kezvr';
  harness.appendChatPanel(bridgeRuntime, '<unknown>', 'TEAM', unknownResumeStart, false);
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    bridgeHooks.modules.ChatBridgeIntake.scanOnce();
    assert(
      !(bridgeRuntime.config.PokerChatMessages || []).some((entry) => entry.message === unknownResumeStart),
      `unknown short resume-start should delay while sender can still resolve (attempt ${attempt})`,
    );
  }
  bridgeHooks.modules.ChatBridgeIntake.scanOnce();
  assert(
    (bridgeRuntime.config.PokerChatMessages || []).some((entry) => entry.sender === '<unknown>' && entry.message === unknownResumeStart),
    'unknown short resume-start should be released after the retry cap so the menu reducer can resolve hosted authority',
  );
  assert(
    bridgeRuntime.config.PokerChatMessages &&
      bridgeRuntime.config.PokerChatMessages.some((entry) => entry.sender === '<unknown>' && entry.message === unknownResumeStart),
    'unknown short resume-start released after the retry cap should be appended to bridge chat history',
  );
  assert(
    bridgeRuntime.logs.some((line) => line.includes('<unknown>') && line.includes(unknownResumeStart)),
    'unknown short resume-start released after the retry cap should remain loggable with its unresolved sender',
  );

  for (const authorityMessage of [
    '[resume leader] poker resume r2pzo6p',
    '[resume ready] poker resume r2pzo6p',
  ]) {
    const authorityRuntime = createChatBridgeRuntime();
    const authorityHooks = authorityRuntime.hooks;
    harness.appendChatPanel(authorityRuntime, '<unknown>', 'TEAM', authorityMessage, false);
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      authorityHooks.modules.ChatBridgeIntake.scanOnce();
      assert(
        !(authorityRuntime.config.PokerChatMessages || []).some((entry) => entry.message === authorityMessage),
        `unknown ${authorityMessage} authority row should stay delayed instead of granting authority (attempt ${attempt})`,
      );
    }
    assert(
      !(authorityRuntime.config.PokerChatMessages || []).some((entry) => entry.message === authorityMessage),
      `unknown ${authorityMessage} authority row should not be appended to bridge chat history while unresolved`,
    );
  }
} else {
  assert(false, 'chat bridge should expose ChatBridgeIntake through test hooks for unknown-sender retry coverage');
}

assert(
  !script.includes('RegisterEventHandler'),
  'script must poll ChatMessages, not register invented chat panel handlers',
);
const allowedBridgeRegistration = /RegisterForUnhandledEvent\(CLIENT_OUTPUT_EVENT,\s*handleClientOutput\)/g;
const allowedBridgeRegistrations = script.match(allowedBridgeRegistration) || [];
assert(
  allowedBridgeRegistrations.length === 1,
  'script must register exactly one ClientUI_FireOutput bridge request handler',
);
const scriptWithoutAllowedBridge = script.replace(
  allowedBridgeRegistration,
  '',
);
assert(
  !scriptWithoutAllowedBridge.includes('RegisterForUnhandledEvent'),
  'script may only register the ClientUI_FireOutput bridge request handler',
);


for (const bridgeSource of [script, menuScript]) {
  for (const literal of [
    'ClientUI_FireOutput',
    'PokerReadySeatsChanged',
    'PokerReadySeatsRequest',
    'PokerReadySeatsClearRequest',
    'PokerChatMessage',
    'PokerChatSnapshotRequest',
    'PokerReadySeats',
    'PokerReadyRevision',
    'PokerChatMessages',
    'PokerChatSequence',
    'PokerLastReadyEvent',
    'PokerLocalPlayerKey',
    'PokerLocalPlayerName',
    'PokerPendingSelfAction',
    'PokerPartyState',
    'PokerProgressState',
  ]) {
    assertIncludes('bridge contract', bridgeSource, literal, 'must carry BridgeContract literal');
  }
  assertIncludes('bridge contract', bridgeSource, 'const BridgeContract = {', 'must define the local bridge contract module');
}

for (const selector of [
  '.PokerPrimaryButton.Disabled',
  '.PokerSecondaryButton.Disabled',
  '.PokerStartButton.Disabled',
  '.PokerActionButton.Disabled',
  '.PokerActionButton.ReadOnly',
]) {
  assert(cssBlock(menuStyle, selector), `menu style must define ${selector}`);
}

assertIncludes('menu script', menuScript, 's2r://panorama/images/poker/chips/', 'must render pot chip art through compiled chip VTEX assets');
assertIncludes('menu script', menuScript, 'createPanel("Image", panel, "", "PokerPotChipImage")', 'must render pot chip art as Image panels');
assert(!menuScript.includes('PokerPotChipDenomination'), 'menu script must not keep generated text-denomination chip rendering');
assert(!menuStyle.includes('PokerPotChipDenomination'), 'menu style must not keep generated text-denomination chip rendering');
assert(!menuStyle.includes('rgba(240, 215, 138, 0.22)'), 'menu style must remove the old yellow pot-center border');
assertIncludes('menu style', menuStyle, "@keyframes 'PokerCardFlipReveal'", 'must define Panorama-compatible quoted card flip reveal keyframes');
assertIncludes('menu style', menuStyle, "@keyframes 'PokerCardFlipToBack'", 'must define Panorama-compatible quoted card flip-to-back keyframes');
assert(!/@keyframes\s+PokerCardFlip/.test(menuStyle), 'menu style must quote PokerCard keyframe names for Panorama');
assert(
  !/@keyframes\s+['"]?PokerTurnArrow/.test(menuStyle),
  'menu style must not define PokerTurnArrow* keyframes; the table turn arrow must remain statically positioned',
);
assertMatches(
  'menu style',
  menuStyle,
  /@keyframes\s+'PokerPotWinner(?:Pulse|Shake)'/,
  'must define Panorama-compatible quoted pot-winner pulse/shake keyframes',
);
assert(
  !/@keyframes\s+Poker(?:TurnArrow|PotWinner)/.test(menuStyle),
  'menu style must quote Poker pot-winner keyframe names and must not define unquoted turn-arrow keyframes',
);
const tableTurnArrowBlock = cssBlock(menuStyle, '.PokerTableTurnArrow');
assert(tableTurnArrowBlock, 'menu style must define .PokerTableTurnArrow for the table-level current-turn indicator');
for (const { selector, block } of cssSelectorBlocks(menuStyle)) {
  if (selector === '.PokerTableTurnArrow' || selector.startsWith('.PokerTableTurnArrow.')) {
    const animationDeclaration = block.match(/\banimation(?:-[a-z-]+)?\s*:\s*([^;{}]+);/);
    assert(
      !animationDeclaration,
      `menu style ${selector} must keep the table turn arrow static without animation declarations: ${animationDeclaration ? animationDeclaration[0] : '<none>'}`,
    );
  }
}
for (const [selector, expectedX, expectedY, transformPattern, direction] of [
  ['.PokerTableTurnArrow.SeatLeft', /^-195px$/, /^0px$/, /rotateY\(180deg\)/, 'left-facing'],
  ['.PokerTableTurnArrow.SeatRight', /^195px$/, /^0px$/, /rotateZ\(0deg\)/, 'right-facing'],
  ['.PokerTableTurnArrow.SeatTopCenter', /^0px$/, /^-195px$/, /rotateZ\(270deg\)/, 'top-facing'],
  ['.PokerTableTurnArrow.SeatBottomCenter', /^0px$/, /^195px$/, /rotateZ\(90deg\)/, 'bottom-facing'],
]) {
  const arrowPositionBlock = cssBlockContainingSelector(menuStyle, selector);
  assert(arrowPositionBlock, `menu style must define ${selector} for the static ${direction} turn arrow position`);
  assertCssDeclarationMatches(
    `menu style ${selector}`,
    arrowPositionBlock,
    'x',
    expectedX,
    `must preserve the static ${direction} turn arrow x offset`,
  );
  assertCssDeclarationMatches(
    `menu style ${selector}`,
    arrowPositionBlock,
    'y',
    expectedY,
    `must preserve the static ${direction} turn arrow y offset`,
  );
  assertCssDeclarationMatches(
    `menu style ${selector}`,
    arrowPositionBlock,
    'transform',
    transformPattern,
    `must preserve the static ${direction} arrow orientation`,
  );
}
for (const selector of [
  '.PokerTableSeat.PotWinner .PokerTableSeatName',
  '.PokerPlayerRow.PotWinner .PokerPlayerName',
  '.PokerAnnouncerOverlay.PotWinner',
]) {
  assertCssDeclarationMatches(
    `menu style ${selector}`,
    cssBlockContainingSelectorDeclaration(menuStyle, selector, 'animation-name'),
    'animation-name',
    /^PokerPotWinner/,
    'must attach the pot-winner pulse/shake keyframes to visible winner feedback',
  );
}
const cardFlipRevealBlock = cssBlockContainingSelectorDeclaration(menuStyle, '.PokerCardFlipLayer.FlipReveal', 'animation-name');
const cardFlipToBackBlock = cssBlockContainingSelectorDeclaration(menuStyle, '.PokerCardFlipLayer.FlipToBack', 'animation-name');
const cardFlipDurationBlock = cssBlockContainingSelectorDeclaration(menuStyle, '.PokerCardFlipLayer.FlipReveal', 'animation-duration');
const pokerCardBackBlock = cssBlock(menuStyle, '.PokerCard.CardBack');
const pokerCardBackBackgroundColor = cssDeclarationValue(pokerCardBackBlock, 'background-color');
assert(
  !pokerCardBackBackgroundColor || !cssValueContainsDarkColor(pokerCardBackBackgroundColor),
  'menu style .PokerCard.CardBack must not set a dark background-color; hidden/unknown cards should use the base light question face',
);
const pokerCardBackLabelBlock = cssBlock(menuStyle, '.PokerCard.CardBack Label');
assert(
  !/\bopacity\s*:\s*0(?:\.0+)?\s*;/.test(pokerCardBackLabelBlock),
  'menu style .PokerCard.CardBack Label must not set opacity:0; unknown-card question labels must remain visible',
);
const pokerCardFlipActiveBlock = cssBlock(menuStyle, '.PokerCard.FlipActive');
assert(
  pokerCardFlipActiveBlock,
  'menu style must define .PokerCard.FlipActive to hide the base card shell while flip layers animate',
);
const flipActiveBackground = cssFirstDeclarationValue(pokerCardFlipActiveBlock, ['background-color', 'background']);
assert(
  cssValuePaintIsTransparent(flipActiveBackground),
  `menu style .PokerCard.FlipActive must make the base card shell background transparent during flip animation: ${flipActiveBackground || '<missing>'}`,
);
const flipActiveBorder = cssFirstDeclarationValue(pokerCardFlipActiveBlock, ['border', 'border-color']);
assert(
  cssValueRemovesVisiblePaint(flipActiveBorder),
  `menu style .PokerCard.FlipActive must remove or transparentize the base card shell border during flip animation: ${flipActiveBorder || '<missing>'}`,
);
const flipActiveBoxShadow = cssDeclarationValue(pokerCardFlipActiveBlock, 'box-shadow');
assert(
  cssValueRemovesVisiblePaint(flipActiveBoxShadow),
  `menu style .PokerCard.FlipActive must remove or transparentize the base card shell shadow during flip animation: ${flipActiveBoxShadow || '<missing>'}`,
);
const pokerCardBlock = cssBlock(menuStyle, '.PokerCard');
const pokerCardBackground = cssFirstDeclarationValue(pokerCardBlock, ['background-color', 'background']);
assert(
  cssValuePaintIsTransparent(pokerCardBackground),
  `menu style .PokerCard must keep the base card shell transparent; visible shell belongs to PokerCardContents/FlipLayer: ${pokerCardBackground || '<missing>'}`,
);
assertSharedCssDeclaration('menu style card flip shell', menuStyle, '.PokerCardContents', '.PokerCardFlipLayer', 'background-color', /.+/, 'must share the same card shell background');
assertSharedCssDeclaration('menu style card flip shell', menuStyle, '.PokerCardContents', '.PokerCardFlipLayer', 'border-radius', /^\d+(?:\.\d+)?px$/, 'must share the same rounded card shell geometry');
assertSharedCssDeclaration('menu style card flip shell', menuStyle, '.PokerCardContents', '.PokerCardFlipLayer', 'border', /.+/, 'must share the same card shell border');
assertSharedCssDeclaration('menu style card flip shell', menuStyle, '.PokerCardContents', '.PokerCardFlipLayer', 'box-shadow', /.+/, 'must share the same card shell shadow');
assert(cardFlipRevealBlock, 'menu style must animate transient reveal layers');
assert(cardFlipToBackBlock, 'menu style must animate transient face-to-back layers');
assertCssDeclarationMatches('card flip reveal', cardFlipRevealBlock, 'animation-name', /^PokerCardFlipReveal$/, 'must use the flip reveal keyframes');
assertCssDeclarationMatches('card flip to back', cardFlipToBackBlock, 'animation-name', /^PokerCardFlipToBack$/, 'must use the flip-to-back keyframes');
assertCssDeclarationMatches('card flip layer', cardFlipDurationBlock, 'animation-duration', /^1\.2s$/, 'must keep the requested 1.2s duration');
const cardFlipLayerRedLabelBlock = cssBlockContainingSelectorDeclaration(menuStyle, '.PokerCard .PokerCardFlipLayer.RedSuit Label', 'color');
const cardStableRedLabelBlock = cssBlockContainingSelectorDeclaration(menuStyle, '.PokerCardContents.RedSuit Label', 'color');
const cardFlipLayerRedArtBlock = cssBlockContainingSelectorDeclaration(menuStyle, '.PokerCard .PokerCardFlipLayer.RedSuit .PokerCardVtexArt', 'wash-color');
assertCssDeclarationMatches('card flip layer red label', cardFlipLayerRedLabelBlock, 'color', /^#b83f47$/, 'must render red reveal card labels red from the first animation frame');
assertCssDeclarationMatches('stable card red label', cardStableRedLabelBlock, 'color', /^#b83f47$/, 'must render stable red card labels without waiting for parent color state');
assertCssDeclarationMatches('card flip layer red art', cardFlipLayerRedArtBlock, 'wash-color', /^#b83f47$/, 'must wash red reveal card art from the first animation frame');
const cardContentsFlipHiddenBlock = cssBlockContainingSelector(menuStyle, '.PokerCardContents.FlipHidden');
assert(
  cardContentsFlipHiddenBlock,
  'menu style must keep .PokerCardContents.FlipHidden as the stable-content-only flip hiding selector',
);
const cardContentsHiddenBlock = cardContentsFlipHiddenBlock ||
  cssBlockContainingSelector(menuStyle, '.PokerCard.FlipActive .PokerCardContents') ||
  cssBlockContainingSelector(menuStyle, '.PokerCard.FlipActive > .PokerCardContents');
assert(
  cardContentsHiddenBlock,
  'menu style must define .PokerCardContents.FlipHidden or a FlipActive-scoped PokerCardContents equivalent to hide stable card contents during flip animation',
);
assertMatches(
  'menu style stable card hidden contents',
  cardContentsHiddenBlock,
  /\b(?:opacity\s*:\s*0(?:\.0+)?\s*;|visibility\s*:\s*(?:collapse|invisible)\s*;)/,
  'must hide only the stable card contents while transient flip layers animate',
);
assertSharedCssDeclaration('menu style card flip geometry', menuStyle, '.PokerCardContents', '.PokerCardFlipLayer', 'ignore-parent-flow', /^true$/, 'must leave both stable contents and flip layers out of parent flow');
assertSharedCssDeclaration('menu style card flip geometry', menuStyle, '.PokerCardContents', '.PokerCardFlipLayer', 'width', /^100%$/, 'must fill the same card width');
assertSharedCssDeclaration('menu style card flip geometry', menuStyle, '.PokerCardContents', '.PokerCardFlipLayer', 'height', /^100%$/, 'must fill the same card height');
assertSharedCssDeclaration('menu style card flip geometry', menuStyle, '.PokerCardContents', '.PokerCardFlipLayer', 'padding', /^\d+(?:\.\d+)?px$/, 'must use the same inset around card content');
assertSharedCssDeclaration('menu style card flip geometry', menuStyle, '.PokerCardContents', '.PokerCardFlipLayer', 'border-radius', /^\d+(?:\.\d+)?px$/, 'must use the same rounded card geometry');
assertSharedCssDeclaration('menu style small card flip geometry', menuStyle, '.PokerCard.Small .PokerCardContents', '.PokerCard.Small .PokerCardFlipLayer', 'padding', /^\d+(?:\.\d+)?px$/, 'must keep small-card stable contents and flip layers aligned');
assertEqual(
  (menuScript.match(/function\s+applyChatRecord\s*\(/g) || []).length,
  1,
  'menu runtime must keep exactly one chat prefix router',
);
const chatRouterMatch = /function\s+applyChatRecord\s*\(\s*record\s*\)\s*\{([\s\S]*?)\n\s*\}/.exec(menuScript);
const chatRouterBody = chatRouterMatch ? chatRouterMatch[1] : '';
assert(chatRouterBody, 'menu runtime must expose the applyChatRecord prefix router body');
assertMatches(
  'menu chat prefix router',
  chatRouterBody,
  /message\.slice\(\s*0\s*,\s*4\s*\)\.toLowerCase\(\)\s*===\s*["']bd1\s["']/,
  'must recognize the bd1 prefix before dispatching to BluffDeckCommandReducer',
);
const bluffRouteOffset = chatRouterBody.indexOf('BluffDeckCommandReducer.applyRecord(record)');
const pokerDecodeOffset = chatRouterBody.indexOf('decodePokerCommand(record)');
assert(
  bluffRouteOffset >= 0 && pokerDecodeOffset > bluffRouteOffset,
  'menu chat prefix router must route bd1 records before Poker decode',
);
assertEqual(
  (chatRouterBody.match(/BluffDeckCommandReducer\.applyRecord\(record\)/g) || []).length,
  1,
  'menu chat prefix router must have one Bluff Deck branch',
);
for (const moduleName of ['CommandReducer', 'PokerEngine', 'ProgressResume', 'TableRenderer', 'TableSeatRenderer', 'BluffDeckSeatProjection', 'ViewModel', 'PokerMetrics', 'RenderScheduler', 'PanelCache', 'PartyReducer', 'BluffDeckControlState']) {
  assertIncludes('menu script', menuScript, `const ${moduleName}`, `must define ${moduleName} module seam`);
}
assertMatches('menu script', menuScript, /render:\s*\(parent,\s*rows,\s*arrowClass\)\s*=>/, 'shared seat renderer must accept parent, projected rows, and optional turn arrow');
const bluffSeatProjectionStart = menuScript.indexOf('function projectBluffTableSeats');
const bluffSeatProjectionEnd = menuScript.indexOf('function renderBluffDeck', bluffSeatProjectionStart);
const bluffSeatProjectionBlock = bluffSeatProjectionStart >= 0 && bluffSeatProjectionEnd > bluffSeatProjectionStart
  ? menuScript.slice(bluffSeatProjectionStart, bluffSeatProjectionEnd)
  : '';
assert(bluffSeatProjectionBlock, 'menu script must expose the Bluff shared-seat adapter');
assertIncludes('Bluff shared-seat adapter', bluffSeatProjectionBlock, 'cardMode: publicActor ? "public-count" : "none"', 'Bluff seats must choose an explicit anonymous card mode');
assertIncludes('Bluff shared-seat adapter', bluffSeatProjectionBlock, 'publicCardCount: publicCount', 'Bluff seats must project only the public committed card count');
assert(!bluffSeatProjectionBlock.includes('player.hand'), 'Bluff shared-seat adapter must not pass private hand ranks');
assertIncludes('TableSeatRenderer', menuScript, 'mode === "none"', 'shared seat renderer must support card-free Bluff seats');
assertIncludes('TableSeatRenderer', menuScript, 'mode === "hole-cards"', 'shared seat renderer must preserve Poker hole-card mode');
assertIncludes('TableSeatRenderer', menuScript, 'mode === "public-count"', 'shared seat renderer must support public committed count backs');
assertMatches('Poker table adapter', menuScript, /cardMode:\s*["']hole-cards["']/, 'Poker table seats must retain hole-card mode');
const tableRendererStart = menuScript.indexOf('const TableRenderer = {');
const tableRendererEnd = menuScript.indexOf('};', tableRendererStart);
const tableRendererBlock = tableRendererStart >= 0 && tableRendererEnd > tableRendererStart
  ? menuScript.slice(tableRendererStart, tableRendererEnd)
  : '';
assert(tableRendererBlock, 'menu script must expose TableRenderer source object');
assertIncludes('TableRenderer source object', tableRendererBlock, 'render: render', 'must expose the unified render method');
assertIncludes('TableRenderer source object', tableRendererBlock, 'invalidate: invalidateRenderer', 'must expose the child-cache invalidation method');
for (const removedRendererExport of ['renderGame:', 'renderCommunity:', 'renderPlayers:', 'renderTableSeats:', 'renderActions:', 'renderLog:']) {
  assert(!tableRendererBlock.includes(removedRendererExport), `TableRenderer must remove legacy renderer export: ${removedRendererExport}`);
}
assertIncludes('menu script', menuScript, 'const RowSpecs = {', 'must keep row surface behavior in private declarative specifications');
assertIncludes('menu script', menuScript, 'update: function (cache, parent, models, spec)', 'must reconcile keyed rows through the spec-based API');
assert(!menuScript.includes('update: function (cache, parent, models, createRow, updateRow, deleteRow)'), 'menu script must remove the six-argument row adapter API');
for (const removedRowAdapter of [
  'function createSeatRow', 'function updateSeatRow', 'function deleteSeatRow',
  'function createCommunityCardRow', 'function updateCommunityCardRow', 'function deleteCommunityCardRow',
  'function createPotChipRow', 'function updatePotChipRow', 'function deletePotChipRow',
  'function createPlayerRow', 'function updatePlayerRow', 'function deletePlayerRow',
  'function createTableSeatRow', 'function updateTableSeatRow', 'function deleteTableSeatRow',
  'function createActionButtonRow', 'function updateActionButtonRow', 'function deleteActionButtonRow',
  'function createLogRow', 'function updateLogRow', 'function deleteLogRow',
]) {
  assert(!menuScript.includes(removedRowAdapter), `menu script must delete displaced row adapter: ${removedRowAdapter}`);
}
for (const privateModule of ['Affordance', 'PokerButtonState']) {
  assert(!menuScript.includes(`const ${privateModule}`), `menu script must delete duplicate ${privateModule} module seam`);
}
for (const viewModelSurface of ['build: buildViewModel', 'startGate: buildStartGate', 'resumeGate: buildResumeGate']) {
  assertIncludes('ViewModel source object', menuScript, viewModelSurface, 'must expose the private projection surface');
}
assertIncludes('menu script', menuScript, 'const COMMAND_DEFINITIONS', 'must define command metadata table');
const commandDefinitionBlockStart = menuScript.indexOf('const COMMAND_DEFINITIONS = [');
const commandDefinitionBlockEnd = menuScript.indexOf('];', commandDefinitionBlockStart);
const commandDefinitionBlock = commandDefinitionBlockStart >= 0 && commandDefinitionBlockEnd > commandDefinitionBlockStart
  ? menuScript.slice(commandDefinitionBlockStart, commandDefinitionBlockEnd)
  : '';
assert(commandDefinitionBlock, 'menu script must expose a readable COMMAND_DEFINITIONS block');
for (const [family, minimumCount] of [['party', 3], ['match', 1], ['progress', 2], ['resume', 3], ['start', 1], ['ignored', 1]]) {
  const familyToken = `family: "${family}"`;
  assert(commandDefinitionBlock.includes(familyToken), `COMMAND_DEFINITIONS must include ${family} family metadata`);
  assertEqual(countOccurrences(commandDefinitionBlock, familyToken), minimumCount, `COMMAND_DEFINITIONS should define ${minimumCount} ${family} rows`);
}
assert(!commandDefinitionBlock.includes('family: "action"'), 'COMMAND_DEFINITIONS must delegate action syntax to PokerEngine');
const actionWireTableStart = menuScript.indexOf('const ACTION_WIRE_TABLE = [');
const actionWireTableEnd = menuScript.indexOf('];', actionWireTableStart);
const actionWireTableBlock = actionWireTableStart >= 0 && actionWireTableEnd > actionWireTableStart
  ? menuScript.slice(actionWireTableStart, actionWireTableEnd)
  : '';
assert(actionWireTableBlock, 'PokerEngine must expose a static action wire table');
for (const token of ['action: "check"', 'action: "call"', 'action: "fold"', 'action: "bet"', 'action: "raise"', 'type: "all-in-unsupported"']) {
  assertIncludes('ACTION_WIRE_TABLE', actionWireTableBlock, token, 'must recognize static action wire syntax');
}
assertIncludes('menu script', menuScript, 'function decodeActionWire', 'PokerEngine must decode action wire text without State.game');
const engineActionPolicyStart = menuScript.indexOf('function engineActionPolicy');
const engineActionPolicyEnd = menuScript.indexOf('const ACTION_WIRE_TABLE = [', engineActionPolicyStart);
const engineActionPolicyBlock = engineActionPolicyStart >= 0 && engineActionPolicyEnd > engineActionPolicyStart
  ? menuScript.slice(engineActionPolicyStart, engineActionPolicyEnd)
  : '';
assert(engineActionPolicyBlock, 'PokerEngine must own a readable action descriptor');
for (const token of ['isLegal:', 'invalidStatus:', 'prompt:', 'statusText:', 'isLegal: function isLegalCustomAmount', 'command: function customCommand']) {
  assertIncludes('PokerEngine action descriptor', engineActionPolicyBlock, token, 'must own action validation, feedback, and custom command policy');
}
for (const displacedWrapper of ['function getTurnPrompt', 'function getActionStatusText', 'function isEngineActionLegal', 'function isCustomBetAmountLegal', 'function getCustomBetCommandLabel']) {
  assert(!menuScript.includes(displacedWrapper), `menu script must remove displaced ${displacedWrapper} policy wrapper`);
}
for (const type of ['party-leader', 'party-join', 'party-leave', 'match-end', 'progress-offer', 'progress-chunk', 'resume-leader', 'resume-ready', 'resume-start', 'start', 'ignored']) {
  assert(commandDefinitionBlock.includes(`type: "${type}"`), `COMMAND_DEFINITIONS must include ${type} behavior metadata`);
}
for (const removedParser of [
  'parsePartyMessage', 'parseMatchEndMessage', 'extractPartyId', 'extractResumeId',
  'parseResumeMessage', 'parseProgressShareMessage', 'getCommandParts', 'markerIndex',
  'markerValue', 'decodeMarkerPlayerKey', 'parseResumeStartCommand', 'parseStartCommand',
  'parsePartyCommandDefinition', 'parseMatchCommandDefinition', 'parseProgressCommandDefinition',
  'parseResumeCommandDefinition', 'parseStartCommandDefinition', 'parseActionCommandDefinition',
  'parseIgnoredCommandDefinition',
]) {
  assert(!menuScript.includes(`function ${removedParser}`), `menu script must remove displaced ${removedParser} parser`);
}
const commandHandlersBlockStart = menuScript.indexOf('const COMMAND_HANDLERS = {');
const commandHandlersBlockEnd = menuScript.indexOf('};', commandHandlersBlockStart);
const commandHandlersBlock = commandHandlersBlockStart >= 0 && commandHandlersBlockEnd > commandHandlersBlockStart
  ? menuScript.slice(commandHandlersBlockStart, commandHandlersBlockEnd)
  : '';
for (const key of ['party-leader', 'party-join', 'party-leave', 'match-end', 'progress-offer', 'progress-chunk', 'resume-leader', 'resume-ready', 'resume-start', 'start', 'all-in-unsupported', 'action']) {
  assertIncludes('COMMAND_HANDLERS', commandHandlersBlock, `"${key}"`, 'must contain concrete command key');
}
const progressResumeStart = menuScript.indexOf('const ProgressResume = {');
const progressResumeEnd = menuScript.indexOf('};', progressResumeStart);
const progressResumeBlock = progressResumeStart >= 0 && progressResumeEnd > progressResumeStart ? menuScript.slice(progressResumeStart, progressResumeEnd) : '';
assert(progressResumeBlock, 'menu script must expose ProgressResume source object');
for (const propertyName of ['build', 'importCode', 'applyCommand', 'shareImported']) {
  assert(new RegExp(`\\b${propertyName}(?:\\s*:|\\s*\\()`).test(progressResumeBlock), `ProgressResume source object must include behavior hook property: ${propertyName}`);
}
assert(!progressResumeBlock.includes('project:'), 'ProgressResume must not retain duplicate UI projection facade');
for (const removedProgressSurface of ['gates', 'getStartGate', 'getHostedStartGate', '"import"', 'buildCode', 'applyShare', 'selectHostedLeader', 'applyStartCommand', 'project']) {
  assert(!progressResumeBlock.includes(`${removedProgressSurface}:`), `ProgressResume source object must remove facade property: ${removedProgressSurface}`);
}
for (const removedProgressAdapter of ['buildFreshProgressSaveCode', 'buildProgressOfferCommand', 'buildProgressChunkCommand', 'splitProgressCodeForChat', 'applyProgressResumeCommand', 'canShareImportedProgressFromHostedLeader']) {
  assert(!menuScript.includes(`function ${removedProgressAdapter}`), `menu script must remove displaced ProgressResume adapter: ${removedProgressAdapter}`);
}
const testHookStart = menuScript.indexOf('globalThis.__PokerEscapeMenuTestHooks = {');
const testHookEnd = menuScript.indexOf('modules: {', testHookStart);
const testHookBlock = testHookStart >= 0 && testHookEnd > testHookStart ? menuScript.slice(testHookStart, testHookEnd) : '';
for (const removedDirectExport of ['buildProgressSaveCode:', 'decodeProgressSaveCode:', 'importProgressSaveCode:', 'cryptProgressBytes:', 'textToUtf8Bytes:', 'getResumeGate:', 'getResumeId:']) {
  assert(!testHookBlock.includes(removedDirectExport), `menu test hooks must not export direct ProgressResume helper: ${removedDirectExport}`);
}
assert(!menuScript.includes('PokerTableOverflow'), 'menu script must not create PokerTableOverflow panels');
assert(!menuStyle.includes('.PokerTableOverflow'), 'menu style must not define PokerTableOverflow overflow label');
const resumeStartBuilderStart = menuScript.indexOf('function buildResumeStartCommand');
const resumeStartBuilderEnd = menuScript.indexOf('function getResumeRoster', resumeStartBuilderStart);
const resumeStartBuilderBlock = resumeStartBuilderStart >= 0 && resumeStartBuilderEnd > resumeStartBuilderStart ? menuScript.slice(resumeStartBuilderStart, resumeStartBuilderEnd) : '';
assert(!resumeStartBuilderBlock.includes(' roster '), 'resume start builder must not serialize roster markers');
assertIncludes('script', script, 'const PokerMetrics', 'chat debug must define PokerMetrics module seam');

assert(!menuScript.includes('function renderActionChoices'), 'menu script must not keep unused pre-PokerButtonState renderActionChoices dead code');
assert(!menuScript.includes('function sendProgressShare'), 'menu script must not keep unused finished-progress chat-share dead code');
assert(!menuScript.includes('function canShareProgressFromLocalLeader'), 'menu script must not keep unused finished-progress share gate dead code');
assert(!menuScript.includes('function playersInHand'), 'menu script must not keep unused playersInHand dead code');
assert(!menuScript.includes('function getLocalCallAmount'), 'menu script must not keep unused getLocalCallAmount dead code');
assert(!menuScript.includes('function getLargeActionTarget'), 'menu script must not keep unused getLargeActionTarget dead code');
assert(!menuScript.includes('function getCustomBetChoice'), 'menu script must not keep unused getCustomBetChoice dead code');
assert(!script.includes('function isPokerBridgeMessage'), 'chat bridge script must not keep unused isPokerBridgeMessage dead code');
assert(!menuScript.includes('function renderCommunityStable'), 'menu script must not keep shallow renderCommunityStable wrapper');
assert(!menuScript.includes('function renderPlayersStable'), 'menu script must not keep shallow renderPlayersStable wrapper');
assert(!menuScript.includes('function renderTableSeatsStable'), 'menu script must not keep shallow renderTableSeatsStable wrapper');
assert(!menuScript.includes('function renderActionsStable'), 'menu script must not keep shallow renderActionsStable wrapper');
assert(!menuScript.includes('function renderLogStable'), 'menu script must not keep shallow renderLogStable wrapper');
assert(!menuScript.includes('function applyEngineAction'), 'menu script must not keep shallow applyEngineAction wrapper');
assert(!menuScript.includes('function applyAffordance'), 'menu script must not keep shallow applyAffordance wrapper');

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`validate-poker: ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('validate-poker: ok');
}
