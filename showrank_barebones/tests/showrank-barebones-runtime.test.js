'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'panorama', 'scripts', 'showrank_barebones.js'), 'utf8');
const rankUrl = (account) => `https://api.deadlock-api.com/v1/players/${account}/rank-predict/image?format=webp`;
const statlockerUrl = (account) => `https://statlocker.gg/profile/${account}/matches`;
const averageUrl = (accounts) => `https://api.deadlock-api.com/v1/players/rank-predict/image?account_ids=${accounts.join(',')}&format=webp`;

class Panel {
  constructor(type, options = {}) { Object.assign(this, { paneltype: type, id: options.id || '', text: options.text === undefined ? '' : String(options.text), attributes: { ...options.attributes }, classes: new Set(options.classes || []), visible: options.visible === undefined ? true : options.visible, valid: options.valid === undefined ? true : options.valid, children: [], parent: null, images: [], panelEvents: Object.create(null) }); }
  add(child) { child.parent = this; this.children.push(child); return child; }
  IsValid() { return this.valid; }
  GetParent() { return this.parent; }
  BHasClass(className) { return this.classes.has(className); }
  GetAttributeString(name, fallback) { if (!this.valid) throw new Error(`invalid panel ${this.id}`); return this.attributes[name] === undefined ? fallback : String(this.attributes[name]); }
  FindChildTraverse(id) { if (!this.valid) throw new Error(`invalid panel ${this.id}`); for (const child of this.children) { if (child.id === id) return child; const nested = child.FindChildTraverse(id); if (nested) return nested; } return null; }
  FindChildrenWithClassTraverse(className) { const found = []; for (const child of this.children) { if (child.classes.has(className)) found.push(child); found.push(...child.FindChildrenWithClassTraverse(className)); } return found; }
  SetPanelEvent(name, callback) { this.panelEvents[name] = callback; }
  SetImage(url) { if (!this.valid) throw new Error(`invalid image ${this.id}`); this.images.push(url); }
}

function profile(account, options = {}) {
  const root = new Panel('CitadelProfileCard', { id: options.id || 'ProfileCard', classes: ['ShowRankBarebonesProfileCard'], valid: options.valid, attributes: { ...(options.accountid === undefined ? { accountid: account } : { accountid: options.accountid }), ...(options.steamid === undefined ? {} : { steamid: options.steamid }) } });
  const contents = root.add(new Panel('Panel', { id: 'ContentsMain' }));
  const witness = contents.add(new Panel('Label', { id: 'ShowRankBarebonesAccount', text: options.witness === undefined ? account : options.witness }));
  const image = root.add(new Panel('Panel', { id: 'CardOverlay' })).add(new Panel('Image', { id: 'ShowRankBarebonesRankImage', valid: options.imageValid, visible: options.imageVisible }));
  return { root, witness, image };
}
function setProfileAccount(card, account) { card.witness.text = account; card.root.attributes.accountid = account; delete card.root.attributes.steamid; }
function topbar(hero, id = `Topbar-${hero}`) { const root = new Panel('CitadelHudTopBarPlayer', { id, classes: ['ShowRankBarebonesTopbarPlayer'] }); const heroLabel = root.add(new Panel('Label', { text: hero, classes: ['HeroName'] })); const image = root.add(new Panel('Panel', { id: 'HeroContents' })).add(new Panel('Image', { id: 'ShowRankBarebonesTopbarRankImage', visible: false })); return { root, heroLabel, image }; }
function row(hero, options = {}) { const root = new Panel('CitadelPlayersListEntry', { id: options.id || `Row-${hero}`, classes: ['ShowRankBarebonesPlayerRow'] }); const mainContents = root.add(new Panel('Panel', { id: 'MainContents', valid: options.mainValid })); const heroLabel = mainContents.add(new Panel('Label', { id: 'ShowRankBarebonesRowHero', text: hero })); const image = mainContents.add(new Panel('Image', { id: 'ShowRankBarebonesPlayerListRankImage', visible: false })); return { root, mainContents, heroLabel, image }; }
function escape() { const root = new Panel('CitadelHudEscapeMenu', { id: 'Escape' }); return { root, playersTab: root.add(new Panel('TabButton', { id: 'PlayersTab' })) }; }
function addContextRow(parent, id, text) { const rowPanel = parent.add(new Panel('Panel', { id, classes: ['MenuRow'] })); return rowPanel.add(new Panel('TextButton', { id: 'MenuButton', text })); }
function contextMenu(card) { const root = new Panel('CitadelContextMenuPlayer', { id: 'PersonalContextMenu', classes: ['ShowRankBarebonesContextMenu'] }); root.add(card.root); const options = root.add(new Panel('Panel', { id: 'MenuOptionsPanel' })); const statlockerButton = addContextRow(options, 'ShowRankBarebonesStatlockerRow', 'Statlocker Profile'); const copyButton = addContextRow(options, 'ShowRankBarebonesCopyAccountRow', 'Copy Account ID'); return { root, statlockerButton, copyButton }; }
const STANDARD_HEROES = ['haze', 'infernus', 'vindicta', 'abrams', 'bebop', 'dynamo', 'kelvin', 'lash', 'mcginnis', 'mo_and_krill', 'paradox', 'pocket'];
function playerRoster(heroes, prefix = '') { const friendly = new Panel('CitadelHudTopBarTeam', { id: 'TeamFriendly' }); const enemy = new Panel('CitadelHudTopBarTeam', { id: 'TeamEnemy' }); const bars = heroes.map((hero, index) => { const bar = topbar(hero, `${prefix}Bar-${index}`); (index < heroes.length / 2 ? friendly : enemy).add(bar.root); return bar; }); return { bars, rows: heroes.map((hero, index) => row(hero, { id: `${prefix}Row-${index}` })), friendly, enemy }; }
function wirePlayerRoster(h, card, roster, accountForIndex) { h.attach(roster.friendly); h.attach(roster.enemy); roster.bars.forEach((bar) => h.evaluate(bar.root)); roster.rows.forEach((player, index) => { h.evaluate(player.root); h.on(player.mainContents, () => setProfileAccount(card, accountForIndex(index))); }); }

