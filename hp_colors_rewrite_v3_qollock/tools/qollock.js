#!/usr/bin/env node
'use strict';
// QOLLOCK pak02 lane (ticket 22b). QOLLOCK's pak03 owns hud.xml; this pak02 overrides only the
// Escape menu and the topbar, so both are composed from the pinned QOLLOCK layouts plus the exact v3
// pieces the normal menu gets (hp_colors_rewrite_v3/tools/generate.js menuParts). The v3 lane never
// depends on this lane. `qollock.js` writes panorama/layout/*.xml, `--check` fails while they (or the
// v3 generated outputs they consume) are stale. The build re-decompiles the pinned pak03 (--verify).
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const V3_ROOT = path.resolve(ROOT, '../hp_colors_rewrite_v3');
const { lf, refs, repeatedIds, signature: nodeSignature, matchStructure } = require(path.join(V3_ROOT, 'tools/lib/layout-compose'));
const { writeOrCheck: writeLaneOutputs, runLaneCli } = require(path.join(V3_ROOT, 'tools/lib/output'));
const { includeLine, runSteps } = require(path.join(V3_ROOT, 'tools/lib/stock-layouts'));
const { sha256, isHex64, readPinnedTexts } = require(path.join(V3_ROOT, 'tools/lib/pin'));
const PIN = 'vendor/pin.json';
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
  const hex = isHex64;
  if (!pin.release || !pin.zip || !hex(pin.zip.sha256) || !pin.pak03 || !hex(pin.pak03.sha256) || typeof pin.pak03.path !== 'string' ||
      !Array.isArray(pin.files) || pin.files.length !== Object.keys(FILES).length) throw new Error('Invalid QOLLOCK pin manifest: ' + PIN);
  // observed: reviewed QOLLOCK entries (ticket 22b findings); drift fails the build for a re-review.
  if (!Array.isArray(pin.observed) || !pin.observed.length || !Array.isArray(pin.absent) ||
      pin.observed.some(item => typeof item.entry !== 'string' || !/^panorama\/.+\.v(?:xml|css|js)_c$/.test(item.entry) || !hex(item.sha256) || !item.why))
    throw new Error('Invalid QOLLOCK pin observed/absent lists: ' + PIN);
  // LF text hashes: checkout CRLF conversion and Source2Viewer's CRLF output are equivalent.
  const texts = readPinnedTexts(root, pin.files, { sources: FILES, key: 'entry', messages: {
    invalid: file => 'Invalid QOLLOCK pin entry: ' + file.path,
    missing: (file, error) => 'Missing vendored QOLLOCK file: ' + file.path + ' (' + error.code + ')',
    mismatch: (file, actual) => 'QOLLOCK pin mismatch: ' + file.path + ' expected=' + file.sha256 + ' actual=' + actual + '; re-vendor from the pinned pak03, do not edit by hand.',
  } });
  return { pin, menu: texts['vendor/hud_escape_menu.xml'], topbar: texts['vendor/citadel_hud_top_bar.xml'] };
}

// The v3 steps (parts.menuPatches/topbarPatches) fail with the lane's wording: 'QOLLOCK <label> anchor missing or ambiguous'.
const failure = (matches, step) => 'QOLLOCK ' + step.label + ' anchor missing or ambiguous: ' + step.anchor;

// The only pinned attributes the composition rewrites (v3 hooks). They are exempt only when comparing
// pinned to composed; composed to packed compares every attribute.
const HOOKS = { CitadelHudEscapeMenu: ['onload', 'oncancel'], CitadelHudTopBar: ['class'], '#EscapeBackground': ['onactivate'], '#EscapeButton': ['onactivate'] };
function signature(node, pinnedSide, hooks) {
  return nodeSignature(node, HOOKS, hooks, pinnedSide && ((key, value) => key === 'src' ? value.replace(/\.vcss$/, '.vcss_c') : value));
}
// Every pinned node (anonymous panels, classes, attributes, includes) appears in the composed layout
// in the same order, at the same depth and under the counterpart of its pinned parent; v3 nodes may
// only be inserted between them. exact: same node count and every attribute compared (post-pack).
function structure(label, pinned, composed, exact) {
  const counts = matchStructure(pinned, composed, node => signature(node, !exact, !exact), node => signature(node, false, !exact),
    want => 'QOLLOCK ' + label + ' structure lost, reordered or reparented a pinned node: ' + want);
  if (exact && counts.want !== counts.have) throw new Error('QOLLOCK ' + label + ' structure has ' + counts.have + ' nodes, expected ' + counts.want);
}

