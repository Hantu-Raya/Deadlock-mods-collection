'use strict';
// Engine facts (tools/lib/engine-facts.json): the stylesheet engine checks, the engine-facts CLI and the
// strict Panorama test adapter.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const facts = require('../tools/lib/engine-facts.json');
const { checkStylesheets, engineFindings } = require('../tools/lib/stylesheets');
const cli = require('../tools/engine-facts');
const adapter = require('../../scripts/hp-colors-panorama-test-adapter.js');

const TOOL = path.join(__dirname, '..', 'tools', 'engine-facts.js');
function sheetDir(t, css) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-facts-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'a.css'), css);
  return dir;
}

test('facts file: provenance and the confirmed sets', () => {
  assert.equal(facts.build.clientVersion, 6861);
  assert.equal(facts.css.properties.values.length, 140);
  assert.equal(facts.css.properties.status, 'CONFIRMED');
  for (const name of ['wash-color', 'pre-transform-scale2d', 'opacity-mask', '-s2-mix-blend-mode', 'x', 'y', 'z']) assert.ok(facts.css.properties.values.includes(name), name);
  assert.deepEqual(facts.css.atRules.values, ['define', 'keyframes', 'import']);
  assert.deepEqual(facts.css.combinators.rejected, ['+', '~']);
  assert.equal(facts.css.limits.selectorListBytes, 2047);
  assert.equal(facts.css.limits.selectorChars, 256);
  assert.equal(facts.js.dollar.values.length, 28);
  for (const name of ['DispatchEvent', 'Schedule', 'RegisterForUnhandledEvent']) assert.ok(facts.js.dollar.values.includes(name), name);
  assert.ok(!facts.js.dollar.values.includes('UnregisterEventHandler'));
  for (const name of ['AddClass', 'SetHasClass', 'FindChildTraverse', 'SetPanelEvent', 'actuallayoutwidth']) assert.ok(facts.js.panel.values.includes(name), name);
  assert.equal(facts.js.events.values.UIShowTextTooltip, 1);
  assert.equal(facts.js.events.values.ClientUI_FireOutput, 1);
});

