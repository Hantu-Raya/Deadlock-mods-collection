"use strict";

// Exercise record data only, without Panorama panels or mocks.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../panorama/scripts/test_topbar_pickups.js"), "utf8");
const grouping = source.slice(source.indexOf("  function readUnits("), source.indexOf("  function findRows("));
const records = {
  a: { name: "ALICE", at: 50000 }, b: { name: "ALICE", at: 50000 }, c: { name: "ALICE", at: 50000 },
  renamed: { name: "BOB", at: 50000 }, unrelated: { name: "CAROL", at: 50000 },
  boundary: { name: "EDGE", at: 26000 }, expired: { name: "OLD", at: 25999 },
  future: { name: "FUTURE", at: 50001 }, tombstone: { name: "", at: 50000 }
};
const counters = Object.create(null);
const count = key => { counters[key] = (counters[key] || 0) + 1; };
const readUnits = new Function("receivedRecords", "ttl", "Date", "profile", "telemetryCount",
  grouping + "\nreturn readUnits;")(records, 24000, { now: () => 50000 }, { count }, count);
const scoped = readUnits("ALICE", "BOB");
assert.deepEqual(Object.keys(scoped).sort(), ["ALICE", "BOB"]);
assert.equal(scoped.ALICE, -1);
assert.equal(scoped.BOB, records.renamed);
assert.equal("expired" in records, false);
assert.equal("future" in records, false);
assert.equal(readUnits().EDGE, records.boundary);
assert.equal(readUnits().CAROL, records.unrelated);
delete records.b;
delete records.c;
assert.equal(readUnits("ALICE").ALICE, records.a);
assert.deepEqual(Object.keys(readUnits("", "ALICE")), ["ALICE"]);
records.a = { name: "", at: 50000 };
assert.deepEqual(Object.keys(readUnits("", "ALICE")), []);
console.log("PASS: scoped grouping, duplicate recovery, rename/tombstone lookup, and global expiry boundaries. No Panorama mocks.");