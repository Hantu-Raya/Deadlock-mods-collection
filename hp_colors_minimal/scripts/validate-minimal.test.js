const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  MockPanel,
  createPanoramaHarness,
  createVmContext,
  runInVm,
  createPresetEntryPanel,
  installPresetStore,
  installHeroProgressTree,
  installGameTimeTree,
  buildUnitStatusTree,
  getStyleWriteCount,
  assertObjectFields,
  dispatchClientUiPayload,
} = require("../../scripts/hp-colors-panorama-test-adapter.js");

const { getValidationReport } = require("./validate-minimal.js");
const { FULL_ONLY_SETTING_IDS } = require("../../scripts/hp-colors-validator-contract.js");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SOURCE_ROOT = ROOT;
const CLOSURE_SOURCE_ROOT = process.env.HP_COLORS_MINIMAL_SOURCE_ROOT
  ? path.resolve(process.env.HP_COLORS_MINIMAL_SOURCE_ROOT)
  : "";

function sourceFilePath(sourceRoot, relativePath) {
  return path.join(sourceRoot || DEFAULT_SOURCE_ROOT, relativePath);
}
const SHARED_RUNTIME_COLOR_SETTING_IDS = Object.freeze([
  "hp_heal_color",
  "hp_delta_color",
  "hp_bullet_shield_color",
  "hp_friend_heal_color",
  "hp_friend_delta_color",
  "hp_friend_bullet_shield_color",
]);

function makePresetPanel(id, values, extra = {}) {
  const preset = { version: 1, name: extra.name || id, values };
  if (extra.heroMode !== undefined) preset.heroMode = extra.heroMode;
  if (extra.heroes !== undefined) preset.heroes = extra.heroes;
  if (extra.overrides !== undefined) preset.o = extra.overrides;
  return createPresetEntryPanel(id, preset);
}

function makeRawPresetPanel(id, preset) {
  return createPresetEntryPanel(id, preset);
}
function installSignatureTree(harness, tiers = {}, options = {}) {
  const hud = harness.root.add(new MockPanel("hud_signature"));
  const abilities = options.nested ? hud.add(new MockPanel("signature_abilities")) : hud;
  const slots = [];
  for (let slot = 1; slot <= 4; slot += 1) {
    const tier = tiers[slot] === undefined ? -1 : tiers[slot];
    const panel = abilities.add(new MockPanel(`slot_signature_${slot}`, {
      classes: tier >= 0 ? [`Tier${tier}`] : [],
    }));
    slots.push(panel);
  }
  return { hud, abilities, slots };
}


