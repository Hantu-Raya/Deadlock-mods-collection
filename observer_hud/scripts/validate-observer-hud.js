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
const pageScript = (file) => (fs.existsSync(file) ? /<script>([\s\S]*)<\/script>/.exec(fs.readFileSync(file, "utf8"))[1] : "");
const storeScript = pageScript(STORE_PAGE);
const v1Script = pageScript(V1_PAGE);
const PAGE_SCRIPTS = { [STORE_URL]: storeScript, [V1_URL]: v1Script };
// The store page's clock follows the harness (cards expire 2 days after their at).
const PAGE_NOW = 7000000;
const clockDate = (nowMs) => class extends Date {
  constructor(...args) { if (args.length) super(...args); else super(nowMs()); }
  static now() { return nowMs(); }
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
const BUDGET_US = { spectating: 222, countdown: 280, idle: 6, after: 6, playing: 6, scan: 12 };
// The post-game board (plan phase 2): at most 11 native calls per second while its page shows and
// nothing changes; while hidden one visibility check a second (a reopen can bring no event, live).
const BUDGET_BOARD = { calls: 11, us: 3, hiddenUs: 2 };
const ATTRIB = { on: !!process.env.OH_ATTRIB, map: new Map() };

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
  if (process.env.OH_CHECK && !name.includes(process.env.OH_CHECK)) return;
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
  editor: parseLayout(read("panorama/layout/observer_hud/editor.xml")),
  relay: parseLayout(read("panorama/layout/observer_hud/debuff_relay.xml"))
};
const HPV3_ESCAPE = path.join(REPO, "hp_colors_rewrite_v3/panorama/layout/hud_escape_menu.xml");
const HOST_FILES = ["oh_state.js", "oh_heroes.js", "oh_debuff_icons.js", "oh_item_icons.js", "oh_host.js", "oh_menu.js",
  "oh_debuffs.js", "oh_buys.js"];
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
    "file://{resources}/layout/observer_hud/editor.xml": OWN.editor
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
  // Only the host layouts, the post-game page and the VData override stock files; everything else has this mod's own names.
  deq(layouts.filter((name) => !name.startsWith("observer_hud/")), ["hud_spectate_bar", "citadel_status_effect", "post_game/citadel_db_page_post_game_new"]);
  assert.ok(styles.every((name) => name.startsWith("observer_hud/")) && scripts.every((name) => name.startsWith("observer_hud/")));
  assert.match(wrapper, /pak10_dir\.vpk/, "pak10");
});

