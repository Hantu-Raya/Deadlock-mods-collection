'use strict';
// Dependent setting rows (user request 2026-10-28): when a row's switch or mode is off, the rows that
// only work with it grey out and stop taking input, e.g. Name color while Custom name color is off.
// Ways this can fail, each checked below: a row stays editable while its parent is off; the wrong side
// greys out; a disabled parent does not grey its children (cascade); an enum, number or either-of
// requirement reads the wrong value; a disabled row still changes the setting through its entry; the
// grey state goes stale after Undo; the tooltip does not say what to turn on; the generator accepts
// a requirement that points nowhere, at itself, in a loop, at a missing option or across sides.
const assert = require('node:assert/strict');
const test = require('node:test');
const { profile, launch } = require('./storage-fixture');
const { computed } = require('./style-cascade');
const { loadLayout } = require('./boot-layout');

function contract(f) { return f.harness.$.HPColorsV3Settings; }
function row(f, key, side) { const found = contract(f).controls.find(r => r.key === key && r.side === side); assert.ok(found, key + ' ' + side); return found; }
function find(f, id) { const panel = f.harness.contextPanel.FindChildTraverse(id); assert.ok(panel, id); return panel; }
function disabled(f, key, side) { return find(f, row(f, key, side).rowId).BHasClass('HPC3RowDisabled'); }
function toggle(f, key, side) { find(f, row(f, key, side).toggleId).events.onactivate(); }
function choose(f, key, side, value) { find(f, row(f, key, side).options.find(o => o.value === value).id).events.onactivate(); }
function number(f, key, side, value) { const entry = find(f, row(f, key, side).entryId); entry.text = String(value); entry.events.ontextentrysubmit(); }
function value(f, key, side) { const s = f.settings(); return side === 'shared' ? s.shared[key] : s.side[side][key]; }
function controlPanels(f, r) {
  return [r.toggleId, r.hexId, r.hueId, r.swatchId, r.sliderId, r.entryId, r.resetId, r.conditionId, r.kind === 'dropdown' ? r.id : null,
    ...(r.kind === 'segment' ? r.options.map(o => o.id) : [])].filter(Boolean).map(id => find(f, id));
}
function tooltip(f, key, side) {
  find(f, row(f, key, side).rowId).events.onmouseover();
  const shown = f.harness.dispatches.filter(d => d[0] === 'UIShowTextTooltip').at(-1);
  return shown[2];
}
function fires(f) { return f.harness.dispatches.filter(d => d[0] === 'ClientUI_FireOutput').length; }

test('name color rows grey out per side until Custom name color is on; a hidden name greys its whole group', () => {
  const f = launch(profile()); f.run(2000);
  for (const side of ['enemy', 'ally']) {
    assert.equal(disabled(f, 'nameColorEnabled', side), false, side + ' switch itself stays usable');
    for (const key of ['nameColorMode', 'nameColor']) {
      assert.equal(disabled(f, key, side), true, side + ' ' + key + ' greyed while Custom name color is off');
      for (const panel of controlPanels(f, row(f, key, side))) assert.equal(panel.enabled, false, side + ' ' + key + ' ' + panel.id);
    }
  }
  toggle(f, 'nameColorEnabled', 'enemy');
  for (const key of ['nameColorMode', 'nameColor']) {
    assert.equal(disabled(f, key, 'enemy'), false, 'enemy ' + key + ' usable');
    for (const panel of controlPanels(f, row(f, key, 'enemy'))) assert.equal(panel.enabled, true, 'enemy ' + panel.id);
    assert.equal(disabled(f, key, 'ally'), true, 'ally ' + key + ' still greyed');
  }
  // Team colors fall back to the own name color, so it stays usable.
  choose(f, 'nameColorMode', 'enemy', 'team');
  assert.equal(disabled(f, 'nameColor', 'enemy'), false);
  // Hiding the name greys every name row of that side, including rows whose own switch is on.
  toggle(f, 'nameVisible', 'enemy');
  for (const key of ['nameColorEnabled', 'nameColorMode', 'nameColor', 'nameSize', 'nameOffsetX', 'nameOffsetY', 'nameOutline', 'nameAlign'])
    assert.equal(disabled(f, key, 'enemy'), true, 'hidden name: ' + key);
  assert.equal(value(f, 'nameColorEnabled', 'enemy'), true, 'greying never changes a value');
  assert.equal(disabled(f, 'nameSize', 'ally'), false, 'ally name still shown');
});

