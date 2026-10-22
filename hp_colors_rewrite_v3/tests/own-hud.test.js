'use strict';
// Ticket 22: own bottom-HUD health color (v2 paintHudHealthWash) and SHOW BOUNDS session scope,
// through the real Escape menu, storage bridge and hosted page.
const assert = require('node:assert/strict');
const test = require('node:test');
const { MockPanel, latestPublishedConfig } = require('./boot-layout');
const { profile, launch, CURRENT } = require('./storage-fixture');

const TEXTURE = 'url("s2r://panorama/images/hud/healthbar/healthbar_fill_texture_png.vtex")';
const PROPS = ['backgroundImage', 'backgroundColor', 'washColor'];
const WHITE = [TEXTURE, '#FFFFFF', '#FFFFFF'], STOCK = ['', '', ''];

// The engine HUD is reached from the Escape menu's top panel by id; its bar is found by traversal.
function hudTree(f, team = 'team1', leftover, existing) {
  const hud = existing || new MockPanel('Panel', f.harness.root, 'Hud');
  const middle = new MockPanel('Panel', hud, 'HudMiddle');
  const container = new MockPanel('Panel', middle, 'health_and_abilities_container');
  if (team) container.AddClass(team);
  const wrapper = new MockPanel('Panel', container, 'HealthWrapper');
  const bars = new MockPanel('Panel', wrapper, 'hud_health_bars');
  const bar = new MockPanel('Panel', bars, 'health_bar');
  const right = new MockPanel('Panel', bar, 'health_bar_Right');
  const left = new MockPanel('Panel', bar, 'health_bar_Left');
  // A unit-status-like panel inside the HUD that must never be touched.
  const decoy = new MockPanel('Panel', hud, 'unit_healthbar_lagging');
  if (leftover) Object.assign(left.style, leftover);
  for (const panel of [hud, container, bars, bar, right, left, decoy]) panel.__styleWrites.length = 0;
  return { hud, container, wrapper, bars, bar, right, left, decoy };
}
function look(panel) { return PROPS.map(key => panel.style[key] || ''); }
function contract(f) { return f.harness.$.HPColorsV3Settings; }
function find(f, id) { const panel = f.harness.contextPanel.FindChildTraverse(id); assert.ok(panel, id); return panel; }
function setMode(f, value) {
  const row = contract(f).controls.find(r => r.key === 'hudHealthColorMode');
  find(f, row.options.find(o => o.value === value).id).events.onactivate();
}
function setHex(f, key, value) {
  const entry = find(f, contract(f).controls.find(r => r.key === key).hexId);
  entry.text = value; entry.events.ontextentrysubmit();
}
function master(f) { find(f, contract(f).controls.find(r => r.key === 'enabled').toggleId).events.onactivate(); }
function bounds(f) { find(f, 'HPColorsShowBoundsToggle').events.onactivate(); }
function hudJobs(f) { return f.harness.scheduler.jobs.filter(job => job.fn && job.fn.name === 'hudWatch'); }
function savedBody(p) { return Buffer.from(p.disk.get(CURRENT).split('.')[2], 'base64url').toString(); }

