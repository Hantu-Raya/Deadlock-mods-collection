#!/usr/bin/env node
'use strict';

// End-to-end check of movable timer widgets: both real scripts run like hud_minimap.xml loads them (timer first,
// sharing $), against the real /bt/ store page. Writes .tmp/bt-layout-e2e.json.
// Failure modes covered: slots shown at 0,0 before the dock has a layout; defaults drifting from the old spots;
// drag deltas ignoring UI scale; snapping/clamping; corner resize moving the anchored corner; side choice not
// switching sizes; CANCEL/Esc leaving edits; DONE not persisting or writing repeatedly; a timer reboot dropping the
// saved layout; no placement without the settings script; pings firing while editing; stale handlers acting; the
// minimap border not moving or scaling the minimap or not following it, defaults not following it, CANCEL or
// RESET leaving it moved or scaled, a retiring timer undoing its successor's size, malformed sizes being applied.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, read, KEY, SCALE, FLT_MAX, createProfile, record, launch } = require('./bt-test-harness.js');

const transcript = [];
const step = (name, fn) => { fn(); transcript.push(name); };
const near = (actual, expected, message, tolerance = 0.06) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

// Layer = .clamp_width, 1600x900 screen px at HUD scale 0.8333 -> 1920x1080 layout px.
const W = 1600 / SCALE;
const H = 900 / SCALE;
// Dock = the old 440x440 box at the bottom of #minimap_persp, at window (1233.33, 520.83).
const DOCK = { x: 1233.33 / SCALE, y: 520.83 / SCALE };
const BASE = { pillH: [141, 44], pillV: [76, 84], cardV: [44, 26], cardH: [82, 22] };
const DEFAULTS = {
  b: { slot: 'BTSlotBuff', x: DOCK.x + 268.4, y: DOCK.y + 44, side: 'r', kind: 'pill' },
  r: { slot: 'BTSlotRejuv', x: DOCK.x + 30.8, y: DOCK.y + 44, side: 'l', kind: 'pill' },
  f: { slot: 'BTSlotRift', x: DOCK.x + 173.8, y: DOCK.y + 31.2, side: 't', kind: 'card' },
  u: { slot: 'BTSlotUrn', x: DOCK.x + 222.2, y: DOCK.y + 31.2, side: 't', kind: 'card' },
  // Claim boxes: the old buff_claim.css spots in the 440 box (margin 30% from its side, 8% from its bottom, 48px).
  cl: { slot: 'BTSlotClaimL', x: DOCK.x + 132, y: DOCK.y + 356.8, side: 't', kind: 'claim' },
  cr: { slot: 'BTSlotClaimR', x: DOCK.x + 260, y: DOCK.y + 356.8, side: 't', kind: 'claim' },
};

// Observable slot state: inline position (layer layout px), ui scale, side class, placement.
function slotState(game, key) {
  const panel = game.ids[DEFAULTS[key].slot];
  assert.ok(panel, `#${DEFAULTS[key].slot} exists`);
  const match = /^(-?[\d.]+)px (-?[\d.]+)px/.exec(String(panel.style.position || ''));
  const sides = ['l', 'r', 't', 'b', 'n'].filter((side) => panel.classes.has(`bt-side-${side}`));
  const scale = panel.style.uiScale === undefined ? 1 : parseFloat(panel.style.uiScale) / 100;
  return { panel, x: match ? Number(match[1]) : NaN, y: match ? Number(match[2]) : NaN, sides, scale, placed: panel.classes.has('bt-placed') };
}
function expectDefaults(game, message) {
  for (const key of Object.keys(DEFAULTS)) {
    const state = slotState(game, key);
    assert.equal(state.placed, true, `${message}: ${key} placed`);
    near(state.x, DEFAULTS[key].x, `${message}: ${key} x`);
    near(state.y, DEFAULTS[key].y, `${message}: ${key} y`);
    assert.deepEqual(state.sides, [DEFAULTS[key].side], `${message}: ${key} side`);
    near(state.scale, 1, `${message}: ${key} scale`);
  }
}
// One drag through the engine path: DragStart hands us the callbacks, the proxy follows the cursor.
function drag(game, panel, fromWin, toWin, { end = true } = {}) {
  assert.equal(panel.draggable, true, `#${panel.id} is draggable`);
  assert.equal(typeof panel.events.DragStart, 'function', `#${panel.id} DragStart bound`);
  const callbacks = { displayPanel: null, offsetX: 0, offsetY: 0, removePositionBeforeDrop: true };
  panel.events.DragStart(panel, callbacks);
  const proxy = callbacks.displayPanel;
  assert.ok(proxy && proxy.IsValid(), 'DragStart supplies a proxy display panel');
  proxy.win = { x: fromWin.x, y: fromWin.y };
  game.advance(40);
  proxy.win = { x: toWin.x, y: toWin.y };
  game.advance(40);
  if (end) release(game, panel, proxy);
  return proxy;
}
// Mouse up: with removePositionBeforeDrop the engine drops the proxy's position first, so it reports its parent's
// origin (the settings host at 0,0). In game this snapped every dropped widget to the top-left. A drag tick may
// still run before DragEnd arrives.
function release(game, panel, proxy) {
  delete proxy.win;
  game.advance(20);
  panel.events.DragEnd?.(panel, proxy);
  game.advance(40);
}
function enterEdit(game) {
  game.click('BTLayoutButton');
  assert.equal(game.layer().classes.has('bt-layout-edit'), true, 'edit mode marks the timer layer');
}
const winOf = (key, game, dx = 0, dy = 0) => {
  const state = slotState(game, key);
  return { x: state.x * SCALE + dx, y: state.y * SCALE + dy };
};
function ready(options = {}) {
  const profile = options.profile || createProfile();
  const game = launch(profile, Object.assign({ withTimer: true }, options));
  game.layer = () => game.ids.TimerOverlayFrame;
  game.advance(2500);
  return { game, profile };
}
const savedLayout = (profile) => {
  const raw = profile.disk.get(KEY);
  return raw ? JSON.parse(raw.slice(14)).t : undefined;
};

step('the timer alone waits for the dock layout, then places every widget at its old spot', () => {
  const game = launch(createProfile(), { withTimer: true, settings: false, dockWin: { x: FLT_MAX, y: FLT_MAX } });
  game.layer = () => game.ids.TimerOverlayFrame;
  assert.equal(game.layer().GetParent(), game.clamp, 'widgets live in the HUD layer, not inside #minimap_persp');
  assert.equal(game.ids.BTTimerDock.GetParent(), game.persp, 'the dock anchor stays inside #minimap_persp');
  game.advance(600);
  for (const key of Object.keys(DEFAULTS)) assert.equal(slotState(game, key).placed, false, `${key} stays hidden until the dock is laid out`);
  game.ids.BTTimerDock.win = { x: 1233.33, y: 520.83 };
  game.advance(1200);
  expectDefaults(game, 'timer-only defaults');
  for (const key of Object.keys(DEFAULTS)) {
    const state = slotState(game, key);
    assert.equal(state.panel.hittest, false, `${key} slot passes clicks through outside edit mode`);
    assert.equal(state.panel.draggable, false, `${key} slot is not draggable outside edit mode`);
  }
  assert.equal(game.ids.BuffPingButton.GetParent(), game.ids.BTSlotBuff, 'Bridge ping hit area moves with its pill');
  assert.equal(game.ids.RejuvPingButton.GetParent(), game.ids.BTSlotRejuv, 'Rejuv ping hit area moves with its pill');
  assert.equal(game.ids.RejuvMiniCard.GetParent(), game.ids.BTSlotRejuv, 'the mini card moves with Rejuv');
});

