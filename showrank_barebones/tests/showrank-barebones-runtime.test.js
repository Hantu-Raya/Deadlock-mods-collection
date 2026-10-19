'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const repositoryDir = path.join(__dirname, '..', '..');
const composition = require(path.join(repositoryDir, 'scripts', 'profile-stats-community-composition'));
// SHOWRANK_BAREBONES_HOST_ROOT points the suite at an edition's module root (layouts, package.json, runtime template).
const hostRoot = process.env.SHOWRANK_BAREBONES_HOST_ROOT || path.join(__dirname, '..');
const NO_MISSING = path.basename(hostRoot) === 'showrank_barebones_no_missing';
const runtimePath = process.env.SHOWRANK_BAREBONES_RUNTIME;
const source = runtimePath
  ? fs.readFileSync(runtimePath, 'utf8')
  : composition.composeBarebonesSources(repositoryDir, hostRoot).runtime;
const rankUrl = (account, base = 'https://api.deadlock-api.com/v1/players', format = 'webp') => `${base}/${account}/rank/image?format=${format}`;
const statlockerUrl = (account) => `https://statlocker.gg/profile/${account}/matches`;
const averageUrl = (accounts, base = 'https://api.deadlock-api.com/v1/players', format = 'webp') => `${base}/rank/image?account_ids=${accounts.join(',')}&format=${format}`;

let mockDepth = 0;

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
      style: new Proxy({}, { set: (target, key, value) => { countBoundary(this, 'styleWrite'); target[key] = value; return true; } }),
      parent: null,
      images: [],
      urls: [],
      htmlEvents: Object.create(null),
      panelEvents: Object.create(null),
      _work: null,
      beforeIsValid: options.beforeIsValid || null,
    });
  }
  set text(value) { countBoundary(this, 'textWrite'); this._text = value; }
  get text() {
    if (this._work && isWorkAttached(this)) {
      this._work.panelCalls.text[this.id] = (this._work.panelCalls.text[this.id] || 0) + 1;
      countBoundary(this, 'textRead');
    }
    return this._text;
  }
  set visible(value) { countBoundary(this, 'visibleWrite'); this._visible = value; }
  get visible() { return this._visible; }
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
    mockDepth += 1;
    try {
      for (const child of this.children) {
        if (child.id === id) return child;
        const nested = child.FindChildTraverse(id);
        if (nested) return nested;
      }
    } finally {
      mockDepth -= 1;
    }
    return null;
  }
  FindChildrenWithClassTraverse(className) {
    recordPanelCall(this, 'FindChildrenWithClassTraverse', [className]);
    const found = [];
    mockDepth += 1;
    try {
      for (const child of this.children) {
        if (child.classes.has(className)) found.push(child);
        found.push(...child.FindChildrenWithClassTraverse(className));
      }
    } finally {
      mockDepth -= 1;
    }
    return found;
  }
  SetPanelEvent(name, callback) { countBoundary(this, 'SetPanelEvent'); this.panelEvents[name] = callback; }
  GetChildCount() { countBoundary(this, 'GetChildCount'); return this.children.length; }
  GetChild(index) { countBoundary(this, 'GetChild'); return this.children[index] || null; }
  SetImage(url) {
    recordPanelCall(this, 'SetImage', [url]);
    if (!this.valid) throw new Error(`invalid image ${this.id}`);
    this.images.push(url);
  }
  SetURL(url) {
    recordPanelCall(this, 'SetURL', [url]);
    if (!this.valid) throw new Error(`invalid HTML panel ${this.id}`);
    this.urls.push(url);
  }
  DeleteAsync() {
    recordPanelCall(this, 'DeleteAsync', []);
    this.valid = false;
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }
}

function countBoundary(panel, key) {
  if (!panel._work || mockDepth !== 0) return;
  panel._work.boundary[key] = (panel._work.boundary[key] || 0) + 1;
}

