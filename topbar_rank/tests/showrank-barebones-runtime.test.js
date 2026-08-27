'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const repositoryDir = path.join(__dirname, '..', '..');
const projectRoot = path.join(__dirname, '..');
const composition = require(path.join(repositoryDir, 'scripts', 'profile-stats-community-composition'));
const runtimePath = process.env.SHOWRANK_BAREBONES_RUNTIME;
const source = runtimePath
  ? fs.readFileSync(runtimePath, 'utf8')
  : composition.composeBarebonesSources(repositoryDir, projectRoot).runtime;
const rankUrl = (account, base = 'https://api.deadlock-api.com/v1/players', format = 'webp') => `${base}/${account}/rank/image?format=${format}`;
const statlockerUrl = (account) => `https://statlocker.gg/profile/${account}/matches`;
const averageUrl = (accounts, base = 'https://api.deadlock-api.com/v1/players', format = 'webp') => `${base}/rank/image?account_ids=${accounts.join(',')}&format=${format}`;

class Panel {
  constructor(type, options = {}) {
    Object.assign(this, {
      paneltype: type,
      id: options.id || '',
      _text: options.text === undefined ? '' : String(options.text),
      attributes: { ...options.attributes },
      classes: new Set(options.classes || []),
      ascendantClasses: new Set(options.ascendantClasses || []),
      visible: options.visible === undefined ? true : options.visible,
      valid: options.valid === undefined ? true : options.valid,
      children: [],
      parent: null,
      images: [],
      panelEvents: Object.create(null),
      _work: null,
      beforeIsValid: options.beforeIsValid || null,
    });
  }
  set text(value) { this._text = value; }
  get text() {
    if (this._work && isWorkAttached(this)) {
      this._work.panelCalls.text[this.id] = (this._work.panelCalls.text[this.id] || 0) + 1;
    }
    return this._text;
  }
  setWork(work) { this._work = work; this.children.forEach((child) => child.setWork(work)); }
  add(child) { child.parent = this; if (this._work) child.setWork(this._work); this.children.push(child); return child; }
  IsValid() {
    recordPanelCall(this, 'IsValid', []);
    if (this.beforeIsValid) this.beforeIsValid(this);
    return this.valid;
  }
  GetParent() { recordPanelCall(this, 'GetParent', []); return this.parent; }
  BHasClass(className) { recordPanelCall(this, 'BHasClass', [className]); return this.classes.has(className); }
  BAscendantHasClass(className) {
    recordPanelCall(this, 'BAscendantHasClass', [className]);
    for (let panel = this; panel; panel = panel.parent) {
      if (panel.classes.has(className) || panel.ascendantClasses.has(className)) return true;
    }
    return false;
  }
  AddClass(className) { recordPanelCall(this, 'AddClass', [className]); this.classes.add(className); }
  RemoveClass(className) { recordPanelCall(this, 'RemoveClass', [className]); this.classes.delete(className); }
  GetAttributeString(name, fallback) {
    recordPanelCall(this, 'GetAttributeString', [name, fallback]);
    if (!this.valid) throw new Error(`invalid panel ${this.id}`);
    return this.attributes[name] === undefined ? fallback : String(this.attributes[name]);
  }
  FindChildTraverse(id) {
    recordPanelCall(this, 'FindChildTraverse', [id]);
    if (!this.valid) throw new Error(`invalid panel ${this.id}`);
    for (const child of this.children) {
      if (child.id === id) return child;
      const nested = child.FindChildTraverse(id);
      if (nested) return nested;
    }
    return null;
  }
  FindChildrenWithClassTraverse(className) {
    recordPanelCall(this, 'FindChildrenWithClassTraverse', [className]);
    const found = [];
    for (const child of this.children) {
      if (child.classes.has(className)) found.push(child);
      found.push(...child.FindChildrenWithClassTraverse(className));
    }
    return found;
  }
  SetPanelEvent(name, callback) { this.panelEvents[name] = callback; }
  SetImage(url) {
    recordPanelCall(this, 'SetImage', [url]);
    if (!this.valid) throw new Error(`invalid image ${this.id}`);
    this.images.push(url);
  }
  DeleteAsync() {
    recordPanelCall(this, 'DeleteAsync', []);
    this.valid = false;
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }
}

function recordPanelCall(panel, method, args) {
  if (!panel._work) return;
  panel._work.panelCalls[method] += 1;
  panel._work.queries.push({ method, id: panel.id, args });
}

function isWorkAttached(panel) {
  const documentRoot = panel._work && panel._work.documentRoot;
  for (let current = panel; current; current = current.parent) {
    if (current === documentRoot) return true;
  }
  return false;
}

function createWork() {
  const panelCalls = {
    IsValid: 0,
    GetParent: 0,
    BHasClass: 0,
    BAscendantHasClass: 0,
    GetAttributeString: 0,
    FindChildTraverse: 0,
    FindChildrenWithClassTraverse: 0,
    SetImage: 0,
    AddClass: 0,
    RemoveClass: 0,
    DeleteAsync: 0,
    text: {},
  };
  return { scheduled: 0, callbacks: 0, callbacksByDelay: {}, panelCalls, queries: [] };
}

function profile(account, options = {}) {
  const root = new Panel('CitadelProfileCard', { id: options.id || 'ProfileCard', classes: ['ShowRankBarebonesProfileCard'], ascendantClasses: options.ascendantClasses, valid: options.valid, attributes: { ...(options.accountid === undefined ? { accountid: account } : { accountid: options.accountid }), ...(options.steamid === undefined ? {} : { steamid: options.steamid }) } });
  const contents = root.add(new Panel('Panel', { id: 'ContentsMain' }));
  const accountPanel = contents.add(new Panel('Panel', { id: 'AccountID' }));
  const witness = contents.add(new Panel('Label', { id: 'ShowRankBarebonesAccount', text: options.witness === undefined ? account : options.witness }));
  const contextWitness = contents.add(new Panel('Label', { id: 'ProfileStatsCommunityContextAccount', text: options.contextWitness === undefined ? account : options.contextWitness }));
  const image = root.add(new Panel('Panel', { id: 'CardOverlay' })).add(new Panel('Image', { id: 'ShowRankBarebonesRankImage', valid: options.imageValid, visible: options.imageVisible }));
  return { root, accountPanel, witness, contextWitness, image };
}
function setProfileAccount(card, account) { card.witness.text = account; card.contextWitness.text = account; card.root.attributes.accountid = account; delete card.root.attributes.steamid; }
function profilePage(account, options = {}) {
  const root = new Panel('CitadelProfilePage', { id: options.id || 'ProfilePage', classes: ['ShowRankBarebonesProfilePage'], valid: options.valid, attributes: { ...(options.accountid === undefined ? { accountid: account } : { accountid: options.accountid }), ...(options.steamid === undefined ? {} : { steamid: options.steamid }) } });
  const profileInfo = root.add(new Panel('Panel', { id: 'ProfileInfo' }));
  const witness = profileInfo.add(new Panel('Label', { id: 'ShowRankBarebonesProfilePageAccount', text: options.witness === undefined ? account : options.witness }));
  const image = profileInfo.add(new Panel('Panel', { id: 'ShowRankBarebonesProfilePageRankHost' })).add(new Panel('Image', { id: 'ShowRankBarebonesProfilePageRankImage', valid: options.imageValid, visible: options.imageVisible }));
  return { root, witness, image };
}
function setProfilePageAccount(page, account) { page.witness.text = account; page.root.attributes.accountid = account; delete page.root.attributes.steamid; }
function topbar(hero, id = `Topbar-${hero}`) {
  const root = new Panel('CitadelHudTopBarPlayer', { id, classes: ['ShowRankBarebonesTopbarPlayer'] });
  const heroLabel = root.add(new Panel('Label', { id: `${id}-HeroName`, text: hero, classes: ['HeroName'] }));
  const image = root.add(new Panel('Panel', { id: 'HeroContents' })).add(new Panel('Image', { id: 'ShowRankBarebonesTopbarRankImage', visible: false }));
  return { root, heroLabel, image };
}
function row(hero, options = {}) { const root = new Panel('CitadelPlayersListEntry', { id: options.id || `Row-${hero}`, classes: ['ShowRankBarebonesPlayerRow'] }); const mainContents = root.add(new Panel('Panel', { id: 'MainContents', valid: options.mainValid })); const heroLabel = mainContents.add(new Panel('Label', { id: 'ShowRankBarebonesRowHero', text: hero })); const image = mainContents.add(new Panel('Image', { id: 'ShowRankBarebonesPlayerListRankImage', visible: false })); return { root, mainContents, heroLabel, image }; }
function escape() { const root = new Panel('CitadelHudEscapeMenu', { id: 'Escape' }); return { root, playersTab: root.add(new Panel('TabButton', { id: 'PlayersTab' })) }; }
function addContextRow(parent, id, text) { const rowPanel = parent.add(new Panel('Panel', { id, classes: ['MenuRow'] })); return rowPanel.add(new Panel('TextButton', { id: 'MenuButton', text })); }
function contextMenu(card) { const root = new Panel('CitadelContextMenuPlayer', { id: 'PersonalContextMenu' }); root.add(card.root); const options = root.add(new Panel('Panel', { id: 'MenuOptionsPanel' })); const statlockerButton = addContextRow(options, 'ShowRankBarebonesStatlockerRow', 'Statlocker Profile'); const copyButton = addContextRow(options, 'ShowRankBarebonesCopyAccountRow', 'Copy Account ID'); const playerProfileButton = addContextRow(root, 'ProfileStatsCommunityPlayerProfileRow', 'Player Profile'); return { root, statlockerButton, copyButton, playerProfileButton }; }
const STANDARD_HEROES = ['haze', 'infernus', 'vindicta', 'abrams', 'bebop', 'dynamo', 'kelvin', 'lash', 'mcginnis', 'mo_and_krill', 'paradox', 'pocket'];
function playerRoster(heroes, prefix = '') { const friendly = new Panel('CitadelHudTopBarTeam', { id: 'TeamFriendly' }); const enemy = new Panel('CitadelHudTopBarTeam', { id: 'TeamEnemy' }); const bars = heroes.map((hero, index) => { const bar = topbar(hero, `${prefix}Bar-${index}`); (index < heroes.length / 2 ? friendly : enemy).add(bar.root); return bar; }); return { bars, rows: heroes.map((hero, index) => row(hero, { id: `${prefix}Row-${index}` })), friendly, enemy }; }
function wirePlayerRoster(h, card, roster, accountForIndex) { h.attach(roster.friendly); h.attach(roster.enemy); roster.bars.forEach((bar) => h.evaluate(bar.root)); roster.rows.forEach((player, index) => { h.evaluate(player.root); h.on(player.mainContents, () => setProfileAccount(card, accountForIndex(index))); }); }

