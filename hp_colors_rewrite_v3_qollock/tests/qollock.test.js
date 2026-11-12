'use strict';
// Ticket 22b: the QOLLOCK pak02 variant. The Escape menu and topbar are composed from the pinned
// QOLLOCK 4.0.5 (13 Oct) layouts; QOLLOCK keeps hud.xml. Runtime tests run twice: with the real
// QOLLOCK menu scripts from the pinned pak03 ("pinned") and with the window model ("model").
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runtimes, bootLayout, resolvePinned, skipOf, pinnedRuntime, laneRoot, v3Tests } = require('./qollock-runtime');
const { MockPanel, runInVm, latestPublishedConfig, createVmContext } = require(path.join(v3Tests, 'boot-layout'));
const { profile, launch } = require(path.join(v3Tests, 'storage-fixture'));
const qollock = require('../tools/qollock');

const root = laneRoot, v3Root = qollock.V3_ROOT;
const { lf } = require(path.join(v3Root, 'tools/lib/layout-compose'));
const read = relative => lf(fs.readFileSync(path.join(root, relative), 'utf8'));
const readV3 = relative => lf(fs.readFileSync(path.join(v3Root, relative), 'utf8'));
const refs = text => [...text.matchAll(/\s(?:src|id)="([^"]+)"/g)].map(match => match[1]);
const composedMenu = () => read(qollock.OUTPUTS.menu);
const composedTopbar = () => read(qollock.OUTPUTS.topbar);
const TOGGLE_DEBOUNCE_MS = 220, OPEN_GUARD_MS = 350; // QOLLOCK ui/window.js

test('22b pin: the 13 Oct hotfix pak03 and zip hashes are pinned and vendored layouts fail closed on edits', t => {
  const { pin, menu, topbar } = qollock.readPin(root);
  assert.equal(pin.pak03.sha256, '26fc7d60602e58f42fd5ee90bb3851561eb62f07ec7e3395e8d62d15972baadd');
  assert.equal(pin.zip.sha256, 'e37bcf3a62cd1f8c4a221c09d393729ad3e7fddf2c84357fa4b5ef0cd9758c51');
  assert.match(menu, /id="QOLStorageBridge"/); assert.match(topbar, /<scripts \/>/);
  assert.ok(pin.absent.includes('panorama/layout/unit_status_overlay_v2.vxml_c'), 'QOLLOCK ships no world unit-status layout');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-qollock-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(path.join(root, 'vendor'), path.join(dir, 'vendor'), { recursive: true });
  fs.appendFileSync(path.join(dir, 'vendor/hud_escape_menu.xml'), '\n<!-- hand edit -->\n');
  assert.throws(() => qollock.readPin(dir), /QOLLOCK pin mismatch: vendor\/hud_escape_menu.xml/);
});

test('22b composition: every pinned QOLLOCK include and id survives, every generated id is present, order is QOL LOCK > HP COLORS > settings', () => {
  const { menu: pinnedMenu, topbar: pinnedTopbar } = qollock.readPin(root);
  const menu = composedMenu(), topbar = composedTopbar();
  const have = new Set(refs(menu));
  for (const ref of refs(pinnedMenu)) assert.ok(have.has(ref), 'pinned menu ' + ref);
  for (const id of require(path.join(v3Root, 'tools/generate.js')).menuParts(v3Root).ids) assert.ok(have.has(id), 'generated ' + id);
  assert.equal(refs(menu).filter(ref => !ref.startsWith('s2r:')).length, new Set(refs(menu).filter(ref => !ref.startsWith('s2r:'))).size, 'ids unique');
  const scripts = [...menu.matchAll(/src="s2r:\/\/panorama\/scripts\/([^"]+)\.vjs_c"/g)].map(match => match[1]);
  const pinnedScripts = [...pinnedMenu.matchAll(/src="s2r:\/\/panorama\/scripts\/([^"]+)\.vjs_c"/g)].map(match => match[1]);
  assert.deepEqual(scripts.slice(0, pinnedScripts.length), pinnedScripts, 'QOLLOCK scripts keep their order and load first');
  assert.equal(scripts.at(-1), qollock.BRIDGE, 'the window bridge loads after both menus');
  const normal = readV3('panorama/layout/hud_escape_menu.xml');
  const v3Scripts = [...normal.matchAll(/src="s2r:\/\/panorama\/scripts\/([^"]+)\.vjs_c"/g)].map(match => match[1]);
  assert.deepEqual(scripts.slice(pinnedScripts.length, -1), v3Scripts, 'the v3 scripts are the normal menu scripts');
  assert.ok(menu.includes(readV3('generated/menu-rows.xml')), 'the generated v3 fragment is embedded unchanged');
  const order = ['id="ModSettingsBtn"', 'id="HPColorsMenuButton"', 'id="settings"'].map(text => menu.indexOf(text));
  assert.ok(order[0] > 0 && order[0] < order[1] && order[1] < order[2], 'nav order');
  const topRefs = new Set(refs(topbar));
  for (const ref of refs(pinnedTopbar)) assert.ok(topRefs.has(ref.replace(/\.vcss$/, '.vcss_c')), 'pinned topbar ' + ref);
  for (const id of ['BuffHUD', 'RejuvHUD', 'RejuvBuff', 'Buff', 'Rejuv', 'TeamSPMDisplay_friendly', 'TeamSPMDisplay_enemy']) assert.ok(topRefs.has(id), id);
  assert.match(topbar, /<CitadelHudTopBar class="HPColorsV3TimersTopBar HPColorsV3TimersHeroNames" hittest="false">/);
  assert.match(topbar, /hp_colors_v3_world_settings\.vjs_c[\s\S]*hp_colors_v3_timers_hud\.vjs_c/);
  assert.ok(!/\.vcss"/.test(topbar) && !/\.vcss"/.test(menu), 'every stylesheet include is compiled (.vcss_c)');
});

