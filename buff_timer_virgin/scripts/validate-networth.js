#!/usr/bin/env node
'use strict';

// End-to-end check of the NET WORTH pill (slot "w", WIDGETS bit 32) with both scripts and the real layouts.
//
// Failure modes this pins (written before the implementation):
//  1. Sapphire players: top-bar row panels are absolute (TeamFriendly = Amber, TeamEnemy = Sapphire), so a Sapphire
//     player's own rows sit in TeamEnemy; summing TeamFriendly as "us" flips the sign and the glow colour.
//  2. The team ScoreLabels are perspective-relative (client 6774 rva 1bbb260: TeamScoreFriendly shows the local
//     team's total, floor(total / 1000) + "k" from 1000 souls); treating them as absolute flips Sapphire again.
//  3. The local-team class arrives after the rows were cached, or changes: a stale side mapping is used.
//  4. Spectators / no local-team class: a blue/red verdict would be made up. Must show "--" and no glow.
//  5. An unreadable row ("" before the HUD fills it) or a missing row is counted as 0 souls instead of falling back to
//     the team label; a row sum that disagrees with the label (missing row, wrong side) is trusted.
//  6. Both totals 0, one side 0: division by zero or NaN text.
//  7. Glow: not capped at 30 %, not quantized (a write on every tick), a glow inside the +-2 % neutral band, or both
//     colours lit at once.
//  8. The widget switched off still reads the top bar every second, or shows a stale value when switched back on.
//  9. Street Brawl (stock hides team net worth) or no top bar: made-up numbers.
// 10. The pill's chat button posts an unknown value, or posts while editing the layout.
// 11. Saves: schema 8 with the "w" slot and mask bit 32 must round-trip; a schema 7 record cannot carry them.
// 12. Rift + Souls in one card (menu switch, mask bit 64, user choice 2026-10-12): the pill stays visible next to the
//     card, both show the lead (double writes), the card keeps its old size so the extra row overflows or the editor
//     outline is wrong, switching Rift or Souls off leaves nothing (the other widget must show alone), the card's
//     click posts nothing, or the hidden target shows a stale value when the switch flips back.
// 13. Rift comeback (user request 2026-10-12; misc.vdata modifier_koth_comeback_bonuses, server.dll 6774 rva c17e70 and
//     b92800): the trailing team gets bullet/spirit/debuff resist inside the Rift aura = clamp(deficit / 15 %, 0, 1) x
//     min(10 + game minutes, 40) %, deficit = (theirs - ours) / theirs (convar citadel_trailingteam_bias_threshold_max
//     0.15). Failure modes: the wrong team gets the resist, the 15 % ramp or the time cap is wrong (old glow used 30 %),
//     the cap does not follow the clock, unknown souls show a made-up number, -7.5 % rounds to -7 while +7.5 % rounds
//     to +8, the chat line drops the resist, or the combined card has no room for it. (Without a readable clock the
//     whole timer loop pauses, so every widget, this one included, keeps its last value.)
// 14. Stretched combined card (user screenshot 2026-10-12): the four rows stay one centred column with empty space
//     left and right. From 1.35x as wide as tall (label above/below) the slot gets .bt-wide and the CSS lays the card
//     out as two columns (RIFT + time | lead + resist). Must follow live drags, the side, and switching combine off.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, KEY, SCALE, read, createProfile, record, launch, makePanel } = require('./bt-test-harness.js');

