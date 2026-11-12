'use strict';
// tools/logscan.js: console.log parsing, source mapping, [HPV3] summaries and the CLI exit codes.
// tests/fixtures/console-sample.log holds real console.log line formats (paths and ids replaced) in two
// game sessions; its [HPV3] lines follow the // HPV3_DEBUG statements in panorama/scripts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const scan = require('../tools/logscan');

const ROOT = path.resolve(__dirname, '..', '..');
const TOOL = path.join(__dirname, '..', 'tools', 'logscan.js');
const FIXTURE = path.join(__dirname, 'fixtures', 'console-sample.log');
const V3 = 'hp_colors_rewrite_v3';
const text = fs.readFileSync(FIXTURE, 'utf8');
const parsed = scan.parseText(text);
const report = scan.buildReport(parsed, { file: FIXTURE });
const latest = scan.buildReport(scan.parseText(text), { file: FIXTURE, sinceBoot: true });

// The line of `needle` in a lane source nearest `near` (what the mapper must report).
function sourceLine(rel, needle, near = 1) {
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split(/\r?\n/);
  const hits = lines.map((line, index) => line.includes(needle) ? index + 1 : 0).filter(Boolean);
  assert.ok(hits.length, needle + ' is in ' + rel);
  return hits.reduce((best, line) => Math.abs(line - near) < Math.abs(best - near) ? line : best, hits[0]);
}
const run = (args, opts = {}) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', cwd: ROOT, ...opts });
const errorAt = (r, file) => r.errors.find(group => group.mapped && group.mapped.file === file);

test('the parser splits sessions and reads a JS exception block whole', () => {
  assert.equal(parsed.sessions, 2);
  const blocks = parsed.entries.filter(entry => entry.kind === 'js-exception');
  assert.equal(blocks.length, 6);
  const first = blocks[0];
  assert.equal(first.source, 'panorama/scripts/hp_colors_v3_renderer.vjs_c');
  assert.equal(first.sourceLine, 153);
  assert.equal(first.column, 28);
  assert.equal(first.code, 'var reads = classReads.get(panel);');
  assert.equal(first.message, "TypeError: Cannot read properties of undefined (reading 'get')");
  assert.deepEqual(first.frames.map(frame => [frame.fn, frame.line]), [['has', 153], ['(anonymous)', 1490]]);
  assert.ok(!parsed.entries.some(entry => entry.kind === 'uncaught'), 'Uncaught inside a block is not counted twice');
  assert.equal(parsed.spans[2].to, '11/12 14:30:00');
});

test('compiled names map to lane sources', () => {
  assert.equal(scan.assetPath('panorama/scripts/hp_colors_v3_renderer.vjs_c'), 'panorama/scripts/hp_colors_v3_renderer.js');
  assert.equal(scan.assetPath('file:///panorama/scripts/hp_colors_v3_menu.js'), 'panorama/scripts/hp_colors_v3_menu.js');
  assert.equal(scan.assetPath('s2r://panorama/styles/hp_colors_v3_world.vcss_c'), 'panorama/styles/hp_colors_v3_world.css');
  assert.equal(scan.assetPath('panorama\\layout\\hud_escape_menu.xml'), 'panorama/layout/hud_escape_menu.xml');
  assert.equal(scan.assetPath('file://{resources}/layout/citadel_hud_top_bar.xml'), 'panorama/layout/citadel_hud_top_bar.xml');
  assert.equal(scan.assetPath('CitadelHudEscapeMenu_EscapeMenu_oncancel'), null);
  const mapper = scan.createMapper();
  const layout = mapper.file('panorama/layout/hud_escape_menu.vxml_c');
  assert.equal(layout.file, V3 + '/panorama/layout/hud_escape_menu.xml');
  assert.deepEqual(layout.alsoIn, ['qollock', 'showrank', 'showrank-barebones']);
  assert.equal(scan.createMapper({ prefer: 'qollock' }).file('panorama/layout/hud_escape_menu.vxml_c').file, 'hp_colors_rewrite_v3_qollock/panorama/layout/hud_escape_menu.xml');
  assert.equal(mapper.file('panorama/styles/hud_timer.vcss_c'), null, 'other mods are not lane files');
});