function recordPanelCall(panel, method, args) {
  if (!panel._work) return;
  panel._work.panelCalls[method] += 1;
  panel._work.queries.push({ method, id: panel.id, args });
  const bucket = mockDepth === 0 ? panel._work.boundary : panel._work.visits;
  bucket[method] = (bucket[method] || 0) + 1;
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
    SetURL: 0,
    AddClass: 0,
    RemoveClass: 0,
    DeleteAsync: 0,
    text: {},
  };
  return { scheduled: 0, callbacks: 0, callbacksByDelay: {}, panelCalls, queries: [], boundary: {}, visits: {} };
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
  if (!options.rankHistory && !options.playstyle) return { root, witness, image };
  root.classes.add('PageVisible');
  const parts = { root, witness, image };
  if (options.playstyle) {
    const playHost = root.add(new Panel('Panel', { id: 'ShowRankBarebonesPlaystyle' }));
    parts.playHost = playHost;
    parts.playStatus = playHost.add(new Panel('Label', { id: 'ShowRankBarebonesPlaystyleStatus', text: '' }));
    parts.playChart = playHost.add(new Panel('CitadelHTMLPanel', { id: 'ShowRankBarebonesPlaystyleChart' }));
  }
  if (options.stats) {
    const statsAsync = root.add(new Panel('AsyncDataPanel', { id: 'StatsAsyncMock', classes: ['AsyncContents', options.stats === 'loading' ? 'AsyncLoadingState' : 'AsyncSuccessState'] }));
    parts.statsAsync = statsAsync;
    parts.communityButton = statsAsync.add(new Panel('Button', { id: 'ProfileStatsCommunityButton' }));
    parts.gamesPlayed = statsAsync.add(new Panel('Panel', { id: 'GamesPlayedContainer', classes: ['TextStat', ...(options.stats === 'filled' ? [] : ['isZeroValue'])] }));
    if (options.community) {
      const add = (id, type = 'Panel', extra = {}) => statsAsync.add(new Panel(type, { id, ...extra }));
      ['HeroList', 'StatsLeft', 'StatsRight', 'SelfName', 'ProfileStatsCommunityTitle', 'ProfileStatsCommunityPlayerHeadingLeft', 'ProfileStatsCommunityPlayerHeadingRight'].forEach((id) => add(id));
      add('StatsBlock');
      add('StatsTitle').add(new Panel('Label', { classes: ['statSectionName'], text: 'All Heroes' }));
      ['ProfileStatsCommunityStatLocker', 'ProfileStatsCommunityRanked', 'ProfileStatsCommunityStandard', 'ProfileStatsCommunityDisplayCommunity', 'ProfileStatsCommunityDisplayPercentile'].forEach((id) => add(id, 'Button'));
      add('ProfileStatsCommunityMatchCount', 'DropDown');
      add('ProfileStatsCommunityAccount', 'Label', { text: account });
      parts.communityPanel = add('ProfileStatsCommunityPanel');
      parts.communityBridge = add('ProfileStatsCommunityBridge', 'CitadelHTMLPanel');
      add('ProfileStatsCommunitySupporterTicker', 'CitadelHTMLPanel');
    }
  }
  if (!options.rankHistory) return parts;
  const rightPanel = root.add(new Panel('Panel', { id: 'RightPanelMock', classes: ['RightPanel'] }));
  const asyncHistory = rightPanel.add(new Panel('AsyncDataPanel', { id: 'AsyncHistoryMock', classes: ['AsyncMatchHistory', options.asyncState || 'AsyncLoadingState'] }));
  const host = rightPanel.add(new Panel('Panel', { id: 'ShowRankBarebonesRankHistory' }));
  const status = host.add(new Panel('Label', { id: 'ShowRankBarebonesRankHistoryStatus', text: '' }));
  const groups = Object.fromEntries([1, 5, 10, 25].map((size) => [size, host.add(new Panel('Button', { id: `ShowRankBarebonesRankHistoryGroup${size}` }))]));
  const chart = host.add(new Panel('CitadelHTMLPanel', { id: 'ShowRankBarebonesRankHistoryChart' }));
  return { ...parts, asyncHistory, host, status, groups, chart };
}
function setProfilePageAccount(page, account) { page.witness.text = account; page.root.attributes.accountid = account; delete page.root.attributes.steamid; }
function topbar(hero, id = `Topbar-${hero}`) {
  const root = new Panel('CitadelHudTopBarPlayer', { id, classes: ['ShowRankBarebonesTopbarPlayer'] });
  const heroLabel = root.add(new Panel('Label', { id: `${id}-HeroName`, text: hero, classes: ['HeroName'] }));
  const image = root.add(new Panel('Panel', { id: 'HeroContents' })).add(new Panel('Image', { id: 'ShowRankBarebonesTopbarRankImage', visible: false }));
  return { root, heroLabel, image };
}
function row(hero, options = {}) { const root = new Panel('CitadelPlayersListEntry', { id: options.id || `Row-${hero}`, classes: ['ShowRankBarebonesPlayerRow'] }); const mainContents = root.add(new Panel('Panel', { id: 'MainContents', valid: options.mainValid })); const heroLabel = mainContents.add(new Panel('Label', { id: 'ShowRankBarebonesRowHero', text: hero })); const image = mainContents.add(new Panel('Image', { id: 'ShowRankBarebonesPlayerListRankImage', visible: false })); const stack = options.party ? mainContents.add(new Panel('Panel', { id: 'ShowRankBarebonesPartyStack', classes: ['ShowRankBarebonesPartyStack'] })) : null; return { root, mainContents, heroLabel, image, stack }; }
function escapeMenu(options = {}) { const root = new Panel('CitadelHudEscapeMenu', { id: 'Escape' }); const playersTab = root.add(new Panel('TabButton', { id: 'PlayersTab' })); const bridge = options.bridge ? root.add(new Panel('CitadelHTMLPanel', { id: 'ShowRankBarebonesPartyBridge', visible: false })) : null; return { root, playersTab, bridge }; }
function addContextRow(parent, id, text) { const rowPanel = parent.add(new Panel('Panel', { id, classes: ['MenuRow'] })); return rowPanel.add(new Panel('TextButton', { id: 'MenuButton', text })); }
function contextMenu(card) { const root = new Panel('CitadelContextMenuPlayer', { id: 'PersonalContextMenu' }); root.add(card.root); const options = root.add(new Panel('Panel', { id: 'MenuOptionsPanel' })); const statlockerButton = addContextRow(options, 'ShowRankBarebonesStatlockerRow', 'Statlocker Profile'); const copyButton = addContextRow(options, 'ShowRankBarebonesCopyAccountRow', 'Copy Account ID'); const playerProfileButton = addContextRow(root, 'ProfileStatsCommunityPlayerProfileRow', 'Player Profile'); return { root, statlockerButton, copyButton, playerProfileButton }; }
const STANDARD_HEROES = ['haze', 'infernus', 'vindicta', 'abrams', 'bebop', 'dynamo', 'kelvin', 'lash', 'mcginnis', 'mo_and_krill', 'paradox', 'pocket'];
function playerRoster(heroes, prefix = '', rowOptions = {}) { const friendly = new Panel('CitadelHudTopBarTeam', { id: 'TeamFriendly' }); const enemy = new Panel('CitadelHudTopBarTeam', { id: 'TeamEnemy' }); const bars = heroes.map((hero, index) => { const bar = topbar(hero, `${prefix}Bar-${index}`); (index < heroes.length / 2 ? friendly : enemy).add(bar.root); return bar; }); return { bars, rows: heroes.map((hero, index) => row(hero, { ...rowOptions, id: `${prefix}Row-${index}` })), friendly, enemy }; }
function wirePlayerRoster(h, card, roster, accountForIndex) { h.attach(roster.friendly); h.attach(roster.enemy); roster.bars.forEach((bar) => h.evaluate(bar.root)); roster.rows.forEach((player, index) => { h.evaluate(player.root); h.on(player.mainContents, () => setProfileAccount(card, accountForIndex(index))); }); }
function scoreboard() {
  const root = new Panel('CitadelPostGameScoreboardNew', { id: 'Scoreboard' });
  const players = root.add(new Panel('Panel', { classes: ['ScoreboardScrollContainer'] })).add(new Panel('Panel', { id: 'TeamPlayers' }));
  return {
    root,
    addRow(account, options = {}) {
      const container = players.add(new Panel('Panel', { classes: ['Player'] })).add(new Panel('Panel', { classes: ['PlayerRow'] }))
        .add(new Panel('Panel', { classes: ['PlayerInfoContainer'] })).add(new Panel('Panel', { classes: ['PlayerNameContainer'] }));
      const attributes = options.attribute === undefined ? {} : { accountid: options.attribute };
      const name = container.add(new Panel('CitadelUserName', { id: 'PlayerName', classes: ['ShowRankBarebonesScoreboardName'], attributes }));
      if (account !== undefined) name.accountid = account;
      name.add(new Panel('Label', { text: `Player ${account}` }));
      return name;
    },
  };
}

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
  function enqueue(delay, callback, owner = null) {
    if (owner && owner.dead) return scheduled.length;
    const entry = { dueAt: currentTime + delay, insertionOrder: insertionOrder += 1, callback, owner };
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
    work.boundary = fresh.boundary;
    work.visits = fresh.visits;
  }
  function snapshotWork() {
    return {
      scheduled: work.scheduled,
      callbacks: work.callbacks,
      callbacksByDelay: { ...work.callbacksByDelay },
      panelCalls: { ...work.panelCalls, text: { ...work.panelCalls.text } },
      queries: work.queries.map((query) => ({ ...query, args: query.args.slice() })),
      boundary: { ...work.boundary },
      visits: { ...work.visits },
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
        Schedule: (delay, callback) => enqueue(delay, callback, dollar),
        DispatchEvent: dispatch,
        CreatePanel: (type, parent, id) => options.createPanel ? options.createPanel(type, parent, id) : parent.add(new Panel(type, { id })),
        RegisterEventHandler: (name, panel, callback) => { assert.ok(panel instanceof Panel, 'HTML events register on a local panel'); panel.htmlEvents[name] = callback; },
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
    // A script context dies with its panel: its pending $.Schedule callbacks never run and it can schedule nothing more.
    killContext(owner) {
      owner.dead = true;
      for (let index = scheduled.length - 1; index >= 0; index -= 1) if (scheduled[index].owner === owner) scheduled.splice(index, 1);
    },
    // Context panels that own the pending callbacks with this delay (the chain holders).
    pendingOwners(delay) { return scheduled.filter((entry) => entry.owner && scheduledDelays.get(entry) === delay).map((entry) => entry.owner.GetContextPanel()); },
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
function harnessWithPanelLog() {
  const created = [];
  const h = harness({ createPanel: (type, parent, id) => { created.push({ type, id }); return parent.add(new Panel(type, { id })); } });
  return { h, created };
}
function assertNoSpinner(h, created, label) {
  assert.deepStrictEqual(created.filter((panel) => /spinner/i.test(`${panel.type} ${panel.id}`)), [], `${label}: no spinner panel is created`);
  assert.deepStrictEqual(h.snapshotWork().queries.filter((query) => query.method === 'AddClass' && /spinner/i.test(String(query.args[0]))).map((query) => query.args[0]), [], `${label}: no spinner class is added`);
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

// The missing lane keeps two chains: the 0.5 s leader and one 1.0 s watchdog held by another record. Each chain
// lives in the script context of the record that started it, so pendingOwners() names its holder.
function assertTwoMissingChains(h, message) {
  const state = missingState(h), leaders = h.pendingOwners(0.5), watchdogs = h.pendingOwners(1);
  assert.strictEqual(leaders.length, 1, `${message}: exactly one leader chain`);
  assert.strictEqual(watchdogs.length, 1, `${message}: exactly one watchdog chain`);
  assert.strictEqual(leaders[0], state.missingLeaderRoot, `${message}: the leader chain lives in the leader record's context`);
  assert.strictEqual(watchdogs[0], state.missingWatchRoot, `${message}: the watchdog chain lives in the watchdog record's context`);
  assertOneMissingLeader(h, message);
  if (activeMissingRecords(h).length > 1) assert.notStrictEqual(leaders[0], watchdogs[0], `${message}: leader and watchdog live in different contexts`);
}

function missingRoster(h, prefix, count = 12) {
  const roster = playerRoster(STANDARD_HEROES.slice(0, count), prefix);
  h.gameClock.text = '0:30';
  h.attach(roster.friendly); h.attach(roster.enemy);
  return { roster, contexts: new Map(roster.bars.map((bar) => [bar.root, h.evaluate(bar.root)])) };
}

function loseMissingContext(h, session, root) {
  root.DeleteAsync();
  h.killContext(session.contexts.get(root));
}

function missingHeroKeys(notificationRoot) {
  const toast = notificationRoot.__showrank_barebones_missing_toast_state_v2;
  return toast ? Array.from(toast.activeHeroes) : [];
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
// A stable hideout popup account stops its watch after about 12.8 s (the first sample restarts the count, then 13 fast and 10 slow ticks), not 45 s.
{
  const h = harness({ hideout: true }); const card = profile('123456'); h.evaluate(card.root);
  h.resetWork();
  const callbacks = h.drain();
  const work = h.snapshotWork();
  assert.strictEqual(callbacks, 24, 'a stable hideout popup watch runs the first sample plus 23 ticks');
  assert.strictEqual(work.callbacksByDelay['0.2'], 14, 'the first sample and the next 13 ticks are fast');
  assert.strictEqual(work.callbacksByDelay['1'], 10, 'the stable tail is 10 one-second ticks');
  assert.strictEqual(card.image.images.at(-1), rankUrl('123456'), 'the stable account keeps its badge after the watch ends');
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

// Missing-lane scenarios; the no-missing edition has no lane (its budget check is at the end of the file).
if (!NO_MISSING) {
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

// Twelve roles share one 0.5-second leader chain and one 1.0-second watchdog chain.
{
  const h = harness(); const roster = playerRoster(STANDARD_HEROES, 'LeasePolling');
  h.gameClock.text = '7:59';
  h.attach(roster.friendly); h.attach(roster.enemy);
  roster.bars.forEach((bar) => h.evaluate(bar.root));
  h.advance(1);
  h.resetWork();
  h.advance(10);
  const steady = h.snapshotWork();
  assert.strictEqual(steady.callbacksByDelay[0.5], 20, 'ten seconds runs twenty leader callbacks');
  assert.strictEqual(steady.callbacksByDelay[1], 10, 'ten seconds runs ten watchdog callbacks, not twelve per second');
  assert.strictEqual(steady.callbacks, 30, 'the coordinator stays within the combined callback budget');
  assert.ok((steady.panelCalls.text.GameTime || 0) <= 20, `only the leader reads #GameTime during steady polling: ${steady.panelCalls.text.GameTime || 0}`);
  assert.strictEqual(activeMissingRecords(h).length, 12, 'all twelve loaded roles remain active');
  assert.strictEqual(new Set(activeMissingRecords(h).map((record) => record.root)).size, 12, 'active records remain unique by root');
  assertOneMissingLeader(h, 'twelve records still expose one active leader');
  assertTwoMissingChains(h, 'twelve records hold exactly one leader chain and one watchdog chain');

  h.resetWork();
  h.evaluate(roster.bars[5].root);
  h.advance(1);
  const reread = h.snapshotWork();
  assert.strictEqual(activeMissingRecords(h).length, 12, 're-evaluating an existing root is idempotent');
  assert.strictEqual(new Set(activeMissingRecords(h).map((record) => record.root)).size, 12, 're-evaluation does not duplicate the root record');
  assert.ok((reread.callbacksByDelay[1] || 0) <= 2, 're-evaluation adds no watchdog beyond the single one plus its bounded rank refresh');
  assertOneMissingLeader(h, 're-evaluation does not create a concurrent leader');
  assertTwoMissingChains(h, 're-evaluation adds no chain');
}

// The watchdog promotes an invalid leader within one second without creating a second leader.
{
  const h = harness(); const roster = playerRoster(STANDARD_HEROES, 'LeaseInvalidLeader');
  h.gameClock.text = '7:59';
  h.attach(roster.friendly); h.attach(roster.enemy);
  roster.bars.forEach((bar) => h.evaluate(bar.root));
  h.advance(1);
  const previousLeader = missingState(h).missingLeaderRoot;
  previousLeader.valid = false;
  h.advance(1);
  assert.notStrictEqual(missingState(h).missingLeaderRoot, previousLeader, 'the watchdog replaces the invalid leader within one second');
  assert.strictEqual(activeMissingRecords(h).length, 11, 'the invalid leader record is pruned');
  assertOneMissingLeader(h, 'invalid-leader failover has no concurrent leaders');
  assertTwoMissingChains(h, 'invalid-leader failover keeps one leader chain and one watchdog chain');
}

// A valid leader whose next 0.5-second tick is lost is replaced within two watchdog checks.
{
  const h = harness(); const roster = playerRoster(STANDARD_HEROES, 'LeaseStalledLeader');
  h.gameClock.text = '7:59';
  h.attach(roster.friendly); h.attach(roster.enemy);
  roster.bars.forEach((bar) => h.evaluate(bar.root));
  const leaderToken = missingState(h).missingLeaderToken;
  h.dropNextDelay(0.5);
  h.advance(2);
  assert.ok(missingState(h).missingLeaderToken > leaderToken, 'two watchdog checks replace the stalled-valid leader within two seconds');
  assertOneMissingLeader(h, 'stalled-leader failover has no concurrent leaders');
  assertTwoMissingChains(h, 'stalled-leader failover keeps one leader chain and one watchdog chain');
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
}

// Escape population is suppressed when hideout state is on the HUD or arrives before probing.
{
  const h = harness(); const menu = escapeMenu();
  h.documentRoot.id = 'OverlayRoot';
  const hud = h.documentRoot.add(new Panel('CitadelHud', { id: 'Hud', classes: ['ShowEscapeMenu', 'connectedToHideout'] }));
  hud.add(menu.root);
  h.evaluate(menu.root, { attach: false }).ShowRankBarebonesEscapeOpen();
  h.drain();
  assert.deepStrictEqual(h.events, [], 'nested HUD hideout state prevents Players-tab activation and population');
}
{
  const h = harness(); const card = profile('101'), menu = escapeMenu(), roster = playerRoster(STANDARD_HEROES.slice(0, 6), 'HideoutRace');
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
  const { h, created } = harnessWithPanelLog(); const menu = escapeMenu(); const menuDollar = h.evaluate(menu.root);
  h.resetWork();
  menuDollar.ShowRankBarebonesEscapeOpen();
  const session = h.documentRoot.__showrank_barebones_state_v1.escape;
  assert.strictEqual(h.trace[0], 'Activated:PlayersTab', 'explicit Escape open activates the native Players tab before any other native call');
  assert.deepStrictEqual(h.events.map((panel) => panel.id), ['PlayersTab'], 'preload activates only the native Players tab before roster evidence');
  assert.strictEqual(h.pending(), 1, 'explicit Escape open schedules exactly one bounded witness collection');
  assert.strictEqual(h.snapshotWork().scheduled, 1, 'the open schedules no work beyond that single collection');
  assert.strictEqual(h.advance(0.04), 0, 'the witness collection is not due before 0.05s');
  assert.strictEqual(h.pending(), 1, 'the early window leaves the collection pending');
  h.runDelay(0.05);
  assert.strictEqual(h.pending(), 1, 'missing rows leave exactly one bounded roster retry pending');
  assert.strictEqual(h.advance(0.2), 0, 'the first roster retry is not due before 0.25s');
  assert.strictEqual(h.events.filter((panel) => panel.id === 'MainContents').length, 0, 'roster wait cannot probe a row');
  assert.strictEqual(h.pending(), 1, 'roster wait holds one retry and no row probe');
  assertNoSpinner(h, created, 'explicit Escape open and roster wait');
  menuDollar.ShowRankBarebonesEscapeOut(); h.runDelay(0);
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.escape, session, 'mouseout while Escape stays open preserves the explicit session');
  assert.strictEqual(h.pending(), 1, 'open-menu mouseout keeps the pending roster retry and schedules nothing');
  assert.strictEqual(h.events.filter((panel) => panel.id === 'MainContents').length, 0, 'open-menu mouseout starts no row probe');
  h.documentRoot.classes.delete('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOut(); h.drain();
  assert.strictEqual(h.pending(), 0, 'close drains stale one-shot retries without recurring work');
}

// A completed match pass stays cached across Escape reopenings; hideout clears it for the next match.
{
  const h = harness(); const card = profile('101'), menu = escapeMenu(), roster = playerRoster(STANDARD_HEROES.slice(0, 6), 'Cache'); let accountBase = 200;
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
  const h = harness(); const card = profile('101'), menu = escapeMenu(), heroes = STANDARD_HEROES.slice(0, playerCount);
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
      { heroReads: 24, rowHeroReads: 0, textReads: 24, findChild: 39, getParent: 23 },
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
  const h = harness(); const card = profile('101'), menu = escapeMenu();
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
  const h = harness(); const card = profile('101'), menu = escapeMenu();
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
  const h = harness(); const card = profile('101'), menu = escapeMenu();
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
  const { h, created } = harnessWithPanelLog(); const card = profile('101'), menu = escapeMenu();
  const roster = playerRoster(['haze'], 'ModelShape');
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, () => '201');
  const menuDollar = h.evaluate(menu.root); h.drain(); h.resetWork();
  menuDollar.ShowRankBarebonesEscapeOpen(); h.runNext();
  const session = h.documentRoot.__showrank_barebones_state_v1.escape;
  assert.ok(session && session.roster, 'the active Escape pass owns one roster read model');
  assert.deepStrictEqual(h.events.map((panel) => panel.id), ['PlayersTab', 'MainContents'], 'covered roster evidence activates exactly one MainContents probe after the Players tab');
  assert.strictEqual(h.pending(), 1, 'the single row probe waits on one pending witness callback before any further probe');
  assertNoSpinner(h, created, 'covered roster row probing');
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
  const h = harness(); const reused = profile('101'), haze = topbar('Haze'), infernus = topbar('Infernus'), menu = escapeMenu(), hazeRow = row('haze'), infernusRow = row('INFERNUS'); let created;
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
  const h = harness(); const preOpened = profile('201', { id: 'PreOpenedFirstAccount' }); const menu = escapeMenu();
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
  const h = harness(); const reused = profile('101', { id: 'DelayedCoverageProfile' }); const menu = escapeMenu();
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
    { heroReads: 24, rowHeroReads: 48, textReads: 120, findChild: 429, getParent: 157 },
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
  const h = harness(); const card = profile('101'), menu = escapeMenu(), roster = playerRoster(STANDARD_HEROES.slice(0, 6), 'Supported');
  const unrelated = row('calico', { id: 'UnrelatedRow' });
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(201 + index)); h.evaluate(unrelated.root);
  h.on(unrelated.mainContents, () => setProfileAccount(card, '999'));
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(h.events.filter((panel) => panel.id === 'MainContents').length, 6, 'six filled topbar slots stop before probing unrelated remaining rows');
  assert.deepStrictEqual(roster.bars[0].image.images.filter(Boolean), [rankUrl('201')]);
}

// Only the supported six-player and twelve-player topbar sizes can complete and cache a pass.
{
  const h = harness(); const card = profile('101'), menu = escapeMenu(), roster = playerRoster(STANDARD_HEROES, 'Standard');
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
    { heroReads: 24, rowHeroReads: 48, textReads: 120, findChild: 429, getParent: 157 },
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
  const h = harness(); const card = profile('101'), menu = escapeMenu(), roster = playerRoster(STANDARD_HEROES, 'Atomic');
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
  const h = harness(); const card = profile('101'), menu = escapeMenu(), roster = playerRoster(STANDARD_HEROES, 'StaleRow');
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
  const h = harness(); const card = profile('101'), menu = escapeMenu(), roster = playerRoster(STANDARD_HEROES, 'Asymmetric');
  const moved = roster.bars[5].root;
  roster.friendly.children = roster.friendly.children.filter((child) => child !== moved);
  roster.enemy.add(moved);
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(351 + index));
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  assert.deepStrictEqual(h.averageFriendly.images.filter(Boolean), [], 'a five-player side cannot produce a team average');
  assert.deepStrictEqual(h.averageEnemy.images.filter(Boolean), [], 'a seven-player side cannot produce a team average');
}
{
  const h = harness(); const card = profile('101'), menu = escapeMenu(), roster = playerRoster(STANDARD_HEROES.slice(0, 7), 'Unsupported');
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(401 + index));
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.completedRoster, null, 'an unsupported seven-slot snapshot is rendered but never cached as complete');
}

// Failed terminal witnesses still close every profile context after bounded retries.
{
  const h = harness(); const card = profile('101'), menu = escapeMenu();
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
  const h = harness(); const card = profile('101'), bar = topbar('Haze'), player = row('haze'), menu = escapeMenu();
  h.attach(card.root); h.attach(bar.root); h.attach(player.root);
  h.on(player.mainContents, () => setProfileAccount(card, '201'));
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  assert.deepStrictEqual(bar.image.images.filter(Boolean), [rankUrl('201')], 'HUD class scans do not depend on cross-layout script globals');
}


// Direct HUD scans discover role panels that attach after their local scripts execute.
{
  const h = harness(); const card = profile('101'), bar = topbar('Haze'), player = row('haze'), menu = escapeMenu();
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
  const duplicate = topbar('HAZE', 'SecondHaze'), menu = escapeMenu(), player = row('haze');
  h.evaluate(card.root); h.evaluate(first.root); h.evaluate(duplicate.root); h.evaluate(player.root);
  h.on(player.mainContents, () => setProfileAccount(card, '201'));
  h.drain();
  h.resetWork();
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  const duplicateWork = h.snapshotWork();
  captureBaseline('baseline.escape-duplicate-heroes', h);
  assertTopbarEvidenceBudget(
    duplicateWork,
    { heroReads: 2, rowHeroReads: 3, textReads: 9, findChild: 51, getParent: 23 },
    'duplicate top-bar heroes',
  );
  assert.deepStrictEqual(first.image.images.filter(Boolean), [], 'duplicate topbar hero does not render');
  assert.deepStrictEqual(duplicate.image.images.filter(Boolean), [], 'both duplicate topbars fail closed');
}
{
  const h = harness(); const card = profile('101'), bar = topbar('haze'), menu = escapeMenu(), first = row('haze', { id: 'FirstRow' }), duplicate = row('HAZE', { id: 'SecondRow' }); h.evaluate(card.root); h.evaluate(bar.root); h.evaluate(first.root); h.evaluate(duplicate.root); h.on(first.mainContents, () => setProfileAccount(card, '201')); h.on(duplicate.mainContents, () => setProfileAccount(card, '202')); h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain(); assert.deepStrictEqual(bar.image.images.filter(Boolean), [], 'duplicate rows do not select by ordering');
}
{
  const h = harness(); const card = profile('101'), menu = escapeMenu();
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
  const h = harness(); const original = profile('101'), bar = topbar('haze'), menu = escapeMenu(), player = row('haze'); h.evaluate(original.root); h.evaluate(bar.root); h.evaluate(player.root); h.on(player.mainContents, () => { h.evaluate(profile('201', { id: 'ProfileA' }).root); h.evaluate(profile('202', { id: 'ProfileB' }).root); }); h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain(); assert.deepStrictEqual(bar.image.images.filter(Boolean), [], 'multiple changed/new profile witnesses fail closed');
}
{
  const h = harness(); const menu = escapeMenu(), bar = topbar('haze', 'PassiveAccount'), player = row('haze');
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
  const h = harness(); const card = profile('101'), bar = topbar('haze'), menu = escapeMenu(), player = row('haze'); let revealed = '201'; h.evaluate(card.root); h.evaluate(bar.root); h.evaluate(player.root); h.on(player.mainContents, () => setProfileAccount(card, revealed)); const menuDollar = h.evaluate(menu.root); menuDollar.ShowRankBarebonesEscapeOpen(); h.documentRoot.classes.delete('ShowEscapeMenu'); revealed = '202'; menuDollar.ShowRankBarebonesEscapeOpen(); h.documentRoot.classes.add('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain(); assert.deepStrictEqual(bar.image.images.filter(Boolean), [rankUrl('202')], 'closed-generation callbacks cannot render after the next real Escape opening'); assert.strictEqual(h.events.filter((panel) => panel === menu.playersTab).length, 2, 'only open-class transitions start Players-tab activation'); assert.strictEqual(h.pending(), 0);
}

// Teardown still releases shared state when the old Escape panel is invalidated before its callback.
{
  const h = harness(); const menu = escapeMenu(); const menuDollar = h.evaluate(menu.root);
  menuDollar.ShowRankBarebonesEscapeOpen();
  menu.root.valid = false;
  menuDollar.ShowRankBarebonesEscapeOut();
  h.drain();
  const shared = h.documentRoot.__showrank_barebones_state_v1;
  assert.deepStrictEqual([shared.escapeOpenLatched, shared.escape], [false, null], 'invalid Escape roots cannot retain a stale session or block the next menu');
}

// Replacing a closed Escape panel starts a fresh generation even when the native close path cannot call JavaScript.
{
  const h = harness(); const first = escapeMenu(); const second = escapeMenu();
  h.evaluate(first.root).ShowRankBarebonesEscapeOpen();
  first.root.valid = false;
  h.evaluate(second.root).ShowRankBarebonesEscapeOpen();
  const shared = h.documentRoot.__showrank_barebones_state_v1;
  assert.strictEqual(shared.escape.root, second.root, 'a replacement Escape root supersedes the stale native-close generation');
}

{
  const h = harness(); const bar = topbar('haze'), menu = escapeMenu(); h.evaluate(bar.root); h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); assert.ok(h.drain() <= 9, 'missing rows, late attachment, and final cleanup complete within a 16.25-second bound'); assert.deepStrictEqual(bar.image.images.filter(Boolean), [], 'missing rows leave stale ranks cleared');
}
// Rank History. Failure modes: auto-opening over a loaded history; missing a late failure; keeping an old
// account's chart after a profile change or page leave; stale, foreign or malformed status titles revealing a
// chart; a chart that never answers; group buttons refetching the wrong account; a watcher that never stops.
const RANK_HISTORY_URL = 'https://hantu-raya.github.io/deadlock-stats-bridge/rank-history.html';
function rankHistoryPage(options = {}) {
  const h = harness(); const page = profilePage(options.account || '487348881', { rankHistory: true, ...options });
  const dollar = h.evaluate(page.root);
  const state = (name) => page.root.classes.has(`ShowRankBarebonesRankHistory${name}`);
  return {
    h, page, dollar, state,
    chartUrls: () => page.chart.urls.slice(),
    lastRequest() {
      const url = new URL(page.chart.urls.at(-1));
      assert.strictEqual(`${url.origin}${url.pathname}`, RANK_HISTORY_URL, 'the chart loads only the rank-history page');
      return url;
    },
    fire(name, value) { page.chart.htmlEvents[name](page.chart, value); },
    title(body) { return `DLRANKH1:${JSON.stringify({ v: 1, ...body })}`; },
    setAsync(stateClass) { ['AsyncLoadingState', 'AsyncSuccessState', 'AsyncFailureState'].forEach((name) => page.asyncHistory.classes.delete(name)); page.asyncHistory.classes.add(stateClass); },
  };
}
{
  const r = rankHistoryPage({ asyncState: 'AsyncLoadingState' });
  r.h.advance(1); r.setAsync('AsyncSuccessState'); r.h.advance(3);
  assert.deepStrictEqual(r.chartUrls(), [], 'a loaded match history never auto-opens Rank History');
  assert.strictEqual(r.state('On') || r.state('Fallback'), false);
  assert.strictEqual(r.h.pending(), 1, 'once history loads with Rank History closed, only the slow sentinel remains');
  r.page.root.ShowRankBarebonesRankHistoryOn();
  assert.strictEqual(r.state('On'), true, 'the tab selects Rank History through an owned class');
  const first = r.lastRequest();
  assert.deepStrictEqual(Object.fromEntries(first.searchParams), { protocol: '1', request: first.searchParams.get('request'), account_id: '487348881', group: '5' }, 'manual open requests the viewed account with five-game groups');
  assert.ok(r.page.groups[5].classes.has('ShowRankBarebonesRankHistorySelected'), 'the default group button is selected');
  assert.strictEqual(r.page.status.text, 'LOADING RANK HISTORY');
  r.fire('HTMLTitle', 'Deadlock Rank History');
  r.fire('HTMLTitle', r.title({ request: 'stale', kind: 'ready', points: 3 }));
  r.fire('HTMLURLChanged', `https://example.invalid/rank-history.html?x#${encodeURIComponent(r.title({ request: first.searchParams.get('request'), kind: 'ready', points: 3 }))}`);
  assert.strictEqual(r.page.host.classes.has('ShowRankBarebonesChartLoaded'), false, 'normal, stale and foreign titles do not reveal the chart');
  r.fire('HTMLURLChanged', `${r.page.chart.urls.at(-1)}#${encodeURIComponent(r.title({ request: first.searchParams.get('request'), kind: 'ready', points: 3 }))}`);
  assert.strictEqual(r.page.host.classes.has('ShowRankBarebonesChartLoaded'), true, 'the current status reveals the chart');
  assert.strictEqual(r.page.status.text, '');
  assert.notStrictEqual(r.page.chart.urls.at(-1), 'about:blank', 'a ready chart stays loaded while shown');
  r.page.root.ShowRankBarebonesRankHistoryGroup(10);
  assert.strictEqual(r.lastRequest().searchParams.get('group'), '10');
  assert.ok(r.page.groups[10].classes.has('ShowRankBarebonesRankHistorySelected') && !r.page.groups[5].classes.has('ShowRankBarebonesRankHistorySelected'), 'the selected group moves');
  assert.strictEqual(r.page.host.classes.has('ShowRankBarebonesChartLoaded'), false, 'a group change hides the old chart until its status arrives');
  const before = r.chartUrls().length;
  r.page.root.ShowRankBarebonesRankHistoryGroup(3);
  r.page.root.ShowRankBarebonesRankHistoryGroup(10);
  assert.strictEqual(r.chartUrls().length, before, 'invalid or unchanged groups do not reload');
  r.page.root.ShowRankBarebonesRankHistoryOff();
  assert.strictEqual(r.state('On'), false, 'a stock tab exits Rank History');
  assert.strictEqual(r.page.chart.urls.at(-1), 'about:blank', 'closing unloads the chart');
  r.h.advance(2);
  assert.strictEqual(r.h.pending(), 1, 'closing returns to the slow sentinel');
}
{
  const r = rankHistoryPage({ asyncState: 'AsyncLoadingState' });
  r.h.advance(12);
  assert.deepStrictEqual(r.chartUrls(), [], 'loading history does not open the chart');
  r.setAsync('AsyncFailureState'); r.h.advance(0.5);
  assert.strictEqual(r.state('Fallback'), true, 'a late match-history failure auto-opens Rank History');
  const nonce = r.lastRequest().searchParams.get('request');
  r.fire('HTMLTitle', r.title({ request: nonce, kind: 'error', code: 'rate_limit' }));
  assert.strictEqual(r.page.host.classes.has('ShowRankBarebonesChartLoaded'), true, 'page-rendered error text is shown');
  r.setAsync('AsyncSuccessState'); r.h.advance(0.5);
  assert.strictEqual(r.state('Fallback'), false, 'recovered match history removes the automatic fallback');
  assert.strictEqual(r.page.chart.urls.at(-1), 'about:blank');
  r.h.advance(2);
  assert.strictEqual(r.h.pending(), 1);
}
{
  const r = rankHistoryPage({ asyncState: 'AsyncFailureState' });
  r.h.advance(0.5);
  assert.strictEqual(r.state('Fallback'), true);
  r.h.advance(30);
  assert.strictEqual(r.page.status.text, 'RANK HISTORY UNAVAILABLE', 'a chart that never answers times out visibly');
  r.page.root.classes.delete('PageVisible'); r.h.advance(0.5);
  assert.strictEqual(r.state('Fallback'), false, 'leaving the page clears the fallback');
  assert.strictEqual(r.page.chart.urls.at(-1), 'about:blank', 'leaving the page unloads the chart');
  r.h.advance(2); r.h.resetWork();
  r.h.advance(10);
  const hidden = r.h.snapshotWork();
  assert.ok(hidden.callbacks <= 5, `a hidden page runs only the 2-second sentinel: ${hidden.callbacks}`);
  assert.deepStrictEqual(hidden.panelCalls.text, {}, 'the hidden sentinel reads no account labels');
  assert.strictEqual(hidden.panelCalls.SetURL, 0);
  const loads = r.chartUrls().filter((url) => url !== 'about:blank').length;
  // Return by keyboard/back: no hover, no tab click. The page reappears loading, then fails later.
  setProfilePageAccount(r.page, '1424351890');
  r.setAsync('AsyncLoadingState'); r.page.root.classes.add('PageVisible'); r.h.advance(2.5);
  assert.strictEqual(r.state('Fallback'), false, 'a re-entered page that is still loading does not open the chart');
  r.h.advance(6); r.setAsync('AsyncFailureState'); r.h.advance(0.5);
  assert.strictEqual(r.state('Fallback'), true, 're-entry without pointer activity still catches the later failure');
  assert.strictEqual(r.lastRequest().searchParams.get('account_id'), '1424351890', 'the chart follows the newly viewed account');
  assert.strictEqual(r.chartUrls().filter((url) => url !== 'about:blank').length, loads + 1);
  r.page.root.classes.delete('PageVisible'); r.h.advance(30);
  r.page.root.valid = false; r.h.advance(4);
  assert.strictEqual(r.h.pending(), 0, 'a destroyed page stops every callback');
}
// One tick reads each native chart signal once: the idle sentinel hands its snapshot to the reconcile and to the
// stored idle key, so an unchanged visible page costs exactly one PageVisible read per 2-second tick.
{
  const pageVisibleReads = (work) => work.queries.filter((query) => query.id === 'ProfilePage' && query.method === 'BHasClass' && query.args[0] === 'PageVisible').length;
  const asyncReads = (work) => work.queries.filter((query) => query.id === 'AsyncHistoryMock' && query.method === 'BHasClass').length;
  const r = rankHistoryPage({ asyncState: 'AsyncSuccessState' });
  r.h.advance(3);
  assert.strictEqual(r.h.pending(), 1, 'a settled visible page leaves only the idle sentinel');
  r.h.resetWork();
  r.h.runNext();
  const unchanged = r.h.snapshotWork();
  assert.strictEqual(pageVisibleReads(unchanged), 1, 'an unchanged idle tick reads PageVisible exactly once');
  assert.strictEqual(asyncReads(unchanged), 2, 'an unchanged idle tick reads the match-history state once (failure and success checks)');
  assert.strictEqual(r.h.pending(), 1, 'the unchanged sentinel keeps one pending callback');
  r.h.resetWork();
  r.h.runNext(); r.h.runNext();
  assert.strictEqual(pageVisibleReads(r.h.snapshotWork()), 2, 'each further unchanged idle tick adds exactly one PageVisible read');
  r.h.resetWork();
  r.page.root.classes.delete('PageVisible');
  r.h.runNext();
  assert.strictEqual(pageVisibleReads(r.h.snapshotWork()), 1, 'a tick that detects the page leaving reuses its snapshot for the reconcile');
  assert.strictEqual(r.chartUrls().filter((url) => url !== 'about:blank').length, 0, 'the hidden page keeps no chart loaded');
  r.h.resetWork();
  r.page.root.classes.add('PageVisible'); r.setAsync('AsyncLoadingState');
  r.h.runNext();
  assert.strictEqual(pageVisibleReads(r.h.snapshotWork()), 1, 'a tick that detects the page returning reads PageVisible once');
  r.h.resetWork();
  r.h.runNext();
  assert.strictEqual(pageVisibleReads(r.h.snapshotWork()), 1, 'a fast loading tick also reads PageVisible once');
  r.h.resetWork();
  r.page.root.ShowRankBarebonesRankHistoryOn();
  assert.strictEqual(pageVisibleReads(r.h.snapshotWork()), 1, 'the tab handler reads one fresh snapshot while the fast loop keeps running');
}
{
  const r = rankHistoryPage({ asyncState: 'AsyncSuccessState' });
  r.h.advance(1);
  r.page.root.ShowRankBarebonesRankHistoryOn();
  setProfilePageAccount(r.page, '1424351890'); r.h.advance(0.5);
  assert.strictEqual(r.state('On'), false, 'a profile change drops the manual Rank History selection');
  assert.strictEqual(r.page.chart.urls.at(-1), 'about:blank', 'the old account chart is unloaded');
  r.page.root.ShowRankBarebonesRankHistoryOn();
  r.page.witness.text = '999'; r.h.advance(0.5);
  assert.strictEqual(r.state('On'), false, 'conflicting identity evidence closes the chart');
  assert.strictEqual(r.page.chart.urls.at(-1), 'about:blank');
  r.page.root.ShowRankBarebonesRankHistoryOn();
  assert.strictEqual(r.state('On'), false, 'Rank History cannot open without a verified account');
  r.h.advance(30);
  assert.strictEqual(r.h.pending(), 1);
}
// VS COMMUNITY auto-open. Failure modes: opening before stock stats load (every profile reads 0 while loading);
// opening a profile that has games; reopening every tick and fighting a user who went back to stock; missing a
// later empty profile or a return visit; reading stats forever on a settled page.
{
  const shown = (r) => r.page.communityPanel.style.visibility === 'visible';
  const requests = (r) => r.page.communityBridge.urls.filter((url) => /deadlock-stats-bridge\/bridge\.html\?/.test(url)).map((url) => new URL(url).searchParams.get('account_id'));
  // Startup: the page is already visible with loaded empty stats when the host's first tick runs synchronously,
  // before the comparison runtime binds (0.01 s later). The open must still happen.
  const r = rankHistoryPage({ asyncState: 'AsyncFailureState', stats: 'empty', community: true });
  assert.strictEqual(shown(r), false, 'nothing opens before the comparison runtime is bound');
  r.h.advance(1.5);
  assert.strictEqual(shown(r), true, 'already-loaded empty stats open VS COMMUNITY once the runtime binds');
  assert.deepStrictEqual(requests(r), ['487348881'], 'the comparison requests the viewed account');
  // The user returns to stock stats by picking a hero; the same visit never reopens it.
  r.page.root.FindChildTraverse('StatsTitle').children[0].text = 'Abrams';
  r.h.advance(3);
  assert.strictEqual(shown(r), false, 'picking a hero restores the stock stats');
  r.h.advance(10);
  assert.strictEqual(shown(r), false, 'it never reopens on the same visit');
  assert.deepStrictEqual(requests(r), ['487348881']);
  r.h.resetWork(); r.h.advance(4);
  assert.strictEqual(r.h.snapshotWork().queries.filter((query) => query.id === 'StatsAsyncMock' || query.id === 'GamesPlayedContainer').length, 0, 'a decided visit reads no stats');
  // A return visit opens it again; another empty profile opens for that account; a filled one stays stock.
  r.page.root.classes.delete('PageVisible'); r.h.advance(2.5);
  r.page.root.classes.add('PageVisible'); r.h.advance(2.5);
  assert.strictEqual(shown(r), true, 'returning to the empty profile opens it again');
  r.page.root.FindChildTraverse('StatsTitle').children[0].text = 'All Heroes'; r.h.advance(3);
  setProfilePageAccount(r.page, '1424351890'); r.page.root.FindChildTraverse('ProfileStatsCommunityAccount').text = '1424351890';
  r.page.gamesPlayed.classes.delete('isZeroValue'); r.h.advance(3);
  assert.strictEqual(shown(r), false, 'a profile with games stays on stock stats');
  setProfilePageAccount(r.page, '1424351891'); r.page.root.FindChildTraverse('ProfileStatsCommunityAccount').text = '1424351891';
  r.page.gamesPlayed.classes.add('isZeroValue'); r.h.advance(3);
  assert.strictEqual(shown(r), true, 'another empty profile opens for that account');
  assert.strictEqual(requests(r).at(-1), '1424351891', 'the reopened comparison requests the new account');
}
{
  const r = rankHistoryPage({ asyncState: 'AsyncSuccessState', stats: 'loading', community: true });
  r.h.advance(5);
  assert.strictEqual(r.page.communityPanel.style.visibility, 'collapse', 'loading stats never open VS COMMUNITY');
  r.page.statsAsync.classes.delete('AsyncLoadingState'); r.page.statsAsync.classes.add('AsyncSuccessState');
  r.h.advance(1);
  assert.strictEqual(r.page.communityPanel.style.visibility, 'visible', 'stats that finish loading empty open it');
}
{
  const r = rankHistoryPage({ asyncState: 'AsyncSuccessState', stats: 'filled', community: true });
  r.h.advance(5);
  assert.strictEqual(r.page.communityPanel.style.visibility, 'collapse', 'filled stats never auto-open');
}
{
  // The comparison runtime never binds (its panels are missing): retries stop and the settled page goes idle.
  const r = rankHistoryPage({ asyncState: 'AsyncSuccessState', stats: 'empty' });
  r.h.advance(10);
  assert.strictEqual(r.h.pending(), 1, 'bounded retries leave only the idle sentinel');
  r.h.resetWork(); r.h.advance(4);
  assert.strictEqual(r.h.snapshotWork().queries.filter((query) => query.id === 'StatsAsyncMock' || query.id === 'GamesPlayedContainer').length, 0, 'a given-up visit reads no stats');
}
// hidden-page-community: a profile page that lost PageVisible but stays valid, with VS COMMUNITY open. The comparison runtime treats the hide
// like any other leave: it restores the stock view, cancels its watcher and unloads both community HTML panels. Only the host's page sentinel keeps running.
const HIDDEN_COMMUNITY_TICKER_URL = 'https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip/';
const HIDDEN_COMMUNITY_GROUPS = [['kda', 'kills_plus_assists', 'player_damage_per_health'], ['average_kills', 'average_deaths', 'average_assists'], ['accuracy', 'critical_hit_rate', 'kd'], ['player_damage_per_minute', 'damage_taken_per_minute', 'objective_damage_per_minute'], ['net_worth_per_minute', 'average_last_hits', 'average_denies'], ['self_healing_per_minute', 'player_healing_per_minute', 'heal_prevented']];
const HIDDEN_COMMUNITY_GROUP_IDS = ['performance', 'scoreboard', 'accuracy_kd', 'damage', 'economy', 'healing'];
function hiddenCommunityPage(options = {}) {
  const r = rankHistoryPage({ asyncState: 'AsyncFailureState', stats: 'empty', community: true, playstyle: true, ...options });
  r.ticker = r.page.root.FindChildTraverse('ProfileStatsCommunitySupporterTicker');
  return r;
}
function hiddenCommunityCounts(r) {
  return { bridge: r.page.communityBridge.urls.length, ticker: r.ticker.urls.length, rank: r.page.chart.urls.length, play: r.page.playChart.urls.length };
}
function hiddenCommunityRequestUrl(r) {
  const requests = r.page.communityBridge.urls.filter((url) => /deadlock-stats-bridge\/bridge\.html\?/.test(url));
  return requests.length ? new URL(requests.at(-1)) : null;
}
function hiddenCommunityDeliver(r, kind, overrides = {}) {
  const request = hiddenCommunityRequestUrl(r).searchParams;
  const base = { v: 4, request: request.get('request'), account: Number(request.get('account_id')), matches: Number(request.get('matches')), mode: request.get('mode') };
  const body = kind === 'ready'
    ? { ...base, kind: 'profile_stats', sample: 10, generated: new Date().toISOString(), groups: HIDDEN_COMMUNITY_GROUP_IDS.map((id, index) => ({ id, metrics: HIDDEN_COMMUNITY_GROUPS[index].map((metric) => [metric, 1, 1, 50]) })) }
    : { ...base, kind: 'error', code: 'upstream_error', status: 502 };
  r.page.communityBridge.htmlEvents.HTMLTitle(r.page.communityBridge, `DLSTATS2:${JSON.stringify({ ...body, ...overrides })}`);
}
function hiddenCommunityHideMinute(r) {
  const before = hiddenCommunityCounts(r);
  r.page.root.classes.delete('PageVisible');
  r.h.resetWork(); r.h.advance(60);
  return { before, after: hiddenCommunityCounts(r), work: r.h.snapshotWork() };
}
function hiddenCommunityRequestCount(r) {
  return r.page.communityBridge.urls.filter((url) => /deadlock-stats-bridge\/bridge\.html\?/.test(url)).length;
}
function assertHiddenCommunityMinute(r, minute, label) {
  const { before, after, work } = minute;
  assert.strictEqual(r.page.communityPanel.style.visibility, 'collapse', `${label}: the hide collapses VS COMMUNITY and shows the stock stats`);
  assert.strictEqual(work.callbacks, 31, `${label}: a hidden minute runs 31 callbacks`);
  assert.deepStrictEqual(work.callbacksByDelay, { 0.5: 2, 2: 29 }, `${label}: 29 are the 2 s page sentinel, one 0.5 s tick unloads the charts and one is the comparison watcher's last`);
  assert.strictEqual(r.h.pending(), 1, `${label}: only the page sentinel stays armed`);
  assert.strictEqual(r.ticker.urls.at(-1), 'about:blank', `${label}: the supporter ticker is unloaded`);
  assert.strictEqual(r.ticker.style.visibility, 'collapse', `${label}: the supporter ticker is collapsed`);
  assert.strictEqual(r.page.communityBridge.urls.at(-1), 'about:blank', `${label}: the request panel is unloaded`);
  assert.strictEqual(r.page.communityBridge.style.visibility, 'collapse', `${label}: the request panel is collapsed`);
  assert.deepStrictEqual([after.ticker - before.ticker, after.bridge - before.bridge], [1, 1], `${label}: each community panel gets exactly one blank write`);
  assert.deepStrictEqual([r.page.chart.urls.slice(before.rank), r.page.playChart.urls.slice(before.play)], [['about:blank'], ['about:blank']], `${label}: the two charts unload as before`);
  assert.strictEqual(work.panelCalls.SetURL, 4, `${label}: the two charts and the two community panels are the only URL writes`);
  assert.deepStrictEqual({ IsValid: work.panelCalls.IsValid, GetAttributeString: work.panelCalls.GetAttributeString, BHasClass: work.panelCalls.BHasClass }, { IsValid: 122, GetAttributeString: 0, BHasClass: 31 }, `${label}: native reads per hidden minute`);
}
{
  // Auto-opened while loading: the hide drops the in-flight request, blanks both community panels and leaves only the sentinel.
  const label = 'hidden-page-community.auto';
  const r = hiddenCommunityPage(); r.h.advance(1.5);
  assert.strictEqual(r.page.communityPanel.style.visibility, 'visible', `${label}: the empty profile auto-opened`);
  assert.ok(hiddenCommunityRequestUrl(r), `${label}: a request was loaded`);
  assert.notStrictEqual(r.page.communityBridge.urls.at(-1), 'about:blank', `${label}: the request panel is loading before the hide`);
  const minute = hiddenCommunityHideMinute(r);
  assertHiddenCommunityMinute(r, minute, label);
  captureBaseline('baseline.hidden-community-auto', r.h);
  r.h.resetWork(); r.h.advance(60);
  const second = r.h.snapshotWork();
  assert.deepStrictEqual([second.callbacks, second.callbacksByDelay, second.panelCalls.SetURL], [30, { 2: 30 }, 0], `${label}: the second hidden minute runs only the 30 sentinel ticks and writes no URL`);
  assert.strictEqual(r.h.pending(), 1, `${label}: only the sentinel stays armed with time`);
}
for (const kind of ['ready', 'error']) {
  // The comparison already has its result when the page hides: the request panel is already blank and both community panels end blank.
  const label = `hidden-page-community.${kind}`;
  const r = hiddenCommunityPage(); r.h.advance(1.5);
  hiddenCommunityDeliver(r, kind);
  assert.strictEqual(r.page.communityBridge.urls.at(-1), 'about:blank', `${label}: the delivered result unloads the request panel`);
  const minute = hiddenCommunityHideMinute(r);
  assertHiddenCommunityMinute(r, minute, label);
  captureBaseline(`baseline.hidden-community-${kind}`, r.h);
}
{
  // A title delivered after the hide is ignored, whether its nonce is foreign or the dropped request's own: the stock view stays,
  // nothing is written, the result never enters the memory cache, and the old nonce stays stale on the request that follows the return.
  const label = 'hidden-page-community.stale-title';
  const r = hiddenCommunityPage(); r.h.advance(1.5);
  const droppedNonce = hiddenCommunityRequestUrl(r).searchParams.get('request');
  hiddenCommunityHideMinute(r);
  const afterHide = hiddenCommunityCounts(r), requestsAfterHide = hiddenCommunityRequestCount(r);
  hiddenCommunityDeliver(r, 'ready', { request: 'stale' });
  hiddenCommunityDeliver(r, 'ready');
  hiddenCommunityDeliver(r, 'error');
  assert.strictEqual(r.page.communityPanel.style.visibility, 'collapse', `${label}: no title reopens the comparison`);
  assert.deepStrictEqual(hiddenCommunityCounts(r), afterHide, `${label}: no title writes a URL`);
  assert.strictEqual(r.page.communityBridge.urls.at(-1), 'about:blank', `${label}: the request panel stays blank`);
  assert.strictEqual(r.ticker.urls.at(-1), 'about:blank', `${label}: the ticker stays blank`);
  assert.strictEqual(r.h.pending(), 1, `${label}: the sentinel is still the only callback`);
  captureBaseline('baseline.hidden-community-stale-title', r.h);
  r.page.root.classes.add('PageVisible'); r.h.advance(5);
  assert.strictEqual(r.page.communityPanel.style.visibility, 'visible', `${label}: the return reopens the empty profile`);
  assert.strictEqual(hiddenCommunityRequestCount(r), requestsAfterHide + 1, `${label}: the ignored result left no cache, so the return requests again`);
  const returnNonce = hiddenCommunityRequestUrl(r).searchParams.get('request');
  assert.notStrictEqual(returnNonce, droppedNonce, `${label}: the new request has a new nonce`);
  hiddenCommunityDeliver(r, 'ready', { request: droppedNonce });
  assert.notStrictEqual(r.page.communityBridge.urls.at(-1), 'about:blank', `${label}: the dropped request's nonce is stale on the new request`);
  assert.strictEqual(r.page.communityBridge.style.visibility, 'visible', `${label}: the new request keeps loading`);
  hiddenCommunityDeliver(r, 'ready');
  assert.strictEqual(r.page.communityBridge.urls.at(-1), 'about:blank', `${label}: the new request's own result is accepted`);
  assert.strictEqual(r.page.communityPanel.style.visibility, 'visible', `${label}: the comparison stays shown with the new result`);
}
for (const state of ['loading', 'ready', 'error']) {
  // Return without any pointer or hover call: the host's auto-open rule decides again for the empty profile. A delivered result
  // is still in PSC's memory cache and is rendered without a new request; a dropped or failed request starts a new one.
  const label = `hidden-page-community.return-${state}`;
  const r = hiddenCommunityPage(); r.h.advance(1.5);
  if (state !== 'loading') hiddenCommunityDeliver(r, state);
  hiddenCommunityHideMinute(r);
  const before = hiddenCommunityCounts(r), requestsBefore = hiddenCommunityRequestCount(r);
  r.page.root.classes.add('PageVisible');
  r.h.resetWork(); r.h.advance(5);
  const work = r.h.snapshotWork(), after = hiddenCommunityCounts(r);
  assert.strictEqual(r.page.communityPanel.style.visibility, 'visible', `${label}: the return reopens VS COMMUNITY for the empty profile`);
  assert.strictEqual(hiddenCommunityRequestCount(r), requestsBefore + (state === 'ready' ? 0 : 1), `${label}: ${state === 'ready' ? 'the cached result needs no new request' : 'a new request is made'}`);
  assert.strictEqual(after.bridge - before.bridge, state === 'ready' ? 1 : 2, `${label}: the request panel gets its unload${state === 'ready' ? '' : ' and the new request URL'}`);
  assert.strictEqual(r.page.communityBridge.urls.at(-1) === 'about:blank', state === 'ready', `${label}: the request panel is blank only for the cached result`);
  assert.strictEqual(r.ticker.urls.at(-1), HIDDEN_COMMUNITY_TICKER_URL, `${label}: the ticker loads again with the reopened comparison`);
  assert.strictEqual(after.ticker - before.ticker, 1, `${label}: the ticker is loaded once`);
  assert.ok(/rank-history\.html\?/.test(r.page.chart.urls.at(-1)) && /playstyle\.html\?/.test(r.page.playChart.urls.at(-1)), `${label}: the two charts reload`);
  assert.deepStrictEqual([work.callbacks, work.callbacksByDelay], [19, { 0.5: 18, 2: 1 }], `${label}: five visible seconds run 19 callbacks`);
  assert.strictEqual(r.h.pending(), 2, `${label}: the comparison watcher and the sentinel are armed again`);
  captureBaseline(`baseline.hidden-community-return-${state}`, r.h);
}
{
  // Manual open on a profile with games: the hide restores stock like the auto-opened comparison, and the return stays on stock
  // because the host's auto-open rule does not open a profile with games.
  const label = 'hidden-page-community.manual';
  const r = hiddenCommunityPage({ stats: 'filled' }); r.h.advance(5);
  assert.strictEqual(r.page.communityPanel.style.visibility, 'collapse', `${label}: a profile with games stays on stock stats`);
  assert.strictEqual(r.h.pending(), 1, `${label}: only the sentinel runs while the comparison is closed`);
  r.page.communityButton.panelEvents.onactivate(); r.h.advance(1);
  assert.strictEqual(r.page.communityPanel.style.visibility, 'visible', `${label}: the button opens VS COMMUNITY`);
  assert.notStrictEqual(r.page.communityBridge.urls.at(-1), 'about:blank', `${label}: the request panel is loading before the hide`);
  const minute = hiddenCommunityHideMinute(r);
  assertHiddenCommunityMinute(r, minute, label);
  captureBaseline('baseline.hidden-community-manual', r.h);
  const before = hiddenCommunityCounts(r);
  r.page.root.classes.add('PageVisible'); r.h.resetWork(); r.h.advance(5);
  assert.strictEqual(r.page.communityPanel.style.visibility, 'collapse', `${label}: the return shows the stock stats`);
  assert.deepStrictEqual([hiddenCommunityCounts(r).bridge, hiddenCommunityCounts(r).ticker], [before.bridge, before.ticker], `${label}: the return writes no community URL`);
  assert.strictEqual(r.h.pending(), 1, `${label}: only the sentinel runs after the return`);
}
// Profile tab handlers. Panorama compiles an onactivate string containing script as JavaScript, where a bare
// native event such as CitadelProfileShowMatchHistoryTab( 0 ) is an undefined function: the ReferenceError skips
// both the native tab switch and Rank History's exit (live 6795 console.log, 2026-10-19). Run each scripted tab
// handler the way Panorama does and require the native switch plus Rank History's exit.
{
  const layout = fs.readFileSync(path.join(hostRoot, 'panorama', 'layout', 'citadel_db_page_profile.xml'), 'utf8');
  const handlerFor = (id) => {
    const match = layout.match(new RegExp(`<Label id="${id}"[^>]*onactivate="([^"]*)"`));
    assert.ok(match, `${id} has an onactivate handler`);
    return match[1].replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  };
  for (const [id, tab] of [['matchHistoryLabel', 0], ['showcaseLabel', 1]]) {
    const calls = [];
    const labels = { '#matchHistoryLabel': { id: 'matchHistoryLabel' }, '#showcaseLabel': { id: 'showcaseLabel' } };
    const context = { ShowRankBarebonesRankHistoryOff: () => calls.push('off') };
    const dollar = (selector) => labels[selector] || null;
    dollar.GetContextPanel = () => context;
    dollar.DispatchEvent = (...args) => calls.push(args);
    assert.doesNotThrow(() => vm.runInNewContext(handlerFor(id), { $: dollar }), `${id} handler runs as JavaScript`);
    assert.deepStrictEqual(calls, ['off', ['CitadelProfileShowMatchHistoryTab', labels[`#${id}`], tab]], `${id} exits Rank History, then switches the native tab from its own label`);
  }
}
// Profile credit. Failure modes: a bare native event in the link handler throws as JavaScript; the link opens
// another URL; the shown version drifts from package.json; the credit sits inside the flowing page root, which
// would push it off-screen.
{
  const layout = fs.readFileSync(path.join(hostRoot, 'panorama', 'layout', 'citadel_db_page_profile.xml'), 'utf8');
  const { version } = JSON.parse(fs.readFileSync(path.join(repositoryDir, 'showrank_barebones', 'package.json'), 'utf8'));
  const credit = layout.match(/<Panel id="ShowRankBarebonesCredit"[^>]*>([\s\S]*?)<\/Panel>\s*<\/AsyncDataPanel>/);
  assert.ok(credit, 'the credit is the last child of the non-flowing AsyncDataPanel');
  const text = Array.from(credit[1].matchAll(/text="([^"]*)"/g), (match) => match[1]).join(' ');
  assert.strictEqual(text, `ShowRank v${version} · made by hanturaya`, 'the credit shows the package version and the author');
  const handler = credit[1].match(/<Label id="ShowRankBarebonesCreditLink"[^>]*onactivate="([^"]*)"/);
  assert.ok(handler, 'the author name is a link');
  const calls = [];
  const dollar = () => null;
  dollar.DispatchEvent = (...args) => calls.push(args);
  assert.doesNotThrow(() => vm.runInNewContext(handler[1].replace(/&apos;/g, "'").replace(/&quot;/g, '"'), { $: dollar }), 'the link handler runs as JavaScript');
  assert.deepStrictEqual(calls, [['ExternalBrowserGoToURL', 'https://x.com/hanturaya']], 'the link opens the author X profile');
}
// Playstyle radar. Failure modes: radar disabled because Rank History panels are missing; a visible profile switch
// (no hover, unchanged history state) keeping the old account's radar; stale/foreign titles; a page that never
// answers; hidden pages keeping the HTML loaded; a Rank History error blanking the radar.
const PLAYSTYLE_URL = 'https://hantu-raya.github.io/deadlock-stats-bridge/playstyle.html';
function playRequest(page) {
  const url = new URL(page.playChart.urls.at(-1));
  assert.strictEqual(`${url.origin}${url.pathname}`, PLAYSTYLE_URL, 'the radar loads only the playstyle page');
  return url;
}
const playTitle = (body) => `DLPLAY1:${JSON.stringify({ v: 1, ...body })}`;
{
  const h = harness(); const page = profilePage('487348881', { playstyle: true });
  h.evaluate(page.root);
  const first = playRequest(page);
  assert.deepStrictEqual([...first.searchParams.keys()], ['protocol', 'request', 'account_id'], 'the radar request carries only protocol, nonce and account');
  assert.strictEqual(first.searchParams.get('account_id'), '487348881', 'a page without Rank History panels still loads the radar for the verified account');
  assert.strictEqual(page.playStatus.text, 'LOADING PLAYSTYLE');
  page.playChart.htmlEvents.HTMLTitle(page.playChart, playTitle({ request: 'stale', kind: 'ready', axes: 6 }));
  page.playChart.htmlEvents.HTMLTitle(page.playChart, 'Deadlock Playstyle');
  assert.strictEqual(page.playHost.classes.has('ShowRankBarebonesChartLoaded'), false, 'stale and normal titles stay hidden');
  page.playChart.htmlEvents.HTMLTitle(page.playChart, playTitle({ request: first.searchParams.get('request'), kind: 'ready', axes: 6 }));
  assert.strictEqual(page.playHost.classes.has('ShowRankBarebonesChartLoaded'), true, 'the current status reveals the radar');
  h.advance(3);
  // Profile switch on a visible page: no hover, no history-state change.
  setProfilePageAccount(page, '1424351890'); h.advance(2.1);
  assert.strictEqual(playRequest(page).searchParams.get('account_id'), '1424351890', 'the sentinel notices a visible profile switch');
  assert.strictEqual(page.playHost.classes.has('ShowRankBarebonesChartLoaded'), false, 'the old radar is hidden until the new status arrives');
  h.advance(30);
  assert.strictEqual(page.playStatus.text, 'PLAYSTYLE UNAVAILABLE', 'a radar page that never answers times out visibly');
  page.root.classes.delete('PageVisible'); h.advance(2.1);
  assert.strictEqual(page.playChart.urls.at(-1), 'about:blank', 'leaving the page unloads the radar');
  page.root.classes.add('PageVisible'); h.advance(2.1);
  assert.strictEqual(playRequest(page).searchParams.get('account_id'), '1424351890', 'returning reloads the radar without pointer activity');
  page.root.valid = false; h.advance(4);
  assert.strictEqual(h.pending(), 0);
}
{
  const h = harness(); const page = profilePage('487348881', { playstyle: true, rankHistory: true, asyncState: 'AsyncFailureState' });
  h.evaluate(page.root); h.advance(0.5);
  const rankNonce = new URL(page.chart.urls.at(-1)).searchParams.get('request');
  page.chart.htmlEvents.HTMLTitle(page.chart, `DLRANKH1:${JSON.stringify({ v: 1, request: rankNonce, kind: 'error', code: 'rate_limit' })}`);
  page.chart.htmlEvents.HTMLTitle(page.chart, playTitle({ request: playRequest(page).searchParams.get('request'), kind: 'ready', axes: 6 }));
  assert.strictEqual(page.playHost.classes.has('ShowRankBarebonesChartLoaded'), false, 'a status from the other chart cannot reveal the radar');
  page.playChart.htmlEvents.HTMLTitle(page.playChart, playTitle({ request: playRequest(page).searchParams.get('request'), kind: 'ready', axes: 6 }));
  assert.strictEqual(page.playHost.classes.has('ShowRankBarebonesChartLoaded'), true);
  assert.strictEqual(page.host.classes.has('ShowRankBarebonesChartLoaded'), true, 'both charts keep independent status');
  const playLoads = page.playChart.urls.length;
  page.root.ShowRankBarebonesRankHistoryGroup(10);
  assert.strictEqual(page.playChart.urls.length, playLoads, 'a Rank History group change does not reload the radar');
  page.root.valid = false; h.advance(4);
}
// Party markers. Failure modes: the bridge panel can be absent (HP Colors composition) or never answer;
// titles can be the page's normal title, stale, foreign, oversized, malformed or an error; groups can name
// unknown, cross-team or repeated accounts; duplicate title/fragment delivery must not rewrite rows;
// same-match reopen must not refetch; hideout must clear stacks and drop row panels.
const PARTY_URL = 'https://hantu-raya.github.io/deadlock-stats-bridge/party.html';
function partyMatch(options = {}) {
  const h = harness(); const card = profile('101'), menu = escapeMenu({ bridge: options.bridge !== false });
  const roster = playerRoster(options.heroes || STANDARD_HEROES, options.prefix || 'Party', { party: true });
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(301 + index));
  const dollar = h.evaluate(menu.root);
  return {
    h, menu, roster,
    open() { h.documentRoot.classes.add('ShowEscapeMenu'); dollar.ShowRankBarebonesEscapeOpen(); h.advance(10); },
    close() { h.documentRoot.classes.delete('ShowEscapeMenu'); dollar.ShowRankBarebonesEscapeOut(); h.advance(1); },
    fire(name, value) { menu.bridge.htmlEvents[name](menu.bridge, value); },
  };
}
function partyRequest(menu) {
  const url = new URL(menu.bridge.urls.at(-1));
  assert.strictEqual(`${url.origin}${url.pathname}`, PARTY_URL, 'party requests load only the party bridge page');
  return url;
}
function partyTitle(request, body) { return typeof body === 'string' ? body : `DLPARTY1:${JSON.stringify({ v: 1, request, ...body })}`; }
function stackState(stack) {
  if (!stack.classes.has('ShowRankBarebonesPartyActive')) return null;
  const colors = [0, 1, 2, 3, 4, 5].filter((index) => stack.classes.has(`ShowRankBarebonesPartyColor${index}`));
  let size = 2;
  while (stack.classes.has(`ShowRankBarebonesPartyAtLeast${size + 1}`)) size += 1;
  return `${size}:${colors.join(',')}`;
}
{
  const m = partyMatch(); m.open();
  const request = partyRequest(m.menu);
  assert.deepStrictEqual([...request.searchParams.keys()], ['protocol', 'request', 'friendly', 'enemy'], 'party request carries only protocol, nonce and team accounts');
  assert.strictEqual(request.searchParams.get('protocol'), '1');
  assert.strictEqual(request.searchParams.get('friendly'), '301,302,303,304,305,306', 'friendly accounts come from ancestry-proven TeamFriendly slots');
  assert.strictEqual(request.searchParams.get('enemy'), '307,308,309,310,311,312', 'enemy accounts come from ancestry-proven TeamEnemy slots');
  const nonce = request.searchParams.get('request');
  assert.match(nonce, /^[A-Za-z0-9_-]{1,64}$/);
  assert.strictEqual(m.menu.bridge.urls.length, 1, 'one bridge request per completed roster');
  const title = partyTitle(nonce, { kind: 'ok', groups: [[307, 309, 308], [301, 303]] });
  m.fire('HTMLTitle', 'Deadlock Party Bridge');
  m.fire('HTMLTitle', partyTitle('stale', { kind: 'ok', groups: [[301, 302]] }));
  m.fire('HTMLURLChanged', `https://example.invalid/party.html#${encodeURIComponent(title)}`);
  assert.ok(m.roster.rows.every((player) => stackState(player.stack) === null), 'normal titles, stale nonces and foreign pages render nothing');
  m.fire('HTMLURLChanged', `${m.menu.bridge.urls[0]}#${encodeURIComponent(title)}`);
  assert.deepStrictEqual(
    m.roster.rows.map((player) => stackState(player.stack)),
    ['2:0', null, '2:0', null, null, null, '3:1', '3:1', '3:1', null, null, null],
    'each group stacks one icon per member with one color per group',
  );
  assert.strictEqual(m.menu.bridge.urls.at(-1), 'about:blank', 'the bridge unloads after its result');
  m.h.resetWork();
  m.fire('HTMLTitle', title);
  const duplicate = m.h.snapshotWork();
  assert.strictEqual(duplicate.panelCalls.AddClass + duplicate.panelCalls.RemoveClass, 0, 'a duplicate title delivery writes no classes');
  m.close(); m.h.resetWork(); m.open();
  const replay = m.h.snapshotWork();
  assert.strictEqual(m.menu.bridge.urls.length, 2, 'same-match reopen reuses the party result without a second request');
  assert.strictEqual(replay.panelCalls.AddClass + replay.panelCalls.RemoveClass, 0, 'unchanged replay writes no stack classes');
  assert.strictEqual(stackState(m.roster.rows[0].stack), '2:0', 'replay keeps the rendered stacks');
  m.close();
  m.h.documentRoot.classes.add('connectedToHideout'); m.h.evaluate(topbar('', 'PartyHideoutBar').root);
  assert.strictEqual(m.h.documentRoot.__showrank_barebones_state_v1.party, null, 'hideout drops party state and its row panels');
  assert.ok(m.roster.rows.every((player) => stackState(player.stack) === null), 'hideout clears every party stack');
}
// A reused row whose hero no longer maps to exactly one roster account must lose the previous player's stack.
{
  const m = partyMatch({ prefix: 'PartyReused' }); m.open();
  const nonce = partyRequest(m.menu).searchParams.get('request');
  m.fire('HTMLTitle', partyTitle(nonce, { kind: 'ok', groups: [[307, 309, 308], [301, 303]] }));
  assert.strictEqual(stackState(m.roster.rows[0].stack), '2:0');
  assert.strictEqual(stackState(m.roster.rows[6].stack), '3:1');
  m.close();
  m.roster.rows[0].heroLabel.text = 'calico';
  m.roster.rows[6].heroLabel.text = STANDARD_HEROES[7];
  m.open();
  assert.strictEqual(m.menu.bridge.urls.filter((url) => url !== 'about:blank').length, 1, 'replay still reuses the party result');
  assert.strictEqual(stackState(m.roster.rows[0].stack), null, 'a row now showing an unmatched hero drops the old stack');
  assert.strictEqual(stackState(m.roster.rows[6].stack), null, 'a row now showing an ambiguous duplicate hero drops the old stack');
  assert.strictEqual(stackState(m.roster.rows[2].stack), '2:0', 'unchanged party rows keep their stacks');
  assert.strictEqual(stackState(m.roster.rows[7].stack), '3:1', 'the row that still owns the duplicated hero keeps its stack');
}
for (const [label, body, ignored] of [
  ['cross-team group', { kind: 'ok', groups: [[301, 307]] }],
  ['unknown account', { kind: 'ok', groups: [[301, 999]] }],
  ['repeated account', { kind: 'ok', groups: [[301, 302], [302, 303]] }],
  ['single member', { kind: 'ok', groups: [[301]] }],
  ['oversized group', { kind: 'ok', groups: [[301, 302, 303, 304, 305, 306, 307]] }],
  ['string accounts', { kind: 'ok', groups: [['301', '302']] }],
  ['bridge error', { kind: 'error', code: 'rate_limit' }],
  ['wrong protocol', { v: 2, kind: 'ok', groups: [[301, 302]] }, true],
  ['oversized title', `DLPARTY1:${' '.repeat(2100)}`, true],
  ['malformed json', 'DLPARTY1:{', true],
]) {
  const m = partyMatch({ prefix: `PartyBad${label.replace(/\W/g, '')}` }); m.open();
  const firstNonce = partyRequest(m.menu).searchParams.get('request');
  m.fire('HTMLTitle', partyTitle(firstNonce, body));
  assert.ok(m.roster.rows.every((player) => stackState(player.stack) === null), `${label}: renders no party stack`);
  if (ignored) {
    assert.strictEqual(m.menu.bridge.urls.length, 1, `${label}: ignored titles keep waiting for a valid result`);
    m.h.advance(25);
  }
  assert.strictEqual(m.menu.bridge.urls.at(-1), 'about:blank', `${label}: the bridge unloads after failure or timeout`);
  m.close(); m.open();
  assert.notStrictEqual(partyRequest(m.menu).searchParams.get('request'), firstNonce, `${label}: the next Escape opening retries with a new nonce`);
}
{
  const m = partyMatch({ heroes: STANDARD_HEROES.slice(0, 6), prefix: 'PartySix' }); m.open();
  assert.deepStrictEqual(m.menu.bridge.urls, [], 'rosters without proven six-versus-six sides send no party request');
  const plain = partyMatch({ bridge: false, prefix: 'PartyNoBridge' }); plain.open(); plain.h.drain();
  assert.ok(plain.roster.rows.every((player) => stackState(player.stack) === null), 'a missing bridge panel leaves ranks only');
  assert.strictEqual(plain.h.pending(), 0, 'a missing bridge panel schedules no party timeout');
}
// Failure modes: stale owners must not close replacements; canceled owners must release;
// changed row bindings must not receive old witnesses; startup must preserve newer verified renders.
const regressions = [
  ['escape.stale-mouseout-cannot-cancel-replacement', () => {
    const h = harness(), first = escapeMenu(), second = escapeMenu();
    const firstDollar = h.evaluate(first.root);
    firstDollar.ShowRankBarebonesEscapeOpen();
    first.root.valid = false;
    firstDollar.ShowRankBarebonesEscapeOut();
    h.evaluate(second.root).ShowRankBarebonesEscapeOpen();
    const shared = h.documentRoot.__showrank_barebones_state_v1, token = shared.escapeToken;
    h.runDelay(0);
    assert.strictEqual(shared.escape && shared.escape.root, second.root, 'old deferred mouseout cannot release a replacement');
    assert.strictEqual(shared.escapeToken, token, 'old deferred mouseout cannot advance the replacement token');
    h.drain();
  }],
  ['escape.closed-scheduled-owner-releases-session', () => {
    const h = harness(), menu = escapeMenu();
    const dollar = h.evaluate(menu.root);
    dollar.ShowRankBarebonesEscapeOpen();
    h.documentRoot.RemoveClass('ShowEscapeMenu');
    h.drain();
    const shared = h.documentRoot.__showrank_barebones_state_v1;
    assert.deepStrictEqual([shared.escapeOpenLatched, shared.escape, shared.escapeRoot], [false, null, null], 'native close without mouseout releases its scheduled owner');
    h.documentRoot.AddClass('ShowEscapeMenu');
    dollar.ShowRankBarebonesEscapeOpen(); h.drain();
    assert.strictEqual(h.events.filter((panel) => panel === menu.playersTab).length, 2, 'the next native opening can start a fresh pass');
  }],
  ['escape.changed-row-during-witness-fails-closed', () => {
    const h = harness(), card = profile('101'), menu = escapeMenu(), bar = topbar('haze'), player = row('haze');
    h.evaluate(card.root); h.evaluate(bar.root); h.evaluate(player.root);
    h.on(player.mainContents, () => { setProfileAccount(card, '201'); player.heroLabel.text = 'calico'; });
    h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
    assert.deepStrictEqual(player.image.images.filter(Boolean), [], 'a reused row cannot receive a witness for its former hero');
    assert.deepStrictEqual(bar.image.images.filter(Boolean), [], 'the stale row witness cannot reach a topbar');
  }],
  ['topbar.late-startup-preserves-verified-rank', () => {
    const h = harness(), card = profile('101'), menu = escapeMenu(), roster = playerRoster(['haze'], 'LateStartup');
    roster.bars[0].heroLabel.text = '';
    h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(201 + index));
    roster.bars[0].heroLabel.text = 'haze';
    h.evaluate(menu.root).ShowRankBarebonesEscapeOpen();
    h.advance(0.7);
    assert.strictEqual(roster.bars[0].image.visible, true, 'startup must not hide a newer verified render');
    assert.strictEqual(roster.bars[0].image.images.at(-1), rankUrl('201'), 'startup must not erase a newer verified URL');
    h.drain();
  }],
  ['rank.unchanged-cache-replay-skips-image-writes', () => {
    const h = harness(), card = profile('101'), menu = escapeMenu(), roster = playerRoster(STANDARD_HEROES, 'UnchangedReplay');
    h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(201 + index));
    const dollar = h.evaluate(menu.root);
    dollar.ShowRankBarebonesEscapeOpen(); h.drain(); h.resetWork();
    dollar.ShowRankBarebonesEscapeOpen(); h.drain();
    captureBaseline('baseline.unchanged-cache-image-writes', h);
    assert.strictEqual(h.snapshotWork().panelCalls.SetImage, 0, 'unchanged verified replay performs no rank or average image writes');
  }],
  ['rank.presentation-cache-is-not-authority', () => {
    const h = harness(), menu = escapeMenu(), player = row('haze'), bar = topbar('haze');
    h.evaluate(bar.root); h.evaluate(player.root); h.drain();
    for (const image of [bar.image, player.image]) {
      image.__showrankBarebonesRankAccount = '999'; image.__showrankBarebonesRankHero = 'haze';
      image.SetImage(rankUrl('999')); image.visible = true;
    }
    h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
    assert.strictEqual(bar.image.visible, false, 'cached rendering state cannot preserve an unwitnessed topbar account');
    assert.strictEqual(player.image.visible, false, 'cached rendering state cannot preserve an unwitnessed row account');
    assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.completedRoster, null, 'rendering metadata cannot create a verified cache');
  }],
  ['rank.panel-metadata-failure-is-contained', () => {
    const h = harness(), card = profile('101');
    Object.defineProperty(card.image, '__showrankBarebonesRankAccount', {
      get() { throw new Error('native image property unavailable'); },
      set() { throw new Error('native image property unavailable'); },
    });
    assert.doesNotThrow(() => { h.evaluate(card.root); h.drain(); }, 'native image property failures stay inside the adapter');
    assert.strictEqual(card.image.visible, false, 'failed presentation metadata hides the unverified image');
  }],
  ['escape.roster-method-getter-failure-is-contained', () => {
    const h = harness(), menu = escapeMenu();
    const dollar = h.evaluate(menu.root);
    Object.defineProperty(h.documentRoot, 'FindChildrenWithClassTraverse', {
      get() { throw new Error('native traversal unavailable'); },
    });
    assert.doesNotThrow(() => { dollar.ShowRankBarebonesEscapeOpen(); h.drain(); }, 'a volatile panel method getter fails closed through bounded retries');
    assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.escape, null, 'failed traversal still releases the session');
  }],
  ['topbar.unready-record-has-no-rank-retries', () => {
    const h = harness(), panel = new Panel('CitadelHudTopBarPlayer', { classes: ['ShowRankBarebonesTopbarPlayer'] });
    h.evaluate(panel);
    assert.strictEqual(h.pending(), 0, 'rank retries cannot recover a null record and should not be scheduled');
  }],
  ['profile.invalidated-refresh-stops-chain', () => {
    const h = harness(), card = profile('101');
    h.evaluate(card.root); h.drain();
    card.root.ShowRankBarebonesRefresh(); card.root.valid = false;
    assert.strictEqual(h.drain(), 1, 'a destroyed profile stops after its already queued callback');
  }],
  ['profile.lost-witness-clears-visible-rank', () => {
    for (const mode of ['startup', 'hover']) {
      const h = harness(), card = profile('101');
      h.evaluate(card.root);
      if (mode === 'hover') h.drain();
      card.witness.valid = false;
      if (mode === 'hover') card.root.ShowRankBarebonesRefresh();
      h.drain();
      assert.strictEqual(card.image.visible, false, `${mode}: loss of the Direct witness cannot preserve the old rank`);
      assert.strictEqual(card.image.images.at(-1), '', `${mode}: loss of the Direct witness clears the old URL`);
    }
  }],
  ['topbar.lost-hero-label-clears-visible-rank', () => {
    const h = harness(), card = profile('101'), menu = escapeMenu(), bar = topbar('haze'), player = row('haze');
    h.evaluate(card.root); h.evaluate(bar.root); h.evaluate(player.root);
    h.on(player.mainContents, () => setProfileAccount(card, '201'));
    h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.advance(0.15);
    assert.strictEqual(bar.image.visible, true, 'the fixture has a Direct-verified rank before its startup retry');
    bar.heroLabel.valid = false; h.drain();
    assert.strictEqual(bar.image.visible, false, 'a destroyed hero label cannot preserve the prior hero rank');
    assert.strictEqual(bar.image.images.at(-1), '', 'loss of the hero binding clears the old URL');
  }],
  ['missing.partial-toast-create-cleans-up-panel', () => {
    const h = harness({ createPanel(type, parent, id) {
      if (type === 'Label') throw new Error('native label creation failed');
      return parent.add(new Panel(type, { id }));
    } });
    h.gameClock.text = '0:30';
    const notificationRoot = new Panel('Panel', { id: 'ShowRankBarebonesNotificationRoot' }), player = topbar('Haze', 'PartialToast');
    h.attach(notificationRoot); player.root.AddClass('HealthVisible'); h.evaluate(player.root);
    player.root.RemoveClass('HealthVisible'); h.runDelay(0.5); h.runDelay(0);
    assert.strictEqual(notificationRoot.FindChildTraverse('ShowRankBarebonesMissingToast'), null, 'partial native toast construction leaves no orphan panel');
    h.gameClock.text = '8:00'; h.drain();
  }],
  ['missing.failed-icon-create-preserves-prior-icon', () => {
    let images = 0;
    const h = harness({ createPanel(type, parent, id) {
      if (type === 'Image' && ++images === 2) throw new Error('native image creation failed');
      return parent.add(new Panel(type, { id }));
    } });
    h.gameClock.text = '0:30';
    const notificationRoot = new Panel('Panel', { id: 'ShowRankBarebonesNotificationRoot' });
    h.attach(notificationRoot);
    const players = ['Haze', 'Infernus'].map((hero) => topbar(hero, `FailedIcon-${hero}`));
    players.forEach((player) => { player.root.AddClass('HealthVisible'); h.evaluate(player.root); });
    players.forEach((player) => player.root.RemoveClass('HealthVisible'));
    h.runDelay(0.5); h.runDelay(0);
    const icons = notificationRoot.FindChildrenWithClassTraverse('ShowRankBarebonesMissingToastIcon');
    assert.strictEqual(icons.length, 1, 'failure on the second icon cannot delete the first successfully created icon');
    assert.ok(icons[0].IsValid(), 'the remaining icon is live');
    h.gameClock.text = '8:00'; h.drain();
  }],
  ['missing.unknown-hero-does-not-use-inherited-icon', () => {
    const h = harness();
    h.gameClock.text = '0:30';
    const notificationRoot = new Panel('Panel', { id: 'ShowRankBarebonesNotificationRoot' }), player = topbar('constructor', 'UnknownIcon');
    h.attach(notificationRoot); player.root.AddClass('HealthVisible'); h.evaluate(player.root);
    player.root.RemoveClass('HealthVisible'); h.runDelay(0.5); h.runDelay(0);
    assert.strictEqual(notificationRoot.FindChildrenWithClassTraverse('ShowRankBarebonesMissingToastIcon').length, 0, 'unknown heroes cannot turn Object prototype properties into icon URLs');
    h.gameClock.text = '8:00'; h.drain();
  }],
  ['missing.shared-tick-reads-document-once', () => {
    const h = harness(), roster = playerRoster(STANDARD_HEROES, 'SharedTick');
    h.gameClock.text = '0:30';
    h.attach(roster.friendly); h.attach(roster.enemy);
    roster.bars.forEach((bar) => h.evaluate(bar.root));
    h.advance(1); h.resetWork(); h.runDelay(0.5);
    const work = h.snapshotWork();
    const hideoutReads = work.queries.filter((query) => query.id === 'Hud' && query.method === 'BAscendantHasClass' && query.args[0] === 'connectedToHideout').length;
    captureBaseline('baseline.missing-shared-tick', h);
    assert.strictEqual(hideoutReads, 1, 'one shared tick uses one hideout snapshot for all twelve records');
    h.gameClock.text = '8:00'; h.drain();
  }],
  ['missing.two-chains-for-twelve-players', () => {
    const h = harness();
    missingRoster(h, 'TwoChains');
    h.advance(2);
    assertTwoMissingChains(h, 'twelve players');
    assert.strictEqual(h.pending(), 2, 'twelve players leave only the leader and the watchdog pending');
    h.resetWork(); h.advance(60);
    const minute = h.snapshotWork();
    assert.strictEqual(minute.callbacksByDelay[0.5], 120, 'one minute runs 120 leader callbacks');
    assert.strictEqual(minute.callbacksByDelay[1], 60, 'one minute runs 60 watchdog callbacks');
    assert.strictEqual(minute.callbacks, 180, 'twelve players run 180 callbacks per minute (840 with a backup per record)');
    assertTwoMissingChains(h, 'twelve players after one minute');
    h.gameClock.text = '8:00'; h.drain();
  }],
  ['missing.lone-record-holds-self-watchdog', () => {
    const h = harness(), session = missingRoster(h, 'Lone', 1), only = session.roster.bars[0].root;
    h.advance(2);
    assert.strictEqual(missingState(h).missingLeaderRoot, only, 'the only record leads');
    assert.strictEqual(missingState(h).missingWatchRoot, only, 'the only record is its own watchdog');
    assert.strictEqual(h.pending(), 2, 'a lone record still has one leader chain and one watchdog chain');
    const token = missingState(h).missingLeaderToken;
    h.dropNextDelay(0.5);
    h.advance(2);
    assert.ok(missingState(h).missingLeaderToken > token, 'the self-watchdog replaces a stalled lone leader');
    assert.deepStrictEqual([h.pendingOwners(0.5).length, h.pendingOwners(1).length], [1, 1], 'recovery leaves one leader and one watchdog chain');
    const second = topbar('infernus', 'Lone-second');
    session.roster.enemy.add(second.root);
    session.contexts.set(second.root, h.evaluate(second.root));
    h.advance(2);
    assert.strictEqual(missingState(h).missingLeaderRoot, only, 'a later registration does not move the leader');
    assert.strictEqual(missingState(h).missingWatchRoot, second.root, 'the watchdog moves to the new context once another record exists');
    assertTwoMissingChains(h, 'after the second player registers');
    assert.strictEqual(h.pending(), 2, 'the old self-watchdog chain has ended');
    h.gameClock.text = '8:00'; h.drain();
  }],
  ['missing.leader-context-lost-watchdog-promotes', () => {
    const h = harness(), session = missingRoster(h, 'LeaderLost');
    const notificationRoot = h.documentRoot.add(new Panel('Panel', { id: 'ShowRankBarebonesNotificationRoot' }));
    session.roster.bars.forEach((bar) => bar.root.AddClass('HealthVisible'));
    h.advance(2);
    const lost = missingState(h).missingLeaderRoot, watchdog = missingState(h).missingWatchRoot;
    loseMissingContext(h, session, lost);
    assert.strictEqual(h.pendingOwners(0.5).length, 0, 'the lost context takes the leader chain with it');
    h.advance(1);
    const state = missingState(h);
    assert.notStrictEqual(state.missingLeaderRoot, lost, 'the watchdog promotes a new leader within one watchdog period');
    assert.strictEqual(state.missingLeaderRoot.valid, true, 'the new leader is a live record');
    assert.strictEqual(state.missingWatchRoot, watchdog, 'the surviving watchdog keeps its seat');
    assert.strictEqual(activeMissingRecords(h).length, 11, 'the lost record is pruned');
    assertTwoMissingChains(h, 'after leader failover');
    session.roster.bars.find((bar) => bar.root !== lost && bar.root !== state.missingLeaderRoot).root.RemoveClass('HealthVisible');
    h.advance(1);
    assert.strictEqual(notificationRoot.FindChildrenWithClassTraverse('ShowRankBarebonesMissingToastIcon').length, 1, 'the promoted leader still raises missing indicators');
    h.gameClock.text = '8:00'; h.drain();
  }],
  ['missing.watchdog-context-lost-leader-reelects', () => {
    const h = harness(), session = missingRoster(h, 'WatchLost');
    h.advance(2);
    assertTwoMissingChains(h, 'before the loss');
    const leader = missingState(h).missingLeaderRoot, lost = missingState(h).missingWatchRoot, leaderToken = missingState(h).missingLeaderToken;
    loseMissingContext(h, session, lost);
    assert.strictEqual(h.pendingOwners(1).length, 0, 'the lost context takes the watchdog chain with it');
    h.advance(0.5);
    const state = missingState(h);
    assert.notStrictEqual(state.missingWatchRoot, lost, 'the leader re-elects a watchdog on its next tick');
    assert.strictEqual(state.missingWatchRoot.valid, true, 'the new watchdog is a live record');
    assert.strictEqual(state.missingLeaderRoot, leader, 'the leader chain is untouched');
    assert.strictEqual(state.missingLeaderToken, leaderToken, 'no new leader was launched');
    assertTwoMissingChains(h, 'after watchdog re-election');
    loseMissingContext(h, session, leader);
    h.advance(1);
    assert.notStrictEqual(missingState(h).missingLeaderRoot, leader, 'the re-elected watchdog still replaces a lost leader');
    assertTwoMissingChains(h, 'after the re-elected watchdog promotes');
    h.gameClock.text = '8:00'; h.drain();
  }],
  ['missing.both-chains-lost-recover-on-next-registration', () => {
    const h = harness(), session = missingRoster(h, 'BothLost');
    h.advance(2);
    assertTwoMissingChains(h, 'before the loss');
    const leader = missingState(h).missingLeaderRoot, watchdog = missingState(h).missingWatchRoot;
    loseMissingContext(h, session, leader);
    loseMissingContext(h, session, watchdog);
    h.advance(10);
    assert.strictEqual(h.pending(), 0, 'no surviving context holds a chain, so nothing recovers on its own');
    assert.strictEqual(missingState(h).missingRunning, true, 'the session stays armed with its records');
    const survivor = session.roster.bars.find((bar) => bar.root !== leader && bar.root !== watchdog);
    session.contexts.set(survivor.root, h.evaluate(survivor.root));
    assert.strictEqual(h.pendingOwners(0.5).length, 1, 'the next registration from any surviving context restores the leader in the same call');
    h.advance(2);
    assertTwoMissingChains(h, 'after re-registration');
    assert.strictEqual(activeMissingRecords(h).length, 10, 'both lost records are pruned');
    h.gameClock.text = '8:00'; h.drain();
  }],
  // Live 2026-10-19: across map changes top-bar cards booted new script contexts (same IDs) and registered, yet no
  // chain ran for three matches. A holder whose panel survives while its context is replaced must not count as alive.
  ['missing.holder-context-reload-on-same-panel-restarts-its-chain', () => {
    for (const order of ['leader-first', 'watchdog-first']) {
      const h = harness(), session = missingRoster(h, `Reload-${order}`);
      h.advance(2);
      assertTwoMissingChains(h, `${order}: before the reload`);
      const leader = missingState(h).missingLeaderRoot, watchdog = missingState(h).missingWatchRoot;
      const holders = order === 'leader-first' ? [leader, watchdog] : [watchdog, leader];
      holders.forEach((root) => h.killContext(session.contexts.get(root)));
      holders.forEach((root) => session.contexts.set(root, h.evaluate(root)));
      h.advance(2);
      assertTwoMissingChains(h, `${order}: after both holders reload on their panels`);
      assert.strictEqual(activeMissingRecords(h).length, 12, `${order}: no record is lost or duplicated`);
      h.gameClock.text = '8:00'; h.drain();
    }
  }],
  ['missing.lone-holder-context-reload-restarts-its-chains', () => {
    const h = harness(), session = missingRoster(h, 'ReloadLone', 1);
    h.advance(2);
    const root = missingState(h).missingLeaderRoot;
    h.killContext(session.contexts.get(root));
    session.contexts.set(root, h.evaluate(root));
    h.advance(2);
    assertTwoMissingChains(h, 'a lone record reloading its context');
    h.gameClock.text = '8:00'; h.drain();
  }],
  ['missing.root-replacement-keeps-two-chains', () => {
    for (const role of ['leader', 'watchdog', 'plain']) {
      const h = harness(), session = missingRoster(h, `Replace-${role}`);
      const notificationRoot = h.documentRoot.add(new Panel('Panel', { id: 'ShowRankBarebonesNotificationRoot' }));
      session.roster.bars.forEach((bar) => bar.root.AddClass('HealthVisible'));
      h.advance(2);
      const state = missingState(h);
      const old = role === 'leader' ? state.missingLeaderRoot : role === 'watchdog' ? state.missingWatchRoot : session.roster.bars[3].root;
      const hero = STANDARD_HEROES[session.roster.bars.findIndex((bar) => bar.root === old)];
      old.RemoveClass('HealthVisible');
      h.advance(1);
      assert.deepStrictEqual(missingHeroKeys(notificationRoot), [hero], `${role}: the old panel is missing before replacement`);
      loseMissingContext(h, session, old);
      const replacement = topbar(hero, `Replace-${role}-new`);
      replacement.root.AddClass('HealthVisible');
      session.roster.friendly.add(replacement.root);
      session.contexts.set(replacement.root, h.evaluate(replacement.root));
      h.advance(2);
      const roots = activeMissingRecords(h).map((record) => record.root);
      assert.strictEqual(roots.length, 12, `${role}: replacement keeps twelve records`);
      assert.strictEqual(new Set(roots).size, 12, `${role}: records stay unique by root`);
      assert.ok(!roots.includes(old), `${role}: the replaced root is pruned`);
      assert.ok(roots.includes(replacement.root), `${role}: the replacement is registered`);
      assert.strictEqual(roots.filter((root) => root.FindChildrenWithClassTraverse('HeroName')[0].text === hero).length, 1, `${role}: the hero has one record`);
      assert.deepStrictEqual(missingHeroKeys(notificationRoot), [], `${role}: pruning the old panel clears its missing hero key`);
      assertTwoMissingChains(h, `${role} replacement`);
      replacement.root.RemoveClass('HealthVisible');
      h.advance(1);
      assert.deepStrictEqual(missingHeroKeys(notificationRoot), [hero], `${role}: the replacement raises the indicator exactly once`);
      h.gameClock.text = '8:00'; h.drain();
    }
  }],
  ['missing.expiry-stops-both-chains', () => {
    const h = harness();
    missingRoster(h, 'Expire');
    h.advance(2);
    assertTwoMissingChains(h, 'before expiry');
    h.gameClock.text = '8:00';
    h.advance(0.5);
    assert.strictEqual(missingState(h).missingRunning, false, 'the eight-minute boundary stops the session');
    assert.strictEqual(h.pendingOwners(0.5).length, 0, 'the leader chain ends at expiry');
    h.advance(1);
    assert.strictEqual(h.pending(), 0, 'the watchdog chain ends with it');
    assert.strictEqual(missingState(h).missingRecords.length, 0, 'expiry releases the records');
  }],
  // Live 2026-10-19: a session registered in the hideout spent its 1800-check budget there and stopped at match clock 2:00.
  ['missing.hideout-time-does-not-spend-the-match-budget', () => {
    const h = harness({ hideout: true });
    missingRoster(h, 'HideoutBudget');
    h.gameClock.text = '';
    h.advance(1000);
    assert.strictEqual(missingState(h).missingRunning, true, 'a long hideout stay keeps the session for the next match');
    assertTwoMissingChains(h, 'after a long hideout stay');
    h.documentRoot.classes.delete('connectedToHideout');
    h.gameClock.text = '0:00';
    h.advance(470);
    assert.strictEqual(missingState(h).missingRunning, true, 'the match still gets its full eight-minute window');
    assertTwoMissingChains(h, 'late in the match window');
    h.gameClock.text = '8:00';
    h.advance(1);
    assert.strictEqual(missingState(h).missingRunning, false, 'the clock still ends the window');
    h.advance(1);
    assert.strictEqual(h.pending(), 0, 'no chain survives the window');
  }],
  ['missing.unreadable-clock-outside-hideout-still-spends-the-budget', () => {
    const h = harness({ hideout: true });
    missingRoster(h, 'HideoutThenBlank');
    h.gameClock.text = '';
    h.advance(600);
    h.documentRoot.classes.delete('connectedToHideout');
    h.advance(897);
    assert.strictEqual(missingState(h).missingRunning, true, 'the budget counts only ticks outside the hideout');
    h.advance(5);
    assert.strictEqual(missingState(h).missingRunning, false, 'a never-readable match clock still stops after 1800 ticks');
    h.advance(1);
    assert.strictEqual(h.pending(), 0, 'no chain survives budget exhaustion');
  }],
  ['missing.health-transitions-follow-a-visible-sample', () => {
    const h = harness(), notificationRoot = h.documentRoot.add(new Panel('Panel', { id: 'ShowRankBarebonesNotificationRoot' }));
    h.gameClock.text = '0:30';
    const player = topbar('Haze', 'HealthSequence');
    h.attach(player.root);
    h.evaluate(player.root);
    const tick = () => { h.runDelay(0.5); return missingHeroKeys(notificationRoot); };
    assert.deepStrictEqual(tick(), [], 'a player never seen visible is not missing');
    player.root.AddClass('HealthVisible');
    assert.deepStrictEqual(tick(), [], 'a visible player is not missing');
    player.root.RemoveClass('HealthVisible');
    assert.deepStrictEqual(tick(), ['haze'], 'visible to hidden is missing');
    player.root.AddClass('HealthVisible');
    assert.deepStrictEqual(tick(), [], 'visible again clears the missing state');
    player.root.RemoveClass('HealthVisible'); player.root.AddClass('Dead');
    assert.deepStrictEqual(tick(), [], 'a dead player is not missing');
    player.root.RemoveClass('Dead');
    assert.deepStrictEqual(tick(), ['haze'], 'a player who stays hidden after dying counts as missing once alive');
    player.root.AddClass('Disconnected');
    assert.deepStrictEqual(tick(), [], 'a disconnected player is not missing');
    player.root.RemoveClass('Disconnected');
    assert.deepStrictEqual(tick(), [], 'a reconnect alone does not re-raise a missing state that was already reported');
    player.root.AddClass('HealthVisible');
    assert.deepStrictEqual(tick(), [], 'a visible sample re-arms the player');
    player.root.RemoveClass('HealthVisible');
    assert.deepStrictEqual(tick(), ['haze'], 'visible to hidden after re-arming is missing');
    assert.deepStrictEqual(tick(), ['haze'], 'a player who stays hidden stays missing without re-triggering');
    h.evaluate(player.root);
    assert.deepStrictEqual(missingHeroKeys(notificationRoot), [], 're-registration clears the missing state');
    assert.deepStrictEqual(tick(), [], 'after re-registration the player must be seen visible again first');
    player.root.AddClass('HealthVisible');
    assert.deepStrictEqual(tick(), [], 'a visible sample after re-registration re-arms the player');
    player.root.RemoveClass('HealthVisible');
    assert.deepStrictEqual(tick(), ['haze'], 'visible to hidden after re-registration is missing');
    h.gameClock.text = '8:00'; h.drain();
  }],
  ['scoreboard.name-opens-clicked-row-profile', () => {
    const h = harness(), board = scoreboard();
    const first = board.addRow('1001'), bot = board.addRow('0'), garbage = board.addRow('12x');
    const dollar = h.evaluate(board.root);
    assert.strictEqual(typeof board.root.ShowRankBarebonesScoreboardBind, 'function', 'scoreboard exports its guarded bind handler');
    assert.strictEqual(h.pending(), 0, 'scoreboard load schedules nothing');
    board.root.ShowRankBarebonesScoreboardBind();
    assert.strictEqual(h.pending(), 0, 'binding schedules nothing');
    assert.ok(first.classes.has('ShowRankBarebonesScoreboardLink'), 'a real account gets the link affordance');
    assert.ok(!bot.classes.has('ShowRankBarebonesScoreboardLink') && !garbage.classes.has('ShowRankBarebonesScoreboardLink'), 'bots and invalid ids get no affordance');
    first.panelEvents.onactivate();
    assert.deepStrictEqual(h.openedProfiles, [1001], 'click opens the clicked row account');
    first.accountid = '2002';
    first.panelEvents.onactivate();
    assert.deepStrictEqual(h.openedProfiles, [1001, 2002], 'account is read at click time, not bind time');
    bot.panelEvents.onactivate(); garbage.panelEvents.onactivate();
    assert.deepStrictEqual(h.openedProfiles, [1001, 2002], 'bots and invalid ids never navigate');
    const late = board.addRow('3003');
    assert.strictEqual(late.panelEvents.onactivate, undefined, 'a row created later is not bound yet');
    board.root.ShowRankBarebonesScoreboardBind();
    late.panelEvents.onactivate();
    assert.deepStrictEqual(h.openedProfiles, [1001, 2002, 3003], 'the next hover binds late rows');
    first.valid = false;
    assert.doesNotThrow(() => first.panelEvents.onactivate(), 'a destroyed name panel is ignored');
    assert.deepStrictEqual(h.openedProfiles, [1001, 2002, 3003], 'a destroyed name panel never navigates');
    assert.doesNotThrow(() => board.root.ShowRankBarebonesScoreboardBind(), 'binding skips destroyed panels');
    assert.ok(dollar);
  }],
  ['scoreboard.attribute-fallback-rejects-conflict', () => {
    const h = harness(), board = scoreboard();
    const attributeOnly = board.addRow(undefined, { attribute: '4004' });
    const conflict = board.addRow('5005', { attribute: '6006' });
    h.evaluate(board.root);
    board.root.ShowRankBarebonesScoreboardBind();
    attributeOnly.panelEvents.onactivate();
    conflict.panelEvents.onactivate();
    assert.deepStrictEqual(h.openedProfiles, [4004], 'attribute is a fallback; conflicting evidence never navigates');
    assert.ok(!conflict.classes.has('ShowRankBarebonesScoreboardLink'), 'conflicting evidence gets no affordance');
  }],
];
const escapeReads = (work) => ({
  hideout: work.queries.filter((q) => q.id === 'Hud' && q.method === 'BAscendantHasClass' && q.args[0] === 'connectedToHideout').length,
  menu: work.queries.filter((q) => q.id === 'Hud' && q.method === 'BHasClass' && q.args[0] === 'ShowEscapeMenu').length,
  total: Object.values(work.boundary).reduce((a, b) => a + b, 0),
});
// Escape hideout fact is read once per Escape turn, never per check; the menu-open fact is still read live.
{
  const h = harness(); const card = profile('101'), menu = escapeMenu(), roster = playerRoster(STANDARD_HEROES, 'Memo');
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(301 + index));
  const menuDollar = h.evaluate(menu.root); h.drain(); h.resetWork();
  menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  const work = h.snapshotWork(); const reads = escapeReads(work);
  console.log('escape 12-player reads', JSON.stringify(reads), 'callbacks', work.callbacks);
  assert.ok(reads.hideout <= work.callbacks + 1, 'at most one hideout read per Escape callback plus the entry call');
  assert.ok(reads.menu > work.callbacks, 'menu-open stays unmemoized');
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.completedRoster.length, 12);
}
// The memo does not leak across turns: hideout appearing between two Escape callbacks stops the pass.
{
  const h = harness(); const card = profile('101'), menu = escapeMenu(), roster = playerRoster(STANDARD_HEROES, 'Leak');
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(401 + index));
  const menuDollar = h.evaluate(menu.root); h.drain();
  menuDollar.ShowRankBarebonesEscapeOpen();
  h.runNext();
  h.documentRoot.AddClass('connectedToHideout');
  const before = h.events.filter((panel) => panel.id === 'MainContents').length;
  h.runNext(); h.drain();
  assert.strictEqual(h.events.filter((panel) => panel.id === 'MainContents').length, before, 'next callback after hideout stops probing');
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.escape, null, 'hideout releases the Escape session');
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.completedRoster || null, null);
}
const regressionFailures = [];
for (const [name, scenario] of regressions.filter(([name]) => !(NO_MISSING && name.startsWith('missing.')))) {
  try { scenario(); } catch (error) { regressionFailures.push(`${name}: ${error.message.split('\n')[0]}`); }
}
assert.deepStrictEqual(regressionFailures, [], 'runtime regression scenarios');


