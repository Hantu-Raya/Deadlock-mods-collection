'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function fail(message) {
  throw new Error(message);
}

function replaceOnce(text, pattern, replacement, label) {
  if (typeof pattern === 'string') {
    const index = text.indexOf(pattern);
    if (index < 0 || text.indexOf(pattern, index + pattern.length) >= 0) {
      fail(`${label}: expected exactly one literal match`);
    }
    const value = typeof replacement === 'function' ? replacement(pattern) : replacement;
    return text.slice(0, index) + value + text.slice(index + pattern.length);
  }
  const matches = text.match(pattern);
  if (!matches || matches.length !== 1) {
    fail(`${label}: expected exactly one match, found ${matches ? matches.length : 0}`);
  }
  return text.replace(pattern, replacement);
}

function insertAfter(text, anchor, addition, label) {
  return replaceOnce(text, anchor, (match) => `${match}${addition}`, label);
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function requireMatchCount(text, pattern, expected, label) {
  const actual = countMatches(text, pattern);
  if (actual !== expected) {
    fail(`${label}: expected ${expected} matches, found ${actual}`);
  }
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

function setAttribute(tag, name, value, label) {
  const pattern = new RegExp(`\\s${name}="[^"]*"`);
  if (pattern.test(tag)) return tag.replace(pattern, ` ${name}="${value}"`);
  return replaceOnce(tag, />$/, ` ${name}="${value}">`, label);
}

function prefixHandler(tag, name, prefix, label) {
  const pattern = new RegExp(`\\s${name}="([^"]*)"`);
  const match = tag.match(pattern);
  if (!match) fail(`${label}: missing ${name}`);
  return tag.replace(pattern, ` ${name}="${prefix}${match[1]}"`);
}


function buildHud(sourceXml, packageHash) {
  const bodyHealthbarInclude =
    /^[ \t]*<include src="s2r:\/\/panorama\/scripts\/features\/(?:ql_feat_healthbar[^"]*|healthbar\/[^"]+)\.vjs_c" \/>[ \t]*\r?$/gim;
  const injectedInclude =
    /s2r:\/\/panorama\/scripts\/qollock_(?:runtime|topbar_warning)_guard\.vjs_c/g;
  requireMatchCount(
    sourceXml,
    injectedInclude,
    0,
    'pak03 HUD pre-existing compatibility includes',
  );
  if (countMatches(sourceXml, bodyHealthbarInclude) === 0) {
    fail('pak03 HUD has no QOLLOCK healthbar runtime includes to retain');
  }
  return replaceOnce(
    sourceXml,
    /^<!-- xml reconstructed[^\n]*-->/,
    `<!-- Generated from pak03 SHA-256 ${packageHash} by refresh-hp-colors-rewrite-qollock.js -->`,
    'HUD generated header',
  );
}

function buildEscapeMenu(sourceXml, canonicalXml, packageHash) {
  for (const id of [
    'HPColorsMenuButton',
    'HPColorsEditorRoot',
    'HPColorsSupporterTicker',
    'HPColorsAllyTeamHighToggle',
    'HPColorsRewritePresetStore',
  ]) {
    requireMatchCount(
      sourceXml,
      new RegExp(`id="${id}"`, 'g'),
      0,
      `pak03 Escape-menu pre-existing ${id}`,
    );
  }
  requireMatchCount(
    sourceXml,
    /s2r:\/\/panorama\/(?:scripts|styles)\/(?:hp_colors_|qollock_(?:settings|hp_colors)_guard)[^"]*\.(?:vjs|vcss)_c/g,
    0,
    'pak03 Escape-menu pre-existing compatibility includes',
  );
  requireMatchCount(
    sourceXml,
    /id="ModSettingsBtn"/g,
    1,
    'pak03 QOLLOCK settings button',
  );
  let xml = sourceXml;
  const hpButton = extractElementById(canonicalXml, 'Button', 'HPColorsMenuButton');
  const hpEditor = extractElementById(canonicalXml, 'Panel', 'HPColorsEditorRoot');
  xml = insertAfter(
    xml,
    /^\s*<include src="s2r:\/\/panorama\/styles\/ql_settings\.vcss_c" \/>/m,
    '\n\t\t<include src="s2r://panorama/styles/hp_colors_menu.vcss_c" />',
    'Escape-menu style anchor',
  );
  const hpPresetStore = extractElementById(canonicalXml, 'Panel', 'HPColorsRewritePresetStore');
  xml = insertAfter(
    xml,
    /^\s*<include src="s2r:\/\/panorama\/scripts\/ql_settings\.vjs_c" \/>/m,
    [
      '',
      '\t\t<include src="s2r://panorama/scripts/hp_colors_contract.vjs_c" />',
      '\t\t<include src="s2r://panorama/scripts/hp_colors_state.vjs_c" />',
      '\t\t<include src="s2r://panorama/scripts/hp_colors_menu.vjs_c" />',
      '\t\t<include src="s2r://panorama/scripts/qollock_hp_colors_bridge.vjs_c" />',
    ].join('\n'),
    'Escape-menu script anchor',
  );

  xml = replaceOnce(xml, /<CitadelHudEscapeMenu\b[^>]*>/, (tag) => {
    let next = setAttribute(tag, 'onload', '$.HPColorsMenuBoot()', 'Escape-menu root');
    next = prefixHandler(
      next,
      'oncancel',
      'if ($.HPColorsMenuCancel &amp;&amp; $.HPColorsMenuCancel()) {} else ',
      'Escape-menu root',
    );
    return next;
  }, 'Escape-menu root');
  xml = replaceOnce(xml, /<Panel\b[^>]*id="EscapeBackground"[^>]*\/>/, (tag) => prefixHandler(
    tag,
    'onactivate',
    'if ($.HPColorsMenuCancel &amp;&amp; $.HPColorsMenuCancel()) {} else ',
    'Escape background',
  ), 'Escape background');
  xml = replaceOnce(
    xml,
    /<Panel class="SettingsRow">\s*<Button id="ModSettingsBtn"[\s\S]*?<\/Button>\s*<\/Panel>/,
    (qolRow) => [
      qolRow,
      '\t\t\t\t\t<Panel class="SettingsRow">',
      hpButton,
      '\t\t\t\t\t</Panel>',
    ].join('\n'),
    'QOLLOCK settings row',
  );
  xml = replaceOnce(
    xml,
    /\s*<\/CitadelHudEscapeMenu>/,
    `\n${hpEditor}\n${hpPresetStore}\n\t</CitadelHudEscapeMenu>`,
    'Escape-menu editor insertion',
  );
  for (const id of [
    'HPColorsMenuButton',
    'HPColorsEditorRoot',
    'HPColorsSupporterTicker',
    'HPColorsAllyTeamHighToggle',
    'HPColorsRewritePresetStore',
  ]) {
    requireMatchCount(
      xml,
      new RegExp(`id="${id}"`, 'g'),
      1,
      `generated Escape-menu ${id}`,
    );
  }
  for (const asset of [
    'hp_colors_menu.vcss_c',
    'hp_colors_contract.vjs_c',
    'hp_colors_state.vjs_c',
    'hp_colors_menu.vjs_c',
    'qollock_hp_colors_bridge.vjs_c',
  ]) {
    requireMatchCount(
      xml,
      new RegExp(`s2r://panorama/(?:scripts|styles)/${asset.replace(/[.]/g, '\\.')}`, 'g'),
      1,
      `generated Escape-menu ${asset}`,
    );
  }
  return replaceOnce(
    xml,
    /^<!-- xml reconstructed[^\n]*-->/,
    `<!-- Generated from pak03 SHA-256 ${packageHash} by refresh-hp-colors-rewrite-qollock.js -->`,
    'Escape-menu generated header',
  );
}

function main() {
  const [
    pakPath,
    packageHudPath,
    packageEscapePath,
    canonicalEscapePath,
    supportRoot,
    manifestPath,
  ] = process.argv.slice(2);
  if (!pakPath || !packageHudPath || !packageEscapePath || !canonicalEscapePath || !supportRoot || !manifestPath) {
    console.error('Usage: node scripts/refresh-hp-colors-rewrite-qollock.js <pak03_dir.vpk> <decompiled hud.xml> <decompiled hud_escape_menu.xml> <canonical hud_escape_menu.xml> <support root> <hash manifest>');
    process.exit(2);
  }

  const packageBytes = fs.readFileSync(pakPath);
  const packageHash = crypto.createHash('sha256').update(packageBytes).digest('hex');
  const packageHud = fs.readFileSync(packageHudPath, 'utf8');
  const packageEscape = fs.readFileSync(packageEscapePath, 'utf8');
  const canonicalEscape = fs.readFileSync(canonicalEscapePath, 'utf8');
  const hud = buildHud(packageHud, packageHash);
  const escapeMenu = buildEscapeMenu(packageEscape, canonicalEscape, packageHash);

  const layoutRoot = path.join(supportRoot, 'panorama', 'layout');
  fs.mkdirSync(layoutRoot, { recursive: true });
  fs.writeFileSync(path.join(layoutRoot, 'hud.xml'), hud, 'utf8');
  fs.writeFileSync(path.join(layoutRoot, 'hud_escape_menu.xml'), escapeMenu, 'utf8');
  fs.writeFileSync(manifestPath, `${packageHash}  ${pakPath.replaceAll('\\', '/')}\n`, 'utf8');
  console.log(`[QOLLOCK REFRESH] Generated compatibility layouts from pak03 ${packageHash}.`);
}

if (require.main === module) main();

module.exports = {
  buildEscapeMenu,
  buildHud,
};
