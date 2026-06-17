#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repo = path.resolve(__dirname, "..", "..");
const mod = path.join(repo, "topbar_status_buffs");
const required = [
  "AGENTS.md",
  "implementation.md",
  "panorama/layout/unit_status_overlay.xml",
  "panorama/layout/citadel_hud_top_bar_player.xml",
  "panorama/scripts/topbar_status_buffs_healthbar.js",
  "panorama/scripts/topbar_status_buffs_topbar.js",
  "panorama/scripts/topbar_status_buffs_debug.js",
  "panorama/styles/topbar_status_buffs.css",
  "panorama/styles/topbar_status_buffs_base/citadel_hud_top_bar.css",
  "scripts/validate-topbar-status-buffs.js",
  "scripts/build-topbar-status-buffs.ps1"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readRel(rel) {
  return fs.readFileSync(path.join(mod, rel), "utf8");
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

function walk(dir, prefix = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else out.push(rel.replace(/\\/g, "/"));
  }
  return out.sort();
}

for (const rel of required) {
  assert(!rel.startsWith("hp_colors/") && !rel.startsWith("topbar_rank/"), `Required path points outside standalone mod: ${rel}`);
  assert(fs.existsSync(path.join(mod, rel)), `Missing required source file: ${rel}`);
}

const actual = walk(mod);
assert(actual.length === required.length && required.every((rel) => actual.includes(rel)), `Source file set differs from required list: ${actual.join(", ")}`);

const unitXml = readRel("panorama/layout/unit_status_overlay.xml");
assert(unitXml.includes("topbar_status_buffs_healthbar.vjs_c"), "unit_status_overlay.xml missing publisher script include");
assert(unitXml.includes('<include src="s2r://panorama/styles/unit_status.vcss_c" />'), "unit_status_overlay.xml must keep stock unit_status CSS include");
assert(unitXml.includes('<CitadelStatusEffect id="StatusEffects" />'), "unit_status_overlay.xml missing StatusEffects panel");
assert(unitXml.includes('id="UnitStatus"'), "unit_status_overlay.xml missing UnitStatus anchor");
assert(unitXml.includes('id="name"'), "unit_status_overlay.xml missing name anchor");
assert(!unitXml.includes("healthbar_logic.vjs_c"), "unit_status_overlay.xml still includes inherited HP Colors script");

const playerXml = readRel("panorama/layout/citadel_hud_top_bar_player.xml");
assert(playerXml.includes("topbar_status_buffs_topbar.vjs_c"), "topbar player XML missing consumer script include");
assert(playerXml.includes("topbar_status_buffs_debug.vjs_c"), "topbar player XML missing debug script include");
assert(playerXml.includes("TopbarStatusBuffsPlayerLoaded"), "topbar player XML missing onload handler");
assert(count(playerXml, 'id="TopbarStatusBuffs"') === 1, "topbar player XML must contain exactly one TopbarStatusBuffs container");
assert(playerXml.includes('id="TopbarStatusBuffsNativeEffects"'), "topbar player XML missing native status-effect probe");
for (const id of ["TopbarStatusBuffSurvival", "TopbarStatusBuffMovement", "TopbarStatusBuffCasting", "TopbarStatusBuffGunpower"]) {
  assert(count(playerXml, `id="${id}"`) === 1, `topbar player XML must contain exactly one ${id}`);
}
for (const id of ["TopbarStatusBuffSurvivalTime", "TopbarStatusBuffMovementTime", "TopbarStatusBuffCastingTime", "TopbarStatusBuffGunpowerTime"]) {
  assert(count(playerXml, `id="${id}"`) === 1, `topbar player XML must contain exactly one timer ${id}`);
}
for (const forbidden of ["TopbarRank", "topbar_rank", "rank-predict", "deadlock-api.com", "StatLocker"]) {
  assert(!playerXml.includes(forbidden), `topbar player XML contains forbidden rank/API marker: ${forbidden}`);
}

const baseCss = readRel("panorama/styles/topbar_status_buffs_base/citadel_hud_top_bar.css");
assert(baseCss.includes("idolScoreResultDisplayTime"), "base topbar CSS is not rebased from current stock citadel_hud_top_bar.css");
assert(!baseCss.includes("TopbarRank"), "base topbar CSS contains inherited TopbarRank marker");

const healthJs = readRel("panorama/scripts/topbar_status_buffs_healthbar.js");
for (const needle of [
  'UPDATE_MAGIC = "TOPBAR_STATUS_BUFFS_UPDATE"',
  'SHARED_KEY = "__topbarStatusBuffs"',
  "BUFF_DURATION_MS = 160000",
  "readBuffMask",
  "publishMask",
  "StatusEffects",
  "survival_pickup",
  "movement_pickup",
  "casting_pickup",
  "gunpower_pickup",
  "started_at",
  "ends_at",
  "$.Localize",
  "tryLocalizeUnitName",
  "panelClasses",
  "publishAnonymousMask",
  "any_record"
]) {
  assert(healthJs.includes(needle), `healthbar JS missing ${needle}`);
}

const topbarJs = readRel("panorama/scripts/topbar_status_buffs_topbar.js");
for (const needle of [
  "TopbarStatusBuffsPlayerLoaded",
  "GameUI.CustomUIConfig",
  "RegisterForUnhandledEvent",
  "ACTIVE_TICK_SECONDS = 0.25",
  "IDLE_TICK_SECONDS = 0.75",
  "BUFF_DURATION_MS = 160000",
  "remainingText",
  "TopbarStatusBuffSurvivalTime",
  "readNativeBuffMask",
  "TopbarStatusBuffsNativeEffects",
  "any_record"
]) {
  assert(topbarJs.includes(needle), `topbar JS missing ${needle}`);
}

const debugJs = readRel("panorama/scripts/topbar_status_buffs_debug.js");
assert(debugJs.includes("TopbarStatusBuffsDebugDump"), "debug JS missing dump helper");
assert(debugJs.includes("TopbarStatusBuffsDebugClear"), "debug JS missing clear helper");
assert(!healthJs.includes("GetDialogVariable"), "healthbar JS must not use unregistered GetDialogVariable API");

for (const [label, source] of [["healthbar JS", healthJs], ["topbar JS", topbarJs], ["debug JS", debugJs]]) {
  for (const forbidden of ["fetch(", "XMLHttpRequest", "AsyncWebRequest", "setInterval", ".src =", "RunScriptInPanelContext"]) {
    assert(!source.includes(forbidden), `${label} contains forbidden API/write: ${forbidden}`);
  }
}

class MockPanel {
  constructor(id, text = "") {
    this.id = id;
    this.text = text;
    this.classes = new Set();
    this.children = [];
    this.parent = null;
    this.vars = {};
  }
  AddChild(child) {
    child.parent = this;
    this.children.push(child);
  }
  IsValid() { return true; }
  BHasClass(token) { return this.classes.has(token); }
  Children() { return this.children; }
  GetParent() { return this.parent; }
  GetAttributeString(name, fallback) { return name === "text" ? this.text : fallback; }
  FindChildTraverse(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.FindChildTraverse(id);
      if (found) return found;
    }
    return null;
  }
}

