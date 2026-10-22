'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadLayout, parseLayout, runInVm, sourceRoot, latestPublishedConfig } = require('./boot-layout');
// HUD paint and local-hero detection continue independently of menu interaction work.
const work = h => h.scheduler.jobs.filter(job => !(job.fn && ['hudWatch', 'identityWatch', 'updateCheck'].includes(job.fn.name)));

const root = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'settings/schema.json'), 'utf8'));
const pascal = text => text[0].toUpperCase() + text.slice(1);
const sidesOf = row => row.side === 'side-aware' ? ['enemy', 'ally'] : [row.side];

// Panorama semantics the shared mock does not model: DropDown.SetSelected takes an option id
// string, and moving focus fires onblur on the panel that loses it.
function enforcePanorama(boot) {
  const h = boot.harness;
  h.focusedPanel = null;
  (function patch(panel) {
    if (panel.type === 'DropDown') {
      const original = panel.SetSelected.bind(panel);
      panel.SetSelected = id => {
        if (typeof id !== 'string') throw new TypeError('DropDown.SetSelected expects an option id string');
        original(id);
      };
    }
    panel.SetFocus = () => {
      const previous = h.focusedPanel;
      if (previous === panel) return;
      if (previous) { previous.focused = false; if (previous.events.onblur) previous.events.onblur(); }
      h.focusedPanel = panel; panel.focused = true;
      if (panel.events.onfocus) panel.events.onfocus();
    };
    for (const child of panel.children) patch(child);
  })(h.contextPanel);
}
function booted(options = {}) {
  const boot = loadLayout('hud_escape_menu.xml', options);
  enforcePanorama(boot);
  boot.includeScripts();
  if (options.store !== undefined) boot.harness.$.HPColorsV3Store = options.store;
  boot.onload();
  const h = boot.harness;
  const find = id => { const panel = h.contextPanel.FindChildTraverse(id); assert.ok(panel, id); return panel; };
  const fire = (id, event) => { const panel = find(id); assert.equal(typeof panel.events[event], 'function', id + ' ' + event); panel.events[event](); };
  return {
    boot, h, find, fire,
    config: () => latestPublishedConfig(h),
    settings: () => latestPublishedConfig(h).settings,
    fires: () => h.dispatches.filter(event => event[0] === 'ClientUI_FireOutput').length,
    activate: id => fire(id, 'onactivate'),
    submit: (id, text) => { find(id).text = String(text); fire(id, 'ontextentrysubmit'); },
    search: text => { find('HPColorsSearchField').text = text; fire('HPColorsSearchField', 'ontextentrychange'); },
    cancel: () => runInVm(boot.panelNode.attrs.oncancel, boot.context),
    resumes: () => h.dispatches.filter(event => event[0] === 'CitadelResumePlaying').length,
  };
}
function walk(node, visit, parents = []) {
  visit(node, parents);
  for (const child of node.children) walk(child, visit, [...parents, node]);
}
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-menu-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('every table row and side is generated once in its page, fold and column with HPColors<Key><Role> ids', () => {
  const boot = loadLayout('hud_escape_menu.xml');
  assert.equal(boot.panelNode.attrs.id, undefined, 'root panel has no id');
  boot.includeScripts();
  const ids = Array.from(boot.harness.$.HPColorsV3Settings.ids);
  const seen = [];
  const where = new Map();
  walk(boot.panelNode, (node, parents) => {
    if (!node.attrs.id || !node.attrs.id.startsWith('HPColors')) return;
    seen.push(node.attrs.id);
    where.set(node.attrs.id, parents.map(parent => parent.attrs.id).filter(Boolean));
  });
  assert.deepEqual([...seen].sort(), [...ids].sort(), 'layout ids and the generated id list agree');
  assert.equal(new Set(seen).size, seen.length, 'no duplicate ids');
  for (const id of seen) assert.match(id, /^HPColors[A-Z][A-Za-z0-9]*$/);
  let rows = 0;
  for (const row of schema) {
    for (const side of sidesOf(row)) {
      rows++;
      const prefix = 'HPColors' + pascal(row.key) + (side === 'shared' ? '' : pascal(side));
      const page = 'HPColorsPage' + row.page.replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''));
      const group = (row.group || 'General').replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => c ? c.toUpperCase() : '');
      const fold = page + pascal(group) + pascal(row.level);
      const column = fold + pascal(side) + 'Column';
      assert.equal(seen.filter(id => id === prefix + 'Row').length, 1, prefix + 'Row');
      assert.deepEqual(where.get(prefix + 'Row').slice(-5), [page, page.replace('HPColorsPage', 'HPColorsCard') + pascal(group), fold + 'Fold', fold + 'FoldBody', column], prefix + ' placement');
      const roles = { boolean: ['Toggle'], color: ['HueSlider', 'Swatch', 'Hex'], number: ['Slider', 'Entry'],
        enum: row.type === 'enum' ? [row.options.length <= 4 ? 'Segment' : 'Select', ...row.options.map(option => 'Option' + pascal(option.value))] : [] }[row.type];
      for (const role of ['ResetButton', ...roles]) assert.ok(seen.includes(prefix + role), prefix + role);
    }
  }
  assert.equal(seen.filter(id => /Row$/.test(id) && !/Code(Row)$/.test(id)).length, rows);
});

