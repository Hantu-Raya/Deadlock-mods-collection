#!/usr/bin/env node
'use strict';

// End-to-end check of the pak98 minimap settings script and its durable save. It boots the real
// settings script against the real hpv2-store /bt/ page (D:/hpv2-store/bt/index.html) behind a
// fake CEF panel and a persistent disk Map, then writes .tmp/bt-settings-e2e.json.
// Failure modes covered: hydration and restart, enemy-only arrow washes and direction flips,
// inline colour editor (one-click presets, spectrum click/drag with seed echoes ignored, hex entry
// that releases keyboard focus), schema migration and blocked RESET, offline/untrusted pages,
// throttled and retried writes, class-only timer integration, host generations and hideout scans.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  root, read, source, timerSource, settingsLayout, PAGE_PATH, pageSource, PAGE_URL, KEY, HPV2_KEYS, panelIds,
  makePanel, makeMarker, setArrow, createProfile, record, launch,
} = require('./bt-test-harness.js');
const hudPath = path.join(root, 'buff_timer_virgin', 'panorama', 'layout', 'hud.xml');
const minimapLayout = read('panorama', 'layout', 'hud_minimap.xml');
const arrowsCss = read('panorama', 'styles', 'bt_minimap_arrows.css');
const claimCss = read('panorama', 'styles', 'buff_claim.css');
const transcript = [];

