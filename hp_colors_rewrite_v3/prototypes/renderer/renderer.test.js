'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MockPanel, createPanoramaHarness, createVmContext, runInVm } =
  require('../../../scripts/hp-colors-panorama-test-adapter');

const sourcePath = path.join(__dirname, 'renderer.js');
const COUNTED = ['traversal', 'parentReads', 'parentWrites', 'classReads', 'classWrites',
  'styleReads', 'styleWrites', 'textReads', 'textWrites', 'layoutWidthReads', 'layoutOtherReads'];

// Same extra axes and counting sum as ticket 05; adapter width reads are already counted.
function instrumentLayout(panel, counts) {
  for (const key of ['actualxoffset', 'actualyoffset', 'actuallayoutheight']) {
    let value = panel[key];
    Object.defineProperty(panel, key, {
      configurable: true, enumerable: true,
      get() { counts.layoutOtherReads = (counts.layoutOtherReads || 0) + 1; return value; },
      set(next) { value = next; },
    });
  }
  for (const child of panel.children) instrumentLayout(child, counts);
}

function fixture(options = {}) {
  const harness = createPanoramaHarness();
  const add = (parent, id, opts = {}) => parent.add(new MockPanel(id, opts));
  const world = add(harness.root, 'WorldUIRoot', { classes: options.classes || ['player', 'enemy'] });
  const window = add(world, 'client_ui_panel', { classes: ['WindowRoot'] });
  const status = add(window, 'UnitStatus');
  const info = add(status, 'InfoHealthContainer', {
    actuallayoutwidth: 400, actuallayoutheight: 420, actualuiscale_x: 2, actualuiscale_y: 2,
  });
  const stack = add(info, 'UnitHealthbarsContainer');
  // Shield with duplicate descendant IDs deliberately appears before primary.
  const shield = add(stack, 'UnitShieldbar', { classes: ['UnitHealthbarContainer'] });
  const shieldInner = add(shield, 'UnitHealthbarInner');
  const shieldFill = add(shieldInner, 'unit_healthbar_lagging', { style: { washColor: '#aabbcc' } });
  const primary = add(stack, 'UnitHealthbar', { classes: ['UnitHealthbarContainer'],
    style: { width: '79px', height: '18px', position: '70.5px 65px 0px' } });
  const inner = add(primary, 'UnitHealthbarInner', {
    actuallayoutwidth: 138, actualuiscale_x: 2, style: { width: '69px', height: '12px' },
  });
  const fill = add(inner, 'unit_healthbar_lagging', {
    actuallayoutwidth: 34.5, actualuiscale_x: 1,
    style: { clip: 'rect(0%, 50%, 100%, 0%)', washColor: '#fd4949' },
  });
  const health = add(info, 'UnitHealthbarValue', { text: '345',
    style: { visibility: 'collapse', opacity: '0', position: '4px 2px 0px',
      marginLeft: '40px', marginRight: '10px', marginTop: '1px', transform: 'rotateZ(-3deg)',
      horizontalAlign: 'right', verticalAlign: 'top' } });
  const stock = new Map([primary, inner, fill, health].map(panel => [panel, { ...panel.style }]));
  instrumentLayout(harness.root, harness.operationCounts);
  harness.contextPanel = status;
  const context = createVmContext(harness);
  if (options.beforeBoot) options.beforeBoot({ info, primary, inner, fill, health });
  runInVm(fs.readFileSync(sourcePath, 'utf8'), context, sourcePath);
  const api = status.HPColorsRendererPrototype;
  assert.ok(api, 'runtime boots on the context panel');
  const advance = (ms = 150) => harness.scheduler.runFor(ms, 1000);
  const setHealth = percent => {
    fill.actuallayoutwidth = 69 * percent / 100 * fill.actualuiscale_x;
    fill.style.clip = `rect(0%, ${percent}%, 100%, 0%)`;
  };
  return { harness, api, context, world, window, status, info, stack, primary, inner,
    fill, health, shieldFill, stock, advance, setHealth };
}

function assertStock(fx) {
  for (const [panel, stock] of fx.stock) for (const [key, value] of Object.entries(stock)) {
    if (key !== 'clip') assert.equal(panel.style[key], value, `${panel.id}.${key} restored`);
  }
  assert.equal(fx.health.GetParent(), fx.info, 'same native label restored to original parent');
  assert.equal(fx.api.inspect().ownedStyles, 0);
}

