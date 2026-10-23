# Objective timers: how the game schedules them (2026-10-22)

Evidence for the round 5b objective cues (`designs/shared/v2.js` `CUE`, `objectiveCues`). Static
analysis of the installed binaries plus the shipped VData and ConVar defaults, then a live test on a
demo (last section).

Binaries (ClientVersion 6813): `server.dll` sha256 `5bb81f638097cdcde8b1c870b80f3faf66faa933fbd3b84d665dc063dc5c8055`,
`client.dll` sha256 `cd46c5485a5aa081a2c0aa1b156ef1b961e17637f393816aac0d71af8110b1b5`. Disassembly
came from `.scratch/oh_obj_re/xref.py` (pefile + capstone, rip-relative xrefs, `.pdata` function
bounds); RVAs below are for these hashes only.

## Rift (koth)

ConVar defaults registered in `server.dll` (each registration loads the default float right before
the name): `citadel_koth_spawn_initial_delay` 720, `citadel_koth_respawn_interval` 420,
`citadel_koth_spawn_window` 60, `citadel_koth_early_warning_time` 60, `citadel_koth_warning_time` 20.

The scheduler (game rules think, rva `0xa24ec0`) keeps two times, `+0x320` (next spawn, schema
name `m_timeNextKothSpawn`) and `+0x324` (`m_timeNextKothSpawnWindowTime`, the window centre):

- First run: centre = 720; next = centre + `RandomFloat(-60, 60)` (tier0 import).
- While a rift or its spawner exists, it returns early (no new schedule).
- When `next - 60 <= match time`, it starts the early warning (rva `0xa250f0`), then
  centre += 420 and next = centre + `RandomFloat(-60, 60)`.

So rifts open at 12:00, 19:00, 26:00, ... each uniformly within ±1:00, and a rift that runs past
the next slot pushes that warning back. The jitter does not grow per cycle, and none of these
server times are networked (no `m_timeNextKothSpawn` NetworkVar in either DLL), so the client
cannot know a rift time before its warning starts.

The early warning starts 60 s before the rift (server side: particle, location). In `client.dll` the
minimap builds the spawner with `MinimapKothSnippet` and the class `koth_warning` (rva `0x1e4c620`,
the `0x2d` unit-type branch); `citadel_koth_warning_time` 20 is used in rva `0xa85050`. Live, a
spectator's minimap only shows the marker from 20 s before the rift (see below), not 60 s.

Cue: hidden until the marker appears, then an exact 20 s countdown, `LIVE` while the rift is open.
No estimate before the warning.

## Bridge buff (powerup spawners)

`scripts/misc.vdata` `citadel_item_powerup_spawner`: `m_flInitialSpawnTime` 300,
`m_flSpawnInterval` 300, and no `m_bRespawnTimerStartsAfterPickup` (other spawners set it), so
5:00, 10:00, 15:00, ... from the match clock. Override convars default to -1. Cue: last 30 s.

## Mid-boss and rejuvenator

`neutral_camp_midboss`: first spawn at 0, respawn 420 s after a kill, 60 s shorter each time, never
below 300. The client already has the exact time: `m_tNextMidBossSpawnTime` is a NetworkVar and the
stock top bar sets `{s:midboss_timer}` and `midboss_cooldown` / `midboss_available` /
`midboss_spawned` from it. `m_RejuvParams.m_flRejuvinatorBuffDuration` is 180 s. Team counts are
the `m_iAmberRejuvCount` / `m_iSapphireRejuvCount` NetworkVars (stock classes `RejuvCount_1..4`).
Cue: last 60 s of the respawn; a held rejuvenator shows its 3:00 buff in the holder's colour.

## Urn