for (const id of panelIds) {
  assert.match(settingsLayout, new RegExp(`\\bid="${id}"`), `settings layout must declare #${id}`);
  if (id !== 'BTSettingsRoot') assert.match(source, new RegExp(`"${id}"`), `PANEL_IDS must bind #${id}`);
}
assert.doesNotMatch(settingsLayout, /<scripts\b|onactivate\s*=/i, 'settings layout must be script-less and event-less');
assert.match(settingsLayout, /<CitadelHTMLPanel id="BTSettingsStore"/);
assert.doesNotMatch(settingsLayout, /CitadelColorPicker|BTPicker|Backdrop/, 'the colour editor is inline: no modal popup or 2-D picker');
const settingsCss = read('panorama', 'styles', 'bt_minimap_settings.css');
assert.doesNotMatch(settingsCss, /box-shadow:(?!\s*none\s*;)|clip-path/, 'Panorama-safe CSS only (box-shadow may only be reset to none)');
assert.match(settingsCss, /bt-spectrum\.HorizontalSlider #SliderTrack[^{]*\{[^}]*padding: 0px;/, 'the stock 10px track padding is cleared so the thumb lines up with the drawn gradient');
assert.match(settingsCss, /switch_background\.vsvg/, 'toggles reuse the stock settings switch art');
// The script maps slider positions with the same stops the CSS draws (stock settings_color_slider.css).
const SPECTRUM_CSS = 'from( #000000 ), color-stop( 0.08, #ff0000 ), color-stop( 0.22, #ffff00 ), color-stop( 0.36, #00ff00 ), color-stop( 0.50, #00ffff ), color-stop( 0.64, #0000ff ), color-stop( 0.78, #ff00ff ), color-stop( 0.92, #ff0000 ), to( #ffffff )';
assert.ok(settingsCss.includes(SPECTRUM_CSS), 'spectrum track uses the stock colour-slider gradient');
assert.match(settingsLayout, /src="s2r:\/\/panorama\/images\/icons\/settings_global\.vsvg"/);
assert.equal(fs.existsSync(hudPath), false, 'pak98 must not ship hud.xml');
assert.match(minimapLayout, /rejuvnbufftimer\.vjs_c/, 'minimap loads the timer script');
assert.match(minimapLayout, /bt_minimap_settings\.vjs_c/, 'minimap loads the settings script');
assert.ok(
  minimapLayout.indexOf('rejuvnbufftimer.vjs_c') < minimapLayout.indexOf('bt_minimap_settings.vjs_c'),
  'timer must load before minimap settings',
);
assert.match(minimapLayout, /bt_minimap_arrows\.vcss_c/, 'minimap loads the arrow stylesheet');
const defaultUp = source.match(/key: "up",[^}]*def: "(#[0-9A-F]{6})"/)[1];
const defaultDown = source.match(/key: "down",[^}]*def: "(#[0-9A-F]{6})"/)[1];
assert.match(arrowsCss, new RegExp(`arrowUp #LocalSpecularImage[^}]*wash-color: ${defaultUp};`));
assert.match(arrowsCss, new RegExp(`arrowDown #LocalSpecularImage\\s*\\{[^}]*wash-color: ${defaultDown};`));
assert.doesNotMatch(arrowsCss, /bt-(up|down)-\d/, 'colours are inline washes, not palette classes');
assert.match(claimCss, /#MinimapGlowClip\.bt-glow-off\s*\{\s*visibility: collapse;/);

function step(name, fn) {
  fn();
  transcript.push(name);
}

step('fresh profile hydrates, saves picked colours once, and repaints them on the arrows after restart', () => {
  const profile = createProfile();
  const game = launch(profile);
  assert.equal(game.state().phase, 'hello');
  game.toggleMenu();
  assert.equal(game.ids.BTSettingsPanel.classes.has('loading'), true, 'menu is locked while loading');
  game.openPicker('up');
  assert.equal(game.state().picker, '', 'the popup cannot open before hydration');
  game.advance(2000);
  assert.equal(game.state().phase, 'ready');
  assert.equal(game.state().status, 'DEFAULTS');
  assert.equal(game.state().markers, 2, 'hideout scan discovers enemy markers without the timer loop');
  assert.deepEqual(game.washes(), { up: '#FFE14D', down: '#4DD2FF', ally: undefined }, 'the settings loop paints defaults on enemies only');
  game.pick('up', '#112233');
  game.pick('down', '#A0B0C0');
  assert.equal(game.state().status, 'SAVING', 'unsaved edits never read SAVED');
  assert.deepEqual(game.washes(), { up: '#112233', down: '#A0B0C0', ally: undefined }, 'applied to arrows immediately');
  assert.equal(game.ids.BTUpColorHex.text, '#112233');
  assert.equal(game.ids.BTUpColorArrow.style.washColor, '#112233', 'the row arrow previews the colour');
  assert.equal(game.stats.writes, 0, 'saving waits for the 1.5 s throttle');
  game.advance(1600);
  assert.equal(game.stats.writes, 1, 'both picks share one write');
  game.advance(500);
  assert.equal(game.state().status, 'SAVED');
  game.toggleMenu();
  game.advance(5000);
  assert.equal(game.stats.writes, 1, 'closing the menu with nothing changed must not write');

  const second = launch(profile);
  second.advance(2000);
  assert.equal(second.state().status, 'SAVED');
  assert.deepEqual([second.state().up, second.state().down, second.state().linger, second.state().glow], ['#112233', '#A0B0C0', true, true]);
  assert.deepEqual(second.washes(), { up: '#112233', down: '#A0B0C0', ally: undefined }, 'restored colours repaint without a minimap change');
  assert.equal(second.stats.writes, 0, 'restoring must not write');
  for (const [key, value] of Object.entries(HPV2_KEYS)) assert.equal(profile.disk.get(key), value, `${key} untouched`);
  assert.ok([...game.stats.keyAccesses, ...second.stats.keyAccesses].every((key) => key === KEY), 'page only touches the BT key');
});

step('the settings loop repaints an arrow when the engine flips its direction', () => {
  const game = launch(createProfile());
  game.advance(2000);
  game.pick('up', '#FF0000');
  game.pick('down', '#0000FF');
  setArrow(game.markers.up, 'arrowDown');
  game.advance(250);
  assert.equal(game.markers.up.image.style.washColor, '#0000FF', 'a direction flip repaints on the next 250 ms tick');
  setArrow(game.markers.up, 'arrowUp');
  game.advance(250);
  assert.equal(game.markers.up.image.style.washColor, '#FF0000');
  assert.equal(game.markers.ally.image.style.washColor, undefined, 'allies are never painted');
});

step('an arrow image the engine replaces is repainted within one marker rescan', () => {
  const game = launch(createProfile());
  game.advance(2000);
  game.pick('down', '#0000FF');
  const marker = game.markers.down;
  marker.image.DeleteAsync(0);
  marker.image = makePanel('LocalSpecularImage', 'Image', marker);
  game.advance(2000);
  assert.equal(marker.image.style.washColor, '#0000FF', 'the new image gets the wash by the next 2 s rescan');
});

step('hideout arrows paint without a timer gate and new enemies update within two seconds', () => {
  const game = launch(createProfile());
  assert.deepEqual(game.washes(), { up: defaultUp, down: defaultDown, ally: undefined }, 'initial loop paints without match time');
  assert.equal(game.minimap.BHasClass('bt-buff-timer'), false, 'timer never booted');
  game.advance(400);
  const newcomer = makeMarker('enemy', 'arrowDown');
  game.mapMarkers.push(newcomer);
  assert.equal(newcomer.image.style.washColor, undefined);
  game.advance(1999);
  assert.equal(newcomer.image.style.washColor, defaultDown, 'new enemy paints by the two-second discovery tick');
  assert.equal(game.state().markers, 3);
});

step('inline editor: one-click presets, spectrum click/drag, hex entry, no modal and no focus trap', () => {
  const profile = createProfile();
  const game = launch(profile);
  game.advance(2000);
  game.toggleMenu();
  game.openPicker('down');
  assert.equal(game.state().picker, 'down');
  assert.equal(game.ids.BTColorEditor.classes.has('open'), true, 'editor opens inside the menu');
  assert.equal(game.ids.BTDownColor.classes.has('selected'), true);
  assert.equal(game.ids.BTUpColor.classes.has('selected'), false);
  assert.equal(game.ids.BTPresetRow.Children().length, 10, 'ten one-click presets');
  assert.equal(game.ids.BTColorHexEntry.text, '#4DD2FF');
  assert.equal(game.ids.BTPreset1.classes.has('selected'), true, 'the current colour is marked');
  game.advance(500);
  assert.ok(game.stats.seedEchoes > 0, 'seeding the spectrum echoes onvaluechanged like the engine');
  assert.equal(game.state().down, '#4DD2FF', 'the seed echo is not a user change');
  assert.equal(game.stats.writes, 0, 'opening the editor writes nothing');

  game.chip(3);
  assert.equal(game.state().down, '#FF4D4D', 'one click applies a preset');
  assert.equal(game.markers.down.image.style.washColor, '#FF4D4D', 'and paints the arrows at once');
  assert.equal(game.ids.BTDownColorArrow.style.washColor, '#FF4D4D');
  assert.equal(game.ids.BTPreset3.classes.has('selected'), true);
  assert.equal(game.ids.BTPreset1.classes.has('selected'), false);
  game.advance(500);
  assert.equal(game.state().down, '#FF4D4D', 'the re-seed echo after a preset keeps the preset');

  for (const [position, expected] of [[80, '#FF0000'], [150, '#FF8000'], [500, '#00FFFF'], [40, '#800000'], [0, '#000000'], [1000, '#FFFFFF']]) {
    game.slide(position);
    assert.equal(game.state().down, expected, `spectrum ${position} matches the drawn gradient`);
    assert.equal(game.ids.BTColorHexEntry.text, expected);
  }
  assert.equal(game.markers.down.image.style.washColor, '#FFFFFF', 'drags preview on the arrows');
  assert.equal(game.stats.writes, 0, 'a drag is not saved per step');
  game.advance(1600);
  assert.equal(game.stats.writes, 1, 'the whole edit burst shares one throttled write');

  game.openPicker('up');
  assert.equal(game.state().picker, 'up', 'the other row retargets the same editor');
  assert.equal(game.ids.BTColorHexEntry.text, '#FFE14D');
  game.typeHex('abc');
  assert.equal(game.state().up, '#AABBCC', 'short hex is expanded and upper-cased');
  assert.equal(game.state().down, '#FFFFFF', 'retargeting never edits the other colour');
  assert.ok(game.stats.dropped.includes('BTColorHexEntry'), 'submitting hex releases keyboard focus back to the game');
  game.typeHex('zz');
  assert.equal(game.state().up, '#AABBCC', 'invalid hex is rejected');
  assert.equal(game.ids.BTColorHexEntry.text, '#AABBCC', 'and the entry shows the current colour again');
  game.openPicker('up');
  assert.equal(game.state().picker, '', 'clicking the open row collapses the editor');
  assert.equal(game.ids.BTColorEditor.classes.has('open'), false);
  game.openPicker('down');
  game.toggleMenu();
  assert.equal(game.state().picker, '', 'closing the menu collapses the editor');
  assert.equal(game.stats.writes, 2, 'closing the menu flushes the pending edit');
  game.advance(2000);
  const saved = launch(profile);
  saved.advance(2000);
  assert.deepEqual([saved.state().up, saved.state().down], ['#AABBCC', '#FFFFFF']);
});

step('typed hex commits to its own row before retargeting, blur commits, Escape reverts and releases focus', () => {
  const game = launch(createProfile());
  game.advance(2000);
  game.toggleMenu();
  game.openPicker('up');
  game.ids.BTColorHexEntry.text = '#123456';
  game.openPicker('down');
  assert.equal(game.state().up, '#123456', 'a draft left in the box belongs to the row it was typed for');
  assert.equal(game.state().down, defaultDown, 'the newly selected row is untouched');
  game.click('BTColorHexEntry', 'onblur');
  assert.equal(game.state().down, defaultDown, 'the late blur after retargeting is a no-op');
  game.ids.BTColorHexEntry.text = '#654321';
  game.click('BTColorHexEntry', 'onblur');
  assert.equal(game.state().down, '#654321', 'clicking away commits a valid draft');
  game.ids.BTColorHexEntry.text = '#00';
  const drops = game.stats.dropped.length;
  game.click('BTColorHexEntry', 'oncancel');
  assert.equal(game.ids.BTColorHexEntry.text, '#654321', 'Escape discards the draft');
  assert.equal(game.state().down, '#654321');
  assert.ok(game.stats.dropped.length > drops, 'Escape hands the keyboard back to the game');
});

step('one write in flight; the latest value wins', () => {
  const profile = createProfile();
  // 3 s replies so a second edit lands while the first write is still in flight.
  const game = launch(profile, { replySec: 3, echoSec: null });
  game.advance(8000);
  assert.equal(game.state().phase, 'ready');
  game.toggleMenu();
  game.pick('up', '#050505');
  game.toggleMenu();
  assert.equal(game.stats.writes, 1, 'close flushes without waiting for the throttle');
  game.toggleMenu();
  game.pick('up', '#060606');
  game.advance(1500);
  assert.equal(game.stats.writes, 1, 'only one write in flight; the edit waits for its ack');
  game.advance(3500);
  assert.equal(game.stats.writes, 2, 'the ack reschedules the newer value');
  game.pick('down', '#090909');
  game.advance(1600);
  assert.equal(game.stats.writes, 2, 'still one write in flight');
  game.advance(1500);
  assert.equal(game.state().status, 'SAVING', 'an ack for an older value must not read SAVED while a newer edit waits');
  game.advance(7000);
  assert.equal(game.stats.writes, 3);
  assert.equal(game.state().status, 'SAVED');
  const saved = launch(profile);
  saved.advance(2000);
  assert.deepEqual([saved.state().up, saved.state().down], ['#060606', '#090909'], 'disk holds the latest value');
});

step('a lost write reply is retried; reverting during the retry still rewrites the old value', () => {
  const profile = createProfile();
  const game = launch(profile, { dropWrite: (n) => n === 2 });
  game.advance(2000);
  game.pick('up', '#444444');
  game.advance(2100);
  assert.equal(game.state().status, 'SAVED');
  game.pick('up', '#666666');
  game.advance(1600);
  assert.equal(game.stats.writes, 2, 'B is sent; the page commits it but the reply is lost');
  game.pick('up', '#444444');
  game.advance(5000);
  assert.equal(game.state().status, 'SAVE RETRYING');
  game.advance(2500);
  assert.equal(game.stats.writes, 3, 'the retry writes A even though A was the last acknowledged value');
  game.advance(1000);
  assert.equal(game.state().status, 'SAVED');
  const saved = launch(profile);
  saved.advance(2000);
  assert.equal(saved.state().up, '#444444', 'disk matches what the player last chose');
});

step('schema-1 palette saves migrate; damaged and newer saves block writes until RESET is confirmed', () => {
  const legacy = createProfile({ [KEY]: record('{"s":1,"u":3,"d":8,"l":0}') });
  const migrated = launch(legacy);
  migrated.advance(2000);
  assert.equal(migrated.state().phase, 'ready');
  assert.deepEqual([migrated.state().up, migrated.state().down, migrated.state().linger, migrated.state().glow], ['#FF4D4D', '#A970FF', false, true]);
  assert.equal(migrated.stats.writes, 0, 'migration alone does not write');
  migrated.toggleLinger();
  migrated.advance(2000);
  assert.equal(JSON.parse(legacy.disk.get(KEY).slice(14)).s, 6, 'first edit rewrites the legacy record as the current schema (6)');

  for (const [label, stored, status] of [
    ['damaged', 'BTS1.00000000.{"s":2,"u":"#111111","d":"#222222","l":1,"g":1}', 'SAVE DAMAGED - RESET TO REPAIR'],
    ['bad colour', record('{"s":2,"u":"red","d":"#222222","l":1,"g":1}'), 'SAVE DAMAGED - RESET TO REPAIR'],
    ['newer', record('{"s":7,"u":"#111111","d":"#222222","l":1,"g":1,"x":"future"}'), 'NEWER SAVE - RESET TO OVERWRITE'],
  ]) {
    const profile = createProfile({ [KEY]: stored });
    const game = launch(profile);
    game.advance(2000);
    assert.equal(game.state().phase, 'blocked', label);
    assert.equal(game.state().status, status, label);
    assert.deepEqual([game.state().up, game.state().down], [defaultUp, defaultDown], `${label} save is not applied`);
    game.pick('up', '#808080');
    assert.equal(game.state().up, '#808080', `${label}: session edits still work`);
    game.advance(5000);
    assert.equal(game.stats.writes, 0, `${label}: blocked saves are never overwritten by edits`);
    game.reset();
    game.advance(3500);
    assert.equal(game.stats.writes, 0, `${label}: an unconfirmed RESET expires without writing`);
    game.reset();
    game.reset();
    assert.deepEqual([game.state().up, game.state().down, game.state().linger, game.state().glow], [defaultUp, defaultDown, true, true]);
    game.advance(2000);
    assert.equal(game.stats.writes, 1, `${label}: confirmed RESET overwrites once`);
    assert.equal(profile.disk.get(KEY) === stored, false);
    const after = launch(profile);
    after.advance(2000);
    assert.equal(after.state().phase, 'ready', `${label}: repaired save loads`);
  }
});

step('offline, untrusted and wrong-version pages leave the menu usable but never read or write', () => {
  for (const [label, options, status] of [
    ['offline', { commit: false }, 'OFFLINE - SESSION ONLY'],
    ['untrusted', { href: 'https://hantu-raya.github.io/hpv2-store/bt/evil' }, 'OFFLINE - SESSION ONLY'],
    ['version', { version: 2 }, 'SAVE PAGE OUTDATED - SESSION ONLY'],
  ]) {
    const profile = createProfile({ [KEY]: 'keep-me' });
    const game = launch(profile, options);
    game.advance(31000);
    assert.equal(game.state().phase, 'unavailable', label);
    assert.equal(game.state().status, status, label);
    assert.equal(game.stats.reads + game.stats.writes, 0, `${label}: no reads or writes`);
    game.toggleMenu();
    game.pick('down', '#ABCDEF');
    assert.equal(game.markers.down.image.style.washColor, '#ABCDEF', `${label}: session colours still apply`);
    game.reset();
    game.advance(10000);
    assert.equal(game.stats.writes, 0, `${label}: session-only edits never write later`);
    assert.equal(profile.disk.get(KEY), 'keep-me', `${label}: store untouched`);
    const hellos = game.stats.urls.length;
    assert.ok(hellos >= 1 && hellos <= 4, `${label}: hello retries are bounded (${hellos})`);
  }
});

step("the '?' toggle sets the minimap contract class and persists", () => {
  const profile = createProfile();
  const game = launch(profile);
  game.advance(2000);
  assert.equal(game.minimap.BHasClass('bt-linger-off'), false);
  game.toggleMenu();
  game.toggleLinger();
  assert.equal(game.state().linger, false);
  assert.equal(game.minimap.BHasClass('bt-linger-off'), true, 'settings signals the timer through the minimap');
  assert.equal(game.ids.BTLingerToggle.BHasClass('on'), false, 'the switch shows OFF');
  game.advance(2000);
  const saved = launch(profile);
  saved.advance(2000);
  assert.equal(saved.state().linger, false);
  assert.equal(saved.minimap.BHasClass('bt-linger-off'), true);
  saved.toggleLinger();
  assert.equal(saved.minimap.BHasClass('bt-linger-off'), false);
});

step('the bridge-buff glow toggle signals through the minimap and persists', () => {
  const profile = createProfile();
  const game = launch(profile);
  game.advance(2000);
  assert.equal(game.minimap.BHasClass('bt-glow-off'), false);
  game.toggleMenu();
  game.toggleGlow();
  assert.equal(game.state().glow, false);
  assert.equal(game.minimap.BHasClass('bt-glow-off'), true);
  assert.equal(game.ids.MinimapGlowClip.BHasClass('bt-glow-off'), false, 'settings never mutates the timer-owned clip');
  assert.equal(game.ids.BTGlowToggle.BHasClass('on'), false, 'the switch shows OFF');
  game.advance(2000);
  const saved = launch(profile);
  saved.advance(2000);
  assert.equal(saved.state().glow, false);
  assert.equal(saved.minimap.BHasClass('bt-glow-off'), true);
  saved.toggleGlow();
  assert.equal(saved.minimap.BHasClass('bt-glow-off'), false);
});

step('a second settings instance invalidates the old generation and replaces its host', () => {
  const game = launch(createProfile());
  game.advance(2000);
  game.pick('up', '#222222');
  game.advance(2000);
  assert.equal(game.state().status, 'SAVED');
  const first = game.test;
  const oldHost = game.liveHosts()[0];
  assert.equal(oldHost.GetParent(), game.hudCore, 'settings host must be outside the clipped minimap under HudCore');
  const staleGear = game.ids.BTSettingsGear;
  const staleChip = game.ids.BTPreset5;
  const gen = game.state().gen;
  assert.equal(game.liveHosts().length, 1);
  game.bootSecond();
  assert.equal(game.state().gen, gen + 1);
  assert.equal(first.alive(), false, 'old settings VM must stop when its generation changes');
  assert.equal(game.liveCallbacks(1), 0, 'old recurring loop and store handles must be cancelled');
  assert.equal(oldHost.deleted, true, 'replaced host is deleted');
  assert.equal(game.liveHosts().length, 1, 'only the new host stays valid under HudCore');
  staleGear.events.onactivate();
  staleChip.events.onactivate();
  assert.equal(first.getState().up, '#222222', 'a preset from the old host is inert');
  assert.equal(game.state().menuOpen, false, 'event handlers belonging to the old generation are inert');
  game.advance(2500);
  assert.equal(game.liveCallbacks(1), 0, 'old loop does not restart');
  assert.equal(game.state().phase, 'ready');
  assert.equal(game.state().up, '#222222', 'new instance rehydrates the saved setting');
});

step('the menu hides timer-only controls until the minimap advertises the timer', () => {
  const game = launch(createProfile());
  game.toggleMenu();
  assert.equal(game.ids.BTSettingsPanel.BHasClass('no-buff-timer'), true);
  game.minimap.AddClass('bt-buff-timer');
  game.advance(250);
  assert.equal(game.ids.BTSettingsPanel.BHasClass('no-buff-timer'), false);
  game.minimap.RemoveClass('bt-buff-timer');
  game.advance(250);
  assert.equal(game.ids.BTSettingsPanel.BHasClass('no-buff-timer'), true);
});

step('the timer reads minimap classes, mirrors glow and clears active lingers without replay', () => {
  const game = launch(createProfile(), { withTimer: true, clock: '10:00' });
  game.advance(2000);
  const timer = game.timer;
  assert.equal(typeof timer.readSettingsContract, 'function', 'timer exposes class-contract test seam');
  timer.setMinimapTestUi(game.minimap);
  const timerHosts = timer.getInstanceTestState().hosts;
  const timerGlow = timerHosts.glowClip;
  const lingerLayer = timerHosts.lingerLayer;
  assert.equal(timerHosts.timerOverlay.GetParent(), game.clamp, 'the widget layer sits in .clamp_width');
  assert.equal(timerHosts.timerDock.GetParent(), game.persp, 'the dock anchor sits in #minimap_persp');
  assert.equal(game.ids.MinimapBuffClaimLeft.GetParent(), game.ids.BTSlotClaimL, 'claim boxes are widget slots in the layer');
  assert.equal(lingerLayer.GetParent(), game.overlay);
  timer.setLingerTestUi(game.overlay, game.minimap, lingerLayer);
  game.overlay.actuallayoutwidth = game.overlay.actuallayoutheight = 420;
  game.minimap.actualxoffset = game.minimap.actualyoffset = 30;
  game.minimap.actuallayoutwidth = game.minimap.actuallayoutheight = 360;
  const btn = makePanel('enemy_btn', 'Panel', game.minimap);
  btn.actualxoffset = btn.actualyoffset = 100;
  btn.actuallayoutwidth = btn.actuallayoutheight = 32;
  btn.style.opacity = '1';
  btn.hittest = btn.hittestchildren = true;
  timer.showLinger('e1', btn);
  const priorLinger = lingerLayer.FindChildTraverse('LingerQ_e1');
  assert.ok(priorLinger && priorLinger.IsValid(), 'active linger exists before disabling it');
  timer.readSettingsContract();
  assert.equal(game.minimap.BHasClass('bt-buff-timer'), true);
  game.toggleLinger();
  game.toggleGlow();
  timer.readSettingsContract();
  assert.equal(priorLinger.deleted, true, 'transition to linger-off removes an active question mark');
  assert.equal(btn.style.opacity, '1', 'marker opacity is restored');
  assert.equal(btn.hittest, true, 'marker hit testing is restored');
  assert.equal(timerGlow.BHasClass('bt-glow-off'), true, 'timer-owned glow clip mirrors the minimap class');
  const snap = (active) => ({ players: [{ id: 'e2', team: 2, isActive: active, isDead: false, panel: btn, xPct: 40, yPct: 40 }] });
  timer.checkEnemyLinger(101000, snap(true));
  timer.checkEnemyLinger(101500, snap(false));
  assert.equal(lingerLayer.FindChildTraverse('LingerQ_e2'), null, 'disappearances while off still update bookkeeping but do not linger');
  game.toggleLinger();
  game.toggleGlow();
  timer.readSettingsContract();
  assert.equal(timerGlow.BHasClass('bt-glow-off'), false);
  timer.checkEnemyLinger(102000, snap(false));
  assert.equal(lingerLayer.FindChildTraverse('LingerQ_e2'), null, 're-enabling does not replay an earlier disappearance');
  timer.checkEnemyLinger(102500, snap(true));
  timer.checkEnemyLinger(103000, snap(false));
  assert.ok(lingerLayer.FindChildTraverse('LingerQ_e2'), 'a new disappearance lingers after re-enabling');
});

fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
fs.writeFileSync(path.join(root, '.tmp', 'bt-settings-e2e.json'), JSON.stringify({ page: PAGE_PATH, passed: transcript }, null, 2));
console.log(`[BT SETTINGS PASS] ${transcript.length} end-to-end scenarios; artifact .tmp/bt-settings-e2e.json`);
