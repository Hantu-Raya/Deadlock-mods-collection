'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function fail(message) {
  throw new Error(`[HPV2/ThirdEye compose] ${message}`);
}

function readText(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) fail(`${label} not found: ${filePath || '(empty)'}`);
  return fs.readFileSync(filePath, 'utf8');
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function replaceOnce(text, pattern, replacement, label) {
  const matches = text.match(pattern);
  if (!matches || matches.length !== 1) {
    fail(`${label}: expected exactly one match, found ${matches ? matches.length : 0}`);
  }
  return text.replace(pattern, replacement);
}
function replaceLiteralOnce(text, needle, replacement, label) {
  const index = text.indexOf(needle);
  if (index < 0 || text.indexOf(needle, index + needle.length) >= 0) {
    const count = index < 0 ? 0 : 2;
    fail(`${label}: expected exactly one literal match, found ${count}`);
  }
  return `${text.slice(0, index)}${replacement}${text.slice(index + needle.length)}`;
}

function requireMatchCount(text, pattern, expected, label) {
  const matches = text.match(pattern);
  const actual = matches ? matches.length : 0;
  if (actual !== expected) fail(`${label}: expected ${expected} matches, found ${actual}`);
}

function extractSection(xml, sectionName) {
  const pattern = new RegExp(`<${sectionName}\\b[^>]*>([\\s\\S]*?)<\\/${sectionName}>`);
  const match = xml.match(pattern);
  if (!match) fail(`missing <${sectionName}> section`);
  return match[1];
}

function extractIncludes(xml, sectionName) {
  const body = extractSection(xml, sectionName);
  const includes = [];
  const pattern = /<include\s+src="([^"]+)"\s*\/>/g;
  let match;
  while ((match = pattern.exec(body))) includes.push(match[1]);
  if (includes.length === 0) fail(`${sectionName}: no include assets`);
  return includes;
}

function uniqueInOrder(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function includeLine(src, indent = '    ') {
  return `${indent}<include src="${src}" />`;
}

function extractElementById(xml, tagName, id) {
  const idIndex = xml.indexOf(`id="${id}"`);
  if (idIndex < 0) fail(`missing ${tagName}#${id}`);
  const start = xml.lastIndexOf(`<${tagName}`, idIndex);
  if (start < 0) fail(`missing opening ${tagName} for #${id}`);

  const tokenPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'g');
  tokenPattern.lastIndex = start;
  let depth = 0;
  let token;
  while ((token = tokenPattern.exec(xml))) {
    const value = token[0];
    if (value.startsWith(`</${tagName}`)) {
      depth -= 1;
      if (depth === 0) return xml.slice(start, tokenPattern.lastIndex);
    } else if (!value.endsWith('/>')) {
      depth += 1;
    }
  }
  fail(`unterminated ${tagName}#${id}`);
}

function extractRootOpen(xml, label) {
  const matches = xml.match(/<CitadelHudEscapeMenu\b[^>]*>/g);
  if (!matches || matches.length !== 1) fail(`${label}: expected one CitadelHudEscapeMenu root`);
  return matches[0];
}

function setAttribute(tag, name, value, label) {
  const pattern = new RegExp(`\\s${name}="[^"]*"`);
  if (pattern.test(tag)) return tag.replace(pattern, ` ${name}="${value}"`);
  return replaceOnce(tag, />$/, ` ${name}="${value}">`, label);
}

function loadPin(pinPath) {
  const raw = readText(pinPath, 'ThirdEye source pin');
  let pin;
  try {
    pin = JSON.parse(raw);
  } catch (error) {
    fail(`ThirdEye source pin is not valid JSON: ${error.message}`);
  }
  if (!pin || typeof pin !== 'object' || !pin.snapshotSha256) {
    fail('ThirdEye source pin has no snapshotSha256 map');
  }
  return pin;
}

function verifySnapshot(pathValue, expectedHash, label) {
  const actual = sha256Text(readText(pathValue, label));
  if (actual !== String(expectedHash || '').toLowerCase()) {
    fail(`${label} drifted: expected ${expectedHash} actual ${actual}`);
  }
  return actual;
}

