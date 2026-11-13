'use strict';
// tools/budgets.js: TAP diagnostics, limit parsing from the test sources, report/compare logic.
// Canned TAP only; the renderer and audit suites are never spawned here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const budgets = require('../tools/budgets');
const { parseTap } = require('../tools/lib/tap');

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, (message || '') + ' ' + actual + ' != ' + expected);

// A miniature renderer.test.js with the same shape as the real ceiling loop.
const RENDERER_SRC = String.raw`
const COUNTED = ['traversal'];
for (const [scenario,ceiling] of [['active',300],['idle',200],['released',30],
    // a comment inside the list: ['commented',1]
    ['fooBountyIdle',200],['fooBountyActive',300],['fooHpPercentActive',300],['oldIdle',200]]) test(scenario+' operation ceiling includes world JSON parses',t => {
  const mode = scenario.startsWith('released') ? 'dormant' : /Idle$/.test(scenario)?'idle': /Active$/.test(scenario)?'active':scenario;
  const decoy = '{ not a block }', pattern = /[{(]/;
  t.diagnostic(JSON.stringify({scenario,mode,COUNTED:ops}));
  assert.ok(ops<=ceiling,'' + ops + ' > ' + ceiling);
  if (mode!=='dormant' && !/^old|Bounty|HpPercent/.test(scenario)) assert.ok(ops<=(mode==='idle'?194.3:219.3),'pre-Units budget: '+ops);
  // Ticket 50: a comment between statements must not hide the guard.
  if (/Bounty/.test(scenario)) assert.ok(ops<=(mode==='idle'?194.3:219.3)+0.9+1e-9,'bounty allowance: '+ops);
  if (/HpPercent/.test(scenario)) {
    assert.ok(ops<=(mode==='idle'?194.3:219.3+4.6)+1e-9,'hp percent allowance: '+ops);
  }
  for (const x of [1]) { assert.ok(ops<=1,'inside a loop'); }
});
test('barrier line churn stays inside the active operation ceiling',t=>{
  const ops=1; t.diagnostic(JSON.stringify({ops}));
  assert.ok(ops<=300,'' + ops + ' > 300');
});
`;

const AUDIT_SRC = String.raw`
test('audit: measured boundary budgets remain bounded',()=>{
  const ops=name=>results[name].operations;
  assert.ok(ops('preview').boundaryValidityCalls<=11000);assert.ok(ops('preview').parentReads<=2000);
  if (unminified) {
    assert.equal(ops('bootChrome').classReads||0,0);
    assert.ok(ops('bootChrome').boundaryValidityCalls<=268);
    assert.ok(ops('bootChrome').boundaryQueries>=1,'attribution');
  }
  assert.ok(ops('syncAll').boundaryValidityCalls<=970);
  const panelCalls=['parentReads','classReads'];
  assert.ok(panelCalls.reduce((sum,key)=>sum+(ops('timers')[key]||0),0)/10<300,'under 300/s');
});
`;

function rendererDiag(scenario, mode, counted) {
  return '# ' + JSON.stringify({ scenario, mode, COUNTED: counted, boundaryValidityCallsPerBarSecond: 1, operations: { traversal: 1 }, observedDigest: 'x' });
}
function tapFor(entries, audit = []) {
  const lines = ['TAP version 13'];
  entries.forEach(([scenario, mode, counted], i) => {
    lines.push('# Subtest: ' + scenario + ' operation ceiling includes world JSON parses', 'ok ' + (i + 1) + ' - ' + scenario + ' operation ceiling includes world JSON parses',
      '  ---', '  duration_ms: 1.5', "  type: 'test'", '  ...', rendererDiag(scenario, mode, counted));
  });
  lines.push('# Subtest: barrier line churn stays inside the active operation ceiling', 'ok 99 - barrier line churn stays inside the active operation ceiling', '  ---', '  duration_ms: 1', "  type: 'test'", '  ...', '# {"ops":164,"throws":10}');
  for (const [scenario, operations] of audit) lines.push('# Subtest: audit ' + scenario, 'ok 100 - audit ' + scenario, '  ---', '  duration_ms: 1', '  ...', '# ' + JSON.stringify({ scenario, operations, digest: 'd' }));
  lines.push('1..1', '# tests ' + (entries.length + 1 + audit.length), '# pass ' + (entries.length + 1 + audit.length), '# fail 0');
  return lines.join('\n');
}

