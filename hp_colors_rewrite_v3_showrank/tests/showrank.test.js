'use strict';
// ShowRank barebones pak02 variant (SPEC story 52): v3's generated Escape menu and topbar plus the ShowRank
// pieces, composed by tools/showrank.js. ShowRank's runtime stays in pak89; here it is absent or stubbed.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const showrank = require('../tools/showrank');
const v3Tests = path.resolve(__dirname, '../../hp_colors_rewrite_v3/tests');
const { loadLayout, parseLayout, runInVm, sourceRoot, latestPublishedConfig } = require(path.join(v3Tests, 'boot-layout'));
const { setup } = require(path.join(v3Tests, 'timers-fixture'));

const { OUTPUTS, SCRIPT, PIECES, ROOT, V3_ROOT, SHOWRANK_ROOT } = showrank;
// HPV3_SHOWRANK_SOURCE_ROOT selects the staged lane tree (the composed layouts) in builds.
const laneRoot = path.resolve(process.env.HPV3_SHOWRANK_SOURCE_ROOT || ROOT);
const { lf, countOf: count } = require(path.join(V3_ROOT, 'tools/lib/layout-compose'));
const readFrom = (root, relative) => lf(fs.readFileSync(path.join(root, relative), 'utf8'));
const v3 = () => ({ menu: readFrom(V3_ROOT, OUTPUTS.menu), topbar: readFrom(V3_ROOT, OUTPUTS.topbar) });
const sr = () => ({ menu: readFrom(SHOWRANK_ROOT, 'panorama/layout/hud_escape_menu.xml'), topbar: readFrom(SHOWRANK_ROOT, 'panorama/layout/citadel_hud_top_bar.xml') });
const composed = () => ({ menu: readFrom(ROOT, OUTPUTS.menu), topbar: readFrom(ROOT, OUTPUTS.topbar) });
const refs = text => [...text.matchAll(/\s(?:src|id)="([^"]+)"/g)].map(match => match[1]);
const rootAttrs = (text, tag) => { const node = parseLayout('<root>' + text.match(new RegExp('<' + tag + '\\b[^>]*>'))[0] + '</' + tag + '></root>'); return node.children[0].attrs; };
const once = (text, from, to) => { assert.equal(count(text, from), 1, from); return text.replace(from, () => to); };
const SHOWRANK_IDS = ['ShowRankBarebonesPartyBridge', 'ShowRankBarebonesNotificationRoot', 'ShowRankBarebonesTeamAverageLayer', 'ShowRankBarebonesAverageFriendlyImage', 'ShowRankBarebonesAverageEnemyImage'];

