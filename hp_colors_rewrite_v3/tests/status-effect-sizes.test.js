'use strict';
// Ticket 52: status effect icon sizes. The game tags each status-effect icon above a health bar with the
// modifier's m_strSmallIconCssClass (abilities.vdata). A panel only takes rules from the sheets its own layout
// includes, so the mod ships the game's status-effect layout (citadel_status_effect.xml) with one more include,
// hp_colors_v3_status.css. On hero bars the renderer only sets root classes: one per changed slider
// (HPColorsV3Fx<letter><pct>) and HPColorsV3FxOn when any is set. That sheet scales the game's icon by its class
// through ui-scale and lets the 32 px row fit its tallest icon. No script reads, finds or writes a native icon.
// Ways this can fail: a slider scales the wrong icon or every icon; the default adds a class or grows the row;
// a rule sits in a sheet the status row never includes (it then does nothing in game); the script goes back to
// looking for icons; a class outlives its step, the setting or the master toggle; the menu sample shows the
// wrong effect, stays after leaving the page, or is drawn at a size the world would not use.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { MockPanel, loadLayout, runInVm, latestPublishedConfig, sourceRoot } = require('./boot-layout');
const { setup } = require('./timers-fixture');
const { computed } = require('./style-cascade');

// Setting key, the class letter the renderer writes, and the game's own class for that icon.
const EFFECTS = [
  ['statusScaleFixation', 'A', 'fixated', 'ability_stacking_damage'],
  ['statusScaleMalice', 'B', 'blood_shard', 'ability_blood_shards'],
  ['statusScaleScrewjab', 'C', 'modifier_viper_debuffdagger', 'ability_viper_debuffdagger'],
  ['statusScaleDjinnsMark', 'D', 'sand_phantom_passive_victim', 'mirage_sand_phantom'],
  ['statusScaleSerratedKnives', 'E', 'shiv_dagger', 'citadel_ability_shiv_dagger'],
  ['statusScaleBarrage', 'F', 'pocket_damage_amp', 'synth_barrage'],
  ['statusScalePulseGrenade', 'G', 'chrono_pulse_grenade', 'citadel_ability_chrono_pulse_grenade'],
  ['statusScaleArcticBeam', 'H', 'freezing_buildup', 'ability_icebeam']
];
const ICON_CLASSES = EFFECTS.map(([, , cssClass]) => cssClass);
// Every owned Fx class on a panel, HPColorsV3FxOn included.
const fxClasses = panel => Array.from(panel.classes).filter(name => name.startsWith('HPColorsV3Fx'));
// An inline style; nothing native is written, so it stays empty.
const inline = (panel, key) => String(panel.style[key] || '');
const STOCK_SHEETS = ['citadel_base_styles', 'unit_status_icons', 'citadel_status_effect'].map(name => 'panorama/styles/' + name + '.css');
const OWN_SHEET = 'panorama/styles/hp_colors_v3_status.css';

// The sheets the shipped status-effect layout includes, in include order.
function layoutSheets() {
  const xml = fs.readFileSync(path.join(sourceRoot, 'panorama/layout/citadel_status_effect.xml'), 'utf8');
  return [...xml.matchAll(/<include\s+src="s2r:\/\/panorama\/styles\/([\w-]+)\.vcss_c"\s*\/>/g)].map(match => 'panorama/styles/' + match[1] + '.css');
}

// The world bar with its status row scoped to the sheets of the row's own layout (the generated one by default).
function world(sheets = layoutSheets()) {
  const f = setup({ noTopBoot: true });
  f.top.includeScripts();
  const row = f.r.FindChild('StatusEffects');
  row.HPColorsV3Sheets = sheets;
  const container = row.FindChildTraverse('StatusEffectContainer');
  const icon = name => { const p = new MockPanel('Panel', container, ''); p.AddClass('statusEffect'); p.AddClass(name); return p; };
  return Object.assign(f, { icon, row, container, pickup: container.FindChild('native') });
}

test('every slider names an icon class the pinned game data really uses on a health-bar modifier', () => {
  // The pinned game data is not staged with a build; it is always read from the lane itself.
  const vdata = fs.readFileSync(path.resolve(__dirname, '../vendor/abilities.vdata'), 'utf8');
  for (const [key, , cssClass, ability] of EFFECTS) {
    const start = vdata.indexOf('\n\t' + ability + ' = ');
    assert.ok(start >= 0, ability);
    const block = vdata.slice(start, vdata.indexOf('\n\t}', start));
    const at = block.indexOf('m_strSmallIconCssClass = "' + cssClass + '"');
    assert.ok(at >= 0, key + ': ' + ability + ' uses ' + cssClass);
    assert.match(block.slice(Math.max(0, at - 600), at + 600), /m_eModifierDisplayLocaiton = "MODIFIER_DISPLAY_HEALTHBAR"/, key + ' is shown on the health bar');
  }
});

