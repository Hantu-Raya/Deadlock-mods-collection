#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.resolve(__dirname, '..', 'panorama', 'scripts', 'rejuvnbufftimer.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const layoutDir = path.resolve(__dirname, '..', 'panorama', 'layout');
assert.equal(fs.existsSync(path.join(layoutDir, 'hud.xml')), false, 'pak98 must use stock hud.xml unmodified');
const timerLayoutSource = fs.readFileSync(path.join(layoutDir, 'bt_timer_overlay.xml'), 'utf8');
const glowLayoutSource = fs.readFileSync(path.join(layoutDir, 'bt_minimap_glow.xml'), 'utf8');
const layouts = {
  TimerOverlayFrame: 'bt_timer_overlay.xml',
  MinimapGlowClip: 'bt_minimap_glow.xml',
  BTLingerLayer: 'bt_linger_layer.xml',
};
const timerStylePath = path.resolve(__dirname, '..', 'panorama', 'styles', 'hud_timer.css');
const timerStyleSource = fs.readFileSync(timerStylePath, 'utf8');
const buffClaimStylePath = path.resolve(__dirname, '..', 'panorama', 'styles', 'buff_claim.css');
const buffClaimStyleSource = fs.readFileSync(buffClaimStylePath, 'utf8');
// Failure mode (live 2026-09-30): Closure ADVANCED renames dotted UI.<key> but not UI["<key>"], so one quoted
// read of a dotted cache is undefined only in the shipped pak; the '?' then lost the minimap and sat 30px off.
assert.doesNotMatch(source, /\bUI\[\s*["']/, 'UI caches must use dotted access so Closure renames every read and write together');
const scheduled = [];
let fakeNow = 0;
let nextScheduleId = 0;
let contextPanel = null;
const messages = [];
let dispatchedEvents = 0;

function liveScheduled() {
  return scheduled.filter((item) => !item.cancelled);
}

function advanceTo(targetMs) {
  while (true) {
    scheduled.sort((a, b) => a.dueMs - b.dueMs || a.id - b.id);
    const index = scheduled.findIndex((item) => !item.cancelled && item.dueMs <= targetMs);
    if (index < 0) break;
    const [item] = scheduled.splice(index, 1);
    fakeNow = item.dueMs;
    item.callback();
  }
  fakeNow = targetMs;
}

function advanceBy(deltaMs) {
  advanceTo(fakeNow + deltaMs);
}

const sandbox = {
  module: { exports: {} },
  exports: {},
  console,
  Date: { now: () => fakeNow },
  globalThis: {},
  $: {
    Schedule: (delay, callback) => {
      const item = {
        id: ++nextScheduleId,
        delay,
        dueMs: fakeNow + Math.max(0, Number(delay) || 0) * 1000,
        callback,
        cancelled: false,
      };
      scheduled.push(item);
      return item.id;
    },
    CancelScheduled: (handle) => {
      const item = scheduled.find((entry) => entry.id === handle);
      if (item) item.cancelled = true;
    },
    GetContextPanel: () => contextPanel,
    DispatchEvent: () => { dispatchedEvents++; },
    Msg: (...args) => messages.push(args),
    CreatePanel: createPanel,
  },
};
function makePanel(classCheck, id = '', parent = null) {
  const classes = new Set();
  const panel = {
    id, parent, children: [], events: Object.create(null), attributes: new Map(), deleted: false,
    style: {},
    // Every mock panel is laid out (scale 1, 1920x1080 at 0,0), so widget placement succeeds without a retry.
    actualuiscale_x: 1, actualuiscale_y: 1, actuallayoutwidth: 1920, actuallayoutheight: 1080,
    GetPositionWithinWindow: () => ({ x: 0, y: 0 }),
    SetDraggable() {},
    text: '',
    IsValid() { return !this.deleted && (!this.parent || this.parent.IsValid()); },
    BHasClass: (name) => classCheck ? classCheck(name) : classes.has(name),
    SetHasClass: (name, enabled) => {
      if (enabled) classes.add(name);
      else classes.delete(name);
    },
    AddClass: (name) => classes.add(name),
    RemoveClass: (name) => classes.delete(name),
    GetParent() { return this.parent; },
    Children() { return this.children.filter((child) => child.IsValid()); },
    FindChildTraverse(name) {
      for (const child of this.Children()) {
        if (child.id === name) return child;
        const found = child.FindChildTraverse(name);
        if (found) return found;
      }
      return null;
    },
    GetAttributeInt(name, fallback) { return this.attributes.has(name) ? this.attributes.get(name) : fallback; },
    SetAttributeInt(name, value) { this.attributes.set(name, value); },
    GetAttributeString(name, fallback) { return this.attributes.has(name) ? this.attributes.get(name) : fallback; },
    SetAttributeString(name, value) { this.attributes.set(name, value); },
    SetPanelEvent(name, callback) { this.events[name] = callback; },
    MoveChildBefore(child, before) {
      this.children.splice(this.children.indexOf(child), 1);
      this.children.splice(this.children.indexOf(before), 0, child);
    },
    MoveChildAfter(child, after) {
      this.children.splice(this.children.indexOf(child), 1);
      this.children.splice(this.children.indexOf(after) + 1, 0, child);
    },
    DeleteAsync() { this.deleted = true; },
    SetImage: () => {},
  };
  if (parent) parent.children.push(panel);
  return panel;
}

function createPanel(type, parent, id, onLoad = () => true) {
  const panel = makePanel(null, id, parent);
  panel.paneltype = type;
  if (layouts[id]) {
    panel.BLoadLayout = (layoutPath, replaceChildren, replaceStyles) => {
      assert.equal(layoutPath, `file://{resources}/layout/${layouts[id]}`, `#${id} loads its own layout`);
      assert.equal(replaceChildren, false);
      assert.equal(replaceStyles, false);
      if (!onLoad(id)) return false;
      const xml = fs.readFileSync(path.join(layoutDir, layouts[id]), 'utf8');
      for (const match of xml.matchAll(/<([A-Za-z][\w]*)\b[^>]*\bid="([^"]+)"/g)) {
        createPanel(match[1], panel, match[2], onLoad);
      }
      return true;
    };
  }
  return panel;
}

function makeRuntimeRoot(clockText) {
  const clock = makePanel();
  clock.text = clockText;
  let chargePresent = false;
  const chargePanel = () => Object.assign(makePanel((name) => name.startsWith('RejuvCount_') && chargePresent), {
    Children: () => [],
  });
  const charges = {
    FindChildTraverse: (id) => id === 'RejuvenatorFriendly' ? friendly : id === 'RejuvenatorEnemy' ? enemy : null,
  };
  const friendly = chargePanel();
  const enemy = chargePanel();
  const topBar = Object.assign(makePanel(), {
    FindChildrenWithClassTraverse: (name) => name === 'GameTime' ? [clock] : [],
    FindChildTraverse: (id) => id === 'RejuvenatorCharges' ? charges : null,
  });
  const root = makePanel(null, 'Hud');
  const clamp = makePanel(null, 'clamp_width', root);
  const persp = makePanel(null, 'minimap_persp', clamp);
  const minimapContainer = makePanel(null, 'minimap_container', persp);
  const overlay = makePanel(null, 'HudMinimapContainer', minimapContainer);
  const minimap = makePanel(null, 'hud_minimap', overlay);
  root.FindChildTraverse = (id) => id === 'Hud' ? root : id === 'TopBar' ? topBar : findChild(root, id);
  return { root, clamp, persp, minimapContainer, overlay, minimap, clock, topBar, charges, friendly, enemy, setChargePresent: (value) => { chargePresent = value; } };
}

function findChild(parent, id) {
  for (const child of parent.Children()) {
    if (child.id === id) return child;
    const found = child.FindChildTraverse(id);
    if (found) return found;
  }
  return null;
}

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: scriptPath });
const test = sandbox.module.exports.__test;
assert.ok(test, 'runtime engine test export missing');
scheduled.length = 0;
const isolatedRoot = makeRuntimeRoot('clock unavailable');
contextPanel = isolatedRoot.minimap;
isolatedRoot.root.SetAttributeInt('bt_timer_gen', 1);
test.setInstanceTestState({ instanceGen: 1, hudRoot: isolatedRoot.root, retired: false });
test.setLoopTestState({ generation: 4, playerSeenToken: 0, lowTimeCleared: false });
test.loop(3);
assert.equal(liveScheduled().length, 0, 'stale loop generations must not schedule a callback');
// Failure mode ASTRA-04: an invalid gate clock must retry cheaply instead of entering a false match.
test.setClockTestPanel({ IsValid: () => true, text: 'clock unavailable' });
test.setLoopTestState({ generation: 4, running: false, lastGlobalSec: -1, lastGateChk: fakeNow - 30000 });
test.loop(4);
assert.equal(test.getLoopTestState().running, false, 'an invalid inactive clock must not start a run');
assert.equal(liveScheduled().filter((item) => item.delay === 1).length, 1, 'an invalid inactive clock must schedule a one-second retry');
scheduled.length = 0;