function harness(options = {}) {
  const scheduled = [], events = [], handlers = new Map(), dollars = [], openedUrls = [], openedProfiles = [], copiedAccounts = [], closedContexts = [], nativeContextDismissals = [], trace = [];
  const scheduledDelays = new WeakMap();
  const work = createWork();
  let currentTime = 0;
  let insertionOrder = 0;
  let nativeContextDismissal = options.nativeContextDismissal || null;
  const documentRoot = new Panel('CitadelHud', { id: 'Hud', classes: ['ShowEscapeMenu', ...(options.hideout ? ['connectedToHideout'] : [])] });
  work.documentRoot = documentRoot;
  documentRoot.setWork(work);
  const averageFriendly = documentRoot.add(new Panel('Image', { id: 'ShowRankBarebonesAverageFriendlyImage', visible: false }));
  const averageEnemy = documentRoot.add(new Panel('Image', { id: 'ShowRankBarebonesAverageEnemyImage', visible: false }));
  const gameClock = documentRoot.add(new Panel('Label', { id: 'GameTime', text: '8:00', classes: ['GameTime'] }));
  function dispatch(event, first, second) {
    if (event === 'ExternalBrowserGoToURL') {
      if (options.externalBrowserEvent === false) throw new Error('external browser event unavailable');
      assert.strictEqual(typeof first, 'string', 'external browser receives the URL as its only payload');
      assert.strictEqual(second, undefined, 'external browser event has no fabricated second payload');
      openedUrls.push({ method: event, url: first });
      return;
    }
    if (event === 'CopyStringToClipboard') {
      assert.strictEqual(typeof first, 'string', 'clipboard receives text instead of a panel');
      assert.strictEqual(second, first, 'Panorama clipboard receives the text in both payload positions');
      copiedAccounts.push(first);
      return;
    }
    if (event === 'CitadelShowProfilePageForAccount') {
      assert.strictEqual(typeof first, 'number', 'player profile receives the selected SteamID3 as a number');
      assert.strictEqual(second, undefined, 'player profile event has no fabricated second payload');
      openedProfiles.push(first);
      return;
    }
    if (event === 'DismissAllContextMenus' || event === 'DropInputFocus') {
      assert.strictEqual(first, undefined, `${event} has no fabricated payload`);
      assert.strictEqual(second, undefined, `${event} has no fabricated payload`);
      closedContexts.push(event);
      return;
    }
    assert.strictEqual(event, 'Activated', 'the runtime may dispatch only clipboard, profile, cleanup, or panel activation events');
    assert.ok(first instanceof Panel, 'activation targets a local panel');
    if (first.id === 'MainContents') assert.strictEqual(second, 'mouse', 'player profile cards require mouse activation');
    else assert.strictEqual(second, undefined, 'Players-tab activation has no fabricated input');
    events.push(first);
    trace.push(`Activated:${first.id}`);
    const handler = handlers.get(first);
    if (handler) handler();
  }
  function dismissNativeContext(event) {
    nativeContextDismissals.push(event);
    trace.push(event);
    if (nativeContextDismissal) nativeContextDismissal(event);
    dispatch(event);
  }
  function enqueue(delay, callback) {
    const entry = { dueAt: currentTime + delay, insertionOrder: insertionOrder += 1, callback };
    scheduled.push(entry);
    scheduledDelays.set(entry, delay);
    work.scheduled += 1;
    return scheduled.length;
  }
  function nextScheduledIndex(predicate = () => true) {
    let selected = -1;
    for (let index = 0; index < scheduled.length; index += 1) {
      const entry = scheduled[index];
      if (!predicate(entry)) continue;
      if (selected < 0
        || entry.dueAt < scheduled[selected].dueAt
        || (entry.dueAt === scheduled[selected].dueAt
          && entry.insertionOrder < scheduled[selected].insertionOrder)) selected = index;
    }
    return selected;
  }
  function runScheduled(index) {
    const entry = scheduled.splice(index, 1)[0];
    currentTime = entry.dueAt;
    work.callbacks += 1;
    const delay = scheduledDelays.get(entry);
    work.callbacksByDelay[delay] = (work.callbacksByDelay[delay] || 0) + 1;
    entry.callback();
  }
  function resetWork() {
    const fresh = createWork();
    work.scheduled = fresh.scheduled;
    work.callbacks = fresh.callbacks;
    work.callbacksByDelay = fresh.callbacksByDelay;
    work.panelCalls = fresh.panelCalls;
    work.queries = fresh.queries;
  }
  function snapshotWork() {
    return {
      scheduled: work.scheduled,
      callbacks: work.callbacks,
      callbacksByDelay: { ...work.callbacksByDelay },
      panelCalls: { ...work.panelCalls, text: { ...work.panelCalls.text } },
      queries: work.queries.map((query) => ({ ...query, args: query.args.slice() })),
    };
  }
  return {
    documentRoot, gameClock, averageFriendly, averageEnemy, events, dollars, openedUrls, openedProfiles, copiedAccounts, closedContexts, nativeContextDismissals, trace,
    attach(panel) {
      panel.setWork(work);
      if (!panel.parent) documentRoot.add(panel);
    },
    evaluate(panel, evaluateOptions = {}) {
      panel.setWork(work);
      if (evaluateOptions.attach !== false && !panel.parent) documentRoot.add(panel);
      const dollar = {
        GetContextPanel: () => panel,
        Schedule: (delay, callback) => enqueue(delay, callback),
        DispatchEvent: dispatch,
        CreatePanel: (type, parent, id) => parent.add(new Panel(type, { id })),
      };
      dollars.push(dollar);
      vm.runInNewContext(source, {
        $: dollar,
        DismissAllContextMenus: () => dismissNativeContext('DismissAllContextMenus'),
        DropInputFocus: () => dismissNativeContext('DropInputFocus'),
        GameUI: new Proxy({}, { get() { throw new Error('global HUD traversal'); } }),
        Players: new Proxy({}, { get() { throw new Error('player API access'); } }),
        Entities: new Proxy({}, { get() { throw new Error('entity API access'); } }),
      }, { filename: 'showrank_barebones.js' });
      return dollar;
    },
    on(panel, callback) { handlers.set(panel, callback); },
    setNativeContextDismissal(callback) { nativeContextDismissal = callback; },
    defer(callback, delay = 0) { return enqueue(delay, callback); },
    drain(limit = 400) {
      let count = 0;
      while (scheduled.length) {
        assert.ok(count < limit, 'all scheduled behavior completes within a fixed bound');
        runScheduled(nextScheduledIndex());
        count += 1;
      }
      return count;
    },
    runNext() {
      assert.ok(scheduled.length, 'a scheduled callback is available');
      runScheduled(nextScheduledIndex());
    },
    runDelay(delay) {
      const index = nextScheduledIndex((entry) => scheduledDelays.get(entry) === delay);
      assert.ok(index >= 0, `a ${delay}s callback is available`);
      runScheduled(index);
    },
    advance(seconds, limit = 10000) {
      const target = currentTime + seconds;
      let count = 0;
      for (let index = nextScheduledIndex((entry) => entry.dueAt <= target);
        index >= 0;
        index = nextScheduledIndex((entry) => entry.dueAt <= target)) {
        assert.ok(count < limit, 'virtual time completes within a fixed callback bound');
        runScheduled(index);
        count += 1;
      }
      currentTime = target;
      return count;
    },
    dropNextDelay(delay) {
      const index = nextScheduledIndex((entry) => entry.dueAt - currentTime === delay);
      assert.ok(index >= 0, `a ${delay}s callback is available`);
      scheduled.splice(index, 1);
      return true;
    },
    resetWork,
    snapshotWork,
    pending() { return scheduled.length; },
  };
}
function assertCleared(image, description) { assert.strictEqual(image.visible, false, `${description}: hidden`); assert.deepStrictEqual(image.images, [''], `${description}: stale URL cleared`); }

function captureBaseline(label, h) {
  if (process.env.SHOWRANK_CAPTURE_BASELINE !== '1') return;
  process.stdout.write(`${JSON.stringify({ label, ...h.snapshotWork() })}\n`);
}

function rootRosterScans(snapshot) {
  const count = (className) => snapshot.queries.filter((query) =>
    query.method === 'FindChildrenWithClassTraverse' && query.id === 'Hud' &&
    query.args.length === 1 && query.args[0] === className,
  ).length;
  return {
    topbars: count('ShowRankBarebonesTopbarPlayer'),
    rows: count('ShowRankBarebonesPlayerRow'),
  };
}
function topbarHeroReads(snapshot) {
  return Object.entries(snapshot.panelCalls.text).reduce(
    (total, [id, count]) => total + (id.endsWith('-HeroName') ? count : 0),
    0,
  );
}
function rowHeroReads(snapshot) {
  return snapshot.panelCalls.text.ShowRankBarebonesRowHero || 0;
}


function assertTopbarEvidenceBudget(snapshot, budget, label) {
  const textReads = Object.values(snapshot.panelCalls.text).reduce((total, count) => total + count, 0);
  assert.ok(topbarHeroReads(snapshot) <= budget.heroReads, `${label}: top-bar hero reads stay within the snapshot budget`);
  if (budget.rowHeroReads !== undefined) {
    assert.ok(rowHeroReads(snapshot) <= budget.rowHeroReads, `${label}: row hero reads stay within the roster-model budget`);
  }
  assert.ok(textReads <= budget.textReads, `${label}: total text reads stay within the measured budget`);
  assert.ok(snapshot.panelCalls.FindChildTraverse <= budget.findChild, `${label}: child lookups stay within the measured budget`);
  assert.ok(snapshot.panelCalls.GetParent <= budget.getParent, `${label}: parent walks stay within the measured budget`);
}
function assertEscapeIntent(intent, sourceName, step, label) {
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(intent)),
    {
      source: sourceName,
      step,
      mayStartPreload: step === 'start_preload',
      mayProbeRows: step === 'probe_rows',
      mayShowSpinner: false,
      shouldReplayCache: step === 'replay_cache',
      shouldScheduleRetry: step === 'wait_roster',
      shouldFinish: step === 'finish',
      shouldStop: step === 'source_blocked' || step === 'transition_stop',
    },
    label,
  );
}


function missingState(h) {
  return h.documentRoot.__showrank_barebones_state_v1;
}

function activeMissingRecords(h) {
  return missingState(h).missingRecords.filter((record) => record.active);
}

function assertOneMissingLeader(h, message) {
  const state = missingState(h);
  const leaders = activeMissingRecords(h).filter((record) => record.root === state.missingLeaderRoot);
  assert.strictEqual(leaders.length, 1, message);
}

function assertMissingStopped(h, notificationRoot, message) {
  const state = missingState(h);
  assert.strictEqual(state.missingRunning, false, `${message}: session stopped`);
  assert.strictEqual(state.missingRecords.length, 0, `${message}: records released`);
  assert.strictEqual(h.pending(), 0, `${message}: no missing callbacks remain`);
  assert.strictEqual(notificationRoot.__showrank_barebones_missing_toast_state_v2, null, `${message}: toast state released`);
}

function containsPanel(value, seen = new Set()) {
  if (value instanceof Panel) return true;
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((child) => containsPanel(child, seen));
}

{
  const h = harness(); const card = profile('123456'); h.evaluate(card.root);
  assert.deepStrictEqual(card.image.images, [rankUrl('123456')], 'the runtime uses canonical rank-image defaults');
}

{
  const h = harness(); const card = profile('123456'); h.evaluate(card.root); h.drain();
  setProfileAccount(card, '123457'); card.root.ShowRankBarebonesRefresh();
  assert.deepStrictEqual(card.image.images, [rankUrl('123456'), ''], 'switching a shown account clears its old image before verification');
  h.drain();
  assert.deepStrictEqual(card.image.images, [rankUrl('123456'), '', rankUrl('123457')], 'two stable samples set the switched account rank URL');
}