check("the three overrides are the pinned stock files plus this mod's include lines only", () => {
  const pin = JSON.parse(read("stock-pin.json"));
  const overrides = {
    "panorama/layout/hud_spectate_bar.xml": "game/citadel/pak01_dir/panorama/layout/hud_spectate_bar.xml",
    "panorama/layout/citadel_status_effect.xml": "game/citadel/pak01_dir/panorama/layout/citadel_status_effect.xml"
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
    "citadel_hud_hero_shop", "hud_unit_indicators_v2", "hud_data_feed", "citadel_hud_data_feed_info"]) {
    const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(MODULE, `stock/${name}.xml`))).digest("hex");
    assert.equal(digest, pin.files[`game/citadel/pak01_dir/panorama/layout/${name}.xml`], `stock/${name}.xml matches the pin`);
  }
  const feedCss = fs.readFileSync(path.join(MODULE, "stock/hud_data_feed.css"));
  assert.equal(crypto.createHash("sha256").update(feedCss).digest("hex"), pin.files["game/citadel/pak01_dir/panorama/styles/hud_data_feed.css"]);
  // The host restores the kill feed to the stock margin it reads from here.
  assert.match(String(feedCss), /#EventFeed\s*\{[^}]*margin-top:\s*200px;/);
  assert.match(read("panorama/scripts/observer_hud/oh_host.js"), /const FEED_STOCK_TOP = 200;/);
  // Script order in the host: state and tables first, the host before the editor and the column.
  const spectate = read("panorama/layout/hud_spectate_bar.xml");
  const order = [...spectate.matchAll(/observer_hud\/(\w+)\.vjs_c/g)].map((m) => `${m[1]}.js`);
  deq(order, HOST_FILES);
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
      .concat([0, 1].flatMap((slot) => [`OHBan${side}${slot}`, `OHBan${side}${slot}Image`]));
    for (const id of expected) assert.ok(barIds.includes(id), `tournament_bar.xml has #${id}`);
    for (const id of ["Team", "Plate", "Logo", "Mono", "Name", "Cap", "Join", "Score", "ScoreText"].map((part) => `OH${part}${side}`)) {
      assert.ok(bandIds.includes(id) && !barIds.includes(id), `band.xml has #${id}`);
    }
    // The join draws over the strip and under the names row.
    assert.ok(bandIds.indexOf(`OHStrip${side}`) < bandIds.indexOf(`OHJoin${side}`) && bandIds.indexOf(`OHJoin${side}`) < bandIds.indexOf("OHWhoRow"), `#OHJoin${side} between strip and names`);
    const desk = ["Desk", "DeskLogo", "DeskMono", "DeskName", "DeskBans", "Strip", "Corner", "MidSeries"].map((part) => `OH${part}${side}`)
      .concat([0, 1].flatMap((slot) => [`OHDeskBan${side}${slot}`, `OHDeskBan${side}${slot}Image`]));
    for (const id of desk) assert.ok(bandIds.includes(id), `band.xml has #${id}`);
    assert.match(host, /find\(`OHTeam\$\{side\}`\)/);
    assert.match(host, /find\(`OHDesk\$\{side\}`\)/);
  }
  // Every id the editor script looks up exists once in the editor layout (it refuses to attach otherwise).
  const stateTables = { $: { Msg() {} } };
  vm.runInNewContext(read("panorama/scripts/observer_hud/oh_state.js"), stateTables);
  const ctx = { $: { OHState: { BUYS_SHOW: stateTables.$.OHState.BUYS_SHOW }, OHHost: { onChange() {} }, GetContextPanel: () => ({}), Schedule() {}, Msg() {} }, OH_HEROES: [] };
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
  deq(blocks, [[".WindowRoot.CLASS_PLAYER .statusEffect.stunned", "opacity: 0; width: 0px; height: 0px; margin: 0px;"]]);
  assert.equal(classesOf(STOCK.overlay).join(" "), "WindowRoot", "the stock overlay root is .WindowRoot");
  assert.match(read("panorama/layout/citadel_status_effect.xml"), /citadel_status_effect\.vcss" \/>\n\t\t<include src="s2r:\/\/panorama\/styles\/observer_hud\/oh_status_world\.vcss_c" \/>/);
  // Poll defaults and ranges agree between the state and the world sampler.
  const stateJs = read("panorama/scripts/observer_hud/oh_state.js");
  assert.match(stateJs, /DEBUFF_POLL_STEPS = \[100, 250, 500, 1000, 2000\]/);
  assert.match(stateJs, /debuffPollMs: 250/);
  assert.match(worldJs, /DEFAULT_POLL_MS = 250;\n  const MIN_POLL_MS = 100;\n  const MAX_POLL_MS = 2000;/);
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
  deq(s.amber.bans, [13, 0], "a hero is banned once per team");
  deq(s.sapphire.bans, [0, 6], "and once across teams");
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
    "the band sits right after #TopBar: above the stock top bar's glow, under the panels after it");
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
    if (look === "OHLookDesk") assert.ok(gone("OHDeskLeft"));
    w.rebuildTeam("TeamFriendly");
    w.geometry({ friendX: 330, enemyX: 1062 });
    w.advance(2200);
    assert.ok(!gone("OHWho0") && !gone("OHStripLeft"), `${look}: Amber's names and strip are back`);
    assert.equal(w.who("Kestrel"), "Kestrel", `${look}: the rebuilt cards have their names`);
    assert.equal(countIn(w.topBar, "OHDebuffsHost"), 12, `${look}: every card has its status column again`);
    if (look === "OHLookDesk") deq(["OHArch", "OHRings", "OHDeskLeft"].map(gone), [false, false, false]);
  }
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
  deq([w.state().amber.bans, w.state().sapphire.bans], [[0, 0], [0, haze]]);
  assert.ok(!w.ui("OHBansLeft").BHasClass("OHHasBans"));
  assert.equal(w.ui("OHBanRight1Image").heroId, haze);
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
  deq(w.host().graphPins(), [{ m: 0, v: 0 }, { m: 5, v: -0.6 }].map((p) => ({ m: p.m, v: Math.round(p.v * 10) / 10 })).map((p) => p),
    "0:00 plus the 5:00 pin");
  assert.ok(Math.abs(w.host().graphPins()[1].v + 0.6) < 1e-9);
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
  assert.equal(text(w.ui("OHVersion")), "v0.1.0");
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
  assert.ok(!timer.style.opacity && !timer.style.visibility, "the stock circle is back outside spectating");
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
  deq([w.state().amber.bans, w.state().sapphire.bans], [[0, 0], [0, 0]]);
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
  assert.ok(w.ui("OHTeamLeft").BHasClass("OHCurve") && w.ui("OHTeamRight").BHasClass("OHCurve"));
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
  assert.ok(!w.ui("OHTeamLeft").BHasClass("OHCurve"), "a square logo keeps the step");
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
  for (const id of ["PausedLabel", "PauserLabel", "UnpauseButtonLabel"]) assert.equal(info.FindChildTraverse(id).style.opacity || "", "", id);
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