step('with settings: defaults, Customize enters edit mode with samples; pings are inert while editing', () => {
  const { game } = ready({ hideout: true });
  expectDefaults(game, 'fresh profile');
  game.toggleMenu();
  enterEdit(game);
  assert.equal(game.ids.BTSettingsPanel.classes.has('open'), false, 'the menu panel closes');
  assert.equal(game.ids.BTLayoutBar.classes.has('open'), true, 'the DONE/CANCEL/RESET bar opens');
  // In game the bar above the gear covered the right claim box and anything else dragged into that corner: the bar
  // lives outside the bottom-right menu column, and the gear column hides while editing.
  assert.notEqual(game.ids.BTLayoutBar.GetParent(), game.ids.BTSettingsRoot, 'the bar is not in the gear/menu column');
  assert.equal(game.ids.BTSettingsRoot.classes.has('bt-editing'), true, 'the gear/menu column hides while editing');
  for (const key of Object.keys(DEFAULTS)) {
    const state = slotState(game, key);
    assert.equal(state.panel.hittest, true, `${key} slot takes the mouse while editing`);
    assert.equal(state.panel.draggable, true, `${key} slot is draggable while editing`);
  }
  assert.equal(game.ids.RiftTimerTime.text, '7:00', 'Rift shows a sample time in the hideout');
  assert.equal(game.ids.UrnTimerTime.text, '10:00', 'Urn shows a sample time in the hideout');
  const events = game.stats.events.length;
  game.click('RejuvPingButton');
  game.click('BuffPingButton');
  game.advance(500);
  assert.equal(game.timer.isChatIntentInFlight(), false, 'a ping click in edit mode does not start a chat message');
  assert.equal(game.stats.events.slice(events).filter((name) => /Chat/i.test(name)).length, 0, 'no chat events while editing');
  game.click('BTLayoutDone');
  assert.equal(game.ids.BTSettingsRoot.classes.has('bt-editing'), false, 'the gear comes back after DONE');
});

step('the edit bar opens just above the minimap, clear of every widget, and its grip drags it anywhere', () => {
  const { game } = ready();
  game.toggleMenu();
  enterEdit(game);
  game.advance(300);
  const bar = game.ids.BTLayoutBar;
  const barPos = () => {
    const match = /^(-?[\d.]+)px (-?[\d.]+)px/.exec(String(bar.style.position || ''));
    assert.ok(match, 'the bar has an inline position');
    return { x: Number(match[1]), y: Number(match[2]) };
  };
  const BAR_W = 330;
  const start = barPos();
  // Dock (old 440 minimap box) at layout (1480, 625), 440 wide: centred over it, bottom above its top edge.
  near(start.x + BAR_W / 2, DOCK.x + 220, 'bar centred over the minimap', 0.5);
  assert.ok(start.y >= 0 && start.y + 120 <= DOCK.y, `bar sits above the minimap box (y ${start.y})`);
  for (const key of Object.keys(DEFAULTS)) {
    assert.ok(slotState(game, key).y >= start.y + 120, `${key} default spot is below the bar`);
  }
  const grip = game.ids.BTLayoutBarGrip;
  assert.ok(grip, 'the bar has a grip');
  drag(game, grip, { x: 900, y: 400 }, { x: 900 - 500 * SCALE, y: 400 - 100 * SCALE });
  near(barPos().x, start.x - 500, 'grip drag moves the bar x', 0.5);
  near(barPos().y, start.y - 100, 'grip drag moves the bar y', 0.5);
  drag(game, grip, { x: 900, y: 400 }, { x: 900 - 5000, y: 400 - 5000 });
  near(barPos().x, 0, 'the bar stays on screen (x)', 0.5);
  near(barPos().y, 0, 'the bar stays on screen (y)', 0.5);
  const moved = barPos();
  game.click('BTLayoutDone');
  enterEdit(game);
  game.advance(300);
  near(barPos().x, moved.x, 'the bar keeps its dragged spot for the session', 0.5);
  game.click('BTLayoutCancel');
  assert.equal(grip.draggable, false, 'the grip is not draggable outside edit mode');
});

step('dragging moves live with UI scale, snaps to centre lines, clamps on screen; DONE saves once and restores', () => {
  const { game, profile } = ready();
  game.toggleMenu();
  enterEdit(game);
  const start = slotState(game, 'b');
  // Window delta (-500, -300) at scale 0.8333 = layout delta (-600, -360).
  const proxy = drag(game, start.panel, winOf('b', game, 20, 10), winOf('b', game, -480, -290), { end: false });
  near(slotState(game, 'b').x, start.x - 600, 'live x during the drag', 0.2);
  near(slotState(game, 'b').y, start.y - 360, 'live y during the drag', 0.2);
  release(game, start.panel, proxy);
  assert.equal(proxy.deleted, true, 'the proxy is removed after the drag');
  near(slotState(game, 'b').x, start.x - 600, 'the drop keeps the last dragged x', 0.2);
  near(slotState(game, 'b').y, start.y - 360, 'the drop keeps the last dragged y', 0.2);
  // Centre snap: the pill centre lands 5 layout px right of the screen centre line -> snaps onto it.
  const before = slotState(game, 'b');
  const targetX = W / 2 - 141 / 2 + 5;
  drag(game, before.panel, winOf('b', game), { x: (targetX) * SCALE, y: before.y * SCALE });
  near(slotState(game, 'b').x, W / 2 - 141 / 2, 'snapped to the vertical centre line', 0.2);
  // Clamp: far past the right/bottom edges stays fully on screen.
  drag(game, before.panel, winOf('b', game), { x: 5000, y: 5000 });
  near(slotState(game, 'b').x, W - 141, 'clamped to the right edge', 0.2);
  near(slotState(game, 'b').y, H - 44, 'clamped to the bottom edge', 0.2);
  drag(game, before.panel, winOf('b', game), { x: (W * 0.25) * SCALE, y: (H * 0.3) * SCALE });
  const placed = slotState(game, 'b');
  assert.equal(game.stats.writes, 0, 'nothing is saved while editing');
  game.click('BTLayoutDone');
  assert.equal(game.layer().classes.has('bt-layout-edit'), false, 'DONE leaves edit mode');
  assert.equal(placed.panel.draggable, false, 'slots stop being draggable');
  game.advance(2000);
  assert.equal(game.stats.writes, 1, 'DONE writes the layout once');
  const t = savedLayout(profile);
  assert.ok(Array.isArray(t.b), 'the Bridge entry is saved');
  near(t.b[0] * W, placed.x, 'saved x fraction', 0.2);
  near(t.b[1] * H, placed.y, 'saved y fraction', 0.2);
  assert.deepEqual([t.b[2], t.b[3]], [1, 'r']);
  assert.equal(t.r, undefined, 'untouched widgets keep their default (no entry)');
  const again = ready({ profile }).game;
  near(slotState(again, 'b').x, placed.x, 'restart restores x', 0.2);
  near(slotState(again, 'b').y, placed.y, 'restart restores y', 0.2);
  near(slotState(again, 'r').x, DEFAULTS.r.x, 'Rejuv stays at its default');
  assert.equal(again.stats.writes, 0, 'restoring does not write');
});

step('corner handles scale uniformly around the opposite corner, clamped to 50-200%', () => {
  const { game } = ready();
  game.toggleMenu();
  enterEdit(game);
  const s0 = slotState(game, 'r');
  // Bottom-right handle: +70.5 layout px in x = 1.5x; the top-left corner stays put.
  const br = game.ids.BTSlotRejuvHandleBR;
  const brWin = { x: (s0.x + 141) * SCALE, y: (s0.y + 44) * SCALE };
  drag(game, br, brWin, { x: brWin.x + 70.5 * SCALE, y: brWin.y });
  let s = slotState(game, 'r');
  near(s.scale, 1.5, 'BR drag scales to 150%', 0.01);
  near(s.x, s0.x, 'top-left x fixed');
  near(s.y, s0.y, 'top-left y fixed');
  // Starts away from window (0,0): that is the proxy host's origin, which the runtime treats as "no cursor".
  const o = { x: 10, y: 10 };
  drag(game, br, o, { x: o.x + 3000 * SCALE, y: o.y });
  near(slotState(game, 'r').scale, 2, 'scale clamps at 200%', 0.01);
  drag(game, br, o, { x: o.x - 3000 * SCALE, y: o.y });
  near(slotState(game, 'r').scale, 0.5, 'scale clamps at 50%', 0.01);
  drag(game, br, o, { x: o.x + (141 * 0.5) * SCALE, y: o.y });
  s = slotState(game, 'r');
  near(s.scale, 1, 'back to 100%', 0.01);
  const brX = s.x + 141;
  const brY = s.y + 44;
  const tl = game.ids.BTSlotRejuvHandleTL;
  drag(game, tl, { x: s.x * SCALE, y: s.y * SCALE }, { x: (s.x + 35.25) * SCALE, y: s.y * SCALE });
  s = slotState(game, 'r');
  near(s.scale, 0.75, 'TL drag inward shrinks to 75%', 0.01);
  near(s.x + 141 * 0.75, brX, 'bottom-right x fixed', 0.2);
  near(s.y + 44 * 0.75, brY, 'bottom-right y fixed', 0.2);
});

