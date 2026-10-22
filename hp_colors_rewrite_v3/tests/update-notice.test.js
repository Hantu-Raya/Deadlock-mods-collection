'use strict';
// Update notice (ticket 33): the hosted storage page reads its own latest.json and answers an "lv"
// request from that copy; the menu warns once per game session when a newer release exists.
// Runs the real hosted page script and the real Escape-menu layout through the storage fixture.
const assert = require('node:assert/strict');
const test = require('node:test');
const { profile, launch } = require('./storage-fixture');
const RELEASE = require('../settings/record.json').release;

function open(options = {}) {
  const f = launch(profile(), options); f.run(2000);
  const h = f.harness, find = id => { const panel = h.contextPanel.FindChildTraverse(id); assert.ok(panel, id); return panel; };
  assert.equal(h.$.HPColorsV3Settings.release, RELEASE, 'the contract carries the release, separate from the wire version');
  const release = RELEASE;
  const shown = () => find('HPColorsUpdateDialog').BHasClass('Open');
  return { f, h, find, release, shown, toggle: () => h.$.HPColorsMenuToggle(), lv: () => f.page.requests.filter(r => r.o === 'lv') };
}
const bump = (release, part) => release.split('.').map((n, i) => i === part ? Number(n) + 1 : i > part ? 0 : Number(n)).join('.');
const lower = release => { const p = release.split('.').map(Number); for (let i = 2; i >= 0; i--) if (p[i] > 0) { p[i]--; return p.join('.'); } return null; };
const manifest = (body, extra = {}) => ({ latest: { status: 200, body, delaySec: 0.1, ...extra } });
const NORMAL_URL = 'https://gamebanana.com/mods/download/603113#FileInfo_1852662';
const QOLLOCK_URL = 'https://gamebanana.com/mods/download/603113#FileInfo_1852663';
const SHOWRANK_URL = 'https://gamebanana.com/mods/download/603113#FileInfo_1852664';
const links = (hpv3, extra = {}) => ({ hpv3: '99.0.0', download: { hpv3 }, ...extra });
// Records external-browser opens; DOWNLOAD must open only the validated GameBanana link.
function browser(h) {
  const opened = [], dispatch = h.$.DispatchEvent;
  h.$.DispatchEvent = (...args) => args[0] === 'ExternalBrowserGoToURL' ? (opened.push(args[1]), true) : dispatch(...args);
  return opened;
}
const { computed } = require('./style-cascade');
const downloadShown = m => computed(m.find('HPColorsUpdateDownloadButton'), 'visibility') !== 'collapse';

test('a newer release shows the update notice once per session after the menu settles; saves are untouched', () => {
  const latest = bump(RELEASE, 1), m = open(manifest({ hpv3: latest }));
  let focused = false; m.find('HPColorsUpdateCloseButton').SetFocus = () => { focused = true; };
  const writes = m.f.page.writes, before = JSON.stringify(m.f.settings());
  m.toggle(); m.f.run(200);
  assert.equal(m.shown(), false, 'not while the menu is still fading in');
  m.f.run(1000);
  assert.equal(m.shown(), true);
  const text = m.find('HPColorsUpdateText').text;
  assert.ok(text.includes('v' + latest) && text.includes('v' + RELEASE), text);
  assert.ok(focused, 'CLOSE takes focus');
  m.find('HPColorsUpdateCloseButton').events.onactivate();
  assert.equal(m.shown(), false);
  assert.equal(m.f.page.fetches.length, 1, 'one manifest fetch per page load');
  assert.match(m.f.page.fetches[0].url, /^\.\/latest\.json\?n=[0-9a-z]+$/);
  assert.deepEqual(m.f.page.fetches[0].init, { cache: 'no-store' });
  m.toggle(); m.f.run(500); m.toggle(); m.f.run(3000);
  assert.equal(m.shown(), false, 'shown once per session for that version');
  assert.equal(JSON.stringify(m.f.settings()), before);
  assert.equal(m.f.page.writes, writes, 'the check never writes storage');
});