// Failure mode ASTRA-11/12: boot can hide its next active tick behind the gate and leave reset generations unwatched.
fakeNow = 100000;
const runtime = makeRuntimeRoot('10:00');
contextPanel = runtime.minimap;
test.setInstanceTestState({ instanceGen: 0, hudRoot: null, retired: false });
test.boot();
const hostState = test.getInstanceTestState();
assert.equal(runtime.root.GetAttributeInt('bt_timer_gen', 0), hostState.instanceGen, 'first boot claims the HUD generation');
for (const [key, parent, id] of [
  ['timerOverlay', runtime.clamp, 'TimerOverlayFrame'],
  ['timerDock', runtime.persp, 'BTTimerDock'],
  ['glowClip', runtime.overlay, 'MinimapGlowClip'],
  ['lingerLayer', runtime.overlay, 'BTLingerLayer'],
]) {
  const host = hostState.hosts[key];
  assert.equal(host.id, id, `${key} uses the contract host id`);
  assert.equal(host.GetParent(), parent, `${key} uses its contract parent`);
  assert.equal(parent.Children().filter((child) => child.id === host.id).length, 1, `${key} has exactly one host`);
}
// The claim boxes are movable widgets in the timer layer (2026-10-09); the separate ClaimOverlayRoot host is gone.
// (This mock builds layout ids flat under the host; validate-layout-editor.js checks the slot nesting.)
assert.equal(runtime.clamp.Children().some((child) => child.id === 'ClaimOverlayRoot'), false, 'no ClaimOverlayRoot host');
for (const box of ['MinimapBuffClaimLeft', 'MinimapBuffClaimRight']) {
  assert.ok(hostState.hosts.timerOverlay.FindChildTraverse(box), `#${box} lives in the timer layer`);
}
assert.ok(runtime.overlay.Children().indexOf(hostState.hosts.glowClip) < runtime.overlay.Children().indexOf(hostState.hosts.lingerLayer), 'glow precedes linger layer');
for (const name of ['RejuvPingButton', 'BuffPingButton']) {
  assert.equal(typeof hostState.hosts.timerOverlay.FindChildTraverse(name).events.onactivate, 'function', `${name} binds a panel event`);
}
assert.equal(liveScheduled().filter((item) => item.delay === 5).length, 1, 'boot starts one watchdog');
assert.equal(liveScheduled().filter((item) => item.delay < 1).length, 1, 'boot starts one main loop');
let loopState = test.getLoopTestState();
assert.equal(loopState.running, true, 'valid boot clock must start a live run');
const bootTick = liveScheduled().find((item) => item.delay < 1);
assert.ok(bootTick && bootTick.dueMs - fakeNow < 30000, 'boot must schedule the active tick well under the 30-second gate delay');
advanceTo(bootTick.dueMs);
assert.ok(liveScheduled().some((item) => item.delay < 1), 'the booted run must execute and reschedule an active tick');

// Failure mode ASTRA-04: an unavailable HUD clock can look like a rewind and erase a running match.
const bootGeneration = test.getLoopTestState().generation;
runtime.clock.text = 'clock unavailable';
advanceBy(300);
loopState = test.getLoopTestState();
assert.equal(loopState.generation, bootGeneration, 'invalid running clock must not reset the generation');
assert.equal(loopState.running, true, 'invalid running clock must preserve run state');
assert.equal(loopState.lastGlobalSec, 600, 'invalid running clock must preserve the last valid game time');
assert.ok(liveScheduled().some((item) => item.delay < 1), 'invalid running clock must reschedule the normal active cadence');

// Failure mode ASTRA-12: a valid rewind invalidates the old watchdog, then starts exactly one for the new generation.
runtime.clock.text = '0:01';
advanceBy(100);
loopState = test.getLoopTestState();
assert.ok(loopState.generation > bootGeneration, 'a valid backwards clock must still reset the runtime');
assert.equal(loopState.running, true, 'valid rewind reset must re-enter the new run immediately');
assert.equal(liveScheduled().filter((item) => item.delay === 5).length, 1, 'backwards reset must keep exactly one live watchdog');
const delayedMainLoop = liveScheduled().find((item) => item.delay < 1);
assert.ok(delayedMainLoop, 'running generation must own an active main-loop callback');
// Simulate a lost main-loop callback so the watchdog recovery branch becomes due before it fires.
sandbox.$.CancelScheduled(delayedMainLoop.id);

// Failure mode ASTRA-07: a watchdog recovery diagnostic can bypass the default-off debug switch.
const watchdogRecoveryGeneration = test.getLoopTestState().generation;
test.setLoopTestState({ nextLoopDueMs: fakeNow - 20000 });
advanceBy(5000);
assert.equal(messages.length, 0, 'watchdog recovery must not emit production Panorama logs');
assert.ok(test.getLoopTestState().generation > watchdogRecoveryGeneration, 'missed heartbeat must recover into a fresh generation');
assert.equal(liveScheduled().filter((item) => item.delay === 5).length, 1, 'watchdog recovery must restart only one live watchdog');
const recoveredHosts = test.getInstanceTestState().hosts;
for (const key of Object.keys(hostState.hosts)) {
  assert.equal(recoveredHosts[key], hostState.hosts[key], 'watchdog re-boot must reuse the owned host');
}
assert.equal(runtime.clamp.Children().filter((child) => child.id === 'TimerOverlayFrame').length, 1);
assert.equal(runtime.persp.Children().filter((child) => child.id === 'BTTimerDock').length, 1);
assert.equal(runtime.overlay.Children().filter((child) => child.id === 'MinimapGlowClip' || child.id === 'BTLingerLayer').length, 2);

// Failure mode ASTRA-03/04: a valid zero must be cached, while text with no clock digits stays explicitly invalid.
let zeroReads = 0;
const zeroClock = {
  IsValid: () => true,
  get text() {
    zeroReads++;
    return '0:00';
  },
};
test.setClockTestPanel(zeroClock);
assert.equal(test.gTime(fakeNow), 0, '0:00 is a valid game-clock reading');
fakeNow += 100;
assert.equal(test.gTime(fakeNow), 0, 'valid zero must remain cached within the 200 ms policy');
assert.equal(zeroReads, 1, 'cached zero must not traverse/read the clock again');
assert.equal(test.parseSec('clock unavailable'), -1, 'clock text with no digits must be invalid');
assert.equal(test.parseSec('-0:10'), 10, 'legacy negative clock text keeps its existing sign-stripping behavior');
runtime.clock.text = 'clock unavailable';
test.setClockTestPanel({ IsValid: () => true, text: 'clock unavailable' });
assert.equal(test.gTime(fakeNow + 201), -1, 'an unreadable clock must return the explicit invalid value');

// Failure mode ASTRA-05: a charge transition during Spawn can be missed for seconds by the normal scan interval.
let chargePresent = false;
let chargeReads = 0;
const spawnChargePanel = {
  IsValid: () => true,
  BHasClass: (name) => {
    if (name.startsWith('RejuvCount_')) chargeReads++;
    return name === 'RejuvCount_1' && chargePresent;
  },
  Children: () => [],
};
test.setRejuvTestState({
  running: true,
  spawnWait: true,
  rejuvFriendly: spawnChargePanel,
  rejuvEnemy: null,
});
test.runTimerLane(200000, 600, null);
const readsBeforeCharge = chargeReads;
chargePresent = true;
test.runTimerLane(200249, 600, null);
assert.equal(chargeReads, readsBeforeCharge, 'spawn-wait scan must not run before 250 ms');
test.runTimerLane(200250, 600, null);
assert.equal(test.getRejuvTestState().claimCnt, 1, 'spawn-wait scan must detect a charge by the 250 ms boundary');

