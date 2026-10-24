'use strict';
// Ticket 38: BAR › Your health bar › Shield bar: Separate brings back the pre-6711 own HUD bar, as natively as
// client.dll 6796 allows (debated with m1). The game still feeds the old #shield_bar; the white fill is the
// native #health_bar rescaled through its JS-writable `max` (fill = lowervalue / max, lowervalue = health / D
// with D = max(max HP, health + shield + barrier + recent loss)); the number leaves the shield out.
// Failure modes covered: setting off or HP Colors off touches nothing and schedules nothing; the shield bar
// shows only with shield capacity; the fill is health / max HP with a shield up, and returns to the game's
// scale only once that scale is right again; the number is health only and keeps the game's mid/low colors;
// a Rat King barrier gets the old spirit-shield bar and number in the Rat King colour; unreadable numbers fall
// back to the game's view; a QOLLOCK HUD is corrected too, a QOLLOCK healthbar theme keeps its layout and
// QOLLOCK's Minecraft healthbar (bars drawn invisible) is left alone (ticket 40); steady state writes
// nothing; turning it off or a pending reload releases everything, including an earlier context's leftovers;
// a replaced HUD is found again and the old one released; sampling stays cheap.
const assert = require('node:assert/strict');
const test = require('node:test');
const { MockPanel, installTopBarIdentityTree } = require('./boot-layout');
const { profile, launch } = require('./storage-fixture');

const OWN_LABEL = 'HPColorsLegacyHealthLabel';
// The watch runs at most 120 times a second (one game frame at 120 fps); FRAME steps one callback.
const WATCH = 1 / 120, FRAME = 9;
const OLD_LOOK = {
  HealthRegenAndTotal: { width: '115px', horizontalAlign: 'right', marginTop: '5px', marginRight: '10px' },
  healthContainer: { marginRight: '10px' },
  shieldNumbersContainer: { marginRight: '23px', visibility: 'visible' },
};
// Ticket 41: the recent heal/damage counters sit in #HealthRegenAndTotal at 6711+ offsets (165px/160px) made
// for its 250px width; inside the old 115px box they start past its right edge, so they go back to 6710's.
// Heal keeps that spot with a shield or barrier up too: right of the damage it was cut at the health area's
// edge live on 6819, also with `overflow: noclip` on its container.
const OLD_COUNTERS = {
  RecentHealContainer: { marginLeft: '35px', marginTop: '30px' },
  RecentDamageContainer: { marginLeft: '35px', marginTop: '160px' },
};
const expectOnlyOldHealMargins = h => assert.deepEqual([...new Set(h.healCounters.__styleWrites.map(w => w.property + '=' + w.value))].sort(),
  ['marginLeft=35px', 'marginTop=30px'], 'heal gets only the 6710 margins');