function harness(options = {}) {
  const documentRoot = new Panel('CitadelHud', { id: 'Hud', classes: ['ShowEscapeMenu'] });
  const averageFriendly = documentRoot.add(new Panel('Image', { id: 'ShowRankBarebonesAverageFriendlyImage', visible: false }));
  const averageEnemy = documentRoot.add(new Panel('Image', { id: 'ShowRankBarebonesAverageEnemyImage', visible: false }));
  const scheduled = [], events = [], handlers = new Map(), dollars = [], openedUrls = [], copiedAccounts = [], closedContexts = [];
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
    if (event === 'DismissAllContextMenus' || event === 'DropInputFocus') {
      assert.strictEqual(first, undefined, `${event} has no fabricated payload`);
      assert.strictEqual(second, undefined, `${event} has no fabricated payload`);
      closedContexts.push(event);
      return;
    }
    assert.strictEqual(event, 'Activated', 'the runtime may dispatch only clipboard, cleanup, or panel activation events');
    assert.ok(first instanceof Panel, 'activation targets a local panel');
    if (first.id === 'MainContents') assert.strictEqual(second, 'mouse', 'player profile cards require mouse activation');
    else assert.strictEqual(second, undefined, 'Players-tab activation has no fabricated input');
    events.push(first);
    const handler = handlers.get(first);
    if (handler) handler();
  }
  return {
    documentRoot, averageFriendly, averageEnemy, events, dollars, openedUrls, copiedAccounts, closedContexts,
    attach(panel) { if (!panel.parent) documentRoot.add(panel); },
    evaluate(panel, evaluateOptions = {}) { if (evaluateOptions.attach !== false && !panel.parent) documentRoot.add(panel); const dollar = { GetContextPanel: () => panel, Schedule: (delay, callback) => { scheduled.push({ delay, callback }); return scheduled.length; }, DispatchEvent: dispatch }; dollars.push(dollar); vm.runInNewContext(source, { $: dollar, GameUI: new Proxy({}, { get() { throw new Error('global HUD traversal'); } }), Players: new Proxy({}, { get() { throw new Error('player API access'); } }), Entities: new Proxy({}, { get() { throw new Error('entity API access'); } }) }, { filename: 'showrank_barebones.js' }); return dollar; },
    on(panel, callback) { handlers.set(panel, callback); },
    drain(limit = 400) { let count = 0; while (scheduled.length) { assert.ok(count < limit, 'all scheduled behavior completes within a fixed bound'); scheduled.shift().callback(); count += 1; } return count; },
    pending() { return scheduled.length; },
  };
}
function assertCleared(image, description) { assert.strictEqual(image.visible, false, `${description}: hidden`); assert.deepStrictEqual(image.images, [''], `${description}: stale URL cleared`); }

