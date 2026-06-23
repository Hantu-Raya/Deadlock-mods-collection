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
    this.classes = options.classes || [];
    this.children = [];
    this.parent = null;
    this.attributes = Object.assign({}, options.attributes || {});
    this.style = {};
  }

  add(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  IsValid() { return true; }
  GetParent() { return this.parent; }
  Children() { return this.children.slice(); }
  BHasClass(name) { return this.classes.includes(name); }
  AddClass(name) { if (!this.classes.includes(name)) this.classes.push(name); }
  RemoveClass(name) { this.classes = this.classes.filter((item) => item !== name); }
  GetAttributeString(name, fallback) {
    if (Object.prototype.hasOwnProperty.call(this.attributes, name)) return this.attributes[name];
    if (name === "text") return this.text || fallback || "";
    if (name === "id") return this.id || fallback || "";
    return fallback || "";
  }
  SetAttributeString(name, value) { this.attributes[name] = String(value); }
  FindChildTraverse(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.FindChildTraverse(id);
      if (found) return found;
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

test("minimal folder keeps only expected production runtime files", () => {
  const report = getValidationReport();
  assert.deepEqual(report.errors, []);
  assert.equal(report.defaultKeys.length, 49);
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
    "function wakeForPresetReplay",
    "SAME_RAW_WAKE_MIN_MS",
    "SAME_RAW_WAKE_WATCHDOG_MS",
    "wakeForPresetReplay(\"shared_same_raw\")",
    "wakeForPresetReplay(\"event_duplicate_payload\")",
    "wakeForPresetReplay(\"event_store_same_raw\")",
    "wakeForPresetReplay(\"event_payload_same_raw\")",
    "function isEnemyTargetHealthbar",
    "function isFriendlyTargetHealthbar",
    "isConfirmedAllyHealthbar(allyFlags)",
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
    "main bar should use enemy red as the zero-JS first-paint default",
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
    /function unknownBarLooksLikeHeroTarget|rememberNeutralCandidate|isRecentNeutralCandidate/,
    "unknown fallback should stay simple and avoid layout-width/recent-panel heuristics",
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
    "team-assigned non-friendly buildings should be promoted to enemy targets",
  );
  assert.match(
    healthbar,
    /function getDefaultBarColor\(teamId, flags\)\s*\{[\s\S]*teamId === knownFriendlyTeamId[\s\S]*WHITE_WASH[\s\S]*\}/,
    "friendly buildings should reset to white, not friend cream",
  );
  assert.match(
    healthbar,
    /function getIgnoredTargetColor\(\)\s*\{[\s\S]*isEnemyBuildingTarget\(fl\)\) return CSS_TEAM_ENEMY_COLOR;[\s\S]*isFriendlyBuildingTarget\(fl\)\) return WHITE_WASH;[\s\S]*return CSS_TEAM_ENEMY_COLOR;[\s\S]*\}/,
    "ignored fallback should keep enemy/unknown bars red and friendly buildings white",
  );
  assert.match(
    healthbar,
    /if \(cfg\.hp_skip_buildings && fl & 4\) \{[\s\S]*resetIgnoredTargetVisuals\(getIgnoredTargetColor\(\)\);[\s\S]*return;[\s\S]*\}/,
    "ignore-buildings should skip all buildings, including enemy buildings, before the preset color path",
  );
  assert.doesNotMatch(
    healthbar,
    /if \(cfg\.hp_skip_buildings && fl & 4 && !isEnemy\)/,
    "enemy buildings must not bypass the ignore-buildings branch",
  );
  assert.match(
    healthbar,
    /if \(!presetApplied\) \{[\s\S]*sBC\(CSS_TEAM_ENEMY_COLOR\);[\s\S]*scheduleEnemyLoop\(0\.05\);[\s\S]*return;[\s\S]*\}/,
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
  assert.match(healthbar, /var\s+COLOR_DEBUG_ENABLED\s*=\s*true\s*;/);
  assert.ok(healthbar.includes("[HP_COLOR_DEBUG]"));
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
