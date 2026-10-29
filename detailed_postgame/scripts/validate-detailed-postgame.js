// Detailed Post Scoreboard Menu (pak11) validator.
// The board is a fork of Observer HUD's post-game board (observer_hud pg_*) without the observer extras.
// This file is adapted from the board part of observer_hud/scripts/validate-observer-hud.js; observer_hud
// is never edited for this mod. It runs the board in the same synthetic Panorama VM (the dashboard page,
// its reused scoreboard rows and the stock graph tooltip) and checks:
//  1. the pak loads only its own files (detailed_postgame/ paths), and the page override is the pinned
//     stock page plus the loader include minus the flame video src;
//  2. it builds when the match loads and again for the next match on the reused rows, never twice;
//  3. it is cheap while hidden and little while shown; a reopen without events is still found;
//  4. a layout reload keeps one loop and one listener;
//  5. the scan reads souls by source and the soul lead from the stock tooltip, never drawing it meanwhile;
//  6. none of the observer extras is left: no web page, no handoff listener, stock team names only.
// DPS_CHECK=<text> runs only matching checks. Writes .tmp/detailed-postgame-validate.json.
// It proves no rendering or CSS behaviour; that needs the game.
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { MockPanel, createPanoramaHarness, createVmContext, runInVm } =
  require("../../scripts/hp-colors-panorama-test-adapter.js");
// UICanvas (client.dll 6819, ui_canvas.cpp, static RE): ClearJS(color) and
// DrawSoftLinePointsJS(nPoints, [x0, y0, x1, y1, ...], thickness, softness, color); a bad colour draws white.
MockPanel.prototype.ClearJS = function (color) { this.__draws = []; this.__clear = color; };
MockPanel.prototype.DrawSoftLinePointsJS = function (n, points, thickness, softness, color) {
  (this.__draws = this.__draws || []).push({ n, pts: Array.from(points), thickness, softness, color });
};
const plain = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const deq = (actual, expected, message) => assert.deepEqual(plain(actual), plain(expected), message);
MockPanel.prototype.SetHeroID = function (id) { this.heroId = id; };
MockPanel.prototype.BHasKeyFocus = function () { return !!this.keyFocus; };

const MODULE = path.join(__dirname, "..");
const REPO = path.join(MODULE, "..");
const read = (rel) => fs.readFileSync(path.join(MODULE, rel), "utf8").replace(/\r\n/g, "\n");
const script = (name) => read(`panorama/scripts/detailed_postgame/${name}`);
const results = { checks: [], runs: [], budgets: null };

// (P0 probe, client 6819, 20k-call loops). Raw calls are still printed beside them. GetChildCount
// (formerly "traversal" only) and Children()'s child wrappers now count; subtree node visits are
// priced per node.
const WEIGHT_NS = {
  boundaryValidityCalls: 50, classReads: 400, classWrites: 1150, textReads: 225, textWrites: 750, styleReads: 650,
  styleWrites: 1150, parentReads: 325, childrenReads: 350, childWrappers: 140, childCountReads: 200,
  layoutWidthReads: 250, positions: 1000, schedules: 1000, boundaryQueries: 350, nodeVisits: 10, moveChildCalls: 1000,
  parentWrites: 1000, cancellations: 1000, other: 400
};
const RAW_EXCLUDED = new Set(["childWrappers", "nodeVisits"]);
// The post-game board (plan phase 2): at most 11 native calls per second while its page shows and
// nothing changes; while hidden one visibility check a second (a reopen can bring no event, live).
const BUDGET_BOARD = { calls: 11, us: 3, hiddenUs: 2 };
const ATTRIB = { on: !!process.env.DPS_ATTRIB, map: new Map() };

let lastLogs = null;
// Engine model (ENGINE.md, live 2026-10-23): after style.visibility = "collapse", writing null clears the
// inline value but the panel stays hidden. Every check fails if any panel of its worlds got that sequence.
const WORLDS = [];
function stuckHidden() {
  const stuck = [];
  const visit = (panel) => {
    let collapsed = false;
    for (const { property, value } of panel.__styleWrites || []) {
      if (property !== "visibility") continue;
      if (value === "collapse") collapsed = true;
      else if (value === null && collapsed) stuck.push(panel.id || panel.paneltype);
      else if (value) collapsed = false;
    }
    for (const child of panel.children || []) visit(child);
  };
  for (const root of WORLDS) visit(root);
  return [...new Set(stuck)];
}
// Live (DLF on client 6819, 2026-10-24) a panel never laid out reads Infinity from
// GetPositionWithinWindow, and a style value with NaN or Infinity throws "Invalid value for property".
// The mock accepts anything, so every check fails on such a write instead.
function invalidStyles() {
  const bad = [];
  const visit = (panel) => {
    for (const { property, value } of panel.__styleWrites || []) {
      if (typeof value === "string" && /NaN|Infinity|undefined/.test(value)) bad.push(`${panel.id || panel.paneltype}.${property}=${value}`);
    }
    for (const child of panel.children || []) visit(child);
  };
  for (const root of WORLDS) visit(root);
  return [...new Set(bad)];
}

function check(name, fn) {
  if (process.env.DPS_CHECK && !name.includes(process.env.DPS_CHECK)) return;
  WORLDS.length = 0;
  try {
    fn();
    const stuck = stuckHidden();
    assert.deepEqual(stuck, [], `visibility collapse then null leaves these hidden live: ${stuck.join(", ")}`);
    const bad = invalidStyles();
    assert.deepEqual(bad, [], `these style values throw live: ${bad.join(", ")}`);
  } catch (error) {
    console.log(`not ok - ${name}\n  last logs:\n    ${(lastLogs || []).slice(-25).join("\n    ")}`);
    throw error;
  }
  results.checks.push(name);
  console.log(`ok - ${name}`);
}

// ---------------------------------------------------------------- layouts -> mock panels

function parseLayout(xml) {
  const body = xml.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(styles|scripts|snippets)>[\s\S]*?<\/\1>/g, "")
    .replace(/<\/?root>/g, "");
  const stack = [{ children: [] }];
  for (const [, close, type, attrs, selfClose] of body.matchAll(/<(\/?)(\w+)([^>]*?)(\/?)>/g)) {
    if (close) { stack.pop(); continue; }
    const node = { type, attrs: {}, children: [] };
    for (const [, key, value] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) node.attrs[key] = value;
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  assert.equal(stack.length, 1, "unbalanced layout XML");
  return stack[0].children[0];
}

const classesOf = (node) => (node.attrs.class || "").split(/\s+/).filter(Boolean);
function instantiate(node, parent) {
  const panel = new MockPanel(node.type, parent, node.attrs.id || "");
  panel.classes = classesOf(node);
  if ("text" in node.attrs) panel.__text = node.attrs.text;
  if ("placeholder" in node.attrs) panel.placeholder = node.attrs.placeholder;
  for (const child of node.children) instantiate(child, panel);
  return panel;
}
// A layout loaded into an existing panel: the panel takes the root's classes, the root's children become its own.
function loadInto(panel, node) {
  for (const cls of classesOf(node)) panel.AddClass(cls);
  for (const child of node.children) instantiate(child, panel);
  return panel;
}
const findAll = (panel, type, out = []) => {
  if (panel.paneltype === type) out.push(panel);
  for (const child of panel.children) findAll(child, type, out);
  return out;
};

// ---------------------------------------------------------------- native cost metric

