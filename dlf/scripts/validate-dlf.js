"use strict";
// DLF observer HUD validator.
//   node dlf/scripts/validate-dlf.js
// Static: s2r:// references resolve, base CSS matches the GameTracking pin, banner IDs are
// in sync across XML/CSS/JS, match.json and gameinfo.gi are well formed.
// Runtime: boots the real dlf_match.js + dlf_banner.js inside the real top-bar layout tree
// (players built from the real top-bar player layout) and checks what the banner shows.
// Pickup rings: boots the composed pickup runtime in one top-bar context plus one world
// healthbar context per hero (real unit_status_overlay_v2 layout), with the sibling relay
// loaded through BLoadLayout, and checks what reaches the top bar.
// Writes .tmp/dlf-validate.json with every scenario's banner text and pickup rows.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { MockPanel, createPanoramaHarness: newHarness, createVmContext, runInVm } =
  require("../../scripts/hp-colors-panorama-test-adapter.js");
// Engine model (observer_hud/ENGINE.md, live 2026-10-23, client 6813): after style.visibility = "collapse",
// writing null clears the inline value but the panel stays hidden. Every check walks the panels of the
// harnesses it created and fails if any got that sequence.
const WORLDS = [];
function createPanoramaHarness(options) {
  const harness = newHarness(options);
  WORLDS.push(harness.root);
  return harness;
}
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
// Live (client 6819, 2026-10-24) a style value with NaN or Infinity throws "Invalid value for property"
// and the script's tick stops there: the soul graph wrote margin-top "Infinitypx" and stayed on the
// clock and soul plates. The mock accepts anything, so every check fails on such a write instead.
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
const { parseMatch, matchScript } = require("./write-match.js");
const { compose } = require("./compose-pickups.js");
// CitadelHeroImage's only script API (feeder_feed/AGENTS.md); the mock records the hero shown.
MockPanel.prototype.SetHeroID = function (id) { this.heroId = id; };

// DLF_SOURCE_ROOT=<copy of dlf/> runs the checks against another tree (old-vs-new comparisons).
const DLF = process.env.DLF_SOURCE_ROOT ? path.resolve(process.env.DLF_SOURCE_ROOT) : path.join(__dirname, "..");
const PANORAMA = path.join(DLF, "panorama");
const REPO = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(DLF, rel), "utf8");
// 8-bit RGBA, non-interlaced PNG -> { w, h, out } (RGBA bytes); every filter type.
function pngPixels(file) {
  const png = fs.readFileSync(file);
  const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  assert.deepEqual([png[24], png[25], png[28]], [8, 6, 0], `${path.basename(file)} is 8-bit RGBA, not interlaced`);
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
}
// DLF_RUNTIME_ROOT=<staged panorama dir> runs every VM scenario on the built scripts (build_dlf.ps1
// passes its Closure ADVANCED output); static checks of the source text still read DLF.
const RUNTIME = process.env.DLF_RUNTIME_ROOT ? path.resolve(process.env.DLF_RUNTIME_ROOT) : null;
const script = (name) => RUNTIME ? fs.readFileSync(path.join(RUNTIME, "scripts", name), "utf8") : read(`panorama/scripts/${name}`);
if (RUNTIME) console.log(`runtime scripts from ${RUNTIME}`);
const results = { checks: [], runs: [] };

// DLF_CHECK=<text> runs only the checks whose name contains it (e.g. "steady-state" for the budgets).
function check(name, fn) {
  if (process.env.DLF_CHECK && !name.includes(process.env.DLF_CHECK)) return;
  WORLDS.length = 0;
  fn();
  const stuck = stuckHidden();
  assert.deepEqual(stuck, [], `${name}: visibility collapse then null leaves these hidden live: ${stuck.join(", ")}`);
  const bad = invalidStyles();
  assert.deepEqual(bad, [], `${name}: these style values throw live: ${bad.join(", ")}`);
  results.checks.push(name);
  console.log(`ok - ${name}`);
}

// ---------------------------------------------------------------- static contracts

const OWN_DIRS = ["scripts/observer/", "scripts/qollock/", "scripts/dlf/", "styles/base/", "styles/observer/",
  "styles/qollock/", "styles/dlf/", "images/dlf/"];
const OVERRIDES = ["styles/citadel_hud_hero_shop", "styles/citadel_hud_top_bar", "styles/citadel_hud_top_bar_chat",
  "styles/hud", "styles/hud_paused", "styles/hud_spectate_bar", "styles/objectives_map"];
const GENERATED = new Set(["scripts/dlf/dlf_match.js", "scripts/dlf/pickup_config.js", "scripts/dlf/pickup_bridge.js",
  "scripts/dlf/pickup_timers.js"]);
const SOURCE_EXT = { vjs_c: "js", vcss_c: "css", vcss: "css", vtex_c: "vtex", vtex: "vtex" };

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(xml|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

check("own s2r:// references resolve to source files", () => {
  for (const file of sourceFiles(PANORAMA)) {
    const text = fs.readFileSync(file, "utf8");
    for (const [, rel, ext] of text.matchAll(/s2r:\/\/panorama\/([\w/.-]+?)\.(vjs_c|vcss_c|vcss|vtex_c|vtex)\b/g)) {
      const source = `${rel}.${SOURCE_EXT[ext]}`;
      const own = OWN_DIRS.some((dir) => rel.startsWith(dir)) || OVERRIDES.includes(rel);
      if (!own || GENERATED.has(source)) continue;
      assert.ok(fs.existsSync(path.join(PANORAMA, source)), `${path.relative(DLF, file)} -> missing ${source}`);
    }
  }
});

check("vtex sources point at their PNGs", () => {
  for (const vtex of fs.readdirSync(path.join(PANORAMA, "images/dlf")).filter((n) => n.endsWith(".vtex"))) {
    const png = read(`panorama/images/dlf/${vtex}`).match(/"m_fileName" "string" "([^"]+)"/)[1];
    assert.ok(fs.existsSync(path.join(DLF, png)), `${vtex} -> missing ${png}`);
  }
});

check("styles/base matches the GameTracking pin (refresh with refresh-stock.py)", () => {
  const pin = JSON.parse(read("stock-pin.json"));
  const base = Object.keys(pin.files).filter((key) => key.includes("/panorama/styles/"));
  for (const stock of base) {
    const name = path.basename(stock);
    const local = path.join(PANORAMA, "styles/base", name);
    if (!fs.existsSync(local)) continue; // objectives_map.css is an override, not a base copy
    const digest = crypto.createHash("sha256").update(fs.readFileSync(local)).digest("hex");
    assert.equal(digest, pin.files[stock], `styles/base/${name} differs from pinned stock`);
  }
  assert.equal(fs.readdirSync(path.join(PANORAMA, "styles/base")).length, 6, "six pinned base files");
});

const topBarXml = read("panorama/layout/citadel_hud_top_bar.xml");
const bannerJs = read("panorama/scripts/dlf/dlf_banner.js");
const bannerCss = read("panorama/styles/dlf/dlf_banner.css");
const bannerRun = script("dlf/dlf_banner.js");
const stateRun = script("dlf/dlf_state.js");

check("banner IDs agree across layout, CSS and script", () => {
  const allIds = [...topBarXml.matchAll(/id="(DLF\w+)"/g)].map((m) => m[1]);
  assert.equal(new Set(allIds).size, allIds.length, "duplicate DLF ids in layout");
  // The soul lead graph's ids have their own check.
  const xmlIds = allIds.filter((id) => !/^DLF(SoulGraph|Graph)/.test(id));
  const expected = ["DLFBanner", "DLFEventBox", "DLFEventStack", "DLFEventLine1", "DLFEventLine2", "DLFSeriesBand",
    "DLFSeriesFormat"];
  for (const side of ["Left", "Right"]) {
    expected.push(`DLF${side}TeamName`, `DLF${side}Score`, `DLF${side}Players`, `DLF${side}Ban0`, `DLF${side}Ban1`,
      `DLF${side}Ban2`, `DLF${side}TeamBand`, `DLF${side}ScoreBand`, `DLF${side}Logo`, `DLF${side}LogoDefault`);
    for (let i = 0; i < 6; i++) expected.push(`DLF${side}Player${i}`);
  }
  assert.deepEqual([...xmlIds].sort(), [...expected].sort());
  for (const [, id] of bannerCss.matchAll(/#(DLF\w+)/g)) assert.ok(xmlIds.includes(id), `CSS #${id} not in layout`);
  for (const id of ["DLFBanner", "DLFEventLine1", "DLFEventLine2", "DLFSeriesFormat", "DLFEventStack"]) {
    assert.ok(bannerJs.includes(`"${id}"`), `script does not look up ${id}`);
  }
  assert.ok(topBarXml.indexOf("dlf_state.vjs_c") < topBarXml.indexOf("dlf_match.vjs_c") &&
    topBarXml.indexOf("dlf_match.vjs_c") < topBarXml.indexOf("dlf_banner.vjs_c"), "state, then match, then banner");
});

// The art decides the geometry: G:\NEW HUD 3 ban.psd (2026-10-28) has three ban boxes per team and moved
// the team names to the outer ends of the band, where the ban icon used to sit in the old bands.
check("banner art: a portrait over every ban box, three per team; team names clear of the art's icons and frames", () => {
  const art = pngPixels(path.join(PANORAMA, "images", "dlf", "dlf_banner.png"));
  assert.deepEqual([art.w, art.h], [1920, 100]);
  const rgba = (x, y) => art.out.subarray((y * art.w + x) * 4, (y * art.w + x) * 4 + 4);
  const css = bannerCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (sel) => {
    const found = new RegExp(`(?:^|\\})\\s*${sel.replace(/[.#]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css);
    assert.ok(found, `${sel} has a rule`);
    return found[1];
  };
  const px = (sel, prop) => {
    const found = new RegExp(`(?:^|\\s)${prop}:\\s*(-?\\d+)px`).exec(rule(sel));
    assert.ok(found, `${sel} sets ${prop}`);
    return Number(found[1]);
  };
  const context = createVmContext(createPanoramaHarness());
  runInVm(stateRun, context, "dlf_state.js");
  const S = context.$.DLFState;
  assert.equal(S.BAN_SLOTS, 3, "three bans per team");

  // Ban boxes: runs of the boxes' dark red across their middle row.
  const [banW, banH, banTop] = [px(".DLFBan", "width"), px(".DLFBan", "height"), px(".DLFBan", "margin-top")];
  const row = banTop + Math.floor(banH / 2);
  const isBox = (x) => { const [r, g, b, a] = rgba(x, row); return a === 255 && r > 80 && g < 40 && b < 40; };
  const boxes = [];
  for (let x = 0, start = -1; x <= art.w; x++) {
    const on = x < art.w && isBox(x);
    if (on && start < 0) start = x;
    if (!on && start >= 0) { if (x - start >= 30) boxes.push([start, x - 1]); start = -1; }
  }
  const portraits = [...topBarXml.matchAll(/id="(DLF(Left|Right)Ban\d+)"/g)].map(([, id, side]) => {
    const left = px(`#${id}`, "margin-left");
    return { id, side, left, right: left + banW };
  });
  assert.equal(boxes.length, 2 * S.BAN_SLOTS, `ban boxes in the art: ${JSON.stringify(boxes)}`);
  assert.equal(portraits.length, 2 * S.BAN_SLOTS, "a portrait per ban slot");
  for (const p of portraits) {
    const inside = boxes.filter(([a, b]) => a >= p.left && b < p.right);
    assert.equal(inside.length, 1, `${p.id} (x ${p.left}..${p.right}) covers one box: ${JSON.stringify(boxes)}`);
    assert.equal(p.side === "Left", inside[0][0] < 960, `${p.id} is on its team's side`);
  }
  for (const box of boxes) assert.equal(portraits.filter((p) => box[0] >= p.left && box[1] < p.right).length, 1, `box ${box} has one portrait`);

  // Team names: across the glyph rows the band is plain dark art at every allowed X offset (no ban icon,
  // ban box or frame stroke under a long name).
  const [bandW, bandH, bandTop] = [px(".DLFTeamBand", "width"), px(".DLFTeamBand", "height"), px(".DLFTeamBand", "margin-top")];
  const middle = bandTop + bandH / 2;
  for (const side of ["Left", "Right"]) {
    const left = px(`#DLF${side}TeamBand`, "margin-left");
    for (const dx of [S.STYLE_LIMITS.team.x[0], 0, S.STYLE_LIMITS.team.x[1]]) {
      for (let y = middle - 8; y < middle + 8; y++) {
        for (let x = left + dx; x < left + bandW + dx; x++) {
          const [r, g, b] = rgba(x, y);
          assert.ok(Math.max(r, g, b) <= 90, `${side} team band (x offset ${dx}) crosses art at ${x},${y}`);
        }
      }
    }
  }
});

// Two bans per team (state.banCount 2): the banner swaps to dlf_banner_2ban.png, which must be the same art
// minus exactly the inner box of each side (failure: a box left, a wrong box removed, the underline or the
// rest of the art changed), and the two-ban portraits must sit on the boxes that are left.
check("banner art, two bans: the inner box of each side is painted out and the portraits cover the outer two", () => {
  const full = pngPixels(path.join(PANORAMA, "images", "dlf", "dlf_banner.png"));
  const two = pngPixels(path.join(PANORAMA, "images", "dlf", "dlf_banner_2ban.png"));
  assert.deepEqual([two.w, two.h], [1920, 100]);
  assert.match(read("panorama/images/dlf/dlf_banner_2ban.vtex"), /"m_fileName" "string" "panorama\/images\/dlf\/dlf_banner_2ban\.png"/);
  const css = bannerCss.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /#DLFBanner\.DLFTwoBans\s*\{[^}]*dlf_banner_2ban\.vtex/, "the class swaps the art");
  const twoLeft = (id) => Number(new RegExp(`\\.DLFTwoBans #${id}\\s*\\{[^}]*margin-left:\\s*(\\d+)px`).exec(css)[1]);
  assert.match(css, /\.DLFTwoBans #DLFLeftBan2,\s*\.DLFTwoBans #DLFRightBan2\s*\{[^}]*visibility:\s*collapse/);
  const boxesIn = (art) => {
    const out = [];
    for (let x = 0, start = -1; x <= art.w; x++) {
      const i = (23 * art.w + x) * 4;
      const on = x < art.w && art.out[i + 3] === 255 && art.out[i] > 80 && art.out[i + 1] < 40 && art.out[i + 2] < 40;
      if (on && start < 0) start = x;
      if (!on && start >= 0) { if (x - start >= 30) out.push([start, x - 1]); start = -1; }
    }
    return out;
  };
  const before = boxesIn(full);
  const after = boxesIn(two);
  assert.equal(before.length, 6);
  // Left side boxes run outer to inner left to right, right side inner to outer: drop the 3rd and the 4th.
  assert.deepEqual(after, [before[0], before[1], before[4], before[5]], `boxes left: ${JSON.stringify(after)}`);
  // Only the box rows (7..38) around the two inner boxes change.
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 1920; x++) {
      const i = (y * 1920 + x) * 4;
      const same = full.out[i] === two.out[i] && full.out[i + 1] === two.out[i + 1] && full.out[i + 2] === two.out[i + 2] && full.out[i + 3] === two.out[i + 3];
      if (same) continue;
      const inBox = y >= 7 && y < 39 && before.slice(2, 4).some(([a, b]) => x >= a - 2 && x <= b + 2);
      assert.ok(inBox, `dlf_banner_2ban.png differs outside the inner boxes at ${x},${y}`);
    }
  }
  // Portraits at two bans: the left side keeps its outer two boxes, the right side moves to its outer two.
  const banW = 45;
  const leftOf = (id) => Number(new RegExp(`(?:^|\\})\\s*#${id}\\s*\\{[^}]*margin-left:\\s*(\\d+)px`).exec(css)[1]);
  const covers = (left, box) => box[0] >= left && box[1] < left + banW;
  assert.ok(covers(leftOf("DLFLeftBan0"), after[0]) && covers(leftOf("DLFLeftBan1"), after[1]), "left side");
  assert.ok(covers(twoLeft("DLFRightBan0"), after[2]) && covers(twoLeft("DLFRightBan1"), after[3]), "right side");
});

check("match.json is valid and bad match files are rejected", () => {
  parseMatch(read("match.json"));
  const good = JSON.parse(read("match.json"));
  const bad = [
    Object.assign({}, good, { extra: 1 }),
    Object.assign({}, good, { seriesFormat: "x".repeat(33) }),
    Object.assign({}, good, { season: -1 }),
    Object.assign({}, good, { match: 1.5 }),
    Object.assign({}, good, { match: 10000 }),
    Object.assign({}, good, { amber: { name: "A", score: 100 } }),
    Object.assign({}, good, { sapphire: { name: "S", score: 1.5 } }),
    Object.assign({}, good, { amber: { name: 7, score: 0 } }),
    Object.assign({}, good, { amber: { name: "A", score: 0, logo: "x" } }),
    Object.assign({}, good, { amber: { name: "A", score: 0, bans: [1, 2, 3, 4] } }),
    Object.assign({}, good, { amber: { name: "A", score: 0, bans: ["Haze"] } })
  ];
  for (const match of bad) assert.throws(() => parseMatch(JSON.stringify(match)), /match file:/);
  parseMatch(JSON.stringify(Object.assign({}, good, { amber: { name: "A", score: null } })));
  parseMatch(JSON.stringify(Object.assign({}, good, { amber: { name: "A", score: 1, bans: [13, 0] } })));
  parseMatch(JSON.stringify(Object.assign({}, good, { amber: { name: "A", score: 1, bans: [13, 0, 6] } })));
  parseMatch(`\uFEFF${read("match.json")}`);
});

check("gameinfo.gi mounts citadel/addons ahead of citadel", () => {
  const paths = read("gameinfo/gameinfo.gi").match(/SearchPaths\s*\{([\s\S]*?)\}/)[1]
    .split("\n").map((line) => line.replace(/\/\/.*/, "").trim()).filter(Boolean)
    .map((line) => line.split(/\s+/).join(" "));
  const addons = paths.indexOf("Game citadel/addons");
  assert.ok(addons >= 0, "addons search path missing");
  assert.ok(addons < paths.indexOf("Game citadel"), "addons must precede Game citadel");
  assert.ok(paths.includes("Game core"), "core search path missing");
});

// ---------------------------------------------------------------- layout -> mock panels

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

function instantiate(node, parent) {
  const classes = (node.attrs.class || "").split(/\s+/).filter(Boolean);
  const panel = new MockPanel(node.type, parent, node.attrs.id || "");
  panel.classes = classes;
  if ("text" in node.attrs) panel.__text = node.attrs.text;
  for (const child of node.children) instantiate(child, panel);
  return panel;
}
// A layout loaded into an existing panel: the panel takes the root's classes, the root's children become its own.
function loadInto(panel, node) {
  const classes = (node.attrs.class || "").split(/\s+/).filter(Boolean);
  for (const cls of classes) panel.AddClass(cls);
  for (const child of node.children) instantiate(child, panel);
  return panel;
}
const findAll = (panel, type, out = []) => {
  if (panel.paneltype === type) out.push(panel);
  for (const child of panel.children) findAll(child, type, out);
  return out;
};


const playerLayout = parseLayout(read("panorama/layout/citadel_hud_top_bar_player.xml"));
const topBarLayout = parseLayout(topBarXml);

function buildHud(harness, rosters, { banner = true } = {}) {
  const hud = new MockPanel("Panel", harness.root, "Hud");
  const topBar = instantiate(topBarLayout, hud);
  topBar.id = "TopBar";
  if (!banner) topBar.FindChildTraverse("DLFBanner").DeleteAsync();
  const teams = {};
  for (const [teamId, names] of Object.entries(rosters)) {
    // Stock citadel_hud_top_bar_team.xml: #PlayerContents > #PlayersContainer.
    const team = topBar.FindChildTraverse(teamId);
    const container = new MockPanel("Panel", new MockPanel("Panel", team, "PlayerContents"), "PlayersContainer");
    teams[teamId] = names.map((name) => {
      const player = instantiate(playerLayout, container);
      for (const label of player.FindChildrenWithClassTraverse("AlwaysPlayerName")
        .concat(player.FindChildrenWithClassTraverse("PlayerName"))) label.__text = name;
      return player;
    });
  }
  harness.contextPanel = topBar;
  return { topBar, teams };
}

function setName(player, name) {
  for (const cls of ["AlwaysPlayerName", "PlayerName"]) player.FindChildrenWithClassTraverse(cls)[0].__text = name;
}

function bannerText(topBar) {
  const text = (id) => topBar.FindChildTraverse(id).__text;
  const side = (s) => ({
    team: text(`DLF${s}TeamName`),
    score: text(`DLF${s}Score`),
    players: [0, 1, 2, 3, 4, 5].map((i) => text(`DLF${s}Player${i}`))
  });
  return {
    event: [text("DLFEventLine1"), text("DLFEventLine2")],
    series: text("DLFSeriesFormat"),
    left: side("Left"),
    right: side("Right")
  };
}

function boot(name, rosters, { match = JSON.parse(read("match.json")), banner = true, teamClasses = {} } = {}) {
  const harness = createPanoramaHarness();
  const hud = buildHud(harness, rosters, { banner });
  for (const [teamId, classes] of Object.entries(teamClasses)) hud.topBar.FindChildTraverse(teamId).classes = classes;
  const context = createVmContext(harness);
  runInVm(stateRun, context, "dlf_state.js");
  if (match) runInVm(matchScript(match), context, "dlf_match.js");
  runInVm(bannerRun, context, "dlf_banner.js");
  const run = { name, snapshots: [], logs: harness.logs };
  results.runs.push(run);
  const snap = (label) => {
    const value = bannerText(hud.topBar);
    run.snapshots.push({ label, banner: value });
    return value;
  };
  const tick = () => harness.scheduler.runByDelay(1);
  return Object.assign({ harness, context, snap, tick }, hud);
}

const AMBER = ["MASTIKHOR", "KUSH", "VAYAM", "ESDEATH", "T3RM1NATOR", "VENOM"];
const SAPPHIRE = ["NAMELESS", "MUXXOO", "SANSKAR", "NOTXTATTA", "BREAD", "SUSAGE"];
const SPECTATOR = { TeamFriendly: ["team1"], TeamEnemy: ["team2"] };

// ---------------------------------------------------------------- runtime scenarios

check("spectator: Amber left, Sapphire right, match text and live player names", () => {
  const t = boot("spectator", { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE }, { teamClasses: SPECTATOR });
  const b = t.snap("boot");
  assert.deepEqual(b.event, ["SEASON 2", "MATCH #57"]);
  assert.equal(b.series, "Best of 1");
  assert.deepEqual(b.left, { team: "VENOM", score: "0", players: AMBER });
  assert.deepEqual(b.right, { team: "BANANABREAD", score: "0", players: SAPPHIRE });
  assert.ok(t.harness.logs.some((line) => line.startsWith("[DLF] banner defaults VENOM vs BANANABREAD")));
});

check("name changes reach the banner within one tick; steady state writes nothing", () => {
  const t = boot("updates", { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE }, { teamClasses: SPECTATOR });
  t.tick();
  const before = t.harness.operationCounts.textWrites;
  t.tick();
  t.tick();
  assert.equal(t.harness.operationCounts.textWrites, before, "unchanged banner must not rewrite labels");
  setName(t.teams.TeamEnemy[2], "SUBSTITUTE");
  t.tick();
  assert.equal(t.snap("renamed").right.players[2], "SUBSTITUTE");
  assert.equal(t.harness.operationCounts.textWrites, before + 1, "only the renamed slot is written");
});

check("player on Sapphire: stock CSS puts Sapphire left, banner follows", () => {
  const t = boot("local-sapphire", { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE },
    { teamClasses: { TeamFriendly: ["enemy"], TeamEnemy: ["friend"] } });
  const b = t.snap("boot");
  assert.deepEqual(b.left, { team: "BANANABREAD", score: "0", players: SAPPHIRE });
  assert.deepEqual(b.right, { team: "VENOM", score: "0", players: AMBER });
});

check("short rosters and hidden players leave blank slots", () => {
  const t = boot("short", { TeamFriendly: AMBER.slice(0, 4), TeamEnemy: SAPPHIRE }, { teamClasses: SPECTATOR });
  t.teams.TeamEnemy[5].visible = false;
  t.tick();
  const b = t.snap("tick");
  assert.deepEqual(b.left.players, [...AMBER.slice(0, 4), "", ""]);
  assert.deepEqual(b.right.players, [...SAPPHIRE.slice(0, 5), ""]);
});

check("roster rebuilt by the engine is picked up without waiting for the rescan timer", () => {
  const t = boot("rebuild", { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE }, { teamClasses: SPECTATOR });
  const container = t.topBar.FindChildTraverse("TeamEnemy").FindChildTraverse("PlayersContainer");
  container.RemoveAndDeleteChildren();
  const fresh = ["A1", "B2", "C3", "D4", "E5", "F6"].map((name) => {
    const player = instantiate(playerLayout, container);
    setName(player, name);
    return player;
  });
  assert.equal(fresh.length, 6);
  t.tick();
  assert.deepEqual(t.snap("rebuilt").right.players, ["A1", "B2", "C3", "D4", "E5", "F6"]);
});

check("banner missing at boot: retries, then fills", () => {
  const t = boot("late-banner", { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE }, { banner: false, teamClasses: SPECTATOR });
  t.tick();
  const fresh = instantiate(topBarLayout.children.find((n) => n.attrs.id === "DLFBanner"), t.topBar);
  assert.equal(fresh.FindChildTraverse("DLFLeftTeamName").__text, "");
  t.tick();
  assert.equal(fresh.FindChildTraverse("DLFLeftTeamName").__text, "VENOM");
  assert.equal(fresh.FindChildTraverse("DLFRightPlayer5").__text, "SUSAGE");
});

check("no match data: team fallbacks, hidden scores, season/match 1", () => {
  const t = boot("no-match", { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE }, { match: null, teamClasses: SPECTATOR });
  const b = t.snap("boot");
  assert.deepEqual([b.left.team, b.left.score, b.right.team, b.right.score], ["AMBER", "", "SAPPHIRE", ""]);
  assert.deepEqual(b.event, ["SEASON 1", "MATCH #1"]);
});

check("layout reload stops the previous loop", () => {
  const t = boot("reload", { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE }, { teamClasses: SPECTATOR });
  runInVm(bannerRun, t.context, "dlf_banner.js");
  const pending = () => t.harness.scheduler.jobs.filter((job) => job.delay === 1).length;
  assert.equal(pending(), 2);
  t.tick();
  t.tick();
  assert.equal(pending(), 1, "only the newest loop keeps scheduling");
});

check("banner follows the ESC menu's root attribute; bans show hero portraits", () => {
  const t = boot("root-state", { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE }, { teamClasses: SPECTATOR });
  const ban = (id) => t.topBar.FindChildTraverse(id);
  assert.ok(ban("DLFLeftBan0").BHasClass("DLFBanEmpty"), "no bans in match.json: art boxes stay");
  t.harness.root.SetAttributeString("dlf_match_state", JSON.stringify({
    season: 3, match: 12, seriesFormat: "Best of 3",
    amber: { name: "RED", score: 2, bans: [13, 0, 2] }, sapphire: { name: "BLUE", score: null, bans: [6, 77] }
  }));
  t.tick();
  const b = t.snap("override");
  assert.deepEqual(b.event, ["SEASON 3", "MATCH #12"]);
  assert.equal(b.series, "Best of 3");
  assert.deepEqual([b.left.team, b.left.score, b.right.team, b.right.score], ["RED", "2", "BLUE", ""]);
  assert.equal(ban("DLFLeftBan0").heroId, 13);
  assert.ok(!ban("DLFLeftBan0").BHasClass("DLFBanEmpty"));
  assert.ok(ban("DLFLeftBan1").BHasClass("DLFBanEmpty"));
  assert.deepEqual([ban("DLFRightBan0").heroId, ban("DLFRightBan1").heroId], [6, 77]);
  assert.equal(ban("DLFLeftBan2").heroId, 2, "the third ban shows");
  assert.ok(ban("DLFRightBan2").BHasClass("DLFBanEmpty"), "a two-ban list leaves the third box");
  // Two bans per team (the ESC menu's BANS switch): the two-ban art, the third slot written empty but kept
  // in the state; three again brings it back.
  const bannerRoot = t.topBar.FindChildTraverse("DLFBanner");
  assert.ok(!bannerRoot.BHasClass("DLFTwoBans"), "three bans by default");
  const twoBans = (banCount) => {
    t.harness.root.SetAttributeString("dlf_match_state", JSON.stringify({ season: 3, match: 12, seriesFormat: "Best of 3", banCount,
      amber: { name: "RED", score: 2, bans: [13, 0, 2] }, sapphire: { name: "BLUE", score: null, bans: [6, 77] } }));
    t.tick();
  };
  twoBans(2);
  assert.ok(bannerRoot.BHasClass("DLFTwoBans"), "two bans: the art without the inner boxes");
  assert.ok(ban("DLFLeftBan2").BHasClass("DLFBanEmpty"), "the third ban is not drawn at 2");
  assert.deepEqual([ban("DLFLeftBan0").heroId, ban("DLFRightBan0").heroId, ban("DLFRightBan1").heroId], [13, 6, 77]);
  twoBans(3);
  assert.ok(!bannerRoot.BHasClass("DLFTwoBans") && !ban("DLFLeftBan2").BHasClass("DLFBanEmpty"), "three again: the third ban is back");
  twoBans(7);
  assert.ok(!bannerRoot.BHasClass("DLFTwoBans"), "a bad count falls back to three");
  // Garbage falls back field by field; an unreadable attribute falls back to match.json.
  t.harness.root.SetAttributeString("dlf_match_state", JSON.stringify({ season: -4, match: "x", amber: { score: 500 } }));
  t.tick();
  assert.deepEqual(t.snap("garbage").event, ["SEASON 2", "MATCH #57"]);
  t.harness.root.SetAttributeString("dlf_match_state", "{not json");
  t.tick();
  assert.equal(t.snap("unreadable").left.team, "VENOM");
  assert.ok(ban("DLFRightBan0").BHasClass("DLFBanEmpty"), "bans cleared with the defaults");
});

// Ways the banner style and logos can fail, each covered below:
//  1. an editor style never reaches a section, or reaches the wrong labels;
//  2. out-of-range or malformed style values escape their frame instead of falling back;
//  3. a steady tick rewrites styles;
//  4. a web logo shows before it loads, a failed or replaced load hides the team emblem, or a stale
//     load from an earlier URL shows;
//  5. a logo or emblem stays on the side its team left;
//  6. URLs with other schemes, credentials, spaces or too long pass validation.
const fitState = (() => {
  const context = createVmContext(createPanoramaHarness());
  runInVm(stateRun, context, "dlf_state.js");
  return context.$.DLFState;
})();
// The size the banner should pick for text in a section (widths from dlf_banner.js FIT).
const fittedSize = (text, font, max, min, spacing, width) => `${fitState.fitFontSize(text, font, max, min, spacing, width)}px`;
const labelStyle = (panel) => ({ font: panel.style.fontFamily, size: panel.style.fontSize, spacing: panel.style.letterSpacing,
  weight: panel.style.fontWeight, italic: panel.style.fontStyle });

check("banner style: each section's font, size, spacing and offset; bad values fall back; steady state writes none", () => {
  const t = boot("style", { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE }, { teamClasses: SPECTATOR });
  const at = (id) => t.topBar.FindChildTraverse(id);
  assert.deepEqual(labelStyle(at("DLFLeftTeamName")),
    { font: '"ModestoLite Expanded", GOFIRE, Jost', size: "24px", spacing: "2px", weight: "normal", italic: "normal" }, "PSD defaults on boot");
  assert.equal(at("DLFEventLine2").style.fontSize, "14px", "event line 2 keeps the PSD ratio");
  const style = {
    event: { font: "jost", size: 26, x: 3, y: -2, spacing: 0 },
    team: { font: "napalm", size: 28, x: -6, y: 6, spacing: 4 },
    player: { font: "gofire", size: 16, x: 2, y: 4, spacing: 0 },
    score: { font: "gofire", size: 40, x: 0, y: -10, spacing: 1 },
    series: { font: "jost", size: 18, x: 12, y: 0, spacing: 3 }
  };
  t.harness.root.SetAttributeString("dlf_match_state", JSON.stringify({ style }));
  t.tick();
  assert.deepEqual(labelStyle(at("DLFEventLine1")), { font: "Jost", size: "26px", spacing: "0px", weight: "bold", italic: "italic" });
  assert.equal(at("DLFEventLine2").style.fontSize, "17px");
  assert.equal(at("DLFEventStack").style.transform, "translate3d(3px, -2px, 0px)");
  for (const side of ["Left", "Right"]) {
    assert.deepEqual(labelStyle(at(`DLF${side}TeamName`)),
      { font: "Operation Napalm, Jost", size: "28px", spacing: "4px", weight: "normal", italic: "italic" });
    assert.equal(at(`DLF${side}TeamName`).style.transform, "translate3d(-6px, 6px, 0px)");
    assert.equal(at(`DLF${side}Score`).style.fontSize, "40px");
    assert.equal(at(`DLF${side}Players`).style.transform, "translate3d(2px, 4px, 0px)", "player offset moves the row");
    for (let i = 0; i < 6; i++) {
      const label = at(`DLF${side}Player${i}`);
      assert.equal(label.style.fontSize, fittedSize(label.__text, "gofire", 16, 9, 0, 86), `${label.__text} fitted at most 16px`);
    }
  }
  assert.equal(at("DLFSeriesFormat").style.transform, "translate3d(12px, 0px, 0px)");
  const writes = t.harness.operationCounts.styleWrites;
  t.tick();
  t.tick();
  assert.equal(t.harness.operationCounts.styleWrites, writes, "an unchanged style writes nothing");
  // Out of the section's limits, wrong type or unknown font: that field falls back to the default.
  t.harness.root.SetAttributeString("dlf_match_state", JSON.stringify({ style: {
    team: { font: "comic", size: 31, x: 7, y: 1.5, spacing: -1 }, player: { size: 7, y: 5 }, event: "x"
  } }));
  t.tick();
  assert.deepEqual(labelStyle(at("DLFLeftTeamName")),
    { font: '"ModestoLite Expanded", GOFIRE, Jost', size: "24px", spacing: "2px", weight: "normal", italic: "normal" });
  assert.equal(at("DLFLeftTeamName").style.transform, "translate3d(0px, 0px, 0px)");
  assert.equal(at("DLFLeftPlayer0").style.fontSize, fittedSize(AMBER[0], "modesto", 13, 9, 0, 86));
  t.harness.root.SetAttributeString("dlf_match_state", JSON.stringify({ style: {
    event: { font: "gofire" }, team: { font: "gofire" }, player: { font: "gofire" },
    score: { font: "gofire" }, series: { font: "gofire" }
  } }));
  t.tick();
  assert.equal(at("DLFSeriesFormat").style.fontFamily, '"ModestoLite Expanded", GOFIRE, Jost',
    "an untouched GOFIRE save uses Modesto");
  assert.equal(at("DLFEventLine1").style.fontSize, "22px");
});

// Ways the fitted sizes and card-aligned names can fail, each covered below:
//  1. the engine's shrink comes back (squashed stencil text) or a fitted size is fractional;
//  2. a short name loses its size, a long one overflows, or a name that gets shorter stays small;
//  3. event line 2 drops under its own minimum or exceeds its PSD ratio;
//  4. a name sits in a fixed slot instead of under its card (short teams, packed or reversed rows);
//  5. names show before their card is laid out, or stay for a hidden card;
//  6. geometry ignores the UI scale or the banner origin; steady ticks write.
check("banner text fits by whole font sizes; the engine's shrink is never used", () => {
  assert.ok(!/^\s*text-overflow:\s*shrink/m.test(bannerCss), "no text-overflow: shrink declaration in dlf_banner.css");
  const t = boot("fit", { TeamFriendly: ["KUSH", "TARGETDUMMY"], TeamEnemy: SAPPHIRE }, { teamClasses: SPECTATOR });
  const at = (id) => t.topBar.FindChildTraverse(id);
  assert.equal(at("DLFLeftPlayer0").style.fontSize, "13px", "a short name keeps the style size");
  const long = at("DLFLeftPlayer1").style.fontSize;
  assert.match(long, /^\d+px$/);
  assert.ok(Number.parseInt(long, 10) < 13 && Number.parseInt(long, 10) >= 8, `TARGETDUMMY fitted down: ${long}`);
  assert.ok(fitState.textWidth("TARGETDUMMY", "modesto", Number.parseInt(long, 10), 0) <= 86, "fits its 88px slot");
  const writes = t.harness.operationCounts.styleWrites;
  t.tick();
  t.tick();
  assert.equal(t.harness.operationCounts.styleWrites, writes, "steady ticks refit nothing");
  setName(t.teams.TeamFriendly[1], "BOB");
  t.tick();
  assert.equal(at("DLFLeftPlayer1").style.fontSize, "13px", "a shorter name gets its size back");
  // A saved letter spacing too wide for a long name is dropped for that label only.
  setName(t.teams.TeamFriendly[1], "TARGETDUMMY");
  t.harness.root.SetAttributeString("dlf_match_state", JSON.stringify({ style: { player: { spacing: 1 } } }));
  t.tick();
  assert.equal(at("DLFLeftPlayer0").style.letterSpacing, "1px", "a short name keeps the spacing");
  assert.equal(at("DLFLeftPlayer1").style.letterSpacing, "0px");
  assert.ok(fitState.textWidth("TARGETDUMMY", "modesto", Number.parseInt(at("DLFLeftPlayer1").style.fontSize, 10), 0) <= 86);
  t.harness.root.SetAttributeString("dlf_match_state", JSON.stringify({
    amber: { name: "HEALBANE SYNDICATE OF THE NORTH" }, style: { event: { size: 12 } }
  }));
  t.tick();
  const team = Number.parseInt(at("DLFLeftTeamName").style.fontSize, 10);
  assert.ok(team >= 14 && team < 24, `a long team name fits by size: ${team}`);
  assert.equal(at("DLFEventLine1").style.fontSize, "12px");
  assert.equal(at("DLFEventLine2").style.fontSize, "8px", "event line 2 keeps the ratio below 12px, never raised to 9");
});

check("player names sit under their own cards: short, packed and reversed teams; hidden until laid out", () => {
  const t = boot("align", { TeamFriendly: ["SOLO"], TeamEnemy: ["P1", "P2", "P3"] }, { teamClasses: SPECTATOR });
  const at = (id) => t.topBar.FindChildTraverse(id);
  const banner = at("DLFBanner");
  const cards = (teamId) => t.teams[teamId];
  // Screen geometry: 1600x900 window (UI scale 5/6), banner at x 10, cards 88 layout px wide.
  const scale = 1600 / 1920;
  for (const panel of [banner, ...cards("TeamFriendly"), ...cards("TeamEnemy")]) {
    panel.actualuiscale_x = scale;
    panel.GetPositionWithinWindow = function () { return { x: this.__screenX || 0, y: 0 }; };
    panel.actuallayoutwidth = 88 * scale;
  }
  banner.__screenX = 10;
  const putCard = (card, layoutX) => { card.__screenX = 10 + layoutX * scale; };
  // Not laid out yet: the names wait, hidden.
  for (const card of [...cards("TeamFriendly"), ...cards("TeamEnemy")]) card.actuallayoutwidth = 0;
  t.tick();
  assert.ok(at("DLFLeftPlayer0").BHasClass("DLFUnplaced") && at("DLFRightPlayer2").BHasClass("DLFUnplaced"));
  for (const card of [...cards("TeamFriendly"), ...cards("TeamEnemy")]) card.actuallayoutwidth = 88 * scale;
  putCard(cards("TeamFriendly")[0], 858); // a lone Amber card packed next to the clock
  [970, 1058, 1146].forEach((x, i) => putCard(cards("TeamEnemy")[i], x));
  t.tick();
  const left = (id) => at(id).style.marginLeft;
  assert.equal(left("DLFLeftPlayer0"), `${858 + 44 - 44}px`, "the lone Amber name is under its card, not in slot 0");
  assert.ok(!at("DLFLeftPlayer0").BHasClass("DLFUnplaced"));
  assert.deepEqual([0, 1, 2].map((i) => left(`DLFRightPlayer${i}`)), ["970px", "1058px", "1146px"]);
  for (const id of ["DLFLeftPlayer1", "DLFLeftPlayer5", "DLFRightPlayer3"]) assert.ok(at(id).BHasClass("DLFUnplaced"), `${id} has no card`);
  assert.deepEqual([at("DLFRightPlayer0").__text, at("DLFRightPlayer2").__text], ["P1", "P3"], "names keep their roster order");
  const writes = t.harness.operationCounts.styleWrites + t.harness.operationCounts.classWrites;
  t.tick();
  assert.equal(t.harness.operationCounts.styleWrites + t.harness.operationCounts.classWrites, writes, "steady state writes nothing");
  // Reversed packing (hero testing): the first card is drawn rightmost; a hidden card hides its name.
  [1146, 1058, 970].forEach((x, i) => putCard(cards("TeamEnemy")[i], x));
  cards("TeamEnemy")[1].visible = false;
  t.tick();
  assert.equal(left("DLFRightPlayer0"), "1146px");
  assert.equal(left("DLFRightPlayer2"), "970px");
  assert.ok(at("DLFRightPlayer1").BHasClass("DLFUnplaced"), "a hidden card hides its name");
});

check("team logos: a web logo replaces the team emblem only once loaded; failed or stale loads keep it; logos follow the team", () => {
  const t = boot("logos", { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE }, { teamClasses: SPECTATOR });
  const at = (id) => t.topBar.FindChildTraverse(id);
  const customs = (side) => at(`DLF${side}Logo`).Children().filter((child) => child.BHasClass("DLFLogoCustom"));
  const shown = (side) => at(`DLF${side}Logo`).BHasClass("DLFLogoCustomShown");
  const status = () => JSON.parse(t.harness.root.GetAttributeString("dlf_logo_status", "{}"));
  const setState = (amber, sapphire, extra = {}) => {
    t.harness.root.SetAttributeString("dlf_match_state", JSON.stringify(Object.assign({ amber, sapphire }, extra)));
    t.tick();
  };
  const emblem = (side) => at(`DLF${side}LogoDefault`).src;
  const EMBLEM = (team) => `s2r://panorama/images/dlf/dlf_emblem_${team}.vtex`;
  assert.deepEqual(customs("Left"), [], "no URL: only the team emblem");
  for (const [side, team] of [["Left", "amber"], ["Right", "sapphire"]]) {
    assert.match(topBarXml, new RegExp(`id="DLF${side}LogoDefault"[^>]*src="${EMBLEM(team)}"`), `layout emblem ${side}`);
  }
  assert.deepEqual(status(), { amber: "default", sapphire: "default" });
  const RED = "https://cdn.example.com/red.png";
  setState({ name: "RED", logo: { url: RED, scale: 150 } }, { name: "BLUE" });
  let [image] = customs("Left");
  assert.equal(image.src, RED);
  assert.ok(!shown("Left"), "the web logo stays hidden until it loads");
  assert.equal(status().amber, "loading");
  assert.deepEqual([at("DLFLeftLogo").style.width, at("DLFLeftLogo").style.height,
    at("DLFLeftLogo").style.marginLeft, at("DLFLeftLogo").style.marginTop], ["125px", "90px", "206px", "-2px"],
  "150%: centered on the PSD emblem box, height capped by the art");
  image.events.ImageLoaded();
  assert.ok(shown("Left"));
  assert.equal(status().amber, "loaded");
  const writes = t.harness.operationCounts.styleWrites + t.harness.createPanelCount;
  t.tick();
  assert.equal(t.harness.operationCounts.styleWrites + t.harness.createPanelCount, writes, "steady state: no new images or sizes");
  // A new URL: a new Image; the old one's late events do nothing.
  const GREEN = "https://cdn.example.com/green.webp?v=2";
  setState({ name: "RED", logo: { url: GREEN, scale: 150 } }, { name: "BLUE" });
  const stale = image;
  [image] = customs("Left");
  assert.notEqual(image, stale);
  assert.ok(!shown("Left"), "back to the team emblem while the new URL loads");
  stale.events.ImageLoaded();
  assert.ok(!shown("Left"), "a replaced image's load is ignored");
  image.events.ImageFailedLoad();
  assert.ok(!shown("Left"));
  assert.deepEqual(customs("Left"), [], "a failed image is removed");
  assert.equal(status().amber, "failed");
  assert.ok(t.harness.logs.some((line) => line.includes("amber logo failed")) &&
    !t.harness.logs.some((line) => line.includes("green.webp")), "failure logged without the URL");
  // Sapphire moves left (the player joined Sapphire): logos follow their team.
  setState({ name: "RED", logo: { url: RED, scale: 100 } }, { name: "BLUE", logo: { url: GREEN, scale: 50 } });
  t.topBar.FindChildTraverse("TeamFriendly").classes = ["enemy"];
  t.topBar.FindChildTraverse("TeamEnemy").classes = ["friend"];
  t.tick();
  assert.equal(customs("Left")[0].src, GREEN, "Sapphire's logo on the left");
  assert.equal(customs("Right")[0].src, RED);
  assert.deepEqual([emblem("Left"), emblem("Right")], [EMBLEM("sapphire"), EMBLEM("amber")], "emblems follow the team");
  assert.deepEqual([at("DLFLeftLogo").style.width, at("DLFLeftLogo").style.marginTop], ["42px", "22px"],
    "50% around the left emblem center");
  const swapped = t.harness.operationCounts.styleWrites + t.harness.createPanelCount;
  t.tick();
  assert.equal(t.harness.operationCounts.styleWrites + t.harness.createPanelCount, swapped, "a swap settles in one tick");
  setState({ name: "RED", logo: { url: "", scale: 100 } }, { name: "BLUE", logo: { url: GREEN, scale: 50 } });
  assert.deepEqual(customs("Right"), [], "clearing the URL restores the team emblem");
  assert.equal(emblem("Right"), EMBLEM("amber"));
  // An imgur page link: the GIF first, then the still image; the emblem stays until one loads.
  setState({ name: "RED", logo: { url: "https://imgur.com/AbCdE12", scale: 100 } }, { name: "BLUE", logo: { url: GREEN, scale: 50 } });
  let [first] = customs("Right");
  assert.equal(first.src, "https://i.imgur.com/AbCdE12.gif");
  first.events.ImageFailedLoad();
  const [second] = customs("Right");
  assert.equal(second.src, "https://i.imgur.com/AbCdE12.png", "a failed source makes way for the next");
  assert.equal(customs("Right").length, 1, "the failed image is removed");
  assert.equal(status().amber, "loading");
  second.events.ImageLoaded();
  assert.ok(shown("Right"));
  assert.equal(status().amber, "loaded");
  setState({ name: "RED", logo: { url: "https://imgur.com/ZzYyX99", scale: 100 } }, { name: "BLUE", logo: { url: GREEN, scale: 50 } });
  [first] = customs("Right");
  first.events.ImageFailedLoad();
  customs("Right")[0].events.ImageFailedLoad();
  assert.deepEqual(customs("Right"), [], "every source failed: the emblem stays");
  assert.equal(status().amber, "failed");
});

check("logo URLs: http(s) with a plain host only, never truncated", () => {
  const context = createVmContext(createPanoramaHarness());
  runInVm(stateRun, context, "dlf_state.js");
  const clean = (url) => context.$.DLFState.cleanUrl(url);
  for (const url of ["https://i.imgur.com/abc.png", "http://cdn.example.com:8080/a/b.jpg?x=1#f", "HTTPS://A.B/c.webp"]) {
    assert.equal(clean(`  ${url} `), url);
  }
  assert.equal(clean(""), "");
  for (const url of ["file:///C:/x.png", "s2r://panorama/images/x.vtex", "javascript:alert(1)", "https://user:pw@host/x.png",
    "https://host/a b.png", "https://host\\x.png", "https://host/x\u0007.png", "https:///x.png", "https://-bad-.com/x",
    `https://host/${"a".repeat(512)}`, "//host/x.png", 42]) {
    assert.equal(clean(url), null, `rejected: ${String(url).slice(0, 40)}`);
  }
  // Animated WebP draws as garbage in game and video does not load; hosts that can serve GIF are asked
  // for it, then for a still image (Observer HUD's logoSources).
  const sources = (url) => Array.from(context.$.DLFState.logoSources(url));
  assert.deepEqual(sources("https://images-ext-1.discordapp.net/external/abc/https/gif.fxtwitter.com/tweet_video/X.webp?animated=true"),
    ["https://images-ext-1.discordapp.net/external/abc/https/gif.fxtwitter.com/tweet_video/X.webp?animated=true&format=gif"]);
  assert.deepEqual(sources("https://media.discordapp.net/attachments/1/2/a.WEBP?format=webp&width=100#x"),
    ["https://media.discordapp.net/attachments/1/2/a.WEBP?width=100&format=gif"]);
  assert.deepEqual(sources("https://gif.fxtwitter.com/tweet_video/X.webp"), ["https://gif.fxtwitter.com/tweet_video/X.gif"]);
  assert.deepEqual(sources("https://imgur.com/AbCdE12"), ["https://i.imgur.com/AbCdE12.gif", "https://i.imgur.com/AbCdE12.png"]);
  assert.deepEqual(sources("https://i.imgur.com/AbCdE12.gifv"), ["https://i.imgur.com/AbCdE12.gif", "https://i.imgur.com/AbCdE12.png"]);
  assert.deepEqual(sources("https://giphy.com/gifs/team-logo-xT9IgG50Fb7Mi0prBC"), ["https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif"]);
  assert.deepEqual(sources("https://media1.tenor.com/m/AbCdEfGhIjKxyzWQ/logo.webp"), ["https://media1.tenor.com/m/AbCdEfGhIjKAAAAC/logo.gif"]);
  assert.deepEqual(sources("https://github.com/o/r/blob/main/logo.png"), ["https://raw.githubusercontent.com/o/r/main/logo.png"]);
  for (const url of ["https://media.discordapp.net/attachments/1/2/image0.gif?ex=1&hm=2&=", "https://cdn.example.com/a.webp",
    "https://evil.discordapp.net.example.com/a.webp", "https://i.imgur.com/a.png"]) {
    assert.deepEqual(sources(url), [url], `unchanged: ${url}`);
  }
  assert.deepEqual(sources(""), []);
  const state = context.$.DLFState.normalize({ amber: { logo: { url: "ftp://x/y.png", scale: 300 } } }, context.$.DLFState.defaults());
  assert.deepEqual(JSON.parse(JSON.stringify(state.amber.logo)), { url: "", scale: 100 }, "an invalid logo falls back to the defaults");
});

// ---------------------------------------------------------------- ESC menu + durable save
// Ways this can fail, each covered below:
//  1. menu edits never reach the banner (root attribute, normalization mismatch);
//  2. saves are lost, repeated, or overwrite a save the menu could not read;
//  3. a restart does not restore the saved match, or a reload drops this session's edits;
//  4. the page touches HP Colors / Buff Timer keys;
//  5. offline / outdated pages leave the menu stuck or writing;
//  6. a hero is banned twice, or a removed hero ID survives;
//  7. text entry: Enter commits, Escape reverts, empty names fall back.

const menuJs = read("panorama/scripts/dlf/dlf_menu.js");
const heroesJs = read("panorama/scripts/dlf/dlf_heroes.js");
const menuRun = script("dlf/dlf_menu.js");
const escapeXml = read("panorama/layout/hud_escape_menu.xml");
const escapeLayout = parseLayout(escapeXml);
const PAGE_PATH = process.env.DLF_STORE_PAGE || "D:/hpv2-store/dlf/index.html";
const PAGE_URL = "https://hantu-raya.github.io/hpv2-store/dlf/";
const pageSource = fs.readFileSync(PAGE_PATH, "utf8").match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)[1];
const STORE_KEY = "hantu.dlf.v1/match";
const OTHER_KEYS = { "hantu.hpcolors.v2/state": "HPV2S1.keep", "hantu.bufftimer.v1/settings": "BTS1.keep" };
const HEROES = new vm.Script(`${heroesJs}\nDLF_HEROES`).runInNewContext({});

function record(body) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) { hash ^= body.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; }
  return `DLFS1.${hash.toString(16).padStart(8, "0")}.${body}`;
}

// One game launch: fresh HUD, top bar (banner) and Escape menu; only profile.disk survives.
// legacyPage: the published page before capacity negotiation (no m in its ready reply, 1024 cap).
// noForgetPage: the published page before the delete op (o: "d"), as Pages may still serve it.
// web (returned, mutable): offline (every load fails), lostLoads (the next n loads fail), loadDelay (ms).
// A failed load leaves a dead document: fragment-only URLs reach nothing until the panel visits
// about:blank and the page is loaded again (Observer HUD, live 2026-10-23).
function launch(profile, { commit = true, version = null, legacyPage = false, noForgetPage = false,
  offline = false, lostLoads = 0, loadDelay = 800, cardDelay = 0 } = {}) {
  const harness = createPanoramaHarness();
  const hud = buildHud(harness, { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE });
  hud.topBar.FindChildTraverse("TeamFriendly").classes = ["team1"];
  hud.topBar.FindChildTraverse("TeamEnemy").classes = ["team2"];
  const escape = instantiate(escapeLayout, hud.topBar.parent);
  const stats = { writes: 0, reads: 0, pageLoads: 0, keys: new Set() };
  const store = escape.FindChildTraverse("DLFStore");
  const web = { offline, lostLoads, loadDelay, urls: [] };
  let page = null;
  let pending = null; // { href } while the page loads
  let dead = false;
  let hashchange = null;
  const deliver = (title) => {
    let text = String(title);
    if (version !== null && text.includes('"o":"ready"')) text = text.replace(/"v":\d+/, `"v":${version}`);
    if (legacyPage && text.includes('"o":"ready"')) text = text.replace(/"m":\d+,/, "");
    harness.scheduler.schedule(0.05, () => store.events.HTMLTitle && store.events.HTMLTitle(store, text));
  };
  const observe = (href) => {
    const message = JSON.parse(decodeURIComponent(new URL(href).hash.slice(1)));
    if (message.o === "w") stats.writes++;
    if (message.o === "r") stats.reads++;
    if (message.o === "d") stats.deletes = (stats.deletes || 0) + 1;
  };
  store.SetURL = (raw) => {
    const url = String(raw);
    web.urls.push(url);
    if (url === "about:blank") {
      page = null;
      pending = null;
      dead = false;
      hashchange = null;
      return;
    }
    assert.ok(url.startsWith(`${PAGE_URL}#`), "the menu only addresses the /dlf/ page");
    if (dead) return;
    if (page) {
      page.location.href = url;
      page.location.hash = new URL(url).hash;
      observe(url);
      hashchange();
      return;
    }
    if (pending) {
      pending.href = url;
      return;
    }
    if (!commit) return;
    if (web.offline || web.lostLoads > 0) {
      if (!web.offline) web.lostLoads--;
      dead = true;
      return;
    }
    const load = pending = { href: url };
    harness.scheduler.schedule(web.loadDelay / 1000, () => {
      if (pending !== load) return;
      pending = null;
      stats.pageLoads++;
      const localStorage = {
        getItem: (key) => { stats.keys.add(key); return profile.disk.has(key) ? profile.disk.get(key) : null; },
        setItem: (key, value) => { stats.keys.add(key); profile.disk.set(key, String(value)); },
        removeItem: (key) => { stats.keys.add(key); profile.disk.delete(key); }
      };
      const ctx = vm.createContext({
        JSON, Math, String, decodeURIComponent, localStorage,
        location: { href: load.href, hash: new URL(load.href).hash },
        addEventListener: (event, callback) => { if (event === "hashchange") hashchange = callback; },
        document: { set title(value) { if (page === ctx) deliver(value); } }
      });
      ctx.window = ctx;
      page = ctx;
      observe(load.href);
      let source = legacyPage ? pageSource.replace(/MAX_RECORD = \d+/, "MAX_RECORD = 1024") : pageSource;
      if (noForgetPage) {
        source = source.replace(/\n\s*if \(request\.o === "d"\) \{[\s\S]*?return;\n\s*\}/, "");
        assert.ok(!source.includes('"d"'), "the old page has no delete op");
      }
      vm.runInContext(source, ctx, { filename: "hpv2-store/dlf/index.html" });
    });
  };
  // Stock PLAYERS list: activating a row opens that player's profile card (bots open none); the
  // card's bound {i:r:account_id} is modelled by a pre-filled DLFAccount label. cardDelay (ms) opens it
  // later, inside a context menu, with the binding unresolved for one more 16 ms frame.
  const baseDispatch = harness.$.DispatchEvent;
  const cards = [];
  const menuLayer = new MockPanel("Panel", harness.root, "ContextMenuLayer");
  harness.$.DispatchEvent = (...args) => {
    const [name, panel] = args;
    if (name === "Activated" && panel && panel.__account !== undefined) {
      stats.rowActivations = (stats.rowActivations || 0) + 1;
      if (panel.__account) {
        const open = () => {
          const holder = cardDelay ? new MockPanel("CitadelContextMenuPlayer", menuLayer, "") : harness.root;
          const card = new MockPanel("CitadelProfileCard", holder, "ProfileCard");
          const label = new MockPanel("Label", card, "DLFAccount");
          label.__text = cardDelay ? "{i:r:account_id}" : panel.__account;
          if (cardDelay) harness.scheduler.schedule(0.016, () => { label.__text = panel.__account; });
          cards.push(holder === harness.root ? card : holder);
        };
        if (cardDelay) harness.scheduler.schedule(cardDelay / 1000, open);
        else open();
      }
    }
    if (name === "DismissAllContextMenus") cards.splice(0).forEach((card) => card.DeleteAsync());
    return baseDispatch(...args);
  };
  const playersList = (players) => {
    const list = escape.FindChildTraverse("PlayersList");
    list.RemoveAndDeleteChildren();
    for (const { name, account } of players) {
      const row = new MockPanel("CitadelPlayersListEntry", list, "");
      const main = new MockPanel("Panel", row, "MainContents");
      main.__account = account || "";
      const label = new MockPanel("Label", new MockPanel("Panel", main, ""), "");
      label.classes = ["PlayerName"];
      label.__text = name;
    }
  };
  const contextFor = (panel) => createVmContext(harness, { globals: { $: Object.assign({}, harness.$, { GetContextPanel: () => panel }) } });
  const match = matchScript(JSON.parse(read("match.json")));
  const bannerContext = contextFor(hud.topBar);
  for (const [name, source] of [["dlf_state.js", stateRun], ["dlf_match.js", match], ["dlf_banner.js", bannerRun]]) runInVm(source, bannerContext, name);
  const menuContext = contextFor(escape);
  const bootMenu = () => {
    for (const [name, source] of [["dlf_state.js", stateRun], ["dlf_match.js", match], ["dlf_heroes.js", heroesJs], ["dlf_menu.js", menuRun]]) {
      runInVm(source, menuContext, name);
    }
  };
  bootMenu();
  const panel = (id) => escape.FindChildTraverse(id);
  const click = (id) => panel(id).events.onactivate();
  const type = (id, text, how = "ontextentrysubmit") => { panel(id).__text = text; panel(id).events[how](); };
  const status = () => panel("DLFMenuStatus").__text;
  const saved = () => {
    const value = profile.disk.get(STORE_KEY);
    return value ? JSON.parse(value.slice(15)) : null;
  };
  const cancel = () => menuContext.$.DLFMenuCancel();
  return { harness, hud, escape, stats, panel, click, type, status, saved, bootMenu, cancel, playersList, web,
    advance: (ms) => harness.scheduler.runFor(ms, 2000), banner: () => bannerText(hud.topBar) };
}

const profileWith = (seed = {}) => ({ disk: new Map(Object.entries(Object.assign({}, OTHER_KEYS, seed))) });
const HAZE = HEROES.find(([, name]) => name === "Haze")[0];
const ABRAMS = HEROES.find(([, name]) => name === "Abrams")[0];

// Observer HUD, live 2026-10-23: one launch showed the defaults and never loaded the save (OFFLINE -
// SESSION ONLY, nothing written) while the page was up; the next launch loaded it. DLF's store has the
// same code: hello gave up for good after 30 s, and its retries changed only the URL fragment. How a fix
// could fail: a lost first load never recovers; a page that comes up after 30 s is never asked again; a
// late save overwrites edits made meanwhile; a slow load is cut off by the reloads; an offline PC is
// asked forever.
check("ESC menu save: a lost or late save page is asked again; edits made meanwhile win; an offline PC is not asked forever", () => {
  const profile = profileWith();
  const a = launch(profile);
  a.advance(3000);
  a.click("DLFMenuButton");
  a.click("DLFSeasonUp");
  a.advance(3000);
  assert.equal(a.status(), "SAVED");
  const season = a.saved().season;
  const record = profile.disk.get(STORE_KEY);
  const seasonText = a.banner().event[0];
  const pageLoads = (g) => g.web.urls.filter((url) => url.startsWith(PAGE_URL)).length;
  // The first load is lost (an error page): the page is loaded again and the save adopted.
  const b = launch(profile, { lostLoads: 1 });
  b.advance(20000);
  assert.equal(b.banner().event[0], seasonText, "adopted after the lost load");
  assert.equal(b.status(), "SAVED");
  assert.ok(b.web.urls.includes("about:blank"), "left the dead page to load it again");
  // The page answers only after a minute: session only at 30 s, then the save loads.
  const c = launch(profile, { offline: true });
  c.advance(31000);
  assert.equal(c.status(), "OFFLINE - SESSION ONLY");
  c.web.offline = false;
  c.advance(60000);
  assert.equal(c.banner().event[0], seasonText, "a late page still loads the save");
  assert.equal(c.status(), "SAVED");
  // Edits made while offline win over the late save, and are saved.
  const d = launch(profile, { offline: true });
  d.advance(31000);
  d.click("DLFMenuButton");
  d.click("DLFSeasonUp");
  d.click("DLFSeasonUp"); // defaults + 2, one more than the stored season
  d.advance(1500);
  const typed = d.banner().event[0];
  assert.notEqual(typed, seasonText);
  d.web.offline = false;
  d.advance(60000);
  assert.equal(d.banner().event[0], typed, "the late save does not replace the session's edit");
  assert.equal(d.saved().season, season + 1, "the session's edit is saved");
  assert.equal(d.status(), "SAVED");
  profile.disk.set(STORE_KEY, record);
  // Every load takes 9 s (longer than the first reload gap): a later load still completes.
  const s = launch(profile, { loadDelay: 9000 });
  s.advance(40000);
  assert.equal(s.banner().event[0], seasonText, "a slow page loads the save");
  // Really offline: asked for a few minutes, then only when the editor opens again.
  const e = launch(profile, { offline: true });
  e.advance(300000);
  assert.equal(e.status(), "OFFLINE - SESSION ONLY");
  const asked = pageLoads(e);
  e.advance(120000);
  assert.equal(pageLoads(e), asked, "no requests after giving up");
  e.web.offline = false;
  e.click("DLFMenuButton");
  e.advance(20000);
  assert.ok(pageLoads(e) > asked, "opening the editor asks again");
  assert.equal(e.banner().event[0], seasonText);
  assert.equal(e.status(), "SAVED");
});

check("ESC menu: edits reach the banner, save once per burst, and survive a restart", () => {
  const profile = profileWith();
  const g = launch(profile);
  g.advance(3000);
  assert.equal(g.status(), "SAVED", "a first launch stores the defaults");
  assert.deepEqual(g.banner().event, ["SEASON 2", "MATCH #57"]);
  const writesBefore = g.stats.writes;
  g.click("DLFMenuButton");
  assert.ok(g.escape.BHasClass("DLFMenuOpen"));
  g.click("DLFSeasonUp");
  g.click("DLFMatchUp");
  g.click("DLFMatchUp");
  g.type("DLFAmberNameEntry", "  Team   Red ");
  g.type("DLFSeriesEntry", "Best of 3");
  g.click("DLFSapphireScoreUp");
  g.click("DLFAmberBan0");
  assert.ok(g.escape.BHasClass("DLFPicking"));
  g.panel(`DLFHero${HAZE}`).events.onactivate();
  assert.ok(!g.escape.BHasClass("DLFPicking"), "picking a hero closes the grid");
  assert.equal(g.panel("DLFAmberBan0Label").__text, "Haze");
  g.advance(1000);
  const b = g.banner();
  assert.deepEqual(b.event, ["SEASON 3", "MATCH #59"]);
  assert.deepEqual([b.series, b.left.team, b.right.score], ["Best of 3", "Team Red", "1"]);
  assert.equal(g.hud.topBar.FindChildTraverse("DLFLeftBan0").heroId, HAZE);
  g.advance(3000);
  assert.equal(g.status(), "SAVED");
  assert.equal(g.stats.writes, writesBefore + 1, "one write for the whole burst of edits");
  assert.deepEqual(g.saved(), Object.assign({ s: 1 }, JSON.parse(g.hud.topBar.parent.parent.GetAttributeString("dlf_match_state", ""))));
  for (const [key, value] of Object.entries(OTHER_KEYS)) assert.equal(profile.disk.get(key), value, `${key} untouched`);
  assert.deepEqual([...g.stats.keys], [STORE_KEY], "the page only touches its own key");

  const next = launch(profile);
  next.advance(3000);
  assert.equal(next.status(), "SAVED");
  assert.equal(next.stats.writes, 0, "an unchanged restore writes nothing");
  const restored = next.banner();
  assert.deepEqual([restored.event, restored.left.team, restored.series], [["SEASON 3", "MATCH #59"], "Team Red", "Best of 3"]);
  assert.equal(next.hud.topBar.FindChildTraverse("DLFLeftBan0").heroId, HAZE);
  results.runs.push({ name: "menu-save-restart", saved: next.saved(), banner: restored });
});

check("ESC menu: one ban per hero, NO BAN clears, unknown hero IDs drop, a two-ban save gets an empty third slot", () => {
  const profile = profileWith({ [STORE_KEY]: record(JSON.stringify({ s: 1, season: 1, match: 1, seriesFormat: "",
    amber: { name: "A", score: 0, bans: [HAZE, 999] }, sapphire: { name: "S", score: 0, bans: [0, 0] } })) });
  const g = launch(profile);
  g.advance(3000);
  assert.equal(g.panel("DLFAmberBan1Label").__text, "NO BAN", "a hero ID missing from the table becomes empty");
  assert.equal(g.panel("DLFAmberBan2Label").__text, "NO BAN", "a save from before the third ban has an empty one");
  g.click("DLFAmberBan2");
  g.panel(`DLFHero${ABRAMS}`).events.onactivate();
  g.click("DLFSapphireBan1");
  g.panel(`DLFHero${HAZE}`).events.onactivate();
  g.advance(1000);
  assert.equal(g.hud.topBar.FindChildTraverse("DLFLeftBan0").BHasClass("DLFBanEmpty"), true, "Haze moved off Amber");
  assert.equal(g.hud.topBar.FindChildTraverse("DLFRightBan1").heroId, HAZE);
  assert.equal(g.hud.topBar.FindChildTraverse("DLFLeftBan2").heroId, ABRAMS, "the third ban reaches the banner");
  g.click("DLFSapphireBan1");
  g.click("DLFPickerNone");
  g.click("DLFAmberBan0");
  g.click("DLFPickerCancel");
  g.advance(3000);
  assert.deepEqual([g.saved().amber.bans, g.saved().sapphire.bans], [[0, 0, ABRAMS], [0, 0, 0]]);
  // BANS flips 3 -> 2 -> 3: the third slot collapses and leaves the banner (the two-ban art); its ban is kept
  // and saved, and comes back with three.
  assert.equal(g.panel("DLFBanCountLabel").__text, "3");
  assert.equal(g.panel("DLFAmberBan2").visible, true);
  g.click("DLFBanCount");
  assert.equal(g.panel("DLFBanCountLabel").__text, "2");
  assert.equal(g.panel("DLFAmberBan2").visible, false, "two bans: the third slot collapses");
  g.advance(1000);
  assert.ok(g.hud.topBar.FindChildTraverse("DLFBanner").BHasClass("DLFTwoBans"));
  assert.ok(g.hud.topBar.FindChildTraverse("DLFLeftBan2").BHasClass("DLFBanEmpty"), "the hidden ban leaves the banner");
  g.advance(3000);
  assert.deepEqual([g.saved().banCount, g.saved().amber.bans], [2, [0, 0, ABRAMS]], "and stays in the save");
  g.click("DLFBanCount");
  g.advance(1000);
  assert.equal(g.panel("DLFAmberBan2").visible, true);
  assert.equal(g.hud.topBar.FindChildTraverse("DLFLeftBan2").heroId, ABRAMS, "three again brings it back");
  assert.ok(!g.hud.topBar.FindChildTraverse("DLFBanner").BHasClass("DLFTwoBans"));
});

check("ESC menu: Escape reverts a name, an empty name falls back, scores clamp", () => {
  const g = launch(profileWith());
  g.advance(3000);
  g.type("DLFSapphireNameEntry", "Draft", "oncancel");
  assert.equal(g.panel("DLFSapphireNameEntry").__text, "BANANABREAD");
  g.type("DLFSapphireNameEntry", "   ");
  g.advance(1000);
  assert.equal(g.banner().right.team, "BANANABREAD", "empty name keeps the match.json name");
  for (let i = 0; i < 3; i++) g.click("DLFAmberScoreDown");
  for (let i = 0; i < 101; i++) g.click("DLFSapphireScoreUp");
  g.advance(1000);
  assert.deepEqual([g.banner().left.score, g.banner().right.score], ["0", "99"]);
});

check("ESC menu: season and match numbers can be typed; bad text reverts, steppers still step", () => {
  const profile = profileWith();
  const g = launch(profile);
  g.advance(3000);
  g.click("DLFMenuButton");
  assert.equal(g.panel("DLFMatchEntry").text, "57");
  g.type("DLFMatchEntry", "112");
  g.type("DLFSeasonEntry", " #4 ", "onblur");
  g.advance(1000);
  assert.deepEqual(g.banner().event, ["SEASON 4", "MATCH #112"], "Enter and leaving the box both commit");
  g.click("DLFMatchUp");
  assert.equal(g.panel("DLFMatchEntry").text, "113", "the box follows the stepper");
  for (const bad of ["abc", "12345", "-3", "1.5", ""]) {
    g.type("DLFMatchEntry", bad);
    assert.equal(g.panel("DLFMatchEntry").text, "113", `"${bad}" reverts`);
  }
  g.type("DLFSeasonEntry", "9", "oncancel");
  assert.equal(g.panel("DLFSeasonEntry").text, "4", "Escape reverts the draft");
  g.type("DLFSeasonEntry", "0");
  g.advance(3000);
  assert.deepEqual([g.saved().season, g.saved().match], [0, 113]);
});

check("ESC menu: players without a known account get session aliases that follow the slot's player", () => {
  const profile = profileWith();
  const g = launch(profile);
  g.advance(3000);
  g.click("DLFMenuButton");
  g.advance(1000);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => g.panel(`DLFAmberPlayer${i}Game`).__text), AMBER, "rows list the Amber top bar");
  assert.equal(g.panel("DLFSapphirePlayer4Game").__text, "BREAD");
  g.type("DLFAmberPlayer1Entry", "  Kush   Prime ");
  g.type("DLFSapphirePlayer4Entry", "A very long alias that is cut", "onblur");
  g.advance(1000);
  const b = g.banner();
  assert.equal(b.left.players[1], "Kush Prime");
  assert.equal(b.right.players[4], "A very long alia", "aliases stop at 16 characters");
  // The banner publishes { in-game name: alias } for the world bars, markers and kill feed (dlf_names.js).
  const top = (panel) => { while (panel.parent) panel = panel.parent; return panel; };
  const aliasMap = () => JSON.parse(top(g.hud.topBar).GetAttributeString("dlf_aliases", "") || "null");
  assert.deepEqual(aliasMap(), { BREAD: "A very long alia", KUSH: "Kush Prime" }, "published by in-game name");
  g.type("DLFAmberPlayer2Entry", "Draft", "oncancel");
  assert.equal(g.panel("DLFAmberPlayer2Entry").__text, "", "Escape reverts an alias draft");
  // A different player in the slot drops the alias; the original player getting it back restores it.
  setName(g.hud.teams.TeamFriendly[1], "STAND IN");
  g.advance(6000);
  assert.equal(g.banner().left.players[1], "STAND IN");
  assert.deepEqual(aliasMap(), { BREAD: "A very long alia" }, "the stand-in gets no alias anywhere");
  assert.equal(g.panel("DLFAmberPlayer1Entry").__text, "", "the row shows no alias for the new player");
  setName(g.hud.teams.TeamFriendly[1], "KUSH");
  g.advance(6000);
  assert.equal(g.banner().left.players[1], "Kush Prime");
  // Clearing restores the game name; aliases never reach the saved record.
  g.type("DLFAmberPlayer1Entry", "");
  g.advance(4000);
  assert.equal(g.banner().left.players[1], "KUSH");
  assert.deepEqual(g.saved().aliases, {}, "slot aliases are session-only");
  // A reloaded ESC layout keeps the session's aliases.
  g.bootMenu();
  g.advance(2000);
  assert.equal(g.banner().right.players[4], "A very long alia");
});

check("ESC menu: aliases follow the player's Steam account (learned from the PLAYERS list), sorted by account, saved", () => {
  const profile = profileWith();
  const g = launch(profile);
  g.advance(3000);
  const ids = { MASTIKHOR: "300", KUSH: "100", VAYAM: "200", NAMELESS: "900", MUXXOO: "500" };
  g.playersList([...AMBER, ...SAPPHIRE].map((name) => ({ name, account: ids[name] })));
  g.click("DLFMenuButton");
  g.advance(8000);
  const rowsOf = (side) => [0, 1, 2, 3, 4, 5].map((i) => g.panel(`DLF${side}Player${i}Game`).__text);
  assert.deepEqual(rowsOf("Amber"), ["KUSH (100)", "VAYAM (200)", "MASTIKHOR (300)", "ESDEATH", "T3RM1NATOR", "VENOM"],
    "rows sorted by account, players without one after in top-bar order");
  assert.deepEqual(rowsOf("Sapphire").slice(0, 2), ["MUXXOO (500)", "NAMELESS (900)"]);
  g.type("DLFAmberPlayer0Entry", "Kush Prime"); // KUSH, account 100
  g.advance(3000);
  assert.equal(g.banner().left.players[1], "Kush Prime");
  assert.deepEqual(g.saved().aliases, { 100: "Kush Prime" }, "saved by account");
  // KUSH moves to another slot: the alias goes with him.
  setName(g.hud.teams.TeamFriendly[1], "VENOM2");
  setName(g.hud.teams.TeamFriendly[4], "KUSH");
  g.advance(6000);
  assert.equal(g.banner().left.players[4], "Kush Prime");
  assert.equal(g.banner().left.players[1], "VENOM2");
  // Each row is probed once; a known player is not clicked again on reopen.
  const clicks = g.stats.rowActivations;
  g.click("DLFMenuClose");
  g.click("DLFMenuButton");
  g.advance(4000);
  assert.ok(g.stats.rowActivations <= clicks + 1, "only the new name is probed");
  // A restart keeps the alias; the account is learned again from the PLAYERS list.
  const next = launch(profile);
  next.advance(3000);
  next.playersList([{ name: "KUSH", account: "100" }]);
  next.click("DLFMenuButton");
  next.advance(4000);
  assert.equal(next.banner().left.players[1], "Kush Prime", "restored after a restart");
  // Clearing removes it from the record.
  next.type("DLFAmberPlayer0Entry", "");
  next.advance(3000);
  assert.deepEqual(next.saved().aliases, {});
});

// User 2026-10-24: "reworking the steam id to probe more faster". The probe waited fixed steps: 0.3 s for
// the list, card looks at 0.15/0.45/1.05 s and a 0.1 s gap per row, so 10 players and 2 bots took about
// 5 s, and every look walked the whole UI. Ways a faster probe can fail: it gives up on a real card that
// is a few frames late or whose {i:r:account_id} resolves a frame after it opens; it pins a card on the
// wrong player; a bot stalls it; a known player is clicked again; it walks the whole UI every poll.
check("ESC menu: the Steam account probe learns 10 players and 2 bots in under 2.5 s, each on the right player", () => {
  const g = launch(profileWith(), { cardDelay: 40 });
  g.advance(3000);
  const ids = { MASTIKHOR: "301", KUSH: "102", VAYAM: "203", T3RM1NATOR: "404", VENOM: "505",
    NAMELESS: "606", MUXXOO: "707", SANSKAR: "808", NOTXTATTA: "909", SUSAGE: "1010" }; // ESDEATH and BREAD are bots
  g.playersList([...AMBER, ...SAPPHIRE].map((name) => ({ name, account: ids[name] })));
  const rowsText = () => ["Amber", "Sapphire"].flatMap((side) => [0, 1, 2, 3, 4, 5].map((i) => g.panel(`DLF${side}Player${i}Game`).__text));
  const learned = () => rowsText().filter((text) => /\(\d+\)$/.test(text)).length;
  const counts = g.harness.operationCounts;
  for (const key of Object.keys(counts)) counts[key] = 0;
  g.click("DLFMenuButton");
  let elapsed = 0;
  while (learned() < 10 && elapsed < 8000) {
    g.harness.scheduler.runFor(10, 2000);
    elapsed += 10;
  }
  const walked = counts.childrenReads || 0;
  console.log(`   account probe ${elapsed} ms, ${walked} child reads`);
  results.accountProbe = { ms: elapsed, childReads: walked };
  assert.equal(learned(), 10, `all 10 accounts learned (${rowsText().join(", ")})`);
  assert.ok(elapsed <= 2500, `learned in ${elapsed} ms (the fixed-step probe took about 5000)`);
  for (const [name, id] of Object.entries(ids)) assert.ok(rowsText().includes(`${name} (${id})`), `${name} has ${id}`);
  assert.ok(rowsText().includes("ESDEATH") && rowsText().includes("BREAD"), "the bots keep no account");
  g.advance(3000);
  assert.equal(g.stats.rowActivations, 12, "each row clicked once");
  assert.ok(walked <= 50000, `the probe walks near the last card, not the whole UI every look (${walked} child reads; fixed steps: about 67000)`);
  // Reopening clicks nobody: the players are known and the bots missed once.
  g.click("DLFMenuClose");
  g.click("DLFMenuButton");
  g.advance(4000);
  assert.equal(g.stats.rowActivations, 12, "no row clicked again on reopen");
});

check("ESC menu: Escape closes the hero picker, then the editor, then resumes", () => {
  const g = launch(profileWith());
  g.advance(3000);
  assert.equal(g.cancel(), false, "editor closed: Escape resumes the game");
  g.click("DLFMenuButton");
  g.click("DLFAmberBan0");
  assert.equal(g.cancel(), true);
  assert.ok(!g.escape.BHasClass("DLFPicking") && g.escape.BHasClass("DLFMenuOpen"), "first the picker closes");
  assert.equal(g.cancel(), true);
  assert.ok(!g.escape.BHasClass("DLFMenuOpen"), "then the editor");
  assert.equal(g.cancel(), false);
});

check("ESC menu: damaged or newer saves are never overwritten until RESET", () => {
  for (const [stored, label] of [["DLFS1.00000000.{}", "SAVE DAMAGED - RESET TO REPAIR"],
    [record(JSON.stringify({ s: 2 })), "NEWER SAVE - RESET TO OVERWRITE"]]) {
    const profile = profileWith({ [STORE_KEY]: stored });
    const g = launch(profile);
    g.advance(3000);
    assert.equal(g.status(), label);
    g.click("DLFMatchUp");
    g.advance(4000);
    assert.equal(profile.disk.get(STORE_KEY), stored, `${label}: an edit does not overwrite`);
    assert.equal(g.banner().event[1], "MATCH #58", "edits still reach the banner");
    g.click("DLFMenuReset");
    g.click("DLFMenuReset"); // the second press within 4 s confirms
    g.advance(3000);
    assert.equal(g.status(), "SAVED");
    assert.equal(g.saved().match, 57, "RESET writes the match.json defaults");
  }
});

// FORGET SAVE. Ways this can fail, each covered below:
//  1. one stray click deletes the save (it must ask for a second click);
//  2. the record stays on disk, another page key is touched, or the defaults are written straight back;
//  3. session names or account aliases survive, so a later import is not clean;
//  4. a write in flight, or a forget before the page has loaded, loses the delete or writes the old state back;
//  5. the published page without the delete op (Pages cache) fails silently or loses the record.
check("ESC menu: FORGET SAVE deletes this PC's save and starts clean, after a second click", () => {
  const stored = record(JSON.stringify({ s: 1, season: 7, match: 70, seriesFormat: "Bo5", aliases: { "100": "Kush Alias" } }));
  const profile = profileWith({ [STORE_KEY]: stored });
  const g = launch(profile);
  g.advance(3000);
  assert.deepEqual(g.banner().event, ["SEASON 7", "MATCH #70"], "the stored save loaded");
  g.playersList([...AMBER, ...SAPPHIRE].map((name) => ({ name, account: name === "KUSH" ? "100" : "" })));
  g.click("DLFMenuButton");
  g.advance(8000);
  const botName = g.panel("DLFSapphirePlayer5Game").__text;
  g.type("DLFSapphirePlayer5Entry", "Bot Alias");
  g.advance(3000);
  const writes = g.stats.writes;
  const root = g.hud.topBar.parent.parent;

  g.click("DLFMenuForget");
  g.advance(3000);
  assert.ok(profile.disk.has(STORE_KEY), "one click deletes nothing");
  assert.equal(g.panel("DLFMenuForgetLabel").__text, "FORGET SAVE", "the confirmation runs out");
  g.click("DLFMenuForget");
  assert.equal(g.panel("DLFMenuForgetLabel").__text, "CLICK AGAIN TO FORGET");
  g.click("DLFMenuForget");
  g.advance(1000);
  assert.equal(g.status(), "SAVE FORGOTTEN - DEFAULTS");
  assert.equal(profile.disk.has(STORE_KEY), false, "the record is deleted");
  assert.deepEqual([...profile.disk.keys()].sort(), Object.keys(OTHER_KEYS).sort(), "other pages' keys stay");
  assert.equal(g.panel("DLFMenuForgetLabel").__text, "FORGET SAVE");
  const state = JSON.parse(root.GetAttributeString("dlf_match_state", ""));
  assert.deepEqual(state.aliases, {}, "account aliases are gone");
  assert.equal(state.season, 2, "the defaults");
  g.advance(3000);
  assert.equal(g.banner().right.players[SAPPHIRE.indexOf(botName)], botName, "session names are gone");
  assert.deepEqual(g.banner().event, ["SEASON 2", "MATCH #57"]);
  assert.equal(g.stats.writes, writes, "nothing is written back until the next edit");
  g.click("DLFSeasonUp");
  g.advance(3000);
  assert.equal(g.status(), "SAVED");
  assert.deepEqual([g.saved().season, g.saved().match, g.saved().aliases], [3, 57, {}], "the next edit saves a clean record");
  const again = launch(profile);
  again.advance(3000);
  assert.deepEqual(again.banner().event, ["SEASON 3", "MATCH #57"], "a restart loads the clean save");

  // A write in flight: the delete follows its reply, and an edit made meanwhile is saved after the delete.
  const busyProfile = profileWith();
  const busy = launch(busyProfile);
  busy.advance(3000);
  busy.click("DLFMatchUp");
  busy.advance(1500); // the save is sent; its reply comes 0.05 s later
  busy.click("DLFMenuForget");
  busy.click("DLFMenuForget");
  busy.click("DLFSeasonUp");
  busy.advance(4000);
  assert.equal(busy.stats.deletes, 1);
  assert.equal(busy.status(), "SAVED");
  assert.deepEqual([busy.saved().season, busy.saved().match], [3, 57], "the forget reset the match; the later edit is saved");

  // Before the page has loaded: the stored state is not adopted, the record is deleted once ready.
  const earlyProfile = profileWith({ [STORE_KEY]: stored });
  const early = launch(earlyProfile);
  early.click("DLFMenuForget");
  early.click("DLFMenuForget");
  early.advance(3000);
  assert.equal(earlyProfile.disk.has(STORE_KEY), false);
  assert.equal(early.status(), "SAVE FORGOTTEN - DEFAULTS");
  assert.deepEqual(early.banner().event, ["SEASON 2", "MATCH #57"]);

  // An import confirmed while the delete is still waiting (page loading, or a write in flight) is saved
  // after the delete and survives a restart.
  const source = launch(profileWith());
  source.advance(3000);
  source.type("DLFAmberNameEntry", "Imported Team");
  source.click("DLFSeasonUp");
  source.click("DLFShareToggle");
  source.click("DLFShareCopy");
  const code = source.panel("DLFShareEntry").text;
  for (const [label, prepare] of [
    ["page still loading", (h) => h],
    ["write in flight", (h) => { h.advance(3000); h.click("DLFMatchUp"); h.advance(1500); return h; }]
  ]) {
    const disk = profileWith({ [STORE_KEY]: stored });
    const h = prepare(launch(disk));
    h.click("DLFMenuForget");
    h.click("DLFMenuForget");
    h.panel("DLFShareEntry").text = code;
    h.click("DLFShareImport");
    h.advance(5000);
    assert.equal(h.status(), "SAVED", `${label}: the import is saved after the delete`);
    const restarted = launch(disk);
    restarted.advance(3000);
    assert.deepEqual([restarted.banner().left.team, restarted.banner().event[0]], ["Imported Team", "SEASON 3"],
      `${label}: the import survives a restart`);
  }

  // The page without the delete op: the record stays and the status says why; edits still save.
  const oldProfile = profileWith({ [STORE_KEY]: stored });
  const old = launch(oldProfile, { noForgetPage: true });
  old.advance(3000);
  const kept = oldProfile.disk.get(STORE_KEY); // the load rewrites the record in normalized form
  old.click("DLFMenuForget");
  old.click("DLFMenuForget");
  old.advance(1000);
  assert.equal(old.status(), "FORGET NEEDS THE UPDATED SAVE PAGE");
  assert.equal(oldProfile.disk.get(STORE_KEY), kept, "nothing lost");
  old.click("DLFSeasonUp");
  old.advance(3000);
  assert.equal(old.status(), "SAVED");
  assert.equal(old.saved().season, 3);
});

check("ESC menu: offline or outdated page keeps edits for the session only", () => {
  for (const [options, label] of [[{ commit: false }, "OFFLINE - SESSION ONLY"], [{ version: 2 }, "SAVE PAGE OUTDATED - SESSION ONLY"]]) {
    const profile = profileWith();
    const g = launch(profile, options);
    g.click("DLFSeasonUp");
    g.advance(31000);
    assert.equal(g.status(), label);
    assert.equal(g.banner().event[0], "SEASON 3");
    assert.equal(profile.disk.has(STORE_KEY), false, `${label}: nothing written`);
    g.advance(150000); // an unanswered page is asked for 3 minutes
    assert.equal(g.status(), label);
    const leftover = g.harness.scheduler.jobs.filter((job) => job.delay !== 1);
    assert.deepEqual(leftover.map((job) => job.delay), [5], `${label}: no store timers left (the 5 s post-game handoff stays)`);
  }
});

check("ESC menu: an edit made while loading wins; a layout reload keeps the session's state", () => {
  const profile = profileWith({ [STORE_KEY]: record(JSON.stringify({ s: 1, season: 7, match: 70, seriesFormat: "Bo5",
    amber: { name: "OLD", score: 1, bans: [0, 0] }, sapphire: { name: "OLDER", score: 2, bans: [0, 0] } })) });
  const g = launch(profile);
  g.click("DLFAmberScoreUp");
  g.advance(4000);
  assert.equal(g.saved().amber.score, 1, "the session's state was saved over the old record");
  assert.equal(g.saved().season, 2);
  g.click("DLFAmberBan1");
  g.panel(`DLFHero${ABRAMS}`).events.onactivate();
  g.bootMenu();
  g.advance(4000);
  assert.equal(g.hud.topBar.FindChildTraverse("DLFLeftBan1").heroId, ABRAMS, "reloaded menu kept the ban");
  assert.equal(g.saved().amber.bans[1], ABRAMS);
});

check("ESC menu STYLE: one section at a time, bounded steppers, font cycle, RESET; saved and restored", () => {
  const profile = profileWith();
  const g = launch(profile);
  g.advance(3000);
  g.click("DLFMenuButton");
  g.click("DLFStyleToggle");
  assert.ok(g.escape.BHasClass("DLFStyleOpen") && g.panel("DLFStyleToggle").BHasClass("Selected"));
  g.click("DLFDevToggle");
  assert.ok(g.escape.BHasClass("DLFDevOpen") && !g.escape.BHasClass("DLFStyleOpen"), "one page at a time: DEV replaces STYLE");
  assert.ok(!g.panel("DLFStyleToggle").BHasClass("Selected") && g.panel("DLFDevToggle").BHasClass("Selected"));
  g.click("DLFStyleToggle");
  g.click("DLFStyleToggle");
  assert.ok(g.escape.BHasClass("DLFStyleOpen"), "a second click on the tab keeps its page (tabs do not toggle)");
  assert.ok(g.panel("DLFStyleTab_team").BHasClass("Selected"), "team names first");
  assert.equal(g.panel("DLFStyleSizeValue").__text, "24");
  for (let i = 0; i < 10; i++) g.click("DLFStyleSizeUp");
  assert.equal(g.panel("DLFStyleSizeValue").__text, "30", "size stops at the team limit");
  g.click("DLFStyleTab_player");
  assert.ok(g.panel("DLFStyleTab_player").BHasClass("Selected") && !g.panel("DLFStyleTab_team").BHasClass("Selected"));
  for (let i = 0; i < 10; i++) g.click("DLFStyleSizeDown");
  for (let i = 0; i < 9; i++) g.click("DLFStyleYUp");
  assert.deepEqual([g.panel("DLFStyleSizeValue").__text, g.panel("DLFStyleYValue").__text], ["8", "4"]);
  assert.equal(g.panel("DLFStyleFontLabel").__text, "MODESTO");
  g.click("DLFStyleFont");
  assert.equal(g.panel("DLFStyleFontLabel").__text, "GOFIRE");
  g.click("DLFStyleFont");
  g.click("DLFStyleFont");
  assert.equal(g.panel("DLFStyleFontLabel").__text, "JOST");
  g.click("DLFStyleFont");
  assert.equal(g.panel("DLFStyleFontLabel").__text, "MODESTO", "the font cycles back");
  g.advance(2000);
  const at = (id) => g.hud.topBar.FindChildTraverse(id);
  const rightTeam = at("DLFRightTeamName");
  assert.equal(rightTeam.style.fontSize, fittedSize(rightTeam.__text, "modesto", 30, 14, 2, 306), "team size 30, fitted to the band");
  assert.equal(at("DLFLeftPlayer3").style.fontSize, "8px", "a style size under the fit minimum is kept");
  assert.equal(at("DLFLeftPlayers").style.transform, "translate3d(0px, 4px, 0px)");
  g.click("DLFStyleReset");
  assert.deepEqual([g.panel("DLFStyleSizeValue").__text, g.panel("DLFStyleYValue").__text], ["13", "0"], "RESET restores the section");
  assert.equal(g.panel("DLFStyleTab_team").BHasClass("Selected"), false);
  g.advance(3000);
  assert.equal(g.status(), "SAVED");
  assert.equal(g.saved().style.team.size, 30);
  assert.deepEqual(g.saved().style.player, { font: "modesto", size: 13, x: 0, y: 0, spacing: 0 });
  const next = launch(profile);
  next.advance(3000);
  const restoredTeam = next.hud.topBar.FindChildTraverse("DLFLeftTeamName");
  assert.equal(restoredTeam.style.fontSize, fittedSize(restoredTeam.__text, "modesto", 30, 14, 2, 306), "restored after a restart");
});

check("ESC menu logos: URLs validated, size steps, load state from the banner", () => {
  const g = launch(profileWith());
  g.advance(3000);
  g.click("DLFMenuButton");
  const status = () => g.panel("DLFAmberLogoStatus").__text;
  const custom = () => g.hud.topBar.FindChildTraverse("DLFLeftLogo").Children().filter((c) => c.BHasClass("DLFLogoCustom"));
  g.advance(1500);
  assert.equal(status(), "TEAM EMBLEM");
  assert.equal(g.panel("DLFAmberLogoScale").__text, "100%");
  g.type("DLFAmberLogoEntry", "javascript:alert(1)");
  assert.equal(status(), "INVALID URL (HTTP/HTTPS IMAGE)");
  assert.ok(g.panel("DLFAmberLogoStatus").BHasClass("Failed"));
  g.advance(2000);
  assert.deepEqual(custom(), [], "a rejected URL changes nothing");
  g.type("DLFAmberLogoEntry", " https://cdn.example.com/red.png ");
  g.advance(1500);
  assert.equal(custom()[0].src, "https://cdn.example.com/red.png");
  assert.equal(status(), "LOADING");
  custom()[0].events.ImageLoaded();
  g.advance(1500);
  assert.equal(status(), "WEB LOGO");
  for (let i = 0; i < 20; i++) g.click("DLFAmberLogoUp");
  assert.equal(g.panel("DLFAmberLogoScale").__text, "200%");
  for (let i = 0; i < 20; i++) g.click("DLFAmberLogoDown");
  assert.equal(g.panel("DLFAmberLogoScale").__text, "50%");
  g.panel("DLFSapphireLogoEntry").__text = "https://x.example/blue.png";
  g.panel("DLFSapphireLogoEntry").events.oncancel();
  assert.equal(g.panel("DLFSapphireLogoEntry").__text, "", "Escape reverts the entry");
  g.advance(3000);
  assert.deepEqual(g.saved().amber.logo, { url: "https://cdn.example.com/red.png", scale: 50 });
});

check("save capacity: the old 1024 page saves logo-free records; the new page keeps long URLs", () => {
  const LONG = `https://cdn.example.com/${"a".repeat(480)}.png`;
  const profile = profileWith();
  const g = launch(profile, { legacyPage: true });
  g.advance(3000);
  g.click("DLFMenuButton");
  g.type("DLFAmberLogoEntry", LONG);
  g.type("DLFSapphireLogoEntry", "https://cdn.example.com/b.png");
  g.click("DLFSapphireLogoUp");
  g.advance(3000);
  assert.equal(g.status(), "SAVED - LOGO URLS THIS SESSION ONLY");
  assert.ok(profile.disk.get(STORE_KEY).length <= 1024);
  assert.deepEqual([g.saved().amber.logo, g.saved().sapphire.logo], [{ url: "", scale: 100 }, { url: "", scale: 110 }],
    "URLs dropped, sizes kept");
  const writes = g.stats.writes;
  g.advance(5000);
  assert.equal(g.stats.writes, writes, "the logo-free record is not rewritten on every check");
  g.click("DLFAmberScoreUp");
  g.advance(3000);
  assert.equal(g.status(), "SAVED - LOGO URLS THIS SESSION ONLY", "a later save keeps saying so");
  assert.equal(g.saved().amber.score, 1);
  assert.equal(g.hud.topBar.FindChildTraverse("DLFLeftLogo").Children().filter((c) => c.BHasClass("DLFLogoCustom"))[0].src, LONG,
    "the session still shows the logo");
  const restarted = launch(profile, { legacyPage: true });
  restarted.advance(3000);
  assert.equal(restarted.panel("DLFAmberLogoEntry").__text, "", "no old URL comes back");
  const fresh = profileWith();
  const n = launch(fresh);
  n.advance(3000);
  n.click("DLFMenuButton");
  n.type("DLFAmberLogoEntry", LONG);
  n.advance(3000);
  assert.equal(n.status(), "SAVED");
  assert.equal(n.saved().amber.logo.url, LONG);
  const again = launch(fresh);
  again.advance(3000);
  assert.equal(again.panel("DLFAmberLogoEntry").__text, LONG, "the new page restores long URLs");
});

check("ESC menu layout: stock Escape IDs kept, menu IDs bound, scripts in order", () => {
  // Every ID in the pinned stock 6774 hud_escape_menu.xml.
  const STOCK_IDS = ["EscapeBackground", "LeftStripeBlur", "LeftStripe", "Menu", "ContextualMenu", "matchmakingLeaveQueue",
    "matchmakingEditRoster", "reconnectRejoin", "reconnectAbandon", "disconnect", "abandon", "Unstick", "changehero",
    "SubOptions", "PlayerFeedback", "settings", "QuickMute", "quit", "PrivilegedFeatures", "EscapeButton", "RightSideBlur",
    "RightSide", "PartySpacer", "FriendsTab", "PlayersTab", "FriendsTabContents", "FriendsList", "PlayersTabContents", "PlayersList"];
  for (const id of STOCK_IDS) assert.ok(escapeXml.includes(`id="${id}"`), `stock #${id} kept`);
  for (const [, id] of escapeXml.matchAll(/id="(DLF\w+)"/g)) {
    if (["DLFMenuShell", "DLFMenuPages", "DLFAmberCard", "DLFSapphireCard", "DLFMenuBackdrop"].includes(id)) continue;
    const templated = /^DLF(Amber|Sapphire)/.test(id) && /DLF\$\{side\}/.test(menuJs) ||
      /^DLFStyleTab_/.test(id) && menuJs.includes("`DLFStyleTab_${section}`") ||
      /^DLFStyle(Size|X|Y|Spacing)(Down|Value|Up)$/.test(id) && menuJs.includes("`DLFStyle${key[0]}Down`") ||
      /^DLFGraph(Size|X|Y)(Down|Value|Up)$/.test(id) && menuJs.includes("`DLFGraph${key[0]}Down`") ||
      /^DLF(Match|Teams|Players|Graph|Style|Share|Dev)(Toggle|Panel)$/.test(id) && menuJs.includes("`DLF${name}Toggle`");
    assert.ok(menuJs.includes(`"${id}"`) || templated, `menu script binds #${id}`);
  }
  // Pages: one tab strip ahead of the page area, every page in it, the destructive buttons on the
  // SHARE / SAVE page (never beside the per-game controls), and the picker in the page area's place.
  const PAGES = ["Match", "Teams", "Players", "Graph", "Style", "Share", "Dev"];
  const tabs = escapeXml.indexOf('class="DLFMenuTabs"');
  const pages = escapeXml.indexOf('<Panel id="DLFMenuPages">');
  assert.ok(tabs > 0 && pages > tabs, "the tab strip comes before the page area");
  for (const name of PAGES) {
    const tab = escapeXml.indexOf(`id="DLF${name}Toggle"`);
    assert.ok(tab > tabs && tab < pages, `#DLF${name}Toggle is in the tab strip`);
    assert.ok(escapeXml.indexOf(`<Panel id="DLF${name}Panel" class="DLFPage`) > pages, `#DLF${name}Panel is a page`);
  }
  const picker = escapeXml.indexOf('<Panel id="DLFHeroPicker">');
  const section = (id) => PAGES.find((name) => {
    const start = escapeXml.indexOf(`<Panel id="DLF${name}Panel"`);
    const next = Math.min(...PAGES.map((other) => escapeXml.indexOf(`<Panel id="DLF${other}Panel"`)).filter((at) => at > start), picker);
    const at = escapeXml.indexOf(`id="${id}"`);
    return at > start && at < next;
  });
  assert.deepEqual([section("DLFSeasonEntry"), section("DLFAmberScoreUp"), section("DLFSapphireBan1")], ["Match", "Match", "Match"],
    "season, scores and bans are on the first page");
  assert.deepEqual([section("DLFMenuReset"), section("DLFMenuResetPage"), section("DLFMenuForget")], [undefined, undefined, "Share"],
    "RESET ALL and RESET <page> are in the header, FORGET is off the per-game pages");
  assert.ok(escapeXml.indexOf('id="DLFMenuReset"') > 0 && escapeXml.indexOf('id="DLFMenuReset"') < tabs, "the RESET buttons are in the header above the tab strip");
  assert.deepEqual([section("DLFAmberNameEntry"), section("DLFAmberLogoEntry"), section("DLFAmberPlayer0Entry"),
    section("DLFGraphFill"), section("DLFDebuffToggle")], ["Teams", "Teams", "Players", "Graph", "Dev"]);
  assert.ok(picker > pages && section("DLFHeroGrid") === undefined, "the hero picker is a sibling of the page area");
  // ESC (root oncancel), the stock Resume button and the dimmed background close DLF layers first.
  const gate = "if (!$.DLFMenuCancel()) $.DispatchEvent(&apos;CitadelResumePlaying&apos;, $.GetContextPanel())";
  assert.ok(escapeXml.includes(`<CitadelHudEscapeMenu oncancel="${gate}">`), "ESC goes through DLFMenuCancel");
  assert.ok(escapeXml.includes(`<Panel id="EscapeBackground" onactivate="${gate}" />`), "background goes through DLFMenuCancel");
  assert.ok(escapeXml.includes(`action="MenuBack" onactivate="${gate}"`), "Resume goes through DLFMenuCancel");
  assert.ok(/<Panel id="DLFMenuRoot" hittest="true">\s*<Button id="DLFMenuBackdrop" hittest="true" \/>/.test(escapeXml),
    "a Button backdrop behind the editor takes clicks on empty space");
  const order = ["dlf_state", "dlf_match", "dlf_heroes", "dlf_menu"].map((name) => escapeXml.indexOf(`scripts/dlf/${name}.vjs_c`));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])), "state, match, heroes, menu");
  assert.ok(HEROES.length >= 30 && new Set(HEROES.map(([id]) => id)).size === HEROES.length, "hero table has unique IDs");
});

// AUTO SERIES (Observer HUD's awardSeries, ported into the ESC menu, which owns the match state). Ways it
// can fail: it scores with the switch OFF; it scores a game it never saw ending (switched on at the end
// screen, or the screen still up from the last map); a demo seek back and forth scores twice; an
// abandoned game or a game not spectated scores; it goes past the wins the format needs; the editor can
// no longer correct it; the switch or the cue windows do not save, travel or reset with their page.
check("AUTO SERIES: the match-end screen adds the winner's point once per map, capped by the format; cue windows in the editor", () => {
  const app = launch(profileWith());
  app.advance(3000);
  const hudPanel = app.hud.topBar.parent;
  hudPanel.classes = ["spec_mode", "TeamSpectator"];
  const end = new MockPanel("Panel", hudPanel, "MatchEnd");
  const published = () => JSON.parse(app.harness.root.GetAttributeString("dlf_match_state", ""));
  const scores = () => [published().amber.score, published().sapphire.score];
  const showEnd = (...classes) => { end.classes = ["ShowMatchEnd", ...classes]; app.advance(2000); };
  const hideEnd = () => { end.classes = []; app.advance(2000); };
  const newMap = () => {
    const old = hudPanel.FindChildTraverse("TopBar");
    old.DeleteAsync();
    new MockPanel("Panel", hudPanel, "TopBar");
    app.advance(1000);
  };
  app.type("DLFSeriesEntry", "Best of 3");
  assert.deepEqual(scores(), [0, 0]);

  hideEnd();
  showEnd("MatchFinished", "Team1Victory");
  assert.deepEqual(scores(), [0, 0], "switch OFF (the default): the score stays the editor's");
  app.click("DLFAutoSeries");
  assert.equal(published().autoSeries, true);
  assert.equal(app.panel("DLFAutoSeriesLabel").__text, "ON");
  app.advance(2000);
  assert.deepEqual(scores(), [0, 0], "switched on at the end screen: that game was not seen ending");
  assert.ok(app.harness.logs.some((line) => /series not changed/.test(line)), "the observer is told in the console");

  newMap();
  hideEnd();
  showEnd("MatchFinished", "Team1Victory");
  assert.deepEqual(scores(), [1, 0], "a game seen ending: Amber +1");
  // A demo (replay_playback) seek back and forth keeps one point per map.
  hudPanel.classes = ["spec_mode", "TeamSpectator", "replay_playback"];
  hideEnd();
  showEnd("MatchFinished", "Team1Victory");
  assert.deepEqual(scores(), [1, 0], "once per map in a demo (a seek back and forth)");
  hudPanel.classes = ["spec_mode", "TeamSpectator"];
  // Live, the next game in the same private lobby keeps #TopBar (user 2026-11-06, on Observer HUD): the
  // end screen going away while spectating starts it, and its result counts once.
  hideEnd();
  showEnd("MatchFinished", "Team2Victory");
  assert.deepEqual(scores(), [1, 1], "the next live game on the same map counts");
  app.advance(5000);
  assert.deepEqual(scores(), [1, 1], "a screen that stays up counts once");
  app.click("DLFSapphireScoreDown");
  assert.deepEqual(scores(), [1, 0], "back to the score the rest of this check expects");

  newMap();
  hideEnd();
  showEnd("MatchAbandoned", "Team2Victory");
  assert.deepEqual(scores(), [1, 0], "an abandoned game scores nothing");
  newMap();
  hudPanel.classes = [];
  hideEnd();
  showEnd("MatchFinished", "Team2Victory");
  assert.deepEqual(scores(), [1, 0], "a game not spectated scores nothing");
  hudPanel.classes = ["spec_mode", "TeamSpectator"];

  for (const expected of [[1, 1], [1, 2], [1, 2]]) {
    newMap();
    hideEnd();
    showEnd("MatchFinished", "Team2Victory");
    assert.deepEqual(scores(), expected, "Sapphire wins, never past 2 in a best of 3");
  }
  app.click("DLFSapphireScoreDown");
  assert.deepEqual(scores(), [1, 1], "the editor still corrects it");

  // Cue windows: the SOUL GRAPH page's choice rows set state.cues; they save, and RESET SOUL GRAPH puts
  // them back (with the graph); RESET MATCH turns AUTO SERIES off again.
  assert.deepEqual(published().cues, { bridge: -1, urn: 30, rift: -1, mid: -1 }, "defaults keep the timers as they were");
  app.click("DLFGraphToggle");
  app.click(`DLFCueUrnRow${[0, 15, 30, 60, 120, -1].indexOf(60)}`);
  app.click(`DLFCueRiftRow0`);
  app.click(`DLFCueBridgeRow${[0, 15, 30, 60, 120, -1].indexOf(15)}`);
  assert.deepEqual(published().cues, { bridge: 15, urn: 60, rift: 0, mid: -1 });
  assert.ok(app.panel("DLFCueUrnRow3").BHasClass("Selected") && !app.panel("DLFCueUrnRow2").BHasClass("Selected"));
  app.advance(3000);
  assert.deepEqual(app.saved().cues, { bridge: 15, urn: 60, rift: 0, mid: -1 }, "saved with the match");
  assert.equal(app.saved().autoSeries, true);
  app.click("DLFMenuResetPage");
  app.click("DLFMenuResetPage");
  assert.deepEqual(published().cues, { bridge: -1, urn: 30, rift: -1, mid: -1 }, "RESET SOUL GRAPH");
  app.click("DLFMatchToggle");
  app.click("DLFMenuResetPage");
  app.click("DLFMenuResetPage");
  assert.equal(published().autoSeries, false, "RESET MATCH");
});

// ---------------------------------------------------------------- observer soul difference

check("soul difference falls back to visible SoulsValue when {i:gold} is empty", () => {
  const harness = createPanoramaHarness();
  const hud = buildHud(harness, { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE });
  hud.topBar.FindChildTraverse("TeamFriendly").classes = ["team1"];
  hud.topBar.FindChildTraverse("TeamEnemy").classes = ["team2"];
  new MockPanel("Panel", harness.root, "gameplay_hud");
  const souls = (team, hidden, shown) => hud.teams[team].forEach((player) => {
    player.FindChildrenWithClassTraverse("hiddenGoldValue")[0].__text = hidden;
    player.FindChildTraverse("SoulsValue").__text = shown;
  });
  const context = createVmContext(harness);
  runInVm(`${read("panorama/scripts/observer/observer_core.js")}\nthis.OBSERVER_PACK = OBSERVER_PACK;`, context, "observer_core.js");
  const pack = context.OBSERVER_PACK;
  const diff = (now) => {
    pack.updateSoulDifference(harness.root, now);
    return hud.topBar.FindChildTraverse("UrnTrackerLabel").__text;
  };
  souls("TeamFriendly", "", "12k");
  souls("TeamEnemy", "", "10k");
  assert.equal(diff(1000), "+16.7%");
  souls("TeamFriendly", "9000", "9k");
  souls("TeamEnemy", "12000", "12k");
  assert.equal(diff(10000), "-25.0%");
  results.runs.push({ name: "soul-difference", snapshots: [{ label: "exact", text: diff(20000) }] });
});

// Objective timers (QOLLOCK's panels, data from Observer HUD's live evidence, ENGINE.md "Objective data"
// in observer_hud, client 6813, demo 121685912). Ways the old copy failed, each covered below:
//  1. the rift showed a guessed ±60 s range (centred on 12:20) the whole time; no rift time is networked;
//  2. "open" came from the marker's .active class, not the stock capture meter;
//  3. the bridge timer counted through buffs still up (they stay until taken) and ignored pickups;
//  4. after a mid-game join or a seek the mid-boss read "Spawn" during its respawn: the stock label
//     ({s:midboss_timer} under #RejuvenatorTimer.midboss_cooldown) was never read.
check("objective timers: rift only from its 20 s warning to the capture, bridge UP until taken, mid-boss from the stock label", () => {
  const harness = createPanoramaHarness();
  const hud = buildHud(harness, { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE });
  const minimap = new MockPanel("Panel", harness.root, "hud_minimap");
  const capture = new MockPanel("Panel", minimap, "");
  capture.classes = ["map_button", "capture_point"];
  const koth = hud.topBar.FindChildTraverse("KothCashInMeter");
  koth.visible = false;
  const midTimer = hud.topBar.FindChildTraverse("RejuvenatorTimer");
  const midLabel = hud.topBar.FindChildTraverse("MidbossTimerLabel");
  midLabel.__text = "";
  const context = createVmContext(harness, { globals: { $: Object.assign({}, harness.$, { GetContextPanel: () => hud.topBar }) } });
  runInVm(`${script("observer/observer_core.js")}\nthis.OBSERVER_PACK = OBSERVER_PACK;`, context, "observer_core.js");
  runInVm(script("qollock/ql_feat_rejuvtimers.js"), context, "ql_feat_rejuvtimers.js");
  runInVm(script("qollock/ql_feat_urntimer.js"), context, "ql_feat_urntimer.js");
  const features = context.QOL.featureRegistry;
  const cfg = context.OBSERVER_PACK.config;
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const at = (sec) => {
    hud.topBar.FindChildTraverse("GameTime").__text = mmss(sec);
    for (const name of ["rejuvTimers", "urnTimer"]) features[name].update(harness.root, cfg, harness.now);
    harness.scheduler.runFor(1000, 200);
  };
  const play = (from, to) => { for (let s = from; s <= to; s++) at(s); };
  const text = (id) => hud.topBar.FindChildTraverse(id).__text;
  const rift = () => {
    const panel = harness.root.FindChildTraverse("RiftTimer");
    return panel && panel.visible !== false ? text("RiftTimerLabel") : null;
  };

  play(118, 120);
  assert.equal(text("BuffTimeHUD"), "3:00", "bridge counts to 5:00");
  assert.equal(text("RejuvTimeHUD"), "Spawn", "the mid-boss is alive");
  assert.equal(rift(), null, "no rift time before its warning");
  // Bridge buffs: UP while the minimap shows their markers, then the count to the next spawn.
  play(298, 301);
  const marker = new MockPanel("Panel", minimap, "");
  marker.classes = ["powerup_spawn"];
  play(302, 303);
  assert.equal(text("BuffTimeHUD"), "UP", "UP while a bridge buff is on the minimap");
  marker.DeleteAsync();
  play(339, 340);
  assert.equal(text("BuffTimeHUD"), "4:20", "taken: count to the next spawn");
  play(659, 660);
  assert.equal(rift(), null, "still no rift range at 11:00");
  // The rift: 20 s from the minimap warning, ACTIVE while the stock capture meter shows, then gone.
  capture.AddClass("koth_warning");
  play(758, 758);
  assert.equal(rift(), "0:20");
  play(759, 768);
  assert.equal(rift(), "0:10");
  capture.RemoveClass("koth_warning");
  koth.visible = true;
  play(778, 779);
  assert.equal(rift(), "ACTIVE");
  // User 2026-11-06: the timer still read live after "Rift faded away" and long after. An ended rift
  // keeps the stock meter visible (opacity 0 after its 5 s fade) with .captured, plus .captured_neutral
  // when time ran out (citadel_hud_koth.css 6860), until the next rift.
  koth.AddClass("captured");
  koth.AddClass("captured_neutral");
  play(797, 798);
  assert.equal(rift(), null, "timed out: hidden though the faded meter is still visible");
  play(1000, 1001);
  assert.equal(rift(), null, "and stays hidden until the next rift");
  koth.RemoveClass("captured");
  koth.RemoveClass("captured_neutral");
  play(1180, 1181);
  assert.equal(rift(), "ACTIVE", "the next rift opens: the meter loses its result classes");
  koth.AddClass("captured");
  play(1190, 1191);
  assert.equal(rift(), null, "captured by a team: hidden");
  koth.RemoveClass("captured");
  koth.visible = false;
  // Mid-boss respawn from the stock label (a join or seek during the cooldown), then alive again.
  midTimer.AddClass("midboss_cooldown");
  midLabel.__text = "6:54";
  play(1200, 1201);
  assert.equal(text("RejuvTimeHUD"), "6:54");
  midLabel.__text = "6:53";
  play(1202, 1202);
  assert.equal(text("RejuvTimeHUD"), "6:53");
  midTimer.RemoveClass("midboss_cooldown");
  midLabel.__text = "";
  play(1203, 1204);
  assert.equal(text("RejuvTimeHUD"), "Spawn");
});

// Observer HUD's objective cues in DLF's QOLLOCK panels (observer_hud oh_host.js sampleCues; urn times live
// there, 6813: 10:00 then every 5:00). A world with the QOLLOCK timers and dlf_state.js; cues, when given,
// are published like the editor does. Ways this can fail, each covered by the checks below:
//  1. no urn cue at all (QOLLOCK's #UrnTracker is the soul lead, not the urn);
//  2. the urn counts outside its window, misses UP at 10:00 / every 5:00, or keeps UP past 15 s;
//  3. a seek back keeps the old count;
//  4. a show window is ignored: OFF still shows a timer, ALWAYS hides it, or a window shows too early;
//  5. the defaults change DLF's always-on bridge, mid-boss and rift timers;
//  6. a held rejuvenator joined mid-buff shows a fresh 3:00 instead of the stock circle's time;
//  7. the holder's team colour is missing or on the wrong team.
function objectiveWorld(cues) {
  const harness = createPanoramaHarness({ now: 5000000 }); // a live clock: QOLLOCK's 5 s lookup backoff is long over
  const hud = buildHud(harness, { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE });
  const minimap = new MockPanel("Panel", harness.root, "hud_minimap");
  const capture = new MockPanel("Panel", minimap, "");
  capture.classes = ["map_button", "capture_point"];
  hud.topBar.FindChildTraverse("KothCashInMeter").visible = false;
  const midTimer = hud.topBar.FindChildTraverse("RejuvenatorTimer");
  const midLabel = hud.topBar.FindChildTraverse("MidbossTimerLabel");
  midLabel.__text = "";
  const context = createVmContext(harness, { globals: { $: Object.assign({}, harness.$, { GetContextPanel: () => hud.topBar }) } });
  runInVm(`${script("observer/observer_core.js")}\nthis.OBSERVER_PACK = OBSERVER_PACK;`, context, "observer_core.js");
  runInVm(script("qollock/ql_feat_rejuvtimers.js"), context, "ql_feat_rejuvtimers.js");
  runInVm(script("qollock/ql_feat_urntimer.js"), context, "ql_feat_urntimer.js");
  runInVm(stateRun, context, "dlf_state.js");
  const setCues = (value) => harness.root.SetAttributeString("dlf_match_state", JSON.stringify({ cues: value }));
  if (cues) setCues(cues);
  const features = context.QOL.featureRegistry;
  const cfg = context.OBSERVER_PACK.config;
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const at = (sec) => {
    hud.topBar.FindChildTraverse("GameTime").__text = mmss(sec);
    for (const name of ["rejuvTimers", "urnTimer"]) features[name].update(harness.root, cfg, harness.now);
    harness.scheduler.runFor(1000, 200);
  };
  const play = (from, to) => { for (let s = from; s <= to; s++) at(s); };
  const panel = (id) => harness.root.FindChildTraverse(id);
  const shown = (id) => { const p = panel(id); return !!p && p.visible !== false && !p.BHasClass("DLFCueHidden"); };
  const textIf = (box, label) => (shown(box) ? panel(label).__text : null);
  return { harness, hud, minimap, capture, midTimer, midLabel, setCues, play, panel,
    urn: () => textIf("UrnSpawnTimer", "UrnSpawnTimerLabel"), bridge: () => textIf("BuffHUD", "BuffTimeHUD"),
    mid: () => textIf("RejuvHUD", "RejuvTimeHUD"), rift: () => textIf("RiftTimer", "RiftTimerLabel") };
}

check("objective timers (as Observer HUD): urn spawn countdown in its window and UP for 15 s; each timer's show window", () => {
  // Defaults: the urn shows its last 30 s and UP; bridge, mid-boss and rift stay as before (always).
  const w = objectiveWorld();
  w.play(538, 540);
  assert.equal(w.urn(), null, "9:00 is outside the urn's 30 s window");
  assert.equal(w.bridge(), "1:00", "the bridge timer stays always on by default");
  assert.equal(w.mid(), "Spawn", "the mid-boss timer stays always on by default");
  w.play(541, 570);
  assert.equal(w.urn(), "0:30");
  w.play(571, 590);
  assert.equal(w.urn(), "0:10");
  w.play(591, 600);
  assert.equal(w.urn(), "UP", "10:00: the urn spawns");
  w.play(601, 614);
  assert.equal(w.urn(), "UP", "UP for 15 s");
  w.play(615, 616);
  assert.equal(w.urn(), null, "then hidden until the next window");
  w.play(869, 870);
  assert.equal(w.urn(), "0:30", "every 5:00 after 10:00");
  w.play(585, 585);
  assert.equal(w.urn(), "0:15", "a seek back counts from the new time");
  w.capture.AddClass("koth_warning");
  w.play(586, 587);
  assert.equal(w.rift(), "0:19", "the rift stays on by default");

  // Windows: bridge 30 s, urn 60 s, rift OFF, mid-boss 30 s.
  const v = objectiveWorld({ bridge: 30, urn: 60, rift: 0, mid: 30 });
  v.play(118, 120);
  assert.equal(v.bridge(), null, "3:00 before the bridge buffs: hidden with a 30 s window");
  assert.equal(v.mid(), null, "a mid-boss alive since the join: no respawn seen, hidden");
  v.play(121, 271);
  assert.equal(v.bridge(), "0:29", "inside the window");
  const marker = new MockPanel("Panel", v.minimap, "");
  marker.classes = ["powerup_spawn"];
  v.play(272, 303);
  assert.equal(v.bridge(), "UP", "UP while a bridge buff is on the minimap");
  marker.DeleteAsync();
  v.play(304, 340);
  assert.equal(v.bridge(), null, "taken: hidden until the next window");
  v.play(341, 540);
  assert.equal(v.urn(), "1:00", "the urn's 60 s window");
  v.midTimer.AddClass("midboss_cooldown");
  v.midLabel.__text = "6:54";
  v.play(1200, 1201);
  assert.equal(v.mid(), null, "a long respawn: hidden");
  v.midLabel.__text = "0:25";
  v.play(1202, 1202);
  assert.equal(v.mid(), "0:25", "its last 30 s show");
  v.midTimer.RemoveClass("midboss_cooldown");
  v.midLabel.__text = "";
  v.play(1203, 1204);
  assert.equal(v.mid(), "Spawn", "respawned: Spawn for 30 s");
  v.play(1205, 1240);
  assert.equal(v.mid(), null, "then hidden while it lives");
  v.capture.AddClass("koth_warning");
  v.play(1241, 1243);
  assert.equal(v.rift(), null, "rift OFF never shows");
  // OFF and ALWAYS.
  v.setCues({ bridge: 0, urn: -1, rift: -1, mid: 0 });
  v.play(1244, 1245);
  assert.equal(v.bridge(), null, "bridge OFF");
  assert.equal(v.mid(), null, "mid-boss OFF");
  assert.equal(v.urn(), "4:15", "urn ALWAYS counts to the next spawn (25:00)");
  assert.match(String(v.rift()), /^0:\d\d$/, "rift ALWAYS shows its warning count again");
});

check("held rejuvenator (as Observer HUD): a seen pickup counts 3:00; a join mid-buff reads the stock circle; holder's colour", () => {
  const held = (w) => (w.panel("RejuvBuff").BHasClass("pop-out") ? w.panel("RejuvTimeBuff").__text : null);
  const holder = (w) => ["DLFHeldAmber", "DLFHeldSapphire"].filter((cls) => w.panel("RejuvBuff").BHasClass(cls)).join("");
  // A pickup seen happen: 3:00 from that second, Sapphire's colour.
  const w = objectiveWorld();
  const border = w.midTimer.FindChildTraverse("StatusEffectsBorder");
  w.play(600, 602);
  w.midTimer.AddClass("has_rejuv");
  w.panel("RejuvenatorEnemy").AddClass("RejuvCount_1");
  border.style.clip = "radial(50% 50%, 0deg, -360deg)";
  w.play(603, 604);
  assert.equal(held(w), "2:59", "3:00 from the pickup");
  assert.equal(holder(w), "DLFHeldSapphire");
  w.play(605, 663);
  assert.equal(held(w), "2:00");
  w.midTimer.RemoveClass("has_rejuv");
  w.panel("RejuvenatorEnemy").RemoveClass("RejuvCount_1");
  w.play(664, 667);
  assert.equal(held(w), null, "gone with the charge");

  // Joined mid-buff: HELD until two samples 2 s apart give the stock circle's rate (2 deg/s), then its time.
  const j = objectiveWorld();
  const ring = j.midTimer.FindChildTraverse("StatusEffectsBorder");
  j.midTimer.AddClass("has_rejuv");
  j.panel("RejuvenatorFriendly").AddClass("RejuvCount_1");
  const angle = (t) => -(240 - 2 * (t - 1000));
  const playRing = (from, to) => { for (let t = from; t <= to; t++) { ring.style.clip = `radial(50% 50%, 0deg, ${angle(t)}deg)`; j.play(t, t); } };
  playRing(1000, 1000);
  assert.equal(held(j), "HELD", "no time before the circle's rate is known (not a fresh 3:00)");
  assert.equal(holder(j), "DLFHeldAmber");
  playRing(1001, 1002);
  assert.equal(held(j), "1:58", "236 of 360 deg left of 3:00");
  playRing(1003, 1012);
  assert.equal(held(j), "1:48", "then it counts down");
  // A circle that does not move at the buff's rate (another status on the panel) is never read.
  const k = objectiveWorld();
  const still = k.midTimer.FindChildTraverse("StatusEffectsBorder");
  k.midTimer.AddClass("has_rejuv");
  k.panel("RejuvenatorEnemy").AddClass("RejuvCount_1");
  still.style.clip = "radial(50% 50%, 0deg, -100deg)";
  k.play(2000, 2006);
  assert.equal(held(k), "HELD", "a still circle gives no time");
});

// The stock top bar (client 6819, client.dll rva 0x1c74d40) sets .has_rejuv while either team holds a
// rejuvenator charge, and then drops .midboss_cooldown and stops writing {s:midboss_timer}: the label
// keeps its last text. The respawn itself keeps counting (m_tNextMidBossSpawnTime is set at the kill), so
// once the buff ends the label is back with the time left. User 2026-10-25 (screenshot, 24:19 with the
// buff at 2:53): the top timer sat on 6:00. Ways this can fail, each covered below:
//  1. the timer reads "Spawn" during the buff (the missing class taken for an alive mid-boss);
//  2. it freezes on the respawn length QOLLOCK wrote at the kill (kill and pickup in the same second);
//  3. it freezes on the stock label's last text;
//  4. joined mid-buff with no kill seen, it shows a made-up time instead of nothing.
check("mid-boss respawn keeps counting while the rejuvenator is held", () => {
  const engine = (w) => {
    const s = { next: 0, held: false };
    const mmss = (v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
    // One game second as the stock top bar paints it, then QOLLOCK's sample.
    s.at = (t) => {
      const cooling = !s.held && s.next > t;
      w.midTimer.SetHasClass("has_rejuv", s.held);
      w.midTimer.SetHasClass("midboss_cooldown", cooling);
      if (cooling) w.midLabel.__text = mmss(s.next - t);
      w.play(t, t);
    };
    s.run = (from, to) => { for (let t = from; t <= to; t++) s.at(t); };
    s.hold = (on) => {
      s.held = on;
      w.panel("RejuvenatorEnemy").SetHasClass("RejuvCount_1", on);
    };
    return s;
  };
  // Killed at 24:00 (second kill, 6:00 respawn), the stock countdown seen, picked up at 24:07.
  const w = objectiveWorld();
  const e = engine(w);
  e.run(1430, 1439);
  assert.equal(w.mid(), "Spawn");
  e.next = 1440 + 360;
  e.run(1440, 1446);
  assert.equal(w.mid(), "5:54");
  e.hold(true);
  e.run(1447, 1459);
  assert.equal(w.mid(), "5:41", "counts on under the held buff (not Spawn, not the frozen 5:54)");
  e.run(1460, 1626);
  assert.equal(w.mid(), "2:54");
  e.hold(false);
  e.run(1627, 1630);
  assert.equal(w.mid(), "2:50", "the stock label after the buff agrees");

  // Killed and picked up in the same second: the stock countdown never showed. The kill comes from the
  // minimap mid-boss marker; the first kill's respawn is 7:00.
  const b = objectiveWorld();
  const boss = new MockPanel("Panel", b.minimap, "");
  boss.classes = ["map_button", "mid_boss", "midboss_spawned"];
  const be = engine(b);
  be.run(1190, 1199);
  assert.equal(b.mid(), "Spawn");
  boss.RemoveClass("midboss_spawned");
  be.next = 1200 + 420;
  be.hold(true);
  be.run(1200, 1210);
  const first = b.mid();
  assert.match(String(first), /^6:5\d$/, `a 7:00 respawn from the kill (${first})`);
  be.run(1211, 1220);
  const later = b.mid();
  const sec = (v) => Number(v.split(":")[0]) * 60 + Number(v.split(":")[1]);
  assert.equal(sec(first) - sec(later), 10, `still counting (${first} -> ${later}), not stuck`);

  // Joined mid-buff: no kill seen and no stock time. No guess: the mid-boss timer hides until the stock
  // countdown returns.
  const j = objectiveWorld();
  const je = engine(j);
  je.next = 1700;
  je.hold(true);
  je.run(1500, 1505);
  assert.equal(j.mid(), null, "no respawn time known: hidden");
  je.hold(false);
  je.run(1506, 1507);
  assert.equal(j.mid(), "3:13");
});

// Stock spectator CSS moves the whole top bar 8px down (.spec_mode CitadelHudTopBar), which left a
// strip of the game world above the banner (live 2026-10-20). The banner art starts at the top edge.
check("spectator top bar has no gap above the banner", () => {
  const stock = read("panorama/styles/base/citadel_hud_top_bar.css");
  assert.match(stock, /\.spec_mode CitadelHudTopBar\s*\{\s*margin-top: 8px;\s*\}/, "stock still offsets the spectator top bar");
  const rule = /CitadelHudTopBar,\s*\.spec_mode CitadelHudTopBar\s*\{([^}]*)\}/.exec(bannerCss);
  assert.ok(rule, "dlf_banner.css styles the top bar in both modes");
  assert.match(rule[1], /margin-top: 0px;/);
  assert.match(rule[1], /padding-top: 68px;/);
});

// ---------------------------------------------------------------- purchase notices (dlf_buys.js)
// A Label text as the engine keeps it: "{s:key}" stays bound to the nearest ancestor's dialog variable.
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

// Ways this can fail, each covered below:
//  1. a renamed or new item has no icon (the name table lags the game: Spirit Shredder, live 2026-10-20);
//  2. a notice sits on the DLF ult counter (125-167px) or on the shown status grid (from 167px, 39 px rows);
//  3. neighbouring cards' notices overlap (by screen x, whatever order they were bought in);
//  4. a notice keeps an old position after the debuff column under it grows;
//  5. joining mid-game floods the cards with the list's history; a seek or refill shows old rows;
//  6. a purchase lands on the wrong card: other team, two cards with that hero, no hero id;
//  7. the stock shop layout is overridden again, or the list is walked every tick.
check("purchase notices: on the buyer's card by team and hero, under the ult counter and debuffs, neighbours by x, no history", () => {
  assert.ok(!fs.existsSync(path.join(PANORAMA, "layout/citadel_hud_hero_shop.xml")), "the stock shop layout is not overridden");
  assert.ok(!fs.existsSync(path.join(PANORAMA, "scripts/qollock/ql_feat_recentpurchases.js")), "the QOLLOCK copy is gone");
  const harness = createPanoramaHarness();
  const hud = buildHud(harness, { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE });
  const scale = 900 / 1080;
  const clock = hud.topBar.FindChildTraverse("GameTime");
  clock.__text = "1:00";
  const cards = [...hud.teams.TeamFriendly, ...hud.teams.TeamEnemy];
  cards.forEach((card, i) => {
    card.FindChildTraverse("HeroBadge").heroid = i + 1;
    card.FindChildrenWithClassTraverse("HeroName")[0].__text = `Hero${i}`;
    // Sapphire's cards flow from the right (stock .connectedToHeroTesting .friend flows left): child
    // order is not screen order.
    card.actualxoffset = i < 6 ? 330 + i * 88 : 1062 + (11 - i) * 88;
    card.actualuiscale_x = scale;
    card.actuallayoutwidth = 88 * scale;
    card.FindChildTraverse("DLFDebuffs").actualuiscale_y = scale;
    card.FindChildTraverse("DLFDebuffs").actuallayoutheight = 0; // no icons shown
  });
  const shop = new MockPanel("Panel", harness.root, "RecentPurchasesContainer");
  // The stock kill feed as it is most of the time: there, empty (the idle budget counts its watch).
  new MockPanel("Panel", harness.root, "EventFeed");
  const buy = (card, item, time, { team = card < 6 ? "isTeam1Purchase" : "isTeam2Purchase", heroId = card + 1, name = `Hero${card}` } = {}) => {
    const row = new MockPanel("Panel", shop, "");
    row.classes = ["recentPurchase", "isWeaponPurchase", "isTier2Purchase", team];
    row.__dialog = { recent_hero_name: name };
    for (const [cls, text] of [["recentTimePurchased", time], ["recentModPurchaseName", item]]) {
      const label = new MockPanel("Label", row, "");
      label.classes = [cls];
      label.__text = text;
    }
    new MockPanel("Image", row, "RecentPurchaseHeroImage").heroid = heroId;
    return row;
  };
  buy(0, "Extra Charge", "0:40");
  buy(7, "Headshot Booster", "0:50");
  const createPanel = harness.$.CreatePanel;
  const context = createVmContext(harness, { globals: { $: Object.assign({}, harness.$, {
    GetContextPanel: () => hud.topBar,
    CreatePanel: (type, parent, id, props) => {
      const panel = createPanel(type, parent, id, props);
      if (type === "Label" && props && typeof props.text === "string") bindText(panel, props.text);
      return panel;
    } }) } });
  runInVm(stateRun, context, "dlf_state.js");
  runInVm(script("qollock/ql_recent_purchases_data.js"), context, "ql_recent_purchases_data.js");
  runInVm(script("dlf/dlf_buys.js"), context, "dlf_buys.js");
  const icons = new vm.Script(`${script("qollock/ql_recent_purchases_data.js")}\nMOD_ICONS`).runInNewContext({});
  const hostOf = (i) => cards[i].Children().find((child) => child.BHasClass("QuickPurchasesPanel")) || null;
  const notices = (i) => (hostOf(i) ? hostOf(i).Children().filter((child) => !child.BHasClass("DLFBuyFading")) : []);
  const names = (i) => notices(i).map((notice) => notice.FindChildrenWithClassTraverse("DLFBuyName")[0].__text);
  // The engine lays a notice stack out after it is created: the host is 209 HUD px wide (fixed, as
  // Observer HUD's column), each notice 120 HUD px wide and 32 HUD px tall.
  const run = (ms) => {
    for (let t = 0; t < ms; t += 100) {
      cards.forEach((card, i) => {
        const host = hostOf(i);
        if (!host) return;
        host.actuallayoutwidth = 209 * scale;
        host.contentheight = host.GetChildCount() * 32 * scale;
        host.actualuiscale_y = scale;
        for (const notice of host.Children()) notice.actuallayoutwidth = 120 * scale;
      });
      harness.scheduler.runFor(100, 200);
    }
  };
  const top = (i) => Number(/^(-?[\d.]+)px$/.exec(hostOf(i).style.marginTop)[1]);
  const iconOf = (i) => notices(i)[0].FindChildrenWithClassTraverse("DLFBuyIcon")[0];

  run(2000);
  assert.deepEqual(cards.map((_, i) => notices(i).length), Array(12).fill(0), "rows already in the list at first sight never show");
  // Idle: no new row, nothing shown.
  for (const key of Object.keys(harness.operationCounts)) harness.operationCounts[key] = 0;
  harness.scheduler.runFor(10000, 200);
  const idle = Object.entries(harness.operationCounts).filter(([key]) => !["traversal", "findTraversals", "classTraversalNodes"].includes(key))
    .reduce((sum, [, value]) => sum + value, 0) / 10;
  results.budgets = Object.assign(results.budgets || {}, { purchasesIdle: idle });
  console.log(`   purchase notices idle ${idle.toFixed(1)}/s`);
  assert.ok(idle <= 6, `idle purchase notices stay cheap: ${idle}/s`);

  buy(6, "Spirit Shredder", "1:00");
  run(400);
  buy(7, "Lucky Shot", "1:01");
  run(400);
  assert.equal(iconOf(7).style.backgroundImage, icons["Lucky Shot"]);
  assert.match(iconOf(6).style.backgroundImage, /items\/weapon\/spirit_shredder_bullets_psd\.vtex/);
  for (const name of ["Armor Piercer", "Spirit Shredder", "Lucky Shot"]) assert.ok(icons[name], `${name} in MOD_ICONS`);
  // Observer HUD's notice (user 2026-10-24, "add wobble recent purchase from the observer hud"): the stock
  // shop card's paper under a frame drawn as images, in a layer that wobbles like the stock chat bubble;
  // the icon and name stay still. A CSS border on the wobbling layer stair-stepped live (OH, 2026-10-23).
  const notice = notices(6)[0];
  assert.ok(notice.BHasClass("DLFBuy") && notice.BHasClass("DLFBuyT2") && notice.BHasClass("DLFBuyWeapon"), "tier and slot classes");
  assert.ok(!notice.BHasClass("quickPurchase") && !notice.FindChildrenWithClassTraverse("quickItemInfo").length, "no QOLLOCK notice classes");
  const frame = notice.Children()[0];
  const frameClass = (panel) => ["DLFBuyPaperBox", "DLFBuyEdgeRow", "DLFBuyEdgeL", "DLFBuyEdgeR"].find((cls) => panel.BHasClass(cls));
  assert.ok(frame.BHasClass("DLFBuyBg"), "the notice's first child is its wobbling layer");
  assert.deepEqual(frame.Children().map(frameClass), ["DLFBuyPaperBox", "DLFBuyEdgeRow", "DLFBuyEdgeL", "DLFBuyEdgeR"], "paper under the frame, caps last");
  assert.deepEqual(frame.Children()[0].Children().map((layer) => ["DLFBuyBacker", "DLFBuyWear", "DLFBuyPaper"].find((cls) => layer.BHasClass(cls))),
    ["DLFBuyBacker", "DLFBuyWear", "DLFBuyPaper"], "the shop card paper inside its box");
  assert.ok(frame.Children()[1].Children()[0].BHasClass("DLFBuyEdgeM"));
  assert.deepEqual(notice.Children().slice(1).map((child) => ["DLFBuyIcon", "DLFBuyName"].find((cls) => child.BHasClass(cls))), ["DLFBuyIcon", "DLFBuyName"],
    "icon and name outside the wobbling layer");
  const buySheet = read("panorama/styles/dlf/dlf_card.css");
  for (const cls of ["DLFBuyBg", "DLFBuyPaperBox", "DLFBuyBacker", "DLFBuyWear", "DLFBuyPaper", "DLFBuyEdgeRow", "DLFBuyEdgeL", "DLFBuyEdgeM", "DLFBuyEdgeR", "DLFBuyIcon", "DLFBuyName", "DLFBuyFading"]) {
    assert.ok(buySheet.includes(`.${cls}`), `dlf_card.css styles .${cls}`);
  }
  assert.match(buySheet, /\.DLFBuyBg\s*\{[^}]*animation-name:\s*DLFBuyGroove;/, "the layer wobbles like the stock chat bubble");
  assert.match(buySheet, /@keyframes\s+'DLFBuyGroove'/);
  assert.match(buySheet, /\.DLFBuy\.DLFBuyFading\s*\{[^}]*animation-duration:\s*0\.4s;/, "the fade matches FADE_SEC");
  // Every frame image the sheet uses ships (PNG + .vtex pointing at itself) and is a required pak asset.
  const frameImages = [...buySheet.matchAll(/s2r:\/\/panorama\/images\/(dlf\/buy_frame\w+)\.vtex/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(frameImages)].sort(), [2, 3].flatMap((b) => ["l", "m", "r"].map((p) => `dlf/buy_frame${b}_${p}`)).sort());
  const buildScript = fs.readFileSync(path.join(REPO, "build_dlf.ps1"), "utf8");
  for (const image of new Set(frameImages)) {
    assert.ok(fs.existsSync(path.join(PANORAMA, "images", `${image}.png`)), `${image}.png exists`);
    assert.ok(read(`panorama/images/${image}.vtex`).includes(`"panorama/images/${image}.png"`), `${image}.vtex points at its PNG`);
    assert.ok(buildScript.includes(`'${image}'`), `build_dlf.ps1 requires ${image}`);
  }
  // Card 7 sits left of card 6 (Sapphire flows from the right).
  assert.equal(top(7), 169, "the left notice starts 2 px under the ult counter (as Observer HUD)");
  assert.ok(top(6) >= 169 + 32, `the right neighbour moves below it, though it was bought first (${top(6)}px)`);

  // Two rows of statuses on card 9 (78 HUD px): its notice goes right under them (2 px, as Observer
  // HUD), and follows when they change.
  cards[9].FindChildTraverse("DLFDebuffs").actuallayoutheight = 78 * scale;
  buy(9, "Lucky Shot", "1:02");
  run(400);
  assert.equal(top(9), 169 + 78, `right under the status grid (${top(9)}px)`);
  cards[9].FindChildTraverse("DLFDebuffs").actuallayoutheight = 0;
  run(600);
  assert.equal(top(9), 169, `back up when the statuses go (${top(9)}px)`);

  // Wrong team, two cards with the hero, a seek back: no notice. No hero id: matched by hero name.
  clock.__text = "5:00";
  buy(8, "Lucky Shot", "4:58", { team: "isTeam1Purchase" });
  cards[3].FindChildTraverse("HeroBadge").heroid = 3; // cards 2 and 3 both hero 3
  buy(2, "Lucky Shot", "4:58");
  buy(1, "Lucky Shot", "1:30"); // 3:30 behind the clock: a refill after a seek
  buy(4, "Close Quarters", "4:58", { heroId: 0, name: "Hero4" });
  run(400);
  assert.deepEqual([8, 2, 3, 1].map((i) => notices(i).length), [0, 0, 0, 0]);
  assert.deepEqual(names(4), ["Close Quarters"], "no hero id: matched by the bound hero name");

  // Three at most, newest last (the panel flows up, so it draws on top); each goes after 5 s.
  for (const item of ["Extra Charge", "Rapid Rounds", "Lucky Shot", "Spirit Shredder"]) buy(0, item, "4:59");
  run(400);
  assert.deepEqual(names(0), ["Rapid Rounds", "Lucky Shot", "Spirit Shredder"]);
  run(6000);
  assert.equal(cards.reduce((sum, _, i) => sum + notices(i).length, 0), 0, "every notice is gone after 5 s and the fade");

  // Every stack is centred on its own card, the innermost too (user 2026-10-24, screenshot
  // 20261024193435_1.jpg: "resolve the recent purchase at fr the first player not on the middle"; Infernus's
  // Phantom Strike sat aligned to his card's inner edge, reaching over Venator's card). The inner-edge
  // alignment added in the 2026-10-24 review is gone: no class, no CSS rule.
  clock.__text = "5:05";
  for (const card of [5, 11, 3]) buy(card, "Spirit Shredder", "5:04");
  run(400);
  const aligned = (i) => ["DLFBuyHugRight", "DLFBuyHugLeft"].filter((cls) => hostOf(i).BHasClass(cls));
  assert.deepEqual([aligned(5), aligned(11), aligned(3)], [[], [], []], "inner cards' stacks are centred like the others");
  const dlfCardCss = read("panorama/styles/dlf/dlf_card.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(dlfCardCss, /DLFBuyHug/, "no inner-edge alignment rules");
  // Live 2026-10-24 (user screenshots 20261024192243/192302, "getting render half"): in QOLLOCK's
  // fit-children host the notice kept a stale, narrower width, so the frame layer (100 % of it) ended
  // inside the name ("Express Sh|ot") or the paper stopped short of the right cap. As Observer HUD's
  // column (where the same notice renders whole live), the host is a fixed 209 px; the notices centre
  // inside it, and stack widths come from the notices, not the host.
  assert.match(dlfCardCss, /\.QuickPurchasesPanel\.DLFBuyHost\s*\{[^}]*width:\s*209px;/, "a fixed-width host");
  assert.ok(hostOf(3).BHasClass("DLFBuyHost"));
  run(6000);

  // A card or debuff column that was never laid out reads Infinity (the soul graph's live failure,
  // 2026-10-24); a notice there sits at its natural top and writes no Infinity/NaN margin.
  cards[5].GetPositionWithinWindow = () => ({ x: Infinity, y: Infinity });
  cards[4].GetPositionWithinWindow = () => ({ x: Infinity, y: Infinity });
  cards[5].FindChildTraverse("DLFDebuffs").actuallayoutheight = Infinity;
  clock.__text = "5:10";
  buy(5, "Lucky Shot", "5:09");
  buy(4, "Lucky Shot", "5:09");
  run(400);
  assert.deepEqual([top(5), top(4)], [169, 169], "unlaid cards: natural top, no Infinity");
});

// ---------------------------------------------------------------- kill feed placement (dlf_buys.js)
// Ways this can fail: the stock #EventFeed (margin-top 200, top left) runs over the leftmost cards' status
// grid, ult counter or purchase notices (user screenshot 2026-10-23, Observer HUD, same stock panel); it
// bounces while a status blinks; a column it does not reach moves it; an unlaid panel writes an Infinity
// margin; it is moved with nothing in the way or while it shows no row; an inline null clear brings it
// back (stays hidden live); a reloaded script takes a moved feed for the stock place.
check("kill feed: goes 6 px under the status grid, ult counter and notices it reaches, holds 2 s, skips unlaid panels", () => {
  const harness = createPanoramaHarness();
  const hud = buildHud(harness, { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE });
  const scale = 900 / 1080;
  const cards = [...hud.teams.TeamFriendly, ...hud.teams.TeamEnemy];
  // The mock's GetPositionWithinWindow sums layout offsets (HUD px) and scales by the panel's own uiscale.
  const scaled = (panel) => { panel.actualuiscale_x = scale; panel.actualuiscale_y = scale; return panel; };
  cards.forEach((card, i) => {
    card.FindChildTraverse("HeroBadge").heroid = i + 1;
    card.FindChildrenWithClassTraverse("HeroName")[0].__text = `Hero${i}`;
    scaled(card);
    card.actualxoffset = i < 6 ? 330 + i * 88 : 1062 + (11 - i) * 88;
    card.actualyoffset = 68;
    card.actuallayoutwidth = 88 * scale;
    const column = scaled(card.FindChildTraverse("DLFDebuffs"));
    column.actualyoffset = 167;
    column.actuallayoutheight = 0;
  });
  hud.topBar.FindChildTraverse("GameTime").__text = "1:00";
  const column = (i) => cards[i].FindChildTraverse("DLFDebuffs");
  const statuses = (i, rows) => { column(i).actuallayoutheight = rows * 39 * scale; };
  const shop = new MockPanel("Panel", harness.root, "RecentPurchasesContainer");
  const buy = (card, item, time) => {
    const row = new MockPanel("Panel", shop, "");
    row.classes = ["recentPurchase", card < 6 ? "isTeam1Purchase" : "isTeam2Purchase"];
    row.__dialog = { recent_hero_name: `Hero${card}` };
    for (const [cls, text] of [["recentTimePurchased", time], ["recentModPurchaseName", item]]) {
      const label = new MockPanel("Label", row, "");
      label.classes = [cls];
      label.__text = text;
    }
    new MockPanel("Image", row, "RecentPurchaseHeroImage").heroid = card + 1;
  };
  // The stock feed: margin-top 200 HUD px, one 360 HUD px kill row (its right edge 300 screen px: over the
  // first card at 275, short of the second at 348).
  const feed = scaled(new MockPanel("Panel", harness.root, "EventFeed"));
  feed.actualxoffset = 0;
  feed.actuallayoutwidth = 500 * scale;
  const killRow = (width) => {
    const row = new MockPanel("Panel", feed, "");
    row.actuallayoutwidth = width * scale;
    return row;
  };
  let row = killRow(360);
  const createPanel = harness.$.CreatePanel;
  const context = createVmContext(harness, { globals: { $: Object.assign({}, harness.$, {
    GetContextPanel: () => hud.topBar,
    CreatePanel: (type, parent, id, props) => {
      const panel = createPanel(type, parent, id, props);
      if (type === "Label" && props && typeof props.text === "string") bindText(panel, props.text);
      return panel;
    } }) } });
  runInVm(stateRun, context, "dlf_state.js");
  runInVm(script("qollock/ql_recent_purchases_data.js"), context, "ql_recent_purchases_data.js");
  runInVm(script("dlf/dlf_buys.js"), context, "dlf_buys.js");
  const hostOf = (i) => cards[i].Children().find((child) => child.BHasClass("QuickPurchasesPanel")) || null;
  // The engine's layout: the feed's top follows its margin, a notice stack sits at its margin under the
  // card: the host 209 HUD px wide centred on the 88 px card, each notice 120 wide (centred in it), 32 tall.
  const run = (ms) => {
    for (let t = 0; t < ms; t += 100) {
      feed.actualyoffset = parseFloat(feed.style.marginTop || "200px");
      cards.forEach((card, i) => {
        const host = hostOf(i);
        if (!host) return;
        scaled(host);
        host.actuallayoutwidth = 209 * scale;
        host.actualxoffset = (88 - 209) / 2; // centred on the 88 px card (offsets are HUD px)
        host.actuallayoutheight = host.GetChildCount() * 32 * scale;
        host.contentheight = host.actuallayoutheight;
        host.actualyoffset = parseFloat(host.style.marginTop || "0px");
        host.Children().forEach((notice, n) => Object.assign(scaled(notice), { actualxoffset: (209 - 120) / 2,
          actualyoffset: n * 32, actuallayoutwidth: 120 * scale, actuallayoutheight: 32 * scale }));
      });
      harness.scheduler.runFor(100, 200);
    }
  };
  const margin = () => feed.style.marginTop || "200px";
  const feedWrites = () => (feed.__styleWrites || []).filter((write) => write.property === "marginTop");
  const ult = (i, on) => { cards[i].FindChildTraverse("DLFUltCooldown").classes = on ? ["DLFUltCooldown", "DLFCounting"] : ["DLFUltCooldown"]; };

  run(2000);
  assert.equal(margin(), "200px", "nothing in the way: the stock place");
  assert.equal(feedWrites().length, 0, "nothing is written while nothing is in the way");

  // Two status rows on the leftmost card: the feed goes 6 px under them.
  statuses(0, 2);
  run(1000);
  assert.equal(margin(), `${68 + 167 + 78 + 6}px`, "6 px under the status grid");
  // The second card is right of the feed's row: its taller column does not count...
  statuses(1, 3);
  run(1000);
  assert.equal(margin(), `${68 + 167 + 78 + 6}px`, "a column right of the feed's row does not count");
  // ...until a wider row reaches it.
  const wide = killRow(450);
  run(1000);
  assert.equal(margin(), `${68 + 167 + 117 + 6}px`, "the widest row decides the reach");
  wide.DeleteAsync();
  statuses(1, 0);
  run(3000);
  // A third row moves it down at once; a status that goes only lets it up after 2 s.
  statuses(0, 3);
  run(600);
  assert.equal(margin(), `${68 + 167 + 117 + 6}px`, "down at once");
  statuses(0, 0);
  run(1000);
  assert.equal(margin(), `${68 + 167 + 117 + 6}px`, "held for 2 s so a blinking status does not bounce it");
  run(2000);
  assert.equal(margin(), "200px", "back to the stock place as px, never a null clear");
  assert.ok(feedWrites().every((write) => /^\d+px$/.test(String(write.value))), "every write is whole px");

  // Purchase notices on the first card: the feed goes under the stack.
  buy(0, "Extra Charge", "1:00");
  run(1000);
  assert.equal(margin(), `${68 + 169 + 32 + 6}px`, "6 px under the notice stack");
  run(6000);
  assert.equal(margin(), "200px", "and back after the notice fades");
  // The ult counter of a reached card (bottom 167 px under the card's top); not of an unreached one.
  ult(1, true);
  run(1000);
  assert.equal(margin(), "200px", "the second card's counter is out of reach");
  ult(1, false);
  ult(0, true);
  run(1000);
  assert.equal(margin(), `${68 + 167 + 6}px`, "the ult counter of a reached card counts");
  ult(0, false);
  run(3000);
  assert.equal(margin(), "200px");

  // No kill row: nothing to keep clear, so it stays (an empty feed is not moved).
  row.DeleteAsync();
  statuses(0, 2);
  const before = feedWrites().length;
  run(3000);
  assert.equal(feedWrites().length, before, "an empty feed is never moved");
  row = killRow(360);
  run(1000);
  assert.equal(margin(), `${68 + 167 + 78 + 6}px`, "a kill row arriving over a status grid moves it within a second");

  // A reload with the feed moved: the new script takes the inline margin as where it is, not the stock place.
  runInVm(script("dlf/dlf_buys.js"), context, "dlf_buys.js (reload)");
  run(1000);
  assert.equal(margin(), `${68 + 167 + 78 + 6}px`, "the reloaded script keeps it under the grid");
  statuses(0, 0);
  run(3000);
  assert.equal(margin(), "200px", "and brings it back once the grid empties");
  statuses(0, 2);
  run(1000);
  assert.equal(margin(), `${68 + 167 + 78 + 6}px`, "its stock place, read after the reload, is right");
  statuses(0, 0);
  run(3000);

  // Never laid out: Infinity positions and sizes are skipped, nothing Infinity is written.
  statuses(0, 2);
  column(0).GetPositionWithinWindow = () => ({ x: Infinity, y: Infinity });
  run(1500);
  assert.equal(margin(), "200px", "an unlaid column is skipped");
  column(0).actuallayoutheight = Infinity;
  run(1500);
  assert.equal(margin(), "200px", "an Infinity height is skipped");
  assert.ok(feedWrites().every((write) => !/Infinity|NaN/.test(String(write.value))), "no Infinity or NaN written");
});

// ---------------------------------------------------------------- pickup rings (composed HPv2 runtime)
// Ways this can fail, each covered below:
//  1. composition drops/duplicates an adaptation, or an HPv2 message name survives;
//  2. top-bar or world context throws at boot (missing factory, config hooks, listener);
//  3. the world -> sibling relay -> top bar path breaks (relay layout path, attribute, magic);
//  4. a buff lands on the wrong card, or on no card, for spectated / non-local players;
//  5. native world pickup icons get restyled (DLF must only read them);
//  6. the world ultimate overlay runs (DLF ships it off);
//  7. HPv2 pak02 traffic (snapshots, config message, root config attribute) changes DLF rings;
//  8. rings stay after the buff ends, or show before 5:00 on a normal map;
//  9. the ring countdown does not follow the native radial;
// 10. layout reload stacks world listeners.

const PICKUP = compose();
const PICKUP_RUN = RUNTIME ? Object.fromEntries(Object.keys(PICKUP).map((rel) => [rel, script(rel.replace(/^scripts\//, ""))])) : PICKUP;
const overlayLayout = parseLayout(read("panorama/layout/unit_status_overlay_v2.xml"));
const relayLayoutText = read("panorama/layout/dlf/pickup_event_relay.xml");
const PICKUP_CLASSES = ["gunpower_pickup", "movement_pickup", "casting_pickup", "survival_pickup"];

// Panel APIs the pickup runtime uses that the shared mock lacks.
MockPanel.prototype.MoveChildAfter = function (child, after) {
  const from = this.children.indexOf(child);
  if (from < 0 || this.children.indexOf(after) < 0) return;
  this.children.splice(from, 1);
  this.children.splice(this.children.indexOf(after) + 1, 0, child);
};
MockPanel.prototype.ClearPanelEvent = function (name) { delete this.events[name]; };

// A Label text as the engine keeps it (Observer HUD's validator): "{s:key}" or "{i:key}" stays bound to the
// nearest ancestor's dialog variable (__dialog) and follows later changes of it; any other text is literal.
// Writing the label's text rebinds or unbinds it the same way.
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

function pickupWorld({ clock = "12:00", topBarClasses = {} } = {}) {
  const harness = createPanoramaHarness({ now: 5000000 });
  const bus = [];
  const sent = [];
  let nextId = 1;
  const dollar = (panel) => ({
    GetContextPanel: () => panel,
    CreatePanel: (type, parent, id, props = {}) => {
      const created = new MockPanel(type, parent, id);
      if (props.text !== undefined) bindText(created, props.text);
      return created;
    },
    Schedule: (delay, fn) => harness.scheduler.schedule(delay, fn),
    RegisterForUnhandledEvent: (name, fn) => { bus.push({ id: nextId, name, fn, panel }); return nextId++; },
    UnregisterForUnhandledEvent: (name, id) => {
      const index = bus.findIndex((entry) => entry.id === id);
      if (index >= 0) bus.splice(index, 1);
    },
    DispatchEvent: (name, ...args) => {
      if (name === "ClientUI_FireOutput") {
        sent.push(String(args[0]));
        for (const entry of bus.slice()) if (entry.name === name) entry.fn(args[0]);
      } else if (name === "Activated" && args[0] && args[0].events.onactivate) {
        args[0].events.onactivate();
      }
    },
    Msg: (message) => harness.logs.push(String(message))
  });
  const runIn = (panel, files) => {
    const context = createVmContext(harness, { globals: { $: dollar(panel) } });
    for (const [name, source] of files) runInVm(source, context, name);
    return context;
  };
  // Sibling relays: BLoadLayout runs the relay layout's own script context.
  MockPanel.prototype.BLoadLayout = function (file) {
    if (file === "file://{resources}/layout/dlf/pickup_event_relay.xml") {
      runIn(this, [["pickup_bridge.js", PICKUP_RUN["scripts/dlf/pickup_bridge.js"]]]);
      return true;
    }
    if (file === "file://{resources}/layout/dlf/debuff_event_relay.xml") {
      runIn(this, [["dlf_debuff_relay.js", script("dlf/dlf_debuff_relay.js")]]);
      return true;
    }
    return false;
  };

  const hud = buildHud(harness, { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE });
  hud.topBar.parent.classes = ["isDefaultMap", "TeamSpectator", "spec_mode"];
  hud.topBar.FindChildTraverse("GameTime").__text = clock;
  hud.topBar.FindChildTraverse("TeamFriendly").classes = ["team1"];
  hud.topBar.FindChildTraverse("TeamEnemy").classes = ["team2"];
  for (const [team, index, cls] of topBarClasses.cards || []) hud.teams[team][index].AddClass(cls);
  runIn(hud.topBar, [["pickup_config.js", PICKUP_RUN["scripts/dlf/pickup_config.js"]],
    ["pickup_timers.js", PICKUP_RUN["scripts/dlf/pickup_timers.js"]]]);
  // Same top-bar layout, as citadel_hud_top_bar.xml loads them (banner left out).
  const bootTopDebuffs = () => runIn(hud.topBar, [["dlf_state.js", stateRun],
    ["dlf_match.js", matchScript(JSON.parse(read("match.json")))],
    ["dlf_debuff_icons.js", script("dlf/dlf_debuff_icons.js")],
    ["dlf_debuffs.js", script("dlf/dlf_debuffs.js")],
    ["dlf_ult_cooldown.js", script("dlf/dlf_ult_cooldown.js")]]);
  bootTopDebuffs();

  const worldRoot = new MockPanel("Panel", harness.root, "WorldHealthbars");
  const units = {};
  const worldFiles = [["pickup_config.js", PICKUP_RUN["scripts/dlf/pickup_config.js"]],
    ["pickup_host.js", script("dlf/pickup_host.js")],
    ["pickup_bridge.js", PICKUP_RUN["scripts/dlf/pickup_bridge.js"]],
    ["pickup_timers.js", PICKUP_RUN["scripts/dlf/pickup_timers.js"]],
    ["dlf_status_css.js", script("dlf/dlf_status_css.js")],
    ["dlf_debuff_world.js", script("dlf/dlf_debuff_world.js")]];
  [...AMBER, ...SAPPHIRE].forEach((name, index) => {
    const unit = new MockPanel("Panel", worldRoot, `unit_${index}`);
    unit.classes = ["CLASS_PLAYER"];
    // The overlay layout's root tag styles the engine's ClientUIDialogPanel context.
    const dialog = new MockPanel("ClientUIDialogPanel", unit, "");
    dialog.classes = (overlayLayout.attrs.class || "").split(/\s+/).filter(Boolean);
    for (const child of overlayLayout.children) instantiate(child, dialog);
    // The overlay's dialog variable "name" (the hero's in-game name); #name is bound to it.
    dialog.__dialog = { name };
    bindText(dialog.FindChildTraverse("name"), "{s:name}");
    // Engine-created status effect list under CitadelStatusEffect.
    const container = new MockPanel("Panel", dialog.FindChildTraverse("StatusEffects"), "StatusEffectContainer");
    // Count the debuff sampler's shallow scans of the status list.
    const samples = { count: 0 };
    const children = container.Children.bind(container);
    container.Children = () => { samples.count++; return children(); };
    units[name] = { unit, dialog, container, effects: {}, samples };
  });
  const boot = (name) => { units[name].context = runIn(units[name].dialog, worldFiles); };
  const giveBuff = (name, bit, clip) => {
    const effect = new MockPanel("Panel", units[name].container, "");
    effect.classes = ["statusEffect", PICKUP_CLASSES[bit]];
    const border = new MockPanel("Panel", effect, "StatusEffectsBorder");
    border.style.clip = `radial(50% 50%, 0deg, ${clip}deg)`;
    effect.__styleWrites.length = 0;
    border.__styleWrites.length = 0;
    units[name].effects[bit] = { effect, border };
  };
  const setClip = (name, bit, clip) => {
    units[name].effects[bit].border.style.clip = `radial(50% 50%, 0deg, ${clip}deg)`;
    units[name].effects[bit].border.__styleWrites.length = 0;
  };
  const dropBuff = (name, bit) => {
    units[name].effects[bit].effect.DeleteAsync();
    delete units[name].effects[bit];
  };
  const card = (name) => hud.teams.TeamFriendly[AMBER.indexOf(name)] || hud.teams.TeamEnemy[SAPPHIRE.indexOf(name)];
  const shown = (name) => {
    const row = card(name).FindChildTraverse("HPV2PickupIndicators");
    if (!row || row.style.visibility !== "visible") return [];
    return [0, 1, 2, 3].filter((bit) => row.FindChildTraverse(`HPV2Pickup${bit}`).style.visibility === "visible");
  };
  const ringClip = (name, bit) => card(name).FindChildTraverse(`HPV2Pickup${bit}Progress`).style.clip;
  const snapshot = (label) => {
    const rows = {};
    for (const name of [...AMBER, ...SAPPHIRE]) if (shown(name).length) rows[name] = shown(name);
    return { label, rows };
  };
  const run = { name: "pickups", snapshots: [], logs: harness.logs };
  // Engine status effect with id status_<ability> (stock StatusEffect snippet); debuffs carry .isDebuff.
  // radial(now): the native radial on #StatusEffectsBorder, radial(50% 50%, 0deg, <-360..0>deg), at time now.
  // css: the modifier's m_strSmallIconCssClass, which the engine adds as a class ("stunned" for stuns).
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
    effect.setRadial = (next) => { source = next; };
    effect.setStacks = (text) => { effect.FindChildTraverse("stacks").__text = text; };
    return effect;
  };
  const slots = (name) => card(name).FindChildTraverse("DLFDebuffs").Children();
  // A slot's grid place (translate3d written by dlf_debuffs.js); display order is row, then left to right.
  const placeOf = (slot) => {
    const m = /^translate3d\((-?\d+(?:\.\d+)?)px, (-?\d+(?:\.\d+)?)px, 0px\)$/.exec(String(slot.style.transform || ""));
    return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: NaN, y: NaN };
  };
  const byPlace = (list) => list.slice().sort((a, b) => placeOf(a).y - placeOf(b).y || placeOf(a).x - placeOf(b).x);
  // Shown and not fading out, in display order; fadingIcons lists the slots fading out after their status went away.
  const shownSlots = (name) => byPlace(slots(name).filter((slot) => slot.BHasClass("DLFShown") && !slot.BHasClass("DLFFading")));
  const fadingIcons = (name) => slots(name).filter((slot) => slot.BHasClass("DLFShown") && slot.BHasClass("DLFFading"))
    .map((slot) => slot.FindChildrenWithClassTraverse("DLFDebuffIcon")[0].src);
  // Icons drawn under a card, in order: the image path of each shown slot.
  const debuffs = (name) => shownSlots(name).map((slot) => slot.FindChildrenWithClassTraverse("DLFDebuffIcon")[0].src);
  // Applying team of each shown slot.
  const debuffColor = (name) => shownSlots(name)
    .map((slot) => ["Amber", "Sapphire"].filter((team) => slot.BHasClass(`DLFBy${team}`)).join("+"));
  const slotLabel = (slot, cls, flag) =>
    slot.BHasClass(flag) ? slot.FindChildrenWithClassTraverse(cls)[0].__text : "";
  const counts = (name) => shownSlots(name).map((slot) => slotLabel(slot, "DLFDebuffCount", "DLFHasCount"));
  const timers = (name) => shownSlots(name).map((slot) => slotLabel(slot, "DLFDebuffTime", "DLFHasTime"));
  const stuns = (name) => shownSlots(name).map((slot) => slot.BHasClass("DLFStun"));
  // Degrees of the sweep's dark wedge per shown slot (the time passed), -1 without a sweep.
  const sweeps = (name) => shownSlots(name).map((slot) => {
    if (!slot.BHasClass("DLFSweep")) return -1;
    const match = /^radial\(50% 50%, 0deg, (\d+)deg\)$/.exec(String(slot.FindChildrenWithClassTraverse("DLFDebuffShade")[0].style.clip));
    return match ? Number(match[1]) : NaN;
  });
  const setDev = (dev) => hud.topBar.parent.parent.SetAttributeString("dlf_match_state", JSON.stringify({ dev }));
  return { harness, hud, units, bus, sent, boot, giveBuff, setClip, dropBuff, shown, ringClip, card, snapshot, run,
    giveDebuff, debuffs, fadingIcons, debuffColor, counts, timers, sweeps, stuns, slots, placeOf, setDev, bootTopDebuffs, worldRoot, runIn, worldFiles,
    bootAll: () => Object.keys(units).forEach(boot), advance: (ms) => harness.scheduler.runFor(ms, 1e6) };
}

check("pickup composition: DLF names only, sampling read-only, relay layout exists", () => {
  const timers = PICKUP["scripts/dlf/pickup_timers.js"];
  const bridge = PICKUP["scripts/dlf/pickup_bridge.js"];
  for (const text of [timers, bridge]) {
    assert.doesNotMatch(text, /HPV2_PICKUP_SNAPSHOT|HPV2_PICKUP_SCAN_GATE|HPV2_ULTIMATE_SNAPSHOT|HP_COLORS_V2_CONFIG/);
  }
  assert.doesNotMatch(timers, /styleNativePickup\(matches/);
  assert.match(bridge, /"file:\/\/\{resources\}\/layout\/dlf\/pickup_event_relay\.xml"/);
  assert.match(relayLayoutText, /class="HPV2BridgeRelay"/);
  assert.match(relayLayoutText, /scripts\/dlf\/pickup_bridge\.vjs_c/);
  const config = /Object\.freeze\((\{[\s\S]*?\})\);/.exec(PICKUP["scripts/dlf/pickup_config.js"])[1];
  assert.equal(JSON.parse(config).ultimateTimerEnabled, false);
  assert.equal(JSON.parse(config).pickupTimersEnabled, true);
  const overlayScripts = [...read("panorama/layout/unit_status_overlay_v2.xml").matchAll(/scripts\/dlf\/(\w+)\.vjs_c/g)].map((m) => m[1]);
  assert.deepEqual(overlayScripts, ["pickup_config", "pickup_host", "pickup_bridge", "pickup_timers", "dlf_status_css", "dlf_debuff_world"]);
  const topScripts = [...topBarXml.matchAll(/scripts\/dlf\/(pickup_\w+)\.vjs_c/g)].map((m) => m[1]);
  assert.deepEqual(topScripts, ["pickup_config", "pickup_timers"]);
  assert.match(topBarXml, /<CitadelHudTopBar class="HPV2PickupTopBar"/);
});

check("pickup rings: world buffs reach the right spectator cards through the sibling relay", () => {
  const w = pickupWorld();
  w.giveBuff("VAYAM", 0, -300);
  w.giveBuff("NAMELESS", 1, -200);
  w.giveBuff("NAMELESS", 3, -100);
  w.bootAll();
  w.run.snapshots.push(w.snapshot("boot"));
  results.runs.push(w.run);
  assert.deepEqual(w.shown("VAYAM"), [0]);
  assert.deepEqual(w.shown("NAMELESS"), [1, 3]);
  for (const name of [...AMBER, ...SAPPHIRE].filter((n) => n !== "VAYAM" && n !== "NAMELESS")) {
    assert.deepEqual(w.shown(name), [], `${name} has no buff`);
  }
  assert.ok(w.units.VAYAM.unit.FindChildTraverse("HPV2EventRelay"), "sibling relay created next to the dialog");
  assert.ok(w.sent.some((raw) => raw.includes("DLF_PICKUP_SNAPSHOT")) && w.sent.some((raw) => raw.includes("DLF_PICKUP_SCAN_GATE")));
  // 5 + 6: native icons untouched, no ultimate traffic or overlay.
  for (const unit of Object.values(w.units)) {
    for (const { effect, border } of Object.values(unit.effects)) {
      assert.equal(effect.__styleWrites.length + border.__styleWrites.length, 0, "native pickup icon was restyled");
    }
    assert.equal(unit.dialog.FindChildTraverse("HPV2UltimateOverlay"), null);
  }
  w.advance(10000);
  assert.ok(!w.sent.some((raw) => raw.includes("ULTIMATE")), "no ultimate snapshots");
  assert.ok(!w.harness.logs.some((line) => /error/i.test(line)), w.harness.logs.join("\n"));
});

check("pickup rings: spectated and local-player cards", () => {
  const w = pickupWorld({ topBarClasses: { cards: [["TeamFriendly", 0, "SpectatorTarget"], ["TeamEnemy", 4, "LocalPlayer"]] } });
  w.giveBuff("MASTIKHOR", 2, -250);
  w.giveBuff("BREAD", 2, -250);
  w.bootAll();
  w.advance(6000);
  assert.deepEqual(w.shown("MASTIKHOR"), [2], "the spectated hero keeps its rings");
  // Canonical HPv2 rule: a LocalPlayer card never shows rings (an observer has none).
  assert.deepEqual(w.shown("BREAD"), []);
});

check("pickup rings: countdown follows the native radial; ending the buff clears the card", () => {
  const w = pickupWorld();
  w.giveBuff("ESDEATH", 0, -300);
  w.bootAll();
  w.advance(3000);
  w.setClip("ESDEATH", 0, -294);
  w.advance(3000);
  w.setClip("ESDEATH", 0, -288); // three samples, +2 deg/s
  w.advance(3000);
  const angle = () => Number(/, (-?[\d.]+)deg\)$/.exec(w.ringClip("ESDEATH", 0))[1]);
  const first = angle();
  w.advance(2000);
  assert.ok(angle() > first && angle() <= first + 5, `ring advances with the native rate (${first} -> ${angle()})`);
  w.dropBuff("ESDEATH", 0);
  w.advance(3500);
  assert.deepEqual(w.shown("ESDEATH"), []);
});

check("pickup rings: no scanning before 5:00 on a normal map", () => {
  const w = pickupWorld({ clock: "4:00" });
  w.giveBuff("KUSH", 0, -300);
  w.bootAll();
  w.advance(6000);
  assert.deepEqual(w.shown("KUSH"), []);
});

// User report (2026-10-25): the first bridge buffs (5:00) never got a ring on the top bar, later ones did.
// The clock runs from before 5:00, so the 5:00 scan gate opens during the match, not at boot.
check("pickup rings: the first bridge buff (5:00) gets its ring", () => {
  const w = pickupWorld({ clock: "4:50" });
  const clock = w.hud.topBar.FindChildTraverse("GameTime");
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const playTo = (to) => { for (let s = Number(clock.__text.split(":")[0]) * 60 + Number(clock.__text.split(":")[1]) + 1; s <= to; s++) { clock.__text = mmss(s); w.advance(1000); } };
  w.bootAll();
  playTo(300);
  w.giveBuff("KUSH", 0, -360);
  w.giveBuff("VAYAM", 2, -360);
  playTo(320);
  assert.deepEqual([w.shown("KUSH"), w.shown("VAYAM")], [[0], [2]], w.harness.logs.join("\n"));
});

check("pickup rings: HPv2 pak02 messages and config cannot change DLF rings", () => {
  const w = pickupWorld();
  w.giveBuff("VENOM", 1, -300);
  w.bootAll();
  const dlf = w.sent.find((raw) => raw.includes("DLF_PICKUP_SNAPSHOT") && raw.includes("VENOM"));
  const fire = (raw) => w.bus.slice().forEach((entry) => entry.fn(raw));
  fire(dlf.replace("DLF_PICKUP_SNAPSHOT", "HPV2_PICKUP_SNAPSHOT").replace(/"VENOM"/, '"MUXXOO"').replace(/"seq":\d+/, '"seq":999'));
  fire(JSON.stringify({ magic_word: "HP_COLORS_V2_CONFIG", version: 2, revision: 5,
    values: { pickupTimersEnabled: false, ultimateTimerEnabled: true } }));
  w.hud.topBar.parent.SetAttributeString("hp_colors_v2_config", JSON.stringify({ magic_word: "HP_COLORS_V2_CONFIG",
    version: 2, revision: 6, values: { pickupTimersEnabled: false } }));
  w.advance(6000);
  assert.deepEqual(w.shown("MUXXOO"), []);
  assert.deepEqual(w.shown("VENOM"), [1]);
});

check("pickup rings: world layout reload keeps one listener per context", () => {
  const w = pickupWorld();
  w.giveBuff("SUSAGE", 3, -300);
  w.bootAll();
  const mine = () => w.bus.filter((entry) => entry.panel === w.units.SUSAGE.dialog).length;
  assert.equal(mine(), 1);
  w.boot("SUSAGE");
  w.boot("SUSAGE");
  assert.equal(mine(), 1);
  w.advance(6000);
  assert.deepEqual(w.shown("SUSAGE"), [3]);
});

// ---------------------------------------------------------------- top-bar debuff icons
// Ways this can fail, each covered below:
//  1. a world-bar debuff reaches no card, or the wrong card (relay, name match);
//  2. buffs are drawn as debuffs; duplicates or too many debuffs overflow the column;
//  3. the colour is not the applying (opposite) team's: an Amber hero's debuff is Sapphire-coloured;
//  4. the icon path is wrong, or an unknown ability draws nothing;
//  5. a removed debuff or a world bar that went away never clears;
//  6. the DEV poll interval / OFF switch never reaches the world bars, or OFF keeps polling;
//  7. non-hero bars (troopers, neutrals) poll at hero rate; steady state rewrites images or floods messages;
//  8. forged, stale or malformed messages crash the top bar or inject image paths;
//  9. layout reloads stack listeners or loops.

const PETRIFY = "file://{images}/hud/abilities/viper/viper_petrifybola.psd";
const LASH_ULT = "file://{images}/hud/abilities/lash/lash_counter_lash.psd";
const DJINN = "file://{images}/hud/abilities/mirage/mirage_sand_phantom.psd";
const debuffSnapshots = (w) => w.sent.filter((raw) => raw.includes("DLF_DEBUFF_SNAPSHOT"));
const pollRate = (w, name, ms) => {
  const before = w.units[name].samples.count;
  w.advance(ms);
  return w.units[name].samples.count - before;
};

check("debuff layout: card slots, styles, scripts in order, icon table from GameTracking", () => {
  const playerXml = read("panorama/layout/citadel_hud_top_bar_player.xml");
  const column = playerLayout.children.find((node) => node.attrs.id === "DLFDebuffs");
  assert.ok(column, "#DLFDebuffs is a direct child of the card");
  assert.equal(column.children.length, 6, "six static slots (user 2026-10-24: a fifth status was dropped)");
  // The rounded circle holds the icon and seconds; the stun mark and count are its siblings so the
  // circle's rounding never clips them (the mark drew nowhere as a child placed outside it, 2026-10-16).
  for (const slot of column.children) {
    assert.equal(slot.attrs.class, "DLFDebuff");
    assert.deepEqual(slot.children.map((child) => [child.type, child.attrs.class]),
      [["Panel", "DLFDebuffCircle"], ["Panel", "DLFDebuffStunMark"], ["Label", "DLFDebuffCount"]]);
    // The shade (the sweep's dark wedge) sits over the icon and under the seconds.
    assert.deepEqual(slot.children[0].children.map((child) => [child.type, child.attrs.class]),
      [["Image", "DLFDebuffIcon"], ["Panel", "DLFDebuffShade"], ["Label", "DLFDebuffTime"]]);
  }
  const cardCss = read("panorama/styles/dlf/dlf_card.css");
  assert.doesNotMatch(cardCss, /\.DLFDebuff\s*\{[^}]*border-radius/, "the slot itself is not rounded");
  assert.match(playerXml, /s2r:\/\/panorama\/styles\/dlf\/dlf_card\.vcss_c/);
  // The stock name/KDA strip opens down over the card (330px) in these states; the column sat on
  // the player name there (live 2026-10-20, Infernus card), so it hides like on the scoreboard.
  const stockBar = read("panorama/styles/base/citadel_hud_top_bar.css");
  const expanders = new Set();
  for (const [, selectors, body] of stockBar.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/(^|\s)height:\s*\d+px/.test(body)) continue;
    for (const selector of selectors.split(",")) {
      const match = /^\s*(\.[\w-]+)\b.*#PlayerNameNWContainer\s*$/.exec(selector);
      if (match && !match[1].startsWith(".PreGame")) expanders.add(match[1]);
    }
  }
  assert.deepEqual([...expanders].sort(), [".gDetailView", ".wants_scoreboard"], "stock states that open the name strip");
  const hideRule = /([^{}]+)\{[^}]*visibility:\s*collapse;[^}]*\}/g;
  const hidden = [...cardCss.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(hideRule)]
    .flatMap(([, selectors]) => selectors.split(",").map((s) => s.trim()));
  for (const state of [...expanders, ".gScoreboardOpen"]) {
    assert.ok(hidden.includes(`${state} #DLFDebuffs`), `${state} hides the debuff column`);
  }
  // The game sets ult_cooldown on #UltimateStatusBG; a binding only sees its own or an ancestor's
  // dialog variables, so the hidden source label must sit inside it.
  const find = (node, id) => node.attrs.id === id ? node : node.children.map((child) => find(child, id)).find(Boolean);
  const ultHidden = find(playerLayout, "UltimateStatusBG").children.find((node) => node.attrs.id === "DLFUltCooldownHidden");
  assert.ok(ultHidden && ultHidden.attrs.text === "{i:ult_cooldown}", "{i:ult_cooldown} label inside UltimateStatusBG");
  // The visible counter sits directly under the ultimate icon: a down-flow column in StatusRow
  // holding the icon, then the counter (the pickup rings reparent the icon inside that column).
  const ultColumn = find(playerLayout, "StatusRow").children.find((node) => node.attrs.id === "DLFUltColumn");
  assert.ok(ultColumn, "#DLFUltColumn in StatusRow");
  // #DLFUrn (the urn carrier icon) is last and outside the column's flow (ignore-parent-flow).
  assert.deepEqual(ultColumn.children.map((node) => node.attrs.id), ["UltimateStatus", "DLFUltCooldown", "DLFUrn"],
    "ultimate icon, then the counter under it");
  const order = ["dlf_state", "dlf_match", "dlf_banner", "dlf_debuff_icons", "dlf_debuffs", "dlf_ult_cooldown"]
    .map((name) => topBarXml.indexOf(`scripts/dlf/${name}.vjs_c`));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])), "state, match, banner, icons, debuffs");
  const relayXml = read("panorama/layout/dlf/debuff_event_relay.xml");
  assert.match(relayXml, /scripts\/dlf\/dlf_debuff_relay\.vjs_c/);
  assert.doesNotMatch(relayXml, /pickup_bridge/);
  const icons = new vm.Script(`${read("panorama/scripts/dlf/dlf_debuff_icons.js")}\nDLF_DEBUFF_ICONS`).runInNewContext({});
  const keys = Object.values(icons).flatMap((row) => row.split(" ").map((entry) => entry.split("=")[0]));
  assert.ok(keys.length >= 500 && new Set(keys).size === keys.length, `${keys.length} unique abilities`);
  for (const key of keys) assert.match(key, /^[a-z0-9_]{1,64}$/);
  assert.ok(icons["hud/abilities/synth"].split(" ").includes("synth_affliction"));
});

check("debuffs: world debuffs reach the right card, coloured by the applying team", () => {
  const w = pickupWorld();
  w.giveDebuff("VAYAM", "ability_viper_petrifybola");
  w.giveDebuff("NAMELESS", "ability_viper_petrifybola");
  w.giveDebuff("NAMELESS", "not_a_real_ability");
  w.giveDebuff("NAMELESS", "ability_viper_petrifybola"); // a second instance draws once, counted
  w.giveDebuff("KUSH", "ability_werewolf_transformation", { debuff: false });
  // Listed spectator buffs (spectator-status.json buff: true) draw in the hero's own team colour.
  w.giveDebuff("MASTIKHOR", "ability_ice_dome", { debuff: false });
  w.giveDebuff("MUXXOO", "viscous_restorative_goo", { debuff: false }); // a cubed Sapphire hero
  w.giveDebuff("SANSKAR", "citadel_ability_bull_leap"); // an enemy Abrams' stun ...
  w.giveDebuff("SANSKAR", "citadel_ability_bull_leap", { debuff: false }); // ... next to the same ability as a buff
  w.giveDebuff("BREAD", "ability_viper_petrifybola");
  w.giveDebuff("BREAD", "unknown_0");
  for (const ability of ["citadel_ability_lash_ultimate", "citadel_ability_psychic_lift", "ability_gravity_lasso", "drifter_darkness",
    "ability_doorman_hotel", "ability_familiar_ability01"]) {
    w.giveDebuff("BREAD", ability);
  }
  w.bootAll();
  w.advance(1500);
  const run = { name: "debuffs", snapshots: [], logs: w.harness.logs };
  run.snapshots.push(Object.fromEntries([...AMBER, ...SAPPHIRE].map((name) => [name, { icons: w.debuffs(name), by: w.debuffColor(name) }])));
  results.runs.push(run);
  assert.deepEqual(w.debuffs("VAYAM"), [PETRIFY]);
  assert.deepEqual(w.debuffColor("VAYAM"), ["Sapphire"], "an Amber hero's debuff is drawn in the Sapphire (Archmother) colour");
  assert.deepEqual(w.debuffs("NAMELESS"), [PETRIFY], "a debuff of an ability outside spectator-status.json is not drawn");
  assert.deepEqual(w.debuffColor("NAMELESS"), ["Amber"], "a Sapphire hero's debuffs are drawn in the Amber (Hidden King) colour");
  assert.deepEqual(w.counts("NAMELESS"), ["2"], "two instances: a count of 2");
  assert.deepEqual(w.debuffs("KUSH"), [], "unlisted buffs are not drawn");
  assert.deepEqual([w.debuffs("MASTIKHOR"), w.debuffColor("MASTIKHOR")],
    [["file://{images}/hud/abilities/kelvin/frozen_shelter.psd"], ["Amber"]], "a listed buff takes its own team's colour");
  assert.deepEqual(w.debuffColor("SANSKAR"), ["Amber"], "buff and debuff of one ability on one hero: drawn once, as the debuff");
  assert.equal(w.debuffs("BREAD").length, 6, "the column holds six; a seventh listed status is dropped");
  assert.equal(w.debuffs("BREAD")[0], PETRIFY, "in world-bar order");
  assert.deepEqual([w.debuffs("MUXXOO"), w.debuffColor("MUXXOO")],
    [["file://{images}/hud/abilities/viscous/viscous_restorative_goo.psd"], ["Sapphire"]], "Viscous's cube: its own team's colour");
  for (const name of ["ESDEATH", "T3RM1NATOR", "VENOM", "NOTXTATTA", "SUSAGE"]) {
    assert.deepEqual(w.debuffs(name), [], `${name} has no debuff`);
  }
  assert.ok(w.units.VAYAM.unit.FindChildTraverse("DLFDebuffRelay"), "sibling relay next to the dialog");
  assert.equal(w.units.KUSH.unit.FindChildTraverse("DLFDebuffRelay"), null, "a bar with no debuff never sends");
  assert.ok(!w.harness.logs.some((line) => /error|fail/i.test(line)), w.harness.logs.join("\n"));
  // Two cards with one name cannot be told apart: neither draws.
  setName(w.card("MUXXOO"), "VAYAM");
  w.advance(5500);
  assert.deepEqual([w.debuffs("VAYAM"), w.debuffs("MUXXOO")], [[], []]);
});

// Live 2026-10-13: once the applying ability is gone (the caster changed hero), the engine names the
// panel after the modifier's VData path, status_<ability>/<modifier> (client.dll rva 0x1d5dc5d).
check("debuffs: a status_<ability>/<modifier> id draws as its ability", () => {
  const w = pickupWorld();
  w.giveDebuff("VAYAM", "ability_viper_petrifybola/modifier_ability_viper_petrifybola_debuff");
  w.giveDebuff("NAMELESS", "citadel_ability_psychic_lift/modifier_citadel_stunned", { css: "stunned" });
  w.giveDebuff("BREAD", "x/../../evil");
  w.bootAll();
  w.advance(1500);
  assert.deepEqual(w.debuffs("VAYAM"), [PETRIFY]);
  assert.deepEqual(w.stuns("NAMELESS"), [true], "a listed ability's stun keeps its stun mark");
  assert.deepEqual(w.debuffs("BREAD"), [], "only the part before the first / is the key; x is not listed");
});

check("debuffs: removal clears within one poll; steady state writes no images and sends only heartbeats", () => {
  const w = pickupWorld();
  const effect = w.giveDebuff("ESDEATH", "ability_viper_petrifybola");
  const other = w.giveDebuff("ESDEATH", "citadel_ability_lash_ultimate");
  w.bootAll();
  w.advance(1500);
  assert.deepEqual(w.debuffs("ESDEATH"), [PETRIFY, LASH_ULT]);
  let imageWrites = 0;
  let classWrites = 0;
  for (const name of [...AMBER, ...SAPPHIRE]) {
    for (const slot of w.slots(name)) {
      const image = slot.FindChildrenWithClassTraverse("DLFDebuffIcon")[0];
      const set = image.SetImage.bind(image);
      image.SetImage = (src) => { imageWrites++; set(src); };
      const toggle = slot.SetHasClass.bind(slot);
      slot.SetHasClass = (name, on) => { classWrites++; toggle(name, on); };
    }
  }
  const sentBefore = debuffSnapshots(w).length;
  w.advance(30000);
  const steady = debuffSnapshots(w).slice(sentBefore);
  assert.deepEqual([imageWrites, classWrites], [0, 0], "no image or class rewrites in steady state");
  assert.ok(steady.length >= 6 && steady.length <= 9, `only ESDEATH's ~4 s heartbeat (${steady.length})`);
  assert.ok(steady.every((raw) => raw.includes("ESDEATH")));
  assert.deepEqual(w.debuffs("ESDEATH"), [PETRIFY, LASH_ULT], "heartbeats keep a long debuff alive");
  effect.DeleteAsync();
  w.advance(600);
  assert.deepEqual([w.debuffs("ESDEATH"), w.fadingIcons("ESDEATH")], [[LASH_ULT], [PETRIFY]], "gone within one poll, fading out");
  w.advance(1200);
  assert.deepEqual([w.debuffs("ESDEATH"), w.fadingIcons("ESDEATH")], [[LASH_ULT], []], "faded");
  // The remaining status keeps its slot panel and glides to the card's middle (the grid).
  const lashSlot = w.slots("ESDEATH")[1];
  assert.equal(lashSlot.FindChildrenWithClassTraverse("DLFDebuffIcon")[0].src, LASH_ULT);
  assert.deepEqual(w.placeOf(lashSlot), { x: 0, y: 0 }, "alone: centred");
  other.DeleteAsync();
  w.advance(600);
  assert.deepEqual(w.debuffs("ESDEATH"), []);
});

check("debuffs: a world bar that goes away expires from its card", () => {
  const w = pickupWorld();
  w.giveDebuff("T3RM1NATOR", "ability_viper_petrifybola");
  w.bootAll();
  w.advance(1500);
  w.units.T3RM1NATOR.dialog.DeleteAsync();
  w.advance(5000);
  assert.deepEqual(w.debuffs("T3RM1NATOR"), [PETRIFY], "no flicker inside the expiry window");
  w.advance(7000);
  assert.deepEqual(w.debuffs("T3RM1NATOR"), []);
});

// Player aliases on the world healthbars (as Observer HUD, user 2026-10-24): the banner's alias map goes to
// every bar in DLF_DEBUFF_CONFIG; a hero bar's stock #name shows the alias. Ways it can fail: writing #name
// unbinds it, so the in-game name must come from a hidden label of ours bound to the same variable (else the
// column stops matching the card and a recycled bar keeps the old player's alias); a cleared alias or a
// bar recycled to another player must get the stock binding back; aliases alone must not restart polling.
check("player aliases: world healthbars show the alias; statuses still match the card; recycled or cleared bars show the stock name", () => {
  const w = pickupWorld();
  const top = (panel) => { while (panel.parent) panel = panel.parent; return panel; };
  const root = top(w.hud.topBar);
  const nameOf = (unit) => w.units[unit].dialog.FindChildTraverse("name").__text;
  w.giveDebuff("ESDEATH", "ability_viper_petrifybola");
  w.bootAll();
  w.advance(1500);
  assert.equal(nameOf("ESDEATH"), "ESDEATH", "no alias: the stock binding");
  root.SetAttributeString("dlf_aliases", JSON.stringify({ ESDEATH: "Ice Queen", KUSH: "Kush Prime" }));
  w.advance(1500);
  deqA([nameOf("ESDEATH"), nameOf("KUSH"), nameOf("VAYAM")], ["Ice Queen", "Kush Prime", "VAYAM"]);
  assert.deepEqual(w.debuffs("ESDEATH"), [PETRIFY], "the column still matches the card by the in-game name");
  // The engine recycles the bar for another player: the stock name, then the alias again when it comes back.
  w.units.ESDEATH.dialog.__dialog.name = "STRANGER";
  w.advance(1000);
  assert.equal(nameOf("ESDEATH"), "STRANGER");
  w.units.ESDEATH.dialog.__dialog.name = "ESDEATH";
  w.advance(1000);
  assert.equal(nameOf("ESDEATH"), "Ice Queen");
  // Cleared: bound again (it follows the variable).
  root.SetAttributeString("dlf_aliases", JSON.stringify({}));
  w.advance(1500);
  assert.equal(nameOf("ESDEATH"), "ESDEATH");
  w.units.ESDEATH.dialog.__dialog.name = "RENAMED";
  assert.equal(nameOf("ESDEATH"), "RENAMED", "the stock label is bound again");
});
function deqA(actual, expected, message = "values differ") { assert.deepEqual(actual, expected, message); }

// Player aliases on the far-away hero markers and the kill feed (Observer HUD's renderMarkers /
// renderFeedNames, user 2026-10-24), owned by dlf_names.js in the top bar. Stock markers
// (hud_unit_indicators_v2.xml): #unit_indicators_v2 > .PlayerEntry > #PlayerName > Label (engine-written
// text) and #HeroIcon (heroid). Stock kill rows (citadel_hud_data_feed_info.xml) in #EventFeed:
// Label.killerInfo / .victimInfo bound to {s:killer_name} / {s:victim_name}, #KillerImage / #VictimImage.
// Ways it can fail: an alias written into a bound feed label unbinds it, so a reused row would keep the old
// name (a hidden bound label of ours must keep reading the in-game name); a cleared alias must give the
// engine's text / binding back; a name the engine writes again must be taken as the new real name; a
// Steam nickname no card shows is matched by hero, but never when two cards have that hero or when a card
// shows that name; with no aliases nothing is read.
function namesWorld() {
  const harness = createPanoramaHarness();
  const hud = buildHud(harness, { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE });
  const root = harness.root;
  // Each card's hero: Amber 1-6, Sapphire 11-16.
  [...hud.teams.TeamFriendly, ...hud.teams.TeamEnemy].forEach((card, i) => {
    card.FindChildTraverse("HeroBadge").heroid = i < 6 ? i + 1 : i + 5;
  });
  const markers = new MockPanel("Panel", root, "unit_indicators_v2");
  const marker = (name, heroid) => {
    const entry = new MockPanel("Panel", markers, "");
    entry.classes = ["PlayerEntry"];
    const label = new MockPanel("Label", new MockPanel("Panel", entry, "PlayerName"), "");
    label.__text = name;
    new MockPanel("Image", entry, "HeroIcon").heroid = heroid;
    return label;
  };
  const feed = new MockPanel("Panel", root, "EventFeed");
  const kill = (killer, victim, killerHero = 0, victimHero = 0) => {
    const row = new MockPanel("Panel", feed, "");
    row.__dialog = { killer_name: killer, victim_name: victim };
    const label = (cls, bind) => { const l = new MockPanel("Label", row, ""); l.classes = [cls]; return bindText(l, bind); };
    const out = { row, killer: label("killerInfo", "{s:killer_name}"), victim: label("victimInfo", "{s:victim_name}") };
    new MockPanel("Image", row, "KillerImage").heroid = killerHero;
    new MockPanel("Image", row, "VictimImage").heroid = victimHero;
    return out;
  };
  const context = createVmContext(harness, { globals: { $: Object.assign({}, harness.$, {
    GetContextPanel: () => hud.topBar,
    CreatePanel: (type, parent, id, props = {}) => {
      const created = new MockPanel(type, parent, id);
      if (props.text !== undefined) bindText(created, props.text);
      return created;
    }
  }) } });
  runInVm(stateRun, context, "dlf_state.js");
  runInVm(matchScript(JSON.parse(read("match.json"))), context, "dlf_match.js");
  const setAliases = (map) => root.SetAttributeString("dlf_aliases", JSON.stringify(map));
  const boot = () => runInVm(script("dlf/dlf_names.js"), context, "dlf_names.js");
  return { harness, hud, root, marker, kill, setAliases, boot, advance: (ms) => harness.scheduler.runFor(ms, 1e6) };
}
check("player aliases: far-away markers and kill feed names show the alias and give the in-game name back", () => {
  const w = namesWorld();
  const kush = w.marker("KUSH", 2);
  const friend = w.marker("Kushy (friend nickname)", 2); // a Steam nickname: matched by hero 2 (KUSH)
  const bread = w.marker("BREAD", 15);
  const row = w.kill("KUSH", "BREAD", 2, 15);
  w.boot();
  w.advance(1500);
  deqA([kush.__text, friend.__text, row.killer.__text], ["KUSH", "Kushy (friend nickname)", "KUSH"], "no aliases: stock");
  w.setAliases({ KUSH: "Kush Prime" });
  w.advance(1500);
  deqA([kush.__text, friend.__text, bread.__text], ["Kush Prime", "Kush Prime", "BREAD"], "markers by name, else by hero");
  deqA([row.killer.__text, row.victim.__text], ["Kush Prime", "BREAD"], "kill row");
  // A new kill row shows the alias within the 0.25 s watch.
  const late = w.kill("BREAD", "KUSH", 15, 2);
  w.advance(300);
  assert.equal(late.victim.__text, "Kush Prime", "a new row within 0.25 s");
  // The engine reuses the first row for another kill: it shows the new names (the hidden label reads them).
  row.row.__dialog.killer_name = "VAYAM";
  w.advance(1100);
  assert.equal(row.killer.__text, "VAYAM", "a reused row shows its new killer");
  row.row.__dialog.killer_name = "KUSH";
  w.advance(1100);
  assert.equal(row.killer.__text, "Kush Prime");
  // The engine writes a marker's name again (it re-renders): taken as the new real name, alias back on.
  kush.__text = "KUSH";
  w.advance(1100);
  assert.equal(kush.__text, "Kush Prime");
  // Two cards with hero 2: the nickname marker gets no alias (no guess).
  w.hud.teams.TeamEnemy[0].FindChildTraverse("HeroBadge").heroid = 2;
  w.advance(5100);
  assert.equal(friend.__text, "Kushy (friend nickname)", "two cards with that hero: no alias");
  // Cleared: markers show the engine's names, feed labels are bound again.
  w.setAliases({});
  w.advance(1100);
  deqA([kush.__text, row.killer.__text, late.victim.__text], ["KUSH", "KUSH", "KUSH"], "cleared");
  row.row.__dialog.killer_name = "MUXXOO";
  assert.equal(row.killer.__text, "MUXXOO", "the feed label is bound again");
  assert.ok(!w.harness.logs.some((line) => /error/i.test(line)), w.harness.logs.join(" | "));
});
check("player aliases: with no aliases the markers and kill feed are never read", () => {
  const w = namesWorld();
  w.marker("KUSH", 2);
  w.kill("KUSH", "BREAD", 2, 15);
  w.boot();
  w.advance(1000);
  const before = Object.assign({}, w.harness.operationCounts);
  w.advance(30000);
  const grew = Object.keys(w.harness.operationCounts).filter((key) => key !== "schedules" && w.harness.operationCounts[key] !== before[key]);
  const reads = grew.reduce((sum, key) => sum + w.harness.operationCounts[key] - (before[key] || 0), 0) / 30;
  results.budgets = Object.assign(results.budgets || {}, { namesIdlePerSecond: reads });
  assert.ok(reads <= 3, `idle reads per second ${reads} (${grew.join(", ")})`);
});

// Urn carrier on the top bar (user 2026-10-25, screenshot 20261025070241_1.jpg: the feed's pickup row
// shows DIMOV and the urn while Dimov, spectated, reads DELIVER THE URN). client.dll 6819: a feed row
// (citadel_hud_data_feed_info.xml, rva 0x1e3e1e0) gets .IdolPickedUp with the picker as its killer
// ({s:killer_name}, #KillerImage); .IdolReturned / .IdolExpired rows end the carry. Each minimap player
// marker (hud_minimap .map_button.player, rva 0x1e61b20) carries .PlayerIsHoldingIdol while its hero holds
// the urn (modifier state 0x9A), but names no player. Ways it can fail, each covered below:
//  1. the icon goes on the wrong card or none: the feed label shows a DLF alias, so the picker is matched
//     by the row's hero against the cards' #HeroBadge, by name only when the hero is unknown, never when
//     two cards fit;
//  2. it stays after the urn is dropped or delivered (the minimap class goes), after the carrier dies, or
//     after a returned / expired row;
//  3. a pickup by another hero (a reused row) does not move it;
//  4. if the minimap class never shows (not seen live for a spectator) the icon never shows;
//  5. steady state rewrites classes; a reload runs two loops.
function urnWorld() {
  const harness = createPanoramaHarness();
  const hud = buildHud(harness, { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE });
  const root = harness.root;
  const cards = [...hud.teams.TeamFriendly, ...hud.teams.TeamEnemy];
  cards.forEach((card, i) => { card.FindChildTraverse("HeroBadge").heroid = i < 6 ? i + 1 : i + 5; });
  const minimap = new MockPanel("Panel", root, "hud_minimap");
  const markers = cards.map(() => {
    const marker = new MockPanel("Panel", minimap, "");
    marker.classes = ["map_button", "player"];
    return marker;
  });
  const feed = new MockPanel("Panel", root, "EventFeed");
  // A stock feed row: event class, killer label bound to {s:killer_name}, #KillerImage with the hero.
  const row = (cls, killer, hero) => {
    const r = new MockPanel("Panel", feed, "");
    r.classes = cls ? [cls] : [];
    r.__dialog = { killer_name: killer, victim_name: "" };
    const label = new MockPanel("Label", r, "");
    label.classes = ["killerInfo"];
    bindText(label, "{s:killer_name}");
    new MockPanel("Image", r, "KillerImage").heroid = hero;
    r.reuse = (nextCls, nextKiller, nextHero) => {
      r.classes = nextCls ? [nextCls] : [];
      r.__dialog.killer_name = nextKiller;
      r.FindChildTraverse("KillerImage").heroid = nextHero;
    };
    r.label = label;
    return r;
  };
  const context = createVmContext(harness, { globals: { $: Object.assign({}, harness.$, {
    GetContextPanel: () => hud.topBar,
    CreatePanel: (type, parent, id, props = {}) => {
      const created = new MockPanel(type, parent, id);
      if (props.text !== undefined) bindText(created, props.text);
      return created;
    }
  }) } });
  runInVm(stateRun, context, "dlf_state.js");
  runInVm(matchScript(JSON.parse(read("match.json"))), context, "dlf_match.js");
  const boot = () => runInVm(script("dlf/dlf_urn.js"), context, "dlf_urn.js");
  const card = (name) => cards[[...AMBER, ...SAPPHIRE].indexOf(name)];
  // Names of the cards showing the urn.
  const held = () => [...AMBER, ...SAPPHIRE].filter((name) => {
    const icon = card(name).FindChildTraverse("DLFUrn");
    return !!icon && icon.BHasClass("DLFUrnHeld");
  });
  const hold = (name, on) => markers[[...AMBER, ...SAPPHIRE].indexOf(name)].SetHasClass("PlayerIsHoldingIdol", on);
  // The pickup-ring row as pickup_timers.js leaves it in the card's #DLFUltColumn: n visible rings.
  const rings = (name, n) => {
    const column = card(name).FindChildTraverse("DLFUltColumn");
    let row = column.FindChildTraverse("HPV2PickupIndicators");
    if (!row) {
      row = new MockPanel("Panel", column, "HPV2PickupIndicators");
      for (let b = 0; b < 4; b++) new MockPanel("Panel", row, `HPV2Pickup${b}`);
    }
    row.style.visibility = n > 0 ? "visible" : "collapse";
    for (let b = 0; b < 4; b++) row.FindChildTraverse(`HPV2Pickup${b}`).style.visibility = b < n ? "visible" : "collapse";
  };
  const slot = (name) => {
    const icon = card(name).FindChildTraverse("DLFUrn");
    return [1, 2, 3].filter((k) => icon.BHasClass(`DLFUrnSlot${k}`));
  };
  return { harness, hud, root, cards, card, feed, row, held, hold, rings, slot, boot, advance: (ms) => harness.scheduler.runFor(ms, 1e6) };
}

check("urn carrier: the feed's pickup row names the card, the minimap holds it, drop / death / return clear it", () => {
  const css = read("panorama/styles/dlf/dlf_card.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.DLFUrn\s*\{[^}]*visibility:\s*collapse;/, "the urn icon is collapsed by default");
  assert.match(css, /\.DLFUrn\.DLFUrnHeld\s*\{[^}]*visibility:\s*visible;/, "and shows with .DLFUrnHeld");
  assert.match(css, /\.DLFUrn\s*\{[^}]*soul_jar_marker_psd\.vtex/, "the stock minimap urn image");
  // User 2026-10-25 (screenshot): in #StatusRow it pushed the ult icon 12 px left. It sits in the ult
  // column outside its flow, like a buff ring, so the ult icon stays put.
  assert.match(read("panorama/layout/citadel_hud_top_bar_player.xml"), /<Label id="DLFUltCooldown"[^>]*\/>\s*<Panel id="DLFUrn" class="DLFUrn" hittest="false" \/>\s*<\/Panel>/,
    "the icon is the last child of #DLFUltColumn");
  assert.match(css, /\.DLFUrn\s*\{[^}]*ignore-parent-flow:\s*true;/, "outside the column's flow");
  const pitch = 22 + 2 * 1; // pickup_config: pickupSize 22, pickupSpacing 1
  for (const k of [1, 2, 3]) {
    assert.match(css, new RegExp(`\\.DLFUrn\\.DLFUrnSlot${k}\\s*\\{[^}]*translateX\\(${11 + 1 + (k - 1) * pitch + 11}px\\)`), `slot ${k} offset`);
  }
  assert.match(topBarXml, /scripts\/dlf\/dlf_urn\.vjs_c/);

  const w = urnWorld();
  w.boot();
  w.advance(1000);
  deqA(w.held(), [], "nobody holds the urn");
  // NAMELESS (hero 11) picks it up; the feed label shows an alias (dlf_names), so the hero decides.
  const pick = w.row("IdolPickedUp", "NAMELESS", 11);
  pick.label.__text = "Nameless the Great";
  w.hold("NAMELESS", true);
  w.advance(1000);
  deqA(w.held(), ["NAMELESS"], "the picker's card by hero, alias in the feed");
  // Dropped (knocked off): the minimap class goes, the icon goes.
  w.hold("NAMELESS", false);
  w.advance(1000);
  deqA(w.held(), [], "dropped: gone");
  // KUSH (hero 2) picks it up; the engine reuses the row.
  pick.reuse("IdolPickedUp", "KUSH", 2);
  w.hold("KUSH", true);
  w.advance(1000);
  deqA(w.held(), ["KUSH"], "a reused row moves it");
  // The carrier dies: gone at once, even before the minimap updates.
  w.card("KUSH").AddClass("Dead");
  w.advance(1000);
  deqA(w.held(), [], "dead carrier");
  w.card("KUSH").RemoveClass("Dead");
  w.hold("KUSH", false);
  // A new pickup with an unknown hero (0) is matched by name; delivered: a returned row ends it.
  w.row("IdolPickedUp", "VAYAM", 0);
  w.hold("VAYAM", true);
  w.advance(1000);
  deqA(w.held(), ["VAYAM"], "by name when the hero is unknown");
  w.row("IdolReturned", "VAYAM", 1);
  w.advance(1000);
  deqA(w.held(), [], "returned");
  w.hold("VAYAM", false);
  // Two cards with the picker's hero and a name no card shows: no guess.
  w.cards[7].FindChildTraverse("HeroBadge").heroid = 11;
  w.row("IdolPickedUp", "Namy (friend nickname)", 11);
  w.hold("NAMELESS", true);
  w.advance(1000);
  deqA(w.held(), [], "two cards with that hero: none");
  assert.ok(!w.harness.logs.some((line) => /error/i.test(line)), w.harness.logs.join(" | "));
});

check("urn carrier: without the minimap class the feed alone shows it; steady state writes nothing; reload keeps one loop", () => {
  const w = urnWorld();
  w.boot();
  w.advance(1000);
  w.row("IdolPickedUp", "BREAD", 15);
  w.advance(1000);
  deqA(w.held(), ["BREAD"], "no minimap class ever seen: shown from the feed");
  const icon = w.card("BREAD").FindChildTraverse("DLFUrn");
  const classOps = () => w.harness.operationCounts.classWrites || 0;
  const before = classOps();
  w.advance(20000);
  assert.equal(classOps(), before, "steady state writes no classes");
  assert.ok(icon.BHasClass("DLFUrnHeld"));
  w.row("IdolExpired", "", 0);
  w.advance(1000);
  deqA(w.held(), [], "expired");
  w.boot();
  w.advance(1000);
  const loops = w.harness.scheduler.jobs.length;
  w.boot();
  w.advance(1000);
  assert.equal(w.harness.scheduler.jobs.length, loops, "a reload replaces the loop");
});

// The pickup rings (pickup_timers.js pickupSlot) put ceil(n/2) of n buffs left of the ult icon and
// floor(n/2) right, in 24 px slots. The urn takes the first free slot on the right: slot floor(n/2) + 1
// (0 or 1 buff: next to the ult icon; 2 or 3: one further out; 4: two). User 2026-10-25: "do like the
// buff but resolve when there's 2 buffs where the urn should go".
check("urn carrier: sits in the first free buff slot right of the ult icon and follows the ring count", () => {
  const w = urnWorld();
  w.boot();
  w.row("IdolPickedUp", "KUSH", 2);
  w.hold("KUSH", true);
  w.advance(1000);
  deqA([w.held(), w.slot("KUSH")], [["KUSH"], [1]], "no buffs: next to the ult icon");
  const seen = [];
  for (const n of [1, 2, 3, 4, 2, 0]) {
    w.rings("KUSH", n);
    w.advance(600);
    seen.push(w.slot("KUSH").join(""));
  }
  deqA(seen, ["1", "2", "2", "3", "2", "1"], "slot by ring count");
  w.hold("KUSH", false);
  w.advance(600);
  deqA([w.held(), w.slot("KUSH")], [[], []], "the carry ends: no slot class left");
});

check("debuffs: DEV poll interval reaches every hero bar; OFF stops polling and clears the cards", () => {
  const w = pickupWorld();
  w.giveDebuff("MASTIKHOR", "ability_viper_petrifybola");
  w.bootAll();
  w.advance(1500);
  const rate = (ms) => pollRate(w, "KUSH", ms);
  const r250 = rate(10000);
  assert.ok(r250 >= 36 && r250 <= 44, `default 0.25 s (${r250} scans in 10 s)`);
  w.setDev({ debuffs: true, debuffPollMs: 2000 });
  w.advance(1500);
  const r2000 = rate(20000);
  assert.ok(r2000 >= 9 && r2000 <= 11, `2 s (${r2000} scans in 20 s)`);
  w.setDev({ debuffs: true, debuffPollMs: 100 });
  w.advance(1500);
  const r100 = rate(5000);
  assert.ok(r100 >= 45 && r100 <= 55, `0.1 s (${r100} scans in 5 s)`);
  w.setDev({ debuffs: false, debuffPollMs: 100 });
  w.advance(1500);
  assert.deepEqual(w.debuffs("MASTIKHOR"), [], "OFF clears the cards");
  const sentBefore = debuffSnapshots(w).length;
  const totals = () => Object.values(w.units).reduce((sum, unit) => sum + unit.samples.count, 0);
  const scansBefore = totals();
  w.advance(20000);
  assert.equal(totals() - scansBefore, 0, "OFF: no hero bar scans");
  assert.equal(debuffSnapshots(w).length, sentBefore, "OFF: nothing sent");
  w.setDev({ debuffs: true, debuffPollMs: 500 });
  w.advance(1500);
  assert.deepEqual(w.debuffs("MASTIKHOR"), [PETRIFY], "ON again: restored without a reload");
});

check("debuffs: non-hero bars back off and never scan", () => {
  const w = pickupWorld();
  const trooper = new MockPanel("Panel", w.worldRoot, "trooper_0");
  const dialog = new MockPanel("ClientUIDialogPanel", trooper, "");
  for (const child of overlayLayout.children) instantiate(child, dialog);
  const container = new MockPanel("Panel", dialog.FindChildTraverse("StatusEffects"), "StatusEffectContainer");
  new MockPanel("Panel", container, "status_ability_viper_petrifybola").classes = ["statusEffect", "isDebuff"];
  let scans = 0;
  const children = container.Children.bind(container);
  container.Children = () => { scans++; return children(); };
  let checks = 0;
  const has = trooper.BHasClass.bind(trooper);
  trooper.BHasClass = (name) => { if (name === "CLASS_PLAYER") checks++; return has(name); };
  w.runIn(dialog, w.worldFiles.filter(([name]) => !name.startsWith("pickup_timers") && !name.startsWith("pickup_bridge")));
  w.advance(60000);
  assert.equal(scans, 0, "a trooper's status list is never scanned");
  // 0.5 s, 1 s, then every 2 s (world panels are recycled; a bar that becomes a hero shows within 2 s).
  assert.ok(checks >= 25 && checks <= 35, `backed-off hero checks in 60 s (${checks})`);
  const ops = Object.entries(w.harness.operationCounts).filter(([key]) => !["traversal", "findTraversals", "classTraversalNodes"].includes(key));
  results.budgets = Object.assign(results.budgets || {}, { idleBarChecksPerMinute: checks });
  assert.ok(ops.length > 0);
});

// A world panel is recycled between units (live, Observer HUD, client 6812: panorama_world_panel_22 was a
// non-hero bar, then a hero bar). How it can fail: a bar that becomes a hero after a long idle stays
// unread for up to the old 16 s backoff; a bar that stops being a hero keeps its stun panels muted.
check("debuffs: a recycled bar shows its new hero within 2 s and gives muted stun panels back", () => {
  const w = pickupWorld();
  w.bootAll();
  w.advance(1500);
  const venom = w.units.VENOM;
  const stun = w.giveDebuff("VENOM", "citadel_ability_bull_leap", { css: "stunned" });
  w.advance(600);
  assert.equal(stun.style.width, "0px", "the stun panel is muted on the hero bar");
  venom.unit.classes = [];
  w.advance(1000);
  assert.equal(stun.style.width, "", "a bar that stops being a hero gives the panel its styles back");
  stun.DeleteAsync();
  w.advance(40000); // a long idle: the backoff is at its cap
  venom.unit.classes = ["CLASS_PLAYER"];
  w.giveDebuff("VENOM", "ability_viper_petrifybola");
  w.advance(2300);
  assert.deepEqual(w.debuffs("VENOM"), [PETRIFY], "the new hero's status shows within 2 s");
});

// Celeste's Shining Wonder (spec pulse: true; Observer HUD user request 2026-10-23, here 2026-10-24): each
// orb bounce on a hero pulses its slot once. How it can fail: no pulse at all (six-field items rejected);
// a pulse on every heartbeat or repaint; a refresh (radial restarted) not counted.
check("debuffs: Shining Wonder pulses its slot once per hit, never on a heartbeat", () => {
  const w = pickupWorld();
  const pulses = [];
  for (const slot of w.slots("VENOM")) {
    const add = slot.AddClass.bind(slot);
    slot.AddClass = (cls) => { if (cls === "DLFPulse") pulses.push(w.harness.now); return add(cls); };
  }
  const timed = (from, seconds) => (now) => Math.min(0, Math.round(-360 + 360 / seconds * (now - from) / 1000));
  const orb = w.giveDebuff("VENOM", "ability_unicorn_dazzlingorb", { radial: timed(w.harness.now, 3) });
  w.bootAll();
  w.advance(800);
  assert.equal(w.debuffs("VENOM").length, 1, "the slow shows");
  assert.equal(pulses.length, 1, "the first hit pulses");
  w.advance(1000);
  assert.equal(pulses.length, 1, "a running radial is no new hit");
  orb.setRadial(timed(w.harness.now, 3)); // the orb bounces back onto the hero: the radial restarts
  w.advance(600);
  assert.equal(pulses.length, 2, "a refresh pulses once");
  orb.setRadial(() => -180);
  w.advance(9000); // two heartbeats and many repaints
  assert.equal(pulses.length, 2, "heartbeats and repaints never pulse");
});

check("debuffs: forged, stale or malformed snapshots are ignored", () => {
  const w = pickupWorld();
  w.bootAll();
  w.advance(1500);
  const fire = (message) => w.bus.slice().forEach((entry) => entry.fn(typeof message === "string" ? message : JSON.stringify(message)));
  const base = () => ({ magic_word: "DLF_DEBUFF_SNAPSHOT", source: "forged", instance: "x", at: w.harness.now,
    name: "VENOM", items: [["ability_viper_petrifybola", 1, 1, 0, 0]] });
  const item = (patch) => Object.assign(base(), { items: [patch] });
  fire(Object.assign(item(["../../evil", 1, 1, 0, 0]), { seq: 1 }));
  fire(Object.assign(base(), { seq: 2, at: w.harness.now - 60000 }));
  fire(Object.assign(base(), { seq: 3, items: new Array(50).fill(["ability_viper_petrifybola", 1, 1, 0]) }));
  fire(Object.assign(base(), { seq: 4, name: 5 }));
  fire(Object.assign(base(), { seq: 5, at: w.harness.now + 60000 }));
  fire("DLF_DEBUFF_SNAPSHOT{not json");
  fire(Object.assign(base(), { seq: 6, items: "ability_viper_petrifybola" }));
  fire(Object.assign(item(["ability_viper_petrifybola", 2, 1, 0, 0]), { seq: 8 }));
  fire(Object.assign(item(["ability_viper_petrifybola", 1, 0, 0, 0]), { seq: 9 }));
  fire(Object.assign(item(["ability_viper_petrifybola", 1, 1, w.harness.now + 10 * 60 * 1000, 0]), { seq: 10 }));
  fire(Object.assign(item(["ability_viper_petrifybola", 1, 1, "soon", 0]), { seq: 11 }));
  fire(Object.assign(base(), { seq: 12, keys: ["ability_viper_petrifybola"], items: undefined }));
  fire(Object.assign(item(["ability_viper_petrifybola", 1, 1, 0, 2]), { seq: 13 }));
  fire(Object.assign(item(["ability_viper_petrifybola", 1, 1, 0]), { seq: 14 }));
  fire(Object.assign(item(["ability_viper_petrifybola", 1, 1, 0, 0, "x"]), { seq: 15 }));
  assert.deepEqual(w.debuffs("VENOM"), []);
  fire(Object.assign(base(), { seq: 17 }));
  assert.deepEqual(w.debuffs("VENOM"), [PETRIFY], "a well-formed snapshot draws");
  fire(Object.assign(base(), { seq: 17, items: [] }));
  assert.deepEqual(w.debuffs("VENOM"), [PETRIFY], "a replayed sequence number is ignored");
  assert.ok(!w.harness.logs.some((line) => /error|fail/i.test(line)), w.harness.logs.join("\n"));
});

check("debuffs: the sweep follows the native radial; refresh restarts it; auras and permanent statuses show none", () => {
  const w = pickupWorld();
  // A 4.1 s petrify, 0.4 s in when the bars boot: the radial runs from -360 to 0. The engine's
  // angle is read rounded to whole degrees and a little noisy, so fitted ends jitter by tens of ms.
  const timed = (from, seconds) => (now) =>
    Math.min(0, Math.round(-360 + 360 / seconds * (now - from) / 1000 + 0.9 * Math.sin(now / 137)));
  const start = w.harness.now;
  const petrify = w.giveDebuff("KUSH", "ability_viper_petrifybola", { radial: timed(start - 400, 4.1) });
  const aura = w.giveDebuff("KUSH", "ability_ice_dome", { radial: () => -180 }); // aura refresh: the angle never moves
  const flat = w.giveDebuff("KUSH", "citadel_ability_lash_ultimate"); // no radial at all
  w.bootAll();
  const run = { name: "debuff-sweep", snapshots: [] };
  results.runs.push(run);
  // User 2026-11-06 (on Observer HUD): the seconds over the icon hid it on a low-bitrate stream. A status with
  // a fitted end shows the time passed as a dark wedge (degrees of 360) and no number.
  const until = (seconds, from, expect) => {
    while (w.harness.now < from + seconds * 1000) {
      w.advance(250);
      const sweep = w.sweeps("KUSH")[0];
      run.snapshots.push({ t: (w.harness.now - start) / 1000, sweeps: w.sweeps("KUSH") });
      assert.equal(w.timers("KUSH")[0], "", "no number over the icon");
      if (expect) expect(sweep, w.harness.now);
    }
  };
  // No sweep until three samples agree (1 s at the 0.5 s default), then the true share of the 4.1 s passed.
  const exact = (end, total) => (sweep, now) => {
    const want = Math.round(360 * Math.min(1, Math.max(0, 1 - (end - now) / total)));
    assert.ok(Math.abs(sweep - want) <= 12, `at ${(now - start) / 1000} s: ${sweep} deg, want ${want}`);
  };
  until(1, start, (sweep) => assert.ok(sweep === -1 || sweep >= 0 && sweep <= 200, String(sweep)));
  const sentBefore = debuffSnapshots(w).filter((raw) => raw.includes("KUSH")).length;
  until(3.5, start, exact(start + 3700, 4100));
  const steady = debuffSnapshots(w).filter((raw) => raw.includes("KUSH")).slice(sentBefore);
  run.steadyEnds = steady.map((raw) => JSON.parse(raw).items[0][3] - start);
  assert.ok(steady.length <= 1, `rounding jitter does not resend the snapshot (${run.steadyEnds})`);
  assert.deepEqual(w.sweeps("KUSH").slice(1), [-1, -1], "aura and radial-less statuses show no sweep");
  assert.deepEqual(w.timers("KUSH").slice(1), ["", ""], "and no number");
  // Refreshed (re-applied) with 0.2 s left: the radial jumps back to full and the sweep restarts.
  const refreshAt = w.harness.now;
  petrify.setRadial(timed(refreshAt, 4.1));
  until(1.25, refreshAt, (sweep, now) => assert.ok(sweep === -1 || sweep <= 120 || now < start + 3700 + 300,
    `no stale wedge after a refresh (${sweep})`));
  until(4.1, refreshAt, exact(refreshAt + 4100, 4100));
  until(5.5, refreshAt, (sweep) => assert.ok(sweep === -1 || sweep === 360, `at 0: all passed or gone (${sweep})`));
  // Smooth (user: "interp for smoothing"): the 0.25 s steps are interpolated by a native clip transition a
  // little longer than the tick; the passed part is 82 % black (user: 25 % darker than 66 %).
  const shadeRule = /\n\.DLFDebuffShade\s*\{([^}]*)\}/.exec(read("panorama/styles/dlf/dlf_card.css"))[1];
  for (const decl of [/transition-property:\s*clip;/, /transition-duration:\s*0\.3s;/, /transition-timing-function:\s*linear;/, /background-color:\s*#000000D2;/]) {
    assert.match(shadeRule, decl);
  }
  petrify.DeleteAsync();
  aura.DeleteAsync();
  flat.DeleteAsync();
  w.advance(1000);
  assert.deepEqual(w.debuffs("KUSH"), []);
});

check("debuffs: a stun is its own icon, next to the ability's other effects; unlisted stuns stay off", () => {
  const w = pickupWorld();
  // Wraith's ultimate: lift (stun) and silence on one target are two panels with one id.
  w.giveDebuff("VAYAM", "citadel_ability_psychic_lift", { css: "stunned", radial: () => -200 });
  w.giveDebuff("VAYAM", "citadel_ability_psychic_lift", { css: "silence_proc" });
  // Abrams' ultimate stun is the shared modifier_citadel_knockdown (class "stunned"), keyed by the applying ability.
  w.giveDebuff("NAMELESS", "citadel_ability_bull_leap", { css: "stunned" });
  // A stun from an ability outside spectator-status.json (made visible by the shared stun change).
  w.giveDebuff("KUSH", "ability_slork_scald", { css: "stunned" });
  w.giveDebuff("KUSH", "ability_viper_petrifybola");
  w.bootAll();
  w.advance(1500);
  const LIFT = "file://{images}/hud/abilities/wraith_lift.psd";
  assert.deepEqual([w.debuffs("VAYAM"), w.stuns("VAYAM"), w.counts("VAYAM")],
    [[LIFT, LIFT], [true, false], ["", ""]], "stun and silence are separate icons, not one counted twice");
  assert.deepEqual(w.debuffColor("VAYAM"), ["Sapphire", "Sapphire"]);
  assert.deepEqual([w.debuffs("NAMELESS").length, w.stuns("NAMELESS")], [1, [true]], "Abrams' stun shows as a stun");
  assert.deepEqual([w.debuffs("KUSH"), w.stuns("KUSH")], [[PETRIFY], [false]], "an unlisted ability's stun is not drawn");
  // The stun ends first: its icon goes, the silence stays.
  w.units.VAYAM.container.Children().find((panel) => panel.BHasClass("stunned")).DeleteAsync();
  w.advance(1000);
  assert.deepEqual([w.debuffs("VAYAM"), w.stuns("VAYAM")], [[LIFT], [false]]);
});

// User report 2026-10-20: the lifted enemy's Wraith icon showed a number near her cooldown. Hypothesis
// (not traced live): that status has no own duration and its radial runs on the cooldown. A radial whose
// full turn exceeds the ability's heuristic threshold (spec maxSeconds) gives no number; the fixtures
// below model that hypothesis, they do not prove it.
check("debuffs: a radial slower than the ability's longest effect is not its duration (no sweep)", () => {
  const w = pickupWorld();
  const start = w.harness.now;
  const turn = (seconds, from) => (now) => Math.min(0, Math.round(-360 + 360 / seconds * (now - from) / 1000));
  w.giveDebuff("VAYAM", "citadel_ability_psychic_lift", { css: "stunned", radial: turn(150, start - 1000) });
  w.giveDebuff("VAYAM", "citadel_ability_psychic_lift", { css: "silence_proc", radial: turn(4, start) });
  w.giveDebuff("KUSH", "citadel_ability_hook", { debuff: false, radial: turn(23, start - 2000) });
  w.bootAll();
  w.advance(1500);
  const byStun = (name) => Object.fromEntries(w.stuns(name).map((stun, i) => [stun ? "stun" : "other", w.sweeps(name)[i]]));
  const vayam = byStun("VAYAM");
  assert.equal(vayam.stun, -1, "the lift's cooldown radial is dropped");
  assert.ok(Math.abs(vayam.other - 135) <= 12, `the silence sweeps: 1.5 s of 4 s passed (${vayam.other} deg)`);
  assert.deepEqual([w.sweeps("KUSH"), w.timers("KUSH")], [[-1], [""]], "the hook pull's cooldown radial is dropped");
  assert.equal(w.debuffs("KUSH").length, 1, "the icon itself stays");
});

check("debuffs: only listed abilities; Djinn's Mark from 8 stacks; Shoulder Charge's stun stays off", () => {
  const w = pickupWorld();
  // Live 2026-10-13: Abrams' Shoulder Charge stuns with the shared knockdown, keyed by its own ability.
  w.giveDebuff("KUSH", "citadel_ability_bull_charge", { css: "stunned" });
  w.giveDebuff("KUSH", "ability_incendiary_projectile");
  const mark = w.giveDebuff("VAYAM", "mirage_sand_phantom", { stacks: "7", css: "sand_phantom_passive_victim" });
  w.bootAll();
  w.advance(1500);
  assert.deepEqual(w.debuffs("KUSH"), [], "Shoulder Charge's stun and an unlisted debuff are not drawn");
  // Live 2026-10-16: Pocket's ultimate on a bot, status_synth_affliction (listed since).
  w.giveDebuff("KUSH", "synth_affliction", { css: "modifier_pocket_affliction" });
  w.advance(1000);
  assert.deepEqual(w.debuffs("KUSH"), ["file://{images}/hud/abilities/synth/synth_affliction.psd"], "Pocket's Affliction is drawn");
  // Bebop's hook: only the hooked enemy during the pull (user 2026-10-20). Bebop's own hookself and the
  // slow after the pull are out of the spec (stock-hidden); the bullet amp after the pull is skipped by class.
  const pull = w.giveDebuff("BREAD", "citadel_ability_hook", { debuff: false });
  w.advance(1000);
  assert.equal(w.debuffs("BREAD").length, 1, "the hooked enemy shows the hook during the pull");
  pull.DeleteAsync();
  w.giveDebuff("BREAD", "citadel_ability_hook", { css: "bullet_armor_reduction" });
  w.advance(2500);
  assert.deepEqual(w.debuffs("BREAD"), [], "the bullet amp after the pull is not drawn");
  assert.deepEqual(w.debuffs("VAYAM"), [], "Djinn's Mark below 8 stacks is not drawn");
  mark.setStacks("8");
  w.advance(1000);
  assert.deepEqual([w.debuffs("VAYAM"), w.counts("VAYAM")], [[DJINN], ["8"]], "at 8 stacks it shows, with its count");
  mark.setStacks("");
  w.advance(1000);
  assert.deepEqual([w.debuffs("VAYAM"), w.fadingIcons("VAYAM")], [[], [DJINN]], "consumed: it fades out");
  // The stun at max stacks shows whatever the stack label says.
  w.giveDebuff("NAMELESS", "mirage_sand_phantom", { css: "stunned" });
  // Victor's ultimate and the Hyperline knock-off stun with the generic stun, keyed by their ability.
  w.giveDebuff("BREAD", "ability_frank_revive", { css: "stunned" });
  // Live 2026-10-14: the Hyperline knock-off has no applying ability; the engine shows it twice, named
  // after its modifier and its state. It draws once, as the zipline, without a count.
  w.giveDebuff("SANSKAR", "modifier_citadel_knockdown", { css: "stunned" });
  w.giveDebuff("SANSKAR", "MODIFIER_STATE_STUNNED", { css: "stunned" });
  // User 2026-11-06: Seven's and Ivy's stuns drew as the Hyperline. Any stun with no applying ability
  // has the state panel; its modifier panel is the plain stun, not the knockdown. It is unlisted.
  w.giveDebuff("NOTXTATTA", "modifier_citadel_stunned", { css: "stunned" });
  w.giveDebuff("NOTXTATTA", "MODIFIER_STATE_STUNNED", { css: "stunned" });
  // A stun panel the engine reports not visible is still read (the healthbar never draws stun panels).
  for (const panel of w.units.BREAD.container.Children()) panel.visible = false;
  const hidden = w.giveDebuff("MUXXOO", "ability_viper_petrifybola");
  hidden.visible = false;
  w.advance(1000);
  assert.deepEqual([w.debuffs("NAMELESS"), w.stuns("NAMELESS")], [[DJINN], [true]]);
  assert.deepEqual([w.debuffs("BREAD"), w.stuns("BREAD")],
    [["file://{images}/hud/abilities/frank/frank_shocking_reanimation.psd"], [true]], "hidden stun panels are still read");
  assert.deepEqual([w.debuffs("SANSKAR"), w.stuns("SANSKAR"), w.counts("SANSKAR")],
    [["s2r://panorama/images/icons/properties/zipline.vsvg"], [true], [""]]);
  assert.deepEqual(w.debuffs("MUXXOO"), [], "a hidden non-stun panel is not");
  assert.deepEqual(w.debuffs("NOTXTATTA"), [], "a stun with no applying ability other than the knockdown is not the Hyperline");
  // No stun icon on the world healthbars: stun panels are made transparent and zero-sized (CSS
  // visibility did not hide them live, 2026-10-14); other panels are left alone.
  const muted = (panel) => [panel.style.opacity, panel.style.width, panel.style.height, panel.style.margin];
  const stunPanels = w.units.SANSKAR.container.Children();
  assert.ok(stunPanels.every((panel) => String(muted(panel)) === "0,0px,0px,0px"), "stun panels muted");
  assert.deepEqual(muted(hidden).map((value) => value || ""), ["", "", "", ""], "non-stun panel untouched");
  stunPanels[0].SetHasClass("stunned", false);
  w.advance(1000);
  assert.deepEqual(muted(stunPanels[0]).map((value) => value || ""), ["", "", "", ""], "a panel that stops being a stun is restored");
});

// User request 2026-10-21: Nurse Harrow's ultimate shows once the fear procs, not while it builds up.
check("debuffs: Nurse Harrow's fear shows after the proc, not its buildup", () => {
  const w = pickupWorld();
  const buildup = w.giveDebuff("KUSH", "ability_nurse_fear", { css: "nurse_fear_buildup" });
  w.bootAll();
  w.advance(1500);
  assert.deepEqual(w.debuffs("KUSH"), [], "the fear buildup is not drawn");
  buildup.DeleteAsync();
  w.giveDebuff("KUSH", "ability_nurse_fear");
  w.advance(1000);
  assert.deepEqual([w.debuffs("KUSH"), w.debuffColor("KUSH")],
    [["file://{images}/hud/abilities/nurse/medicine_bag.psd"], ["Sapphire"]], "the fear itself is drawn, in the other team's colour");
});

check("debuffs: a gone status fades out for 1 s in its slot; one that returns stops fading", () => {
  const w = pickupWorld();
  const petrify = w.giveDebuff("ESDEATH", "ability_viper_petrifybola", { radial: () => -100 });
  const lash = w.giveDebuff("ESDEATH", "citadel_ability_lash_ultimate");
  w.bootAll();
  w.advance(1500);
  petrify.DeleteAsync();
  w.advance(600);
  const slot0 = w.slots("ESDEATH")[0];
  assert.ok(slot0.BHasClass("DLFFading") && slot0.BHasClass("DLFShown"), "the gone status keeps its slot, fading");
  assert.ok(!slot0.BHasClass("DLFHasTime"), "a fading icon shows no countdown");
  assert.deepEqual(w.debuffs("ESDEATH"), [LASH_ULT], "the remaining status keeps its slot");
  assert.equal(w.slots("ESDEATH")[1].FindChildrenWithClassTraverse("DLFDebuffIcon")[0].src, LASH_ULT);
  // The class stays on for the whole fade (the CSS animation runs once), then the slot is released.
  let classWrites = 0;
  const toggle = slot0.SetHasClass.bind(slot0);
  slot0.SetHasClass = (name, on) => { if (name === "DLFFading") classWrites++; toggle(name, on); };
  w.advance(500);
  assert.deepEqual([w.fadingIcons("ESDEATH"), classWrites], [[PETRIFY], 0], "still fading before 1 s, class untouched");
  w.advance(1000);
  assert.deepEqual([w.fadingIcons("ESDEATH"), w.debuffs("ESDEATH")], [[], [LASH_ULT]], "gone after the fade");
  assert.ok(!w.slots("ESDEATH")[0].BHasClass("DLFFading"), "a reused slot shows at once");
  lash.DeleteAsync();
  w.advance(600);
  assert.deepEqual(w.fadingIcons("ESDEATH"), [LASH_ULT]);
  w.giveDebuff("ESDEATH", "citadel_ability_lash_ultimate");
  w.advance(600);
  assert.deepEqual([w.debuffs("ESDEATH"), w.fadingIcons("ESDEATH")], [[LASH_ULT], []], "back before it faded: shown again");
  // The fade is one CSS keyframe animation as long as FADE_MS, holding its end (a transition only on
  // the class did not show live, and stepped opacity was jittery, 2026-10-14).
  const fadeMs = Number(/const FADE_MS = (\d+);/.exec(read("panorama/scripts/dlf/dlf_debuffs.js"))[1]);
  const cardCss = read("panorama/styles/dlf/dlf_card.css");
  const keyframes = /@keyframes 'DLFDebuffFadeOut'\s*\{\s*0%\s*\{\s*opacity: 1;\s*\}\s*100%\s*\{\s*opacity: 0;\s*\}\s*\}/.test(cardCss);
  assert.ok(keyframes, "DLFDebuffFadeOut runs opacity 1 -> 0");
  const css = /\.DLFDebuff\.DLFFading\s*\{([^}]*)\}/.exec(cardCss)[1];
  assert.match(css, /animation-name: DLFDebuffFadeOut;/);
  assert.match(css, /animation-iteration-count: 1;/);
  assert.match(css, /animation-fill-mode: forwards;/);
  assert.equal(Number(/animation-duration: ([\d.]+)s;/.exec(css)[1]) * 1000, fadeMs);
  assert.doesNotMatch(read("panorama/scripts/dlf/dlf_debuffs.js"), /style\.opacity/, "no scripted opacity");
});

// The column as Observer HUD's centred two-wide grid (user 2026-10-24: "be like the observer hud more";
// Observer HUD 2026-10-23): one status sits in the card's middle; a second moves the first left and pops in
// on the right, the pair symmetric about the middle; a third sits centred under the pair; and so on, six
// at most (three rows). How it could fail: a lone status or a lone last one off-centre; a pair not
// symmetric; a later status landing in a used place; a status that jumps to another slot panel when one is
// added or removed (it must glide, so its panel keeps it); a new status gliding in from where its panel
// last was; places not closing up after a fade; the rows class not following, so the purchase notices sit
// wrong; a pair as wide as a card; rewrites in steady state.
check("debuffs: statuses form a centred two-wide grid; new ones pop in, the rest glide to their places", () => {
  const w = pickupWorld();
  const deq = (actual, expected, message) => assert.deepEqual(actual, expected, message); // the shared one is declared later
  const KEYS = ["ability_viper_petrifybola", "drifter_darkness", "citadel_ability_self_vacuum", "ability_guided_arrow",
    "ability_gravity_lasso", "ability_ult_combo"];
  const grid = w.card("ESDEATH").FindChildTraverse("DLFDebuffs");
  const all = w.slots("ESDEATH");
  assert.equal(all.length, 6, "six slots: three rows of two");
  const writes = new Map(all.map((slot) => [slot, []])); // slot -> [{ value, glide }]
  for (const slot of all) {
    let value = slot.style.transform;
    Object.defineProperty(slot.style, "transform", { configurable: true, get: () => value,
      set: (next) => { writes.get(slot).push({ value: next, glide: slot.BHasClass("DLFGlide") }); value = next; } });
  }
  const iconOf = (slot) => slot.FindChildrenWithClassTraverse("DLFDebuffIcon")[0].src;
  const panelOf = new Map(); // icon -> the slot panel that showed it first
  const places = () => {
    const out = {};
    for (const slot of all.filter((s) => s.BHasClass("DLFShown"))) {
      const icon = iconOf(slot);
      if (!panelOf.has(icon)) panelOf.set(icon, slot);
      assert.equal(panelOf.get(icon), slot, "a status keeps its slot panel");
      const { x, y } = w.placeOf(slot);
      out[KEYS.find((key) => icon.includes(key.split("_").pop())) || icon] = `${x},${y}`;
    }
    return out;
  };
  const rows = () => [1, 2, 3].filter((n) => grid.BHasClass(`DLFRows${n}`));
  const expected = [
    [["0,0"], 1],
    [["-20,0", "20,0"], 1],
    [["-20,0", "20,0", "0,39"], 2],
    [["-20,0", "20,0", "-20,39", "20,39"], 2],
    [["-20,0", "20,0", "-20,39", "20,39", "0,78"], 3],
    [["-20,0", "20,0", "-20,39", "20,39", "-20,78", "20,78"], 3]
  ];
  w.bootAll();
  w.advance(600);
  deq(rows(), [], "no status: no rows (height 0)");
  const effects = [];
  KEYS.forEach((key, n) => {
    effects.push(w.giveDebuff("ESDEATH", key));
    w.advance(600);
    const now = places();
    deq(KEYS.slice(0, n + 1).map((k) => now[k]), expected[n][0], `${n + 1} statuses`);
    deq(rows(), [expected[n][1]], `${n + 1} statuses: ${expected[n][1]} rows`);
  });
  for (const [slot, list] of writes) {
    if (!list.length) continue;
    assert.equal(list[0].glide, false, "first placement without glide");
    assert.ok(list.slice(1).every((entry) => entry.glide), "moves glide");
    assert.ok(slot.BHasClass("DLFGlide"), "glide on once placed");
  }
  const count = () => [...writes.values()].reduce((sum, list) => sum + list.length, 0);
  const before = count();
  w.advance(6000);
  assert.equal(count(), before, "no rewrites in steady state");
  // The first status ends: it fades where it is, then the rest close up, each on its own panel.
  const firstSlot = all.find((s) => s.BHasClass("DLFShown") && w.placeOf(s).x === -20 && w.placeOf(s).y === 0);
  effects[0].DeleteAsync();
  w.advance(600);
  assert.ok(firstSlot.BHasClass("DLFFading"), "fading in place");
  deq(w.placeOf(firstSlot), { x: -20, y: 0 });
  w.advance(1500);
  const after = places();
  deq(KEYS.slice(1).map((k) => after[k]), ["-20,0", "20,0", "-20,39", "20,39", "0,78"], "the rest close up");
  assert.ok(!firstSlot.BHasClass("DLFShown") && !firstSlot.BHasClass("DLFGlide"), "the freed slot hides and loses its glide");
  deq(rows(), [3]);
  // A new status takes the free panel and pops in at the end of the order, without gliding.
  w.giveDebuff("ESDEATH", KEYS[0]);
  const writesBefore = writes.get(firstSlot).length;
  w.advance(600);
  const back = writes.get(firstSlot).slice(writesBefore);
  deq(back.map((entry) => [entry.value, entry.glide]), [["translate3d(20px, 78px, 0px)", false]], "pops in at its new place");
  // A pair (2 x 20 px from the middle plus one circle) leaves at least 12 px to the next card's pair on
  // the 88 px stock card, twice the 6 px inside a pair.
  const sheet = read("panorama/styles/dlf/dlf_card.css");
  const circle = Number(/\n\.DLFDebuffCircle\s*\{[^}]*\bwidth:\s*(\d+)px/.exec(sheet)[1]);
  assert.ok(40 + circle <= 88 - 12 && 40 - circle >= 6, `pair span ${40 + circle} px, inner gap ${40 - circle} px`);
});

check("debuffs: stack counts (Baba's pigeons) show on the icon", () => {
  const w = pickupWorld();
  const mark = w.giveDebuff("BREAD", "ability_baba_ultimate_2", { stacks: "3" });
  w.bootAll();
  w.advance(1000);
  assert.deepEqual([w.debuffs("BREAD"), w.counts("BREAD")],
    [["file://{images}/hud/abilities/baba/pigeon_launcher.psd"], ["3"]]);
  assert.deepEqual(w.debuffColor("BREAD"), ["Amber"]);
  mark.setStacks("1");
  w.advance(1000);
  assert.deepEqual(w.counts("BREAD"), [""], "a single stack shows no number");
  mark.setStacks("");
  w.giveDebuff("BREAD", "ability_baba_ultimate_2"); // separate instances also count
  w.advance(1000);
  assert.deepEqual(w.counts("BREAD"), ["2"]);
});

check("debuffs: Billy's Chain Gang pull shows on the top bar (user 2026-10-20)", () => {
  const w = pickupWorld();
  w.giveDebuff("BREAD", "ability_punkgoat_tether");
  w.bootAll();
  w.advance(1000);
  assert.deepEqual(w.debuffs("BREAD"), ["file://{images}/hud/abilities/punkgoat/goat_chaingang.psd"]);
});

check("debuffs: a hero who just spawned shows on the first try, without waiting for the 5 s card rescan", () => {
  // Live 2026-10-20 (sandbox, STATUS LOG): every first try on a freshly spawned bot logged recv ... cards=0;
  // the card only appeared on the next 5 s rescan, after the short status had ended.
  const w = pickupWorld();
  w.bootAll();
  w.advance(1500);
  const container = w.hud.topBar.FindChildTraverse("TeamEnemy").FindChildTraverse("PlayersContainer");
  // A bar becomes a new hero: its card is added to the top bar (addCard) and its world bar is renamed.
  const addCard = (name) => {
    const card = instantiate(playerLayout, container);
    setName(card, name);
    return card;
  };
  const rename = (unit, name) => { w.units[unit].dialog.__dialog.name = name; };
  const icons = (card) => card.FindChildTraverse("DLFDebuffs").Children().filter((slot) => slot.BHasClass("DLFShown"))
    .map((slot) => slot.FindChildrenWithClassTraverse("DLFDebuffIcon")[0].src);
  const PULL = ["file://{images}/hud/abilities/punkgoat/goat_chaingang.psd"];
  const [unitA, unitB, unitC] = SAPPHIRE.slice(-3);

  // 1. One new hero: the first status shows well inside the 5 s rescan period.
  const cardA = addCard("NEWBOTA");
  rename(unitA, "NEWBOTA");
  rename(unitB, "NEWBOTB"); // its card comes later
  w.advance(500);
  w.giveDebuff(unitA, "ability_punkgoat_tether");
  let waited = 0;
  while (!icons(cardA).length && waited < 300) {
    w.advance(10);
    waited += 10;
  }
  assert.deepEqual(icons(cardA), PULL, `first new hero (after ${waited} ms)`);

  // 2. A second new hero inside the 0.5 s throttle after that rescan: deferred to the deadline, not dropped.
  const cardB = addCard("NEWBOTB");
  const pullB = w.giveDebuff(unitB, "ability_punkgoat_tether");
  w.advance(260); // B's bar has sent (0.25 s poll), inside the throttle
  assert.deepEqual(icons(cardB), [], "throttled: not yet");
  w.advance(300);
  assert.deepEqual(icons(cardB), PULL, "second new hero, at the throttle deadline");
  pullB.DeleteAsync();

  // 3. The card appears just after the hero's first snapshot: the fruitless rescan is retried.
  w.advance(1500);
  rename(unitC, "LATEBOT");
  w.advance(500);
  w.giveDebuff(unitC, "ability_punkgoat_tether");
  w.advance(300); // the snapshot arrived and found no card
  const cardC = addCard("LATEBOT");
  w.advance(600);
  assert.deepEqual(icons(cardC), PULL, "card added after the first snapshot");

  // Bounded: a name that never gets a card retries for 2 s, then waits for the 5 s rescans. Other
  // top-bar scripts read the cards too, so the count is compared with a quiet 10 s baseline.
  let scans = 0;
  const children = container.Children.bind(container);
  container.Children = () => { scans++; return children(); };
  w.advance(1500);
  scans = 0;
  w.advance(10000);
  const baseline = scans;
  rename(SAPPHIRE[0], "NOCARD");
  w.advance(500);
  scans = 0;
  w.giveDebuff(SAPPHIRE[0], "ability_viper_petrifybola");
  w.advance(2500);
  const inside = scans;
  w.advance(500);
  scans = 0;
  w.advance(10000);
  assert.ok(inside >= baseline / 4 + 4, `retries inside the window: ${inside} (baseline ${baseline} per 10 s)`);
  assert.ok(scans <= baseline + 1, `after the window: ${scans}, baseline ${baseline}`);
});

check("spectator VData spec: every listed ability exists with an icon; buff list matches the world sampler", () => {
  const spec = JSON.parse(read("spectator-status.json"));
  const icons = new vm.Script(`${read("panorama/scripts/dlf/dlf_debuff_icons.js")}\nDLF_DEBUFF_ICONS`).runInNewContext({});
  const known = new Set(Object.values(icons).flatMap((row) => row.split(" ").map((entry) => entry.split("=")[0])));
  assert.equal(spec.abilities.length, 35, "the 16 requested ultimates, Pocket's and Mo & Krill's ultimates, Sinclair's Rabbit Hex, Viscous's cube, Bebop's hook, Djinn's Mark, Victor's ultimate, the Hyperline, Billy's Chain Gang pull, the nine statuses added 2026-10-21 (Solomon's ultimate and rook, Infernus's ultimate, Yamato's Flying Strike, Haze's dagger, Deadman Danny's ultimate, Violet's ultimate, Warden's cage, the Doorman's cart), Nurse Harrow's fear and Celeste's Shining Wonder (2026-10-23, Observer HUD request)");
  const extra = new vm.Script(`(${/const EXTRA_ICONS = (\{[^}]*\});/.exec(read("panorama/scripts/dlf/dlf_debuffs.js"))[1]})`)
    .runInNewContext({});
  for (const entry of spec.abilities) {
    assert.ok(known.has(entry.ability) || extra[entry.ability], `${entry.ability} has an icon`);
    assert.ok(typeof entry.hero === "string" && entry.hero, `${entry.ability} names its hero`);
    assert.ok(entry.modifiers.length || entry.stun, `${entry.ability} changes something`);
  }
  // The hook target hides itself in client code. Its client class swap (onto its Link base) shows the
  // icon during the pull but stops the pull on the observer's screen (live 2026-10-16, user accepted).
  // It is the only swap allowed, and only for a listed modifier.
  assert.deepEqual((spec.classSwaps || []).map((swap) => [swap.ability, swap.modifier, swap.from, swap.to]),
    [["citadel_ability_hook", "modifier_citadel_hooktarget", "modifier_citadel_hooktarget", "modifier_citadel_link"]]);
  for (const swap of spec.classSwaps) {
    assert.ok(spec.abilities.some((entry) => entry.ability === swap.ability && entry.modifiers.includes(swap.modifier)),
      `${swap.modifier} is listed`);
  }
  const world = read("panorama/scripts/dlf/dlf_debuff_world.js");
  // One RULES entry per spec ability, in spec order, carrying exactly the spec's per-ability settings.
  const worldRules = new vm.Script(/const RULES = (new Map\(\[[\s\S]*?\]\));/.exec(world)[1]).runInNewContext({ Map });
  const specRules = spec.abilities.map((entry) => [entry.ability, Object.assign({ maxSeconds: entry.maxSeconds },
    entry.buff ? { buff: true } : {}, entry.minStacks ? { minStacks: entry.minStacks } : {},
    entry.ignoreClasses ? { ignore: entry.ignoreClasses } : {}, entry.pulse ? { pulse: true } : {})]);
  assert.deepEqual(JSON.parse(JSON.stringify([...worldRules])), specRules, "only listed abilities reach the top bar, with the spec's settings");
  for (const entry of spec.abilities) assert.ok(entry.maxSeconds > 0 && entry.maxSeconds <= 20, `${entry.ability} maxSeconds`);
  const hook = spec.abilities.find((entry) => entry.ability === "citadel_ability_hook");
  assert.deepEqual([hook.modifiers, hook.ignoreClasses], [["modifier_citadel_hooktarget"], ["bullet_armor_reduction"]],
    "Bebop's hook: only the hooked enemy during the pull (user 2026-10-20)");
  // World healthbars show no stun icon (the shared stun modifiers are visible so the sampler can read them).
  // A long selector failed the whole healthbar layout live (fatal error at start, 2026-10-14): keep this one short.
  const worldCss = read("panorama/styles/dlf/dlf_status_world.css");
  const rules = [...worldCss.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .map((m) => [m[1].trim(), m[2].replace(/\s+/g, " ").trim()]);
  assert.deepEqual(rules, [[".DLFWorldBar .statusEffect.stunned", "opacity: 0; width: 0px; height: 0px; margin: 0px;"]]);
  // Stylesheets apply per layout file, and CitadelStatusEffect builds its status panels from its own
  // layout, so the rule must load there (2026-10-16: included from the overlay, it never applied).
  // The override is the pinned stock file plus one include after the stock styles.
  const include = '\t\t<include src="s2r://panorama/styles/dlf/dlf_status_world.vcss" />\n';
  const statusXml = read("panorama/layout/citadel_status_effect.xml").replace(/\r\n/g, "\n");
  assert.match(statusXml, /citadel_status_effect\.vcss" \/>\n\t\t<include src="s2r:\/\/panorama\/styles\/dlf\/dlf_status_world\.vcss" \/>\n\t<\/styles>/);
  const stockPin = JSON.parse(read("stock-pin.json"));
  assert.equal(crypto.createHash("sha256").update(statusXml.replace(include, "")).digest("hex"),
    stockPin.files["game/citadel/pak01_dir/panorama/layout/citadel_status_effect.xml"], "stock citadel_status_effect.xml plus the DLF include");
  const overlayXml = read("panorama/layout/unit_status_overlay_v2.xml");
  assert.doesNotMatch(overlayXml, /dlf_status_world/, "the overlay's own stylesheets never reach the status panels");
  assert.ok(overlayLayout.attrs.class === "WindowRoot DLFWorldBar" &&
    overlayLayout.children.some((node) => node.type === "CitadelStatusEffect"),
    ".DLFWorldBar is the overlay root holding the status list");
  assert.deepEqual(spec.fields, { m_bIsHidden: "false", m_bIsHiddenOverhead: "false",
    m_eDrawOverheadStatus: '"OVERHEAD_DRAW_FOR_EVERYONE"' });
});

// User 2026-11-06: the kill feed's killstreak flame sat above the killer's name. The stock flame
// (#KillStreakParticlePanel, citadel_hud_data_feed_info.css 6860: height 100%, vertical-align middle,
// rotateZ(-90deg)) is centred on the whole killer box, which starts 16 px above the name plate (.unit_bg
// margin-top 16px). Ways this fails: the rule never loads (stylesheets apply per layout, so it must be
// included from the row layout), the override drifts from stock, the stock rotation is lost, or the
// flame moves sideways.
check("kill feed: the killstreak flame moves down onto the name plate, keeping the stock rotation", () => {
  const include = '\t\t<include src="s2r://panorama/styles/dlf/dlf_feed.vcss" />\n';
  const rowXml = read("panorama/layout/citadel_hud_data_feed_info.xml").replace(/\r\n/g, "\n");
  assert.match(rowXml, /citadel_hud_data_feed_info\.vcss" \/>\n\t\t<include src="s2r:\/\/panorama\/styles\/dlf\/dlf_feed\.vcss" \/>\n\t<\/styles>/);
  assert.match(rowXml, /id="KillStreakParticlePanel"/);
  const stockPin = JSON.parse(read("stock-pin.json"));
  assert.equal(crypto.createHash("sha256").update(rowXml.replace(include, "")).digest("hex"),
    stockPin.files["game/citadel/pak01_dir/panorama/layout/citadel_hud_data_feed_info.xml"], "stock row layout plus the DLF include");
  const rules = [...read("panorama/styles/dlf/dlf_feed.css").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .map((m) => [m[1].trim(), m[2].replace(/\s+/g, " ").trim()]);
  assert.deepEqual(rules, [["#KillStreakParticlePanel", "transform: translateY(16px) rotateZ(-90deg);"]]);
});

check("debuffs: layout reloads keep one listener and one loop", () => {
  const w = pickupWorld();
  w.giveDebuff("SUSAGE", "ability_viper_petrifybola");
  w.bootAll();
  w.advance(1500);
  const topListeners = () => w.bus.filter((entry) => entry.panel === w.hud.topBar).length;
  const listeners = topListeners();
  w.bootTopDebuffs();
  w.bootTopDebuffs();
  assert.equal(topListeners(), listeners);
  w.boot("SUSAGE");
  w.boot("SUSAGE");
  w.advance(5000);
  assert.deepEqual(w.debuffs("SUSAGE"), [PETRIFY]);
  const scans = pollRate(w, "SUSAGE", 10000);
  assert.ok(scans >= 36 && scans <= 44, `one sampling loop after reloads (${scans} scans in 10 s at 0.25 s)`);
});

check("ultimate cooldown: each card shows the game's ult_cooldown beside the icon, hidden at 0 and when unbound", () => {
  const w = pickupWorld();
  w.giveBuff("KUSH", 0, -300); // the pickup rings wrap KUSH's ultimate
  w.bootAll();
  const hidden = (name) => w.card(name).FindChildTraverse("DLFUltCooldownHidden");
  const counter = (name) => {
    const shown = w.card(name).FindChildTraverse("DLFUltCooldown");
    return shown.BHasClass("DLFCounting") ? shown.__text : "";
  };
  hidden("KUSH").__text = "37";
  hidden("NAMELESS").__text = "112";
  hidden("VAYAM").__text = "0";
  w.advance(600);
  assert.deepEqual(w.shown("KUSH"), [0]);
  assert.equal(hidden("KUSH").GetParent().GetParent().GetParent().id, "HPV2PickupIndicators", "ultimate moved into the ring row");
  assert.deepEqual(["KUSH", "NAMELESS", "VAYAM", "MASTIKHOR"].map(counter), ["37", "112", "", ""]);
  hidden("KUSH").__text = "36";
  w.advance(500);
  assert.equal(counter("KUSH"), "36", "follows the game value within half a second");
  const shown = w.card("KUSH").FindChildTraverse("DLFUltCooldown");
  let writes = 0;
  const textProperty = Object.getOwnPropertyDescriptor(shown, "text");
  Object.defineProperty(shown, "text", { configurable: true, get: textProperty.get,
    set: (value) => { writes++; textProperty.set(value); } });
  w.advance(10000);
  assert.equal(writes, 0, "no rewrites while the value holds");
  hidden("KUSH").__text = "0";
  w.advance(500);
  assert.equal(counter("KUSH"), "", "ready: the counter hides");
  // A card the engine rebuilds (reconnect) is picked up without waiting for the 5 s rescan.
  const old = w.card("VENOM");
  const fresh = instantiate(playerLayout, old.GetParent());
  old.DeleteAsync();
  fresh.FindChildTraverse("DLFUltCooldownHidden").__text = "64";
  w.advance(600);
  const freshShown = fresh.FindChildTraverse("DLFUltCooldown");
  assert.deepEqual([freshShown.BHasClass("DLFCounting"), freshShown.__text], [true, "64"]);
});

check("ESC menu DEV: debuff switch and poll interval publish, save and restore", () => {
  const profile = profileWith();
  const g = launch(profile);
  g.advance(3000);
  const dev = () => JSON.parse(g.hud.topBar.parent.parent.GetAttributeString("dlf_match_state", "")).dev;
  assert.deepEqual(dev(), { debuffs: true, debuffPollMs: 250, logStatus: false });
  assert.equal(g.panel("DLFLogToggleLabel").__text, "OFF", "the status log is off by default");
  assert.deepEqual([g.panel("DLFDebuffToggleLabel").__text, g.panel("DLFPollValue").__text], ["ON", "0.25 s"]);
  g.click("DLFDevToggle");
  assert.ok(g.escape.BHasClass("DLFDevOpen"));
  for (let i = 0; i < 3; i++) g.click("DLFPollDown");
  assert.deepEqual([dev().debuffPollMs, g.panel("DLFPollValue").__text], [100, "0.1 s"], "clamps at the fastest step");
  for (let i = 0; i < 6; i++) g.click("DLFPollUp");
  assert.deepEqual([dev().debuffPollMs, g.panel("DLFPollValue").__text], [2000, "2 s"], "clamps at the slowest step");
  g.click("DLFDebuffToggle");
  assert.deepEqual([dev().debuffs, g.panel("DLFDebuffToggleLabel").__text], [false, "OFF"]);
  g.click("DLFLogToggle");
  assert.deepEqual([dev().logStatus, g.panel("DLFLogToggleLabel").__text], [true, "ON"]);
  g.advance(3000);
  assert.deepEqual(g.saved().dev, { debuffs: false, debuffPollMs: 2000, logStatus: true });
  const next = launch(profile);
  next.advance(3000);
  assert.deepEqual([next.panel("DLFDebuffToggleLabel").__text, next.panel("DLFPollValue").__text,
    next.panel("DLFLogToggleLabel").__text], ["OFF", "2 s", "ON"]);
  // Saves from before the DEV section, or with garbage, get the defaults.
  for (const devValue of [undefined, { debuffs: "yes", debuffPollMs: 333, logStatus: 1 }]) {
    const old = launch(profileWith({ [STORE_KEY]: record(JSON.stringify({ s: 1, season: 1, match: 1, dev: devValue })) }));
    old.advance(3000);
    assert.equal(old.status(), "SAVED");
    assert.deepEqual(JSON.parse(old.hud.topBar.parent.parent.GetAttributeString("dlf_match_state", "")).dev,
      { debuffs: true, debuffPollMs: 250, logStatus: false });
  }
});

check("ESC menu pages: MATCH first, one page at a time, the picker replaces the page and gives it back, team titles show the names", () => {
  const g = launch(profileWith());
  g.advance(3000);
  g.click("DLFMenuButton");
  const PAGES = ["Match", "Teams", "Players", "Graph", "Style", "Share", "Dev"];
  const open = () => PAGES.filter((name) => g.escape.BHasClass(`DLF${name}Open`));
  const selected = () => PAGES.filter((name) => g.panel(`DLF${name}Toggle`).BHasClass("Selected"));
  assert.deepEqual([open(), selected()], [["Match"], ["Match"]], "the per-game controls open first");
  for (const name of PAGES) {
    g.click(`DLF${name}Toggle`);
    assert.deepEqual([open(), selected()], [[name], [name]], `${name}: the only open page and selected tab`);
  }
  g.click("DLFPlayersToggle");
  g.click("DLFMenuClose");
  g.click("DLFMenuButton");
  assert.deepEqual(open(), ["Players"], "reopening keeps the session's page");
  g.click("DLFMatchToggle");
  g.click("DLFSapphireBan0");
  assert.ok(g.escape.BHasClass("DLFPicking") && open().length === 1, "the picker shows in the page area's place; the page is kept underneath");
  assert.equal(g.cancel(), true);
  assert.deepEqual([g.escape.BHasClass("DLFPicking"), open()], [false, ["Match"]], "closing the picker shows the page again");
  g.type("DLFSapphireNameEntry", "Team Blue");
  assert.deepEqual([g.panel("DLFSapphireMatchTitle").__text, g.panel("DLFSapphirePlayersTitle").__text, g.panel("DLFAmberMatchTitle").__text],
    ["SAPPHIRE - Team Blue", "SAPPHIRE - Team Blue", "AMBER - VENOM"], "score and player columns name their team");
  g.bootMenu();
  g.advance(1000);
  assert.deepEqual(open(), ["Match"], "a reloaded layout starts on MATCH");
});

// Soul graph settings. Ways this can fail, each covered below:
//  1. a choice or stepper writes a value the contract rejects (off the step, outside the limits, unknown key);
//  2. the published state or the save drops a field, or a restart shows other values;
//  3. the choice labels or steppers copy numbers that no longer match $.DLFState;
//  4. the graph RESET touches more than state.graph, or RESET TO DEFAULTS misses it;
//  5. old or damaged saves leave garbage in state.graph.
check("ESC menu GRAPH: settings step within limits, publish on dlf_match_state, save, RESET restores graph defaults", () => {
  const S = fitState;
  const DEF = JSON.parse(JSON.stringify(S.GRAPH_DEFAULTS)); // a plain object from this context
  const profile = profileWith();
  const g = launch(profile);
  g.advance(3000);
  const graph = () => JSON.parse(g.hud.topBar.parent.parent.GetAttributeString("dlf_match_state", "")).graph;
  const choice = (prefix, index) => g.panel(`${prefix}${index}`);
  const labelsOf = (prefix, count) => Array.from({ length: count }, (_, index) => choice(prefix, index).Children()[0].__text);
  const selectedIn = (prefix, count) => Array.from({ length: count }, (_, index) => index).filter((index) => choice(prefix, index).BHasClass("Selected"));
  assert.deepEqual(graph(), DEF, "defaults published before any edit");
  assert.deepEqual([DEF.first, DEF.every], [600, 300], "the first mark at 10:00, then every 5:00 (user 2026-10-24)");
  assert.deepEqual(labelsOf("DLFGraphShow", S.GRAPH_SHOW.length), Array.from(S.GRAPH_SHOW).map((v) => v === 0 ? "OFF" : v === -1 ? "ALWAYS" : `${v} S`),
    "SHOW choices come from GRAPH_SHOW");
  assert.deepEqual(labelsOf("DLFGraphFirst", S.GRAPH_FIRST.length), Array.from(S.GRAPH_FIRST).map((v) => `${v / 60} MIN`), "FIRST MARK AT choices come from GRAPH_FIRST");
  assert.deepEqual(labelsOf("DLFGraphEvery", S.GRAPH_EVERY.length), Array.from(S.GRAPH_EVERY).map((v) => `${v / 60} MIN`), "THEN EVERY choices come from GRAPH_EVERY");
  assert.deepEqual(Array.from(S.GRAPH_LINES).map((key) => g.panel(`DLFGraphLine_${key}`).Children()[0].__text), Array.from(S.GRAPH_LINES).map((key) => key.toUpperCase()));
  assert.deepEqual([selectedIn("DLFGraphShow", S.GRAPH_SHOW.length), selectedIn("DLFGraphFirst", S.GRAPH_FIRST.length), selectedIn("DLFGraphEvery", S.GRAPH_EVERY.length)],
    [[S.GRAPH_SHOW.indexOf(DEF.show)], [S.GRAPH_FIRST.indexOf(DEF.first)], [S.GRAPH_EVERY.indexOf(DEF.every)]], "the defaults are the selected choices");
  assert.ok(g.panel(`DLFGraphLine_${DEF.line}`).BHasClass("Selected"));
  assert.deepEqual([g.panel("DLFGraphSizeValue").__text, g.panel("DLFGraphXValue").__text, g.panel("DLFGraphYValue").__text,
    g.panel("DLFGraphFillLabel").__text], [`${DEF.size}%`, `${DEF.x} px`, `${DEF.y} px`, "ON"]);
  g.click("DLFMenuButton");
  g.click("DLFSeasonUp");
  g.click("DLFGraphToggle");
  assert.ok(g.escape.BHasClass("DLFGraphOpen"));
  const writes = g.stats.writes;
  // Choices: one click selects; the state takes exactly that table value.
  g.click("DLFGraphShow0");
  assert.deepEqual([graph().show, selectedIn("DLFGraphShow", S.GRAPH_SHOW.length)], [S.GRAPH_SHOW[0], [0]], "OFF");
  const always = S.GRAPH_SHOW.length - 1;
  g.click(`DLFGraphShow${always}`);
  assert.deepEqual([graph().show, selectedIn("DLFGraphShow", S.GRAPH_SHOW.length)], [-1, [always]], "ALWAYS");
  g.click("DLFGraphFirst0");
  assert.deepEqual([graph().first, selectedIn("DLFGraphFirst", S.GRAPH_FIRST.length)], [S.GRAPH_FIRST[0], [0]], "FIRST MARK AT");
  g.click("DLFGraphEvery0");
  assert.equal(graph().every, S.GRAPH_EVERY[0]);
  g.click("DLFGraphLine_cyan");
  assert.ok(graph().line === "cyan" && g.panel("DLFGraphLine_cyan").BHasClass("Selected") && !g.panel("DLFGraphLine_green").BHasClass("Selected"));
  // Steppers: one GRAPH_LIMITS step per click, clamped at both ends, always on the step.
  const seen = { size: new Set(), x: new Set(), y: new Set() };
  const stepAll = (part, key, direction, clicks) => {
    for (let i = 0; i < clicks; i++) {
      g.click(`DLFGraph${part}${direction}`);
      seen[key].add(graph()[key]);
    }
  };
  const [sizeMin, sizeMax, sizeStep] = S.GRAPH_LIMITS.size;
  stepAll("Size", "size", "Up", 20);
  assert.deepEqual([graph().size, g.panel("DLFGraphSizeValue").__text], [sizeMax, `${sizeMax}%`], "size stops at the max");
  stepAll("Size", "size", "Down", 20);
  assert.deepEqual([graph().size, g.panel("DLFGraphSizeValue").__text], [sizeMin, `${sizeMin}%`], "size stops at the min");
  g.click("DLFGraphSizeUp");
  assert.equal(graph().size, sizeMin + sizeStep, "one step per click");
  const [xMin, xMax] = S.GRAPH_LIMITS.x;
  const [yMin, yMax] = S.GRAPH_LIMITS.y;
  stepAll("X", "x", "Down", 80);
  assert.deepEqual([graph().x, g.panel("DLFGraphXValue").__text], [xMin, `${xMin} px`]);
  stepAll("X", "x", "Up", 160);
  assert.equal(graph().x, xMax);
  stepAll("Y", "y", "Up", 80);
  assert.deepEqual([graph().y, g.panel("DLFGraphYValue").__text], [yMax, `${yMax} px`]);
  stepAll("Y", "y", "Down", 80);
  assert.equal(graph().y, yMin);
  for (const key of ["size", "x", "y"]) {
    const [min, max, step] = S.GRAPH_LIMITS[key];
    assert.ok([...seen[key]].every((v) => Number.isInteger(v) && v >= min && v <= max && (v - min) % step === 0), `${key}: every value is on the step inside the limits`);
  }
  g.click("DLFGraphFill");
  assert.deepEqual([graph().fill, g.panel("DLFGraphFillLabel").__text, g.panel("DLFGraphFill").BHasClass("On")], [false, "OFF", false]);
  const edited = { show: -1, first: S.GRAPH_FIRST[0], every: S.GRAPH_EVERY[0], size: sizeMin + sizeStep, x: xMax, y: yMin, line: "cyan", fill: false };
  assert.deepEqual(graph(), edited);
  g.advance(3000);
  assert.equal(g.status(), "SAVED");
  assert.equal(g.stats.writes, writes + 1, "the burst of graph edits saved once");
  assert.deepEqual(g.saved().graph, edited, "the save carries the graph");
  const next = launch(profile);
  next.advance(3000);
  assert.deepEqual(JSON.parse(next.hud.topBar.parent.parent.GetAttributeString("dlf_match_state", "")).graph, edited, "restored after a restart");
  assert.deepEqual([next.panel("DLFGraphSizeValue").__text, next.panel("DLFGraphXValue").__text, next.panel("DLFGraphFillLabel").__text,
    next.panel(`DLFGraphShow${always}`).BHasClass("Selected"), next.panel("DLFGraphLine_cyan").BHasClass("Selected")],
    [`${sizeMin + sizeStep}%`, `${xMax} px`, "OFF", true, true]);
  // The graph RESET restores GRAPH_DEFAULTS and nothing else; RESET TO DEFAULTS covers the graph too.
  g.click("DLFGraphReset");
  const afterReset = JSON.parse(g.hud.topBar.parent.parent.GetAttributeString("dlf_match_state", ""));
  assert.deepEqual(afterReset.graph, DEF, "graph RESET restores the graph defaults");
  assert.equal(afterReset.season, 3, "graph RESET leaves the match alone");
  g.click("DLFGraphFill");
  g.click("DLFMenuReset");
  g.click("DLFMenuReset");
  assert.deepEqual(graph(), DEF, "RESET TO DEFAULTS restores the graph too");
  g.advance(3000);
  assert.deepEqual(g.saved().graph, DEF);
  // Saves from before the graph, or with garbage, get the defaults (and a damaged field falls back alone).
  for (const [graphValue, expected] of [[undefined, DEF],
    [{ show: 45, every: 90, size: 75, x: 999, y: -45, line: "red", fill: "yes" }, DEF],
    [{ show: 15, size: 140, line: "gold", fill: "yes" }, Object.assign({}, DEF, { show: 15, size: 140, line: "gold" })]]) {
    const old = launch(profileWith({ [STORE_KEY]: record(JSON.stringify({ s: 1, season: 1, match: 1, graph: graphValue })) }));
    old.advance(3000);
    assert.equal(old.status(), "SAVED");
    assert.deepEqual(JSON.parse(old.hud.topBar.parent.parent.GetAttributeString("dlf_match_state", "")).graph, expected, JSON.stringify(graphValue));
  }
});

// Share codes. Ways this can fail, each covered below:
//  1. the code drops part of the save (aliases, session names, logos, style, DEV) or a non-ASCII name;
//  2. the clipboard route throws (CopyStringToClipboard does live) and leaves no code;
//  3. a pasted code wrapped by chat (spaces, line breaks) is rejected;
//  4. a damaged, foreign or newer code changes anything, or out-of-range values get through;
//  5. an imported code is shown but not saved, or the store stays blocked after it.
check("ESC menu SHARE: a code carries the whole save and player names to another PC; bad codes change nothing", () => {
  const ids = { MASTIKHOR: "300", KUSH: "100", VAYAM: "200" };
  const from = launch(profileWith());
  from.advance(3000);
  from.playersList([...AMBER, ...SAPPHIRE].map((name) => ({ name, account: ids[name] })));
  from.click("DLFMenuButton");
  from.advance(8000);
  from.type("DLFAmberNameEntry", "Team Ünïcode");
  from.type("DLFAmberLogoEntry", "https://cdn.example.com/amber.png");
  from.type("DLFAmberPlayer0Entry", "Kush ☆"); // KUSH, account 100
  const botRow = SAPPHIRE.findIndex((name) => !ids[name]);
  const botName = from.panel("DLFSapphirePlayer5Game").__text;
  assert.ok(botRow >= 0 && botName && !/\(/.test(botName), "the last Sapphire row is a player without an account");
  from.type("DLFSapphirePlayer5Entry", "Bot Alias");
  from.click("DLFStyleToggle");
  from.click("DLFStyleTab_score");
  from.click("DLFStyleFont");
  from.click("DLFDevToggle");
  from.click("DLFPollUp");
  from.click("DLFDebuffToggle");
  from.advance(3000);
  from.click("DLFShareToggle");
  assert.ok(from.escape.BHasClass("DLFShareOpen") && !from.escape.BHasClass("DLFDevOpen"), "SHARE closes DEV");
  from.click("DLFShareCopy");
  const code = from.panel("DLFShareEntry").text;
  assert.match(code, /^DLFC1\.[0-9a-f]{8}\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(from.harness.clipboardWrites, [code], "copied through the TextEntry route");
  assert.ok(!from.harness.dispatches.some(([name]) => name === "CopyStringToClipboard"), "the throwing clipboard event is never used");
  assert.equal(from.panel("DLFShareStatus").__text, "CODE COPIED");
  const exported = JSON.parse(from.hud.topBar.parent.parent.GetAttributeString("dlf_match_state", ""));

  const profile = profileWith();
  const to = launch(profile);
  to.advance(3000);
  to.playersList([...AMBER, ...SAPPHIRE].map((name) => ({ name, account: ids[name] })));
  to.click("DLFMenuButton");
  to.advance(8000);
  const writes = to.stats.writes;
  // Chat clients wrap long codes: spaces and line breaks are ignored.
  to.panel("DLFShareEntry").text = `  ${code.slice(0, 40)}\n${code.slice(40, 90)} ${code.slice(90)}\r\n`;
  to.click("DLFShareImport");
  assert.equal(to.panel("DLFShareStatus").__text, "IMPORTED");
  const imported = JSON.parse(to.hud.topBar.parent.parent.GetAttributeString("dlf_match_state", ""));
  const DEFAULT_DEV = { debuffs: true, debuffPollMs: 250, logStatus: false }; // this PC's own, not the code's
  assert.deepEqual(imported, Object.assign({}, exported, { dev: DEFAULT_DEV }), "every saved field arrives but DEV: match, logos, style and account aliases");
  assert.deepEqual(imported.dev, DEFAULT_DEV, "the code's DEV settings are ignored (observer PC keeps its own, 2026-10-24)");
  assert.equal(imported.aliases["100"], "Kush ☆");
  to.advance(3000);
  const banner = to.banner();
  assert.equal(banner.left.team, "Team Ünïcode");
  assert.equal(banner.left.players[AMBER.indexOf("KUSH")], "Kush ☆");
  assert.equal(banner.right.players[SAPPHIRE.indexOf(botName)], "Bot Alias", "session names for players without an account come along");
  assert.equal(to.status(), "SAVED");
  assert.equal(to.stats.writes, writes + 1, "the import is saved once");
  assert.deepEqual(to.saved().dev, imported.dev);

  const before = to.hud.topBar.parent.parent.GetAttributeString("dlf_match_state", "");
  const body = code.split(".")[2];
  const flipped = body.slice(0, 10) + (body[10] === "A" ? "B" : "A") + body.slice(11);
  const reencode = (value) => {
    const json = JSON.stringify(value);
    let hash = 0x811c9dc5;
    for (let i = 0; i < json.length; i++) { hash ^= json.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; }
    return `DLFC1.${hash.toString(16).padStart(8, "0")}.${Buffer.from(json, "utf8").toString("base64url")}`;
  };
  for (const [text, label] of [
    ["", "PASTE A CODE FIRST"],
    ["hello", "NOT A DLF CODE"],
    [`DLFC1.${code.split(".")[1]}.${flipped}`, "NOT A DLF CODE"],
    ["DLFS1.00000000.{}", "NOT A DLF CODE"],
    [reencode({ s: 2, state: { season: 9 } }), "CODE FROM A NEWER VERSION - UPDATE THE MOD"]
  ]) {
    to.harness.clipboardText = "";
    to.panel("DLFShareEntry").text = text;
    to.click("DLFShareImport");
    assert.equal(to.panel("DLFShareStatus").__text, label, JSON.stringify(text));
    assert.equal(to.hud.topBar.parent.parent.GetAttributeString("dlf_match_state", ""), before, `${label}: nothing changed`);
  }
  // An empty box pastes from the clipboard first.
  to.harness.clipboardText = reencode({ s: 1, state: { season: 42, match: 3, dev: { debuffPollMs: 333, debuffs: "x" },
    style: { score: { size: 999 } } } });
  to.panel("DLFShareEntry").text = "";
  to.click("DLFShareImport");
  assert.equal(to.panel("DLFShareStatus").__text, "IMPORTED");
  const clamped = JSON.parse(to.hud.topBar.parent.parent.GetAttributeString("dlf_match_state", ""));
  assert.deepEqual([clamped.season, clamped.match, clamped.dev.debuffPollMs, clamped.dev.debuffs, clamped.style.score.size],
    [42, 3, 250, true, 30], "missing or out-of-range fields take the defaults");

  // A store blocked by a damaged save accepts an imported code, like RESET.
  const blocked = launch(profileWith({ [STORE_KEY]: "DLFS1.00000000.{}" }));
  blocked.advance(3000);
  assert.equal(blocked.status(), "SAVE DAMAGED - RESET TO REPAIR");
  blocked.panel("DLFShareEntry").text = code;
  blocked.click("DLFShareImport");
  blocked.advance(3000);
  assert.equal(blocked.status(), "SAVED");
  assert.equal(blocked.saved().amber.name, "Team Ünïcode");
  results.runs.push({ name: "share-code", length: code.length, code });
});

check("status log: DEV switch prints each hero's status panels (id, classes, stacks, radial) on change only", () => {
  const w = pickupWorld();
  const lines = () => w.harness.logs.filter((line) => line.startsWith("[DLF-DB] status"));
  const stun = w.giveDebuff("VAYAM", "citadel_ability_bull_leap", { css: "stunned", radial: () => -200 });
  w.giveDebuff("VAYAM", "citadel_ability_psychic_lift", { css: "silence_proc", stacks: "2" });
  w.giveDebuff("KUSH", "ability_ice_dome", { debuff: false }); // buffs are printed too
  w.bootAll();
  // A status-list child without a status_ id is printed as well.
  const odd = new MockPanel("Panel", w.units.ESDEATH.container, "");
  odd.classes = ["statusEffect", "isDebuff"];
  w.advance(3000);
  assert.deepEqual(lines(), [], "off by default: nothing printed");
  const acks = () => w.harness.logs.filter((line) => /^\[DLF-DB\] (config|log on)/.test(line));
  assert.deepEqual(acks(), ["[DLF-DB] config icons=true poll=250 log=false"], "the top bar reports the settings at boot");
  w.dialogName = (name, text) => {
    if (text === null) delete w.units[name].dialog.__dialog.name;
    else w.units[name].dialog.__dialog.name = text;
  };
  w.dialogName("SUSAGE", null); // a bar whose name never bound
  w.setDev({ debuffs: true, debuffPollMs: 500, logStatus: true });
  w.advance(1500);
  assert.equal(acks()[1], "[DLF-DB] config icons=true poll=500 log=true", "and again on change");
  const onLines = acks().slice(2).sort();
  assert.equal(onLines.length, 12, "every hero bar confirms once");
  assert.ok(onLines.includes("[DLF-DB] log on: VAYAM, 2 statuses") && onLines.includes("[DLF-DB] log on: (no name), 0 statuses"),
    onLines.join("\n"));
  const printed = lines();
  results.runs.push({ name: "status-log", lines: printed });
  assert.deepEqual(printed.sort(), [
    "[DLF-DB] status + ESDEATH (no id) classes=[statusEffect isDebuff] stacks=- radial=-",
    "[DLF-DB] status + KUSH status_ability_ice_dome classes=[usingAbilityImage statusEffect] stacks=- radial=-",
    "[DLF-DB] status + VAYAM status_citadel_ability_bull_leap classes=[usingAbilityImage statusEffect isDebuff stunned] stacks=- radial=-200",
    "[DLF-DB] status + VAYAM status_citadel_ability_psychic_lift classes=[usingAbilityImage statusEffect isDebuff silence_proc] stacks=2 radial=-"
  ]);
  w.advance(10000);
  assert.equal(lines().length, 4, "steady state prints nothing more");
  assert.equal(acks().length, 14, "confirmations are printed once");
  stun.AddClass("proced"); // an engine class appearing later is a change
  w.advance(1000);
  assert.equal(lines()[4], "[DLF-DB] status ~ VAYAM status_citadel_ability_bull_leap classes=[usingAbilityImage statusEffect isDebuff proced stunned] stacks=- radial=-200");
  stun.DeleteAsync();
  w.advance(1000);
  assert.equal(lines()[5], "[DLF-DB] status - VAYAM status_citadel_ability_bull_leap");
  // The log keeps working with the icons switched off, and stops when it is switched off.
  w.setDev({ debuffs: false, debuffPollMs: 500, logStatus: true });
  w.advance(1500);
  w.giveDebuff("MUXXOO", "ability_viper_petrifybola");
  w.advance(1000);
  assert.equal(lines()[6], "[DLF-DB] status + MUXXOO status_ability_viper_petrifybola classes=[usingAbilityImage statusEffect isDebuff] stacks=- radial=-");
  assert.deepEqual(w.debuffs("MUXXOO"), [], "icons stay off");
  w.setDev({ debuffs: false, debuffPollMs: 500, logStatus: false });
  w.advance(1500);
  w.giveDebuff("BREAD", "ability_viper_petrifybola");
  w.advance(3000);
  assert.equal(lines().length, 7, "log off: nothing more");
  const before = acks().length;
  w.setDev({ debuffs: false, debuffPollMs: 500, logStatus: true });
  w.advance(1500);
  assert.equal(acks().length - before, 1 + 12, "switched on again: the settings and every bar confirm again");
});

check("status log: a status is traced from the world bar (send) to the top bar (recv or drop <reason>, show)", () => {
  const w = pickupWorld();
  const trace = () => w.harness.logs.filter((line) => /^\[DLF-DB\] (send|recv|show) /.test(line));
  w.bootAll();
  w.giveDebuff("BREAD", "ability_viper_petrifybola");
  w.advance(1500);
  assert.deepEqual(trace(), [], "log off: no trace");
  w.setDev({ debuffs: true, debuffPollMs: 250, logStatus: true });
  w.advance(1500);
  w.giveDebuff("KUSH", "ability_punkgoat_tether");
  w.advance(500);
  const lines = trace().filter((line) => / KUSH /.test(line));
  results.runs.push({ name: "status-trace", lines });
  assert.match(lines[0], /^\[DLF-DB\] send KUSH seq=1 items=\[\["ability_punkgoat_tether",1,1,0,0\]\] new relay$/);
  assert.match(lines[1], /^\[DLF-DB\] recv KUSH seq=1 items=\[\["ability_punkgoat_tether",1,1,0,0\]\] cards=1$/);
  assert.equal(lines[2], "[DLF-DB] show KUSH ability_punkgoat_tether file://{images}/hud/abilities/punkgoat/goat_chaingang.psd");
  // Rejected snapshots name their reason, so a send without a recv is not mistaken for a lost message.
  const fire = (message) => w.bus.slice().forEach((entry) => entry.fn(JSON.stringify(message)));
  const forged = { magic_word: "DLF_DEBUFF_SNAPSHOT", source: "forged", instance: "x", seq: 2, at: w.harness.now,
    name: "VENOM", items: [["ability_viper_petrifybola", 1, 1, 0, 0]] };
  fire(forged);
  fire(forged);
  fire(Object.assign({}, forged, { seq: 3, at: w.harness.now - 60000 }));
  fire(Object.assign({}, forged, { seq: 4, items: [["../evil", 1, 1, 0, 0]] }));
  const venom = w.harness.logs.filter((line) => / VENOM /.test(line) && /^\[DLF-DB\] (recv|drop) /.test(line));
  assert.deepEqual(venom.map((line) => line.replace(/at=\d+ now=\d+/, "at=T now=T")), [
    '[DLF-DB] recv VENOM seq=2 items=[["ability_viper_petrifybola",1,1,0,0]] cards=1',
    "[DLF-DB] drop stale VENOM seq=2",
    "[DLF-DB] drop clock at=T now=T VENOM seq=3",
    "[DLF-DB] drop items VENOM seq=4"
  ]);
});

check("status log: the class list covers every m_strSmallIconCssClass in the game's VData", () => {
  const css = new vm.Script(`${read("panorama/scripts/dlf/dlf_status_css.js")}\nDLF_STATUS_CSS`).runInNewContext({});
  const list = css.split(" ");
  assert.ok(list.length >= 50 && new Set(list).size === list.length, `${list.length} unique classes`);
  for (const name of ["stunned", "silence_proc", "modifier_pocket_affliction", "viper_petrify", "immobilize"]) {
    assert.ok(list.includes(name), name);
  }
  for (const name of list) assert.match(name, /^[A-Za-z0-9_-]{1,64}$/);
  const overlayScripts = [...read("panorama/layout/unit_status_overlay_v2.xml").matchAll(/scripts\/dlf\/(\w+)\.vjs_c/g)].map((m) => m[1]);
  assert.ok(overlayScripts.indexOf("dlf_status_css") >= 0 &&
    overlayScripts.indexOf("dlf_status_css") < overlayScripts.indexOf("dlf_debuff_world"), "class list loads before the sampler");
});

// Audit regressions (2026-10-16), each failed before its fix:
//  1. a card whose debuff column or cooldown label the engine rebuilt kept its dead cached panels;
//  2. RESET pressed while the save was still loading lost to the stored record;
//  3. a newer clearing snapshot for a name lost to an older source's icons until they expired;
//  4. an alias typed while the slot's player changed attached to the new player;
//  5. a script reload left the old logo images and appended a second hero grid;
//  6. match files could not set style, dev or logos although the runtime reads them;
//  7. compose-pickups --pin hashed other bytes than the build checks.
const findNode = (node, id) => node.attrs.id === id ? node : node.children.map((child) => findNode(child, id)).find(Boolean);

check("audit: a card whose debuff column or cooldown label was rebuilt recovers", () => {
  const w = pickupWorld();
  const card = w.card("VAYAM");
  const replace = (id) => {
    const old = card.FindChildTraverse(id);
    const parent = old.parent;
    old.DeleteAsync();
    return instantiate(findNode(playerLayout, id), parent);
  };
  w.giveDebuff("VAYAM", "ability_viper_petrifybola");
  w.bootAll();
  w.advance(1500);
  assert.deepEqual(w.debuffs("VAYAM"), [PETRIFY]);
  replace("DLFDebuffs");
  w.advance(6000);
  assert.deepEqual(w.debuffs("VAYAM"), [PETRIFY], "the new column shows the debuff");
  const counter = replace("DLFUltCooldown");
  card.FindChildTraverse("DLFUltCooldownHidden").__text = "17";
  w.advance(6000);
  assert.equal(counter.__text, "17", "the new counter shows the cooldown");
  assert.ok(counter.BHasClass("DLFCounting"));
});

check("audit: a newer clearing snapshot wins over an older source's icons", () => {
  const w = pickupWorld();
  const send = (source, at, items) => {
    const payload = JSON.stringify({ magic_word: "DLF_DEBUFF_SNAPSHOT", source, instance: source, seq: 1, at, name: "VAYAM", items });
    for (const entry of w.bus.slice()) if (entry.name === "ClientUI_FireOutput") entry.fn(payload);
  };
  const now = w.harness.now;
  send("old_bar", now - 2000, [["ability_viper_petrifybola", 1, 1, 0, 0]]);
  assert.deepEqual(w.debuffs("VAYAM"), [PETRIFY]);
  send("new_bar", now - 1000, []);
  assert.deepEqual(w.debuffs("VAYAM"), [], "the newest record for the name is empty");
});

check("audit: RESET while the save loads wins over the stored record", () => {
  const profile = profileWith();
  const first = launch(profile);
  first.advance(3000);
  first.click("DLFSeasonUp");
  first.advance(3000);
  assert.equal(first.saved().season, 3);
  const g = launch(profile);
  g.click("DLFMenuReset");
  g.click("DLFMenuReset");
  g.advance(3000);
  assert.equal(g.status(), "SAVED");
  assert.deepEqual(g.banner().event, ["SEASON 2", "MATCH #57"]);
  assert.equal(g.saved().season, 2);
});

check("audit: an alias typed while the slot's player changes is dropped, never moved to the new player", () => {
  const g = launch(profileWith());
  g.advance(3000);
  g.click("DLFMenuButton");
  g.advance(1500);
  const entry = g.panel("DLFAmberPlayer0Entry");
  entry.BHasKeyFocus = () => true;
  entry.__text = "CAPTAIN";
  setName(g.hud.teams.TeamFriendly[0], "SUBSTITUTE");
  g.advance(6000);
  entry.events.ontextentrysubmit();
  entry.BHasKeyFocus = () => false;
  g.advance(1500);
  assert.equal(g.banner().left.players[0], "SUBSTITUTE");
  assert.equal(entry.__text, "", "the draft is reverted");
});

check("audit: script reloads keep one logo image per side and one hero grid", () => {
  const t = boot("reload-owned", { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE }, { teamClasses: SPECTATOR });
  t.harness.root.SetAttributeString("dlf_match_state", JSON.stringify({ amber: { logo: { url: "https://cdn.example.com/a.png", scale: 100 } } }));
  t.tick();
  runInVm(bannerRun, t.context, "dlf_banner.js");
  t.tick();
  const customs = t.topBar.FindChildTraverse("DLFLeftLogo").Children().filter((child) => child.BHasClass("DLFLogoCustom"));
  assert.equal(customs.length, 1, "the old instance's image is removed");
  const g = launch(profileWith());
  g.advance(1000);
  g.bootMenu();
  g.advance(1000);
  assert.equal(g.panel("DLFHeroGrid").Children().length, HEROES.length);
});

check("audit: match files may set style, dev and logos, validated with the runtime's limits", () => {
  const good = JSON.parse(read("match.json"));
  const full = Object.assign({}, good, {
    style: { team: { font: "napalm", size: 28, x: 0, y: 0, spacing: 2 }, player: { size: 12 } },
    dev: { debuffs: false, debuffPollMs: 250, logStatus: false },
    amber: Object.assign({}, good.amber, { logo: { url: "https://cdn.example.com/a.png", scale: 120 } })
  });
  parseMatch(JSON.stringify(full));
  const bad = [
    { style: { team: { size: 31 } } }, { style: { team: { font: "comic" } } }, { style: { banner: {} } },
    { style: { team: { colour: 1 } } }, { dev: { debuffPollMs: 300 } }, { dev: { debuffs: "yes" } },
    { amber: Object.assign({}, good.amber, { logo: { url: "ftp://x/y.png" } }) },
    { amber: Object.assign({}, good.amber, { logo: { scale: 300 } }) }
  ];
  for (const extra of bad) assert.throws(() => parseMatch(JSON.stringify(Object.assign({}, good, extra))), /match file:/, JSON.stringify(extra));
});

check("audit: compose-pickups pins and checks the same bytes (CRLF checkouts)", () => {
  const { sourceHash } = require("./compose-pickups.js");
  assert.equal(sourceHash("a\r\nb\r\n"), sourceHash("a\nb\n"), "line endings do not change the pin");
});

// ---------------------------------------------------------------- soul lead graph (top bar)
// Ways it can fail: Amber/Sapphire swapped (wrong sign or leader); shown before two pins or never
// hidden; a mark pinned from a sample taken long after it; a demo seek or late join leaving a line
// over missing time; unreadable plates or clock throwing or drawing NaN; settings from the menu not
// applied or invalid ones accepted; a reload running two loops; redrawing or restyling every tick;
// overlapping the stock centre column (clock, soul plates, rejuvenator icon, mid-boss timer, rift timer,
// rift cash-in meter) or leaving dead space under it (#RejuvenatorCharges is a 130 px box, live 2026-10-23).
const graphRun = () => script("dlf/dlf_soul_graph.js");
const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
const deq = (actual, expected, message) => assert.deepEqual(actual, expected, message);
// The graph is a child of CitadelHudTopBar, whose padding-top (the banner's room, dlf_banner.css) moves
// every child down: its margin-top counts from under the padding, while the pieces it sits under are
// measured from the top bar's top. Live 2026-10-24 (user screenshot, margin-top never written) its
// plot sat ~80 px down, not at the top bar's 0, so writing the measured bottom put it 68 px too low:
// the "dead space" of 2026-10-23.
const TOP_PAD = Number(/CitadelHudTopBar,\s*\.spec_mode CitadelHudTopBar\s*\{[^}]*padding-top:\s*(\d+)px/
  .exec(read("panorama/styles/dlf/dlf_banner.css"))[1]);
// The graph's default y offset is 35 px (2026-10-24); an explicit y replaces it.
const graphTop = (bottom, y = 35) => `${bottom + 6 + y - TOP_PAD}px`;
function graphWorld() {
  const harness = createPanoramaHarness();
  const hud = buildHud(harness, { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE });
  hud.topBar.parent.classes = ["isDefaultMap", "TeamSpectator", "spec_mode"];
  const panel = (id) => hud.topBar.FindChildTraverse(id);
  const byClass = (cls) => hud.topBar.FindChildrenWithClassTraverse(cls)[0];
  // Stock centre column at 1080p: clock, soul plates, rejuvenator charges under the clock.
  Object.assign(byClass("GameClock"), { actualxoffset: 920, actualyoffset: 100, actuallayoutwidth: 80, actuallayoutheight: 30 });
  // Containers can be far taller than what they draw (live 2026-10-23: dead space above the graph), so
  // only drawn pieces count: the soul plates, not their 400 px .TeamNetworth container.
  Object.assign(byClass("TeamNetworth"), { actualxoffset: 780, actualyoffset: 100, actuallayoutwidth: 360, actuallayoutheight: 400 });
  Object.assign(panel("TeamScoreFriendly"), { actuallayoutwidth: 180, actuallayoutheight: 40 });
  Object.assign(panel("TeamScoreEnemy"), { actualxoffset: 180, actuallayoutwidth: 180, actuallayoutheight: 40 });
  // The charges box is 130 px tall (stock CSS); only the 30 px icon inside it is drawn (bottom 164).
  Object.assign(panel("RejuvenatorCharges"), { actualxoffset: 900, actualyoffset: 120, actuallayoutwidth: 120, actuallayoutheight: 130 });
  Object.assign(panel("RejuvenatorTimer"), { actualxoffset: 45, actuallayoutwidth: 30, actuallayoutheight: 130 });
  Object.assign(byClass("rejuvTimer"), { actualyoffset: 14, actuallayoutwidth: 30, actuallayoutheight: 30 });
  Object.assign(panel("MidbossTimerLabel"), { actualyoffset: 40, actuallayoutwidth: 30, actuallayoutheight: 18 });
  panel("MidbossTimerLabel").__text = "";
  // The stock rift HUD is collapsed until a rift opens.
  panel("KothCashInMeter").visible = false;
  // Stock CSS collapses #RejuvenatorTimer until .has_rejuv or .midboss_cooldown. Before it ever shows, its
  // children were never laid out: live (client 6819, sandbox, 2026-10-24) the graph read an Infinity bottom
  // ("[DLF-GRAPH] placed under Panel (bottom Infinity px)", then "Invalid value for property 'margin-top':
  // Infinitypx") and stayed at the top over the timers and soul plates. Collapsed again later, they keep
  // their old geometry (as a collapsed page's rows, HP Colors v3 2026-10-21).
  const rejuvBox = panel("RejuvenatorTimer");
  const unlaid = () => ({ x: Infinity, y: Infinity });
  rejuvBox.visible = false;
  for (const piece of [byClass("rejuvTimer"), panel("MidbossTimerLabel")]) piece.GetPositionWithinWindow = unlaid;
  const rejuvShown = (on) => {
    rejuvBox.visible = on;
    if (on) for (const piece of [byClass("rejuvTimer"), panel("MidbossTimerLabel")]) delete piece.GetPositionWithinWindow;
  };
  const context = createVmContext(harness);
  runInVm(stateRun, context, "dlf_state.js");
  runInVm(matchScript(JSON.parse(read("match.json"))), context, "dlf_match.js");
  const clock = panel("GameTime");
  const amber = panel("TeamScoreFriendly").FindChildrenWithClassTraverse("ScoreLabel")[0];
  const sapphire = panel("TeamScoreEnemy").FindChildrenWithClassTraverse("ScoreLabel")[0];
  const souls = (n) => `${(n / 1000).toFixed(1)}k`;
  let at = 0;
  // One HUD second per game second; lead(t) = Amber souls minus Sapphire souls.
  const play = (to, lead) => {
    for (; at <= to; at++) {
      clock.__text = mmss(at);
      amber.__text = souls(20000 + at * 30 + lead(at));
      sapphire.__text = `<font color="#8FB2FF">${souls(20000 + at * 30)}</font>`;
      harness.scheduler.runFor(1000);
    }
    at = to + 1;
  };
  const seek = (t) => { at = t; };
  const wait = (seconds) => harness.scheduler.runFor(seconds * 1000);
  const setGraph = (graph) => harness.root.SetAttributeString("dlf_match_state",
    JSON.stringify(Object.assign(JSON.parse(read("match.json")), { graph })));
  const root = () => panel("DLFSoulGraph");
  const text = (id) => panel(id).__text;
  // The pinned marks drawn (m:ss); the graph shows no time labels, so the script exposes them.
  const times = () => Array.from(hud.topBar.DLFSoulGraphPins(), mmss);
  const leader = () => ["DLFAmber", "DLFSapphire"].filter((cls) => panel("DLFGraphLead").BHasClass(cls)).join("");
  const drawn = (cls) => panel("DLFGraphDraw").Children().filter((child) => child.BHasClass(cls)).length;
  const boot = () => runInVm(graphRun(), context, "dlf_soul_graph.js");
  return { harness, hud, panel, root, text, times, drawn, play, seek, wait, setGraph, boot, clock, amber, sapphire,
    leader, rejuvShown, shown: () => root().BHasClass("DLFGraphShown") };
}

// Pause box (live in Observer HUD, client 6813, [OH-PAUSE] log 2026-10-23): the engine puts .Hidden on
// #PausedCountdownLabel while paused and takes it off each countdown second, while .PausedTextMoved (and
// gameIsPausedCountdown) stay on after the first countdown. DLF's CSS hid II on .PausedTextMoved, so the
// second pause drew an empty box. II now follows the countdown number's .Hidden.
check("pause: II shows on every pause and gives way to the countdown number, also on the second pause", () => {
  const pausedCss = read("panorama/styles/qollock/hud_paused.css") + read("panorama/styles/observer/hud_paused.css");
  assert.doesNotMatch(pausedCss, /PausedTextMoved[^{]*\{[^}]*visibility/, "no CSS hides II on the lingering .PausedTextMoved");
  const pausedXml = read("panorama/layout/hud_paused.xml");
  assert.match(pausedXml, /s2r:\/\/panorama\/scripts\/dlf\/dlf_pause\.vjs_c/, "hud_paused.xml includes dlf_pause.js");
  const harness = createPanoramaHarness();
  const root = instantiate(parseLayout(pausedXml), harness.root);
  harness.contextPanel = root;
  const context = createVmContext(harness);
  const game = root.FindChildTraverse("PausedGameContainer");
  const count = root.FindChildTraverse("PausedCountdownLabel");
  const label = root.FindChildTraverse("PausedLabel");
  count.classes = ["Hidden"];
  runInVm(script("dlf/dlf_pause.js"), context, "dlf_pause.js");
  const shows = () => label.style.visibility;
  const pauseOn = () => { game.RemoveClass("Hidden"); count.AddClass("Hidden"); count.__text = ""; harness.scheduler.runFor(300); };
  const countdown = (n) => { count.RemoveClass("Hidden"); count.__text = String(n); label.AddClass("PausedTextMoved"); harness.scheduler.runFor(300); };
  const resume = () => { game.AddClass("Hidden"); harness.scheduler.runFor(1200); };
  pauseOn();
  assert.equal(shows(), "visible", "first pause shows II");
  countdown(3);
  assert.equal(shows(), "collapse", "the countdown number replaces II");
  count.AddClass("Hidden"); // between countdown seconds the engine hides the number again
  harness.scheduler.runFor(300);
  assert.equal(shows(), "visible");
  countdown(1);
  resume();
  pauseOn(); // .PausedTextMoved is still on II
  assert.ok(label.BHasClass("PausedTextMoved"));
  assert.equal(shows(), "visible", "second pause shows II although .PausedTextMoved lingers");
  const writes = label.__styleWrites.filter((w) => w.property === "visibility").length;
  harness.scheduler.runFor(3000);
  assert.equal(label.__styleWrites.filter((w) => w.property === "visibility").length, writes, "a steady pause writes nothing");
  runInVm(script("dlf/dlf_pause.js"), context, "dlf_pause.js");
  harness.scheduler.runFor(2000);
  assert.equal(shows(), "visible", "a layout reload keeps working");
  assert.equal(harness.scheduler.jobs.length, 1, "a reload stops the previous loop");
});

// The stock net/FPS stats (HudPerfStatsBasics, core hud_perfstats_basics.css: top right, padding-top
// 8px, a hud.xml child) drew over the banner's BEST OF 3 in the user's 2026-10-24 screenshot.
check("banner: the stock net/FPS stats start under the 100 px banner", () => {
  const bannerCss = read("panorama/styles/dlf/dlf_banner.css");
  const height = Number(/#DLFBanner\s*\{[^}]*?\bheight:\s*(\d+)px/.exec(bannerCss)[1]);
  const hudCss = read("panorama/styles/hud.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = /(?:^|\})\s*CitadelHud HudPerfStatsBasics\s*\{([^}]*)\}/.exec(hudCss);
  assert.ok(rule, "styles/hud.css has a CitadelHud HudPerfStatsBasics rule (more specific than the stock one)");
  const margin = Number((/margin-top:\s*(\d+)px/.exec(rule[1]) || [])[1]);
  assert.ok(margin >= height, `margin-top ${margin}px clears the ${height}px banner`);
});

check("soul graph: layout, styles and script include; hidden over the scoreboard, shop and detail view", () => {
  const ids = ["DLFSoulGraph", "DLFGraphPlot", "DLFGraphZero", "DLFGraphDraw", "DLFGraphTitle", "DLFGraphLead"];
  for (const id of ids) assert.match(topBarXml, new RegExp(`id="${id}"`), `#${id} in citadel_hud_top_bar.xml`);
  // User 2026-10-23: no team name, time labels or soul axis values.
  for (const id of ["DLFGraphTop", "DLFGraphBottom", "DLFGraphLeader", "DLFGraphTime0"]) assert.doesNotMatch(topBarXml, new RegExp(`id="${id}"`));
  assert.match(topBarXml, /styles\/dlf\/dlf_soul_graph\.vcss_c/);
  const jsPad = Number(/const TOP_PAD = (\d+);/.exec(read("panorama/scripts/dlf/dlf_soul_graph.js"))[1]);
  assert.equal(jsPad, TOP_PAD, "dlf_soul_graph.js TOP_PAD = the top bar's padding-top in dlf_banner.css");
  const order = ["dlf_state", "dlf_match", "dlf_soul_graph"].map((name) => topBarXml.indexOf(`scripts/dlf/${name}.vjs_c`));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])), "state, match, then the graph");
  const css = read("panorama/styles/dlf/dlf_soul_graph.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const hidden = [...css.matchAll(/([^{}]+)\{[^}]*visibility:\s*collapse;[^}]*\}/g)].flatMap(([, s]) => s.split(",").map((x) => x.trim()));
  for (const state of [".gScoreboardOpen", ".gShopOpen", ".gDetailView"]) assert.ok(hidden.includes(`${state} #DLFSoulGraph`), `${state} hides the graph`);
  assert.doesNotMatch(css, /box-shadow|clip-path/);
  for (const [, value] of css.matchAll(/transition-property:\s*([^;]+);/g)) assert.equal(value.trim(), "opacity", "only opacity transitions");
});

// User 2026-10-24: the first mark at 10:00 and the next ones every 5:00, both editable (FIRST MARK AT, THEN EVERY).
check("soul graph: the first pin at 10:00, then one every 5:00, from the stock soul plates, Amber lead up; shown 30 s, then hidden", () => {
  const g = graphWorld();
  g.boot();
  g.play(330, (t) => t * 10);
  assert.ok(!g.shown(), "no mark at 5:00 by default");
  g.play(599, (t) => t * 10);
  assert.ok(!g.shown(), "no graph before the first mark");
  g.play(600, (t) => t * 10);
  assert.ok(g.shown(), "0:00 and 10:00 give two pins: the graph shows at the first mark");
  deq([g.text("DLFGraphTitle"), g.text("DLFGraphLead"), g.leader()], ["SOUL LEAD", "+6.0k", "DLFAmber"]);
  assert.deepEqual(g.times(), ["0:00", "10:00"]);
  assert.ok(g.drawn("DLFGraphSeg") > 20, "the line is drawn");
  assert.ok(g.drawn("DLFGraphFillUp") > 0 && g.drawn("DLFGraphFillDown") === 0, "Amber area only");
  assert.equal(g.drawn("DLFGraphPinLast"), 1, "the latest pin is marked");
  // Placement: centred under the clock (180 px wide), 6 px under the lowest drawn centre panel. With the
  // stock #RejuvenatorTimer collapsed (no rejuvenator, boss alive) and its icon never laid out, that is
  // the soul plates (end 140), never the Infinity of the unlaid icon nor the 130 px charges box (284).
  // margin-top counts from under the top bar's 68 px padding (the banner's room), not from its top.
  deq([g.root().style.marginLeft, g.root().style.marginTop], [`${960 - 90}px`, graphTop(140)], "placed under the soul plates");
  // The stock rejuvenator icon and mid-boss label are faded (opacity 0, as Observer HUD; QOLLOCK's
  // #RejuvHUD and #RejuvBuff show the same times), so they no longer push it down.
  g.rejuvShown(true);
  g.panel("MidbossTimerLabel").__text = "6:59";
  g.play(601, (t) => t * 10);
  assert.equal(g.root().style.marginTop, graphTop(140), "the faded stock timer and label do not count");
  // QOLLOCK's urn tracker under the soul plates counts while shown.
  const urn = new MockPanel("Panel", g.hud.topBar.FindChildrenWithClassTraverse("TeamNetworth")[0], "UrnTracker");
  Object.assign(urn, { actualyoffset: 60, actuallayoutwidth: 120, actuallayoutheight: 18 });
  urn.AddClass("show");
  g.play(604, (t) => t * 10);
  assert.equal(g.root().style.marginTop, graphTop(178), "urn tracker ends at 178");
  // QOLLOCK's held-buff time (#RejuvBuff, 50 x 20 at y 100 under the padding) counts while it pops out.
  const buff = g.panel("RejuvBuff");
  Object.assign(buff, { actualxoffset: 935, actualyoffset: 168, actuallayoutwidth: 50, actuallayoutheight: 20 });
  buff.AddClass("pop-out");
  g.play(605, (t) => t * 10);
  assert.equal(g.root().style.marginTop, graphTop(188), "held-buff time ends at 188");
  buff.RemoveClass("pop-out");
  urn.RemoveClass("show");
  g.rejuvShown(false);
  g.play(607, (t) => t * 10);
  assert.equal(g.root().style.marginTop, graphTop(140), "back under the plates");
  assert.ok(!g.harness.logs.some((line) => /tick error/.test(line)), `no tick error: ${g.harness.logs.filter((l) => /error/.test(l)).join(" | ")}`);
  assert.ok(g.harness.logs.some((line) => line.startsWith("[DLF-GRAPH] placed under")), "placement is logged on change");
  g.play(629, (t) => t * 10);
  assert.ok(g.shown(), "still shown 29 s after the mark");
  g.play(632, (t) => t * 10);
  assert.ok(!g.shown(), "hidden after 30 s");
  // Sapphire takes the lead by 15:00, the next mark 5:00 later.
  g.play(899, (t) => 6000 - (t - 600) * 30);
  assert.ok(!g.shown(), "nothing between the marks");
  g.play(900, (t) => 6000 - (t - 600) * 30);
  assert.ok(g.shown());
  deq([g.text("DLFGraphLead"), g.leader()], ["+3.0k", "DLFSapphire"]);
  assert.deepEqual(g.times(), ["0:00", "10:00", "15:00"]);
  assert.ok(g.drawn("DLFGraphFillUp") > 0 && g.drawn("DLFGraphFillDown") > 0, "both teams' areas");
  for (const child of g.panel("DLFGraphDraw").Children()) {
    for (const key of ["marginLeft", "marginTop", "width", "height"]) {
      if (child.style[key] !== undefined) assert.match(child.style[key], /^-?\d+(\.\d)?px$/, `${key} ${child.style[key]}`);
    }
  }
});

check("soul graph: with no clock geometry (never laid out or collapsed) it hides instead of sitting at the top", () => {
  const g = graphWorld();
  const clockBox = g.hud.topBar.FindChildrenWithClassTraverse("GameClock")[0];
  clockBox.GetPositionWithinWindow = () => ({ x: Infinity, y: Infinity });
  g.boot();
  g.play(600, (t) => t * 10);
  assert.ok(!g.shown(), "not shown at the mark without a clock to centre on");
  deq([g.root().style.marginLeft, g.root().style.marginTop], [undefined, undefined], "nothing written");
  delete clockBox.GetPositionWithinWindow;
  g.play(601, (t) => t * 10);
  assert.ok(g.shown(), "shown once the clock is laid out");
  assert.equal(g.root().style.marginTop, graphTop(140));
  clockBox.visible = false; // stock: pre-game wait, hideout, waiting for a HUD update
  g.play(602, (t) => t * 10);
  assert.ok(!g.shown(), "hidden while the clock is collapsed");
  assert.ok(!g.harness.logs.some((line) => /tick error/.test(line)), "no tick error");
});

// The stock #RejuvenatorCharges shows a team's held charges as a 70 x 40 .rejuvIcon at the bottom of its
// 130 px box (margin-bottom 5) once #RejuvenatorFriendly/#RejuvenatorEnemy gets RejuvCount_N, together
// with .has_rejuv on #RejuvenatorTimer (live 2026-10-22, both for the buff's 180 s); the icon panels are
// laid out (empty) without it. The user's screenshot (2026-10-24, old build) showed the icon between
// the soul plates, under the urn row, where the graph would go.
check("soul graph: held rejuvenator charges (RejuvCount_N) push it down; empty charge icons do not", () => {
  const g = graphWorld();
  const friendly = g.panel("RejuvenatorFriendly");
  Object.assign(friendly, { actualxoffset: 0, actuallayoutwidth: 70, actuallayoutheight: 130 });
  Object.assign(friendly.FindChildrenWithClassTraverse("rejuvIcon")[0], { actualyoffset: 85, actuallayoutwidth: 70, actuallayoutheight: 40 });
  g.boot();
  g.play(600, (t) => t * 10);
  assert.equal(g.root().style.marginTop, graphTop(140), "no charges: under the plates");
  g.rejuvShown(true);
  friendly.AddClass("RejuvCount_2");
  g.play(601, (t) => t * 10);
  assert.equal(g.root().style.marginTop, graphTop(245), "Amber's two charges (icon ends at 120 + 85 + 40)");
  friendly.RemoveClass("RejuvCount_2");
  g.play(602, (t) => t * 10);
  assert.equal(g.root().style.marginTop, graphTop(140), "charges used: the faded stock icon does not count");
  g.rejuvShown(false);
  g.play(603, (t) => t * 10);
  assert.equal(g.root().style.marginTop, graphTop(140), "back under the plates");
});

// As Observer HUD (SPEC "Stock panels moved while spectating", designs 19/20; user 2026-10-24 "be like the
// observer hud more"): the stock rift HUD (#KothCashInMeter, a top-bar child: margin-top 110 under the
// padding, 120 in range) moves 24 px under the timers (4 until 2026-10-24, user: lower); the stock objective
// health (#objectives_health_friendly in hud.xml gameplay_hud; a walker's bar 160 px under the panel's top,
// the mid-boss row 140) moves so its highest shown bar sits 4 px under the rift HUD or 24 px under the
// timers; the graph goes 6 px (plus its y, default 35) under whichever shows
// last (the rift HUD at any size) and waits while both show, its running show window starting over.
// Ways it can fail: the margin read back after its own write (oscillation), the banner padding counted as
// rift HUD margin, inactive or tier-1 bars counted, a CSS !important keeping the inline margin out, the
// graph sitting on the bars, rewrites while nothing moves.
const OBJ_CSS_MARGIN = Number(/#objectives_health_friendly\s*\{[^}]*margin-top:\s*(-?\d+)px/.exec(read("panorama/styles/hud.css"))[1]);
function centreWorld(g) {
  // The mock does not lay out: a panel's top is its natural top plus the margin in force.
  const koth = g.panel("KothCashInMeter");
  const kothMargin = () => (koth.style.marginTop === undefined || koth.style.marginTop === null
    ? (koth.BHasClass("in_range") ? 120 : 110) : Number.parseFloat(koth.style.marginTop));
  Object.defineProperty(koth, "actualyoffset", { configurable: true, get: () => TOP_PAD + kothMargin() });
  Object.assign(koth, { visible: false, actualxoffset: 848, actuallayoutwidth: 224, actuallayoutheight: 80 });
  const gameplay = new MockPanel("Panel", g.harness.root, "gameplay_hud");
  const panel = new MockPanel("Panel", gameplay, "objectives_health_friendly");
  Object.defineProperty(panel, "actualyoffset", { configurable: true,
    get: () => (panel.style.marginTop === undefined || panel.style.marginTop === null ? OBJ_CSS_MARGIN : Number.parseFloat(panel.style.marginTop)) });
  Object.assign(panel, { actuallayoutwidth: 1300, actuallayoutheight: 300 });
  const objective = (cls, y, h) => {
    const o = new MockPanel("Panel", panel, "");
    o.classes = ["objective", ...cls];
    Object.assign(o, { actualyoffset: y, actuallayoutwidth: 400, actuallayoutheight: h });
    return o;
  };
  return { koth, panel, amber: objective(["is_tier2"], 160, 75), boss: objective(["boss"], 140, 70), tier1: objective(["is_tier1", "is_active"], 120, 75) };
}
check("rift HUD and objective health (as Observer HUD): rift HUD under the timers, bars under it, the graph under whichever shows last", () => {
  const hudCss = read("panorama/styles/hud.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(hudCss, /objectives_health_friendly\s*\{[^}]*!important/, "no !important on the objective health margin (the inline margin must win)");
  const g = graphWorld();
  const c = centreWorld(g);
  g.boot();
  g.setGraph({ show: -1 });
  g.play(600, (t) => t * 10);
  assert.equal(g.root().style.marginTop, graphTop(140), "nothing shown: under the plates (a tier-1 bar does not count)");
  assert.equal(c.panel.style.marginTop, `${164 - 160}px`, "placed while no bar shows, so a walker bar appears 24 px under the timers");
  c.amber.AddClass("is_active");
  g.play(602, (t) => t * 10);
  assert.equal(c.panel.style.marginTop, `${164 - 160}px`);
  assert.equal(g.root().style.marginTop, graphTop(239), "the graph 6 px under the walker bar (164 + 75)");
  // The rift opens: the rift HUD goes 24 px under the timers, the bar 4 px under it, the graph waits.
  c.koth.visible = true;
  g.play(604, (t) => t * 10);
  assert.equal(c.koth.style.marginTop, `${164 - TOP_PAD}px`, "rift HUD top at 164 (its margin counts under the 68 px padding)");
  assert.equal(c.panel.style.marginTop, `${248 - 160}px`, "the bar 4 px under the rift HUD (164 + 80)");
  assert.ok(!g.shown(), "the graph waits while the rift HUD and a bar both show");
  // In range the stock rift HUD is 100% (320 x 114): still under the timers, the bar under it.
  c.koth.AddClass("in_range");
  c.koth.actuallayoutheight = 114;
  g.play(606, (t) => t * 10);
  assert.equal(c.koth.style.marginTop, `${164 - TOP_PAD}px`);
  assert.equal(c.panel.style.marginTop, `${282 - 160}px`, "the bar 4 px under the taller rift HUD");
  c.amber.RemoveClass("is_active");
  g.play(608, (t) => t * 10);
  assert.ok(g.shown(), "no bar: back");
  assert.equal(g.root().style.marginTop, graphTop(278), "the graph under the rift HUD at any size (164 + 114)");
  c.koth.visible = false;
  c.boss.AddClass("is_active");
  g.play(610, (t) => t * 10);
  assert.equal(c.panel.style.marginTop, `${164 - 140}px`, "the mid-boss row (140 under the panel's top) at 164");
  assert.equal(g.root().style.marginTop, graphTop(234), "the graph under the mid-boss row (164 + 70)");
  const writes = c.panel.__styleWrites.length + c.koth.__styleWrites.length;
  g.play(630, (t) => t * 10);
  assert.equal(c.panel.__styleWrites.length + c.koth.__styleWrites.length, writes, "steady: no rewrites");
  assert.ok(!g.harness.logs.some((line) => /tick error/.test(line)), `no tick error: ${g.harness.logs.join(" | ")}`);
});
check("rift HUD and objective health: a graph shown for a while waits while both show and then gets its full time", () => {
  const g = graphWorld();
  const c = centreWorld(g);
  g.boot();
  g.play(600, (t) => t * 10);
  assert.ok(g.shown(), "shown at the 10:00 mark (30 s)");
  c.amber.AddClass("is_active");
  c.koth.visible = true;
  g.play(620, (t) => t * 10);
  assert.ok(!g.shown(), "waiting");
  c.koth.visible = false;
  g.play(621, (t) => t * 10);
  assert.ok(g.shown(), "back once the rift HUD closes");
  g.play(649, (t) => t * 10);
  assert.ok(g.shown(), "its show window started over: still shown 28 s later");
  g.play(653, (t) => t * 10);
  assert.ok(!g.shown(), "then hidden");
});

// User 2026-10-25 (two screenshots, scoreboard open): the stock team kills row (.KillsAndAbilityPointsContainer,
// shown by stock CSS under .wants_scoreboard) sat in the middle of the screen between the cards, because
// QOLLOCK's citadel_hud_top_bar.css puts it 250 px down. It now goes TIMERS_GAP (24) under the centre
// column, in the graph's place (the graph hides under the scoreboard), and moves with the column: held
// charges, the rift HUD. Ways it can fail: left at 250 px; placed only while the graph shows; measured from
// the banner padding (68 px low); the graph's y offset applied; rewritten every tick.
check("scoreboard: the stock kills row sits under the centre column, not mid-screen", () => {
  const g = graphWorld();
  const c = centreWorld(g);
  const kills = g.hud.topBar.FindChildrenWithClassTraverse("KillsAndAbilityPointsContainer")[0];
  assert.ok(kills, "the stock kills row is in DLF's top bar layout");
  const top = (bottom) => `${bottom + 24 - TOP_PAD}px`;
  g.boot();
  g.setGraph({ show: 0, y: 100 });
  g.play(600, (t) => t * 10);
  assert.equal(kills.style.marginTop, top(140), "under the soul plates, with the graph off and its y offset ignored");
  const friendly = g.panel("RejuvenatorFriendly");
  Object.assign(friendly, { actualxoffset: 0, actuallayoutwidth: 70, actuallayoutheight: 130 });
  Object.assign(friendly.FindChildrenWithClassTraverse("rejuvIcon")[0], { actualyoffset: 85, actuallayoutwidth: 70, actuallayoutheight: 40 });
  g.rejuvShown(true);
  friendly.AddClass("RejuvCount_1");
  g.play(601, (t) => t * 10);
  assert.equal(kills.style.marginTop, top(245), "under a held charge icon");
  friendly.RemoveClass("RejuvCount_1");
  g.rejuvShown(false);
  c.koth.visible = true;
  g.play(605, (t) => t * 10);
  // The rift HUD goes 24 px under the plates (164) and is 80 px tall; the kills row 4 px under it.
  assert.equal(kills.style.marginTop, `${164 + 80 + 4 - TOP_PAD}px`, "under the rift HUD while it shows");
  c.koth.visible = false;
  g.play(606, (t) => t * 10);
  const writes = kills.__styleWrites.length;
  g.play(640, (t) => t * 10);
  assert.equal(kills.style.marginTop, top(140));
  assert.equal(kills.__styleWrites.length, writes, "a steady column writes nothing");
});

// QOLLOCK's objectives map disc (#ObjectivesMap, a top-bar child; objectives_map.css: 100 px at ui-scale
// 70 %, margin-top 35, centred under the clock). Hidden 2026-10-24 (the user's pick in designs/overlap-fix.html,
// it sat over the soul plates' inner ends), shown again at the user's request 2026-10-25 (screenshot: the disc
// between the plates, the soul lead % and rift rows beside it). Ways it can fail: still collapsed; the graph,
// the scoreboard kills row, the rift HUD or the objective health drawn over it (it is now one of the timers
// they go under); a collapsed or never-laid-out disc still counted.
check("objectives map disc: shown again; the graph, rift HUD and kills row go under it", () => {
  const css = read("panorama/styles/objectives_map.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = /(?:^|\})\s*#ObjectivesMap\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule, "the #ObjectivesMap rule");
  assert.doesNotMatch(rule[1], /visibility:\s*collapse/, "the disc is not hidden");
  assert.match(css, /\.gamemode_streetbrawl #ObjectivesMap\s*\{[^}]*visibility:\s*collapse;/, "street brawl still hides it (stock)");
  const g = graphWorld();
  const c = centreWorld(g);
  const disc = g.panel("ObjectivesMap");
  // Centred under the clock, from the top bar's 103 (68 padding + 35) to 173 (70 px tall at 70 %).
  Object.assign(disc, { actualxoffset: 925, actualyoffset: 103, actuallayoutwidth: 70, actuallayoutheight: 70 });
  const kills = g.hud.topBar.FindChildrenWithClassTraverse("KillsAndAbilityPointsContainer")[0];
  g.boot();
  g.setGraph({ show: -1 });
  g.play(600, (t) => t * 10);
  assert.equal(g.root().style.marginTop, graphTop(173), "the graph under the disc, not on it");
  assert.equal(kills.style.marginTop, `${173 + 24 - TOP_PAD}px`, "the kills row under the disc");
  c.koth.visible = true;
  g.play(605, (t) => t * 10);
  assert.equal(c.koth.style.marginTop, `${173 + 24 - TOP_PAD}px`, "the rift HUD under the disc");
  c.koth.visible = false;
  disc.visible = false; // street brawl / obj_map_disabled
  g.play(610, (t) => t * 10);
  assert.equal(g.root().style.marginTop, graphTop(140), "a hidden disc does not count");
});

// Feeding the disc (user 2026-10-25: "the disc is not even updating", then "when the replay is rewound the
// destroyed objectives should come back"). client.dll 6819: the disc only gets its masks from the server's
// answer to getobjectivemap, which only a connecting player sends (ENGINE.md). Its SetObjectivesMask event
// is not reachable from script (live 07:55: "Invalid event name to DispatchEvent ('SetObjectivesMask')"),
// so DLF sets the .Alive class on the disc's icons itself (stock objectives_map.xml: #Team1Core,
// #Team1Titan, #Team1Tier1_1-4, #Team1Tier2_1-4, the same for Team2), every second, so a repaint by the
// engine from its own stale mask is undone. Source: the minimap. Each living objective has a
// .map_button.boss marker with .team1/.team2, a lane colour (.yellowLane .greenLane .blueLane .purpleLane =
// lanes 1-4, hud_minimap.css order) and its tier (.boss_icon_t1 guardian = Tier1, .boss_icon_t2 walker =
// Tier2, .boss_icon_t3 patron = Core and Titan). A destroyed objective loses its marker; a demo rewound
// past its death gets it back. Ways it can fail: an all-dead disc before the minimap has markers; wrong
// icon for a tier or lane; a marker without a team or lane counted; an engine repaint left standing; a
// rewind not lighting the icon again; classes rewritten every tick; the dead DispatchEvent still called.
function objmapWorld() {
  const harness = createPanoramaHarness();
  const hud = buildHud(harness, { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE });
  const minimap = new MockPanel("Panel", harness.root, "hud_minimap");
  // The disc's own layout, as the engine loads it into #ObjectivesMap (stock objectives_map.xml).
  const disc = hud.topBar.FindChildTraverse("ObjectivesMap");
  const icons = new MockPanel("Panel", new MockPanel("Panel", disc, ""), "");
  const ids = [];
  for (const t of [1, 2]) for (const s of ["Core", "Titan", "Tier2_1", "Tier2_2", "Tier2_3", "Tier2_4", "Tier1_1", "Tier1_2", "Tier1_3", "Tier1_4"]) {
    const icon = new MockPanel("Panel", icons, `Team${t}${s}`);
    icon.classes = ["Icon", `Team${t}`];
    ids.push(icon.id);
  }
  const sent = [];
  const context = createVmContext(harness, { globals: { $: Object.assign({}, harness.$, {
    GetContextPanel: () => hud.topBar,
    DispatchEvent: (name) => { sent.push(name); }
  }) } });
  runInVm(stateRun, context, "dlf_state.js");
  const marker = (cls) => {
    const m = new MockPanel("Panel", minimap, "");
    m.classes = ["map_button", "boss"].concat(cls.split(" "));
    return m;
  };
  // A full set for one team: guardians, walkers and base guardians on the three lanes, the patron, two shrines.
  const team = (t) => {
    const out = {};
    for (const lane of ["yellowLane", "blueLane", "purpleLane"]) {
      out[`t1 ${lane}`] = marker(`team${t} ${lane} boss_icon_t1`);
      out[`t2 ${lane}`] = marker(`team${t} ${lane} boss_icon_t2`);
      out[`barracks ${lane}`] = marker(`team${t} ${lane} boss_barracks_icon`);
    }
    out.t3 = marker(`team${t} boss_icon_t3`);
    out.shrine1 = marker(`team${t} boss_buildingzip`);
    out.shrine2 = marker(`team${t} boss_buildingzip`);
    return out;
  };
  const boot = () => runInVm(script("dlf/dlf_objmap.js"), context, "dlf_objmap.js");
  const alive = () => ids.filter((id) => disc.FindChildTraverse(id).BHasClass("Alive"));
  const icon = (id) => disc.FindChildTraverse(id);
  return { harness, hud, minimap, marker, team, boot, sent, alive, icon, advance: (ms) => harness.scheduler.runFor(ms, 1e6) };
}

check("objectives map disc: icons follow the minimap's objective markers, undo engine repaints and come back on a rewind", () => {
  assert.match(topBarXml, /scripts\/dlf\/dlf_objmap\.vjs_c/);
  const w = objmapWorld();
  w.icon("Team1Tier1_1").AddClass("Alive"); // the engine's own (stale) state
  w.boot();
  w.advance(3000);
  deqA(w.alive(), ["Team1Tier1_1"], "no markers yet: the disc is left alone (not all dead)");
  const amber = w.team(1);
  const sapphire = w.team(2);
  w.marker("boss_icon_t1 yellowLane"); // no team: ignored
  w.advance(1100);
  // Three lanes: yellow 1, blue 3, purple 4 (lane 2, green, is the disc's hidden ThreeLane slot).
  const lit = (t) => ["Core", "Titan", "Tier2_1", "Tier2_3", "Tier2_4", "Tier1_1", "Tier1_3", "Tier1_4"].map((s) => `Team${t}${s}`);
  deqA(w.alive(), lit(1).concat(lit(2)), "every living objective lit");
  // Sapphire's yellow guardian and Amber's purple walker fall.
  sapphire["t1 yellowLane"].DeleteAsync();
  amber["t2 purpleLane"].DeleteAsync();
  w.advance(1100);
  deqA(w.alive(), lit(1).filter((id) => id !== "Team1Tier2_4").concat(lit(2).filter((id) => id !== "Team2Tier1_1")), "destroyed objectives go dark");
  // The engine repaints from its stale mask: undone within a second.
  w.icon("Team2Tier1_1").AddClass("Alive");
  w.advance(1100);
  assert.ok(!w.icon("Team2Tier1_1").BHasClass("Alive"), "an engine repaint is undone");
  const writes = () => w.harness.operationCounts.classWrites || 0;
  const before = writes();
  w.advance(10000);
  assert.equal(writes(), before, "steady state writes no classes");
  // A demo rewound past the guardian's death: its marker is back, so is its icon.
  w.marker("team2 yellowLane boss_icon_t1");
  w.advance(1100);
  assert.ok(w.icon("Team2Tier1_1").BHasClass("Alive"), "rewound: the guardian is back");
  // A green-lane (lane 2) guardian lights Tier1_2.
  w.marker("team1 greenLane boss_icon_t1");
  w.advance(1100);
  assert.ok(w.icon("Team1Tier1_2").BHasClass("Alive"), "green lane is lane 2");
  deqA(w.sent.filter((name) => name === "SetObjectivesMask"), [], "the script-unreachable event is not used");
  assert.ok(!w.harness.logs.some((line) => /error/i.test(line)), w.harness.logs.join(" | "));
});

check("soul graph: settings from the menu (show, marks, size, offsets, line, fill) apply; each change previews", () => {
  const g = graphWorld();
  g.boot();
  g.play(30, () => 500);
  assert.ok(!g.shown());
  // A change previews the graph for a few seconds, with sample data before the first marks.
  g.setGraph({ size: 120, x: 50, y: 20, line: "gold", fill: false });
  g.wait(1);
  assert.ok(g.shown() && g.root().BHasClass("DLFGraphPreview"), "preview with sample data");
  assert.equal(g.text("DLFGraphTitle"), "PREVIEW");
  // Size lays the graph out larger (sizes, fonts, line) instead of scaling a bitmap: a transform scale
  // drew blurry low-res text live (2026-10-23).
  assert.equal(g.root().style.preTransformScale2d, undefined, "no bitmap scaling");
  deq([g.root().style.width, g.root().style.height, g.panel("DLFGraphPlot").style.height], ["216px", "79.2px", "55.2px"]);
  deq([g.panel("DLFGraphTitle").style.fontSize, g.panel("DLFGraphLead").style.fontSize], ["10.8px", "16.8px"]);
  assert.ok(g.panel("DLFGraphDraw").Children().filter((c) => c.BHasClass("DLFGraphSeg")).every((c) => c.style.height === "3.6px"),
    "the line is drawn 20% thicker");
  // Under the soul plates (140; #RejuvenatorTimer is collapsed) + GAP 6 + the y offset 20.
  deq([g.root().style.marginLeft, g.root().style.marginTop], [`${960 - 108 + 50}px`, graphTop(140, 20)], "still centred on the clock");
  assert.ok(g.root().BHasClass("DLFGraphLineGold") && !g.root().BHasClass("DLFGraphLineGreen"));
  assert.ok(g.root().BHasClass("DLFGraphNoFill"));
  g.wait(9);
  assert.ok(!g.shown(), "the preview ends");
  // FIRST MARK AT 2 MIN, then every minute; ALWAYS keeps it up between marks; OFF hides it, also from previews.
  g.setGraph({ first: 120, every: 60, show: -1 });
  g.play(119, (t) => t * 5);
  assert.ok(!g.shown() || g.root().BHasClass("DLFGraphPreview"), "no mark before the first");
  g.play(245, (t) => t * 5);
  assert.ok(g.shown() && !g.root().BHasClass("DLFGraphPreview"));
  assert.deepEqual(g.times(), ["0:00", "2:00", "3:00", "4:00"], "the first mark, then one every minute");
  // FIRST MARK AT 5 MIN with THEN EVERY 5 MIN is the old cadence; samples on the old 1:00 marks stay line points.
  g.setGraph({ first: 300, every: 300, show: -1 });
  g.play(605, (t) => t * 5);
  assert.deepEqual(g.times(), ["0:00", "5:00", "10:00"]);
  g.setGraph({ first: 120, every: 60, show: 0 });
  g.play(665, (t) => t * 5);
  assert.ok(!g.shown(), "OFF: no graph at marks or as a preview");
  // Invalid values fall back to the defaults field by field.
  g.setGraph({ show: 45, first: 450, every: 90, size: 155, x: 7, y: -50, line: "pink", fill: "yes" });
  g.wait(2);
  assert.equal(g.root().style.width, "180px", "an invalid size falls back to 100%");
  assert.ok(g.root().BHasClass("DLFGraphLineGreen") && !g.root().BHasClass("DLFGraphNoFill"));
  // Match files take the same graph block, checked with the runtime's limits.
  const good = JSON.parse(read("match.json"));
  parseMatch(JSON.stringify(Object.assign({}, good, { graph: { show: -1, first: 300, every: 120, size: 90, x: -20, y: 15, line: "cyan", fill: false } })));
  for (const graph of [{ show: 45 }, { first: 450 }, { first: "600" }, { every: 90 }, { size: 75 }, { x: 305 }, { y: 3 }, { line: "pink" }, { fill: 1 }, { colour: 1 }]) {
    assert.throws(() => parseMatch(JSON.stringify(Object.assign({}, good, { graph }))), /match file:/, JSON.stringify(graph));
  }
});

check("soul graph: a demo seek drops later samples; a late join never draws over missing time", () => {
  const g = graphWorld();
  g.boot();
  g.setGraph({ show: -1 });
  g.play(910, (t) => t * 10);
  assert.deepEqual(g.times(), ["0:00", "10:00", "15:00"]);
  g.seek(700);
  g.play(710, (t) => -t * 10);
  assert.deepEqual(g.times(), ["0:00", "10:00"], "the 15:00 pin after the seek point is gone");
  g.play(905, (t) => -t * 10);
  assert.deepEqual(g.times(), ["0:00", "10:00", "15:00"]);
  assert.equal(g.leader(), "DLFSapphire", "the new 15:00 pin uses the replayed lead");
  const late = graphWorld();
  late.boot();
  late.setGraph({ show: -1 });
  late.seek(720);
  late.play(905, () => 2000);
  assert.ok(!late.shown() || late.root().BHasClass("DLFGraphPreview"), "one pin (15:00) is not a graph");
  late.play(1205, () => 2000);
  assert.ok(late.shown());
  assert.deepEqual(late.times(), ["15:00", "20:00"], "starts at the first mark seen, not 0:00");
});

check("soul graph: unreadable plates draw nothing; reloads keep one loop; steady state writes nothing and stays cheap", () => {
  const g = graphWorld();
  g.boot();
  g.boot();
  g.wait(2);
  assert.equal(g.harness.scheduler.jobs.length, 1, "one loop after a reload (the old one stops at its next tick)");
  g.clock.__text = "5:00";
  g.amber.__text = "-";
  g.sapphire.__text = "";
  g.wait(3);
  assert.ok(!g.shown());
  g.clock.__text = "";
  g.wait(2);
  assert.ok(!g.shown());
  g.setGraph({ show: -1 });
  g.seek(0);
  g.play(605, (t) => t * 4);
  g.wait(10);
  const counts = g.harness.operationCounts;
  const before = { text: counts.textWrites || 0, style: counts.styleWrites || 0, cls: counts.classWrites || 0, created: g.harness.createPanelCount };
  for (const key of Object.keys(counts)) if (!["textWrites", "styleWrites", "classWrites"].includes(key)) counts[key] = 0;
  // As the steady-state check: GetPositionWithinWindow is one engine call, not its mock parent walk.
  let positions = 0;
  const position = MockPanel.prototype.GetPositionWithinWindow;
  MockPanel.prototype.GetPositionWithinWindow = function () {
    positions++;
    const { parentReads = 0, boundaryValidityCalls = 0 } = counts;
    const result = position.call(this);
    Object.assign(counts, { parentReads, boundaryValidityCalls });
    return result;
  };
  try { g.wait(10); } finally { MockPanel.prototype.GetPositionWithinWindow = position; }
  counts.positions = positions;
  deq([counts.textWrites || 0, counts.styleWrites || 0, counts.classWrites || 0, g.harness.createPanelCount],
    [before.text, before.style, before.cls, before.created], "a shown graph with no new data writes nothing");
  const skip = ["traversal", "findTraversals", "classTraversalNodes", "textWrites", "styleWrites", "classWrites"];
  const reads = Object.fromEntries(Object.entries(counts).filter(([key, value]) => value && !skip.includes(key)));
  const ops = Object.values(reads).reduce((sum, value) => sum + value, 0) / 10;
  console.log(`   soul graph shown ${ops.toFixed(1)}/s ${JSON.stringify(reads)}`);
  results.soulGraphBudget = { shownOpsPerSecond: ops };
  assert.ok(ops <= 40, `soul graph budget while shown: ${ops}/s`);
});

// ---------------------------------------------------------------- minor ports from Observer HUD (2026-10-24)
// RESET. Ways this can fail: one stray click wipes the setup (it asks twice); the second press comes long
// after the first; an armed press carries over to another page or to the other button; RESET <page>
// touches other pages; RESET ALL stops repairing the setup.
check("ESC menu RESET: a second press within 4 s confirms; RESET ALL and RESET <page> put back only what they own", () => {
  const aliased = record(JSON.stringify({ s: 1, season: 2, match: 57, aliases: { "100": "Kush Alias" } }));
  const g = launch(profileWith({ [STORE_KEY]: aliased }));
  g.advance(3000);
  g.click("DLFMenuButton");
  const state = () => JSON.parse(g.hud.topBar.parent.parent.GetAttributeString("dlf_match_state", ""));
  const all = () => g.panel("DLFMenuResetLabel").__text;
  const part = () => g.panel("DLFMenuResetPageLabel").__text;
  const press = (id) => g.click(id);
  assert.deepEqual([all(), part()], ["RESET ALL", "RESET MATCH"]);
  g.click("DLFSeasonUp");
  g.click("DLFGraphToggle");
  g.click("DLFGraphFill");
  g.click("DLFGraphSizeUp");
  g.click("DLFMatchToggle");
  assert.equal(state().season, 3);

  // One press only asks, and the question lapses after 4 s.
  press("DLFMenuReset");
  assert.equal(state().season, 3, "one press changes nothing");
  assert.equal(all(), "AGAIN TO RESET ALL");
  g.advance(4200);
  assert.equal(all(), "RESET ALL", "the question lapses");
  press("DLFMenuReset");
  assert.equal(state().season, 3, "a press after the lapse only asks again");
  g.advance(1000);
  press("DLFMenuReset");
  assert.deepEqual([state().season, state().graph.fill, state().aliases], [2, true, {}], "the second press within 4 s restores everything");
  assert.equal(all(), "RESET ALL");

  // RESET <page>: the label names the page; only that page's settings go back.
  g.click("DLFSeasonUp");
  g.click("DLFAmberScoreUp");
  g.click("DLFGraphToggle");
  g.click("DLFGraphFill");
  g.click("DLFGraphSizeUp");
  assert.equal(part(), "RESET SOUL GRAPH");
  press("DLFMenuResetPage");
  assert.equal(part(), "AGAIN TO RESET SOUL GRAPH");
  assert.deepEqual([state().graph.fill, state().graph.size], [false, 110], "one press changes nothing");
  g.click("DLFStyleToggle");
  assert.equal(part(), "RESET STYLE", "a page change drops the question");
  g.click("DLFGraphToggle");
  press("DLFMenuResetPage");
  g.advance(500);
  press("DLFMenuResetPage");
  assert.deepEqual([state().graph.fill, state().graph.size, state().season, state().amber.score], [true, 100, 3, 1],
    "the graph is back, the match is not touched");
  press("DLFMenuResetPage");
  press("DLFMenuReset");
  assert.equal(part(), "RESET SOUL GRAPH", "arming ALL drops the page question");
  assert.equal(state().season, 3);
  g.advance(4200);

  g.click("DLFMatchToggle");
  press("DLFMenuResetPage");
  press("DLFMenuResetPage");
  assert.deepEqual([state().season, state().amber.score], [2, 0], "MATCH: season and scores go back");
  g.click("DLFTeamsToggle");
  g.type("DLFAmberNameEntry", "TEAM X");
  press("DLFMenuResetPage");
  press("DLFMenuResetPage");
  assert.equal(state().amber.name, "VENOM", "TEAMS: the name goes back");
  g.click("DLFStyleToggle");
  g.click("DLFStyleSizeUp");
  assert.notDeepEqual(state().style, JSON.parse(JSON.stringify(fitState.defaults().style)));
  press("DLFMenuResetPage");
  press("DLFMenuResetPage");
  assert.deepEqual(state().style, JSON.parse(JSON.stringify(fitState.defaults().style)), "STYLE: every section goes back");
  const p = launch(profileWith({ [STORE_KEY]: aliased }));
  p.advance(3000);
  p.click("DLFMenuButton");
  p.click("DLFPlayersToggle");
  const aliases = () => JSON.parse(p.hud.topBar.parent.parent.GetAttributeString("dlf_match_state", "")).aliases;
  assert.deepEqual(aliases(), { "100": "Kush Alias" }, "the alias came back from the save");
  p.click("DLFMenuResetPage");
  p.advance(4200); // one press lapses: the alias is still there
  assert.deepEqual(aliases(), { "100": "Kush Alias" });
  p.click("DLFMenuResetPage");
  p.click("DLFMenuResetPage");
  assert.deepEqual(aliases(), {}, "PLAYERS: the aliases go");
  g.click("DLFDevToggle");
  g.click("DLFLogToggle");
  g.click("DLFBuys3");
  assert.deepEqual([state().dev.logStatus, state().buys], [true, 8]);
  g.click("DLFGraphToggle");
  g.click("DLFGraphFill");
  g.click("DLFDevToggle");
  press("DLFMenuResetPage");
  press("DLFMenuResetPage");
  assert.deepEqual([state().dev.logStatus, state().buys, state().graph.fill], [false, 5, false], "DEV: debuff settings and the notice time go back, the graph stays");
  g.click("DLFShareToggle");
  assert.ok(g.panel("DLFMenuResetPage").BHasClass("DLFNoReset"), "SHARE / SAVE has nothing of its own to reset");
  assert.equal(part(), "");
  g.advance(3000);
  assert.equal(g.status(), "SAVED");
  assert.deepEqual([g.saved().buys, g.saved().graph.fill], [5, false], "page resets save like any edit");
});

// Purchase notice seconds, graph range and share import. Ways this can fail: the 5 s is fixed in dlf_buys.js; the
// setting is not published, saved, restored or shared; 0 (OFF) still shows notices; an import overwrites this
// PC's DEV settings; the graph still stops at +-300 / 200.
check("purchase notice seconds (editor, save, share) and the wider graph range; an import keeps this PC's DEV settings", () => {
  const S = fitState;
  assert.deepEqual([Array.from(S.GRAPH_LIMITS.x), Array.from(S.GRAPH_LIMITS.y)], [[-600, 600, 10], [-40, 300, 5]], "graph X +-600, Y -40..300 as Observer HUD");
  assert.deepEqual(Array.from(S.BUYS_SHOW), [0, 3, 5, 8, 15]);
  assert.equal(S.defaults().buys, 5);
  assert.equal(S.normalize({ buys: 7 }, S.defaults()).buys, 5, "an unlisted value falls back");
  assert.equal(parseMatch(JSON.stringify(Object.assign(JSON.parse(read("match.json")), { buys: 8 }))).buys, 8, "match.json may set it");
  assert.throws(() => parseMatch(JSON.stringify(Object.assign(JSON.parse(read("match.json")), { buys: 7 }))), /buys must be one of/);

  const profile = profileWith();
  const g = launch(profile);
  g.advance(3000);
  g.click("DLFMenuButton");
  g.click("DLFDevToggle");
  const state = (x = g) => JSON.parse(x.hud.topBar.parent.parent.GetAttributeString("dlf_match_state", ""));
  const labels = Array.from(S.BUYS_SHOW, (_, index) => g.panel(`DLFBuys${index}`).Children()[0].__text);
  assert.deepEqual(labels, ["OFF", "3 S", "5 S", "8 S", "15 S"]);
  assert.ok(g.panel("DLFBuys2").BHasClass("Selected") && state().buys === 5, "5 s is the default");
  g.click("DLFBuys4");
  assert.deepEqual([state().buys, g.panel("DLFBuys4").BHasClass("Selected"), g.panel("DLFBuys2").BHasClass("Selected")], [15, true, false]);
  g.advance(3000);
  assert.equal(g.saved().buys, 15, "saved");
  const again = launch(profile);
  again.advance(3000);
  assert.equal(state(again).buys, 15, "restored after a restart");

  // Share: the code carries the notice time; an import keeps the importing PC's DEV settings.
  g.click("DLFLogToggle");
  g.click("DLFDebuffToggle");
  g.click("DLFShareToggle");
  g.click("DLFShareCopy");
  const code = g.panel("DLFShareEntry").__text;
  const other = launch(profileWith());
  other.advance(3000);
  other.click("DLFMenuButton");
  other.click("DLFShareToggle");
  other.type("DLFShareEntry", code);
  assert.equal(other.panel("DLFShareStatus").__text, "IMPORTED");
  assert.equal(state(other).buys, 15, "the notice time travels in the code");
  assert.deepEqual(state(other).dev, { debuffs: true, debuffPollMs: 250, logStatus: false }, "this PC's DEV settings stay");
  assert.deepEqual(state().dev, { debuffs: false, debuffPollMs: 250, logStatus: true }, "the exporting PC kept its own");

  // The notice shows for the chosen seconds (0: not at all).
  const liveNotices = (seconds, sampleAt) => {
    const harness = createPanoramaHarness();
    const hud = buildHud(harness, { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE });
    const card = hud.teams.TeamFriendly[0];
    card.FindChildTraverse("HeroBadge").heroid = 1;
    card.actualuiscale_x = 1;
    card.actuallayoutwidth = 88;
    hud.topBar.FindChildTraverse("GameTime").__text = "1:00";
    harness.root.SetAttributeString("dlf_match_state", JSON.stringify({ buys: seconds }));
    const shop = new MockPanel("Panel", harness.root, "RecentPurchasesContainer");
    const createPanel = harness.$.CreatePanel;
    const context = createVmContext(harness, { globals: { $: Object.assign({}, harness.$, {
      GetContextPanel: () => hud.topBar,
      CreatePanel: (type, parent, id, props) => {
        const panel = createPanel(type, parent, id, props);
        if (type === "Label" && props && typeof props.text === "string") bindText(panel, props.text);
        return panel;
      } }) } });
    runInVm(stateRun, context, "dlf_state.js");
    runInVm(script("qollock/ql_recent_purchases_data.js"), context, "ql_recent_purchases_data.js");
    runInVm(script("dlf/dlf_buys.js"), context, "dlf_buys.js");
    harness.scheduler.runFor(1000, 200);
    const row = new MockPanel("Panel", shop, "");
    row.classes = ["recentPurchase", "isTeam1Purchase"];
    row.__dialog = { recent_hero_name: "Hero0" };
    for (const [cls, text] of [["recentTimePurchased", "0:59"], ["recentModPurchaseName", "Extra Charge"]]) {
      const label = new MockPanel("Label", row, "");
      label.classes = [cls];
      label.__text = text;
    }
    new MockPanel("Image", row, "RecentPurchaseHeroImage").heroid = 1;
    const counts = [];
    let at = 0;
    for (const ms of sampleAt) {
      harness.scheduler.runFor(ms - at, 100);
      at = ms;
      const host = card.Children().find((child) => child.BHasClass("QuickPurchasesPanel"));
      counts.push(host ? host.Children().filter((child) => !child.BHasClass("DLFBuyFading")).length : 0);
    }
    return counts;
  };
  assert.deepEqual(liveNotices(3, [500, 2800, 3600]), [1, 1, 0], "3 s");
  assert.deepEqual(liveNotices(5, [500, 4800, 5600]), [1, 1, 0], "5 s");
  assert.deepEqual(liveNotices(15, [500, 14800, 15600]), [1, 1, 0], "15 s");
  assert.deepEqual(liveNotices(0, [500, 2800]), [0, 0], "OFF shows no notice");
});

// Card registry. A hero swap rebuilds the card's children; a rebuilt slot panel (the column itself still
// valid) was only found by the 5 s rescan, so the next status of that card drew into a dead slot.
check("debuffs: a card whose status slots were rebuilt shows its debuff within 2 s (hero swap), not after the 5 s rescan", () => {
  const w = pickupWorld();
  const card = w.card("VAYAM");
  w.giveDebuff("VAYAM", "ability_viper_petrifybola");
  w.bootAll();
  w.advance(1500);
  assert.deepEqual(w.debuffs("VAYAM"), [PETRIFY]);
  const column = card.FindChildTraverse("DLFDebuffs");
  const slotNode = findNode(playerLayout, "DLFDebuffs").children[0];
  for (const slot of column.Children().slice()) slot.DeleteAsync();
  for (let i = 0; i < 6; i++) instantiate(slotNode, column);
  w.advance(2500);
  assert.deepEqual(w.debuffs("VAYAM"), [PETRIFY], "the rebuilt slots show the debuff");
});

// Steady-state cost (synthetic op counts, not FPS): native calls per second once nothing changes,
// for the banner (12 players, laid-out cards) and for the debuff column plus one debuffed world bar
// per hero. Recorded in results.budgets; the ceilings catch regressions.
check("steady-state native calls per second stay under the budgets", () => {
  const counted = (harness) => {
    // GetPositionWithinWindow is one engine call; the mock's parent walk (GetParent, IsValid) is not counted.
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
      // traversal/findTraversals/classTraversalNodes count the mock's own recursion, not script calls.
      for (const key of ["traversal", "findTraversals", "classTraversalNodes"]) delete ops[key];
      return Object.fromEntries(Object.entries(ops).filter(([, value]) => value));
    };
  };
  const per = (ops, seconds) => Object.fromEntries(Object.entries(ops).map(([key, value]) => [key, value / seconds]));
  const total = (ops) => Object.values(ops).reduce((sum, value) => sum + value, 0);

  const t = boot("budget-banner", { TeamFriendly: AMBER, TeamEnemy: SAPPHIRE }, { teamClasses: SPECTATOR });
  for (const [team, cards] of Object.entries(t.teams)) {
    cards.forEach((card, i) => { card.actualxoffset = (team === "TeamFriendly" ? 330 : 1062) + i * 88; card.actuallayoutwidth = 88; });
  }
  for (let i = 0; i < 6; i++) t.tick(); // settle past one rescan
  for (const key of Object.keys(t.harness.operationCounts)) t.harness.operationCounts[key] = 0;
  let stop = counted(t.harness);
  for (let i = 0; i < 10; i++) t.tick();
  const banner = per(stop(), 10);

  const w = pickupWorld();
  for (const name of [...AMBER, ...SAPPHIRE]) w.giveDebuff(name, "ability_viper_petrifybola", { radial: () => -180 });
  w.bootAll();
  w.advance(6000);
  for (const key of Object.keys(w.harness.operationCounts)) w.harness.operationCounts[key] = 0;
  stop = counted(w.harness);
  w.advance(10000);
  const debuffs = per(stop(), 10);

  results.budgets = { banner, bannerTotal: total(banner), debuffs, debuffsTotal: total(debuffs) };
  console.log(`   banner ${total(banner).toFixed(1)}/s ${JSON.stringify(banner)}`);
  console.log(`   debuffs ${total(debuffs).toFixed(1)}/s ${JSON.stringify(debuffs)}`);
  assert.equal(banner.textWrites || 0, 0, "steady banner writes no text");
  assert.equal(banner.styleWrites || 0, 0, "steady banner writes no styles");
  // Measured 2026-10-16 after the audit optimizations: banner 75.6/s (was 166.6), debuffs 839.3/s (was 944.9).
  // 2026-10-20: the default poll went from 0.5 s to 0.25 s (user request): debuffs 1223.3/s.
  // 2026-10-20: one "stunned" class read per status panel (muting and sampling share it): 1175.3/s.
  // 2026-10-24: six slots per card (was four), +1 s pad and the pulse field: 1194.5/s (card validity of the
  // two extra slots).
  assert.ok(total(banner) <= 80, `banner budget: ${total(banner)}/s`);
  assert.ok(total(debuffs) <= 1250, `debuff budget: ${total(debuffs)}/s`);
});

// ---------------------------------------------------------------- post-game board (dashboard context)
// The board runs in the post-game page override: dlf_pg_loader.js loads dlf_pg_board.xml into #NSHost.
// The engine side is the live model Observer HUD's harness uses (client 6819): reused scoreboard rows,
// dialog-variable labels, a graph tooltip opened by DispatchPanelEvent, and a page that can reopen
// with no CitadelMatchDetailsUpdated. Identity is the DLFM1 handoff, not Observer HUD's match cards.
// UICanvas (client.dll 6819): ClearJS(color) and DrawSoftLinePointsJS(n, points, thickness, softness, color).
MockPanel.prototype.ClearJS = function (color) { this.__draws = []; this.__clear = color; };
MockPanel.prototype.DrawSoftLinePointsJS = function (n, points, thickness, softness, color) {
  (this.__draws = this.__draws || []).push({ n, pts: Array.from(points), thickness, softness, color });
};
// Measured 2026-10-26: shown 9.0/s, hidden 6.0/s. Modest headroom; re-measure before raising.
const BOARD_SHOWN_MAX = 12;
const BOARD_HIDDEN_MAX = 8;
const PG = {
  page: parseLayout(read("panorama/layout/post_game/citadel_db_page_post_game_new.xml")),
  board: parseLayout(read("panorama/layout/dlf/dlf_pg_board.xml")),
  column: parseLayout(read("panorama/layout/dlf/dlf_pg_column.xml"))
};
const PG_SCREENS = ["Team1Screen", "Team2Screen", "ScoreboardScreen", "GraphsScreen"];
const PG_HEROES = [[1, 2, 3, 4, 6, 7], [8, 10, 11, 12, 13, 14]];
const PG_STATS = ["net_worth", "player_kills", "player_deaths", "player_assists", "player_dmg", "obj_dmg", "player_healing"];
const PG_BOARD = "file://{resources}/layout/dlf/dlf_pg_board.xml";
const PG_COLUMN = "file://{resources}/layout/dlf/dlf_pg_column.xml";
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
// graph (optional): the stock graph's 40 columns and its tooltip in team mode. Lane Stats panels appear
// when the board dispatches CitadelMatchDetailsGraphClickPlayer (graph.lanes).
function boardWorld({ visible = true, graph = null, names = true } = {}) {
  const harness = createPanoramaHarness({ now: 7000000, rootWidth: 1600, rootHeight: 900 });
  const bus = [];
  let nextId = 1;
  const dollar = (panel) => ({
    GetContextPanel: () => panel,
    CreatePanel: (type, parent, id, props = {}) => {
      const created = new MockPanel(type, parent, id);
      for (const [key, value] of Object.entries(props)) {
        if (key === "class") created.classes = String(value).split(/\s+/).filter(Boolean);
        else if (key === "text") bindAll(created, value);
        else if (key === "hittest" || key === "hittestchildren") created[key] = value !== "false" && value !== false;
        else if (key === "accountid") created.accountid = String(value);
        else created.attributes[key] = String(value);
      }
      if (names && type === "CitadelUserName" && props.accountid) new MockPanel("Label", created, "").__text = `Persona ${props.accountid}`;
      return created;
    },
    Schedule: (delay, fn) => harness.scheduler.schedule(delay, () => { frameCheck(); fn(); }),
    RegisterForUnhandledEvent: (name, fn) => { bus.push({ id: nextId, name, fn }); return nextId++; },
    UnregisterForUnhandledEvent: (name, id) => {
      const index = bus.findIndex((entry) => entry.id === id && entry.name === name);
      if (index >= 0) bus.splice(index, 1);
    },
    RegisterEventHandler: (name, target, fn) => {
      target.__handlers = target.__handlers || {};
      (target.__handlers[name] = target.__handlers[name] || []).push(fn);
      if (typeof target.SetPanelEvent === "function") target.SetPanelEvent(name, fn);
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
  const previousLoad = MockPanel.prototype.BLoadLayout;
  MockPanel.prototype.BLoadLayout = function (file) {
    if (file === PG_BOARD) {
      loadInto(this, PG.board);
      runIn(this, [["dlf_state.js", script("dlf/dlf_state.js")], ["dlf_pg_board.js", script("dlf/dlf_pg_board.js")]]);
      return true;
    }
    if (file === PG_COLUMN) {
      loadInto(this, PG.column);
      return true;
    }
    return typeof previousLoad === "function" ? previousLoad.apply(this, arguments) : false;
  };
  const dash = new MockPanel("CitadelDashboardRoot", { operationCounts: harness.operationCounts, findCounts: harness.findCounts,
    childReadCounts: harness.childReadCounts, eventSetCounter: harness.eventSetCounter });
  WORLDS.push(dash);
  const page = instantiate(PG.page, dash);
  if (visible) page.AddClass("PageVisible");
  const scoreboard = page.FindChildTraverse("Scoreboard");
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
  const fill = (m) => {
    page.__dialog = { match_id: m.id, match_minutes: m.minutes, match_seconds: String(m.seconds).padStart(2, "0") };
    if (!scoreboard.children.length) {
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
    boot: () => runIn(page, [["dlf_pg_loader.js", script("dlf/dlf_pg_loader.js")]]),
    reload: () => runIn(boardHost(), [["dlf_state.js", script("dlf/dlf_state.js")], ["dlf_pg_board.js", script("dlf/dlf_pg_board.js")]]),
    advance: (ms) => harness.scheduler.runFor(ms, 1e6),
    text: (id) => boardHost().FindChildTraverse(id).text };
}
function boardCounted(harness) {
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
}
const boardPer = (ops, seconds) => Object.fromEntries(Object.entries(ops).map(([key, value]) => [key, value / seconds]));
const boardTotal = (ops) => Object.values(ops).reduce((sum, value) => sum + value, 0);
const boardReset = (w) => { for (const key of Object.keys(w.harness.operationCounts)) w.harness.operationCounts[key] = 0; };
const present = (w, m) => { w.fill(m); w.fire("CitadelMatchDetailsUpdated", m.id); w.advance(300); };
const noBoardErrors = (w) => !w.harness.logs.some((line) => /tick failed|handoff failed/i.test(line));
const dlfHandoff = (state, at) => `DLFM1:${JSON.stringify({ v: 1, at, state })}`;

check("board: torn paper surfaces use their own full-strength mask at their own size, no faint frame or light border is left", () => {
  const css = read("panorama/styles/dlf/dlf_pg_board.css");
  const board = read("panorama/layout/dlf/dlf_pg_board.xml");
  const column = read("panorama/layout/dlf/dlf_pg_column.xml");
  for (const m of css.matchAll(/opacity-mask:\s*url\("s2r:\/\/panorama\/images\/([\w/]+)\.vtex"\)\s*([\d.]+)?/g)) {
    if (m[1] === "post_game/hero_logo_mask_psd") continue;
    assert.equal(m[2] === undefined ? 1 : Number(m[2]), 1, `${m[1]} is used at full strength`);
  }
  const body = (sel) => {
    const found = new RegExp(`\\n${sel.replace(/[.#]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css);
    assert.ok(found, `${sel} has a rule`);
    return found[1];
  };
  const px = (sel, prop) => Number(new RegExp(`(?:^|\\n)\\s*${prop}:\\s*(\\d+)px`).exec(body(sel))[1]);
  const size = (image) => {
    const png = fs.readFileSync(path.join(PANORAMA, "images", "dlf", `${image}.png`));
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  };
  const surfaces = [
    [".NSHeadLeft", "torn_head_l", ".NSHeadSide", ".NSHeader"],
    [".NSHeadRight", "torn_head_r", ".NSHeadSide", ".NSHeader"],
    [".NSAward", "torn_award", ".NSAward", ".NSAward"],
    [".NSGraphPlot", "torn_graph", ".NSGraphPlot", ".NSGraphPlot"],
    [".NSProgressTrack", "torn_track", ".NSProgressTrack", ".NSProgressTrack"]
  ];
  for (const [sel, mask, wSel, hSel] of surfaces) {
    assert.match(body(sel), new RegExp(`opacity-mask:\\s*url\\("s2r://panorama/images/dlf/${mask}\\.vtex"\\)\\s*1;`), `${sel} uses ${mask}`);
    assert.deepEqual(size(mask), [px(wSel, "width"), px(hSel, "height")], `${mask} is drawn at ${sel}'s size`);
  }
  assert.ok(!/opacity-mask/.test(body(".NSPaper")), ".NSPaper (the stat columns) is not torn");
  for (const [name, text] of [["dlf_pg_board.css", css], ["dlf_pg_board.xml", board], ["dlf_pg_column.xml", column]]) assert.ok(!/TornRim|_rim\.vtex/.test(text), `${name}: no light rim over the tears`);
  const pixels = (image) => pngPixels(path.join(PANORAMA, "images", "dlf", `${image}.png`));
  // Objective drop lines: one panel each, outside the paper, ending 4 px into the icons (user 2026-10-29).
  {
    const js = read("panorama/scripts/dlf/dlf_pg_board.js");
    const end = Number(/const STEM_END = (\d+);/.exec(js)[1]);
    assert.equal(px(".NSGraphStems", "height"), end, ".NSGraphStems is STEM_END tall");
    assert.equal(end, px(".NSGraphPlot", "height") + px(".NSGraphTicks", "height") + 4, "the stems reach 4 px into the icons");
  }
  for (const mask of ["torn_head_l", "torn_head_r", "torn_graph", "torn_track", "torn_award"]) {
    const m = pixels(mask);
    for (let i = 0; i < m.w * m.h; i++) assert.equal(m.out[i * 4 + 3], m.out[i * 4], `${mask}: alpha follows the grey`);
    assert.ok(m.out[0] < 128 && m.out[(m.w * m.h - 1) * 4] < 128, `${mask}'s corners are torn away (at most a fibre)`);
  }
});

check("board: ids the scripts look up exist in their layouts; classes they set have rules", () => {
  const board = read("panorama/layout/dlf/dlf_pg_board.xml");
  const column = read("panorama/layout/dlf/dlf_pg_column.xml");
  const js = read("panorama/scripts/dlf/dlf_pg_board.js");
  const css = read("panorama/styles/dlf/dlf_pg_board.css");
  const idsIn = (xml) => new Set([...xml.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const boardIds = idsIn(board);
  const used = new Set();
  for (const m of js.matchAll(/ctx\.FindChildTraverse\(`?"?([A-Za-z0-9]+)(\$\{i\})?/g)) {
    if (m[2]) for (const i of [1, 2]) used.add(`${m[1]}${i}`);
    else used.add(m[1]);
  }
  assert.ok(used.size >= 12, `only ${used.size} board lookups parsed`);
  for (const id of used) assert.ok(boardIds.has(id), `#${id} missing from dlf_pg_board.xml`);
  const columnIds = idsIn(column);
  const columnUsed = [...js.matchAll(/column\.FindChildTraverse\("([A-Za-z0-9]+)"\)/g)].map((m) => m[1]);
  assert.ok(columnUsed.length >= 4, `only ${columnUsed.length} column lookups parsed`);
  for (const id of columnUsed) assert.ok(columnIds.has(id), `#${id} missing from dlf_pg_column.xml`);
  for (const xml of [board, column]) assert.ok(xml.includes("s2r://panorama/styles/dlf/dlf_pg_board.vcss_c"), "board stylesheet included");
  assert.match(read("panorama/scripts/dlf/dlf_pg_loader.js"), /"file:\/\/\{resources\}\/layout\/dlf\/dlf_pg_board\.xml"/);
  assert.match(js, /"file:\/\/\{resources\}\/layout\/dlf\/dlf_pg_column\.xml"/);
  const rules = new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_]*)/g)].map((m) => m[1]));
  const set = new Set();
  for (const m of js.matchAll(/class: "([^"$]+)"/g)) m[1].split(/\s+/).forEach((c) => set.add(c));
  for (const m of js.matchAll(/(?:AddClass|SetHasClass|RemoveClass)\("([A-Za-z0-9_]+)"/g)) set.add(m[1]);
  for (const key of ["souls", "kills", "assists", "pdmg", "odmg", "heal"]) set.add(`NSBest_${key}`);
  for (const key of ["troopers", "neutrals", "breakables", "bonus", "kills", "objectives", "urn", "assists", "denies"]) set.add(`NSSrc_${key}`);
  for (const c of set) assert.ok(rules.has(c), `.${c} has no rule in dlf_pg_board.css`);
});

check("board: the scan reads the lead with a totals row a few souls off, and the tooltip is never drawn while it runs", () => {
  const m = pgMatch(121685912);
  const totals = m.teams.map((team) => team.reduce((s, p) => s + p.net_worth, 0));
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
  assert.ok(noBoardErrors(w));
});

check("board: builds when the match loads, again for the next match on the reused rows, never twice for one", () => {
  const w = boardWorld();
  w.boot();
  w.advance(2000);
  assert.ok(w.boardHost().BHasClass("NSBusy") && w.boardHost().FindChildTraverse("NSProgress").BHasClass("NSIndeterminate"), "loading bar");
  assert.equal(w.shown(), 0);
  const a = pgMatch(121917141);
  w.fill(a);
  w.fire("CitadelMatchDetailsUpdated", a.id);
  w.advance(300);
  assert.equal(w.shown(), 1, "built within 0.3 s of the match event");
  assert.equal(w.text("NSMatch"), `MATCH ${a.id}`);
  assert.equal(w.columns().length, 12);
  const first = w.columns()[0].FindChildrenWithClassTraverse("NSCellValue")[0];
  assert.equal(first.text, a.teams[0][0].net_worth.toLocaleString("en-US"));
  const shift = String(w.scoreboard.children[0].style.transform || "") === "none" ? 0 : 80;
  assert.equal(shift, 0, "the stock scroll container is not translated");
  assert.equal(parseInt(w.scoreboard.style.marginTop, 10) + shift, 129, "the rows stay at the same height");
  w.advance(5000);
  assert.equal(w.shown(), 1, "one build per match");
  const b = pgMatch(121880956, { swap: true, win: 2 });
  w.fill(b);
  w.fire("CitadelMatchDetailsUpdated", b.id);
  w.advance(300);
  assert.equal(w.shown(), 2);
  assert.equal(w.text("NSMatch"), `MATCH ${b.id}`);
  assert.equal(w.columns().length, 12, "the old match's columns are gone");
  const c = pgMatch(121999999);
  w.fill(c);
  w.advance(1100);
  assert.equal(w.shown(), 3, "found without an event");
  assert.equal(w.text("NSMatch"), `MATCH ${c.id}`);
});

check("board: cheap while hidden, little while shown; a reopen without events, an early event and a screen pick are found", () => {
  const w = boardWorld({ visible: false });
  w.boot();
  const a = pgMatch(121917141);
  w.fill(a);
  w.fire("CitadelMatchDetailsUpdated", a.id);
  w.advance(600);
  assert.equal(w.shown(), 0, "nothing built while hidden");
  w.page.AddClass("PageVisible");
  w.advance(300);
  assert.equal(w.shown(), 1, "built within 0.3 s of the page showing after an event");
  w.advance(10000);
  boardReset(w);
  let stop = boardCounted(w.harness);
  w.advance(10000);
  const shownOps = boardPer(stop(), 10);
  console.log(`   board shown ${boardTotal(shownOps).toFixed(1)}/s ${JSON.stringify(shownOps)} ceiling ${BOARD_SHOWN_MAX}`);
  assert.equal((shownOps.textWrites || 0) + (shownOps.styleWrites || 0) + (shownOps.classWrites || 0), 0, "no writes while nothing changes");
  assert.ok(boardTotal(shownOps) <= BOARD_SHOWN_MAX, `board shown: ${boardTotal(shownOps)}/s`);
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
  w.page.RemoveClass("PageVisible");
  w.advance(6000);
  boardReset(w);
  stop = boardCounted(w.harness);
  w.advance(10000);
  const hiddenOps = boardPer(stop(), 10);
  console.log(`   board hidden ${boardTotal(hiddenOps).toFixed(1)}/s ${JSON.stringify(hiddenOps)} ceiling ${BOARD_HIDDEN_MAX}`);
  assert.equal((hiddenOps.textWrites || 0) + (hiddenOps.styleWrites || 0) + (hiddenOps.classWrites || 0), 0, "no writes while hidden");
  assert.ok(boardTotal(hiddenOps) <= BOARD_HIDDEN_MAX, `board hidden: ${boardTotal(hiddenOps)}/s`);
  results.budgets = Object.assign(results.budgets || {}, {
    boardShown: shownOps, boardShownTotal: boardTotal(shownOps),
    boardHidden: hiddenOps, boardHiddenTotal: boardTotal(hiddenOps)
  });
  const b = pgMatch(121880956, { swap: true });
  w.fill(b);
  w.page.AddClass("PageVisible");
  w.advance(1100);
  assert.equal(w.shown(), 2, "the reopened match is built within a second of the page showing");
  assert.equal(w.text("NSMatch"), `MATCH ${b.id}`);
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
  boardReset(w);
  const stop = boardCounted(w.harness);
  w.advance(10000);
  const ops = boardPer(stop(), 10);
  assert.ok((ops.schedules || 0) <= 1.1, `one 1 s loop: ${ops.schedules} schedules/s`);
});

check("board: the soul lead is one smooth line over a soft area on a canvas, coloured by who leads, with objective dots on the line, both peaks and the final lead", () => {
  const m = pgMatch(121685912);
  const T = m.teams.map((team) => team.reduce((s, p) => s + p.net_worth, 0));
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
  const zigzag = (d) => { for (let i = 0; i + 2 < d.pts.length; i += 4) if (d.pts[i] !== d.pts[i + 2]) return false; return d.n >= 4; };
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
  const fills = draws.filter(zigzag);
  assert.ok(fills.some((d) => team(d.color) === 1) && fills.some((d) => team(d.color) === 2), "the area under the line in both colours");
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
  const text = (p) => String(p.text ?? "");
  const best = (sign) => lead.reduce((b, p) => (sign * p.l > sign * b.l ? p : b), { l: 0 });
  for (const [sign, side] of [[1, 1], [-1, 2]]) {
    const peak = host.FindChildTraverse(`NSGraphPeak${side}`);
    assert.ok(peak && peak.BHasClass("NSOn"), `team ${side} peak shown`);
    assert.ok(text(peak).includes(`+${(Math.abs(best(sign).l) / 1000).toFixed(1)}K`), `team ${side} peak value: ${text(peak)}`);
  }
  const last = lead[lead.length - 1];
  const end = host.FindChildTraverse("NSGraphEnd");
  assert.equal(text(end), `+${(Math.abs(last.l) / 1000).toFixed(1)}K`, "the final lead");
  assert.ok(end.BHasClass(last.l < 0 ? "NSEndTeam2" : "NSEndTeam1"), "in the leader's colour");
  assert.ok(Math.abs(px(end, "marginTop") + 11 - Math.max(11, Math.min(H - 11, last.y))) <= 2, "level with the line's end");
  assert.ok(text(host.FindChildTraverse("NSGraphTop")).includes("HIDDEN KING") && text(host.FindChildTraverse("NSGraphBottom")).includes("ARCHMOTHER"), "captions from the header");
  w.fire("ClientUI_FireOutput", dlfHandoff({
    season: 4, match: 12, seriesFormat: "Best of 3",
    amber: { name: "Night Owls", logo: { url: "", scale: 100 } },
    sapphire: { name: "Brass Saints", logo: { url: "", scale: 100 } },
    aliases: {}
  }, 9000));
  w.advance(500);
  assert.ok(text(host.FindChildTraverse("NSGraphTop")).includes("NIGHT OWLS") && text(host.FindChildTraverse("NSGraphBottom")).includes("BRASS SAINTS"), "captions follow the handed setup");
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
  const board = read("panorama/layout/dlf/dlf_pg_board.xml");
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
  assert.deepEqual([z(icons[4]), z(icons[2])], ["1", "0"], "the mouse moved to another item of the same player");
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

check("board: a handoff names the header, shows the logo only after ImageLoaded, the season line and aliases by account", () => {
  const m = pgMatch(121917141);
  const account = m.teams[0][0].account;

  const url = "https://cdn.example.com/owls.png";
  const state = {
    season: 4, match: 12, seriesFormat: "Best of 3",
    amber: { name: "Night Owls", logo: { url, scale: 120 } },
    sapphire: { name: "Brass Saints", logo: { url: "", scale: 100 } },
    aliases: { [account]: "Kush Prime", "999999999": "Not In This Match", "not-an-account": "Dropped" }
  };
  const w = boardWorld();
  w.boot();
  w.advance(200);
  w.fire("ClientUI_FireOutput", dlfHandoff(state, 8000000));
  present(w, m);
  w.advance(1500);
  assert.deepEqual([w.text("NSTeamName1"), w.text("NSTeamName2")], ["Night Owls", "Brass Saints"], "Amber is Team 1");
  assert.equal(w.text("NSOrgText"), "SEASON 4  ·  MATCH #12");
  const logo1 = w.boardHost().FindChildTraverse("NSLogo1");
  const logo2 = w.boardHost().FindChildTraverse("NSLogo2");
  const image = logo1.children.find((p) => p.paneltype === "Image");
  assert.ok(image && image.src === url, "the logo image is requested");
  assert.ok(logo1.BHasClass("NSLogo") && !logo1.BHasClass("NSLogoCustom"), "wordmark until ImageLoaded");
  assert.ok(!logo2.children.some((p) => p.paneltype === "Image"), "an empty logo URL loads nothing");
  assert.ok(!w.harness.logs.some((line) => line.includes(url)), "logo URLs are not logged");
  image.events.ImageLoaded();
  assert.ok(logo1.BHasClass("NSLogoCustom") && !logo1.BHasClass("NSLogo") && image.BHasClass("NSLoaded"), "custom logo only after ImageLoaded");
  const plates = w.columns().map((c) => c.FindChildTraverse("NSPlate"));
  const aliased = plates.filter((p) => p.BHasClass("NSAliased"));
  assert.equal(aliased.length, 1, "only the matching account is aliased");
  assert.equal(aliased[0].FindChild("NSAlias").text, "Kush Prime");
  assert.ok(noBoardErrors(w));
});

check("board: a handoff that arrives after the board built updates the header without rebuilding", () => {
  const w = boardWorld();
  w.boot();
  const m = pgMatch(121917141);
  present(w, m);
  assert.deepEqual([w.text("NSTeamName1"), w.text("NSTeamName2")], ["Hidden King", "Archmother"], "stock names until a handoff");
  assert.equal(w.shown(), 1);
  w.fire("ClientUI_FireOutput", dlfHandoff({
    season: 9, match: 3, amber: { name: "Late Owls" }, sapphire: { name: "Late Saints" }, aliases: {}
  }, 8100000));
  assert.deepEqual([w.text("NSTeamName1"), w.text("NSTeamName2")], ["Late Owls", "Late Saints"]);
  assert.equal(w.text("NSOrgText"), "SEASON 9  ·  MATCH #3");
  assert.equal(w.shown(), 1, "a handoff does not rebuild the board");
});

check("board: an older, malformed, oversized, wrong-prefix or v!==1 handoff changes nothing", () => {
  const w = boardWorld();
  w.boot();
  const m = pgMatch(121917141);
  present(w, m);
  const good = { season: 2, match: 8, amber: { name: "Kept" }, sapphire: { name: "Also Kept" }, aliases: {} };
  w.fire("ClientUI_FireOutput", dlfHandoff(good, 8200000));
  assert.equal(w.text("NSTeamName1"), "Kept");
  const forged = { season: 1, match: 1, amber: { name: "Forged" }, sapphire: { name: "Forged B" }, aliases: { [m.teams[0][0].account]: "Nope" } };
  const before = w.harness.logs.length;
  w.fire("ClientUI_FireOutput", dlfHandoff(forged, 8199999));
  w.fire("ClientUI_FireOutput", "DLFM1:{");
  w.fire("ClientUI_FireOutput", `DLFM1:${"x".repeat(8192)}`);
  w.fire("ClientUI_FireOutput", `OHM1:${JSON.stringify({ v: 1, at: 8300000, state: forged })}`);
  w.fire("ClientUI_FireOutput", `DLFM2:${JSON.stringify({ v: 1, at: 8300000, state: forged })}`);
  w.fire("ClientUI_FireOutput", JSON.stringify({ v: 1, at: 8300000, state: forged }));
  w.fire("ClientUI_FireOutput", `DLFM1:${JSON.stringify({ v: 2, at: 8300000, state: forged })}`);
  w.fire("ClientUI_FireOutput", `DLFM1:${JSON.stringify({ v: 1, at: 8300000 })}`);
  w.fire("ClientUI_FireOutput", `DLFM1:${JSON.stringify({ v: 1, at: "now", state: forged })}`);
  w.advance(500);
  assert.deepEqual([w.text("NSTeamName1"), w.text("NSTeamName2"), w.text("NSOrgText")], ["Kept", "Also Kept", "SEASON 2  ·  MATCH #8"]);
  assert.ok(w.columns().every((c) => !c.FindChildTraverse("NSPlate").BHasClass("NSAliased")), "a bad handoff aliases nobody");
  assert.equal(w.harness.logs.length, before, "a rejected handoff logs nothing");
  w.fire("ClientUI_FireOutput", dlfHandoff({ season: 5, match: 1, amber: { name: "Next" }, sapphire: { name: "Next B" }, aliases: {} }, 8300000));
  assert.equal(w.text("NSTeamName1"), "Next", "a later valid handoff still applies");
});

check("board: no handoff gives the stock team names, empty org text and account names", () => {
  const w = boardWorld();
  w.boot();
  const m = pgMatch(121917141);
  present(w, m);
  w.advance(1500);
  assert.deepEqual([w.text("NSTeamName1"), w.text("NSTeamName2")], ["Hidden King", "Archmother"]);
  assert.equal(w.text("NSOrgText"), "");
  assert.ok(w.columns().every((c) => !c.FindChildTraverse("NSPlate").BHasClass("NSAliased")), "plates are not aliased");
  assert.ok(w.harness.logs.some((line) => line.includes("no DLF setup handed over")), "the fallback is logged");
  assert.ok(noBoardErrors(w));
});

check("board: the menu hands the current teams, logos and aliases every 5 s and nothing beyond that setup", () => {
  const g = launch(profileWith());
  const sent = () => g.harness.dispatches
    .filter((args) => args[0] === "ClientUI_FireOutput" && String(args[1] || "").startsWith("DLFM1:"))
    .map((args) => JSON.parse(String(args[1]).slice(6)));
  assert.equal(sent().length, 1, "one handoff at boot");
  assert.equal(sent()[0].v, 1);
  g.advance(4900);
  assert.equal(sent().length, 1, "not before 5 s");
  g.advance(200);
  assert.equal(sent().length, 2, "again at 5 s");
  assert.equal(sent()[1].at - sent()[0].at, 5000);
  const allowed = ["aliases", "amber", "match", "sapphire", "season", "seriesFormat"];
  const teamKeys = ["logo", "name"];
  for (const body of sent()) {
    assert.equal(body.v, 1);
    assert.deepEqual(Object.keys(body.state).sort(), allowed, "state is only the setup the board shows");
    assert.deepEqual(Object.keys(body.state.amber).sort(), teamKeys);
    assert.deepEqual(Object.keys(body.state.sapphire).sort(), teamKeys);
    assert.deepEqual(Object.keys(body.state.amber.logo).sort(), ["scale", "url"]);
  }
  assert.deepEqual([sent()[1].state.amber.name, sent()[1].state.sapphire.name], ["VENOM", "BANANABREAD"]);
  assert.deepEqual(sent()[1].state.aliases, {});
  g.click("DLFMenuButton");
  g.type("DLFAmberNameEntry", "Night Owls");
  g.type("DLFSapphireNameEntry", "Brass Saints");
  g.type("DLFAmberLogoEntry", "https://cdn.example.com/owls.png");
  g.type("DLFSapphireLogoEntry", "https://cdn.example.com/saints.png");
  g.click("DLFAmberScoreUp");
  g.type("DLFSeasonEntry", "4");
  g.type("DLFMatchEntry", "12");
  g.playersList([...AMBER, ...SAPPHIRE].map((name) => ({ name, account: name === "KUSH" ? "100" : "" })));
  g.advance(8000);
  assert.equal(g.panel("DLFAmberPlayer0Game").text, "KUSH (100)");
  g.type("DLFAmberPlayer0Entry", "Kush Prime");
  const bot = ["Amber", "Sapphire"].flatMap((side) => [0, 1, 2, 3, 4, 5].map((i) => ({ side, i, text: g.panel(`DLF${side}Player${i}Game`).text })))
    .find((row) => !/\(\d+\)$/.test(row.text));
  assert.ok(bot, "a player without an account is on the list");
  g.type(`DLF${bot.side}Player${bot.i}Entry`, "Bot Alias");
  const before = sent().length;
  g.advance(5000);
  assert.ok(sent().length === before + 1, "still one handoff per 5 s after edits");
  const times = sent().map((body) => body.at);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 5000, "never more often than every 5 s");
  const last = sent()[sent().length - 1];
  assert.deepEqual(Object.keys(last.state).sort(), allowed);
  assert.deepEqual([last.state.amber.name, last.state.sapphire.name, last.state.season, last.state.match], ["Night Owls", "Brass Saints", 4, 12]);
  assert.deepEqual([last.state.amber.logo.url, last.state.sapphire.logo.url], ["https://cdn.example.com/owls.png", "https://cdn.example.com/saints.png"]);
  assert.deepEqual(last.state.aliases, { 100: "Kush Prime" }, "aliases by account, not the session alias");
  assert.ok(!JSON.stringify(last.state).includes("Bot Alias") && !JSON.stringify(last.state).includes("score"), "scores and session aliases are not handed over");
  assert.ok(!g.harness.logs.some((line) => line.includes("cdn.example.com")), "logo URLs are not logged");
});

const out = path.join(REPO, ".tmp", "dlf-validate.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`${results.checks.length} checks passed; artifact ${path.relative(REPO, out)}`);
