'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { parseArgs } = require('node:util');
const {
  MockPanel, createPanoramaHarness, createVmContext, runInVm,
} = require('./hp-colors-panorama-test-adapter');

const { values: args } = parseArgs({ options: { output: { type: 'string' } } });
const root = path.resolve(__dirname, '..');
const sourceRoot = process.env.HP_COLORS_REWRITE_SOURCE_ROOT
  ? path.resolve(process.env.HP_COLORS_REWRITE_SOURCE_ROOT)
  : path.join(root, 'hp_colors_rewrite_v2');
const durationMs = 10000;
const stepMs = 100;
const scriptNames = [
  'hp_colors_v2_contract.js',
  'hp_colors_v2_state.js',
  'hp_colors_v2_menu.js',
  'unit_status_v2_colors.js',
];

// Reuse the behavioral fixtures without registering or executing their tests.
function loadFixture(file, exports) {
  const filename = path.join(__dirname, file);
  const source = fs.readFileSync(filename, 'utf8');
  const declaration = "const test = require('node:test');";
  assert.ok(source.includes(declaration), `fixture test declaration changed: ${file}`);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(
    source.replace(declaration, 'const test = function () {};') +
      `\nmodule.exports = { ${exports.join(', ')} };\n`,
    filename,
  );
  return loaded.exports;
}

const { makeStatusFixture, dispatchColorSnapshot } = loadFixture(
  'validate-hp-colors-rewrite-v2-baseline.test.js',
  ['makeStatusFixture', 'dispatchColorSnapshot'],
);
const { bootMenu, openEditor, panel } = loadFixture(
  'validate-hp-colors-rewrite-v2-editor.test.js',
  ['bootMenu', 'openEditor', 'panel'],
);

function clearCounters(harness) {
  for (const key of Object.keys(harness.operationCounts)) harness.operationCounts[key] = 0;
  for (const key of Object.keys(harness.findCounts)) harness.findCounts[key] = 0;
  harness.logs.length = 0;
  harness.dispatches.length = 0;
}

function measure(harness, step, observe) {
  harness.scheduler.runFor(1000, 1000);
  clearCounters(harness);
  let callbacks = 0;
  let maxQueuedJobs = harness.scheduler.jobs.length;
  const runNext = harness.scheduler.runNext;
  harness.scheduler.runNext = () => {
    callbacks += 1;
    assert.ok(callbacks < 10000, 'scheduler exceeded measurement safety limit');
    const job = runNext();
    maxQueuedJobs = Math.max(maxQueuedJobs, harness.scheduler.jobs.length);
    return job;
  };
  const start = harness.now;
  const wallStart = performance.now();
  for (let elapsed = 0; elapsed < durationMs; elapsed += stepMs) {
    step(elapsed);
    harness.scheduler.runFor(stepMs, 1000);
    assert.ok(
      harness.scheduler.jobs.every((job) => job.due > harness.now),
      'measurement left due callbacks unexecuted',
    );
  }
  const vmElapsedMs = performance.now() - wallStart;
  assert.equal(harness.now - start, durationMs);
  const result = {
    simulatedMs: durationMs,
    callbacks,
    maxQueuedJobs,
    queuedJobs: harness.scheduler.jobs.length,
    operations: { ...harness.operationCounts },
    logs: harness.logs.length,
    dispatches: harness.dispatches.length,
    vmElapsedMs: Math.round(vmElapsedMs * 1000) / 1000,
  };
  // Observation reads are outside the measured operation window.
  result.observed = observe();
  return result;
}

function rendererScenario(name) {
  const values = {
    enabled: true,
    enemyEnabled: true,
    allyEnabled: true,
    enemyMode: 'gradient',
    allyMode: 'gradient',
    enemyLow: '#FD4949', enemyMid: '#FF7B00', enemyHigh: '#00FF00',
    allyLow: '#FD4949', allyMid: '#FF7B00', allyHigh: '#00FF00',
    readoutVisible: true,
    pipsVisible: true,
    ...(name === 'layoutReset' ? { widthScale: 230, positionX: -300 } : {}),
  };
  const fixture = makeStatusFixture(
    name === 'stableAlly' ? 'ally' : 'enemy', values, 1, '||||||||',
    false, false, name === 'noBars', true,
  );
  return measure(fixture.harness, (elapsed) => {
    if (name === 'activeEnemy') fixture.fill.actuallayoutwidth = elapsed % 200 ? 40 : 60;
    if (elapsed !== durationMs / 2) return;
    if (name === 'replacement') {
      fixture.fill.DeleteAsync(0);
      fixture.fill = fixture.activeParent.add(new MockPanel('unit_healthbar_lagging', {
        actuallayoutwidth: 30,
        style: { washColor: '' },
        findCounts: fixture.harness.findCounts,
        operationCounts: fixture.harness.operationCounts,
      }));
    } else if (name === 'layoutReset') {
      dispatchColorSnapshot(fixture, 2, {
        ...values, widthScale: 100, heightScale: 100, positionX: 0, positionY: 0,
      });
      assert.equal(fixture.healthbars.style.transform, 'translateX(0px) translateY(0px)');
    }
  }, () => ({
    fillColor: fixture.fill ? fixture.fill.style.washColor : null,
    readout: fixture.counter.text,
    transform: fixture.healthbars.style.transform || '',
    ultimateLeft: fixture.unitInfo.style.marginLeft || '',
  }));
}

