'use strict';
// Ticket 37: side-nav restructure (debated with m1). Related settings share a card, a feature's on switch is its
// card's first row, no card holds one row, and attached icons get their own ICONS page so no rail lists 12 entries.
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadLayout, latestPublishedConfig } = require('./boot-layout');

const pascal = text => String(text).replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^./, c => c.toUpperCase());
// Per card and fold: [key, scope] in schema order; E/A = both sides, E = enemy only, S = shared.
const EA = 'E/A', E = 'E', S = 'S';
const STRUCTURE = [
  ['Bar', [
    ['General', [['enabled', S], ['barStyle', S]], []],
    ['Colors', [['barColorEnabled', EA], ['barColorMode', EA], ['barColorLow', EA], ['barColorMid', EA], ['barColorHigh', EA]], [['barColorTeamHigh', EA]]],
    ['Shared colors', [['lowThreshold', S], ['highThreshold', S], ['teamAmberColor', S], ['teamSapphireColor', S]], []],
    ['Feedback', [['damageShakeEnabled', S]], [['barHealingColor', EA], ['barDeltaColor', EA], ['barShieldColor', EA], ['barArmorColor', EA], ['barDeferredColor', EA], ['damageShakeStrength', S]]],
    ['Size and position', [['barVisible', EA], ['barWidth', EA], ['barHeight', EA]], [['barOffsetX', EA], ['barOffsetY', EA]]],
    ['Outline', [['barOutlineEnabled', EA]], [['barOutlineCustomColor', EA], ['barOutlineColor', EA], ['barOutlineThickness', EA], ['barOutlineOpacity', EA]]],
    ['Your health bar', [['hudHealthColorMode', S], ['hudHealthColor', S], ['hudShieldStyle', S]], []],
  ]],
  ['HP Text', [
    ['Number and font', [['hpTextVisible', EA], ['hpTextFormat', EA], ['hpTextFont', EA], ['hpTextSize', EA]], []],
    ['Colors', [['hpTextColorMode', EA]], [['hpTextMode', EA], ['hpTextLow', EA], ['hpTextMid', EA], ['hpTextHigh', EA], ['hpTextTeamHigh', EA]]],
    ['Position and outline', [], [['hpTextOffsetX', EA], ['hpTextOffsetY', EA], ['hpTextOutline', EA], ['hpTextAlign', EA], ['hpTextTilt', EA]]],
  ]],
  ['Name', [
    ['Name and color', [['nameVisible', EA], ['nameColorEnabled', EA], ['nameColorMode', EA], ['nameColor', EA], ['nameSize', EA]], []],
    ['Position and outline', [], [['nameOffsetX', EA], ['nameOffsetY', EA], ['nameOutline', EA], ['nameAlign', EA], ['nameTilt', S], ['nameRiseWithPips', S]]],
  ]],
  ['Indicators', [
    ['Lines and pips', [['linesVisible', EA], ['lineColorEnabled', EA], ['lineColor', EA]], [['lineOpacity', EA]]],
    ['Kill marker', [['killMarkerEnabled', E], ['killMarkerColor', E]], [['killMarkerThreshold', E], ['killMarkerWidth', E]]],
    ['Stamina', [['staminaColorEnabled', EA], ['staminaColorMode', EA], ['staminaColor', EA], ['staminaLowThreshold', EA], ['staminaLowColor', EA], ['staminaShape', EA]],
      [['staminaWidth', EA], ['staminaHeight', EA], ['staminaOffsetX', EA], ['staminaOffsetY', EA]]],
    ['Pulse', [['pulseEnabled', EA], ['pulseThreshold', EA], ['pulseColorEnabled', EA], ['pulseColor', EA], ['pulseReadout', EA]],
      [['pulseReadoutModifiers', E], ['pulseReadoutSize', E], ['pulseReadoutOffsetX', E], ['pulseReadoutOffsetY', E], ['pulseBpm', EA], ['pulseIntensity', EA], ['pulseColorMode', EA], ['pulseHideBar', E]]],
    ['Labels', [['criticalIndicatorVisible', S], ['assassinateIndicatorVisible', S], ['unkillableIndicatorVisible', S]],
      [['criticalOffsetX', S], ['criticalOffsetY', S], ['assassinateOffsetX', S], ['assassinateOffsetY', S], ['unkillableOffsetX', S], ['unkillableOffsetY', S]]],
  ]],
  ['Icons', [
    ['Level and anchoring', [['levelsVisible', E]], [['levelOffsetX', E], ['levelOffsetY', E], ['accessoryAnchorEnabled', S]]],
    ['Ultimate', [['ultimateTimerEnabled', S], ['ultMode', S], ['ultCustom', S], ['ultimateTimerColorMode', S], ['ultimateTimerUnavailableColor', S], ['ultimateTimerAvailableColor', S]],
      [['ultimateTimerDarkness', S], ['ultOffsetX', S], ['ultOffsetY', S], ['ultSize', S]]],
    ['Pickups', [['pickupTimersEnabled', S], ['pickupGunColor', S], ['pickupMovementColor', S], ['pickupSpiritColor', S], ['pickupSurvivalColor', S], ['pickupGlyphColor', S]],
      [['pickupBackgroundDarkness', S], ['pickupSize', S], ['pickupSpacing', S], ['pickupOffsetX', S], ['pickupOffsetY', S]]],
    ['Rejuvenator', [['rejuvSize', S]], [['rejuvOffsetX', S], ['rejuvOffsetY', S], ['rejuvTilt', S]]],
    ['Kill bounty', [['killBountyEnabled', S]], [['killBountyOffsetX', S], ['killBountyOffsetY', S], ['killBountySize', S], ['killBountyTilt', S]]],
    ['Status effect sizes', [['statusScaleFixation', S], ['statusScaleMalice', S], ['statusScaleScrewjab', S], ['statusScaleDjinnsMark', S], ['statusScaleSerratedKnives', S],
      ['statusScaleBarrage', S], ['statusScalePulseGrenade', S], ['statusScaleArcticBeam', S]], []],
  ]],
  ['Units', [
    ['', [['objectiveEnabled', EA], ['objectiveHpTextMode', S], ['objectiveHpPositionEnabled', S], ['objectiveHpOffsetX', S], ['objectiveHpOffsetY', S], ['objectiveHpTilt', S], ['neutralEnabled', S], ['neutralColor', S], ['neutralHpTextMode', S], ['neutralHpPositionEnabled', S], ['neutralHpOffsetX', S], ['neutralHpOffsetY', S], ['neutralHpTilt', S]], []],
  ]],
];
// Ungrouped rows form the page's lead card: its sub-nav shows the lead name and its id says General.
const LEAD = { Bar: 'General', 'HP Text': 'Number and font', Name: 'Name and color' };
const rowId = (key, side) => 'HPColors' + pascal(key) + (side === 'shared' ? '' : pascal(side)) + 'Row';
// The generator renders each fold as enemy column, ally column, then shared column.
function foldRows(entries) {
  return [...entries.filter(([, scope]) => scope !== S).map(([key]) => rowId(key, 'enemy')),
    ...entries.filter(([, scope]) => scope === EA).map(([key]) => rowId(key, 'ally')),
    ...entries.filter(([, scope]) => scope === S).map(([key]) => rowId(key, 'shared'))];
}
function rowsIn(panel) {
  const out = [];
  const walk = node => { for (const child of node.children) { if (child.BHasClass('HPC3Row')) out.push(child.id); else walk(child); } };
  walk(panel); return out;
}
// edit(settings) changes the saved settings the menu hydrates from.
function booted(edit) {
  const boot = loadLayout('hud_escape_menu.xml'); boot.includeScripts();
  if (edit) {
    const settings = JSON.parse(JSON.stringify(boot.harness.$.HPColorsV3Settings.defaults)); edit(settings);
    boot.harness.$.HPColorsV3Store = { attach(api) { api.hydrateSettings(settings); }, commit() {}, getBundle: () => ({ settings, presets: [] }), isHydrated: () => true };
  }
  boot.onload();
  const h = boot.harness, find = id => { const panel = h.contextPanel.FindChildTraverse(id); assert.ok(panel, id); return panel; };
  return { h, find, contract: h.$.HPColorsV3Settings, activate: id => find(id).events.onactivate() };
}

