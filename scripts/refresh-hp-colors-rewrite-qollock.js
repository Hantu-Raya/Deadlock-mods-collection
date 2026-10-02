'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function fail(message) {
  throw new Error(message);
}

function replaceOnce(text, pattern, replacement, label) {
  const matches = text.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`));
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
  return replaceOnce(tag, /\s*(\/?)>$/, (_, slash) => ` ${name}="${value}"${slash ? ' />' : '>'}`, label);
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

function buildEscapeMenu(sourceXml, canonicalXml, packageHash, sourceLabel = 'pak03') {
  const isV2 = canonicalXml.includes('hp_colors_v2_contract.vjs_c');
  const styleAsset = isV2
    ? 'hp_colors_v2_menu.vcss_c'
    : 'hp_colors_menu.vcss_c';
  const scriptAssets = isV2
    ? [
      'hp_colors_v2_contract.vjs_c',
      'hp_colors_v2_state.vjs_c',
      'hp_colors_v2_storage.vjs_c',
      'hp_colors_v2_menu.vjs_c',
    ]
    : [
      'hp_colors_contract.vjs_c',
      'hp_colors_state.vjs_c',
      'hp_colors_menu.vjs_c',
    ];
  // v1 keeps its read-only builder preset store; v2 replaced it with the
  // durable storage panel.
  const storePanelId = isV2 ? 'HPColorsV2StoreWrap' : 'HPColorsRewritePresetStore';
  for (const id of [
    'HPColorsMenuButton',
    'HPColorsEditorRoot',
    'HPColorsSupporterTicker',
    'HPColorsAllyTeamHighToggle',
    storePanelId,
  ]) {
    requireMatchCount(
      sourceXml,
      new RegExp(`id="${id}"`, 'g'),
      0,
      `${sourceLabel} Escape-menu pre-existing ${id}`,
    );
  }
  requireMatchCount(
    sourceXml,
    /s2r:\/\/panorama\/(?:scripts|styles)\/(?:hp_colors_|qollock_(?:settings|hp_colors)_guard)[^"]*\.(?:vjs|vcss)_c/g,
    0,
    `${sourceLabel} Escape-menu pre-existing compatibility includes`,
  );
  requireMatchCount(
    sourceXml,
    /id="ModSettingsBtn"/g,
    1,
    `${sourceLabel} QOLLOCK settings button`,
  );
  let xml = sourceXml;
  const hpButton = extractElementById(canonicalXml, 'Button', 'HPColorsMenuButton');
  const hpEditor = extractElementById(canonicalXml, 'Panel', 'HPColorsEditorRoot');
  xml = insertAfter(
    xml,
    /^\s*<include src="s2r:\/\/panorama\/styles\/ql_settings\.vcss_c" \/>/m,
    `\n\t\t<include src="s2r://panorama/styles/${styleAsset}" />`,
    'Escape-menu style anchor',
  );
  if (isV2) {
    const nativePickerStyle = 's2r://panorama/styles/citadel_ui_color_picker.vcss_c';
    if (!sourceXml.includes(nativePickerStyle)) {
      xml = insertAfter(
        xml,
        /^\s*<include src="s2r:\/\/panorama\/styles\/hp_colors_v2_menu\.vcss_c" \/>/m,
        `\n\t\t<include src="${nativePickerStyle}" />`,
        'native picker style anchor',
      );
    }
    requireMatchCount(xml, /s2r:\/\/panorama\/styles\/citadel_ui_color_picker\.vcss_c/g, 1, 'native picker stylesheet');
  }
  const hpStorePanel = extractElementById(canonicalXml, 'Panel', storePanelId);
  const scriptIncludes = scriptAssets
    .concat('qollock_hp_colors_bridge.vjs_c')
    .map((asset) => `\t\t<include src="s2r://panorama/scripts/${asset}" />`);
  xml = insertAfter(
    xml,
    /^\s*<include src="s2r:\/\/panorama\/scripts\/ql_settings\.vjs_c" \/>/m,
    `\n${scriptIncludes.join('\n')}`,
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
  if (isV2) {
    // Keep QOLLOCK's handlers behind HP editor cancellation. Since 4.0.3,
    // Resume is the binding alone; 4.0.1 also wraps it in a Button.
    for (const [pattern, label] of [
      ...(/<Button id="EscapeButton"[^>]*>/.test(xml)
        ? [[/<Button id="EscapeButton"[^>]*>/, 'Escape resume button']]
        : []),
      [/<Button id="CloseBtn"[^>]*>/, 'QOLLOCK close button'],
      [/<CitadelBindingButton id="EscapeButton"[^>]*>/, 'Escape resume binding'],
    ]) {
      xml = replaceOnce(xml, pattern, (tag) => prefixHandler(
        tag,
        'onactivate',
        'if ($.HPColorsMenuCancel &amp;&amp; $.HPColorsMenuCancel()) {} else ',
        label,
      ), label);
    }
  }
  if (isV2) {
    // Stock #SubOptions is bottom-anchored and grows upward 32px per row; the
    // QOLLOCK and HP rows push it into the primaries, so lift them 64px from
    // QOLLOCK's hud_escape_menu.css (490/420/350 in 4.0.0) and stock #changehero (280).
    for (const [id, marginBottom] of [['newgame', 554], ['watchgame', 484], ['guides', 414], ['changehero', 344]]) {
      xml = replaceOnce(
        xml,
        new RegExp(`<Button id="${id}"[^>]*>`),
        (tag) => setAttribute(tag, 'style', `margin-bottom: ${marginBottom}px;`, id),
        `${sourceLabel} ${id} lift`,
      );
    }
  }
  xml = replaceOnce(
    xml,
    /\s*<\/CitadelHudEscapeMenu>/,
    `\n${hpEditor}\n${hpStorePanel}\n\t</CitadelHudEscapeMenu>`,
    'Escape-menu editor insertion',
  );
  for (const id of [
    'HPColorsMenuButton',
    'HPColorsEditorRoot',
    'HPColorsSupporterTicker',
    'HPColorsAllyTeamHighToggle',
    storePanelId,
  ]) {
    requireMatchCount(
      xml,
      new RegExp(`id="${id}"`, 'g'),
      1,
      `generated Escape-menu ${id}`,
    );
  }
  for (const asset of [
    styleAsset,
    ...scriptAssets,
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
    `<!-- Generated from ${sourceLabel} SHA-256 ${packageHash} by refresh-hp-colors-rewrite-qollock.js -->`,
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
    console.error('Usage: node scripts/refresh-hp-colors-rewrite-qollock.js <qollock pakNN_dir.vpk> <decompiled hud.xml | -> <decompiled hud_escape_menu.xml> <canonical hud_escape_menu.xml> <support root> <hash manifest>');
    process.exit(2);
  }

  const packageBytes = fs.readFileSync(pakPath);
  const packageHash = crypto.createHash('sha256').update(packageBytes).digest('hex');
  const sourceLabel = path.basename(pakPath).replace(/_dir\.vpk$/i, '');
  const packageEscape = fs.readFileSync(packageEscapePath, 'utf8');
  const canonicalEscape = fs.readFileSync(canonicalEscapePath, 'utf8');
  // '-' skips the HUD: Rewrite v2 leaves QOLLOCK's own hud.xml in charge.
  const hud = packageHudPath === '-' ? null : buildHud(fs.readFileSync(packageHudPath, 'utf8'), packageHash);
  const escapeMenu = buildEscapeMenu(packageEscape, canonicalEscape, packageHash, sourceLabel);

  const layoutRoot = path.join(supportRoot, 'panorama', 'layout');
  fs.mkdirSync(layoutRoot, { recursive: true });
  if (hud !== null) fs.writeFileSync(path.join(layoutRoot, 'hud.xml'), hud, 'utf8');
  fs.writeFileSync(path.join(layoutRoot, 'hud_escape_menu.xml'), escapeMenu, 'utf8');
  fs.writeFileSync(manifestPath, `${packageHash}  ${pakPath.replaceAll('\\', '/')}\n`, 'utf8');
  console.log(`[QOLLOCK REFRESH] Generated compatibility layouts from ${sourceLabel} ${packageHash}.`);
}

if (require.main === module) main();

module.exports = {
  buildEscapeMenu,
  buildHud,
};
