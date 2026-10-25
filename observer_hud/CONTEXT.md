# Observer HUD language

The vocabulary of the pak10 observer HUD: looks, top bar parts, objective cues, the status column and local saves. Behaviour is in [SPEC.md](SPEC.md); engine facts are in [ENGINE.md](ENGINE.md).

## Product and roles

**Observer HUD**: The pak10 mod for community tournaments. It dresses the stock spectator top bar and adds an Escape-menu editor and the ability status column.

**Observer PC**: A machine that spectates. The pak ships modified ability and modifier VData, so it is not for playing matches.

**Organiser**: The person who runs the event and fills in the editor. Also the name in the centre of the top bar (**organiser wordmark**, or an **organiser logo**).

**Spectating**: The HUD root (`CitadelHud#Hud`) carries `spec_mode`, `TeamSpectator` or `replay_playback`. Outside spectating the host only checks those classes.

**Stock**: Valve's own panel, layout or value from the pinned GameTracking copy in `stock/`. Stock panels stay engine-owned; the mod finds them by id.

## Looks and top bar parts

**Look**: One of the two layouts of the top bar, picked in the editor (`state.style`). Both keep the status column.

**Base Game+ Names**: The default look (`"names"`, mockup `designs/d14-base-names.html`). A 26 px names strip over each team's cards, the organiser wordmark in the centre, team plates at the outer ends, clock bans, and the stage box under the clock.

**Night Desk**: The second look (`"desk"`, mockup `designs/d12-night-desk.html` rev 3c). A 56 px lacquer band with corners, team blocks, a names row, the organiser over the series score, an optional info card and the soul lead graph.

**Tournament bar**: The injected `observer_hud/tournament_bar.xml` panel inside the stock `#TopBar`: plates, clock bans, stage box, objective cues and the graph.

**Band**: The injected `observer_hud/band.xml` panel placed right after `#TopBar` in `.HudCore`. It holds the strip or desk corners, the names row, the centre and the info card. The stock `#TopBar` moves down by the band height.

**Names strip**: Base Game+ Names' 26 px strip over each team's stock cards.

**Corner**: Night Desk's left (event and stage) or right (game number and "first to") block of the band. It hides below 96 px.

**Desk team block**: Night Desk's per-team block over the stock team: team name at the inner end, bans at the outer end.

**Arch**: Night Desk's half-circle on each side of the centre plate, in the band's top row; the team's logo ring sits in it on the plate's edge.

**Names row**: The band's 12 labels (`OHWho0..11`), one per card, showing the alias or the stock name.

**Centre**: The panel at the clock's centre line: organiser logo, else organiser name, else (Base Game+ Names only) the event title. Night Desk puts the series score under it.

**Plate**: Base Game+ Names' team box at the outer end: logo or monogram, team name, series. It follows its stock team panel when the sides swap.

**Monogram**: The tag, or up to three capitals of the team name, shown until a logo loads.

**Clock bans**: Base Game+ Names' two bans per team beside the stock clock box. Night Desk draws the bans in its desk team blocks instead.

**Stage box**: The stage text over a small `BOn` under the clock (Base Game+ Names only).

**Info card**: Night Desk's optional box (title, value, caption). An empty title hides it.

**Series**: A team's game wins, from 0 to what the format needs (`bestOf` 1, 3, 5, 7).

**Sample defaults**: The shipped text in a fresh state ("Community Cup Season 2", "Night Owls" and so on). It shows on the top bar until edited.

**EDGE**: The 72 px margin from the screen edge that keeps plates and the left corner clear of the stock corner icons.

## Soul lead graph

**Soul lead graph**: Night Desk's small line chart of the soul lead between the teams, drawn under the clock by the host.

**Sample**: One reading of `#GameTime` and the two stock soul labels, kept per 5 s of game time. The lead is Amber minus Sapphire.

**Mark**: A game-time interval point (`graph.every`: 1, 2, 3, 5 or 10 minutes; default 5:00).

**Pin**: The first sample within 20 s after a mark. The graph draws the run of consecutive pins ending at the latest mark.

**History**: The samples recorded since the observer started watching. A seek or late join leaves earlier pins empty.

## Objective cues

**Objective cue**: A small chip (icon over time) under the clock that appears only while an objective is close: bridge buff, urn, rift, mid-boss or a held rejuvenator.

