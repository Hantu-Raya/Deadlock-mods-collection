#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { derive } = require('./game-data');
const { buildMenu } = require('./menu-layout');
const ROOT = path.resolve(__dirname, '..');
const columns = ['key', 'slot', 'name', 'type', 'bounds', 'step', 'default', 'side', 'page', 'level', 'unit', 'help', 'keywords'];
const pages = ['Bar', 'HP Text', 'Name', 'Indicators', 'Icons', 'Units', 'Presets'];
const pascal = key => key[0].toUpperCase() + key.slice(1);
const json = value => JSON.stringify(value, null, 2) + '\n';
const sidesOf = row => row.side === 'side-aware' ? ['enemy', 'ally'] : [row.side];
const flatKey = (row, side) => side === 'shared' ? row.key : side + pascal(row.key);
const slotOf = (row, side) => row.side === 'side-aware' ? row.slot[side] : row.slot;

function checkSlotContract(slots, defaults, controls, metadata) {
  const committed = JSON.parse(fs.readFileSync(path.join(ROOT, 'generated/slots.json'), 'utf8'));
  if (!Array.isArray(committed) || !committed.length) throw new Error('Codec slot contract must be a nonempty array');
  const keys = new Set(), numbers = new Set();
  const current = new Map(slots.map(slot => [slot.key, slot]));
  // A removed setting lists its slot numbers in retiredSlots: they may leave the schema, never return,
  // and the codec skips them in older records. The list only grows.
  const retired = metadata && metadata.retiredSlots === undefined ? [] : metadata && metadata.retiredSlots;
  if (!Array.isArray(retired) || new Set(retired).size !== retired.length || retired.some(slot=>!Number.isSafeInteger(slot)||slot<0))
    throw new Error('Invalid retiredSlots: expected unique non-negative slot numbers');
  for (const slot of slots) if (retired.includes(slot.slot)) throw new Error('Setting ' + slot.key + ' reuses retired slot ' + slot.slot + '; retired slot numbers never return.');
  for (const previous of committed) {
    if (!previous || typeof previous.key !== 'string' || !Number.isSafeInteger(previous.slot) || previous.slot < 0 ||
        keys.has(previous.key) || numbers.has(previous.slot)) throw new Error('Codec slot contract is invalid');
    keys.add(previous.key); numbers.add(previous.slot);
    if (!current.has(previous.key) && retired.includes(previous.slot)) continue;
    if (!current.has(previous.key)) throw new Error('Codec slot contract missing key: ' + previous.key + '; an existing slot cannot be removed or reused.');
    if (current.get(previous.key).slot !== previous.slot) throw new Error('Codec slot contract changed: ' + previous.key + ' expected=' + previous.slot + ' actual=' + current.get(previous.key).slot);
  }
  const scope = {$:{}};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'panorama/scripts/hp_colors_v3_settings.js'),'utf8'),scope);
  const baseline = scope.$.HPColorsV3Settings;
  if ((baseline.retiredSlots || []).some(slot=>!retired.includes(slot))) throw new Error('retiredSlots cannot shrink: ' + JSON.stringify(baseline.retiredSlots));
  const oldDefaults = JSON.parse(fs.readFileSync(path.join(ROOT,'generated/defaults.json'),'utf8'));
  if (!metadata || !Number.isSafeInteger(metadata.recordVersion) || metadata.recordVersion < baseline.recordVersion ||
      !Array.isArray(metadata.defaultChanges) || !Array.isArray(metadata.slotAdditions))
    throw new Error('Invalid recordVersion/defaultChanges/slotAdditions contract');
  for (const history of [metadata.defaultChanges, metadata.slotAdditions]) {
    let lastVersion = 0;
    for (const change of history) {
      if (!change || !Number.isSafeInteger(change.version) || change.version <= lastVersion || change.version > metadata.recordVersion ||
          !Array.isArray(change.slots) || new Set(change.slots).size !== change.slots.length || change.slots.some(slot=>!Number.isSafeInteger(slot)||slot<0))
        throw new Error('Invalid recordVersion/defaultChanges/slotAdditions entry');
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
    throw new Error('Committed defaultChanges/slotAdditions history cannot change');
  const introduced = metadata.slotAdditions.flatMap(change=>change.slots);
  if (new Set(introduced).size !== introduced.length ||
      metadata.slotAdditions.some(change=>change.version>baseline.recordVersion && change.slots.some(slot=>numbers.has(slot))))
    throw new Error('slotAdditions cannot relabel an existing or previously introduced slot');
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
      throw new Error('recordVersion ' + version + ' needs a slotAdditions or defaultChanges entry so older records can upgrade; use { "version": ' + version + ', "slots": [] } for a pure bump');
  if ((changed.length || added.length || widened.length) && (metadata.recordVersion <= baseline.recordVersion ||
      changed.some(slot=>!changedCoverage.has(slot)) || added.some(slot=>!addedCoverage.has(slot))))
    throw new Error('Changed slot semantics require a bumped recordVersion with defaultChanges (existing slots) or slotAdditions (new slots): '+changed.concat(added,widened).join(', '));
}

// Ticket 36: settings/news.json feeds the NEW tab. Each item targets setting rows (key, optional side)
// or names a page; ids become panel ids, so they are unique kebab-case words.
function validateNews(news, rows) {
  const fail = (item, message) => { throw new Error('news.json ' + (item && item.id || '<item>') + ': ' + message); };
  if (!Array.isArray(news)) throw new Error('news.json: expected an array');
  const ids = new Set();
  for (const item of news) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail(item, 'expected an object');
    if (Object.keys(item).some(key => !['id', 'release', 'date', 'badge', 'title', 'description', 'targets', 'page'].includes(key))) fail(item, 'unknown field');
    if (typeof item.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.id) || item.id.length > 48) fail(item, 'invalid id');
    if (ids.has(item.id)) fail(item, 'duplicate id'); ids.add(item.id);
    if (typeof item.release !== 'string' || !/^\d+\.\d+\.\d+$/.test(item.release)) fail(item, 'invalid release');
    const date = typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? new Date(item.date + 'T00:00:00Z') : null;
    if (!date || isNaN(date) || date.toISOString().slice(0, 10) !== item.date) fail(item, 'invalid date (YYYY-MM-DD)');
    if (!['New', 'Updated'].includes(item.badge)) fail(item, 'badge must be New or Updated');
    for (const key of ['title', 'description']) if (typeof item[key] !== 'string' || !item[key].trim() || item[key].length > 240) fail(item, 'invalid ' + key);
    if (!Array.isArray(item.targets)) fail(item, 'targets must be an array');
    if (item.page !== undefined && (!pages.includes(item.page) || item.page === 'Presets')) fail(item, 'unknown page');
    // One item opens one page: its targets share a page, and an explicit page must be that page.
    const targetPages = new Set(item.targets.map(target => (rows.find(entry => entry.key === target.key) || {}).page).filter(Boolean));
    if (targetPages.size > 1) fail(item, 'targets span pages ' + [...targetPages].join(', '));
    if (item.page !== undefined && targetPages.size && !targetPages.has(item.page)) fail(item, 'page ' + item.page + ' does not hold its targets');
    if (!item.targets.length && item.page === undefined) fail(item, 'needs a target setting or a page');
    const seen = new Set();
    for (const target of item.targets) {
      if (!target || typeof target !== 'object' || Object.keys(target).some(key => !['key', 'side'].includes(key))) fail(item, 'invalid target');
      const row = rows.find(entry => entry.key === target.key);
      if (!row) fail(item, 'unknown setting ' + target.key);
      if (target.side !== undefined && !(row.side === 'side-aware' && ['enemy', 'ally'].includes(target.side))) fail(item, 'invalid side for ' + target.key);
      for (const side of target.side ? [target.side] : sidesOf(row)) {
        if (seen.has(row.key + side)) fail(item, 'duplicate target ' + target.key); seen.add(row.key + side);
      }
    }
  }
}