test('stylesheets: engine limits (2,047-byte list, 256-char selector) name sheet, line and rule', t => {
  const longOne = '.' + 'A'.repeat(300);
  let error = assert.throws(() => checkStylesheets(sheetDir(t, '/* c */\n' + longOne + ' { opacity: 1; }\n')), /a\.css:2: .*rule `\.AAA.*selector of 302 characters \(engine max 256/);
  // Under the project ceiling of 10 selectors but over 2,047 bytes once comments count (conservative).
  const parts = Array.from({ length: 9 }, (_, i) => '.S' + i + ' /*' + 'c'.repeat(240) + '*/');
  error = engineFindings('b.css', parts.join(',\n') + ' { opacity: 1; }\n');
  assert.match(error.errors.join('\n'), /b\.css:1: rule `.* selector list is \d{4} bytes \(engine max 2047/);
  assert.equal(engineFindings('ok.css', Array.from({ length: 8 }, (_, i) => '.S' + i).join(', ') + ' { opacity: 1; }').errors.length, 0);
});

test('stylesheets: project ceiling keeps its old wording, labelled as a project rule', t => {
  const wide = Array.from({ length: 11 }, (_, i) => '#a' + i).join(', ');
  assert.throws(() => checkStylesheets(sheetDir(t, wide + ' { opacity: 1; }\n')),
    /PROJECT ceiling .*no selector-count limit.*rule has 11 selectors \(max 10; live 6782 fails to parse long selector lists\)/);
});

test('stylesheets: unknown properties, at-rules and +/~ combinators fail; unknown pseudo-classes warn', t => {
  assert.match(engineFindings('v.css', '.A { opacity: ' + '1'.repeat(4096) + '; }').errors.join('\n'), /opacity value is 4096 bytes \(engine max 4095\)/);
  assert.match(engineFindings('d.css', '@define big: ' + 'x'.repeat(1100) + ';\n').errors.join('\n'), /@define text is \d+ bytes \(engine max 1023\)/);
  assert.throws(() => checkStylesheets(sheetDir(t, '.A\n{\n\topacity: 1;\n\tdisplay: none;\n}\n')), /a\.css:4: unknown property display/);
  assert.throws(() => checkStylesheets(sheetDir(t, '@media screen { .A { opacity: 1; } }\n')), /a\.css:1: unsupported at-rule @media/);
  assert.throws(() => checkStylesheets(sheetDir(t, '.A + .B { opacity: 1; }\n')), /rule `\.A \+ \.B` uses the \+ combinator/);
  assert.throws(() => checkStylesheets(sheetDir(t, '.A ~ .B { opacity: 1; }\n')), /uses the ~ combinator/);
  const ok = checkStylesheets(sheetDir(t, '@define c: #fff;\n.A > .B:hover:not(.C), .D:nth-child(2n+1) { background-image: url("file://{images}/x.png"); }\n' +
    '@keyframes \'k\' { 0% { pre-transform-scale2d: 1; } 100% { opacity: 1; } }\n.E:weird { opacity: 1; }\n'));
  assert.equal(ok.warnings.length, 1);
  assert.match(ok.warnings[0], /pseudo-class :weird .*not determined/);
});

test('engine-facts CLI: --check passes on the three projects; findings in a fake project fail', () => {
  const result = spawnSync(process.execPath, [TOOL, '--check', '--project', 'all'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /engine facts \(Deadlock 6861\): v3, qollock, showrank: \d+ scripts, 4 stylesheets, 0 error/);
  const known = cli.loadFacts();
  const findings = cli.scanScript([
    '$.Msg("x"); $.HPColorsV3Codec.Encode(1); $.Bogus(1);',
    'panel.AddClass("a"); panel.FakeMethod(); panel.style.washColor = "#fff"; panel.style.outlineColor = "red";',
    '$.DispatchEvent("UIHideTextTooltip", panel); $.DispatchEvent("NoSuchEvent"); $.DispatchEventAsync(0.1, "AlsoMissing");',
    'var o = { Helper: function () {} }; o.Helper();',
  ].join('\n'), known).map(f => f.kind + ' ' + f.name);
  assert.deepEqual(findings.sort(), ['$ function Bogus', 'event AlsoMissing', 'event NoSuchEvent', 'panel method FakeMethod', 'style key outlineColor']);
  assert.throws(() => cli.parseArgs(['--check', '--project', 'nope']), /Unknown project/);
  assert.throws(() => cli.parseArgs(['--refresh']), /--from/);
});

test('engine-facts CLI: --refresh is read-only and explains the Python extractor', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-game-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'game', 'citadel'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'game', 'citadel', 'steam.inf'), 'ClientVersion=6999\n');
  const result = spawnSync(process.execPath, [TOOL, '--refresh', '--from', dir], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /Installed ClientVersion: 6999/);
  assert.match(result.stdout, /hp_colors_rewrite_v3\/tools\/research\/extract\.py/);
  assert.doesNotMatch(result.stdout, /\.scratch/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'tools', 'research', 'extract.py')) && fs.existsSync(path.join(__dirname, '..', 'tools', 'research', 'dllx.py')), 'the helper scripts the help names are tracked');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'game', 'citadel')), ['steam.inf']);
});

test('strict adapter: refuses $ functions, panel methods and events the engine lacks', { skip: !adapter.ADAPTER_STRICT && 'strict adapter mode is off (HPV3_ADAPTER_STRICT=0); the adapter does not refuse unknown engine API' }, () => {
  const h = adapter.createPanoramaHarness();
  assert.equal(h.$.DispatchEvent('UIHideTextTooltip', h.root), true);
  assert.throws(() => h.$.DispatchEvent('NoSuchEvent'), /strict\): event "NoSuchEvent" is not registered/);
  assert.throws(() => h.$.DispatchEventAsync(0, 'NoSuchEvent'), /event "NoSuchEvent"/);
  if (adapter.ADAPTER_STRICT_FULL) assert.throws(() => h.$.RegisterForUnhandledEvent('NoSuchEvent', () => {}), /event "NoSuchEvent"/);
  h.$.BuildUI = () => {};
  h.root.HPV2OnWake = () => {};
  h.$.HPColorsV3Example = () => 1; // mods publish $ members; not an engine fake
  const panel = new adapter.MockPanel('Panel', h.root, 'P');
  panel.ScrollToTop = () => {};
  adapter.assertEngineApi(h.root);
  panel.InventedMethod = () => {};
  assert.throws(() => adapter.assertEngineApi(h.root), /panel method "InventedMethod"/);
  assert.equal(h.GameUI.GetCursorPosition, undefined);
  assert.equal(h.GameUI.SetMouseCallback, undefined);
  assert.equal(typeof h.GameUI.CustomUIConfig, 'function');
});
