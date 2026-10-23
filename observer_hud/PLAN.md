# Plan: design 11 (Base Game+) in Panorama

Status: 2026-10-22, **v1 built and live-tested on demo 121685912 (phases 2-5 and 7 done, except publishing)**. Decided by the user: injection from one host layout (B), session state plus share codes first (no store page in v1), and the agent builds and runs the live spike itself. Spike source: `spike/` (throwaway). The mockup is `designs/d11-base-game.html`.

**Spike done (2026-10-22, client 6812): injection works live alongside pak02/pak03/pak89; B stands.** Results, geometry and the rules the build must follow are in `decisions/spike-injection.md`. **Spike 1b done the same day: `citadel_status_effect.xml` works as the world-side host (once per healthbar, hero detection after a delay, relay messages reach the HUD); fallback not needed.** Test source from now on: demo 121685912 (plays on 6812).

**v1 done the same day.** Source in `panorama/`, build `build_observer_hud.ps1` (pak10), validator `scripts/validate-observer-hud.js` (21 end-to-end VM checks), module guide `AGENTS.md`. Live on demo 121685912 at 1920x1080 and 1728x1080 (screens in `shots/live/`): bar, plates, logo, bans, stage/format/event, aliases, editor and hero picker, and the status column (Nurse fear with countdown, Dynamo's pull, Hyperline and Abrams stuns sent and drawn). Not done: the GameBanana page and archive upload (needs the user's go-ahead), the column in the HTML mockup, and a live check with HP Colors v3 installed (the VM covers its Escape menu).

