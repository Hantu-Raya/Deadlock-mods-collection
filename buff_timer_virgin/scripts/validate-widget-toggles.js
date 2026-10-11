#!/usr/bin/env node
'use strict';

// Failure modes: a switch changes only its appearance while the timer keeps polling; controls work before the
// store read settles; the mask is lost on save/restart or a legacy record is blocked; malformed/newer records are
// accepted; RESET leaves a widget off or erases layout; slots hide but their edit chromes remain draggable; claims
// and glows remain lit after disabling; disabled lanes still write labels, scan Rejuv charges or observe Rift warnings;
// a disabled Rejuv/Rift keeps the loop hot; the idle minimap snapshot still traverses map_button; re-enabling shows
// stale clock/phase text; an all-enabled mask changes the existing timer or persists a redundant x field.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, KEY, settingsLayout, read, createProfile, record, launch, makePanel } = require('./bt-test-harness.js');

const checks = [];
const check = (name, fn) => {
  try { fn(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: error.stack || String(error) }); process.exitCode = 1; }
};
const SWITCHES = [
  ['BTWidgetBuff', 'BTSlotBuff', 1], ['BTWidgetRejuv', 'BTSlotRejuv', 2],
  ['BTWidgetRift', 'BTSlotRift', 4], ['BTWidgetUrn', 'BTSlotUrn', 8],
  ['BTWidgetClaims', 'BTSlotClaimL', 16],
];
const slots = ['BTSlotBuff', 'BTSlotRejuv', 'BTSlotRift', 'BTSlotUrn', 'BTSlotClaimL', 'BTSlotClaimR'];
const saved = (profile) => JSON.parse(profile.disk.get(KEY).slice(14));
const time = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
function tick(game, seconds, count = 1) {
  for (let i = 0; i < count; i++) {
    game.clock.text = time(seconds + i);
    game.advance(1000);
  }
}
function ready(profile = createProfile(), options = {}) {
  const game = launch(profile, { withTimer: true, clock: '3:00', ...options });
  game.advance(2000);
  assert.equal(game.state().phase, 'ready');
  return game;
}
function expectMask(game, mask) {
  assert.equal(game.minimap.GetAttributeInt('bt_widgets_off', 0), mask, 'minimap publishes the disabled mask');
  const menuOpen = game.ids.BTSettingsPanel.BHasClass('open');
  for (const [id, slot, bit] of SWITCHES) {
    const off = !!(mask & bit);
    if (menuOpen) assert.equal(game.ids[id].BHasClass('on'), !off, `${id} renders its enabled state`);
    assert.equal(game.ids[slot].BHasClass('bt-widget-off'), off, `${slot} visibility`);
  }
  assert.equal(game.ids.BTSlotClaimR.BHasClass('bt-widget-off'), !!(mask & 16), 'right claim slot follows Claims');
  if (menuOpen) assert.equal(game.ids.BTSettingsPanel.BHasClass('bt-claims-off'), !!(mask & 16), 'dependent claim/glow colour rows dim');
}
function expectChromes(game, mask) {
  for (const [index, slot] of slots.entries()) {
    const bit = index === 5 ? 16 : 1 << index;
    assert.equal(game.ids[`${slot}Chrome`].BHasClass('bt-widget-off'), !!(mask & bit), `${slot} edit chrome visibility`);
  }
}
function meter(panel) {
  let text = panel.text;
  let writes = 0;
  Object.defineProperty(panel, 'text', { configurable: true, get: () => text, set: (value) => { writes++; text = value; } });
  return { get writes() { return writes; }, get text() { return text; } };
}
function countClassReads(panel, matcher) {
  let reads = 0;
  const original = panel.BHasClass;
  panel.BHasClass = (name) => { if (matcher(name)) reads++; return original(name); };
  return () => reads;
}
function countTimerSnapshots(game) {
  let calls = 0;
  const original = game.minimap.FindChildrenWithClassTraverse;
  game.minimap.FindChildrenWithClassTraverse = (name) => {
    if (name === 'map_button' && /rejuvnbufftimer\.js/.test(new Error().stack)) calls++;
    return original(name);
  };
  return () => calls;
}

