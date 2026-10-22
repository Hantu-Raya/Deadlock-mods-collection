'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadLayout, sourceRoot, latestPublishedConfig } = require('./boot-layout');
const { computed } = require('./style-cascade');
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'settings/schema.json'), 'utf8'));

// Real generated panels and menu handlers; only pointer/focus state is supplied by the fixture.
function theme() {
  const boot = loadLayout('hud_escape_menu.xml'); boot.includeScripts();
  const h = boot.harness, commits = [], resets = [];
  let api;
  h.$.HPColorsV3Store = { attach(value) { api = value; value.hydrateSettings(value.getSettings()); },
    commit(value) { commits.push(value); }, resetUnreadableSave(value) { resets.push(value); return true; } };
  boot.onload();
  const find = id => { const panel = h.contextPanel.FindChildTraverse(id); assert.ok(panel, id); return panel; };
  const fire = (id, event = 'onactivate') => { const fn = find(id).events[event]; assert.equal(typeof fn, 'function', id + ' ' + event); fn(); };
  const child = (panel, name) => { const found = panel.children.find(p => p.BHasClass(name)); assert.ok(found, name); return found; };
  const config = () => latestPublishedConfig(h);
  h.$.HPColorsMenuToggle();
  return { h, api, find, fire, child, config, commits, resets, contract: h.$.HPColorsV3Settings };
}
function state(panel, ...states) { panel.states = states; }
function ancestor(panel, className) {
  for (let node = panel.GetParent(); node; node = node.GetParent()) if (node.BHasClass(className)) return node;
  return null;
}
function values(settings, row) { return row.side === 'shared' ? settings.shared : settings.side[row.side]; }
function cell(m, row) { return m.contract.slots.find(slot => slot.side === row.side && slot.setting === row.key).slot; }
function changed(row) {
  if (row.type === 'boolean') return !row.default;
  if (row.type === 'color') return row.default === '#123456' ? '#654321' : '#123456';
  if (row.type === 'enum') return row.options.find(option => option.value !== row.default).value;
  return row.default === row.bounds[0] ? row.bounds[1] : row.bounds[0];
}

test('theme cascade requires real hover/focus states and honours Selected/Checked classes', () => {
  const m = theme(), nav = m.find('HPColorsNavNameButton'), brush = m.child(nav, 'HPC3NavBrush'), label = m.child(nav, 'HPC3NavLabel');
  assert.equal(computed(brush, 'opacity'), '0'); assert.equal(computed(label, 'color'), '#FFEFD788');
  state(nav, 'hover'); assert.equal(computed(brush, 'opacity'), '0.2'); assert.equal(computed(label, 'color'), '#FFEFD7');
  state(nav); assert.equal(computed(brush, 'opacity'), '0');
  state(nav, 'focus'); assert.equal(computed(brush, 'opacity'), '0.2');
  m.fire(nav.id); assert.equal(computed(brush, 'opacity'), '1'); assert.equal(computed(label, 'color'), '#10130D');
  state(nav, 'hover'); assert.equal(computed(brush, 'opacity'), '1', 'Selected beats hover at equal specificity');
  const toggle = m.find('HPColorsBarColorEnabledAllyToggle');
  const off = m.child(toggle, 'HPC3ToggleOff'), on = m.child(toggle, 'HPC3ToggleOn');
  assert.equal(computed(off, 'opacity'), '1'); assert.equal(computed(on, 'opacity'), '0'); m.fire(toggle.id);
  assert.equal(computed(off, 'opacity'), '0'); assert.equal(computed(on, 'opacity'), '1');
});

test('full-screen shell has no title header, border or fill; footer keeps close, Undo, save status and recovery', () => {
  const m = theme(), shell = m.find('HPColorsEditorShell'), footer = m.find('HPColorsFooter');
  assert.equal(computed(shell, 'width'), '100%'); assert.equal(computed(shell, 'height'), '100%');
  assert.equal(computed(shell, 'border'), undefined); assert.equal(computed(shell, 'backgroundColor'), undefined);
  assert.equal(shell.children.some(p => p.BHasClass('HPC3Header')), false);
  assert.equal(computed(m.child(m.find('HPColorsMenuHost'), 'HPC3Backdrop'), 'backgroundColor'), '#0b0d10'); assert.match(computed(m.child(m.find('HPColorsMenuHost'), 'HPC3Backdrop'), 'backgroundImage'), /temp_background_environment_png/);
  for (const id of ['CloseButton', 'UndoButton', 'SaveStatus', 'ResetSaveButton', 'ResetSaveConfirmButton']) assert.ok(m.find('HPColors' + id).GetParent() === footer);
  const close = m.find('HPColorsCloseButton');
  assert.equal(close.children[0].text, 'ESC BACK'); assert.equal(computed(close, 'opacity'), '0.2');
  assert.equal(computed(close.children[0], 'fontFamily'), 'block'); assert.equal(computed(close.children[0], 'fontSize'), '20px');
  state(close, 'hover'); assert.equal(computed(close, 'brightness'), '2');
  m.fire(close.id); assert.equal(m.find('HPColorsMenuHost').BHasClass('HPC3Open'), false);
});

test('footer unreadable-save recovery remains reachable, red and explicitly confirmed', () => {
  const m = theme(), reset = m.find('HPColorsResetSaveButton'), confirm = m.find('HPColorsResetSaveConfirmButton');
  assert.equal(computed(reset, 'visibility'), 'collapse'); assert.equal(computed(confirm, 'visibility'), 'collapse');
  m.api.setSaveResetAvailable(true); assert.equal(computed(reset, 'visibility'), 'visible');
  m.fire(reset.id); assert.equal(computed(confirm, 'visibility'), 'visible'); assert.equal(computed(reset, 'visibility'), 'collapse');
  assert.equal(computed(confirm.children[0], 'color'), '#ff7a7a'); assert.deepEqual(m.resets, []);
  m.fire(confirm.id); assert.deepEqual(m.resets, [true]); assert.equal(computed(reset, 'visibility'), 'collapse'); assert.equal(computed(confirm, 'visibility'), 'collapse');
});

test('permanent rail search filters without SearchOpen; share opens Presets and the square reset uses page confirmation', () => {
  const m = theme(), search = m.find('HPColorsSearchField');
  assert.notEqual(computed(m.find('HPColorsSearchBox'), 'visibility'), 'collapse');
  assert.equal(m.find('HPColorsMenuHost').BHasClass('SearchOpen'), false);
  search.text = 'sapph'; m.fire(search.id, 'ontextentrychange');
  assert.equal(m.find('HPColorsMenuHost').BHasClass('Searching'), true);
  assert.equal(m.find('HPColorsBarColorTeamHighEnemyRow').BHasClass('SearchMiss'), false);
  assert.equal(m.find('HPColorsCardBarGeneral').BHasClass('SearchMiss'), true, 'whole empty cards collapse in search');
  m.fire('HPColorsShareButton'); assert.equal(search.text, ''); assert.equal(m.find('HPColorsPagePresets').BHasClass('Active'), true);
  assert.equal(m.find('HPColorsResetPageButton').enabled, false);
  m.fire('HPColorsNavNameButton'); m.fire('HPColorsResetPageButton');
  assert.equal(m.find('HPColorsResetPageDialog').BHasClass('Open'), true); assert.match(m.find('HPColorsResetPageMessage').text, /Reset Name/);
});

test('nav dots follow authored rule changes, undo, replacement and hydration rather than effective matches', () => {
  const m = theme(), row = m.contract.controls.find(row => row.page === 'Name'), nav = m.find('HPColorsNavNameButton'), dot = m.child(nav, 'HPC3NavDot');
  assert.equal(computed(dot, 'visibility'), 'collapse');
  const rules = { [cell(m, row)]: { slot: 1, minTier: 3, value: changed(row) } };
  m.api.editSettings(m.api.getSettings(), rules);
  assert.equal(nav.BHasClass('HasCond'), true); assert.equal(computed(dot, 'visibility'), 'visible'); assert.equal(computed(dot, 'backgroundColor'), '#F1C7FF');
  assert.equal(m.find('HPColorsNavBarButton').BHasClass('HasCond'), false);
  m.fire('HPColorsUndoButton'); assert.equal(computed(dot, 'visibility'), 'collapse');
  m.api.applySettings(m.api.getSettings(), rules); assert.equal(nav.BHasClass('HasCond'), true);
  m.api.hydrateSettings(m.api.getSettings()); assert.equal(nav.BHasClass('HasCond'), false);
});

test('page titles use the stock oracle gradient and shadow and follow navigation', () => {
  const m = theme(), title = m.find('HPColorsPageTitle');
  assert.equal(computed(title, 'fontFamily'), 'oracle'); assert.equal(computed(title, 'fontSize'), '48px');
  assert.equal(computed(title, 'letterSpacing'), '1.5px');
  assert.equal(computed(title, 'color'), 'gradient(linear, 0% 0%, 0% 100%, from(#5FE69E), to(#A6FFB5))');
  assert.equal(computed(title, 'textShadow'), '0px 0px 12px 0 #5FE69E33');
  m.fire('HPColorsNavIndicatorsButton'); assert.equal(title.text, 'INDICATORS');
});

