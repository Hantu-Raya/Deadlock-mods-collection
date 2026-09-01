'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const panoramaScripts = path.join(root, 'hp_colors_rewrite_v2', 'panorama', 'scripts');
const rendererPath = path.join(panoramaScripts, 'unit_status_v2_colors.js');
const menuPath = path.join(panoramaScripts, 'hp_colors_v2_menu.js');
const authoredPaths = [
  'hp_colors_v2_contract.js',
  'hp_colors_v2_state.js',
  'hp_colors_v2_menu.js',
  'unit_status_v2_colors.js',
  'unit_status_v2_segment_align.js',
].map((name) => path.join(panoramaScripts, name));

// Captured from the pre-refactor source and VM benchmark on 2026-08-31.
const BEFORE = {
  authoredLines: 10985,
  functions: {
    applyCustomization: 364,
    syncControls: 260,
    resolvePanels: 205,
  },
  runtime: {
    stable: {
      traversal: 477000,
      findTraversals: 456000,
      parentReads: 243000,
      classReads: 510000,
      layoutWidthReads: 4000,
      styleReads: 0,
      styleWrites: 0,
      textReads: 18000,
      textWrites: 0,
      logs: 0,
    },
    active: {
      traversal: 113526,
      findTraversals: 108528,
      parentReads: 57834,
      classReads: 142812,
      layoutWidthReads: 8572,
      styleReads: 167884,
      styleWrites: 14288,
      textReads: 4284,
      textWrites: 3572,
      logs: 1786,
    },
  },
};

function lines(source) {
  return source.split(/\r?\n/).length - 1;
}

function functionLines(source, name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `missing function ${name}`);
  const start = match.index;
  let index = source.indexOf('{', match.index + match[0].length);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1] || '';
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
    } else if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
    } else if (char === '"' || char === "'" || char === '`') {
      quote = char;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return lines(source.slice(start, index + 1)) + 1;
    }
  }
  throw new Error(`unterminated function ${name}`);
}

function loadFixture() {
  const testPath = path.join(root, 'scripts', 'validate-hp-colors-rewrite-v2-baseline.test.js');
  let source = fs.readFileSync(testPath, 'utf8');
  source = source.replace("const test = require('node:test');", 'const test = function () {};');
  source += '\nmodule.exports = { makeStatusFixture };\n';
  const loaded = new Module(testPath);
  loaded.filename = testPath;
  loaded.paths = Module._nodeModulePaths(path.dirname(testPath));
  loaded._compile(source, testPath);
  return loaded.exports.makeStatusFixture;
}

function clearCounters(counters) {
  for (const key of Object.keys(counters)) counters[key] = 0;
}

function measureRuntime(active) {
  const fixture = loadFixture()('enemy', {
    enabled: true,
    enemyMode: 'gradient',
    enemyLow: '#FD4949',
    enemyMid: '#FF7B00',
    enemyHigh: '#00FF00',
    readoutVisible: true,
    pipsVisible: true,
  }, 1, '||||||||');
  clearCounters(fixture.harness.operationCounts);
  clearCounters(fixture.harness.findCounts);
  fixture.harness.logs.length = 0;
  let logs = 0;
  for (let index = 0; index < 5000; index += 1) {
    if (active) fixture.fill.actuallayoutwidth = index & 1 ? 40 : 60;
    fixture.harness.scheduler.runNext();
    logs += fixture.harness.logs.length;
    fixture.harness.logs.length = 0;
  }
  const counts = fixture.harness.operationCounts;
  return {
    traversal: counts.traversal,
    findTraversals: counts.findTraversals,
    parentReads: counts.parentReads,
    classReads: counts.classReads,
    layoutWidthReads: counts.layoutWidthReads,
    styleReads: counts.styleReads,
    styleWrites: counts.styleWrites,
    textReads: counts.textReads,
    textWrites: counts.textWrites,
    logs,
  };
}

const menuSource = fs.readFileSync(menuPath, 'utf8');
const rendererSource = fs.readFileSync(rendererPath, 'utf8');
const after = {
  authoredLines: authoredPaths.reduce((total, file) => total + lines(fs.readFileSync(file, 'utf8')), 0),
  functions: {
    applyCustomization: functionLines(rendererSource, 'applyCustomization'),
    applyActiveCustomization: functionLines(rendererSource, 'applyActiveCustomization'),
    syncControls: functionLines(menuSource, 'syncControls'),
    resolvePanels: functionLines(menuSource, 'resolvePanels'),
  },
  runtime: {
    stable: measureRuntime(false),
    active: measureRuntime(true),
  },
};

console.log(JSON.stringify({ before: BEFORE, after }, null, 2));

assert.ok(after.authoredLines < BEFORE.authoredLines, 'authored JavaScript LOC did not decrease');
for (const name of Object.keys(BEFORE.functions)) {
  assert.ok(after.functions[name] < BEFORE.functions[name], `${name} did not get smaller`);
}
assert.ok(
  after.functions.applyActiveCustomization < BEFORE.functions.applyCustomization,
  'the largest active customization stage exceeds the old monolith',
);
for (const profile of ['stable', 'active']) {
  for (const key of [
    'traversal',
    'findTraversals',
    'parentReads',
    'classReads',
    'styleWrites',
    'textWrites',
    'logs',
  ]) {
    assert.ok(
      after.runtime[profile][key] <= BEFORE.runtime[profile][key],
      `${profile} ${key} increased`,
    );
  }
}
