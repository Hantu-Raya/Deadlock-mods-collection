'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadLayout } = require('./boot-layout');
const { installTopBarIdentityTree, MockPanel } = require('../../scripts/hp-colors-panorama-test-adapter');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { WIRE_VERSION } = require('../tools/lib/settings-scripts');

test('boot logging matches the selected build mode and both real scripts execute', () => {
  const debug = process.env.HPV3_DEBUG === '1';
  for (const [layout, message, attribute, hostId] of [
    ['hud_escape_menu.xml', '[HPV3] menu boot ' + WIRE_VERSION, 'hpv3_boot', 'HPColorsMenuHost'],
    ['unit_status_overlay_v2.xml', '[HPV3] renderer boot ' + WIRE_VERSION, 'hpv3_renderer_boot', null],
  ]) {
    const boot = loadLayout(layout);
    boot.includeScripts(); boot.onload();
    const host = hostId ? boot.harness.contextPanel.FindChildTraverse(hostId) : boot.harness.contextPanel;
    assert.equal(host.GetAttributeString(attribute, ''), 'ready');
    if (debug) {
      assert.ok(boot.harness.logs.includes(message));
      if (hostId) {
        assert.ok(boot.harness.logs.some(line => line.startsWith('[HPV3] save ')));
        assert.ok(boot.harness.logs.some(line => line.startsWith('[HPV3] store ')));
      }
      assert.ok(boot.harness.logs.every(line => line.startsWith('[HPV3]')));
    } else assert.deepEqual(boot.harness.logs, []);
    boot.harness.scheduler.runFor(3000);
    if (debug) assert.equal(boot.harness.logs.filter(line => line === message).length, 1);
    else assert.deepEqual(boot.harness.logs, []);
  }
});

test('both real contexts expose the generated release version', () => {
  for (const layout of ['hud_escape_menu.xml', 'unit_status_overlay_v2.xml']) {
    const boot = loadLayout(layout);
    boot.includeScripts();
    const contract = boot.harness.$.HPColorsV3Settings || boot.harness.$.HPColorsV3WorldSettings;
    assert.equal(contract.version, '3.0.0'); // the one wire-version pin; WIRE_VERSION in tools/lib/settings-scripts.js is its source
  }
});

test('isolated debug staging prints the release version exactly once in both VM contexts', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-version-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.resolve(__dirname, '..');
  fs.cpSync(path.join(root, 'panorama'), path.join(dir, 'panorama'), { recursive: true });
  const staged = spawnSync(process.execPath, [path.join(root, 'tools/stage-scripts.js'),
    path.join(dir, 'panorama/scripts'), '--debug'], { encoding: 'utf8' });
  assert.equal(staged.status, 0, staged.stderr);
  const previous = process.env.HPV3_DEBUG;
  process.env.HPV3_DEBUG = '1';
  try {
    for (const [layout, kind] of [['hud_escape_menu.xml', 'menu'], ['unit_status_overlay_v2.xml', 'renderer']]) {
      const boot = loadLayout(layout, { sourceRoot: dir });
      const tree = kind === 'menu' ? installTopBarIdentityTree(boot.harness, { heroName: 'Infernus' }) : null;
      let api;
      boot.includeScripts();
      if (tree) {
        const signature = new MockPanel('hud_signature', tree.hud), abilities = new MockPanel('abilities', signature);
        new MockPanel('slot_signature_1', { parent: abilities, classes: ['Tier2'] });
        const defaults = boot.harness.$.HPColorsV3Settings.defaults;
        boot.harness.$.HPColorsV3Store = {
          isHydrated: () => true,
          getBundle: () => ({ settings: defaults, presets: [], heroPresets: { hero_inferno: 'baked_default' } }),
          attach(value) { api = value; api.hydrateSettings(defaults); },
          applyPreset(preset, automatic, mapped) { api.applyPresetSettings(preset.settings, preset.id, automatic, mapped); },
        };
      }
      boot.onload();
      boot.harness.scheduler.runFor(3000);
      assert.equal(boot.harness.logs.filter(line => line === '[HPV3] ' + kind + ' boot ' + WIRE_VERSION).length, 1);
      if (tree) {
        assert.ok(boot.harness.logs.some(line => line === '[HPV3] hero hero_inferno'));
        assert.ok(boot.harness.logs.some(line => line === '[HPV3] route applied baked_default'));
        // Since 2026-11-02 a route is decided once per hero, phase or target: later samples are silent.
        assert.equal(boot.harness.logs.filter(line => line === '[HPV3] route applied baked_default').length, 1);
        const contract = boot.harness.$.HPColorsV3Settings;
        const cell = contract.slots.find(slot => slot.setting === 'barColorLow' && slot.side === 'enemy').slot;
        api.applySettings(contract.defaults, { [cell]: { slot: 1, minTier: 2, value: '#123456' } });
        boot.harness.scheduler.runFor(1000);
        assert.ok(boot.harness.logs.includes('[HPV3] tiers 2,-1,-1,-1'));
        assert.ok(boot.harness.logs.includes('[HPV3] rules matched ' + cell + ' unmatched '));
        const observations = boot.harness.logs.filter(line => line.startsWith('[HPV3] tiers ') || line.startsWith('[HPV3] rules ')).length;
        boot.harness.scheduler.runFor(3000);
        assert.equal(boot.harness.logs.filter(line => line.startsWith('[HPV3] tiers ') || line.startsWith('[HPV3] rules ')).length, observations);
        const slot = tree.hud.FindChildTraverse('slot_signature_1'); slot.RemoveClass('Tier2'); slot.AddClass('Tier1');
        boot.harness.scheduler.runFor(1000);
        assert.ok(boot.harness.logs.includes('[HPV3] tiers 1,-1,-1,-1'));
        assert.ok(boot.harness.logs.includes('[HPV3] rules matched  unmatched ' + cell));
        tree.setHeroName(''); boot.harness.scheduler.runFor(2000);
        assert.ok(boot.harness.logs.includes('[HPV3] hero cleared'));
        tree.hud.AddClass('connectedToHideout'); boot.harness.scheduler.runFor(1000);
        assert.ok(boot.harness.logs.some(line => line.startsWith('[HPV3] lifecycle hideout epoch ')));
      }
      if (!tree) {
        boot.harness.scheduler.runFor(6000);
        assert.ok(boot.harness.logs.some(line => /^\[HPV3\] renderer timing ticks=\d+ ms=\d+ paints=\d+ state=/.test(line)));
      }
    }
  } finally {
    if (previous === undefined) delete process.env.HPV3_DEBUG;
    else process.env.HPV3_DEBUG = previous;
  }
});
