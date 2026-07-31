"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Panel {
  constructor(id, classes, attributes) {
    this.id = id || "";
    this.classes = new Set(classes || []);
    this.attributes = Object.assign({}, attributes);
    this.children = [];
    this.parent = null;
    this.deleted = false;
  }

  AddChild(panel) {
    panel.parent = this;
    this.children.push(panel);
  }

  GetParent() {
    return this.parent;
  }

  FindChildTraverse(id) {
    for (const child of this.children) {
      if (child.id === id) {
        return child;
      }
      const nested = child.FindChildTraverse(id);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  FindChildrenWithClassTraverse(className) {
    const found = [];
    for (const child of this.children) {
      if (child.classes.has(className)) {
        found.push(child);
      }
      found.push(...child.FindChildrenWithClassTraverse(className));
    }
    return found;
  }

  GetAttributeString(name, fallback) {
    const value = this.attributes[name];
    return typeof value === "string" ? value : fallback;
  }

  SetAttributeString(name, value) {
    this.attributes[name] = value;
  }

  DeleteAsync() {
    this.deleted = true;
    if (this.parent) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }
  }
}

function makeHarness() {
  const root = new Panel("HudRoot");
  const container = new Panel("RecentPurchasesContainer");
  root.AddChild(container);
  const stockWithHero = new Panel("stock-a", ["recentPurchase"]);
  const stockHero = new Panel("RecentPurchaseHeroImage", [], { hero: "hero_haze" });
  stockWithHero.AddChild(stockHero);
  const stockWithoutHero = new Panel("stock-b", ["recentPurchase"]);
  container.AddChild(stockWithHero);
  container.AddChild(stockWithoutHero);

  const schedules = [];
  const listeners = [];
  const settings = Object.create(null);
  const ummRegistrations = [];
  const featureRegistry = Object.create(null);
  const runtime = {
    find(id, panel) {
      return (panel || root).FindChildTraverse(id);
    },
    setClass(panel, className, enabled) {
      if (enabled) {
        panel.classes.add(className);
      } else {
        panel.classes.delete(className);
      }
    },
    schedule(owner, delay, callback) {
      schedules.push({ owner, delay, callback });
    },
    cancel() {},
    register(name, feature) {
      featureRegistry[name] = feature;
    }
  };
  const settingsApi = {
    get(id, key) {
      return key === undefined ? settings[id] : settings[id] && settings[id][key];
    },
    subscribe(id, callback) {
      listeners.push({ id, callback });
      return () => {
        const index = listeners.findIndex((entry) => entry.callback === callback);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      };
    }
  };
  const umm = {
    register(id, definition) {
      ummRegistrations.push({ id, definition });
      settings[id] = Object.assign({}, definition.defaults);
    },
    announce() {},
    handle(message) {
      if (!message || message.umm !== 1 || message.t !== "set" ||
          !settings[message.id] || message.key !== "enabled" ||
          typeof message.v !== "boolean") {
        return false;
      }
      settings[message.id] = { enabled: message.v };
      for (const listener of listeners.filter((entry) => entry.id === message.id)) {
        listener.callback(settings[message.id]);
      }
      return true;
    }
  };
  const qolLite = { Runtime: runtime, Settings: settingsApi, UMM: umm };
  const context = {
    console,
    GameUI: { CustomUIConfig: () => ({ QolLite: qolLite }) },
    $: {
      GetContextPanel: () => root,
      CreatePanel(type, parent, id) {
        const panel = new Panel(id, [], { panelType: type });
        parent.AddChild(panel);
        return panel;
      }
    }
  };

  return {
    context,
    container,
    featureRegistry,
    schedules,
    stockWithHero,
    stockWithoutHero,
    umm,
    ummRegistrations
  };
}

function ownedHero(row) {
  return row.FindChildTraverse("QolLiteRecentPurchaseHero");
}

const sourcePath = path.join(__dirname, "..", "panorama", "scripts", "qollite_recent_purchases.js");
const source = fs.readFileSync(sourcePath, "utf8");
const harness = makeHarness();
vm.runInNewContext(source, harness.context, { filename: sourcePath });

const feature = harness.featureRegistry.recentPurchases;
assert.ok(feature, "feature registers through the QolLite runtime");
feature.init();
assert.deepEqual(
  harness.ummRegistrations.map((entry) => entry.id),
  ["recent_purchases"],
  "UMM owns the recent-purchases setting registration"
);
assert.equal(harness.ummRegistrations[0].definition.defaults.enabled, true, "feature defaults to enabled");

assert.ok(ownedHero(harness.stockWithHero), "an identified stock hero receives one owned enhancement panel");
assert.equal(ownedHero(harness.stockWithHero).attributes.hero, "hero_haze", "hero identity comes directly from stock data");
assert.equal(ownedHero(harness.stockWithoutHero), null, "rows without stock hero identity are not guessed");
assert.ok(harness.stockWithHero.classes.has("QolLiteRecentPurchase"), "feature marks only its enhanced row");
assert.equal(harness.container.children.length, 2, "Valve rows are retained while enabled");

const beforeDisable = harness.schedules.slice();
assert.equal(harness.umm.handle({ umm: 2, t: "set", id: "recent_purchases", key: "enabled", v: false }), false, "wrong UMM protocol is ignored");
assert.equal(harness.umm.handle({ umm: 1, t: "set", id: "other", key: "enabled", v: false }), false, "wrong UMM setting is ignored");
assert.equal(harness.umm.handle({ umm: 1, t: "set", id: "recent_purchases", key: "enabled", v: "false" }), false, "malformed UMM values are ignored");
assert.ok(ownedHero(harness.stockWithHero), "ignored messages do not change rendering");

assert.equal(harness.umm.handle({ umm: 1, t: "set", id: "recent_purchases", key: "enabled", v: false }), true, "valid UMM disable is accepted by foundation");
assert.equal(ownedHero(harness.stockWithHero), null, "disable removes the owned panel only");
assert.equal(harness.stockWithHero.classes.has("QolLiteRecentPurchase"), false, "disable removes owned classes");
assert.equal(harness.container.children.length, 2, "disable preserves every Valve row");
for (const schedule of beforeDisable) {
  schedule.callback();
}
assert.equal(ownedHero(harness.stockWithHero), null, "callbacks queued before disable are inert");

assert.equal(harness.umm.handle({ umm: 1, t: "set", id: "recent_purchases", key: "enabled", v: true }), true, "valid UMM enable is accepted by foundation");
assert.equal(ownedHero(harness.stockWithHero), null, "re-enable does not replay an old stock row");
const laterStockRow = new Panel("stock-c", ["recentPurchase"]);
laterStockRow.AddChild(new Panel("RecentPurchaseHeroImage", [], { hero: "hero_lash" }));
harness.container.AddChild(laterStockRow);
feature.refresh();
assert.ok(ownedHero(laterStockRow), "new stock rows are enhanced after re-enable");
assert.equal(harness.container.children.length, 3, "refresh never deletes stock rows");

const beforeDestroy = harness.schedules.slice();
feature.destroy();
assert.equal(ownedHero(laterStockRow), null, "destroy removes owned panels");
assert.equal(laterStockRow.classes.has("QolLiteRecentPurchase"), false, "destroy removes owned classes");
for (const schedule of beforeDestroy) {
  schedule.callback();
}
assert.equal(ownedHero(laterStockRow), null, "callbacks queued before destroy are inert");
assert.equal(harness.container.children.length, 3, "destroy preserves Valve rows");

console.log("recent-purchases validation passed");