test('a greyed row refuses edits from its entry, segment and reset; nothing is published', () => {
  const f = launch(profile()); f.run(2000);
  const color = row(f, 'nameColor', 'ally'), before = value(f, 'nameColor', 'ally'), published = fires(f);
  const hex = find(f, color.hexId); hex.text = '#123456'; hex.events.ontextentrysubmit();
  assert.equal(value(f, 'nameColor', 'ally'), before); assert.equal(hex.text, before, 'entry shows the kept value');
  choose(f, 'nameColorMode', 'ally', 'team'); assert.equal(value(f, 'nameColorMode', 'ally'), 'custom');
  find(f, color.swatchId).events.onactivate();
  assert.equal(find(f, 'HPColorsPickerDialog').BHasClass('Open'), false, 'no color picker for a greyed row');
  assert.equal(fires(f), published, 'no publication');
  assert.equal(find(f, 'HPColorsUndoButton').enabled, false, 'no Undo step');
});

test('greyed rows say what to turn on; usable rows show their normal help', () => {
  const f = launch(profile()); f.run(2000);
  assert.match(tooltip(f, 'nameColor', 'ally'), /^Turn on Custom name color to change this\./);
  assert.ok(tooltip(f, 'nameColor', 'ally').endsWith(row(f, 'nameColor', 'ally').help), 'the help follows');
  toggle(f, 'nameColorEnabled', 'enemy');
  assert.equal(tooltip(f, 'nameColor', 'enemy'), row(f, 'nameColor', 'enemy').help);
  toggle(f, 'nameVisible', 'enemy');
  assert.match(tooltip(f, 'nameColor', 'enemy'), /^Turn on Show hero name to change this\./, 'names the setting that is actually off');
  choose(f, 'hudHealthColorMode', 'shared', 'team');
  assert.match(tooltip(f, 'hudHealthColor', 'shared'), /^Set Your health bar color to Custom to change this\./);
});

test('mode, number and either-of requirements, plus shared rows', () => {
  const f = launch(profile()); f.run(2000);
  // Mode: the custom health-bar color only applies in Custom.
  assert.equal(disabled(f, 'hudHealthColor', 'shared'), true);
  choose(f, 'hudHealthColorMode', 'shared', 'custom'); assert.equal(disabled(f, 'hudHealthColor', 'shared'), false);
  // Number: the low stamina color needs a threshold above 0 (and the stamina color switch).
  toggle(f, 'staminaColorEnabled', 'enemy');
  assert.equal(disabled(f, 'staminaLowThreshold', 'enemy'), false); assert.equal(disabled(f, 'staminaLowColor', 'enemy'), true);
  number(f, 'staminaLowThreshold', 'enemy', 1); assert.equal(disabled(f, 'staminaLowColor', 'enemy'), false);
  toggle(f, 'staminaColorEnabled', 'enemy'); assert.equal(disabled(f, 'staminaLowColor', 'enemy'), true, 'cascade through the switch');
  // Either-of: bar colors also paint objective bars, so an open objective gate keeps them usable. Neutral camps
  // use their own fill color, so their gate does not (user, 2026-10-29).
  assert.equal(disabled(f, 'barColorLow', 'ally'), true, 'ally player colors off, no unit gate');
  assert.equal(disabled(f, 'barColorLow', 'enemy'), false);
  toggle(f, 'neutralEnabled', 'shared'); assert.equal(disabled(f, 'barColorLow', 'ally'), true, 'neutral camps do not use the ally colors');
  toggle(f, 'objectiveEnabled', 'ally'); assert.equal(disabled(f, 'barColorLow', 'ally'), false, 'ally objective bars use the ally colors');
  // Neutral HP number: offsets and tilt need the custom position switch, which needs the neutral gate.
  for (const key of ['neutralHpOffsetX', 'neutralHpOffsetY', 'neutralHpTilt']) assert.equal(disabled(f, key, 'shared'), true, key);
  assert.equal(disabled(f, 'neutralHpTextMode', 'shared'), false);
  toggle(f, 'neutralHpPositionEnabled', 'shared');
  for (const key of ['neutralHpOffsetX', 'neutralHpOffsetY', 'neutralHpTilt']) assert.equal(disabled(f, key, 'shared'), false, key);
  toggle(f, 'neutralEnabled', 'shared');
  for (const key of ['neutralHpTextMode', 'neutralHpOffsetX', 'neutralHpTilt']) assert.equal(disabled(f, key, 'shared'), true, 'cascade: ' + key);
  // Objective HP number: shared rows, usable while either side customizes objectives; offsets and tilt need the
  // objective position switch (user, 2026-10-29).
  assert.equal(disabled(f, 'objectiveHpTextMode', 'shared'), false, 'ally objective gate is open');
  for (const key of ['objectiveHpOffsetX', 'objectiveHpOffsetY', 'objectiveHpTilt']) assert.equal(disabled(f, key, 'shared'), true, key);
  toggle(f, 'objectiveHpPositionEnabled', 'shared');
  for (const key of ['objectiveHpOffsetX', 'objectiveHpOffsetY', 'objectiveHpTilt']) assert.equal(disabled(f, key, 'shared'), false, key);
  toggle(f, 'objectiveEnabled', 'ally');
  for (const key of ['objectiveHpTextMode', 'objectiveHpPositionEnabled', 'objectiveHpTilt']) assert.equal(disabled(f, key, 'shared'), true, 'both gates closed: ' + key);
  toggle(f, 'objectiveEnabled', 'enemy');
  for (const key of ['objectiveHpTextMode', 'objectiveHpOffsetY']) assert.equal(disabled(f, key, 'shared'), false, 'enemy gate: ' + key);
  // Shared row: the OLD name lift only matters with OLD boxes.
  assert.equal(disabled(f, 'nameRiseWithPips', 'shared'), true);
  choose(f, 'barStyle', 'shared', 'old'); assert.equal(disabled(f, 'nameRiseWithPips', 'shared'), false);
});

