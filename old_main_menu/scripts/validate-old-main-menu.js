#!/usr/bin/env node
// Static contract for old_main_menu against the INSTALLED client (default G:\SteamLibrary\...\Deadlock\game).
// Proves: every engine panel class and Citadel* event the layouts use exists in client.dll; every #token exists in
// the installed English localization; every s2r:// image is either in the game's pak01 or packed by this mod;
// no removed Jul 2025 engine hook is still referenced; the script budget holds; layouts are balanced XML.
// It cannot prove runtime behaviour (that the engine fills panels or fires events): that needs the in-game check.
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const MOD = path.resolve(__dirname, "..");
const GAME = process.env.OMM_GAME_DIR || "G:\\SteamLibrary\\steamapps\\common\\Deadlock\\game";
const CITADEL = path.join(GAME, "citadel");
const PANORAMA = path.join(MOD, "panorama");
// Script budget: the dashboard script replaces dashboard_restoremenu.js (4.6 KB) and must stay small; the Heroes page
// scripts are the forked pak04's (see RESEARCH.md for why they are kept) and may not grow.
const SCRIPT_BUDGET = { "old_main_menu.js": 5500, "citadel_db_page_heroes.js": 23000, "citadel_db_page_heroes_data.js": 185000 };
// Jul 2025 hooks the current client removed; the mod must not depend on them.
const REMOVED = [
  "CitadelPlayMenu", "CitadelPlayMenuMatchmaking", "CitadelPlayMenuBotMatchPopup", "CitadelPlayMenuHeroTesting",
  "CitadelPlayMenuCustomMatchPopup", "CitadelPlayMenuHeroLab", "CitadelExploreMap", "CitadelShowRosterConfirmPage",
  "CitadelToggleViewAnnouncements", "CitadelShowLatestPatchNotes", "CitadelPartyClearMode", "CitadelAnnouncementList",
  "CitadelHeroPage", "CitadelHeroDetailsPage", "DBPlayerList", "TopBarHeroes",
];
// Generic Panorama panel types (panorama.dll / panoramauiclient.dll), not client.dll.
const GENERIC_TAGS = new Set(["root", "styles", "scripts", "include", "snippets", "snippet", "Panel", "Label", "Button",
  "Image", "MoviePanel", "PageManager", "PopupManager", "ToastManager", "DropDown", "ToggleButton", "TextEntry"]);

const results = [];
function check(name, fn) {
  try { fn(); results.push(["ok", name]); } catch (e) { results.push(["FAIL", name + ": " + e.message]); }
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}

function vpkEntries(file) {
  const data = fs.readFileSync(file);
  assert.strictEqual(data.readUInt32LE(0), 0x55aa1234, `${file} is not a VPK`);
  const treeEnd = 28 + data.readUInt32LE(8);
  const entries = new Set();
  let pos = 28;
  const cstr = () => { const end = data.indexOf(0, pos); const s = data.toString("utf8", pos, end); pos = end + 1; return s; };
  while (pos < treeEnd) {
    const ext = cstr(); if (!ext) break;
    for (;;) {
      const folder = cstr(); if (!folder) break;
      for (;;) {
        const name = cstr(); if (!name) break;
        const preload = data.readUInt16LE(pos + 4);
        pos += 18 + preload;
        entries.add(((folder !== " " ? folder + "/" : "") + name + (ext !== " " ? "." + ext : "")).toLowerCase());
      }
    }
  }
  return entries;
}

function localizationTokens() {
  const tokens = new Set();
  const root = path.join(CITADEL, "resource", "localization");
  for (const file of walk(root).filter((f) => /_english\.txt$/i.test(f))) {
    const text = fs.readFileSync(file).toString(/\x00/.test(fs.readFileSync(file).subarray(0, 4)) ? "utf16le" : "utf8");
    for (const m of text.matchAll(/^\s*"([^"]+)"\s+"/gm)) tokens.add(m[1].toLowerCase());
  }
  return tokens;
}

const files = walk(PANORAMA);
const layouts = files.filter((f) => f.endsWith(".xml"));
const styles = files.filter((f) => f.endsWith(".css"));
const scripts = files.filter((f) => f.endsWith(".js"));
const read = (f) => fs.readFileSync(f, "utf8");
const dll = fs.readFileSync(path.join(CITADEL, "bin", "win64", "client.dll"));
const inDll = (name) => dll.includes(Buffer.from(name + "\0")) || dll.includes(Buffer.from("\0" + name));
const assets = JSON.parse(read(path.join(MOD, "assets.json")));
const packed = new Set(assets.images.concat(assets.videos).map((a) => a.path.toLowerCase()));

check("layouts are balanced XML", () => {
  for (const file of layouts) {
    const stack = [];
    const text = read(file).replace(/<!--[\s\S]*?-->/g, "");
    for (const m of text.matchAll(/<(\/?)([A-Za-z][\w]*)([^>]*?)(\/?)>/g)) {
      if (m[1]) assert.strictEqual(stack.pop(), m[2], `${path.basename(file)}: unexpected </${m[2]}>`);
      else if (!m[4]) stack.push(m[2]);
    }
    assert.deepStrictEqual(stack, [], `${path.basename(file)}: unclosed ${stack.join(",")}`);
  }
});

