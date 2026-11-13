'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadLayout, parseLayout, runInVm, sourceRoot, latestPublishedConfig } = require('./boot-layout');
// HUD paint and local-hero detection continue independently of preview work.
const work = h => h.scheduler.jobs.filter(job => !(job.fn && ['hudWatch', 'identityWatch', 'updateCheck'].includes(job.fn.name)));
const { computed, inline } = require('./style-cascade');
const oldGrid = require('./old-grid');
const { modelPreviewLayout } = require('./preview-layout');
const { installTopBarIdentityTree, MockPanel } = require('../../scripts/hp-colors-panorama-test-adapter');

const root = path.resolve(__dirname, '..');
const STEPS = [90, 72, 45, 20, 8, 28, 52, 78, 100];

function booted(options = {}) {
  const boot = loadLayout('hud_escape_menu.xml', options);
  boot.includeScripts();
  const h = boot.harness;
  let menuApi;
  const store = h.$.HPColorsV3Store;
  h.$.HPColorsV3Store = { ...store, attach(api) { menuApi = api; return store.attach(api); } };
  boot.onload();
  const find = id => { const panel = h.contextPanel.FindChildTraverse(id); assert.ok(panel, id); return panel; };
  const fire = (id, event) => { const panel = find(id); assert.equal(typeof panel.events[event], 'function', id + ' ' + event); panel.events[event](); };
  const m = {
    boot, h, find, fire,
    api: () => menuApi,
    pane: () => find('HPColorsPreview'),
    preview: () => h.$.HPColorsV3Preview.inspect(),
    settings: () => latestPublishedConfig(h).settings,
    open: () => runInVm(find('HPColorsMenuButton').GetAttributeString('onactivate', ''), boot.context),
    cancel: () => runInVm(boot.panelNode.attrs.oncancel, boot.context),
    slider: value => { find('HPColorsPreviewHealthSlider').value = value; fire('HPColorsPreviewHealthSlider', 'onvaluechanged'); },
    play: () => fire('HPColorsPreviewPlay', 'onactivate'),
    submit: (id, text) => { find(id).text = String(text); fire(id, 'ontextentrysubmit'); },
    fill: () => find('HPColorsPreviewBarFill').style,
    jobs: () => h.scheduler.jobs.filter(job => job.fn && ['previewStep', 'previewSettle'].includes(job.fn.name)),
    playJobs: () => h.scheduler.jobs.filter(job => job.fn && job.fn.name === 'previewStep'),
  };
  if (options.previewLayout) modelPreviewLayout(m, options.baseUiScale || 1);
  return m;
}
function inside(panel, ancestor) {
  for (let node = panel; node; node = node.GetParent()) if (node === ancestor) return true;
  return false;
}
function walk(panel, visit) { visit(panel); for (const child of panel.children) walk(child, visit); }

// Every observable panel property outside the preview pane: styles, classes, text, events, parent.
function outsideSnapshot(m) {
  const pane = m.pane();
  const out = [];
  walk(m.h.contextPanel, panel => {
    if (inside(panel, pane)) return;
    out.push([panel.id, panel.type, JSON.stringify({ ...panel.style }), [...panel.classes].sort().join(' '), String(panel.__text),
      Object.keys(panel.events).sort().join(','), panel.GetParent() && panel.GetParent().id, panel.styleWrites.length]);
  });
  return JSON.stringify(out);
}

test('fake tree mirrors the world lineage with preview-prefixed ids, a dedicated supporter-strip id, no stock ids and no carrier classes', () => {
  const m = booted();
  const ids = {};
  walk(m.pane(), panel => { if (panel.id) ids[panel.id] = panel; });
  const chain = ['HPColorsPreviewBarFill', 'HPColorsPreviewBarInner', 'HPColorsPreviewBar', 'HPColorsPreviewBars',
    'HPColorsPreviewInfo', 'HPColorsPreviewUnitStatus', 'HPColorsPreviewCanvas'];
  for (let i = 0; i < chain.length - 1; i++) assert.equal(ids[chain[i]].GetParent().id, chain[i + 1], chain[i]);
  assert.equal(ids.HPColorsPreviewHpText.GetParent().id, 'HPColorsPreviewInfo');
  assert.equal(ids.HPColorsPreviewName.GetParent().id, 'HPColorsPreviewCanvas');
  assert.equal(ids.HPColorsPreviewReadoutLine.GetParent().GetParent().GetParent().id, 'HPColorsPreviewMotion');
  // Ticket 32's hosted content is a sibling of the fake world-bar tree.
  for (const id of Object.keys(ids)) if (id !== 'HPColorsSupporterStrip') assert.match(id, /^HPColorsPreview/);
  const stockIds = new Set();
  for (const file of ['vendor/hud_escape_menu.xml', 'vendor/unit_status_overlay_v2.xml', 'panorama/layout/unit_status_overlay_v2.xml']) {
    walk(parseLayout(fs.readFileSync(path.join(root, file), 'utf8')), function visit(node) { if (node.attrs && node.attrs.id) stockIds.add(node.attrs.id); });
  }
  for (const id of Object.keys(ids)) assert.equal(stockIds.has(id), false, id + ' collides with a stock/world id');
  const carrier = ['player', 'CLASS_PLAYER', 'enemy', 'friend', 'building', 'boss_tier1', 'team_neutral', 'UnitHealthbarContainer'];
  walk(m.pane(), panel => { for (const name of carrier) assert.equal(panel.BHasClass(name), false, panel.id + ' carries ' + name); });
});

test('including the renderer in the ESC menu starts no world loop, listener or bridge; preview idles until opened', () => {
  const m = booted();
  assert.equal(m.h.$.HPColorsV3Renderer.status.state, 'stopped');
  assert.equal(m.h.handlerEntries.filter(entry => entry.channel === 'ClientUI_FireOutput').length, 1, 'only the menu answer listener');
  assert.equal(work(m.h).length, 0);
  assert.equal(m.preview().available, true);
  assert.equal(m.preview().open, false);
  assert.equal(m.preview().owned, 0, 'nothing painted while closed');
  m.open();
  assert.equal(m.preview().open, true);
  assert.equal(m.preview().painted, true);
});

test('the real renderer plan is applied onto the preview parts and follows edits, HP and side', () => {
  const m = booted();
  m.open();
  m.slider(10);
  assert.equal(m.fill().width, '100%');
  assert.equal(m.fill().clip, 'rect(0%, 10%, 100%, 0%)');
  assert.equal(m.find('HPColorsPreviewHealthValue').text, '10%');
  assert.equal(m.find('HPColorsPreviewHpText').text, '100');
  const facts = m.preview().facts;
  assert.equal(facts.side, 'enemy'); assert.equal(facts.eligible, true); assert.ok(Math.abs(facts.fraction - 0.1) < 1e-9, 'fraction measured by the renderer');
  const plan = m.h.$.HPColorsV3Renderer.plan(facts, m.settings());
  const map = { status: 'UnitStatus', info: 'Info', stack: 'Bars', primary: 'Bar', inner: 'BarInner', fill: 'BarFill', healing: 'BarHealing',
    delta: 'BarDelta', shield: 'BarShield', armor: 'BarArmor', lines: 'BarLines', outline: 'BarOutline', motion: 'Motion',
    visualFill: 'BarVisualFill',
    anchor: 'ReadoutAnchor', row: 'ReadoutLine', value: 'HpText', name: 'Name', killMarker:'KillMarker',
    level:'Level',ult:'UltPanel',ultBackground:'UltBackground',ultReady:'UltReady',killStreak:'KillStreak',rejuv:'Rejuvenator',rejuvAnchor:'RejuvenatorAnchor',
    ultimateOverlay:'UltimateOverlay',ultimateDark:'UltimateDark',ultimateFill:'UltimateFill' };
  // The preview never shows deferred damage, so it has no deferred layer; the renderer skips the absent part.
  for (const [part, styles] of Object.entries(plan.styles)) {
    if (part === 'deferred') { assert.equal(m.h.contextPanel.FindChildTraverse('HPColorsPreviewBarDeferred'), null); continue; }
    const suffix={pickupIcons:'',pickupInners:'Inner',pickupBorders:'Border',pickupTracks:'Track',pickupGlyphs:'Glyph'}[part];
    const panels=part==='lineWash'?m.find('HPColorsPreviewBarLines').Children():suffix!==undefined
      ? ['Gun','Movement','Spirit','Survival'].map(name=>m.find('HPColorsPreviewPickup'+name+suffix)):[m.find('HPColorsPreview'+map[part])];
    for (const [i,panel] of panels.entries()) for (const [key, value] of Object.entries(Array.isArray(styles)?styles[i]:styles)) assert.equal(value === '' ? inline(panel, key) || '' : inline(panel, key), value, part + '.' + key);
  }
  assert.equal(m.find('HPColorsPreviewHpText').GetParent().id, 'HPColorsPreviewReadoutLine', 'HP text adopted into the owned readout row');
  assert.equal(m.find('HPColorsPreviewUnitStatus').GetParent().id, 'HPColorsPreviewMotion');
  assert.equal(m.find('HPColorsPreviewCanvas').BHasClass('HPColorsV3Core'), true);
  assert.equal(m.fill().washColor.toLowerCase(), '#fd4949');
  m.submit('HPColorsBarColorLowEnemyHex', '#123456');
  assert.equal(m.fill().washColor, '#123456', 'menu edit repaints the preview');
  // An ally row usable with ally bar colors off (the ally feedback colors grey out with them since 2026-11-02).
  m.submit('HPColorsBarWidthAllyEntry', 90);
  assert.equal(m.preview().side, 'ally', 'editing an ally row moves the preview to the ally column');
  assert.equal(m.fill().washColor, '', 'ally colors off: inline lease cleared');
  assert.equal(computed(m.find('HPColorsPreviewBarFill'),'washColor').toUpperCase(), '#FFEFD7', 'ally stock comes from CSS');
  assert.equal(m.find('HPColorsPreviewHpText').GetParent().id, 'HPColorsPreviewInfo', 'ally HP text off: label restored to the info container');
  m.fire('HPColorsPreviewSideOptionEnemy', 'onactivate');
  assert.equal(m.fill().washColor, '#123456');
  assert.equal(m.find('HPColorsPreviewSideOptionEnemy').BHasClass('Selected'), true);
  assert.equal(m.find('HPColorsPreviewTitle').text, 'HERO · ENEMY');
});

test('kind follows the page; unit kinds stay stock and release the hero look to their own stock values', () => {
  const m = booted();
  m.open(); m.slider(10);
  m.submit('HPColorsBarColorLowEnemyHex', '#123456');
  assert.ok(m.preview().owned > 0);
  m.fire('HPColorsNavUnitsButton', 'onactivate');
  assert.equal(m.preview().kind, 'neutral', 'Units opens on the neutral camp sample');
  assert.equal(m.preview().painted, false);
  assert.equal(m.preview().owned, 0, 'every hero-owned style released');
  assert.equal(m.fill().washColor, '', 'released inline color');
  m.fire('HPColorsPreviewKindOptionObjective', 'onactivate');
  assert.equal(computed(m.find('HPColorsPreviewBarFill'),'washColor').toUpperCase(), '#FD4949', 'released to enemy CSS, not custom hero color');
  assert.equal(m.find('HPColorsPreviewHpText').GetParent().id, 'HPColorsPreviewInfo');
  assert.equal(m.pane().BHasClass('HPC3PreviewUnitsPage'), true);
  m.fire('HPColorsPreviewSideOptionAlly', 'onactivate');
  assert.equal(computed(m.find('HPColorsPreviewBarFill'),'washColor').toUpperCase(), '#FFEFD7', 'unowned CSS follows the new relation');
  assert.equal(m.preview().kind, 'objective');
  assert.match(m.preview().status, /Turn on Customize objective bars to style this bar/);
  m.fire('HPColorsNavNameButton', 'onactivate');
  assert.equal(m.preview().kind, 'hero');
  assert.equal(m.pane().BHasClass('HPC3PreviewKindHero'), true);
});

// yesdaddy, 2026-11-02 (3.6.0 RC screenshots 20261102043357/043404 vs 043401/043417): the unit preview drew a
// dark band through the bar and a plain HP number, while the game draws a flat bar and tints the number.
test('unit preview matches the stock world bar: no border band, stock HP number tints', () => {
  const m = booted();
  m.open();
  // The 6839 overlay layout has no .healthbar_border panel and client.dll never creates one.
  assert.ok(m.pane().FindChildTraverse('HPColorsPreviewBarBorder') === null, 'no border band over the fill');
  const value = m.find('HPColorsPreviewHpText');
  const own = inline(value, 'washColor');
  assert.ok(own, 'customized hero HP text writes its own color');
  assert.equal(computed(value, 'washColor'), own, 'the custom color wins over the stock tint');
  m.fire('HPColorsNavUnitsButton', 'onactivate');
  assert.equal(m.preview().kind, 'neutral');
  assert.equal(computed(value, 'washColor'), 'rgb(160, 255, 226)', 'stock .team_neutral #UnitHealthbarValue');
  m.fire('HPColorsPreviewKindOptionObjective', 'onactivate');
  assert.equal(computed(value, 'washColor'), 'rgb(255, 160, 160)', 'stock .enemy #UnitHealthbarValue');
  m.fire('HPColorsPreviewSideOptionAlly', 'onactivate');
  assert.equal(computed(value, 'washColor'), undefined, 'friend numbers keep the plain ink');
  m.fire('HPColorsPreviewSideOptionEnemy', 'onactivate');
  m.fire('HPColorsNavHPTextButton', 'onactivate');
  m.fire('HPColorsEnabledToggle', 'onactivate');
  assert.equal(m.preview().kind, 'hero');
  assert.equal(computed(value, 'washColor'), 'rgb(255, 160, 160)', 'master off: the stock enemy hero label is tinted too');
});

test('play runs nine damage/heal steps 0.45 s apart, then restores the slider HP and leaves no work', () => {
  const m = booted();
  m.open(); m.slider(60);
  m.play();
  const shown = [m.preview().shown];
  const delays = [];
  while (m.playJobs().length) {
    assert.equal(m.playJobs().length, 1, 'one play job slot');
    delays.push(m.playJobs()[0].delay);
    m.h.scheduler.runFor(450);
    shown.push(m.preview().shown);
  }
  assert.deepEqual(shown.slice(0, 9), STEPS);
  assert.deepEqual(delays, Array(9).fill(0.45));
  assert.equal(m.preview().playing, false);
  assert.equal(m.preview().shown, 60);
  assert.equal(m.fill().clip, 'rect(0%, 60%, 100%, 0%)');
  m.h.scheduler.runFor(100);
  assert.equal(work(m.h).length, 0);
});

test('play shows damage and healing state; a second press stops', () => {
  const m = booted();
  m.open();
  m.play();
  assert.equal(m.preview().playing, true);
  assert.match(m.find('HPColorsPreviewStatus').text, /^Healing|^Damage/);
  assert.equal(m.find('HPColorsPreviewPlayLabel').text, 'STOP');
  assert.equal(m.find('HPColorsPreviewPlay').BHasClass('Playing'), true);
  m.play();
  assert.equal(m.preview().playing, false);
  assert.equal(m.playJobs().length, 0);
  m.h.scheduler.runFor(100);
  assert.equal(m.jobs().length, 0);
  assert.equal(m.find('HPColorsPreviewPlayLabel').text, 'PLAY DAMAGE / HEAL');
});

for (const [name, interrupt] of [
  ['close', m => m.cancel()],
  ['page switch', m => m.fire('HPColorsNavHPTextButton', 'onactivate')],
  ['side switch', m => m.fire('HPColorsPreviewSideOptionAlly', 'onactivate')],
  ['slider input', m => m.slider(33)],
  ['menu script reinclusion', m => { m.boot.includeScripts(); m.boot.onload(); }],
]) {
  test('play is cancelled by ' + name + ' and its stale callback cannot repaint', () => {
    const m = booted();
    m.open(); m.play(); m.h.scheduler.runFor(450);
    const stale = m.playJobs()[0];
    assert.ok(stale);
    interrupt(m);
    assert.equal(m.preview().playing, false);
    // Reinclusion reboots the menu, whose fresh painter may queue one bounded layout settle; never a step.
    for (let i = 0; i < 10 && m.jobs().length; i++) { m.h.scheduler.runNext(); assert.equal(m.preview().shown, m.preview().hp); }
    assert.equal(m.jobs().length, 0, 'scheduled step cancelled');
    const writes = m.fill().clip;
    const before = m.find('HPColorsPreviewBarFill').styleWrites.length;
    stale.fn();
    assert.equal(m.find('HPColorsPreviewBarFill').styleWrites.length, before, 'stale step writes nothing');
    assert.equal(m.fill().clip, writes);
    assert.equal(m.jobs().length, 0, 'stale step schedules nothing');
  });
}

test('settings edits during play repaint without restarting or duplicating; slider echo does not cancel', () => {
  const m = booted();
  m.open(); m.play();
  m.h.scheduler.runFor(900);
  const index = m.preview().shown;
  m.submit('HPColorsBarColorMidEnemyHex', '#0000FF');
  assert.equal(m.preview().playing, true);
  assert.equal(m.playJobs().length, 1);
  assert.equal(m.preview().shown, index, 'edit does not restart the sequence');
  m.slider(m.preview().hp);
  assert.equal(m.preview().playing, true, 'echo of the current value is not user input');
  m.h.scheduler.runFor(450);
  assert.equal(m.preview().shown, STEPS[3]);
});

test('preview operations write nothing outside the preview tree: no menu panels, revisions, saves, history or world config', () => {
  const commits = [];
  const m = booted();
  m.h.$.HPColorsV3Store = { commit: config => commits.push(config.revision) };
  const before = outsideSnapshot(m);
  m.h.$.HPColorsV3Preview.open();
  const revision = latestPublishedConfig(m.h).revision;
  const dispatches = m.h.dispatches.length;
  const undo = m.find('HPColorsUndoButton').enabled;
  m.slider(20); m.play();
  while (m.jobs().length) m.h.scheduler.runNext();
  m.play(); m.h.scheduler.runNext(); m.slider(80);
  m.fire('HPColorsPreviewSideOptionAlly', 'onactivate'); m.fire('HPColorsPreviewSideOptionEnemy', 'onactivate');
  m.fire('HPColorsPreviewKindOptionObjective', 'onactivate');
  assert.equal(outsideSnapshot(m), before);
  assert.equal(latestPublishedConfig(m.h).revision, revision);
  assert.equal(m.h.dispatches.length, dispatches, 'no ClientUI_FireOutput or other dispatch');
  assert.deepEqual(commits, []);
  assert.equal(m.find('HPColorsUndoButton').enabled, undo);
  assert.equal(m.h.$.HPColorsV3Renderer.status.state, 'stopped');
});

test('unlaid pane keeps polling until laid; a missing sample part disables the preview without throwing', () => {
  const m = booted();
  const inner = m.find('HPColorsPreviewBarInner');
  inner.actuallayoutwidth = 0;
  m.open();
  assert.match(m.preview().status, /Waiting for layout/);
  m.h.scheduler.runFor(2000);
  assert.equal(m.jobs().length, 1, 'one poll slot remains after the old cap');
  inner.actuallayoutwidth = 69;
  m.h.scheduler.runFor(250);
  assert.equal(m.preview().painted, true);
  m.h.scheduler.runFor(1000);
  assert.equal(m.jobs().length, 0, 'settle stops once laid');
  m.find('HPColorsPreviewBarFill').valid = false;
  assert.doesNotThrow(() => m.slider(50));
  assert.equal(m.preview().available, false);
  assert.match(m.find('HPColorsPreviewStatus').text, /unavailable/);
  assert.doesNotThrow(() => m.play());
  assert.equal(m.jobs().length, 0);
});

test('reincluding the preview script retires the old instance and the new one takes over the same panels', () => {
  const m = booted();
  m.open(); m.play();
  const stale = m.playJobs()[0];
  const ctx = m.boot.context;
  runInVm(fs.readFileSync(path.join(sourceRoot, 'panorama/scripts/hp_colors_v3_preview.js'), 'utf8'), ctx, 'preview-reinclude.js');
  assert.equal(m.jobs().length, 0, 'old sequence cancelled');
  const before = m.find('HPColorsPreviewBarFill').styleWrites.length;
  stale.fn();
  assert.equal(m.find('HPColorsPreviewBarFill').styleWrites.length, before);
  assert.equal(m.h.$.HPColorsV3Preview.attach(m.find('HPColorsMenuHost'), m.settings()), true);
  m.h.$.HPColorsV3Preview.open();
  m.slider(15);
  assert.equal(m.fill().clip, 'rect(0%, 15%, 100%, 0%)');
  assert.equal(m.preview().painted, true);
});

test('play shows feedback layers: delta spans new to previous HP on damage, healing spans old to new with the fill held', () => {
  const m = booted();
  m.open(); m.slider(100);
  const delta = () => m.find('HPColorsPreviewBarDelta').style;
  const healing = () => m.find('HPColorsPreviewBarHealing').style;
  m.play(); // 100 -> 90 damage
  assert.equal(delta().width, '100%');
  assert.equal(delta().clip, 'rect(0%, 100%, 100%, 90%)');
  assert.equal(m.fill().clip, 'rect(0%, 90%, 100%, 0%)');
  assert.equal(healing().width || '0%', '0%');
  m.h.scheduler.runFor(450); // 90 -> 72
  assert.equal(delta().clip, 'rect(0%, 90%, 100%, 72%)');
  m.h.scheduler.runFor(1350); // ... 20 -> 8
  m.h.scheduler.runFor(450); // 8 -> 28 heal
  assert.equal(delta().width, '0%', 'damage layer cleared on the next step');
  assert.equal(healing().width, '100%');
  assert.equal(healing().clip, 'rect(0%, 28%, 100%, 8%)');
  assert.equal(m.fill().clip, 'rect(0%, 8%, 100%, 0%)', 'fill held at the old value while healing');
  assert.equal(m.find('HPColorsPreviewHealthValue').text, '28%');
  assert.ok(healing().washColor, 'renderer still owns the healing color');
  m.play(); // stop
  assert.equal(healing().width, '0%', 'cancel clears feedback');
  assert.equal(delta().width, '0%');
  assert.equal(m.fill().width, '100%');
  assert.equal(m.fill().clip, 'rect(0%, 100%, 100%, 0%)');
  m.play(); m.cancel();
  assert.equal(delta().width, '0%', 'close clears feedback');
});

