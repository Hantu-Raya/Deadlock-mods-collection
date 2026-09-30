'use strict';

// End-to-end durable save checks for HP Colors Rewrite v2.
//
// Each "launch" boots the shipped contract, state, storage, menu, and renderer
// sources in Panorama VM mocks. The hidden CitadelHTMLPanel is replaced by a
// fake Steam CEF page: SetURL("file://") commits a document and raises its
// title, SetURL("javascript:...") percent-decodes and runs the code against a
// localStorage backed by a disk Map, and every title change arrives later as
// an HTMLTitle panel event. The disk Map outlives a launch, so a new launch is
// a game restart and a launch that copies root attributes is a layout reload
// inside one game process.
//
// Writes a JSON transcript of every launch to .tmp/hpv2-storage-e2e.json (or
// HPV2_STORAGE_ARTIFACT) so a run can be inspected and repeated.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const {
  MockPanel,
  createPanoramaHarness,
  createVmContext,
  installTopBarIdentityTree,
  runHpColorsSourcesInVm,
  runInVm,
} = require('./hp-colors-panorama-test-adapter');

const repoRoot = path.resolve(__dirname, '..');
const rewriteRoot = process.env.HP_COLORS_REWRITE_SOURCE_ROOT
  ? path.resolve(process.env.HP_COLORS_REWRITE_SOURCE_ROOT)
  : path.join(repoRoot, 'hp_colors_rewrite_v2');
const read = (relative) => fs.readFileSync(path.join(rewriteRoot, relative), 'utf8');
const layoutSource = read('panorama/layout/hud_escape_menu.xml');
const contractSource = read('panorama/scripts/hp_colors_v2_contract.js');
const stateSource = read('panorama/scripts/hp_colors_v2_state.js');
const storageSource = read('panorama/scripts/hp_colors_v2_storage.js');
const menuSource = read('panorama/scripts/hp_colors_v2_menu.js');
const rendererSource = read('panorama/scripts/unit_status_v2_colors.js');

const KEY_CURRENT = 'hantu.hpcolors.v2/state';
const KEY_PREVIOUS = 'hantu.hpcolors.v2/state.prev';
const THIRD_EYE_KEYS = {
  'te|file://|config': '[TE-ALPHA-6@1790292771000z]:eyJhIjoxfQ',
  'te|file://|build_at_cache': 'MTc5MDI5Mjc3MTAwMHo',
  qollock_settings: '{"ql":true,"%":"%41"}',
};
const PROCESS_ATTRS = [
  'hp_colors_v2_menu_state',
  'hp_colors_v2_config',
  'hp_colors_v2_store_status',
  'hp_colors_v2_store_ack',
  'hp_colors_v2_hydration',
];
const TITLE_LIMIT = 4096;
const DEFAULT_WIDTH = 100;

const transcript = [];

function createProfile(seed = {}) {
  const disk = new Map(Object.entries(Object.assign({}, THIRD_EYE_KEYS, seed)));
  return { disk, clock: 1_790_000_000_000 };
}

// The fake Steam page behind the hidden CitadelHTMLPanel.
function installCefBridge(harness, profile, panel, options = {}) {
  const opts = Object.assign({
    commit: true,
    navLatencySec: 0.8,
    replyLatencySec: 0.05,
    // Live Deadlock delivers each HTMLTitle twice (console.log 2026-09-26:
    // the echoed "Index of /" arrived after readiness and broke the first
    // read). The echo lands after the page has already answered.
    echoLatencySec: 0.12,
    duplicateReplies: false,
    quotaChars: Infinity,
    // (title) => true drops that title and its echo, like a lost HTMLTitle.
    dropTitle: null,
    // Titles longer than this arrive cut short, like a capped title channel.
    titleLimit: TITLE_LIMIT,
    // Seconds after navigation when the panel's about:blank placeholder
    // raises its own title before file:// commits (live console.log
    // 2026-09-26 05:36/05:43: "ready" from it, then every read unanswered).
    placeholderSec: null,
    // Live console.log 2026-09-26 06:18: a script sent while file:// was
    // still loading aborted the load and the panel landed on http://error/.
    abortLoadOnScript: true,
    // The first N loads end at http://error/ on their own.
    failNavigations: 0,
    // Loads of this exact address always end on http://error/.
    failUrl: null,
    // Each HTMLURLChanged also arrives twice, like HTMLTitle.
    duplicateUrlEvents: false,
    // The first load reports http://error/ this long before it commits file:.
    strayErrorSec: null,
  }, options);
  const stats = { navigations: 0, reads: 0, writes: 0, deletes: 0, titles: [], urls: [] };
  let page = null;

  function deliver(title) {
    const cut = String(title).slice(0, opts.titleLimit);
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
      if (key === extraKey) continue;
      total += key.length + value.length;
    }
    return total + (extraKey ? extraKey.length + String(extraValue).length : 0);
  }

  function newPage(href = 'file:///') {
    const denied = () => { throw new Error('Access is denied for this document.'); };
    const localStorage = href.startsWith('file:') ? {
      getItem: (key) => (profile.disk.has(key) ? profile.disk.get(key) : null),
      setItem: (key, value) => {
        if (usedChars(key, value) > opts.quotaChars) throw new Error('QuotaExceededError');
        profile.disk.set(key, String(value));
      },
      removeItem: (key) => { profile.disk.delete(key); },
    } : { getItem: denied, setItem: denied, removeItem: denied };
    const context = { JSON, Math, String, localStorage, location: { href } };
    context.window = context;
    context.document = {
      set title(value) { deliver(value); },
      get title() { return ''; },
    };
    return vm.createContext(context);
  }

  let loading = null;
  function commit(href, title) {
    page = newPage(href);
    if (typeof panel.events.HTMLURLChanged === 'function') {
      panel.events.HTMLURLChanged(panel, href);
      if (opts.duplicateUrlEvents) panel.events.HTMLURLChanged(panel, href);
    }
    deliver(title);
  }

  panel.SetURL = (url) => {
    const text = String(url);
    if (text.startsWith('javascript:')) {
      if (loading && opts.abortLoadOnScript) {
        harness.scheduler.cancel(loading);
        loading = null;
        stats.aborted = (stats.aborted || 0) + 1;
        harness.scheduler.schedule(0.05, () => commit('http://error/', 'http://error/'));
      }
      if (!page) return;
      const code = decodeURIComponent(text.slice('javascript:'.length));
      if (code.includes('__hpv2s.r(')) stats.reads += 1;
      if (code.includes('__hpv2s.w(')) stats.writes += 1;
      if (code.includes('__hpv2s.d(')) stats.deletes += 1;
      vm.runInContext(code, page);
      return;
    }
    stats.navigations += 1;
    stats.urls.push(text);
    page = null;
    if (opts.placeholderSec !== null)
      harness.scheduler.schedule(opts.placeholderSec, () => commit('about:blank', 'about:blank'));
    if (!opts.commit) return;
    if (opts.strayErrorSec !== null && stats.navigations === 1)
      harness.scheduler.schedule(opts.strayErrorSec, () => panel.events.HTMLURLChanged(panel, 'http://error/'));
    const failed = stats.navigations <= opts.failNavigations || text === opts.failUrl;
    loading = harness.scheduler.schedule(opts.navLatencySec, () => {
      loading = null;
      if (failed) commit('http://error/', 'http://error/');
      else commit(text === 'file://' ? 'file:///' : text, 'Index of /');
    });
  };
  return stats;
}

