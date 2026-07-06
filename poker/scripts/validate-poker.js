#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const vm = require('node:vm');

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

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertIncludes(label, source, token, reason) {
  assert(source.includes(token), `${label} ${reason}: ${token}`);
}

function assertMatches(label, source, pattern, reason) {
  assert(pattern.test(source), `${label} ${reason}: ${pattern}`);
}

function createTestPanel(options = {}) {
  const panel = {
    id: options.id || '',
    text: options.text || '',
    classes: options.classes || [],
    children: options.children || [],
    parent: null,
    IsValid() {
      return true;
    },
    GetParent() {
      return this.parent;
    },
    GetChildCount() {
      return this.children.length;
    },
    GetChild(index) {
      return this.children[index] || null;
    },
    BHasClass(className) {
      return this.classes.includes(className);
    },
    FindChildTraverse(id) {
      if (this.id === id) return this;
      for (const child of this.children) {
        if (child && typeof child.FindChildTraverse === 'function') {
          const found = child.FindChildTraverse(id);
          if (found) return found;
        }
      }
      return null;
    },
    FindChildrenWithClassTraverse(className) {
      const matches = [];
      if (this.classes.includes(className)) matches.push(this);
      for (const child of this.children) {
        if (child && typeof child.FindChildrenWithClassTraverse === 'function') {
          matches.push(...child.FindChildrenWithClassTraverse(className));
        }
      }
      return matches;
    },
  };
  for (const child of panel.children) {
    if (child) child.parent = panel;
  }
  return panel;
}

function createChatMessagePanel(sender, message, options = {}) {
  return createTestPanel({
    classes: options.isSelf ? ['IsSelf'] : [],
    children: [
      createTestPanel({
        id: 'MessageSource',
        children: [
          createTestPanel({ text: sender, classes: ['SenderName'] }),
          createTestPanel({ text: options.channel || 'TEAM', classes: ['ChannelName'] }),
        ],
      }),
      createTestPanel({
        id: 'MessageContents',
        children: [createTestPanel({ text: message })],
      }),
    ],
  });
}

function createChatBridgeRuntime() {
  const config = {};
  const dispatches = [];
  const logs = [];
  const schedules = [];
  const rootPanel = createTestPanel({ id: 'Chat' });
  const sandbox = {
    console,
    GameUI: {
      CustomUIConfig() {
        return config;
      },
    },
    $: {
      DispatchEvent(event, payload) {
        dispatches.push({ event, payload });
      },
      GetContextPanel() {
        return rootPanel;
      },
      Msg(message) {
        logs.push(String(message));
      },
      RegisterForUnhandledEvent() {},
      Schedule(delay, callback) {
        schedules.push({ delay, callback });
      },
    },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(script, sandbox, { filename: SCRIPT_PATH });
  return {
    config,
    dispatches,
    hooks: sandbox.__PokerChatDebugTestHooks,
    logs,
    schedules,
  };
}

function cssBlock(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`(?:^|\\})\\s*${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'));
  return match ? match[1] : '';
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

function cssDeclarationValue(block, property) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\b${escapedProperty}\\s*:\\s*([^;]+);`).exec(block || '');
  return match ? match[1].trim() : '';
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

function cssPxValue(block, property) {
  const value = cssDeclarationValue(block, property);
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value);
  return match ? Number(match[1]) : NaN;
}