// Stock 6796 HUD: hud_health_container.xml hosting hud_health.xml (CitadelHudHealth #hud_health_bars).
function hudTree(f, options = {}) {
  // A native ProgressBarWithMiddle builds its Left/Middle/Right children (classes ProgressBarLeft...);
  // the mock does not, so CreatePanel adds them here and records the creation properties.
  if (!f.harness.$.__bars) {
    const create = f.harness.$.CreatePanel; f.harness.$.__bars = [];
    f.harness.$.CreatePanel = (type, parent, id, props) => {
      const panel = create(type, parent, id, props);
      if (type === 'ProgressBarWithMiddle') {
        panel.__props = props || {}; panel.lowervalue = 0; panel.uppervalue = 0; panel.max = 1; f.harness.$.__bars.push(panel);
        for (const part of ['Left', 'Middle', 'Right']) new MockPanel('Panel', panel, id + '_' + part).AddClass('ProgressBar' + part);
      }
      return panel;
    };
  }
  // options.hero: a top bar naming the local hero (identity watch), with the health HUD under its Hud.
  const hud = options.hero ? installTopBarIdentityTree(f.harness, { heroName: options.hero }).hud : new MockPanel('Panel', f.harness.root, 'Hud');
  const middle = new MockPanel('Panel', hud, 'HudMiddle');
  const container = new MockPanel('Panel', middle, 'health_and_abilities_container'); container.AddClass('team1');
  const content = new MockPanel('Panel', container, 'HealthBarContent');
  const bars = new MockPanel('Panel', content, 'hud_health_bars');
  const line = new MockPanel('Panel', bars, ''); line.AddClass('health_bar_line');
  const border = new MockPanel('Panel', line, ''); border.AddClass('health_bar_border');
  const progress = id => { const bar = new MockPanel('ProgressBarWithMiddle', border, id); bar.lowervalue = 1; bar.uppervalue = 1; bar.max = 1;
    new MockPanel('Panel', bar, id + '_Left'); new MockPanel('Panel', bar, id + '_Middle'); new MockPanel('Panel', bar, id + '_Right'); return bar; };
  const health = progress('health_bar'), damage = progress('pending_incoming_damage'), heal = progress('pending_incoming_heal');
  const merged = progress('shield_bar_2'), barrier = progress('ratking_armor_bar');
  const lines = new MockPanel('Panel', border, 'healthLines');
  const shield = new MockPanel('ProgressBarWithMiddle', bars, 'shield_bar'); shield.max = 1;
  const shieldLeft = new MockPanel('Panel', shield, 'shield_bar_Left');
  const regen = new MockPanel('Panel', content, 'HealthRegenAndTotal');
  // options.noCounters: a HUD without the recent heal/damage counters (they are optional to the lane).
  const healCounters = options.noCounters ? null : new MockPanel('Panel', regen, 'RecentHealContainer');
  const damageCounters = options.noCounters ? null : new MockPanel('Panel', regen, 'RecentDamageContainer');
  if (healCounters) { healCounters.AddClass('recentHealCounters'); damageCounters.AddClass('recentDamageCounters'); }
  const numbers = new MockPanel('Panel', regen, ''); numbers.AddClass('shieldNumbersContainer');
  const bullet = new MockPanel('Panel', numbers, 'BulletShieldNumbers');
  const bulletCurrent = new MockPanel('Label', bullet, ''); bulletCurrent.AddClass('progress_bar_current');
  const bulletMax = new MockPanel('Label', bullet, ''); bulletMax.AddClass('progress_bar_max');
  // The spirit (tech) shield numbers stay in the 6711+ layout but nothing feeds them.
  const tech = new MockPanel('Panel', numbers, 'TechShieldNumbers'); tech.AddClass('shield_bar_numbers');
  const techCurrent = new MockPanel('Label', tech, ''); techCurrent.AddClass('progress_bar_current');
  new MockPanel('Label', tech, '').AddClass('progress_bar_max');
  const box = new MockPanel('Panel', regen, ''); box.AddClass('healthContainer');
  new MockPanel('Panel', box, '').AddClass('healthBacker');
  const current = new MockPanel('Label', box, ''); current.AddClass('currentHealthLabel');
  const total = new MockPanel('Label', box, ''); total.AddClass('totalHealthLabel');
  if (options.qollock) new MockPanel('Label', box, 'currentHealthOverHearts');
  if (options.theme) hud.AddClass(options.theme);
  const h = { hud, container, bars, health, damage, heal, merged, barrier, lines, shield, shieldLeft, regen, healCounters, damageCounters, numbers, bullet, bulletCurrent, bulletMax, tech, techCurrent, box, current, total };
  // What CitadelHudHealth / CitadelHudHealthContainer write each update (IDA: sub_181E5CBC0, UpdateBar
  // 0x181C0DE30, sub_181C095D0). UpdateBar writes the bars together: health lower = h/D, shield_bar_2
  // h/D..(h+S)/D, old shield_bar S/Smax. Labels come from other updaters, so `stale` keeps the old texts.
  // HasBulletShield and BulletShieldBroken follow the shield max (sub_181C6C280): an empty shield keeps HasBulletShield.
  h.engine = ({ H, M, S = 0, B = 0, cap = S, lost = 0, text, maxText, bulletText, stale = false }) => {
    const D = Math.max(M, H + S + B + lost);
    health.lowervalue = H / D; damage.lowervalue = H / D; heal.lowervalue = H / D; merged.lowervalue = H / D; merged.uppervalue = (H + S) / D;
    shield.lowervalue = cap > 0 ? S / cap : 0;
    barrier.lowervalue = (H + S) / D; barrier.uppervalue = (H + S + B) / D; // UpdateBar 0x181C0E290..: (h+S)/D..(h+S+B)/D
    if (!stale) { current.text = text || String(H + S + B); total.text = maxText || '/ ' + M; bulletCurrent.text = bulletText === undefined ? String(S) : bulletText; bulletMax.text = '/ ' + cap; }
    bars.SetHasClass('shieldActive', cap > 0); bars.SetHasClass('ratKingArmorActive', B > 0); container.SetHasClass('HasBulletShield', cap > 0); container.SetHasClass('BulletShieldBroken', cap > 0 && S === 0);
    container.SetHasClass('localPlayerMidHealth', H / M <= 0.6 && H / M > 0.3); container.SetHasClass('localPlayerLowHealth', H / M <= 0.3);
  };
  h.engine({ H: 1020, M: 1020 });
  return h;
}
const contract = f => f.harness.$.HPColorsV3Settings;
const find = (f, id) => { const panel = f.harness.contextPanel.FindChildTraverse(id); assert.ok(panel, id); return panel; };
const row = f => contract(f).controls.find(r => r.key === 'hudShieldStyle');
const setStyle = (f, value) => find(f, row(f).options.find(o => o.value === value).id).events.onactivate();
const master = f => find(f, contract(f).controls.find(r => r.key === 'enabled').toggleId).events.onactivate();
const legacyJobs = f => f.harness.scheduler.jobs.filter(job => job.fn && job.fn.name === 'legacyShieldTick');
const own = h => h.box.FindChildTraverse(OWN_LABEL);
const ownZero = h => h.bullet.FindChildTraverse('HPColorsLegacyShieldZero');
const ownBarrier = h => h.shield.GetParent().Children().find(child => child.id === 'tech_shield_bar') || null;
const ownBarrierNumber = h => h.tech.FindChildTraverse('HPColorsLegacyBarrierNumber');
const RAT_KING = '#C8A165'; // #ratking_armor_bar .ProgressBarMiddle (hud_health.css 6711-6805)
const ownLines = h => h.lines.GetParent().Children().find(child => child !== h.lines && child.id === 'healthLines') || null;
// UpdateTickBar (0x181C74D60, lambda 0x181C773F0, 0x181BD50E0): a line every 250 (line_small_amt) up to
// D, line_large on multiples of 1000, none above 50 lines, at position y = 100 * (1 - v / D) %.
function expectTicks(panel, M) {
  const lines = panel.Children(), count = Math.floor(M / 250);
  assert.equal(lines.length, count, 'one line every 250 of max HP');
  lines.forEach((line, i) => {
    const v = 250 * (i + 1);
    assert.ok(line.BHasClass(v % 1000 === 0 ? 'line_large' : 'line_small'), 'line ' + v);
    assert.equal(line.style.position, '0px ' + (100 * (1 - v / M)).toFixed(3) + '% 0px', 'line ' + v);
  });
}
const fill = h => h.health.lowervalue / h.health.max;
const shown = panel => !!panel && panel.style.visibility !== 'collapse' && String(panel.style.opacity) !== '0';
// Live 6805 (user screenshot 2026-10-21): a game number collapsed while shielded did not come back
// after the shield went. The game's label is only ever faded, never collapsed, so it stays laid out.
const neverCollapsed = panel => panel.__styleWrites.every(write => !(write.property === 'visibility' && write.value === 'collapse'));
function allWrites(h) { return ['container', 'bars', 'health', 'damage', 'heal', 'merged', 'barrier', 'lines', 'shield', 'shieldLeft', 'regen', 'healCounters', 'damageCounters', 'numbers', 'box', 'current', 'total']
  .reduce((sum, key) => sum + (h[key] ? h[key].__styleWrites.length : 0), 0); }
