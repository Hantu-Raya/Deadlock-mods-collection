'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MockPanel, createPanoramaHarness, createVmContext, runInVm } =
  require('../../../scripts/hp-colors-panorama-test-adapter');

const repo = path.resolve(__dirname, '../../..');
const layoutPath = path.join(__dirname, 'panorama/layout/hp_colors_v3_preview.xml');
const previewPath = path.join(__dirname, 'panorama/scripts/hp_colors_v3_preview.js');
const rendererPath = path.join(__dirname, '../renderer/renderer.js');
const layoutXml = fs.readFileSync(layoutPath, 'utf8');
const previewSource = fs.readFileSync(previewPath, 'utf8');
const rendererSource = fs.readFileSync(rendererPath, 'utf8');

// Stock unit-status lineage -> fake preview ids (same table as PART_IDS in the preview script).
const LINEAGE = {
  UnitStatus: 'HPColorsPreviewUnitStatus', InfoHealthContainer: 'HPColorsPreviewInfo',
  UnitHealthbarsContainer: 'HPColorsPreviewBars', UnitHealthbar: 'HPColorsPreviewBar',
  UnitHealthbarInner: 'HPColorsPreviewBarInner', unit_healthbar_lagging: 'HPColorsPreviewBarFill',
  UnitHealthbarValue: 'HPColorsPreviewHpText',
};
const OWNED = {
  primary: ['width', 'height', 'position'], inner: ['width', 'height'], fill: ['washColor'],
  hp: ['visibility', 'opacity', 'position', 'marginLeft', 'marginRight', 'marginTop', 'transform',
    'horizontalAlign', 'verticalAlign'],
};

