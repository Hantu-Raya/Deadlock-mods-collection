#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MockPanel,
  createPanoramaHarness,
  createVmContext,
  runInVm,
  buildUnitStatusTree,
  getStyleWriteCount,
  panelHasClass,
  assertObjectFields,
  dispatchClientUiPayload,
} = require('../../scripts/hp-colors-panorama-test-adapter.js');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_TARGET = path.join(ROOT, 'hp_colors', 'panorama', 'scripts', 'healthbar_logic.js');
const targetScript = path.resolve(process.argv[2] || DEFAULT_TARGET);

let activeHarness = null;
let activeTree = null;
let nowMs = 0;
let scheduled = [];
let handlers = {};
let sharedStore = {};
let dispatched = [];
let findCounts = Object.create(null);
let childReadCounts = Object.create(null);
let childReadAllocations = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function syncGlobals() {
  nowMs = activeHarness ? activeHarness.now : 0;
  scheduled = activeHarness ? activeHarness.scheduler.jobs : [];
  handlers = activeHarness ? activeHarness.handlers : {};
  sharedStore = activeHarness ? activeHarness.shared : {};
  dispatched = activeHarness ? activeHarness.dispatches : [];
  findCounts = activeHarness ? activeHarness.findCounts : Object.create(null);
  childReadCounts = activeHarness ? activeHarness.childReadCounts : Object.create(null);
  childReadAllocations = activeHarness ? (activeHarness.childReadCounts.__allocations || 0) : 0;
}

function resetRuntimeHarness() {
  activeHarness = createPanoramaHarness({ now: 0 });
  activeTree = null;
  syncGlobals();
}

function runNextScheduled() {
  activeHarness.scheduler.runNext();
  syncGlobals();
}

function runUntil(predicate, message, limit = 120) {
  activeHarness.scheduler.runUntil(predicate, message, limit);
  syncGlobals();
}

function runUntilBefore(predicate, message, maxElapsedMs, limit = 120) {
  activeHarness.scheduler.runUntilBefore(predicate, message, maxElapsedMs, limit);
  syncGlobals();
}

function runScheduledFor(maxElapsedMs, limit = 200) {
  activeHarness.scheduler.runFor(maxElapsedMs, limit);
  syncGlobals();
}

function buildEnemyHealthbarTree() {
  const previousShared = activeHarness ? { ...activeHarness.shared } : {};
  activeHarness = createPanoramaHarness({ now: activeHarness ? activeHarness.now : 0, shared: previousShared });
  activeTree = buildUnitStatusTree(activeHarness, { barWidth: 82, parentWidth: 100, pipText: '||||', levelText: '12' });
  syncGlobals();
  return activeTree;
}

function resetFindCounts() {
  for (const key of Object.keys(activeHarness.findCounts)) delete activeHarness.findCounts[key];
}

function resetChildReadCounts() {
  for (const key of Object.keys(activeHarness.childReadCounts)) delete activeHarness.childReadCounts[key];
}

function dispatchRuntimeReplay(values) {
  dispatchClientUiPayload(activeHarness, {
    magic_word: 'ANITA_BULK_UPDATE',
    mod_title: 'HP Colors',
    values,
    update_source: 'baked_preset_apply',
    force_emit: true
  });
}

function dispatchPresetSnapshot(values, effectiveValues, options = {}) {
  const payload = {
    magic_word: 'HP_COLORS_PRESET_SNAPSHOT',
    mod_title: 'HP Colors',
    version: 1,
    values_raw: typeof options.valuesRaw === 'string' ? options.valuesRaw : JSON.stringify(values),
    values,
    update_source: 'builder_static'
  };
  if (effectiveValues !== undefined) payload['effective_values'] = effectiveValues;
  dispatchClientUiPayload(activeHarness, payload);
}

function createRuntimeContext(tree, options = {}) {
  activeTree = tree;
  if (!activeHarness) activeHarness = createPanoramaHarness({ now: 0 });
  activeHarness.root = tree.root;
  activeHarness.contextPanel = tree.root;
  if (options.includeGameUI === false) activeHarness.GameUI = undefined;
  syncGlobals();
  return createVmContext(activeHarness, { includeGameUI: options.includeGameUI });
}

function exposeRuntimeTestHooks(source) {
  const marker = "\n  tryApplyDirectBootstrap();";
  const hooks = `
  try {
    var __hpColorsTestStore = GameUI.CustomUIConfig();
    if (__hpColorsTestStore) {
      __hpColorsTestStore.__hpColorsRuntimeTestHooks = {
        classifyTarget: function (teamId, flags) {
          var snapshot = {};
          UnitStatusTargetClassifier.classify(rb, cp, teamId, flags, snapshot);
          return {
            teamId: snapshot.teamId,
            flags: snapshot.flags,
            isEnemy: snapshot.isEnemy,
            isNeutral: snapshot.isNeutral,
            isBuilding: snapshot.isBuilding,
            isFriendly: snapshot.isFriendly,
            isFriendlyBuilding: snapshot.isFriendlyBuilding,
            isEnemyBuilding: UnitStatusTargetClassifier.isEnemyBuilding(flags, teamId),
            isAlly: snapshot.isFriendly || snapshot.isFriendlyBuilding,
            ignoredColor: UnitStatusTargetClassifier.getIgnoredTargetColor(flags, teamId),
            barWidth: snapshot.barWidth,
            parentWidth: snapshot.parentWidth
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
          RuntimeConfigResolver.applyBaseValues(values || {});
          refreshDerivedConfig();
        },
        applySnapshotValues: function (values) {
          return HPPresetRuntimeReplay.applySnapshotValues(values || {}, "event");
        },
        applyConditionalValues: function (values) {
          RuntimeConfigResolver.replaceConditionalValues(values || {});
          refreshDerivedConfig();
        },
        runtimeConfig: function () {
          return {
            baseCfg: JSON.parse(JSON.stringify(baseCfg)),
            conditionalCfg: JSON.parse(JSON.stringify(conditionalCfg)),
            cfg: JSON.parse(JSON.stringify(cfg)),
          };
        },
        readoutPlan: function (values, args) {
          this.applyValues(values);
          args = args || {};
          return HpReadoutPolicy.enemy(
            args.hp || 0,
            args.pulsePlan || { shouldPulse: false, textEnabled: false },
            !!args.hasPipPanel,
            args.pipText || "",
            !!args.hasCounterPanels,
            args.liveBarWidth || 0,
            args.liveBarParentWidth || 0,
            {
              hasPipVisible: false,
              pipVisible: "",
              counterAction: 0,
              current: 0,
              max: 0,
              lowMode: false
            },
            args.liveTotalParentWidth || args.liveBarParentWidth || 0
          );
        },
        enemyPulsePlan: function (values, shouldPulse, now) {
          this.applyValues(values);
          return LowHpPulsePolicy.enemy(!!shouldPulse, now || 0, {
            shouldPulse: false,
            start: false,
            stop: false,
            duration: "",
            intensityIndex: -1,
            textEnabled: false,
            textBrightness: "",
            resetText: false,
            fastSchedule: false
          });
        },
        enemyPaintPlan: function (values, args) {
          this.applyValues(values);
          args = args || {};
          var oldPanelBornAt = panelBornAt;
          if (Object.prototype.hasOwnProperty.call(args, "panelBornAt")) panelBornAt = args.panelBornAt;
          var plan = EnemyHealthPaintPolicy.enemy(
            args.hp || 0,
            Object.prototype.hasOwnProperty.call(args, "prevHp") ? args.prevHp : -1,
            args.now || 0,
            !!args.shouldPulse,
            {
              hasBarVisible: false,
              barVisible: false,
              barColor: "",
              ultColor: "",
              textColor: "",
              nextDelay: 0.15,
              clearPulse: false,
              stopAfterApply: false,
              healColor: "",
              deltaColor: ""
            }
          );
          panelBornAt = oldPanelBornAt;
          return plan;
        },
        killMarkerPlan: function (values, args) {
          this.applyValues(values);
          args = args || {};
          return KillMarkerPolicy.enemy(
            args.show !== false,
            args.parentWidth || 0,
            {
              killMarkerAction: 0,
              killMarkerMissing: false,
              killMarkerCanResolve: false,
              killMarkerReady: args.ready !== false,
              killMarkerBarHidden: !!args.barHidden,
              killMarkerParentWidth: 0,
              killMarkerX: "",
              killMarkerWidth: "",
              killMarkerColor: "",
              killMarkerSig: ""
            }
          );
        },
        levelPlan: function (level, previousLevel, ready) {
          lLv = previousLevel || -1;
          return LevelTierPolicy.level(
            { ready: ready !== false, level: level || 0 },
            { visible: false, tierClass: "", changed: false }
          );
        },
        enemyLoopDecision: function (target, state, now) {
          target = target || {};
          state = state || {};
          var decision = EnemyHealthbarLoopPolicy.decide(target, now || 1000, state, { action: 0, delay: 0, reason: "", hp: 0, shouldPulse: false, pulseFast: false, friendNonEnemy: false });
          return { action: decision.action, delay: decision.delay, reason: decision.reason, hp: decision.hp, shouldPulse: decision.shouldPulse, friendNonEnemy: decision.friendNonEnemy };
        },
        replayWakeDecision: function (state) {
          return ReplayWakePolicy.shouldWakeSameRaw(state || {});
        },
        lifetimeState: function () {
          return {
            active: !runtimeStopped,
            handlerOwned: runtimeEventHandlerId !== null,
            bootstrapRetryQueued: bootstrapRetryQueued,
            quiescentCheckQueued: lifetimeCheckQueued
          };
        },
        queueBootstrapRetry: function (reason) {
          return ensureBootstrapRetry(reason || "overlay_retry");
        }
      };
    }
  } catch (eTestHooks) {}
`;
  const instrumented = source.replace(marker, hooks + marker);
  assert(instrumented !== source, 'runtime test hook marker should be present');
  return instrumented;
}

function getRuntimeTestHooks() {
  const hooks = sharedStore.__hpColorsRuntimeTestHooks;
  assert(hooks && typeof hooks.classifyTarget === 'function', 'runtime test hooks should be exposed');
  return hooks;
}

function assertTargetSnapshot(snapshot, expected, label) {
  assertObjectFields(snapshot, expected, label);
}


