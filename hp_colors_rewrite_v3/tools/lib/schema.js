'use strict';
// Settings table (settings/schema.json) shape and validation: columns, types, sides, levels, units, explicit codec
// slots, defaults and the `requires` graph. Errors name the file and the row key.
const { PAGES } = require('./menu-markup');
// The generator's vocabulary: every list a row's fields are checked against, and that the menu, news and
// stylesheet checks read instead of keeping their own copies.
const COLUMNS = ['key', 'slot', 'name', 'type', 'bounds', 'step', 'default', 'side', 'page', 'level', 'unit', 'help', 'keywords'];
const TYPES = ['boolean', 'number', 'color', 'enum'];
const SIDES = ['enemy', 'ally'];
const ROW_SIDES = ['side-aware', 'shared', 'enemy'];
const LEVELS = ['basic', 'advanced'];
const UNITS = ['', 'px', '%', 'deg', 's'];
const PAGES_WITH_ROWS = PAGES.filter(page => page.hasRows).map(page => page.name);
const pascal = key => key[0].toUpperCase() + key.slice(1);
const sidesOf = row => row.side === 'side-aware' ? SIDES.slice() : [row.side];
const flatKey = (row, side) => side === 'shared' ? row.key : side + pascal(row.key);
const slotOf = (row, side) => row.side === 'side-aware' ? row.slot[side] : row.slot;

function validate(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('schema.json: Expected a nonempty settings array');
  const keys = new Set();
  const menuKeys = new Set();
  const flatKeys = new Set();
  const slotNumbers = new Set();
  for (const [index, row] of rows.entries()) {
    const fail = message => { throw new Error('schema.json ' + (row && row.key || '<row ' + index + '>') + ': ' + message); };
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('Expected row object');
    if (COLUMNS.some(key => !Object.hasOwn(row, key))) fail('Missing required column');
    if (Object.keys(row).some(key => !COLUMNS.includes(key) && !['options', 'group', 'requires'].includes(key))) fail('Unknown column');
    if (typeof row.key !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(row.key)) fail('Invalid key');
    if (keys.has(row.key) || menuKeys.has(pascal(row.key))) fail('Duplicate key or menu id');
    keys.add(row.key); menuKeys.add(pascal(row.key));
    if (!TYPES.includes(row.type)) fail('Unknown type');
    if (!ROW_SIDES.includes(row.side)) fail('Unknown side');
    if (!PAGES_WITH_ROWS.includes(row.page)) fail('Unknown page');
    if (!LEVELS.includes(row.level)) fail('Unknown basic/advanced level');
    if (!UNITS.includes(row.unit)) fail('Invalid unit');
    if (Object.hasOwn(row, 'group') && (typeof row.group !== 'string' || !row.group.trim())) fail('Invalid group');
    if (['name', 'help'].some(key => typeof row[key] !== 'string' || !row[key].trim())) fail('Invalid name/help');
    if (!Array.isArray(row.keywords) || row.keywords.some(word => typeof word !== 'string' || !word.trim())) fail('Invalid keywords');
    if (row.type === 'number') {
      if (!Array.isArray(row.bounds) || row.bounds.length !== 2 || !row.bounds.every(Number.isFinite) || row.bounds[0] > row.bounds[1]) fail('Invalid bounds');
      if (!Number.isFinite(row.step) || row.step <= 0) fail('Invalid step');
    } else if (row.bounds !== null || row.step !== null) fail('Non-number bounds/step must be null');
    if (row.type === 'enum') {
      if (!Array.isArray(row.options) || !row.options.length || row.options.some(option => !option || typeof option !== 'object' ||
          Array.isArray(option) || Object.keys(option).sort().join(',') !== 'label,value' ||
          typeof option.value !== 'string' || !option.value || typeof option.label !== 'string' || !option.label.trim()) ||
          new Set(row.options.map(option => option.value)).size !== row.options.length) fail('Invalid enum options; expected unique value/label objects');
    } else if (Object.hasOwn(row, 'options')) fail('Options only apply to enums');
    let values = [row.default];
    if (row.side === 'side-aware') {
      if (!row.default || typeof row.default !== 'object' || Array.isArray(row.default) || Object.keys(row.default).sort().join(',') !== 'ally,enemy') fail('Expected enemy/ally defaults');
      values = [row.default.enemy, row.default.ally];
    }
    if (row.side === 'side-aware' && (!row.slot || typeof row.slot !== 'object' || Array.isArray(row.slot) ||
        Object.keys(row.slot).sort().join(',') !== 'ally,enemy')) fail('Expected explicit enemy/ally slots');
    for (const side of sidesOf(row)) {
      const flat = flatKey(row, side);
      const slot = slotOf(row, side);
      if (flatKeys.has(flat)) fail('Duplicate flat codec key: ' + flat);
      if (!Number.isSafeInteger(slot) || slot < 0) fail('Invalid explicit slot');
      if (slotNumbers.has(slot)) fail('Duplicate explicit slot: ' + slot);
      flatKeys.add(flat); slotNumbers.add(slot);
    }
    for (const value of values) {
      if (row.type === 'boolean' && typeof value !== 'boolean') fail('Invalid boolean default');
      if (row.type === 'color' && (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value))) fail('Invalid color default');
      if (row.type === 'enum' && !row.options.some(option => option.value === value)) fail('Invalid enum default');
      if (row.type === 'number') {
        if (!Number.isFinite(value) || value < row.bounds[0] || value > row.bounds[1]) fail('Default outside bounds');
        const steps = (value - row.bounds[0]) / row.step;
        if (Math.abs(steps - Math.round(steps)) > 1e-8) fail('Default off step');
      }
    }
  }
  validateRequires(rows);
}