function runPublisher(entries, options = {}) {
  const source = fs.readFileSync(
    options.sourcePath || sourceFilePath(options.sourceRoot, "panorama/scripts/anita_ui_core.js"),
    "utf8",
  );
  const dispatched = [];
  const harness = createPanoramaHarness({ now: options.now === undefined ? 100000 : options.now, contextPanel: "child" });
  const store = installPresetStore(harness, entries);
  let qolHud = null;
  if (options.qolConfig) {
    qolHud = harness.root.add(new MockPanel("Hud"));
    const rootConfig = options.qolRootConfig || options.qolConfig;
    harness.root.SetAttributeString("Deadlock_Mod_Settings_v1", JSON.stringify(rootConfig));
    harness.root.SetAttributeString("QOL_USER_EDIT_REV", String(options.qolRootRevision || 1));
    qolHud.SetAttributeString("Deadlock_Mod_Settings_v1", JSON.stringify(options.qolConfig));
    qolHud.SetAttributeString("QOL_USER_EDIT_REV", String(options.qolRevision || 1));
  }
  const signature = options.signatureTiers
    ? installSignatureTree(harness, options.signatureTiers, {
        nested: Boolean(options.nestedSignature),
      })
    : null;
  const heroProgress = options.heroClass ? installHeroProgressTree(harness, options.heroClass) : null;
  const gameTimePanel = options.gameTimeText !== undefined ? installGameTimeTree(harness, options.gameTimeText, { id: "GameTimeLabel" }) : null;
  harness.$.DispatchEvent = (_channel, payload) => { dispatched.push(JSON.parse(payload)); return true; };
  harness.$.DispatchEventAsync = harness.$.DispatchEvent;
  const context = createVmContext(harness, { console: {
    log: (message) => { harness.logs.push(String(message)); },
    warn: (message) => { harness.logs.push(String(message)); },
    error: (message) => { harness.logs.push(String(message)); },
  } });
  runInVm(source, context, "hp_colors_minimal/panorama/scripts/anita_ui_core.js");
  return {
    root: harness.root,
    signature,
    heroProgress,
    store,
    gameTimePanel,
    qolHud,
    findCounts: harness.findCounts,
    scheduled: harness.scheduler.jobs,
    dispatched,
    shared: harness.shared,
    logs: harness.logs,
    bridgeHandlers: harness.handlerEntries.map((entry) => entry.fn),
    scheduler: harness.scheduler,
    harness,
    get now() { return harness.now; },
    set now(value) { harness.now = value; },
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
  return result.scheduler.takeByFunctionName("replayCachedSnapshot");
}

function runSignatureScan(result) {
  const scan = result.scheduler.takeByFunctionName("signatureTierPoll");
  result.now = scan.due;
  scan.fn();
  return scan;
}

function nextPublisherReplayDelay(result) {
  return result.scheduler.nextDelayByFunctionName("replayCachedSnapshot");
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
        copyTargetSnapshot: function (snapshot) {
          return {
            teamId: snapshot.teamId,
            flags: snapshot.flags,
            isEnemy: snapshot.isEnemy,
            isNeutral: snapshot.isNeutral,
            isBuilding: snapshot.isBuilding,
            isFriendly: snapshot.isFriendly,
            isFriendlyBuilding: snapshot.isFriendlyBuilding,
            isEnemyBuilding: snapshot.isEnemyBuilding,
            isAlly: snapshot.isAlly,
            ignoredColor: snapshot.ignoredColor,
            barWidth: snapshot.barWidth,
            parentWidth: snapshot.parentWidth,
            replacedRedBar: snapshot.replacedRedBar,
          };
        },
        classifyTarget: function (teamId, flags) {
          var snapshot = {};
          UnitStatusTargetClassifier.fillSnapshot(rb, cp, teamId, flags, snapshot);
          return this.copyTargetSnapshot(snapshot);
        },
        getCurrentRedBarRefreshState: function () {
          return {
            now: _ts(),
            currentRbRefreshUntil: currentRbRefreshUntil,
            nextCurrentRbProbeAt: nextCurrentRbProbeAt,
            nextCurrentRbChildProbeAt: nextCurrentRbChildProbeAt,
          };
        },
        setEnemyBarColor: function (color) {
          UnitStatusOverlayAdapter.setEnemyBarColor(color);
        },
        setBarVisible: function (visible) {
          UnitStatusOverlayAdapter.setBarVisible(visible);
        },
        hasEnemyBarStyleDrift: function () {
          return UnitStatusOverlayAdapter.hasEnemyBarStyleDrift();
        },
        applyValues: function (values) {
          values = values || {};
          for (var key in values) {
            if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) cfg[key] = coerceCfgValue(key, values[key]);
          }
          refreshDerivedConfig();
        },
        readoutPlan: function (values, args) {
          this.applyValues(values);
          args = args || {};
          return HpReadoutPolicy.enemy(
            args.hp || 0,
            args.pulsePlan || { shouldPulse: false, textEnabled: false },
            Boolean(args.hasPipPanel),
            args.pipText || "",
            Boolean(args.hasCounterPanels),
            args.liveBarWidth || 0,
            args.liveBarParentWidth || 0,
            {
              hasPipVisible: false,
              pipVisible: "",
              counterAction: 0,
              current: 0,
              max: 0,
              lowMode: false,
            }
          );
        },
        enemyPulsePlan: function (values, shouldPulse, now) {
          this.applyValues(values);
          return LowHpPulsePolicy.enemy(Boolean(shouldPulse), now || 0, {
            shouldPulse: false,
            start: false,
            stop: false,
            duration: "",
            intensityIndex: -1,
            textEnabled: false,
            textBrightness: "",
            resetText: false,
            fastSchedule: false,
          });
        },
        enemyPaintPlan: function (values, args) {
          this.applyValues(values);
          args = args || {};
          var oldPanelBornAt = panelBornAt;
          if (Object.prototype.hasOwnProperty.call(args, "panelBornAt")) panelBornAt = args.panelBornAt;
          var plan = HealthStatePaintPlan.enemy(
            args.hp || 0,
            Object.prototype.hasOwnProperty.call(args, "prevHp") ? args.prevHp : -1,
            args.now || 0,
            Boolean(args.shouldPulse),
            {
              barVisible: false,
              barColor: "",
              textColor: "",
              clearPulse: false,
              stopAfterApply: false,
              nextDelay: 0.15,
            }
          );
          panelBornAt = oldPanelBornAt;
          return plan;
        },
        levelParse: function (text) {
          return LevelTierPolicy.parse(text || "");
        },
        levelClassFor: function (level) {
          return LevelTierPolicy.classFor(level || 0);
        },
        enemyLoopDecision: function (target, state, now) {
          target = target || {};
          state = state || {};
          var decision = EnemyHealthbarLoopPolicy.decide(target, now || 1000, state, { action: 0, delay: 0, reason: "", hp: 0, shouldPulse: false, pulseFast: false, friendNonEnemy: false });
          return { action: decision.action, delay: decision.delay, reason: decision.reason, hp: decision.hp, shouldPulse: decision.shouldPulse, friendNonEnemy: decision.friendNonEnemy };
        },
        replayWakeDecision: function (reason, state) {
          return ReplayWakePolicy.shouldWakeSameRaw(reason || "preset_same_raw", state || {});
        },
        cacheProbeState: function () {
          return { attempts: att, nextAt: nextCacheProbeAt, delay: cacheProbeLoopDelay(_ts()) };
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

function runtimeHooks(runtime) {
  const hooks = runtime.shared.__hpColorsRuntimeTestHooks;
  assert.ok(hooks, "runtime test hooks should be exposed");
  return hooks;
}

function assertTargetSnapshot(snapshot, expected, label) {
  assertObjectFields(snapshot, expected, label);
}

function runRuntime(options = {}) {
  let source = fs.readFileSync(
    options.sourcePath || sourceFilePath(options.sourceRoot, "panorama/scripts/healthbar_logic.js"),
    "utf8",
  );
  if (options.exposeRuntimeTestHooks) source = exposeRuntimeTestHooks(source);
  const dispatched = [];
  const harness = createPanoramaHarness({ now: options.now === undefined ? 100000 : options.now });
  const tree = buildUnitStatusTree(harness, {
    unitStatusClasses: options.unitStatusClasses || ["enemy", "team1"],
    barWidth: options.barWidth === undefined ? 100 : options.barWidth,
    parentWidth: options.parentWidth === undefined ? 100 : options.parentWidth,
    pipText: options.pipText || "100",
    levelText: options.levelText || "12",
    nameText: options.nameText || "Enemy",
  });
  if (options.sharedValues) harness.shared.__hpColorsCfgRaw = JSON.stringify({ values: options.sharedValues });
  if (options.sharedRaw !== undefined) harness.shared.__hpColorsCfgRaw = options.sharedRaw;
  if (options.rootRaw !== undefined) harness.root.SetAttributeString("hp_colors_minimal_cfg_raw", options.rootRaw);
  harness.$.DispatchEvent = (channel, payload) => { dispatched.push({ channel, payload }); return true; };
  harness.$.DispatchEventAsync = harness.$.DispatchEvent;
  const context = createVmContext(harness, { console: {
    log: (message) => { harness.logs.push(String(message)); },
    warn: (message) => { harness.logs.push(String(message)); },
    error: (message) => { harness.logs.push(String(message)); },
  } });
  runInVm(source, context, "hp_colors_minimal/panorama/scripts/healthbar_logic.js");
  return Object.assign({
    findCounts: harness.findCounts,
    scheduled: harness.scheduler.jobs,
    dispatched,
    logs: harness.logs,
    bridgeHandlers: harness.handlerEntries,
    shared: harness.shared,
    scheduler: harness.scheduler,
    harness,
    get now() { return harness.now; },
    set now(value) { harness.now = value; },
  }, tree);
}

function dispatchPresetSnapshot(runtime, values, options = {}) {
  const raw = options.rawOverride || JSON.stringify(values);
  const payload = {
    magic_word: "HP_COLORS_PRESET_SNAPSHOT",
    mod_title: options.modTitle === undefined ? "HP Colors" : options.modTitle,
    version: 1,
    values,
  };
  if (!options.omitRaw) payload.values_raw = raw;
  if (!options.noSharedWrite) {
    runtime.shared.__hpColorsCfgRaw = Object.prototype.hasOwnProperty.call(options, "sharedRawOverride")
      ? options.sharedRawOverride
      : JSON.stringify({ values });
  }
  if (!options.noRootWrite) {
    runtime.root.SetAttributeString(
      "hp_colors_minimal_cfg_raw",
      Object.prototype.hasOwnProperty.call(options, "rootRawOverride")
        ? options.rootRawOverride
        : raw,
    );
  }
  dispatchClientUiPayload(runtime.harness, payload, { asString: options.asString !== false });
  return payload;
}

function takeNextRuntimeSchedule(runtime) {
  return runtime.scheduler.takeNext();
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
  assert.equal(report.defaultKeys.length, 56);
});

test("minimal publisher forbids full Anita preset builder modules", () => {
  const source = fs.readFileSync(path.join(ROOT, "panorama/scripts/anita_ui_core.js"), "utf8");
  for (const marker of [
    "HPPresetBuilderModel",
    "HPPresetBuilderActions",
    "AnitaPresetBuilderPanel",
    "__anitaUserPresetRows",
    "__anitaPresetPriorityOrder",
    "__anitaPresetNameOverrides",
    "AnitaUI.Register",
  ]) {
    assert.equal(source.includes(marker), false, `minimal publisher leaked ${marker}`);
  }
});

test("minimal publisher neutralizes QOLLOCK player-health customization", () => {
  const customHealth = {
    schema: "3.1.9",
    data: {
      HEALTHBAR_TYPE: 5,
      ENABLE_MINIMALIST_HEALTHBAR: 1,
      ENABLE_FG_HEALTHBAR: 1,
      ENABLE_MINECRAFT_HEALTH_NUMBERS: 1,
      MINIMALIST_HEALTHBAR_X_OFFSET: 45,
      MINIMALIST_HEALTHBAR_Y_OFFSET: -30,
      PLAYER_HEALTHBAR_SCALE: 140,
      PLAYER_HEALTHBAR_OPACITY: 0.5,
      PLAYER_HEALTHBAR_X_OFFSET: 100,
      PLAYER_HEALTHBAR_Y_OFFSET: -200,
      PLAYER_HEALTHBAR_ACCENT_COLOR: 8,
      ENABLE_COMBAT_INDICATOR: 1,
      ENABLE_COLORED_HEALTHBAR: 1,
      ENABLE_COLOR_WARNING_25: 1,
      ENABLE_COLOR_WARNING_65: 1,
      ENABLE_COLOR_WARNING_75: 1,
      ENABLE_TOPBAR_ENEMY_HP_WARNING_75: 1,
      UNRELATED_SETTING: 42,
    },
  };
  const result = runPublisher(
    [makePresetPanel("HPColorsPreset_001", { hp_enabled: true })],
    {
      qolConfig: customHealth,
      qolRevision: 7,
      qolRootConfig: { schema: "3.1.9", data: { HEALTHBAR_TYPE: 1 } },
      qolRootRevision: 5,
    },
  );

  for (const panel of [result.root, result.qolHud]) {
    const stored = JSON.parse(
      panel.GetAttributeString("Deadlock_Mod_Settings_v1", ""),
    );
    assert.equal(stored.data.HEALTHBAR_TYPE, 0);
    assert.equal(stored.data.ENABLE_MINIMALIST_HEALTHBAR, 0);
    assert.equal(stored.data.ENABLE_FG_HEALTHBAR, 0);
    assert.equal(stored.data.ENABLE_MINECRAFT_HEALTH_NUMBERS, 0);
    assert.equal(stored.data.PLAYER_HEALTHBAR_SCALE, 100);
    assert.equal(stored.data.PLAYER_HEALTHBAR_OPACITY, 1);
    assert.equal(stored.data.PLAYER_HEALTHBAR_X_OFFSET, 0);
    assert.equal(stored.data.PLAYER_HEALTHBAR_Y_OFFSET, 0);
    assert.equal(stored.data.PLAYER_HEALTHBAR_ACCENT_COLOR, 0);
    assert.equal(stored.data.ENABLE_COMBAT_INDICATOR, 0);
    assert.equal(stored.data.ENABLE_COLORED_HEALTHBAR, 0);
    assert.equal(stored.data.ENABLE_COLOR_WARNING_25, 0);
    assert.equal(stored.data.ENABLE_COLOR_WARNING_65, 0);
    assert.equal(stored.data.ENABLE_COLOR_WARNING_75, 0);
    assert.equal(stored.data.ENABLE_TOPBAR_ENEMY_HP_WARNING_75, 1);
    assert.equal(stored.data.UNRELATED_SETTING, 42);
    assert.equal(panel.GetAttributeString("QOL_USER_EDIT_REV", ""), "8");
  }

  const reenabled = JSON.parse(JSON.stringify(customHealth));
  result.qolHud.SetAttributeString(
    "Deadlock_Mod_Settings_v1",
    JSON.stringify(reenabled),
  );
  result.qolHud.SetAttributeString("QOL_USER_EDIT_REV", "9");
  takePublisherReplaySchedule(result).fn();
  const replayed = JSON.parse(
    result.qolHud.GetAttributeString("Deadlock_Mod_Settings_v1", ""),
  );
  assert.equal(replayed.data.HEALTHBAR_TYPE, 0);
  assert.equal(replayed.data.ENABLE_COLORED_HEALTHBAR, 0);
  assert.equal(result.qolHud.GetAttributeString("QOL_USER_EDIT_REV", ""), "10");
});

test("minimal lane contract metadata exposes full and projected setting ids", () => {
  const report = getValidationReport();
  assert.deepEqual(report.errors, []);
  assert.equal(report.laneContract.fullCount, 56);
  assert.equal(report.laneContract.minimalCount, 56);
  assert.deepEqual(report.laneContract.fullOnlySettingIds, []);
  assert.deepEqual(FULL_ONLY_SETTING_IDS, []);
  assert.equal(report.laneContract.expectedMinimalIds.length, 56);
  for (const id of SHARED_RUNTIME_COLOR_SETTING_IDS) {
    assert.equal(report.defaultKeys.includes(id), true, `${id} is present in live minimal DEFAULTS`);
    assert.equal(report.laneContract.expectedMinimalIds.includes(id), true, `${id} is part of the live minimal projection`);
  }
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
    "unit_healthbar_healing",
    "unit_healthbar_delta",
    "unit_healthbar_bullet_shield",
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

test("runtime classifier drives building, neutral, and non-enemy behavior", () => {
  const classifierRuntime = runRuntime({
    exposeRuntimeTestHooks: true,
    sharedValues: makeRuntimeValues({ hp_enabled: true, hp_skip_buildings: true }),
  });
  const hooks = runtimeHooks(classifierRuntime);
  assertTargetSnapshot(
    hooks.classifyTarget(2, 4),
    {
      teamId: 2,
      flags: 4,
      isEnemy: true,
      isBuilding: true,
      isEnemyBuilding: true,
      isFriendlyBuilding: false,
      ignoredColor: "#E16161",
    },
    "enemy building target",
  );
  assertTargetSnapshot(
    hooks.classifyTarget(1, 12),
    {
      teamId: 1,
      flags: 12,
      isEnemy: false,
      isBuilding: true,
      isFriendly: true,
      isFriendlyBuilding: true,
      isAlly: true,
      ignoredColor: "#ffffff",
    },
    "friendly building target",
  );
  assertTargetSnapshot(
    hooks.classifyTarget(0, 2),
    {
      teamId: 0,
      flags: 2,
      isEnemy: false,
      isNeutral: true,
      isBuilding: false,
      ignoredColor: "#5BEFB5",
    },
    "neutral target",
  );
  assertTargetSnapshot(
    hooks.classifyTarget(0, 0),
    {
      teamId: 0,
      flags: 0,
      isEnemy: false,
      isNeutral: false,
      isBuilding: false,
      ignoredColor: "#E16161",
    },
    "unknown non-enemy target",
  );

  const buildingRuntime = runRuntime({
    unitStatusClasses: ["enemy", "team2", "building"],
    barWidth: 82,
    parentWidth: 100,
    sharedValues: makeRuntimeValues({
      hp_enabled: true,
      hp_skip_buildings: true,
      hp_mode: 0,
      hp_color_high: "#00AA00",
      hp_counter_visible: false,
    }),
  });
  runRuntimeFor(buildingRuntime, 1000);
  assert.notEqual(
    normalizeColor(buildingRuntime.lagging.style.washColor),
    "#00aa00",
    "enemy buildings skipped by settings must not receive user health colors",
  );

  const neutralRuntime = runRuntime({
    unitStatusClasses: ["enemy", "team_neutral"],
    barWidth: 82,
    parentWidth: 100,
    sharedValues: makeRuntimeValues({
      hp_enabled: true,
      hp_mode: 0,
      hp_color_high: "#00AA00",
      hp_counter_visible: false,
    }),
  });
  runRuntimeUntil(
    neutralRuntime,
    () => normalizeColor(neutralRuntime.lagging.style.washColor) === "#5befb5",
    "neutral targets should paint the neutral ignored color instead of user colors",
  );
  const neutralWashWrites = getStyleWriteCount(neutralRuntime.lagging, 'washColor');
  runRuntimeFor(neutralRuntime, 1200);
  assert.equal(
    getStyleWriteCount(neutralRuntime.lagging, 'washColor'),
    neutralWashWrites,
    "neutral ignored-target cache should not rewrite the same neutral color every tick",
  );

  const nonEnemyRuntime = runRuntime({
    unitStatusClasses: ["team1"],
    barWidth: 82,
    parentWidth: 100,
    sharedValues: makeRuntimeValues({
      hp_enabled: true,
      hp_mode: 0,
      hp_color_high: "#00AA00",
      hp_counter_visible: false,
    }),
  });
  const nonEnemyDelays = [];
  for (let i = 0; i < 8 && nonEnemyRuntime.scheduled.length; i += 1) {
    const next = takeNextRuntimeSchedule(nonEnemyRuntime);
    nonEnemyDelays.push(Number(next.delay));
    nonEnemyRuntime.now = next.due;
    next.fn();
  }
  assert.ok(
    nonEnemyDelays.some((delay) => delay >= 0.75),
    `non-enemy targets should back off after initial probes, got ${nonEnemyDelays.join(", ")}`,
  );
  assert.notEqual(
    normalizeColor(nonEnemyRuntime.lagging.style.washColor),
    "#00aa00",
    "non-enemy targets must not receive user enemy colors",
  );
});

test("runtime overlay adapter caches writes, detects drift, and repaints late same-raw replacements", () => {
  const values = makeRuntimeValues({
    hp_enabled: true,
    hp_mode: 0,
    hp_color_high: "#00AA00",
    hp_counter_visible: false,
    hp_pulse_enabled: false,
    hp_friend_enabled: false,
  });
  const runtime = runRuntime({
    unitStatusClasses: ["enemy", "team1"],
    barWidth: 82,
    parentWidth: 100,
    sharedValues: values,
    exposeRuntimeTestHooks: true,
  });
  runRuntimeUntil(
    runtime,
    () => normalizeColor(runtime.lagging.style.washColor) === "#00aa00",
    "enemy bar should receive initial preset color",
  );

  const hooks = runtimeHooks(runtime);
  const barWritesBeforeDuplicateCalls = getStyleWriteCount(runtime.lagging, 'washColor');
  const bgWritesBeforeDuplicateCalls = getStyleWriteCount(runtime.bg);
  hooks.setEnemyBarColor("#00AA00");
  hooks.setEnemyBarColor("#00AA00");
  hooks.setBarVisible(true);
  hooks.setBarVisible(true);
  assert.equal(
    getStyleWriteCount(runtime.lagging, 'washColor'),
    barWritesBeforeDuplicateCalls,
    "adapter should not rewrite an unchanged enemy bar color",
  );
  assert.equal(getStyleWriteCount(runtime.bg), bgWritesBeforeDuplicateCalls, "adapter should not rewrite unchanged visibility");

  runtime.lagging.style.washColor = "";
  assert.equal(hooks.hasEnemyBarStyleDrift(), true, "adapter should detect cleared washColor drift");
  runRuntimeUntil(
    runtime,
    () => normalizeColor(runtime.lagging.style.washColor) === "#00aa00",
    "style drift should force a repaint to the cached enemy color",
  );

  const replacement = runtime.redParent.add(new MockPanel("unit_healthbar_lagging", {
    actuallayoutwidth: 82,
    actuallayoutheight: 12,
    findCounts: runtime.findCounts,
  }));
  const raw = runtime.shared.__hpColorsCfgRaw;
  dispatchPresetSnapshot(runtime, values, {
    rawOverride: raw,
    sharedRawOverride: raw,
  });
  runRuntimeUntil(
    runtime,
    () => normalizeColor(replacement.style.washColor) === "#00aa00",
    "duplicate same-raw snapshot should wake and repaint a late same-id red-bar replacement",
  );
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
  const writesAfterStop = getStyleWriteCount(runtime.lagging);
  stale.fn();
  assert.equal(getStyleWriteCount(runtime.lagging), writesAfterStop);
  assert.equal(runtime.scheduled.length, scheduledAfterStop);
  dispatchPresetSnapshot(runtime, makeRuntimeValues({ hp_enabled: true }));
  assert.ok(runtime.scheduled.some((item) => item.delay <= 0.05), "reenabling should schedule a fresh enemy callback");
});

test("runtime quiescent lifetime checks survive disabled loops and stop only dead contexts", () => {
  const disabled = runRuntime({
    sharedValues: makeRuntimeValues({
      hp_enabled: false,
      hp_friend_enabled: false,
      hp_level_number_visible: false,
    }),
  });
  const quiescent = disabled.scheduled.find((item) => item.fn && item.fn.name === "runtimeQuiescentCheck");
  assert.ok(quiescent, "all-disabled runtime should retain a low-frequency lifetime check");

  dispatchPresetSnapshot(disabled, makeRuntimeValues({ hp_enabled: true }));
  quiescent.fn();
  assert.equal(disabled.bridgeHandlers.length, 1, "re-enabled context must remain live after its pending quiescent check");
  assert.ok(disabled.scheduled.some((item) => item.delay <= 0.05), "re-enable should schedule a fresh enabled loop");

  const dead = runRuntime({
    sharedValues: makeRuntimeValues({
      hp_enabled: false,
      hp_friend_enabled: false,
      hp_level_number_visible: false,
    }),
  });
  const deadCheck = dead.scheduled.find((item) => item.fn && item.fn.name === "runtimeQuiescentCheck");
  assert.ok(deadCheck, "dead-context scenario should have a lifetime check");
  dead.harness.contextPanel.valid = false;
  deadCheck.fn();
  assert.equal(dead.bridgeHandlers.length, 0, "dead context should unregister its runtime listener");
});

test("cache probe cadence backs off while missing and recovers late panels", () => {
  const runtime = runRuntime({
    exposeRuntimeTestHooks: true,
    sharedValues: makeRuntimeValues({ hp_enabled: true }),
  });
  runNextRuntimeSchedule(runtime);
  runtime.pip.valid = false;
  let missing = null;
  for (let i = 0; i < 8 && runtimeHooks(runtime).cacheProbeState().attempts === 0; i += 1)
    missing = runNextRuntimeSchedule(runtime);
  const probeState = runtimeHooks(runtime).cacheProbeState();
  assert.ok(probeState.attempts >= 1, "invalidated panel should enter cache probing");
  assert.equal(missing.delay, 0.15, "initial cache miss should probe at the 150ms cadence");
  runtime.pip.valid = true;
  runNextRuntimeSchedule(runtime);
  assert.equal(runtimeHooks(runtime).cacheProbeState().nextAt, 0, "late panel recovery should clear the probe deadline");
});
test("friendly-building transitions clear ult even when ally coloring is disabled", () => {
  const runtime = runRuntime({
    sharedValues: makeRuntimeValues({ hp_enabled: true, hp_friend_enabled: false }),
  });
  runNextRuntimeSchedule(runtime);
  assert.notEqual(normalizeColor(runtime.ult.style.washColor), "", "enemy paint should establish an ult wash");
  runtime.unitStatus.RemoveClass("enemy");
  runtime.unitStatus.AddClass("friend");
  runtime.unitStatus.AddClass("building");
  runRuntimeUntil(runtime, () => normalizeColor(runtime.ult.style.washColor) === "", "friendly-building transition should clear ult wash");
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

test("runtime event snapshot accepts raw fallback and ignores wrong titles", () => {
  const runtime = runRuntime({ barWidth: 100, parentWidth: 100 });
  runNextRuntimeSchedule(runtime);
  dispatchPresetSnapshot(runtime, makeRuntimeValues({
    hp_enabled: true,
    hp_color_high: "#010203",
    hp_mode: 0,
  }), { omitRaw: true, noSharedWrite: true, asString: true });
  runRuntimeUntil(
    runtime,
    () => normalizeColor(runtime.lagging.style.washColor) === "#010203",
    "event payload without shared store/root attr should apply through values fallback",
  );
  dispatchPresetSnapshot(runtime, makeRuntimeValues({
    hp_enabled: true,
    hp_color_high: "#aabbcc",
    hp_mode: 0,
  }), { modTitle: "Other Mod", noSharedWrite: true, asString: true });
  runRuntimeFor(runtime, 200);
  assert.equal(normalizeColor(runtime.lagging.style.washColor), "#010203");
});

test("runtime valid event wins over stale shared and root transport", () => {
  const staleShared = JSON.stringify({ values: makeRuntimeValues({ hp_color_high: "#111111" }) });
  const staleRoot = JSON.stringify({ values: makeRuntimeValues({ hp_color_high: "#222222" }) });
  const runtime = runRuntime({ sharedRaw: staleShared, rootRaw: staleRoot, barWidth: 100, parentWidth: 100 });
  runRuntimeUntil(runtime, () => normalizeColor(runtime.lagging.style.washColor) === "#111111", "shared startup value should win over root");
  const newer = makeRuntimeValues({ hp_enabled: true, hp_color_high: "#abcdef", hp_mode: 0 });
  dispatchPresetSnapshot(runtime, newer, {
    rawOverride: JSON.stringify(newer),
    noSharedWrite: true,
    noRootWrite: true,
  });
  runRuntimeUntil(runtime, () => normalizeColor(runtime.lagging.style.washColor) === "#abcdef", "newer valid event should override stale transport");
  assert.equal(runtime.shared.__hpColorsCfgRaw, staleShared);
  assert.equal(runtime.root.GetAttributeString("hp_colors_minimal_cfg_raw", ""), staleRoot);
});

test("runtime root-only startup and malformed events preserve transport state", () => {
  const rootRaw = JSON.stringify({ values: makeRuntimeValues({ hp_color_high: "#334455" }) });
  const runtime = runRuntime({ sharedRaw: "", rootRaw, barWidth: 100, parentWidth: 100 });
  runRuntimeUntil(runtime, () => normalizeColor(runtime.lagging.style.washColor) === "#334455", "root-only startup should apply root fallback");
  const writesBefore = getStyleWriteCount(runtime.lagging, "washColor");
  runtime.bridgeHandlers[0].fn("{malformed");
  runRuntimeFor(runtime, 200);
  assert.equal(normalizeColor(runtime.lagging.style.washColor), "#334455");
  assert.equal(getStyleWriteCount(runtime.lagging, "washColor"), writesBefore);
  assert.equal(runtime.root.GetAttributeString("hp_colors_minimal_cfg_raw", ""), rootRaw);
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

test("runtime CSS-only enemy pulse backs off after first pulse paint", () => {
  const runtime = runRuntime({
    barWidth: 20,
    parentWidth: 100,
    sharedValues: makeRuntimeValues({
      hp_enabled: true,
      hp_pulse_enabled: true,
      hp_pulse_threshold: 25,
      hp_pulse_bpm: 120,
      hp_pulse_intensity: 2,
      hp_pulse_text_enabled: false,
      hp_counter_visible: true,
      hp_counter_format: 1,
    }),
  });

  runRuntimeUntil(runtime, () => runtime.lagging.classes.includes("low_hp_pulsing"), "CSS pulse should start");
  assert.ok(runtime.ult.classes.includes("low_hp_pulsing"));
  assert.equal(runtime.counter.style.brightness, "");

  const counterWritesAfterPulseStart = getStyleWriteCount(runtime.counter);
  const steadyDelays = [];
  for (let i = 0; i < 4; i += 1) {
    runNextRuntimeSchedule(runtime);
    steadyDelays.push(Math.min(...runtime.scheduled.map((item) => item.delay)));
  }

  assert.ok(
    steadyDelays.every((delay) => delay > 0.15),
    `CSS-only pulse should not keep the enemy loop in the hot repaint cadence, got ${steadyDelays.join(", ")}`,
  );
  assert.equal(
    getStyleWriteCount(runtime.counter),
    counterWritesAfterPulseStart,
    "CSS-only steady pulse callbacks must not keep updating JS pulse text styles",
  );
});

test("runtime readout policy covers formats, pip boundaries, and low-mode styling", () => {
  const hookRuntime = runRuntime({
    exposeRuntimeTestHooks: true,
    sharedValues: makeRuntimeValues({ hp_enabled: true, hp_counter_visible: true }),
  });
  const hooks = runtimeHooks(hookRuntime);
  const fullReadout = hooks.readoutPlan({
    hp_counter_visible: true,
    hp_counter_format: 0,
    hp_pip_visible: true,
  }, {
    hp: 50,
    hasPipPanel: true,
    pipText: "||||",
    hasCounterPanels: true,
    liveBarWidth: 50,
    liveBarParentWidth: 100,
  });
  assert.equal(fullReadout.current, 1000, "full readout should calculate current HP from pips and bar ratio");
  assert.equal(fullReadout.max, 2000, "full readout should calculate max HP from 500-HP pips");
  const preciseReadout = hooks.readoutPlan({
    hp_counter_visible: true,
    hp_counter_format: 0,
    hp_pip_visible: true,
    hp_precise_pips_enabled: true,
  }, {
    hp: 50,
    pipText: "''''||||'",
    hasCounterPanels: true,
    liveBarWidth: 50,
    liveBarParentWidth: 100,
  });
  assert.equal(preciseReadout.current, 105, "precise readout should calculate current HP from 10-HP minor pips");
  assert.equal(preciseReadout.max, 210, "precise readout should calculate max HP from grouped precise pips");

  const currentReadout = hooks.readoutPlan({
    hp_counter_visible: true,
    hp_counter_format: 2,
    hp_pip_visible: true,
  }, {
    hp: 50,
    hasPipPanel: true,
    pipText: "||||",
    hasCounterPanels: true,
    liveBarWidth: 50,
    liveBarParentWidth: 100,
  });
  assert.equal(currentReadout.current, 1000, "current-HP format should still compute current HP, not reuse percent text");

  const percentageReadout = hooks.readoutPlan({
    hp_counter_visible: true,
    hp_counter_format: 1,
    hp_pip_visible: true,
  }, {
    hp: 37,
    hasPipPanel: true,
    pipText: "not a pip count",
    hasCounterPanels: true,
    liveBarWidth: 0,
    liveBarParentWidth: 0,
  });
  assert.equal(percentageReadout.current, 37, "percentage format should use HP percent directly");
  assert.equal(percentageReadout.max, 100, "percentage format should not depend on pip parsing");

  const emptyPipReadout = hooks.readoutPlan({
    hp_counter_visible: true,
    hp_counter_format: 0,
    hp_pip_visible: true,
  }, {
    hp: 25,
    hasPipPanel: true,
    pipText: "",
    hasCounterPanels: true,
    liveBarWidth: 25,
    liveBarParentWidth: 100,
  });
  assert.equal(emptyPipReadout.current, 0, "empty pip text should produce zero current HP without throwing");
  assert.equal(emptyPipReadout.max, 0, "empty pip text should produce zero max HP without throwing");

  const zeroParentReadout = hooks.readoutPlan({
    hp_counter_visible: true,
    hp_counter_format: 0,
    hp_pip_visible: true,
  }, {
    hp: 0,
    hasPipPanel: true,
    pipText: "||||",
    hasCounterPanels: true,
    liveBarWidth: 50,
    liveBarParentWidth: 0,
  });
  assert.equal(zeroParentReadout.current, 0, "parent width zero should force ratio/current HP to zero");
  assert.equal(zeroParentReadout.max, 2000, "parent width zero should not discard a parseable max HP");

  const roundedReadout = hooks.readoutPlan({
    hp_counter_visible: true,
    hp_counter_format: 0,
    hp_pip_visible: true,
  }, {
    hp: 97,
    hasPipPanel: true,
    pipText: "||||",
    hasCounterPanels: true,
    liveBarWidth: 97,
    liveBarParentWidth: 100,
  });
  assert.equal(roundedReadout.current, 2000, "ratio >= 0.97 should round current HP up to max");

  const hiddenPipReadout = hooks.readoutPlan({
    hp_counter_visible: true,
    hp_counter_format: 1,
    hp_pip_visible: false,
  }, {
    hp: 37,
    hasPipPanel: true,
    hasCounterPanels: true,
  });
  assert.equal(hiddenPipReadout.pipVisible, "collapse", "hidden pips should collapse the pip label");

  const lowModeReadout = hooks.readoutPlan({
    hp_counter_visible: true,
    hp_counter_format: 1,
    hp_pip_visible: true,
  }, {
    hp: 20,
    hasPipPanel: true,
    hasCounterPanels: true,
    pulsePlan: { shouldPulse: true, textEnabled: true },
  });
  const cssOnlyReadout = hooks.readoutPlan({
    hp_counter_visible: true,
    hp_counter_format: 1,
    hp_pip_visible: true,
  }, {
    hp: 20,
    hasPipPanel: true,
    hasCounterPanels: true,
    pulsePlan: { shouldPulse: true, textEnabled: false },
  });
  assert.equal(lowModeReadout.lowMode, true, "readout low-mode styling should activate only for pulse text");
  assert.equal(cssOnlyReadout.lowMode, false, "CSS-only pulse should not put the HP number in low-mode styling");

  const fullRuntime = runRuntime({
    barWidth: 50,
    parentWidth: 100,
    pipText: "||||",
    sharedValues: makeRuntimeValues({ hp_counter_visible: true, hp_counter_format: 0, hp_pulse_enabled: false }),
  });
  runRuntimeUntil(fullRuntime, () => fullRuntime.counter.text === "1000 / 2000", "full format should render current / max text");

  const currentRuntime = runRuntime({
    barWidth: 50,
    parentWidth: 100,
    pipText: "||||",
    sharedValues: makeRuntimeValues({ hp_counter_visible: true, hp_counter_format: 2, hp_pulse_enabled: false }),
  });
  runRuntimeUntil(currentRuntime, () => currentRuntime.counter.text === "1000", "current format should render current HP text");

  const badPipRuntime = runRuntime({
    barWidth: 50,
    parentWidth: 100,
    pipText: "not hp text",
    sharedValues: makeRuntimeValues({ hp_counter_visible: true, hp_counter_format: 0, hp_pulse_enabled: false }),
  });
  runRuntimeUntil(badPipRuntime, () => badPipRuntime.counter.text === "0 / 0", "bad pip text should render 0 / 0 without throwing");

  const hiddenPipRuntime = runRuntime({
    barWidth: 37,
    parentWidth: 100,
    pipText: "not hp text",
    sharedValues: makeRuntimeValues({
      hp_counter_visible: true,
      hp_counter_format: 1,
      hp_pip_visible: false,
      hp_pulse_enabled: false,
    }),
  });
  runRuntimeUntil(
    hiddenPipRuntime,
    () => hiddenPipRuntime.counter.text === "37%" && hiddenPipRuntime.pip.style.visibility === "collapse",
    "hidden pip setting should collapse pips while keeping percentage readout",
  );
});

test("runtime pulse policy covers inclusive thresholds, color modes, text cadence, hide bar, warmup, and ally settings", () => {
  const hookRuntime = runRuntime({
    exposeRuntimeTestHooks: true,
    sharedValues: makeRuntimeValues({ hp_enabled: true }),
  });
  const hooks = runtimeHooks(hookRuntime);
  const gradientPulsePlan = hooks.enemyPaintPlan({
    hp_mode: 0,
    hp_color_low: "#000000",
    hp_color_mid: "#808080",
    hp_color_high: "#ffffff",
    hp_pulse_enabled: true,
    hp_pulse_color_enabled: true,
    hp_pulse_color_mode: 1,
    hp_pulse_color: "#ff0000",
    hp_pulse_threshold: 25,
  }, { hp: 20, prevHp: 30, now: 5000, shouldPulse: true, panelBornAt: 0 });
  assert.equal(gradientPulsePlan.barColor, "#330000", "gradient pulse color should interpolate base color toward pulse color");

  const warmupPlan = hooks.enemyPaintPlan({
    hp_mode: 0,
    hp_color_low: "#111111",
    hp_color_high: "#00ff00",
    hp_pulse_enabled: true,
    hp_pulse_color_enabled: true,
    hp_pulse_color: "#ff0000",
    hp_pulse_threshold: 25,
  }, { hp: 20, prevHp: -1, now: 1000, shouldPulse: true, panelBornAt: 500 });
  assert.equal(warmupPlan.barColor, "#00ff00", "warmup should paint high color instead of flashing low/pulse color");
  assert.equal(warmupPlan.clearPulse, true, "warmup should suppress active pulse state");
  assert.equal(warmupPlan.stopAfterApply, true, "warmup should request the short warmup schedule path");

  const thresholdZero = runRuntime({
    barWidth: 0,
    parentWidth: 100,
    sharedValues: makeRuntimeValues({ hp_pulse_enabled: true, hp_pulse_threshold: 0, hp_pulse_bpm: 120 }),
  });
  runRuntimeUntil(thresholdZero, () => thresholdZero.lagging.classes.includes("low_hp_pulsing"), "threshold 0 should pulse at exactly zero HP");

  const thresholdZeroNoPulse = runRuntime({
    barWidth: 1,
    parentWidth: 100,
    sharedValues: makeRuntimeValues({ hp_pulse_enabled: true, hp_pulse_threshold: 0, hp_pulse_bpm: 120 }),
  });
  runRuntimeFor(thresholdZeroNoPulse, 350);
  assert.equal(thresholdZeroNoPulse.lagging.classes.includes("low_hp_pulsing"), false, "threshold 0 should not pulse above zero HP");

  const thresholdHundred = runRuntime({
    barWidth: 100,
    parentWidth: 100,
    sharedValues: makeRuntimeValues({ hp_pulse_enabled: true, hp_pulse_threshold: 100, hp_pulse_bpm: 120 }),
  });
  runRuntimeUntil(thresholdHundred, () => thresholdHundred.lagging.classes.includes("low_hp_pulsing"), "threshold 100 should pulse at full HP");

  const fixedPulse = runRuntime({
    barWidth: 20,
    parentWidth: 100,
    sharedValues: makeRuntimeValues({
      hp_mode: 0,
      hp_color_low: "#111111",
      hp_pulse_enabled: true,
      hp_pulse_threshold: 25,
      hp_pulse_color_enabled: true,
      hp_pulse_color_mode: 0,
      hp_pulse_color: "#ff2222",
    }),
  });
  runRuntimeUntil(fixedPulse, () => normalizeColor(fixedPulse.lagging.style.washColor) === "#ff2222", "fixed pulse color should paint the configured pulse color");

  const hideBar = runRuntime({
    barWidth: 20,
    parentWidth: 100,
    sharedValues: makeRuntimeValues({
      hp_bg_visible: true,
      hp_pulse_enabled: true,
      hp_pulse_threshold: 25,
      hp_pulse_hide_bar: true,
    }),
  });
  runRuntimeUntil(
    hideBar,
    () => hideBar.lagging.classes.includes("low_hp_pulsing") &&
      hideBar.bg.style.visibility === "visible" &&
      hideBar.bg.style.opacity === "0.01",
    "hide-bar pulse should use visibility/opacity instead of panel deletion",
  );

  const textClears = runRuntime({
    barWidth: 20,
    parentWidth: 100,
    sharedValues: makeRuntimeValues({
      hp_pulse_enabled: true,
      hp_pulse_threshold: 25,
      hp_pulse_bpm: 120,
      hp_pulse_text_enabled: true,
      hp_counter_visible: true,
      hp_counter_format: 1,
    }),
  });
  runRuntimeUntil(textClears, () => String(textClears.counter.style.brightness || "").length > 0, "text pulse should write brightness");
  dispatchPresetSnapshot(textClears, makeRuntimeValues({
    hp_pulse_enabled: true,
    hp_pulse_threshold: 25,
    hp_pulse_bpm: 120,
    hp_pulse_text_enabled: false,
    hp_counter_visible: true,
    hp_counter_format: 1,
  }));
  runRuntimeUntil(textClears, () => textClears.counter.style.brightness === "", "disabling pulse text should clear brightness");
  const textDisabledDelays = [];
  for (let i = 0; i < 4; i += 1) {
    runNextRuntimeSchedule(textClears);
    textDisabledDelays.push(Math.min(...textClears.scheduled.map((item) => item.delay)));
  }
  assert.ok(textDisabledDelays.some((delay) => delay > 0.15), `text-disabled pulse should back off JS cadence after clearing brightness, got ${textDisabledDelays.join(", ")}`);

  const allyPulse = runRuntime({
    unitStatusClasses: ["friend", "team1"],
    barWidth: 80,
    parentWidth: 100,
    sharedValues: makeRuntimeValues({
      hp_enabled: false,
      hp_friend_enabled: true,
      hp_friend_color_high: "#778899",
      hp_friend_pulse_enabled: true,
      hp_friend_pulse_threshold: 100,
      hp_friend_pulse_bpm: 30,
      hp_friend_pulse_intensity: 0,
      hp_friend_pulse_color_enabled: true,
      hp_friend_pulse_color: "#abcdef",
      hp_pulse_enabled: true,
      hp_pulse_threshold: 100,
      hp_pulse_bpm: 300,
      hp_pulse_intensity: 2,
      hp_pulse_text_enabled: true,
    }),
  });
  runRuntimeUntil(allyPulse, () => allyPulse.lagging.classes.includes("low_hp_pulsing"), "ally pulse should start from friend settings");
  assert.equal(allyPulse.lagging.style.animationDuration, "2.000s", "ally pulse should use friend BPM, not enemy BPM");
  assert.ok(allyPulse.lagging.classes.includes("pulse_subtle"), "ally pulse should use friend intensity");
  assert.equal(allyPulse.lagging.classes.includes("pulse_intense"), false, "ally pulse should not use enemy intensity");
  assert.equal(normalizeColor(allyPulse.lagging.style.washColor), "#abcdef", "ally pulse should use friend pulse color");
});

test("runtime paint, kill marker, and level tier policies cover clamps and boundaries", () => {
  const hookRuntime = runRuntime({
    exposeRuntimeTestHooks: true,
    sharedValues: makeRuntimeValues({ hp_enabled: true }),
  });
  const hooks = runtimeHooks(hookRuntime);
  assert.equal(hooks.enemyPaintPlan({
    hp_mode: 0,
    hp_low_threshold: 25,
    hp_high_threshold: 65,
    hp_color_low: "#111111",
    hp_color_mid: "#222222",
    hp_color_high: "#333333",
  }, { hp: 25, prevHp: 80, now: 5000, shouldPulse: false, panelBornAt: 0 }).barColor, "#111111", "fixed paint should use low color at the inclusive low threshold");
  assert.equal(hooks.enemyPaintPlan({
    hp_mode: 0,
    hp_low_threshold: 25,
    hp_high_threshold: 65,
    hp_color_low: "#111111",
    hp_color_mid: "#222222",
    hp_color_high: "#333333",
  }, { hp: 65, prevHp: 80, now: 5000, shouldPulse: false, panelBornAt: 0 }).barColor, "#222222", "fixed paint should use mid color at the inclusive high threshold");
  assert.equal(hooks.enemyPaintPlan({
    hp_mode: 0,
    hp_low_threshold: 25,
    hp_high_threshold: 65,
    hp_color_low: "#111111",
    hp_color_mid: "#222222",
    hp_color_high: "#333333",
  }, { hp: 66, prevHp: 80, now: 5000, shouldPulse: false, panelBornAt: 0 }).barColor, "#333333", "fixed paint should use high color above high threshold");
  assert.equal(hooks.enemyPaintPlan({
    hp_mode: 1,
    hp_low_threshold: 25,
    hp_high_threshold: 75,
    hp_color_low: "#000000",
    hp_color_mid: "#808080",
    hp_color_high: "#ffffff",
  }, { hp: 50, prevHp: 80, now: 5000, shouldPulse: false, panelBornAt: 0 }).barColor, "#404040", "gradient paint should interpolate low-to-mid between thresholds");
  assert.equal(hooks.enemyPaintPlan({
    hp_mode: 1,
    hp_low_threshold: 25,
    hp_high_threshold: 75,
    hp_color_low: "#000000",
    hp_color_mid: "#808080",
    hp_color_high: "#ffffff",
  }, { hp: 88, prevHp: 80, now: 5000, shouldPulse: false, panelBornAt: 0 }).barColor, "#c2c2c2", "gradient paint should interpolate mid-to-high above the high threshold");
  assert.equal(hooks.enemyPaintPlan({
    hp_mode: 0,
    hp_low_threshold: 70,
    hp_high_threshold: 30,
    hp_color_low: "#111111",
    hp_color_mid: "#222222",
    hp_color_high: "#333333",
  }, { hp: 70, prevHp: 80, now: 5000, shouldPulse: false, panelBornAt: 0 }).barColor, "#111111", "high<low normalization should keep hp=low in the low branch");
  assert.equal(hooks.enemyPaintPlan({
    hp_mode: 0,
    hp_low_threshold: 70,
    hp_high_threshold: 30,
    hp_color_low: "#111111",
    hp_color_mid: "#222222",
    hp_color_high: "#333333",
  }, { hp: 71, prevHp: 80, now: 5000, shouldPulse: false, panelBornAt: 0 }).barColor, "#333333", "high<low normalization should make hp>low use the high branch");

  const killClampLow = runRuntime({
    barWidth: 82,
    parentWidth: 100,
    sharedValues: makeRuntimeValues({
      hp_kill_zone_enabled: true,
      hp_kill_zone_threshold: -20,
      hp_kill_zone_width: 0,
      hp_kill_zone_color: "#AaBbCc",
      hp_pulse_enabled: false,
    }),
  });
  runRuntimeUntil(
    killClampLow,
    () => killClampLow.killZone.style.visibility === "visible" &&
      killClampLow.killZone.style.marginLeft === "0px" &&
      killClampLow.killZone.style.width === "1px" &&
      normalizeColor(killClampLow.killZone.style.backgroundColor) === "#aabbcc",
    "kill marker should clamp low threshold/width and normalize color",
  );

  const killClampHigh = runRuntime({
    barWidth: 82,
    parentWidth: 100,
    sharedValues: makeRuntimeValues({
      hp_kill_zone_enabled: true,
      hp_kill_zone_threshold: 200,
      hp_kill_zone_width: 200,
      hp_kill_zone_color: "#112233",
      hp_pulse_enabled: false,
    }),
  });
  runRuntimeUntil(
    killClampHigh,
    () => killClampHigh.killZone.style.visibility === "visible" &&
      killClampHigh.killZone.style.marginLeft === "0px" &&
      killClampHigh.killZone.style.width === "100px" &&
      normalizeColor(killClampHigh.killZone.style.backgroundColor) === "#112233",
    "kill marker should clamp high threshold/width into parent bounds",
  );

  const killParentZero = runRuntime({
    barWidth: 82,
    parentWidth: 0,
    sharedValues: makeRuntimeValues({ hp_kill_zone_enabled: true }),
  });
  runRuntimeFor(killParentZero, 500);
  assert.equal(killParentZero.killZone.style.visibility, "collapse", "kill marker should hide when parent width is zero");

  const killBgHidden = runRuntime({
    barWidth: 82,
    parentWidth: 100,
    sharedValues: makeRuntimeValues({ hp_kill_zone_enabled: true, hp_bg_visible: false }),
  });
  runRuntimeFor(killBgHidden, 500);
  assert.equal(killBgHidden.killZone.style.visibility, "collapse", "kill marker should hide when the bar background is effectively hidden");

  assert.equal(hooks.levelParse(""), 0, "empty level text should parse as ignored");
  assert.equal(hooks.levelParse("{s:hero_level}"), 0, "placeholder level text should parse as ignored");
  assert.equal(hooks.levelParse("Lv. 35"), 35, "level parser should collect digits from label text");
  const levelCases = [
    [10, ""],
    [11, "level_tier2"],
    [18, "level_tier2"],
    [19, "level_tier3"],
    [26, "level_tier3"],
    [27, "level_tier4"],
    [34, "level_tier4"],
    [35, "level_tier5"],
  ];
  for (const [level, tierClass] of levelCases) {
    assert.equal(hooks.levelClassFor(level), tierClass, `level ${level} should map to ${tierClass || "no tier"}`);
  }

  function setPanelText(panel, text) {
    panel.text = text;
    panel.SetAttributeString("text", text);
  }

  function assertLevelTier(runtime, text, expectedTier) {
    setPanelText(runtime.level, text);
    const allTiers = ["level_tier2", "level_tier3", "level_tier4", "level_tier5"];
    runRuntimeUntil(
      runtime,
      () => allTiers.every((cls) => runtime.unitStatus.classes.includes(cls) === (cls === expectedTier)),
      `level ${JSON.stringify(text)} should apply ${expectedTier || "no tier"}, got ${runtime.unitStatus.classes.join(", ")}`,
    );
  }

  const levelRuntime = runRuntime({
    levelText: "10",
    sharedValues: makeRuntimeValues({
      hp_enabled: false,
      hp_level_number_visible: true,
    }),
  });
  assertLevelTier(levelRuntime, "10", "");
  assertLevelTier(levelRuntime, "11", "level_tier2");
  assertLevelTier(levelRuntime, "18", "level_tier2");
  assertLevelTier(levelRuntime, "19", "level_tier3");
  assertLevelTier(levelRuntime, "26", "level_tier3");
  assertLevelTier(levelRuntime, "27", "level_tier4");
  assertLevelTier(levelRuntime, "34", "level_tier4");
  assertLevelTier(levelRuntime, "35", "level_tier5");
  setPanelText(levelRuntime.level, "");
  runRuntimeFor(levelRuntime, 600);
  assert.ok(levelRuntime.unitStatus.classes.includes("level_tier5"), "empty level text should be ignored without clearing the previous tier");
  setPanelText(levelRuntime.level, "{s:hero_level}");
  runRuntimeFor(levelRuntime, 600);
  assert.ok(levelRuntime.unitStatus.classes.includes("level_tier5"), "placeholder level text should be ignored without clearing the previous tier");
  assertLevelTier(levelRuntime, "10", "");
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

test("publisher is silent in production", () => {
  const result = runPublisher([
    makePresetPanel("HPColorsPreset_001", { hp_color_low: "#111111" }, { heroMode: "all" }),
  ]);
  assert.equal(lastSnapshot(result).values.hp_color_low, "#111111");
  assert.deepEqual(result.logs, []);
});


test("precise-pip max cache resets when snapshot toggles the setting", () => {
  const runtime = runRuntime({
    exposeRuntimeTestHooks: true,
    sharedValues: { hp_precise_pips_enabled: false },
  });
  const hooks = runtimeHooks(runtime);
  const pipArgs = {
    hp: 50,
    hasPipPanel: true,
    pipText: "''||",
    hasCounterPanels: true,
    liveBarWidth: 50,
    liveBarParentWidth: 100,
  };
  const basePlan = hooks.readoutPlan({
    hp_counter_visible: true,
    hp_counter_format: 0,
    hp_precise_pips_enabled: false,
  }, pipArgs);
  assert.equal(basePlan.max, 600);

  dispatchPresetSnapshot(runtime, { hp_precise_pips_enabled: true });
  const precisePlan = hooks.readoutPlan({
    hp_counter_visible: true,
    hp_counter_format: 0,
  }, pipArgs);
  assert.equal(precisePlan.max, 60);
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
        hp_heal_color: "#5fff80",
        hp_bullet_shield_color: "#ffffff",
        edc: "#ffe55b",
        cv: false,
        ppe: true,
        m: 2,
        sb: false,
        fe: true,
        fcl: "#44FF44",
        fhc: "#5fff80",
        fbsc: "#ffffff",
        hp_friend_delta_color: "#504c47",
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
  assert.equal(values.hp_precise_pips_enabled, true);
  assert.equal(values.hp_mode, 2);
  assert.equal(values.hp_skip_buildings, false);
  assert.equal(values.hp_friend_enabled, true);
  assert.equal(values.hp_friend_color_low, "#44FF44");
  assert.equal(values.hp_heal_color, "#5fff80");
  assert.equal(values.hp_delta_color, "#ffe55b");
  assert.equal(values.hp_bullet_shield_color, "#ffffff");
  assert.equal(values.hp_friend_heal_color, "#5fff80");
  assert.equal(values.hp_friend_delta_color, "#504c47");
  assert.equal(values.hp_friend_bullet_shield_color, "#ffffff");
  assert.equal(Object.prototype.hasOwnProperty.call(values, "hp_unknown_runtime_knob"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(values, "hp_preset_store_private"), false);
});

test("publisher preset codec accepts compatible shapes and skips invalid entries", () => {
  const result = runPublisher([
    makeRawPresetPanel("BadBase64", { version: 1, values: { hp_color_low: "#000000" } }),
    new MockPanel("Malformed", {
      classes: ["hp_colors_preset_entry"],
      text: "not-valid=base64",
    }),
    makeRawPresetPanel("BadJson", "{nope"),
    makeRawPresetPanel("Unsupported", { version: 2, values: { hp_color_low: "#222222" } }),
    makeRawPresetPanel("Unknown", { v: 97, values: { hp_unknown_runtime_knob: true } }),
    makeRawPresetPanel("FullIds", { version: 1, values: { hp_color_low: "#333333" }, heroMode: "off" }),
    makeRawPresetPanel("CompactVals", { v: 97, vals: { cl: "#444444" }, hm: "selected", hs: ["13", "13", "hero_haze"] }),
    makeRawPresetPanel("CompactVs", { v: 97, vs: { cl: "#555555" }, hm: "all" }),
  ], { heroClass: "hero_haze" });
  assert.equal(lastSnapshot(result).values.hp_color_low, "#444444");

  const globalFallback = runPublisher([
    makeRawPresetPanel("SelectedEmpty", { v: 97, values: { hp_color_low: "#666666" }, hm: "selected", hs: ["999"] }),
    makeRawPresetPanel("Global", { v: 97, vs: { cl: "#777777" }, hm: "all" }),
  ]);
  assert.equal(lastSnapshot(globalFallback).values.hp_color_low, "#777777");

  const singleStartupOff = runPublisher([
    makeRawPresetPanel("HPColorsPreset_001", { version: 1, values: { hp_color_low: "#888888" }, heroMode: "off" }),
  ]);
  assert.equal(lastSnapshot(singleStartupOff).values.hp_color_low, "#888888");

  const currentCompact = runPublisher([
    makeRawPresetPanel("CurrentCompact", { v: 99, values: { hp_color_low: "#999999" }, hm: "all" }),
  ]);
  assert.equal(lastSnapshot(currentCompact).values.hp_color_low, "#999999");
});

test("publisher applies canonical and compact signature overrides only after tier activation", () => {
  const result = runPublisher([
    makeRawPresetPanel("HPColorsPreset_001", {
      v: 97,
      values: {
        hp_low_threshold: 20,
        hp_pulse_threshold: 10,
        hp_precise_pips_enabled: false,
      },
      o: {
        hp_low_threshold: { slot: 4, minTier: 3, value: 28 },
        pt: [4, 2, 29],
        ppe: [4, 0, true],
      },
      hm: "all",
    }),
  ], { signatureTiers: { 4: 1 } });
  assert.equal(lastSnapshot(result).values.hp_low_threshold, 20);
  assert.equal(lastSnapshot(result).values.hp_pulse_threshold, 10);
  assert.equal(lastSnapshot(result).values.hp_precise_pips_enabled, false);
  const initialDispatches = result.dispatched.length;

  runSignatureScan(result);
  assert.equal(lastSnapshot(result).values.hp_low_threshold, 20);
  assert.equal(result.dispatched.length, initialDispatches, "inactive rules must not republish");

  result.signature.slots[3].RemoveClass("Tier1");
  result.signature.slots[3].AddClass("Tier2");
  runSignatureScan(result);
  assert.equal(lastSnapshot(result).values.hp_pulse_threshold, 29);
  assert.equal(lastSnapshot(result).values.hp_low_threshold, 20);

  result.signature.slots[3].RemoveClass("Tier2");
  result.signature.slots[3].AddClass("Tier3");
  runSignatureScan(result);
  assert.equal(lastSnapshot(result).values.hp_low_threshold, 28);
  assert.equal(lastSnapshot(result).values.hp_pulse_threshold, 29);
  assert.equal(lastSnapshot(result).values.hp_precise_pips_enabled, false, "ppe remains the base value");
});

test("publisher rejects malformed signature rules and precise-pip overrides", () => {
  const result = runPublisher([
    makeRawPresetPanel("HPColorsPreset_001", {
      v: 97,
      values: { hp_low_threshold: 20, hp_precise_pips_enabled: true },
      o: {
        hp_low_threshold: { slot: "4", minTier: 3, value: 28 },
        hp_pulse_threshold: [4, 3],
        hp_kill_zone_threshold: [5, 0, 99],
        ppe: [4, 0, false],
      },
      hm: "all",
    }),
  ], { signatureTiers: { 4: 3 } });
  assert.equal(lastSnapshot(result).values.hp_low_threshold, 20);
  assert.equal(lastSnapshot(result).values.hp_precise_pips_enabled, true);
  assert.equal(result.scheduler.jobs.some((job) => job.fn && job.fn.name === "signatureTierPoll"), false);
});

test("publisher preserves selected preset signature overrides and rejects stale scans", () => {
  const result = runPublisher([
    makeRawPresetPanel("HPColorsPreset_001", {
      v: 97,
      values: { hp_low_threshold: 20 },
      hm: "all",
    }),
    makeRawPresetPanel("HPColorsPreset_002", {
      v: 97,
      values: { hp_low_threshold: 21 },
      o: { l: [2, 1, 28] },
      hm: "selected",
      hs: ["hero_haze"],
    }),
  ], { heroClass: "hero_haze", signatureTiers: { 2: 1 } });
  assert.equal(lastSnapshot(result).values.hp_low_threshold, 21);
  const scan = result.scheduler.takeByFunctionName("signatureTierPoll");
  result.harness.contextPanel = new MockPanel("ReplacementContext");
  const before = result.dispatched.length;
  scan.fn();
  assert.equal(result.dispatched.length, before, "stale signature scans must not publish");
});

test("publisher scans referenced signature slots and retires confirmed tier three", () => {
  const result = runPublisher([
    makeRawPresetPanel("HPColorsPreset_001", {
      v: 97,
      values: { hp_low_threshold: 20 },
      o: { l: [4, 3, 28] },
      hm: "all",
    }),
  ], { signatureTiers: { 4: 3 } });
  runSignatureScan(result);
  assert.equal(result.findCounts.slot_signature_1, undefined);
  assert.equal(result.findCounts.slot_signature_2, undefined);
  assert.equal(result.findCounts.slot_signature_3, undefined);
  assert.ok(result.findCounts.slot_signature_4 > 0);
  for (let i = 0; i < 50; i += 1) runSignatureScan(result);
  assert.equal(

    result.scheduler.jobs.some((job) => job.fn && job.fn.name === "signatureTierPoll"),
    false,
    "confirmed Tier3 slots should retire their scan",
  );
});

test("publisher resolves nested signature abilities and late slot panels", () => {
  const entries = [
    makeRawPresetPanel("HPColorsPreset_001", {
      v: 97,
      values: { hp_low_threshold: 20 },
      o: { l: [4, 3, 28] },
      hm: "all",
    }),
  ];
  const nested = runPublisher(entries, { signatureTiers: { 4: 3 } });
  const abilities = nested.signature.hud.add(new MockPanel("signature_abilities"));
  for (const slot of nested.signature.slots) slot.SetParent(abilities);
  runSignatureScan(nested);
  assert.equal(lastSnapshot(nested).values.hp_low_threshold, 28);
  nested.signature.slots[3].DeleteAsync();
  const replacementSlot = abilities.add(new MockPanel("slot_signature_4", {
    classes: ["Tier1"],
  }));
  runSignatureScan(nested);
  assert.equal(
    lastSnapshot(nested).values.hp_low_threshold,
    20,
    "same-root slot replacement should invalidate cached hierarchy",
  );
  assert.equal(replacementSlot.GetParent(), abilities);


  const late = runPublisher(entries);
  const lateSignature = installSignatureTree(late.harness, { 4: 3 });
  const lateAbilities = lateSignature.hud.add(new MockPanel("signature_abilities"));
  for (const slot of lateSignature.slots) slot.SetParent(lateAbilities);
  late.signature = lateSignature;
  runSignatureScan(late);
  assert.equal(lastSnapshot(late).values.hp_low_threshold, 28);
});
test("publisher rebinds replaced retired slots while other slots remain pending", () => {
  const result = runPublisher([
    makeRawPresetPanel("HPColorsPreset_001", {
      v: 97,
      values: { hp_low_threshold: 20 },
      o: {
        l: [4, 3, 28],
        pt: [3, 1, 29],
      },
      hm: "all",
    }),
  ], { signatureTiers: { 3: 1, 4: 3 }, nestedSignature: true });
  runSignatureScan(result);
  assert.equal(lastSnapshot(result).values.hp_low_threshold, 28);
  for (let i = 0; i < 50; i += 1) runSignatureScan(result);

  const oldSlot = result.signature.slots[3];
  oldSlot.DeleteAsync();
  const replacement = result.signature.abilities.add(new MockPanel("slot_signature_4", {
    classes: ["Tier1"],
  }));
  runSignatureScan(result);
  assert.equal(
    lastSnapshot(result).values.hp_low_threshold,
    20,
    "replaced retired slot should read its new lower tier",
  );
  assert.equal(replacement.GetParent(), result.signature.abilities);
});

test("publisher resets retired signature tiers when game time rolls back", () => {
  const result = runPublisher([
    makeRawPresetPanel("HPColorsPreset_001", {
      v: 97,
      values: { hp_low_threshold: 20 },
      o: { l: [4, 3, 28] },
      hm: "all",
    }),
  ], { gameTimeText: "Round 0 00:10", signatureTiers: { 4: 3 } });
  runSignatureScan(result);
  for (let i = 0; i < 50; i += 1) runSignatureScan(result);
  assert.equal(
    result.scheduler.jobs.some((job) => job.fn && job.fn.name === "signatureTierPoll"),
    false,
  );

  result.gameTimePanel.text = "Round 0 00:00";
  runPublisherReplay(result, result.now + 2000);
  assert.equal(lastSnapshot(result).values.hp_low_threshold, 20);
  assert.ok(
    result.scheduler.jobs.some((job) => job.fn && job.fn.name === "signatureTierPoll"),
    "rollback should resume signature polling",
  );
  runSignatureScan(result);
  assert.equal(lastSnapshot(result).values.hp_low_threshold, 28);
});

test("publisher reruns hero selection after same-root match rollback", () => {
  const result = runPublisher([
    makeRawPresetPanel("HPColorsPreset_001", {
      v: 97,
      values: { hp_low_threshold: 20 },
      hm: "all",
    }),
    makeRawPresetPanel("HPColorsPreset_002", {
      v: 97,
      values: { hp_low_threshold: 21 },
      o: { l: [4, 3, 28] },
      hm: "selected",
      hs: ["hero_haze"],
    }),
    makeRawPresetPanel("HPColorsPreset_003", {
      v: 97,
      values: { hp_low_threshold: 31 },
      o: { l: [4, 3, 38] },
      hm: "selected",
      hs: ["hero_gigawatt"],
    }),
  ], {
    heroClass: "hero_haze",
    gameTimeText: "Round 0 00:10",
    signatureTiers: { 4: 3 },
  });
  runSignatureScan(result);
  assert.equal(lastSnapshot(result).values.hp_low_threshold, 28);
  for (let i = 0; i < 50; i += 1) runSignatureScan(result);
  const storeFindsBeforeRollback = result.findCounts.HPColorsPresetStore || 0;
  result.heroProgress.RemoveClass("hero_haze");
  result.heroProgress.AddClass("hero_gigawatt");
  result.gameTimePanel.text = "Round 0 00:00";
  runPublisherReplay(result, result.now + 2000);
  assert.equal(result.findCounts.HPColorsPresetStore || 0, storeFindsBeforeRollback);
  assert.equal(lastSnapshot(result).values.hp_low_threshold, 31);
  runSignatureScan(result);
  assert.equal(lastSnapshot(result).values.hp_low_threshold, 38);
});

test("publisher ignores wrong-title requests and replies from cached payload", () => {
  const result = runPublisher([
    makePresetPanel("HPColorsPreset_001", { hp_color_low: "#111111" }, { heroMode: "all" }),
  ]);
  const before = result.dispatched.length;
  result.bridgeHandlers[0](JSON.stringify({ magic_word: "HP_COLORS_PRESET_REQUEST", mod_title: "Other Mod" }));
  assert.equal(result.dispatched.length, before);
  result.bridgeHandlers[0](JSON.stringify({ magic_word: "HP_COLORS_PRESET_REQUEST", reason: "legacy_missing_title" }));
  assert.equal(lastSnapshot(result).values.hp_color_low, "#111111");
  assert.equal(result.shared.__hpColorsCfgRaw, lastSnapshot(result).values_raw);
});

test("selected Hero scope beats all-heroes fallback when local hero matches", () => {
  const result = runPublisher([
    makePresetPanel("HPColorsPreset_001", { hp_color_low: "#111111" }, { heroMode: "all" }),
    makePresetPanel("HPColorsPreset_002", { hp_color_low: "#222222" }, { heroMode: "selected", heroes: ["hero_haze"] }),
  ], { heroClass: "hero_haze" });

  assert.equal(lastSnapshot(result).values.hp_color_low, "#222222");
});

test("off presets are ignored when other valid presets exist", () => {
  const result = runPublisher([
    makePresetPanel("HPColorsPreset_001", { hp_color_low: "#111111" }, { heroMode: "off" }),
    makePresetPanel("HPColorsPreset_002", { hp_color_low: "#222222" }, { heroMode: "all" }),
  ]);

  assert.equal(lastSnapshot(result).values.hp_color_low, "#222222");
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
  assert.equal(nextPublisherReplayDelay(result), 3);
  assert.equal(lastSnapshot(result).values.hp_color_low, "#111111");
  assert.equal(result.findCounts.HPColorsPresetStore || 0, findsBeforeCachedReplays);

  assert.equal(result.bridgeHandlers.length, 1);
  result.bridgeHandlers[0](JSON.stringify({ magic_word: "HP_COLORS_PRESET_REQUEST", mod_title: "HP Colors" }));
  assert.equal(lastSnapshot(result).values.hp_color_low, "#111111");
  assert.equal(result.shared.__hpColorsCfgRaw, first.values_raw);
  const findsBeforeHeatedReplay = result.findCounts.HPColorsPresetStore || 0;

  runPublisherReplay(result, result.now + 1499);
  assert.equal(nextPublisherReplayDelay(result), 1);
  assert.equal(lastSnapshot(result).values.hp_color_low, "#111111");
  assert.equal(result.findCounts.HPColorsPresetStore || 0, findsBeforeHeatedReplay);
});

test("publisher aborts stale-root replay callbacks without replacing the new replay state", () => {
  const result = runPublisher([
    makePresetPanel("HPColorsPreset_001", { hp_color_low: "#111111" }, { heroMode: "all" }),
  ]);
  const replay = takePublisherReplaySchedule(result);
  const before = result.dispatched.length;
  result.harness.contextPanel = new MockPanel("ReplacementContext");
  replay.fn();
  assert.equal(result.dispatched.length, before, "old-root replay must not dispatch after context replacement");
  assert.equal(
    result.scheduler.jobs.some((item) => item.fn && item.fn.name === "replayCachedSnapshot"),
    false,
    "stale replay must not leave an old-root handle active",
  );
});

test("runtime source preserves repaint, classification, and shipped Source 2 selectors", () => {
  const healthbar = fs.readFileSync(path.join(ROOT, "panorama/scripts/healthbar_logic.js"), "utf8");
  const assets = healthbar + fs.readFileSync(path.join(ROOT, "panorama/layout/unit_status_overlay.xml"), "utf8") + fs.readFileSync(path.join(ROOT, "panorama/styles/unit_status.css"), "utf8");

  for (const marker of [
    "UnitStatusTargetClassifier",
    "UNIT_STATUS_TARGET_SNAPSHOT",
    "ALLY_STATUS_TARGET_SNAPSHOT",
    "UnitStatusOverlayAdapter",
    "hasEnemyBarStyleDrift: function",
    "function hasAllyBarStyleDrift",
    "nextAllyStyleDriftCheckAt",
    "if (allyColorChanged && rbA)",
    "function syncEnemyPulse",
    "function syncAllyPulse",
    "function resetAllyState",
    "applyLayout: function",
    "function syncLevelTier",
    "function wakeForPresetReplay",
    "var EnemyHealthbarLoopPolicy = {",
    "var ReplayWakePolicy = {",
    "var LoopSchedulePolicy = {",
    "var ENEMY_ACTION_PAINT = 9;",
    "SAME_RAW_WAKE_MIN_MS",
    "SAME_RAW_WAKE_WATCHDOG_MS",
    "wakeForPresetReplay(\"shared_same_raw\")",
    "wakeForPresetReplay(\"event_duplicate_payload\")",
    "wakeForPresetReplay(\"event_payload_same_raw\")",
    "isEnemyTargetHealthbar: function",
    "isFriendlyTargetHealthbar: function",
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
  assert.match(
    healthbar,
    /var\s+(ID_[A-Z0-9_]+)\s*=\s*(["'])unit_healthbar_bullet_shield\2;[\s\S]*FindChildTraverse\(\s*\1\s*\)/,
    "runtime should cache and find the bullet shield panel through one verified id constant",
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
    /isFriendlyBuildingTarget: function \(flags, teamId\) \{[\s\S]*flags & 4[\s\S]*team === knownFriendlyTeamId[\s\S]*\}/,
    "friendly buildings should be recognized by the scalar target classifier",
  );
  assert.match(
    healthbar,
    /isEnemyBuildingTarget: function \(flags, teamId\) \{[\s\S]*flags & 4[\s\S]*!this\.isFriendlyBuildingTarget\(flags, team\)[\s\S]*\}/,
    "team-assigned non-friendly buildings should be promoted to enemy targets when building skip is off",
  );
  assert.match(
    healthbar,
    /getIgnoredTargetColor: function \(flags, teamId\) \{[\s\S]*flags & 1 && !\(flags & 2\)[\s\S]*this\.isEnemyBuildingTarget\(flags, teamId\)\) return CSS_TEAM_ENEMY_COLOR;[\s\S]*this\.isFriendlyBuildingTarget\(flags, teamId\)\) return WHITE_WASH;[\s\S]*return CSS_TEAM_ENEMY_COLOR;[\s\S]*\}/,
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
    /if \(cfg\.hp_skip_buildings && target\.isBuilding\) \{[\s\S]*resetIgnoredTargetVisuals\(target\.ignoredColor(?:, false)?\);[\s\S]*return;[\s\S]*\}/,
    "ignore-buildings should skip all buildings, including enemy buildings, before the preset color path",
  );
  assert.match(
    healthbar,
    /if \(!presetApplied\) \{[\s\S]*UnitStatusOverlayAdapter\.setEnemyBarColor\(CSS_TEAM_ENEMY_COLOR\);[\s\S]*scheduleLoop\(LOOP_ENEMY, decision\.delay, decision\.reason\);[\s\S]*return;[\s\S]*\}/,
    "confirmed enemies should stay enemy red until the user preset snapshot is ready",
  );
  assert.match(
    healthbar,
    /if \(pw <= 0\) \{[\s\S]*UnitStatusOverlayAdapter\.setEnemyBarColor\(getHighColor\(\)\);[\s\S]*scheduleLoop\(LOOP_ENEMY, decision\.delay, decision\.reason\)/,
    "confirmed enemies should paint the final high/user color before parent width is ready once preset is ready",
  );
  const loopPolicyHooks = runtimeHooks(runRuntime({ exposeRuntimeTestHooks: true }));
  assert.equal(loopPolicyHooks.enemyLoopDecision({ isBuilding: true }, { skipBuildings: true, buildingFrames: 1 }).action, 1, "loop policy should classify building skip");
  assert.equal(loopPolicyHooks.enemyLoopDecision({ isNeutral: true }, { neutralFrames: 1 }).action, 2, "loop policy should classify neutral");
  assert.equal(loopPolicyHooks.enemyLoopDecision({ isEnemy: false, isFriendly: true }, { friendEnabled: true, nonEnemyFrames: 1 }).reason, "enemy_friend_target", "loop policy should hand friendly targets to ally loop");
  assert.equal(loopPolicyHooks.enemyLoopDecision({ isEnemy: true }, { parentWidth: 0, noParentWidthFrames: 1, presetReady: true }).action, 6, "loop policy should classify zero parent width");
  assert.equal(loopPolicyHooks.enemyLoopDecision({ isEnemy: true }, { parentWidth: 100, barWidth: 70, lastBarWidth: 70, lastParentWidth: 100, colorGeneration: 1, panelGeneration: 1, presetReady: true }).action, 7, "loop policy should classify stable no-change");
  assert.equal(loopPolicyHooks.enemyLoopDecision({ isEnemy: true }, { parentWidth: 100, barWidth: 72, lastHp: 71, low: 25, presetReady: true }).action, 8, "loop policy should classify small above-low change");
  assert.equal(loopPolicyHooks.enemyLoopDecision({ isEnemy: true }, { parentWidth: 100, barWidth: 20, lastHp: 50, low: 25, pulseEnabled: true, pulseThreshold: 25, presetReady: true }).reason, "enemy_pulse", "loop policy should request pulse cadence reason");
  assert.equal(loopPolicyHooks.replayWakeDecision("preset_same_raw", { styleDrift: true }), true, "replay wake should fire for style drift");
  assert.equal(loopPolicyHooks.replayWakeDecision("preset_same_raw", { watchdogSuppressed: true, loopStopped: true }), false, "replay wake watchdog should suppress redundant same-raw wake");

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

test("minimal bullet shields keep enemy and friend overrides after team colors", () => {
  for (const cssPath of [
    path.join(ROOT, "panorama/styles/unit_status.css"),
    path.join(ROOT, "..", "hp_colors_minimal_closure/panorama/styles/unit_status.css"),
  ]) {
    const css = fs.readFileSync(cssPath, "utf8");
    assert.match(
      css,
      /\.team2\s+#unit_healthbar_bullet_shield[\s\S]*?\.enemy\s+#unit_healthbar_bullet_shield[\s\S]*?background-color:\s*#ffffff[\s\S]*?\.friend\s+#unit_healthbar_bullet_shield[\s\S]*?background-color:\s*#ffffff/,
      `${cssPath} should preserve white ignored-target shield overrides`,
    );
  }
});

test("minimal build path guard enforces a directory boundary", () => {
  const build = fs.readFileSync(path.join(ROOT, "..", "build_hp_colors_minimal.ps1"), "utf8");
  assert.ok(build.includes('$fullPath.StartsWith("$rootPrefix\\",'), "build guard should enforce the Windows directory boundary");
  assert.ok(build.includes('$fullPath.StartsWith("$rootPrefix/",'), "build guard should accept slash-normalized paths under root");
});

test("production diagnostics are absent and capture stays default-off", () => {
  const report = getValidationReport();
  assert.equal(report.ok, true);
  const publisher = fs.readFileSync(path.join(ROOT, "panorama/scripts/anita_ui_core.js"), "utf8");
  const healthbar = fs.readFileSync(path.join(ROOT, "panorama/scripts/healthbar_logic.js"), "utf8");
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
    "__hpColorsMinimalDebug",
    "function runtimeDebugEnabled(",
    "function runtimeDebugLog(",
    "function debugLog(",
  ]) {
    assert.equal((publisher + healthbar).includes(term), false, `${term} should be absent from production minimal`);
  }
});

test("fresh Closure output executes minimal bridge, replacement, ally layers, ult transitions, and lifecycle", {
  skip: !process.env.HP_COLORS_MINIMAL_CLOSURE_TEST,
}, () => {
  assert.ok(CLOSURE_SOURCE_ROOT, "Closure source root is required");
  const publisher = runPublisher([
    makePresetPanel("closure_preset", {
      hp_enabled: true,
      hp_color_high: "#123456",
      hp_friend_enabled: false,
    }),
  ], { sourceRoot: CLOSURE_SOURCE_ROOT });
  assert.equal(lastSnapshot(publisher).values.hp_color_high, "#123456");

  const replay = publisher.scheduled.find((item) => item.delay === 1);
  assert.ok(replay, "Closure publisher should schedule a hot replay callback");
  const dispatchCount = publisher.dispatched.length;
  publisher.harness.contextPanel = new MockPanel("ReplacementContext");
  replay.fn();
  assert.equal(publisher.dispatched.length, dispatchCount, "stale Closure publisher replay must not dispatch after root replacement");
  publisher.harness.contextPanel.valid = false;
  publisher.bridgeHandlers[0](JSON.stringify({ magic_word: "HP_COLORS_PRESET_REQUEST" }));
  while (publisher.scheduled.length) publisher.scheduler.takeNext().fn();
  assert.equal(publisher.harness.handlerEntries.length, 0, "Closure publisher must unregister after context death");

  const signaturePublisher = runPublisher([
    makeRawPresetPanel("closure_signature", {
      v: 97,
      values: { hp_low_threshold: 20 },
      o: { hp_low_threshold: [4, 1, 28] },
      hm: "all",
    }),
  ], {
    sourceRoot: CLOSURE_SOURCE_ROOT,
    signatureTiers: { 4: 1 },
    nestedSignature: true,
  });
  const signatureScan = signaturePublisher.scheduler.takeNext();
  assert.ok(signatureScan, "Closure publisher should schedule a signature scan");
  assert.equal(signatureScan.delay, 0.1);
  signaturePublisher.now = signatureScan.due;
  signatureScan.fn();
  assert.equal(
    lastSnapshot(signaturePublisher).values.hp_low_threshold,
    28,
    "Closure signature scan should apply the tier override through nested panel APIs",
  );
  assert.ok(
    signaturePublisher.findCounts.slot_signature_4 > 0,
    "Closure signature scan should resolve the referenced slot",
  );


  const allyRuntime = runRuntime({
    sourceRoot: CLOSURE_SOURCE_ROOT,
    unitStatusClasses: ["friend", "team1"],
    sharedValues: {
      hp_enabled: false,
      hp_friend_enabled: true,
      hp_friend_color_high: "#00ff00",
      hp_friend_heal_color: "#112233",
      hp_friend_delta_color: "#223344",
      hp_friend_bullet_shield_color: "#334455",
    },
  });
  runRuntimeUntil(
    allyRuntime,
    () =>
      normalizeColor(allyRuntime.rb.style.washColor) === "#00ff00" &&
      normalizeColor(allyRuntime.heal.style.washColor) === "#112233" &&
      normalizeColor(allyRuntime.delta.style.washColor) === "#223344" &&
      normalizeColor(allyRuntime.bulletShield.style.backgroundColor) === "#334455",
    "fresh Closure ally loop should paint configured layer colors",
  );

  const ultRuntime = runRuntime({
    sourceRoot: CLOSURE_SOURCE_ROOT,
    sharedValues: { hp_enabled: true, hp_friend_enabled: false },
  });
  runNextRuntimeSchedule(ultRuntime);
  assert.notEqual(normalizeColor(ultRuntime.ult.style.washColor), "", "Closure enemy paint should establish ult wash");
  ultRuntime.unitStatus.RemoveClass("enemy");
  ultRuntime.unitStatus.AddClass("friend");
  ultRuntime.unitStatus.AddClass("building");
  runRuntimeUntil(
    ultRuntime,
    () => normalizeColor(ultRuntime.ult.style.washColor) === "",
    "Closure friendly-building transition should clear ult even with ally coloring disabled",
  );
});