const counterStyles = h => Object.keys(OLD_COUNTERS).map(id => [id, id === 'RecentHealContainer' ? h.healCounters : h.damageCounters]);
function expectOldCounters(h) {
  for (const [id, panel] of counterStyles(h))
    for (const [property, value] of Object.entries(OLD_COUNTERS[id])) assert.equal(panel.style[property], value, id + ' ' + property);
}
function separate(h) { const f = launch(profile()); const tree = h(f); f.run(2000); setStyle(f, 'separate'); return { f, h: tree }; }

test('ticket 38: Shield bar is a shared Bar setting under Your health bar, Merged by default, with plain help', () => {
  const f = launch(profile()); f.run(2000);
  const r = row(f);
  assert.deepEqual(JSON.parse(JSON.stringify([r.side, r.page, r.group, r.level, r.default, r.options.map(o => o.value)])),
    ['shared', 'Bar', 'Your health bar', 'basic', 'merged', ['merged', 'separate']]);
  assert.equal(f.settings().shared.hudShieldStyle, 'merged');
  assert.match(r.help, /green bar/); assert.match(r.help, /leaves the shield out/);
});

test('ticket 38: Merged (the default) writes nothing to the HUD and schedules nothing', () => {
  const f = launch(profile()), h = hudTree(f); f.run(2000);
  h.engine({ H: 1020, M: 1020, S: 600 }); f.run(3000);
  assert.equal(allWrites(h), 0); assert.equal(legacyJobs(f).length, 0); assert.equal(h.health.max, 1); assert.equal(own(h), null);
});

test('ticket 38: Separate with no shield restores the old layout and leaves the fill and number to the game', () => {
  const { f, h } = separate(hudTree); f.run(500);
  for (const [key, styles] of Object.entries(OLD_LOOK)) {
    const panel = key === 'HealthRegenAndTotal' ? h.regen : key === 'healthContainer' ? h.box : h.numbers;
    for (const [property, value] of Object.entries(styles)) assert.equal(panel.style[property], value, key + ' ' + property);
  }
  assert.equal(shown(h.shield) && h.shield.style.visibility === 'visible', false, 'no shield capacity: the green bar stays hidden');
  assert.equal(h.health.max, 1); assert.equal(shown(h.current), true); assert.equal(shown(own(h)), false);
  assert.equal(shown(h.lines), true, 'the game health ticks stay');
  assert.equal(legacyJobs(f).length, 1); assert.equal(legacyJobs(f)[0].delay, WATCH, 'a one-read watch every frame');
});

test('ticket 41: Separate moves the recent heal and damage counters back into the old 115px box', () => {
  const { f, h } = separate(hudTree); f.run(500);
  expectOldCounters(h);
  h.engine({ H: 700, M: 1020 }); f.run(300);
  expectOldCounters(h);
});

test('ticket 41: with a shield or barrier up, heal stays at the September spot', () => {
  const { f, h } = separate(hudTree); f.run(500);
  h.engine({ H: 700, M: 1020, S: 600 }); f.run(300);
  expectOldCounters(h);
  h.engine({ H: 700, M: 1020, S: 0, cap: 600 }); f.run(300);
  expectOldCounters(h); // an empty shield still shows its "0"
  h.engine({ H: 700, M: 1020, B: 200 }); f.run(300);
  expectOldCounters(h); // the Rat King barrier number sits in the same spot
  h.engine({ H: 700, M: 1020 }); f.run(300);
  expectOldCounters(h);
  expectOnlyOldHealMargins(h);
});

test('ticket 41: a HUD without the recent counters still gets the separate shield bar', () => {
  const { f, h } = separate(f => hudTree(f, { noCounters: true }));
  h.engine({ H: 700, M: 1020, S: 600 }); f.run(300);
  assert.equal(h.regen.style.width, '115px'); assert.equal(h.shield.style.visibility, 'visible');
  assert.ok(Math.abs(fill(h) - 700 / 1020) < 1e-6, 'fill at health / max HP: ' + fill(h)); assert.equal(own(h).text, '700');
});

