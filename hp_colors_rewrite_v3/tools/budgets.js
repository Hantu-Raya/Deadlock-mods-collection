#!/usr/bin/env node
'use strict';
// Operation-budget report for the HP Colors v3 lanes.
//
//   node hp_colors_rewrite_v3/tools/budgets.js                    run the budget-bearing tests and print the table
//   node hp_colors_rewrite_v3/tools/budgets.js --from run.tap     parse a saved `node --test --test-reporter=tap` run
//   --project v3|qollock|showrank|all   also scan the variant lanes for budget-bearing tests (default v3)
//   --save <file>                       write the report as JSON
//   --compare <old.json>                per-scenario deltas against a saved report (increases are flagged)
//   --json                              print the JSON report instead of tables
// Exit 1 when a measurement is over its limit (or a budget test failed); 2 on usage errors.
//
// The limits have ONE source: the test files themselves. budgets.js parses the [scenario, ceiling] list and
// the `assert.ok(ops<=…)` guards from tests/renderer.test.js and the `ops('<scenario>').<metric> <= N`
// assertions from tests/audit-performance.test.js, so editing a test's budget updates this report. When a
// test is restructured past what the parser understands, the report says so ("limit not found"/warnings)
// instead of inventing a number.
const fs = require('node:fs');
const path = require('node:path');
const { REPO, PROJECTS, parseTap, runNodeTest, formatSummary } = require('./test.js');

const V3 = path.join(REPO, PROJECTS.v3.dir);
const RENDERER = path.join(V3, 'tests/renderer.test.js');
const AUDIT = path.join(V3, 'tests/audit-performance.test.js');
const CEILING_PATTERN = 'operation ceiling';

