'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const vm = require('node:vm');
const test = require('node:test');
const { loadLayout, sourceRoot } = require('./boot-layout');
const PAGE_URL = 'https://hantu-raya.github.io/hpv2-store/';
const TITLE_LIMIT = 4096;
const vendorRoot = process.env.HPV3_STORE_VENDOR_ROOT || path.join(__dirname,'../vendor');
const pagePin = JSON.parse(fs.readFileSync(path.join(vendorRoot,'hpv2-store.pin.json'),'utf8'));
const pageSource = fs.readFileSync(path.join(vendorRoot,pagePin.file),'utf8').replace(/\r\n/g,'\n');
const pageHash = crypto.createHash('sha256').update(pageSource).digest('hex');
if (pageHash !== pagePin.sha256) throw new Error(`Pinned hosted page mismatch: expected=${pagePin.sha256} actual=${pageHash}`);
const CURRENT = 'hantu.hpcolors.v3/state';
const PREVIOUS = CURRENT + '.prev';
const evidenceRoot = path.resolve(process.env.HPV3_STORAGE_ARTIFACT_ROOT || path.join(__dirname, '../.build/evidence/storage', process.env.HPV3_DEBUG === '1' ? 'debug' : 'release'));
fs.mkdirSync(evidenceRoot, { recursive: true });
const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-storage-profiles-'));
test.after(() => fs.rmSync(profileRoot, { recursive: true, force: true }));
let profileSerial = 0;
const transcript = [];
// Live entries capture whole fixture VMs. After each test, replace them with plain evidence so a
// finished fixture can be collected (audit 20: migration peaked at 4.2 GB without this).
function snapshot(entry) {
  if (!entry.live) return entry;
  const status = entry.status(), page = JSON.parse(JSON.stringify({
    reads: entry.page.reads, writes: entry.page.writes, requests: entry.page.requests, replies: entry.page.replies }));
  return { page, status: () => status };
}
test.afterEach(() => { for (let i = 0; i < transcript.length; i++) transcript[i] = snapshot(transcript[i]); });
function profile(seed = {}) {
  const file = path.join(profileRoot, 'profile-' + process.pid + '-' + (++profileSerial) + '.json');
  const disk = new Map(Object.entries(seed));
  for (const method of ['set', 'delete']) {
    const original = disk[method].bind(disk);
    disk[method] = (...args) => { const result = original(...args); fs.writeFileSync(file, JSON.stringify(Object.fromEntries(disk))); return result; };
  }
  fs.writeFileSync(file, JSON.stringify(seed));
  return { disk, file, clock: 1790000000000 };
}
// The fake HTTPS page runs the real hosted script, not a protocol replica.
function installCefBridge(harness, profile, panel, options = {}) {
  const opts = Object.assign({
    commit: true,
    navLatencySec: 0.8,
    replyLatencySec: 0.05,
    echoLatencySec: 0.12,
    duplicateReplies: false,
    duplicateUrlEvents: false,
    quotaChars: Infinity,
    dropTitle: null,
    titleLimit: TITLE_LIMIT,
    deadUntilSec: 0,
    blankAtSec: null,
    failLoad: false,
    readyHref: null,
    // latest.json served to the page's same-origin fetch: { status, body, delaySec } or { error, delaySec }.
    // Omitted: the page context has no fetch at all.
    latest: null,
  }, options);
  const installedAt = harness.now;
  const stats = {
    navigations: 0, pageLoads: 0, reads: 0, writes: 0, deletes: 0,
    titles: [], urls: [], requests: [], replies: [], keyAccesses: [], fetches: [],
  };
  let page = null;
  let hashchange = null;

  function deliver(title) {
    let text = String(title);
    if (text.startsWith('HPV2S1:')) {
      const message = JSON.parse(text.slice(7));
      if (message.o === 'ready') {
        if (Object.hasOwn(opts, 'protocolVersion')) message.v = opts.protocolVersion;
        if (opts.readyHref !== null) message.h = opts.readyHref;
        if (opts.noVkeys) delete message.c;
        // An older hosted page: e.g. ['vkeys'] is the published page before compare-at-commit.
        if (opts.capabilities) message.c = opts.capabilities.slice();
      }
      if (opts.mutateReply) opts.mutateReply(message);
      stats.replies.push(message);
      text = `HPV2S1:${JSON.stringify(message)}`;
    }
    const cut = text.slice(0, opts.titleLimit);
    if (opts.dropTitle && opts.dropTitle(cut)) {
      stats.dropped = (stats.dropped || 0) + 1;
      return;
    }
    const fire = () => {
      stats.titles.push(cut.slice(0, 48));
      const handler = panel.events.HTMLTitle;
      if (typeof handler === 'function') handler(panel, cut);
    };
    harness.scheduler.schedule(opts.replyLatencySec, fire);
    if (opts.echoLatencySec !== null)
      harness.scheduler.schedule(opts.replyLatencySec + opts.echoLatencySec, fire);
    if (opts.duplicateReplies) harness.scheduler.schedule(opts.replyLatencySec, fire);
  }

  function usedChars(extraKey, extraValue) {
    let total = 0;
    for (const [key, value] of profile.disk) {
      if (key !== extraKey) total += key.length + value.length;
    }
    return total + extraKey.length + String(extraValue).length;
  }

  function urlEvent(href) {
    if (typeof panel.events.HTMLURLChanged !== 'function') return;
    panel.events.HTMLURLChanged(panel, href);
    if (opts.duplicateUrlEvents) panel.events.HTMLURLChanged(panel, href);
  }

  function observeRequest(href) {
    const message = JSON.parse(decodeURIComponent(new URL(href).hash.slice(1)));
    stats.requests.push(message);
    if (message.o === 'r') stats.reads += 1;
    if (message.o === 'w') stats.writes += 1;
    if (message.o === 'd') stats.deletes += 1;
  }

  // Promise-like value settled by the fake scheduler, so page callbacks run at simulated times.
  function settleLater(start) {
    let state = 'pending', value, waiting = [];
    const done = (next, result) => { if (state !== 'pending') return; state = next; value = result; waiting.splice(0).forEach(run => run()); };
    const promise = {
      then(onOk, onError) {
        return settleLater((resolve, reject) => {
          const run = () => {
            const handler = state === 'ok' ? onOk : onError;
            if (typeof handler !== 'function') return (state === 'ok' ? resolve : reject)(value);
            try {
              const result = handler(value);
              if (result && typeof result.then === 'function') result.then(resolve, reject); else resolve(result);
            } catch (error) { reject(error); }
          };
          if (state === 'pending') waiting.push(run); else run();
        });
      },
      catch(onError) { return promise.then(undefined, onError); },
    };
    start(result => done('ok', result), error => done('error', error));
    return promise;
  }
  function fetchLatest(url, init) {
    stats.fetches.push({ url: String(url), init: JSON.parse(JSON.stringify(init || {})) });
    const served = opts.latest;
    return settleLater((resolve, reject) => harness.scheduler.schedule(served.delaySec || 0, () => {
      if (served.error) return reject(new Error('network'));
      resolve({ ok: served.status >= 200 && served.status < 300, status: served.status,
        json: () => settleLater(done => done(JSON.parse(JSON.stringify(served.body)))) });
    }));
  }

  function commit(href) {
    stats.pageLoads += 1;
    const localStorage = {
      getItem: (key) => {
        stats.keyAccesses.push(key);
        return profile.disk.has(key) ? profile.disk.get(key) : null;
      },
      setItem: (key, value) => {
        stats.keyAccesses.push(key);
        if (usedChars(key, value) > opts.quotaChars) throw new Error('QuotaExceededError');
        profile.disk.set(key, String(value));
      },
      removeItem: (key) => { stats.keyAccesses.push(key); profile.disk.delete(key); },
    };
    const context = {
      JSON, Math, String, Number, decodeURIComponent, localStorage,
      ...(opts.latest ? { fetch: fetchLatest } : {}),
      location: { href, hash: new URL(href).hash },
      addEventListener: (event, callback) => { if (event === 'hashchange') hashchange = callback; },
      document: { set title(value) { deliver(value); } },
    };
    context.window = context;
    page = vm.createContext(context);
    urlEvent(href);
    observeRequest(href);
    vm.runInContext(pageSource, page, { filename: 'hpv2-store/index.html' });
  }

  if (opts.blankAtSec !== null)
    harness.scheduler.schedule(opts.blankAtSec, () => urlEvent('about:blank'));
  panel.SetURL = (url) => {
    const text = String(url);
    assert.ok(text.startsWith(`${PAGE_URL}#`), 'transport must use the hosted HTTPS page');
    stats.urls.push(text);
    if ((harness.now - installedAt) / 1000 < opts.deadUntilSec) {
      stats.dropped = (stats.dropped || 0) + 1;
      return;
    }
    if (page) {
      const previous = page.location.hash;
      page.location.href = text;
      page.location.hash = new URL(text).hash;
      urlEvent(text);
      if (previous !== page.location.hash) {
        observeRequest(text);
        hashchange();
      }
      return;
    }
    stats.navigations += 1;
    if (!opts.commit) return;
    harness.scheduler.schedule(opts.navLatencySec, () => {
      if (opts.failLoad) urlEvent('about:blank');
      else commit(text);
    });
  };
  stats.options = opts;
  stats.reloadPage = () => { page = null; hashchange = null; };
  return stats;
}