test('a slider scales only its own icon on hero bars through the status sheet, and the default leaves the game alone', () => {
  const f = world();
  const fixation = f.icon('fixated'), malice = f.icon('blood_shard'), slow = f.icon('slowed');
  f.advance(3000);
  assert.deepEqual(fxClasses(f.r), [], 'defaults add no class');
  for (const panel of [fixation, malice, slow, f.pickup]) assert.equal(computed(panel, 'uiScale'), undefined, 'defaults keep the game size');
  assert.notEqual(computed(f.row, 'height'), 'fit-children', 'defaults leave the 32 px row alone');
  assert.notEqual(computed(f.container, 'height'), 'fit-children');
  f.edit('statusScaleFixation', 150); f.advance(500);
  assert.equal(f.r.BHasClass('HPColorsV3FxA150'), true);
  assert.equal(f.r.BHasClass('HPColorsV3FxOn'), true);
  assert.equal(computed(fixation, 'uiScale'), '150%');
  assert.equal(computed(malice, 'uiScale'), undefined, 'another effect keeps its size');
  assert.equal(computed(slow, 'uiScale'), undefined, 'an ordinary debuff keeps its size');
  assert.equal(computed(f.pickup, 'uiScale'), undefined, 'a pickup keeps its size');
  for (const [panel, label] of [[f.row, 'row'], [f.container, 'container']]) {
    assert.equal(computed(panel, 'height'), 'fit-children', label + ' fits its tallest icon');
    assert.equal(computed(panel, 'minHeight'), '32px', label + ' keeps the game height as its floor');
  }
  for (const [panel, key] of [[fixation, 'uiScale'], [fixation, 'height'], [f.row, 'uiScale'], [f.row, 'height'], [f.container, 'height']])
    assert.equal(inline(panel, key), '', 'nothing native is written: ' + key);
});

test('a step change and every exit drop the old classes', () => {
  const f = world();
  const fixation = f.icon('fixated');
  f.advance(3000);
  f.edit('statusScaleFixation', 150); f.advance(500);
  assert.deepEqual(fxClasses(f.r).sort(), ['HPColorsV3FxA150', 'HPColorsV3FxOn']);
  f.edit('statusScaleFixation', 200); f.advance(500);
  assert.equal(f.r.BHasClass('HPColorsV3FxA150'), false, 'the old step is dropped');
  assert.deepEqual(fxClasses(f.r).sort(), ['HPColorsV3FxA200', 'HPColorsV3FxOn']);
  assert.equal(computed(fixation, 'uiScale'), '200%');
  f.edit('statusScaleFixation', 100); f.advance(500);
  assert.deepEqual(fxClasses(f.r), [], '100% is the game size: no class, HPColorsV3FxOn included');
  assert.equal(computed(fixation, 'uiScale'), undefined);
  assert.notEqual(computed(f.row, 'height'), 'fit-children');
  f.edit('statusScaleFixation', 150); f.advance(500);
  assert.equal(f.r.BHasClass('HPColorsV3FxOn'), true);
  f.edit('enabled', false); f.advance(500);
  assert.deepEqual(fxClasses(f.r), [], 'master off drops every class, HPColorsV3FxOn included');
  assert.equal(computed(fixation, 'uiScale'), undefined);
  assert.notEqual(computed(f.row, 'height'), 'fit-children');
});

test('every effect and every step scales its own icon in the world and has its own preview rule', () => {
  const f = world();
  const icons = EFFECTS.map(([, , cssClass]) => f.icon(cssClass));
  for (const value of [110, 180, 250]) {
    EFFECTS.forEach(([key]) => f.edit(key, value)); f.advance(500);
    assert.equal(f.r.BHasClass('HPColorsV3FxOn'), true, 'on at ' + value);
    EFFECTS.forEach(([key, letter], i) => {
      assert.equal(f.r.BHasClass('HPColorsV3Fx' + letter + value), true, key + ' ' + value);
      assert.equal(computed(icons[i], 'uiScale'), value + '%', key + ' ' + value);
    });
  }
  // The world rules live in the status layout's own sheet; the menu preview's mirror lives in the world sheet.
  for (const [file, prefix] of [['hp_colors_v3_status.css', '.WindowRoot'], ['hp_colors_v3_world.css', '#HPColorsPreviewCanvas']]) {
    const css = '\n' + fs.readFileSync(path.join(sourceRoot, 'panorama/styles', file), 'utf8').replace(/\r\n/g, '\n');
    let rules = 0;
    for (const [key, letter, cssClass] of EFFECTS) for (let value = 110; value <= 250; value += 10) {
      assert.ok(css.includes('\n' + prefix + '.HPColorsV3Fx' + letter + value + ' .' + cssClass + '\n{\n\tui-scale: ' + value + '%;\n}'), file + ' ' + key + ' ' + value);
      rules++;
    }
    assert.equal(rules, 120, file);
  }
});