// Dependent rows (2026-10-28): `requires` lists what must hold for a row to be usable; the menu greys it
// otherwise. A condition is { key } (switch on), { key, is: [options] } (mode), { key, above: n } (number)
// or { any: [conditions] } (either-of). Each must point at another real row, readable from every side the
// row has, and the requirement graph has no loops.
function validateRequires(rows) {
  const byKey = new Map(rows.map(row => [row.key, row]));
  const edges = new Map();
  for (const row of rows) {
    if (!Object.hasOwn(row, 'requires')) continue;
    const fail = message => { throw new Error('schema.json ' + row.key + ': ' + message); };
    if (!Array.isArray(row.requires) || !row.requires.length) fail('requires must be a nonempty array');
    const targets = new Set();
    const check = (condition, nested) => {
      if (!condition || typeof condition !== 'object' || Array.isArray(condition)) fail('Invalid requirement');
      if (Object.hasOwn(condition, 'any')) {
        if (nested || Object.keys(condition).length !== 1 || !Array.isArray(condition.any) || condition.any.length < 2) fail('Invalid either-of requirement');
        condition.any.forEach(inner => check(inner, true));
        return;
      }
      if (Object.keys(condition).some(key => !['key', 'is', 'above'].includes(key)) || Object.hasOwn(condition, 'is') && Object.hasOwn(condition, 'above')) fail('Invalid requirement fields');
      const target = byKey.get(condition.key);
      if (!target) fail('Requirement points at unknown setting ' + condition.key);
      if (target === row) fail('Requirement points at itself');
      if (target.type === 'boolean') {
        if (Object.hasOwn(condition, 'is') || Object.hasOwn(condition, 'above')) fail('A switch requirement takes no value: ' + condition.key);
      } else if (target.type === 'enum') {
        if (!Array.isArray(condition.is) || !condition.is.length || Object.hasOwn(condition, 'above') ||
            condition.is.some(value => !target.options.some(option => option.value === value))) fail('A mode requirement needs real options: ' + condition.key);
      } else if (target.type === 'number') {
        if (!Number.isFinite(condition.above) || Object.hasOwn(condition, 'is')) fail('A number requirement needs above: ' + condition.key);
      } else fail('A color cannot be a requirement: ' + condition.key);
      for (const side of sidesOf(row)) {
        if (side !== 'shared' && target.side !== 'shared' && !sidesOf(target).includes(side)) fail('Requirement ' + condition.key + ' has no ' + side + ' value');
      }
      targets.add(condition.key);
    };
    row.requires.forEach(condition => check(condition, false));
    edges.set(row.key, [...targets]);
  }
  const state = new Map();
  const visit = key => {
    if (state.get(key) === 'done') return;
    if (state.get(key) === 'open') throw new Error('schema.json ' + key + ': requirement loop');
    state.set(key, 'open');
    for (const next of edges.get(key) || []) visit(next);
    state.set(key, 'done');
  };
  for (const key of edges.keys()) visit(key);
}

module.exports = { COLUMNS, TYPES, SIDES, ROW_SIDES, LEVELS, UNITS, pascal, sidesOf, flatKey, slotOf, validate };