test('errors are grouped, counted and mapped to the source line', () => {
  const renderer = errorAt(report, V3 + '/panorama/scripts/hp_colors_v3_renderer.js');
  assert.equal(renderer.count, 2, 'the repeated exception is one group');
  assert.equal(renderer.mapped.line, sourceLine(V3 + '/panorama/scripts/hp_colors_v3_renderer.js', 'var reads = classReads.get(panel);', 153));
  const menu = errorAt(report, V3 + '/panorama/scripts/hp_colors_v3_menu.js');
  assert.equal(menu.mapped.line, sourceLine(V3 + '/panorama/scripts/hp_colors_v3_menu.js', 'function panel(id) { var found = panels[id];', 114));
  assert.match(menu.message, /ReferenceError: panels is not defined/);
  const handler = errorAt(report, V3 + '/panorama/layout/hud_escape_menu.xml');
  assert.equal(handler.kind, 'js-exception');
  assert.equal(handler.mapped.line, sourceLine(V3 + '/panorama/layout/hud_escape_menu.xml', 'oncancel="if (!$.HPColorsMenuCancel())'));
  const css = report.errors.filter(group => group.kind === 'parse-error' && group.mapped && group.mapped.file === V3 + '/panorama/styles/hp_colors_v3_menu.css');
  assert.deepEqual(css.map(group => group.mapped.line).sort((a, b) => a - b),
    [sourceLine(V3 + '/panorama/styles/hp_colors_v3_menu.css', '.HPC3FoldChevron'), sourceLine(V3 + '/panorama/styles/hp_colors_v3_menu.css', '.HPC3RowBg')].sort((a, b) => a - b));
  const include = report.errors.find(group => group.kind === 'parse-error' && /Failed to add include/.test(group.message));
  assert.equal(include.mapped.file, V3 + '/panorama/layout/unit_status_overlay_v2.xml');
  assert.equal(include.mapped.line, sourceLine(V3 + '/panorama/layout/unit_status_overlay_v2.xml', 'hp_colors_v3_world.vcss_c'));
  const fatal = report.errors.find(group => group.kind === 'fatal');
  assert.equal(fatal.mapped.file, V3 + '/panorama/layout/unit_status_overlay_v2.xml');
  assert.equal(report.errorCount, 12);
});

test('warnings on lane files are listed; stock and other-mod warnings are only counted', () => {
  assert.equal(report.ownWarnings.length, 3);
  assert.equal(report.ownWarnings[0].mapped.file, V3 + '/panorama/styles/hp_colors_v3_world.css');
  assert.equal(report.ownWarnings[0].mapped.line, sourceLine(V3 + '/panorama/styles/hp_colors_v3_world.css', 'overflow: noclip'));
  // A layout warning naming only a panel id belongs to the lane layout that declares the id.
  assert.equal(report.ownWarnings[1].mapped.file, V3 + '/panorama/layout/hud_escape_menu.xml');
  assert.equal(report.ownWarnings[1].mapped.line, sourceLine(V3 + '/panorama/layout/hud_escape_menu.xml', 'id="HPColorsConditionNumber"'));
  assert.equal(report.foreignWarnings, 6);
});

test('--since-boot keeps only the latest game session', () => {
  assert.equal(latest.errorCount, 11, 'the first session\'s parsing error is dropped');
  assert.ok(!latest.errors.some(group => /HPC3RowBg/.test(group.message)));
  assert.equal(latest.window.from, '11/12 14:00:01');
  assert.deepEqual(latest.game.versions, [6861]);
  assert.deepEqual(report.game.versions, [6860, 6861]);
});

test('game version, source revision and mounted addon paks are read', () => {
  assert.equal(latest.game.version, 6861);
  assert.deepEqual(latest.game.revisions, ['11219368']);
  assert.deepEqual(latest.paks.mounted, ['pak02', 'pak89']);
  assert.equal(latest.paks.pak02, null, 'no addons folder beside a fixture');
});