function editorScenario() {
  const fixture = bootMenu({ version: 1, values: {}, scopes: [] });
  openEditor(fixture);
  const slider = panel(fixture, 'HPColorsWidthSlider');
  assert.equal(typeof slider.events.onvaluechanged, 'function');
  return measure(fixture.harness, (elapsed) => {
    slider.value = elapsed % 200 ? 100 : 230;
    slider.events.onvaluechanged();
  }, () => ({ config: JSON.parse(fixture.harness.root.GetAttributeString('hp_colors_v2_config', '{}')) }));
}

function scopeScenario() {
  const fixture = bootMenu({ version: 1, values: {}, scopes: [] });
  openEditor(fixture);
  panel(fixture, 'HPColorsCurrentScopeSelected').events.onactivate();
  const hero = panel(fixture, 'HPColorsScopeHeroOption0');
  assert.equal(typeof hero.events.onactivate, 'function');
  return measure(fixture.harness, () => hero.events.onactivate(), () => ({
    summary: panel(fixture, 'HPColorsCurrentScopeSummary').text,
  }));
}

function stateScenario() {
  const counts = { stringifyCalls: 0, serializedChars: 0, newlyFrozenObjects: 0 };
  const frozen = new WeakSet();
  const measuredObject = new Proxy(Object, {
    get(target, key) {
      if (key !== 'freeze') return target[key];
      return (value) => {
        if (value && typeof value === 'object' && !frozen.has(value)) {
          frozen.add(value);
          counts.newlyFrozenObjects += 1;
        }
        return Object.freeze(value);
      };
    },
  });
  const measuredJSON = {
    parse: JSON.parse,
    stringify(...values) {
      const raw = JSON.stringify(...values);
      counts.stringifyCalls += 1;
      counts.serializedChars += raw ? raw.length : 0;
      return raw;
    },
  };
  const harness = createPanoramaHarness();
  const context = createVmContext(harness, {
    globals: { Object: measuredObject, JSON: measuredJSON },
  });
  for (const name of ['hp_colors_v2_contract.js', 'hp_colors_v2_state.js']) {
    runInVm(fs.readFileSync(path.join(sourceRoot, 'panorama/scripts', name), 'utf8'), context, name);
  }
  const state = harness.$.HPColorsV2StateFactory.create({
    version: 1, values: {},
    scopes: [{ id: 'scope_current', mode: 'all', heroes: [], values: {} }],
  });
  state.read();
  for (const key of Object.keys(counts)) counts[key] = 0;
  for (let index = 0; index < 100; index += 1) {
    const result = state.send({
      type: 'setting_edit', key: 'widthScale', value: index % 2 ? 100 : 230,
    });
    assert.equal(result.outcome.status, 'committed');
    assert.equal(result.view.currentScope.values.widthScale, index % 2 ? 100 : 230);
  }
  return { edits: 100, ...counts };
}

const scripts = scriptNames.map((name) => {
  const source = fs.readFileSync(path.join(sourceRoot, 'panorama/scripts', name));
  return {
    name,
    bytes: source.length,
    sha256: crypto.createHash('sha256').update(source).digest('hex'),
  };
});
const renderer = {};
for (const name of ['stableEnemy', 'activeEnemy', 'stableAlly', 'noBars', 'replacement', 'layoutReset']) {
  renderer[name] = rendererScenario(name);
}
const report = {
  version: 1,
  sourceRoot,
  node: process.version,
  durationMs,
  stepMs,
  note: 'Synthetic Panorama VM operations, not native CPU or FPS. Traversal includes mock recursion. VM elapsed time is diagnostic, not an acceptance threshold. Each scenario has one context and a one-second warmup.',
  scripts,
  renderer,
  editor: editorScenario(),
  scopeEditor: scopeScenario(),
  state: stateScenario(),
};
const json = JSON.stringify(report, null, 2) + '\n';
if (args.output) fs.writeFileSync(path.resolve(args.output), json);
else process.stdout.write(json);