test('scanner skips strings, comments, template literals and regex literals when matching brackets', () => {
  const src = "f({a: '}', b: /[}]/g, c: `}${'{'}`, /* } */ d: 1 // }\n})";
  assert.equal(budgets.matchClose(src, 1), src.length);
  assert.equal(budgets.readExpression('(a?1:2)+0.5, rest', 0), '(a?1:2)+0.5');
  assert.equal(budgets.readExpression('x/2 > 1) tail', 0), 'x/2 > 1');
  assert.equal(budgets.guardOf("// note\n  if (/a(b)/.test(s))"), '/a(b)/.test(s)');
  assert.equal(budgets.guardOf(''), 'true');
  assert.equal(budgets.guardOf('for (const x of y)'), null);
  assert.equal(budgets.guardOf('if (a) else'), null);
});

test('renderer limits come from the [scenario, ceiling] list and the guarded ops<= baselines', () => {
  const limits = budgets.parseRendererLimits(RENDERER_SRC);
  assert.deepEqual(limits.scenarios.map(entry => entry.scenario), ['active', 'idle', 'released', 'fooBountyIdle', 'fooBountyActive', 'fooHpPercentActive', 'oldIdle']);
  assert.equal(limits.rules.length, 3, 'three baselines; the loop-body assertion is not evaluable');
  assert.ok(limits.warnings.some(warning => /unsupported block/.test(warning)), 'the for-loop guarded assertion is reported, not guessed');
  const at = (scenario, mode) => budgets.rendererLimitsFor(limits, scenario, mode);
  assert.deepEqual([at('active').ceiling, at('active').mode], [300, 'active']);
  near(at('active').baseline, 219.3);
  near(at('idle').baseline, 194.3);
  assert.equal(at('released').mode, 'dormant');
  assert.equal(at('released').ceiling, 30);
  assert.equal(at('released').baseline, null, 'dormant has no pre-Units baseline');
  near(at('fooBountyIdle').baseline, 195.2);
  near(at('fooBountyActive').baseline, 220.2);
  near(at('fooHpPercentActive').baseline, 223.9);
  assert.equal(at('oldIdle').baseline, null, 'OLD bar styles are excluded from the baseline');
  assert.equal(at('notListed').ceiling, null);
  assert.deepEqual(limits.named, [{ test: 'barrier line churn stays inside the active operation ceiling', ceiling: 300, mode: 'active' }]);
});

test('the real renderer and audit suites parse without warnings into the expected limits', () => {
  const renderer = budgets.parseRendererLimits(fs.readFileSync(path.join(__dirname, 'renderer.test.js'), 'utf8'));
  assert.deepEqual(renderer.warnings, []);
  assert.ok(renderer.scenarios.length >= 60, 'ceiling scenarios: ' + renderer.scenarios.length);
  const expected = { active: 300, idle: 200, dormant: 30 };
  for (const { scenario } of renderer.scenarios) {
    const limits = budgets.rendererLimitsFor(renderer, scenario);
    assert.equal(limits.ceiling, expected[limits.mode], scenario + ' ceiling follows its mode');
    if (limits.mode === 'dormant') assert.equal(limits.baseline, null);
    if (limits.baseline != null) assert.ok(limits.baseline < limits.ceiling, scenario + ' baseline is stricter');
  }
  const plain = budgets.rendererLimitsFor(renderer, 'active').baseline;
  const hp = renderer.scenarios.find(entry => /HpPercent.*Active$/.test(entry.scenario));
  const bounty = renderer.scenarios.find(entry => /Bounty.*Active$/.test(entry.scenario));
  assert.ok(hp && bounty, 'HP percent and bounty active scenarios are listed');
  assert.ok(budgets.rendererLimitsFor(renderer, hp.scenario).baseline > plain, 'HP percent baseline adds its allowance');
  assert.ok(budgets.rendererLimitsFor(renderer, bounty.scenario).baseline > plain, 'bounty baseline adds its allowance');
  assert.ok(renderer.named.some(entry => /barrier/.test(entry.test) && entry.ceiling === 300));

  const audit = budgets.parseAuditLimits(fs.readFileSync(path.join(__dirname, 'audit-performance.test.js'), 'utf8'));
  assert.deepEqual(audit.warnings, []);
  const find = (scenario, metric) => audit.limits.find(limit => limit.scenario === scenario && limit.metric === metric);
  for (const [scenario, metric] of [['bootChrome', 'boundaryValidityCalls'], ['syncAll', 'boundaryValidityCalls'], ['preview', 'parentReads']]) {
    assert.equal(find(scenario, metric) && find(scenario, metric).op, '<=', scenario + '.' + metric);
  }
});

