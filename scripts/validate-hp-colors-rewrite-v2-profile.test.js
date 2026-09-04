'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const authoredPath = path.resolve(__dirname, '../hp_colors_rewrite_v2/panorama/scripts/hp_colors_v2_contract.js');
const contractPath = process.env.HP_COLORS_REWRITE_SOURCE_ROOT
  ? path.join(process.env.HP_COLORS_REWRITE_SOURCE_ROOT, 'panorama/scripts/hp_colors_v2_contract.js')
  : authoredPath;

function loadProfile(source, precise = true) {
  let now = 0;
  let reads = 0;
  const logs = [];
  const clock = () => { reads++; return now; };
  const $ = { Msg: text => logs.push(text), GetContextPanel: () => ({ id: 'ProfileFixture' }) };
  const context = vm.createContext({
    $, performance: precise ? { now: clock } : undefined,
    Date: class extends Date { static now() { return clock(); } },
  });
  vm.runInContext(source, context);
  return {
    profile: $.HPColorsV2Profile, logs,
    context,
    advance: ms => { now += ms; },
    reads: () => reads,
    reports: () => {
      const groups = new Map();
      for (const text of logs) {
        if (!text.startsWith('[HPV2-PROFILE] ')) continue;
        const chunk = JSON.parse(text.slice('[HPV2-PROFILE] '.length));
        const key = chunk.context + ':' + chunk.reports;
        if (!groups.has(key)) groups.set(key, new Array(chunk.parts));
        const parts = groups.get(key);
        assert.equal(parts.length, chunk.parts);
        assert.equal(parts[chunk.part - 1], undefined);
        parts[chunk.part - 1] = chunk.data;
      }
      return Array.from(groups.values(), parts => {
        assert.equal(parts.filter(part => typeof part === 'string').length, parts.length);
        return JSON.parse(parts.join(''));
      });
    },
  };
}

function enabledProfile(t, precise = true) {
  const source = fs.readFileSync(contractPath, 'utf8')
    .replace('var PROFILE_ENABLED = false;', 'var PROFILE_ENABLED = true;');
  const fixture = loadProfile(source, precise);
  if (!fixture.profile) {
    t.skip('Normal Closure output removes profiling; exercised by the -Profile build.');
    return null;
  }
  return fixture;
}

test('normal authored contract performs no profiler clock reads', () => {
  const fixture = loadProfile(fs.readFileSync(authoredPath, 'utf8'));
  assert.equal(fixture.profile, undefined);
  assert.equal(fixture.reads(), 0);
  assert.deepEqual(fixture.logs, []);
});

test('profile reports at three seconds, not before', t => {
  const f = enabledProfile(t);
  if (!f) return;
  const work = f.profile.wrap('work', () => f.advance(1));
  f.advance(2998);
  work();
  assert.equal(f.reports().length, 0);
  work();
  assert.equal(f.reports().length, 1);
  assert.equal(f.reports()[0].windowMs, 3000);
});

test('profile separates nested self time and preserves returns, receiver, and exceptions', t => {
  const f = enabledProfile(t);
  if (!f) return;
  const inner = f.profile.wrap('inner', function (value) {
    f.advance(4);
    return this.base + value;
  });
  const outer = f.profile.wrap('outer', function (value) {
    f.advance(3);
    const result = inner.call(this, value);
    f.advance(5);
    return result;
  });
  assert.equal(outer.call({ base: 10 }, 2), 12);
  const error = new Error('expected callback failure');
  const fails = f.profile.wrap('fails', () => { f.advance(2); throw error; });
  assert.throws(fails, actual => actual === error);
  assert.equal(f.reports().length, 0);
  f.advance(15000);
  f.profile.wrap('flush', () => f.advance(1))();
  const report = f.reports()[0];
  assert.ok(report);
  const rows = Object.fromEntries(report.rows.map(row => [row.label, row]));
  assert.equal(rows.outer.calls, 1);
  assert.equal(rows.outer.totalMs, 12);
  assert.equal(rows.outer.selfMs, 8);
  assert.equal(rows.outer.maxMs, 12);
  assert.equal(rows.inner.selfMs, 4);
  assert.equal(rows.fails.selfMs, 2);
  assert.equal(report.rows[0].label, 'outer');
  assert.deepEqual(report.slowest, { label: 'outer', maxMs: 12 });
});