function verifyPinnedInputs({ thirdEyeEscapePath, pinnedWindowPath, pinnedNamespacePath, pinnedTopbarPath, pin }) {
  const expected = pin.snapshotSha256;
  verifySnapshot(thirdEyeEscapePath, expected.escape, 'Pinned ThirdEye Escape XML');
  verifySnapshot(pinnedWindowPath, expected.window, 'Pinned ThirdEye window.js');
  verifySnapshot(pinnedNamespacePath, expected.namespace, 'Pinned ThirdEye namespace.js');
  verifySnapshot(pinnedTopbarPath, expected.topbarUltCooldown, 'Pinned ThirdEye topbar ultimate cooldown');
}

function buildEscapeMenu({ canonicalXml, thirdEyeXml, bridgeAsset, windowAsset, packageHash }) {
  if (!canonicalXml || !thirdEyeXml) fail('canonical and ThirdEye XML are required');
  if (!bridgeAsset || !windowAsset) fail('bridgeAsset and windowAsset are required');

  const canonicalRoot = extractRootOpen(canonicalXml, 'Canonical HPv2 Escape XML');
  const thirdEyeRoot = extractRootOpen(thirdEyeXml, 'Pinned ThirdEye Escape XML');
  if (canonicalRoot.includes('id="')) fail('canonical Escape root unexpectedly owns an id');
  if (thirdEyeRoot.includes('id="')) fail('ThirdEye Escape root unexpectedly owns an id');

  const hpStyle = 's2r://panorama/styles/hp_colors_v2_menu.vcss_c';
  const hpScripts = [
    's2r://panorama/scripts/hp_colors_v2_contract.vjs_c',
    's2r://panorama/scripts/hp_colors_v2_state.vjs_c',
    's2r://panorama/scripts/hp_colors_v2_menu.vjs_c',
  ];
  const canonicalStyles = extractIncludes(canonicalXml, 'styles');
  const canonicalScripts = extractIncludes(canonicalXml, 'scripts');
  for (const asset of [hpStyle, ...hpScripts]) {
    const source = asset.endsWith('.vcss_c') ? canonicalStyles : canonicalScripts;
    requireMatchCount(source.join('\n'), new RegExp(asset.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'g'), 1, `canonical ${asset}`);
  }
  requireMatchCount(canonicalXml, /id="HPColorsMenuButton"/g, 1, 'canonical HPColorsMenuButton');
  requireMatchCount(canonicalXml, /id="HPColorsEditorRoot"/g, 1, 'canonical HPColorsEditorRoot');
  requireMatchCount(canonicalXml, /id="HPColorsRewritePresetStore"/g, 1, 'canonical HPColorsRewritePresetStore');

  const thirdEyeStyles = extractIncludes(thirdEyeXml, 'styles');
  const thirdEyeScripts = extractIncludes(thirdEyeXml, 'scripts');
  const forbiddenExisting = [
    /hp_colors_v2_/,
    /hp_colors_thirdeye_/,
  ];
  for (const asset of [...thirdEyeStyles, ...thirdEyeScripts]) {
    if (forbiddenExisting.some((pattern) => pattern.test(asset))) {
      fail(`pinned ThirdEye XML already contains HPv2 compatibility asset: ${asset}`);
    }
  }
  requireMatchCount(thirdEyeScripts.join('\n'), /s2r:\/\/panorama\/scripts\/ui\/window\.vjs_c/g, 1, 'pinned ThirdEye window include');
  requireMatchCount(thirdEyeScripts.join('\n'), /s2r:\/\/panorama\/scripts\/core\/namespace\.vjs_c/g, 1, 'pinned ThirdEye namespace include');
  requireMatchCount(thirdEyeXml, /id="ThirdEyeWindow"/g, 1, 'pinned ThirdEyeWindow');
  requireMatchCount(thirdEyeXml, /id="ThirdEyeSettingsBtn"/g, 1, 'pinned ThirdEyeSettingsBtn');
  requireMatchCount(thirdEyeXml, /id="te_PlayButton"/g, 1, 'pinned te_PlayButton');
  requireMatchCount(thirdEyeXml, /id="te_WatchButton"/g, 1, 'pinned te_WatchButton');

  const mergedStyles = uniqueInOrder([
    ...canonicalStyles,
    ...thirdEyeStyles.filter((asset) => !canonicalStyles.includes(asset)),
  ]);
  const mergedScripts = uniqueInOrder([
    ...canonicalScripts,
    `s2r://panorama/scripts/${bridgeAsset}`,
    ...thirdEyeScripts.filter((asset) => !asset.endsWith('/window.vjs_c')),
    `s2r://panorama/scripts/${windowAsset}`,
  ]);

  const hpButton = extractElementById(canonicalXml, 'Button', 'HPColorsMenuButton');
  const hpEditor = extractElementById(canonicalXml, 'Panel', 'HPColorsEditorRoot');
  const hpPresetStore = extractElementById(canonicalXml, 'Panel', 'HPColorsRewritePresetStore');
  const thirdEyeButton = extractElementById(thirdEyeXml, 'Button', 'ThirdEyeSettingsBtn');
  const settingsRowPattern = /[ \t]*<Panel class="SettingsRow">[\s\S]*?<Button id="ThirdEyeSettingsBtn"[\s\S]*?<\/Button>[\s\S]*?<\/Panel>/g;
  requireMatchCount(thirdEyeXml, settingsRowPattern, 1, 'ThirdEye settings row');
  const hpRow = [
    '        <Panel class="SettingsRow">',
    hpButton,
    '        </Panel>',
  ].join('\n');
  let merged = thirdEyeXml;
  const styleBody = mergedStyles.map((asset) => includeLine(asset)).join('\n');
  const scriptBody = mergedScripts.map((asset) => includeLine(asset)).join('\n');
  merged = replaceOnce(merged, /<styles>[\s\S]*?<\/styles>/, `<styles>\n${styleBody}\n\t</styles>`, 'merged style includes');
  merged = replaceOnce(merged, /<scripts>[\s\S]*?<\/scripts>/, `<scripts>\n${scriptBody}\n\t</scripts>`, 'merged script includes');
  merged = replaceOnce(merged, settingsRowPattern, (match) => `${match}\n${hpRow}`, 'HP button insertion');
  merged = replaceLiteralOnce(
    merged,
    thirdEyeButton,
    setAttribute(
      thirdEyeButton,
      'onactivate',
      "if (typeof $.HPColorsThirdEyeToggleWindow === 'function') $.HPColorsThirdEyeToggleWindow();",
      'ThirdEye settings button',
    ),
    'ThirdEye settings button composition',
  );
  merged = replaceOnce(
    merged,
    /\s*<\/CitadelHudEscapeMenu>/,
    `\n${hpEditor}\n${hpPresetStore}\n\t</CitadelHudEscapeMenu>`,
    'HP editor insertion',
  );

  const escapeHandler = "if (!$.HPColorsMenuCancel()) $.DispatchEvent(&apos;CitadelResumePlaying&apos;, $.GetContextPanel())";
  let root = extractRootOpen(merged, 'merged Escape XML');
  root = setAttribute(root, 'onload', '$.HPColorsMenuBoot()', 'merged Escape root');
  root = setAttribute(root, 'oncancel', escapeHandler, 'merged Escape root');
  merged = replaceOnce(merged, /<CitadelHudEscapeMenu\b[^>]*>/, root, 'Escape root');
  merged = replaceOnce(
    merged,
    /<Panel\b[^>]*id=\"EscapeBackground\"[^>]*\/>/,
    (tag) => setAttribute(tag, 'onactivate', escapeHandler, 'merged EscapeBackground'),
    'merged EscapeBackground',
  );
  merged = replaceOnce(
    merged,
    /<CitadelBindingButton\b[^>]*id=\"EscapeButton\"[^>]*\/>/,
    (tag) => setAttribute(tag, 'onactivate', escapeHandler, 'merged EscapeButton'),
    'merged EscapeButton',
  );
  merged = replaceOnce(
    merged,
    /^<!--[\s\S]*?-->\r?\n/m,
    `<!-- Generated by compose-hp-colors-rewrite-v2-thirdeye.js${packageHash ? `; ThirdEye pak SHA-256 ${packageHash}` : ''}. -->\n`,
    'generated header',
  );

  for (const id of [
    'ThirdEyeWindow',
    'ThirdEyeWindowHeader',
    'ThirdEyeWindowTitle',
    'ThirdEyeWindowClose',
    'ThirdEyeWindowBody',
    'ThirdEyeWindowTabs',
    'ThirdEyeWindowContent',
    'ThirdEyeSettingsBtn',
    'te_PlayButton',
    'te_WatchButton',
    'HPColorsMenuButton',
    'HPColorsEditorRoot',
    'HPColorsRewritePresetStore',
    'EscapeBackground',
    'EscapeButton',
  ]) {
    requireMatchCount(merged, new RegExp(`id="${id}"`, 'g'), 1, `merged ${id}`);
  }
  requireMatchCount(merged, /onload="\$\.HPColorsMenuBoot\(\)"/g, 1, 'merged HP boot handler');
  requireMatchCount(merged, /oncancel="if \(!\$\.HPColorsMenuCancel\(\)\)/g, 1, 'merged Escape cancel contract');
  requireMatchCount(merged, /id="EscapeBackground"[^>]*onactivate="if \(!\$\.HPColorsMenuCancel\(\)\)/g, 1, 'merged Escape backdrop contract');
  requireMatchCount(merged, /id="EscapeButton"[^>]*onactivate="if \(!\$\.HPColorsMenuCancel\(\)\)/g, 1, 'merged Escape button contract');
  requireMatchCount(merged, new RegExp(`s2r://panorama/scripts/${bridgeAsset.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`, 'g'), 1, 'merged bridge include');
  requireMatchCount(merged, new RegExp(`s2r://panorama/scripts/${windowAsset.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`, 'g'), 1, 'merged patched window include');
  requireMatchCount(merged, /s2r:\/\/panorama\/scripts\/ui\/window\.vjs_c/g, 0, 'merged original ThirdEye window include');

  return `${merged.trimEnd()}\n`;
}

function buildTopbarUltimateFeature(source) {
  return replaceLiteralOnce(
    source,
    '            var ultimate = statusRow.FindChild("UltimateStatus");',
    [
      '            var ultimate = statusRow.FindChild("UltimateStatus");',
      '            // HPv2 wraps the native ultimate while pickup indicators are active.',
      '            if (!thirdEye.core.panel.isAlive(ultimate)) {',
      '                var pickups = statusRow.FindChild("HPV2PickupIndicators");',
      '                if (thirdEye.core.panel.isAlive(pickups)) {',
      '                    ultimate = pickups.FindChild("UltimateStatus");',
      '                }',
      '            }',
    ].join('\n'),
    'ThirdEye ultimate lookup',
  );
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) fail(`unknown positional argument: ${arg}`);
    const name = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`missing value for --${name}`);
    result[name] = value;
    index += 1;
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = [
    'canonical',
    'thirdeye',
    'bridge',
    'window',
    'output',
    'pin',
    'topbarOutput',
  ];
  for (const key of required) {
    if (!args[key]) fail(`missing --${key}`);
  }
  const pin = loadPin(args.pin);
  const snapshotRoot = path.join(path.dirname(args.pin), 'source_snapshots');
  const pinnedWindow = path.resolve(args.windowPin || path.join(snapshotRoot, 'window.js'));
  const pinnedNamespace = path.resolve(args.namespacePin || path.join(snapshotRoot, 'namespace.js'));
  const pinnedTopbar = path.resolve(path.join(snapshotRoot, 'topbar_ult_cooldown.js'));
  verifyPinnedInputs({
    thirdEyeEscapePath: args.thirdeye,
    pinnedWindowPath: pinnedWindow,
    pinnedNamespacePath: pinnedNamespace,
    pinnedTopbarPath: pinnedTopbar,
    pin,
  });

  const bridgeSource = readText(args.bridge, 'ThirdEye bridge source');
  const windowSource = readText(args.window, 'Patched ThirdEye window source');
  if (!bridgeSource.includes('HPColorsThirdEyeCloseWindow')) fail('bridge source does not export HPColorsThirdEyeCloseWindow');
  if (!windowSource.includes('HPColorsThirdEyeCloseWindow')) fail('patched window source does not use HPColorsThirdEyeCloseWindow');

  const canonicalXml = readText(args.canonical, 'Canonical HPv2 Escape XML');
  const thirdEyeXml = readText(args.thirdeye, 'Pinned ThirdEye Escape XML');
  const output = buildEscapeMenu({
    canonicalXml,
    thirdEyeXml,
    bridgeAsset: 'hp_colors_thirdeye_bridge.vjs_c',
    windowAsset: 'hp_colors_thirdeye_window.vjs_c',
    packageHash: args.packageHash || '',
  });
  const topbarOutput = buildTopbarUltimateFeature(readText(pinnedTopbar, 'Pinned ThirdEye topbar ultimate cooldown'));
  fs.mkdirSync(path.dirname(path.resolve(args.topbarOutput)), { recursive: true });
  fs.writeFileSync(args.topbarOutput, topbarOutput, 'utf8');
  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(args.output, output, 'utf8');
  console.log(`[HPV2/ThirdEye compose] wrote ${path.resolve(args.output)}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  buildEscapeMenu,
  buildTopbarUltimateFeature,
  sha256Text,
  verifySnapshot,
};
