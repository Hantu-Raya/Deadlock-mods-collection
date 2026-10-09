#!/usr/bin/env node
'use strict';

// Runs the shipped Closure ADVANCED scripts (no test exports) through the movable-widget flow with the shared harness.
// The unminified validators cannot see renamed properties: a bare-key lookup table read with a runtime string
// (LAYOUT_BASE[spec.kind]) passed them and threw on every placement in game (2026-10-09).
// Usage: node validate-closure-layout.js <closure scripts dir>   Writes .tmp/bt-closure-layout.json.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'buff_timer_virgin_closure', 'panorama', 'scripts'));
for (const name of ['rejuvnbufftimer.js', 'bt_minimap_settings.js']) {
  assert.ok(fs.existsSync(path.join(dir, name)), `${name} exists in ${dir}`);
}
process.env.BT_SCRIPTS_DIR = dir;
const { root, KEY, SCALE, createProfile, launch } = require('./bt-test-harness.js');

const transcript = [];
const step = (name, fn) => { fn(); transcript.push(name); };
const near = (actual, expected, message, tolerance = 0.3) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
const DOCK = { x: 1233.33 / SCALE, y: 520.83 / SCALE };
const SLOTS = { b: 'BTSlotBuff', r: 'BTSlotRejuv', f: 'BTSlotRift', u: 'BTSlotUrn', cl: 'BTSlotClaimL', cr: 'BTSlotClaimR' };
const DEFAULT_XY = { b: [268.4, 44], r: [30.8, 44], f: [173.8, 31.2], u: [222.2, 31.2], cl: [132, 356.8], cr: [260, 356.8] };

function slot(game, key) {
  const panel = game.ids[SLOTS[key]];
  assert.ok(panel, `#${SLOTS[key]} exists`);
  const match = /^(-?[\d.]+)px (-?[\d.]+)px/.exec(String(panel.style.position || ''));
  return {
    panel, x: match ? Number(match[1]) : NaN, y: match ? Number(match[2]) : NaN,
    scale: panel.style.uiScale === undefined ? 1 : parseFloat(panel.style.uiScale) / 100,
    placed: panel.classes.has('bt-placed'),
  };
}
function drag(game, panel, dxLayout, dyLayout) {
  const callbacks = {};
  assert.equal(typeof panel.events.DragStart, 'function', `#${panel.id} DragStart bound`);
  panel.events.DragStart(panel, callbacks);
  const proxy = callbacks.displayPanel;
  assert.ok(proxy && proxy.IsValid(), `#${panel.id} drag supplies a proxy`);
  proxy.win = { x: 500, y: 500 };
  game.advance(40);
  proxy.win = { x: 500 + dxLayout * SCALE, y: 500 + dyLayout * SCALE };
  game.advance(40);
  delete proxy.win; // the engine clears the proxy position before DragEnd (removePositionBeforeDrop)
  panel.events.DragEnd(panel, proxy);
  game.advance(40);
}
function ready(profile) {
  const game = launch(profile, { withTimer: true });
  game.advance(2500);
  return game;
}

let saved = null;
step('minified timer places every widget at its default spot', () => {
  const game = ready(createProfile());
  for (const key of Object.keys(SLOTS)) {
    const state = slot(game, key);
    assert.equal(state.placed, true, `${key} placed`);
    near(state.x, DOCK.x + DEFAULT_XY[key][0], `${key} x`);
    near(state.y, DOCK.y + DEFAULT_XY[key][1], `${key} y`);
  }
});

step('minified settings enters edit mode, drags, scales, flips and saves', () => {
  const profile = createProfile();
  const game = ready(profile);
  game.toggleMenu();
  game.click('BTLayoutButton');
  assert.equal(game.ids.TimerOverlayFrame.classes.has('bt-layout-edit'), true, 'edit mode on');
  assert.equal(game.ids.BTLayoutBar.classes.has('open'), true, 'edit bar open');
  game.advance(300);
  assert.match(String(game.ids.BTLayoutBar.style.position || ''), /^\d[\d.]*px \d[\d.]*px/, 'edit bar placed above the minimap');
  // The look (claim/glow colours) crosses the two minified scripts: the edit-mode sample claim is painted with it.
  assert.match(String(game.ids.ClaimBgLeft.style.backgroundColor || ''), /from\(rgba\(100,255,200,0\.3\)\)/,
    'sample claim painted with the default ally colour');
  game.click('BTSlotBuff', 'onmouseover');
  assert.equal(game.ids.BTEditLayer.Children().slice(-1)[0].id, 'BTSlotBuffChrome', 'hover raises the widget chrome');
  const start = slot(game, 'b');
  assert.equal(start.panel.draggable, true, 'slot draggable while editing');
  drag(game, start.panel, -300, -200);
  near(slot(game, 'b').x, start.x - 300, 'dragged x');
  near(slot(game, 'b').y, start.y - 200, 'dragged y');
  drag(game, game.ids.BTSlotRejuvHandleBR, 70.5, 0);
  near(slot(game, 'r').scale, 1.5, 'corner scale', 0.01);
  game.click('BTSlotRiftSideL');
  assert.equal(slot(game, 'f').panel.classes.has('bt-side-l'), true, 'side arrow applied');
  game.click('BTSlotBuffIconToggle');
  assert.equal(slot(game, 'b').panel.classes.has('bt-side-n'), true, 'icon toggle hides the Bridge icon');
  game.click('BTSlotBuffIconToggle');
  assert.equal(slot(game, 'b').panel.classes.has('bt-side-r'), true, 'icon toggle shows it again');
  game.click('BTLayoutDone');
  assert.equal(game.ids.TimerOverlayFrame.classes.has('bt-layout-edit'), false, 'DONE leaves edit mode');
  game.advance(2000);
  const raw = profile.disk.get(KEY);
  assert.ok(raw, 'layout saved');
  const t = JSON.parse(raw.slice(14)).t;
  assert.ok(t && t.b && t.r && t.f, 'saved record has the three edited widgets');
  saved = { profile, b: slot(game, 'b'), r: slot(game, 'r') };
});