check('real WIDGETS layout is timer-only and uses script-bound toggle chips', () => {
  assert.match(settingsLayout, /text="WIDGETS"/);
  assert.match(settingsLayout, /bt-widget-chips bt-timer-only/);
  for (const [id] of SWITCHES) assert.match(settingsLayout, new RegExp(`<Button id="${id}" class="[^"]*bt-widget-chip`));
  assert.doesNotMatch(settingsLayout, /onactivate\s*=/);
  const css = read('panorama', 'styles', 'hud_timer.css') + read('panorama', 'styles', 'buff_claim.css');
  assert.match(css, /bt-widget-off[^{]*\{[^}]*visibility:\s*collapse/);
});

check('loading locks switches; defaults publish mask zero without a save or redundant writes', () => {
  const game = launch(createProfile(), { withTimer: true, clock: '3:00' });
  const original = game.minimap.SetAttributeInt;
  let writes = 0;
  game.minimap.SetAttributeInt = (key, value) => { if (key === 'bt_widgets_off') writes++; original.call(game.minimap, key, value); };
  game.click('BTWidgetBuff');
  game.advance(2000);
  assert.equal(game.state().phase, 'ready');
  game.toggleMenu();
  expectMask(game, 0);
  expectChromes(game, 0);
  assert.equal(game.stats.writes, 0, 'unchanged defaults are not saved');
  assert.ok(writes <= 1, 'unchanged mask is not republished every tick');
  const before = writes;
  game.advance(3000);
  assert.equal(writes, before, 'zero mask writes stay cached');
});

check('all five real switches gate slots and chromes, and the disabled mask saves/restores', () => {
  const profile = createProfile();
  const game = ready(profile);
  let mask = 0;
  let maskWrites = 0;
  const setAttributeInt = game.minimap.SetAttributeInt;
  game.minimap.SetAttributeInt = (key, value) => {
    if (key === 'bt_widgets_off') maskWrites++;
    setAttributeInt.call(game.minimap, key, value);
  };
  game.toggleMenu();
  for (const [id, , bit] of SWITCHES) {
    const before = maskWrites;
    game.click(id);
    mask |= bit;
    game.advance(1000);
    expectMask(game, mask);
    assert.equal(maskWrites, before + 1, `${id} publishes one changed mask`);
  }
  expectMask(game, 31);
  game.click('BTLayoutButton');
  game.advance(300);
  expectChromes(game, 31);
  game.click('BTLayoutDone');
  game.advance(2200);
  assert.equal(saved(profile).s, 7);
  assert.equal(saved(profile).x, 31);
  const second = ready(profile);
  expectMask(second, 31);
  assert.equal(second.stats.writes, 0, 'restoring does not save again');
  second.click('BTWidgetBuff');
  second.advance(2000);
  assert.equal(saved(profile).x, 30);
});

check('disabled lanes stop writing labels, scanning charges and observing Rift warnings; idle snapshot stops', () => {
  const game = ready();
  const top = game.rootPanel.FindChildTraverse('TopBar');
  const charges = makePanel('RejuvenatorCharges', 'Panel', top);
  const friend = makePanel('RejuvenatorFriendly', 'Panel', charges);
  const enemy = makePanel('RejuvenatorEnemy', 'Panel', charges);
  const chargeReads = () => readsFriend() + readsEnemy();
  const readsFriend = countClassReads(friend, (name) => name.startsWith('RejuvCount_'));
  const readsEnemy = countClassReads(enemy, (name) => name.startsWith('RejuvCount_'));
  const rift = makePanel('rift_warning', 'Panel', game.minimap);
  rift.AddClass('capture_point');
  rift.AddClass('koth_warning');
  const warningReads = countClassReads(rift, (name) => name === 'koth_warning');
  game.mapMarkers.push(rift);
  const snapshots = countTimerSnapshots(game);
  const labels = ['BuffTime', 'BuffTimeClip', 'RejuvTime', 'RejuvTimeClip', 'RejuvMiniTime',
    'RiftTimerTime', 'UrnTimerTime'].map((id) => [id, meter(game.ids[id])]);
  tick(game, 181, 4);
  assert.ok(snapshots() > 0, 'enabled timer traverses markers');
  assert.ok(chargeReads() > 0, 'enabled Rejuv scans charges');
  assert.ok(warningReads() > 0, 'enabled Rift checks its warning');
  game.toggleMenu();
  game.toggleLinger();
  for (const [id] of SWITCHES) game.click(id);
  game.advance(1000);
  expectMask(game, 31);
  const before = Object.fromEntries(labels.map(([id, label]) => [id, label.writes]));
  const scanBefore = chargeReads(), warningBefore = warningReads(), snapshotBefore = snapshots();
  tick(game, 186, 5);
  for (const [id, label] of labels) assert.equal(label.writes, before[id], `${id} does not write while disabled`);
  assert.equal(chargeReads(), scanBefore, 'RejuvCount is never read while Rejuv is off');
  assert.equal(warningReads(), warningBefore, 'Rift warning is never observed while Rift is off');
  assert.equal(snapshots(), snapshotBefore, 'Rift+Claims+linger off avoids timer map_button traversal');
  assert.equal(game.minimap.BHasClass('bt-linger-off'), true);
  game.click('BTWidgetBuff');
  game.click('BTWidgetRejuv');
  tick(game, 191, 2);
  const actual = game.ids.BuffTime.text.split(':').map(Number);
  const current = game.clock.text.split(':').map(Number);
  assert.ok(Math.abs((actual[0] * 60 + actual[1]) - (300 - current[0] * 60 - current[1])) <= 1,
    'Bridge catches up to the current game clock within one second');
  assert.equal(game.ids.RejuvTime.text, 'Spawn', 'Rejuv resumes its previous Spawn phase');
  assert.ok(chargeReads() > scanBefore, 'Rejuv scanning resumes');
});

check('disabling Claims clears active boxes and both side glows immediately', () => {
  const game = ready();
  game.timer.setClaimSide(0, true, false, 'powerup_gun', 1000);
  game.timer.setClaimSide(1, true, true, 'powerup_gun', 1000);
  game.timer.writeSideGlow(0, 'powerup_gun', false);
  game.timer.writeSideGlow(1, 'powerup_gun', true);
  game.advance(100);
  assert.ok(game.ids.MinimapBuffClaimLeft.BHasClass('active'));
  assert.ok(game.ids.MinimapBuffClaimRight.BHasClass('active'));
  assert.ok(game.ids.MinimapGlowLeft.BHasClass('glow-gun'));
  assert.ok(game.ids.MinimapGlowRight.BHasClass('glow-gun'));
  game.click('BTWidgetClaims');
  game.advance(500);
  for (const side of ['Left', 'Right']) {
    assert.equal(game.ids[`MinimapBuffClaim${side}`].BHasClass('active'), false, `${side} claim cleared`);
    assert.equal(game.ids[`MinimapGlow${side}`].BHasClass('glow-gun'), false, `${side} glow cleared`);
  }
});

check('disabled Rejuv and Rift leave the hot 100/250 ms loop; retained Rejuv phase resumes', () => {
  const game = ready(createProfile(), { clock: '10:00' });
  const fast = game.scheduledDelays.filter((item) => item.owner === 1 && item.delaySec === 0.1).length;
  assert.ok(fast > 0, 'spawn-wait Rejuv starts the 100 ms loop');
  game.click('BTWidgetRejuv');
  game.click('BTWidgetRift');
  game.advance(1000);
  const index = game.scheduledDelays.length;
  game.advance(2000);
  const loopDelays = game.scheduledDelays.slice(index).filter((item) => item.owner === 1 && item.delaySec <= 0.25);
  assert.deepEqual(loopDelays, [], 'disabled Rejuv/Rift cannot keep the loop hot');
  const charges = makePanel('RejuvenatorCharges', 'Panel', game.rootPanel.FindChildTraverse('TopBar'));
  const friendly = makePanel('RejuvenatorFriendly', 'Panel', charges);
  makePanel('RejuvenatorEnemy', 'Panel', charges);
  game.click('BTWidgetRejuv');
  game.advance(5100); // Lazy charge rebinding may wait up to five seconds.
  friendly.AddClass('RejuvCount_1');
  game.advance(1000);
  assert.notEqual(game.ids.RejuvTime.text, 'Spawn', 'claim enters a countdown phase');
  const prior = game.ids.RejuvTime.text;
  game.click('BTWidgetRejuv');
  tick(game, 610, 4);
  assert.equal(game.ids.RejuvTime.text, prior, 'disabled Rejuv keeps its visible text untouched');
  game.click('BTWidgetRejuv');
  game.clock.text = '10:15';
  game.advance(1000);
  assert.notEqual(game.ids.RejuvTime.text, prior, 'countdown catches up on re-enable');
  assert.notEqual(game.ids.RejuvTime.text, 'Spawn', 'phase state survives the disabled interval');
});

check('Rift alone causes a hot 250 ms loop and stopping Rift restores idle cadence', () => {
  const game = ready(createProfile(), { clock: '12:00' });
  game.click('BTWidgetRejuv');
  const baseline = game.scheduledDelays.length;
  game.advance(1600);
  assert.ok(game.scheduledDelays.slice(baseline).some((item) => item.owner === 1 && item.delaySec === 0.25),
    'the enabled Rift window uses the hot tick');
  game.click('BTWidgetRift');
  game.advance(1000);
  const after = game.scheduledDelays.length;
  game.advance(2000);
  assert.ok(game.scheduledDelays.slice(after).every((item) => item.owner !== 1 || item.delaySec > 0.25),
    'disabled Rift cannot retain the hot tick');
});

check('mask is read during invalid-clock and hideout ticks', () => {
  for (const options of [{ clock: '' }, { clock: '3:00', hideout: true }]) {
    const game = ready(createProfile(), options);
    let reads = 0;
    const original = game.minimap.GetAttributeInt;
    game.minimap.GetAttributeInt = (name, fallback) => {
      if (name === 'bt_widgets_off') reads++;
      return original.call(game.minimap, name, fallback);
    };
    game.click('BTWidgetBuff');
    game.advance(options.hideout ? 31000 : 2200);
    assert.ok(reads >= (options.hideout ? 1 : 2), 'timer polls mask on each due tick despite inactive game clock/hideout');
    assert.equal(game.ids.BTSlotBuff.BHasClass('bt-widget-off'), true);
  }
});

check('schema 6 loads enabled, malformed x blocks, newer schema blocks, RESET keeps layout and re-enables', () => {
  const base = { u: '#FFE14D', d: '#4DD2FF', l: 1, g: 1, t: { b: [0.2, 0.3, 1, 'r'] } };
  const first = ready(createProfile({ [KEY]: record('{"s":1,"u":3,"d":8,"l":0}') }));
  expectMask(first, 0);
  for (const schema of [2, 3, 4, 5]) {
    const older = ready(createProfile({ [KEY]: record(JSON.stringify({ s: schema, ...base })) }));
    expectMask(older, 0);
    assert.equal(older.stats.writes, 0, `schema ${schema} migrates only after an edit`);
  }
  const explicitZero = ready(createProfile({ [KEY]: record(JSON.stringify({ s: 7, ...base, x: 0 })) }));
  expectMask(explicitZero, 0);
  const old = createProfile({ [KEY]: record(JSON.stringify({ s: 6, ...base })) });
  const legacy = ready(old);
  expectMask(legacy, 0);
  assert.equal(legacy.stats.writes, 0);
  legacy.click('BTWidgetUrn');
  legacy.advance(2000);
  assert.equal(saved(old).s, 7);
  assert.equal(saved(old).x, 8);
  for (const x of [-1, 32, 1.5, '2', null, {}, true]) {
    const profile = createProfile({ [KEY]: record(JSON.stringify({ s: 7, ...base, x })) });
    const game = launch(profile, { withTimer: true, clock: '3:00' });
    game.advance(2000);
    assert.equal(game.state().phase, 'blocked', `x=${JSON.stringify(x)} is corrupt`);
    expectMask(game, 0);
    game.click('BTWidgetClaims');
    game.advance(1800);
    assert.equal(game.stats.writes, 0, 'blocked edits are session-only');
  }
  const newer = launch(createProfile({ [KEY]: record(JSON.stringify({ s: 8, ...base, x: 31 })) }), { withTimer: true, clock: '3:00' });
  newer.advance(2000);
  assert.equal(newer.state().phase, 'blocked');
  assert.match(newer.state().status, /NEWER SAVE/);
  const blockedProfile = createProfile({ [KEY]: record(JSON.stringify({ s: 7, ...base, x: -1 })) });
  const blocked = launch(blockedProfile, { withTimer: true, clock: '3:00' });
  blocked.advance(2000);
  blocked.reset();
  blocked.advance(3100);
  assert.equal(blocked.state().phase, 'blocked', 'unconfirmed blocked-save RESET expires');
  assert.equal(blocked.stats.writes, 0);
  blocked.reset();
  blocked.reset();
  blocked.advance(2100);
  assert.equal(blocked.state().phase, 'ready', 'double RESET repairs a damaged save');
  assert.equal(saved(blockedProfile).x, undefined);
  const profile = createProfile({ [KEY]: record(JSON.stringify({ s: 7, ...base, x: 31 })) });
  const game = ready(profile);
  game.reset(); // Valid saves use the existing single-click RESET convention.
  game.advance(2100);
  expectMask(game, 0);
  assert.equal(saved(profile).x, undefined, 'all-enabled does not store x');
  assert.deepEqual(saved(profile).t, base.t, 'RESET preserves saved layout');
  const restored = ready(profile);
  expectMask(restored, 0);
});

check('saved Rejuv-off survives timer reboot and hideout match start without a hidden fast loop', () => {
  const profile = createProfile({ [KEY]: record('{"s":7,"u":"#FFE14D","d":"#4DD2FF","l":0,"g":1,"x":31}') });
  const game = ready(profile, { clock: '10:00' });
  game.bootTimerAgain();
  game.advance(1000);
  const owner = game.instances();
  const afterBoot = game.scheduledDelays.length;
  game.advance(1600);
  assert.ok(game.scheduledDelays.slice(afterBoot).some((item) => item.owner === owner && item.delaySec === 0.5),
    'rebooted hidden Rejuv leaves a live 500 ms loop');
  assert.ok(game.scheduledDelays.slice(afterBoot).every((item) => item.owner !== owner || item.delaySec > 0.1),
    'reboot cannot leave hidden Rejuv at 100 ms');
  game.click('BTWidgetRejuv');
  const enabled = game.scheduledDelays.length;
  game.advance(1500);
  assert.ok(game.scheduledDelays.slice(enabled).some((item) => item.owner === owner && item.delaySec === 0.1),
    'near a spawn, re-enabled Rejuv resumes 100 ms ticks');

  const hideoutProfile = createProfile({ [KEY]: record('{"s":7,"u":"#FFE14D","d":"#4DD2FF","l":0,"g":1,"x":31}') });
  const hideout = ready(hideoutProfile, { clock: '10:00', hideout: true });
  hideout.rootPanel.RemoveClass('connectedToHideout');
  hideout.advance(31000);
  const matchStart = hideout.scheduledDelays.length;
  hideout.advance(1500);
  assert.ok(hideout.scheduledDelays.slice(matchStart).some((item) => item.owner === 1 && item.delaySec === 0.5),
    'starting a match with Rejuv hidden stays on the idle loop');
  assert.ok(hideout.scheduledDelays.slice(matchStart).every((item) => item.owner !== 1 || item.delaySec > 0.1));
});

check('Rift warning seen before off does not suppress a later warning after re-enable', () => {
  const game = ready(createProfile(), { clock: '11:00' });
  const marker = makePanel('rift_warning', 'Panel', game.minimap);
  marker.AddClass('map_button');
  marker.AddClass('capture_point');
  marker.AddClass('koth_warning');
  game.mapMarkers.push(marker);
  game.advance(1500);
  assert.match(game.ids.RiftTimerTime.text, /^0:(1[89]|20)$/, 'first warning counted down');
  game.click('BTWidgetRift');
  marker.RemoveClass('koth_warning');
  game.clock.text = '17:40';
  game.advance(2000);
  marker.AddClass('koth_warning');
  game.click('BTWidgetRift');
  game.advance(1200);
  assert.match(game.ids.RiftTimerTime.text, /^0:(1[89]|20)$/, 'later warning gets a fresh 20 s countdown, not NOW');
  assert.equal(game.ids.RiftTimerCard.BHasClass('rift-confirmed'), true);
});

check('Claims re-enabled after a missed Bridge respawn scan a live spawn and claim its pickup', () => {
  const profile = createProfile({ [KEY]: record('{"s":7,"u":"#FFE14D","d":"#4DD2FF","l":1,"g":1,"x":16}') });
  const game = ready(profile, { clock: '9:59' });
  game.minimap.actuallayoutwidth = game.minimap.actuallayoutheight = 360;
  const spawn = makePanel('powerup_left', 'Panel', game.minimap);
  for (const cls of ['map_button', 'powerup_spawn', 'powerup_gun', 'active']) spawn.AddClass(cls);
  spawn.actualxoffset = 90;
  spawn.actualyoffset = 144;
  game.mapMarkers.push(spawn);
  game.clock.text = '10:00';
  game.advance(1000); // Claims is off when the Bridge resets.
  game.clock.text = '10:05';
  game.advance(1000);
  assert.equal(game.ids.MinimapGlowLeft.BHasClass('glow-gun'), false, 'disabled Claims had no glow');
  game.click('BTWidgetClaims');
  game.advance(1500);
  assert.equal(game.ids.MinimapGlowLeft.BHasClass('glow-gun'), true, 'rescan finds a spawn already up');
  spawn.RemoveClass('active');
  game.advance(1200);
  assert.equal(game.ids.MinimapBuffClaimLeft.BHasClass('active'), true, 'pickup becomes a live claim box');
});

check('lingers do not replay an unseen disappearance while Claims and question marks were off', () => {
  const profile = createProfile({ [KEY]: record('{"s":7,"u":"#FFE14D","d":"#4DD2FF","l":0,"g":1,"x":16}') });
  const game = ready(profile, { clock: '3:00' });
  game.overlay.actuallayoutwidth = game.overlay.actuallayoutheight = 420;
  game.minimap.actualxoffset = game.minimap.actualyoffset = 30;
  game.minimap.actuallayoutwidth = game.minimap.actuallayoutheight = 360;
  const enemy = game.markers.up;
  // Stock markers are children of hud_minimap; makeMarker's default standalone test panel is not.
  enemy.parent = game.minimap;
  game.minimap.children.push(enemy);
  enemy.actuallayoutwidth = enemy.actuallayoutheight = 32;
  enemy.style.opacity = '1';
  enemy.hittest = enemy.hittestchildren = true;
  const freshEnemy = game.markers.down;
  freshEnemy.parent = game.minimap;
  game.minimap.children.push(freshEnemy);
  freshEnemy.actuallayoutwidth = freshEnemy.actuallayoutheight = 32;
  freshEnemy.style.opacity = '1';
  freshEnemy.hittest = freshEnemy.hittestchildren = true;
  const layer = game.timer.getInstanceTestState().hosts.lingerLayer;
  const active = () => layer.Children().filter((panel) => panel.id.startsWith('LingerQ_') && panel.BHasClass('active'));
  enemy.RemoveClass('active');
  game.advance(1500);
  assert.equal(active().length, 0);
  game.toggleLinger();
  game.advance(1500);
  assert.equal(active().length, 0, 'first activity pass rebases the old disappearance');
  freshEnemy.RemoveClass('active');
  game.advance(1500);
  assert.equal(active().length, 1, 'a fresh disappearance after re-enable gets one question mark');
  assert.equal(active()[0].id, `LingerQ_${freshEnemy.id}`, 'the old disappearance was not replayed');
});

const output = path.join(root, '.tmp', 'bt-widget-toggles-e2e.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ checks }, null, 2));
console.log(`[BT WIDGETS] ${checks.filter((entry) => entry.passed).length}/${checks.length} checks; artifact .tmp/bt-widget-toggles-e2e.json`);