// Failure mode ASTRA-13: a replaced charges subtree can remain inert or treat its already-present charge as a new claim.
let chargeHandlesValid = false;
let chargeTreeLookups = 0;
let reboundCharge = {
  IsValid: () => chargeHandlesValid,
  BHasClass: (name) => name === 'RejuvCount_1',
  Children: () => [],
};
const reboundCharges = {
  IsValid: () => true,
  FindChildTraverse: (id) => {
    chargeTreeLookups++;
    return id === 'RejuvenatorFriendly' ? reboundCharge : null;
  },
};
const reboundTopBar = {
  IsValid: () => true,
  FindChildTraverse: (id) => id === 'RejuvenatorCharges' ? reboundCharges : null,
};
test.setRejuvTestState({
  running: true,
  spawnWait: true,
  rejuvFriendly: { IsValid: () => false },
  rejuvEnemy: null,
  topBar: reboundTopBar,
});
chargeHandlesValid = true;
test.doScan();
assert.equal(test.getRejuvTestState().claimCnt, 0, 'first scan after charge-panel rebind must not claim an existing charge');
const lookupsAfterRebind = chargeTreeLookups;
chargeHandlesValid = false;
fakeNow += 1000;
test.doScan();
assert.equal(chargeTreeLookups, lookupsAfterRebind, 'charge-panel reacquisition must be throttled for at least five seconds');
reboundCharge = {
  IsValid: () => true,
  BHasClass: (name) => name === 'RejuvCount_1',
  Children: () => [],
};
fakeNow += 4000;
test.doScan();
assert.ok(chargeTreeLookups > lookupsAfterRebind, 'charge-panel reacquisition must resume after five seconds');
assert.equal(test.getRejuvTestState().claimCnt, 0, 'throttled panel reacquisition must also suppress its first existing-charge scan');

assert.equal(test.computeAdaptiveLoopDelayMs(100, 750, false), 100, 'near-spawn cadence must remain 100 ms');
assert.equal(test.computeAdaptiveLoopDelayMs(1000, 750, false), 500, 'normal work must cap the loop at 500 ms');
assert.equal(test.computeAdaptiveLoopDelayMs(1000, 250, false), 250, 'faster minimap work must win the cadence decision');
assert.equal(test.computeAdaptiveLoopDelayMs(1000, 750, true), 250, 'Rift-hot work must use a 250 ms cadence');
assert.equal(test.computeRejuvBuffRemaining(100, 100), 180, 'Rejuvenator buff must use the tracked 180-second duration');
assert.equal(test.computeRejuvBuffRemaining(279, 100), 1, 'Rejuvenator countdown must retain its final second');
assert.equal(test.computeRejuvBuffRemaining(280, 100), 0, 'Rejuvenator countdown must expire after 180 seconds');
assert.equal(test.computeNeutralPhase(239), null, 'medium camp countdown must not start before its one-minute lead');
assert.equal(test.computeNeutralPhase(240)?.key, 'medium', 'medium camp countdown must begin one minute before spawn');
assert.equal(test.computeNeutralPhase(300)?.key, 'medium', 'medium camp countdown must include the tracked spawn second');
assert.equal(test.computeNeutralPhase(301), null, 'medium camp countdown must end after the tracked 300-second spawn');

test.setLoopTestState({ playerSeenToken: 0, lowTimeCleared: false });
test.maybeClearNeutralCachesForLowGameTime(5);
let lowTimeState = test.getLoopTestState();
assert.equal(lowTimeState.playerSeenToken, 1, 'low-game cleanup should advance the player token once');
test.maybeClearNeutralCachesForLowGameTime(5);
lowTimeState = test.getLoopTestState();
assert.equal(lowTimeState.playerSeenToken, 1, 'repeated low-game callbacks should not clear caches twice');
test.maybeClearNeutralCachesForLowGameTime(10);
test.maybeClearNeutralCachesForLowGameTime(5);
lowTimeState = test.getLoopTestState();
assert.equal(lowTimeState.playerSeenToken, 2, 'reaching 10 seconds should rearm the next low-game cleanup');
test.maybeClearNeutralCachesForLowGameTime(Number.NaN);
assert.equal(test.getLoopTestState().playerSeenToken, 2, 'invalid game time must not clear runtime state');
test.maybeClearNeutralCachesForLowGameTime(-1);
assert.equal(test.getLoopTestState().playerSeenToken, 2, 'negative game time must not clear runtime state');

let rift = test.computeRiftState(579);
assert.equal(rift.warning, false, 'Rift readiness warning should not start before the 80s lead');
rift = test.computeRiftState(580);
assert.equal(rift.warning, true, 'Rift readiness warning should cover the 60s visual plus 20s global lead');

rift = test.computeRiftState(659);
assert.deepEqual(
  { text: rift.text, sub: rift.sub, inWindow: rift.inWindow },
  { text: '0:01', sub: 'RIFT', inWindow: false },
  'first Rift uncertainty window should begin at 11:00',
);
rift = test.computeRiftState(660);
assert.deepEqual(
  { text: rift.text, sub: rift.sub, inWindow: rift.inWindow, confirmed: rift.confirmed },
  { text: 'RIFT', sub: '±1m', inWindow: true, confirmed: false },
  'first Rift should be possible from 11:00 through 13:00',
);
rift = test.computeRiftState(781);
assert.deepEqual(
  { text: rift.text, sub: rift.sub, inWindow: rift.inWindow },
  { text: '3:59', sub: 'RIFT', inWindow: false },
  'second absolute window should account for both independent random rolls',
);
rift = test.computeRiftState(1020);
assert.deepEqual(
  { text: rift.text, sub: rift.sub, inWindow: rift.inWindow },
  { text: 'RIFT', sub: '±2m', inWindow: true },
  'second possible window should span 17:00 through 21:00 without observed spawn data',
);

test.observeRiftMarker(true, false, 100);
rift = test.computeRiftState(100);
assert.deepEqual(
  { text: rift.text, sub: rift.sub, inWindow: rift.inWindow },
  { text: '9:20', sub: 'RIFT', inWindow: false },
  'idle capture-point marker at match start must not report an active Rift',
);
test.observeRiftMarker(false, false, 101);

test.observeRiftMarker(true, true, 700);
rift = test.computeRiftState(705);
assert.deepEqual(
  { text: rift.text, sub: rift.sub, inWindow: rift.inWindow, warning: rift.warning, confirmed: rift.confirmed },
  { text: '0:15', sub: 'RIFT', inWindow: false, warning: true, confirmed: true },
  'stock koth_warning marker should replace uncertainty with the exact global-warning countdown',
);
test.observeRiftMarker(false, false, 706);
test.observeRiftMarker(true, true, 707);
rift = test.computeRiftState(708);
assert.deepEqual(
  { text: rift.text, warning: rift.warning },
  { text: '0:12', warning: true },
  're-observing the same pending warning must not restart its 20-second countdown',
);
test.observeRiftMarker(true, false, 720);
rift = test.computeRiftState(720);
assert.deepEqual(
  { text: rift.text, sub: rift.sub, inWindow: rift.inWindow, confirmed: rift.confirmed },
  { text: 'NOW', sub: 'RIFT', inWindow: true, confirmed: true },
  'completed koth_warning countdown should identify the exact Rift start',
);
test.observeRiftMarker(false, false, 721);
test.observeRiftMarker(true, true, 722);
rift = test.computeRiftState(723);
assert.deepEqual(
  { text: rift.text, warning: rift.warning, confirmed: rift.confirmed },
  { text: 'NOW', warning: false, confirmed: false },
  'a stale warning reappearance just after spawn must not fabricate a second countdown',
);
test.observeRiftMarker(false, false, 724);
rift = test.computeRiftState(1079);
assert.deepEqual(
  { text: rift.text, sub: rift.sub, inWindow: rift.inWindow },
  { text: '0:01', sub: 'RIFT', inWindow: false },
  'observed Rift spawn should reset the next interval to a single ±1m uncertainty',
);