// Preserve independent profile-card witness and reuse cases.
{
  const h = harness(); const card = profile('123456', { steamid: '76561197960389184' }); h.evaluate(card.root);
  assert.deepStrictEqual(card.image.images, [rankUrl('123456')], 'matching direct and Steam64 witnesses render the exact URL'); assert.strictEqual(card.image.visible, true); assert.strictEqual(h.drain(), 2, 'startup watch is finite');
}
{
  const h = harness(); const card = profile('123456', {
    witness: ' 000123456 ',
    contextWitness: '000123456',
    accountid: '123456',
  }); h.evaluate(card.root);
  assert.deepStrictEqual(card.image.images, [rankUrl('123456')], 'the shared identity policy canonicalizes matching direct witnesses');
}
{
  const h = harness(); const card = profile('', { accountid: undefined, witness: '', imageVisible: true }); h.evaluate(card.root); assertCleared(card.image, 'unbound profile'); setProfileAccount(card, '123456'); h.drain(); assert.deepStrictEqual(card.image.images, ['', rankUrl('123456')], 'delayed profile evidence binds on retry');
}
{
  const h = harness(); const card = profile('123456', {
    witness: '',
    contextWitness: '',
    accountid: '123456',
    imageVisible: true,
  }); h.evaluate(card.root);
  assertCleared(card.image, 'root-only profile authority');
}
for (const [label, options] of [
  ['hidden mismatch', { witness: '123457', accountid: '123456', steamid: '76561197960389184' }],
  ['account mismatch', { witness: '123456', accountid: '123457', steamid: '76561197960389184' }],
  ['Steam64 mismatch', { witness: '123456', accountid: '123456', steamid: '76561197960389185' }],
  ['Steam64 direct-witness format', { witness: '76561197960389184', contextWitness: '123456', accountid: '123456' }],
  ['Steam3 context-witness format', { witness: '123456', contextWitness: '[U:1:123456]', accountid: '123456' }],
]) { const h = harness(); const card = profile('123456', { ...options, imageVisible: true }); h.evaluate(card.root); assertCleared(card.image, label); }
for (const invalid of ['', '0', '-1', '1.5', '1e3', '123456x', '4294967296', '9007199254740993', 'Infinity', 'NaN']) { const h = harness(); const card = profile(invalid, { witness: invalid, accountid: invalid, imageVisible: true }); h.evaluate(card.root); assertCleared(card.image, `invalid ${JSON.stringify(invalid)}`); }
{
  const h = harness(); const card = profile('123456'); h.evaluate(card.root); card.root.attributes.accountid = '123457'; h.drain(); assert.deepStrictEqual(card.image.images, [rankUrl('123456'), ''], 'conflicting reused-card evidence clears the old rank');
}
{
  const h = harness(); const card = profile('123456'); h.evaluate(card.root); h.drain();
  card.root.ShowRankBarebonesRefresh();
  assert.strictEqual(card.image.images.at(-1), '', 'hover clears the stale badge even when the popup document has no hideout class');
  h.runNext();
  setProfileAccount(card, '123457');
  h.drain();
  assert.strictEqual(card.image.images.at(-1), rankUrl('123457'), 'bounded hover verification follows a late popup account binding');
  assert.strictEqual(h.pending(), 0, 'popup-local hover verification remains finite');
}

// Characterize ten immediate hover refreshes after a settled profile card.
{
  const h = harness(); const card = profile('123456');
  h.evaluate(card.root); h.drain();
  h.resetWork();
  for (let refresh = 0; refresh < 10; refresh += 1) card.root.ShowRankBarebonesRefresh();
  h.drain();
  captureBaseline('baseline.profile-refreshes-x10', h);
}
{
  const h = harness(); const card = profile('123456'); h.evaluate(card.root); h.drain();
  setProfileAccount(card, '123457');
  card.root.ShowRankBarebonesRefresh();
  h.drain();
  assert.strictEqual(card.image.images.at(-1), rankUrl('123457'), 'a reused hover card updates when native binding changes without mouse entering the popup');
}
{
  const h = harness({ hideout: true }); const card = profile('123456'); h.evaluate(card.root);
  for (let index = 0; index < 7; index += 1) h.runNext();
  assert.strictEqual(card.image.images.at(-1), rankUrl('123456'), 'initial reused popup account settles');
  setProfileAccount(card, '123457');
  assert.ok(h.pending() > 0, 'hideout popup remains watched after the old two-second retry window');
  h.runNext(); h.runNext();
  assert.strictEqual(card.image.images.at(-1), rankUrl('123457'), 'bounded popup watch replaces the rank without another popup mouseover');
  h.drain();
}

// Hideout dashboard profiles use the direct account witness and settle without orphaned callbacks.
{
  const h = harness({ hideout: true }); const page = profilePage('', { accountid: undefined, witness: '', imageVisible: true });
  h.evaluate(page.root);
  assertCleared(page.image, 'unbound hideout profile page');
  setProfilePageAccount(page, '123456');
  h.drain();
  assert.deepStrictEqual(page.image.images, ['', rankUrl('123456')], 'the hideout profile page binds after finite direct-account verification');
  setProfilePageAccount(page, '123457');
  page.root.ShowRankBarebonesRefresh();
  h.drain();
  assert.deepStrictEqual(page.image.images, ['', rankUrl('123456'), '', rankUrl('123457')], 'a reused hideout page clears stale A before rendering verified B');
  assert.strictEqual(h.pending(), 0, 'hideout profile-page verification leaves no callback behind');
}
for (const [label, options] of [
  ['mismatched direct witnesses', { witness: '123457', accountid: '123456' }],
  ['invalid direct account', { witness: '123456x', accountid: '123456x' }],
]) {
  const h = harness({ hideout: true }); const page = profilePage('123456', { ...options, imageVisible: true });
  h.evaluate(page.root); h.drain();
  assertCleared(page.image, `hideout profile page ${label}`);
  assert.strictEqual(h.pending(), 0, `hideout profile page ${label} fails closed without callbacks`);
}

// Hovering a profile in hideout clears its old badge until two stable direct witnesses prove the replacement.
{
  const h = harness({ hideout: true }); const card = profile('123456'); h.evaluate(card.root); h.drain();
  assert.strictEqual(card.image.images.at(-1), rankUrl('123456'), 'the pre-hover badge is present');
  card.root.ShowRankBarebonesRefresh();
  assert.strictEqual(card.image.images.at(-1), '', 'hideout hover clears the existing badge before stabilization');
  assert.ok(h.pending() > 0, 'hideout hover continues through finite direct-account verification');
  h.runNext();
  assert.strictEqual(card.image.images.at(-1), '', 'one stable direct-account sample cannot restore the cleared badge');
  setProfileAccount(card, '123457');
  h.drain();
  assert.strictEqual(card.image.images.at(-1), rankUrl('123457'), 'a later account change restarts stabilization and replaces the badge');
  assert.strictEqual(h.pending(), 0, 'hideout hover stabilization completes without callbacks');
}
// Global hideout ancestry is authoritative even when the popup's document root lacks the class.
{
  const h = harness(); const card = profile('123456', { ascendantClasses: ['connectedToHideout'] }); h.evaluate(card.root); h.drain();
  card.root.ShowRankBarebonesRefresh();
  assert.strictEqual(card.image.images.at(-1), '', 'ascendant hideout detection clears the old badge before verification');
  h.runNext();
  setProfileAccount(card, '123457');
  h.runNext();
  h.runNext();
  assert.strictEqual(card.image.images.at(-1), rankUrl('123457'), 'ascendant hideout detection updates the badge after two stable changed-account samples');
  h.drain();
  assert.strictEqual(h.pending(), 0, 'ascendant hideout verification remains finite');
}


{
  const h = harness(); const card = profile('123456'), menu = contextMenu(card); const menuDollar = h.evaluate(menu.root); h.evaluate(card.root);
  assert.strictEqual(menuDollar.ShowRankBarebonesOpenStatlocker, undefined, 'context actions do not depend on context-local globals');
  assert.strictEqual(typeof card.root.ShowRankBarebonesOpenStatlocker, 'function', 'profile startup installs its local StatLocker action');
  assert.strictEqual(typeof card.root.ShowRankBarebonesOpenPlayerProfile, 'function', 'profile startup installs its local Player Profile action');
  assert.strictEqual(typeof card.root.ShowRankBarebonesCopyAccount, 'function', 'profile startup installs its local account-copy action');
  card.root.ShowRankBarebonesOpenStatlocker();
  card.root.ShowRankBarebonesOpenPlayerProfile();
  card.root.ShowRankBarebonesCopyAccount();
  assert.deepStrictEqual(
    { openedUrls: h.openedUrls, openedProfiles: h.openedProfiles, copiedAccounts: h.copiedAccounts },
    {
      openedUrls: [{ method: 'ExternalBrowserGoToURL', url: statlockerUrl('123456') }],
      openedProfiles: [123456],
      copiedAccounts: ['123456'],
    },
    'all profile-local context actions use the selected account',
  );
}
{
  const h = harness(); const card = profile(''), menu = contextMenu(card); h.evaluate(menu.root); h.evaluate(card.root);
  card.root.ShowRankBarebonesOpenStatlocker();
  card.root.ShowRankBarebonesOpenPlayerProfile();
  card.root.ShowRankBarebonesCopyAccount();
  assert.deepStrictEqual({ openedUrls: h.openedUrls, openedProfiles: h.openedProfiles, copiedAccounts: h.copiedAccounts }, { openedUrls: [], openedProfiles: [], copiedAccounts: [] }, 'blank click-time evidence fails closed');
  setProfileAccount(card, '234567');
  card.root.ShowRankBarebonesOpenStatlocker();
  card.root.ShowRankBarebonesOpenPlayerProfile();
  card.root.ShowRankBarebonesCopyAccount();
  assert.deepStrictEqual(h.openedUrls, [{ method: 'ExternalBrowserGoToURL', url: statlockerUrl('234567') }], 'StatLocker resolves newly bound evidence at click time');
  assert.deepStrictEqual(h.openedProfiles, [234567], 'Player Profile resolves newly bound evidence at click time');
  assert.deepStrictEqual(h.copiedAccounts, ['234567'], 'Copy Account ID resolves newly bound evidence at click time');
}
{
  const h = harness(); const card = profile(''), menu = contextMenu(card); const passive = topbar('haze');
  passive.root.attributes.accountid = '123456';
  h.attach(passive.root);
  h.evaluate(passive.root);
  h.evaluate(menu.root);
  h.evaluate(card.root);
  card.root.ShowRankBarebonesOpenPlayerProfile();
  assert.deepStrictEqual(h.openedProfiles, [], 'Passive top-bar evidence cannot establish viewed-profile identity');
}
{
  const h = harness({ externalBrowserEvent: false }); const card = profile('123456'), menu = contextMenu(card); h.evaluate(menu.root); h.evaluate(card.root);
  assert.doesNotThrow(() => card.root.ShowRankBarebonesOpenStatlocker(), 'an unavailable native browser event is contained');
  assert.deepStrictEqual(h.openedUrls, [], 'StatLocker has no unrelated browser fallback');
}
{
  const h = harness(); const card = profile('123456', { witness: '654321' }), menu = contextMenu(card); h.evaluate(menu.root); h.evaluate(card.root);
  card.root.ShowRankBarebonesOpenStatlocker();
  card.root.ShowRankBarebonesOpenPlayerProfile();
  card.root.ShowRankBarebonesCopyAccount();
  assert.deepStrictEqual(h.openedUrls, []);
  assert.deepStrictEqual(h.openedProfiles, []);
  assert.deepStrictEqual(h.copiedAccounts, [], 'conflicting account evidence blocks every context action');
}
{
  const h = harness(); const card = profile('123456', { contextWitness: '654321' }), menu = contextMenu(card); h.evaluate(menu.root); h.evaluate(card.root);
  card.root.ShowRankBarebonesOpenPlayerProfile();
  assert.deepStrictEqual(h.openedProfiles, [], 'conflicting selected-card witnesses block native profile navigation');
}
{
  const h = harness(); const card = profile('123456'), menu = contextMenu(card); h.evaluate(menu.root); h.evaluate(card.root);
  card.contextWitness.text = null;
  card.root.ShowRankBarebonesOpenStatlocker();
  card.root.ShowRankBarebonesOpenPlayerProfile();
  card.root.ShowRankBarebonesCopyAccount();
  assert.deepStrictEqual(
    { openedUrls: h.openedUrls, openedProfiles: h.openedProfiles, copiedAccounts: h.copiedAccounts },
    { openedUrls: [], openedProfiles: [], copiedAccounts: [] },
    'unreadable selected-card evidence blocks every context action',
  );
}
{
  const h = harness(); const card = profile('123456'), menu = contextMenu(card); h.evaluate(menu.root); h.evaluate(card.root);
  card.root.GetAttributeString = () => { throw new Error('unreadable authority'); };
  card.root.ShowRankBarebonesOpenStatlocker();
  card.root.ShowRankBarebonesOpenPlayerProfile();
  card.root.ShowRankBarebonesCopyAccount();
  assert.deepStrictEqual(
    { openedUrls: h.openedUrls, openedProfiles: h.openedProfiles, copiedAccounts: h.copiedAccounts },
    { openedUrls: [], openedProfiles: [], copiedAccounts: [] },
    'unreadable profile authority blocks every context action',
  );
}

