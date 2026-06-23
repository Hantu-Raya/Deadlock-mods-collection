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
  const root = new MockPanel("Root");
  const context = root.add(new MockPanel("Context"));
  const store = root.add(new MockPanel("HPColorsPresetStore"));
  for (const entry of entries) store.add(entry);

  if (options.heroClass) {
    const alive = root.add(new MockPanel("gameplay_hud_alive"));
    const crosshair = alive.add(new MockPanel("crosshair"));
    crosshair.add(new MockPanel("progress", { classes: [options.heroClass] }));
  }

  const scheduled = [];
  const dispatched = [];
  const logs = [];
  const bridgeHandlers = [];
  const shared = {};
  if (options.debugPresetSelection) shared.__hpColorsPresetDebug = true;
  const sandbox = {
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
      Schedule: (delay, fn) => { scheduled.push({ delay, fn }); },
      Msg: (message) => { logs.push(String(message)); },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "hp_colors_minimal/panorama/scripts/anita_ui_core.js" });
  return { root, scheduled, dispatched, shared, logs, bridgeHandlers };
}

function runScheduled(result, count = result.scheduled.length) {
  for (let i = 0; i < count && i < result.scheduled.length; i += 1) result.scheduled[i].fn();
}

function runScheduledRange(result, start, end = result.scheduled.length) {
  const limit = Math.min(end, result.scheduled.length);
  for (let i = start; i < limit; i += 1) result.scheduled[i].fn();
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

function runRuntime(options = {}) {
  const source = fs.readFileSync(path.join(ROOT, "panorama/scripts/healthbar_logic.js"), "utf8");
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

test("runtime duplicate snapshot wakes stopped pending loops", () => {
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
  });
  runNextRuntimeSchedule(runtime);
  runNextRuntimeSchedule(runtime);
  runNextRuntimeSchedule(runtime);
  runtime.scheduled.length = 0;
  const beforeStoreFinds = runtime.findCounts.HPColorsPresetStore || 0;
  dispatchPresetSnapshot(runtime, values, {
    rawOverride: runtime.shared.__hpColorsCfgRaw,
    sharedRawOverride: runtime.shared.__hpColorsCfgRaw,
  });
  const wakeups = runtime.scheduled.filter((item) => item.delay === 0.01);
  assert.ok(wakeups.length >= 2, "duplicate snapshot should schedule immediate wakeups");
  assert.equal(runtime.findCounts.HPColorsPresetStore || 0, beforeStoreFinds);
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

test("compact aliases expand and selected hero scoped preset wins", () => {
  const result = runPublisher([
    makeRawPresetPanel("HPColorsPreset_001", {
      v: 97,
      c: 1,
      values: { cl: "#111111", cv: true, fe: false },
      hm: "all",
    }),
    makeRawPresetPanel("HPColorsPreset_002", {
      v: 97,
      c: 1,
      values: { cl: "#abcdef", cv: false, m: 2, sb: false, fe: true, fcl: "#44FF44" },
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

test("minimal hero selection hard-locks after ten seconds", () => {
  const publisher = fs.readFileSync(path.join(ROOT, "panorama/scripts/anita_ui_core.js"), "utf8");
  assert.match(publisher, /var HERO_SELECTION_LOCK_GAME_TIME_SEC = 10;/);
  assert.match(publisher, /var heroSelectionLocked = false;/);
  assert.match(publisher, /function lockHeroSelectionIfReady\(\)[\s\S]*readGameTimeSec\(\)[\s\S]*heroSelectionLocked = true;[\s\S]*heroProbeActive = false;/);
  assert.doesNotMatch(
    publisher,
    /heroSelectionLocked \|\| !lastSelectionPresetId \|\| !lastSelectionHeroId/,
    "minimal hard lock must also lock global/startup fallbacks that have no detected hero id",
  );
  assert.match(
    publisher,
    /heroLockHeroId = lastSelectionHeroId \|\| "";/,
    "minimal hard lock should store an empty hero id for locked global fallbacks",
  );
  assert.match(publisher, /if \(heroSelectionLocked && heroLockPresetId\)[\s\S]*locked-hero-selection/);
  assert.match(publisher, /if \(heroSelectionLocked \|\| lockHeroSelectionIfReady\(\)\)[\s\S]*heroProbeActive = false;[\s\S]*return;/);
  assert.doesNotMatch(publisher, /lock-set|lock-reset|HP_HERO_DEBUG|hpHeroDebug/);
});

test("publisher serves late replay and requests from cached snapshot without rescanning store", () => {
  const result = runPublisher([
    makePresetPanel("HPColorsPreset_001", { hp_color_low: "#111111" }, { heroMode: "all" }),
  ]);
  const first = lastSnapshot(result);
  assert.equal(first.values.hp_color_low, "#111111");

  const store = result.root.FindChildTraverse("HPColorsPresetStore");
  store.children = [makePresetPanel("HPColorsPreset_001", { hp_color_low: "#999999" }, { heroMode: "all" })];

  const replay = result.scheduled.find((item) => item.delay === 1);
  assert.ok(replay, "expected hot cached replay");
  replay.fn();
  assert.equal(lastSnapshot(result).values.hp_color_low, "#111111");

  assert.equal(result.bridgeHandlers.length, 1);
  result.bridgeHandlers[0](JSON.stringify({ magic_word: "HP_COLORS_PRESET_REQUEST", mod_title: "HP Colors" }));
  assert.equal(lastSnapshot(result).values.hp_color_low, "#111111");
  assert.equal(result.shared.__hpColorsCfgRaw, first.values_raw);
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