test('boot, health gradient/fixed color, CSS-pixel geometry and bound HP adoption', () => {
  const fx = fixture();
  assert.equal(fx.fill.style.washColor, '#ffff00');
  assert.equal(fx.health.GetParent(), fx.primary);
  assert.equal(fx.shieldFill.style.washColor, '#aabbcc');
  fx.setHealth(25); fx.advance();
  assert.equal(fx.fill.style.washColor, '#ff8000');
  fx.setHealth(100); fx.advance();
  assert.equal(fx.fill.style.washColor, '#00ff00');
  fx.api.configure({ side: { enemy: { width: 100, height: 24, x: 7, y: -9, mode: 'fixed', fixed: '#123456' } } });
  assert.equal(fx.primary.style.width, '100px');
  assert.equal(fx.primary.style.height, '24px');
  assert.equal(fx.primary.style.position, '7px -9px 0px');
  assert.equal(fx.inner.style.width, '90px');
  assert.equal(fx.fill.style.washColor, '#123456');
  // VM cannot simulate native binding; this verifies identity and no renderer text writes.
  fx.health.text = '123'; fx.advance(1500);
  assert.equal(fx.health.text, '123');
  assert.equal(fx.health.id, 'UnitHealthbarValue');
  assert.equal(fx.harness.operationCounts.textWrites, 1, 'only the injected native update');
});

test('master off restores every owned style explicitly, no null/empty clear', () => {
  const fx = fixture();
  fx.api.configure({ enabled: false });
  assertStock(fx);
  assert.equal(fx.api.inspect().state, 'dormant');
  for (const panel of fx.stock.keys()) {
    assert.ok(panel.styleWrites.every(write => write.value !== null && write.value !== undefined && write.value !== ''));
  }
  fx.advance(3000);
  assertStock(fx);
  fx.api.configure({ enabled: true });
  assert.equal(fx.health.GetParent(), fx.primary);
  assert.equal(fx.harness.scheduler.jobs.length, 1, 'reconfiguration never duplicates polling');
});

test('missing inline stock uses explicit pinned defaults on release', () => {
  const fx = fixture({ beforeBoot({ primary, fill, health }) {
    delete primary.style.width; delete fill.style.washColor; delete health.style.opacity;
  } });
  fx.api.configure({ enabled: false });
  assert.equal(fx.primary.style.width, '79px');
  assert.equal(fx.fill.style.washColor, '#fd4949');
  assert.equal(fx.health.style.opacity, '0');
});

test('same panels recycle to objective and back; new ownership captures new stock', () => {
  const fx = fixture();
  fx.world.RemoveClass('player'); fx.world.AddClass('boss_tier1');
  fx.advance(); assertStock(fx);
  assert.equal(fx.api.inspect().state, 'dormant');
  fx.fill.style.washColor = '#112233';
  fx.world.RemoveClass('boss_tier1'); fx.world.AddClass('player');
  fx.advance(1000);
  assert.equal(fx.health.GetParent(), fx.primary);
  assert.equal(fx.fill.style.washColor, '#ffff00');
  fx.api.configure({ enabled: false });
  assert.equal(fx.fill.style.washColor, '#112233', 'old ledger was not reused');
});

test('dead/replaced and moved lineage releases surviving owners, rediscovers only on change', () => {
  const fx = fixture();
  const oldFill = fx.fill;
  oldFill.DeleteAsync();
  const replacement = fx.inner.add(new MockPanel('unit_healthbar_lagging', {
    actuallayoutwidth: 69, style: { clip: 'rect(0%, 100%, 100%, 0%)', washColor: '#445566' },
  }));
  instrumentLayout(replacement, fx.harness.operationCounts);
  fx.advance();
  assert.equal(replacement.style.washColor, '#00ff00');
  const foreign = fx.harness.root.add(new MockPanel('Foreign'));
  fx.primary.SetParent(foreign); fx.advance();
  assert.equal(fx.primary.style.width, '79px');
  assert.equal(fx.health.GetParent(), fx.info);
  fx.primary.SetParent(fx.stack); fx.advance(1000);
  assert.equal(fx.health.GetParent(), fx.primary);
  fx.api.configure({ enabled: false });
  assert.equal(replacement.style.washColor, '#445566');
});

