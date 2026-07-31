#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class Panel {
  constructor(type, parent, id) {
    this.type = type;
    this.id = id || '';
    this.parent = null;
    this.children = [];
    this.classes = new Set();
    this.style = new Proxy({}, {
      set(target, property, value) {
        if ((property === 'backgroundImage' || property === 'washColor') && value === '') {
          throw new Error(`Panorama rejects empty ${String(property)} values`);
        }
        target[property] = value;
        return true;
      },
    });
    this.valid = true;
    this.text = '';
    this.events = {};
    if (parent) this.SetParent(parent);
  }

  IsValid() { return this.valid; }
  GetParent() { return this.parent; }
  GetChildCount() { return this.children.length; }
  GetChild(index) { return this.children[index] || null; }
  FindChild(id) { return this.children.find((child) => child.valid && child.id === id) || null; }
  FindChildTraverse(id) {
    for (const child of this.children) {
      if (!child.valid) continue;
      if (child.id === id) return child;
      const found = child.FindChildTraverse(id);
      if (found) return found;
    }
    return null;
  }
  FindChildrenWithClassTraverse(className) {
    if (this.processingTraversals) this.processingTraversals.push(className);
    if (className === 'recentPurchase' && this.purchaseSnapshotSizes) {
      this.purchaseSnapshotSizes.push(this.children.length);
    }
    const result = [];
    const visit = (panel) => {
      for (const child of panel.children) {
        if (!child.valid) continue;
        if (child.BHasClass(className)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }
  AddClass(className) { this.classes.add(className); }
  RemoveClass(className) { this.classes.delete(className); }
  SetHasClass(className, enabled) { if (enabled) this.AddClass(className); else this.RemoveClass(className); }
  BHasClass(className) { return this.classes.has(className); }
  SetPanelEvent(name, handler) { this.events[name] = handler; }
  SetDialogVariableInt(name, value) { this[name] = value; }
  SetParent(parent) {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = parent;
    if (parent) parent.children.push(this);
  }
  DeleteAsync() {
    if (!this.valid) return;
    if (this.deferredDeletes && !this.deleteNow) {
      if (!this.deleteQueued) {
        this.deleteQueued = true;
        this.deferredDeletes.push(() => {
          this.deleteNow = true;
          this.DeleteAsync(0);
        });
      }
      return;
    }
    this.valid = false;
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
    for (const child of this.children.slice()) child.DeleteAsync(0);
  }
}

function makeRuntime(onDispatch) {
  const root = new Panel('Panel', null, 'Root');
  const purchasePanel = new Panel('Panel', root, 'RecentPurchasesPanel');
  const heading = new Panel('Label', purchasePanel, 'RecentPurchases');
  heading.text = 'Recent Purchases';
  const container = new Panel('Panel', purchasePanel, 'RecentPurchasesContainer');
  container.purchaseSnapshotSizes = [];
  const player = new Panel('Panel', root, 'PlayerPanel');
  const badge = new Panel('Panel', player, 'HeroBadge');
  badge.heroid = 1;
  const heroName = new Panel('Label', player, 'HeroName');
  heroName.AddClass('HeroNameHidden');
  heroName.text = 'Haze';

  const scheduled = [];
  const handlers = {};
  const dispatches = [];
  const emit = (name, payload) => {
    for (const handler of handlers[name] || []) handler(payload);
  };
  const panorama = {
    GetContextPanel: () => root,
    CreatePanel: (type, parent, id) => new Panel(type, parent, id),
    RegisterEventHandler: (name, panel, handler) => { panel.events[name] = handler; },
    RegisterForUnhandledEvent: (name, handler) => {
      if (!handlers[name]) handlers[name] = [];
      handlers[name].push(handler);
    },
    DispatchEvent: (name, payload) => {
      dispatches.push({ name, payload });
      if (onDispatch) onDispatch(name, payload, emit);
    },
    Schedule: (delay, callback) => scheduled.push({ delay, callback }),
    FrameTime: () => 0,
    Msg: () => {},
  };
  const context = vm.createContext({
    $: panorama,
    console: { log: () => {}, error: () => {}, warn: () => {} },
    JSON,
    Math,
    String,
    Number,
    Boolean,
    Object,
    Array,
    RegExp,
    Date,
  });

  return {
    root,
    purchasePanel,
    container,
    scheduled,
    dispatches,
    context,
    emit(message) {
      emit('ClientUI_FireOutput', message);
    },
    runNext() {
      assert(scheduled.length > 0, 'expected a scheduled callback');
      scheduled.shift().callback();
    },
    runDelay(delay) {
      const index = scheduled.findIndex((task) => task.delay === delay);
      assert(index !== -1, `expected a ${delay}s scheduled callback`);
      scheduled.splice(index, 1)[0].callback();
    },
    drain() {
      let steps = 0;
      while (scheduled.length) {
        assert(steps++ < 100, 'stale callbacks kept scheduling after disable');
        scheduled.shift().callback();
      }
    },
  };
}

function addPurchase(container, name, time) {
  const purchase = new Panel('Panel', container, '');
  purchase.AddClass('recentPurchase');
  const itemName = new Panel('Label', purchase, '');
  itemName.AddClass('recentModPurchaseName');
  itemName.text = name;
  const itemTime = new Panel('Label', purchase, '');
  itemTime.AddClass('recentTimePurchased');
  itemTime.text = time;
  const purchaser = new Panel('Label', purchase, '');
  purchaser.AddClass('recentModPurchaserHero');
  purchaser.text = 'Haze';
  const icon = new Panel('Image', purchase, '');
  icon.AddClass('mod_icon');
  return { purchase, icon };
}

function busMessage(message) {
  return JSON.stringify(message);
}

const scripts = path.join(__dirname, '..', 'panorama', 'scripts');
function loadRuntime(runtime) {
  vm.runInContext(fs.readFileSync(path.join(scripts, 'qollite_recent_purchase_icons.js'), 'utf8'), runtime.context, {
    filename: 'qollite_recent_purchase_icons.js',
  });
  vm.runInContext(fs.readFileSync(path.join(scripts, 'qollite_recent_purchases.js'), 'utf8'), runtime.context, {
    filename: 'qollite_recent_purchases.js',
  });
}
const runtime = makeRuntime();
let oldPurchase;

loadRuntime(runtime);

const registrations = () => runtime.dispatches
  .filter((event) => event.name === 'ClientUI_FireOutput')
  .map((event) => JSON.parse(event.payload));
const assertRegistration = (message) => {
  const all = registrations();
  const manifest = all[all.length - 1];
  assert(manifest && manifest.umm === 1 && manifest.t === 'register', `${message}: expected UMM registration`);
  assert(manifest.id === 'recent_purchases', `${message}: wrong mod id`);
  assert(Array.isArray(manifest.settings) && manifest.settings.length === 1, `${message}: expected one setting`);
  const enabled = manifest.settings[0];
  assert(enabled.id === 'enabled' && enabled.type === 'toggle' && enabled.default === true, `${message}: expected enabled default true`);
};

assertRegistration('startup');
assert(runtime.root.BHasClass('recent_purchases_disabled') === false, 'default enabled must not mark root disabled');
assert(runtime.root.FindChildTraverse('FiltersCollapseToggle'), 'default enabled must create filters');
assert(runtime.root.FindChildTraverse('PurchaseFiltersContainer'), 'default enabled must create filter container');

oldPurchase = addPurchase(runtime.container, 'Existing item', '00:01');
oldPurchase.purchase.AddClass('filterHidden');
oldPurchase.icon.AddClass('iconSet');
oldPurchase.icon.style.backgroundImage = 'url("mod")';
oldPurchase.icon.style.washColor = 'none';

const registrationCount = registrations().length;
runtime.emit(busMessage({ umm: 1, t: 'hello' }));
assert(registrations().length === registrationCount + 1, 'hello must reannounce exactly once');
assertRegistration('hello');

for (const message of [
  'not json',
  busMessage({ umm: 2, t: 'set', id: 'recent_purchases', key: 'enabled', value: false }),
  busMessage({ umm: 1, t: 'set', id: 'other_mod', key: 'enabled', value: false }),
  busMessage({ umm: 1, t: 'set', id: 'recent_purchases', key: 'other', value: false }),
  busMessage({ umm: 1, t: 'set', id: 'recent_purchases', key: 'enabled', value: 'false' }),
]) runtime.emit(message);
assert(!runtime.root.BHasClass('recent_purchases_disabled'), 'malformed or unrelated messages must not change state');

runtime.runDelay(0.3);
runtime.runDelay(0.1);
runtime.runDelay(0.3);
runtime.runDelay(0.1);
const newPurchase = addPurchase(runtime.container, 'New item', '00:02');
runtime.runDelay(0.1);
assert(runtime.root.FindChildrenWithClassTraverse('QuickPurchasesPanel').length === 1, 'enabled polling must create popup UI for a new purchase');
assert(runtime.scheduled.length > 0, 'enabled polling must have recurring callbacks queued');

runtime.emit(busMessage({ umm: 1, t: 'set', id: 'recent_purchases', key: 'enabled', value: false }));
assert(runtime.root.BHasClass('recent_purchases_disabled'), 'matching false set must disable the mod');
assert(oldPurchase.purchase.IsValid() && newPurchase.purchase.IsValid(), 'disable must preserve Valve-owned purchase rows');
assert(!runtime.root.FindChildTraverse('FiltersCollapseToggle'), 'disable must delete mod filter toggle');
assert(!runtime.root.FindChildTraverse('PurchaseFiltersContainer'), 'disable must delete mod filter container');
assert(runtime.root.FindChildrenWithClassTraverse('QuickPurchasesPanel').length === 0, 'disable must delete mod popup UI');
assert(!oldPurchase.purchase.BHasClass('filterHidden'), 'disable must remove mod filter class from Valve row');
assert(!oldPurchase.icon.BHasClass('iconSet'), 'disable must remove mod icon class from Valve row');
assert(oldPurchase.icon.style.backgroundImage === 'none', 'disable must reset mod icon background');
assert(oldPurchase.icon.style.washColor === 'none', 'disable must reset mod icon wash color');

runtime.emit(busMessage({ umm: 1, t: 'set', id: 'recent_purchases', key: 'enabled', value: false }));
runtime.drain();
assert(runtime.scheduled.length === 0, 'disabled mod must stop recurring scheduling after queued callbacks drain');

runtime.emit(busMessage({ umm: 1, t: 'set', id: 'recent_purchases', key: 'enabled', value: true }));
assert(!runtime.root.BHasClass('recent_purchases_disabled'), 'matching true set must enable the mod');
assert(runtime.scheduled.length === 3, 'enable must start one poll pair plus one hero-map resolution');
runtime.emit(busMessage({ umm: 1, t: 'set', id: 'recent_purchases', key: 'enabled', value: true }));
assert(runtime.scheduled.length === 3, 'repeated enable must not start duplicate poll loops');

const retainedPurchase = addPurchase(runtime.container, 'Retained item', '00:03');
runtime.runDelay(0.3);
runtime.runDelay(0.1);
assert(retainedPurchase.purchase.IsValid(), 're-enable must keep rows present before its first poll');
assert(runtime.root.FindChildrenWithClassTraverse('QuickPurchasesPanel').length === 0, 're-enable must not replay existing purchases');

const disabledDuringRegistration = makeRuntime((name, payload, emit) => {
  if (name !== 'ClientUI_FireOutput') return;
  const message = JSON.parse(payload);
  if (message.umm === 1 && message.t === 'register' && message.id === 'recent_purchases') {
    emit(name, busMessage({ umm: 1, t: 'set', id: 'recent_purchases', key: 'enabled', value: false }));
  }
});
const startupPurchase = addPurchase(disabledDuringRegistration.container, 'Startup item', '00:04');
loadRuntime(disabledDuringRegistration);
assert(startupPurchase.purchase.IsValid(), 'persisted disabled startup must preserve Valve-owned purchase rows');
assert(disabledDuringRegistration.root.BHasClass('recent_purchases_disabled'), 'persisted disabled startup must set disabled class');
assert(disabledDuringRegistration.scheduled.length === 0, 'persisted disabled startup must not schedule poll work');
assert(!disabledDuringRegistration.root.FindChildTraverse('FiltersCollapseToggle'), 'persisted disabled startup must not create filters');
assert(disabledDuringRegistration.root.FindChildrenWithClassTraverse('QuickPurchasesPanel').length === 0, 'persisted disabled startup must not create popup UI');

const cappedAtSnapshot = makeRuntime();
const cappedRows = [];
for (let index = 0; index < 51; index++) {
  cappedRows.push(addPurchase(cappedAtSnapshot.container, `Capped item ${index}`, `01:${index}`));
}
const deferredOverflowDeletes = [];
cappedRows[50].purchase.deferredDeletes = deferredOverflowDeletes;
cappedRows[50].purchase.processingTraversals = [];
loadRuntime(cappedAtSnapshot);
assert(cappedAtSnapshot.container.purchaseSnapshotSizes.indexOf(51) !== -1, 'capped purchases must snapshot the full Valve list before scheduling overflow removal');
assert(cappedRows[50].purchase.IsValid() && cappedRows[50].purchase.GetParent() === cappedAtSnapshot.container, 'overflow rows must remain traversable until Panorama runs their queued deletion');
assert(deferredOverflowDeletes.length === 1, 'overflow removal must queue exactly one asynchronous deletion');
assert(cappedRows[50].purchase.processingTraversals.length === 0, 'filter and popup processing must use the capped local purchase snapshot');
assert(!cappedRows[50].purchase.BHasClass('filterHidden'), 'the queued overflow row must not receive filter UI state');
assert(cappedAtSnapshot.root.FindChildrenWithClassTraverse('QuickPurchasesPanel').length === 0, 'overflow rows must not create popup UI');
deferredOverflowDeletes.shift()();
assert(!cappedRows[50].purchase.IsValid(), 'queued overflow deletion must eventually remove the panel');

const seenKeyStress = makeRuntime();
loadRuntime(seenKeyStress);
seenKeyStress.runDelay(0.3);
seenKeyStress.runDelay(0.1);
seenKeyStress.runDelay(0.3);
seenKeyStress.runDelay(0.1);
for (let index = 0; index < 301; index++) {
  const row = addPurchase(seenKeyStress.container, `Unique item ${index}`, `02:${index}`);
  seenKeyStress.container.children = [row.purchase].concat(
    seenKeyStress.container.children.filter((child) => child !== row.purchase),
  );
  seenKeyStress.runDelay(0.1);
}
assert(seenKeyStress.container.GetChildCount() === 50, 'unique-purchase stress must retain only the capped rows');
assert(seenKeyStress.container.purchaseSnapshotSizes.every((count) => count <= 51), 'seen-key stress must scan at most one pending overflow row per capped poll');
const quickPanel = seenKeyStress.root.FindChildrenWithClassTraverse('QuickPurchasesPanel')[0];
assert(quickPanel && quickPanel.IsValid(), 'unique purchases must create one quick-purchase panel');
const quickEntries = quickPanel.children.filter((child) => child.IsValid() && child.BHasClass('quickPurchase'));
assert(quickEntries.length === 3, 'unique-purchase stress must retain only the visible quick-entry cap');
seenKeyStress.runDelay(0.1);
assert(
  quickEntries.every((entry) => entry.IsValid() && quickPanel.children.indexOf(entry) !== -1),
  'capped seen keys must not replay retained purchases on the next poll',
);

console.log('PASS validate-recent-purchases-toggle');