const riftCardLayout = timerLayoutSource.match(/<Panel id="RiftTimerCard"[\s\S]*?<\/Panel>/);
assert.ok(riftCardLayout, 'Rift timer card layout missing');
assert.ok(
  riftCardLayout[0].indexOf('id="RiftTimerSub"') < riftCardLayout[0].indexOf('id="RiftTimerTime"'),
  'Rift label must render above its timer, matching the Urn card',
);
assert.match(
  riftCardLayout[0],
  /id="RiftTimerCard"[^>]*hittest="false"/,
  'Rift timer card must remain inert',
);
assert.doesNotMatch(
  timerLayoutSource,
  /UrnPingButton|RiftMenuHitbox|RiftChatMenu|handleUrnPingActivate|handleRift(Menu|Chat)Activate/,
  'Rift and Urn cards must stay display-only until their chat actions are ready',
);
for (const name of ['RejuvPingButton', 'BuffPingButton']) {
  assert.match(timerLayoutSource, new RegExp(`\\bid="${name}"`), `${name} must be present in the timer overlay`);
}
assert.doesNotMatch(timerLayoutSource, /\bonactivate\s*=/i, 'ping activation is bound in JS, not XML');

let riftCardActive = true;
let urnCardActive = true;
const objectiveCard = (setActive) => ({
  IsValid: () => true,
  BHasClass: (className) => className === 'active',
  SetHasClass: (className, enabled) => {
    if (className === 'active') setActive(enabled);
  },
});
test.setObjectiveTestState({
  running: true,
  hud: { BHasClass: () => true },
  riftCard: objectiveCard((enabled) => { riftCardActive = enabled; }),
  urnCard: objectiveCard((enabled) => { urnCardActive = enabled; }),
});
test.updateObjectiveTimers(100, null);
assert.equal(riftCardActive, false, 'Rift card must hide immediately in hideout');
assert.equal(urnCardActive, false, 'Urn card must hide immediately in hideout');

let urn = test.computeUrnState(539);
assert.deepEqual({ remaining: urn.remaining, warning: urn.warning }, { remaining: 61, warning: false });
urn = test.computeUrnState(540);
assert.deepEqual(
  { remaining: urn.remaining, warning: urn.warning },
  { remaining: 60, warning: true },
  'Urn warning color should begin one minute before spawn',
);
urn = test.computeUrnState(601);
assert.deepEqual({ remaining: urn.remaining, warning: urn.warning }, { remaining: 299, warning: false });
// Failure mode ASTRA-33: later exact spawn boundaries can incorrectly roll over to the full next interval.
for (const spawnBoundary of [600, 900, 1200, 1500]) {
  assert.equal(
    test.computeUrnState(spawnBoundary).remaining,
    0,
    `every Urn spawn boundary (${spawnBoundary}) must report zero remaining`,
  );
}
const glowClassAdds = [0, 0];
const glowClassRemoves = [0, 0];
const glowPanels = [0, 1].map((side) => ({
  IsValid: () => true,
  AddClass: (className) => {
    if (className !== 'glow-enemy') glowClassAdds[side] += 1;
  },
  RemoveClass: (className) => {
    if (className !== 'glow-enemy') glowClassRemoves[side] += 1;
  },
}));
test.setGlowTestUi({ IsValid: () => true, BHasClass: () => false }, glowPanels);
const glowSnapshot = {
  powerupSpawns: [
    { isActive: true, type: 'powerup_casting', xPct: 25, yPct: 50, panel: {} },
    { isActive: true, type: 'powerup_gun', xPct: 75, yPct: 50, panel: {} },
  ],
};
test.scanPowerups(1000, glowSnapshot, false);
test.scanPowerups(1250, glowSnapshot, false);
assert.deepEqual(glowClassAdds, [1, 1], 'unchanged buff glows must not restart their pulse animation');
assert.deepEqual(glowClassRemoves, [0, 0], 'unchanged buff glows must not be cleared between scans');
// Failure mode ASTRA-14: the sole surviving right spawn is misidentified as left, with pretrack distances assigned to the wrong glow.
const rightGlowAdds = [0, 0];
const rightGlowPanels = [0, 1].map((side) => ({
  IsValid: () => true,
  AddClass: (name) => { if (name !== 'glow-enemy') rightGlowAdds[side]++; },
  RemoveClass: () => {},
}));
test.setGlowTestUi({ IsValid: () => true, BHasClass: () => false }, rightGlowPanels);
test.setPowerupTestState({
  knownSpawnPos: { left: { x: 25, y: 50 }, right: { x: 70, y: 50 } },
  pretrackActive: true,
  pretrackData: {
    left: { minAlly: 11, minEnemy: 12 },
    right: { minAlly: 21, minEnemy: 22 },
  },
});
test.scanPowerups(2000, {
  powerupSpawns: [{ isActive: true, type: 'powerup_gun', xPct: 75, yPct: 40, panel: {} }],
}, false);
let powerupState = test.getPowerupTestState();
assert.deepEqual(rightGlowAdds, [0, 1], 'a sole xPct=75 marker must activate the right glow');
assert.equal(powerupState.tracked[0].side, 1, 'screen-right powerup must retain the right-side identity');
assert.equal(powerupState.tracked[0].minAllyDist, 21, 'right-side pretrack data must seed the right-side powerup');
assert.equal(powerupState.knownSpawnPos.left.x, 25, 'single-marker refresh must preserve the known left spawn');
assert.equal(powerupState.knownSpawnPos.right.x, 75, 'single-marker refresh must update the active right spawn');

const invertedGlowAdds = [0, 0];
const invertedGlowPanels = [0, 1].map((side) => ({
  IsValid: () => true,
  AddClass: (name) => { if (name !== 'glow-enemy') invertedGlowAdds[side]++; },
  RemoveClass: () => {},
}));
test.setGlowTestUi({ IsValid: () => true, BHasClass: (name) => name === 'invert_map' }, invertedGlowPanels);
test.setPowerupTestState({
  knownSpawnPos: { left: { x: 25, y: 50 }, right: { x: 70, y: 50 } },
  pretrackActive: true,
  pretrackData: {
    left: { minAlly: 31, minEnemy: 32 },
    right: { minAlly: 41, minEnemy: 42 },
  },
});
test.scanPowerups(2250, {
  powerupSpawns: [{ isActive: true, type: 'powerup_gun', xPct: 75, yPct: 40, panel: {} }],
}, false);
powerupState = test.getPowerupTestState();
assert.deepEqual(invertedGlowAdds, [1, 0], 'invert_map must mirror the sole screen-right marker to the left glow');
assert.equal(powerupState.tracked[0].side, 0, 'inverted right-side marker must map to the left side');
assert.equal(powerupState.tracked[0].minAllyDist, 31, 'inverted marker must seed from the mapped left-side pretrack data');
assert.equal(powerupState.knownSpawnPos.right.x, 70, 'inverted single-marker refresh must preserve the other known spawn');
assert.equal(powerupState.knownSpawnPos.left.x, 75, 'inverted single-marker refresh must update the mapped left spawn');

let failedGlowAdds = 0;
const retryGlowPanels = [
  {
    IsValid: () => true,
    AddClass: (className) => {
      if (className === 'glow-enemy') return;
      failedGlowAdds += 1;
      if (failedGlowAdds === 1) throw new Error('transient Panorama class failure');
    },
    RemoveClass: () => {},
  },
  { IsValid: () => true, AddClass: () => {}, RemoveClass: () => {} },
];
test.setGlowTestUi({ IsValid: () => true, BHasClass: () => false }, retryGlowPanels);
test.scanPowerups(1500, glowSnapshot, false);
test.scanPowerups(1750, glowSnapshot, false);
assert.equal(failedGlowAdds, 2, 'failed glow class writes must retry on the next scan');
// Failure mode ASTRA-08: a thrown SetHasClass can be cached as success and prevent a later retry.
let activeClassAttempts = 0;
const retryClassPanel = {
  IsValid: () => true,
  BHasClass: () => false,
  SetHasClass: (name) => {
    if (name !== 'active') return;
    activeClassAttempts++;
    if (activeClassAttempts === 1) throw new Error('transient class write failure');
  },
};
test.setMiniCardTestPanel(retryClassPanel);
test.setMiniCardState(true, false);
test.setMiniCardState(true, false);
assert.equal(activeClassAttempts, 2, 'failed class write must not commit the cache and must retry');