test('one card per page/schema group in first-appearance order; all levels and sides live inside that card', () => {
  const m = theme();
  for (const page of m.contract.menu.pages) {
    const expected = [...new Set(schema.filter(row => row.page === page.name).map(row => row.group || ''))];
    const groups = Array.from(m.contract.menu.groups).filter(group => group.page === page.name);
    assert.deepEqual(groups.map(group => group.name), expected);
    const cards = m.find(page.id).children.filter(panel => panel.BHasClass('HPC3Card'));
    assert.deepEqual(cards.map(panel => panel.id), groups.map(group => group.id));
    for (const group of groups) {
      const card = m.find(group.id), title = m.child(card, 'HPC3CardHead').children.find(panel => panel.BHasClass('HPC3CardTitle'));
      if (groups.length === 1) assert.equal(title, undefined, 'a single-group page has no sub-header');
      else {
        assert.ok(title.text.length > 0 && title.text !== page.title, 'unnamed schema groups get their own name, never the page title');
        assert.equal(computed(title, 'fontSize'), '24px'); assert.equal(computed(title, 'fontWeight'), 'bold'); assert.equal(computed(title, 'color'), '#FFEFD7CC');
      }
      for (const row of m.contract.controls.filter(row => row.page === page.name && row.group === group.name)) assert.ok(ancestor(m.find(row.rowId), 'HPC3Card') === card, row.rowId);
      const folds = card.children.filter(panel => panel.BHasClass('HPC3Fold'));
      assert.deepEqual(folds.map(fold => m.contract.menu.folds.find(entry => entry.id === fold.id).level), ['basic', 'advanced'].filter(level => schema.some(row => row.page === page.name && (row.group || '') === group.name && row.level === level)));
    }
  }
});

test('card paper reveals only on hover or Active; resets reveal on card hover or keyboard focus', () => {
  const m = theme(), card = m.find('HPColorsCardBarSizeAndPosition'), bg = m.child(card, 'HPC3CardBg'), reset = m.find(card.id + 'ResetButton');
  assert.equal(computed(bg, 'opacity'), '0'); assert.equal(computed(reset, 'opacity'), '0');
  state(card, 'hover'); assert.equal(computed(bg, 'opacity'), '1'); assert.equal(computed(reset, 'opacity'), '1');
  state(card); card.AddClass('Active'); assert.equal(computed(bg, 'opacity'), '1'); assert.equal(computed(reset, 'opacity'), '0');
  card.RemoveClass('Active'); state(reset, 'focus'); assert.equal(computed(reset, 'opacity'), '1'); assert.equal(computed(bg, 'opacity'), '0');
  assert.equal(computed(bg, 'backgroundSize'), '1024px'); assert.match(computed(bg, 'opacityMask'), /rough_edge_02_png\.vtex/);
});

test('sub-nav selects the page and one Active card, scrolls it, and another card hover clears the active selection', () => {
  const m = theme(), group = m.contract.menu.groups.find(group => group.page === 'Icons' && group.name === 'Pickups');
  const sub = m.find(group.subNavId), brush = m.child(sub, 'HPC3SubBrush'), card = m.find(group.id);
  assert.equal(computed(m.find('HPColorsSubNavIcons'), 'visibility'), 'collapse');
  assert.equal(computed(brush, 'opacity'), '0'); state(sub, 'hover'); assert.equal(computed(brush, 'opacity'), '0.25');
  const scrolls = []; card.ScrollParentToMakePanelFit = (...args) => scrolls.push(args);
  m.fire(group.subNavId);
  assert.equal(m.find('HPColorsPageIcons').BHasClass('Active'), true); assert.equal(card.BHasClass('Active'), true);
  assert.equal(computed(m.find('HPColorsSubNavIcons'), 'visibility'), 'visible'); assert.equal(computed(m.find('HPColorsSubNavBar'), 'visibility'), 'collapse');
  assert.equal(computed(brush, 'opacity'), '0.35'); state(sub); assert.equal(computed(brush, 'opacity'), '0.25');
  assert.deepEqual(scrolls, [[1, false]], 'scrolls through the panel method, not DispatchEvent');
  assert.equal(m.h.dispatches.some(event => event[0] === 'ScrollParentToMakePanelFit'), false);
  m.fire(group.id, 'onmouseover'); assert.equal(card.BHasClass('Active'), true);
  m.fire('HPColorsCardIconsUltimate', 'onmouseover'); assert.equal(card.BHasClass('Active'), false); assert.equal(sub.BHasClass('Selected'), false);
  m.fire(group.subNavId); m.fire('HPColorsNavNameButton'); assert.equal(card.BHasClass('Active'), false, 'page navigation releases old highlight');
});

test('group reset defaults only that group on both sides and levels, removes its rules and is one undoable publication', () => {
  const m = theme(), group = m.contract.menu.groups.find(group => group.page === 'Bar' && group.name === 'Size and position');
  const rows = m.contract.controls.filter(row => row.page === group.page && row.group === group.name);
  const outsiders = ['barColorLow', 'barHeight', 'lowThreshold', 'hpTextSize'].map(key => m.contract.controls.find(row => row.key === key));
  const next = m.api.getSettings(), rules = {};
  for (const row of rows.concat(outsiders)) { values(next, row)[row.key] = changed(row); rules[cell(m, row)] = { slot: 1, minTier: 1, value: changed(row) }; }
  m.api.editSettings(next, rules);
  const before = { ...m.config(), rules: m.api.getRules() }, commits = m.commits.length;
  m.fire(group.resetId);
  const after = { ...m.config(), rules: m.api.getRules() };
  assert.equal(after.revision, before.revision + 1); assert.equal(m.commits.length, commits + 1);
  for (const row of rows) { assert.equal(values(after.settings, row)[row.key], row.default); assert.equal(after.rules[cell(m, row)], undefined); }
  for (const row of outsiders.filter(row => !rows.includes(row))) { assert.equal(values(after.settings, row)[row.key], values(before.settings, row)[row.key]); assert.deepEqual(after.rules[cell(m, row)], before.rules[cell(m, row)]); }
  m.fire('HPColorsUndoButton'); assert.deepEqual(m.config().settings, before.settings); assert.deepEqual(m.api.getRules(), before.rules);
  m.fire(group.resetId); const revision = m.config().revision; m.fire(group.resetId); assert.equal(m.config().revision, revision, 'resetting defaults again is a no-op');
});

test('generated decorative panels are passive and owned reveal transitions only animate opacity', () => {
  const m = theme(), classes = ['HPC3NavBrush', 'HPC3NavDot', 'HPC3SubBrush', 'HPC3CardBg', 'HPC3RowBg', 'HPC3RowRule', 'HPC3ToggleOn', 'HPC3ToggleOff', 'HPC3DefaultNotch', 'HPC3RadioBox'];
  const counts = Object.fromEntries(classes.map(name => [name, 0]));
  (function walk(panel) {
    for (const name of classes) if (panel.BHasClass(name)) {
      counts[name]++; assert.equal(panel.GetAttributeString('hittest', ''), 'false');
      if (['HPC3NavBrush', 'HPC3SubBrush', 'HPC3CardBg', 'HPC3RowBg', 'HPC3ToggleOn', 'HPC3ToggleOff', 'HPC3DefaultNotch'].includes(name)) assert.equal(computed(panel, 'transitionProperty'), 'opacity');
    }
    for (const child of panel.children) walk(child);
  })(m.find('HPColorsMenuHost'));
  assert.equal(counts.HPC3NavBrush, m.contract.menu.pages.length); assert.equal(counts.HPC3NavDot, m.contract.menu.pages.length);
  assert.equal(counts.HPC3SubBrush, m.contract.menu.groups.filter(group => group.subNavId).length); assert.equal(counts.HPC3CardBg, m.contract.menu.groups.length);
  assert.equal(counts.HPC3RowBg, m.contract.controls.length); assert.equal(counts.HPC3RowRule, m.contract.controls.length);
  assert.equal(counts.HPC3DefaultNotch, m.contract.controls.filter(row => row.type === 'number').length);
  assert.equal(counts.HPC3ToggleOn, counts.HPC3ToggleOff);
});

test('card side pills are present only for sided groups and select one root-wide side with preview follow', () => {
  const m = theme(), root = m.find('HPColorsMenuHost'), preview = m.find('HPColorsPreview');
  for (const group of m.contract.menu.groups) {
    const available = ['enemy', 'ally'].filter(side => m.contract.controls.some(row => row.page === group.page && row.group === group.name && row.side === side));
    assert.equal(!!group.sides, available.length > 1, group.id);
    assert.equal(m.find(group.id).BHasClass('HPC3SingleSide'), available.length === 1);
    if (available.length < 2) { assert.equal(m.find(group.id).FindChildrenWithClassTraverse('HPC3SideTabs').length, 0); continue; }
    assert.deepEqual(Array.from(group.sides, tab => tab.side), available);
    for (const tab of group.sides) {
      const pill = m.find(tab.id); assert.ok(ancestor(pill, 'HPC3CardHead'));
      assert.equal(pill.BHasClass('SecondaryButton'), true); assert.equal(pill.BHasClass('light'), true);
    }
  }
  const group = m.contract.menu.groups.find(group => group.page === 'Bar' && group.name === 'Colors');
  const tabs = group || m.contract.menu.groups.find(group => group.sides);
  const rows = ['enemy', 'ally'].map(side => m.contract.controls.find(row => row.page === tabs.page && row.group === tabs.name && row.side === side));
  const columns = rows.map(row => ancestor(m.find(row.rowId), 'HPC3Column'));
  assert.notEqual(computed(columns[0], 'visibility'), 'collapse'); assert.equal(computed(columns[1], 'visibility'), 'collapse');
  const revision = m.config().revision, saves = m.commits.length;
  m.fire(tabs.sides[1].id);
  assert.equal(root.BHasClass('HPC3SideAlly'), true); assert.equal(preview.BHasClass('HPC3PreviewSideAlly'), true);
  assert.equal(computed(columns[0], 'visibility'), 'collapse'); assert.equal(computed(columns[1], 'visibility'), 'visible');
  for (const entry of m.contract.menu.groups.filter(group => group.sides)) for (const tab of entry.sides) {
    assert.equal(m.find(tab.id).BHasClass('fill'), tab.side === 'ally'); assert.equal(m.find(tab.id).BHasClass('Selected'), tab.side === 'ally');
  }
  m.fire(tabs.sides[0].id);
  assert.equal(root.BHasClass('HPC3SideAlly'), false); assert.equal(preview.BHasClass('HPC3PreviewSideEnemy'), true);
  assert.equal(m.config().revision, revision); assert.equal(m.commits.length, saves, 'side state is not saved or published');
});

