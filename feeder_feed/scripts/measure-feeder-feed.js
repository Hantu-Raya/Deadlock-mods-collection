"use strict";
// Synthetic native-call counts for feeder_feed.js (evidence level 1, not FPS).
// Run: node feeder_feed/scripts/measure-feeder-feed.js [--output <file>] [--callers] [--compare <old.json>]
// FEEDER_FEED_SOURCE=<other feeder_feed.js> measures another copy. Old-vs-new: measure the old
// copy with --output, then run the current script with --compare <that file>; it prints the
// per-scenario totals and fails when the observed outputs (logs, rows, footer, pills) differ.
// Counts every Panel method call and $ API call made by the script, per poll tick; property reads
// (.text, .heroid, .paneltype, .id) are not counted. --callers adds the calling functions.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const fixture = require("./feeder-feed-fixture");
const { Panel, entry, setup, observed } = fixture;

const args = process.argv.slice(2);
const output = args.includes("--output") ? args[args.indexOf("--output") + 1] : null;
const withCallers = args.includes("--callers");
const compare = args.includes("--compare") ? args[args.indexOf("--compare") + 1] : null;
if (withCallers) Error.stackTraceLimit = 40;

// Only calls made while measure() runs count; the harness's own panel building does not, and
// nested mock calls (a FindChildTraverse walking children) count once at the outer call.
let measuring = false;
let counts = {};
let callers = {};
let depth = 0;
// Caller = the two innermost script functions above the call, skipping the valid() wrapper.
function hit(method) {
  counts[method] = (counts[method] || 0) + 1;
  if (!withCallers) return;
  const names = (new Error().stack || "").split("\n").filter((line) => line.includes("feeder_feed.js:"))
    .map((line) => (/at (?:Object\.)?(\S+) \(/.exec(line) || [, "<anonymous>"])[1])
    .filter((fn) => fn !== "valid" && fn !== "<anonymous>" && !fn.startsWith("Array."));
  const where = names.slice(0, 2).join("<") || "<harness>";
  callers[where + " " + method] = (callers[where + " " + method] || 0) + 1;
}
fixture.onNative = (name) => { if (measuring) hit(name); };
for (const name of Object.getOwnPropertyNames(Panel.prototype)) {
  if (name === "constructor" || name === "add") continue;
  const original = Panel.prototype[name];
  Panel.prototype[name] = function(...callArgs) {
    if (measuring && depth === 0) hit(name);
    depth++;
    try { return original.apply(this, callArgs); } finally { depth--; }
  };
}

function measure(name, run, fn) {
  counts = {}; callers = {};
  measuring = true;
  try { fn(); } finally { measuring = false; }
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  const result = { name, total: Object.values(counts).reduce((a, b) => a + b, 0), counts: sorted(counts) };
  if (withCallers) result.callers = sorted(callers);
  if (run.logs.some((l) => l.includes("ERR"))) throw new Error("runtime error in " + name + ": " + run.logs.filter((l) => l.includes("ERR")));
  return result;
}

const STATS = { VENATOR: { kills: "3", souls: "2000" }, INFERNUS: { souls: "2000" }, LASH: { souls: "2000" },
  SEVEN: { souls: "2000" }, HAZE: { souls: "2000" }, ABRAMS: { souls: "2000" } };
const FULL_ROSTER = {
  friendly: [["xXSniperXx", "SEVEN", 2], ["potato", "HAZE", 13], ["friendly filler", "ABRAMS", 6],
    ["f4", "SHIV", 19], ["f5", "YAMATO", 27], ["f6", "WRAITH", 7]],
  enemy: [["bob", "VENATOR", 65], ["carl", "INFERNUS", 1], ["dave", "LASH", 31],
    ["e4", "VINDICTA", 3], ["e5", "DYNAMO", 11], ["e6", "IVY", 20]]
};
// A hero death as live games show it: portrait hero ids, one portrait assister.
let deaths = 0;
const death = (spectating, portraits = true) => entry("killer" + ++deaths, spectating ? "team_2" : "enemy", "v", spectating ? "team_1" : "friendly",
  "1152", ["teammateDied", "hasGold", "hasAssists"], 1, portraits ? [1] : null, { killer: 65, victim: 2 });
const trooper = (spectating) => entry("Trooper", spectating ? "team_2" : "enemy", "v", spectating ? "team_1" : "friendly",
  "300", ["teammateDied", "hasGold"], 0, null, { victim: 13 });

function ready(spectating, active, roster) {
  fixture.stats = JSON.parse(JSON.stringify(STATS));
  const run = setup("16:02", roster);
  run.tick();
  run.hud.SetHasClass("GameStateInProgress", true);
  if (!spectating) run.hud.SetHasClass("localPlayerTeam1", true);
  run.tick();
  for (let i = 0; i < 5; i++) run.feed.add(death(spectating));
  run.tick(); run.tick();
  if (active) run.report.FindChildTraverse("FeederTabFeed")._events.onactivate();
  return run;
}

const results = [];
const runs = [];
for (const spectating of [false, true]) for (const active of [false, true]) {
  const label = (spectating ? "spectating" : "playing") + "/" + (active ? "active" : "inactive");
  const run = ready(spectating, active);
  runs.push(run);
  results.push(measure(label + "/idle-5", run, () => run.tick()));
  for (let i = 0; i < 3; i++) run.feed.add(death(spectating));
  results.push(measure(label + "/burst-3-deaths", run, () => run.tick()));
  results.push(measure(label + "/settled-8", run, () => run.tick()));
  run.feed.add(trooper(spectating));
  results.push(measure(label + "/trooper-kill", run, () => run.tick()));
}
// Without portraits the top-bar assist counters are the fallback; waiting must keep retrying.
for (const spectating of [false, true]) {
  const label = spectating ? "spectating" : "playing";
  const run = ready(spectating, false);
  runs.push(run);
  for (let i = 0; i < 3; i++) run.feed.add(death(spectating, false));
  results.push(measure(label + "/fallback-burst", run, () => run.tick()));
  results.push(measure(label + "/fallback-pending-100ms", run, () => run.tick()));
  results.push(measure(label + "/fallback-pending-200ms", run, () => run.tick()));
}
for (const active of [false, true]) {
  const run = ready(false, active, FULL_ROSTER);
  runs.push(run);
  for (let i = 0; i < 3; i++) run.feed.add(death(false));
  results.push(measure("playing/12players/" + (active ? "active" : "inactive") + "/burst-3-deaths", run, () => run.tick()));
  results.push(measure("playing/12players/" + (active ? "active" : "inactive") + "/idle-8", run, () => run.tick()));
}

const outputs = runs.map(observed);
const digest = crypto.createHash("sha256").update(JSON.stringify(outputs)).digest("hex").slice(0, 16);
const report = { source: path.relative(process.cwd(), fixture.SOURCE), observedDigest: digest, results, observed: outputs };
if (output) {
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
}
for (const r of results) console.log(r.name.padEnd(42) + " total=" + String(r.total).padStart(4) + " " + JSON.stringify(r.counts));
console.log("observed digest " + digest + (output ? "; report " + output : ""));
if (compare) {
  const old = JSON.parse(fs.readFileSync(compare, "utf8"));
  let before = 0;
  let after = 0;
  for (const r of results) {
    const o = old.results.find((x) => x.name === r.name);
    if (!o) continue;
    before += o.total;
    after += r.total;
    if (o.total !== r.total) console.log("  " + r.name.padEnd(42) + " " + o.total + " -> " + r.total);
  }
  console.log("compare " + old.source + ": all scenarios " + before + " -> " + after + " native calls");
  if (old.observedDigest !== digest) {
    console.error("observed outputs differ from " + compare + " (" + old.observedDigest + " vs " + digest + ")");
    process.exitCode = 1;
  } else {
    console.log("observed outputs identical");
  }
}
