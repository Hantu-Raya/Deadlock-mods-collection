'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadLayout, sourceRoot } = require('./boot-layout');
const { computed } = require('./style-cascade');

const root = path.resolve(__dirname, '..');
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'settings/record.json'), 'utf8'));
function menu(options = {}) {
  const boot = loadLayout('hud_escape_menu.xml', options);
  boot.includeScripts(); boot.onload();
  const h = boot.harness;
  const find = id => { const panel = h.contextPanel.FindChildTraverse(id); assert.ok(panel, id); return panel; };
  return { h, find };
}

test('ticket 30: release label is muted and anchored at the preview bottom right', () => {
  const m = menu(), label = m.find('HPColorsPreviewVersion'), footer = m.find('HPColorsPreviewFooter');
  assert.equal(label.text, 'v' + metadata.release);
  // The footer sits in the bottom stack, above the supporter strip (user, 2026-10-17).
  const bottom = m.find('HPColorsPreviewBottom'), strip = m.find('HPColorsSupporterStrip');
  assert.ok(label.GetParent() === footer); assert.ok(footer.GetParent() === bottom); assert.ok(bottom.GetParent() === m.find('HPColorsPreview'));
  assert.ok(strip.GetParent() === bottom); assert.ok(bottom.Children().indexOf(footer) < bottom.Children().indexOf(strip));
  assert.equal(computed(bottom, 'ignoreParentFlow'), 'true');
  assert.equal(computed(bottom, 'verticalAlign'), 'bottom');
  assert.equal(computed(bottom, 'flowChildren'), 'down');
  // User 2026-10-17: CREDITS/DONATE flow from the left; the version label pins to the right edge.
  assert.equal(computed(footer, 'width'), '100%');
  assert.equal(computed(label, 'ignoreParentFlow'), 'true'); assert.equal(computed(label, 'horizontalAlign'), 'right');
  assert.equal(computed(footer, 'flowChildren'), 'right'); assert.equal(computed(label, 'verticalAlign'), 'center');
  const credits = m.find('HPColorsPreviewCreditsButton');
  assert.ok(credits.GetParent() === footer); assert.ok(footer.Children().indexOf(credits) < footer.Children().indexOf(label));
  assert.equal(credits.Children()[0].text, 'CREDITS'); assert.equal(typeof credits.events.onactivate, 'function');
  assert.equal(computed(label, 'fontSize'), '14px');
  assert.equal(computed(label, 'color'), '#FFEFD744');
  assert.equal(label.GetAttributeString('hittest', ''), 'false');
});

test('ticket 30: changing the release source alone updates the generated pane, not wire versions or slots', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-release-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const record = path.join(dir, 'record.json'), out = path.join(dir, 'out');
  fs.writeFileSync(record, JSON.stringify({ ...metadata, release: '3.1.7' }));
  const generated = spawnSync(process.execPath, [path.join(root, 'tools/generate.js'),
    '--record-contract', record, '--output-root', out], { encoding: 'utf8' });
  assert.equal(generated.status, 0, generated.stderr);
  const m = menu({ sourceRoot: out, resolveScript: relative =>
    path.join(fs.existsSync(path.join(out, relative)) ? out : sourceRoot, relative) });
  assert.equal(m.find('HPColorsPreviewVersion').text, 'v3.1.7');
  assert.equal(m.h.$.HPColorsV3Settings.version, '3.0.0', 'wire contract is not the release');
  assert.equal(m.h.$.HPColorsV3Settings.recordVersion, 16);
  for (const file of ['defaults.json', 'slots.json']) {
    assert.equal(fs.readFileSync(path.join(out, 'generated', file), 'utf8'),
      fs.readFileSync(path.join(root, 'generated', file), 'utf8'));
  }
});

