"use strict";
// Observer HUD validator (end-to-end in the Panorama VM harness).
//   node observer_hud/scripts/validate-observer-hud.js
// Boots the real host scripts in the real stock hud.xml tree (pinned GameTracking copies in stock/):
// #TopBar built from the stock top-bar, team and player layouts, #EscapeMenu from the stock Escape
// menu (and once from HP Colors v3's), the spectate bar from this mod's override. The mod's own
// layouts load through BLoadLayout into the panels the host creates. World healthbars are the stock
// overlay with this mod's citadel_status_effect.xml inside, each running the real world sampler and
// its sibling relay, all on one ClientUI_FireOutput bus with the HUD.
// OH_RUNTIME_ROOT=<staged panorama dir> runs every VM scenario on the built (Closure) scripts.
// OH_CHECK=<text> runs only matching checks. Writes .tmp/observer-hud-validate.json.
//
// How it can fail (PLAN.md "How it can fail"), each with a check below:
//  1. the host loads before the HUD or its panels exist, or outside spectating does work;
//  2. a layout reload runs the host twice and injects panels twice or keeps two loops;
//  3. the engine rebuilds a card and drops its status column, or a card's name lands on the wrong card;
//  4. another mod's top bar or Escape menu lacks an id; the rest must still work;
//  5. the plates overlap at 16:10 or 1920x1200 (fit rules);
//  6. a logo URL fails or is hostile (monogram stays, URL rejected and never logged);
//  7. the editor's controls do not reach the state, or clicks fall through (backdrop first);
//  8. edits and share codes race or corrupt the state (normalize, codes, reset);
//  9. steady-state cost: writes while nothing changes, or work outside spectating;
// 10. the status-effect host costs too much on non-hero and HUD lists, or misses heroes it sees late;
// 11. the world stylesheet or selector breaks every healthbar (short selector, stock + includes only);
// 12. spec drift: world RULES differ from dlf/spectator-status.json;
// 13. forged, stale or recycled-bar messages draw wrong statuses;
// 14. the two looks (Base Game+ Names, Night Desk) leak into each other, or the stock top bar is not
//     moved down by the band (or stays moved after spectating);
// 15. the soul lead graph misdates pins (late join, demo seek), draws a line over a gap, or shows when off;
// 16. the stock objective health stays behind the timers or the rift HUD, the graph covers it or sits a
//     whole stock panel lower while both show, or the panel's margin chases a lagging layout pass.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { MockPanel, createPanoramaHarness, createVmContext, runInVm } =
  require("../../scripts/hp-colors-panorama-test-adapter.js");

// VM objects come from other realms: compare their JSON.
// The local save page (hpv2-store /oh/) runs behind a fake CEF panel: SetURL with the page URL runs the
// real page script against a disk object that survives simulated restarts (one world per process);
// its title comes back through the panel's HTMLTitle handler 50 ms later. A load made while offline,
// or one of the next web.lostLoads loads, leaves a dead document (an error page): later URLs that only
// change the fragment reach nothing until the panel navigates elsewhere (about:blank) and back.
// Two pages run behind it: v2 (this pak) and v1 (released paks, which must keep working beside it).
const STORE_PAGE = process.env.OH_STORE_PAGE || "D:/hpv2-store/oh/v2/index.html";
const STORE_URL = "https://hantu-raya.github.io/hpv2-store/oh/v2/";
const V1_PAGE = "D:/hpv2-store/oh/index.html";
const V1_URL = "https://hantu-raya.github.io/hpv2-store/oh/";
// A missing page stops the run with its path (an empty script used to fail a dozen store checks with
// errors that named something else).
const pageScript = (file) => {
  if (!fs.existsSync(file)) {
    console.error(`not ok - the hosted store page is missing: ${file} (clone Hantu-Raya/hpv2-store there, or set OH_STORE_PAGE for the v2 page)`);
    process.exit(1);
  }
  return /<script>([\s\S]*)<\/script>/.exec(fs.readFileSync(file, "utf8"))[1];
};
const storeScript = pageScript(STORE_PAGE);
const v1Script = pageScript(V1_PAGE);
const PAGE_SCRIPTS = { [STORE_URL]: storeScript, [V1_URL]: v1Script };
// The store page's clock follows the harness (cards expire 2 days after their at).
const PAGE_NOW = 7000000;
const clockDate = (nowMs) => class extends Date {
  constructor(...args) { if (args.length) super(...args); else super(nowMs()); }
  static now() { return nowMs(); }
};
// The engine throws when an alias style property (marginTop, verticalAlign, fontSize, ...) is cleared with null
// (live 6860); the fake does too, so a restore that would throw in the game fails here.
MockPanel.strictAliasNull = true;
// UICanvas (client.dll 6819, ui_canvas.cpp, static RE): ClearJS(color) and
// DrawSoftLinePointsJS(nPoints, [x0, y0, x1, y1, ...], thickness, softness, color); a bad colour draws white.
MockPanel.prototype.ClearJS = function (color) { this.__draws = []; this.__clear = color; };
MockPanel.prototype.DrawSoftLinePointsJS = function (n, points, thickness, softness, color) {
  (this.__draws = this.__draws || []).push({ n, pts: Array.from(points), thickness, softness, color });
};
MockPanel.prototype.SetURL = function (url) {
  let root = this;
  while (root.GetParent()) root = root.GetParent();
  const web = root.__web;
  if (!web) return true;
  (web.urls = web.urls || []).push(String(url));
  const base = String(url).split("#")[0];
  if (!PAGE_SCRIPTS[base]) { this.__page = null; return true; }
  if (this.__page && this.__page.base !== base) this.__page = null; // another page: a fresh load
  const panel = this;
  if (panel.__page && panel.__page.dead) return true;
  if (!panel.__page && (web.offline || web.lostLoads > 0)) {
    if (!web.offline) web.lostLoads--;
    panel.__page = { dead: true, base };
    return true;
  }
  if (!panel.__page) {
    const page = { title: "", hash: "", href: url, base, listeners: [] };
    page.sandbox = {
      window: { addEventListener: (name, fn) => { if (name === "hashchange") page.listeners.push(fn); } },
      location: { get hash() { return page.hash; }, get href() { return page.href; } },
      document: { set title(value) { page.title = value; }, get title() { return page.title; } },
      localStorage: {
        getItem: (key) => Object.prototype.hasOwnProperty.call(web.disk, key) ? web.disk[key] : null,
        setItem: (key, value) => { web.disk[key] = String(value); },
        removeItem: (key) => { delete web.disk[key]; }
      },
      JSON, Math, Error, String, decodeURIComponent, Date: clockDate(() => web.harness.now)
    };
    page.hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
    panel.__page = page;
    // web.loadDelay (ms): the page runs only after the load; leaving it before then cancels the load.
    const run = () => {
      if (panel.__page !== page) return;
      page.live = true;
      vm.runInNewContext(PAGE_SCRIPTS[base], page.sandbox);
      emitTitle(panel, web);
    };
    if (web.loadDelay) web.harness.scheduler.schedule(web.loadDelay / 1000, run);
    else run();
    return true;
  }
  panel.__page.href = url;
  panel.__page.hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
  if (!panel.__page.live) return true;
  for (const fn of panel.__page.listeners) fn();
  emitTitle(panel, web);
  return true;
};
function emitTitle(panel, web) {
  // The game cuts HTMLTitle at 4096 characters (live P7, 2026-10-25).
  const title = String(panel.__page.title).slice(0, 4096);
  const deliver = () => {
    if (panel.events.HTMLTitle) panel.events.HTMLTitle(panel, title);
    for (const fn of ((panel.__handlers || {}).HTMLTitle || []).slice()) fn(panel, title);
  };
  // web.hold keeps replies back until web.release() (a late reply).
  if (web.hold) (web.held = web.held || []).push(deliver);
  else if (!web.mute) web.harness.scheduler.schedule(0.05, deliver);
}

const plain = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const deq = (actual, expected, message) => assert.deepEqual(plain(actual), plain(expected), message);
MockPanel.prototype.SetHeroID = function (id) { this.heroId = id; };
MockPanel.prototype.BHasKeyFocus = function () { return !!this.keyFocus; };

const MODULE = path.join(__dirname, "..");
const REPO = path.join(MODULE, "..");
const PANORAMA = path.join(MODULE, "panorama");
const read = (rel) => fs.readFileSync(path.join(MODULE, rel), "utf8").replace(/\r\n/g, "\n");
const readRepo = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8").replace(/\r\n/g, "\n");
const RUNTIME = process.env.OH_RUNTIME_ROOT ? path.resolve(process.env.OH_RUNTIME_ROOT) : null;
const script = (name) => RUNTIME ? fs.readFileSync(path.join(RUNTIME, "scripts/observer_hud", name), "utf8")
  : read(`panorama/scripts/observer_hud/${name}`);
if (RUNTIME) console.log(`runtime scripts from ${RUNTIME}`);
const results = { checks: [], runs: [], budgets: null };
// Steady-state budget while spectating (synthetic native calls per second); see the steady-state check.
// Measured 2026-10-22 (v2): 1259.2/s spectating (12 hero bars at the 0.25 s poll, 60 idle bars, host with band, names and
// graph sampling, column), 13.2/s not spectating. 2026-10-23 (design 19): 1295.8/s before the objective health
// placement, 1300.8/s with it (the stock panel's parent rect and one class query per second).
// Synthetic native calls per second, live-like scenario (2026-10-23 audit with m1: spectating 1451.8 -> 1189.8,
// idle 13.7 -> 11.7, every card counting down 2067.6 -> 1575.2; deferred items with m2: team-panel cache,
// column idles after spectating, card registry: spectating 1106.4, countdown 1443.8, after spectating
// 101.9 -> 14.7). Aliases on the far-away markers (2026-10-23): the scenario gained the 12 stock
// markers; their names are read once a second while an alias exists: spectating 1106.4 -> 1120.4,
// countdown 1443.8 -> 1457.8. Kill feed placement (2026-10-23, the stock #EventFeed in the scenario):
// spectating 1123.4, countdown 1465.0. Kill feed aliases (2026-10-23, the scenario's alias): a 0.25 s
// child count watch plus one rows pass a second: spectating 1129.4, countdown 1471.0. Ultimate cooldown
// (2026-10-23): each card's source label is read at 2 Hz while spectating (24 text reads and 2 schedules a
// second): spectating 1155.4, countdown 1497.0. Re-measure before raising.
// 2026-10-25 (phase 1 of decisions/postgame-identity-perf-plan.md): the budgets are weighted, in
// microseconds of native time per second. Each counted operation is priced at its live per-call cost
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
// Measured 2026-10-25 before -> after the quick-poll world sampler, the watch gate and the respawn wake:
// spectating 361 -> 216.2, counting down 483.8 -> 274.3, playing with pak10 installed 310.5 -> 4.3,
// not spectating 4.3, after spectating 4.8 us/s. Re-measure before raising.
// 2026-11-06: the status sweep (user request) writes each counting slot's clip at the 0.25 s tick, where
// the seconds wrote text once a second: counting down 262.9 -> 304.9 us/s with 12 counting slots.
const BUDGET_US = { spectating: 222, countdown: 310, idle: 6, after: 6, playing: 6, scan: 12 };
// The post-game board (plan phase 2): at most 11 native calls per second while its page shows and
// nothing changes; while hidden one visibility check a second (a reopen can bring no event, live).
const BUDGET_BOARD = { calls: 11, us: 3, hiddenUs: 2 };
const ATTRIB = { on: !!process.env.OH_ATTRIB, map: new Map() };

let lastLogs = null;
// Engine model (ENGINE.md, live 2026-10-23): after style.visibility = "collapse", writing null clears the
// inline value but the panel stays hidden. The same for an inline opacity "0" cleared with null (user
// report 2026-11-03: the stock lobby name stayed invisible after RESET ALL removed its alias). Every
// check fails if any panel of its worlds got either sequence.
const WORLDS = [];
const STUCK = { visibility: "collapse", opacity: "0" };
function stuckHidden() {
  const stuck = [];
  const visit = (panel) => {
    const hidden = {};
    for (const { property, value } of panel.__styleWrites || []) {
      if (!(property in STUCK)) continue;
      if (String(value) === STUCK[property]) hidden[property] = true;
      else if (value === null && hidden[property]) stuck.push(`${panel.id || panel.paneltype}.${property}`);
      else if (value) hidden[property] = false;
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
  if (process.env.OH_CHECK && !name.includes(process.env.OH_CHECK)) return;
  WORLDS.length = 0;
  try {
    fn();
    const stuck = stuckHidden();
    assert.deepEqual(stuck, [], `collapse / opacity 0 then null leaves these hidden live: ${stuck.join(", ")}`);
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

const STOCK = {
  hud: parseLayout(read("stock/hud.xml")),
  paused: parseLayout(read("stock/hud_paused.xml")),
  topBar: parseLayout(read("stock/citadel_hud_top_bar.xml")),
  team: parseLayout(read("stock/citadel_hud_top_bar_team.xml")),
  player: parseLayout(read("stock/citadel_hud_top_bar_player.xml")),
  escape: parseLayout(read("stock/hud_escape_menu.xml")),
  overlay: parseLayout(read("stock/unit_status_overlay_v2.xml")),
  shop: parseLayout(read("stock/citadel_hud_hero_shop.xml")),
  // The shop's purchase row: the engine loads this snippet into each new #RecentPurchasesContainer child.
  purchase: parseLayout(/<snippet name="RecentPurchase">([\s\S]*?)<\/snippet>/.exec(read("stock/citadel_hud_hero_shop.xml"))[1]),
  // A far-away hero marker: the engine loads this snippet into CitadelHudUnitIndicatorsV2#unit_indicators_v2
  // per player (CitadelUserName#PlayerName holds the name Label; stock CSS "#PlayerName Label").
  indicator: parseLayout(/<snippet name="PlayerEntry">([\s\S]*?)<\/snippet>/.exec(read("stock/hud_unit_indicators_v2.xml"))[1]),
  // The kill feed: HudDataFeed#DataFeed loads this; #EventFeed (top left, margin-top 200px) holds the rows.
  dataFeed: parseLayout(read("stock/hud_data_feed.xml")),
  // A kill row (CitadelHudInfoFeed): killer and victim names bound to {s:killer_name} / {s:victim_name}.
  feedInfo: parseLayout(read("stock/citadel_hud_data_feed_info.xml"))
};
const OWN = {
  spectate: parseLayout(read("panorama/layout/hud_spectate_bar.xml")),
  status: parseLayout(read("panorama/layout/citadel_status_effect.xml")),
  bar: parseLayout(read("panorama/layout/observer_hud/tournament_bar.xml")),
  band: parseLayout(read("panorama/layout/observer_hud/band.xml")),
  debuffs: parseLayout(read("panorama/layout/observer_hud/debuffs.xml")),
  urn: parseLayout(read("panorama/layout/observer_hud/urn.xml")),
  editor: parseLayout(read("panorama/layout/observer_hud/editor.xml")),
  relay: parseLayout(read("panorama/layout/observer_hud/debuff_relay.xml")),
  lobbyAlias: parseLayout(read("panorama/layout/observer_hud/lobby_alias.xml")),
  lobbySetup: parseLayout(read("panorama/layout/observer_hud/lobby_setup.xml")),
  lobbyShare: parseLayout(read("panorama/layout/observer_hud/lobby_share.xml"))
};
const HPV3_ESCAPE = path.join(REPO, "hp_colors_rewrite_v3/panorama/layout/hud_escape_menu.xml");
const HOST_FILES = ["oh_state.js", "oh_heroes.js", "oh_debuff_icons.js", "oh_item_icons.js", "oh_host.js", "oh_menu.js",
  "oh_debuffs.js", "oh_buys.js", "oh_link.js"];
const ITEM_ICONS = new vm.Script(`${read("panorama/scripts/observer_hud/oh_item_icons.js")}\nOH_ITEM_ICONS`).runInNewContext({});
const HEROES = new vm.Script(`${read("panorama/scripts/observer_hud/oh_heroes.js")}\nOH_HEROES`).runInNewContext({});

const AMBER = ["Kestrel", "Moth", "Doyle", "Frostbyte", "Vesper", "Ironclad"];
const SAPPHIRE = ["Volt", "Mole", "Geist", "Talon", "Pocketwatch", "Tidal"];
// Each card's hero: [m_HeroID, retail name] from the ban picker table, Amber the first six, Sapphire the next.
const heroOf = (player) => HEROES[AMBER.includes(player) ? AMBER.indexOf(player) : 6 + SAPPHIRE.indexOf(player)];

// ---------------------------------------------------------------- the world: HUD + world bars on one bus

// A Label text as the engine keeps it: "{s:key}" or "{i:key}" stays bound to the nearest ancestor's dialog
// variable (it follows later changes of that variable); any other text is literal. Writing the label's
// text rebinds or unbinds it the same way.
function bindText(label, value) {
  let literal = String(value);
  Object.defineProperty(label, "__text", { configurable: true, enumerable: false,
    get: () => {
      const bound = /^\{[si]:(\w+)\}$/.exec(literal);
      if (!bound) return literal;
      let owner = label.parent;
      while (owner && !(owner.__dialog && bound[1] in owner.__dialog)) owner = owner.parent;
      return owner ? String(owner.__dialog[bound[1]]) : literal;
    },
    set: (next) => { literal = String(next); } });
  return label;
}

function world({ width = 1920, height = 1080, scale = 1, escape = "stock", spectating = true, gameTime = true,
  teamsAt = null, samples = false, disk = null, offline = false } = {}) {
  const harness = createPanoramaHarness({ now: 7000000, rootWidth: width, rootHeight: height });
  lastLogs = harness.logs;
  const bus = [];
  const sent = [];
  const loads = [];
  const urls = []; // ExternalBrowserGoToURL targets
  let nextId = 1;
  const contexts = new Map(); // panel -> [vm contexts]
  const dollar = (panel) => ({
    GetContextPanel: () => panel,
    CreatePanel: (type, parent, id, props = {}) => {
      const created = new MockPanel(type, parent, id);
      for (const [key, value] of Object.entries(props)) {
        if (key === "class") created.classes = String(value).split(/\s+/).filter(Boolean);
        else if (key === "text") bindText(created, value);
        else created.attributes[key] = String(value);
      }
      return created;
    },
    Schedule: (delay, fn) => harness.scheduler.schedule(delay, fn),
    RegisterForUnhandledEvent: (name, fn) => { bus.push({ id: nextId, name, fn, panel }); return nextId++; },
    UnregisterForUnhandledEvent: (name, id) => {
      const index = bus.findIndex((entry) => entry.id === id);
      if (index >= 0) bus.splice(index, 1);
    },
    RegisterEventHandler: (name, target, fn) => { target.events[name] = fn; },
    DispatchEvent: (name, ...args) => {
      if (name === "ClientUI_FireOutput") {
        sent.push(String(args[0]));
        for (const entry of bus.slice()) if (entry.name === name) entry.fn(args[0]);
      } else if (name === "Activated" && args[0] && args[0].events.onactivate) {
        args[0].events.onactivate();
      } else if (name === "TextEntryCopyToClipboard") {
        harness.clipboardWrites.push(String(args[0].text || ""));
        return true;
      } else if (name === "TextEntryInsertFromClipboard") {
        args[0].text = harness.clipboardText;
      } else if (name === "ExternalBrowserGoToURL") {
        urls.push(String(args[0]));
      }
      return true;
    },
    Msg: (message) => harness.logs.push(String(message))
  });
  const runIn = (panel, files) => {
    const context = createVmContext(harness, { globals: { $: dollar(panel) } });
    for (const [name, source] of files) runInVm(source, context, name);
    if (!contexts.has(panel)) contexts.set(panel, []);
    contexts.get(panel).push(context);
    return context;
  };
  const LAYOUTS = {
    "file://{resources}/layout/observer_hud/tournament_bar.xml": OWN.bar,
    "file://{resources}/layout/observer_hud/band.xml": OWN.band,
    "file://{resources}/layout/observer_hud/debuffs.xml": OWN.debuffs,
    "file://{resources}/layout/observer_hud/urn.xml": OWN.urn,
    "file://{resources}/layout/observer_hud/editor.xml": OWN.editor,
    "file://{resources}/layout/observer_hud/lobby_alias.xml": OWN.lobbyAlias,
    "file://{resources}/layout/observer_hud/lobby_setup.xml": OWN.lobbySetup,
    "file://{resources}/layout/observer_hud/lobby_share.xml": OWN.lobbyShare
  };
  MockPanel.prototype.BLoadLayout = function (file) {
    loads.push(file);
    if (file === "file://{resources}/layout/observer_hud/debuff_relay.xml") {
      loadInto(this, OWN.relay);
      runIn(this, [["oh_debuff_relay.js", script("oh_debuff_relay.js")]]);
      return true;
    }
    if (!LAYOUTS[file]) return false;
    loadInto(this, LAYOUTS[file]);
    this.actualuiscale_x = scale;
    return true;
  };

  // Live ancestry (spike): CitadelHudSpectateBar#spectate_bar > ... > CitadelHud#Hud > Panel#CitadelHudRoot.
  // CitadelHudRoot is the top panel (no parent), as live; it shares the harness's counters.
  const hudRoot = new MockPanel("CitadelHudRoot", { operationCounts: harness.operationCounts, findCounts: harness.findCounts,
    childReadCounts: harness.childReadCounts, eventSetCounter: harness.eventSetCounter });
  WORLDS.push(hudRoot);
  // The save page: a disk shared between worlds is one PC's localStorage across restarts.
  hudRoot.__web = { disk: disk || {}, offline, harness, release() { const held = this.held || []; this.held = []; for (const fn of held) fn(); } };
  // Most checks start from blank text (no sample values): the side names, no event, stage, organiser
  // or info card, as an observer who cleared the samples. samples: true keeps the shipped defaults.
  if (!samples && !disk) { // a world with a save disk is a fresh process: nothing carried
    hudRoot.SetAttributeString("observer_hud_state", JSON.stringify({ event: "", stage: "",
      amber: { name: "", tag: "" }, sapphire: { name: "", tag: "" }, org: { name: "" }, info: { title: "", value: "", caption: "" } }));
  }
  const hud = instantiate(STOCK.hud, hudRoot);
  hud.id = "Hud";
  const topBar = hud.FindChildTraverse("TopBar");
  loadInto(topBar, STOCK.topBar);
  const teams = {};
  const fillTeam = (team, names) => {
    loadInto(team, STOCK.team);
    const players = team.FindChildTraverse("PlayersContainer");
    return names.map((name) => {
      const card = instantiate(STOCK.player, players);
      for (const label of card.FindChildrenWithClassTraverse("AlwaysPlayerName")
        .concat(card.FindChildrenWithClassTraverse("PlayerName"))) label.__text = name;
      card.FindChildTraverse("HeroBadge").heroid = heroOf(name)[0];
      card.FindChildrenWithClassTraverse("HeroName")[0].__text = heroOf(name)[1];
      // The engine sets each card's ult_cooldown dialog variable on #UltimateStatusBG (0: ready or locked).
      card.FindChildTraverse("UltimateStatusBG").__dialog = { ult_cooldown: 0 };
      return card;
    });
  };
  const TEAM_NAMES = { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE };
  for (const teamId of Object.keys(TEAM_NAMES)) teams[teamId] = fillTeam(topBar.FindChildTraverse(teamId), TEAM_NAMES[teamId]);
  // The stock team panels are static children of #TeamsContainer (citadel_hud_top_bar.xml): they come
  // and go with that layout, never re-parented. remove() deletes one; rebuild() makes it again in place.
  const removedTeams = {};
  const removeTeam = (teamId) => {
    const old = topBar.FindChildTraverse(teamId);
    const parent = old.GetParent();
    removedTeams[teamId] = { parent, index: parent.children.indexOf(old), type: old.paneltype, classes: [...old.classes] };
    // Live, deleting a panel deletes its children; the adapter's DeleteAsync only marks the panel itself.
    const kill = (panel) => { for (const child of panel.children) kill(child); panel.valid = false; };
    kill(old);
    old.DeleteAsync();
  };
  const rebuildTeam = (teamId) => {
    const was = removedTeams[teamId];
    const team = new MockPanel(was.type, was.parent, teamId);
    was.parent.children.splice(was.parent.children.indexOf(team), 1);
    was.parent.children.splice(was.index, 0, team);
    for (const cls of was.classes) team.AddClass(cls);
    teams[teamId] = fillTeam(team, TEAM_NAMES[teamId]);
  };
  if (!gameTime) topBar.FindChildTraverse("GameTime").DeleteAsync();
  // The stock clock and soul plates (bound dialog variables in game).
  const clock = (value) => { const t = topBar.FindChildTraverse("GameTime"); if (t) t.__text = value; };
  const souls = (amber, sapphire) => {
    topBar.FindChildTraverse("TeamScoreFriendly").FindChildrenWithClassTraverse("ScoreLabel")[0].__text = amber;
    topBar.FindChildTraverse("TeamScoreEnemy").FindChildrenWithClassTraverse("ScoreLabel")[0].__text = sapphire;
  };
  clock("0:30");
  souls("1.2<font class='demote'>k</font>", "1.1<font class='demote'>k</font>");
  // The shop's purchase list: the engine appends a row per purchase (flow-children: up draws the newest on
  // top) and deletes the oldest at 25 rows (client.dll 6819, rva 0x1bdd790).
  loadInto(hud.FindChildTraverse("CitadelHudHeroShop"), STOCK.shop);
  const purchases = hud.FindChildTraverse("RecentPurchasesContainer");
  const buy = (player, item, { time = null, tier = 2, kind = "Weapon", heroName = null, heroId = null } = {}) => {
    if (purchases.children.length >= 25) purchases.children[0].DeleteAsync();
    const row = instantiate(STOCK.purchase, purchases);
    row.id = `RecentPurchase${purchases.children.length - 1}`;
    const [id, hero] = heroOf(player);
    const label = (cls) => row.FindChildrenWithClassTraverse(cls)[0];
    label("recentTimePurchased").__text = time === null ? topBar.FindChildTraverse("GameTime").__text : time;
    label("recentModPurchaseName").__text = item;
    // 6819's row has no hero name label; the engine still sets the dialog variable on the row.
    row.__dialog = { recent_hero_name: heroName === null ? hero : heroName };
    row.FindChildTraverse("RecentPurchaseHeroImage").heroid = heroId === null ? id : heroId;
    for (const cls of [AMBER.includes(player) ? "isTeam1Purchase" : "isTeam2Purchase", `isTier${tier}Purchase`, `is${kind}Purchase`]) row.AddClass(cls);
    return row;
  };
  // Far-away hero markers (stock hud_unit_indicators_v2.xml): one PlayerEntry per player; the native
  // CitadelUserName#PlayerName makes one Label holding the player's name (shown: what it displays,
  // e.g. a Steam friend nickname); the hero image carries heroid.
  const indicators = hud.FindChildTraverse("unit_indicators_v2");
  const marker = (player, { shown = player, heroId = null, account = 0, side = null } = {}) => {
    const entry = instantiate(STOCK.indicator, indicators);
    entry.AddClass("visible");
    entry.AddClass(side || (AMBER.includes(player) ? "team_1" : "team_2"));
    new MockPanel("Label", entry.FindChildTraverse("PlayerName"), "").__text = shown;
    entry.FindChildTraverse("HeroIcon").heroid = heroId === null ? heroOf(player)[0] : heroId;
    // Live (client 6819): CitadelUserName#PlayerName.accountid is 0 until the marker is first set, then
    // the player's Steam account (a bot stays 0); the 12th entry (the followed player) can stay 0.
    const holder = entry.FindChildTraverse("PlayerName");
    let value = String(account);
    holder.accountReads = 0;
    // A property read costs about a text read (P0: 200-250 ns), so the weighted budget counts it as one.
    Object.defineProperty(holder, "accountid", { configurable: true, set: (next) => { value = String(next); },
      get: () => { holder.accountReads++; if (holder.operationCounts) holder.operationCounts.textReads = (holder.operationCounts.textReads || 0) + 1; return value; } });
    return entry;
  };
  const markerName = (entry) => entry.FindChildTraverse("PlayerName").Children()[0];
  // The stock kill feed: #EventFeed sits at its margin-top (stock 200 layout px; an inline margin moves
  // it, as the engine lays it out); killRow adds an entry of a given screen width.
  loadInto(hud.FindChildTraverse("DataFeed"), STOCK.dataFeed);
  const eventFeed = hud.FindChildTraverse("EventFeed");
  Object.defineProperty(eventFeed, "actualyoffset", { configurable: true,
    get: () => { const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(eventFeed.style.marginTop || "")); return m ? Number(m[1]) : 200; },
    set: () => {} });
  // A kill row of a given screen width; with { killer, victim } it is a stock CitadelHudInfoFeed whose
  // dialog variables the engine set (killerHero / victimHero: the hero images' heroid).
  const killRow = (widthPx, kill = null) => {
    const row = kill ? instantiate(STOCK.feedInfo, eventFeed) : new MockPanel("Panel", eventFeed, "");
    row.actuallayoutwidth = widthPx;
    if (kill) {
      row.__dialog = { killer_name: kill.killer, victim_name: kill.victim };
      for (const label of row.FindChildrenWithClassTraverse("personaName")) bindText(label, label.__text);
      row.FindChildTraverse("KillerImage").heroid = kill.killerHero || 0;
      row.FindChildTraverse("VictimImage").heroid = kill.victimHero || 0;
    }
    return row;
  };
  const feedNames = (row) => ["killerInfo", "victimInfo"].map((cls) => row.FindChildrenWithClassTraverse(cls)[0].text);
  const escapeMenu = hud.FindChildTraverse("EscapeMenu");
  if (escape === "stock") loadInto(escapeMenu, STOCK.escape);
  else if (escape === "hpv3") loadInto(escapeMenu, parseLayout(fs.readFileSync(HPV3_ESCAPE, "utf8")));
  else escapeMenu.DeleteAsync();
  const spectateBar = hud.FindChildTraverse("spectate_bar");
  loadInto(spectateBar, OWN.spectate);
  if (spectating) for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) hud.AddClass(cls);

  // Geometry (screen px): the HUD scales by height; layout px = screen px / scale.
  const geometry = ({ friendX, enemyX, teamW = 528 } = {}) => {
    for (const panel of [hudRoot, hud, topBar]) { panel.actuallayoutwidth = width; panel.actualuiscale_x = scale; }
    hudRoot.actuallayoutheight = height;
    topBar.actualyoffset = 8;
    const place = (id, x, w, y = 0, h = 32) => {
      const panel = topBar.FindChildTraverse(id);
      if (!panel) return;
      // The mock's GetPositionWithinWindow scales the summed offsets by the panel's scale: offsets are layout px.
      Object.assign(panel, { actualxoffset: x / scale, actualyoffset: y / scale, actualuiscale_x: scale });
      panel.actuallayoutwidth = w;
      panel.actuallayoutheight = h;
    };
    place("TeamFriendly", friendX, teamW * scale, 0, 180 * scale);
    place("TeamEnemy", enemyX, teamW * scale, 0, 180 * scale);
    // Stock cards: equal width (teamW / 6 layout px), margin 0, flowing from the left of #PlayersContainer.
    for (const teamId of ["TeamFriendly", "TeamEnemy"]) {
      teams[teamId].forEach((card, k) => Object.assign(card, { actualxoffset: k * teamW / 6, actualyoffset: 0,
        actuallayoutwidth: teamW / 6 * scale, actuallayoutheight: 180 * scale, actualuiscale_x: scale }));
    }
    place("GameTime", Math.round(width / 2 - 40 * scale), 80 * scale, Math.round(14 * scale), 20 * scale);
  };
  geometry(teamsAt || { friendX: 330, enemyX: 1062 });
  const scaleBar = () => {
    const bar = topBar.FindChild("OHBar");
    if (bar) bar.actualuiscale_x = scale;
  };

  const bootHost = () => runIn(spectateBar, HOST_FILES.map((name) => [name, script(name)]));
  const advance = (ms) => { harness.scheduler.runFor(ms, 1e6); scaleBar(); };

  // World healthbars: Panel#panorama_world_panel_N > ClientUIDialogPanel (stock overlay root: WindowRoot)
  // > [Label#name, ..., CitadelStatusEffect#StatusEffects (this mod's layout: #StatusEffectContainer)].
  const worldRoot = new MockPanel("Panel", harness.root, "WorldPanels");
  const units = {};
  let panelSeq = 0;
  // Live (observer_hud v1, client 6812): CLASS_PLAYER sits on the world panel, not on the dialog.
  const addBar = (name, { hero = true, classOn = "root" } = {}) => {
    const holder = new MockPanel("Panel", worldRoot, `panorama_world_panel_${++panelSeq}`);
    const dialog = new MockPanel("ClientUIDialogPanel", holder, "client_ui_panel");
    dialog.classes = classesOf(STOCK.overlay).concat(hero && classOn === "dialog" ? ["CLASS_PLAYER"] : []);
    if (hero && classOn === "root") holder.AddClass("CLASS_PLAYER");
    for (const child of STOCK.overlay.children) instantiate(child, dialog);
    // The stock #name is bound to the overlay's dialog variable "name" (the engine sets it per unit).
    dialog.__dialog = { name };
    bindText(dialog.FindChildTraverse("name"), "{s:name}");
    const effects = dialog.FindChildTraverse("StatusEffects");
    for (const child of effects.children.slice()) child.DeleteAsync();
    loadInto(effects, OWN.status);
    const container = effects.FindChild("StatusEffectContainer");
    const samples = { count: 0, quick: 0, get polls() { return this.count + this.quick; } };
    // Through the prototype at call time, so the budget check's Children() accounting sees these reads.
    // count: full samples (Children); quick: signature polls (GetChildCount, oh_debuff_world.js quick()).
    container.Children = () => { samples.count++; return MockPanel.prototype.Children.call(container); };
    container.GetChildCount = () => { samples.quick++; return MockPanel.prototype.GetChildCount.call(container); };
    const unit = { holder, dialog, effects, container, samples, name };
    units[name] = unit;
    runIn(effects, [["oh_debuff_world.js", script("oh_debuff_world.js")]]);
    return unit;
  };
  const giveDebuff = (name, ability, { debuff = true, stacks = "", radial = null, css = "" } = {}) => {
    const effect = new MockPanel("Panel", units[name].container, `status_${ability}`);
    effect.classes = ["statusEffect", "usingAbilityImage"].concat(debuff ? ["isDebuff"] : [], css ? [css] : []);
    new MockPanel("Label", effect, "stacks").__text = stacks;
    const holder = new MockPanel("Panel", effect, "");
    holder.classes = ["statusEffectContainer"];
    const border = new MockPanel("Panel", holder, "StatusEffectsBorder");
    let source = radial;
    Object.defineProperty(border.style, "clip", { configurable: true,
      get: () => source ? `radial(50% 50%, 0deg, ${source(harness.now)}deg)` : "" });
    effect.setStacks = (text) => { effect.FindChildTraverse("stacks").__text = text; };
    return effect;
  };
  const card = (name) => teams.TeamFriendly[AMBER.indexOf(name)] || teams.TeamEnemy[SAPPHIRE.indexOf(name)];
  // The game's ultimate cooldown for a card (seconds; 0 when ready), or any raw value.
  const ult = (name, value) => { card(name).FindChildTraverse("UltimateStatusBG").__dialog.ult_cooldown = value; };
  // The status slots of a card's column (in #OHDebuffGrid), and where each sits: x from the card's
  // centre, y from the grid's top, read from the slot's inline translate3d (oh_debuffs.js places them).
  const slots = (name) => {
    const column = card(name).FindChild("OHDebuffsHost");
    const grid = column ? column.FindChild("OHDebuffGrid") : null;
    return grid ? grid.Children() : [];
  };
  const placeOf = (slot) => {
    const m = /^translate3d\((-?\d+(?:\.\d+)?)px, (-?\d+(?:\.\d+)?)px, 0px\)$/.exec(String(slot.style.transform || ""));
    return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: NaN, y: NaN };
  };
  const byPlace = (list) => list.slice().sort((a, b) => placeOf(a).y - placeOf(b).y || placeOf(a).x - placeOf(b).x);
  const shownSlots = (name) => byPlace(slots(name).filter((slot) => slot.BHasClass("OHShown") && !slot.BHasClass("OHFading")));
  const icons = (name) => shownSlots(name).map((slot) => slot.FindChildrenWithClassTraverse("OHDebuffIcon")[0].src);
  // Purchase notices on a card, newest first, without the fading ones.
  const notices = (name) => {
    const host = card(name).FindChildTraverse("OHBuys");
    return host ? host.Children().filter((n) => n.valid && !n.BHasClass("OHBuyFading")) : [];
  };
  const noticeText = (notice) => notice.FindChildrenWithClassTraverse("OHBuyName")[0].__text;
  const slotText = (slot, cls, flag) => slot.BHasClass(flag) ? slot.FindChildrenWithClassTraverse(cls)[0].__text : "";
  const bar = () => topBar.FindChild("OHBar");
  // The band lives in #TopBar's parent (.HudCore), right after #TopBar.
  const band = () => topBar.GetParent().FindChild("OHBandHost");
  const menu = () => escapeMenu.FindChild("OHMenuHost");
  const ui = (id) => {
    const found = (bar() && bar().FindChildTraverse(id)) || (band() && band().FindChildTraverse(id)) ||
      (menu() && menu().FindChildTraverse(id)) || escapeMenu.FindChildTraverse(id);
    assert.ok(found, `#${id}`);
    return found;
  };
  const press = (id) => { ui(id).events.onactivate(); };
  const type = (id, text, { submit = false } = {}) => {
    const entry = ui(id);
    entry.keyFocus = true;
    entry.text = text;
    if (entry.events.ontextentrychange) entry.events.ontextentrychange();
    if (submit) entry.events.ontextentrysubmit();
    entry.keyFocus = false;
    if (!submit && entry.events.onblur) entry.events.onblur();
  };
  const state = () => {
    const ctx = contexts.get(spectateBar);
    return ctx[ctx.length - 1].$.OHHost.getState();
  };
  // The band name shown for a player (by in-game name), or null when its label is hidden.
  const who = (name) => {
    const index = AMBER.includes(name) ? AMBER.indexOf(name) : 6 + SAPPHIRE.indexOf(name);
    const label = band() && band().FindChildTraverse(`OHWho${index}`);
    return label && label.BHasClass("OHShown") ? label.__text : null;
  };
  const host = () => {
    const ctx = contexts.get(spectateBar);
    return ctx[ctx.length - 1].$.OHHost;
  };
  return { harness, hud, hudRoot, topBar, teams, escapeMenu, spectateBar, bus, sent, loads, urls, contexts, runIn, bootHost,
    advance, geometry, addBar, units, giveDebuff, card, ult, slots, placeOf, shownSlots, icons, slotText, bar, band, menu, ui, press, type,
    state, who, clock, souls, host, purchases, buy, notices, noticeText, removeTeam, rebuildTeam, indicators, marker, markerName,
    eventFeed, killRow, feedNames };
}

// Steam accounts for the 12 stock markers, by player (live: 9-10 digit numbers, 0 for a bot).
const ACCOUNT_OF = (player) => 90000 + (AMBER.includes(player) ? AMBER.indexOf(player) : 6 + SAPPHIRE.indexOf(player));
// One marker per player with its account; `over` changes single markers ({ Kestrel: { shown: "nick" } }).
function markAll(w, over = {}) {
  return Object.fromEntries([...AMBER, ...SAPPHIRE].map((p) => [p, w.marker(p, Object.assign({ account: ACCOUNT_OF(p) }, over[p] || {}))]));
}

const countIn = (root, id) => {
  let n = 0;
  const visit = (panel) => { if (panel.id === id && panel.valid) n++; panel.children.forEach(visit); };
  visit(root);
  return n;
};
const text = (panel) => panel.__text;

// ---------------------------------------------------------------- static contracts

const SOURCE_EXT = { vjs_c: "js", vcss_c: "css", vxml_c: "xml" };
function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else out.push(full);
  }
  return out;
}

check("own s2r:// references resolve to source files, and every source file is listed in the build", () => {
  const wrapper = readRepo("build_observer_hud.ps1");
  const listed = (kind) => [...new RegExp(`\\$${kind} = @\\(([\\s\\S]*?)\\n\\)`).exec(wrapper)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const layouts = listed("layouts");
  const styles = listed("styles");
  const scripts = listed("scripts");
  const images = listed("images");
  for (const file of sourceFiles(PANORAMA)) {
    const rel = path.relative(PANORAMA, file).replace(/\\/g, "/");
    const [dir, ...rest] = rel.split("/");
    const name = rest.join("/").replace(/\.\w+$/, "");
    const list = { layout: layouts, styles, scripts, images }[dir];
    assert.ok(list && list.includes(name), `${rel} is in build_observer_hud.ps1`);
    if (!/\.(xml|css)$/.test(file)) continue;
    for (const [, refRel, ext] of fs.readFileSync(file, "utf8").matchAll(/s2r:\/\/panorama\/([\w/.-]+?)\.(vjs_c|vcss_c|vxml_c)\b/g)) {
      assert.ok(fs.existsSync(path.join(PANORAMA, `${refRel}.${SOURCE_EXT[ext]}`)), `${rel} -> missing ${refRel}.${SOURCE_EXT[ext]}`);
    }
    // Own images (stock ones live in the game's paks): the .vtex and its PNG.
    for (const [, refRel] of fs.readFileSync(file, "utf8").matchAll(/s2r:\/\/panorama\/(images\/observer_hud\/[\w/.-]+?)\.vtex\b/g)) {
      for (const ext of ["vtex", "png"]) assert.ok(fs.existsSync(path.join(PANORAMA, `${refRel}.${ext}`)), `${rel} -> missing ${refRel}.${ext}`);
    }
  }
  for (const [list, dir, ext] of [[layouts, "layout", "xml"], [styles, "styles", "css"], [scripts, "scripts", "js"], [images, "images", "vtex"]]) {
    for (const name of list) assert.ok(fs.existsSync(path.join(PANORAMA, dir, `${name}.${ext}`)), `listed ${dir}/${name}.${ext} exists`);
  }
  // Only the host layouts, the post-game page, the private-lobby page (0.3.0), the kill feed row and the VData
  // override stock files; everything else has this mod's own names.
  deq(layouts.filter((name) => !name.startsWith("observer_hud/")),
    ["hud_spectate_bar", "citadel_status_effect", "post_game/citadel_db_page_post_game_new", "citadel_db_page_private_lobby",
      "citadel_hud_data_feed_info"]);
  assert.ok(styles.every((name) => name.startsWith("observer_hud/")) && scripts.every((name) => name.startsWith("observer_hud/")));
  assert.match(wrapper, /pak10_dir\.vpk/, "pak10");
});

check("the five overrides are the pinned stock files plus this mod's include lines only", () => {
  const pin = JSON.parse(read("stock-pin.json"));
  const overrides = {
    "panorama/layout/hud_spectate_bar.xml": "game/citadel/pak01_dir/panorama/layout/hud_spectate_bar.xml",
    "panorama/layout/citadel_status_effect.xml": "game/citadel/pak01_dir/panorama/layout/citadel_status_effect.xml",
    "panorama/layout/citadel_db_page_private_lobby.xml": "game/citadel/pak01_dir/panorama/layout/citadel_db_page_private_lobby.xml",
    "panorama/layout/citadel_hud_data_feed_info.xml": "game/citadel/pak01_dir/panorama/layout/citadel_hud_data_feed_info.xml"
  };
  for (const [local, stock] of Object.entries(overrides)) {
    const own = read(local);
    const stripped = own.replace(/\t\t<include src="s2r:\/\/panorama\/(?:styles|scripts)\/observer_hud\/[\w]+\.v(?:css|js)_c" \/>\n/g, "")
      .replace(/\t<scripts>\n\t<\/scripts>\n/, "");
    assert.equal(crypto.createHash("sha256").update(stripped).digest("hex"), pin.files[stock], `${local} = stock + includes`);
  }
  // The post-game page also drops the flame video src (the compiler rejects file://{resources}/videos);
  // pg_loader.js sets the movie at runtime.
  const flame = ' src="file://{resources}/videos/pick_screen/play_btn_grn_flame.webm"';
  const page = read("panorama/layout/post_game/citadel_db_page_post_game_new.xml");
  assert.ok(!page.includes(flame), "flame src dropped");
  const restored = page.replace('\t\t<include src="s2r://panorama/scripts/observer_hud/pg_loader.vjs_c" />\n', "")
    .replace('<MoviePanel id="PlayButtonFX" class="btn_fx"', `<MoviePanel id="PlayButtonFX" class="btn_fx"${flame}`);
  assert.equal(crypto.createHash("sha256").update(restored).digest("hex"),
    pin.files["game/citadel/pak01_dir/panorama/layout/post_game/citadel_db_page_post_game_new.xml"], "post-game page = stock + loader - flame src");
  assert.match(read("panorama/scripts/observer_hud/pg_loader.js"), /play_btn_grn_flame\.webm/);
  for (const name of ["hud", "hud_escape_menu", "citadel_hud_top_bar", "citadel_hud_top_bar_team", "citadel_hud_top_bar_player", "unit_status_overlay_v2",
    "citadel_hud_hero_shop", "hud_unit_indicators_v2", "hud_data_feed", "citadel_hud_data_feed_info", "citadel_ui_private_lobby_team_slot"]) {
    const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(MODULE, `stock/${name}.xml`))).digest("hex");
    assert.equal(digest, pin.files[`game/citadel/pak01_dir/panorama/layout/${name}.xml`], `stock/${name}.xml matches the pin`);
  }
  const feedCss = fs.readFileSync(path.join(MODULE, "stock/hud_data_feed.css"));
  assert.equal(crypto.createHash("sha256").update(feedCss).digest("hex"), pin.files["game/citadel/pak01_dir/panorama/styles/hud_data_feed.css"]);
  // The host restores the kill feed to the stock margin it reads from here.
  assert.match(String(feedCss), /#EventFeed\s*\{[^}]*margin-top:\s*200px;/);
  // Script order in the host: state and tables first, the host before the editor and the column.
  const spectate = read("panorama/layout/hud_spectate_bar.xml");
  const order = [...spectate.matchAll(/observer_hud\/(\w+)\.vjs_c/g)].map((m) => `${m[1]}.js`);
  deq(order, HOST_FILES);
});

// User 2026-11-06: the kill feed's killstreak flame sat above the killer's name. The stock flame
// (#KillStreakParticlePanel, citadel_hud_data_feed_info.css 6860: height 100%, vertical-align middle,
// rotateZ(-90deg)) is centred on the whole killer box, which starts 16 px above the name plate (.unit_bg
// margin-top 16px). Ways this fails: the rule never loads (stylesheets apply per layout, so it must be
// included from the row layout itself), or it drops the stock rotation, or it moves the flame sideways.
check("kill feed: the killstreak flame moves down onto the name plate, keeping the stock rotation", () => {
  const row = read("panorama/layout/citadel_hud_data_feed_info.xml");
  assert.match(row, /citadel_hud_data_feed_info\.vcss" \/>\n\t\t<include src="s2r:\/\/panorama\/styles\/observer_hud\/oh_feed\.vcss_c" \/>\n\t<\/styles>/,
    "oh_feed after the stock sheet, in the row layout");
  assert.ok(parseLayout(row).children.some(function has(node) { return node.attrs.id === "KillStreakParticlePanel" || node.children.some(has); }));
  const rule = /#KillStreakParticlePanel\s*\{([^}]*)\}/.exec(read("panorama/styles/observer_hud/oh_feed.css"));
  assert.ok(rule, "flame rule");
  assert.equal(/transform:\s*([^;]+);/.exec(rule[1])[1].trim(), "translateY(16px) rotateZ(-90deg)", "straight down 16 px, then the stock rotation");
});

check("ids and classes agree across layouts, stylesheets and scripts", () => {
  const ids = (node, out = []) => { if (node.attrs.id) out.push(node.attrs.id); node.children.forEach((c) => ids(c, out)); return out; };
  const host = read("panorama/scripts/observer_hud/oh_host.js");
  const menuJs = read("panorama/scripts/observer_hud/oh_menu.js");
  const barIds = ids(OWN.bar);
  const editorIds = ids(OWN.editor);
  assert.equal(new Set(editorIds).size, editorIds.length, "editor ids unique");
  assert.equal(new Set(barIds).size, barIds.length, "bar ids unique");
  const bandIds = ids(OWN.band);
  assert.equal(new Set(bandIds).size, bandIds.length, "band ids unique");
  for (const id of ["OHClock", "OHGraph", "OHGraphLead", "OHGraphDraw"]) assert.ok(barIds.includes(id) && host.includes(`"${id}"`), id);
  // Base Game+ Names rev 2 (design 17): the stage box is gone; plates, joins and score digits live in the
  // band (the plates sit at the screen's top edge, above the stock top bar the bar is injected into).
  for (const id of ["OHStageBox", "OHStage", "OHFormat"]) assert.ok(!barIds.includes(id) && !host.includes(`"${id}"`), `no #${id}`);
  for (const id of ["OHMid", "OHOrgName", "OHOrgLogo", "OHInfo", "OHCornerEvent", "OHCornerGame"]) assert.ok(bandIds.includes(id) && host.includes(`"${id}"`), id);
  for (let i = 0; i < 12; i++) assert.ok(bandIds.includes(`OHWho${i}`), `band.xml has #OHWho${i}`);
  // Night Desk arch (d15 A, user 2026-10-23): the curves draw under the centre plate, the rings over it.
  for (const id of ["OHArch", "OHArchLeft", "OHArchRight", "OHArchCurveLeft", "OHArchCurveRight", "OHRings", "OHPlateEdgeLeft", "OHPlateEdgeRight"]) {
    assert.ok(bandIds.includes(id), `band.xml has #${id}`);
  }
  assert.ok(bandIds.indexOf("OHArch") < bandIds.indexOf("OHMid") && bandIds.indexOf("OHMid") < bandIds.indexOf("OHRings"), "arch, plate, rings");
  for (const side of ["Left", "Right"]) assert.ok(bandIds.indexOf(`OHDeskLogo${side}`) > bandIds.indexOf("OHRings"), `#OHDeskLogo${side} sits in #OHRings`);
  // The stock SPECTATING <name> block (with the Next/Previous Player hints) and the camera controls are
  // hidden while spectating (user 2026-10-23); both ids are in the spectate bar layout this mod ships.
  const hostCss = read("panorama/styles/observer_hud/oh_host.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const hidden = [...hostCss.matchAll(/([^{}]+)\{[^}]*visibility:\s*collapse;[^}]*\}/g)].flatMap(([, sel]) => sel.split(",").map((x) => x.trim()));
  for (const gate of [".spec_mode", ".TeamSpectator", ".replay_playback"]) {
    for (const id of ["#spectate_target", "#camera_section"]) {
      assert.ok(hidden.includes(`${gate} ${id}`), `${gate} ${id} hidden`);
      assert.ok(read("panorama/layout/hud_spectate_bar.xml").includes(`id="${id.slice(1)}"`), `hud_spectate_bar.xml has ${id}`);
    }
  }
  for (const side of ["Left", "Right"]) {
    const expected = ["Bans"].map((part) => `OH${part}${side}`)
      .concat([0, 1, 2].flatMap((slot) => [`OHBan${side}${slot}`, `OHBan${side}${slot}Image`]));
    for (const id of expected) assert.ok(barIds.includes(id), `tournament_bar.xml has #${id}`);
    for (const id of ["Team", "Plate", "Logo", "Mono", "Name", "Cap", "Join", "Score", "ScoreText"].map((part) => `OH${part}${side}`)) {
      assert.ok(bandIds.includes(id) && !barIds.includes(id), `band.xml has #${id}`);
    }
    // The join draws over the strip and under the names row.
    assert.ok(bandIds.indexOf(`OHStrip${side}`) < bandIds.indexOf(`OHJoin${side}`) && bandIds.indexOf(`OHJoin${side}`) < bandIds.indexOf("OHWhoRow"), `#OHJoin${side} between strip and names`);
    const desk = ["Desk", "DeskLogo", "DeskMono", "DeskName", "DeskBans", "Strip", "Corner", "MidSeries"].map((part) => `OH${part}${side}`)
      .concat([0, 1, 2].flatMap((slot) => [`OHDeskBan${side}${slot}`, `OHDeskBan${side}${slot}Image`]));
    for (const id of desk) assert.ok(bandIds.includes(id), `band.xml has #${id}`);
    assert.match(host, /find\(`OHTeam\$\{side\}`\)/);
    assert.match(host, /find\(`OHDesk\$\{side\}`\)/);
  }
  // Every id the editor script looks up exists once in the editor layout (it refuses to attach otherwise).
  const stateTables = { $: { Msg() {} } };
  vm.runInNewContext(read("panorama/scripts/observer_hud/oh_state.js"), stateTables);
  const ctx = { $: { OHState: stateTables.$.OHState, OHHost: { onChange() {} }, GetContextPanel: () => ({}), Schedule() {}, Msg() {} }, OH_HEROES: [] };
  const looked = [];
  vm.runInNewContext(menuJs.replace(/\$\.OHHost\.onChange\([\s\S]*?\n\}\)\(\);\s*$/, "globalThis.__ids = IDS;\n})();"), Object.assign(ctx, { globalThis: ctx }));
  looked.push(...ctx.__ids);
  for (const id of looked) assert.ok(editorIds.includes(id), `editor.xml has #${id}`);
  // The backdrop is the editor's first child (clicks around the dialog never reach the stock menu).
  const editorNode = (function find(node) { return node.attrs.id === "OHEditor" ? node : node.children.map(find).find(Boolean); })(OWN.editor);
  assert.equal(editorNode.children[0].attrs.id, "OHBackdrop");
  assert.equal(editorNode.children[0].type, "Button");
  // Stylesheet ids exist in their layouts; classes are this mod's own (no stock class restyled).
  for (const [css, layout] of [["oh_bar.css", OWN.bar], ["oh_band.css", OWN.band], ["oh_editor.css", OWN.editor], ["oh_debuffs.css", OWN.debuffs]]) {
    const sheet = read(`panorama/styles/observer_hud/${css}`).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, id] of sheet.matchAll(/#(OH\w+)/g)) assert.ok(ids(layout).includes(id), `${css} #${id} in its layout`);
  }
  // The editor includes the stock base styles (the TextEntry placeholder stayed drawn without them, spike).
  assert.match(read("panorama/layout/observer_hud/editor.xml"), /citadel_base_styles\.vcss/);
  // Fade length equals FADE_MS.
  assert.match(read("panorama/styles/observer_hud/oh_debuffs.css"), /animation-duration: 1s;/);
  assert.match(read("panorama/scripts/observer_hud/oh_debuffs.js"), /const FADE_MS = 1000;/);
});

check("board: torn paper surfaces use their own full-strength mask at their own size, no faint frame or light border is left", () => {
  // User 2026-10-26: dark edges around the header plates and the graph, and nothing looked like torn paper.
  // opacity-mask reads alpha (live); the stock rough_edge masks have alpha 255 everywhere and masked nothing.
  // How it could fail: a partial-strength mask leaves a faint frame; a mask is stretched to another size; a
  // light rim comes back (user 2026-10-26: "I hate this light brown border"); an image is not shipped.
  const css = read("panorama/styles/observer_hud/pg_board.css");
  const board = read("panorama/layout/observer_hud/pg_board.xml");
  const column = read("panorama/layout/observer_hud/pg_column.xml");
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
    const png = fs.readFileSync(path.join(MODULE, "panorama", "images", "observer_hud", `${image}.png`));
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
    assert.match(body(sel), new RegExp(`opacity-mask:\\s*url\\("s2r://panorama/images/observer_hud/${mask}\\.vtex"\\)\\s*1;`), `${sel} uses ${mask}`);
    deq(size(mask), [px(wSel, "width"), px(hSel, "height")], `${mask} is drawn at ${sel}'s size`);
  }
  assert.ok(!/opacity-mask/.test(body(".NSPaper")), ".NSPaper (the stat columns) is not torn (user 2026-10-26)");
  for (const [name, text] of [["pg_board.css", css], ["pg_board.xml", board], ["pg_column.xml", column]]) assert.ok(!/TornRim|_rim\.vtex/.test(text), `${name}: no light rim over the tears`);
  // An RGBA8 PNG's pixels (the generator writes 8-bit RGBA, not interlaced).
  const pixels = (image) => {
    const png = fs.readFileSync(path.join(MODULE, "panorama", "images", "observer_hud", `${image}.png`));
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
  // Objective drop lines: one panel each, outside the paper, ending 4 px into the icons (user 2026-10-29).
  {
    const js = read("panorama/scripts/observer_hud/pg_board.js");
    const end = Number(/const STEM_END = (\d+);/.exec(js)[1]);
    assert.equal(px(".NSGraphStems", "height"), end, ".NSGraphStems is STEM_END tall");
    assert.equal(end, px(".NSGraphPlot", "height") + px(".NSGraphTicks", "height") + 4, "the stems reach 4 px into the icons");
  }
  for (const mask of ["torn_head_l", "torn_head_r", "torn_graph", "torn_track", "torn_award"]) {
    // The mask is in alpha as well as grey (live: a mask with alpha 255 everywhere masked nothing).
    const m = pixels(mask);
    for (let i = 0; i < m.w * m.h; i++) assert.equal(m.out[i * 4 + 3], m.out[i * 4], `${mask}: alpha follows the grey`);
    assert.ok(m.out[0] < 128 && m.out[(m.w * m.h - 1) * 4] < 128, `${mask}'s corners are torn away (at most a fibre)`);
  }
});

check("board: ids the scripts look up exist in their layouts; classes they set have rules", () => {
  const board = read("panorama/layout/observer_hud/pg_board.xml");
  const column = read("panorama/layout/observer_hud/pg_column.xml");
  const js = read("panorama/scripts/observer_hud/pg_board.js");
  const css = read("panorama/styles/observer_hud/pg_board.css");
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
  for (const xml of [board, column]) assert.ok(xml.includes("s2r://panorama/styles/observer_hud/pg_board.vcss_c"), "board stylesheet included");
  assert.match(read("panorama/scripts/observer_hud/pg_loader.js"), /"file:\/\/\{resources\}\/layout\/observer_hud\/pg_board\.xml"/);
  assert.match(js, /"file:\/\/\{resources\}\/layout\/observer_hud\/pg_column\.xml"/);
  const rules = new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_]*)/g)].map((m) => m[1]));
  const set = new Set();
  for (const m of js.matchAll(/class: "([^"$]+)"/g)) m[1].split(/\s+/).forEach((c) => set.add(c));
  for (const m of js.matchAll(/(?:AddClass|SetHasClass|RemoveClass)\("([A-Za-z0-9_]+)"/g)) set.add(m[1]);
  for (const key of ["souls", "kills", "assists", "pdmg", "odmg", "heal"]) set.add(`NSBest_${key}`);
  for (const key of ["troopers", "neutrals", "breakables", "bonus", "kills", "objectives", "urn", "assists", "denies"]) set.add(`NSSrc_${key}`);
  for (const c of set) assert.ok(rules.has(c), `.${c} has no rule in pg_board.css`);
});

check("spec: world RULES equal dlf/spectator-status.json; the stun-hiding rule is short and loads with the status list", () => {
  const spec = JSON.parse(readRepo("dlf/spectator-status.json"));
  const worldJs = read("panorama/scripts/observer_hud/oh_debuff_world.js");
  const rules = new vm.Script(/const RULES = (new Map\(\[[\s\S]*?\]\));/.exec(worldJs)[1]).runInNewContext({ Map });
  const specRules = spec.abilities.map((entry) => [entry.ability, Object.assign({ maxSeconds: entry.maxSeconds },
    entry.buff ? { buff: true } : {}, entry.minStacks ? { minStacks: entry.minStacks } : {},
    entry.ignoreClasses ? { ignore: entry.ignoreClasses } : {}, entry.pulse ? { pulse: true } : {})]);
  deq(JSON.parse(JSON.stringify([...rules])), specRules);
  const icons = new vm.Script(`${read("panorama/scripts/observer_hud/oh_debuff_icons.js")}\nOH_DEBUFF_ICONS`).runInNewContext({});
  const known = new Set(Object.values(icons).flatMap((row) => row.split(" ").map((entry) => entry.split("=")[0])));
  const extra = new vm.Script(`(${/const EXTRA_ICONS = (\{[^}]*\});/.exec(read("panorama/scripts/observer_hud/oh_debuffs.js"))[1]})`).runInNewContext({});
  for (const entry of spec.abilities) assert.ok(known.has(entry.ability) || extra[entry.ability], `${entry.ability} has an icon`);
  const css = read("panorama/styles/observer_hud/oh_status_world.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => [m[1].trim(), m[2].replace(/\s+/g, " ").trim()]);
  deq(blocks, [[".CLASS_PLAYER .statusEffect.stunned", "opacity: 0; width: 0px; height: 0px; margin: 0px;"]]);
  assert.equal(classesOf(STOCK.overlay).join(" "), "WindowRoot", "the stock overlay root is .WindowRoot");
  assert.match(read("panorama/layout/citadel_status_effect.xml"), /citadel_status_effect\.vcss" \/>\n\t\t<include src="s2r:\/\/panorama\/styles\/observer_hud\/oh_status_world\.vcss_c" \/>/);
  // Poll defaults and ranges agree between the state and the world sampler.
  const stateJs = read("panorama/scripts/observer_hud/oh_state.js");
  assert.match(stateJs, /DEBUFF_POLL_STEPS = \[100, 250, 500, 1000, 2000\]/);
  assert.match(stateJs, /debuffPollMs: 250/);
});

// ---------------------------------------------------------------- state rules

// Loaded on first use (OH_CHECK runs that skip the state checks never load it).
let stateApiMemo = null;
const stateApiOf = () => {
  if (stateApiMemo) return stateApiMemo;
  const context = createVmContext(createPanoramaHarness());
  runInVm(script("oh_state.js"), context, "oh_state.js");
  return (stateApiMemo = context.$.OHState);
};

check("state: field-by-field fallback, rejection instead of truncation, series capped by the format", () => {
  const S = stateApiOf();
  const d = S.defaults();
  deq(S.normalize(null), d);
  const long = "x".repeat(29);
  const s = S.normalize({ event: "  Deadlock   Community Cup ", stage: "Grand Final", bestOf: 5,
    amber: { name: long, tag: "now", series: 3, bans: [13, 13], logo: { url: "https://cdn.example.org/a.png" } },
    sapphire: { name: "Brass Saints", tag: "TOOLONG", series: 4, bans: [13, 6] },
    aliases: { Kestrel: "Kes", "": "x", Moth: "y".repeat(25) }, dev: { debuffPollMs: 300 } });
  assert.equal(s.event, "Deadlock Community Cup");
  assert.equal(s.amber.name, "Night Owls", "a 29-character name is rejected, not cut (the sample stays)");
  assert.equal(s.amber.tag, "NOW");
  assert.equal(s.amber.series, 3);
  deq(s.amber.bans, [13, 0, 0], "a hero is banned once per team");
  deq(s.sapphire.bans, [0, 6, 0], "and once across teams");
  // Bans per team (2 or 3): a setup from before the third ban (two slots, no banCount) shows two and gets an
  // empty third slot; a ban past banCount is kept (switching back to 3 brings it back) but never shown.
  assert.equal(s.banCount, 2, "an older setup shows two bans");
  for (const bad of [0, 1, 4, "3", 2.5, null]) assert.equal(S.normalize({ banCount: bad }).banCount, 2, `banCount ${bad} falls back`);
  const three = S.normalize({ banCount: 3, amber: { bans: [7, 8, 7] }, sapphire: { bans: [9, 0, 8] } });
  assert.equal(three.banCount, 3);
  deq([three.amber.bans, three.sapphire.bans], [[7, 8, 0], [9, 0, 0]], "the third slot is banned once too");
  deq(S.shownBans(three, "amber"), [7, 8, 0]);
  const hidden = S.normalize(Object.assign(S.clone(three), { banCount: 2, amber: { bans: [7, 8, 5] } }));
  deq([hidden.amber.bans, S.shownBans(hidden, "amber")], [[7, 8, 5], [7, 8]], "a hidden third ban is kept, not shown");
  const shared = S.decodeShare(S.encodeShare(Object.assign(S.defaults(), { banCount: 3 })));
  assert.equal(S.importShared(shared.state, d.dev).banCount, 3, "a share code carries banCount");
  const oldCode = S.importShared({ amber: { bans: [4, 5] } }, d.dev);
  deq([oldCode.banCount, oldCode.amber.bans], [2, [4, 5, 0]], "a code from before the third ban");
  assert.equal(s.sapphire.tag, "BRS", "a 7-character tag is rejected (the sample stays)");
  assert.equal(s.sapphire.series, 0, "series 4 is more than Bo5 needs");
  deq(s.legacy, { Kestrel: "Kes" }, "a v1 name-keyed map is kept as legacy, never re-keyed");
  deq([s.players, s.pending, s.aliases], [{}, {}, undefined]);
  assert.equal(s.dev.debuffPollMs, 250);
  // Sample values fill a fresh state; a name cleared to nothing shows the side's own name.
  deq([d.event, d.stage, d.amber.name, d.amber.tag, d.sapphire.name, d.org.name, d.info.title],
    ["Community Cup Season 2", "Grand Final", "Night Owls", "NOW", "Brass Saints", "Community Cup", "Prize pool"]);
  assert.equal(S.normalize({ amber: { name: "" } }).amber.name, "AMBER");
  assert.equal(S.normalize({ event: "" }).event, "", "an emptied box stays empty");
  for (const bad of ["javascript:alert(1)", "https://user:pw@example.org/a.png", "https://exa mple.org/a.png",
    "ftp://example.org/a.png", "https://example.org/\\a", `https://example.org/${"a".repeat(600)}`]) {
    assert.equal(S.cleanUrl(bad), null, bad.slice(0, 40));
  }
  assert.equal(S.cleanUrl("http://example.org:8080/logo.png?x=1"), "http://example.org:8080/logo.png?x=1");
  assert.equal(S.monogram({ name: "Night Owls", tag: "" }), "NO");
  assert.equal(S.monogram({ name: "Brass Saints", tag: "BRS" }), "BRS");
  // v2 fields: the look, the organiser, the info card and the graph time fall back one by one.
  assert.equal(d.style, "names", "Base Game+ Names is the default look");
  assert.equal(d.graph.show, 30);
  const v2 = S.normalize({ style: "desk", org: { name: "Community Cup", logo: { url: "https://user:pw@x.org/a.png" } },
    info: { title: "Prize pool", value: "$".repeat(17), caption: "Donate" }, graph: { show: 45 } });
  deq([v2.style, v2.org, v2.info, v2.graph], ["desk", { name: "Community Cup", logo: { url: "" } },
    { title: "Prize pool", value: "$2,130", caption: "Donate" }, { show: 30, every: 300, size: 100, x: 0, y: 0 }], "a 17-character value keeps the sample");
  assert.equal(S.normalize({ style: "base" }).style, "names", "v1's look is gone: unknown looks fall back");
});

// The two captions an org variant translates (apply-org.py swaps the literals and reads the "one|many"
// forms back at build time). How it could fail: the base text changes, or {n} is left in.
check("state: the game and first-to captions carry their number", () => {
  const S = stateApiOf();
  deq([S.caption("game", 1), S.caption("game", 5), S.caption("first", 1), S.caption("first", 4)], ["GAME 1", "GAME 5", "FIRST TO 1", "FIRST TO 4"]);
});

// Logo links from image and GIF hosts (user 2026-10-23: "support imgur and more with gifs"). The game
// loads PNG, JPEG, still WebP and GIF; animated WebP draws grey bars (DLF ENGINE.md) and video does not
// load. How it could fail: a page link (imgur, giphy, tenor, GitHub, Dropbox) loads HTML; a video or
// animated WebP link loads instead of the host's GIF; a lookalike host or an album is rewritten; a
// direct link is changed; a rewrite gives a URL cleanUrl would refuse; a still image fails as GIF.
check("state: logo links from imgur, Giphy, Tenor, Discord, X, GitHub and Dropbox load the direct image or GIF", () => {
  const S = stateApiOf();
  const cases = [
    ["", []],
    ["https://cdn.example.org/logo.png", ["https://cdn.example.org/logo.png"]],
    ["https://cdn.example.org/anim.webp", ["https://cdn.example.org/anim.webp"]],
    // imgur: a page link or a video/WebP link becomes the GIF, the still image after it.
    ["https://imgur.com/AbC12xy", ["https://i.imgur.com/AbC12xy.gif", "https://i.imgur.com/AbC12xy.png"]],
    ["https://m.imgur.com/AbC12xy?share=1#top", ["https://i.imgur.com/AbC12xy.gif", "https://i.imgur.com/AbC12xy.png"]],
    ["https://i.imgur.com/AbC12xy.gifv", ["https://i.imgur.com/AbC12xy.gif", "https://i.imgur.com/AbC12xy.png"]],
    ["https://i.imgur.com/AbC12xy.mp4", ["https://i.imgur.com/AbC12xy.gif", "https://i.imgur.com/AbC12xy.png"]],
    ["http://i.imgur.com/AbC12xy.webp", ["https://i.imgur.com/AbC12xy.gif", "https://i.imgur.com/AbC12xy.png"]],
    ["https://i.imgur.com/AbC12xy.png", ["https://i.imgur.com/AbC12xy.png"]],
    ["https://i.imgur.com/AbC12xy.gif", ["https://i.imgur.com/AbC12xy.gif"]],
    ["https://imgur.com/a/AbC12xy", ["https://imgur.com/a/AbC12xy"]],
    ["https://imgur.com/gallery/AbC12xy", ["https://imgur.com/gallery/AbC12xy"]],
    ["https://notimgur.com/AbC12xy", ["https://notimgur.com/AbC12xy"]],
    ["https://imgur.com.evil.example/AbC12xy", ["https://imgur.com.evil.example/AbC12xy"]],
    // Giphy: page, embed, sticker and media links become the media GIF.
    ["https://giphy.com/gifs/CatsMovie-cats-movie-LptvdvZLb3KLHJLc0W", ["https://media.giphy.com/media/LptvdvZLb3KLHJLc0W/giphy.gif"]],
    ["https://giphy.com/gifs/Ev477g37MJORyOWfdG", ["https://media.giphy.com/media/Ev477g37MJORyOWfdG/giphy.gif"]],
    ["https://giphy.com/embed/Ev477g37MJORyOWfdG", ["https://media.giphy.com/media/Ev477g37MJORyOWfdG/giphy.gif"]],
    ["https://giphy.com/stickers/happy-dance-Ev477g37MJORyOWfdG", ["https://media.giphy.com/media/Ev477g37MJORyOWfdG/giphy.gif"]],
    ["https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjEx/LBb735fuQwRKAVzN23/100.webp", ["https://media.giphy.com/media/LBb735fuQwRKAVzN23/giphy.gif"]],
    ["https://media.giphy.com/media/LBb735fuQwRKAVzN23/giphy.mp4", ["https://media.giphy.com/media/LBb735fuQwRKAVzN23/giphy.gif"]],
    ["https://i.giphy.com/LBb735fuQwRKAVzN23.webp", ["https://i.giphy.com/LBb735fuQwRKAVzN23.gif"]],
    ["https://media.giphy.com/media/LBb735fuQwRKAVzN23/giphy.gif", ["https://media.giphy.com/media/LBb735fuQwRKAVzN23/giphy.gif"]],
    // Tenor: a media link of any format becomes its full GIF (format code AAAAC); a page link gets
    // .gif, which Tenor redirects to the GIF.
    ["https://media.tenor.com/1S3s5iesWX0AAAA1/despierto-gato.webp", ["https://media.tenor.com/1S3s5iesWX0AAAAC/despierto-gato.gif"]],
    ["https://media.tenor.com/1S3s5iesWX0AAAP1/despierto-gato.mp4", ["https://media.tenor.com/1S3s5iesWX0AAAAC/despierto-gato.gif"]],
    ["https://media1.tenor.com/m/62-aXIQUtvQAAAAM/amazing-adorable.gif", ["https://media1.tenor.com/m/62-aXIQUtvQAAAAC/amazing-adorable.gif"]],
    ["https://tenor.com/view/amazing-cute-cat-gif-16964948043471566580", ["https://tenor.com/view/amazing-cute-cat-gif-16964948043471566580.gif"]],
    ["https://tenor.com/en-GB/view/amazing-cat-gif-1696494804", ["https://tenor.com/en-GB/view/amazing-cat-gif-1696494804.gif"]],
    // Discord: the media proxy and fxtwitter serve WebP as GIF (DLF); CDN emoji, avatars and icons
    // as GIF when animated, else PNG.
    ["https://media.discordapp.net/attachments/1/2/a.webp?ex=1&width=64", ["https://media.discordapp.net/attachments/1/2/a.webp?ex=1&width=64&format=gif"]],
    ["https://fxtwitter.com/i/a.webp", ["https://fxtwitter.com/i/a.gif"]],
    ["https://cdn.discordapp.com/emojis/123456789.webp?size=96&animated=true", ["https://cdn.discordapp.com/emojis/123456789.gif?size=96"]],
    ["https://cdn.discordapp.com/emojis/123456789.webp?size=96", ["https://cdn.discordapp.com/emojis/123456789.png?size=96"]],
    ["https://cdn.discordapp.com/icons/1/a_0123abcd.webp", ["https://cdn.discordapp.com/icons/1/a_0123abcd.gif"]],
    ["https://cdn.discordapp.com/avatars/1/0123abcd.webp?size=128", ["https://cdn.discordapp.com/avatars/1/0123abcd.png?size=128"]],
    // X: WebP renditions as PNG.
    ["https://pbs.twimg.com/media/GAbCdEf.webp", ["https://pbs.twimg.com/media/GAbCdEf?format=png"]],
    ["https://pbs.twimg.com/media/GAbCdEf?format=webp&name=small", ["https://pbs.twimg.com/media/GAbCdEf?format=png&name=small"]],
    // GitHub blob pages and Dropbox share pages: the file itself.
    ["https://github.com/org/repo/blob/main/art/logo.png", ["https://raw.githubusercontent.com/org/repo/main/art/logo.png"]],
    ["https://www.dropbox.com/scl/fi/abc/logo.gif?rlkey=xyz&dl=0", ["https://www.dropbox.com/scl/fi/abc/logo.gif?rlkey=xyz&raw=1"]],
    ["https://www.dropbox.com/s/abc/logo.png", ["https://www.dropbox.com/s/abc/logo.png?raw=1"]]
  ];
  for (const [url, expected] of cases) {
    const sources = JSON.parse(JSON.stringify(S.logoSources(url)));
    deq(sources, expected, url);
    for (const source of sources) assert.equal(S.cleanUrl(source), source, `${source} passes cleanUrl`);
  }
});

check("state: share codes round-trip, leave DEV out, and reject corrupt or newer codes", () => {
  const S = stateApiOf();
  const s = S.normalize({ event: "Cup ✓ ünïcode", amber: { name: "Night Owls", logo: { url: "https://x.org/l.png" } },
    aliases: { Kestrel: "Kes" }, dev: { debuffs: false } });
  const code = S.encodeShare(s);
  assert.ok(code.startsWith("OHC1."));
  const back = S.decodeShare(` ${code.slice(0, 20)}\n${code.slice(20)} `);
  assert.equal(back.kind, "valid");
  assert.equal(back.state.dev, undefined);
  deq(S.normalize(back.state).amber, s.amber);
  assert.equal(S.normalize(back.state).event, "Cup ✓ ünïcode");
  assert.equal(S.decodeShare(code.slice(0, -2) + "AA").kind, "corrupt");
  assert.equal(S.decodeShare("DLFC1.00000000.e30").kind, "corrupt");
  const json = JSON.stringify({ s: 2, state: {} });
  const newer = "OHC1." + S.checksum(json) + "." + Buffer.from(json).toString("base64url");
  assert.equal(S.decodeShare(newer).kind, "unsupported");
  // Every legal setup fits one code (user 2026-11-03): the longest one, every text and link at its limit
  // in the most expensive characters normalize keeps, 24 players and 24 name aliases, encodes under
  // MAX_SHARE and imports back unchanged. Control characters count as spaces and a lone surrogate half
  // becomes U+FFFD (each would take 6 JSON characters).
  const L = S.LIMITS;
  const maxState = (ch) => {
    const fill = (n) => ch.repeat(Math.floor(n / ch.length));
    const players = {};
    const legacy = {};
    for (let i = 0; i < S.MAX_ALIASES; i++) {
      players[String(4294967295 - i)] = { a: fill(L.alias), n: fill(L.gameName) };
      legacy[fill(L.gameName - 2) + String(i).padStart(2, "0")] = fill(L.alias);
    }
    const url = (k) => `https://${"a".repeat(50)}.com/${fill(S.MAX_URL - 64)}${k}`;
    return S.normalize({ style: "desk", event: fill(L.event), stage: fill(L.stage), bestOf: 7,
      amber: { name: fill(L.name), tag: fill(L.tag), logo: { url: url(1) }, series: 4, bans: [999, 998] },
      sapphire: { name: fill(L.name), tag: fill(L.tag), logo: { url: url(2) }, series: 4, bans: [997, 996] },
      org: { name: fill(L.org), logo: { url: url(3) } },
      info: { title: fill(L.infoTitle), value: fill(L.infoValue), caption: fill(L.infoCaption) },
      graph: { show: -1, every: 600, size: 150, x: -600, y: -40 }, logo: { shape: "square", size: 50, gap: 48 },
      cues: { bridge: 120, urn: 120, rift: -1, mid: 120 }, buys: 15, players, legacy });
  };
  let longest = 0;
  for (const ch of ["界", "\uffff", "\"", "\\", "😀", "a", "a\u0001", "a\u0085", "a\ud800", "a\udc00"]) {
    const max = maxState(ch);
    assert.equal(Object.keys(max.players).length + Object.keys(max.legacy).length, 2 * S.MAX_ALIASES, `${JSON.stringify(ch)}: full alias lists`);
    const code = S.encodeShare(max);
    assert.ok(code, `${JSON.stringify(ch)}: a code`);
    longest = Math.max(longest, code.length);
    const back = S.decodeShare(code);
    assert.equal(back.kind, "valid", `${JSON.stringify(ch)}: imports`);
    deq(S.normalize(back.state), Object.assign(S.normalize(max), { dev: S.normalize(back.state).dev }), `${JSON.stringify(ch)}: unchanged`);
  }
  assert.ok(longest <= S.MAX_SHARE && longest >= 18000, `longest legal code ${longest} of ${S.MAX_SHARE}`);
  results.shareLongest = longest;
  assert.equal(S.normalize({ event: "a\u0001\u0002b\u0085c" }).event, "a b c", "controls are spaces");
  assert.equal(S.normalize({ event: "x\ud800y" }).event, "x\ufffdy", "a lone surrogate half is U+FFFD");
  assert.equal(S.cleanUrl("https://x.org/\ud800.png"), null, "a URL with a lone surrogate half is refused");
  // The guard: a raw state past the limit (normalize never makes one) gets no code.
  assert.equal(S.encodeShare({ event: "界".repeat(8000) }), "", "no code past the decoder's limit");
});

// ---------------------------------------------------------------- host: injection

check("host: idles outside spectating, then injects the band, the bar, one column per card and the editor", () => {
  const w = world({ spectating: false });
  w.bootHost();
  w.advance(5000);
  assert.equal(w.bar(), null, "no bar outside spectating");
  assert.equal(w.band(), null, "no band outside spectating");
  assert.ok(w.menu(), "the editor host is injected once the Escape menu exists");
  // The editor opens from a native entry in the stock menu list, under PLAYER FEEDBACK, with the
  // stock classes (no layout override); it shows only while spectating.
  const sub = w.escapeMenu.FindChildTraverse("SubOptions");
  const entry = sub.FindChild("OHMenuButton");
  assert.ok(entry, "an entry in #SubOptions");
  deq([entry.type, entry.BHasClass("nav_menu_item"), entry.BHasClass("minor")], ["Button", true, true]);
  const entryLabel = entry.Children()[0];
  deq([entryLabel.type, entryLabel.BHasClass("menuButtonLabel"), entryLabel.__text], ["Label", true, "TOURNAMENT SETUP"]);
  assert.equal(sub.Children().indexOf(entry) - 1, sub.Children().indexOf(sub.FindChildrenWithClassTraverse("FeedbackRow")[0]));
  assert.equal(entry.style.visibility, "collapse", "no entry while playing");
  const idle = Object.assign({}, w.harness.operationCounts);
  w.advance(10000);
  const created = w.loads.length;
  w.advance(10000);
  assert.equal(w.loads.length, created, "no layout loads while not spectating");
  w.hud.AddClass("spec_mode");
  w.advance(1100);
  assert.ok(w.bar(), "bar injected while spectating");
  assert.equal(entry.style.visibility, "visible", "the entry shows while spectating");
  // Another menu mod rebuilds #SubOptions' children while #EscapeMenu survives: the entry comes back.
  entry.DeleteAsync();
  w.advance(1100);
  const again = sub.FindChild("OHMenuButton");
  assert.ok(again && again !== entry && again.style.visibility === "visible", "a deleted entry is made again");
  w.press("OHMenuButton");
  assert.ok(w.menu().BHasClass("OHOpen"), "the entry opens the editor");
  assert.equal(countIn(w.topBar, "OHBar"), 1);
  assert.equal(countIn(w.hud, "OHBandHost"), 1);
  const core = w.topBar.GetParent().Children();
  assert.ok(w.band() && core.indexOf(w.band()) === core.indexOf(w.topBar) + 1,
    "the band sits right after #TopBar: above the stock top bar's glow");
  // User 2026-11-06: a card's killstreak flame (stock #KillStreakContainer, lifted 100 px) covered the
  // names. The stock CitadelHudTopBar is z-index 10, so a band at 0 drew under the whole top bar; at 10 it
  // wins the tie by order, and it takes no input, so the cards under it still take clicks.
  const bandCss = read("panorama/styles/observer_hud/oh_band.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(/\n\.OHBand\s*\{([^}]*)\}/.exec(bandCss)[1], /z-index:\s*10;/, "the band has #TopBar's z-index");
  assert.match(read("panorama/layout/observer_hud/band.xml"), /class="OHBand" hittest="false" hittestchildren="false"/);
  deq([w.ui("OHBandBack").style.marginLeft, w.ui("OHBandBack").style.width], ["0px", "1920px"],
    "full-width lacquer, as in the mockup");
  assert.equal(countIn(w.topBar, "OHDebuffsHost"), 12);
  assert.equal(countIn(w.escapeMenu, "OHMenuHost"), 1);
  assert.ok(w.bar().BHasClass("OHBar"), "the created panel takes the layout root's class");
  assert.ok(w.band().BHasClass("OHStyleNames") && !w.band().BHasClass("OHStyleDesk"), "Base Game+ Names is the default look");
  // The top bar tucks 8 px up under the band (the stock 8 px dropped): at 16 px (user screenshot
  // 2026-10-23 20:42) Celeste's horns and tall hair crossed the band; at 0 the portraits hung 20-26 px under it.
  assert.equal(w.topBar.style.marginTop, "26px", "the stock top bar sits right under the 26 px names strip, 8 px tucked up");
  assert.equal(w.who("Kestrel"), "Kestrel");
  assert.equal(w.who("Tidal"), "Tidal");
  w.hud.RemoveClass("spec_mode");
  w.advance(1100);
  assert.ok(!w.topBar.style.marginTop, "back to playing: the stock top bar returns to its place");
  assert.ok(w.harness.logs.some((line) => line.includes("[OH] bar injected")));
  results.runs.push({ name: "inject", logs: w.harness.logs.slice(), idleOps: idle });
});

check("host: boots before the HUD is attached and retries; a layout reload keeps one of everything and adopts the state", () => {
  const w = world();
  // Detached at first: the spectate bar's parent chain does not reach CitadelHudRoot yet.
  const container = w.spectateBar.GetParent();
  w.spectateBar.SetParent(null);
  w.bootHost();
  w.advance(3000);
  assert.equal(w.bar(), null);
  w.spectateBar.SetParent(container);
  w.advance(9000);
  assert.ok(w.bar(), "injected once attached");
  w.press("OHMenuButton");
  w.type("OHStageEntry", "Semi Final");
  assert.ok(text(w.ui("OHCapLeft")).startsWith(`${"Semi Final"} · BO`), "the stage rides in the left plate caption");
  const firstBar = w.bar();
  w.bootHost(); // panorama_reload_layout of hud_spectate_bar.xml
  w.advance(3000);
  assert.equal(countIn(w.topBar, "OHBar"), 1);
  assert.equal(countIn(w.hud, "OHBandHost"), 1);
  assert.equal(countIn(w.topBar, "OHDebuffsHost"), 12);
  assert.equal(countIn(w.escapeMenu, "OHMenuHost"), 1);
  assert.equal(countIn(w.escapeMenu, "OHMenuButton"), 1, "one menu entry after a reload");
  assert.notEqual(w.bar(), firstBar, "the old instance's bar was replaced");
  assert.equal(w.state().stage, "Semi Final", "the state survives the reload (HUD root attribute)");
  assert.ok(text(w.ui("OHCapLeft")).startsWith(`${"Semi Final"} · BO`), "the stage rides in the left plate caption");
  // One HUD listener for snapshots after the reload; the old loop no longer injects.
  const hudListeners = w.bus.filter((entry) => entry.panel === w.spectateBar).length;
  w.bootHost();
  w.advance(3000);
  assert.equal(w.bus.filter((entry) => entry.panel === w.spectateBar).length, hudListeners);
  const loads = w.loads.length;
  w.advance(10000);
  assert.equal(w.loads.length, loads, "no repeated injection in steady state");
});

check("host: a rebuilt card gets its column back and keeps its name; a rebuilt #TopBar or band comes back", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  w.press("OHMenuButton");
  w.type("OHAmberPlayer0Entry", "Kes");
  const kestrel = w.card("Kestrel");
  kestrel.FindChild("OHDebuffsHost").DeleteAsync();
  w.advance(1100);
  assert.equal(countIn(kestrel, "OHDebuffsHost"), 1);
  assert.equal(w.who("Kestrel"), "Kes", "the alias stays on the rebuilt card's name");
  // A player leaves: the names after them move up a slot, the last slot hides.
  w.teams.TeamEnemy[5].DeleteAsync();
  w.advance(1100);
  assert.equal(w.ui("OHWho11").BHasClass("OHShown"), false);
  assert.equal(w.ui("OHWho10").__text, "Pocketwatch");
  // Five sapphire cards: each name stays on its card (the cards keep their width and flow from the left).
  assert.equal(w.ui("OHWho6").style.marginLeft, `${1062 + 44 - 43}px`);
  assert.equal(w.ui("OHWho10").style.marginLeft, `${1062 + 4 * 88 + 44 - 43}px`);
  // A new map: the engine rebuilds #TopBar's children; another mod's reload deletes the band.
  w.bar().DeleteAsync();
  w.band().DeleteAsync();
  w.advance(1100);
  assert.equal(countIn(w.topBar, "OHBar"), 1);
  assert.equal(countIn(w.hud, "OHBandHost"), 1);
});

check("host: parts hidden while #GameTime or a team panel is missing come back without an inline null clear", () => {
  // Live (ENGINE.md): a collapsed panel whose inline visibility is cleared with null stays hidden, so a
  // part hidden for a missing stock panel must come back by class (the engine model above fails the check).
  const w = world();
  w.bootHost();
  w.advance(2000);
  const gone = (id) => w.ui(id).BHasClass("OHGone");
  const time = w.topBar.FindChildTraverse("GameTime");
  const timeParent = time.GetParent();
  time.DeleteAsync();
  w.advance(1100);
  deq(["OHClock", "OHMid", "OHBansLeft", "OHBansRight"].map(gone), [true, true, true, true], "no clock: its parts hide");
  const fresh = new MockPanel("Label", { operationCounts: w.harness.operationCounts });
  fresh.id = "GameTime";
  fresh.__text = "12:00";
  fresh.SetParent(timeParent);
  w.geometry({ friendX: 330, enemyX: 1062 });
  w.advance(1100);
  deq(["OHClock", "OHMid", "OHBansLeft", "OHBansRight"].map(gone), [false, false, false, false], "the clock is back: so are they");
  for (const look of ["OHLookNames", "OHLookDesk"]) {
    w.press("OHMenuButton");
    w.press(look);
    w.press("OHDone");
    w.advance(1100);
    // The team panel is deleted and made again with its layout (as the stock top bar does), never
    // detached: Amber's strip, desk block and names hide while it is missing and come back with it.
    w.removeTeam("TeamFriendly");
    w.advance(1100);
    assert.ok(gone("OHStripLeft"), `${look}: Amber's strip hides while its team panel is missing`);
    assert.ok(gone("OHTeamLeft") && gone("OHJoinLeft"), `${look}: so do its plate and join`);
    if (look === "OHLookDesk") assert.ok(gone("OHDeskLeft"));
    w.rebuildTeam("TeamFriendly");
    w.geometry({ friendX: 330, enemyX: 1062 });
    w.advance(2200);
    assert.ok(!gone("OHWho0") && !gone("OHStripLeft"), `${look}: Amber's names and strip are back`);
    assert.ok(!gone("OHTeamLeft") && !gone("OHJoinLeft"), `${look}: and its plate and join`);
    assert.equal(w.who("Kestrel"), "Kestrel", `${look}: the rebuilt cards have their names`);
    assert.equal(countIn(w.topBar, "OHDebuffsHost"), 12, `${look}: every card has its status column again`);
    if (look === "OHLookDesk") deq(["OHArch", "OHRings", "OHDeskLeft"].map(gone), [false, false, false]);
  }
});

check("names: a slot whose new card has no name yet does not keep the previous card's name", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  assert.equal(w.ui("OHWho6").__text, "Volt");
  // Volt leaves; Mole's card moves into the slot before its stock name label has a text.
  const mole = w.card("Mole");
  for (const label of mole.FindChildrenWithClassTraverse("AlwaysPlayerName").concat(mole.FindChildrenWithClassTraverse("PlayerName"))) label.__text = "";
  w.card("Volt").DeleteAsync();
  w.advance(1100);
  assert.equal(w.ui("OHWho6").BHasClass("OHShown"), false, "the slot hides until the name arrives");
  assert.equal(w.ui("OHWho6").__text, "", "and does not show Volt");
  for (const label of mole.FindChildrenWithClassTraverse("AlwaysPlayerName").concat(mole.FindChildrenWithClassTraverse("PlayerName"))) label.__text = "Mole";
  w.advance(1100);
  assert.equal(w.ui("OHWho6").__text, "Mole");
  assert.ok(w.ui("OHWho6").BHasClass("OHShown"));
});

// A failing step must not take the steps behind it down (one try around the tick did, on every tick).
check("host: a step of the tick that throws is logged once and the later steps and the hand-back still run", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  // The stock clock label throws on every read: place() fails each tick.
  const time = w.topBar.FindChildTraverse("GameTime");
  Object.defineProperty(time, "actuallayoutwidth", { configurable: true, get() { throw new Error("boom"); } });
  w.press("OHMenuButton");
  w.type("OHAmberPlayer0Entry", "Kes");
  w.press("OHDone");
  w.advance(3300);
  assert.equal(w.who("Kestrel"), "Kes", "names still render");
  assert.equal(w.harness.logs.filter((line) => line.includes("place failed")).length, 1, "logged once, by step name");
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.RemoveClass(cls);
  w.advance(2200);
  assert.ok(!w.topBar.style.marginTop, "back to playing: the stock top bar returns to its place");
});

check("host: a card whose name label another mod renamed still gets its status column and purchase notices", () => {
  const w = world();
  for (const label of w.card("Volt").FindChildrenWithClassTraverse("PlayerName")
    .concat(w.card("Volt").FindChildrenWithClassTraverse("AlwaysPlayerName"))) label.DeleteAsync();
  w.bootHost();
  w.advance(2000);
  assert.ok(w.card("Volt").FindChild("OHDebuffsHost"), "the column is injected without a name label");
  w.clock("12:30");
  w.advance(1000);
  w.buy("Volt", "Extra Health");
  w.advance(600);
  assert.equal(w.notices("Volt").length, 1, "its purchase notice shows (matched by hero id)");
  assert.equal(w.who("Kestrel"), "Kestrel", "the other names still show");
});

check("host: another mod's top bar without #GameTime, or no Escape menu, leaves the rest working", () => {
  const w = world({ gameTime: false, escape: "none" });
  w.bootHost();
  w.advance(3000);
  assert.ok(w.bar());
  assert.ok(w.ui("OHClock").BHasClass("OHGone"));
  assert.ok(w.ui("OHMid").BHasClass("OHGone"));
  assert.equal(w.who("Volt"), "Volt", "the names still show");
  const lines = w.harness.logs.filter((line) => line.includes("#GameTime") || line.includes("#EscapeMenu"));
  assert.equal(lines.length, 2, `each missing part logged once: ${lines.join(" | ")}`);
});

// ---------------------------------------------------------------- tournament bar

check("names: each name centres on its own card, measured from the first card (live 2026-10-23: the team panel is wider than its cards)", () => {
  const w = world();
  // The stock cards are 87 px from 2 px into the 528 px team panel (cards flow from its left; the panel
  // is width 100%), so dividing the panel evenly drifts up to 3 px per card.
  const lay = (teamId) => w.topBar.FindChildTraverse(teamId).FindChildTraverse("PlayersContainer").Children()
    .filter((card) => card.paneltype === "CitadelHudTopBarPlayer")
    .forEach((card, k) => Object.assign(card, { actualxoffset: 2 + k * 87, actualyoffset: 0, actuallayoutwidth: 87, actuallayoutheight: 100, actualuiscale_x: 1 }));
  lay("TeamFriendly");
  lay("TeamEnemy");
  w.bootHost();
  w.advance(2000);
  for (let k = 0; k < 6; k++) {
    assert.equal(w.ui(`OHWho${k}`).style.marginLeft, `${Math.round(330 + 2 + k * 87 + 43.5 - 43)}px`, `amber card ${k}`);
    assert.equal(w.ui(`OHWho${6 + k}`).style.marginLeft, `${Math.round(1062 + 2 + k * 87 + 43.5 - 43)}px`, `sapphire card ${k}`);
  }
});

check("bar: plates at the outer ends joined to the strips, fit rules at 16:10 and 1920x1200, clock stack under the clock", () => {
  const plate = (w, side) => {
    const team = w.ui(`OHTeam${side}`);
    return { left: team.style.marginLeft, width: team.style.width, compact: team.BHasClass("OHCompact"), narrow: team.BHasClass("OHNarrow") };
  };
  // Design 17: the plates sit in the band at the screen's top edge and join their team's strip with no
  // gap (the left one ends at the team's 330, the right one starts at its 1590); a 40 px join fades the
  // plate colour into the strip's start.
  const a = world();
  a.bootHost();
  a.advance(2000);
  assert.equal(a.bar().style.width, "1920px");
  deq(plate(a, "Left"), { left: "80px", width: "250px", compact: false, narrow: false }, "mockup: x 80");
  deq(plate(a, "Right"), { left: "1590px", width: "250px", compact: false, narrow: false }, "mockup: x 1590");
  deq([a.ui("OHJoinLeft").style.marginLeft, a.ui("OHJoinRight").style.marginLeft], ["330px", `${1590 - 40}px`]);
  assert.ok(a.ui("OHJoinLeft").BHasClass("OHJoinShown"));
  assert.ok(!a.ui("OHTeamLeft").BHasClass("OHNoCap"), "250 px keeps the caption");
  // The series digits sit inside the centre tab at its ends; the organiser keeps 196 - 2 x 22 - 4 px.
  assert.equal(a.ui("OHOrgName").style.maxWidth, "148px");
  assert.equal(a.ui("OHClock").style.marginLeft, `${960 - 180}px`);
  assert.equal(a.ui("OHClock").style.marginTop, `${14 + 20 + 52}px`, "the chips sit where Night Desk's do (no stage box)");
  // Names centred on their cards; the strips over the stock teams; the centre plate on the clock.
  assert.equal(a.ui("OHWho0").style.marginLeft, `${330 + 44 - 43}px`);
  assert.equal(a.ui("OHWho11").style.marginLeft, `${1062 + 5 * 88 + 44 - 43}px`);
  deq([a.ui("OHStripLeft").style.marginLeft, a.ui("OHStripLeft").style.width], ["330px", "528px"]);
  assert.equal(a.ui("OHMid").style.marginLeft, `${960 - 98}px`);
  // Clock bans: the left team's end 11 px left of the clock label (5 px clock padding + 6 px gap).
  assert.equal(a.ui("OHBansRight").style.marginLeft, `${1000 + 11}px`);
  assert.equal(a.ui("OHBansRight").style.marginTop, `${14 + 10 - 16}px`, "centred on the clock label (32 px bans)");
  // 1728x1080 (spike): the teams span 234-1494.
  const b = world({ width: 1728, teamsAt: { friendX: 234, enemyX: 1728 - 234 - 528 } });
  b.bootHost();
  b.advance(2000);
  deq(plate(b, "Left"), { left: "72px", width: "162px", compact: true, narrow: false }, "1728: 234 - 72 px, no gap");
  assert.ok(b.ui("OHTeamLeft").BHasClass("OHNoCap"), "a narrow end drops the caption first");
  // 1920x1200: the HUD scales by height (1.111); the layout is 1728 px wide.
  const s = 1200 / 1080;
  const c = world({ height: 1200, scale: s, teamsAt: { friendX: Math.round(234 * s), enemyX: Math.round((1728 - 234 - 528) * s) } });
  c.bootHost();
  c.advance(2000);
  assert.equal(c.bar().style.width, "1728px");
  assert.equal(plate(c, "Left").width, "162px");
  assert.equal(plate(c, "Right").left, `${1728 - 234}px`);
  // A very narrow end: the plate goes, the rest stays.
  const d = world({ width: 1440, teamsAt: { friendX: 120, enemyX: 1440 - 120 - 528 } });
  d.bootHost();
  d.advance(2000);
  assert.ok(d.ui("OHTeamLeft").BHasClass("OHPlateGone") && !d.ui("OHTeamLeft").style.visibility,
    "a plate without room goes by class (live 2026-10-23: clearing an inline collapse never shows a panel again)");
  assert.ok(!d.ui("OHJoinLeft").BHasClass("OHJoinShown"), "no plate, no join");
  results.runs.push({ name: "placement", p1920: [plate(a, "Left"), plate(a, "Right")], p1728: plate(b, "Left"), p1200: plate(c, "Left") });
});

check("bar: editor fields reach the bar; a team follows its stock panel when the sides swap", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  w.press("OHMenuButton");
  assert.ok(w.menu().BHasClass("OHOpen"));
  w.type("OHStageEntry", "Grand Final");
  w.press("OHBo5");
  w.type("OHAmberNameEntry", "Night Owls");
  w.type("OHAmberTagEntry", "now");
  w.type("OHSapphireNameEntry", "Brass Saints");
  for (let i = 0; i < 5; i++) w.press("OHAmberSeriesUp");
  w.press("OHSapphireSeriesUp");
  // Design 17: the left plate's caption carries stage and format, the right one game and first-to.
  assert.equal(text(w.ui("OHCapLeft")), "Grand Final · BO5");
  assert.equal(text(w.ui("OHCapRight")), "GAME 5 · FIRST TO 3");
  assert.equal(text(w.ui("OHNameLeft")), "Night Owls");
  assert.equal(text(w.ui("OHMonoLeft")), "NOW");
  assert.equal(text(w.ui("OHScoreTextLeft")), "3", "series capped at the wins Bo5 needs; it sits in the centre tab");
  assert.equal(text(w.ui("OHSeriesValue".replace("OH", "OHAmber"))), "3");
  assert.equal(text(w.ui("OHNameRight")), "Brass Saints");
  assert.ok(w.ui("OHTeamLeft").BHasClass("OHAmber") && w.ui("OHTeamRight").BHasClass("OHSapphire"));
  w.press("OHBo1");
  assert.equal(w.state().amber.series, 1, "a shorter format caps the series instead of resetting it");
  // Bans through the hero picker; a hero picked again moves.
  const haze = HEROES.find(([, name]) => name === "Haze")[0];
  w.press("OHAmberBan0");
  assert.ok(w.menu().BHasClass("OHPicking"));
  w.ui(`OHHero${haze}`).events.onactivate();
  assert.equal(w.ui("OHBanLeft0Image").heroId, haze);
  assert.ok(w.ui("OHBansLeft").BHasClass("OHHasBans") && w.ui("OHBanLeft0").BHasClass("OHBanSet"));
  w.advance(1100);
  assert.equal(w.ui("OHBansLeft").style.marginLeft, `${920 - 11 - 36}px`, "one left ban (32 px + margins) ends at the clock");
  w.press("OHSapphireBan1");
  w.ui(`OHHero${haze}`).events.onactivate();
  deq([w.state().amber.bans, w.state().sapphire.bans], [[0, 0, 0], [0, haze, 0]]);
  assert.ok(!w.ui("OHBansLeft").BHasClass("OHHasBans"));
  assert.equal(w.ui("OHBanRight1Image").heroId, haze);
  // Bans per team: 3 shows a third slot in the editor and on the bar; 2 collapses it again and keeps its ban.
  assert.equal(w.ui("OHAmberBan2").visible, false, "two bans: the editor's third slot is collapsed");
  assert.ok(w.ui("OHBans2").BHasClass("OHSelected") && !w.ui("OHBans3").BHasClass("OHSelected"));
  w.press("OHBans3");
  assert.equal(w.state().banCount, 3);
  assert.ok(w.ui("OHBans3").BHasClass("OHSelected") && w.ui("OHAmberBan2").visible === true, "three bans: the third slot shows");
  const abrams3 = HEROES.find(([, name]) => name === "Abrams")[0];
  w.press("OHSapphireBan2");
  w.ui(`OHHero${abrams3}`).events.onactivate();
  assert.ok(w.ui("OHBanRight2").BHasClass("OHBanSet") && w.ui("OHBanRight2Image").heroId === abrams3, "the bar shows the third ban");
  w.press("OHBans2");
  assert.ok(!w.ui("OHBanRight2").BHasClass("OHBanSet") && w.ui("OHBanRight1").BHasClass("OHBanSet"), "two bans: the bar hides the third");
  deq(w.state().sapphire.bans, [0, haze, abrams3], "and keeps it for a switch back");
  assert.equal(w.ui("OHSapphireBan2").visible, false);
  w.press("OHBans3");
  assert.ok(w.ui("OHBanRight2").BHasClass("OHBanSet"), "switching back brings it back");
  w.press("OHSapphireBan2");
  w.press("OHPickerNone");
  w.press("OHBans2");
  deq([w.state().banCount, w.state().sapphire.bans], [2, [0, haze, 0]]);
  // The stock teams swap sides (spectating the other team): the plates follow the teams.
  w.geometry({ friendX: 1062, enemyX: 330 });
  w.advance(1100);
  assert.equal(text(w.ui("OHNameRight")), "Night Owls");
  assert.ok(w.ui("OHTeamRight").BHasClass("OHAmber"));
  assert.equal(text(w.ui("OHNameLeft")), "Brass Saints");
});

check("series: the stock match-end screen adds one win to the winner, once per map; abandoned and played games add none", () => {
  // client.dll 6819 (CitadelHudMatchEnd update): Team1Victory when the winning team is 2 (Amber),
  // Team2Victory otherwise, with MatchFinished; an abandoned game gets MatchAbandoned instead.
  const w = world();
  w.bootHost();
  w.advance(2000);
  const end = w.hud.FindChildTraverse("MatchEnd");
  assert.ok(end, "stock hud.xml has #MatchEnd");
  const show = (...classes) => {
    for (const cls of ["ShowMatchEnd", "MatchFinished", "MatchAbandoned", "Team1Victory", "Team2Victory"]) end.RemoveClass(cls);
    for (const cls of classes) end.AddClass(cls);
  };
  const series = () => [w.state().amber.series, w.state().sapphire.series];
  const newMap = () => {
    show();
    w.bar().DeleteAsync(); // a map load rebuilds #TopBar's children
    w.advance(1100);
  };
  show("MatchFinished", "Team1Victory");
  w.advance(1100);
  deq(series(), [0, 0], "nothing before the screen shows");
  show("ShowMatchEnd", "MatchFinished", "Team1Victory");
  w.advance(1100);
  deq(series(), [1, 0], "Team1Victory: Amber wins");
  assert.equal(text(w.ui("OHScoreTextLeft")), "1", "the bar shows it at once");
  w.advance(3000);
  // A demo seek back before the end and forward again: still one win.
  show();
  w.advance(1100);
  show("ShowMatchEnd", "MatchFinished", "Team1Victory");
  w.advance(1100);
  deq(series(), [1, 0], "once per map");
  newMap();
  show("ShowMatchEnd", "MatchAbandoned");
  w.advance(1100);
  deq(series(), [1, 0], "an abandoned game adds none");
  newMap();
  show("ShowMatchEnd", "MatchFinished", "Team2Victory");
  w.advance(1100);
  deq(series(), [1, 1], "Team2Victory: Sapphire wins");
  newMap();
  show("ShowMatchEnd", "MatchFinished", "Team2Victory");
  w.advance(1100);
  newMap();
  show("ShowMatchEnd", "MatchFinished", "Team2Victory");
  w.advance(1100);
  deq(series(), [1, 2], "capped at the wins Bo3 needs");
  // A game the user plays (never spectated) adds none.
  const p = world({ spectating: false });
  p.bootHost();
  p.advance(2000);
  const playedEnd = p.hud.FindChildTraverse("MatchEnd");
  for (const cls of ["ShowMatchEnd", "MatchFinished", "Team1Victory"]) playedEnd.AddClass(cls);
  p.advance(2000);
  deq([p.state().amber.series, p.state().sapphire.series], [0, 0]);
});

// User 2026-11-06 (a series in one private lobby): game 1 counted, game 2 did not. Games played one after
// another in the same lobby keep #TopBar, so they keep the bar, and the old once-per-bar rule swallowed
// every later result. Live (no replay_playback), the counted end screen going away while spectating starts
// the next game. How it fails: game 2 never counts; or a screen that stays up counts twice; or a demo seek
// (replay_playback, the check above) counts twice.
check("series: live, each game in the same lobby counts once, on the same bar", () => {
  const w = world();
  w.bootHost();
  w.hud.RemoveClass("replay_playback"); // spectating a live lobby: spec_mode and TeamSpectator only
  w.advance(2000);
  const end = w.hud.FindChildTraverse("MatchEnd");
  const show = (...classes) => {
    for (const cls of ["ShowMatchEnd", "MatchFinished", "MatchAbandoned", "Team1Victory", "Team2Victory"]) end.RemoveClass(cls);
    for (const cls of classes) end.AddClass(cls);
  };
  const series = () => [w.state().amber.series, w.state().sapphire.series];
  const bar = w.bar();
  show("ShowMatchEnd", "MatchFinished", "Team2Victory");
  w.advance(1100);
  deq(series(), [0, 1], "game 1: Sapphire");
  w.advance(5000);
  deq(series(), [0, 1], "a screen that stays up counts once");
  // Back to the lobby (not spectating), then game 2 starts on the same bar.
  for (const cls of ["spec_mode", "TeamSpectator"]) w.hud.RemoveClass(cls);
  show();
  w.advance(2000);
  for (const cls of ["spec_mode", "TeamSpectator"]) w.hud.AddClass(cls);
  w.advance(2000);
  assert.equal(w.bar(), bar, "the same bar: no map load between the games");
  show("ShowMatchEnd", "MatchFinished", "Team1Victory");
  w.advance(1100);
  deq(series(), [1, 1], "game 2 counts: Amber (the left side)");
  assert.equal(text(w.ui("OHScoreTextLeft")), "1");
  show();
  w.advance(2000);
  show("ShowMatchEnd", "MatchFinished", "Team1Victory");
  w.advance(1100);
  deq(series(), [2, 1], "game 3 too");
});

check("series: an end screen awards only after this map was seen without it (stale screens, reloads, first sight)", () => {
  // m1 audit B11 / m2 review: the script and #Hud survive a map change while #TopBar is rebuilt, so a
  // #MatchEnd that still carries the last result must not award again on the next map's bar, and must
  // not swallow that map's own result.
  const setup = () => {
    const w = world();
    w.bootHost();
    w.advance(2000);
    const end = w.hud.FindChildTraverse("MatchEnd");
    const show = (...classes) => {
      for (const cls of ["ShowMatchEnd", "MatchFinished", "MatchAbandoned", "Team1Victory", "Team2Victory"]) end.RemoveClass(cls);
      for (const cls of classes) end.AddClass(cls);
    };
    const series = () => [w.state().amber.series, w.state().sapphire.series];
    return { w, end, show, series };
  };
  // A stale screen over the next map's bar, then that map's real result.
  let t = setup();
  t.show("ShowMatchEnd", "MatchFinished", "Team1Victory");
  t.w.advance(1100);
  deq(t.series(), [1, 0]);
  t.w.bar().DeleteAsync(); // the next map: a new #TopBar, the end screen still up with its classes
  t.w.advance(3300);
  deq(t.series(), [1, 0], "a stale end screen adds nothing on the next map");
  t.show();
  t.w.advance(1100);
  t.show("ShowMatchEnd", "MatchFinished", "Team2Victory");
  t.w.advance(1100);
  deq(t.series(), [1, 1], "and the next map's own result still counts");
  // ShowMatchEnd one tick before the result classes: still one win.
  t = setup();
  t.show("ShowMatchEnd");
  t.w.advance(1100);
  t.show("ShowMatchEnd", "MatchFinished", "Team1Victory");
  t.w.advance(1100);
  deq(t.series(), [1, 0], "classes arriving over two ticks");
  // Spectating ends with the match, before the screen shows: still counted.
  t = setup();
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) t.w.hud.RemoveClass(cls);
  t.w.advance(1100);
  t.show("ShowMatchEnd", "MatchFinished", "Team2Victory");
  t.w.advance(1100);
  deq(t.series(), [0, 1], "spectating ended before the screen");
  // A layout reload while the screen shows: no second win.
  t = setup();
  t.show("ShowMatchEnd", "MatchFinished", "Team1Victory");
  t.w.advance(1100);
  t.w.bootHost();
  t.w.advance(3300);
  deq(t.series(), [1, 0], "a reload during the screen adds nothing");
  // The first sight of a map is its end screen: not counted, and the observer is told.
  t = setup();
  t.show("ShowMatchEnd", "MatchFinished", "Team1Victory");
  t.w.bar().DeleteAsync();
  t.w.advance(3300);
  deq(t.series(), [0, 0], "first sight is the end screen: no award");
  assert.ok(t.w.harness.logs.some((line) => /match end seen.*series not changed/.test(line)), "logged once");
});

check("bar: a web logo shows only after ImageLoaded; a failed one keeps the monogram; a bad URL is refused and never logged", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  w.press("OHMenuButton");
  const url = "https://cdn.example.org/night-owls.png";
  w.type("OHAmberLogoEntry", url, { submit: true });
  const logo = w.ui("OHLogoLeft");
  const images = () => logo.Children().filter((child) => child.paneltype === "Image");
  assert.equal(images().length, 1);
  assert.equal(images()[0].src, url);
  assert.ok(!logo.BHasClass("OHLogoShown"), "monogram until the image loads");
  assert.equal(text(w.ui("OHAmberLogoNote")), "Loading the logo...");
  images()[0].events.ImageLoaded();
  assert.ok(logo.BHasClass("OHLogoShown"));
  w.advance(1100);
  assert.equal(text(w.ui("OHAmberLogoNote")), "Logo loaded.");
  w.type("OHAmberLogoEntry", "https://cdn.example.org/broken.png", { submit: true });
  assert.equal(images().length, 1, "the replaced image is deleted");
  images()[0].events.ImageFailedLoad();
  assert.equal(images().length, 0);
  assert.ok(!logo.BHasClass("OHLogoShown"));
  w.advance(1100);
  assert.ok(w.ui("OHAmberLogoNote").BHasClass("OHError"));
  const hostile = "https://user:secret@evil.example.org/x.png";
  w.type("OHAmberLogoEntry", hostile, { submit: true });
  assert.equal(text(w.ui("OHAmberLogoNote")), "Not used: needs a plain http(s) address.");
  assert.equal(w.state().amber.logo.url, "https://cdn.example.org/broken.png", "the refused URL changes nothing");
  assert.ok(!w.harness.logs.some((line) => line.includes("example.org")), "URLs are never logged");
  // A host link loads its direct image; with a fallback (an imgur page: the GIF, then the still image)
  // a failed source tries the next one, and only the last failure keeps the monogram.
  const page = "https://imgur.com/AbC12xy";
  w.type("OHAmberLogoEntry", page, { submit: true });
  assert.equal(w.state().amber.logo.url, page, "the URL is kept as typed");
  deq(images().map((image) => image.src), ["https://i.imgur.com/AbC12xy.gif"]);
  images()[0].events.ImageFailedLoad();
  deq(images().map((image) => image.src), ["https://i.imgur.com/AbC12xy.png"], "the still image after the GIF failed");
  w.advance(1100);
  assert.equal(text(w.ui("OHAmberLogoNote")), "Loading the logo...", "still loading while a source is left");
  images()[0].events.ImageLoaded();
  assert.ok(logo.BHasClass("OHLogoShown"), "the second source shows");
  w.type("OHAmberLogoEntry", "https://i.imgur.com/ZzZ9876.gifv", { submit: true });
  images()[0].events.ImageFailedLoad();
  images()[0].events.ImageFailedLoad();
  assert.equal(images().length, 0, "both sources failed");
  assert.ok(!logo.BHasClass("OHLogoShown"));
  w.advance(1100);
  assert.ok(w.ui("OHAmberLogoNote").BHasClass("OHError"));
  assert.ok(!w.harness.logs.some((line) => line.includes("imgur")), "host links are never logged either");
  // A source that failed is not asked for again this session (live: the second request reports
  // ImageLoaded and draws nothing): the URL back on this side goes straight to the monogram and the error.
  w.type("OHAmberLogoEntry", "https://cdn.example.org/night-owls.png", { submit: true });
  images()[0].events.ImageLoaded();
  w.type("OHAmberLogoEntry", "https://cdn.example.org/broken.png", { submit: true });
  assert.equal(images().length, 0, "the known-broken source is not loaded again");
  assert.ok(!logo.BHasClass("OHLogoShown"));
  w.advance(1100);
  assert.ok(w.ui("OHAmberLogoNote").BHasClass("OHError"), "and the note says it failed");
});

// ---------------------------------------------------------------- looks and soul lead graph

check("look: Night Desk moves the top bar 56 px down, swaps plates for the band and back without leaks", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  w.press("OHMenuButton");
  assert.ok(!w.menu().BHasClass("OHLookDeskOn"), "the Night Desk rows hide in Base Game+ Names");
  w.type("OHEventEntry", "Deadlock Community Cup");
  w.type("OHStageEntry", "Grand Final");
  w.type("OHAmberNameEntry", "Night Owls");
  w.type("OHSapphireNameEntry", "Brass Saints");
  w.press("OHAmberSeriesUp");
  w.press("OHSapphireSeriesUp");
  // Base Game+ Names: no organiser, so the centre shows the event title.
  assert.equal(text(w.ui("OHOrgName")), "Deadlock Community Cup");
  assert.ok(w.ui("OHMid").BHasClass("OHHasOrg"));
  const url = "https://cdn.example.org/owls.png";
  w.type("OHAmberLogoEntry", url, { submit: true });
  const images = (panel) => panel.Children().filter((child) => child.paneltype === "Image");
  assert.equal(images(w.ui("OHLogoLeft")).length, 1, "the plate loads the logo in Base Game+ Names");
  assert.equal(images(w.ui("OHDeskLogoLeft")).length, 0, "the band does not");
  w.press("OHLookDesk");
  assert.ok(w.menu().BHasClass("OHLookDeskOn") && w.ui("OHLookDesk").BHasClass("OHSelected"));
  assert.ok(w.band().BHasClass("OHStyleDesk") && !w.band().BHasClass("OHStyleNames"));
  assert.ok(w.bar().BHasClass("OHStyleDesk"), "the bar hides its plates, clock bans and stage box");
  assert.equal(w.topBar.style.marginTop, "56px");
  assert.equal(images(w.ui("OHLogoLeft")).length, 0, "the plate drops its logo");
  assert.equal(images(w.ui("OHDeskLogoLeft")).length, 1, "the band ring loads it");
  assert.equal(w.host().logoState("amber"), "loading");
  // Each team block spans its stock team; the logo ring sits at the inner end beside the centre, the name
  // right next to it (user sketch 2026-10-22), bans at the outer end; corners run to the team blocks.
  // The name ends 12 px (logo gap) from the 17 px tab half: 864 - 29 = 835, 23 px in from the team's end 858.
  deq([w.ui("OHDeskLeft").style.marginLeft, w.ui("OHDeskLeft").style.width, w.ui("OHDeskNameLeft").style.maxWidth,
    w.ui("OHDeskNameLeft").style.marginRight], ["330px", "528px", `${528 - 23 - 112}px`, "23px"]);
  // Arch A: the rings sit on the centre plate's edges (864 / 1056); arch and rings start 17 px left of it.
  deq([w.ui("OHArch").style.marginLeft, w.ui("OHRings").style.marginLeft], [`${960 - 96 - 17}px`, `${960 - 96 - 17}px`]);
  assert.ok(w.ui("OHDeskLogoLeft").BHasClass("OHAmber") && w.ui("OHDeskLogoRight").BHasClass("OHSapphire"), "rings carry their team colour");
  assert.equal(w.ui("OHDeskNameLeft").style.width, undefined, "the name sizes to its text (no shrink box)");
  deq([w.ui("OHDeskRight").style.marginLeft, w.ui("OHDeskRight").style.width], ["1062px", "528px"]);
  deq([w.ui("OHCornerLeft").style.marginLeft, w.ui("OHCornerLeft").style.width], ["72px", "250px"], "after the stock mute icon");
  w.geometry({ friendX: 1062, enemyX: 330 });
  w.advance(1100);
  assert.ok(w.ui("OHDeskLogoLeft").BHasClass("OHSapphire") && !w.ui("OHDeskLogoLeft").BHasClass("OHAmber"), "a side swap recolours the rings");
  w.geometry({ friendX: 330, enemyX: 1062 });
  w.advance(1100);
  deq([w.ui("OHCornerRight").style.marginLeft, w.ui("OHCornerRight").style.width], ["1598px", "322px"]);
  assert.equal(w.ui("OHCornerGame").style.maxWidth, "290px", "corner labels are capped inside the 16 px padding");
  assert.equal(w.ui("OHCornerEvent").style.maxWidth, "234px", "the left corner has no left padding");
  assert.ok(w.ui("OHCornerEvent").BHasClass("OHCornerLong"), "a 22-character event title steps down");
  deq([w.ui("OHDividerLeft").style.marginLeft, w.ui("OHDividerRight").style.marginLeft], ["316px", "1603px"], "dividers just outside the team blocks");
  assert.equal(w.ui("OHClock").style.marginTop, `${14 + 20 + 52}px`, "the graph sits at the mockup's y 86 (6 px higher than the stage box)");
  assert.equal(w.ui("OHMid").style.marginLeft, `${960 - 96}px`);
  assert.equal(text(w.ui("OHCornerEvent")), "Deadlock Community Cup");
  assert.equal(text(w.ui("OHCornerStage")), "Grand Final · BO3");
  assert.equal(text(w.ui("OHCornerGame")), "GAME 3", "1-1 in a Bo3 is game 3");
  assert.equal(text(w.ui("OHCornerFirst")), "FIRST TO 2");
  assert.equal(text(w.ui("OHDeskNameLeft")), "Night Owls");
  assert.ok(!w.ui("OHDeskNameLeft").BHasClass("OHNameLong") && !w.ui("OHDeskNameLeft").BHasClass("OHNameLonger"));
  w.type("OHSapphireNameEntry", "Brass Saints Esports Club");
  assert.ok(w.ui("OHDeskNameRight").BHasClass("OHNameLonger"), "a 25-character name steps down to 15 px");
  w.type("OHSapphireNameEntry", "Brass Saints Esports Co");
  assert.ok(w.ui("OHDeskNameRight").BHasClass("OHNameLong") && !w.ui("OHDeskNameRight").BHasClass("OHNameLonger"));
  w.type("OHSapphireNameEntry", "Brass Saints");
  deq([text(w.ui("OHMidSeriesLeft")), text(w.ui("OHMidSeriesRight"))], ["1", "1"]);
  assert.ok(w.ui("OHMidSeriesLeft").BHasClass("OHAmber") && w.ui("OHMidSeriesRight").BHasClass("OHSapphire"));
  // Night Desk shows no event fallback in the centre (the corner has it): the series stands alone.
  assert.equal(text(w.ui("OHOrgName")), "");
  assert.ok(w.ui("OHMid").BHasClass("OHNoOrg"));
  w.type("OHOrgEntry", "Community Cup");
  assert.equal(text(w.ui("OHOrgName")), "Community Cup");
  assert.ok(!w.ui("OHMid").BHasClass("OHNoOrg"));
  // Info card: hidden until it has a title.
  assert.ok(!w.ui("OHInfo").BHasClass("OHHasInfo"));
  w.type("OHInfoValueEntry", "$2,130.00");
  assert.ok(!w.ui("OHInfo").BHasClass("OHHasInfo"), "a value without a title shows nothing");
  w.type("OHInfoTitleEntry", "Prize pool");
  assert.ok(w.ui("OHInfo").BHasClass("OHHasInfo"));
  assert.ok(w.ui("OHInfoCaption").BHasClass("OHEmpty"));
  // The organiser logo replaces the name once it loads.
  w.type("OHOrgLogoEntry", "https://cdn.example.org/cup.png", { submit: true });
  const org = images(w.ui("OHOrgLogo"));
  assert.equal(org.length, 1);
  assert.ok(!w.ui("OHMid").BHasClass("OHOrgLogoShown"));
  org[0].events.ImageLoaded();
  assert.ok(w.ui("OHMid").BHasClass("OHOrgLogoShown"));
  w.advance(1100);
  assert.equal(text(w.ui("OHOrgLogoNote")), "Logo loaded.");
  // 16:10: the team blocks follow the stock teams; the corner still fits (154 px), a narrower one hides.
  w.geometry({ friendX: 234, enemyX: 1728 - 234 - 528 });
  w.advance(1100);
  assert.equal(w.ui("OHDeskLeft").style.marginLeft, "234px");
  assert.ok(!w.ui("OHCornerLeft").BHasClass("OHTooNarrow"), "a 154 px corner shows");
  w.geometry({ friendX: 160, enemyX: 1728 - 160 - 528 });
  w.advance(1100);
  assert.ok(w.ui("OHCornerLeft").BHasClass("OHTooNarrow"), "an 80 px corner hides");
  // Back to Base Game+ Names: the strip height and the plate logo return, nothing of Night Desk stays.
  w.geometry({ friendX: 330, enemyX: 1062 });
  w.press("OHLookNames");
  w.advance(1100);
  assert.equal(w.topBar.style.marginTop, "26px");
  assert.ok(!w.bar().BHasClass("OHStyleDesk") && w.band().BHasClass("OHStyleNames"));
  assert.equal(images(w.ui("OHLogoLeft")).length, 1);
  assert.equal(images(w.ui("OHDeskLogoLeft")).length, 0);
  assert.equal(text(w.ui("OHOrgName")), "Community Cup", "the organiser name wins over the event title");
});

check("graph: a pin at each 5:00 from the stock soul plates, shown for the set time; seeks and late joins never misdate", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  w.press("OHMenuButton");
  w.press("OHLookDesk");
  const draw = () => w.ui("OHGraphDraw").Children();
  const shown = () => w.ui("OHGraph").BHasClass("OHGraphShown");
  const at = (clock, amber, sapphire) => { w.clock(clock); w.souls(amber, sapphire); w.advance(1000); };
  at("4:50", "9.0k", "9.4k");
  assert.equal(shown(), false, "nothing before the first mark");
  at("5:03", "9.1<font>k</font>", "9.7<font>k</font>");
  deq(w.host().graphPins(), [{ m: 0, v: 0 }, { m: 5, v: -0.6 }], "0:00 plus the 5:00 pin");
  assert.equal(shown(), true, "a new pin shows the graph");
  assert.equal(text(w.ui("OHGraphLead")), "SAP +0.6k");
  assert.ok(w.ui("OHGraphLead").BHasClass("OHSapphire"));
  const pins = draw().filter((panel) => panel.BHasClass("OHGraphPin"));
  assert.equal(pins.length, 2);
  assert.ok(pins[1].BHasClass("OHSapphire"));
  // A smooth curve: many short segments, not one straight line per pin pair.
  const segs = draw().filter((panel) => panel.BHasClass("OHGraphSeg"));
  assert.ok(segs.length >= 20 && segs.every((seg) => parseFloat(seg.style.width) < 8), `smooth line: ${segs.length} segments`);
  const fills = draw().filter((panel) => panel.BHasClass("OHGraphFill"));
  // The line runs through every sample, so the 0:30 Amber lead (+0.1k at boot) shows before Sapphire takes over.
  assert.ok(fills.length > 50 && fills.slice(-20).every((panel) => panel.BHasClass("OHSapphire")), "the area under the zero line is sapphire");
  for (let i = 0; i < 30; i++) at(`5:${String(4 + i).padStart(2, "0")}`, "9.2k", "9.6k");
  assert.equal(shown(), false, "hidden 30 s after the pin");
  at("5:40", "9.3k", "9.6k");
  assert.equal(w.host().graphPins().length, 2, "no pin between marks");
  at("10:01", "14.4k", "12.0k");
  deq(w.host().graphPins().map((p) => p.m), [0, 5, 10]);
  assert.equal(shown(), true);
  assert.ok(draw().filter((panel) => panel.BHasClass("OHGraphFill")).some((panel) => !panel.BHasClass("OHSapphire")), "amber fill above zero");
  // A demo seek back to 7:00 drops the 10:00 pin; jumping ahead past a mark's window records nothing.
  at("7:00", "11.0k", "11.0k");
  deq(w.host().graphPins().map((p) => p.m), [0, 5]);
  at("16:30", "20.0k", "18.0k");
  deq(w.host().graphPins().map((p) => p.m), [0, 5], "15:00 is 90 s past: not recorded");
  // 20:00 is recorded but follows a gap: drawn alone, so no line over 10-15 and nothing to show.
  for (const clock of ["20:02"]) at(clock, "24.0k", "21.0k");
  deq(w.host().graphPins().map((p) => p.m), [20]);
  assert.equal(shown(), false, "one point is not a graph");
  at("25:01", "30.0k", "26.0k");
  deq(w.host().graphPins().map((p) => p.m), [20, 25]);
  assert.equal(shown(), true);
  // OFF never shows; ALWAYS keeps it; Base Game+ Names shows it too (design 19, user 2026-10-23).
  w.press("OHGraphOff");
  assert.equal(shown(), false);
  w.press("OHGraphAlways");
  for (let i = 0; i < 70; i++) at(`25:${String(2 + i % 50).padStart(2, "0")}`, "30.0k", "26.0k");
  assert.equal(shown(), true);
  w.press("OHLookNames");
  w.advance(1100);
  assert.equal(shown(), true, "the graph shows in Base Game+ Names");
  assert.equal(w.state().graph.show, -1);
});

check("graph: a new map starts over, while a bar rebuilt in the same game keeps its pins", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  const at = (clock, amber, sapphire) => { w.clock(clock); w.souls(amber, sapphire); w.advance(1000); };
  const marks = () => w.host().graphPins().map((p) => p.m);
  at("4:50", "9.0k", "9.4k");
  at("5:03", "9.1k", "9.7k");
  at("10:01", "14.4k", "12.0k");
  deq(marks(), [0, 5, 10]);
  // Another mod's reload deletes the bar mid-game: the clock runs on, so the game is the same.
  w.bar().DeleteAsync();
  at("10:03", "14.4k", "12.1k");
  deq(marks(), [0, 5, 10], "the same game keeps its pins");
  for (const minute of [15, 20, 25, 30]) at(`${minute}:01`, "30.0k", "28.0k");
  deq(marks(), [0, 5, 10, 15, 20, 25, 30]);
  // The next map, joined at 35:00 (later than the last one ended): none of the old game's leads.
  w.bar().DeleteAsync();
  at("35:01", "40.0k", "41.0k");
  at("40:01", "45.0k", "47.0k");
  assert.ok(!marks().some((m) => m < 35), `no pin from the map before: ${marks()}`);
  assert.equal(text(w.ui("OHGraphLead")), "SAP +2.0k");
});

check("graph: pins at the interval set in the editor; a new interval re-pins from the recorded lead", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  w.press("OHMenuButton");
  w.press("OHLookDesk");
  w.press("OHGraphEvery60");
  assert.equal(w.state().graph.every, 60);
  const shown = () => w.ui("OHGraph").BHasClass("OHGraphShown");
  const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  // A continuous clock from 0:50 to 3:05, Amber pulling ahead 100 souls a second.
  for (let t = 50; t <= 185; t++) { w.clock(mmss(t)); w.souls(`${(10 + t / 10).toFixed(1)}k`, "10.0k"); w.advance(1000); }
  deq(w.host().graphPins().map((p) => p.m), [0, 1, 2, 3]);
  assert.ok(Math.abs(w.host().graphPins()[2].v - 12) < 1e-9, "the 2:00 pin is the lead at 2:00");
  assert.equal(shown(), true, "the 3:00 pin shows the graph");
  for (let t = 186; t <= 230; t++) { w.clock(mmss(t)); w.advance(1000); }
  assert.equal(shown(), false);
  // Two minutes: the 2:00 pin comes from the recorded lead; changing the interval does not pop the graph.
  w.press("OHGraphEvery120");
  w.advance(1000);
  deq(w.host().graphPins().map((p) => p.m), [0, 2]);
  assert.equal(shown(), false);
  for (const every of [60, 120, 180, 300, 600]) assert.ok(w.ui(`OHGraphEvery${every}`), every);
  assert.equal(w.ui("OHGraphEvery120").BHasClass("Selected"), true);
  // Bad values fall back to 5:00.
  assert.equal(stateApiOf().normalize({ graph: { every: 7 } }).graph.every, 300);
});

check("graph: size and position from the editor; size keeps the top centre; rift HUD under the timers, graph under it; damage impact untouched", () => {
  const w = world();
  w.bootHost();
  w.topBar.FindChildTraverse("KothCashInMeter").visible = false;
  w.advance(2000);
  w.press("OHMenuButton");
  w.press("OHLookDesk");
  w.press("OHGraphAlways");
  const g = () => w.ui("OHGraph").style;
  const centre = () => parseFloat(g().marginLeft) + parseFloat(g().width) / 2;
  w.advance(1100);
  deq([g().width, g().marginLeft, g().marginTop, text(w.ui("OHGraphSizeValue"))], ["200px", "80px", "4px", "100%"], "default: centred in the 360 px stack");
  // Size: laid out larger (no bitmap scale), the top centre stays put (user 2026-10-23).
  w.press("OHGraphSizeUp");
  w.press("OHGraphSizeUp");
  w.advance(1100);
  assert.equal(w.state().graph.size, 120);
  deq([g().width, g().marginTop, text(w.ui("OHGraphSizeValue"))], ["240px", "4px", "120%"]);
  assert.equal(centre(), 180, "size does not move the graph");
  assert.equal(g().preTransformScale2d, undefined, "no bitmap scaling (blurry text live in DLF)");
  deq([w.ui("OHGraphPlot").style.width, w.ui("OHGraphPlot").style.height, w.ui("OHGraphLead").style.fontSize], ["220.8px", "60px", "14.4px"]);
  for (let i = 0; i < 10; i++) w.press("OHGraphSizeUp");
  assert.equal(w.state().graph.size, 150, "size stops at 150%");
  // Position: X and Y move it from its spot; they do not change with size.
  for (let i = 0; i < 3; i++) w.press("OHGraphXUp");
  w.press("OHGraphYUp");
  w.advance(1100);
  deq([w.state().graph.x, w.state().graph.y, text(w.ui("OHGraphXValue")), text(w.ui("OHGraphYValue"))], [30, 5, "30 px", "5 px"]);
  assert.equal(centre(), 210);
  assert.equal(g().marginTop, "9px");
  w.press("OHGraphSizeDown");
  w.advance(1100);
  deq([centre(), g().marginTop], [210, "9px"], "a size change keeps the moved position");
  for (let i = 0; i < 100; i++) w.press("OHGraphXDown");
  for (let i = 0; i < 100; i++) w.press("OHGraphYDown");
  deq([w.state().graph.x, w.state().graph.y], [-600, -40], "X and Y stop at their limits");
  // Bad values fall back field by field; share codes and saves carry the fields like the rest of graph.
  deq(Object.assign({}, stateApiOf().normalize({ graph: { size: 155, x: 7, y: 301 } }).graph), { show: 30, every: 300, size: 100, x: 0, y: 0 });
  // The stock rift HUD (#KothCashInMeter: margin-top 110 at ui-scale 70%, citadel_hud_koth.css 6813) is
  // drawn behind the chips (live 2026-10-23): it moves under the timers, which stay put, and the soul lead
  // graph moves under it (user 2026-10-23). The mock engine lays the rift HUD out from its margin with
  // `k` screen px per margin px, which the host does not know (ui-scale may or may not scale the margin).
  w.ui("OHCues").actuallayoutheight = 42;
  w.advance(1100);
  const before = w.ui("OHClock").style.marginTop;
  assert.equal(g().marginTop, "-36px", "Y -40 from its spot under the timers");
  const koth = w.topBar.FindChildTraverse("KothCashInMeter");
  const barY = () => w.ui("OHBar").GetPositionWithinWindow().y;
  const kothTop = () => koth.GetPositionWithinWindow().y - barY();
  const layOut = (k) => { koth.actualyoffset = parseFloat(koth.style.marginTop || "110") * k; };
  Object.assign(koth, { visible: true, actualxoffset: 800, actuallayoutwidth: 224, actuallayoutheight: 80 });
  for (const k of [0.7, 1]) {
    layOut(k);
    w.advance(1100);
    layOut(k);
    w.advance(1100);
    layOut(k);
    assert.equal(w.ui("OHClock").style.marginTop, before, "the rift HUD does not move the timers");
    // The timers end at 86 + 42 = 128: the rift HUD starts 4 px under them, the graph 4 px under it.
    assert.ok(Math.abs(kothTop() - 132) <= 1, `rift HUD top ${kothTop()} at k ${k}`);
    assert.equal(g().marginTop, `${4 + 80 + 4}px`, "the graph sits under the rift HUD");
  }
  // Base Game+ Names: .OHCues has a 6 px margin-top (oh_bar.css), which its layout height leaves out:
  // the chips end at 86 + 6 + 42 = 134, the rift HUD starts 4 px under them, the graph 4 px under it.
  w.press("OHMenuButton");
  w.press("OHLookNames");
  w.press("OHDone");
  for (let i = 0; i < 3; i++) {
    layOut(1);
    w.advance(1100);
  }
  layOut(1);
  assert.ok(Math.abs(kothTop() - 138) <= 1, `Names: rift HUD top ${kothTop()} (chips end at 134)`);
  assert.equal(g().marginTop, `${4 + 80 + 4}px`, "Names: the graph sits 4 px under the rift HUD");
  w.press("OHMenuButton");
  w.press("OHLookDesk");
  w.press("OHDone");
  w.advance(1100);
  koth.visible = false;
  w.advance(1100);
  assert.equal(g().marginTop, "-36px", "back to its own spot once the rift HUD hides");
  // The stock damage impact keeps its own place (user 2026-10-23: back to default).
  const dmg = w.hud.FindChildTraverse("damage_impact");
  assert.ok(!dmg.style.marginTop, "damage impact untouched");
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.RemoveClass(cls);
  w.advance(1100);
  assert.equal(koth.style.marginTop || "", "", "the rift HUD returns to its stock margin outside spectating");
});

// Design 19/20 (user 2026-10-23, live: the stock objective health at HUD y 160 sat behind the timers and the
// soul lead graph). How it can fail: the bar stays behind the timers or the rift HUD; the graph covers it;
// the graph sits a whole stock panel lower (or shows) while the rift HUD and a bar both show, or loses its
// show time to the wait; the margin chases a layout pass that lags (writes every tick); a tier-1 guardian or
// a hidden bar counts as shown; the stock margin is not restored after spectating.
check("objective health: the stock bars move under the timers or the rift HUD, the graph under them, and waits while both show", () => {
  const w = world();
  w.bootHost();
  w.topBar.FindChildTraverse("KothCashInMeter").visible = false;
  // The stock panel (hud.xml gameplay_hud, margin-top 0): one tier-2 walker 160 px under its top, 400 x 71.
  const panel = w.hud.FindChildTraverse("objectives_health_friendly");
  const gameplay = panel.GetParent();
  Object.assign(gameplay, { actualxoffset: 0, actualyoffset: 0, actuallayoutwidth: 1920, actuallayoutheight: 1080, actualuiscale_x: 1 });
  Object.assign(panel, { actualxoffset: 310, actualyoffset: 0, actuallayoutwidth: 1300, actuallayoutheight: 240, actualuiscale_x: 1 });
  const bar = (cls, y, h) => {
    const objective = new MockPanel("Panel", panel, "");
    for (const name of cls.split(" ")) objective.AddClass(name);
    return Object.assign(objective, { actualxoffset: 450, actualyoffset: y, actuallayoutwidth: 400, actuallayoutheight: h, actualuiscale_x: 1 });
  };
  const walker = bar("objective is_tier2", 160, 71);
  const guardian = bar("objective is_active is_tier1", 120, 30); // collapsed in game; never counts
  const layOut = () => { panel.actualyoffset = parseFloat(panel.style.marginTop || "0"); };
  const barY = () => w.ui("OHBar").GetPositionWithinWindow().y;
  const objTop = () => walker.GetPositionWithinWindow().y - barY();
  const g = () => w.ui("OHGraph").style;
  const shown = () => w.ui("OHGraph").BHasClass("OHGraphShown");
  w.advance(2000);
  w.ui("OHCues").actuallayoutheight = 42;
  w.advance(1100);
  // Base Game+ Names: the timers end at the clock stack's top + 6 (.OHCues margin-top) + 42; the empty
  // panel already waits 4 px under them.
  const cuesBottom = parseFloat(w.ui("OHClock").style.marginTop) + 6 + 42;
  layOut();
  assert.ok(Math.abs(objTop() - (cuesBottom + 4)) <= 1, `a new bar appears in place: ${objTop()} vs ${cuesBottom + 4}`);
  assert.equal(g().marginTop, "4px", "no bar shown: the graph keeps its spot");
  walker.AddClass("is_active");
  w.advance(1100);
  layOut();
  assert.ok(Math.abs(objTop() - (cuesBottom + 4)) <= 1, `walker top ${objTop()}`);
  assert.equal(g().marginTop, `${4 + 71 + 4}px`, "the graph sits 4 px under the bar (the guardian does not count)");
  // A layout pass that lags: the margin does not chase it.
  const margin = panel.style.marginTop;
  panel.actualyoffset = 0;
  w.advance(3300);
  assert.equal(panel.style.marginTop, margin, "no oscillation while the layout lags");
  layOut();
  // The graph at a mark: shown in Base Game+ Names.
  w.press("OHMenuButton");
  w.press("OHGraph30");
  const at = (clock, amber, sapphire) => { w.clock(clock); w.souls(amber, sapphire); w.advance(1000); };
  at("4:50", "9.0k", "9.4k");
  at("5:03", "9.1k", "9.7k");
  assert.equal(shown(), true, "the 5:00 pin shows the graph in Base Game+ Names");
  // The rift HUD opens: the bar moves under it and the graph waits.
  const koth = w.topBar.FindChildTraverse("KothCashInMeter");
  const kothLay = () => { koth.actualyoffset = parseFloat(koth.style.marginTop || "110"); };
  Object.assign(koth, { visible: true, actualxoffset: 800, actuallayoutwidth: 224, actuallayoutheight: 80, actualuiscale_x: 1 });
  for (let i = 0; i < 3; i++) { kothLay(); layOut(); w.advance(1100); }
  kothLay();
  layOut();
  assert.ok(Math.abs(objTop() - (cuesBottom + 4 + 80 + 4)) <= 1, `walker under the rift HUD: ${objTop()}`);
  assert.equal(shown(), false, "the graph waits while the rift HUD and a bar both show");
  for (let i = 0; i < 40; i++) at("5:03", "9.1k", "9.7k");
  assert.equal(shown(), false, "still waiting 40 s later");
  // The bar clears: the graph shows its full 30 s under the rift HUD.
  walker.RemoveClass("is_active");
  at("5:03", "9.1k", "9.7k");
  assert.equal(shown(), true, "shows once the bar clears");
  assert.equal(g().marginTop, `${4 + 80 + 4}px`, "under the rift HUD");
  for (let i = 0; i < 25; i++) at("5:03", "9.1k", "9.7k");
  assert.equal(shown(), true, "its full time after the wait");
  for (let i = 0; i < 8; i++) at("5:03", "9.1k", "9.7k");
  assert.equal(shown(), false, "then hides");
  // Night Desk: the same stack under its own timers.
  koth.visible = false;
  walker.AddClass("is_active");
  w.press("OHLookDesk");
  for (let i = 0; i < 2; i++) { layOut(); w.advance(1100); }
  layOut();
  const deskCues = parseFloat(w.ui("OHClock").style.marginTop) + 42;
  assert.ok(Math.abs(objTop() - (deskCues + 4)) <= 1, `Night Desk walker top ${objTop()} vs ${deskCues + 4}`);
  // Outside spectating the panel returns to its stock margin.
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.RemoveClass(cls);
  w.advance(1100);
  assert.equal(panel.style.marginTop || "", "", "stock margin outside spectating");
  assert.ok(guardian.BHasClass("is_tier1"));
});

check("editor: a fresh install fills the boxes with sample text, and the top bar shows it", () => {
  const w = world({ samples: true });
  w.bootHost();
  w.advance(2000);
  w.press("OHMenuButton");
  w.advance(1100);
  for (const [id, value] of [["OHEventEntry", "Community Cup Season 2"], ["OHStageEntry", "Grand Final"], ["OHOrgEntry", "Community Cup"],
    ["OHAmberNameEntry", "Night Owls"], ["OHAmberTagEntry", "NOW"], ["OHSapphireNameEntry", "Brass Saints"], ["OHSapphireTagEntry", "BRS"],
    ["OHInfoTitleEntry", "Prize pool"], ["OHInfoValueEntry", "$2,130"], ["OHInfoCaptionEntry", "Donate to increase"]]) {
    assert.equal(w.ui(id).text, value, id);
  }
  assert.ok(text(w.ui("OHCapLeft")).startsWith(`${"Grand Final"} · BO`), "the stage rides in the left plate caption");
  assert.equal(w.ui("OHOrgLogoEntry").text, "", "logo URLs start empty");
  // Clearing a box clears the bar; it does not snap back to the sample.
  w.type("OHStageEntry", "");
  assert.equal(w.state().stage, "");
});

check("save: the setup survives a restart through the local save page; damaged saves wait for RESET", () => {
  assert.ok(storeScript, `save page source at ${STORE_PAGE}`);
  const disk = {};
  const a = world({ disk });
  a.bootHost();
  markAll(a);
  a.advance(3000);
  assert.equal(text(a.ui("OHSaveStatus")), "SAVED", "a fresh PC saves the defaults");
  a.press("OHMenuButton");
  a.type("OHEventEntry", "Spring Cup");
  a.type("OHAmberPlayer0Entry", "Kes");
  a.press("OHGraphEvery120");
  assert.equal(text(a.ui("OHSaveStatus")), "SAVING");
  a.advance(3000);
  assert.equal(text(a.ui("OHSaveStatus")), "SAVED");
  const record = disk["hantu.observer_hud.v2/state"];
  assert.ok(record && record.startsWith("OHS1."), "one key, OHS1 record");
  // Restart: a new process adopts the saved setup.
  const b = world({ disk });
  b.bootHost();
  markAll(b);
  b.advance(3000);
  assert.equal(b.state().event, "Spring Cup");
  assert.equal(b.state().players[ACCOUNT_OF("Kestrel")].a, "Kes");
  assert.equal(b.state().graph.every, 120);
  assert.equal(b.who("Kestrel"), "Kes");
  // A damaged record is left alone (nothing written) until RESET ALL.
  disk["hantu.observer_hud.v2/state"] = record.slice(0, -2) + "x}";
  const c = world({ disk });
  c.bootHost();
  c.advance(3000);
  assert.equal(text(c.ui("OHSaveStatus")), "SAVE DAMAGED - RESET TO REPAIR");
  c.press("OHMenuButton");
  c.type("OHStageEntry", "Final");
  c.advance(3000);
  assert.ok(disk["hantu.observer_hud.v2/state"].endsWith("x}"), "an edit does not overwrite a damaged save");
  c.press("OHReset");
  c.press("OHReset");
  c.advance(3000);
  assert.equal(text(c.ui("OHSaveStatus")), "SAVED");
  assert.ok(!disk["hantu.observer_hud.v2/state"].endsWith("x}"));
  // No page (offline Steam browser): session only after 30 s, edits still apply.
  const d = world({ offline: true });
  d.bootHost();
  d.advance(31000);
  assert.equal(text(d.ui("OHSaveStatus")), "OFFLINE - SESSION ONLY");
  d.press("OHMenuButton");
  d.type("OHStageEntry", "Semi Final");
  assert.ok(text(d.ui("OHCapLeft")).startsWith(`${"Semi Final"} · BO`), "the stage rides in the left plate caption");
  // An edit made while the save loads wins over the stored record.
  const e = world({ disk });
  e.hudRoot.__web.mute = true; // the page has not answered yet
  e.bootHost();
  e.advance(2000);
  e.press("OHMenuButton");
  e.type("OHEventEntry", "Typed first");
  e.hudRoot.__web.mute = false;
  e.advance(5000);
  assert.equal(e.state().event, "Typed first");
});

// Live 2026-10-23 (two launches with +map new_player_basics): one session showed the sample teams and
// never loaded the save (OFFLINE - SESSION ONLY, nothing written), the next loaded it. The hello gave
// up for good after 30 s, and its retries only changed the URL fragment, which never reloads a page
// whose first load was lost. How a fix could fail: a lost first load still never recovers; a browser
// that comes up after 30 s is never asked again; a late save overwrites edits made meanwhile; a slow
// first load is cut off by the reloads; a really offline PC is asked forever.
check("save: a lost or late save page is asked again; edits made meanwhile win; a dead page is not asked forever", () => {
  assert.ok(storeScript, `save page source at ${STORE_PAGE}`);
  const disk = {};
  const a = world({ disk });
  a.bootHost();
  a.advance(3000);
  a.press("OHMenuButton");
  a.type("OHEventEntry", "Spring Cup");
  a.advance(3000);
  assert.equal(text(a.ui("OHSaveStatus")), "SAVED");
  const record = disk["hantu.observer_hud.v2/state"];
  const pageLoads = (w) => w.hudRoot.__web.urls.filter((url) => url.startsWith(STORE_URL)).length;
  // The first load is lost (an error page): the page is loaded again and the save adopted.
  const b = world({ disk });
  b.hudRoot.__web.lostLoads = 1;
  b.bootHost();
  b.advance(20000);
  assert.equal(b.state().event, "Spring Cup", "adopted after the lost load");
  assert.equal(text(b.ui("OHSaveStatus")), "SAVED");
  assert.ok(b.hudRoot.__web.urls.includes("about:blank"), "left the dead page to load it again");
  // The browser answers only after a minute: session only at 30 s, then the save loads.
  const c = world({ disk, offline: true });
  c.bootHost();
  c.advance(31000);
  assert.equal(text(c.ui("OHSaveStatus")), "OFFLINE - SESSION ONLY");
  c.hudRoot.__web.offline = false;
  c.advance(60000);
  assert.equal(c.state().event, "Spring Cup", "a late page still loads the save");
  assert.equal(text(c.ui("OHSaveStatus")), "SAVED");
  // Edits made while offline win over the late save, and are saved.
  const d = world({ disk, offline: true });
  d.bootHost();
  d.advance(31000);
  d.press("OHMenuButton");
  d.type("OHEventEntry", "Typed offline");
  d.hudRoot.__web.offline = false;
  d.advance(60000);
  assert.equal(d.state().event, "Typed offline");
  assert.ok(disk["hantu.observer_hud.v2/state"].includes("Typed offline"), "the session's setup is saved");
  disk["hantu.observer_hud.v2/state"] = record;
  // Every load takes 9 s (longer than the first reload gap): a later load still completes.
  const s = world({ disk });
  s.hudRoot.__web.loadDelay = 9000;
  s.bootHost();
  s.advance(40000);
  assert.equal(s.state().event, "Spring Cup", "a slow page loads the save");
  // Really offline: asked for a few minutes, then only when the editor opens again.
  const e = world({ disk, offline: true });
  e.bootHost();
  e.advance(300000);
  assert.equal(text(e.ui("OHSaveStatus")), "OFFLINE - SESSION ONLY");
  const asked = pageLoads(e);
  e.advance(120000);
  assert.equal(pageLoads(e), asked, "no requests after giving up");
  e.hudRoot.__web.offline = false;
  e.press("OHMenuButton");
  e.advance(20000);
  assert.ok(pageLoads(e) > asked, "opening the editor asks again");
  assert.equal(e.state().event, "Spring Cup");
  assert.equal(text(e.ui("OHSaveStatus")), "SAVED");
});

check("editor: credits rail (version, author link, donate) and HP Colors v3's supporter strip while open", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  const strip = w.ui("OHSupporterStrip");
  assert.equal(strip.type, "CitadelHTMLPanel");
  const loaded = [];
  strip.SetURL = (url) => { loaded.push(url); return true; };
  w.press("OHMenuButton");
  assert.ok(loaded.length === 1 && loaded[0].startsWith("https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip-v3/?v="), loaded[0]);
  assert.ok(strip.BHasClass("Open"), "the strip shows while the editor is open");
  assert.equal(text(w.ui("OHVersion")), "v0.3.2");
  assert.equal(text(w.ui("OHAuthorLabel")), "by hanturaya");
  w.press("OHAuthor");
  w.press("OHDonate");
  deq(w.urls, ["https://x.com/hanturaya", "https://ko-fi.com/hantuaraya"]);
  w.press("OHDone");
  assert.equal(loaded[loaded.length - 1], "about:blank", "closing unloads the page");
  assert.ok(!strip.BHasClass("Open"));
  w.press("OHMenuButton");
  assert.notEqual(loaded[loaded.length - 1], loaded[0], "each open asks for a fresh strip");
});

check("cues: each timer shows off, in a picked window before its spawn (default 30 s), or always; saved in the state", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  const map = w.hud.FindChildTraverse("hud_minimap");
  const timer = w.topBar.FindChildTraverse("RejuvenatorTimer");
  const label = w.topBar.FindChildTraverse("MidbossTimerLabel");
  w.topBar.FindChildTraverse("KothCashInMeter").visible = false;
  const KINDS = ["Bridge", "Urn", "Rift", "Mid"];
  const slots = () => [0, 1, 2, 3].map((i) => w.ui(`OHCue${i}`)).filter((p) => p.BHasClass("OHOn"));
  const on = () => slots().map((p) => KINDS.find((k) => p.BHasClass(`OHKind${k}`)));
  const chipText = (k) => text(slots().find((s) => s.BHasClass(`OHKind${k}`)).FindChildrenWithClassTraverse("OHCueTime")[0]);
  const at = (clock) => { w.clock(clock); w.advance(1000); };
  deq(w.state().cues, { bridge: 30, urn: 30, rift: -1, mid: 30 }, "defaults: 30 s before each spawn, the rift on");
  w.press("OHMenuButton");
  assert.ok(w.ui("OHCueBridge30").BHasClass("Selected") && w.ui("OHCueRiftAlways").BHasClass("Selected"));
  at("4:25");
  deq(on(), [], "35 s before the bridge buff: outside the default 30 s");
  at("4:31");
  deq(on(), ["Bridge"]);
  // Always: a countdown all game, UP while the buffs are on the map (no 30 s cap).
  w.press("OHCueBridgeAlways");
  w.press("OHCueUrnAlways");
  at("1:10");
  deq(on(), ["Bridge", "Urn"]);
  assert.equal(chipText("Bridge"), "3:50");
  assert.equal(chipText("Urn"), "8:50");
  const buff = new MockPanel("Panel", map, "");
  buff.classes = ["map_button", "powerup_spawn"];
  at("6:30");
  assert.equal(chipText("Bridge"), "UP", "still UP 90 s after the spawn while a buff is on the map");
  buff.DeleteAsync();
  at("6:31");
  assert.equal(chipText("Bridge"), "3:29");
  // A picked window: 2 min.
  w.press("OHCueBridge120");
  at("8:05");
  assert.equal(chipText("Bridge"), "1:55");
  at("7:55");
  assert.ok(!on().includes("Bridge"), "2:05 left: outside 2 min");
  // Off hides a timer; the rift has only OFF / ON (the game warns 20 s ahead).
  w.press("OHCueUrnOff");
  at("9:50");
  assert.ok(!on().includes("Urn"));
  const rift = new MockPanel("Panel", map, "");
  rift.classes = ["map_button", "capture_point", "koth_warning"];
  w.press("OHCueRiftOff");
  at("12:40");
  assert.ok(!on().includes("Rift"));
  w.press("OHCueRiftAlways");
  at("12:41");
  assert.ok(on().includes("Rift"));
  rift.DeleteAsync();
  // Mid-boss Always: UP while alive, the whole 7:00 respawn countdown after a kill.
  w.press("OHCueMidAlways");
  at("14:00");
  assert.equal(chipText("Mid"), "UP");
  timer.AddClass("midboss_cooldown");
  label.__text = "6:54";
  at("14:06");
  assert.equal(chipText("Mid"), "6:54");
  w.press("OHCueMid30");
  at("14:07");
  assert.ok(!on().includes("Mid"), "30 s window: a 6:54 respawn is hidden");
  // Saved in the state and normalized: bad values fall back to the default.
  deq(w.state().cues, { bridge: 120, urn: 0, rift: -1, mid: 30 });
  deq(stateApiOf().normalize({ cues: { bridge: 45, urn: -1, rift: 30, mid: "x" } }).cues, { bridge: 30, urn: -1, rift: -1, mid: 30 });
  // RESET TIMERS puts them back.
  w.press("OHNavTimers");
  w.press("OHResetPage");
  w.press("OHResetPage");
  deq(w.state().cues, { bridge: 30, urn: 30, rift: -1, mid: 30 });
});

check("editor: RESET <PAGE> clears exactly the settings on the page shown; RESET ALL clears everything", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  w.press("OHMenuButton");
  // One edit per page.
  w.type("OHStageEntry", "Semi Final");
  w.press("OHBo5");
  w.press("OHAmberSeriesUp");
  w.press("OHNavTeams");
  w.type("OHAmberNameEntry", "Edited");
  w.press("OHLogoSquare");
  w.press("OHNavPlayers");
  w.type("OHAmberPlayer0Entry", "Kes");
  w.press("OHDebuffToggle");
  w.press("OHNavTopBar");
  w.type("OHEventEntry", "Cup");
  w.press("OHLookDesk");
  w.press("OHNavDesk");
  w.type("OHInfoTitleEntry", "Prize");
  w.press("OHNavTimers");
  w.press("OHCueUrnOff");
  w.press("OHGraph60");
  // Design 19: the graph's controls sit on TIMERS (both looks), the status column's on PLAYERS.
  const pageOf = (id) => {
    for (let p = w.ui(id); p; p = p.GetParent()) {
      const page = ["OHPagePlayers", "OHPageDesk", "OHPageTimers"].find((cls) => p.BHasClass(cls));
      if (page) return page;
    }
    return null;
  };
  for (const id of ["OHGraphOff", "OHGraphEvery300", "OHGraphSizeUp", "OHGraphXUp", "OHGraphYUp"]) assert.equal(pageOf(id), "OHPageTimers", id);
  for (const id of ["OHDebuffToggle", "OHPollUp", "OHLogToggle"]) assert.equal(pageOf(id), "OHPagePlayers", id);
  assert.equal(pageOf("OHInfoTitleEntry"), "OHPageDesk");
  // PLAYERS: arms on the first press, the label names the page.
  w.press("OHNavPlayers");
  assert.equal(text(w.ui("OHResetPageLabel")), "RESET PLAYERS");
  w.press("OHResetPage");
  assert.equal(text(w.ui("OHResetPageLabel")), "CONFIRM RESET PLAYERS");
  assert.ok(Object.keys(w.state().pending).length === 1, "the first press only arms");
  w.press("OHResetPage");
  deq([w.state().pending, w.state().players, w.state().legacy, w.state().dev.debuffs], [{}, {}, {}, true], "aliases and the status column");
  assert.equal(w.state().event, "Cup", "other pages keep their values");
  // MATCH: stage, format, series wins and bans; the event title (TOP BAR) stays.
  w.press("OHNavMatch");
  w.press("OHResetPage");
  w.press("OHResetPage");
  deq([w.state().stage, w.state().bestOf, w.state().amber.series], ["Grand Final", 3, 0]);
  deq([w.state().event, w.state().amber.name, w.state().logo.shape], ["Cup", "Edited", "square"]);
  // TEAMS: names, tags, logo URLs and the team logo shape, size and gap.
  w.press("OHNavTeams");
  w.press("OHResetPage");
  w.press("OHResetPage");
  deq([w.state().amber.name, w.state().logo.shape], ["Night Owls", "circle"]);
  // NIGHT DESK: the info card; the graph (TIMERS) and the look (TOP BAR) stay.
  w.press("OHNavDesk");
  w.press("OHResetPage");
  w.press("OHResetPage");
  deq([w.state().info.title, w.state().graph.show, w.state().style], ["Prize pool", 60, "desk"]);
  // TIMERS: the objective timers and the soul lead graph.
  w.press("OHNavTimers");
  w.press("OHResetPage");
  w.press("OHResetPage");
  deq([w.state().cues.urn, w.state().graph.show], [30, 30]);
  // TOP BAR: the look, the organiser and the event title.
  w.press("OHNavTopBar");
  w.press("OHResetPage");
  w.press("OHResetPage");
  deq([w.state().style, w.state().event], ["names", "Community Cup Season 2"]);
  // SHARE has nothing to reset: its page button is hidden.
  w.press("OHNavShare");
  assert.ok(w.menu().BHasClass("OHNoPageReset"));
  w.press("OHNavMatch");
  assert.ok(!w.menu().BHasClass("OHNoPageReset"));
  // Arming one button never confirms the other.
  w.press("OHNavTopBar");
  w.type("OHEventEntry", "Cup");
  w.press("OHResetPage");
  w.press("OHReset");
  assert.equal(w.state().event, "Cup");
  assert.equal(text(w.ui("OHResetLabel")), "CONFIRM RESET ALL");
  assert.equal(text(w.ui("OHResetPageLabel")), "RESET TOP BAR");
});

check("cues: objective chips only while close; rejuvenator in the middle; minimap, stock timer and cards drive them", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  // This run uses a one-minute warning for the urn and the mid-boss (the default is 30 s).
  w.press("OHMenuButton");
  w.press("OHCueUrn60");
  w.press("OHCueMid60");
  w.press("OHDone");
  const map = w.hud.FindChildTraverse("hud_minimap");
  const marker = (cls) => { const m = new MockPanel("Panel", map, ""); m.classes = ["map_button"].concat(cls); return m; };
  const timer = w.topBar.FindChildTraverse("RejuvenatorTimer");
  const label = w.topBar.FindChildTraverse("MidbossTimerLabel");
  const koth = w.topBar.FindChildTraverse("KothCashInMeter");
  koth.visible = false;
  // Shown chips in slot order (the row is centred as a group), by kind.
  const KINDS = ["Bridge", "Urn", "Rift", "Mid"];
  const slots = () => [0, 1, 2, 3].map((i) => w.ui(`OHCue${i}`)).filter((p) => p.BHasClass("OHOn"));
  const on = () => slots().map((p) => KINDS.find((k) => p.BHasClass(`OHKind${k}`)));
  const chip = (k) => {
    const p = slots().find((s) => s.BHasClass(`OHKind${k}`));
    assert.ok(p, `chip ${k} shown`);
    return { text: text(p.FindChildrenWithClassTraverse("OHCueTime")[0]), cls: ["OHSoon", "OHLive", "OHHeldAmber", "OHHeldSapphire"].filter((c) => p.BHasClass(c)) };
  };
  const at = (clock) => { w.clock(clock); w.advance(1000); };
  at("3:10");
  deq(on(), [], "nothing close: nothing shown");
  at("4:35");
  deq(on(), ["Bridge"]);
  deq(chip("Bridge"), { text: "0:25", cls: [] });
  at("4:52");
  deq(chip("Bridge"), { text: "0:08", cls: ["OHSoon"] });
  const buffs = [marker(["powerup_spawn"]), marker(["powerup_spawn"])];
  at("5:01");
  deq(chip("Bridge"), { text: "UP", cls: ["OHLive"] }, "UP while the minimap shows a buff");
  for (const b of buffs) b.DeleteAsync();
  at("5:09");
  deq(on(), [], "both buffs taken: gone");
  // Urn: the last minute before 10:00, UP while it falls.
  at("9:05");
  deq(on(), ["Urn"]);
  deq(chip("Urn"), { text: "0:55", cls: [] });
  at("10:04");
  deq(chip("Urn"), { text: "UP", cls: ["OHLive"] });
  at("10:20");
  deq(on(), []);
  // Rift: nothing before its minimap warning, then an exact 20 s, LIVE while the capture meter shows.
  at("12:30");
  deq(on(), [], "no estimate before the warning");
  const rift = marker(["capture_point", "koth_warning"]);
  at("12:38");
  deq(chip("Rift"), { text: "0:20", cls: [] });
  at("12:49");
  deq(chip("Rift"), { text: "0:09", cls: ["OHSoon"] });
  rift.RemoveClass("koth_warning");
  koth.visible = true;
  at("12:58");
  // Base Game+ Names hides the rift chip while the stock rift HUD shows (design 17: same information);
  // Night Desk keeps LIVE.
  deq(on(), [], "Names: no rift chip under the rift HUD");
  assert.equal(w.state().style, "names");
  const look = (id) => { w.press("OHMenuButton"); w.press(id); w.press("OHDone"); };
  look("OHLookDesk");
  at("12:59");
  deq(chip("Rift"), { text: "LIVE", cls: ["OHLive"] });
  // User 2026-11-06 (Night Desk, live): LIVE stayed after "Rift faded away" and minutes later. An ended
  // rift keeps the stock meter visible (opacity 0 after its 5 s fade) with .captured, plus
  // .captured_neutral when time ran out (citadel_hud_koth.css 6860), until the next rift.
  koth.AddClass("captured");
  koth.AddClass("captured_neutral");
  at("13:05");
  deq(on(), [], "timed out: no LIVE though the faded meter is still visible");
  at("13:15");
  deq(on(), [], "and none later");
  koth.RemoveClass("captured");
  koth.RemoveClass("captured_neutral");
  at("13:17");
  deq(chip("Rift"), { text: "LIVE", cls: ["OHLive"] }, "the next rift opens: the meter loses its result classes");
  koth.AddClass("captured");
  at("13:19");
  deq(on(), [], "captured by a team: no LIVE");
  koth.RemoveClass("captured");
  look("OHLookNames");
  koth.visible = false;
  at("13:22");
  deq(on(), []);
  // Mid-boss: the stock timer's last minute; the rejuvenator for its 3:00 buff (holder's bar, yellow
  // text), then the stock respawn countdown until the mid-boss is back (user 2026-10-23).
  timer.AddClass("midboss_cooldown");
  label.__text = "6:54";
  at("20:20");
  deq(on(), [], "a 7:00 respawn is not close");
  timer.RemoveClass("midboss_cooldown");
  timer.AddClass("has_rejuv");
  for (const card of w.teams.TeamEnemy) card.AddClass("HasRejuvenator");
  at("20:21");
  deq(chip("Mid"), { text: "3:00", cls: ["OHHeldSapphire"] });
  at("21:51");
  deq(chip("Mid"), { text: "1:30", cls: ["OHHeldSapphire"] });
  // A pickup first seen after a jump forward (demo seek): the time left comes from the stock
  // rejuvenator circle's radial (#RejuvenatorTimer #StatusEffectsBorder), once two samples show which
  // way it runs (3:00 = 360 deg).
  const border = timer.FindChildTraverse("StatusEffectsBorder");
  timer.RemoveClass("has_rejuv");
  at("22:00");
  timer.AddClass("has_rejuv");
  border.style.clip = "radial(50% 50%, 0deg, -240deg)";
  at("22:40");
  deq(chip("Mid"), { text: "HELD", cls: ["OHHeldSapphire"] }, "one sample: direction unknown");
  border.style.clip = "radial(50% 50%, 0deg, -236deg)";
  at("22:42");
  deq(chip("Mid"), { text: "1:58", cls: ["OHHeldSapphire"] }, "236 of 360 deg left of 3:00");
  border.style.clip = "radial(50% 50%, 0deg, -230deg)";
  at("22:45");
  deq(chip("Mid"), { text: "1:55", cls: ["OHHeldSapphire"] }, "230 deg left");
  // The buff ends: the stock respawn countdown follows at once, whatever the mid-boss window.
  timer.RemoveClass("has_rejuv");
  for (const card of w.teams.TeamEnemy) card.RemoveClass("HasRejuvenator");
  timer.AddClass("midboss_cooldown");
  label.__text = "3:54";
  at("23:00");
  deq(chip("Mid"), { text: "3:54", cls: [] }, "respawn countdown right after the buff");
  label.__text = "0:45";
  at("26:09");
  deq(chip("Mid"), { text: "0:45", cls: [] });
  label.__text = "0:02";
  at("26:52");
  timer.RemoveClass("midboss_cooldown");
  label.__text = "";
  at("26:55");
  deq(chip("Mid"), { text: "UP", cls: ["OHLive"] }, "UP after the respawn");
  at("27:30");
  deq(on(), []);
  // Without a rejuvenator first, a long respawn still waits for the window.
  timer.AddClass("midboss_cooldown");
  label.__text = "5:00";
  at("28:00");
  deq(on(), [], "a respawn not after a buff waits for the window");
  timer.RemoveClass("midboss_cooldown");
  label.__text = "";
  at("28:10");
  // Order: the mid-boss chip goes in the middle of whatever shows (bridge, urn, rift otherwise).
  timer.AddClass("midboss_cooldown");
  label.__text = "0:40";
  buffs.splice(0, 2, marker(["powerup_spawn"]), marker(["powerup_spawn"]));
  at("30:02");
  deq(on(), ["Bridge", "Mid", "Urn"], "three chips: mid-boss in the middle");
  const warn = marker(["capture_point", "koth_warning"]);
  at("30:05");
  deq(on(), ["Bridge", "Mid", "Urn", "Rift"], "four chips");
  warn.DeleteAsync();
  timer.RemoveClass("midboss_cooldown");
  label.__text = "";
  // A rejuvenator already held when watching starts has no known pickup time.
  const late = world();
  late.topBar.FindChildTraverse("RejuvenatorTimer").AddClass("has_rejuv");
  for (const card of late.teams.TeamFriendly) card.AddClass("HasRejuvenator");
  late.clock("21:00");
  late.bootHost();
  late.advance(2000);
  const lateChip = late.ui("OHCue0");
  assert.ok(lateChip.BHasClass("OHKindMid") && lateChip.BHasClass("OHHeldAmber"));
  assert.equal(text(late.ui("OHCue0Time")), "HELD");
  // The stock rejuvenator charges (each team's count) are left alone. The clock stack keeps its mockup
  // spot (clock bottom 34 + 52, Base Game+ Names rev 2: no stage box) under the empty charges box (user 2026-10-23), drops below it while a
  // team's rejuvenator icons show there, and below the stock kills row while the scoreboard shows it.
  const charges = w.topBar.FindChildTraverse("RejuvenatorCharges");
  assert.ok(!charges.style.visibility, "stock charges (team counts) untouched");
  assert.equal(timer.style.opacity, "0", "the stock progress circle gives way to the mid-boss chip (opacity: a cleared collapse stays hidden)");
  Object.assign(charges, { actualxoffset: 860, actualyoffset: 40, actualuiscale_x: 1, actuallayoutwidth: 200, actuallayoutheight: 130 });
  const stackTop = () => w.ui("OHClock").style.marginTop;
  at("27:40");
  assert.equal(stackTop(), `${34 + 52}px`, "no icons: the mockup spot over the empty charges box");
  const enemy = w.topBar.FindChildTraverse("RejuvenatorEnemy");
  enemy.AddClass("RejuvCount_2");
  at("27:41");
  assert.equal(stackTop(), `${34 + 52}px`, "icon classes only count while a rejuvenator is held");
  timer.AddClass("has_rejuv");
  at("27:42");
  assert.equal(stackTop(), `${40 + 130 + 2}px`, "under the charges while a team's rejuvenator icons show");
  enemy.RemoveClass("RejuvCount_2");
  timer.RemoveClass("has_rejuv");
  // The scoreboard's kills row (stock: shown under .wants_scoreboard) gets room from #OHScoreSpace, which
  // the same classes show in oh_bar.css; the host only sizes it: from the stack's spot (86) to 2 px under
  // the row. Closed: the stock geometry (margin-top 80 + a 46 px row under the top bar's top) = 126 + 2.
  const space = () => w.ui("OHScoreSpace").style.height;
  const scores = w.topBar.FindChildrenWithClassTraverse("KillsAndAbilityPointsContainer")[0];
  Object.assign(scores, { visible: false, actualxoffset: 860, actualyoffset: 90, actualuiscale_x: 1, actuallayoutwidth: 200, actuallayoutheight: 46 });
  at("27:44");
  deq([stackTop(), space()], [`${34 + 52}px`, `${126 + 2 - 86}px`], "the stack stays; the spacer waits at the stock size");
  scores.visible = true;
  at("27:46");
  deq([stackTop(), space()], [`${34 + 52}px`, `${90 + 46 + 2 - 86}px`], "shown: measured from the row");
  // The scoreboard collapses the stock charges: their icons no longer push the stack.
  enemy.AddClass("RejuvCount_1");
  timer.AddClass("has_rejuv");
  charges.visible = false;
  at("27:48");
  assert.equal(stackTop(), `${34 + 52}px`, "collapsed charges do not count");
  enemy.RemoveClass("RejuvCount_1");
  timer.RemoveClass("has_rejuv");
  charges.visible = true;
  scores.visible = false;
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.RemoveClass(cls);
  w.advance(1100);
  assert.ok(timer.style.opacity === "1" && !timer.style.visibility, "the stock circle is back outside spectating (opacity 1, never null)");
});

check("bans: Base Game+ Names spreads the stock teams just enough that the clock bans clear the innermost cards", () => {
  // Live 2026-10-23 (1600x900): 32 px clock bans covered the innermost portraits. The mock: Amber's cards
  // end at 858, the clock label starts at 920 (62 px); Sapphire's start 62 px right of its end at 1000.
  const w = world();
  const teams = w.topBar.FindChildTraverse("TeamsContainer");
  Object.assign(teams, { actuallayoutwidth: 1260, actualuiscale_x: 1 });
  w.bootHost();
  w.advance(2000);
  w.press("OHMenuButton");
  const ban = (slot, name) => {
    w.press(slot);
    w.ui(`OHHero${HEROES.find(([, hero]) => hero === name)[0]}`).events.onactivate();
  };
  ban("OHAmberBan0", "Haze");
  w.advance(1100);
  assert.equal(teams.style.width || "", "", "one ban (5 + 6 + 36 + 4 = 51 px) fits the 62 px gap: no spread");
  ban("OHAmberBan1", "Abrams");
  w.advance(1100);
  assert.equal(teams.style.width, `${1260 + 2 * 25}px`, "two bans need 87 px: 25 px more a side");
  assert.equal(w.ui("OHBansLeft").style.marginLeft, `${920 - 11 - 72}px`, "the bans stay at the clock");
  // The mock's cards do not move with the width: the stock gaps were measured unspread, so no feedback.
  w.advance(5000);
  assert.equal(teams.style.width, `${1260 + 2 * 25}px`, "steady");
  // The tighter side decides: Sapphire's 62 px gap with two bans needs the same 25 px.
  ban("OHSapphireBan0", "Bebop");
  ban("OHSapphireBan1", "Dynamo");
  w.advance(1100);
  assert.equal(teams.style.width, `${1260 + 2 * 25}px`);
  // The teams swap sides while spread (spectating the other team): the stock gaps are measured again
  // unspread for the new sides (one tick at stock width), not reused from the old ones.
  w.geometry({ friendX: 1062, enemyX: 330 });
  w.advance(3300);
  assert.equal(teams.style.width, `${1260 + 2 * 25}px`, "after a side swap: the same 25 px, from fresh gaps");
  w.geometry({ friendX: 330, enemyX: 1062 });
  w.advance(3300);
  assert.equal(teams.style.width, `${1260 + 2 * 25}px`, "and back");
  // Night Desk hides the clock bans: no ban spread (its own spread starts past 30 px logos).
  w.press("OHLookDesk");
  w.advance(1100);
  assert.equal(teams.style.width || "", "", "Night Desk: no ban spread");
  w.press("OHLookNames");
  w.advance(1100);
  assert.equal(teams.style.width, `${1260 + 2 * 25}px`, "back in Base Game+ Names");
  // Bans cleared: the teams return to their stock width.
  w.press("OHNavMatch");
  w.press("OHResetPage");
  w.press("OHResetPage");
  w.advance(1100);
  deq([w.state().amber.bans, w.state().sapphire.bans], [[0, 0, 0], [0, 0, 0]]);
  assert.equal(teams.style.width || "", "", "no bans: stock width");
});

check("logo: Night Desk team logo shape, size and gap; past 30 px the stock teams spread outward (design 16)", () => {
  const w = world();
  const teams = w.topBar.FindChildTraverse("TeamsContainer");
  Object.assign(teams, { actuallayoutwidth: 1260, actualuiscale_x: 1 });
  w.bootHost();
  w.advance(2000);
  w.press("OHMenuButton");
  w.press("OHLookDesk");
  w.advance(1100);
  const st = (id, key) => w.ui(id).style[key] || "";
  // Defaults = design 15 as built: 30 px circle, 17 px tab half, nothing spread.
  deq([text(w.ui("OHLogoSizeValue")), text(w.ui("OHLogoGapValue"))], ["30 px", "12 px"]);
  assert.ok(w.ui("OHLogoCircle").BHasClass("OHSelected"));
  deq([st("OHArch", "width"), st("OHArchCurveLeft", "borderRadius"), st("OHDeskLogoLeft", "width"), st("OHDeskLogoRight", "marginLeft"), st("OHPlateEdgeLeft", "marginTop")],
    ["226px", "50%", "30px", "194px", "35px"]);
  assert.equal((teams.style.width || ""), "", "no spread at 30 px");
  // The organiser keeps the room between the tabs: 192 - 2 x 17 - 2 x 2.
  deq([st("OHOrgName", "maxWidth"), st("OHOrgName", "fontSize"), st("OHMid", "width")], ["154px", "15px", "192px"]);
  // Square, 50 px (the limit), gap 20: tab half 27, square tabs, logos 2 px in from the tab edge. The
  // plate widens 10 px a side (212 px from 960 - 106 = 854; live: a 44 px logo covered the organiser on
  // the 192 px plate) and the teams spread 30 px a side, so the innermost names clear the tabs (live: they
  // were covered when the plate took the whole spread).
  w.press("OHLogoSquare");
  for (let i = 0; i < 20; i++) w.press("OHLogoSizeUp");
  for (let i = 0; i < 4; i++) w.press("OHLogoGapUp");
  w.advance(1100);
  deq([text(w.ui("OHLogoSizeValue")), text(w.ui("OHLogoGapValue")), w.state().logo.shape], ["50 px", "20 px", "square"], "size stops at 50");
  deq([st("OHArch", "width"), st("OHArch", "marginLeft"), st("OHArchCurveLeft", "borderRadius"), st("OHArchCurveRight", "marginLeft"),
    st("OHArchRight", "marginLeft"), st("OHPlateEdgeLeft", "marginTop"), st("OHPlateEdgeLeft", "height")],
    [`${212 + 54}px`, `${854 - 27}px`, "4px", "-26px", `${212 + 26}px`, "55px", "1px"]);
  deq([st("OHDeskLogoLeft", "width"), st("OHDeskLogoLeft", "borderRadius"), st("OHDeskLogoLeft", "marginLeft"), st("OHDeskLogoRight", "marginLeft"), st("OHDeskMonoLeft", "fontSize")],
    ["50px", "3px", "2px", `${212 + 27 - 25}px`, "15px"]);
  deq([st("OHMid", "width"), st("OHMid", "marginLeft"), st("OHOrgName", "maxWidth")], ["212px", "854px", "154px"], "the organiser keeps 154 px");
  // The name ends 20 px from the tab: 854 - 27 - 20 = 807 (the mock's team rectangles stay put: end 858).
  assert.equal((teams.style.width || ""), `${1260 + 60}px`);
  assert.equal(st("OHDeskNameLeft", "marginRight"), `${858 - 807}px`);
  assert.equal(st("OHDeskNameRight", "marginLeft"), `${854 + 212 + 27 + 20 - 1062}px`);
  // A long organiser name steps down 15, 13, 11 px while wider than its room, then the ellipsis.
  const org = w.ui("OHOrgName");
  org.actuallayoutwidth = 240;
  org.actualuiscale_x = 1;
  w.advance(1100);
  assert.equal(org.style.fontSize, "13px");
  w.advance(1100);
  assert.equal(org.style.fontSize, "11px");
  w.advance(1100);
  assert.equal(org.style.fontSize, "11px", "11 px is the floor");
  // A team image takes the logo's shape inside the ring.
  w.type("OHAmberLogoEntry", "https://cdn.example.org/owls.png", { submit: true });
  w.advance(1100);
  const image = w.ui("OHDeskLogoLeft").Children().find((child) => child.paneltype === "Image");
  deq([image.style.width, image.style.height, image.style.borderRadius, image.attributes.scaling], ["48px", "48px", "2px", "stretch-to-cover-preserve-aspect"]);
  // Shares and saves carry the fields; bad values fall back field by field.
  deq(Object.assign({}, stateApiOf().normalize({ logo: { shape: "hex", size: 51, gap: 48 } }).logo), { shape: "circle", size: 30, gap: 48 });
  // Base Game+ Names and leaving spectating give the stock teams their width back.
  w.press("OHLookNames");
  w.advance(1100);
  assert.equal((teams.style.width || ""), "", "Base Game+ Names: no spread");
  // Base Game+ Names: the tab keeps the stylesheet's width; the organiser fits between the score digits
  // (196 - 2 x 22 - 4); the mock's 240 px text steps down again from 15 px in the new room.
  deq([st("OHMid", "width"), st("OHOrgName", "maxWidth"), st("OHOrgName", "fontSize")], ["", "148px", "13px"], "Base Game+ Names: room between the digits");
  w.press("OHLookDesk");
  w.advance(1100);
  assert.equal((teams.style.width || ""), `${1260 + 60}px`);
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.RemoveClass(cls);
  w.advance(1100);
  assert.equal((teams.style.width || ""), "", "stock width outside spectating");
});

check("names: the plate follows the team logo shape (curve or step) and size (logo + 13 px high, both ways over 24-50 px), joins and digits carry the team colour (design 17)", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  const st = (id, key) => w.ui(id).style[key] || "";
  // Circle (default): round 30 px logo, the plate 43 px (the default) with its inner bottom corner curved
  // by the 17 px it hangs below the 26 px strip; the joins and digits in their team colour.
  deq([st("OHLogoLeft", "width"), st("OHLogoLeft", "borderRadius"), st("OHMonoLeft", "fontSize")], ["30px", "50%", "10px"]);
  deq([st("OHTeamLeft", "height"), st("OHPlateLeft", "borderRadius"), st("OHPlateRight", "borderRadius")], ["43px", "0px 0px 17px 0px", "0px 0px 0px 17px"]);
  // The plate follows the logo both ways (user 2026-10-23): 32 px gives 45 px (curve 19), 26 px gives 39 px (curve 13).
  w.press("OHMenuButton");
  w.press("OHLogoSizeUp");
  w.press("OHDone");
  w.advance(1100);
  deq([st("OHLogoLeft", "width"), st("OHTeamLeft", "height"), st("OHPlateLeft", "borderRadius")], ["32px", "45px", "0px 0px 19px 0px"]);
  w.press("OHMenuButton");
  for (let i = 0; i < 3; i++) w.press("OHLogoSizeDown");
  w.press("OHDone");
  w.advance(1100);
  deq([st("OHLogoLeft", "width"), st("OHTeamLeft", "height"), st("OHPlateLeft", "borderRadius")], ["26px", "39px", "0px 0px 13px 0px"]);
  w.press("OHMenuButton");
  w.press("OHLogoSizeUp");
  w.press("OHLogoSizeUp");
  w.press("OHDone");
  w.advance(1100);
  assert.ok(w.ui("OHJoinLeft").BHasClass("OHAmber") && w.ui("OHJoinRight").BHasClass("OHSapphire"));
  assert.ok(w.ui("OHScoreLeft").BHasClass("OHAmber") && w.ui("OHScoreRight").BHasClass("OHSapphire"));
  // The digits sit inside the centre tab at its ends (not overlays placed beside it: live, they drifted).
  const mid = w.ui("OHMid").Children().map((child) => child.id);
  deq([mid[0], mid[mid.length - 1]], ["OHScoreLeft", "OHScoreRight"], JSON.stringify(mid));
  assert.equal(w.ui("OHScoreLeft").style.ignoreParentFlow, "true");
  // Square at the largest size: the step returns; the 50 px logo makes a 63 px plate.
  w.press("OHMenuButton");
  w.press("OHLogoSquare");
  for (let i = 0; i < 10; i++) w.press("OHLogoSizeUp");
  w.press("OHDone");
  w.advance(1100);
  assert.equal(w.state().logo.size, 50);
  deq([st("OHLogoLeft", "width"), st("OHLogoLeft", "height"), st("OHLogoLeft", "borderRadius"), st("OHMonoLeft", "fontSize")], ["50px", "50px", "3px", "17px"]);
  deq([st("OHTeamLeft", "height"), st("OHPlateLeft", "borderRadius")], ["63px", "0px 0px 0px 0px"], "largest logo: 63 px plate; square: the step");
  // A team image fills the square (cover) with the same corners.
  w.press("OHMenuButton");
  w.type("OHAmberLogoEntry", "https://cdn.example.org/owls.png", { submit: true });
  w.press("OHDone");
  w.advance(1100);
  const image = w.ui("OHLogoLeft").Children().find((child) => child.paneltype === "Image");
  deq([image.attributes.scaling, image.style.borderRadius], ["stretch-to-cover-preserve-aspect", "3px"]);
  // Swapped sides: the joins and digits follow the teams.
  w.geometry({ friendX: 1062, enemyX: 330 });
  w.advance(1100);
  assert.ok(w.ui("OHJoinLeft").BHasClass("OHSapphire") && w.ui("OHScoreRight").BHasClass("OHAmber"));
});

check("pause: while spectating the stock pause box is DLF's minimal 80 px box with II; the stock text returns afterwards", () => {
  const w = world();
  const info = w.hud.FindChildTraverse("PausedInfo");
  loadInto(info, STOCK.paused);
  const qollock = new MockPanel("Label", info.FindChildTraverse("PausedLabel").GetParent(), "QLPausedText");
  w.bootHost();
  w.advance(2000);
  const box = info.FindChildTraverse("PausedContainer");
  const icon = info.FindChildTraverse("OHPauseIcon");
  assert.ok(icon, "II label added next to the stock text");
  assert.equal(text(icon), "II");
  assert.ok(icon.GetParent() === info.FindChildTraverse("PausedContainer") && icon.style.ignoreParentFlow === "true",
    "II is the box's own child, out of the stock text container (live 2026-10-23: it vanished on the second pause)");
  const css = (...values) => values.map((v) => v || "");
  deq(css(box.style.width, box.style.height, icon.style.fontSize, icon.style.visibility), ["80px", "80px", "58px", "visible"], "minimal box");
  // The stock text fades out (opacity): live 2026-10-23 a collapsed panel stayed hidden after its inline
  // visibility was cleared, so a collapse could never hand the stock text back.
  for (const id of ["PausedLabel", "PauserLabel", "UnpauseButtonLabel"]) assert.equal(info.FindChildTraverse(id).style.opacity, "0", id);
  assert.equal(qollock.style.opacity, "0", "QOLLOCK's pause text too");
  // The countdown number sits where II does (stock: 175 px left, 180 px tall; live 2026-10-23 off centre).
  const count = info.FindChildTraverse("PausedCountdownLabel");
  deq(css(count.style.marginRight, count.style.marginBottom, count.style.verticalAlign, count.style.marginTop, count.style.fontSize),
    ["0px", "0px", "top", "4px", "58px"], "the countdown number sits where II does");
  // The engine (live [OH-PAUSE] log 2026-10-23): paused = #PausedCountdownLabel.Hidden; each countdown second
  // removes Hidden and sets the number; the next pause adds Hidden back, while gameIsPausedCountdown and
  // .PausedTextMoved come and go. II shows exactly while the number is hidden, written as explicit
  // visible / collapse: clearing an inline collapse (null) left II hidden on the second pause (live).
  const game = info.FindChildTraverse("PausedGameContainer");
  game.RemoveClass("Hidden");
  count.AddClass("Hidden");
  w.advance(1100);
  assert.equal(icon.style.visibility, "visible", "first pause: II");
  for (const n of ["3", "2", "1"]) {
    count.RemoveClass("Hidden");
    count.text = n;
    w.advance(150);
    assert.equal(icon.style.visibility, "collapse", `countdown ${n}: the number`);
    w.advance(850);
  }
  assert.ok(!count.style.visibility, "the stock number keeps its own visibility");
  game.AddClass("Hidden");
  w.advance(3000);
  game.RemoveClass("Hidden");
  count.AddClass("Hidden");
  info.AddClass("gameIsPaused");
  w.advance(1100);
  assert.equal(icon.style.visibility, "visible", "second pause: II");
  count.RemoveClass("Hidden");
  count.text = "3";
  w.advance(150);
  assert.equal(icon.style.visibility, "collapse", "second countdown");
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.RemoveClass(cls);
  w.advance(1100);
  deq(css(box.style.width, box.style.height, icon.style.visibility), ["", "", "collapse"], "stock box outside spectating");
  deq(css(count.style.marginRight, count.style.marginBottom, count.style.fontSize), ["", "", ""], "stock countdown outside spectating");
  for (const id of ["PausedLabel", "PauserLabel", "UnpauseButtonLabel"]) assert.equal(info.FindChildTraverse(id).style.opacity, "1", id);
  // A HUD without the stock pause layout (another mod's) is left alone.
  const bare = world();
  bare.bootHost();
  bare.advance(2000);
  assert.ok(!bare.hud.FindChildTraverse("OHPauseIcon"));
});

// ---------------------------------------------------------------- aliases and editor

check("aliases: rows list the stock cards' names; an alias replaces the stock name; a shared name keeps it", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  w.press("OHMenuButton");
  assert.equal(text(w.ui("OHAmberPlayer0Game")), "Kestrel");
  assert.ok(w.ui("OHSapphirePlayer5Row").BHasClass("OHShown"));
  w.type("OHAmberPlayer0Entry", "Kes");
  assert.equal(w.who("Kestrel"), "Kes");
  assert.equal(w.card("Kestrel").FindChildTraverse("OHAliasHost"), null, "nothing is added to the portrait any more");
  // Two players share a name: both show the stock name.
  const rename = (to) => { for (const label of w.card("Moth").FindChildrenWithClassTraverse("PlayerName").concat(w.card("Moth").FindChildrenWithClassTraverse("AlwaysPlayerName"))) label.__text = to; };
  rename("Kestrel");
  w.advance(1100);
  assert.equal(w.who("Kestrel"), "Kestrel");
  rename("Moth");
  w.advance(1100);
  assert.equal(w.who("Kestrel"), "Kes");
  w.type("OHAmberPlayer0Entry", "");
  assert.equal(w.who("Kestrel"), "Kestrel", "clearing the alias shows the stock name again");
  deq(w.state().pending, {});
  // A focused entry is never overwritten by a render.
  const entry = w.ui("OHEventEntry");
  entry.keyFocus = true;
  entry.text = "typing";
  w.press("OHBo7");
  assert.equal(entry.text, "typing");
});

// ---------------------------------------------------------------- identity: accounts and aliases v2
// Plan phase 3 (decisions/postgame-identity-perf-plan.md decisions 2-3). Live facts (client 6819, demo
// 121685912, 2026-10-25): a far-away marker's CitadelUserName#PlayerName.accountid is 0 until the marker is
// first set, then the player's Steam account (11 of 12 after a minute; the followed player and a bot stay 0;
// 13 entries exist); the side class team_1 is Amber, team_2 Sapphire; the label shows the Steam persona,
// which is often not the card's in-game name. The hovered top-bar card fires CitadelTopDownScoreboardPlayerHovered
// with no account, so no hover path exists (ENGINE.md); the passive path is all there is.
// How it could fail: an account joins the wrong card (a guess between two); a duplicate name is aliased;
// a bot (account 0) is keyed by 0; a persona that matches no card gets no alias although elimination
// settles it; an alias typed for an unresolved card binds to whoever is in that seat on the next map;
// a v1 alias is lost, or re-keyed behind the user's back; accounts of the last map leak into the next;
// the scan polls past the point where nothing new can come, or each entry is read again once known.
check("identity: marker accounts join the cards by name, then by elimination within a side; the persona may match no card", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  // Amber: five personas equal the card names, one is a Steam nickname. Sapphire: two nicknames, two cards.
  const m = markAll(w, { Ironclad: { shown: "ironclad on steam" }, Geist: { shown: "xX_g_Xx" }, Talon: { shown: "tal0n" } });
  w.advance(1100);
  const host = w.host();
  assert.equal(host.accountOf("Kestrel"), String(ACCOUNT_OF("Kestrel")), "by name");
  assert.equal(host.accountOf("Volt"), String(ACCOUNT_OF("Volt")), "by name, Sapphire");
  assert.equal(host.accountOf("Ironclad"), String(ACCOUNT_OF("Ironclad")), "elimination: the one Amber card and the one Amber account left");
  assert.ok(w.harness.logs.includes("[OH] accounts: 12 read from markers, 10 of 12 cards joined"), "the join is logged as counts only");
  assert.ok(!w.harness.logs.some((line) => line.includes(String(ACCOUNT_OF("Kestrel")))), "an account id is never logged");
  assert.equal(host.accountOf("Geist"), "", "two cards and two accounts left on Sapphire: no guess");
  assert.equal(host.accountOf("Talon"), "");
  // An alias for the elimination card is keyed by its account and shows on the nickname marker and the band.
  w.press("OHMenuButton");
  w.type("OHAmberPlayer5Entry", "Iron");
  deq(w.state().players[ACCOUNT_OF("Ironclad")], { a: "Iron", n: "Ironclad" });
  deq(w.state().pending, {});
  w.advance(1100);
  assert.equal(w.markerName(m.Ironclad).text, "Iron", "the nickname marker shows the alias through its account");
  assert.equal(w.who("Ironclad"), "Iron");
  // An unresolved card keeps a session alias by name.
  w.type("OHSapphirePlayer3Entry", "Tal");
  deq(w.state().pending, { Talon: "Tal" });
  assert.equal(w.who("Talon"), "Tal");
  assert.equal(w.markerName(m.Talon).text, "tal0n", "a nickname marker with no account is not matched by name");
  // A Steam nickname must not take another card's alias: its account decides, not its label.
  w.type("OHAmberPlayer0Entry", "Kes");
  w.markerName(m.Geist).__text = "Kestrel";
  w.advance(1100);
  assert.equal(w.markerName(m.Geist).text, "Kestrel", "no account join for Geist: its label 'Kestrel' is not an alias for the Amber card");
});

check("identity: duplicate names get no alias and no account; a bot (account 0) keeps a session alias by name", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  const m = markAll(w, { Moth: { shown: "Kestrel" }, Doyle: { account: 0 } });
  const rename = (name, to) => { for (const label of w.card(name).FindChildrenWithClassTraverse("PlayerName").concat(w.card(name).FindChildrenWithClassTraverse("AlwaysPlayerName"))) label.__text = to; };
  rename("Moth", "Kestrel");
  w.advance(1100);
  const host = w.host();
  assert.equal(host.accountOf("Kestrel"), "", "two cards named Kestrel: no account for the name");
  assert.equal(host.accountOf("Doyle"), "", "a bot has no account to join");
  w.press("OHMenuButton");
  w.type("OHAmberPlayer0Entry", "Kes");
  deq(w.state().pending, { Kestrel: "Kes" });
  w.advance(1100);
  assert.equal(w.who("Kestrel"), "Kestrel", "a shared name shows the stock name on both");
  assert.equal(w.markerName(m.Kestrel).text, "Kestrel");
  assert.equal(w.markerName(m.Moth).text, "Kestrel");
  w.type("OHAmberPlayer1Entry", "Doy"); // the roster lists a shared name once: Kestrel, Doyle, .
  deq(w.state().pending, { Kestrel: "Kes", Doyle: "Doy" });
  deq(w.state().players, {}, "nothing is keyed by account 0 or by an ambiguous name");
  w.advance(1100);
  assert.equal(w.who("Doyle"), "Doy");
  assert.equal(w.markerName(m.Doyle).text, "Doy", "the bot's marker takes the session alias by name");
  // Once the duplicate is gone the alias shows again; it was never keyed to an account.
  rename("Moth", "Moth");
  w.advance(1100);
  assert.equal(w.who("Kestrel"), "Kes");
});

check("identity: a pending alias binds to its account only within the map load it was typed in", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  w.press("OHMenuButton");
  w.type("OHAmberPlayer0Entry", "Kes"); // before any marker has an account
  deq(w.state().pending, { Kestrel: "Kes" });
  assert.equal(w.who("Kestrel"), "Kes", "it shows at once, by name");
  const first = markAll(w);
  w.advance(1100);
  deq(w.state().players[ACCOUNT_OF("Kestrel")], { a: "Kes", n: "Kestrel" }, "the account arrived on the same map: bound");
  deq(w.state().pending, {});
  assert.equal(w.who("Kestrel"), "Kes");
  // Next map: a new #TopBar and new markers; the seat's player may be someone else now.
  w.type("OHAmberPlayer1Entry", "Mo");
  deq(w.state().players[ACCOUNT_OF("Moth")], { a: "Mo", n: "Moth" });
  w.type("OHSapphirePlayer0Entry", "Vee");
  deq(w.state().players[ACCOUNT_OF("Volt")], { a: "Vee", n: "Volt" });
  for (const entry of Object.values(first)) entry.DeleteAsync();
  w.bar().DeleteAsync();
  w.advance(1100);
  // Map 2: nobody has an account yet. An alias typed now is pending, and a later account binds it (same map).
  w.type("OHAmberPlayer3Entry", "Fro");
  deq(w.state().pending, { Frostbyte: "Fro" });
  // Another map starts before any account was learned: the pending alias must not bind in map 3.
  w.bar().DeleteAsync();
  w.advance(1100);
  const second = markAll(w, { Frostbyte: { account: 777001 }, Kestrel: { account: 777002 } });
  w.advance(1100);
  assert.equal(w.host().accountOf("Frostbyte"), "777001");
  deq(w.state().pending, { Frostbyte: "Fro" }, "typed on another map load: still session-only, by name");
  assert.ok(!w.state().players["777001"], "never bound to the new map's account");
  assert.equal(w.who("Frostbyte"), "Fro", "it still shows by name for this session");
  // The accounts of map 1 do not carry over: Kestrel's old account alias does not apply to the new account.
  assert.equal(w.who("Kestrel"), "Kestrel", "account 777002 has no alias");
  assert.ok(w.state().players[ACCOUNT_OF("Kestrel")], "the alias is still stored for the old account");
  for (const entry of Object.values(second)) entry.DeleteAsync();
});

check("identity: v1 name aliases move to legacy, still apply by name, and bind to an account with one click", () => {
  const S = stateApiOf();
  const record = JSON.stringify({ s: 1, state: { aliases: { Kestrel: "Kes", Moth: "Mo" } } });
  const disk = { "hantu.observer_hud.v1/state": `OHS1.${S.checksum(record)}.${record}` };
  const w = world({ disk });
  w.bootHost();
  w.advance(3000);
  deq(w.state().legacy, { Kestrel: "Kes", Moth: "Mo" });
  deq([w.state().players, w.state().pending], [{}, {}]);
  assert.equal(w.who("Kestrel"), "Kes", "a v1 alias keeps working by name");
  w.press("OHMenuButton");
  const chip = (side, slot) => w.ui(`OH${side}Player${slot}Bind`);
  assert.ok(!chip("Amber", 0).BHasClass("OHShown"), "no chip while the card's account is unknown");
  markAll(w, { Moth: { shown: "mothy" } });
  w.advance(1100);
  assert.ok(chip("Amber", 0).BHasClass("OHShown"), "a chip once the account is known");
  assert.ok(chip("Amber", 1).BHasClass("OHShown"), "Moth too (the persona label does not matter)");
  assert.ok(!chip("Amber", 2).BHasClass("OHShown"), "no chip for a card without a v1 alias");
  deq(w.state().players, {}, "nothing is re-keyed silently");
  w.press(`OHAmberPlayer0Bind`);
  deq(w.state().players[ACCOUNT_OF("Kestrel")], { a: "Kes", n: "Kestrel" });
  deq(w.state().legacy, { Moth: "Mo" });
  assert.ok(!chip("Amber", 0).BHasClass("OHShown"));
  assert.equal(w.who("Kestrel"), "Kes");
  // The save holds the v2 shape (phase 4 moves it to its own v2 key, so a released v1 pak keeps its record).
  w.advance(3000);
  const saved = disk["hantu.observer_hud.v2/state"];
  assert.ok(!/"aliases"/.test(saved) && saved.includes('"players"') && saved.includes('"legacy"'), "v2 shape on disk");
  assert.ok(!saved.includes('"pending"'), "session aliases are never saved");
  // Clearing the box of a legacy-shown alias removes it.
  w.type("OHAmberPlayer1Entry", "");
  deq(w.state().legacy, {});
});

check("identity: state normalizes players, legacy and pending; a share code carries players and legacy, never pending", () => {
  const S = stateApiOf();
  const many = {};
  for (let i = 1; i <= 30; i++) many[String(1000 + i)] = { a: `a${i}`, n: `n${i}` };
  const s = S.normalize({ players: Object.assign({ "0": { a: "bot" }, abc: { a: "x" }, "99999999999": { a: "x" }, "42": { a: "y".repeat(25) }, "43": { a: "ok", n: "n".repeat(33) }, "07": { a: "lead" } }, many),
    legacy: { Kestrel: "Kes", "": "x" }, aliases: { Moth: "Mo" }, pending: { Doyle: "Doy", Volt: "z".repeat(25) } });
  assert.equal(Object.keys(s.players).length, 24, "at most 24 players");
  assert.ok(!("0" in s.players) && !("abc" in s.players) && !("99999999999" in s.players) && !("07" in s.players) && !("42" in s.players), "bad accounts and long aliases are rejected");
  const t = S.normalize({ players: { "43": { a: "ok", n: "n".repeat(33) }, "44": { a: "fine" }, "4294967295": { a: "max", n: "N" }, "4294967296": { a: "over" } } });
  deq(t.players, { "43": { a: "ok", n: "" }, "44": { a: "fine", n: "" }, "4294967295": { a: "max", n: "N" } }, "a last-seen name that is too long is dropped, the alias stays");
  deq(s.legacy, { Kestrel: "Kes", Moth: "Mo" }, "legacy takes the v2 key and the v1 aliases key");
  deq(s.pending, { Doyle: "Doy" });
  const code = S.encodeShare(S.normalize({ players: { "123": { a: "A", n: "N" } }, legacy: { Moth: "Mo" }, pending: { Doyle: "Doy" } }));
  const back = S.normalize(S.decodeShare(code).state);
  deq([back.players, back.legacy, back.pending], [{ "123": { a: "A", n: "N" } }, { Moth: "Mo" }, {}]);
  // A v1 share code (aliases by name) still imports.
  const v1 = JSON.stringify({ s: 1, state: { aliases: { Kestrel: "Kes" } } });
  const v1code = "OHC1." + S.checksum(v1) + "." + Buffer.from(v1).toString("base64url");
  deq(S.normalize(S.decodeShare(v1code).state).legacy, { Kestrel: "Kes" });
});

check("identity: map changes forget the old accounts; the scan stops once 11 of 12 are known and reads each entry once", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  // 6 of 12 markers have an account (live: 6 at the first look, 11 about a minute later).
  const entries = [...AMBER, ...SAPPHIRE].map((p, i) => w.marker(p, { account: i % 2 ? 0 : ACCOUNT_OF(p) }));
  const holder = (e) => e.FindChildTraverse("PlayerName");
  w.advance(1100);
  const reads = () => entries.map((e) => holder(e).accountReads);
  const base = reads();
  w.advance(10000);
  const grown = reads().map((n, i) => n - base[i]);
  entries.forEach((e, i) => {
    if (i % 2 === 0) assert.equal(grown[i], 0, `entry ${i} has its account and is not read again`);
    else assert.ok(grown[i] >= 8 && grown[i] <= 11, `entry ${i} (account 0) is read once a second (${grown[i]})`);
  });
  // The accounts arrive (a marker is set the first time it is on screen): learned within a second, then silent.
  entries.forEach((e, i) => { if (i % 2) holder(e).accountid = ACCOUNT_OF([...AMBER, ...SAPPHIRE][i]); });
  entries[11].FindChildTraverse("PlayerName").accountid = 0; // the followed player stays 0
  w.advance(1100);
  assert.equal(w.host().accountOf("Vesper"), String(ACCOUNT_OF("Vesper")));
  const after = reads();
  w.advance(10000);
  deq(reads(), after, "11 of 12 known: no entry is read any more");
  // The next map: new entries with other accounts; nothing of the old map is kept.
  for (const e of entries) e.DeleteAsync();
  w.bar().DeleteAsync();
  w.advance(1100);
  assert.equal(w.host().accountOf("Vesper"), "", "the old map's accounts are gone with its markers");
  markAll(w, { Kestrel: { account: 555 } });
  w.advance(1100);
  assert.equal(w.host().accountOf("Kestrel"), "555");
  assert.equal(w.host().accountOf("Moth"), String(ACCOUNT_OF("Moth")));
});

// Counts text writes on one mock label (the stock name labels must be left alone unless an alias shows).
function trackWrites(label) {
  const log = [];
  const own = Object.getOwnPropertyDescriptor(label, "text");
  Object.defineProperty(label, "text", { configurable: true, enumerable: true, get: own.get,
    set: (value) => { log.push(value); own.set(value); } });
  return log;
}

// Aliases on the world healthbars (user 2026-10-23, screenshot of the far-away markers: "change the
// name from the healthbars and the ones far away"). The stock #name is bound to the overlay's dialog
// variable; a written text unbinds it. How it could fail: the alias never reaches the world contexts
// (no GameUI.CustomUIConfig there); the status column stops matching the hero (snapshots must keep the
// in-game name); a recycled bar keeps the last hero's alias; a bar that stops being a hero keeps it;
// clearing the alias leaves the label unbound (it would freeze); a shared name gets an alias; the
// alias stays after spectating ends; steady-state rewrites.
check("aliases: world healthbar names show the alias while spectating; recycled or cleared bars get the stock name back", () => {
  const w = statusWorld();
  const nameOf = (hero) => w.units[hero].dialog.FindChild("name");
  const kestrel = w.units.Kestrel;
  const mothWrites = trackWrites(nameOf("Moth"));
  w.press("OHMenuButton");
  w.type("OHAmberPlayer0Entry", "Kes");
  w.advance(1100);
  assert.equal(nameOf("Kestrel").text, "Kes", "the alias on the healthbar");
  assert.equal(nameOf("Moth").text, "Moth");
  deq(mothWrites, [], "a hero without an alias is left alone");
  w.giveDebuff("Kestrel", "ability_viper_petrifybola");
  w.advance(1000);
  deq(w.icons("Kestrel"), ["file://{images}/hud/abilities/viper/viper_petrifybola.psd"], "the column still finds Kestrel's statuses");
  const writes = trackWrites(nameOf("Kestrel"));
  w.advance(6000);
  deq(writes, [], "no rewrites in steady state");
  // The engine gives the bar to another hero: the stock name follows, without the alias.
  kestrel.dialog.__dialog.name = "Doyle";
  w.advance(600);
  assert.equal(nameOf("Kestrel").text, "Doyle", "a recycled bar shows its new hero's own name");
  kestrel.dialog.__dialog.name = "Kestrel";
  w.advance(600);
  assert.equal(nameOf("Kestrel").text, "Kes");
  // No longer a hero bar: the stock name, still bound.
  kestrel.holder.RemoveClass("CLASS_PLAYER");
  w.advance(2500);
  kestrel.dialog.__dialog.name = "Trooper";
  assert.equal(nameOf("Kestrel").text, "Trooper", "a non-hero bar keeps the stock binding");
  kestrel.dialog.__dialog.name = "Kestrel";
  kestrel.holder.AddClass("CLASS_PLAYER");
  w.advance(2500);
  assert.equal(nameOf("Kestrel").text, "Kes");
  // Cleared alias: the binding comes back (a later name change still shows).
  w.type("OHAmberPlayer0Entry", "");
  w.advance(600);
  kestrel.dialog.__dialog.name = "Kestrel II";
  assert.equal(nameOf("Kestrel").text, "Kestrel II", "cleared: bound again");
  kestrel.dialog.__dialog.name = "Kestrel";
  // A name two cards share keeps the stock name (as on the band).
  w.type("OHAmberPlayer0Entry", "Kes");
  w.advance(1100);
  const mothCard = w.card("Moth");
  const rename = (to) => { for (const label of mothCard.FindChildrenWithClassTraverse("PlayerName").concat(mothCard.FindChildrenWithClassTraverse("AlwaysPlayerName"))) label.__text = to; };
  rename("Kestrel");
  w.advance(2100);
  assert.equal(nameOf("Kestrel").text, "Kestrel", "a shared name gets no alias");
  rename("Moth");
  w.advance(2100);
  assert.equal(nameOf("Kestrel").text, "Kes");
  // Back to playing: every healthbar shows the stock name again.
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.RemoveClass(cls);
  w.advance(3000);
  assert.equal(nameOf("Kestrel").text, "Kestrel", "no aliases outside spectating");
  kestrel.dialog.__dialog.name = "Kestrel III";
  assert.equal(nameOf("Kestrel").text, "Kestrel III", "and bound again");
});

// Aliases on the far-away hero markers (stock hud_unit_indicators_v2.xml, CitadelHudUnitIndicatorsV2
// #unit_indicators_v2: name, hero icon, distance). How it could fail: the marker keeps the stock name;
// a marker whose name is not the card's (a Steam friend nickname) is matched by its account, never by its hero
// (CitadelHeroImage exposes no hero id to JS, P1b live 2026-10-25);
// the engine writing the name again wins for good; a marker that appears later is missed; clearing
// the alias or leaving spectating leaves the alias; markers without an alias are written; rewrites in
// steady state.
check("aliases: far-away hero markers show the alias (by name, else by account), and the stock name when cleared", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  assert.ok(w.indicators, "the stock HUD has #unit_indicators_v2");
  const kes = w.marker("Kestrel");
  const moth = w.marker("Moth");
  const doyle = w.marker("Doyle", { shown: "my friend doyle" });
  const mothWrites = trackWrites(w.markerName(moth));
  w.advance(2000);
  deq(mothWrites, [], "nothing is written without aliases");
  w.press("OHMenuButton");
  w.type("OHAmberPlayer0Entry", "Kes");
  w.type("OHAmberPlayer2Entry", "Dee");
  w.advance(1100);
  deq([w.markerName(kes).text, w.markerName(moth).text, w.markerName(doyle).text], ["Kes", "Moth", "my friend doyle"],
    "alias by name; no alias: untouched; a nickname marker without an account is left alone (no hero match)");
  deq(mothWrites, [], "a marker without an alias is left alone");
  // The engine writes the name again: the alias is back within a tick.
  w.markerName(kes).__text = "Kestrel";
  w.advance(1100);
  assert.equal(w.markerName(kes).text, "Kes");
  const writes = trackWrites(w.markerName(kes));
  w.advance(5000);
  deq(writes, [], "no rewrites in steady state");
  // A marker made later gets its alias.
  const later = w.marker("Kestrel");
  w.advance(1100);
  assert.equal(w.markerName(later).text, "Kes");
  // Cleared aliases: the names the markers showed come back.
  w.type("OHAmberPlayer0Entry", "");
  w.type("OHAmberPlayer2Entry", "");
  w.advance(1100);
  deq([w.markerName(kes).text, w.markerName(doyle).text], ["Kestrel", "my friend doyle"], "cleared: the names the markers showed");
  // Back to playing: no alias on any marker.
  w.type("OHAmberPlayer0Entry", "Kes");
  w.advance(1100);
  assert.equal(w.markerName(kes).text, "Kes");
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.RemoveClass(cls);
  w.advance(2100);
  assert.equal(w.markerName(kes).text, "Kestrel", "no aliases outside spectating");
});

// Kill feed names (user 2026-10-23, screenshot 20:29: aliases "Player N" on the band, in-game names in
// the feed). Stock rows are CitadelHudInfoFeed with Label.killerInfo / Label.victimInfo bound to
// {s:killer_name} / {s:victim_name}. How it could fail: a row keeps the in-game names; the alias shows a
// tick late (rows live a few seconds); a name without an alias is written; a name that no card
// shows is never guessed from its hero; a row the engine reuses for another kill keeps the
// old alias; a cleared alias or the end of spectating leaves a row on the alias; polling without
// aliases; rewrites in steady state.
check("aliases: kill feed rows show the killer's and victim's alias soon after they appear", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  const before = w.killRow(300, { killer: "Kestrel", victim: "Volt" });
  const counted = trackWrites(before.FindChildrenWithClassTraverse("killerInfo")[0]);
  w.advance(2000);
  deq(counted, [], "nothing is written without aliases");
  w.press("OHMenuButton");
  w.type("OHAmberPlayer0Entry", "Player 1");
  w.type("OHSapphirePlayer0Entry", "Player 7");
  w.type("OHAmberPlayer2Entry", "Player 3");
  w.advance(1100);
  deq(w.feedNames(before), ["Player 1", "Player 7"], "a row already shown gets the aliases");
  // A new row: the aliases within 0.3 s; a name without an alias stays bound and untouched.
  const row = w.killRow(320, { killer: "Moth", victim: "Kestrel" });
  const mothLabel = row.FindChildrenWithClassTraverse("killerInfo")[0];
  const mothWrites = trackWrites(mothLabel);
  w.advance(300);
  deq(w.feedNames(row), ["Moth", "Player 1"], "the victim's alias within 0.3 s; Moth has none");
  deq(mothWrites, [], "a name without an alias is not written");
  // A name no card shows is left alone: the hero image carries no id to JS (P1b), so there is no hero match.
  const nick = w.killRow(320, { killer: "my friend doyle", victim: "Moth", killerHero: heroOf("Doyle")[0] });
  w.advance(300);
  deq(w.feedNames(nick), ["my friend doyle", "Moth"], "a row whose name no card shows gets no alias");
  // The engine reuses the row for another kill: the new names (and their aliases) show.
  row.__dialog.killer_name = "Volt";
  row.__dialog.victim_name = "Mole";
  w.advance(1100);
  deq(w.feedNames(row), ["Player 7", "Mole"], "a reused row shows the new kill's names");
  const writes = trackWrites(row.FindChildrenWithClassTraverse("killerInfo")[0]);
  w.advance(5000);
  deq(writes, [], "no rewrites in steady state");
  // Cleared: the in-game name, still bound.
  w.type("OHSapphirePlayer0Entry", "");
  w.advance(1100);
  deq(w.feedNames(row), ["Volt", "Mole"], "cleared: the in-game name");
  row.__dialog.killer_name = "Talon";
  assert.equal(w.feedNames(row)[0], "Talon", "the cleared label is bound again");
  // Back to playing: the in-game names.
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.RemoveClass(cls);
  w.advance(2100);
  deq(w.feedNames(before), ["Kestrel", "Volt"], "no aliases outside spectating");
});

// Ultimate cooldown (user 2026-10-23: "we forgot to add the ultimate timer"; DLF SPEC "Ultimate cooldown",
// without overriding the stock card). The game sets ult_cooldown on each card's #UltimateStatusBG, and a
// binding sees only its own or an ancestor's dialog variables. How it could fail: the source label is not
// inside #UltimateStatusBG, so it never binds and nothing shows; 0 (ready), an unbound label or garbage
// shows a number; it lags more than half a second behind the game; it rewrites an unchanged value; the
// row sits under the statuses instead of under the icon; a rebuilt card gets no counter, or a layout
// reload adds a second source label to the stock card; it keeps polling after spectating ends.
check("ultimate: each card counts its ultimate cooldown under the stock icon; nothing at 0, unbound or garbage", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  const shown = (name) => w.card(name).FindChild("OHDebuffsHost").FindChild("OHUltTime");
  const counter = (name) => shown(name).BHasClass("OHCounting") ? shown(name).__text : "";
  const bg = (name) => w.card(name).FindChildTraverse("UltimateStatusBG");
  deq(w.card("Kestrel").FindChild("OHDebuffsHost").Children().map((child) => child.id), ["OHUltTime", "OHDebuffGrid", "OHBuys"],
    "the counter is the column's first row, under the stock ultimate icon");
  for (const name of [...AMBER, ...SAPPHIRE]) assert.equal(countIn(bg(name), "OHUltSource"), 1, `${name}: one source label in #UltimateStatusBG`);
  assert.equal(counter("Kestrel"), "", "ready: nothing");
  w.ult("Kestrel", 37);
  w.advance(500);
  assert.equal(counter("Kestrel"), "37", "within half a second");
  assert.equal(counter("Moth"), "", "only the card whose ultimate counts");
  const writes = trackWrites(shown("Kestrel"));
  w.advance(2000);
  deq(writes, [], "an unchanged value is not rewritten");
  w.ult("Kestrel", 36);
  w.advance(500);
  assert.equal(counter("Kestrel"), "36");
  for (const raw of [0, "", "-3", "abc", "12345"]) {
    w.ult("Kestrel", raw);
    w.advance(500);
    assert.equal(counter("Kestrel"), "", `nothing for ${JSON.stringify(raw)}`);
  }
  delete bg("Kestrel").__dialog.ult_cooldown;
  w.advance(500);
  assert.equal(counter("Kestrel"), "", "nothing while the label is unbound");
  bg("Kestrel").__dialog.ult_cooldown = 0;
  // A hero swap rebuilds the card's children: the new card gets its counter back.
  const kestrel = w.card("Kestrel");
  const status = bg("Kestrel").GetParent();
  kestrel.FindChild("OHDebuffsHost").DeleteAsync();
  bg("Kestrel").DeleteAsync();
  new MockPanel("Panel", status, "UltimateStatusBG").__dialog = { ult_cooldown: 52 };
  w.advance(1600);
  assert.equal(counter("Kestrel"), "52", "a rebuilt card counts again");
  // A layout reload keeps one source label per card.
  w.bootHost();
  w.advance(2000);
  for (const name of [...AMBER, ...SAPPHIRE]) assert.equal(countIn(bg(name), "OHUltSource"), 1, `${name}: one source label after a reload`);
  assert.equal(counter("Kestrel"), "52", "the reloaded host counts");
  // Back to playing: the column hides (CSS) and nothing reads the cards any more.
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.RemoveClass(cls);
  w.advance(2000);
  w.ult("Kestrel", 51);
  w.advance(2000);
  assert.equal(counter("Kestrel"), "52", "not polled outside spectating");
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.AddClass(cls);
  w.advance(1600);
  assert.equal(counter("Kestrel"), "51", "polled again when spectating resumes");
});

// Urn carrier (user 2026-10-26: "grab who has the urn and display the urn icon at the side of the ult
// icon"; DLF SPEC "Urn carrier", ported). The kill feed's pickup row (.IdolPickedUp, the picker as its
// killer) names the carrier; the minimap's player markers carry .PlayerIsHoldingIdol while anyone holds it
// (no name). How it could fail: the icon lands on no card or the wrong one (an alias in the feed label, a
// name no card shows, two cards with one name); it stays after the urn is delivered, expired, dropped or
// the carrier died; a reused row for the next pickup is not read; an old pickup row read late shows a
// stale carrier; it rewrites classes in steady state; it stays after spectating ends; it sits in the status
// column, which clips it (live 2026-10-26: laid out above the column's top, never drawn).
check("urn: the carrier's card shows the urn beside the ult icon from the feed's pickup row until it is delivered, dropped or the carrier dies", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  const icon = (name) => w.card(name).FindChild("OHUrnHost").FindChild("OHUrn");
  const carriers = () => [...AMBER, ...SAPPHIRE].filter((name) => icon(name).BHasClass("OHUrnHeld"));
  const event = (killer, cls) => { const row = w.killRow(300, { killer, victim: "" }); row.AddClass(cls); return row; };
  const map = w.hud.FindChildTraverse("hud_minimap");
  const holder = new MockPanel("Panel", map, "");
  holder.classes = ["map_button", "player"];
  deq(carriers(), [], "nobody carries the urn at first");
  for (const name of [...AMBER, ...SAPPHIRE]) {
    assert.equal(icon(name).GetParent().GetParent(), w.card(name), `${name}: the mark's host is the card's own child, not the column`);
  }
  const row = event("Kestrel", "IdolPickedUp");
  w.advance(1100);
  deq(carriers(), ["Kestrel"], "the picker's card within a second");
  let writes = 0;
  for (const name of [...AMBER, ...SAPPHIRE]) {
    const panel = icon(name);
    for (const fn of ["AddClass", "RemoveClass", "SetHasClass"]) { const old = panel[fn]; panel[fn] = function (...args) { writes++; return old.apply(this, args); }; }
  }
  w.advance(5000);
  assert.equal(writes, 0, "no class writes while nothing changes");
  // The minimap confirms the carry; once seen, the carry ends when no marker holds the urn (dropped).
  holder.AddClass("PlayerIsHoldingIdol");
  w.advance(1100);
  deq(carriers(), ["Kestrel"], "still Kestrel while a marker holds the urn");
  holder.RemoveClass("PlayerIsHoldingIdol");
  w.advance(1100);
  deq(carriers(), [], "dropped: no marker holds it");
  // The engine reuses the row for the next pickup.
  row.__dialog.killer_name = "Volt";
  holder.AddClass("PlayerIsHoldingIdol");
  w.advance(1100);
  deq(carriers(), ["Volt"], "a reused row names the new carrier");
  w.card("Volt").AddClass("Dead");
  w.advance(1100);
  deq(carriers(), [], "the carrier died");
  w.card("Volt").RemoveClass("Dead");
  event("Moth", "IdolPickedUp");
  w.advance(1100);
  deq(carriers(), ["Moth"]);
  event("Moth", "IdolReturned");
  w.advance(1100);
  deq(carriers(), [], "delivered");
  event("Geist", "IdolPickedUp");
  w.advance(1100);
  event("", "IdolExpired");
  w.advance(1100);
  deq(carriers(), [], "expired");
  // With the minimap seen this session, a pickup no marker confirms within 2 s (an old row read late) goes.
  holder.RemoveClass("PlayerIsHoldingIdol");
  event("Talon", "IdolPickedUp");
  w.advance(1100);
  deq(carriers(), ["Talon"], "shown at once");
  w.advance(2100);
  deq(carriers(), [], "never confirmed by the minimap: dropped");
  // The feed label shows an alias: still the right card. A name no card shows: nobody.
  w.press("OHMenuButton");
  w.type("OHAmberPlayer2Entry", "Player 3");
  w.advance(1100);
  holder.AddClass("PlayerIsHoldingIdol");
  event("Doyle", "IdolPickedUp");
  w.advance(1100);
  deq(carriers(), ["Doyle"], "the alias in the feed label does not hide the carrier");
  event("my friend doyle", "IdolPickedUp");
  w.advance(1100);
  deq(carriers(), [], "a name no card shows is never guessed");
  // Back to playing: no icon is left.
  event("Kestrel", "IdolPickedUp");
  w.advance(1100);
  deq(carriers(), ["Kestrel"]);
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.RemoveClass(cls);
  w.advance(2100);
  deq(carriers(), [], "no urn icon outside spectating");
});

// The stock kill feed (hud_data_feed.xml #EventFeed: top left, margin-top 200) ran over Player 1's status
// grid and purchase notices (user screenshot 2026-10-23 19:32, Night Desk at 1920x1080). How it could
// fail: it stays over them; it moves for a card whose grid or notices it does not reach (Moth, the next
// card); it moves for a column with nothing shown, or for the ultimate row reserved at the column's top
// while no counter shows; it stays over a counting ultimate; it jumps back up while a status blinks (it
// must hold a moment before going up); it is left moved after spectating; rewrites in steady state.
check("kill feed: moves under the status grid and purchase notices of the cards it reaches, then back", () => {
  const w = world();
  w.clock("12:30");
  w.bootHost();
  w.advance(2000);
  const host = (name) => w.card(name).FindChild("OHDebuffsHost");
  // Columns start 147 layout px under the card (under the stock ultimate icon); empty, a column is the
  // ultimate row it always reserves (20 px) plus the 2 px notice gap.
  const EMPTY = 22;
  for (const name of [...AMBER, ...SAPPHIRE]) Object.assign(host(name), { actualyoffset: 147, actuallayoutheight: EMPTY });
  const marginWrites = [];
  let margin = w.eventFeed.style.marginTop;
  Object.defineProperty(w.eventFeed.style, "marginTop", { configurable: true, get: () => margin,
    set: (value) => { marginWrites.push(value); margin = value; } });
  const top = () => w.eventFeed.GetPositionWithinWindow().y;
  w.advance(2100);
  assert.equal(top(), 200, "nothing in the way: the stock place");
  deq(marginWrites, [], "nothing written while nothing is in the way");
  // An empty column whose top is under the feed's (Night Desk pushes the top bar 56 px down) is nothing.
  host("Kestrel").actualyoffset = 210;
  w.advance(1100);
  assert.equal(top(), 200, "an empty column does not move it");
  // A counting ultimate is something: in Night Desk (56 px lower) its row ends under the feed's top.
  host("Kestrel").actualyoffset = 203;
  w.ult("Kestrel", 40);
  w.advance(1600); // the counter (2 Hz), then the feed (1 s host tick)
  assert.equal(top(), 8 + 203 + EMPTY + 6, "under Kestrel's ultimate counter");
  w.ult("Kestrel", 0);
  w.advance(3200);
  assert.equal(top(), 200, "the counter ends: back after the hold");
  host("Kestrel").actualyoffset = 147;
  // Kestrel (the leftmost card, 330-418) shows three rows of statuses: the column ends at 8 + 147 + 20 + 117.
  host("Kestrel").actuallayoutheight = 20 + 117;
  w.advance(1100);
  assert.equal(top(), 292 + 6, "6 px under Kestrel's column (no rows yet: the feed is taken as 360 px wide)");
  const before = marginWrites.length;
  w.advance(5000);
  assert.equal(marginWrites.length, before, "no rewrites in steady state");
  // A column that was never laid out (just injected) reads Infinity live (DLF's soul graph, client
  // 6819, 2026-10-24): it is skipped, never written as "Infinitypx".
  host("Kestrel").GetPositionWithinWindow = () => ({ x: Infinity, y: Infinity });
  w.advance(1100);
  assert.ok(!marginWrites.some((value) => /NaN|Infinity/.test(String(value))), `no Infinity margin: ${marginWrites.join(", ")}`);
  delete host("Kestrel").GetPositionWithinWindow;
  w.advance(1100);
  assert.equal(top(), 298, "back under Kestrel's column once it is laid out");
  // Kill rows that end before Kestrel's grid (374 - 37 = 337): back up, but only after a 2 s hold.
  const narrow = w.killRow(200);
  w.advance(1100);
  assert.equal(top(), 298, "held");
  w.advance(2100);
  assert.equal(top(), 200, "rows clear of the grid: back to the stock place");
  // A purchase notice (209 px, centred: from 269) reaches a 300 px row that the grid (from 337) does not.
  w.buy("Kestrel", "Extra Health");
  w.advance(600);
  assert.equal(w.notices("Kestrel").length, 1);
  host("Kestrel").actuallayoutheight = 20 + 117 + 37;
  w.killRow(300);
  w.advance(1100);
  assert.equal(top(), 155 + 174 + 6, "under the notice it reaches");
  // Moth's column (the next card, its grid from 425) is out of the feed's reach.
  host("Moth").actuallayoutheight = 300;
  w.advance(1100);
  assert.equal(top(), 335, "the next card's column does not move it");
  // Kestrel's column empties (the notice fades) and the rows go: back after the hold.
  host("Kestrel").actuallayoutheight = EMPTY;
  for (const row of w.eventFeed.Children().slice()) row.DeleteAsync();
  w.advance(1100);
  assert.equal(top(), 335, "held");
  w.advance(2100);
  assert.equal(top(), 200);
  // Back to playing: the stock margin, written once.
  host("Kestrel").actuallayoutheight = 20 + 117;
  w.advance(1100);
  assert.equal(top(), 298);
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.RemoveClass(cls);
  w.advance(2100);
  assert.equal(top(), 200, "the stock place outside spectating");
  assert.equal(marginWrites[marginWrites.length - 1], "200px", "written as the stock px (an inline null clear is not trusted)");
  const after = marginWrites.length;
  w.advance(5000);
  assert.equal(marginWrites.length, after, "written once");
  void narrow;
});

check("editor: share code export and import on another PC, reset asks twice, DEV settings stay local", () => {
  const a = world();
  a.bootHost();
  markAll(a);
  a.advance(2000);
  a.press("OHMenuButton");
  a.type("OHEventEntry", "Deadlock Community Cup");
  a.type("OHAmberNameEntry", "Night Owls");
  a.type("OHAmberPlayer1Entry", "Mothman");
  a.press("OHLookDesk");
  a.type("OHOrgEntry", "Community Cup");
  a.press("OHDebuffToggle");
  a.press("OHShareCopy");
  const code = a.harness.clipboardWrites[a.harness.clipboardWrites.length - 1];
  assert.ok(code.startsWith("OHC1."));
  // A long setup (24 CJK aliases, two long logo links) copies as one code over 8192 characters.
  const saved = JSON.parse(JSON.stringify(a.state()));
  const wide = JSON.parse(JSON.stringify(saved));
  wide.players = {};
  for (let i = 0; i < 24; i++) wide.players[String(100000 + i)] = { a: "界".repeat(24), n: "界".repeat(32) };
  for (const key of ["amber", "sapphire"]) wide[key].logo = { url: `https://example.org/${"x".repeat(480)}${key}.png` };
  a.host().setState(wide);
  const clips = a.harness.clipboardWrites.length;
  a.press("OHShareCopy");
  assert.equal(a.harness.clipboardWrites.length, clips + 1, "copied");
  const wideCode = a.harness.clipboardWrites.slice(-1)[0];
  assert.ok(wideCode.length > 8192, `one code of ${wideCode.length} characters`);
  assert.equal(stateApiOf().decodeShare(wideCode).kind, "valid");
  a.host().setState(saved);
  const b = world();
  b.bootHost();
  markAll(b);
  b.advance(2000);
  b.press("OHMenuButton");
  b.harness.clipboardText = code;
  b.press("OHShareImport"); // empty box: pastes the clipboard first
  assert.equal(b.state().event, "Deadlock Community Cup");
  assert.equal(b.state().players[ACCOUNT_OF("Moth")].a, "Mothman", "aliases by account travel in a code");
  assert.equal(b.state().dev.debuffs, true, "the DEV switch does not travel in a code");
  assert.equal(text(b.ui("OHShareStatus")), "Imported.");
  assert.equal(b.who("Moth"), "Mothman");
  assert.equal(b.state().style, "desk", "the look travels in the code");
  assert.equal(b.state().org.name, "Community Cup");
  b.type("OHShareEntry", "OHC1.deadbeef.e30");
  b.press("OHShareImport");
  assert.equal(text(b.ui("OHShareStatus")), "Not an Observer HUD code.");
  assert.equal(b.state().event, "Deadlock Community Cup", "a bad code changes nothing");
  b.press("OHReset");
  assert.equal(b.state().event, "Deadlock Community Cup", "the first press only arms");
  assert.equal(text(b.ui("OHResetLabel")), "CONFIRM RESET ALL");
  b.press("OHReset");
  assert.equal(b.state().event, "Community Cup Season 2", "reset returns to the sample values");
  assert.equal(b.state().style, "names", "reset returns to the default look");
  deq([b.state().players, b.state().legacy, b.state().pending], [{}, {}, {}]);
  b.press("OHDone");
  assert.ok(!b.menu().BHasClass("OHOpen"));
});

check("editor: works inside HP Colors v3's Escape menu", () => {
  assert.ok(fs.existsSync(HPV3_ESCAPE), "HP Colors v3 Escape menu source");
  const w = world({ escape: "hpv3" });
  w.bootHost();
  w.advance(2000);
  assert.equal(countIn(w.escapeMenu, "OHMenuHost"), 1);
  w.press("OHMenuButton");
  w.type("OHStageEntry", "Semi Final");
  assert.ok(text(w.ui("OHCapLeft")).startsWith(`${"Semi Final"} · BO`), "the stage rides in the left plate caption");
  assert.ok(w.escapeMenu.FindChildTraverse("EscapeButton") || w.escapeMenu.children.length > 1, "HP v3's menu is still there");
});

// ---------------------------------------------------------------- status column

const PETRIFY = "file://{images}/hud/abilities/viper/viper_petrifybola.psd";
const DJINN = "file://{images}/hud/abilities/mirage/mirage_sand_phantom.psd";
const snapshots = (w) => w.sent.filter((raw) => raw.includes("OH_DEBUFF_SNAPSHOT"));

function statusWorld(options) {
  const w = world(options);
  w.bootHost();
  w.advance(2000);
  for (const name of [...AMBER, ...SAPPHIRE]) w.addBar(name);
  return w;
}

check("column: a hero's debuff reaches its card with the applying team's colour and a sweep of the time that has passed", () => {
  const w = statusWorld();
  const start = w.harness.now;
  w.giveDebuff("Volt", "ability_viper_petrifybola", { radial: (now) => -360 + ((now - start) / 6000) * 360 });
  w.advance(3000);
  deq(w.icons("Volt"), [PETRIFY]);
  const slot = w.shownSlots("Volt")[0];
  assert.ok(slot.BHasClass("OHByAmber"), "a debuff on a Sapphire hero comes from Amber");
  // User 2026-11-06: the seconds over the icon hid it on a low-bitrate stream. The part of the 6 s that
  // has passed is a dark wedge from 12 o'clock; the rest of the icon stays untouched; no number.
  const shade = slot.FindChildrenWithClassTraverse("OHDebuffShade")[0];
  const passed = () => Number((/^radial\(50% 50%, 0deg, (\d+)deg\)$/.exec(String(shade.style.clip)) || [])[1]);
  assert.ok(slot.BHasClass("OHSweep") && !slot.BHasClass("OHHasTime"), "a sweep, not the seconds");
  const half = passed();
  assert.ok(Math.abs(half - 180) <= 20, `3 s of 6 s passed: about half the circle dark (${half} deg)`);
  w.advance(1500);
  const later = passed();
  assert.ok(later > half && Math.abs(later - 270) <= 20, `1.5 s later: about three quarters (${later} deg)`);
  // Smooth (user: "interp for smoothing"): the 0.25 s steps are interpolated by a native clip transition a
  // little longer than the tick; the passed part is 82 % black (user: 25 % darker than 66 %).
  const shadeRule = /\n\.OHDebuffShade\s*\{([^}]*)\}/.exec(read("panorama/styles/observer_hud/oh_debuffs.css"))[1];
  for (const decl of [/transition-property:\s*clip;/, /transition-duration:\s*0\.3s;/, /transition-timing-function:\s*linear;/, /background-color:\s*#000000D2;/]) {
    assert.match(shadeRule, decl);
  }
  // Abilities outside the spec never draw.
  w.giveDebuff("Mole", "ability_some_unlisted_debuff");
  w.advance(1000);
  deq(w.icons("Mole"), []);
  // The status goes: the slot fades, then frees.
  w.units.Volt.container.children[0].DeleteAsync();
  w.advance(600);
  assert.ok(w.slots("Volt")[0].BHasClass("OHFading"));
  assert.ok(w.slots("Volt")[0].BHasClass("OHSweep") && passed() === 360, `a fading status stays dark, all of its time has passed (${shade.style.clip})`);
  w.advance(1500);
  assert.ok(!w.slots("Volt")[0].BHasClass("OHShown"));
  assert.equal(String(shade.style.clip), "radial(50% 50%, 0deg, 0deg)", "a freed slot's wedge is back at 0: the next status grows in");
});

check("purchases: a notice on the buyer's card under the status column; old rows, history and other cards never show", () => {
  const w = world();
  w.clock("12:30");
  w.buy("Kestrel", "Lucky Shot", { time: "12:25" }); // listed when the observer joins, recent by the clock
  w.bootHost();
  w.advance(3000);
  deq(AMBER.concat(SAPPHIRE).map((name) => w.notices(name).length), new Array(12).fill(0), "rows already listed show nothing");
  // A Sapphire purchase reaches Volt's card only, inside his status column (after its four slots).
  w.buy("Volt", "Spirit Shredder", { tier: 3, kind: "Tech" });
  w.advance(600);
  const [notice] = w.notices("Volt");
  assert.ok(notice, "Volt's notice");
  assert.equal(w.noticeText(notice), "Spirit Shredder");
  assert.equal(notice.FindChildrenWithClassTraverse("OHBuyIcon")[0].src, `file://{images}/${ITEM_ICONS["Spirit Shredder"]}.psd`);
  assert.ok(notice.BHasClass("OHBuySpirit") && notice.BHasClass("OHBuyT3"), "the row's slot and tier as own classes");
  // The wobbling layer first: the paper box (paper layers in it), then the frame images, middle in its
  // flow row before the caps (drawn over it).
  const frame = notice.children[0];
  const classOf = (panel) => ["OHBuyPaperBox", "OHBuyEdgeRow", "OHBuyEdgeL", "OHBuyEdgeR"].find((cls) => panel.BHasClass(cls));
  assert.ok(frame.BHasClass("OHBuyBg"), "the notice's first child is its wobbling layer");
  deq(frame.children.map(classOf), ["OHBuyPaperBox", "OHBuyEdgeRow", "OHBuyEdgeL", "OHBuyEdgeR"], "paper under the frame, caps last");
  deq(frame.children[0].children.map((layer) => ["OHBuyBacker", "OHBuyWear", "OHBuyPaper"].find((cls) => layer.BHasClass(cls))),
    ["OHBuyBacker", "OHBuyWear", "OHBuyPaper"], "the shop card paper inside its box");
  assert.ok(frame.children[1].children[0].BHasClass("OHBuyEdgeM"));
  const sheet = read("panorama/styles/observer_hud/oh_debuffs.css");
  for (const cls of ["OHBuyBg", "OHBuyPaperBox", "OHBuyBacker", "OHBuyWear", "OHBuyPaper", "OHBuyEdgeRow", "OHBuyEdgeL", "OHBuyEdgeM", "OHBuyEdgeR", "OHBuyIcon", "OHBuyName"]) {
    assert.ok(sheet.includes(`.${cls}`), `oh_debuffs.css styles .${cls}`);
  }
  assert.match(sheet, /\.OHBuyBg\s*\{[^}]*animation-name:\s*OHBuyGroove;/, "the layer wobbles like the stock chat bubble");
  // Every frame image the sheet uses ships (PNG + .vtex), both border widths, all three pieces.
  const frameImages = [...sheet.matchAll(/s2r:\/\/panorama\/images\/(observer_hud\/[\w]+)\.vtex/g)].map((m) => m[1]);
  deq([...new Set(frameImages)].sort(), [2, 3].flatMap((b) => ["l", "m", "r"].map((p) => `observer_hud/buy_frame${b}_${p}`)).sort());
  for (const image of frameImages) {
    for (const ext of ["png", "vtex"]) {
      assert.ok(fs.existsSync(path.join(MODULE, "panorama", "images", `${image}.${ext}`)), `${image}.${ext} exists`);
    }
  }
  // A notice row is 35 px (oh_buys.js ROW_H): the 36 px notice (32 px frame in a 2 px rim), -2 and +1 px margins.
  const row = /\n\.OHBuy\s*\{([^}]*)\}/.exec(sheet)[1];
  const px = (prop) => Number(new RegExp(`\\b${prop}:\\s*(-?\\d+)px`).exec(row)[1]);
  assert.equal(px("height") + px("margin-top") + px("margin-bottom"), 35, "the notice row stays 35 px");
  // The frame images are drawn at the notice's height (make-notice-frame.py HEIGHT): stretched, the
  // anti-aliased band and the transparent rim would blur or thin.
  for (const image of new Set(frameImages)) {
    const png = fs.readFileSync(path.join(MODULE, "panorama", "images", `${image}.png`));
    assert.equal(png.readUInt32BE(20), px("height"), `${image}.png is as high as the notice`);
  }
  const column = w.card("Volt").FindChild("OHDebuffsHost");
  assert.equal(w.card("Volt").FindChildTraverse("OHBuys").GetParent(), column, "inside the status column, under its slots");
  assert.equal(AMBER.concat(SAPPHIRE).filter((name) => w.notices(name).length).join(), "Volt");
  // Newest on top, three at most.
  for (const item of ["Extra Health", "Mystic Burst", "Headshot Booster"]) {
    w.buy("Volt", item);
    w.advance(600);
  }
  deq(w.notices("Volt").map(w.noticeText), ["Headshot Booster", "Mystic Burst", "Extra Health"]);
  // A name without an icon still shows; the icon hides.
  w.buy("Moth", "Not In The Table");
  w.advance(600);
  assert.ok(w.notices("Moth")[0].FindChildrenWithClassTraverse("OHBuyIcon")[0].BHasClass("OHBuyNoIcon"));
  // Gone after the set time (default 5 s), fading out first.
  w.advance(5000);
  assert.equal(w.notices("Moth").length, 0, "fading after 5 s (shown within one 0.5 s poll of the purchase)");
  w.advance(600);
  assert.equal(w.card("Moth").FindChildTraverse("OHBuys").Children().length, 0, "deleted after the fade");
  // History: a row stamped long before the clock (a seek or a refill) never shows.
  w.buy("Geist", "Extra Stamina", { time: "3:00" });
  w.advance(600);
  assert.equal(w.notices("Geist").length, 0, "a purchase 9 min old is history");
  // The hero id decides when both sides expose it; else the hero name from the row's dialog variable
  // (live, a top-bar badge can expose no heroid: showrank/docs/test_results.md). An unknown hero draws nothing.
  const doyleRow = w.buy("Doyle", "Extra Regen", { heroName: "Doyle-San" });
  w.card("Frostbyte").FindChildTraverse("HeroBadge").heroid = undefined;
  const frostRow = w.buy("Frostbyte", "Extra Regen");
  w.buy("Talon", "Extra Regen", { heroName: "Nobody", heroId: 9999 });
  w.advance(600);
  assert.equal(w.notices("Doyle").length, 1, "hero id match");
  assert.equal(w.notices("Frostbyte").length, 1, "hero name match when the badge has no heroid");
  assert.equal(AMBER.concat(SAPPHIRE).filter((name) => w.notices(name).length && !["Doyle", "Frostbyte", "Volt"].includes(name)).length, 0);
  // The name is read only when the hero id finds no card (m2 review: every shown row used to get the
  // bound label); which path matched is logged once per path, purchases only (the live probe for B10).
  assert.equal(doyleRow.FindChildrenWithClassTraverse("OHBuyHero").length, 0, "an id-matched row gets no name label");
  assert.equal(frostRow.FindChildrenWithClassTraverse("OHBuyHero").length, 1);
  const buyLogs = w.harness.logs.filter((line) => line.startsWith("[OH-BUY] match"));
  for (const path of ["id", "name", "none"]) assert.equal(buyLogs.filter((line) => line.startsWith(`[OH-BUY] match ${path}`)).length, 1, `match ${path} logged once: ${buyLogs.join(" | ")}`);
  assert.ok(buyLogs.some((line) => /^\[OH-BUY\] match name: row name "[^{]/.test(line)), "the name path logs the row name text as read");
  // At the stock's 25-row cap the oldest row goes as the new one comes: still seen.
  while (w.purchases.children.length < 25) w.buy("Mole", "Extra Spirit", { time: "1:00" });
  w.advance(600);
  w.buy("Mole", "Mystic Reach");
  w.advance(600);
  deq(w.notices("Mole").map(w.noticeText), ["Mystic Reach"], "a new row at the cap");
  // Off in the editor: no notice; the setting travels in share codes.
  w.press("OHMenuButton");
  w.press("OHBuysOff");
  assert.equal(w.state().buys, 0);
  w.buy("Ironclad", "Lucky Shot");
  w.advance(600);
  assert.equal(w.notices("Ironclad").length, 0, "off");
  w.press("OHBuys8");
  assert.equal(w.state().buys, 8);
  w.buy("Ironclad", "Lucky Shot");
  w.advance(7500);
  assert.equal(w.notices("Ironclad").length, 1, "8 s");
  // The setting is on the PLAYERS page: RESET PLAYERS returns it to 5 s.
  w.press("OHNavPlayers");
  w.press("OHResetPage");
  w.press("OHResetPage");
  assert.equal(w.state().buys, 5);
  assert.ok(w.ui("OHBuys5").BHasClass("OHSelected") && !w.ui("OHBuys8").BHasClass("OHSelected"), "the 5 s button shows picked");
});

check("purchases: one line each; a stack that would overlap its neighbour's moves under it, then back", () => {
  const w = statusWorld();
  w.clock("12:30");
  w.advance(1000);
  const push = (name) => w.card(name).FindChildTraverse("OHBuys").style.marginTop || "";
  // Kestrel, Moth and Doyle sit side by side (Amber 1-3); a notice spans up to two cards.
  w.buy("Kestrel", "Extra Health");
  w.buy("Moth", "Extra Regen");
  w.buy("Doyle", "Extra Spirit");
  w.advance(600);
  deq(["Kestrel", "Moth", "Doyle"].map(push), ["", "41px", ""], "Moth under Kestrel (2 + 35 + 4 px); Doyle clears Moth's lowered stack");
  w.buy("Kestrel", "Mystic Burst");
  w.advance(600);
  deq(["Kestrel", "Moth", "Doyle"].map(push), ["", "76px", ""], "two rows on Kestrel push Moth further");
  // A status on Moth (one grid row, 39 px) puts his stack lower already: only the rest is added.
  w.giveDebuff("Moth", "ability_viper_petrifybola", { radial: () => -180 });
  w.advance(1500);
  assert.equal(w.shownSlots("Moth").length, 1);
  assert.equal(push("Moth"), `${2 + 70 + 4 - 39}px`);
  // Cards of the other team and cards two apart never push each other.
  w.buy("Volt", "Extra Health");
  w.advance(600);
  assert.equal(push("Volt"), "");
  // Once the notices are gone every stack returns to its place, written as px (a null clear did not
  // take live).
  w.advance(6000);
  deq(["Kestrel", "Moth", "Doyle", "Volt"].map(push), ["", "2px", "", ""]);
  // Child order is not screen order (stock: .connectedToHeroTesting .friend #PlayersContainer flows
  // left): the right-hand card of a colliding pair still moves, by x.
  const players = w.card("Kestrel").GetParent();
  players.children.reverse();
  w.buy("Frostbyte", "Extra Health");
  w.buy("Vesper", "Extra Regen");
  w.advance(600);
  deq(["Frostbyte", "Vesper"].map(push), ["", "41px"], "Vesper (right of Frostbyte) moves under it");
  // A notice as wide as one card does not reach its neighbour's.
  for (const name of ["Frostbyte", "Vesper"]) {
    for (const notice of w.card(name).FindChildTraverse("OHBuys").Children()) notice.actuallayoutwidth = 80;
  }
  w.advance(600);
  assert.equal(push("Vesper"), "2px", "measured widths that do not overlap leave both in place");
});

// The column as a centred two-wide grid (user 2026-10-23): one status sits in the card's middle; a
// second moves the first left and pops in on the right, the pair symmetric about the middle; a third
// sits centred under the pair; a fourth moves the third under the first and pops in under the second;
// and so on, six at most (three rows). How it could fail: a lone status or a lone last one off-centre;
// a pair not symmetric; a later status landing in a used place; a status that jumps to another slot
// panel when one is added or removed (it must glide, so its panel keeps it); a new status gliding in
// from where its panel last was (glide must be off for its first placement); places not closing up
// after a status fades out; the grid's height (rows) not following, so the purchase notices sit wrong;
// a pair as wide as a card, running into the neighbour's column; rewrites in steady state.
check("column: statuses form a centred two-wide grid; new ones pop in, the rest glide to their places", () => {
  const w = statusWorld();
  const KEYS = ["ability_viper_petrifybola", "drifter_darkness", "citadel_ability_self_vacuum", "ability_guided_arrow",
    "ability_gravity_lasso", "ability_ult_combo"];
  const grid = w.card("Volt").FindChild("OHDebuffsHost").FindChild("OHDebuffGrid");
  assert.ok(grid, "the slots sit in #OHDebuffGrid");
  const all = w.slots("Volt");
  assert.equal(all.length, 6, "six slots: three rows of two");
  const writes = new Map(all.map((slot) => [slot, []])); // slot -> [{ value, glide }]
  for (const slot of all) {
    let value = slot.style.transform;
    Object.defineProperty(slot.style, "transform", { configurable: true, get: () => value,
      set: (next) => { writes.get(slot).push({ value: next, glide: slot.BHasClass("OHGlide") }); value = next; } });
  }
  const iconOf = (slot) => slot.FindChildrenWithClassTraverse("OHDebuffIcon")[0].src;
  const panelOf = new Map(); // icon -> the slot panel that showed it first
  const places = () => {
    const out = {};
    for (const slot of all.filter((s) => s.BHasClass("OHShown"))) {
      const icon = iconOf(slot);
      if (!panelOf.has(icon)) panelOf.set(icon, slot);
      assert.equal(panelOf.get(icon), slot, "a status keeps its slot panel");
      const { x, y } = w.placeOf(slot);
      out[KEYS.find((key) => icon.includes(key.split("_").pop())) || icon] = `${x},${y}`;
    }
    return out;
  };
  const rows = () => [1, 2, 3].filter((n) => grid.BHasClass(`OHRows${n}`));
  const expected = [
    [["0,0"], 1],
    [["-20,0", "20,0"], 1],
    [["-20,0", "20,0", "0,39"], 2],
    [["-20,0", "20,0", "-20,39", "20,39"], 2],
    [["-20,0", "20,0", "-20,39", "20,39", "0,78"], 3],
    [["-20,0", "20,0", "-20,39", "20,39", "-20,78", "20,78"], 3]
  ];
  deq(rows(), [], "no status: no rows (height 0)");
  KEYS.forEach((key, n) => {
    w.giveDebuff("Volt", key);
    w.advance(600);
    const now = places();
    deq(KEYS.slice(0, n + 1).map((k) => now[k]), expected[n][0], `${n + 1} statuses`);
    deq(rows(), [expected[n][1]], `${n + 1} statuses: ${expected[n][1]} rows`);
  });
  // Every slot's first placement is written without glide (it pops in where it belongs); every move after with it.
  for (const [slot, list] of writes) {
    if (!list.length) continue;
    assert.equal(list[0].glide, false, "first placement without glide");
    assert.ok(list.slice(1).every((entry) => entry.glide), "moves glide");
    assert.ok(slot.BHasClass("OHGlide"), "glide on once placed");
  }
  // Steady: nothing is rewritten.
  const count = () => [...writes.values()].reduce((sum, list) => sum + list.length, 0);
  const before = count();
  w.advance(6000);
  assert.equal(count(), before, "no rewrites in steady state");
  // The first status ends: it fades where it is, then the rest close up, each on its own panel.
  const first = w.units.Volt.container.children.find((child) => child.id === `status_${KEYS[0]}`);
  const firstSlot = panelOf.get(iconOf(all.find((s) => w.placeOf(s).x === -20 && w.placeOf(s).y === 0)));
  first.DeleteAsync();
  w.advance(600);
  assert.ok(firstSlot.BHasClass("OHFading"), "fading in place");
  deq(w.placeOf(firstSlot), { x: -20, y: 0 });
  w.advance(1500);
  const after = places();
  deq(KEYS.slice(1).map((k) => after[k]), ["-20,0", "20,0", "-20,39", "20,39", "0,78"], "the rest close up");
  assert.ok(!firstSlot.BHasClass("OHShown") && !firstSlot.BHasClass("OHGlide"), "the freed slot hides and loses its glide");
  deq(rows(), [3]);
  // A new status takes the free panel and pops in at the end of the order, without gliding.
  w.giveDebuff("Volt", KEYS[0]);
  const writesBefore = writes.get(firstSlot).length;
  w.advance(600);
  const back = writes.get(firstSlot).slice(writesBefore);
  deq(back.map((entry) => [entry.value, entry.glide]), [["translate3d(20px, 78px, 0px)", false]], "pops in at its new place");
  // A pair (2 x 20 px from the middle plus one circle) leaves at least 12 px to the next card's pair on
  // the 88 px stock card (playerDetailsWidth), twice the 6 px inside a pair.
  const sheet = read("panorama/styles/observer_hud/oh_debuffs.css");
  const circle = Number(/\n\.OHDebuffCircle\s*\{[^}]*\bwidth:\s*(\d+)px/.exec(sheet)[1]);
  assert.ok(40 + circle <= 88 - 12 && 40 - circle >= 6, `pair span ${40 + circle} px, inner gap ${40 - circle} px`);
});

check("column: stuns are their own item, Djinn's Mark from 8 stacks, listed buffs in the hero's own colour", () => {
  const w = statusWorld();
  w.giveDebuff("Kestrel", "ability_viper_petrifybola", { css: "stunned" });
  w.giveDebuff("Kestrel", "ability_viper_petrifybola");
  const mark = w.giveDebuff("Doyle", "mirage_sand_phantom", { stacks: "5" });
  w.giveDebuff("Moth", "ability_ice_dome", { debuff: false });
  // The Hyperline knock-off has no applying ability: a knockdown panel plus the state panel (live
  // 2026-10-14). Any other such stun (Seven's, Ivy's; user 2026-11-06) is the plain stun plus the
  // same state panel, and must not draw as the Hyperline.
  w.giveDebuff("Volt", "modifier_citadel_knockdown", { css: "stunned" });
  w.giveDebuff("Volt", "MODIFIER_STATE_STUNNED", { css: "stunned" });
  w.giveDebuff("Talon", "modifier_citadel_stunned", { css: "stunned" });
  w.giveDebuff("Talon", "MODIFIER_STATE_STUNNED", { css: "stunned" });
  w.advance(2000);
  const kestrel = w.shownSlots("Kestrel");
  assert.equal(kestrel.length, 2);
  assert.equal(kestrel.filter((slot) => slot.BHasClass("OHStun")).length, 1);
  deq(w.icons("Doyle"), [], "5 stacks: not yet");
  mark.setStacks("8");
  w.advance(1000);
  deq(w.icons("Doyle"), [DJINN]);
  assert.equal(w.slotText(w.shownSlots("Doyle")[0], "OHDebuffCount", "OHHasCount"), "8");
  assert.ok(w.shownSlots("Moth")[0].BHasClass("OHByAmber"), "Kelvin's dome on an Amber hero: own colour");
  deq(w.icons("Volt"), ["s2r://panorama/images/icons/properties/zipline.vsvg"], "Hyperline knock-off: one zipline stun");
  deq(w.icons("Talon"), [], "a stun with no applying ability other than the knockdown is not the Hyperline");
  // The stun panel is muted on the world bar (inline fallback to the stylesheet).
  const stunPanel = w.units.Kestrel.container.children.find((child) => child.BHasClass("stunned"));
  assert.equal(stunPanel.style.width, "0px");
});

// Shining Wonder (Celeste's orb, ability_unicorn_dazzlingorb): each hit slows its hero for 1.5 s
// (VData SlowDuration) and the orb bounces on; the user asked for one pulse per bounce on a head
// (2026-10-23). How it could fail: no pulse on the first hit; a pulse on every heartbeat or countdown
// repaint; a refresh of the same status panel (its radial jumps back to the start) or a second panel
// missed; a radial running the other way read as refreshes; other abilities pulsing; a pulse that
// cannot restart while its class is still on; no pulse when the orb comes back after the status ended.
check("column: Shining Wonder pulses once per orb hit (new panel or radial refresh), nothing else pulses", () => {
  const w = statusWorld();
  const pulses = new Map(); // hero -> pulse starts on its slots
  const watch = (name) => {
    pulses.set(name, 0);
    for (const slot of w.slots(name)) {
      const add = slot.AddClass.bind(slot);
      slot.AddClass = (cls) => {
        if (cls === "OHPulse") pulses.set(name, pulses.get(name) + 1);
        return add(cls);
      };
    }
  };
  for (const name of ["Volt", "Moth", "Kestrel"]) watch(name);
  const DURATION = 1500;
  let voltHit = w.harness.now;
  const forward = (from) => (now) => Math.min(0, -360 + ((now - from()) / DURATION) * 360); // -360 -> 0
  w.giveDebuff("Volt", "ability_unicorn_dazzlingorb", { radial: forward(() => voltHit) });
  w.advance(600);
  deq(w.icons("Volt").length, 1, "Shining Wonder reaches the card");
  assert.equal(pulses.get("Volt"), 1, "the first hit pulses");
  w.advance(500);
  assert.equal(pulses.get("Volt"), 1, "the countdown and its repaints do not pulse");
  voltHit = w.harness.now; // the orb comes back: the same panel's radial restarts
  w.advance(600);
  assert.equal(pulses.get("Volt"), 2, "a refresh pulses once");
  w.giveDebuff("Volt", "ability_unicorn_dazzlingorb", { radial: forward(() => w.harness.now - 100) });
  w.advance(600);
  assert.equal(pulses.get("Volt"), 3, "a second status panel pulses once");
  w.advance(5000); // heartbeats only
  assert.equal(pulses.get("Volt"), 3, "heartbeats do not pulse");
  // A radial that runs from 0 towards -360: its countdown is no refresh, its restart is.
  let mothHit = w.harness.now;
  w.giveDebuff("Moth", "ability_unicorn_dazzlingorb", { radial: (now) => Math.max(-360, -((now - mothHit) / DURATION) * 360) });
  w.advance(1200);
  assert.equal(pulses.get("Moth"), 1, "reversed radial: one hit");
  mothHit = w.harness.now;
  w.advance(600);
  assert.equal(pulses.get("Moth"), 2, "reversed radial: the restart pulses");
  // Another ability's refresh never pulses.
  let petrifyAt = w.harness.now;
  w.giveDebuff("Kestrel", "ability_viper_petrifybola", { radial: (now) => Math.min(0, -360 + ((now - petrifyAt) / 6000) * 360) });
  w.advance(1500);
  petrifyAt = w.harness.now;
  w.advance(1500);
  assert.equal(w.icons("Kestrel").length, 1);
  assert.equal(pulses.get("Kestrel"), 0, "only Shining Wonder pulses");
  // The status ends, the slot fades and frees; the next orb pulses again.
  for (const effect of w.units.Volt.container.children.slice()) effect.DeleteAsync();
  w.advance(2500);
  deq(w.icons("Volt"), []);
  w.giveDebuff("Volt", "ability_unicorn_dazzlingorb", { radial: forward(() => w.harness.now - 100) });
  w.advance(600);
  assert.equal(pulses.get("Volt"), 4, "a new orb after the status ended pulses");
});

check("column: late hero class, recycled bars, HUD lists, forged and stale messages", () => {
  const w = statusWorld();
  // A bar whose CLASS_PLAYER lands 10 s after load (spike: up to ~15 s): seen within 2 s of the class.
  const late = w.addBar("Talon", { hero: false });
  w.giveDebuff("Talon", "ability_viper_petrifybola");
  w.advance(10000);
  deq(w.icons("Talon"), [], "no class, no column");
  late.dialog.AddClass("CLASS_PLAYER");
  w.advance(2100);
  deq(w.icons("Talon"), [PETRIFY], "picked up within the 2 s backoff cap");
  // The unit class on the world panel above the overlay counts too.
  w.addBar("Pocketwatch", { classOn: "root" });
  w.giveDebuff("Pocketwatch", "ability_viper_petrifybola");
  w.advance(2000);
  deq(w.icons("Pocketwatch"), [PETRIFY]);
  // The engine recycles the panel for a trooper: one clearing message, the card empties.
  late.dialog.RemoveClass("CLASS_PLAYER");
  const before = snapshots(w).length;
  w.advance(1000);
  const cleared = snapshots(w).slice(before).map((raw) => JSON.parse(raw));
  assert.ok(cleared.some((msg) => msg.name === "TALON" && msg.items.length === 0), "one clearing message");
  w.advance(1500);
  deq(w.icons("Talon"), []);
  // The HUD's own status lists (two in stock hud.xml) stop at once and keep no listener.
  const hudLists = findAll(w.hud, "CitadelStatusEffect");
  assert.ok(hudLists.length >= 1, "stock hud.xml has its own status lists");
  const listenersBefore = w.bus.length;
  for (const list of hudLists) w.runIn(list, [["oh_debuff_world.js", script("oh_debuff_world.js")]]);
  w.advance(2000);
  assert.equal(w.bus.length, listenersBefore, "HUD lists unregister their listener");
  // Forged, stale and malformed snapshots draw nothing.
  const send = (msg) => { for (const entry of w.bus.slice()) entry.fn(JSON.stringify(msg)); };
  const now = w.harness.now;
  send({ magic_word: "OH_DEBUFF_SNAPSHOT", source: "x", instance: "i", seq: 1, at: now - 60000, name: "MOLE", items: [["ability_viper_petrifybola", 1, 1, 0, 0]] });
  send({ magic_word: "OH_DEBUFF_SNAPSHOT", source: "y", instance: "i", seq: 1, at: now, name: "MOLE", items: [["../../evil", 1, 1, 0, 0]] });
  send({ magic_word: "OH_DEBUFF_SNAPSHOT", source: "z", instance: "i", seq: 1, at: now + 5000, name: "MOLE", items: [["ability_viper_petrifybola", 1, 1, 0, 0]] });
  w.advance(500);
  deq(w.icons("Mole"), []);
});

// Latency floors for the quick-poll world sampler (phase 1 of decisions/postgame-identity-perf-plan.md).
// How it could fail: a status that keeps the child count (a refreshed radial, a stack change) waits for
// the 2 s full sample; a stun or listed status waits for the full sample; a removal lingers; an idle bar
// that becomes a hero (a respawn on another world panel) waits for the slow 4 s cap; bars keep polling
// while the PC plays; spectating starts with sleeping bars.
check("column: latency floors hold with quick polls (onset, stun, removal, stacks, pulse, respawn, playing)", () => {
  const w = statusWorld();
  for (const name of [...AMBER, ...SAPPHIRE]) w.giveDebuff(name, "upgrade_extra_regen", { debuff: false });
  w.advance(35000); // past the 30 s wake window: steady state
  // Milliseconds until cond() holds, in 25 ms steps, at most `limit`.
  const until = (cond, limit) => {
    for (let t = 0; t <= limit; t += 25) {
      if (cond()) return t;
      w.advance(25);
    }
    return Infinity;
  };
  const petrify = w.giveDebuff("Kestrel", "ability_viper_petrifybola");
  const onset = until(() => w.icons("Kestrel").length === 1, 1000);
  assert.ok(onset <= 300, `listed status onset ${onset} ms`);
  w.giveDebuff("Doyle", "ability_viper_petrifybola", { css: "stunned" });
  const stun = until(() => w.shownSlots("Doyle").some((slot) => slot.BHasClass("OHStun")), 1000);
  assert.ok(stun <= 300, `stun onset ${stun} ms`);
  petrify.DeleteAsync();
  const gone = until(() => w.icons("Kestrel").length === 0, 1000);
  assert.ok(gone <= 300, `removal ${gone} ms`);
  // The rest are measured at several phases of the poll cycles and the worst one counts (one lucky
  // phase must not hide a slow path).
  const mark = w.giveDebuff("Moth", "mirage_sand_phantom", { stacks: "5" });
  w.advance(2500); // a full sample has seen the 5-stack panel
  deq(w.icons("Moth"), [], "5 stacks: not yet");
  let stacks = 0;
  for (let phase = 0; phase < 4; phase++) {
    mark.setStacks("5");
    assert.ok(until(() => w.icons("Moth").length === 0, 3000) < Infinity, "below 8 stacks again");
    w.advance(2500 + phase * 130);
    mark.setStacks("8");
    stacks = Math.max(stacks, until(() => w.icons("Moth").length === 1, 3000));
  }
  assert.ok(stacks <= 300, `stack threshold ${stacks} ms (same panel, same count)`);
  // Shining Wonder: a refresh keeps the panel and the count; the pulse must still come within a poll.
  let pulses = 0;
  let hit = w.harness.now;
  w.giveDebuff("Volt", "ability_unicorn_dazzlingorb", { radial: (now) => Math.min(0, -360 + ((now - hit) / 4000) * 360) });
  w.advance(1200);
  for (const slot of w.slots("Volt")) {
    const add = slot.AddClass.bind(slot);
    slot.AddClass = (cls) => { if (cls === "OHPulse") pulses++; return add(cls); };
  }
  let pulse = 0;
  for (let phase = 0; phase < 4; phase++) {
    w.advance(700 + phase * 130);
    const before = pulses;
    hit = w.harness.now;
    pulse = Math.max(pulse, until(() => pulses > before, 3000));
  }
  assert.ok(pulse <= 300, `refresh pulse ${pulse} ms`);
  // A respawn: an idle non-hero bar (past its wake window, on the slow cap) becomes a hero bar while the
  // hero's card loses .Dead; the column wakes the bars.
  const spare = w.addBar("Talon", { hero: false });
  w.giveDebuff("Talon", "ability_viper_petrifybola");
  w.advance(35000);
  const card = w.card("Kestrel");
  let respawn = 0;
  for (let phase = 0; phase < 4; phase++) {
    spare.holder.RemoveClass("CLASS_PLAYER");
    card.AddClass("Dead");
    w.advance(40000 + phase * 1000); // back on the slow cap, at a new phase
    spare.holder.AddClass("CLASS_PLAYER");
    card.RemoveClass("Dead");
    respawn = Math.max(respawn, until(() => w.icons("Talon").length === 1, 6000));
  }
  assert.ok(respawn <= 1600, `respawn pickup ${respawn} ms (column check once a second, then a wake)`);
  // Back to playing: every world bar stops; spectating again wakes them within a column tick.
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.RemoveClass(cls);
  w.advance(2000);
  const polls = w.units.Kestrel.samples.polls + w.units.Talon.samples.polls;
  w.advance(10000);
  assert.equal(w.units.Kestrel.samples.polls + w.units.Talon.samples.polls, polls, "no world polls while playing");
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.AddClass(cls);
  w.giveDebuff("Kestrel", "ability_viper_petrifybola");
  const back = until(() => w.icons("Kestrel").length === 1, 4000);
  assert.ok(back <= 1500, `spectating again: ${back} ms`);
});

check("editor: pages in match-day order; scope by look; stock pill and switch states follow the state", () => {
  const w = world();
  w.bootHost();
  w.advance(2000);
  w.press("OHMenuButton");
  const root = w.menu();
  const pages = ["Match", "Teams", "Players", "TopBar", "Desk", "Timers", "Share"];
  const shown = () => pages.filter((page) => root.BHasClass(`OHShow${page}`));
  deq(shown(), ["Match"], "opens on MATCH");
  assert.ok(w.ui("OHNavMatch").BHasClass("Selected"));
  assert.equal(text(w.ui("OHPageTitle")), "MATCH");
  w.press("OHNavTeams");
  deq(shown(), ["Teams"]);
  deq(pages.map((page) => w.ui(`OHNav${page}`).BHasClass("Selected")), [false, true, false, false, false, false, false]);
  assert.equal(text(w.ui("OHPageTitle")), "TEAMS");
  // The rail names the look; NIGHT DESK reads "off" under Base Game+ Names, its page says why and offers the switch.
  assert.equal(text(w.ui("OHRailLook")), "Look: Base Game+ Names");
  assert.ok(w.ui("OHNavDesk").BHasClass("OHNavOff"));
  assert.equal(text(w.ui("OHLogoSizeNote")), "Base Game+ Names: the plate is the logo + 13 px tall");
  w.press("OHNavDesk");
  assert.equal(text(w.ui("OHPageTitle")), "NIGHT DESK");
  assert.ok(/kept but not shown/.test(text(w.ui("OHStatus"))));
  w.press("OHUseDesk");
  assert.equal(w.state().style, "desk");
  assert.ok(root.BHasClass("OHLookDeskOn") && !w.ui("OHNavDesk").BHasClass("OHNavOff"));
  assert.equal(text(w.ui("OHRailLook")), "Look: Night Desk");
  assert.ok(!/kept but not shown/.test(text(w.ui("OHStatus"))));
  assert.equal(text(w.ui("OHLogoSizeNote")), "Night Desk uses 24-50 px; past 30 the cards spread");
  // MATCH: the format caps the series wins shown beside it; the rows carry the team names.
  w.press("OHNavMatch");
  w.press("OHBo5");
  deq([1, 3, 5, 7].map((n) => w.ui(`OHBo${n}`).BHasClass("fill") && w.ui(`OHBo${n}`).BHasClass("Selected")), [false, false, true, false]);
  deq([text(w.ui("OHFormatNote")), text(w.ui("OHAmberSeriesNote")), text(w.ui("OHAmberSeriesTitle")), text(w.ui("OHSapphireBansTitle"))],
    ["first to 3", "of 3", `${w.state().amber.name} wins`, `${w.state().sapphire.name} bans`]);
  w.press("OHNavTeams");
  w.type("OHAmberNameEntry", "Night Owls");
  assert.equal(text(w.ui("OHAmberSeriesTitle")), "Night Owls wins", "the rows follow the team name");
  // TIMERS: the status column uses the stock switch, Checked while on.
  w.press("OHNavTimers");
  assert.equal(w.ui("OHDebuffToggle").BHasClass("Checked"), true);
  w.press("OHDebuffToggle");
  assert.equal(w.ui("OHDebuffToggle").BHasClass("Checked"), false);
  assert.equal(text(w.ui("OHDebuffToggleLabel")), "OFF");
  // DONE closes; the next open starts on the page left last.
  w.press("OHDone");
  assert.ok(!root.BHasClass("OHOpen"));
  w.press("OHMenuButton");
  deq(shown(), ["Timers"]);
});

check("column: back to playing it idles; a status that ended meanwhile is gone on return, a new one shows", () => {
  const w = statusWorld();
  w.giveDebuff("Volt", "ability_viper_petrifybola", { radial: () => -180 });
  w.advance(3000);
  deq(w.icons("Volt"), [PETRIFY]);
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.RemoveClass(cls);
  w.advance(2000);
  w.units.Volt.container.children[0].DeleteAsync(); // the status ends while not spectating
  w.advance(12000); // past the snapshot TTL
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) w.hud.AddClass(cls);
  w.advance(3000);
  deq(w.icons("Volt"), [], "no stale icon on return");
  assert.equal(w.slots("Volt").filter((slot) => slot.BHasClass("OHShown")).length, 0);
  w.giveDebuff("Volt", "ability_viper_petrifybola", { radial: () => -180 });
  w.advance(2000);
  deq(w.icons("Volt"), [PETRIFY], "a new status shows");
});

check("column: after a hero swap rebuilds a card, its statuses are back within 2 s at every tick phase", () => {
  // m2 review: when the column validated before the host re-injected the card's column, the card was
  // dropped and nothing looked again until the 5 s rescan (5.3-5.5 s at host-tick phases 500-700 ms).
  const late = [];
  for (let phase = 0; phase < 1000; phase += 100) {
    const w = statusWorld();
    w.advance(3000 + phase);
    w.card("Volt").FindChild("OHDebuffsHost").DeleteAsync(); // a swap rebuilds the card's children
    w.giveDebuff("Volt", "ability_viper_petrifybola", { radial: () => -180 });
    let t = 0;
    while (t < 8000 && w.icons("Volt").length === 0) { w.advance(50); t += 50; }
    if (t > 2000) late.push(`${phase} ms: ${t} ms`);
  }
  deq(late, [], "phases whose statuses came back later than 2 s");
});

check("column: the host's card registry drives the column (steady version, re-found labels, late names, paint errors)", () => {
  const until = (w, ms, done) => { let t = 0; while (t < ms && !done()) { w.advance(50); t += 50; } return t; };
  // Steady spectating: the registry neither changes nor churns.
  let w = statusWorld();
  w.advance(3000);
  const host = w.host();
  const version = host.cardsVersion();
  const list = host.cards();
  w.advance(10000);
  assert.equal(host.cardsVersion(), version, "no version churn in steady state");
  assert.equal(host.cards(), list, "the same array while nothing changes");
  deq(list.map((card) => Object.keys(card).filter((key) => key !== "who").sort()), list.map(() => ["debuffs", "label", "panel", "teamKey", "ult", "urn"]));
  // A card whose name label is replaced (same text): the column follows the re-found label.
  const labels = () => w.card("Volt").FindChildrenWithClassTraverse("PlayerName").concat(w.card("Volt").FindChildrenWithClassTraverse("AlwaysPlayerName"));
  const old = labels()[0];
  const parent = old.GetParent();
  for (const label of labels()) label.DeleteAsync();
  const fresh = new MockPanel("Label", { operationCounts: w.harness.operationCounts });
  fresh.AddClass("PlayerName");
  fresh.__text = "Volt";
  fresh.SetParent(parent);
  w.giveDebuff("Volt", "ability_viper_petrifybola", { radial: () => -180 });
  assert.ok(until(w, 4000, () => w.icons("Volt").length > 0) <= 2000, "a re-found label paints within 2 s");
  // A name that binds on known panels after its snapshot arrived: matched within a second.
  w = statusWorld();
  w.advance(3000);
  const voltLabels = w.card("Volt").FindChildrenWithClassTraverse("PlayerName").concat(w.card("Volt").FindChildrenWithClassTraverse("AlwaysPlayerName"));
  for (const label of voltLabels) label.__text = "";
  w.advance(2000);
  w.giveDebuff("Volt", "ability_viper_petrifybola", { radial: () => -180 });
  w.advance(300);
  for (const label of voltLabels) label.__text = "Volt";
  assert.ok(until(w, 4000, () => w.icons("Volt").length > 0) <= 1000, "a late name is matched within a second");
  // A paint that throws once (a card rebuilt between registry changes): painted again within a second.
  w = statusWorld();
  w.advance(3000);
  const icon = w.slots("Volt")[0].FindChildrenWithClassTraverse("OHDebuffIcon")[0];
  const setImage = icon.SetImage;
  let throws = 1;
  icon.SetImage = function (src) {
    if (throws-- > 0) throw new Error("dead panel");
    return setImage.call(this, src);
  };
  w.giveDebuff("Volt", "ability_viper_petrifybola", { radial: () => -180 });
  assert.ok(until(w, 4000, () => w.icons("Volt").length > 0) <= 1500, "a card recovers from a paint error");
});

check("column: the DEV switch and poll reach every world bar; OFF stops publishing and clears the cards", () => {
  const w = statusWorld();
  w.giveDebuff("Geist", "ability_viper_petrifybola");
  w.advance(2000);
  deq(w.icons("Geist"), [PETRIFY]);
  w.press("OHMenuButton");
  w.press("OHNavTimers");
  w.press("OHDebuffToggle");
  w.advance(1500);
  deq(w.icons("Geist"), []);
  const scans = w.units.Geist.samples.polls;
  w.advance(5000);
  assert.equal(w.units.Geist.samples.polls, scans, "OFF: no scans");
  w.press("OHDebuffToggle");
  w.press("OHPollUp"); // 250 -> 500 ms
  w.advance(2000);
  deq(w.icons("Geist"), [PETRIFY]);
  const a = w.units.Geist.samples.polls;
  w.advance(10000);
  const rate = w.units.Geist.samples.polls - a;
  assert.ok(rate >= 18 && rate <= 22, `0.5 s poll: ${rate} polls in 10 s`);
});

check("column: world bars poll every 250 ms by default and refuse a poll outside 100-2000 ms", () => {
  const w = statusWorld();
  w.giveDebuff("Geist", "ability_viper_petrifybola");
  w.advance(2000);
  const polls = (ms) => { const a = w.units.Geist.samples.polls; w.advance(ms); return w.units.Geist.samples.polls - a; };
  const base = polls(10000);
  assert.ok(base >= 38 && base <= 42, `the default is 0.25 s: ${base} polls in 10 s`);
  const send = (msg) => { for (const entry of w.bus.slice()) entry.fn(JSON.stringify(msg)); };
  for (const poll of [99, 2001, 250.5]) {
    send({ magic_word: "OH_DEBUFF_CONFIG", on: true, poll, log: false, watch: true, wake: 0, aliases: {} });
    const rate = polls(10000);
    assert.ok(rate >= 38 && rate <= 42, `a ${poll} ms poll is refused: ${rate} polls in 10 s`);
  }
});

// ---------------------------------------------------------------- native cost metric

let lastNodes = 0; // subtree node visits of the last counted window
// Counts every crossing the scripts make, including the ones the shared adapter books only as
// "traversal" (GetChildCount) and the child wrappers Children() allocates (live P0: about 140 ns each).
// OH_ATTRIB=1 prints the weighted cost per script function for each counted window (dev aid). Known
// limit (m3 audit O2, 2026-11-03): reads the adapter makes inside a mock GetPositionWithinWindow are booked
// to the caller as well, so geometry readers are inflated (host rect shows 36.3 us/s; about 13.8 is
// real). The scenario totals and budgets are not affected.
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
  board: parseLayout(read("panorama/layout/observer_hud/pg_board.xml")),
  column: parseLayout(read("panorama/layout/observer_hud/pg_column.xml"))
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
function boardWorld({ visible = true, disk = null, offline = false, graph = null, names = true } = {}) {
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
    if (file === "file://{resources}/layout/observer_hud/pg_board.xml") {
      loadInto(this, PG.board);
      // pg_board.xml includes oh_state.js (cards are cleaned with its helpers) before pg_board.js.
      runIn(this, [["oh_state.js", script("oh_state.js")], ["pg_board.js", script("pg_board.js")]]);
      return true;
    }
    if (file === "file://{resources}/layout/observer_hud/pg_column.xml") {
      loadInto(this, PG.column);
      return true;
    }
    return false;
  };
  const dash = new MockPanel("CitadelDashboardRoot", { operationCounts: harness.operationCounts, findCounts: harness.findCounts,
    childReadCounts: harness.childReadCounts, eventSetCounter: harness.eventSetCounter });
  WORLDS.push(dash);
  // The dashboard's hidden CitadelHTMLPanel loads the https store page like the HUD's (live P7).
  dash.__web = { disk: disk || {}, offline, harness, release() { const held = this.held || []; this.held = []; for (const fn of held) fn(); } };
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
    scanning = harness.logs.some((l) => l.startsWith("[NS] board shown")) && !harness.logs.some((l) => l.startsWith("[NS] scan done"));
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
  const shown = () => harness.logs.filter((line) => line.startsWith("[NS] board shown")).length;
  const columns = () => findAll(scoreboard, "Panel").filter((p) => p.valid && (p.classes.has("NSColumnTeam1") || p.classes.has("NSColumnTeam2")));
  return { harness, page, scoreboard, bus, fill, fire, selectScreen, boardHost, shown, columns, tipLog,
    tip: () => tip, tipDrawn, copy,
    // The player's own mouse on graph column c, and leaving it: the stock column events.
    userHover: (c) => showTip(graphCanvas.children[c]),
    userLeave: () => { if (tip) tip.classes.delete("TooltipVisible"); },
    boot: () => runIn(page, [["pg_loader.js", script("pg_loader.js")]]),
    reload: () => runIn(boardHost(), [["oh_state.js", script("oh_state.js")], ["pg_board.js", script("pg_board.js")]]),
    web: dash.__web, dash,
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
  assert.ok(w.harness.logs.some((l) => l.startsWith("[NS] scan done")), "scan finished");
  const series = w.harness.logs.filter((l) => l.startsWith("[NS] data series + "));
  assert.ok(series.length >= 30, `lead points: ${series.length}`);
  // Each team's own line: the last point is each team's own total (rows named for the wrong team would
  // turn every lead around).
  const last = JSON.parse(series[series.length - 1].slice("[NS] data series + ".length));
  assert.ok(Math.abs(last.a - totals[0]) <= 1 && Math.abs(last.b - totals[1]) <= 1, `the last point is the totals: ${JSON.stringify(last)} vs ${totals}`);
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

check("board: the Play Again flame is put back even when the board cannot load", () => {
  const w = boardWorld();
  const fx = w.page.FindChildTraverse("PlayButtonFX");
  assert.ok(fx, "the page has #PlayButtonFX");
  const movies = [];
  fx.SetMovie = (src) => movies.push(src);
  fx.Play = () => movies.push("play");
  const load = MockPanel.prototype.BLoadLayout;
  MockPanel.prototype.BLoadLayout = () => false; // the board layout fails to load
  try {
    w.boot();
    w.advance(1000);
  } finally {
    MockPanel.prototype.BLoadLayout = load;
  }
  deq(movies, ["file://{resources}/videos/pick_screen/play_btn_grn_flame.webm", "play"], "the flame plays");
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

// User 2026-11-06 (one private lobby, game after game): souls by source, the lead graph and the destroyed
// objectives showed for the first game only. The rows are reused and can be the next game's before the
// stock Graphs data is. How it fails: the board scans once at once and settles on an empty or stale graph
// (no lead, nothing by source, the last game's objectives), and never looks again.
check("board: the next game in the same lobby waits for its own graph; the last game's graph is never drawn", () => {
  const a = pgMatch(121917141);
  const b = pgMatch(121880956, { swap: true, win: 2 });
  // Another game: other souls (thousands apart, as real games are) and another length.
  b.teams[0].forEach((p, k) => { p.net_worth += 2500 + 300 * k; });
  b.minutes = 26;
  const sum = (m) => m.teams.map((team) => team.reduce((s, p) => s + p.net_worth, 0));
  const graph = { duration: a.minutes * 60 + a.seconds, souls: sum(a), lanes: [[[300, -1], [-1, -1], [-1, -1]]] };
  const w = boardWorld({ graph });
  const done = () => w.harness.logs.filter((l) => l.startsWith("[NS] scan done"));
  const eventTimes = (from) => w.harness.logs.slice(from).filter((l) => l.startsWith("[NS] data events + "))
    .map((l) => JSON.parse(l.slice("[NS] data events + ".length)).t);
  w.boot();
  w.fill(a);
  w.fire("CitadelMatchDetailsUpdated", a.id);
  w.advance(30000);
  assert.equal(done().length, 1);
  assert.match(done()[0], /: [1-9]\d* lead points, .* [1-9]\d* objectives$/, "game 1 read");
  // Game 2: its rows, but the Graphs data is still game 1's for a few seconds.
  const from = w.harness.logs.length;
  w.fill(b);
  w.fire("CitadelMatchDetailsUpdated", b.id);
  w.advance(4000);
  assert.equal(w.text("NSMatch"), `MATCH ${b.id}`, "the rows are game 2's");
  assert.equal(done().length, 1, "no scan settled on game 1's graph");
  assert.ok(w.harness.logs.some((l) => l.includes("the graph is not this match's yet")), "it waits");
  graph.duration = b.minutes * 60 + b.seconds;
  graph.souls = sum(b);
  graph.lanes = [[[400, 900], [-1, -1], [-1, -1]]];
  w.advance(30000);
  assert.equal(done().length, 2, "read once game 2's graph is there");
  assert.match(done()[1], /: [1-9]\d* lead points, .* [1-9]\d* objectives$/, "game 2's lead and objectives");
  const times = eventTimes(from);
  assert.ok(times.includes(400) && times.includes(900) && !times.includes(300), `game 2's objectives only (${times})`);
  assert.ok(w.boardHost().FindChildTraverse("NSGraph").BHasClass("NSOn"), "lead graph shown");
});

check("board: a graph that never becomes this match's gives no lead, no objectives and no souls by source", () => {
  const a = pgMatch(121917141);
  const b = pgMatch(121880956, { swap: true, win: 2 });
  b.teams[0].forEach((p, k) => { p.net_worth += 2500 + 300 * k; });
  // The same length as game 1: the stale graph's last column sits at game 2's end time.
  b.minutes = a.minutes;
  b.seconds = a.seconds;
  const sum = (m) => m.teams.map((team) => team.reduce((s, p) => s + p.net_worth, 0));
  const w = boardWorld({ graph: { duration: a.minutes * 60 + a.seconds, souls: sum(a), lanes: [[[300, -1], [-1, -1], [-1, -1]]] } });
  const done = () => w.harness.logs.filter((l) => l.startsWith("[NS] scan done"));
  w.boot();
  w.fill(a);
  w.fire("CitadelMatchDetailsUpdated", a.id);
  w.advance(30000);
  assert.equal(done().length, 1);
  w.fill(b);
  w.fire("CitadelMatchDetailsUpdated", b.id);
  w.advance(120000);
  assert.equal(done().length, 2, "the retries ran out and the scan settled");
  assert.match(done()[1], /: 0 lead points, 0 souls, 0 lanes, 0 objectives$/, `nothing of game 1 is shown for game 2: ${done()[1]}`);
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
  // A reload with a board up: the old run's columns go with it, the new run builds its own.
  const columns = w.columns().length;
  assert.ok(columns > 0);
  w.reload();
  w.advance(6000);
  assert.equal(w.columns().length, columns, "one set of columns after a reload");
});

// ---------------------------------------------------------------- phase 4: match cards and store v2
// Plan phase 4 (decisions 4-5). The HUD builds a match card (the accounts of each side and the team
// snapshot) once both sides are known and again at match end; it reaches the board in the same process as
// "OHM1:<json>" on ClientUI_FireOutput (live P3) and goes to the store page's matches key for later. The
// board matches a card to its 12 accounts (at least 10 shared), asks the store only when no handed card
// fits, and swaps its header. Store v2 (hpv2-store oh/v2/) keeps `state` and `matches` under its own keys
// and never touches v1's, so released paks keep working.
// How it could fail: a replied page longer than the game's 4096-character title cap reads back cut; a
// state bigger than that is lost on a restart; v2 writes v1's key (or the reverse); two writers lose a
// card; the cap drops the newest card or keeps dead teams; a card with 9 of 12 accounts names the wrong
// teams; a forged or stale handoff renames the board; a late store reply names the next match; an offline
// store stalls the board or the HUD; a custom logo hides the wordmark before it loaded (or after it failed);
// the card is written while a side is unknown, or never again at match end.
const V2 = "hantu.observer_hud.v2/";
// One request run against a page script in its own sandbox (a second panel); returns the parsed reply.
function pageCall(pageSource, disk, request, prefix = "OHS2:", nowMs = PAGE_NOW) {
  let title = "";
  const sandbox = {
    window: { addEventListener() {} },
    location: { hash: `#${encodeURIComponent(JSON.stringify(request))}`, href: "https://example.test/" },
    document: { set title(value) { title = value; }, get title() { return title; } },
    localStorage: { getItem: (key) => (Object.prototype.hasOwnProperty.call(disk, key) ? disk[key] : null),
      setItem: (key, value) => { disk[key] = String(value); }, removeItem: (key) => { delete disk[key]; } },
    JSON, Math, Error, String, decodeURIComponent, Date: clockDate(() => nowMs)
  };
  vm.runInNewContext(pageSource, sandbox);
  assert.ok(title.length <= 4096, `a reply fits the game's title cap (${title.length})`);
  assert.ok(title.startsWith(prefix), `reply prefix ${prefix}`);
  return JSON.parse(title.slice(prefix.length));
}
const ids = (base, n = 6) => Array.from({ length: n }, (_, i) => base + i);
const card = (base, over = {}) => Object.assign({ a: ids(base), b: ids(base + 100), t: [["Night Owls", "NOW", "https://img.test/a.png"], ["Brass Saints", "BRS", ""]],
  r: ["Community Cup", ""], w: 0, id: "", at: 1000 }, over);
const matchesOf = (disk) => (disk[`${V2}matches`] ? JSON.parse(disk[`${V2}matches`]) : null);
const sentCards = (w) => w.sent.filter((raw) => raw.startsWith("OHM1:")).map((raw) => JSON.parse(raw.slice(5)));

check("store v2: the page keeps cards deduped, merges two writers, caps at 32 KB oldest first, answers one card under the title cap", () => {
  assert.ok(storeScript, `store v2 page source at ${STORE_PAGE}`);
  const disk = {};
  const up = (c) => pageCall(storeScript, disk, { i: "u", o: "u", c });
  assert.equal(pageCall(storeScript, disk, { i: "h", o: "hello" }).v, 2);
  assert.equal(up(card(1000)).n, 1);
  // The same team in a second match is stored once; a card for the same 12 accounts replaces the first.
  assert.equal(up(card(2000, { w: 1 })).n, 2);
  assert.equal(up(card(1000, { w: 2, at: 1500 })).n, 2, "the same 12 accounts: replaced, not added");
  let data = matchesOf(disk);
  assert.equal(data.m.length, 2);
  assert.equal(data.T.length, 3, "Night Owls, Brass Saints and Community Cup, once each");
  deq(data.m[1].w, 2, "the newer card won");
  // Two panels at once: each handler reads, merges and writes in one go, so both cards stay.
  up(card(3000));
  up(card(4000));
  assert.equal(matchesOf(disk).m.length, 4);
  // A query: 10 of 12 accounts find the card, 9 do not; the reply names the teams.
  const ask = (accounts, extra = {}) => pageCall(storeScript, disk, Object.assign({ i: "q", o: "q", a: accounts }, extra));
  const ten = ids(3000, 6).concat(ids(3100, 4)).concat([777, 778]);
  const hit = ask(ten);
  assert.equal(hit.x, 1);
  deq(hit.c.t[0], ["Night Owls", "NOW", "https://img.test/a.png"]);
  const nine = ids(3000, 6).concat(ids(3100, 3)).concat([777, 778, 779]);
  assert.equal(ask(nine).x, 0, "9 of 12 is not a match");
  // The worst card still answers under the cap (3 URLs of 512 characters, 28/4/24-character names).
  const long = `https://img.test/${"p".repeat(495)}`;
  assert.equal(long.length, 512);
  up(card(5000, { t: [["N".repeat(28), "ABCD", long], ["M".repeat(28), "WXYZ", long]], r: ["O".repeat(24), long] }));
  const worst = ask(ids(5000, 6).concat(ids(5100, 6)));
  assert.equal(worst.x, 1);
  // A card for one match id answers only that match; an id-less card answers any.
  up(card(6000, { id: "121880956", at: 2000 }));
  assert.equal(ask(ids(6000, 6).concat(ids(6100, 6)), { id: "121917141" }).x, 0, "another match's own card");
  assert.equal(ask(ids(6000, 6).concat(ids(6100, 6)), { id: "121880956" }).x, 1);
  assert.equal(ask(ids(6000, 6).concat(ids(6100, 6))).x, 0, "no id asked: a card with an id is not used");
  up(card(6000, { id: "", at: 2500, t: [["Fallback", "FB", ""], ["Other", "", ""]] }));
  assert.equal(ask(ids(6000, 6).concat(ids(6100, 6)), { id: "121880956" }).c.t[0][0], "Night Owls", "the card written for that match wins");
  assert.equal(ask(ids(6000, 6).concat(ids(6100, 6)), { id: "121700000" }).c.t[0][0], "Fallback", "other matches use the id-less card");
  // Forged shapes are refused, not stored.
  for (const bad of [null, "x", { a: [1], b: [] , t: []}, card(7000, { a: ids(7000, 7) }), card(7000, { a: ["x", 2, 3, 4, 5, 6] }), card(7000, { a: [7000, 7001, 7002, 7003, 7004, 7005], b: [7005, 7101, 7102, 7103, 7104, 7105] }),
    card(7000, { t: [["x"], ["y", "z"]] }), card(7000, { a: [0, 2, 3, 4, 5, 6] }), card(7000, { a: [4294967296, 2, 3, 4, 5, 6] })]) {
    assert.equal(up(bad).ok, false, `refused ${JSON.stringify(bad).slice(0, 40)}`);
  }
  // Bad text inside a good card is dropped to the stock name: a hostile URL never gets stored.
  up(card(8000, { t: [["x".repeat(29), "tooLongTag", "javascript:alert(1)"], ["Ok", "", "http://a b"]], r: ["", "ftp://x"] }));
  const stored = ask(ids(8000, 6).concat(ids(8100, 6))).c;
  deq(stored.t, [["", "", ""], ["Ok", "", ""]]);
  assert.equal(stored.r, 0);
  // The cap: the oldest cards go first, then teams no card uses; the newest card is always kept.
  for (let i = 0; i < 300; i++) up(card(100000 + i * 20, { t: [[`Team ${i}`, "", long], [`Other ${i}`, "", long]], at: 3000 + i }));
  data = matchesOf(disk);
  assert.ok(disk[`${V2}matches`].length <= 32768, `matches key ${disk[`${V2}matches`].length} chars`);
  assert.ok(data.m.length > 20 && data.m.length < 300, `${data.m.length} cards kept`);
  const last = ask(ids(100000 + 299 * 20, 6).concat(ids(100000 + 299 * 20 + 100, 6)));
  assert.equal(last.x, 1, "the newest card stays");
  assert.equal(ask(ids(1000, 6).concat(ids(1100, 6))).x, 0, "the oldest are gone");
  const used = new Set();
  for (const m of data.m) { used.add(m.t[0]); used.add(m.t[1]); if (m.o >= 0) used.add(m.o); }
  assert.equal(used.size, data.T.length, "no team without a card is kept");
  assert.ok(data.T.length < 2 + 2 * data.m.length, "and every shared team is listed once");
});

check("store v2: the setup saves under the v2 key and reads back in pieces; v1's record is read once to migrate and never written; the v1 page still works", () => {
  const S = stateApiOf();
  const disk = {};
  const many = {};
  const legacy = {};
  for (let i = 1; i <= 24; i++) {
    many[String(2000000 + i)] = { a: `alias ${i}${"x".repeat(10)}`, n: `in-game name ${i}${"y".repeat(10)}` };
    legacy[`old name ${i}${"z".repeat(12)}`] = `legacy alias ${i}`;
  }
  const bigUrl = (c) => `https://img.test/${c.repeat(490)}`;
  const big = S.normalize({ event: "Big Cup", amber: { name: "A", logo: { url: bigUrl("a") } }, sapphire: { name: "B", logo: { url: bigUrl("b") } },
    org: { name: "O", logo: { url: bigUrl("o") } }, players: many, legacy });
  const body = JSON.stringify({ s: 1, state: big });
  const record = `OHS1.${S.checksum(body)}.${body}`;
  assert.ok(record.length > 4200 && record.length <= 8192, `record ${record.length} chars (over the 4096 title cap)`);
  // The v2 page hands it out in pieces that each fit the cap.
  disk[`${V2}state`] = record;
  let got = "";
  for (let round = 0; round < 12; round++) {
    const reply = pageCall(storeScript, disk, { i: `r${round}`, o: "r", s: got.length });
    assert.equal(reply.ok, true);
    assert.equal(reply.n, record.length);
    assert.equal(reply.s, got.length);
    got += reply.v;
    if (got.length >= reply.n) break;
  }
  assert.equal(got, record, "pieces add up to the record");
  // The pak adopts it after a restart.
  const b = world({ disk });
  b.bootHost();
  b.advance(4000);
  deq(b.state().players, big.players);
  deq(b.state().legacy, big.legacy);
  assert.equal(b.state().amber.logo.url, big.amber.logo.url);
  assert.equal(b.state().org.logo.url, big.org.logo.url);
  assert.equal(text(b.ui("OHSaveStatus")), "SAVED");
  // v1 only: read once, written under v2 on the next save, the v1 key left byte for byte.
  const v1Body = JSON.stringify({ s: 1, state: { event: "Old Cup", aliases: { Kestrel: "Kes" } } });
  const v1Record = `OHS1.${S.checksum(v1Body)}.${v1Body}`;
  const old = { "hantu.observer_hud.v1/state": v1Record };
  const c = world({ disk: old });
  c.bootHost();
  c.advance(4000);
  assert.equal(c.state().event, "Old Cup", "a v1 record migrates");
  deq(c.state().legacy, { Kestrel: "Kes" });
  c.press("OHMenuButton");
  c.type("OHEventEntry", "New Cup");
  c.advance(4000);
  assert.ok(old[`${V2}state`] && old[`${V2}state`].includes("New Cup"), "the save goes to the v2 key");
  assert.equal(old["hantu.observer_hud.v1/state"], v1Record, "v1's record is never written by v2");
  // The v1 page is untouched and keeps working beside v2: its hello says version 1, it reads its own record
  // and a v1 write leaves every v2 key alone.
  assert.ok(v1Script, `v1 page source at ${V1_PAGE}`);
  const hello = pageCall(v1Script, old, { i: "h", o: "hello" }, "OHS1:");
  assert.equal(hello.v, 1);
  assert.equal(pageCall(v1Script, old, { i: "r", o: "r" }, "OHS1:").v, v1Record);
  const before = JSON.stringify([old[`${V2}state`], old[`${V2}matches`]]);
  const newer = JSON.stringify({ s: 1, state: { event: "Written by v1" } });
  assert.equal(pageCall(v1Script, old, { i: "w", o: "w", v: `OHS1.${S.checksum(newer)}.${newer}` }, "OHS1:").ok, true);
  assert.equal(JSON.stringify([old[`${V2}state`], old[`${V2}matches`]]), before, "a v1 write leaves the v2 keys alone");
});

check("match card: written when both sides are known and again at match end, handed to the board; nothing while a side is unknown; offline is quiet", () => {
  // A fresh install shows the sample teams (SPEC "Sample defaults"); a card with only those has nothing to show.
  const fresh = world({ disk: {} });
  fresh.bootHost();
  markAll(fresh);
  fresh.advance(15000);
  deq(sentCards(fresh), [], "untouched sample names make no card");
  const disk = {};
  const w = world({ disk });
  w.bootHost();
  w.advance(2000);
  w.press("OHMenuButton");
  w.type("OHAmberNameEntry", "Owl Squad");
  w.type("OHAmberTagEntry", "now");
  w.type("OHSapphireNameEntry", "Saint Squad");
  w.type("OHAmberLogoEntry", "https://img.test/a.png", { submit: true });
  w.type("OHOrgEntry", "Cup Org");
  w.advance(3000);
  const marks = {};
  for (const p of [...AMBER.slice(0, 5), ...SAPPHIRE.slice(0, 4)]) marks[p] = w.marker(p, { account: ACCOUNT_OF(p) });
  w.advance(12000);
  deq(sentCards(w), [], "9 accounts: not both sides known");
  assert.equal(matchesOf(disk), null);
  marks[SAPPHIRE[4]] = w.marker(SAPPHIRE[4], { account: ACCOUNT_OF(SAPPHIRE[4]) });
  w.advance(3500);
  const cards = sentCards(w);
  assert.ok(cards.length >= 1, "a card once 5 + 5 accounts are known");
  const first = cards[0];
  deq([first.a.slice().sort(), first.b.slice().sort()], [AMBER.slice(0, 5).map(ACCOUNT_OF).sort(), SAPPHIRE.slice(0, 5).map(ACCOUNT_OF).sort()], "the accounts by side");
  deq(first.t, [["Owl Squad", "NOW", "https://img.test/a.png"], ["Saint Squad", "BRS", ""]]);
  deq([first.r, first.w, first.id], [["Cup Org", ""], 0, ""]);
  assert.equal(matchesOf(disk).m.length, 1, "and in the store");
  // The board may load later than the card: it is sent again every few seconds (same card).
  w.advance(12000);
  const again = sentCards(w);
  assert.ok(again.length >= cards.length + 2 && again.every((c) => JSON.stringify(c) === JSON.stringify(again[0])), `resent: ${again.length}`);
  // More accounts arrive: the card grows (the store replaces it: same match).
  marks[AMBER[5]] = w.marker(AMBER[5], { account: ACCOUNT_OF(AMBER[5]) });
  marks[SAPPHIRE[5]] = w.marker(SAPPHIRE[5], { account: ACCOUNT_OF(SAPPHIRE[5]) });
  w.advance(3500);
  const grown = sentCards(w).pop();
  assert.equal(grown.a.length + grown.b.length, 12);
  assert.equal(matchesOf(disk).m.length, 1, "replaced, not added");
  // A team changed while the match is live is sent at once (user 2026-10-26: the logo set during the match
  // must reach the post-game header), and the store keeps the one card for these players.
  w.type("OHAmberNameEntry", "Renamed");
  w.advance(3500);
  assert.equal(sentCards(w).pop().t[0][0], "Renamed", "a live rename is sent");
  assert.equal(matchesOf(disk).m.length, 1, "still one card");
  assert.equal(matchesOf(disk).T[matchesOf(disk).m[0].t[0]][0], "Renamed", "and stored");
  // Match end: the winner and the snapshot as it is then, written again.
  const end = w.hud.FindChildTraverse("MatchEnd");
  const show = (...classes) => {
    for (const cls of ["ShowMatchEnd", "MatchFinished", "MatchAbandoned", "Team1Victory", "Team2Victory"]) end.RemoveClass(cls);
    for (const cls of classes) end.AddClass(cls);
  };
  show();
  w.advance(1100);
  show("ShowMatchEnd", "MatchFinished", "Team2Victory");
  w.advance(3500);
  const last = sentCards(w).pop();
  deq([last.w, last.t[0][0]], [2, "Renamed"], "winner and the names at match end");
  // After match end the card is that match's: setting up the next match's teams does not rename it.
  w.type("OHAmberNameEntry", "Next Match Team");
  w.advance(12000);
  deq([sentCards(w).pop().t[0][0], sentCards(w).pop().w], ["Renamed", 2], "the ended match keeps its teams");
  const stored = matchesOf(disk);
  assert.equal(stored.m.length, 1);
  assert.equal(stored.m[0].w, 2);
  // The next map: a new roster, a new card; the old one is no longer sent, and a stale end screen adds no winner.
  for (const m of Object.values(marks)) m.DeleteAsync();
  w.bar().DeleteAsync();
  w.advance(1100);
  const second = {};
  for (const p of [...AMBER, ...SAPPHIRE]) second[p] = w.marker(p, { account: ACCOUNT_OF(p) + 5000 });
  w.advance(3500);
  const next = sentCards(w).pop();
  assert.ok(next.a.every((id) => id > 5000) && next.w === 0, "the new map's own card, with no winner yet");
  const mark = w.sent.length;
  w.advance(12000);
  assert.ok(w.sent.slice(mark).filter((raw) => raw.startsWith("OHM1:")).every((raw) => JSON.parse(raw.slice(5)).a.every((id) => id > 5000)), "only the new card is sent");
  assert.equal(matchesOf(disk).m.length, 2);
  // An offline store: the handoff still goes, nothing throws, nothing is stored.
  const off = world({ offline: true });
  off.bootHost();
  off.advance(2000);
  for (const p of [...AMBER, ...SAPPHIRE]) off.marker(p, { account: ACCOUNT_OF(p) });
  off.advance(20000);
  assert.ok(sentCards(off).length >= 2, "the board still gets its card");
  assert.ok(!off.harness.logs.some((line) => /failed|error/i.test(line) && !/logo/.test(line)), "an unreachable store is no error");
});

const boardCard = (m, over = {}) => Object.assign({ a: m.teams[0].map((p) => Number(p.account)), b: m.teams[1].map((p) => Number(p.account)),
  t: [["Night Owls", "NOW", ""], ["Brass Saints", "BRS", ""]], r: ["Community Cup", ""], w: 0, id: "", at: 2000 }, over);
const handoff = (c) => `OHM1:${JSON.stringify(c)}`;
const present = (w, m) => { w.fill(m); w.fire("CitadelMatchDetailsUpdated", m.id); w.advance(300); };
const noBoardErrors = (w) => !w.harness.logs.some((line) => /tick failed|handoff failed|card failed/i.test(line));

check("board: a handed card names the header by at least 10 of 12 accounts (either side up); forged and stale handoffs change nothing", () => {
  const w = boardWorld();
  const a = pgMatch(121917141);
  w.fire("ClientUI_FireOutput", handoff(boardCard(a))); // before the board exists: nobody listens
  w.boot();
  w.advance(2000);
  present(w, a);
  deq([w.text("NSTeamName1"), w.text("NSTeamName2"), w.text("NSOrgText")], ["Hidden King", "Archmother", ""], "stock names first");
  // The HUD sends the card again every few seconds: the header swaps when it lands.
  const nine = boardCard(a, { b: boardCard(a).b.slice(0, 3).concat([1, 2, 3]), a: boardCard(a).a.slice(0, 3).concat([4, 5, 6]) });
  w.fire("ClientUI_FireOutput", handoff(nine));
  w.advance(300);
  assert.equal(w.text("NSTeamName1"), "Hidden King", "6 + 6 of the accounts are foreign here: 6 shared is not a match");
  const eight = boardCard(a, { a: boardCard(a).a.slice(0, 5).concat([7]), b: boardCard(a).b.slice(0, 5).concat([8]), at: 2100 });
  w.fire("ClientUI_FireOutput", handoff(eight));
  w.advance(300);
  assert.equal(w.text("NSTeamName1"), "Night Owls", "10 of 12 shared: a match");
  deq([w.text("NSTeamName2"), w.text("NSOrgText")], ["Brass Saints", "Community Cup"]);
  const nineShared = boardCard(a, { a: boardCard(a).a.slice(0, 3).concat([71, 72, 73]), b: boardCard(a).b, t: [["Nine", "", ""], ["Nines", "", ""]], at: 2200 });
  w.fire("ClientUI_FireOutput", handoff(nineShared));
  w.advance(300);
  assert.equal(w.text("NSTeamName1"), "Night Owls", "9 of 12 shared is not a match: the card is ignored");
  // The roster decides the side, not the card's order: the card's Amber team sits on board side 2.
  const swapped = boardCard(a, { a: boardCard(a).b, b: boardCard(a).a, at: 2300 });
  w.fire("ClientUI_FireOutput", handoff(swapped));
  w.advance(300);
  deq([w.text("NSTeamName1"), w.text("NSTeamName2")], ["Brass Saints", "Night Owls"], "teams follow their players");
  // Stale and newer: the newest card for a roster wins.
  w.fire("ClientUI_FireOutput", handoff(boardCard(a, { t: [["Older", "", ""], ["Older B", "", ""]], at: 1000 })));
  w.advance(300);
  assert.equal(w.text("NSTeamName1"), "Brass Saints", "an older card does not replace a newer one");
  w.fire("ClientUI_FireOutput", handoff(boardCard(a, { t: [["Newest", "", ""], ["Newest B", "", ""]], at: 9000 })));
  w.advance(300);
  deq([w.text("NSTeamName1"), w.text("NSTeamName2")], ["Newest", "Newest B"]);
  // Another match on the same rows: unrelated accounts, so the stock names come back.
  const b = pgMatch(121880956, { swap: true, win: 2 });
  present(w, b);
  assert.equal(w.text("NSTeamName1"), "Hidden King", "no card for this roster");
  deq(w.text("NSOrgText"), "");
  // Forged or broken handoffs: nothing changes, nothing throws.
  const good = boardCard(b, { t: [["Forged", "", ""], ["Forged B", "", ""]] });
  const forged = [
    "garbage", "OHM1:", "OHM1:{not json", `OHM1:${JSON.stringify([1, 2, 3])}`, `OHM1:${JSON.stringify(Object.assign({}, good, { a: ["x", 2, 3, 4, 5, 6] }))}`,
    `OHM1:${JSON.stringify(Object.assign({}, good, { a: good.a.concat([99]) }))}`, `OHM1:${JSON.stringify(Object.assign({}, good, { b: good.a }))}`,
    `OHM1:${JSON.stringify(Object.assign({}, good, { t: [["only one"]] }))}`, `OHM1:${JSON.stringify(Object.assign({}, good, { a: [0, 2, 3, 4, 5, 6] }))}`,
    `OHM1:${"x".repeat(100000)}`, `OHM1:${JSON.stringify(Object.assign({}, good, { pad: "y".repeat(5000) }))}`, 42, undefined, null, { a: 1 }
  ];
  for (const raw of forged) w.fire("ClientUI_FireOutput", raw);
  w.advance(300);
  assert.equal(w.text("NSTeamName1"), "Hidden King", "forged handoffs are ignored");
  assert.ok(noBoardErrors(w), "and raise no error");
  // Names that are too long or a hostile logo URL inside an otherwise valid card fall back to the stock text.
  w.fire("ClientUI_FireOutput", handoff(boardCard(b, { t: [["N".repeat(29), "X", "javascript:alert(1)"], ["Fine", "", ""]], at: 3000 })));
  w.advance(300);
  deq([w.text("NSTeamName1"), w.text("NSTeamName2")], ["Hidden King", "Fine"], "a too-long name is dropped, not cut");
  assert.equal(w.boardHost().FindChildTraverse("NSLogo1").Children().filter((p) => p.paneltype === "Image").length, 0, "no image for a hostile URL");
  assert.ok(noBoardErrors(w));
});

check("board: a custom logo replaces the wordmark only once loaded and falls back to it when it fails", () => {
  const w = boardWorld();
  w.boot();
  w.advance(2000);
  const a = pgMatch(121917141);
  present(w, a);
  const logo = () => w.boardHost().FindChildTraverse("NSLogo1");
  const images = () => logo().Children().filter((p) => p.paneltype === "Image" && p.valid);
  w.fire("ClientUI_FireOutput", handoff(boardCard(a, { t: [["Night Owls", "NOW", "https://img.test/a.png"], ["Brass Saints", "BRS", ""]] })));
  w.advance(300);
  assert.equal(images().length, 1, "one image for the logo URL");
  assert.equal(images()[0].src, "https://img.test/a.png");
  assert.ok(!logo().BHasClass("NSLogoCustom"), "the wordmark stays until the image loaded");
  assert.equal(w.boardHost().FindChildTraverse("NSLogo2").Children().filter((p) => p.paneltype === "Image").length, 0, "no URL, no image");
  images()[0].__handlers.ImageLoaded[0]();
  assert.ok(logo().BHasClass("NSLogoCustom"), "swapped on ImageLoaded");
  // The card is sent again: the same logo is not loaded twice.
  const image = images()[0];
  w.fire("ClientUI_FireOutput", handoff(boardCard(a, { t: [["Night Owls", "NOW", "https://img.test/a.png"], ["Brass Saints", "BRS", ""]] })));
  w.advance(300);
  assert.equal(images().length, 1);
  assert.strictEqual(images()[0], image, "same image, no reload");
  // A failing logo: an imgur page link tries its GIF, then its PNG; both failing keeps the wordmark.
  const b = pgMatch(121880956, { swap: true });
  present(w, b);
  assert.ok(!logo().BHasClass("NSLogoCustom"), "the next match starts with the wordmark");
  w.fire("ClientUI_FireOutput", handoff(boardCard(b, { t: [["B1", "", "https://imgur.com/AbCdEfG"], ["B2", "", ""]] })));
  w.advance(300);
  assert.equal(images()[0].src, "https://i.imgur.com/AbCdEfG.gif");
  images()[0].__handlers.ImageFailedLoad[0]();
  assert.equal(images().length, 1);
  assert.equal(images()[0].src, "https://i.imgur.com/AbCdEfG.png", "the next source");
  images()[0].__handlers.ImageFailedLoad[0]();
  assert.equal(images().length, 0, "a failed logo is deleted");
  assert.ok(!logo().BHasClass("NSLogoCustom"), "the wordmark stays");
  // Live (lobby page, 6842): a source that failed reports ImageLoaded on a second request and draws
  // nothing, so the next match card with the same link must not ask for it again (the wordmark stays).
  const c = pgMatch(121917141);
  present(w, c);
  w.fire("ClientUI_FireOutput", handoff(boardCard(c, { t: [["C1", "", "https://imgur.com/AbCdEfG"], ["C2", "", ""]] })));
  w.advance(300);
  assert.equal(images().length, 0, "a source that failed this session is not requested again");
  assert.ok(!logo().BHasClass("NSLogoCustom"), "the wordmark stays");
  assert.ok(noBoardErrors(w));
});

check("board: without a handed card it asks the store once, only while the page shows; late, lost and offline replies are harmless", () => {
  const disk = {};
  const a = pgMatch(121917141);
  const b = pgMatch(121880956, { swap: true, win: 2 });
  pageCall(storeScript, disk, { i: "u", o: "u", c: boardCard(a, { at: 5000, t: [["Stored A", "SA", ""], ["Stored A2", "", ""]] }) });
  pageCall(storeScript, disk, { i: "u", o: "u", c: boardCard(b, { at: 5000, t: [["Stored B", "SB", ""], ["Stored B2", "", ""]] }) });
  const w = boardWorld({ visible: false, disk });
  w.web.loadDelay = 800; // live: the first hello took 554 ms (P7)
  w.boot();
  w.advance(1000);
  w.fill(a);
  w.fire("CitadelMatchDetailsUpdated", a.id);
  w.advance(3000);
  assert.equal((w.web.urls || []).length, 0, "a hidden page asks nothing and makes no panel");
  w.page.AddClass("PageVisible");
  w.advance(300);
  assert.equal(w.shown(), 1);
  assert.equal(w.text("NSTeamName1"), "Hidden King", "the stock names render first");
  w.advance(1500);
  deq([w.text("NSTeamName1"), w.text("NSTeamName2")], ["Stored A", "Stored A2"], "the stored card names the header");
  const urls = w.web.urls.slice();
  assert.ok(urls.every((u) => u === "about:blank" || u.startsWith(`${STORE_URL}#`)), "only the v2 page is visited");
  assert.equal(urls.filter((u) => decodeURIComponent(u).includes('"o":"q"')).length, 1, "one query");
  assert.equal(urls[urls.length - 1], "about:blank", "the panel goes blank after the read");
  w.advance(15000);
  assert.equal(w.web.urls.length, urls.length, "no further requests for the same match");
  // The next match: a new query on the same panel; a reply that arrives after the board moved on is not applied.
  w.web.hold = true;
  present(w, b);
  w.advance(1500);
  assert.equal(w.text("NSTeamName1"), "Hidden King", "reply not here yet");
  const c = pgMatch(121999999, { swap: false });
  w.fill(c);
  w.fire("CitadelMatchDetailsUpdated", c.id);
  w.advance(300);
  w.web.release();
  w.advance(1500);
  assert.equal(w.text("NSTeamName1"), "Hidden King", "a late reply for another match names nothing");
  assert.equal(w.text("NSMatch"), `MATCH ${c.id}`);
  w.web.hold = false;
  w.advance(10000);
  assert.ok(noBoardErrors(w));
  // A card handed in the same process wins and the store is not asked at all.
  const w2 = boardWorld({ disk });
  w2.boot();
  w2.advance(1000);
  w2.fire("ClientUI_FireOutput", handoff(boardCard(a, { at: 9000, t: [["Handed", "", ""], ["Handed B", "", ""]] })));
  present(w2, a);
  w2.advance(2000);
  deq([w2.text("NSTeamName1"), w2.text("NSTeamName2")], ["Handed", "Handed B"]);
  const asked = (w2.web.urls || []).map((u) => decodeURIComponent(u));
  assert.equal(asked.filter((u) => u.includes('"o":"q"')).length, 0, "the handed card needs no query");
  assert.equal(asked.filter((u) => u.includes('"o":"u"')).length, 1, "it is written once, tied to the match id");
  // Offline: stock names, a few tries at most, then quiet until the next match.
  const off = boardWorld({ disk, offline: true });
  off.boot();
  off.advance(1000);
  present(off, a);
  off.advance(30000);
  assert.equal(off.text("NSTeamName1"), "Hidden King");
  assert.ok(off.web.urls.length <= 6, `${off.web.urls.length} requests while offline`);
  const tries = off.web.urls.length;
  off.advance(30000);
  assert.equal(off.web.urls.length, tries, "gave up");
  assert.ok(noBoardErrors(off));
  // The steady state costs what it did: nothing written, within the board's budget (after the event's burst).
  w2.advance(8000);
  reset(w2);
  const stop = counted(w2.harness);
  w2.advance(10000);
  const shownOps = per(stop(), 10);
  assert.equal((shownOps.textWrites || 0) + (shownOps.styleWrites || 0) + (shownOps.classWrites || 0), 0, "no writes");
  assert.ok(total(shownOps) <= BUDGET_BOARD.calls && weighted(shownOps) <= BUDGET_BOARD.us, `board with a card: ${total(shownOps)} calls/s, ${weighted(shownOps)} us/s`);
});

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
  const geoLine = w.harness.logs.find((l) => l.startsWith("[NS] graph: chart ")) || "";
  const geo = /chart (\d+)x(\d+), zero (\d+), half (\d+), scale (\d+)/.exec(geoLine);
  assert.ok(geo, `geometry logged: ${geoLine}`);
  const [W, H, Z, HALF, SCALE] = geo.slice(1).map(Number);
  const logged = (kind) => w.harness.logs.filter((l) => l.startsWith(`[NS] data ${kind} + `)).map((l) => JSON.parse(l.slice(`[NS] data ${kind} + `.length)));
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
  // Captions name the header's teams and follow a match card.
  assert.ok(text(host.FindChildTraverse("NSGraphTop")).includes("HIDDEN KING") && text(host.FindChildTraverse("NSGraphBottom")).includes("ARCHMOTHER"), "captions from the header");
  w.fire("ClientUI_FireOutput", handoff(boardCard(m, { t: [["Night Owls", "NOW", ""], ["Brass Saints", "BRS", ""]] })));
  w.advance(500);
  assert.ok(text(host.FindChildTraverse("NSGraphTop")).includes("NIGHT OWLS") && text(host.FindChildTraverse("NSGraphBottom")).includes("BRASS SAINTS"), "captions follow the card");
  // The reveal finishes.
  assert.equal(String(host.FindChildTraverse("NSGraphDraw").style.clip), "rect( 0%, 100%, 100%, 0% )", "fully revealed");
  // How it failed live (2026-10-29, 1600x900, detailed_postgame): 1 px strokes are 0.83 screen px at UI scale
  // 0.83 and drop out by sub-pixel position (the 5:00 guide and most objective drop lines). Nothing under 2 px.
  const painted = host.FindChildTraverse("NSGraphCanvas").__draws || [];
  assert.ok(painted.length >= 10, `strokes painted: ${painted.length}`);
  const thin = painted.filter((d) => d.thickness < 2);
  deq(thin.map((d) => `${d.thickness}px ${d.color}`), [], "every canvas stroke is at least 2 px");
  // The drop lines (user 2026-10-29: the canvas part and the part below the paper did not match): none on the
  // canvas; one panel per objective from 7 px under its dot to 4 px into its icon, centred on the dot.
  deq(painted.filter((d) => d.color === "#FFEFD722").map((d) => d.pts), [], "no drop line on the canvas");
  const stems = host.FindChildTraverse("NSGraphStems").children.filter((c) => c.valid);
  const icons = host.FindChildTraverse("NSGraphEvents").children.filter((c) => c.valid);
  const objDots = host.FindChildTraverse("NSGraphMarks").children.filter((c) => c.valid && c.classes.has("NSGraphObj"));
  assert.ok(icons.length >= 5 && stems.length === icons.length && objDots.length === icons.length, `stems ${stems.length}, icons ${icons.length}, dots ${objDots.length}`);
  for (const d of objDots) {
    const cx = px(d, "marginLeft") + 5;
    const cy = px(d, "marginTop") + 5;
    const stem = stems.find((st) => Math.abs(px(st, "marginLeft") + 1 - cx) < 0.6);
    assert.ok(stem, `a stem under the dot at x ${cx}`);
    assert.ok(Math.abs(px(stem, "marginTop") - (cy + 7)) < 0.6, `stem starts under its dot: ${px(stem, "marginTop")} vs ${cy + 7}`);
    assert.ok(Math.abs(px(stem, "marginTop") + px(stem, "height") - 134) < 0.6, "stem ends 4 px into the icon");
  }
  assert.ok(noBoardErrors(w));
});

check("copy: a click on the header match id copies it the stock way, says so, and comes back; a failing stock route falls back to a selected TextEntry", () => {
  // How it could fail: the label takes no click (hittest off, or an ancestor blocks children); the stock event
  // does not reach the page; the feedback
  // stays, or an old timer overwrites a newer match; a throwing route leaves nothing copied or claims success.
  const board = read("panorama/layout/observer_hud/pg_board.xml");
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
  assert.ok(w.harness.logs.some((l) => l === "[NS] match id copied (entry)"));
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

// ---------------------------------------------------------------- phase 5: learned registry
// Plan phase 5 (decision 4). The page learns "team -> its 12 most recent accounts" from the cards of ended
// matches (a winner is set; an untouched sample name never reaches a card) and only ever offers it: the
// editor shows "USE <team>?" when at least 4 of a side's accounts are members of one team and at most 2 of
// another's. Nothing applies without a click. The board has no team editing (user 2026-10-26).
// How it could fail: a suggestion is applied silently; a half-matching team (3 members, or a runner-up with
// 3) is offered; an unfinished match (no winner) teaches; the registry grows past 12 accounts per team or
// never forgets a leaver.
const ended = (base, names, over = {}) => card(base, Object.assign({ w: 1, t: [[names[0], names[0].slice(0, 3).toUpperCase(), ""], [names[1], names[1].slice(0, 3).toUpperCase(), ""]] }, over));

check("registry: a team is suggested from at least 4 of a side's accounts against at most 2 of another team; only ended matches teach; 12 members at most", () => {
  const disk = {};
  const up = (c) => pageCall(storeScript, disk, { i: "u", o: "u", c });
  const ask = (a, b = []) => pageCall(storeScript, disk, { i: "s", o: "s", a, b });
  // An unfinished match (no winner) teaches nothing.
  up(card(1000, { w: 0 }));
  deq(ask(ids(1000, 6), ids(1100, 6)).s, [0, 0], "no ended match yet");
  up(ended(1000, ["Owl Squad", "Saint Squad"]));
  let s = ask(ids(1000, 6), ids(1100, 6)).s;
  deq([s[0].t[0], s[1].t[0], s[0].k], ["Owl Squad", "Saint Squad", 6]);
  // 4 of 6 is enough; 3 is not.
  const mixed = (n) => ids(1000, n).concat(ids(9000, 6 - n));
  assert.equal(ask(mixed(4)).s[0].t[0], "Owl Squad", "4 members");
  assert.equal(ask(mixed(3)).s[0], 0, "3 members");
  // A runner-up with 3 of these accounts blocks it; with 2 it does not.
  up(ended(2000, ["Third Team", "Fourth Team"], { a: ids(1000, 3).concat(ids(2000, 3)) })); // 3 of Owl Squad's accounts + 3 new
  assert.equal(ask(ids(1000, 4).concat([9001, 9002])).s[0], 0, "4 against a runner-up with 3: no suggestion");
  assert.equal(ask([1000, 1001, 1003, 1004, 9001, 9002]).s[0].t[0], "Owl Squad", "4 against a runner-up with 2");
  // 12 most recent accounts per team: a roster that moved on forgets the leavers.
  for (let i = 0; i < 4; i++) up(ended(30000 + i * 1000, ["Rotator", `Opp ${i}`], { a: ids(30000 + i * 1000, 6), at: 5000 + i }));
  assert.equal(ask(ids(33000, 6)).s[0].t[0], "Rotator", "the newest players are members");
  assert.equal(ask(ids(30000, 6)).s[0], 0, "players from 4 matches ago are not members any more");
  assert.equal(ask(ids(33000, 6).concat(ids(32000, 6))).s[0].k, 12, "12 members at most, newest first");
  assert.equal(ask(ids(31000, 6)).s[0], 0, "the third newest roster was pushed out too");
  // Case does not make a new team; the newest tag and logo describe it.
  up(ended(60000, ["Case Team", "Whoever"], { at: 5900 }));
  up(ended(61000, ["case team", "Whoever"], { a: ids(60000, 6), b: ids(61100, 6), t: [["case team", "CAS", "https://img.test/new.png"], ["Whoever", "", ""]], at: 6000 }));
  s = ask(ids(60000, 6)).s;
  deq(s[0].t, ["case team", "CAS", "https://img.test/new.png"], "the same team by name, the newest card's look");
  // Empty names (an untouched sample) are never learned.
  up(ended(5000, ["", ""], { t: [["", "", ""], ["", "", ""]], r: ["Org", ""] }));
  deq(ask(ids(5000, 6), ids(5100, 6)).s, [0, 0]);
  // Replies fit the title cap.
  assert.ok(JSON.stringify(ask(ids(1000, 6), ids(1100, 6))).length < 2000);
});

check("editor: a suggested team is offered as USE <team>? and applied only by a click", () => {
  const disk = {};
  for (const c of [ended(90000, ["Owl Squad", "Saint Squad"])]) pageCall(storeScript, disk, { i: "u", o: "u", c: Object.assign({}, c, { t: [["Owl Squad", "OWL", "https://img.test/o.png"], ["Saint Squad", "SQD", ""]] }) });
  const w = world({ disk });
  w.bootHost();
  w.advance(3000);
  w.press("OHMenuButton");
  w.press("OHNavTeams");
  const row = (side) => w.ui(`OH${side}SuggestRow`);
  assert.ok(!row("Amber").BHasClass("OHShown"), "nothing without accounts");
  // The accounts of the stored match (a = 90000.., b = 90100..).
  const amber = AMBER.map((p, i) => w.marker(p, { account: 90000 + i, shown: p }));
  const sapphire = SAPPHIRE.map((p, i) => w.marker(p, { account: 90100 + i, shown: p }));
  w.advance(4000);
  assert.ok(row("Amber").BHasClass("OHShown") && row("Sapphire").BHasClass("OHShown"), "both sides are offered");
  assert.equal(text(w.ui("OHAmberUseTeamLabel")), "USE OWL SQUAD?");
  assert.equal(text(w.ui("OHSapphireUseTeamLabel")), "USE SAINT SQUAD?");
  assert.notEqual(w.state().amber.name, "Owl Squad", "never applied silently");
  w.press("OHAmberUseTeam");
  deq([w.state().amber.name, w.state().amber.tag, w.state().amber.logo.url], ["Owl Squad", "OWL", "https://img.test/o.png"], "a click applies name, tag and logo");
  assert.notEqual(w.state().sapphire.name, "Saint Squad", "only the clicked side");
  w.advance(2000);
  assert.ok(!row("Amber").BHasClass("OHShown"), "already this team: no offer");
  assert.ok(row("Sapphire").BHasClass("OHShown"));
  // Another roster: nothing to offer.
  for (const m of amber.concat(sapphire)) m.DeleteAsync();
  w.bar().DeleteAsync();
  w.advance(1100);
  for (const p of [...AMBER, ...SAPPHIRE]) w.marker(p, { account: ACCOUNT_OF(p) + 7000 });
  w.advance(6000);
  assert.ok(!row("Sapphire").BHasClass("OHShown"), "accounts that are in no stored team");
});

const upCard = (disk, c, nowMs = PAGE_NOW) => pageCall(storeScript, disk, { i: "u", o: "u", c }, "OHS2:", nowMs);
const names = (w) => [w.text("NSTeamName1"), w.text("NSTeamName2")];
const DAY_S = 86400;

check("store v2: a card older than 2 days is deleted by the next request; a match-id card replaces the id-less card of its players", () => {
  // User 2026-10-26: a match's teams are tied to its match id and expire and are deleted after 2 days.
  const disk = {};
  const t0 = 400000;
  const a = pgMatch(121917141);
  const b = pgMatch(121880956);
  const rosterOf = (m) => boardCard(m).a.concat(boardCard(m).b);
  upCard(disk, boardCard(a, { at: t0, t: [["Old", "", ""], ["Old B", "", ""]] }), t0 * 1000);
  upCard(disk, boardCard(b, { at: t0 + DAY_S, t: [["Young", "", ""], ["Young B", "", ""]] }), (t0 + DAY_S) * 1000);
  const later = (t0 + 2 * DAY_S + 1) * 1000;
  const q = (m, id) => pageCall(storeScript, disk, { i: "q", o: "q", a: rosterOf(m), id }, "OHS2:", later);
  assert.equal(q(a, "").x, 0, "older than 2 days: not answered");
  assert.equal(matchesOf(disk).m.length, 1, "and deleted from the key, not only hidden");
  assert.equal(q(b, "").c.t[0][0], "Young", "a day old: kept");
  upCard(disk, boardCard(b, { at: t0 + DAY_S, id: "121880956", t: [["Young", "", ""], ["Young B", "", ""]] }), later);
  deq(matchesOf(disk).m.map((m) => m.id || ""), ["121880956"], "the id-less card of these players made way for the match-id card");
  upCard(disk, boardCard(a, { at: t0 }), later);
  assert.equal(matchesOf(disk).m.length, 1, "an expired card is not stored");
  // A newer id-less card (another map of the same players) stays next to an older match-id card.
  upCard(disk, boardCard(b, { at: t0 + DAY_S + 50, t: [["Next Map", "", ""], ["Next Map B", "", ""]] }), later);
  assert.equal(matchesOf(disk).m.length, 2, "a newer id-less card is kept");
});

check("board: the match's card is tied to its match id in the store and kept through a restart for 2 days; another match never borrows it; no team editing on the board", () => {
  const disk = {};
  const a = pgMatch(121917141, { win: 1 });
  const owls = (over = {}) => boardCard(a, Object.assign({ at: 6000, w: 1, t: [["Owl Squad", "OWL", "https://img.test/o.png"], ["Saint Squad", "SQD", ""]] }, over));
  // The HUD's card carries no match id (the HUD cannot read it); the board ties the card it shows to the match.
  upCard(disk, owls());
  const w = boardWorld({ disk });
  w.web.loadDelay = 500;
  w.boot();
  w.advance(1000);
  present(w, a);
  w.advance(4000);
  deq(names(w), ["Owl Squad", "Saint Squad"], "the stored card names the header");
  for (const id of ["NSTeamEdit1", "NSTeamEdit2", "NSEdit", "NSTeamSuggest1", "NSTeamSuggest2"]) assert.equal(w.boardHost().FindChildTraverse(id), null, `no ${id} on the board`);
  const forMatch = () => matchesOf(disk).m.filter((m) => m.id === "121917141");
  deq([forMatch().length, matchesOf(disk).m.length, forMatch()[0].at], [1, 1, 6000], "tied to the match id at the card's own time; the id-less card made way");
  deq(matchesOf(disk).T[forMatch()[0].t[0]], ["Owl Squad", "OWL", "https://img.test/o.png"]);
  // The HUD sends its card again every few seconds: the same card is not written again.
  const writes = () => w.web.urls.filter((u) => decodeURIComponent(u).includes('"o":"u"')).length;
  const once = writes();
  w.fire("ClientUI_FireOutput", handoff(owls()));
  w.advance(4000);
  assert.equal(writes(), once, "written once");
  // A newer card (the logo was changed while the match was live) replaces it, header and store.
  w.fire("ClientUI_FireOutput", handoff(owls({ at: 6500, t: [["Owl Squad", "OWL", "https://img.test/new.png"], ["Saint Squad", "SQD", ""]] })));
  w.advance(4000);
  deq([forMatch().length, matchesOf(disk).T[forMatch()[0].t[0]][2]], [1, "https://img.test/new.png"], "the newest card for the match id");
  const logos = w.boardHost().FindChildTraverse("NSLogo1").Children().filter((p) => p.paneltype === "Image" && p.valid);
  assert.equal(logos[0].src, "https://img.test/new.png", "the header loads the newer logo");
  // Restart: found by the match id; another match of the same players does not borrow it.
  const again = boardWorld({ disk });
  again.web.loadDelay = 500;
  again.boot();
  again.advance(1000);
  present(again, a);
  again.advance(4000);
  deq(names(again), ["Owl Squad", "Saint Squad"], "after a restart, by the match id");
  const rematch = pgMatch(121999999, { win: 1 });
  rematch.teams = a.teams;
  present(again, rematch);
  again.advance(4000);
  deq(names(again), ["Hidden King", "Archmother"], "another match of the same players does not borrow it");
  // Two days after the card: gone from the header and deleted from the store; a day-old handed card still shows.
  const late = boardWorld({ disk });
  late.harness.now = (6500 + 2 * DAY_S + 60) * 1000;
  late.web.loadDelay = 500;
  late.boot();
  late.advance(1000);
  late.fire("ClientUI_FireOutput", handoff(owls({ at: 6500 })));
  present(late, a);
  late.advance(4000);
  deq(names(late), ["Hidden King", "Archmother"], "expired: stock names");
  assert.equal(forMatch().length, 0, "expired: deleted from the store");
  late.fire("ClientUI_FireOutput", handoff(owls({ at: 6500 + DAY_S })));
  late.advance(4000);
  deq(names(late), ["Owl Squad", "Saint Squad"], "a day old: shown");
  // An unreachable store: the handed card still shows, a few requests at most, nothing throws.
  const off = boardWorld({ disk: {}, offline: true });
  off.boot();
  off.advance(1000);
  off.fire("ClientUI_FireOutput", handoff(owls()));
  present(off, a);
  off.advance(40000);
  deq(names(off), ["Owl Squad", "Saint Squad"]);
  assert.ok(off.web.urls.length <= 14, `${off.web.urls.length} requests offline`);
  assert.ok(noBoardErrors(off) && noBoardErrors(again) && noBoardErrors(late) && noBoardErrors(w));
});

check("board: player names follow the editor's aliases by Steam account (the saved setup, read in pieces); no alias keeps the account name", () => {
  // User 2026-10-26: the post-game player names change to the aliases set in the editor, by account id.
  // How it could fail: the record is only partly read (over one title); an alias lands on the wrong column;
  // a late read leaves the stock fallback over the plate; a name, pending or legacy alias is used instead of
  // the account; a damaged record or an offline page throws; the next match keeps the last match's aliases.
  const S = stateApiOf();
  const a = pgMatch(121917141);
  const b = pgMatch(121880956, { swap: true, win: 2 });
  const acct = (m, t, k) => String(m.teams[t][k].account);
  const recordOf = (players) => {
    const state = S.defaults();
    for (let i = 0; i < 20; i++) state.players[String(3000000 + i)] = { a: `Filler Alias Number ${i}`, n: `Filler Name Number ${i}` };
    Object.assign(state.players, players);
    for (let i = 0; i < 24; i++) state.legacy[`Legacy Player Name Number ${i}`] = `Legacy Alias Number ${i}`;
    for (let i = 0; i < 20; i++) state.pending[`Pending Player Name No ${i}`] = `Pending Alias No ${i}`;
    state.pending[`Persona ${acct(a, 0, 1)}`] = "Pending By Name";
    const body = JSON.stringify({ s: 1, state });
    return `OHS1.${S.checksum(body)}.${body}`;
  };
  const disk = { [`${V2}state`]: recordOf({ [acct(a, 0, 0)]: { a: "Alias Amber", n: "x" }, [acct(a, 1, 2)]: { a: "Alias Sapphire", n: "y" }, "4294967": { a: "Not Here", n: "z" } }) };
  assert.ok(disk[`${V2}state`].length > 3000, "the record needs more than one reply");
  const w = boardWorld({ disk });
  w.web.loadDelay = 1500; // slower than the 1 s stock-name fallback: the alias must take the plate back
  w.boot();
  w.advance(1000);
  present(w, a);
  w.advance(6000);
  const plate = (t, k) => w.scoreboard.FindChildTraverse(`Team${t + 1}`).FindChildTraverse("TeamPlayers").children[k].FindChildTraverse("NSPlate");
  const shown = (t, k) => {
    const p = plate(t, k);
    if (!p || !p.BHasClass("NSAliased") || String(p.style.visibility) === "collapse") return "";
    const label = p.FindChildTraverse("NSAlias");
    return label.__text ?? label.text;
  };
  deq([shown(0, 0), shown(1, 2)], ["Alias Amber", "Alias Sapphire"], "aliases by account, on the right columns");
  deq([shown(0, 1), shown(0, 2), shown(1, 0)], ["", "", ""], "no alias for these accounts (a pending alias by name is not used)");
  // The next match on the reused rows, after the alias was changed in the editor: read again, nothing carried over.
  disk[`${V2}state`] = recordOf({ [acct(b, 1, 0)]: { a: "Changed Alias", n: "x" } });
  present(w, b);
  w.advance(6000);
  deq([shown(1, 0), shown(0, 0), shown(1, 2)], ["Changed Alias", "", ""], "the next match's aliases only");
  assert.ok(noBoardErrors(w));
  // An account name that never shows: the stock-name fallback takes the plate's place after 1 s; the alias,
  // read later, takes it back.
  disk[`${V2}state`] = recordOf({ [acct(a, 0, 0)]: { a: "Alias Amber", n: "x" } });
  const blank = boardWorld({ disk, names: false });
  blank.web.loadDelay = 1500;
  blank.boot();
  blank.advance(1000);
  present(blank, a);
  blank.advance(6000);
  const bp = blank.scoreboard.FindChildTraverse("Team1").FindChildTraverse("TeamPlayers").children[0].FindChildTraverse("NSPlate");
  assert.ok(bp.BHasClass("NSAliased") && String(bp.style.visibility) !== "collapse", "the alias plate is shown again");
  assert.ok(noBoardErrors(blank));
  // A damaged record, or no store: the account names stay, nothing throws.
  const broken = boardWorld({ disk: { [`${V2}state`]: "OHS1.00000000.{\"s\":1}" } });
  broken.boot();
  broken.advance(1000);
  present(broken, a);
  broken.advance(6000);
  assert.equal(broken.scoreboard.FindChildTraverse("Team1").FindChildTraverse("TeamPlayers").children[0].FindChildTraverse("NSPlate").BHasClass("NSAliased"), false, "damaged record: no alias");
  const off = boardWorld({ disk, offline: true });
  off.boot();
  off.advance(1000);
  present(off, a);
  off.advance(30000);
  assert.ok(off.web.urls.length <= 6, `${off.web.urls.length} requests offline`);
  assert.ok(noBoardErrors(broken) && noBoardErrors(off));
});

// ---------------------------------------------------------------- budgets

check("steady state: no writes while nothing changes; native calls per second under the budgets", () => {
  // Not spectating: the host only checks the HUD classes.
  const idle = world({ spectating: false });
  idle.bootHost();
  idle.advance(5000);
  reset(idle);
  let stop = counted(idle.harness);
  idle.advance(10000);
  const notSpectating = per(stop(), 10);
  // Spectating, then back to playing (m2 review: 101.9/s, the column kept validating and rescanning
  // because the top bar stays valid; no budget world ever left spectating).
  const left = world();
  left.bootHost();
  left.advance(5000);
  for (const cls of ["spec_mode", "TeamSpectator", "replay_playback"]) left.hud.RemoveClass(cls);
  left.advance(5000);
  reset(left);
  stop = counted(left.harness);
  left.advance(10000);
  const leftSpectating = per(stop(), 10);
  console.log(`   after spectating ${weighted(leftSpectating)} us/s, ${total(leftSpectating)} calls/s ${JSON.stringify(leftSpectating)}`);
  assert.equal(leftSpectating.textWrites || 0, 0);
  assert.equal(leftSpectating.styleWrites || 0, 0);
  assert.ok(weighted(leftSpectating) <= BUDGET_US.after, `after spectating: ${weighted(leftSpectating)} us/s`);

  // Playing (not spectating) with pak10 installed: the world healthbars exist and carry statuses, but
  // nothing of this mod shows. Before 2026-10-25 every hero bar kept its 0.25 s poll here.
  const playing = statusWorld({ spectating: false });
  for (const name of [...AMBER, ...SAPPHIRE]) {
    playing.giveDebuff(name, "ability_viper_petrifybola", { radial: () => -180 });
    playing.giveDebuff(name, "upgrade_extra_regen", { debuff: false });
  }
  for (let i = 0; i < 60; i++) playing.addBar(`trooper${i}`, { hero: false });
  playing.advance(8000);
  reset(playing);
  stop = counted(playing.harness);
  playing.advance(10000);
  const playingOps = per(stop(), 10);
  console.log(`   playing ${weighted(playingOps)} us/s, ${total(playingOps)} calls/s ${JSON.stringify(playingOps)}`);
  assert.ok(weighted(playingOps) <= BUDGET_US.playing, `playing: ${weighted(playingOps)} us/s`);

  // Spectating with a full setup and nothing changing: bar, aliases, column, 12 hero bars with a
  // listed status and an unlisted one each (real bars carry item and regen statuses outside RULES),
  // 60 trooper/neutral bars and the HUD's own lists.
  const w = statusWorld();
  w.press("OHMenuButton");
  w.type("OHEventEntry", "Deadlock Community Cup");
  w.type("OHStageEntry", "Grand Final");
  w.type("OHAmberPlayer0Entry", "Kes");
  w.press("OHDone");
  // The stock far-away markers: one per other player (11 for a spectator's view, here all 12).
  markAll(w);
  for (const name of [...AMBER, ...SAPPHIRE]) {
    w.giveDebuff(name, "ability_viper_petrifybola", { radial: () => -180 });
    w.giveDebuff(name, "upgrade_extra_regen", { debuff: false });
  }
  for (let i = 0; i < 60; i++) w.addBar(`trooper${i}`, { hero: false });
  for (const list of findAll(w.hud, "CitadelStatusEffect")) w.runIn(list, [["oh_debuff_world.js", script("oh_debuff_world.js")]]);
  // Past the world bars' 30 s wake window (the steady state of most of a match).
  w.advance(35000);
  reset(w);
  stop = counted(w.harness);
  w.advance(10000);
  const spectating = per(stop(), 10);
  const spectatingNodes = Math.round(lastNodes / 10);
  // The usual in-game state: a status with a moving radial on every card, so the column counts down
  // at its 0.25 s tick (m1 audit O1: the 4 Hz tick re-validated every card and re-read every name).
  for (const name of [...AMBER, ...SAPPHIRE]) {
    w.giveDebuff(name, "ability_sleep_dagger", { radial: (now) => -360 + ((now / 1000) % 8) * 45 });
  }
  w.advance(3000);
  reset(w);
  stop = counted(w.harness);
  w.advance(10000);
  const countdown = per(stop(), 10);
  results.budgets = { notSpectating, notSpectatingTotal: total(notSpectating), notSpectatingUs: weighted(notSpectating),
    spectating, spectatingTotal: total(spectating), spectatingUs: weighted(spectating),
    countdown, countdownTotal: total(countdown), countdownUs: weighted(countdown),
    after: leftSpectating, afterUs: weighted(leftSpectating), playing: playingOps, playingUs: weighted(playingOps), spectatingNodes };
  console.log(`   not spectating ${weighted(notSpectating)} us/s, ${total(notSpectating)} calls/s ${JSON.stringify(notSpectating)}`);
  console.log(`   spectating ${weighted(spectating)} us/s, ${total(spectating)} calls/s ${JSON.stringify(spectating)} (subtree node visits ${spectatingNodes}/s)`);
  console.log(`   counting down ${weighted(countdown)} us/s, ${total(countdown)} calls/s ${JSON.stringify(countdown)}`);
  assert.equal(notSpectating.textWrites || 0, 0);
  assert.equal(notSpectating.styleWrites || 0, 0);
  assert.ok(weighted(notSpectating) <= BUDGET_US.idle, `not spectating: ${weighted(notSpectating)} us/s`);
  assert.equal(spectating.textWrites || 0, 0, "steady state writes no text");
  assert.equal(spectating.styleWrites || 0, 0, "steady state writes no styles");
  assert.equal(spectating.classWrites || 0, 0, "steady state writes no classes");
  // 12 hero bars (a listed and an unlisted status each, CLASS_PLAYER on the world panel as live) at the
  // 0.25 s poll, 60 idle bars, the column and the host tick. Re-measure before raising.
  assert.ok(weighted(spectating) <= BUDGET_US.spectating, `spectating budget: ${weighted(spectating)} us/s`);
  assert.ok(weighted(countdown) <= BUDGET_US.countdown, `countdown budget: ${weighted(countdown)} us/s`);
});

// The account scan while accounts are still arriving (live: 6 of 12 at the first look): one pass over the
// markers a second, then nothing at 11 of 12. Measured with no alias, so the pass is the whole cost.
check("identity: the account scan costs a few microseconds a second while accounts arrive, and nothing at 11 of 12", () => {
  const b = world();
  b.bootHost();
  markAll(b);
  b.advance(8000);
  reset(b);
  const stopBase = counted(b.harness);
  b.advance(10000);
  const baseOps = per(stopBase(), 10);
  const base = weighted(baseOps); // every account known from the start: the host's own cost
  const w = world();
  w.bootHost();
  w.advance(5000);
  const entries = [...AMBER, ...SAPPHIRE].map((p, i) => w.marker(p, { account: i < 6 ? ACCOUNT_OF(p) : 0 }));
  w.advance(3000);
  reset(w);
  let stop = counted(w.harness);
  w.advance(10000);
  const scanning = per(stop(), 10);
  console.log(`   account scan (6 of 12 known) ${weighted(scanning)} us/s, ${total(scanning)} calls/s ${JSON.stringify(scanning)}`);
  assert.ok(weighted(scanning) - base <= BUDGET_US.scan, `scan: ${weighted(scanning)} us/s`);
  // The budget means nothing unless the scan works: a known account is joined, a missing one is not yet.
  const late = [...AMBER, ...SAPPHIRE][6];
  assert.equal(w.host().accountOf(AMBER[0]), String(ACCOUNT_OF(AMBER[0])), "an account known from the start is joined");
  assert.ok(!w.host().accountOf(late), "an account not on its marker yet is not joined");
  entries.forEach((e, i) => { if (i >= 6 && i < 11) e.FindChildTraverse("PlayerName").accountid = ACCOUNT_OF([...AMBER, ...SAPPHIRE][i]); });
  w.advance(3000);
  assert.equal(w.host().accountOf(late), String(ACCOUNT_OF(late)), "an account that arrives later is joined");
  reset(w);
  stop = counted(w.harness);
  w.advance(10000);
  const done = per(stop(), 10);
  console.log(`   account scan (11 of 12 known) ${weighted(done)} us/s, ${total(done)} calls/s ${JSON.stringify(done)}`);
  assert.ok((done.textReads || 0) <= (baseOps.textReads || 0) && (done.childrenReads || 0) <= (baseOps.childrenReads || 0) + 0.5, `11 of 12 known: the scan is off ${JSON.stringify(done)}`);
  assert.ok(weighted(done) - base <= 2.5, `11 of 12 known: ${weighted(done)} vs ${base} us/s`);
  results.accountScan = { baseUs: base, scanningUs: weighted(scanning), doneUs: weighted(done) };
});

// ---------------------------------------------------------------- private-lobby setup (0.3.0)
// oh_lobby.js runs in this mod's override of citadel_db_page_private_lobby.xml (dashboard) and edits the setup
// through oh_link.js in the HUD over ClientUI_FireOutput. The engine side, from live (client 6842, ENGINE.md
// "Private-lobby page"): #Team1Listing / #Team2Listing hold 8 children (CitadelPrivateLobbyTeamSlot at 0, 1, 3,
// 4, 6, 7, spacer Panels at 2 and 5); a filled slot has .IsPlayer and CitadelFriend#PlayerID.accountid (text);
// an emptied slot keeps the old account; CitadelPartyUpdated arrives on every slot change; the page carries
// PageVisible while shown; both directions of ClientUI_FireOutput arrive in the same frame.
// How the lobby setup can fail, each with a check below:
//  1. Esc in an edit card or alias box leaves the lobby (instead of closing the box);
//  2. a late or repeated swap undoes a newer edit or a match-end series win;
//  3. an op from an older HUD session, or a forged / oversized one, changes the setup;
//  4. an alias lands on the wrong player (an emptied slot's old account, a bot);
//  5. the "teams changed sides" offer swaps on a roster that has moved since it showed;
//  6. the hidden page costs time, or the HUD keeps echoing to a lobby that left;
//  7. without the HUD the page shows controls that do nothing;
//  8. a ban lands twice, on the wrong team, or Esc in the picker leaves the lobby;
//  9. a share code is lost on the way, a bad code changes the setup, or RESET ALL fires on one press.
const LOBBY = {
  page: parseLayout(read("panorama/layout/citadel_db_page_private_lobby.xml")),
  slot: parseLayout(read("stock/citadel_ui_private_lobby_team_slot.xml"))
};
// A HUD stand-in for checks that need a set match card (the real host builds cards from in-game markers).
const fakeHost = (initial, card) => `(() => {
  const S = $.OHState;
  let state = S.normalize(${JSON.stringify(initial)});
  let version = 0;
  const listeners = [];
  $.OHHost = { getState: () => state, version: () => version, card: () => (${JSON.stringify(card)}),
    setState: (next) => { state = S.normalize(next); version++; for (const fn of listeners) fn(); },
    onChange: (fn) => listeners.push(fn) };
})();`;
function lobbyWorld({ link = "host", visible = true, initial = null, card = 0 } = {}) {
  const w = world({ spectating: false });
  if (link === "host") w.bootHost();
  const hudContext = link === "fake" ? new MockPanel("Panel", w.hudRoot, "FakeHud") : null;
  if (link === "fake") w.runIn(hudContext, [["oh_state.js", script("oh_state.js")], ["fake_host.js", fakeHost(initial || {}, card)], ["oh_link.js", script("oh_link.js")]]);
  w.advance(1500);
  const counts = {};
  const dash = new MockPanel("CitadelDashboardRoot", { operationCounts: counts });
  WORLDS.push(dash);
  const page = instantiate(LOBBY.page, dash);
  if (visible) page.AddClass("PageVisible");
  const slots = { amber: [], sapphire: [] };
  for (const [side, id] of [["amber", "Team1Listing"], ["sapphire", "Team2Listing"]]) {
    const list = page.FindChildTraverse(id);
    for (let i = 0; i < 8; i++) {
      if (i === 2 || i === 5) { new MockPanel("Panel", list, ""); continue; }
      const slot = instantiate(LOBBY.slot, list);
      const friend = slot.FindChildTraverse("PlayerID");
      friend.actualxoffset = 60;
      const details = new MockPanel("Panel", friend, "FriendDetails");
      details.actualxoffset = 44;
      const nameBox = new MockPanel("Panel", details, "FriendNameContainer");
      nameBox.actualyoffset = 8;
      nameBox.actuallayoutheight = 22;
      new MockPanel("Label", new MockPanel("CitadelUserName", nameBox, "FriendName"), "");
      friend.GetParent().actuallayoutwidth = 360;
      slots[side].push(slot);
    }
  }
  const fire = (name, ...args) => { for (const entry of w.bus.slice()) if (entry.name === name) entry.fn(...args); };
  // A player joins slot k of a side (or the slot is emptied: account null); the event follows like live.
  const seat = (side, k, account, name, { event = true } = {}) => {
    const slot = slots[side][k];
    const friend = slot.FindChildTraverse("PlayerID");
    if (account === null) {
      slot.RemoveClass("IsPlayer"); // the old accountid stays on the friend panel (live)
    } else {
      slot.AddClass("IsPlayer");
      friend.accountid = String(account);
      friend.FindChildTraverse("FriendName").children[0].__text = name;
    }
    if (event) fire("CitadelPartyUpdated", "123456789012345678");
  };
  const boot = () => w.runIn(page, [["oh_state.js", script("oh_state.js")], ["oh_heroes.js", script("oh_heroes.js")], ["oh_lobby.js", script("oh_lobby.js")]]);
  const ctn = (side) => page.FindChildrenWithClassTraverse(side === "amber" ? "TeamAmber" : "TeamSapphire")[0];
  const title = (side) => ctn(side).FindChildrenWithClassTraverse("OHLTitle")[0];
  const cardOf = (side) => ctn(side).FindChildrenWithClassTraverse("OHLCard")[0];
  const entries = (side) => cardOf(side).FindChildrenWithClassTraverse("OHLEntry");
  const alias = (side, k) => slots[side][k].FindChildTraverse("OHLAlias");
  const shown = (panel) => !!panel && panel.valid && panel.style.visibility !== "collapse";
  const replies = () => w.sent.filter((m) => m.startsWith("OHL1S:")).map((m) => JSON.parse(m.slice(6)));
  // The HUD's link listener, called directly with a raw message (a forged or late op).
  const toHud = (raw) => { for (const entry of w.bus.slice()) if (entry.name === "ClientUI_FireOutput" && entry.panel !== page) entry.fn(raw); };
  const hudHost = () => {
    const ctx = w.contexts.get(link === "fake" ? hudContext : w.spectateBar);
    return ctx[ctx.length - 1].$.OHHost;
  };
  const hudState = () => hudHost().getState();
  const submit = (entry, value) => { entry.text = value; entry.events.oninputsubmit(); };
  const ui = (id) => page.FindChildTraverse(id);
  // The format DropDown: pick an option as a click does (SetSelected, then oninputsubmit).
  const pickFormat = (n) => { const dd = ui("OHLFormat"); dd.SetSelected(`OHLBo${n}`); dd.events.oninputsubmit(); };
  return { w, page, dash, counts, slots, seat, boot, fire, ctn, title, card: cardOf, entries, alias, shown, replies, toHud,
    hudState, hudHost, submit, ui, pickFormat, advance: (ms) => w.advance(ms) };
}

check("lobby: the override includes the lobby scripts, keeps the stock Esc handler, and every OHL class is styled", () => {
  const page = read("panorama/layout/citadel_db_page_private_lobby.xml");
  for (const include of ["styles/observer_hud/oh_lobby.vcss_c", "scripts/observer_hud/oh_state.vjs_c", "scripts/observer_hud/oh_heroes.vjs_c", "scripts/observer_hud/oh_lobby.vjs_c"]) {
    assert.ok(page.includes(`s2r://panorama/${include}`), include);
  }
  assert.ok(page.indexOf("oh_state.vjs_c") < page.indexOf("oh_heroes.vjs_c") && page.indexOf("oh_heroes.vjs_c") < page.indexOf("oh_lobby.vjs_c"), "oh_state, oh_heroes, then oh_lobby");
  // The stock Esc handler stays: a focused OH box takes Esc first (live), so nothing replaces it.
  assert.match(page, /oncancel="CitadelPrivateLobbyLeave\( 1 \);"/);
  const js = read("panorama/scripts/observer_hud/oh_lobby.js");
  const css = read("panorama/styles/observer_hud/oh_lobby.css");
  const classes = new Set([...js.matchAll(/class: "([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => c.startsWith("OHL")));
  for (const name of ["OHLWon", "OHLEditing", "OHLHasAlias", "OHLLinkNote", "OHLLinkOn", "OHLOff", "OHLBanSet", "OHLTaken", "OHLCurrent", "OHLSelected", "OHLArmed"]) {
    assert.ok(js.includes(`"${name}"`), `${name} is set by oh_lobby.js`);
    classes.add(name);
  }
  for (const c of classes) assert.match(css, new RegExp(`\\.${c}\\b`), `.${c} has a rule in oh_lobby.css`);
  // The alias button is its own layout (slot children take the slot's stylesheets, live): it brings oh_lobby.css.
  const aliasXml = read("panorama/layout/observer_hud/lobby_alias.xml");
  assert.ok(aliasXml.includes("s2r://panorama/styles/observer_hud/oh_lobby.vcss_c"), "lobby_alias.xml includes oh_lobby.css");
  for (const c of new Set([...aliasXml.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)))) {
    assert.match(css, new RegExp(`\\.${c}\\b`), `.${c} (lobby_alias.xml) has a rule in oh_lobby.css`);
  }
  // The Observer HUD block is its own layout too (it brings the stock base and lobby styles for its DropDown
  // and pills); every OHL class in it is styled, and every id oh_lobby.js looks up is in it.
  for (const [file, list] of [["lobby_setup", "SETUP_IDS"], ["lobby_share", "SHARE_IDS"]]) {
    const xml = read(`panorama/layout/observer_hud/${file}.xml`);
    for (const include of ["citadel_base_styles.vcss", "citadel_db_page_private_lobby.vcss", "observer_hud/oh_lobby.vcss_c"]) {
      assert.ok(xml.includes(`s2r://panorama/styles/${include}`), `${file}.xml includes ${include}`);
    }
    for (const c of new Set([...xml.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => c.startsWith("OHL")))) {
      assert.match(css, new RegExp(`\\.${c}\\b`), `.${c} (${file}.xml) has a rule in oh_lobby.css`);
    }
    const ids = new RegExp(`const ${list} = \\[([^\\]]+)\\]`).exec(js)[1].match(/"(\w+)"/g).map((q) => q.slice(1, -1));
    for (const id of ids) assert.ok(xml.includes(`id="${id}"`), `${file}.xml has #${id}`);
  }
  assert.ok(!/box-shadow|clip-path/.test(css), "no box-shadow / clip-path");
  for (const [, prop] of css.matchAll(/transition-property:\s*([\w-]+)/g)) assert.equal(prop, "opacity", "only opacity transitions");
});

check("lobby: the team titles show the HUD's teams, and an edit card saves name, tag and logo in the HUD", () => {
  const l = lobbyWorld();
  l.boot();
  l.advance(1500);
  const amber = l.title("amber");
  assert.ok(l.shown(amber), "team row shown once the HUD answered");
  const stockTitle = l.ctn("amber").FindChildrenWithClassTraverse("TeamTitleText")[0];
  assert.equal(stockTitle.style.visibility, "collapse", "the stock title gives way");
  assert.equal(text(amber.FindChildrenWithClassTraverse("OHLName")[0]), l.hudState().amber.name);
  assert.ok(!l.shown(l.card("amber")), "card closed");
  amber.FindChildrenWithClassTraverse("OHLTitleMain")[0].events.onactivate();
  assert.ok(l.shown(l.card("amber")), "card opens on a title click");
  const [name, tag, logo] = l.entries("amber");
  assert.ok(name.focused, "the name field takes focus");
  name.text = "Night Owls";
  tag.text = "now";
  logo.text = "https://imgur.com/AbCdE12";
  name.events.oninputsubmit();
  l.advance(100);
  const state = l.hudState();
  deq([state.amber.name, state.amber.tag, state.amber.logo.url], ["Night Owls", "NOW", "https://imgur.com/AbCdE12"]);
  assert.ok(!l.shown(l.card("amber")), "Enter saves and closes");
  assert.equal(text(amber.FindChildrenWithClassTraverse("OHLName")[0]), "Night Owls");
  assert.equal(text(amber.FindChildrenWithClassTraverse("OHLTag")[0]), "NOW");
  // The logo: the first source of the imgur page link, one Image, the monogram until ImageLoaded.
  const image = l.ctn("amber").FindChildrenWithClassTraverse("OHLLogo")[0];
  assert.equal(image.src, "https://i.imgur.com/AbCdE12.gif");
  assert.ok(l.shown(amber.FindChildrenWithClassTraverse("OHLMono")[0]), "monogram until the image loads");
  image.events.ImageLoaded();
  assert.equal(amber.FindChildrenWithClassTraverse("OHLMono")[0].style.visibility, "collapse");
  // A refused value says why and changes nothing.
  amber.FindChildrenWithClassTraverse("OHLTitleMain")[0].events.onactivate();
  l.entries("amber")[2].text = "javascript:alert(1)";
  l.entries("amber")[2].events.oninputsubmit();
  assert.ok(l.shown(l.card("amber")), "a rejected URL keeps the card open");
  assert.match(text(l.card("amber").FindChildrenWithClassTraverse("OHLCardNote")[0]), /Logo URL not accepted/);
  assert.equal(l.hudState().amber.logo.url, "https://imgur.com/AbCdE12");
  // A logo that failed to load is not asked for again this session (live: a second request reports
  // ImageLoaded and draws nothing, a blank circle after SWAP HUD SIDES and back).
  l.entries("amber")[2].text = "https://cdn.example.com/expired.png";
  l.entries("amber")[2].events.oninputsubmit();
  l.advance(100);
  const failing = l.ctn("amber").FindChildrenWithClassTraverse("OHLLogo").find((img) => img.src === "https://cdn.example.com/expired.png");
  failing.events.ImageFailedLoad();
  const mono = () => l.title("amber").FindChildrenWithClassTraverse("OHLMono")[0];
  assert.ok(l.shown(mono()), "monogram after the failure");
  l.ui("OHLSwap").events.onactivate();
  l.advance(100);
  l.ui("OHLSwap").events.onactivate();
  l.advance(100);
  assert.equal(l.hudState().amber.logo.url, "https://cdn.example.com/expired.png", "back on Amber");
  assert.equal(l.ctn("amber").FindChildrenWithClassTraverse("OHLLogo").filter((img) => img.valid !== false && img.src === "https://cdn.example.com/expired.png").length, 0, "not requested again");
  assert.ok(l.shown(mono()), "the monogram stays");
});

check("lobby: Esc in an edit card or an alias box closes the box and changes nothing", () => {
  const l = lobbyWorld();
  l.seat("amber", 0, 1018009958, "JDBeast");
  l.boot();
  l.advance(1500);
  const before = JSON.stringify(l.hudState());
  l.title("amber").FindChildrenWithClassTraverse("OHLTitleMain")[0].events.onactivate();
  l.entries("amber")[0].text = "Typed but cancelled";
  l.entries("amber")[0].events.oncancel();
  assert.ok(!l.shown(l.card("amber")), "Esc closes the card");
  const button = l.alias("amber", 0);
  button.events.onactivate();
  const entry = button.FindChild("OHLAliasEntry");
  assert.ok(l.shown(entry) && entry.focused, "alias box open and focused");
  entry.text = "Typed but cancelled";
  entry.events.oncancel();
  assert.ok(!l.shown(entry), "Esc closes the alias box");
  l.advance(500);
  assert.equal(JSON.stringify(l.hudState()), before, "nothing changed");
  // Every OH text box has its own oncancel (live: a focused TextEntry's oncancel runs instead of the page's leave).
  for (const box of l.page.FindChildrenWithClassTraverse("OHLEntry").concat(l.page.FindChildrenWithClassTraverse("OHLBox"), [entry])) {
    assert.equal(typeof box.events.oncancel, "function", `${box.id || box.classes} has oncancel`);
  }
  assert.ok(l.page.FindChildrenWithClassTraverse("OHLBox").length >= 2, "stage and share boxes checked");
});

check("lobby: a click on a player's name sets an alias keyed by the slot's account; emptied slots and bots get none", () => {
  const l = lobbyWorld();
  l.seat("amber", 0, 1018009958, "JDBeast");
  l.seat("sapphire", 1, 90007, "Volt");
  l.boot();
  l.advance(1500);
  const button = l.alias("amber", 0);
  assert.ok(l.shown(button), "alias button on a filled slot");
  // Over the stock name: offsets from the .Player panel (friend 60 + details 44, name 8 down).
  deq([button.style.marginLeft, button.style.marginTop, button.style.height], ["104px", "8px", "22px"]);
  button.events.onactivate();
  l.submit(button.FindChild("OHLAliasEntry"), "Ace");
  l.advance(100);
  deq(l.hudState().players["1018009958"], { a: "Ace", n: "JDBeast" });
  assert.equal(text(button.FindChildTraverse("OHLAliasText")), "Ace");
  assert.equal(text(button.FindChildTraverse("OHLAliasReal")), "JDBeast");
  assert.equal(l.slots.amber[0].FindChildTraverse("FriendNameContainer").style.opacity, "0", "the stock name hides under the alias");
  // Cleared: the stock name comes back.
  button.events.onactivate();
  l.submit(button.FindChild("OHLAliasEntry"), "");
  l.advance(100);
  assert.equal(l.hudState().players["1018009958"], undefined);
  assert.notEqual(l.slots.amber[0].FindChildTraverse("FriendNameContainer").style.opacity, "0");
  // The player leaves: the slot keeps the old account (live) but loses its button.
  l.seat("amber", 0, null);
  l.advance(500);
  assert.ok(!l.shown(l.alias("amber", 0)), "no alias button on an emptied slot");
  // A bot slot (no player) never gets one.
  assert.equal(l.alias("amber", 1), null);
  // Another player in the same slot binds to the new account.
  l.seat("amber", 0, 90003, "Doyle");
  l.advance(500);
  l.alias("amber", 0).events.onactivate();
  l.submit(l.alias("amber", 0).FindChild("OHLAliasEntry"), "Rook");
  l.advance(100);
  deq(l.hudState().players["90003"], { a: "Rook", n: "Doyle" });
  assert.equal(l.hudState().players["1018009958"], undefined);
});

check("lobby: RESET ALL after an alias shows the stock name again (user report 2026-11-03)", () => {
  const l = lobbyWorld();
  l.seat("amber", 0, 1018009958, "amira");
  l.boot();
  l.advance(1500);
  const button = l.alias("amber", 0);
  button.events.onactivate();
  l.submit(button.FindChild("OHLAliasEntry"), "Ami");
  l.advance(100);
  const nameBox = l.slots.amber[0].FindChildTraverse("FriendNameContainer");
  assert.equal(nameBox.style.opacity, "0", "the stock name hides under the alias");
  l.ui("OHLShareOpen").events.onactivate();
  const reset = l.ui("OHLReset");
  reset.events.onactivate();
  l.advance(100);
  reset.events.onactivate();
  l.advance(100);
  deq(l.hudState().players, {}, "the alias is gone");
  assert.equal(text(l.alias("amber", 0).FindChildTraverse("OHLAliasText")), "");
  // Live a null write leaves the old inline opacity (see stuckHidden): the name must be written back.
  assert.equal(nameBox.style.opacity, "1", "the stock name shows again");
});

check("lobby: an open alias box closes when its slot changes hands; an emptied or bot slot gets the stock name back", () => {
  const l = lobbyWorld();
  l.seat("amber", 0, 1018009958, "JDBeast");
  l.boot();
  l.advance(1500);
  // Typing for JDBeast, then another player takes the slot before Enter: nothing goes to the new account.
  const button = l.alias("amber", 0);
  button.events.onactivate();
  const entry = button.FindChild("OHLAliasEntry");
  entry.text = "AliasForJD";
  l.seat("amber", 0, 90003, "Doyle");
  l.advance(500);
  assert.ok(!l.shown(entry), "the box closed when the slot changed hands");
  entry.events.oninputsubmit();
  entry.events.onblur();
  l.advance(100);
  assert.equal(l.hudState().players["90003"], undefined, "no alias for the new player");
  assert.equal(l.hudState().players["1018009958"], undefined, "none for the old one either");
  // An alias hides the stock name; emptying the slot, then a bot in it, brings the stock name back.
  const nameBox = l.slots.amber[0].FindChildTraverse("FriendNameContainer");
  l.alias("amber", 0).events.onactivate();
  l.submit(l.alias("amber", 0).FindChild("OHLAliasEntry"), "Rook");
  l.advance(100);
  assert.equal(nameBox.style.opacity, "0");
  l.seat("amber", 0, null);
  l.advance(500);
  assert.notEqual(nameBox.style.opacity, "0", "an emptied slot shows its stock name");
  l.seat("amber", 0, 0, "Bot");
  l.advance(500);
  assert.notEqual(nameBox.style.opacity, "0", "a bot slot shows its stock name");
});

check("lobby: a malformed reply card is dropped and the page keeps working", () => {
  const l = lobbyWorld();
  // A full swapped roster: Amber holds the card's b players, Sapphire its a players (the offer's case).
  const amber = [1, 2, 3, 4, 5, 6];
  const sapphire = [11, 12, 13, 14, 15, 16];
  for (let k = 0; k < 6; k++) {
    l.seat("amber", k, amber[k] + 90000, `A${k}`, { event: false });
    l.seat("sapphire", k, sapphire[k] + 90000, `S${k}`, { event: false });
  }
  l.boot();
  l.advance(1500);
  const reply = l.replies().slice(-1)[0];
  const a = sapphire.map((n) => n + 90000);
  const b = amber.map((n) => n + 90000);
  for (const card of [{ a, b, t: [] }, { a, b, t: [[]] }, { a, b, t: [null, ["B"]] }, { a: "x", b, t: [["A"], ["B"]] }, { a, b, t: [[5], [6]] }]) {
    assert.doesNotThrow(() => l.fire("ClientUI_FireOutput", "OHL1S:" + JSON.stringify(Object.assign({}, reply, { c: card, q: 0 }))));
  }
  l.advance(1500);
  assert.ok(!l.shown(l.ui("OHLOffer")), "no offer from a broken card");
  assert.ok(l.shown(l.title("amber")), "still linked");
});

check("lobby: a second boot on the same page leaves one of everything; the old instance is inert", () => {
  const l = lobbyWorld();
  l.seat("amber", 0, 1018009958, "JDBeast");
  l.boot();
  l.advance(1500);
  l.alias("amber", 0).events.onactivate();
  l.submit(l.alias("amber", 0).FindChild("OHLAliasEntry"), "Ace");
  l.advance(100);
  l.boot();
  l.advance(1500);
  for (const side of ["amber", "sapphire"]) assert.equal(l.ctn(side).FindChildrenWithClassTraverse("OHLTitle").length, 1, `${side}: one title row`);
  for (const cls of ["OHLCard", "OHLPicker"]) assert.equal(l.ctn("amber").FindChildrenWithClassTraverse(cls).length, 1, `one ${cls}`);
  for (const id of ["OHLSetup", "OHLShare"]) assert.equal(l.page.FindChildTraverse("LobbyInfo").Children().filter((p) => p.id === id).length, 1, `one #${id}`);
  const player = l.slots.amber[0].FindChildrenWithClassTraverse("Player")[0];
  assert.equal(player.Children().filter((p) => p.id === "OHLAlias" && p.valid).length, 1, "one alias button");
  assert.equal(l.slots.amber[0].FindChildTraverse("FriendNameContainer").style.opacity, "0", "the new instance hides the stock name again");
  // The button the new instance shows works once: one op per submit.
  const before = l.w.sent.filter((m) => m.startsWith("OHL1:") && m.includes('"alias"')).length;
  l.alias("amber", 0).events.onactivate();
  l.submit(l.alias("amber", 0).FindChild("OHLAliasEntry"), "Ace2");
  l.advance(100);
  assert.equal(l.w.sent.filter((m) => m.startsWith("OHL1:") && m.includes('"alias"')).length, before + 1, "one alias op");
  deq(l.hudState().players["1018009958"], { a: "Ace2", n: "JDBeast" });
});

check("lobby: SWAP HUD SIDES swaps names, tags, logos, series and bans but not aliases; a late or repeated swap is refused", () => {
  const l = lobbyWorld();
  l.boot();
  l.advance(1500);
  const host = l.hudHost();
  const next = JSON.parse(JSON.stringify(host.getState()));
  Object.assign(next.amber, { name: "Night Owls", tag: "NOW", series: 1, bans: [1, 2] });
  Object.assign(next.sapphire, { name: "Brass Saints", tag: "BRS", series: 0, bans: [3, 0] });
  next.players = { "90001": { a: "Ace", n: "Kestrel" } };
  host.setState(next);
  l.advance(100);
  const versionBefore = host.version();
  l.page.FindChildTraverse("OHLSwap").events.onactivate();
  l.advance(100);
  const s = l.hudState();
  deq([s.amber.name, s.amber.tag, s.amber.series, s.amber.bans, s.sapphire.name, s.sapphire.series, s.sapphire.bans],
    ["Brass Saints", "BRS", 0, [3, 0, 0], "Night Owls", 1, [1, 2, 0]]);
  deq(s.players, { "90001": { a: "Ace", n: "Kestrel" } }, "aliases stay with the players");
  assert.equal(text(l.title("amber").FindChildrenWithClassTraverse("OHLName")[0]), "Brass Saints");
  // The same swap delivered again (built on the old version): refused, nothing moves.
  const hostId = l.replies().pop().h;
  l.toHud(`OHL1:${JSON.stringify({ k: "swap", h: hostId, v: versionBefore, q: 99 })}`);
  l.advance(100);
  assert.equal(l.hudState().amber.name, "Brass Saints", "a repeated swap is refused");
  const refused = l.replies().filter((r) => r.q === 99);
  assert.equal(refused.length, 1);
  assert.equal(refused[0].e, "stale");
  // A match-end win lands between the page's view and its swap: the late swap must not undo it.
  const seen = host.version();
  const won = JSON.parse(JSON.stringify(host.getState()));
  won.sapphire.series = 2;
  host.setState(won);
  l.toHud(`OHL1:${JSON.stringify({ k: "swap", h: hostId, v: seen, q: 100 })}`);
  l.advance(100);
  deq([l.hudState().sapphire.name, l.hudState().sapphire.series], ["Night Owls", 2], "the win stays where it was won");
  // CLEAR BANS empties both teams' bans (a compound op on the current version).
  l.page.FindChildTraverse("OHLClearBans").events.onactivate();
  l.advance(100);
  deq([l.hudState().amber.bans, l.hudState().sapphire.bans], [[0, 0, 0], [0, 0, 0]]);
});

check("lobby: ops from an older HUD session and forged or oversized ops change nothing", () => {
  const l = lobbyWorld();
  l.boot();
  l.advance(1500);
  const before = JSON.stringify(l.hudState());
  const hostId = l.replies().pop().h;
  const op = (fields) => `OHL1:${JSON.stringify(Object.assign({ h: hostId, q: 7 }, fields))}`;
  for (const raw of [
    op({ k: "set", f: "name", t: "amber", x: "Old session", h: "someoneelse" }),
    op({ k: "set", f: "name", t: "amber", x: "x".repeat(29) }),
    op({ k: "set", f: "tag", t: "amber", x: "TOOLONG" }),
    op({ k: "set", f: "logo", t: "amber", x: "javascript:alert(1)" }),
    op({ k: "set", f: "logo", t: "amber", x: "https://user:pw@example.com/a.png" }),
    op({ k: "set", f: "series", t: "amber", x: 9 }),
    op({ k: "set", f: "bestOf", x: 4 }),
    op({ k: "set", f: "name", t: "org", x: "Nope" }),
    op({ k: "set", f: "style", t: "amber", x: "desk" }),
    op({ k: "alias", a: "0", n: "Bot", x: "Bot alias" }),
    op({ k: "alias", a: "abc", n: "X", x: "Y" }),
    op({ k: "alias", a: "90001", n: "X", x: "y".repeat(25) }),
    op({ k: "drop", x: 1 }),
    "OHL1:{not json",
    `OHL1:${JSON.stringify({ k: "set", f: "name", t: "amber", h: hostId, x: "z".repeat(3000) })}`,
    "OHL1:null", "OHL1:[]", 'OHL1:{"k":5}'
  ]) l.toHud(raw);
  l.advance(200);
  assert.equal(JSON.stringify(l.hudState()), before, "nothing changed");
  // A full alias list keeps the list as it is.
  const host = l.hudHost();
  const full = JSON.parse(JSON.stringify(host.getState()));
  full.players = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [String(80000 + i), { a: `P${i}`, n: `N${i}` }]));
  host.setState(full);
  l.toHud(op({ k: "alias", a: "70000", n: "New", x: "Newcomer", q: 8 }));
  l.advance(100);
  assert.equal(Object.keys(l.hudState().players).length, 24);
  assert.equal(l.replies().filter((r) => r.q === 8)[0].e, "alias list full");
});

check("lobby: format and series pips edit the HUD, and a shorter format caps the series", () => {
  const l = lobbyWorld();
  l.boot();
  l.advance(1500);
  const format = l.ui("OHLFormat");
  assert.equal(format.paneltype, "DropDown", "the format is a stock DropDown in the Observer HUD block");
  assert.equal(format.GetSelected().id, `OHLBo${l.hudState().bestOf}`, "shows the HUD's format");
  const sentBefore = l.w.sent.length;
  format.events.oninputsubmit(); // the same value again (SetSelected fires this too): nothing is sent
  assert.equal(l.w.sent.length, sentBefore);
  l.pickFormat(5);
  l.advance(100);
  assert.equal(l.hudState().bestOf, 5);
  const pips = () => l.title("sapphire").FindChildrenWithClassTraverse("OHLPip").filter((p) => l.shown(p));
  assert.equal(pips().length, 3, "Bo5: three pips");
  pips()[1].events.onactivate();
  l.advance(100);
  assert.equal(l.hudState().sapphire.series, 2);
  deq(pips().map((p) => p.BHasClass("OHLWon")), [true, true, false]);
  pips()[1].events.onactivate(); // the last won pip again: one fewer
  l.advance(100);
  assert.equal(l.hudState().sapphire.series, 1);
  l.pickFormat(1);
  l.advance(100);
  assert.equal(l.hudState().sapphire.series, 1, "Bo1 keeps one win");
  assert.equal(pips().length, 1);
  assert.equal(format.GetSelected().id, "OHLBo1");
  // Bo5 with 3 wins, then Bo7 keeps them, and Bo1 caps them at 1.
  l.pickFormat(5);
  l.advance(100);
  pips()[2].events.onactivate();
  l.advance(100);
  assert.equal(l.hudState().sapphire.series, 3);
  l.pickFormat(7);
  l.advance(100);
  deq([l.hudState().bestOf, l.hudState().sapphire.series], [7, 3]);
  l.pickFormat(1);
  l.advance(100);
  deq([l.hudState().bestOf, l.hudState().sapphire.series], [1, 1]);
  // A format the HUD changed elsewhere (the editor) shows here without being sent back.
  const next = JSON.parse(JSON.stringify(l.hudHost().getState()));
  next.bestOf = 3;
  const echoed = l.w.sent.filter((m) => m.startsWith("OHL1:") && m.includes('"bestOf"')).length;
  l.hudHost().setState(next);
  l.advance(100);
  assert.equal(format.GetSelected().id, "OHLBo3");
  assert.equal(l.w.sent.filter((m) => m.startsWith("OHL1:") && m.includes('"bestOf"')).length, echoed);
});

check("lobby: bans per team (2 or 3) edit the HUD; the team titles show that many ban tiles and keep a hidden ban", () => {
  const l = lobbyWorld();
  l.boot();
  l.advance(1500);
  const count = l.ui("OHLBanCount");
  assert.equal(count.paneltype, "DropDown", "bans per team is a stock DropDown beside the format");
  assert.equal(count.GetSelected().id, "OHLBans2", "shows the HUD's 2");
  const tiles = (key) => l.title(key).FindChildrenWithClassTraverse("OHLBan").filter((p) => l.shown(p)).length;
  deq([tiles("amber"), tiles("sapphire")], [2, 2]);
  const sentBefore = l.w.sent.length;
  count.events.oninputsubmit(); // the same value again: nothing is sent
  assert.equal(l.w.sent.length, sentBefore);
  count.SetSelected("OHLBans3");
  count.events.oninputsubmit();
  l.advance(100);
  assert.equal(l.hudState().banCount, 3, "the HUD shows three bans");
  deq([tiles("amber"), tiles("sapphire")], [3, 3]);
  // A ban in the third slot stays in the HUD's state while two show, and comes back with three.
  const next = JSON.parse(JSON.stringify(l.hudHost().getState()));
  next.amber.bans = [0, 0, 6];
  next.banCount = 2;
  const echoed = l.w.sent.filter((m) => m.startsWith("OHL1:") && m.includes('"banCount"')).length;
  l.hudHost().setState(next);
  l.advance(100);
  assert.equal(count.GetSelected().id, "OHLBans2", "a count changed in the editor shows here");
  assert.equal(l.w.sent.filter((m) => m.startsWith("OHL1:") && m.includes('"banCount"')).length, echoed, "and is not sent back");
  deq([tiles("amber"), l.hudState().amber.bans], [2, [0, 0, 6]]);
});

check("lobby: the offer shows only when last match's players changed sides, and re-checks the roster on click", () => {
  const amberIds = [101, 102, 103, 104, 105, 106];
  const sapphireIds = [201, 202, 203, 204, 205, 206];
  // Last match: Night Owls (101-106) on Amber beat Brass Saints (201-206) on Sapphire.
  const card = { a: amberIds, b: sapphireIds, t: [["Night Owls", "NOW", ""], ["Brass Saints", "BRS", ""]], w: 1 };
  const initial = { amber: { name: "Night Owls", tag: "NOW" }, sapphire: { name: "Brass Saints", tag: "BRS" } };
  const swapped = (l) => {
    // The players came back on the other sides (the organiser pressed the stock Swap Teams).
    sapphireIds.forEach((id, k) => l.seat("amber", k, id, `S${k}`, { event: false }));
    amberIds.forEach((id, k) => l.seat("sapphire", k, id, `A${k}`, { event: false }));
  };
  const l = lobbyWorld({ link: "fake", initial, card });
  swapped(l);
  l.boot();
  l.advance(1500);
  const offer = l.page.FindChildTraverse("OHLOffer");
  assert.ok(l.shown(offer), "offer shown");
  assert.match(text(offer.FindChildrenWithClassTraverse("OHLOfferText")[0]), /Night Owls are now on the Sapphire side/);
  // Three Amber players change before the click (no event yet): the click re-reads the roster and does nothing.
  for (let k = 0; k < 3; k++) l.seat("amber", k, 301 + k, `N${k}`, { event: false });
  offer.FindChildrenWithClassTraverse("SecondaryButton")[0].events.onactivate();
  l.advance(100);
  assert.equal(l.hudState().amber.name, "Night Owls", "no swap on a moved roster");
  assert.ok(!l.shown(offer), "the offer goes");
  // Back as before: the offer returns, and its button swaps.
  for (let k = 0; k < 3; k++) l.seat("amber", k, sapphireIds[k], `S${k}`);
  l.advance(500);
  assert.ok(l.shown(offer));
  offer.FindChildrenWithClassTraverse("SecondaryButton")[0].events.onactivate();
  l.advance(100);
  deq([l.hudState().amber.name, l.hudState().sapphire.name], ["Brass Saints", "Night Owls"]);
  assert.ok(!l.shown(offer), "names follow the players: no second offer");
  // NOT NOW hides it until the roster changes.
  const m = lobbyWorld({ link: "fake", initial, card });
  swapped(m);
  m.boot();
  m.advance(1500);
  const offer2 = m.page.FindChildTraverse("OHLOffer");
  assert.ok(m.shown(offer2));
  offer2.FindChildrenWithClassTraverse("SecondaryButton")[1].events.onactivate();
  assert.ok(!m.shown(offer2));
  m.advance(5000);
  assert.ok(!m.shown(offer2), "stays hidden for this roster");
  // A lobby that holds fewer than 4 of a side's players from the card gets no offer.
  const n = lobbyWorld({ link: "fake", initial, card });
  [301, 302, 303, 204, 205, 206].forEach((id, k) => n.seat("amber", k, id, `X${k}`, { event: false }));
  amberIds.forEach((id, k) => n.seat("sapphire", k, id, `A${k}`, { event: false }));
  n.boot();
  n.advance(1500);
  assert.ok(!n.shown(n.page.FindChildTraverse("OHLOffer")));
});

check("lobby: a ban tile opens a hero picker over its column; a hero is banned once, No Ban clears, Esc closes", () => {
  const l = lobbyWorld();
  l.boot();
  l.advance(1500);
  const ban = (side, slot) => l.ui(`OHL${side === "amber" ? "Amber" : "Sapphire"}Ban${slot}`);
  const picker = (side) => l.ctn(side).FindChildrenWithClassTraverse("OHLPicker")[0];
  const tile = (side, id) => picker(side).FindChildrenWithClassTraverse("OHLHeroTile").find((t) => t.children[0].heroId === id);
  deq([l.hudState().amber.bans, l.hudState().sapphire.bans], [[0, 0, 0], [0, 0, 0]]);
  assert.ok(!l.shown(picker("amber")), "picker closed");
  assert.equal(picker("amber").FindChildrenWithClassTraverse("OHLHeroTile").length, 0, "the grid is built on first open");
  ban("amber", 0).events.onactivate();
  assert.ok(l.shown(picker("amber")) && picker("amber").focused, "picker open and focused (Esc goes to it)");
  assert.equal(picker("amber").FindChildrenWithClassTraverse("OHLHeroTile").length, HEROES.length, "every hero");
  const [abrams, bebop, haze] = [6, 15, 13];
  tile("amber", abrams).events.onactivate();
  l.advance(100);
  deq(l.hudState().amber.bans, [abrams, 0, 0]);
  assert.ok(!l.shown(picker("amber")), "a pick closes the picker");
  assert.ok(ban("amber", 0).BHasClass("OHLBanSet"));
  assert.equal(ban("amber", 0).FindChildrenWithClassTraverse("OHLBanImage")[0].heroId, abrams, "the tile shows the hero");
  // Sapphire bans the same hero: it moves (a hero is banned once), and the picker marked it.
  ban("sapphire", 1).events.onactivate();
  assert.ok(tile("sapphire", abrams).BHasClass("OHLTaken"), "banned elsewhere: marked");
  tile("sapphire", abrams).events.onactivate();
  l.advance(100);
  deq([l.hudState().amber.bans, l.hudState().sapphire.bans], [[0, 0, 0], [0, abrams, 0]]);
  assert.ok(!ban("amber", 0).BHasClass("OHLBanSet"), "the old tile empties");
  // Opening a picker closes the other boxes; the current hero is marked; Esc closes without a change.
  ban("amber", 1).events.onactivate();
  tile("amber", bebop).events.onactivate();
  l.advance(100);
  ban("amber", 1).events.onactivate();
  assert.ok(tile("amber", bebop).BHasClass("OHLCurrent"));
  l.title("sapphire").FindChildrenWithClassTraverse("OHLTitleMain")[0].events.onactivate();
  assert.ok(!l.shown(picker("amber")) && l.shown(l.card("sapphire")), "one box at a time");
  l.card("sapphire").events.oncancel();
  ban("amber", 1).events.onactivate();
  const before = JSON.stringify(l.hudState());
  picker("amber").events.oncancel();
  assert.ok(!l.shown(picker("amber")), "Esc closes the picker");
  assert.equal(JSON.stringify(l.hudState()), before);
  // No Ban clears that slot only.
  ban("amber", 1).events.onactivate();
  picker("amber").FindChildrenWithClassTraverse("OHLPill")[0].events.onactivate();
  l.advance(100);
  deq([l.hudState().amber.bans, l.hudState().sapphire.bans], [[0, 0, 0], [0, abrams, 0]]);
  // The HUD checks a forged ban: a bad slot or id changes nothing; a ban of the other team's hero moves it.
  const hostId = l.replies().pop().h;
  const op = (fields) => l.toHud(`OHL1:${JSON.stringify(Object.assign({ k: "set", f: "ban", h: hostId, q: 50 }, fields))}`);
  const kept = JSON.stringify(l.hudState());
  op({ t: "amber", i: 3, x: haze });
  op({ t: "amber", i: -1, x: haze });
  op({ t: "amber", i: 0, x: 1001 });
  op({ t: "amber", i: 0, x: "13" });
  op({ t: "org", i: 0, x: haze });
  for (const x of [1, 4, "3", null]) op({ f: "banCount", x });
  l.advance(100);
  assert.equal(JSON.stringify(l.hudState()), kept, "forged bans and ban counts refused");
  // CLEAR BANS (the block's button) empties both.
  op({ t: "amber", i: 0, x: haze });
  l.advance(100);
  l.ui("OHLClearBans").events.onactivate();
  l.advance(100);
  deq([l.hudState().amber.bans, l.hudState().sapphire.bans], [[0, 0, 0], [0, 0, 0]]);
});

check("lobby: the Observer HUD block sits under the stock match settings; the stage edits the HUD", () => {
  const l = lobbyWorld();
  l.boot();
  l.advance(1500);
  const info = l.ui("LobbyInfo");
  const kids = info.Children();
  const setup = l.ui("OHLSetup");
  assert.equal(kids.indexOf(setup), kids.indexOf(info.FindChildrenWithClassTraverse("SettingsPanel")[0]) + 1, "right after the settings");
  assert.ok(kids.indexOf(setup) < kids.indexOf(info.FindChildrenWithClassTraverse("Unassigned")[0]), "before Unassigned");
  // Nothing of OH is left in the stock button row or under VS.
  assert.equal(l.page.FindChildrenWithClassTraverse("LobbyButtons")[0].Children().length, 3, "stock buttons only");
  const stage = l.ui("OHLStage");
  assert.equal(stage.text, l.hudState().stage);
  l.submit(stage, "Semi Final");
  l.advance(100);
  assert.equal(l.hudState().stage, "Semi Final");
  // Esc puts the HUD's stage back; nothing is sent.
  stage.text = "Typo";
  stage.events.oncancel();
  assert.equal(stage.text, "Semi Final");
  // Too long: refused with a note, nothing changes.
  l.submit(stage, "s".repeat(29));
  l.advance(100);
  assert.equal(l.hudState().stage, "Semi Final");
  assert.match(text(l.ui("OHLLink")), /at most 28/);
  // A box being typed in is never overwritten by an echo.
  stage.keyFocus = true;
  stage.text = "Grand F";
  const next = JSON.parse(JSON.stringify(l.hudHost().getState()));
  next.amber.series = 1;
  l.hudHost().setState(next);
  l.advance(100);
  assert.equal(stage.text, "Grand F");
});

check("lobby: SHARE copies the HUD's code, imports a code (keeping DEV), refuses bad codes, and RESET ALL needs two presses", () => {
  const l = lobbyWorld();
  l.boot();
  l.advance(1500);
  const host = l.hudHost();
  const mine = JSON.parse(JSON.stringify(host.getState()));
  Object.assign(mine, { event: "Spring Cup", stage: "Final", style: "desk" });
  mine.amber.name = "Night Owls";
  mine.dev.debuffPollMs = 1000;
  host.setState(mine);
  l.advance(100);
  const share = l.ui("OHLShare");
  assert.ok(!l.shown(share), "share closed");
  l.ui("OHLShareOpen").events.onactivate();
  assert.ok(l.shown(share) && l.ui("OHLShareOpen").BHasClass("OHLSelected"));
  // Copy: the HUD answers with the full code (event, look and all), copied through the box.
  l.ui("OHLShareCopy").events.onactivate();
  l.advance(100);
  const entry = l.ui("OHLShareEntry");
  const S = stateApiOf();
  const code = l.w.harness.clipboardWrites.slice(-1)[0];
  assert.ok(code && code.startsWith("OHC1."), "code copied through the box");
  assert.equal(entry.text, "", "the box is emptied after a copy (live: a code-long line draws nothing)");
  const decoded = S.normalize(S.decodeShare(code).state);
  deq([decoded.event, decoded.stage, decoded.style, decoded.amber.name], ["Spring Cup", "Final", "desk", "Night Owls"]);
  assert.match(text(l.ui("OHLShareStatus")), /copied/);
  // Import a code made on another PC: the setup changes, this PC's DEV settings stay.
  const other = S.normalize({ event: "Other Cup", amber: { name: "Brass Saints" }, sapphire: { name: "Iron Owls" }, dev: { debuffPollMs: 100 }, bestOf: 5 });
  const otherCode = S.encodeShare(other);
  l.submit(entry, otherCode);
  l.advance(100);
  deq([l.hudState().event, l.hudState().amber.name, l.hudState().bestOf, l.hudState().dev.debuffPollMs], ["Other Cup", "Brass Saints", 5, 1000]);
  assert.match(text(l.ui("OHLShareStatus")), /Imported/);
  // Bad codes: told here, nothing sent, nothing changed.
  const before = JSON.stringify(l.hudState());
  const sent = l.w.sent.length;
  l.submit(entry, "hello");
  assert.match(text(l.ui("OHLShareStatus")), /Not an Observer HUD code/);
  l.submit(entry, otherCode.slice(0, -2) + "AA");
  assert.match(text(l.ui("OHLShareStatus")), /Not an Observer HUD code/);
  assert.equal(l.w.sent.length, sent, "nothing sent for a bad code");
  // A forged import op with a bad code is refused by the HUD too, and so is an oversized op.
  const hostId = l.replies().pop().h;
  l.toHud(`OHL1:${JSON.stringify({ k: "import", h: hostId, c: "OHC1.00000000.e30", q: 60 })}`);
  l.toHud(`OHL1:${JSON.stringify({ k: "import", h: hostId, c: otherCode + " ".repeat(S.MAX_SHARE + 1100), q: 61 })}`);
  l.advance(100);
  assert.equal(JSON.stringify(l.hudState()), before);
  assert.equal(l.replies().filter((r) => r.q === 60)[0].e, "code");
  assert.equal(l.replies().filter((r) => r.q === 61).length, 0, "oversized: dropped");
  // A large real code (logos at the URL limit, 24 aliases) still fits one op.
  const big = S.normalize({ amber: { logo: { url: `https://example.com/${"a".repeat(480)}.png` } }, sapphire: { logo: { url: `https://example.com/${"b".repeat(480)}.png` } },
    org: { logo: { url: `https://example.com/${"c".repeat(480)}.png` } },
    players: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [String(70000 + i), { a: `Alias number ${i}`, n: `Steam name ${i}` }])) });
  const bigCode = S.encodeShare(big);
  assert.ok(bigCode.length > 3000, `big code ${bigCode.length}`);
  l.submit(entry, bigCode);
  l.advance(100);
  assert.equal(Object.keys(l.hudState().players).length, 24, "big code imported");
  // Every legal setup fits one code (user 2026-11-03): 24 aliases in CJK text and three long logo links
  // copy as one code over 8192 characters, through the HUD's reply and the box, and import back.
  const wide = JSON.parse(JSON.stringify(l.hudState()));
  for (const account of Object.keys(wide.players)) wide.players[account] = { a: "界".repeat(24), n: "界".repeat(32) };
  host.setState(wide);
  l.advance(100);
  const clips = l.w.harness.clipboardWrites.length;
  l.ui("OHLShareCopy").events.onactivate();
  l.advance(100);
  assert.equal(l.w.harness.clipboardWrites.length, clips + 1, "copied");
  const wideCode = l.w.harness.clipboardWrites.slice(-1)[0];
  assert.ok(wideCode.length > 8192, `one code of ${wideCode.length} characters`);
  deq(S.normalize(S.decodeShare(wideCode).state).players, l.hudState().players);
  host.setState(S.defaults());
  l.advance(100);
  l.submit(entry, wideCode);
  l.advance(100);
  deq(l.hudState().players, wide.players, "a long code imports whole");
  // RESET ALL: the first press only arms (and says what it does); a second press within 4 s resets.
  const reset = l.ui("OHLReset");
  reset.events.onactivate();
  l.advance(100);
  assert.equal(Object.keys(l.hudState().players).length, 24, "one press changes nothing");
  assert.ok(reset.BHasClass("OHLArmed"));
  assert.match(text(l.ui("OHLShareStatus")), /forget the saved setup/);
  l.advance(4500);
  assert.ok(!reset.BHasClass("OHLArmed"), "disarms after 4 s");
  reset.events.onactivate();
  l.advance(1000);
  reset.events.onactivate();
  l.advance(100);
  const defaults = S.defaults();
  deq([l.hudState().players, l.hudState().amber.name, l.hudState().event, l.hudState().dev], [{}, defaults.amber.name, defaults.event, defaults.dev]);
  assert.match(text(l.ui("OHLShareStatus")), /back to the defaults/);
  // Esc in the code box or the close button shuts the card.
  l.ui("OHLShareEntry").events.oncancel();
  assert.ok(!l.shown(share), "Esc closes the share card");
  l.ui("OHLShareOpen").events.onactivate();
  assert.ok(l.shown(share));
  l.title("amber").FindChildrenWithClassTraverse("OHLTitleMain")[0].events.onactivate();
  assert.ok(!l.shown(share) && l.shown(l.card("amber")), "a team card closes the share card");
  l.card("amber").events.oncancel();
  l.ui("OHLShareOpen").events.onactivate();
  l.ui("OHLShareClose").events.onactivate();
  assert.ok(!l.shown(share), "the close button shuts it");
  // A late reset (built on an older version) is refused.
  const seen = host.version();
  const edited = JSON.parse(JSON.stringify(host.getState()));
  edited.amber.name = "Fresh";
  host.setState(edited);
  l.toHud(`OHL1:${JSON.stringify({ k: "reset", h: hostId, v: seen, q: 70 })}`);
  l.advance(100);
  assert.equal(l.hudState().amber.name, "Fresh");
  assert.equal(l.replies().filter((r) => r.q === 70)[0].e, "stale");
});

check("lobby: without a HUD answer the controls stay off and the stock titles show", () => {
  const l = lobbyWorld({ link: "none" });
  l.seat("amber", 0, 1018009958, "JDBeast");
  l.boot();
  l.advance(15000);
  assert.ok(!l.shown(l.title("amber")), "no OH team row");
  assert.notEqual(l.ctn("amber").FindChildrenWithClassTraverse("TeamTitleText")[0].style.visibility, "collapse", "stock title shown");
  assert.equal(l.page.FindChildTraverse("OHLSwap").enabled, false);
  assert.ok(!l.shown(l.alias("amber", 0)), "no alias button");
  assert.match(text(l.page.FindChildTraverse("OHLLink")), /Not linked/);
  assert.ok(l.page.FindChildTraverse("OHLSetup").BHasClass("OHLOff"), "the block dims");
  for (const id of ["OHLFormat", "OHLBanCount", "OHLStage", "OHLClearBans", "OHLShareOpen"]) assert.equal(l.page.FindChildTraverse(id).enabled, false, id);
  // The HUD comes up later: the page links on its next hello.
  l.w.bootHost();
  l.advance(6000);
  assert.ok(l.shown(l.title("amber")));
  assert.ok(l.shown(l.alias("amber", 0)));
  assert.ok(!/Not linked/.test(text(l.page.FindChildTraverse("OHLLink"))));
});

check("lobby: a hidden page sends and writes nothing, and the HUD stops echoing to a lobby that left", () => {
  const l = lobbyWorld({ visible: false });
  l.seat("amber", 0, 1018009958, "JDBeast");
  l.boot();
  l.advance(2000);
  // Party events while hidden only mark the roster dirty (m3 audit O3: they used to place alias buttons).
  l.seat("amber", 1, 90004, "Doyle", { event: false });
  for (const key of Object.keys(l.counts)) l.counts[key] = 0;
  const lobbyTraffic = () => l.w.sent.filter((m) => m.startsWith("OHL1")).length;
  const sentBefore = lobbyTraffic();
  l.fire("CitadelPartyUpdated", "123456789012345678");
  l.advance(60000);
  assert.equal(lobbyTraffic(), sentBefore, "no hello (and no echo) while hidden");
  const writes = (l.counts.styleWrites || 0) + (l.counts.textWrites || 0) + (l.counts.classWrites || 0);
  assert.equal(writes, 0, `hidden page writes ${JSON.stringify(l.counts)}`);
  // One class read a second (PageVisible) and the schedule: under the idle budget.
  const perSecond = per(l.counts, 60);
  assert.ok(weighted(perSecond) + 1 <= BUDGET_US.idle, `hidden page ${weighted(perSecond)} us/s ${JSON.stringify(perSecond)}`);
  // Shown, linked, then hidden again: 15 s after the last hello the HUD no longer echoes its changes.
  l.page.AddClass("PageVisible");
  l.advance(3000);
  assert.ok(l.replies().length > 0, "linked while shown");
  assert.ok(l.shown(l.alias("amber", 1)), "the dirty roster is read when the page shows again");
  l.page.RemoveClass("PageVisible");
  l.advance(20000);
  const echoes = l.replies().length;
  const next = JSON.parse(JSON.stringify(l.hudState()));
  next.stage = "Semi Final";
  l.hudHost().setState(next);
  l.advance(1000);
  assert.equal(l.replies().length, echoes, "no echo to a lobby that left");
  results.lobbyHidden = { usPerSecond: weighted(perSecond), ops: perSecond };
});

const out = path.join(REPO, ".tmp", "observer-hud-validate.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`${results.checks.length} checks passed; artifact ${path.relative(REPO, out)}`);
// A filter that matches nothing must not read as a pass (the build clears OH_CHECK; m3 audit B4).
if (!results.checks.length) {
  console.error(`no check matched OH_CHECK=${process.env.OH_CHECK || ""}`);
  process.exitCode = 1;
}