{
  const h = harness(); const invalidRoot = profile('123456', { valid: false, imageVisible: true }); h.evaluate(invalidRoot.root);
  assert.doesNotThrow(() => h.drain(), 'invalidated profile roots are ignored during their finite retries');
  const card = profile('123456'); h.evaluate(card.root); card.image.valid = false;
  assert.doesNotThrow(() => h.drain(), 'invalidated profile images are ignored during their finite retries');
}

// One document-scoped leader coordinates the early-match indicator without changing native health visibility.
{
  const h = harness();
  h.gameClock.text = '7:59';
  const topbarRoot = new Panel('CitadelHudTopBar', { id: 'TopBar' });
  const player = topbar('Haze', 'ActiveWindow-Haze');
  player.root.AddClass('HealthVisible');
  topbarRoot.add(player.root);
  h.attach(topbarRoot);
  h.evaluate(player.root);
  assert.strictEqual(player.root.BHasClass('ShowRankBarebonesMissingWindowExpired'), false, 'a parseable clock below eight minutes leaves this player warning eligible');
  assert.strictEqual(player.root.BHasClass('HealthVisible'), true, 'the coordinator leaves native HealthVisible untouched');
  assertOneMissingLeader(h, 'one active record owns the single leader lease');
}

// Twelve roles share one 0.5-second leader chain and one 1.0-second backup each.
{
  const h = harness(); const roster = playerRoster(STANDARD_HEROES, 'LeasePolling');
  h.gameClock.text = '7:59';
  h.attach(roster.friendly); h.attach(roster.enemy);
  roster.bars.forEach((bar) => h.evaluate(bar.root));
  h.advance(1);
  h.resetWork();
  h.advance(10);
  const steady = h.snapshotWork();
  assert.ok((steady.callbacksByDelay[0.5] || 0) <= 20, 'ten seconds runs at most twenty leader callbacks');
  assert.ok((steady.callbacksByDelay[1] || 0) <= 120, 'ten seconds runs at most twelve one-second backup callbacks per second');
  assert.ok(steady.callbacks <= 140, 'the coordinator stays within the combined callback budget');
  assert.ok((steady.panelCalls.text.GameTime || 0) <= 20, `only the leader reads #GameTime during steady polling: ${steady.panelCalls.text.GameTime || 0}`);
  assert.strictEqual(activeMissingRecords(h).length, 12, 'all twelve loaded roles remain active');
  assert.strictEqual(new Set(activeMissingRecords(h).map((record) => record.root)).size, 12, 'active records remain unique by root');
  assertOneMissingLeader(h, 'twelve records still expose one active leader');

  h.resetWork();
  h.evaluate(roster.bars[5].root);
  h.advance(1);
  const reread = h.snapshotWork();
  assert.strictEqual(activeMissingRecords(h).length, 12, 're-evaluating an existing root is idempotent');
  assert.strictEqual(new Set(activeMissingRecords(h).map((record) => record.root)).size, 12, 're-evaluation does not duplicate the root record');
  assert.ok((reread.callbacksByDelay[1] || 0) <= 13, 're-evaluation adds no backup beyond twelve records plus its bounded rank refresh');
  assertOneMissingLeader(h, 're-evaluation does not create a concurrent leader');
}

// A backup promotes an invalid leader within one second without creating a second leader.
{
  const h = harness(); const roster = playerRoster(STANDARD_HEROES, 'LeaseInvalidLeader');
  h.gameClock.text = '7:59';
  h.attach(roster.friendly); h.attach(roster.enemy);
  roster.bars.forEach((bar) => h.evaluate(bar.root));
  h.advance(1);
  const previousLeader = missingState(h).missingLeaderRoot;
  previousLeader.valid = false;
  h.advance(1);
  assert.notStrictEqual(missingState(h).missingLeaderRoot, previousLeader, 'a backup replaces the invalid leader within one second');
  assert.strictEqual(activeMissingRecords(h).length, 11, 'the invalid leader record is pruned');
  assertOneMissingLeader(h, 'invalid-leader failover has no concurrent leaders');
}

// A valid leader whose next 0.5-second tick is lost is replaced after two backup checks.
{
  const h = harness(); const roster = playerRoster(STANDARD_HEROES, 'LeaseStalledLeader');
  h.gameClock.text = '7:59';
  h.attach(roster.friendly); h.attach(roster.enemy);
  roster.bars.forEach((bar) => h.evaluate(bar.root));
  const leaderToken = missingState(h).missingLeaderToken;
  h.dropNextDelay(0.5);
  h.advance(2);
  assert.ok(missingState(h).missingLeaderToken > leaderToken, 'two backup checks replace the stalled-valid leader within two seconds');
  assertOneMissingLeader(h, 'stalled-leader failover has no concurrent leaders');
}

// A native visible-to-missing transition creates one Map_Event_Reminders-style toast.
{
  const h = harness();
  h.gameClock.text = '0:30';
  const topbarRoot = new Panel('CitadelHudTopBar', { id: 'TopBar' });
  const notificationRoot = topbarRoot.add(new Panel('Panel', { id: 'ShowRankBarebonesNotificationRoot' }));
  const haze = topbar('Haze', 'MissingToast-Haze');
  const infernus = topbar('Infernus', 'MissingToast-Infernus');
  haze.root.AddClass('HealthVisible');
  infernus.root.AddClass('HealthVisible');
  topbarRoot.add(haze.root);
  topbarRoot.add(infernus.root);
  h.attach(topbarRoot);
  h.evaluate(haze.root);
  h.evaluate(infernus.root);
  assert.strictEqual(notificationRoot.FindChildTraverse('ShowRankBarebonesMissingToast'), null, 'initially visible enemies do not create a toast');
  haze.root.RemoveClass('HealthVisible');
  infernus.root.RemoveClass('HealthVisible');
  h.runDelay(0.5);
  h.runDelay(0);
  const toast = notificationRoot.FindChildTraverse('ShowRankBarebonesMissingToast');
  const icons = toast.FindChildrenWithClassTraverse('ShowRankBarebonesMissingToastIcon');
  assert.ok(toast && toast.BHasClass('GenericAnnouncement'), 'the missing transitions create one native announcement panel');
  assert.strictEqual(toast.FindChildrenWithClassTraverse('AnnouncementTitle')[0].text, 'ENEMY MISSING');
  assert.strictEqual(toast.FindChildrenWithClassTraverse('AnnouncementDescription').length, 0, 'hero names are replaced by the icon row');
  assert.deepStrictEqual(
    icons.map((icon) => icon.images),
    [
      ['s2r://panorama/images/heroes/haze_sm_psd.vtex'],
      ['s2r://panorama/images/heroes/inferno_sm_psd.vtex'],
    ],
    'same-frame missing enemies render their distinct in-game hero icons',
  );
  h.runDelay(0.03);
  assert.strictEqual(toast.BHasClass('ShowRankBarebonesToastVisible'), true, 'the toast reveals after panel creation');
  h.runDelay(3);
  assert.strictEqual(toast.BHasClass('ShowRankBarebonesToastAged'), true, 'the announcement remains visible at low opacity after three seconds');
  assert.strictEqual(toast.BHasClass('ShowRankBarebonesToastExpired'), false, 'aging does not expire an active missing announcement');
  assert.strictEqual(toast.valid, true, 'an active missing announcement is not deleted');
  haze.root.AddClass('HealthVisible');
  h.runDelay(0.5);
  h.runDelay(0);
  const remainingIcons = toast.FindChildrenWithClassTraverse('ShowRankBarebonesMissingToastIcon');
  assert.strictEqual(remainingIcons.length, 1, 'only the remaining missing hero icon stays visible');
  assert.deepStrictEqual(remainingIcons[0].images, ['s2r://panorama/images/heroes/inferno_sm_psd.vtex']);
  infernus.root.AddClass('HealthVisible');
  h.runDelay(0.5);
  h.runDelay(0);
  assert.strictEqual(toast.BHasClass('ShowRankBarebonesToastExpired'), true, 'the announcement expires when no reported enemy remains missing');
  h.runDelay(0.4);
  assert.strictEqual(toast.valid, false, 'the cleared announcement is deleted after its fade');
  h.gameClock.text = '8:00';
  h.runDelay(0.5);
  h.advance(3);
  assert.strictEqual(h.pending(), 0, 'the eight-minute boundary leaves no recurring work');
}


// Native death is not a missing-lane transition.
{
  const h = harness();
  h.gameClock.text = '0:30';
  const topbarRoot = new Panel('CitadelHudTopBar', { id: 'TopBar' });
  const notificationRoot = topbarRoot.add(new Panel('Panel', { id: 'ShowRankBarebonesNotificationRoot' }));
  const player = topbar('Haze', 'Dead-Haze');
  player.root.AddClass('HealthVisible');
  topbarRoot.add(player.root);
  h.attach(topbarRoot);
  h.evaluate(player.root);
  player.root.AddClass('Dead');
  player.root.RemoveClass('HealthVisible');
  h.runDelay(0.5);
  assert.strictEqual(notificationRoot.FindChildTraverse('ShowRankBarebonesMissingToast'), null, 'death suppresses the missing-lane toast');
  h.gameClock.text = '8:00';
  h.runDelay(0.5);
  h.drain();
}