function runValidation() {
  let source = fs.readFileSync(targetScript, 'utf8');
  const isOptimizedTarget = targetScript.includes(`${path.sep}hp_colors_closure${path.sep}`);
  if (!isOptimizedTarget) source = exposeRuntimeTestHooks(source);
  assert(!source.includes('GetSettingString') && !source.includes('deadlock_hero_debuts_seen'),
    'healthbar runtime should not read convar storage directly; import/preset paths own compact-token parsing');
  if (!isOptimizedTarget) {
    assert(source.includes('function scheduleLoop'),
      'healthbar runtime should single-flight recurring loop schedules');
    assert(source.includes('loopNextDueAt') && source.includes('loopScheduleToken'),
      'healthbar runtime should expose single-flight scheduler state');
    assert(!/\$\.Schedule\([^,]+,\s*gL\)/.test(source) &&
        !/\$\.Schedule\([^,]+,\s*aL\)/.test(source) &&
        !/\$\.Schedule\([^,]+,\s*lL\)/.test(source),
      'healthbar runtime should route recurring loop schedules through schedule*Loop helpers');
    assert(source.includes('var RuntimeLifetimeOwner = {') &&
        source.includes('$.UnregisterForUnhandledEvent(') &&
        source.includes('bootstrapRetryToken'),
      'healthbar runtime should own listener, schedule, and bootstrap lifetimes');
    assert(!source.includes('$.Schedule(BOOTSTRAP_RETRY_SEC, scheduleBootstrapRetry)') &&
        !source.includes('$.Schedule(BOOTSTRAP_SLOW_RETRY_SEC, scheduleBootstrapRetry)'),
      'healthbar bootstrap retries should use the lifetime-owned single-flight scheduler');
  }
  const forbiddenDebugTokens = [
    'hp' + 'Perf',
    'PER' + 'F_',
    'HP_COLORS_' + 'PER' + 'F_DEBUG',
    '[HP Colors]' + '[SUMMARY]',
    '[HP Colors]' + '[PROFILE]',
    '[HP Colors]' + '[TIMING]',
    '$' + '.Msg'
  ];
  for (const token of forbiddenDebugTokens) {
    assert(!source.includes(token), `healthbar runtime should not ship debug/profiler token: ${token}`);
  }
  if (!isOptimizedTarget) {
    assert(source.includes('styleDriftCleanFrames') &&
        source.includes('STYLE_DRIFT_CHECK_MS') &&
        source.includes('STYLE_DRIFT_CHECK_MID_MS') &&
        source.includes('STYLE_DRIFT_CHECK_SLOW_MS'),
      'healthbar runtime should back off clean idle style-drift checks');
    assert(source.includes('lKzSig === sig'),
      'healthbar runtime should short-circuit unchanged kill-zone marker state');
    assert(!source.includes('redBarNeedsPaint'),
      'healthbar runtime should not score redbar candidates by reading washColor');
    const paintPolicyStart = source.indexOf('var EnemyHealthPaintPolicy = {');
    const paintPolicyEnd = paintPolicyStart >= 0 ? source.indexOf('  function isEnemyPaintWarmup', paintPolicyStart) : -1;
    assert(paintPolicyStart >= 0 && paintPolicyEnd > paintPolicyStart,
      'healthbar runtime should split paint decisions behind narrow policy modules');
    const paintPolicySource = source.slice(paintPolicyStart, paintPolicyEnd);
    for (const policyMarker of ['var HpReadoutPolicy = {', 'var LowHpPulsePolicy = {', 'var EnemyHealthPaintPolicy = {', 'var KillMarkerPolicy = {', 'var AllyHealthPaintPolicy = {', 'var LevelTierPolicy = {', 'var EnemyHealthbarLoopPolicy = {', 'var ReplayWakePolicy = {', 'var LoopSchedulePolicy = {', 'var ENEMY_ACTION_CONTINUE = 0;', 'var ENEMY_ACTION_BUILDING_SKIP = 1;', 'var ENEMY_ACTION_NEUTRAL = 2;', 'var ENEMY_ACTION_NON_ENEMY = 3;', 'var ENEMY_ACTION_WAIT_SETTINGS = 4;', 'var ENEMY_ACTION_WAIT_PRESET = 5;', 'var ENEMY_ACTION_ZERO_WIDTH = 6;', 'var ENEMY_ACTION_STABLE_NO_CHANGE = 7;', 'var ENEMY_ACTION_SMALL_CHANGE = 8;', 'var ENEMY_ACTION_PAINT = 9;', 'var LEVEL_TIERS = [{min:11,cls:"level_tier2"},{min:19,cls:"level_tier3"},{min:27,cls:"level_tier4"},{min:35,cls:"level_tier5"}];']) {
      assert(source.includes(policyMarker), `healthbar runtime missing Phase 4 policy marker: ${policyMarker}`);
    }
    assert(!source.includes('const HealthStatePaintPlan = {'),
      'full healthbar runtime should not keep broad HealthStatePaintPlan');
    for (const adapterTerm of ['FindChildTraverse', 'Children', 'style.', 'AddClass', 'RemoveClass', 'SetHasClass', '$.Schedule']) {
      assert(!paintPolicySource.includes(adapterTerm),
        `Phase 4 paint policies should not contain Panorama adapter term: ${adapterTerm}`);
    }
    const candidateScoreStart =
      source.indexOf('scoreRedBarCandidate: function') >= 0
        ? source.indexOf('scoreRedBarCandidate: function')
        : source.indexOf('function getRedBarCandidateScore');
    const candidateScoreEnd =
      source.indexOf('resetEnemyScanCache: function') > candidateScoreStart
        ? source.indexOf('resetEnemyScanCache: function')
        : source.indexOf('function resetEnemyScanCache');
    assert(candidateScoreStart >= 0 && candidateScoreEnd > candidateScoreStart,
      'healthbar runtime should expose redbar candidate scoring before resetEnemyScanCache');
    const candidateScoreBody = source.slice(candidateScoreStart, candidateScoreEnd);
    assert(!candidateScoreBody.includes('style.washColor') && candidateScoreBody.includes('scanPanelPacked'),
      'redbar candidate scoring should use packed class flags, not style.washColor reads');
    assert(source.includes('lColRaw === color && lCol') &&
        source.includes('lUltRaw === nextRaw && lUlt') &&
        source.includes('lTxtRaw === color && lTxt'),
      'raw color fast paths must repaint after applied caches are invalidated');
    assert(source.includes('stableCurrentRedBarFrames >= 10') &&
        source.includes('CURRENT_RB_IDLE_RESCAN_MS'),
      'child redbar probes should share stable-frame idle backoff without delaying replacement beyond validation window');
    for (const forbiddenId of ['health_bar', 'unit_health', 'ult_icon']) {
      const escaped = forbiddenId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert(!new RegExp(`["']${escaped}["']`).test(source),
        `healthbar runtime should not contain fallback panel id literal: ${forbiddenId}`);
    }
    for (const runtimeMarker of [
      'var UNIT_STATUS_TARGET_SNAPSHOT = {',
      'var UnitStatusTargetClassifier = {',
      'var UnitStatusOverlayAdapter = {',
      'setEnemyBarColor: function (color)',
      'clearUltColor: function ()',
      'hasEnemyBarStyleDrift: function ()',
      'hasEnemyStyleDrift: function ()'
    ]) {
      assert(source.includes(runtimeMarker),
        `healthbar runtime missing classifier/adapter marker: ${runtimeMarker}`);
    }
  }
  const tree = buildEnemyHealthbarTree();
  const context = createRuntimeContext(tree);
  runInVm(source, context, targetScript);

  const values = {
    hp_enabled: true,
    hp_mode: 0,
    hp_bg_visible: true,
    hp_team_colors: false,
    hp_low_threshold: 25,
    hp_high_threshold: 65,
    hp_color_low: '#111111',
    hp_color_mid: '#222222',
    hp_color_high: '#123456',
    hp_heal_color: '#66ff88',
    hp_delta_color: '#ffee66',
    hp_counter_visible: false,
    hp_counter_format: 1,
    hp_pulse_enabled: true,
    hp_pulse_text_enabled: true,
    hp_pulse_color_enabled: true,
    hp_friend_enabled: true,
    hp_friend_pulse_enabled: true,
    hp_friend_pulse_color_enabled: true,
    hp_ult_color_enabled: true,
    hp_kill_zone_enabled: true,
    hp_kill_zone_threshold: 25,
    hp_kill_zone_color: '#fedcba',
    hp_kill_zone_width: 4,
    hp_level_number_visible: false
  };

  dispatchRuntimeReplay(values);
  runUntil(
    () => tree.rb.style.washColor === '#123456',
    `Initial replay did not apply custom high color: ${JSON.stringify(tree.rb.style)}`
  );
  assert(tree.counter.style.visibility === 'collapse',
    `Counter visibility toggle did not collapse HP number: ${JSON.stringify(tree.counter.style)}`);
  assert(tree.ultIcon.style.washColor === '#123456',
    `Runtime optimized profile incorrectly blocked enabled ult icon color: ${JSON.stringify(tree.ultIcon.style)}`);
  assert(tree.killMarker.style.visibility === 'visible',
    `Runtime optimized profile incorrectly blocked enabled kill marker: ${JSON.stringify(tree.killMarker.style)}`);
  assert(tree.heal.style.washColor === '#66ff88',
    `Initial replay did not apply custom healing color: ${JSON.stringify(tree.heal.style)}`);
  assert(tree.delta.style.washColor === '#ffee66',
    `Initial replay did not apply custom damage delta color: ${JSON.stringify(tree.delta.style)}`);

  if (!isOptimizedTarget) {
    const hooks = getRuntimeTestHooks();
    assertTargetSnapshot(
      hooks.classifyTarget(2, 4),
      {
        teamId: 2,
        flags: 4,
        isEnemy: true,
        isBuilding: true,
        isEnemyBuilding: true,
        isFriendlyBuilding: false,
        ignoredColor: '#E16161'
      },
      'enemy building target classification',
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
        ignoredColor: '#ffffff'
      },
      'friendly building target classification',
    );
    assertTargetSnapshot(
      hooks.classifyTarget(0, 2),
      {
        teamId: 0,
        flags: 2,
        isEnemy: false,
        isNeutral: true,
        isBuilding: false,
        ignoredColor: '#5BEFB5'
      },
      'neutral target classification',
    );
    assert(Object.is(hooks.enemyLoopDecision({ isBuilding: true }, { skipBuildings: true, buildingFrames: 1 }).action, 1), 'loop policy should classify building skip');
    assert(Object.is(hooks.enemyLoopDecision({ isNeutral: true }, { neutralFrames: 1 }).action, 2), 'loop policy should classify neutral');
    assert(Object.is(hooks.enemyLoopDecision({ isEnemy: false, isFriendly: true }, { friendEnabled: true, nonEnemyFrames: 1 }).reason, 'enemy_friend_target'), 'loop policy should hand friendly targets to ally loop');
    assert(Object.is(hooks.enemyLoopDecision({ isEnemy: true }, { parentWidth: 0, noParentWidthFrames: 1, presetReady: true }).action, 6), 'loop policy should classify zero parent width');
    assert(Object.is(hooks.enemyLoopDecision({ isEnemy: true }, { parentWidth: 100, barWidth: 70, lastBarWidth: 70, lastParentWidth: 100, colorGeneration: 1, panelGeneration: 1, presetReady: true }).action, 7), 'loop policy should classify stable no-change');
    assert(Object.is(hooks.enemyLoopDecision({ isEnemy: true }, { parentWidth: 100, barWidth: 72, lastHp: 71, low: 25, presetReady: true }).action, 8), 'loop policy should classify small above-low change');
    assert(Object.is(hooks.enemyLoopDecision({ isEnemy: true }, { parentWidth: 100, barWidth: 20, lastHp: 50, low: 25, pulseEnabled: true, pulseThreshold: 25, presetReady: true }).reason, 'enemy_pulse'), 'loop policy should request pulse fast cadence reason');
    assert(Object.is(hooks.replayWakeDecision({ styleDrift: true }), true), 'replay wake should fire for style drift');
    assert(Object.is(hooks.replayWakeDecision({ watchdogSuppressed: true, loopStopped: true }), false), 'replay wake watchdog should suppress redundant same-raw wake');
    assert(Object.is(hooks.replayWakeDecision({}), false), 'stable same-raw replay should not wake any loop');


    assertTargetSnapshot(
      hooks.classifyTarget(0, 0),
      {
        teamId: 0,
        flags: 0,
        isEnemy: false,
        isNeutral: false,
        isBuilding: false,
        ignoredColor: '#E16161'
      },
      'unknown non-enemy target classification',
    );

    const barWashWritesBeforeDuplicateAdapterCalls = getStyleWriteCount(tree.rb, 'washColor');
    const bgVisibilityWritesBeforeDuplicateAdapterCalls = getStyleWriteCount(tree.bg, 'visibility');
    const bgOpacityWritesBeforeDuplicateAdapterCalls = getStyleWriteCount(tree.bg, 'opacity');
    hooks.setEnemyBarColor('#123456');
    hooks.setEnemyBarColor('#123456');
    hooks.setBarVisible(true);
    hooks.setBarVisible(true);
    assert((getStyleWriteCount(tree.rb, 'washColor')) === barWashWritesBeforeDuplicateAdapterCalls,
      'Overlay adapter should not rewrite an already-applied enemy bar color');
    assert((getStyleWriteCount(tree.bg, 'visibility')) === bgVisibilityWritesBeforeDuplicateAdapterCalls &&
        (getStyleWriteCount(tree.bg, 'opacity')) === bgOpacityWritesBeforeDuplicateAdapterCalls,
      'Overlay adapter should not rewrite repeated identical bar visibility');
  }


  dispatchPresetSnapshot(
    { hp_counter_visible: true },
    { hp_counter_visible: false },
  );
  runUntil(
    () => tree.counter.style.visibility === 'collapse',
    `Conditional false toggle did not hide HP number: ${JSON.stringify(tree.counter.style)}`
  );
  dispatchPresetSnapshot({ hp_counter_visible: true }, {});
  runUntil(
    () => tree.counter.style.visibility === 'visible',
    `Counter visibility toggle did not restore HP number: ${JSON.stringify(tree.counter.style)}`
  );
  tree.counterAnchor.layoutHeightReads = 0;
  tree.rb.actuallayoutwidth = 81;
  runUntilBefore(
    () => tree.counter.text === '81%',
    `Small enemy HP changes did not update the HP counter: ${tree.counter.text}`,
    1000
  );
  assert(tree.counterAnchor.layoutHeightReads === 0,
    'Non-pulsing HP counter updates should not read parent layout height');
  const counterStyleWritesBeforeWatchdog =
    (getStyleWriteCount(tree.counter, 'fontSize')) +
    (getStyleWriteCount(tree.counter, 'height')) +
    (getStyleWriteCount(tree.counterAnchor, 'transform'));
  runScheduledFor(6200);
  const counterStyleWritesAfterWatchdog =
    (getStyleWriteCount(tree.counter, 'fontSize')) +
    (getStyleWriteCount(tree.counter, 'height')) +
    (getStyleWriteCount(tree.counterAnchor, 'transform'));
  assert(counterStyleWritesAfterWatchdog === counterStyleWritesBeforeWatchdog,
    'Style watchdog should not rewrite unchanged counter styles');

  const barWashWritesBeforeNameChurn = getStyleWriteCount(tree.rb, 'washColor');
  const counterFontWritesBeforeNameChurn = getStyleWriteCount(tree.counter, 'fontSize');
  const counterHeightWritesBeforeNameChurn = getStyleWriteCount(tree.counter, 'height');
  tree.name.text = 'unit name sample A';
  runScheduledFor(650);
  tree.name.text = 'unit name sample B';
  runScheduledFor(650);
  assert((getStyleWriteCount(tree.rb, 'washColor')) === barWashWritesBeforeNameChurn,
    'Unit name text churn should not invalidate bar color write caches');
  assert((getStyleWriteCount(tree.counter, 'fontSize')) === counterFontWritesBeforeNameChurn &&
      (getStyleWriteCount(tree.counter, 'height')) === counterHeightWritesBeforeNameChurn,
    'Unit name text churn should not invalidate counter style write caches');

  tree.rb.style.washColor = '';
  if (!isOptimizedTarget) {
    assert(getRuntimeTestHooks().hasEnemyBarStyleDrift(),
      'Overlay adapter should report bar style drift after Source 2 clears washColor');
  }
  runUntilBefore(
    () => tree.rb.style.washColor === '#123456',
    `Runtime loop did not repaint a reused healthbar after Source 2 cleared inline color: ${JSON.stringify(tree.rb.style)}`,
    1000
  );
  tree.ultIcon.style.washColor = '';
  runUntilBefore(
    () => tree.ultIcon.style.washColor === '#123456',
    `Runtime loop did not repaint the ult icon after Source 2 cleared its inline color: ${JSON.stringify(tree.ultIcon.style)}`,
    1000
  );

  const oldRb = tree.rb;
  const parent = oldRb.GetParent();
  const replacement = new MockPanel('unit_healthbar_lagging', parent);
  replacement.actuallayoutwidth = oldRb.actuallayoutwidth;
  parent.children = parent.children.filter(child => child !== replacement);
  parent.children.unshift(replacement);
  tree.rb = replacement;
  runUntilBefore(
    () => replacement.style.washColor === '#123456',
    `Runtime loop did not adopt and repaint a new current healthbar while the old panel stayed valid: ${JSON.stringify(replacement.style)}`,
    1500
  );

  const appendedOldRb = tree.rb;
  const appendedParent = appendedOldRb.GetParent();
  const appendedReplacement = new MockPanel('unit_healthbar_lagging', appendedParent);
  appendedReplacement.actuallayoutwidth = appendedOldRb.actuallayoutwidth;
  tree.rb = appendedReplacement;
  runUntilBefore(
    () => appendedReplacement.style.washColor === '#123456',
    `Runtime loop stopped at the cached old healthbar and missed a later same-id replacement: ${JSON.stringify(appendedReplacement.style)}`,
    1500
  );


  appendedReplacement.style.washColor = '';
  dispatchRuntimeReplay(values);
  runUntil(
    () => appendedReplacement.style.washColor === '#123456',
    `Forced replay with identical values did not repaint a reset healthbar: ${JSON.stringify(appendedReplacement.style)}`
  );
  const staleBg = tree.bg;
  const bgParent = staleBg.GetParent();
  const replacementBg = new MockPanel('unit_healthbar_bg', bgParent);
  for (const child of [...staleBg.children]) child.SetParent(replacementBg);
  staleBg.SetParent(null);
  tree.bg = replacementBg;
  dispatchRuntimeReplay(Object.assign({}, values, { hp_bg_visible: false }));
  runUntilBefore(
    () => replacementBg.style.opacity === '0.01',
    `Runtime loop kept writing background visibility to a stale valid panel: ${JSON.stringify(replacementBg.style)}`,
    1800
  );

  const idleStartMs = nowMs;
  while (nowMs - idleStartMs < 2200) runNextScheduled();

  const delayedOldRb = tree.rb;
  const delayedParent = delayedOldRb.GetParent();
  const delayedReplacement = new MockPanel('unit_healthbar_lagging', delayedParent);
  delayedReplacement.actuallayoutwidth = delayedOldRb.actuallayoutwidth;
  delayedParent.children = delayedParent.children.filter(child => child !== delayedReplacement);
  delayedParent.children.unshift(delayedReplacement);
  tree.rb = delayedReplacement;
  scheduled.length = 0;
  dispatched.length = 0;
  const savedSharedStore = { ...sharedStore };
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  dispatchRuntimeReplay({ hp_enabled: true });
  runUntilBefore(
    () => dispatched.some(args => {
      if (args[0] !== 'ClientUI_FireOutput') return false;
      try {
        const payload = JSON.parse(args[1]);
        return payload && payload.magic_word === 'HP_COLORS_PRESET_REQUEST' &&
          payload.reason === 'panel_rebind';
      } catch (err) {
        return false;
      }
    }),
    `Panel rebind did not request a preset snapshot: ${JSON.stringify(dispatched)}`,
    400
  );
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  Object.assign(sharedStore, savedSharedStore);
  runUntilBefore(
    () => delayedReplacement.style.washColor === '#123456',
    `Idle runtime loop did not adopt and repaint a later current healthbar outside the replay window: ${JSON.stringify(delayedReplacement.style)}`,
    2600
  );
  const crossParentTree = buildEnemyHealthbarTree();
  const crossParentContext = createRuntimeContext(crossParentTree);
  runInVm(source, crossParentContext, targetScript);
  dispatchRuntimeReplay(values);
  runUntilBefore(
    () => crossParentTree.rb.style.washColor === '#123456',
    `Cross-parent replacement setup did not paint the original healthbar: ${JSON.stringify(crossParentTree.rb.style)}`,
    1000
  );
  const crossParentOld = crossParentTree.redParent;
  const crossParentReplacementParent = new MockPanel('unit_healthbar_active_parent', crossParentTree.missing);
  const crossParentReplacement = new MockPanel('unit_healthbar_lagging', crossParentReplacementParent);
  crossParentReplacement.actuallayoutwidth = crossParentTree.rb.actuallayoutwidth;
  crossParentTree.missing.children = [
    crossParentReplacementParent,
    crossParentOld,
  ];
  crossParentTree.redParent = crossParentReplacementParent;
  crossParentTree.rb = crossParentReplacement;
  runUntilBefore(
    () => crossParentReplacement.style.washColor === '#123456',
    `Runtime loop did not adopt a healthbar whose still-valid parent was replaced: ${JSON.stringify(crossParentReplacement.style)}`,
    2600
  );

  scheduled.length = 0;
  const lateTree = buildEnemyHealthbarTree();
  const lateContext = createRuntimeContext(lateTree);
  runInVm(source, lateContext, targetScript);
  runUntilBefore(
    () => lateTree.rb.style.washColor === '#123456',
    `Fresh late-spawn runtime did not read shared user preset snapshot: ${JSON.stringify(lateTree.rb.style)}`,
    1000
  );

  scheduled.length = 0;
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const buildingTree = buildEnemyHealthbarTree();
  const buildingContext = createRuntimeContext(buildingTree);
  buildingTree.unitStatus.AddClass('building');
  runInVm(source, buildingContext, targetScript);
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_skip_buildings: true,
    hp_mode: 0,
    hp_team_colors: false,
    hp_color_high: '#00ff00',
    hp_bg_visible: true,
    hp_counter_visible: false,
    hp_pulse_enabled: false,
    hp_friend_enabled: false,
    hp_level_number_visible: false
  });
  runScheduledFor(1000);
  const buildingWash = String(buildingTree.rb.style.washColor || '').toLowerCase();
  assert(buildingWash !== '#00ff00' && buildingWash !== '#123456',
    `Building skip path should not apply runtime/user health colors: ${JSON.stringify(buildingTree.rb.style)}`);
  const buildingWashWrites = getStyleWriteCount(buildingTree.rb, 'washColor');
  runScheduledFor(2200);
  assert((getStyleWriteCount(buildingTree.rb, 'washColor')) === buildingWashWrites,
    'Non-pulsing building skip path should not clear pulse state and rewrite the same bar color every tick');

  scheduled.length = 0;
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const zeroWidthTree = buildEnemyHealthbarTree();
  zeroWidthTree.rb.GetParent().actuallayoutwidth = 0;
  const zeroWidthContext = createRuntimeContext(zeroWidthTree);
  runInVm(source, zeroWidthContext, targetScript);
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_bg_visible: true,
    hp_counter_visible: false,
    hp_pulse_enabled: false,
    hp_friend_enabled: false,
    hp_level_number_visible: false
  });
  const zeroWidthDelays = [];
  for (let i = 0; i < 45 && scheduled.length; i++) {
    scheduled.sort((a, b) => a.dueAt - b.dueAt);
    if (scheduled[0].delay < 2) zeroWidthDelays.push(Number(scheduled[0].delay));
    runNextScheduled();
  }
  assert(zeroWidthDelays.some(delay => Math.abs(delay - 0.35) < 0.001 || Math.abs(delay - 0.75) < 0.001),
    `Repeated zero-parent-width healthbars should back off beyond the fast retry delay: ${zeroWidthDelays.join(',')}`);

  scheduled.length = 0;
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const nonEnemyTree = buildEnemyHealthbarTree();
  nonEnemyTree.unitStatus.RemoveClass('enemy');
  const nonEnemyContext = createRuntimeContext(nonEnemyTree);
  runInVm(source, nonEnemyContext, targetScript);
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_counter_visible: false,
    hp_pulse_enabled: false,
    hp_friend_enabled: false,
    hp_level_number_visible: false
  });
  const nonEnemyDelays = [];
  for (let i = 0; i < 24 && scheduled.length; i++) {
    scheduled.sort((a, b) => a.dueAt - b.dueAt);
    if (scheduled[0].delay < 2) nonEnemyDelays.push(Number(scheduled[0].delay));
    runNextScheduled();
  }
  assert(nonEnemyDelays.some(delay => Math.abs(delay - 0.75) < 0.001 || Math.abs(delay - 1.5) < 0.001),
    `Repeated non-enemy healthbars should back off beyond the first retry delay: ${nonEnemyDelays.join(',')}`);

  scheduled.length = 0;
  resetFindCounts();
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const stableRevalidateTree = buildEnemyHealthbarTree();
  const stableRevalidateContext = createRuntimeContext(stableRevalidateTree);
  runInVm(source, stableRevalidateContext, targetScript);
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_mode: 0,
    hp_team_colors: false,
    hp_color_high: '#336699',
    hp_counter_visible: false,
    hp_pulse_enabled: false,
    hp_friend_enabled: false,
    hp_level_number_visible: false
  });
  runUntilBefore(
    () => stableRevalidateTree.rb.style.washColor === '#336699',
    `Stable revalidation setup did not paint enemy bar: ${JSON.stringify(stableRevalidateTree.rb.style)}`,
    1000
  );
  runScheduledFor(2600);
  resetFindCounts();
  runScheduledFor(9000);
  const stableFindTraversals = findCounts.unit_healthbar_lagging || 0;
  assert(stableFindTraversals <= 48,
    `Stable enemy bar should require at most four full XML-tree revalidations, saw ${stableFindTraversals} unit_healthbar_lagging node traversals`);
  dispatchClientUiPayload(activeHarness, {
    magic_word: 'ANITA_UPDATE',
    mod_title: 'HP Colors',
    setting_id: 'hp_bg_visible',
    value: false
  });
  runUntilBefore(
    () => stableRevalidateTree.bg.style.opacity === '0.01',
    `Live background setting waited for the idle polling backoff: ${JSON.stringify(stableRevalidateTree.bg.style)}`,
    250
  );

  scheduled.length = 0;
  resetFindCounts();
  resetChildReadCounts();
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const duplicateTree = buildEnemyHealthbarTree();
  const duplicateContext = createRuntimeContext(duplicateTree);
  runInVm(source, duplicateContext, targetScript);
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_mode: 0,
    hp_team_colors: false,
    hp_color_high: '#336699',
    hp_counter_visible: false,
    hp_pulse_enabled: false,
    hp_friend_enabled: false,
    hp_level_number_visible: false
  });
  runUntilBefore(
    () => duplicateTree.rb.style.washColor === '#336699',
    `Duplicate red-bar setup did not paint original enemy bar: ${JSON.stringify(duplicateTree.rb.style)}`,
    1000
  );
  const duplicateReplacement = new MockPanel('unit_healthbar_lagging', duplicateTree.rb.GetParent());
  duplicateReplacement.actuallayoutwidth = 84;
  resetFindCounts();
  resetChildReadCounts();
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_mode: 0,
    hp_team_colors: false,
    hp_color_high: '#224466',
    hp_counter_visible: false,
    hp_pulse_enabled: false,
    hp_friend_enabled: false,
    hp_level_number_visible: false
  });
  runUntilBefore(
    () => duplicateReplacement.style.washColor === '#224466',
    `Duplicate red-bar replacement did not adopt new high color: ${JSON.stringify(duplicateReplacement.style)}`,
    1000
  );
  assert((childReadCounts.unit_healthbar_parent || 0) <= 1,
    `Duplicate red-bar adoption should read unit_healthbar_parent Children() at most once, saw ${childReadCounts.unit_healthbar_parent || 0}`);
  assert(childReadAllocations <= 1,
    `Duplicate red-bar adoption should allocate at most one child list, saw ${childReadAllocations}`);

  scheduled.length = 0;
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const presetSnapshotTree = buildEnemyHealthbarTree();
  const presetSnapshotContext = createRuntimeContext(presetSnapshotTree);
  runInVm(source, presetSnapshotContext, targetScript);
  dispatchPresetSnapshot({
    hp_enabled: true,
    hp_mode: 0,
    hp_bg_visible: true,
    hp_team_colors: false,
    hp_color_high: '#a7585a',
    hp_counter_visible: false,
    hp_pulse_enabled: false,
    hp_friend_enabled: false
  });
  runUntilBefore(
    () => presetSnapshotTree.rb.style.washColor === '#a7585a',
    `Minimal preset snapshot bridge did not apply custom high color to full runtime: ${JSON.stringify(presetSnapshotTree.rb.style)}`,
    1000
  );
  assert(presetSnapshotTree.counter.style.visibility === 'collapse',
    `Minimal preset snapshot bridge did not apply counter visibility: ${JSON.stringify(presetSnapshotTree.counter.style)}`);
  const presetSnapshotReplacement = new MockPanel('unit_healthbar_lagging', presetSnapshotTree.rb.GetParent());
  presetSnapshotReplacement.actuallayoutwidth = presetSnapshotTree.rb.actuallayoutwidth;
  presetSnapshotTree.rb = presetSnapshotReplacement;
  dispatchPresetSnapshot({
    hp_enabled: true,
    hp_mode: 0,
    hp_bg_visible: true,
    hp_team_colors: false,
    hp_color_high: '#a7585a',
    hp_counter_visible: false,
    hp_pulse_enabled: false,
    hp_friend_enabled: false
  });
  runUntilBefore(
    () => presetSnapshotReplacement.style.washColor === '#a7585a',
    `Duplicate values_raw preset snapshot did not wake and repaint late enemy healthbar: ${JSON.stringify(presetSnapshotReplacement.style)}`,
    1000
  );

  scheduled.length = 0;
  resetFindCounts();
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const ultDisabledTree = buildEnemyHealthbarTree();
  const ultDisabledContext = createRuntimeContext(ultDisabledTree);
  runInVm(source, ultDisabledContext, targetScript);
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_mode: 0,
    hp_bg_visible: true,
    hp_team_colors: false,
    hp_color_high: '#456789',
    hp_counter_visible: false,
    hp_ult_color_enabled: false,
    hp_ult_color_custom: '#bada55',
    hp_pulse_enabled: false,
    hp_friend_enabled: false
  });
  runUntilBefore(
    () => ultDisabledTree.rb.style.washColor === '#456789',
    `Custom-ult runtime did not apply bar color: ${JSON.stringify(ultDisabledTree.rb.style)}`,
    1000
  );
  assert(ultDisabledTree.ultIcon.style.washColor === '#bada55',
    `Custom ult color setting did not apply when bar-color ult mode was disabled: ${JSON.stringify(ultDisabledTree.ultIcon.style)}`);

  function resetRuntimeHarness() {
    scheduled.length = 0;
    dispatched.length = 0;
    resetFindCounts();
    for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  }

  function bootEnemyCase(extraValues, width = 82, parentWidth = 100) {
    resetRuntimeHarness();
    const caseTree = buildEnemyHealthbarTree();
    caseTree.rb.actuallayoutwidth = width;
    caseTree.rb.GetParent().actuallayoutwidth = parentWidth;
    const caseContext = createRuntimeContext(caseTree);
    runInVm(source, caseContext, targetScript);
    dispatchRuntimeReplay(Object.assign({
      hp_enabled: true,
      hp_bg_visible: true,
      hp_team_colors: false,
      hp_counter_visible: false,
      hp_ult_color_enabled: true,
      hp_pulse_enabled: false,
      hp_friend_enabled: false,
      hp_level_number_visible: false
    }, extraValues));
    return caseTree;
  }

  if (!isOptimizedTarget) {
    bootEnemyCase({ hp_mode: 0, hp_counter_visible: false }, 82, 100);
    const phase4Hooks = getRuntimeTestHooks();
    const fullReadout = phase4Hooks.readoutPlan({
      hp_counter_visible: true,
      hp_counter_format: 0,
      hp_pip_visible: true
    }, {
      hp: 50,
      hasPipPanel: true,
      pipText: '||||',
      hasCounterPanels: true,
      liveBarWidth: 50,
      liveBarParentWidth: 100
    });
    assert(fullReadout.current === 1000 && fullReadout.max === 2000 && fullReadout.counterAction === 1,
      `Full readout format should calculate current/max HP from pip text and ratio: ${JSON.stringify(fullReadout)}`);
    const shieldAdjustedReadout = phase4Hooks.readoutPlan({
      hp_counter_visible: true,
      hp_counter_format: 0,
      hp_pip_visible: true
    }, {
      hp: 100,
      hasPipPanel: true,
      pipText: '|||||',
      hasCounterPanels: true,
      liveBarWidth: 100,
      liveBarParentWidth: 100,
      liveTotalParentWidth: 125
    });
    assert(shieldAdjustedReadout.current === 2000 && shieldAdjustedReadout.max === 2000,
      `Shield capacity should not inflate the base-health readout: ${JSON.stringify(shieldAdjustedReadout)}`);
    const densePipReadout = phase4Hooks.readoutPlan({
      hp_counter_visible: true,
      hp_counter_format: 0,
      hp_pip_visible: true
    }, {
      hp: 100,
      hasPipPanel: true,
      pipText: "'''''''''|'''''''''|'''''''''",
      hasCounterPanels: true,
      liveBarWidth: 100,
      liveBarParentWidth: 100
    });
    assert(densePipReadout.current === 2900 && densePipReadout.max === 2900,
      `Ten-minor-pip readout should calculate 2900 HP instead of 1900: ${JSON.stringify(densePipReadout)}`);
    const precisePipReadout = phase4Hooks.readoutPlan({
      hp_counter_visible: true,
      hp_counter_format: 0,
      hp_pip_visible: true,
      hp_precise_pips_enabled: true
    }, {
      hp: 2990,
      hasPipPanel: true,
      pipText: "'''''''''|".repeat(29) + "'''''''''",
      hasCounterPanels: true,
      liveBarWidth: 100,
      liveBarParentWidth: 100
    });
    assert(precisePipReadout.current === 2990 && precisePipReadout.max === 2990,
      `Precise-pip readout should calculate 2990 HP at full ratio: ${JSON.stringify(precisePipReadout)}`);
    const percentageReadout = phase4Hooks.readoutPlan({
      hp_counter_visible: true,
      hp_counter_format: 1,
      hp_pip_visible: true
    }, {
      hp: 37,
      hasPipPanel: true,
      pipText: 'not-a-pip-count',
      hasCounterPanels: true,
      liveBarWidth: 0,
      liveBarParentWidth: 0
    });
    assert(percentageReadout.current === 37 && percentageReadout.max === 100,
      `Percentage readout should use HP percent directly without parsing pip text: ${JSON.stringify(percentageReadout)}`);
    const currentReadout = phase4Hooks.readoutPlan({
      hp_counter_visible: true,
      hp_counter_format: 2,
      hp_pip_visible: true
    }, {
      hp: 50,
      hasPipPanel: true,
      pipText: '||||',
      hasCounterPanels: true,
      liveBarWidth: 50,
      liveBarParentWidth: 100
    });
    assert(currentReadout.current === 1000 && currentReadout.max === 2000,
      `Current-HP readout should calculate current HP from pip text and ratio: ${JSON.stringify(currentReadout)}`);
    const emptyPipReadout = phase4Hooks.readoutPlan({
      hp_counter_visible: true,
      hp_counter_format: 0,
      hp_pip_visible: true
    }, {
      hp: 10,
      hasPipPanel: true,
      pipText: '',
      hasCounterPanels: true,
      liveBarWidth: 10,
      liveBarParentWidth: 100
    });
    assert(emptyPipReadout.current === 0 && emptyPipReadout.max === 0,
      `Empty/bad pip text should yield a zero max HP readout without throwing: ${JSON.stringify(emptyPipReadout)}`);
    const zeroParentReadout = phase4Hooks.readoutPlan({
      hp_counter_visible: true,
      hp_counter_format: 0,
      hp_pip_visible: true
    }, {
      hp: 0,
      hasPipPanel: true,
      pipText: '||||',
      hasCounterPanels: true,
      liveBarWidth: 50,
      liveBarParentWidth: 0
    });
    assert(zeroParentReadout.current === 0 && zeroParentReadout.max === 2000,
      `Zero parent width should force readout ratio/current to zero: ${JSON.stringify(zeroParentReadout)}`);
    const roundedFullReadout = phase4Hooks.readoutPlan({
      hp_counter_visible: true,
      hp_counter_format: 0,
      hp_pip_visible: true
    }, {
      hp: 97,
      hasPipPanel: true,
      pipText: '||||',
      hasCounterPanels: true,
      liveBarWidth: 97,
      liveBarParentWidth: 100
    });
    assert(roundedFullReadout.current === 2000 && roundedFullReadout.max === 2000,
      `Readout ratio >= 0.97 should round current HP up to max: ${JSON.stringify(roundedFullReadout)}`);
    const hiddenPipReadout = phase4Hooks.readoutPlan({
      hp_counter_visible: true,
      hp_counter_format: 0,
      hp_pip_visible: false
    }, {
      hp: 50,
      hasPipPanel: true,
      pipText: '||||',
      hasCounterPanels: true,
      liveBarWidth: 50,
      liveBarParentWidth: 100
    });
    assert(hiddenPipReadout.hasPipVisible && hiddenPipReadout.pipVisible === 'collapse',
      `Hidden pip setting should collapse only the pip label: ${JSON.stringify(hiddenPipReadout)}`);
    const lowModeReadout = phase4Hooks.readoutPlan({
      hp_counter_visible: true,
      hp_counter_format: 1,
      hp_pip_visible: true
    }, {
      hp: 20,
      hasPipPanel: true,
      hasCounterPanels: true,
      pulsePlan: { shouldPulse: true, textEnabled: true }
    });
    const cssOnlyReadout = phase4Hooks.readoutPlan({
      hp_counter_visible: true,
      hp_counter_format: 1,
      hp_pip_visible: true
    }, {
      hp: 20,
      hasPipPanel: true,
      hasCounterPanels: true,
      pulsePlan: { shouldPulse: true, textEnabled: false }
    });
    assert(lowModeReadout.lowMode === true && cssOnlyReadout.lowMode === false,
      `Readout low-mode styling should follow the pulse text plan only: ${JSON.stringify({ lowModeReadout, cssOnlyReadout })}`);

    const gradientPulsePlan = phase4Hooks.enemyPaintPlan({
      hp_mode: 0,
      hp_color_low: '#000000',
      hp_color_mid: '#808080',
      hp_color_high: '#ffffff',
      hp_pulse_color_enabled: true,
      hp_pulse_color_mode: 1,
      hp_pulse_color: '#ff0000',
      hp_pulse_threshold: 25
    }, { hp: 20, prevHp: 30, now: 5000, shouldPulse: true, panelBornAt: 0 });
    assert(gradientPulsePlan.barColor === '#330000',
      `Gradient pulse color should interpolate from base color toward pulse color by threshold distance: ${JSON.stringify(gradientPulsePlan)}`);
    const warmupPlan = phase4Hooks.enemyPaintPlan({
      hp_mode: 0,
      hp_color_low: '#111111',
      hp_color_high: '#00ff00',
      hp_pulse_color_enabled: true,
      hp_pulse_color: '#ff0000',
      hp_pulse_threshold: 25
    }, { hp: 20, prevHp: -1, now: 1000, shouldPulse: true, panelBornAt: 500 });
    assert(warmupPlan.barColor === '#00ff00' && warmupPlan.clearPulse && warmupPlan.stopAfterApply,
      `Warmup low-HP paint should use high color and suppress pulse/low-color flash: ${JSON.stringify(warmupPlan)}`);
    const normalizedThresholdLowPlan = phase4Hooks.enemyPaintPlan({
      hp_mode: 0,
      hp_low_threshold: 70,
      hp_high_threshold: 30,
      hp_color_low: '#111111',
      hp_color_mid: '#222222',
      hp_color_high: '#333333'
    }, { hp: 70, prevHp: 80, now: 5000, shouldPulse: false, panelBornAt: 0 });
    const normalizedThresholdHighPlan = phase4Hooks.enemyPaintPlan({
      hp_mode: 0,
      hp_low_threshold: 70,
      hp_high_threshold: 30,
      hp_color_low: '#111111',
      hp_color_mid: '#222222',
      hp_color_high: '#333333'
    }, { hp: 71, prevHp: 80, now: 5000, shouldPulse: false, panelBornAt: 0 });
    assert(normalizedThresholdLowPlan.barColor === '#111111' && normalizedThresholdHighPlan.barColor === '#333333',
      `High threshold below low threshold should normalize high to low: ${JSON.stringify({ normalizedThresholdLowPlan, normalizedThresholdHighPlan })}`);
    const killHiddenPlan = phase4Hooks.killMarkerPlan({
      hp_kill_zone_enabled: true,
      hp_kill_zone_threshold: 50,
      hp_kill_zone_width: 4
    }, { show: false, parentWidth: 100, ready: true });
    assert(killHiddenPlan.killMarkerAction === 2,
      `Kill marker should hide when disabled by the caller: ${JSON.stringify(killHiddenPlan)}`);
    const killClampLowPlan = phase4Hooks.killMarkerPlan({
      hp_kill_zone_enabled: true,
      hp_kill_zone_threshold: -20,
      hp_kill_zone_width: 0,
      hp_kill_zone_color: '#AaBbCc'
    }, { show: true, parentWidth: 100, ready: true });
    assert(killClampLowPlan.killMarkerAction === 1 &&
        killClampLowPlan.killMarkerX === '0px' &&
        killClampLowPlan.killMarkerWidth === '1px' &&
        killClampLowPlan.killMarkerColor === '#aabbcc',
      `Kill marker should clamp low threshold/width and normalize color: ${JSON.stringify(killClampLowPlan)}`);
    const killClampHighPlan = phase4Hooks.killMarkerPlan({
      hp_kill_zone_enabled: true,
      hp_kill_zone_threshold: 200,
      hp_kill_zone_width: 200,
      hp_kill_zone_color: '#112233'
    }, { show: true, parentWidth: 100, ready: true });
    assert(killClampHighPlan.killMarkerAction === 1 &&
        killClampHighPlan.killMarkerX === '0px' &&
        killClampHighPlan.killMarkerWidth === '100px' &&
        killClampHighPlan.killMarkerColor === '#112233',
      `Kill marker should clamp high threshold/width into the parent bounds: ${JSON.stringify(killClampHighPlan)}`);
    const killBarHiddenPlan = phase4Hooks.killMarkerPlan({
      hp_kill_zone_enabled: true
    }, { show: true, parentWidth: 100, ready: true, barHidden: true });
    assert(killBarHiddenPlan.killMarkerAction === 2,
      `Kill marker should hide when the healthbar background is effectively hidden: ${JSON.stringify(killBarHiddenPlan)}`);
    const directLevelCases = [
      [10, ''],
      [11, 'level_tier2'],
      [18, 'level_tier2'],
      [19, 'level_tier3'],
      [26, 'level_tier3'],
      [27, 'level_tier4'],
      [34, 'level_tier4'],
      [35, 'level_tier5']
    ];
    for (const [level, tierClass] of directLevelCases) {
      const plan = phase4Hooks.levelPlan(level, -1, true);
      assert(plan.visible === true && plan.changed === true && plan.tierClass === tierClass,
        `Level ${level} should map to ${tierClass || 'no tier'}: ${JSON.stringify(plan)}`);
    }
  }

  resetRuntimeHarness();
  const shieldHealthTree = buildEnemyHealthbarTree();
  shieldHealthTree.redParent.actuallayoutwidth = 125;
  shieldHealthTree.rb.actuallayoutwidth = 100;
  shieldHealthTree.bulletShield.actuallayoutwidth = 25;
  shieldHealthTree.pip.text = '|||||';
  const shieldHealthContext = createRuntimeContext(shieldHealthTree);
  runInVm(source, shieldHealthContext, targetScript);
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_mode: 0,
    hp_color_low: '#654321',
    hp_color_high: '#123456',
    hp_counter_visible: true,
    hp_counter_format: 0,
    hp_pulse_enabled: true,
    hp_pulse_threshold: 25,
    hp_pulse_text_enabled: false,
    hp_friend_enabled: false,
    hp_level_number_visible: false
  });
  runUntilBefore(
    () => shieldHealthTree.rb.style.washColor === '#123456' &&
      shieldHealthTree.counter.text === '2000 / 2000',
    `A full base-health pool with shields should remain high HP: ${JSON.stringify({
      bar: shieldHealthTree.rb.style,
      counter: shieldHealthTree.counter.text
    })}`,
    1000
  );
  shieldHealthTree.rb.actuallayoutwidth = 20;
  runUntilBefore(
    () => shieldHealthTree.rb.style.washColor === '#654321' &&
      shieldHealthTree.counter.text === '400 / 2000' &&
      shieldHealthTree.rb.classes.has('low_hp_pulsing'),
    `Shield capacity distorted low-health color, pulse, or counter state: ${JSON.stringify({
      bar: shieldHealthTree.rb.style,
      classes: Array.from(shieldHealthTree.rb.classes),
      counter: shieldHealthTree.counter.text
    })}`,
    1000
  );

  const highCase = bootEnemyCase({
    hp_mode: 0,
    hp_color_high: '#123456'
  }, 82, 100);
  runUntilBefore(() => highCase.rb.style.washColor === '#123456',
    `Enemy fixed high did not paint configured color: ${JSON.stringify(highCase.rb.style)}`, 1000);
  assert(highCase.ultIcon.style.washColor === '#123456',
    `Enemy fixed high did not paint ult icon: ${JSON.stringify(highCase.ultIcon.style)}`);

  const midCase = bootEnemyCase({
    hp_mode: 0,
    hp_color_mid: '#222222'
  }, 50, 100);
  runUntilBefore(() => midCase.rb.style.washColor === '#222222',
    `Enemy fixed mid did not paint configured color: ${JSON.stringify(midCase.rb.style)}`, 1000);

  const lowCase = bootEnemyCase({
    hp_mode: 0,
    hp_color_low: '#111111'
  }, 20, 100);
  runUntilBefore(() => lowCase.rb.style.washColor === '#111111',
    `Enemy fixed low did not paint configured color: ${JSON.stringify(lowCase.rb.style)}`, 1000);

  const gradientCase = bootEnemyCase({
    hp_mode: 1,
    hp_low_threshold: 25,
    hp_high_threshold: 75,
    hp_color_low: '#000000',
    hp_color_mid: '#808080',
    hp_color_high: '#ffffff'
  }, 50, 100);
  runUntilBefore(() => gradientCase.rb.style.washColor === '#404040',
    `Enemy gradient mid did not interpolate to #404040: ${JSON.stringify(gradientCase.rb.style)}`, 1000);

  const pulseCase = bootEnemyCase({
    hp_mode: 0,
    hp_color_low: '#111111',
    hp_pulse_enabled: true,
    hp_pulse_threshold: 25,
    hp_pulse_color_enabled: true,
    hp_pulse_color: '#FF2222',
    hp_pulse_color_mode: 0,
    hp_pulse_bpm: 75
  }, 20, 100);
  runUntilBefore(() => pulseCase.rb.style.washColor === '#ff2222',
    `Enemy pulse fixed color did not paint pulse color: ${JSON.stringify(pulseCase.rb.style)}`, 1000);
  assert(pulseCase.rb.classes.has('low_hp_pulsing') && pulseCase.rb.style.animationDuration === '0.800s',
    `Enemy pulse did not apply class/duration: ${JSON.stringify(pulseCase.rb.style)}`);
  pulseCase.rb.actuallayoutwidth = 80;
  runUntilBefore(() => !pulseCase.rb.classes.has('low_hp_pulsing'),
    `Enemy pulse did not stop after health recovered above the pulse threshold: ${JSON.stringify(pulseCase.rb.style)}`, 1000);
  const pulseThresholdCrossingCase = bootEnemyCase({
    hp_mode: 0,
    hp_low_threshold: 25,
    hp_pulse_enabled: true,
    hp_pulse_text_enabled: false,
    hp_pulse_threshold: 50,
    hp_pulse_bpm: 120
  }, 50, 100);
  runUntilBefore(() => pulseThresholdCrossingCase.rb.classes.has('low_hp_pulsing'),
    `Enemy pulse did not start at the configured custom threshold: ${JSON.stringify(pulseThresholdCrossingCase.rb.style)}`, 1000);
  pulseThresholdCrossingCase.rb.actuallayoutwidth = 51;
  runUntilBefore(() => !pulseThresholdCrossingCase.rb.classes.has('low_hp_pulsing'),
    `Enemy pulse did not stop after a one-percent threshold crossing: ${JSON.stringify(pulseThresholdCrossingCase.rb.style)}`, 1000);

  const thresholdZeroPulseCase = bootEnemyCase({
    hp_mode: 0,
    hp_color_low: '#111111',
    hp_pulse_enabled: true,
    hp_pulse_threshold: 0,
    hp_pulse_bpm: 120
  }, 0, 100);
  runUntilBefore(() => thresholdZeroPulseCase.rb.classes.has('low_hp_pulsing'),
    `Threshold 0 should pulse at exactly zero HP: ${JSON.stringify(thresholdZeroPulseCase.rb.style)}`, 1000);

  const thresholdZeroNoPulseCase = bootEnemyCase({
    hp_mode: 0,
    hp_color_low: '#111111',
    hp_pulse_enabled: true,
    hp_pulse_threshold: 0,
    hp_pulse_bpm: 120
  }, 1, 100);
  runScheduledFor(350);
  assert(!thresholdZeroNoPulseCase.rb.classes.has('low_hp_pulsing'),
    `Threshold 0 should not pulse above zero HP: ${JSON.stringify(thresholdZeroNoPulseCase.rb.style)}`);

  const thresholdHundredPulseCase = bootEnemyCase({
    hp_mode: 0,
    hp_color_high: '#00ff00',
    hp_pulse_enabled: true,
    hp_pulse_threshold: 100,
    hp_pulse_bpm: 120
  }, 100, 100);
  runUntilBefore(() => thresholdHundredPulseCase.rb.classes.has('low_hp_pulsing'),
    `Threshold 100 should pulse at full HP: ${JSON.stringify(thresholdHundredPulseCase.rb.style)}`, 1000);

  const hideBarPulseCase = bootEnemyCase({
    hp_mode: 0,
    hp_color_low: '#111111',
    hp_bg_visible: true,
    hp_pulse_enabled: true,
    hp_pulse_threshold: 25,
    hp_pulse_hide_bar: true,
    hp_pulse_bpm: 120
  }, 20, 100);
  runUntilBefore(() => hideBarPulseCase.rb.classes.has('low_hp_pulsing') &&
      hideBarPulseCase.bg.style.visibility === 'visible' &&
      hideBarPulseCase.bg.style.opacity === '0.01',
    `Pulse hide-bar path should keep bg visible and lower opacity instead of deleting panels: ${JSON.stringify(hideBarPulseCase.bg.style)}`,
    1000);


  const cssOnlyPulseBackoffCase = bootEnemyCase({
    hp_mode: 0,
    hp_color_low: '#111111',
    hp_pulse_enabled: true,
    hp_pulse_text_enabled: false,
    hp_pulse_threshold: 25,
    hp_pulse_color_enabled: false,
    hp_pulse_bpm: 75
  }, 20, 100);
  runUntilBefore(() => cssOnlyPulseBackoffCase.rb.classes.has('low_hp_pulsing') &&
      cssOnlyPulseBackoffCase.rb.style.animationDuration === '0.800s',
    `CSS-only enemy pulse did not paint class/duration: ${JSON.stringify(cssOnlyPulseBackoffCase.rb.style)}`, 1000);
  const cssOnlyPulseStableDelays = [];
  for (let i = 0; i < 8 && scheduled.length; i++) {
    scheduled.sort((a, b) => a.dueAt - b.dueAt);
    if (scheduled[0].delay < 2) cssOnlyPulseStableDelays.push(Number(scheduled[0].delay));
    runNextScheduled();
  }
  assert(cssOnlyPulseStableDelays.some(delay => delay > 0.15),
    `CSS-only pulse should back off stable no-change callbacks beyond hot JS cadence: ${cssOnlyPulseStableDelays.join(',')}`);

  const wrongTitleTree = bootEnemyCase({ hp_mode: 0, hp_color_high: '#123456' }, 82, 100);
  runUntilBefore(() => wrongTitleTree.rb.style.washColor === '#123456',
    `Wrong-title baseline did not paint: ${JSON.stringify(wrongTitleTree.rb.style)}`, 1000);
  handlers.ClientUI_FireOutput(JSON.stringify({
    magic_word: 'HP_COLORS_PRESET_SNAPSHOT',
    mod_title: 'Other Mod',
    values: { hp_color_high: '#010203' }
  }));
  runScheduledFor(300);
  assert(wrongTitleTree.rb.style.washColor !== '#010203',
    `Wrong-title preset snapshot repainted HP Colors bar: ${JSON.stringify(wrongTitleTree.rb.style)}`);

  const counterCase = bootEnemyCase({
    hp_mode: 0,
    hp_counter_visible: true,
    hp_counter_format: 0,
    hp_pulse_enabled: false
  }, 50, 100);
  counterCase.pip.text = '||||';
  runUntilBefore(() => counterCase.counter.text === '1000 / 2000',
    `Counter full format did not show 1000 / 2000: ${counterCase.counter.text}`, 1000);

  const currentCounterCase = bootEnemyCase({
    hp_mode: 0,
    hp_counter_visible: true,
    hp_counter_format: 2,
    hp_pulse_enabled: false
  }, 50, 100);
  currentCounterCase.pip.text = '||||';
  runUntilBefore(() => currentCounterCase.counter.text === '1000',
    `Counter current-HP format did not show current HP from pips: ${currentCounterCase.counter.text}`, 1000);

  const badPipCounterCase = bootEnemyCase({
    hp_mode: 0,
    hp_counter_visible: true,
    hp_counter_format: 0,
    hp_pulse_enabled: false
  }, 50, 100);
  badPipCounterCase.pip.text = 'not hp text';
  runUntilBefore(() => badPipCounterCase.counter.text === '0 / 0',
    `Bad pip text should yield 0 / 0 without throwing: ${badPipCounterCase.counter.text}`, 1000);

  const roundedCounterCase = bootEnemyCase({
    hp_mode: 0,
    hp_counter_visible: true,
    hp_counter_format: 0,
    hp_pulse_enabled: false
  }, 97, 100);
  roundedCounterCase.pip.text = '||||';
  runUntilBefore(() => roundedCounterCase.counter.text === '2000 / 2000',
    `Counter ratio >= 0.97 did not round current HP to max: ${roundedCounterCase.counter.text}`, 1000);

  const hiddenPipCase = bootEnemyCase({
    hp_mode: 0,
    hp_counter_visible: true,
    hp_counter_format: 1,
    hp_pip_visible: false,
    hp_pulse_enabled: false
  }, 37, 100);
  runUntilBefore(() => hiddenPipCase.counter.text === '37%' &&
      hiddenPipCase.pip.style.visibility === 'collapse',
    `Hidden pip setting should collapse pips while keeping percentage readout: ${JSON.stringify({ counter: hiddenPipCase.counter.text, pip: hiddenPipCase.pip.style })}`,
    1000);

  function setPanelText(panel, text) {
    panel.text = text;
    panel.SetAttributeString('text', text);
  }

  function assertLevelTier(tree, text, expectedTier) {
    setPanelText(tree.level, text);
    const allTiers = ['level_tier2', 'level_tier3', 'level_tier4', 'level_tier5'];
    runUntilBefore(() => allTiers.every(cls => tree.unitStatus.classes.has(cls) === (cls === expectedTier)),
      `Level ${JSON.stringify(text)} did not apply ${expectedTier || 'no tier'}: ${JSON.stringify(Array.from(tree.unitStatus.classes))}`,
      1000);
  }

  const levelCase = bootEnemyCase({
    hp_level_number_visible: true,
    hp_counter_visible: false,
    hp_pulse_enabled: false
  }, 82, 100);
  assertLevelTier(levelCase, '10', '');
  assertLevelTier(levelCase, '11', 'level_tier2');
  assertLevelTier(levelCase, '18', 'level_tier2');
  assertLevelTier(levelCase, '19', 'level_tier3');
  assertLevelTier(levelCase, '26', 'level_tier3');
  assertLevelTier(levelCase, '27', 'level_tier4');
  assertLevelTier(levelCase, '34', 'level_tier4');
  assertLevelTier(levelCase, '35', 'level_tier5');
  setPanelText(levelCase.level, '');
  runScheduledFor(600);
  assert(levelCase.unitStatus.classes.has('level_tier5'),
    `Empty level text should be ignored without clearing the last valid tier: ${JSON.stringify(Array.from(levelCase.unitStatus.classes))}`);
  setPanelText(levelCase.level, '{s:hero_level}');
  runScheduledFor(600);
  assert(levelCase.unitStatus.classes.has('level_tier5'),
    `Placeholder level text should be ignored without clearing the last valid tier: ${JSON.stringify(Array.from(levelCase.unitStatus.classes))}`);
  assertLevelTier(levelCase, '10', '');


  const pulseTextCase = bootEnemyCase({
    hp_mode: 0,
    hp_counter_visible: true,
    hp_counter_format: 1,
    hp_pulse_enabled: true,
    hp_pulse_threshold: 25,
    hp_pulse_text_enabled: true,
    hp_pulse_text_scale: 160,
    hp_pulse_text_position: '20,196'
  }, 20, 100);
  runUntilBefore(() => String(pulseTextCase.counter.style.brightness || '').length > 0,
    `Pulse text did not write brightness: ${JSON.stringify(pulseTextCase.counter.style)}`, 1000);
  assert(pulseTextCase.counter.style.fontSize === '160px' &&
      String(pulseTextCase.counter.style.height || '').length > 0 &&
      String(pulseTextCase.counterAnchor.style.transform || '').includes('translate3d(20px, 46px, 0px)'),
    `Pulse text style/position mismatch: ${JSON.stringify({ counter: pulseTextCase.counter.style, anchor: pulseTextCase.counterAnchor.style })}`);
  dispatchRuntimeReplay({
    hp_pulse_text_enabled: false
  });
  runUntilBefore(() => pulseTextCase.counter.style.brightness === '',
    `Disabling pulse text should clear HP number brightness: ${JSON.stringify(pulseTextCase.counter.style)}`,
    1000);
  const textDisabledDelays = [];
  for (let i = 0; i < 6 && scheduled.length; i++) {
    scheduled.sort((a, b) => a.dueAt - b.dueAt);
    if (scheduled[0].delay < 2) textDisabledDelays.push(Number(scheduled[0].delay));
    runNextScheduled();
  }
  assert(textDisabledDelays.some(delay => delay > 0.15),
    `Text-disabled pulse should not keep hot JS cadence after clearing brightness: ${textDisabledDelays.join(',')}`);


  const friendHighTree = bootEnemyCase({
    hp_mode: 0,
    hp_team_colors: true,
    hp_friend_enabled: true,
    hp_friend_color_high: '#abcdef'
  }, 80, 100);
  friendHighTree.unitStatus.classes.delete('enemy');
  friendHighTree.unitStatus.AddClass('friend');
  friendHighTree.unitStatus.AddClass('player');
  runUntilBefore(() => friendHighTree.rb.style.washColor === '#ffc961' &&
      friendHighTree.ultIcon.style.washColor === '#ffc961',
    `Team-color high HP mode should apply to ally bars and ult icons: ${JSON.stringify({
      bar: friendHighTree.rb.style,
      ult: friendHighTree.ultIcon.style
    })}`, 1000);

  resetRuntimeHarness();
  const friendShieldTree = buildEnemyHealthbarTree();
  friendShieldTree.unitStatus.classes.delete('enemy');
  friendShieldTree.unitStatus.AddClass('friend');
  friendShieldTree.unitStatus.AddClass('player');
  friendShieldTree.redParent.actuallayoutwidth = 125;
  friendShieldTree.rb.actuallayoutwidth = 100;
  friendShieldTree.techShield.actuallayoutwidth = 25;
  const friendShieldContext = createRuntimeContext(friendShieldTree);
  runInVm(source, friendShieldContext, targetScript);
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_mode: 0,
    hp_friend_enabled: true,
    hp_friend_color_high: '#abcdef',
    hp_friend_pulse_enabled: false,
    hp_counter_visible: false,
    hp_pulse_enabled: false,
    hp_level_number_visible: false
  });
  runUntilBefore(() => friendShieldTree.rb.style.washColor === '#abcdef' &&
      friendShieldTree.ultIcon.style.washColor === '#abcdef',
    `Ally tech shield capacity should not lower the base-health state or desync the ult icon: ${JSON.stringify({
      bar: friendShieldTree.rb.style,
      ult: friendShieldTree.ultIcon.style
    })}`, 1000);

  const friendUltResetTree = bootEnemyCase({
    hp_mode: 0,
    hp_color_high: '#112233',
    hp_friend_enabled: true,
    hp_friend_color_high: '#abcdef'
  }, 80, 100);
  runUntilBefore(() => friendUltResetTree.ultIcon.style.washColor === '#112233',
    `Friendly ult reset setup did not paint the enemy ult icon: ${JSON.stringify(friendUltResetTree.ultIcon.style)}`, 1000);
  friendUltResetTree.unitStatus.classes.delete('enemy');
  friendUltResetTree.unitStatus.AddClass('friend');
  friendUltResetTree.unitStatus.AddClass('player');
  runUntilBefore(() => friendUltResetTree.rb.style.washColor === '#abcdef' &&
      friendUltResetTree.ultIcon.style.washColor === '#abcdef',
    `Reused friendly healthbar did not replace enemy ult wash with ally color: ${JSON.stringify({
      bar: friendUltResetTree.rb.style,
      ult: friendUltResetTree.ultIcon.style
    })}`, 1000);

  const friendCustomUltTree = bootEnemyCase({
    hp_mode: 0,
    hp_friend_enabled: true,
    hp_friend_color_high: '#abcdef',
    hp_ult_color_enabled: false,
    hp_ult_color_custom: '#fedcba'
  }, 80, 100);
  friendCustomUltTree.unitStatus.classes.delete('enemy');
  friendCustomUltTree.unitStatus.AddClass('friend');
  friendCustomUltTree.unitStatus.AddClass('player');
  runUntilBefore(() => friendCustomUltTree.rb.style.washColor === '#abcdef' &&
      friendCustomUltTree.ultIcon.style.washColor === '#fedcba',
    `Shared custom ult color did not apply to ally healthbars: ${JSON.stringify({
      bar: friendCustomUltTree.rb.style,
      ult: friendCustomUltTree.ultIcon.style
    })}`, 1000);

  const friendLowTree = bootEnemyCase({
    hp_mode: 0,
    hp_friend_enabled: true,
    hp_friend_color_low: '#654321',
    hp_friend_pulse_enabled: false
  }, 20, 100);


  friendLowTree.unitStatus.classes.delete('enemy');
  friendLowTree.unitStatus.AddClass('friend');
  friendLowTree.unitStatus.AddClass('player');
  runUntilBefore(() => friendLowTree.rb.style.washColor === '#654321',
    `Ally fixed low did not paint friend low color: ${JSON.stringify(friendLowTree.rb.style)}`, 1000);

  const friendPulseTree = bootEnemyCase({
    hp_mode: 0,
    hp_friend_enabled: true,
    hp_friend_color_low: '#654321',
    hp_friend_pulse_enabled: true,
    hp_friend_pulse_threshold: 100,
    hp_friend_pulse_bpm: 30,
    hp_friend_pulse_intensity: 0,
    hp_friend_pulse_color_enabled: true,
    hp_friend_pulse_color: '#abcdef',
    hp_pulse_enabled: true,
    hp_pulse_threshold: 100,
    hp_pulse_bpm: 300,
    hp_pulse_intensity: 2,
    hp_pulse_text_enabled: true
  }, 80, 100);
  friendPulseTree.unitStatus.classes.delete('enemy');
  friendPulseTree.unitStatus.AddClass('friend');
  friendPulseTree.unitStatus.AddClass('player');
  runUntilBefore(() => friendPulseTree.rb.classes.has('low_hp_pulsing'),
    `Ally pulse did not start from friend pulse settings: ${JSON.stringify(friendPulseTree.rb.style)}`, 1000);
  assert(friendPulseTree.rb.style.animationDuration === '2.000s' &&
      friendPulseTree.rb.classes.has('pulse_subtle') &&
      !friendPulseTree.rb.classes.has('pulse_intense') &&
      friendPulseTree.rb.style.washColor === '#abcdef',
    `Ally pulse should use friend BPM/intensity/color, not enemy pulse settings: ${JSON.stringify({ style: friendPulseTree.rb.style, classes: Array.from(friendPulseTree.rb.classes) })}`);

  const idCase = bootEnemyCase({ hp_mode: 0, hp_color_high: '#456789' }, 82, 100);
  runUntilBefore(() => idCase.rb.style.washColor === '#456789',
    `Verified-ID case did not paint: ${JSON.stringify(idCase.rb.style)}`, 1000);
  assert(!findCounts.health_bar && !findCounts.unit_health && !findCounts.ult_icon,
    `Runtime traversed forbidden fallback ids: ${JSON.stringify(findCounts)}`);

  const allyResetTree = bootEnemyCase({
    hp_mode: 0,
    hp_friend_enabled: true,
    hp_friend_color_high: '#2468ac',
    hp_friend_pulse_enabled: false
  }, 80, 100);
  allyResetTree.unitStatus.classes.delete('enemy');
  allyResetTree.unitStatus.AddClass('friend');
  allyResetTree.unitStatus.AddClass('player');
  runUntilBefore(() => allyResetTree.rb.style.washColor === '#2468ac',
    `Ally match-reset baseline did not paint friend color: ${JSON.stringify(allyResetTree.rb.style)}`, 1000);

  sharedStore.__hpColorsMatchReset = {
    token: 'unit-test-ally-reset-1',
    reason: 'unit_test',
    gameState: 7,
    gameTime: 0,
    at: nowMs
  };
  runUntilBefore(() => sharedStore.__hpColorsMatchResetAck &&
      sharedStore.__hpColorsMatchResetAck.token === 'unit-test-ally-reset-1' &&
      allyResetTree.rb.style.washColor === '#2468ac',
    `Ally match reset did not ack/repaint: ${JSON.stringify({ ack: sharedStore.__hpColorsMatchResetAck, style: allyResetTree.rb.style })}`,
    1000);

  scheduled.length = 0;
  dispatched.length = 0;
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const matchResetTree = buildEnemyHealthbarTree();
  const matchResetContext = createRuntimeContext(matchResetTree);
  runInVm(source, matchResetContext, targetScript);
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_mode: 0,
    hp_bg_visible: true,
    hp_team_colors: false,
    hp_color_high: '#345678',
    hp_counter_visible: false,
    hp_pulse_enabled: false,
    hp_friend_enabled: false
  });
  runUntilBefore(
    () => matchResetTree.rb.style.washColor === '#345678',
    `Match-reset baseline did not apply before token reset: ${JSON.stringify(matchResetTree.rb.style)}`,
    1000
  );
  if (sharedStore.__hpColorsPresetRequests) sharedStore.__hpColorsPresetRequests.last = 0;
  sharedStore.__hpColorsMatchReset = { token: 'unit-test-match-1', reason: 'unit_test', gameState: 7, gameTime: 0, at: nowMs };
  matchResetTree.rb.style.washColor = '';
  runUntilBefore(
    () => matchResetTree.rb.style.washColor === '#345678',
    `Match reset token did not repaint current healthbar: ${JSON.stringify(matchResetTree.rb.style)}`,
    1000
  );
  runUntilBefore(
    () => dispatched.some(args => {
      if (args[0] !== 'ClientUI_FireOutput') return false;
      try {
        const payload = JSON.parse(args[1]);
        return payload && payload.magic_word === 'HP_COLORS_PRESET_REQUEST' &&
          payload.reason === 'match_reset';
      } catch (err) {
        return false;
      }
    }),
    `Match reset did not request preset snapshot: ${JSON.stringify(dispatched)}`,
    1000
  );

  const staleTokenAt = sharedStore.__hpColorsMatchReset.at;
  assert(sharedStore.__hpColorsMatchResetAck &&
      sharedStore.__hpColorsMatchResetAck.token === 'unit-test-match-1',
    `Match reset consumer did not write shared ack token: ${JSON.stringify(sharedStore.__hpColorsMatchResetAck || null)}`);
  while (nowMs - staleTokenAt <= 2500) runNextScheduled();
  scheduled.length = 0;
  dispatched.length = 0;
  const staleTokenTree = buildEnemyHealthbarTree();
  const staleTokenContext = createRuntimeContext(staleTokenTree);
  runInVm(source, staleTokenContext, targetScript);
  for (let i = 0; i < 5 && scheduled.length; i++) runNextScheduled();
  assert(!dispatched.some(args => {
    if (args[0] !== 'ClientUI_FireOutput') return false;
    try {
      const payload = JSON.parse(args[1]);
      return payload && payload.magic_word === 'HP_COLORS_PRESET_REQUEST' &&
        payload.reason === 'match_reset';
    } catch (err) {
      return false;
    }
  }), `Fresh late overlay should skip already-acked stale match token: ${JSON.stringify(dispatched)}`);

  scheduled.length = 0;
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const defaultGreenTree = buildEnemyHealthbarTree();
  const defaultGreenContext = createRuntimeContext(defaultGreenTree, {
    includeGameUI: false
  });
  runInVm(source, defaultGreenContext, targetScript);
  runUntilBefore(
    () => String(defaultGreenTree.rb.style.washColor || '').length > 0,
    `No-token default runtime should paint without waiting for the full bootstrap window: ${JSON.stringify(defaultGreenTree.rb.style)}`,
    900
  );

  scheduled.length = 0;
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const firstPaintTree = buildEnemyHealthbarTree();
  const firstPaintContext = createRuntimeContext(firstPaintTree, {
    includeGameUI: true
  });
  runInVm(source, firstPaintContext, targetScript);
  runNextScheduled();
  assert(firstPaintTree.rb.style.washColor !== '#00FF00',
    `Fresh healthbar painted default green before delayed durable preset was available: ${JSON.stringify(firstPaintTree.rb.style)}`);
  dispatchPresetSnapshot({
    hp_enabled: true,
    hp_mode: 0,
    hp_bg_visible: true,
    hp_team_colors: false,
    hp_color_high: '#a7585a',
    hp_counter_visible: false,
    hp_pulse_enabled: false,
    hp_friend_enabled: false
  });
  runUntilBefore(
    () => firstPaintTree.rb.style.washColor === '#a7585a',
    `Fresh healthbar did not wait for replayed snapshot before first paint: ${JSON.stringify(firstPaintTree.rb.style)}`,
    1800
  );

  scheduled.length = 0;
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  sharedStore.__hpColorsBootstrapSeen = '1';
  const sharedProbeContexts = [];
  for (let i = 0; i < 5; i++) {
    const sharedProbeTree = buildEnemyHealthbarTree();
    const sharedProbeContext = createRuntimeContext(sharedProbeTree, {
      includeGameUI: true
    });
    runInVm(source, sharedProbeContext, targetScript);
    sharedProbeContexts.push({ tree: sharedProbeTree, context: sharedProbeContext });
  }
  for (let i = 0; i < 8; i++) runNextScheduled();
  assert(sharedProbeContexts.every(item => item.tree.rb.style.washColor !== '#00FF00'),
    `Many fresh healthbars painted default green while waiting for shared bootstrap probe: ${JSON.stringify(sharedProbeContexts.map(item => item.tree.rb.style))}`);
  dispatchPresetSnapshot({
    hp_enabled: true,
    hp_mode: 0,
    hp_bg_visible: true,
    hp_team_colors: false,
    hp_color_high: '#b86464',
    hp_counter_visible: false,
    hp_pulse_enabled: false,
    hp_friend_enabled: false
  });
  runUntilBefore(
    () => sharedProbeContexts.some(item => item.tree.rb.style.washColor === '#b86464'),
    `Shared first-paint bootstrap probe did not hydrate any waiting healthbar after snapshot appeared: ${JSON.stringify(sharedProbeContexts.map(item => item.tree.rb.style))}`,
    1800
  );


  scheduled.length = 0;
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const kickTree = buildEnemyHealthbarTree();
  const kickContext = createRuntimeContext(kickTree, {
    includeGameUI: true
  });
  runInVm(source, kickContext, targetScript);
  scheduled.length = 0;
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_mode: 0,
    hp_bg_visible: true,
    hp_team_colors: false,
    hp_color_high: '#77aa55',
    hp_counter_visible: true,
    hp_pulse_enabled: false,
    hp_friend_enabled: true,
    hp_level_number_visible: true
  });
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_mode: 0,
    hp_bg_visible: true,
    hp_team_colors: false,
    hp_color_high: '#77aa55',
    hp_counter_visible: true,
    hp_pulse_enabled: false,
    hp_friend_enabled: true,
    hp_level_number_visible: true
  });
  const fastLoopKicks = scheduled
    .filter(job => Math.abs(Number(job.delay) - 0.01) < 0.001)
    .length;
  assert(fastLoopKicks <= 3,
    `Forced replay burst should coalesce to one fast kick per loop, saw ${fastLoopKicks}: ${JSON.stringify(scheduled.map(job => job.delay))}`);

  scheduled.length = 0;
  resetFindCounts();
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const levelBackoffTree = buildEnemyHealthbarTree();
  const levelBackoffContext = createRuntimeContext(levelBackoffTree, {
    includeGameUI: true
  });
  runInVm(source, levelBackoffContext, targetScript);
  scheduled.length = 0;
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_level_number_visible: true
  });
  runScheduledFor(6500);
  assert(scheduled.some(job => Math.abs(Number(job.delay) - 5.0) < 0.001),
    `Level loop without a usable level label should back off to 5s polling: ${JSON.stringify(scheduled.map(job => job.delay))}`);

  scheduled.length = 0;
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const friendlyTree = buildEnemyHealthbarTree();
  friendlyTree.unitStatus.RemoveClass('enemy');
  friendlyTree.unitStatus.AddClass('friend');
  const friendlyContext = createRuntimeContext(friendlyTree, {
    includeGameUI: true
  });
  runInVm(source, friendlyContext, targetScript);
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_friend_enabled: true,
    hp_mode: 0,
    hp_friend_color_high: '#44dd88',
    hp_friend_heal_color: '#55ee99',
    hp_friend_delta_color: '#776655',
    hp_friend_pulse_enabled: false,
    hp_counter_visible: false,
    hp_pulse_enabled: false,
    hp_level_number_visible: false
  });
  runUntilBefore(
    () => friendlyTree.rb.style.washColor === '#44dd88',
    `Friendly non-player healthbar did not receive ally color: ${JSON.stringify(friendlyTree.rb.style)}`,
    1000
  );
  assert(friendlyTree.heal.style.washColor === '#55ee99',
    `Friendly non-player healthbar did not receive ally healing color: ${JSON.stringify(friendlyTree.heal.style)}`);
  assert(friendlyTree.delta.style.washColor === '#776655',
    `Friendly non-player healthbar did not receive ally delta color: ${JSON.stringify(friendlyTree.delta.style)}`);

  scheduled.length = 0;
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const lateFriendlyTree = buildEnemyHealthbarTree();
  lateFriendlyTree.unitStatus.RemoveClass('enemy');
  lateFriendlyTree.unitStatus.AddClass('friend');
  sharedStore.__hpColorsDurableCfgRaw = JSON.stringify({
    hp_enabled: true,
    hp_friend_enabled: true,
    hp_mode: 0,
    hp_friend_color_high: '#33cc99',
    hp_friend_pulse_enabled: false,
    hp_counter_visible: false,
    hp_pulse_enabled: false,
    hp_level_number_visible: false
  });
  const lateFriendlyContext = createRuntimeContext(lateFriendlyTree, {
    includeGameUI: true
  });
  runInVm(source, lateFriendlyContext, targetScript);
  runUntilBefore(
    () => lateFriendlyTree.rb.style.washColor === '#33cc99',
    `Late friendly healthbar did not start ally loop from durable snapshot: ${JSON.stringify(lateFriendlyTree.rb.style)}`,
    1000
  );


  scheduled.length = 0;
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const optionalPanelTree = buildEnemyHealthbarTree();
  const optionalPanelContext = createRuntimeContext(optionalPanelTree, {
    includeGameUI: true
  });
  runInVm(source, optionalPanelContext, targetScript);
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_mode: 0,
    hp_color_high: '#4477aa',
    hp_delta_color: '#cc8844',
    hp_bullet_shield_color: '#4477cc',
    hp_heal_color: '#55cc88',
    hp_pulse_enabled: false,
    hp_friend_enabled: false,
    hp_level_number_visible: false
  });
  runUntilBefore(
    () => optionalPanelTree.heal.style.washColor === '#55cc88',
    `Initial optional healing panel was not painted: ${JSON.stringify(optionalPanelTree.heal.style)}`,
    1000
  );
  assert(optionalPanelTree.delta.style.washColor === '#cc8844' &&
      optionalPanelTree.bulletShield.style.backgroundColor === '#4477cc',
    `Initial optional shield layers were not painted: ${JSON.stringify({
      delta: optionalPanelTree.delta.style,
      bulletShield: optionalPanelTree.bulletShield.style
    })}`);
  optionalPanelTree.heal.DeleteAsync();
  const replacementHeal = optionalPanelTree.redParent.add(
    new MockPanel('unit_healthbar_healing', { findCounts: activeHarness.findCounts })
  );
  runUntilBefore(
    () => replacementHeal.style.washColor === '#55cc88',
    `Replaced optional healing panel retained a stale cached reference: ${JSON.stringify(replacementHeal.style)}`,
    1000
  );
  optionalPanelTree.delta.DeleteAsync();
  optionalPanelTree.bulletShield.DeleteAsync();
  const replacementDelta = optionalPanelTree.redParent.add(
    new MockPanel('unit_healthbar_delta', { findCounts: activeHarness.findCounts })
  );
  const replacementBulletShield = optionalPanelTree.redParent.add(
    new MockPanel('unit_healthbar_bullet_shield', { findCounts: activeHarness.findCounts })
  );
  runUntilBefore(
    () => replacementDelta.style.washColor === '#cc8844' &&
      replacementBulletShield.style.backgroundColor === '#4477cc',
    `Replaced optional shield layers retained stale cached references: ${JSON.stringify({
      delta: replacementDelta.style,
      bulletShield: replacementBulletShield.style
    })}`,
    1000
  );

  scheduled.length = 0;
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const lateOptionalTree = buildEnemyHealthbarTree();
  lateOptionalTree.heal.DeleteAsync();
  lateOptionalTree.delta.DeleteAsync();
  lateOptionalTree.bulletShield.DeleteAsync();
  const lateOptionalContext = createRuntimeContext(lateOptionalTree, {
    includeGameUI: true
  });
  runInVm(source, lateOptionalContext, targetScript);
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_mode: 0,
    hp_color_high: '#4477aa',
    hp_delta_color: '#cc8844',
    hp_bullet_shield_color: '#4477cc',
    hp_heal_color: '#55cc88',
    hp_pulse_enabled: false,
    hp_friend_enabled: false,
    hp_level_number_visible: false
  });
  runUntilBefore(
    () => lateOptionalTree.rb.style.washColor === '#4477aa',
    `Late optional-panel setup did not paint the enemy bar: ${JSON.stringify(lateOptionalTree.rb.style)}`,
    1000
  );
  const lateHeal = lateOptionalTree.redParent.add(
    new MockPanel('unit_healthbar_healing', { findCounts: activeHarness.findCounts })
  );
  const lateDelta = lateOptionalTree.redParent.add(
    new MockPanel('unit_healthbar_delta', { findCounts: activeHarness.findCounts })
  );
  const lateBulletShield = lateOptionalTree.redParent.add(
    new MockPanel('unit_healthbar_bullet_shield', {
      actuallayoutwidth: 0,
      findCounts: activeHarness.findCounts
    })
  );
  runUntilBefore(
    () => lateHeal.style.washColor === '#55cc88' &&
      lateDelta.style.washColor === '#cc8844' &&
      lateBulletShield.style.backgroundColor === '#4477cc',
    `Optional healthbar layers added after initial cache were not discovered: ${JSON.stringify({
      heal: lateHeal.style,
      delta: lateDelta.style,
      bulletShield: lateBulletShield.style
    })}`,
    1800
  );

  if (!isOptimizedTarget) {
    const preciseHooks = getRuntimeTestHooks();
    const pipArgs = {
      hp: 50,
      hasPipPanel: true,
      pipText: " ''''||||' ",
      hasCounterPanels: true,
      liveBarWidth: 50,
      liveBarParentWidth: 100,
    };
    assert(Object.is(
      preciseHooks.readoutPlan({ hp_counter_visible: true, hp_counter_format: 0, hp_precise_pips_enabled: false }, pipArgs).max,
      2100,
    ), 'default pip parsing should establish the cached maximum HP');
    assert(preciseHooks.applySnapshotValues({ hp_precise_pips_enabled: true }),
      'bulk snapshot should apply the precise-pip setting');
    assert(Object.is(
      preciseHooks.readoutPlan({ hp_counter_visible: true, hp_counter_format: 0 }, pipArgs).max,
      210,
    ), 'bulk snapshot should invalidate the cached maximum HP when precise pips changes');
  }

  if (!isOptimizedTarget) {
    scheduled.length = 0;
    for (const key of Object.keys(sharedStore)) delete sharedStore[key];
    const lifetimeTree = buildEnemyHealthbarTree();
    const lifetimeContext = createRuntimeContext(lifetimeTree, {
      includeGameUI: true
    });
    runInVm(source, lifetimeContext, targetScript);
    const lifetimeHooks = getRuntimeTestHooks();
    const initialLifetime = lifetimeHooks.lifetimeState();
    assert(initialLifetime.active && initialLifetime.handlerOwned &&
        initialLifetime.bootstrapRetryQueued,
      `Healthbar runtime should own its listener while active: ${JSON.stringify(initialLifetime)}`);
    assert(lifetimeHooks.queueBootstrapRetry('duplicate_probe') === false,
      'Healthbar runtime should reject a duplicate bootstrap retry while one is queued');
    dispatchRuntimeReplay({
      hp_enabled: false,
      hp_friend_enabled: false,
      hp_level_number_visible: false
    });
    runScheduledFor(3000);
    assert(lifetimeHooks.lifetimeState().quiescentCheckQueued &&
        scheduled.some(job => Number(job.delay) === 5),
      `Quiescent runtime should retain one low-frequency lifetime check: ${JSON.stringify({
        state: lifetimeHooks.lifetimeState(),
        delays: scheduled.map(job => job.delay)
      })}`);
    lifetimeTree.root.DeleteAsync();
    runUntil(
      () => !lifetimeHooks.lifetimeState().active,
      'Quiescent lifetime check did not stop the invalid runtime',
      20
    );
    const stoppedLifetime = lifetimeHooks.lifetimeState();
    assert(!stoppedLifetime.active && !stoppedLifetime.handlerOwned,
      `Invalid context panel should stop runtime and unregister listener: ${JSON.stringify(stoppedLifetime)}`);
    assert(activeHarness.handlerEntries.length === 0 &&
        !activeHarness.handlers.ClientUI_FireOutput,
      `Stopped runtime retained unhandled-event registration: ${JSON.stringify(activeHarness.handlerEntries)}`);
    for (let i = 0; i < 20 && scheduled.length; i++) runNextScheduled();
    assert(scheduled.length === 0,
      `Stopped runtime callbacks should drain without requeueing: ${JSON.stringify(scheduled.map(job => job.delay))}`);
  }


  console.log(`[RUNTIME REPLAY PASS] ${path.relative(ROOT, targetScript)} replays preset values onto reused, reset, and replaced healthbar panels.`);
}

runValidation();
