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
  }, options);
  const stats = { navigations: 0, reads: 0, writes: 0, deletes: 0, titles: [] };
  let page = null;

  function deliver(title) {
    const cut = String(title).slice(0, TITLE_LIMIT);
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

  function newPage() {
    const localStorage = {
      getItem: (key) => (profile.disk.has(key) ? profile.disk.get(key) : null),
      setItem: (key, value) => {
        if (usedChars(key, value) > opts.quotaChars) throw new Error('QuotaExceededError');
        profile.disk.set(key, String(value));
      },
      removeItem: (key) => { profile.disk.delete(key); },
    };
    const context = { JSON, Math, String, localStorage, location: { href: 'file:///' } };
    context.window = context;
    context.document = {
      set title(value) { deliver(value); },
      get title() { return ''; },
    };
    return vm.createContext(context);
  }

  panel.SetURL = (url) => {
    const text = String(url);
    if (text.startsWith('javascript:')) {
      if (!page) return;
      const code = decodeURIComponent(text.slice('javascript:'.length));
      if (code.includes('__hpv2s.r(')) stats.reads += 1;
      if (code.includes('__hpv2s.w(')) stats.writes += 1;
      if (code.includes('__hpv2s.d(')) stats.deletes += 1;
      vm.runInContext(code, page);
      return;
    }
    stats.navigations += 1;
    page = null;
    if (!opts.commit) return;
    harness.scheduler.schedule(opts.navLatencySec, () => {
      page = newPage();
      deliver('Index of /');
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
}

function launch(profile, options = {}) {
  const harness = createPanoramaHarness({ now: profile.clock });
  installLayoutPanels(harness, options.layout || layoutSource);
  installTopBarIdentityTree(harness, { heroName: 'SHIV', gameTime: '00:01' });
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
    status: () => panelById(harness, 'HPColorsLiveStatus').text,
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
  assert.equal(first.status(), 'SAVING');
  first.run(2000);
  assert.equal(first.status(), 'SAVED');
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
  assert.equal(second.status(), 'SAVED');
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
  // A multi-chunk save: settings plus several presets from a real session.
  const profile = createProfile();
  const seed = launch(profile, { label: 'slow seed' });
  seed.run(2000);
  openEditor(seed);
  setWidth(seed, 150);
  for (let index = 1; index <= 4; index += 1) createPreset(seed, `Preset ${index}`);
  closeEditor(seed);
  seed.run(6000);
  const record0 = profile.disk.get(KEY_CURRENT);
  assert.ok(record0.length > 2 * 3000, 'seeded save spans several chunks');

  const slow = launch(profile, {
    label: 'slow restore',
    bridge: { navLatencySec: 0.8, replyLatencySec: 1.4 },
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
  assert.equal(fixture.status(), 'SAVED');
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
  fixture.run(15000);
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
  assert.equal(panelById(fixture.harness, 'HPColorsStoreForgetLabel').text, 'CONFIRM FORGET');
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    setWidth(full, 140 + attempt);
    full.run(2000);
  }
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

// Live console.log 2026-09-26 05:36: "bridge ready" then the first read timed
// out and saving stayed off. Replies can be lost or late at game start.
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

test('lost replies at game start are resent and the save still loads', () => {
  const factory = loadStorageCodec();
  const profile = createProfile({
    [KEY_CURRENT]: factory.codec.encodeRecord(savedBody({ widthScale: 145 }), 1),
  });
  let lostHello = 1;
  let lostRead = 2;
  const fixture = launch(profile, {
    label: 'lost hello and read replies',
    bridge: {
      dropTitle(title) {
        if (lostHello > 0 && title.includes('"o":"ready"')) { lostHello -= 1; return true; }
        if (lostRead > 0 && title.includes('"o":"r"')) { lostRead -= 1; return true; }
        return false;
      },
    },
  });
  fixture.run(20000);
  assert.equal(fixture.renderer().widthScale, 145);
  assert.equal(fixture.status(), 'SAVED');
  const logs = fixture.harness.logs.join('\n');
  assert.match(logs, /resending \(1\/3\)/);
  assert.match(logs, /resending \(2\/3\)/);
  assert.match(logs, /restored saved settings/);
  record(fixture);
});

test('replies slower than the exchange timeout are still accepted', () => {
  const factory = loadStorageCodec();
  const profile = createProfile({
    [KEY_CURRENT]: factory.codec.encodeRecord(savedBody({ widthScale: 155 }), 1),
  });
  const fixture = launch(profile, {
    label: 'late replies',
    bridge: { replyLatencySec: 4 },
  });
  fixture.run(30000);
  assert.equal(fixture.renderer().widthScale, 155);
  assert.equal(fixture.status(), 'SAVED');

  openEditor(fixture);
  setWidth(fixture, 165);
  closeEditor(fixture);
  fixture.run(30000);
  assert.equal(JSON.parse(storedRecord(profile).body).values.widthScale, 165);
  assert.equal(fixture.status(), 'SAVED');
  record(fixture);
});

test('a lost save acknowledgement is resent without rotating the backup twice', () => {
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
  assert.equal(fixture.status(), 'SAVED');
  assert.equal(JSON.parse(storedRecord(profile).body).values.widthScale, 175);
  assert.equal(
    JSON.parse(storedRecord(profile, KEY_PREVIOUS).body).values.widthScale,
    120,
    'the retried commit keeps the older save as the backup',
  );
  assert.match(fixture.harness.logs.join('\n'), /no reply to write/);
  record(fixture);
});