step('claim boxes move and scale like the other widgets and show a sample claim while editing', () => {
  const { game, profile } = ready({ clock: '10:00' });
  const boxL = game.ids.MinimapBuffClaimLeft;
  const boxR = game.ids.MinimapBuffClaimRight;
  assert.equal(boxL.GetParent(), game.ids.BTSlotClaimL, 'left claim box sits in its slot');
  assert.equal(boxL.classes.has('bt-claim-sample'), false, 'no sample outside edit mode');
  // The right side has a live (enemy) claim when editing starts; the left side is idle.
  game.timer.setClaimSide(1, true, true, 'powerup_gun', 100000);
  game.advance(40);
  game.toggleMenu();
  enterEdit(game);
  assert.equal(boxL.classes.has('bt-claim-sample'), true, 'an idle claim box shows the sample while editing');
  assert.equal(game.ids.ClaimTimerLeft.text, '2:40', 'the sample shows a fresh claim timer');
  assert.equal(game.ids.ClaimRingLeft.style.opacity, '1', 'the sample ring is fully visible');
  assert.equal(boxR.classes.has('bt-claim-sample'), false, 'a live claim keeps its real look');
  assert.equal(boxR.classes.has('enemy-claim'), true);
  for (const side of ['L', 'R', 'T', 'B']) assert.equal(game.ids[`BTSlotClaimLSide${side}`], undefined, 'claim boxes have no side arrows');
  const s0 = slotState(game, 'cl');
  assert.equal(s0.panel.draggable, true, 'claim slot is draggable while editing');
  drag(game, s0.panel, winOf('cl', game, 10, 10), winOf('cl', game, -290, -190));
  near(slotState(game, 'cl').x, s0.x - 360, 'claim box moved x', 0.2);
  near(slotState(game, 'cl').y, s0.y - 240, 'claim box moved y', 0.2);
  const moved = slotState(game, 'cl');
  const br = game.ids.BTSlotClaimLHandleBR;
  drag(game, br, { x: 10, y: 10 }, { x: 10 + 24 * SCALE, y: 10 });
  near(slotState(game, 'cl').scale, 1.5, 'claim box corner scales to 150%', 0.01);
  near(slotState(game, 'cl').x, moved.x, 'claim box top-left kept');
  game.click('BTLayoutDone');
  assert.equal(boxL.classes.has('bt-claim-sample'), false, 'DONE removes the sample');
  game.advance(2000);
  const t = savedLayout(profile);
  assert.deepEqual([t.cl[2], t.cl[3]], [1.5, 't'], 'claim box scale saved');
  assert.equal(t.cr, undefined, 'untouched right box keeps its default');
  const again = ready({ profile }).game;
  near(slotState(again, 'cl').x, moved.x, 'claim box restored after restart', 0.2);
  near(slotState(again, 'cl').scale, 1.5, 'claim box scale restored', 0.01);
});

step('the Bridge pill resizes from its corners, and a hovered widget\'s chrome comes to the front', () => {
  const { game } = ready();
  game.toggleMenu();
  enterEdit(game);
  const editLayer = game.ids.BTEditLayer;
  const front = () => editLayer.Children().slice(-1)[0].id;
  // Default spots: Urn's right-side arrow covers the Bridge pill's top-left handle; Urn's chrome draws after it.
  const order = () => editLayer.Children().map((child) => child.id);
  assert.ok(order().indexOf('BTSlotUrnChrome') > order().indexOf('BTSlotBuffChrome'), 'XML order draws Urn chrome over Bridge');
  game.click('BTSlotBuff', 'onmouseover');
  assert.equal(front(), 'BTSlotBuffChrome', 'hovering the Bridge pill raises its chrome above Urn\'s');
  const s0 = slotState(game, 'b');
  const tl = game.ids.BTSlotBuffHandleTL;
  drag(game, tl, { x: s0.x * SCALE, y: s0.y * SCALE }, { x: (s0.x - 70.5) * SCALE, y: s0.y * SCALE });
  let s = slotState(game, 'b');
  near(s.scale, 1.5, 'Bridge TL drag outward scales to 150%', 0.01);
  near(s.x + 141 * 1.5, s0.x + 141, 'Bridge bottom-right x fixed', 0.2);
  near(s.y + 44 * 1.5, s0.y + 44, 'Bridge bottom-right y fixed', 0.2);
  const br = game.ids.BTSlotBuffHandleBR;
  drag(game, br, { x: 10, y: 10 }, { x: 10 - 70.5 * SCALE, y: 10 });
  s = slotState(game, 'b');
  near(s.scale, 1, 'Bridge BR drag inward back to 100%', 0.01);
  game.click('BTLayoutCancel');
  game.click('BTSlotRift', 'onmouseover');
  assert.equal(front(), 'BTSlotBuffChrome', 'outside edit mode hovering changes nothing');
});

step('side arrows put the icon or label on any side and switch the widget shape', () => {
  const { game, profile } = ready();
  game.toggleMenu();
  enterEdit(game);
  game.click('BTSlotBuffSideL');
  assert.deepEqual(slotState(game, 'b').sides, ['l'], 'Bridge icon moves to the left');
  game.click('BTSlotBuffSideT');
  assert.deepEqual(slotState(game, 'b').sides, ['t'], 'Bridge icon on top');
  game.click('BTSlotRiftSideR');
  assert.deepEqual(slotState(game, 'f').sides, ['r'], 'Rift label on the right');
  // A vertical pill is 84 px tall: dragging to the bottom clamps with the new size.
  drag(game, game.ids.BTSlotBuff, winOf('b', game), { x: 100 * SCALE, y: 5000 });
  near(slotState(game, 'b').y, H - BASE.pillV[1], 'clamp uses the vertical pill height', 0.2);
  game.click('BTLayoutDone');
  game.advance(2000);
  const t = savedLayout(profile);
  assert.equal(t.b[3], 't');
  assert.equal(t.f[3], 'r');
  const again = ready({ profile }).game;
  assert.deepEqual(slotState(again, 'b').sides, ['t'], 'side restored after restart');
  assert.deepEqual(slotState(again, 'f').sides, ['r']);
});

step('CANCEL and Esc restore the pre-edit layout without writing; RESET LAYOUT returns to defaults', () => {
  const { game, profile } = ready();
  game.toggleMenu();
  enterEdit(game);
  drag(game, game.ids.BTSlotUrn, winOf('u', game), { x: 200, y: 200 });
  game.click('BTLayoutCancel');
  assert.equal(game.layer().classes.has('bt-layout-edit'), false, 'CANCEL leaves edit mode');
  expectDefaults(game, 'after CANCEL');
  enterEdit(game);
  drag(game, game.ids.BTSlotUrn, winOf('u', game), { x: 200, y: 200 });
  game.click('BTLayoutBar', 'oncancel');
  expectDefaults(game, 'after Esc');
  assert.ok(game.stats.dropped.includes('BTLayoutBar'), 'leaving edit mode releases keyboard focus');
  game.advance(3000);
  assert.equal(game.stats.writes, 0, 'cancelled edits never write');
  // Save a moved layout, then RESET LAYOUT + DONE clears it.
  enterEdit(game);
  drag(game, game.ids.BTSlotUrn, winOf('u', game), { x: 200, y: 200 });
  game.click('BTLayoutDone');
  game.advance(2000);
  assert.ok(savedLayout(profile).u, 'moved Urn saved');
  enterEdit(game);
  game.click('BTLayoutReset');
  assert.equal(game.layer().classes.has('bt-layout-edit'), true, 'RESET LAYOUT stays in edit mode');
  expectDefaults(game, 'after RESET LAYOUT');
  game.click('BTLayoutDone');
  game.advance(2000);
  assert.equal(savedLayout(profile), undefined, 'a default layout saves no "t" entry');
  // The menu RESET keeps the layout.
  enterEdit(game);
  drag(game, game.ids.BTSlotUrn, winOf('u', game), { x: 300, y: 300 });
  game.click('BTLayoutDone');
  const moved = slotState(game, 'u');
  game.toggleMenu();
  game.reset();
  near(slotState(game, 'u').x, moved.x, 'menu RESET does not move widgets');
  game.advance(2000);
  assert.ok(savedLayout(profile).u, 'menu RESET keeps the saved layout');
});

