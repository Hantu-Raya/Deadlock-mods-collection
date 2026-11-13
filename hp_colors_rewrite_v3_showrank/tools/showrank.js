#!/usr/bin/env node
'use strict';
// ShowRank barebones pak02 lane (SPEC story 52, PLAN step 8). ShowRank installs as pak89 and its runtime,
// stylesheets and other layouts have no v3 collision; v3's pak02 (lower number, wins) overrides exactly two
// layouts ShowRank also overrides: the Escape menu and the topbar. This lane takes v3's generated layouts
// as the base and injects the ShowRank pieces, read from the ShowRank sources, by element id and include
// src. Handlers are chained (v3 first, ShowRank's guarded call after) so v3's cancel-before-resume and
// boot stay intact. `showrank.js` writes panorama/layout/*.xml, `--check` fails while they are stale
// against the v3 layouts or the ShowRank sources. The v3 lane never depends on this lane.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const V3_ROOT = path.resolve(ROOT, '../hp_colors_rewrite_v3');
const { LANES } = require(path.join(V3_ROOT, 'tools/lib/projects'));
const SHOWRANK_ROOT = path.resolve(ROOT, '..', LANES.showrank.inputDirs[0]);
const { lf, countOf, patchOnce, refs, repeatedIds, signature: nodeSignature, matchStructure } = require(path.join(V3_ROOT, 'tools/lib/layout-compose'));
const { writeOrCheck: writeLaneOutputs, runLaneCli } = require(path.join(V3_ROOT, 'tools/lib/output'));
const MENU = 'panorama/layout/hud_escape_menu.xml', TOPBAR = 'panorama/layout/citadel_hud_top_bar.xml';
const OUTPUTS = { menu: MENU, topbar: TOPBAR };
const SCRIPT = 's2r://panorama/scripts/showrank_barebones.vjs_c';
const PIECES = {
  menuRoot: 'CitadelHudEscapeMenu',
  handlers: ['onload', 'onmouseover', 'onmouseout'],
  bridgeId: 'ShowRankBarebonesPartyBridge',
  topbarStyles: ['citadel_hud_game_announcements', 'showrank_barebones_topbar'],
  notificationId: 'ShowRankBarebonesNotificationRoot',
  averageId: 'ShowRankBarebonesTeamAverageLayer',
  // Anchors in the stock topbar (the same stock layout tools/lib/stock-layouts.js patches); ShowRank is an unpinned live
  // dependency guarded by these anchors, so drift fails closed in readPieces/compose.
  notificationAnchor: '\t\t<Panel id="GradientBacker" />\n',
  averageAnchor: '\t\t<Panel id="StretBrawlContainer">\n',
};

// Exactly one occurrence, or a named failure (missing anchor, ambiguous anchor, drifted layout).
function patch(text, anchor, replacement, label) {
  return patchOnce(text, anchor, replacement, () => 'ShowRank ' + label + ' anchor missing or ambiguous: ' + anchor.trim());
}
function once(text, pattern, label) {
  const found = text.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')) || [];
  if (found.length !== 1) throw new Error('ShowRank layout lacks its ' + label + ' (' + found.length + ' matches)');
  return found[0];
}
function section(text, tag, label) {
  const match = text.match(new RegExp('^\\t<' + tag + '>\\n([\\s\\S]*?)^\\t</' + tag + '>\\n', 'm'));
  if (!match) throw new Error('ShowRank layout lacks its ' + label);
  return match[1];
}
function attrOf(tag, name) {
  const match = tag.match(new RegExp('\\s' + name + '="([^"]*)"'));
  return match ? match[1] : null;
}
// The block of one element starting at its opening line: a self-closing line, or through the closing tag
// at the same indent.
function block(text, id, label) {
  const start = once(text, new RegExp('^(\\t+)<\\w+ id="' + id + '"[^\\n]*\\n', 'm'), label);
  const at = text.indexOf(start), indent = start.match(/^\t+/)[0];
  if (/\/>\n$/.test(start)) return { text: start, before: text.slice(0, at), after: text.slice(at + start.length) };
  const close = text.indexOf('\n' + indent + '</', at + start.length - 1);
  const end = close < 0 ? -1 : text.indexOf('\n', close + 1);
  if (end < 0) throw new Error('ShowRank layout has an unterminated ' + label);
  return { text: text.slice(at, end + 1), before: text.slice(0, at), after: text.slice(end + 1) };
}

