"use strict";
// Drives the real feeder_feed.js against a mocked HUD (kill feed, top bar, damage report)
// and checks the tallies the FEEDER FEED tab renders. Run: node feeder_feed/scripts/validate-feeder-feed.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const fixture = require("./feeder-feed-fixture");
const { Panel, entry, rendered, observed } = fixture;
const setup = (...args) => {
  const run = fixture.setup(...args);
  run.hud.SetHasClass("localPlayerTeam1", true); // relative feed fixtures play on Amber
  return run;
};
const h = setup();
h.tick(); // boot -> poll
h.hud.SetHasClass("GameStateInProgress", true);
h.hud.SetHasClass("localPlayerTeam1", true);
h.tick();
assert.ok(h.logs.some((l) => l.includes("reset (match started)")), "match start resets");
assert.ok(h.report.BHasClass("FeederEnemyTeam2") && !h.report.BHasClass("FeederEnemyTeam1"), "team 1 faces team 2 colors");

// Bump an enemy hero's top-bar assist counter, as the server does for each assister.
const assistIn = (run) => (...heroes) => heroes.forEach((hero) => {
  const row = run.hud.FindChildTraverse("TeamEnemy").FindChildrenWithClassTraverse("HeroName").find((l) => l.text === hero)._parent;
  const counter = row.FindChildrenWithClassTraverse("assists")[0];
  counter.text = String(Number(counter.text) + 1);
});
const assist = assistIn(h);

// 1. SEVEN dies to VENATOR, INFERNUS assists (1,250). 2. VENATOR takes SEVEN's bag (395).
// 3. HAZE dies to a trooper alone (300). 4. SEVEN kills INFERNUS (500): the enemy fed us, which counts too.
// 5. HAZE dies to INFERNUS + 2 assisters ("1.2k"); their counters update a moment later.
// 6. HAZE dies to a trooper + 1 assister (200) while two counters rise: ambiguous, so the souls
//    go to "Assisters (split)" instead of a guessed hero.
assist("INFERNUS");
h.push(entry("BOB", "enemy", "XXSNIPERXX", "friendly", "1,250", ["teammateDied", "hasGold", "hasAssists"], 1));
h.push(entry("BOB", "enemy", "SOUL BAG", null, "395", ["hasGold", "SoulBagPickup", "SoulBagStolen"]));
h.push(entry("Trooper", "enemy", "POTATO", "friendly", "300", ["teammateDied", "hasGold"]));
h.push(entry("XXSNIPERXX", "friendly", "CARL", "enemy", "500", ["enemyDied", "hasGold"]));
h.push(entry("Carl", "enemy", "Potato", "friendly", "1.2k", ["teammateDied", "hasGold", "hasAssists"], 2));
assist("VENATOR", "LASH");
for (let i = 0; i < 3; i++) h.tick();
assist("VENATOR", "LASH");
h.push(entry("Trooper", "enemy", "POTATO", "friendly", "200", ["teammateDied", "hasGold", "hasAssists"], 1));
for (let i = 0; i < 60; i++) h.tick(); // trooper misses retry until a fresh scan calls them non-hero
assert.ok(h.logs.some((l) => l.includes("ASSIST #1 INFERNUS(1)")), "single assister found from its counter");
assert.ok(h.logs.some((l) => l.includes("ASSIST #5 VENATOR(65),LASH(31)")), "late counters still matched");
assert.ok(h.logs.some((l) => l.includes("ASSIST unresolved")), "ambiguous counters are not guessed");

const report = h.report;
const section = report.FindChildTraverse("FeederFeedSection");
assert.equal(rendered(report.FindChildTraverse("FeederDonors")).length, 0, "no render while the damage tab is active");
report.FindChildTraverse("FeederTabFeed")._events.onactivate();
assert.ok(report.BHasClass("FeederFeedActive") && report.FindChildTraverse("FeederTabFeed").BHasClass("Selected"));

const donors = rendered(report.FindChildTraverse("FeederDonors"));
// Lists start at the top three; the pill counts the hidden rows and expands the list.
const recipientsMore = report.FindChildTraverse("FeederRecipientsMore");
assert.deepEqual(rendered(report.FindChildTraverse("FeederRecipients")).map((r) => r.name), ["VENATOR", "INFERNUS", "SEVEN"]);
assert.ok(recipientsMore.visible && recipientsMore._vars.feeder_more === "Show more (3)", "show-more pill counts hidden rows");
assert.ok(!report.FindChildTraverse("FeederDonorsMore").visible, "no pill for three rows or fewer");
recipientsMore._events.onactivate();
assert.equal(recipientsMore._vars.feeder_more, "Show less");
const recipients = rendered(report.FindChildTraverse("FeederRecipients"));
assert.deepEqual(donors, [
  { name: "HAZE", value: "1,700 souls - 3 deaths", tag: "TOP", death: "100%", bag: "0%", heroId: 13, neutral: false },
  { name: "SEVEN", value: "1,645 souls - 1 death - 1 bag", tag: "", death: "74%", bag: "23%", heroId: 2, neutral: false },
  { name: "INFERNUS", value: "500 souls - 1 death", tag: "", death: "29%", bag: "0%", heroId: 1, neutral: false }
]);
// Killer keeps 2.2 / (N + 2.2): 1,250 w/ 1 assister -> 860 + 390 (INFERNUS);
// 1,200 w/ 2 -> 629 + 571 split 285 (VENATOR) / 286 (LASH); the ambiguous 200 stays split.
assert.deepEqual(recipients, [
  { name: "VENATOR", value: "1,540 souls - 1 kill - 1 assist - 1 bag", tag: "TOP", death: "74%", bag: "26%", heroId: 65, neutral: false },
  { name: "INFERNUS", value: "1,019 souls - 1 kill - 1 assist", tag: "", death: "66%", bag: "0%", heroId: 1, neutral: false },
  { name: "SEVEN", value: "500 souls - 1 kill", tag: "", death: "32%", bag: "0%", heroId: 2, neutral: false },
  { name: "NPCs & mishaps", value: "300 souls - 1 kill", tag: "", death: "19%", bag: "0%", heroId: null, neutral: true },
  { name: "LASH", value: "286 souls - 1 assist", tag: "", death: "19%", bag: "0%", heroId: 31, neutral: false },
  { name: "Assisters (split)", value: "200 souls - 1 assist", tag: "", death: "13%", bag: "0%", heroId: null, neutral: false }
]);
assert.match(section._vars.feeder_footer, /Team charity total: 3,345 souls across 4 deaths and 1 stolen bag\./);
assert.match(section._vars.feeder_footer, /Enemy charity total: 500 souls across 1 death and 0 stolen bags\./);
assert.ok(report.FindChildTraverse("FeederDonors")._kids[2].BHasClass("SideEnemy"), "enemy donor bar uses the enemy team color");

