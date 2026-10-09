# Feeder Feed

## Scope

`feeder_feed/` is the pak08 Feeder Feed: a FEEDER FEED tab in the stock damage report. It ranks who fed souls to the other team (TOP DONORS) and who cashed in (GRATEFUL RECIPIENTS), for both teams. Top-bar `TeamFriendly` is fixed to Amber, not necessarily our team; relative feed entries wait for a known local team before their heroes are resolved. It overrides only `hud_damage_report.xml`. pak08 is used by no other wrapper. Read `FEATURES.md` for feature behavior and manual smoke scenarios, and `design.md` for the server formulas, client evidence and display contract; use source and the build wrapper for current implementation details.

Everything is derived from what the HUD already shows: kill-feed entries, the top bar and the game clock. There is no network API, persistence, settings, or cross-context transport. State lives for one match and resets when `GameStateInProgress` rises.

## Source ownership

```text
hud_damage_report.xml (stock damage report + FeederTabs + FeederFeedSection + FeederRow snippet)
  -> feeder_feed.js
  -> feeder_feed.css
```

- `feeder_feed.js` owns feed polling, entry snapshots, hero resolution, assister attribution, the bounty/comeback split, tallies and rendering, inside one strict IIFE. `context.FeederFeedStop` stops the previous instance on layout reload.
- `hud_damage_report.xml` keeps every stock damage-report ID, class and global handler (`CitadelHudDamageReport_*`). Feeder panels are additive; the `FeederRow` snippet is the row contract for `rowPanel`/`setRow`.
- `feeder_feed.css` owns the tab switch (pure CSS on the `FeederFeedActive` context class) and the row look, which mirrors the stock damage rows.

## Runtime rules

- Poll `HudDataFeed#DataFeed > #EventFeed` every 0.1 s. Tag each entry with the `ff_entry` attribute and snapshot it once on first sight; C++ fills entries before the next poll. Freeze top-bar souls, kill counts and the clock label at first sight, and only for hero deaths: never re-read them at the delayed count time.
- Resolve killer/victim by player name against top-bar `PlayerName` labels on the entry's side: the feed's `killer_name`/`victim_name` and the top bar's `player_name` come from the same client function (6759 rva 8687a0: player name, Steam friend nickname, or hero name when names are hidden), so they match. Portraits carry no readable hero id: `CitadelHeroImage` exposes only `SetHeroID` to JavaScript (6759 rva 1cfab80); only `CitadelHeroBadge` (top bar) has a `heroid` getter. Top-bar team panels are fixed by game team (stock XML `TeamFriendly team="2"` Amber, `TeamEnemy team="3"` Sapphire), so a local player on Sapphire (`localPlayerTeam2`) finds the enemy in `TeamFriendly`; `panelSide` maps panels to friendly/enemy from the local team, and a local-team change drops the cached roster. Mapping `TeamFriendly` to "friendly" regardless of team made every hero an NPC in a Sapphire match (live 2026-10-07: all 187 feed assisters sat on the opposite top-bar side; the 2026-10-06 all-NPC match likely had the same cause). Find rows in `CitadelHudTopBarPlayer` under `CitadelHudTopBarTeam#TeamFriendly`/`#TeamEnemy` by class/paneltype, not container ID: the shop reuses `TeamsContainer` and `HeroName`. A miss right after a fresh scan is an NPC; a throttled miss stays unresolved and retries.
- Kinds (user decision 2026-10-06: both teams feed): `death` = a hero on either top-bar side died (not an object victim); `bag` = a hero of either side picked up the other side's stolen soul bag; anything with an unknown side is `other` and is not tallied. Comeback math swaps victim/killer teams per kill. A bag goes to the newest unclaimed death on the bag owner's side within 90 s (`BAG_WINDOW_MS`, a known heuristic). Unknown heroes and `Assisters (split)` get one row per team.
- Assisters come from the entry's own portraits (`PlayerAssist<heroId>` panel ids; the id is the only readable hero id). The top-bar assist-counter delta is only a fallback and is unreliable while spectating (it updates in bursts). When portraits attribute a death, advance the counter bases so later fallback deltas stay correct.
- Spectating: feed containers carry absolute `team_1`/`team_2` classes instead of `friendly`/`enemy`. With no local-team class, Amber (`TeamFriendly`) is the home side; sides then come from the hero's top-bar side, the enemy color comes from those entries, and a home-team flip (top-bar enemy seen with the other team class) resets the tallies. NPC sides stay unknown.
- Bounty and comeback math follows `design.md` exactly. A split is `exact` only when the feed total is reproduced with no comeback, or with a payout that the frozen souls estimate reproduces; otherwise it is an estimate, and the footer says so. Unknown or partial top bars count as unknown, never as zero.
- Never log player names; `[FF]` logs use hero names and IDs. The validator fails on leaked names.
- Cache panels and write only on change: rows carry an `ff_sig` attribute, and `setRow` returns early when it matches. List rows keep their child references (`ROW_REFS`, per list slot and row panel).
- Hot-path call budget (measure with `feeder_feed/scripts/measure-feeder-feed.js`). Each top-bar row caches its label references (`row.parts`, kept across rescans of the same panel). Every reference is revalidated on its own; values (text, heroid) are read live once per frame.
- One poll pass is one engine frame: labels cannot change while the script runs. `poll()` starts a frame (`nextFrame`); row liveness, label texts and records (`rowMemo`), `covered()`, `teamWorth()` and the clock are read at most once per frame, so entries that appear together share one frozen snapshot. `scanRows()` drops only the roster-derived values (`covered`, `teams`). Never carry a memo across polls.
- `teamWorth` rescans only when cached rows died or `covered()` fails. `covered()` requires each team's physical rows to equal its cached rows (both directions, per side) and runs on every frame with a death.
- A name miss is an NPC only after a fresh scan, or when every cached player label is readable and non-empty and the roster is covered. Otherwise it stays unresolved and retries.
- `render()` runs once per poll after all counts (`State.active` replaces a class read). Reset, tab and Show-more render synchronously.
- `GameStateInProgress` stays at 10 Hz so the reset never wipes first-second deaths. `localPlayerTeam1/2` drives enemy color and top-bar panel sides: color reads are throttled to 1 Hz, but relative feed entries refresh the team classes before their first-sight snapshot and on resolution retry. A change in either class invalidates the roster. Without either class, relative heroes and assister queues wait rather than using guessed sides; first-sight worth can be re-sided later without re-reading values. Absolute spectator entries retain their top-bar mapping.
- Keep the 0.1 s poll and the per-entry loop: a count/first/last signature could see an interior entry late, which breaks first-sight freezing.