test('search exposes and labels both matching sides regardless of pill; clear restores the chosen side', () => {
  const m = theme(), tabs = m.contract.menu.groups.find(group => group.sides);
  m.fire(tabs.sides[1].id);
  const search = m.find('HPColorsSearchField'); search.text = 'bar color'; m.fire(search.id, 'ontextentrychange');
  for (const side of ['Enemy', 'Ally']) {
    const row = m.find('HPColorsBarColorEnabled' + side + 'Row'), column = ancestor(row, 'HPC3Column');
    assert.equal(computed(column, 'visibility'), 'visible'); assert.equal(row.BHasClass('SearchMiss'), false);
    const heading = m.child(column, 'HPC3ColumnHeading');
    assert.equal(computed(heading, 'visibility'), 'visible'); assert.equal(m.child(heading, 'HPC3ColumnTitle').text, side.toUpperCase());
  }
  search.text = 'enemy low health color'; m.fire(search.id, 'ontextentrychange');
  assert.equal(computed(ancestor(m.find('HPColorsBarColorEnabledAllyRow'), 'HPC3Column'), 'visibility'), 'collapse', 'nonmatching sides do not leave empty headings');
  search.text = ''; m.fire(search.id, 'ontextentrychange');
  assert.equal(computed(ancestor(m.find('HPColorsBarColorEnabledEnemyRow'), 'HPC3Column'), 'visibility'), 'collapse');
  assert.equal(computed(m.child(ancestor(m.find('HPColorsBarColorEnabledAllyRow'), 'HPC3Column'), 'HPC3ColumnHeading'), 'visibility'), 'collapse');
});

test('every setting remains reachable from its page, fold and side tab and publishes through its real control', () => {
  const m = theme();
  for (const row of m.contract.controls) {
    const page = m.contract.menu.pages.find(page => page.name === row.page), group = m.contract.menu.groups.find(group => group.page === row.page && group.name === row.group);
    m.fire(page.navId);
    if (row.side !== 'shared' && group.sides) m.fire(group.sides.find(tab => tab.side === row.side).id);
    const fold = ancestor(m.find(row.rowId), 'HPC3Fold');
    if (!fold.BHasClass('Open')) m.fire(m.contract.menu.folds.find(entry => entry.id === fold.id).toggleId);
    for (let node = m.find(row.rowId); node && node.id !== 'HPColorsMenuHost'; node = node.GetParent()) assert.notEqual(computed(node, 'visibility'), 'collapse', row.rowId + ': ' + node.id);
    const before = m.config().revision;
    if (row.type === 'boolean') m.fire(row.toggleId);
    else if (row.type === 'enum') m.fire(row.options.find(option => option.value !== row.default).id);
    else {
      const entry = m.find(row.type === 'color' ? row.hexId : row.entryId);
      entry.text = String(row.key === 'highThreshold' ? row.bounds[1] : changed(row)); m.fire(entry.id, 'ontextentrysubmit');
    }
    assert.ok(m.config().revision > before, row.rowId + ' publishes');
    assert.notEqual(values(m.config().settings, row)[row.key], row.default, row.rowId);
    for (const id of [page.navId, group.subNavId].filter(Boolean)) assert.equal(m.find(id).BHasClass('Changed'), true, row.rowId + ': ' + id);
    m.fire(row.resetId); assert.equal(values(m.config().settings, row)[row.key], row.default);
    for (const id of [page.navId, group.subNavId].filter(Boolean)) assert.equal(m.find(id).BHasClass('Changed'), false, row.rowId + ': reset ' + id);
  }
});

test('stock row is a single label/control/reset/condition line with passive paper/rule and tooltip-only help', () => {
  const m = theme(), row = m.contract.controls.find(row => row.type === 'number'), panel = m.find(row.rowId);
  const bg = m.child(panel, 'HPC3RowBg'), rule = m.child(panel, 'HPC3RowRule'), label = m.child(panel, 'HPC3RowTitle');
  assert.equal(computed(panel, 'flowChildren'), 'right'); assert.equal(computed(panel, 'padding'), '10px 32px');
  assert.equal(computed(panel, 'backgroundColor'), undefined); assert.equal(computed(panel, 'borderLeft'), undefined);
  assert.equal(computed(label, 'width'), '280px'); assert.equal(computed(label, 'fontSize'), '18px'); assert.equal(computed(label, 'fontWeight'), 'semi-bold');
  assert.equal(computed(label, 'color'), '#FFEFD744'); assert.equal(computed(bg, 'opacity'), '0');
  state(panel, 'hover'); assert.equal(computed(label, 'color'), '#FFEFD7'); assert.equal(computed(bg, 'opacity'), '1');
  assert.equal(computed(bg, 'backgroundColor'), '#675E4C'); assert.equal(computed(bg, 'backgroundPosition'), '256px 512px');
  assert.equal(computed(bg, 'brightness'), '1.75'); assert.equal(computed(bg, 'saturation'), '1.5');
  assert.equal(computed(bg, 'opacityMaskThreshold'), '2% 1%'); assert.match(computed(bg, 'opacityMask'), /wipe_horizontal_1024x64_psd\.vtex/);
  assert.equal(computed(rule, 'height'), '1px'); assert.equal(computed(rule, 'backgroundColor'), '#00000080');
  for (const control of m.contract.controls) {
    const p = m.find(control.rowId), children = p.children;
    assert.equal(children.some(child => child.BHasClass('HPC3Help') || child.BHasClass('HPC3Meta') || child.BHasClass('HPC3Copy')), false);
    const line = m.child(p, 'HPC3RowControls');
    assert.deepEqual(line.children.slice(-2).map(child => child.id), [control.resetId, control.conditionId]);
    m.fire(control.rowId, 'onmouseover'); const shown = m.h.dispatches.at(-1);
    assert.equal(shown[0], 'UIShowTextTooltip'); assert.ok(shown[1] === p); assert.equal(shown[2], control.help);
    m.fire(control.rowId, 'onmouseout'); assert.equal(m.h.dispatches.at(-1)[0], 'UIHideTextTooltip');
  }
});

test('row reset only reveals for Changed rows, resets one value without dropping its condition, and is undoable', () => {
  const m = theme(), row = m.contract.controls.find(row => row.key === 'barColorLow' && row.side === 'enemy'), p = m.find(row.rowId), reset = m.find(row.resetId);
  assert.equal(computed(reset, 'visibility'), 'collapse'); state(p, 'hover'); assert.equal(computed(reset, 'visibility'), 'collapse'); state(p);
  const next = m.api.getSettings(), key = cell(m, row), rules = { [key]: { slot: 1, minTier: 1, value: '#654321' } };
  values(next, row)[row.key] = '#123456'; m.api.editSettings(next, rules);
  assert.equal(computed(reset, 'visibility'), 'visible'); assert.equal(computed(reset, 'opacity'), '0');
  state(p, 'hover'); assert.equal(computed(reset, 'opacity'), '1'); state(p); state(reset, 'focus'); assert.equal(computed(reset, 'opacity'), '1');
  const before = m.api.getSettings(), commits = m.commits.length; m.fire(row.resetId);
  assert.equal(values(m.api.getSettings(), row)[row.key], row.default); assert.deepEqual(m.api.getRules(), rules); assert.equal(m.commits.length, commits + 1);
  assert.equal(computed(reset, 'visibility'), 'collapse'); m.fire('HPColorsUndoButton'); assert.deepEqual(m.api.getSettings(), before);
  const condition = m.find(row.conditionId); assert.equal(computed(condition, 'opacity'), '1'); m.fire(row.conditionId);
  assert.equal(m.find('HPColorsConditionDialog').BHasClass('Open'), true);
});

test('stock toggle children cross-fade at fixed positions; short enums retain Selected radio state', () => {
  const m = theme(), toggle = m.find('HPColorsBarColorEnabledAllyToggle'), off = m.child(toggle, 'HPC3ToggleOff'), on = m.child(toggle, 'HPC3ToggleOn');
  assert.equal(computed(toggle, 'width'), '40px'); assert.equal(computed(toggle, 'height'), '20px');
  assert.match(computed(toggle, 'backgroundImage'), /switch_background\.vsvg/); assert.match(computed(off, 'backgroundImage'), /switch_handle_off\.vsvg/);
  assert.match(computed(on, 'backgroundImage'), /switch_handle_on\.vsvg/); assert.equal(computed(on, 'marginLeft'), '20px'); assert.equal(computed(on, 'transform'), undefined);
  m.fire(toggle.id); assert.equal(computed(on, 'opacity'), '1'); assert.equal(computed(off, 'opacity'), '0');
  const fixed = m.find('HPColorsBarColorModeEnemyOptionFixed'), gradient = m.find('HPColorsBarColorModeEnemyOptionGradient');
  assert.equal(computed(m.child(fixed, 'HPC3RadioBox'), 'border'), '2px solid #FFEFD711'); m.fire(fixed.id);
  assert.equal(fixed.BHasClass('Selected'), true); assert.equal(gradient.BHasClass('Selected'), false);
  assert.match(computed(m.child(fixed, 'HPC3RadioBox'), 'backgroundImage'), /checkbox_check\.vsvg/);
});