step('minified scripts restore the saved layout after a restart', () => {
  const game = ready(saved.profile);
  near(slot(game, 'b').x, saved.b.x, 'restored x');
  near(slot(game, 'b').y, saved.b.y, 'restored y');
  near(slot(game, 'r').scale, 1.5, 'restored scale', 0.01);
  assert.equal(slot(game, 'f').panel.classes.has('bt-side-l'), true, 'restored side');
  assert.equal(game.stats.writes, 0, 'restoring does not write');
});

step('minified scripts move and resize the minimap from its border, save it and restore it', () => {
  const profile = createProfile();
  const game = ready(profile);
  game.toggleMenu();
  game.click('BTLayoutButton');
  game.advance(300);
  const outline = () => parseFloat(game.ids.BTSlotMapOutline.style.width);
  near(outline(), 420, 'the minimap border has the minimap size');
  assert.equal(game.ids.BTSlotMapGrab.draggable, true, 'the minimap is draggable while editing');
  // Move 600 left and 300 up (#minimap_persp from layout (1480, 545)), then the bottom-right corner out by 210: 150%
  // around the minimap's top-left (890, 335). The border follows at once.
  drag(game, game.ids.BTSlotMapGrab, -600, -300);
  const style = game.persp.style;
  assert.deepEqual([style.horizontalAlign, style.verticalAlign, style.position], ['left', 'top', '880px 245px 0px'], 'the minimap moves');
  drag(game, game.ids.BTSlotMapHandleBR, 210, 210);
  assert.equal(style.uiScale, '150%', 'the minimap scales');
  assert.equal(style.position, '875px 200px 0px', 'resizing keeps the opposite corner');
  near(outline(), 630, 'the border follows the new size');
  game.advance(300);
  near(slot(game, 'r').scale, 1.5, 'an untouched widget scales with the minimap', 0.01);
  near(slot(game, 'r').x, 875 + 30.8 * 1.5, 'an untouched widget travels with the minimap');
  game.click('BTLayoutDone');
  game.advance(2000);
  const t = JSON.parse(profile.disk.get(KEY).slice(14)).t;
  assert.equal(t.m, 1.5, 'the size is saved');
  assert.ok(Array.isArray(t.mp) && t.mp.length === 2, 'the spot is saved');
  const again = ready(profile);
  assert.equal(again.persp.style.uiScale, '150%', 'the saved size is restored');
  assert.equal(again.persp.style.position, '875px 200px 0px', 'the saved spot is restored');
  again.toggleMenu();
  again.click('BTLayoutButton');
  again.click('BTLayoutReset');
  assert.equal(again.persp.style.uiScale, null, 'RESET LAYOUT returns the stock size');
  assert.equal(again.persp.style.position, null, 'RESET LAYOUT returns the stock spot');
  again.click('BTLayoutCancel');
  assert.equal(again.persp.style.uiScale, '150%', 'CANCEL keeps the saved size');
});