const checks = [];
const check = (name, fn) => {
  try { fn(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: error.stack || String(error) }); process.exitCode = 1; }
};
const saved = (profile) => JSON.parse(profile.disk.get(KEY).slice(14));
const time = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
function tick(game, seconds, count = 1) {
  for (let i = 0; i < count; i++) {
    game.clock.text = time(seconds + i);
    game.advance(1000);
  }
}
function ready(profile = createProfile(), options = {}) {
  const game = launch(profile, { withTimer: true, clock: '3:00', ...options });
  game.advance(2000);
  assert.equal(game.state().phase, 'ready');
  return game;
}
// Stock 6774 team total format (#Citadel_Hud_TopbarPlayerNetworth): exact below 1000, else floor(total/1000) + "k".
const teamLabel = (total) => (total < 1000 ? String(total) : `${Math.floor(total / 1000)}<span class="demote">k</span>`);
const sum = (values) => values.reduce((a, b) => a + b, 0);
// Builds the stock top bar: absolute row panels, perspective-relative score labels. local: 1 Amber, 2 Sapphire, 0 none.
function topbar(game, { amber, sapphire, local = 1, labels = true }) {
  const top = game.topBar;
  const reads = { souls: 0, labels: 0 };
  const label = (text) => {
    const panel = makePanel('', 'Label', null);
    let value = text;
    Object.defineProperty(panel, 'text', { configurable: true, get: () => { reads.labels++; return value; }, set: (v) => { value = v; } });
    return panel;
  };
  const scoreParent = makePanel('', 'Panel', top);
  scoreParent.AddClass('TeamNetworth');
  const scoreF = makePanel('TeamScoreFriendly', 'Panel', scoreParent);
  const scoreE = makePanel('TeamScoreEnemy', 'Panel', scoreParent);
  const labelF = label('');
  const labelE = label('');
  scoreF.FindChildrenWithClassTraverse = (name) => (name === 'ScoreLabel' && labels ? [labelF] : []);
  scoreE.FindChildrenWithClassTraverse = (name) => (name === 'ScoreLabel' && labels ? [labelE] : []);
  const teams = makePanel('TeamsContainer', 'Panel', top);
  const team = (id, values) => {
    const panel = makePanel(id, 'CitadelHudTopBarTeam', teams);
    const container = makePanel('PlayersContainer', 'Panel', makePanel('PlayerContents', 'Panel', panel));
    const rows = values.map((value) => {
      const row = makePanel('', 'CitadelHudTopBarPlayer', container);
      const souls = makePanel('SoulsValue', 'Label', makePanel('HeroContents', 'Panel', row));
      let text = String(value);
      Object.defineProperty(souls, 'text', { configurable: true, get: () => { reads.souls++; return text; }, set: (v) => { text = v; } });
      return { row, souls };
    });
    return { panel, container, rows };
  };
  const amberTeam = team('TeamFriendly', amber);
  const sapphireTeam = team('TeamEnemy', sapphire);
  const state = {
    reads, labelF, labelE, amberTeam, sapphireTeam,
    setLocal(next) {
      game.rootPanel.SetHasClass('localPlayerTeam1', next === 1);
      game.rootPanel.SetHasClass('localPlayerTeam2', next === 2);
    },
    // Engine truth: label totals follow the local team (Amber for anyone not on Sapphire).
    setTotals(amberTotal, sapphireTotal, localTeam) {
      const own = localTeam === 2 ? sapphireTotal : amberTotal;
      const other = localTeam === 2 ? amberTotal : sapphireTotal;
      labelF.text = teamLabel(own);
      labelE.text = teamLabel(other);
    },
  };
  state.setLocal(local);
  const parse = (v) => (/k$/.test(v) ? Math.round(parseFloat(v) * 1000) : Number(v));
  state.setTotals(sum(amber.map(parse)), sum(sapphire.map(parse)), local);
  return state;
}
const pill = (game) => ({
  text: game.ids.NetWorthText.text,
  ally: game.ids.NetWorthGlowAlly.style.opacity,
  enemy: game.ids.NetWorthGlowEnemy.style.opacity,
  ahead: game.ids.NetWorth.BHasClass('nw-ahead'),
  behind: game.ids.NetWorth.BHasClass('nw-behind'),
  unknown: game.ids.NetWorth.BHasClass('nw-unknown'),
  res: game.ids.NetWorthRes.text,
  resOwner: ['rs-ours', 'rs-theirs', 'rs-none'].filter((c) => game.ids.NetWorthRes.BHasClass(c)),
});
const opacity = (value) => Number(value === undefined || value === null ? 0 : value);

const AMBER = ['900', '800', '700', '600', '500', '500']; // 4000
const SAPPHIRE = ['600', '600', '500', '500', '400', '400']; // 3000

check('real layouts carry the pill, its chrome, its WIDGETS chip and the stock soul icon', () => {
  const overlay = read('panorama', 'layout', 'bt_timer_overlay.xml');
  for (const id of ['BTSlotWorth', 'NetWorth', 'NetWorthText', 'NetWorthGlowAlly', 'NetWorthGlowEnemy', 'NetWorthPingButton',
    'BTSlotWorthChrome', 'BTSlotWorthOutline', 'BTSlotWorthHandleTL', 'BTSlotWorthSideL', 'BTSlotWorthSideB', 'BTSlotWorthIconToggle']) {
    assert.match(overlay, new RegExp(`id="${id}"`), `${id} in bt_timer_overlay.xml`);
  }
  assert.match(read('panorama', 'layout', 'bt_minimap_settings.xml'), /<Button id="BTWidgetWorth" class="[^"]*bt-widget-chip/);
  const css = read('panorama', 'styles', 'hud_timer.css');
  assert.match(css, /icon_soul\.vsvg/, 'stock soul icon');
  assert.doesNotMatch(css, /box-shadow|clip-path/);
});

check('Amber player: row sums, signed percent, blue glow full at the 15 % comeback cap', () => {
  const game = ready();
  topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 1 });
  tick(game, 180, 2);
  const p = pill(game);
  assert.equal(p.text, '+25%', '(4000 - 3000) / 4000');
  assert.equal(opacity(p.ally), 1, 'blue, full from a 15 % lead');
  assert.equal(opacity(p.enemy), 0, 'red off');
  assert.ok(p.ahead && !p.behind && !p.unknown);
  // The glow fills the button itself (user request 2026-10-12), drawn under the icon and the text.
  const kids = game.ids.NetWorth.children.map((child) => child.id);
  assert.deepEqual(kids, ['NetWorthGlowAlly', 'NetWorthGlowEnemy', 'NetWorthImg', 'NetWorthText', 'NetWorthRes'], 'glows inside #NetWorth, first');
});