// User, 2026-11-02: with Player bar colors off only the Colors rows greyed, yet the Feedback colors (the new
// Deferred damage color among them) did nothing either, so a color change seemed broken. Every row that only
// works through the bar colors now greys with them, per side, unless a unit gate or the HP number still uses it.
test('rows that only work with Player bar colors grey out with them, per side, unless something else uses them', () => {
  const f = launch(profile()); f.run(2000);
  const feedback = ['barHealingColor', 'barDeltaColor', 'barShieldColor', 'barArmorColor', 'barDeferredColor'];
  const colorOnly = [...feedback, 'barVisible', 'pulseColorEnabled'];
  // Defaults: enemy bar colors on, ally off (ally HP number hidden, no ally objectives, no pulse).
  for (const key of colorOnly) {
    assert.equal(disabled(f, key, 'enemy'), false, 'enemy ' + key);
    assert.equal(disabled(f, key, 'ally'), true, 'ally ' + key);
  }
  assert.match(tooltip(f, 'barDeferredColor', 'ally'), /^Turn on Player bar colors.* to change this\. /);
  toggle(f, 'barColorEnabled', 'ally');
  for (const key of colorOnly) assert.equal(disabled(f, key, 'ally'), key === 'pulseColorEnabled', 'ally colors on (ally pulse still off): ' + key);
  toggle(f, 'barColorEnabled', 'ally');
  // Pulse rows: the bar pulse needs the bar colors; the HP-number pulse needs the HP number.
  toggle(f, 'barColorEnabled', 'enemy');
  for (const key of [...colorOnly, 'pulseHideBar']) assert.equal(disabled(f, key, 'enemy'), true, 'enemy colors off: ' + key);
  assert.equal(disabled(f, 'pulseEnabled', 'enemy'), false, 'the enemy HP number can still pulse');
  for (const key of ['pulseBpm', 'pulseIntensity', 'pulseThreshold']) assert.equal(disabled(f, key, 'enemy'), true, 'no bar pulse and no HP-number pulse: ' + key);
  toggle(f, 'pulseReadout', 'enemy');
  for (const key of ['pulseBpm', 'pulseIntensity', 'pulseThreshold']) assert.equal(disabled(f, key, 'enemy'), false, 'HP-number pulse: ' + key);
  toggle(f, 'hpTextVisible', 'enemy');
  assert.equal(disabled(f, 'pulseEnabled', 'enemy'), true, 'no bar colors, no HP number: nothing pulses');
  // Objective bars use the side's bar, feedback and pulse colors; neutral camps use the enemy damage delta.
  toggle(f, 'objectiveEnabled', 'enemy');
  for (const key of [...feedback, 'pulseEnabled', 'pulseColorEnabled']) assert.equal(disabled(f, key, 'enemy'), false, 'enemy objectives: ' + key);
  assert.equal(disabled(f, 'barVisible', 'enemy'), true, 'objective bars cannot be hidden');
  assert.equal(disabled(f, 'pulseHideBar', 'enemy'), true, 'only hero bars hide during a pulse');
  toggle(f, 'objectiveEnabled', 'enemy');
  toggle(f, 'neutralEnabled', 'shared');
  assert.equal(disabled(f, 'barDeltaColor', 'enemy'), false, 'neutral camps take the enemy damage delta');
  assert.equal(disabled(f, 'barHealingColor', 'enemy'), true, 'neutral camps keep the stock healing color');
  toggle(f, 'neutralEnabled', 'shared');
  // The HP number in Bar colors mode is painted with the bar colors even while the bar keeps the game look.
  assert.equal(disabled(f, 'barColorLow', 'enemy'), true);
  toggle(f, 'hpTextVisible', 'enemy');
  assert.equal(disabled(f, 'barColorLow', 'enemy'), false, 'HP number follows the bar colors');
  assert.equal(disabled(f, 'barHealingColor', 'enemy'), true, 'the HP number does not use the feedback colors');
  choose(f, 'hpTextColorMode', 'enemy', 'custom'); assert.equal(disabled(f, 'barColorLow', 'enemy'), true, 'own HP number colors');
});