// ---------------------------------------------------------------------------------------------------
// A small JS scanner: enough to walk test sources without being fooled by strings, comments or regexes.
// ---------------------------------------------------------------------------------------------------
function skipLiteral(src, i) {
  const c = src[i], next = src[i + 1];
  if (c === '/' && next === '/') { const end = src.indexOf('\n', i); return end < 0 ? src.length : end; }
  if (c === '/' && next === '*') { const end = src.indexOf('*/', i + 2); return end < 0 ? src.length : end + 2; }
  if (c === '"' || c === "'") {
    for (let j = i + 1; j < src.length; j++) { if (src[j] === '\\') j++; else if (src[j] === c || src[j] === '\n') return j + 1; }
    return src.length;
  }
  if (c === '`') {
    for (let j = i + 1; j < src.length; j++) {
      if (src[j] === '\\') j++;
      else if (src[j] === '`') return j + 1;
      else if (src[j] === '$' && src[j + 1] === '{') j = matchClose(src, j + 1) - 1;
    }
    return src.length;
  }
  if (c === '/' && regexAllowed(src, i)) {
    let inClass = false;
    for (let j = i + 1; j < src.length; j++) {
      if (src[j] === '\\') j++;
      else if (src[j] === '[') inClass = true;
      else if (src[j] === ']') inClass = false;
      else if (src[j] === '/' && !inClass) { j++; while (/[a-z]/i.test(src[j] || '')) j++; return j; }
      else if (src[j] === '\n') return i + 1;
    }
  }
  return -1;
}
function regexAllowed(src, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  if (j < 0) return true;
  if (/[(,=:[!&|?{};+\-*%<>~^]/.test(src[j])) return true;
  const word = /([A-Za-z_$]+)$/.exec(src.slice(Math.max(0, j - 10), j + 1));
  return !!word && /^(?:return|typeof|case|in|of|delete|void|throw|new)$/.test(word[1]);
}
// Index just past the bracket matching the opener at `open` ('(', '[' or '{').
function matchClose(src, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' }, stack = [];
  for (let i = open; i < src.length; i++) {
    const skip = skipLiteral(src, i);
    if (skip > i) { i = skip - 1; continue; }
    const c = src[i];
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === ')' || c === ']' || c === '}') { if (stack.pop() !== c) throw new Error('unbalanced ' + c + ' at ' + i); if (!stack.length) return i + 1; }
  }
  throw new Error('unclosed bracket at ' + open);
}
// The expression starting at `start`, up to the first top-level ',' or closing bracket.
function readExpression(src, start) {
  for (let i = start; i < src.length; i++) {
    const skip = skipLiteral(src, i);
    if (skip > i) { i = skip - 1; continue; }
    if ('([{'.includes(src[i])) i = matchClose(src, i) - 1;
    else if (',)]};'.includes(src[i])) return src.slice(start, i).trim();
  }
  return src.slice(start).trim();
}
// Every `needle` outside strings/comments, with its enclosing `{` blocks' headers and its own statement prefix.
function findInBlocks(body, needle) {
  const hits = [], blocks = [];
  let statement = 0;
  for (let i = 0; i < body.length; i++) {
    const skip = skipLiteral(body, i);
    if (skip > i) { i = skip - 1; continue; }
    const c = body[i];
    if (body.startsWith(needle, i)) hits.push({ at: i, prefix: body.slice(statement, i).trim(), headers: blocks.map(block => block.header) });
    if (c === '(' || c === '[') { i = matchClose(body, i) - 1; continue; }
    if (c === '{') { blocks.push({ header: body.slice(statement, i).trim() }); statement = i + 1; }
    else if (c === '}') { blocks.pop(); statement = i + 1; }
    else if (c === ';') statement = i + 1;
  }
  return hits;
}
function stripComments(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const skip = skipLiteral(text, i);
    if (skip > i && text[i] === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) { i = skip - 1; continue; }
    if (skip > i) { out += text.slice(i, skip); i = skip - 1; continue; }
    out += text[i];
  }
  return out.trim();
}
// 'if (cond)' -> 'cond'; '' -> 'true'; anything else (else/for/function/…) -> null (not evaluable).
function guardOf(text) {
  text = stripComments(text);
  if (!text) return 'true';
  const match = /^if\s*\(/.exec(text);
  if (!match) return null;
  const open = match[0].length - 1, close = matchClose(text, open);
  return text.slice(close).trim() ? null : text.slice(open + 1, close - 1).trim();
}
// The `{…}` body of the test whose call starts at or after `from` (the arrow/function after its name).
function testBody(src, from) {
  const arrow = /=>\s*\{|function\s*\w*\s*\([^)]*\)\s*\{/g;
  arrow.lastIndex = from;
  const match = arrow.exec(src);
  if (!match) return null;
  const open = match.index + match[0].length - 1;
  return { start: open + 1, end: matchClose(src, open) - 1, text: src.slice(open + 1, matchClose(src, open) - 1) };
}
const compile = (params, expr) => { try { return new Function(...params, '"use strict"; return (' + expr + ');'); } catch { return null; } };

// ---------------------------------------------------------------------------------------------------
// Limits from renderer.test.js: the scenario loop and named ceiling tests.
// ---------------------------------------------------------------------------------------------------
function parseRendererLimits(src, file = 'renderer.test.js') {
  const result = { file, scenarios: [], rules: [], named: [], mode: null, warnings: [] };
  const loop = /for\s*\(\s*const\s*\[\s*scenario\s*,\s*ceiling\s*\]\s*of\s*\[/g.exec(src);
  if (loop) {
    const open = loop.index + loop[0].length - 1, close = matchClose(src, open);
    let list;
    try { list = new Function('"use strict"; return ' + src.slice(open, close) + ';')(); } catch (error) { result.warnings.push(file + ': scenario list is not a plain literal (' + error.message + ')'); }
    if (Array.isArray(list)) result.scenarios = list.filter(entry => Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number').map(([scenario, ceiling]) => ({ scenario, ceiling }));
    const body = testBody(src, close);
    if (body) {
      const mode = /\bconst\s+mode\s*=\s*/.exec(body.text);
      if (mode) result.mode = { expr: readExpression(body.text, mode.index + mode[0].length), fn: compile(['scenario'], readExpression(body.text, mode.index + mode[0].length)) };
      for (const hit of findInBlocks(body.text, 'assert.ok(ops<=')) {
        const expr = readExpression(body.text, hit.at + 'assert.ok(ops<='.length);
        if (expr === 'ceiling') continue; // the loop's own [scenario, ceiling] limit
        const guards = [...hit.headers, hit.prefix].map(guardOf);
        const after = body.text.slice(hit.at + 'assert.ok(ops<='.length + body.text.slice(hit.at + 'assert.ok(ops<='.length).indexOf(expr) + expr.length);
        const message = (/^\s*,\s*(['"`])((?:\\.|(?!\1).)*)\1/.exec(after) || [])[2] || '';
        if (guards.includes(null)) { result.warnings.push(file + ': skipped a baseline guarded by an unsupported block (' + expr + ')'); continue; }
        const condition = guards.filter(guard => guard !== 'true').map(guard => '(' + guard + ')').join(' && ') || 'true';
        const rule = { condition, expr, message, cond: compile(['scenario', 'mode', 'ceiling'], condition), value: compile(['scenario', 'mode', 'ceiling'], expr) };
        if (!rule.cond || !rule.value) { result.warnings.push(file + ': could not compile baseline ' + expr); continue; }
        result.rules.push(rule);
      }
    }
    if (!result.mode) result.warnings.push(file + ': scenario mode expression not found; using the diagnostics\' mode');
  } else result.warnings.push(file + ': [scenario, ceiling] list not found');
  // Single tests named '… operation ceiling …' with a literal `assert.ok(ops<=N`.
  for (const match of src.matchAll(/\btest\(\s*(['"`])((?:\\.|(?!\1).)*operation ceiling(?:\\.|(?!\1).)*)\1\s*,/g)) {
    const body = testBody(src, match.index + match[0].length);
    const limit = body && /assert\.ok\(\s*ops\s*<=\s*(\d+(?:\.\d+)?)\s*[,)]/.exec(body.text);
    if (limit) result.named.push({ test: match[2], ceiling: Number(limit[1]), mode: (/\b(active|idle|dormant)\b/.exec(match[2]) || [])[1] || '-' });
  }
  return result;
}

function rendererLimitsFor(limits, scenario, mode) {
  const listed = limits.scenarios.find(entry => entry.scenario === scenario);
  const ceiling = listed ? listed.ceiling : null;
  if (!mode && limits.mode && limits.mode.fn) { try { mode = limits.mode.fn(scenario); } catch { /* leave undefined */ } }
  const applied = [];
  for (const rule of limits.rules) {
    try { if (rule.cond(scenario, mode, ceiling)) applied.push({ value: rule.value(scenario, mode, ceiling), rule }); } catch { /* unknown identifier: not evaluable here */ }
  }
  const strict = applied.filter(entry => typeof entry.value === 'number').sort((a, b) => a.value - b.value)[0] || null;
  return { listed: !!listed, ceiling, mode, baseline: strict ? strict.value : null, baselineRule: strict ? strict.rule.message || strict.rule.condition : null };
}

// ---------------------------------------------------------------------------------------------------
// Limits from audit-performance.test.js: ops('<scenario>').<metric> <op> N.
// ---------------------------------------------------------------------------------------------------
function parseAuditLimits(src, file = 'audit-performance.test.js') {
  const limits = [], warnings = [];
  const add = (scenario, metric, op, limit) => { if (!limits.some(entry => entry.scenario === scenario && entry.metric === metric && entry.op === op)) limits.push({ scenario, metric, op, limit: Number(limit) }); };
  for (const m of src.matchAll(/ops\(\s*['"](\w+)['"]\s*\)\.(\w+)(?:\s*\|\|\s*0)?\s*(<=|>=|<|>)\s*(\d+(?:\.\d+)?)/g)) add(m[1], m[2], m[3], m[4]);
  for (const m of src.matchAll(/assert\.(?:strictEqual|equal)\(\s*ops\(\s*['"](\w+)['"]\s*\)\.(\w+)(?:\s*\|\|\s*0)?\s*,\s*(\d+(?:\.\d+)?)\s*[,)]/g)) add(m[1], m[2], '==', m[3]);
  // panelCalls=[...] summed over one scenario, divided per second: ops('timers') … /10<300.
  const keys = /const\s+(\w+)\s*=\s*\[([^\]]*)\]\s*;\s*assert\.ok\(\s*\1\.reduce\(/.exec(src);
  if (keys) {
    const tail = src.slice(keys.index + keys[0].length);
    const sum = /^[^;]*?ops\(\s*['"](\w+)['"]\s*\)[^;]*?\)\s*\/\s*(\d+(?:\.\d+)?)\s*(<=|<)\s*(\d+(?:\.\d+)?)/.exec(tail);
    if (sum) limits.push({ scenario: sum[1], metric: keys[1] + '/s', op: sum[3], limit: Number(sum[4]), sumOf: [...keys[2].matchAll(/['"](\w+)['"]/g)].map(k => k[1]), divisor: Number(sum[2]) });
    else warnings.push(file + ': ' + keys[1] + ' sum limit not understood');
  }
  if (!limits.length) warnings.push(file + ': no ops(…) limits found');
  return { file, limits, warnings };
}

function measureAudit(limit, operations) {
  if (!operations) return null;
  if (limit.sumOf) return limit.sumOf.reduce((sum, key) => sum + (operations[key] || 0), 0) / limit.divisor;
  return operations[limit.metric] || 0;
}
const within = (value, op, limit) => ({ '<=': value <= limit, '<': value < limit, '>=': value >= limit, '>': value > limit, '==': value === limit })[op];
const EPSILON = 1e-9;

// ---------------------------------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------------------------------
const round = (value, digits = 1) => value == null ? null : Math.round(value * 10 ** digits) / 10 ** digits + 0;

function buildReport(tapText, { renderer, audit, variants = [], source = 'run', code = null } = {}) {
  const tap = parseTap(tapText);
  const counted = [], auditRows = [], boundary = {}, warnings = [...(renderer ? renderer.warnings : []), ...(audit ? audit.warnings : [])];
  const seen = new Set();
  for (const { data, test } of tap.diagnostics) {
    if (!data || typeof data !== 'object') continue;
    if (typeof data.scenario === 'string' && typeof data.COUNTED === 'number') {
      if (seen.has(data.scenario)) continue;
      seen.add(data.scenario);
      const limits = renderer ? rendererLimitsFor(renderer, data.scenario, data.mode) : { ceiling: null, baseline: null, baselineRule: null, mode: data.mode };
      counted.push(countedRow(data.scenario, limits.mode || data.mode || '-', data.COUNTED, limits.ceiling, limits.baseline, { boundaryValidityCallsPerBarSecond: data.boundaryValidityCallsPerBarSecond, baselineRule: limits.baselineRule }));
    } else if (typeof data.ops === 'number' && !data.scenario && test && test.includes(CEILING_PATTERN)) {
      const named = renderer && renderer.named.find(entry => entry.test === test);
      if (!seen.has(test)) { seen.add(test); counted.push(countedRow(test, named ? named.mode : '-', data.ops, named ? named.ceiling : null, null, {})); }
    } else if (typeof data.scenario === 'string' && data.operations && typeof data.operations === 'object') {
      boundary[data.scenario] = { boundaryValidityCalls: data.operations.boundaryValidityCalls || 0, boundaryQueries: data.operations.boundaryQueries || 0, parentReads: data.operations.parentReads || 0, operations: data.operations };
    }
  }
  if (renderer) for (const { scenario, ceiling } of renderer.scenarios) if (!seen.has(scenario)) {
    const limits = rendererLimitsFor(renderer, scenario);
    counted.push({ ...countedRow(scenario, limits.mode || '-', null, ceiling, limits.baseline, {}), status: 'missing' });
  }
  if (renderer) { // source order: the ceiling list first, then named tests and unlisted measurements
    const order = renderer.scenarios.map(entry => entry.scenario);
    counted.sort((a, b) => (order.includes(a.scenario) ? order.indexOf(a.scenario) : 1e6) - (order.includes(b.scenario) ? order.indexOf(b.scenario) : 1e6));
  }
  if (audit) for (const limit of audit.limits) {
    const measured = measureAudit(limit, boundary[limit.scenario] && boundary[limit.scenario].operations);
    const lower = limit.op === '>=' || limit.op === '>';
    auditRows.push({ scenario: limit.scenario, metric: limit.metric, measured, op: limit.op, limit: limit.limit,
      headroom: measured == null || limit.op === '==' ? null : lower ? measured - limit.limit : limit.limit - measured,
      status: measured == null ? 'missing' : within(measured, limit.op, limit.limit) ? 'ok' : 'over' });
  }
  for (const value of Object.values(boundary)) delete value.operations;
  const failures = tap.failures.map(failure => ({ name: failure.name, site: failure.site, message: failure.message.split('\n')[0] }));
  return {
    schema: 'hpv3-budgets/1', generatedAt: new Date().toISOString(), node: process.version, source,
    counted, audit: auditRows, boundary, variants, warnings,
    run: { exitCode: code, tests: tap.totals.tests ?? null, pass: tap.totals.pass ?? null, fail: tap.totals.fail ?? tap.failures.length, failures },
    _tap: tap,
  };
}

function countedRow(scenario, mode, counted, ceiling, baseline, extra) {
  const over = counted != null && ((ceiling != null && counted > ceiling + EPSILON) || (baseline != null && counted > baseline + EPSILON));
  return {
    scenario, mode, counted, ceiling, headroom: counted != null && ceiling != null ? round(ceiling - counted, 3) : null,
    baseline: baseline == null ? null : round(baseline, 3), baselineHeadroom: counted != null && baseline != null ? round(baseline - counted, 3) : null,
    status: counted == null ? 'missing' : over ? 'over' : ceiling == null ? 'unlisted' : 'ok', ...extra,
  };
}

function compareReports(current, old) {
  const rows = [], index = report => {
    const map = new Map();
    for (const row of report.counted || []) map.set('counted ' + row.scenario, { value: row.counted, lower: false });
    for (const row of report.audit || []) map.set('audit ' + row.scenario + '.' + row.metric, { value: row.measured, lower: row.op === '>=' || row.op === '>' });
    return map;
  };
  const before = index(old), after = index(current);
  const status = new Map([...(current.counted || []).map(row => ['counted ' + row.scenario, row.status]), ...(current.audit || []).map(row => ['audit ' + row.scenario + '.' + row.metric, row.status])]);
  for (const [key, entry] of after) {
    const prior = before.get(key);
    const delta = prior && prior.value != null && entry.value != null ? round(entry.value - prior.value, 3) : null;
    const worse = delta != null && (entry.lower ? delta < 0 : delta > 0);
    const flag = status.get(key) === 'over' ? 'over' : worse ? (entry.lower ? 'decrease below bound' : 'increase') : !prior ? 'new' : entry.value == null && prior.value != null ? 'missing' : delta ? 'decrease' : '';
    rows.push({ key, old: prior ? prior.value : null, new: entry.value, delta, flag });
  }
  for (const [key, prior] of before) if (!after.has(key)) rows.push({ key, old: prior.value, new: null, delta: null, flag: 'removed' });
  return rows;
}

// ---------------------------------------------------------------------------------------------------
// Variant lanes: budget-bearing = emits t.diagnostic or counts panel operations.
// ---------------------------------------------------------------------------------------------------
function variantBudgetFiles(projectKey, repo = REPO) {
  const project = PROJECTS[projectKey], dir = path.join(repo, project.dir, 'tests');
  if (!fs.existsSync(dir)) return { project: projectKey, label: project.label, files: [], scanned: 0, note: project.dir + '/tests is absent' };
  const tests = fs.readdirSync(dir).filter(name => name.endsWith('.test.js')).sort();
  const files = tests.filter(name => /\.diagnostic\(|operationCounts|operation ceiling/.test(fs.readFileSync(path.join(dir, name), 'utf8')))
    .map(name => project.dir + '/tests/' + name);
  return { project: projectKey, label: project.label, files, scanned: tests.length,
    note: files.length ? files.length + ' budget-bearing file(s)' : 'no budget-bearing tests in ' + project.dir + '/tests (' + tests.length + ' suite' + (tests.length === 1 ? '' : 's') + ' scanned: no t.diagnostic, operationCounts or operation ceiling)' };
}

// ---------------------------------------------------------------------------------------------------
// Printing.
// ---------------------------------------------------------------------------------------------------
const fmt = (value, digits = 1) => value == null ? '-' : typeof value === 'number' ? (Object.is(round(value, digits), -0) ? 0 : round(value, digits)).toFixed(digits) : String(value);
const signed = (value, digits = 1) => value == null ? '-' : (value > 0 ? '+' : '') + fmt(value, digits);
function table(headers, rows, align) {
  const widths = headers.map((header, i) => Math.max(header.length, ...rows.map(row => String(row[i]).length)));
  const line = row => row.map((cell, i) => align[i] === 'r' ? String(cell).padStart(widths[i]) : String(cell).padEnd(widths[i])).join('  ').trimEnd();
  return [line(headers), widths.map(w => '-'.repeat(w)).join('  ').trimEnd(), ...rows.map(line)].join('\n');
}
const mark = status => ({ ok: '', over: 'OVER', missing: 'missing', unlisted: 'limit not found' })[status] ?? status;

function printReport(report, compare) {
  const out = [];
  out.push('COUNTED renderer operations per bar per second (limits parsed from tests/renderer.test.js)');
  out.push(table(['scenario', 'mode', 'COUNTED', 'ceiling', 'headroom', 'pre-Units', 'headroom', ''],
    report.counted.map(row => [row.scenario, row.mode, fmt(row.counted), fmt(row.ceiling, 0), fmt(row.headroom), fmt(row.baseline), fmt(row.baselineHeadroom), mark(row.status)]),
    ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'l']));
  // The note quotes the smallest baseline per mode from the parsed limits, never a hard-coded number.
  const basis = ['active', 'idle'].map(mode => {
    const values = report.counted.filter(entry => entry.mode === mode && entry.baseline != null).map(entry => entry.baseline);
    return values.length ? fmt(Math.min(...values)) + ' ' + mode : null;
  }).filter(Boolean).join(' / ');
  out.push('pre-Units = the stricter baseline renderer.test.js asserts on top of the ceiling (' + (basis ? basis + ' before the Units gates,' : 'the pre-Units hero polling budget,'),
    'plus the bounty and HP percent allowances); "-" where none applies (dormant, OLD, mask, labels, low stamina).');
  if (report.audit.length) {
    out.push('', 'Audit boundary measurements (limits parsed from tests/audit-performance.test.js)');
    out.push(table(['scenario', 'metric', 'measured', 'limit', 'headroom', ''],
      report.audit.map(row => [row.scenario, row.metric, fmt(row.measured, Number.isInteger(row.measured) || row.measured == null ? 0 : 1), row.op + ' ' + row.limit, fmt(row.headroom, Number.isInteger(row.headroom) || row.headroom == null ? 0 : 1), mark(row.status)]),
      ['l', 'l', 'r', 'r', 'r', 'l']));
  }
  for (const variant of report.variants) out.push('', variant.label + ': ' + variant.note);
  if (compare) {
    out.push('', 'Compared with ' + compare.file);
    const changed = compare.rows.filter(row => row.flag);
    out.push(changed.length ? table(['key', 'old', 'new', 'delta', ''], changed.map(row => [row.key, fmt(row.old), fmt(row.new), signed(row.delta), row.flag.toUpperCase()]), ['l', 'r', 'r', 'r', 'l']) : 'no changes');
  }
  for (const warning of report.warnings) out.push('warning: ' + warning);
  const over = [...report.counted, ...report.audit].filter(row => row.status === 'over');
  out.push('', report.counted.filter(row => row.counted != null).length + ' counted scenarios, ' + report.audit.filter(row => row.measured != null).length + ' audit limits'
    + (report.run.tests != null ? '; tests ' + report.run.tests + ', fail ' + report.run.fail : '') + (over.length ? '; ' + over.length + ' OVER LIMIT' : '; all within limits'));
  if (report.run.failures.length) out.push('', 'Failing budget tests:', formatSummary(report._tap).split('\n').slice(2).join('\n'));
  return out.join('\n');
}

// ---------------------------------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------------------------------
function parseArgs(argv) {
  const options = { from: null, project: 'v3', save: null, compare: null, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i], eq = arg.indexOf('='), name = eq > 0 && arg.startsWith('--') ? arg.slice(0, eq) : arg;
    const value = () => { if (name !== arg) return arg.slice(eq + 1); if (i + 1 >= argv.length) throw new Error(name + ' needs a value'); return argv[++i]; };
    if (name === '--from') options.from = value();
    else if (name === '--project') options.project = value().toLowerCase();
    else if (name === '--save') options.save = value();
    else if (name === '--compare') options.compare = value();
    else if (name === '--json') options.json = true;
    else if (name === '--help' || name === '-h') options.help = true;
    else throw new Error('unknown argument ' + arg);
  }
  if (options.project !== 'all' && !PROJECTS[options.project]) throw new Error('--project must be v3, qollock, showrank or all');
  return options;
}

async function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); } catch (error) { console.error('budgets.js: ' + error.message); return 2; }
  if (options.help) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 11).map(line => line.replace(/^\/\/ ?/, '')).join('\n')); return 0; }
  const renderer = parseRendererLimits(fs.readFileSync(RENDERER, 'utf8'));
  const audit = parseAuditLimits(fs.readFileSync(AUDIT, 'utf8'));
  const variantKeys = options.project === 'all' ? ['qollock', 'showrank'] : options.project === 'v3' ? [] : [options.project];
  const variants = variantKeys.map(key => variantBudgetFiles(key));
  // Variant files that do carry budgets: their own audit-style limits join the table.
  for (const variant of variants) for (const file of variant.files) {
    const parsed = parseAuditLimits(fs.readFileSync(path.join(REPO, file), 'utf8'), file);
    audit.limits.push(...parsed.limits.filter(limit => !audit.limits.some(entry => entry.scenario === limit.scenario && entry.metric === limit.metric)));
  }
  let tapText, code = null, source;
  if (options.from) {
    try { tapText = fs.readFileSync(path.resolve(options.from), 'utf8'); } catch (error) { console.error('budgets.js: cannot read ' + options.from + ': ' + error.message); return 2; }
    source = 'tap:' + options.from;
  } else {
    const rel = file => path.relative(REPO, file).split(path.sep).join('/');
    if (!options.json) console.error('running ' + rel(RENDERER) + " (/" + CEILING_PATTERN + "/), " + rel(AUDIT) + variants.flatMap(v => v.files).map(f => ', ' + f).join('') + '…');
    const runs = await Promise.all([
      runNodeTest([rel(RENDERER)], { grep: CEILING_PATTERN }),
      runNodeTest([rel(AUDIT), ...variants.flatMap(variant => variant.files)]),
    ]);
    tapText = runs.map(run => run.stdout + '\n' + run.stderr).join('\n');
    code = runs.some(run => run.code) ? 1 : 0;
    source = 'run';
  }
  const report = buildReport(tapText, { renderer, audit, variants: variants.map(({ label, project, files, note }) => ({ project, label, files, note })), source, code });
  let compare = null;
  if (options.compare) {
    let old;
    try { old = JSON.parse(fs.readFileSync(path.resolve(options.compare), 'utf8')); } catch (error) { console.error('budgets.js: cannot read ' + options.compare + ': ' + error.message); return 2; }
    compare = { file: options.compare, rows: compareReports(report, old) };
  }
  const { _tap, ...plain } = report;
  if (compare) plain.compare = compare.rows;
  if (options.save) { fs.mkdirSync(path.dirname(path.resolve(options.save)), { recursive: true }); fs.writeFileSync(path.resolve(options.save), JSON.stringify(plain, null, 2) + '\n'); }
  console.log(options.json ? JSON.stringify(plain, null, 2) : printReport(report, compare));
  if (options.save && !options.json) console.log('saved ' + options.save);
  const over = [...report.counted, ...report.audit].some(row => row.status === 'over');
  return over || report.run.failures.length || (code && !options.from) ? 1 : 0;
}

module.exports = {
  skipLiteral, matchClose, readExpression, findInBlocks, guardOf, parseRendererLimits, rendererLimitsFor, parseAuditLimits,
  measureAudit, buildReport, compareReports, variantBudgetFiles, printReport, parseArgs, main,
};

if (require.main === module) main().then(code => { process.exitCode = code; }, error => { console.error(error); process.exitCode = 2; });