let lastNodes = 0; // subtree node visits of the last counted window
// Counts every crossing the scripts make, including the ones the shared adapter books only as
// "traversal" (GetChildCount) and the child wrappers Children() allocates (live P0: about 140 ns each).
// DPS_ATTRIB=1 prints the weighted cost per script function for each counted window (dev aid).
const blame = (key, n) => {
  if (!ATTRIB.on || !(n > 0)) return;
  const match = /at (\S+) \(((?:oh|pg)_[a-z_]+\.js):(\d+)/.exec(new Error().stack || "");
  const where = match ? `${match[2]} ${match[1]}` : "(adapter/other)";
  ATTRIB.map.set(where, (ATTRIB.map.get(where) || 0) + n * (WEIGHT_NS[key] ?? WEIGHT_NS.other));
};
const counted = (harness) => {
  let positions = 0;
  let childCountReads = 0;
  let childWrappers = 0;
  const proto = MockPanel.prototype;
  const position = proto.GetPositionWithinWindow;
  const childCount = proto.GetChildCount;
  const childrenOf = proto.Children;
  ATTRIB.map = new Map();
  if (ATTRIB.on) {
    const counts = harness.operationCounts;
    for (const key of Object.keys(WEIGHT_NS).concat(["findTraversals", "classTraversalNodes"])) {
      let value = counts[key] || 0;
      Object.defineProperty(counts, key, { configurable: true, enumerable: true, get: () => value,
        set: (next) => { blame(key === "findTraversals" || key === "classTraversalNodes" ? "nodeVisits" : key, next - value); value = next; } });
    }
  }
  proto.GetPositionWithinWindow = function () {
    positions++;
    blame("positions", 1);
    const { parentReads, boundaryValidityCalls } = harness.operationCounts;
    const result = position.call(this);
    Object.assign(harness.operationCounts, { parentReads, boundaryValidityCalls });
    return result;
  };
  proto.GetChildCount = function () {
    childCountReads++;
    blame("childCountReads", 1);
    return childCount.call(this);
  };
  proto.Children = function () {
    const list = childrenOf.call(this);
    childWrappers += list.length;
    blame("childWrappers", list.length);
    return list;
  };
  return () => {
    proto.GetPositionWithinWindow = position;
    proto.GetChildCount = childCount;
    proto.Children = childrenOf;
    const ops = Object.assign({}, harness.operationCounts, { positions, childCountReads, childWrappers });
    lastNodes = (ops.findTraversals || 0) + (ops.classTraversalNodes || 0);
    for (const key of ["traversal", "findTraversals", "classTraversalNodes"]) delete ops[key];
    ops.nodeVisits = lastNodes;
    if (ATTRIB.on) {
      const top = [...ATTRIB.map].sort((a, b) => b[1] - a[1]).slice(0, 25);
      console.log(`   [attrib] top functions, us/s over a 10 s window:\n${top.map(([where, ns]) => `     ${(ns / 1e4).toFixed(1).padStart(6)}  ${where}`).join("\n")}`);
    }
    return Object.fromEntries(Object.entries(ops).filter(([, value]) => value));
  };
};
const per = (ops, seconds) => Object.fromEntries(Object.entries(ops).map(([key, value]) => [key, Math.round(value / seconds * 10) / 10]));
// Raw calls: every JS<->native crossing (child wrappers and subtree node visits are not crossings).
const total = (ops) => Math.round(Object.entries(ops).reduce((sum, [key, value]) => sum + (RAW_EXCLUDED.has(key) ? 0 : value), 0) * 10) / 10;
// Weighted: microseconds of native time per second, from the live per-call costs (P0).
const weighted = (ops) => Math.round(Object.entries(ops).reduce((sum, [key, value]) => sum + value * (WEIGHT_NS[key] ?? WEIGHT_NS.other), 0) / 100) / 10;
const reset = (w) => { for (const key of Object.keys(w.harness.operationCounts)) w.harness.operationCounts[key] = 0; };


check("board: torn paper surfaces use their own full-strength mask at their own size, no faint frame or light border is left", () => {
  // User 2026-10-26: dark edges around the header plates and the graph, and nothing looked like torn paper.
  // opacity-mask reads alpha (live); the stock rough_edge masks have alpha 255 everywhere and masked nothing.
  // How it could fail: a partial-strength mask leaves a faint frame; a mask is stretched to another size; a
  // light rim comes back (user 2026-10-26: "I hate this light brown border"); an image is not shipped.
  const css = read("panorama/styles/detailed_postgame/pg_board.css");
  const board = read("panorama/layout/detailed_postgame/pg_board.xml");
  const column = read("panorama/layout/detailed_postgame/pg_column.xml");
  for (const m of css.matchAll(/opacity-mask:\s*url\("s2r:\/\/panorama\/images\/([\w/]+)\.vtex"\)\s*([\d.]+)?/g)) {
    if (m[1] === "post_game/hero_logo_mask_psd") continue; // the wordmark's diagonal fade, meant to be partial
    assert.equal(m[2] === undefined ? 1 : Number(m[2]), 1, `${m[1]} is used at full strength`);
  }
  const body = (sel) => {
    const found = new RegExp(`\\n${sel.replace(/[.#]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css);
    assert.ok(found, `${sel} has a rule`);
    return found[1];
  };
  const px = (sel, prop) => Number(new RegExp(`(?:^|\\n)\\s*${prop}:\\s*(\\d+)px`).exec(body(sel))[1]);
  const size = (image) => {
    const png = fs.readFileSync(path.join(MODULE, "panorama", "images", "detailed_postgame", `${image}.png`));
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  };
  // [surface rule, mask, rule giving the width, rule giving the height]
  const surfaces = [
    [".NSHeadLeft", "torn_head_l", ".NSHeadSide", ".NSHeader"],
    [".NSHeadRight", "torn_head_r", ".NSHeadSide", ".NSHeader"],
    [".NSAward", "torn_award", ".NSAward", ".NSAward"],
    [".NSGraphPlot", "torn_graph", ".NSGraphPlot", ".NSGraphPlot"],
    [".NSProgressTrack", "torn_track", ".NSProgressTrack", ".NSProgressTrack"]
  ];
  for (const [sel, mask, wSel, hSel] of surfaces) {
    assert.match(body(sel), new RegExp(`opacity-mask:\\s*url\\("s2r://panorama/images/detailed_postgame/${mask}\\.vtex"\\)\\s*1;`), `${sel} uses ${mask}`);
    deq(size(mask), [px(wSel, "width"), px(hSel, "height")], `${mask} is drawn at ${sel}'s size`);
  }
  assert.ok(!/opacity-mask/.test(body(".NSPaper")), ".NSPaper (the stat columns) is not torn (user 2026-10-26)");
  for (const [name, text] of [["pg_board.css", css], ["pg_board.xml", board], ["pg_column.xml", column]]) assert.ok(!/TornRim|_rim\.vtex/.test(text), `${name}: no light rim over the tears`);
  // An RGBA8 PNG's pixels (the generator writes 8-bit RGBA, not interlaced).
  const pixels = (image) => {
    const png = fs.readFileSync(path.join(MODULE, "panorama", "images", "detailed_postgame", `${image}.png`));
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    assert.deepEqual([png[24], png[25], png[28]], [8, 6, 0], `${image}.png is 8-bit RGBA, not interlaced`);
    const idat = [];
    for (let at = 8; at < png.length;) {
      const len = png.readUInt32BE(at);
      if (png.toString("latin1", at + 4, at + 8) === "IDAT") idat.push(png.subarray(at + 8, at + 8 + len));
      at += 12 + len;
    }
    const raw = require("zlib").inflateSync(Buffer.concat(idat));
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const filter = raw[y * (w * 4 + 1)];
      for (let i = 0; i < w * 4; i++) {
        const x = raw[y * (w * 4 + 1) + 1 + i];
        const a = i >= 4 ? out[y * w * 4 + i - 4] : 0;
        const b = y > 0 ? out[(y - 1) * w * 4 + i] : 0;
        const c = i >= 4 && y > 0 ? out[(y - 1) * w * 4 + i - 4] : 0;
        const p = a + b - c;
        const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
        out[y * w * 4 + i] = (x + [0, a, b, (a + b) >> 1, paeth][filter]) & 255;
      }
    }
    return { w, h, out };
  };
  for (const mask of ["torn_head_l", "torn_head_r", "torn_graph", "torn_track", "torn_award"]) {
    // The mask is in alpha as well as grey (live: a mask with alpha 255 everywhere masked nothing).
    const m = pixels(mask);
    for (let i = 0; i < m.w * m.h; i++) assert.equal(m.out[i * 4 + 3], m.out[i * 4], `${mask}: alpha follows the grey`);
    assert.ok(m.out[0] < 128 && m.out[(m.w * m.h - 1) * 4] < 128, `${mask}'s corners are torn away (at most a fibre)`);
  }
});

check("board: ids the scripts look up exist in their layouts; classes they set have rules", () => {
  const board = read("panorama/layout/detailed_postgame/pg_board.xml");
  const column = read("panorama/layout/detailed_postgame/pg_column.xml");
  const js = read("panorama/scripts/detailed_postgame/pg_board.js");
  const css = read("panorama/styles/detailed_postgame/pg_board.css");
  const idsIn = (xml) => new Set([...xml.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const boardIds = idsIn(board);
  const used = new Set();
  for (const m of js.matchAll(/ctx\.FindChildTraverse\(`?"?([A-Za-z0-9]+)(\$\{i\})?/g)) {
    if (m[2]) for (const i of [1, 2]) used.add(`${m[1]}${i}`);
    else used.add(m[1]);
  }
  assert.ok(used.size >= 12, `only ${used.size} board lookups parsed`);
  for (const id of used) assert.ok(boardIds.has(id), `#${id} missing from pg_board.xml`);
  const columnIds = idsIn(column);
  const columnUsed = [...js.matchAll(/column\.FindChildTraverse\("([A-Za-z0-9]+)"\)/g)].map((m) => m[1]);
  assert.ok(columnUsed.length >= 4, `only ${columnUsed.length} column lookups parsed`);
  for (const id of columnUsed) assert.ok(columnIds.has(id), `#${id} missing from pg_column.xml`);
  // Panels created under a stock row take the scoreboard's sheets (live), so the column layout includes ours.
  for (const xml of [board, column]) assert.ok(xml.includes("s2r://panorama/styles/detailed_postgame/pg_board.vcss_c"), "board stylesheet included");
  assert.match(read("panorama/scripts/detailed_postgame/pg_loader.js"), /"file:\/\/\{resources\}\/layout\/detailed_postgame\/pg_board\.xml"/);
  assert.match(js, /"file:\/\/\{resources\}\/layout\/detailed_postgame\/pg_column\.xml"/);
  const rules = new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_]*)/g)].map((m) => m[1]));
  const set = new Set();
  for (const m of js.matchAll(/class: "([^"$]+)"/g)) m[1].split(/\s+/).forEach((c) => set.add(c));
  for (const m of js.matchAll(/(?:AddClass|SetHasClass|RemoveClass)\("([A-Za-z0-9_]+)"/g)) set.add(m[1]);
  for (const key of ["souls", "kills", "assists", "pdmg", "odmg", "heal"]) set.add(`NSBest_${key}`);
  for (const key of ["troopers", "neutrals", "breakables", "bonus", "kills", "objectives", "urn", "assists", "denies"]) set.add(`NSSrc_${key}`);
  for (const c of set) assert.ok(rules.has(c), `.${c} has no rule in pg_board.css`);
});

// ---------------------------------------------------------------- post-game board (dashboard context)
// The board runs in the dashboard, in the post-game page override: pg_loader.js in CitadelPostGameNew
// loads pg_board.xml (and pg_board.js) into #NSHost in #ScoreboardScreen. The engine side is modelled
// from live (client 6819, 2026-10-25; ENGINE.md "Post-game page"):
//  - the page layout loads on the first citadel_match_details; CitadelMatchDetailsUpdated arrives as an
//    unhandled event about 0.5 s later, and CitadelPostGameSelectScreenIndex as a page event when a
//    screen is picked; the dashboard sets PageVisible on the shown page;
//  - C++ clones the scoreboard rows (six players and a TotalsRow per team) and reuses them when the
//    next match opens; a label's {i:...}/{s:...} parts resolve from the row's (or page's) dialog
//    variables in the same frame, integers comma-formatted;
//  - the graph's columns are not modelled (no scan here; verify-postgame-live.js covers it live).
//
// How the board can fail, each with a check below:
//  1. it polls while nobody looks at the page (cost while hidden) or too often while shown;
//  2. it misses the match (an event before the page shows, a load without an event) or builds twice;
//  3. a reused row set keeps the old match on screen;
//  4. a layout reload leaves two loops or two match listeners;
//  5. the entrance replays late when the Scoreboard screen is picked.
const PG = {
  page: parseLayout(read("panorama/layout/post_game/citadel_db_page_post_game_new.xml")),
  board: parseLayout(read("panorama/layout/detailed_postgame/pg_board.xml")),
  column: parseLayout(read("panorama/layout/detailed_postgame/pg_column.xml"))
};
const PG_SCREENS = ["Team1Screen", "Team2Screen", "ScoreboardScreen", "GraphsScreen"];
const PG_HEROES = [[1, 2, 3, 4, 6, 7], [8, 10, 11, 12, 13, 14]];
const PG_STATS = ["net_worth", "player_kills", "player_deaths", "player_assists", "player_dmg", "obj_dmg", "player_healing"];
function pgMatch(id, { swap = false, win = 1 } = {}) {
  const teams = PG_HEROES.map((heroes, t) => heroes.map((hero, k) => ({
    hero: swap ? PG_HEROES[1 - t][k] : hero, account: String(100000 + (id % 1000) * 20 + t * 6 + k),
    net_worth: 20000 + 1000 * k + 77 * t + (id % 97), player_kills: k + t, player_deaths: 6 - k, player_assists: 10 + k,
    player_dmg: 15000 + 500 * k, obj_dmg: 3000 + 100 * k, player_healing: 2000 + 50 * k
  })));
  return { id: String(id), minutes: 31, seconds: 7, win, teams };
}
// A label text as the engine resolves it: every {s:key} / {i:key} part from the nearest ancestor that
// has the dialog variable; an unresolved part stays as written.
function bindAll(label, value) {
  let literal = String(value);
  Object.defineProperty(label, "__text", { configurable: true, enumerable: false,
    get: () => literal.replace(/\{([si]):(\w+)\}/g, (all, kind, key) => {
      let owner = label.parent;
      while (owner && !(owner.__dialog && key in owner.__dialog)) owner = owner.parent;
      if (!owner) return all;
      return kind === "i" ? Number(owner.__dialog[key]).toLocaleString("en-US") : String(owner.__dialog[key]);
    }),
    set: (next) => { literal = String(next); } });
  return label;
}
// graph (optional): the stock graph's 40 columns and its tooltip in team mode, as live (client 6819):
// hovering a column through DispatchPanelEvent shows PostGameGraphTooltip under the dashboard root with
// "m:ss | <team> | <souls> | (<pct>%) | <team> | ... | <total>", Archmother (team 2) first. Live
// (demo 121685912) the last column read 171,451 against a totals row of 171,452.
function boardWorld({ visible = true, graph = null, names = true } = {}) {
  const harness = createPanoramaHarness({ now: 7000000, rootWidth: 1600, rootHeight: 900 });
  lastLogs = harness.logs;
  const bus = [];
  let nextId = 1;
  const dollar = (panel) => ({
    GetContextPanel: () => panel,
    CreatePanel: (type, parent, id, props = {}) => {
      const created = new MockPanel(type, parent, id);
      for (const [key, value] of Object.entries(props)) {
        if (key === "class") created.classes = String(value).split(/\s+/).filter(Boolean);
        else if (key === "text") bindAll(created, value);
        else created.attributes[key] = String(value);
      }
      // The engine's CitadelUserName makes one Label with the account's name (live).
      if (names && type === "CitadelUserName" && props.accountid) new MockPanel("Label", created, "").__text = `Persona ${props.accountid}`;
      return created;
    },
    Schedule: (delay, fn) => harness.scheduler.schedule(delay, () => { frameCheck(); fn(); }),
    RegisterForUnhandledEvent: (name, fn) => { bus.push({ id: nextId, name, fn }); return nextId++; },
    UnregisterForUnhandledEvent: (name, id) => {
      const index = bus.findIndex((entry) => entry.id === id);
      if (index >= 0) bus.splice(index, 1);
    },
    // Panel event handlers add up (a reloaded script's old handler stays registered).
    RegisterEventHandler: (name, target, fn) => {
      target.__handlers = target.__handlers || {};
      (target.__handlers[name] = target.__handlers[name] || []).push(fn);
    },
    DispatchEvent: (name, ...args) => {
      if (graph && name === "DispatchPanelEvent" && args[1] === "onmouseover") showTip(args[0]);
      // The native column mouseout hides the tooltip: TooltipVisible off (client.dll 6821 0x181a98620).
      if (graph && name === "DispatchPanelEvent" && args[1] === "onmouseout" && tip && graphCanvas && graphCanvas.children.includes(args[0])) tip.classes.delete("TooltipVisible");
      if (name === "CitadelPostGameCopyMatchID") { if (copy.stockThrows) throw new Error("Event arguments could not be parsed"); copy.stock.push(args[0]); }
      if (name === "TextEntryCopyToClipboard") copy.entry.push({ text: String(args[0].text), selected: !!args[0].allSelected, focused: !!args[0].focused });
      if (graph && graph.lanes && name === "CitadelMatchDetailsGraphClickPlayer") showLane(args[0], args[1]);
      return true;
    },
    Localize: (token) => ({ "#Citadel_Team1_Name": "Hidden King", "#Citadel_Team2_Name": "Archmother" })[token] || token,
    Msg: (message) => harness.logs.push(String(message))
  });
  const runIn = (panel, files) => {
    const context = createVmContext(harness, { globals: { $: dollar(panel) } });
    for (const [name, source] of files) runInVm(source, context, name);
    return context;
  };
  MockPanel.prototype.BLoadLayout = function (file) {
    if (file === "file://{resources}/layout/detailed_postgame/pg_board.xml") {
      loadInto(this, PG.board);
      runIn(this, [["pg_board.js", script("pg_board.js")]]);
      return true;
    }
    if (file === "file://{resources}/layout/detailed_postgame/pg_column.xml") {
      loadInto(this, PG.column);
      return true;
    }
    return false;
  };
  const dash = new MockPanel("CitadelDashboardRoot", { operationCounts: harness.operationCounts, findCounts: harness.findCounts,
    childReadCounts: harness.childReadCounts, eventSetCounter: harness.eventSetCounter });
  WORLDS.push(dash);
  const page = instantiate(PG.page, dash);
  if (visible) page.AddClass("PageVisible");
  const scoreboard = page.FindChildTraverse("Scoreboard");
  // Graph model: columns under MatchDetailsGraphs#Graphs, one tooltip panel created on the first hover.
  // Stock tooltip_base (6821): .TooltipContainer { opacity: 0 } and .TooltipVisible { opacity: 1 }; the
  // native show adds TooltipVisible, the native hide removes it. An inline opacity beats both rules.
  const tipLog = { opaqueFrames: 0, shows: 0 };
  const copy = { stock: [], entry: [], stockThrows: false };
  let tip = null;
  const showTip = (col) => {
    const cols = graphCanvas ? graphCanvas.children : [];
    const c = cols.indexOf(col);
    if (c < 0) return;
    if (!tip) { tip = new MockPanel("CitadelTooltipGraphPlayerNetWorth", dash, "PostGameGraphTooltip"); tip.classes.add("TooltipContainer"); }
    tip.visible = true;
    tip.classes.add("TooltipVisible");
    tipLog.shows++;
    for (const kid of tip.children.slice()) kid.DeleteAsync();
    const f = (c + 1) / cols.length;
    const t = Math.round(f * graph.duration);
    // graph.values(f) -> [team 1, team 2] souls at fraction f (default: straight lines to the totals).
    const [a, b] = graph.values ? graph.values(f) : [Math.round(graph.souls[0] * f), Math.round(graph.souls[1] * f)];
    const label = (text) => { new MockPanel("Label", tip, "").__text = text; };
    label(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);
    for (const [name, v] of [["Archmother", b], ["Hidden King", a]]) {
      label(name);
      label(v.toLocaleString("en-US"));
      label(`(${Math.round(100 * v / (a + b))}%)`);
    }
    label((a + b).toLocaleString("en-US"));
  };
  // Lane Stats (graph type 12): picking a player shows that player's lane (three lanes, by button);
  // graph.lanes[lane] = [[team 1 tier 1 falls, team 2 tier 1 falls], [tier 2], [barracks]] in seconds, -1 = stands.
  const showLane = (graphs, n) => {
    const lane = graph.lanes[(Number(n) - 1) % graph.lanes.length];
    const mmss = (t) => (t < 0 ? "-" : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);
    for (const id of ["LaneStatTier1", "LaneStatTier2", "LaneStatBarracks", "LaneStatKills", "LaneStatNetWorth"]) {
      const old = graphs.FindChildTraverse(id);
      if (old) old.DeleteAsync();
    }
    ["LaneStatTier1", "LaneStatTier2", "LaneStatBarracks"].forEach((id, i) => {
      const panel = new MockPanel("Panel", graphs, id);
      for (const text of [mmss(lane[i][0]), id, mmss(lane[i][1])]) { const l = new MockPanel("Label", panel, ""); l.text = text; }
    });
    for (const id of ["LaneStatKills", "LaneStatNetWorth"]) { const l = new MockPanel("Label", new MockPanel("Panel", graphs, id), ""); l.text = `${id} ${n}`; }
  };
  // A frame boundary while the scan runs: the tooltip must not be drawn (user report 2026-10-25).
  let scanning = false;
  const frameCheck = () => {
    scanning = harness.logs.some((l) => l.startsWith("[DPS] board shown")) && !harness.logs.some((l) => l.startsWith("[DPS] scan done"));
    if (scanning && tipDrawn()) tipLog.opaqueFrames++;
  };
  // What the player sees: the inline opacity if one was written, else the stock classes.
  const tipDrawn = () => !!tip && tip.visible && (tip.style.opacity !== undefined && tip.style.opacity !== null && String(tip.style.opacity) !== ""
    ? String(tip.style.opacity) !== "0" : tip.classes.has("TooltipVisible"));
  let graphCanvas = null;
  if (graph) {
    graphCanvas = new MockPanel("Panel", page.FindChildTraverse("Graphs"), "Graph");
    for (let i = 0; i < 40; i++) new MockPanel("Panel", graphCanvas, "");
  }
  // The stock rows, cloned once by C++ and reused for the next match.
  const fill = (m) => {
    page.__dialog = { match_id: m.id, match_minutes: m.minutes, match_seconds: String(m.seconds).padStart(2, "0") };
    if (!scoreboard.children.length) {
      // Stock CSS (6819): .ScoreboardScrollContainer { overflow: scroll squish; transform: translateY(80px); }
      const inner = new MockPanel("Panel", scoreboard, "");
      inner.classes.add("ScoreboardScrollContainer");
      new MockPanel("Panel", inner, "MatchInfoContainer");
      for (const t of [1, 2]) {
        const team = new MockPanel("Panel", inner, `Team${t}`);
        new MockPanel("Panel", team, "TeamTableHeader");
        const players = new MockPanel("Panel", team, "TeamPlayers");
        for (let k = 0; k < 7; k++) {
          const row = new MockPanel("Panel", players, "");
          new MockPanel("Panel", row, "StatCells");
          const main = new MockPanel("Panel", row, "PlayerInfo");
          if (k === 6) { row.classes.add("TotalsRow"); continue; }
          new MockPanel("Label", new MockPanel("CitadelUserName", main, "PlayerName"), "");
          const items = new MockPanel("Panel", main, "ItemsContainer");
          for (let i = 0; i < 9; i++) new MockPanel("CitadelModIcon", items, "");
        }
      }
    }
    for (const t of [1, 2]) {
      const team = scoreboard.FindChildTraverse(`Team${t}`);
      if (m.win === t) team.classes.add("IsWinningTeam");
      else team.classes.delete("IsWinningTeam");
      const rows = team.FindChildTraverse("TeamPlayers").children;
      const players = m.teams[t - 1];
      players.forEach((p, k) => {
        rows[k].__dialog = Object.assign({ hero_id: p.hero }, Object.fromEntries(PG_STATS.map((key) => [key, p[key]])));
        const name = rows[k].FindChildTraverse("PlayerName");
        name.accountid = p.account;
        name.children[0].__text = `Persona ${p.account}`;
      });
      rows[6].__dialog = Object.assign({ hero_id: 0 }, Object.fromEntries(PG_STATS.map((key) => [key, players.reduce((s, p) => s + p[key], 0)])));
    }
  };
  const fire = (name, ...args) => { for (const entry of bus.slice()) if (entry.name === name) entry.fn(...args); };
  const pageEvent = (name, ...args) => { for (const fn of ((page.__handlers || {})[name] || []).slice()) fn(...args); };
  // The carousel focuses the picked screen, then the page gets the screen index (live: 3 = Scoreboard).
  const selectScreen = (id) => {
    for (const screen of PG_SCREENS) page.FindChildTraverse(screen).classes[screen === id ? "add" : "delete"]("Focused");
    pageEvent("CitadelPostGameSelectScreenIndex", PG_SCREENS.indexOf(id) + 1);
  };
  const boardHost = () => page.FindChildTraverse("ScoreboardScreen").FindChild("NSHost");
  const shown = () => harness.logs.filter((line) => line.startsWith("[DPS] board shown")).length;
  const columns = () => findAll(scoreboard, "Panel").filter((p) => p.valid && (p.classes.has("NSColumnTeam1") || p.classes.has("NSColumnTeam2")));
  return { harness, page, scoreboard, bus, fill, fire, selectScreen, boardHost, shown, columns, tipLog,
    tip: () => tip, tipDrawn, copy,
    // The player's own mouse on graph column c, and leaving it: the stock column events.
    userHover: (c) => showTip(graphCanvas.children[c]),
    userLeave: () => { if (tip) tip.classes.delete("TooltipVisible"); },
    boot: () => runIn(page, [["pg_loader.js", script("pg_loader.js")]]),
    reload: () => runIn(boardHost(), [["pg_board.js", script("pg_board.js")]]),
    dash,
    advance: (ms) => harness.scheduler.runFor(ms, 1e6),
    text: (id) => boardHost().FindChildTraverse(id).__text };
}

check("board: the scan reads the lead with a totals row a few souls off, and the tooltip is never drawn while it runs", () => {
  const m = pgMatch(121685912);
  const totals = m.teams.map((team) => team.reduce((s, p) => s + p.net_worth, 0));
  // Live (demo 121685912): the graph's last column was 1 soul under the Sapphire totals row.
  const w = boardWorld({ graph: { duration: m.minutes * 60 + m.seconds, souls: [totals[0], totals[1] - 1] } });
  w.boot();
  w.fill(m);
  w.fire("CitadelMatchDetailsUpdated", m.id);
  w.advance(30000);
  assert.ok(w.harness.logs.some((l) => l.startsWith("[DPS] scan done")), "scan finished");
  const series = w.harness.logs.filter((l) => l.startsWith("[DPS] data series + "));
  assert.ok(series.length >= 30, `lead points: ${series.length}`);
  assert.ok(w.boardHost().FindChildTraverse("NSGraph").BHasClass("NSOn"), "lead graph shown");
  assert.ok(w.tipLog.shows > 0, "the scan hovered the graph");
  assert.equal(w.tipLog.opaqueFrames, 0, "tooltip drawn during the scan");
  // How it failed (user report 2026-10-29): the board wrote the tooltip's inline opacity ("1" on the Graphs
  // screen), which beats the stock .TooltipContainer opacity 0, so the contents stayed drawn after the mouse
  // left the graph; and the scan's synthetic hover was never closed. The board must never write it.
  const opacityWrites = () => (w.tip().__styleWrites || []).filter((x) => x.property === "opacity");
  deq(opacityWrites(), [], "no inline opacity on the stock tooltip");
  assert.ok(!w.tipDrawn(), "nothing drawn after the scan");
  // The Graphs screen without a hover shows nothing; a hover shows it, leaving the graph hides it.
  w.selectScreen("GraphsScreen");
  w.advance(1500);
  assert.ok(!w.tipDrawn(), "Graphs screen, no hover: no tooltip");
  w.userHover(12);
  w.advance(1500);
  assert.ok(w.tipDrawn(), "hovering a column shows it (the board leaves the stock alone)");
  w.userLeave();
  w.advance(1500);
  assert.ok(!w.tipDrawn(), "leaving the graph hides it");
  // A hover left open when the carousel moves (user report 2026-10-26) is hidden off the Graphs screen.
  w.userHover(30);
  w.selectScreen("ScoreboardScreen");
  w.advance(1500);
  assert.ok(!w.tipDrawn(), "hidden over the scoreboard");
  w.selectScreen("GraphsScreen");
  w.advance(1500);
  assert.ok(!w.tipDrawn(), "and not back without a hover");
  w.userHover(5);
  w.advance(1500);
  assert.ok(w.tipDrawn(), "a new hover still shows it");
  deq(opacityWrites(), [], "still no inline opacity");
});

check("board: builds when the match loads, again for the next match on the reused rows, never twice for one", () => {
  const w = boardWorld();
  w.boot();
  w.advance(2000);
  // No rows yet: the indeterminate LOADING MATCH bar.
  assert.ok(w.boardHost().BHasClass("NSBusy") && w.boardHost().FindChildTraverse("NSProgress").BHasClass("NSIndeterminate"), "loading bar");
  assert.equal(w.shown(), 0);
  const a = pgMatch(121917141);
  w.fill(a);
  w.fire("CitadelMatchDetailsUpdated", a.id);
  w.advance(300);
  assert.equal(w.shown(), 1, "built within 0.3 s of the match event");
  assert.equal(w.text("NSMatch"), `MATCH ${a.id}`);
  assert.equal(w.columns().length, 12);
  // Exact values through the bound label (stock rows show "21k").
  const first = w.columns()[0].FindChildrenWithClassTraverse("NSCellValue")[0];
  assert.equal(first.__text, a.teams[0][0].net_worth.toLocaleString("en-US"));
  // Live 2026-10-25 (user): items in the 3rd and 4th icon rows could not be hovered. The stock scroll
  // container is drawn translateY(80px) below its box, and the scoreboard's box (fit to the untranslated
  // rows) ends 80 px above the drawn rows, so hover never reaches their bottom 80 px. The rows must be laid
  // out where they are drawn, at the same height as before (stock margin 49 + 80 + 1 measured = 130).
  const shift = String(w.scoreboard.children[0].style.transform || "") === "none" ? 0 : 80;
  assert.equal(shift, 0, "the stock scroll container is not translated");
  assert.equal(parseInt(w.scoreboard.style.marginTop, 10) + shift, 129, "the rows stay at the same height");
  w.advance(5000);
  assert.equal(w.shown(), 1, "one build per match");
  // The next match on the same rows (C++ reuses them).
  const b = pgMatch(121880956, { swap: true, win: 2 });
  w.fill(b);
  w.fire("CitadelMatchDetailsUpdated", b.id);
  w.advance(300);
  assert.equal(w.shown(), 2);
  assert.equal(w.text("NSMatch"), `MATCH ${b.id}`);
  assert.equal(w.columns().length, 12, "the old match's columns are gone");
  // A load that brings no event is still found by the safety check within its second.
  const c = pgMatch(121999999);
  w.fill(c);
  w.advance(1100);
  assert.equal(w.shown(), 3, "found without an event");
  assert.equal(w.text("NSMatch"), `MATCH ${c.id}`);
});

check("board: cheap while hidden, little while shown; a reopen without events, an early event and a screen pick are found", () => {
  const w = boardWorld({ visible: false });
  w.boot();
  // The match event can come before the page shows (live: event +0.5 s, page found +1.1 s).
  const a = pgMatch(121917141);
  w.fill(a);
  w.fire("CitadelMatchDetailsUpdated", a.id);
  w.advance(600);
  assert.equal(w.shown(), 0, "nothing built while hidden");
  w.page.AddClass("PageVisible");
  w.advance(300);
  assert.equal(w.shown(), 1, "built within 0.3 s of the page showing after an event");
  w.advance(10000);
  // Shown and built, nothing changing.
  reset(w);
  let stop = counted(w.harness);
  w.advance(10000);
  const shownOps = per(stop(), 10);
  console.log(`   board shown ${weighted(shownOps)} us/s, ${total(shownOps)} calls/s ${JSON.stringify(shownOps)}`);
  assert.equal((shownOps.textWrites || 0) + (shownOps.styleWrites || 0) + (shownOps.classWrites || 0), 0, "no writes while nothing changes");
  assert.ok(total(shownOps) <= BUDGET_BOARD.calls, `board shown: ${total(shownOps)} calls/s`);
  assert.ok(weighted(shownOps) <= BUDGET_BOARD.us, `board shown: ${weighted(shownOps)} us/s`);
  // The entrance never hides a board that is on screen (user 2026-10-26: "you can see the contents pop
  // first, then it hidden and reveal"). Built off screen, the board waits hidden (frame without NSIntro,
  // columns without NSIn, the stock items transparent); picking the Scoreboard screen plays the entrance at
  // once, at any phase of the safety check. Leaving it resets the entrance only once the carousel has moved
  // it away (1 s), and a quick return keeps it shown.
  const frame = w.boardHost().FindChildTraverse("NSFrame");
  const boardCols = w.columns();
  const items = boardCols.map((c) => c.GetParent().FindChild("ItemsContainer"));
  const hiddenNow = () => !frame.BHasClass("NSIntro") && boardCols.every((c) => !c.BHasClass("NSIn")) && items.every((p) => String(p.style.opacity) === "0");
  const shownNow = () => frame.BHasClass("NSIntro") && boardCols.every((c) => c.BHasClass("NSIn")) && items.every((p) => String(p.style.opacity) === "1");
  assert.equal(boardCols.length, 12, "12 columns");
  assert.ok(hiddenNow(), "built with no screen focused: the board waits hidden");
  let flashes = 0;
  let shownAt = -1;
  const scoreboardFocused = () => w.page.FindChildTraverse("ScoreboardScreen").BHasClass("Focused");
  for (const p of [frame, ...boardCols]) {
    const removeClass = p.RemoveClass;
    p.RemoveClass = function (cls) { if ((cls === "NSIntro" || cls === "NSIn") && this.BHasClass(cls) && scoreboardFocused()) flashes++; return removeClass.call(this, cls); };
    const addClass = p.AddClass;
    p.AddClass = function (cls) { if (p === frame && cls === "NSIntro" && shownAt < 0) shownAt = w.harness.now; return addClass.call(this, cls); };
  }
  for (const phase of [0, 350, 700]) {
    w.selectScreen("Team1Screen");
    w.advance(3000 + phase);
    assert.ok(hiddenNow(), `off screen for 3 s: reset to hidden (phase ${phase})`);
    shownAt = -1;
    const pickedAt = w.harness.now;
    w.selectScreen("ScoreboardScreen");
    w.advance(1500);
    assert.ok(shownAt >= 0 && shownAt - pickedAt <= 200, `entrance played ${shownAt - pickedAt} ms after the pick (phase ${phase})`);
    assert.ok(shownNow(), "board shown after the entrance");
  }
  w.selectScreen("Team1Screen");
  w.advance(500);
  assert.ok(shownNow(), "still shown while the carousel moves it away");
  w.selectScreen("ScoreboardScreen");
  w.advance(1500);
  assert.ok(shownNow(), "a quick return keeps the board shown");
  assert.equal(flashes, 0, "nothing on the focused Scoreboard screen was hidden after it showed");
  // Hidden: one cheap visibility check per second. Live (pak10 1c5ff983, 2026-10-25) reopening a match
  // this session had already loaded brought no CitadelMatchDetailsUpdated, and picking the Scoreboard
  // screen then woke nothing: a board that slept while hidden showed the previous match.
  w.page.RemoveClass("PageVisible");
  w.advance(6000);
  reset(w);
  stop = counted(w.harness);
  w.advance(10000);
  const hiddenOps = per(stop(), 10);
  console.log(`   board hidden ${weighted(hiddenOps)} us/s, ${total(hiddenOps)} calls/s ${JSON.stringify(hiddenOps)}`);
  assert.equal((hiddenOps.textWrites || 0) + (hiddenOps.styleWrites || 0) + (hiddenOps.classWrites || 0), 0, "no writes while hidden");
  assert.ok(weighted(hiddenOps) <= BUDGET_BOARD.hiddenUs, `board hidden: ${weighted(hiddenOps)} us/s`);
  results.board = { shown: shownOps, shownUs: weighted(shownOps), shownCalls: total(shownOps), hidden: hiddenOps, hiddenUs: weighted(hiddenOps) };
  // A cached match reopened: the rows change and the page shows, with no event at all.
  const b = pgMatch(121880956, { swap: true });
  w.fill(b);
  w.page.AddClass("PageVisible");
  w.advance(1100);
  assert.equal(w.shown(), 2, "the reopened match is built within a second of the page showing");
  assert.equal(w.text("NSMatch"), `MATCH ${b.id}`);
  // And the next match's event still acts at once.
  const c = pgMatch(121999999);
  w.fill(c);
  w.fire("CitadelMatchDetailsUpdated", c.id);
  w.advance(300);
  assert.equal(w.shown(), 3, "built within 0.3 s of the match event");
});

check("board: a layout reload keeps one loop and one match listener", () => {
  const w = boardWorld();
  w.boot();
  w.reload();
  assert.equal(w.bus.filter((entry) => entry.name === "CitadelMatchDetailsUpdated").length, 1, "one match listener");
  const a = pgMatch(121917141);
  w.fill(a);
  w.fire("CitadelMatchDetailsUpdated", a.id);
  w.advance(6000);
  assert.equal(w.shown(), 1, "one build");
  reset(w);
  const stop = counted(w.harness);
  w.advance(10000);
  const ops = per(stop(), 10);
  assert.ok((ops.schedules || 0) <= 1.1, `one 1 s loop: ${ops.schedules} schedules/s`);
});

const present = (w, m) => { w.fill(m); w.fire("CitadelMatchDetailsUpdated", m.id); w.advance(300); };
const noBoardErrors = (w) => !w.harness.logs.some((line) => /tick failed/i.test(line));

check("board: the soul lead is one smooth line over a soft area on a canvas, coloured by who leads, with objective dots on the line, both peaks and the final lead", () => {
  // User 2026-10-26: "reimagine the graph and don't make this bars".
  // How it could fail: bars come back; the line misses a scanned point or swings past it between points
  // (an overshoot invents a lead nobody had); a lead change is drawn in one colour or leaves a gap at zero;
  // a point is NaN or off the canvas; a dot, peak or final-lead label sits away from the line or names the
  // wrong side; the captions miss the header's team names or keep stale ones; the reveal never finishes.
  const m = pgMatch(121685912);
  const T = m.teams.map((team) => team.reduce((s, p) => s + p.net_worth, 0));
  // Team 1 ahead for the first half (peak +12.5K), team 2 for the second (peak -12.5K); the totals decide the end.
  // A two-column fight spike at 30-33 % tests that the line does not swing past the points around it.
  const bump = (f) => Math.round(6250 * Math.sin(2 * Math.PI * f)) + (f > 0.29 && f < 0.335 ? 2500 : 0);
  const duration = m.minutes * 60 + m.seconds;
  const lanes = [[[300, 520], [700, -1], [-1, -1]], [[410, 600], [800, 1200], [-1, 1300]], [[350, -1], [-1, -1], [-1, -1]]];
  const w = boardWorld({ graph: { duration, souls: T, values: (f) => [Math.round(T[0] * f) + bump(f), Math.round(T[1] * f) - bump(f)], lanes } });
  w.boot();
  w.fill(m);
  w.fire("CitadelMatchDetailsUpdated", m.id);
  w.advance(30000);
  const host = w.boardHost();
  const canvas = host.FindChildTraverse("NSGraphCanvas");
  assert.ok(canvas && canvas.paneltype === "UICanvas", "drawn on a UICanvas");
  const geoLine = w.harness.logs.find((l) => l.startsWith("[DPS] graph: chart ")) || "";
  const geo = /chart (\d+)x(\d+), zero (\d+), half (\d+), scale (\d+)/.exec(geoLine);
  assert.ok(geo, `geometry logged: ${geoLine}`);
  const [W, H, Z, HALF, SCALE] = geo.slice(1).map(Number);
  const logged = (kind) => w.harness.logs.filter((l) => l.startsWith(`[DPS] data ${kind} + `)).map((l) => JSON.parse(l.slice(`[DPS] data ${kind} + `.length)));
  const lead = logged("series").map((p) => ({ x: p.t / duration * W, y: Z - (p.a - p.b) / SCALE * HALF, l: p.a - p.b }));
  assert.ok(lead.length >= 30 && lead.some((p) => p.l > 0) && lead.some((p) => p.l < 0), "the test lead changes sides");
  const draws = canvas.__draws || [];
  for (const d of draws) {
    assert.equal(d.pts.length, d.n * 2, "nPoints matches the array");
    assert.ok(d.pts.every(Number.isFinite), "finite points");
    for (let i = 0; i < d.pts.length; i += 2) assert.ok(d.pts[i] >= -0.5 && d.pts[i] <= 1600.5 && d.pts[i + 1] >= -0.5 && d.pts[i + 1] <= H + 0.5, `on the canvas: ${d.pts[i]},${d.pts[i + 1]}`);
    assert.match(String(d.color), /^#[0-9A-F]{8}$/i, "colours are #RRGGBBAA");
  }
  const team = (color) => { const n = parseInt(color.slice(1, 7), 16); return ((n >> 16) & 255) > (n & 255) ? 1 : 2; };
  // The area is drawn as zig-zags (every point pair shares its x); the line is the thin opaque polyline.
  const zigzag = (d) => { for (let i = 0; i + 2 < d.pts.length; i += 4) if (d.pts[i] !== d.pts[i + 2]) return false; return d.n >= 4; };
  // Amber (team 1 ahead) stays above zero, blue below; the runs meet at zero.
  const lines = draws.filter((d) => d.thickness <= 4 && /FF$/i.test(d.color) && d.n > 2 && !zigzag(d));
  assert.ok(lines.some((d) => team(d.color) === 1) && lines.some((d) => team(d.color) === 2), "both colours");
  for (const d of lines) for (let i = 1; i < d.pts.length; i += 2) assert.ok(team(d.color) === 1 ? d.pts[i] <= Z + 0.6 : d.pts[i] >= Z - 0.6, "a run stays on its side of zero");
  assert.ok(lines.some((d) => Math.abs(d.pts[1] - Z) < 0.6 && d.pts[0] > 1) && lines.some((d) => Math.abs(d.pts[d.pts.length - 1] - Z) < 0.6 && d.pts[d.pts.length - 2] < W - 1), "the runs meet at zero where the lead changes sides");
  const all = [];
  for (const d of lines) for (let i = 0; i < d.pts.length; i += 2) all.push([d.pts[i], d.pts[i + 1]]);
  all.sort((p, q) => p[0] - q[0]);
  const yAt = (x) => {
    const k = all.findIndex((p) => p[0] >= x);
    if (k <= 0) return all[Math.max(0, k)][1];
    const [x0, y0] = all[k - 1];
    const [x1, y1] = all[k];
    return x1 === x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  };
  for (const p of lead) assert.ok(Math.abs(yAt(p.x) - p.y) <= 1.5, `through (${p.x.toFixed(1)}, ${p.y.toFixed(1)}): ${yAt(p.x).toFixed(1)}`);
  const knots = [{ x: 0, y: Z }].concat(lead);
  for (let i = 1; i < knots.length; i++) {
    const lo = Math.min(knots[i - 1].y, knots[i].y) - 0.6;
    const hi = Math.max(knots[i - 1].y, knots[i].y) + 0.6;
    for (const [x, y] of all) if (x > knots[i - 1].x + 0.01 && x < knots[i].x - 0.01) assert.ok(y >= lo && y <= hi, `no swing past the points between ${i - 1} and ${i} (${y.toFixed(1)} outside ${lo.toFixed(1)}..${hi.toFixed(1)})`);
  }
  // The soft area under the line, in both colours.
  const fills = draws.filter(zigzag);
  assert.ok(fills.some((d) => team(d.color) === 1) && fills.some((d) => team(d.color) === 2), "the area under the line in both colours");
  // Objective dots sit on the line in the colour of the team that took the objective.
  const events = logged("events");
  assert.ok(events.length >= 8, `objectives read: ${events.length}`);
  const px = (p, key) => parseFloat(String(p.style[key] || "0"));
  const dots = findAll(host, "Panel").filter((p) => p.valid && p.classes.has("NSGraphObj"));
  assert.equal(dots.length, events.length, "one dot per objective");
  events.forEach((e, i) => {
    const dot = dots[i];
    const cx = px(dot, "marginLeft") + 5;
    const cy = px(dot, "marginTop") + 5;
    assert.ok(Math.abs(cx - e.t / duration * W) <= 1.5 && Math.abs(cy - yAt(cx)) <= 2, `objective ${i} on the line`);
    assert.ok(dot.classes.has(e.killer === 2 ? "NSObjTeam2" : "NSObjTeam1"), `objective ${i} in the taker's colour`);
  });
  // Peaks and the final lead.
  const text = (p) => String(p.__text ?? p.text ?? "");
  const best = (sign) => lead.reduce((b, p) => (sign * p.l > sign * b.l ? p : b), { l: 0 });
  for (const [sign, side] of [[1, 1], [-1, 2]]) {
    const peak = host.FindChildTraverse(`NSGraphPeak${side}`);
    assert.ok(peak && peak.classes.has("NSOn"), `team ${side} peak shown`);
    assert.ok(text(peak).includes(`+${(Math.abs(best(sign).l) / 1000).toFixed(1)}K`), `team ${side} peak value: ${text(peak)}`);
  }
  const last = lead[lead.length - 1];
  const end = host.FindChildTraverse("NSGraphEnd");
  assert.equal(text(end), `+${(Math.abs(last.l) / 1000).toFixed(1)}K`, "the final lead");
  assert.ok(end.classes.has(last.l < 0 ? "NSEndTeam2" : "NSEndTeam1"), "in the leader's colour");
  assert.ok(Math.abs(px(end, "marginTop") + 11 - Math.max(11, Math.min(H - 11, last.y))) <= 2, "level with the line's end");
  // Captions name the header's teams.
  assert.ok(text(host.FindChildTraverse("NSGraphTop")).includes("HIDDEN KING") && text(host.FindChildTraverse("NSGraphBottom")).includes("ARCHMOTHER"), "captions from the header");
  // No match cards here: a forged Observer HUD handoff (OHM1 on ClientUI_FireOutput) changes nothing.
  w.fire("ClientUI_FireOutput", `OHM1:${JSON.stringify({ a: m.teams[0].map((p) => Number(p.account)), b: m.teams[1].map((p) => Number(p.account)), t: [["Night Owls", "NOW", ""], ["Brass Saints", "BRS", ""]], r: ["", ""], w: 0, id: "", at: 7000 })}`);
  w.advance(500);
  assert.ok(text(host.FindChildTraverse("NSGraphTop")).includes("HIDDEN KING") && text(host.FindChildTraverse("NSGraphBottom")).includes("ARCHMOTHER"), "captions keep the stock names");
  // The reveal finishes.
  assert.equal(String(host.FindChildTraverse("NSGraphDraw").style.clip), "rect( 0%, 100%, 100%, 0% )", "fully revealed");
  // How it failed live (2026-10-29, 1600x900): 1 px strokes are 0.83 screen px at UI scale 0.83 and drop out
  // by sub-pixel position (the 5:00 guide and most objective drop lines were missing). Nothing under 2 px.
  const painted = host.FindChildTraverse("NSGraphCanvas").__draws || [];
  assert.ok(painted.length >= 10, `strokes painted: ${painted.length}`);
  const thin = painted.filter((d) => d.thickness < 2);
  deq(thin.map((d) => `${d.thickness}px ${d.color}`), [], "every canvas stroke is at least 2 px");
  assert.ok(noBoardErrors(w));
});

check("board: a hovered item is drawn over its neighbours and the next players' items; it drops back when the mouse leaves", () => {
  // Live (client 6819, 2026-10-26): the stock :hover scales an item 1.5x; later siblings (the next item, the
  // next wrapped row, the next player's column) drew over it. ItemsContainer gets onmouseover/onmouseout when
  // any of its items is hovered, BHasHoverStyle names the item and an inline z-index lifts it.
  const w = boardWorld();
  w.boot();
  w.advance(1000);
  present(w, pgMatch(121685912));
  w.advance(3000);
  const rows = w.scoreboard.FindChildTraverse("Team1").FindChildTraverse("TeamPlayers").children;
  const items = rows[0].FindChildTraverse("ItemsContainer");
  const icons = items.children;
  const z = (p) => String(p.style.zIndex ?? "");
  const chain = [];
  for (let p = items; p && p !== w.scoreboard; p = p.GetParent()) chain.push(p);
  assert.equal(typeof items.events.onmouseover, "function", "the items listen for the mouse");
  icons[2].hovered = true;
  items.hovered = true;
  items.events.onmouseover();
  w.advance(100);
  assert.equal(z(icons[2]), "1", "the hovered item is above the other items");
  assert.ok(icons.every((p, i) => i === 2 || z(p) !== "1"), "only that item");
  for (const p of chain) assert.equal(z(p), "1", `${p.id || p.paneltype} is above its siblings (the next players' items)`);
  icons[2].hovered = false;
  icons[4].hovered = true;
  w.advance(100);
  deq([z(icons[4]), z(icons[2])], ["1", "0"], "the mouse moved to another item of the same player");
  let reads = 0;
  for (const icon of icons) icon.BHasHoverStyle = function () { reads++; return !!this.hovered; };
  icons[4].hovered = false;
  items.hovered = false;
  items.events.onmouseout();
  w.advance(100);
  assert.ok(icons.every((p) => z(p) !== "1") && chain.every((p) => z(p) === "0"), "all back down");
  const after = reads;
  w.advance(5000);
  assert.equal(reads, after, "nothing is polled once the mouse left");
  assert.ok(noBoardErrors(w));
});

// ---------------------------------------------------------------- standalone pak (pak11)

const SHIPPED = (() => {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(path.join(MODULE, "panorama"), full).replace(/\\/g, "/"));
    }
  };
  walk(path.join(MODULE, "panorama"));
  return out.sort();
})();