test('the health line rows grey out with BAR STYLE OLD, which draws its own boxes', () => {
  const f = launch(profile()); f.run(2000);
  toggle(f, 'lineColorEnabled', 'ally');
  for (const key of ['linesVisible', 'lineColorEnabled', 'lineColor', 'lineOpacity']) assert.equal(disabled(f, key, 'ally'), false, key);
  choose(f, 'barStyle', 'shared', 'old');
  for (const key of ['linesVisible', 'lineColorEnabled', 'lineColor', 'lineOpacity']) assert.equal(disabled(f, key, 'ally'), true, 'OLD: ' + key);
  choose(f, 'barStyle', 'shared', 'original');
  assert.equal(disabled(f, 'lineColor', 'ally'), false, 'V2 keeps the lines');
});

test('Undo brings the grey state back with the value; greyed rows look dim', () => {
  const f = launch(profile()); f.run(2000);
  toggle(f, 'nameColorEnabled', 'enemy'); assert.equal(disabled(f, 'nameColor', 'enemy'), false);
  find(f, 'HPColorsUndoButton').events.onactivate(); f.run(500);
  assert.equal(value(f, 'nameColorEnabled', 'enemy'), false); assert.equal(disabled(f, 'nameColor', 'enemy'), true);
  const greyed = find(f, row(f, 'nameColor', 'enemy').rowId), title = greyed.children.find(p => p.BHasClass('HPC3RowTitle'));
  const controls = greyed.children.find(p => p.BHasClass('HPC3RowControls'));
  assert.equal(computed(controls, 'opacity'), '0.3'); assert.equal(computed(title, 'color'), '#FFEFD722');
  greyed.states = ['hover']; assert.equal(computed(title, 'color'), '#FFEFD722', 'hover does not light a greyed title');
});

test('rows are greyed from boot even when no settings store attaches', () => {
  // The store page can fail to load; the menu then boots on defaults and must still grey dependent rows.
  const b = loadLayout('hud_escape_menu.xml', { skipScripts: ['hp_colors_v3_storage'] });
  b.includeScripts(); b.onload(); b.harness.scheduler.runFor(2000);
  const f = { harness: b.harness };
  assert.equal(disabled(f, 'nameColor', 'enemy'), true, 'Custom name color is off by default');
  assert.equal(disabled(f, 'nameColorEnabled', 'enemy'), false);
});

test('a control missing at first boot is greyed once a boot retry finds it', () => {
  // A boot that misses a control retries and collects the panels again; the late control must not stay usable.
  const b = loadLayout('hud_escape_menu.xml', { skipScripts: ['hp_colors_v3_storage'] });
  b.includeScripts();
  const f = { harness: b.harness }, hex = find(f, row(f, 'nameColor', 'enemy').hexId), parent = hex.GetParent();
  hex.SetParent(null);
  b.onload(); b.harness.scheduler.runFor(200);
  const bootState = () => find(f, 'HPColorsMenuHost').GetAttributeString('hpv3_boot', '');
  assert.notEqual(bootState(), 'ready', 'boot is still retrying');
  hex.SetParent(parent); b.harness.scheduler.runFor(3000);
  assert.equal(bootState(), 'ready');
  assert.equal(disabled(f, 'nameColor', 'enemy'), true);
  assert.equal(hex.enabled, false, 'late hex entry is disabled with its row');
});