// Preserve independent profile-card witness and reuse cases.
{
  const h = harness(); const card = profile('123456', { steamid: '76561197960389184' }); h.evaluate(card.root);
  assert.deepStrictEqual(card.image.images, [rankUrl('123456')], 'matching direct and Steam64 witnesses render the exact URL'); assert.strictEqual(card.image.visible, true); assert.strictEqual(h.drain(), 2, 'startup watch is finite');
}
{
  const h = harness(); const card = profile('', { accountid: undefined, witness: '', imageVisible: true }); h.evaluate(card.root); assertCleared(card.image, 'unbound profile'); setProfileAccount(card, '123456'); h.drain(); assert.deepStrictEqual(card.image.images, ['', rankUrl('123456')], 'delayed profile evidence binds on retry');
}
for (const [label, options] of [
  ['hidden mismatch', { witness: '123457', accountid: '123456', steamid: '76561197960389184' }],
  ['account mismatch', { witness: '123456', accountid: '123457', steamid: '76561197960389184' }],
  ['Steam64 mismatch', { witness: '123456', accountid: '123456', steamid: '76561197960389185' }],
]) { const h = harness(); const card = profile('123456', { ...options, imageVisible: true }); h.evaluate(card.root); assertCleared(card.image, label); }
for (const invalid of ['', '0', '-1', '1.5', '1e3', ' 123456', '123456 ', '123456x', '4294967296', '9007199254740993', 'Infinity', 'NaN']) { const h = harness(); const card = profile(invalid, { witness: invalid, accountid: invalid, imageVisible: true }); h.evaluate(card.root); assertCleared(card.image, `invalid ${JSON.stringify(invalid)}`); }
{
  const h = harness(); const card = profile('123456'); h.evaluate(card.root); card.root.attributes.accountid = '123457'; h.drain(); assert.deepStrictEqual(card.image.images, [rankUrl('123456'), ''], 'conflicting reused-card evidence clears the old rank');
}
{
  const h = harness(); const card = profile('123456'); h.evaluate(card.root); h.drain();
  for (let index = 0; index < 10; index += 1) card.root.ShowRankBarebonesRefresh();
  assert.strictEqual(h.pending(), 10, 'rapid profile refreshes retain only one pending callback per superseded generation');
  assert.ok(h.drain() <= 16, 'only the latest profile refresh generation expands through the full retry chain');
}


