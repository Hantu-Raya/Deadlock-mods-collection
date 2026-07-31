const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(process.cwd(), 'qollite', 'panorama', 'scripts', 'qollite_notifications.js'),
  'utf8',
);
const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

function panel(id) {
  return {
    id,
    children: [],
    classes: new Set(),
    style: {},
    text: '',
    FindChildTraverse(targetId) {
      if (this.id === targetId) return this;
      for (const child of this.children) {
        const found = child.FindChildTraverse(targetId);
        if (found) return found;
      }
      return null;
    },
    RemoveAndDeleteChildren() {
      this.children = [];
    },
    DeleteAsync() {
      if (!this.parent) return;
      const index = this.parent.children.indexOf(this);
      if (index >= 0) this.parent.children.splice(index, 1);
    },
    SetHasClass(name, enabled) {
      if (enabled) this.classes.add(name);
      else this.classes.delete(name);
    },
  };
}

function createHarness() {
  const context = panel('Context');
  let clock = 100;
  let scheduled = null;
  let registered = null;
  let ummRegistration = null;
  const settings = { enabled: true };
  const subscribers = [];
  const runtime = {
    find(id, root) {
      return (root || context).FindChildTraverse(id);
    },
    setClass(target, name, enabled) {
      target.SetHasClass(name, enabled);
    },
    schedule(owner, delay, callback) {
      scheduled = { owner, delay, callback };
    },
    cancel(owner) {
      if (scheduled && scheduled.owner === owner) scheduled = null;
    },
    register(name, feature) {
      registered = { name, feature };
    },
  };
  const sandbox = {
    Game: { GetGameTime: () => clock },
    GameUI: {
      CustomUIConfig: () => ({
        QolLite: {
          Runtime: runtime,
          Settings: {
            define() {},
            get(id, key) {
              return settings[key];
            },
            set(id, key, value) {
              settings[key] = value;
              subscribers.forEach((listener) => listener({ enabled: settings.enabled }));
            },
            subscribe(id, listener) {
              subscribers.push(listener);
              return () => {
                const index = subscribers.indexOf(listener);
                if (index >= 0) subscribers.splice(index, 1);
              };
            },
          },
          UMM: {
            register(id, options) {
              ummRegistration = { id, options };
            },
          },
        },
      }),
    },
    $: {
      GetContextPanel: () => context,
      CreatePanel(type, parent, id) {
        const child = panel(id);
        child.type = type;
        child.parent = parent;
        parent.children.push(child);
        return child;
      },
    },
  };
  vm.runInNewContext(source, sandbox, { filename: 'qollite_notifications.js' });
  return {
    clock: (value) => { clock = value; },
    context,
    feature: () => registered && registered.feature,
    registered: () => registered,
    umm: () => ummRegistration,
    root: () => context.FindChildTraverse('QolLiteNotificationRoot'),
    rows: () => {
      const root = context.FindChildTraverse('QolLiteNotificationRoot');
      return root ? root.children.map((row) => row.children[0].text) : [];
    },
    setEnabled: (enabled) => {
      settings.enabled = enabled;
      subscribers.forEach((listener) => listener({ enabled }));
    },
    runSchedule: () => {
      const next = scheduled;
      scheduled = null;
      if (next) next.callback();
    },
    scheduled: () => scheduled,
  };
}

const harness = createHarness();
const notifications = harness.feature();
assert(harness.registered() && harness.registered().name === 'notifications', 'notification feature must register itself');
assert(notifications, 'notification feature must be available through Runtime.register');
assert(harness.umm() && harness.umm().id === 'notifications', 'notification settings must register with UMM');
assert(harness.umm().options.normalize({ enabled: false }).enabled === false, 'UMM normalizer must retain enabled state');
assert(harness.umm().options.normalize({ enabled: 'false' }) === null, 'UMM normalizer must reject invalid settings');

notifications.init();
assert(harness.root(), 'init must create the owned notification root');
assert(!harness.root().classes.has('QolLiteNotificationRoot--disabled'), 'notifications start enabled');

assert(notifications.push({ id: 'duplicate', text: 'first', expiresAt: 140, priority: 1 }), 'valid notification must be accepted');
assert(notifications.push({ id: 'duplicate', text: 'replacement', expiresAt: 145, priority: 5 }), 'same id may update the queued notification');
assert(harness.rows().length === 1, 'duplicate ids must render only one notification');
assert(harness.rows()[0] === 'replacement', 'deduplication must retain the newest payload');

notifications.push({ id: 'late', text: 'late', expiresAt: 130, priority: 1 });
notifications.push({ id: 'early', text: 'early', expiresAt: 120, priority: 1 });
notifications.push({ id: 'important', text: 'important', expiresAt: 150, priority: 2 });
assert(
  harness.rows().join(',') === 'replacement,important,early',
  'visible notifications must be priority-ordered, then expiry-ordered, and capped',
);
assert(harness.scheduled() && harness.scheduled().delay > 0, 'a queued expiry must schedule a future refresh');

harness.clock(121);
harness.runSchedule();
assert(!harness.rows().includes('early'), 'expired notifications must disappear using the engine clock');
assert(!notifications.push({ id: 'expired', text: 'expired', expiresAt: 121, priority: 0 }), 'already expired notifications must be ignored');
assert(!notifications.push({ id: '', text: 'bad', expiresAt: 130, priority: 0 }), 'events without ids must be ignored');
assert(!notifications.push({ id: 'bad', text: '', expiresAt: 130, priority: 0 }), 'events without text must be ignored');
assert(!notifications.push({ id: 'bad-time', text: 'bad', expiresAt: '130', priority: 0 }), 'events with invalid expiry must be ignored');

harness.setEnabled(false);
assert(harness.root().classes.has('QolLiteNotificationRoot--disabled'), 'UMM disable must hide the owned renderer');
assert(harness.rows().length === 0, 'disabled notifications must not render queue rows');
harness.setEnabled(true);
assert(!harness.root().classes.has('QolLiteNotificationRoot--disabled'), 'UMM enable must restore the owned renderer');

notifications.destroy();
assert(!harness.context.FindChildTraverse('QolLiteNotificationRoot'), 'destroy must remove the owned root');
harness.clock(200);
harness.runSchedule();
assert(!harness.context.FindChildTraverse('QolLiteNotificationRoot'), 'stale scheduled callbacks must not recreate destroyed UI');

if (failures.length) {
  console.error(failures.map((failure) => '- ' + failure).join('\n'));
  process.exitCode = 1;
} else {
  console.log('notifications validation passed');
}
