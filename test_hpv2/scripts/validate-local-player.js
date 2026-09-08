"use strict";

// Exercise the actual predicates on strings/timestamps, without Panorama panels or mocks.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../panorama/scripts/test_topbar_pickups.js"), "utf8");
const skipCondition = source.match(/if \((name && name === localPlayerName[^\n]+)\) \{/)[1];
const skip = new Function("name", "localPlayerName", "now", "gateReceivedAt", "return " + skipCondition + ";");
assert.equal(skip("ALICE", "ALICE", 1000, 1000), true);
assert.equal(skip("BOB", "ALICE", 1000, 1000), false);
assert.equal(!!skip("", "", 1000, 1000), false);
assert.equal(skip("ALICE", "ALICE", 15999, 1000), true);
assert.equal(skip("ALICE", "ALICE", 16000, 1000), false);
assert.equal(skip("ALICE", "ALICE", 999, 1000), false);
const uniqueCondition = source.match(/var localName = (localPlayerLabels.length === 1) \?/)[1];
const unique = new Function("localPlayerLabels", "return " + uniqueCondition + ";");
assert.equal(unique(["ALICE"]), true);
assert.equal(unique([]), false);
assert.equal(unique(["ALICE", "BOB"]), false);
const seed = source.match(/if \(localName\) counts\[localName\] = \(counts\[localName\] \|\| 0\) \+ 1;/)[0];
const countBody = source.slice(source.indexOf("      var previousCount = counts[name]"), source.indexOf("\n    }", source.indexOf("      var previousCount = counts[name]")));
const countsFor = new Function("locals", "others", "telemetryCount",
  "var counts = Object.create(null); for (var localName of locals) {" + seed + "}\nfor (var name of others) {" + countBody + "} return counts;");
const duplicates = countsFor(["ALICE"], ["ALICE", "BOB"], () => {});
assert.equal(duplicates.ALICE, 2, "Excluded local row must still prevent same-name misattribution");
assert.equal(duplicates.BOB, 1);
assert.equal(countsFor(["ALICE", "BOB"], ["BOB"], () => {}).BOB, 2);
const gateStart = source.indexOf('if (message && message.magic_word === "HPV2_PICKUP_SCAN_GATE"');
const gateCondition = source.slice(gateStart + 4, source.indexOf(") {", gateStart));
const accept = new Function("message", "now", "sessionStartedAt", "gateReceivedAt", "return " + gateCondition + ";");
const gate = { magic_word: "HPV2_PICKUP_SCAN_GATE", scan: true, localName: "ALICE", since: 500, at: 1000 };
assert.equal(accept(gate, 1000, 500, 900), true);
assert.equal(accept({ ...gate, localName: "" }, 1000, 500, 900), true);
for (const localName of [undefined, null, 42, "A".repeat(257)])
  assert.equal(accept({ ...gate, localName }, 1000, 500, 900), false);
assert.equal(accept(gate, 16000, 500, 900), false);
assert.equal(accept(gate, 1000, 501, 900), false);
assert.equal(accept(gate, 1000, 500, 1001), false);
console.log("PASS: local-only exclusion, unknown/duplicate identity, stale/future gates, and session/order validation. No Panorama mocks.");