// Minimal reader for Panorama layout XML: panels, ids, classes and label text.
function parseLayout(xml) {
  const body = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[^>]*\?>/, '');
  const top = { type: '#root', attrs: {}, children: [] };
  const stack = [top];
  for (const token of body.match(/<\/?[A-Za-z][^>]*>/g)) {
    const closing = /^<\/([A-Za-z]+)/.exec(token);
    if (closing) { if (stack.length > 1 && stack[stack.length - 1].type === closing[1]) stack.pop(); continue; }
    const [, type, rawAttrs, selfClose] = /^<([A-Za-z]+)([\s\S]*?)(\/?)>$/.exec(token);
    const attrs = {};
    for (const [, key, value] of rawAttrs.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[key] = value;
    const node = { type, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return top;
}
function walk(node, visit, parent = null) {
  visit(node, parent);
  for (const child of node.children) walk(child, visit, node);
}
function idsOf(xml) {
  const ids = [];
  walk(parseLayout(xml), node => { if (node.attrs.id) ids.push(node.attrs.id); });
  return ids;
}
function mount(node, parent) {
  if (['#root', 'root', 'styles', 'scripts', 'include'].includes(node.type)) {
    for (const child of node.children) mount(child, parent);
    return;
  }
  const panel = parent.add(new MockPanel(node.attrs.id || '', {
    type: node.type, classes: (node.attrs.class || '').split(/\s+/).filter(Boolean), text: node.attrs.text || '',
  }));
  for (const child of node.children) mount(child, panel);
}
function allPanels(panel, out = []) {
  out.push(panel);
  for (const child of panel.children) allPanels(child, out);
  return out;
}
function within(panel, ancestor) {
  for (let node = panel; node; node = node.parent) if (node === ancestor) return true;
  return false;
}

// Menu host with bait: a world enemy-player bar and a stock-style settings preview using stock ids,
// and a WindowRoot/carrier above the menu so the renderer's self-boot finds a "player enemy" carrier.
function fixture(options = {}) {
  const harness = createPanoramaHarness();
  const add = (parent, id, opts = {}) => parent.add(new MockPanel(id, opts));
  harness.root.AddClass('player'); harness.root.AddClass('enemy');
  const hud = add(harness.root, 'Hud', { classes: ['WindowRoot'] });
  const world = add(harness.root, 'WorldUIRoot', { classes: ['player', 'enemy'] });
  const worldWindow = add(world, 'client_ui_panel', { classes: ['WindowRoot'] });
  const worldStatus = add(worldWindow, 'UnitStatus');
  const worldInfo = add(worldStatus, 'InfoHealthContainer');
  const worldStack = add(worldInfo, 'UnitHealthbarsContainer');
  const worldBar = add(worldStack, 'UnitHealthbar', { classes: ['UnitHealthbarContainer'], style: { width: '79px' } });
  const worldInner = add(worldBar, 'UnitHealthbarInner');
  add(worldInner, 'unit_healthbar_lagging', { style: { washColor: '#fd4949' } });
  add(worldInfo, 'UnitHealthbarValue', { text: '345' });
  const menu = add(hud, 'EscapeMenu');
  const stockPreview = add(menu, 'SettingsSharePreview', { classes: ['Preview'] });
  const stockBar = add(stockPreview, 'UnitHealthbar', { classes: ['UnitHealthbarContainer'] });
  add(add(stockBar, 'UnitHealthbarInner'), 'unit_healthbar_lagging', { style: { washColor: '#123123' } });
  add(stockPreview, 'UnitHealthbarValue', { text: '1' });
  add(menu, 'HPColorsPickerPreview', { style: { backgroundColor: '#ff0000' } });
  mount(parseLayout(layoutXml), menu);
  harness.contextPanel = menu;
  const pane = menu.FindChildTraverse('HPColorsPreview');
  const find = id => pane.FindChildTraverse(id);
  const parts = {
    info: find('HPColorsPreviewInfo'), primary: find('HPColorsPreviewBar'), inner: find('HPColorsPreviewBarInner'),
    fill: find('HPColorsPreviewBarFill'), hp: find('HPColorsPreviewHpText'), name: find('HPColorsPreviewName'),
  };
  if (options.beforeBoot) options.beforeBoot(parts);
  const outside = allPanels(harness.root).filter(panel => !within(panel, pane)).map(panel => ({
    panel, writes: panel.styleWrites.length, parent: panel.parent, classes: panel.classes.join(' '),
    events: Object.keys(panel.events).join(','), text: panel.__text, style: JSON.stringify(panel.style),
  }));
  const context = createVmContext(harness);
  if (options.renderer !== false) runInVm(rendererSource, context, rendererPath);
  runInVm(previewSource, context, previewPath);
  const api = menu.HPColorsPreviewV3;
  assert.ok(api, 'preview API is published on the menu context');
  const ui = {
    slider: find('HPColorsPreviewHealthSlider'), play: find('HPColorsPreviewPlay'), status: find('HPColorsPreviewStatus'),
    value: find('HPColorsPreviewHealthValue'), title: find('HPColorsPreviewTitle'), playLabel: find('HPColorsPreviewPlayLabel'),
    sideAlly: find('HPColorsPreviewSideOptionAlly'), sideEnemy: find('HPColorsPreviewSideOptionEnemy'),
    kindObjective: find('HPColorsPreviewKindOptionObjective'),
  };
  const plan = menu.HPColorsRendererPrototype && menu.HPColorsRendererPrototype.plan;
  const settings = () => api.inspect().settings;
  const expectWash = (percent, side = 'enemy', config = settings()) =>
    plan({ eligible: true, laid: true, side, fraction: percent / 100 }, config).styles.fill.washColor;
  const drag = value => { ui.slider.value = value; ui.slider.events.onvaluechanged(); };
  const press = panel => panel.events.onactivate();
  const jobs = () => harness.scheduler.jobs.length;
  const assertOutsideUntouched = () => {
    for (const before of outside) {
      const label = before.panel.id || before.panel.type;
      assert.equal(before.panel.styleWrites.length, before.writes, `${label}: no style writes`);
      assert.equal(before.panel.parent, before.parent, `${label}: parent unchanged`);
      assert.equal(before.panel.classes.join(' '), before.classes, `${label}: classes unchanged`);
      assert.equal(Object.keys(before.panel.events).join(','), before.events, `${label}: events unchanged`);
      assert.equal(before.panel.__text, before.text, `${label}: text unchanged`);
      assert.equal(JSON.stringify(before.panel.style), before.style, `${label}: style unchanged`);
    }
  };
  return { harness, menu, pane, parts, ui, api, plan, settings, expectWash, drag, press, jobs, assertOutsideUntouched };
}

function assertStockLook(fx, side = 'enemy') {
  assert.equal(fx.parts.primary.style.width, '79px');
  assert.equal(fx.parts.primary.style.height, '18px');
  assert.equal(fx.parts.inner.style.width, '69px');
  assert.equal(fx.parts.fill.style.washColor, side === 'enemy' ? '#fd4949' : '#ffefd7');
  assert.equal(fx.parts.hp.style.visibility, 'collapse');
  assert.equal(fx.parts.hp.GetParent(), fx.parts.info, 'HP label back under its stock parent');
  assert.equal(fx.api.inspect().ownedStyles, 0);
}

test('layout contract: unique HPColorsPreview ids, no stock/v2 collisions, chrome matches menu-gen, lineage mirrors stock', () => {
  const ids = idsOf(layoutXml);
  assert.equal(new Set(ids).size, ids.length, 'ids unique');
  for (const id of ids) assert.match(id, /^HPColorsPreview[A-Za-z]*$/);
  const stockStatus = fs.readFileSync(path.join(repo, 'hp_colors_rewrite_v2/panorama/layout/unit_status_overlay_v2.xml'), 'utf8');
  const v2Menu = fs.readFileSync(path.join(repo, 'hp_colors_rewrite_v2/panorama/layout/hud_escape_menu.xml'), 'utf8');
  const taken = new Set([...idsOf(stockStatus), ...idsOf(v2Menu)]);
  assert.deepEqual(ids.filter(id => taken.has(id)), [], 'no id shared with stock unit status or the v2/stock escape menu');
  const generated = JSON.parse(fs.readFileSync(path.join(__dirname, '../menu-gen/out/ids.json'), 'utf8'));
  const flat = JSON.stringify(generated).match(/HPColorsPreview\w*/g);
  for (const id of new Set(flat)) assert.ok(ids.includes(id), `menu-gen chrome id ${id} kept`);

  // Same parent chain and the UnitHealthbarContainer class on the bar, id-for-id.
  const parentsOf = xml => {
    const parents = new Map(); const classes = new Map();
    walk(parseLayout(xml), (node, parent) => {
      if (!node.attrs.id) return;
      if (!parents.has(node.attrs.id)) { parents.set(node.attrs.id, parent && parent.attrs.id); classes.set(node.attrs.id, node.attrs.class || ''); }
    });
    return { parents, classes };
  };
  const stock = parentsOf(stockStatus); const fake = parentsOf(layoutXml);
  for (const [stockId, fakeId] of Object.entries(LINEAGE)) {
    if (stockId === 'UnitStatus') continue;
    const stockParent = stock.parents.get(stockId);
    assert.equal(fake.parents.get(fakeId), LINEAGE[stockParent], `${fakeId} parent mirrors ${stockId} -> ${stockParent}`);
  }
  assert.match(stock.classes.get('UnitHealthbar'), /\bUnitHealthbarContainer\b/);
  assert.match(fake.classes.get('HPColorsPreviewBar'), /\bUnitHealthbar\b.*\bUnitHealthbarContainer\b/);
  assert.match(fake.classes.get('HPColorsPreviewBars'), /\bUnitHealthbarsContainer\b/);
  assert.match(fake.classes.get('HPColorsPreviewBarInner'), /\bUnitHealthbarInner\b/);
  const carrierClasses = /\b(player|enemy|friend|LocalPlayer|boss_tier\d|building|team_neutral|creature)\b/;
  walk(parseLayout(layoutXml), node => assert.doesNotMatch(node.attrs.class || '', carrierClasses, 'no carrier classes on menu panels'));
});

test('boot stops the self-booted renderer loop; open paints through plan with HP adoption', () => {
  const fx = fixture();
  assert.equal(fx.jobs(), 0, 'renderer world loop stopped, preview schedules nothing while closed');
  assert.equal(fx.menu.HPColorsRendererPrototype.inspect().ownedStyles, 0);
  assert.equal(fx.parts.fill.style.washColor, undefined, 'nothing painted before open');
  fx.api.open();
  assert.equal(fx.parts.fill.style.washColor, fx.expectWash(75));
  assert.equal(fx.parts.fill.style.washColor, '#80ff00');
  assert.equal(fx.parts.fill.style.width, '75%');
  assert.equal(fx.parts.primary.style.width, '79px');
  assert.equal(fx.parts.hp.GetParent(), fx.parts.primary, 'HP label adopted into the fake bar');
  assert.equal(fx.parts.hp.style.visibility, 'visible');
  assert.equal(fx.parts.hp.text, '750');
  assert.equal(fx.ui.status.text, 'Ready · Custom settings');
  assert.equal(fx.ui.title.text, 'HERO · ENEMY');
  assert.equal(fx.jobs(), 0, 'a laid-out open paint schedules nothing');
  fx.assertOutsideUntouched();
});

test('slider sets health and repaints; echoes of the current value are ignored', () => {
  const fx = fixture();
  fx.api.open();
  fx.drag(25);
  assert.equal(fx.parts.fill.style.washColor, '#ff8000');
  assert.equal(fx.parts.fill.style.width, '25%');
  assert.equal(fx.parts.hp.text, '250');
  assert.equal(fx.ui.value.text, '25%');
  assert.equal(fx.api.inspect().hp, 25);
  const writes = fx.parts.fill.styleWrites.length;
  fx.drag(25);
  assert.equal(fx.parts.fill.styleWrites.length, writes, 'same-value event is an echo, no repaint');
  fx.drag(140);
  assert.equal(fx.api.inspect().hp, 100, 'clamped');
  assert.equal(fx.parts.fill.style.washColor, '#00ff00');
  assert.equal(fx.jobs(), 0);
});

test('play runs the damage/heal sequence at 0.45 s steps and ends back at the slider value', () => {
  const fx = fixture();
  fx.api.open();
  fx.drag(60);
  fx.press(fx.ui.play);
  assert.equal(fx.api.inspect().playing, true);
  assert.equal(fx.ui.playLabel.text, 'STOP');
  assert.ok(fx.ui.play.BHasClass('Playing'));
  const seen = [fx.parts.fill.style.washColor];
  assert.equal(fx.parts.fill.style.washColor, fx.expectWash(90));
  assert.match(fx.ui.status.text, /^Healing/);
  for (const value of [72, 45, 20, 8, 28, 52, 78, 100]) {
    assert.equal(fx.jobs(), 1, 'exactly one job queued');
    assert.equal(fx.harness.scheduler.jobs[0].delay, 0.45);
    fx.harness.scheduler.runNext();
    assert.equal(fx.parts.fill.style.washColor, fx.expectWash(value), `step ${value}`);
    assert.equal(fx.parts.fill.style.width, `${value}%`);
    seen.push(fx.parts.fill.style.washColor);
  }
  assert.match(fx.ui.status.text, /^Healing/);
  assert.equal(fx.ui.value.text, '100%');
  assert.equal(fx.ui.slider.value, 60, 'play never writes the slider');
  fx.harness.scheduler.runNext();
  const state = fx.api.inspect();
  assert.equal(state.playing, false);
  assert.equal(fx.jobs(), 0, 'sequence ended, nothing left scheduled');
  assert.equal(fx.parts.fill.style.washColor, fx.expectWash(60));
  assert.equal(fx.ui.status.text, 'Ready · Custom settings');
  assert.equal(fx.ui.playLabel.text, 'PLAY DAMAGE / HEAL');
  assert.ok(!fx.ui.play.BHasClass('Playing'));
  assert.ok(seen.some((color, index) => index > 0 && color !== seen[index - 1]), 'colors changed during play');
  fx.assertOutsideUntouched();
});

test('slider input during play cancels the sequence; stale callbacks are inert', () => {
  const fx = fixture();
  fx.api.open();
  fx.press(fx.ui.play);
  fx.harness.scheduler.runNext();
  const stale = fx.harness.scheduler.jobs[0].fn;
  const echoWrites = fx.parts.fill.styleWrites.length;
  fx.drag(75); // echo of the unchanged slider value must not cancel play
  assert.equal(fx.api.inspect().playing, true);
  assert.equal(fx.parts.fill.styleWrites.length, echoWrites);
  fx.drag(40);
  assert.equal(fx.api.inspect().playing, false);
  assert.equal(fx.jobs(), 0, 'pending step cancelled');
  assert.equal(fx.parts.fill.style.washColor, fx.expectWash(40));
  stale();
  assert.equal(fx.parts.fill.style.washColor, fx.expectWash(40), 'old-generation step does nothing');
  fx.harness.scheduler.runFor(10000);
  assert.equal(fx.parts.fill.style.width, '40%');
  // Pressing play twice stops instead of starting a second sequence.
  fx.press(fx.ui.play); fx.press(fx.ui.play);
  assert.equal(fx.api.inspect().playing, false);
  assert.equal(fx.jobs(), 0);
  assert.equal(fx.parts.fill.style.width, '40%');
});

test('close cancels every scheduled callback, releases ownership, and reopen repaints once', () => {
  const fx = fixture();
  fx.api.open();
  fx.press(fx.ui.play);
  fx.harness.scheduler.runNext();
  const stale = fx.harness.scheduler.jobs[0].fn;
  fx.api.close();
  assert.equal(fx.jobs(), 0, 'no callbacks left after close');
  assert.equal(fx.api.inspect().open, false);
  assertStockLook(fx);
  const writes = fx.parts.fill.styleWrites.length;
  stale();
  fx.harness.scheduler.runFor(10000);
  assert.equal(fx.parts.fill.styleWrites.length, writes, 'nothing paints after close');
  fx.press(fx.ui.play);
  fx.drag(10);
  assert.equal(fx.jobs(), 0, 'closed preview ignores play');
  fx.api.open();
  assert.equal(fx.parts.fill.style.washColor, fx.expectWash(10));
  assert.equal(fx.parts.hp.GetParent(), fx.parts.primary);
  fx.api.close(); fx.api.close();
  assert.equal(fx.jobs(), 0);
  fx.assertOutsideUntouched();
});

test('kind follows the page; page and side switches cancel play mid-animation', () => {
  const fx = fixture();
  fx.api.open();
  fx.press(fx.ui.play);
  fx.harness.scheduler.runNext();
  fx.api.setPage('Units');
  let state = fx.api.inspect();
  assert.equal(state.playing, false);
  assert.equal(fx.jobs(), 0, 'page switch cancelled the sequence');
  assert.equal(state.kind, 'npc');
  assert.equal(fx.ui.title.text, 'NPC · ENEMY');
  assert.ok(fx.pane.BHasClass('HPC3PreviewUnitsPage'));
  assert.ok(fx.pane.BHasClass('HPC3PreviewKindNpc') && !fx.pane.BHasClass('HPC3PreviewKindHero'));
  assert.equal(fx.parts.name.text, 'SENTRY');
  assertStockLook(fx); // renderer prototype paints enemy players only
  assert.equal(fx.parts.hp.text, '450');
  assert.match(fx.ui.status.text, /NPC rules are not built yet/);
  fx.press(fx.ui.kindObjective);
  assert.equal(fx.api.inspect().kind, 'objective');
  assert.equal(fx.ui.title.text, 'OBJECTIVE · ENEMY');
  assert.equal(fx.parts.hp.text, '3000');
  fx.api.setPage('HPText');
  assert.equal(fx.api.inspect().kind, 'hero');
  assert.ok(!fx.pane.BHasClass('HPC3PreviewUnitsPage'));
  assert.equal(fx.parts.fill.style.washColor, fx.expectWash(75));
  fx.api.setPage('Units');
  assert.equal(fx.api.inspect().kind, 'objective', 'unit kind choice is remembered');
  fx.api.setPage('Bar');
  fx.press(fx.ui.play);
  fx.press(fx.ui.sideAlly);
  state = fx.api.inspect();
  assert.equal(state.playing, false);
  assert.equal(fx.jobs(), 0, 'side switch cancelled the sequence');
  assert.equal(fx.ui.title.text, 'HERO · ALLY');
  assert.equal(fx.parts.name.text, 'LADY GEIST');
  assertStockLook(fx, 'ally'); // renderer.js carrierFacts: friend carriers stay stock
  assert.match(fx.ui.status.text, /Ally heroes keep the stock look/);
  fx.press(fx.ui.sideEnemy);
  assert.equal(fx.parts.fill.style.washColor, fx.expectWash(75));
  fx.assertOutsideUntouched();
});

test('the renderer applies nothing outside the preview tree across a full session', () => {
  const fx = fixture();
  fx.api.open();
  fx.drag(33);
  fx.press(fx.ui.play);
  fx.harness.scheduler.runNext();
  fx.api.setSettings({ ...fx.settings(), side: { ...fx.settings().side,
    enemy: { ...fx.settings().side.enemy, width: 140, height: 30, x: 12, y: -8, mode: 'fixed', fixed: '#123456' } } });
  fx.harness.scheduler.runFor(6000);
  fx.api.setPage('Units'); fx.press(fx.ui.kindObjective); fx.api.setPage('Name'); fx.press(fx.ui.sideAlly);
  fx.press(fx.ui.sideEnemy); fx.drag(90);
  assert.equal(fx.parts.primary.style.width, '140px');
  assert.equal(fx.parts.primary.style.position, '12px -8px 0px');
  assert.equal(fx.parts.inner.style.width, '130px');
  assert.equal(fx.parts.fill.style.washColor, '#123456');
  fx.api.close();
  assert.equal(fx.jobs(), 0);
  fx.assertOutsideUntouched();
  assert.ok(fx.parts.primary.styleWrites.length > 0 && fx.parts.hp.styleWrites.length > 0, 'the fake tree did receive the writes');
});

test('plan/apply on the fake tree equals renderer.js on a stock-lineage world bar, paint and release', () => {
  for (const [percent, patch] of [[50, {}], [25, {}], [100, { side: { enemy: { mode: 'fixed', fixed: '#abcdef', width: 120, height: 24, x: 5, y: -3 } } }],
    [70, { side: { enemy: { hpText: false, width: 60 } } }]]) {
    // Real renderer on stock ids, no inline stock: release falls back to its pinned values.
    const harness = createPanoramaHarness();
    const add = (parent, id, opts = {}) => parent.add(new MockPanel(id, opts));
    const world = add(harness.root, 'WorldUIRoot', { classes: ['player', 'enemy'] });
    const status = add(add(world, 'client_ui_panel', { classes: ['WindowRoot'] }), 'UnitStatus');
    const info = add(status, 'InfoHealthContainer', { actuallayoutwidth: 200, actuallayoutheight: 210 });
    const primary = add(add(info, 'UnitHealthbarsContainer'), 'UnitHealthbar', { classes: ['UnitHealthbarContainer'] });
    const inner = add(primary, 'UnitHealthbarInner', { actuallayoutwidth: 69 });
    const fill = add(inner, 'unit_healthbar_lagging', { actuallayoutwidth: 69 * percent / 100, style: { clip: `rect(0%, ${percent}%, 100%, 0%)` } });
    const health = add(info, 'UnitHealthbarValue');
    harness.contextPanel = status;
    runInVm(rendererSource, createVmContext(harness), rendererPath);
    const world3 = status.HPColorsRendererPrototype;
    world3.configure(patch);
    const worldParts = { primary, inner, fill, hp: health };

    const fx = fixture();
    const config = fx.settings();
    fx.api.setSettings({ ...config, side: { ...config.side, enemy: { ...config.side.enemy, ...(patch.side || {}).enemy } } });
    fx.api.open();
    fx.drag(percent);
    // Keys the world renderer never wrote have no inline stock on that fixture; compare owned keys only.
    const compare = phase => {
      let compared = 0;
      for (const [part, keys] of Object.entries(OWNED)) for (const key of keys) {
        if (!worldParts[part].styleWrites.some(write => write.property === key)) continue;
        assert.equal(fx.parts[part].style[key], worldParts[part].style[key], `${percent}% ${part}.${key} ${phase}`);
        compared++;
      }
      assert.ok(compared >= 6, `${percent}%: ${compared} owned keys compared`);
    };
    compare('painted');
    assert.equal(fx.parts.hp.GetParent() === fx.parts.primary, health.GetParent() === primary, 'same HP adoption');

    world3.configure({ enabled: false });
    fx.api.setSettings({ ...fx.settings(), enabled: false });
    compare('released');
    assert.equal(health.GetParent(), info);
    assert.equal(fx.parts.hp.GetParent(), fx.parts.info);
    assert.match(fx.ui.status.text, /Customization is off/);
    world3.stop();
  }
});

test('unlaid pane at open settles with bounded retries; close cancels them', () => {
  const fx = fixture({ beforeBoot: parts => { parts.info.actuallayoutwidth = 0; } });
  fx.api.open();
  assert.equal(fx.parts.fill.style.washColor, '#fd4949', 'stock look only while unlaid');
  assert.equal(fx.api.inspect().ownedStyles, 0);
  assert.match(fx.ui.status.text, /Waiting for layout/);
  assert.equal(fx.harness.scheduler.jobs[0].delay, 0.1);
  fx.harness.scheduler.runNext();
  fx.harness.scheduler.runNext();
  fx.parts.info.actuallayoutwidth = 200;
  fx.harness.scheduler.runNext();
  assert.equal(fx.parts.fill.style.washColor, fx.expectWash(75));
  assert.equal(fx.jobs(), 0, 'settled, retries stop');

  const never = fixture({ beforeBoot: parts => { parts.info.actuallayoutwidth = 0; } });
  never.api.open();
  let runs = 0;
  while (never.jobs() && runs < 50) { never.harness.scheduler.runNext(); runs++; }
  assert.equal(runs, 10, 'at most ten 0.1 s retries');
  const again = fixture({ beforeBoot: parts => { parts.info.actuallayoutwidth = 0; } });
  again.api.open();
  again.api.close();
  assert.equal(again.jobs(), 0);
});

test('settings changes during play keep one sequence; malformed records are refused', () => {
  const fx = fixture();
  fx.api.open();
  fx.press(fx.ui.play);
  fx.harness.scheduler.runNext();
  const config = fx.settings();
  fx.api.setSettings({ ...config, side: { ...config.side, enemy: { ...config.side.enemy, mode: 'fixed', fixed: '#00aaff' } } });
  assert.equal(fx.api.inspect().playing, true);
  assert.equal(fx.jobs(), 1);
  assert.equal(fx.parts.fill.style.washColor, '#00aaff');
  fx.api.setSettings({ ...fx.settings(), side: { enemy: { fixed: 'red', width: NaN, height: '30' }, ally: null } });
  assert.equal(fx.parts.fill.style.washColor, '#00aaff');
  assert.equal(fx.parts.primary.style.width, '79px');
  fx.api.setSettings(null);
  fx.api.setSettings({ enabled: 'yes' });
  assert.equal(fx.settings().enabled, true);
  assert.equal(fx.jobs(), 1, 'still one sequence');
});

test('without the renderer the preview disables itself and wires nothing', () => {
  const fx = fixture({ renderer: false });
  assert.equal(fx.api.inspect().available, false);
  assert.ok(fx.pane.BHasClass('HPC3PreviewUnavailable'));
  assert.match(fx.ui.status.text, /renderer not loaded/);
  assert.equal(fx.ui.play.events.onactivate, undefined);
  fx.api.open();
  fx.api.setPage('Units');
  assert.equal(fx.parts.fill.styleWrites.length, 0);
  assert.equal(fx.jobs(), 0);
  fx.assertOutsideUntouched();
});