// Style resolver over the shipped menu CSS for compound class/id/tag selectors with descendant
// combinators and :hover/:active states (node.states); later rules win, as in Panorama.
function menuStyleResolver() {
  const css = fs.readFileSync(path.join(sourceRoot, 'panorama/styles/hp_colors_v3_menu.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const rules = [];
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = {};
    for (const [, key, value] of body.matchAll(/([a-z-]+)\s*:\s*([^;]+)/g)) decls[key] = value.trim();
    for (const selector of selectors.split(',').map(text => text.trim())) {
      if (!selector || selector.includes('>') || selector.startsWith('@')) continue;
      rules.push({ parts: selector.split(/\s+/).map(part => ({ tag: (part.match(/^[A-Za-z]\w*/) || [])[0],
        id: (part.match(/#([\w-]+)/) || [])[1], classes: [...part.matchAll(/\.([\w-]+)/g)].map(match => match[1]),
        states: [...part.matchAll(/:([\w-]+)/g)].map(match => match[1]) })), decls });
    }
  }
  const matches = (part, node) => (!part.tag || part.tag === node.tag) && (!part.id || part.id === node.attrs.id) &&
    part.classes.every(name => (node.attrs.class || '').split(/\s+/).includes(name)) &&
    part.states.every(state => (node.states || []).includes(state));
  return function style(node, ancestors) {
    const out = {};
    for (const rule of rules) {
      const parts = rule.parts;
      if (!matches(parts[parts.length - 1], node)) continue;
      let index = parts.length - 2;
      for (let a = ancestors.length - 1; a >= 0 && index >= 0; a--) if (matches(parts[index], ancestors[a])) index--;
      if (index < 0) Object.assign(out, rule.decls);
    }
    return out;
  };
}

// Minimal Panorama width model over the generated layout and menu CSS: resolves width, max-width,
// padding and horizontal margins, and lays out flow-children: right rows where fill-parent-flow(1)
// shares what fixed siblings leave. Assumes Panorama's border-box sizing (width includes padding).
function widthModel(rootWidth) {
  const style = menuStyleResolver();
  const px = value => (value && /^-?[\d.]+px$/.test(value) ? parseFloat(value) : 0);
  function horizontal(box) {
    const parts = (box || '0px').split(/\s+/).map(px);
    return parts.length === 1 ? parts[0] * 2 : parts.length <= 3 ? parts[1] * 2 : parts[1] + parts[3];
  }
  const tree = parseLayout(fs.readFileSync(path.join(sourceRoot, 'panorama/layout/hud_escape_menu.xml'), 'utf8'));
  const widths = {};
  function layout(node, ancestors, width, available = width) {
    const s = style(node, ancestors);
    if (s['max-width']) width = Math.min(width, /%$/.test(s['max-width']) ? available * parseFloat(s['max-width']) / 100 : px(s['max-width']));
    if (s['min-width']) width = Math.max(width, px(s['min-width']));
    if (node.attrs.id) widths[node.attrs.id] = width;
    const inner = width - horizontal(s.padding) - px(s['padding-left']) - px(s['padding-right']);
    const children = node.children.filter(child => !['styles', 'scripts', 'include'].includes(child.tag));
    const resolved = children.map(child => {
      const cs = style(child, [...ancestors, node]);
      const margin = horizontal(cs.margin) + px(cs['margin-left']) + px(cs['margin-right']);
      const w = cs.width || '';
      let fixed = /px$/.test(w) ? px(w) : /%$/.test(w) ? inner * parseFloat(w) / 100 - margin : null;
      if (fixed !== null && cs['min-width']) fixed = Math.max(fixed, px(cs['min-width']));
      if (fixed !== null && cs['max-width']) fixed = Math.min(fixed, /%$/.test(cs['max-width']) ? inner * parseFloat(cs['max-width']) / 100 : px(cs['max-width']));
      return { child, cs, margin, fill: /fill-parent-flow/.test(w), fixed };
    });
    if (s['flow-children'] === 'right') {
      const flowing = resolved.filter(item => item.cs['ignore-parent-flow'] !== 'true');
      const used = flowing.reduce((sum, item) => sum + item.margin + (item.fill ? 0 : item.fixed || 0), 0);
      const fills = flowing.filter(item => item.fill).length;
      for (const item of resolved) layout(item.child, [...ancestors, node], item.fill ? (inner - used) / fills : item.fixed === null ? 0 : item.fixed, inner);
    } else {
      for (const item of resolved) layout(item.child, [...ancestors, node], item.fill ? inner - item.margin : item.fixed === null ? inner - item.margin : item.fixed, inner);
    }
  }
  layout(tree, [], rootWidth);
  return widths;
}

test('stock shell fits 5:4, 4:3 and 16:9: percentage rail/preview, shrinking search and capped sliders', () => {
  for (const root of [1350, 1440, 1920]) {
    const w = widthModel(root), rail = Math.max(240, Math.min(420, root * 0.18));
    assert.equal(w.HPColorsMenuHost, root);
    assert.equal(w.HPColorsEditorShell, root);
    assert.equal(w.HPColorsPreview, Math.min(484, root * 0.25));
    assert.equal(w.HPColorsSearchBox, Math.min(198, rail - 24 - 2 * (40 + 14)));
    assert.equal(w.HPColorsShareButton, 40);
    assert.equal(w.HPColorsResetPageButton, 40);
    assert.ok(w.HPColorsSettingsList >= 700, root + ': content ' + w.HPColorsSettingsList);
    assert.equal(w.HPColorsPreviewStage, 286, 'fixed inner 284px preview camera');
    for (const [id, width] of Object.entries(w).filter(([id]) => /Slider$/.test(id))) {
      assert.ok(width > 0 && width <= 300, root + ': ' + id + ' ' + width);
    }
  }
});

test('number sliders leave native stock tracks/thumbs untouched; only hue sliders own their ramp and thumb', () => {
  const style = menuStyleResolver();
  const slider = { tag: 'Slider', attrs: { class: 'HPC3Slider HorizontalSlider', id: 'HPColorsLowThresholdSlider' } };
  for (const states of [[], ['hover'], ['active']]) {
    for (const attrs of [{ class: 'SliderThumb' }, { id: 'SliderThumb' }, { id: 'SliderTrack' }, { id: 'SliderTrackProgress' }]) {
      const owned = style({ tag: 'Panel', attrs }, [{ ...slider, states }]);
      for (const prop of ['width', 'height', 'border', 'background-color', 'border-radius']) assert.equal(owned[prop], undefined, 'inherits native stock ' + JSON.stringify(attrs) + ': ' + prop);
    }
  }
  const hue = { tag: 'Slider', attrs: { class: 'HPC3HueSlider HorizontalSlider' } };
  assert.equal(style({ tag: 'Panel', attrs: { id: 'SliderThumb' } }, [hue]).border, '3px solid #000000');
  assert.match(style({ tag: 'Panel', attrs: { id: 'SliderTrack' } }, [hue])['background-color'], /color-stop\(0.92, #FF0000\)/);
});

test('ESC boots generated rows once with defaults, slider ranges and units; stock subtree and resume routes stay intact', () => {
  const m = booted();
  assert.equal(m.find('HPColorsMenuHost').GetAttributeString('hpv3_boot', ''), 'ready');
  const defaults = { side: { enemy: {}, ally: {} }, shared: {} };
  for (const row of schema) for (const side of sidesOf(row)) {
    (side === 'shared' ? defaults.shared : defaults.side[side])[row.key] = row.side === 'side-aware' ? row.default[side] : row.default;
  }
  assert.deepEqual(m.settings(), defaults);
  assert.equal(m.find('HPColorsBarColorEnabledEnemyToggle').BHasClass('Checked'), true);
  assert.equal(m.find('HPColorsBarColorEnabledAllyToggle').BHasClass('Checked'), false);
  assert.equal(m.find('HPColorsBarColorModeEnemyOptionGradient').BHasClass('Selected'), true);
  assert.equal(m.find('HPColorsBarColorModeEnemyOptionFixed').BHasClass('Selected'), false);
  assert.equal(m.find('HPColorsBarColorLowEnemySwatch').style.backgroundColor, '#FD4949');
  const slider = m.find('HPColorsLowThresholdSlider');
  assert.deepEqual([slider.min, slider.max, slider.increment, slider.value], [0, 99, 1, 25]);
  assert.equal(m.find('HPColorsLowThresholdEntry').text, '25');
  assert.equal(m.find('HPColorsLowThresholdEntry').GetParent().GetParent().Children().find(panel => panel.BHasClass('HPC3Unit')).text, '%');
  assert.equal(m.find('HPColorsLowThresholdRow').BHasClass('Changed'), false);
  const config = m.config();
  const fires = m.fires(), bindings = m.h.eventSetCounter.count;
  m.boot.onload();
  assert.deepEqual(m.config(), config, 'second onload keeps the published config');
  assert.equal(m.fires(), fires, 'second onload does not republish');
  assert.equal(m.h.eventSetCounter.count, bindings, 'second onload does not rebind');
  assert.equal(work(m.h).length, 0);

  const pinned = parseLayout(fs.readFileSync(path.join(root, 'vendor/hud_escape_menu.xml'), 'utf8'));
  function stock(node) {
    const attrs = { ...node.attrs };
    if (node.tag === 'CitadelHudEscapeMenu') { delete attrs.onload; delete attrs.oncancel; }
    if (['EscapeBackground', 'EscapeButton'].includes(node.attrs.id)) delete attrs.onactivate;
    return { tag: node.tag, attrs, children: node.children.filter(child => !(child.attrs.id || '').startsWith('HPColors')).map(stock) };
  }
  assert.deepEqual(stock(m.boot.panelNode), stock(pinned.children.find(node => node.tag === 'CitadelHudEscapeMenu')));
  assert.equal(m.find('HPColorsMenuButton').GetParent().id, 'SubOptions', 'entry point sits in the stock nav');
  for (const code of [m.boot.panelNode.attrs.oncancel, m.find('EscapeBackground').GetAttributeString('onactivate', ''),
    m.find('EscapeButton').GetAttributeString('onactivate', '')]) runInVm(code, m.boot.context);
  assert.equal(m.resumes(), 3);
});

test('editing each control type publishes a validated config; invalid input reverts without publishing', () => {
  const m = booted();
  let revision = m.config().revision;
  let fires = m.fires();
  const published = (expected) => {
    assert.ok(m.config().revision > revision, 'new revision');
    assert.ok(m.fires() > fires, 'dispatched to worlds');
    assert.deepEqual(latestPublishedConfig(m.h).settings, m.settings());
    revision = m.config().revision; fires = m.fires();
    if (expected) expected(m.settings());
  };
  const unchanged = () => { assert.equal(m.config().revision, revision); assert.equal(m.fires(), fires); };

  m.activate('HPColorsBarColorEnabledAllyToggle');
  published(s => assert.equal(s.side.ally.barColorEnabled, true));
  assert.equal(m.find('HPColorsBarColorEnabledAllyToggle').BHasClass('Checked'), true);
  assert.equal(m.find('HPColorsBarColorEnabledAllyRow').BHasClass('Changed'), true);
  m.activate('HPColorsBarColorEnabledAllyToggle');
  published(s => assert.equal(s.side.ally.barColorEnabled, false));
  assert.equal(m.find('HPColorsBarColorEnabledAllyRow').BHasClass('Changed'), false);

  m.activate('HPColorsBarColorModeEnemyOptionFixed');
  published(s => assert.equal(s.side.enemy.barColorMode, 'fixed'));
  assert.equal(m.find('HPColorsBarColorModeEnemyOptionFixed').BHasClass('Selected'), true);
  assert.equal(m.find('HPColorsBarColorModeEnemyOptionGradient').BHasClass('Selected'), false);
  m.activate('HPColorsBarColorModeEnemyOptionFixed');
  unchanged();

  m.submit('HPColorsBarColorLowEnemyHex', 'abcdef');
  published(s => assert.equal(s.side.enemy.barColorLow, '#ABCDEF'));
  assert.equal(m.find('HPColorsBarColorLowEnemyHex').text, '#ABCDEF');
  assert.equal(m.find('HPColorsBarColorLowEnemySwatch').style.backgroundColor, '#ABCDEF');
  m.submit('HPColorsBarColorLowEnemyHex', '#12345G');
  unchanged();
  assert.equal(m.find('HPColorsBarColorLowEnemyHex').text, '#ABCDEF', 'invalid hex reverts');

  m.submit('HPColorsLowThresholdEntry', '40.4');
  published(s => assert.equal(s.shared.lowThreshold, 40));
  assert.equal(m.find('HPColorsLowThresholdSlider').value, 40);
  m.submit('HPColorsLowThresholdEntry', '99');
  published(s => assert.equal(s.shared.lowThreshold, 64, 'low stays below high'));
  m.submit('HPColorsLowThresholdEntry', 'abc');
  unchanged();
  assert.equal(m.find('HPColorsLowThresholdEntry').text, '64');
  m.submit('HPColorsHighThresholdEntry', '-5');
  unchanged();
  assert.equal(m.find('HPColorsHighThresholdEntry').text, '65', 'high clamps to low + 1, which is the current value');

  const slider = m.find('HPColorsHighThresholdSlider');
  slider.value = 80.6; m.h.releaseSlider(slider);
  published(s => assert.equal(s.shared.highThreshold, 81));
  assert.equal(m.find('HPColorsHighThresholdEntry').text, '81');
});

test('programmatic control sync never re-enters edit handlers (Panorama fires onvaluechanged on value writes)', () => {
  const boot = loadLayout('hud_escape_menu.xml');
  const slider = boot.harness.contextPanel.FindChildTraverse('HPColorsLowThresholdSlider');
  let value = 0;
  Object.defineProperty(slider, 'value', { get: () => value, set: next => { value = next; if (slider.events.onvaluechanged) slider.events.onvaluechanged(); } });
  boot.includeScripts(); boot.onload();
  const fires = boot.harness.dispatches.filter(event => event[0] === 'ClientUI_FireOutput').length;
  const revision = latestPublishedConfig(boot.harness).revision;
  const entry = boot.harness.contextPanel.FindChildTraverse('HPColorsLowThresholdEntry');
  entry.text = '30'; entry.events.ontextentrysubmit();
  assert.equal(latestPublishedConfig(boot.harness).revision, revision + 1, 'exactly one revision per edit');
  assert.equal(boot.harness.dispatches.filter(event => event[0] === 'ClientUI_FireOutput').length, fires + 1);
  assert.equal(value, 30);
});

test('folds are menu-local: toggling creates no revision, publish or store commit', () => {
  const calls = [];
  const m = booted({ store: { attach: api => { calls.push(['attach', api]); api.hydrateSettings(api.getSettings()); }, commit: config => calls.push(['commit', config.revision]) } });
  const fold = m.find('HPColorsPageBarColorsAdvancedFold');
  assert.equal(m.find('HPColorsPageBarColorsBasicFold').BHasClass('Open'), true, 'Basic starts open');
  assert.equal(fold.BHasClass('Open'), false, 'Advanced starts folded');
  const config = m.config();
  const fires = m.fires();
  m.activate('HPColorsPageBarColorsAdvancedFoldToggle');
  assert.equal(fold.BHasClass('Open'), true);
  m.activate('HPColorsPageBarColorsAdvancedFoldToggle');
  m.activate('HPColorsPageBarColorsBasicFoldToggle');
  assert.equal(fold.BHasClass('Open'), false);
  assert.equal(m.find('HPColorsPageBarColorsBasicFold').BHasClass('Open'), false);
  assert.deepEqual(m.config(), config);
  assert.equal(m.fires(), fires);
  assert.deepEqual(calls.map(call => call[0]), ['attach']);
});

test('search shows editable word-prefix matches across pages, folds and help; ESC closes search before the editor', () => {
  const m = booted();
  const hostPanel = m.find('HPColorsMenuHost');
  runInVm(m.find('HPColorsMenuButton').GetAttributeString('onactivate', ''), m.boot.context);
  assert.equal(hostPanel.BHasClass('HPC3Open'), true);
  m.find('HPColorsSearchField').SetFocus();
  assert.equal(m.find('HPColorsSearchField').focused, true, 'permanent field is immediately focusable');
  const rowIds = Array.from(m.h.$.HPColorsV3Settings.searchIndex, entry => entry.id);
  const visible = () => rowIds.filter(id => !m.find(id).BHasClass('SearchMiss'));

  m.search('RED');
  assert.equal(hostPanel.BHasClass('Searching'), true);
  assert.deepEqual(visible(), ['HPColorsBarColorLowEnemyRow', 'HPColorsBarColorLowAllyRow', 'HPColorsKillMarkerColorEnemyRow', 'HPColorsPulseColorEnemyRow', 'HPColorsPulseColorAllyRow'], 'keyword match; "red" does not match inside "shared"');
  assert.equal(m.find('HPColorsPageBar').BHasClass('SearchMiss'), false);
  assert.equal(m.find('HPColorsPageBarGeneralBasicSharedColumn').BHasClass('SearchMiss'), true);
  assert.equal(m.find('HPColorsPageBarColorsBasicAllyColumn').BHasClass('SearchMiss'), false);
  assert.equal(m.find('HPColorsPageHPText').BHasClass('SearchMiss'), true, 'empty pages collapse while searching');

  m.search('blends');
  assert.deepEqual(visible(), ['HPColorsBarColorModeEnemyRow', 'HPColorsBarColorModeAllyRow', 'HPColorsPulseColorModeEnemyRow', 'HPColorsPulseColorModeAllyRow'], 'help text matches');
  m.search('sapph');
  assert.deepEqual(visible(), ['HPColorsBarColorTeamHighEnemyRow', 'HPColorsBarColorTeamHighAllyRow', 'HPColorsTeamSapphireColorRow',
    'HPColorsHpTextColorModeEnemyRow', 'HPColorsHpTextColorModeAllyRow', 'HPColorsHpTextTeamHighEnemyRow', 'HPColorsHpTextTeamHighAllyRow',
    'HPColorsNameColorModeEnemyRow', 'HPColorsNameColorModeAllyRow',
    'HPColorsStaminaColorModeEnemyRow', 'HPColorsStaminaColorModeAllyRow'], 'prefix of a keyword, inside the closed Advanced fold');
  assert.equal(m.find('HPColorsPageBarColorsAdvancedFold').BHasClass('SearchMiss'), false);
  assert.equal(m.find('HPColorsPageBarColorsAdvancedFold').BHasClass('Open'), false, 'search does not change fold state');
  m.search('threshold high');
  assert.deepEqual(visible(), ['HPColorsBarColorMidEnemyRow', 'HPColorsBarColorMidAllyRow', 'HPColorsLowThresholdRow', 'HPColorsHighThresholdRow', 'HPColorsHpTextMidEnemyRow', 'HPColorsHpTextMidAllyRow'], 'every word must match, in names or help');

  const revision = m.config().revision;
  m.submit('HPColorsHighThresholdEntry', '70');
  assert.equal(m.settings().shared.highThreshold, 70, 'edits in place while searching');
  assert.equal(m.config().revision, revision + 1);

  m.search('zzz');
  assert.equal(hostPanel.BHasClass('NoResults'), true);
  assert.deepEqual(visible(), []);

  m.cancel();
  assert.equal(hostPanel.BHasClass('Searching'), false);
  assert.equal(m.find('HPColorsSearchField').text, '');
  assert.equal(rowIds.concat(['HPColorsPageHPText']).some(id => m.find(id).BHasClass('SearchMiss')), false, 'clearing restores every row');
  assert.equal(hostPanel.BHasClass('HPC3Open'), true, 'first ESC only closes search');
  m.cancel();
  assert.equal(hostPanel.BHasClass('HPC3Open'), false);
  assert.equal(m.resumes(), 0);
  m.cancel();
  assert.equal(m.resumes(), 1, 'closed editor lets stock resume run');
});

test('permanent search relinquishes focus on clear; a closed editor ignores stray input', () => {
  const m = booted(), hostPanel = m.find('HPColorsMenuHost');
  m.h.$.HPColorsMenuToggle();
  m.find('HPColorsSearchField').SetFocus();
  m.search('red');
  m.cancel();
  assert.equal(m.find('HPColorsSearchField').focused, false);
  assert.equal(m.find('HPColorsCloseButton').focused, true);
  assert.equal(hostPanel.BHasClass('HPC3Open'), true);
  m.cancel();
  m.search('zzz');
  assert.equal(hostPanel.BHasClass('Searching'), false, 'hidden editor ignores keys');
  assert.equal(hostPanel.BHasClass('NoResults'), false);
  assert.equal(m.find('HPColorsBarColorLowEnemyRow').BHasClass('SearchMiss'), false);
});

test('page tabs switch exactly one page, update the heading and close search; empty pages show a placeholder', () => {
  const m = booted();
  const pages = ['New', 'Bar', 'HPText', 'Name', 'Indicators', 'Icons', 'Units', 'Presets'];
  const active = () => pages.filter(page => m.find('HPColorsPage' + page).BHasClass('Active'));
  assert.deepEqual(active(), ['Bar']);
  m.h.$.HPColorsMenuToggle(); m.search('red');
  m.activate('HPColorsNavHPTextButton');
  assert.deepEqual(active(), ['HPText']);
  assert.equal(m.find('HPColorsMenuHost').BHasClass('Searching'), false);
  assert.deepEqual(pages.filter(page => m.find('HPColorsNav' + page + 'Button').BHasClass('Selected')), ['HPText']);
  assert.equal(m.find('HPColorsPageTitle').text, 'HP TEXT');
  for (const page of m.h.$.HPColorsV3Settings.menu.pages.filter(page => page.name !== 'Presets' && page.name !== 'New' &&
    !m.h.$.HPColorsV3Settings.controls.some(row => row.page === page.name)).map(page => page.id)) {
    assert.ok(m.find(page).Children().some(panel => panel.BHasClass('HPC3Placeholder') && panel.text), page + ' placeholder');
  }
  m.activate('HPColorsNavPresetsButton');
  assert.deepEqual(active(), ['Presets']);
  assert.ok(m.find('HPColorsPagePresets').FindChildTraverse('HPColorsShareSection'));
});

test('store hooks: attach once, hydrate without commit, edits commit, codes copy/import with messages', () => {
  const calls = [];
  let api = null;
  const store = {
    attach(value) { api = value; calls.push('attach'); },
    commit(config) { calls.push('commit:' + config.settings.side.enemy.barColorLow); },
    exportSettingsCode(settings) { return 'CODE:' + settings.side.enemy.barColorLow; },
    decodeSettingsCode(code) {
      if (code === 'bad') throw new Error('Not a v3 settings code');
      const settings = api.getSettings(); settings.side.enemy.barColorLow = code.slice(5); return settings;
    },
    importSettingsCode(code) {
      if (code === 'bad') throw new Error('Not a v3 settings code');
      const settings = api.getSettings();
      settings.side.enemy.barColorLow = code.slice(5);
      if (code.startsWith('NEWR')) api.setCodeStatus('Code from a newer version; unknown settings were skipped');
      else api.setCodeStatus('');
      return settings;
    },
    exportBundleCode() { return 'BUNDLE'; },
    decodeBundleCode(code) {
      if (code !== 'BUNDLE') throw new Error('Use the matching settings or bundle paste box for this code.');
      return { settings: api.getSettings(), presets: [] };
    },
    importBundleCode() { return null; },
  };
  const m = booted({ store });
  assert.deepEqual(calls, ['attach']);
  assert.equal(api.getRoot(), m.h.contextPanel);
  assert.equal(latestPublishedConfig(m.h), undefined, 'with a store, nothing is published before it hydrates');
  const hydrated = api.getSettings(); hydrated.side.enemy.barColorLow = '#010203';
  assert.equal(api.hydrateSettings(hydrated), true);
  assert.equal(m.find('HPColorsBarColorLowEnemyHex').text, '#010203');
  assert.equal(m.settings().side.enemy.barColorLow, '#010203');
  const bad = api.getSettings(); bad.shared.lowThreshold = 90;
  assert.equal(api.applySettings(bad), false, 'invalid settings are refused');
  api.setSaveStatus('Saved', 'ok');
  assert.equal(m.find('HPColorsSaveStatus').text, 'Saved');
  assert.equal(m.find('HPColorsSaveStatus').BHasClass('ToneOk'), true);
  assert.deepEqual(calls, ['attach'], 'hydrate and status do not commit');
  m.boot.onload();
  assert.deepEqual(calls, ['attach'], 'attach once per menu root');

  m.submit('HPColorsBarColorLowEnemyHex', '#0A0B0C');
  assert.deepEqual(calls.slice(1), ['commit:#0A0B0C']);
  m.activate('HPColorsSettingsCopyButton');
  assert.equal(m.find('HPColorsSettingsCodeEntry').text, 'CODE:#0A0B0C');
  assert.deepEqual(m.h.clipboardWrites, ['CODE:#0A0B0C']);
  assert.equal(m.find('HPColorsCodeStatus').text, 'Settings code copied.');
  m.find('HPColorsSettingsCodeEntry').text = 'CODE:#111111';
  m.activate('HPColorsSettingsImportButton');
  assert.equal(m.settings().side.enemy.barColorLow, '#111111');
  assert.equal(m.find('HPColorsCodeStatus').text, 'Settings code imported.');
  assert.equal(calls.at(-1), 'commit:#111111', 'a pasted code is an edit and is saved');
  m.find('HPColorsSettingsCodeEntry').text = 'NEWR:#222222';
  m.activate('HPColorsSettingsImportButton');
  assert.equal(m.find('HPColorsCodeStatus').text, 'Code from a newer version; unknown settings were skipped');
  m.find('HPColorsSettingsCodeEntry').text = 'bad';
  const before = m.config().revision;
  m.activate('HPColorsSettingsImportButton');
  assert.equal(m.find('HPColorsCodeStatus').text, 'Not a v3 settings code');
  assert.equal(m.find('HPColorsCodeStatus').BHasClass('ToneError'), true);
  assert.equal(m.config().revision, before);
  m.activate('HPColorsBundleCopyButton');
  assert.equal(m.find('HPColorsBundleCodeEntry').text, 'BUNDLE');

  const bare = booted({ store: null });
  bare.activate('HPColorsSettingsCopyButton');
  assert.equal(bare.find('HPColorsCodeStatus').text, 'Share codes are unavailable.');
  bare.submit('HPColorsBarColorLowEnemyHex', '#123456');
  assert.equal(bare.settings().side.enemy.barColorLow, '#123456', 'edits work without a store');
});

test('unreadable-save reset is hidden until offered, needs two clicks and calls the store with explicit confirmation', () => {
  const calls = [];
  let api = null;
  let answer = false;
  const m = booted({ store: { attach(value) { api = value; }, resetUnreadableSave(confirmed) { calls.push(confirmed); return answer; } } });
  api.hydrateSettings(api.getSettings());
  const hostPanel = m.find('HPColorsMenuHost');
  m.activate('HPColorsResetSaveButton');
  m.activate('HPColorsResetSaveConfirmButton');
  assert.deepEqual(calls, [], 'not offered: clicks do nothing');
  assert.equal(hostPanel.BHasClass('SaveResetAvailable'), false);
  api.setSaveResetAvailable(true);
  assert.equal(hostPanel.BHasClass('SaveResetAvailable'), true);
  m.activate('HPColorsResetSaveConfirmButton');
  assert.deepEqual(calls, [], 'confirm needs the first click');
  m.activate('HPColorsResetSaveButton');
  assert.equal(hostPanel.BHasClass('SaveResetConfirming'), true);
  m.activate('HPColorsResetSaveButton');
  assert.equal(hostPanel.BHasClass('SaveResetConfirming'), false, 'second click on reset cancels');
  m.activate('HPColorsResetSaveButton');
  const revision = m.config().revision;
  m.activate('HPColorsResetSaveConfirmButton');
  assert.deepEqual(calls, [true]);
  assert.equal(hostPanel.BHasClass('SaveResetAvailable'), true, 'a refused reset stays offered');
  answer = true;
  m.activate('HPColorsResetSaveButton'); m.activate('HPColorsResetSaveConfirmButton');
  assert.deepEqual(calls, [true, true]);
  assert.equal(hostPanel.BHasClass('SaveResetAvailable'), false);
  assert.equal(m.config().revision, revision, 'reset does not change settings');
});

test('typed hex and number values publish when focus moves away (onblur), not only on Enter', () => {
  const m = booted();
  const hex = m.find('HPColorsBarColorLowEnemyHex');
  hex.SetFocus(); hex.text = '#13579b';
  assert.equal(m.settings().side.enemy.barColorLow, '#FD4949', 'typing alone does not publish');
  m.find('HPColorsLowThresholdEntry').SetFocus();
  assert.equal(m.settings().side.enemy.barColorLow, '#13579B', 'blur commits the hex');
  m.find('HPColorsLowThresholdEntry').text = '33';
  m.find('HPColorsSearchField').SetFocus();
  assert.equal(m.settings().shared.lowThreshold, 33, 'blur commits the number');
  const fired = m.fires();
  m.find('HPColorsLowThresholdEntry').SetFocus(); m.find('HPColorsSearchField').SetFocus();
  assert.equal(m.fires(), fired, 'blur without a change publishes nothing');
});

test('reincluding the menu script retires the old publisher: no stale epoch answer, one listener, settings carried over', () => {
  const m = booted({ skipScripts: ['hp_colors_v3_storage'] }); // This lifecycle assertion counts only publisher jobs.
  const configs = () => m.h.dispatches.filter(event => event[0] === 'ClientUI_FireOutput').map(event => JSON.parse(event[1]));
  const listeners = () => m.h.handlerEntries.filter(entry => entry.channel === 'ClientUI_FireOutput');
  const request = JSON.stringify({ magic: 'HPV3_CONFIG_REQUEST', epoch: '', revision: -1, seq: 1 });
  m.submit('HPColorsBarColorLowEnemyHex', '#ABCDEF');
  for (const entry of listeners()) entry.fn(request);
  assert.equal(work(m.h).length, 1, 'answer queued inside the 0.5 s coalescing window');
  const oldEpoch = m.config().epoch;
  m.boot.includeScripts(); m.boot.onload();
  assert.equal(listeners().length, 1, 'old answer listener unregistered');
  assert.notEqual(m.config().epoch, oldEpoch);
  assert.equal(m.settings().side.enemy.barColorLow, '#ABCDEF', 'new publisher keeps the edited settings');
  const after = configs().length;
  m.submit('HPColorsBarColorLowEnemyHex', '#778899');
  for (const entry of listeners()) entry.fn(request);
  m.h.scheduler.runFor(600);
  const late = configs().slice(after);
  assert.ok(late.length >= 1);
  assert.deepEqual([...new Set(late.map(config => config.epoch))], [m.config().epoch], 'only the live epoch broadcasts');
  assert.equal(late.at(-1).settings.side.enemy.barColorLow, '#778899', 'newest edit wins');
  assert.equal(work(m.h).length, 0);
});

test('px rows show their unit and step, long enums use a DropDown, and both edit through the real menu', t => {
  const dir = temporary(t);
  fs.cpSync(path.join(sourceRoot, 'panorama'), path.join(dir, 'panorama'), { recursive: true });
  // Retired slot numbers (ticket 36) never return, so a fixture slot starts above them too.
  const nextSlot = 1 + Math.max(...schema.flatMap(row => typeof row.slot === 'object' ? Object.values(row.slot) : [row.slot]),
    ...JSON.parse(fs.readFileSync(path.join(root, 'settings/record.json'), 'utf8')).retiredSlots);
  const rows = [...schema,
    { key: 'fixtureOffsetY', slot: { enemy: nextSlot, ally: nextSlot + 1 }, name: 'Bar Y offset', type: 'number', bounds: [-50, 50], step: 0.5, default: { enemy: -3.5, ally: 0 },
      side: 'side-aware', page: 'Bar', level: 'advanced', unit: 'px', help: 'Move the bar up or down.', keywords: ['offset'] },
    { key: 'textFont', slot: nextSlot + 2, name: 'HP text font', type: 'enum', bounds: null, step: null, default: 'b', side: 'shared',
      page: 'HP Text', level: 'basic', unit: '', help: 'Font family.', keywords: ['font'],
      options: ['a', 'b', 'c', 'd', 'e'].map(value => ({ value, label: 'Font ' + value.toUpperCase() })) },
    // Keep a separately named enemy-only fixture row alongside the shipped marker.
    { key: 'fixtureEnemyMarker', slot: nextSlot + 3, name: 'Enemy kill marker', type: 'boolean', bounds: null, step: null, default: false,
      side: 'enemy', page: 'Indicators', level: 'basic', unit: '', help: 'Enemy-only fixture row.', keywords: ['marker'] }];
  const file = path.join(dir, 'schema.json');
  fs.writeFileSync(file, JSON.stringify(rows));
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'settings/record.json'), 'utf8'));
  const version = metadata.recordVersion + 1;
  const record = path.join(dir, 'record.json');
  fs.writeFileSync(record, JSON.stringify({ ...metadata, recordVersion: version, slotAdditions: [...metadata.slotAdditions,
    { version, slots: [nextSlot, nextSlot + 1, nextSlot + 2, nextSlot + 3] }] }));
  const result = spawnSync(process.execPath, [path.join(root, 'tools/generate.js'), '--settings', file, '--record-contract', record, '--output-root', dir], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const m = booted({ sourceRoot: dir });
  assert.equal(m.find('HPColorsMenuHost').GetAttributeString('hpv3_boot', ''), 'ready');
  const units = m.find('HPColorsFixtureOffsetYEnemyRow').FindChildrenWithClassTraverse('HPC3Unit').map(panel => panel.text);
  assert.deepEqual(units, ['PX']);
  const notch = m.find('HPColorsFixtureOffsetYEnemySlider').FindChildrenWithClassTraverse('HPC3DefaultNotch')[0];
  assert.equal(notch.GetAttributeString('style', ''), 'margin-left: 46.5000%;');
  assert.equal(m.find('HPColorsFixtureOffsetYAllyEntry').text, '0');
  m.submit('HPColorsFixtureOffsetYAllyEntry', '7.3');
  assert.equal(m.settings().side.ally.fixtureOffsetY, 7.5);
  assert.equal(m.settings().side.enemy.fixtureOffsetY, -3.5, 'sides are independent');
  m.submit('HPColorsFixtureOffsetYAllyEntry', '0.1');
  assert.equal(m.settings().side.ally.fixtureOffsetY, 0);
  const select = m.find('HPColorsTextFontSelect');
  assert.equal(select.type, 'DropDown');
  const wrapper = select.GetParent();
  assert.equal(wrapper.BHasClass('DropDownNew'), true);
  const decorations = wrapper.Children().filter(panel => panel !== select);
  ['Border', 'Background', 'Arrow'].forEach((name, index) => assert.equal(decorations[index].BHasClass(name), true));
  for (const child of wrapper.Children().filter(panel => panel !== select)) assert.equal(child.GetAttributeString('hittest', ''), 'false');
  assert.equal(select.GetSelected().id, 'HPColorsTextFontOptionB');
  assert.throws(() => select.SetSelected(m.find('HPColorsTextFontOptionE')), /option id string/, 'mock enforces the string signature');
  select.SetSelected('HPColorsTextFontOptionE');
  m.fire('HPColorsTextFontSelect', 'oninputsubmit');
  assert.equal(m.settings().shared.textFont, 'e');
  const enemyColumn = m.find('HPColorsPageIndicatorsGeneralBasicEnemyColumn');
  const allyColumn = m.find('HPColorsPageIndicatorsLinesAndPipsBasicAllyColumn');
  assert.ok(m.find('HPColorsFixtureEnemyMarkerEnemyRow').GetParent() === enemyColumn, 'enemy-only row sits in its group enemy column');
  assert.equal(m.h.contextPanel.FindChildTraverse('HPColorsFixtureEnemyMarkerAllyRow'), null);
  assert.equal(m.h.contextPanel.FindChildTraverse('HPColorsFixtureEnemyMarkerRow'), null, 'not shared either');
  assert.deepEqual(allyColumn.Children().filter(panel => /^HPColors(LineColor|LineColorEnabled|LinesVisible)AllyRow$/.test(panel.id)).map(panel=>panel.id),
    ['HPColorsLinesVisibleAllyRow','HPColorsLineColorEnabledAllyRow','HPColorsLineColorAllyRow'], 'shipped ally line settings remain in their column');
  assert.ok(!allyColumn.Children().some(panel => panel.BHasClass('HPC3ColumnEmpty')), 'shipped indicators make this column nonempty');
  m.activate('HPColorsFixtureEnemyMarkerEnemyToggle');
  assert.equal(m.settings().side.enemy.fixtureEnemyMarker, true);
  assert.equal(Object.hasOwn(m.settings().side.ally, 'fixtureEnemyMarker'), false);
  m.h.$.HPColorsMenuToggle(); m.search('font');
  assert.equal(m.find('HPColorsPageHPText').BHasClass('SearchMiss'), false);
  assert.equal(m.find('HPColorsPageBar').BHasClass('SearchMiss'), true);
});

test('late panels: boot retries in seconds, binds what exists, stops when context dies and binds handlers once', () => {
  const boot = loadLayout('hud_escape_menu.xml', { latePanels: true });
  boot.includeScripts(); boot.onload(); boot.onload();
  const retries = () => work(boot.harness).filter(job => job.fn.name === 'menuRetry');
  assert.equal(latestPublishedConfig(boot.harness), undefined, 'publication waits for the store, which attaches once panels exist');
  assert.equal(retries().length, 1, 'one retry, not one per onload');
  assert.equal(retries()[0].delay, 0.1);
  boot.mount();
  boot.harness.scheduler.runNext();
  assert.equal(boot.harness.contextPanel.FindChildTraverse('HPColorsMenuHost').GetAttributeString('hpv3_boot', ''), 'ready');
  assert.equal(latestPublishedConfig(boot.harness).magic, 'HP_COLORS_V3_CONFIG', 'published once the store resolved');
  boot.harness.contextPanel.valid = false;
  boot.onload();
  assert.equal(work(boot.harness).length, 0);

  const partial = loadLayout('hud_escape_menu.xml');
  const row = partial.harness.contextPanel.FindChildTraverse('HPColorsBarColorEnabledEnemyToggle');
  row.valid = false;
  partial.includeScripts(); partial.onload(); partial.onload();
  const toggle = partial.harness.contextPanel.FindChildTraverse('HPColorsBarColorEnabledAllyToggle');
  const before = partial.harness.eventSetCounter.count;
  const registeredBefore = partial.harness.handlerEntries.length;
  const delays = [];
  let fallback = false;
  for (let i = 0; i < 20 && work(partial.harness).length; i++) {
    const job = partial.harness.scheduler.runNext();
    if (job.fn.name === 'menuRetry') delays.push(job.delay);
    else if (job.delay === 30) fallback = true;
  }
  assert.deepEqual(delays.slice(0, 3), [0.1, 0.2, 0.4]);
  assert.ok(delays.length <= 6);
  assert.equal(fallback, true, 'a menu that never finishes booting still publishes after the 30 s fallback');
  assert.equal(latestPublishedConfig(partial.harness).magic, 'HP_COLORS_V3_CONFIG');
  assert.equal(partial.harness.eventSetCounter.count, before, 'retries do not rebind existing controls');
  assert.equal(partial.harness.handlerEntries.length, registeredBefore, 'retries do not register native handlers again');
  for (const id of ['HPColorsLowThresholdSlider', 'HPColorsBarColorLowEnemyHueSlider']) {
    const slider = partial.harness.contextPanel.FindChildTraverse(id);
    assert.equal(partial.harness.handlerEntries.filter(entry => entry.panel === slider && entry.eventName === 'SliderReleased').length, 1, id);
  }
  toggle.events.onactivate();
  assert.equal(latestPublishedConfig(partial.harness).settings.side.ally.barColorEnabled, true, 'present controls work while one is missing');
  if (process.env.HPV3_DEBUG === '1') assert.ok(partial.harness.logs.some(message => message.includes('[HPV3]') && message.includes(row.id)));
  else assert.deepEqual(partial.harness.logs, []);
  row.valid = true; partial.onload();
  assert.equal(partial.harness.contextPanel.FindChildTraverse('HPColorsMenuHost').GetAttributeString('hpv3_boot', ''), 'ready');
  assert.equal(row.BHasClass('Checked'), true);
});

// Ticket 37: the TIMERS card is gone; each timer switch heads the card it styles.
test('Icons cards keep each group contiguous and ultimate badge size with ultimate progress',()=>{
  const m=booted();m.activate('HPColorsNavIconsButton');
  const cards=m.find('HPColorsPageIcons').children.filter(p=>p.BHasClass('HPC3Card'));
  assert.equal(m.h.contextPanel.FindChildTraverse('HPColorsCardIndicatorsTimers'),null);
  assert.equal(new Set(cards.map(p=>p.id)).size,cards.length);
  const card=row=>{let p=m.find(row);while(p&&!p.BHasClass('HPC3Card'))p=p.GetParent();return p;};
  assert.ok(card('HPColorsUltSizeRow')===m.find('HPColorsCardIconsUltimate')&&card('HPColorsUltimateTimerEnabledRow')===m.find('HPColorsCardIconsUltimate'));
  assert.ok(card('HPColorsPickupTimersEnabledRow')===m.find('HPColorsCardIconsPickups'));
  m.h.$.HPColorsMenuToggle();m.search('readout');
  assert.equal(m.find('HPColorsPulseReadoutEnemyRow').BHasClass('SearchMiss'),false,'HP-number keyword survives plain-language copy');
  m.search('casting');assert.equal(m.find('HPColorsPickupSpiritColorRow').BHasClass('SearchMiss'),false);
  m.search('powerup');
  for(const row of m.h.$.HPColorsV3Settings.controls.filter(row=>row.key.startsWith('pickup')))
    assert.equal(m.find(row.rowId).BHasClass('SearchMiss'),false,row.key+' remains searchable as powerup');
});

test('menu overlay and every dialog absorb clicks with a full-size Button backdrop so nothing behind is clickable', () => {
  const { loadLayout: load } = require('./boot-layout');
  const { computed: style } = require('./style-cascade');
  const boot = load('hud_escape_menu.xml'); boot.includeScripts(); boot.onload();
  const root = boot.harness.contextPanel;
  const host = root.FindChildTraverse('HPColorsMenuHost');
  const layers = [host].concat(host.Children().filter(panel => panel.BHasClass('HPC3Dialog')));
  for (const layer of layers) {
    const backdrop = layer.Children()[0];
    assert.equal(backdrop.paneltype, 'Button', layer.id + ': Panorama passes clicks through plain Panels');
    assert.notEqual(backdrop.GetAttributeString ? backdrop.GetAttributeString('hittest', 'true') : 'true', 'false');
    assert.equal(style(backdrop, 'width'), '100%', layer.id); assert.equal(style(backdrop, 'height'), '100%', layer.id);
  }
  assert.equal(style(host, 'zIndex'), '20', 'menu sits above the stock escape menu');
});

// Ticket 37: the master switch still opens the Bar page; thresholds and team colors sit right after Colors.
test('Bar opens with the master switch and style; thresholds and team colors share the card after Colors', () => {
  const m = booted();
  const cards = m.find('HPColorsPageBar').children.filter(panel => panel.BHasClass('HPC3Card'));
  assert.deepEqual([cards.indexOf(m.find('HPColorsCardBarGeneral')), cards.indexOf(m.find('HPColorsCardBarColors')), cards.indexOf(m.find('HPColorsCardBarSharedColors'))], [0, 1, 2]);
  assert.deepEqual(m.find('HPColorsPageBarGeneralBasicSharedColumn').children.filter(p => p.BHasClass('HPC3Row')).map(p => p.id), ['HPColorsEnabledRow', 'HPColorsBarStyleRow']);
  assert.deepEqual(m.find('HPColorsPageBarSharedColorsBasicSharedColumn').children.filter(p => p.BHasClass('HPC3Row')).map(p => p.id),
    ['HPColorsLowThresholdRow', 'HPColorsHighThresholdRow', 'HPColorsTeamAmberColorRow', 'HPColorsTeamSapphireColorRow']);
});

test('audit whole 3: every setting row speaks plain player words (no internal terms in names, help or options)', () => {
  const boot = loadLayout('hud_escape_menu.xml'); boot.includeScripts(); boot.onload();
  const contract = boot.harness.$.HPColorsV3Settings, jargon = /\b(native|stock|CSS|canvas|adopt(ed)?|engine'?s?|v2's|lineage|gate|bands?|primary|binding|alpha)\b/i, bad = [];
  for (const row of contract.controls) {
    const panel = boot.harness.contextPanel.FindChildTraverse(row.rowId);
    // Ticket 28 explicitly retains v2's "stock label/flashing" help wording.
    const labelHelp = ['criticalIndicatorVisible','assassinateIndicatorVisible','unkillableIndicatorVisible'].includes(row.key);
    for (const text of [panel.children.find(child => child.BHasClass('HPC3RowTitle')).text, row.help])
      if (jargon.test(labelHelp ? text.replace(/\bstock\b/gi,'game') : text)) bad.push(row.key + ': ' + text);
    for (const option of row.options || []) if (jargon.test(option.label)) bad.push(row.key + ' option: ' + option.label);
  }
  const tool = boot.harness.contextPanel.FindChildTraverse('HPColorsShowBoundsToggle').GetParent().GetParent();
  for (const label of tool.children.filter(panel => panel.paneltype === 'Label')) if (jargon.test(label.text)) bad.push('SHOW BOUNDS: ' + label.text);
  assert.deepEqual(bad, []);
});

test('ticket 29: search starts at the results header and clearing it resets the page offset', () => {
  const m = booted(); m.h.$.HPColorsMenuToggle();
  const list = m.find('HPColorsSettingsList');
  let topCalls = 0, rowFits = 0;
  list.ScrollToTop = () => { topCalls++; list.scrollOffsetY = 0; };
  m.find('HPColorsBarOutlineEnabledEnemyRow').ScrollParentToMakePanelFit = () => {
    rowFits++; list.scrollOffsetY = 240; // Fitting the first row scrolls its page/card headings away.
  };
  list.scrollOffsetY = 480;
  m.search('outline');
  assert.equal(list.scrollOffsetY, 0, 'show page and card headings above the first matching row');
  assert.equal(rowFits, 0, 'no geometry-dependent first-row fit during the filter relayout');
  list.scrollOffsetY = 320;
  m.search('');
  assert.equal(list.scrollOffsetY, 0, 'do not reuse a filtered-list offset on the normal page');
  assert.equal(topCalls, 2);
  assert.equal(m.find('HPColorsPageBar').BHasClass('Active'), true);
});

test('ticket 29: VM Sliders swallow mouse panel events and emit value/release engine events with their panel and value', () => {
  const b = loadLayout('hud_escape_menu.xml'), h = b.harness;
  const slider = h.contextPanel.FindChildTraverse('HPColorsLowThresholdSlider');
  let mouse = 0, values = 0, releases = 0;
  const nativeValues = [];
  for (const event of ['onmousedown', 'onmouseup']) slider.SetPanelEvent(event, () => mouse++);
  slider.SetPanelEvent('onvaluechanged', () => values++);
  h.$.RegisterEventHandler('SliderValueChanged', slider, (target, value) => {
    assert.ok(target === slider); nativeValues.push(value);
  });
  h.$.RegisterEventHandler('SliderReleased', slider, (target, value) => {
    assert.ok(target === slider); assert.equal(value, '64'); releases++;
  });
  slider.events.onmousedown();
  slider.value = 25; slider.value = 40; slider.value = 64;
  slider.events.onmouseup();
  assert.equal(mouse, 0); assert.equal(values, 3);
  assert.deepEqual(nativeValues, ['25', '40', '64']); assert.equal(releases, 0);
  h.releaseSlider(slider); assert.equal(releases, 1);
});
