#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const LAYOUT_PATH = path.join(ROOT, 'panorama', 'layout', 'chat.xml');
const MENU_LAYOUT_PATH = path.join(ROOT, 'panorama', 'layout', 'hud_escape_menu.xml');
const SCRIPT_PATH = path.join(ROOT, 'panorama', 'scripts', 'poker_chat_debug.js');
const MENU_STYLE_PATH = path.join(ROOT, 'panorama', 'styles', 'poker_escape_menu.css');
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

function cssBlock(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : '';
}

const layout = readSource('layout', LAYOUT_PATH);
const script = readSource('script', SCRIPT_PATH);
const menuLayout = readSource('menu layout', MENU_LAYOUT_PATH);
const menuStyle = readSource('menu style', MENU_STYLE_PATH);


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
]) {
  assertMatches('menu layout', menuLayout, new RegExp(`id=["']${id}["']`), `must expose #${id} for party sync controls`);
}

const pokerAnitaBodyCss = cssBlock(menuStyle, '.PokerAnitaBody');
assert(pokerAnitaBodyCss, 'menu style must define .PokerAnitaBody for the ESC menu scroll container');
assertMatches(
  'menu style .PokerAnitaBody',
  pokerAnitaBodyCss,
  /\boverflow\s*:\s*[^;]*\bscroll\b[^;]*;/,
  'must make the ESC menu body scrollable when content exceeds available height',
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

assertMatches('script', script, /\$\.Msg[\s\S]*record\.sender[\s\S]*record\.message/, 'must log sender and message content through $.Msg');

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

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`validate-poker: ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('validate-poker: ok');
}
