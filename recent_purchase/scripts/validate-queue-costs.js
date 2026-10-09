// Runs recent_purchase_queue_costs.js (readable or Closure output) inside a mock
// quickbuy HUD and checks what the player sees: TOTAL and each item's remaining souls.
// Usage: node validate-queue-costs.js [script.js]   (default: readable source)
//
// Failure modes covered:
// - Closure renames a property that is written by string key (costs read as 0, labels never written)
// - queue order reversed (wrong item receives the remaining souls)
// - recipe component not deducted, or deducted from an earlier item
// - planned sell credit leaking into per-item remaining souls
// - gold label missing (must count as 0 souls, not crash)
// - tick loop dying after the first run, or rewriting unchanged text every tick
"use strict";
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scriptPath = path.resolve(process.argv[2] || path.join(__dirname, "../panorama/scripts/recent_purchase_queue_costs.js"));
const source = fs.readFileSync(scriptPath, "utf8");

let writes = 0;
function panel(id, opts = {}, children = []) {
  const p = {
    id, classes: opts.classes || [], style: {}, parent: null, children, events: {},
    _text: opts.text === undefined ? "" : String(opts.text),
    get text() { return this._text; },
    set text(v) { writes++; this._text = String(v); },
    IsValid() { return true; },
    GetParent() { return this.parent; },
    GetChildCount() { return this.children.length; },
    GetChild(i) { return this.children[i] || null; },
    BHasClass(c) { return this.classes.includes(c); },
    SetPanelEvent(name, fn) { this.events[name] = fn; },
    FindChildTraverse(want) {
      for (const c of this.children) {
        if (c.id === want) return c;
        const hit = c.FindChildTraverse(want);
        if (hit) return hit;
      }
      return null;
    },
  };
  for (const c of children) c.parent = p;
  return p;
}

function entry(name, cost) {
  return panel("", { classes: ["QuickbuyItem"] }, [
    panel("ModName", { text: name }),
    panel("ModCost", { text: cost }),
    panel("goldIcon"),
    panel("RecentPurchaseCostDivider", { text: " / " }),
    panel("RecentPurchaseDeficitLabel", { text: "0" }),
  ]);
}

function run({ gold, queue, sell = [] }) {
  const total = panel("RecentPurchaseTotalCostLabel", { text: "0" });
  const queuePanel = panel("QuickbuyQueue", {}, queue.map(([n, c]) => entry(n, c)));
  const ctx = panel("HudQuickbuy", {}, [
    panel("QuickBuyQueueContainer", {}, [panel("", {}, [total]), panel("QuickbuySellQueue", {}, sell.map(([n, c]) => entry(n, c))), queuePanel]),
  ]);
  const hudChildren = [ctx];
  if (gold !== null) hudChildren.unshift(panel("CurrentGoldAmount", {}, [panel("hudCurGoldLabel", { text: gold })]));
  panel("Hud", {}, hudChildren);

  let pending = [];
  const sandbox = {
    $: {
      Schedule(_delay, fn) { pending.push(fn); },
      GetContextPanel() { return ctx; },
      DispatchEvent() {},
    },
  };
  vm.runInNewContext(source, sandbox, { filename: scriptPath });
  const tick = () => { const q = pending; pending = []; q.forEach((fn) => fn()); };
  tick();
  assert.ok(pending.length > 0, "tick loop must reschedule itself");

  const rows = queuePanel.children.map((e) => {
    const deficit = e.FindChildTraverse("RecentPurchaseDeficitLabel");
    return { name: e.FindChildTraverse("ModName").text, remaining: deficit.text, color: deficit.style.color, hasChat: typeof deficit.events.onactivate === "function" };
  });
  writes = 0;
  tick();
  return { total: total.text, rows, repeatWrites: writes };
}

const results = {};

// Screenshot case: 650 souls, nothing affordable in full.
results.screenshot = run({ gold: "650", queue: [["Sprint Boots", "800"], ["Counterspell", "3,200"], ["Metal Skin", "3,200"]] });
assert.strictEqual(results.screenshot.total, "7200");
assert.deepStrictEqual(results.screenshot.rows.map((r) => r.remaining), ["-150", "-3,200", "-3,200"]);
assert.ok(results.screenshot.rows.every((r) => r.color === "#d64259" && r.hasChat));
assert.strictEqual(results.screenshot.repeatWrites, 0, "unchanged state must not rewrite labels");

// Souls fill the queue top to bottom; covered items show 0 in the owned colour.
results.order = run({ gold: "4,500", queue: [["Sprint Boots", "800"], ["Counterspell", "3,200"], ["Metal Skin", "3,200"]] });
assert.deepStrictEqual(results.order.rows.map((r) => r.remaining), ["0", "0", "-2,700"]);
assert.strictEqual(results.order.rows[0].color, "#66ffd9");

// Recipe: Shadow Weave consumes the earlier Sprint Boots; a component queued after does not count.
results.recipe = run({ gold: "0", queue: [["Sprint Boots", "800"], ["Shadow Weave", "3,200"], ["Sprint Boots", "800"]] });
assert.strictEqual(results.recipe.total, "4000");
assert.deepStrictEqual(results.recipe.rows.map((r) => r.remaining), ["-800", "-2,400", "-800"]);

// Planned sells lower TOTAL only; their souls are not spendable yet.
results.sell = run({ gold: "650", queue: [["Sprint Boots", "800"]], sell: [["Extra Health", "800"]] });
assert.strictEqual(results.sell.total, "400");
assert.deepStrictEqual(results.sell.rows.map((r) => r.remaining), ["-150"]);

// No gold label: treated as 0 souls.
results.noGold = run({ gold: null, queue: [["Sprint Boots", "800"]] });
assert.deepStrictEqual(results.noGold.rows.map((r) => r.remaining), ["-800"]);

console.log(JSON.stringify({ script: path.basename(scriptPath), ok: true, results }));