check('Sapphire player: absolute rows and relative labels both resolve to a red deficit', () => {
  const game = ready();
  // Same match from the other side: our 3000 sits in TeamEnemy (Sapphire), the label pair is relative.
  topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 2 });
  tick(game, 180, 2);
  const p = pill(game);
  assert.equal(p.text, '-25%');
  assert.equal(opacity(p.enemy), 1);
  assert.equal(opacity(p.ally), 0);
  assert.ok(p.behind && !p.ahead);
});

check('spectator / no local team: "--", no glow; a late class resolves on the next tick', () => {
  const game = ready();
  const bar = topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 0 });
  tick(game, 180, 3);
  let p = pill(game);
  assert.equal(p.text, '--');
  assert.equal(opacity(p.ally) + opacity(p.enemy), 0);
  assert.ok(p.unknown);
  bar.setLocal(2);
  bar.setTotals(4000, 3000, 2);
  tick(game, 183, 2);
  p = pill(game);
  assert.equal(p.text, '-25%', 'late Sapphire class flips the cached rows at once');
  bar.setLocal(1);
  bar.setTotals(4000, 3000, 1);
  tick(game, 185, 2);
  assert.equal(pill(game).text, '+25%', 'a team change re-sides the rows');
});

check('rows are never zero: unreadable or missing rows fall back to the team label', () => {
  const game = ready();
  const bar = topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 1 });
  bar.amberTeam.rows[0].souls.text = '';
  tick(game, 180, 2);
  // Label only for us: floor 4k -> 4000..4999, midpoint 4499.5; enemy rows 3000 fit their 3k label.
  assert.equal(pill(game).text, '+33%');
  bar.amberTeam.rows[0].souls.text = '900';
  bar.amberTeam.rows[1].row.DeleteAsync();
  tick(game, 182, 6);
  // The rows now say 3200 but the label still says 4k: the label wins.
  assert.equal(pill(game).text, '+33%', 'a row sum outside the label range is not trusted');
});

check('label and rows intersect for a tighter estimate; k-formatted rows parse', () => {
  const game = ready();
  // 12.3k + 11.0k + 10.4k + 9.9k + 9.5k + 9.0k = 62.1k (each 100-rounded down), label 62k.
  const bar = topbar(game, { amber: ['12.3k', '11.0k', '10.4k', '9.9k', '9.5k', '9.0k'], sapphire: ['10.0k', '10.0k', '10.0k', '10.0k', '10.0k', '10.0k'], local: 1 });
  bar.setTotals(62300, 60000, 1);
  tick(game, 600, 2);
  // Ours: rows 61800..62694 (each -50..+99) overlap the label 62000..62999 -> 62000..62694, mid 62347; theirs 59700..60594
  // on label 60000..60999 -> mid 60297. (62347 - 60297) / 62347 = 3.3 %.
  assert.equal(pill(game).text, '+3%');
  assert.equal(opacity(pill(game).ally), 0.2, '3 % of the 15 % ramp');
});

check('neutral band, caps, zero totals and one empty side', () => {
  const game = ready();
  const bar = topbar(game, { amber: ['500'], sapphire: ['500'], local: 1 });
  tick(game, 180, 2);
  let p = pill(game);
  assert.equal(p.text, '0%');
  assert.equal(opacity(p.ally) + opacity(p.enemy), 0, 'no glow when even');
  bar.amberTeam.rows[0].souls.text = '505';
  bar.setTotals(505, 500, 1);
  tick(game, 182, 2);
  p = pill(game);
  assert.equal(p.text, '+1%');
  assert.equal(opacity(p.ally), 0, '1 % sits inside the neutral band');
  bar.amberTeam.rows[0].souls.text = '900';
  bar.setTotals(900, 500, 1);
  tick(game, 184, 2);
  p = pill(game);
  assert.equal(p.text, '+44%');
  assert.equal(opacity(p.ally), 1, 'glow capped at 15 %');
  bar.amberTeam.rows[0].souls.text = '0';
  bar.sapphireTeam.rows[0].souls.text = '0';
  bar.setTotals(0, 0, 1);
  tick(game, 186, 2);
  assert.equal(pill(game).text, '0%', 'both zero is even, not NaN');
  bar.sapphireTeam.rows[0].souls.text = '300';
  bar.setTotals(0, 300, 1);
  tick(game, 188, 2);
  p = pill(game);
  assert.equal(p.text, '-100%');
  assert.equal(opacity(p.enemy), 1);
  assert.equal(opacity(p.ally), 0, 'never both colours');
});