// The boundary counters see only script-made calls; mock-internal traversal recursion lands in visits.
{
  const h = harness(); const root = new Panel('Panel', { id: 'BoundaryRoot' });
  const middle = root.add(new Panel('Panel', { id: 'BoundaryMiddle', classes: ['BoundaryMark'] }));
  const leaf = middle.add(new Panel('Panel', { id: 'BoundaryLeaf', classes: ['BoundaryMark'] }));
  h.attach(root); h.resetWork();
  assert.deepStrictEqual(root.FindChildrenWithClassTraverse('BoundaryMark'), [middle, leaf]);
  let work = h.snapshotWork();
  assert.strictEqual(work.boundary.FindChildrenWithClassTraverse, 1, 'one script class traversal is one boundary call');
  assert.ok(work.visits.FindChildrenWithClassTraverse > 0, 'descendant recursion is counted as visits');
  assert.strictEqual(work.panelCalls.FindChildrenWithClassTraverse, 1 + work.visits.FindChildrenWithClassTraverse, 'panelCalls keeps counting every visit');
  h.resetWork();
  assert.strictEqual(root.FindChildTraverse('BoundaryLeaf'), leaf);
  work = h.snapshotWork();
  assert.strictEqual(work.boundary.FindChildTraverse, 1, 'one script id traversal is one boundary call');
  assert.ok(work.visits.FindChildTraverse > 0, 'descendant recursion is counted as visits');
  assert.strictEqual(work.panelCalls.FindChildTraverse, 1 + work.visits.FindChildTraverse, 'panelCalls keeps counting every visit');
}