test('reloading the preview script releases the old painter: owned styles, parents and classes return to stock', () => {
  const m = booted();
  m.open(); m.slider(10);
  m.submit('HPColorsBarColorLowEnemyHex', '#123456');
  assert.equal(m.find('HPColorsPreviewHpText').GetParent().id, 'HPColorsPreviewReadoutLine');
  runInVm(fs.readFileSync(path.join(sourceRoot, 'panorama/scripts/hp_colors_v3_preview.js'), 'utf8'), m.boot.context, 'preview-reinclude.js');
  assert.equal(m.find('HPColorsPreviewHpText').GetParent().id, 'HPColorsPreviewInfo', 'HP text back in Info');
  assert.equal(m.find('HPColorsPreviewUnitStatus').GetParent().id, 'HPColorsPreviewCanvas', 'UnitStatus back under the canvas');
  assert.equal(m.find('HPColorsPreviewCanvas').BHasClass('HPColorsV3Core'), false);
  assert.notEqual(m.fill().washColor, '#123456');
  const api = m.h.$.HPColorsV3Preview;
  assert.equal(api.attach(m.find('HPColorsMenuHost'), m.settings()), true);
  api.open(); api.setPage('Units');
  assert.equal(api.inspect().owned, 0);
  assert.equal(m.find('HPColorsPreviewHpText').GetParent().id, 'HPColorsPreviewInfo', 'nothing stranded after the reload');
  assert.equal(m.find('HPColorsPreviewCanvas').BHasClass('HPColorsV3Core'), false);
});

test('preview that cannot attach says so: no renderer painter or a missing sample part marks it unavailable', () => {
  const noRenderer = loadLayout('hud_escape_menu.xml');
  noRenderer.includeScripts();
  noRenderer.harness.$.HPColorsV3Renderer = { plan() {} };
  noRenderer.onload();
  const pane = noRenderer.harness.contextPanel.FindChildTraverse('HPColorsPreview');
  assert.equal(pane.BHasClass('HPC3PreviewUnavailable'), true);
  assert.match(noRenderer.harness.contextPanel.FindChildTraverse('HPColorsPreviewStatus').text, /unavailable/i);
  assert.equal(noRenderer.harness.$.HPColorsV3Preview.inspect().available, false);
  assert.equal(noRenderer.harness.contextPanel.FindChildTraverse('HPColorsMenuHost').GetAttributeString('hpv3_boot', ''), 'ready', 'menu still boots');

  // A part that vanishes before (re)attach: the menu is booted, the reloaded preview cannot resolve.
  const m = booted();
  runInVm(fs.readFileSync(path.join(sourceRoot, 'panorama/scripts/hp_colors_v3_preview.js'), 'utf8'), m.boot.context, 'preview-reinclude.js');
  m.find('HPColorsPreviewBarLines').valid = false;
  assert.equal(m.h.$.HPColorsV3Preview.attach(m.find('HPColorsMenuHost'), m.settings()), false);
  assert.equal(m.pane().BHasClass('HPC3PreviewUnavailable'), true);
  assert.equal(m.h.$.HPColorsV3Preview.inspect().available, false);
});

test('audit: preview ids mirror owned world geometry, visibility and stock release CSS',()=>{
  const m=booted();m.open();
  const status=m.find('HPColorsPreviewUnitStatus'),primary=m.find('HPColorsPreviewBar'),hp=m.find('HPColorsPreviewHpText'),name=m.find('HPColorsPreviewName');
  assert.equal(computed(status,'width'),'100%');assert.equal(computed(status,'marginTop'),'0px');
  assert.equal(computed(primary,'marginTop'),'65px');assert.equal(computed(primary,'opacityMask'),undefined,'default BAR STYLE V1 is rectangular like world bars');
  assert.equal(computed(hp,'visibility'),'visible');assert.equal(computed(hp,'opacity'),'1');
  assert.equal(computed(name,'transform'),'none','customized names are level like v2 (ticket 20)');
  m.fire('HPColorsHpTextVisibleEnemyToggle','onactivate');
  assert.equal(computed(hp,'visibility'),'collapse');
  m.fire('HPColorsNameVisibleEnemyToggle','onactivate');
  assert.equal(computed(name,'visibility'),'collapse');
  m.fire('HPColorsBarVisibleEnemyToggle','onactivate');
  assert.equal(computed(primary,'opacity'),'0.01');
  m.fire('HPColorsEnabledToggle','onactivate');
  assert.equal(computed(status,'width'),'100px');assert.equal(computed(status,'marginTop'),'65px');
  assert.equal(computed(primary,'backgroundColor'),'none');assert.equal(computed(primary,'opacityMask'),undefined,'master off stays rectangular like the world baseline');
  assert.equal(computed(name,'visibility'),'visible');
  assert.equal(computed(name,'transform'),'rotateZ(-4deg)','master off returns the stock name tilt');
});

test('live comparison: one uniform layout scale renders the bar, name and readout crisply', () => {
  const m = booted({ previewLayout: true, baseUiScale: 0.8 }); m.open(); m.slider(75);
  const canvas = m.find('HPColorsPreviewCanvas'), scale = m.find('HPColorsPreviewScale');
  assert.equal(computed(scale, 'uiScale'), '142%', 'HERO camera is the fixed live 1:1 canvas mapping, k = 284/200 (ticket 22c live 1:1)');
  assert.equal(computed(scale, 'horizontalAlign'), 'left', 'camera margins place the canvas');
  assert.equal(canvas.GetParent().id, 'HPColorsPreviewScale');
  assert.equal(computed(canvas, 'preTransformScale2d'), undefined, 'no raster magnification');
  assert.equal(computed(canvas, 'transform'), undefined, 'no transformed root origin');
  assert.ok(Math.abs(canvas.actualuiscale_x - 1.136) < 1e-9);
  assert.ok(Math.abs(canvas.actualuiscale_y - 1.136) < 1e-9);
  assert.ok(Math.abs(canvas.actuallayoutwidth - 227.2) < 1e-6);
  assert.ok(Math.abs(canvas.actuallayoutheight - 238.56) < 1e-6);
  assert.equal(m.preview().facts.geometry.canvas.width, 200);
  assert.equal(m.preview().facts.geometry.canvas.height, 210);
  assert.equal(m.preview().facts.geometry.inner.width, 69);
  assert.equal(computed(m.find('HPColorsPreviewBar'), 'width'), '79px');
  assert.equal(computed(m.find('HPColorsPreviewName'), 'fontSize'), '14px');
  assert.equal(m.find('HPColorsPreviewHpText').style.fontSize, m.settings().side.enemy.hpTextSize + 'px');
  m.fire('HPColorsEnabledToggle', 'onactivate');
  assert.equal(computed(scale, 'uiScale'), '142%', 'stock release keeps the same fixed HERO canvas mapping');
});

test('live comparison: realistic names use pinned stock casing and color, stay level like v2, with exact custom-color release', () => {
  const m = booted(); m.open();
  const name = m.find('HPColorsPreviewName');
  assert.equal(name.text, 'Infernus', 'the name matches the Infernus model (ticket 22c)');
  assert.equal(computed(name, 'color').toUpperCase(), '#FF6A6A');
  assert.equal(computed(name, 'textTransform'), undefined, 'pinned CSS does not uppercase engine names');
  assert.equal(computed(name, 'horizontalAlign'), 'center');
  assert.equal(computed(name, 'transform'), 'none');
  m.fire('HPColorsNameColorEnabledEnemyToggle', 'onactivate');
  m.submit('HPColorsNameColorEnemyHex', '#123456');
  assert.equal(name.style.color, '#123456');
  m.submit('HPColorsNameOffsetXEnemyEntry', '12');
  const plan = m.h.$.HPColorsV3Renderer.plan(m.preview().facts, m.settings());
  assert.equal(name.style.transform, plan.styles.name.transform);
  assert.doesNotMatch(name.style.transform, /rotateZ/);
  m.fire('HPColorsNameColorEnabledEnemyToggle', 'onactivate');
  assert.equal(computed(name, 'color').toUpperCase(), '#FF6A6A');
  m.fire('HPColorsPreviewSideOptionAlly', 'onactivate');
  assert.equal(name.text, 'Infernus');
  assert.equal(computed(name, 'color').toUpperCase(), '#FFEFD7');
  m.fire('HPColorsNameColorEnabledAllyToggle', 'onactivate');
  m.submit('HPColorsNameColorAllyHex', '#654321');
  assert.equal(name.style.color, '#654321');
  m.fire('HPColorsEnabledToggle', 'onactivate');
  assert.equal(computed(name, 'color').toUpperCase(), '#FFEFD7');
});

test('live comparison: native 250-HP ticks include 1000-HP large ticks and follow sample max HP, not current HP', () => {
  const m = booted(); m.open();
  m.fire('HPColorsEnabledToggle','onactivate'); // This case checks the stock preview, not contained custom lines.
  const lines = m.find('HPColorsPreviewBarLines');
  function check(maxHp, objective = false) {
    assert.equal(lines.Children().length, Math.floor(maxHp / 250));
    lines.Children().forEach((line, i) => {
      assert.equal(line.id, 'HPColorsPreviewBarTick' + (i + 1));
      assert.equal(line.style.position, (250 * (i + 1) / maxHp * 100) + '% 0px 0px');
      const large = (i + 1) % 4 === 0;
      assert.equal(computed(line, 'height'), large ? '100px' : '4px');
      assert.equal(computed(line, 'width'), objective ? large ? '1.5px' : '1px' : '2px');
      assert.equal(computed(line, 'backgroundColor').toUpperCase(), '#FFEFD7');
      assert.equal(computed(line, 'washColor'), 'rgb(80, 2, 2)');
      assert.equal(computed(line, 'opacity'), '0.6');
    });
  }
  check(1000);
  const heroTicks = [...lines.Children()];
  m.slider(25); m.play(); m.play();
  check(1000);
  assert.ok(lines.Children().every((line, i) => line === heroTicks[i]), 'HP edits/play do not recreate ticks');
  m.fire('HPColorsNavUnitsButton', 'onactivate'); check(600);
  m.fire('HPColorsPreviewKindOptionObjective', 'onactivate'); check(4000, true);
  m.fire('HPColorsPreviewSideOptionAlly', 'onactivate');
  for (const line of lines.Children()) {
    assert.equal(computed(line, 'washColor'), 'rgb(4, 37, 23)');
    assert.equal(computed(line, 'opacity'), '0.8');
  }
  m.fire('HPColorsNavBarButton', 'onactivate');
  assert.equal(lines.Children().length, 4);
});

test('live comparison: representative teams preserve team-high color precedence', () => {
  const m = booted(); m.open(); m.slider(100);
  assert.equal(m.preview().facts.team, 'team2');
  m.fire('HPColorsBarColorTeamHighEnemyToggle', 'onactivate');
  assert.equal(m.fill().washColor.toUpperCase(), '#5B79E6');
  m.submit('HPColorsBarColorHighEnemyHex', '#00FF00');
  assert.equal(m.fill().washColor.toUpperCase(), '#5B79E6', 'team-high takes precedence');
  m.fire('HPColorsBarColorTeamHighEnemyToggle', 'onactivate');
  assert.equal(m.fill().washColor.toUpperCase(), '#00FF00');
  m.fire('HPColorsPreviewSideOptionAlly', 'onactivate');
  assert.equal(m.preview().facts.team, 'team1');
  m.fire('HPColorsBarColorEnabledAllyToggle', 'onactivate');
  m.fire('HPColorsBarColorTeamHighAllyToggle', 'onactivate');
  assert.equal(m.fill().washColor.toUpperCase(), '#E7B659');
});

test('live comparison: missing HP stays black and the outline mirrors the world overlay without consuming layout', () => {
  const m = booted(); m.open(); m.slider(50);
  const inner = m.find('HPColorsPreviewBarInner'), primary = m.find('HPColorsPreviewBar'), outline = m.find('HPColorsPreviewBarOutline');
  assert.equal(computed(inner, 'backgroundColor').toUpperCase(), '#000000');
  // Ticket 19 (user decision): the preview follows BAR STYLE; the default V1 is unmasked.
  for (const panel of [inner, outline, primary, m.find('HPColorsPreviewBarLines')]) assert.equal(computed(panel, 'opacityMask'), undefined, panel.id);
  assert.equal(computed(primary, 'backgroundColor'), '#00000000');
  assert.equal(computed(outline, 'ignoreParentFlow'), 'true');
  assert.equal(computed(outline, 'zIndex'), '-1');
  assert.equal(outline.style.backgroundColor, '#10130D');
  m.submit('HPColorsBarOutlineThicknessEnemyEntry', '3');
  const plan = m.h.$.HPColorsV3Renderer.plan(m.preview().facts, m.settings());
  for (const [key, value] of Object.entries(plan.styles.outline)) assert.equal(outline.style[key], value, key);
  m.fire('HPColorsBarOutlineCustomColorEnemyToggle', 'onactivate');
  m.submit('HPColorsBarOutlineColorEnemyHex', '#112233');
  assert.equal(outline.style.backgroundColor, '#112233');
  m.fire('HPColorsBarOutlineEnabledEnemyToggle', 'onactivate');
  assert.equal(computed(outline, 'visibility'), 'collapse');
  assert.equal(computed(inner, 'backgroundColor').toUpperCase(), '#000000');
});