**v2 design round started 2026-10-22** (user: "make a version 2", with the Night Shift and Death Slam bars as examples). Round 4 mockups in `designs/` (12 Night Desk, 13 Slam Rail, 14 Base Game+ Names; shared kit `designs/shared/v2.css`, `v2.js`): a header band over the stock bar, which moves down; player names in a row over the cards; an organiser wordmark or logo in the centre; on 12 an optional info card. Stream-overlay content in the examples (sub alerts) is not in-game data and is out of scope. The user first revised 14 (no event title under the stage; each team's bans beside the clock, `designs/d14-base-names.html` rev 2), then **picked 12 · Night Desk** with design 5's soul lead graph added (`designs/d12-night-desk.html` rev 2): one pin per 5:00 of game time, shown at each 5:00 mark for 30 s (editor: off, 15/30/60 s, always), in the gap between the teams under the soul plates. Rev 3 ("minimal like Brass Slate", the line graph kept over design 6's bars): design 6's lacquer, one brass hairline and Reaver names, team colour only on the card underline, logo ring, series digits and pins; 56 px band; info card off by default. Rev 3b: the graph has no soul value per pin and no 5m time labels; the header's current lead is its only number. Rev 3c: design 5's team-colour fill (amber above zero, sapphire below), drawn as 2 px columns because Panorama has no polygon fill. In game the pins come from sampling the stock team soul labels at each mark, so history starts when the observer starts watching (a demo seek or late join leaves earlier pins empty). **Decided 2026-10-22: v2 ships two looks, picked in the editor: 14 · Base Game+ Names (default) and 12 · Night Desk (rev 3c). v1's Base Game+ look is dropped** (its portrait aliases and the event title under the stage go; the plates stay in Base Game+ Names).

**v2 built 2026-10-22** (not yet live-tested): `band.xml`/`oh_band.css` (first child of `.HudCore`, `#TopBar` moved down 26/56 px), the bar's clock bans and graph, the names row in the band (portrait aliases removed), the soul lead sampler, and the editor's LOOK row (look, organiser name and logo) plus Night Desk rows (info card, graph time). State gains `style`, `org`, `info`, `graph`; share codes carry them. Validator: 23 checks (new: the looks, the graph); steady state 1259/s of 1300. **Live run the same day** (demo 121685912, 1920x1080; screens `shots/live/v2-*.png`): both looks render with the stock top bar moved down, names on the right cards, the organiser in the centre, clock bans, plates, corners and the info card; the soul lead graph recorded the 10:00 and 15:00 marks at 4x playback and read Friendly = Amber (88k vs 108k showed BRS +20.0k). Three fixes came out of it: the band moved from `.HudCore`'s first child to right after `#TopBar` (the stock top bar's glow washed it orange), its lacquer stops at the corner icons, and the band panel is 220 px tall so the info card has room; the right corner needed `horizontal-align: right`. Not checked live: the editor's LOOK row (the Esc key could not reach the game window this session; looks were switched with temporary default builds), aliases typed in the editor, and 16:10.

**v2.1 objective cues, built (2026-10-22).** First mock (a permanent four-cell panel) was "too big and jarring"; now small icon + time chips under the clock that appear only while an objective is close, the mid-boss / rejuvenator chip in the middle (user: it is the mid objective), all four the same width on a fixed pitch. Mockups `designs/d14-base-names.html`, `d12-night-desk.html` (Night Desk uses compact 40 px chips: the cards leave about 250 px). Runtime: `#OHCues` in `tournament_bar.xml`, `.OHCue*` in `oh_bar.css`, `sampleCues` in `oh_host.js`; VM check "cues:". Game rules from server.dll / client.dll disassembly, VData, ConVar defaults and a live demo probe: `decisions/objective-timers.md` (the rift's minimap warning shows 20 s before, not 60). Live check of the built pak on demo 121685912 passed for the rift (countdown, LIVE), urn, bridge buff UP and the held rejuvenator; the mid-boss respawn after its timer was not in the test demo.

## Goal

An observer-PC mod for community tournaments. **The core feature, and the reason the mod exists (user, 2026-10-22), is the ability status column:** debuffs, stuns and pulls, with their seconds, under each top-bar card. A spectator cannot otherwise see them; they are fed by world-healthbar sampling and the spectator VData, as in DLF. Being observer-only, and the VData that comes with that, is intended, not a cost to minimise.

Around it, design 11 dresses the stock spectator top bar for a tournament. The stock bar stays as it is, and the mod adds:

- a team plate at each outer end (logo or monogram, team name, series score);
- two hero bans under each plate;
- the stage ("GRAND FINAL") over a small format ("BO3") under the clock, with the event title below;
- each player's alias on their portrait, over the lower edge of the coin and above the soul tag;
- an editor in the Escape menu that changes all of the above live.

"Native" here means three things:

- every stock panel, binding and stylesheet stays engine-owned;
- the additions are stock widget types (`Label`, `Image`, `CitadelHeroImage`, `TextEntry`, `DropDown`) styled with stock values and stock fonts;
- the mod still works when another mod already replaces the top bar or the Escape menu.

## The main choice: how the additions get into the HUD

Every Panorama mod has to override at least one stock layout to load its script. Which layouts this mod overrides decides what it conflicts with. In this repo alone, 17 modules override `hud_escape_menu.xml`, 12 override `citadel_hud_top_bar.xml` and 8 override `citadel_hud_top_bar_player.xml`. Among them are HP Colors v3 (and its QOLLOCK and ShowRank variants), ShowRank, Top Bar Plus and DLF. When two paks override the same file, only one of them takes effect.

| | A. Override the three layouts (the DLF way) | B. Inject from one host layout (chosen; spike passed) |
|---|---|---|
| Stock files overridden | `citadel_hud_top_bar.xml`, `citadel_hud_top_bar_player.xml`, `hud_escape_menu.xml` | `hud_spectate_bar.xml` for the HUD parts. The status column adds `citadel_status_effect.xml` and the two spectator VData files (see "Ability status column"). |
| Conflicts with | HP Colors v3/v2, ShowRank, Top Bar Plus, QOLLOCK, Poker, DLF | DLF and the original Deadlock Observer Mod (both restyle the spectate bar; neither would run beside this mod anyway). Through the VData: the `abilities/` paks and Custom Passive. |
| Proven live | yes, in DLF | partly: `BLoadLayout` into created panels runs live in the DLF, HP Colors v3 and test_hpv2 relays. Loading visible UI into another layout's panels is unproven. |
| Escape-key handling | XML `oncancel` hook can close the editor first | the editor cannot hook `oncancel` without replacing another mod's handler, so Esc closes the whole menu. Edits are already applied, so nothing is lost. |
| Upkeep after a Deadlock patch | rebase three stock files | rebase one small file; the rest finds stock panels by id |

How B works:
- **Host:** `hud_spectate_bar.xml` is a small stock layout with no script. No module in this repo overrides it. It is part of the stock `hud.xml` (`<CitadelHudSpectateBar id="spectate_bar">`); it loads at UI start and runs in every mode (spike). The override keeps it stock and adds one stylesheet and one script.
- **Injection:** the script finds the HUD root and loads the mod's own layouts into the stock panels:
  - `observer_hud/tournament_bar.xml` into `#TopBar`;
  - one `observer_hud/alias.xml` into each player card;
  - `observer_hud/editor.xml` plus one menu button into `#EscapeMenu`.

  These files have names no other mod uses, so they cannot collide. Each brings its own stylesheet; a stylesheet only reaches the panels of its own layout file (DLF finding).
- **Gating:** descendant selectors match classes on the HUD root across layout files (stock `citadel_hud_top_bar.css` uses `.spec_mode CitadelHudTopBar`). So `.spec_mode`, `.TeamSpectator` and `.replay_playback` gate the additions in CSS, and the script idles outside spectating.
- **Spectate-bar text:** the host's stylesheet moves the stock "SPECTATING <name>" block (`#spectate_target`, top right in client 6812) below the right plate, as DLF does under its banner (spike: `margin-top: 130px`).
- **Width:** `#TopBar` is `width: fit-children` and clips its children, so the injected bar sets its own width to the HUD width; the stock teams stay where they were (spike).

B is the more native result, because the mod sits beside other HUD mods instead of replacing them. The spike confirmed it live (`decisions/spike-injection.md`).

## Element mapping

| Mockup part | In game | Source of truth |
|---|---|---|
| Stock top bar (cards, souls, health, ultimate, clock, soul plates) | untouched stock panels | the engine |
| Team plate (logo, name, series) | `Panel` with `Image` (web logo, shown only after its `ImageLoaded`), monogram `Label` fallback, two `Label`s | editor state |
| Bans | `CitadelHeroImage heroimagestyle="small"` + `SetHeroID` (DLF, live 2026-10-13) | editor state |
| Stage / format / event | three `Label`s under the clock | editor state |
| Alias on portrait | one `Label` per card under `#HeroImageArea`. The default text `{s:player_name}` binds to the card's own dialog variable (bindings see ancestor variables), so it needs no script; the editor's alias replaces it. | card's `player_name` + editor state |
| Team colours | stock `.team1`/`.team2` or `.friend`/`.enemy` rules on the stock team panels; plates follow the team, not the side (DLF rule) | the engine |
| Ability status column | four static slots per card under the stock ultimate (38 px circles, 26 px ability icon, applier-team colour, stun ring, seconds or stack count; DLF `design.md` "Top-bar card") | world-healthbar status panels, made visible by the spectator VData |
| Editor | `TextEntry`, `DropDown` (hero list), `Button`s, in `#EscapeMenu` | editor state |

Placement: the plates and the clock stack are positioned from the stock panels they belong to (`#TeamFriendly`/`#TeamEnemy` outer edges, the `#GameTime` block) with `GetPositionWithinWindow()` and `actualuiscale_x`, the method DLF uses for its name labels. Fixed coordinates drifted in DLF when a short team packed toward the clock. Positions are written only when they change.

Styling: copy the stock values that the mockup's stylesheet already quotes (sizes, fonts, colours) into the mod's stylesheets. Do not reuse stock class names on the mod's panels. A replaced `citadel_hud_top_bar.css` (QOLLOCK) would then restyle the plates in unknown ways. The fonts (Retail Demo, Reaver, VALVE Oracle) ship with Deadlock, so unlike DLF there is nothing to install.

## Ability status column (spectator VData)

This is DLF's top-bar debuff column, kept with its behaviour. It has three parts, and each needs a host that fits approach B.

1. **Spectator VData** (`scripts/abilities.vdata_c`, `scripts/modifiers.vdata_c`). Many ability modifiers are hidden or caster-only in stock data, so a spectator's world healthbars never show them. The build takes both files from the installed game. It applies the spec, setting `m_bIsHidden false`, `m_bIsHiddenOverhead false`, `OVERHEAD_DRAW_FOR_EVERYONE` and the hook-target client class swap, then compiles and verifies them. Whole VData files cannot be injected; overriding them is the only route. This is DLF's exact pipeline (`Export-VData`, `strip_red2.py`, `spectator_status.py`, `inject_stock_external_refs.py`).
   - The spec is one source of truth: use `dlf/spectator-status.json` and `dlf/scripts/spectator_status.py` directly (they describe game data, not DLF branding). Give the script a spec-path argument if the lists ever need to differ.
   - **Ships inside the one HUD pak** (user decision, 2026-10-22: one pak). What that means for the release:
     - The pak must be rebuilt and re-released after every Deadlock patch that touches abilities or modifiers. A renamed ability fails the build, and an old pak on a new game build shows stale VData.
     - It replaces the same files as the `abilities/` paks and Custom Passive. Whichever has the lower pak number wins those two files.
     - The hook-target class swap means a hooked victim is not pulled on the observer's screen.
     - The pak is for observer PCs only. Playing a match with it installed would run modified, possibly stale VData on the client. The release notes and the GameBanana page must say so plainly.
2. **World-side sampler** (DLF `dlf_debuff_world.js` + `dlf_debuff_relay.js`). It reads `#StatusEffectContainer` on each hero's world healthbar and sends snapshots to the HUD through a sibling relay (`ClientUI_FireOutput`). World healthbars are not under `CitadelHudRoot`, so the HUD host cannot reach them. Do not override `unit_status_overlay_v2.xml`, which HP Colors v2/v3 and test_hpv2 also replace. Host the sampler in **`citadel_status_effect.xml`** instead.
   - `CitadelStatusEffect` (`#StatusEffects`) loads that layout once per healthbar. Status panels are snippets of it, so a script there runs once per bar, not once per status.
   - Only DLF overrides this file in the repo, and DLF already puts its stun-hiding stylesheet there. Stylesheets reach only panels of their own layout file, so the stun-hiding rule (`.statusEffect.stunned { opacity: 0; width: 0px; … }`, scoped to world bars by an owned ancestor class) must live here anyway.
   - The HUD's own status list loads the same layout. The script must find its bar root, run only on hero world bars (`CLASS_PLAYER` ancestor), and idle elsewhere.
3. **Top-bar column** (DLF `dlf_debuffs.js`). It runs in the HUD host. It receives the snapshots and injects one slot layout per card, the same way as the alias (re-attached when a card is rebuilt). DLF's validation, staleness, replay and duplicate-name rules apply unchanged (`dlf/AGENTS.md` runtime rules), and so does its fade keyframe.

Behaviour stays DLF's:
- the spec list decides which abilities show; buffs show only where the spec says;
- `minStacks` applies (Djinn's Mark from 8 stacks);
- stuns are their own item, with the countdown from three steady radial samples;
- the steady-state op budget applies (column plus twelve world bars ≤ 1250 synthetic ops/s at the 0.25 s poll).

DLF's DEV settings (on/off, poll rate, status log) move into the editor's advanced section. They stay session-only, like the rest of the editor.

## Reuse from DLF (ported, DLF untouched)

DLF is a live-tested broadcast tool, so it is not refactored for this. These parts are ported into `observer_hud/panorama` under an `OH` prefix and narrowed to this schema:

- `dlf_state.js`: `normalize` (field-by-field fallback to defaults), `cleanUrl` (http/https only, no credentials, at most 512 characters, rejected rather than truncated), share codes (FNV-1a checksum + base64url), `hudAttrs` (one cached root and last value per HUD-root attribute);
- `dlf_banner.js`: logo loading (one `Image` per URL, swap on `ImageLoaded`, delete on failure, keep the monogram) and change-only writes;
- `dlf_menu.js`: editor structure, `ClientUI` cross-context publishing on a HUD-root attribute, and the store client (hidden `CitadelHTMLPanel`, hello → read → ready/blocked/unavailable, throttled writes);
- `refresh-stock.py`: stock pinning against GameTracking and the hero-table generator (`[m_HeroID, name]`, Hero Labs included), plus the ability-icon table (`dlf_debuff_icons.js`) and the status CSS-class table (`dlf_status_css.js`);
- `dlf_debuff_world.js`, `dlf_debuff_relay.js`, `dlf_debuffs.js`: the status sampler, relay and column, with the hosts changed as above (world: `citadel_status_effect.xml`; HUD: injected per card). The VData spec and transform are shared, not ported.

The Steam-account alias lookup is left for later (see "Later"). If both modules turn out to need the same changes, a shared core can be extracted then.

## State

```text
{ v: 1,
  event, stage, bestOf (1|3|5|7),
  amber/sapphire: { name, tag, logo: { url }, series, bans: [heroId, heroId] },
  aliases: { "<in-game name>": "<alias>" } }
```

- Limits: names 28 characters, tag 4, alias 24; series 0 up to the wins the format needs. Invalid fields fall back one by one; nothing is truncated silently.
- Aliases are keyed by in-game name for v1. A name that two players share shows the stock name on both cards.
- The editor publishes every edit on one HUD-root attribute (`observer_hud_state`). The bar re-reads it on a 1 s tick and writes only what changed.

## How it can fail (write before code; each needs a check)

1. The host layout does not load in a spectated match, a demo or a replay, or it loads before `#TopBar` and `#EscapeMenu` exist. Retry with backoff; log once.
2. A layout reload (`panorama_reload_layout`) runs the host twice. A generation token stops the old loop; no panel is injected twice.
3. The engine rebuilds a card's children and drops the alias label. Re-attach on the next tick; reuse a cached card only while its cached children are valid (DLF audit 2026-10-16).
4. Another mod's top bar lacks an id the plan relies on (`#TeamFriendly`, `#GameTime`, `#HeroImageArea`, `#EscapeMenu`). That part stays hidden and is logged once; the rest still works.
5. The plates overlap stock or other-mod panels at 16:10, 4:3 or 21:9. The HUD scales by height, so at 1920x1200 each outer end is about 234 px wide instead of 330. Shrink the font, then hide the logo, then cut with an ellipsis.
6. A web logo URL hangs, fails or is hostile. The monogram stays; the URL is validated and never logged.
7. Injected editor panels do not take keyboard focus inside `#EscapeMenu`, or the Esc key closes the menu with focus stuck.
8. Two edits race the store (edit during load, retry storms). The edit wins; one write in flight.
9. Steady-state cost: there is no work outside spectating, and no writes while nothing changes. Measure synthetic op counts per second against a budget (validator), as DLF does.
10. The status-effect host runs on every unit's bar (troopers, NPCs, the HUD's own list) and costs too much. It must decide in one check whether it is on a hero world bar, and back off otherwise (DLF: 1-16 s).
11. A `citadel_status_effect.xml` stylesheet or script error breaks every healthbar. A long selector once crashed the game at start (DLF `design.md`), so keep selectors short and the boot guarded.
12. The pak is from an older game build than the installed game. The build check fails before shipping on a renamed record; at runtime the column rejects unknown keys. The release notes name the game build each pak was made for.
13. Another installed pak also replaces `abilities.vdata_c` or `modifiers.vdata_c`. Only the lowest pak number wins those files, so the release notes say which slot this pak uses and what it overrides. If the other pak wins, the column only gets the statuses stock data draws; it must not show wrong ones.
14. A stock panel the HUD moves (the rift HUD, the objective health) chases a layout pass that lags and writes every tick, or stays moved after spectating; or the soul lead graph covers the objective health, or sits a whole stock panel lower while the rift HUD and an objective bar both show (design 19).
15. Purchase notices (DLF's QOLLOCK feature, rewritten): the stock shop list (`#RecentPurchasesContainer` in `#CitadelHudHeroShop`) stays empty while spectating or until the shop opens; a join, seek or map load refills it with old purchases and floods the cards; a notice lands on the wrong card (hero name in another language, sides swapped, a rebuilt card); polling the list costs native calls every tick or while not spectating; notices overlap the neighbouring cards or the status column, or pile up past three; another mod's shop override renames the list or its classes. Checks: the VM boots the pinned stock shop layout and its `RecentPurchase` snippet; old entries at first sight and purchases older than 10 s by the game clock never show; the card is matched by team and hero id (hero name as fallback), ambiguous matches draw nothing; the steady state reads one validity flag per poll below the stock 25-entry cap and nothing when not spectating; notices are as wide as a card and flow under the status column inside it.

## Phases

Each phase ends with its check passing. Launching Deadlock, publishing the store page and publishing the mod each need the user's go-ahead.

### 1. Spike: prove injection (done 2026-10-22, passed; `decisions/spike-injection.md`)

A throwaway pak with the host override and three test layouts. In a demo (`playdemo`, spectator view) at 1920x1080 and 1920x1200, check that:

- a panel loaded into `#TopBar` renders, its stylesheet applies, and `.replay_playback`/`.spec_mode` gating works;
- a label loaded into a card's `#HeroImageArea` shows that card's `{s:player_name}` and survives hero swaps and deaths;
- a button and a `TextEntry` loaded into `#EscapeMenu` take clicks and typing;
- all three come back exactly once after `panorama_reload_layout`;
- the same holds with HP Colors v3 (pak02) installed.

Also record the free space at both outer ends and under the clock in spectator mode, and where the stock spectate text sits.

Outcome: choose A or B and record why in `decisions/`.

### 1b. Spike: world-side host (done 2026-10-22, passed; `decisions/spike-injection.md`)

Add a script to `citadel_status_effect.xml` in the spike pak (stock file plus one script include). On a broadcast, check:
- that it runs once per world healthbar, and whether it also runs for the HUD's own list;
- that it can tell a hero bar from other bars;
- that a sibling-relay message reaches the HUD host;
- how many instances run and what they cost.

Pass: one hero-bar instance per visible hero and messages arriving in the HUD. Fallback if it fails: override `unit_status_overlay_v2.xml` as DLF does, and accept the HP Colors conflict for the column only.

### 2. Module skeleton and build (done 2026-10-22)

- `observer_hud/panorama/{layout,scripts,styles}` plus `observer_hud/stock-pin.json`.
- `build_observer_hud.ps1` on `scripts/source2_package_pipeline.ps1`: staging, Closure (ES2020, as DLF), compile, an exact VPK inventory (required and forbidden assets), release `.7z`, and an optional `-Install`.
- Pak slot: one unused in this repo (current users: 01-08, 80, 81, 86, 89, 96-99). Proposal: pak10.
- Generated hero table from the pinned `heroes.vdata` and English names.

### 3. Ability status column (done 2026-10-22; the mockup step was skipped: the look is DLF's, live-tested)

Port the sampler, relay and column onto the hosts from 1b. The wrapper builds the spectator VData into the same pak with DLF's VData pipeline from the shared spec. DLF's checks are ported: every spec record and marker exists exactly once, the packed VData is verified after packing, and the build fails on a renamed ability. Mockup: add the column under the ultimate to `designs/d11-base-game.html` first, so the look is agreed before code.

### 4. Tournament bar (done 2026-10-22)

Plates, logos, series, bans, and the stage/format/event stack. Measured placement, change-only writes, and the fit rules from failure 5.

### 4b. Aliases on portraits (done 2026-10-22)

Per-card label, default binding, editor override, re-attach rule (failure 3), duplicate-name rule.

### 5. Escape-menu editor (done 2026-10-22)

Fields as in the mockup editor (`shots/d11-base-game-editor.png`):
- match: event, stage, format;
- per team: name, tag, logo URL, series, two bans, aliases.

It adds share-code import and export, and validation messages taken from the mockup (logo "Not used: needs a plain http(s) address.", series capped by format).

### 6. Durable save (later; the user chose session plus share codes for v1)

A new page `hpv2-store/observer/` with its own key (`hantu.observer.v1/match`) and reply prefix. It never touches the HP Colors, Buff Timer or DLF keys. Until it is published, state lasts for the session and share codes carry it.

### 7. Verification and release (done 2026-10-22 except publishing)

- `node observer_hud/scripts/validate-observer-hud.js`, an end-to-end VM run. It boots the real host and the injected layouts inside the real stock `hud.xml`, top-bar and Escape-menu trees (pinned GameTracking copies), once more with HP Colors v3's Escape menu in place of stock, drives the editor, and runs the status sampler in real world-bar contexts feeding the injected column. It writes `.tmp/observer-hud-validate.json` with the failure-list checks and the op budget.
- Build wrapper run: exact pak inventory (Panorama assets plus `scripts/abilities.vdata_c` and `scripts/modifiers.vdata_c`), packed VData re-verified, and the installed pak hash matching the built one.
- Live smoke: demo 121685912 (`playdemo 121685912`, `demo_gototick 70000`) at 1600x900, 1920x1080 and 1728x1080, with a screenshot saved as an artifact. Steps: editor edits, logo load and failure, reload layout, ability statuses on the column (a stun, a pull, Djinn's Mark stacks) with the bundled VData, then the same with HP Colors v3 installed.
- The GameBanana page and archive come last, after the user's go-ahead.

## Later (not in v1)

- Aliases that follow the Steam account (DLF's PLAYERS-tab profile-card lookup), for names that change or repeat.
- An organiser preset file (`-MatchFile`, as DLF has) for building a pak with defaults baked in.
- The stage text in other languages.

- An Escape-menu **Watch tab**: live matches filtered to ranked and a chosen rank, click to spectate. The user asked for it, then preferred demo playback for now. Research: `api.deadlock-api.com/v1/matches/active` lists about 150 live matches with `match_mode` (4 = Ranked), `match_score`, `lobby_id` and spectator slots. Its `/v1/matches/{id}/live/url` gives the broadcast URL for `playcast`, but it is limited to 6 requests per hour per IP. The client has a native `CitadelWatchPage` with `CitadelWatchGotoMatch` and a GC `SpectateLobby` message, which may allow spectating by lobby without that limit (unverified). Panorama has no JSON fetch here; the list would come through a `CitadelHTMLPanel` page, as the DLF store does.

## Open decisions for the user

1. Pak slot: pak10 (one pak: Panorama + spectator VData; decided 2026-10-22, used by the build).
2. Publishing: the GameBanana page and the release archive (`dist/Observer_HUD_<yy.MM.dd>.7z`) wait for the user's go-ahead.
