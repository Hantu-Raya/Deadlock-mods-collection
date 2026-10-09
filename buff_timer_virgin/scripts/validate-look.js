#!/usr/bin/env node
'use strict';

// End-to-end check of the colour-blind colours and the bridge glow strength: both real scripts (timer first, shared $)
// against the real /bt/ store page. Writes .tmp/bt-look-e2e.json.
// Failure modes covered: a picked colour not reaching the claim box, its ring or the glow; the enemy glow ignoring the
// enemy colour or not handing back to the buff colour; strength not dimming or not extending the glow; the shared
// editor opening far from the row being edited; colours or strength not saved, saved when unchanged, not restored, or
// pushing the record past the page limit; malformed colour data applied instead of blocking; RESET leaving colours;
// the borderless minimap or the minimap opacity not reaching the stock panels, not saved or restored, touching stock
// panels while at their defaults, or not handed back to stock by RESET or when the settings script goes away; saves of
// the removed minimap glow not loading; brightness (see its scenario).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, KEY, createProfile, record, launch } = require('./bt-test-harness.js');

const transcript = [];
const step = (name, fn) => { fn(); transcript.push(name); };

function ready(options = {}) {
  const profile = options.profile || createProfile();
  const game = launch(profile, Object.assign({ withTimer: true, clock: '10:00' }, options));
  game.advance(2500);
  return { game, profile };
}
const ROW_KEY = { BTAllyColor: 'ally', BTEnemyColor: 'enemy', BTGlowGunColor: 'gun', BTGlowCastingColor: 'casting',
  BTGlowSurvivalColor: 'survival', BTGlowMovementColor: 'movement' };
