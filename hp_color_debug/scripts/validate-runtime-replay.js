#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_TARGET = path.join(ROOT, 'hp_color_debug', 'panorama', 'scripts', 'healthbar_logic.js');
const targetScript = path.resolve(process.argv[2] || DEFAULT_TARGET);

let nowMs = 0;
const scheduled = [];
const handlers = {};
const sharedStore = {};
const dispatched = [];
const findCounts = Object.create(null);

class MockPanel {
  constructor(id, parent = null) {
    this.id = id || '';
    this.parent = null;
    this.children = [];
    this.classes = new Set();
    this.styleWrites = Object.create(null);
    this.style = new Proxy({}, {
      set: (target, prop, value) => {
        this.styleWrites[prop] = (this.styleWrites[prop] || 0) + 1;
        target[prop] = value;
        return true;
      }
    });
    this.attributes = Object.create(null);
    this.text = '';
    this.valid = true;
    this.actuallayoutwidth = 100;
    this.layoutHeightReads = 0;
    this._actualLayoutHeight = 32;
    if (parent) this.SetParent(parent);
  }

  IsValid() { return this.valid; }
  GetParent() { return this.parent; }
  Children() { return this.children.slice(); }
  AddClass(className) { this.classes.add(className); }
  RemoveClass(className) { this.classes.delete(className); }
  BHasClass(className) { return this.classes.has(className); }
  SetHasClass(className, enabled) { enabled ? this.AddClass(className) : this.RemoveClass(className); }
  GetAttributeString(key, fallback) {
    return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : fallback;
  }
  SetAttributeString(key, value) { this.attributes[key] = String(value); }
  get actuallayoutheight() {
    this.layoutHeightReads += 1;
    return this._actualLayoutHeight;
  }
  set actuallayoutheight(value) { this._actualLayoutHeight = value; }

  SetParent(parent) {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = parent;
    if (parent && parent.children && !parent.children.includes(this)) parent.children.push(this);
  }