check('glow writes only when its 1 % step changes', () => {
  const game = ready();
  const bar = topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 1 });
  tick(game, 180, 2);
  let writes = 0;
  const glow = game.ids.NetWorthGlowAlly;
  let current = glow.style.opacity;
  Object.defineProperty(glow.style, 'opacity', { configurable: true, get: () => current, set: (v) => { writes++; current = v; } });
  tick(game, 182, 5);
  assert.equal(writes, 0, 'unchanged totals: no glow writes');
  bar.amberTeam.rows[5].souls.text = '510';
  bar.setTotals(4010, 3000, 1);
  tick(game, 187, 3);
  assert.equal(writes, 0, '25.0 % -> 25.2 % stays on the same step');
});

check('street brawl (stock hides team net worth) gives "--"', () => {
  const game = ready();
  topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 1 });
  game.topBar.AddClass('gStreetBrawl');
  tick(game, 180, 2);
  assert.equal(pill(game).text, '--');
  assert.equal(opacity(pill(game).ally), 0);
});

// GPT-6.1-Sol audit 2026-10-12, finding 1: a source that is simply absent (no score labels, rows not built yet) made
// every 1 s pass re-walk the top bar. Absent sources wait for the 5 s rescan; only a found panel that dies is re-found
// at once.
check('absent top-bar sources are looked up at most every 5 s', () => {
  const game = ready();
  topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 1, labels: false });
  let lookups = 0;
  const find = game.topBar.FindChildTraverse.bind(game.topBar);
  game.topBar.FindChildTraverse = (id) => { if (id === 'TeamScoreFriendly') lookups++; return find(id); };
  tick(game, 180, 12);
  assert.ok(lookups <= 3, `score label lookups in 12 s: ${lookups}`);
  assert.equal(game.ids.NetWorthText.text, '+25%', 'rows alone still give the value');
});

// Audit finding 2: the timer notices the hideout only every 60 s while a run is live; the net worth lane must not keep
// reading the top bar there.
check('hideout: no top-bar reads, "--"', () => {
  const game = ready();
  const bar = topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 1 });
  tick(game, 180, 2);
  assert.equal(game.ids.NetWorthText.text, '+25%');
  game.rootPanel.AddClass('connectedToHideout');
  tick(game, 182, 1);
  const before = { ...bar.reads };
  tick(game, 183, 5);
  assert.deepEqual(bar.reads, before, 'no SoulsValue or ScoreLabel reads in the hideout');
  assert.equal(game.ids.NetWorthText.text, '--');
});

check('switched off: no top-bar reads; back on: fresh value on the next tick', () => {
  const game = ready();
  const bar = topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 1 });
  tick(game, 180, 2);
  game.toggleMenu();
  game.click('BTWidgetWorth');
  tick(game, 182, 1);
  assert.ok(game.ids.BTSlotWorth.BHasClass('bt-widget-off'));
  const before = { ...bar.reads };
  bar.amberTeam.rows[0].souls.text = '2900';
  bar.setTotals(6000, 3000, 1);
  tick(game, 183, 5);
  assert.deepEqual(bar.reads, before, 'no SoulsValue or ScoreLabel reads while off');
  assert.equal(pill(game).text, '+25%', 'kept text is not updated while off');
  game.click('BTWidgetWorth');
  tick(game, 188, 1);
  assert.ok(!game.ids.BTSlotWorth.BHasClass('bt-widget-off'));
  assert.equal(pill(game).text, '+50%', 'fresh value right after switching back on');
});

check('chat button posts the shown value, never an unknown one, never while editing', () => {
  const game = ready();
  const bar = topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 0 });
  const sent = [];
  const intent = game.timer.TeamChatIntent;
  intent.send = (message) => { sent.push(message); return true; };
  tick(game, 180, 2);
  game.click('NetWorthPingButton');
  assert.deepEqual(sent, [], 'unknown value: no message');
  bar.setLocal(1);
  tick(game, 182, 2);
  game.click('NetWorthPingButton');
  assert.deepEqual(sent, ['Souls +25%, Rift resist: enemy 13%']);
  bar.amberTeam.rows[0].souls.text = '400';
  bar.setTotals(3500, 3000, 1);
  bar.sapphireTeam.rows[0].souls.text = '1100';
  bar.setTotals(3500, 3500, 1);
  tick(game, 184, 2);
  game.click('NetWorthPingButton');
  assert.equal(sent[1], 'Souls 0%, Rift resist: none', 'even: nobody gets resist');
});