No spawn-time convar exists (`citadel_idol_*` cover decay only: 45 s until decay, 45 s decay). The
schedule is the June 30, 2026 rework, still current on the wiki update history
(https://deadlock.wiki/Soul_Urn/Update_history): spawns at 10:00, 15:00, 20:00, ... regardless of
delivery. `m_IdolParams.m_flIdolDropDuration` 12.5 s is the fall from the sky. The urn spawn code was
not traced in the binary. Cue: last 60 s, `UP` for 10 s after the spawn.

## Live test (2026-10-22, ClientVersion 6813)

Demo 121685912, spectator HUD, a temporary probe in pak10 logging class counts and label texts every
0.5 s (removed afterwards; pak10 reinstalled as the release build, sha256 `ceb5435b2cef0039...`).
Log: `.scratch/oh_obj_re/live_console_20261022.log` (lines `[OH-OBJ]`). Played 8:29 to 23:57 at 2x/4x.

| What | Observed | Data for the runtime |
|---|---|---|
| Rift 1 | marker 12:38, rift open 12:57-12:58, captured 13:17 | minimap `.map_button.capture_point.koth_warning` (+ `KothSpawn` ping) appears 20 s before; `#KothCashInMeter` becomes visible when it opens; feed `KothCompleted` |
| Rift 2 | marker 18:41, open 19:01, captured 19:19 | same; both within 12:00 / 19:00 ±1:00 |
| Bridge buff | 10:00, 15:01, 20:00 two markers; gone when taken (10:06, 10:37, ...) | minimap `.map_button.powerup_spawn` count = buffs waiting |
| Urn | picked up 10:16, 15:15, 20:16; delivered 10:42, 15:40-15:52, 20:36-20:53 | feed `IdolPickedUp`, `IdolReturned`; no minimap class matched the guesses |
| Mid-boss | killed 19:54: `#RejuvenatorTimer.midboss_cooldown`, `{s:midboss_timer}` "7:00" counting down; alive before: no class, empty label | label text is the exact respawn countdown |
| Rejuvenator | taken 20:00: `#RejuvenatorTimer.has_rejuv`, `#RejuvenatorEnemy.RejuvCount_1` then `_3`, `HasRejuvenator` on 6 cards; all cleared 23:00 (3:00) | holder = the team whose cards carry `HasRejuvenator`; time left = 3:00 from when `has_rejuv` appeared |

Not seen: the mid-boss respawning (`midboss_available`), and the spectator mapping of
`RejuvenatorFriendly`/`RejuvenatorEnemy` to Amber/Sapphire (the cards answer it either way).

## Built pak live check (2026-10-22, pak10 sha256 `de8719dd...`)

Same demo, Base Game+ Names look, crops in `observer_hud/shots/live/v21-cues-*.png`: rift chip `0:17`
at 12:41 (it froze with the game clock during an in-match pause), `LIVE` at 13:11 above the stock
capture meter; urn `0:32` at 19:28; at 20:20 bridge buff `UP` (one buff still on the map) left of the
held rejuvenator `2:40` in Sapphire's colour, which sits in the middle under the clock.

## Symmetric layout live check (2026-10-22, pak10 sha256 `19eece6a...`)

After the user asked for a symmetric row (and the design debate with m1), the chips are 46 px
(icon over time) and centred as a group, with the mid-boss chip in the middle. Live at 20:23
(`observer_hud/shots/live/v21-cues-symmetric-below-stock-charges-2023.png`): the stock rejuvenator
charges (Sapphire's three icons, the mid-boss timer) show under the clock and the two chips (held
rejuvenator, bridge buff `UP`) sit below them, split evenly at the clock's centre line. That run
showed 2:48 for a buff picked up at 20:00 because the demo was seeked into it; since then a pickup
first seen after a jump shows `HELD` (VM check), installed as `12b550eb...`.

## Stock circle removed, text centred (2026-10-22, pak10 sha256 `8d546bd4...`)

User: remove the stock rejuvenator progress circle and centre the chip text under its icon. The
stock `#RejuvenatorTimer` is collapsed while spectating (its classes still feed the mid-boss chip;
team counts stay), and `.OHCueTime` spans the chip with centred text. Live at 20:19
(`observer_hud/shots/live/v21-cues-no-stock-circle-centred-text-2019.png`): no circle, Sapphire's
three rejuvenator icons under the soul plate, "2:42" and "UP" centred under their icons.
