'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadLayout } = require('./boot-layout');
const { computed } = require('./style-cascade');

function fixture() {
  const boot = loadLayout('hud_escape_menu.xml'), h = boot.harness;
  const find = id => { const panel = h.contextPanel.FindChildTraverse(id); assert.ok(panel, id); return panel; };
  const strip = find('HPColorsSupporterStrip'), urls = [], cursors = [];
  strip.SetURL = url => { urls.push(url); };
  strip.SetIgnoreCursor = value => { cursors.push(value); };
  boot.includeScripts();
  let api;
  h.$.HPColorsV3Store = { attach(value) { api = value; value.hydrateSettings(value.getSettings()); } };
  boot.onload();
  return { boot, h, find, strip, urls, cursors, api: () => api,
    toggle: () => h.$.HPColorsMenuToggle(), close: () => find('HPColorsCloseButton').events.onactivate() };
}

test('ticket 32: passive strip opens with a unique v3 URL only on menu open and blanks on close or retire', () => {
  const m = fixture(), { strip } = m, preview = m.find('HPColorsPreview');
  assert.equal(strip.paneltype, 'CitadelHTMLPanel');
  for (const attr of ['hittest', 'hittestchildren', 'acceptsfocus']) assert.equal(strip.GetAttributeString(attr, ''), 'false', attr);
  // User 2026-10-17: the strip sits under CREDITS/DONATE/version in the bottom stack.
  const bottom = m.find('HPColorsPreviewBottom'), children = preview.Children();
  assert.ok(strip.GetParent() === bottom); assert.ok(bottom.GetParent() === preview);
  assert.ok(children.indexOf(m.find('HPColorsPreviewNote')) < children.indexOf(bottom));
  assert.ok(bottom.Children().indexOf(m.find('HPColorsPreviewFooter')) < bottom.Children().indexOf(strip));
  assert.equal(computed(strip, 'width'), '100%'); assert.equal(computed(strip, 'height'), '36px');
  assert.equal(computed(strip, 'visibility'), 'collapse');
  assert.deepEqual(m.urls, [], 'closed boot and hydration never navigate');
  m.api().hydrateSettings(m.api().getSettings()); m.boot.onload();
  assert.deepEqual(m.urls, []);
  m.toggle();
  assert.match(m.urls[0], /^https:\/\/hantu-raya\.github\.io\/hp-colors-preset-builder\/supporters-strip-v3\/\?v=[^&]+$/);
  assert.deepEqual(m.cursors, [true]); assert.equal(computed(strip, 'visibility'), 'visible');
  m.boot.onload(); m.api().hydrateSettings(m.api().getSettings());
  assert.equal(m.urls.length, 1, 'hydration and repeated boot do not reload an open strip');
  m.close(); assert.equal(m.urls.at(-1), 'about:blank'); assert.equal(computed(strip, 'visibility'), 'collapse');
  m.toggle(); assert.notEqual(m.urls.at(-1), m.urls[0], 'even immediate reopens get a distinct query');
  m.h.$.HPColorsMenuCancel(); assert.equal(m.urls.at(-1), 'about:blank'); assert.equal(computed(strip, 'visibility'), 'collapse');
  m.toggle(); m.h.$.HPColorsMenuPublisher.retire();
  assert.equal(m.urls.at(-1), 'about:blank'); assert.equal(computed(strip, 'visibility'), 'collapse');
});