// Invalid records deactivate through the shared notification root before pruning their hero key.
{
  const h = harness();
  h.gameClock.text = '0:30';
  const topbarRoot = new Panel('CitadelHudTopBar', { id: 'TopBar' });
  const notificationRoot = topbarRoot.add(new Panel('Panel', { id: 'ShowRankBarebonesNotificationRoot' }));
  const haze = topbar('Haze', 'MissingInvalid-Haze');
  const infernus = topbar('Infernus', 'MissingInvalid-Infernus');
  haze.root.AddClass('HealthVisible');
  infernus.root.AddClass('HealthVisible');
  topbarRoot.add(haze.root);
  topbarRoot.add(infernus.root);
  h.attach(topbarRoot);
  h.evaluate(haze.root);
  h.evaluate(infernus.root);
  haze.root.RemoveClass('HealthVisible');
  infernus.root.RemoveClass('HealthVisible');
  h.runDelay(0.5);
  h.runDelay(0);
  const toast = notificationRoot.FindChildTraverse('ShowRankBarebonesMissingToast');
  assert.ok(toast, 'the observed missing transition creates a persistent announcement');
  haze.root.valid = false;
  h.advance(1);
  const toastState = notificationRoot.__showrank_barebones_missing_toast_state_v2;
  assert.strictEqual(activeMissingRecords(h).length, 1, 'the invalid record is pruned while the other record stays active');
  assert.strictEqual(toastState.activeHeroKeys.haze, undefined, 'pruning removes the invalid record hero key through the shared notification root');
  assert.strictEqual(toast.FindChildrenWithClassTraverse('ShowRankBarebonesMissingToastIcon').length, 1, 'the remaining toast icon belongs only to the valid record');
  infernus.root.valid = false;
  h.runDelay(0.5);
  h.advance(3);
  assertMissingStopped(h, notificationRoot, 'total invalidation');
}

// The exact eight-minute boundary clears an active persistent announcement.
{
  const h = harness();
  h.gameClock.text = '7:59';
  const topbarRoot = new Panel('CitadelHudTopBar', { id: 'TopBar' });
  const notificationRoot = topbarRoot.add(new Panel('Panel', { id: 'ShowRankBarebonesNotificationRoot' }));
  const player = topbar('Haze', 'MissingAtCutoff-Haze');
  player.root.AddClass('HealthVisible');
  topbarRoot.add(player.root);
  h.attach(topbarRoot);
  h.evaluate(player.root);
  player.root.RemoveClass('HealthVisible');
  h.runDelay(0.5);
  h.runDelay(0);
  const toast = notificationRoot.FindChildTraverse('ShowRankBarebonesMissingToast');
  h.gameClock.text = '8:00';
  h.runDelay(0.5);
  h.runDelay(0);
  assert.strictEqual(toast.BHasClass('ShowRankBarebonesToastExpired'), true, 'the cutoff clears the active missing announcement');
  h.advance(3);
  assertMissingStopped(h, notificationRoot, 'eight-minute expiry');
}

// Missing-window timing does not depend on rank-image or hero-label readiness.
{
  const h = harness();
  const topbarRoot = new Panel('CitadelHudTopBar', { id: 'TopBar' });
  topbarRoot.add(new Panel('Label', { id: 'GameTime', text: '0:30', classes: ['GameTime'] }));
  const playerRoot = topbarRoot.add(new Panel('CitadelHudTopBarPlayer', {
    id: 'MissingWindowOnly',
    classes: ['ShowRankBarebonesTopbarPlayer'],
  }));
  h.attach(topbarRoot);
  h.evaluate(playerRoot);
  assert.strictEqual(playerRoot.BHasClass('ShowRankBarebonesMissingWindowExpired'), false, 'local missing eligibility does not depend on rank helpers');
}

// Hideout and stale clocks suppress the local window until a live parseable replacement appears.
{
  const h = harness();
  const topbarRoot = new Panel('CitadelHudTopBar', { id: 'TopBar' });
  const clock = h.gameClock;
  clock.text = '7:59';
  const player = topbar('Paradox', 'RetryWindow-Paradox');
  topbarRoot.add(player.root);
  h.attach(topbarRoot);
  h.documentRoot.AddClass('connectedToHideout');
  h.evaluate(player.root);
  assert.strictEqual(player.root.BHasClass('ShowRankBarebonesMissingWindowExpired'), false, 'hideout leaves the warning fail-open while the top bar itself is hidden');
  h.resetWork();
  h.documentRoot.RemoveClass('connectedToHideout');
  clock.text = '';
  h.runDelay(0.5);
  assert.strictEqual(player.root.BHasClass('ShowRankBarebonesMissingWindowExpired'), false, 'a blank stale clock cannot suppress the native warning');
  clock.text = '7:59';
  h.runDelay(0.5);
  const recovery = h.snapshotWork();
  assert.ok((recovery.panelCalls.text.GameTime || 0) <= 4, 'stale-clock recovery uses one cached read plus bounded fallback lookup');
  assert.strictEqual(player.root.BHasClass('ShowRankBarebonesMissingWindowExpired'), false, 'the next parseable early clock remains eligible');
  assert.strictEqual(missingState(h).missingRunning, true, 'a live clock keeps the recovered coordinator re-armable');
  assertOneMissingLeader(h, 'recovery retains one leader lease');
}

// Eight minutes closes the window; the next player-layout execution starts the next match cleanly.
{
  const h = harness();
  const topbarRoot = new Panel('CitadelHudTopBar', { id: 'TopBar' });
  const clock = h.gameClock;
  clock.text = '7:59';
  const player = topbar('Vindicta', 'BoundaryWindow-Vindicta');
  topbarRoot.add(player.root);
  h.attach(topbarRoot);
  h.evaluate(player.root);
  assert.strictEqual(player.root.BHasClass('ShowRankBarebonesMissingWindowExpired'), false);
  h.resetWork();
  clock.text = '8:00';
  h.evaluate(player.root);
  h.advance(3);
  assert.strictEqual(player.root.BHasClass('ShowRankBarebonesMissingWindowExpired'), true, 'the eight-minute boundary expires the local warning');
  assert.strictEqual(missingState(h).missingRunning, false, 'eight minutes stops the old coordinator session');
  assert.strictEqual(missingState(h).missingRecords.length, 0, 'eight minutes releases old coordinator records');
  assert.strictEqual(h.pending(), 0, 'eight minutes leaves no missing callbacks after terminal cleanup');
  const stoppedSessionToken = missingState(h).missingSessionToken;
  clock.text = '0:00';
  h.evaluate(player.root);
  assert.strictEqual(player.root.BHasClass('ShowRankBarebonesMissingWindowExpired'), false, 'the next player-layout execution clears expiry for a fresh early-match window');
  assert.strictEqual(missingState(h).missingRunning, true, 'the next match starts a clean coordinator session');
  assert.ok(missingState(h).missingSessionToken > stoppedSessionToken, 'the fresh session receives a new ownership token');
  assertOneMissingLeader(h, 'the fresh session starts with one leader');
  player.root.valid = false;
  h.advance(3);
  assert.strictEqual(missingState(h).missingRunning, false, 'invalidating the reused slot stops the fresh session');
  assert.strictEqual(h.pending(), 0, 'invalidating the reused slot releases remaining finite callbacks');
}

// Unparseable clocks stop after the leader exhausts its fixed retry budget.
{
  const h = harness();
  const topbarRoot = new Panel('CitadelHudTopBar', { id: 'TopBar' });
  const notificationRoot = topbarRoot.add(new Panel('Panel', { id: 'ShowRankBarebonesNotificationRoot' }));
  h.gameClock.text = '';
  const player = topbar('Infernus', 'BoundedWindow-Infernus');
  topbarRoot.add(player.root);
  h.attach(topbarRoot);
  h.evaluate(player.root);
  for (let check = 0; check < 1800; check += 1) h.runDelay(0.5);
  assert.strictEqual(player.root.BHasClass('ShowRankBarebonesMissingWindowExpired'), false, 'an exhausted stale-clock watcher fails open instead of suppressing native missing state');
  h.advance(3);
  assertMissingStopped(h, notificationRoot, 'stale-clock exhaustion');
}

// Escape population is suppressed when hideout state is on the HUD or arrives before probing.
{
  const h = harness(); const menu = escape();
  h.documentRoot.id = 'OverlayRoot';
  const hud = h.documentRoot.add(new Panel('CitadelHud', { id: 'Hud', classes: ['ShowEscapeMenu', 'connectedToHideout'] }));
  hud.add(menu.root);
  h.evaluate(menu.root, { attach: false }).ShowRankBarebonesEscapeOpen();
  h.drain();
  assert.deepStrictEqual(h.events, [], 'nested HUD hideout state prevents Players-tab activation and population');
}
{
  const h = harness(); const card = profile('101'), menu = escape(), roster = playerRoster(STANDARD_HEROES.slice(0, 6), 'HideoutRace');
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(201 + index));
  const menuDollar = h.evaluate(menu.root);
  h.on(menu.playersTab, () => h.documentRoot.AddClass('connectedToHideout'));
  menuDollar.ShowRankBarebonesEscapeOpen();
  assert.strictEqual(h.events.filter((panel) => panel.id === 'MainContents').length, 0, 'hideout transition cancels population before the first row probe');
  assert.deepStrictEqual(roster.bars[0].image.images.filter(Boolean), [], 'hideout transition cannot populate top-bar ranks');
}

// Passive top-bar evidence cannot create Escape intent or probe work.
{
  const h = harness(); const passive = topbar('haze', 'PassiveReadiness');
  h.evaluate(passive.root);
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.escape, null, 'Passive top-bar evaluation creates no Escape session');
  assert.deepStrictEqual(h.events, [], 'Passive top-bar evaluation dispatches neither Players nor profile rows');
}

// Explicit Escape owns preload intent; roster waiting stays bounded and spinner-free.
{
  const h = harness(); const menu = escape(); const menuDollar = h.evaluate(menu.root);
  h.resetWork();
  menuDollar.ShowRankBarebonesEscapeOpen();
  const session = h.documentRoot.__showrank_barebones_state_v1.escape;
  assertEscapeIntent(session.intent, 'escape_open', 'start_preload', 'explicit Escape starts the barebones preload');
  assert.deepStrictEqual(h.events.map((panel) => panel.id), ['PlayersTab'], 'preload activates only the native Players tab before roster evidence');
  h.runNext();
  assertEscapeIntent(session.intent, 'escape_continue', 'wait_roster', 'missing rows produce one bounded roster retry decision');
  assert.strictEqual(h.events.filter((panel) => panel.id === 'MainContents').length, 0, 'roster wait cannot probe a row');
  menuDollar.ShowRankBarebonesEscapeOut(); h.runDelay(0);
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.escape, session, 'mouseout while Escape stays open preserves the explicit session');
  assertEscapeIntent(session.intent, 'escape_out', 'runtime_idle', 'open-menu mouseout is an idle decision');
  h.documentRoot.classes.delete('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOut(); h.drain();
  assert.strictEqual(h.pending(), 0, 'close drains stale one-shot retries without recurring work');
}