test('equal, older, malformed, missing and failed manifests stay silent', () => {
  const release = RELEASE;
  for (const [name, options] of [
    ['equal', manifest({ hpv3: release })],
    ['older', manifest({ hpv3: lower(release) || '0.0.0' })],
    ['v-prefixed', manifest({ hpv3: 'v' + bump(release, 0) })],
    ['two parts', manifest({ hpv3: '99.0' })],
    ['number', manifest({ hpv3: 99 })],
    ['other mod only', manifest({ hpv2: '99.0.0' })],
    ['inherited key', manifest(JSON.parse('{"__proto__":{"hpv3":"99.0.0"}}'))],
    ['array', manifest(['99.0.0'])],
    ['404', { latest: { status: 404, body: { hpv3: '99.0.0' }, delaySec: 0.1 } }],
    ['network error', { latest: { error: true, delaySec: 0.1 } }],
    ['no fetch', {}],
  ]) {
    const m = open(options);
    m.toggle(); m.f.run(4000);
    assert.equal(m.shown(), false, name);
    assert.ok(m.lv().length >= 1, name + ': the check still asks the page');
  }
});

test('an old cached page without the latest capability is never asked and saving still works', () => {
  const m = open({ capabilities: ['vkeys', 'cas'], ...manifest({ hpv3: '99.0.0' }) });
  m.toggle(); m.f.run(4000);
  assert.equal(m.shown(), false);
  assert.deepEqual(m.lv(), []);
  const writes = m.f.page.writes;
  m.f.edit('#123456'); m.f.run(4000);
  assert.ok(m.f.page.writes > writes, 'saves are unaffected');
});

test('a manifest still loading when the menu opens is asked again and then shown', () => {
  const m = open({ latest: { status: 200, body: { hpv3: '99.0.0' }, delaySec: 3.5 } });
  m.toggle(); m.f.run(800);
  assert.equal(m.shown(), false);
  m.f.run(6000);
  assert.equal(m.shown(), true);
  assert.ok(m.lv().length >= 2, 'pending answers are retried');
});

test('the notice waits for open dialogs, closes with ESC and backdrop, and never outlives the menu', () => {
  const m = open(manifest({ hpv3: '99.0.0' }));
  m.toggle(); m.find('HPColorsPreviewCreditsButton').events.onactivate(); m.f.run(3000);
  assert.equal(m.shown(), false, 'does not interrupt an open dialog');
  m.find('HPColorsCreditsCloseButton').events.onactivate(); m.f.run(1500);
  assert.equal(m.shown(), true, 'appears once the dialog closes');
  assert.equal(m.h.$.HPColorsMenuCancel(), true);
  assert.equal(m.shown(), false, 'ESC closes the notice first');
  assert.ok(m.find('HPColorsMenuHost').BHasClass('HPC3Open'), 'and leaves the editor open');

  const b = open(manifest({ hpv3: '99.0.0' }));
  b.toggle(); b.f.run(100); b.toggle(); b.f.run(3000);
  assert.equal(b.shown(), false, 'closing the menu before the delay cancels the notice');
  b.toggle(); b.f.run(1500);
  assert.equal(b.shown(), true, 'the next open still shows it');
  b.find('HPColorsUpdateBackdrop').events.onactivate();
  assert.equal(b.shown(), false, 'backdrop closes it');

  const c = open(manifest({ hpv3: '99.0.0' }));
  c.toggle(); c.f.run(1500); assert.equal(c.shown(), true);
  c.toggle(); assert.equal(c.shown(), false, 'closing the menu closes the notice');
});

test('the page answers every title with exactly one request while the manifest loads', () => {
  const m = open({ latest: { status: 200, body: { hpv3: '99.0.0' }, delaySec: 1.2 } });
  m.toggle(); m.f.edit('#654321'); m.f.run(6000);
  assert.equal(m.f.page.replies.length, m.f.page.requests.length, 'no unsolicited title writes');
  for (const reply of m.f.page.replies.filter(r => r.o === 'lv')) {
    assert.deepEqual(Object.keys(reply).sort(), ['d', 'i', 'l', 'o', 'ok', 'q', 's']);
    assert.ok(reply.l === null || reply.l === '99.0.0');
    assert.equal(reply.d, null, 'no download links listed');
  }
});