function runSmoke() {
  const statusEffects = new MockPanel("StatusEffects");
  const statusChild = new MockPanel("child");
  statusChild.classes.add("survival_pickup");
  statusEffects.AddChild(statusChild);
  const unitStatus = new MockPanel("UnitStatus");
  unitStatus.AddChild(statusEffects);
  const name = new MockPanel("name", "{s:name}");
  const root = new MockPanel("root");
  root.vars.name = "Pocket";
  root.AddChild(name);
  root.AddChild(unitStatus);

  const scheduled = [];
  const config = {};
  const dispatched = [];
  let now = 100000;
  class MockDate extends Date {
    static now() { return now; }
  }
  const context = {
    Date: MockDate,
    String,
    Number,
    JSON,
    isFinite,
    GameUI: { CustomUIConfig: () => config },
    $: {
      GetContextPanel: () => root,
      Localize: (value, panel) => value === "{s:name}" && panel && panel.vars && panel.vars.name ? panel.vars.name : value,
      Schedule: (delay, fn) => scheduled.push({ delay, fn }),
      DispatchEvent: (channel, payload) => dispatched.push({ channel, payload }),
      Msg: () => {}
    }
  };

  vm.runInNewContext(healthJs, context, { filename: "topbar_status_buffs_healthbar.js" });
  assert(scheduled.length > 0, "publisher did not schedule initial tick");
  scheduled.shift().fn();
  const first = config.__topbarStatusBuffs && config.__topbarStatusBuffs.units.pocket;
  assert(first && first.mask === 1, "publisher smoke did not publish survival mask 1");
  assert(first.duration_ms === 160000, "publisher smoke did not publish 160s duration");
  assert(first.buffs && first.buffs.survival && first.buffs.survival.ends_at === now + 160000, "publisher smoke did not publish survival end time");

  now += 1000;
  statusChild.classes.delete("survival_pickup");
  assert(scheduled.length > 0, "publisher did not schedule follow-up tick");
  scheduled.shift().fn();
  const second = config.__topbarStatusBuffs && config.__topbarStatusBuffs.units.pocket;
  assert(second && second.mask === 0, "publisher smoke did not clear survival mask to 0");
  assert(dispatched.length >= 2, "publisher did not dispatch update events");
}

runSmoke();
console.log("OK: topbar_status_buffs source invariants passed");