// A completed match pass stays cached across Escape reopenings; hideout clears it for the next match.
{
  const h = harness(); const card = profile('101'), menu = escape(), roster = playerRoster(STANDARD_HEROES.slice(0, 6), 'Cache'); let accountBase = 200;
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(accountBase + index + 1));
  const menuDollar = h.evaluate(menu.root); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.deepStrictEqual(roster.bars[0].image.images, [rankUrl('201')], 'fresh topbar targets skip redundant blank image writes');
  assert.deepStrictEqual(roster.rows[0].image.images.filter(Boolean), [rankUrl('201')], 'verified accounts render on their Players-list rows');
  assert.deepStrictEqual(h.closedContexts, ['DismissAllContextMenus', 'DropInputFocus', 'DismissAllContextMenus', 'DropInputFocus'], 'initial neutralization and delayed terminal cleanup both close cards and release input focus');
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.escape, null, 'terminal completion releases the transient Escape session');
  const firstRowActivations = h.events.filter((panel) => panel.id === 'MainContents').length;
  h.resetWork();
  h.documentRoot.classes.delete('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOut(); h.drain();
  h.documentRoot.classes.add('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  captureBaseline('baseline.escape-close-reopen', h);
  assert.strictEqual(h.events.filter((panel) => panel.id === 'MainContents').length, firstRowActivations, 'Escape reopen in the same match cannot restart a completed six-player cache');
  assert.strictEqual(roster.bars[0].image.images.at(-1), rankUrl('201'), 'same-match Escape reopen retains the completed topbar');

  h.documentRoot.classes.delete('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOut(); h.drain();
  h.documentRoot.classes.add('connectedToHideout'); const hideoutBar = topbar('', 'HideoutBar'); h.evaluate(hideoutBar.root);
  const resetState = h.documentRoot.__showrank_barebones_state_v1;
  assert.strictEqual(resetState.completedRoster, null, 'hideout clears the completed pure-data roster');
  assert.strictEqual(resetState.escape, null, 'hideout releases the transient Escape session');
  assert.strictEqual('topbars' in resetState, false, 'shared state retains no topbar panels');
  assert.strictEqual('rows' in resetState, false, 'shared state retains no row panels');
  assert.strictEqual(roster.bars[0].image.visible, false, 'hideout reset hides the stale topbar rank');
  assert.strictEqual(roster.bars[0].image.images.at(-1), '', 'hideout reset releases the stale topbar image URL');
  hideoutBar.root.classes.delete('ShowRankBarebonesTopbarPlayer');
  h.documentRoot.classes.delete('connectedToHideout'); accountBase = 300;
  h.documentRoot.classes.add('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(h.events.filter((panel) => panel.id === 'MainContents').length, firstRowActivations + 6, 'hideout clears the completed cache for the next six-player match');
  assert.strictEqual(roster.bars[0].image.images.at(-1), rankUrl('301'), 'the next match rebuilds the topbar from fresh profile evidence');
  assert.strictEqual(roster.rows[0].image.images.at(-1), rankUrl('301'), 'the next match refreshes the reused Players-list row rank');
}

// Recreated topbar slots reuse complete six- and twelve-account caches when hideout reset was not observed.
for (const playerCount of [6, 12]) {
  const h = harness(); const card = profile('101'), menu = escape(), heroes = STANDARD_HEROES.slice(0, playerCount);
  const firstRoster = playerRoster(heroes, `First${playerCount}`);
  h.evaluate(card.root); wirePlayerRoster(h, card, firstRoster, (index) => String(201 + index));
  const menuDollar = h.evaluate(menu.root); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  const firstRowActivations = h.events.filter((panel) => panel.id === 'MainContents').length;
  h.documentRoot.classes.delete('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOut(); h.drain();

  firstRoster.bars.forEach((bar) => bar.root.classes.delete('ShowRankBarebonesTopbarPlayer'));
  firstRoster.rows.forEach((player) => player.root.classes.delete('ShowRankBarebonesPlayerRow'));
  const recreatedRoster = playerRoster(heroes, `Recreated${playerCount}`);
  wirePlayerRoster(h, card, recreatedRoster, (index) => String(301 + index));
  h.documentRoot.classes.add('ShowEscapeMenu');
  h.drain();
  h.resetWork();
  menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  const replayWork = h.snapshotWork();
  assert.deepStrictEqual(
    { scheduled: replayWork.scheduled, callbacks: replayWork.callbacks },
    { scheduled: 0, callbacks: 0 },
    `recreated ${playerCount}-player cache replay performs no scheduled work`,
  );
  if (playerCount === 12) {
    captureBaseline('baseline.escape-cache-recreated-topbars-12', h);
    assertTopbarEvidenceBudget(
      replayWork,
      { heroReads: 24, rowHeroReads: 0, textReads: 24, findChild: 42, getParent: 23 },
      'twelve-player cache replay',
    );
  }
  assert.strictEqual(h.events.filter((panel) => panel.id === 'MainContents').length, firstRowActivations, `a complete ${playerCount}-account cache prevents a second Escape auto-probe`);
  assert.deepStrictEqual(
    rootRosterScans(replayWork),
    { topbars: 1, rows: 0 },
    `recreated ${playerCount}-player cache reuse only performs its live topbar validation scan`,
  );
  assert.strictEqual(recreatedRoster.bars[0].image.images.at(-1), rankUrl('201'), 'recreated topbars restore the already verified account ranks');
  assert.strictEqual(h.pending(), 0, 'cache reuse leaves no pending Escape callbacks');
}

// A cache-replay freshness failure retries against topbars only before starting a fresh active pass.
{
  const h = harness(); const card = profile('101'), menu = escape();
  const firstRoster = playerRoster(STANDARD_HEROES.slice(0, 6), 'CacheStaleFirst');
  h.evaluate(card.root); wirePlayerRoster(h, card, firstRoster, (index) => String(601 + index));
  const menuDollar = h.evaluate(menu.root); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  h.documentRoot.classes.delete('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOut(); h.drain();
  firstRoster.bars.forEach((bar) => bar.root.classes.delete('ShowRankBarebonesTopbarPlayer'));
  firstRoster.rows.forEach((player) => player.root.classes.delete('ShowRankBarebonesPlayerRow'));
  const recreatedRoster = playerRoster(STANDARD_HEROES.slice(0, 6), 'CacheStaleRecreated');
  wirePlayerRoster(h, card, recreatedRoster, (index) => String(701 + index));
  h.documentRoot.classes.add('ShowEscapeMenu'); h.drain();
  let heroReads = 0;
  Object.defineProperty(recreatedRoster.bars[0].heroLabel, 'text', {
    configurable: true,
    get() {
      heroReads += 1;
      return heroReads === 1 ? 'haze' : 'calico';
    },
  });
  h.resetWork(); menuDollar.ShowRankBarebonesEscapeOpen();
  assert.deepStrictEqual(
    rootRosterScans(h.snapshotWork()),
    { topbars: 2, rows: 0 },
    'cache replay and its one stale replacement read remain topbar-only',
  );
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.completedRoster, null, 'changed cache evidence fails closed before the active fallback');
  assert.ok(recreatedRoster.bars.every((bar) => bar.image.images.filter(Boolean).length === 0), 'failed cache replay clears every recreated target');
  h.documentRoot.classes.delete('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOut(); h.drain();
  assert.strictEqual(h.pending(), 0, 'closing before the active fallback cancels its scheduled row read');
}


// A mismatched completed cache clears recreated targets before its bounded fresh no-row pass.
{
  const h = harness(); const card = profile('101'), menu = escape();
  const firstRoster = playerRoster(STANDARD_HEROES, 'CachedMismatchFirst');
  h.evaluate(card.root); wirePlayerRoster(h, card, firstRoster, (index) => String(201 + index));
  const menuDollar = h.evaluate(menu.root);
  menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.ok(h.documentRoot.__showrank_barebones_state_v1.completedRoster, 'first twelve-player pass creates the cache to invalidate');
  h.documentRoot.classes.delete('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOut(); h.drain();
  firstRoster.bars.forEach((bar) => bar.root.classes.delete('ShowRankBarebonesTopbarPlayer'));
  firstRoster.rows.forEach((player) => player.root.classes.delete('ShowRankBarebonesPlayerRow'));
  const mismatchedRoster = playerRoster(['calico', ...STANDARD_HEROES.slice(1)], 'CachedMismatchLive');
  h.attach(mismatchedRoster.friendly); h.attach(mismatchedRoster.enemy);
  mismatchedRoster.bars.forEach((bar) => {
    bar.image.visible = true;
    bar.image.SetImage(rankUrl('999'));
  });
  h.resetWork();
  h.documentRoot.classes.add('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.completedRoster, null, 'a recreated mismatched roster invalidates the completed cache');
  mismatchedRoster.bars.forEach((bar) => {
    assert.strictEqual(bar.image.visible, false, 'mismatched cache hides every recreated topbar rank');
    assert.strictEqual(bar.image.images.at(-1), '', 'mismatched cache clears every recreated topbar URL');
  });
  assert.strictEqual(h.averageFriendly.images.at(-1), '', 'mismatched cache clears the friendly average before fresh failure');
  assert.strictEqual(h.averageEnemy.images.at(-1), '', 'mismatched cache clears the enemy average before fresh failure');
  assert.strictEqual(h.pending(), 0, 'a cache mismatch followed by no rows leaves no pending Escape work');
}

// Incomplete six- and twelve-account passes retry and complete when the missing witness appears.
for (const playerCount of [6, 12]) {
  const h = harness(); const card = profile('101'), menu = escape();
  const roster = playerRoster(STANDARD_HEROES.slice(0, playerCount), `Retry${playerCount}`);
  let revealLastAccount = false;
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => index === playerCount - 1 && !revealLastAccount ? '' : String(201 + index));
  const menuDollar = h.evaluate(menu.root); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.completedRoster, null, `${playerCount - 1} confirmed accounts do not complete the ${playerCount}-player cache`);
  const firstRowActivations = h.events.filter((panel) => panel.id === 'MainContents').length;
  h.documentRoot.classes.delete('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOut(); h.drain();
  revealLastAccount = true;
  h.documentRoot.classes.add('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.ok(h.events.filter((panel) => panel.id === 'MainContents').length > firstRowActivations, `an insufficient ${playerCount}-player account cache retries on the next Escape opening`);
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.completedRoster.length, playerCount, `the retry completes after all ${playerCount} account IDs are confirmed`);
}

// One pass owns one match-centric roster read instead of caller-owned parallel collections.
{
  const h = harness(); const card = profile('101'), menu = escape();
  const roster = playerRoster(['haze'], 'ModelShape');
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, () => '201');
  const menuDollar = h.evaluate(menu.root); h.drain(); h.resetWork();
  menuDollar.ShowRankBarebonesEscapeOpen(); h.runNext();
  const session = h.documentRoot.__showrank_barebones_state_v1.escape;
  assert.ok(session && session.roster, 'the active Escape pass owns one roster read model');
  assertEscapeIntent(session.intent, 'escape_continue', 'probe_rows', 'covered roster evidence permits sequential Direct probing without a spinner');
  assert.deepStrictEqual(
    Object.keys(session.roster).sort(),
    ['cacheReplay', 'evidence', 'matches', 'probes', 'readiness'],
    'the roster interface exposes only probe records, match records, evidence, and readiness facts',
  );
  assert.deepStrictEqual(
    Object.keys(session.roster.matches[0]).sort(),
    ['account', 'hero', 'row', 'topbar'],
    'each match record owns its row, topbar, hero, and Direct witness slot',
  );
  assert.strictEqual('accountByHero' in session, false, 'the Escape caller owns no parallel account map');
  assert.strictEqual('topbars' in session.roster, false, 'the roster model does not republish raw topbar arrays');
  assert.strictEqual('topbarTargets' in session.roster, false, 'the roster model does not republish target arrays');
  h.drain();
  assert.strictEqual(h.pending(), 0, 'the inspected roster pass still terminates without recurring work');
}

// Rows register after PlayersTab is activated; they map rank evidence by unique normalized hero, not row order.
{
  const h = harness(); const reused = profile('101'), haze = topbar('Haze'), infernus = topbar('Infernus'), menu = escape(), hazeRow = row('haze'), infernusRow = row('INFERNUS'); let created;
  h.evaluate(reused.root); h.evaluate(haze.root); h.evaluate(infernus.root);
  h.on(menu.playersTab, () => { h.evaluate(hazeRow.root); h.evaluate(infernusRow.root); });
  h.on(hazeRow.mainContents, () => setProfileAccount(reused, '201'));
  h.on(infernusRow.mainContents, () => { created = profile('202', { id: 'NewProfileCard' }); h.evaluate(created.root); });
  const menuDollar = h.evaluate(menu.root); menuDollar.ShowRankBarebonesEscapeOpen(); const callbacks = h.drain();
  assert.ok(h.documentRoot.__showrank_barebones_state_v1, 'the shared document root owns the Escape session and scanned records');
  assert.ok(h.dollars.every((dollar) => !Object.prototype.hasOwnProperty.call(dollar, '__showrank_barebones_state_v1')), 'each script evaluation receives a context-local $');
  assert.deepStrictEqual(h.events.map((panel) => panel.id), ['PlayersTab', 'MainContents', 'MainContents'], 'PlayersTab activation precedes row discovery and row probes are sequential');
  assert.deepStrictEqual(haze.image.images.filter(Boolean), [rankUrl('201')], 'Haze gets changed reused-card evidence, not row position');
  assert.deepStrictEqual(infernus.image.images.filter(Boolean), [rankUrl('202')], 'Infernus gets exactly one newly opened card account');
  assert.deepStrictEqual(hazeRow.image.images.filter(Boolean), [rankUrl('201')], 'the Haze row renders its directly witnessed account rank');
  assert.deepStrictEqual(infernusRow.image.images.filter(Boolean), [rankUrl('202')], 'the Infernus row renders its directly witnessed account rank');
  assert.ok(created); assert.ok(callbacks < 20, 'two-player Escape probe completes within a bound'); assert.strictEqual(h.pending(), 0, 'no recurring callback remains');
}

// A profile already open for row 0 is neutralized through the native context APIs before row probing.
{
  const h = harness(); const preOpened = profile('201', { id: 'PreOpenedFirstAccount' }); const menu = escape();
  const roster = playerRoster(STANDARD_HEROES, 'PreOpened'); let activeProfile = preOpened;
  h.evaluate(preOpened.root); h.attach(roster.friendly); h.attach(roster.enemy); roster.bars.forEach((bar) => h.evaluate(bar.root));
  h.setNativeContextDismissal((event) => { if (event === 'DismissAllContextMenus') preOpened.root.DeleteAsync(); });
  roster.rows.forEach((player, index) => {
    h.attach(player.root);
    h.on(player.mainContents, () => {
      if (index === 0) {
        activeProfile = profile('201', { id: 'OpenedFirstAccount' });
        h.evaluate(activeProfile.root);
      } else {
        setProfileAccount(activeProfile, String(201 + index));
      }
    });
  });
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  const firstRowActivation = h.trace.indexOf('Activated:MainContents');
  assert.ok(h.trace.indexOf('DismissAllContextMenus') >= 0 && h.trace.indexOf('DismissAllContextMenus') < firstRowActivation, 'native context dismissal neutralizes a pre-opened first profile before row 0');
  assert.ok(h.trace.indexOf('DropInputFocus') >= 0 && h.trace.indexOf('DropInputFocus') < firstRowActivation, 'native input dismissal neutralizes a pre-opened first profile before row 0');
  assert.deepStrictEqual(h.nativeContextDismissals, ['DismissAllContextMenus', 'DropInputFocus', 'DismissAllContextMenus', 'DropInputFocus'], 'Escape neutralizes the initial context and closes the terminal profile exactly once each');
  assert.strictEqual(h.events.filter((panel) => panel.id === 'MainContents').length, 12, 'pre-opened first account completes all twelve row probes on its first Escape pass');
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.completedRoster.length, 12, 'pre-opened first account completes the twelve-account cache on its first pass');
  assert.deepStrictEqual(roster.bars.map((bar) => bar.image.images.at(-1)), STANDARD_HEROES.map((_, index) => rankUrl(String(201 + index))), 'all twelve topbar ranks use the first-pass row witnesses');
}

// A partial row snapshot waits for delayed row 0 instead of treating an unchanged first profile witness as complete.
{
  const h = harness(); const reused = profile('101', { id: 'DelayedCoverageProfile' }); const menu = escape();
  const roster = playerRoster(STANDARD_HEROES, 'DelayedRowZero'); let rowZeroAttached = false;
  h.evaluate(reused.root); h.attach(roster.friendly); h.attach(roster.enemy); roster.bars.forEach((bar) => h.evaluate(bar.root));
  roster.rows.forEach((player, index) => h.on(player.mainContents, () => setProfileAccount(reused, String(201 + index))));
  const menuDollar = h.evaluate(menu.root);
  h.on(menu.playersTab, () => {
    roster.rows.slice(1).forEach((player) => h.evaluate(player.root));
    menuDollar.Schedule(0.05, () => { rowZeroAttached = true; h.evaluate(roster.rows[0].root); });
  });
  h.drain();
  h.resetWork();
  menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  const delayedWork = h.snapshotWork();
  captureBaseline('baseline.escape-delayed-12-player', h);
  assert.deepStrictEqual(
    { scheduled: delayedWork.scheduled, callbacks: delayedWork.callbacks },
    { scheduled: 15, callbacks: 15 },
    'delayed twelve-player coverage preserves the accepted callback budget, including the fixture attachment',
  );
  assertTopbarEvidenceBudget(
    delayedWork,
    { heroReads: 24, rowHeroReads: 24, textReads: 96, findChild: 466, getParent: 157 },
    'delayed twelve-player pass',
  );
  const delayedScans = rootRosterScans(delayedWork);
  assert.strictEqual(delayedScans.topbars, delayedScans.rows, 'each delayed roster collection scans topbars and rows together');
  assert.ok(delayedScans.topbars <= 6, 'delayed roster coverage uses at most one root scan pair per initial/delayed attempt');
  assert.strictEqual(rowZeroAttached, true, 'row 0 attaches on the first scheduled tick after PlayersTab activation');
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.completedRoster.length, 12, 'a partial row snapshot must wait for all unique heroes; an unchanged first profile witness is not completion evidence');
  assert.strictEqual(h.events.filter((panel) => panel.id === 'MainContents').length, 12, 'delayed row 0 completes all twelve first-pass row probes instead of exhausting an eleven-row snapshot');
  assert.deepStrictEqual(roster.bars.map((bar) => bar.image.images.at(-1)), STANDARD_HEROES.map((_, index) => rankUrl(String(201 + index))), 'delayed row coverage, not the unchanged first profile witness, supplies each unique topbar account');
  assert.strictEqual(h.pending(), 0, 'delayed row coverage leaves no pending Escape callbacks');
}

// Stop as soon as every unique topbar slot has a verified row account.
{
  const h = harness(); const card = profile('101'), menu = escape(), roster = playerRoster(STANDARD_HEROES.slice(0, 6), 'Supported');
  const unrelated = row('calico', { id: 'UnrelatedRow' });
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(201 + index)); h.evaluate(unrelated.root);
  h.on(unrelated.mainContents, () => setProfileAccount(card, '999'));
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(h.events.filter((panel) => panel.id === 'MainContents').length, 6, 'six filled topbar slots stop before probing unrelated remaining rows');
  assert.deepStrictEqual(roster.bars[0].image.images.filter(Boolean), [rankUrl('201')]);
}

// Only the supported six-player and twelve-player topbar sizes can complete and cache a pass.
{
  const h = harness(); const card = profile('101'), menu = escape(), roster = playerRoster(STANDARD_HEROES, 'Standard');
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(301 + index));
  const menuDollar = h.evaluate(menu.root); h.drain(); h.resetWork();
  menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  const completedWork = h.snapshotWork();
  captureBaseline('baseline.escape-complete-12-player', h);
  assert.deepStrictEqual(
    { scheduled: completedWork.scheduled, callbacks: completedWork.callbacks },
    { scheduled: 14, callbacks: 14 },
    'complete twelve-player preload preserves one collection, twelve witness, and one cleanup callback',
  );
  assertTopbarEvidenceBudget(
    completedWork,
    { heroReads: 24, rowHeroReads: 24, textReads: 96, findChild: 466, getParent: 157 },
    'complete twelve-player pass',
  );
  const completedRoster = h.documentRoot.__showrank_barebones_state_v1.completedRoster;
  assert.strictEqual(completedRoster.length, 12, 'twelve-player standard mode stores a completed cache');
  assert.ok(completedRoster.every((entry) => Object.keys(entry).sort().join(',') === 'account,hero'), 'completed cache retains pure hero/account data only');
  assert.ok(!containsPanel(completedRoster), 'completed cache retains no Panel reachable through its pure hero/account entries');
  assert.strictEqual(
    h.documentRoot.__showrank_barebones_state_v1.escape,
    null,
    'cache completion releases active Escape roster records',
  );
  assert.deepStrictEqual(
    rootRosterScans(completedWork),
    { topbars: 1, rows: 1 },
    'a complete non-recreated twelve-player pass scans each roster class once through cache completion',
  );
  assert.strictEqual(h.pending(), 0, 'complete roster caching leaves no pending Escape callbacks');
  assert.deepStrictEqual(h.averageFriendly.images.filter(Boolean), [averageUrl(['301', '302', '303', '304', '305', '306'])], 'friendly average uses six ancestry-proven accounts');
  assert.deepStrictEqual(h.averageEnemy.images.filter(Boolean), [averageUrl(['307', '308', '309', '310', '311', '312'])], 'enemy average uses six ancestry-proven accounts');
  h.documentRoot.classes.delete('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOut(); h.drain();
  h.documentRoot.classes.add('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(h.averageFriendly.images.filter(Boolean).length, 1, 'cache hits do not reload unchanged average images');
}

// A stale atomic target gets one replacement roster scan, then a second stale target fails closed.
{
  const h = harness(); const card = profile('101'), menu = escape(), roster = playerRoster(STANDARD_HEROES, 'Atomic');
  const replacement = topbar('haze', 'AtomicReplacement');
  let originalChecks = 0;
  let replacementChecks = 0;
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(201 + index));
  const menuDollar = h.evaluate(menu.root);
  h.drain();
  replacement.root.beforeIsValid = () => {
    replacementChecks += 1;
    if (replacementChecks === 4) replacement.root.valid = false;
  };
  roster.bars[0].root.beforeIsValid = () => {
    originalChecks += 1;
    if (originalChecks !== 4) return;
    roster.bars[0].root.valid = false;
    roster.bars[0].root.classes.delete('ShowRankBarebonesTopbarPlayer');
    roster.friendly.add(replacement.root);
  };
  h.resetWork();
  menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.deepStrictEqual(
    rootRosterScans(h.snapshotWork()),
    { topbars: 2, rows: 2 },
    'the first stale target permits exactly one replacement root scan pair',
  );
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.completedRoster, null, 'the second stale target fails closed without a cache');
  const witnessedRows = h.events.filter((panel) => panel.id === 'MainContents').length;
  assert.ok(witnessedRows > 0, 'atomic failure occurs after at least one direct row witness');
  assert.ok(
    roster.rows.slice(0, witnessedRows).every((player, index) => player.image.images.includes(rankUrl(String(201 + index)))),
    'every directly witnessed row rank survives atomic topbar failure',
  );
  assert.ok(
    [...roster.bars.slice(1), replacement].every((bar) => bar.image.images.filter(Boolean).length === 0),
    'atomic failure applies no partial topbar rank mutation',
  );
  assert.deepStrictEqual(h.averageFriendly.images.filter(Boolean), [], 'atomic failure applies no friendly average mutation');
  assert.deepStrictEqual(h.averageEnemy.images.filter(Boolean), [], 'atomic failure applies no enemy average mutation');
  assert.strictEqual(h.pending(), 0, 'atomic stale recovery leaves no pending Escape work');
}
{
  const h = harness(); const card = profile('101'), menu = escape(), roster = playerRoster(STANDARD_HEROES, 'StaleRow');
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(501 + index));
  h.on(roster.rows.at(-1).mainContents, () => {
    setProfileAccount(card, '512');
    roster.rows[0].heroLabel.text = 'calico';
    roster.bars[0].heroLabel.text = 'calico';
  });
  const menuDollar = h.evaluate(menu.root); h.drain(); h.resetWork();
  menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.deepStrictEqual(
    rootRosterScans(h.snapshotWork()),
    { topbars: 2, rows: 2 },
    'a row and matching topbar hero change receives one fail-closed replacement roster read',
  );
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.completedRoster, null, 'a stale row cannot complete the pure account cache');
  assert.deepStrictEqual(roster.bars[0].image.images.filter(Boolean), [], 'a reused row cannot transfer its prior Direct account witness to a new hero');
  assert.deepStrictEqual(h.averageFriendly.images.filter(Boolean), [], 'a stale row cannot produce a friendly average');
  assert.deepStrictEqual(h.averageEnemy.images.filter(Boolean), [], 'a stale row cannot produce an enemy average');
  assert.strictEqual(h.pending(), 0, 'row-stale recovery leaves no pending Escape work');
}