// Back to the damage tab, then a new match clears everything.
report.FindChildTraverse("FeederTabDamage")._events.onactivate();
assert.ok(!report.BHasClass("FeederFeedActive"));
h.feed._kids.length = 0;
h.hud.SetHasClass("GameStateInProgress", false); h.tick();
h.hud.SetHasClass("GameStateInProgress", true);
h.hud.SetHasClass("localPlayerTeam1", false);
h.hud.SetHasClass("localPlayerTeam2", true);
h.tick();
assert.ok(h.report.BHasClass("FeederEnemyTeam1") && !h.report.BHasClass("FeederEnemyTeam2"), "team 2 faces team 1 colors");
report.FindChildTraverse("FeederTabFeed")._events.onactivate();
assert.equal(rendered(report.FindChildTraverse("FeederDonors")).length, 0, "new match starts empty");
assert.match(section._vars.feeder_footer, /No donations yet/);

const leaked = h.logs.filter((l) => /sniper|potato|\bbob\b|\bcarl\b|\bdave\b|trooper/i.test(l));
assert.deepEqual(leaked, [], "player/NPC names must never be logged");
assert.ok(!h.logs.some((l) => l.includes("ERR")), "no runtime errors");

// Comeback: our team is far ahead in souls (formats "20.0k", "18,000", "<b>7,000</b>" as on the
// top bar). SEVEN (20k) dies to VENATOR (not his first kill), INFERNUS assists. Team multiplier
// 2.32 x difficulty 4.73 caps at 5, so a 2,600 feed total = 1,000 bounty + 1,600 comeback.
fixture.stats = {
  SEVEN: { souls: "20.0k" }, HAZE: { souls: "18,000" },
  VENATOR: { souls: "9,000", kills: "3" }, INFERNUS: { souls: "8k" }, LASH: { souls: "<b>7,000</b>" }
};
const c = setup();
c.tick();
c.hud.SetHasClass("GameStateInProgress", true);
c.tick();
assistIn(c)("INFERNUS");
c.push(entry("BOB", "enemy", "XXSNIPERXX", "friendly", "2,600", ["teammateDied", "hasGold", "hasAssists"], 1));
c.tick();
c.report.FindChildTraverse("FeederTabFeed")._events.onactivate();
assert.ok(c.logs.some((l) => l.includes("CB #1 status=estimate mult=5.00 extra=1600 bonus=0 victimTeam=38000 killerTeam=24000 victim=20000 avg=8000")),
  "comeback detected from top-bar souls");
// Bounty 1,000: VENATOR 688 / INFERNUS 312. Comeback 1,600: VENATOR 30% = 480; the other 1,120
// is weighted 1.5 (INFERNUS, assister) : 1 (LASH, did not assist) -> 672 / 448.
const comeback = rendered(c.report.FindChildTraverse("FeederRecipients"));
assert.deepEqual(comeback, [
  { name: "VENATOR", value: "1,168 souls - 1 kill", tag: "TOP", death: "100%", bag: "0%", heroId: 65, neutral: false },
  { name: "INFERNUS", value: "984 souls - 1 assist", tag: "", death: "84%", bag: "0%", heroId: 1, neutral: false },
  { name: "LASH", value: "448 souls - 1 share", tag: "", death: "38%", bag: "0%", heroId: 31, neutral: false }
]);
assert.deepEqual(rendered(c.report.FindChildTraverse("FeederDonors")).map((r) => r.value), ["2,600 souls - 1 death"]);
assert.ok(!c.logs.some((l) => l.includes("ERR")), "no runtime errors (comeback)");

