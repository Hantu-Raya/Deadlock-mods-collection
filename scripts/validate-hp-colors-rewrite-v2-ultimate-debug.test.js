"use strict";

// Failure modes: logging changes scheduling/rendering, leaks names or raw messages,
// floods the console, mistakes rejected snapshots for accepted cooldowns, or breaks
// after Closure. A throwing log sink must never stop the real timer.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { instrumentTimer } = require("./instrument-hpv2-ultimate-debug");
const { MockPanel, createPanoramaHarness, createVmContext, runInVm } = require("./hp-colors-panorama-test-adapter");
const repoRoot = path.resolve(__dirname, "..");
const sourceRoot = process.env.HP_COLORS_ULTIMATE_DEBUG_SOURCE_ROOT || path.join(repoRoot, "hp_colors_rewrite_v2");
const canonical = fs.readFileSync(path.join(repoRoot, "hp_colors_rewrite_v2/panorama/scripts/test_topbar_pickups.js"), "utf8");
const staged = fs.readFileSync(path.join(sourceRoot, "panorama/scripts/test_topbar_pickups.js"), "utf8");
const debugSource = process.env.HP_COLORS_ULTIMATE_DEBUG_SOURCE_ROOT ? staged : instrumentTimer(canonical);
const contract = fs.readFileSync(path.join(sourceRoot, "panorama/scripts/hp_colors_v2_contract.js"), "utf8");

function boot(source = debugSource, localTeam = 1, names = ["PRIVATE ALLY", "PRIVATE ENEMY"],
    heroes = null, overhead = names[1]) {
  const values = { enabled: true, pickupTimersEnabled: false, pickupSize: 22,
    ultimateTimerEnabled: true, ultimateTimerSize: 100, ultimateTimerDarkness: 70 };
  const hud = createPanoramaHarness({ now: 1000 });
  hud.root.AddClass("localPlayerTeam" + localTeam);
  const bar = hud.root.add(new MockPanel("TopBar", { classes: ["HPV2PickupTopBar"] }));
  bar.SetAttributeString("hp_colors_v2_config", JSON.stringify({
    magic_word: "HP_COLORS_V2_CONFIG", version: 2, revision: 1, values,
  }));
  const enemyTeam = localTeam === 1 ? 2 : 1;
  let enemyClip;
  for (const team of [1, 2]) {
    const container = bar.add(new MockPanel(team === 1 ? "TeamFriendly" : "TeamEnemy"));
    const player = container.add(new MockPanel("Player" + team, {
      paneltype: "CitadelHudTopBarPlayer", classes: ["UltimateUnlocked"],
    }));
    player.add(new MockPanel("PlayerName", {
      classes: ["PlayerName"], text: team === enemyTeam ? names[1] : names[0],
    }));
    if (heroes) player.add(new MockPanel("HeroName", {
      classes: ["HeroName"], text: team === enemyTeam ? heroes[1] : heroes[0],
    }));
    const clip = player.add(new MockPanel("UltimateStatus")).add(new MockPanel("UltimateStatusBG", {
      style: { clip: "radial(50% 50%, 0deg, " + (team === enemyTeam ? 90 : 30) + "deg)" },
    }));
    if (team === enemyTeam) enemyClip = clip;
  }
  const world = createPanoramaHarness({ now: 1000 });
  world.root.AddClass("CLASS_PLAYER");
  world.root.AddClass("enemy");
  const name = world.root.add(new MockPanel("name", { text: overhead }));
  const background = world.root.add(new MockPanel("unit_info_bg"));
  const ready = background.add(new MockPanel("unit_ult_ready_icon"));
  let wakeCallback;
  let configCallback;
  Object.assign(world.root, {
    HPV2GetNormalizedConfig: () => values,
    HPV2OnConfigChanged(callback) { configCallback = callback; return () => {}; },
    HPV2GetUltimateProgressColor: () => "#FFFFFF",
    HPV2OnWake(callback) { wakeCallback = callback; callback(true); return () => {}; },
  });
  runInVm(source, createVmContext(world));
  const dispatch = hud.$.DispatchEvent;
  const traffic = [];
  hud.$.DispatchEvent = (event, raw) => {
    dispatch(event, raw);
    traffic.push(raw);
    world.now = hud.now;
    world.root.HPV2OnPickupMessage(raw);
  };
  hud.contextPanel = bar;
  const hudContext = createVmContext(hud);
  runInVm(contract, hudContext);
  runInVm(source, hudContext);
  const send = players => world.root.HPV2OnPickupMessage(JSON.stringify({
    magic_word: "HPV2_ULTIMATE_SNAPSHOT", since: 0, at: world.now, players,
  }));
  return { hud, world, name, background, ready, enemyClip, traffic, send,
    wake: active => wakeCallback(active),
    config: next => configCallback({ ...values, ...next }) };
}
function records(harness) {
  return harness.logs.filter(line => line.startsWith("[HPV2ULTDBG] "))
    .map(line => JSON.parse(line.slice("[HPV2ULTDBG] ".length)));
}
function lastWorld(fixture) { return records(fixture.world).filter(row => row.lane === "world").at(-1); }

