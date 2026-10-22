#!/usr/bin/env node
'use strict';
// QOLLOCK pak02 lane (ticket 22b). QOLLOCK's pak03 owns hud.xml; this pak02 overrides only the
// Escape menu and the topbar, so both are composed from the pinned QOLLOCK layouts plus the exact v3
// pieces the normal menu gets (hp_colors_rewrite_v3/tools/generate.js menuParts). The v3 lane never
// depends on this lane. `qollock.js` writes panorama/layout/*.xml, `--check` fails while they (or the
// v3 generated outputs they consume) are stale. The build re-decompiles the pinned pak03 (--verify).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const V3_ROOT = path.resolve(ROOT, '../hp_colors_rewrite_v3');
const PIN = 'vendor/pin.json';
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = text => text.replace(/\r\n/g, '\n');
// Vendored path -> pak03 entry. Exactly these two layouts are composed; nothing else is copied.
const FILES = {
  'vendor/hud_escape_menu.xml': 'panorama/layout/hud_escape_menu.vxml_c',
  'vendor/citadel_hud_top_bar.xml': 'panorama/layout/citadel_hud_top_bar.vxml_c',
};
const BRIDGE = 'hp_colors_v3_qollock_bridge';
const HERO_NAMES_CLASS = 'HPColorsV3TimersHeroNames'; // read by v3's hp_colors_v3_timers_hud.js
const OUTPUTS = { menu: 'panorama/layout/hud_escape_menu.xml', topbar: 'panorama/layout/citadel_hud_top_bar.xml' };

function readPin(root = ROOT) {
  const pin = JSON.parse(fs.readFileSync(path.join(root, PIN), 'utf8'));
  const hex = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  if (!pin.release || !pin.zip || !hex(pin.zip.sha256) || !pin.pak03 || !hex(pin.pak03.sha256) || typeof pin.pak03.path !== 'string' ||
      !Array.isArray(pin.files) || pin.files.length !== Object.keys(FILES).length) throw new Error('Invalid QOLLOCK pin manifest: ' + PIN);
  // observed: reviewed QOLLOCK entries (ticket 22b findings); drift fails the build for a re-review.
  if (!Array.isArray(pin.observed) || !pin.observed.length || !Array.isArray(pin.absent) ||
      pin.observed.some(item => typeof item.entry !== 'string' || !/^panorama\/.+\.v(?:xml|css|js)_c$/.test(item.entry) || !hex(item.sha256) || !item.why))
    throw new Error('Invalid QOLLOCK pin observed/absent lists: ' + PIN);
  const texts = Object.create(null);
  for (const file of pin.files) {
    if (!Object.hasOwn(FILES, file.path) || file.entry !== FILES[file.path] || Object.hasOwn(texts, file.path) || !hex(file.sha256))
      throw new Error('Invalid QOLLOCK pin entry: ' + file.path);
    let bytes;
    try { bytes = fs.readFileSync(path.join(root, file.path)); }
    catch (error) { throw new Error('Missing vendored QOLLOCK file: ' + file.path + ' (' + error.code + ')'); }
    // LF text hashes: checkout CRLF conversion and Source2Viewer's CRLF output are equivalent.
    const text = lf(bytes.toString('utf8'));
    const actual = sha256(Buffer.from(text, 'utf8'));
    if (actual !== file.sha256) throw new Error('QOLLOCK pin mismatch: ' + file.path + ' expected=' + file.sha256 + ' actual=' + actual + '; re-vendor from the pinned pak03, do not edit by hand.');
    texts[file.path] = text;
  }
  return { pin, menu: texts['vendor/hud_escape_menu.xml'], topbar: texts['vendor/citadel_hud_top_bar.xml'] };
}