test('live 2026-10-14: hero bar centre sits 6.5px right of the canvas/name centre like world bars (13px player inset)', () => {
  const m = booted({ previewLayout: true }); m.open(); m.slider(75);
  m.submit('HPColorsBarOffsetXEnemyEntry', '0'); m.submit('HPColorsBarOffsetYEnemyEntry', '0');
  const g = m.preview().facts.geometry;
  const cx = g.status.x + g.info.x + g.stack.x + g.primary.x + g.primary.width / 2;
  const sx = m.settings().side.enemy.barWidth / 79;
  const tx = Number(m.find('HPColorsPreviewBars').style.transform.match(/translate3d\(([-\d.]+)px/)[1]);
  const paintedCentre = g.canvas.width / 2 + (cx - g.canvas.width / 2) * sx + tx;
  assert.ok(Math.abs(paintedCentre - (g.canvas.width / 2 + 6.5)) <= 1, 'bar centre=' + paintedCentre);
  assert.equal(computed(m.find('HPColorsPreviewName'), 'horizontalAlign'), 'center');
  m.h.$.HPColorsV3Preview.setSettings(m.settings()); m.h.$.HPColorsV3Preview.setSettings(m.settings());
  assert.equal(m.preview().facts.geometry.primary.x, g.primary.x, 'repainting does not measure its own transform');
});

test('live follow-up: tick overlay is clipped to the fill bounds instead of dangling below the bar', () => {
  const m = booted({ previewLayout: true }); m.open(); m.slider(75);
  m.fire('HPColorsEnabledToggle','onactivate'); // Unowned stock ticks retain their inner-height preview geometry.
  const inner = m.find('HPColorsPreviewBarInner'), lines = m.find('HPColorsPreviewBarLines');
  for (const key of ['width', 'height', 'marginTop', 'marginLeft']) assert.equal(computed(lines, key), computed(inner, key), key);
  assert.equal(computed(lines, 'ignoreParentFlow'), 'true');
  assert.equal(computed(lines, 'overflow'), 'clip');
  const top = parseFloat(computed(lines, 'marginTop')), height = parseFloat(computed(lines, 'height'));
  for (const line of lines.Children()) {
    const tickHeight = parseFloat(computed(line, 'height'));
    const tickTop = top + (computed(line, 'verticalAlign') === 'bottom' ? height - tickHeight : 0);
    assert.ok(Math.min(top + height, tickTop + tickHeight) > Math.max(top, tickTop), 'tick intersects the bar');
    if (tickHeight === 4) assert.ok(tickTop >= top && tickTop + tickHeight <= top + height, 'small tick stays entirely inside the bar');
  }
});

test('live follow-up: 75% gradient honors the team-high setting independently of team identity', () => {
  const m = booted({ previewLayout: true }); m.open();
  const config = m.settings();
  config.side.enemy.barColorMode = 'gradient'; config.side.enemy.barColorTeamHigh = true;
  m.h.$.HPColorsV3Preview.setSettings(config); m.slider(75);
  assert.equal(m.preview().facts.team, 'team2');
  assert.equal(m.preview().facts.side, 'enemy');
  assert.equal(m.preview().facts.fraction, 0.75);
  assert.equal(m.fill().washColor.toUpperCase(), '#D07A42');
  config.side.enemy.barColorTeamHigh = false;
  m.h.$.HPColorsV3Preview.setSettings(config);
  assert.equal(m.fill().washColor.toUpperCase(), '#B6A100', 'known team never overrides an off team-high setting');
});

test('live HP alignment: small ticks are bottom-aligned lower-third notches', () => {
  const m = booted({ previewLayout: true }); m.open();
  m.fire('HPColorsEnabledToggle','onactivate'); // Stock lower-third notches; owned lines match v2's outer-height containment.
  const lines = m.find('HPColorsPreviewBarLines');
  for (const tick of lines.Children().filter(line => line.BHasClass('HPC3PreviewTickSmall'))) {
    assert.equal(computed(tick, 'verticalAlign'), 'bottom');
    assert.equal(parseFloat(computed(tick, 'height')) / parseFloat(computed(lines, 'height')), 1 / 3);
  }
});

test('live HP alignment: late/unlaid row measurement is retried after readout layout changes and remains bounded', () => {
  const m = booted({ previewLayout: true }); m.open();
  while (m.jobs().length) m.h.scheduler.runNext();
  const config = m.settings(); config.side.enemy.hpTextSize = 20;
  m.h.$.HPColorsV3Preview.setSettings(config);
  assert.equal(m.jobs().length, 1, 'a laid row must also be re-measured after font changes');
  m.h.scheduler.runNext();
  assert.equal(m.jobs().length, 0);
  const row = m.find('HPColorsPreviewReadoutLine');
  const width = Object.getOwnPropertyDescriptor(row, 'actuallayoutwidth').get;
  let rowLaid = false;
  Object.defineProperty(row, 'actuallayoutwidth', { configurable: true, get: () => rowLaid ? width() : 0 });
  config.side.enemy.hpTextSize = 22;
  m.h.$.HPColorsV3Preview.setSettings(config);
  assert.equal(m.preview().facts.row.width, 36, 'audit 21: an unlaid row keeps its last laid size (v2) instead of clamping from 0');
  assert.equal(m.jobs().length, 1, 'font/layout changes must re-sample after native layout settles');
  rowLaid = true; m.h.scheduler.runNext();
  assert.equal(m.preview().facts.row.width, 36, 'UI scale is normalized in the settled row');
  assert.equal(m.jobs().length, 0);
  rowLaid = false; m.h.$.HPColorsV3Preview.setSettings(config);
  let retries = 0;
  while (m.jobs().length && retries < 20) { m.h.scheduler.runNext(); retries++; }
  assert.ok(retries <= 5, 'zero-width readout never creates an unbounded loop');
  assert.equal(m.preview().facts.row.width, 36, 'the last laid size still places the row');
  assert.equal(m.jobs().length, 0);
});

test('live HP alignment: preview HP right edge preserves the world fixture bar-edge relation and user offsets', () => {
  const m = booted({ previewLayout: true, baseUiScale: 0.8 }); m.open(); m.slider(75);
  const config = m.settings(), facts = m.preview().facts;
  function edgeGap(input, plan) {
    const g = input.geometry, sx = config.side.enemy.barWidth / 79;
    const cx = g.status.x + g.info.x + g.stack.x + g.primary.x + g.primary.width / 2;
    const barRight = cx + config.side.enemy.barOffsetX + (g.inner.x + g.inner.width - g.primary.width / 2) * sx;
    const rowX = Number(plan.styles.row.transform.match(/translate3d\(([-\d.]+)px/)[1]);
    const glyphRight = g.canvas.width + rowX - 4; // The native readout's 4 px right padding.
    return glyphRight - barRight;
  }
  const worldFacts = JSON.parse(JSON.stringify(facts));
  worldFacts.geometry.primary.x += 6.5; // Stock world fixture keeps the 13 px centered margin.
  for (const x of [18, 0, -10, 30]) {
    config.side.enemy.hpTextOffsetX = x;
    m.h.$.HPColorsV3Preview.setSettings(config);
    const previewPlan = m.h.$.HPColorsV3Renderer.plan(m.preview().facts, config);
    const worldPlan = m.h.$.HPColorsV3Renderer.plan(worldFacts, config);
    assert.ok(Math.abs(edgeGap(m.preview().facts, previewPlan) - edgeGap(worldFacts, worldPlan)) <= 1,
      'preview and world glyph-right vs bar-right relation at HP X=' + x);
    if (x === 18) assert.ok(Math.abs(edgeGap(m.preview().facts, previewPlan) - 3.6) <= 1, 'default glyph edge is just beyond the bar');
  }
});

test('live ult badge: hero mirrors the stock ready Image, assets, relation wash and badge origin', () => {
  const m = booted({ previewLayout: true }); m.open();
  const panel = m.find('HPColorsPreviewUltPanel'), bg = m.find('HPColorsPreviewUltBackground'), ready = m.find('HPColorsPreviewUltReady');
  assert.equal(panel.GetParent().id, 'HPColorsPreviewInfo');
  assert.ok(bg.GetParent() === panel);
  assert.ok(ready.GetParent() === bg);
  assert.equal(ready.paneltype, 'Image');
  assert.equal(computed(panel, 'visibility'), 'visible');
  assert.equal(computed(ready, 'visibility'), 'visible');
  assert.equal(computed(panel, 'width'), '20px');
  assert.equal(computed(panel, 'height'), 'width-percentage(100%)');
  assert.ok(Math.abs(ready.actuallayoutwidth - 28.4) < 1e-9, '20px badge at the fixed 142% HERO canvas mapping (ticket 22c live 1:1)');
  assert.ok(Math.abs(ready.actuallayoutheight - 28.4) < 1e-9);
  assert.equal(computed(panel, 'horizontalAlign'), 'left');
  assert.equal(computed(panel, 'verticalAlign'), 'top');
  assert.equal(computed(panel, 'marginLeft'), '38.44px');
  assert.equal(computed(panel, 'marginTop'), '61.3px');
  assert.equal(computed(bg, 'backgroundImage'), 'url("s2r://panorama/images/hud/icons/icon_ultimate_off_blk.vsvg")');
  assert.equal(computed(ready, 'backgroundImage'), 'url("s2r://panorama/images/hud/icons/icon_ultimate_blk.vsvg")');
  assert.equal(computed(ready, 'brightness'), '2');
  assert.equal(computed(ready, 'washColor').toUpperCase(), '#B6A100');
  m.fire('HPColorsPreviewSideOptionAlly', 'onactivate');
  assert.equal(computed(ready, 'visibility'), 'visible');
  assert.equal(computed(ready, 'washColor').toUpperCase(), '#FFEFD7');
  m.fire('HPColorsEnabledToggle', 'onactivate');
  assert.equal(computed(panel, 'horizontalAlign'), 'left');
  assert.equal(computed(panel, 'verticalAlign'), 'middle');
  assert.equal(computed(panel, 'marginTop'), '-14px');
  assert.equal(computed(ready, 'visibility'), 'visible', 'master-off restores a stock ready hero badge');
});

test('live ult badge: ready badge is visually absent on NPC/objective and returns on hero', () => {
  const m = booted(); m.open();
  const panel = m.find('HPColorsPreviewUltPanel'), ready = m.find('HPColorsPreviewUltReady');
  m.fire('HPColorsNavUnitsButton', 'onactivate');
  assert.equal(computed(panel, 'visibility'), 'collapse');
  assert.equal(computed(ready, 'visibility'), 'collapse');
  m.fire('HPColorsPreviewKindOptionObjective', 'onactivate');
  assert.equal(computed(panel, 'visibility'), 'collapse');
  assert.equal(computed(ready, 'visibility'), 'collapse');
  m.fire('HPColorsNavBarButton', 'onactivate');
  assert.equal(computed(panel, 'visibility'), 'visible');
  assert.equal(computed(ready, 'visibility'), 'visible');
});

test('Indicators preview paints engine line washes, multiplied opacity and the threshold-positioned enemy marker',()=>{
  const m=booted({previewLayout:true});m.open();m.fire('HPColorsNavIndicatorsButton','onactivate');
  const lines=m.find('HPColorsPreviewBarLines'), marker=m.find('HPColorsPreviewKillMarker');
  m.submit('HPColorsLineColorEnemyHex','#123456');m.submit('HPColorsLineOpacityEnemyEntry',40);
  for(const line of lines.Children()) {
    assert.equal(line.style.washColor,'#123456');assert.equal(computed(line,'opacity'),'0.6');
    assert.equal(line.style.opacity,undefined);
    assert.equal(computed(line,'height'),line.BHasClass('line_large')?'100%':'8px');
  }
  assert.equal(lines.style.opacity,'0.4');assert.equal(computed(lines,'height'),'100%');
  m.fire('HPColorsKillMarkerEnabledEnemyToggle','onactivate');m.submit('HPColorsKillMarkerThresholdEnemyEntry',50);
  m.submit('HPColorsKillMarkerWidthEnemyEntry',2);m.submit('HPColorsKillMarkerColorEnemyHex','#ABCDEF');
  m.h.scheduler.runFor(1000);
  assert.equal(marker.style.marginLeft,'39.5px');assert.equal(marker.style.width,'2px');
  assert.equal(marker.style.backgroundColor,'#ABCDEF');assert.equal(computed(marker,'visibility'),'visible');
  m.slider(100);assert.equal(computed(marker,'visibility'),'visible');m.slider(0);assert.equal(computed(marker,'visibility'),'visible');
  m.fire('HPColorsLineColorEnabledAllyToggle','onactivate');m.submit('HPColorsLineColorAllyHex','#654321');m.submit('HPColorsLineOpacityAllyEntry',25);
  assert.equal(m.preview().side,'ally');assert.equal(computed(marker,'visibility'),'collapse');assert.equal(lines.style.opacity,'0.25');
  for(const line of lines.Children()){assert.equal(line.style.washColor,'#654321');assert.equal(computed(line,'opacity'),'0.8');}
  m.fire('HPColorsLinesVisibleAllyToggle','onactivate');assert.equal(computed(lines,'visibility'),'collapse');
  m.fire('HPColorsEnabledToggle','onactivate');
  assert.equal(lines.style.opacity,'');assert.equal(computed(lines,'height'),'12px');assert.equal(computed(lines,'marginTop'),'3.5px');
  assert.equal(marker.style.marginLeft,'');assert.equal(marker.style.width,'');assert.equal(marker.style.backgroundColor,'');
  for(const line of lines.Children()){
    assert.equal(line.style.washColor,'');assert.equal(computed(line,'washColor'),'rgb(4, 37, 23)');
    assert.equal(computed(line,'height'),line.BHasClass('line_large')?'100px':'4px');
  }
  m.fire('HPColorsNavUnitsButton','onactivate');m.fire('HPColorsPreviewKindOptionObjective','onactivate');
  assert.equal(computed(marker,'visibility'),'collapse');
});

test('Indicators preview shares level and ultimate placement/color/scale plan and exact stock release',()=>{
  const m=booted({previewLayout:true});m.open();m.fire('HPColorsNavIndicatorsButton','onactivate');m.h.scheduler.runFor(1000,10000);
  const level=m.find('HPColorsPreviewLevel'), label=m.find('HPColorsPreviewLevelLabel');
  const ult=m.find('HPColorsPreviewUltPanel'), ready=m.find('HPColorsPreviewUltReady'), background=m.find('HPColorsPreviewUltBackground');
  assert.equal(label.text,'19');assert.equal(computed(level,'visibility'),'visible');
  assert.equal(level.style.border,'2px solid #ff8c00');assert.equal(level.style.marginLeft,'15.44px');
  assert.equal(ult.style.marginLeft,'38.44px');assert.equal(ready.style.washColor,'#b6a100');
  m.fire('HPColorsUltModeOptionCustom','onactivate');m.submit('HPColorsUltCustomHex','#112233');m.submit('HPColorsUltSizeEntry',30);
  m.submit('HPColorsUltOffsetXEntry',12);m.submit('HPColorsLevelOffsetYEnemyEntry',5);
  assert.equal(ready.style.washColor,'#112233');assert.equal(background.style.preTransformScale2d,'1.5');
  assert.equal(ult.style.marginLeft,'43.04px');assert.equal(level.style.marginTop,'68.7px');
  m.fire('HPColorsLevelsVisibleEnemyToggle','onactivate');assert.equal(computed(level,'visibility'),'collapse');
  m.fire('HPColorsEnabledToggle','onactivate');
  assert.equal(computed(level,'visibility'),'collapse');assert.equal(level.style.border,'');
  assert.equal(ult.style.marginLeft,'');assert.equal(background.style.preTransformScale2d,'');
  assert.equal(ready.style.washColor,'');assert.equal(computed(ready,'visibility'),'visible');
});

test('Indicators preview uses the real stamina plan for all shapes and restores stock on ally/master-off',()=>{
  const m=booted({previewLayout:true});m.open();m.fire('HPColorsNavIndicatorsButton','onactivate');
  const stamina=m.find('HPColorsPreviewStamina'),pips=stamina.Children();
  assert.equal(pips.length,3);
  m.fire('HPColorsStaminaColorEnabledEnemyToggle','onactivate');m.submit('HPColorsStaminaColorEnemyHex','#234567');
  m.submit('HPColorsStaminaWidthEnemyEntry',22);m.submit('HPColorsStaminaHeightEnemyEntry',8.96);
  m.submit('HPColorsStaminaOffsetXEnemyEntry',12.3);m.submit('HPColorsStaminaOffsetYEnemyEntry',-4.7);
  for(const shape of ['Arrow','Circle','Box']) {
    m.fire('HPColorsStaminaShapeEnemyOption'+shape,'onactivate');m.h.scheduler.runFor(600);
    assert.equal(stamina.style.transform,'translate3d(12.3px, -4.7px, 0px)');
    pips.forEach((pip,i)=>{
      const icon=pip.Children()[0];
      assert.equal(icon.style.width,shape==='Arrow'?'16px':'22px');assert.equal(icon.style.height,shape==='Arrow'?'24px':'8.96px');
      assert.equal(icon.style.washColor,shape==='Arrow'?(i===2?'#10130D':'#234567'):'#FFFFFF');
      if(shape!=='Arrow') {
        assert.equal(computed(icon,'backgroundColor'),i===2?'#000000':'#FFFFFF');
        assert.equal(stamina.style.washColor,'#234567');
        assert.equal(computed(icon,'backgroundImage'),'none');
        assert.equal(computed(icon,'borderRadius'),shape==='Circle'?'50%':'0px');
      }
      assert.equal(computed(pip,'visibility'),'visible');assert.equal(icon.GetAttributeString('hittest',''),'false');
    });
  }
  assert.equal(computed(stamina,'marginTop'),'9px','native stamina origin matches the world stylesheet');
  assert.deepEqual(JSON.parse(JSON.stringify(m.preview().facts.stamina)),[false,false,false],'mutable shape states are CSS-owned');
  m.fire('HPColorsPreviewSideOptionAlly','onactivate');
  assert.equal(stamina.style.transform,'');assert.equal(pips[0].Children()[0].style.width,'');
  m.fire('HPColorsPreviewSideOptionEnemy','onactivate');m.fire('HPColorsEnabledToggle','onactivate');
  assert.equal(stamina.style.transform,'');assert.equal(pips[0].Children()[0].style.backgroundColor,'');
  assert.match(computed(pips[0].Children()[0],'backgroundImage'),/pip_stamina_filled/);
});

test('ticket 35: the preview team switch is session-only, follows the side and drives team colors',()=>{
  const m=booted({previewLayout:true});m.open();m.fire('HPColorsNavHPTextButton','onactivate');
  const amber=m.find('HPColorsPreviewTeamOptionAmber'),sapphire=m.find('HPColorsPreviewTeamOptionSapphire'),value=m.find('HPColorsPreviewHpText');
  assert.equal(m.preview().facts.team,'team2','enemy starts Sapphire');
  assert.equal(sapphire.BHasClass('Selected'),true);assert.equal(amber.BHasClass('Selected'),false);
  m.fire('HPColorsHpTextColorModeEnemyOptionTeam','onactivate');
  assert.equal(value.style.washColor.toUpperCase(),'#5B79E6');
  const before=JSON.stringify(m.settings()),undo=m.find('HPColorsUndoButton').enabled;
  m.fire('HPColorsPreviewTeamOptionAmber','onactivate');
  assert.equal(m.preview().facts.team,'team1');assert.equal(value.style.washColor.toUpperCase(),'#E7B659');
  assert.equal(amber.BHasClass('Selected'),true);assert.equal(sapphire.BHasClass('Selected'),false);
  assert.equal(JSON.stringify(m.settings()),before,'the team switch is never a setting');
  assert.equal(m.find('HPColorsUndoButton').enabled,undo,'the team switch adds no Undo step');
  m.submit('HPColorsTeamAmberColorHex','#ABCDEF');assert.equal(value.style.washColor,'#ABCDEF','editable team color reaches the preview');
  m.fire('HPColorsPreviewSideOptionAlly','onactivate');assert.equal(m.preview().facts.team,'team1','ally starts Amber');
  m.fire('HPColorsPreviewTeamOptionSapphire','onactivate');assert.equal(m.preview().facts.team,'team2');
  m.fire('HPColorsPreviewSideOptionEnemy','onactivate');assert.equal(m.preview().facts.team,'team2','a side change restores that side\'s team');
  m.fire('HPColorsNavUnitsButton','onactivate');m.fire('HPColorsPreviewKindOptionNeutral','onactivate');
  assert.equal(computed(m.find('HPColorsPreviewTeamSegment'),'visibility'),'collapse','neutral camps have no team');
});

test('ticket 35: preview shows ally stamina and the low-stamina color from the real plan',()=>{
  const m=booted({previewLayout:true});m.open();m.fire('HPColorsNavIndicatorsButton','onactivate');
  const stamina=m.find('HPColorsPreviewStamina'),icons=stamina.Children().map(pip=>pip.Children()[0]);
  m.fire('HPColorsPreviewSideOptionAlly','onactivate');
  m.fire('HPColorsStaminaColorEnabledAllyToggle','onactivate');m.submit('HPColorsStaminaColorAllyHex','#70F8C1');
  assert.deepEqual(icons.map(icon=>icon.style.washColor),['#70F8C1','#70F8C1','#10130D'],'ally preview paints ally stamina');
  m.submit('HPColorsStaminaLowThresholdAllyEntry',2);m.submit('HPColorsStaminaLowColorAllyHex','#ABCDEF');
  assert.deepEqual(icons.map(icon=>icon.style.washColor),['#ABCDEF','#ABCDEF','#10130D'],'2 of 3 charges at threshold 2 is low; the empty charge stays stock');
  assert.equal(m.h.contextPanel.FindChildTraverse('HPColorsStaminaLowEmptyAllyToggle'),null,'ticket 36 removed the empty-charge option');
  m.fire('HPColorsPreviewSideOptionEnemy','onactivate');
  assert.equal(icons[0].style.washColor,'','enemy defaults keep the enemy preview stock');
});

test('Indicators HP slider drives the same pulse classes, color overlay and native label outline as world bars',()=>{
  const m=booted({previewLayout:true});m.open();m.fire('HPColorsNavIndicatorsButton','onactivate');
  const fill=m.find('HPColorsPreviewBarFill'),label=m.find('HPColorsPreviewHpText');
  m.fire('HPColorsPulseReadoutEnemyToggle','onactivate');m.fire('HPColorsPulseColorEnabledEnemyToggle','onactivate');
  m.submit('HPColorsHpTextOutlineEnemyEntry',7.5);m.submit('HPColorsPulseBpmEnemyEntry',120);
  m.slider(25);
  assert.equal(computed(fill,'animationName'),'HPColorsV3PulseMedium');assert.equal(fill.style.animationDuration,'0.500s');
  assert.equal(computed(label,'animationName'),'HPColorsV3PulseMedium');assert.equal(label.style.textShadow,'0px 0px 0px 7.5 #10130D');
  const overlay=m.find('HPColorsPreviewPulseOverlay');assert.equal(computed(overlay,'visibility'),'visible');
  assert.equal(overlay.style.clip,'rect(0%, 25%, 100%, 0%)');assert.equal(computed(overlay,'animationName'),'HPColorsV3ColorPulseMedium');
  m.slider(26);assert.ok(!fill.BHasClass('HPColorsV3Pulse'));assert.equal(computed(overlay,'visibility'),'collapse');
  m.slider(10);m.fire('HPColorsEnabledToggle','onactivate');
  assert.ok(!fill.BHasClass('HPColorsV3Pulse'));assert.ok(!label.BHasClass('HPColorsV3Pulse'));assert.equal(label.style.textShadow,'');
});

test('pickup, rejuvenator and flame samples run the same renderer plan and release on master-off',()=>{
  const m=booted({previewLayout:true});m.open();m.fire('HPColorsNavIndicatorsButton','onactivate');
  const flame=m.find('HPColorsPreviewKillStreak'),ult=m.find('HPColorsPreviewUltPanel'),rejuv=m.find('HPColorsPreviewRejuvenator');
  assert.ok(flame.GetParent()===ult);assert.equal(computed(flame,'visibility'),'visible');
  assert.equal(computed(flame,'marginTop'),'-20px','flame sits 7.5px above centre');assert.equal(computed(flame,'verticalAlign'),'top');assert.equal(computed(flame,'marginLeft'),'0px');assert.equal(computed(flame,'zIndex'),'2');
  m.submit('HPColorsUltSizeEntry',40);assert.equal(flame.style.preTransformScale2d,'2');
  for(const [id,value] of Object.entries({HPColorsPickupSizeEntry:32,HPColorsPickupSpacingEntry:4,HPColorsPickupOffsetXEntry:15,HPColorsPickupOffsetYEntry:20,HPColorsPickupGunColorHex:'#204080',HPColorsPickupBackgroundDarknessEntry:50,HPColorsPickupGlyphColorHex:'#123456',HPColorsRejuvOffsetXEntry:25,HPColorsRejuvOffsetYEntry:-30,HPColorsRejuvTiltEntry:45,HPColorsRejuvSizeEntry:36}))m.submit(id,value);
  const icon=m.find('HPColorsPreviewPickupGun');
  assert.ok(!icon.style.width&&!icon.style.height,'pickups keep the status-effect size; pickup size is the top bar\'s');assert.ok(!icon.style.margin,'and the row\'s gaps; pickup spacing is the top bar\'s');assert.ok(!icon.style.transform,'icons stay in their row');
  assert.equal(m.find('HPColorsPreviewPickups').style.transform,'translate3d(15px, 20px, 0px)','the whole status-effect row moves');
  // The ordinary debuff sample (stock 30px, as the game draws one) rides in the same row and takes no pickup styling.
  const effect=m.find('HPColorsPreviewEffect');assert.ok(effect.GetParent()===m.find('HPColorsPreviewPickups'));
  assert.ok(!effect.style.width&&!effect.style.margin,'pickup size and spacing leave the debuff sample alone');assert.equal(m.find('HPColorsPreviewEffectStacks').text,'3');
  assert.equal(m.find('HPColorsPreviewPickupGunInner').style.washColor,'#204080');
  assert.equal(m.find('HPColorsPreviewPickupGunBorder').style.washColor,'#FFEFD7');
  assert.equal(m.find('HPColorsPreviewPickupGunTrack').style.washColor,'#102040');
  assert.equal(m.find('HPColorsPreviewPickupGunGlyph').style.washColor,'#123456');
  assert.equal(rejuv.style.transform,'rotateZ(45deg)');assert.equal(rejuv.style.preTransformScale2d,'1.5');
  assert.equal(rejuv.GetParent().style.transform,'translate3d(25px, -30px, 0px)');
  m.fire('HPColorsEnabledToggle','onactivate');
  assert.ok(flame.GetParent()===m.find('HPColorsPreviewCanvas'));assert.ok(rejuv.GetParent()===m.find('HPColorsPreviewCanvas'));
  assert.ok(!icon.style.width);assert.ok(!rejuv.style.preTransformScale2d);
});

test('all pickup preview samples match bright world discs, light progress and full dark tracks and restore on either off switch',()=>{
  const m=booted({previewLayout:true});
  const samples=['Gun','Movement','Spirit','Survival'].map(name=>Object.fromEntries(['','Inner','Border','Track','Glyph'].map(suffix=>[suffix||'Icon',m.find('HPColorsPreviewPickup'+name+suffix)])));
  const keys=['washColor','backgroundImage','backgroundSize','backgroundTextureSize','zIndex','clip','width','height','margin','transform'];
  const snapshot=sample=>Object.fromEntries(Object.entries(sample).map(([part,panel])=>[part,keys.map(key=>computed(panel,key))]));
  const stock=samples.map(snapshot);
  m.open();m.fire('HPColorsNavIndicatorsButton','onactivate');
  const colors=['#EC9719','#6E65EA','#CE90FF','#7BBA1D'];
  samples.forEach(({Inner,Border,Track,Glyph},i)=>{
    assert.equal(Inner.style.washColor,colors[i]);assert.equal(Border.style.washColor,'#FFEFD7');assert.equal(Glyph.style.washColor,'#10130D');
    assert.equal(Track.style.washColor,['#472D08','#211E46','#3E2B4D','#253809'][i]);
    assert.equal(computed(Inner,'backgroundImage'),'url("s2r://panorama/images/hud/world_space/status_inner_psd.vtex")','stock disc artwork leaves room for the outer ring');
    for(const ring of [Track,Border]){
      assert.equal(computed(ring,'backgroundImage'),'url("s2r://panorama/images/hud/world_space/status_border.vsvg")');
      assert.equal(computed(ring,'backgroundSize'),'100%');
    }
    assert.equal(computed(Track,'clip'),'none');assert.equal(computed(Border,'clip'),'radial(50% 50%, 0deg, 270deg)');
    assert.equal(computed(Track,'zIndex'),'-3');assert.equal(computed(Border,'zIndex'),'-2','progress overlays the full track');
  });
  const before=samples.map(({Track,...rest})=>snapshot(rest));
  m.submit('HPColorsPickupBackgroundDarknessEntry',50);
  samples.forEach(({Track,...rest},i)=>{
    assert.deepEqual(snapshot(rest),before[i],'darkness changes only the track');
    assert.equal(Track.style.washColor,['#764C0D','#373375','#674880','#3E5D0F'][i]);
  });
  for(const name of ['Gun','Movement','Spirit','Survival'])m.submit('HPColorsPickup'+name+'ColorHex','#204080');
  m.submit('HPColorsPickupGlyphColorHex','#123456');
  samples.forEach(({Inner,Border,Track,Glyph})=>{
    assert.equal(Inner.style.washColor,'#204080');assert.equal(Border.style.washColor,'#FFEFD7');
    assert.equal(Track.style.washColor,'#102040');assert.equal(Glyph.style.washColor,'#123456');
  });
  m.fire('HPColorsPickupTimersEnabledToggle','onactivate');assert.deepEqual(samples.map(snapshot),stock);
  m.fire('HPColorsPickupTimersEnabledToggle','onactivate');assert.equal(samples[0].Track.style.washColor,'#102040');
  m.fire('HPColorsEnabledToggle','onactivate');assert.deepEqual(samples.map(snapshot),stock);
});

test('ultimate preview uses world artwork and releases on timer/master-off',()=>{
  const m=booted({previewLayout:true});m.open();m.fire('HPColorsNavIndicatorsButton','onactivate');
  const overlay=m.find('HPColorsPreviewUltimateOverlay');
  assert.equal(overlay.style.visibility,'visible');assert.equal(m.find('HPColorsPreviewUltimateFill').style.clip,'radial(50% 50%, 0deg, 180deg)');
  m.fire('HPColorsUltimateTimerEnabledToggle','onactivate');assert.equal(overlay.style.visibility,'collapse');
  m.fire('HPColorsUltimateTimerEnabledToggle','onactivate');m.fire('HPColorsEnabledToggle','onactivate');assert.equal(overlay.style.visibility,'collapse');
});

// Live 6779: Panorama rejects null/"" on a style alias alone ("Cannot set a property alias to undefined,
// only a base property"); borderColor is an alias of border. Model that on the preview stamina icons.
const STYLE_ALIAS_KEYS = new Set(['borderColor', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'fontSize', 'fontFamily', 'animationDuration', 'animationName']);
function strictAliases(panel) {
  const store = Object.assign({}, panel.style);
  panel.style = new Proxy(store, { set(target, key, value) {
    if (STYLE_ALIAS_KEYS.has(key) && (value === null || value === '')) throw new Error('Cannot set a property alias to undefined, only a base property (' + key + ')');
    if (key === 'border' && value === null) { for (const k of Object.keys(target)) if (/^border/.test(k)) delete target[k]; return true; }
    if (value === null) delete target[key]; else target[key] = value; return true;
  } });
}

test('live 6779: preview survives a shaped-stamina release on Units -> Bar (borderColor is a style alias)', () => {
  const m = booted({ previewLayout: true }); m.open();
  for (let i = 1; i <= 4; i++) { const icon = m.h.contextPanel.FindChildTraverse('HPColorsPreviewStaminaIcon' + i); if (icon) strictAliases(icon); }
  m.fire('HPColorsNavIndicatorsButton', 'onactivate');
  m.fire('HPColorsStaminaShapeEnemyOptionCircle', 'onactivate');
  const icon = m.find('HPColorsPreviewStaminaIcon1');
  assert.equal(icon.style.borderColor, '#FFFFFF');
  m.fire('HPColorsNavUnitsButton', 'onactivate');
  assert.equal(icon.style.borderColor, undefined, 'NPC preview releases the owned alias');
  m.fire('HPColorsNavBarButton', 'onactivate');
  assert.ok(m.preview().painted, 'hero preview repaints after the round trip');
  assert.equal(icon.style.borderColor, '#FFFFFF');
  m.fire('HPColorsStaminaShapeEnemyOptionArrow', 'onactivate');
  assert.ok(m.preview().painted, 'shaped -> arrow release keeps painting');
  assert.equal(icon.style.borderColor, undefined);
});

// 2026-10-29 (user): customized unit bars keep the stock 79x18 bar at its stock spot, so the unit camera is fixed:
// player bar size and offset never move it, and the stock bar plus its accessories fit the stage.
test('unit-kind preview camera stays fixed on the stock bar and fits it with its accessories inside the stage', () => {
  const m = booted({ previewLayout: true }); m.open();
  m.fire('HPColorsNavUnitsButton', 'onactivate');
  const gate = key => m.h.$.HPColorsV3Settings.controls.find(r => r.key === key && (r.side === 'enemy' || r.side === 'shared'));
  const scale = m.find('HPColorsPreviewScale'), canvas = m.find('HPColorsPreviewCanvas');
  const zoom = () => parseFloat(computed(scale, 'uiScale')) / 100;
  const fits = label => {
    const z = zoom(), dy = parseFloat(computed(canvas, 'marginTop')), dx = parseFloat(computed(canvas, 'marginLeft'));
    // Stock bar box plus the measured accessory room, mapped into stage px (wrapper top-left).
    const left = (100 - 79 / 2 - 32.5 + dx) * z, right = (100 + 79 / 2 + 10 + dx) * z;
    assert.ok(left >= 0 && right <= 284, label + ': width fits ' + left + '..' + right + ' (' + z + ')');
    assert.ok(Math.abs((left + right) / 2 - 142) < 0.5, label + ': centred');
    const top = (74 - 18 / 2 - 57 + dy) * z, bottom = (74 + 18 / 2 + 26 + dy) * z;
    assert.ok(top >= 0 && bottom <= 278, label + ': height fits ' + top + '..' + bottom);
  };
  const base = zoom(); fits('closed gates'); assert.ok(base <= 2);
  for (const [kind, key] of [['Neutral', 'neutralEnabled'], ['Objective', 'objectiveEnabled']]) {
    m.fire('HPColorsPreviewKindOption' + kind, 'onactivate');
    if (!m.preview().facts.eligible) m.fire(gate(key).toggleId, 'onactivate');
    m.h.scheduler.runFor(1000); assert.equal(m.preview().facts.eligible, true, kind);
    assert.equal(zoom(), base, kind + ': open gate keeps the stock camera'); fits(kind);
    m.submit('HPColorsBarWidthEnemyEntry', 316); m.submit('HPColorsBarHeightEnemyEntry', 72); m.submit('HPColorsBarOffsetXEnemyEntry', 80);
    assert.equal(zoom(), base, kind + ': player bar size and offset never move the unit camera'); fits(kind + ' after edits');
    m.submit('HPColorsBarWidthEnemyEntry', 116.92); m.submit('HPColorsBarHeightEnemyEntry', 14.4); m.submit('HPColorsBarOffsetXEnemyEntry', 0);
  }
});

test('regression: slider increases paint HP color, pulse and overlay before native fill layout catches up', () => {
  const m = booted({ previewLayout: true }); m.open(); m.h.scheduler.runFor(1000);
  const fill = m.find('HPColorsPreviewBarFill'), live = Object.getOwnPropertyDescriptor(fill, 'actuallayoutwidth').get;
  let laidWidth = live();
  Object.defineProperty(fill, 'actuallayoutwidth', { configurable: true, get: () => laidWidth });
  const config = m.settings();
  config.side.enemy.pulseColorEnabled = true; config.side.enemy.pulseReadout = true;
  m.h.$.HPColorsV3Preview.setSettings(config);
  m.slider(20); laidWidth = live();
  assert.ok(fill.BHasClass('HPColorsV3Pulse'));
  m.slider(90);
  assert.equal(m.preview().facts.fraction, 0.9);
  assert.equal(fill.style.washColor, '#49d900', '90% gradient rather than the previous low band');
  assert.ok(!fill.BHasClass('HPColorsV3Pulse'));
  assert.ok(!m.find('HPColorsPreviewHpText').BHasClass('HPColorsV3Pulse'));
  assert.equal(computed(m.find('HPColorsPreviewPulseOverlay'), 'visibility'), 'collapse');
  assert.equal(m.fill().width, '100%');
  assert.equal(m.fill().clip, 'rect(0%, 90%, 100%, 0%)');
});

for (const stopIndex of [5, 8]) test('regression: heal steps read the held fill immediately and Stop at step ' + stopIndex + ' restores slider HP', () => {
  const m = booted({ previewLayout: true }); m.open(); m.h.scheduler.runFor(1000); m.slider(90);
  const fill = m.find('HPColorsPreviewBarFill'), live = Object.getOwnPropertyDescriptor(fill, 'actuallayoutwidth').get;
  let laidWidth = live();
  Object.defineProperty(fill, 'actuallayoutwidth', { configurable: true, get: () => laidWidth });
  m.play(); laidWidth = live();
  for (let index = 1; index <= stopIndex; index++) {
    m.h.scheduler.runFor(450);
    const held = index >= 5 ? STEPS[index - 1] : STEPS[index];
    assert.ok(Math.abs(m.preview().facts.fraction - held / 100) < 1e-9, 'fill fraction at step ' + index);
    if (index >= 5) assert.equal(m.fill().clip, 'rect(0%, ' + held + '%, 100%, 0%)');
    laidWidth = live();
  }
  m.play();
  assert.equal(m.preview().playing, false);
  assert.equal(m.preview().facts.fraction, 0.9);
  assert.equal(fill.style.washColor, '#49d900');
  assert.ok(!fill.BHasClass('HPColorsV3Pulse'));
  assert.equal(m.find('HPColorsPreviewBarHealing').style.width, '0%');
});

test('regression: pending font settle is debounced independently of play and rejects stale callbacks', () => {
  const m = booted({ previewLayout: true }); m.open(); m.h.scheduler.runFor(1000);
  const row = m.find('HPColorsPreviewReadoutLine'), value = m.find('HPColorsPreviewHpText');
  let laidSize = value.style.fontSize;
  Object.defineProperty(row, 'actuallayoutwidth', { configurable: true,
    get: () => parseFloat(laidSize) * 2 * row.actualuiscale_x });
  const config = m.settings(), preview = m.h.$.HPColorsV3Preview;
  m.play();
  const play = work(m.h).find(job => job.fn.name === 'previewStep');
  const generation = m.preview().generation;
  config.side.enemy.hpTextSize = 20; preview.setSettings(config);
  const stale = work(m.h).find(job => job !== play);
  assert.ok(stale, 'layout has a job even while play owns its slot');
  m.h.scheduler.runFor(50);
  config.side.enemy.hpTextSize = 40; preview.setSettings(config);
  const pending = work(m.h).find(job => job !== play);
  assert.ok(pending && pending !== stale, 'second font edit replaces the pending settle');
  stale.fn();
  assert.ok(work(m.h).includes(pending), 'stale settle cannot clear the replacement');
  assert.ok(work(m.h).includes(play), 'font debounce never cancels play');
  assert.equal(m.preview().generation, generation);
  m.h.scheduler.runFor(50);
  assert.ok(work(m.h).includes(pending), 'settle waits from the latest edit');
  laidSize = value.style.fontSize;
  m.h.scheduler.runFor(50);
  assert.equal(m.preview().facts.row.width, 80);
  assert.ok(work(m.h).includes(play));
  m.h.scheduler.runFor(300);
  assert.equal(m.preview().shown, STEPS[1], 'original play step still runs on time');
  m.cancel();
});

test('regression: unlaid geometry polls at four paints per second past the old cap and recovers without input', () => {
  const m = booted({ previewLayout: true });
  const inner = m.find('HPColorsPreviewBarInner'), live = Object.getOwnPropertyDescriptor(inner, 'actuallayoutwidth').get;
  let laid = false;
  Object.defineProperty(inner, 'actuallayoutwidth', { configurable: true, get: () => laid ? live() : 0 });
  const config = m.settings(); config.side.enemy.killMarkerEnabled = true;
  m.h.$.HPColorsV3Preview.setSettings(config);
  m.open();
  for (let i = 0; i < 8; i++) {
    assert.equal(work(m.h).length, 1);
    assert.equal(work(m.h)[0].delay, 0.25);
    m.h.scheduler.runFor(250);
    assert.match(m.preview().status, /Waiting for layout/);
  }
  laid = true; m.h.scheduler.runFor(250);
  assert.doesNotMatch(m.preview().status, /Waiting for layout/);
  assert.equal(m.preview().facts.geometry.inner.width, 69);
  assert.equal(m.find('HPColorsPreviewBarOutline').style.width, '71px');
  assert.ok(m.find('HPColorsPreviewCanvas').BHasClass('HPColorsV3KillMarker'));
  m.h.scheduler.runFor(1000);
  assert.equal(work(m.h).length, 0);
});

for (const stop of ['close', 'retire']) test('regression: ' + stop + ' cancels unlaid polling and stale settle cannot restart it', () => {
  const m = booted({ previewLayout: true });
  const inner = m.find('HPColorsPreviewBarInner');
  Object.defineProperty(inner, 'actuallayoutwidth', { configurable: true, get: () => 0 });
  m.open(); m.h.scheduler.runFor(1500);
  const stale = work(m.h)[0];
  assert.ok(stale, 'still polling after the old cap');
  m.h.$.HPColorsV3Preview[stop]();
  const writes = m.find('HPColorsPreviewBarFill').styleWrites.length;
  stale.fn();
  assert.equal(work(m.h).length, 0);
  assert.equal(m.find('HPColorsPreviewBarFill').styleWrites.length, writes);
});

for (const gate of ['master', 'barColor']) test('regression: stock damage delta washes follow enemy and ally with ' + gate + ' off', () => {
  const m = booted({ previewLayout: true }); m.open(); m.h.scheduler.runFor(1000);
  const config = m.settings();
  if (gate === 'master') config.shared.enabled = false;
  else { config.side.enemy.barColorEnabled = false; config.side.ally.barColorEnabled = false; }
  m.h.$.HPColorsV3Preview.setSettings(config);
  for (const [side, wash] of [['enemy', '#ffe55b'], ['ally', '#cc340a']]) {
    m.h.$.HPColorsV3Preview.setSide(side); m.slider(100); m.play();
    const delta = m.find('HPColorsPreviewBarDelta');
    assert.equal(delta.style.clip, 'rect(0%, 100%, 100%, 90%)');
    assert.equal(computed(delta, 'washColor'), wash);
    m.play();
  }
});

for (const badge of ['level', 'ult']) test('regression: first-visible ' + badge + ' badge gets placed when its late first layout arrives', () => {
  const m = booted({ previewLayout: true });
  const panel = m.find(badge === 'level' ? 'HPColorsPreviewLevel' : 'HPColorsPreviewUltPanel');
  let laid = false;
  for (const key of ['actuallayoutwidth', 'actuallayoutheight']) {
    const live = Object.getOwnPropertyDescriptor(panel, key).get;
    Object.defineProperty(panel, key, { configurable: true, get: () => laid ? live() : 0 });
  }
  const config = m.settings();
  config.side.enemy.levelsVisible = false;
  m.h.$.HPColorsV3Preview.setSettings(config);
  m.open(); m.h.scheduler.runFor(1000);
  config.side.enemy.levelsVisible = true;
  config.side.enemy.barWidth = 140; config.side.enemy.barHeight = 30;
  m.h.$.HPColorsV3Preview.setSettings(config);
  assert.equal(panel.style.marginLeft || '', '');
  assert.equal(work(m.h).length, 1, 'unmeasured wanted badge requests a settle');
  m.h.scheduler.runFor(100);
  assert.equal(panel.style.marginLeft || '', '');
  assert.equal(work(m.h).length, 1, 'wanted badge with zero extent keeps requesting measurement');
  laid = true; m.h.scheduler.runFor(100);
  assert.equal(panel.style.marginLeft, badge === 'level' ? '3.9px' : '26.9px');
  assert.equal(panel.style.marginTop, badge === 'level' ? '60.8px' : '61.3px');
  assert.equal(work(m.h).length, 0);
});

test('regression: a cosmetic edit cannot discard a pending idle font measurement', () => {
  const m = booted({ previewLayout: true }); m.open(); m.h.scheduler.runFor(1000);
  const row = m.find('HPColorsPreviewReadoutLine'), value = m.find('HPColorsPreviewHpText');
  let laidSize = value.style.fontSize;
  Object.defineProperty(row, 'actuallayoutwidth', { configurable: true,
    get: () => parseFloat(laidSize) * 2 * row.actualuiscale_x });
  const config = m.settings();
  config.side.enemy.hpTextSize = 20; m.h.$.HPColorsV3Preview.setSettings(config);
  m.h.scheduler.runFor(50);
  config.side.enemy.hpTextSize = 40; m.h.$.HPColorsV3Preview.setSettings(config);
  const pending = m.jobs()[0];
  m.h.scheduler.runFor(25);
  config.side.enemy.barColorHigh = '#123456'; m.h.$.HPColorsV3Preview.setSettings(config);
  assert.ok(m.jobs()[0] === pending, 'cosmetic repaint preserves the debounce deadline');
  laidSize = value.style.fontSize;
  m.h.scheduler.runFor(75);
  assert.equal(m.preview().facts.row.width, 80);
  assert.equal(m.jobs().length, 0);
});

test('regression: every rapid name-font edit renews its settle even after five cancelled measurements', () => {
  const m = booted({ previewLayout: true }); m.open(); m.h.scheduler.runFor(1000);
  const name = m.find('HPColorsPreviewName'), config = m.settings();
  let laidSize = 14;
  Object.defineProperty(name, 'actuallayoutwidth', { configurable: true,
    get: () => laidSize * 4 * name.actualuiscale_x });
  let previous = null;
  for (let size = 15; size <= 20; size++) {
    config.side.enemy.nameSize = size; m.h.$.HPColorsV3Preview.setSettings(config);
    const pending = m.jobs()[0];
    assert.ok(pending && pending !== previous, 'new measurement deadline for name size ' + size);
    assert.equal(pending.due - m.h.now, 100);
    previous = pending; m.h.scheduler.runFor(10);
  }
  laidSize = 20; m.h.scheduler.runFor(100);
  assert.equal(m.preview().facts.geometry.name.width, 80);
  assert.equal(m.jobs().length, 0);
});

test('critical preview follows the 6779 max-HP rule and uses the world outline color', () => {
  const m = booted({ previewLayout: true }); m.open();
  for (const [hp, critical] of [[25, false], [20, true], [5, true]]) {
    m.slider(hp);
    assert.equal(m.pane().BHasClass('health_critical'), critical, hp + '% critical');
    assert.ok(m.find('HPColorsPreviewCanvas').BHasClass('ShowCriticalState'));
    assert.equal(m.preview().facts.flags.health_critical, critical);
    assert.equal(m.preview().facts.flags.ShowCriticalState, true);
    assert.equal(m.find('HPColorsPreviewBarOutline').style.backgroundColor, critical ? '#2F0404' : '#10130D');
  }
  m.fire('HPColorsNavUnitsButton', 'onactivate');
  m.slider(20); assert.ok(m.pane().BHasClass('health_critical'), '600 max-HP NPC uses 20%');
  m.fire('HPColorsPreviewKindOptionObjective', 'onactivate');
  m.slider(20); assert.ok(!m.pane().BHasClass('health_critical'), '4000 max-HP objective is not critical at 20%');
  m.slider(11); assert.ok(!m.pane().BHasClass('health_critical'));
  m.slider(10); assert.ok(m.pane().BHasClass('health_critical'), '4000 max-HP objective uses 10%');
});

test('critical preview releases to native enemy and ally selectors with master off, while pulse wins on the custom fill', () => {
  const m = booted({ previewLayout: true }); m.open(); m.slider(20);
  const fill = m.find('HPColorsPreviewBarFill'), inner = m.find('HPColorsPreviewBarInner'), bars = m.find('HPColorsPreviewBars');
  assert.equal(computed(fill, 'animationName'), 'HPColorsV3PulseMedium', 'custom pulse outranks stock critical fill');
  assert.equal(computed(inner, 'animationName'), 'HPColorsV3CriticalFlash', 'custom enemy inner mirrors world brightness flash');
  assert.equal(computed(bars, 'animationName'), 'none', 'custom geometry suppresses the stock critical scale animation');
  m.fire('HPColorsEnabledToggle', 'onactivate');
  assert.equal(computed(m.find('HPColorsPreviewBar'), 'marginLeft'), '20px', 'native player critical inset');
  assert.equal(computed(m.find('HPColorsPreviewBar'), 'backgroundColor'), 'rgb(47, 4, 4)');
  assert.equal(computed(bars, 'animationName'), 'healthCritFlash3');
  assert.equal(computed(bars, 'preTransformScale2d'), '1.2');
  assert.equal(computed(fill, 'animationName'), 'healthCritFlash2');
  assert.equal(computed(m.find('HPColorsPreviewBarBg'), 'animationName'), 'healthCritFlash');
  assert.equal(computed(m.find('HPColorsPreviewCriticalIndicator'), 'visibility'), 'visible');
  m.fire('HPColorsPreviewSideOptionAlly', 'onactivate');
  assert.notEqual(computed(bars, 'animationName'), 'healthCritFlash3', 'ally never gets the enemy-only container flash');
  assert.notEqual(computed(inner, 'animationName'), 'HPColorsV3CriticalFlash');
  assert.equal(computed(fill, 'animationName'), 'healthCritFlash2', 'native critical fill applies to either relation');
  m.slider(25);
  assert.equal(computed(m.find('HPColorsPreviewCriticalIndicator'), 'visibility'), 'collapse');
  assert.notEqual(computed(fill, 'animationName'), 'healthCritFlash2');
});

test('PLAY interpolates a visual fill without changing the renderer signal, and restarts native-opacity feedback each step', () => {
  const m = booted({ previewLayout: true }); m.open(); m.slider(100);
  const signal = m.find('HPColorsPreviewBarFill'), visual = m.find('HPColorsPreviewBarVisualFill');
  const delta = m.find('HPColorsPreviewBarDelta'), healing = m.find('HPColorsPreviewBarHealing');
  assert.equal(computed(signal, 'opacity'), '0.01', 'signal stays laid out (live: opacity 0 skips layout) yet invisible');
  assert.equal(visual.style.preTransformScale2d, '1, 1');
  assert.equal(visual.style.transform, 'translateX(0px)', 'centre-scaling compensation keeps the fill left-anchored');
  m.play();
  for (let i = 0; i < STEPS.length; i++) {
    if (i) m.h.scheduler.runFor(450);
    const held = i >= 5 ? STEPS[i - 1] : STEPS[i], damage = i < 5;
    assert.equal(signal.style.clip, 'rect(0%, ' + held + '%, 100%, 0%)');
    assert.ok(Math.abs(m.preview().facts.fraction - held / 100) < 1e-9, 'unanimated signal at step ' + i);
    assert.equal(visual.style.preTransformScale2d, String(held / 100) + ', 1');
    assert.equal(visual.style.transform, 'translateX(' + Math.round(-(1 - held / 100) * 69 / 2 * 100) / 100 + 'px)', 'left edge pinned at step ' + i);
    assert.equal(computed(visual, 'transitionProperty'), 'pre-transform-scale2d, transform', 'stock transform interpolation at step ' + i);
    assert.equal(computed(visual, 'transitionDuration'), '0.4s');
    assert.equal(visual.style.washColor, signal.style.washColor, 'same renderer color at step ' + i);
    assert.equal(computed(visual, 'animationName'), computed(signal, 'animationName'), 'same pulse/critical at step ' + i);
    const layer = damage ? delta : healing, suffix = i % 2 ? 'B' : 'A';
    assert.equal(computed(layer, 'animationName'), 'HPColorsPreview' + (damage ? 'Damage' : 'Heal') + suffix);
    assert.equal(computed(layer, 'animationTimingFunction'), damage ? 'ease-out' : 'ease-in');
    assert.equal(computed(layer, 'animationDuration'), '0.45s');
    assert.equal(computed(m.find('HPColorsPreviewMotion'), 'animationName'), damage ? 'active_damage_wiggle' : 'none');
  }
  m.h.scheduler.runFor(450);
  assert.equal(m.preview().playing, false);
  assert.equal(computed(visual, 'transitionProperty'), 'none');
  assert.equal(computed(delta, 'animationName'), 'none');
  assert.equal(computed(healing, 'animationName'), 'none');
});

for (const [name, stop] of [
  ['stop', m => m.play()], ['close', m => m.cancel()],
  ['page switch', m => m.fire('HPColorsNavUnitsButton', 'onactivate')],
]) test('smooth PLAY ' + name + ' snaps to slider HP and stale steps cannot reanimate the visual layers', () => {
  const m = booted({ previewLayout: true }); m.open(); m.slider(60); m.play(); m.h.scheduler.runFor(450);
  const stale = m.playJobs()[0], visual = m.find('HPColorsPreviewBarVisualFill');
  stop(m);
  assert.equal(m.preview().playing, false);
  assert.equal(m.pane().BHasClass('HPC3PreviewPlaying'), false);
  assert.equal(computed(visual, 'transitionProperty'), 'none');
  assert.equal(visual.style.preTransformScale2d, '0.6, 1');
  assert.equal(m.fill().clip, 'rect(0%, 60%, 100%, 0%)');
  for (const layer of ['Delta', 'Healing']) assert.equal(computed(m.find('HPColorsPreviewBar' + layer), 'animationName'), 'none');
  assert.equal(computed(m.find('HPColorsPreviewMotion'), 'animationName'), 'none');
  const before = visual.styleWrites.length;
  stale.fn();
  assert.equal(visual.styleWrites.length, before);
  assert.equal(m.playJobs().length, 0);
});

test('the visual replica releases pulse aliases through the renderer ledger and never writes intermediate animation frames', () => {
  const m = booted({ previewLayout: true }); m.open();
  const signal = m.find('HPColorsPreviewBarFill'), visual = m.find('HPColorsPreviewBarVisualFill');
  for (const panel of [signal, visual]) panel.style = new Proxy(panel.style, { set(target, key, value) {
    if (STYLE_ALIAS_KEYS.has(key) && (value === null || value === '')) throw new Error('Cannot clear alias ' + key);
    return Reflect.set(target, key, value);
  } });
  m.slider(20);
  assert.ok(visual.BHasClass('HPColorsV3Pulse'));
  assert.equal(visual.style.animationDuration, signal.style.animationDuration);
  m.slider(90);
  assert.equal(m.preview().facts.fraction, 0.9, 'alias release did not abort the painter');
  assert.ok(!visual.BHasClass('HPColorsV3Pulse'));
  assert.equal(visual.style.animationDuration, '');
  m.slider(100); m.play();
  const count = visual.styleWrites.length;
  m.h.scheduler.runFor(400);
  assert.equal(m.preview().shown, 90);
  assert.equal(visual.styleWrites.length, count, 'settle paints do not animate in JS');
});

test('Units preview follows neutral camp and objective gates, restores stock, and returns to heroes on other pages',()=>{
  const m=booted({previewLayout:true});m.open();m.fire('HPColorsNavUnitsButton','onactivate');
  assert.equal(m.h.contextPanel.FindChildTraverse('HPColorsPreviewKindOptionNpc'),null,'no NPC sample: NPC bars are never customized (2026-10-29)');
  assert.equal(m.preview().kind,'neutral');assert.equal(m.preview().painted,false);
  assert.match(m.preview().status,/Turn on Customize neutral camps to style this bar/);
  const toggle=(key,side='enemy')=>{
    const row=m.h.$.HPColorsV3Settings.controls.find(r=>r.key===key&&(r.side===side||r.side==='shared'));
    assert.ok(row,key);m.fire(row.toggleId,'onactivate');
  };
  toggle('neutralEnabled');m.h.scheduler.runFor(1000);
  assert.equal(m.preview().facts.kind,'npc');assert.equal(m.preview().facts.side,'neutral');assert.equal(m.preview().facts.eligible,true);
  assert.equal(m.preview().painted,true);assert.match(m.preview().status,/Your settings/);
  assert.equal(m.find('HPColorsPreviewBarFill').style.washColor,'#5BEFB5');
  assert.ok(m.find('HPColorsPreviewHpText').GetParent()===m.find('HPColorsPreviewInfo'),'the neutral HP number stays in its stock slot');
  assert.match(m.find('HPColorsPreviewTitle').text,/NEUTRAL CAMP/);
  assert.equal(computed(m.find('HPColorsPreviewSideSegment'),'visibility'),'collapse','neutral sample has no enemy/ally ownership selector');
  // Neutral HP number options paint the preview like world bars.
  m.fire(m.h.$.HPColorsV3Settings.controls.find(r=>r.key==='neutralHpPositionEnabled').toggleId,'onactivate');
  m.submit('HPColorsNeutralHpOffsetXEntry',12);m.h.scheduler.runFor(1000);
  assert.equal(m.find('HPColorsPreviewHpText').style.transform,'translate3d(12px, 0px, 0px) rotateZ(-3deg)');
  toggle('neutralEnabled');assert.equal(m.preview().painted,false);
  assert.ok(!m.find('HPColorsPreviewHpText').style.transform,'closing the gate releases the HP number');
  m.fire('HPColorsPreviewKindOptionObjective','onactivate');
  assert.equal(m.preview().kind,'objective');assert.equal(m.preview().painted,false);
  toggle('objectiveEnabled');m.h.scheduler.runFor(1000);
  assert.equal(m.preview().facts.kind,'objective');assert.equal(m.preview().painted,true);
  assert.ok(m.find('HPColorsPreviewHpText').GetParent()===m.find('HPColorsPreviewInfo'),'objective HP number stays in its stock slot');
  assert.equal(m.find('HPColorsPreviewHpText').style.fontFamily||'','','HP TEXT settings do not apply');
  // Objective HP number options paint the preview like world bars (user, 2026-10-29).
  m.fire(m.h.$.HPColorsV3Settings.controls.find(r=>r.key==='objectiveHpPositionEnabled').toggleId,'onactivate');
  m.submit('HPColorsObjectiveHpOffsetXEntry',12);m.h.scheduler.runFor(1000);
  assert.equal(m.find('HPColorsPreviewHpText').style.transform,'translate3d(12px, 0px, 0px) rotateZ(-3deg)');
  m.fire('HPColorsObjectiveHpTextModeOptionAlways','onactivate');m.h.scheduler.runFor(1000);
  assert.equal(computed(m.find('HPColorsPreviewHpText'),'visibility'),'visible','Always show');
  assert.equal(computed(m.find('HPColorsPreviewHpText'),'opacity'),'1');
  const config=m.settings(),plan=m.h.$.HPColorsV3Renderer.plan(m.preview().facts,config);
  assert.equal(m.find('HPColorsPreviewBarFill').style.washColor,plan.styles.fill.washColor);
  m.slider(100);m.play();m.h.scheduler.runFor(450);
  assert.equal(computed(m.find('HPColorsPreviewMotion'),'animationName'),'none','owned objective never shakes');
  m.fire('HPColorsNavBarButton','onactivate');
  assert.equal(m.preview().kind,'hero');assert.equal(m.preview().facts.kind,'player');assert.equal(m.preview().playing,false);
});

// ---- Ticket 19: the preview follows BAR STYLE (user decision) through the same plan/apply as world bars.
const MASK = 'url("s2r://panorama/images/hud/healthbar/healthbar_backer_horiz_mask_flipped.vsvg")';

test('ticket 19: preview V1 is rectangular, V2 masks the same parts as world bars, and master off releases', () => {
  const m = booted(); m.open();
  const canvas = m.find('HPColorsPreviewCanvas'), primary = m.find('HPColorsPreviewBar');
  const masked = ['HPColorsPreviewBarInner', 'HPColorsPreviewBarLines', 'HPColorsPreviewBarOutline'].map(m.find);
  for (const panel of [primary, ...masked]) assert.equal(computed(panel, 'opacityMask'), undefined, 'V1 ' + panel.id);
  m.fire('HPColorsBarStyleOptionOriginal', 'onactivate');
  assert.equal(m.settings().shared.barStyle, 'original');
  assert.equal(canvas.BHasClass('HPColorsV3BarMask'), true);
  for (const panel of masked) assert.equal(computed(panel, 'opacityMask'), MASK, 'V2 ' + panel.id);
  assert.equal(computed(primary, 'opacityMask'), undefined, 'outlined primary drops its own mask');
  m.fire('HPColorsBarOutlineEnabledEnemyToggle', 'onactivate');
  assert.equal(computed(primary, 'opacityMask'), MASK);
  m.fire('HPColorsEnabledToggle', 'onactivate');
  assert.equal(canvas.BHasClass('HPColorsV3BarMask'), false);
  for (const panel of [primary, ...masked]) assert.equal(computed(panel, 'opacityMask'), undefined, 'master off ' + panel.id);
  m.fire('HPColorsEnabledToggle', 'onactivate'); m.fire('HPColorsBarStyleOptionNone', 'onactivate');
  for (const panel of [primary, ...masked]) assert.equal(computed(panel, 'opacityMask'), undefined, 'back to V1 ' + panel.id);
});

test('ticket 19: preview OLD draws the pip grid for the hero sample, keeps unit samples on the stock bar and plays feedback into boxes', () => {
  const m = booted({ previewLayout: true }); m.open(); m.slider(75);
  m.fire('HPColorsBarStyleOptionOld', 'onactivate');
  const canvas = m.find('HPColorsPreviewCanvas'), grid = m.find('HPColorsPreviewPipGrid');
  assert.equal(canvas.BHasClass('HPColorsV3BarOld'), true); assert.equal(canvas.BHasClass('HPColorsV3BarPips'), true);
  assert.equal(computed(grid, 'visibility'), 'visible'); assert.equal(computed(m.find('HPColorsPreviewBarInner'), 'opacity'), '0');
  assert.equal(m.find('HPColorsPreviewBarInner').actuallayoutwidth, 0, 'hidden native inner is unlaid, as live');
  assert.equal(m.preview().status, 'Ready · Your settings');
  // Hero sample: 1000 HP, one row of ten; 75% = seven full boxes and a half box.
  const empty = m.find('HPColorsPreviewPipEmpty'), fill = m.find('HPColorsPreviewPipFill');
  assert.equal(grid.style.height, '6px'); oldGrid.expectEmpty(empty, 1000, 'hero');
  const fillWidths = () => oldGrid.boxes(fill).map(box => Math.round(box.w * 1000) / 1000);
  assert.deepEqual(fillWidths(), [8.5, 8.5, 8.5, 8.5, 8.5, 8.5, 8.5, 4.25]); assert.equal(fill.style.washColor, m.fill().washColor);
  // Rims follow the measured 79px primary: 7.9px columns, 6.715px boxes plus 1px each side.
  const rims = oldGrid.rims(m.find('HPColorsPreviewPipOutline'));
  assert.equal(rims.length, 10); oldGrid.near(rims[1].x, 6.9, 'rim x'); oldGrid.near(rims[1].w, 8.715, 'rim w');
  m.slider(32); assert.deepEqual(fillWidths(), [8.5, 8.5, 8.5, 1.7]);
  // Damage steps: the delta layer spans new -> previous HP inside the boxes (100 -> 90 -> 72).
  const spans = name => oldGrid.boxes(m.find('HPColorsPreviewPip' + name)).map(box => [Math.round(box.x * 1000) / 1000, Math.round(box.w * 1000) / 1000]);
  m.slider(100); m.play();
  assert.equal(m.preview().status.startsWith('Damage'), true);
  assert.deepEqual(spans('Delta'), [[90, 8.5]]);
  m.h.scheduler.runFor(450, 10);
  assert.deepEqual(spans('Delta'), [[71.7, 6.8], [80, 8.5]], 'only boxes 7-8; box 9 clears');
  assert.equal(m.find('HPColorsPreviewPipDelta').style.washColor.toUpperCase(), '#FFE55B');
  // Heal step 8 -> 28: the healing layer covers old -> new above the held fill.
  m.h.scheduler.runFor(450 * 4); // Default job bound: the one-shot update check (ticket 33) also runs in this window.
  assert.equal(m.preview().status.startsWith('Healing'), true);
  assert.deepEqual(spans('Healing').map(span => span[0]), [6.8, 10, 20]);
  assert.equal(spans('Delta').length, 0);
  m.play();
  // Units page: customized unit samples keep the stock bar under OLD (user, 2026-10-29: layout stays stock).
  m.fire('HPColorsNavUnitsButton', 'onactivate');
  m.fire(m.h.$.HPColorsV3Settings.controls.find(r => r.key === 'neutralEnabled').toggleId, 'onactivate');
  assert.equal(canvas.BHasClass('HPColorsV3Core'), true);
  assert.equal(canvas.BHasClass('HPColorsV3BarOld'), false); assert.equal(canvas.BHasClass('HPColorsV3BarPips'), false, 'neutral: stock bar');
  assert.equal(computed(grid, 'visibility'), 'collapse');
  m.fire('HPColorsPreviewKindOptionObjective', 'onactivate'); m.fire('HPColorsObjectiveEnabledEnemyToggle', 'onactivate');
  assert.equal(canvas.BHasClass('HPColorsV3Core'), true);
  assert.equal(canvas.BHasClass('HPColorsV3BarOld'), false); assert.equal(canvas.BHasClass('HPColorsV3BarPips'), false, 'objective: stock bar');
  m.fire('HPColorsObjectiveEnabledEnemyToggle', 'onactivate');
  assert.equal(canvas.BHasClass('HPColorsV3BarPips'), false, 'closed gate: stock sample');
  assert.equal(computed(grid, 'visibility'), 'collapse');
  m.fire('HPColorsNavBarButton', 'onactivate'); oldGrid.expectEmpty(empty, 1000, 'hero again');
  m.fire('HPColorsBarStyleOptionNone', 'onactivate');
  assert.equal(computed(grid, 'visibility'), 'collapse'); assert.equal(computed(m.find('HPColorsPreviewBarInner'), 'opacity'), undefined);
  assert.equal(m.find('HPColorsPreviewBarInner').actuallayoutwidth > 0, true, 'inner lays out again');
});

test('ticket 19 audit: preview anchored level and ultimate badges follow the OLD grid centre like world bars', () => {
  const m = booted({ previewLayout: true }); m.open(); m.slider(75);
  const level = m.find('HPColorsPreviewLevel'), ult = m.find('HPColorsPreviewUltPanel'), top = panel => parseFloat(panel.style.marginTop);
  const v1 = { level: top(level), ult: top(ult) };
  m.fire('HPColorsBarStyleOptionOld', 'onactivate');
  // Hero sample 1000 HP = one row: (1*6/2 - 18/2 + 2.5) * 0.8 = -2.8, so the badges sit 2.8px lower.
  assert.ok(Math.abs(top(level) - (v1.level + 2.8)) < 0.002, 'level ' + top(level));
  assert.ok(Math.abs(top(ult) - (v1.ult + 2.8)) < 0.002, 'ultimate ' + top(ult));
  const plan = m.h.$.HPColorsV3Renderer.plan(m.preview().facts, m.settings());
  assert.equal(level.style.marginTop, plan.styles.level.marginTop); assert.equal(ult.style.marginTop, plan.styles.ult.marginTop);
  m.fire('HPColorsBarStyleOptionNone', 'onactivate');
  assert.equal(top(level), v1.level); assert.equal(top(ult), v1.ult);
});

// Ticket 20: the preview shows the chosen shake and the name/HP-text tilts from the renderer plan.
function control(m, key, side = 'enemy') {
  const row = m.h.$.HPColorsV3Settings.controls.find(r => r.key === key && (r.side === side || r.side === 'shared'));
  assert.ok(row, key); return row;
}
test('preview shake on edit: enabling runs native wiggle for exactly three seconds without PLAY feedback', () => {
  const m = booted({ previewLayout: true }); m.open();
  const toggle = control(m, 'damageShakeEnabled').toggleId;
  const motion = m.find('HPColorsPreviewMotion');
  m.fire(toggle, 'onactivate'); m.fire(toggle, 'onactivate');
  assert.equal(computed(motion, 'animationName'), 'active_damage_wiggle');
  assert.equal(computed(motion, 'animationDuration'), '0.2s');
  assert.equal(computed(motion, 'animationIterationCount'), 'infinite');
  assert.equal(m.preview().playing, false);
  assert.equal(m.preview().shown, 75);
  assert.equal(m.find('HPColorsPreviewBarDelta').BHasClass('HasHealth'), false);
  m.h.scheduler.runFor(2999);
  assert.equal(computed(motion, 'animationName'), 'active_damage_wiggle');
  m.h.scheduler.runFor(1);
  assert.equal(computed(motion, 'animationName'), 'none');
  assert.equal(m.preview().scheduled, false, 'preview leaves no timed work');
});

test('preview shake on edit: the shake still fires when the settings push throws, and the error reaches the caller', () => {
  // The menu used to call setSettings and then shakeOnEdit as two calls; one call keeps that ordering under a throw.
  const m = booted({ previewLayout: true }); m.open();
  const api = m.h.$.HPColorsV3Preview, motion = m.find('HPColorsPreviewMotion');
  const enabled = JSON.parse(JSON.stringify(m.settings()));
  enabled.shared.damageShakeEnabled = true;
  api.setSettings(enabled, { showBounds: false });
  assert.equal(computed(motion, 'animationName'), 'none', 'a plain push starts no shake');
  assert.throws(() => api.setSettings({ shared: null }, { showBounds: false, shake: true }), /Cannot read properties of null/);
  assert.equal(computed(motion, 'animationName'), 'active_damage_wiggle', 'shake started although the push threw');
  m.h.scheduler.runFor(3000);
  assert.equal(computed(motion, 'animationName'), 'none');
});
test('preview shake on edit: strength changes use every existing animation and dragging extends from the last change', () => {
  const m = booted({ previewLayout: true }); m.open();
  const row = control(m, 'damageShakeStrength'), motion = m.find('HPColorsPreviewMotion');
  for (let strength = 1; strength <= 10; strength++) {
    m.find(row.sliderId).value = strength;
    assert.equal(computed(motion, 'animationName'), strength === 3 ? 'active_damage_wiggle' : 'HPColorsV3Shake' + strength);
    m.h.scheduler.runFor(400);
  }
  m.h.releaseSlider(m.find(row.sliderId));
  m.h.scheduler.runFor(2599);
  assert.equal(computed(motion, 'animationName'), 'HPColorsV3Shake10', 'three seconds have not elapsed since the final drag value');
  m.h.scheduler.runFor(1);
  assert.equal(computed(motion, 'animationName'), 'none');
});

test('preview shake on edit: stale timers cannot stop or clear a newer strength window', () => {
  const m = booted({ previewLayout: true }); m.open();
  const row = control(m, 'damageShakeStrength'), motion = m.find('HPColorsPreviewMotion');
  m.submit(row.entryId, 7);
  const stale = work(m.h).find(job => job.delay === 3);
  assert.ok(stale);
  m.h.scheduler.runFor(1000);
  m.submit(row.entryId, 8);
  const current = work(m.h).find(job => job.delay === 3);
  assert.ok(current && current !== stale);
  stale.fn();
  assert.equal(computed(motion, 'animationName'), 'HPColorsV3Shake8');
  assert.ok(work(m.h).includes(current), 'stale timer cannot discard the newer job');
  m.h.scheduler.runFor(2999);
  assert.equal(computed(motion, 'animationName'), 'HPColorsV3Shake8');
  m.h.scheduler.runFor(1);
  assert.equal(computed(motion, 'animationName'), 'none');
});

test('preview shake on edit: off stops immediately and strength changes while off do not schedule a sample', () => {
  const m = booted({ previewLayout: true }); m.open();
  const row = control(m, 'damageShakeStrength'), motion = m.find('HPColorsPreviewMotion');
  m.submit(row.entryId, 7);
  const stale = work(m.h).find(job => job.delay === 3);
  m.h.scheduler.runFor(1000);
  m.fire(control(m, 'damageShakeEnabled').toggleId, 'onactivate');
  assert.equal(computed(motion, 'animationName'), 'none');
  assert.equal(work(m.h).some(job => job.delay === 3), false);
  m.submit(row.entryId, 9);
  assert.equal(computed(motion, 'animationName'), 'none');
  assert.equal(work(m.h).some(job => job.delay === 3), false);
  stale.fn();
  assert.equal(computed(motion, 'animationName'), 'none');
});

for (const stop of ['close', 'retire']) test('preview shake on edit: ' + stop + ' cancels the window and its stale timer', () => {
  const m = booted({ previewLayout: true }); m.open();
  m.submit(control(m, 'damageShakeStrength').entryId, 7);
  const stale = work(m.h).find(job => job.delay === 3);
  assert.ok(stale);
  if (stop === 'close') m.cancel();
  else m.h.$.HPColorsV3Preview.retire();
  assert.equal(work(m.h).some(job => job.delay === 3), false);
  assert.equal(m.pane().BHasClass('HPC3PreviewShakeEdit'), false);
  stale.fn();
  assert.equal(m.pane().BHasClass('HPC3PreviewShakeEdit'), false);
  if (stop === 'close') {
    m.open();
    assert.equal(computed(m.find('HPColorsPreviewMotion'), 'animationName'), 'none');
  }
});

test('preview shake on edit: boot, hydration, presets, Undo, side/kind switches and no-op edits do not start a window', () => {
  const m = booted({ previewLayout: true }); m.open();
  const row = control(m, 'damageShakeStrength'), motion = m.find('HPColorsPreviewMotion');
  const idle = () => {
    assert.equal(computed(motion, 'animationName'), 'none');
    assert.equal(work(m.h).some(job => job.delay === 3), false);
  };
  idle();
  const next = m.settings(); next.shared.damageShakeStrength = 7;
  m.api().hydrateSettings(next); idle();
  next.shared.damageShakeStrength = 8;
  m.api().applyPresetSettings(next, 'sample', false, false); idle();
  m.fire('HPColorsUndoButton', 'onactivate'); idle();
  m.fire('HPColorsPreviewSideOptionAlly', 'onactivate'); idle();
  m.fire('HPColorsNavUnitsButton', 'onactivate'); idle();
  m.fire('HPColorsPreviewKindOptionNeutral', 'onactivate'); idle();
  m.fire('HPColorsNavBarButton', 'onactivate'); idle();
  m.submit(row.entryId, 7); idle();
  m.submit(row.entryId, 'not a number'); idle();
  m.submit(control(m, 'nameTilt').entryId, 12); idle();
  m.submit(row.entryId, 9);
  m.h.scheduler.runFor(1000);
  m.submit(row.entryId, 9);
  m.h.scheduler.runFor(2000);
  idle(); // Re-submitting the same value did not extend the deadline.
});

test('preview shake on edit: per-row reset and bulk edit sample changed values', () => {
  const m = booted({ previewLayout: true }); m.open();
  const row = control(m, 'damageShakeStrength'), motion = m.find('HPColorsPreviewMotion');
  m.submit(row.entryId, 7); m.h.scheduler.runFor(3000);
  m.fire(row.resetId, 'onactivate');
  assert.equal(computed(motion, 'animationName'), 'active_damage_wiggle', 'row reset is an explicit edit');
  m.h.scheduler.runFor(3000);
  const next = m.settings(); next.shared.damageShakeStrength = 8;
  m.api().editSettings(next);
  assert.equal(computed(motion, 'animationName'), 'HPColorsV3Shake8', 'bulk menu edits share the edit path');
  m.h.scheduler.runFor(3000);
});

test('preview shake on edit: explicit settings-code import counts only when its edit changes a shake value', () => {
  const m = booted({ previewLayout: true }); m.open();
  const entry = m.find('HPColorsSettingsCodeEntry'), motion = m.find('HPColorsPreviewMotion');
  const imported = m.api().getSettings(); imported.shared.nameTilt = 12;
  const paste = () => {
    entry.text = m.h.$.HPColorsV3Sharing.exportSettingsCode(imported).code;
    m.fire('HPColorsSettingsImportButton', 'onactivate');
  };
  paste();
  assert.equal(computed(motion, 'animationName'), 'none', 'an unrelated import is not a shake edit');
  imported.shared.damageShakeStrength = 7; paste();
  assert.equal(computed(motion, 'animationName'), 'HPColorsV3Shake7');
  m.h.scheduler.runFor(1000); paste();
  m.h.scheduler.runFor(2000);
  assert.equal(computed(motion, 'animationName'), 'none', 'a no-change import does not extend the window');
});

// User report 2026-10-17: this code (stamina color on, #F5FF00) made every preview paint throw on an inline
// "offBlack" wash for empty arrow pips; the preview then read "Preview unavailable".
test('user code with stamina color on paints the preview on every page and side', () => {
  const m = booted({ previewLayout: true }); m.open();
  const code = 'HPC3.1c943aec.eyJ2IjoxMywiayI6InNldHRpbmdzIiwiZCI6WzYsdHJ1ZSw0OSwiY3VzdG9tIiw1NSwiI0ZGRkZGRiIsNjksdHJ1ZSw3MSwiI0ZGRkZGRiIsMTA0LHRydWUsMTA1LCIjRjVGRjAwIiwxNjAsZmFsc2UsMTY3LGZhbHNlLDE3MCxmYWxzZSwxNzMsZmFsc2VdfQ';
  m.find('HPColorsSettingsCodeEntry').text = code; m.fire('HPColorsSettingsImportButton', 'onactivate');
  assert.equal(m.settings().side.enemy.staminaColorEnabled, true); assert.equal(m.settings().side.enemy.staminaColor, '#F5FF00');
  for (const nav of ['HPColorsNavBarButton', 'HPColorsNavIndicatorsButton', 'HPColorsNavPresetsButton']) {
    m.fire(nav, 'onactivate');
    for (const side of ['Ally', 'Enemy']) {
      m.fire('HPColorsPreviewSideOption' + side, 'onactivate'); m.h.scheduler.runFor(500);
      assert.equal(m.preview().painted, true, nav + ' ' + side);
      assert.doesNotMatch(m.preview().status, /unavailable/i, nav + ' ' + side);
    }
  }
});

test('preview shake on edit: a matched condition masks authored strength changes without starting a window', () => {
  const m = booted({ previewLayout: true }); m.open();
  const tree = installTopBarIdentityTree(m.h, { heroName: 'Infernus' });
  const signature = tree.hud.add(new MockPanel('hud_signature'));
  const owner = signature.add(new MockPanel('abilities'));
  owner.add(new MockPanel('slot_signature_1', { classes: ['Tier3'] }));
  m.h.scheduler.runFor(3000);
  m.api().applySettings(m.api().getSettings(), { 161: { slot: 1, minTier: 2, value: 7 } });
  m.h.scheduler.runFor(1000);
  assert.equal(m.settings().shared.damageShakeStrength, 7, 'the observed local tier overrides the authored default');
  m.submit(control(m, 'damageShakeStrength').entryId, 9);
  assert.equal(m.api().getSettings().shared.damageShakeStrength, 9, 'the authored edit is retained');
  assert.equal(m.settings().shared.damageShakeStrength, 7, 'the effective value did not change');
  assert.equal(computed(m.find('HPColorsPreviewMotion'), 'animationName'), 'none');
  assert.equal(work(m.h).some(job => job.delay === 3), false);
});

test('preview shake on edit: stock hero and NPC samples keep native wiggle, never the objective', () => {
  const m = booted({ previewLayout: true }); m.open();
  m.fire(control(m, 'enabled').toggleId, 'onactivate');
  const status = m.find('HPColorsPreviewUnitStatus'), motion = m.find('HPColorsPreviewMotion');
  for (const [index, kind] of ['hero', 'npc', 'neutral', 'objective'].entries()) {
    if (kind !== 'hero') {
      m.fire('HPColorsNavUnitsButton', 'onactivate');
      if (kind !== 'npc') m.fire('HPColorsPreviewKindOption' + (kind === 'neutral' ? 'Neutral' : 'Objective'), 'onactivate');
    }
    m.submit(control(m, 'damageShakeStrength').entryId, index + 5);
    assert.equal(computed(status, 'animationName') || 'none', kind === 'objective' ? 'none' : 'active_damage_wiggle', kind);
    assert.equal(computed(motion, 'animationName'), 'none', 'the released motion frame is not animated');
    m.h.scheduler.runFor(3000);
    assert.equal(computed(status, 'animationName') || 'none', 'none');
  }
});

test('preview shake on edit: objectives never wiggle even during the edit window', () => {
  const m = booted({ previewLayout: true }); m.open();
  m.fire('HPColorsNavUnitsButton', 'onactivate'); m.fire('HPColorsPreviewKindOptionObjective', 'onactivate');
  m.fire(control(m, 'objectiveEnabled').toggleId, 'onactivate');
  m.submit(control(m, 'damageShakeStrength').entryId, 7);
  assert.equal(m.pane().BHasClass('HPC3PreviewShakeEdit'), true);
  assert.equal(computed(m.find('HPColorsPreviewMotion'), 'animationName'), 'none');
  assert.equal(computed(m.find('HPColorsPreviewUnitStatus'), 'animationName') || 'none', 'none');
});

test('preview shake on edit: PLAY takes over an idle window and edits leave its steps and cancellation untouched', () => {
  const m = booted({ previewLayout: true }); m.open(); m.slider(100);
  const row = control(m, 'damageShakeStrength');
  m.submit(row.entryId, 7);
  const stale = work(m.h).find(job => job.delay === 3);
  m.play();
  assert.equal(m.pane().BHasClass('HPC3PreviewShakeEdit'), false);
  const original = m.playJobs()[0], generation = m.preview().generation;
  m.submit(row.entryId, 8);
  stale.fn();
  assert.ok(m.playJobs()[0] === original);
  assert.equal(m.preview().generation, generation);
  assert.equal(work(m.h).some(job => job.delay === 3), false);
  assert.equal(computed(m.find('HPColorsPreviewMotion'), 'animationName'), 'HPColorsV3Shake8');
  m.h.scheduler.runFor(450);
  assert.equal(m.preview().shown, 72);
  m.fire(control(m, 'damageShakeEnabled').toggleId, 'onactivate');
  assert.equal(computed(m.find('HPColorsPreviewMotion'), 'animationName'), 'none');
  assert.equal(m.preview().playing, true);
  m.fire(control(m, 'damageShakeEnabled').toggleId, 'onactivate');
  assert.equal(work(m.h).some(job => job.delay === 3), false);
  m.h.scheduler.runFor(450 * 8);
  assert.equal(m.preview().playing, false);
  assert.equal(m.preview().shown, 100);
  assert.equal(computed(m.find('HPColorsPreviewMotion'), 'animationName'), 'none');
});

test('ticket 20: preview damage play uses the chosen shake strength, stops when off, and never shakes objectives', () => {
  const m = booted({ previewLayout: true }); m.open();
  const motion = m.find('HPColorsPreviewMotion'), canvas = m.find('HPColorsPreviewCanvas');
  m.slider(100); // the first play step (90%) is damage
  const shakeNames = () => [...canvas.classes].filter(name => /^HPColorsV3Shake/.test(name));
  const damage = () => { if (m.preview().playing) m.play(); m.play(); assert.equal(m.preview().playing, true); return computed(motion, 'animationName'); };
  assert.deepEqual(shakeNames(), []); assert.equal(damage(), 'active_damage_wiggle', 'default strength 3 is the native wiggle');
  for (let n = 1; n <= 10; n++) {
    m.submit(control(m, 'damageShakeStrength').entryId, n);
    assert.deepEqual(shakeNames(), n === 3 ? [] : ['HPColorsV3Shake' + n]);
    assert.equal(damage(), n === 3 ? 'active_damage_wiggle' : 'HPColorsV3Shake' + n, 'preview strength ' + n);
    assert.equal(computed(motion, 'animationIterationCount'), 'infinite'); assert.equal(computed(motion, 'animationTimingFunction'), 'ease-out');
    assert.equal(computed(motion, 'animationDuration'), '0.2s');
  }
  m.h.scheduler.runFor(450 * 9); assert.equal(m.preview().playing, false); assert.equal(computed(motion, 'animationName'), 'none', 'no shake outside damage steps');
  m.fire(control(m, 'damageShakeEnabled').toggleId, 'onactivate');
  assert.deepEqual(shakeNames(), ['HPColorsV3ShakeOff']); assert.equal(damage(), 'none', 'shake off');
  m.fire(control(m, 'damageShakeEnabled').toggleId, 'onactivate'); assert.equal(damage(), 'HPColorsV3Shake10');
  m.fire('HPColorsNavUnitsButton', 'onactivate'); m.fire('HPColorsPreviewKindOptionObjective', 'onactivate');
  m.fire(control(m, 'objectiveEnabled').toggleId, 'onactivate'); m.h.scheduler.runFor(1000);
  assert.equal(m.preview().facts.kind, 'objective'); assert.deepEqual(shakeNames(), []);
  assert.equal(damage(), 'none', 'objectives never shake at any strength');
  m.fire('HPColorsNavBarButton', 'onactivate'); m.h.scheduler.runFor(1000);
  m.fire(control(m, 'enabled').toggleId, 'onactivate');
  assert.deepEqual(shakeNames(), []); if (m.preview().playing) m.play(); m.play();
  assert.equal(computed(m.find('HPColorsPreviewUnitStatus'), 'animationName'), 'active_damage_wiggle', 'master off: stock wiggle');
});

test('ticket 20: preview name and HP-text tilts match the renderer plan and release to stock', () => {
  const m = booted({ previewLayout: true }); m.open();
  const name = m.find('HPColorsPreviewName'), hp = m.find('HPColorsPreviewHpText');
  const plan = () => m.h.$.HPColorsV3Renderer.plan(m.preview().facts, m.settings());
  assert.equal(computed(name, 'transform'), 'none'); assert.equal(computed(hp, 'transform'), 'none');
  m.submit(control(m, 'nameTilt').entryId, -20);
  assert.equal(name.style.transform, 'rotateZ(-20deg)'); assert.equal(name.style.transform, plan().styles.name.transform);
  m.submit(control(m, 'nameOffsetY').entryId, -8);
  assert.match(name.style.transform, /^translate3d\(.*\) rotateZ\(-20deg\)$/); assert.equal(name.style.transform, plan().styles.name.transform);
  m.submit(control(m, 'hpTextTilt').entryId, 25);
  assert.equal(hp.style.transform, 'rotateZ(25deg)'); assert.equal(hp.style.transform, plan().styles.value.transform);
  for (const style of ['old', 'original']) {
    m.fire(control(m, 'barStyle').options.find(o => o.value === style).id, 'onactivate'); m.h.scheduler.runFor(1000);
    assert.match(name.style.transform, /rotateZ\(-20deg\)$/, style); assert.equal(name.style.transform, plan().styles.name.transform, style);
    assert.equal(hp.style.transform, 'rotateZ(25deg)', style);
  }
  m.fire('HPColorsPreviewSideOptionAlly', 'onactivate');
  assert.equal(name.style.transform, 'rotateZ(-20deg)', 'name tilt is shared');
  m.fire(control(m, 'hpTextVisible', 'ally').toggleId, 'onactivate'); m.h.scheduler.runFor(1000);
  assert.equal(computed(hp, 'transform'), 'none', 'ally HP text keeps its own level default');
  m.fire('HPColorsPreviewSideOptionEnemy', 'onactivate');
  assert.equal(hp.style.transform, 'rotateZ(25deg)');
  m.fire(control(m, 'enabled').toggleId, 'onactivate');
  assert.ok(!name.style.transform); assert.equal(computed(name, 'transform'), 'rotateZ(-4deg)', 'master off: stock name tilt');
  assert.ok(!hp.style.transform); assert.equal(computed(hp, 'transform'), 'rotateZ(-3deg)', 'master off: stock HP tilt');
});

// Ticket 21: outline widths and alignment in the preview follow the renderer plan on both sides.
function choose(m, key, value, side = 'enemy') {
  const row = control(m, key, side), option = row.options.find(o => o.value === value);
  if (row.kind === 'segment') { m.fire(option.id, 'onactivate'); return; }
  const panel = m.find(row.id); panel.SetSelected(panel.FindDropDownMenuChild(option.id)); m.fire(row.id, 'oninputsubmit');
}
test('ticket 21: preview names and HP text follow every outline width and alignment on both sides, then release to stock', () => {
  const m = booted({ previewLayout: true }); m.open();
  const name = m.find('HPColorsPreviewName'), hp = m.find('HPColorsPreviewHpText'), row = m.find('HPColorsPreviewReadoutLine');
  const plan = () => m.h.$.HPColorsV3Renderer.plan(m.preview().facts, m.settings());
  assert.ok(!name.style.textShadow); assert.equal(computed(name, 'textShadow'), '0px 0px 0px 4.0 #10130dee', 'default name keeps the stock outline');
  assert.ok(!hp.style.textShadow); assert.equal(computed(hp, 'textShadow'), '0px 0px 0px 5.0 #10130d', 'default HP text keeps the stock outline');
  m.fire(control(m, 'hpTextVisible', 'ally').toggleId, 'onactivate');
  for (const side of ['enemy', 'ally']) {
    m.fire('HPColorsPreviewSideOption' + (side === 'enemy' ? 'Enemy' : 'Ally'), 'onactivate');
    for (const width of [0, 2.5, 10]) {
      m.submit(control(m, 'nameOutline', side).entryId, width); m.submit(control(m, 'hpTextOutline', side).entryId, width);
      assert.equal(name.style.textShadow, '0px 0px 0px ' + width + ' #10130Dee', side + ' ' + width);
      assert.equal(hp.style.textShadow, '0px 0px 0px ' + width + ' #10130D', side + ' ' + width);
      assert.equal(name.style.maxWidth, plan().styles.name.maxWidth); assert.equal(hp.style.padding, plan().styles.value.padding);
    }
    m.submit(control(m, 'nameOffsetX', side).entryId, side === 'enemy' ? 9 : -14);
    m.submit(control(m, 'hpTextOffsetX', side).entryId, side === 'enemy' ? -10 : 6);
    for (const [align, growth] of [['left', 'right'], ['center', 'center'], ['right', 'left']]) {
      choose(m, 'nameAlign', align, side); choose(m, 'hpTextAlign', align, side); m.h.scheduler.runFor(1000);
      const expected = plan().styles, at = side + ' ' + align;
      assert.equal(name.style.horizontalAlign, growth, at); assert.equal(name.style.textAlign, growth, at);
      assert.equal(name.style.transform, expected.name.transform, at);
      assert.equal(row.style.horizontalAlign, growth, at); assert.equal(row.style.transform, expected.row.transform, at);
    }
    m.submit(control(m, 'nameOutline', side).entryId, 5); m.submit(control(m, 'hpTextOutline', side).entryId, 5);
    assert.ok(!name.style.textShadow, side); assert.equal(computed(name, 'textShadow'), '0px 0px 0px 4.0 #10130dee', side + ' width 5 returns the stock name outline');
    assert.ok(!hp.style.textShadow, side); assert.equal(computed(hp, 'textShadow'), '0px 0px 0px 5.0 #10130d', side + ' width 5 returns the stock HP outline');
    m.submit(control(m, 'nameOutline', side).entryId, 7.5); m.submit(control(m, 'hpTextOutline', side).entryId, 7.5);
  }
  m.fire(control(m, 'enabled').toggleId, 'onactivate');
  assert.ok(!name.style.textShadow); assert.equal(computed(name, 'textShadow'), '0px 0px 0px 4.0 #10130dee', 'master off: stock name outline');
  assert.ok(!hp.style.textShadow); assert.equal(computed(hp, 'textShadow'), '0px 0px 0px 5.0 #10130d', 'master off: stock HP outline');
  assert.equal(computed(name, 'horizontalAlign'), 'center'); assert.equal(computed(name, 'textAlign'), 'center');
  assert.ok(!name.style.transform); assert.ok(!row.style.transform);
});

// Ticket 51: the preview sample shows the HP number format like world bars.
test('ticket 51: preview shows the HP percent after the sample number or alone, follows the slider, and releases', () => {
  const m = booted({ previewLayout: true }); m.open(); m.slider(10);
  const hp = m.find('HPColorsPreviewHpText'), pct = m.find('HPColorsPreviewHpPercent'), row = m.find('HPColorsPreviewReadoutLine');
  assert.ok(pct.GetParent() === row); assert.equal(computed(pct, 'visibility'), 'collapse', 'Number shows no percent');
  choose(m, 'hpTextFormat', 'both'); m.h.scheduler.runFor(1000);
  assert.equal(hp.text, '100'); assert.equal(pct.text, '/ 10%'); assert.equal(computed(pct, 'visibility'), 'visible');
  const children = row.Children(); assert.ok(children.indexOf(hp) < children.indexOf(pct), 'number first, then the percent');
  assert.equal(pct.style.fontSize, hp.style.fontSize); assert.equal(pct.style.washColor, hp.style.washColor);
  m.slider(55); m.h.scheduler.runFor(1000); assert.equal(pct.text, '/ 55%');
  choose(m, 'hpTextFormat', 'percent'); m.h.scheduler.runFor(1000);
  assert.equal(pct.text, '55%'); assert.equal(computed(hp, 'visibility'), 'collapse', 'Percent hides the number');
  choose(m, 'hpTextFormat', 'number'); m.h.scheduler.runFor(1000);
  assert.equal(computed(pct, 'visibility'), 'collapse'); assert.notEqual(computed(hp, 'visibility'), 'collapse'); assert.ok(!pct.style.fontSize);
});

test('ticket 22: SHOW BOUNDS outlines the preview canvas like a world bar, follows the toggle, page kind and master off, and is never a setting', () => {
  const m = booted({ previewLayout: true }); m.open();
  const canvas = m.find('HPColorsPreviewCanvas'), rim = m.find('HPColorsPreviewCanvasBounds');
  assert.ok(rim.GetParent() === canvas, 'rim sits on the canvas, outside the shaking motion frame');
  assert.equal(canvas.BHasClass('HPColorsV3Bounds'), false); assert.equal(computed(rim, 'visibility'), 'collapse');
  const before = JSON.stringify(m.settings());
  m.fire('HPColorsShowBoundsToggle', 'onactivate');
  assert.equal(canvas.BHasClass('HPColorsV3Bounds'), true, 'the menu sends the view state with the settings');
  assert.equal(computed(rim, 'visibility'), 'visible'); assert.equal(computed(rim, 'border'), '1px solid #5fe69e');
  assert.equal(computed(rim, 'width'), '100%'); assert.equal(computed(rim, 'height'), '100%');
  assert.equal(JSON.stringify(m.settings()), before, 'settings unchanged');
  const view = { showBounds: true };
  assert.equal(m.h.$.HPColorsV3Renderer.plan(m.preview().facts, m.settings(), view).classes.root.HPColorsV3Bounds, true, 'same plan rule as the world');
  m.fire('HPColorsPreviewSideOptionAlly', 'onactivate'); assert.equal(canvas.BHasClass('HPColorsV3Bounds'), true, 'ally sample too');
  m.fire('HPColorsNavUnitsButton', 'onactivate');
  assert.equal(canvas.BHasClass('HPColorsV3Bounds'), false, 'closed NPC gate: the stock sample has no rim');
  m.fire('HPColorsNavBarButton', 'onactivate'); assert.equal(canvas.BHasClass('HPColorsV3Bounds'), true);
  m.fire(control(m, 'enabled', 'shared').toggleId, 'onactivate');
  assert.equal(canvas.BHasClass('HPColorsV3Bounds'), false, 'master off releases'); assert.equal(computed(rim, 'visibility'), 'collapse');
  m.fire(control(m, 'enabled', 'shared').toggleId, 'onactivate'); assert.equal(canvas.BHasClass('HPColorsV3Bounds'), true);
  m.fire('HPColorsShowBoundsToggle', 'onactivate');
  assert.equal(canvas.BHasClass('HPColorsV3Bounds'), false); assert.equal(computed(rim, 'visibility'), 'collapse');
  assert.equal(m.find('HPColorsShowBoundsToggle').BHasClass('Checked'), false);
});

// Ticket 22c: client.dll 6782 CitadelHeroScenePanelNew layout attributes are heroname/heroid/heroscenestyle
// (not `hero`); Shop loads the hero's m_strUIShoppingMap with point_camera, the stock in-HUD shop style.
test('ticket 22c: one static Infernus scene panel sits behind the preview bar, set only by layout attributes', () => {
  const m = booted(); m.open();
  const models = [];
  walk(m.h.contextPanel, panel => { if (panel.paneltype === 'CitadelHeroScenePanelNew') models.push(panel); });
  assert.equal(models.length, 1, 'exactly one scene panel in the Escape menu');
  const model = models[0], stage = m.find('HPColorsPreviewStage'), scale = m.find('HPColorsPreviewScale');
  assert.equal(model.id, 'HPColorsPreviewHeroModel');
  assert.equal(model.GetAttributeString('heroname', ''), 'hero_inferno');
  assert.equal(model.GetAttributeString('heroscenestyle', ''), 'Shop');
  // Live check 1: static heroname/heroscenestyle alone left camera="default_camera" and no model. Shop pose
  // (user choice): the explicit map/camera match Shop's m_strUIShoppingMap + point_camera.
  assert.equal(model.GetAttributeString('map', ''), 'maps/ui/hero_shop/inferno_shop.vmap');
  assert.equal(model.GetAttributeString('camera', ''), 'point_camera');
  // Live checks 3-4: heroid="1" is the attribute that makes the scene draw (heroname alone stays empty).
  for (const [name, value] of [['heroid', '1'], ['rendershadows', 'false'], ['rotate', 'None']])
    assert.equal(model.GetAttributeString(name, ''), value, name);
  // Live 1:1: client.dll 6785 has no renderdeferred/antialias scene-panel attribute, and the live E-H strip
  // drew without them, so they are not emitted.
  for (const name of ['renderdeferred', 'antialias']) assert.equal(model.GetAttributeString(name, 'absent'), 'absent', name);
  assert.equal(model.GetAttributeString('hittest', ''), 'false');
  const frame = m.find('HPColorsPreviewHeroFrame');
  assert.ok(model.GetParent() === frame && frame.GetParent() === stage, 'inside the unlayered frame in the stage');
  assert.ok(scale.GetParent() === stage, 'the bar wrapper shares the stage');
  assert.ok(stage.children.indexOf(frame) < stage.children.indexOf(scale), 'model is drawn first, behind the bar');
  // Bust framing: fixed px size/offset; the dedicated bust test checks the geometry.
  // No per-tick or per-change JS: the panel is pure layout + CSS.
  m.slider(30); m.play(); m.h.scheduler.runFor(5000);
  m.fire('HPColorsPreviewSideOptionAlly', 'onactivate'); m.fire('HPColorsNavUnitsButton', 'onactivate');
  assert.equal(model.styleWrites.length, 0, 'no inline style writes');
  assert.equal(Object.keys(model.events).length, 0, 'no panel events');
  assert.equal(model.GetAttributeString('heroname', ''), 'hero_inferno', 'attributes stay static');
});

// CSS state only: this does not prove the native scene stops loading/rendering while collapsed (live check).
test('ticket 22c: the model is collapsed when the menu is closed or the kind is not HERO', () => {
  const m = booted();
  const model = m.find('HPColorsPreviewHeroModel');
  const shown = () => computed(model, 'visibility');
  assert.equal(m.preview().kind, 'hero');
  assert.equal(shown(), 'collapse', 'menu closed at boot');
  m.open(); assert.equal(shown(), 'visible', 'HERO preview, menu open');
  m.fire('HPColorsNavUnitsButton', 'onactivate');
  for (const kind of ['Neutral', 'Objective']) {
    m.fire('HPColorsPreviewKindOption' + kind, 'onactivate');
    assert.equal(m.preview().kind, kind.toLowerCase());
    assert.equal(shown(), 'collapse', kind + ' preview has no scene');
  }
  m.fire('HPColorsNavBarButton', 'onactivate'); assert.equal(shown(), 'visible', 'back on the HERO kind');
  m.cancel(); assert.equal(m.preview().open, false); assert.equal(shown(), 'collapse', 'menu closed again');
  m.open(); assert.equal(shown(), 'visible');
});

// Ticket 22c live 1:1 (user 2026-10-15): the HERO stage is the live SHOW BOUNDS box. Its inner box has the
// 200:210 canvas aspect, and the canvas maps origin to origin at k = 284/200 for every bar size and offset.
const K = 1.42, STAGE_W = 284, STAGE_H = 298; // HERO stage inner box = round(284 * 210 / 200)
// Zoom-out (below): above 136.7 px the camera pulls back about the 1:1 canvas centre, (142, 149.1) stage px.
const ZOOM_WIDTH = 136.7, ANCHOR = { x: 100 * K, y: 105 * K };
function canvasRect(m) {
  const z = parseFloat(computed(m.find('HPColorsPreviewScale'), 'uiScale')) / 100, canvas = m.find('HPColorsPreviewCanvas');
  const x = parseFloat(computed(canvas, 'marginLeft')) * z, y = parseFloat(computed(canvas, 'marginTop')) * z;
  return { z, x, y, w: 200 * z, h: 210 * z };
}
test('ticket 22c live 1:1: the HERO canvas maps 1:1 onto the stage at a fixed k up to 136.7 px wide, for default, max-size and extreme-offset bars', () => {
  const m = booted({ previewLayout: true }); m.open();
  const stage = m.find('HPColorsPreviewStage'), scale = m.find('HPColorsPreviewScale'), bars = m.find('HPColorsPreviewBars');
  assert.ok(scale.GetParent() === stage, 'no head anchor: the scale wrapper is the stage child');
  walk(m.h.contextPanel, panel => assert.notEqual(panel.id, 'HPColorsPreviewHeadAnchor', 'head anchor removed'));
  assert.equal(computed(stage, 'height'), STAGE_H + 2 + 'px', 'inner box 284x298 inside the 1px border');
  assert.equal(STAGE_H, Math.round(STAGE_W * 210 / 200));
  // Ticket 27: the plate replaces the old segment-height slot, not the camera's inner geometry.
  const plate = m.find('HPColorsPreviewPlate'), scene = m.find('HPColorsPreviewSceneWindow');
  assert.ok(stage.GetParent() === scene && scene.GetParent() === plate); assert.equal(computed(stage, 'verticalAlign'), 'center');
  assert.equal(parseFloat(computed(plate, 'height')) - parseFloat(computed(stage, 'height')), 40, 'unchanged centre; scene window, not stage, clips below the camera box');
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'settings/schema.json'), 'utf8'));
  const rows = Array.isArray(schema) ? schema : schema.controls || schema.rows || Object.values(schema).find(Array.isArray);
  const bounds = key => rows.find(row => row.key === key).bounds;
  const shift = () => bars.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/).slice(1).map(Number);
  m.submit('HPColorsBarOffsetXEnemyEntry', 0); m.submit('HPColorsBarOffsetYEnemyEntry', 0);
  const [x0, y0] = shift(), base = { ...m.settings().side.enemy };
  const cases = [['default'], ['max size', { Width: bounds('barWidth')[1], Height: bounds('barHeight')[1] }]];
  for (const x of bounds('barOffsetX')) for (const y of bounds('barOffsetY')) cases.push(['offset ' + x + ',' + y, { OffsetX: x, OffsetY: y }]);
  cases.push(['max size + extreme offset', { Width: bounds('barWidth')[1], Height: bounds('barHeight')[1], OffsetX: 200, OffsetY: 210 }]);
  for (const [label, values] of cases) {
    for (const [key, value] of Object.entries(values || {})) m.submit('HPColorsBar' + key + 'EnemyEntry', value);
    const c = canvasRect(m), s = m.settings().side.enemy;
    if (s.barWidth > ZOOM_WIDTH) expectZoomedOut(m, s.barWidth, label); // zoom-out above 136.7 px (tests below)
    else {
      assert.equal(computed(scale, 'uiScale'), '142%', label + ': zoom never follows the bar');
      assert.ok(c.x === 0 && c.y === 0, label + ': canvas origin is the stage origin ' + JSON.stringify(c));
      assert.ok(Math.abs(c.w - STAGE_W) < 1e-9 && Math.abs(c.h - 210 * K) < 1e-9 && Math.abs(c.h - STAGE_H) < 0.5, label + ': canvas fills the stage');
    }
    const [tx, ty] = shift(); // the bar moves inside the canvas, so it paints at the mapping x its canvas position
    if (!(values && values.Width)) assert.ok(Math.abs(tx - x0 - s.barOffsetX) < 0.01 && Math.abs(ty - y0 - s.barOffsetY) < 0.01, label + ': renderer moved the bar by the offset');
    for (const key of Object.keys(values || {})) m.submit('HPColorsBar' + key + 'EnemyEntry', base['bar' + key]);
  }
  m.fire('HPColorsEnabledToggle', 'onactivate');
  assert.equal(computed(scale, 'uiScale'), '142%', 'master off keeps the mapping');
  m.fire('HPColorsEnabledToggle', 'onactivate');
  m.fire('HPColorsNavUnitsButton', 'onactivate');
  assert.equal(computed(stage, 'height'), '280px', 'unit kinds keep their stage');
  assert.notEqual(computed(scale, 'uiScale'), undefined);
  m.fire('HPColorsNavBarButton', 'onactivate');
  assert.equal(computed(scale, 'uiScale'), '142%'); assert.equal(canvasRect(m).x, 0);
});

