'use strict';

// Config request/answer, single world listener, sparse payloads and timer
// send suppression. Failure modes are listed above each test.
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

const rewriteRoot = path.resolve(__dirname, '../hp_colors_rewrite_v2');
const scriptsRoot = path.join(rewriteRoot, 'panorama/scripts');
const read = name => fs.readFileSync(path.join(scriptsRoot, name), 'utf8').replace(/\r\n/g, '\n');
const contractSource = read('hp_colors_v2_contract.js');
const stateSource = read('hp_colors_v2_state.js');
const menuSource = read('hp_colors_v2_menu.js');
const rendererSource = read('unit_status_v2_colors.js');
const bridgeSource = read('test_event_bridge.js');
const timerSource = read('test_topbar_pickups.js');
const layoutSource = fs.readFileSync(path.join(rewriteRoot, 'panorama/layout/hud_escape_menu.xml'), 'utf8');
const contractContext = vm.createContext({ $: {} });
vm.runInContext(contractSource, contractContext);
const contract = contractContext.$.HPColorsV2ContractFactory.create();
const CHANNEL = 'ClientUI_FireOutput';
const CONFIG_ATTR = 'hp_colors_v2_config';
const MENU_STATE_ATTR = 'hp_colors_v2_menu_state';
const plain = value => JSON.parse(JSON.stringify(value));

