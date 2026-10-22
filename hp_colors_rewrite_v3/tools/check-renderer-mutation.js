#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const evidence = path.join(root, '.build/evidence');
const scratch = path.join(root, '.build/renderer-noop-mutation');
fs.mkdirSync(evidence, { recursive: true });
fs.rmSync(scratch, { recursive: true, force: true });
try {
  fs.cpSync(path.join(root, 'panorama'), path.join(scratch, 'panorama'), { recursive: true });
  const renderer = path.join(scratch, 'panorama/scripts/hp_colors_v3_renderer.js');
  const original = fs.readFileSync(renderer, 'utf8');
  const anchor = 'function apply(next) {';
  if (original.split(anchor).length !== 2) throw new Error('Mutation anchor missing or ambiguous');
  fs.writeFileSync(renderer, original.replace(anchor, anchor + '\n    return 0; // Mutation: suppress every renderer style write.'));
  // Run the two intended mutation killers; unrelated panel-identity failures can serialize huge graphs.
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern=^(?:menu edit publishes|active operation ceiling)', path.join(root, 'tests/renderer.test.js')], {
    env: { ...process.env, HPV3_SOURCE_ROOT: scratch, HPV3_DEBUG: '0' }, encoding: 'utf8', timeout: 60000,
  });
  fs.writeFileSync(path.join(evidence, 'ticket03-renderer-noop-mutation.tap'), result.stdout + result.stderr);
  const failing = result.stdout.split('\n').filter(line => line.startsWith('not ok'));
  if (result.status !== 1 || !failing.some(line => line.includes('menu edit publishes')) || !failing.some(line => line.includes('active operation ceiling'))) {
    throw new Error('No-op mutation was not killed by both E2E painting and active operations checks: exit=' + result.status);
  }
  console.log('No-op renderer mutation rejected: ' + failing.length + ' failing behavioral checks; original source untouched.');
  console.log('Evidence: hp_colors_rewrite_v3/.build/evidence/ticket03-renderer-noop-mutation.tap');
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