step('fractions follow a resolution change within a second and defaults follow the dock', () => {
  const { game } = ready();
  game.toggleMenu();
  enterEdit(game);
  drag(game, game.ids.BTSlotBuff, winOf('b', game), { x: 800, y: 450 });
  game.click('BTLayoutDone');
  const before = slotState(game, 'b');
  const fx = before.x / W;
  const fy = before.y / H;
  // Wider screen: layer 2400x900 screen px.
  game.layer().actuallayoutwidth = 2400;
  game.ids.BTTimerDock.win = { x: 2033.33, y: 520.83 };
  // The HUD size and the dock are re-measured at most once a second while the model is unchanged, on the next
  // 0.25 s settings tick after that.
  game.advance(1300);
  near(slotState(game, 'b').x, fx * (2400 / SCALE), 'custom x keeps its fraction', 0.3);
  near(slotState(game, 'b').y, fy * H, 'custom y keeps its fraction', 0.3);
  near(slotState(game, 'r').x, 2033.33 / SCALE + 30.8, 'default Rejuv follows the dock', 0.3);
});

// #minimap_persp is anchored bottom-right; at ui-scale s the dock (440 layout px) is 440*s, and its top-left is
// (1600 - 366.67 s, 900 - 12.5 s - 366.67 s) in screen px (see the harness). The round minimap (420 layout px at
// stock) has its top-left at layout (1920 - 430 s, 1080 - 445 s). Once moved, #minimap_persp's top-left is at the
// written position P: the minimap at P + (10, 90) s, the dock at P + (0, 80) s.
const dockAt = (s) => ({ x: (1600 - 366.67 * s) / SCALE, y: (900 - 12.5 * s - 366.67 * s) / SCALE });
const mapAt = (s) => ({ x: W - 430 * s, y: H - 445 * s, w: 420 * s });
const mapScale = (game) => game.persp.style.uiScale;
// Inline placement written on #minimap_persp: null/undefined everywhere = stock.
function perspPlace(game) {
  const style = game.persp.style;
  const match = /^(-?[\d.]+)px (-?[\d.]+)px/.exec(String(style.position || ''));
  return { h: style.horizontalAlign, v: style.verticalAlign, x: match ? Number(match[1]) : NaN, y: match ? Number(match[2]) : NaN };
}
function expectStockMinimap(game, message) {
  for (const property of ['uiScale', 'horizontalAlign', 'verticalAlign', 'position']) {
    assert.ok(!game.persp.style[property], `${message}: #minimap_persp ${property} is stock`);
  }
}
// The minimap's edit border: [x, y] of the chrome (22 px outside the minimap) and the outline width.
function mapChrome(game) {
  const match = /^(-?[\d.]+)px (-?[\d.]+)px/.exec(String(game.ids.BTSlotMapChrome.style.position || ''));
  return { x: match ? Number(match[1]) : NaN, y: match ? Number(match[2]) : NaN, w: parseFloat(game.ids.BTSlotMapOutline.style.width) };
}
// Drags a minimap handle (or, with corner '', the minimap itself) by a layout-px delta.
function dragMap(game, dx, dy, corner = 'TL') {
  const from = { x: 700, y: 300 };
  const panel = corner ? game.ids[`BTSlotMapHandle${corner}`] : game.ids.BTSlotMapGrab;
  drag(game, panel, from, { x: from.x + dx * SCALE, y: from.y + dy * SCALE });
}
step('the minimap has a dashed border: dragging inside moves it, corners resize it around the opposite corner', () => {
  const { game, profile } = ready();
  expectStockMinimap(game, 'untouched save');
  game.toggleMenu();
  enterEdit(game);
  game.advance(300);
  const grab = game.ids.BTSlotMapGrab;
  assert.ok(grab, 'the minimap has a drag area');
  assert.equal(grab.draggable, true, 'the minimap is draggable while editing');
  assert.equal(grab.hittest, true, 'the drag area takes the mouse while editing');
  const corners = ['TL', 'TR', 'BL', 'BR'];
  for (const corner of corners) assert.equal(game.ids[`BTSlotMapHandle${corner}`].draggable, true, `${corner} handle draggable`);
  let chrome = mapChrome(game);
  near(chrome.x, mapAt(1).x - 22, 'the border surrounds the minimap (x)', 0.3);
  near(chrome.y, mapAt(1).y - 22, 'the border surrounds the minimap (y)', 0.3);
  near(chrome.w, 420, 'the border is the minimap size', 0.3);
  const writes = game.stats.writes;

  // Move: #minimap_persp starts at layout (1480, 545); 600 left and 300 up.
  dragMap(game, -600, -300, '');
  let place = perspPlace(game);
  assert.deepEqual([place.h, place.v], ['left', 'top'], 'a moved minimap is placed from its top-left');
  near(place.x, 880, 'moved x');
  near(place.y, 245, 'moved y');
  assert.ok(!mapScale(game), 'moving keeps the size');
  chrome = mapChrome(game);
  near(chrome.x, 890 - 22, 'the border follows the move at once (x)', 0.3);
  near(chrome.y, 335 - 22, 'the border follows the move at once (y)', 0.3);
  game.advance(300);
  near(slotState(game, 'r').x, 880 + 30.8, 'untouched widgets travel with the minimap (x)', 0.3);
  near(slotState(game, 'r').y, 245 + 80 + 44, 'untouched widgets travel with the minimap (y)', 0.3);

  // Bottom-right handle: +210 = 150%, the minimap's top-left corner (890, 335) stays.
  dragMap(game, 210, 210, 'BR');
  assert.equal(mapScale(game), '150%', 'dragging a corner out grows the minimap');
  place = perspPlace(game);
  near(place.x, 890 - 15, 'BR resize keeps the top-left corner (x)');
  near(place.y, 335 - 135, 'BR resize keeps the top-left corner (y)');
  chrome = mapChrome(game);
  near(chrome.x, 890 - 22, 'the border keeps its top-left', 0.3);
  near(chrome.w, 630, 'the border follows the new size', 0.3);
  game.advance(300);
  near(slotState(game, 'r').scale, 1.5, 'untouched widgets scale with the minimap');
  near(slotState(game, 'r').x, 875 + 30.8 * 1.5, 'and keep their spot on it', 0.3);
  // Top-left handle in by 210: back to 100%, the bottom-right corner (1520, 965) stays.
  dragMap(game, 210, 210, 'TL');
  assert.ok(!mapScale(game), 'a 100% minimap needs no inline scale');
  place = perspPlace(game);
  near(place.x, 1520 - 420 - 10, 'TL resize keeps the bottom-right corner (x)');
  near(place.y, 965 - 420 - 90, 'TL resize keeps the bottom-right corner (y)');
  // Clamps: the whole minimap box stays on screen; sizes stop at 50% and 150%.
  dragMap(game, 5000, 5000, '');
  place = perspPlace(game);
  near(place.x, W - 440, 'the minimap box stays on screen (x)');
  near(place.y, H - 520, 'the minimap box stays on screen (y)');
  dragMap(game, -3000, -3000, 'TL');
  assert.equal(mapScale(game), '150%', 'the size clamps at 150%');
  place = perspPlace(game);
  assert.ok(place.x >= 0 && place.y >= 0 && place.x + 660 <= W + 0.1 && place.y + 780 <= H + 0.1, 'a 150% minimap box stays on screen');
  dragMap(game, 3000, 3000, 'TL');
  assert.equal(mapScale(game), '50%', 'the size clamps at 50%');
  game.click('BTLayoutCancel');
  game.advance(300);
  expectStockMinimap(game, 'after CANCEL');
  assert.equal(grab.draggable, false, 'the minimap is not draggable outside edit mode');
  for (const corner of corners) assert.equal(game.ids[`BTSlotMapHandle${corner}`].draggable, false, `${corner} handle inert`);
  expectDefaults(game, 'after CANCEL');
  assert.equal(game.stats.writes, writes, 'CANCEL writes nothing');

  game.toggleMenu();
  enterEdit(game);
  game.advance(300);
  near(mapChrome(game).x, mapAt(1).x - 22, 'a cancelled move is not kept', 0.3);
  dragMap(game, -600, -300, '');
  // Bottom-right in by 105: 75%, the minimap's top-left (890, 335) stays, so the box is at (882.5, 267.5).
  dragMap(game, -105, -105, 'BR');
  assert.equal(mapScale(game), '75%');
  game.click('BTLayoutDone');
  game.advance(2000);
  assert.equal(game.stats.writes, writes + 1, 'DONE saves once');
  const saved = savedLayout(profile);
  assert.equal(saved.m, 0.75, 'the size is saved with the layout');
  near(saved.mp[0], 882.5 / W, 'the spot is saved as a screen fraction (x)', 0.0001);
  near(saved.mp[1], 267.5 / H, 'the spot is saved as a screen fraction (y)', 0.0001);

  // Next launch: spot and size come back; RESET LAYOUT + DONE returns the stock minimap and saves no layout.
  const next = ready({ profile }).game;
  assert.equal(mapScale(next), '75%', 'the saved size is applied on launch');
  near(perspPlace(next).x, 882.5, 'the saved spot is applied on launch', 0.3);
  near(perspPlace(next).y, 267.5, 'the saved spot is applied on launch (y)', 0.3);
  near(slotState(next, 'r').x, 882.5 + 30.8 * 0.75, 'defaults follow the saved minimap on launch', 0.3);
  next.toggleMenu();
  enterEdit(next);
  next.advance(300);
  near(mapChrome(next).w, 315, 'the border shows the saved size', 0.3);
  next.click('BTLayoutReset');
  expectStockMinimap(next, 'after RESET LAYOUT');
  next.click('BTLayoutDone');
  next.advance(2000);
  assert.equal(savedLayout(profile), undefined, 'a reset layout saves nothing');
  expectDefaults(next, 'after RESET LAYOUT');
});