test('ticket 22: own HUD color rows are shared Bar settings with v2 defaults and plain help', () => {
  const f = launch(profile()); f.run(2000);
  const mode = contract(f).controls.find(r => r.key === 'hudHealthColorMode'), color = contract(f).controls.find(r => r.key === 'hudHealthColor');
  assert.deepEqual(JSON.parse(JSON.stringify([mode.side, mode.page, mode.level, mode.default, mode.kind, mode.options.map(o => o.value)])),
    ['shared', 'Bar', 'basic', 'off', 'segment', ['off', 'team', 'custom']]);
  assert.deepEqual(JSON.parse(JSON.stringify([color.side, color.page, color.default])), ['shared', 'Bar', '#FFFF00']);
  assert.equal(f.settings().shared.hudHealthColorMode, 'off'); assert.equal(f.settings().shared.hudHealthColor, '#FFFF00');
  const row = find(f, mode.rowId); row.events.onmouseover();
  const tooltip = f.harness.dispatches.at(-1);
  assert.equal(tooltip[0], 'UIShowTextTooltip'); assert.ok(tooltip[1] === row);
  const help = tooltip[2];
  assert.match(help, /Off: plain white bar/); assert.match(help, /Turn HP Colors off to get the game's colors back/);
  for (const word of ['native', 'CSS', 'adopted', "v2's", 'lineage', 'gate', 'stock']) assert.ok(!help.includes(word), word);
});

test('ticket 22: OFF paints the v2 plain white bar, TEAM follows team1/team2, CUSTOM uses its color; runtime edits repaint', () => {
  const f = launch(profile()), h = hudTree(f, 'team1'); f.run(2000);
  assert.equal(f.status(), 'Saved');
  assert.deepEqual(look(h.left), WHITE, 'default OFF is the v2 plain white bar while HP Colors is on');
  setMode(f, 'team'); assert.deepEqual(look(h.left), [TEXTURE, '#FFFFFF', '#E7B659'], 'team1 Amber at once');
  h.container.RemoveClass('team1'); h.container.AddClass('team2'); f.run(1000);
  assert.deepEqual(look(h.left), [TEXTURE, '#FFFFFF', '#5B79E6'], 'a team change is followed by the 1 s check');
  h.container.AddClass('team1'); f.run(1000); assert.deepEqual(look(h.left), STOCK, 'conflicting team releases');
  h.container.RemoveClass('team1'); h.container.RemoveClass('team2'); f.run(1000); assert.deepEqual(look(h.left), STOCK, 'unknown team releases');
  h.container.AddClass('team2'); f.run(1000); assert.deepEqual(look(h.left), [TEXTURE, '#FFFFFF', '#5B79E6']);
  setMode(f, 'custom'); assert.deepEqual(look(h.left), [TEXTURE, '#FFFFFF', '#FFFF00']);
  setHex(f, 'hudHealthColor', '#12AB34'); assert.deepEqual(look(h.left), [TEXTURE, '#FFFFFF', '#12AB34']);
  setMode(f, 'off'); assert.deepEqual(look(h.left), WHITE, 'OFF writes white (repaints at once) instead of clearing');
  for (const panel of [h.hud, h.container, h.bars, h.bar, h.right, h.decoy]) assert.equal(panel.__styleWrites.length, 0, panel.id + ' untouched');
  assert.ok(h.left.__styleWrites.every(write => PROPS.includes(write.property)), 'only the three owned properties');
  const writes = h.left.__styleWrites.length; f.run(5000);
  assert.equal(h.left.__styleWrites.length, writes, 'the watch never rewrites unchanged values');
  // Undo walks the HUD color back like any setting.
  find(f, 'HPColorsUndoButton').events.onactivate(); assert.deepEqual(look(h.left), [TEXTURE, '#FFFFFF', '#12AB34']);
});

test('ticket 22: HP Colors off releases all three properties exactly with null and stops watching; on repaints', () => {
  const f = launch(profile()), h = hudTree(f, 'team2'); f.run(2000);
  setMode(f, 'team'); assert.deepEqual(look(h.left), [TEXTURE, '#FFFFFF', '#5B79E6']);
  assert.equal(hudJobs(f).length, 1, 'one 1 s watch while on');
  h.left.__styleWrites.length = 0; master(f);
  assert.deepEqual(look(h.left), STOCK);
  assert.deepEqual(h.left.__styleWrites.map(w => [w.property, w.value]), PROPS.map(key => [key, null]), 'v2 clears with null, never ""');
  assert.equal(hudJobs(f).length, 0, 'off needs no watch'); f.run(5000); assert.equal(h.left.__styleWrites.length, 3, 'released once');
  master(f); assert.deepEqual(look(h.left), [TEXTURE, '#FFFFFF', '#5B79E6']); assert.equal(hudJobs(f).length, 1);
});

test('ticket 22: a replaced or moved HUD bar is found again and the old bar is released', () => {
  const f = launch(profile()), h = hudTree(f, 'team1'); f.run(2000);
  setMode(f, 'custom'); setHex(f, 'hudHealthColor', '#445566'); assert.deepEqual(look(h.left), [TEXTURE, '#FFFFFF', '#445566']);
  // Engine replaces the left fill: the dead panel is dropped, the new one is painted within a second.
  h.left.DeleteAsync(0); const left = new MockPanel('Panel', h.bar, 'health_bar_Left'); f.run(1000);
  assert.deepEqual(look(left), [TEXTURE, '#FFFFFF', '#445566']);
  // The bar moves under a new wrapper: the old panel is released before the new chain is used.
  const wrapper = new MockPanel('Panel', h.container, 'HealthWrapper2'); h.bars.SetParent(wrapper); f.run(1000);
  assert.deepEqual(look(left), [TEXTURE, '#FFFFFF', '#445566'], 'same bar, re-resolved');
  // A whole new HUD replaces the old one; the old bar is released.
  h.hud.SetParent(null); const g = hudTree(f, 'team2'); f.run(1000);
  assert.deepEqual(look(left), STOCK, 'old bar handed back'); assert.deepEqual(look(g.left), [TEXTURE, '#FFFFFF', '#445566']);
});

test('ticket 22: a pending load releases a previous context wash; saved colors and share codes restore after restart', () => {
  const p = profile();
  const pendingLaunch = launch(p, { dropTitle: () => true });
  const leftover = { backgroundImage: TEXTURE, backgroundColor: '#FFFFFF', washColor: '#123456' };
  const h = hudTree(pendingLaunch, 'team1', leftover);
  pendingLaunch.reload({ dropTitle: () => true }); pendingLaunch.run(500);
  assert.notEqual(pendingLaunch.status(), 'Saved');
  assert.deepEqual(look(h.left), STOCK, 'pending load: no wash, including an earlier context leftover');
  assert.equal(hudJobs(pendingLaunch).length, 0);
  const f = launch(p), first = hudTree(f, 'team1'); f.run(2000);
  setMode(f, 'custom'); setHex(f, 'hudHealthColor', '#0A0B0C'); f.run(3000);
  assert.match(savedBody(p), /"#0A0B0C"/);
  find(f, 'HPColorsSettingsCopyButton').events.onactivate();
  const code = find(f, 'HPColorsSettingsCodeEntry').text; assert.match(code, /^HPC3/);
  assert.deepEqual(look(first.left), [TEXTURE, '#FFFFFF', '#0A0B0C']);
  const again = launch(p), second = hudTree(again, 'team2'); again.run(3000);
  assert.deepEqual(look(second.left), [TEXTURE, '#FFFFFF', '#0A0B0C'], 'restored after restart');
  const fresh = launch(profile()), third = hudTree(fresh, 'team2'); fresh.run(2000);
  assert.deepEqual(look(third.left), WHITE);
  find(fresh, 'HPColorsSettingsCodeEntry').text = code; find(fresh, 'HPColorsSettingsImportButton').events.onactivate(); fresh.run(1000);
  assert.deepEqual(look(third.left), [TEXTURE, '#FFFFFF', '#0A0B0C'], 'a pasted code carries the HUD color');
});

test('ticket 22: SHOW BOUNDS never enters saves, share codes, presets or Undo; it survives a menu reload and resets on restart', () => {
  const p = profile(), f = launch(p); f.run(2000);
  f.edit('#654321'); f.run(3000);
  const saved = p.disk.get(CURRENT), writes = f.page.writes;
  const toggle = find(f, 'HPColorsShowBoundsToggle');
  assert.equal(toggle.BHasClass('Checked'), false);
  bounds(f); f.run(3000);
  assert.equal(toggle.BHasClass('Checked'), true); assert.equal(latestPublishedConfig(f.harness).showBounds, true);
  assert.equal(p.disk.get(CURRENT), saved, 'no save'); assert.equal(f.page.writes, writes, 'no store write');
  assert.ok(!/showbounds/i.test(savedBody(p)));
  for (const kind of ['Settings', 'Bundle']) {
    find(f, 'HPColors' + kind + 'CopyButton').events.onactivate();
    const code = find(f, 'HPColors' + kind + 'CodeEntry').text, decoded = f.harness.$.HPColorsV3Store['decode' + kind + 'Code'](code);
    assert.ok(!/showbounds/i.test(JSON.stringify(decoded)), kind + ' code has no view state');
  }
  find(f, 'HPColorsPresetNameEntry').text = 'Look one'; find(f, 'HPColorsPresetSaveButton').events.onactivate(); f.run(3000);
  const bundle = f.harness.$.HPColorsV3Store.getBundle();
  assert.equal(bundle.presets[0].name, 'Look one'); assert.ok(!/showbounds/i.test(JSON.stringify(bundle)), 'presets and bundle have no view state');
  // Undo takes back the color edit, never the view toggle.
  find(f, 'HPColorsUndoButton').events.onactivate(); f.run(1000);
  assert.equal(f.settings().side.enemy.barColorLow, '#FD4949'); assert.equal(latestPublishedConfig(f.harness).showBounds, true);
  assert.equal(find(f, 'HPColorsUndoButton').enabled, false, 'the toggle added no Undo step');
  // A reloaded Escape menu in the same game keeps it (v2 root attribute).
  f.reload(); f.run(3000);
  assert.equal(find(f, 'HPColorsShowBoundsToggle').BHasClass('Checked'), true); assert.equal(latestPublishedConfig(f.harness).showBounds, true);
  // A restarted game does not.
  const again = launch(p); again.run(3000);
  assert.equal(find(again, 'HPColorsShowBoundsToggle').BHasClass('Checked'), false);
  assert.equal(latestPublishedConfig(again.harness).showBounds, undefined);
  assert.equal(again.settings().side.enemy.barColorLow, '#FD4949');
});

test('ticket 22: HUD watch cost in the menu, and no watch without a HUD, while off or while loading', t => {
  // Audit 22: with no HUD yet, one 5 s identity watch looks for it while HP Colors is on; none while off.
  const bare = launch(profile()); bare.run(3000); assert.equal(hudJobs(bare).length, 1, 'no HUD yet: one identity watch');
  assert.equal(hudJobs(bare)[0].delay, 5, 'searched every 5 s'); master(bare); assert.equal(hudJobs(bare).length, 0, 'off: nothing scheduled');
  const f = launch(profile()), h = hudTree(f, 'team1'); f.run(3000);
  setMode(f, 'team'); f.run(1000);
  for (const key of Object.keys(f.harness.operationCounts)) f.harness.operationCounts[key] = 0;
  const before = h.left.__styleWrites.length; f.run(10000);
  // Preserve this historical ceiling; audit boundary/scheduling counters are separate diagnostics.
  const counts = f.harness.operationCounts, supplemental = ['boundaryQueries','boundaryValidityCalls','schedules','cancellations','moveChildCalls'];
  const total = Object.keys(counts).filter(key => !supplemental.includes(key)).reduce((sum, key) => sum + (Number(counts[key]) || 0), 0) / 10;
  t.diagnostic(JSON.stringify({ hudWatchOpsPerSecond: total, counts }));
  assert.equal(h.left.__styleWrites.length, before, 'no writes while nothing changes');
  assert.ok(total <= 30, 'menu-side HUD watch stays small: ' + total);
  master(f); assert.equal(hudJobs(f).length, 0);
});

// Audit 22 fixes.
test('audit 22: a HUD created after boot is found by the identity watch without an edit', () => {
  const f = launch(profile()); f.run(3000);
  const h = hudTree(f, 'team1'); f.run(5000);
  assert.deepEqual(look(h.left), WHITE, 'found within one 5 s search');
  assert.equal(hudJobs(f)[0].delay, 1, 'then the 1 s check');
});

test('audit 22: a detached HUD is released, watched for, and its later replacement is painted', () => {
  const f = launch(profile()), h = hudTree(f, 'team2'); f.run(3000);
  setMode(f, 'team'); assert.deepEqual(look(h.left), [TEXTURE, '#FFFFFF', '#5B79E6']);
  h.hud.SetParent(null); f.run(2000);
  assert.deepEqual(look(h.left), STOCK, 'the detached bar is handed back');
  assert.equal(hudJobs(f).length, 1, 'still watching during the gap');
  const next = hudTree(f, 'team1'); f.run(5000);
  assert.deepEqual(look(next.left), [TEXTURE, '#FFFFFF', '#E7B659'], 'the replacement is painted without an edit');
});

test('audit 22: a HUD without a health bar paints the bar when it arrives late', () => {
  const f = launch(profile()), hud = new MockPanel('Panel', f.harness.root, 'Hud'); f.run(3000);
  assert.equal(hudJobs(f).length, 1);
  const h = hudTree(f, 'team1', undefined, hud); f.run(5000);
  assert.deepEqual(look(h.left), WHITE);
});

function rejectOnce(panel, property) {
  const original = panel.style; let rejected = 0;
  panel.style = new Proxy(original, { set(target, key, value) {
    if (key === property && value === null && !rejected) { rejected++; throw new Error('native setter rejected'); }
    target[key] = value; return true;
  } });
  return () => rejected;
}
test('audit 22: a rejected release while HP Colors is off is retried until it lands, then the watch stops', () => {
  const f = launch(profile()), h = hudTree(f, 'team1'); f.run(3000);
  assert.deepEqual(look(h.left), WHITE);
  const rejected = rejectOnce(h.left, 'backgroundImage');
  master(f); assert.equal(rejected(), 1);
  assert.equal(look(h.left)[0], TEXTURE, 'the first null was refused');
  f.run(1000);
  assert.deepEqual(look(h.left), STOCK, 'retried while off');
  assert.equal(hudJobs(f).length, 0, 'nothing left to do while off');
});

test('audit 22: a replaced bar whose release is refused stays owned and is retried', () => {
  const f = launch(profile()), h = hudTree(f, 'team1'); f.run(3000);
  setMode(f, 'custom'); const old = h.left; assert.deepEqual(look(old), [TEXTURE, '#FFFFFF', '#FFFF00']);
  const rejected = rejectOnce(old, 'washColor');
  old.SetParent(h.hud); const left = new MockPanel('Panel', h.bar, 'health_bar_Left'); f.run(1000);
  assert.equal(rejected(), 1); assert.deepEqual(look(left), [TEXTURE, '#FFFFFF', '#FFFF00'], 'the new bar is painted');
  f.run(1000); assert.deepEqual(look(old), STOCK, 'the old bar is still released after the refusal');
  master(f); f.run(3000); assert.deepEqual(look(left), STOCK); assert.equal(hudJobs(f).length, 0);
});

test('audit 22: the SHOW BOUNDS switch has plain help', () => {
  const f = launch(profile()); f.run(2000);
  const tool = find(f, 'HPColorsShowBoundsToggle').GetParent().GetParent();
  const help = tool.children.find(panel => panel.BHasClass('HPC3BoundsHelp'));
  assert.ok(help, 'help label in the rail tool');
  assert.equal(help.text, 'Outline the area healthbars can use. Stays on until you turn it off or restart.');
});