// Failure mode ASTRA-09/19: a redundant class read and one throwing marker can hide later snapshot entries.
let mapButtonReads = 0;
const brokenMarker = {
  IsValid: () => true,
  BHasClass: (name) => {
    if (name === 'map_button') mapButtonReads++;
    if (name === 'player') throw new Error('marker became invalid during class read');
    return false;
  },
};
const goodMarkerCalls = [];
const goodMarker = {
  id: 'snapshot_player',
  actualxoffset: 20,
  actualyoffset: 30,
  IsValid: () => true,
  BHasClass: (name) => {
    goodMarkerCalls.push(name);
    if (name === 'map_button') mapButtonReads++;
    if (name === 'player') return true;
    if (name === 'team1') return true;
    return false;
  },
};
const snapshotMinimap = {
  actuallayoutwidth: 100,
  actuallayoutheight: 100,
  IsValid: () => true,
  BHasClass: () => false,
  FindChildrenWithClassTraverse: (name) => name === 'map_button' ? [brokenMarker, goodMarker] : [],
};
test.setMinimapTestUi(snapshotMinimap);
const containedSnapshot = test.collectMinimapSnapshot(5000, true);
assert.equal(containedSnapshot.players.length, 1, 'a throwing marker must not truncate later snapshot players');
assert.equal(mapButtonReads, 0, 'snapshot classification must trust the map_button traversal query');
assert.equal(goodMarkerCalls[0], 'player', 'classification must early-check player before other marker kinds');


const lingerLabel = {
  style: {},
  AddClass: () => {},
  IsValid: () => true,
  DeleteAsync: () => {},
};
let lingerLookupParent = '';
const lingerContainer = {
  contentwidth: 320,
  contentheight: 320,
  IsValid: () => true,
  FindChildTraverse: () => {
    lingerLookupParent = 'container';
    return null;
  },
};
const lingerLayer = {
  IsValid: () => true,
  FindChildTraverse: () => {
    lingerLookupParent = 'layer';
    return lingerLabel;
  },
};
let lingerAcceptsInput = true;
let lingerAcceptsFocus = true;
const lingerAttributes = new Map();
const lingerButton = {
  actualxoffset: 300,
  actualyoffset: 200,
  actuallayoutwidth: 32,
  actuallayoutheight: 32,
  hittest: true,
  hittestchildren: true,
  style: { opacity: '0.8' },
  IsValid: () => true,
  BAcceptsInput: () => lingerAcceptsInput,
  SetAcceptsInput: (enabled) => { lingerAcceptsInput = enabled; },
  BAcceptsFocus: () => lingerAcceptsFocus,
  SetAcceptsFocus: (enabled) => { lingerAcceptsFocus = enabled; },
  GetAttributeString: (key, fallback) => lingerAttributes.has(key) ? lingerAttributes.get(key) : fallback,
  SetAttributeString: (key, value) => lingerAttributes.set(key, value),
};
const lingerMinimap = {
  actuallayoutwidth: 400,
  actuallayoutheight: 300,
  IsValid: () => true,
  BHasClass: () => false,
  FindChildTraverse: () => {
    lingerLookupParent = 'minimap';
    return lingerLabel;
  },
};
test.setLingerTestUi(lingerContainer, lingerMinimap, lingerLayer);
test.showLinger('enemy_test', lingerButton);
assert.equal(lingerLookupParent, 'layer', 'linger label must live in BTLingerLayer, not HudMinimapContainer');
assert.equal(
  lingerLabel.style.position,
  '74% 67% 0px',
  'linger question mark should overlay the enemy marker center',
);
assert.deepEqual(
  { width: lingerLabel.style.width, height: lingerLabel.style.height, fontSize: lingerLabel.style.fontSize },
  { width: '10%', height: '10%', fontSize: '29px' },
  'linger question mark should take the enemy marker size',
);
assert.equal(lingerButton.hittest, false, 'lingering hero button must not accept clicks');
assert.equal(lingerButton.hittestchildren, false, 'lingering hero descendants must not accept clicks');
assert.equal(lingerAcceptsInput, false, 'lingering hero panel must reject Panorama input');
assert.equal(lingerAcceptsFocus, false, 'lingering hero panel must reject Panorama focus');
test.removeLinger('enemy_test', true);
assert.equal(lingerButton.hittest, true, 'hero button hit testing must be restored when linger ends');
assert.equal(lingerButton.hittestchildren, true, 'hero descendant hit testing must be restored when linger ends');
assert.equal(lingerAcceptsInput, true, 'hero Panorama input acceptance must be restored when linger ends');
assert.equal(lingerAcceptsFocus, true, 'hero Panorama focus acceptance must be restored when linger ends');
assert.equal(lingerButton.style.opacity, '0.8', 'hero opacity must be restored exactly when linger ends');
assert.equal(lingerAttributes.get('bt_linger_prev'), '', 'normal linger restoration clears the predecessor attribute');
test.showLinger('enemy_restore_race', lingerButton);
const throwingOpacityStyle = {};
Object.defineProperty(throwingOpacityStyle, 'opacity', {
  set: () => { throw new Error('engine opacity setter failed'); },
});
lingerButton.style = throwingOpacityStyle;
test.removeLinger('enemy_restore_race', true);
assert.equal(lingerButton.hittest, true, 'hit testing restoration must survive an opacity setter failure');
assert.equal(lingerButton.hittestchildren, true, 'descendant restoration must survive an opacity setter failure');
assert.equal(lingerAcceptsInput, true, 'input restoration must survive an opacity setter failure');
assert.equal(lingerAcceptsFocus, true, 'focus restoration must survive an opacity setter failure');
lingerButton.style = { opacity: '0.8' };

lingerLayer.FindChildTraverse = () => null;
lingerMinimap.FindChildTraverse = () => null;
let failedLabelDeleted = false;
const failedLabelStyle = {};
Object.defineProperty(failedLabelStyle, 'position', {
  set: () => { throw new Error('label position rejected'); },
});
sandbox.$.CreatePanel = () => ({
  style: failedLabelStyle,
  AddClass: () => {},
  IsValid: () => true,
  DeleteAsync: () => { failedLabelDeleted = true; },
});
test.showLinger('enemy_create_failure', lingerButton);
assert.equal(lingerButton.hittest, true, 'failed linger creation must not leave hero hit testing disabled');
assert.equal(lingerButton.hittestchildren, true, 'failed linger creation must not leave descendants disabled');
assert.equal(lingerAcceptsInput, true, 'failed linger creation must not leave Panorama input disabled');
assert.equal(lingerAcceptsFocus, true, 'failed linger creation must not leave Panorama focus disabled');

assert.equal(failedLabelDeleted, true, 'partially created linger labels must be deleted when setup fails');
let invalidLabelRecreated = false;
lingerLayer.FindChildTraverse = () => ({ IsValid: () => false });
sandbox.$.CreatePanel = () => {
  invalidLabelRecreated = true;
  return {
    style: {},
    AddClass: () => {},
    IsValid: () => true,
    DeleteAsync: () => {},
  };
};
test.showLinger('enemy_invalid_label', lingerButton);
assert.equal(invalidLabelRecreated, true, 'an invalid prior linger label must be recreated');
test.removeLinger('enemy_invalid_label', true);
lingerLayer.FindChildTraverse = () => lingerLabel;
const predecessorState = {
  previousHitTest: true,
  previousHitTestChildren: true,
  previousOpacity: '0.8',
  previousAcceptsInput: true,
  previousAcceptsFocus: true,
};
lingerAttributes.set('bt_linger_prev', JSON.stringify(predecessorState));
lingerButton.hittest = lingerButton.hittestchildren = false;
lingerButton.style.opacity = '0.5';
lingerAcceptsInput = lingerAcceptsFocus = false;
test.showLinger('enemy_predecessor', lingerButton);
test.removeLinger('enemy_predecessor', true);
assert.equal(lingerButton.hittest, true, 'predecessor original hit testing must survive reload');
assert.equal(lingerButton.hittestchildren, true);
assert.equal(lingerButton.style.opacity, '0.8', 'predecessor original opacity must survive reload');
assert.equal(lingerAcceptsInput, true);
assert.equal(lingerAcceptsFocus, true);
assert.equal(lingerAttributes.get('bt_linger_prev'), '', 'restoring predecessor state clears the attribute');