{
  const h = harness(); const card = profile('123456'), menu = contextMenu(card); const menuDollar = h.evaluate(menu.root); h.evaluate(card.root);
  assert.strictEqual(menuDollar.ShowRankBarebonesOpenStatlocker, undefined, 'context actions do not depend on context-local globals');
  assert.strictEqual(typeof card.root.ShowRankBarebonesOpenStatlocker, 'function', 'profile startup installs its local StatLocker action');
  assert.strictEqual(typeof card.root.ShowRankBarebonesCopyAccount, 'function', 'profile startup installs its local account-copy action');
  card.root.ShowRankBarebonesOpenStatlocker();
  card.root.ShowRankBarebonesCopyAccount();
  assert.deepStrictEqual(
    { openedUrls: h.openedUrls, copiedAccounts: h.copiedAccounts },
    {
      openedUrls: [{ method: 'ExternalBrowserGoToURL', url: statlockerUrl('123456') }],
      copiedAccounts: ['123456'],
    },
    'both profile-local context actions reach their Panorama engine events',
  );
}
{
  const h = harness(); const card = profile(''), menu = contextMenu(card); h.evaluate(menu.root); h.evaluate(card.root);
  card.root.ShowRankBarebonesOpenStatlocker();
  card.root.ShowRankBarebonesCopyAccount();
  assert.deepStrictEqual({ openedUrls: h.openedUrls, copiedAccounts: h.copiedAccounts }, { openedUrls: [], copiedAccounts: [] }, 'blank click-time evidence fails closed');
  setProfileAccount(card, '234567');
  card.root.ShowRankBarebonesOpenStatlocker();
  card.root.ShowRankBarebonesCopyAccount();
  assert.deepStrictEqual(h.openedUrls, [{ method: 'ExternalBrowserGoToURL', url: statlockerUrl('234567') }], 'StatLocker resolves newly bound evidence at click time');
  assert.deepStrictEqual(h.copiedAccounts, ['234567'], 'Copy Account ID resolves newly bound evidence at click time');
}
{
  const h = harness({ externalBrowserEvent: false }); const card = profile('123456'), menu = contextMenu(card); h.evaluate(menu.root); h.evaluate(card.root);
  assert.doesNotThrow(() => card.root.ShowRankBarebonesOpenStatlocker(), 'an unavailable native browser event is contained');
  assert.deepStrictEqual(h.openedUrls, [], 'StatLocker has no unrelated browser fallback');
}
{
  const h = harness(); const card = profile('123456', { witness: '654321' }), menu = contextMenu(card); h.evaluate(menu.root); h.evaluate(card.root);
  card.root.ShowRankBarebonesOpenStatlocker();
  card.root.ShowRankBarebonesCopyAccount();
  assert.deepStrictEqual(h.openedUrls, []);
  assert.deepStrictEqual(h.copiedAccounts, [], 'conflicting account evidence blocks both context actions');
}

{
  const h = harness(); const invalidRoot = profile('123456', { valid: false, imageVisible: true }); h.evaluate(invalidRoot.root);
  assert.doesNotThrow(() => h.drain(), 'invalidated profile roots are ignored during their finite retries');
  const card = profile('123456'); h.evaluate(card.root); card.image.valid = false;
  assert.doesNotThrow(() => h.drain(), 'invalidated profile images are ignored during their finite retries');
}