// Boundary counters cover class, text, style and visibility writes without touching panelCalls or queries.
{
  const h = harness(); const panel = new Panel('Label', { id: 'BoundaryWrites' });
  h.attach(panel); h.resetWork();
  panel.AddClass('BoundaryClass');
  let work = h.snapshotWork();
  assert.strictEqual(work.boundary.AddClass, 1, 'one AddClass is one boundary call');
  h.resetWork();
  panel.text = 'written';
  work = h.snapshotWork();
  assert.strictEqual(work.boundary.textWrite, 1, 'one text assignment is one textWrite');
  assert.deepStrictEqual({ calls: work.panelCalls.text, queries: work.queries }, { calls: {}, queries: [] }, 'text writes add nothing to panelCalls or queries');
  h.resetWork();
  panel.style.visibility = 'collapse';
  work = h.snapshotWork();
  assert.strictEqual(work.boundary.styleWrite, 1, 'one style assignment is one styleWrite');
  assert.strictEqual(panel.style.visibility, 'collapse', 'the written style value reads back');
  h.resetWork();
  panel.visible = false;
  assert.strictEqual(h.snapshotWork().boundary.visibleWrite, 1, 'one visible assignment is one visibleWrite');
  assert.strictEqual(panel.visible, false, 'the written visibility reads back');
}

