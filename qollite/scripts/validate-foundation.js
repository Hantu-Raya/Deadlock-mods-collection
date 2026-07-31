const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createPanel(id, parent) {
  const panel = {
    id,
    parent: parent || null,
    children: [],
    classes: {},
    style: {},
    classWrites: 0,
    IsValid() { return true; },
    GetParent() { return this.parent; },
    FindChildTraverse(target) {
      if (this.id === target) return this;
      for (const child of this.children) {
        const found = child.FindChildTraverse(target);
        if (found) return found;
      }
      return null;
    },
    BHasClass(name) { return !!this.classes[name]; },
    SetHasClass(name, value) {
      this.classWrites += 1;
      this.classes[name] = !!value;
    },
  };
  if (parent) parent.children.push(panel);
  return panel;
}

function load(context, name) {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'qollite', 'panorama', 'scripts', name),
    'utf8',
  );
  vm.runInNewContext(source, context, { filename: name });
}

for (const name of fs.readdirSync(path.join(process.cwd(), 'qollite', 'panorama', 'scripts'))) {
  if (!/^qollite_.*\.js$/.test(name)) continue;
  try {
    load({ console }, name);
  } catch (error) {
    throw new Error(`${name} must tolerate Panorama contexts without GameUI: ${error.message}`);
  }
}

const root = createPanel('Root');
const sibling = createPanel('Sibling', root);
const leaf = createPanel('Leaf', sibling);
const scheduled = [];
const dispatched = [];
const handlers = {};
let handlerRegistrations = 0;
const config = {
  'qollite.storage': '{broken',
};
const context = {
  console,
  JSON,
  Object,
  Array,
  Number,
  isFinite,
  GameUI: {
    CustomUIConfig() { return config; },
  },
  $: {
    GetContextPanel() { return leaf; },
    Schedule(delay, callback) {
      scheduled.push({ delay, callback });
      return scheduled.length;
    },
    DispatchEvent(name, payload) {
      dispatched.push({ name, payload });
    },
    RegisterForUnhandledEvent(name, callback) {
      handlerRegistrations += 1;
      if (!handlers[name]) handlers[name] = [];
      handlers[name].push(callback);
    },
  },
};

load(context, 'qollite_runtime.js');
load(context, 'qollite_storage.js');
load(context, 'qollite_settings.js');
load(context, 'qollite_umm.js');

const qol = config.QolLite;
const runtime = qol.Runtime;
const settings = qol.Settings;
const storage = qol.Storage;
const umm = qol.UMM;

assert(runtime.find('Root') === root, 'Runtime.find must traverse ancestors');
assert(runtime.find('Sibling') === sibling, 'Runtime.find must resolve an ancestor child');
assert(runtime.setClass(leaf, 'Visible', true), 'setClass must render a changed class');
assert(!runtime.setClass(leaf, 'Visible', true), 'setClass must skip unchanged classes');
assert(leaf.classWrites === 1, 'setClass must write only changed values');
assert(runtime.setStyle(leaf, 'opacity', '0.5'), 'setStyle must render a changed value');
assert(!runtime.setStyle(leaf, 'opacity', '0.5'), 'setStyle must skip unchanged values');

runtime.init();
let cancelledRuns = 0;
runtime.schedule('cancelled', 0, () => { cancelledRuns += 1; });
runtime.cancel('cancelled');
scheduled.shift().callback();
assert(cancelledRuns === 0, 'Runtime.cancel must invalidate scheduled callbacks');

const lifecycle = { init: 0, refresh: 0, destroy: 0, lateRuns: 0 };
assert(runtime.register('lifecycle', {
  init() { lifecycle.init += 1; },
  refresh() { lifecycle.refresh += 1; },
  destroy() {
    lifecycle.destroy += 1;
    runtime.schedule('lifecycle', 0, () => { lifecycle.lateRuns += 1; });
  },
}), 'Runtime.register must accept the feature interface');
assert(lifecycle.init === 1, 'registering an active feature must initialize it once');
runtime.refresh('lifecycle');
assert(lifecycle.refresh === 1, 'Runtime.refresh must dispatch to the named feature');
runtime.destroy('lifecycle');
assert(lifecycle.destroy === 1, 'Runtime.destroy must dispatch to the named feature');
scheduled.shift().callback();
assert(lifecycle.lateRuns === 0, 'schedules created during destroy must be invalidated');

function normalizeDemo(state) {
  if (!state || typeof state.enabled !== 'boolean' || typeof state.opacity !== 'number') return null;
  if (state.opacity < 0 || state.opacity > 1) return null;
  return { enabled: state.enabled, opacity: state.opacity };
}