test('ticket 22c live 1:1: SHOW BOUNDS rim coincides with the HERO stage inner box', () => {
  const m = booted({ previewLayout: true }); m.open();
  m.fire('HPColorsShowBoundsToggle', 'onactivate');
  const rim = m.find('HPColorsPreviewCanvasBounds');
  assert.equal(computed(rim, 'visibility'), 'visible');
  assert.equal(computed(rim, 'width'), '100%'); assert.equal(computed(rim, 'height'), '100%');
  const c = canvasRect(m);
  assert.deepEqual([c.x, c.y, c.w], [0, 0, STAGE_W]); assert.ok(Math.abs(c.h - STAGE_H) < 0.5, 'rim height ' + c.h);
});

// Ticket 22c live checks 5-8: a scene render ignores scissor clipping (overflow: clip, clip: rect() on itself
// or a parent); only a layered parent clips it (live 8). Unlayered panel:// copies drew nothing (live 6), while
// copies of a layered source render (live 8). In-panel fractions of the shop framing, measured from the live 8
// 596x685 panel: hat top 0.2102 of the height, hat brim 0.1846 of the width, hat centre 0.498 of the width.
const HAT = { top: 0.2102, width: 0.1846, cx: 0.498 };
function bustGeometry(m) {
  const model = m.find('HPColorsPreviewHeroModel'), px = key => parseFloat(computed(model, key));
  const w = px('width'), h = px('height'), x = px('marginLeft'), y = px('marginTop');
  return { model, w, h, x, y, hatTop: y + HAT.top * h, hatWidth: HAT.width * w, hatCx: x + HAT.cx * w };
}