test('[HPV3] lines: boot/lifecycle sequence, save/store events and timing statistics', () => {
  const h = latest.hpv3;
  assert.equal(h.lines, 18);
  assert.deepEqual(h.sequence.map(item => item.message), ['menu boot 3.4.0', 'lifecycle start epoch 1', 'hero Abrams', 'renderer boot 3.4.0']);
  assert.equal(h.sequence[2].count, 2);
  assert.equal(h.store.count, 7);
  assert.equal(h.store.kinds['save Saved'], 2);
  assert.deepEqual(h.problems.map(group => group.message), ['store commit failed: timeout']);
  assert.equal(h.diagnostics['renderer carrier'], 1);
  const t = h.timing;
  assert.equal(t.renderer.windows, 3);
  assert.deepEqual([t.renderer.ms.min, t.renderer.ms.avg, t.renderer.ms.max], [3, 11, 18]);
  assert.deepEqual([t.renderer.msPerTick.min, t.renderer.msPerTick.max], [0.05, 0.12]);
  assert.deepEqual(t.renderer.states, { active: 2, idle: 1 });
  assert.equal(t.stamina.lines, 2);
  assert.equal(t.stamina.ms.avg, 6);
  assert.deepEqual(t.stamina.sides, ['ally', 'enemy']);
  assert.equal(scan.hpv3Category('save Saved'), 'store');
  assert.equal(scan.hpv3Category('route applied abrams'), 'lifecycle');
  assert.equal(scan.hpv3Category('size geo world'), 'diagnostic');
});

test('engine formats from panorama.dll: (line,col) locations, bare selector failures, JS Exception!! and JS(...) forms, channels', () => {
  const ofKind = kind => parsed.entries.filter(entry => entry.kind === kind);
  const lineCol = ofKind('parse-warning').find(entry => entry.column != null);
  assert.deepEqual([lineCol.source, lineCol.sourceLine, lineCol.column, lineCol.channel], ['panorama\\layout\\hud_escape_menu.xml', 19, 5, 'Panorama']);
  const bare = ofKind('parse-error').find(entry => entry.message === 'Failed to parse selector');
  assert.deepEqual([bare.source, bare.sourceLine, bare.column], ['panorama\\styles\\hp_colors_v3_world.css', 12, 1], 'no trailing text required');
  assert.equal(scan.cssNeedle('Failed to parse selector'), null);
  assert.equal(scan.cssNeedle('Selector exceeds temp buffer size: .A .B'), '.A .B');
  assert.ok(scan.cssNeedle('Found unsupported CSS at-rule: media').test('@media (x) {'));
  const bareGroup = report.errors.find(group => group.message === 'Failed to parse selector');
  assert.deepEqual([bareGroup.mapped.file, bareGroup.mapped.line, bareGroup.mapped.how], [V3 + '/panorama/styles/hp_colors_v3_world.css', 12, 'reported']);
  const lineColGroup = report.ownWarnings.find(group => /HPC3NoSuchAnimation/.test(group.message));
  assert.deepEqual([lineColGroup.mapped.file, lineColGroup.mapped.line], [V3 + '/panorama/layout/hud_escape_menu.xml', 19], '(line,col) keeps the line');
  const buffer = report.errors.find(group => /^Selector exceeds temp buffer size/.test(group.message));
  assert.equal(buffer.kind, 'panorama-error');
  assert.deepEqual([buffer.mapped.file, buffer.mapped.line], [V3 + '/panorama/styles/hp_colors_v3_menu.css', sourceLine(V3 + '/panorama/styles/hp_colors_v3_menu.css', '.HPC3SearchField')]);
  const blocks = ofKind('js-exception');
  const undef = blocks.find(entry => /reading 'IsValid'/.test(entry.message));
  assert.equal(undef.message, "TypeError: Cannot read properties of null (reading 'IsValid')", 'JS Exception!! reports its message');
  assert.equal(undef.source, null);
  const paren = blocks.find(entry => entry.message === 'TypeError: classReads is undefined');
  assert.deepEqual([paren.source, paren.sourceLine, paren.column, paren.code, paren.time], ['panorama/scripts/hp_colors_v3_renderer.vjs_c', 153, 28, 'var reads = classReads.get(panel);', '11/12 14:00:52']);
  const parenGroup = report.errors.find(group => group.message === 'TypeError: classReads is undefined');
  assert.equal(parenGroup.mapped.file, V3 + '/panorama/scripts/hp_colors_v3_renderer.js');
  const vscript = ofKind('vscript-error');
  assert.deepEqual(vscript.map(entry => [entry.channel, entry.message]), [['VScript', 'Script error: attempt to index a nil value']]);
  assert.equal(report.vscript.length, 1, 'listed apart, not a console error');
  assert.ok(ofKind('hpv3').every(entry => entry.channel === 'PanoramaScript'));
  // PanoramaScript lines from other mods that say "failed" are not engine errors.
  const other = scan.parseText('11/12 10:00:00 [PanoramaScript] [DLF] amber logo failed to load; showing the team emblem\n');
  assert.deepEqual(other.entries.filter(entry => entry.kind !== 'session'), []);
  const bareLine = scan.parseText('11/12 10:00:00 [Panorama] ***** Parsing error on panorama\\styles\\x.css:\n');
  assert.equal(bareLine.entries[1].message, 'Parsing error', 'a location-only parse line still counts');
});

