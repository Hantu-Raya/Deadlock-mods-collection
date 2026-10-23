# Observer HUD spec

Status: v2 is built and installed as pak10 (`3e28f4fe`, 2026-10-23). The behaviour below is what the current source does; [MAP.md](MAP.md) says which parts were seen live. Terms are in [CONTEXT.md](CONTEXT.md); each engine fact carries its evidence label in [ENGINE.md](ENGINE.md). Design history is in [PLAN.md](PLAN.md); mockups are in `designs/` (not shipped).

## Purpose

An observer-PC mod for community tournaments. The reason it exists (user, 2026-10-22) is the [ability status column](#ability-status-column): debuffs, stuns and pulls with their seconds, which a spectator cannot otherwise see. Around it the mod dresses the stock spectator top bar with an organiser's event name, stage, team names, logos, series score and bans, and offers an Escape-menu editor.

It is not DLF: DLF carries one league's branding. Fonts (Reaver, Retail Demo, VALVE Oracle) ship with Deadlock, so nothing is installed beside the pak.

## Looks

The editor's LOOK row picks the look (`state.style`). Both looks keep the stock top bar, the status column and the objective cues. v1's Base Game+ look (portrait aliases, event under the stage) is gone ([ADR 0005](docs/adr/0005-two-looks-v1-look-dropped.md)).

### Base Game+ Names

The default (`"names"`). The band is 26 px. Rev 2 from mockup `designs/d17-base-names-rev2.html` (user 2026-10-23, after a debate with a second model):

- A names strip over each team's cards, and the names row inside it (alias or stock name).
- The centre tab: the organiser logo, else the organiser name, else the event title, between a team-coloured series digit at each end (`#OHScoreLeft/Right`, 22 px, the tab's first and last children over its full height with `ignoreParentFlow`, live 2026-10-23: placed beside the tab they drifted). The name fits the 148 px between the digits (15, 13, 11 px, then ellipsis).
- A [plate](#placement) per team in the band at the screen's top edge, joined to its team's strip with no gap: the team name over a caption line (left plate: stage · `BOn`, or `BEST OF n`; right plate: `GAME n · FIRST TO m`) and the logo at the inner end beside the cards. The logo takes `logo.shape` and `logo.size` (24-50 px, the shared setting); a team image fills it (cover). The plate's height follows the logo both ways: logo + 13 px, 37 px at 24, 43 px at the default 30, 63 px at 50 (user 2026-10-23). A circle logo curves the plate's inner bottom corner by the height it hangs below the strip (11-37 px, inline `borderRadius` per corner); a square logo keeps the step. A 40 px join (`#OHJoinLeft/Right`) over the strip's start fades the plate's team colour into the strip. Narrow ends drop the caption (< 230 px), then shrink the name (< 210), then the logo (< 160); below 96 px the plate and its join go.
- Each team's two bans beside the stock clock box (clock bans): 32 px circles (28 px until 2026-10-23, user: "bigger a bit"), centred on the clock label. Where the bans would reach a team's innermost card (live 2026-10-23, 1600x900: they covered the innermost portraits), the stock teams spread outward through `#TeamsContainer`'s width (as Night Desk's logo spread) by what the tighter side lacks for its bans plus 4 px (`bansSpread`). The gaps are measured from the card spans while nothing is spread, so the spread never feeds back on itself; a HUD width change re-measures them unspread. No bans, no spread.
- No stage box: the [objective cues](#objective-cues) sit at Night Desk's spot under the soul plates (52 px under the clock). The rift chip hides while the stock rift HUD shows (it is moved under the chips and says the same thing); Night Desk keeps `LIVE`.
- The [soul lead graph](#soul-lead-graph) under the cues, as in Night Desk (design 19, user 2026-10-23).

### Night Desk

The second look (`"desk"`). The band is 56 px lacquer with one brass hairline.

- Left corner: event and "stage · BOn" (`BEST OF n` when the stage is empty). Right corner: `GAME n` and `FIRST TO m`. The game number is `min(bestOf, series sum + 1)`; `m` is the wins the format needs. Corners run from `EDGE` to the team blocks and hide below 96 px.
- Per team, a block over the stock team: the team name at its inner end over the player names and a `BANS` label with two bans (28 px circles, 24 px until 2026-10-23, user: "bigger a bit"; y 4-32 in the band's top row) at the outer end. The team's logo ring (30 px, monogram until a logo loads, team-coloured) sits on the centre plate's edge in an arch that bulges out of the plate in the band's top row (y 1-35), so the logos sit at the middle and the names row stays readable (mockup `designs/d15-night-desk-arch.html`, arch A, user 2026-10-23). The name ends 24 px from the team's inner end (`DESK_NAME`). Team names over 20 characters step down to 18 px, over 24 to 15 px. An event title over 16 characters steps down to 10 px.
- Team logo (design 16, user 2026-10-23): `logo.shape` circle or square, `logo.size` 24-50 px (30 default), `logo.gap` 4-48 px (12 default) between the logo's tab and the team name. The tab on each plate edge is the logo plus 2 px each way from the band's y 1 (`layoutArch` writes every size, radius and margin of `#OHArch`/`#OHRings`); a team image fills the logo inside its 1 px ring with the logo's radius. Past 30 px the stock `#TeamsContainer` gets `2 x 1.5 x (size - 30)` px wider than its measured stock width, so both stock teams (left- and right-aligned in it), their cards, names row, plates and team blocks move outward by `1.5 x (size - 30)`; in Base Game+ Names the width follows the clock bans instead (stock without them) and returns to stock outside spectating. Editor: TEAMS page, Team logos card, `#OHLogoCircle`/`#OHLogoSquare`, `#OHLogo{Size,Gap}{Down,Value,Up}` (the gap row is tagged Night Desk only and dims under Base Game+ Names). The centre plate grows `(size - 30) / 2` px a side (live 2026-10-23: a 44 px logo covered the organiser on the 192 px plate; when the plate took the whole spread, 50 px logos covered the innermost player names), so the organiser name or logo keeps 154 px between the tabs at every size and the innermost player names clear the tabs (at 50 px the name box ends at the tab's outer edge) and the name steps down 15, 13, 11 px per tick while wider, then ellipsis. Team images use `stretch-to-cover-preserve-aspect` so they fill the circle or square.
- The names row, the organiser logo or name over the series score (`n - n` in team colours), and an optional info card.
- The [soul lead graph](#soul-lead-graph) under the clock, with the cues above it. The stage box and clock bans are hidden.

## State

```text
{ v: 1, style ("names"|"desk"), event, stage, bestOf (1|3|5|7),
  amber/sapphire: { name, tag, logo: { url }, series, bans: [heroId, heroId] },
  org: { name, logo: { url } }, info: { title, value, caption },
  graph: { show (0|15|30|60|-1 s), every (60|120|180|300|600 s), size (70-150 step 10 %), x (-600..600 step 10 px), y (-40..300 step 5 px) },
  logo: { shape (circle|square), size (24-50 step 2 px), gap (4-48 step 2 px) },
  cues: { bridge, urn, rift, mid },
  buys (0|3|5|8|15 s),
  aliases: { "<in-game name>": alias },
  dev: { debuffs, debuffPollMs (100|250|500|1000|2000), logStatus } }
```

- Limits: event 40, stage 28, team name 28, tag 4 (upper-cased), alias 24, in-game name key 32, at most 24 aliases, organiser 24, info title 24 / value 16 / caption 32.
- Every field falls back to its default on its own when missing or invalid. Text that is too long is rejected, never cut. `$.OHState.normalize` is the only gate, so a value the editor accepts is the value the bar shows.
- Series runs from 0 to the wins the format needs; a shorter format caps it. When the stock match-end screen of a spectated game names a winner, that team's series goes up by one, once per map load and never past the wins the format needs; an abandoned game adds none (user 2026-10-23; [ENGINE.md](ENGINE.md#objective-data) has the class mapping). The editor's MATCH page corrects it. A hero is banned once: a repeat in a team's second slot is dropped, and a hero banned by both teams keeps only the Amber ban. A cleared team name shows the side's name (AMBER, SAPPHIRE).
- Logo URLs must be absolute `http(s)` with a plain host, no credentials, spaces or backslashes, at most 512 characters; otherwise they are rejected and never logged.
- `graph.show` is how long the graph shows at each new pin (`-1` always, `0` off). `graph.every` is the mark interval. `graph.size` lays the graph out larger (box, fonts, line, pins; no bitmap scale) around its top centre, so size never moves it; `graph.x`/`graph.y` move it from its spot (centred in the clock stack, 4 px under the timers). Editor: TIMERS page, Soul lead graph card (both looks; size, X and Y on one row), `#OHGraph{Size,X,Y}{Down,Value,Up}`.
- `cues` values are the seconds before a spawn that the countdown shows (15, 30, 60, 120), `0` off, `-1` always. The rift is only `0` or `-1`.
- `buys` is how long each [purchase notice](#purchase-notices) shows (default 5 s, as DLF; `0` off). It travels in share codes.

### Sample defaults

A fresh state fills the boxes with real text (user, 2026-10-22): event `Community Cup Season 2`, stage `Grand Final`, `bestOf` 3, organiser `Community Cup`, teams `Night Owls` / `NOW` and `Brass Saints` / `BRS`, info card `Prize pool` / `$2,130` / `Donate to increase`, graph `show` 30 and `every` 300, cues `bridge` 30, `urn` 30, `rift` -1, `mid` 30. Logo URLs and aliases start empty. RESET returns to these values; an emptied box stays empty (except a team name). Most validator checks boot with a blank state; `samples: true` checks the shipped text.

### Share codes

`OHC1.<fnv1a>.<base64url>` of `{ s: 1, state }` without `dev`, at most 8192 characters. Import replaces the setup (missing fields take defaults) and keeps this PC's DEV settings. A corrupt code and a code from a newer version are told apart.

## Host and injection

The pak overrides only `hud_spectate_bar.xml` (stock plus an `oh_host.css` include and the scripts), `citadel_status_effect.xml` and the two VData files ([ADR 0001](docs/adr/0001-inject-from-hud-spectate-bar.md)). The host script loads at UI start and loads the mod's layouts with `BLoadLayout` into panels it creates:

| Panel (id) | Layout | Goes into |
|---|---|---|
| `OHBandHost` | `observer_hud/band.xml` | the parent of `#TopBar`, right after it |
| `OHBar` | `observer_hud/tournament_bar.xml` | `#TopBar` |
| `OHDebuffsHost` | `observer_hud/debuffs.xml` | each `CitadelHudTopBarPlayer` card |
| `OHMenuHost` | `observer_hud/editor.xml` | `#EscapeMenu` |
| `OHMenuButton` | none (a native `Button`) | `#SubOptions`, after `.FeedbackRow` |

- State: `$.OHHost` owns it. The editor changes it only through `setState`; readers take `getState()` and compare `version()` or use `onChange`. The state is also kept as JSON on the HUD root attribute `observer_hud_state`, which a layout reload adopts (`carried()` is then true).
- A 1 s tick re-injects what is missing: `#TopBar` and the cards are rebuilt on map loads and hero swaps ([ENGINE.md](ENGINE.md#host-and-injection)). A cached card is reused only while its cached children are valid. Panels of an earlier script instance are deleted once at boot. Until the script sits under `CitadelHudRoot` the tick retries with a backoff (0.5 s doubling to 8 s).
- Outside spectating (`spec_mode`, `TeamSpectator` or `replay_playback` on `CitadelHud#Hud`) the tick only checks those classes; the stylesheets gate the same way. When spectating ends, the stock top bar's inline `margin-top` and the collapsed `#RejuvenatorTimer` are cleared.
- A missing stock id (`#TeamFriendly`, `#GameTime`, `#EscapeMenu`, `#SubOptions`, a card's name label) hides only the part that needs it and is logged once.

## Placement

- The band spans the HUD width from the HUD's top-left corner. `#TopBar` is `width: fit-children` and clips, so the bar also sets its width to the HUD width. The host moves `#TopBar` down with an inline `margin-top` of the band height plus the stock 8 px (26 + 8 or 56 + 8).
- The band panel itself is 220 px tall and transparent; its lacquer is a 56 px full-width child at about 82 % opacity with `world-blur: gaussian(2,2,2)`. The dark panels drawn over the world blur it (names strip and centre tab, info card, and the graph only while shown); panels drawn on the band do not ([ENGINE.md](ENGINE.md#panorama-styling-behaviour)).
- Everything is positioned from the stock panels it belongs to, measured with `GetPositionWithinWindow()` and `actualuiscale_x`: the team panels (`#TeamFriendly` Amber, `#TeamEnemy` Sapphire) and the `#GameTime` clock. A team's plate and block follow its stock panel when the sides swap.
- Names plates sit in the band at the top edge, at the outer edge of each team panel with no gap, no closer than `EDGE` (72 px) to the screen edge. Width is the free space up to 250 px. Below 230 px the caption goes, below 210 px the name drops to 14 px, below 160 px the logo goes, below 96 px the plate and its join hide.
- Clock bans hug the stock clock box (5 px padding plus a 6 px gap); the left team's start 36 px per ban further left (`BAN_STEP`: 32 px ban plus margins).
- The cue stack starts below the clock (and below the measured stock `#RejuvenatorCharges` while a rejuvenator is held and a side shows its icons).
- Names: one label per card (`OHWho0..11`, Amber's cards first), centred on its card. The stock cards are equal (`playerDetailsWidth`, margin 0) and flow from the left of `#PlayersContainer`, which is as wide as the team panel and wider than the cards, so dividing the panel evenly drifted the names (live 2026-10-23). Each tick measures each team's first card (one read per team) and centres card k at `first.x + (k + 0.5) x first.w`; without a measurable card the team panel is divided evenly.
- Write styles, texts, classes and hero ids only on change, checking the cache before the panel. Steady state makes no writes and no extra native calls.

## Logos

One `Image` per URL, created when the look shows that logo (a plate logo in Base Game+ Names, the desk ring in Night Desk, the organiser logo in both). It shows only after its own `ImageLoaded`. A failed or replaced image is deleted and the monogram (or wordmark) stays. URLs pass `cleanUrl` and are never logged. The editor shows a status note under each URL field.

## Aliases

Keyed by the card's in-game name (the stock `AlwaysPlayerName` or `PlayerName` label text). A name two cards share shows the stock name on both. Nothing is added to the portraits; the band's names row shows the alias, else the stock name. The editor's PLAYERS page lists up to six names per team from the roster and follows joins and swaps while it is open.

## Soul lead graph

Both looks (Night Desk only until design 19, user 2026-10-23). Each tick while spectating, the host reads `#GameTime` and the stock `TeamScoreFriendly` / `TeamScoreEnemy` `ScoreLabel` texts (Friendly is Amber, [seen live](ENGINE.md#top-bar-and-hud-geometry)) and keeps one sample per 5 s of game time. The lead is Amber minus Sapphire in thousands.

- A mark's pin is the first sample within 20 s after it. Marks fall every `graph.every` (1, 2, 3, 5 or 10 min; default 5:00). Changing the interval re-pins from the samples without showing the graph.
- A clock that runs back by more than 3 s (a seek) drops later samples. History starts when the observer starts watching.
- The drawn series is the run of consecutive pinned marks ending at the latest; it starts from 0:00 only when it reaches back to the first mark. It needs at least two pins. The line runs through the samples between pins as a monotone cubic (Fritsch-Carlson, no overshoot) over at most 24 averaged knots, drawn as 3 px segments over 2 px fill columns (amber above zero, sapphire below). Inner pins show only when 14 px apart.
- The graph shows for `graph.show` seconds after a new pin (always for `-1`). Panels are rebuilt only when a pin changes. The header shows the current lead as `<tag> +n.nk` in the leader's colour.
- It sits 4 px under the timers, or 4 px under the stock rift HUD or [objective health](#objective-health) moved there (its own Y still applies when that is lower). While the rift HUD and an objective bar both show it waits (hidden, `Graph.held`) instead of sitting a whole stock panel lower; a running show window starts over while it waits, so it shows its full time once either clears, and `-1` simply comes back (design 19 rev 2).

## Objective health

The stock objective health (`#objectives_health_friendly`, hud.xml `gameplay_hud`; hud.css 6813: margin-top 0, flow down, z-index 20) draws a tier-2 walker as its 100 x 50 image over a 16 px bar, its top 160 px under the panel's top (HUD y 160), both teams' walkers side by side, the mid-boss and patron in their own rows. At that spot the timers and the soul lead graph covered it (live 2026-10-23, both looks). While spectating, `placeObjectives` gives the panel an inline margin-top that puts the top of the highest shown bar (`.objective.is_active`, not `.is_tier1`, with a layout box) 4 px under the timers, or 4 px under the stock rift HUD while it shows; the bars keep all of the game's styling (designs 19/20). The margin comes from the panel's parent and the panel's stock top under it (measured before the first write), so a lagging layout pass cannot make it oscillate; the highest bar's offset under the panel's top is measured while one shows and kept (160 until then), so the margin stays set between bars and a new bar appears in place. The margin is cleared when spectating ends.

## Objective cues

`#OHCues` sits in the clock stack: under the stage box in Base Game+ Names, under the soul plates with the graph below in Night Desk. One chip per objective, shown (`.OHOn`) only while close. How close comes from `state.cues` (default 30 s; the rift only off or on). The editor's TIMERS page has an Objective timers card.

| Chip | Shows | Source |
|---|---|---|
| Bridge buff | countdown in the setting's window before 5:00 and every 5:00; `UP` while the minimap has `powerup_spawn` markers, at most 30 s (always: until taken) | game clock; minimap |
| Urn | countdown before 10:00 and every 5:00; `UP` for 15 s after | game clock only |
| Rift | `mm:ss` from the minimap `koth_warning` (a 20 s countdown the host starts when it first sees the marker); `LIVE` while `#KothCashInMeter` is visible | minimap; stock capture meter |
| Mid-boss | countdown of the stock `#MidbossTimerLabel` while `#RejuvenatorTimer` has `midboss_cooldown`, in the setting's window, or the whole respawn right after a held rejuvenator; `UP` for 30 s after it ends (always: while alive) | stock timer |
| Held rejuvenator | the buff's time left in yellow (stock `goldColor` `#FFED79`) over the holder's bar (the team whose cards carry `HasRejuvenator`): 3:00 from the pickup when it was seen, else from the stock rejuvenator circle's radial (`#RejuvenatorTimer #StatusEffectsBorder` clip, 360 deg = 3:00, direction learned from two samples at about 2 deg/s); `HELD` until then or without a radial. When it ends the mid-boss respawn countdown follows until the mid-boss is back (user 2026-10-23) | stock classes, circle and label; cards |

- The last 10 s of a countdown add `OHSoon`. A held rejuvenator always shows, whatever the mid-boss setting; the respawn countdown after it shows unless the mid-boss is Off. In the live probe (2026-10-22) the stock label logged no change during the buff (6:54 at the 20:00 pickup, next 3:54 at 23:00), so the respawn time is shown only after it.
- Chips are four generic slots (`#OHCue0..3`, kind class `.OHKind*`) filled in order bridge, urn, rift, with the mid-boss chip inserted in the middle of whatever shows. The row is centred as a group, so it is always symmetric (user, 2026-10-22) and the mid-boss chip is exactly under the clock when one or three chips show ([ADR 0008](docs/adr/0008-objective-chips-only-when-close.md)).
- Chips are 46 px wide (icon over time). The mid-boss chip uses the stock rejuvenator icon and yellow `#FFCC00`; a held rejuvenator has a 3 px bottom bar in the holder's stock team colour (`#D6880C` Amber, `#4F74C3` Sapphire).
- The stock `#RejuvenatorCharges` stays visible. Its `#RejuvenatorTimer` progress circle is collapsed while spectating (user, 2026-10-22); its classes still drive the mid-boss chip.
- A seek back resets the trackers; a jump forward only forgets that a rejuvenator-free sample came first.
- The rift has no estimate before its warning ([ADR 0007](docs/adr/0007-no-rift-estimate.md)). Evidence: [decisions/objective-timers.md](decisions/objective-timers.md), [ENGINE.md](ENGINE.md#objective-data).

## Ability status column

DLF's top-bar column, ported under an `OH` prefix (`dlf/AGENTS.md` runtime rules apply). It has three parts.

1. **Spectator VData.** `scripts/abilities.vdata_c` and `modifiers.vdata_c` are rebuilt from the installed game on every build with `dlf/spectator-status.json` and `dlf/scripts/spectator_status.py` (shared with DLF), then verified after packing. A renamed ability fails the build. The pak must be rebuilt after every Deadlock patch ([ADR 0002](docs/adr/0002-spectator-vdata-in-one-pak.md)).
2. **World sampler** (`oh_debuff_world.js`, hosted in `citadel_status_effect.xml`, [ADR 0003](docs/adr/0003-world-sampler-in-citadel-status-effect.md)). It runs once per `CitadelStatusEffect` list. HUD lists (top panel `CitadelHudRoot`) stop at once. A non-hero list re-checks its class with a 0.5 to 2 s backoff; a hero list re-checks every sample, and a recycled bar sends one clearing message. A hero bar scans `#StatusEffectContainer` every `dev.debuffPollMs` and sends changes plus a 4 s heartbeat as `OH_DEBUFF_SNAPSHOT` through the sibling relay. `OH_DEBUFF_CONFIG` (the DEV settings) reaches each world context's own listener. `RULES` must equal `dlf/spectator-status.json`.
3. **Top-bar column** (`oh_debuffs.js`, injected per card from `debuffs.xml`). Four static slots under each stock card, matched by player name: 38 px circles with a 26 px ability icon, the applying team's colour, a stun mark, and seconds or a stack badge. The seconds read one second longer than the predicted end (`END_PAD_MS`, user 2026-10-23). A removed status fades out over 1 s. Snapshots expire after 10 s.

- The spec list decides which abilities show; a buff shows only where the spec says; `minStacks` applies (Djinn's Mark from 8 stacks); a stun is its own slot with a countdown fitted from three radial samples.
- World stun icons are hidden by `.WindowRoot.CLASS_PLAYER .statusEffect.stunned` in `oh_status_world.css`, plus an inline fallback. The selector stays short.
- pak10 loses the two VData files to any lower-numbered pak that ships them; the column then shows only what stock data draws.

## Purchase notices

DLF's QOLLOCK per-player purchase popups, rewritten (`oh_buys.js`, user 2026-10-23: "include the recent purchase from DLF ... rewrite it to improve compatibility and performance").

- Source: the stock shop list `#RecentPurchasesContainer` (in `#CitadelHudHeroShop`, hud.xml). The engine appends a row per purchase and deletes the oldest at 25 ([ENGINE.md](ENGINE.md#objective-data)). No shop layout is overridden (DLF overrides `citadel_hud_hero_shop.xml`).
- Each new row puts a notice on the buyer's top-bar card: the last child of the status column (`#OHBuys` in `debuffs.xml`), so it sits under the shown status slots and hides with the column (scoreboard, detail view, pre-game). One line, 36 px high and at most 228 px wide (about two and a half cards): a 28 px item icon (from `OH_ITEM_ICONS`, English shop name; other languages show the name only) and the name, shrunk only past 182 px (live 2026-10-23: at 126 px High-Velocity Rounds shrank thin). Newest on top, three at most, each for `buys` seconds, then a 0.4 s fade.
- Look: the stock shop item card's paper (`citadel_shop_mod_view.css`: slot/tier card backer art, `shopitem_paperwear01` at 0.5 washed per tier, `shopitem_papertexture01` multiplied), framed as QOLLOCK's purchase feed (a 2 px slot-colour border, bright, dark, darker by tier, tier 4 bright at 3 px, on the notice and its icon). The name uses the font of the stock "Spotted" chat ping bubble (`#MessageText`: oracle bold black), 17 px; tier 4 names use the stock card's light name colours. `oracle` is an `@define` in `citadel_base_styles` (`VALVEOracle, Reaver, sans-serif`) that this mod's sheets do not import, so the bare name drew a plain sans live (user screenshot 2026-10-23, notices next to a "Spotted" bubble); the family is spelled out. (Live 2026-10-23, in turn: two-line 10 px names too small; Jost thin and tiny, as the game has no Jost; then the text kept drawing in the fallback sans; the user pointed at the "Spotted" font, keeping the paper and border.)
- Wobble: the paper and frame sit on one layer (`.OHBuyBg`) that loops the stock chat bubble's `ChatGroove_Allies` poses at 30 % (`rotateZ` ±0.3 deg, `skew` -1.5 to 2.7 deg; stock ±1 and -5 to 9; 4 s, 400 ms stepped frames; `OHBuyGroove`), so the outline morphs like the stock objective and ping bubbles (user 2026-10-23, "Defend the York Base Guardian" screenshots; then "reduce the wobble to 20%" after the full poses on `bd88bfdc`, then "increase the wobble by 10%"). The icon and name stay still. Panorama draws a transformed panel's own edges without anti-aliasing (live 2026-10-23, 1600x900: the CSS border and paper stair-stepped at the stock poses, and at a third of them the wobble was too subtle and still jagged). So the frame is drawn as images, anti-aliased in the texture inside a 2 px transparent rim (`scripts/make-notice-frame.py`: left cap 9 px, stretched middle, right cap; white, washed with the border colour; 2 px band, 3 px for tier 4): the quads' hard edges fall in empty texels. The paper box sits 3 px in, its hard edge under the opaque band. The notice box is therefore 40 px high and up to 232 px wide (frame 36 x 228 px), with margins -2 and 1 px so a row is still 39 px and the frame keeps its place.
- Neighbours: while any notice shows, each team's stacks are laid out by their cards' x, not child order (stock `.connectedToHeroTesting .friend #PlayersContainer` flows left). A stack whose notices (measured width, else 228 px) would overlap an earlier stack's horizontally and vertically moves 4 px under it, repeated until it overlaps none; every earlier stack is checked, so a notice wider than two cards also clears the card after next. Heights are known: 43 px per shown status slot, 39 px per notice row, fading notices included. The margin is always written in px, back to `2px` when the overlap ends (an inline `null` clear is not trusted live). (Live 2026-10-23 on `23dc678f`: Mystic Burst and Monster Rounds overlapped on neighbouring cards; the previous left-neighbour-only pass followed child order.)
- The card: the buyer's team (`isTeam1Purchase` Amber / `isTeam2Purchase` Sapphire, fixed to `#TeamFriendly` / `#TeamEnemy`), then the same hero id (row `#RecentPurchaseHeroImage.heroid` against the card's `#HeroBadge.heroid`), else the same hero name (a label of ours bound to the row's `{s:recent_hero_name}` against the card's `.HeroName`). No match or two matches: no notice.
- Never shown: rows already in the list when it is first seen (joining mid-game), and rows stamped more than 10 s before the game clock (a seek or a refill).
- Cost: nothing but a plain host flag every 2 s when not spectating; while spectating, one validity check every 0.5 s below 25 rows (plus the newest row at the cap). Rows are read only when they appear; the stack layout runs only while a notice shows.
- Not built: DLF's full shop history panel and its tier and team filters, the centred popup stack, and QOLLOCK's scale, offset and opacity settings.

## Editor

- Entry: the host creates `#OHMenuButton` ("TOURNAMENT SETUP", `nav_menu_item minor` + `menuButtonLabel`) in `#SubOptions` right after `.FeedbackRow`, once per Escape menu, shown only while spectating. Its visibility is written as `visible` / `collapse`. No Escape-menu layout is overridden.
- Window: 1280x780 under the top bar, in HP Colors v3's stock-Settings look: a rail of pages, a green brush on the picked page, cards of label and control rows, `SecondaryButton light` pills with `fill Selected` when picked, the stock switch. A `Button` backdrop takes clicks around it.
- Pages (rail order, match-day order; design 18, 2026-10-23):
  - **MATCH**: stage, format Bo1/3/5/7 ("first to N"), each team's series wins ("of N", rows named after the teams), two bans per team via the hero picker.
  - **TEAMS**: per side, team name with tag on one row and logo URL; a Team logos card with shape, size (the note gives the current look's range) and the name gap (Night Desk only).
  - **PLAYERS**: aliases, both sides side by side, then the Purchase notices card (Off, 3, 5, 8, 15 s) and the status column card (on/off, world-bar poll, status log; this PC only, not in share codes).
  - **TOP BAR**: the look, with a line on what it shows; organiser name and logo URL; event title (the note says where the current look shows it).
  - **NIGHT DESK**: info card. Under Base Game+ Names the rail button reads "off", the cards dim (values kept, still editable), the description says why and `#OHUseDesk` switches the look.
  - **TIMERS**: objective timers and the soul lead graph (design 19).
  - **SHARE**: copy and import a code; what it carries and how to use it.
- Scope: each card head names where it applies (`.OHScope` BOTH LOOKS or NIGHT DESK ONLY) and where it shows; the rail head shows the look in use (`#OHRailLook`).
- Edits apply as typed; a logo URL applies on Enter or blur. A rejected URL keeps the current logo and says so. Picking a hero already banned moves it to the new slot.
- Footer: RESET <PAGE> (named after the page) resets exactly the settings on it: MATCH stage, format, series wins, bans; TEAMS names, tags, logo URLs, logo shape, size and gap; PLAYERS aliases, purchase notices and the DEV settings; TOP BAR look, organiser, event title; NIGHT DESK info card; TIMERS objective timers and graph. SHARE hides it. RESET ALL resets everything including the DEV settings and repairs a blocked save. Each needs a second press within 4 s.
- Esc closes the whole Escape menu (no `oncancel` hook; [ENGINE.md](ENGINE.md#host-and-injection)). Edits are already applied, so nothing is lost.

### Version and credits

The public version is **0.1.0** (`VERSION` in `oh_menu.js`, shown as `#OHVersion`). The rail's foot carries DONATE (Ko-fi `hantuaraya`), `by hanturaya` (`https://x.com/hanturaya`) and the version, opened with `ExternalBrowserGoToURL`. The footer's `#OHSupporterStrip` (`CitadelHTMLPanel`, no hit test) loads HP Colors v3's hosted supporters strip (`supporters-strip-v3/?v=<fresh>`) on open and `about:blank` on close; it is optional.

## Local save

`oh_menu.js` keeps the whole state (DEV included) in Steam's CEF localStorage through the hpv2-store page `https://hantu-raya.github.io/hpv2-store/oh/` ([ADR 0004](docs/adr/0004-local-save-through-hpv2-store.md)).

- Transport: hidden `CitadelHTMLPanel#OHStore` in `editor.xml`; request in the URL fragment, reply in `HTMLTitle` with prefix `OHS1:`, protocol version 1. One key, `hantu.observer_hud.v1/state`. Record `OHS1.<fnv1a32>.<{s:1,state}>`. The page advertises its cap as `m` (8192; 4096 if absent); over the cap the logo URLs are dropped from the record and the status says so.
- Phases: hello (retry every 2 s, give up at 30 s: `OFFLINE - SESSION ONLY`), read, then ready, or blocked (damaged or newer save; only RESET ALL overwrites), or unavailable. Saves throttle at 1.5 s, one request in flight, retries at 2, 4 and 8 s. Status shows in the footer `#OHSaveStatus`.
- The record is adopted only by a fresh process (`$.OHHost.carried()` false) and only if no edit came first. The page never touches the HP Colors, Buff Timer or DLF keys.

## Budgets and logging

- Validator budgets (synthetic native calls per second, live-like scenario: 12 hero bars at the 0.25 s poll with a listed and an unlisted status each and `CLASS_PLAYER` on the world panel, 60 idle bars, host with band, names, graph sampling, column and objective health placement): 1200 while spectating, 1590 while every card counts down (the column's 0.25 s tick), 12 when not spectating; zero text, style and class writes in steady state. Last recorded run (2026-10-23 audit with m1): 1189.8, 1575.2 and 11.7 per second; the tree before it measured 1451.8, 2067.6 and 13.7 under the same scenario ([MAP.md](MAP.md#status)).
- Own panels are hidden by class (`OHGone`, `OHPlateGone`), never by an inline `visibility: collapse` later cleared with null: live, a cleared inline collapse leaves the panel hidden ([ENGINE.md](ENGINE.md)). The validator models this in every check: any panel whose inline visibility goes `collapse` then null fails it.
- Console output uses the prefixes `[OH]` (host), `[OH-MENU]` (editor) and `[OH-DB]` (status column). Logo URLs are never logged.

## Stock panels moved while spectating (2026-10-23)

- The stock SPECTATING <name> block (`#spectate_target`, with the Next/Previous Player hints) and the camera controls (`#camera_section`: Change Camera, Zoom Out, ...) are hidden while spectating (`oh_host.css`; the keys still work). The team tint at the top of the screen while watching a player (`.spectatingUnit.spectatingTeam1/2 .SpectateTopBar`) fades out by half the 240 px bar (`gradient( linear, 0% 0%, 0% 50%, ...)` from the team colour at `30` alpha), not the full bar (user 2026-10-23, edited live in the Panorama debugger).
- The stock damage impact (`#damage_impact`) keeps its stock place (user 2026-10-23; 95 px lower was tried and dropped).
- The clock stack (timer chips, then the soul lead graph) sits at its mockup spot under the clock, over the stock `#RejuvenatorCharges` box (130 px, empty unless a team holds rejuvenator charges). It drops 2 px below that box while a rejuvenator is held (`#RejuvenatorTimer.has_rejuv`) and a side shows its icons (`RejuvCount_N` on `#RejuvenatorFriendly`/`#RejuvenatorEnemy`) and the charges are visible. For the scoreboard's kills row (`.KillsAndAbilityPointsContainer`), the first child of the stack, `#OHScoreSpace`, is shown by the stock classes in `oh_bar.css` (`.wants_scoreboard`, not `.wants_scoreboard.PreGameHeroDraft`, as the stock rule for the row), so the stack moves down in the same frame as the row appears; the host only writes its height: from the stack's spot to 2 px under the row (measured while shown, else the stock 80 + 46 px) (user 2026-10-23: native classes).
- The stock pause box (`#PausedInfo`, `hud_paused.xml`: `{s:paused_text}` in a 500 x 120 box) becomes DLF's minimal pause: an 80 x 80 box with an added `II` label (class `PausedText`, 58 px), the box's own child (out of flow, centred). The stock pause text (`#PausedLabel`, `#PauserLabel`, `#UnpauseButtonLabel`, and QOLLOCK's `#QLPausedText`) fades out with opacity. The countdown number (`#PausedCountdownLabel`, stock 180 px, 175 px left of centre) moves to II's spot (margins 0, top 4 px, 58 px) and keeps its stock visibility: the engine gives it `.Hidden` while paused and removes it each countdown second (live `[OH-PAUSE]` log 2026-10-23), so II shows exactly while the number has `.Hidden`, written `visible` / `collapse`. A 0.1 s watch makes the swap prompt while the box shows (`#PausedGameContainer` without `.Hidden`). Inline styles only, cleared outside spectating.
- `.OHBar` is 640 px tall (transparent, `hittest="false"`): at 220 px the soul lead graph moved under the rift HUD was squashed (live 2026-10-23).
- The stock rift HUD (`#KothCashInMeter`, stock margin-top 110 at ui-scale 70%, 120 at 100% in range or captured) is drawn behind the chips at its stock spot (live 2026-10-23). While spectating it gets an inline margin-top that puts its top 4 px under the timer chips (`placeKoth`); the timers keep their place, the [objective health](#objective-health) moves 4 px under it, and the soul lead graph 4 px under whichever shows last (its own Y still applies when that is lower; it waits while both show). Screen px per margin px is measured from the last margin each tick, because whether ui-scale scales that margin is unknown. The margin is cleared when spectating ends (user 2026-10-23).