assert(settings.define('demo', {
  defaults: { enabled: true, opacity: 0.9 },
  normalize: normalizeDemo,
}), 'Settings.define must register a valid schema');
const initial = settings.get('demo');
assert(initial.enabled && initial.opacity === 0.9, 'Settings.get must return defaults');
assert(Object.isFrozen(initial), 'Settings.get must return an immutable state');
let changes = 0;
settings.subscribe('demo', () => { changes += 1; });
assert(settings.set('demo', 'enabled', false), 'Settings.set must accept normalized values');
assert(!settings.set('demo', 'enabled', false), 'Settings.set must skip unchanged values');
assert(!settings.patch('demo', { opacity: 2 }), 'Settings.patch must reject invalid normalized values');
assert(settings.patch('demo', { opacity: 0.5 }), 'Settings.patch must apply normalized values');
assert(settings.reset('demo'), 'Settings.reset must restore defaults');
assert(changes === 3, 'Settings subscribers must fire only for changed states');

assert(Object.keys(storage.load('missing')).length === 0, 'Storage.load must fall back from malformed data');
assert(storage.save('stored', { enabled: true }), 'Storage.save must persist a valid state');
assert(storage.load('stored').enabled === true, 'Storage.load must return persisted state');

assert(umm.register('wire', {
  defaults: { enabled: true },
  normalize(state) {
    return state && typeof state.enabled === 'boolean' ? { enabled: state.enabled } : null;
  },
}), 'UMM.register must define settings');
const announcement = umm.announce('wire');
assert(announcement.umm === 1 && announcement.t === 'register' && announcement.id === 'wire', 'UMM.announce must emit a register envelope');
assert(dispatched.some((entry) => entry.name === 'ClientUI_FireOutput' && JSON.parse(entry.payload).t === 'register'), 'UMM announce must dispatch registration on the Panorama bridge');
assert(Array.isArray(handlers.ClientUI_FireOutput) && handlers.ClientUI_FireOutput.length === 1, 'UMM must register the Panorama bridge listener');
const hello = umm.handle({ umm: 1, t: 'hello' });
assert(Array.isArray(hello) && hello.some((entry) => entry.id === 'wire' && entry.t === 'register'), 'UMM hello must re-emit module registration');
assert(umm.handle({ umm: 1, t: 'hello', id: 'wire' }) === null, 'UMM must reject malformed hello envelopes');
assert(umm.handle({ umm: 1, t: 'set', id: 'wire', key: 'enabled', v: false }), 'UMM must accept a valid set envelope');
assert(settings.get('wire', 'enabled') === false, 'UMM set must delegate to Settings');
assert(!umm.handle({ umm: 1, t: 'set', id: 'wire', key: 'enabled', v: 'false' }), 'UMM must reject mismatched value types');
assert(!umm.handle({ umm: 2, t: 'set', id: 'wire', key: 'enabled', v: true }), 'UMM must reject wrong protocol versions');

const contextTwo = {
  console,
  JSON,
  Object,
  Array,
  Number,
  isFinite,
  GameUI: {
    CustomUIConfig() { return config; },
  },
  $: context.$,
};
load(contextTwo, 'qollite_settings.js');
load(contextTwo, 'qollite_umm.js');
const settingsTwo = config.QolLite.Settings;
const ummTwo = config.QolLite.UMM;
assert(handlerRegistrations === 2, 'each live Panorama context must register one bridge listener');
assert(ummTwo.register('wire', {
  defaults: { enabled: true },
  normalize(state) {
    return state && typeof state.enabled === 'boolean' ? { enabled: state.enabled } : null;
  },
}), 'a later UMM context must replace a module registration');
assert(config.QolLite.UMMRegistry.modules.wire.settings === settingsTwo, 'replacement must retain the latest module Settings adapter');
dispatched.length = 0;
for (const callback of handlers.ClientUI_FireOutput.slice()) {
  callback({ umm: 1, t: 'hello' });
}
const replacementAnnouncements = dispatched.filter((entry) => {
  const payload = JSON.parse(entry.payload);
  return entry.name === 'ClientUI_FireOutput' && payload.t === 'register' && payload.id === 'wire';
});
assert(replacementAnnouncements.length === 1, 'hello must announce the replacement owner exactly once');
assert(ummTwo.handle({ umm: 1, t: 'set', id: 'wire', key: 'enabled', v: true }), 'set must route to the replacement owner');
assert(settingsTwo.get('wire', 'enabled') === true, 'replacement owner must receive its setting update');
assert(settings.get('wire', 'enabled') === false, 'replaced owner must retain its prior setting state');
console.log('OK: foundation behavior passed');