test('stylesheet needles find the selector or declaration a compiled sheet reports on line 1', () => {
  assert.equal(scan.cssNeedle('Error parsing style selector: .A .B, .C'), '.A .B');
  assert.ok(scan.cssNeedle("Invalid value for property 'overflow': noclip").test('\toverflow: noclip;'));
  assert.ok(!scan.cssNeedle("Invalid value for property 'overflow': noclip").test('\toverflow: hidden;'));
  assert.ok(scan.cssNeedle('Invalid property name: hittest').test('  hittest: false;'));
});

test('console.log discovery: --file, else discoverDeadlock (flag, env, Steam libraries) and the log beside steam.inf', () => {
  const W = path.win32;
  const steam = 'X:\\steam', library = 'Y:\\Lib';
  const citadel = W.join(library, 'steamapps', 'common', 'Deadlock', 'game', 'citadel');
  const files = new Map([
    [W.join(steam, 'steamapps', 'libraryfolders.vdf'), '"libraryfolders" { "0" { "path" "' + library.replace(/\\/g, '\\\\') + '" } }'],
    [W.join(library, 'steamapps', 'appmanifest_1422450.acf'), '"AppState" { "installdir" "Deadlock" }'],
    [W.join(citadel, 'steam.inf'), 'ClientVersion=6861'],
    [W.join(citadel, 'console.log'), ''],
  ]);
  const has = file => [...files.keys()].some(key => key.toLowerCase() === String(file).toLowerCase());
  const deps = {
    fs: { existsSync: has, readFileSync: file => { if (!has(file)) throw new Error('ENOENT'); return files.get([...files.keys()].find(key => key.toLowerCase() === file.toLowerCase())); } },
    platform: 'win32', env: {},
    spawnSync: (_cmd, args) => args[1].startsWith('HKCU') ? { status: 0, stdout: '\n    SteamPath    REG_SZ    ' + steam + '\n' } : { status: 1, stdout: '' },
  };
  if (process.platform !== 'win32') return; // console.log paths use the native path module
  const found = scan.findConsoleLog({}, deps);
  assert.equal(found.file, path.resolve(W.join(citadel, 'console.log')));
  assert.match(found.how, /Steam library/);
  const env = scan.findConsoleLog({}, { ...deps, env: { HPV3_STEAM_INF: W.join(citadel, 'steam.inf') } });
  assert.equal(env.how, 'HPV3_STEAM_INF');
  const pinned = scan.findConsoleLog({ steamInf: 'Z:\\Deadlock\\game\\citadel\\steam.inf' }, deps);
  assert.equal(pinned.file, null, 'an explicit install is not replaced by discovery');
  assert.deepEqual(pinned.tried, ['Z:\\Deadlock\\game\\citadel\\console.log']);
  files.set(FIXTURE, '');
  assert.equal(scan.findConsoleLog({ file: FIXTURE }, deps).file, FIXTURE);
});

