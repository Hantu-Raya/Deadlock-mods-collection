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
// its title comes back through the panel's HTMLTitle handler 50 ms later.
const STORE_PAGE = process.env.OH_STORE_PAGE || "D:/hpv2-store/oh/index.html";
const STORE_URL = "https://hantu-raya.github.io/hpv2-store/oh/";
const storeScript = fs.existsSync(STORE_PAGE) ? /<script>([\s\S]*)<\/script>/.exec(fs.readFileSync(STORE_PAGE, "utf8"))[1] : "";
MockPanel.prototype.SetURL = function (url) {
  let root = this;
  while (root.GetParent()) root = root.GetParent();
  const web = root.__web;
  if (!web || web.offline) return true;
  const base = String(url).split("#")[0];
  if (base !== STORE_URL) { this.__page = null; return true; }
  const panel = this;
  if (!panel.__page) {
    const page = { title: "", hash: "", href: url, listeners: [] };
    page.sandbox = {
      window: { addEventListener: (name, fn) => { if (name === "hashchange") page.listeners.push(fn); } },
      location: { get hash() { return page.hash; }, get href() { return page.href; } },
      document: { set title(value) { page.title = value; }, get title() { return page.title; } },
      localStorage: {
        getItem: (key) => Object.prototype.hasOwnProperty.call(web.disk, key) ? web.disk[key] : null,
        setItem: (key, value) => { web.disk[key] = String(value); },
        removeItem: (key) => { delete web.disk[key]; }
      },
      JSON, Math, Error, String, decodeURIComponent
    };
    page.hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
    panel.__page = page;
    vm.runInNewContext(storeScript, page.sandbox);
  } else {
    panel.__page.href = url;
    panel.__page.hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
    for (const fn of panel.__page.listeners) fn();
  }
  const title = panel.__page.title;
  if (!web.mute) web.harness.scheduler.schedule(0.05, () => { if (panel.events.HTMLTitle) panel.events.HTMLTitle(panel, title); });
  return true;
};

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
// Synthetic native calls per second (2026-10-23 audit with m1: spectating 1451.8 -> 1189.8, idle 13.7 -> 11.7,
// every card counting down 2067.6 -> 1575.2, all under the live-like scenario). Re-measure before raising.
const BUDGET_SPECTATING = 1200;
const BUDGET_IDLE = 12;
const BUDGET_COUNTDOWN = 1590;

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

function check(name, fn) {
  if (process.env.OH_CHECK && !name.includes(process.env.OH_CHECK)) return;
  WORLDS.length = 0;
  try {
    fn();
    const stuck = stuckHidden();
    assert.deepEqual(stuck, [], `visibility collapse then null leaves these hidden live: ${stuck.join(", ")}`);
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
  purchase: parseLayout(/<snippet name="RecentPurchase">([\s\S]*?)<\/snippet>/.exec(read("stock/citadel_hud_hero_shop.xml"))[1])
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
        else if (key === "text") {
          // A "{s:name}" text binds to the nearest ancestor's dialog variable, as the engine resolves it.
          const bound = /^\{s:(\w+)\}$/.exec(String(value));
          let owner = parent;
          while (bound && owner && !(owner.__dialog && bound[1] in owner.__dialog)) owner = owner.parent;
          created.__text = bound && owner ? owner.__dialog[bound[1]] : value;
        }
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
  hudRoot.__web = { disk: disk || {}, offline, harness };
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
  for (const [teamId, names] of [["TeamFriendly", AMBER], ["TeamEnemy", SAPPHIRE]]) {
    const team = topBar.FindChildTraverse(teamId);
    loadInto(team, STOCK.team);
    const players = team.FindChildTraverse("PlayersContainer");
    teams[teamId] = names.map((name) => {
      const card = instantiate(STOCK.player, players);
      for (const label of card.FindChildrenWithClassTraverse("AlwaysPlayerName")
        .concat(card.FindChildrenWithClassTraverse("PlayerName"))) label.__text = name;
      card.FindChildTraverse("HeroBadge").heroid = heroOf(name)[0];
      card.FindChildrenWithClassTraverse("HeroName")[0].__text = heroOf(name)[1];
      return card;
    });
  }
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
    dialog.FindChildTraverse("name").__text = name;
    const effects = dialog.FindChildTraverse("StatusEffects");
    for (const child of effects.children.slice()) child.DeleteAsync();
    loadInto(effects, OWN.status);
    const container = effects.FindChild("StatusEffectContainer");
    const samples = { count: 0 };
    const children = container.Children.bind(container);
    container.Children = () => { samples.count++; return children(); };
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
  const slots = (name) => {
    const column = card(name).FindChild("OHDebuffsHost");
    return column ? column.Children() : [];
  };
  const shownSlots = (name) => slots(name).filter((slot) => slot.BHasClass("OHShown") && !slot.BHasClass("OHFading"));
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
    advance, geometry, addBar, units, giveDebuff, card, slots, shownSlots, icons, slotText, bar, band, menu, ui, press, type,
    state, who, clock, souls, host, purchases, buy, notices, noticeText };
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
  // Only the two host layouts and the VData override stock files; everything else has this mod's own names.
  deq(layouts.filter((name) => !name.startsWith("observer_hud/")), ["hud_spectate_bar", "citadel_status_effect"]);
  assert.ok(styles.every((name) => name.startsWith("observer_hud/")) && scripts.every((name) => name.startsWith("observer_hud/")));
  assert.match(wrapper, /pak10_dir\.vpk/, "pak10");
});