test('compose is deterministic, the written layouts are current and --check passes on fresh output', () => {
  const a = showrank.compose(v3(), sr()), b = showrank.compose(v3(), sr());
  assert.deepEqual(a, b);
  for (const relative of Object.values(OUTPUTS)) assert.equal(readFrom(ROOT, relative), a[relative], relative + ' is the fresh composition');
  assert.equal(showrank.layouts()[OUTPUTS.menu], a[OUTPUTS.menu]);
  assert.equal(showrank.writeOrCheck(true), 2);
  const run = spawnSync(process.execPath, [path.join(ROOT, 'tools/showrank.js'), '--check'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});

// A private copy of the three inputs so staleness can be provoked without touching the real lane.
function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-showrank-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const layout = 'panorama/layout';
const copy = (from, to, files) => { for (const file of files) { fs.mkdirSync(path.join(dir, to, layout), { recursive: true }); fs.copyFileSync(path.join(from, layout, file), path.join(dir, to, layout, file)); } };
  const files = ['hud_escape_menu.xml', 'citadel_hud_top_bar.xml'];
  copy(SHOWRANK_ROOT, 'showrank_barebones', files);
  // The composer requires the v3 tool kit and, to check v3's committed outputs for freshness, everything v3's generator reads.
  for (const input of ['tools', 'settings', 'generated', 'vendor', 'panorama', 'game-data-pin.json'])
    fs.cpSync(path.join(V3_ROOT, input), path.join(dir, 'hp_colors_rewrite_v3', input), { recursive: true });
  fs.mkdirSync(path.join(dir, 'hp_colors_rewrite_v3_showrank/tools'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'tools/showrank.js'), path.join(dir, 'hp_colors_rewrite_v3_showrank/tools/showrank.js'));
  const cli = path.join(dir, 'hp_colors_rewrite_v3_showrank/tools/showrank.js');
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  return { dir, lane: path.join(dir, 'hp_colors_rewrite_v3_showrank'), v3: path.join(dir, 'hp_colors_rewrite_v3'), showrank: path.join(dir, 'showrank_barebones'), run };
}

test('--check exits 1 naming the stale file when the outputs, v3 or ShowRank sources change', t => {
  const s = scratch(t);
  assert.equal(s.run().status, 0);
  assert.equal(s.run('--check').status, 0, 'fresh output passes');
  const menu = path.join(s.lane, OUTPUTS.menu), topbar = path.join(s.lane, OUTPUTS.topbar);
  const original = fs.readFileSync(menu, 'utf8');
  fs.appendFileSync(menu, '<!-- hand edit -->\n');
  let run = s.run('--check');
  assert.equal(run.status, 1); assert.match(run.stderr, /Stale ShowRank layouts: panorama\/layout\/hud_escape_menu\.xml/); assert.ok(!/citadel_hud_top_bar/.test(run.stderr));
  fs.writeFileSync(menu, original);
  fs.rmSync(topbar);
  run = s.run('--check');
  assert.equal(run.status, 1); assert.match(run.stderr, /citadel_hud_top_bar\.xml/);
  assert.equal(s.run().status, 0); assert.equal(s.run('--check').status, 0);
  // v3 menu change leaves the composed layout stale.
  const v3Topbar = path.join(s.v3, OUTPUTS.topbar);
  fs.writeFileSync(v3Topbar, once(fs.readFileSync(v3Topbar, 'utf8'), 'class="HPColorsV3TimersTopBar"', 'class="HPColorsV3TimersTopBar Changed"'));
  run = s.run('--check');
  assert.equal(run.status, 1); assert.match(run.stderr, /generated outputs are stale \(panorama\/layout\/citadel_hud_top_bar\.xml\)/);
  assert.equal(s.run().status, 0);
  fs.copyFileSync(path.join(V3_ROOT, OUTPUTS.topbar), v3Topbar);
  assert.equal(s.run().status, 0);
  // A ShowRank layout change (bridge size) likewise.
  const bridge = path.join(s.showrank, 'panorama/layout/hud_escape_menu.xml');
  fs.writeFileSync(bridge, once(fs.readFileSync(bridge, 'utf8'), 'width: 260px', 'width: 300px'));
  run = s.run('--check');
  assert.equal(run.status, 1); assert.match(run.stderr, /hud_escape_menu\.xml/);
});

test('every v3 node, include, id and attribute survives; only the v3 root handlers are rewritten', () => {
  const base = v3(), out = composed();
  for (const key of ['menu', 'topbar']) {
    const have = new Set(refs(out[key]));
    for (const ref of refs(base[key])) assert.ok(have.has(ref), key + ' ' + ref);
  }
  const strip = text => walkNodes(text).filter(node => !isShowRank(node));
  for (const key of ['menu', 'topbar']) {
    const want = walkNodes(base[key]), have = strip(out[key]);
    assert.equal(have.length, want.length, key + ' node count');
    have.forEach((node, i) => {
      const expected = { ...want[i], attrs: { ...want[i].attrs } };
      if (node.tag === 'CitadelHudEscapeMenu') for (const name of PIECES.handlers) { delete node.attrs[name]; delete expected.attrs[name]; }
      assert.deepEqual({ tag: node.tag, depth: node.depth, attrs: node.attrs }, { tag: expected.tag, depth: expected.depth, attrs: expected.attrs }, key + ' node ' + i);
    });
  }
  const root = rootAttrs(out.menu, 'CitadelHudEscapeMenu'), v3Root = rootAttrs(base.menu, 'CitadelHudEscapeMenu');
  assert.equal(root.oncancel, v3Root.oncancel, 'cancel-before-resume stays intact');
  assert.equal(rootAttrs(out.topbar, 'CitadelHudTopBar').class, 'HPColorsV3TimersTopBar');
  assert.deepEqual(out.menu.match(/hp_colors_v3_\w+\.vjs_c/g), base.menu.match(/hp_colors_v3_\w+\.vjs_c/g), 'v3 scripts keep their order');
  assert.deepEqual(out.topbar.match(/hp_colors_v3_\w+\.vjs_c/g), base.topbar.match(/hp_colors_v3_\w+\.vjs_c/g));
  const menuScripts = out.menu.match(/src="s2r:\/\/panorama\/scripts\/[^"]+"/g);
  assert.equal(menuScripts.at(-1), 'src="' + SCRIPT + '"', 'ShowRank script loads after the v3 scripts');
});
function walkNodes(text) {
  const list = [], open = [];
  for (const match of text.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<([^>]+)>/g)) {
    const token = match[1];
    if (token.startsWith('?')) continue;
    if (token.startsWith('/')) { open.pop(); continue; }
    const attrs = {};
    for (const attr of token.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[attr[1]] = attr[2];
    list.push({ tag: token.match(/^\S+/)[0].replace(/\/$/, ''), depth: open.length, attrs });
    if (!token.endsWith('/')) open.push(list.length - 1);
  }
  return list;
}
function isShowRank(node) {
  const id = node.attrs.id || '', src = node.attrs.src || '';
  return id.startsWith('ShowRankBarebones') || /showrank_barebones|citadel_hud_game_announcements/.test(src);
}

test('every ShowRank piece appears exactly once, ids are unique and handler order is v3 then ShowRank', () => {
  const out = composed(), source = sr();
  for (const id of ['ShowRankBarebonesPartyBridge']) assert.equal(count(out.menu, 'id="' + id + '"'), 1, id);
  for (const id of SHOWRANK_IDS.slice(1)) assert.equal(count(out.topbar, 'id="' + id + '"'), 1, id);
  assert.equal(count(out.menu, SCRIPT), 1);
  assert.equal(count(out.topbar, 'showrank_barebones_topbar.vcss_c'), 1);
  assert.equal(count(out.topbar, 'citadel_hud_game_announcements.vcss_c'), 1);
  for (const key of ['menu', 'topbar']) {
    const ids = refs(out[key]).filter(ref => !ref.startsWith('s2r:'));
    assert.equal(ids.length, new Set(ids).size, key + ' ids unique');
  }
  // The injected blocks are ShowRank's own bytes.
  for (const line of source.menu.match(/^\t\t<CitadelHTMLPanel id="ShowRankBarebonesPartyBridge"[^\n]*\n/m)) assert.ok(out.menu.includes(line));
  const average = source.topbar.slice(source.topbar.indexOf('\t\t<Panel id="ShowRankBarebonesTeamAverageLayer"'), source.topbar.indexOf(PIECES.averageAnchor));
  assert.ok(out.topbar.includes(average));
  // Same structural spots as ShowRank: before GradientBacker, before StretBrawlContainer, last Escape child.
  assert.ok(out.topbar.indexOf('ShowRankBarebonesNotificationRoot') < out.topbar.indexOf('id="GradientBacker"'));
  assert.ok(out.topbar.indexOf('id="ShowRankBarebonesTeamAverageLayer"') < out.topbar.indexOf('id="StretBrawlContainer"'));
  assert.ok(out.topbar.indexOf('id="TeamScoreEnemy"') < out.topbar.indexOf('id="ShowRankBarebonesTeamAverageLayer"'));
  assert.ok(out.menu.includes(PIECES.bridgeId + '" visible="false" hittest="false" acceptsfocus="false" style="width: 260px; height: 30px;" />\n\t</CitadelHudEscapeMenu>'));
  const root = rootAttrs(out.menu, 'CitadelHudEscapeMenu'), base = rootAttrs(v3().menu, 'CitadelHudEscapeMenu');
  const srRoot = rootAttrs(source.menu, 'CitadelHudEscapeMenu');
  assert.equal(root.onload, base.onload + '; ' + srRoot.onload, 'v3 boot first, ShowRank guarded call after');
  assert.ok(root.onload.indexOf('HPColorsMenuBoot') < root.onload.indexOf('ShowRankBarebonesEscapeOpen'));
  // v3 sets no hover handlers today, so ShowRank's guarded calls stand alone.
  assert.equal(base.onmouseover, undefined); assert.equal(base.onmouseout, undefined);
  assert.equal(root.onmouseover, srRoot.onmouseover); assert.equal(root.onmouseout, srRoot.onmouseout);
  assert.equal(showrank.chain(null, 'b()'), 'b()');
  assert.equal(showrank.chain('a()', 'b()'), 'a(); b()');
  assert.equal(showrank.chain('if (x) y();', 'b()'), 'if (x) y(); b()');
});

test('a v3 hover handler is chained ahead of ShowRank\'s', () => {
  const base = v3(), hooked = { ...base, menu: once(base.menu, '<CitadelHudEscapeMenu ', '<CitadelHudEscapeMenu onmouseover="$.HPHover()" ') };
  const root = rootAttrs(showrank.compose(hooked, sr())[OUTPUTS.menu], 'CitadelHudEscapeMenu');
  assert.equal(root.onmouseover, '$.HPHover(); ' + rootAttrs(sr().menu, 'CitadelHudEscapeMenu').onmouseover);
});

test('composition fails closed: missing v3 anchors, missing ShowRank pieces and id collisions throw', () => {
  const base = v3(), source = sr();
  assert.doesNotThrow(() => showrank.compose(base, source));
  const drop = (text, from) => once(text, from, '');
  const menuV3 = (from, to = '') => ({ ...base, menu: once(base.menu, from, to) });
  const topbarV3 = (from, to = '') => ({ ...base, topbar: once(base.topbar, from, to) });
  assert.throws(() => showrank.compose(menuV3('\t</scripts>\n'), source), /menu scripts anchor missing/);
  assert.throws(() => showrank.compose(menuV3('\t</CitadelHudEscapeMenu>\n'), source), /menu bridge anchor missing/);
  assert.throws(() => showrank.compose(menuV3('<CitadelHudEscapeMenu ', '<CitadelHudEscapeMenuX '), source), /v3 Escape root|menu root/);
  assert.throws(() => showrank.compose(topbarV3(PIECES.notificationAnchor), source), /topbar notification anchor missing/);
  assert.throws(() => showrank.compose(topbarV3(PIECES.averageAnchor), source), /topbar team-average anchor missing/);
  assert.throws(() => showrank.compose(topbarV3('\t</styles>\n'), source), /topbar styles anchor missing/);
  assert.throws(() => showrank.compose({ ...base, topbar: base.topbar.replace(PIECES.notificationAnchor, PIECES.notificationAnchor + PIECES.notificationAnchor) }, source), /notification anchor missing or ambiguous/);
  const srMenu = (from, to = '') => ({ ...source, menu: once(source.menu, from, to) });
  const srTopbar = (from, to = '') => ({ ...source, topbar: once(source.topbar, from, to) });
  const bridge = source.menu.match(/\t\t<CitadelHTMLPanel id="ShowRankBarebonesPartyBridge"[^\n]*\n/)[0];
  assert.throws(() => showrank.compose(base, srMenu(bridge)), /lacks its party bridge/);
  assert.throws(() => showrank.compose(base, srMenu('\t\t<include src="' + SCRIPT + '" />\n')), /lacks its script include/);
  assert.throws(() => showrank.compose(base, srMenu(' onmouseout="if ($.ShowRankBarebonesEscapeOut) $.ShowRankBarebonesEscapeOut();"')), /lacks its onmouseout handler/);
  assert.throws(() => showrank.compose(base, srMenu(' onload="if ($.ShowRankBarebonesEscapeOpen) $.ShowRankBarebonesEscapeOpen();"')), /lacks its onload handler/);
  assert.throws(() => showrank.compose(base, srMenu(bridge, bridge + '\t\t<Panel />\n')), /no longer the last Escape child/);
  assert.throws(() => showrank.compose(base, srTopbar('\t\t<include src="s2r://panorama/styles/showrank_barebones_topbar.vcss_c" />\n')), /lacks its style include showrank_barebones_topbar/);
  assert.throws(() => showrank.compose(base, srTopbar('\t\t<include src="s2r://panorama/styles/citadel_hud_game_announcements.vcss_c" />\n')), /lacks its style include citadel_hud_game_announcements/);
  assert.throws(() => showrank.compose(base, srTopbar('\t\t<Panel id="ShowRankBarebonesNotificationRoot" hittest="false" />\n')), /lacks its notification root/);
  const average = source.topbar.match(/\t\t<Panel id="ShowRankBarebonesTeamAverageLayer"[\s\S]*?\n\t\t<\/Panel>\n/)[0];
  assert.throws(() => showrank.compose(base, srTopbar(average)), /lacks its team-average layer/);
  assert.throws(() => showrank.compose(base, srTopbar(PIECES.averageAnchor, '\t\t<Panel />\n' + PIECES.averageAnchor)), /no longer precedes/);
  // Duplicate ids: a v3 layout that already owns a ShowRank id.
  assert.throws(() => showrank.compose(menuV3('\t</CitadelHudEscapeMenu>\n', '\t\t<Panel id="ShowRankBarebonesPartyBridge" />\n\t</CitadelHudEscapeMenu>\n'), source), /repeats ids: ShowRankBarebonesPartyBridge|copies of/);
  assert.throws(() => showrank.compose(topbarV3(PIECES.averageAnchor, '\t\t<Panel id="ShowRankBarebonesAverageEnemyImage" />\n' + PIECES.averageAnchor), source), /repeats ids: ShowRankBarebonesAverageEnemyImage/);
  // Guards: a lost v3 include/id and a repeated ShowRank piece fail directly.
  const out = composed();
  assert.throws(() => showrank.guard('Escape menu', base.menu, drop(out.menu, '\t\t<Panel id="HPColorsMenuHost" class="HPC3Root" hittest="true">\n'), []), /lost v3 includes\/ids/);
  assert.throws(() => showrank.guard('topbar', base.topbar, out.topbar, ['\t\t<Panel id="GradientBacker" />\n\t\t<Panel id="GradientBacker" />\n']), /0 copies/);
  // Structure: ShowRank nodes must stay in order, under their parents.
  assert.throws(() => showrank.structure('Escape menu', source.menu, drop(out.menu, '<Panel id="PartySpacer" />')), /structure lost/);
});

// ---- Runtime: the composed root handler strings against a fake Panorama ----
function handlerRun(name, extra) {
  const events = [], root = parseLayout(composed().menu.replace(/<\?[^>]*>\n/, ''));
  const node = root.children.find(child => child.tag === 'CitadelHudEscapeMenu');
  const $ = {
    HPColorsMenuBoot: () => events.push('v3-boot'),
    HPColorsMenuCancel: () => { events.push('v3-cancel'); return false; },
    DispatchEvent: (event) => events.push('dispatch:' + event),
    GetContextPanel: () => ({}), ...extra(events),
  };
  const context = vm.createContext({ $ });
  return { events, run: () => vm.runInContext(node.attrs[name], context), node };
}
test('root handlers: v3 and ShowRank both fire in order; a missing ShowRank export neither throws nor blocks v3', () => {
  const withShowRank = events => ({ ShowRankBarebonesEscapeOpen: () => events.push('sr-open'), ShowRankBarebonesEscapeOut: () => events.push('sr-out') });
  let h = handlerRun('onload', withShowRank); h.run();
  assert.deepEqual(h.events, ['v3-boot', 'sr-open']);
  h = handlerRun('onmouseover', withShowRank); h.run(); assert.deepEqual(h.events, ['sr-open']);
  h = handlerRun('onmouseout', withShowRank); h.run(); assert.deepEqual(h.events, ['sr-out']);
  h = handlerRun('oncancel', withShowRank); h.run(); assert.deepEqual(h.events, ['v3-cancel', 'dispatch:CitadelResumePlaying'], 'v3 cancel-before-resume is untouched');
  // pak89 not installed: $.ShowRankBarebones* are undefined.
  for (const name of ['onload', 'onmouseover', 'onmouseout', 'oncancel']) {
    h = handlerRun(name, () => ({ }));
    assert.doesNotThrow(() => h.run(), name);
  }
  h = handlerRun('onload', () => ({ })); h.run(); assert.deepEqual(h.events, ['v3-boot']);
  // A ShowRank export that throws cannot undo v3 (v3 runs first).
  h = handlerRun('onload', events => ({ ShowRankBarebonesEscapeOpen: () => { events.push('sr-open'); throw new Error('boom'); } }));
  assert.throws(() => h.run(), /boom/); assert.deepEqual(h.events, ['v3-boot', 'sr-open']);
});

// ---- Runtime: the real v3 scripts boot the composed layouts; ShowRank's script lives in pak89 ----
// v3 scripts come from the (staged) v3 tree, the layouts from this lane; the ShowRank script is absent.
function resolver(relative) {
  if (relative === SCRIPT.replace('s2r://', '').replace('.vjs_c', '.js')) return null;
  return path.join(sourceRoot, relative);
}
const bootLayout = (relative, options = {}) => loadLayout(relative, { ...options, sourceRoot: laneRoot, resolveScript: resolver });

test('Escape menu boots the real v3 scripts from the composed layout with the ShowRank script absent', () => {
  const boot = bootLayout('hud_escape_menu.xml');
  boot.includeScripts(); boot.onload();
  const h = boot.harness, find = id => { const panel = h.contextPanel.FindChildTraverse(id); assert.ok(panel, id); return panel; };
  assert.ok(latestPublishedConfig(h), 'v3 booted and published its config');
  assert.ok(find('HPColorsMenuHost')); assert.ok(find('HPColorsEditorShell'));
  const bridge = find('ShowRankBarebonesPartyBridge');
  assert.equal(bridge.GetAttributeString('visible', ''), 'false'); assert.equal(bridge.GetAttributeString('hittest', ''), 'false');
  assert.equal(h.$.ShowRankBarebonesEscapeOpen, undefined, 'no ShowRank runtime in this tree');
  for (const name of ['onmouseover', 'onmouseout']) assert.doesNotThrow(() => runInVm(boot.panelNode.attrs[name], boot.context, name));
  const before = h.dispatches.filter(event => event[0] === 'CitadelResumePlaying').length;
  runInVm(boot.panelNode.attrs.oncancel, boot.context, 'oncancel');
  assert.equal(h.dispatches.filter(event => event[0] === 'CitadelResumePlaying').length, before + 1, 'v3 cancel still resumes');
});

// Update notice: each build opens its own GameBanana file from latest.json; the ShowRank menu never
// opens the normal or QOLLOCK file, and without a ShowRank link it keeps the text-only notice.
test('update notice: the composed ShowRank menu offers the ShowRank download, never the normal or QOLLOCK one', () => {
  const { profile, launch } = require(path.join(v3Tests, 'storage-fixture'));
  const NORMAL = 'https://gamebanana.com/mods/download/603113#FileInfo_1852662', QOLLOCK = 'https://gamebanana.com/mods/download/603113#FileInfo_1852663';
  const SHOWRANK = 'https://gamebanana.com/mods/download/603113#FileInfo_1852664';
  for (const [name, own, expected] of [['with a ShowRank link', { showrank: SHOWRANK }, [SHOWRANK]], ['without one', {}, []]]) {
    const body = { hpv3: '99.0.0', download: { hpv3: { normal: NORMAL, qollock: QOLLOCK, ...own } } };
    const f = launch(profile(), { boot: () => bootLayout('hud_escape_menu.xml'), latest: { status: 200, body, delaySec: 0.1 } });
    const opened = [], dispatch = f.harness.$.DispatchEvent;
    f.harness.$.DispatchEvent = (...args) => args[0] === 'ExternalBrowserGoToURL' ? (opened.push(args[1]), true) : dispatch(...args);
    f.run(2000);
    const find = id => f.harness.contextPanel.FindChildTraverse(id);
    f.harness.$.HPColorsMenuToggle(); f.run(1500);
    assert.ok(find('HPColorsUpdateDialog').BHasClass('Open'), name + ': the notice shows in the ShowRank menu');
    assert.equal(find('HPColorsUpdateDialog').BHasClass('HPC3HasDownload'), expected.length > 0, name);
    find('HPColorsUpdateDownloadButton').events.onactivate();
    assert.deepEqual(opened, expected, name);
  }
});

test('with the ShowRank runtime present both boot and hover run; ShowRank does not disturb v3\'s boot', () => {
  const boot = bootLayout('hud_escape_menu.xml');
  runInVm('$.srCalls = []; $.ShowRankBarebonesEscapeOpen = function () { $.srCalls.push("open"); };' +
    '$.ShowRankBarebonesEscapeOut = function () { $.srCalls.push("out"); };', boot.context, 'showrank-stub');
  boot.includeScripts(); boot.onload();
  assert.ok(latestPublishedConfig(boot.harness));
  runInVm(boot.panelNode.attrs.onmouseover, boot.context, 'onmouseover'); runInVm(boot.panelNode.attrs.onmouseout, boot.context, 'onmouseout');
  assert.deepEqual(Array.from(boot.harness.$.srCalls), ['open', 'open', 'out']);
});

test('composed topbar keeps the ShowRank panels and runs the v3 pickup and ultimate timers', () => {
  const f = setup({ load: bootLayout }), topRoot = f.top.harness.contextPanel;
  assert.ok(topRoot.BHasClass('HPColorsV3TimersTopBar'));
  for (const id of ['ShowRankBarebonesNotificationRoot', 'ShowRankBarebonesTeamAverageLayer', 'ShowRankBarebonesAverageFriendlyImage', 'ShowRankBarebonesAverageEnemyImage', 'GradientBacker', 'StretBrawlContainer', 'TeamFriendly', 'TeamEnemy'])
    assert.ok(topRoot.FindChildTraverse(id), id);
  assert.ok(f.top.harness.$.HPColorsV3Timers, 'v3 topbar timers booted');
  f.advance(3000); f.border.style.clip = 'radial(50% 50%, 0deg, -270deg)'; f.remote.radial.style.clip = 'radial(50% 50%, 0deg, 120deg)'; f.advance(3000);
  f.border.style.clip = 'radial(50% 50%, 0deg, -240deg)'; f.advance(3000);
  assert.ok(f.traffic.some(x => x.magic === 'HPV3_PICKUP_SNAPSHOT' && x.record && x.record.progress[0].rate > 0), 'pickup snapshots publish');
  const progress = f.r.FindChildTraverse('HPColorsV3UltimateFill');
  assert.ok(progress); assert.notEqual(progress.style.clip, 'radial(50% 50%, 0deg, 0deg)');
});
