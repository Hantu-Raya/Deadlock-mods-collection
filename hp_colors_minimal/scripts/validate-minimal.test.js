const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { getValidationReport } = require("./validate-minimal.js");

const ROOT = path.resolve(__dirname, "..");

function encodeBase64Url(text) {
  return Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

class MockPanel {
  constructor(id, options = {}) {
    this.id = id;
    this.text = options.text || "";
    this.classes = (options.classes || []).slice();
    this.children = [];
    this.parent = null;
    this.attributes = Object.assign({}, options.attributes || {});
    this.valid = options.valid !== undefined ? !!options.valid : true;
    this.actuallayoutwidth = options.actuallayoutwidth || 0;
    this.actuallayoutheight = options.actuallayoutheight || 0;
    this.findCounts = options.findCounts || null;
    this.styleWrites = [];
    const initialStyle = Object.assign({}, options.style || {});
    this.style = new Proxy(initialStyle, {
      set: (target, property, value) => {
        this.styleWrites.push({ property: String(property), value });
        target[property] = value;
        return true;
      },
      deleteProperty: (target, property) => {
        this.styleWrites.push({ property: String(property), value: undefined });
        delete target[property];
        return true;
      },
    });
  }

  add(child) {
    child.parent = this;
    if (!child.findCounts) child.findCounts = this.findCounts;
    this.children.push(child);
    return child;
  }

  IsValid() { return this.valid; }
  GetParent() { return this.parent; }
  Children() { return this.children.slice(); }
  BHasClass(name) { return this.classes.includes(name); }
  AddClass(name) { if (!this.classes.includes(name)) this.classes.push(name); }
  RemoveClass(name) { this.classes = this.classes.filter((item) => item !== name); }
  SetHasClass(name, enabled) { if (enabled) this.AddClass(name); else this.RemoveClass(name); }
  GetAttributeString(name, fallback) {
    if (Object.prototype.hasOwnProperty.call(this.attributes, name)) return this.attributes[name];
    if (name === "text") return this.text || fallback || "";
    if (name === "id") return this.id || fallback || "";
    return fallback || "";
  }
  SetAttributeString(name, value) { this.attributes[name] = String(value); }
  FindChildTraverse(id) {
    if (this.findCounts) this.findCounts[id] = (this.findCounts[id] || 0) + 1;
    const stack = [this];
    while (stack.length) {
      const panel = stack.shift();
      if (panel.id === id) return panel;
      stack.unshift(...panel.children);
    }
    return null;
  }
  FindChildrenWithClassTraverse(name) {
    const out = [];
    if (this.classes.includes(name)) out.push(this);
    for (const child of this.children) out.push(...child.FindChildrenWithClassTraverse(name));
    return out;
  }
}

function makePresetPanel(id, values, extra = {}) {
  const preset = { version: 1, name: extra.name || id, values };
  if (extra.heroMode !== undefined) preset.heroMode = extra.heroMode;
  if (extra.heroes !== undefined) preset.heroes = extra.heroes;
  return new MockPanel(id, {
    classes: ["hp_colors_preset_entry"],
    text: encodeBase64Url(JSON.stringify(preset)),
  });
}

function makeRawPresetPanel(id, preset) {
  return new MockPanel(id, {
    classes: ["hp_colors_preset_entry"],
    text: encodeBase64Url(JSON.stringify(preset)),
  });
}

function runPublisher(entries, options = {}) {
  const source = fs.readFileSync(path.join(ROOT, "panorama/scripts/anita_ui_core.js"), "utf8");
  const findCounts = {};
  const root = new MockPanel("Root", { findCounts });
  const context = root.add(new MockPanel("Context"));
  const store = root.add(new MockPanel("HPColorsPresetStore"));
  for (const entry of entries) store.add(entry);

  if (options.heroClass) {
    const alive = root.add(new MockPanel("gameplay_hud_alive"));
    const crosshair = alive.add(new MockPanel("crosshair"));
    crosshair.add(new MockPanel("progress", { classes: [options.heroClass] }));
  }

  let gameTimePanel = null;
  if (options.gameTimeText !== undefined) {
    const topBar = root.add(new MockPanel("TopBar"));
    gameTimePanel = topBar.add(new MockPanel("GameTimeLabel", {
      classes: ["GameTime"],
      text: options.gameTimeText,
      attributes: { text: options.gameTimeText },
    }));
  }

  let now = options.now === undefined ? 100000 : options.now;
  let order = 0;
  const scheduled = [];
  const dispatched = [];
  const logs = [];
  const bridgeHandlers = [];
  const shared = {};
  if (options.debugPresetSelection) shared.__hpColorsPresetDebug = true;
  const sandbox = {
    Date: { now: () => now },
    console: {
      log: (message) => { logs.push(String(message)); },
      warn: (message) => { logs.push(String(message)); },
      error: (message) => { logs.push(String(message)); },
    },
    GameUI: { CustomUIConfig: () => shared },
    $: {
      GetContextPanel: () => context,
      DispatchEvent: (_channel, payload) => { dispatched.push(JSON.parse(payload)); },
      RegisterForUnhandledEvent: (_channel, fn) => { bridgeHandlers.push(fn); },
      Schedule: (delay, fn) => { scheduled.push({ delay, due: now + Number(delay) * 1000, fn, order: order += 1 }); },
      Msg: (message) => { logs.push(String(message)); },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "hp_colors_minimal/panorama/scripts/anita_ui_core.js" });
  return {
    root,
    store,
    gameTimePanel,
    findCounts,
    scheduled,
    dispatched,
    shared,
    logs,
    bridgeHandlers,
    get now() { return now; },
    set now(value) { now = value; },
  };
}

function runScheduled(result, count = result.scheduled.length) {
  for (let i = 0; i < count && i < result.scheduled.length; i += 1) result.scheduled[i].fn();
}

function runScheduledRange(result, start, end = result.scheduled.length) {
  const limit = Math.min(end, result.scheduled.length);
  for (let i = start; i < limit; i += 1) result.scheduled[i].fn();
}

function takePublisherReplaySchedule(result) {
  const index = result.scheduled.findIndex((item) => item.fn && item.fn.name === "replayCachedSnapshot");
  assert.notEqual(index, -1, "expected cached snapshot replay callback");
  return result.scheduled.splice(index, 1)[0];
}

function nextPublisherReplayDelay(result) {
  const item = result.scheduled.find((scheduledItem) => scheduledItem.fn && scheduledItem.fn.name === "replayCachedSnapshot");
  assert.ok(item, "expected cached snapshot replay callback");
  return item.delay;
}

function runPublisherReplay(result, now = result.now) {
  result.now = now;
  const before = result.dispatched.length;
  const replay = takePublisherReplaySchedule(result);
  replay.fn();
  assert.equal(result.dispatched.length, before + 1, "cached replay should dispatch the cached snapshot");
  return replay;
}

function lastSnapshot(result) {
  return result.dispatched[result.dispatched.length - 1] || null;
}

function normalizeColor(value) {
  return String(value || "").slice(0, 7).toLowerCase();
}

function makeRuntimeValues(values = {}) {
  return Object.assign({
    hp_enabled: true,
    hp_friend_enabled: false,
    hp_level_number_visible: false,
    hp_counter_visible: true,
    hp_bg_visible: true,
    hp_pulse_enabled: false,
    hp_friend_pulse_enabled: false,
  }, values);
}

function exposeRuntimeTestHooks(source) {
  const marker = "\n  try {\n    tryApplySharedSnapshot();";
  const hooks = `
  try {
    var __hpColorsTestStore = GameUI.CustomUIConfig();
    if (__hpColorsTestStore) {
      __hpColorsTestStore.__hpColorsRuntimeTestHooks = {
        getCurrentRedBarRefreshState: function () {
          return {
            now: _ts(),
            currentRbRefreshUntil: currentRbRefreshUntil,
            nextCurrentRbProbeAt: nextCurrentRbProbeAt,
            nextCurrentRbChildProbeAt: nextCurrentRbChildProbeAt,
          };
        },
      };
    }
  } catch (eTestHooks) {}
`;
  const instrumented = source.replace(marker, hooks + marker);
  assert.notEqual(instrumented, source, "runtime test hook marker should be present");
  return instrumented;
}

function currentRedBarRefreshState(runtime) {
  const hooks = runtime.shared.__hpColorsRuntimeTestHooks;
  assert.ok(hooks, "runtime test hooks should be exposed");
  return hooks.getCurrentRedBarRefreshState();
}

function runRuntime(options = {}) {
  let source = fs.readFileSync(path.join(ROOT, "panorama/scripts/healthbar_logic.js"), "utf8");
  if (options.exposeRuntimeTestHooks) source = exposeRuntimeTestHooks(source);
  const findCounts = {};
  const root = new MockPanel("Root", { findCounts });
  const unitStatus = root.add(new MockPanel("UnitStatus", {
    classes: options.unitStatusClasses || ["enemy", "team1"],
    findCounts,
  }));
  const infoHealth = unitStatus.add(new MockPanel("InfoHealthContainer", { findCounts }));
  const unitHealthbar = unitStatus.add(new MockPanel("UnitHealthbarContainer", { findCounts }));
  const redParent = unitStatus.add(new MockPanel("unit_healthbar_parent", {
    actuallayoutwidth: options.parentWidth === undefined ? 100 : options.parentWidth,
    actuallayoutheight: 12,
    findCounts,
  }));
  const lagging = redParent.add(new MockPanel("unit_healthbar_lagging", {
    actuallayoutwidth: options.barWidth === undefined ? 100 : options.barWidth,
    actuallayoutheight: 12,
    findCounts,
  }));
  const bg = unitStatus.add(new MockPanel("unit_healthbar_bg", { findCounts }));
  const pip = unitStatus.add(new MockPanel("unit_healthbar_pip_label", {
    text: options.pipText || "100",
    attributes: { text: options.pipText || "100" },
    findCounts,
  }));
  const ult = unitStatus.add(new MockPanel("unit_ult_ready_icon", { findCounts }));
  const level = unitStatus.add(new MockPanel("unit_level_label", {
    text: options.levelText || "12",
    attributes: { text: options.levelText || "12" },
    findCounts,
  }));
  const name = root.add(new MockPanel("name", { text: options.nameText || "Enemy", findCounts }));
  const counterAnchor = unitStatus.add(new MockPanel("hp_counter_anchor", { findCounts }));
  const counter = counterAnchor.add(new MockPanel("hp_counter", { findCounts }));
  const killZone = unitStatus.add(new MockPanel("hp_kill_zone_marker", { findCounts }));

  let now = options.now === undefined ? 100000 : options.now;
  let order = 0;
  const scheduled = [];
  const dispatched = [];
  const logs = [];
  const bridgeHandlers = [];
  const shared = {};
  if (options.sharedValues) {
    shared.__hpColorsCfgRaw = JSON.stringify({ values: options.sharedValues });
  }
  const fakeDate = {
    now: () => now,
  };
  const sandbox = {
    Date: fakeDate,
    Math,
    Number,
    String,
    Boolean,
    Object,
    Array,
    JSON,
    RegExp,
    parseInt,
    isFinite,
    console: {
      log: (message) => { logs.push(String(message)); },
      warn: (message) => { logs.push(String(message)); },
      error: (message) => { logs.push(String(message)); },
    },
    GameUI: { CustomUIConfig: () => shared },
    $: {
      GetContextPanel: () => root,
      DispatchEvent: (channel, payload) => { dispatched.push({ channel, payload }); },
      RegisterForUnhandledEvent: (channel, fn) => { bridgeHandlers.push({ channel, fn }); },
      Schedule: (delay, fn) => {
        scheduled.push({ delay, due: now + Number(delay) * 1000, fn, order: order += 1 });
      },
      Msg: (message) => { logs.push(String(message)); },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "hp_colors_minimal/panorama/scripts/healthbar_logic.js" });
  return {
    root,
    unitStatus,
    infoHealth,
    unitHealthbar,
    redParent,
    lagging,
    bg,
    pip,
    ult,
    level,
    name,
    counterAnchor,
    counter,
    killZone,
    findCounts,
    scheduled,
    dispatched,
    logs,
    bridgeHandlers,
    shared,
    get now() { return now; },
    set now(value) { now = value; },
  };
}

function dispatchPresetSnapshot(runtime, values, options = {}) {
  const handler = runtime.bridgeHandlers.find((entry) => entry.channel === "ClientUI_FireOutput");
  assert.ok(handler, "runtime should register ClientUI_FireOutput handler");
  const raw = options.rawOverride || JSON.stringify(values);
  const payload = {
    magic_word: "HP_COLORS_PRESET_SNAPSHOT",
    mod_title: "HP Colors",
    version: 1,
    values_raw: raw,
    values,
  };
  runtime.shared.__hpColorsCfgRaw = options.sharedRawOverride || JSON.stringify({ values });
  handler.fn(options.asString ? JSON.stringify(payload) : payload);
  return payload;
}

function takeNextRuntimeSchedule(runtime) {
  runtime.scheduled.sort((a, b) => a.due - b.due || a.order - b.order);
  return runtime.scheduled.shift() || null;
}

function runNextRuntimeSchedule(runtime) {
  const item = takeNextRuntimeSchedule(runtime);
  assert.ok(item, "expected a scheduled runtime callback");
  runtime.now = item.due;
  item.fn();
  return item;
}

function runRuntimeUntil(runtime, predicate, message, limit = 120) {
  for (let i = 0; i < limit; i += 1) {
    if (predicate()) return;
    runNextRuntimeSchedule(runtime);
  }
  assert.ok(predicate(), message);
}

function runRuntimeFor(runtime, maxElapsedMs, limit = 200) {
  const end = runtime.now + maxElapsedMs;
  for (let i = 0; i < limit && runtime.scheduled.length; i += 1) {
    runtime.scheduled.sort((a, b) => a.due - b.due || a.order - b.order);
    if (runtime.scheduled[0].due > end) break;
    runNextRuntimeSchedule(runtime);
  }
  runtime.now = end;
}

test("minimal folder keeps only expected production runtime files", () => {
  const report = getValidationReport();
  assert.deepEqual(report.errors, []);
  assert.equal(report.defaultKeys.length, 49);
});

test("minimal runtime function budget stays bounded", () => {
  const report = getValidationReport();
  assert.equal(report.errors.length, 0);
  assert.ok(report.functionCounts.healthbar <= 115);
  assert.ok(report.functionCounts.publisher <= 62);
});

test("runtime source uses only verified unit-status ids", () => {
  const healthbar = fs.readFileSync(path.join(ROOT, "panorama/scripts/healthbar_logic.js"), "utf8");
  const allowed = new Set([
    "UnitStatus",
    "InfoHealthContainer",
    "UnitHealthbarContainer",
    "unit_healthbar_lagging",
    "unit_healthbar_bg",
    "unit_healthbar_pip_label",
    "unit_ult_ready_icon",
    "unit_level_label",
    "name",
    "hp_counter",
    "hp_counter_anchor",
    "hp_kill_zone_marker",
  ]);
  const directIds = Array.from(healthbar.matchAll(/FindChildTraverse\(\s*(["'])(.*?)\1\s*\)/g), (m) => m[2]);
  const constantIds = Array.from(healthbar.matchAll(/var\s+ID_[A-Z0-9_]+\s*=\s*(["'])(.*?)\1/g), (m) => m[2]);
  for (const id of [...directIds, ...constantIds]) assert.ok(allowed.has(id), `unverified panel id: ${id}`);
  for (const id of ["health_bar", "unit_health", "ult_icon"]) {
    assert.doesNotMatch(healthbar, new RegExp(`(["'])${id}\\1`));
  }
  for (const id of allowed) {
    if (id === "hp_counter" || id === "hp_counter_anchor" || id === "hp_kill_zone_marker") continue;
    assert.match(healthbar, new RegExp(`var\\s+ID_[A-Z0-9_]+\\s*=\\s*(["'])${id}\\1`), `missing ID constant for ${id}`);
  }
});

test("runtime scheduler ignores stale callbacks after stop", () => {
  const runtime = runRuntime({
    sharedValues: makeRuntimeValues({ hp_enabled: true }),
    barWidth: 82,
    parentWidth: 100,
  });
  const stale = takeNextRuntimeSchedule(runtime);
  assert.ok(stale, "expected initial enemy schedule");
  dispatchPresetSnapshot(runtime, makeRuntimeValues({ hp_enabled: false }));
  const scheduledAfterStop = runtime.scheduled.length;
  const writesAfterStop = runtime.lagging.styleWrites.length;
  stale.fn();
  assert.equal(runtime.lagging.styleWrites.length, writesAfterStop);
  assert.equal(runtime.scheduled.length, scheduledAfterStop);
  dispatchPresetSnapshot(runtime, makeRuntimeValues({ hp_enabled: true }));
  assert.ok(runtime.scheduled.some((item) => item.delay <= 0.05), "reenabling should schedule a fresh enemy callback");
});

test("runtime paints confirmed enemy red before preset then preset high color", () => {
  const runtime = runRuntime({ barWidth: 100, parentWidth: 100 });
  runNextRuntimeSchedule(runtime);
  assert.equal(normalizeColor(runtime.lagging.style.washColor), "#e16161");

  runtime.lagging.actuallayoutwidth = 82;
  runtime.redParent.actuallayoutwidth = 100;
  dispatchPresetSnapshot(runtime, makeRuntimeValues({
    hp_enabled: true,
    hp_color_high: "#00AA00",
    hp_mode: 0,
    hp_bg_visible: true,
  }));
  runRuntimeUntil(
    runtime,
    () => normalizeColor(runtime.lagging.style.washColor) === "#00aa00",
    "enemy bar should receive preset high color",
  );
});

test("runtime pulse starts and clears with threshold changes", () => {
  const runtime = runRuntime({
    barWidth: 20,
    parentWidth: 100,
    sharedValues: makeRuntimeValues({
      hp_enabled: true,
      hp_pulse_enabled: true,
      hp_pulse_threshold: 25,
      hp_pulse_bpm: 120,
      hp_pulse_intensity: 2,
      hp_pulse_text_enabled: true,
      hp_counter_visible: true,
      hp_counter_format: 1,
    }),
  });
  runRuntimeUntil(runtime, () => runtime.lagging.classes.includes("low_hp_pulsing"), "low HP pulse should start");
  assert.ok(runtime.lagging.classes.includes("pulse_intense"));
  assert.ok(runtime.ult.classes.includes("low_hp_pulsing"));
  assert.equal(runtime.lagging.style.animationDuration, "0.500s");
  assert.equal(runtime.ult.style.animationDuration, "0.500s");
  assert.notEqual(runtime.counter.style.brightness, "");
  assert.ok(runtime.counter.style.brightness);

  runtime.lagging.actuallayoutwidth = 80;
  runRuntimeUntil(runtime, () => !runtime.lagging.classes.includes("low_hp_pulsing"), "pulse should clear above threshold");
  assert.equal(runtime.lagging.style.animationDuration, "");
  assert.equal(runtime.counter.style.brightness, "");
});

test("runtime ally color resets to friendly defaults", () => {
  const friendValues = makeRuntimeValues({
    hp_enabled: false,
    hp_friend_enabled: true,
    hp_friend_color_low: "#112233",
    hp_friend_color_mid: "#445566",
    hp_friend_color_high: "#778899",
    hp_friend_pulse_enabled: false,
  });
  const runtime = runRuntime({
    unitStatusClasses: ["friend", "team1"],
    barWidth: 20,
    parentWidth: 100,
    sharedValues: friendValues,
  });
  runRuntimeUntil(runtime, () => normalizeColor(runtime.lagging.style.washColor) === "#112233", "ally low color should apply");
  dispatchPresetSnapshot(runtime, makeRuntimeValues({ hp_enabled: false, hp_friend_enabled: false }));
  assert.equal(normalizeColor(runtime.lagging.style.washColor), "#ffefd7");

  const buildingRuntime = runRuntime({
    unitStatusClasses: ["friend", "team1", "building"],
    barWidth: 20,
    parentWidth: 100,
    sharedValues: friendValues,
  });
  runRuntimeUntil(buildingRuntime, () => normalizeColor(buildingRuntime.lagging.style.washColor) === "#112233", "building ally low color should apply");
  dispatchPresetSnapshot(buildingRuntime, makeRuntimeValues({ hp_enabled: false, hp_friend_enabled: false }));
  assert.equal(normalizeColor(buildingRuntime.lagging.style.washColor), "#ffffff");
});

test("runtime duplicate same-raw replay stays cheap after watchdog when loops remain pending", () => {
  const values = makeRuntimeValues({
    hp_enabled: true,
    hp_friend_enabled: true,
    hp_level_number_visible: true,
  });
  const runtime = runRuntime({
    unitStatusClasses: ["enemy", "team1"],
    barWidth: 82,
    parentWidth: 100,
    sharedValues: values,
    exposeRuntimeTestHooks: true,
  });
  runNextRuntimeSchedule(runtime);
  runNextRuntimeSchedule(runtime);
  runNextRuntimeSchedule(runtime);
  runtime.scheduled.length = 0;

  const beforeStoreFinds = runtime.findCounts.HPColorsPresetStore || 0;
  const raw = runtime.shared.__hpColorsCfgRaw;
  dispatchPresetSnapshot(runtime, values, {
    rawOverride: raw,
    sharedRawOverride: raw,
  });

  const recoveryWakeups = runtime.scheduled.filter((item) => item.delay === 0.01);
  assert.ok(recoveryWakeups.length >= 2, "duplicate snapshot should still wake when replay recovery is needed");
  assert.equal(runtime.findCounts.HPColorsPresetStore || 0, beforeStoreFinds);

  while (runtime.scheduled.some((item) => item.delay === 0.01)) runNextRuntimeSchedule(runtime);
  runtime.unitStatus.classes = ["friend", "team1"];
  runRuntimeFor(runtime, 2500);
  runtime.unitStatus.classes = ["enemy", "team1"];
  runRuntimeFor(runtime, 300);
  const pendingLoopScheduleCount = runtime.scheduled.length;
  assert.ok(pendingLoopScheduleCount > 0, "recovery wakeups should leave enabled loops pending");

  const afterRecoveryRefresh = currentRedBarRefreshState(runtime);
  runtime.now += 5001;
  dispatchPresetSnapshot(runtime, values, {
    rawOverride: raw,
    sharedRawOverride: raw,
  });

  assert.equal(
    runtime.scheduled.length,
    pendingLoopScheduleCount,
    "elapsed same-raw watchdog alone must not schedule another duplicate replay wake",
  );
  assert.equal(
    currentRedBarRefreshState(runtime).currentRbRefreshUntil,
    afterRecoveryRefresh.currentRbRefreshUntil,
    "elapsed same-raw watchdog alone must not reopen current-redbar refresh",
  );
  assert.equal(runtime.findCounts.HPColorsPresetStore || 0, beforeStoreFinds);
});

test("runtime duplicate same-raw replay ignores stale disabled ally generation", () => {
  const values = makeRuntimeValues({
    hp_enabled: true,
    hp_friend_enabled: false,
    hp_level_number_visible: false,
  });
  const runtime = runRuntime({
    unitStatusClasses: ["enemy", "team1"],
    barWidth: 82,
    parentWidth: 100,
    sharedValues: values,
    exposeRuntimeTestHooks: true,
  });
  runNextRuntimeSchedule(runtime);
  runtime.scheduled.length = 0;

  const beforeStoreFinds = runtime.findCounts.HPColorsPresetStore || 0;
  const raw = runtime.shared.__hpColorsCfgRaw;
  dispatchPresetSnapshot(runtime, values, {
    rawOverride: raw,
    sharedRawOverride: raw,
  });

  const recoveryWakeups = runtime.scheduled.filter((item) => item.delay === 0.01);
  assert.ok(recoveryWakeups.length > 0, "first same-raw duplicate should still repaint an unseen panel");
  assert.equal(runtime.findCounts.HPColorsPresetStore || 0, beforeStoreFinds);

  while (runtime.scheduled.some((item) => item.delay === 0.01)) runNextRuntimeSchedule(runtime);
  runRuntimeFor(runtime, 300);
  const pendingLoopScheduleCount = runtime.scheduled.length;
  assert.ok(pendingLoopScheduleCount > 0, "enabled enemy loop should remain pending after replay recovery");

  const afterRecoveryRefresh = currentRedBarRefreshState(runtime);
  runtime.now += 5001;
  dispatchPresetSnapshot(runtime, values, {
    rawOverride: raw,
    sharedRawOverride: raw,
  });

  assert.equal(
    runtime.scheduled.length,
    pendingLoopScheduleCount,
    "disabled ally generation must not make duplicate payload replay hot once enemy replay is current",
  );
  assert.equal(
    currentRedBarRefreshState(runtime).currentRbRefreshUntil,
    afterRecoveryRefresh.currentRbRefreshUntil,
    "disabled ally generation must not reopen current-redbar refresh for duplicate payloads",
  );
  assert.equal(runtime.findCounts.HPColorsPresetStore || 0, beforeStoreFinds);
});

test("runtime coalesces in-window current-redbar refresh probe gates", () => {
  const firstValues = makeRuntimeValues({
    hp_enabled: true,
    hp_color_high: "#00AA00",
  });
  const runtime = runRuntime({
    unitStatusClasses: ["enemy", "team1"],
    barWidth: 82,
    parentWidth: 100,
    sharedValues: firstValues,
    exposeRuntimeTestHooks: true,
  });

  runRuntimeUntil(
    runtime,
    () => {
      const state = currentRedBarRefreshState(runtime);
      return (
        state.currentRbRefreshUntil > state.now &&
        state.nextCurrentRbProbeAt > state.now &&
        state.nextCurrentRbChildProbeAt > state.now
      );
    },
    "current-redbar probe gates should be armed during the startup refresh window",
  );

  const armed = currentRedBarRefreshState(runtime);
  dispatchPresetSnapshot(runtime, makeRuntimeValues({
    hp_enabled: true,
    hp_color_high: "#00BB00",
  }));
  const coalesced = currentRedBarRefreshState(runtime);
  assert.ok(
    coalesced.currentRbRefreshUntil >= armed.currentRbRefreshUntil,
    "in-window refresh requests should keep or extend the refresh window",
  );
  assert.equal(
    coalesced.nextCurrentRbProbeAt,
    armed.nextCurrentRbProbeAt,
    "in-window refresh requests must not reopen the parent-chain probe gate",
  );
  assert.equal(
    coalesced.nextCurrentRbChildProbeAt,
    armed.nextCurrentRbChildProbeAt,
    "in-window refresh requests must not reopen the child-rescan gate",
  );

  dispatchPresetSnapshot(runtime, makeRuntimeValues({
    hp_enabled: true,
    hp_color_high: "#00DD00",
  }));
  const repeated = currentRedBarRefreshState(runtime);
  assert.ok(
    repeated.currentRbRefreshUntil >= coalesced.currentRbRefreshUntil,
    "later in-window refresh requests should keep or extend the refresh window",
  );
  assert.equal(
    repeated.nextCurrentRbProbeAt,
    armed.nextCurrentRbProbeAt,
    "later in-window refresh requests must not reopen the parent-chain probe gate",
  );
  assert.equal(
    repeated.nextCurrentRbChildProbeAt,
    armed.nextCurrentRbChildProbeAt,
    "later in-window refresh requests must not reopen the child-rescan gate",
  );

  runtime.now = repeated.currentRbRefreshUntil + 1;
  dispatchPresetSnapshot(runtime, makeRuntimeValues({
    hp_enabled: true,
    hp_color_high: "#00CC00",
  }));
  const fresh = currentRedBarRefreshState(runtime);
  assert.ok(
    fresh.currentRbRefreshUntil > runtime.now,
    "expired refresh requests should open a fresh refresh window",
  );
  assert.equal(fresh.nextCurrentRbProbeAt, 0, "fresh refresh requests should reopen the parent-chain probe gate");
  assert.equal(fresh.nextCurrentRbChildProbeAt, 0, "fresh refresh requests should reopen the child-rescan gate");
});

test("publisher is silent by default but supports opt-in breadcrumbs", () => {
  const quiet = runPublisher([
    makePresetPanel("HPColorsPreset_001", { hp_color_low: "#111111" }, { heroMode: "all" }),
  ]);
  assert.equal(lastSnapshot(quiet).values.hp_color_low, "#111111");
  assert.deepEqual(quiet.logs, []);

  const debug = runPublisher([
    makePresetPanel("HPColorsPreset_001", { hp_color_low: "#111111" }, { heroMode: "all" }),
  ], { debugPresetSelection: true });
  assert.ok(debug.logs.some((line) => line.includes("[HP_COLORS_MINIMAL_PRESET]")));
});

test("publisher filters preset values to known full ids and compact aliases", () => {
  const result = runPublisher([
    makeRawPresetPanel("HPColorsPreset_001", {
      v: 97,
      c: 1,
      values: { cl: "#111111", cv: true, hp_debug_capture: true },
      hm: "all",
    }),
    makeRawPresetPanel("HPColorsPreset_002", {
      v: 97,
      c: 1,
      values: {
        hp_color_low: "#abcdef",
        cv: false,
        m: 2,
        sb: false,
        fe: true,
        fcl: "#44FF44",
        hp_unknown_runtime_knob: "#BADBAD",
        hp_preset_store_private: true,
      },
      hm: "selected",
      hs: ["hero_haze"],
    }),
  ], { heroClass: "hero_haze" });

  const values = lastSnapshot(result).values;
  assert.equal(values.hp_color_low, "#abcdef");
  assert.equal(values.hp_counter_visible, false);
  assert.equal(values.hp_mode, 2);
  assert.equal(values.hp_skip_buildings, false);
  assert.equal(values.hp_friend_enabled, true);
  assert.equal(values.hp_friend_color_low, "#44FF44");
  assert.equal(Object.prototype.hasOwnProperty.call(values, "hp_unknown_runtime_knob"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(values, "hp_preset_store_private"), false);
});

test("unknown hero waits before global fallback", () => {
  const result = runPublisher([
    makePresetPanel("HPColorsPreset_001", { hp_color_low: "#111111" }, { heroMode: "all" }),
    makePresetPanel("HPColorsPreset_002", { hp_color_low: "#222222" }, { heroMode: "selected", heroes: ["hero_haze"] }),
  ]);

  assert.equal(result.dispatched.length, 0);
  runScheduled(result, result.scheduled.length - 1);
  assert.equal(result.dispatched.length, 0);
  runScheduled(result, result.scheduled.length);
  assert.equal(lastSnapshot(result).values.hp_color_low, "#111111");
});

test("bounded probe corrects fallback when selected hero appears late and then stops", () => {
  const result = runPublisher([
    makePresetPanel("HPColorsPreset_001", { hp_color_low: "#111111", hp_team_colors: true }, { heroMode: "all" }),
    makePresetPanel("HPColorsPreset_002", { hp_color_low: "#222222", hp_team_colors: false }, { heroMode: "selected", heroes: ["hero_gigawatt"] }),
  ]);

  const startupScheduleCount = result.scheduled.length;
  runScheduled(result, startupScheduleCount);
  assert.equal(lastSnapshot(result).values.hp_color_low, "#111111");

  const alive = result.root.add(new MockPanel("gameplay_hud_alive"));
  const crosshair = alive.add(new MockPanel("crosshair"));
  crosshair.add(new MockPanel("progress", { classes: ["hero_gigawatt"] }));

  const beforeProbe = result.scheduled.length;
  runScheduledRange(result, startupScheduleCount, beforeProbe);

  const payload = lastSnapshot(result);
  assert.equal(payload.values.hp_color_low, "#222222");
  assert.equal(payload.values.hp_team_colors, false);
  const publisher = fs.readFileSync(path.join(ROOT, "panorama/scripts/anita_ui_core.js"), "utf8");
  assert.ok(publisher.includes("heroProbeActive = false;"));
  assert.ok(publisher.includes("debugLog(\"probe-stop\""));
});

test("hero selection lock reads the last time chunks and normalizes overflow seconds", () => {
  const locked = runPublisher([
    makePresetPanel("HPColorsPreset_001", { hp_color_low: "#111111", hp_team_colors: true }, { heroMode: "all" }),
    makePresetPanel("HPColorsPreset_002", { hp_color_low: "#222222", hp_team_colors: false }, { heroMode: "selected", heroes: ["hero_haze"] }),
  ], { gameTimeText: "Round 0 00:75" });
  const startupScheduleCount = locked.scheduled.length;
  runScheduled(locked, startupScheduleCount);
  assert.equal(lastSnapshot(locked).values.hp_color_low, "#111111");

  const lockedAlive = locked.root.add(new MockPanel("gameplay_hud_alive"));
  const lockedCrosshair = lockedAlive.add(new MockPanel("crosshair"));
  lockedCrosshair.add(new MockPanel("progress", { classes: ["hero_haze"] }));
  runScheduledRange(locked, startupScheduleCount, locked.scheduled.length);
  assert.equal(lastSnapshot(locked).values.hp_color_low, "#111111");
  assert.equal(lastSnapshot(locked).values.hp_team_colors, true);

  const unlockedAtZero = runPublisher([
    makePresetPanel("HPColorsPreset_001", { hp_color_low: "#111111", hp_team_colors: true }, { heroMode: "all" }),
    makePresetPanel("HPColorsPreset_002", { hp_color_low: "#222222", hp_team_colors: false }, { heroMode: "selected", heroes: ["hero_haze"] }),
  ], { gameTimeText: "Spectator 99 00:60" });
  const zeroStartupScheduleCount = unlockedAtZero.scheduled.length;
  runScheduled(unlockedAtZero, zeroStartupScheduleCount);
  assert.equal(lastSnapshot(unlockedAtZero).values.hp_color_low, "#111111");

  const alive = unlockedAtZero.root.add(new MockPanel("gameplay_hud_alive"));
  const crosshair = alive.add(new MockPanel("crosshair"));
  crosshair.add(new MockPanel("progress", { classes: ["hero_haze"] }));
  runScheduledRange(unlockedAtZero, zeroStartupScheduleCount, unlockedAtZero.scheduled.length);
  assert.equal(lastSnapshot(unlockedAtZero).values.hp_color_low, "#222222");
  assert.equal(lastSnapshot(unlockedAtZero).values.hp_team_colors, false);
});

test("publisher serves request-heated cached replay without rescanning store", () => {
  const result = runPublisher([
    makePresetPanel("HPColorsPreset_001", { hp_color_low: "#111111" }, { heroMode: "all" }),
  ]);
  const first = lastSnapshot(result);
  assert.equal(first.values.hp_color_low, "#111111");

  result.store.children = [makePresetPanel("HPColorsPreset_001", { hp_color_low: "#999999" }, { heroMode: "all" })];
  const findsBeforeCachedReplays = result.findCounts.HPColorsPresetStore || 0;

  result.now += 11000;
  runPublisherReplay(result, result.now);
  assert.equal(nextPublisherReplayDelay(result), 1);
  runPublisherReplay(result, result.now);
  assert.equal(nextPublisherReplayDelay(result), 1);
  runPublisherReplay(result, result.now);
  assert.equal(nextPublisherReplayDelay(result), 1);
  runPublisherReplay(result, result.now);
  assert.equal(nextPublisherReplayDelay(result), 3);
  assert.equal(lastSnapshot(result).values.hp_color_low, "#111111");
  assert.equal(result.findCounts.HPColorsPresetStore || 0, findsBeforeCachedReplays);

  assert.equal(result.bridgeHandlers.length, 1);
  result.bridgeHandlers[0](JSON.stringify({ magic_word: "HP_COLORS_PRESET_REQUEST", mod_title: "HP Colors" }));
  assert.equal(lastSnapshot(result).values.hp_color_low, "#111111");
  assert.equal(result.shared.__hpColorsCfgRaw, first.values_raw);
  const findsBeforeHeatedReplay = result.findCounts.HPColorsPresetStore || 0;

  runPublisherReplay(result, result.now + 4999);
  assert.equal(nextPublisherReplayDelay(result), 1);
  assert.equal(lastSnapshot(result).values.hp_color_low, "#111111");
  assert.equal(result.findCounts.HPColorsPresetStore || 0, findsBeforeHeatedReplay);
});

test("runtime source preserves repaint, classification, and shipped Source 2 selectors", () => {
  const healthbar = fs.readFileSync(path.join(ROOT, "panorama/scripts/healthbar_logic.js"), "utf8");
  const assets = healthbar + fs.readFileSync(path.join(ROOT, "panorama/layout/unit_status_overlay.xml"), "utf8") + fs.readFileSync(path.join(ROOT, "panorama/styles/unit_status.css"), "utf8");

  for (const marker of [
    "function hasEnemyBarStyleDrift",
    "function hasAllyBarStyleDrift",
    "nextAllyStyleDriftCheckAt",
    "if (allyColorChanged && rbA)",
    "function syncEnemyPulse",
    "function syncAllyPulse",
    "function resetAllyState",
    "function applyLayoutSettings",
    "function syncLevelTier",
    "function wakeForPresetReplay",
    "SAME_RAW_WAKE_MIN_MS",
    "SAME_RAW_WAKE_WATCHDOG_MS",
    "wakeForPresetReplay(\"shared_same_raw\")",
    "wakeForPresetReplay(\"event_duplicate_payload\")",
    "wakeForPresetReplay(\"event_store_same_raw\")",
    "wakeForPresetReplay(\"event_payload_same_raw\")",
    "function isEnemyTargetHealthbar",
    "function isFriendlyTargetHealthbar",
    "isConfirmedAllyHealthbar(flags)",
    "function resolveRedBar(mode)",
    "resolveRedBar(\"friend\")",
    "resolveRedBar(\"enemy\")",
    "function invalidateRedBarResolverCache",
    "ID_UNIT_STATUS = \"UnitStatus\"",
    "ID_UNIT_HEALTHBAR_LAGGING = \"unit_healthbar_lagging\"",
    "CLASS_FRIEND = \"friend\"",
  ]) {
    assert.ok(healthbar.includes(marker), `${marker} should be preserved`);
  }
  assert.match(
    assets,
    /#unit_healthbar_lagging\s*\{[\s\S]*?wash-color:\s*TeamEnemyColor\s*;/,
    "bare main bar should match the proven debug first-paint enemy default",
  );
  assert.match(
    assets,
    /\.team_neutral #unit_healthbar_lagging\s*\{[\s\S]*?wash-color:\s*TeamNeutralColor\s*;/,
    "team-neutral class should override the bare enemy default for jungle bars",
  );
  assert.doesNotMatch(
    assets,
    /\.(team1|team2|enemy|friend)\s+#unit_healthbar_bullet_shield/,
    "minimal shield overlay should stay neutral and avoid color blending",
  );
  assert.match(
    assets,
    /#unit_healthbar_tech_shield\s*\{[\s\S]*?wash-color:\s*white\s*;/,
    "tech shield overlay should stay neutral",
  );
  assert.equal(
    healthbar.includes("primeConfirmedEnemyMainBarWash"),
    false,
    "default color should be CSS-only, not a runtime primer",
  );
  assert.doesNotMatch(
    healthbar,
    /function unknownBarLooksLikeHeroTarget|function isUnknownHeroSizedTarget|HERO_FIRST_PAINT_PARENT_MIN_WIDTH|rememberNeutralCandidate|isRecentNeutralCandidate/,
    "production should match the proven debug lane without width/recent-panel heuristics",
  );
  assert.match(
    healthbar,
    /var knownFriendlyTeamId = 0;/,
    "friendly building classification should stay scalar and cache only the known friendly team id",
  );
  assert.match(
    healthbar,
    /function isFriendlyBuildingTarget\(flags\)\s*\{[\s\S]*flags & 4[\s\S]*tid === knownFriendlyTeamId[\s\S]*\}/,
    "friendly buildings should be recognized without per-frame object allocation",
  );
  assert.match(
    healthbar,
    /function isEnemyBuildingTarget\(flags\)\s*\{[\s\S]*flags & 4[\s\S]*!isFriendlyBuildingTarget\(flags\)[\s\S]*\}/,
    "team-assigned non-friendly buildings should be promoted to enemy targets when building skip is off",
  );
  assert.match(
    healthbar,
    /function getIgnoredTargetColor\(\)\s*\{[\s\S]*fl & 1 && !\(fl & 2\)[\s\S]*isEnemyBuildingTarget\(fl\)\) return CSS_TEAM_ENEMY_COLOR;[\s\S]*isFriendlyBuildingTarget\(fl\)\) return WHITE_WASH;[\s\S]*return CSS_TEAM_ENEMY_COLOR;[\s\S]*\}/,
    "ignored fallback should match debug behavior: enemy/unknown red, friendly building white, neutral class green",
  );
  assert.doesNotMatch(
    healthbar,
    /function getDefaultBarColor/,
    "ally reset default color should stay inlined; the old helper carried dead team/neutral branches",
  );
  assert.doesNotMatch(
    healthbar,
    /function (getPulseTextSize|applyPulseTextState|updatePulseTextBrightness|applyPulseDuration|applyPulseIntensity|startPulse|clearPulsePanel|clearAllyPulse|resetAllyBarColor|resetAllyLoopCache|resetAllyScanCache|releaseAllyOwnership|getInfoHealthMarginTopValue|applyInfoHealthMarginTop|getHealthbarHeightPx|applyHealthbarHeight|pLv|fER|sLNV|cLU|uLT)\b/,
    "deleted helper declarations must stay removed",
  );
  assert.match(
    healthbar,
    /var color = flags & 4 \? WHITE_WASH : CSS_TEAM_FRIEND_COLOR;/,
    "ally reset should only keep the confirmed-ally friendly/white-building fallback",
  );
  assert.match(
    healthbar,
    /if \(cfg\.hp_skip_buildings && fl & 4\) \{[\s\S]*resetIgnoredTargetVisuals\(getIgnoredTargetColor\(\)\);[\s\S]*return;[\s\S]*\}/,
    "ignore-buildings should skip all buildings, including enemy buildings, before the preset color path",
  );
  assert.match(
    healthbar,
    /if \(!presetApplied\) \{[\s\S]*sBC\(CSS_TEAM_ENEMY_COLOR\);[\s\S]*scheduleLoop\(LOOP_ENEMY, 0\.05\);[\s\S]*return;[\s\S]*\}/,
    "confirmed enemies should stay enemy red until the user preset snapshot is ready",
  );
  assert.match(
    healthbar,
    /if \(pw <= 0\) \{[\s\S]*sBC\(getHighColor\(\)\);[\s\S]*noParentWidthDelay\(noParentWidthFrames\)/,
    "confirmed enemies should paint the final high/user color before parent width is ready once preset is ready",
  );
  for (const marker of [
    "LevelContainer",
    "hp_counter_anchor",
    "hp_kill_zone_marker",
    "level_number_visible",
    "level_tier",
    "low_hp_pulsing",
    "pulse_",
  ]) {
    assert.ok(assets.includes(marker), `${marker} should be shipped`);
  }
  assert.ok(!healthbar.includes("FindChildTraverse('health_bar')"));
  assert.ok(!healthbar.includes("FindChildTraverse('unit_health')"));
  assert.ok(!healthbar.includes("rbA = fRB();"));
  assert.doesNotMatch(
    healthbar,
    /if\s*\(\s*!allyColorChanged\s*&&\s*staleAllyPanel\s*\)\s*if\s*\(\s*\(\s*allyColorChanged\s*\|\|\s*staleAllyPanel\s*\)/,
    "ally writes must not be nested under stale-panel-only guard",
  );
  assert.doesNotMatch(
    healthbar,
    /if\s*\(\s*presetGeneration\s*&&\s*lastAllyPresetGeneration\s*!==\s*presetGeneration\s*\)\s*if\s*\(\s*aWakeQueued\s*\)/,
    "ally wake guard must remain unconditional",
  );
});

test("production debug and capture gates are default-off with routine log markers removed", () => {
  const report = getValidationReport();
  assert.equal(report.ok, true);
  const publisher = fs.readFileSync(path.join(ROOT, "panorama/scripts/anita_ui_core.js"), "utf8");
  const healthbar = fs.readFileSync(path.join(ROOT, "panorama/scripts/healthbar_logic.js"), "utf8");
  assert.match(healthbar, /var\s+DEBUG_ENABLED\s*=\s*false\s*;/);
  assert.match(healthbar, /var\s+CAPTURE_ENABLED\s*=\s*false\s*;/);
  assert.doesNotMatch(publisher + healthbar, /\[(PROFILE|TIMING|BRIDGE|CFG|APPLY)\]/);
  for (const term of [
    "PERF_SAMPLE_MAGIC",
    "perfSamples",
    "perfTraceRing",
    "PerformanceObserver",
    "runtimePerfHeartbeat",
    "startPerfReporter",
    "recordPerfSample",
    "recordCorePerfSample",
    "perfMaybeDump(",
    "perfRecordScheduleLateness",
    "perfScheduleBucket",
    "perfEnemyScheduleReason",
    "perfCount(",
    "perfStart(",
    "perfEnd(",
    "perfTraceEvent(",
    "CFG_DEBUG",
    "APPLY_DEBUG",
    "debugApplyLog",
    "debugRuntimeConfig",
    "perfLogChunked",
    "perfHashString",
  ]) {
    assert.equal((publisher + healthbar).includes(term), false, `${term} should be absent from production minimal`);
  }
});