// A completed match pass stays cached across Escape reopenings; hideout clears it for the next match.
{
  const h = harness(); const card = profile('101'), menu = escape(), roster = playerRoster(STANDARD_HEROES.slice(0, 6), 'Cache'); let accountBase = 200;
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(accountBase + index + 1));
  const menuDollar = h.evaluate(menu.root); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.deepStrictEqual(roster.bars[0].image.images, [rankUrl('201')], 'fresh topbar targets skip redundant blank image writes');
  assert.deepStrictEqual(roster.rows[0].image.images.filter(Boolean), [rankUrl('201')], 'verified accounts render on their Players-list rows');
  assert.deepStrictEqual(h.closedContexts, ['DismissAllContextMenus', 'DropInputFocus'], 'one delayed native cleanup closes the cards and releases their input focus');
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.escape, null, 'terminal completion releases the transient Escape session');
  const firstRowActivations = h.events.filter((panel) => panel.id === 'MainContents').length;
  h.documentRoot.classes.delete('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOut(); h.drain();
  h.documentRoot.classes.add('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(h.events.filter((panel) => panel.id === 'MainContents').length, firstRowActivations, 'Escape reopen in the same match cannot restart a completed six-player cache');
  assert.strictEqual(roster.bars[0].image.images.at(-1), rankUrl('201'), 'same-match Escape reopen retains the completed topbar');

  h.documentRoot.classes.delete('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOut(); h.drain();
  h.documentRoot.classes.add('connectedToHideout'); const hideoutBar = topbar('', 'HideoutBar'); h.evaluate(hideoutBar.root); h.drain();
  const resetState = h.documentRoot.__showrank_barebones_state_v1;
  assert.deepStrictEqual(
    [
      resetState.profiles ? resetState.profiles.length : 0,
      resetState.topbars.length,
      resetState.rows ? resetState.rows.length : 0,
      resetState.escape,
    ],
    [0, 0, 0, null],
    'hideout resets transient panel caches and the completed probe session',
  );
  assert.strictEqual(roster.bars[0].image.visible, false, 'hideout reset hides the stale topbar rank');
  assert.strictEqual(roster.bars[0].image.images.at(-1), '', 'hideout reset releases the stale topbar image URL');
  hideoutBar.root.classes.delete('ShowRankBarebonesTopbarPlayer');
  h.documentRoot.classes.delete('connectedToHideout'); accountBase = 300;
  h.documentRoot.classes.add('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(h.events.filter((panel) => panel.id === 'MainContents').length, firstRowActivations + 6, 'hideout clears the completed cache for the next six-player match');
  assert.strictEqual(roster.bars[0].image.images.at(-1), rankUrl('301'), 'the next match rebuilds the topbar from fresh profile evidence');
  assert.strictEqual(roster.rows[0].image.images.at(-1), rankUrl('301'), 'the next match refreshes the reused Players-list row rank');
}

// Recreated topbar slots invalidate a completed cache even if the brief hideout class was missed.
{
  const h = harness(); const card = profile('101'), menu = escape(), firstRoster = playerRoster(STANDARD_HEROES.slice(0, 6), 'First');
  h.evaluate(card.root); wirePlayerRoster(h, card, firstRoster, (index) => String(201 + index));
  const menuDollar = h.evaluate(menu.root); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  h.documentRoot.classes.delete('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOut(); h.drain();

  firstRoster.bars.forEach((bar) => bar.root.classes.delete('ShowRankBarebonesTopbarPlayer'));
  firstRoster.rows.forEach((player) => player.root.classes.delete('ShowRankBarebonesPlayerRow'));
  const secondRoster = playerRoster(STANDARD_HEROES.slice(0, 6), 'Second');
  wirePlayerRoster(h, card, secondRoster, (index) => String(301 + index));
  h.documentRoot.classes.add('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(secondRoster.bars[0].image.images.at(-1), rankUrl('301'), 'a recreated second-match topbar starts one fresh six-player probe pass');
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
  const menuDollar = h.evaluate(menu.root); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.probeCompleted, true, 'twelve-player standard mode stores a completed cache');
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.completedTopbars.length, 12);
  assert.deepStrictEqual(h.averageFriendly.images.filter(Boolean), [averageUrl(['301', '302', '303', '304', '305', '306'])], 'friendly average uses six ancestry-proven accounts');
  assert.deepStrictEqual(h.averageEnemy.images.filter(Boolean), [averageUrl(['307', '308', '309', '310', '311', '312'])], 'enemy average uses six ancestry-proven accounts');
  h.documentRoot.classes.delete('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOut(); h.drain();
  h.documentRoot.classes.add('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(h.averageFriendly.images.filter(Boolean).length, 1, 'cache hits do not reload unchanged average images');
}
{
  const h = harness(); const card = profile('101'), menu = escape(), roster = playerRoster(STANDARD_HEROES.slice(0, 7), 'Unsupported');
  h.evaluate(card.root); wirePlayerRoster(h, card, roster, (index) => String(401 + index));
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(h.documentRoot.__showrank_barebones_state_v1.probeCompleted, false, 'an unsupported seven-slot snapshot is rendered but never cached as complete');
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
  assert.deepStrictEqual(h.closedContexts, ['DismissAllContextMenus', 'DropInputFocus'], 'an exhausted partial pass also performs one delayed native cleanup');
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
  const h = harness(); const card = profile('101'), first = topbar('haze', 'FirstHaze'), duplicate = topbar('HAZE', 'SecondHaze'), menu = escape(), player = row('haze'); h.evaluate(card.root); h.evaluate(first.root); h.evaluate(duplicate.root); h.evaluate(player.root); h.on(player.mainContents, () => setProfileAccount(card, '201')); h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain(); assert.deepStrictEqual(first.image.images.filter(Boolean), [], 'duplicate topbar hero does not render'); assert.deepStrictEqual(duplicate.image.images.filter(Boolean), [], 'both duplicate topbars fail closed');
}
{
  const h = harness(); const card = profile('101'), bar = topbar('haze'), menu = escape(), first = row('haze', { id: 'FirstRow' }), duplicate = row('HAZE', { id: 'SecondRow' }); h.evaluate(card.root); h.evaluate(bar.root); h.evaluate(first.root); h.evaluate(duplicate.root); h.on(first.mainContents, () => setProfileAccount(card, '201')); h.on(duplicate.mainContents, () => setProfileAccount(card, '202')); h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain(); assert.deepStrictEqual(bar.image.images.filter(Boolean), [], 'duplicate rows do not select by ordering');
}
{
  const h = harness(); const original = profile('101'), bar = topbar('haze'), menu = escape(), player = row('haze'); h.evaluate(original.root); h.evaluate(bar.root); h.evaluate(player.root); h.on(player.mainContents, () => { h.evaluate(profile('201', { id: 'ProfileA' }).root); h.evaluate(profile('202', { id: 'ProfileB' }).root); }); h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain(); assert.deepStrictEqual(bar.image.images.filter(Boolean), [], 'multiple changed/new profile witnesses fail closed');
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

{
  const h = harness(); const bar = topbar('haze'), menu = escape(); h.evaluate(bar.root); h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); assert.ok(h.drain() <= 8, 'missing rows, late attachment, and final cleanup complete within a 15.75-second bound'); assert.deepStrictEqual(bar.image.images.filter(Boolean), [], 'missing rows leave stale ranks cleared');
}

const activationDispatches = [...source.matchAll(/\$\.DispatchEvent\s*\(\s*"Activated"\s*,\s*([^)]*)\)/g)];
assert.strictEqual(activationDispatches.length, 2, 'one tab activation and one row activation are the only panel dispatches');
assert.deepStrictEqual(activationDispatches.map((match) => match[1].trim()), ['record.mainContents, "mouse"', 'playersTab'], 'rows use verified mouse activation while the Players tab keeps native activation');
assert.match(source, /root\.ShowRankBarebonesOpenStatlocker\s*=\s*function/, 'profile role installs the XML-facing StatLocker action');
assert.match(source, /root\.ShowRankBarebonesCopyAccount\s*=\s*function/, 'profile role installs the XML-facing account-copy action');
assert.doesNotMatch(source, /SetPanelEvent\("onactivate"/, 'context actions do not depend on lifecycle-sensitive programmatic handlers');
assert.strictEqual((source.match(/\$\.DispatchEvent\("DismissAllContextMenus"\)/g) || []).length, 1, 'one final player-card dismissal exists');
assert.strictEqual((source.match(/\$\.DispatchEvent\("DropInputFocus"\)/g) || []).length, 1, 'the final cleanup releases profile-card input focus');
assert.match(source, /\$\.DispatchEvent\("ExternalBrowserGoToURL", url\)/, 'StatLocker uses the proven native external-browser event');
assert.doesNotMatch(source, /ExecuteSteamURL|SteamOverlayAPI/, 'StatLocker contains no unsupported Steam URL path');
assert.match(source, /\$\.DispatchEvent\("CopyStringToClipboard", account, account\)/, 'Copy Account ID uses Panorama clipboard text payloads');
assert.strictEqual((source.match(/\$\.Schedule\s*\(/g) || []).length, 1, 'one scheduler seam serves finite retries');
assert.doesNotMatch(source, /\$\.(?:RegisterForUnhandledEvent|RegisterEventHandler)\b|\b(?:Subscribe|Unsubscribe)\s*\(/, 'no event subscriptions');
assert.doesNotMatch(source, /\$\.Msg|BareRankTrace|ShowRankBarebonesTopbarRefresh/, 'obsolete overlay paths and diagnostics are absent');
assert.doesNotMatch(source, /\b(?:XMLHttpRequest|fetch|WebSocket|AsyncWebRequest|WebRequest)\b/, 'no direct network API');
assert.doesNotMatch(source, /\b(?:GameUI|Players|Entities|SteamFriends|DOTAPlayerIDs|GetHudRoot|GetTopmostPopup)\b|\$\.GetContextPanel\s*\([^)]*,/, 'no cross-context engine traversal');
assert.doesNotMatch(source, /\b(?:ShowRankCommon|ShowRankTrigger|ShowRankOpenStatlocker|ShowRankProbe|WebMediaDemo|diagnostic|debug)\b/i, 'no old bridge or diagnostics');
assert.doesNotMatch(source, /\$\.__showrank_barebones_state_v1/, 'state is never shared through context-local $');

console.log('showrank barebones runtime tests passed');