test('ticket 38: a shield up shows the old green bar, keeps the white fill at health / max HP and the number at health', () => {
  const { f, h } = separate(hudTree);
  h.engine({ H: 1020, M: 1020, S: 600 }); f.run(300);
  assert.equal(h.shield.style.visibility, 'visible'); assert.equal(h.shieldLeft.style.backgroundColor, '#4BDC68');
  assert.equal(h.merged.style.visibility, 'collapse', 'no cyan shield inside the health bar');
  assert.ok(Math.abs(fill(h) - 1) < 1e-6, 'full health stays a full white bar: ' + fill(h));
  for (const bar of [h.damage, h.heal]) assert.equal(bar.max, h.health.max, bar.id + ' shares the health scale');
  assert.equal(own(h).text, '1020'); assert.equal(shown(own(h)), true); assert.equal(shown(h.current), false);
  assert.equal(own(h).style.color, '#FFEFD7'); assert.ok(own(h).BHasClass('currentHealthLabel'), 'the game font and size');
  assert.equal(String(own(h).style.ignoreParentFlow), 'true', 'drawn over the faded game number, not below it');
  assert.equal(shown(h.lines), false, 'the game ticks follow the merged scale, so they hide while it is corrected');
  assert.ok(ownLines(h), 'ticks drawn at max HP in a panel with the game id, so the stock #healthLines rules apply');
  assert.equal(shown(ownLines(h)), true); expectTicks(ownLines(h), 1020);
  assert.equal(legacyJobs(f)[0].delay, WATCH, 'samples every frame while a shield is up');
  h.engine({ H: 600, M: 1020, S: 600 }); f.run(100);
  assert.ok(Math.abs(fill(h) - 600 / 1020) < 1e-6, 'damaged: ' + fill(h)); assert.equal(own(h).text, '600'); assert.equal(own(h).style.color, '#DDFF56');
  h.engine({ H: 250, M: 1020, S: 600 }); f.run(100);
  assert.ok(Math.abs(fill(h) - 250 / 1020) < 1e-6); assert.equal(own(h).style.color, '#FF5656');
});

test('ticket 38: the owned number colour follows the game health classes when max HP changes alone', () => {
  const { f, h } = separate(hudTree);
  h.engine({ H: 600, M: 1020, S: 600 }); f.run(300); assert.equal(own(h).style.color, '#DDFF56');
  h.engine({ H: 600, M: 2500, S: 600 }); f.run(300);
  assert.equal(own(h).text, '600'); assert.equal(own(h).style.color, '#FF5656', 'same health, now low against the new max');
  h.engine({ H: 600, M: 1020, S: 0, cap: 600 }); f.run(300); assert.equal(shown(own(h)), false);
  h.engine({ H: 600, M: 700, S: 600 }); f.run(300);
  assert.equal(shown(own(h)), true); assert.equal(own(h).style.color, '#FFEFD7', 're-shown with the same number: colour read again');
});

test('ticket 38: after the shield breaks the fill keeps health / max HP until the game scale is right, then hands back', () => {
  const { f, h } = separate(hudTree);
  h.engine({ H: 900, M: 1020, S: 600 }); f.run(300);
  h.engine({ H: 900, M: 1020, S: 0, cap: 600, lost: 400 }); f.run(100);
  assert.ok(Math.abs(fill(h) - 900 / 1020) < 1e-6, 'a recent loss still stretches the game scale: ' + fill(h));
  assert.equal(shown(h.current), true, 'no shield: the game number is already health only'); assert.equal(shown(own(h)), false);
  assert.equal(h.shield.style.visibility, 'visible', 'capacity remains: the empty green bar stays, like the old HUD');
  h.engine({ H: 900, M: 1020, S: 0, cap: 600 }); f.run(200);
  assert.equal(h.health.max, 1, 'the game scale is health / max HP again');
  assert.equal(legacyJobs(f)[0].delay, WATCH, 'an empty shield: the one-read watch every frame');
  assert.equal(shown(h.lines), true, 'ticks back once the shield is gone'); assert.equal(shown(h.current), true);
  assert.equal(shown(ownLines(h)), false, 'the game ticks are right again, so the owned ones hide');
  assert.ok(neverCollapsed(h.current), 'the game number is never collapsed: ' + JSON.stringify(h.current.__styleWrites));
  h.engine({ H: 900, M: 1020, S: 0, cap: 0 }); f.run(200);
  assert.notEqual(h.shield.style.visibility, 'visible', 'no capacity: hidden again');
});

test('ticket 38: an empty shield shows 0 beside the green bar, in the game shield-number style', () => {
  const { f, h } = separate(hudTree);
  h.engine({ H: 900, M: 1020, S: 600 }); f.run(300);
  assert.equal(ownZero(h), null, 'a shield with points: the game number shows');
  // Live 6805 debug: with the shield empty the game's shield number did not read as 0.
  h.engine({ H: 900, M: 1020, S: 0, cap: 600, bulletText: '' }); f.run(300);
  assert.equal(h.bullet.style.visibility, 'visible', 'the shield numbers stay while the shield has capacity');
  assert.equal(ownZero(h).text, '0'); assert.equal(shown(ownZero(h)), true);
  assert.ok(ownZero(h).BHasClass('progress_bar_current'), 'the game rules for the shield number, including BulletShieldBroken');
  assert.equal(shown(h.bulletCurrent), false, 'the blank game label is faded under it');
  assert.equal(shown(h.current), true, 'no shield points: the game HP number is health');
  h.engine({ H: 900, M: 1020, S: 0, cap: 600, bulletText: '0' }); f.run(300);
  assert.equal(shown(ownZero(h)), false, 'the game shows 0 itself'); assert.equal(shown(h.bulletCurrent), true);
  h.engine({ H: 900, M: 1020, S: 0, cap: 600, bulletText: '' }); f.run(300);
  h.engine({ H: 900, M: 1020, S: 150, cap: 600 }); f.run(300);
  assert.equal(shown(ownZero(h)), false, 'recharging: the game number again'); assert.equal(shown(h.bulletCurrent), true);
  h.engine({ H: 900, M: 1020, S: 0, cap: 0 }); f.run(300);
  assert.notEqual(h.bullet.style.visibility, 'visible', 'no capacity: the stock rule hides the numbers');
  assert.equal(shown(ownZero(h)), false);
});

