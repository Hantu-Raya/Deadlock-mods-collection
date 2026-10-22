'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('disk-backed fake profiles live in a temporary directory and are removed after the test process exits', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-profile-proof-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const script = path.join(dir, 'profile.test.js');
  const fixture = path.resolve(__dirname, 'storage-fixture.js');
  fs.writeFileSync(script, 'const test=require("node:test"),fs=require("node:fs");const {profile}=require(' + JSON.stringify(fixture) + ');test("profile",()=>{const p=profile({saved:"look"});console.log("PROFILE_PATH="+p.file);if(JSON.parse(fs.readFileSync(p.file)).saved!=="look")throw new Error("missing profile");});');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // The nested runner must emit its own TAP rather than parent IPC serialization.
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', script], { encoding: 'utf8', env });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const match = result.stdout.match(/PROFILE_PATH=([^\r\n]+)/);
  assert.ok(match, result.stdout + result.stderr);
  const file = match[1];
  t.after(() => { if (fs.existsSync(file)) fs.unlinkSync(file); });
  assert.equal(path.relative(os.tmpdir(), file).startsWith('..'), false, 'profile must not pollute repository evidence');
  assert.equal(fs.existsSync(file), false, 'profile must be cleaned at process teardown');
});
