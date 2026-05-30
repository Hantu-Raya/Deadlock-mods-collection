#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_TARGET = path.join(ROOT, 'hp_colors', 'panorama', 'scripts', 'healthbar_logic.js');
const targetScript = path.resolve(process.argv[2] || DEFAULT_TARGET);

let nowMs = 0;
const scheduled = [];
const handlers = {};
const sharedStore = {};
const dispatched = [];

class MockPanel {
  constructor(id, parent = null) {
    this.id = id || '';
    this.parent = null;
    this.children = [];
    this.classes = new Set();
    this.style = {};
    this.text = '';
    this.valid = true;
    this.actuallayoutwidth = 100;
    this.actuallayoutheight = 32;
    if (parent) this.SetParent(parent);
  }

  IsValid() { return this.valid; }
  GetParent() { return this.parent; }
  Children() { return this.children.slice(); }
  AddClass(className) { this.classes.add(className); }
  RemoveClass(className) { this.classes.delete(className); }
  BHasClass(className) { return this.classes.has(className); }
  SetHasClass(className, enabled) { enabled ? this.AddClass(className) : this.RemoveClass(className); }
  GetAttributeString(_key, fallback) { return fallback; }

  SetParent(parent) {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = parent;
    if (parent && parent.children && !parent.children.includes(this)) parent.children.push(this);
  }

  FindChildTraverse(id) {
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
  scheduled.sort((a, b) => a.delay - b.delay);
  const job = scheduled.shift();
  nowMs += Math.max(0, Number(job.delay) || 0) * 1000;
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
    scheduled.sort((a, b) => a.delay - b.delay);
    const delayMs = Math.max(0, Number(scheduled[0].delay) || 0) * 1000;
    assert(nowMs + delayMs - startMs <= maxElapsedMs, `${message}; exceeded ${maxElapsedMs}ms`);
    runNextScheduled();
  }
  assert(predicate(), `${message}; exhausted scheduled job limit`);
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
  const pip = new MockPanel('unit_healthbar_pip_label', unitStatus);
  pip.text = '||||';
  const counterAnchor = new MockPanel('hp_counter_anchor', unitStatus);
  const counter = new MockPanel('hp_counter', counterAnchor);
  new MockPanel('hp_kill_zone_marker', unitStatus);
  new MockPanel('InfoHealthContainer', unitStatus);
  new MockPanel('UnitHealthbarContainer', unitStatus);
  new MockPanel('name', root);

  return { root, rb, bg, pip, counter };
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
      Schedule: (delay, handler) => scheduled.push({ delay: Number(delay) || 0, handler }),
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
  assert(!source.includes('GetSettingString') && !source.includes('deadlock_hero_debuts_seen'),
    'healthbar runtime should not read convar storage directly; import/preset paths own compact-token parsing');
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
    hp_pulse_enabled: false,
    hp_friend_enabled: false,
    hp_level_number_visible: false
  };

  dispatchRuntimeReplay(values);
  runUntil(
    () => tree.rb.style.washColor === '#123456',
    `Initial replay did not apply custom high color: ${JSON.stringify(tree.rb.style)}`
  );
  assert(tree.counter.style.visibility === 'collapse',
    `Counter visibility toggle did not collapse HP number: ${JSON.stringify(tree.counter.style)}`);

  dispatchRuntimeReplay({ hp_counter_visible: true });
  runUntil(
    () => tree.counter.style.visibility === 'visible',
    `Counter visibility toggle did not restore HP number: ${JSON.stringify(tree.counter.style)}`
  );

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
  for (const key of Object.keys(sharedStore)) delete sharedStore[key];
  const defaultGreenTree = buildEnemyHealthbarTree();
  const defaultGreenContext = createRuntimeContext(defaultGreenTree, {
    includeGameUI: false
  });
  vm.createContext(defaultGreenContext);
  vm.runInContext(source, defaultGreenContext, { filename: targetScript });
  runUntilBefore(
    () => String(defaultGreenTree.rb.style.washColor || '').toLowerCase() === '#00ff00',
    `No-token default-green runtime should not wait for the full bootstrap window: ${JSON.stringify(defaultGreenTree.rb.style)}`,
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

  console.log(`[RUNTIME REPLAY PASS] ${path.relative(ROOT, targetScript)} replays preset values onto reused, reset, and replaced healthbar panels.`);
}

runValidation();