test('ticket 38: a Rat King barrier gets the old spirit-shield bar in the Rat King colour, out of the health bar and number', () => {
  const { f, h } = separate(hudTree);
  // The user's screenshot: shield 600 and barrier 300 over 800 / 1136.
  h.engine({ H: 800, M: 1136, S: 600, B: 300 }); f.run(300);
  assert.ok(Math.abs(fill(h) - 800 / 1136) < 1e-6, 'health / max HP: ' + fill(h));
  assert.equal(own(h).text, '800', 'the HP number leaves shield and barrier out'); assert.equal(shown(h.current), false);
  assert.equal(shown(h.merged), false, 'no cyan shield inside the health bar'); assert.equal(shown(h.barrier), false, 'no tan barrier inside it');
  assert.equal(h.shield.style.visibility, 'visible', 'the green shield bar stays');
  const bar = ownBarrier(h);
  assert.ok(bar, 'the old #tech_shield_bar is back'); assert.equal(shown(bar), true);
  assert.deepEqual({ ...bar.__props }, { vertical: 'true', class: 'small_progress_bar' });
  assert.equal(bar.FindChildrenWithClassTraverse('ProgressBarLeft')[0].style.backgroundColor, RAT_KING);
  assert.equal(bar.style.marginRight, '12px', 'beside the shield bar, as the old pair');
  assert.equal(bar.lowervalue, 1, 'full at its peak');
  assert.equal(h.tech.style.visibility, 'visible', 'the spirit-shield numbers carry the barrier');
  assert.equal(ownBarrierNumber(h).text, '300'); assert.equal(ownBarrierNumber(h).style.color, RAT_KING);
  assert.equal(shown(ownBarrierNumber(h)), true); assert.equal(shown(h.techCurrent), false, 'the unfed game label is faded under it');
  // The barrier drains; the health fill and number stay.
  h.engine({ H: 800, M: 1136, S: 600, B: 150 }); f.run(100);
  assert.equal(bar.lowervalue, 0.5); assert.equal(ownBarrierNumber(h).text, '150'); assert.ok(Math.abs(fill(h) - 800 / 1136) < 1e-6);
  // No shield: the barrier alone, scale from the HP text (h + B) over the barrier bar top.
  h.engine({ H: 964, M: 1136, S: 0, cap: 0, B: 150 }); f.run(300);
  assert.ok(Math.abs(fill(h) - 964 / 1136) < 1e-6, 'no shield: ' + fill(h)); assert.equal(own(h).text, '964');
  assert.equal(bar.style.marginRight, '29px', 'alone it takes the shield bar spot'); assert.equal(ownBarrierNumber(h).text, '150');
  // Barrier gone: everything hands back.
  h.engine({ H: 964, M: 1136 }); f.run(300);
  assert.equal(shown(bar), false); assert.equal(shown(ownBarrierNumber(h)), false); assert.equal(shown(h.techCurrent), true);
  assert.notEqual(h.tech.style.visibility, 'visible'); assert.equal(h.health.max, 1); assert.equal(shown(h.current), true);
  // A new barrier starts a new peak.
  h.engine({ H: 964, M: 1136, B: 100 }); f.run(300); assert.equal(bar.lowervalue, 1);
});

test('ticket 38: a barrier draining without a shield keeps health / max HP on every frame', () => {
  const { f, h } = separate(hudTree);
  h.engine({ H: 964, M: 1136, B: 150 }); f.run(300);
  // The barrier top moves every frame while the HP text is sampled every 50 ms; health must come from
  // one consistent pair and the fresh bars, not from a cached total over a fresh top.
  for (let i = 1; i <= 25; i++) {
    const B = 150 - 2 * i;
    h.engine({ H: 964, M: 1136, B }); f.run(FRAME);
    assert.ok(Math.abs(fill(h) - 964 / 1136) < 1e-6, 'frame ' + i + ' fill ' + fill(h));
    assert.equal(own(h).text, '964', 'frame ' + i); assert.equal(ownBarrierNumber(h).text, String(B), 'frame ' + i);
  }
});

test('ticket 38: a barrier or a recharging shield is corrected by the next callback, with two bar reads per quiet frame', () => {
  const { f, h } = separate(hudTree);
  h.engine({ H: 1136, M: 1136 }); f.run(300);
  // Live 6805 (user screenshot 20261021185328): the frame a barrier appeared showed a gap and the merged
  // number 1306, until the next 100 ms sample.
  let reads = 0;
  for (const [bar, key] of [[h.health, 'lowervalue'], [h.merged, 'uppervalue'], [h.shield, 'lowervalue'], [h.barrier, 'uppervalue']]) {
    let value = bar[key];
    Object.defineProperty(bar, key, { get: () => { reads++; return value; }, set: v => { value = v; }, configurable: true });
  }
  f.run(400); const quiet = reads; reads = 0;
  assert.ok(quiet <= 2 * 48 + 4 * 2, 'quiet: two bar reads per callback (48 in 400 ms at 120/s) plus two more per 100 ms sample: ' + quiet);
  // Order engine -> script -> render: the frame the game writes the barrier, the callback corrects it.
  h.engine({ H: 1136, M: 1136, B: 170 }); f.run(FRAME);
  assert.ok(Math.abs(fill(h) - 1) < 1e-6, 'barrier frame: full health, no gap: ' + fill(h));
  assert.equal(own(h).text, '1136'); assert.equal(shown(ownBarrier(h)), true); assert.equal(ownBarrierNumber(h).text, '170');
  h.engine({ H: 1136, M: 1136 }); f.run(300);
  h.engine({ H: 1136, M: 1136, S: 0, cap: 600 }); f.run(300);
  h.engine({ H: 1136, M: 1136, S: 40, cap: 600 }); f.run(FRAME);
  assert.ok(Math.abs(fill(h) - 1) < 1e-6, 'recharge frame: no gap: ' + fill(h)); assert.equal(own(h).text, '1136');
});