test('ticket 32: DONATE reuses CREDITS styling and dispatches only the exact Ko-fi URL without editing settings', () => {
  const m = fixture(); m.toggle();
  const donate = m.find('HPColorsPreviewDonateButton'), credits = m.find('HPColorsPreviewCreditsButton');
  assert.ok(donate.GetParent() === credits.GetParent());
  assert.equal(donate.Children()[0].text, 'DONATE');
  for (const property of ['margin', 'padding', 'verticalAlign']) assert.equal(computed(donate, property), computed(credits, property));
  assert.equal(computed(donate.Children()[0], 'fontSize'), '14px');
  const before = JSON.stringify(m.api().getSettings()), mark = m.h.dispatches.length;
  donate.events.onactivate();
  assert.deepEqual(m.h.dispatches.slice(mark), [['ExternalBrowserGoToURL', 'https://ko-fi.com/hantuaraya']]);
  assert.equal(JSON.stringify(m.api().getSettings()), before);
  assert.equal(m.find('HPColorsUndoButton').enabled, false);
  assert.equal(m.find('HPColorsPreviewVersion').text, 'v' + require('../settings/record.json').release);
  assert.equal(credits.Children()[0].text, 'CREDITS');
  const dispatch = m.h.$.DispatchEvent;
  m.h.$.DispatchEvent = undefined; assert.doesNotThrow(() => donate.events.onactivate());
  m.h.$.DispatchEvent = () => { throw new Error('external browser unavailable'); };
  assert.doesNotThrow(() => donate.events.onactivate());
  m.h.$.DispatchEvent = dispatch;
});

test('ticket 32: unavailable strip navigation is non-fatal and stays collapsed while the editor and DONATE work', () => {
  for (const navigate of [undefined, () => { throw new Error('page unavailable'); }, () => false]) {
    const m = fixture(); m.strip.SetURL = navigate;
    assert.doesNotThrow(m.toggle);
    assert.equal(m.find('HPColorsMenuHost').BHasClass('HPC3Open'), true);
    assert.equal(computed(m.strip, 'visibility'), 'collapse');
    const entry = m.find('HPColorsBarColorLowEnemyHex'); entry.text = '#123456'; entry.events.ontextentrysubmit();
    assert.equal(m.api().getSettings().side.enemy.barColorLow, '#123456');
    m.find('HPColorsPreviewDonateButton').events.onactivate();
    assert.deepEqual(m.h.dispatches.at(-1), ['ExternalBrowserGoToURL', 'https://ko-fi.com/hantuaraya']);
    assert.doesNotThrow(m.close); assert.doesNotThrow(() => m.h.$.HPColorsMenuPublisher.retire());
    assert.equal(computed(m.strip, 'visibility'), 'collapse');
  }
});

test('ticket 32: optional cursor APIs and failed blank navigation cannot break closing or retirement', () => {
  for (const ignore of [undefined, () => { throw new Error('cursor API unavailable'); }]) {
    const m = fixture(); m.strip.SetIgnoreCursor = ignore;
    assert.doesNotThrow(m.toggle); assert.equal(computed(m.strip, 'visibility'), 'visible');
    m.strip.SetURL = () => { throw new Error('CEF retired'); };
    assert.doesNotThrow(m.close); assert.equal(computed(m.strip, 'visibility'), 'collapse');
    assert.equal(m.find('HPColorsMenuHost').BHasClass('HPC3Open'), false);
    assert.doesNotThrow(() => m.h.$.HPColorsMenuPublisher.retire());
    assert.equal(computed(m.strip, 'visibility'), 'collapse');
  }
});

test('ticket 32: warm reinclusion blanks the retired strip before reopening only an already open editor', () => {
  const m = fixture(); m.toggle();
  const first = m.urls[0], oldDonate = m.find('HPColorsPreviewDonateButton').events.onactivate;
  m.boot.includeScripts();
  assert.equal(m.urls.at(-1), 'about:blank'); assert.equal(computed(m.strip, 'visibility'), 'collapse');
  const mark = m.h.dispatches.length; oldDonate(); assert.equal(m.h.dispatches.length, mark, 'retired callbacks cannot launch a browser');
  m.boot.onload();
  assert.match(m.urls.at(-1), /^https:\/\/hantu-raya\.github\.io\/hp-colors-preset-builder\/supporters-strip-v3\/\?v=/);
  assert.notEqual(m.urls.at(-1), first); assert.equal(computed(m.strip, 'visibility'), 'visible');
  m.close(); const loads = m.urls.filter(url => url !== 'about:blank').length;
  m.boot.includeScripts(); m.boot.onload(); m.api().hydrateSettings(m.api().getSettings());
  assert.equal(m.urls.filter(url => url !== 'about:blank').length, loads);
  assert.equal(computed(m.strip, 'visibility'), 'collapse');
});