test('installed pak02: matched read-only against every project\'s built paks, else unknown build', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-pak02-'));
  try {
    const put = (rel, bytes) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), bytes); };
    put('hp_colors_rewrite_v3/.build/release/pak02_dir.vpk', 'v3-release');
    put('hp_colors_rewrite_v3_qollock/.build/debug/pak02_dir.vpk', 'qol-debug!');
    put('game/addons/pak02_dir.vpk', 'qol-debug!');
    const addons = path.join(root, 'game', 'addons');
    const hit = scan.identifyPak02(addons, { root });
    assert.deepEqual([hit.match.project, hit.match.mode, hit.match.file], ['qollock', 'debug', 'hp_colors_rewrite_v3_qollock/.build/debug/pak02_dir.vpk']);
    assert.match(scan.describePak02(hit), /^installed pak02: [0-9a-f]{8} = qollock debug build/);
    assert.equal(fs.readFileSync(path.join(addons, 'pak02_dir.vpk'), 'utf8'), 'qol-debug!', 'the installed pak is only read');
    put('game/addons/pak02_dir.vpk', 'other');
    assert.match(scan.describePak02(scan.identifyPak02(addons, { root })), /= unknown build \(matches none of 2 built pak02 files\)/);
    assert.match(scan.describePak02(scan.identifyPak02(path.join(root, 'none'), { root })), /installed pak02: none/);
    assert.equal(scan.describePak02(null), 'installed pak02: no Deadlock install found');
    // A report built with the install's addons prefers the matched project's sources.
    put('game/addons/pak02_dir.vpk', 'qol-debug!');
    assert.equal(scan.buildReport(parsed, { file: FIXTURE, addons, root }).paks.pak02.match.project, 'qollock');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('CLI: --file reports mapped errors and exits 1; --only hpv3 and a clean log exit 0', () => {
  const r = run(['--file', FIXTURE]);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /ERRORS: 12 lines in 11 groups/);
  assert.match(r.stdout, /2x JS exception\s+hp_colors_rewrite_v3\/panorama\/scripts\/hp_colors_v3_renderer\.js:\d+/);
  assert.match(r.stdout, /compiled: panorama\/scripts\/hp_colors_v3_renderer\.vjs_c line 153:28/);
  assert.match(r.stdout, /renderer timing: 3 windows/);
  assert.match(r.stdout, /result: 11 error groups -> exit 1/);
  assert.equal(run(['--file', FIXTURE, '--only', 'hpv3']).status, 0);
  const json = run(['--file', FIXTURE, '--json', '--since-boot']);
  assert.equal(JSON.parse(json.stdout).errorCount, 11);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-logscan-'));
  try {
    const clean = path.join(dir, 'console.log');
    fs.writeFileSync(clean, text.split('\n').filter(line => !/JS Exception|Parsing error|FATAL|Selector exceeds|^[^0-9]/.test(line)).join('\n'));
    const ok = run(['--file', clean]);
    assert.equal(ok.status, 0, ok.stdout);
    assert.match(ok.stdout, /result: console clean/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('CLI: --help, usage errors and a missing log', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--since-boot/);
  assert.match(help.stdout, /-condebug/);
  assert.equal(run(['--only', 'everything']).status, 2);
  assert.equal(run(['--follow', '--json']).status, 2);
  const missing = run(['--file', path.join(os.tmpdir(), 'no-such-dir-hpv3', 'console.log')]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /no console\.log found/);
});

test('--follow prints errors and [HPV3] lines appended after the summary', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-follow-'));
  const log = path.join(dir, 'console.log');
  fs.writeFileSync(log, '\ufeff11/12 14:00:01 [RenderSystem] start\n');
  const child = spawn(process.execPath, [TOOL, '--follow', '--file', log], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => { out += chunk; });
  const until = async (pattern, ms = 8000) => {
    const end = Date.now() + ms;
    while (!pattern.test(out) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 50));
    assert.match(out, pattern);
  };
  try {
    await until(/following /);
    fs.appendFileSync(log, '11/12 14:00:02 [PanoramaScript] [HPV3] save Saved\n11/12 14:00:03 [PanoramaScript] JS Exception! *** Skipping rest of script *** \n\n' +
      'panorama/scripts/hp_colors_v3_menu.vjs_c\nline:114, col:42\n\n>>   function panel(id) { var found = panels[id]; return valid(found) ? found : null; }\n\nUncaught ReferenceError: panels is not defined\n');
    await until(/\[HPV3\] save Saved/);
    await until(/JS exception hp_colors_rewrite_v3\/panorama\/scripts\/hp_colors_v3_menu\.js:\d+ ReferenceError: panels is not defined/);
  } finally {
    child.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