{
  const h = harness(); const card = profile('101'), menu = escape(), roster = playerRoster(STANDARD_HEROES, 'Asymmetric');
  const moved = roster.bars[5].root;
  roster.friendly.children = roster.friendly.children.filter((child) => child !== moved);
  roster.enemy.add(moved);
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(351 + index));
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  assert.deepStrictEqual(h.averageFriendly.images.filter(Boolean), [], 'a five-player side cannot produce a team average');
  assert.deepStrictEqual(h.averageEnemy.images.filter(Boolean), [], 'a seven-player side cannot produce a team average');
}
{
  const h = harness(); const card = profile('101'), menu = escape(), roster = playerRoster(STANDARD_HEROES.slice(0, 7), 'Unsupported');
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(401 + index));
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.completedRoster, null, 'an unsupported seven-slot snapshot is rendered but never cached as complete');
}

// Failed terminal witnesses still close every profile context after bounded retries.
{
  const h = harness(); const card = profile('101'), menu = escape();
  const bars = [topbar('haze'), topbar('infernus'), topbar('vindicta')];
  const rows = [row('haze', { id: 'HazeRow' }), row('infernus', { id: 'InfernusRow' }), row('vindicta', { id: 'VindictaRow' })];
  h.evaluate(card.root); bars.forEach((bar) => h.evaluate(bar.root)); rows.forEach((player) => h.evaluate(player.root));
  h.on(rows[0].mainContents, () => setProfileAccount(card, '201'));
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(h.events.filter((panel) => panel.id === 'MainContents').length, 3, 'unresolved required slots exhaust only their bounded row probes');
  assert.deepStrictEqual(rows[0].image.images.filter(Boolean), [rankUrl('201')], 'a verified row rank remains available when unrelated rows fail');
  assert.deepStrictEqual(rows[1].image.images.filter(Boolean), [], 'unverified rows remain blank');
  assert.deepStrictEqual(h.closedContexts, ['DismissAllContextMenus', 'DropInputFocus', 'DismissAllContextMenus', 'DropInputFocus'], 'an exhausted partial pass performs both initial neutralization and delayed terminal cleanup');
}