// Every pinned QOLLOCK include and panel id survives in order with its structure, every v3 id is
// present, and no id repeats.
function guard(label, pinned, composed, required) {
  const have = refs(composed);
  const lost = [...refs(pinned)].map(ref => ref.replace(/\.vcss"$/, '.vcss_c"')).filter(ref => !have.has(ref));
  if (lost.length) throw new Error('QOLLOCK ' + label + ' lost pinned includes/ids: ' + lost.join(', '));
  const missing = required.filter(ref => !have.has(ref));
  if (missing.length) throw new Error('QOLLOCK ' + label + ' is missing v3 entries: ' + missing.join(', '));
  const repeated = repeatedIds(composed);
  if (repeated.length) throw new Error('QOLLOCK ' + label + ' repeats ids: ' + repeated.join(', '));
  structure(label, pinned, composed, false);
}

// parts: menuParts(v3Root, { profile: 'qollock', ... }): the v3 patch steps (menuPatches, topbarPatches) plus the
// include lines and ids the guards require (scripts, ids, topbarScripts).
function compose(pinned, parts) {
  // v3 scripts run after ql_settings; the window bridge wraps both toggles, so it loads last.
  const menu = runSteps(pinned.menu, [...parts.menuPatches, { label: 'menu scripts', anchor: '\t</scripts>', replacement: includeLine(BRIDGE) + '\t</scripts>' }], failure);
  const menuScripts = [...parts.scripts.matchAll(/src="[^"]+"/g)].map(match => match[0]);
  guard('Escape menu', pinned.menu, menu, parts.ids.map(id => 'id="' + id + '"').concat(menuScripts, 'src="s2r://panorama/scripts/' + BRIDGE + '.vjs_c"'));

  const topbar = runSteps(pinned.topbar, parts.topbarPatches, failure);
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
  // QOLLOCK-only: v3's timers also match cards by hero name (Street Brawl hero-titled world bars, ticket 39).
  const parts = require(path.join(v3Root, 'tools/generate.js')).menuParts(v3Root, { profile: 'qollock', topbarClasses: [HERO_NAMES_CLASS] });
  parts.assertFresh();
  return compose(readPin(root), parts);
}
function writeOrCheck(check, root = ROOT, v3Root = V3_ROOT) {
  const files = layouts(root, v3Root);
  writeLaneOutputs(files, root, check, { label: 'QOLLOCK layouts', hint: 'run hp_colors_rewrite_v3_qollock/tools/qollock.js after reviewing the v3 menu change.' });
  return Object.keys(files).length;
}

module.exports = { readPin, compose, guard, structure, layouts, writeOrCheck, verify, verifyInputs, checkPacked, FILES, OUTPUTS, BRIDGE, HERO_NAMES_CLASS, PIN, ROOT, V3_ROOT };
if (require.main === module) {
  runLaneCli(process.argv.slice(2), {
    run: check => 'HPV3 QOLLOCK layouts: ' + writeOrCheck(check) + ' outputs ' + (check ? 'current' : 'written'),
    verbs: {
      '--verify': dir => { const result = verify(dir); return ['HPV3 QOLLOCK pin: ' + result.entries + ' decompiled entries match (' + result.release + ')']; },
      '--verify-inputs': dir => { const result = verifyInputs(dir); return ['HPV3 QOLLOCK input: pak03 verified, zip ' + result.zip + ' (' + result.release + ')', result.pak]; },
      '--check-packed': dir => ['HPV3 QOLLOCK packed: ' + checkPacked(dir) + ' compiled layouts keep every composed include and id'],
    },
    usage: 'Usage: qollock.js [--check] | --verify-inputs <repo-root> | --verify <decompiled-pak03-root> | --check-packed <decompiled-pak02-root>',
  });
}
