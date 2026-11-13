'use strict';
// Ticket 36: the NEW tab, modeled on the game's Settings NEW section. Items come from settings/news.json;
// dismissals are saved in the bundle (not a setting, not Undo, not shared) and items expire after 30 days.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadLayout, runInVm, sourceRoot } = require('./boot-layout');
const { computed } = require('./style-cascade');

const root = path.resolve(__dirname, '..');
const news = JSON.parse(fs.readFileSync(path.join(root, 'settings/news.json'), 'utf8'));
const record = JSON.parse(fs.readFileSync(path.join(root, 'settings/record.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(root, 'settings/schema.json'), 'utf8'));
const pascal = text => String(text).replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^./, c => c.toUpperCase());
const copy = value => JSON.parse(JSON.stringify(value));
const DAY = 24 * 60 * 60 * 1000;
const dateOf = item => Date.parse(item.date + 'T00:00:00Z');
const sidesOf = row => row.side === 'side-aware' ? ['enemy', 'ally'] : [row.side];
const targetRows = item => item.targets.flatMap(target => {
  const row = schema.find(entry => entry.key === target.key);
  return (target.side ? [target.side] : sidesOf(row)).map(side => 'HPColors' + pascal(row.key) + (side === 'shared' ? '' : pascal(side)) + 'Row');
});
const pageOf = item => item.page || schema.find(entry => entry.key === item.targets[0].key).page;
const itemId = item => 'HPColorsNewItem' + pascal(item.id);

function menu(options = {}) {
  const b = loadLayout('hud_escape_menu.xml', { harnessOptions: { now: options.now === undefined ? dateOf(news[0]) : options.now } });
  if (options.missing) b.harness.contextPanel.FindChildTraverse(options.missing).valid = false;
  b.includeScripts();
  const h = b.harness; let api, hydrated = options.hydrated !== false;
  let bundle = { settings: copy(h.$.HPColorsV3Settings.defaults), presets: [], ...options.bundle };
  const commits = [];
  h.$.HPColorsV3Store = {
    attach(value) { api = value; (api.hydrateSettings || api.applySettings)(bundle.settings); },
    commit(config) { bundle.settings = copy(config.settings); commits.push('settings'); },
    getBundle() { return copy(bundle); }, isHydrated() { return hydrated; },
    replaceBundle(next) { bundle = copy(next); commits.push('bundle'); api.refreshPresets(); return true; },
    exportBundleCode(settings) { const result = h.$.HPColorsV3Sharing.exportBundleCode({ ...bundle, settings }); if (!result.ok) throw new Error(result.message); return result.code; },
    decodeBundleCode(text) { const result = h.$.HPColorsV3Sharing.importBundleCode(text); if (!result.ok) throw new Error(result.message); return result.bundle; },
  };
  b.onload(); h.$.HPColorsMenuToggle();
  const find = id => { const p = h.contextPanel.FindChildTraverse(id); assert.ok(p, id); return p; };
  const activate = id => { const fn = find(id).events.onactivate; assert.equal(typeof fn, 'function', id); fn(); };
  const shown = item => !find(itemId(item)).BHasClass('Gone');
  const reinclude = () => { runInVm(fs.readFileSync(path.join(sourceRoot, 'panorama/scripts/hp_colors_v3_menu.js'), 'utf8'), b.context); b.onload(); };
  return { b, h, find, activate, shown, commits, reinclude, bundle: () => copy(bundle), hydrate: value => { hydrated = value; } };
}

test('ticket 36: news.json holds the 3.7.0, 3.6.0, 3.5.0, 3.4.0, 3.3.0 and 3.2.0 items, each with a target row or page', () => {
  assert.equal(record.release, '3.7.0', 'the one release pin: the newest news group below is this release');
  const v370 = ['status-effect-sizes', 'hp-percent'];
  const v360 = ['kill-bounty', 'deferred-damage-color', 'status-effects'];
  const v350 = ['neutral-hp-number', 'colorblind-saved'];
  const v340 = ['colorblind-view', 'greyed-settings', 'feedback-window', 'ultimate-badge', 'neutral-camp-bars'];
  assert.deepEqual(news.map(item => item.id), [...v370, ...v360, ...v350, ...v340, 'team-name', 'team-colors', 'team-hp-number', 'team-stamina', 'low-stamina', 'ally-stamina', 'preview-team', 'old-shield-bar', 'icons-tab']);
  for (const item of news) {
    assert.equal(item.release, v370.includes(item.id) ? record.release : v360.includes(item.id) ? '3.6.0' : v350.includes(item.id) ? '3.5.0' : v340.includes(item.id) ? '3.4.0' : item.id === 'team-name' ? '3.3.0' : '3.2.0');
    assert.ok(['New', 'Updated'].includes(item.badge), item.id);
    assert.ok(item.targets.length || item.page, item.id + ' needs a target');
  }
  // The COLORBLIND tab has no schema rows; its item opens the page itself.
  assert.equal(news.find(item => item.id === 'colorblind-view').page, 'Colorblind');
});

test('ticket 36: NEW is the first tab but the menu still opens on Bar', () => {
  const m = menu();
  const pages = m.h.$.HPColorsV3Settings.menu.pages;
  assert.deepEqual(copy(pages.map(page => page.name)), require('../tools/lib/menu-markup').PAGES.map(page => page.name));
  assert.equal(m.find('HPColorsPageBar').BHasClass('Active'), true);
  assert.equal(m.find('HPColorsPageNew').BHasClass('Active'), false);
  assert.equal(m.find('HPColorsNavBarButton').BHasClass('Selected'), true);
  assert.equal(m.find('HPColorsPageTitle').text, 'BAR');
  assert.equal(m.find('HPColorsNavNewButton').BHasClass('HasNew'), true, 'the NEW tab is marked while items show');
  m.activate('HPColorsNavNewButton');
  assert.equal(m.find('HPColorsPageNew').BHasClass('Active'), true);
  assert.equal(m.find('HPColorsPageTitle').text, 'NEW');
  assert.equal(m.find('HPColorsResetPageButton').enabled, false, 'NEW has no settings to reset');
});

test('ticket 36: each item shows its icon kind, title, description, badge and version; its rows and tabs are marked', () => {
  const m = menu();
  const marked = new Set(news.flatMap(targetRows));
  for (const item of news) {
    const panel = m.find(itemId(item));
    assert.equal(m.shown(item), true, item.id);
    assert.equal(panel.BHasClass('Updated'), item.badge === 'Updated');
    const label = name => panel.FindChildrenWithClassTraverse(name)[0];
    assert.equal(label('HPC3NewTitle').text, item.title);
    assert.equal(label('HPC3NewDescription').text, item.description);
    assert.equal(label('HPC3NewBadge').text, item.badge.toUpperCase());
    assert.equal(label('HPC3NewVersion').text, 'v' + item.release);
    assert.ok(panel.FindChildrenWithClassTraverse('HPC3NewIcon').length === 1);
  }
  for (const id of marked) assert.equal(m.find(id).BHasClass('IsNew'), true, id);
  assert.equal(m.find('HPColorsBarColorLowEnemyRow').BHasClass('IsNew'), false, 'untargeted rows stay unmarked');
  const pages = new Set(news.map(pageOf));
  for (const page of m.h.$.HPColorsV3Settings.menu.pages.filter(page => page.name !== 'New'))
    assert.equal(m.find(page.navId).BHasClass('HasNew'), pages.has(page.name), page.name);
});

// User, 2026-10-21: the "!" also marks the sub-nav entry (group) under the page tab, as stock marks
// SettingsSubSectionNavigationButton.
test('ticket 36: sub-nav entries for groups with new settings carry the mark until dismissed', () => {
  const m = menu();
  const expected = new Set(news.flatMap(item => item.targets.map(target => {
    const row = schema.find(entry => entry.key === target.key);
    return 'HPColorsSubNav' + pascal(row.page) + pascal(row.group || 'General') + 'Button';
  })).filter(id => m.h.contextPanel.FindChildTraverse(id)));
  assert.ok(expected.has('HPColorsSubNavBarSharedColorsButton') && expected.has('HPColorsSubNavIndicatorsStaminaButton'));
  const buttons = m.h.contextPanel.FindChildrenWithClassTraverse('HPC3SubNavButton');
  for (const button of buttons) {
    assert.equal(button.BHasClass('HasNew'), expected.has(button.id), button.id);
    assert.equal(button.FindChildrenWithClassTraverse('HPC3SubNavNew').length, expected.has(button.id) ? 1 : 0, button.id + ' has the mark icon only where an item can show it');
  }
  m.activate(itemId(news.find(item => item.id === 'team-colors')) + 'DismissButton');
  assert.equal(m.find('HPColorsSubNavBarSharedColorsButton').BHasClass('HasNew'), false, 'dismissing its only item clears the entry');
  assert.equal(m.find('HPColorsSubNavIndicatorsStaminaButton').BHasClass('HasNew'), true);
  m.activate('HPColorsNewClearAllButton');
  for (const button of buttons) assert.equal(button.BHasClass('HasNew'), false, button.id);
});

test('ticket 36: activating an item opens its page and flashes its rows with an opacity-only highlight', () => {
  const m = menu();
  const item = news.find(entry => entry.id === 'low-stamina');
  m.activate('HPColorsNavNewButton');
  m.activate(itemId(item) + 'Button');
  assert.equal(m.find('HPColorsPageIndicators').BHasClass('Active'), true);
  for (const id of targetRows(item)) assert.equal(m.find(id).BHasClass('NewFlash'), true, id);
  m.h.scheduler.runFor(2000);
  for (const id of targetRows(item)) assert.equal(m.find(id).BHasClass('NewFlash'), false, id + ' flash ends');
  const preview = news.find(entry => entry.id === 'preview-team');
  m.activate('HPColorsNavNewButton'); m.activate(itemId(preview) + 'Button');
  assert.equal(m.find('HPColorsPage' + pascal(preview.page)).BHasClass('Active'), true, 'a page-only item opens its page');
  const colorblind = news.find(entry => entry.id === 'colorblind-view');
  m.activate('HPColorsNavNewButton'); m.activate(itemId(colorblind) + 'Button');
  assert.equal(m.find('HPColorsPageColorblind').BHasClass('Active'), true, 'the COLORBLIND item opens the row-less COLORBLIND tab');
});

// Live 2026-10-21 (user): clicking "Team colors" did not reach the Team colors card. The target page was
// collapsed under NEW, so Panorama had no layout for it in the click frame and the scroll did nothing.
// The mock models that: a row on a just-shown page reports no height until a later frame runs.
test('ticket 36: every item scrolls only after its page has a layout, and lands on its card', () => {
  for (const item of news.filter(entry => entry.targets.length)) {
    const m = menu();
    let frames = 0, phase = 'click';
    const runNext = m.h.scheduler.runNext.bind(m.h.scheduler);
    m.h.scheduler.runNext = () => { frames++; return runNext(); };
    const scrolled = [];
    for (const id of targetRows(item)) {
      const row = m.find(id);
      let shownAt = -1;
      Object.defineProperty(row, 'actuallayoutheight', { configurable: true, get() {
        const page = m.find('HPColorsPage' + pascal(pageOf(item)));
        if (!page.BHasClass('Active')) { shownAt = -1; return 0; }
        if (shownAt < 0) shownAt = frames;
        return frames > shownAt ? 52 : 0;
      } });
      row.ScrollParentToMakePanelFit = () => scrolled.push({ id, phase, height: row.actuallayoutheight });
    }
    m.activate('HPColorsNavNewButton');
    m.activate(itemId(item) + 'Button'); phase = 'later';
    m.h.scheduler.runFor(1000);
    assert.ok(scrolled.length >= 1, item.id + ' scrolls');
    assert.equal(new Set(scrolled.map(entry => entry.id)).size, 1, item.id + ' scrolls to one row');
    assert.ok(scrolled.every(entry => entry.phase === 'later'), item.id + ' does not scroll in the click frame');
    assert.ok(scrolled.every(entry => entry.height > 0), item.id + ' scrolls only after its row has a layout');
    assert.equal(m.find('HPColorsPage' + pascal(pageOf(item))).BHasClass('Active'), true);
    const row = m.find(scrolled[0].id);
    let card = row; while (card && !card.BHasClass('HPC3Card')) card = card.GetParent();
    assert.ok(card && card.BHasClass('Active'), item.id + ' selects the target card');
    for (let panel = row; panel && panel !== m.h.contextPanel; panel = panel.GetParent())
      assert.notEqual(computed(panel, 'visibility'), 'collapse', item.id + ' target visible: ' + (panel.id || panel.classes.join('.')));
  }
});

test('ticket 36: a pending scroll is dropped when the player switches page first', () => {
  const m = menu(), item = news.find(entry => entry.id === 'team-colors'), scrolled = [];
  for (const id of targetRows(item)) m.find(id).ScrollParentToMakePanelFit = () => scrolled.push(id);
  m.activate('HPColorsNavNewButton'); m.activate(itemId(item) + 'Button');
  m.activate('HPColorsNavUnitsButton'); m.h.scheduler.runFor(1000);
  assert.deepEqual(scrolled, []);
});

// Review: a mixed-side item opened from the Ally view must scroll to an Ally (or shared) row; the Enemy
// column is collapsed there, so scrolling to the item's first (Enemy) row would land on nothing.
// Live 2026-10-21 (normal debug be606c03): Team colors, Low stamina and Old shield bar stayed at the page
// top when their page had been shown before. A collapsed page keeps its rows' old heights, so the row
// "had a layout" in the first frame, the one scroll ran before the page was laid out again, and did
// nothing. Model: the row always reports its old height; only a scroll after the page's first frame lands.
test('ticket 39b: a row with an old height from an earlier visit still lands once its page is laid out again', () => {
  for (const item of news.filter(entry => entry.targets.length)) {
    const m = menu();
    let frames = 0, shownAt = -1, landed = null;
    const page = m.find('HPColorsPage' + pascal(pageOf(item)));
    const runNext = m.h.scheduler.runNext.bind(m.h.scheduler);
    m.h.scheduler.runNext = () => { frames++; if (page.BHasClass('Active') && shownAt < 0) shownAt = frames; if (!page.BHasClass('Active')) shownAt = -1; return runNext(); };
    const last = [];
    for (const id of targetRows(item)) {
      const row = m.find(id);
      Object.defineProperty(row, 'actuallayoutheight', { configurable: true, get: () => 52 });
      row.ScrollParentToMakePanelFit = () => { last.push(id); if (shownAt >= 0 && frames > shownAt + 1) landed = id; };
    }
    m.activate('HPColorsNavNewButton');
    m.activate(itemId(item) + 'Button');
    m.h.scheduler.runFor(1000);
    assert.ok(landed, item.id + ' scrolls again after its page is laid out');
    assert.equal(last.at(-1), landed, item.id + ' last scroll is the landed row');
  }
});

test('ticket 36: an item opened from the Ally view scrolls to a visible row on that side', () => {
  const m = menu();
  const item = news.find(entry => entry.id === 'low-stamina');
  const scrolled = [];
  for (const id of targetRows(item)) m.find(id).ScrollParentToMakePanelFit = () => scrolled.push(id);
  m.activate('HPColorsCardBarColorsSideAllyButton');
  assert.equal(m.find('HPColorsMenuHost').BHasClass('HPC3SideAlly'), true);
  m.activate('HPColorsNavNewButton'); m.activate(itemId(item) + 'Button'); m.h.scheduler.runFor(500);
  assert.equal(m.find('HPColorsMenuHost').BHasClass('HPC3SideAlly'), true, 'a mixed-side item keeps the current side');
  assert.ok(scrolled.length >= 1);
  assert.equal(new Set(scrolled).size, 1, 'one row');
  const target = m.find(scrolled[0]);
  assert.match(scrolled[0], /AllyRow$/);
  for (let panel = target; panel && panel !== m.h.contextPanel; panel = panel.GetParent())
    assert.notEqual(computed(panel, 'visibility'), 'collapse', 'scroll target is visible: ' + (panel.id || panel.classes.join('.')));
  m.activate('HPColorsCardBarColorsSideEnemyButton'); m.activate('HPColorsNavNewButton');
  scrolled.length = 0; m.activate(itemId(item) + 'Button'); m.h.scheduler.runFor(500);
  assert.match(scrolled[0], /EnemyRow$/, 'from the Enemy view it scrolls to the Enemy row');
});

test('ticket 36: X dismisses one item and saves it outside settings, Undo and stale ids; a reload keeps it gone', () => {
  const m = menu({ bundle: { newsDismissed: ['gone-from-an-older-release'] } });
  const item = news.find(entry => entry.id === 'low-stamina'), before = m.bundle().settings;
  m.activate(itemId(item) + 'DismissButton');
  assert.equal(m.shown(item), false);
  assert.deepEqual(m.bundle().newsDismissed, ['low-stamina'], 'only current ids are kept');
  assert.deepEqual(m.bundle().settings, before);
  assert.equal(m.commits.includes('settings'), false, 'dismissing is not a settings edit');
  assert.equal(m.find('HPColorsUndoButton').enabled, false, 'dismissing adds no Undo step');
  for (const id of targetRows(item)) {
    const stillTargeted = news.some(entry => entry !== item && targetRows(entry).includes(id));
    assert.equal(m.find(id).BHasClass('IsNew'), stillTargeted, id);
  }
  const again = menu({ bundle: m.bundle() });
  assert.equal(again.shown(item), false);
  assert.equal(again.shown(news[0]), true);
});

test('ticket 36: CLEAR ALL dismisses everything, leaving the empty note and no marks', () => {
  const m = menu();
  m.activate('HPColorsNewClearAllButton');
  assert.deepEqual([...m.bundle().newsDismissed].sort(), news.map(item => item.id).sort());
  for (const item of news) assert.equal(m.shown(item), false);
  assert.equal(m.find('HPColorsPageNew').BHasClass('NoNews'), true);
  for (const page of m.h.$.HPColorsV3Settings.menu.pages) assert.equal(m.find(page.navId).BHasClass('HasNew'), false, page.name);
  for (const id of news.flatMap(targetRows)) assert.equal(m.find(id).BHasClass('IsNew'), false, id);
});

test('ticket 36: items expire 30 days after their date; malformed saved dismissals are ignored', () => {
  const item = news[0];
  const late = menu({ now: dateOf(item) + 30 * DAY + 1 });
  assert.equal(late.shown(item), false);
  assert.equal(late.find('HPColorsPageNew').BHasClass('NoNews'), true);
  assert.equal(late.find('HPColorsNavNewButton').BHasClass('HasNew'), false);
  const recent = menu({ now: dateOf(item) + 29 * DAY, bundle: { newsDismissed: { 'team-colors': true } } });
  assert.equal(recent.shown(item), true);
  const many = menu({ bundle: { newsDismissed: Array.from({ length: 500 }, (_, i) => 'x' + i).concat([7, 'team-colors']) } });
  assert.equal(many.shown(item), true, 'an oversized list is ignored, not trusted');
});

test('ticket 36: bundle codes leave dismissals out and REPLACE ALL keeps the local ones', () => {
  const m = menu({ bundle: { newsDismissed: ['low-stamina'] } });
  m.activate('HPColorsBundleCopyButton');
  const code = m.find('HPColorsBundleCodeEntry').text;
  const decoded = m.h.$.HPColorsV3Sharing.importBundleCode(code);
  assert.equal(decoded.ok, true, decoded.message);
  assert.equal(Object.hasOwn(decoded.bundle, 'newsDismissed'), false, 'dismissals are personal, not shared');
  m.activate('HPColorsBundleReplaceButton'); m.activate('HPColorsBundleReplaceConfirmButton');
  assert.deepEqual(m.bundle().newsDismissed, ['low-stamina']);
});

test('ticket 36: before the store loads, X hides the item for this session and writes nothing', () => {
  const m = menu({ hydrated: false });
  m.activate(itemId(news[0]) + 'DismissButton');
  assert.equal(m.shown(news[0]), false);
  assert.equal(m.commits.length, 0);
});

// Audit (m1, 2026-10-21): script reinclusion during a flash left rows highlighted for good, and
// session-only dismissals came back after a reload in the same game session.
test('ticket 36: script reinclusion clears a running flash and keeps session-only dismissals', () => {
  const m = menu({ hydrated: false });
  const item = news.find(entry => entry.id === 'team-colors');
  m.activate('HPColorsNavNewButton'); m.activate(itemId(item) + 'Button');
  for (const id of targetRows(item)) assert.equal(m.find(id).BHasClass('NewFlash'), true);
  m.activate(itemId(news.find(entry => entry.id === 'low-stamina')) + 'DismissButton');
  m.reinclude(); m.h.scheduler.runFor(3000);
  for (const id of targetRows(item)) assert.equal(m.find(id).BHasClass('NewFlash'), false, id + ' flash cleared by retirement');
  assert.equal(m.shown(news.find(entry => entry.id === 'low-stamina')), false, 'a session dismissal survives reinclusion');
  assert.equal(m.commits.length, 0);
});

test('ticket 36: closing the menu or opening another item drops a pending scroll', () => {
  const m = menu(), team = news.find(entry => entry.id === 'team-colors'), low = news.find(entry => entry.id === 'low-stamina');
  const scrolled = [];
  for (const id of [...targetRows(team), ...targetRows(low)]) m.find(id).ScrollParentToMakePanelFit = () => scrolled.push(id);
  m.activate('HPColorsNavNewButton'); m.activate(itemId(team) + 'Button');
  m.h.$.HPColorsMenuToggle(); m.h.scheduler.runFor(1000);
  assert.deepEqual(scrolled, [], 'no scroll after close');
  m.h.$.HPColorsMenuToggle();
  m.activate('HPColorsNavNewButton'); m.activate(itemId(team) + 'Button');
  m.activate('HPColorsNavNewButton'); m.activate(itemId(low) + 'Button');
  m.h.scheduler.runFor(1000);
  assert.deepEqual([...new Set(scrolled)], ['HPColorsStaminaLowThresholdEnemyRow'], 'only the latest item scrolls');
});

test('ticket 36: dismissing moves focus to the next item, then to the NEW tab', () => {
  const m = menu();
  m.find(itemId(news[0]) + 'DismissButton').SetFocus = () => {};
  let focused = null;
  for (const item of news) m.find(itemId(item) + 'Button').SetFocus = () => { focused = itemId(item); };
  m.find('HPColorsNavNewButton').SetFocus = () => { focused = 'nav'; };
  m.activate(itemId(news[0]) + 'DismissButton');
  assert.equal(focused, itemId(news[1]));
  m.activate('HPColorsNewClearAllButton');
  assert.equal(focused, 'nav');
});

// Refactor review (m1): the saved list is cached from refreshPresets, which waits for a complete boot. A boot
// still retrying a missing control must already hide saved dismissals.
test('ticket 36: saved dismissals apply while the menu boot is still retrying a missing control', () => {
  const m = menu({ bundle: { newsDismissed: ['team-colors'] }, missing: 'HPColorsBarColorEnabledEnemyToggle' });
  assert.equal(m.shown(news.find(item => item.id === 'team-colors')), false);
  assert.equal(m.shown(news.find(item => item.id === 'low-stamina')), true);
});

test('ticket 36: search hides the NEW page like Presets', () => {
  const m = menu();
  m.find('HPColorsSearchField').text = 'amber'; m.find('HPColorsSearchField').events.ontextentrychange();
  assert.equal(m.find('HPColorsPageNew').BHasClass('SearchMiss'), true);
  assert.equal(m.find('HPColorsTeamAmberColorRow').BHasClass('SearchMiss'), false);
});

test('ticket 36: the generator refuses unknown targets, badges, sides, duplicate ids and bad dates', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-news-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cases = {
    'unknown setting': items => { items[0].targets[0].key = 'noSuchSetting'; },
    'side': items => { items[0].targets.push({ key: 'teamAmberColor', side: 'ally' }); },
    'badge': items => { items[0].badge = 'Hot'; },
    'duplicate': items => { items[1].id = items[0].id; },
    'date': items => { items[0].date = '2026-13-40'; },
    'target': items => { items[0].targets = []; delete items[0].page; },
    // Audit: a page that differs from the targets' page, or targets spread over pages, would open one page
    // and flash rows on another.
    'wrong page': items => { items[0].page = 'Units'; },
    'mixed pages': items => { items[0].targets.push({ key: 'staminaLowColor' }); },
    'unknown page': items => { items[0].page = 'Nowhere'; },
    'Presets page': items => { items[0].targets = []; items[0].page = 'Presets'; },
  };
  // Mutate a row-backed item first; 3.4.0 starts with the page-only COLORBLIND item.
  const rowItemFirst = () => { const items = copy(news), i = items.findIndex(item => item.id === 'team-name'); return [items[i], ...items.filter((_, j) => j !== i)]; };
  for (const [name, mutate] of Object.entries(cases)) {
    const items = rowItemFirst(); mutate(items);
    const file = path.join(dir, name + '.json'); fs.writeFileSync(file, JSON.stringify(items));
    const result = spawnSync(process.execPath, [path.join(root, 'tools/generate.js'), '--news', file, '--output-root', path.join(dir, name)], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, name);
    assert.match(result.stderr, /news\.json/, name);
    assert.equal(fs.existsSync(path.join(dir, name)), false, name + ' writes nothing');
  }
});
