"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = path.join(__dirname, "..", "panorama", "scripts", "qollite_showrank.js");
const source = fs.readFileSync(sourcePath, "utf8");

class Panel {
  constructor(id, attributes) {
    this.id = id || "";
    this.attributes = Object.assign({}, attributes);
    this.children = [];
    this.parent = null;
    this.classes = new Set();
    this.text = "";
    this.visible = true;
    this.deleted = false;
  }

  AddChild(panel) {
    panel.parent = this;
    this.children.push(panel);
  }

  FindChildTraverse(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.FindChildTraverse(id);
      if (found) return found;
    }
    return null;
  }

  GetAttributeString(name, fallback) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : fallback;
  }

  SetHasClass(name, enabled) {
    if (enabled) this.classes.add(name);
    else this.classes.delete(name);
  }

  BHasClass(name) {
    return this.classes.has(name);
  }

  DeleteAsync() {
    this.deleted = true;
    if (this.parent) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }
  }
}

function makeHarness(attributes) {
  const root = new Panel("ProfileCard");
  const badge = new Panel("ProfileBadgeBackground", attributes);
  const stockChild = new Panel("StockChild");
  root.AddChild(badge);
  badge.AddChild(stockChild);
  const registry = Object.create(null);
  const runtime = {
    find(id, panel) {
      return (panel || root).FindChildTraverse(id);
    },
    setClass(panel, name, enabled) {
      panel.SetHasClass(name, enabled);
    },
    register(name, feature) {
      registry[name] = feature;
    }
  };
  const qolLite = { Runtime: runtime };
  vm.runInNewContext(source, {
    GameUI: { CustomUIConfig: () => ({ QolLite: qolLite }) },
    $: {
      GetContextPanel: () => root,
      CreatePanel(_type, parent, id) {
        const panel = new Panel(id);
        parent.AddChild(panel);
        return panel;
      }
    }
  }, { filename: sourcePath });
  return { badge, registry, root, stockChild };
}

function surface(panel) {
  return panel.FindChildTraverse("QolLiteShowRankSurface");
}

{
  const { badge, registry } = makeHarness({ rank: "42" });
  const feature = registry.showrank;
  assert.ok(feature, "feature registers through the QolLite runtime");
  feature.init();
  const rank = surface(badge);
  assert.ok(rank, "known engine rank creates one owned surface");
  assert.equal(rank.text, "42", "surface renders the normalized engine value");
  assert.equal(rank.visible, true, "known rank is visible");
  assert.equal(rank.BHasClass("QolLiteShowRank"), true, "surface receives only the owned class");
}

{
  const { badge, registry } = makeHarness({});
  registry.showrank.init();
  assert.equal(surface(badge), null, "unknown rank creates no visible surface");
}

{
  const { badge, registry } = makeHarness({ rank_badge: "not-a-rank" });
  registry.showrank.init();
  assert.equal(surface(badge), null, "malformed rank data remains hidden");
}

{
  const { badge, registry } = makeHarness({ player_rank: "7.50" });
  const feature = registry.showrank;
  feature.init();
  const first = surface(badge);
  feature.refresh();
  assert.equal(surface(badge), first, "refresh is idempotent for the same stock value");
  assert.equal(badge.children.filter((child) => child.id === "QolLiteShowRankSurface").length, 1, "refresh does not duplicate owned panels");
  badge.attributes.player_rank = "8";
  feature.refresh();
  assert.equal(surface(badge).text, "8", "refresh renders a changed engine value");
}

{
  const { badge, registry, stockChild } = makeHarness({ rank: 3 });
  const feature = registry.showrank;
  feature.init();
  feature.destroy();
  assert.equal(surface(badge), null, "destroy removes the owned surface");
  assert.equal(badge.classes.size, 0, "destroy leaves stock classes untouched");
  assert.equal(stockChild.deleted, false, "destroy preserves stock panels");
}

console.log("validate-showrank: ok");