test('audit limits: upper/lower bounds, equalities and the per-second panel-call sum', () => {
  const { limits, warnings } = budgets.parseAuditLimits(AUDIT_SRC);
  assert.deepEqual(warnings, []);
  const brief = limits.map(limit => limit.scenario + '.' + limit.metric + ' ' + limit.op + ' ' + limit.limit);
  assert.deepEqual(brief, ['preview.boundaryValidityCalls <= 11000', 'preview.parentReads <= 2000', 'bootChrome.boundaryValidityCalls <= 268',
    'bootChrome.boundaryQueries >= 1', 'syncAll.boundaryValidityCalls <= 970', 'bootChrome.classReads == 0', 'timers.panelCalls/s < 300']);
  const panel = limits.find(limit => limit.metric === 'panelCalls/s');
  assert.equal(budgets.measureAudit(panel, { parentReads: 1000, classReads: 500, styleWrites: 99999 }), 150);
  assert.equal(budgets.measureAudit(limits[0], {}), 0, 'absent counters read as zero');
});

test('TAP diagnostics belong to the test that emitted them, at any depth', () => {
  const tap = parseTap(['TAP version 13', '# Subtest: outer', '    # Subtest: inner', '    ok 1 - inner', '      ---', '      duration_ms: 1', '      ...',
    '    # {"scenario":"nested","COUNTED":1}', '    1..1', 'ok 1 - outer', '  ---', '  duration_ms: 2', '  ...', '# {"ops":5}', '# not json {', '1..1', '# tests 2', '# pass 2',
    'TAP version 13', 'ok 1 - second stream', '1..1', '# tests 1', '# pass 1'].join('\n'));
  assert.deepEqual(tap.diagnostics.map(entry => [entry.test, entry.depth, entry.data]), [['inner', 1, { scenario: 'nested', COUNTED: 1 }], ['outer', 0, { ops: 5 }]]);
  assert.deepEqual([tap.totals.tests, tap.totals.pass], [3, 3], 'concatenated runs add up');
});

test('report rows carry ceiling, pre-Units baseline and headroom; over-limit and missing scenarios are marked', () => {
  const renderer = budgets.parseRendererLimits(RENDERER_SRC);
  const audit = budgets.parseAuditLimits(AUDIT_SRC);
  const text = tapFor([['active', 'active', 164.3], ['idle', 'idle', 201], ['released', 'dormant', 11], ['fooBountyActive', 'active', 220.2], ['fooHpPercentActive', 'active', 223.9], ['extraActive', 'active', 5]],
    [['preview', { boundaryValidityCalls: 9561, parentReads: 2001 }], ['bootChrome', { boundaryValidityCalls: 268, boundaryQueries: 2 }], ['timers', { parentReads: 2000, classReads: 830 }]]);
  const report = budgets.buildReport(text, { renderer, audit });
  const row = scenario => report.counted.find(entry => entry.scenario === scenario);
  assert.deepEqual([row('active').ceiling, row('active').headroom, row('active').status], [300, 135.7, 'ok']);
  near(row('active').baseline, 219.3);
  near(row('active').baselineHeadroom, 55);
  assert.equal(row('idle').status, 'over', '201 > 200');
  assert.deepEqual([row('released').mode, row('released').baseline, row('released').headroom], ['dormant', null, 19]);
  assert.deepEqual([row('fooBountyActive').baselineHeadroom, row('fooBountyActive').status], [0, 'ok'], 'exactly at the bounty allowance');
  assert.deepEqual([row('fooHpPercentActive').baseline, row('fooHpPercentActive').status], [223.9, 'ok']);
  assert.equal(row('fooBountyIdle').status, 'missing', 'listed but not measured');
  assert.equal(row('extraActive').status, 'unlisted', 'measured but absent from the ceiling list');
  assert.deepEqual([row('barrier line churn stays inside the active operation ceiling').counted, row('barrier line churn stays inside the active operation ceiling').ceiling], [164, 300]);
  assert.deepEqual(report.counted.slice(0, 3).map(entry => entry.scenario), ['active', 'idle', 'released'], 'source order');
  const auditRow = (scenario, metric) => report.audit.find(entry => entry.scenario === scenario && entry.metric === metric);
  assert.deepEqual([auditRow('preview', 'parentReads').measured, auditRow('preview', 'parentReads').status], [2001, 'over']);
  assert.deepEqual([auditRow('bootChrome', 'boundaryValidityCalls').headroom, auditRow('bootChrome', 'boundaryValidityCalls').status], [0, 'ok']);
  assert.deepEqual([auditRow('bootChrome', 'boundaryQueries').headroom, auditRow('bootChrome', 'boundaryQueries').status], [1, 'ok'], 'lower bound headroom');
  assert.deepEqual([auditRow('timers', 'panelCalls/s').measured, auditRow('timers', 'panelCalls/s').status], [283, 'ok']);
  assert.equal(auditRow('syncAll', 'boundaryValidityCalls').status, 'missing');
  assert.deepEqual(report.boundary.preview, { boundaryValidityCalls: 9561, boundaryQueries: 0, parentReads: 2001 });
  const printed = budgets.printReport(report, null);
  assert.match(printed, /^idle\s+idle\s+201\.0\s+200\s+-1\.0\s+194\.3\s+-6\.7\s+OVER$/m);
  assert.match(printed, /^bootChrome\s+boundaryValidityCalls\s+268\s+<= 268\s+0$/m);
  assert.match(printed, /2 OVER LIMIT/);
});