// Live check 8: scene renders ignore scissor clipping (overflow: clip, clip: rect()) but a parent forced onto
// its own composition layer (opacity < 1 or an opacity-brush) clips them; background-color alone does not.
test('ticket 22c live 8 / ticket 27: the oversized scene is clipped at the layered plate window, not the camera stage', () => {
  const m = booted({ previewLayout: true }); m.open();
  const g = bustGeometry(m), scale = m.find('HPColorsPreviewScale'), stage = m.find('HPColorsPreviewStage');
  const frame = m.find('HPColorsPreviewHeroFrame');
  assert.ok(g.model.GetParent() === frame && frame.GetParent() === stage && stage.children.indexOf(frame) < stage.children.indexOf(scale));
  assert.equal(computed(frame, 'width'), '100%'); assert.equal(computed(frame, 'height'), '100%');
  assert.equal(computed(frame, 'margin'), undefined); assert.equal(computed(frame, 'marginTop'), undefined);
  const scene = m.find('HPColorsPreviewSceneWindow');
  assert.ok(stage.GetParent() === scene);
  for (const unlayered of [stage, frame]) {
    assert.equal(computed(unlayered, 'overflow'), 'noclip');
    assert.equal(computed(unlayered, 'opacityBrush'), undefined);
    assert.equal(computed(unlayered, 'opacityMask'), undefined);
    assert.equal(computed(unlayered, 'opacity'), undefined);
  }
  assert.equal(computed(scene, 'overflow'), 'clip');
  assert.match(computed(scene, 'opacityBrush'), /^gradient\(\s*linear, 0% 0%, 0% 100%, from\(\s*#ffffff\s*\), to\(\s*#ffffff\s*\)\s*\)$/, 'solid-white opacity brush, fully visible');
  assert.equal(computed(g.model, 'clip'), undefined, 'no ignored clip: rect() left on the scene panel');
  assert.equal(computed(g.model, 'transform'), undefined, 'sized by layout, not a transform');
  assert.ok(Math.abs(g.w / g.h - 596 / 685) < 0.005, 'live 8 panel aspect kept, so the camera image only scales');
  // User 2026-10-15: keep the live reference hat size/top, but centre it horizontally in the canvas.
  // User 2026-10-16: model 10% higher (30 stage px = 21.1 canvas) and camera 10% wider (g = 0.9 about the hat):
  // hat 45.8 * 0.9 = 41.2 wide, top 130.6 - 21.1 = 109.5, centre x 100 (50% of width).
  const unit = { width: g.hatWidth / K, top: g.hatTop / K, cx: g.hatCx / K };
  assert.ok(Math.abs(unit.width - 41.2) < 1, 'hat width ' + JSON.stringify(unit));
  assert.ok(Math.abs(unit.top - 109.5) < 1, 'hat top ' + JSON.stringify(unit));
  assert.ok(Math.abs(unit.cx - 100) < 1, 'hat centre ' + JSON.stringify(unit));
  assert.ok(Math.abs(unit.top / 210 - 0.521) < 0.01 && Math.abs(unit.cx / 200 - 0.5) < 0.01);
  const shown = () => computed(g.model, 'visibility');
  assert.equal(shown(), 'visible');
  m.fire('HPColorsNavUnitsButton', 'onactivate'); assert.equal(shown(), 'collapse');
  m.fire('HPColorsNavBarButton', 'onactivate'); m.cancel(); assert.equal(shown(), 'collapse');
  assert.equal(g.model.styleWrites.length + frame.styleWrites.length, 0, 'static CSS, no JS');
});

test('ticket 22c live 8 guard: the scene-window ancestor stays layered and clipped across kind switches', () => {
  const m = booted(); m.open();
  const scene = m.find('HPColorsPreviewSceneWindow'), model = m.find('HPColorsPreviewHeroModel');
  assert.ok(inside(model, scene));
  const brush = computed(scene, 'opacityBrush'), opacity = computed(scene, 'opacity');
  const layered = (!!brush && brush !== 'none') || (opacity !== undefined && parseFloat(opacity) < 1);
  assert.ok(layered, 'scene window needs an opacity-brush or opacity < 1; overflow: clip alone spills');
  assert.equal(computed(scene, 'overflow'), 'clip');
  for (const kind of ['Neutral', 'Objective']) { m.fire('HPColorsNavUnitsButton', 'onactivate'); m.fire('HPColorsPreviewKindOption' + kind, 'onactivate'); }
  m.fire('HPColorsNavBarButton', 'onactivate');
  assert.equal(computed(scene, 'opacityBrush'), brush, 'stays layered across kind switches');
  m.pane().AddClass('HPC3PreviewUnavailable');
  assert.equal(computed(scene, 'opacity'), '0.35');
  assert.equal(computed(m.find('HPColorsPreviewStage'), 'opacity'), undefined, 'unavailable dimming cannot reinstate the short stage clip');
});

// Ticket 22c zoom-out (user 2026-10-15): above HERO_ZOOM_WIDTH = 136.7 px of active-side bar width the HERO
// camera pulls back by f = 136.7 / width about the 1:1 canvas centre (142, 149.1 stage px). The canvas mapping
// and the scene panel's layout size/margins scale together, so the model <-> canvas relation stays 1:1.
const CAMERA_KEYS = { HPColorsPreviewScale: ['uiScale'], HPColorsPreviewCanvas: ['marginLeft', 'marginTop'],
  HPColorsPreviewHeroModel: ['width', 'height', 'marginLeft', 'marginTop'] };
function cameraWrites(m) {
  return Object.entries(CAMERA_KEYS).reduce((sum, [id, keys]) =>
    sum + m.find(id).styleWrites.filter(write => keys.includes(write.property)).length, 0);
}
function heroUnits(m) {
  const c = canvasRect(m), g = bustGeometry(m);
  return { c, g, width: g.hatWidth / c.z, top: (g.hatTop - c.y) / c.z, cx: (g.hatCx - c.x) / c.z };
}
function expectOneToOne(m, label) {
  const c = canvasRect(m), model = m.find('HPColorsPreviewHeroModel');
  assert.equal(computed(m.find('HPColorsPreviewScale'), 'uiScale'), '142%', label + ': fixed 1:1 mapping');
  assert.ok(c.x === 0 && c.y === 0, label + ': canvas origin is the stage origin ' + JSON.stringify(c));
  assert.deepEqual(['width', 'height', 'marginLeft', 'marginTop'].map(key => computed(model, key)),
    ['316.8px', '364.5px', '-15.8px', '78.8px'], label + ': model at the centred 1:1 geometry');
}
function expectZoomedOut(m, width, label) {
  const f = ZOOM_WIDTH / width, u = heroUnits(m), c = u.c;
  assert.ok(Math.abs(c.z - K * f) < 0.001, label + ': canvas mapping k = 1.42 * ' + f + ', got ' + c.z);
  assert.ok(Math.abs(c.x + c.w / 2 - ANCHOR.x) < 0.2 && Math.abs(c.y + c.h / 2 - ANCHOR.y) < 0.2, label + ': canvas centred on the anchor ' + JSON.stringify(c));
  assert.ok(Math.abs(u.g.w - 316.8 * f) < 0.5 && Math.abs(u.g.h - 364.5 * f) < 0.5, label + ': model scaled by f ' + JSON.stringify([u.g.w, u.g.h]));
  assert.ok(Math.abs(u.g.w / u.g.h - 596 / 685) < 0.005, label + ': model aspect kept');
  assert.ok(Math.abs(u.width - 41.2) < 1 && Math.abs(u.top - 109.5) < 1 && Math.abs(u.cx - 100) < 1,
    label + ': model <-> canvas relation unchanged ' + JSON.stringify([u.width, u.top, u.cx]));
  assert.ok(Math.abs(width * c.z - ZOOM_WIDTH * K) < 0.5, label + ': bar keeps its 136.7 px on-stage width');
}

test('ticket 22c zoom-out: at or below 136.7 px the HERO camera is the exact live 1:1 mapping with no JS geometry writes', () => {
  const m = booted({ previewLayout: true }); m.open();
  assert.equal(m.settings().side.enemy.barWidth, 116.92);
  expectOneToOne(m, 'default 116.92');
  m.submit('HPColorsBarWidthEnemyEntry', ZOOM_WIDTH); assert.equal(m.settings().side.enemy.barWidth, ZOOM_WIDTH);
  expectOneToOne(m, 'exactly 136.7');
  assert.equal(m.find('HPColorsPreviewHeroModel').styleWrites.length, 0, 'model stays on its static CSS');
});

test('ticket 22c zoom-out: widths 200 and 316 pull the camera back by 136.7/w, model and SHOW BOUNDS follow, bar stays inside', () => {
  const m = booted({ previewLayout: true }); m.open();
  m.fire('HPColorsShowBoundsToggle', 'onactivate');
  const rim = m.find('HPColorsPreviewCanvasBounds');
  for (const width of [200, 316]) {
    m.submit('HPColorsBarWidthEnemyEntry', width); assert.equal(m.settings().side.enemy.barWidth, width);
    expectZoomedOut(m, width, 'width ' + width);
    assert.equal(computed(rim, 'visibility'), 'visible'); // the rim is 100% of the scaled canvas
    assert.equal(computed(rim, 'width'), '100%'); assert.equal(computed(rim, 'height'), '100%');
  }
  // Width 316 with default offsets: the bar (6.5 px player inset, renderer offset) paints inside the stage.
  const s = m.settings().side.enemy, c = canvasRect(m), g = m.preview().facts.geometry;
  const cx = g.status.x + g.info.x + g.stack.x + g.primary.x + g.primary.width / 2;
  const [tx, ty] = m.find('HPColorsPreviewBars').style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/).slice(1).map(Number);
  const centre = g.canvas.width / 2 + (cx - g.canvas.width / 2) * (s.barWidth / 79) + tx;
  const left = c.x + (centre - s.barWidth / 2) * c.z, right = c.x + (centre + s.barWidth / 2) * c.z;
  const top = c.y + (74 + ty - s.barHeight / 2) * c.z, bottom = c.y + (74 + ty + s.barHeight / 2) * c.z;
  assert.ok(left >= 0 && right <= STAGE_W && top >= 0 && bottom <= STAGE_H, 'bar inside the stage ' + JSON.stringify([left, right, top, bottom]));
  // Back to the default width restores the exact 1:1 CSS geometry.
  m.submit('HPColorsBarWidthEnemyEntry', 116.92); expectOneToOne(m, 'back to default');
  m.submit('HPColorsBarWidthEnemyEntry', 316); m.fire('HPColorsEnabledToggle', 'onactivate');
  expectOneToOne(m, 'master off paints the stock bar, so 1:1');
});

test('ticket 22c zoom-out: camera writes happen only when f changes, never on HP, play or repeat settings', () => {
  const m = booted({ previewLayout: true }); m.open();
  const initial = cameraWrites(m);
  m.submit('HPColorsBarWidthEnemyEntry', 200);
  const before = cameraWrites(m);
  // Zoom, both canvas margins and the four model geometry properties change once.
  assert.equal(before - initial, 7, 'the zoom-out wrote each camera property once');
  m.slider(40); m.slider(90);
  m.play(); m.h.scheduler.runFor(1000); m.h.scheduler.runFor(5000);
  m.h.$.HPColorsV3Preview.setSettings(m.settings()); m.h.$.HPColorsV3Preview.setSettings(m.settings());
  m.submit('HPColorsBarHeightEnemyEntry', 20);
  assert.equal(cameraWrites(m), before, 'unchanged f writes nothing');
  m.fire('HPColorsNavUnitsButton', 'onactivate'); m.fire('HPColorsNavBarButton', 'onactivate');
  const model = m.find('HPColorsPreviewHeroModel').styleWrites.length;
  m.slider(30); assert.equal(m.find('HPColorsPreviewHeroModel').styleWrites.length, model, 'Units round trip: model untouched at the same f');
  expectZoomedOut(m, 200, 'after Units round trip');
});

test('ticket 22c zoom-out: only the active side width drives the HERO camera', () => {
  const m = booted({ previewLayout: true }); m.open();
  m.submit('HPColorsBarWidthEnemyEntry', 316);
  assert.equal(m.settings().side.ally.barWidth <= ZOOM_WIDTH, true, 'ally keeps a 1:1 width');
  expectZoomedOut(m, 316, 'enemy 316');
  m.fire('HPColorsPreviewSideOptionAlly', 'onactivate'); assert.equal(m.preview().side, 'ally');
  expectOneToOne(m, 'ally default');
  m.submit('HPColorsBarWidthAllyEntry', 200); expectZoomedOut(m, 200, 'ally 200');
  m.fire('HPColorsPreviewSideOptionEnemy', 'onactivate'); expectZoomedOut(m, 316, 'enemy again');
});

test('ticket 22c zoom-out: a reincluded preview hands the model back at 1:1 and the new instance zooms it again', () => {
  const m = booted({ previewLayout: true }); m.open();
  m.submit('HPColorsBarWidthEnemyEntry', 316); expectZoomedOut(m, 316, 'before reinclusion');
  runInVm(fs.readFileSync(path.join(sourceRoot, 'panorama/scripts/hp_colors_v3_preview.js'), 'utf8'), m.boot.context, 'preview-reinclude.js');
  const model = m.find('HPColorsPreviewHeroModel');
  assert.deepEqual(['width', 'height', 'marginLeft', 'marginTop'].map(key => computed(model, key)), ['316.8px', '364.5px', '-15.8px', '78.8px']);
  assert.equal(m.h.$.HPColorsV3Preview.attach(m.find('HPColorsMenuHost'), m.settings()), true);
  m.h.$.HPColorsV3Preview.open(); expectZoomedOut(m, 316, 'new instance');
});

for (const width of [116.92, 200, 316]) for (const remount of ['onload', 'attach']) {
  test('F5: unchanged HERO width ' + width + ' rewrites every cache after tree remount via ' + remount, () => {
    const m = booted({ previewLayout: true }); m.open();
    if (width !== 116.92) m.submit('HPColorsBarWidthEnemyEntry', width);
    m.h.scheduler.runFor(1000);
    const before = m.find('HPColorsPreviewCanvas'), config = m.settings();
    if (remount === 'onload') walk(m.h.contextPanel, panel => { panel.valid = false; });
    m.boot.mount();
    modelPreviewLayout(m, 1);
    if (remount === 'onload') { m.boot.onload(); m.open(); }
    else {
      assert.equal(before.IsValid(), true, 'the old pane still exists under another root');
      assert.equal(m.h.$.HPColorsV3Preview.attach(m.find('HPColorsMenuHost'), config), true);
      m.h.$.HPColorsV3Preview.open();
    }
    m.h.scheduler.runFor(1000);
    assert.ok(m.find('HPColorsPreviewCanvas') !== before, 'new panel identity');
    assert.equal(m.preview().available, true); assert.equal(m.preview().open, true);
    assert.equal(m.preview().facts.side, 'enemy'); assert.equal(m.preview().hp, 75);
    assert.equal(m.find('HPColorsPreviewBarVisualFill').style.preTransformScale2d, '0.75, 1');
    assert.equal(m.find('HPColorsPreviewBarVisualFill').style.transform, 'translateX(-8.62px)');
    assert.notEqual(m.find('HPColorsPreviewCanvas').style.marginLeft, undefined, 'new canvas receives its cached left');
    assert.notEqual(m.find('HPColorsPreviewCanvas').style.marginTop, undefined, 'new canvas receives its cached top');
    if (width === 116.92) expectOneToOne(m, remount);
    else expectZoomedOut(m, width, remount);
    const writes = cameraWrites(m);
    m.h.$.HPColorsV3Preview.setSettings(config);
    m.slider(40); m.h.scheduler.runFor(1000);
    assert.equal(cameraWrites(m), writes, 'camera writes remain cached on the adopted tree');
  });
}

test('ally parity: native HP follows the stock damage gate, not the custom-number setting or an invented live level', () => {
  const m = booted({ previewLayout: true }); m.open();
  m.fire('HPColorsPreviewSideOptionAlly', 'onactivate');
  const hp = m.find('HPColorsPreviewHpText'), level = m.find('HPColorsPreviewLevel');
  const world = loadLayout('unit_status_overlay_v2.xml'), carrier = world.harness.root;
  carrier.classes = ['CLASS_PLAYER', 'player', 'friend', 'ShowAllyHealthValue'];
  const native = world.harness.contextPanel.FindChildTraverse('UnitHealthbarValue');
  assert.equal(m.settings().side.ally.hpTextVisible, false, 'ally defaults release the native number');
  assert.equal(m.preview().facts.level, 0, 'the world planner does not read ally levels');
  assert.equal(computed(level, 'visibility'), 'collapse', 'no stock ally-level badge exists to fabricate');
  m.slider(83);
  assert.equal(hp.text, '830', '1000-max-HP sample produces 830 only at 83%, not at its default 75%');
  assert.equal(computed(hp, 'visibility'), computed(native, 'visibility'), 'ShowAllyHealthValue reserves the native label');
  assert.equal(computed(hp, 'opacity'), '0', 'idle native HP is not forced visible just to imitate a screenshot');
  assert.equal(computed(hp, 'horizontalAlign'), 'right');
  assert.equal(computed(hp, 'marginRight'), '70px', 'world plan compensates the 200px canvas back to the native 100px frame');
  assert.equal(computed(hp, 'marginTop'), '66px', 'native label sits below the bar, not in the custom readout row');
  assert.ok(hp.GetParent() === m.find('HPColorsPreviewInfo'));
  m.play(); m.h.scheduler.runFor(450);
  carrier.AddClass('active_damage');
  assert.equal(m.preview().shown, 72);
  assert.equal(computed(hp, 'opacity'), computed(native, 'opacity'), 'damage opens the same native opacity gate');
  assert.equal(computed(hp, 'opacity'), '1');
  assert.equal(computed(hp, 'transitionDelay'), computed(native, 'transitionDelay'));
  m.h.scheduler.runFor(1800);
  assert.equal(m.preview().shown, 28, 'healing step');
  assert.equal(computed(hp, 'opacity'), '0', 'healing no longer advertises active damage');
  m.slider(83);
  m.fire('HPColorsHpTextVisibleAllyToggle', 'onactivate');
  assert.equal(computed(hp, 'opacity'), '1', 'custom HP explicitly bypasses the native damage gate');
  assert.ok(hp.GetParent() === m.find('HPColorsPreviewReadoutLine'));
  m.fire('HPColorsHpTextVisibleAllyToggle', 'onactivate');
  assert.equal(computed(hp, 'opacity'), '0', 'release returns to native idle presentation');
});

test('ticket 27: the unbacked preview column holds a rough paper plate around the centred unchanged stage', () => {
  const m = booted({ previewLayout: true }); m.open();
  const pane = m.pane(), stage = m.find('HPColorsPreviewStage'), plate = m.find('HPColorsPreviewPlate'), title = m.find('HPColorsPreviewTitle');
  assert.equal(computed(pane, 'backgroundColor'), undefined); assert.equal(computed(pane, 'borderLeft'), undefined);
  assert.equal(computed(pane, 'padding'), '110px 22px 18px 22px', 'leave the engine party-icon area clear');
  const scene = m.find('HPColorsPreviewSceneWindow');
  assert.ok(stage.GetParent() === scene && scene.GetParent() === plate && plate.GetParent() === pane);
  assert.equal(computed(plate, 'padding'), '8px');
  assert.equal(scene.GetAttributeString('hittest', ''), 'false'); assert.equal(scene.GetAttributeString('hittestchildren', ''), 'false');
  assert.equal(computed(scene, 'width'), '100%'); assert.equal(computed(scene, 'height'), '100%');
  assert.ok(parseFloat(computed(plate, 'height')) - 16 > parseFloat(computed(stage, 'height')), 'scene window extends beyond the stage bottom');
  assert.equal(plate.GetAttributeString('hittest', ''), 'false'); assert.equal(plate.GetAttributeString('hittestchildren', ''), 'false');
  assert.equal(computed(plate, 'backgroundColor'), '#59544C'); assert.equal(computed(plate, 'borderRadius'), '10px');
  assert.match(computed(plate, 'opacityMask'), /masks\/rough_edge_01_png\.vtex/);
  const backdrop = m.find('HPColorsPreviewBackdrop');
  assert.ok(backdrop.GetParent() === scene && scene.children.indexOf(backdrop) < scene.children.indexOf(stage));
  assert.equal(backdrop.paneltype, 'Image'); assert.equal(backdrop.GetAttributeString('src', ''), 's2r://panorama/images/buttons/temp_preview_panel_subtitles_png.vtex');
  assert.equal(backdrop.GetAttributeString('scaling', ''), 'stretch-to-cover-preserve-aspect'); assert.equal(backdrop.GetAttributeString('hittest', ''), 'false');
  assert.equal(computed(backdrop, 'width'), '100%'); assert.equal(computed(backdrop, 'height'), '100%');
  assert.equal(computed(backdrop, 'opacityMask'), undefined, 'one shared window masks both backdrop and model');
  assert.equal(computed(stage, 'width'), '286px'); assert.equal(computed(stage, 'height'), '300px'); assert.equal(computed(stage, 'border'), '1px solid #00000000');
  assert.equal(computed(stage, 'horizontalAlign'), 'center'); assert.equal(computed(stage, 'verticalAlign'), 'center');
  assert.equal(computed(m.find('HPColorsPreviewScale'), 'uiScale'), '142%');
  assert.equal(computed(title, 'fontSize'), '24px'); assert.equal(computed(title, 'fontWeight'), 'bold'); assert.equal(computed(title, 'color'), '#FFEFD7CC');
  const frame = m.find('HPColorsPreviewHeroFrame');
  assert.equal(computed(frame, 'opacityMask'), undefined);
  assert.match(computed(scene, 'opacityMask'), /shop\/catalog\/cards\/icon_mask03_psd\.vtex/);
  assert.match(computed(scene, 'opacityBrush'), /from\(#ffffff\), to\(#ffffff\)/, 'vignette never replaces the live-proven clipping layer');
  assert.equal(computed(m.find('HPColorsPreviewHeroModel'), 'opacityMask'), undefined, 'mask belongs to the shared scene window');
  m.fire('HPColorsNavUnitsButton', 'onactivate'); assert.equal(computed(stage, 'height'), '280px');
  assert.equal(computed(plate, 'backgroundColor'), '#59544C');
});

test('ticket 27: preview side and kind controls are stock pills whose fill tracks every selection and page switch', () => {
  const m = booted(); m.open();
  function selected(key, choice, options) {
    for (const option of options) {
      const pill = m.find('HPColorsPreview' + key + 'Option' + option);
      assert.equal(pill.BHasClass('SecondaryButton'), true); assert.equal(pill.BHasClass('light'), true);
      assert.equal(pill.BHasClass('HPC3SegmentButton'), false, 'setting-radio styles must not strip preview pills');
      assert.equal(pill.BHasClass('Selected'), option === choice); assert.equal(pill.BHasClass('fill'), option === choice);
      assert.equal(pill.children[0].GetAttributeString('hittest', ''), 'false');
    }
  }
  selected('Side', 'Enemy', ['Enemy', 'Ally']); m.fire('HPColorsPreviewSideOptionAlly', 'onactivate'); selected('Side', 'Ally', ['Enemy', 'Ally']);
  m.fire('HPColorsNavUnitsButton', 'onactivate'); selected('Kind', 'Neutral', ['Neutral', 'Objective']);
  for (const kind of ['Objective', 'Neutral']) {
    m.fire('HPColorsPreviewKindOption' + kind, 'onactivate'); selected('Kind', kind, ['Neutral', 'Objective']);
    assert.equal(computed(m.find('HPColorsPreviewSideSegment'), 'visibility'), kind === 'Neutral' ? 'collapse' : undefined);
  }
  m.fire('HPColorsNavBarButton', 'onactivate'); selected('Side', 'Ally', ['Enemy', 'Ally']);
});

test('ticket 27: Health label, native slider and live value share one row; sliding still paints the selected sample', () => {
  const m = booted(); m.open();
  const slider = m.find('HPColorsPreviewHealthSlider'), row = slider.GetParent(), value = m.find('HPColorsPreviewHealthValue'), label = row.children[0];
  assert.deepEqual(row.children.map(panel => panel.paneltype), ['Label', 'Slider', 'Label']);
  assert.ok(row.children[1] === slider && row.children[2] === value);
  assert.equal(label.text, 'Health'); assert.equal(computed(label, 'width'), '100px'); assert.equal(computed(row, 'flowChildren'), 'right');
  assert.equal(computed(slider, 'maxWidth'), '240px'); assert.equal(computed(slider, 'height'), '30px');
  for (const id of ['SliderTrack', 'SliderTrackProgress', 'SliderThumb']) {
    const native = m.h.$.CreatePanel('Panel', slider, id);
    assert.equal(computed(native, 'backgroundColor'), undefined, 'number slider inherits stock ' + id);
  }
  m.slider(37); assert.equal(value.text, '37%'); assert.ok(Math.abs(m.preview().facts.fraction - 0.37) < 1e-9);
  m.fire('HPColorsPreviewSideOptionAlly', 'onactivate'); m.slider(63); assert.equal(value.text, '63%');
  assert.equal(m.preview().side, 'ally'); assert.ok(Math.abs(m.preview().facts.fraction - 0.63) < 1e-9);
});

test('preview Play stays a stock light-filled pill while playing; status and help use stock dim text', () => {
  const m = booted(); m.open();
  const play = m.find('HPColorsPreviewPlay'), label = m.find('HPColorsPreviewPlayLabel');
  const status = m.find('HPColorsPreviewStatus'), note = m.find('HPColorsPreviewNote');
  for (const panel of [status, note]) {
    assert.equal(computed(panel, 'color'), panel === note ? '#FFEFD788' : '#FFEFD744'); assert.equal(panel.GetAttributeString('hittest', ''), 'false');
  }
  assert.equal(computed(status, 'fontSize'), '16px'); assert.equal(computed(note, 'fontSize'), '16px');
  assert.equal(computed(note, 'whiteSpace'), 'normal'); assert.equal(label.GetAttributeString('hittest', ''), 'false');
  for (const playing of [true, false]) {
    m.play(); assert.equal(m.preview().playing, playing); assert.equal(label.text, playing ? 'STOP' : 'PLAY DAMAGE / HEAL');
    for (const name of ['SecondaryButton', 'light', 'fill']) assert.equal(play.BHasClass(name), true);
    for (const property of ['width', 'height', 'backgroundColor', 'border']) assert.equal(computed(play, property), undefined, 'inherits native pill ' + property);
    assert.equal(computed(label, 'color'), undefined, 'no old green/amber Playing override');
    assert.equal(computed(label, 'verticalAlign'), 'center'); assert.equal(computed(label, 'horizontalAlign'), 'center'); assert.equal(computed(label, 'marginBottom'), '0px');
  }
});

test('ticket 29: Health input uses the native 0-100 value directly, clamps and rounds without editing settings', () => {
  const m = booted(); m.open();
  const before = m.settings(), slider = m.find('HPColorsPreviewHealthSlider');
  assert.deepEqual([slider.min, slider.max, slider.increment], [0, 100, 1]);
  // This tests delivered native values, not the engine's pointer hit-test or track-to-value mapping.
  for (const [raw, expected] of [[0, 0], [25, 25], [50, 50], [75, 75], [100, 100],
    [37.6, 38], [-10, 0], [110, 100]]) {
    m.slider(raw);
    assert.equal(m.preview().hp, expected);
    assert.equal(m.find('HPColorsPreviewHealthValue').text, expected + '%');
    assert.equal(m.find('HPColorsPreviewHpText').text, String(expected * 10));
  }
  for (const raw of [NaN, Infinity, 'not a number']) {
    m.slider(raw); assert.equal(m.preview().hp, 100, 'non-finite native values are ignored');
  }
  assert.deepEqual(m.settings(), before);
  for (let node = slider; node; node = node.GetParent()) {
    assert.notEqual(node.GetAttributeString('hittestchildren', ''), 'false', 'no disabled hit-test ancestor');
  }
  const plate = m.find('HPColorsPreviewPlate');
  assert.equal(plate.GetAttributeString('hittestchildren', ''), 'false', 'oversized scene cannot intercept slider input');
});

for(const label of ['Critical','Assassinate','Unkillable']) test(`ticket 28: preview ${label} label reflects visibility and position then releases`,()=>{
  const m=booted({previewLayout:true}),key=label.toLowerCase();
  m.open();m.slider(10);
  const panel=m.find('HPColorsPreview'+label+'Indicator'),canvas=m.find('HPColorsPreviewCanvas');
  assert.equal(computed(panel,'visibility'),label==='Critical'?'visible':'collapse');
  m.submit('HPColors'+label+'OffsetXEntry',12);m.submit('HPColors'+label+'OffsetYEntry',-7);
  const anchor=m.find('HPColorsPreview'+label+'Anchor');
  assert.ok(panel.GetParent()===anchor);
  assert.equal(anchor.style.transform,'translate3d(12px, -10.8px, 0px)');
  assert.equal(computed(panel,'visibility'),'visible','editing a normally inactive status shows its sample');
  m.fire('HPColors'+label+'IndicatorVisibleToggle','onactivate');
  assert.equal(computed(panel,'visibility'),'collapse');
  assert.equal(m.settings().shared[key+'IndicatorVisible'],false);
  m.fire('HPColors'+label+'IndicatorVisibleToggle','onactivate');
  assert.equal(computed(panel,'visibility'),'visible');
  m.submit('HPColorsBarOffsetXEnemyEntry',20);m.submit('HPColorsBarOffsetYEnemyEntry',15);
  assert.equal(anchor.style.transform,'translate3d(32px, 8px, 0px)');
  m.submit('HPColors'+label+'OffsetXEntry',0);m.submit('HPColors'+label+'OffsetYEntry',0);
  assert.ok(panel.GetParent()===canvas);assert.equal(anchor.style.transform,'');
  m.submit('HPColors'+label+'OffsetXEntry',12);
  m.fire('HPColorsEnabledToggle','onactivate');
  assert.ok(panel.GetParent()===canvas);assert.equal(anchor.style.transform,'');
  assert.equal(computed(m.find('HPColorsPreviewCriticalIndicator'),'visibility'),'visible','master off retains native critical state');
});

test('the sample tree supplies exactly the renderer part table plus its own three parts', () => {
  // Behaviour, not source text: the parts the preview hands the shared painter are the renderer's preview rows
  // plus canvas/fx/visualFill (and the row's percent label), each a live panel of the sample pane.
  const boot = loadLayout('hud_escape_menu.xml');
  boot.includeScripts();
  const h = boot.harness, renderer = h.$.HPColorsV3Renderer, createPainter = renderer.createPainter;
  let handed = null;
  renderer.createPainter = function (canvas, parts) { handed = parts; return createPainter.apply(this, arguments); };
  boot.onload();
  assert.ok(handed, 'the preview attached and created its painter');
  const pane = h.contextPanel.FindChildTraverse('HPColorsPreview');
  const published = renderer.parts.filter(def => def.preview && def.find !== 'derived').map(def => def.key);
  // hpPercent and pickupSamples are derived by the preview from the row and the pickup container, not looked up by id.
  const derived = ['hpPercent', 'pickupSamples'];
  assert.deepEqual(Object.keys(handed).sort(), [...published, 'canvas', 'fx', 'visualFill', ...derived].sort());
  for (const key of Object.keys(handed).filter(key => !derived.includes(key))) {
    const panel = handed[key];
    assert.ok(panel && panel.IsValid(), key + ' is a live panel');
    assert.ok(pane.FindChildTraverse(panel.id) === panel, key + ' is inside the sample pane');
  }
});

test('the shared painter reports painted and reason; the status line and inspect read them', () => {
  const m = booted();
  m.open();
  const text = m.find('HPColorsPreviewStatus').text, state = m.preview();
  assert.match(text, /Your settings|Stock look|Waiting for layout|HP Colors is off|Turn on Customize/);
  assert.equal(state.status, text);
  assert.equal(state.painted, /Your settings/.test(text));
});