check("engine panel classes exist in client.dll", () => {
  const missing = new Set();
  for (const file of layouts) {
    for (const m of read(file).replace(/<!--[\s\S]*?-->/g, "").matchAll(/<([A-Z][A-Za-z0-9]+)[\s/>]/g)) {
      if (!GENERIC_TAGS.has(m[1]) && !inDll(m[1])) missing.add(`${m[1]} (${path.basename(file)})`);
    }
  }
  assert.deepStrictEqual([...missing], []);
});

check("Citadel* events exist in client.dll", () => {
  const missing = new Set();
  const sources = layouts.map(read).concat(scripts.map(read));
  for (const text of sources) {
    for (const m of text.matchAll(/\b(Citadel[A-Za-z]+)\s*\(/g)) if (!inDll(m[1])) missing.add(m[1]);
    for (const m of text.matchAll(/(?:DispatchEvent|RegisterEventHandler)\(\s*"([A-Za-z]+)"/g)) {
      if (m[1].startsWith("Citadel") && !inDll(m[1])) missing.add(m[1]);
    }
  }
  assert.deepStrictEqual([...missing], []);
});

check("no removed Jul 2025 hook is referenced", () => {
  const hits = [];
  for (const file of layouts.concat(scripts)) {
    const text = read(file).replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const name of REMOVED) if (new RegExp(`\\b${name}\\b`).test(text)) hits.push(`${name} (${path.basename(file)})`);
  }
  assert.deepStrictEqual(hits, []);
});

check("#tokens exist in the installed English localization", () => {
  const tokens = localizationTokens();
  const missing = new Set();
  for (const file of layouts) {
    for (const m of read(file).matchAll(/(?:text|onmouseover)="[^"]*?#([A-Za-z][\w]*)/g)) {
      if (!tokens.has(m[1].toLowerCase())) missing.add(`#${m[1]} (${path.basename(file)})`);
    }
  }
  assert.deepStrictEqual([...missing], []);
});

check("every s2r:// image is in pak01 or packed by the mod", () => {
  const pak = vpkEntries(path.join(CITADEL, "pak01_dir.vpk"));
  const missing = new Set();
  for (const file of styles.concat(layouts)) {
    for (const m of read(file).matchAll(/s2r:\/\/(panorama\/images\/[^"')]+?)\.(vtex|vsvg)\b/g)) {
      const compiled = `${m[1]}.${m[2]}_c`.toLowerCase();
      if (!pak.has(compiled) && !packed.has(compiled)) missing.add(compiled);
    }
  }
  assert.deepStrictEqual([...missing], []);
});

check("every fallback image exists in pak01", () => {
  const pak = vpkEntries(path.join(CITADEL, "pak01_dir.vpk"));
  for (const a of assets.images) {
    if (a.fallback && !a.fallback.startsWith("hide:")) assert.ok(pak.has(a.fallback.toLowerCase() + "_c"), a.fallback);
  }
});

check("layout includes resolve to mod or stock files", () => {
  const pak = vpkEntries(path.join(CITADEL, "pak01_dir.vpk"));
  const own = new Set(files.map((f) => path.relative(MOD, f).replace(/\\/g, "/").replace(/\.(css|js|xml)$/, (e) => ({ ".css": ".vcss_c", ".js": ".vjs_c", ".xml": ".vxml_c" })[e]).toLowerCase()));
  const missing = [];
  for (const file of layouts) {
    for (const m of read(file).matchAll(/<include src="s2r:\/\/([^"]+)"/g)) {
      const target = (m[1] + "_c").toLowerCase();
      if (!own.has(target) && !pak.has(target)) missing.push(`${m[1]} (${path.basename(file)})`);
    }
    for (const m of read(file).matchAll(/file:\/\/\{resources\}\/(layout\/[\w./]+\.xml)/g)) {
      const target = ("panorama/" + m[1].replace(/\.xml$/, ".vxml_c")).toLowerCase();
      if (!own.has(target) && !pak.has(target)) missing.push(`${m[1]} (${path.basename(file)})`);
    }
  }
  assert.deepStrictEqual(missing, []);
});

check("script budget", () => {
  const names = scripts.map((f) => path.basename(f)).sort();
  assert.deepStrictEqual(names, Object.keys(SCRIPT_BUDGET).sort(), "unexpected script set");
  for (const f of scripts) {
    const size = fs.statSync(f).size;
    assert.ok(size <= SCRIPT_BUDGET[path.basename(f)], `${path.basename(f)} is ${size} bytes`);
  }
});

check("every file://{resources} movie is packed by the mod", () => {
  const missing = new Set();
  for (const file of layouts.concat(scripts)) {
    for (const m of read(file).matchAll(/file:\/\/\{resources\}\/(videos\/[\w./]+\.webm)/g)) {
      if (!packed.has(("panorama/" + m[1]).toLowerCase())) missing.add(m[1]);
    }
  }
  assert.deepStrictEqual([...missing], []);
});

check("strict-build markers are paired", () => {
  const play = read(path.join(PANORAMA, "layout", "dashboard.xml"));
  assert.strictEqual((play.match(/OMM-CURRENT-MODES-BEGIN/g) || []).length, 1);
  assert.strictEqual((play.match(/OMM-CURRENT-MODES-END/g) || []).length, 1);
});

for (const [status, name] of results) console.log(`${status === "ok" ? "  ok  " : "  FAIL"} ${name}`);
const failed = results.filter((r) => r[0] !== "ok").length;
console.log(`${results.length - failed}/${results.length} checks passed (game: ${GAME})`);
process.exit(failed ? 1 : 0);