**Cue setting**: How early a cue shows (`state.cues`): seconds before the spawn (15, 30, 60, 120), off, or always. The rift is only off or on.

**Chip slots**: The four generic slots `#OHCue0..3`, filled in order bridge, urn, rift, with the mid-boss chip inserted in the middle.

**UP / LIVE / HELD**: Chip texts. UP: spawned. LIVE: the rift is open. HELD: a rejuvenator pickup first seen after a jump, so its time is unknown.

**Rift warning**: The minimap marker class `koth_warning`, which appears 20 s before the rift. It is the only rift signal; the rift time is never networked.

## Status column and world sampler

**Status column**: Four slots under each stock card showing a hero's debuffs, stuns and pulls with seconds or stack counts. The core feature of the mod.

**Spectator VData**: `scripts/abilities.vdata_c` and `modifiers.vdata_c`, rebuilt from the installed game with `dlf/spectator-status.json`, so world healthbars list statuses that stock data hides.

**World sampler**: `oh_debuff_world.js`, hosted in `citadel_status_effect.xml`. One instance per status list; it reads a hero bar's status panels.

**Hero bar**: A world healthbar whose panel or parent carries `CLASS_PLAYER`. Non-hero bars idle.

**Relay**: A sibling panel (`debuff_relay.xml`) that fires `ClientUI_FireOutput` so a world snapshot reaches the HUD host.

**Snapshot**: One hero's statuses as `OH_DEBUFF_SNAPSHOT`: `[key, debuff, count, end, stun]` per item.

**DEV settings**: The TIMERS page's status column switch, world-bar poll rate and status log (`state.dev`). They stay on this PC and never go in a share code.

## Editor, state and saves

**Host**: The script set loaded by this mod's `hud_spectate_bar.xml`. `$.OHHost` owns the state, injects the layouts and runs the 1 s tick.

**Injection**: Creating a panel and loading one of the mod's layouts into a stock panel with `BLoadLayout`. Stock layouts are not overridden except two small ones.

**Editor**: The TOURNAMENT SETUP window in the Escape menu, opened from a native entry the host adds to `#SubOptions`.

**Alias**: A display name for a player. Keyed by Steam account (`players`) when the card's account is known, else a session alias by name (**pending**), else a v1 name-keyed alias (**legacy**). A name two cards share keeps the stock name.

**Marker account**: The Steam account a far-away marker's `CitadelUserName#PlayerName.accountid` carries (0 until the marker is first set, and for a bot), with the marker's side class (`team_1` Amber, `team_2` Sapphire). The only passive account source in the HUD.

**Account join**: Which marker account sits on which top-bar card, per side: the persona label equals the card name, else elimination (one card and one account left). A duplicate name, an unmatched persona and a bot stay unjoined.

**Pending alias**: An alias typed for a card whose account was unknown. By name, this session only (never saved or shared); binds to the account only within the map load it was typed in.

**Legacy alias**: A v1 name-keyed alias kept in `legacy`. It still applies by name and shows a one-click bind chip once the card's account is known.

**Roster**: The in-game names read from the stock cards, which fill the editor's alias rows.

**State**: The whole setup (`style`, event, stage, format, teams, organiser, info, graph, cues, buys, players, legacy, pending, dev). It is kept on the HUD root attribute `observer_hud_state`.

**Share code**: `OHC1.<fnv1a>.<base64url>` of `{ s: 1, state }` without `dev`, copied between observer PCs.

**Local save**: The state kept in Steam's CEF localStorage through the hpv2-store `/oh/` page.

**Store page**: The hosted page at `https://hantu-raya.github.io/hpv2-store/oh/`, reached by a hidden `CitadelHTMLPanel`.

**Record**: The saved text `OHS1.<fnv1a32>.<{s:1,state}>`. Phases: hello, read, ready, blocked, unavailable.

**Reset page / Reset all**: Footer buttons that each need a second press within 4 s.

## Engineering terms

**Write-on-change**: Every style, text, class and hero write is checked against a cache first. Steady state makes no writes.

**Op budget**: Synthetic native calls per second in the validator: 1300 while spectating, 15 when not.

**Output contract**: The strings a Closure-minified script must still contain (`Get-HpColorsRewriteClosureContract` in `scripts/hp-colors-rewrite-closure.ps1`).