test('ticket 38: the every-frame watch runs only where a shield or a Rat King barrier can appear', () => {
  // modifier_ratking_ratarmor is the caster's own armour (abilities.vdata "ratking_armor_caster"), so with
  // another known hero and no shield max the bar can only change natively: 10/s, as before the watch.
  const f = launch(profile()), h = hudTree(f, { hero: 'Infernus' }); f.run(3000); setStyle(f, 'separate');
  h.engine({ H: 900, M: 1136 }); f.run(500);
  assert.equal(legacyJobs(f)[0].delay, 0.1, 'known non-Rat-King hero, no shield: 10/s');
  h.engine({ H: 900, M: 1136, S: 0, cap: 600 }); f.run(300);
  assert.equal(legacyJobs(f)[0].delay, WATCH, 'a shield max: the watch runs');
  const g = launch(profile()), k = hudTree(g, { hero: 'Rat King' }); g.run(3000); setStyle(g, 'separate');
  k.engine({ H: 1136, M: 1136 }); g.run(500);
  assert.equal(legacyJobs(g)[0].delay, WATCH, 'Rat King: the watch runs');
  k.engine({ H: 1136, M: 1136, B: 170 }); g.run(FRAME);
  assert.ok(Math.abs(fill(k) - 1) < 1e-6, 'and catches the barrier on its first callback: ' + fill(k));
});

test('ticket 38: if the game updates after the script in a frame, the gap lasts one frame (live order unverified)', () => {
  const { f, h } = separate(hudTree);
  h.engine({ H: 1136, M: 1136 }); f.run(300);
  // Order script -> engine -> render: the callback has run, then the game writes the barrier, then the
  // frame draws with the old max. Which order Panorama uses is not known; this pins the worst case.
  f.run(FRAME); h.engine({ H: 1136, M: 1136, B: 170 });
  assert.ok(fill(h) < 1, 'this frame renders the gap: ' + fill(h));
  f.run(FRAME);
  assert.ok(Math.abs(fill(h) - 1) < 1e-6, 'the next callback corrects it: ' + fill(h)); assert.equal(own(h).text, '1136');
});

test('ticket 38: unreadable numbers fall back to the game view', () => {
  const { f, h } = separate(hudTree);
  h.engine({ H: 1020, M: 1020, S: 600, text: '1.6k' }); f.run(300);
  assert.ok(h.health.max < 1, 'the HP text is not needed while the bars give the scale'); assert.equal(own(h).text, '1020');
  h.engine({ H: 1020, M: 1020, S: 600, maxText: '/ 1.0k' }); f.run(200);
  assert.equal(h.health.max, 1, 'unreadable max HP: no guess'); assert.equal(shown(h.current), true);
});

// Ticket 40: QOLLOCK pak03 keeps the stock bars and labels and adds #currentHealthOverHearts (Minecraft
// hearts) to every healthbar type; type 0 is the stock HUD, types 1-5 add a root theme class.
const layoutWrites = h => [h.regen, h.healCounters, h.damageCounters, h.box, h.numbers, h.shieldLeft].reduce((sum, panel) => sum + panel.__styleWrites.length, 0);
test('ticket 40: a QOLLOCK HUD on its default healthbar gets the old look', () => {
  const { f, h } = separate(f => hudTree(f, { qollock: true }));
  h.engine({ H: 700, M: 1020, S: 600 }); f.run(300);
  assert.equal(h.regen.style.width, '115px'); assert.equal(h.numbers.style.visibility, 'visible');
  assert.equal(h.shieldLeft.style.backgroundColor, '#4BDC68'); assert.equal(h.shield.style.visibility, 'visible');
  assert.ok(Math.abs(fill(h) - 700 / 1020) < 1e-6, 'fill at health / max HP: ' + fill(h)); assert.equal(own(h).text, '700');
  expectOldCounters(h);
});

test('ticket 40: a QOLLOCK healthbar theme keeps its layout and look; the bar is still corrected', () => {
  const { f, h } = separate(f => hudTree(f, { qollock: true, theme: 'minimalist_healthbar_active' }));
  h.engine({ H: 700, M: 1020, S: 600 }); f.run(300);
  assert.equal(layoutWrites(h), 0, 'theme positions, shield numbers and colour untouched');
  assert.equal(h.shield.style.visibility, 'visible'); assert.equal(h.merged.style.visibility, 'collapse');
  assert.ok(Math.abs(fill(h) - 700 / 1020) < 1e-6, 'fill at health / max HP: ' + fill(h)); assert.equal(own(h).text, '700');
  // Theme off (QOLLOCK type 0) within the 1 s HUD watch: the old layout; theme on again: handed back.
  h.hud.RemoveClass('minimalist_healthbar_active'); h.engine({ H: 700, M: 1020, S: 600 }); f.run(1200);
  assert.equal(h.regen.style.width, '115px'); assert.equal(h.shieldLeft.style.backgroundColor, '#4BDC68'); expectOldCounters(h);
  h.hud.AddClass('minimalist_healthbar_active'); h.engine({ H: 700, M: 1020, S: 600 }); f.run(1200);
  for (const panel of [h.box, h.numbers, h.shieldLeft, h.healCounters, h.damageCounters])
    for (const property of Object.keys(panel.style)) assert.ok([null, undefined, ''].includes(panel.style[property]), property + '=' + panel.style[property]);
  assert.ok([null, undefined, ''].includes(h.regen.style.width)); assert.ok(Math.abs(fill(h) - 700 / 1020) < 1e-6, 'still corrected');
});

