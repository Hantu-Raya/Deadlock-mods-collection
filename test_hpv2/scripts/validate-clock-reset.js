"use strict";

// Execute the runtime's clock comparison and baseline assignment on numbers only.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../panorama/scripts/test_topbar_pickups.js"), "utf8");
const condition = source.match(/if \((seconds !== null && lastGameTime !== null[^\n]+)\) \{/)[1];
const assignment = source.match(/^\s*(?:if \(seconds !== null\) )?lastGameTime = seconds;$/m)[0];
const observe = new Function("lastGameTime", "seconds",
  "const reset = (" + condition + ");" + assignment + "\nreturn { reset, lastGameTime };");
const gap = observe(600, null);
assert.equal(observe(gap.lastGameTime, 2).reset, true, "Clock reset must survive a missing clock reading");
assert.equal(observe(gap.lastGameTime, 605).reset, false);
assert.equal(observe(null, 2).reset, false);
assert.equal(observe(600, 600).reset, false);
assert.equal(observe(600, 2).reset, true);
console.log("PASS: clock reset survives missing readings without treating initial/equal/advancing time as resets. No Panorama mocks.");