test('number entries retain unit/allocation, default notches remain static, and Changed entries are green even on hover', () => {
  const m = theme(), row = m.contract.controls.find(row => row.key === 'lowThreshold'), p = m.find(row.rowId), slider = m.find(row.sliderId), entry = m.find(row.entryId), notch = m.child(slider, 'HPC3DefaultNotch');
  assert.equal(computed(slider, 'height'), '30px'); assert.equal(computed(slider, 'maxWidth'), '300px');
  assert.equal(computed(entry, 'width'), 'fit-children'); assert.equal(computed(entry, 'maxWidth'), '88px'); assert.equal(computed(entry, 'backgroundColor'), '#00000000');
  const position = notch.GetAttributeString('style', ''); assert.ok(Math.abs(parseFloat(position.split(':')[1]) - 25 / 99 * 100) < 0.0001);
  assert.equal(computed(notch, 'height'), '12px'); assert.equal(computed(notch, 'opacity'), '0');
  entry.text = '30'; m.fire(entry.id, 'ontextentrysubmit'); state(p, 'hover');
  assert.equal(computed(entry, 'color'), '#5FE69E'); assert.equal(computed(notch, 'opacity'), '1'); assert.equal(notch.GetAttributeString('style', ''), position);
  assert.match(computed(entry.GetParent(), 'backgroundImage'), /paper_tile_1k_01_png\.vtex/);
});

test('hue ramp endpoints/stops/intermediate values round-trip through real slider and hex handlers without quantizing arbitrary RGB', () => {
  const m = theme(), row = m.contract.controls.find(row => row.type === 'color'), hue = m.find(row.hueId), hex = m.find(row.hexId);
  assert.deepEqual([hue.min, hue.max, hue.increment], [0, 1000, 1]);
  const stops = [[0, '#000000'], [40, '#800000'], [80, '#FF0000'], [150, '#FF8000'], [220, '#FFFF00'], [360, '#00FF00'], [500, '#00FFFF'], [640, '#0000FF'], [780, '#FF00FF'], [920, '#FF0000'], [960, '#FF8080'], [1000, '#FFFFFF']];
  for (const [position, expected] of stops) {
    hue.value = position; m.h.releaseSlider(hue); assert.equal(values(m.config().settings, row)[row.key], expected);
    const nearest = hue.value; hue.value = nearest; m.h.releaseSlider(hue); assert.equal(hex.text, expected, 'nearest position round trips ' + expected);
    assert.equal(hue.value, position, 'a hue edit retains its originating position, including the second red stop');
  }
  hex.text = '#123456'; m.fire(hex.id, 'ontextentrysubmit'); assert.equal(values(m.config().settings, row)[row.key], '#123456'); assert.equal(m.find(row.swatchId).style.backgroundColor, '#123456');
  const revision = m.config().revision; hue.value = NaN; m.h.releaseSlider(hue); assert.equal(m.config().revision, revision); assert.equal(hex.text, '#123456');
  m.h.releaseSlider(hue);
  assert.equal(m.config().revision, revision, 'a no-motion hue gesture never quantizes arbitrary hex RGB');
  m.fire(row.swatchId); assert.equal(m.find('HPColorsPickerDialog').BHasClass('Open'), true);
  assert.equal(computed(m.find(row.swatchId), 'width'), '22px'); assert.equal(computed(hex, 'fontSize'), '16px');
});

test('hue thumb tint tolerates absent/dead engine children and follows hex, reset and Undo once present', () => {
  const m = theme(), row = m.contract.controls.find(row => row.type === 'color'), hue = m.find(row.hueId), hex = m.find(row.hexId);
  const thumb = m.h.$.CreatePanel('Panel', hue, 'SliderThumb');
  hex.text = '#123456'; m.fire(hex.id, 'ontextentrysubmit'); assert.equal(thumb.style.backgroundColor, '#123456');
  assert.equal(computed(thumb, 'border'), '3px solid #000000'); assert.equal(computed(thumb, 'width'), '20px');
  m.fire(row.resetId); assert.equal(thumb.style.backgroundColor, row.default);
  m.fire('HPColorsUndoButton'); assert.equal(thumb.style.backgroundColor, '#123456');
  thumb.DeleteAsync(0); hex.text = '#654321'; m.fire(hex.id, 'ontextentrysubmit'); assert.equal(values(m.config().settings, row)[row.key], '#654321');
});

test('a hue drag coalesces publication/storage and one Undo restores its opening RGB value', () => {
  const m = theme(), row = m.contract.controls.find(row => row.type === 'color'), hue = m.find(row.hueId), before = values(m.config().settings, row)[row.key], saves = m.commits.length;
  for (const position of [220, 360, 500]) hue.value = position;
  assert.equal(m.commits.length, saves); m.h.releaseSlider(hue);
  assert.equal(values(m.config().settings, row)[row.key], '#00FFFF'); assert.equal(m.commits.length, saves + 1);
  m.fire('HPColorsUndoButton'); assert.equal(values(m.config().settings, row)[row.key], before);
});

test('rail actions use stock image icons rather than missing font glyphs and reveal on hover/focus', () => {
  const m = theme();
  for (const [id, name] of [['HPColorsShareButton', 'share'], ['HPColorsResetPageButton', 'reset']]) {
    const button = m.find(id), icon = m.child(button, 'HPC3NavSquareIcon');
    assert.equal(icon.paneltype, 'Image'); assert.equal(icon.GetAttributeString('src', ''), 's2r://panorama/images/icons/' + name + '.vsvg');
    assert.equal(icon.GetAttributeString('hittest', ''), 'false'); assert.equal(computed(icon, 'washColor'), '#FFEFD7');
    assert.equal(computed(icon, 'opacity'), '0.5'); state(button, 'hover'); assert.equal(computed(icon, 'opacity'), '1'); state(button, 'focus'); assert.equal(computed(icon, 'opacity'), '1');
  }
});

test('control caps include reset and condition actions, so no capped fill child strands the diamond at the row edge', () => {
  const m = theme(), caps = { number: '492px', color: '452px', enum: '454px', dropdown: '374px' };
  for (const row of m.contract.controls) {
    const line = m.child(m.find(row.rowId), 'HPC3RowControls'), control = line.children[0];
    assert.equal(computed(line, 'flowChildren'), 'right'); assert.equal(computed(line, 'width'), 'fill-parent-flow(1)');
    assert.equal(computed(line, 'maxWidth'), caps[row.kind === 'dropdown' ? 'dropdown' : row.type]);
    assert.ok(m.find(row.resetId).GetParent() === line && m.find(row.conditionId).GetParent() === line);
    if (row.type === 'number' || row.type === 'color') assert.equal(computed(control, 'maxWidth'), '100%', 'cap belongs to the last outer box, not the flowing control: ' + row.rowId);
    if (row.type === 'enum') assert.equal(computed(control, 'maxWidth'), undefined);
    assert.equal(computed(m.find(row.conditionId), 'marginLeft'), '8px');
  }
});

test('number text ends next to its unit in both setting rows and the condition editor', () => {
  const m = theme(), entries = m.contract.controls.filter(row => row.type === 'number').map(row => m.find(row.entryId));
  entries.push(m.find('HPColorsConditionNumberEntry'));
  for (const entry of entries) {
    const box = entry.GetParent(), line = box.GetParent(), unit = m.child(line, 'HPC3Unit');
    assert.equal(line.BHasClass('HPC3NumberValue'), true); assert.equal(box.BHasClass('HPC3EntryBox'), true);
    assert.equal(computed(line, 'width'), 'fit-children'); assert.equal(computed(line, 'flowChildren'), 'right'); assert.equal(computed(line, 'horizontalAlign'), undefined);
    assert.equal(computed(line, 'marginLeft'), '16px', 'value follows its slider instead of a right-side overlay');
    assert.ok(line.children[0] === box && line.children[1] === unit && box.children[0] === entry);
    // Live 6785: a content-sized entry draws text from its own left edge, so the box carries the padding.
    assert.equal(computed(entry, 'width'), 'fit-children'); assert.equal(computed(entry, 'maxWidth'), '88px'); assert.equal(computed(entry, 'padding'), '0px');
    assert.equal(computed(box, 'padding'), '0px 8px', 'equal space both sides of the value');
    assert.equal(computed(box, 'marginRight'), undefined, 'no detached overlay unit slot');
    assert.equal(computed(unit, 'horizontalAlign'), undefined); assert.equal(computed(unit, 'width'), 'fit-children'); assert.equal(computed(unit, 'marginLeft'), '4px');
    assert.equal(unit.GetAttributeString('hittest', ''), 'false');
  }
});