// Live sequence of 2026-10-09: move, grow to 150 % from the top-left corner, move again, then RESET LAYOUT in the same
// session. The minimap, its border and the default widget spots all go back to stock before DONE.
step('RESET LAYOUT puts a moved and resized minimap back in the same edit session', () => {
  const { game, profile } = ready();
  game.toggleMenu();
  enterEdit(game);
  game.advance(300);
  dragMap(game, -400, -200, '');
  dragMap(game, -210, -210, 'TL');
  dragMap(game, 150, 100, '');
  assert.equal(mapScale(game), '150%', 'grown to 150%');
  assert.ok(game.persp.style.position, 'the minimap is moved');
  drag(game, game.ids.BTSlotUrn, winOf('u', game), { x: 200, y: 200 });
  game.click('BTLayoutReset');
  expectStockMinimap(game, 'after RESET LAYOUT');
  game.advance(300);
  near(mapChrome(game).x, mapAt(1).x - 22, 'the border is back around the stock minimap (x)', 0.3);
  near(mapChrome(game).y, mapAt(1).y - 22, 'the border is back around the stock minimap (y)', 0.3);
  near(mapChrome(game).w, 420, 'the border is back to the stock size', 0.3);
  expectDefaults(game, 'after RESET LAYOUT');
  game.click('BTLayoutDone');
  game.advance(2000);
  assert.equal(savedLayout(profile), undefined, 'nothing is saved');
  expectStockMinimap(game, 'after DONE');
});