test('ticket 40: QOLLOCK Minecraft healthbar draws the bars invisible, so the lane stays off and schedules nothing', () => {
  const { f, h } = separate(f => hudTree(f, { qollock: true, theme: 'minecraft_healthbar_active' }));
  h.engine({ H: 700, M: 1020, S: 600 }); f.run(2000);
  assert.equal(allWrites(h), 0); assert.equal(h.health.max, 1); assert.equal(legacyJobs(f).length, 0);
  // Switched to Minecraft while corrected: handed back on the next 1 s HUD watch.
  h.hud.RemoveClass('minecraft_healthbar_active'); f.run(1200); assert.ok(h.health.max < 1);
  h.hud.AddClass('minecraft_healthbar_active'); f.run(1200);
  assert.equal(h.health.max, 1); assert.equal(shown(own(h)), false); assert.equal(legacyJobs(f).length, 0);
});

test('ticket 38: while the shield takes damage the fill holds health / max HP on every frame, from the bars alone', () => {
  const { f, h } = separate(hudTree);
  h.engine({ H: 800, M: 1020, S: 600 }); f.run(300);
  // Live 6805: the bar twitched until the shield broke. The game scale D moves every frame
  // (recent loss and its decay), and the labels may trail the bars, so texts stay stale here.
  for (let i = 1; i <= 25; i++) {
    const S = 600 - 20 * i, lost = (i % 5) * 37;
    h.engine({ H: 800, M: 1020, S, cap: 600, lost, stale: true }); f.run(FRAME);
    assert.ok(Math.abs(fill(h) - 800 / 1020) < 1e-6, 'frame ' + i + ' fill ' + fill(h));
    assert.equal(own(h).text, '800', 'frame ' + i + ': the number comes from the same bars');
  }
  expectTicks(ownLines(h), 1020);
});

test('ticket 38: the pending damage/heal bars follow the scale every frame only while they draw', () => {
  const { f, h } = separate(hudTree);
  h.engine({ H: 800, M: 1020, S: 600 }); f.run(300);
  let damageWrites = 0; { let value = h.damage.max; Object.defineProperty(h.damage, 'max', { get: () => value, set: v => { damageWrites++; value = v; }, configurable: true }); }
  // UpdateBar sets pendingIncomingDamageActive/HealActive on #hud_health_bars; otherwise their middle is empty.
  for (let i = 1; i <= 50; i++) { h.engine({ H: 800, M: 1020, S: 600 - 4 * i, cap: 600, lost: (i % 7) * 11 }); f.run(FRAME); }
  assert.ok(damageWrites <= 10, 'inactive: at most once per 50 ms sample (450 ms), not per callback: ' + damageWrites);
  f.run(60); assert.equal(h.damage.max, h.health.max, 'caught up by the next sample');
  h.bars.AddClass('pendingIncomingDamageActive'); f.run(60);
  for (let i = 1; i <= 25; i++) {
    h.engine({ H: 800, M: 1020, S: 400 - 4 * i, cap: 600, lost: (i % 7) * 11 }); f.run(FRAME);
    assert.equal(h.damage.max, h.health.max, 'active: every frame ' + i);
  }
});

test('ticket 38: owned ticks follow a max HP change and release with the rest', () => {
  const { f, h } = separate(hudTree);
  h.engine({ H: 900, M: 1020, S: 600 }); f.run(300); expectTicks(ownLines(h), 1020);
  h.engine({ H: 900, M: 1300, S: 600 }); f.run(300); expectTicks(ownLines(h), 1300);
  setStyle(f, 'merged');
  assert.equal(shown(ownLines(h)), false); assert.equal(shown(h.lines), true);
});

test('ticket 38: steady state writes nothing and sampling stays cheap', t => {
  const { f, h } = separate(hudTree);
  h.engine({ H: 800, M: 1020, S: 600 }); f.run(1000);
  let maxWrites = 0, barReads = 0;
  for (const bar of [h.health, h.damage, h.heal]) {
    const value = bar.max;
    Object.defineProperty(bar, 'max', { get: () => value, set: () => { maxWrites++; }, configurable: true });
  }
  // The three per-frame reads: health lower, shield_bar_2 upper, shield_bar lower.
  for (const [bar, key] of [[h.health, 'lowervalue'], [h.merged, 'uppervalue'], [h.shield, 'lowervalue']]) {
    const value = bar[key];
    Object.defineProperty(bar, key, { get: () => { barReads++; return value; }, configurable: true });
  }
  const writes = allWrites(h) + own(h).__styleWrites.length + h.bullet.__styleWrites.length + h.bulletCurrent.__styleWrites.length;
  for (const key of Object.keys(f.harness.operationCounts)) f.harness.operationCounts[key] = 0;
  f.run(10000);
  assert.equal(allWrites(h) + own(h).__styleWrites.length + h.bullet.__styleWrites.length + h.bulletCurrent.__styleWrites.length, writes, 'no style writes');
  assert.equal(maxWrites, 0, 'no max writes on any of the three bars');
  assert.equal(f.harness.operationCounts.textWrites || 0, 0, 'no text writes'); assert.equal(f.harness.operationCounts.styleWrites || 0, 0);
  t.diagnostic(JSON.stringify({ barReadsPerSecond: barReads / 10 }));
  assert.ok(barReads / 10 <= 3 * 120 + 3, 'three bar reads per callback at most, 120 callbacks a second: ' + barReads / 10);
  const counts = f.harness.operationCounts, supplemental = ['boundaryQueries', 'boundaryValidityCalls', 'schedules', 'cancellations', 'moveChildCalls'];
  const perSecond = Object.keys(counts).filter(key => !supplemental.includes(key)).reduce((sum, key) => sum + (Number(counts[key]) || 0), 0) / 10;
  t.diagnostic(JSON.stringify({ legacyShieldOpsPerSecond: perSecond, counts }));
  assert.ok(perSecond <= 200, 'shield-up sampling: ' + perSecond);
});

