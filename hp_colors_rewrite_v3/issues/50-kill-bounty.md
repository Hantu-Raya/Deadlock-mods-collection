# 50: Kill bounty on enemy bars

**What to build:** Show above-head how many souls an enemy is worth if killed now, so high-value targets stand out at a glance.

**Request (Discord, yesdaddy, 2026-10-30):** "showing kill bounty per player, IE: how many souls you would get if you killed them … you could probably reconstruct the approximate value just based on the scaling and elapsed time … You might not be able to visualize the player proximity split but it would be cool to know who's a high value target at a glance."

**Status:** implemented and VM-verified; release builds normal `fbe29911`, QOLLOCK `6da02c83`, ShowRank `cae861c5` (game 6839, `-AllowPinMismatch`). ShowRank `cae861c5` is installed as pak02 (previous `8fc3dfff` in `addons_disabled`). Not checked in game.

## Engine evidence

The client exposes no per-player bounty: the only bounty dialog variable is `neutral_bounty` (neutral camps), and `m_iComebackBounty` is a VData field of Golden Idol / KOTH, not a player netvar. The value is reconstructed from the server rules.

Static RE of `server.dll` 6839 (SHA-256 `e7db4fca…`, notes and decompiles in `.scratch/bounty_re/EVIDENCE.md`) confirms `feeder_feed/design.md` (6753, live-checked against server logs) unchanged:

- Base `B = (int) remap(gameSeconds, 0..2400 → 200..2200)` (float32). The victim's net worth is only logged, not used.
- Solo kill: `S = ceil(B × 1.25)` (`m_flHeroKillGoldShareFrac[0]`, same in 6839 `generic_data.vdata`).
- Comeback: team multiplier `2.268 × (victimTeam / killerTeam − 1) + 1` when the victim's team leads by more than 1,500; difficulty `2.484 × (victim / avg − 1) + 1` when the victim is worth more than the killer team's average (above 1,250). Product capped at 5 (7 from minute 8), plus 0.15 when above 1, uncapped and not the winning-team difficulty case. Extra `N = (int)(((int)(S × mult) − S) × 0.4)`.
- New since 6753: 70 % of comeback shares (`citadel_comeback_redirect_fraction`) are redirected to the same team's two lowest net-worth players. The team still receives all of `N`.

## Decisions