// Characterize script-boundary work for repeated hover, idle chart polling, cached Escape reopen and the missing-player tick.
{
  const h = harness(), board = scoreboard();
  for (let i = 0; i < 12; i += 1) board.addRow(String(1001 + i));
  h.evaluate(board.root); h.resetWork();
  for (let i = 0; i < 10; i += 1) board.root.ShowRankBarebonesScoreboardBind();
  captureBaseline('baseline.scoreboard-hover-x10', h);
  assert.strictEqual(h.snapshotWork().boundary.SetPanelEvent, 120, 'ten hovers over twelve rows rebind every name each time');
}
{
  const r = rankHistoryPage({ asyncState: 'AsyncLoadingState' });
  r.h.resetWork(); r.h.advance(60);
  captureBaseline('baseline.chart-loading-60s', r.h);
}
{
  const h = harness(); const card = profile('101'), menu = escapeMenu(), roster = playerRoster(STANDARD_HEROES, 'HoverCached');
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(301 + index));
  const menuDollar = h.evaluate(menu.root); h.drain();
  menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  h.resetWork();
  for (let i = 0; i < 10; i += 1) menuDollar.ShowRankBarebonesEscapeOpen();
  h.drain();
  captureBaseline('baseline.escape-hover-x10-cached', h);
  assert.strictEqual(h.snapshotWork().boundary.SetImage || 0, 0, 'cached Escape reopen makes no SetImage boundary calls');
}
{
  const h = harness(), roster = playerRoster(STANDARD_HEROES, 'Missing60s');
  h.gameClock.text = '0:30';
  h.attach(roster.friendly); h.attach(roster.enemy);
  roster.bars.forEach((bar) => h.evaluate(bar.root));
  h.resetWork(); h.advance(60);
  captureBaseline('baseline.missing-12-player-60s', h);
  const minute = h.snapshotWork();
  if (NO_MISSING) {
    assert.strictEqual(minute.callbacksByDelay[0.5] || 0, 0, 'no-missing: no leader chain runs');
    assert.strictEqual(minute.callbacks, 24, 'no-missing: the first minute runs only the two startup rank refreshes per player');
    assert.strictEqual(roster.bars.filter((bar) => bar.root.BHasClass('ShowRankBarebonesMissingWindowExpired')).length, 0, 'no-missing: no missing-window class is written');
    assert.strictEqual((h.documentRoot.__showrank_barebones_state_v1 || {}).missingRecords, undefined, 'no-missing: no missing records exist');
  } else {
    assert.strictEqual(minute.callbacksByDelay[0.5], 120, 'twelve players run 120 leader callbacks in the first minute');
    assert.strictEqual(minute.callbacksByDelay[1], 60 + 12 + 1, 'one watchdog (60), twelve startup rank refreshes and the lone self-watchdog handed off at the second registration');
    assert.strictEqual(minute.callbacks, 205, 'the first minute runs 205 callbacks (864 with one backup chain per record)');
  }
  h.gameClock.text = '8:00'; h.drain();
}

console.log('showrank barebones runtime tests passed');
