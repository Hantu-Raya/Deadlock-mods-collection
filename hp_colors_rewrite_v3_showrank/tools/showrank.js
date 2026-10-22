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
const SHOWRANK_ROOT = path.resolve(ROOT, '../showrank_barebones');
const lf = text => text.replace(/\r\n/g, '\n');
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
  notificationAnchor: '\t\t<Panel id="GradientBacker" />\n',
  averageAnchor: '\t\t<Panel id="StretBrawlContainer">\n',
};
const ids = text => [...text.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const refs = text => new Set([...text.matchAll(/\s(?:src|id)="[^"]+"/g)].map(match => match[0].trim()));
const countOf = (text, part) => text.split(part).length - 1;

// Exactly one occurrence, or a named failure (missing anchor, ambiguous anchor, drifted layout).
function patch(text, anchor, replacement, label) {
  if (countOf(text, anchor) !== 1) throw new Error('ShowRank ' + label + ' anchor missing or ambiguous: ' + anchor.trim());
  return text.replace(anchor, () => replacement);
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

// Preorder node list: depth, parent index, tag and attributes (entities decoded, comments dropped).
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
// Attributes v3 owns and the composition rewrites: exempt only when comparing the ShowRank source to the result.
const HOOKS = { CitadelHudEscapeMenu: ['onload', 'oncancel', 'onmouseover', 'onmouseout'], CitadelHudTopBar: ['class'], '#EscapeBackground': ['onactivate'], '#EscapeButton': ['onactivate'] };
function signature(node, exempt) {
  const skip = exempt ? (HOOKS[node.tag] || []).concat(HOOKS['#' + node.attrs.id] || []) : [];
  const attrs = Object.keys(node.attrs).filter(key => !skip.includes(key)).sort().map(key => key + '=' + node.attrs[key]);
  return node.depth + ' <' + node.tag + ' ' + attrs.join(' ') + '>';
}
// Every ShowRank node appears in the composed layout in order, at the same depth and under the
// counterpart of its parent; v3 nodes may only sit between them.
function structure(label, showrank, composed) {
  const wantNodes = nodes(showrank), haveNodes = nodes(composed);
  const want = wantNodes.map(node => signature(node, true)), have = haveNodes.map(node => signature(node, true));
  const matched = [];
  let at = 0;
  for (let i = 0; i < want.length; i++) {
    const parent = wantNodes[i].parent === -1 ? -1 : matched[wantNodes[i].parent];
    while (at < have.length && (have[at] !== want[i] || haveNodes[at].parent !== parent)) at++;
    if (at === have.length) throw new Error('ShowRank ' + label + ' structure lost, reordered or reparented a ShowRank node: ' + want[i]);
    matched.push(at++);
  }
}

// Every v3 include/id survives, every ShowRank piece appears exactly once, and no id repeats.
function guard(label, v3, composed, pieces) {
  const have = refs(composed);
  const lost = [...refs(v3)].filter(ref => !have.has(ref));
  if (lost.length) throw new Error('ShowRank ' + label + ' lost v3 includes/ids: ' + lost.join(', '));
  const seen = new Set(), repeated = new Set();
  for (const id of ids(composed)) (seen.has(id) ? repeated : seen).add(id);
  if (repeated.size) throw new Error('ShowRank ' + label + ' repeats ids: ' + [...repeated].join(', '));
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
  const files = layouts(v3Root, showrankRoot), stale = [];
  for (const [relative, text] of Object.entries(files)) {
    const target = path.join(root, relative);
    if (check) { if (!fs.existsSync(target) || lf(fs.readFileSync(target, 'utf8')) !== text) stale.push(relative); }
    else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text, 'utf8'); }
  }
  if (stale.length) throw new Error('Stale ShowRank layouts: ' + stale.join(', ') + '; run hp_colors_rewrite_v3_showrank/tools/showrank.js after reviewing the v3 menu or ShowRank layout change.');
  return Object.keys(files).length;
}

module.exports = { readPieces, compose, guard, structure, layouts, writeOrCheck, chain, OUTPUTS, SCRIPT, PIECES, ROOT, V3_ROOT, SHOWRANK_ROOT };
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0 || (args[0] === '--check' && args.length === 1)) {
      const count = writeOrCheck(args[0] === '--check');
      console.log('HPV3 ShowRank layouts: ' + count + ' outputs ' + (args[0] === '--check' ? 'current' : 'written'));
    } else throw new Error('Usage: showrank.js [--check]');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