test('ticket 37: tabs run NEW, BAR, HP TEXT, NAME, INDICATORS, ICONS, UNITS, COLORBLIND, PRESETS and the menu opens on BAR', () => {
  const m = booted();
  assert.deepEqual(JSON.parse(JSON.stringify(m.contract.menu.pages.map(page => page.title))), ['NEW', 'BAR', 'HP TEXT', 'NAME', 'INDICATORS', 'ICONS', 'UNITS', 'COLORBLIND', 'PRESETS']);
  assert.equal(m.find('HPColorsPageBar').BHasClass('Active'), true);
  m.activate('HPColorsNavIconsButton');
  assert.equal(m.find('HPColorsPageIcons').BHasClass('Active'), true);
  assert.equal(m.find('HPColorsPageTitle').text, 'ICONS');
});

test('ticket 37: every page lists its cards in the agreed order with each row in the agreed card, fold and order', () => {
  const m = booted();
  const seen = new Set();
  for (const [page, cards] of STRUCTURE) {
    const pageKey = pascal(page), solo = cards.length === 1;
    const subNav = m.find('HPColorsSubNav' + pageKey).children.filter(panel => panel.BHasClass('HPC3SubNavButton'));
    assert.deepEqual(subNav.map(button => button.children.find(child => child.BHasClass('HPC3SubNavLabel')).text), solo ? [] : cards.map(([name]) => name), page + ' sub-nav');
    const cardPanels = m.find('HPColorsPage' + pageKey).children.filter(panel => panel.BHasClass('HPC3Card'));
    assert.deepEqual(cardPanels.map(panel => panel.id), cards.map(([name]) => 'HPColorsCard' + pageKey + pascal(name === LEAD[page] ? 'General' : name || 'General')), page + ' cards');
    cards.forEach(([name, basic, advanced], index) => {
      assert.deepEqual(rowsIn(cardPanels[index]), [...foldRows(basic), ...foldRows(advanced)], page + ' / ' + name);
      for (const [key] of [...basic, ...advanced]) { assert.equal(seen.has(key), false, key + ' listed twice'); seen.add(key); }
      const levels = m.contract.controls.filter(row => [...basic, ...advanced].some(([key]) => key === row.key));
      for (const row of levels) assert.equal(row.level, basic.some(([key]) => key === row.key) ? 'basic' : 'advanced', row.key + ' keeps its level');
    });
  }
  assert.deepEqual([...seen].sort(), [...new Set(m.contract.controls.map(row => row.key))].sort(), 'every setting appears exactly once');
});

