'use strict';
// Codec slot contract (settings/record.json against the committed generated/slots.json and the committed
// hp_colors_v3_settings.js): the defaults and slot list a schema produces, the shipped release, and the
// rules that keep a slot's number and meaning stable across record versions.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sidesOf, flatKey, slotOf } = require('./schema');
const { readJson } = require('./output');
const ROOT = path.resolve(__dirname, '../..');

function validateRelease(metadata) {
  if (!metadata || typeof metadata.release !== 'string' || !/^\d+\.\d+\.\d+$/.test(metadata.release))
    throw new Error('record.json: Invalid release version: ' + JSON.stringify(metadata && metadata.release));
}

// Schema defaults by side and the flat codec slot list, ordered by slot number.
function buildSlots(rows) {
  const defaults = { side: { enemy: {}, ally: {} }, shared: {} };
  const slots = [];
  for (const row of rows) {
    for (const side of sidesOf(row)) {
      const value = row.side === 'side-aware' ? row.default[side] : row.default;
      (side === 'shared' ? defaults.shared : defaults.side[side])[row.key] = value;
      slots.push({ slot: slotOf(row, side), key: flatKey(row, side), setting: row.key, side, type: row.type });
    }
  }
  slots.sort((a, b) => a.slot - b.slot);
  return { defaults, slots };
}