const scaledContainer = { contentwidth: 320, contentheight: 240 };
const scaledMinimap = {
  actuallayoutwidth: 400,
  actuallayoutheight: 300,
  IsValid: () => true,
  BHasClass: () => false,
};
let lingerPosition = test.computeLingerLabelPosition(
  { actualxoffset: 300, actualyoffset: 200, actuallayoutwidth: 32, actuallayoutheight: 32 },
  scaledContainer,
  scaledMinimap,
);
assert.deepEqual(
  { x: lingerPosition.x, y: lingerPosition.y },
  { x: 74, y: 65.333 },
  'linger positioning should center the label over the marker',
);
scaledMinimap.BHasClass = () => true;
lingerPosition = test.computeLingerLabelPosition(
  { actualxoffset: 300, actualyoffset: 200, actuallayoutwidth: 32, actuallayoutheight: 32 },
  scaledContainer,
  scaledMinimap,
);
assert.deepEqual(
  { x: lingerPosition.x, y: lingerPosition.y },
  { x: 16, y: 21.333 },
  'inverted minimaps should mirror the marker before centering the label',
);
scaledMinimap.BHasClass = () => false;
lingerPosition = test.computeLingerLabelPosition(
  { actualxoffset: 395, actualyoffset: 400, actuallayoutwidth: 32, actuallayoutheight: 32 },
  { contentwidth: 320, contentheight: 320 },
  scaledMinimap,
);
assert.deepEqual(
  { x: lingerPosition.x, y: lingerPosition.y },
  { x: 90, y: 90 },
  'percentage top-left placement should keep the whole label inside the minimap',
);
const capturedLingerButton = {
  actualxoffset: 262.3905334472656,
  actualyoffset: 274.3076477050781,
  actuallayoutwidth: 24.850862503051758,
  actuallayoutheight: 24.850862503051758,
};
const capturedLingerPosition = { x: 65.762, y: 68.749 };
lingerPosition = test.computeLingerLabelPosition(
  capturedLingerButton,
  { contentwidth: 399, contentheight: 399 },
  null,
);
assert.deepEqual(
  { x: lingerPosition.x, y: lingerPosition.y },
  capturedLingerPosition,
  'live container fallback should preserve the captured enemy marker center',
);
lingerPosition = test.computeLingerLabelPosition(
  capturedLingerButton,
  {
    actuallayoutwidth: 399,
    actuallayoutheight: 399,
    contentwidth: 539,
    contentheight: 539,
  },
  null,
);
assert.deepEqual(
  { x: lingerPosition.x, y: lingerPosition.y },
  capturedLingerPosition,
  'active oversized glow content must not change percentage linger positioning',
);
// Failure mode: since the 2026-09-29 HUD the 360px map sits centred inside the 420px HudMinimapContainer,
// so minimap fractions used directly as container percentages push '?' off the marker.
const lingerChainPanel = (fields, parent) => ({
  ...fields,
  IsValid: () => true,
  BHasClass: () => false,
  GetParent: () => parent,
});
const insetContainer = { actuallayoutwidth: 420, actuallayoutheight: 420, IsValid: () => true };
const insetMinimap = lingerChainPanel(
  { actualxoffset: 30, actualyoffset: 30, actuallayoutwidth: 360, actuallayoutheight: 360 },
  insetContainer,
);
const insetButton = (x, y, size, parent) => lingerChainPanel(
  { actualxoffset: x, actualyoffset: y, actuallayoutwidth: size, actuallayoutheight: size },
  parent,
);
lingerPosition = test.computeLingerLabelPosition(insetButton(164, 164, 32, insetMinimap), insetContainer, insetMinimap);
assert.deepEqual(
  { ...lingerPosition },
  { x: 46.19, y: 46.19, w: 7.619, h: 7.619, fontSize: 29 },
  'a centred marker on the inset minimap must get a marker-sized label at the container centre',
);
lingerPosition = test.computeLingerLabelPosition(insetButton(0, 328, 32, insetMinimap), insetContainer, insetMinimap);
assert.deepEqual(
  { x: lingerPosition.x, y: lingerPosition.y },
  { x: 7.143, y: 85.238 },
  'an edge marker on the inset minimap must keep its label inside the minimap inset',
);
insetMinimap.BHasClass = (name) => name === 'invert_map';
lingerPosition = test.computeLingerLabelPosition(insetButton(0, 328, 32, insetMinimap), insetContainer, insetMinimap);
assert.deepEqual(
  { x: lingerPosition.x, y: lingerPosition.y },
  { x: 85.238, y: 7.143 },
  'inverted inset minimaps must mirror inside the minimap before mapping to the container',
);
// Failure mode: markers nested in an engine layer below hud_minimap must still land on the marker; reading only
// the marker's own offset drops the layer's offset.
const flatMinimap = lingerChainPanel(
  { actualxoffset: 0, actualyoffset: 0, actuallayoutwidth: 420, actuallayoutheight: 420 },
  insetContainer,
);
const markerLayer = lingerChainPanel(
  { actualxoffset: 30, actualyoffset: 30, actuallayoutwidth: 360, actuallayoutheight: 360 },
  flatMinimap,
);
lingerPosition = test.computeLingerLabelPosition(insetButton(164, 164, 32, markerLayer), insetContainer, flatMinimap);
assert.deepEqual(
  { x: lingerPosition.x, y: lingerPosition.y },
  { x: 46.19, y: 46.19 },
  'a marker inside an offset layer must get its label on the marker',
);
flatMinimap.BHasClass = (name) => name === 'invert_map';
lingerPosition = test.computeLingerLabelPosition(insetButton(0, 328, 32, markerLayer), insetContainer, flatMinimap);
assert.deepEqual(
  { x: lingerPosition.x, y: lingerPosition.y },
  { x: 85.238, y: 7.143 },
  'inverted minimaps must mirror a layered marker inside the flipped hud_minimap box',
);
insetMinimap.BHasClass = () => false;
// Failure mode: a marker whose parent chain cannot be walked must still be treated as a hud_minimap child.
lingerPosition = test.computeLingerLabelPosition(insetButton(164, 164, 32, null), insetContainer, insetMinimap);
assert.deepEqual(
  { x: lingerPosition.x, y: lingerPosition.y },
  { x: 46.19, y: 46.19 },
  'a broken marker chain must fall back to hud_minimap-relative offsets plus the minimap inset',
);
lingerPosition = test.computeLingerLabelPosition(
  insetButton(164, 164, 30, insetMinimap),
  { actuallayoutwidth: 420, actuallayoutheight: 420, actualuiscale_y: 1.5 },
  insetMinimap,
);
assert.equal(lingerPosition.fontSize, 18, 'label font must convert actual marker pixels back to layout pixels');
// Failure mode ASTRA-17: maintenance can repeatedly restart a dead enemy's grace timer and keep its corpse claimable.
test.setPlayerStateTest('stationary_corpse', {
  x: 50,
  y: 50,
  deadTs: 0,
  wasActive: true,
  team: 2,
  lastSeenMs: 0,
});
const corpseSnapshot = {
  players: [{
    id: 'stationary_corpse',
    team: 2,
    isActive: false,
    isDead: true,
    xPct: 50,
    yPct: 50,
    panel: null,
  }],
};
test.checkEnemyLinger(1000, corpseSnapshot);
const initialDeadTs = test.getPlayerStateTest('stationary_corpse').deadTs;
test.checkEnemyLinger(5000, corpseSnapshot);
assert.equal(test.getPlayerStateTest('stationary_corpse').deadTs, initialDeadTs, 'repeated linger checks must not restart dead grace');
const corpseTarget = { x: 50, y: 50, minAllyDist: 0, minEnemyDist: 0 };
test.computeNearestForTargets(corpseSnapshot.players, [corpseTarget], 1, 5000, false);
assert.equal(corpseTarget.minEnemyDist, Infinity, 'stationary dead enemy must be excluded after death grace');