// Clock-first inversion must preserve integer paid shares, not nominal comeback or a rounded base.
function comebackRun(clock, total, kills = "3", delayed = false) {
  fixture.stats = {
    SEVEN: { souls: "200k" }, HAZE: { souls: "180,000" },
    VENATOR: { souls: "9,000", kills }, INFERNUS: { souls: "8k" }, LASH: { souls: "<b>7,000</b>" }
  };
  const run = setup(clock);
  run.tick(); run.hud.SetHasClass("GameStateInProgress", true); run.tick();
  if (!delayed) assistIn(run)("INFERNUS");
  run.push(entry("BOB", "enemy", "XXSNIPERXX", "friendly", String(total), ["teammateDied", "hasGold", "hasAssists"], 1));
  if (delayed) {
    const row = run.hud.FindChildrenWithClassTraverse("HeroName").find((p) => p.text === "VENATOR").GetParent();
    row.FindChildrenWithClassTraverse("kills")[0].text = "2";
    row.GetParent().FindChildTraverse("SoulsValue").text = "garbage";
    run.hud.FindChildTraverse("GameTime").text = "30:00";
    assistIn(run)("INFERNUS"); run.tick(300);
  }
  run.report.FindChildTraverse("FeederTabFeed")._events.onactivate();
  return run;
}
// Scaled bounty S = ceil(B * frac[k-1] * k); k = killer + 1 assister = 2 -> x1.15.
// 16:02: B=1001, S=1152, cap 7 -> N=2764 -> K829 + A1161 + O774 = 2764.
const exact = comebackRun("16:02", 1152 + 2764);
assert.ok(exact.logs.some((l) => /status=exact.*extra=2764 .*K=829 A=1161 O=774/.test(l)), "clock recovers integer shares");
// Bounty 1152: VENATOR keeps 1152 - floor(0.3125 * 1152) = 792, INFERNUS 360.
assert.deepEqual(rendered(exact.report.FindChildTraverse("FeederRecipients")).map((r) => r.value),
  ["1,621 souls - 1 kill", "1,521 souls - 1 assist", "774 souls - 1 share"]);
const frozen = comebackRun("16:02", 1152 + 2764 + 125, "1", true);
assert.ok(frozen.logs.some((l) => /status=exact.*extra=2764 bonus=125.*clock=16:02.*chosenBonus=125/.test(l)),
  "frozen inputs survive delay; KDA=1 resolved by the only souls-consistent candidate");
const frozenZero = comebackRun("16:02", 1152 + 125, "1", true);
assert.ok(frozenZero.logs.some((l) => /status=exact.*extra=0.*bonus=125.*clock=16:02/.test(l)),
  "frozen first-kill bonus resolves exactly when paid extra is zero");
// 7:59: B=599, S=689, cap 5 -> N=1102 -> 330+463+308 = 1101. 8:00: B=600, S=690, cap 7 -> N=1656
// -> 496+696+464 = 1656. The souls estimate must reproduce the same paid extra.
const early = comebackRun("7:59", 689 + 1101);
const late = comebackRun("8:00", 690 + 1656);
assert.ok(early.logs.some((l) => /status=exact.*mult=5\.00 extra=1101 .*soulsCrossCheck=match/.test(l)), "7:59 cap is five");
assert.ok(late.logs.some((l) => /status=exact.*mult=7\.00 extra=1656 .*soulsCrossCheck=match/.test(l)), "8:00 cap is seven");
// Unknown clock: the souls fallback (cap 5) still solves the integer base when mult is capped.
const fallback = comebackRun("?", 689 + 1101);
assert.ok(fallback.logs.some((l) => /status=estimate.*extra=1101 .*K=330 A=463 O=308/.test(l)), "fallback solves integer base");
assert.match(fallback.report.FindChildTraverse("FeederFeedSection")._vars.feeder_footer, /estimate/i);
assert.ok(fallback.logs.some((l) => /status=estimate/.test(l)), "unknown clock uses marked souls fallback");
for (const bad of ["garbage", "12.3k trailing", "", "1,23", "-1"]) {
  fixture.stats.VENATOR.souls = bad;
  const invalid = setup("16:02"); invalid.tick();
  invalid.hud.SetHasClass("GameStateInProgress", true); invalid.tick();
  assistIn(invalid)("INFERNUS");
  invalid.push(entry("BOB", "enemy", "XXSNIPERXX", "friendly", "2601", ["teammateDied", "hasGold", "hasAssists"], 1));
  invalid.report.FindChildTraverse("FeederTabFeed")._events.onactivate();
  assert.ok(invalid.logs.some((l) => /status=unknown/.test(l)), "invalid souls stays unknown: " + bad);
  assert.match(invalid.report.FindChildTraverse("FeederFeedSection")._vars.feeder_footer, /estimate/i);
}
// Coverage must include unpopulated rows, not just currently readable HeroName labels.
for (const damage of ["unequal", "missing-both", "duplicate", "bad-kills"]) {
  fixture.stats = { SEVEN: { souls: "12.3k" }, VENATOR: { kills: "3" } };
  const partial = setup("16:02"); partial.tick();
  if (damage === "bad-kills") partial.hud.FindChildrenWithClassTraverse("kills")[3].text = "3garbage";
  else if (damage === "duplicate") partial.hud.FindChildrenWithClassTraverse("HeroName")[4].GetParent().GetParent().FindChildTraverse("HeroBadge").heroid = 2;
  else {
    const names = partial.hud.FindChildrenWithClassTraverse("HeroName").filter((p) => p.text !== "SHOP HERO");
    names[0]._cls.delete("HeroName");
    if (damage === "missing-both") names[3]._cls.delete("HeroName");
  }
  partial.push(entry("Trooper", "enemy", "POTATO", "friendly", "2601", ["teammateDied", "hasGold"]));
  for (let i = 0; i < 30; i++) partial.tick();
  if (damage === "bad-kills") partial.push(entry("BOB", "enemy", "POTATO", "friendly", "2601", ["teammateDied", "hasGold"]));
  assert.ok(partial.logs.some((l) => /status=unknown/.test(l)), "partial/invalid snapshot rejected: " + damage);
}
const noComeback = comebackRun("16:02", 1152);
assert.ok(noComeback.logs.some((l) => /status=exact.*extra=0/.test(l)), "zero paid extra is exact no comeback");
for (const clock of ["7:99", "1:60:00", "16:02 trailing", "-1:00"]) {
  const badClock = comebackRun(clock, 2600);
  assert.ok(badClock.logs.some((l) => /status=estimate/.test(l)), "strict clock rejection: " + clock);
}
const hourClock = comebackRun("1:00:00", 2530);
assert.ok(hourClock.logs.some((l) => /status=exact.*extra=0/.test(l)), "hour clock and max bounty (2200 x 1.15)");
for (const total of [1151, 1157]) { // negative paid extra, or impossible integer paid extra of five
  const inconsistent = comebackRun("16:02", total);
  assert.ok(inconsistent.logs.some((l) => /status=estimate/.test(l)), "inconsistent clock/payout falls back: " + total);
}

