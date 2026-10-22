'use strict';
// Whole-codebase audit 3 (P2): each Escape-menu fixture is ~10 MiB of mock panels (1,889 panels).
// Finished fixtures are garbage, but V8 may defer their collection, so a file's peak resident
// size depended on GC timing. The v3 harness keeps finished fixtures from piling up, whatever V8
// decides, and compiles each script once per process.
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadLayout, heapStats } = require('./boot-layout');

// Harness limit 128 MiB plus one finished menu fixture and its scheduler work.
const START_LIMIT_MIB = 160;
let worst = 0;
for (let i = 0; i < 120; i++) test('memory: fixture ' + i + ' boots the real menu and is dropped', () => {
  worst = Math.max(worst, process.memoryUsage().heapUsed / 1048576);
  const boot = loadLayout('hud_escape_menu.xml');
  boot.includeScripts(); boot.onload(); boot.harness.scheduler.runFor(1000, 2000);
  assert.equal(boot.harness.contextPanel.FindChildTraverse('HPColorsMenuHost').GetAttributeString('hpv3_boot', ''), 'ready');
});
test('memory: no test starts with more than ' + START_LIMIT_MIB + ' MiB of heap after 120 menu fixtures', () => {
  assert.ok(worst <= START_LIMIT_MIB, 'worst heap at test start ' + Math.round(worst) + ' MiB');
});
test('memory: each menu script compiles once and is reused by every fixture', () => {
  assert.ok(heapStats && heapStats.compiled > 0, 'harness reports compilations');
  assert.ok(heapStats.reused >= 119 * heapStats.compiled / 2, JSON.stringify(heapStats));
});