check('schema 8 saves the moved pill and bit 32; schema 7 records cannot carry them', () => {
  const profile = createProfile({
    [KEY]: record('{"s":8,"u":"#FFE14D","d":"#4DD2FF","l":1,"g":1,"t":{"w":[0.1,0.2,1.5,"n"]},"x":32}'),
  });
  const game = ready(profile);
  tick(game, 180, 2);
  assert.ok(game.ids.BTSlotWorth.BHasClass('bt-widget-off'), 'bit 32 restored');
  assert.ok(game.ids.BTSlotWorth.BHasClass('bt-side-n'), 'hidden icon restored');
  game.toggleMenu();
  game.click('BTWidgetWorth');
  game.advance(2200);
  const data = saved(profile);
  assert.equal(data.s, 8);
  assert.equal(data.x, undefined, 'all on: no x');
  assert.deepEqual(data.t.w, [0.1, 0.2, 1.5, 'n']);
  for (const body of [
    '{"s":7,"u":"#FFE14D","d":"#4DD2FF","l":1,"g":1,"x":32}',
    '{"s":7,"u":"#FFE14D","d":"#4DD2FF","l":1,"g":1,"t":{"w":[0.1,0.2,1,"l"]}}',
    '{"s":8,"u":"#FFE14D","d":"#4DD2FF","l":1,"g":1,"x":128}',
  ]) {
    const old = launch(createProfile({ [KEY]: record(body) }), { withTimer: true, clock: '3:00' });
    old.advance(2000);
    assert.equal(old.state().phase, 'blocked', `${body} is damaged`);
  }
});

// User request 2026-10-12: the soul icon has its own on/off switch in the menu (same model as the edit-mode eye: side
// "n"), which keeps the pill where it is, survives a restart and is undone by switching it back on.
check('menu switch turns the soul icon off and on, keeps the spot and saves it', () => {
  const profile = createProfile();
  const game = ready(profile);
  tick(game, 180, 1);
  const spot = game.ids.BTSlotWorth.style.position;
  game.toggleMenu();
  assert.ok(game.ids.BTWorthIconToggle.BHasClass('on'), 'icon shown by default');
  game.click('BTWorthIconToggle');
  game.advance(300);
  assert.ok(game.ids.BTSlotWorth.BHasClass('bt-side-n'), 'icon hidden');
  assert.ok(!game.ids.BTWorthIconToggle.BHasClass('on'), 'switch renders off');
  assert.equal(game.ids.BTSlotWorth.style.position, spot, 'the pill stays where it was');
  game.advance(2000);
  assert.equal(saved(profile).t.w[3], 'n', 'hidden icon saved');
  const again = ready(profile);
  tick(again, 180, 1);
  assert.ok(again.ids.BTSlotWorth.BHasClass('bt-side-n'), 'hidden icon restored');
  again.toggleMenu();
  assert.ok(!again.ids.BTWorthIconToggle.BHasClass('on'));
  again.click('BTWorthIconToggle');
  again.advance(2300);
  assert.ok(again.ids.BTSlotWorth.BHasClass('bt-side-l'), 'icon back on its default side');
  assert.equal(saved(profile).t.w[3], 'l');
});

// User requests 2026-10-12: in the layout editor every widget's corner handles resize its width and height
// separately. Sideways only: wider, same height and text size; up/down only: the scale, on-screen width kept. The width
// factor is the optional fifth element of the widget's layout entry (0.6-2, only when not 1).
function dragHandle(game, panel, dxLayout, dyLayout) {
  const callbacks = {};
  panel.events.DragStart(panel, callbacks);
  const proxy = callbacks.displayPanel;
  assert.ok(proxy && proxy.IsValid(), `#${panel.id} drag supplies a proxy`);
  proxy.win = { x: 500, y: 500 };
  game.advance(40);
  proxy.win = { x: 500 + dxLayout * SCALE, y: 500 + dyLayout * SCALE };
  game.advance(40);
  delete proxy.win;
  panel.events.DragEnd(panel, proxy);
  game.advance(40);
}
check('editor corner handles stretch any widget sideways without changing its height', () => {
  const profile = createProfile();
  const game = ready(profile);
  tick(game, 180, 1);
  const slot = game.ids.BTSlotWorth;
  game.toggleMenu();
  game.click('BTLayoutButton');
  game.advance(300);
  const scale = slot.style.uiScale;
  const s = parseFloat(scale) / 100;
  dragHandle(game, game.ids.BTSlotWorthHandleBR, 70.5 * s, 0);
  assert.equal(slot.style.uiScale, scale, 'sideways drag keeps the scale (height, text size)');
  assert.equal(slot.style.width, '211.5px', '141 px + 70.5 px at this scale: 150 %');
  const outline = parseFloat(game.ids.BTSlotWorthOutline.style.width);
  assert.ok(Math.abs(outline - 211.5 * s) <= 0.2, `edit outline ${outline} follows the width`);
  game.click('BTSlotWorthSideT');
  game.advance(300);
  assert.equal(slot.style.width, '114px', 'vertical pill keeps the factor: 76 px x 150 %');
  game.click('BTSlotWorthSideL');
  game.advance(300);
  game.click('BTLayoutDone');
  game.advance(2200);
  assert.equal(saved(profile).t.w[4], 1.5, 'width factor saved as the fifth entry element');
  const again = ready(profile);
  tick(again, 180, 1);
  assert.equal(again.ids.BTSlotWorth.style.width, '211.5px', 'width restored after restart');
  // Up/down: the scale changes, the pill keeps its width on screen.
  game.toggleMenu();
  game.click('BTLayoutButton');
  game.advance(300);
  dragHandle(game, game.ids.BTSlotWorthHandleBR, 0, 22 * s);
  const s2 = parseFloat(slot.style.uiScale) / 100;
  assert.ok(Math.abs(s2 - 1.5 * s) < 0.011, `up/down drag scales the height (${s2})`);
  const shown = (slot.style.width ? parseFloat(slot.style.width) : 141) * s2;
  assert.ok(Math.abs(shown - 211.5 * s) <= 3, `width on screen kept: ${shown} vs ${211.5 * s}`);
  // The other widgets stretch the same way.
  for (const [handle, id, base] of [['BTSlotBuffHandleBR', 'BTSlotBuff', 141], ['BTSlotRiftHandleBR', 'BTSlotRift', 44],
    ['BTSlotClaimLHandleBR', 'BTSlotClaimL', 48]]) {
    const panel = game.ids[id];
    const before = panel.style.uiScale;
    const k = parseFloat(before) / 100;
    dragHandle(game, game.ids[handle], base * 0.5 * k, 0);
    assert.equal(panel.style.uiScale, before, `${id}: sideways drag keeps the scale`);
    assert.equal(panel.style.width, `${base * 1.5}px`, `${id}: 150 % wide`);
  }
  game.click('BTLayoutReset');
  game.advance(300);
  assert.equal(slot.style.width, null, 'RESET LAYOUT hands the width back to the CSS');
  game.click('BTLayoutCancel');
  for (const bad of ['[0.1,0.2,1,"l",0.5]', '[0.1,0.2,1,"l",2.5]', '[0.1,0.2,1,"l","1.5"]']) {
    const game2 = launch(createProfile({ [KEY]: record(`{"s":8,"u":"#FFE14D","d":"#4DD2FF","l":1,"g":1,"t":{"b":${bad}}}`) }), { withTimer: true, clock: '3:00' });
    game2.advance(2000);
    assert.equal(game2.state().phase, 'blocked', `${bad} is damaged`);
  }
  const old = launch(createProfile({ [KEY]: record('{"s":7,"u":"#FFE14D","d":"#4DD2FF","l":1,"g":1,"t":{"b":[0.1,0.2,1,"l",1.5]}}') }), { withTimer: true, clock: '3:00' });
  old.advance(2000);
  assert.equal(old.state().phase, 'blocked', 'a schema 7 record cannot carry a width factor');
});