function validate(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Expected a nonempty settings array');
  const keys = new Set();
  const menuKeys = new Set();
  const flatKeys = new Set();
  const slotNumbers = new Set();
  for (const row of rows) {
    const fail = message => { throw new Error((row && row.key || '<row>') + ': ' + message); };
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('Expected row object');
    if (columns.some(key => !Object.hasOwn(row, key))) fail('Missing required column');
    if (Object.keys(row).some(key => !columns.includes(key) && !['options', 'group'].includes(key))) fail('Unknown column');
    if (typeof row.key !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(row.key)) fail('Invalid key');
    if (keys.has(row.key) || menuKeys.has(pascal(row.key))) fail('Duplicate key or menu id');
    keys.add(row.key); menuKeys.add(pascal(row.key));
    if (!['boolean', 'number', 'color', 'enum'].includes(row.type)) fail('Unknown type');
    if (!['side-aware', 'shared', 'enemy'].includes(row.side)) fail('Unknown side');
    if (!pages.includes(row.page)) fail('Unknown page');
    if (!['basic', 'advanced'].includes(row.level)) fail('Unknown basic/advanced level');
    if (!['', 'px', '%', 'deg', 's'].includes(row.unit)) fail('Invalid unit');
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
}

function patchStock(text, anchor, replacement) {
  if (text.split(anchor).length !== 2) throw new Error('Stock layout patch anchor missing or ambiguous: ' + anchor);
  return text.replace(anchor, replacement);
}

// Shared v3 Escape-menu and topbar pieces, also published to variant lanes through menuParts().
const MENU_RESUME = 'if (!$.HPColorsMenuCancel()) $.DispatchEvent(&apos;CitadelResumePlaying&apos;, $.GetContextPanel())';
const MENU_STYLES = '\t<include src="s2r://panorama/styles/citadel_ui_color_picker.vcss_c" />\n\t<include src="s2r://panorama/styles/hp_colors_v3_world.vcss_c" />\n\t<include src="s2r://panorama/styles/hp_colors_v3_menu.vcss_c" />\n';
const MENU_SCRIPTS = ['hp_colors_v3_settings', 'hp_colors_v3_from_v2', 'hp_colors_v3_codec', 'hp_colors_v3_storage', 'hp_colors_v3_renderer', 'hp_colors_v3_preview', 'hp_colors_v3_menu']
  .map(name => '\t\t<include src="s2r://panorama/scripts/' + name + '.vjs_c" />\n').join('');
const TOPBAR_SCRIPTS = ['hp_colors_v3_world_settings', 'hp_colors_v3_timers_hud'];
const TOPBAR_CLASS = 'HPColorsV3TimersTopBar';

function stockLayouts(gameData, menu) {
  const resume = MENU_RESUME;
  let text = gameData.menu;
  for (const name of ['citadel_base_styles', 'hud_escape_menu']) {
    text = patchStock(text, name + '.vcss', name + '.vcss_c');
  }
  const scripts = MENU_SCRIPTS;
  text = patchStock(text, '</styles>', MENU_STYLES + '\t</styles>\n\t<scripts>\n' + scripts + '\t</scripts>');
  text = patchStock(text, '<CitadelHudEscapeMenu oncancel="CitadelResumePlaying()">',
    '<CitadelHudEscapeMenu onload="$.HPColorsMenuBoot()" oncancel="' + resume + '">');
  text = patchStock(text, '<Panel id="EscapeBackground" onactivate="CitadelResumePlaying()" />',
    '<Panel id="EscapeBackground" onactivate="' + resume + '" />');
  text = patchStock(text, 'id="EscapeButton" action="MenuBack" onactivate="CitadelResumePlaying()"',
    'id="EscapeButton" action="MenuBack" onactivate="' + resume + '"');
  // The entry point sits in the stock nav like v2's, between feedback and settings.
  text = patchStock(text, '<Panel class="SettingsRow">', menu.button + '<Panel class="SettingsRow">');
  text = patchStock(text, '</CitadelHudEscapeMenu>', menu.fragment + '\t</CitadelHudEscapeMenu>');
  let overlay = patchStock(gameData.overlay, 'unit_status_v2.vcss', 'unit_status_v2.vcss_c');
  overlay = patchStock(overlay, '</styles>', '\t\t<include src="s2r://panorama/styles/hp_colors_v3_world.vcss_c" />\n\t</styles>\n\t<scripts>\n' +
    ['hp_colors_v3_world_settings', 'hp_colors_v3_bridge', 'hp_colors_v3_renderer', 'hp_colors_v3_timers_world', 'hp_colors_v3_world_boot']
      .map(name => '\t\t<include src="s2r://panorama/scripts/' + name + '.vjs_c" />\n').join('') + '\t</scripts>');
  overlay = patchStock(overlay, '<Panel id="InfoHealthContainer">',
    '<Panel id="InfoHealthContainer">\n\t\t\t\t<Panel id="HPColorsV3Level" hittest="false" hittestchildren="false">\n' +
    '\t\t\t\t\t<Label id="unit_level_label" text="{i:player_level}" hittest="false" />\n\t\t\t\t</Panel>');
  // SHOW BOUNDS (ticket 22, v2 HPV2CanvasBounds): a collapsed full-canvas rim outside the motion
  // frame, so it never shakes; one owned root class shows it.
  overlay = patchStock(overlay, '<Panel id="UnitStatus" hittest="false">',
    '<Panel id="HPColorsV3CanvasBounds" hittest="false" hittestchildren="false" />\n\t\t' +
    '<Panel id="HPColorsV3MotionFrame" hittest="false" hittestchildren="false">\n' +
    '\t\t\t<Panel id="HPColorsV3Readout" hittest="false" hittestchildren="false">\n' +
    '\t\t\t\t<Panel id="HPColorsV3ReadoutAnchor" hittest="false" hittestchildren="false">\n' +
    '\t\t\t\t\t<Panel id="HPColorsV3ReadoutRow" hittest="false" hittestchildren="false" />\n' +
    '\t\t\t\t</Panel>\n\t\t\t</Panel>\n\t\t</Panel>\n\t\t<Panel id="UnitStatus" hittest="false">');
  // OLD grid (v2 HPV2PipGrid order): rims under empty boxes, shield/barrier under the fill,
  // healing/delta over it, then the grid kill marker. Boxes are created on first OLD use.
  const pipLayers = ['Outline', 'Empty', 'Shield', 'Armor', 'Fill', 'Healing', 'Delta', 'KillMarker']
    .map(name => '\t\t\t\t\t\t\t<Panel id="HPColorsV3Pip' + name + '" hittest="false" hittestchildren="false" />\n').join('');
  overlay = patchStock(overlay, '<Panel id="UnitHealthbarLines" />',
    '<Panel id="UnitHealthbarLines" />\n\t\t\t\t\t\t<Panel id="HPColorsV3BarOutline" hittest="false" hittestchildren="false" />\n\t\t\t\t\t\t<Panel id="HPColorsV3KillMarker" hittest="false" hittestchildren="false" />' +
    '\n\t\t\t\t\t\t<Panel id="HPColorsV3PipGrid" hittest="false" hittestchildren="false">\n' + pipLayers + '\t\t\t\t\t\t</Panel>');
  overlay = patchStock(overlay, '<Panel id="unit_healthbar_lagging" class="HealthAmount" />',
    '<Panel id="unit_healthbar_lagging" class="HealthAmount" />\n\t\t\t\t\t\t\t<Panel id="HPColorsV3PulseOverlay" class="HPColorsV3PulseOverlay" hittest="false" hittestchildren="false" />');
  overlay = patchStock(overlay, '<Panel id="RejuvenatorActive" />',
    '<Panel id="HPColorsV3RejuvenatorAnchor" hittest="false" hittestchildren="false" />\n\t\t<Panel id="RejuvenatorActive" />');
  for (const name of ['Critical', 'Assassinate', 'Unkillable'])
    overlay = patchStock(overlay, `<Panel id="${name}Indicator">`,
      `<Panel id="HPColorsV3${name}Anchor" class="HPColorsV3StatusLabelAnchor" hittest="false" hittestchildren="false" />\n\t\t<Panel id="${name}Indicator">`);
  let topbar = gameData.topbar;
  for (const sheet of ['citadel_base_styles', 'hud_common', 'citadel_hud_top_bar', 'unit_status_icons'])
    topbar = patchStock(topbar, sheet + '.vcss', sheet + '.vcss_c');
  topbar = patchStock(topbar, '</styles>', '</styles>\n\t<scripts>\n' +
    TOPBAR_SCRIPTS
      .map(name => '\t\t<include src="s2r://panorama/scripts/' + name + '.vjs_c" />\n').join('') + '\t</scripts>');
  topbar = patchStock(topbar, '<CitadelHudTopBar hittest="false">', '<CitadelHudTopBar class="' + TOPBAR_CLASS + '" hittest="false">');
  return { menu: text, overlay, topbar };
}

// Both contexts share schema-derived validation; only the menu receives presentation data.
const validationSource = '  function validateValue(row, value) {\n' +
  '    if (!row) return false;\n' +
  '    if (row.type === "boolean") return typeof value === "boolean";\n' +
  '    if (row.type === "color") return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);\n' +
  '    if (row.type === "enum") return row.options.some(function (option) { return option.value === value; });\n' +
  '    if (row.type === "number") return Number.isFinite(value) && value >= row.bounds[0] && value <= row.bounds[1] && Math.abs((value - row.bounds[0]) / row.step - Math.round((value - row.bounds[0]) / row.step)) <= 1e-8;\n' +
  '    return false;\n' +
  '  }\n' +
  '  function validate(settings) {\n' +
  '    if (!settings || !settings.side || !settings.side.enemy || !settings.side.ally || !settings.shared) return false;\n' +
  '    for (var i = 0; i < fields.length; i++) {\n' +
  '      var row = fields[i], values = row.side === "shared" ? settings.shared : settings.side[row.side];\n' +
  '      if (!validateValue(row, values[row.key])) return false;\n' +
  '    }\n' +
  '    return settings.shared.lowThreshold === undefined || settings.shared.highThreshold === undefined || settings.shared.lowThreshold < settings.shared.highThreshold;\n' +
  '  }\n';

const readNews = root => JSON.parse(fs.readFileSync(path.join(root, 'settings/news.json'), 'utf8'));
function generate(rows, gameData, metadata, news = readNews(ROOT)) { return build(rows, gameData, metadata, news).files; }
function build(rows, gameData, metadata, news) {
  validate(rows);
  if (!metadata || typeof metadata.release !== 'string' || !/^\d+\.\d+\.\d+$/.test(metadata.release)) throw new Error('Invalid release version');
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
  const stockIds = new Set([...gameData.menu.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  // Slot identity is checked first: a removed setting reports the slot contract, not a stale news target.
  checkSlotContract(slots,defaults,rows.flatMap(row => sidesOf(row).map(side => ({ ...row, side }))),metadata);
  validateNews(news, rows);
  const menu = buildMenu(rows, sidesOf, stockIds, metadata.release, news);
  const { ids, controls } = menu;
  const search = menu.search;
  const menuRows = menu.fragment;
  const layouts = stockLayouts(gameData, menu);
  // version is the wire/contract version; release is the shipped version (settings/record.json) the update check compares.
  const contract = { magic: 'HP_COLORS_V3_CONFIG', version: '3.0.0', release: metadata.release, recordVersion: metadata.recordVersion, defaultChanges: metadata.defaultChanges, slotAdditions: metadata.slotAdditions, retiredSlots: metadata.retiredSlots || [], defaults, slots, ids, controls, searchIndex: search, menu: menu.menu,
    heroes: gameData.catalog, gameDataCommit: gameData.pin.commit, gameDataClientVersion: gameData.pin.clientVersion };
  const worldFields = controls.map(({ key, side, type, bounds, step, options }) => ({
    key, side, type, bounds, step,
    ...(options ? { options: options.map(({ value }) => ({ value })) } : {}),
  }));
  const files = {
    'generated/defaults.json': json(defaults),
    'generated/slots.json': json(slots),
    'generated/ids.json': json(ids),
    'generated/search-index.json': json(search),
    'generated/heroes.json': json(gameData.catalog),
    'panorama/styles/unit_status_v2.css': gameData.stylesheet,
    'generated/menu-rows.xml': menuRows,
    'panorama/layout/hud_escape_menu.xml': layouts.menu,
    'panorama/layout/unit_status_overlay_v2.xml': layouts.overlay,
    'panorama/layout/citadel_hud_top_bar.xml': layouts.topbar,
    'panorama/scripts/hp_colors_v3_world_settings.js': '// GENERATED by tools/generate.js. World validation only.\n(function () {\n  "use strict";\n' +
      '  var fields = ' + JSON.stringify(worldFields) + ';\n' + validationSource +
      '  $.HPColorsV3WorldSettings = { version: "3.0.0", validate: validate, validateValue: validateValue };\n})();\n',
    'panorama/scripts/hp_colors_v3_settings.js': '// GENERATED by tools/generate.js. Do not edit.\n(function () {\n  "use strict";\n  var contract = ' + JSON.stringify(contract) + ';\n' +
      '  var fields = contract.controls;\n' + validationSource +
      '  contract.validate = validate;\n  contract.validateValue = validateValue;\n  $.HPColorsV3Settings = contract;\n})();\n',
  };
  return { files, menu };
}

// Published for variant lanes (hp_colors_rewrite_v3_qollock): the exact v3 Escape-menu and topbar
// pieces this generator injects, computed from the v3 sources, plus the v3 files they come with so a
// lane can refuse a stale v3 checkout. The v3 lane itself knows nothing about variants.
function menuParts(root = ROOT) {
  const { files, menu } = build(JSON.parse(fs.readFileSync(path.join(root, 'settings/schema.json'), 'utf8')), derive(root),
    JSON.parse(fs.readFileSync(path.join(root, 'settings/record.json'), 'utf8')), readNews(root));
  return { resume: MENU_RESUME, styles: MENU_STYLES, scripts: MENU_SCRIPTS, button: menu.button, fragment: menu.fragment,
    ids: menu.ids, topbarScripts: TOPBAR_SCRIPTS, topbarClass: TOPBAR_CLASS, files };
}

// Live 6782 asset contract: a rule with a 37-selector / 2.9 KB selector list compiled cleanly but
// failed to parse at runtime ("Failed to parse selector") and aborted the Escape-menu load. Every
// packed stylesheet keeps each rule at <= 10 comma-separated selectors and <= 1,024 characters.
const MAX_SELECTORS = 10, MAX_SELECTOR_CHARS = 1024;
function checkStylesheets(dir) {
  const files = fs.readdirSync(dir).filter(name => name.endsWith('.css')).sort();
  if (!files.length) throw new Error('No stylesheets found in ' + dir);
  let rules = 0, widest = 0;
  for (const name of files) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ''));
    let depth = 0, prelude = '', skip = false, line = 1, start = 1;
    for (const ch of text) {
      if (ch === '\n') line++;
      if (ch === '{') {
        if (depth === 0) {
          const selector = prelude.slice(prelude.lastIndexOf(';') + 1).trim();
          skip = selector.charAt(0) === '@';
          if (!skip) {
            const count = selector.split(',').length;
            rules++; widest = Math.max(widest, count);
            if (!selector) throw new Error(name + ':' + start + ': empty selector');
            if (count > MAX_SELECTORS) throw new Error(name + ':' + start + ': rule has ' + count + ' selectors (max ' + MAX_SELECTORS + '; live 6782 fails to parse long selector lists)');
            if (selector.length > MAX_SELECTOR_CHARS) throw new Error(name + ':' + start + ': selector list has ' + selector.length + ' characters (max ' + MAX_SELECTOR_CHARS + ')');
          }
        }
        depth++; prelude = '';
      } else if (ch === '}') {
        depth--; prelude = '';
        if (depth < 0) throw new Error(name + ':' + line + ': unbalanced braces');
      } else if (depth === 0) {
        if (!prelude.trim()) start = line;
        prelude += ch;
      }
    }
    if (depth !== 0) throw new Error(name + ': unbalanced braces');
    // Live 6782: `opacity-mask: none` does not cancel an earlier mask; delete declarations instead.
    const lineOf = index => text.slice(0, index).split('\n').length;
    const none = /opacity-mask\s*:\s*none\b/i.exec(text);
    if (none) throw new Error(name + ':' + lineOf(none.index) + ': opacity-mask: none does not cancel an earlier mask in game; remove the mask declaration instead');
    const stockMask = name === 'unit_status_v2.css' && /opacity-mask/i.exec(text);
    if (stockMask) throw new Error(name + ':' + lineOf(stockMask.index) + ': the generated stock sheet must declare no opacity-mask (BAR STYLE V2 restores masks through owned classes)');
    // Owned sheets cannot resolve the stock base sheet's @define colour macros.
    if (name !== 'unit_status_v2.css') {
      const keywords = new Set(['white', 'black', 'transparent', 'none', 'solid', 'fill', 'inset', 'rgb', 'rgba',
        'gradient', 'linear', 'radial', 'from', 'to', 'color-stop']);
      for (const declaration of text.matchAll(/(?:^|[;{}])\s*((?:background-|wash-|border(?:-(?:top|bottom|left|right))?-)?color|border(?:-(?:top|bottom|left|right))?|(?:text|box|img)-shadow)\s*:\s*([^;{}]+)(?=;)/g)) {
        const value = declaration[2].replace(/#[a-f\d]+/gi, '').replace(/[+-]?[\d.]+(?:px|deg|s|%)?/g, '');
        for (const token of value.matchAll(/[a-z][\w-]*/gi)) {
          if (!keywords.has(token[0].toLowerCase())) throw new Error(name + ':' + lineOf(declaration.index) + ': unresolved colour macro ' + token[0] + ' in owned CSS; use a hex literal');
        }
      }
    }
  }
  return { files: files.length, rules, widest };
}

function main(args) {
  let settings = path.join(ROOT, 'settings/schema.json');
  let output = ROOT;
  let check = false;
  let gameDataRoot = ROOT;
  let recordContract = path.join(ROOT,'settings/record.json');
  let stylesRoot = path.join(ROOT, 'panorama/styles');
  let newsFile = path.join(ROOT, 'settings/news.json');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') check = true;
    else if (['--settings', '--output-root', '--game-data-root', '--record-contract', '--styles-root', '--news'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      if (args[i] === '--settings') settings = path.resolve(args[++i]);
      else if (args[i] === '--game-data-root') gameDataRoot = path.resolve(args[++i]);
      else if (args[i] === '--record-contract') recordContract = path.resolve(args[++i]);
      else if (args[i] === '--styles-root') stylesRoot = path.resolve(args[++i]);
      else if (args[i] === '--news') newsFile = path.resolve(args[++i]);
      else output = path.resolve(args[++i]);
    } else throw new Error('Unknown or incomplete argument: ' + args[i]);
  }
  const files = generate(JSON.parse(fs.readFileSync(settings, 'utf8')), derive(gameDataRoot), JSON.parse(fs.readFileSync(recordContract,'utf8')), JSON.parse(fs.readFileSync(newsFile, 'utf8')));
  const stale = [];
  for (const [relative, text] of Object.entries(files)) {
    const target = path.join(output, relative);
    if (check) {
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== text.replace(/\r\n/g, '\n')) stale.push(relative);
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, text, 'utf8');
    }
  }
  if (stale.length) throw new Error('Stale generated files: ' + stale.join(', '));
  const css = checkStylesheets(stylesRoot);
  console.log('HPV3 stylesheets: ' + css.files + ' files, ' + css.rules + ' rules, max ' + css.widest + ' selectors per rule');
  console.log('HPV3 generator: ' + Object.keys(files).length + ' outputs ' + (check ? 'current' : 'written'));
}
module.exports = { generate, menuParts };
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