  FindChildTraverse(id) {
    findCounts[id] = (findCounts[id] || 0) + 1;
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.FindChildTraverse(id);
      if (found) return found;
    }
    return null;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runNextScheduled() {
  assert(scheduled.length > 0, 'No scheduled jobs left to run');
  scheduled.sort((a, b) => a.dueAt - b.dueAt);
  const job = scheduled.shift();
  nowMs = Math.max(nowMs, Number(job.dueAt) || nowMs);
  job.handler();
}

function runUntil(predicate, message, limit = 120) {
  for (let i = 0; i < limit; i++) {
    if (predicate()) return;
    runNextScheduled();
  }
  assert(predicate(), message);
}

function runUntilBefore(predicate, message, maxElapsedMs, limit = 120) {
  const startMs = nowMs;
  for (let i = 0; i < limit; i++) {
    if (predicate()) return;
    assert(scheduled.length > 0, `${message}; no scheduled jobs left`);
    scheduled.sort((a, b) => a.dueAt - b.dueAt);
    assert((Number(scheduled[0].dueAt) || nowMs) - startMs <= maxElapsedMs, `${message}; exceeded ${maxElapsedMs}ms`);
    runNextScheduled();
  }
  assert(predicate(), `${message}; exhausted scheduled job limit`);
}

function runScheduledFor(maxElapsedMs, limit = 200) {
  const startMs = nowMs;
  for (let i = 0; i < limit; i++) {
    if (!scheduled.length) return;
    scheduled.sort((a, b) => a.dueAt - b.dueAt);
    if ((Number(scheduled[0].dueAt) || nowMs) - startMs > maxElapsedMs) return;
    runNextScheduled();
  }
  throw new Error(`Exceeded scheduled job limit while advancing ${maxElapsedMs}ms`);
}

function buildEnemyHealthbarTree() {
  const root = new MockPanel('Root');
  const unitStatus = new MockPanel('UnitStatus', root);
  unitStatus.AddClass('enemy');
  unitStatus.AddClass('team1');

  const bg = new MockPanel('unit_healthbar_bg', unitStatus);
  const parent = new MockPanel('unit_healthbar_parent', unitStatus);
  parent.actuallayoutwidth = 100;
  const rb = new MockPanel('unit_healthbar_lagging', parent);
  rb.actuallayoutwidth = 82;
  const heal = new MockPanel('unit_healthbar_healing', parent);
  const delta = new MockPanel('unit_healthbar_delta', parent);
  const pip = new MockPanel('unit_healthbar_pip_label', unitStatus);
  pip.text = '||||';
  const counterAnchor = new MockPanel('hp_counter_anchor', unitStatus);
  const counter = new MockPanel('hp_counter', counterAnchor);
  const killMarker = new MockPanel('hp_kill_zone_marker', unitStatus);
  const ultIcon = new MockPanel('unit_ult_ready_icon', unitStatus);
  new MockPanel('InfoHealthContainer', unitStatus);
  new MockPanel('UnitHealthbarContainer', unitStatus);
  const name = new MockPanel('name', root);

  return { root, unitStatus, rb, heal, delta, bg, pip, counterAnchor, counter, killMarker, ultIcon, name };
}

function resetFindCounts() {
  for (const key of Object.keys(findCounts)) delete findCounts[key];
}

function dispatchRuntimeReplay(values) {
  const handler = handlers.ClientUI_FireOutput;
  assert(typeof handler === 'function', 'healthbar runtime did not register ClientUI_FireOutput handler');
  handler(JSON.stringify({
    magic_word: 'ANITA_BULK_UPDATE',
    mod_title: 'HP Colors',
    values,
    update_source: 'baked_preset_apply',
    force_emit: true
  }));
}

function dispatchPresetSnapshot(values) {
  const handler = handlers.ClientUI_FireOutput;
  assert(typeof handler === 'function', 'healthbar runtime did not register ClientUI_FireOutput handler');
  handler(JSON.stringify({
    magic_word: 'HP_COLORS_PRESET_SNAPSHOT',
    mod_title: 'HP Colors',
    version: 1,
    values_raw: JSON.stringify(values),
    values,
    update_source: 'builder_static'
  }));
}


function encodeBase64Url(str) {
  return Buffer.from(String(str), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createRuntimeContext(tree, options = {}) {
  const MockDate = class extends Date {
    static now() { return nowMs; }
  };
  const context = {
    console,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    isFinite,
    Date: MockDate,
    $: {
      GetContextPanel: () => tree.root,
      Schedule: (delay, handler) => {
        const delaySec = Number(delay) || 0;
        scheduled.push({ delay: delaySec, dueAt: nowMs + Math.max(0, delaySec) * 1000, handler });
      },
      RegisterForUnhandledEvent: (eventName, handler) => {
        handlers[eventName] = handler;
      },
      DispatchEvent: (...args) => dispatched.push(args)
    }
  };
  if (options.includeGameUI !== false) {
    context.GameUI = {
      CustomUIConfig: () => sharedStore
    };
  }
  context.global = context;
  return context;
}

function runValidation() {
  const source = fs.readFileSync(targetScript, 'utf8');
  const isMinifiedTarget = targetScript.includes(`${path.sep}hp_color_debug_terser${path.sep}`);
  assert(!source.includes('GetSettingString') && !source.includes('deadlock_hero_debuts_seen'),
    'healthbar runtime should not read convar storage directly; import/preset paths own compact-token parsing');
  if (!isMinifiedTarget) {
    assert(source.includes('function requestEnemyLoopKick') &&
        !source.includes('$.Schedule(0.01, gL)') &&
        !source.includes('$.Schedule(0.01, aL)') &&
        !source.includes('$.Schedule(0.01, lL)'),
      'healthbar runtime should coalesce forced 0.01s loop wakeups through request*LoopKick helpers');
    assert(source.includes('function scheduleEnemyLoop'),
      'healthbar runtime should single-flight recurring loop schedules');
    assert(!/\$\.Schedule\([^,]+,\s*gL\)/.test(source) &&
        !/\$\.Schedule\([^,]+,\s*aL\)/.test(source) &&
        !/\$\.Schedule\([^,]+,\s*lL\)/.test(source),
      'healthbar runtime should route recurring loop schedules through schedule*Loop helpers');
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
  if (!isMinifiedTarget) {
    assert(source.includes('function styleDriftCheckDelayMs') && source.includes('styleDriftCleanFrames'),
      'healthbar runtime should back off clean idle style-drift checks');
    assert(source.includes('lKzSig === sig'),
      'healthbar runtime should short-circuit unchanged kill-zone marker state');
    assert(!source.includes('redBarNeedsPaint'),
      'healthbar runtime should not score redbar candidates by reading washColor');
    const candidateScoreStart = source.indexOf('function getRedBarCandidateScore');
    const candidateScoreEnd = source.indexOf('function resetEnemyScanCache');
    assert(candidateScoreStart >= 0 && candidateScoreEnd > candidateScoreStart,
      'healthbar runtime should expose redbar candidate scoring before resetEnemyScanCache');
    const candidateScoreBody = source.slice(candidateScoreStart, candidateScoreEnd);
    assert(!candidateScoreBody.includes('style.washColor') && candidateScoreBody.includes('scanPanelPacked'),
      'redbar candidate scoring should use packed class flags, not style.washColor reads');
    assert(source.includes('lColRaw === c && lCol') &&
        source.includes('lUltRaw === nextRaw && lUlt') &&
        source.includes('lTxtRaw === c && lTxt'),
      'raw color fast paths must repaint after applied caches are invalidated');
    assert(source.includes('if (isChildProbe) {') && source.includes('stableCurrentRedBarFrames >= 10'),
      'child redbar probes should share stable-frame idle backoff without delaying replacement beyond validation window');
  }
  const tree = buildEnemyHealthbarTree();
  const context = createRuntimeContext(tree);
  vm.createContext(context);
  vm.runInContext(source, context, { filename: targetScript });

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

  dispatchRuntimeReplay({ hp_counter_visible: true });
  runUntil(
    () => tree.counter.style.visibility === 'visible',
    `Counter visibility toggle did not restore HP number: ${JSON.stringify(tree.counter.style)}`
  );
  tree.counterAnchor.layoutHeightReads = 0;
  tree.rb.actuallayoutwidth = 75;
  runUntilBefore(
    () => tree.counter.text === '75%',
    `Non-pulsing HP counter did not update text after width change: ${tree.counter.text}`,
    1000
  );
  assert(tree.counterAnchor.layoutHeightReads === 0,
    'Non-pulsing HP counter updates should not read parent layout height');
  const counterStyleWritesBeforeWatchdog =
    (tree.counter.styleWrites.fontSize || 0) +
    (tree.counter.styleWrites.height || 0) +
    (tree.counterAnchor.styleWrites.transform || 0);
  runScheduledFor(6200);
  const counterStyleWritesAfterWatchdog =
    (tree.counter.styleWrites.fontSize || 0) +
    (tree.counter.styleWrites.height || 0) +
    (tree.counterAnchor.styleWrites.transform || 0);
  assert(counterStyleWritesAfterWatchdog === counterStyleWritesBeforeWatchdog,
    'Style watchdog should not rewrite unchanged counter styles');

  const barWashWritesBeforeNameChurn = tree.rb.styleWrites.washColor || 0;
  const counterFontWritesBeforeNameChurn = tree.counter.styleWrites.fontSize || 0;
  const counterHeightWritesBeforeNameChurn = tree.counter.styleWrites.height || 0;
  tree.name.text = 'unit name sample A';
  runScheduledFor(650);
  tree.name.text = 'unit name sample B';
  runScheduledFor(650);
  assert((tree.rb.styleWrites.washColor || 0) === barWashWritesBeforeNameChurn,
    'Unit name text churn should not invalidate bar color write caches');
  assert((tree.counter.styleWrites.fontSize || 0) === counterFontWritesBeforeNameChurn &&
      (tree.counter.styleWrites.height || 0) === counterHeightWritesBeforeNameChurn,
    'Unit name text churn should not invalidate counter style write caches');

  tree.rb.style.washColor = '';
  runUntilBefore(
    () => tree.rb.style.washColor === '#123456',
    `Runtime loop did not repaint a reused healthbar after Source 2 cleared inline color: ${JSON.stringify(tree.rb.style)}`,
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

  scheduled.length = 0;
  const lateTree = buildEnemyHealthbarTree();
  const lateContext = createRuntimeContext(lateTree);
  vm.createContext(lateContext);
  vm.runInContext(source, lateContext, { filename: targetScript });
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
  vm.createContext(buildingContext);
  vm.runInContext(source, buildingContext, { filename: targetScript });
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_skip_buildings: true,
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
  const buildingWashWrites = buildingTree.rb.styleWrites.washColor || 0;
  runScheduledFor(2200);
  assert((buildingTree.rb.styleWrites.washColor || 0) === buildingWashWrites,
    'Non-pulsing building skip path should not clear pulse state and rewrite the same bar color every tick');

  scheduled.length = 0;
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const zeroWidthTree = buildEnemyHealthbarTree();
  zeroWidthTree.rb.GetParent().actuallayoutwidth = 0;
  const zeroWidthContext = createRuntimeContext(zeroWidthTree);
  vm.createContext(zeroWidthContext);
  vm.runInContext(source, zeroWidthContext, { filename: targetScript });
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
  vm.createContext(nonEnemyContext);
  vm.runInContext(source, nonEnemyContext, { filename: targetScript });
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
  vm.createContext(stableRevalidateContext);
  vm.runInContext(source, stableRevalidateContext, { filename: targetScript });
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_mode: 0,
    hp_team_colors: false,
    hp_color_high: '#336699',
    hp_heal_color: '#66ff88',
    hp_delta_color: '#ffee66',
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
  assert(stableFindTraversals <= 25,
    `Stable enemy bar should slow idle red-bar revalidation, saw ${stableFindTraversals} unit_healthbar_lagging traversals`);

  scheduled.length = 0;
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const presetSnapshotTree = buildEnemyHealthbarTree();
  const presetSnapshotContext = createRuntimeContext(presetSnapshotTree);
  vm.createContext(presetSnapshotContext);
  vm.runInContext(source, presetSnapshotContext, { filename: targetScript });
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

  scheduled.length = 0;
  resetFindCounts();
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const ultDisabledTree = buildEnemyHealthbarTree();
  const ultDisabledContext = createRuntimeContext(ultDisabledTree);
  vm.createContext(ultDisabledContext);
  vm.runInContext(source, ultDisabledContext, { filename: targetScript });
  dispatchRuntimeReplay({
    hp_enabled: true,
    hp_mode: 0,
    hp_bg_visible: true,
    hp_team_colors: false,
    hp_color_high: '#456789',
    hp_heal_color: '#66ff88',
    hp_delta_color: '#ffee66',
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
  assert(ultDisabledTree.heal.style.washColor === '#66ff88',
    `Custom heal color setting did not apply: ${JSON.stringify(ultDisabledTree.heal.style)}`);
  assert(ultDisabledTree.delta.style.washColor === '#ffee66',
    `Custom delta color setting did not apply: ${JSON.stringify(ultDisabledTree.delta.style)}`);

  scheduled.length = 0;
  dispatched.length = 0;
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const matchResetTree = buildEnemyHealthbarTree();
  const matchResetContext = createRuntimeContext(matchResetTree);
  vm.createContext(matchResetContext);
  vm.runInContext(source, matchResetContext, { filename: targetScript });
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
  sharedStore.__hpColorsMatchReset = { token: 'unit-test-match-1', reason: 'unit_test', gameState: 6, gameTime: 0, at: nowMs };
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
  vm.createContext(staleTokenContext);
  vm.runInContext(source, staleTokenContext, { filename: targetScript });
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
  vm.createContext(defaultGreenContext);
  vm.runInContext(source, defaultGreenContext, { filename: targetScript });
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
  vm.createContext(firstPaintContext);
  vm.runInContext(source, firstPaintContext, { filename: targetScript });
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
    vm.createContext(sharedProbeContext);
    vm.runInContext(source, sharedProbeContext, { filename: targetScript });
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
  vm.createContext(kickContext);
  vm.runInContext(source, kickContext, { filename: targetScript });
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
  vm.createContext(levelBackoffContext);
  vm.runInContext(source, levelBackoffContext, { filename: targetScript });
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
  vm.createContext(friendlyContext);
  vm.runInContext(source, friendlyContext, { filename: targetScript });
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
    hp_friend_heal_color: '#22cc88',
    hp_friend_delta_color: '#665544',
    hp_friend_pulse_enabled: false,
    hp_counter_visible: false,
    hp_pulse_enabled: false,
    hp_level_number_visible: false
  });
  const lateFriendlyContext = createRuntimeContext(lateFriendlyTree, {
    includeGameUI: true
  });
  vm.createContext(lateFriendlyContext);
  vm.runInContext(source, lateFriendlyContext, { filename: targetScript });
  runUntilBefore(
    () => lateFriendlyTree.rb.style.washColor === '#33cc99',
    `Late friendly healthbar did not start ally loop from durable snapshot: ${JSON.stringify(lateFriendlyTree.rb.style)}`,
    1000
  );
  assert(lateFriendlyTree.heal.style.washColor === '#22cc88',
    `Late friendly healthbar did not receive ally healing color: ${JSON.stringify(lateFriendlyTree.heal.style)}`);
  assert(lateFriendlyTree.delta.style.washColor === '#665544',
    `Late friendly healthbar did not receive ally delta color: ${JSON.stringify(lateFriendlyTree.delta.style)}`);


  console.log(`[RUNTIME REPLAY PASS] ${path.relative(ROOT, targetScript)} replays preset values onto reused, reset, and replaced healthbar panels.`);
}

runValidation();
