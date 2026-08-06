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
    return lingerLabel;
  },
};
let lingerAcceptsInput = true;
let lingerAcceptsFocus = true;
const lingerButton = {
  actualxoffset: 300,
  actualyoffset: 200,
  actuallayoutwidth: 32,
  actuallayoutheight: 32,
  GetPositionWithinAncestor: () => [240, 160],
  hittest: true,
  hittestchildren: true,
  style: { opacity: '0.8' },
  IsValid: () => true,
  BAcceptsInput: () => lingerAcceptsInput,
  SetAcceptsInput: (enabled) => { lingerAcceptsInput = enabled; },
  BAcceptsFocus: () => lingerAcceptsFocus,
  SetAcceptsFocus: (enabled) => { lingerAcceptsFocus = enabled; },
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
test.setLingerTestUi(lingerContainer, lingerMinimap);
test.showLinger('enemy_test', lingerButton);
assert.equal(lingerLookupParent, 'container', 'linger label must use the stable HudMinimapContainer overlay');
assert.equal(
  lingerLabel.style.position,
  '75.25% 68.25% 0px',
  'linger question mark should overlay the enemy marker center',
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

lingerContainer.FindChildTraverse = () => null;
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
lingerContainer.FindChildTraverse = () => ({ IsValid: () => false });
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
  { x: 75.25, y: 67 },
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
  { x: 17.25, y: 23 },
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
  { x: 92.5, y: 92.5 },
  'percentage top-left placement should keep the whole label inside the minimap',
);
const capturedLingerButton = {
  actualxoffset: 262.3905334472656,
  actualyoffset: 274.3076477050781,
  actuallayoutwidth: 24.850862503051758,
  actuallayoutheight: 24.850862503051758,
};
const capturedLingerPosition = { x: 65.869, y: 68.855 };
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
console.log('[RUNTIME ENGINE PASS] objective timing and linger lifecycle contracts are valid.');
