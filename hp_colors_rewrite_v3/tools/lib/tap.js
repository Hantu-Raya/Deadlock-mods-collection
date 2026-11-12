'use strict';
// TAP parsing and the failure summary for `node --test --test-reporter=tap` output (tools/test.js, budgets.js,
// timing.js and dev.js read it; the runner that produces it is lib/run.js).
const path = require('node:path');
const { REPO } = require('./projects');
const { posix } = require('./run');

const tapUnescape = text => text.replace(/\\(\\|#|n|t|r)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r' })[c] || c);

function yamlScalar(raw) {
  const value = raw.trim();
  if (value === '~' || value === 'null') return null;
  if (value === 'true' || value === 'false') return value === 'true';
  if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)) return Number(value);
  if (value.startsWith("'") && value.endsWith("'") && value.length > 1) return tapUnescape(value.slice(1, -1).replace(/''/g, "'"));
  if (value.startsWith('"') && value.endsWith('"') && value.length > 1) { try { return JSON.parse(value); } catch { return value.slice(1, -1); } }
  return value;
}

// The YAML node's TAP reporter writes: scalars, block scalars (|-) and nested maps (kept as text).
function parseYamlBlock(lines) {
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const match = /^([A-Za-z_][\w-]*):(?: (.*))?$/.exec(lines[i]);
    if (!match) continue;
    const [, key, rest = ''] = match;
    if (rest === '' || /^[|>][-+]?$/.test(rest.trim())) {
      const body = [];
      while (i + 1 < lines.length && (lines[i + 1] === '' || /^\s/.test(lines[i + 1]))) body.push(lines[++i]);
      const indent = Math.min(...body.filter(line => line.trim()).map(line => /^\s*/.exec(line)[0].length), Infinity);
      const text = body.map(line => line.slice(Number.isFinite(indent) ? indent : 0)).join('\n').replace(/\s+$/, '');
      out[key] = rest === '' && !text ? null : text;
    } else out[key] = yamlScalar(rest);
  }
  return out;
}

function parseTap(text) {
  const lines = String(text).split(/\r?\n/);
  const result = { tests: [], diagnostics: [], failures: [], totals: {}, comments: [] };
  const lastAtDepth = [];
  let pending = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const end = /^(\s*)(ok|not ok) (\d+)(?: - (.*?))?(?: # (SKIP|TODO)\b ?(.*))?$/i.exec(line);
    if (end) {
      const indent = end[1].length, depth = Math.floor(indent / 4);
      const test = { name: tapUnescape(end[4] || ''), ok: end[2] === 'ok', depth, directive: end[5] ? end[5].toUpperCase() : null, info: {} };
      if (i + 1 < lines.length && lines[i + 1].trim() === '---') {
        const yaml = [];
        i += 2;
        while (i < lines.length && lines[i].trim() !== '...') yaml.push(lines[i++].slice(indent + 2));
        test.info = parseYamlBlock(yaml);
      }
      if (!test.ok && test.info.failureType !== 'subtestsFailed') {
        const failure = describeFailure(test);
        if (/^test failed$/.test(String(test.info.error)) && pending.length) failure.output = pending.filter(entry => entry.trim()).slice(0, 12);
        result.failures.push(failure);
      }
      result.tests.push(test);
      lastAtDepth[depth] = test;
      lastAtDepth.length = depth + 1;
      pending = [];
      continue;
    }
    const comment = /^(\s*)# (.*)$/.exec(line);
    if (!comment || /^Subtest: /.test(comment[2])) continue;
    const indent = comment[1].length, body = comment[2];
    const total = indent === 0 && /^(tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) (\d+(?:\.\d+)?)$/.exec(body);
    if (total) { result.totals[total[1]] = (result.totals[total[1]] || 0) + Number(total[2]); continue; }
    if (body.startsWith('{')) {
      try {
        const data = JSON.parse(body);
        const owner = lastAtDepth[Math.floor(indent / 4)];
        result.diagnostics.push({ test: owner ? owner.name : null, depth: Math.floor(indent / 4), data });
        continue;
      } catch { /* plain comment */ }
    }
    result.comments.push(tapUnescape(body));
    pending.push(tapUnescape(body));
  }
  return result;
}