test('memo inputs include config/facts; pure plan and stable ledger avoid native work', () => {
  const fx = fixture(); fx.advance(6000);
  const before = fx.api.inspect();
  const counts = { ...fx.harness.operationCounts };
  const inputs = JSON.stringify([before.facts, before.settings]);
  const a = fx.api.plan(before.facts, before.settings);
  const b = fx.api.plan(before.facts, before.settings);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(JSON.stringify([before.facts, before.settings]), inputs);
  assert.deepEqual(fx.harness.operationCounts, counts, 'pure planner makes no panel calls');
  fx.advance(1500);
  assert.equal(fx.api.inspect().fullPaints, before.fullPaints + 1, 'idle full paint every 1.5 seconds');
  assert.equal(fx.api.inspect().plansComputed, before.plansComputed);
  assert.equal(fx.harness.operationCounts.styleWrites, counts.styleWrites);
  fx.api.configure({ side: { ally: { fixed: '#abcdef' }, enemy: { low: '#000000' } } });
  fx.setHealth(0); fx.advance();
  assert.equal(fx.fill.style.washColor, '#000000');
  assert.ok(fx.api.inspect().plansComputed > before.plansComputed);
  fx.api.configure({ side: { enemy: { hpText: false } } });
  assert.equal(fx.health.GetParent(), fx.info);
  for (const [key, value] of Object.entries(fx.stock.get(fx.health))) assert.equal(fx.health.style[key], value);
  fx.api.configure({ side: { enemy: { width: NaN, x: Infinity, fixed: 'bad', mode: 'bad' } } });
  assert.equal(fx.primary.style.width, '79px');
});

test('scale-normalised width fallback, percent span and geometry settling cannot feed back', () => {
  const fx = fixture();
  fx.fill.style.clip = ''; fx.fill.actuallayoutwidth = 34.5; fx.advance();
  assert.equal(fx.fill.style.washColor, '#ffff00', '34.5/1 divided by 138/2 = .5');
  fx.fill.style.clip = 'rect(0%, 75%, 100%, 25%)'; fx.advance();
  assert.equal(fx.fill.style.washColor, '#ffff00');
  fx.api.configure({ side: { enemy: { width: 110, height: 30, x: 12, y: 15 } } });
  // A real geometry write feeds changed measured widths/offsets back on the next layout tick.
  fx.primary.actuallayoutwidth = 220; fx.primary.actualxoffset = 24;
  fx.inner.actuallayoutwidth = 200; fx.fill.actuallayoutwidth = 100;
  fx.advance(3000);
  assert.equal(fx.primary.style.width, '110px');
  assert.equal(fx.primary.style.position, '12px 15px 0px');
  assert.equal(fx.fill.style.washColor, '#ffff00', 'authoritative percent span survives settling');
  fx.info.actuallayoutwidth = 0; fx.advance(1500);
  assert.equal(fx.health.GetParent(), fx.info, 'unlaid canvas releases');
  fx.info.actuallayoutwidth = 400; fx.advance(1500);
  assert.equal(fx.health.GetParent(), fx.primary, 'layout recovery wakes');
});

test('contradictory kind, dead carrier and stop are safe lifecycle boundaries', () => {
  const fx = fixture({ classes: ['player', 'enemy', 'boss_tier1'] });
  assert.equal(fx.api.inspect().state, 'dormant');
  fx.world.RemoveClass('boss_tier1'); fx.advance(1000);
  assert.equal(fx.health.GetParent(), fx.primary);
  fx.world.valid = false; fx.advance();
  assertStock(fx);
  fx.world.valid = true; fx.advance(1000);
  assert.equal(fx.health.GetParent(), fx.primary);
  fx.api.stop(); assertStock(fx);
  assert.equal(fx.harness.scheduler.jobs.length, 0);
});