// Replay of a live sandbox capture (console.log 2026-10-06 13:07-13:08): feed totals, top-bar
// labels and clock exactly as the HUD showed them; expected values from the server's own
// "Base Bounty" / "Comeback Active ... Killer Portion / Portion per Assister" lines.
const LIVE_ROSTER = { friendly: [["me", "SHIV", 19], ["yam", "YAMATO", 27]], enemy: [["bot5", "VENATOR", 65], ["bot4", "WRAITH", 7]] };
function liveKill(roster, souls, clock, total, victim, killer = "bot5", assister = "WRAITH") {
  fixture.stats = souls;
  const run = setup(clock, roster);
  run.tick(); run.hud.SetHasClass("GameStateInProgress", true); run.tick();
  if (assister) assistIn(run)(assister);
  run.push(entry(killer, "enemy", victim, "friendly", String(total),
    assister ? ["teammateDied", "hasGold", "hasAssists"] : ["teammateDied", "hasGold"], assister ? 1 : 0));
  run.tick(300);
  return run.logs.find((l) => l.includes("CB #")) || "";
}
// Server: GameTime 0.7, Base Bounty 232, Total Bounty 357 (first kill), Comeback Inactive; feed 392.
assert.match(liveKill({ friendly: [["me", "SHIV", 19]], enemy: LIVE_ROSTER.enemy },
  { SHIV: { souls: "600" }, WRAITH: { souls: "600" }, VENATOR: { souls: "49k", kills: "0" } }, "0:39", 392, "me"),
/status=exact .*extra=0 bonus=125 /, "live kill 1: no comeback, first-kill bonus");
// Server: Bounty Base 312, Killer Portion 149, Portion per Assister 350, Non-Assister 233 (none present); feed 811.
// The killer's top-bar kills still read 1 although this is his second kill.
const liveSouls = (kills) => ({ SHIV: { souls: "49k" }, YAMATO: { souls: "49k" }, VENATOR: { souls: "26k", kills }, WRAITH: { souls: "25k" } });
assert.match(liveKill(LIVE_ROSTER, liveSouls("1"), "1:26", 811, "yam"),
  /status=exact .*extra=499 bonus=0 .*K=149 A=350 O=233 /, "live kill 2: server comeback portions");
// Server: Bounty Base 317, Killer Portion 152, Portion per Assister 355; feed 824.
assert.match(liveKill(LIVE_ROSTER, liveSouls("2"), "1:30", 824, "me"),
  /status=exact .*extra=507 bonus=0 .*K=152 A=355 O=236 /, "live kill 3: server comeback portions");
// Second live capture (13:26, solo kills, k=1 -> x1.25). The clock label trails the server: label
// 0:20 paid Base Bounty 217 (21 s), label 1:13 paid 261 (74 s). Every kill paid the 125 bonus
// although the killer's KDA was past one.
const SOLO = { friendly: [["me", "SEVEN", 2]], enemy: [["bot", "INFERNUS", 1]] };
const solo = (kills, clock, total) => liveKill(SOLO, { SEVEN: { souls: "600" }, INFERNUS: { souls: "1,100", kills } },
  clock, total, "me", "bot", null);
assert.match(solo("0", "0:20", 397), /status=exact .*extra=0 bonus=125 .*base=272$/, "solo kill 1: lagging clock");
assert.match(solo("1", "0:45", 422), /status=exact .*extra=0 bonus=125 .*base=297$/, "solo kill 2");
assert.match(solo("2", "1:13", 452), /status=exact .*extra=0 bonus=125 .*base=327$/, "solo kill 3: bonus despite KDA 2");

