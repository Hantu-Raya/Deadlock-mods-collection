"use strict";

// Run the runtime's pure predicate without creating any Panorama panels or mocks.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../panorama/scripts/test_topbar_pickups.js"), "utf8");
const predicate = source.slice(source.indexOf("  function mayContainScanGate("), source.indexOf("  function receiveSnapshot("));
const mayContainScanGate = new Function(predicate + "\nreturn mayContainScanGate;")();
const magic = "HPV2_PICKUP_SCAN_GATE";
const gate = { magic_word: magic, scan: true, localName: "", since: 10, at: 20 };
const supported = [JSON.stringify(gate), JSON.stringify(gate, null, 2),
  JSON.stringify({ at: 20, scan: false, magic_word: magic, since: 10 }),
  JSON.stringify(gate).replace("magic_word", "magic_\\u0077ord"),
  '{"magic_word":"other","magic_word":"HPV2_PICKUP_SCAN_GATE","scan":true}'];
for (let i = 0; i < magic.length; i++) {
  supported.push(JSON.stringify(gate).replace(magic,
    magic.slice(0, i) + "\\u" + magic.charCodeAt(i).toString(16).padStart(4, "0") + magic.slice(i + 1)));
}
for (const raw of supported) {
  assert.equal(JSON.parse(raw).magic_word, magic);
  assert.equal(mayContainScanGate(raw), true, raw);
}
for (const raw of ['null', '{}', '{"magic_word":"HPV2_PICKUP_SNAPSHOT","record":null}', '{"magic_word":"HP_COLORS_V2_CONFIG"}']) {
  assert.equal(mayContainScanGate(raw), false, raw);
}
// This is only a prefilter: lookalikes and malformed escaped input still need validation.
const lookalike = JSON.stringify({ nested: gate });
assert.equal(mayContainScanGate(lookalike), true);
assert.notEqual(JSON.parse(lookalike).magic_word, magic);
const malformed = '{"magic_word":"\\uZZZZ"}';
assert.equal(mayContainScanGate(malformed), true);
assert.throws(() => JSON.parse(malformed), SyntaxError);
console.log("PASS: unescaped irrelevant messages skip parsing; reordered, spaced, escaped, and duplicate-key gates pass through. No Panorama mocks.");