// The stock location label (#minimap_location, mocked in the harness): 150x22 with its centre at persp px (340, 464),
// so at layer (1820, 1009) under the stock minimap; stock CSS turns it -30deg. Failure modes: the label not following
// a drag or the minimap, a move ignoring the minimap's scale, leaving the #minimap_persp box (the engine does not draw
// a child outside it), the knob not tracking the turned top edge, a turn translating the label, the inline style not
// handed back at the stock spot/turn or on CANCEL and RESET LAYOUT, the save not restoring it while the label is
// hidden, edit mode leaving the label shown (or removing an engine-set class), a missing label breaking the editor, a
// retiring timer undoing its successor's label, malformed or schema-5 entries being applied.
const LOC = { cx: 1820, cy: 1009, w: 150, h: 22 };
function locStyle(game) {
  const style = game.location.style;
  const match = /^translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0px\)$/.exec(String(style.transform || ''));
  return {
    stock: !style.transform && !style.preTransformRotate2d,
    dx: match ? Number(match[1]) : NaN, dy: match ? Number(match[2]) : NaN,
    deg: style.preTransformRotate2d ? parseFloat(style.preTransformRotate2d) : NaN,
  };
}
const posOf = (panel) => {
  const match = /^(-?[\d.]+)px (-?[\d.]+)px/.exec(String(panel.style.position || ''));
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: NaN, y: NaN };
};
// The label's edit chrome: centre, outline size and turn of the dashed box, and the 12px rotate knob's centre.
function locChrome(game) {
  const chrome = game.ids.BTSlotLocChrome;
  const at = posOf(chrome);
  const knob = posOf(game.ids.BTSlotLocRotate);
  return {
    cx: at.x + parseFloat(chrome.style.width) / 2, cy: at.y + parseFloat(chrome.style.height) / 2,
    w: parseFloat(game.ids.BTSlotLocOutline.style.width), h: parseFloat(game.ids.BTSlotLocOutline.style.height),
    deg: parseFloat(chrome.style.preTransformRotate2d), kx: knob.x + 6, ky: knob.y + 6,
  };
}
// The knob sits 16 px above the label's top edge, on the turned label's centre line.
function expectKnob(game, message) {
  const chrome = locChrome(game);
  const turn = chrome.deg * Math.PI / 180;
  const reach = chrome.h / 2 + 16;
  near(chrome.kx, chrome.cx + reach * Math.sin(turn), `${message}: knob x`, 0.3);
  near(chrome.ky, chrome.cy - reach * Math.cos(turn), `${message}: knob y`, 0.3);
}
function dragLoc(game, dx, dy) {
  const chrome = locChrome(game);
  const from = { x: chrome.cx * SCALE, y: chrome.cy * SCALE };
  drag(game, game.ids.BTSlotLocGrab, from, { x: from.x + dx * SCALE, y: from.y + dy * SCALE });
}
// Drags the knob to a point 100 px from the label centre at deg (0 = straight up, clockwise positive).
function turnLoc(game, deg) {
  const chrome = locChrome(game);
  const turn = deg * Math.PI / 180;
  drag(game, game.ids.BTSlotLocRotate, { x: chrome.kx * SCALE, y: chrome.ky * SCALE },
    { x: (chrome.cx + 100 * Math.sin(turn)) * SCALE, y: (chrome.cy - 100 * Math.cos(turn)) * SCALE });
}
step('the map location label moves and turns inside the minimap box; DONE saves it, CANCEL and RESET LAYOUT hand it back', () => {
  const { game, profile } = ready();
  assert.ok(locStyle(game).stock, 'an untouched label keeps the stock CSS');
  assert.equal(game.location.actuallayoutwidth, 0, 'outside a district the stock label is collapsed');
  game.toggleMenu();
  enterEdit(game);
  game.advance(300);
  assert.equal(game.persp.classes.has('in_map_district'), true, 'editing shows the label outside a district');
  let chrome = locChrome(game);
  near(chrome.cx, LOC.cx, 'the dashed box sits on the label (x)', 0.3);
  near(chrome.cy, LOC.cy, 'the dashed box sits on the label (y)', 0.3);
  near(chrome.w, LOC.w, 'the dashed box is the label size (w)', 0.3);
  near(chrome.h, LOC.h, 'the dashed box is the label size (h)', 0.3);
  assert.equal(chrome.deg, -30, 'the dashed box is turned like the stock label');
  expectKnob(game, 'stock turn');
  const grab = game.ids.BTSlotLocGrab;
  assert.equal(grab.draggable, true, 'the label is draggable while editing');
  assert.equal(grab.hittest, true, 'its drag area takes the mouse while editing');
  assert.equal(game.ids.BTSlotLocRotate.draggable, true, 'the knob is draggable while editing');
  const cos30 = Math.cos(Math.PI / 6);
  near(parseFloat(grab.style.width), LOC.w * cos30 + LOC.h / 2, 'the drag area covers the turned label (w)', 0.3);
  near(parseFloat(grab.style.height), LOC.w / 2 + LOC.h * cos30, 'the drag area covers the turned label (h)', 0.3);
  const writes = game.stats.writes;

  dragLoc(game, -200, -150);
  let style = locStyle(game);
  near(style.dx, -200, 'the label moves (x)');
  near(style.dy, -150, 'the label moves (y)');
  assert.equal(style.deg, -30, 'moving keeps the stock turn (the inline transform replaces the stock rotateZ)');
  chrome = locChrome(game);
  near(chrome.cx, LOC.cx - 200, 'the dashed box follows at once (x)', 0.3);
  near(chrome.cy, LOC.cy - 150, 'the dashed box follows at once (y)', 0.3);
  turnLoc(game, 90);
  assert.equal(locStyle(game).deg, 90, 'the knob turns the label');
  near(locStyle(game).dx, -200, 'turning keeps the spot', 0.01);
  assert.equal(locChrome(game).deg, 90, 'the dashed box turns with it');
  expectKnob(game, 'turned 90');
  turnLoc(game, 7);
  assert.equal(locStyle(game).deg, 7, 'no snap 7 degrees from a 15 degree step');
  turnLoc(game, 3);
  assert.equal(locStyle(game).deg, 0, 'snaps to 15 degree steps within 4 degrees');
  // Clamped to the #minimap_persp box (layer 1480-1920 x 545-1065): the engine does not draw a child outside it.
  dragLoc(game, 5000, 5000);
  style = locStyle(game);
  near(style.dx, 1920 - LOC.w / 2 - LOC.cx, 'the label stays in the minimap box (right)');
  near(style.dy, 1065 - LOC.h / 2 - LOC.cy, 'the label stays in the minimap box (bottom)');
  dragLoc(game, -5000, -5000);
  style = locStyle(game);
  near(style.dx, 1480 + LOC.w / 2 - LOC.cx, 'the label stays in the minimap box (left)');
  near(style.dy, 545 + LOC.h / 2 - LOC.cy, 'the label stays in the minimap box (top)');
  // Near its stock spot it snaps onto it; at the stock turn too, the label is handed back to the stock CSS.
  dragLoc(game, LOC.cx - 1480 - LOC.w / 2 + 5, LOC.cy - 545 - LOC.h / 2 - 6);
  style = locStyle(game);
  assert.deepEqual([style.dx, style.dy, style.deg], [0, 0, 0], 'snapped onto the stock spot, still level');
  turnLoc(game, -30);
  assert.ok(locStyle(game).stock, 'stock spot and turn: nothing inline');
  expectKnob(game, 'back to stock');

  dragLoc(game, -100, -60);
  turnLoc(game, 15);
  game.click('BTLayoutCancel');
  game.advance(300);
  assert.ok(locStyle(game).stock, 'CANCEL hands the label back');
  assert.equal(game.persp.classes.has('in_map_district'), false, 'leaving edit mode hides it again outside a district');
  assert.equal(grab.draggable, false, 'the label is not draggable outside edit mode');
  assert.equal(game.stats.writes, writes, 'CANCEL writes nothing');

  game.toggleMenu();
  enterEdit(game);
  game.advance(300);
  dragLoc(game, -100, -60);
  turnLoc(game, 15);
  game.click('BTLayoutDone');
  game.advance(2000);
  assert.equal(game.stats.writes, writes + 1, 'DONE saves once');
  const body = JSON.parse(profile.disk.get(KEY).slice(14));
  assert.equal(body.s, 6, 'saves with the label are schema 6');
  assert.deepEqual(body.t.lc, [-100, -60, 15], 'the label is saved as its offset from stock and its turn');

  // Next launch: applied while the label is hidden (nothing to measure); it travels and scales with the minimap.
  const next = ready({ profile }).game;
  style = locStyle(next);
  assert.deepEqual([style.dx, style.dy, style.deg], [-100, -60, 15], 'the saved label is applied on launch');
  next.toggleMenu();
  enterEdit(next);
  next.advance(300);
  near(locChrome(next).cx, LOC.cx - 100, 'the dashed box shows the saved spot', 0.3);
  dragMap(next, -600, -300, '');
  chrome = locChrome(next);
  near(chrome.cx, LOC.cx - 700, 'the label travels with the minimap (x)', 0.3);
  near(chrome.cy, LOC.cy - 360, 'the label travels with the minimap (y)', 0.3);
  // Bottom-right in by 105: 75 %, #minimap_persp at (882.5, 267.5); the offset is in minimap px, so it scales too.
  dragMap(next, -105, -105, 'BR');
  next.advance(300);
  chrome = locChrome(next);
  near(chrome.cx, 882.5 + (340 - 100) * 0.75, 'the label keeps its spot on a resized minimap (x)', 0.3);
  near(chrome.cy, 267.5 + (464 - 60) * 0.75, 'the label keeps its spot on a resized minimap (y)', 0.3);
  near(chrome.w, LOC.w * 0.75, 'the dashed box scales with the minimap', 0.3);
  expectKnob(next, 'resized minimap');
  // A move on the 75% minimap: 30 layer px are 40 minimap px.
  dragLoc(next, 30, 0);
  near(locStyle(next).dx, -60, 'a move on a scaled minimap is stored in minimap px');
  next.click('BTLayoutReset');
  assert.ok(locStyle(next).stock, 'RESET LAYOUT hands the label back');
  next.click('BTLayoutDone');
  next.advance(2000);
  assert.equal(savedLayout(profile), undefined, 'a reset layout saves nothing');
  assert.equal(next.persp.classes.has('in_map_district'), false, 'DONE hides the label outside a district again');
});

step('an engine-set district class stays; without the stock label the rest of the editor works', () => {
  const { game } = ready();
  game.persp.AddClass('in_map_district');
  game.toggleMenu();
  enterEdit(game);
  game.advance(300);
  game.click('BTLayoutDone');
  game.advance(300);
  assert.equal(game.persp.classes.has('in_map_district'), true, 'a class the engine set is left alone');

  const bare = ready({ noLocation: true }).game;
  bare.toggleMenu();
  enterEdit(bare);
  bare.advance(300);
  for (const id of ['BTSlotLocGrab', 'BTSlotLocChrome', 'BTSlotLocRotate']) {
    assert.equal(bare.ids[id].classes.has('bt-loc-none'), true, `#${id} hides without a label`);
  }
  assert.equal(bare.ids.BTSlotLocGrab.draggable, false, 'nothing to drag without a label');
  dragMap(bare, -600, -300, '');
  near(perspPlace(bare).x, 880, 'the minimap still moves');
  drag(bare, bare.ids.BTSlotUrn, winOf('u', bare), { x: 200, y: 200 });
  bare.click('BTLayoutDone');
  bare.advance(2000);
  assert.equal(bare.state().phase, 'ready');
});

step('a timer reboot keeps the saved label; a replaced timer leaves it alone; the last one hands it back', () => {
  const profile = createProfile({ [KEY]: record('{"s":6,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"lc":[-40,-20.5,45]}}') });
  const model = { lc: [-40, -20.5, 45] };
  const { game } = ready({ profile });
  assert.equal(game.state().phase, 'ready');
  let style = locStyle(game);
  assert.deepEqual([style.dx, style.dy, style.deg], [-40, -20.5, 45], 'schema 6 label applied');
  const oldApi = game.shared.BTTimerLayout;
  game.bootTimerAgain();
  game.shared.BTTimerLayout.apply(model, false);
  assert.equal(oldApi.apply(model, true), false, 'the replaced timer retires when it is next used');
  game.advance(1500);
  style = locStyle(game);
  assert.deepEqual([style.dx, style.dy, style.deg], [-40, -20.5, 45], 'the retiring timer does not undo its successor');
  game.bootTimerAgain();
  game.shared.BTTimerLayout.apply({}, false);
  assert.ok(locStyle(game).stock, 'a new timer clears a label its predecessor left behind');
  game.advance(500);
  assert.equal(locStyle(game).deg, 45, 'the settings loop hands the new timer the saved label');
  game.minimap.deleted = true;
  game.advance(1500);
  assert.ok(locStyle(game).stock, 'a timer with no successor hands the label back');
});