test('22b composition fails closed: lost QOLLOCK refs, missing v3 ids, id collisions and drifted anchors throw', () => {
  const pinned = qollock.readPin(root);
  const parts = { resume: 'R()', styles: '', scripts: '\t\t<include src="s2r://panorama/scripts/hp_colors_v3_menu.vjs_c" />\n',
    button: '<Button id="HPColorsMenuButton" />\n\t\t\t\t\t', fragment: '\t\t<Panel id="HPColorsMenuHost" />\n', ids: ['HPColorsMenuButton', 'HPColorsMenuHost'],
    topbarScripts: ['hp_colors_v3_timers_hud'], topbarClass: 'HPColorsV3TimersTopBar' };
  assert.doesNotThrow(() => qollock.compose(pinned, parts));
  assert.throws(() => qollock.compose(pinned, { ...parts, ids: [...parts.ids, 'HPColorsMissing'] }), /missing v3 entries: id="HPColorsMissing"/);
  assert.throws(() => qollock.compose(pinned, { ...parts, fragment: '\t\t<Panel id="QOLStorageBridge" />\n' }), /repeats ids: QOLStorageBridge|missing v3 entries/);
  const dropped = pinned.menu.replace(/\n\t\t<CitadelHTMLPanel id="QOLStorageBridge"[^\n]*/, '').replace(/\n\t\t<include src="s2r:\/\/panorama\/scripts\/core\/ql_storage_bridge\.vjs_c" \/>/, '');
  assert.throws(() => qollock.guard('Escape menu', pinned.menu, dropped, []), /lost pinned includes\/ids: (src="s2r:\/\/panorama\/scripts\/core\/ql_storage_bridge\.vjs_c", id="QOLStorageBridge"|id="QOLStorageBridge", src=)/);
  assert.throws(() => qollock.compose({ ...pinned, menu: pinned.menu.replace('</CitadelHudEscapeMenu>', '') }, parts), /menu fragment anchor/);
  assert.throws(() => qollock.compose({ ...pinned, menu: pinned.menu.replace('<Button id="settings"', '<Button id="settings2"') }, parts), /menu button anchor/);
  assert.throws(() => qollock.compose({ ...pinned, topbar: pinned.topbar.replace('\t<scripts />', '') }, parts), /topbar scripts anchor/);
});

test('22b guards (audit P3): ordered includes, anonymous panels and classes are structural, not only src/id sets', () => {
  const pinned = qollock.readPin(root), menu = composedMenu(), topbar = composedTopbar();
  assert.doesNotThrow(() => qollock.guard('Escape menu', pinned.menu, menu, []));
  assert.doesNotThrow(() => qollock.guard('topbar', pinned.topbar, topbar, []));
  const once = (text, from, to) => { assert.equal(text.split(from).length, 2, from); return text.replace(from, to); };
  const mutations = {
    'QOL LOCK row loses its SettingsRow class': once(menu, '<Panel class="SettingsRow">\n\t\t\t\t\t\t<Button id="ModSettingsBtn"', '<Panel>\n\t\t\t\t\t\t<Button id="ModSettingsBtn"'),
    'anonymous MenuIcon panel deleted': once(menu, '\t\t\t\t\t\t\t<Panel class="MenuIcon" />\n', ''),
    'first two QOLLOCK scripts swapped': once(once(menu, 'core/ql_namespace.vjs_c', '@@A'), 'ql_utils.vjs_c', 'core/ql_namespace.vjs_c').replace('@@A', 'ql_utils.vjs_c'),
    'pinned attribute changed': once(menu, 'id="CloseBtn" onactivate="', 'id="CloseBtn" onactivate="x();'),
    'panel moved out of its parent': once(menu, '\t\t<CitadelPrivilegedFeatures id="PrivilegedFeatures" />\n', '').replace('</CitadelHudEscapeMenu>', '\t<Panel><CitadelPrivilegedFeatures id="PrivilegedFeatures" /></Panel>\n\t</CitadelHudEscapeMenu>'),
  };
  // Re-audit P3: same-depth reparenting (ModSettingsBtn moved under a new sibling Panel) must fail.
  mutations['ModSettingsBtn reparented at the same depth'] = once(menu, '<Button id="ModSettingsBtn"', '</Panel>\n\t\t\t\t\t<Panel id="AuditWrongParent">\n\t\t\t\t\t\t<Button id="ModSettingsBtn"');
  for (const [name, text] of Object.entries(mutations)) assert.throws(() => qollock.guard('Escape menu', pinned.menu, text, []), /structure/, name);
  assert.throws(() => qollock.guard('topbar', pinned.topbar, topbar.replace('<Panel class="TopBottomFlow">', '<Panel>'), []), /structure/, 'topbar anonymous class');
  assert.throws(() => qollock.guard('topbar', pinned.topbar, once(topbar, '\t\t<Panel id="RejuvBuff" hittest="false">', '\t\t<Panel id="RejuvBuff">'), []), /structure/, 'topbar attribute');
});