// The stock #minimap_location label (harness: 150x22, centre at layer (1820, 1009), stock turn -30deg).
step('minified scripts move and turn the map location label, save it and hand it back on RESET', () => {
  const profile = createProfile();
  const game = ready(profile);
  game.toggleMenu();
  game.click('BTLayoutButton');
  game.advance(300);
  assert.equal(game.persp.classes.has('in_map_district'), true, 'editing shows the label');
  assert.equal(game.ids.BTSlotLocChrome.style.preTransformRotate2d, '-30deg', 'the dashed box is turned like the label');
  drag(game, game.ids.BTSlotLocGrab, -200, -150);
  const style = game.location.style;
  assert.equal(style.transform, 'translate3d(-200px, -150px, 0px)', 'the label moves');
  assert.equal(style.preTransformRotate2d, '-30deg', 'and keeps the stock turn');
  // Knob to straight right of the label centre (1620, 859): a quarter turn clockwise.
  const knob = /^(-?[\d.]+)px (-?[\d.]+)px/.exec(String(game.ids.BTSlotLocRotate.style.position));
  assert.ok(knob, 'the knob is placed');
  drag(game, game.ids.BTSlotLocRotate, 1720 - (Number(knob[1]) + 6), 859 - (Number(knob[2]) + 6));
  assert.equal(style.preTransformRotate2d, '90deg', 'the knob turns the label');
  game.click('BTLayoutDone');
  game.advance(2000);
  const saved = JSON.parse(profile.disk.get(KEY).slice(14));
  assert.equal(saved.s, 6);
  assert.deepEqual(saved.t.lc, [-200, -150, 90], 'the label is saved');
  assert.equal(game.persp.classes.has('in_map_district'), false, 'DONE hides the label outside a district again');
  const again = ready(profile);
  assert.equal(again.location.style.transform, 'translate3d(-200px, -150px, 0px)', 'the saved label is restored');
  assert.equal(again.location.style.preTransformRotate2d, '90deg', 'the saved turn is restored');
  again.toggleMenu();
  again.click('BTLayoutButton');
  again.click('BTLayoutReset');
  assert.equal(again.location.style.transform, null, 'RESET LAYOUT hands the label back to the stock CSS');
  assert.equal(again.location.style.preTransformRotate2d, null, 'RESET LAYOUT hands the turn back');
});

step('minified settings hide the minimap border, fade it, dim a colour, save them and hand stock back on RESET', () => {
  const profile = createProfile();
  const game = ready(profile);
  game.toggleMenu();
  game.click('BTBorderToggle');
  assert.equal(game.minimapFrame.style.visibility, 'collapse', 'ring frame hidden');
  assert.equal(game.minimapBlur.style.visibility, 'collapse', 'blur backdrop hidden');
  game.click('BTBorderToggle');
  assert.notEqual(game.minimapFrame.style.visibility, 'collapse', 'border back on shows the ring');
  assert.notEqual(game.minimapBlur.style.visibility, 'collapse', 'border back on shows the blur');
  game.click('BTBorderToggle');
  assert.equal(game.minimapFrame.style.visibility, 'collapse', 'border off again');
  game.ids.BTMapOpacity.drag(70);
  assert.equal(game.minimapContainer.style.opacity, '0.7', 'minimap faded');
  game.click('BTAllyColor');
  game.advance(100);
  assert.equal(game.ids.BTBrightness.value, 100, 'brightness seeded from the row colour');
  game.ids.BTBrightness.drag(0);
  game.click('BTColorHexEntry', 'onblur');
  game.ids.BTBrightness.drag(100);
  assert.equal(game.ids.BTAllyColorHex.text, '#64FFC8', 'black and back keeps the hue, even after an unchanged hex blur');
  game.ids.BTBrightness.drag(50);
  assert.equal(game.ids.BTAllyColorHex.text, '#328064', 'brightness halves the colour');
  assert.equal(game.ids.BTBrightnessValue.text, '50%');
  game.advance(2000);
  const body = JSON.parse(profile.disk.get(KEY).slice(14));
  assert.equal(body.b, 0, 'borderless saved');
  assert.equal(body.o, 70, 'opacity saved');
  assert.equal(body.c.a, '#328064', 'dimmed colour saved');
  game.reset();
  assert.notEqual(game.minimapFrame.style.visibility, 'collapse', 'RESET shows the frame again');
  assert.equal(game.minimapContainer.style.opacity, null, 'RESET restores the opacity');
});

// Failure mode: Closure renames an engine-owned fontSize setter absent from the timer externs; source tests pass,
// but the shipped script either throws and removes the '?' or writes no actual font size.
step('minified timer paints and expires an enemy disappearance mark with its engine font size', () => {
  const game = launch(createProfile(), { withTimer: true, clock: '12:00' });
  game.advance(2500);
  const marker = game.markers.up;
  marker.RemoveClass('active');
  game.advance(1600);
  const labels = game.ids.BTLingerLayer.Children().filter(panel => panel.text === '?' && panel.IsValid());
  assert.equal(labels.length, 1, 'one enemy disappearance produces one question mark');
  const label = labels[0];
  assert.match(label.style.fontSize, /^\d+(?:\.\d+)?px$/, 'font size uses the engine property after Closure');
  assert.ok(label.classes.has('active'), 'the question mark is shown');
  game.advance(5500);
  assert.ok(!label.IsValid(), 'the mark expires');
});

fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
fs.writeFileSync(path.join(root, '.tmp', 'bt-closure-layout.json'), JSON.stringify({ scripts: dir, passed: transcript }, null, 2));
console.log(`[BT CLOSURE PASS] ${transcript.length} scenarios on minified scripts; artifact .tmp/bt-closure-layout.json`);