// A label that stays collapsed while editing (outside a district, should the class not reveal it) has no layout to
// measure. Its chrome must still stand on the label's stock CSS spot (centre at minimap px (340, 464)) and move and turn
// it, here on a minimap moved and at 120 %.
step('a label the engine keeps collapsed still gets its chrome at the stock spot and can be moved and turned', () => {
  const profile = createProfile({ [KEY]: record('{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"m":1.2,"mp":[0.25,0.3]}}') });
  const { game } = ready({ profile, locationHidden: true });
  game.toggleMenu();
  enterEdit(game);
  game.advance(300);
  assert.equal(game.location.actuallayoutwidth, 0, 'the label has no layout');
  for (const id of ['BTSlotLocGrab', 'BTSlotLocChrome', 'BTSlotLocRotate']) {
    assert.equal(game.ids[id].classes.has('bt-loc-none'), false, `#${id} shows`);
  }
  assert.equal(game.ids.BTSlotLocChrome.classes.has('bt-loc-empty'), true, 'the empty box is named');
  assert.equal(game.ids.BTSlotLocGrab.draggable, true, 'the label is draggable');
  const p = perspPlace(game);
  let chrome = locChrome(game);
  near(chrome.cx, p.x + 340 * 1.2, 'the box sits on the stock spot (x)', 0.3);
  near(chrome.cy, p.y + 464 * 1.2, 'the box sits on the stock spot (y)', 0.3);
  assert.equal(chrome.deg, -30, 'turned like the stock label');
  expectKnob(game, 'collapsed label');
  dragLoc(game, -120, -60);
  const style = locStyle(game);
  near(style.dx, -100, 'moved in minimap px (x)');
  near(style.dy, -50, 'moved in minimap px (y)');
  turnLoc(game, 45);
  assert.equal(locStyle(game).deg, 45, 'the knob turns it');
  chrome = locChrome(game);
  near(chrome.cx, p.x + 240 * 1.2, 'the box follows (x)', 0.3);
});

step('with the minimap moved to the top of the screen, the edit bar opens below it instead of covering it', () => {
  const { game } = ready();
  game.toggleMenu();
  enterEdit(game);
  game.advance(300);
  dragMap(game, -600, -2000, '');
  assert.equal(perspPlace(game).y, 0, 'the minimap box is at the top');
  game.advance(300);
  const bar = /^(-?[\d.]+)px (-?[\d.]+)px/.exec(String(game.ids.BTLayoutBar.style.position));
  // The dock (the minimap's 440 box) now spans layout y 80-520; no room above it for the bar.
  assert.ok(Number(bar[2]) >= 520, `the bar sits below the minimap (y ${bar[2]})`);
  near(Number(bar[1]) + 330 / 2, 880 + 220, 'and stays centred on it', 0.5);
});

// "n" = no icon: only the time, on the horizontal pill; without an icon there is no vertical layout.
step('the Rejuv and Bridge pills can hide their icon; without it the vertical sides are off', () => {
  const { game, profile } = ready();
  game.toggleMenu();
  enterEdit(game);
  for (const id of ['BTSlotRiftIconToggle', 'BTSlotUrnIconToggle', 'BTSlotClaimLIconToggle']) {
    assert.equal(game.ids[id], undefined, `${id}: only the pills have an icon to hide`);
  }
  const rejuvChrome = game.ids.BTSlotRejuvChrome;
  game.click('BTSlotRejuvIconToggle');
  let r = slotState(game, 'r');
  assert.deepEqual(r.sides, ['n'], 'the Rejuv pill hides its icon');
  assert.equal(rejuvChrome.classes.has('bt-side-n'), true, 'its chrome hides the vertical arrows (CSS on bt-side-n)');
  near(parseFloat(game.ids.BTSlotRejuvOutline.style.width), BASE.pillH[0], 'it keeps the horizontal size');
  near(r.x, DEFAULTS.r.x, 'it stays where it was');
  game.click('BTSlotRejuvSideT');
  assert.deepEqual(slotState(game, 'r').sides, ['n'], 'a vertical side needs the icon: the top arrow does nothing');
  game.click('BTSlotRejuvSideR');
  assert.deepEqual(slotState(game, 'r').sides, ['r'], 'a left/right arrow brings the icon back on that side');
  // From a vertical pill, hiding the icon goes back to the horizontal shape; showing it again uses its default side.
  game.click('BTSlotBuffSideT');
  assert.deepEqual(slotState(game, 'b').sides, ['t']);
  game.click('BTSlotBuffIconToggle');
  assert.deepEqual(slotState(game, 'b').sides, ['n'], 'the Bridge pill hides its icon');
  near(parseFloat(game.ids.BTSlotBuffOutline.style.width), BASE.pillH[0], 'a vertical pill without its icon is horizontal');
  game.click('BTSlotBuffIconToggle');
  assert.deepEqual(slotState(game, 'b').sides, ['r'], 'showing the icon again puts it on the default side');
  game.click('BTSlotBuffIconToggle');
  game.click('BTLayoutDone');
  game.advance(2000);
  const saved = savedLayout(profile);
  assert.equal(saved.b[3], 'n', 'a hidden icon is saved');
  assert.equal(saved.r[3], 'r');
  const next = ready({ profile }).game;
  assert.deepEqual(slotState(next, 'b').sides, ['n'], 'a hidden icon is restored');
  for (const bad of ['{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"f":[0.5,0.5,1,"n"]}}',
    '{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"cl":[0.5,0.5,1,"n"]}}']) {
    const blocked = ready({ profile: createProfile({ [KEY]: record(bad) }) }).game;
    assert.equal(blocked.state().phase, 'blocked', `${bad}: only the pills can hide an icon`);
  }
});

// The Mid Boss is up from the start of a match, so the Rejuv waits at Spawn; the mini card shown during the neutral
// overrides must not count down a 10:00 phase that never started (in game 2026-10-09: "08:30"). The pill's own Spawn
// is enough: the mini card stays hidden (user decision 2026-10-09: no "Spawn" on it).
step('a Rejuv waiting to spawn keeps the mini card hidden during a neutral override', () => {
  const { game } = ready({ clock: '0:30' });
  game.advance(2000);
  assert.equal(game.ids.RejuvTime.text, 'Spawn', 'the Rejuv pill waits at Spawn from the start');
  game.clock.text = '1:30';
  game.advance(2000);
  assert.equal(game.ids.RejuvMiniCard.classes.has('active'), false, 'no mini card while the Rejuv waits to spawn');
  assert.equal(game.ids.RejuvMiniTime.text, '', 'no 10:00 countdown and no Spawn text on it');
  game.clock.text = '2:30';
  game.advance(2000);
  assert.equal(game.ids.RejuvTime.text, 'Spawn', 'after the override the pill still waits at Spawn');
});

// Untouched widgets keep the stock arrangement at every minimap size: none overlaps another or leaves the screen.
step('at 50%, 75%, 100% and 150% the default widgets stay apart and on screen', () => {
  for (const m of [0.5, 0.75, 1, 1.5]) {
    const body = m === 1 ? '{"s":5,"u":"#111111","d":"#222222","l":1,"g":1}'
      : `{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"m":${m}}}`;
    const { game } = ready({ profile: createProfile({ [KEY]: record(body) }) });
    game.advance(1300);
    const rects = Object.keys(DEFAULTS).map((key) => {
      const state = slotState(game, key);
      const base = { pill: BASE.pillH, card: BASE.cardV, claim: [48, 48] }[DEFAULTS[key].kind];
      near(state.scale, m, `${key} scales with a ${m * 100}% minimap`, 0.001);
      near(state.x, dockAt(m).x + (DEFAULTS[key].x - DOCK.x) * m, `${key} x at ${m * 100}%`, 0.3);
      return { key, x: state.x, y: state.y, w: base[0] * m, h: base[1] * m };
    });
    for (const a of rects) {
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= W + 0.01 && a.y + a.h <= H + 0.01, `${a.key} on screen at ${m * 100}%`);
      for (const b of rects) {
        if (a.key >= b.key) continue;
        const apart = a.x + a.w <= b.x + 0.01 || b.x + b.w <= a.x + 0.01 || a.y + a.h <= b.y + 0.01 || b.y + b.h <= a.y + 0.01;
        assert.ok(apart, `${a.key} and ${b.key} do not overlap at ${m * 100}%`);
      }
    }
  }
});