test('compare flags increases (decreases for lower bounds), new, removed and over-limit entries', () => {
  const old = { counted: [{ scenario: 'a', counted: 100 }, { scenario: 'b', counted: 100 }, { scenario: 'gone', counted: 1 }],
    audit: [{ scenario: 's', metric: 'm', measured: 5, op: '>=' }, { scenario: 's', metric: 'n', measured: 5, op: '<=' }] };
  const now = { counted: [{ scenario: 'a', counted: 101.5, status: 'ok' }, { scenario: 'b', counted: 99, status: 'ok' }, { scenario: 'c', counted: 1, status: 'over' }],
    audit: [{ scenario: 's', metric: 'm', measured: 4, op: '>=', status: 'ok' }, { scenario: 's', metric: 'n', measured: null, op: '<=', status: 'missing' }] };
  const rows = Object.fromEntries(budgets.compareReports(now, old).map(row => [row.key, row]));
  assert.deepEqual([rows['counted a'].delta, rows['counted a'].flag], [1.5, 'increase']);
  assert.deepEqual([rows['counted b'].delta, rows['counted b'].flag], [-1, 'decrease']);
  assert.equal(rows['counted c'].flag, 'over');
  assert.equal(rows['counted gone'].flag, 'removed');
  assert.equal(rows['audit s.m'].flag, 'decrease below bound');
  assert.equal(rows['audit s.n'].flag, 'missing');
});

async function capture(fn) {
  const lines = [], log = console.log, error = console.error;
  console.log = (...args) => lines.push(args.join(' '));
  console.error = () => {};
  try { return { code: await fn(), out: lines.join('\n') }; } finally { console.log = log; console.error = error; }
}

test('CLI --from parses saved TAP against the real limits; --save/--compare/--json round-trip; over-limit exits 1', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-budgets-'));
  try {
    const good = path.join(dir, 'good.tap'), bad = path.join(dir, 'bad.tap'), saved = path.join(dir, 'saved.json');
    fs.writeFileSync(good, tapFor([['active', 'active', 164.3], ['idle', 'idle', 145.7]]));
    fs.writeFileSync(bad, tapFor([['active', 'active', 301], ['idle', 'idle', 150]]));
    const first = await capture(() => budgets.main(['--from', good, '--save', saved]));
    assert.equal(first.code, 0, first.out);
    assert.match(first.out, /^active\s+active\s+164\.3\s+300\s+135\.7\s+219\.3\s+55\.0$/m);
    const json = JSON.parse(fs.readFileSync(saved, 'utf8'));
    assert.equal(json.counted.find(row => row.scenario === 'active').counted, 164.3);
    const second = await capture(() => budgets.main(['--from', bad, '--compare', saved, '--json']));
    assert.equal(second.code, 1, 'over the 300 ceiling');
    const report = JSON.parse(second.out);
    const delta = key => report.compare.find(row => row.key === key);
    assert.deepEqual([delta('counted active').flag, delta('counted active').delta], ['over', 136.7]);
    assert.deepEqual([delta('counted idle').flag, delta('counted idle').delta], ['increase', 4.3]);
    assert.equal((await capture(() => budgets.main(['--project', 'nope']))).code, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('variant lanes without budget-bearing tests are reported, not treated as failures', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-variants-'));
  try {
    fs.mkdirSync(path.join(dir, 'hp_colors_rewrite_v3_qollock/tests'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'hp_colors_rewrite_v3_qollock/tests/plain.test.js'), "require('node:test')('x',()=>{});");
    const none = budgets.variantBudgetFiles('qollock', dir);
    assert.deepEqual(none.files, []);
    assert.match(none.note, /no budget-bearing tests in hp_colors_rewrite_v3_qollock\/tests \(1 suite scanned/);
    fs.writeFileSync(path.join(dir, 'hp_colors_rewrite_v3_qollock/tests/ops.test.js'), "t.diagnostic(JSON.stringify({scenario:'q',operations:h.operationCounts}));");
    assert.deepEqual(budgets.variantBudgetFiles('qollock', dir).files, ['hp_colors_rewrite_v3_qollock/tests/ops.test.js']);
    assert.match(budgets.variantBudgetFiles('showrank', dir).note, /absent/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
