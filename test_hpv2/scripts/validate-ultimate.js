"use strict";

// Exercise the actual parser and snapshot boundary without Panorama mocks.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../panorama/scripts/test_topbar_pickups.js"), "utf8");
const pure = source.slice(source.indexOf("  function parseUltimateClip("), source.indexOf("  function clearUltimate("));
const { parseUltimateClip, validUltimates } = new Function(pure + "\nreturn { parseUltimateClip, validUltimates };")();
assert.equal(parseUltimateClip("radial(50.0% 50.0%, 0.0deg, 40.588818deg)"), 40.588818);
assert.equal(parseUltimateClip("radial(50% 50%, 0deg, 0deg)"), 0);
assert.equal(parseUltimateClip("radial(50% 50%, 0deg, 360deg)"), 360);
for (const raw of ["none", "radial(50% 50%, 0deg, -1deg)", "radial(50% 50%, 0deg, 361deg)", "radial(50% 50%, 90deg, 10deg)"]) {
  assert.equal(parseUltimateClip(raw), null);
}
const snapshot = { magic_word: "HPV2_ULTIMATE_SNAPSHOT", at: 1000, since: 100, players: [["LOCKED", 0], ["COOLDOWN", 40.588818], ["READY", 360], ["__PROTO__", 1]] };
assert.equal(validUltimates(snapshot, 4999, 100, 900), true);
assert.equal(validUltimates(snapshot, 5000, 100, 900), false);
assert.equal(validUltimates(snapshot, 999, 100, 900), false);
assert.equal(validUltimates(snapshot, 1000, 100, 1001), false);
assert.equal(validUltimates(snapshot, 1000, 101, 900), false);
assert.equal(validUltimates({ ...snapshot, magic_word: "OTHER" }, 1000, 100, 900), false);
assert.equal(validUltimates({ ...snapshot, at: NaN }, 1000, 100, 900), false);
for (const players of [null, [["A", 0], ["A", 360]], [["a", 1]], [[" A", 1]], [["", 0]], [["A", -1]], [["A", 361]], [["A", null]], [["A", NaN]], [["A".repeat(257), 0]], Array.from({ length: 13 }, (_, i) => [String(i), 0])]) {
  assert.equal(validUltimates({ ...snapshot, players }, 1000, 100, 900), false);
}
assert.equal(validUltimates({ ...snapshot, players: [] }, 1000, 100, 900), true);
console.log("PASS: native ultimate angles, empty snapshots, duplicate identities, malformed payloads, and timestamp/session boundaries. No Panorama mocks.");