## Display

- Each list shows its top 3 rows. A stock-style ShowMore pill (`FeederDonorsMore`/`FeederRecipientsMore`) reads `Show more (N)` / `Show less` and appears only for more than three rows.
- Rows have a portrait, a bar (death souls, then soul-bag souls in shard color), stat chips on the bar, and a dark souls box on the right. Only rows without a portrait (`NoHeroId`: Assisters, Unknown) print a name. The top row is marked by a gold souls box, never by a text badge.
- Bars take the hero's team color (`SideFriendly`/`SideEnemy` row classes with `FeederEnemyTeam1/2`); NPC and unknown rows are grey. Without a local team class, the learned spectator enemy team decides. The footer reports our team's and the enemy's charity totals separately.
- Sizes are HUD px, which Panorama scales with screen height. Widths use only `100%`/`fill-parent-flow`, chips stay on one line and clip, and the section scrolls past 760 px. Do not add fixed widths that assume an aspect ratio.

## Source and generated files

Edit only `feeder_feed/` source, `feeder_feed/scripts/` (validator, shared VM fixture `feeder-feed-fixture.js`, measure script), `build_feeder_feed.ps1`, and the `feeder_feed.js` entry in `scripts/hp-colors-rewrite-closure.ps1` (the Closure output contract). `feeder_feed/logs/` holds raw live captures that are kept as evidence; do not rewrite them. Do not edit `_feeder_feed_build/`, root `pak08_dir.vpk`, or installed addons.

## Verification

Run:

```powershell
node feeder_feed/scripts/validate-feeder-feed.js
powershell -ExecutionPolicy Bypass -File build_feeder_feed.ps1
```

The validator boots the real script in a VM HUD (`feeder-feed-fixture.js`) and replays live captures against the server's own numbers. It also guards the tab-visibility CSS and writes `.tmp/feeder-feed-validate.json`, whose `runs` field records every scenario's logs, rows, footer, pills and root classes. The build runs it on source, minifies with Closure ADVANCED, and reruns it on the minified script (`FEEDER_FEED_SOURCE`). It then compiles, checks the exact three-asset pak08 inventory, backs up and deploys to `citadel/addons`, and verifies the hash. Remind the user to restart Deadlock fully.

Refactors and optimizations: copy `feeder_feed/panorama` first, then prove old-vs-new on the same harness:

```powershell
$env:FEEDER_FEED_SOURCE = '<copy>\scripts\feeder_feed.js'; node feeder_feed/scripts/measure-feeder-feed.js --output .scratch/<task>/before.json; Remove-Item Env:FEEDER_FEED_SOURCE
node feeder_feed/scripts/measure-feeder-feed.js --compare .scratch/<task>/before.json   # add --callers to see which functions make the calls
```

`--compare` prints per-scenario native-call totals (synthetic VM counts, not FPS) and fails when observed outputs differ. Also compare the validator artifact from both copies; it must be byte-identical unless the change is a named fix.

A local bot or sandbox match writes the server's `GameTime/Base Bounty/Total Bounty` and `Comeback Active ... Killer Portion, Portion per Assister/Non-Assister` lines to `citadel/console.log` next to the `[FF]` lines. Compare `CB #` lines (`status`, `reason`, `base`, `K/A/O`) against them before changing the formulas, and add new captures as replay tests. Official servers print no such lines.

Do not launch Deadlock unless the user asks. In-game layout, spacing and the tab switch after the damage-report restyle are not yet confirmed live.