check("copy: a click on the header match id copies it the stock way, says so, and comes back; a failing stock route falls back to a selected TextEntry", () => {
  // How it could fail: the label takes no click (hittest off, or an ancestor blocks children); the stock event
  // does not reach the page; the feedback
  // stays, or an old timer overwrites a newer match; a throwing route leaves nothing copied or claims success.
  const board = read("panorama/layout/detailed_postgame/pg_board.xml");
  assert.match(board, /<Label id="NSMatch"[^>]*hittest="true"[^>]*onmouseover="UIShowTextTooltip\( #Citadel_PostGame_CopyMatchID \)"[^>]*onmouseout="UIHideTextTooltip\(\)"/);
  assert.ok(!/hittestchildren="false"/.test(board), "no ancestor blocks the label");
  assert.match(board, /<TextEntry id="NSCopyEntry" class="NSCopyEntry" hittest="false"/);
  const w = boardWorld({ graph: { duration: 31 * 60 + 7, souls: [140000, 150000] } });
  w.boot();
  const a = pgMatch(121685912);
  present(w, a);
  w.advance(20000);
  const label = w.boardHost().FindChildTraverse("NSMatch");
  assert.equal(w.text("NSMatch"), "MATCH 121685912");
  assert.equal(typeof label.events.onactivate, "function", "the label has a click handler");
  label.events.onactivate();
  // The page callback copies the page's match id; the source only anchors the stock feedback (0x181b2bcb0).
  deq(w.copy.stock.map((p) => p === label), [true], "CitadelPostGameCopyMatchID from #NSMatch");
  deq(w.copy.entry, [], "no fallback needed");
  assert.equal(w.text("NSMatch"), "MATCH ID COPIED");
  assert.ok(label.BHasClass("NSCopied"));
  w.advance(1000);
  label.events.onactivate(); // a second click restarts the feedback
  w.advance(1000);
  assert.equal(w.text("NSMatch"), "MATCH ID COPIED", "the first click's timer does not end the second's");
  w.advance(1000);
  assert.equal(w.text("NSMatch"), "MATCH 121685912");
  assert.ok(!label.BHasClass("NSCopied"));
  // The next match on the reused rows while "copied" shows: its own id, no stale restore.
  label.events.onactivate();
  const b = pgMatch(121917141, { swap: true, win: 2 });
  present(w, b);
  w.advance(3000);
  assert.equal(w.text("NSMatch"), "MATCH 121917141");
  assert.ok(!label.BHasClass("NSCopied"));
  // A throwing stock route: the id goes through the selected TextEntry instead.
  w.copy.stockThrows = true;
  label.events.onactivate();
  deq(w.copy.entry, [{ text: "121917141", selected: true, focused: true }], "fallback copies the bare id");
  assert.equal(w.text("NSMatch"), "MATCH ID COPIED");
  assert.ok(w.harness.logs.some((l) => l === "[DPS] match id copied (entry)"));
  assert.ok(noBoardErrors(w));
});