function patch(text, anchor, replacement, label) {
  if (text.split(anchor).length !== 2) throw new Error('QOLLOCK ' + label + ' anchor missing or ambiguous: ' + anchor);
  return text.replace(anchor, () => replacement);
}
const ids = text => [...text.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const refs = text => new Set([...text.matchAll(/\s(?:src|id)="[^"]+"/g)].map(match => match[0].trim()));

// Preorder node list: depth, parent index (-1 at the top), tag and attributes (entities decoded,
// comments dropped).
function nodes(text) {
  const list = [], open = [];
  for (const match of text.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<([^>]+)>/g)) {
    const token = match[1];
    if (token.startsWith('?')) continue;
    if (token.startsWith('/')) { open.pop(); continue; }
    const attrs = {};
    for (const attr of token.matchAll(/([\w-]+)="([^"]*)"/g))
      attrs[attr[1]] = attr[2].replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    list.push({ depth: open.length, parent: open.length ? open[open.length - 1] : -1, tag: token.match(/^\S+/)[0].replace(/\/$/, ''), attrs });
    if (!token.endsWith('/')) open.push(list.length - 1);
  }
  return list;
}
// The only pinned attributes the composition rewrites (v3 hooks). They are exempt only when comparing
// pinned to composed; composed to packed compares every attribute.
const HOOKS = { CitadelHudEscapeMenu: ['onload', 'oncancel'], CitadelHudTopBar: ['class'], '#EscapeBackground': ['onactivate'], '#EscapeButton': ['onactivate'] };
function signature(node, pinnedSide, hooks) {
  const skip = hooks ? (HOOKS[node.tag] || []).concat(HOOKS['#' + node.attrs.id] || []) : [];
  const attrs = Object.keys(node.attrs).filter(key => !skip.includes(key)).sort()
    .map(key => key + '=' + (pinnedSide && key === 'src' ? node.attrs[key].replace(/\.vcss$/, '.vcss_c') : node.attrs[key]));
  return node.depth + ' <' + node.tag + ' ' + attrs.join(' ') + '>';
}
// Every pinned node (anonymous panels, classes, attributes, includes) appears in the composed layout
// in the same order, at the same depth and under the counterpart of its pinned parent; v3 nodes may
// only be inserted between them. exact: same node count and every attribute compared (post-pack).
function structure(label, pinned, composed, exact) {
  const wantNodes = nodes(pinned), haveNodes = nodes(composed);
  const want = wantNodes.map(node => signature(node, !exact, !exact)), have = haveNodes.map(node => signature(node, false, !exact));
  const matched = [];
  let at = 0;
  for (let i = 0; i < want.length; i++) {
    const parent = wantNodes[i].parent === -1 ? -1 : matched[wantNodes[i].parent];
    while (at < have.length && (have[at] !== want[i] || haveNodes[at].parent !== parent)) at++;
    if (at === have.length) throw new Error('QOLLOCK ' + label + ' structure lost, reordered or reparented a pinned node: ' + want[i]);
    matched.push(at++);
  }
  if (exact && want.length !== have.length) throw new Error('QOLLOCK ' + label + ' structure has ' + have.length + ' nodes, expected ' + want.length);
}

// Every pinned QOLLOCK include and panel id survives in order with its structure, every v3 id is
// present, and no id repeats.
function guard(label, pinned, composed, required) {
  const have = refs(composed);
  const lost = [...refs(pinned)].map(ref => ref.replace(/\.vcss"$/, '.vcss_c"')).filter(ref => !have.has(ref));
  if (lost.length) throw new Error('QOLLOCK ' + label + ' lost pinned includes/ids: ' + lost.join(', '));
  const missing = required.filter(ref => !have.has(ref));
  if (missing.length) throw new Error('QOLLOCK ' + label + ' is missing v3 entries: ' + missing.join(', '));
  const seen = new Set(), repeated = new Set();
  for (const id of ids(composed)) (seen.has(id) ? repeated : seen).add(id);
  if (repeated.size) throw new Error('QOLLOCK ' + label + ' repeats ids: ' + [...repeated].join(', '));
  structure(label, pinned, composed, false);
}

// parts: { resume, styles, scripts (menu include lines), button, fragment, ids, topbarScripts, topbarClass }
function compose(pinned, parts) {
  const include = name => '\t\t<include src="s2r://panorama/scripts/' + name + '.vjs_c" />\n';
  let menu = pinned.menu;
  menu = patch(menu, '\t</styles>', parts.styles + '\t</styles>', 'menu styles');
  // v3 scripts run after ql_settings; the window bridge wraps both toggles, so it loads last.
  menu = patch(menu, '\t</scripts>', parts.scripts + include(BRIDGE) + '\t</scripts>', 'menu scripts');
  menu = patch(menu, '<CitadelHudEscapeMenu oncancel="CitadelResumePlaying()">',
    '<CitadelHudEscapeMenu onload="$.HPColorsMenuBoot()" oncancel="' + parts.resume + '">', 'menu root');
  // QOLLOCK closes its own window first; otherwise the background runs v3's close-then-resume.
  menu = patch(menu, '{ $.ForceCloseModSettings(true); } else { CitadelResumePlaying(); }" />',
    '{ $.ForceCloseModSettings(true); } else { ' + parts.resume + '; }" />', 'menu background');
  menu = patch(menu, 'id="EscapeButton" action="MenuBack" onactivate="CitadelResumePlaying()"',
    'id="EscapeButton" action="MenuBack" onactivate="' + parts.resume + '"', 'menu resume button');
  // Nav order: QOL LOCK, HP COLORS, stock settings.
  menu = patch(menu, '<Panel class="SettingsRow">\n\t\t\t\t\t\t<Button id="settings"',
    parts.button + '<Panel class="SettingsRow">\n\t\t\t\t\t\t<Button id="settings"', 'menu button');
  menu = patch(menu, '</CitadelHudEscapeMenu>', parts.fragment + '\t</CitadelHudEscapeMenu>', 'menu fragment');
  const menuScripts = [...parts.scripts.matchAll(/src="[^"]+"/g)].map(match => match[0]);
  guard('Escape menu', pinned.menu, menu, parts.ids.map(id => 'id="' + id + '"').concat(menuScripts, 'src="s2r://panorama/scripts/' + BRIDGE + '.vjs_c"'));

  let topbar = pinned.topbar;
  for (const sheet of ['citadel_base_styles', 'hud_common', 'citadel_hud_top_bar', 'unit_status_icons'])
    topbar = patch(topbar, sheet + '.vcss"', sheet + '.vcss_c"', 'topbar styles');
  topbar = patch(topbar, '\t<scripts />', '\t<scripts>\n' + parts.topbarScripts.map(include).join('') + '\t</scripts>', 'topbar scripts');
  // QOLLOCK-only: v3's timers also match cards by hero name (Street Brawl hero-titled world bars, ticket 39).
  topbar = patch(topbar, '<CitadelHudTopBar hittest="false">', '<CitadelHudTopBar class="' + parts.topbarClass + ' ' + HERO_NAMES_CLASS + '" hittest="false">', 'topbar root');
  guard('topbar', pinned.topbar, topbar, parts.topbarScripts.map(name => 'src="s2r://panorama/scripts/' + name + '.vjs_c"'));
  return { [OUTPUTS.menu]: menu, [OUTPUTS.topbar]: topbar };
}

const decompiledPath = (root, entry) => path.join(root, entry.replace(/\.v(xml|css|js)_c$/, '.$1'));
// Build-time check: a fresh decompile of the pinned pak03 still has the vendored layouts, the reviewed
// (observed) entries and no world unit-status layout.
function verify(decompiled, root = ROOT) {
  const { pin } = readPin(root);
  const entries = pin.files.map(file => ({ entry: file.entry, sha256: file.sha256, label: file.path })).concat(pin.observed.map(item => ({ ...item, label: 'observed' })));
  for (const item of entries) {
    const target = decompiledPath(decompiled, item.entry);
    if (!fs.existsSync(target)) throw new Error('QOLLOCK decompile is missing ' + item.entry);
    const actual = sha256(Buffer.from(lf(fs.readFileSync(target, 'utf8')), 'utf8'));
    if (actual !== item.sha256) throw new Error('Pinned pak03 ' + item.entry + ' decompiles to ' + actual + ', pinned ' + item.label + ' is ' + item.sha256 + '; re-review ticket 22b findings before re-pinning.');
  }
  for (const entry of pin.absent) if (fs.existsSync(decompiledPath(decompiled, entry))) throw new Error('Pinned pak03 now ships ' + entry + '; re-review ticket 22b findings.');
  return { entries: entries.length, release: pin.release };
}

// Build-time input check: the pinned pak03 must exist with its hash; the release zip is checked when present.
function verifyInputs(repoRoot, root = ROOT) {
  const { pin } = readPin(root);
  const fileHash = file => sha256(fs.readFileSync(file));
  const pak = path.resolve(repoRoot, pin.pak03.path);
  if (!fs.existsSync(pak)) throw new Error('Pinned QOLLOCK pak03 not found: ' + pak + ' (extract pak03_dir.vpk from ' + pin.zip.name + ')');
  const actual = fileHash(pak);
  if (actual !== pin.pak03.sha256) throw new Error('Pinned QOLLOCK pak03 drifted: expected=' + pin.pak03.sha256 + ' actual=' + actual + ' (' + pak + ')');
  let zip = 'absent';
  if (fs.existsSync(pin.zip.source)) {
    const zipHash = fileHash(pin.zip.source);
    if (zipHash !== pin.zip.sha256) throw new Error('Pinned QOLLOCK zip drifted: expected=' + pin.zip.sha256 + ' actual=' + zipHash + ' (' + pin.zip.source + ')');
    zip = 'verified';
  }
  return { pak, zip, release: pin.release };
}

// Post-pack check: the compiled QOLLOCK layouts, decompiled from the built VPK, keep every include
// and id of the composed sources and the same node structure, node for node (the compiler drops nothing).
function checkPacked(decompiled, root = ROOT) {
  for (const relative of Object.values(OUTPUTS)) {
    const target = path.join(decompiled, relative);
    if (!fs.existsSync(target)) throw new Error('Packed QOLLOCK layout missing: ' + relative);
    const packed = fs.readFileSync(target, 'utf8'), source = fs.readFileSync(path.join(root, relative), 'utf8');
    const have = refs(packed);
    const lost = [...refs(source)].filter(ref => !have.has(ref));
    if (lost.length) throw new Error('Packed ' + relative + ' lost: ' + lost.join(', '));
    structure('packed ' + relative, source, packed, true);
  }
  return Object.keys(OUTPUTS).length;
}

// Composes the lane outputs from the pinned layouts and the v3 lane's own generated pieces. A v3
// checkout whose generated menu is stale is refused: the lane consumes v3's committed outputs.
function layouts(root = ROOT, v3Root = V3_ROOT) {
  const parts = require(path.join(v3Root, 'tools/generate.js')).menuParts(v3Root);
  const stale = ['generated/menu-rows.xml', 'generated/ids.json', 'panorama/layout/hud_escape_menu.xml', 'panorama/layout/citadel_hud_top_bar.xml']
    .filter(relative => { const file = path.join(v3Root, relative); return !fs.existsSync(file) || lf(fs.readFileSync(file, 'utf8')) !== lf(parts.files[relative]); });
  if (stale.length) throw new Error('hp_colors_rewrite_v3 generated outputs are stale (' + stale.join(', ') + '); run hp_colors_rewrite_v3/tools/generate.js first.');
  return compose(readPin(root), parts);
}
function writeOrCheck(check, root = ROOT, v3Root = V3_ROOT) {
  const files = layouts(root, v3Root), stale = [];
  for (const [relative, text] of Object.entries(files)) {
    const target = path.join(root, relative);
    if (check) { if (!fs.existsSync(target) || lf(fs.readFileSync(target, 'utf8')) !== lf(text)) stale.push(relative); }
    else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text, 'utf8'); }
  }
  if (stale.length) throw new Error('Stale QOLLOCK layouts: ' + stale.join(', ') + '; run hp_colors_rewrite_v3_qollock/tools/qollock.js after reviewing the v3 menu change.');
  return Object.keys(files).length;
}

module.exports = { readPin, compose, guard, structure, layouts, writeOrCheck, verify, verifyInputs, checkPacked, FILES, OUTPUTS, BRIDGE, HERO_NAMES_CLASS, PIN, ROOT, V3_ROOT };
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0 || (args[0] === '--check' && args.length === 1)) {
      const count = writeOrCheck(args[0] === '--check');
      console.log('HPV3 QOLLOCK layouts: ' + count + ' outputs ' + (args[0] === '--check' ? 'current' : 'written'));
    } else if (args[0] === '--verify' && args[1] && args.length === 2) {
      const result = verify(path.resolve(args[1]));
      console.log('HPV3 QOLLOCK pin: ' + result.entries + ' decompiled entries match (' + result.release + ')');
    } else if (args[0] === '--verify-inputs' && args[1] && args.length === 2) {
      const result = verifyInputs(path.resolve(args[1]));
      console.log('HPV3 QOLLOCK input: pak03 verified, zip ' + result.zip + ' (' + result.release + ')');
      console.log(result.pak);
    } else if (args[0] === '--check-packed' && args[1] && args.length === 2) {
      console.log('HPV3 QOLLOCK packed: ' + checkPacked(path.resolve(args[1])) + ' compiled layouts keep every composed include and id');
    } else throw new Error('Usage: qollock.js [--check] | --verify-inputs <repo-root> | --verify <decompiled-pak03-root> | --check-packed <decompiled-pak02-root>');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
