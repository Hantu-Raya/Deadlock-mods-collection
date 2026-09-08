"use strict";

// Run the runtime's pure predicate without creating any Panorama panels or mocks.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../panorama/scripts/test_topbar_pickups.js"), "utf8");
const predicate = source.slice(source.indexOf("  function mayContainSnapshot("), source.indexOf("  function receiveSnapshot("));
const mayContainSnapshot = new Function(predicate + "\nreturn mayContainSnapshot;")();
for (const [magic, isHud] of [["HPV2_PICKUP_SCAN_GATE", false], ["HPV2_ULTIMATE_SNAPSHOT", false], ["HPV2_PICKUP_SNAPSHOT", true]]) {
  const message = { magic_word: magic, at: 20 };
  const supported = [JSON.stringify(message), JSON.stringify(message, null, 2),
    JSON.stringify({ at: 20, magic_word: magic }),
    JSON.stringify(message).replace("magic_word", "magic_\\u0077ord"),
    '{"magic_word":"other","magic_word":"' + magic + '"}'];
  for (let i = 0; i < magic.length; i++) {
    supported.push(JSON.stringify(message).replace(magic,
      magic.slice(0, i) + "\\u" + magic.charCodeAt(i).toString(16).padStart(4, "0") + magic.slice(i + 1)));
  }
  for (const raw of supported) {
    assert.equal(JSON.parse(raw).magic_word, magic);
    assert.equal(mayContainSnapshot(raw, isHud), true, raw);
  }
  assert.equal(mayContainSnapshot(JSON.stringify(message), !isHud), false, magic);
  // This is only a prefilter: nested markers still require full message validation.
  const lookalike = JSON.stringify({ nested: message });
  assert.equal(mayContainSnapshot(lookalike, isHud), true);
  assert.notEqual(JSON.parse(lookalike).magic_word, magic);
}
for (const isHud of [false, true]) {
  for (const raw of ['null', '{}', '{"magic_word":"HP_COLORS_V2_CONFIG"}']) {
    assert.equal(mayContainSnapshot(raw, isHud), false, raw);
  }
  const malformed = '{"magic_word":"\\uZZZZ"}';
  assert.equal(mayContainSnapshot(malformed, isHud), true);
  assert.throws(() => JSON.parse(malformed), SyntaxError);
}
console.log("PASS: HUD/world routing skips irrelevant JSON; escaped, reordered, duplicate-key, and nested markers still reach validation. No Panorama mocks.");