// A settings reboot while editing: the replaced instance must not push its saved layout over its successor's session.
step('a replaced settings script leaves its successor\'s edit session and minimap size alone', () => {
  const fast = { navSec: 0.001, replySec: 0.001, echoSec: null };
  const { game } = ready(fast);
  game.toggleMenu();
  enterEdit(game);
  game.advance(300);
  game.bootSecond();
  game.advance(20);
  assert.equal(game.state().phase, 'ready', 'the successor has read the save');
  enterEdit(game);
  game.advance(20);
  dragMap(game, -168, -168);
  assert.equal(mapScale(game), '140%');
  // The old instance's loop notices it was replaced and stops. Resetting the minimap would only flicker (the
  // successor re-sends its draft within 0.25 s), so count the writes instead of sampling the end state.
  const writes = game.stats.perspWrites;
  game.advance(600);
  assert.equal(game.stats.perspWrites, writes, 'the old instance does not reset the successor\'s draft size');
  assert.equal(mapScale(game), '140%');
  assert.equal(game.layer().classes.has('bt-layout-edit'), true, 'the successor stays in edit mode');
});

// A HUD mod that widens #minimap_persp widens the dock (width 100%) but not the minimap's scale: the size is read
// from the dock's own 440 px height, so the border keeps matching the minimap.
step('a wider minimap box from another mod does not distort the measured minimap size', () => {
  const profile = createProfile({ [KEY]: record('{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"m":1.2}}') });
  const { game } = ready({ profile, dockBaseW: 500 });
  game.toggleMenu();
  enterEdit(game);
  game.advance(1300);
  near(mapChrome(game).w, 420 * 1.2, 'the border matches the 120% minimap', 0.3);
  near(slotState(game, 'r').scale, 1.2, 'untouched widgets use the real minimap scale', 0.001);
});

step('a timer reboot keeps the saved minimap spot and size; the last timer to go hands the minimap back', () => {
  const profile = createProfile({ [KEY]: record('{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"m":0.8,"mp":[0.25,0.3]}}') });
  const model = { m: 0.8, mp: [0.25, 0.3] };
  const { game } = ready({ profile });
  assert.equal(game.state().phase, 'ready');
  assert.equal(mapScale(game), '80%');
  const oldApi = game.shared.BTTimerLayout;
  game.bootTimerAgain();
  // The settings loop can reach the new timer before the old one notices it was replaced; the old timer must then
  // leave the size alone instead of resetting what its successor just wrote.
  game.shared.BTTimerLayout.apply(model, false);
  assert.equal(mapScale(game), '80%');
  assert.equal(oldApi.apply(model, true), false, 'the replaced timer retires when it is next used');
  game.advance(1500);
  assert.equal(mapScale(game), '80%', 'the retiring timer does not undo its successor');
  near(perspPlace(game).x, 480, 'the retiring timer does not undo its successor\'s spot', 0.3);
  near(perspPlace(game).y, 324, 'the retiring timer does not undo its successor\'s spot (y)', 0.3);
  near(slotState(game, 'u').x, 480 + 222.2 * 0.8, 'the new timer places defaults on the moved minimap', 0.3);
  // A new timer does not trust the size it finds: a first model without one hands the minimap back to stock.
  game.bootTimerAgain();
  game.shared.BTTimerLayout.apply({}, false);
  expectStockMinimap(game, 'a new timer clears a spot and size its predecessor left behind');
  game.advance(500);
  assert.equal(mapScale(game), '80%', 'the settings loop hands the new timer the saved size');
  // The HUD goes away without a successor: the minimap goes back to stock.
  game.minimap.deleted = true;
  game.advance(1500);
  expectStockMinimap(game, 'a timer with no successor');
});

step('a timer reboot gets the saved layout again; stale slot handlers are inert', () => {
  const { game } = ready();
  game.toggleMenu();
  enterEdit(game);
  drag(game, game.ids.BTSlotRift, winOf('f', game), { x: 400, y: 300 });
  game.click('BTLayoutDone');
  const placed = slotState(game, 'f');
  const staleSlot = game.ids.BTSlotRift;
  const staleStart = staleSlot.events.DragStart;
  game.bootTimerAgain();
  game.advance(1500);
  assert.notEqual(game.ids.BTSlotRift, staleSlot, 'the new timer instance built new slots');
  near(slotState(game, 'f').x, placed.x, 'saved layout re-applied to the new timer', 0.2);
  near(slotState(game, 'f').y, placed.y, 'saved layout re-applied to the new timer (y)', 0.2);
  if (typeof staleStart === 'function') {
    const callbacks = {};
    staleStart(staleSlot, callbacks);
    assert.equal(callbacks.displayPanel || null, null, 'a drag on a retired slot does nothing');
  }
});

step('Customize is hidden without the timer; schema 2 saves load; malformed layouts block like other damage', () => {
  const alone = launch(createProfile(), { withTimer: false });
  alone.advance(2500);
  alone.toggleMenu();
  assert.equal(alone.ids.BTSettingsPanel.classes.has('no-buff-timer'), true);
  alone.click('BTLayoutButton');
  assert.equal(alone.ids.BTLayoutBar.classes.has('open'), false, 'no edit mode without the timer');
  const v2 = ready({ profile: createProfile({ [KEY]: record('{"s":2,"u":"#111111","d":"#222222","l":1,"g":1}') }) }).game;
  assert.equal(v2.state().phase, 'ready');
  expectDefaults(v2, 'schema 2 save');
  for (const bad of ['{"s":3,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"b":[2,0.5,1,"r"]}}',
    '{"s":3,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"b":[0.5,0.5,9,"r"]}}',
    '{"s":3,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"x":[0.5,0.5,1,"r"]}}',
    '{"s":3,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"b":[0.5,0.5,1,"q"]}}',
    '{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"m":3}}',
    '{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"m":"1.2"}}',
    '{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"m":[1.2]}}',
    '{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"mp":[1.5,0.5]}}',
    '{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"mp":[0.5]}}',
    '{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"mp":"0.5,0.5"}}',
    // The label is a schema 6 key; offsets stay within 1000 minimap px, turns within +-180 degrees.
    '{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"lc":[10,10,0]}}',
    '{"s":6,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"lc":[10,10]}}',
    '{"s":6,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"lc":[10,10,"15"]}}',
    '{"s":6,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"lc":[2000,10,0]}}',
    '{"s":6,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"lc":[10,10,200]}}']) {
    const game = ready({ profile: createProfile({ [KEY]: record(bad) }) }).game;
    assert.equal(game.state().phase, 'blocked', `malformed layout ${bad} blocks writes`);
    expectDefaults(game, 'malformed layout is not applied');
    expectStockMinimap(game, 'a malformed minimap entry is not applied');
    assert.ok(locStyle(game).stock, 'a malformed label entry is not applied');
  }
  const good = ready({ profile: createProfile({ [KEY]: record('{"s":3,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"u":[0.25,0.5,1.25,"l"]}}') }) }).game;
  assert.equal(good.state().phase, 'ready');
  const urn = slotState(good, 'u');
  near(urn.x, 0.25 * W, 'schema 3 layout applied (x)', 0.2);
  near(urn.y, 0.5 * H, 'schema 3 layout applied (y)', 0.2);
  near(urn.scale, 1.25, 'schema 3 layout applied (scale)', 0.01);
  assert.deepEqual(urn.sides, ['l']);
});

fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
fs.writeFileSync(path.join(root, '.tmp', 'bt-layout-e2e.json'), JSON.stringify({ passed: transcript }, null, 2));
console.log(`[BT LAYOUT PASS] ${transcript.length} end-to-end scenarios; artifact .tmp/bt-layout-e2e.json`);
