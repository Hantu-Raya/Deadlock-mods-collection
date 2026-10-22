# 39: Street Brawl: no ultimate progress on world bars

**Report (yesdaddy, QOLLOCK, 2026-10-19):** "Nope, still busted… the same 'just doesn't work in street brawl' issue as before". Screenshot (map `start`, round 2): the enemy world bar is titled **Drifter**, and its ultimate badge has no v3 progress. The console.log shows no script errors. Kept in `.scratch/qollock_sb/`.

**Status:** fixed for QOLLOCK only (opt-in); VM E2E verified; QOLLOCK built. Not live-verified.

## Cause

v3 matched a world bar to its topbar card by name: the bar's `#name` (`{s:name}`) against the card's `PlayerName` (`{s:player_name}`). The world bar title is set by `citadel_unit_status_hero_name_mode` (client.dll: "Name shown above hero health bars. 0: player name, 1: hero name, 2: none"). The report shows a hero-titled bar, so no card matched. That blocked the world ultimate progress, and also topbar pickups, which use the same name match in the other direction.

## Fix (QOLLOCK only, through an opt-in seam)

- **Opt-in:** `hp_colors_rewrite_v3_qollock/tools/qollock.js` adds the class `HPColorsV3TimersHeroNames` to the composed topbar root. The normal and ShowRank topbars don't have it.
- `hp_colors_v3_timers_hud.js` reads that class once at boot.
  - **With it (QOLLOCK):** each card also answers to its stock `HeroName` label (`{s:hero_name}`). QOLLOCK's `HeroNameHidden` is a different class and is not read. A name counts only if no other card (local included) shows it as a player or hero name. `HPV3_ULTIMATE_SNAPSHOT` entries become `[player, angle, rate, hero]`, where either name is `""` when it is not unique, never both. `HPV3_PICKUP_SCAN_GATE` adds `localHero`. Topbar pickups match a world record by either name, and two different records for one card are refused.
  - **Without it:** no hero label is read. The wire is the old 3-element entries with no `localHero`.
- `hp_colors_v3_timers_world.js`: uses hero data only when the topbar sends it. It matches an entry by player or hero name, and excludes the local player by both names. A name repeated across entries rejects the snapshot. Without hero data, its behavior is unchanged.
- Mode 2 ("none") leaves no name on the world bar, so neither feature can identify it. That is unchanged.

## Evidence

- **Red first:** the canonical hero-titled test failed before the change.
- **Canonical tests:** `tests/timers.test.js` has two ticket-39 tests.
  - Without the class, the wire keeps 3-element entries with no `localHero`, and there is no progress on a hero-titled bar. This is the old behavior.
  - With the class, there is progress, the topbar pickup ring appears and the local hero is excluded.
- **QOLLOCK lane:** `hp_colors_rewrite_v3_qollock/tests/timers.test.js` runs the Street Brawl case on the composed topbar, with `HeroNameHidden` carrying other text, and asserts the opt-in class. The `qollock.test.js` composition and post-pack guards now require the class; dropping it fails the packed-layout check.
- **Normal/ShowRank unchanged (differential VM E2E):** `.scratch/qollock_sb/diff/scenarios.js` ran six scenarios twice: once with the pre-change timer scripts (from the earlier release staging) and once with current source, both on the non-opt-in topbar. The scenarios were a player-titled bar, a player-titled bar with hero labels, a hero-titled bar, a local-titled bar, the Street Brawl clock, and a hero name equal to another player's name. Traffic and panel states are **byte-identical** (`old.json` = `new.json`). Control: the opt-in scenario differs between the two trees (old: no overlay; new: progress shown), which proves the override root was the one under test. ShowRank's composed topbar root is `class="HPColorsV3TimersTopBar"` only.
- Untested: whether `{s:hero_name}` on the card equals the hero-mode world title in every language. Both come from the hero name, so this is inferred, not observed.
- **QOLLOCK builds** (`-SkipDeploy`): release `c03343f2`, debug `712339fa` (md5 of `pak02_dir.vpk`). Suite 1345/1345 (release) and 1346/1346 (debug); QOLLOCK lane 34/34; ShowRank lane 10/10. Generator and QOLLOCK `--check` are current. Not installed: the local addons folder has no pak03, and QOLLOCK pak02 needs QOLLOCK's pak03 next to it.
- **Normal/ShowRank:** not rebuilt. Their next build carries the timer scripts with the inert opt-in path, which the differential shows to behave identically.
- **Released:** in 3.2.1 (QOLLOCK release `3efca169`, GameBanana `#FileInfo_1858042`). Still not checked in game; the next Street Brawl match on QOLLOCK confirms it.