function installLayoutPanels(harness, layout) {
  const ids = new Set(Array.from(layout.matchAll(/\bid="([^"]+)"/g), (match) => match[1]));
  for (const id of ids) {
    if (harness.root.FindChildTraverse(id)) continue;
    harness.root.add(new MockPanel(id, {
      findCounts: harness.findCounts,
      childReadCounts: harness.childReadCounts,
    }));
  }
  const shape = harness.root.FindChildTraverse('HPColorsStaminaShape');
  if (shape) for (const option of ['arrow', 'circle', 'box'])
    shape.AddOption(harness.root.FindChildTraverse(option));
}

function launch(profile, options = {}) {
  const harness = createPanoramaHarness({ now: profile.clock });
  installLayoutPanels(harness, options.layout || layoutSource);
  const identityTree = installTopBarIdentityTree(harness, { heroName: 'SHIV', gameTime: '00:01' });
  for (const [key, value] of Object.entries(options.rootAttrs || {}))
    harness.root.SetAttributeString(key, value);
  const storePanel = harness.root.FindChildTraverse('HPColorsV2Store');
  const bridge = storePanel
    ? installCefBridge(harness, profile, storePanel, options.bridge)
    : null;

  // The unit-status context loads first: the worst case for a defaults flash.
  const rendererContext = createVmContext(harness);
  runInVm(contractSource, rendererContext, 'renderer_contract.js');
  runInVm(rendererSource, rendererContext, 'unit_status_v2_colors.js');

  const scripts = options.omitStorageScript ? stateSource : `${stateSource}\n;${storageSource}`;
  runHpColorsSourcesInVm(scripts, menuSource, harness, { settingsContractSource: contractSource });
  harness.$.HPColorsMenuBoot();

  const fixture = {
    harness,
    bridge,
    identityTree,
    status: () => panelById(harness, 'HPColorsLiveStatus').GetAttributeString('hp_colors_store_status', ''),
    chip: () => panelById(harness, 'HPColorsLiveStatus').text,
    renderer: () => harness.root.HPV2GetNormalizedConfig(),
    attr: (name) => harness.root.GetAttributeString(name, ''),
    run(ms) {
      harness.scheduler.runFor(ms, 20000);
      profile.clock = harness.now;
    },
    processAttrs() {
      const attrs = {};
      for (const name of PROCESS_ATTRS) attrs[name] = harness.root.GetAttributeString(name, '');
      return attrs;
    },
  };
  transcript.push({ launch: transcript.length + 1, label: options.label || '', startedAt: profile.clock });
  return fixture;
}

function record(fixture, extra = {}) {
  const entry = transcript[transcript.length - 1];
  Object.assign(entry, {
    status: fixture.status(),
    storeStatus: fixture.attr('hp_colors_v2_store_status'),
    hydration: fixture.attr('hp_colors_v2_hydration'),
    bridge: fixture.bridge
      ? {
        navigations: fixture.bridge.navigations,
        reads: fixture.bridge.reads,
        writes: fixture.bridge.writes,
        deletes: fixture.bridge.deletes,
      }
      : null,
    logs: fixture.harness.logs.filter((line) => line.includes('[store]')),
  }, extra);
}

function panelById(harness, id) {
  const found = harness.root.FindChildTraverse(id);
  assert.ok(found, `expected ${id} panel`);
  return found;
}

function openEditor(fixture) {
  panelById(fixture.harness, 'HPColorsMenuButton').events.onactivate();
  assert.equal(panelById(fixture.harness, 'HPColorsEditorRoot').BHasClass('Open'), true);
}

function closeEditor(fixture) {
  panelById(fixture.harness, 'HPColorsDoneButton').events.onactivate();
}

function setWidth(fixture, value) {
  const slider = panelById(fixture.harness, 'HPColorsWidthSlider');
  slider.value = value;
  slider.events.onvaluechanged();
}

function createPreset(fixture, name) {
  panelById(fixture.harness, 'HPColorsPresetNewButton').events.onactivate();
  panelById(fixture.harness, 'HPColorsPresetNameInput').text = name;
  panelById(fixture.harness, 'HPColorsPresetSaveButton').events.onactivate();
}

function menuState(fixture) {
  return JSON.parse(fixture.attr('hp_colors_v2_menu_state') || '{}');
}

function storedRecord(profile, key = KEY_CURRENT) {
  const factory = loadStorageCodec();
  return factory.codec.classifyRecord(profile.disk.has(key) ? profile.disk.get(key) : null);
}

let codecFactory = null;
function loadStorageCodec() {
  if (codecFactory) return codecFactory;
  const $ = { Msg() {} };
  vm.runInContext(storageSource, vm.createContext({ $, Math, JSON, Number, String, Date }));
  codecFactory = $.HPColorsV2StorageFactory;
  return codecFactory;
}

// The width the editor shows: the Current scope once one exists, else base.
function storedEditedWidth(profile) {
  const body = JSON.parse(storedRecord(profile).body);
  const current = (body.scopes || []).find((scope) => scope.id === 'scope_current');
  return (current || body).values.widthScale;
}

function assertOtherModsUntouched(profile) {
  for (const [key, value] of Object.entries(THIRD_EYE_KEYS))
    assert.equal(profile.disk.get(key), value, `${key} must stay byte-identical`);
}

function savedBody(values) {
  return JSON.stringify({ version: 1, values, conditions: {}, scopes: [], userPresets: [] });
}

test.after(() => {
  const artifact = process.env.HPV2_STORAGE_ARTIFACT
    || path.join(repoRoot, '.tmp', 'hpv2-storage-e2e.json');
  fs.mkdirSync(path.dirname(artifact), { recursive: true });
  fs.writeFileSync(artifact, `${JSON.stringify(transcript, null, 2)}\n`, 'utf8');
});

test('first launch saves, and a restart restores settings and presets without a defaults flash', () => {
  const profile = createProfile();
  const first = launch(profile, { label: 'first run' });

  assert.equal(first.renderer().enabled, false, 'bars stay stock while the store is read');
  assert.equal(first.status(), 'LOADING');
  first.run(2000);
  assert.equal(first.attr('hp_colors_v2_store_status'), 'ok');
  assert.equal(first.renderer().enabled, true);
  assert.equal(first.renderer().widthScale, DEFAULT_WIDTH);

  openEditor(first);
  setWidth(first, 180);
  createPreset(first, 'Haze é%20 ✓');
  closeEditor(first);
  assert.equal(first.status(), 'SAVING ON THIS PC...');
  first.run(2000);
  assert.equal(first.status(), 'SAVED ON THIS PC');
  const saved = storedRecord(profile);
  assert.equal(saved.kind, 'valid');
  assert.equal(JSON.parse(saved.body).values.widthScale, 180);
  assert.equal('effectiveRevision' in JSON.parse(saved.body), false);
  record(first);

  const second = launch(profile, { label: 'restart' });
  assert.equal(second.renderer().enabled, false);
  second.run(4000);
  assert.equal(second.renderer().enabled, true);
  assert.equal(second.renderer().widthScale, 180, 'renderer receives the restored value');
  assert.equal(menuState(second).values.widthScale, 180);
  assert.deepEqual(
    menuState(second).userPresets.map((preset) => preset.name),
    ['Haze é%20 ✓'],
  );
  assert.equal(second.status(), 'SAVED ON THIS PC');
  record(second);

  // Hero routing may add its Current scope once after a restore; after that
  // the restored state is steady and a further restart writes nothing.
  const third = launch(profile, { label: 'steady restart' });
  third.run(6000);
  assert.equal(third.renderer().widthScale, 180);
  assert.equal(third.bridge.writes, 0, 'an unchanged restored state is not rewritten');
  record(third);
  assertOtherModsUntouched(profile);
});

test('a restore slower than five seconds keeps bars stock until it lands', () => {
  // Settings plus several presets from a real session behind a slow page.
  const profile = createProfile();
  const seed = launch(profile, { label: 'slow seed' });
  seed.run(2000);
  openEditor(seed);
  setWidth(seed, 150);
  for (let index = 1; index <= 4; index += 1) createPreset(seed, `Preset ${index}`);
  closeEditor(seed);
  seed.run(6000);
  const record0 = profile.disk.get(KEY_CURRENT);

  const slow = launch(profile, {
    label: 'slow restore',
    bridge: { navLatencySec: 3, replyLatencySec: 1.4 },
  });
  const startedAt = slow.harness.now;
  let restoredAt = 0;
  for (let elapsed = 0; elapsed < 30000 && !restoredAt; elapsed += 250) {
    slow.run(250);
    if (slow.attr('hp_colors_v2_hydration') === 'done') {
      restoredAt = slow.harness.now - startedAt;
      break;
    }
    assert.equal(slow.renderer().enabled, false, `stock at ${elapsed + 250}ms`);
  }
  assert.ok(restoredAt > 5000, `restore took ${restoredAt}ms, longer than five seconds`);
  slow.run(1500);
  assert.equal(slow.renderer().enabled, true);
  assert.equal(slow.renderer().widthScale, 150);
  assert.equal(menuState(slow).userPresets.length, 4);
  record(slow, { restoredAtMs: restoredAt, recordChars: record0.length });
});

test('a corrupt current record restores from the backup and never overwrites it', () => {
  const factory = loadStorageCodec();
  const backup = factory.codec.encodeRecord(savedBody({ widthScale: 140 }), 1);
  const profile = createProfile({
    [KEY_CURRENT]: 'HPV2S1.00000000.corrupted',
    [KEY_PREVIOUS]: backup,
  });
  const fixture = launch(profile, { label: 'corrupt current' });
  fixture.run(3000);
  assert.equal(fixture.renderer().widthScale, 140);
  assert.equal(fixture.status(), 'SAVED ON THIS PC');
  assert.equal(profile.disk.get(KEY_PREVIOUS), backup, 'a corrupt record is never rotated over the backup');

  openEditor(fixture);
  setWidth(fixture, 160);
  closeEditor(fixture);
  fixture.run(2000);
  assert.equal(JSON.parse(storedRecord(profile).body).values.widthScale, 160);
  assert.equal(
    JSON.parse(storedRecord(profile, KEY_PREVIOUS).body).values.widthScale,
    140,
    'the previous valid save becomes the backup',
  );
  record(fixture);
});

test('unreadable or future-schema saves stay read-only and are never replaced by defaults', () => {
  for (const [label, current] of [
    ['both corrupt', 'HPV2S1.zzzz.bad'],
    ['future schema', (() => {
      const payload = Buffer.from(JSON.stringify({ m: 'HPV2STORE', s: 9, t: 1, b: '{}' }))
        .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      return `HPV2S1.${loadStorageCodec().codec.checksum(payload)}.${payload}`;
    })()],
  ]) {
    const profile = createProfile({ [KEY_CURRENT]: current });
    const fixture = launch(profile, { label });
    fixture.run(3000);
    assert.equal(fixture.status(), 'SAVE UNAVAILABLE', label);
    assert.equal(fixture.attr('hp_colors_v2_store_status'), 'blocked');
    assert.equal(fixture.renderer().enabled, true, 'gameplay continues on defaults');

    openEditor(fixture);
    setWidth(fixture, 190);
    closeEditor(fixture);
    fixture.run(3000);
    assert.equal(fixture.bridge.writes, 0, `${label}: nothing is written`);
    assert.equal(profile.disk.get(KEY_CURRENT), current, `${label}: stored bytes are preserved`);
    record(fixture);
  }
});

test('a bridge that never becomes ready boots on defaults without writing', () => {
  const profile = createProfile();
  const fixture = launch(profile, { label: 'no page commit', bridge: { commit: false } });
  fixture.run(45000);
  assert.equal(fixture.status(), 'SAVE UNAVAILABLE');
  assert.equal(fixture.renderer().enabled, true);
  assert.equal(fixture.renderer().widthScale, DEFAULT_WIDTH);
  openEditor(fixture);
  setWidth(fixture, 120);
  closeEditor(fixture);
  fixture.run(3000);
  assert.equal(profile.disk.has(KEY_CURRENT), false);
  record(fixture);
});

test('Forget clears only v2 keys, keeps live settings, and saves again after the next edit', () => {
  const profile = createProfile();
  const fixture = launch(profile, { label: 'forget' });
  fixture.run(2000);
  openEditor(fixture);
  setWidth(fixture, 170);
  fixture.run(2000);
  setWidth(fixture, 175);
  fixture.run(2000);
  assert.equal(profile.disk.has(KEY_CURRENT), true);
  assert.equal(profile.disk.has(KEY_PREVIOUS), true);

  const forget = panelById(fixture.harness, 'HPColorsStoreForgetButton');
  forget.events.onactivate();
  assert.equal(panelById(fixture.harness, 'HPColorsStoreForgetLabel').text, 'CONFIRM CLEAR');
  forget.events.onactivate();
  fixture.run(2000);
  assert.equal(profile.disk.has(KEY_CURRENT), false);
  assert.equal(profile.disk.has(KEY_PREVIOUS), false);
  assertOtherModsUntouched(profile);
  assert.equal(fixture.renderer().widthScale, 175, 'live settings stay');
  assert.equal(fixture.status(), 'SAVE CLEARED');

  closeEditor(fixture);
  fixture.run(3000);
  assert.equal(profile.disk.has(KEY_CURRENT), false, 'closing without an edit does not resave');

  const reload = launch(profile, {
    label: 'forget warm reload',
    rootAttrs: fixture.processAttrs(),
  });
  reload.run(3000);
  assert.equal(reload.status(), 'SAVE CLEARED');
  assert.equal(profile.disk.has(KEY_CURRENT), false, 'a layout reload does not resurrect the save');
  openEditor(reload);
  setWidth(reload, 110);
  closeEditor(reload);
  reload.run(2000);
  assert.equal(JSON.parse(storedRecord(profile).body).values.widthScale, 110);
  record(reload);
});

test('a warm layout reload keeps the session, skips the read, and still saves edits', () => {
  const profile = createProfile();
  const first = launch(profile, { label: 'warm source' });
  first.run(2000);
  openEditor(first);
  setWidth(first, 130);
  closeEditor(first);
  first.run(2000);

  const reload = launch(profile, { label: 'warm reload', rootAttrs: first.processAttrs() });
  reload.run(2000);
  assert.equal(reload.bridge.reads, 0, 'process evidence replaces a second read');
  assert.equal(menuState(reload).values.widthScale, 130);
  openEditor(reload);
  setWidth(reload, 135);
  closeEditor(reload);
  reload.run(2000);
  assert.equal(JSON.parse(storedRecord(profile).body).values.widthScale, 135);
  record(reload);
});

test('an old builder pak01 layout still boots and tells the player to delete it', () => {
  const legacyLayout = layoutSource
    .replace(/\s*<Panel id="HPColorsV2StoreWrap"[\s\S]*?<\/Panel>/, '\n    <Panel id="HPColorsRewritePresetStore" />')
    .replace(/\s*<include src="s2r:\/\/panorama\/scripts\/hp_colors_v2_storage\.vjs_c" \/>/, '');
  const profile = createProfile();
  const fixture = launch(profile, {
    label: 'stale pak01 layout',
    layout: legacyLayout,
    omitStorageScript: true,
  });
  fixture.run(4000);
  assert.equal(fixture.status(), 'OLD PRESET VPK');
  assert.equal(fixture.renderer().enabled, true);
  openEditor(fixture);
  assert.ok(fixture.harness.logs.some((line) => line.includes('delete pak01_dir.vpk')));
  record(fixture);
});

test('duplicate replies, quota exhaustion, and oversize saves fail safely', () => {
  const duplicateProfile = createProfile();
  const duplicated = launch(duplicateProfile, {
    label: 'duplicate titles',
    bridge: { duplicateReplies: true },
  });
  duplicated.run(2000);
  openEditor(duplicated);
  setWidth(duplicated, 125);
  closeEditor(duplicated);
  duplicated.run(2000);
  assert.equal(JSON.parse(storedRecord(duplicateProfile).body).values.widthScale, 125);
  record(duplicated);

  const fullProfile = createProfile();
  const full = launch(fullProfile, { label: 'quota exhausted', bridge: { quotaChars: 400 } });
  full.run(2000);
  openEditor(full);
  setWidth(full, 140);
  full.run(2000);
  // Audit finding 4: the first failure used to read SAVED with nothing stored.
  assert.equal(full.status(), 'SAVE RETRYING');
  const writesAfterFirstFailure = full.bridge.writes;
  full.run(20000);
  assert.ok(full.bridge.writes > writesAfterFirstFailure, 'failed saves retry without another edit');
  assert.equal(full.status(), 'SAVE UNAVAILABLE');
  assert.equal(fullProfile.disk.has(KEY_CURRENT), false);
  assertOtherModsUntouched(fullProfile);
  record(full);

  const factory = loadStorageCodec();
  const panel = { IsValid: () => true, SetURL() {} };
  const results = [];
  const storage = factory.create({
    panel,
    schedule: () => null,
    cancel: () => {},
    now: () => 1,
    log: () => {},
  });
  storage.save('x'.repeat(factory.limits.chunkChars * factory.limits.maxChunks), (result) => results.push(result));
  assert.equal(JSON.stringify(results), JSON.stringify([{ ok: false, error: 'too_large' }]));
});

// A lost reply fails the request; the editor's save retry is the only retry.
function dropFirst(predicate, count = 1) {
  let left = count;
  return (title) => {
    if (left > 0 && predicate(title)) {
      left -= 1;
      return true;
    }
    return false;
  };
}

test('a lost first read is asked once more, and the save loads', () => {
  const factory = loadStorageCodec();
  const profile = createProfile({
    [KEY_CURRENT]: factory.codec.encodeRecord(savedBody({ widthScale: 145 }), 1),
  });
  const fixture = launch(profile, {
    label: 'lost first read reply',
    bridge: { dropTitle: dropFirst((title) => title.includes('"o":"r"')) },
  });
  fixture.run(20000);
  assert.equal(fixture.renderer().widthScale, 145);
  assert.equal(fixture.status(), 'SAVED ON THIS PC');
  assert.match(fixture.harness.logs.join('\n'), /no reply to read part 0/);
  record(fixture);
});

test('two lost reads block saving and keep the stored record', () => {
  const factory = loadStorageCodec();
  const record0 = factory.codec.encodeRecord(savedBody({ widthScale: 145 }), 1);
  const profile = createProfile({ [KEY_CURRENT]: record0 });
  const fixture = launch(profile, {
    label: 'read replies lost twice',
    bridge: { dropTitle: dropFirst((title) => title.includes('"o":"r"'), 2) },
  });
  fixture.run(20000);
  assert.equal(fixture.status(), 'SAVE UNAVAILABLE');
  openEditor(fixture);
  setWidth(fixture, 190);
  closeEditor(fixture);
  fixture.run(8000);
  assert.equal(fixture.bridge.writes, 0);
  assert.equal(profile.disk.get(KEY_CURRENT), record0);
  record(fixture);
});

test('a lost save acknowledgement is retried by the editor without rotating the backup twice', () => {
  const factory = loadStorageCodec();
  const profile = createProfile({
    [KEY_CURRENT]: factory.codec.encodeRecord(savedBody({ widthScale: 120 }), 1),
  });
  const fixture = launch(profile, {
    label: 'lost write ack',
    bridge: { dropTitle: dropFirst((title) => title.includes('"d":1')) },
  });
  fixture.run(4000);
  openEditor(fixture);
  setWidth(fixture, 175);
  closeEditor(fixture);
  fixture.run(20000);
  assert.equal(fixture.status(), 'SAVED ON THIS PC');
  assert.equal(JSON.parse(storedRecord(profile).body).values.widthScale, 175);
  assert.equal(
    JSON.parse(storedRecord(profile, KEY_PREVIOUS).body).values.widthScale,
    120,
    'the retried commit keeps the older save as the backup',
  );
  assert.match(fixture.harness.logs.join('\n'), /save failed \(1\): timeout/);
  record(fixture);
});

// Live console.log 2026-09-26 05:36, 05:43 and 06:18: the first script went
// into the panel's about:blank placeholder while file:// was still loading;
// the load then failed to http://error/ (or the reads vanished with the
// placeholder). Scripts now wait for a loaded file:// document.
test('no script reaches the page until file:// has loaded, so the load is never aborted', () => {
  const factory = loadStorageCodec();
  const profile = createProfile({
    [KEY_CURRENT]: factory.codec.encodeRecord(savedBody({ widthScale: 205 }), 1),
  });
  const fixture = launch(profile, {
    label: 'placeholder during load',
    bridge: { placeholderSec: 0.1, navLatencySec: 0.8 },
  });
  fixture.run(20000);
  assert.equal(fixture.bridge.aborted, undefined, 'the file:// load was never interrupted');
  assert.equal(fixture.renderer().widthScale, 205);
  assert.equal(fixture.status(), 'SAVED ON THIS PC');
  assert.match(fixture.harness.logs.join('\n'), /bridge ready at file:\/\/\/C:\/ \(load 1\)/);
  record(fixture);
});

test('when both addresses end on http://error/, saving is unavailable and the save is kept', () => {
  const factory = loadStorageCodec();
  const record0 = factory.codec.encodeRecord(savedBody({ widthScale: 212 }), 1);
  const profile = createProfile({ [KEY_CURRENT]: record0 });
  const fixture = launch(profile, { label: 'both loads fail', bridge: { failNavigations: 2 } });
  fixture.run(30000);
  assert.deepEqual(fixture.bridge.urls, ['file:///C:/', 'file://']);
  assert.equal(fixture.status(), 'SAVE UNAVAILABLE');
  assert.match(fixture.harness.logs.join('\n'), /bridge unavailable: load_failed/);
  assert.equal(profile.disk.get(KEY_CURRENT), record0);
  record(fixture);
});

test('if the C: listing never loads, bare file:// still reaches the same save', () => {
  const factory = loadStorageCodec();
  const profile = createProfile({
    [KEY_CURRENT]: factory.codec.encodeRecord(savedBody({ widthScale: 214 }), 1),
  });
  const fixture = launch(profile, { label: 'file:///C:/ always fails', bridge: { failUrl: 'file:///C:/' } });
  fixture.run(20000);
  assert.equal(fixture.renderer().widthScale, 214);
  assert.equal(fixture.status(), 'SAVED ON THIS PC');
  assert.match(fixture.harness.logs.join('\n'), /bridge ready at file:\/\/\/ \(load 2/);
  record(fixture);
});

test('doubled URL events move to the next address once', () => {
  const factory = loadStorageCodec();
  const profile = createProfile({
    [KEY_CURRENT]: factory.codec.encodeRecord(savedBody({ widthScale: 216 }), 1),
  });
  const fixture = launch(profile, {
    label: 'doubled URL events',
    bridge: { failNavigations: 1, duplicateUrlEvents: true },
  });
  fixture.run(20000);
  assert.deepEqual(fixture.bridge.urls, ['file:///C:/', 'file://']);
  assert.equal(fixture.renderer().widthScale, 216);
  assert.equal(fixture.status(), 'SAVED ON THIS PC');
  record(fixture);
});

test('a load that reports an error and then commits keeps its page', () => {
  const factory = loadStorageCodec();
  const profile = createProfile({
    [KEY_CURRENT]: factory.codec.encodeRecord(savedBody({ widthScale: 217 }), 1),
  });
  const fixture = launch(profile, { label: 'error then commit', bridge: { strayErrorSec: 0.3 } });
  fixture.run(10000);
  assert.deepEqual(fixture.bridge.urls, ['file:///C:/']);
  openEditor(fixture);
  setWidth(fixture, 196);
  closeEditor(fixture);
  fixture.run(8000);
  assert.equal(storedEditedWidth(profile), 196);
  assert.equal(fixture.status(), 'SAVED ON THIS PC');
  record(fixture);
});

test('saves from the first local-save build (schema 1) still restore and upgrade', () => {
  const body = savedBody({ widthScale: 195, enemyLow: '#ABCDEF' });
  const payload = Buffer.from(JSON.stringify({ m: 'HPV2STORE', s: 1, t: 1, b: body }))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const profile = createProfile({
    [KEY_CURRENT]: `HPV2S1.${loadStorageCodec().codec.checksum(payload)}.${payload}`,
  });
  const fixture = launch(profile, { label: 'schema 1 restore' });
  fixture.run(8000);
  assert.equal(fixture.renderer().widthScale, 195);
  assert.equal(fixture.renderer().enemyLow, '#ABCDEF');
  openEditor(fixture);
  setWidth(fixture, 200);
  closeEditor(fixture);
  fixture.run(8000);
  const stored = profile.disk.get(KEY_CURRENT).split('.')[2];
  assert.equal(JSON.parse(Buffer.from(stored, 'base64').toString('utf8')).s, 2);
  assert.equal(storedEditedWidth(profile), 200);
  record(fixture);
});

test('saves keep only non-default values, and a restart fills the rest', () => {
  const profile = createProfile();
  const first = launch(profile, { label: 'sparse save' });
  first.run(2000);
  openEditor(first);
  setWidth(first, 210);
  createPreset(first, 'Sparse');
  closeEditor(first);
  first.run(4000);
  const body = JSON.parse(storedRecord(profile).body);
  assert.deepEqual(Object.keys(body.values), ['widthScale']);
  assert.deepEqual(Object.keys(body.userPresets[0].values), ['widthScale']);
  assert.ok(profile.disk.get(KEY_CURRENT).length < 3000, 'a typical save is one chunk');

  const restart = launch(profile, { label: 'sparse restore' });
  restart.run(6000);
  assert.equal(restart.renderer().widthScale, 210);
  assert.equal(restart.renderer().heightScale, 100, 'omitted values restore to defaults');
  assert.equal(menuState(restart).userPresets[0].values.enemyLow, '#FD4949');
  record(restart, { recordChars: profile.disk.get(KEY_CURRENT).length });
});

test('6722 Units, Appearance and zero-based readout settings persist through a real editor restart', () => {
  const profile = createProfile();
  const first = launch(profile, { label: '6722 settings save' });
  first.run(2000);
  openEditor(first);
  panelById(first.harness, 'HPColorsCategoryUnits').events.onactivate();
  panelById(first.harness, 'HPColorsNpcEnemyToggle').events.onactivate();
  panelById(first.harness, 'HPColorsCategoryOverview').events.onactivate();
  panelById(first.harness, 'HPColorsTab2').events.onactivate();
  panelById(first.harness, 'HPColorsPlayerNamesToggle').events.onactivate();
  const x = panelById(first.harness, 'HPColorsReadoutOffsetXEntry');
  const y = panelById(first.harness, 'HPColorsReadoutOffsetYEntry');
  x.text = '150';
  x.events.ontextentrysubmit();
  y.text = '-100';
  y.events.ontextentrysubmit();
  createPreset(first, '6722 saved');
  closeEditor(first);
  first.run(4000);
  const body = JSON.parse(storedRecord(profile).body);
  assert.equal(body.values.npcEnemyEnabled, true);
  assert.equal(body.values.playerNamesVisible, false);
  assert.equal(body.values.readoutOffsetX, 150);
  assert.equal(body.values.readoutOffsetY, -100);
  assert.equal(Object.hasOwn(body.values, 'healthbarMaskEnabled'), false);
  assert.equal(Object.hasOwn(body.values, 'ghoulOpacity'), false);
  const restart = launch(profile, { label: '6722 settings restore' });
  restart.run(6000);
  const restored = restart.renderer();
  assert.equal(restored.npcEnemyEnabled, true);
  assert.equal(restored.playerNamesVisible, false);
  assert.equal(restored.readoutOffsetX, 150);
  assert.equal(restored.readoutOffsetY, -100);
  assert.equal(restored.allyReadoutOffsetX, 0);
  assert.equal(restored.enemyPulseReadoutOffsetY, 0);
  assert.equal(menuState(restart).userPresets[0].values.readoutOffsetX, 150);
  record(restart, { portSettings: body.values });
});

test('an unreadable reply title is logged and the stored save is left untouched', () => {
  const factory = loadStorageCodec();
  const record0 = factory.codec.encodeRecord(
    JSON.stringify({ version: 1, values: { widthScale: 185 }, note: 'x'.repeat(4000) }),
    1,
  );
  const profile = createProfile({ [KEY_CURRENT]: record0 });
  const fixture = launch(profile, { label: 'cut titles', bridge: { titleLimit: 1800 } });
  fixture.run(30000);
  assert.equal(fixture.status(), 'SAVE UNAVAILABLE');
  assert.match(fixture.harness.logs.join('\n'), /ignored unreadable reply title \(1800 chars\)/);
  openEditor(fixture);
  setWidth(fixture, 190);
  closeEditor(fixture);
  fixture.run(8000);
  assert.equal(profile.disk.get(KEY_CURRENT), record0);
  record(fixture);
});

// -- GPT-6-Astra audit regressions (2026-09-26) --

function rawRecord(envelope) {
  const payload = Buffer.from(JSON.stringify(envelope)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `HPV2S1.${loadStorageCodec().codec.checksum(payload)}.${payload}`;
}

test('audit 1: a newer-schema save is never replaced by the older backup', () => {
  const future = rawRecord({ m: 'HPV2STORE', s: 9, t: 1, b: { version: 1, values: {} } });
  const backup = loadStorageCodec().codec.encodeRecord(savedBody({ widthScale: 130 }), 1);
  const profile = createProfile({ [KEY_CURRENT]: future, [KEY_PREVIOUS]: backup });
  const fixture = launch(profile, { label: 'audit 1 future current' });
  fixture.run(10000);
  assert.equal(fixture.status(), 'SAVE UNAVAILABLE');
  openEditor(fixture);
  setWidth(fixture, 199);
  closeEditor(fixture);
  fixture.run(10000);
  assert.equal(fixture.bridge.writes, 0);
  assert.equal(profile.disk.get(KEY_CURRENT), future);
  assert.equal(profile.disk.get(KEY_PREVIOUS), backup);
  record(fixture);
});

test('audit 2: a checksum-valid but unusable current falls back and never replaces the backup', () => {
  const backup = loadStorageCodec().codec.encodeRecord(savedBody({ widthScale: 135 }), 1);
  for (const [label, current] of [
    ['wrong magic', rawRecord({ m: 'SOMETHING', s: 2, t: 1, b: { version: 1, values: {} } })],
    ['no values', rawRecord({ m: 'HPV2STORE', s: 2, t: 1, b: { version: 1 } })],
  ]) {
    const profile = createProfile({ [KEY_CURRENT]: current, [KEY_PREVIOUS]: backup });
    const fixture = launch(profile, { label: `audit 2 ${label}` });
    fixture.run(10000);
    assert.equal(fixture.renderer().widthScale, 135, `${label}: restored from the backup`);
    assert.equal(fixture.status(), 'SAVED ON THIS PC');
    openEditor(fixture);
    setWidth(fixture, 145);
    closeEditor(fixture);
    fixture.run(10000);
    assert.equal(storedEditedWidth(profile), 145);
    const previous = profile.disk.get(KEY_PREVIOUS);
    assert.notEqual(previous, current, `${label}: the unusable record never becomes the backup`);
    assert.equal(storedRecord(profile, KEY_PREVIOUS).kind, 'valid', `${label}: the backup stays valid`);
    record(fixture);
  }
});

test('audit 3: Forget stays forgotten through automatic hero routing', () => {
  const profile = createProfile({
    [KEY_CURRENT]: loadStorageCodec().codec.encodeRecord(JSON.stringify({
      version: 1,
      values: {},
      conditions: {},
      scopes: [],
      userPresets: [{
        id: 'user_0001', name: 'Haze', mode: 'selected', heroes: ['hero_haze'],
        values: { widthScale: 222 }, conditions: {},
      }],
      nextUserPresetNumber: 2,
    }), 1),
  });
  const fixture = launch(profile, { label: 'audit 3 forget + hero switch' });
  fixture.run(6000);
  openEditor(fixture);
  const forget = panelById(fixture.harness, 'HPColorsStoreForgetButton');
  forget.events.onactivate();
  forget.events.onactivate();
  closeEditor(fixture);
  fixture.run(6000);
  assert.equal(profile.disk.has(KEY_CURRENT), false);

  fixture.identityTree.setHeroName('HAZE');
  fixture.run(20000);
  assert.equal(fixture.renderer().widthScale, 222, 'automatic routing applied the Haze preset');
  assert.equal(profile.disk.has(KEY_CURRENT), false, 'routing does not recreate the save');
  assert.equal(fixture.status(), 'SAVE CLEARED');

  openEditor(fixture);
  setWidth(fixture, 150);
  closeEditor(fixture);
  fixture.run(6000);
  assert.equal(profile.disk.has(KEY_CURRENT), true, 'a deliberate edit saves again');
  assert.equal(fixture.status(), 'SAVED ON THIS PC');
  record(fixture);
});

test('audit 5: a lost first page title still gets the page injected', () => {
  const profile = createProfile({
    [KEY_CURRENT]: loadStorageCodec().codec.encodeRecord(savedBody({ widthScale: 215 }), 1),
  });
  const fixture = launch(profile, {
    label: 'audit 5 lost first title',
    bridge: { dropTitle: dropFirst((title) => title === 'Index of /') },
  });
  fixture.run(20000);
  assert.equal(fixture.renderer().widthScale, 215);
  assert.equal(fixture.status(), 'SAVED ON THIS PC');
  record(fixture);
});

// -- All Except scope and envelope schema 3 --

function storedSchema(profile, key = KEY_CURRENT) {
  const payload = profile.disk.get(key).split('.')[2];
  return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).s;
}

function exceptBody(values) {
  return {
    version: 1,
    values,
    conditions: {},
    scopes: [],
    userPresets: [
      { id: 'user_0001', name: 'Not Haze', mode: 'except', heroes: ['hero_haze'], values: { widthScale: 170 } },
    ],
  };
}

test('an All Except preset keeps its mode and skipped heroes through a restart', () => {
  const profile = createProfile({
    [KEY_CURRENT]: rawRecord({ m: 'HPV2STORE', s: 3, t: 1, b: exceptBody({ widthScale: 140 }) }),
  });
  const first = launch(profile, { label: 'except restore' });
  first.run(8000);
  assert.equal(first.attr('hp_colors_v2_store_status'), 'ok');
  const preset = menuState(first).userPresets.find((row) => row.id === 'user_0001');
  assert.ok(preset, 'the All Except preset is restored');
  assert.equal(preset.mode, 'except');
  assert.deepEqual(preset.heroes, ['hero_haze']);
  openEditor(first);
  setWidth(first, 205);
  closeEditor(first);
  first.run(8000);
  const saved = JSON.parse(storedRecord(profile).body).userPresets.find((row) => row.id === 'user_0001');
  assert.equal(saved.mode, 'except');
  assert.deepEqual(saved.heroes, ['hero_haze']);
  record(first);

  const second = launch(profile, { label: 'except restart' });
  second.run(8000);
  const restored = menuState(second).userPresets.find((row) => row.id === 'user_0001');
  assert.equal(restored.mode, 'except');
  assert.deepEqual(restored.heroes, ['hero_haze']);
  record(second);
});

test('a save without any All Except preset or scope is written with envelope schema 2', () => {
  const profile = createProfile();
  const fixture = launch(profile, { label: 'schema 2 write' });
  fixture.run(2000);
  openEditor(fixture);
  setWidth(fixture, 175);
  closeEditor(fixture);
  fixture.run(4000);
  assert.equal(storedRecord(profile).kind, 'valid');
  assert.equal(storedSchema(profile), 2);
  assert.equal(storedEditedWidth(profile), 175);
  record(fixture);
});

test('a schema 2 save still restores and the next save stays schema 2', () => {
  const profile = createProfile({
    [KEY_CURRENT]: rawRecord({ m: 'HPV2STORE', s: 2, t: 1, b: JSON.parse(savedBody({ widthScale: 165 })) }),
  });
  const fixture = launch(profile, { label: 'schema 2 restore' });
  fixture.run(8000);
  assert.equal(fixture.attr('hp_colors_v2_store_status'), 'ok');
  assert.equal(fixture.renderer().widthScale, 165);
  openEditor(fixture);
  setWidth(fixture, 185);
  closeEditor(fixture);
  fixture.run(8000);
  assert.equal(storedSchema(profile), 2);
  assert.equal(storedEditedWidth(profile), 185);
  record(fixture);
});

test('an All Except Current scope saves as schema 3, and returning to All Heroes saves schema 2', () => {
  const profile = createProfile();
  const fixture = launch(profile, { label: 'except scope schema' });
  fixture.run(2000);
  openEditor(fixture);
  setWidth(fixture, 175);
  panelById(fixture.harness, 'HPColorsCurrentScopeExcept').events.onactivate();
  panelById(fixture.harness, 'HPColorsScopeHeroOption0').events.onactivate();
  panelById(fixture.harness, 'HPColorsScopeCloseButton').events.onactivate();
  closeEditor(fixture);
  fixture.run(4000);
  const current = JSON.parse(storedRecord(profile).body).scopes.find((scope) => scope.id === 'scope_current');
  assert.equal(current.mode, 'except');
  assert.equal(storedSchema(profile), 3);

  openEditor(fixture);
  panelById(fixture.harness, 'HPColorsCurrentScopeAll').events.onactivate();
  closeEditor(fixture);
  fixture.run(4000);
  const body = JSON.parse(storedRecord(profile).body);
  assert.ok(!(body.scopes || []).some((scope) => scope.mode === 'except'));
  assert.equal(storedSchema(profile), 2);
  record(fixture);
});

test('deleting the All Except preset keeps schema 3 until Current returns to All Heroes', () => {
  const profile = createProfile({
    [KEY_CURRENT]: rawRecord({ m: 'HPV2STORE', s: 3, t: 1, b: exceptBody({ widthScale: 140 }) }),
  });
  const fixture = launch(profile, { label: 'except delete schema' });
  fixture.run(8000);
  openEditor(fixture);
  setWidth(fixture, 150);
  closeEditor(fixture);
  fixture.run(8000);
  assert.equal(storedSchema(profile), 3);

  openEditor(fixture);
  const rowIndex = Array.from({ length: 64 }, (_, index) => index).find((index) => {
    const button = fixture.harness.root.FindChildTraverse(`HPColorsPresetRowDelete${index}`);
    return button && button.GetParent().GetAttributeString('hp_colors_preset_id', '') === 'user_0001';
  });
  assert.notEqual(rowIndex, undefined, 'the All Except preset row has a delete button');
  panelById(fixture.harness, `HPColorsPresetRowDelete${rowIndex}`).events.onactivate();
  panelById(fixture.harness, `HPColorsPresetRowConfirm${rowIndex}`).events.onactivate();
  closeEditor(fixture);
  fixture.run(8000);
  assert.equal(JSON.parse(storedRecord(profile).body).userPresets.some((row) => row.mode === 'except'), false);
  assert.equal(storedSchema(profile), 3);

  openEditor(fixture);
  panelById(fixture.harness, 'HPColorsCurrentScopeAll').events.onactivate();
  closeEditor(fixture);
  fixture.run(8000);
  const body = JSON.parse(storedRecord(profile).body);
  assert.equal((body.userPresets || []).some((row) => row.mode === 'except'), false);
  assert.equal((body.scopes || []).some((scope) => scope.mode === 'except'), false);
  assert.equal(storedSchema(profile), 2);
  record(fixture);
});

test('a schema 4 save is read-only and never overwritten', () => {
  const future = rawRecord({ m: 'HPV2STORE', s: 4, t: 1, b: exceptBody({ widthScale: 150 }) });
  const profile = createProfile({ [KEY_CURRENT]: future });
  const fixture = launch(profile, { label: 'schema 4 read-only' });
  fixture.run(8000);
  assert.equal(fixture.status(), 'SAVE UNAVAILABLE');
  openEditor(fixture);
  setWidth(fixture, 190);
  closeEditor(fixture);
  fixture.run(8000);
  assert.equal(fixture.bridge.writes, 0);
  assert.equal(profile.disk.get(KEY_CURRENT), future);
  record(fixture);
});

// A save this build cannot read (for example one written by a newer build)
// must still be removable on purpose; otherwise a downgraded player is stuck.
test('a save this build cannot read can be cleared after confirming, then saving resumes', () => {
  const future = rawRecord({ m: 'HPV2STORE', s: 4, t: 1, b: exceptBody({ widthScale: 150 }) });
  const profile = createProfile({ [KEY_CURRENT]: future, [KEY_PREVIOUS]: future });
  const fixture = launch(profile, { label: 'clear unreadable save' });
  fixture.run(8000);
  assert.equal(fixture.status(), 'SAVE UNAVAILABLE');

  const forget = panelById(fixture.harness, 'HPColorsStoreForgetButton');
  assert.equal(forget.enabled, true, 'CLEAR PC SAVE stays usable');
  forget.events.onactivate();
  fixture.run(8000);
  assert.equal(profile.disk.get(KEY_CURRENT), future, 'one press never deletes');

  forget.events.onactivate();
  forget.events.onactivate();
  fixture.run(2000);
  assert.equal(profile.disk.has(KEY_CURRENT), false);
  assert.equal(profile.disk.has(KEY_PREVIOUS), false);
  assertOtherModsUntouched(profile);
  assert.equal(fixture.status(), 'SAVE CLEARED');

  openEditor(fixture);
  setWidth(fixture, 120);
  closeEditor(fixture);
  fixture.run(3000);
  assert.equal(JSON.parse(storedRecord(profile).body).values.widthScale, 120, 'saving resumes');
  record(fixture);
});

test('Layered presets: own survives a restart', () => {
  const body = {
    version: 1,
    values: { widthScale: 140 },
    conditions: {},
    scopes: [],
    userPresets: [
      { id: 'user_0001', name: 'Everyone', mode: 'all', heroes: [], values: { widthScale: 140 } },
      { id: 'user_0002', name: 'Haze Only', mode: 'selected', heroes: ['hero_haze'], values: { widthScale: 170 }, own: ['widthScale'] },
    ],
  };
  const profile = createProfile({ [KEY_CURRENT]: rawRecord({ m: 'HPV2STORE', s: 3, t: 1, b: body }) });
  const first = launch(profile, { label: 'own seed' });
  first.run(8000);
  assert.equal(first.attr('hp_colors_v2_store_status'), 'ok');
  openEditor(first);
  setWidth(first, 205);
  closeEditor(first);
  first.run(8000);
  const saved = JSON.parse(storedRecord(profile).body).userPresets.find((row) => row.id === 'user_0002');
  assert.ok(saved, 'the Only These preset is saved');
  assert.deepEqual(saved.own, ['widthScale'], 'own is written to the save');
  const savedAll = JSON.parse(storedRecord(profile).body).userPresets.find((row) => row.id === 'user_0001');
  assert.equal(savedAll.own, undefined, 'All Heroes presets never carry own');
  record(first);

  const second = launch(profile, { label: 'own restart' });
  second.run(8000);
  assert.equal(second.attr('hp_colors_v2_store_status'), 'ok');
  openEditor(second);
  setWidth(second, 210);
  closeEditor(second);
  second.run(8000);
  const restored = JSON.parse(storedRecord(profile).body).userPresets.find((row) => row.id === 'user_0002');
  assert.equal(restored.mode, 'selected');
  assert.deepEqual(restored.own, ['widthScale'], 'own survives the restart');
  record(second);
});

// Round 4: REVERT is preset_apply and UNDO takes it back; both steps reach
// the local save like any other live change.
test('REVERT and its UNDO both persist through local autosave', () => {
  const body = {
    version: 1,
    values: { widthScale: 140 },
    conditions: {},
    scopes: [],
    userPresets: [
      { id: 'user_0001', name: 'Everyone', mode: 'all', heroes: [], values: { widthScale: 140 } },
    ],
  };
  const profile = createProfile({ [KEY_CURRENT]: rawRecord({ m: 'HPV2STORE', s: 3, t: 1, b: body }) });
  const fixture = launch(profile, { label: 'revert seed' });
  fixture.run(8000);
  assert.equal(fixture.attr('hp_colors_v2_store_status'), 'ok');
  openEditor(fixture);
  panelById(fixture.harness, 'HPColorsCategoryPresets').events.onactivate();
  panelById(fixture.harness, 'HPColorsTab0').events.onactivate();
  const everyoneRow = () => {
    const row = panelById(fixture.harness, 'HPColorsPresetOptions').Children().find(
      (option) => option.GetAttributeString('hp_colors_preset_id', '') === 'user_0001',
    );
    assert.ok(row, 'expected the Everyone row');
    return row;
  };
  // A row click re-renders the list; read the row again afterwards.
  everyoneRow().FindChildrenWithClassTraverse('HPColorsPresetOptionMain')[0].events.onactivate();
  const row = everyoneRow();
  setWidth(fixture, 150);
  fixture.run(8000);
  assert.equal(storedEditedWidth(profile), 150);
  assert.equal(row.FindChildrenWithClassTraverse('HPColorsPresetOptionStatus')[0].text, 'CHANGED');

  row.FindChildrenWithClassTraverse('HPColorsPresetRowRevert')[0].events.onactivate();
  assert.equal(menuState(fixture).scopes[0].values.widthScale, 140);
  assert.equal(menuState(fixture).scopes[0].sourcePresetId, 'user_0001');
  fixture.run(8000);
  assert.equal(storedEditedWidth(profile), 140, 'the reverted state is saved');
  assert.equal(fixture.status(), 'SAVED ON THIS PC');

  panelById(fixture.harness, 'HPColorsUndoButton').events.onactivate();
  assert.equal(menuState(fixture).scopes[0].values.widthScale, 150);
  fixture.run(8000);
  assert.equal(storedEditedWidth(profile), 150, 'the undone revert is saved');
  const saved = JSON.parse(storedRecord(profile).body).userPresets.find((preset) => preset.id === 'user_0001');
  assert.equal(saved.values.widthScale, 140, 'the preset itself never changed');
  assertOtherModsUntouched(profile);
  record(fixture);
});

// Tester round 5: the header chip names the preset the live settings belong
// to (healthy local save is silent), so a player can tell a named preset
// from Rewrite Default or settings that are in no preset.
test('header chip names the preset the current settings belong to', () => {
  const body = {
    version: 1,
    values: { widthScale: 140 },
    conditions: {},
    scopes: [],
    userPresets: [
      { id: 'user_0001', name: 'A Very Long Everyone Preset', mode: 'all', heroes: [], values: { widthScale: 140 } },
    ],
  };
  const profile = createProfile({ [KEY_CURRENT]: rawRecord({ m: 'HPV2STORE', s: 3, t: 1, b: body }) });
  const fixture = launch(profile, { label: 'chip seed' });
  fixture.run(8000);
  openEditor(fixture);
  panelById(fixture.harness, 'HPColorsCategoryPresets').events.onactivate();
  panelById(fixture.harness, 'HPColorsTab0').events.onactivate();
  const row = () => panelById(fixture.harness, 'HPColorsPresetOptions').Children().find(
    (option) => option.GetAttributeString('hp_colors_preset_id', '') === 'user_0001',
  );
  row().FindChildrenWithClassTraverse('HPColorsPresetOptionMain')[0].events.onactivate();
  const chip = panelById(fixture.harness, 'HPColorsLiveStatus');
  assert.equal(fixture.chip(), 'PRESET: A VERY LONG EVE…');
  assert.equal(chip.BHasClass('PresetChanged'), false);

  setWidth(fixture, 150);
  assert.equal(fixture.chip(), 'PRESET: A VERY LONG EVE… · CHANGED', 'changes show before the save settles');
  assert.equal(chip.BHasClass('PresetChanged'), true);
  fixture.run(8000);
  assert.equal(fixture.status(), 'SAVED ON THIS PC', 'the local save still runs underneath');
  assert.equal(fixture.chip(), 'PRESET: A VERY LONG EVE… · CHANGED');

  panelById(fixture.harness, 'HPColorsUndoButton').events.onactivate();
  assert.equal(fixture.chip(), 'PRESET: A VERY LONG EVE…');

  // Rewrite Default, then an edit that belongs to no preset.
  const fresh = launch(createProfile(), { label: 'chip fresh' });
  fresh.run(8000);
  assert.equal(fresh.chip(), 'PRESET: REWRITE DEFAULT');
  openEditor(fresh);
  setWidth(fresh, 175);
  assert.equal(fresh.chip(), 'NOT SAVED TO A PRESET');
  assert.equal(panelById(fresh.harness, 'HPColorsLiveStatus').BHasClass('PresetChanged'), true);
  fresh.run(8000);
  assert.equal(fresh.status(), 'SAVED ON THIS PC');
  assert.equal(fresh.chip(), 'NOT SAVED TO A PRESET');
});

test('round schema-3 restart drops saved formats without losing names geometry scopes or hero own', () => {
  const values = {
    readoutFormat: 'percent', allyReadoutFormat: 'current',
    enemyNameColorEnabled: true, enemyNameColor: '#123456',
    allyNameColorEnabled: true, allyNameColor: '#ABCDEF',
    nameSize: 40, nameOffsetX: -170, nameOffsetY: 160,
    widthScale: 60, heightScale: 60, positionX: -1200, positionY: 1100,
    accessoryAnchorEnabled: false, ultOffsetX: -2300, ultOffsetY: 2200,
    levelOffsetX: 2100, levelOffsetY: -2000, staminaOffsetX: -900, staminaOffsetY: 800,
    readoutOffsetX: -100, readoutOffsetY: 90, allyReadoutOffsetX: 80, allyReadoutOffsetY: -70,
    enemyPulseReadoutOffsetX: -60, enemyPulseReadoutOffsetY: 50,
  };
  const body = exceptBody(values);
  body.conditions = { readoutFormat: { slot: 1, minTier: 1, value: 'current' },
    allyReadoutFormat: { slot: 1, minTier: 1, value: 'percent' } };
  body.userPresets[0].values = values;
  body.userPresets[0].conditions = body.conditions;
  body.userPresets[0].own = ['readoutFormat', 'allyReadoutFormat', 'nameSize', 'positionX'];
  const oldRecord = rawRecord({ m: 'HPV2STORE', s: 3, t: 1, b: body });
  const profile = createProfile({ [KEY_CURRENT]: oldRecord });
  const first = launch(profile, { label: 'round saved format restore' });
  first.run(8000);
  const restored = menuState(first);
  assert.equal(Object.hasOwn(restored.values, 'readoutFormat'), false);
  assert.equal(Object.hasOwn(restored.conditions, 'allyReadoutFormat'), false);
  assert.deepEqual(restored.userPresets[0].own, ['positionX', 'nameSize']);
  for (const [key, value] of Object.entries(values)) {
    if (key.endsWith('Format')) continue;
    assert.equal(restored.userPresets[0].values[key], value, key);
  }
  openEditor(first);
  assert.equal(panelById(first.harness, 'HPColorsNativeFormatNotice').BHasClass('Active'), true);
  setWidth(first, 65);
  closeEditor(first);
  first.run(8000);
  assert.equal(storedSchema(profile), 3);
  assert.equal(JSON.parse(storedRecord(profile).body).userPresets[0].mode, 'except');
  const second = launch(profile, { label: 'round normalized restart' });
  second.run(8000);
  openEditor(second);
  assert.equal(panelById(second.harness, 'HPColorsNativeFormatNotice').BHasClass('Active'), false);
  const preset = menuState(second).userPresets[0];
  for (const [key, value] of Object.entries(values)) {
    if (key.endsWith('Format')) continue;
    assert.equal(preset.values[key], value, key);
  }
  for (const [key, value] of Object.entries(THIRD_EYE_KEYS)) assert.equal(profile.disk.get(key), value);
  record(first);
  record(second);
});

test('schema 3 stamina migration and explicit shapes survive sparse saves and real menu restarts', () => {
  for (const [initialValues, expectedShape] of [
    [{}, 'arrow'],
    [{ staminaWidth: 150 }, 'box'],
    [{ staminaHeight: 60 }, 'box'],
    [{ enemyStaminaColorEnabled: true }, 'box'],
    [{ staminaOffsetX: 20 }, 'arrow'],
    [{ staminaWidth: 150, enemyStaminaColorEnabled: true, staminaShape: 'arrow' }, 'arrow'],
    [{ staminaWidth: 150, staminaShape: 'circle' }, 'circle'],
    [{ staminaShape: 'box' }, 'box'],
  ]) {
    const values = { ...initialValues, enemyPipColorEnabled: true, enemyPipColor: '#123456',
      allyPipColorEnabled: true, allyPipColor: '#ABCDEF', pipOpacity: 42 };
    const body = exceptBody(values);
    body.userPresets[0].values = { ...values };
    body.userPresets[0].conditions = { pipOpacity: { slot: 1, minTier: 1, value: 70 } };
    const profile = createProfile({
      [KEY_CURRENT]: rawRecord({ m: 'HPV2STORE', s: 3, t: 1, b: body }),
    });
    const first = launch(profile, { label: 'shape migration ' + expectedShape });
    first.run(8000);
    assert.equal(menuState(first).values.staminaShape, expectedShape);
    assert.equal(menuState(first).userPresets[0].values.staminaShape, expectedShape);
    openEditor(first);
    setWidth(first, 205);
    closeEditor(first);
    first.run(8000);
    assert.equal(storedSchema(profile), 3, 'All Except keeps the durable schema');
    const persisted = JSON.parse(storedRecord(profile).body);
    if (initialValues.staminaShape === 'arrow') {
      assert.equal(persisted.values.staminaShape, 'arrow', 'explicit default defeats derived box migration');
      assert.equal(persisted.userPresets[0].values.staminaShape, 'arrow');
    }
    assert.equal(persisted.values.enemyPipColor, '#123456');
    assert.equal(persisted.values.allyPipColor, '#ABCDEF');
    assert.equal(persisted.values.pipOpacity, 42);
    record(first);
    const restarted = launch(profile, { label: 'shape restart ' + expectedShape });
    restarted.run(8000);
    assert.equal(menuState(restarted).values.staminaShape, expectedShape);
    assert.equal(menuState(restarted).userPresets[0].values.staminaShape, expectedShape);
    assert.deepEqual(menuState(restarted).userPresets[0].conditions.pipOpacity,
      { slot: 1, minTier: 1, value: 70 });
    assertOtherModsUntouched(profile);
    record(restarted);
  }
});
