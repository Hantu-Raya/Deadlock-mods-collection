'use strict';
// Shared pieces of the layout composers: the v3 stock-layout patcher and the QOLLOCK / ShowRank lane
// composers (hp_colors_rewrite_v3_qollock/tools/qollock.js, hp_colors_rewrite_v3_showrank/tools/showrank.js).
// Each lane keeps its own anchors, hook tables and error wording; this holds the mechanics they share.

const lf = text => text.replace(/\r\n/g, '\n');
const countOf = (text, part) => text.split(part).length - 1;

// Replaces `anchor` when it occurs exactly once; otherwise throws new Error(failure(count)).
function patchOnce(text, anchor, replacement, failure) {
  const count = countOf(text, anchor);
  if (count !== 1) throw new Error(failure(count));
  return text.replace(anchor, () => replacement);
}

const ids = text => [...text.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const refs = text => new Set([...text.matchAll(/\s(?:src|id)="[^"]+"/g)].map(match => match[0].trim()));

// Ids that occur more than once in `text`, in first-repeat order.
function repeatedIds(text) {
  const seen = new Set(), repeated = new Set();
  for (const id of ids(text)) (seen.has(id) ? repeated : seen).add(id);
  return [...repeated];
}

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

// Node signature: depth, tag and sorted attributes. `skip` lists attribute names left out; `attrValue(key, value)`
// may rewrite a value.
function signature(node, hooks, exempt, attrValue) {
  const skip = exempt ? (hooks[node.tag] || []).concat(hooks['#' + node.attrs.id] || []) : [];
  const attrs = Object.keys(node.attrs).filter(key => !skip.includes(key)).sort()
    .map(key => key + '=' + (attrValue ? attrValue(key, node.attrs[key]) : node.attrs[key]));
  return node.depth + ' <' + node.tag + ' ' + attrs.join(' ') + '>';
}

// Every `want` node appears in `have` in order, at the same depth and under the counterpart of its
// parent; other nodes may only sit between them. wantSignature/haveSignature: node => string.
// Returns { want, have } node counts; throws lostMessage(signature) for the first node not found.
function matchStructure(wantText, haveText, wantSignature, haveSignature, lostMessage) {
  const wantNodes = nodes(wantText), haveNodes = nodes(haveText);
  const want = wantNodes.map(wantSignature), have = haveNodes.map(haveSignature);
  const matched = [];
  let at = 0;
  for (let i = 0; i < want.length; i++) {
    const parent = wantNodes[i].parent === -1 ? -1 : matched[wantNodes[i].parent];
    while (at < have.length && (have[at] !== want[i] || haveNodes[at].parent !== parent)) at++;
    if (at === have.length) throw new Error(lostMessage(want[i]));
    matched.push(at++);
  }
  return { want: want.length, have: have.length };
}

module.exports = { lf, countOf, patchOnce, ids, refs, repeatedIds, nodes, signature, matchStructure };