test('all eight dialogs use notice paper/shadow siblings, Oracle headers and exact stock layered buttons', () => {
  const m = theme(), dialogs = m.find('HPColorsMenuHost').children.filter(panel => panel.BHasClass('HPC3Dialog'));
  assert.equal(dialogs.length, 8); assert.equal(m.find('HPColorsMenuHost').GetAttributeString('hpv3_boot', ''), 'ready');
  const primaries = ['ResetPageConfirm', 'PresetDeleteConfirm', 'BundleReplaceConfirm', 'HeroClose', 'ConditionApply', 'PickerDone', 'UpdateDownload'].map(key => 'HPColors' + key + 'Button');
  for (const dialog of dialogs) {
    const backdrop = dialog.children[0], card = m.child(dialog, 'HPC3DialogCard'), content = m.child(card, 'HPC3NoticeContent');
    const shadow = m.child(card, 'HPC3NoticeShadow'), bg = m.child(card, 'HPC3NoticeBg'), header = m.child(content, 'HPC3NoticeHeader');
    const title = m.child(header, 'HPC3DialogTitle'), icon = m.child(header, 'HPC3NoticeIcon');
    assert.equal(backdrop.paneltype, 'Button'); assert.equal(backdrop.GetAttributeString('hittest', ''), 'true');
    assert.equal(computed(backdrop, 'width'), '100%'); assert.equal(computed(backdrop, 'height'), '100%');
    assert.match(computed(bg, 'backgroundImage'), /paper_tile_1k_01_psd\.vtex/);
    assert.equal(computed(bg, 'brightness'), '1.25'); assert.equal(computed(bg, 'saturation'), '1.25');
    assert.equal(computed(shadow, 'position'), '0px 8px 0px'); assert.equal(computed(shadow, 'backgroundColor'), '#00000080');
    assert.equal(computed(content, 'padding'), '24px 48px');
    for (const layer of [card, bg, shadow]) assert.match(computed(layer, 'opacityMask'), /button_nav_mask_threshold/);
    assert.equal(computed(title, 'fontFamily'), 'oracle'); assert.equal(computed(title, 'fontSize'), '26px'); assert.equal(computed(title, 'color'), '#FFEFD788');
    for (const passive of [title, icon, shadow, bg]) assert.equal(passive.GetAttributeString('hittest', ''), 'false');
    assert.equal(content.children.some(p => p.BHasClass('HPC3DialogSubtitle')), dialog.id === 'HPColorsConditionDialog');
    for (const body of content.children.filter(p => p.BHasClass('HPC3DialogDescription'))) assert.equal(computed(body, 'color'), '#FFEFD7CC');
    const close = m.find(dialog.id.replace(/Dialog$/, 'EscClose')), key = m.child(close, 'HPC3EscKey');
    assert.ok(close.GetParent() === content); assert.equal(typeof close.events.onactivate, 'function');
    assert.equal(key.text, 'ESC'); assert.equal(key.GetAttributeString('hittest', ''), 'false');
    assert.equal(computed(close, 'visibility'), 'collapse'); state(close, 'hover'); assert.equal(computed(close, 'visibility'), 'collapse');
    for (const button of content.FindChildrenWithClassTraverse('HPC3DialogButton')) {
      assert.equal(button.BHasClass(primaries.includes(button.id) ? 'InputButtonBorderRadius' : 'InputButton'), true);
      assert.equal(button.BHasClass('Fill'), true); assert.equal(computed(button, 'height'), '44px');
      assert.deepEqual(button.children.map(p => [...p.classes][0]), ['Bottom', 'Top', 'Content']);
      for (const part of button.children.slice(0, 2)) assert.equal(m.child(part, 'Background').GetAttributeString('hittest', ''), 'false');
      assert.equal(m.child(button, 'Content').children[0].GetAttributeString('hittest', ''), 'false');
    }
  }
  assert.equal(m.find('HPColorsPresetDeleteConfirmButton').BHasClass('Warning'), true);
  assert.equal(m.find('HPColorsBundleReplaceConfirmButton').BHasClass('Warning'), true);
});

test('condition dialog keeps the short title and updates an uppercase setting/side subtitle without changing the draft', () => {
  const m = theme(), title = m.find('HPColorsConditionTitle'), subtitle = m.find('HPColorsConditionSubtitle');
  const opening = m.api.getSettings(), rules = m.api.getRules();
  for (const row of ['barColorHigh', 'lowThreshold'].map(key => m.contract.controls.find(row => row.key === key))) {
    m.fire(row.conditionId);
    assert.equal(title.text, 'CONDITION'); assert.equal(subtitle.text, (row.name + ' · ' + row.side).toUpperCase());
    assert.equal(computed(subtitle, 'fontSize'), '18px'); assert.equal(computed(subtitle, 'color'), '#FFEFD788');
    assert.equal(computed(subtitle, 'whiteSpace'), 'normal'); assert.equal(computed(subtitle, 'textOverflow'), undefined);
    assert.equal(subtitle.GetAttributeString('hittest', ''), 'false');
    assert.deepEqual(m.api.getSettings(), opening); assert.deepEqual(m.api.getRules(), rules);
    m.fire('HPColorsConditionEscClose');
  }
});

test('single-side cards remain visible under either global side, without offering an empty side pill', () => {
  const m = theme(), tabs = m.contract.menu.groups.find(group => group.sides);
  const single = m.contract.menu.groups.filter(group => m.find(group.id).BHasClass('HPC3SingleSide'));
  assert.ok(single.length >= 2, 'includes the enemy-only groups (kill marker, level and anchoring; stamina is side-aware since ticket 35, pulse HP modifiers joined Pulse in ticket 37)');
  for (const tab of tabs.sides) {
    m.fire(tab.id);
    for (const group of single) {
      const rows = m.contract.controls.filter(row => row.page === group.page && row.group === group.name);
      assert.equal(new Set(rows.filter(row => row.side !== 'shared').map(row => row.side)).size, 1);
      assert.equal(m.find(group.id).FindChildrenWithClassTraverse('HPC3SidePill').length, 0);
      for (const row of rows) assert.equal(computed(ancestor(m.find(row.rowId), 'HPC3Column'), 'visibility'), 'visible', tab.side + ': ' + row.rowId);
    }
  }
  const row = m.contract.controls.find(row => row.key === 'killMarkerEnabled'), column = ancestor(m.find(row.rowId), 'HPC3Column');
  const search = m.find('HPColorsSearchField'); search.text = 'no such setting'; m.fire(search.id, 'ontextentrychange');
  assert.equal(computed(column, 'visibility'), 'collapse', 'the single-side exception never overrides an empty search result');
});

test('hue edits retain the second red stop and step through it; external colour changes still reproject', () => {
  const m = theme(), row = m.contract.controls.find(row => row.type === 'color'), hue = m.find(row.hueId), hex = m.find(row.hexId);
  const move = value => { hue.value = value; assert.equal(hue.value, value); };
  move(80); m.h.releaseSlider(hue); const revision = m.config().revision; move(920); m.h.releaseSlider(hue);
  assert.equal(hex.text, '#FF0000'); assert.equal(m.config().revision, revision, 'same RGB at the other red stop is not an edit');
  for (const position of [918, 919, 920, 921, 922]) move(position);
  m.h.releaseSlider(hue); assert.equal(hue.value, 922);
  move(920); m.fire(hue.id, 'onblur'); // Focusing the hex entry completes the slider session first.
  hex.text = '#FF0000'; m.fire(hex.id, 'ontextentrysubmit'); assert.equal(hue.value, 80, 'hex submit reprojects even the same RGB');
  move(920); move(900); m.fire('HPColorsUndoButton'); assert.equal(hex.text, '#FF0000'); assert.equal(hue.value, 80, 'Undo is an external replacement');
  move(920); m.fire(row.resetId); const resetPosition = hue.value;
  assert.notEqual(hex.text, '#FF0000'); assert.notEqual(resetPosition, 920, 'row reset reprojects its default');
  move(920); m.fire(row.swatchId); m.find('HPColorsPickerHex').text = '#00FFFF'; m.fire('HPColorsPickerHex', 'ontextentrysubmit');
  assert.equal(hue.value, 500, 'picker RGB changes reproject'); m.fire('HPColorsPickerDoneButton');
  move(920); m.api.applyPresetSettings(m.api.getSettings(), 'hue-test-preset', false, false);
  assert.equal(hue.value, 80, 'preset application reprojects the authored RGB');
});

