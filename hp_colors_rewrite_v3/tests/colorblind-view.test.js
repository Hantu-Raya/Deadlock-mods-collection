'use strict';
// COLORBLIND (2026-10-28, user request): a COLORBLIND tab with three switch rows for the game's own
// full-screen color blindness view. Each switch sends exactly one release convar through CitadelConCommand,
// so the three types mix. It is not a setting, but (2026-10-29, user request) the choice is saved with the
// player's own store record and sent again after a game restart, because the game resets these convars.
// Ways this can fail, each checked below: wrong or missing command; one switch touching another;
// a switch that paints ON although the command was refused; state lost on a menu reload; commands sent
// again on a reload in the same game; the saved choice not sent after a restart, or an old choice
// overriding one made in this game; a retired menu still sending commands; leaking into codes, presets,
// Undo or the settings publication; a REPLACE ALL wiping it; help that speaks developer words.
const assert = require('node:assert/strict');
const test = require('node:test');
const { latestPublishedConfig } = require('./boot-layout');
const { profile, launch, CURRENT } = require('./storage-fixture');

const TYPES = ['Protanopia', 'Deuteranopia', 'Tritanopia'];
const CONVAR = type => 'r_colorblindsim_fullscreen_weight_' + type.toLowerCase();
function find(f, id) { const panel = f.harness.contextPanel.FindChildTraverse(id); assert.ok(panel, id); return panel; }
function toggle(f, type) { return find(f, 'HPColorsColorblind' + type + 'Toggle'); }
function click(f, type) { toggle(f, type).events.onactivate(); }
function commands(f) { return f.harness.dispatches.filter(args => args[0] === 'CitadelConCommand').map(args => args[1]); }
function checked(f) { return TYPES.filter(type => toggle(f, type).BHasClass('Checked')); }

test('colorblind view: each switch sends only its own game command, so the three types mix', () => {
  const f = launch(profile()); f.run(2000);
  assert.deepEqual(checked(f), [], 'a new game starts with every type off');
  assert.deepEqual(commands(f), [], 'opening the menu sends nothing');
  click(f, 'Protanopia');
  assert.deepEqual(commands(f), [CONVAR('Protanopia') + ' 1']);
  click(f, 'Tritanopia');
  assert.deepEqual(commands(f), [CONVAR('Protanopia') + ' 1', CONVAR('Tritanopia') + ' 1']);
  assert.deepEqual(checked(f), ['Protanopia', 'Tritanopia'], 'two types on together');
  click(f, 'Protanopia');
  assert.deepEqual(commands(f).at(-1), CONVAR('Protanopia') + ' 0');
  assert.deepEqual(checked(f), ['Tritanopia'], 'turning one off leaves the other on');
  click(f, 'Deuteranopia');
  assert.deepEqual(checked(f), ['Deuteranopia', 'Tritanopia']);
  assert.equal(commands(f).length, 4, 'one command per click, nothing else');
});

test('colorblind view: a refused command leaves the switch unchanged', () => {
  const f = launch(profile()); f.run(2000);
  const $ = f.harness.$, dispatch = $.DispatchEvent;
  $.DispatchEvent = (...args) => { if (args[0] === 'CitadelConCommand') throw new Error('refused'); return dispatch(...args); };
  click(f, 'Deuteranopia');
  assert.deepEqual(checked(f), [], 'still off after a refused command');
  $.DispatchEvent = dispatch;
  click(f, 'Deuteranopia');
  assert.deepEqual(checked(f), ['Deuteranopia']);
  assert.deepEqual(commands(f), [CONVAR('Deuteranopia') + ' 1']);
});