function installMenuPanels(harness) {
  for (const id of new Set(Array.from(layoutSource.matchAll(/\bid="([^"]+)"/g), match => match[1]))) {
    if (!harness.root.FindChildTraverse(id)) harness.root.add(new MockPanel(id));
  }
  const shape = harness.root.FindChildTraverse('HPColorsStaminaShape');
  if (shape) for (const option of ['arrow', 'circle', 'box'])
    shape.AddOption(harness.root.FindChildTraverse(option));
}

// values: session values; storage: optional fake storage (no session attr then).
function bootMenu({ values = {}, storage = null, harness = null } = {}) {
  const menuHarness = harness || createPanoramaHarness();
  if (!harness) {
    installMenuPanels(menuHarness);
    installTopBarIdentityTree(menuHarness, { heroName: 'SHIV', gameTime: '00:01' });
    if (!storage)
      menuHarness.root.SetAttributeString(MENU_STATE_ATTR, JSON.stringify({ version: 1, values, scopes: [] }));
  }
  if (storage) menuHarness.$.HPColorsV2StorageFactory = storage;
  runHpColorsSourcesInVm(stateSource, menuSource, menuHarness, { settingsContractSource: contractSource });
  menuHarness.$.HPColorsMenuBoot();
  return menuHarness;
}

const menuListeners = harness => harness.handlerEntries.filter(entry => entry.channel === CHANNEL);
const menuConfigDispatches = harness => harness.dispatches
  .filter(args => args[0] === CHANNEL && String(args[1]).includes('HP_COLORS_V2_CONFIG'))
  .map(args => args[1]);

function bootWorld({ queue, random } = {}) {
  const harness = createPanoramaHarness({ contextPanel: 'child', contextPanelId: 'UnitStatus' });
  const panel = harness.contextPanel;
  if (queue) panel.HPV2QueueConfigRequest = queue;
  const context = createVmContext(harness, { includeGameUI: false,
    ...(random && { globals: { Math: Object.assign(Object.create(Math), { random }) } }) });
  runInVm(contractSource, context);
  runInVm(rendererSource, context);
  const listeners = harness.handlerEntries.filter(entry => entry.channel === CHANNEL);
  assert.equal(listeners.length, 1, 'renderer owns exactly one world listener');
  return {
    harness, panel, context,
    deliver: raw => listeners[0].fn(raw),
    config: () => panel.HPV2GetNormalizedConfig(),
  };
}

const requestRaw = revision => JSON.stringify({
  magic_word: 'HPV2_CONFIG_REQUEST', revision, source: 'unit', instance: 'i', seq: 1, at: 0,
});

// Failure modes: requests stop early or never back off (spike/loop), a late
// context never asks, the loop survives config arrival, teardown or a root change.
test('world context requests config with backoff and stops on config, teardown or root change', () => {
  const sent = [];
  const world = bootWorld({ queue: revision => { sent.push([world.harness.now, revision]); return true; } });
  world.harness.scheduler.runFor(24000);
  assert.deepEqual(sent.map(item => item[0]), [500, 1500, 3500, 7500, 15500, 23500]);
  assert.ok(sent.every(item => item[1] === -1), 'requests carry the current (absent) revision');
  world.deliver(JSON.stringify({ magic_word: 'HP_COLORS_V2_CONFIG', version: 2, revision: 4, values: { enabled: false } }));
  world.harness.scheduler.runFor(30000);
  assert.equal(sent.length, 6, 'config stops the loop');

  const late = [];
  const stopped = bootWorld({ queue: () => { late.push(stopped.harness.now); return true; } });
  stopped.panel.valid = false;
  stopped.harness.scheduler.runFor(30000);
  assert.deepEqual(late, [], 'teardown cancels the pending request');
  assert.equal(stopped.harness.handlerEntries.filter(entry => entry.channel === CHANNEL).length, 0,
    'teardown unregisters the single listener');

  const moved = [];
  const rooted = bootWorld({ queue: () => { moved.push(rooted.harness.now); return true; } });
  rooted.harness.scheduler.runFor(1600);
  assert.equal(moved.length, 2);
  // Root change: the context moves under a new absolute root; backoff restarts.
  const newRoot = new MockPanel('NewRoot');
  rooted.harness.root.valid = false;
  rooted.panel.SetParent(newRoot);
  rooted.harness.scheduler.runFor(2000);
  // Scan phase is random: detection within the 1 s scan bound, then the 0.5 s delay (old backoff: 3500).
  const restarted = moved.find(at => at > 1600);
  assert.ok(restarted <= 1600 + 1500, 'root change restarts at the short delay');
});

// A canceled callback that arrives late must not erase the new root's request handle.
test('stale config request callbacks preserve the replacement job for cancellation', () => {
  // First rescan at 0.1 s, before the 0.5 s request, so the root change cancels it.
  const world = bootWorld({ queue: () => true, random: () => 0.9 });
  const stale = world.harness.scheduler.jobs.find(job => job.delay === 0.5);
  assert.ok(stale);
  const canceled = [];
  const cancel = world.harness.$.CancelScheduled;
  world.harness.$.CancelScheduled = job => { canceled.push(job); return cancel(job); };
  world.harness.root.valid = false;
  world.panel.SetParent(new MockPanel('NewRoot'));
  world.harness.scheduler.runUntil(() => canceled.includes(stale), 'root change cancels old request');
  const current = world.harness.scheduler.jobs.find(job => job.delay === 0.5);
  assert.ok(current && current !== stale);
  stale.fn();
  world.deliver(JSON.stringify({ magic_word: 'HP_COLORS_V2_CONFIG', version: 2, revision: 4, values: { enabled: false } }));
  assert.ok(canceled.includes(current), 'config arrival cancels the replacement request');
  assert.equal(world.harness.scheduler.jobs.includes(current), false);
});

// Failure modes: a missing/broken relay retries forever (no loop) or throws
// into the renderer; the bridge logs every failure.
test('relay creation failure bounds retries and logs once', () => {
  let calls = 0;
  const world = bootWorld({ queue: () => { calls++; return false; } });
  world.harness.scheduler.runFor(120000);
  assert.equal(calls, 3);
  const throwing = bootWorld({ queue: () => { throw new Error('relay'); } });
  throwing.harness.scheduler.runFor(120000);
  assert.equal(throwing.harness.scheduler.jobs.some(job => job.delay === 8), false);

  // The real bridge on a context whose relay layout cannot load.
  const harness = createPanoramaHarness();
  const root = harness.root.add(new MockPanel('world_unit', { paneltype: 'Panel' }));
  const context = root.add(new MockPanel('dialog', { paneltype: 'ClientUIDialogPanel' }));
  harness.contextPanel = context;
  harness.$.CreatePanel = (type, parent, id) => {
    const panel = parent.add(new MockPanel(id, { paneltype: type }));
    panel.BLoadLayout = () => false;
    return panel;
  };
  runInVm(bridgeSource, createVmContext(harness, { includeGameUI: false }));
  assert.equal(context.HPV2QueueConfigRequest(-1), false);
  assert.equal(context.HPV2QueueConfigRequest(-1), false);
  assert.equal(harness.logs.filter(line => line.includes('relay-error')).length, 1);
  assert.equal(harness.dispatches.length, 0);
});

// Failure modes: a world context dispatches ClientUI_FireOutput directly from
// the ClientUIDialogPanel (server-bound path), or the relay drops the request.
test('world requests leave only through the sibling relay', () => {
  for (const source of [rendererSource, timerSource.replace(/function ultimateTick[\s\S]*?\n  }\n/, '')
    .replace(/function publishScanGate[\s\S]*?\n  }\n/, '')]) {
    assert.doesNotMatch(source, /DispatchEvent\(\s*["']ClientUI_FireOutput/);
  }
  const harness = createPanoramaHarness();
  const root = harness.root.add(new MockPanel('world_unit', { paneltype: 'Panel' }));
  const context = root.add(new MockPanel('dialog', { paneltype: 'ClientUIDialogPanel' }));
  harness.contextPanel = context;
  let relay = null;
  harness.$.CreatePanel = (type, parent, id) => {
    relay = parent.add(new MockPanel(id, { paneltype: type }));
    relay.BLoadLayout = () => true;
    return relay;
  };
  runInVm(bridgeSource, createVmContext(harness, { includeGameUI: false }));
  assert.equal(context.HPV2QueueConfigRequest(7), true);
  assert.deepEqual(harness.dispatches.map(args => args[0]), ['Activated']);
  assert.equal(harness.dispatches[0][1], relay);
  const raw = relay.GetAttributeString('hpv2_pickup_message', '');
  const request = JSON.parse(raw);
  assert.equal(request.magic_word, 'HPV2_CONFIG_REQUEST');
  assert.equal(request.revision, 7);
  assert.equal(request.source, 'world_unit');
  // The relay's own context forwards it.
  harness.contextPanel = relay;
  relay.AddClass('HPV2BridgeRelay');
  runInVm(bridgeSource, createVmContext(harness, { includeGameUI: false }));
  assert.deepEqual(harness.dispatches.at(-1), [CHANNEL, raw]);
  // Non-player contexts release the relay; heroes keep it.
  harness.contextPanel = context;
  context.HPV2ReleaseRelay();
  assert.equal(relay.GetAttributeString('hpv2_pickup_message', ''), '');
});

// Failure modes: bursts each trigger a 3.5 KB dispatch, answers stop when the
// master switch is off (late context falls back to enabled defaults), stale
// requests are answered, an Escape layout reload leaves two answering listeners.
test('menu answers requests once per window, while disabled, and after a layout reload', () => {
  const menu = bootMenu({ values: { enabled: false } });
  assert.equal(menuListeners(menu).length, 1, 'menu registers one request listener');
  const handler = menuListeners(menu)[0].fn;
  const published = menuConfigDispatches(menu).length;
  // No perpetual replay.
  menu.scheduler.runFor(60000);
  assert.equal(menuConfigDispatches(menu).length, published, 'no replay schedule');
  for (let index = 0; index < 5; index++) handler(requestRaw(-1));
  assert.equal(menuConfigDispatches(menu).length, published + 1, 'first request answers immediately');
  menu.scheduler.runFor(200);
  for (let index = 0; index < 5; index++) handler(requestRaw(-1));
  assert.equal(menuConfigDispatches(menu).length, published + 1);
  menu.scheduler.runFor(400);
  assert.equal(menuConfigDispatches(menu).length, published + 2, 'one trailing answer for the burst');
  const answer = JSON.parse(menuConfigDispatches(menu).at(-1));
  assert.equal(answer.values.enabled, false, 'answers while the master switch is off');
  // Stale (already satisfied) and foreign messages are ignored.
  menu.scheduler.runFor(1000);
  handler(requestRaw(answer.revision));
  handler(JSON.stringify({ magic_word: 'HPV2_PICKUP_SNAPSHOT' }));
  handler('{"magic_word":"HPV2_CONFIG_REQUEST"'.repeat(20));
  menu.scheduler.runFor(1000);
  assert.equal(menuConfigDispatches(menu).length, published + 2);

  // Late world context: request -> answer keeps it stock past the grace period.
  const world = bootWorld({ queue: revision => { handler(requestRaw(revision)); return true; } });
  world.harness.scheduler.runFor(600);
  world.deliver(menuConfigDispatches(menu).at(-1));
  world.harness.scheduler.runFor(10000);
  assert.equal(world.config().enabled, false, 'late context stays master-off');
  // Negative control: with no answer the context falls back to enabled
  // defaults after the grace period, which is what replay-stops-when-off did.
  const unanswered = bootWorld({ queue: () => true });
  unanswered.harness.scheduler.runFor(10000);
  assert.equal(unanswered.config().enabled, true);

  // Escape layout reload: the new instance replaces the old listener.
  const firstId = menuListeners(menu)[0].id;
  bootMenu({ harness: menu });
  assert.equal(menuListeners(menu).length, 1);
  assert.ok(menu.unregisterCalls.some(call => call.id === firstId));
  menu.scheduler.runFor(1000);
  const before = menuConfigDispatches(menu).length;
  menuListeners(menu)[0].fn(requestRaw(-1));
  // A publish may have opened the current window; the answer is then trailing.
  menu.scheduler.runFor(600);
  assert.equal(menuConfigDispatches(menu).length, before + 1, 'exactly one instance answers');
});

// A late canceled answer must not release a replacement answer's coalescing/cancellation handle.
test('stale menu answer callbacks preserve replacement ownership', () => {
  const menu = bootMenu();
  const handler = menuListeners(menu)[0].fn;
  const stop = menu.root.HPV2ConfigAnswerStop;
  const answers = () => menu.scheduler.jobs.filter(job => job.fn.toString().includes('sendConfigAnswer'));
  handler(requestRaw(-1));
  const stale = answers()[0];
  assert.ok(stale);
  stop();
  handler(requestRaw(-1));
  const current = answers()[0];
  assert.ok(current && current !== stale);
  const before = menuConfigDispatches(menu).length;
  stale.fn();
  handler(requestRaw(-1));
  assert.deepEqual(answers(), [current], 'stale answer cannot release the burst guard');
  assert.equal(menuConfigDispatches(menu).length, before, 'stale answer never publishes');
  stop();
  assert.equal(menu.scheduler.jobs.includes(current), false, 'replacement remains cancelable');
});

// Cache payload/revision together, including fallback/recovery, without reparsing on requests.
test('menu requests reuse the published revision and refresh it with each payload', () => {
  const harness = createPanoramaHarness();
  const parsed = [];
  const sent = [];
  const sandbox = vm.createContext({
    $: harness.$, context: harness.root, state: { booted: true }, hydration: { phase: 'complete' },
    CONFIG_MAGIC: 'HP_COLORS_V2_CONFIG', CONFIG_VERSION: 2, CONFIG_REQUEST_MAGIC: 'HPV2_CONFIG_REQUEST',
    CONFIG_ANSWER_WINDOW_MS: 500, DEFAULTS: {}, isValid: panel => panel.IsValid(),
    nowMs: () => harness.now, dispatchChange: raw => sent.push(raw),
    JSON: { stringify: JSON.stringify, parse: raw => { parsed.push(raw); return JSON.parse(raw); } },
  });
  vm.runInContext(menuSource.match(/^  var publishedFullPayload[^]*?^  var configAnswer[^]*?;/m)[0] +
    menuSource.match(/^  function serializeChange\([^]*?^  }/m)[0] +
    menuSource.slice(menuSource.indexOf('  function sparsePayload('), menuSource.indexOf('  function startConfigAnswers(')), sandbox);
  const first = JSON.stringify({ magic_word: 'HP_COLORS_V2_CONFIG', version: 2, revision: 4, values: { enabled: true } });
  sandbox.rememberPublishedPayload(first);
  sandbox.DEFAULTS = { enabled: true };
  sandbox.rememberPublishedPayload(first);
  assert.deepEqual(JSON.parse(sandbox.publishedSparsePayload).values, {}, 'same raw recomputes when defaults become available');
  for (const [raw, revision] of [
    [first, 4],
    [JSON.stringify({ magic_word: 'HP_COLORS_V2_CONFIG', version: 2, revision: 8, values: { enabled: false } }), 8],
    ['{broken', -1],
    ['null', -1],
    ['{"revision":"invalid"}', -1],
    [first, 4],
  ]) {
    sandbox.rememberPublishedPayload(raw);
    const cached = sandbox.publishedSparsePayload;
    parsed.length = 0;
    harness.now += 1000;
    const before = sent.length;
    for (let index = 0; index < 5; index++) sandbox.onConfigRequest(requestRaw(revision));
    assert.equal(sent.length, before, 'matching revision is already satisfied');
    sandbox.onConfigRequest(requestRaw(revision - 1));
    assert.equal(sent.length, before + 1, 'older revision gets the current payload');
    assert.equal(sent.at(-1), cached, 'answer payload and revision agree');
    assert.equal(parsed.length, 6, 'only the six requests are parsed, not the published payload');
  }
});

// Failure modes: requests during hydration answer with pre-restore values,
// requests lost before boot are never retried, hydration never publishes.
test('requests before boot or during hydration are dropped and the retry or publish delivers', () => {
  let finishLoad = null;
  const storage = {
    codec: { checksum: () => 'x' },
    create: () => ({ start() {}, load(callback) { finishLoad = callback; }, save() {}, forget() {} }),
  };
  const menu = bootMenu({ storage });
  assert.equal(typeof finishLoad, 'function', 'hydration pending');
  assert.equal(menuListeners(menu).length, 0, 'no answers before boot');
  assert.equal(menuConfigDispatches(menu).length, 0);
  const requests = [];
  const world = bootWorld({ queue: revision => { requests.push(revision); return true; } });
  world.harness.scheduler.runFor(4000);
  assert.equal(requests.length, 3, 'world keeps retrying while the menu is not answering');
  finishLoad({ kind: 'absent' });
  const publish = menuConfigDispatches(menu);
  assert.equal(publish.length, 1, 'hydration publishes');
  world.deliver(publish[0]);
  world.harness.scheduler.runFor(30000);
  assert.equal(requests.length, 3, 'config ends the retries');
  assert.equal(world.config().enabled, true);
});

// Failure modes: sparse payload changes the normalized config, drops a
// non-default key, or the root attribute becomes sparse (hydration reads it).
test('broadcasts and answers are sparse; root attribute stays full', () => {
  const values = { enemyLow: '#123456', pickupSize: 31, enabled: true };
  const menu = bootMenu({ values });
  const full = JSON.parse(menu.root.GetAttributeString(CONFIG_ATTR, ''));
  const sparseRaw = menuConfigDispatches(menu).at(-1);
  const sparse = JSON.parse(sparseRaw);
  assert.deepEqual(Object.keys(sparse), ['magic_word', 'version', 'revision', 'values']);
  assert.equal(sparse.revision, full.revision);
  assert.ok(Object.keys(full.values).length >= Object.keys(contract.defaults).length);
  assert.ok(sparseRaw.length * 5 < JSON.stringify(full).length, 'sparse is much smaller');
  assert.equal(sparse.values.enemyLow, '#123456');
  assert.equal(sparse.values.pickupSize, 31);
  assert.deepEqual(plain(contract.normalizeValues(sparse.values)), plain(contract.normalizeValues(full.values)));
  const world = bootWorld();
  world.deliver(sparseRaw);
  assert.deepEqual(plain(world.config()), plain(contract.normalizeValues(full.values)));
  // Stale answers never roll a context back.
  world.deliver(JSON.stringify({ ...sparse, revision: sparse.revision - 1, values: { enabled: false } }));
  assert.equal(world.config().enabled, true);
});

// Failure modes: the timer script registers a second world listener, the
// renderer parses foreign messages, or messages before the timer script loads
// (or after it stops) throw or reach a stale hook.
test('one world listener routes timer traffic to the pickup hook in any load order', () => {
  const world = bootWorld();
  const parses = () => runInVm('globalThis.__parses', world.context);
  runInVm('globalThis.__parses = 0; JSON.parse = (parse => function () { globalThis.__parses++; ' +
    'return parse.apply(this, arguments); })(JSON.parse);', world.context);
  const ultimate = JSON.stringify({ magic_word: 'HPV2_ULTIMATE_SNAPSHOT', since: 0, at: 0, players: [] });
  assert.doesNotThrow(() => world.deliver(ultimate), 'before the timer script loads');
  world.deliver(requestRaw(-1));
  world.deliver(JSON.stringify({ magic_word: 'HPV2_PICKUP_SCAN_GATE' }));
  assert.equal(parses(), 0, 'renderer never parses timer or request traffic');
  const before = world.harness.handlerEntries.length;
  runInVm(timerSource, world.context);
  assert.equal(world.harness.handlerEntries.length, before, 'timer script adds no listener');
  assert.equal(typeof world.panel.HPV2OnPickupMessage, 'function');
  const routed = [];
  const hook = world.panel.HPV2OnPickupMessage;
  world.panel.HPV2OnPickupMessage = raw => { routed.push(raw); return hook(raw); };
  world.deliver(ultimate);
  world.deliver(requestRaw(-1));
  world.deliver(JSON.stringify({ magic_word: 'HP_COLORS_V2_CONFIG', version: 2, revision: 1, values: {} }));
  assert.deepEqual(routed, [ultimate]);
  world.panel.HPV2OnPickupMessage = hook;
  world.panel.HPV2PickupStop();
  assert.equal(world.panel.HPV2OnPickupMessage, null, 'stop clears the hook');
  assert.doesNotThrow(() => world.deliver(ultimate));
});

function timerFunctions(names, globals) {
  const code = names.map(name => {
    const match = timerSource.match(new RegExp('^  function ' + name + '\\([^]*?^  }', 'm'));
    assert.ok(match, 'missing ' + name);
    return match[0];
  }).join('\n');
  const sandbox = vm.createContext(globals);
  vm.runInContext(code, sandbox);
  return sandbox;
}

// Failure modes: suppression swallows a refresh, pause, expiry or the 6 s
// heartbeat, or still re-sends a countdown the receiver already predicts.
test('pickup re-broadcast only when the published fit stops predicting', () => {
  let now = 0;
  const sent = [];
  const box = timerFunctions(['progressPredicted', 'publish'], {
    Date: { now: () => now }, Math, PICKUP_PREDICT_TOLERANCE: 6,
    pickups: [{}, {}, {}, {}], clipCaptures: [], sourceId: 'unit', progressDirty: false,
    lastPublishedName: null, lastPublishedMask: -1, lastPublishedAt: 0, lastPublishedProgress: null,
    context: { HPV2QueuePickup: record => { sent.push([now, record && record.mask]); return true; } },
  });
  const sample = (at, angle, rate, mask = 1) => {
    now = at;
    box.clipCaptures = [{ progress: { angle, rate, at } }];
    box.progressDirty = true;
    box.publish('PLAYER', mask);
  };
  sample(1000, -300, 0);
  sample(4000, -270, 0); // first fit not predicted
  sample(7000, -240, 10); // countdown starts
  sample(10000, -210, 10); // predicted: skipped
  assert.deepEqual(sent.map(item => item[0]), [1000, 4000, 7000]);
  sample(13000, -180, 10); // heartbeat at 6 s
  sample(16000, -350, 0); // refresh jumps back
  sample(19000, -350, 0); // still paused/refitting: predicted
  sample(22000, -350, 0); // heartbeat
  sample(23000, -350, 0, 0); // expiry
  assert.deepEqual(sent.map(item => item[0]), [1000, 4000, 7000, 13000, 16000, 22000, 23000]);
  assert.equal(sent.at(-1)[1], 0);
});

// Unchanged snapshots wait 8 s; a 15-degree prediction miss or state transition corrects early.
test('ultimate snapshots use an 8 s heartbeat and correct prediction or state changes', () => {
  let now = 0, angle = 90, unlocked = true, ready = false, present = true;
  const sent = [];
  const box = timerFunctions(['parseUltimateClip', 'ultimateTick'], {
    Date: { now: () => now }, JSON, Math, Number, String, isFinite,
    stopped: false, context: {}, sessionStartedAt: 0, lastUltimateKey: '', lastUltimateSentAt: 0,
    lastUltimatePlayers: Object.create(null), ULTIMATE_PREDICT_TOLERANCE: 15,
    valid: () => true, ultimateTimerEnabled: () => true,
    countRowNames: () => ({ names: [present ? 'HAZE' : ''], counts: { HAZE: 1 } }),
    rows: [{
      ultimate: {}, ultimateBackground: { style: { get clip() { return 'radial(50% 50%, 0deg, ' + angle + 'deg)'; } } },
      label: { BAscendantHasClass: name => name === 'UltimateUnlocked' ? unlocked : name === 'UltimateCooldownReady' && ready },
    }],
    $: { Schedule() {}, DispatchEvent: (channel, raw) => sent.push([now, JSON.parse(raw).players]), Msg: message => assert.fail(message) },
  });
  for (now = 0; now <= 16000; now += 1000) box.ultimateTick();
  assert.deepEqual(sent.map(item => item[0]), [0, 8000, 16000]);
  for (let index = 1; index < sent.length; index++) assert.ok(sent[index][0] - sent[index - 1][0] < 12000);
  now = 17000; angle = 104.999; box.ultimateTick();
  assert.equal(sent.length, 3, 'sub-tolerance observation does not broadcast');
  now = 18000; angle = 105; box.ultimateTick();
  assert.equal(sent.at(-1)[0], 18000, 'exactly 15 degrees corrects immediately');
  now = 19000; ready = true; box.ultimateTick();
  assert.deepEqual(sent.at(-1)[1], [['HAZE', 360, 0]]);
  now = 20000; unlocked = ready = false; box.ultimateTick();
  assert.deepEqual(sent.at(-1)[1], [['HAZE', 0, 0]], 'locked has no predicted progress');
  now = 21000; unlocked = true; angle = 0; box.ultimateTick();
  assert.equal(sent.at(-1)[0], 21000, 'unlock is a state change even at the same zero angle');
  now = 22000; present = false; box.ultimateTick();
  assert.deepEqual(sent.at(-1)[1], []);
  now = 23000; present = true; box.ultimateTick();
  assert.equal(sent.at(-1)[0], 23000, 'appearance sends immediately');
  now = 24000; angle = NaN; box.ultimateTick();
  assert.deepEqual(sent.at(-1)[1], [], 'unknown native clip is omitted');
  now = 25000; angle = 90; box.ultimateTick();
  assert.deepEqual(sent.at(-1)[1], [['HAZE', 90, 0]], 'first known sample has unknown rate');
});
