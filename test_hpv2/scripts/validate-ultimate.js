"use strict";

// Exercise the runtime's clip parser and wire validation without Panorama mocks.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../panorama/scripts/test_topbar_pickups.js"), "utf8");
const pure = source.slice(source.indexOf("  function unlockAngle("), source.indexOf("  function hideWorldUltimate("));
const { unlockAngle, parseUltimateClip, validUltimates } = new Function(pure + "\nreturn { unlockAngle, parseUltimateClip, validUltimates };")();
for (const [text, angle] of [["0", 0], ["600", 0], ["2.2k", 180], ["3,800", 360], ["<b>3,8k</b>", 360], ["3\u202f800", 360], ["4K", 360]])
  assert.equal(unlockAngle(text), angle);
for (const text of ["", "{g:citadel_thousands:gold}", "unknown", "-600", "3..8K"])
  assert.equal(unlockAngle(text), null);
assert.equal(parseUltimateClip("radial(50.0% 50.0%, 0.0deg, 40.588818deg)"), 40.588818);
assert.equal(parseUltimateClip("radial(50% 50%, 0deg, 360deg)"), 360);
assert.equal(parseUltimateClip("radial(50% 50%, 0deg, 0deg)"), 0);
for (const clip of ["", "none", "radial(50% 50%, 0deg, -90deg)", "radial(50% 50%, 0deg, 361deg)", "radial(0% 50%, 0deg, 90deg)"])
  assert.equal(parseUltimateClip(clip), null);
const snapshot = { magic_word: "HPV2_ULTIMATE_SNAPSHOT", since: 100, at: 1000, players: [["LOCKED", 180], ["COOLDOWN", 40.588818], ["READY", 360]] };
assert.equal(validUltimates(snapshot, 1000, 100, 900), true);
assert.equal(validUltimates({ ...snapshot, players: [] }, 1000, 100, 900), true);
assert.equal(validUltimates(snapshot, 4999, 100, 900), true);
assert.equal(validUltimates(snapshot, 5000, 100, 900), false);
assert.equal(validUltimates(snapshot, 999, 100, 900), false);
assert.equal(validUltimates(snapshot, 1000, 101, 900), false);
assert.equal(validUltimates(snapshot, 1000, 100, 1001), false);
for (const players of [[["A", 0], ["A", 360]], [["", 0]], [["lowercase", 0]], [["A", -0.5]], [["A", 361]], [["A", null]], [["A", NaN]], [["A".repeat(257), 0]], Array.from({ length: 13 }, (_, i) => [String(i), 0])])
  assert.equal(validUltimates({ ...snapshot, players }, 1000, 100, 900), false);
assert.equal(validUltimates({ ...snapshot, players: [["A", -1]] }, 1000, 100, 900), false);
console.log("PASS: native ultimate clip, locked/cooldown/ready states, duplicate names, malformed payloads, stale/future/order/session boundaries. No Panorama mocks.");