check('the pill is a movable widget: default spot, chrome, icon toggle', () => {
  const game = ready();
  tick(game, 180, 1);
  assert.ok(game.ids.BTSlotWorth.BHasClass('bt-placed'), 'placed by default');
  game.toggleMenu();
  game.click('BTLayoutButton');
  game.advance(300);
  assert.ok(game.ids.BTSlotWorthChrome.BHasClass('bt-side-l'));
  game.click('BTSlotWorthIconToggle');
  game.advance(300);
  assert.ok(game.ids.BTSlotWorth.BHasClass('bt-side-n'), 'icon hidden');
  game.click('BTSlotWorthSideR');
  game.advance(300);
  assert.ok(game.ids.BTSlotWorth.BHasClass('bt-side-r'), 'icon on the right');
});

const card = (game) => ({
  text: game.ids.RiftWorthText.text,
  ally: game.ids.RiftWorthGlowAlly.style.opacity,
  enemy: game.ids.RiftWorthGlowEnemy.style.opacity,
  res: game.ids.RiftWorthRes.text,
  ahead: game.ids.RiftWorthText.BHasClass('nw-ahead'),
  behind: game.ids.RiftWorthText.BHasClass('nw-behind'),
});
const combined = (game) => game.ids.BTSlotRift.BHasClass('bt-rift-worth');