// ---- Runtime: the composed Escape menu with QOLLOCK and v3 scripts ----
function menuFixture(runtime, options = {}) {
  const boot = bootLayout('hud_escape_menu.xml', runtime, options);
  const h = boot.harness, find = id => { const panel = h.contextPanel.FindChildTraverse(id); assert.ok(panel, id); return panel; };
  const attr = (id, name) => runInVm(find(id).GetAttributeString(name, ''), boot.context, id + ':' + name);
  return { boot, h, find, attr,
    start() { boot.includeScripts(); boot.onload(); return this; },
    run(ms) { h.scheduler.runFor(ms, 20000); },
    advance(ms) { h.now += ms; },
    qolOpen: () => find('SettingsWindow').BHasClass('Visible'),
    v3Open: () => find('HPColorsMenuHost').BHasClass('HPC3Open'),
    resumes: () => h.dispatches.filter(event => event[0] === 'CitadelResumePlaying').length,
    cancel: () => runInVm(boot.panelNode.attrs.oncancel, boot.context, 'oncancel'),
    // The installed handler: QOLLOCK's delayed boot replaces the XML onactivate with SetPanelEvent.
    background() { const panel = find('EscapeBackground'); assert.equal(typeof panel.events.onactivate, 'function'); return panel.events.onactivate(); } };
}

