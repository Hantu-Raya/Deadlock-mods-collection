#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.resolve(__dirname, '..', 'panorama', 'scripts', 'rejuvnbufftimer.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const layoutPath = path.resolve(__dirname, '..', 'panorama', 'layout', 'hud.xml');
const layoutSource = fs.readFileSync(layoutPath, 'utf8');
const scheduled = [];
const sandbox = {
  module: { exports: {} },
  exports: {},
  console,
  Date,
  globalThis: {},
  $: {
    Schedule: (delay, callback) => {
      scheduled.push({ delay, callback });
      return scheduled.length;
    },
    CancelScheduled: () => {},
    GetContextPanel: () => null,
    DispatchEvent: () => {},
    Msg: () => {},
  },
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: scriptPath });
const test = sandbox.module.exports.__test;
assert.ok(test, 'runtime engine test export missing');
scheduled.length = 0;
test.setLoopTestState({ generation: 4, playerSeenToken: 0, lowTimeCleared: false });
test.loop(3);
assert.equal(scheduled.length, 0, 'stale loop generations must not schedule a callback');

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

const riftCardLayout = layoutSource.match(/<Panel id="RiftTimerCard"[\s\S]*?<\/Panel>/);
assert.ok(riftCardLayout, 'Rift timer card layout missing');
assert.ok(
  riftCardLayout[0].indexOf('id="RiftTimerSub"') < riftCardLayout[0].indexOf('id="RiftTimerTime"'),
  'Rift label must render above its timer, matching the Urn card',
);
for (const panelId of [
  'Rejuv',
  'Buff',
  'RejuvMiniCard',
  'RiftTimerCard',
  'UrnTimerCard',
  'RejuvPingButton',
  'BuffPingButton',
]) {
  assert.match(layoutSource, new RegExp('id=\"' + panelId + '\"'), panelId + ' must remain in the minimal layout');
}

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

assert.doesNotMatch(layoutSource, /buff_claim\.vcss_c/, 'minimal layout must not load minimap visual styles');
assert.doesNotMatch(layoutSource, /MinimapGlow/, 'minimal layout must not declare custom minimap glow panels');
assert.doesNotMatch(layoutSource, /ClaimOverlayRoot|MinimapBuffClaim/, 'minimal layout must not declare claim overlays');
assert.equal(
  fs.existsSync(path.resolve(__dirname, '..', 'panorama', 'styles', 'buff_claim.css')),
  false,
  'minimal source must not ship the removed minimap visual stylesheet',
);

const loopBody = source.match(/function loop\(gen\) \{[\s\S]*?\n  \}/);
assert.ok(loopBody, 'main loop body missing');
assert.doesNotMatch(
  loopBody[0],
  /runMaintenanceLane/,
  'minimal loop must not run claim tracking or enemy linger maintenance',
);

const bridgeLane = source.match(/if \(isDue\("bridge"[\s\S]*?\n    \}/);
assert.ok(bridgeLane, 'Bridge Buff timer lane missing');
assert.doesNotMatch(
  bridgeLane[0],
  /pretrackActive|monitoringActive|buffResetTs/,
  'minimal Bridge Buff timer must not arm minimap claim classification',
);

console.log('[RUNTIME ENGINE PASS] timer, objective, and minimal minimap contracts are valid.');