check("standalone: only its own detailed_postgame files, every include resolves, the page is the pinned stock page plus the loader", () => {
  // How it could fail: a path still points at observer_hud/ (pak10's files would load, or nothing); an
  // include names a file the pak does not ship; the page drifts from stock when Valve changes it.
  const expected = ["layout/post_game/citadel_db_page_post_game_new.xml", "layout/detailed_postgame/pg_board.xml", "layout/detailed_postgame/pg_column.xml",
    "scripts/detailed_postgame/pg_board.js", "scripts/detailed_postgame/pg_loader.js", "styles/detailed_postgame/pg_board.css"]
    .concat(["torn_award", "torn_graph", "torn_head_l", "torn_head_r", "torn_track"].flatMap((n) => [`images/detailed_postgame/${n}.png`, `images/detailed_postgame/${n}.vtex`]));
  deq(SHIPPED, expected.sort(), "the source tree is exactly the board");
  const compiled = { vjs_c: "js", vcss_c: "css", vxml_c: "xml", vtex: "vtex" };
  for (const rel of SHIPPED.filter((f) => !f.endsWith(".png"))) {
    const text = read(`panorama/${rel}`);
    assert.ok(!/(?:s2r:\/\/|file:\/\/\{resources\}\/)[^"]*observer_hud|OHState/.test(text), `${rel} loads no Observer HUD file`);
    for (const [, file, ext] of text.matchAll(/s2r:\/\/panorama\/([\w/]+)\.(vjs_c|vcss_c|vxml_c|vtex)/g)) {
      if (!file.includes("detailed_postgame/")) continue; // a stock asset (masks, textures)
      assert.ok(SHIPPED.includes(`${file}.${compiled[ext]}`), `${rel}: ${file}.${ext} is shipped`);
    }
    for (const [, file] of text.matchAll(/file:\/\/\{resources\}\/(layout\/detailed_postgame\/[\w/]+\.xml)/g)) assert.ok(SHIPPED.includes(file), `${rel}: ${file} is shipped`);
  }
  for (const rel of SHIPPED.filter((f) => f.endsWith(".vtex"))) assert.ok(read(`panorama/${rel}`).includes(`"panorama/${rel.replace(/\.vtex$/, ".png")}"`), `${rel} reads its own png`);
  // The page: the stock page pinned by Observer HUD (the same GameTracking pin) plus our include, minus the flame src.
  const pin = JSON.parse(fs.readFileSync(path.join(REPO, "observer_hud", "stock-pin.json"), "utf8"));
  const flame = ' src="file://{resources}/videos/pick_screen/play_btn_grn_flame.webm"';
  const page = read("panorama/layout/post_game/citadel_db_page_post_game_new.xml");
  assert.ok(!page.includes(flame), "flame src dropped");
  assert.equal(page.split("detailed_postgame/pg_loader.vjs_c").length, 2, "one loader include");
  const restored = page.replace('\t\t<include src="s2r://panorama/scripts/detailed_postgame/pg_loader.vjs_c" />\n', "")
    .replace('<MoviePanel id="PlayButtonFX" class="btn_fx"', `<MoviePanel id="PlayButtonFX" class="btn_fx"${flame}`);
  assert.equal(crypto.createHash("sha256").update(restored).digest("hex"),
    pin.files["game/citadel/pak01_dir/panorama/layout/post_game/citadel_db_page_post_game_new.xml"], "post-game page = stock + loader - flame src");
  assert.match(read("panorama/scripts/detailed_postgame/pg_loader.js"), /play_btn_grn_flame\.webm/);
});

check("standalone: no observer extras - no web page, no handoff listener, stock team names, no organiser or alias", () => {
  // How it could fail: a leftover store call loads a hosted page for every match; a leftover handoff
  // listener lets another mod's OHM1 message rename the teams; the header or graph shows a card's names.
  for (const name of ["pg_board.js", "pg_loader.js"]) {
    const js = script(name);
    for (const bad of [/https?:\/\//, /SetURL/, /CitadelHTMLPanel/, /ClientUI_FireOutput/, /\$\.OHState/, /\bOH\./]) assert.ok(!bad.test(js), `${name}: no ${bad}`);
  }
  const w = boardWorld({ graph: { duration: 31 * 60 + 7, souls: [140000, 150000] } });
  w.boot();
  const m = pgMatch(121917141);
  present(w, m);
  w.advance(20000);
  assert.equal(w.shown(), 1, "the board is shown");
  deq(w.bus.map((e) => e.name), ["CitadelMatchDetailsUpdated"], "one listener: the match event");
  w.fire("ClientUI_FireOutput", `OHM1:${JSON.stringify({ a: m.teams[0].map((p) => Number(p.account)), b: m.teams[1].map((p) => Number(p.account)), t: [["Night Owls", "NOW", "https://img.test/o.png"], ["Brass Saints", "BRS", ""]], r: ["Community Cup", ""], w: 1, id: "", at: 7000 })}`);
  w.advance(2000);
  deq([w.text("NSTeamName1"), w.text("NSTeamName2")], ["Hidden King", "Archmother"], "stock team names");
  assert.equal(findAll(w.dash, "CitadelHTMLPanel").length, 0, "no web panel");
  assert.equal(findAll(w.dash, "Image").length, 0, "no logo image");
  assert.ok(!w.boardHost().FindChildTraverse("NSOrgText") && !w.boardHost().FindChildTraverse("NSAlias"), "no organiser or alias labels");
  // Steam names from our own CitadelUserName on each plate.
  const plates = w.columns().map((c) => c.FindChildTraverse("NSPlate"));
  assert.equal(plates.length, 12);
  for (const plate of plates) assert.ok(findAll(plate, "CitadelUserName").length === 1, "one name per plate");
  assert.ok(!w.harness.logs.some((l) => /store|alias|card/i.test(l)), "no store, alias or card lines");
  assert.ok(w.harness.logs.some((l) => l.startsWith("[DPS] scan done")), "the scan finished");
  assert.ok(noBoardErrors(w));
});


const out = path.join(REPO, ".tmp", "detailed-postgame-validate.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`${results.checks.length} checks passed; artifact ${path.relative(REPO, out)}`);