test('changed stars use the stock texture and a green image glow beside each page and sub-nav label', () => {
  const m = theme();
  const ids = [...m.contract.menu.pages.map(page => page.navId), ...m.contract.menu.groups.map(group => group.subNavId).filter(Boolean)];
  for (const id of ids) {
    const button = m.find(id), star = m.child(button, 'HPC3ChangedStar');
    assert.equal(star.paneltype, 'Image'); assert.equal(star.GetAttributeString('src', ''), 's2r://panorama/images/icons/icon_star_white.vsvg');
    assert.equal(star.GetAttributeString('hittest', ''), 'false');
    assert.equal(computed(star, 'visibility'), 'collapse'); assert.equal(computed(star, 'washColor'), '#5FE69E');
    assert.match(computed(star, 'imgShadow'), /#5FE69E99/); assert.equal(computed(star, 'boxShadow'), undefined);
    assert.equal(computed(button, 'flowChildren'), 'right'); assert.equal(computed(star, 'verticalAlign'), 'center');
    assert.ok(button.children.at(-1) === star, 'star flows immediately after label');
  }
});

test('changed nav aggregates hidden sides and advanced levels, survives search and clears only after the last default is restored', () => {
  const m = theme(), group = m.contract.menu.groups.find(group => group.name === 'Size and position' && group.page === 'Bar');
  const rows = m.contract.controls.filter(row => row.page === group.page && row.group === group.name && row.level === 'advanced');
  const enemy = rows.find(row => row.side === 'enemy'), ally = rows.find(row => row.side === 'ally');
  const nav = m.find('HPColorsNavBarButton'), sub = m.find(group.subNavId);
  const next = m.api.getSettings(); values(next, enemy)[enemy.key] = changed(enemy); values(next, ally)[ally.key] = changed(ally);
  m.api.editSettings(next);
  for (const button of [nav, sub]) assert.equal(computed(m.child(button, 'HPC3ChangedStar'), 'visibility'), 'visible');
  m.fire(enemy.resetId); assert.equal(sub.BHasClass('Changed'), true, 'hidden Ally edit still counts');
  const search = m.find('HPColorsSearchField'); search.text = 'no such setting'; m.fire(search.id, 'ontextentrychange');
  assert.equal(sub.BHasClass('Changed'), true, 'search visibility never changes the authored marker');
  m.fire(ally.resetId); assert.equal(sub.BHasClass('Changed'), false); assert.equal(nav.BHasClass('Changed'), false);
  m.fire('HPColorsUndoButton'); assert.equal(sub.BHasClass('Changed'), true);
  m.fire(group.resetId); assert.equal(sub.BHasClass('Changed'), false);
  m.fire('HPColorsUndoButton'); assert.equal(sub.BHasClass('Changed'), true);
  m.api.hydrateSettings(m.contract.defaults); assert.equal(sub.BHasClass('Changed'), false);
});

test('nav changed stars distinguish authored values from conditional rules and track preset replacement without redundant writes', () => {
  const m = theme(), row = m.contract.controls.find(row => row.page === 'Name'), page = m.contract.menu.pages.find(page => page.name === row.page);
  const group = m.contract.menu.groups.find(group => group.page === row.page && group.name === row.group);
  const nav = m.find(page.navId), sub = m.find(group.subNavId), writes = [];
  for (const button of [nav, sub]) {
    const set = button.SetHasClass.bind(button);
    button.SetHasClass = (name, value) => { if (name === 'Changed' || name === 'HasCond') writes.push([button.id, name, value]); set(name, value); };
  }
  const rules = { [cell(m, row)]: { slot: 1, minTier: 1, value: changed(row) } };
  m.api.editSettings(m.api.getSettings(), rules);
  assert.equal(nav.BHasClass('HasCond'), true); assert.equal(nav.BHasClass('Changed'), false); assert.equal(sub.BHasClass('Changed'), false);
  const next = m.api.getSettings(); values(next, row)[row.key] = changed(row);
  m.api.applyPresetSettings(next, 'star-preset', false, false, rules);
  assert.equal(nav.BHasClass('Changed'), true); assert.equal(sub.BHasClass('Changed'), true); assert.equal(nav.BHasClass('HasCond'), true);
  const count = writes.length;
  m.api.applySettings(next, rules); m.h.scheduler.runFor(2000);
  assert.equal(writes.length, count, 'unchanged sync and watcher ticks do not reassign nav classes');
  m.api.applyPresetSettings(m.contract.defaults, 'baked_default', false, false);
  assert.equal(nav.BHasClass('Changed'), false); assert.equal(sub.BHasClass('Changed'), false); assert.equal(nav.BHasClass('HasCond'), false);
});

test('all toggle handles and their row/control ancestors allow the full circle to paint in either state', () => {
  const m = theme(), toggles = m.find('HPColorsMenuHost').FindChildrenWithClassTraverse('HPC3Toggle');
  assert.ok(toggles.length > 10);
  for (const toggle of toggles) {
    for (const checked of [false, true]) {
      toggle.SetHasClass('Checked', checked);
      assert.equal(computed(toggle, 'overflow'), 'noclip');
      for (const handle of toggle.children) {
        assert.equal(computed(handle, 'width'), '20px'); assert.equal(computed(handle, 'height'), '20px');
        assert.equal(computed(handle, 'overflow'), 'noclip');
      }
      assert.equal(computed(m.child(toggle, 'HPC3ToggleOn'), 'opacity'), checked ? '1' : '0');
    }
    for (const name of ['HPC3RowControls', 'HPC3Row', 'HPC3BoundsRow']) {
      const parent = ancestor(toggle, name);
      if (parent) assert.equal(computed(parent, 'overflow'), 'noclip');
    }
  }
});

test('number and colour values follow yielding sliders with a common 16px gap on every settings page', () => {
  const m = theme();
  for (const row of m.contract.controls.filter(row => row.type === 'number' || row.type === 'color')) {
    const slider = m.find(row.sliderId || row.hueId), group = slider.GetParent(), value = group.children[1];
    assert.equal(computed(group, 'flowChildren'), 'right');
    assert.equal(computed(slider, 'width'), 'fill-parent-flow(1)'); assert.equal(computed(slider, 'marginRight'), undefined);
    assert.equal(computed(value, 'marginLeft'), '16px'); assert.equal(computed(value, 'horizontalAlign'), undefined);
    assert.ok(group.children[0] === slider && group.children[1] === value);
    if (row.type === 'color') {
      const hex = m.find(row.hexId);
      const box = hex.GetParent(); assert.ok(group.children[2] === box && box.BHasClass('HPC3EntryBox')); assert.equal(computed(box, 'marginLeft'), '8px'); assert.equal(computed(box, 'horizontalAlign'), undefined);
    }
  }
});

test('radio choices use content widths and equal gaps rather than stretching their labels into uneven segments', () => {
  const m = theme();
  for (const row of m.contract.controls.filter(row => row.kind === 'segment')) {
    for (const option of row.options) {
      const button = m.find(option.id), label = button.children[1];
      assert.equal(computed(button, 'width'), 'fit-children'); assert.equal(computed(button, 'marginRight'), '24px');
      assert.equal(computed(label, 'width'), undefined); assert.equal(computed(label, 'textOverflow'), undefined);
      assert.equal(computed(button.children[0], 'verticalAlign'), 'center'); assert.equal(computed(label, 'verticalAlign'), 'center');
    }
  }
});

test('folds align to row inset with readable stock subtitles, and search retains readable headings and no-results copy', () => {
  const m = theme();
  for (const fold of m.contract.menu.folds) {
    const button = m.find(fold.toggleId), label = m.child(button, 'HPC3FoldLabel'), body = m.find(fold.bodyId), parent = m.find(fold.id);
    assert.equal(computed(button, 'paddingLeft'), '32px'); assert.equal(computed(button, 'height'), '32px');
    assert.equal(computed(label, 'fontSize'), '18px'); assert.equal(computed(label, 'fontFamily'), 'block');
    const wasOpen = parent.BHasClass('Open'); m.fire(fold.toggleId);
    assert.equal(computed(body, 'visibility'), wasOpen ? 'collapse' : 'visible'); m.fire(fold.toggleId);
  }
  for (const page of m.contract.menu.pages) {
    m.fire(page.navId); assert.equal(computed(m.find('HPColorsPageDescription'), 'fontSize'), '18px');
  }
  const search = m.find('HPColorsSearchField'); search.text = 'bar color'; m.fire(search.id, 'ontextentrychange');
  for (const heading of m.find('HPColorsMenuHost').FindChildrenWithClassTraverse('HPC3ColumnTitle')) assert.equal(computed(heading, 'fontSize'), '16px');
  search.text = 'no such setting'; m.fire(search.id, 'ontextentrychange');
  assert.equal(computed(m.find('HPColorsSearchEmpty'), 'visibility'), 'visible'); assert.equal(computed(m.find('HPColorsSearchEmpty'), 'fontSize'), '18px');
});

test('search icon and text share vertical centring without the browser-only top-padding offset', () => {
  const m = theme(), entry = m.find('HPColorsSearchField'), icon = m.child(m.find('HPColorsSearchBox'), 'HPC3SearchFieldIcon');
  assert.equal(computed(entry, 'verticalAlign'), 'center'); assert.equal(computed(icon, 'verticalAlign'), 'center');
  assert.equal(computed(entry, 'height'), 'fit-children'); assert.equal(computed(entry, 'padding'), '0px 8px 0px 36px');
  entry.text = 'name'; m.fire(entry.id, 'ontextentrychange'); assert.equal(m.find('HPColorsMenuHost').BHasClass('Searching'), true);
});

test('all eight dialogs bound and scroll their contents, centre pill labels and keep picker/condition fields aligned', () => {
  const m = theme(), dialogs = m.find('HPColorsMenuHost').children.filter(panel => panel.BHasClass('HPC3Dialog'));
  for (const dialog of dialogs) {
    const card = m.child(dialog, 'HPC3DialogCard');
    assert.equal(computed(card, 'maxWidth'), '90%'); assert.equal(computed(card, 'maxHeight'), '94%');
    assert.equal(computed(card, 'overflow'), 'squish scroll', 'large fonts cannot strand confirmation or Close offscreen');
    for (const button of card.FindChildrenWithClassTraverse('HPC3DialogButton')) for (const label of button.FindChildrenWithClassTraverse('Content').flatMap(p => p.children)) {
      assert.equal(computed(label, 'verticalAlign'), 'center'); assert.equal(computed(label, 'marginBottom'), '0px');
    }
  }
  assert.equal(computed(m.find('HPColorsPickerHex'), 'horizontalAlign'), 'center');
  assert.equal(computed(m.find('HPColorsConditionBooleanToggle'), 'horizontalAlign'), 'center');
  assert.equal(computed(m.find('HPColorsConditionHex'), 'marginLeft'), '12px');
  const row = m.contract.controls.find(row => row.key === 'barColorHigh');
  m.fire(row.conditionId); m.fire('HPColorsConditionSlot1');
  assert.equal(computed(m.find('HPColorsConditionSlot1Label'), 'fontSize'), '16px');
  assert.equal(computed(m.find('HPColorsConditionSlot1'), 'height'), '136px');
  m.fire('HPColorsConditionEscClose'); assert.equal(m.find('HPColorsConditionDialog').BHasClass('Open'), false);
});

test('Presets and share codes use stock pills, full-width entries and bounded action rows instead of legacy tiny green boxes', () => {
  const m = theme(); m.fire('HPColorsNavPresetsButton');
  for (const button of m.find('HPColorsPagePresets').FindChildrenWithClassTraverse('HPC3ActionButton')) {
    assert.equal(button.BHasClass('SecondaryButton'), true); assert.equal(button.BHasClass('light'), true);
    assert.equal(computed(button, 'backgroundColor'), undefined);
    assert.equal(computed(button, 'border'), button.enabled === false ? '2px solid #FFEFD788' : undefined);
    assert.equal(computed(button.children[0], 'fontSize'), undefined, 'inherits stock pill typography');
    assert.equal(button.children[0].GetAttributeString('hittest', ''), 'false');
    assert.ok(button.GetParent().children.filter(p => p.paneltype === 'Button').length <= 4, 'bounded action row');
  }
  for (const key of ['Settings', 'Bundle']) {
    const entry = m.find('HPColors' + key + 'CodeEntry'), row = m.find('HPColors' + key + 'CodeRow');
    assert.equal(computed(row, 'flowChildren'), 'down'); assert.equal(computed(entry, 'width'), 'fill-parent-flow(1)');
    assert.equal(computed(entry, 'fontSize'), '16px'); assert.equal(computed(m.child(row, 'HPC3Copy'), 'width'), '100%');
    assert.ok(m.find('HPColors' + key + 'CopyButton').GetParent() === m.find('HPColors' + key + 'ImportButton').GetParent());
  }
  assert.equal(computed(m.find('HPColorsPresetSelectedNameEntry'), 'width'), '100%');
  assert.equal(computed(m.find('HPColorsHeroIdentityLabel'), 'fontSize'), '16px');
});

test('fold counts track displayed sides plus shared rows, including single-side cards and search matches', () => {
  const m = theme(), tabs = m.contract.menu.groups.find(group => group.sides), root = m.find('HPColorsMenuHost');
  const check = () => {
    for (const fold of m.contract.menu.folds) {
      const card = m.contract.menu.groups.find(group => group.page === fold.page && group.name === fold.group);
      const singleSide = m.find(card.id).BHasClass('HPC3SingleSide'), side = root.BHasClass('HPC3SideAlly') ? 'ally' : 'enemy';
      const rows = m.contract.controls.filter(row => row.page === fold.page && row.group === fold.group && row.level === fold.level);
      const expected = rows.filter(row => root.BHasClass('Searching') ? !m.find(row.rowId).BHasClass('SearchMiss') : row.side === 'shared' || singleSide || row.side === side).length;
      assert.equal(m.find(fold.labelId).text, fold.level.toUpperCase() + ' · ' + expected, fold.id);
    }
  };
  check();
  const units = m.contract.menu.folds.find(fold => fold.page === 'Units' && fold.level === 'basic');
  assert.equal(m.find(units.labelId).text, 'BASIC · 4', 'live six-count defect: four Enemy/shared rows, not both side columns');
  for (const tab of tabs.sides) { m.fire(tab.id); check(); }
  const search = m.find('HPColorsSearchField');
  for (const query of ['bar color', 'enemy', 'no such setting', '']) {
    search.text = query; m.fire(search.id, 'ontextentrychange'); check();
    m.fire(tabs.sides[1].id); check();
  }
  assert.equal(m.find('HPColorsUndoButton').enabled, false, 'side/search counts are not settings edits');
});

test('Presets header, compact library, selected toolbar and share rows use the same 32px left inset', () => {
  const m = theme(); m.fire('HPColorsNavPresetsButton');
  const header = ancestor(m.find('HPColorsHeroIdentityLabel'), 'HPC3LibraryHeader');
  assert.ok(header); assert.equal(computed(header, 'padding'), '0px 32px');
  for (const id of ['HPColorsPresetNameEntry', 'HPColorsPresetSaveButton', 'HPColorsPresetRestoreButton', 'HPColorsPresetStatus']) {
    assert.ok(ancestor(m.find(id), 'HPC3LibraryHeader') === header, id);
  }
  assert.equal(computed(m.find('HPColorsPresetList'), 'padding'), '8px 32px');
  const toolbar = ancestor(m.find('HPColorsPresetSelectedNameEntry'), 'HPC3PresetToolbar');
  assert.ok(toolbar); assert.equal(computed(toolbar, 'padding'), '0px 32px');
  for (const key of ['Settings', 'Bundle']) assert.equal(computed(m.find('HPColors' + key + 'CodeRow'), 'padding'), '10px 32px');
});

test('disabled glyphs remain readable and inert without inheriting footer dimming', () => {
  const m = theme(); m.fire('HPColorsNavPresetsButton');
  for (const id of ['HPColorsPresetRestoreButton', 'HPColorsPresetSelectedUpButton', 'HPColorsPresetSelectedDownButton']) {
    const button = m.find(id); assert.equal(button.enabled, false);
    assert.equal(computed(button, 'opacity'), '0.35'); assert.equal(computed(button, 'brightness'), '1');
    assert.equal(computed(button.FindChildrenWithClassTraverse('HPC3Glyph')[0], 'washColor'), '#FFEFD7');
    state(button, 'hover'); assert.equal(computed(button, 'opacity'), '0.35');
    button.enabled = true; assert.equal(computed(button, 'opacity'), undefined);
  }
  assert.equal(computed(m.find('HPColorsUndoButton'), 'opacity'), '0.15', 'footer dimming is separate');
});

test('generic preview help remains valid when switching from HERO to every Units kind', () => {
  const m = theme(), note = m.find('HPColorsPreviewNote'), generic = note.text;
  assert.doesNotMatch(generic, /HERO shows|team1|team2/, 'no HERO-only bounds claim or fixed ownership claim for neutral units');
  m.fire('HPColorsNavUnitsButton');
  for (const kind of ['Npc', 'Neutral', 'Objective']) {
    m.fire('HPColorsPreviewKindOption' + kind);
    assert.equal(note.text, generic); assert.equal(note.GetAttributeString('hittest', ''), 'false');
  }
  m.fire('HPColorsNavBarButton'); assert.equal(note.text, generic);
});

test('round 3: every title-row reset and side tab is centred without vertical pill margins; folds remain centred', () => {
  const m = theme();
  for (const group of m.contract.menu.groups) {
    assert.equal(computed(m.find(group.resetId), 'verticalAlign'), 'center');
    assert.equal(computed(m.find(group.resetId), 'marginLeft'), '12px');
    if (group.sides) {
      const tabs = m.find(group.sides[0].id).GetParent();
      assert.equal(computed(tabs, 'verticalAlign'), 'center');
      for (const side of group.sides) assert.equal(computed(m.find(side.id), 'margin'), '0px 0px 0px 8px');
    }
  }
  for (const fold of m.contract.menu.folds) assert.equal(computed(m.find(fold.labelId), 'verticalAlign'), 'center');
});

test('round 3: glyph actions have stock Images and visible action-name tooltips on hover and focus', () => {
  const m = theme(); m.fire('HPColorsNavPresetsButton');
  const expected = {
    PresetSelectedApply: 'icons/icon_checkmark.vsvg', PresetSelectedRename: 'main_menu/icons/menu_edit.vsvg',
    PresetSelectedUp: 'control_icons/arrow_solid_up_png.vtex', PresetSelectedDown: 'control_icons/arrow_solid_down_png.vtex',
    PresetSelectedCopy: 'icons/icon_copy.vsvg', PresetSelectedDelete: 'icons/icon_eye_disabled.vsvg',
    PresetSelectedHeroes: 'main_menu/icons/menu_heroes.vsvg', PresetSelectedDefault: 'icons/icon_star_white.vsvg',
    PresetSave: 'icons/icon_add.vsvg', PresetRestore: 'icons/reset.vsvg',
    SettingsCopy: 'icons/icon_copy.vsvg', BundleCopy: 'icons/icon_copy.vsvg',
    SettingsImport: 'icons/icon_copy_paste.vsvg', BundleImport: 'icons/icon_copy_paste.vsvg',
  };
  for (const [key, asset] of Object.entries(expected)) {
    const button = m.find('HPColors' + key + 'Button'), image = button.FindChildrenWithClassTraverse('HPC3Glyph')[0];
    assert.equal(image.paneltype, 'Image');
    assert.equal(image.src || image.GetAttributeString('src', ''), 's2r://panorama/images/' + asset);
    assert.equal(image.GetAttributeString('scaling', ''), 'stretch-to-fit-preserve-aspect');
    for (const event of ['onmouseover', 'onfocus']) {
      m.fire(button.id, event);
      const shown = m.h.dispatches.at(-1);
      assert.equal(shown[0], 'UIShowTextTooltip'); assert.ok(shown[1] === button);
      assert.equal(shown[2], button.GetAttributeString('tooltip', '')); assert.ok(shown[2].length);
    }
  }
  const heroIcon = m.find('HPColorsHeroTitleLabel').GetParent().FindChildrenWithClassTraverse('HPC3NoticeIcon')[0];
  assert.equal(heroIcon.GetAttributeString('src', ''), 's2r://panorama/images/main_menu/icons/menu_heroes.vsvg');
  assert.equal(heroIcon.GetAttributeString('scaling', ''), 'stretch-to-fit-preserve-aspect');
  assert.equal(m.find('HPColorsBundleReplaceButton').children[0].text, 'REPLACE ALL');
});

test('round 3: stock keyframe exceptions retain faithful stops and land on titles rather than whole cards', () => {
  const { keyframes } = require('./style-cascade'), m = theme();
  const pulse = keyframes('HPC3SelectedHeroAnim').stops, name = keyframes('HPC3SelectedHeroNameAnim').stops;
  assert.equal(pulse['0%'].brightness, '1'); assert.equal(pulse['50%'].brightness, '2');
  assert.equal(pulse['50%']['box-shadow'], 'fill #5FE69E11 0px 0px 32px 1px');
  assert.equal(name['50%']['text-shadow'], '0px 0px 3.0 #7FFFBE');
  const reveal = keyframes('HPC3HeroNoticeBackgroundTransitionOn').stops;
  assert.equal(reveal['0%']['opacity-mask-threshold'], '100% 2%'); assert.equal(reveal['100%']['opacity-mask-threshold'], '2% 2%');
  const shake = keyframes('HPC3NegativeShake').stops;
  assert.equal(shake['60%'].transform, 'translateX(2px)'); assert.equal(shake['61%'].transform, 'translateX(-2px)');
  assert.equal(keyframes('HPC3GlowSearchInput').stops['100%'].border, '4px solid #FFEFD7');
  const group = m.contract.menu.groups[1], card = m.find(group.id), title = m.child(m.child(card, 'HPC3CardHead'), 'HPC3CardTitle');
  m.fire(group.subNavId); assert.equal(title.BHasClass('HPC3SearchLanding'), true); assert.equal(card.BHasClass('HPC3SearchLanding'), false);
  assert.equal(computed(title, 'animationDuration'), '0.5s'); assert.equal(computed(title, 'animationIterationCount'), '2');
  assert.equal(computed(title, 'animationDelay'), '0.1s');
  state(m.find('HPColorsSearchField'), 'focus'); assert.equal(computed(m.find('HPColorsSearchField'), 'animationName'), 'HPC3GlowSearchInput');
  state(m.find(group.subNavId), 'active'); assert.equal(computed(m.find(group.subNavId), 'preTransformScale2d'), '0.98');
});

test('round 3 polish: hero picker has five stock-sized columns, five-row scroll cap, search icon and a single DONE CTA', () => {
  const m = theme(); m.fire('HPColorsPresetSelectedHeroesButton');
  const grid = m.find('HPColorsHeroList'), tiles = grid.Children(), field = m.find('HPColorsHeroSearchField');
  assert.equal(computed(grid, 'maxWidth'), '440px'); assert.equal(computed(grid, 'height'), '356px');
  assert.equal(computed(grid, 'overflow'), 'squish scroll');
  assert.equal(computed(tiles[0], 'width'), '80px'); assert.equal(computed(tiles[0], 'height'), '68px');
  assert.equal(Math.floor((440 - 16 - 24) / 80), 5, 'five columns fit with padding and scrollbar clearance');
  assert.equal(field.GetAttributeString('placeholder', ''), 'Search heroes');
  const icon = field.GetParent().FindChildrenWithClassTraverse('HPC3SearchFieldIcon')[0];
  assert.ok(icon); assert.equal(icon.GetAttributeString('src', ''), 's2r://panorama/images/control_icons/24px/search.vsvg');
  assert.equal(computed(field, 'height'), 'fit-children'); assert.equal(computed(field, 'verticalAlign'), 'center');
  assert.equal(computed(field, 'padding'), '0px 8px 0px 36px');
  const done = m.find('HPColorsHeroCloseButton');
  assert.equal(done.BHasClass('CTA'), true); assert.equal(done.BHasClass('Fill'), true);
  assert.equal(done.FindChildrenWithClassTraverse('Content')[0].children[0].text, 'DONE');
  for (const key of ['ResetPage', 'PresetDelete', 'BundleReplace', 'Hero', 'Condition', 'Picker']) {
    assert.equal(computed(m.find('HPColors' + key + 'EscClose'), 'visibility'), 'collapse');
  }
  m.h.$.HPColorsMenuCancel(); assert.equal(m.find('HPColorsHeroDialog').BHasClass('Open'), false);
});

test('round 3 polish: glyphs use circular layered stock controls with APPLY primary and inline entry rows', () => {
  const m = theme(); m.fire('HPColorsNavPresetsButton');
  for (const button of m.find('HPColorsPagePresets').FindChildrenWithClassTraverse('HPC3GlyphButton')) {
    assert.equal(button.BHasClass('InputButtonBorderRadius'), true);
    assert.equal(computed(button, 'width'), '40px'); assert.equal(computed(button, 'height'), '40px');
    assert.equal(computed(button, 'borderRadius'), '50%');
    for (const key of ['Bottom', 'Top', 'Content']) {
      const layer = m.child(button, key); assert.equal(layer.GetAttributeString('hittest', ''), 'false');
      if (key !== 'Content') assert.equal(computed(layer, 'borderRadius'), '50%');
    }
    const content = m.child(button, 'Content'), icon = m.child(content, 'HPC3Glyph');
    assert.equal(computed(content, 'padding'), '0px'); assert.equal(computed(icon, 'horizontalAlign'), 'center');
    assert.equal(button.BHasClass('CTA'), button.id === 'HPColorsPresetSelectedApplyButton');
    assert.equal(button.BHasClass('Fill'), button.id === 'HPColorsPresetSelectedApplyButton');
  }
  for (const [entryId, actions] of [
    ['HPColorsPresetNameEntry', ['PresetSave', 'PresetRestore']],
    ['HPColorsSettingsCodeEntry', ['SettingsCopy', 'SettingsImport']],
    ['HPColorsBundleCodeEntry', ['BundleCopy', 'BundleImport', 'BundleReplace']],
  ]) {
    const entry = m.find(entryId), row = entry.GetParent();
    assert.equal(computed(entry, 'width'), 'fill-parent-flow(1)'); assert.equal(computed(row, 'flowChildren'), 'right');
    for (const action of actions) assert.ok(m.find('HPColors' + action + 'Button').GetParent() === row);
  }
  const toolbar = m.find('HPColorsPresetSelectedApplyButton').GetParent();
  assert.equal(computed(toolbar, 'flowChildren'), 'right-wrap');
  assert.notEqual(computed(toolbar, 'horizontalAlign'), 'right', 'narrow selected toolbar stays left-aligned');
});

test('round 3 polish: library names centre, markers share top-right, faces are dark unless selected and Play depresses', () => {
  const m = theme(), tile = m.find('HPColorsPresetDefault'), face = m.child(tile, 'HPC3PresetTileFace');
  const name = m.find('HPColorsPresetDefaultNameLabel'), applied = m.child(tile, 'HPC3PresetSource'), star = m.child(tile, 'HPC3PresetDefaultMark');
  assert.equal(computed(name, 'textAlign'), 'center'); assert.equal(computed(name, 'horizontalAlign'), 'center'); assert.equal(computed(name, 'fontSize'), '18px');
  assert.equal(computed(name, 'textTransform'), 'uppercase'); assert.equal(computed(name, 'whiteSpace'), 'nowrap');
  assert.equal(computed(tile, 'border'), '2px solid #FFEFD711');
  assert.equal(applied.paneltype, 'Image'); assert.match(applied.GetAttributeString('src', ''), /icon_checkmark\.vsvg$/);
  assert.equal(computed(applied, 'horizontalAlign'), 'right'); assert.equal(computed(applied, 'verticalAlign'), 'top');
  assert.equal(computed(star, 'horizontalAlign'), 'right'); assert.equal(computed(star, 'verticalAlign'), 'top');
  assert.notEqual(computed(applied, 'marginRight'), computed(star, 'marginRight'), 'markers cannot overlap');
  tile.RemoveClass('Selected'); assert.match(computed(face, 'backgroundColor'), /radial.*#00000000.*#00000066/);
  tile.AddClass('Selected'); assert.equal(computed(face, 'backgroundColor'), '#5FE69E');
  const play = m.find('HPColorsPreviewPlay'); state(play, 'active');
  assert.equal(computed(play, 'preTransformScale2d'), '0.98');
});

test('round 3 polish: portraits and gear centre as circle siblings and ownership dots anchor inside the circle bounds', () => {
  const m = theme(); m.fire('HPColorsPresetSelectedHeroesButton');
  for (const tile of m.find('HPColorsHeroList').Children()) {
    const circle = m.child(tile, 'HPC3HeroCircle'), portrait = m.child(tile, 'HPC3HeroPortrait');
    assert.ok(circle.GetParent() === portrait.GetParent());
    for (const node of [circle, portrait]) {
      assert.equal(computed(node, 'horizontalAlign'), 'center'); assert.equal(computed(node, 'verticalAlign'), 'center');
    }
    const anchor = m.child(tile, 'HPC3HeroAssignedAnchor'), dot = m.child(anchor, 'HPC3HeroAssignedDot');
    assert.equal(computed(anchor, 'width'), computed(circle, 'width')); assert.equal(computed(anchor, 'height'), computed(circle, 'height'));
    assert.equal(computed(anchor, 'horizontalAlign'), 'center'); assert.equal(computed(anchor, 'verticalAlign'), 'center');
    assert.equal(computed(dot, 'width'), '8px'); assert.equal(computed(dot, 'height'), '8px');
    assert.equal(computed(dot, 'horizontalAlign'), 'left'); assert.equal(computed(dot, 'verticalAlign'), 'top');
    assert.equal(computed(dot, 'margin'), '4px 0px 0px 4px');
    assert.ok(tile.Children().indexOf(anchor) > tile.Children().indexOf(portrait), 'dot paints above the portrait by sibling order, without z-index');
    tile.AddClass('SelectedHero');
    assert.equal(computed(circle, 'width'), '56px'); assert.equal(computed(portrait, 'width'), '44px');
    assert.equal(computed(anchor, 'width'), '56px');
  }
});

test('ticket 31: credits reuses notice chrome and passive hero-picker circles beside readable names and wrapped text', () => {
  const m = theme(), dialog = m.find('HPColorsCreditsDialog');
  assert.equal(computed(dialog, 'visibility'), 'collapse'); m.fire('HPColorsPreviewCreditsButton');
  assert.equal(computed(dialog, 'visibility'), 'visible');
  for (const key of ['Yesdaddy', 'Razorrzr']) {
    const portrait = m.find('HPColorsCredits' + key + 'Portrait'), name = m.find('HPColorsCredits' + key + 'Name'), text = m.find('HPColorsCredits' + key + 'Text');
    const frame = portrait.GetParent(), circle = m.child(frame, 'HPC3HeroCircle'), heading = frame.GetParent(), entry = heading.GetParent();
    assert.ok(name.GetParent() === heading); assert.ok(text.GetParent() === entry);
    assert.equal(computed(heading, 'flowChildren'), 'right'); assert.equal(computed(entry, 'flowChildren'), 'down');
    assert.equal(computed(frame, 'width'), '56px'); assert.equal(computed(frame, 'height'), '56px');
    assert.equal(computed(circle, 'width'), '50px'); assert.equal(computed(circle, 'borderRadius'), '64px');
    assert.equal(computed(portrait, 'width'), '40px');
    for (const panel of [portrait, circle]) {
      assert.equal(computed(panel, 'horizontalAlign'), 'center'); assert.equal(computed(panel, 'verticalAlign'), 'center');
    }
    for (const panel of [portrait, circle, frame, heading, entry, name, text]) assert.equal(panel.GetAttributeString('hittest', ''), 'false');
    assert.equal(entry.GetAttributeString('hittestchildren', ''), 'false');
    assert.equal(computed(name, 'fontFamily'), 'oracle'); assert.equal(computed(name, 'verticalAlign'), 'center');
    assert.equal(computed(text, 'width'), '100%'); assert.equal(computed(text, 'whiteSpace'), 'normal'); assert.equal(computed(text, 'textAlign'), 'left');
  }
  m.fire('HPColorsCreditsCloseButton'); assert.equal(computed(dialog, 'visibility'), 'collapse');
});
