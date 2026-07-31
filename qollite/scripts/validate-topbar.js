"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "panorama", "scripts", "qollite_topbar.js"),
  "utf8"
);

const styleSource = fs.readFileSync(
  path.join(__dirname, "..", "panorama", "styles", "qollite_topbar.css"),
  "utf8"
);
assert.doesNotMatch(
  styleSource,
  /:not\(/,
  "topbar CSS must avoid :not selectors rejected by the Panorama runtime"
);

class Panel {
  constructor(id, parent) {
    this.id = id || "";
    this.parent = parent || null;
    this.children = [];
    this.classes = new Set();
    this.text = "";
    this.visible = true;
    this.deleted = false;
    if (parent) parent.children.push(this);
  }

  GetParent() {
    return this.parent;
  }

  SetHasClass(name, enabled) {
    if (enabled) this.classes.add(name);
    else this.classes.delete(name);
  }

  BHasClass(name) {
    return this.classes.has(name);
  }

  FindChildTraverse(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.FindChildTraverse(id);
      if (found) return found;
    }
    return null;
  }

  DeleteAsync() {
    this.deleted = true;
    if (this.parent) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
    }
  }
}

function makeHarness({ captureText = "", rejuvenatorText = "", classes = [] } = {}) {
  const root = new Panel("CitadelHudTopBar");
  classes.forEach((name) => root.SetHasClass(name, true));
  new Panel("ObjectivesMap", root);
  const koth = new Panel("KothCashInMeter", root);
  koth.text = captureText;
  const rejuvenator = new Panel("RejuvenatorCharges", root);
  rejuvenator.text = rejuvenatorText;
  const schedules = [];
  const cancelled = [];
  const config = { QolLite: { Runtime: null } };
  const runtime = {
    find(id, scope) {
      return (scope || root).FindChildTraverse(id);
    },
    setClass(panel, name, enabled) {
      panel.SetHasClass(name, enabled);
    },
    schedule(owner, delay, callback) {
      schedules.push({ owner, delay, callback });
    },
    cancel(owner) {
      cancelled.push(owner);
    },
    register(name, feature) {
      config.QolLite[name] = feature;
    }
  };
  config.QolLite.Runtime = runtime;
  const context = {
    GameUI: { CustomUIConfig: () => config },
    Game: { GetGameTime: () => 0 },
    $: {
      GetContextPanel: () => root,
      CreatePanel: (_type, parent, id) => new Panel(id, parent)
    }
  };
  vm.runInNewContext(source, context, { filename: "qollite_topbar.js" });
  return { root, schedules, cancelled, topbar: config.QolLite.topbar };
}

{
  const { root, topbar } = makeHarness({ classes: ["gHideout", "WaitingForHudUpdate"] });
  topbar.init();
  assert.equal(root.BHasClass("QolLiteTopbarHideout"), true);
  assert.equal(root.BHasClass("QolLiteTopbarWaitingForHudUpdate"), true);
  assert.equal(root.BHasClass("QolLiteTopbarStreetBrawl"), false);
}

{
  const { root, topbar } = makeHarness();
  topbar.init();
  const status = root.FindChildTraverse("QolLiteObjectiveStatus");
  assert.ok(status);
  assert.equal(status.visible, false);
  assert.equal(status.text, "");
}

{
  const { root, topbar } = makeHarness({
    captureText: "Amber has the cashout",
    rejuvenatorText: "0:45"
  });
  topbar.init();
  const status = root.FindChildTraverse("QolLiteObjectiveStatus");
  assert.equal(status.visible, true);
  assert.equal(status.text, "Capture: Amber has the cashout | Rejuvenator: 0:45");
}

{
  const { topbar } = makeHarness();
  const rewind700To1 = topbar.reduceGameTime({ gameTime: 700, label: "Active" }, 1);
  assert.equal(rewind700To1.gameTime, 1);
  assert.equal(rewind700To1.label, "Spawn");
  const largeRewind = topbar.reduceGameTime({ gameTime: 60, label: "Active" }, 54);
  assert.equal(largeRewind.gameTime, 54);
  assert.equal(largeRewind.label, "Spawn");
  const shortRewind = topbar.reduceGameTime({ gameTime: 60, label: "Active" }, 55);
  assert.equal(shortRewind.gameTime, 55);
  assert.equal(shortRewind.label, "Active");
}

{
  const { root, schedules, cancelled, topbar } = makeHarness({ captureText: "Capture A" });
  topbar.init();
  assert.equal(schedules.length, 1);
  const pending = schedules[0].callback;
  topbar.destroy();
  assert.equal(root.FindChildTraverse("QolLiteObjectiveStatus"), null);
  assert.equal(cancelled.length, 1);
  pending();
  assert.equal(schedules.length, 1);
}

console.log("validate-topbar: ok");