test('coarse-clock profiling bounds reports and rows over a long-lived context', t => {
  const f = enabledProfile(t, false);
  if (!f) return;
  const callbacks = Array.from({ length: 10 }, (_, i) =>
    f.profile.wrap('work' + i, () => f.advance(i + 1)));
  for (let window = 0; window < 405; window++) {
    for (const callback of callbacks) callback();
    f.advance(15000);
    callbacks[0]();
  }
  const reports = f.reports();
  assert.equal(reports.length, 400);
  assert.match(reports[0].clock, /Date/);
  assert.equal(reports[0].rows.length, 10);
  assert.equal(reports[0].rows[0].label, 'work9');
});

test('top calls ranks frequency independently of time and resets each window', t => {
  const f = enabledProfile(t);
  if (!f) return;
  for (let index = 0; index < 12; index++) {
    const work = f.profile.wrap('work' + index, () => f.advance(index + 1));
    for (let call = 0; call < 12 - index; call++) work();
  }
  f.advance(3000);
  const flush = f.profile.wrap('flush', () => {});
  flush();
  const report = f.reports()[0];
  assert.equal(report.topCalls.length, 10);
  assert.deepEqual(report.topCalls.map(row => row.calls), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  assert.equal(report.topCalls[0].label, 'work0');
  assert.equal(report.topCalls[0].avgMs, 1);
  assert.equal(report.topCalls[0].totalMs, 12);
  assert.equal(report.topCalls[0].maxMs, 1);
  assert.equal(report.topCalls[0].callsPerSecond, Math.round(12000 / report.windowMs * 1000) / 1000);
  assert.notEqual(report.rows[0].label, report.topCalls[0].label);
  f.advance(3000);
  flush();
  assert.equal(f.reports()[1].topCalls.length, 1);
  assert.equal(f.reports()[1].topCalls[0].label, 'flush');
  assert.equal(f.reports()[1].topCalls[0].calls, 1);
  assert.equal(f.reports()[1].topCalls[0].totalMs, 0);
});

test('full rankings survive the console message limit', t => {
  const f = enabledProfile(t);
  if (!f) return;
  const labels = Array.from({ length: 12 }, (_, i) => 'menu.renderPresetOptions' + i);
  for (const label of labels) f.profile.wrap(label, () => f.advance(1))();
  f.advance(3000);
  f.profile.wrap('flush', () => {})();
  for (const line of f.logs) assert.ok(Buffer.byteLength(line, 'utf8') < 2000, 'console message would truncate');
  const report = f.reports()[0];
  assert.equal(report.rows.length, 10);
  assert.equal(report.topCalls.length, 10);
  assert.equal(report.totals.calls, 13);
});

test('style diagnostics distinguish cache hits, writes, invalid panels and failures per window', t => {
  const f = enabledProfile(t);
  if (!f) return;
  const renderer = fs.readFileSync(path.join(path.dirname(authoredPath), 'unit_status_v2_colors.js'), 'utf8');
  // Expose the real setter without starting the renderer's scheduled loops.
  const seam = 'var STOCK_TEAM1_COLOR = "#E7B659";';
  vm.runInContext(renderer.replace(seam, seam + '\n$.__setStyle = setStyle; return;'), f.context);
  const setStyle = f.profile.wrap('setStyle', f.context.$.__setStyle);
  const panel = { style: {} };
  const cache = {};
  setStyle(panel, 'opacity', '1', cache, 'opacity');
  setStyle(panel, 'opacity', '1', cache, 'opacity');
  panel.style.opacity = '0'; // Engine changed the native value behind our cache.
  setStyle(panel, 'opacity', '1', cache, 'opacity');
  assert.equal(panel.style.opacity, '1');
  setStyle(null, 'opacity', '1', cache, 'missing');
  const broken = { id: 'HealthFill', style: new Proxy({}, { set() { throw new Error('panel write failed'); } }) };
  setStyle(broken, 'opacity', '1', cache, 'broken');
  assert.equal(cache.broken, null);
  f.advance(3000);
  const flush = f.profile.wrap('flush', () => {});
  flush();
  assert.deepEqual(f.reports()[0].style, { cacheHits: 1, writes: 2, invalidPanels: 1, writeErrors: 1 });
  assert.deepEqual(f.reports()[0].styleFailures, [{ panel: 'HealthFill', property: 'opacity', value: '1', error: 'Error: panel write failed' }]);
  assert.deepEqual(f.reports()[0].styleWrites, [
    { property: 'opacity', reason: 'valueChange', attempts: 2, panel: '', previous: '', requested: '1' },
    { property: 'opacity', reason: 'nativeMismatch', attempts: 1, panel: '', previous: '0', requested: '1' },
  ]);
  setStyle(broken, 'opacity', '1', cache, 'broken');
  f.advance(3000);
  flush();
  assert.deepEqual(f.reports()[1].style, { cacheHits: 0, writes: 0, invalidPanels: 0, writeErrors: 1 });
  assert.deepEqual(f.reports()[1].styleFailures, []);
  assert.equal(f.reports()[1].styleWrites.length, 1);
  assert.equal(f.reports()[1].styleWrites[0].attempts, 1);
  assert.equal(f.reports()[1].styleWrites[0].panel, 'HealthFill');
});

test('distinct failure details remain bounded without losing report transport', t => {
  const f = enabledProfile(t);
  if (!f) return;
  for (let i = 0; i < 40; i++) f.profile.styleError('Panel' + i, 'color', '\u0000'.repeat(200), new Error('unsupported'));
  f.advance(3000);
  f.profile.wrap('flush', () => {})();
  const report = f.reports()[0];
  assert.equal(report.styleFailures.length, 32);
  assert.equal(report.styleFailuresLimited, true);
  assert.equal(report.styleFailures[0].value.length, 160);
  assert.equal(report.styleFailures[31].panel, 'Panel31');
  for (const line of f.logs) assert.ok(Buffer.byteLength(line, 'utf8') < 2000);
});

test('alias restoration clears the base and preserves sibling inline styles', t => {
  const f = enabledProfile(t);
  if (!f) return;
  const renderer = fs.readFileSync(path.join(path.dirname(authoredPath), 'unit_status_v2_colors.js'), 'utf8');
  const seam = 'var STOCK_TEAM1_COLOR = "#E7B659";';
  vm.runInContext(renderer.replace(seam, '$.__setStyle = setStyle; return;\n' + seam), f.context);
  const setStyle = f.profile.wrap('setStyle', f.context.$.__setStyle);
  const groups = {
    margin: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
    font: ['fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'fontStretch'],
    animation: ['animationName', 'animationDuration', 'animationDelay'],
    border: ['borderColor', 'borderTopWidth', 'borderTopStyle', 'borderLeftWidth', 'borderLeftStyle'],
  };
  const values = {
    marginLeft: '12px', marginTop: '4px', marginRight: '8px',
    fontFamily: 'Arial', fontSize: '20px', fontWeight: 'bold',
    animationDuration: '1s', animationName: 'pulse', animationDelay: '0.2s',
    borderColor: 'red', borderTopWidth: '2px', borderTopStyle: 'solid', borderLeftWidth: '3px', borderLeftStyle: 'dashed',
  };
  const panel = { id: 'AliasFixture', style: new Proxy(values, {
    set(target, property, value) {
      if (value === null && !groups[property]) throw new Error('Cannot unset alias alone');
      if (value === null) for (const alias of groups[property]) target[alias] = '';
      target[property] = value === null ? '' : value;
      return true;
    },
  }) };
  const cache = {};
  for (const property of ['marginLeft', 'fontSize', 'animationDuration', 'borderColor']) {
    setStyle(panel, property, '', cache, property);
    assert.equal(values[property], '');
  }
  assert.equal(values.marginTop, '4px');
  assert.equal(values.marginRight, '8px');
  assert.equal(values.fontFamily, 'Arial');
  assert.equal(values.fontWeight, 'bold');
  assert.equal(values.animationName, 'pulse');
  assert.equal(values.animationDelay, '0.2s');
  assert.equal(values.borderTopWidth, '2px');
  assert.equal(values.borderLeftStyle, 'dashed');
  const writes = f.profile.style.writes;
  setStyle(panel, 'marginLeft', '', cache, 'marginLeft');
  assert.equal(f.profile.style.writes, writes);
  assert.equal(f.profile.style.writeErrors, 0);
  f.advance(3000);
  f.profile.wrap('flush', () => {})();
  assert.ok(f.reports()[0].styleWrites.every(row => row.reason === 'aliasRestore'));
  assert.equal(f.reports()[0].styleWrites.reduce((sum, row) => sum + row.attempts, 0), writes);
});

test('native readback avoids normalized rewrites while repairing engine and panel changes', t => {
  const f = enabledProfile(t);
  if (!f) return;
  const renderer = fs.readFileSync(path.join(path.dirname(authoredPath), 'unit_status_v2_colors.js'), 'utf8');
  const seam = 'var STOCK_TEAM1_COLOR = "#E7B659";';
  vm.runInContext(renderer.replace(seam, seam + '\n$.__setStyle = setStyle; $.__drift = cachedStyleDrift; return;'), f.context);
  const setStyle = f.context.$.__setStyle;
  const cache = {};
  let color = '';
  let left = '';
  let top = '';
  let writes = 0;
  const panel = { style: new Proxy({}, {
    get(target, key) {
      if (key === 'washColor') return color;
      if (key === 'margin') return left + ' ' + top;
      return '';
    },
    set(target, key, value) {
      writes++;
      if (key === 'washColor') color = value + 'FF';
      if (key === 'marginLeft') left = value;
      if (key === 'marginTop') top = value;
      return true;
    },
  }) };
  setStyle(panel, 'washColor', '#FD4949', cache, 'color');
  setStyle(panel, 'marginLeft', '30px', cache, 'left');
  setStyle(panel, 'marginTop', '10px', cache, 'top');
  for (let i = 0; i < 10; i++) {
    setStyle(panel, 'washColor', '#FD4949', cache, 'color');
    setStyle(panel, 'marginLeft', '30px', cache, 'left');
    setStyle(panel, 'marginTop', '10px', cache, 'top');
  }
  assert.equal(writes, 3);
  color = '#000000FF';
  assert.equal(f.context.$.__drift(panel, 'washColor', cache, 'color'), true);
  setStyle(panel, 'washColor', '#FD4949', cache, 'color');
  assert.equal(color, '#FD4949FF');
  left = '0px'; top = '0px';
  setStyle(panel, 'marginLeft', '30px', cache, 'left');
  assert.equal(f.context.$.__drift(panel, 'marginTop', cache, 'top'), true);
  setStyle(panel, 'marginTop', '10px', cache, 'top');
  assert.equal(left + ' ' + top, '30px 10px');
  assert.equal(f.context.$.__drift(panel, 'marginLeft', cache, 'left'), false);
  assert.equal(writes, 6);
  const replacement = { style: {} };
  setStyle(replacement, 'washColor', '#FD4949', cache, 'color');
  assert.equal(replacement.style.washColor, '#FD4949');
});