// Failed BLoadLayout never leaves a partial host or starts the timer loop.
function checkLayoutFailure(failures, throwFailure = false) {
  const scene = makeRuntimeRoot('10:00');
  let nowMs = 0;
  let nextId = 0;
  let attempts = 0;
  const tasks = [];
  const local = {
    module: { exports: {} }, exports: {}, console, globalThis: {}, Date: { now: () => nowMs },
    $: {
      GetContextPanel: () => scene.minimap,
      Schedule: (delay, callback) => {
        const item = { id: ++nextId, due: nowMs + delay * 1000, delay, callback, cancelled: false };
        tasks.push(item);
        return item.id;
      },
      CancelScheduled: (handle) => { const task = tasks.find((item) => item.id === handle); if (task) task.cancelled = true; },
      DispatchEvent: () => {}, Msg: () => {},
      CreatePanel: (type, parent, id) => createPanel(type, parent, id, () => {
        if (id === 'TimerOverlayFrame' && attempts++ < failures) {
          if (throwFailure) throw new Error('layout temporarily unavailable');
          return false;
        }
        return true;
      }),
    },
  };
  vm.createContext(local);
  vm.runInContext(source, local, { filename: scriptPath });
  const timer = local.module.exports.__test;
  assert.equal(attempts, 1, 'boot attempts the first layout immediately');
  if (failures) assert.equal(scene.clamp.children.find((child) => child.id === 'TimerOverlayFrame').deleted, true, 'failed host must be deleted');
  for (let n = 1; n <= Math.min(failures, 4); n++) {
    assert.equal(tasks.filter((task) => !task.cancelled).length, 1, 'no timer loop or watchdog before layouts load');
    const retry = tasks.find((task) => !task.cancelled);
    assert.equal(retry.delay, 1, 'layout failure retry is one second');
    tasks.splice(tasks.indexOf(retry), 1);
    nowMs = retry.due;
    retry.callback();
    assert.equal(attempts, Math.min(n + 1, 5));
  }
  return { scene, timer, tasks };
}
const recoveredLayout = checkLayoutFailure(1);
assert.equal(recoveredLayout.scene.clamp.Children().filter((child) => child.id === 'TimerOverlayFrame').length, 1, 'retry creates one valid timer host');
assert.equal(recoveredLayout.tasks.filter((task) => !task.cancelled && task.delay === 5).length, 1, 'watchdog begins only after successful layout');
assert.equal(checkLayoutFailure(1, true).scene.clamp.Children().filter((child) => child.id === 'TimerOverlayFrame').length, 1, 'thrown layout load retries too');
const failedLayout = checkLayoutFailure(5);
assert.equal(failedLayout.timer.getInstanceTestState().retired, true, 'five layout failures give up');
assert.equal(failedLayout.scene.clamp.Children().filter((child) => child.id === 'TimerOverlayFrame').length, 0, 'no failed host survives');
assert.equal(failedLayout.tasks.filter((task) => !task.cancelled).length, 0, 'give-up leaves no scheduled work');

// A second minimap instance supersedes the first without stealing its owned hosts or stock marker state.
sandbox.$.CreatePanel = createPanel;
runtime.overlay.actuallayoutwidth = runtime.overlay.actuallayoutheight = 400;
runtime.minimap.actuallayoutwidth = runtime.minimap.actuallayoutheight = 400;
test.setLingerTestUi(runtime.overlay, runtime.minimap, recoveredHosts.lingerLayer);
const stockMarker = createPanel('Panel', runtime.minimap, 'old_enemy');
stockMarker.actualxoffset = stockMarker.actualyoffset = 100;
stockMarker.actuallayoutwidth = stockMarker.actuallayoutheight = 32;
stockMarker.hittest = stockMarker.hittestchildren = true;
stockMarker.style.opacity = '0.9';
let stockInput = true;
let stockFocus = true;
stockMarker.BAcceptsInput = () => stockInput;
stockMarker.SetAcceptsInput = (on) => { stockInput = on; };
stockMarker.BAcceptsFocus = () => stockFocus;
stockMarker.SetAcceptsFocus = (on) => { stockFocus = on; };
test.showLinger('old_enemy', stockMarker);
const ownedLinger = recoveredHosts.lingerLayer.FindChildTraverse('LingerQ_old_enemy');
assert.equal(ownedLinger.GetParent(), recoveredHosts.lingerLayer, 'new labels are created in the owned linger host');
assert.equal(runtime.overlay.Children().some((child) => child.id === 'LingerQ_old_enemy'), false, 'labels are not direct children of HudMinimapContainer');
assert.equal(stockMarker.hittest, false, 'old instance owns an active linger before replacement');
const stalePing = recoveredHosts.timerOverlay.FindChildTraverse('RejuvPingButton').events.onactivate;
const oldHandles = new Set(liveScheduled().map((item) => item.id));
const secondVm = {
  module: { exports: {} }, exports: {}, console, globalThis: {}, Date: { now: () => fakeNow },
  $: { ...sandbox.$, GetContextPanel: () => runtime.minimap, CreatePanel: createPanel },
};
vm.createContext(secondVm);
vm.runInContext(source, secondVm, { filename: scriptPath });
const second = secondVm.module.exports.__test;
assert.equal(second.getInstanceTestState().instanceGen, hostState.instanceGen + 1, 'second instance increments bt_timer_gen');
const successorHosts = second.getInstanceTestState().hosts;
for (const key of Object.keys(recoveredHosts)) {
  assert.notEqual(successorHosts[key], recoveredHosts[key], `${key} belongs to the new instance`);
  assert.equal(successorHosts[key].IsValid(), true);
  assert.equal(successorHosts[key].GetParent().Children().filter((child) => child.id === successorHosts[key].id).length, 1);
}
assert.equal(test.timerAlive(), false, 'superseded instance loses the generation guard');
advanceBy(1000);
assert.equal(test.getInstanceTestState().retired, true, 'stale loop retires the first instance');
for (const host of Object.values(recoveredHosts)) assert.equal(host.deleted, true, 'retire deletes only its owned hosts');
assert.equal(stockMarker.hittest, true, 'retire restores the stock marker hit testing');
assert.equal(stockMarker.hittestchildren, true);
assert.equal(stockMarker.style.opacity, '0.9');
assert.equal(stockInput, true);
assert.equal(stockFocus, true);
assert.equal(stockMarker.GetAttributeString('bt_linger_prev', 'missing'), '', 'retire clears saved stock state');
assert.ok(liveScheduled().every((item) => !oldHandles.has(item.id)), 'retired instance has no live schedules');
test.setRejuvTestState({ running: true, root: runtime.root, topBar: runtime.topBar });
const remainingSchedules = liveScheduled().length;
const sentEvents = dispatchedEvents;
stalePing();
assert.equal(liveScheduled().length, remainingSchedules, 'retired ping handler cannot schedule team chat');
assert.equal(dispatchedEvents, sentEvents, 'retired ping handler cannot dispatch team chat');
assert.equal(second.getInstanceTestState().retired, false, 'successor remains live');

// Each generation guard must retire on its own callback, without advancing the other callback or creating a successor.
function bootGuardScenario() {
  scheduled.length = 0;
  const scene = makeRuntimeRoot('10:00');
  contextPanel = scene.minimap;
  const isolatedVm = {
    module: { exports: {} }, exports: {}, console, globalThis: {}, Date: { now: () => fakeNow },
    $: sandbox.$,
  };
  vm.createContext(isolatedVm);
  vm.runInContext(source, isolatedVm, { filename: scriptPath });
  const instance = isolatedVm.module.exports.__test;
  assert.equal(instance.getInstanceTestState().retired, false, 'guard scenario boots a live instance');
  assert.equal(liveScheduled().filter((item) => item.delay === 5).length, 1, 'guard scenario has a pending watchdog');
  assert.equal(liveScheduled().filter((item) => item.delay < 1).length, 1, 'guard scenario has a pending loop');
  return { scene, instance };
}

const loopGuard = bootGuardScenario();
const loopHosts = loopGuard.instance.getInstanceTestState().hosts;
const deleteCalls = new Map();
for (const host of Object.values(loopHosts)) {
  deleteCalls.set(host, 0);
  const deleteAsync = host.DeleteAsync;
  host.DeleteAsync = function (delay) {
    assert.equal(delay, 0, 'retire deletes its owned host immediately');
    deleteCalls.set(host, deleteCalls.get(host) + 1);
    return deleteAsync.call(this, delay);
  };
}
loopGuard.scene.root.SetAttributeInt('bt_timer_gen', loopGuard.instance.getInstanceTestState().instanceGen + 1);
const pendingLoop = liveScheduled().find((item) => item.delay < 1);
scheduled.splice(scheduled.indexOf(pendingLoop), 1);
pendingLoop.callback();
assert.equal(loopGuard.instance.getInstanceTestState().retired, true, 'stale loop callback must retire without watchdog help');
assert.equal(liveScheduled().filter((item) => item.delay < 1).length, 0, 'stale loop must not schedule another loop');
for (const host of Object.values(loopHosts)) {
  assert.equal(deleteCalls.get(host), 1, 'retire must call DeleteAsync on each owned host without successor sweep');
}
assert.ok(Object.values(loopGuard.instance.getInstanceTestState().hosts).every((host) => host === null), 'retire clears all four host references');