test('ticket 37: no card holds a single row and no page rail lists more than seven sub-nav entries', () => {
  const m = booted();
  for (const group of m.contract.menu.groups) {
    const rows = m.contract.controls.filter(row => row.page === group.page && row.group === group.name);
    assert.ok(new Set(rows.map(row => row.key)).size > 1, group.page + ' / ' + group.name + ' holds one setting');
  }
  for (const page of m.contract.menu.pages) {
    assert.ok(m.find(page.subNavId).children.filter(panel => panel.BHasClass('HPC3SubNavButton')).length <= 7, page.name);
  }
});

test('ticket 37: renamed rows say what they show; the label rows keep the game label in capitals', () => {
  const m = booted();
  const name = key => m.contract.controls.find(row => row.key === key).name;
  assert.equal(name('levelsVisible'), 'Show enemy level badge');
  assert.deepEqual(['criticalIndicatorVisible', 'criticalOffsetX', 'criticalOffsetY', 'assassinateIndicatorVisible', 'unkillableOffsetY'].map(name),
    ['CRITICAL label', 'CRITICAL horizontal offset', 'CRITICAL vertical offset', 'ASSASSINATE label', 'UNKILLABLE vertical offset']);
});

test('ticket 37: Reset page on ICONS resets level, ultimate, pickups and rejuvenator but leaves INDICATORS alone', () => {
  const m = booted(next => {
    next.shared.pickupGunColor = '#123456'; next.shared.ultOffsetX += 1; next.side.enemy.levelsVisible = !next.side.enemy.levelsVisible;
    next.side.enemy.staminaColor = '#654321';
  });
  const settings = () => latestPublishedConfig(m.h).settings;
  assert.equal(settings().shared.pickupGunColor, '#123456', 'edited save hydrated');
  m.activate('HPColorsNavIconsButton'); m.activate('HPColorsResetPageButton'); m.activate('HPColorsResetPageConfirmButton');
  const after = settings(), defaults = m.contract.controls;
  const value = (key, side) => defaults.find(row => row.key === key && row.side === side).default;
  assert.equal(after.shared.pickupGunColor, value('pickupGunColor', 'shared'));
  assert.equal(after.shared.ultOffsetX, value('ultOffsetX', 'shared'));
  assert.equal(after.side.enemy.levelsVisible, value('levelsVisible', 'enemy'));
  assert.equal(after.side.enemy.staminaColor, '#654321', 'stamina lives on INDICATORS');
});