check('combine switch: the lead moves into the Rift card, the pill goes, the glow fills the card; saved', () => {
  const profile = createProfile();
  const game = ready(profile);
  const bar = topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 1 });
  tick(game, 180, 2);
  game.toggleMenu();
  assert.ok(!game.ids.BTRiftWorthToggle.BHasClass('on'), 'separate by default');
  assert.ok(!combined(game));
  game.click('BTRiftWorthToggle');
  tick(game, 182, 1);
  assert.ok(game.ids.BTRiftWorthToggle.BHasClass('on'), 'switch renders on');
  assert.ok(combined(game), 'Rift card shows the lead row');
  assert.ok(game.ids.BTSlotWorth.BHasClass('bt-widget-off'), 'pill hidden');
  assert.ok(game.ids.BTSlotWorthChrome.BHasClass('bt-widget-off'), 'pill edit chrome hidden');
  let c = card(game);
  assert.equal(c.text, '+25%', 'lead in the card on the next tick');
  assert.equal(c.res, 'RES 13%', 'enemy resist in the card');
  assert.equal(opacity(c.ally), 1);
  assert.equal(opacity(c.enemy), 0);
  assert.ok(c.ahead && !c.behind);
  assert.notEqual(game.ids.RiftTimerTime.text, '', 'the Rift time stays');
  const kids = game.ids.RiftTimerCard.children.map((child) => child.id);
  assert.deepEqual(kids.slice(0, 2), ['RiftWorthGlowAlly', 'RiftWorthGlowEnemy'], 'glows first in the card: under the text');
  // Updates go to the card only.
  const pillBefore = pill(game).text;
  bar.amberTeam.rows[0].souls.text = '2900';
  bar.setTotals(6000, 3000, 1);
  tick(game, 183, 1);
  assert.equal(card(game).text, '+50%');
  assert.equal(pill(game).text, pillBefore, 'the hidden pill is not written');
  game.advance(2200);
  assert.equal(saved(profile).x, 64, 'bit 64 saved');
  const again = ready(profile);
  topbar(again, { amber: AMBER, sapphire: SAPPHIRE, local: 1 });
  tick(again, 180, 2);
  assert.ok(combined(again), 'restored after restart');
  assert.equal(card(again).text, '+25%');
  // Switching it back: the pill shows the current value at once, the card loses the row.
  game.click('BTRiftWorthToggle');
  tick(game, 186, 1);
  assert.ok(!combined(game));
  assert.ok(!game.ids.BTSlotWorth.BHasClass('bt-widget-off'), 'pill back');
  assert.equal(pill(game).text, '+50%', 'fresh value in the pill');
  game.advance(2200);
  assert.equal(saved(profile).x, undefined);
});

check('combined: Rift off leaves the pill alone, Souls off leaves the plain Rift card', () => {
  const game = ready();
  const bar = topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 1 });
  tick(game, 180, 1);
  game.toggleMenu();
  game.click('BTRiftWorthToggle');
  game.click('BTWidgetRift');
  tick(game, 181, 2);
  assert.ok(game.ids.BTSlotRift.BHasClass('bt-widget-off'), 'Rift off');
  assert.ok(!game.ids.BTSlotWorth.BHasClass('bt-widget-off'), 'the pill shows instead');
  assert.equal(pill(game).text, '+25%');
  game.click('BTWidgetRift');
  game.click('BTWidgetWorth');
  tick(game, 183, 1);
  assert.ok(!game.ids.BTSlotRift.BHasClass('bt-widget-off'), 'Rift back');
  assert.ok(!combined(game), 'no lead row without Souls');
  assert.ok(game.ids.BTSlotWorth.BHasClass('bt-widget-off'));
  const before = { ...bar.reads };
  tick(game, 184, 4);
  assert.deepEqual(bar.reads, before, 'no top-bar reads with Souls off');
  game.click('BTWidgetWorth');
  tick(game, 188, 1);
  assert.ok(combined(game), 'both on again: combined again');
  assert.equal(card(game).text, '+25%');
});

check('combined card: larger box for the lead and resist rows, click posts both (not while editing)', () => {
  const game = ready();
  topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 1 });
  const sent = [];
  game.timer.TeamChatIntent.send = (message) => { sent.push(message); return true; };
  tick(game, 180, 2);
  game.toggleMenu();
  game.click('BTLayoutButton');
  game.advance(300);
  const s = parseFloat(game.ids.BTSlotRift.style.uiScale) / 100;
  const outline = () => [parseFloat(game.ids.BTSlotRiftOutline.style.width) / s, parseFloat(game.ids.BTSlotRiftOutline.style.height) / s];
  const near = (got, want, what) => assert.ok(Math.abs(got[0] - want[0]) <= 0.3 && Math.abs(got[1] - want[1]) <= 0.3, `${what}: ${got} vs ${want}`);
  near(outline(), [44, 26], 'plain card');
  game.click('BTLayoutCancel');
  game.advance(300);
  game.toggleMenu();
  game.click('BTRiftWorthToggle');
  tick(game, 182, 1);
  game.click('RiftWorthPingButton');
  assert.deepEqual(sent, ['Souls +25%, Rift resist: enemy 13%']);
  game.click('BTLayoutButton');
  game.advance(300);
  near(outline(), [48, 52], 'combined card, label on top: lead and resist rows');
  assert.ok(game.ids.BTSlotWorthChrome.BHasClass('bt-widget-off'), 'no pill chrome in the editor');
  game.click('RiftWorthPingButton');
  assert.equal(sent.length, 1, 'no post while editing');
  game.click('BTSlotRiftSideL');
  game.advance(300);
  near(outline(), [160, 22], 'combined card, label on the left: one wider row');
  game.click('BTLayoutCancel');
});