check("column: a hero's debuff reaches its card with the applying team's colour and a countdown", () => {
  const w = statusWorld();
  const start = w.harness.now;
  w.giveDebuff("Volt", "ability_viper_petrifybola", { radial: (now) => -360 + ((now - start) / 6000) * 360 });
  w.advance(3000);
  deq(w.icons("Volt"), [PETRIFY]);
  const slot = w.shownSlots("Volt")[0];
  assert.ok(slot.BHasClass("OHByAmber"), "a debuff on a Sapphire hero comes from Amber");
  assert.equal(w.slotText(slot, "OHDebuffTime", "OHHasTime"), "4", "3 s left reads one second longer (user 2026-10-23)");
  // Abilities outside the spec never draw.
  w.giveDebuff("Mole", "ability_some_unlisted_debuff");
  w.advance(1000);
  deq(w.icons("Mole"), []);
  // The status goes: the slot fades, then frees.
  w.units.Volt.container.children[0].DeleteAsync();
  w.advance(600);
  assert.ok(w.slots("Volt")[0].BHasClass("OHFading"));
  w.advance(1500);
  assert.ok(!w.slots("Volt")[0].BHasClass("OHShown"));
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
  deq(list.map((card) => Object.keys(card).filter((key) => key !== "who").sort()), list.map(() => ["debuffs", "label", "panel", "teamKey", "ult"]));
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

// ---------------------------------------------------------------- native cost metric

let lastNodes = 0; // subtree node visits of the last counted window
// Counts every crossing the scripts make, including the ones the shared adapter books only as
// "traversal" (GetChildCount) and the child wrappers Children() allocates (live P0: about 140 ns each).
// OH_ATTRIB=1 prints the weighted cost per script function for each counted window (dev aid).
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
function boardWorld({ visible = true, disk = null, offline = false, graph = null } = {}) {
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
      if (type === "CitadelUserName" && props.accountid) new MockPanel("Label", created, "").__text = `Persona ${props.accountid}`;
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
  const tipLog = { opaqueFrames: 0, shows: 0 };
  let tip = null;
  const showTip = (col) => {
    const cols = graphCanvas ? graphCanvas.children : [];
    const c = cols.indexOf(col);
    if (c < 0) return;
    if (!tip) tip = new MockPanel("CitadelTooltipGraphPlayerNetWorth", dash, "PostGameGraphTooltip");
    tip.visible = true;
    tipLog.shows++;
    for (const kid of tip.children.slice()) kid.DeleteAsync();
    const f = (c + 1) / cols.length;
    const t = Math.round(f * graph.duration);
    const a = Math.round(graph.souls[0] * f);
    const b = Math.round(graph.souls[1] * f);
    const label = (text) => { new MockPanel("Label", tip, "").__text = text; };
    label(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);
    for (const [name, v] of [["Archmother", b], ["Hidden King", a]]) {
      label(name);
      label(v.toLocaleString("en-US"));
      label(`(${Math.round(100 * v / (a + b))}%)`);
    }
    label((a + b).toLocaleString("en-US"));
  };
  // A frame boundary while the scan runs: the tooltip must not be drawn (user report 2026-10-25).
  let scanning = false;
  const frameCheck = () => {
    scanning = harness.logs.some((l) => l.startsWith("[NS] board shown")) && !harness.logs.some((l) => l.startsWith("[NS] scan done"));
    if (scanning && tip && tip.visible && String(tip.style.opacity) !== "0") tipLog.opaqueFrames++;
  };
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
    tip: () => tip,
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
  assert.ok(w.boardHost().FindChildTraverse("NSGraph").BHasClass("NSOn"), "lead graph shown");
  assert.ok(w.tipLog.shows > 0, "the scan hovered the graph");
  assert.equal(w.tipLog.opaqueFrames, 0, "tooltip drawn during the scan");
  assert.equal(String(w.tip().style.opacity), "0", "tooltip stays transparent after the scan");
  // Opening the Graphs screen gives the tooltip back for the user's own hovers.
  w.selectScreen("GraphsScreen");
  w.advance(1500);
  assert.equal(String(w.tip().style.opacity), "1", "tooltip restored on the Graphs screen");
  // The user's own hover leaves the tooltip open; back on the scoreboard it must not stay over the board
  // (user report 2026-10-26).
  w.selectScreen("ScoreboardScreen");
  w.advance(1500);
  assert.equal(String(w.tip().style.opacity), "0", "tooltip hidden again off the Graphs screen");
  w.selectScreen("GraphsScreen");
  w.advance(1500);
  assert.equal(String(w.tip().style.opacity), "1", "and back on the Graphs screen");
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
  // Picking the Scoreboard screen replays the entrance at once, not at the next safety check, at any
  // phase of that check.
  const frame = w.boardHost().FindChildTraverse("NSFrame");
  let replayedAt = -1;
  const removeClass = frame.RemoveClass;
  frame.RemoveClass = function (cls) { if (cls === "NSIntro" && replayedAt < 0) replayedAt = w.harness.now; return removeClass.call(this, cls); };
  for (const phase of [0, 350, 700]) {
    w.selectScreen("Team1Screen");
    w.advance(3000 + phase);
    replayedAt = -1;
    const pickedAt = w.harness.now;
    w.selectScreen("ScoreboardScreen");
    w.advance(1500);
    assert.ok(replayedAt >= 0 && replayedAt - pickedAt <= 200, `entrance replayed ${replayedAt - pickedAt} ms after the pick (phase ${phase})`);
    assert.ok(frame.BHasClass("NSIntro"), "entrance class back");
  }
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
  entries.forEach((e, i) => { if (i >= 6 && i < 11) e.FindChildTraverse("PlayerName").accountid = ACCOUNT_OF([...AMBER, ...SAPPHIRE][i]); });
  w.advance(3000);
  reset(w);
  stop = counted(w.harness);
  w.advance(10000);
  const done = per(stop(), 10);
  console.log(`   account scan (11 of 12 known) ${weighted(done)} us/s, ${total(done)} calls/s ${JSON.stringify(done)}`);
  assert.ok((done.textReads || 0) <= (baseOps.textReads || 0) && (done.childrenReads || 0) <= (baseOps.childrenReads || 0) + 0.5, `11 of 12 known: the scan is off ${JSON.stringify(done)}`);
  assert.ok(weighted(done) - base <= 2.5, `11 of 12 known: ${weighted(done)} vs ${base} us/s`);
  results.accountScan = { baseUs: base, scanningUs: weighted(scanning), doneUs: weighted(done) };
});

const out = path.join(REPO, ".tmp", "observer-hud-validate.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`${results.checks.length} checks passed; artifact ${path.relative(REPO, out)}`);
