#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repo = path.resolve(__dirname, "..", "..");
const mod = path.join(repo, "topbar_status_buffs");
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readRel(rel) {
  return fs.readFileSync(path.join(mod, rel), "utf8");
}
const healthJs = readRel("panorama/scripts/topbar_status_buffs_healthbar.js");



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
console.log("OK: topbar_status_buffs publisher smoke passed");