test("diagnostic logs both-team cooldown, native-ready and unmatched-name decisions without names", () => {
  const evidence = [];
  for (const localTeam of [1, 2]) {
    const f = boot(debugSource, localTeam);
    assert.equal(lastWorld(f).reason, "cooldown");
    assert.equal(lastWorld(f).nativeVisible, true);
    assert.equal(lastWorld(f).nativeReady, false);
    assert.equal(lastWorld(f).overlayVisible, true);
    assert.equal(lastWorld(f).slot, localTeam === 1 ? 1 : 0);
    assert.ok(records(f.hud).some(row => row.lane === "hud" && row.players.length === 2));
    f.background.AddClass("has_ultimate");
    f.world.scheduler.runFor(3000);
    assert.equal(lastWorld(f).reason, "native_ready");
    assert.equal(lastWorld(f).overlayVisible, false);
    f.background.RemoveClass("has_ultimate");
    f.name.text = "PRIVATE MISSING";
    f.send([["PRIVATE ENEMY", 100, 6, ""]]);
    assert.equal(lastWorld(f).reason, "no_match");
    assert.equal(lastWorld(f).slot, -1);
    assert.equal(lastWorld(f).overlayVisible, false);
    assert.doesNotMatch(f.hud.logs.concat(f.world.logs).join("\n"), /PRIVATE|magic_word|HPV2_ULTIMATE_SNAPSHOT/);
    evidence.push({ localTeam, records: records(f.world) });
  }
  fs.mkdirSync(path.join(repoRoot, ".tmp"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, ".tmp/hpv2-ultimate-debug-e2e.json"),
    JSON.stringify({ sourceRoot, runs: evidence }, null, 2) + "\n");
});

test("invalid snapshots are logged as rejected without changing the visible cooldown", () => {
  const f = boot();
  const overlay = f.background.FindChildTraverse("HPV2UltimateOverlay");
  f.world.root.HPV2OnPickupMessage(JSON.stringify({
    magic_word: "HPV2_ULTIMATE_SNAPSHOT", since: 99, at: f.world.now,
    players: [["PRIVATE ENEMY", 180, 6, ""]],
  }));
  assert.equal(lastWorld(f).reason, "rejected_snapshot");
  assert.equal(overlay.style.visibility, "visible");
  assert.equal(overlay.FindChildTraverse("HPV2UltimateFill").style.clip, "radial(50% 50%, 0deg, 90deg)");
});

test("oversized otherwise-valid snapshots log the actual raw rejection", () => {
  const f = boot();
  const raw = JSON.stringify({ magic_word: "HPV2_ULTIMATE_SNAPSHOT",
    since: 0, at: f.world.now, players: [["PRIVATE ENEMY", 360, 0, ""]] }) + " ".repeat(5000);
  f.world.root.HPV2OnPickupMessage(raw);
  assert.equal(lastWorld(f).reason, "rejected_snapshot");
  assert.equal(lastWorld(f).rawRejected, true);
  assert.equal(f.background.FindChildTraverse("HPV2UltimateOverlay").style.visibility, "visible");
});