test('colorblind view is personal: saved, sent again after a restart, and never in codes, presets, Undo or the publication', () => {
  const p = profile(), f = launch(p); f.run(2000);
  f.edit('#654321'); f.run(3000);
  const published = latestPublishedConfig(f.harness);
  click(f, 'Protanopia'); click(f, 'Tritanopia'); f.run(3000);
  assert.deepEqual([...f.harness.$.HPColorsV3Store.getBundle().colorblind], ['protanopia', 'tritanopia'], 'saved with the bundle');
  assert.match(Buffer.from(p.disk.get(CURRENT).split('.').at(-1), 'base64').toString(), /"colorblind":\["protanopia","tritanopia"\]/, 'written to the store');
  assert.deepEqual(latestPublishedConfig(f.harness), published, 'the healthbar settings are not republished');
  for (const kind of ['Settings', 'Bundle']) {
    find(f, 'HPColors' + kind + 'CopyButton').events.onactivate();
    const code = find(f, 'HPColors' + kind + 'CodeEntry').text, decoded = f.harness.$.HPColorsV3Store['decode' + kind + 'Code'](code);
    assert.ok(!/colorblind/i.test(JSON.stringify(decoded)), kind + ' code has no view state');
  }
  find(f, 'HPColorsPresetNameEntry').text = 'Look one'; find(f, 'HPColorsPresetSaveButton').events.onactivate(); f.run(3000);
  assert.ok(!/colorblind/i.test(JSON.stringify(f.harness.$.HPColorsV3Store.getBundle().presets)), 'presets have no view state');
  find(f, 'HPColorsUndoButton').events.onactivate(); f.run(1000);
  assert.equal(f.settings().side.enemy.barColorLow, '#FD4949', 'Undo takes back the color edit');
  assert.deepEqual(checked(f), ['Protanopia', 'Tritanopia'], 'Undo never touches the view');
  // A reloaded Escape menu in the same game shows what was set, without sending anything again.
  const before = commands(f).length, oldSwitch = toggle(f, 'Protanopia');
  f.reload(); f.run(3000);
  assert.deepEqual(checked(f), ['Protanopia', 'Tritanopia']);
  assert.equal(commands(f).length, before, 'a reload sends no command');
  oldSwitch.events.onactivate();
  assert.equal(commands(f).length, before, 'the retired menu cannot send commands');
  // A fresh script instance in the same game (layout reload) reads it back from the top panel.
  f.includeScripts(); f.onload(); f.run(3000);
  assert.deepEqual(checked(f), ['Protanopia', 'Tritanopia']);
  assert.equal(commands(f).length, before, 'reinclusion sends no command');
  // The game resets these convars on restart; the saved choice is sent again once the store loads.
  const again = launch(p); again.run(3000);
  assert.deepEqual(commands(again), [CONVAR('Protanopia') + ' 1', CONVAR('Tritanopia') + ' 1']);
  assert.deepEqual(checked(again), ['Protanopia', 'Tritanopia']);
  again.reload(); again.run(3000);
  assert.equal(commands(again).length, 2, 'only once per game');
  click(again, 'Protanopia'); again.run(3000);
  const third = launch(p); third.run(3000);
  assert.deepEqual(commands(third), [CONVAR('Tritanopia') + ' 1'], 'a type turned off stays off');
  click(third, 'Tritanopia'); third.run(3000);
  assert.equal(Object.hasOwn(third.harness.$.HPColorsV3Store.getBundle(), 'colorblind'), false, 'all off leaves nothing saved');
  const fourth = launch(p); fourth.run(3000);
  assert.deepEqual(commands(fourth), []); assert.deepEqual(checked(fourth), []);
});

test('colorblind view: a choice made in this game before the save loads wins and is saved, and REPLACE ALL keeps it', () => {
  const p = profile(), f = launch(p); f.run(2000);
  click(f, 'Deuteranopia'); f.run(3000);
  // A new game whose store page has not loaded yet: the player turns Protanopia on first.
  const g = launch(p, { navLatencySec: 6 }); g.run(1000);
  click(g, 'Protanopia'); g.run(8000);
  assert.deepEqual(commands(g), [CONVAR('Protanopia') + ' 1'], 'the older saved choice does not override this game');
  assert.deepEqual(checked(g), ['Protanopia']);
  assert.deepEqual([...g.harness.$.HPColorsV3Store.getBundle().colorblind], ['protanopia'], 'this game\'s choice is saved once the store loads');
  // REPLACE ALL with a bundle code (which has no view state) keeps this player's saved choice.
  const h = launch(p); h.run(3000);
  find(h, 'HPColorsBundleCopyButton').events.onactivate();
  find(h, 'HPColorsBundleReplaceButton').events.onactivate(); find(h, 'HPColorsBundleReplaceConfirmButton').events.onactivate(); h.run(3000);
  assert.deepEqual([...h.harness.$.HPColorsV3Store.getBundle().colorblind], ['protanopia'], 'still saved after REPLACE ALL');
});