test('partially loaded tree recovers on the dormant check without a cached miss', () => {
  const fx = fixture({ beforeBoot({ fill }) { fill.DeleteAsync(); } });
  assert.equal(fx.api.inspect().state, 'dormant');
  const fill = fx.inner.add(new MockPanel('unit_healthbar_lagging', {
    actuallayoutwidth: 69, style: { clip: 'rect(0%, 100%, 100%, 0%)', washColor: '#abcdef' },
  }));
  instrumentLayout(fill, fx.harness.operationCounts);
  fx.advance(1000);
  assert.equal(fill.style.washColor, '#00ff00');
  assert.equal(fx.health.GetParent(), fx.primary);
});

function measure(mode, masterOff = false) {
  const fx = fixture({ classes: mode === 'dormant' && !masterOff ? ['boss_tier1', 'enemy'] : ['player', 'enemy'] });
  if (masterOff) fx.api.configure({ enabled: false });
  fx.advance(5000); fx.advance(1000);
  for (const key of Object.keys(fx.harness.operationCounts)) fx.harness.operationCounts[key] = 0;
  let injectedWrites = 0;
  let callbacks = 0;
  let inputPercent = 50;
  let paintedPercent = 50;
  const runNext = fx.harness.scheduler.runNext;
  fx.harness.scheduler.runNext = () => {
    callbacks++; paintedPercent = inputPercent;
    return runNext();
  };
  const start = fx.harness.now;
  for (let elapsed = 0; elapsed < 10000; elapsed += 100) {
    if (mode === 'active') {
      inputPercent = elapsed % 200 ? 80 : 50;
      fx.setHealth(inputPercent); injectedWrites++;
    }
    fx.advance(100);
    assert.ok(fx.harness.scheduler.jobs.every(job => job.due > fx.harness.now));
  }
  assert.equal(fx.harness.now - start, 10000);
  const operations = { ...fx.harness.operationCounts };
  operations.styleWrites -= injectedWrites;
  const opsPerBarSecond = COUNTED.reduce((sum, key) => sum + (operations[key] || 0), 0) / 10;
  assert.equal(operations.traversal, 0, 'no steady-state full-tree walks');
  assert.equal(fx.api.inspect().state, mode);
  assert.equal(fx.harness.scheduler.jobs.length, 1);
  assert.equal(fx.harness.scheduler.jobs[0].delay, mode === 'dormant' ? 1 : 0.15);
  if (mode !== 'dormant') {
    assert.equal(fx.health.GetParent(), fx.primary);
    assert.equal(fx.fill.style.washColor, paintedPercent === 50 ? '#ffff00' : '#66ff00');
    assert.equal(fx.api.inspect().facts.fraction, paintedPercent / 100);
    if (mode === 'active') assert.ok(operations.styleWrites > 30, 'moving health actually paints');
  }
  return { mode, opsPerBarSecond, callbacksPerSecond: callbacks / 10, operations };
}

for (const [mode, ceiling] of [['active', 300], ['idle', 200], ['dormant', 30]]) {
  test(`${mode} counted operations stay within ${ceiling}/bar/s`, t => {
    const result = measure(mode);
    t.diagnostic(JSON.stringify(result));
    assert.ok(result.opsPerBarSecond <= ceiling, JSON.stringify(result));
  });
}

test('master-off player uses the same cheap dormant budget', t => {
  const result = measure('dormant', true);
  t.diagnostic(JSON.stringify({ ...result, fixture: 'master-off player' }));
  assert.ok(result.opsPerBarSecond <= 30, JSON.stringify(result));
});

test('idle first-hit paint remains within the .15 second probe interval', t => {
  const latency = [];
  for (let phase = 0; phase < 1500; phase += 50) {
    const fx = fixture(); fx.advance(5000 + phase);
    assert.equal(fx.api.inspect().state, 'idle');
    const start = fx.harness.now; fx.setHealth(25);
    fx.harness.scheduler.runUntilBefore(() => fx.fill.style.washColor === '#ff8000', 'first-hit paint', 150);
    latency.push(fx.harness.now - start);
    assert.ok(latency[latency.length - 1] <= 150);
  }
  const meanMs = latency.reduce((sum, value) => sum + value, 0) / latency.length;
  const maxMs = Math.max(...latency);
  t.diagnostic(JSON.stringify({ phases: latency.length, meanMs, maxMs }));
  assert.ok(meanMs <= 100);
});