function launch(storeProfile, options = {}) {
  // Reopen the on-disk profile, not a process-local session map.
  storeProfile.disk.clear();
  for (const [key, value] of Object.entries(JSON.parse(fs.readFileSync(storeProfile.file)))) Map.prototype.set.call(storeProfile.disk, key, value);
  // options.boot: a variant lane's composed Escape menu with the same store page.
  const fixture = options.boot ? options.boot() : loadLayout('hud_escape_menu.xml');
  const panel = fixture.harness.contextPanel.FindChildTraverse('HPColorsV3StorePanel');
  assert.ok(panel, 'hidden store panel exists in the actual shipped layout');
  const page = installCefBridge(fixture.harness, storeProfile, panel, options);
  fixture.includeScripts(); fixture.onload();
  const result = {
    ...fixture, page,
    run(ms) { fixture.harness.scheduler.runFor(ms, 20000); },
    status() { return fixture.harness.contextPanel.FindChildTraverse('HPColorsSaveStatus').text; },
    settings() { return fixture.harness.$.HPColorsV3Store.getBundle().settings; },
    edit(color) {
      const row = fixture.harness.$.HPColorsV3Settings.controls.find(control => control.key === 'barColorLow' && control.side === 'enemy');
      const entry = fixture.harness.contextPanel.FindChildTraverse(row.hexId || row.id);
      entry.text = color; entry.events.ontextentrysubmit();
    },
    codec: fixture.harness.$.HPColorsV3Codec,
    reload(options = {}) {
      fixture.mount();
      const nextPage = installCefBridge(fixture.harness, storeProfile, fixture.harness.contextPanel.FindChildTraverse('HPColorsV3StorePanel'), options);
      fixture.onload();
      transcript.push({page:nextPage,status:()=>result.status(),live:true});
      return nextPage;
    },
  };
  transcript.push({ page, status: () => result.status(), live: true });
  return result;
}

module.exports = { profile, launch, installCefBridge, CURRENT, PREVIOUS, evidenceRoot, transcript };