function assertResponsiveWindowPosition(selector, options) {
  const block = cssBlock(menuStyle, selector);
  assert(block, `menu style must define ${selector} for responsive floating window positioning`);
  assertCssDeclarationMatches(`menu style ${selector}`, block, 'width', /^\d+(?:\.\d+)?%$/, 'must use percentage width');
  assert(!/\bmax-height\s*:/.test(block), `menu style ${selector} must not cap floating window height; percentage max-height caused Panorama clipping`);
  assertCssDeclarationMatches(`menu style ${selector}`, block, 'margin-top', /^\d+(?:\.\d+)?%$/, 'must use percentage vertical positioning');
  assertCssDeclarationMatches(`menu style ${selector}`, block, 'align', options.align, `must align to ${options.alignDescription}`);
  assertCssDeclarationMatches(`menu style ${selector}`, block, options.horizontalProperty, /^\d+(?:\.\d+)?%$/, `must use percentage ${options.horizontalProperty}`);
  assert(
    !new RegExp(`\\b${options.forbiddenHorizontalProperty}\\s*:`).test(block),
    `menu style ${selector} must not mix ${options.forbiddenHorizontalProperty} with ${options.horizontalProperty}`,
  );
  assert(
    !/\b(?:width|margin-left|margin-right|margin-top)\s*:\s*-?\d+(?:\.\d+)?px\s*;/.test(block),
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

function validateCardImage(imageName) {
  const filePath = path.join(CARD_IMAGE_DIR, imageName);
  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (error) {
    failures.push(`card image missing or unreadable: ${normalizePath(filePath)} (${error.message})`);
    return;
  }

  let png;
  try {
    png = parsePng(buffer);
  } catch (error) {
    failures.push(`card image ${imageName} must be a readable PNG: ${error.message}`);
    return;
  }

  assert(
    png.width === EXPECTED_CARD_IMAGE_SIZE && png.height === EXPECTED_CARD_IMAGE_SIZE,
    `card image ${imageName} must be ${EXPECTED_CARD_IMAGE_SIZE}x${EXPECTED_CARD_IMAGE_SIZE}, got ${png.width}x${png.height}`,
  );
  assert(
    png.colorType === 6,
    `card image ${imageName} must be PNG color type 6 (RGBA), got color type ${png.colorType}`,
  );

  if (png.colorType !== 6) return;

  try {
    assert(
      pngHasTransparentAlpha(png),
      `card image ${imageName} must contain at least one transparent pixel (alpha below full opacity)`,
    );
  } catch (error) {
    failures.push(`card image ${imageName} alpha data unreadable: ${error.message}`);
  }
}

function validateRequiredCardImages() {
  for (const imageName of REQUIRED_CARD_IMAGE_NAMES) {
    validateCardImage(imageName);
  }
}

const layout = readSource('layout', LAYOUT_PATH);
const script = readSource('script', SCRIPT_PATH);
const menuScript = readSource('menu script', MENU_SCRIPT_PATH);
const menuLayout = readSource('menu layout', MENU_LAYOUT_PATH);
const menuStyle = readSource('menu style', MENU_STYLE_PATH);
validateRequiredCardImages();

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

assertMatches(
  'chat bridge script',
  script,
  /function\s+clearReadySeats[\s\S]*config\[READY_SEATS_KEY\]\s*=\s*\{\}[\s\S]*action:\s*["']clear["'][\s\S]*seats:\s*\[\]/,
  'must clear stored ready seats and dispatch an empty ready-seat event',
);
assertMatches(
  'chat bridge script',
  script,
  /event\.event\s*===\s*READY_CLEAR_REQUEST_EVENT\)\s*clearReadySeats\(event\.reason\s*\|\|\s*["']request["']\)/,
  'must handle PokerReadySeatsClearRequest from ClientUI_FireOutput',
);
assertMatches(
  'chat bridge script',
  script,
  /function\s+forgetReadySeat\(record\)[\s\S]*isPartyLeaveMessage\(record\.message\)[\s\S]*delete\s+seats\[key\][\s\S]*action:\s*["']leave["']/,
  'must remove a ready seat when a [party leave] row is bridged from chat',
);
assertMatches(
  'menu script',
  menuScript,
  /function\s+clearReadySeats\(reason\)[\s\S]*replaceReadySeats\(\[\]\)[\s\S]*event:\s*READY_CLEAR_REQUEST_EVENT/,
  'must send PokerReadySeatsClearRequest when the menu clears local ready state',
);
assertMatches(
  'menu script',
  menuScript,
  /function\s+recordPartyLeave\(record,\s*partyId\)[\s\S]*record\.isSelf\s*\?\s*clearReadySeats\(["']self leave["']\)\s*:\s*forgetReadySeat\(key\)/,
  'must clear local seats on self leave and remove foreign ready seats on party leave',
);
assertMatches(
  'menu script',
  menuScript,
  /function\s+applyReadyPayload\(event\)[\s\S]*if\s*\(event\.seats\)\s*\{[\s\S]*replaceReadySeats\(event\.seats\)/,
  'must replace ready snapshots instead of merging them into old menu ready seats',
);

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

assertIncludes('menu script', menuScript, '__pokerImageSrc === src', 'setImageSource must skip unchanged card image sources');
assertIncludes('menu script', menuScript, 'image.__pokerImageSrc = src', 'setImageSource must cache the last card image source');
assertIncludes('menu script', menuScript, 'getCardDisplayRank(card.rank)', 'createCard must use display ranks for card corner labels');
assertIncludes('menu script', menuScript, 'getSuitGlyph(card.suit)', 'createCard must use suit glyphs for card corner labels');

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
}
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
  '.PokerTableOverflow',
]) {
  assert(cssBlock(menuStyle, selector), `menu style must define ${selector} for the four floating poker window layout`);
}
for (const [selector, options] of [
  ['.PokerLobbyWindow', { align: /^left\s+top$/, alignDescription: 'the left top layout column', horizontalProperty: 'margin-left', forbiddenHorizontalProperty: 'margin-right' }],
  ['.PokerTableWindow', { align: /^left\s+top$/, alignDescription: 'the left top layout column', horizontalProperty: 'margin-left', forbiddenHorizontalProperty: 'margin-right' }],
  ['.PokerActionsWindow', { align: /^left\s+top$/, alignDescription: 'the left top layout column', horizontalProperty: 'margin-left', forbiddenHorizontalProperty: 'margin-right' }],
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
    /^56%$/,
    'must keep the tightened main poker window width',
  );
  assertCssDeclarationMatches(
    `menu style ${selector}`,
    block,
    'margin-left',
    /^25%$/,
    'must keep the tightened main poker window left offset',
  );
}
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
  'must move bottom action controls down without leaving excessive deadspace',
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
for (const forbiddenCardArtClass of ['PokerCardFaceInitial', 'PokerCardFaceSuit']) {
  assert(
    !menuScript.includes(forbiddenCardArtClass),
    `menu script must not create/use duplicate center card label class ${forbiddenCardArtClass}`,
  );
}

assertMatches(
  'menu script',
  menuScript,
  /createPanel\(\s*["']Image["']\s*,\s*art\s*,\s*["'][^"']*["']\s*,\s*["']PokerCardVtexArt["']\s*\)/,
  'must create card art as an Image panel with .PokerCardVtexArt',
);

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
  'isResumeLeaderMessage',
  'isResumeReadyMessage',
  'isResumeStartMessage',
]) {
  assertIncludes('script', script, token, 'missing resume chat debug export token');
}

assertMatches('script', script, /\$\.Msg[\s\S]*record\.sender[\s\S]*record\.message/, 'must log sender and message content through $.Msg');

const bridgeRuntime = createChatBridgeRuntime();
const bridgeIntake = bridgeRuntime.hooks && bridgeRuntime.hooks.modules && bridgeRuntime.hooks.modules.ChatBridgeIntake;
if (bridgeIntake) {
  const unknownResumeStart = 'poker resume r2pzo6p hand 2 leader jdbeast seed smr8kezvr';
  const unknownResumeStartPanel = createChatMessagePanel('<unknown>', unknownResumeStart);
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const result = bridgeIntake.consumeRow(unknownResumeStartPanel);
    assert(
      result && result.status === 'delayed',
      `unknown short resume-start should delay while sender can still resolve (attempt ${attempt}), got ${result && result.status}`,
    );
  }
  const resumedAfterCap = bridgeIntake.consumeRow(unknownResumeStartPanel);
  assert(
    resumedAfterCap && resumedAfterCap.status === 'consumed',
    `unknown short resume-start should be released after the retry cap so the menu reducer can resolve hosted authority, got ${resumedAfterCap && resumedAfterCap.status}`,
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
    const authorityPanel = createChatMessagePanel('<unknown>', authorityMessage);
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const result = bridgeIntake.consumeRow(authorityPanel);
      assert(
        result && result.status === 'delayed',
        `unknown ${authorityMessage} authority row should stay delayed instead of granting authority (attempt ${attempt}), got ${result && result.status}`,
      );
    }
    assert(
      !bridgeRuntime.config.PokerChatMessages.some((entry) => entry.message === authorityMessage),
      `unknown ${authorityMessage} authority row should not be appended to bridge chat history while unresolved`,
    );
  }
} else {
  assert(false, 'chat bridge should expose ChatBridgeIntake test hooks for unknown-sender retry coverage');
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

assertIncludes('menu script', menuScript, '__pokerImageSrc', 'must guard repeated card image source writes');
assertIncludes('menu script', menuScript, 'getCardDisplayRank(card.rank)', 'must use display rank helper for card corner labels');
assertIncludes('menu script', menuScript, 'getSuitGlyph(card.suit)', 'must use suit glyph helper for card corner labels');
for (const moduleName of ['StartSync', 'CommandReducer', 'PokerEngine', 'ProgressResume', 'PendingSelfAction', 'CardPresenter', 'TableRenderer', 'Affordance', 'PokerButtonState']) {
  assertIncludes('menu script', menuScript, `const ${moduleName}`, `must define ${moduleName} module seam`);
}
assertIncludes('script', script, 'const ChatBridgeIntake', 'must define ChatBridgeIntake module seam');

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`validate-poker: ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('validate-poker: ok');
}