for (const runtime of runtimes()) {
  const skip = skipOf(runtime);

  test('ticket 30 preview chrome (' + runtime.name + '): release label survives composition', { skip }, () => {
    const f = menuFixture(runtime).start();
    assert.equal(f.find('HPColorsPreviewVersion').text, 'v' + JSON.parse(readV3('settings/record.json')).release);
  });

  test('ticket 32 supporters (' + runtime.name + '): composed passive strip, DONATE, window handoff and retirement preserve the footer', { skip }, () => {
    const f = menuFixture(runtime), strip = f.find('HPColorsSupporterStrip'), urls = [], cursors = [];
    strip.SetURL = url => { urls.push(url); };
    strip.SetIgnoreCursor = value => { cursors.push(value); };
    f.start(); f.run(1000);
    assert.deepEqual(urls, []); assert.equal(strip.BHasClass('Open'), false);
    assert.equal(strip.paneltype, 'CitadelHTMLPanel');
    for (const attr of ['hittest', 'hittestchildren', 'acceptsfocus']) assert.equal(strip.GetAttributeString(attr, ''), 'false');
    assert.ok(f.find('HPColorsPreviewDonateButton').GetParent() === f.find('HPColorsPreviewFooter'));
    assert.equal(f.find('HPColorsPreviewCreditsButton').Children()[0].text, 'CREDITS');
    assert.equal(f.find('HPColorsPreviewVersion').text, 'v' + require('../../hp_colors_rewrite_v3/settings/record.json').release);
    f.attr('HPColorsMenuButton', 'onactivate');
    assert.match(urls[0], /^https:\/\/hantu-raya\.github\.io\/hp-colors-preset-builder\/supporters-strip-v3\/\?v=/);
    assert.deepEqual(cursors, [true]); assert.equal(strip.BHasClass('Open'), true);
    const mark = f.h.dispatches.length;
    f.find('HPColorsPreviewDonateButton').events.onactivate();
    assert.deepEqual(f.h.dispatches.slice(mark), [['ExternalBrowserGoToURL', 'https://ko-fi.com/hantuaraya']]);
    f.background(); assert.equal(urls.at(-1), 'about:blank'); assert.equal(strip.BHasClass('Open'), false);
    f.attr('HPColorsMenuButton', 'onactivate'); assert.notEqual(urls.at(-1), urls[0]);
    f.attr('ModSettingsBtn', 'onactivate');
    assert.equal(f.v3Open(), false); assert.equal(urls.at(-1), 'about:blank'); assert.equal(strip.BHasClass('Open'), false);
    f.attr('HPColorsMenuButton', 'onactivate'); assert.equal(strip.BHasClass('Open'), true);
    f.h.$.HPColorsMenuPublisher.retire();
    assert.equal(urls.at(-1), 'about:blank'); assert.equal(strip.BHasClass('Open'), false);
  });

  test('ticket 31 credits (' + runtime.name + '): composed footer and dialog keep text, portraits and all close routes without resuming', { skip }, () => {
    const f = menuFixture(runtime).start(); f.run(1000);
    f.attr('HPColorsMenuButton', 'onactivate');
    const dialog = f.find('HPColorsCreditsDialog'), footer = f.find('HPColorsPreviewFooter');
    assert.ok(f.find('HPColorsPreviewCreditsButton').GetParent() === footer);
    assert.ok(f.find('HPColorsPreviewVersion').GetParent() === footer);
    const before = JSON.stringify(latestPublishedConfig(f.h));
    for (const close of ['HPColorsCreditsCloseButton', 'HPColorsCreditsEscClose', null, 'HPColorsCreditsBackdrop']) {
      f.find('HPColorsPreviewCreditsButton').events.onactivate(); assert.equal(dialog.BHasClass('Open'), true);
      assert.equal(f.find('HPColorsCreditsYesdaddyName').text, 'yesdaddy');
      assert.equal(f.find('HPColorsCreditsYesdaddyText').text, 'Taking his own time testing my mods and giving alot of Good suggestions');
      assert.equal(f.find('HPColorsCreditsYesdaddyPortrait').src, 'file://{images}/heroes/chessmaster_sm.psd');
      assert.equal(f.find('HPColorsCreditsRazorrzrName').text, 'razorrzr');
      assert.equal(f.find('HPColorsCreditsRazorrzrText').text, 'Critizing my ui and giving a solid gold');
      assert.equal(f.find('HPColorsCreditsRazorrzrPortrait').src, 'file://{images}/heroes/lash_sm.psd');
      if (close) f.find(close).events.onactivate(); else f.cancel();
      assert.equal(dialog.BHasClass('Open'), false); assert.equal(f.v3Open(), true);
      assert.equal(f.resumes(), 0); assert.equal(JSON.stringify(latestPublishedConfig(f.h)), before);
    }
  });

  test('22b menu (' + runtime.name + '): the composed QOLLOCK Escape menu boots the v3 editor and publishes settings; QOLLOCK panels and storage bridge stay intact', { skip }, () => {
    const f = menuFixture(runtime).start();
    f.run(3000);
    const config = latestPublishedConfig(f.h);
    assert.ok(config && config.magic === 'HP_COLORS_V3_CONFIG', 'v3 settings published');
    assert.equal(f.h.$.HPColorsV3Settings.validate(config.settings), true);
    assert.ok(f.find('HPColorsMenuButton').GetParent().id === 'SubOptions', 'entry point sits in the nav');
    for (const id of ['SettingsWindow', 'SettingsHeader', 'SettingsList', 'CloseBtn', 'ModSettingsBtn', 'ModSettingsGearIcon', 'newgame', 'watchgame', 'guides']) f.find(id);
    const qolStore = f.find('QOLStorageBridge'), v3Store = f.find('HPColorsV3StorePanel');
    assert.equal(qolStore.type, 'CitadelHTMLPanel'); assert.equal(v3Store.type, 'CitadelHTMLPanel'); assert.ok(qolStore !== v3Store);
    assert.equal(typeof f.h.$.ToggleSettingsWindow, 'function'); assert.equal(typeof f.h.$.IsModSettingsOpen, 'function');
    if (runtime.root) {
      assert.equal(typeof f.boot.context.QOL, 'object', 'QOLLOCK namespace booted');
      assert.equal(typeof f.boot.context.QOLStorageBridge, 'object', 'QOLLOCK storage bridge api attached');
      assert.ok(f.boot.context.QOL.ui.window.isOpen() === false);
    }
    assert.equal(f.qolOpen(), false); assert.equal(f.v3Open(), false);
  });

  test('22b menu (' + runtime.name + '): opening one settings window closes the other; background, ESC and resume keep each window\'s rules', { skip }, () => {
    const f = menuFixture(runtime).start();
    f.run(1000);
    f.attr('ModSettingsBtn', 'onactivate');
    assert.equal(f.qolOpen(), true, 'QOL LOCK opens');
    f.advance(OPEN_GUARD_MS + 10);
    f.attr('HPColorsMenuButton', 'onactivate');
    assert.equal(f.v3Open(), true, 'HP COLORS opens'); assert.equal(f.qolOpen(), false, 'and closes QOL LOCK');
    f.advance(TOGGLE_DEBOUNCE_MS + 10);
    f.attr('ModSettingsBtn', 'onactivate');
    assert.equal(f.qolOpen(), true, 'QOL LOCK opens'); assert.equal(f.v3Open(), false, 'and closes HP COLORS');
    // Background with QOL LOCK open closes only QOL LOCK; with HP COLORS open, only HP COLORS.
    f.advance(OPEN_GUARD_MS + 10);
    f.background();
    assert.equal(f.qolOpen(), false); assert.equal(f.resumes(), 0, 'no resume while closing QOL LOCK');
    f.attr('HPColorsMenuButton', 'onactivate'); assert.equal(f.v3Open(), true);
    f.background();
    assert.equal(f.v3Open(), false); assert.equal(f.resumes(), 0, 'the installed background handler lets HP COLORS consume the click');
    // Closing HP COLORS with its own button never reopens QOL LOCK.
    f.attr('HPColorsMenuButton', 'onactivate'); f.attr('HPColorsMenuButton', 'onactivate');
    assert.equal(f.v3Open(), false); assert.equal(f.qolOpen(), false);
    // ESC closes the open HP COLORS editor first; with nothing open it resumes once, which also closes QOL LOCK.
    f.attr('HPColorsMenuButton', 'onactivate'); f.cancel();
    assert.equal(f.v3Open(), false); assert.equal(f.resumes(), 0);
    f.background(); assert.equal(f.resumes(), 1);
    f.advance(TOGGLE_DEBOUNCE_MS + 10); f.attr('ModSettingsBtn', 'onactivate'); assert.equal(f.qolOpen(), true);
    f.advance(OPEN_GUARD_MS + 10); f.attr('EscapeButton', 'onactivate');
    assert.equal(f.resumes(), 2); assert.equal(f.qolOpen(), false, 'resume closes QOL LOCK through its CitadelResumePlaying listener');
  });

  test('22b menu (' + runtime.name + '): QOLLOCK\'s delayed background handler lets an open HP COLORS consume the click; a refused SetPanelEvent override still does', { skip }, () => {
    for (const locked of [false, true]) {
      const f = menuFixture(runtime);
      if (locked) {
        const panel = f.find('EscapeBackground'), set = panel.SetPanelEvent;
        Object.defineProperty(panel, 'SetPanelEvent', { value: set, writable: false, configurable: false });
      }
      f.start(); f.run(1000);
      f.attr('HPColorsMenuButton', 'onactivate'); assert.equal(f.v3Open(), true);
      f.find('HPColorsSearchField').text = 'red'; f.find('HPColorsSearchField').events.ontextentrychange(); assert.ok(f.find('HPColorsMenuHost').BHasClass('Searching'));
      f.background(); assert.equal(f.v3Open(), true, 'first click closes search'); assert.equal(f.resumes(), 0);
      f.background(); assert.equal(f.v3Open(), false, 'second click closes the editor'); assert.equal(f.resumes(), 0, 'no resume while HP COLORS was open');
      f.background(); assert.equal(f.resumes(), 1, 'nothing open: QOLLOCK\'s handler resumes');
      f.advance(TOGGLE_DEBOUNCE_MS + 10); f.attr('ModSettingsBtn', 'onactivate'); assert.equal(f.qolOpen(), true);
      f.advance(OPEN_GUARD_MS + 10); f.background();
      assert.equal(f.qolOpen(), false, 'QOL LOCK closes on the background'); assert.equal(f.resumes(), 1, (locked ? 'fallback' : 'wrapped') + ' handler');
    }
  });

  const openPaths = {
    'QOL.ui.window.setOpen(true)': f => f.boot.context.QOL.ui.window.setOpen(true),
    'QOL.ui.window.toggle()': f => f.boot.context.QOL.ui.window.toggle(),
    'QOL.ui.window.toggleSettingsWindow()': f => f.boot.context.QOL.ui.window.toggleSettingsWindow(),
    'global ToggleSettingsWindow()': f => runInVm('ToggleSettingsWindow()', f.boot.context, 'global-toggle'),
    '$.ToggleSettingsWindow()': f => f.h.$.ToggleSettingsWindow(),
    'ModSettingsBtn onactivate': f => f.attr('ModSettingsBtn', 'onactivate'),
  };
  test('22b menu (' + runtime.name + '): every exported QOL LOCK open path closes HP COLORS, and HP COLORS closes QOL LOCK through its full close', { skip }, () => {
    for (const [name, open] of Object.entries(openPaths)) {
      const f = menuFixture(runtime).start(); f.run(1000);
      f.attr('HPColorsMenuButton', 'onactivate'); assert.equal(f.v3Open(), true, name);
      open(f);
      assert.equal(f.qolOpen(), true, name + ' opens QOL LOCK'); assert.equal(f.v3Open(), false, name + ' closes HP COLORS');
      const api = f.boot.context.QOL.ui.window, force = api.forceCloseModSettings, closes = [];
      api.forceCloseModSettings = function (ignoreGuard) { closes.push(ignoreGuard); return force.apply(this, arguments); };
      f.attr('HPColorsMenuButton', 'onactivate');
      assert.equal(f.v3Open(), true, name + ': HP COLORS reopens'); assert.equal(f.qolOpen(), false, name + ': and closes QOL LOCK');
      assert.deepEqual(closes, [true], name + ': through QOLLOCK\'s own full close, guard skipped, once');
    }
  });

  test('22b menu (' + runtime.name + '): QOLLOCK\'s 220 ms toggle debounce and 350 ms close guard survive the bridge', { skip }, () => {
    const f = menuFixture(runtime).start(); f.run(1000);
    f.h.$.ToggleSettingsWindow(); f.h.$.ToggleSettingsWindow();
    assert.equal(f.qolOpen(), true, 'second toggle inside the debounce is ignored');
    f.h.$.ForceCloseModSettings(); assert.equal(f.qolOpen(), true, 'unforced close inside the open guard is ignored');
    f.advance(TOGGLE_DEBOUNCE_MS + 10); f.h.$.ToggleSettingsWindow(); assert.equal(f.qolOpen(), false);
    assert.equal(f.v3Open(), false, 'no HP COLORS side effect');
  });

  test('22b menu (' + runtime.name + '): the v3 store page and QOLLOCK storage bridge stay on separate panels and origins', { skip }, () => {
    const p = profile();
    let qolUrls = null;
    const f = launch(p, { boot: () => {
      const boot = bootLayout('hud_escape_menu.xml', runtime), panel = boot.harness.contextPanel.FindChildTraverse('QOLStorageBridge');
      qolUrls = []; panel.SetURL = url => { qolUrls.push(String(url)); };
      return boot;
    } });
    f.run(3000);
    assert.equal(f.status(), 'Saved');
    f.edit('#123456'); f.run(3000);
    assert.equal(f.settings().side.enemy.barColorLow, '#123456');
    assert.ok(f.page.urls.length > 0 && f.page.urls.every(url => /^https:\/\/hantu-raya\.github\.io\/hpv2-store\//.test(url)), 'only the v3 page origin on the v3 panel');
    assert.ok(qolUrls.every(url => /^https:\/\/predi-i\.github\.io\/qollock-updates\/bridge\.html/.test(url)), 'only the QOLLOCK bridge origin on its panel: ' + qolUrls.join(', '));
    if (runtime.root) assert.ok(qolUrls.length > 0, 'the real QOLLOCK storage bridge loaded its page beside the v3 store');
  });

  test('33 update notice (' + runtime.name + '): the composed QOLLOCK menu offers the QOLLOCK download, never the normal one', { skip }, () => {
    const NORMAL = 'https://gamebanana.com/mods/download/603113#FileInfo_1852662', QOLLOCK = 'https://gamebanana.com/mods/download/603113#FileInfo_1852663';
    const body = { hpv3: '99.0.0', download: { hpv3: { normal: NORMAL, qollock: QOLLOCK, showrank: 'https://gamebanana.com/mods/download/603113#FileInfo_1852664' } } };
    const f = launch(profile(), { boot: () => bootLayout('hud_escape_menu.xml', runtime), latest: { status: 200, body, delaySec: 0.1 } });
    const opened = [], dispatch = f.harness.$.DispatchEvent;
    f.harness.$.DispatchEvent = (...args) => args[0] === 'ExternalBrowserGoToURL' ? (opened.push(args[1]), true) : dispatch(...args);
    f.run(2000);
    const find = id => f.harness.contextPanel.FindChildTraverse(id);
    f.harness.$.HPColorsMenuToggle(); f.run(1500);
    assert.ok(find('HPColorsUpdateDialog').BHasClass('Open'), 'the notice shows in the QOLLOCK menu');
    find('HPColorsUpdateDownloadButton').events.onactivate();
    assert.deepEqual(opened, [QOLLOCK]);
  });
}

// ---- QOLLOCK color warnings vs v3 own-HUD color (finding 3): disjoint panels and properties ----
test('22b own HUD: QOLLOCK color-warning washes on the HUD bar parents never fight v3\'s three owned properties on health_bar_Left', () => {
  const f = menuFixture({ name: 'model', root: null }).start();
  const hud = new MockPanel('Panel', f.h.root, 'Hud'), container = new MockPanel('Panel', hud, 'health_and_abilities_container');
  container.AddClass('team1');
  const bars = new MockPanel('Panel', container, 'hud_health_bars'), bar = new MockPanel('Panel', bars, 'health_bar');
  const left = new MockPanel('Panel', bar, 'health_bar_Left'), frame = new MockPanel('Panel', bar, 'health_bar_frame');
  f.run(3000);
  const row = f.h.$.HPColorsV3Settings.controls.find(r => r.key === 'hudHealthColorMode');
  f.find(row.options.find(o => o.value === 'custom').id).events.onactivate();
  const owned = () => ['backgroundImage', 'backgroundColor', 'washColor'].map(key => left.style[key]);
  const painted = owned();
  assert.equal(painted[2], '#FFFF00');
  const v3Writes = () => left.__styleWrites.length;
  const before = v3Writes();
  // ql_color_warnings _updateSelf/_resetSelfStyles: washColor on hud_health_bars and health_bar, its
  // FindChild("health_bar_left") lookup (lower-case l), and ql_healthbar accent wash on health_bar_frame.
  for (const color of ['rgb(255,165,0)', 'rgb(255,0,0)', '']) {
    bars.style.washColor = color; bar.style.washColor = color; frame.style.washColor = color;
    const lower = bar.FindChild('health_bar_left');
    if (lower) lower.style.washColor = color; // QOLLOCK writes whatever its lookup returns
    f.run(2000);
    assert.deepEqual(owned(), painted, 'v3 keeps its bar under QOLLOCK wash ' + JSON.stringify(color));
  }
  assert.equal(v3Writes(), before, 'QOLLOCK writes cause no v3 rewrites');
  for (const panel of [hud, container, bars, bar, frame]) assert.ok(panel.__styleWrites.every(write => write.property === 'washColor'), panel.id + ': v3 writes nothing on QOLLOCK panels');
});

test('22b staging: the window bridge passes the release/debug script transform; release keeps no logging', t => {
  const { spawnSync } = require('node:child_process');
  for (const debug of [false, true]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-qollock-stage-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.cpSync(path.join(root, 'panorama/scripts'), dir, { recursive: true });
    const run = spawnSync(process.execPath, [path.join(v3Root, 'tools/stage-scripts.js'), dir].concat(debug ? ['--debug'] : []), { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const text = fs.readFileSync(path.join(dir, qollock.BRIDGE + '.js'), 'utf8');
    assert.equal(/\$\.Msg/.test(text), debug, (debug ? 'debug keeps' : 'release strips') + ' the bridge diagnostics');
  }
});

// Audit P2 (test skips): only an absent pak03 skips; a present pak03 without a decompiler fails.
test('22b runtime: the pinned runtime skips only for an absent pak03 and otherwise fails with an actionable error', t => {
  const env = {}, missing = path.join(os.tmpdir(), 'hpv3-no-such-pak03.vpk');
  const absent = resolvePinned({ env, pak: missing });
  assert.equal(absent.root, null); assert.match(absent.reason, /pak03 absent/); assert.equal(skipOf(absent), absent.reason);
  assert.throws(() => resolvePinned({ env: { HPV3_QOLLOCK_REQUIRED: '1' }, pak: missing }), /QOLLOCK build requires the pinned runtime: pinned QOLLOCK pak03 absent/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-qollock-runtime-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fake = path.join(dir, 'pak03_dir.vpk'); fs.writeFileSync(fake, 'not the pinned pak03');
  assert.throws(() => resolvePinned({ env, pak: fake, viewers: [], cacheRoot: dir }), /Pinned QOLLOCK pak03 drifted/);
  const { pin } = qollock.readPin(root), real = path.resolve(root, '..', pin.pak03.path);
  if (!fs.existsSync(real)) return t.skip('pinned pak03 absent');
  assert.throws(() => resolvePinned({ env, pak: real, viewers: [path.join(dir, 'no-viewer.exe')], cacheRoot: dir }),
    /present but Source2Viewer-CLI was not found; install Source2Viewer-CLI 19\.2 at .*\(or set HPV3_QOLLOCK_ROOT/);
  const broken = path.join(dir, 'broken-viewer.cmd'); fs.writeFileSync(broken, '@exit /b 3\r\n');
  assert.throws(() => resolvePinned({ env, pak: real, viewers: [broken], cacheRoot: dir }), /decompile failed .*install Source2Viewer-CLI/);
});

// Audit P3 (own HUD): the real pinned QOLLOCK HUD runtime runs ql_color_warnings on the shared HUD.
// Native Panorama id lookup is case-sensitive (panorama.dll CUIPanel::FindChild compares raw id bytes,
// rva 0xf84d4-0xf84e5; audit m3), so its FindChild("health_bar_left") does not reach health_bar_Left.
test('22b own HUD (pinned): the real ql_color_warnings manifest tints the HUD bar parents and never takes v3\'s health_bar_Left', { skip: skipOf(pinnedRuntime()) }, () => {
  const runtime = pinnedRuntime();
  const f = menuFixture(runtime).start();
  const hud = new MockPanel('CitadelHud', f.h.root, 'Hud'), container = new MockPanel('Panel', hud, 'health_and_abilities_container');
  container.AddClass('team1');
  const bars = new MockPanel('Panel', container, 'hud_health_bars'), bar = new MockPanel('Panel', bars, 'health_bar');
  const left = new MockPanel('Panel', bar, 'health_bar_Left');
  const current = new MockPanel('Label', container, 'current_health'), max = new MockPanel('Label', container, 'max_health');
  current.text = '200'; max.text = '1000';
  f.run(3000);
  const row = f.h.$.HPColorsV3Settings.controls.find(r => r.key === 'hudHealthColorMode');
  f.find(row.options.find(o => o.value === 'custom').id).events.onactivate();
  const owned = () => ['backgroundImage', 'backgroundColor', 'washColor'].map(key => left.style[key]);
  const painted = owned(), v3Writes = left.__styleWrites.length;
  assert.equal(painted[2], '#FFFF00');
  // QOLLOCK's real HUD context: every hud.xml script, with the HUD as its context panel.
  const hudContext = createVmContext(f.h);
  hudContext.$ = { ...f.h.$, GetContextPanel: () => hud };
  const hudLayout = fs.readFileSync(path.join(runtime.root, 'panorama/layout/hud.xml'), 'utf8');
  for (const match of hudLayout.matchAll(/s2r:\/\/panorama\/(scripts\/[^"]+)\.vjs_c/g))
    runInVm(fs.readFileSync(path.join(runtime.root, 'panorama', match[1] + '.js'), 'utf8'), hudContext, match[1] + '.js');
  const Q = hudContext.QOL;
  assert.ok(Q.core.FeatureRegistry.isRegistered('ql_color_warnings'));
  for (const key of ['ENABLE_COLORED_HEALTHBAR', 'ENABLE_COLOR_WARNING_25', 'ENABLE_COLOR_WARNING_65', 'ENABLE_COLOR_WARNING_75'])
    assert.equal(Q.core.ConfigStore.set('ql_color_warnings', key, true), true, key);
  Q.core.FeatureRegistry.enable('ql_color_warnings');
  f.run(3000);
  assert.ok(Q.core.FeatureRegistry.isEnabled('ql_color_warnings'));
  assert.match(String(bars.style.washColor), /^rgb\(/, 'QOLLOCK tints hud_health_bars');
  assert.match(String(bar.style.washColor), /^rgb\(/, 'QOLLOCK tints health_bar');
  assert.deepEqual(owned(), painted, 'v3 keeps health_bar_Left under QOLLOCK warnings');
  assert.equal(left.__styleWrites.length, v3Writes, 'QOLLOCK never writes health_bar_Left and v3 never rewrites it');
  // Lower HP pulses; disabling QOLLOCK clears only its own washes.
  current.text = '100'; f.run(2000);
  Q.core.FeatureRegistry.disable('ql_color_warnings'); f.run(1000);
  assert.ok(!bars.style.washColor && !bar.style.washColor, 'QOLLOCK reset clears its parent washes');
  assert.deepEqual(owned(), painted); assert.equal(left.__styleWrites.length, v3Writes);
});

test('22b post-pack guard: a decompiled pak02 layout must match the composed source node for node', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-qollock-packed-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const relative of Object.values(qollock.OUTPUTS)) {
    const target = path.join(dir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, read(relative).replace(/\n/g, '\r\n'));
  }
  assert.equal(qollock.checkPacked(dir, root), 2, 'CRLF decompiler output of the same layouts passes');
  const menuFile = path.join(dir, 'panorama/layout/hud_escape_menu.xml');
  fs.writeFileSync(menuFile, read(qollock.OUTPUTS.menu).replace('<Panel class="MenuIcon" />', ''));
  assert.throws(() => qollock.checkPacked(dir, root), /structure/);
  fs.writeFileSync(menuFile, read(qollock.OUTPUTS.menu).replace('</CitadelHudEscapeMenu>', '<Panel />\n</CitadelHudEscapeMenu>'));
  assert.throws(() => qollock.checkPacked(dir, root), /structure has \d+ nodes/);
  // Re-audit P3: composed-to-packed compares every attribute, including the v3 hooks.
  const menu = read(qollock.OUTPUTS.menu), topbarFile = path.join(dir, 'panorama/layout/citadel_hud_top_bar.xml');
  const hookMutations = {
    'menu root onload dropped': menu.replace(' onload="$.HPColorsMenuBoot()"', ''),
    'menu root oncancel emptied': menu.replace(/(<CitadelHudEscapeMenu[^>]*\soncancel=")[^"]*"/, '$1"'),
  };
  for (const [name, text] of Object.entries(hookMutations)) {
    assert.notEqual(text, menu, name);
    fs.writeFileSync(menuFile, text);
    assert.throws(() => qollock.checkPacked(dir, root), /structure/, name);
  }
  fs.writeFileSync(menuFile, menu);
  const topbar = read(qollock.OUTPUTS.topbar);
  for (const [name, text] of Object.entries({
    'topbar HPColorsV3TimersTopBar class dropped': topbar.replace(' class="HPColorsV3TimersTopBar HPColorsV3TimersHeroNames"', ''),
    'topbar HPColorsV3TimersHeroNames opt-in dropped': topbar.replace(' HPColorsV3TimersHeroNames"', '"'),
  })) {
    assert.notEqual(text, topbar, name);
    fs.writeFileSync(topbarFile, text);
    assert.throws(() => qollock.checkPacked(dir, root), /structure/, name);
  }
});

// Release rule: a v3 menu change must leave this lane's layouts stale until they are recomposed.
test('22b lane check: committed layouts are current, a v3 menu change makes them stale, a stale v3 checkout is refused', t => {
  assert.equal(qollock.writeOrCheck(true), 2);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-qollock-lane-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const v3 = path.join(dir, 'hp_colors_rewrite_v3'), lane = path.join(dir, 'hp_colors_rewrite_v3_qollock');
  for (const sub of ['settings', 'generated', 'vendor', 'tools', 'panorama']) fs.cpSync(path.join(v3Root, sub), path.join(v3, sub), { recursive: true });
  fs.copyFileSync(path.join(v3Root, 'game-data-pin.json'), path.join(v3, 'game-data-pin.json'));
  for (const sub of ['vendor', 'panorama']) fs.cpSync(path.join(root, sub), path.join(lane, sub), { recursive: true });
  assert.equal(qollock.writeOrCheck(true, lane, v3), 2, 'copied lane is current');
  // A v3 menu change: rename a row; regenerate v3 only.
  const schemaFile = path.join(v3, 'settings/schema.json'), schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
  schema[0].name += ' renamed'; fs.writeFileSync(schemaFile, JSON.stringify(schema, null, 2));
  assert.throws(() => qollock.writeOrCheck(true, lane, v3), /hp_colors_rewrite_v3 generated outputs are stale .*generated\/menu-rows\.xml/);
  const { spawnSync } = require('node:child_process');
  const regen = spawnSync(process.execPath, [path.join(v3, 'tools/generate.js')], { cwd: v3, encoding: 'utf8' });
  assert.equal(regen.status, 0, regen.stderr);
  assert.throws(() => qollock.writeOrCheck(true, lane, v3), /Stale QOLLOCK layouts: panorama\/layout\/hud_escape_menu\.xml/);
  assert.equal(qollock.writeOrCheck(false, lane, v3), 2);
  assert.equal(qollock.writeOrCheck(true, lane, v3), 2, 'recomposed lane is current');
  assert.ok(fs.readFileSync(path.join(lane, 'panorama/layout/hud_escape_menu.xml'), 'utf8').includes(schema[0].name));
});