test('colorblind view: a malformed saved choice is ignored, and a refused restore leaves that switch off', () => {
  const p = profile(), f = launch(p); f.run(2000);
  const store = f.harness.$.HPColorsV3Store, bundle = store.getBundle();
  assert.equal(store.replaceBundle({ ...bundle, colorblind: 'protanopia' }), true); f.run(3000);
  const g = launch(p); g.run(3000);
  assert.deepEqual(commands(g), [], 'not a list: nothing sent'); assert.deepEqual(checked(g), []);
  assert.equal(g.harness.$.HPColorsV3Store.replaceBundle({ ...g.harness.$.HPColorsV3Store.getBundle(), colorblind: ['bogus', 7, 'tritanopia', 'protanopia'] }), true); g.run(3000);
  const h = launch(p, { navLatencySec: 2 });
  const dispatch = h.harness.$.DispatchEvent;
  h.harness.$.DispatchEvent = (...args) => {
    if (args[0] === 'CitadelConCommand' && /protanopia/.test(args[1])) throw new Error('refused');
    return dispatch(...args);
  };
  h.run(4000);
  assert.deepEqual(commands(h), [CONVAR('Tritanopia') + ' 1'], 'unknown entries are skipped');
  assert.deepEqual(checked(h), ['Tritanopia'], 'the refused type stays off');
});

test('COLORBLIND is its own tab after UNITS: three setting-style rows, plain description, nothing in the rail or search', () => {
  const f = launch(profile()); f.run(2000);
  const titles = f.harness.$.HPColorsV3Settings.menu.pages.map(page => page.title);
  assert.deepEqual([...titles], ['NEW', 'BAR', 'HP TEXT', 'NAME', 'INDICATORS', 'ICONS', 'UNITS', 'COLORBLIND', 'PRESETS']);
  find(f, 'HPColorsNavColorblindButton').events.onactivate();
  assert.equal(find(f, 'HPColorsPageColorblind').BHasClass('Active'), true);
  assert.equal(find(f, 'HPColorsPageTitle').text, 'COLORBLIND');
  const description = find(f, 'HPColorsPageDescription').text;
  assert.match(description, /whole screen/); assert.match(description, /red/); assert.match(description, /green/); assert.match(description, /blue/);
  assert.match(description, /more than one/); assert.match(description, /saved/); assert.match(description, /restart/);
  assert.ok(!/Resets when/.test(description), 'no longer resets on restart');
  assert.equal(find(f, 'HPColorsResetPageButton').enabled, false, 'nothing on this tab is a setting to reset');
  const names = { Protanopia: 'Protanopia (red-weak)', Deuteranopia: 'Deuteranopia (green-weak)', Tritanopia: 'Tritanopia (blue-weak)' };
  const page = find(f, 'HPColorsPageColorblind');
  for (const type of TYPES) {
    const row = find(f, 'HPColorsColorblind' + type + 'Row');
    assert.ok(row.BHasClass('HPC3Row'), type + ': a normal settings row');
    assert.ok(toggle(f, type).GetParent().GetParent() === row, type + ': switch sits in the row controls');
    assert.ok(page.FindChildTraverse(row.id) === row, type + ': on the COLORBLIND tab');
    const title = row.children.find(child => child.BHasClass('HPC3RowTitle')).text;
    assert.equal(title, names[type]);
  }
  for (const text of [description, ...Object.values(names)]) assert.ok(!/\b(r_|convar|weight|simulation|native|stock|engine)\b/i.test(text), text);
  // The rail keeps only SHOW BOUNDS and its help.
  const bounds = find(f, 'HPColorsShowBoundsToggle').GetParent().GetParent();
  for (const type of TYPES) assert.ok(!bounds.FindChildTraverse('HPColorsColorblind' + type + 'Toggle'), type + ' not in the rail');
  assert.deepEqual(bounds.children.filter(panel => panel.paneltype === 'Label').map(panel => panel.text),
    ['Outline the area healthbars can use. Stays on until you turn it off or restart.']);
  // Search finds settings only: the tab hides while searching.
  f.harness.$.HPColorsMenuToggle();
  find(f, 'HPColorsSearchField').text = 'red'; find(f, 'HPColorsSearchField').events.ontextentrychange();
  assert.equal(page.BHasClass('SearchMiss'), true);
});