// Escape coordinates directly from the shared HUD tree even when role-local scripts never registered.
{
  const h = harness(); const card = profile('101'), bar = topbar('Haze'), player = row('haze'), menu = escape();
  h.attach(card.root); h.attach(bar.root); h.attach(player.root);
  h.on(player.mainContents, () => setProfileAccount(card, '201'));
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  assert.deepStrictEqual(bar.image.images.filter(Boolean), [rankUrl('201')], 'HUD class scans do not depend on cross-layout script globals');
}


// Direct HUD scans discover role panels that attach after their local scripts execute.
{
  const h = harness(); const card = profile('101'), bar = topbar('Haze'), player = row('haze'), menu = escape();
  h.evaluate(card.root, { attach: false }); h.evaluate(bar.root, { attach: false }); h.evaluate(player.root, { attach: false });
  h.attach(card.root); h.attach(bar.root); h.attach(player.root); h.drain();
  h.on(player.mainContents, () => setProfileAccount(card, '201'));
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  assert.deepStrictEqual(bar.image.images.filter(Boolean), [rankUrl('201')], 'late-attached roles are found without a registration layer');
}

// Duplicate heroes and account evidence are ambiguous and must fail closed.
{
  const h = harness();
  const card = profile('101'), first = topbar('haze', 'FirstHaze');
  const duplicate = topbar('HAZE', 'SecondHaze'), menu = escape(), player = row('haze');
  h.evaluate(card.root); h.evaluate(first.root); h.evaluate(duplicate.root); h.evaluate(player.root);
  h.on(player.mainContents, () => setProfileAccount(card, '201'));
  h.drain();
  h.resetWork();
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  const duplicateWork = h.snapshotWork();
  captureBaseline('baseline.escape-duplicate-heroes', h);
  assertTopbarEvidenceBudget(
    duplicateWork,
    { heroReads: 2, rowHeroReads: 1, textReads: 7, findChild: 54, getParent: 23 },
    'duplicate top-bar heroes',
  );
  assert.deepStrictEqual(first.image.images.filter(Boolean), [], 'duplicate topbar hero does not render');
  assert.deepStrictEqual(duplicate.image.images.filter(Boolean), [], 'both duplicate topbars fail closed');
}
{
  const h = harness(); const card = profile('101'), bar = topbar('haze'), menu = escape(), first = row('haze', { id: 'FirstRow' }), duplicate = row('HAZE', { id: 'SecondRow' }); h.evaluate(card.root); h.evaluate(bar.root); h.evaluate(first.root); h.evaluate(duplicate.root); h.on(first.mainContents, () => setProfileAccount(card, '201')); h.on(duplicate.mainContents, () => setProfileAccount(card, '202')); h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain(); assert.deepStrictEqual(bar.image.images.filter(Boolean), [], 'duplicate rows do not select by ordering');
}
{
  const h = harness(); const card = profile('101'), menu = escape();
  const roster = playerRoster(STANDARD_HEROES.slice(0, 6), 'DuplicateAccount');
  h.evaluate(card.root); h.attach(roster.friendly); h.attach(roster.enemy);
  roster.bars.forEach((bar) => h.evaluate(bar.root));
  roster.rows.forEach((player, index) => {
    h.evaluate(player.root);
    h.on(player.mainContents, () => h.evaluate(profile('701', { id: `DuplicateAccountProfile-${index}` }).root));
  });
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  assert.ok(roster.rows.slice(0, 2).every((player) => player.image.images.includes(rankUrl('701'))), 'each duplicate account still came from a Direct profile witness');
  assert.ok(roster.bars.every((bar) => bar.image.images.filter(Boolean).length === 0), 'one account cannot authorize two hero matches');
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.completedRoster, null, 'duplicate Direct accounts cannot create a roster cache');
  assert.deepStrictEqual(h.averageFriendly.images.filter(Boolean), [], 'duplicate Direct accounts cannot produce a friendly average');
  assert.deepStrictEqual(h.averageEnemy.images.filter(Boolean), [], 'duplicate Direct accounts cannot produce an enemy average');
  assert.strictEqual(h.pending(), 0, 'duplicate-account rejection leaves no pending Escape work');
}
{
  const h = harness(); const original = profile('101'), bar = topbar('haze'), menu = escape(), player = row('haze'); h.evaluate(original.root); h.evaluate(bar.root); h.evaluate(player.root); h.on(player.mainContents, () => { h.evaluate(profile('201', { id: 'ProfileA' }).root); h.evaluate(profile('202', { id: 'ProfileB' }).root); }); h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain(); assert.deepStrictEqual(bar.image.images.filter(Boolean), [], 'multiple changed/new profile witnesses fail closed');
}
{
  const h = harness(); const menu = escape(), bar = topbar('haze', 'PassiveAccount'), player = row('haze');
  bar.root.attributes.ShowRankBarebonesAccount = '999';
  bar.root.attributes.accountid = '999';
  bar.root.attributes.steamid = '[U:1:999]';
  h.evaluate(bar.root); h.evaluate(player.root);
  bar.image.visible = true; bar.image.SetImage(rankUrl('999'));
  h.resetWork();
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  assert.deepStrictEqual(bar.image.images.filter(Boolean), [rankUrl('999')], 'fixture starts with only an untrusted stale top-bar URL');
  assert.strictEqual(bar.image.visible, false, 'Passive top-bar attributes cannot preserve a rank without a Direct profile witness');
  assert.strictEqual(bar.image.images.at(-1), '', 'untrusted passive rank state is cleared before the bounded row pass');
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.completedRoster, null, 'Passive top-bar evidence cannot create a verified account cache');
}

// The HUD ShowEscapeMenu class gates work; closing cancels one generation and reopening starts the next.
{
  const h = harness(); const card = profile('101'), bar = topbar('haze'), menu = escape(), player = row('haze'); let revealed = '201'; h.evaluate(card.root); h.evaluate(bar.root); h.evaluate(player.root); h.on(player.mainContents, () => setProfileAccount(card, revealed)); const menuDollar = h.evaluate(menu.root); menuDollar.ShowRankBarebonesEscapeOpen(); h.documentRoot.classes.delete('ShowEscapeMenu'); revealed = '202'; menuDollar.ShowRankBarebonesEscapeOpen(); h.documentRoot.classes.add('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain(); assert.deepStrictEqual(bar.image.images.filter(Boolean), [rankUrl('202')], 'closed-generation callbacks cannot render after the next real Escape opening'); assert.strictEqual(h.events.filter((panel) => panel === menu.playersTab).length, 2, 'only open-class transitions start Players-tab activation'); assert.strictEqual(h.pending(), 0);
}

// Teardown still releases shared state when the old Escape panel is invalidated before its callback.
{
  const h = harness(); const menu = escape(); const menuDollar = h.evaluate(menu.root);
  menuDollar.ShowRankBarebonesEscapeOpen();
  menu.root.valid = false;
  menuDollar.ShowRankBarebonesEscapeOut();
  h.drain();
  const shared = h.documentRoot.__showrank_barebones_state_v1;
  assert.deepStrictEqual([shared.escapeOpenLatched, shared.escape], [false, null], 'invalid Escape roots cannot retain a stale session or block the next menu');
}

// Replacing a closed Escape panel starts a fresh generation even when the native close path cannot call JavaScript.
{
  const h = harness(); const first = escape(); const second = escape();
  h.evaluate(first.root).ShowRankBarebonesEscapeOpen();
  first.root.valid = false;
  h.evaluate(second.root).ShowRankBarebonesEscapeOpen();
  const shared = h.documentRoot.__showrank_barebones_state_v1;
  assert.strictEqual(shared.escape.root, second.root, 'a replacement Escape root supersedes the stale native-close generation');
}

{
  const h = harness(); const bar = topbar('haze'), menu = escape(); h.evaluate(bar.root); h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); assert.ok(h.drain() <= 9, 'missing rows, late attachment, and final cleanup complete within a 16.25-second bound'); assert.deepStrictEqual(bar.image.images.filter(Boolean), [], 'missing rows leave stale ranks cleared');
}


console.log('showrank barebones runtime tests passed');