// The ShowRank pieces, read from its own layouts. Throws when an expected piece is missing or has drifted
// from the structural spot this lane injects it at.
function readPieces(srMenu, srTopbar) {
  srMenu = lf(srMenu); srTopbar = lf(srTopbar);
  const scripts = [...section(srMenu, 'scripts', 'script includes').matchAll(/^\t\t<include src="[^"]+" \/>\n/gm)].map(match => match[0]);
  if (!scripts.some(line => line.includes(SCRIPT))) throw new Error('ShowRank Escape layout lacks its script include ' + SCRIPT);
  const root = once(srMenu, new RegExp('<' + PIECES.menuRoot + '\\b[^>]*>'), 'Escape root');
  const handlers = {};
  for (const name of PIECES.handlers) {
    handlers[name] = attrOf(root, name);
    if (handlers[name] === null || !handlers[name].includes('ShowRankBarebones')) throw new Error('ShowRank Escape root lacks its ' + name + ' handler');
  }
  const bridge = block(srMenu, PIECES.bridgeId, 'party bridge');
  if (!bridge.after.startsWith('\t</' + PIECES.menuRoot + '>')) throw new Error('ShowRank party bridge is no longer the last Escape child; review where the lane injects it');

  const sheets = section(srTopbar, 'styles', 'topbar style includes');
  const styles = PIECES.topbarStyles.map(name => {
    const line = '\t\t<include src="s2r://panorama/styles/' + name + '.vcss_c" />\n';
    if (!sheets.includes(line)) throw new Error('ShowRank topbar layout lacks its style include ' + name);
    return line;
  });
  // ShowRank's no-missing edition wraps optional pieces in `<!-- [no-missing: cut …] -->` comment lines
  // (2026-10-20); a comment line between a piece and its anchor does not move the piece.
  const skipComments = text => text.replace(/^(\t*<!--[^\n]*-->\n)+/, '');
  const notification = block(srTopbar, PIECES.notificationId, 'notification root');
  if (!skipComments(notification.after).startsWith(PIECES.notificationAnchor)) throw new Error('ShowRank notification root no longer precedes GradientBacker; review where the lane injects it');
  const average = block(srTopbar, PIECES.averageId, 'team-average layer');
  if (!skipComments(average.after).startsWith(PIECES.averageAnchor)) throw new Error('ShowRank team-average layer no longer precedes StretBrawlContainer; review where the lane injects it');
  return { scripts, handlers, bridge: bridge.text, styles, notification: notification.text, average: average.text };
}

// v3 handler first (its cancel-before-resume and boot stay intact), ShowRank's guarded call after.
const chain = (v3, showrank) => v3 === null ? showrank : v3.replace(/[\s;]+$/, '') + '; ' + showrank;
function setAttr(tag, name, value) {
  const attr = ' ' + name + '="' + value + '"';
  return new RegExp('\\s' + name + '="[^"]*"').test(tag) ? tag.replace(new RegExp('\\s' + name + '="[^"]*"'), () => attr) : tag.replace(/>$/, () => attr + '>');
}

// Attributes v3 owns and the composition rewrites: exempt only when comparing the ShowRank source to the result.
const HOOKS = { CitadelHudEscapeMenu: ['onload', 'oncancel', 'onmouseover', 'onmouseout'], CitadelHudTopBar: ['class'], '#EscapeBackground': ['onactivate'], '#EscapeButton': ['onactivate'] };
function signature(node) { return nodeSignature(node, HOOKS, true); }
// Every ShowRank node appears in the composed layout in order, at the same depth and under the
// counterpart of its parent; v3 nodes may only sit between them.
function structure(label, showrank, composed) {
  matchStructure(showrank, composed, signature, signature,
    want => 'ShowRank ' + label + ' structure lost, reordered or reparented a ShowRank node: ' + want);
}

// Every v3 include/id survives, every ShowRank piece appears exactly once, and no id repeats.
function guard(label, v3, composed, pieces) {
  const have = refs(composed);
  const lost = [...refs(v3)].filter(ref => !have.has(ref));
  if (lost.length) throw new Error('ShowRank ' + label + ' lost v3 includes/ids: ' + lost.join(', '));
  const repeated = repeatedIds(composed);
  if (repeated.length) throw new Error('ShowRank ' + label + ' repeats ids: ' + repeated.join(', '));
  for (const piece of pieces) {
    const found = countOf(composed, piece);
    if (found !== 1) throw new Error('ShowRank ' + label + ' has ' + found + ' copies of ' + piece.trim().split('\n')[0] + ', expected 1');
  }
}

// v3: { menu, topbar } generated layouts; showrank: { menu, topbar } ShowRank layouts.
function compose(v3, showrank) {
  const pieces = readPieces(showrank.menu, showrank.topbar);
  let menu = lf(v3.menu);
  menu = patch(menu, '\t</scripts>\n', pieces.scripts.join('') + '\t</scripts>\n', 'menu scripts');
  const root = once(menu, new RegExp('<' + PIECES.menuRoot + '\\b[^>]*>'), 'v3 Escape root');
  let rewritten = root;
  for (const name of PIECES.handlers) rewritten = setAttr(rewritten, name, chain(attrOf(root, name), pieces.handlers[name]));
  menu = patch(menu, root, rewritten, 'menu root');
  menu = patch(menu, '\t</' + PIECES.menuRoot + '>\n', pieces.bridge + '\t</' + PIECES.menuRoot + '>\n', 'menu bridge');
  guard('Escape menu', lf(v3.menu), menu, [...pieces.scripts, pieces.bridge]);
  structure('Escape menu', lf(showrank.menu), menu);

  let topbar = lf(v3.topbar);
  topbar = patch(topbar, '\t</styles>\n', pieces.styles.join('') + '\t</styles>\n', 'topbar styles');
  topbar = patch(topbar, PIECES.notificationAnchor, pieces.notification + PIECES.notificationAnchor, 'topbar notification');
  topbar = patch(topbar, PIECES.averageAnchor, pieces.average + PIECES.averageAnchor, 'topbar team-average');
  guard('topbar', lf(v3.topbar), topbar, [...pieces.styles, pieces.notification, pieces.average]);
  structure('topbar', lf(showrank.topbar), topbar);
  return { [MENU]: menu, [TOPBAR]: topbar };
}

const read = file => {
  if (!fs.existsSync(file)) throw new Error('ShowRank lane input missing: ' + file);
  return lf(fs.readFileSync(file, 'utf8'));
};
function layouts(v3Root = V3_ROOT, showrankRoot = SHOWRANK_ROOT) {
  return compose(
    { menu: read(path.join(v3Root, MENU)), topbar: read(path.join(v3Root, TOPBAR)) },
    { menu: read(path.join(showrankRoot, 'panorama/layout/hud_escape_menu.xml')), topbar: read(path.join(showrankRoot, 'panorama/layout/citadel_hud_top_bar.xml')) });
}
function writeOrCheck(check, root = ROOT, v3Root = V3_ROOT, showrankRoot = SHOWRANK_ROOT) {
  // The composed layouts are only current against v3's committed outputs when those are current too.
  if (check) require(path.join(v3Root, 'tools/generate.js')).menuParts(v3Root).assertFresh();
  const files = layouts(v3Root, showrankRoot);
  writeLaneOutputs(files, root, check, { label: 'ShowRank layouts', hint: 'run hp_colors_rewrite_v3_showrank/tools/showrank.js after reviewing the v3 menu or ShowRank layout change.' });
  return Object.keys(files).length;
}

module.exports = { readPieces, compose, guard, structure, layouts, writeOrCheck, chain, OUTPUTS, SCRIPT, PIECES, ROOT, V3_ROOT, SHOWRANK_ROOT };
if (require.main === module) {
  runLaneCli(process.argv.slice(2), {
    run: check => 'HPV3 ShowRank layouts: ' + writeOrCheck(check) + ' outputs ' + (check ? 'current' : 'written'),
    usage: 'Usage: showrank.js [--check]',
  });
}
