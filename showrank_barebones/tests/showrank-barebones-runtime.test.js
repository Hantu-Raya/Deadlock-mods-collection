'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'panorama', 'scripts', 'showrank_barebones.js'), 'utf8');
const rankUrl = (account) => `https://api.deadlock-api.com/v1/players/${account}/rank-predict/image?format=webp`;

class Panel {
  constructor(type, options = {}) { Object.assign(this, { paneltype: type, id: options.id || '', text: options.text === undefined ? '' : String(options.text), attributes: { ...options.attributes }, classes: new Set(options.classes || []), visible: options.visible === undefined ? true : options.visible, valid: options.valid === undefined ? true : options.valid, children: [], parent: null, images: [] }); }
  add(child) { child.parent = this; this.children.push(child); return child; }
  IsValid() { return this.valid; }
  GetParent() { return this.parent; }
  BHasClass(className) { return this.classes.has(className); }
  GetAttributeString(name, fallback) { if (!this.valid) throw new Error(`invalid panel ${this.id}`); return this.attributes[name] === undefined ? fallback : String(this.attributes[name]); }
  FindChildTraverse(id) { if (!this.valid) throw new Error(`invalid panel ${this.id}`); for (const child of this.children) { if (child.id === id) return child; const nested = child.FindChildTraverse(id); if (nested) return nested; } return null; }
  FindChildrenWithClassTraverse(className) { const found = []; for (const child of this.children) { if (child.classes.has(className)) found.push(child); found.push(...child.FindChildrenWithClassTraverse(className)); } return found; }
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
function topbar(hero, id = `Topbar-${hero}`) { const root = new Panel('CitadelHudTopBarPlayer', { id, classes: ['ShowRankBarebonesTopbarPlayer'] }); const heroLabel = root.add(new Panel('Label', { id: 'ShowRankBarebonesTopbarHero', text: hero })); const image = root.add(new Panel('Panel', { id: 'HeroContents' })).add(new Panel('Image', { id: 'ShowRankBarebonesTopbarRankImage', visible: false })); return { root, heroLabel, image }; }
function row(hero, options = {}) { const root = new Panel('CitadelPlayersListEntry', { id: options.id || `Row-${hero}`, classes: ['ShowRankBarebonesPlayerRow'] }); const mainContents = root.add(new Panel('Panel', { id: 'MainContents', valid: options.mainValid })); const heroLabel = mainContents.add(new Panel('Label', { id: 'ShowRankBarebonesRowHero', text: hero })); return { root, mainContents, heroLabel }; }
function escape() { const root = new Panel('CitadelHudEscapeMenu', { id: 'Escape' }); return { root, playersTab: root.add(new Panel('TabButton', { id: 'PlayersTab' })) }; }

function harness() {
  const documentRoot = new Panel('CitadelHud', { id: 'Hud', classes: ['ShowEscapeMenu'] });
  const scheduled = [], events = [], handlers = new Map(), dollars = [], messages = [];
  function dispatch(event, panel, input) { assert.strictEqual(event, 'Activated', 'the runtime may dispatch only panel activation'); assert.ok(panel instanceof Panel, 'activation targets a local panel'); if (panel.id === 'MainContents') assert.strictEqual(input, 'mouse', 'player profile cards require mouse activation'); else assert.strictEqual(input, undefined, 'Players-tab activation has no fabricated input'); events.push(panel); const handler = handlers.get(panel); if (handler) handler(); }
  return {
    documentRoot, events, dollars, messages,
    attach(panel) { if (!panel.parent) documentRoot.add(panel); },
    evaluate(panel, options = {}) { if (options.attach !== false && !panel.parent) documentRoot.add(panel); const dollar = { GetContextPanel: () => panel, Msg: (message) => messages.push(String(message)), Schedule: (delay, callback) => { scheduled.push({ delay, callback }); return scheduled.length; }, DispatchEvent: dispatch }; dollars.push(dollar); vm.runInNewContext(source, { $: dollar, GameUI: new Proxy({}, { get() { throw new Error('global HUD traversal'); } }), Players: new Proxy({}, { get() { throw new Error('player API access'); } }), Entities: new Proxy({}, { get() { throw new Error('entity API access'); } }) }, { filename: 'showrank_barebones.js' }); return dollar; },
    on(panel, callback) { handlers.set(panel, callback); },
    drain(limit = 200) { let count = 0; while (scheduled.length) { assert.ok(count < limit, 'all scheduled behavior completes within a fixed bound'); scheduled.shift().callback(); count += 1; } return count; },
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
  const h = harness(); const invalidRoot = profile('123456', { valid: false, imageVisible: true }); h.evaluate(invalidRoot.root);
  assert.doesNotThrow(() => h.drain(), 'invalidated profile roots are ignored during their finite retries');
  const card = profile('123456'); h.evaluate(card.root); card.image.valid = false;
  assert.doesNotThrow(() => h.drain(), 'invalidated profile images are ignored during their finite retries');
}

// One Escape opening runs one completed pass; only a real close/reopen can clear and rebuild ranks.
{
  const h = harness(); const card = profile('101'), bar = topbar('haze'), menu = escape(), player = row('haze');
  h.evaluate(card.root); h.evaluate(bar.root); h.evaluate(player.root); h.on(player.mainContents, () => setProfileAccount(card, '201'));
  const menuDollar = h.evaluate(menu.root); menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.deepStrictEqual(bar.image.images.filter(Boolean), [rankUrl('201')], 'first pass renders its unique match');
  const playerTabActivations = h.events.filter((panel) => panel === menu.playersTab).length;
  menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(h.events.filter((panel) => panel === menu.playersTab).length, playerTabActivations, 'repeated mouseover cannot restart profile activation in one opening');
  assert.strictEqual(bar.image.images.at(-1), rankUrl('201'), 'same-opening mouseover cannot clear a completed rank');
  h.documentRoot.classes.delete('ShowEscapeMenu'); menuDollar.ShowRankBarebonesEscapeOut(); h.drain();
  h.documentRoot.classes.add('ShowEscapeMenu'); player.heroLabel.text = 'Infernus'; menuDollar.ShowRankBarebonesEscapeOpen(); h.drain();
  assert.strictEqual(bar.image.images.at(-1), '', 'a real reopened pass clears the stale rank when its row hero changes');
  assert.strictEqual(bar.image.visible, false, 'hero changes leave no stale topbar image visible');
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
  assert.ok(created); assert.ok(callbacks < 20, 'two-player Escape probe completes within a bound'); assert.strictEqual(h.pending(), 0, 'no recurring callback remains');
}

// Escape coordinates directly from the shared HUD tree even when role-local scripts never registered.
{
  const h = harness(); const card = profile('101'), bar = topbar('Haze'), player = row('haze'), menu = escape();
  h.attach(card.root); h.attach(bar.root); h.attach(player.root);
  h.on(player.mainContents, () => setProfileAccount(card, '201'));
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  assert.deepStrictEqual(bar.image.images.filter(Boolean), [rankUrl('201')], 'HUD class scans do not depend on cross-layout script globals');
}

// Topbar hover prints one bounded HUD/player-list/account snapshot for live diagnosis.
{
  const h = harness(); const card = profile('101'), bar = topbar('Haze'), player = row('haze'), menu = escape();
  h.evaluate(card.root); h.evaluate(bar.root); h.evaluate(player.root);
  h.on(player.mainContents, () => setProfileAccount(card, '201'));
  h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); h.drain();
  bar.root.ShowRankBarebonesTopbarRefresh();
  assert.ok(h.messages.some((message) => message.includes('hover id=Topbar-Haze hero=haze document=Hud classScan=true')), 'hover reports the selected slot and shared HUD scanner');
  assert.ok(h.messages.some((message) => message.includes('discovered topbars=1 playerListRows=1 profiles=1')), 'hover reports full discovered role counts');
  assert.ok(h.messages.some((message) => message.includes('playerList[0]') && message.includes('hero=haze')), 'hover reports the Players-list hero');
  assert.ok(h.messages.some((message) => message.includes('profile[0]') && message.includes('resolved=201')), 'hover reports profile account evidence');
  assert.ok(h.messages.some((message) => message.includes('activePlayer[0] hero=haze account=201')), 'hover reports the joined player-list account mapping');
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

{
  const h = harness(); const bar = topbar('haze'), menu = escape(); h.evaluate(bar.root); h.evaluate(menu.root).ShowRankBarebonesEscapeOpen(); assert.ok(h.drain() <= 7, 'missing rows and late attachment retries complete within a 15.25-second bound'); assert.deepStrictEqual(bar.image.images.filter(Boolean), [], 'missing rows leave stale ranks cleared');
}

const dispatches = [...source.matchAll(/\$\.DispatchEvent\s*\(\s*"([^"]+)"\s*,\s*([^)]*)\)/g)];
assert.strictEqual(dispatches.length, 2, 'one tab activation and one row activation are the only dispatches');
assert.ok(dispatches.every((match) => match[1] === 'Activated'), 'only Activated dispatches are available');
assert.deepStrictEqual(dispatches.map((match) => match[2].trim()), ['record.mainContents, "mouse"', 'playersTab'], 'rows use verified mouse activation while the Players tab keeps native activation');
assert.strictEqual((source.match(/\$\.Schedule\s*\(/g) || []).length, 1, 'one scheduler seam serves finite retries');
assert.doesNotMatch(source, /\$\.(?:RegisterForUnhandledEvent|RegisterEventHandler)\b|\b(?:Subscribe|Unsubscribe)\s*\(/, 'no event subscriptions');
assert.doesNotMatch(source, /\b(?:XMLHttpRequest|fetch|WebSocket|AsyncWebRequest|WebRequest)\b/, 'no direct network API');
assert.doesNotMatch(source, /\b(?:GameUI|Players|Entities|SteamFriends|DOTAPlayerIDs|GetHudRoot|GetTopmostPopup)\b|\$\.GetContextPanel\s*\([^)]*,/, 'no cross-context engine traversal');
assert.doesNotMatch(source, /\b(?:ShowRankCommon|ShowRankTrigger|ShowRankOpenStatlocker|ShowRankProbe|WebMediaDemo|StatLocker|diagnostic|debug)\b/i, 'no old bridge or diagnostics');
assert.doesNotMatch(source, /\$\.__showrank_barebones_state_v1/, 'state is never shared through context-local $');

console.log('showrank barebones runtime tests passed');