const watchdogGuard = bootGuardScenario();
watchdogGuard.scene.root.SetAttributeInt('bt_timer_gen', watchdogGuard.instance.getInstanceTestState().instanceGen + 1);
const pendingWatchdog = liveScheduled().find((item) => item.delay === 5);
scheduled.splice(scheduled.indexOf(pendingWatchdog), 1);
pendingWatchdog.callback();
assert.equal(watchdogGuard.instance.getInstanceTestState().retired, true, 'stale watchdog callback must retire without loop help');
assert.equal(liveScheduled().filter((item) => item.delay === 5 || item.delay < 1).length, 0, 'stale watchdog leaves no watchdog or loop scheduled');

// Failure mode ASTRA-06/26: obsolete corner glows and an unproduced forward rotation can drift back into the package.
assert.doesNotMatch(glowLayoutSource, /id="MinimapGlow(?:Left|Right)(?:Top|Bot)"/, 'only the two working lateral glow panels should remain');
assert.doesNotMatch(buffClaimStyleSource, /\.glow-(?:left|right)-(?:top|bot)\b/, 'corner-only glow selectors should be removed');
assert.doesNotMatch(timerStyleSource, /^@keyframes 'rotate'\s*\{/m, 'unused forward rotation keyframes should be removed');
assert.doesNotMatch(timerStyleSource, /#RejuvImg\.rotating\.buff\b/, 'unused forward rotation selector should be removed');
assert.match(timerStyleSource, /#RejuvImg\.rotating\.reverse\b/, 'supported reverse rotation must remain');

// hideout must still publish timer presence and honour settings classes
for (const clockText of ['10:00', 'clock unavailable']) {
  scheduled.length = 0;
  const scene = makeRuntimeRoot(clockText);
  scene.root.AddClass('connectedToHideout');
  scene.overlay.actuallayoutwidth = scene.overlay.actuallayoutheight = 400;
  scene.minimap.actuallayoutwidth = scene.minimap.actuallayoutheight = 400;
  contextPanel = scene.minimap;
  const isolatedVm = {
    module: { exports: {} }, exports: {}, console, globalThis: {}, Date: { now: () => fakeNow },
    $: sandbox.$,
  };
  vm.createContext(isolatedVm);
  vm.runInContext(source, isolatedVm, { filename: scriptPath });
  const instance = isolatedVm.module.exports.__test;
  assert.equal(instance.getInstanceTestState().retired, false, 'hideout timer must boot a live instance');
  assert.equal(instance.getLoopTestState().running, false, 'hideout and invalid clocks must not start a run');
  assert.equal(scene.minimap.BHasClass('bt-buff-timer'), true, 'hideout must still publish timer presence and honour settings classes');
  const pendingTick = liveScheduled().find((item) => item.delay !== 5);
  assert.ok(pendingTick, 'inactive timer must own a pending loop');
  // Create the linger just before the tick so its five-second expiry cannot satisfy the clearing assertion.
  advanceTo(pendingTick.dueMs - 1);
  const marker = createPanel('Panel', scene.minimap, 'hideout_enemy');
  marker.actualxoffset = marker.actualyoffset = 100;
  marker.actuallayoutwidth = marker.actuallayoutheight = 32;
  marker.hittest = marker.hittestchildren = true;
  marker.style.opacity = '0.9';
  instance.showLinger('hideout_enemy', marker);
  const hosts = instance.getInstanceTestState().hosts;
  const label = hosts.lingerLayer.FindChildTraverse('LingerQ_hideout_enemy');
  assert.ok(label && label.IsValid(), 'inactive timer fixture must contain a live linger');
  assert.equal(marker.hittest, false, 'fixture linger must hide stock marker hit testing');
  scene.minimap.AddClass('bt-linger-off');
  scene.minimap.AddClass('bt-glow-off');
  advanceTo(pendingTick.dueMs);
  assert.equal(instance.getLoopTestState().running, false, 'settings processing must not start the inactive run');
  assert.equal(scene.minimap.BHasClass('bt-buff-timer'), true, 'inactive ticks must retain timer presence');
  assert.equal(hosts.glowClip.BHasClass('bt-glow-off'), true, 'hideout and invalid-clock ticks must mirror glow settings');
  assert.equal(label.IsValid(), false, 'hideout and invalid-clock ticks must clear existing lingers when disabled');
  assert.equal(marker.hittest, true, 'settings clearing must restore stock marker hit testing');
  assert.equal(marker.hittestchildren, true, 'settings clearing must restore descendant hit testing');
  assert.equal(marker.style.opacity, '0.9', 'settings clearing must restore stock marker opacity');
  assert.equal(marker.GetAttributeString('bt_linger_prev', 'missing'), '', 'settings clearing must remove saved linger state');
  instance.retire();
}

// retiring owner withdraws presence
{
  const { scene, instance } = bootGuardScenario();
  assert.equal(scene.minimap.BHasClass('bt-buff-timer'), true, 'live owner must publish presence before retiring');
  assert.equal(scene.root.GetAttributeInt('bt_timer_gen', 0), instance.getInstanceTestState().instanceGen, 'retiring fixture must still own the root generation');
  instance.retire();
  assert.equal(instance.getInstanceTestState().retired, true, 'owner retirement must complete');
  assert.equal(scene.minimap.BHasClass('bt-buff-timer'), false, 'retiring owner withdraws presence');
}

// superseded instance must not clear its successor presence
{
  const { scene, instance: first } = bootGuardScenario();
  assert.equal(scene.minimap.BHasClass('bt-buff-timer'), true, 'first instance must publish presence');
  const firstTick = liveScheduled().find((item) => item.delay < 1);
  const successorVm = {
    module: { exports: {} }, exports: {}, console, globalThis: {}, Date: { now: () => fakeNow },
    $: sandbox.$,
  };
  vm.createContext(successorVm);
  vm.runInContext(source, successorVm, { filename: scriptPath });
  const successor = successorVm.module.exports.__test;
  assert.equal(successor.getInstanceTestState().instanceGen, first.getInstanceTestState().instanceGen + 1, 'successor must claim a new root generation');
  assert.equal(scene.minimap.BHasClass('bt-buff-timer'), true, 'successor must publish presence before stale retirement');
  scheduled.splice(scheduled.indexOf(firstTick), 1);
  firstTick.callback();
  assert.equal(first.getInstanceTestState().retired, true, 'superseded loop must retire its instance');
  assert.equal(scene.minimap.BHasClass('bt-buff-timer'), true, 'superseded instance must not clear its successor presence');
  const successorTick = liveScheduled().find((item) => item.delay < 1);
  assert.ok(successorTick, 'successor must retain a scheduled loop');
  advanceTo(successorTick.dueMs);
  assert.equal(successor.getInstanceTestState().retired, false, 'successor must remain live on later ticks');
  assert.equal(scene.minimap.BHasClass('bt-buff-timer'), true, 'successor presence must survive its later ticks');
  successor.retire();
}

// friend/enemy perspective classes must win over absolute team1/team2
{
  const cases = [
    ['perspective_enemy', 'map_button player enemy team1 active', 2],
    ['perspective_friend', 'map_button player friend team2 active', 1],
    ['legacy_team1', 'map_button player team1 active', 1],
    ['legacy_ally', 'map_button player ally active', 1],
    ['legacy_team2', 'map_button player team2 active', 2],
  ];
  const markers = cases.map(([id, classes]) => {
    const marker = makePanel(null, id);
    for (const name of classes.split(' ')) marker.AddClass(name);
    marker.actualxoffset = 20;
    marker.actualyoffset = 30;
    return marker;
  });
  const minimap = makePanel();
  minimap.actuallayoutwidth = minimap.actuallayoutheight = 100;
  minimap.FindChildrenWithClassTraverse = (name) => name === 'map_button' ? markers : [];
  test.setMinimapTestUi(minimap);
  const snapshot = test.collectMinimapSnapshot(fakeNow, true);
  assert.deepEqual(
    Array.from(snapshot.players, (player) => [player.id, player.team]),
    cases.map(([id, , team]) => [id, team]),
    'friend/enemy perspective classes must win over absolute team1/team2',
  );
}
console.log('[RUNTIME ENGINE PASS] objective timing, minimap, and lifecycle contracts are valid.');