// Spectating: feed containers carry absolute team_1/team_2 classes; the top bar decides sides.
// Both teams feed: the enemy bag VENATOR steals goes to the newest friendly death (HAZE); the
// bag HAZE steals (live 14:45: "HOLLIDAY -> SOUL BAG ... kind=other") goes to INFERNUS.
fixture.stats = { VENATOR: { kills: "3" } };
const spec = fixture.setup("16:02");
spec.tick(); spec.hud.SetHasClass("GameStateInProgress", true); spec.tick();
spec.push(entry("BOB", "team_2", "XXSNIPERXX", "team_1", "1250", ["teammateDied", "hasGold"]));
spec.push(entry("Trooper", "team_2", "POTATO", "team_1", "300", ["hasGold"]));
spec.push(entry("POTATO", "team_1", "CARL", "team_2", "900", ["enemyDied", "hasGold"]));
spec.push(entry("BOB", "team_2", "SOUL BAG", null, "395", ["hasGold", "SoulBagPickup", "SoulBagStolen"]));
spec.push(entry("POTATO", "team_1", "SOUL BAG", null, "250", ["hasGold", "SoulBagPickup", "SoulBagStolen"]));
spec.tick(300);
spec.report.FindChildTraverse("FeederTabFeed")._events.onactivate();
assert.ok(spec.logs.some((l) => /NEW #1 VENATOR\(65\) -> SEVEN\(2\) .*kind=death .*spec=team_2>team_1/.test(l)), "spectated hero death is ours");
assert.ok(spec.logs.some((l) => /NEW #3 HAZE\(13\) -> INFERNUS\(1\) .*kind=death/.test(l)), "spectated enemy death counts");
assert.ok(spec.logs.some((l) => /NEW #5 HAZE\(13\) -> SOUL BAG .*kind=bag .*spec=team_1>null/.test(l)), "friendly bag steal counts");
assert.deepEqual(rendered(spec.report.FindChildTraverse("FeederDonors")).map((r) => r.name + ":" + r.value),
  ["SEVEN:1,250 souls - 1 death", "INFERNUS:1,150 souls - 1 death - 1 bag", "HAZE:695 souls - 1 death - 1 bag"]);
assert.deepEqual(rendered(spec.report.FindChildTraverse("FeederRecipients")).map((r) => r.name + ":" + r.value).slice(0, 2),
  ["VENATOR:1,645 souls - 1 kill - 1 bag", "HAZE:1,150 souls - 1 kill - 1 bag"]);
assert.ok(spec.report.BHasClass("FeederEnemyTeam2") && !spec.report.BHasClass("FeederEnemyTeam1"), "spectator enemy color learned");
// The spectator switched home team: the top-bar enemy now carries team_1, so tallies restart.
spec.push(entry("BOB", "team_1", "XXSNIPERXX", "team_2", "1250", ["teammateDied", "hasGold"]));
spec.tick(); spec.tick();
assert.ok(spec.logs.some((l) => l.includes("reset (spectator perspective changed)")), "perspective flip resets");

// Assisters read from the feed's own portraits, while the spectator's top-bar counters lag
// (live 13:46-13:50: "ASSIST unresolved ... counters rose by 0" for every spectated death).
fixture.stats = { VENATOR: { kills: "3" } };
const portraits = fixture.setup("16:02");
portraits.tick(); portraits.hud.SetHasClass("GameStateInProgress", true); portraits.tick();
portraits.push(entry("BOB", "team_2", "XXSNIPERXX", "team_1", "1152", ["teammateDied", "hasGold", "hasAssists"], 1, [1]));
portraits.tick(300);
portraits.report.FindChildTraverse("FeederTabFeed")._events.onactivate();
assert.ok(portraits.logs.some((l) => l.includes("ASSIST #1 feed INFERNUS(1)")), "assister read from feed portrait");
assert.ok(portraits.logs.some((l) => /CB #1 status=exact .*extra=0 bonus=0 /.test(l)), "x1.15 bounty with the portrait assister");
assert.deepEqual(rendered(portraits.report.FindChildTraverse("FeederRecipients")).map((r) => r.name + ":" + r.value),
  ["VENATOR:792 souls - 1 kill", "INFERNUS:360 souls - 1 assist"]);
assert.equal(portraits.logs.filter((l) => l.includes("RESOLVED #1")).length, 0, "no RESOLVED spam for resolved entries");

// Non-kill feed panels (live 14:43: "NEW #8 CitadelHudBossKilled" then "ERR TypeError ... indexOf")
// are never retried as kill entries, and later deaths still count.
fixture.stats = { VENATOR: { kills: "3" } };
const boss = setup("16:02");
boss.tick(); boss.hud.SetHasClass("GameStateInProgress", true); boss.tick();
boss.push(new Panel("CitadelHudBossKilled", "", ["bossDied"]));
for (let i = 0; i < 15; i++) boss.tick();
boss.push(entry("BOB", "enemy", "XXSNIPERXX", "friendly", "1252", ["teammateDied", "hasGold"])); // solo: 1001 x 1.25
assert.ok(!boss.logs.some((l) => l.includes("ERR")), "boss panel retried as a kill entry");
assert.ok(boss.logs.some((l) => /CB #2 status=exact/.test(l)), "deaths after a boss panel still count");

// Live 14:43 spectated comeback: "9.8k"-rounded souls never reproduce the payout exactly, so the
// clock candidate nearest the souls estimate is used (still an estimate), not a souls-only split.
fixture.stats = {
  SEVEN: { souls: "9.8k" }, HAZE: { souls: "9.0k" }, ABRAMS: { souls: "7.6k" },
  VENATOR: { souls: "8.5k", kills: "3" }, INFERNUS: { souls: "8.4k" }, LASH: { souls: "8.5k" }
};
const nearest = setup("10:52");
nearest.tick(); nearest.hud.SetHasClass("GameStateInProgress", true); nearest.tick();
nearest.push(entry("BOB", "enemy", "XXSNIPERXX", "friendly", "1,147", ["teammateDied", "hasGold", "hasAssists"], 1, [1]));
const nearestLine = nearest.logs.find((l) => l.includes("CB #1")) || "";
assert.match(nearestLine, /status=estimate .*reason=nearest-clock-candidate .*base=85[567]$/, "nearest clock candidate");
const extra = Number(/extra=(\d+)/.exec(nearestLine)[1]);
const bonusPaid = Number(/ bonus=(\d+)/.exec(nearestLine)[1]);
const base = Number(/base=(\d+)/.exec(nearestLine)[1]);
assert.equal(base + bonusPaid + extra, 1147, "the nearest candidate conserves the feed total");

// Cached rows: a miss is an NPC only when every cached player label is readable and set.
fixture.stats = { VENATOR: { kills: "3" } };
const named = setup("16:02");
named.tick(); named.hud.SetHasClass("GameStateInProgress", true); named.tick();
named.push(entry("BOB", "enemy", "XXSNIPERXX", "friendly", "1152", ["teammateDied", "hasGold"]));
const carlLabel = named.hud.FindChildrenWithClassTraverse("PlayerName").find((p) => p.text === "carl");
carlLabel.text = "";
named.push(entry("Trooper", "enemy", "POTATO", "friendly", "300", ["teammateDied", "hasGold"]));
assert.ok(named.logs.some((l) => /NEW #2 \? -> HAZE\(13\)/.test(l)), "unnamed cached row keeps an NPC miss unresolved");
carlLabel.text = "carl";
for (let i = 0; i < 12; i++) named.tick();
assert.ok(named.logs.some((l) => /RESOLVED #2 non-hero -> HAZE\(13\)/.test(l)), "named roster then resolves the NPC");
// A row that changes teams (same panel, new container) is rescanned rather than read with a stale side.
const lash = named.hud.FindChildrenWithClassTraverse("HeroName").find((p) => p.text === "LASH").GetParent().GetParent();
const enemyTeam = named.hud.FindChildTraverse("TeamEnemy");
enemyTeam._kids.splice(enemyTeam._kids.indexOf(lash), 1);
named.hud.FindChildTraverse("TeamFriendly").add(lash);
for (let i = 0; i < 25; i++) named.tick();
named.push(entry("BOB", "enemy", "XXSNIPERXX", "friendly", "1152", ["teammateDied", "hasGold"]));
assert.ok(named.logs.some((l) => /TOPBAR rows=6 \[.*friendly:LASH\(31\)/.test(l)), "team change forces a rescan with the new side");

fixture.stats = { SEVEN: { souls: "12.3k" } };
const diagnostic = setup("00:01"); diagnostic.tick();
diagnostic.push(entry("BOB", "enemy", "XXSNIPERXX", "friendly", "200", ["teammateDied", "hasGold"]));
diagnostic.push(entry("BOB", "enemy", "XXSNIPERXX", "friendly", "200", ["teammateDied", "hasGold"]));
const samples = diagnostic.logs.filter((l) => l.includes("INPUT "));
assert.equal(samples.length, 1, "input diagnostic is once per session");
assert.match(samples[0], /12.3k.*12300.*00:01.*seconds=1/);
assert.ok(!samples.some((l) => /sniper|potato|bob|carl|dave/i.test(l)), "diagnostic has no names");

for (const raw of ["12 345", "1,2k"]) {
  fixture.stats = { SEVEN: { souls: raw } };
  const unparsed = setup("00:01"); unparsed.tick();
  for (let i = 0; i < 2; i++) unparsed.push(entry("BOB", "enemy", "XXSNIPERXX", "friendly", "200", ["teammateDied", "hasGold"]));
  const lines = unparsed.logs.filter((l) => l.includes("INPUT "));
  assert.equal(lines.length, 1, "unparseable live format still diagnosed once");
  assert.ok(lines[0].includes(JSON.stringify(raw) + " parsed=null"), "diagnostic preserves raw unsupported format");
}
const aboveCap = comebackRun("00:01", 2000);
assert.ok(aboveCap.logs.some((l) => /status=estimate.*reason=above-cap/.test(l)), "implausible clock payout falls back");
const secondKill = comebackRun("16:02", 1152, "1");
assert.ok(secondKill.logs.some((l) => /status=exact.*extra=0.*bonus=0/.test(l)), "lagging KDA=1 resolves second kill without bonus");
// Coverage traversal must not visit the whole HUD or descend into each player row.
fixture.stats = { SEVEN: { souls: "12.3k" }, VENATOR: { kills: "3" } };
const bounded = setup("00:01"); bounded.tick();
let outsideReads = 0;
let rowReads = 0;
bounded.hud.GetParent().GetChildCount = () => { outsideReads++; return 1; };
const playerRows = bounded.hud.FindChildrenWithClassTraverse("HeroName").filter((p) => p.text !== "SHOP HERO").map((p) => p.GetParent().GetParent());
playerRows.forEach((p) => { p.GetChildCount = () => { rowReads++; return p._kids.length; }; });
bounded.push(entry("BOB", "enemy", "XXSNIPERXX", "friendly", "200", ["teammateDied", "hasGold"]));
assert.equal(outsideReads, 0, "coverage never walks unrelated HUD branches");
assert.equal(rowReads, 0, "coverage stops at player rows");
let soulsReads = 0;
playerRows.forEach((p) => {
  const souls = p.FindChildTraverse("SoulsValue");
  const original = souls.text;
  Object.defineProperty(souls, "text", { get() { soulsReads++; return original; } });
});
bounded.push(entry("BOB", "enemy", "SOUL BAG", null, "395", ["hasGold", "SoulBagPickup", "SoulBagStolen"]));
bounded.push(entry("BOB", "enemy", "IDOL", null, "0", ["IdolPickedUp"]));
assert.equal(soulsReads, 0, "non-death entries never snapshot team worth");

// Local player on Sapphire (game team 3, HUD class localPlayerTeam2): the top-bar team panels are
// fixed by game team, so the enemy heroes sit in TeamFriendly (Amber). Seen live 2026-10-07: every
// hero came out "NPCs & mishaps" and team worth was unknown. Here the local-team class arrives
// after the match started and after a lookup cached the roster: the cached rows must be re-sided
// at once, not read with stale sides inside the scan throttle. The feed and top bar print the same
// player name (client 6759 rva 8687a0 feeds both), so names resolve; a trooper stays an NPC.
fixture.stats = {};
const sapphire = fixture.setup("16:02", { friendly: fixture.DEFAULT_ROSTER.enemy, enemy: fixture.DEFAULT_ROSTER.friendly });
sapphire.tick();
sapphire.hud.SetHasClass("GameStateInProgress", true); sapphire.tick();
sapphire.push(entry("BOB", "enemy", "IDOL", null, "0", ["IdolPickedUp"])); // caches the roster, team unknown
assert.ok(sapphire.logs.some((l) => /TOPBAR rows=6/.test(l)), "idol entry cached the pre-perspective roster");
sapphire.hud.SetHasClass("localPlayerTeam2", true);
sapphire.push(entry("BOB", "enemy", "XXSNIPERXX", "friendly", "600", ["teammateDied", "hasGold"]));
assert.ok(sapphire.logs.some((l) => /NEW #2 VENATOR\(65\) -> SEVEN\(2\)/.test(l)), "late local-team class resolves before the 1 Hz read");
sapphire.report.FindChildTraverse("FeederTabFeed")._events.onactivate();
assert.deepEqual(rendered(sapphire.report.FindChildTraverse("FeederDonors")).map((r) => r.name), ["SEVEN"], "late-team donor is SEVEN");
assert.deepEqual(rendered(sapphire.report.FindChildTraverse("FeederRecipients")).map((r) => r.name), ["VENATOR"], "late-team recipient is VENATOR, not an NPC");
assert.match(sapphire.report.FindChildTraverse("FeederFeedSection")._vars.feeder_footer, /Team charity total: 600 souls across 1 death/);
assert.ok(!sapphire.logs.some((l) => /NEW #2.*non-hero/.test(l)), "late-team hero is not classified as an NPC");
for (let i = 0; i < 10; i++) sapphire.tick(); // regular 1 Hz team read still runs
assert.ok(sapphire.report.BHasClass("FeederEnemyTeam1"), "Sapphire faces Amber colors");
sapphire.push(entry("BOB", "enemy", "SOUL BAG", null, "150", ["hasGold", "SoulBagPickup", "SoulBagStolen"]));
sapphire.push(entry("XXSNIPERXX", "friendly", "CARL", "enemy", "500", ["enemyDied", "hasGold"]));
sapphire.push(entry("Trooper", "enemy", "POTATO", "friendly", "300", ["teammateDied", "hasGold"]));
for (let i = 0; i < 60; i++) sapphire.tick();
assert.ok(sapphire.logs.some((l) => /TOPBAR rows=6 \[enemy:VENATOR\(65\).*friendly:SEVEN\(2\)/.test(l)), "TeamFriendly is the enemy for Sapphire");
sapphire.report.FindChildTraverse("FeederTabFeed")._events.onactivate();
assert.deepEqual(rendered(sapphire.report.FindChildTraverse("FeederDonors")).map((r) => r.name + " " + r.value),
  ["SEVEN 750 souls - 1 death - 1 bag", "INFERNUS 500 souls - 1 death", "HAZE 300 souls - 1 death"], "Sapphire donors resolve");
assert.deepEqual(rendered(sapphire.report.FindChildTraverse("FeederRecipients")).map((r) => r.name + " " + r.value),
  ["VENATOR 750 souls - 1 kill - 1 bag", "SEVEN 500 souls - 1 kill", "NPCs & mishaps 300 souls - 1 kill"], "Sapphire killers resolve, trooper stays NPC");
assert.ok(sapphire.logs.some((l) => /CB #2 .*victimTeam=0 killerTeam=0/.test(l)), "Sapphire team worth is known");
assert.ok(!sapphire.logs.some((l) => l.includes("ERR")), "no runtime errors (Sapphire)");

// A relative death can precede both local-team classes; it must wait, not freeze an NPC guess.
fixture.stats = {
  SEVEN: { souls: "20.0k" }, HAZE: { souls: "18,000" },
  VENATOR: { souls: "9,000", kills: "3" }, INFERNUS: { souls: "8k" }, LASH: { souls: "<b>7,000</b>" }
};
const unknownTeam = fixture.setup("16:02", { friendly: fixture.DEFAULT_ROSTER.enemy, enemy: fixture.DEFAULT_ROSTER.friendly });
unknownTeam.tick();
unknownTeam.hud.SetHasClass("GameStateInProgress", true); unknownTeam.tick();
unknownTeam.push(entry("BOB", "enemy", "IDOL", null, "0", ["IdolPickedUp"]));
unknownTeam.push(entry("BOB", "enemy", "XXSNIPERXX", "friendly", "2,600", ["teammateDied", "hasGold", "hasAssists"], 1, [1]));
assert.ok(unknownTeam.logs.some((l) => /NEW #2 \? -> \?/.test(l)), "unknown-team heroes stay unresolved");
unknownTeam.report.FindChildTraverse("FeederTabFeed")._events.onactivate();
assert.deepEqual(rendered(unknownTeam.report.FindChildTraverse("FeederRecipients")), [], "unknown-team death is not attributed to NPCs");
assert.ok(!unknownTeam.logs.some((l) => /ASSIST #2/.test(l)), "portrait assist waits for a known perspective");
unknownTeam.hud.FindChildTraverse("TeamFriendly").FindChildTraverse("SoulsValue").text = "9000";
unknownTeam.hud.FindChildTraverse("TeamEnemy").FindChildTraverse("SoulsValue").text = "8000";
unknownTeam.hud.SetHasClass("localPlayerTeam2", true);
for (let i = 0; i < 12; i++) unknownTeam.tick();
assert.deepEqual(rendered(unknownTeam.report.FindChildTraverse("FeederRecipients")).map((r) => r.name),
  ["VENATOR", "INFERNUS", "LASH"], "portrait assist and comeback share reach the enemy heroes");
assert.ok(unknownTeam.logs.some((l) => /ASSIST #2 feed INFERNUS\(1\)/.test(l)), "portrait resolves after perspective arrives");
assert.ok(unknownTeam.logs.some((l) => /CB #2 .*victimTeam=38000 killerTeam=24000 .*O=[1-9]\d*/.test(l)),
  "first-sight worth stays frozen and nonassister comeback share is nonzero");
assert.deepEqual(unknownTeam.report.FindChildTraverse("FeederRecipients")._kids.slice(0, 3).map((p) =>
  [p._vars.feeder_name, p.BHasClass("SideEnemy"), p.BHasClass("SideFriendly")]),
  [["VENATOR", true, false], ["INFERNUS", true, false], ["LASH", true, false]],
  "killer, portrait assister and comeback nonassister all use Sapphire enemy colors");

fixture.stats = { VENATOR: { kills: "3" } };
const unknownCounter = fixture.setup("16:02", { friendly: fixture.DEFAULT_ROSTER.enemy, enemy: fixture.DEFAULT_ROSTER.friendly });
unknownCounter.tick(); unknownCounter.hud.SetHasClass("GameStateInProgress", true); unknownCounter.tick();
const wrongAssister = unknownCounter.hud.FindChildTraverse("TeamEnemy").FindChildrenWithClassTraverse("HeroName")
  .find((p) => p.text === "SEVEN").GetParent();
wrongAssister.FindChildrenWithClassTraverse("assists")[0].text = "1"; // must not be claimed before team is known
unknownCounter.push(entry("BOB", "enemy", "XXSNIPERXX", "friendly", "1152", ["teammateDied", "hasGold", "hasAssists"], 1));
assert.ok(!unknownCounter.logs.some((l) => /ASSIST #1/.test(l)), "counter fallback does not queue before perspective arrives");
unknownCounter.hud.SetHasClass("localPlayerTeam2", true);
const infernus = unknownCounter.hud.FindChildTraverse("TeamFriendly").FindChildrenWithClassTraverse("HeroName")
  .find((p) => p.text === "INFERNUS").GetParent();
infernus.FindChildrenWithClassTraverse("assists")[0].text = "1";
for (let i = 0; i < 12; i++) unknownCounter.tick();
assert.ok(unknownCounter.logs.some((l) => /ASSIST #1 INFERNUS\(1\)/.test(l)), "counter fallback resolves on Sapphire after perspective arrives");
unknownCounter.report.FindChildTraverse("FeederTabFeed")._events.onactivate();
assert.deepEqual(rendered(unknownCounter.report.FindChildTraverse("FeederRecipients")).map((r) => r.name),
  ["VENATOR", "INFERNUS"], "counter assister is not lost to the wrong-side roster");

// An unreadable frozen nonparticipant stays unknown even if the live roster later becomes readable.
fixture.stats = {
  SEVEN: { souls: "20.0k" }, HAZE: { souls: "18,000" },
  VENATOR: { souls: "9,000", kills: "3" }, INFERNUS: { souls: "8k" }, LASH: { souls: "<b>7,000</b>" }
};
const unknownFrozen = fixture.setup("16:02", { friendly: fixture.DEFAULT_ROSTER.enemy, enemy: fixture.DEFAULT_ROSTER.friendly });
unknownFrozen.tick(); unknownFrozen.hud.SetHasClass("GameStateInProgress", true); unknownFrozen.tick();
const missingHero = unknownFrozen.hud.FindChildrenWithClassTraverse("HeroName").find((p) => p.text === "LASH");
const missingBadge = missingHero.GetParent().GetParent().FindChildTraverse("HeroBadge");
missingHero.text = "";
missingBadge.heroid = null;
unknownFrozen.push(entry("BOB", "enemy", "XXSNIPERXX", "friendly", "2,600",
  ["teammateDied", "hasGold", "hasAssists"], 1, [1]));
missingHero.text = "LASH";
missingBadge.heroid = 31;
unknownFrozen.hud.SetHasClass("localPlayerTeam2", true);
for (let i = 0; i < 12; i++) unknownFrozen.tick();
assert.ok(unknownFrozen.logs.some((l) => /CB #1 status=unknown .*reason=unknown-inputs/.test(l)),
  "residing preserves an unavailable first-sight hero identity");
unknownFrozen.report.FindChildTraverse("FeederTabFeed")._events.onactivate();
assert.deepEqual(rendered(unknownFrozen.report.FindChildTraverse("FeederRecipients")).map((r) => r.name),
  ["VENATOR", "INFERNUS"], "no nonassister share is attributed from a repaired live roster");

// The tab switch is pure CSS (the FeederFeedActive class): the feed section and header stay
// collapsed on the damage tab, and the damage section collapses on the feed tab.
const css = fs.readFileSync(path.join(__dirname, "..", "panorama", "styles", "feeder_feed.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const ruleFor = (selector) => {
  const rule = css.split("}").find((block) => block.split("{")[0].split(",").map((s) => s.trim()).includes(selector));
  return rule ? rule.split("{")[1] : "";
};
assert.match(ruleFor(".FeederFeedSection"), /visibility:\s*collapse/, "feed section hidden on the damage tab");
assert.match(ruleFor(".FeederHeader"), /visibility:\s*collapse/, "feed header hidden on the damage tab");
assert.match(ruleFor(".FeederFeedActive .FeederFeedSection"), /visibility:\s*visible/, "feed section shown on its tab");
assert.match(ruleFor(".FeederFeedActive .DamageSection"), /visibility:\s*collapse/, "damage section hidden on the feed tab");

const artifact = path.join(__dirname, "..", "..", ".tmp", "feeder-feed-validate.json");
fs.mkdirSync(path.dirname(artifact), { recursive: true });
fs.writeFileSync(artifact, JSON.stringify({
  donors, recipients, footer: section._vars.feeder_footer, logs: h.logs, comeback, comebackLogs: c.logs,
  exact: rendered(exact.report.FindChildTraverse("FeederRecipients")), exactLogs: exact.logs,
  frozenLogs: frozen.logs, earlyLogs: early.logs, lateLogs: late.logs, fallbackLogs: fallback.logs, samples,
  runs: fixture.runs.map(observed)
}, null, 2));
console.log("feeder_feed validation passed; artifact " + path.relative(process.cwd(), artifact));