test('the rules work only from the sheet the status layout includes', () => {
  // Live 6861 (ShowRank 86ffb023): rules the status row's layout does not include do nothing in game.
  const f = world(STOCK_SHEETS);
  const fixation = f.icon('fixated');
  f.advance(3000);
  f.edit('statusScaleFixation', 150); f.advance(500);
  assert.equal(f.r.BHasClass('HPColorsV3FxA150'), true, 'the root class is set either way');
  assert.equal(computed(fixation, 'uiScale'), undefined, 'the stock sheets alone do not scale the icon');
  assert.notEqual(computed(f.row, 'height'), 'fit-children');
  assert.deepEqual(layoutSheets(), [...STOCK_SHEETS, OWN_SHEET], 'the shipped layout is the stock includes plus ours, last');
  const worldCss = fs.readFileSync(path.join(sourceRoot, 'panorama/styles/hp_colors_v3_world.css'), 'utf8');
  assert.equal(worldCss.includes('.WindowRoot.HPColorsV3Fx'), false, 'no world rule pretends to reach the status row');
});

test('an enlarged icon costs the script no lookup', () => {
  const f = world();
  const fixation = f.icon('fixated');
  f.advance(3000);
  f.edit('statusScaleFixation', 150); f.advance(500);
  const counts = {};
  for (const panel of [f.r, f.row, f.container, fixation]) panel.findCounts = counts;
  f.advance(5000);
  assert.equal(computed(fixation, 'uiScale'), '150%');
  assert.deepEqual(ICON_CLASSES.filter(name => counts[name]), [], 'no effect class is looked for');
});

test('the menu preview adds the edited effect at the right of the status row, at the size the world uses', () => {
  const boot = loadLayout('hud_escape_menu.xml'); boot.includeScripts(); boot.onload(); const h = boot.harness;
  const find = id => { const p = h.contextPanel.FindChildTraverse(id); assert.ok(p, id); return p; };
  runInVm(find('HPColorsMenuButton').GetAttributeString('onactivate', ''), boot.context);
  const canvas = find('HPColorsPreviewCanvas'), sample = find('HPColorsPreviewFx'), row = find('HPColorsPreviewPickups');
  const control = key => h.$.HPColorsV3Settings.controls.find(x => x.key === key);
  const set = (key, value) => { find(control(key).entryId).text = String(value); find(control(key).entryId).events.ontextentrysubmit(); };
  assert.equal(row.GetChild(row.GetChildCount() - 1), sample, 'the sample is the last icon in the row');
  assert.equal(computed(sample, 'visibility'), 'collapse', 'hidden until a slider moves');
  set('statusScaleFixation', 150);
  assert.equal(latestPublishedConfig(h).settings.shared.statusScaleFixation, 150);
  assert.equal(computed(sample, 'visibility'), 'visible');
  assert.equal(sample.BHasClass('fixated'), true);
  assert.equal(canvas.BHasClass('HPColorsV3FxA150'), true);
  assert.equal(computed(sample, 'uiScale'), '150%');
  assert.match(computed(find('HPColorsPreviewFxGlyph'), 'backgroundImage'), /haze_fixation/);
  assert.equal(computed(find('HPColorsPreviewEffect'), 'uiScale'), undefined, 'the ordinary sample debuff stays at the game size to compare');
  set('statusScaleMalice', 200);
  assert.equal(sample.BHasClass('fixated'), false, 'one sample: the effect edited last');
  assert.equal(sample.BHasClass('blood_shard'), true);
  assert.equal(computed(sample, 'uiScale'), '200%');
  assert.match(computed(find('HPColorsPreviewFxGlyph'), 'backgroundImage'), /ghost_malice/);
  set('statusScaleMalice', 100);
  assert.equal(computed(sample, 'visibility'), 'visible', 'back at 100% the sample still shows the game size');
  assert.equal(computed(sample, 'uiScale'), undefined);
  for (const [key, , cssClass] of EFFECTS) {
    set(key, 120);
    assert.equal(sample.BHasClass(cssClass), true, key);
    assert.equal(computed(sample, 'uiScale'), '120%', key);
    assert.match(computed(find('HPColorsPreviewFxGlyph'), 'backgroundImage'), /^url\("s2r:\/\/panorama\/images\/hud\//, key + ' has a picture');
  }
  h.$.HPColorsV3Preview.setPage('Bar');
  assert.equal(computed(sample, 'visibility'), 'collapse', 'leaving the page removes the sample');
});