// Prefer the assertion's own frame in a suite file; otherwise the test's declared location.
function failureSite(info) {
  const frames = String(info.stack || '').split('\n').map(frame => /\(?((?:[A-Za-z]:)?[^():]*?\.[cm]?js):(\d+):\d+\)?\s*$/.exec(frame.trim())).filter(Boolean)
    .filter(frame => !/^node:|node_modules|[\\/]internal[\\/]/.test(frame[1]));
  const location = /^(.*?):(\d+):\d+$/.exec(String(info.location || ''));
  const locationFile = location ? posix(location[1]) : null;
  const pick = frames.find(frame => locationFile && posix(frame[1]) === locationFile) || frames.find(frame => /\.test\.[cm]?js$/.test(frame[1])) || null;
  const [file, line] = pick ? [pick[1], pick[2]] : location ? [location[1], location[2]] : [null, null];
  if (!file) return null;
  const rel = posix(path.relative(REPO, path.resolve(file)));
  return (rel.startsWith('..') ? posix(file) : rel) + ':' + line;
}

function describeFailure(test) {
  const info = test.info;
  return {
    name: test.name, depth: test.depth, failureType: info.failureType || null, errorName: info.name || null,
    message: info.error == null ? '' : String(info.error), actual: info.actual, expected: info.expected,
    operator: info.operator || null, site: failureSite(info), hasActual: 'actual' in info, hasExpected: 'expected' in info,
  };
}

const truncate = (text, max) => text.length > max ? text.slice(0, max - 1) + '…' : text;
const oneLine = value => (typeof value === 'string' ? value : JSON.stringify(value)).replace(/\s+/g, ' ').trim();

function formatSummary(tap, { code = null, files = null, seconds = null, max = 160 } = {}) {
  const totals = tap.totals, out = [];
  const count = key => totals[key] != null ? totals[key] : key === 'tests' ? tap.tests.filter(t => !t.info.type || t.info.type === 'test').length : 0;
  const parts = ['tests ' + count('tests'), 'pass ' + count('pass'), 'fail ' + count('fail')];
  for (const key of ['skipped', 'todo', 'cancelled']) if (count(key)) parts.push(key + ' ' + count(key));
  out.push(parts.join('  ') + (files != null ? '  (' + files + ' file' + (files === 1 ? '' : 's') + (seconds != null ? ', ' + seconds.toFixed(1) + ' s' : '') + ')' : ''));
  tap.failures.forEach((failure, index) => {
    out.push('', (index + 1) + ') ' + failure.name + (failure.site ? '  [' + failure.site + ']' : ''));
    const message = failure.message.split('\n').map(line => line.trim()).filter(Boolean);
    // Deep-equality diffs: the first line plus the changed (+/-) lines, not the unchanged context.
    const changed = message.filter(line => /^[+-] /.test(line) && !/^\+ actual - expected/.test(line));
    const head = (changed.length ? [message[0], ...changed.slice(0, 4)] : message.slice(0, 3)).map(line => truncate(line, max));
    out.push('   ' + (failure.errorName && failure.errorName !== 'AssertionError' && !/^test failed$/.test(message[0] || '') ? failure.errorName + ': ' : '') + (head.shift() || failure.failureType || 'failed'));
    for (const line of head) out.push('   ' + line);
    if (failure.hasActual || failure.hasExpected) out.push('   actual:   ' + truncate(oneLine(failure.actual), max), '   expected: ' + truncate(oneLine(failure.expected), max) + (failure.operator ? '  (' + failure.operator + ')' : ''));
    if (failure.output) {
      const thrown = failure.output.find(line => /^\s*\w*(?:Error|Exception)\b/.test(line));
      for (const line of [failure.output[0], thrown].filter((line, i, all) => line && all.indexOf(line) === i)) out.push('   | ' + truncate(line.trim(), max));
    }
  });
  if (!tap.failures.length && code) out.push('', 'node --test exited ' + code + ' without a reported test failure; rerun the files directly for the raw output.');
  return out.join('\n');
}

module.exports = { parseTap, parseYamlBlock, tapUnescape, failureSite, describeFailure, formatSummary };