function pickColor(game, row, hex) {
  if (game.state().picker !== ROW_KEY[row]) game.click(row);
  game.ids.BTColorHexEntry.text = hex;
  game.click('BTColorHexEntry', 'ontextentrysubmit');
}
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
// Inline glow gradient: from colour/alpha, reach (% of the panel width), mid-stop alpha.
function glow(game, side) {
  const text = String(game.ids[side === 0 ? 'MinimapGlowLeft' : 'MinimapGlowRight'].style.backgroundColor || '');
  const from = /from\(rgba\((\d+),(\d+),(\d+),([\d.]+)\)\)/.exec(text);
  const reach = /^gradient\(linear, (?:0|100)% 50%, ([\d.]+)% 50%/.exec(text);
  const mid = /color-stop\([\d.]+, rgba\(\d+,\d+,\d+,([\d.]+)\)\)/.exec(text);
  assert.ok(from && reach && mid, `glow ${side} has an inline gradient: "${text}"`);
  return { rgb: from.slice(1, 4).join(','), alpha: Number(from[4]), reach: side === 0 ? Number(reach[1]) : 100 - Number(reach[1]), mid: Number(mid[1]) };
}
function claimPaint(game, side) {
  const suffix = side === 0 ? 'Left' : 'Right';
  const bg = String(game.ids[`ClaimBg${suffix}`].style.backgroundColor || '');
  const ring = String(game.ids[`ClaimRing${suffix}`].style.borderColor || '');
  return { bg, ring };
}
const savedBody = (profile) => JSON.parse(profile.disk.get(KEY).slice(14));
const near = (actual, expected, message, tolerance = 0.011) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

step('defaults paint today\'s colours on claims and glows', () => {
  const { game } = ready();
  game.timer.setClaimSide(0, true, false, 'powerup_gun', 100000);
  game.timer.writeSideGlow(0, 'powerup_gun', false);
  game.advance(300);
  const paint = claimPaint(game, 0);
  assert.match(paint.bg, /from\(rgba\(100,255,200,0\.3\)\)/, 'ally claim background');
  assert.equal(paint.ring, 'rgba(100,255,200,0.9)', 'ally claim ring');
  const g = glow(game, 0);
  assert.deepEqual([g.rgb, g.alpha, g.reach, g.mid], ['255,180,80', 0.9, 60, 0.3], 'Weapon glow at 100%');
});

step('picked colours reach the claim boxes, the enemy glow and each buff glow; the editor opens under its row', () => {
  const { game } = ready();
  game.toggleMenu();
  const ALLY = '#3D7DFF';
  const ENEMY = '#FF9A3D';
  const WEAPON = '#FFFFFF';
  pickColor(game, 'BTAllyColor', ALLY);
  const kids = () => game.ids.BTSettingsPanel.Children().map((child) => child.id);
  assert.equal(kids()[kids().indexOf('BTAllyColor') + 1], 'BTColorEditor', 'the editor sits right under the Ally row');
  pickColor(game, 'BTEnemyColor', ENEMY);
  pickColor(game, 'BTGlowGunColor', WEAPON);
  assert.equal(kids()[kids().indexOf('BTGlowGunColor') + 1], 'BTColorEditor', 'the editor follows the selected row');
  assert.equal(game.ids.BTAllyColorHex.text, ALLY);
  assert.equal(game.ids.BTGlowGunColorSwatch.style.backgroundColor, WEAPON, 'row swatch shows the colour');
  game.timer.setClaimSide(0, true, false, 'powerup_gun', 100000);
  game.timer.setClaimSide(1, true, true, 'powerup_gun', 100000);
  game.timer.writeSideGlow(0, 'powerup_gun', false);
  game.timer.writeSideGlow(1, 'powerup_gun', true);
  game.advance(300);
  assert.match(claimPaint(game, 0).bg, new RegExp(`rgba\\(${rgb(ALLY)},0\\.3\\)`), 'ally claim uses the ally colour');
  assert.equal(claimPaint(game, 0).ring, `rgba(${rgb(ALLY)},0.9)`);
  assert.equal(claimPaint(game, 1).ring, `rgba(${rgb(ENEMY)},0.9)`, 'enemy claim uses the enemy colour');
  assert.equal(glow(game, 0).rgb, rgb(WEAPON), 'Weapon glow uses its colour');
  const enemy = glow(game, 1);
  assert.deepEqual([enemy.rgb, enemy.alpha], [rgb(ENEMY), 1], 'enemy claim glow uses the enemy colour');
  game.advance(3200);
  assert.equal(glow(game, 1).rgb, rgb(WEAPON), 'after the enemy flash the buff colour returns');
  // A later colour change repaints what is showing.
  pickColor(game, 'BTGlowGunColor', '#00FF00');
  game.advance(300);
  assert.equal(glow(game, 0).rgb, '0,255,0', 'a live glow repaints on change');
});

step('glow strength dims below 100% and reaches further above it', () => {
  const { game } = ready();
  game.toggleMenu();
  game.timer.writeSideGlow(0, 'powerup_survival', false);
  const slider = game.ids.BTGlowStrength;
  assert.ok(slider, 'strength slider exists');
  assert.equal(game.ids.BTGlowStrengthValue.text, '100%');
  slider.drag(50);
  game.advance(300);
  let g = glow(game, 0);
  near(g.alpha, 0.45, '50% edge alpha');
  near(g.mid, 0.15, '50% mid alpha');
  assert.equal(g.reach, 60, '50% keeps the reach');
  assert.equal(game.ids.BTGlowStrengthValue.text, '50%');
  slider.drag(150);
  game.advance(300);
  g = glow(game, 0);
  near(g.alpha, 0.9, '150% edge alpha stays full');
  near(g.mid, 0.45, '150% mid alpha');
  assert.equal(g.reach, 85, '150% reaches further');
  slider.drag(5);
  game.advance(300);
  assert.equal(game.ids.BTGlowStrengthValue.text, '10%', 'strength clamps at 10%');
});

step('colours and strength save only when changed, restore after restart and fit the page limit', () => {
  const { game, profile } = ready();
  game.toggleMenu();
  game.toggleMenu();
  game.advance(2000);
  assert.equal(game.stats.writes, 0, 'nothing changed, nothing written');
  game.toggleMenu();
  pickColor(game, 'BTEnemyColor', '#FF9A3D');
  game.ids.BTGlowStrength.drag(120);
  game.advance(2000);
  const body = savedBody(profile);
  assert.equal(body.s, 6, 'schema 6');
  assert.deepEqual(body.c, { e: '#FF9A3D' }, 'only the changed colour is stored');
  assert.equal(body.k, 120);
  const again = ready({ profile }).game;
  assert.equal(again.state().colors.enemy, '#FF9A3D', 'colour restored');
  assert.equal(again.state().strength, 120, 'strength restored');
  again.timer.writeSideGlow(1, 'powerup_gun', true);
  again.advance(300);
  assert.equal(glow(again, 1).rgb, rgb('#FF9A3D'), 'restored colour is painted');
  assert.equal(again.stats.writes, 0, 'restoring does not write');
  // Worst case: every colour changed, strength set, all six widgets moved, the minimap moved and resized and the
  // location label moved and turned still fits the page's 512 chars.
  const t = {};
  for (const key of ['b', 'r', 'f', 'u', 'cl', 'cr']) t[key] = [0.1234, 0.5678, 1.25, 'r'];
  for (const key of ['f', 'u', 'cl', 'cr']) t[key][3] = 't';
  t.m = 1.35;
  t.mp = [0.12345, 0.56789];
  t.lc = [-999.9, -999.9, -165];
  const full = record(JSON.stringify({ s: 6, u: '#111111', d: '#222222', l: 0, g: 0, t,
    c: { a: '#333333', e: '#444444', w: '#555555', p: '#666666', v: '#777777', m: '#888888' }, k: 150, b: 0, o: 25 }));
  const big = createProfile({ [KEY]: full });
  const worst = ready({ profile: big }).game;
  assert.equal(worst.state().phase, 'ready', 'worst-case record loads');
  worst.toggleLinger();
  worst.advance(2000);
  assert.equal(worst.state().status, 'SAVED', 'worst-case record is accepted by the page');
  assert.ok(big.disk.get(KEY).length <= 512, `record length ${big.disk.get(KEY).length} <= 512`);
});

step('malformed colours or strength block like other damage; RESET restores colours and strength', () => {
  for (const bad of ['{"s":4,"u":"#111111","d":"#222222","l":1,"g":1,"c":{"x":"#FFFFFF"}}',
    '{"s":4,"u":"#111111","d":"#222222","l":1,"g":1,"c":{"a":"blue"}}',
    '{"s":4,"u":"#111111","d":"#222222","l":1,"g":1,"k":5}',
    '{"s":4,"u":"#111111","d":"#222222","l":1,"g":1,"k":"150"}']) {
    const game = ready({ profile: createProfile({ [KEY]: record(bad) }) }).game;
    assert.equal(game.state().phase, 'blocked', `malformed ${bad} blocks`);
    assert.equal(game.state().colors.ally, '#64FFC8', 'malformed colours are not applied');
  }
  const ok = ready({ profile: createProfile({ [KEY]: record('{"s":4,"u":"#111111","d":"#222222","l":1,"g":1}') }) }).game;
  assert.equal(ok.state().phase, 'ready', 'schema 4 without c/k is valid');
  assert.equal(ok.state().strength, 100);
  const { game, profile } = ready({ profile: createProfile({ [KEY]: record(
    '{"s":4,"u":"#111111","d":"#222222","l":1,"g":1,"t":{"u":[0.25,0.5,1,"t"]},"c":{"a":"#0000FF"},"k":50}') }) });
  assert.equal(game.state().colors.ally, '#0000FF');
  game.toggleMenu();
  game.reset();
  assert.equal(game.state().colors.ally, '#64FFC8', 'RESET restores the ally colour');
  assert.equal(game.state().strength, 100, 'RESET restores the strength');
  game.advance(2000);
  const body = savedBody(profile);
  assert.equal(body.c, undefined, 'default colours store nothing');
  assert.equal(body.k, undefined, 'default strength stores nothing');
  assert.ok(body.t && body.t.u, 'RESET keeps the layout');
});

// Stock state of the panels the minimap look touches: ring and blur shown (nothing inline, or "visible" once hidden),
// no inline opacity.
const shown = (panel) => [undefined, null, 'visible'].includes(panel.style.visibility);
function expectStockMinimapLook(game, message) {
  assert.ok(shown(game.minimapFrame), `${message}: ring frame is shown`);
  assert.ok(shown(game.minimapBlur), `${message}: blur backdrop is shown`);
  assert.ok(!game.minimapContainer.style.opacity, `${message}: minimap opacity is stock`);
}
step('a borderless minimap and the minimap opacity apply live, save only when changed and restore', () => {
  const { game, profile } = ready();
  expectStockMinimapLook(game, 'defaults');
  game.toggleMenu();
  const toggle = game.ids.BTBorderToggle;
  assert.ok(toggle, 'the menu has a minimap border switch');
  assert.equal(toggle.classes.has('on'), true, 'the border is on by default');
  const slider = game.ids.BTMapOpacity;
  assert.ok(slider, 'the menu has a minimap opacity slider');
  assert.equal(slider.GetParent(), game.ids.BTMapOpacityHost);
  assert.equal(slider.value, 100);
  assert.equal(game.ids.BTMapOpacityValue.text, '100%');

  game.click('BTBorderToggle');
  assert.equal(toggle.classes.has('on'), false, 'the switch shows the border off');
  assert.equal(game.minimapFrame.style.visibility, 'collapse', 'the ring frame is hidden');
  assert.equal(game.minimapBlur.style.visibility, 'collapse', 'the blur backdrop is hidden');
  assert.ok(!game.minimap.style.visibility, 'the map itself stays');
  // Live 2026-10-09: switching the border back on left the ring hidden.
  game.click('BTBorderToggle');
  assert.equal(toggle.classes.has('on'), true, 'the switch shows the border on again');
  expectStockMinimapLook(game, 'border back on');
  game.click('BTBorderToggle');
  assert.equal(game.minimapFrame.style.visibility, 'collapse', 'and off again');
  slider.drag(60);
  assert.equal(game.minimapContainer.style.opacity, '0.6', 'the whole minimap fades');
  assert.equal(game.ids.BTMapOpacityValue.text, '60%');
  slider.drag(5);
  assert.equal(game.minimapContainer.style.opacity, '0.2', 'opacity clamps at 20%');
  slider.drag(65);
  game.advance(2000);
  const body = savedBody(profile);
  assert.equal(body.b, 0, 'borderless is saved');
  assert.equal(body.o, 65, 'opacity is saved');

  const again = ready({ profile }).game;
  assert.equal(again.minimapFrame.style.visibility, 'collapse', 'borderless is restored');
  assert.equal(again.minimapContainer.style.opacity, '0.65', 'opacity is restored');
  assert.equal(again.stats.writes, 0, 'restoring does not write');
  again.toggleMenu();
  assert.equal(again.ids.BTBorderToggle.classes.has('on'), false);
  assert.equal(again.ids.BTMapOpacity.value, 65);
  again.reset();
  expectStockMinimapLook(again, 'after RESET');
  again.advance(2000);
  const reset = savedBody(profile);
  assert.equal(reset.b, undefined, 'a stock border stores nothing');
  assert.equal(reset.o, undefined, 'full opacity stores nothing');
});

step('the minimap look is handed back to stock when the settings script goes away, not when it is replaced', () => {
  const profile = createProfile({ [KEY]: record('{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"b":0,"o":50}') });
  // A fast store: the successor applies its look before the replaced instance's loop notices and stops.
  const { game } = ready({ profile, navSec: 0.001, replySec: 0.001, echoSec: null });
  assert.equal(game.minimapContainer.style.opacity, '0.5');
  game.bootSecond();
  game.advance(20);
  assert.equal(game.state().phase, 'ready', 'the successor has applied the save');
  game.advance(3000);
  assert.equal(game.minimapFrame.style.visibility, 'collapse', 'a replaced script leaves its successor\'s look alone');
  assert.equal(game.minimapContainer.style.opacity, '0.5');
  game.minimap.deleted = true;
  game.advance(1000);
  expectStockMinimapLook(game, 'after the HUD goes away');
  for (const bad of ['{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"b":2}',
    '{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"o":10}',
    '{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"o":"60"}']) {
    const blocked = ready({ profile: createProfile({ [KEY]: record(bad) }) }).game;
    assert.equal(blocked.state().phase, 'blocked', `malformed ${bad} blocks`);
    expectStockMinimapLook(blocked, 'malformed look');
  }
});

// The minimap glow of one 2026-10-09 build was removed. Its saves ("h" strength, "c"."h" colour) still load; the next
// save drops them.
step('a save from the removed minimap-glow build still loads and drops the glow keys on the next save', () => {
  const legacy = '{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"b":0,"o":60,"h":150,"c":{"a":"#123456","h":"#FF4D4D"}}';
  const profile = createProfile({ [KEY]: record(legacy) });
  const { game } = ready({ profile });
  assert.equal(game.state().phase, 'ready', 'the legacy save is readable');
  assert.equal(game.ids.BTMapBackdrop, undefined, 'no glow panel is built');
  assert.equal(game.ids.BTMapBackdropLayer, undefined, 'no glow layer is built');
  game.timer.setClaimSide(0, true, false, 'powerup_gun', 100000);
  game.advance(300);
  assert.match(claimPaint(game, 0).bg, /from\(rgba\(18,52,86,0\.3\)\)/, 'its other colours apply');
  game.toggleMenu();
  game.ids.BTMapOpacity.drag(70);
  game.advance(2000);
  const body = savedBody(profile);
  assert.equal(body.h, undefined, 'the glow strength is dropped');
  assert.deepEqual(body.c, { a: '#123456' }, 'the glow colour is dropped');
  assert.equal(body.b, 0, 'the border setting is kept');
  for (const bad of ['{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"c":{"z":"#FF4D4D"}}',
    '{"s":5,"u":"#111111","d":"#222222","l":1,"g":1,"c":{"a":"red"}}']) {
    const blocked = ready({ profile: createProfile({ [KEY]: record(bad) }) }).game;
    assert.equal(blocked.state().phase, 'blocked', `malformed ${bad} still blocks`);
  }
});

// Brightness (HSV value) of the colour being edited. Failure modes: no slider; dragging changes the hue or does
// nothing; dimming to black and back loses the hue; the slider's own echo (after a row, preset, hex or spectrum
// pick) rewrites the colour; the value label or slider not following a new pick; one row's colour leaking into the
// next row; a dimmed colour not saved or not reaching the timer; dragging while the save is still loading.
const brightness = (game) => game.ids.BTBrightness;
step('brightness dims or brightens the edited colour, keeps its hue, and follows every other pick', () => {
  const { game, profile } = ready();
  game.toggleMenu();
  pickColor(game, 'BTAllyColor', '#64FFC8');
  const slider = brightness(game);
  assert.ok(slider, 'the colour editor has a brightness slider');
  assert.equal(slider.parent.id, 'BTBrightnessHost');
  assert.deepEqual([slider.min, slider.max], [0, 100], 'brightness runs 0-100%');
  game.advance(100);
  assert.equal(slider.value, 100, 'a full-value colour shows 100%');
  assert.equal(game.ids.BTBrightnessValue.text, '100%');
  assert.equal(game.state().colors.ally, '#64FFC8', 'seeding the slider leaves the colour alone');

  slider.drag(50);
  assert.equal(game.state().colors.ally, '#328064', '50% halves every channel (same hue)');
  assert.equal(game.ids.BTAllyColorHex.text, '#328064', 'the row shows the dimmed colour');
  assert.equal(game.ids.BTColorHexEntry.text, '#328064', 'the hex box shows it too');
  assert.equal(game.ids.BTBrightnessValue.text, '50%');
  game.advance(100);
  assert.equal(game.state().colors.ally, '#328064', 'the echo of a drag changes nothing');
  slider.drag(0);
  assert.equal(game.state().colors.ally, '#000000', '0% is black');
  slider.drag(100);
  assert.equal(game.state().colors.ally, '#64FFC8', 'back to 100% brings the hue back');
  // The hex box shows the dimmed colour; focusing and leaving it unchanged (blur commits) is not a new pick.
  slider.drag(0);
  game.click('BTColorHexEntry', 'onblur');
  slider.drag(100);
  assert.equal(game.state().colors.ally, '#64FFC8', 'an unchanged hex blur keeps the hue (GPT-6.1-Sol audit)');
  slider.drag(30);
  game.timer.setClaimSide(0, true, false, 'powerup_gun', 100000);
  game.advance(300);
  const dim = game.state().colors.ally;
  assert.equal(dim, '#1E4D3C');
  assert.match(claimPaint(game, 0).bg, /from\(rgba\(30,77,60,0\.3\)\)/, 'the dimmed colour reaches the claim box');

  // A dim colour can also be brightened past what it was picked at.
  game.ids.BTColorHexEntry.text = '#402010';
  game.click('BTColorHexEntry', 'ontextentrysubmit');
  game.advance(100);
  assert.equal(slider.value, 25, 'a typed colour reseeds the slider');
  assert.equal(game.state().colors.ally, '#402010', 'and its echo keeps the typed colour');
  slider.drag(100);
  assert.equal(game.state().colors.ally, '#FF8040', 'brightening scales up to full value');

  // A preset and the spectrum reseed it too; the next row starts from its own colour.
  game.click('BTPreset3');
  game.advance(100);
  assert.equal(game.state().colors.ally, '#FF4D4D');
  assert.equal(slider.value, 100, 'a preset reseeds the slider');
  game.ids.BTSpectrum.drag(40);
  game.advance(100);
  assert.equal(slider.value, Math.round(Math.max(...rgb(game.state().colors.ally).split(',').map(Number)) / 2.55),
    'a spectrum pick reseeds the slider');
  slider.drag(60);
  const allyFinal = game.state().colors.ally;
  game.click('BTEnemyColor');
  game.advance(100);
  assert.equal(slider.value, 100, 'the next row shows its own brightness');
  slider.drag(80);
  assert.equal(game.state().colors.enemy, '#CC2828', 'the next row dims its own colour');
  assert.equal(game.state().colors.ally, allyFinal, 'the previous row keeps its colour');
  game.advance(2000);
  const body = savedBody(profile);
  assert.equal(body.c.e, '#CC2828', 'a dimmed colour is saved');
  assert.equal(body.c.a, allyFinal);

  // Arrows too (top-level record keys).
  game.click('BTUpColor');
  slider.drag(50);
  assert.equal(game.state().colors.up, '#807127', 'the arrow colour dims');
  game.advance(2000);
  assert.equal(savedBody(profile).u, '#807127');
});

step('brightness is inert while the save is still loading', () => {
  const profile = createProfile();
  const game = launch(profile, { withTimer: true, clock: '10:00' });
  game.toggleMenu();
  game.click('BTAllyColor');
  const slider = brightness(game);
  if (slider) slider.drag(10);
  assert.equal(game.state().colors.ally, '#64FFC8', 'no edit before the save is read');
  game.advance(2500);
  assert.equal(game.state().colors.ally, '#64FFC8');
});

fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
fs.writeFileSync(path.join(root, '.tmp', 'bt-look-e2e.json'), JSON.stringify({ passed: transcript }, null, 2));
console.log(`[BT LOOK PASS] ${transcript.length} end-to-end scenarios; artifact .tmp/bt-look-e2e.json`);
