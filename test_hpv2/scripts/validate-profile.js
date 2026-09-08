"use strict";

// Exercise only the clock/aggregation factory, not a mocked Panorama runtime.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../panorama/scripts/test_pickup_profile.js"), "utf8");
const factorySource = source.slice(source.indexOf("  function createPickupProfile("), source.indexOf("\n  var context ="));
let wall = 0;
let clock = 0;
const create = new Function("Date", factorySource + "\nreturn createPickupProfile;")({ now: () => wall });
const chunks = [];
const profile = create("hud", "check", "", () => clock, "controlled", raw => chunks.push(JSON.parse(raw)));
const receiver = { result: {} };
const leaf = profile.wrap("leaf", function (value) { clock += value; return this.result; });
const outer = profile.wrap("outer", function () {
  clock += 2;
  const value = leaf.call(this, 3);
  clock += 4;
  return value;
});
assert.equal(outer.call(receiver), receiver.result);
const failure = new Error("real thrown identity");
const throwing = profile.wrap("throwing", () => { clock += 2; throw failure; });
assert.throws(throwing, error => error === failure);
profile.count("searches", 4);
profile.flush(true);
const report = JSON.parse(chunks.map(chunk => chunk.data).join(""));
const rows = Object.fromEntries(report.topSelf.map(row => [row.label, row]));
assert.equal(rows.outer.totalMs, 9);
assert.equal(rows.outer.selfMs, 6);
assert.equal(rows.leaf.totalMs, 3);
assert.equal(rows.throwing.thrown, 1);
assert.equal(rows.throwing.totalMs, 2);
assert.equal(report.counters.searches, 4);

// Recursion needs one timing frame per invocation, not per function label.
const recursionChunks = [];
const recursiveProfile = create("hud", "recursive", "", () => clock, "controlled", raw => recursionChunks.push(JSON.parse(raw)));
const recursive = recursiveProfile.wrap("recursive", n => { clock++; if (n) recursive(n - 1); clock++; });
recursive(2);
recursiveProfile.flush(true);
const recursiveRow = JSON.parse(recursionChunks.map(chunk => chunk.data).join("")).topSelf[0];
assert.equal(recursiveRow.calls, 3);
assert.equal(recursiveRow.totalMs, 12);
assert.equal(recursiveRow.selfMs, 6);

// Reporting stays outside active frames and stops after the bounded capture.
let reports = 0;
let lastParts = [];
const bounded = create("hud", "bounded", "", () => clock, "controlled", raw => {
  const part = JSON.parse(raw);
  if (part.part === 1) { reports++; lastParts = []; }
  lastParts.push(part.data);
});
const measured = bounded.wrap("measured", () => { clock++; bounded.flush(false); clock++; });
wall += 29999;
measured();
assert.equal(reports, 0);
wall++;
measured();
assert.equal(reports, 1);
assert.equal(JSON.parse(lastParts.join("")).windowMs, 30000);
for (let n = 0; n < 245; n++) { wall += 30000; measured(); }
assert.equal(reports, 240);
assert.equal(JSON.parse(lastParts.join("")).topSelf[0].totalMs, 2);
bounded.start();
wall += 30000;
measured();
assert.equal(reports, 240);

// A coarse or reversing clock must not manufacture negative durations.
const coarseChunks = [];
const coarse = create("hud", "coarse", "", () => clock, "coarse", raw => coarseChunks.push(JSON.parse(raw)));
coarse.wrap("zero", () => {})();
coarse.wrap("backwards", () => { clock--; })();
coarse.flush(true);
const coarseReport = JSON.parse(coarseChunks.map(chunk => chunk.data).join(""));
assert.equal(coarseReport.badClock, 1);
assert.ok(coarseReport.topSelf.every(row => row.totalMs === 0 && row.zeroCalls === 1));
console.log("PASS: nested/self timing, recursion, return/throw identity, deferred reports, capture cap, coarse/backwards clock. No Panorama mocks.");