function checkSlotContract(slots, defaults, controls, metadata) {
  const committed = readJson(path.join(ROOT, 'generated/slots.json'));
  if (!Array.isArray(committed) || !committed.length) throw new Error('generated/slots.json: Codec slot contract must be a nonempty array');
  const keys = new Set(), numbers = new Set();
  const current = new Map(slots.map(slot => [slot.key, slot]));
  // A removed setting lists its slot numbers in retiredSlots: they may leave the schema, never return,
  // and the codec skips them in older records. The list only grows.
  const retired = metadata && metadata.retiredSlots === undefined ? [] : metadata && metadata.retiredSlots;
  if (!Array.isArray(retired) || new Set(retired).size !== retired.length || retired.some(slot=>!Number.isSafeInteger(slot)||slot<0))
    throw new Error('record.json: Invalid retiredSlots: expected unique non-negative slot numbers');
  for (const slot of slots) if (retired.includes(slot.slot)) throw new Error('record.json: Setting ' + slot.key + ' reuses retired slot ' + slot.slot + '; retired slot numbers never return.');
  for (const [index, previous] of committed.entries()) {
    if (!previous || typeof previous.key !== 'string' || !Number.isSafeInteger(previous.slot) || previous.slot < 0 ||
        keys.has(previous.key) || numbers.has(previous.slot)) throw new Error('generated/slots.json: Codec slot contract is invalid at entry ' + index + ': ' + JSON.stringify(previous));
    keys.add(previous.key); numbers.add(previous.slot);
    if (!current.has(previous.key) && retired.includes(previous.slot)) continue;
    if (!current.has(previous.key)) throw new Error('Codec slot contract missing key: ' + previous.key + '; an existing slot cannot be removed or reused.');
    if (current.get(previous.key).slot !== previous.slot) throw new Error('Codec slot contract changed: ' + previous.key + ' expected=' + previous.slot + ' actual=' + current.get(previous.key).slot);
  }
  const scope = {$:{}};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'panorama/scripts/hp_colors_v3_settings.js'),'utf8'),scope);
  const baseline = scope.$.HPColorsV3Settings;
  if ((baseline.retiredSlots || []).some(slot=>!retired.includes(slot))) throw new Error('record.json: retiredSlots cannot shrink: ' + JSON.stringify(baseline.retiredSlots));
  const oldDefaults = JSON.parse(fs.readFileSync(path.join(ROOT,'generated/defaults.json'),'utf8'));
  if (!metadata || !Number.isSafeInteger(metadata.recordVersion) || metadata.recordVersion < baseline.recordVersion ||
      !Array.isArray(metadata.defaultChanges) || !Array.isArray(metadata.slotAdditions))
    throw new Error('record.json: Invalid recordVersion/defaultChanges/slotAdditions contract');
  for (const [name, history] of [['defaultChanges', metadata.defaultChanges], ['slotAdditions', metadata.slotAdditions]]) {
    let lastVersion = 0;
    for (const change of history) {
      if (!change || !Number.isSafeInteger(change.version) || change.version <= lastVersion || change.version > metadata.recordVersion ||
          !Array.isArray(change.slots) || new Set(change.slots).size !== change.slots.length || change.slots.some(slot=>!Number.isSafeInteger(slot)||slot<0))
        throw new Error('record.json: Invalid recordVersion/defaultChanges/slotAdditions entry in ' + name + ': ' + JSON.stringify(change));
      lastVersion = change.version;
    }
  }
  // Before ticket 15, every recorded change was a slot addition, not a changed
  // default. Move that unreleased history once; both histories are immutable thereafter.
  const histories = [
    [metadata.defaultChanges, baseline.slotAdditions ? baseline.defaultChanges : []],
    [metadata.slotAdditions, baseline.slotAdditions || baseline.defaultChanges],
  ];
  for (const [next, previous] of histories) if (JSON.stringify(next.slice(0,previous.length)) !== JSON.stringify(previous))
    throw new Error('record.json: Committed defaultChanges/slotAdditions history cannot change');
  const introduced = metadata.slotAdditions.flatMap(change=>change.slots);
  if (new Set(introduced).size !== introduced.length ||
      metadata.slotAdditions.some(change=>change.version>baseline.recordVersion && change.slots.some(slot=>numbers.has(slot))))
    throw new Error('record.json: slotAdditions cannot relabel an existing or previously introduced slot');
  const changed = [], added = [], widened = [];
  const value = (source,slot) => (slot.side === 'shared' ? source.shared : source.side[slot.side])[slot.setting];
  for (const slot of slots) {
    const previous = committed.find(item=>item.key===slot.key);
    const row = controls.find(item=>item.key===slot.setting&&item.side===slot.side);
    const old = previous && baseline.controls.find(item=>item.key===previous.setting&&item.side===previous.side);
    const semantics = item => [item.type,item.side,item.setting];
    const range = item => [item.bounds,item.step,(item.options||[]).map(option=>option.value)];
    if (!previous) { added.push(slot.slot); continue; }
    const sameMeaning = JSON.stringify(semantics(slot))===JSON.stringify(semantics(previous)) && !!old &&
      JSON.stringify(value(defaults,slot))===JSON.stringify(value(oldDefaults,previous));
    // Appending enum options only widens what the slot accepts: the default stays implicit and older
    // readers treat the new values as newer data. It still needs a record-version bump.
    const oldOptions = old ? (old.options||[]).map(option=>option.value) : [], newOptions = (row.options||[]).map(option=>option.value);
    const appended = sameMeaning && row.type === 'enum' && newOptions.length > oldOptions.length &&
      oldOptions.every((option,index)=>newOptions[index]===option);
    if (appended) { widened.push(slot.slot); continue; }
    if (!sameMeaning || JSON.stringify(range(row))!==JSON.stringify(range(old))) changed.push(slot.slot);
  }
  const coverage = history => new Set(history.filter(change=>change.version>baseline.recordVersion).flatMap(change=>change.slots));
  const changedCoverage = coverage(metadata.defaultChanges), addedCoverage = coverage(metadata.slotAdditions);
  // The codec builds identity upgrade steps from slotAdditions (defaultChanges need a coded step), so every
  // bumped version needs an entry; a pure bump, such as an appended enum option, uses { version, slots: [] }.
  for (let version = baseline.recordVersion + 1; version <= metadata.recordVersion; version++)
    if (!metadata.slotAdditions.some(change=>change.version===version) && !metadata.defaultChanges.some(change=>change.version===version))
      throw new Error('record.json: recordVersion ' + version + ' needs a slotAdditions or defaultChanges entry so older records can upgrade; use { "version": ' + version + ', "slots": [] } for a pure bump');
  if ((changed.length || added.length || widened.length) && (metadata.recordVersion <= baseline.recordVersion ||
      changed.some(slot=>!changedCoverage.has(slot)) || added.some(slot=>!addedCoverage.has(slot))))
    throw new Error('record.json: Changed slot semantics require a bumped recordVersion with defaultChanges (existing slots) or slotAdditions (new slots): '+changed.concat(added,widened).join(', '));
}

module.exports = { validateRelease, buildSlots, checkSlotContract };