test("HUD and world slots retain wire order even for integer-like player names", () => {
  const f = boot(debugSource, 1, ["ZED", "7"]);
  const snapshot = f.traffic.map(raw => JSON.parse(raw))
    .find(message => message.magic_word === "HPV2_ULTIMATE_SNAPSHOT");
  const hudRecord = records(f.hud).filter(row => row.lane === "hud").at(-1);
  assert.deepEqual(hudRecord.players, snapshot.players.map((entry, slot) => ({
    slot, angle: entry[1], rate: entry[2], alias: !!entry[3],
  })));
  assert.equal(lastWorld(f).slot, 1);
  assert.equal(hudRecord.players[lastWorld(f).slot].angle, lastWorld(f).angle);
});

// Live 2026-10-09: overhead hero names never matched persona-named top bar rows.
test("hero-named overhead bars match through the alias and log via without names", () => {
  const f = boot(debugSource, 1, ["PRIVATE ALLY", "PRIVATE ENEMY"], ["PRIVATE APOLLO", "PRIVATE RAT KING"],
    "Private Rat King");
  assert.equal(lastWorld(f).reason, "cooldown");
  assert.equal(lastWorld(f).via, "hero");
  assert.equal(lastWorld(f).slot, 1);
  assert.deepEqual(records(f.hud).filter(row => row.lane === "hud").at(-1).players.map(row => row.alias), [true, true]);
  assert.doesNotMatch(f.hud.logs.concat(f.world.logs).join("\n"), /PRIVATE|magic_word|HPV2_ULTIMATE_SNAPSHOT/);
});

// The wake hook closes the traffic gate for hidden/disabled heroes too.
test("sleeping and disabled heroes are not misidentified as nonhero contexts", () => {
  const hidden = boot();
  hidden.wake(false);
  hidden.send([["PRIVATE ENEMY", 90, 0, ""]]);
  assert.equal(lastWorld(hidden).reason, "sleeping");
  assert.equal(lastWorld(hidden).hero, true);
  assert.equal(lastWorld(hidden).player, false);
  assert.equal(lastWorld(hidden).overlayVisible, false);
  const disabled = boot();
  disabled.config({ enabled: false });
  disabled.wake(false);
  disabled.send([["PRIVATE ENEMY", 90, 0, ""]]);
  assert.equal(lastWorld(disabled).reason, "off");
  assert.equal(lastWorld(disabled).hero, true);
});

test("logging is bounded and a broken console cannot break rendering", () => {
  const f = boot();
  const before = f.world.logs.length;
  for (let i = 0; i < 1000; i++) f.send([["PRIVATE ENEMY", 90, 0, ""]]);
  assert.ok(f.world.logs.length <= before + 1, "unchanged decisions do not flood");
  for (let i = 0; i < 1000; i++) {
    f.world.root.SetHasClass("has_ultimate", i % 2 === 0);
    f.send([["PRIVATE ENEMY", 90, 0, ""]]);
  }
  assert.ok(records(f.world).length <= 241, "per-context cap includes one limit record");
  assert.equal(records(f.world).at(-1).reason, "log_limit");
  const broken = boot();
  broken.world.$.Msg = () => { throw new Error("console unavailable"); };
  broken.world.root.AddClass("has_ultimate");
  assert.doesNotThrow(() => broken.send([["PRIVATE ENEMY", 90, 0, ""]]));
  assert.equal(broken.background.FindChildTraverse("HPV2UltimateOverlay").style.visibility, "collapse");
});

test("diagnostics preserve actual timer output, protocol traffic and schedule work", () => {
  const plain = boot(canonical);
  const debug = boot();
  for (const f of [plain, debug]) {
    f.enemyClip.style.clip = "radial(50% 50%, 0deg, 96deg)";
    f.hud.scheduler.runFor(1000);
    f.world.scheduler.runFor(1000);
  }
  const styles = f => JSON.parse(JSON.stringify(f.background.FindChildTraverse("HPV2UltimateOverlay").FindChildTraverse("HPV2UltimateFill").style));
  assert.deepEqual(styles(debug), styles(plain));
  assert.deepEqual(debug.traffic, plain.traffic);
  const jobs = harness => harness.scheduler.jobs.map(({ due, delay, order }) => ({ due, delay, order }));
  assert.deepEqual(jobs(debug.hud), jobs(plain.hud));
  assert.deepEqual(jobs(debug.world), jobs(plain.world));
  assert.deepEqual(plain.hud.logs.concat(plain.world.logs), []);
  assert.throws(() => instrumentTimer("not a timer"));
  assert.throws(() => instrumentTimer(instrumentTimer(canonical)));
});