test('DOWNLOAD opens the link latest.json lists for this build and closes the notice; saves are untouched', () => {
  const m = open(manifest(links({ normal: NORMAL_URL, qollock: QOLLOCK_URL, showrank: SHOWRANK_URL }))), opened = browser(m.h);
  const writes = m.f.page.writes, before = JSON.stringify(m.f.settings());
  m.toggle(); m.f.run(1500);
  assert.equal(m.shown(), true);
  assert.equal(downloadShown(m), true, 'DOWNLOAD is offered');
  assert.match(m.find('HPColorsUpdateText').text, /DOWNLOAD/);
  m.find('HPColorsUpdateDownloadButton').events.onactivate();
  assert.deepEqual(opened, [NORMAL_URL], 'the normal build opens the normal file, never the QOLLOCK or ShowRank one');
  assert.equal(m.shown(), false, 'the notice closes once the page opens');
  assert.equal(JSON.stringify(m.f.settings()), before);
  assert.equal(m.f.page.writes, writes);
});

test('missing, foreign or off-site download links hide DOWNLOAD and keep the text-only notice', () => {
  for (const [name, body] of [
    ['no download key', { hpv3: '99.0.0' }],
    ['other build only', links({ qollock: QOLLOCK_URL })],
    ['other builds only', links({ qollock: QOLLOCK_URL, showrank: SHOWRANK_URL })],
    ['other mod only', { hpv3: '99.0.0', download: { hpv2: { normal: NORMAL_URL } } }],
    ['plain http', links({ normal: 'http://gamebanana.com/mods/download/603113' })],
    ['lookalike host', links({ normal: 'https://gamebanana.com.evil.example/mods/1' })],
    ['userinfo host', links({ normal: 'https://gamebanana.com@evil.example/mods/1' })],
    ['script url', links({ normal: 'javascript:alert(1)' })],
    ['spaces', links({ normal: 'https://gamebanana.com/mods/1 x' })],
    ['too long', links({ normal: 'https://gamebanana.com/' + 'a'.repeat(300) })],
    ['number', links({ normal: 42 })],
    ['array', { hpv3: '99.0.0', download: { hpv3: [NORMAL_URL] } }],
    ['inherited', { hpv3: '99.0.0', download: JSON.parse('{"__proto__":{"hpv3":{"normal":"' + NORMAL_URL + '"}}}') }],
  ]) {
    const m = open(manifest(body)), opened = browser(m.h);
    m.toggle(); m.f.run(1500);
    assert.equal(m.shown(), true, name + ': the notice still shows');
    assert.equal(downloadShown(m), false, name + ': no DOWNLOAD');
    assert.match(m.find('HPColorsUpdateText').text, /mod page/, name);
    m.find('HPColorsUpdateDownloadButton').events.onactivate();
    assert.deepEqual(opened, [], name + ': nothing opens');
  }
});

test('the menu refuses an off-site link even when the page sends one', () => {
  // A tampered or future page reply: Panorama is the trust boundary for what it opens.
  for (const bad of ['https://evil.example/x', 'https://gamebanana.com.evil.example/x', 'javascript:alert(1)']) {
    const m = open({ ...manifest({ hpv3: '99.0.0' }), mutateReply: message => { if (message.o === 'lv') message.d = { normal: bad, qollock: bad }; } });
    const opened = browser(m.h);
    m.toggle(); m.f.run(1500);
    assert.equal(m.shown(), true, bad);
    assert.equal(downloadShown(m), false, bad);
    m.find('HPColorsUpdateDownloadButton').events.onactivate();
    assert.deepEqual(opened, [], bad);
  }
});