check("the two overrides are the pinned stock files plus this mod's include lines only", () => {
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
  for (const name of ["hud", "hud_escape_menu", "citadel_hud_top_bar", "citadel_hud_top_bar_team", "citadel_hud_top_bar_player", "unit_status_overlay_v2",
    "citadel_hud_hero_shop"]) {
    const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(MODULE, `stock/${name}.xml`))).digest("hex");
    assert.equal(digest, pin.files[`game/citadel/pak01_dir/panorama/layout/${name}.xml`], `stock/${name}.xml matches the pin`);
  }
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

check("spec: world RULES equal dlf/spectator-status.json; the stun-hiding rule is short and loads with the status list", () => {
  const spec = JSON.parse(readRepo("dlf/spectator-status.json"));
  const worldJs = read("panorama/scripts/observer_hud/oh_debuff_world.js");
  const rules = new vm.Script(/const RULES = (new Map\(\[[\s\S]*?\]\));/.exec(worldJs)[1]).runInNewContext({ Map });
  const specRules = spec.abilities.map((entry) => [entry.ability, Object.assign({ maxSeconds: entry.maxSeconds },
    entry.buff ? { buff: true } : {}, entry.minStacks ? { minStacks: entry.minStacks } : {},
    entry.ignoreClasses ? { ignore: entry.ignoreClasses } : {})]);
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

const stateApi = (() => {
  const context = createVmContext(createPanoramaHarness());
  runInVm(script("oh_state.js"), context, "oh_state.js");
  return context.$.OHState;
})();

check("state: field-by-field fallback, rejection instead of truncation, series capped by the format", () => {
  const S = stateApi;
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
  deq(s.aliases, { Kestrel: "Kes" });
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

check("state: share codes round-trip, leave DEV out, and reject corrupt or newer codes", () => {
  const S = stateApi;
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
  assert.equal(w.topBar.style.marginTop, "34px", "the stock top bar moves down by the 26 px names strip (+ its stock 8 px)");
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
    const team = w.topBar.FindChildTraverse("TeamFriendly");
    const parent = team.GetParent();
    team.SetParent(null);
    w.advance(1100);
    team.SetParent(parent);
    w.advance(1100);
    assert.ok(!gone("OHWho0") && !gone("OHStripLeft"), `${look}: Amber's names and strip are back`);
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
  assert.equal(w.topBar.style.marginTop, "64px");
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
  assert.equal(w.topBar.style.marginTop, "34px");
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
  assert.equal(stateApi.normalize({ graph: { every: 7 } }).graph.every, 300);
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
  deq(Object.assign({}, stateApi.normalize({ graph: { size: 155, x: 7, y: 301 } }).graph), { show: 30, every: 300, size: 100, x: 0, y: 0 });
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
  a.advance(3000);
  assert.equal(text(a.ui("OHSaveStatus")), "SAVED", "a fresh PC saves the defaults");
  a.press("OHMenuButton");
  a.type("OHEventEntry", "Spring Cup");
  a.type("OHAmberPlayer0Entry", "Kes");
  a.press("OHGraphEvery120");
  assert.equal(text(a.ui("OHSaveStatus")), "SAVING");
  a.advance(3000);
  assert.equal(text(a.ui("OHSaveStatus")), "SAVED");
  const record = disk["hantu.observer_hud.v1/state"];
  assert.ok(record && record.startsWith("OHS1."), "one key, OHS1 record");
  // Restart: a new process adopts the saved setup.
  const b = world({ disk });
  b.bootHost();
  b.advance(3000);
  assert.equal(b.state().event, "Spring Cup");
  assert.equal(b.state().aliases.Kestrel, "Kes");
  assert.equal(b.state().graph.every, 120);
  assert.equal(b.who("Kestrel"), "Kes");
  // A damaged record is left alone (nothing written) until RESET ALL.
  disk["hantu.observer_hud.v1/state"] = record.slice(0, -2) + "x}";
  const c = world({ disk });
  c.bootHost();
  c.advance(3000);
  assert.equal(text(c.ui("OHSaveStatus")), "SAVE DAMAGED - RESET TO REPAIR");
  c.press("OHMenuButton");
  c.type("OHStageEntry", "Final");
  c.advance(3000);
  assert.ok(disk["hantu.observer_hud.v1/state"].endsWith("x}"), "an edit does not overwrite a damaged save");
  c.press("OHReset");
  c.press("OHReset");
  c.advance(3000);
  assert.equal(text(c.ui("OHSaveStatus")), "SAVED");
  assert.ok(!disk["hantu.observer_hud.v1/state"].endsWith("x}"));
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
  deq(stateApi.normalize({ cues: { bridge: 45, urn: -1, rift: 30, mid: "x" } }).cues, { bridge: 30, urn: -1, rift: -1, mid: 30 });
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
  assert.ok(Object.keys(w.state().aliases).length === 1, "the first press only arms");
  w.press("OHResetPage");
  deq([w.state().aliases, w.state().dev.debuffs], [{}, true], "aliases and the status column");
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
  deq(Object.assign({}, stateApi.normalize({ logo: { shape: "hex", size: 51, gap: 48 } }).logo), { shape: "circle", size: 30, gap: 48 });
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
  deq(w.state().aliases, {});
  // A focused entry is never overwritten by a render.
  const entry = w.ui("OHEventEntry");
  entry.keyFocus = true;
  entry.text = "typing";
  w.press("OHBo7");
  assert.equal(entry.text, "typing");
});

check("editor: share code export and import on another PC, reset asks twice, DEV settings stay local", () => {
  const a = world();
  a.bootHost();
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
  b.advance(2000);
  b.press("OHMenuButton");
  b.harness.clipboardText = code;
  b.press("OHShareImport"); // empty box: pastes the clipboard first
  assert.equal(b.state().event, "Deadlock Community Cup");
  assert.equal(b.state().aliases.Moth, "Mothman");
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
  deq(b.state().aliases, {});
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
  // A notice row is 39 px (oh_buys.js ROW_H): the 40 px notice (36 px frame in a 2 px rim), -2 and +1 px margins.
  const row = /\n\.OHBuy\s*\{([^}]*)\}/.exec(sheet)[1];
  const px = (prop) => Number(new RegExp(`\\b${prop}:\\s*(-?\\d+)px`).exec(row)[1]);
  assert.equal(px("height") + px("margin-top") + px("margin-bottom"), 39, "the notice row stays 39 px");
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
  w.buy("Doyle", "Extra Regen", { heroName: "Doyle-San" });
  w.card("Frostbyte").FindChildTraverse("HeroBadge").heroid = undefined;
  w.buy("Frostbyte", "Extra Regen");
  w.buy("Talon", "Extra Regen", { heroName: "Nobody", heroId: 9999 });
  w.advance(600);
  assert.equal(w.notices("Doyle").length, 1, "hero id match");
  assert.equal(w.notices("Frostbyte").length, 1, "hero name match when the badge has no heroid");
  assert.equal(AMBER.concat(SAPPHIRE).filter((name) => w.notices(name).length && !["Doyle", "Frostbyte", "Volt"].includes(name)).length, 0);
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
  deq(["Kestrel", "Moth", "Doyle"].map(push), ["", "45px", ""], "Moth under Kestrel (2 + 39 + 4 px); Doyle clears Moth's lowered stack");
  w.buy("Kestrel", "Mystic Burst");
  w.advance(600);
  deq(["Kestrel", "Moth", "Doyle"].map(push), ["", "84px", ""], "two rows on Kestrel push Moth further");
  // A status slot on Moth (43 px) puts his stack lower already: only the rest is added.
  w.giveDebuff("Moth", "ability_viper_petrifybola", { radial: () => -180 });
  w.advance(1500);
  assert.equal(w.shownSlots("Moth").length, 1);
  assert.equal(push("Moth"), `${2 + 78 + 4 - 43}px`);
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
  deq(["Frostbyte", "Vesper"].map(push), ["", "45px"], "Vesper (right of Frostbyte) moves under it");
  // A notice as wide as one card does not reach its neighbour's.
  for (const name of ["Frostbyte", "Vesper"]) {
    for (const notice of w.card(name).FindChildTraverse("OHBuys").Children()) notice.actuallayoutwidth = 80;
  }
  w.advance(600);
  assert.equal(push("Vesper"), "2px", "measured widths that do not overlap leave both in place");
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
  const scans = w.units.Geist.samples.count;
  w.advance(5000);
  assert.equal(w.units.Geist.samples.count, scans, "OFF: no scans");
  w.press("OHDebuffToggle");
  w.press("OHPollUp"); // 250 -> 500 ms
  w.advance(2000);
  deq(w.icons("Geist"), [PETRIFY]);
  const a = w.units.Geist.samples.count;
  w.advance(10000);
  const rate = w.units.Geist.samples.count - a;
  assert.ok(rate >= 18 && rate <= 22, `0.5 s poll: ${rate} scans in 10 s`);
});

// ---------------------------------------------------------------- budgets

check("steady state: no writes while nothing changes; native calls per second under the budgets", () => {
  const counted = (harness) => {
    let positions = 0;
    const position = MockPanel.prototype.GetPositionWithinWindow;
    MockPanel.prototype.GetPositionWithinWindow = function () {
      positions++;
      const { parentReads, boundaryValidityCalls } = harness.operationCounts;
      const result = position.call(this);
      Object.assign(harness.operationCounts, { parentReads, boundaryValidityCalls });
      return result;
    };
    return () => {
      MockPanel.prototype.GetPositionWithinWindow = position;
      const ops = Object.assign({}, harness.operationCounts, { positions });
      for (const key of ["traversal", "findTraversals", "classTraversalNodes"]) delete ops[key];
      return Object.fromEntries(Object.entries(ops).filter(([, value]) => value));
    };
  };
  const per = (ops, seconds) => Object.fromEntries(Object.entries(ops).map(([key, value]) => [key, Math.round(value / seconds * 10) / 10]));
  const total = (ops) => Math.round(Object.values(ops).reduce((sum, value) => sum + value, 0) * 10) / 10;
  const reset = (w) => { for (const key of Object.keys(w.harness.operationCounts)) w.harness.operationCounts[key] = 0; };

  // Not spectating: the host only checks the HUD classes.
  const idle = world({ spectating: false });
  idle.bootHost();
  idle.advance(5000);
  reset(idle);
  let stop = counted(idle.harness);
  idle.advance(10000);
  const notSpectating = per(stop(), 10);

  // Spectating with a full setup and nothing changing: bar, aliases, column, 12 hero bars with a
  // listed status and an unlisted one each (real bars carry item and regen statuses outside RULES),
  // 60 trooper/neutral bars and the HUD's own lists.
  const w = statusWorld();
  w.press("OHMenuButton");
  w.type("OHEventEntry", "Deadlock Community Cup");
  w.type("OHStageEntry", "Grand Final");
  w.type("OHAmberPlayer0Entry", "Kes");
  w.press("OHDone");
  for (const name of [...AMBER, ...SAPPHIRE]) {
    w.giveDebuff(name, "ability_viper_petrifybola", { radial: () => -180 });
    w.giveDebuff(name, "upgrade_extra_regen", { debuff: false });
  }
  for (let i = 0; i < 60; i++) w.addBar(`trooper${i}`, { hero: false });
  for (const list of findAll(w.hud, "CitadelStatusEffect")) w.runIn(list, [["oh_debuff_world.js", script("oh_debuff_world.js")]]);
  w.advance(8000);
  reset(w);
  stop = counted(w.harness);
  w.advance(10000);
  const spectating = per(stop(), 10);
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
  results.budgets = { notSpectating, notSpectatingTotal: total(notSpectating), spectating, spectatingTotal: total(spectating),
    countdown, countdownTotal: total(countdown) };
  console.log(`   not spectating ${total(notSpectating)}/s ${JSON.stringify(notSpectating)}`);
  console.log(`   spectating ${total(spectating)}/s ${JSON.stringify(spectating)}`);
  console.log(`   counting down ${total(countdown)}/s ${JSON.stringify(countdown)}`);
  assert.equal(notSpectating.textWrites || 0, 0);
  assert.equal(notSpectating.styleWrites || 0, 0);
  assert.ok(total(notSpectating) <= BUDGET_IDLE, `not spectating: ${total(notSpectating)}/s`);
  assert.equal(spectating.textWrites || 0, 0, "steady state writes no text");
  assert.equal(spectating.styleWrites || 0, 0, "steady state writes no styles");
  assert.equal(spectating.classWrites || 0, 0, "steady state writes no classes");
  // 12 hero bars (a listed and an unlisted status each, CLASS_PLAYER on the world panel as live) at the
  // 0.25 s poll, 60 idle bars, the column and the host tick. Re-measure before raising.
  assert.ok(total(spectating) <= BUDGET_SPECTATING, `spectating budget: ${total(spectating)}/s`);
  assert.ok(total(countdown) <= BUDGET_COUNTDOWN, `countdown budget: ${total(countdown)}/s`);
});

const out = path.join(REPO, ".tmp", "observer-hud-validate.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`${results.checks.length} checks passed; artifact ${path.relative(REPO, out)}`);