- **Shown value:** souls a solo kill pays the killing team, `S + N`, rounded to the nearest 10. This is the number before the proximity split the request accepts as unknowable. Assisted kills pay less in total (×1.15 for two, falling to ×0.5 for six) and the killer's personal share depends on assisters and the redirect, so neither is shown. The killer's first-kill bonus (125) is killer-specific and left out.
- **Inputs:** the topbar only: `GameTime` and each card's `SoulsValue` (`{s:gold}`, net worth) and team panel. A missing, unparsable or incomplete team fails closed (no labels). Full, comma-grouped and `k`/`m` values parse; rounded `k` values make the comeback part an estimate.
- **Scope:** enemy hero bars on `isDefaultMap` matches and in hero testing (with or without `isDefaultMap`; the server payout has no hero-testing branch), excluding tutorial, hideout and Street Brawl (a mode-hash payout).
- **Default off** (live placement unseen); a NEW tab item points to it.
- **Placement:** a stock-look soul pill (the neutral camp bounty's `icon_soul` and `numericOracle`) centred under the bar, inside the world canvas, following bar offsets and scale; X/Y offsets clamp it inside the canvas.

## Data flow and performance

- HUD (`hp_colors_v3_timers_hud.js`): a 2 s `bountyTick` reads the clock and up to 12 card labels (cached references), computes every card's value against the other team and broadcasts `HPV3_BOUNTY_SNAPSHOT {since, at, players: [[player, souls, hero?]]}` only when a value changes, with a 5 s heartbeat.
- World (`hp_colors_v3_timers_world.js`): matches its bar by player/hero name exactly like ultimate progress and passes `bounty` to `renderer.setTimerFacts`. Values expire after 12 s.
- Renderer: `bounty` is a timer fact like `ultimateAngle`; a change re-plans from the cached facts (no extra fill/geometry reads) and writes one label text and at most one transform. The steady-state 0.15 s tick adds no panel calls.

## Acceptance

- [x] Formula reproduces the server's own comeback capture from feeder_feed (S 312 → extra 499) and solo values.
- [x] HUD→world E2E in the VM: label on the enemy bar, none on allies or the local hero, fail-closed inputs, expiry, off releases.
- [x] Counted per-bar ceilings unchanged with the bounty on.
- [x] Preview shows a sample; schema slots appended with a record-version bump; all three variants regenerated.
- [ ] In game: placement, value against the kill feed, no console errors.

## Verification (2026-11-02)

- `tests/kill-bounty.test.js` 10/10, renderer ceiling scenarios `…BountyIdle` 195.2 ≤ 200 and `…BountyActive` 220.2 ≤ 300 counted ops/bar/s (+0.9 over the same scenarios without the bounty: 5 snapshot parses, 2 name reads, 2 label writes in 10 s), codec v19 round-trip.
- Staged release suite on the compiled scripts: 1378 passed, 2 skipped, 0 failed; QOLLOCK + ShowRank + v2 storage 93/93; generator checks current.
- Packed ShowRank VPK decoded: overlay carries `HPColorsV3BountyAnchor`, both timer scripts carry `HPV3_BOUNTY_SNAPSHOT`.

## Known limits

- 6753 showed topbar souls as `{g:citadel_thousands:gold}` (whole thousands above 10k, about ±500); 6839 binds `{s:gold}`, whose live format is unchecked. Rounded souls make the comeback part an estimate; the base and solo scaling are exact up to the 10 s step and the rounding to 10.
- A QOLLOCK topbar that drops `#SoulsValue` (its own pak03 player card) shows no bounty rather than a wrong one; not checked.
- The first-kill bonus (125, killer's first kill) and mode-hash bounty variants are not shown.
- In game: placement under the bar, readability, the value against the kill feed and a console check for `Parsing error`, `FATAL` and `Uncaught` remain open.

## Live round 1 (2026-11-02, game 6839, ShowRank `cae861c5`)

- User screenshot in hero testing (Testing Tools, 1v1 against an Infernus bot, our card 1.3k, the bot 49k, clock 2:25): no pill ("it does not show the bounty").
- Cause: the topbar gate copied the pickup gate, which skips `connectedToHeroTesting`, so every snapshot was empty. Pickups have no business there; the bounty does, since the server pays hero kills in hero testing by the same rules. Fix: hero testing passes the bounty gate whatever its map class; tutorial, hideout and Street Brawl stay off (pickup gate unchanged).
- Regression tests: the gate test now covers tutorial, hideout and hero testing on and off `isDefaultMap`; a 1v1 test replays the screenshot (expected 1,030: base 316, solo 395, comeback capped at x5 adds 632). It failed before the fix at the hero-testing assertion.
- Builds: release normal `0ef6a7bd`, QOLLOCK `8e9ee028`, ShowRank `4917edde`; staged suite 1379 passed, 2 skipped, 0 failed. ShowRank `4917edde` installed as pak02 (packed `hp_colors_v3_timers_hud` carries the new gate); `cae861c5` kept in `addons_disabled`. Not yet checked in game.

## Live round 2 (2026-11-02, game 6839, ShowRank `4917edde`, hero testing)

- User screenshots 07:10:08 and 07:10:29: the pill showed 2,690 and 2,760 while the kill popups paid 1,483 (Billy) and 1,396 (Infernus); the pill sat high above the name and "the indicators" did not move; the pickup indicators have a problem of their own (user, no detail yet).
- The game's `console.log` (`-condebug`) carries the server's own lines for all three kills: `GameTime: 8.6, Base Bounty: 632, Total Bounty: 757` / `Bounty Base: 790, Total Comeback: 1896, Killer Portion: 568, ... TotalVictimTeamNW: 50400, TotalKillerTeamNW: 1515` / `Comeback paid hero_punkgoat 568`; then 649/812/1948/584 and 659/824/1977/593. The popup is **base share + first-kill bonus (125, the killer's first kill) + killer portion** (`int(0.3 x comeback)`); the other 0.7 goes only to assisters and teammates (none here, so unpaid). `sub_1809E7A90`/`sub_180C3F770`: the killer portion is cut by `int(0.7 x portion)` (to tick gold) when the killer's net worth exceeds the victim team's average.
- Cause: round 1 showed base share + the whole comeback (a team total). Fix: the pill now shows what you get: base share + 125 while your team has no kills + killer portion - redirect. Team totals use the card sum clamped into the stock `TeamScoreFriendly`/`TeamScoreEnemy` `{s:team_networth}` rounding ("50k" = server 50400; the local card read 2.1k at server NW 1515). Exact clock seconds replace the 10 s steps. Help and NEW text say "the number on the kill popup".
- Regression test: `replays the three live hero-testing kills` gives 1,483 / 1,396 / 1,417 from the screenshot inputs.
- Position: VM layouts place the pill under the bar, the game drew it at the top of the canvas. Not fixed blind; the debug build logs `[HPV3] bounty geo` (geometry, transforms, window positions) and `[HPV3] pickup geo` for one hero-testing look.
- Probe build: ShowRank debug `4bba96a0` (fixed math + `[HPV3] bounty geo` / `[HPV3] pickup geo` lines, 25 s after a pill or pickup first shows, at most 3 + 4 lines per bar; staged debug suite 1381 passed, 1 skipped). Installed as pak02; `4917edde` kept in `addons_disabled/pak02_dir.vpk.showrank-v360r1-6839-4917edde`. Not a release build.

## Live round 3 (2026-11-02 11:33-11:41, game 6839, debug `4bba96a0`, hero testing)

- Server log, Gigawatt vs a 49k Rat King bot: kills at labels 3:40 / 3:55 / 4:11 paid 480+125+230 = 835, 495+237 = 732 and 513+246 = 759 (screenshot popup 759; the pill read 754 a second before).
- Three errors found: (1) the topbar sampled every 2 s, so the pill trailed by up to 2 s (about 3 souls); (2) the clock label trails server time by about 1 s (all three kills paid the base of label + 1 s); (3) the stock `FriendlyKills` label stayed 0 for 22 s after the first kill, so the second kill showed the +125 first-kill bonus again (856 for a 732 kill).
- Fix: sample every second, compute at label + 1 s, and end the first-kill bonus when the team kills label is above 0 **or** an enemy card has been seen `Dead` this match (reset when the clock runs backwards). Limit: an enemy killed by a teammate or by troopers also ends it, although the server's counter is the killer's own kills (125 low in that case).
- Regression test `replays the second live session` gives 835 / 732 / 759; without the Dead check it gives 857 for the second kill.
- Pill position: `[HPV3] bounty geo` showed the pill at the canvas top with the anchor transform at 0, with plain geometry (bar centre y 74 of 210). The plan clamps at the canvas top; offsets at the user's saved Kill bounty values (marked changed in the menu) can reach that clamp. A panel above the canvas top is never drawn, so it cannot go higher. Not changed.

## Status effects row (same round, user screenshots 11:40:21/56)

- User: "the status effect still does not change pos and when he picks up the buff that will be gone". Pickup offsets moved each pickup icon inside the native `#StatusEffects` row (32 px tall at the canvas top), so a pickup moved down (21 px in the screenshot) left its row and was clipped, and ordinary effects (bleed) never moved.
- Fix: the renderer moves the whole native `#StatusEffects` row instead: bar offset relative to its -3.8 default plus the pickup offsets (when pickup styling is on), x kept inside the canvas, y never above the native top. The icons keep their place in the row. Menu help updated. Tests: renderer pickup test (row `translate3d(100px, 21px, 0px)`, released with pickups off), preview pickup test (row moves, icons untouched).
- Round 3 build: ShowRank debug `9dd5f687` (suite 1384 passed, 1 skipped) installed as pak02, replacing probe build `4bba96a0`; release `4917edde` stays in `addons_disabled/`.

## Preview accuracy (2026-11-02, user screenshots 12:00:58/12:01:03)

- User: "all working but the preview is not accurate enough", then "the pos and size on the status effects, the size on the stamina".
- Normalized side-by-side (`.scratch/bounty_re/side_by_side.png`, bar-matched): name, badges, bar, HP text and pill line up within about 1-2 css px. The status row differed because the preview showed only 22 px pickup samples, while the game drew ordinary debuffs at the stock 30 px (red ring, stack count).
- Fix: the preview row is now the game's box (32 px tall at the canvas top, icons bottom-aligned) and starts with one stock-size debuff sample (toxic, red ring, stack 3); pickups keep their own size setting. Preview test covers it.
- Stamina size: the preview and world plans write the same inline size (VM: 10.33x15.32 px for width 14.2, height 5.72), and no screenshot shows the game's arrows (they show only after a dash). Debug build `958ff69d` logs `[HPV3] size geo world` (after a dash, 25 s after the bar first appears) and `[HPV3] size geo preview` for comparison. Installed as pak02.
- Live probe (12:25, debug `958ff69d`): world Venator primary 79x18 css, stamina arrows 10.5x15.5 css at y 77, debuffs 30x30, a pickup 22x22; preview (ui scale 1.183) primary 79x18, stamina 11x16, debuff 30, pickups 22. Sizes match in css; the stamina arrows already had the same size.
- User (12:25 screenshot): "for the pickups it should be the same size as the status effects so don't make it different". The renderer no longer sizes pickup icons on health bars (they keep the stock 30 px status-effect size; spacing and colors still apply); `pickupSize` now sizes only the top-bar pickup icons and is renamed "Top bar pickup icon size". Preview pickups are 30 px with the stock 60% glyph. Temporary geo/size probes removed.
- Release builds (suites passed): ShowRank `4070d76a` (installed as pak02, replacing debug `958ff69d`; previous release `4917edde` in `addons_disabled/`), canonical `8d70d6b2`, QOLLOCK `00920dc0`. Not yet seen in game with the 30 px pickups.

## Feedback round (yesdaddy, Discord 2026-11-02 18:16-18:39, on the 3.6.0 RC)

- "The deferred damage stuff and kill bounty seems good." Asks: (1) the spacing moves pickups but not other status effects; (2) status effects seem capped at 4; (3) separate pickup settings from status effects and the top bar, or drop the top-bar icons; (4) shift the whole canvas up / make its position an offset; (5) scale and rotation for the kill bounty; (6) the UNITS preview shows a stylized bar and a plain HP number.
- User decisions: the status effects on the health bar stay one row as the game lays them out (no pickup-only spacing); keep the top-bar pickups; add kill bounty size and tilt; explain the canvas limit.
- (1) *Pickup spacing* no longer applies on health bars; it is *Top bar pickup spacing* (slot 140 kept). Renderer test red first (margin `0px 16px` → stock `1px 2px`); five tests that used the old margin as the "pickups styled" signal now read the border wash.
- (5) *Kill bounty size* (slot 214, px of the number, default 17, 9-34) scales the pill by `ui-scale` (laid out again, not a raster scale) from its top centre, and the canvas clamps grow with it; *Kill bounty tilt* (slot 215, default 0) rotates it. Record v21. Tests: kill-bounty "size and tilt…" and the preview pill (red first), codec "record v21…".
- (6) The preview drew the stock `.healthbar_border` frame, which the 6839 world bar does not have ([ENGINE](../ENGINE.md#unit-status-row-and-sizes-live-6839-2026-11-02)); removed, and the preview HP number takes the stock enemy/neutral tints. Test: preview "unit preview matches the stock world bar…" (red first).
- (4) Not possible from a pak: the canvas size convars are development-only. (2) The cap is the game's: `CCitadelStatusEffect` shows at most 4 modifier panels (stuns and other state panels not counted), set by its `max_modifiers` layout attribute ([ENGINE](../ENGINE.md#unit-status-row-and-sizes-live-6839-2026-11-02), static RE, not live-verified). HP Colors does not limit the row. Left as the game sets it (user decision).
