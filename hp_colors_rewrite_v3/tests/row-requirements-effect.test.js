'use strict';
// A greyed row must really do nothing (user, 2026-11-02: rows were greyed or editable regardless of whether
// they changed the bars). For several setting mixes, every row the menu greys is changed to another valid
// value and the world renderer plan is recomputed for hero, objective and neutral camp bars on both sides
// at low, middle and high health: no greyed row may change any bar that would be customized.
// Ways this can fail: a requirement that greys a row the HP number, objective bars or neutral camps still
// use; a plan sample that skips a bar kind or health band; a unit bar sampled while its gate is closed (the
// carrier would leave it stock, so it must count as unchanged).
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadLayout, latestPublishedConfig, runInVm } = require('./boot-layout');

function booted() {
  const boot = loadLayout('hud_escape_menu.xml');
  boot.includeScripts();
  const h = boot.harness;
  let menuApi;
  const store = h.$.HPColorsV3Store;
  h.$.HPColorsV3Store = { ...store, attach(api) { menuApi = api; return store.attach(api); } };
  boot.onload();
  const find = id => h.contextPanel.FindChildTraverse(id);
  runInVm(find('HPColorsMenuButton').GetAttributeString('onactivate', ''), boot.context);
  const slider = find('HPColorsPreviewHealthSlider'); slider.value = 10; slider.events.onvaluechanged();
  return { h, find, api: () => menuApi, facts: () => h.$.HPColorsV3Preview.inspect().facts };
}

const clone = value => JSON.parse(JSON.stringify(value));
function other(row, value) {
  if (row.type === 'boolean') return !value;
  if (row.type === 'enum') return row.options.map(option => option.value).find(option => option !== value);
  if (row.type === 'color') return value === '#123456' ? '#654321' : '#123456';
  const step = (row.step || 1) * 5, [low, high] = row.bounds;
  return value + step <= high ? value + step : value - step >= low ? value - step : value === low ? high : low;
}
const MIXES = {
  defaults: settings => settings,
  allyNumber: settings => { settings.side.ally.hpTextVisible = true; return settings; },
  old: settings => { settings.shared.barStyle = 'old'; return settings; },
  colorsOff: settings => {
    for (const side of ['enemy', 'ally']) Object.assign(settings.side[side], { barColorEnabled: false, hpTextVisible: false });
    return settings;
  },
  colorsOffUnits: settings => {
    for (const side of ['enemy', 'ally']) Object.assign(settings.side[side], { barColorEnabled: false, hpTextVisible: false, objectiveEnabled: true });
    settings.shared.neutralEnabled = true; return settings;
  },
  numberPulse: settings => {
    for (const side of ['enemy', 'ally']) Object.assign(settings.side[side], { barColorEnabled: false, hpTextVisible: true, pulseEnabled: true, pulseReadout: true, pulseColorEnabled: true });
    return settings;
  },
};

test('a greyed row never changes a customized hero, objective or neutral camp bar', () => {
  const m = booted();
  const contract = m.h.$.HPColorsV3Settings, base = m.facts();
  const samples = [];
  for (const fraction of [0.1, 0.5, 0.9]) {
    const health = { ...base, fraction, fillCoverage: fraction };
    samples.push({ ...health, kind: 'player', side: 'enemy', enemy: true, friend: false, ultimateAngle: 180, bounty: 1234 });
    samples.push({ ...health, kind: 'player', side: 'ally', enemy: false, friend: true, ultimateAngle: 180 });
    samples.push({ ...health, kind: 'building', side: 'enemy', enemy: true, friend: false });
    samples.push({ ...health, kind: 'building', side: 'ally', enemy: false, friend: true });
    samples.push({ ...health, kind: 'neutral', side: 'neutral', enemy: false, friend: false });
  }
  // The carrier leaves a unit bar stock while its gate is closed (renderer carrier eligibility).
  const customized = (input, settings) => input.kind === 'player' ||
    (input.side === 'neutral' ? settings.shared.neutralEnabled : settings.side[input.side].objectiveEnabled);
  const bars = settings => samples.map(input =>
    customized(input, settings) ? JSON.stringify(m.h.$.HPColorsV3Renderer.plan(input, settings)) : 'stock');
  const leaks = [];
  let greyed = 0;
  for (const [name, mix] of Object.entries(MIXES)) {
    m.api().applySettings(mix(clone(contract.defaults)), {});
    const settings = clone(latestPublishedConfig(m.h).settings), before = bars(settings).join('\n');
    for (const row of contract.controls) {
      if (!m.find(row.rowId).BHasClass('HPC3RowDisabled')) continue;
      greyed++;
      const changed = clone(settings), holder = row.side === 'shared' ? changed.shared : changed.side[row.side];
      holder[row.key] = other(row, holder[row.key]);
      if (bars(changed).join('\n') !== before) leaks.push(name + ': ' + row.key + ' (' + row.side + ')');
    }
  }
  assert.ok(greyed > 100, 'the mixes grey many rows (' + greyed + ')');
  assert.deepEqual(leaks, []);
});