test('ticket 38: Merged or HP Colors off releases everything; a pending reload releases an earlier context', () => {
  const { f, h } = separate(hudTree);
  h.engine({ H: 700, M: 1020, S: 0, cap: 600, bulletText: '' }); f.run(300); assert.equal(shown(ownZero(h)), true);
  h.engine({ H: 700, M: 1020, S: 600, B: 200 }); f.run(300); assert.equal(shown(ownBarrier(h)), true);
  h.engine({ H: 700, M: 1020, S: 600 }); f.run(300); assert.ok(h.health.max < 1); expectOldCounters(h);
  const released = () => {
    for (const panel of [h.regen, h.healCounters, h.damageCounters, h.box, h.numbers, h.lines, h.shield, h.shieldLeft, h.merged, h.barrier, h.current, h.bullet, h.bulletCurrent, h.tech, h.techCurrent])
      for (const property of Object.keys(panel.style)) {
        // Live 6782: horizontalAlign cannot be cleared alone; it goes back to the stylesheet value.
        const stock = panel === h.regen && property === 'horizontalAlign' ? 'center' : '';
        assert.ok([null, undefined, '', stock].includes(panel.style[property]), panel.id + ' ' + property + '=' + panel.style[property]);
      }
    for (const bar of [h.health, h.damage, h.heal]) assert.equal(bar.max, 1, bar.id);
    assert.equal(shown(own(h)), false); assert.equal(shown(ownZero(h)), false); assert.equal(shown(ownLines(h)), false);
    assert.equal(shown(ownBarrier(h)), false); assert.equal(shown(ownBarrierNumber(h)), false);
  };
  setStyle(f, 'merged'); released(); assert.equal(legacyJobs(f).length, 0);
  setStyle(f, 'separate'); f.run(300); assert.ok(h.health.max < 1);
  master(f); released(); assert.equal(legacyJobs(f).length, 0);
  master(f); f.run(300); assert.ok(h.health.max < 1, 'on again');
  f.reload({ dropTitle: () => true }); f.run(500); released();
});

test('ticket 38: a stock HUD whose panels arrive late is picked up', () => {
  const f = launch(profile()), h = hudTree(f); f.run(2000);
  h.shield.SetParent(null); setStyle(f, 'separate');
  h.engine({ H: 700, M: 1020, S: 600 }); f.run(1500); assert.equal(h.health.max, 1, 'incomplete HUD: untouched');
  h.shield.SetParent(h.bars); h.engine({ H: 700, M: 1020, S: 600 }); f.run(1500);
  assert.ok(Math.abs(fill(h) - 700 / 1020) < 1e-6, 'complete now: corrected');
});

test('ticket 38: a replaced HUD is corrected again and the old one released', () => {
  const { f, h } = separate(hudTree);
  h.engine({ H: 700, M: 1020, S: 600 }); f.run(300); assert.ok(h.health.max < 1);
  h.hud.SetParent(null); const g = hudTree(f); g.engine({ H: 500, M: 1020, S: 600 }); f.run(1500);
  assert.equal(h.health.max, 1, 'old HUD handed back'); assert.ok(Math.abs(fill(g) - 500 / 1020) < 1e-6, 'new HUD corrected');
});

test('ticket 38: record v15 carries Separate in codes; a v14 code without slot 195 reads Merged', () => {
  const f = launch(profile()); f.run(2000);
  const { HPColorsV3Sharing: sharing, HPColorsV3Settings: settingsContract } = f.harness.$;
  assert.equal(settingsContract.recordVersion, 16);
  const settings = JSON.parse(JSON.stringify(f.settings())); settings.shared.hudShieldStyle = 'separate';
  const exported = sharing.exportSettingsCode(settings, {}); assert.equal(exported.ok, true, exported.message);
  const back = sharing.importSettingsCode(exported.code); assert.equal(back.ok, true, back.message);
  assert.equal(back.settings.shared.hudShieldStyle, 'separate');
  const codec = f.harness.$.HPColorsV3Codec, body = JSON.stringify({ v: 14, k: 'settings', d: [14, true] });
  const old = sharing.importSettingsCode('HPC3.' + codec.checksum(Buffer.from(body).toString('base64url')) + '.' + Buffer.from(body).toString('base64url'));
  if (old.ok) assert.equal(old.settings.shared.hudShieldStyle, 'merged');
  else assert.fail('a v14 code must import: ' + old.message);
});
