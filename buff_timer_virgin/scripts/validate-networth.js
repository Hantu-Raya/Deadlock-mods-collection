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
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, KEY, read, createProfile, record, launch, makePanel } = require('./bt-test-harness.js');

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

check('Amber player: row sums, signed percent, blue glow scaled to 30 %', () => {
  const game = ready();
  topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 1 });
  tick(game, 180, 2);
  const p = pill(game);
  assert.equal(p.text, '+25%', '(4000 - 3000) / 4000');
  assert.equal(opacity(p.ally), 0.833, 'blue at 25/30');
  assert.equal(opacity(p.enemy), 0, 'red off');
  assert.ok(p.ahead && !p.behind && !p.unknown);
});

check('Sapphire player: absolute rows and relative labels both resolve to a red deficit', () => {
  const game = ready();
  // Same match from the other side: our 3000 sits in TeamEnemy (Sapphire), the label pair is relative.
  topbar(game, { amber: AMBER, sapphire: SAPPHIRE, local: 2 });
  tick(game, 180, 2);
  const p = pill(game);
  assert.equal(p.text, '-25%');
  assert.equal(opacity(p.enemy), 0.833);
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
  assert.ok(opacity(pill(game).ally) > 0 && opacity(pill(game).ally) < 0.2);
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
  assert.equal(opacity(p.ally), 1, 'glow capped at 30 %');
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
  assert.deepEqual(sent, ['Souls +25% (4.0k vs 3.0k)']);
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
    '{"s":8,"u":"#FFE14D","d":"#4DD2FF","l":1,"g":1,"x":64}',
  ]) {
    const old = launch(createProfile({ [KEY]: record(body) }), { withTimer: true, clock: '3:00' });
    old.advance(2000);
    assert.equal(old.state().phase, 'blocked', `${body} is damaged`);
  }
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

const report = { generatedAt: new Date().toISOString(), checks };
const outPath = path.join(root, '.tmp', 'bt-networth-e2e.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
for (const entry of checks) console.log(`${entry.passed ? 'PASS' : 'FAIL'} ${entry.name}${entry.passed ? '' : `\n${entry.error}`}`);
console.log(`${checks.filter((c) => c.passed).length}/${checks.length} net worth checks passed; report ${path.relative(root, outPath)}`);