// Failure mode 13. Resist = clamp(deficit / 15 %, 0, 1) x min(10 + minutes, 40) %, given to the trailing team.
check('Rift comeback resist: trailing team, full at a 15 % deficit, cap 10 % + 1 %/min up to 40 %', () => {
  const game = ready();
  const bar = topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 1 });
  tick(game, 180, 2);
  let p = pill(game);
  assert.equal(p.res, 'RES 13%', '25 % lead at 3:01 -> full ramp x (10 + 3) %');
  assert.deepEqual(p.resOwner, ['rs-theirs'], 'we lead: the enemy gets it');
  tick(game, 1200, 2);
  assert.equal(pill(game).res, 'RES 30%', '20:01 -> cap 30 %');
  tick(game, 2700, 2);
  assert.equal(pill(game).res, 'RES 40%', '45:01 -> capped at 40 %');
  // 7.5 % deficit (4000 vs 3700): half the ramp; 20:00 -> 15 %.
  bar.sapphireTeam.rows[0].souls.text = '1300';
  bar.setTotals(4000, 3700, 1);
  tick(game, 1200, 2);
  p = pill(game);
  assert.equal(p.text, '+8%');
  assert.equal(p.res, 'RES 15%');
  assert.equal(opacity(p.ally), 0.533, 'glow 8/15');
  // Same match from Sapphire: we trail, so the resist is ours.
  bar.setLocal(2);
  bar.setTotals(4000, 3700, 2);
  tick(game, 1202, 2);
  p = pill(game);
  assert.equal(p.text, '-8%');
  assert.equal(p.res, 'RES 15%');
  assert.deepEqual(p.resOwner, ['rs-ours'], 'we trail: our team gets it');
  // Even: nobody.
  bar.sapphireTeam.rows[0].souls.text = '1600';
  bar.setTotals(4000, 4000, 2);
  tick(game, 1204, 2);
  p = pill(game);
  assert.equal(p.res, 'RES 0%');
  assert.deepEqual(p.resOwner, ['rs-none']);
});

check('Rift comeback resist: unknown souls show "RES --", never a guess; the resist follows the clock', () => {
  const game = ready();
  const bar = topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 0 });
  assert.equal(pill(game).res, 'RES --', 'before the first read');
  tick(game, 180, 2);
  assert.equal(pill(game).res, 'RES --', 'spectator');
  assert.deepEqual(pill(game).resOwner, ['rs-none']);
  bar.setLocal(1);
  bar.setTotals(4000, 3000, 1);
  tick(game, 182, 2);
  assert.equal(pill(game).res, 'RES 13%');
  tick(game, 239, 2);
  assert.equal(pill(game).res, 'RES 14%', 'the cap grows 1 % per game minute with unchanged souls');
  game.topBar.AddClass('gStreetBrawl');
  tick(game, 241, 2);
  assert.equal(pill(game).res, 'RES --', 'no souls (Street Brawl): no resist either');
});

// Failure mode 14.
check('stretched combined card switches to two columns (.bt-wide) only when wide enough', () => {
  const wide = (game) => game.ids.BTSlotRift.BHasClass('bt-wide');
  const start = (entry) => {
    const game = launch(createProfile({ [KEY]: record(`{"s":8,"u":"#FFE14D","d":"#4DD2FF","l":1,"g":1,"t":{"f":${entry}},"x":64}`) }), { withTimer: true, clock: '3:00' });
    game.advance(2000);
    topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 1 });
    tick(game, 180, 2);
    return game;
  };
  let game = start('[0.3,0.6,1,"t"]');
  assert.ok(combined(game));
  assert.ok(!wide(game), '48x52: one column');
  game = start('[0.3,0.6,1,"t",1.4]');
  assert.ok(!wide(game), '67x52 is not enough for two columns');
  game = start('[0.3,0.6,1,"t",1.5]');
  assert.ok(wide(game), '72x52: two columns');
  game = start('[0.3,0.6,1,"b",2]');
  assert.ok(wide(game), 'label below too');
  game = start('[0.3,0.6,1,"l",2]');
  assert.ok(!wide(game), 'label beside is already one row');
  // Live: drag wider in the editor, then turn combining off (plain card is its own layout).
  game = start('[0.3,0.6,1,"t"]');
  game.toggleMenu();
  game.click('BTLayoutButton');
  game.advance(300);
  const k = parseFloat(game.ids.BTSlotRift.style.uiScale) / 100;
  dragHandle(game, game.ids.BTSlotRiftHandleBR, 48 * k, 0);
  assert.ok(wide(game), 'a live drag to 2x switches at once');
  game.click('BTLayoutDone');
  game.advance(300);
  game.click('BTRiftWorthToggle');
  tick(game, 183, 1);
  assert.ok(!combined(game));
  const css = read('panorama', 'styles', 'hud_timer.css');
  assert.match(css, /\.bt-rift-worth\.bt-wide\.bt-side-t[^{]*\{[^}]*flow-children: none/, 'two-column CSS for the wide combined card');
});

const report = { generatedAt: new Date().toISOString(), checks };
const outPath = path.join(root, '.tmp', 'bt-networth-e2e.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
for (const entry of checks) console.log(`${entry.passed ? 'PASS' : 'FAIL'} ${entry.name}${entry.passed ? '' : `\n${entry.error}`}`);
console.log(`${checks.filter((c) => c.passed).length}/${checks.length} net worth checks passed; report ${path.relative(root, outPath)}`);
