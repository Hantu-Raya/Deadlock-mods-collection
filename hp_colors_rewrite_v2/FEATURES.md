# HP Colors Rewrite v2

## Goal

The rewrite owns the live v2 healthbar renderer, a send/read state module with durable local save, ESC editor adapters, live settings transfer, transient hero identity, scoped settings, and preset save/application.

The v2 overlay uses the stock tree with its CSS prefix rebased to Deadlock 2026-10-01 (build 6728, SteamTracking `573a4129`). It retains every engine-populated stock ID/class and adds only Rewrite-owned panels and script/style includes.

## Implemented feature set

### Healthbars and feedback

- Enemy-player fixed/gradient colors, team-high endpoints, visibility/layout, healing, damage-delta, shield color, and pulse.
- Enemy and friendly NPC gates and enemy/friendly building gates default off and work independently of player color toggles. Opted-in units reuse their relation palette and feedback, shared bar size/position, native HP text settings, and contained health lines; player-only extras stay off.
- Known neutral NPCs remain stock unless `npcNeutralEnabled` is on; that gate applies the fixed fill color, shared bar size/position, enemy HP text settings, and contained health lines. Bounty, tier art, and other stock indicators stay stock.
- Ghoul opacity is retired; legacy codec slots remain reserved and old values/rules are dropped on load and import.
- Unknown type/relation and contradictory enemy/friend ownership remain stock. Neutral facts take precedence over enemy/friend classes; team IDs alone never infer relation.
- SHOW BOUNDS at the bottom of the category rail outlines each customized healthbar canvas without shaking; it defaults off and stays on after closing the editor until toggled off or Deadlock restarts, never entering saves or presets or codes.

Surface ownership is kept in one renderer decision: `player` has relation settings and player extras; `unit` has gated non-player bar presentation and native HP text; `fill` has neutral fixed fill plus shared geometry and native HP text. Kill marker, pulse, level, ultimate, and stamina remain player-only.

Lane troopers are engine-drawn (not Panorama) and intentionally not customizable; the game's own Custom UI Colors setting is the only way to recolor them.

### HP readout and stock indicators

- HP text adopts the engine's existing `UnitHealthbarValue` into the counter row under the shared bar motion frame, preserving exact engine-updated text and locale grouping without reading or writing the number. No percent/custom counter or maximum exists; damage shake moves the bar, HP text and name together.
- Retired format slots remain decodable, but their enum rows are removed. Old percent/current saves load as native HP with a one-time menu note; other settings, scopes, conditions and presets survive.
- Enemy and neutral units use Players → HP Text → ENEMY; friendly units use Players → HP Text → ALLY when their UNITS gate is on. Enemy text off suppresses the number; ally text off returns its parent, styles and pulse classes fully to stock. Gate off restores stock presentation. Shield values are untouched.
- Native text keeps colors, fonts, size, position, and text outline; enemy pulse modifiers and enemy/ally HP-number pulse remain player-only. The level and kill marker are player-only. Contained lines cover every opted-in unit through the reversible `HPColorsRewriteBarLines` class, with enemy line visibility also covering enemy NPC/building bars. Gate-off or ownership release removes that class. Tall lines and the marker span the primary bar from top to bottom; short 8px ticks are contained and bottom-aligned.

### Stock appearance

GENERAL → Names & Labels shares CRITICAL LABEL and PLAYER NAMES between enemies and allies, independent of bar colors. Names gain independent enabled enemy/ally colors, shared 8–40px size and X/Y offsets on the same page. Name movement uses clamped `translate3d` without changing stock margins; reset releases geometry even before layout is measurable. Names are straight by default (Advanced NAME TILT rotates them −360…360°, positive clockwise, on the label itself), brightness 0.8 and spectator alpha retained; with BAR STYLE OLD, LIFT NAME ABOVE OLD BOXES (Advanced, shipped on, off for older saves) raises the name one 6px row (scaled by BAR HEIGHT) per extra 1,000 max HP up to the four-row grid; text and visibility stay engine-owned. Fitting names clamp at canvas edges. Critical-label hiding leaves native flashing and scaling unchanged. On customized player bars the CRITICAL and ASSASSINATE labels follow bar position and scale uniformly with bar size (margins plus `preTransformScale2d`; their stock wobble animation keeps `transform`). CRITICAL X/Y OFFSET and ASSASSINATE X/Y OFFSET (slots 70–73, CSS px, X ±200, Y ±210) move each label from that bar-following spot; the CRITICAL rows dim while CRITICAL LABEL is off. See `design.md`.

GENERAL → Basics offers OWN HUD HEALTH COLOR (OFF/TEAM/CUSTOM). OWN HUD CUSTOM COLOR collapses outside CUSTOM; Advanced can reveal its disabled value controls and usable condition action. While HPv2 is on, OFF (default) owns the local bottom-HUD `#health_and_abilities_container … #health_bar_Left` with the neutral stock fill texture (`healthbar_fill_texture_png`), `#FFFFFF` background, and explicit `washColor: "#FFFFFF"` for a plain white bar, overriding the stock team texture and healthMid yellow. Writing the white wash repaints immediately after TEAM/CUSTOM; clearing it alone waits for a health update. TEAM and CUSTOM use the same neutral texture and white background plus their wash color: TEAM uses team1 `#E7B659` / team2 `#5B79E6`; CUSTOM uses `hudHealthColor` (default `#FFFF00`). The menu owns only this fill's inline `backgroundImage`, `backgroundColor`, and `washColor`, not unit-status bars or other HUD layers. Master off, hydration pending, or unknown/conflicting team in TEAM mode releases all three properties with null to stock, including leftovers from a previous Escape-layout context when the new context's cache is empty. Cached references and replacement recovery reuse generation-guarded identity polling, without a new loop. Scopes, ability conditions, Undo, Reset Page, durable save, HPCR2 and HPCRP1 use existing state machinery. Legacy pak01 layouts boot without these optional rows. This appearance and release behavior still needs a fresh in-game check.

TEXT OUTLINE rows on Players → HP Text → ENEMY, Players → HP Text → ALLY, and General → Names & Labels independently set enemy HP, ally HP, and shared name outline widths from `0–10` in `0.5` steps. The default `5` leaves stock text-shadow strength untouched. Non-default HP outlines, including enemy pulse text, use `0px 0px 0px <w> #10130D`; names use `0px 0px 0px <w> #10130DEE`. Returning to default or releasing ownership restores the exact captured inline styling.

Unit-status healthbars are rectangular without the outer container background by default (including players, NPCs, buildings, shields, and previews), and always with the master toggle off. This intentional stock stylesheet deviation deletes three healthbar masks and nine container background-color declarations from the replacement stylesheet, removing six otherwise-empty relation rules. The black inner backing and all other stock declarations remain. GENERAL → Layout → BAR STYLE chooses V1 (default, plain rectangular bar), V2 (restores the three stock slanted masks through a CSS class) or OLD (a grid of 100-HP pips like the removed 2024 `Citadel_HealthPips` healthbars: 10 per row, rounded slate empty pips, fill pips in the bar's own color, first 100 HP bottom-left, rows growing up from the bar; past four rows the grid keeps four rows of height). OLD replaces the bar picture and kill marker; the engine damage/heal/shield layers are not drawn. It reads max HP from where the game draws its 250-HP health lines, never from the HP number; pips are laid out only when max HP changes and a health change touches only the pips it crosses. Below 250 HP, from 12,750 HP, or before layout is ready it shows the bar with 250-HP gaps instead and ignores line color and LINE OPACITY. Ungated units stay rectangular, and there is no inline mask write. The outer backgrounds stay deleted in every style. V2/OLD rendering, percentage separator positions and alignment with the fill are not yet confirmed in game.

GENERAL → Layout → BAR OUTLINE defaults on with a 1px rim at 100% opacity in the base game's per-relation colors (friend rgb(4,37,23), enemy/neutral offBlack, critical enemy rgb(47,4,4), team1/team2 dark), applied by CSS. CUSTOM OUTLINE COLOR (default off) switches hero bars to separate ENEMY/ALLY OUTLINE COLOR rows; NPC, neutral and building bars always keep the base-game colors. Toggles and colors are Basic; Advanced offers 0.5–10px thickness in 0.5px steps and 0–100% opacity. It covers heroes and UNITS-enabled NPC/neutral/objective primary healthbars, never the secondary shield bar. V1/V2 add a backer behind the unchanged health surface (slanted in V2); OLD draws a solid rim behind each fixed box; thick rims merge into one frame around the grid. The enemy kill marker also shows on OLD, as a tick inside the box that holds the threshold HP. Turning it off or releasing ownership hides the owned layers and restores the primary container mask. It supports existing scopes, conditions, presets, transfer, reset and Undo. Live appearance still requires an in-game check.

The label controls use existing session settings, scopes, ability conditions, presets, Reset Page, Undo, HPCR2 and HPCRP1. Defaults never force labels visible. Master-off, surface loss, replacement, retirement, and teardown release owned label classes and return label styling to stock. The owned HP readout is straight and grows from its HP TEXT ALIGN edge; see Milestone 7. `citadel_unit_status_show_critical_state` stays engine-owned.

Ultimate progress art matches the 6726 ready icon: a black disk with an open white eye and progress ring, dimmed beneath the radial-clipped bright fill.

### Editor and settings

- Twelve tabs on five ESC rails: General (Basics, Layout, Names & Labels), Players (Bars, HP Text, Alerts), Indicators (Lines & Level, Ultimate, Stamina, Pickups), Units (Types), Presets (Library). Players has a local ENEMY/ALLY selector, remembered across its three pages; it does not link their values. Every setting has one page owner; headings are not setting rows.
- Basic rows are on/off toggles, colors, color modes, fonts and visual styles; Advanced holds everything that moves, resizes or tunes numbers (offsets, sizes and scales, tilts, alignment, thresholds, speeds, intensities, widths, opacity/darkness, outline widths, anchoring). Advanced starts closed per settings page unless one of that page's Advanced values differs from both the shipped and the frozen sparse default, in which case the page opens with it shown on first entry; an explicit ADVANCED/HIDE ADVANCED click on a page is remembered only in this Escape context. Hidden settings still apply. Formerly dim-only followers collapse when irrelevant; Advanced exposes their disabled values and condition actions without bypassing existing feature/custom-palette gates. Custom HP text reveals a usable palette immediately. Own HUD is on Basics; shared thresholds are on Basics → Advanced; shared HP TEXT ALIGN — BOTH SIDES is on HP Text → Advanced. Layout owns bar size, BAR STYLE, DAMAGE SHAKE and SHAKE STRENGTH, position and accessory anchoring; all other offsets stay with their feature.
- Defaults expose 61 distinct setting rows across all pages/both sides, at most ten in a presentation (Players → Bars), with two on initial Basics. These source/VM control counts are not screenshots, height measurements or performance evidence. All 148 control rows remain reachable. Side/fold clicks change no settings, history, saving, effective publication or schedules. Four-rail old pak01 layouts retain explicit legacy navigation and the removal warning.
- Immediate application, confirmed page reset with guarded feedback, session Undo, Peek, native Citadel color picker, and HPCR2 live settings import/export.
- One canonical global base and one resolved effective snapshot.
- Automatic hero detection with lifecycle settling and stale-callback rejection. The editor has no hero-mode controls; detection always runs in Auto.
- The Preset Library manages durable All Heroes, Selected Heroes (Only These), and All Except snapshots, the hidden Rewrite Default fallback, and exact Selected → All Except → All Heroes → Rewrite Default routing.
- Create stores Current without applying; clicking a preset row applies it; **EDIT** loads a preset and opens its form, and **SAVE** replaces that preset with what is on screen. Rename (through the form name field), reorder, copy, import, delete, hide, and restore remain available.
- The footer **SAVE TO PRESET** button saves what is on screen into a saved preset without leaving the page: pick a preset (never Rewrite Default) or use **+ NEW PRESET (ALL HEROES)**. See Milestone 22.
- `HPCRP1` single-record and bundle copy/import use atomic validation and preserve fresh monotonic user IDs, canonical typed ability conditions, and repository-only effects.
- Durable ability signature-tier conditions for serializable settings, with row markers, ability-card tier cycling, typed override editors, base fallback, and changed-effective-only publication.

### Deliberately deferred

- Detached tooltips and a grouped two-axis position picker are intentionally omitted.
- Legacy v99 encoding, Anita tokens, aliases, bridge keys, and preset-store VPK compatibility.

## Milestone 1: healthbar observation

Implemented source files:

- `panorama/layout/unit_status_overlay_v2.xml` preserves the new static stock tree and four script includes. The primary `UnitHealthbar` is selected separately from the sibling `UnitShieldbar`.
- `panorama/scripts/unit_status_v2_colors.js` discovers the direct primary inner/fill, classifies unit kind separately from relation, and measures the full-canvas status frame with stock 79×18 outer / 69×12 inner healthbar leaves.

### Data path

The renderer samples each unit's local primary health layers, never the native current-HP label text. Primary inner width drives fill percentage, pulse overlay, and marker math; engine layer widths and secondary shield values remain untouched. Replacement or reparented panels increment the local generation and reset cached sampling/presentation state.

### Historical diagnostic evidence

The final pre-cleanup 2026-08-20 capture contained 1,946 transition-only per-bar data lines and no Rewrite exceptions. Those lines were measurement scaffolding and were removed from production after the health sampling and scan-path comparison.

## Milestone 2: ESC editor lifecycle

Implemented source files:

- `panorama/layout/hud_escape_menu.xml` preserves the stock ESC layout and adds the explicit `HP COLORS` row plus editor panels.
- `panorama/scripts/hp_colors_v2_contract.js` owns shipped defaults, frozen sparse/codec baselines, deterministic key order, types, enum options, numeric bounds, and normalization used by both the ESC state owner and isolated healthbar renderers.
- `panorama/scripts/hp_colors_v2_state.js` owns canonical values, effective resolution, scoped presets, repository policy, conditions, Undo, transactions, and runtime settling behind an immutable factory with `send()` and `read()`.
- `panorama/scripts/hp_colors_v2_menu.js` owns open, close, category/tab navigation, hold-to-peek, panel observation, scheduling, rendering, transport, config request answers, clipboard adapters, and the local bottom-HUD health wash.
- `panorama/styles/hp_colors_v2_menu.css` owns the Ritual Stripe presentation.

The v1 menu interactions are preserved by source parity. The user confirmed the restored v2 tabs and controls in game on 2026-10-01.

Menu startup resolves panels and creates controls before binding events or publishing settings. Missing controls and thrown creation errors leave startup available for an explicit retry. Repeated boot after success does not republish settings or start duplicate watches.

## Milestone 3: core healthbar customization

Implemented controls:

- Master customization is enabled by default; bypass preserves configured values.
- Fresh defaults use width 148%, height 80%, raw bar Y -38, enemy low `#FD4949`, ally low/mid/high `#FFEFD7`, Oracle HP font, stored enemy HP-text X/Y `18/14` (ally and enemy pulse `0/0`), HP TEXT ALIGN LEFT, accessory anchor on, raw ultimate/level X/Y `74/-29` (displayed `9.7%/-16.1%`), enemy pip color on with `#000000`, and Arrow stamina. The frozen stamina baseline is also Arrow; the ultimate/level Y change affects only shipped defaults, with no migration of saved/explicit values or change to their frozen sparse baseline.
- Shared width and height scaling in the measured native v2 frame.
- Enemy and ally enable/visibility controls.
- Fixed or legacy-compatible low/mid/high gradient color modes.
- Shared thresholds: low color holds through the low threshold, mid color is reached at the high threshold, and high color is reached at full health.
- Section reset and session-scoped Undo.

### Settings path

`hp_colors_v2_state.js` owns one versioned same-session state payload and returns declarative same-session replacement, effective publication, and clipboard effects. `hp_colors_v2_menu.js` executes those effects and renders the returned immutable view. Changed controls publish immediately only when resolved effective values differ. Isolated unit-status contexts cannot read the HUD root attribute and can start after the Escape menu, so each one without config asks for it: a small `HPV2_CONFIG_REQUEST` through its sibling relay, retried at 0.5, 1, 2, 4 and 8 s and then every 8 s until config arrives (three consecutive relay failures stop it). The menu answers with the current published payload at most once per 0.5 s window, also while the master switch is off, and not while saved settings are still hydrating (hydration publishes anyway). There is no periodic replay. Broadcasts and answers carry only values that differ from the shipped defaults; receivers refill the rest, and the root attribute keeps the full payload.

The renderer classifies unit kind separately from stock relation classes, with neutral-first relation precedence. When customization releases color ownership, it mirrors the current base-game `unit_status_v2.css` palette into inline properties because clearing inline colors did not reliably trigger stock selector repainting in the pre-port live checks. The constants cover stock fill/ultimate, healing, damage-delta, and primary bullet-shield colors; the stock rebase still needs its own live release check.


## Milestone 4: feedback and shield-indicator colors

Implemented controls:

- Separate enemy and ally healing-layer colors.
- Separate enemy and ally recent-damage delta colors.
- Separate enemy and ally shield-indicator colors.

The renderer uses cached primary-inner v2 panels. It changes healing and delta `washColor` plus primary bullet-shield and Rat King barrier (`unit_healthbar_ratking_armor`, enemy/ally slots 82–83, stock `#C7A674`) `backgroundColor`; the engine remains the sole owner of every layer's live width and timing. Disabled color ownership, neutral/other roles, and master bypass restore the mirrored stock colors. The separate shield bar, and deferred layer stay engine-owned.

## Milestone 5: native color picker

Every color swatch opens one reusable popup embedding the native `CitadelColorPicker` and its stock stylesheet. `CitadelColorPickerColorChanged(r,g,b)` accepts only RGB channels in `0–255`; strict editable `#RRGGBB` fields remain available. Opening seeds the native `HexValue` with `TextEntryChanged` while suppressing the seed event, so it does not count as an edit. Custom HSL sliders have been removed.

Picker changes preview live and create one Undo entry per picker session. Escape restores the value present when the picker opened; condition-editor color drafts stay isolated from live settings until applied. If the native panel is unavailable, the popup falls back to hex-only entry and emits one warning. Native picker behavior is covered by VM tests only; in-game confirmation is still pending.

## Milestone 6: target-aware controls, position, and ultimate icons

Implemented controls:

- Independent stock team-color endpoints for enemy and ally high health; unknown teams retain each relation's configured high color.
- Horizontal and vertical translation of the complete healthbar stack. The unit stays fixed. Level and ultimate indicator gaps follow the measured scaled bar; one shared toggle controls whether they also follow bar translation.
- Independent horizontal and vertical offsets for the level badge and ultimate icon. These offsets apply in both anchor modes.
- One shared ultimate-ready icon rule: Follow Bar uses each customized relation's final bar color; Custom applies one color to enemy and ally icons even when their bar-color toggle is off.

The ancestry pass classifies explicit building, player, and known NPC facts before relation, with neutral facts first. Level/marker/pulse/stamina/ultimate behavior is restricted to players; NPC/building palette gates remain independent of player gates. Opted-in NPCs/buildings and neutrals share bar geometry and native HP text without acquiring player accessories. Stock boss/building HP labels retain 70% UI scale; stock 180% boss/building and 80% neutral UnitStatus scaling composes with custom bar scale. Ghoul opacity has no renderer branch.

The v1 implementation passed its focused automated and in-game checks before this port. Rewrite v2 still requires its own fresh-restart in-game smoke before parity can be claimed.

### In-game smoke test

1. Build the source/package with `build_hp_colors_rewrite_v2.ps1 -SkipDeploy`. Deployment and addon replacement are separate actions; after an authorized replacement, fully restart Deadlock.
2. Inspect a player, neutral camp, trooper/trooper boss, midboss, and building. Record actual `WorldUIRoot` kind/relation/team classes and verify the static primary `UnitHealthbar` and separate shield branch.
3. With NPC, neutral, and building gates off, apply extreme player layout/color settings: non-player bars, bounty/tier art, stock indicators, and the secondary shield must remain stock.
4. Enable each NPC/building gate independently and verify only its explicit type/relation changes; check its relation palette, shared size/position, native HP text, and contained lines without player-only accessories. Enable the neutral gate and verify fixed fill, shared geometry, enemy HP text settings, and contained lines while bounty, tier art, and other stock indicators remain stock. Turn each gate off and confirm restoration. Confirm imported legacy ghoul opacity values never affect rendering.
5. Compare native enemy/ally HP at 0, 999, 1,000, 2,990 and 10,000, including same-fill number changes, all fonts, colors, offsets, outlines, player pulse modifiers, master-off and ally-off restoration. Repeat relation HP-text checks on opted-in NPCs/buildings and neutrals, including stock boss/building label scale and neutral/boss bar scale. Check that only the original engine label updates and no shield label is adopted.
6. Check fixed/gradient thresholds, team endpoints, visibility, healing, delta, bullet shield, deferred/lagging damage, armor, pulses, and the new stock critical/assassinate/unkillable/rejuvenator/kill-streak indicators.
7. At width 60/100/230/400%, height 60/100/160/400%, position extrema, and supported UI scales, verify measured origins, left-edge gaps, counter/indicator alignment, and an 18% marker clamped to the inner health interval. Check HP TEXT ALIGN LEFT/CENTER/RIGHT and NAME ALIGN growth directions plus the bar-relative vertical anchor described in `design.md`; exercise stored X `±334` and Y `±350`, normal/pulse HP text, and ultimate/level percentage controls. Offsets must scale once per bar axis; fitting rows must stop at visible edges without rewriting saved values. Cross `999↔1,000` and `2,990→10,000` at unchanged fill: with LEFT (the default) the right edge and the gap to the name must not move, and no frame may jump. Test all shipped fonts/minimum and maximum sizes, and inspect measured row/root bounds. Check the new defaults and old-data migration separately; record fresh-restart visual evidence separately from VM/build results.
8. Verify enemy-player-only level tiers, marker, ultimate wash/timer priority, and stamina. Inspect both the level rim **and engine-bound number**, especially transitions through levels 19 and 27; levels off/on and master off/on must collapse/restore the parent while leaving the label's text engine-owned. Default stamina is Arrow; exercise its native texture, Circle, and Box with custom size/color and depleted pips. NPC/building opt-ins must not acquire player accessories.
9. Exercise late spawn, death/respawn, shield-only/midboss contexts, reparent/replacement/removal, spectator state, and reused panels. Open the stock healthbar preview and verify no Rewrite geometry, overlays, or palette leaks. Open the editor and test Units native picker/hex controls, seeding without an edit, one Undo per picker session, Escape restoration, isolated condition drafts, scoped reset/Undo, transfer compatibility, and Escape lifecycle.
10. Exercise General → Names & Labels on enemy/ally players at normal and critical HP, with the critical-state convar on/off and in-eye spectator names suppressed. With BAR MASK NONE verify rectangular low/full-HP edges, pips, and fill on players, NPCs, buildings, shields, and previews, including master-off and supported UI scales; with V2 verify the stock slanted shape on customized bars; with OLD verify the pip grid at roughly 800, 2,100 and 4,100 max HP, its count after buying HP items, partial last pips, fill color in fixed/gradient modes, overlap with names and HP text, and readability at range; check rectangular ungated units and master-off, and clean switches between V2, V1 and OLD. Label defaults must return control to stock; label hiding must preserve critical motion and flashing.
   Check TEXT OUTLINE at `0`, `5`, and `10` for enemy normal/pulse HP, ally HP, and names. Default, master-off, ally-off, replacement, and ownership release must restore exact prior inline shadows.
   Check LINE OPACITY at `0`, `50`, and `100` with custom line colors on/off, including lines the engine creates after settings apply. Gate-off, master-off, replacement, and ownership release must restore container opacity and stock line presentation.
   Check OWN HUD HEALTH COLOR in OFF, TEAM on both teams, and CUSTOM; custom inputs collapse outside CUSTOM, with Advanced revealing disabled values and an accessible condition action. Only the local bottom-HUD left health fill may change. Verify OFF is plain white with the neutral stock fill texture and white background, while TEAM/CUSTOM add their wash to the same base. Master off, hydration pending, or unknown/conflicting team in TEAM mode must release all three inline properties to stock, including leftovers from a previous Escape context. Exercise HUD replacement recovery, scopes, conditions, Undo/reset, save/restart and HPCR2/HPCRP1 round trips. Legacy pak01 must boot without the rows.
11. Test ENEMY/ALLY switching, per-page Advanced, automatic follower/palette reveal and empty-section collapse. With different enemy/ally values and hidden conditions, cancel/confirm Reset Page and Undo; verify both sides, shared HP alignment and unrelated-page preservation. Try dirty typed entries, native picker edits and isolated condition drafts before side/fold changes and parent-off transitions; keyboard/controller focus must never remain in a hidden group. Confirm single-tab Units/Presets hides the strip, old four-rail pak01 boots, and canonical-derived QOLLOCK/ShowRank/Third Eye builds contain the new editor. Check supported UI scales, 16:9/ultrawide, scroller reset and last-row/footer clearance.
12. Record screenshots/debugger facts and console evidence. Automated tests do not establish visual rendering, exact maximum HP, precise line settings, or frame cost/FPS.

## Milestone 7: HP readout

Implemented controls:

- Show or hide the enemy HP number.
- The engine current HP number only; legacy format values are recognized and discarded.
- Font chooser with Default (`Retail Demo, Noto Sans, sans-serif`), Oracle (`VALVEOracle, Reaver, sans-serif`), and Pulp (`VALVEPulp, Noto Sans, sans-serif`). Runtime writes the expanded families because stock `sans`, `oracle`, and `block` are compile-time CSS aliases.
- Text size plus stored horizontal (`-334...334`) and vertical (`-350...350`) readout offsets. Enemy normal defaults are `18/14`, ally `0/0`, and enemy pulse modifiers `0/0`. These six keys store CSS pixels at 100% bar size; rendering multiplies X by width scale and Y by height scale. The menu displays and accepts percentages of the frozen 76×18 editor baseline, rounding back to integer stored units. Clipping changes only the rendered position, not the requested value.
- HP TEXT ALIGN (shared `hpTextAlign`, slot 69, default LEFT) on PLAYERS → HP Text → Advanced chooses which way enemy, ally and enemy pulse HP numbers grow from their offset point: LEFT grows left, CENTER both ways, RIGHT right. LEFT matches the earlier right-anchored placement. The row is aligned natively, so digit changes reflow without a style write; only the canvas clamp reads its width. The row is enabled while either relation's HP text is on.
- NAME ALIGN (shared `nameAlign`, slot 68, default CENTER) chooses which way enemy and ally player names grow from canvas center plus NAME X OFFSET, never snapping to bar edges. LEFT grows left (right edge fixed), RIGHT grows right (left edge fixed); CENTER keeps the existing centering. Y offset and canvas clamps are unchanged; layout-measured name width is used only for the clamp, deferring invalid measurements with the last valid dimensions. CENTER with zero offsets and no other name customization leaves the name stock. Both keys participate in scopes, conditions, Undo, presets, saves, and codes. Names & Labels resets name alignment; HP Text resets shared HP alignment. Legacy layouts may omit the rows.
- Bar-derived or custom low/mid/high text colors. Bar Color inherits the enemy bar's Fixed/Gradient mode and shared thresholds. Custom enables its own Fixed/Gradient choice. The always-editable shared threshold pair lives under General → Basics → Advanced and also drives ally bars and custom HP text. Labels are tinted through `washColor`, matching the bar and legacy rendering path without replacing their base `color`.
- `readoutMaxTeamColor` and `allyReadoutMaxTeamColor` are retired: codec slots remain tombstones, while values, rules, and ownership keys are dropped on load/import.

Native HP uses the full-canvas counter container under full-canvas `HPV2MotionFrame`, shared with UnitStatus and the name anchor. XML leaves `UnitHealthbarValue` in InfoHealthContainer for the engine to cache it; runtime adopts that same panel. The label-local engine binding does not update replacement `{d:health}` labels, so no custom bound label is created.

The full-canvas frame holds a fit-children HP row anchored beside the untransformed primary bar, with native bar translation and bar-scaled text offsets. The vertical anchor follows the bar center independently of accessory anchoring. `design.md` defines measured/fallback anchors and edge clamps. Digit/font reflow happens in layout from the aligned edge; text clips without ellipsis or font shrink. Zero/invalid measurements defer. Oversized rows cannot fit; fresh-restart visual checks remain required.

Compatibility uses offset version 2; exports carry `hpv2` version 2 and durable saves use schema 4. A withdrawn test build wrote `hpv2` v:3 and schema 5 for centered HP text; those still load as version 2 without conversion and are never written. `design.md` defines the one-time absolute-to-relative migration. Sparse saves and wire pairs retain their frozen baselines, not new shipped defaults. The web preset builder still accepts only `hpv2` version 1 and fewer extension slots, so current exports remain incompatible.

The player name is drawn level (no stock `-4deg` tilt).

The engine renders current HP itself through `UnitHealthbarValue`; Rewrite never parses or writes it. Percent/custom counters and maximum paths have been removed. `precisePipsEnabled` is retired with only its codec tombstone retained; no line-count health inference exists.

Focused VM regressions cover exact native-label ownership/restoration, retired percent/current import, no text access, visibility, colors, pulse, unchanged-fill locale changes, replacement and replay.

## Milestone 8: health pips, enemy levels, and low-HP effects

Implemented controls:

- Enemy pip-line visibility controls the stock `UnitHealthbarLines` panel for enemy players and opted-in enemy NPCs/buildings. The engine still owns generated line positions.
- Independent enemy/ally health-line colors: enemy defaults on with `#000000`, ally off with stored `#042517`. Shared LINE OPACITY (`pipOpacity`) defaults to 100% and accepts `0–100`; it sets `#UnitHealthbarLines` container opacity to `pipOpacity / 100`, multiplying stock child opacity (enemy 0.6, ally/neutral 0.8) so engine-created lines fade too. Matching players and opted-in NPCs/buildings/neutrals use opacity with or without custom color; custom color stays a per-line wash. Disabling custom color restores stock washes without disabling shared opacity; spectator team washes remain untouched. Colors and opacity support conditions, scopes, presets, transfer, and durable save.
- `precisePipsEnabled` values, conditions, and ownership keys are dropped on load/import while its wire slot stays reserved. The static tree has no verified max-HP binding, and current line panels are not a max source; no precise-pip calculation or manual ConVar copy instructions are advertised.
- Enemy-player level visibility with engine-bound level text and custom tier boundaries at levels 11, 19, 27, and 35.
- Level tier recoloring writes the complete `border: 2px solid <tier>` rather than only the color alias, fixing the rim path that produced solid discs at levels 19/27 and above. Fresh in-game confirmation remains pending.
- Enemy low-HP pulse with an inclusive threshold, 30–300 BPM speed, three intensity levels, optional fixed/gradient pulse color, and temporary non-culling bar hiding. HP-number pulse animation is independent of Enemy Bar Colors; two independent toggles control text animation and pulse-time text modifiers. The modifier toggle enables independent text size plus horizontal and vertical offsets while the pulse is active, restoring normal geometry above the threshold; it does not enable text animation. Normal brightness pulse targets only `unit_healthbar_lagging`; custom Gradient keeps the base fill color and CSS-pulses a custom-color overlay across the live fill width, independent of health depth.
- Ally low-HP pulse with an independent threshold, speed, intensity, optional fixed color, and optional native HP-number animation (`allyPulseReadout`), independent of Ally Bar Colors and requiring ally HP text enabled.

Pulse animation is CSS-driven. BPM alone controls duration. Custom-gradient intensity changes both opacity endpoints—Subtle `0.15→0.45`, Medium `0.10→0.75`, and Intense `0→1`—so lower levels no longer converge on full custom-color replacement. The existing paint loop changes namespaced classes, duration, and the owned custom-color overlay only when pulse state, health width, or configuration changes; it does not animate brightness in JavaScript. Bypass, role changes, exclusions, removal, and panel replacement clear rewrite-owned pulse and level state so stock styling resumes. A dirty bar that becomes neutral or otherwise leaves rewrite color ownership executes that cleanup immediately without waiting for another configuration refresh, covering recycled world-panel contexts.

The new stock tree has `UnitHealthbarLines` but no `unit_healthbar_pip_label`, and it has no engine level subtree. Rewrite adds only the minimal circular `LevelContainer` with engine-bound `{i:player_level}` text. Its parent alone owns collapse: enemy-player eligibility, enabled levels, and a resolved numeric level are required; the child label has no independent collapse and no Rewrite text writes. Friendly-player levels intentionally remain stock. Its full-canvas stock-position baseline is immediately left of the ultimate icon (`margin-left: 27px`, `margin-top: 67.5px` at 200×210); zero level offsets preserve that baseline. Stock defaults were confirmed in game on 2026-10-01. It never creates the obsolete `healthpips`/`pip_image` path.

## Milestone 9: enemy-player kill marker

Implemented controls:

- Enable or disable the static enemy-player kill marker.
- Place the marker at a canonical `5%–80%` health threshold.
- Set marker width from `1px–100px` and choose an independent color.

The marker is a passive overlay directly under primary `#UnitHealthbar`; the secondary shield branch has no marker. Runtime shows it only on a visible enemy player when the enemy relation gate allows it. Its threshold is clamped within the measured primary inner interval, including the inner X inset; the legacy width uses the unverified native display-unit mapping and is clamped to at least one native pixel.


## Milestone 10: rewrite-native live transfer

The editor copies a compact single-line `HPCR2` code containing legacy `v` value pairs and `c` conditions plus an `hpv2` extension with version `3`, extension `values`, and extension `conditions`. Copy Settings includes every current setting and condition, including stamina, accessory placement, and pickup/ultimate timers. Sparse pairs omit frozen codec/extension defaults, not new shipped defaults; an empty extension resets a destination's V2 settings to that frozen baseline. Version 1 and 2 imports remain accepted with one-time HP-text offset migration. Historical array-only and `{v,c}` inputs remain accepted and preserve destination V2 settings and conditions they never contained. Invalid values, duplicate or unknown slots, malformed extensions, and invalid conditions reject the whole import before mutation. Valid imports replace the editable snapshot atomically and remain undoable. The web preset builder still accepts only version 1 and fewer extension slots; it cannot import current exports.

## Milestone 11: hero identity and match lifecycle

The editor owns transient hero identity separately from the canonical healthbar settings snapshot. Detection is automatic: the editor reads the generated `CitadelHudTopBarPlayer.LocalPlayer` card, resolves its `.HeroName` through an exact English retail-name table, and exposes the resulting stable `hero_*` key only after two matching active-match samples. Blank, placeholder, fuzzy, and unmapped names remain unknown. The state module still accepts manual-override and off intents as an API, but the editor exposes no control for them, so a session always runs in Auto.

The lifecycle watcher classifies lobby/pregame, Hideout, active match, post-match, and transitional states from current HUD classes plus a parseable live topbar clock. It clears detected identity and panel caches on lifecycle changes, rediscovers replaced local-player cards and stale clocks, polls at one second while active or transitioning and five seconds in lobby/Hideout/post-match, and rejects stale scheduled callbacks by generation. Identity mode and any manual choice are session-only metadata: they do not alter `DEFAULTS`, HPCR2, Undo, the root settings snapshot, or unit-status publications.

Stable Auto observations now avoid state churn without weakening detection. Once a retail name matches the settled hero and no preset is waiting, the state module returns a no-op; repeated unknown samples cap after the required two observations. During active matches the watcher still reads the live label every second, so hero changes retain the same two-sample settling and epoch guards.

The Hideout (`connectedToHideout`) is its own `hideout` phase, polled every five seconds like lobby. Detection deliberately does not identify heroes there; the visible HERO label reads `HERO: UNKNOWN · HIDEOUT`. Entering it releases any held cold-boot snapshot and applies the first All Heroes preset. Without one, a hero-specific Current falls back to Rewrite Default; other Current settings stay unchanged. Pregame lobby keeps the last route. As with a hero swap, unsaved tweaks to a hero-specific Current are replaced; EDIT the preset and SAVE to keep them.

## Milestone 12: hero scopes and effective settings

The menu keeps the canonical global base separate from durable Current scopes and preset records. Scopes support **Off**, **All Heroes**, **Selected Heroes (Only These)**, and **All Except**. Hero keys are catalogue-validated, deduplicated, and ordered; empty Selected becomes Off and empty All Except becomes All Heroes. Automatic routing prefers the first matching Selected preset, a still-fitting Current, the first matching All Except preset, the first All Heroes preset, then Rewrite Default. Unknown identity never selects Selected or All Except.

The catalogue includes 44 heroes, adding the prerelease game-data entries Baba (`hero_baba`), Deadman Danny (`hero_deadpack`), Nurse Harrow (`hero_nurse`), Rat King (`hero_ratking`), Solomon (`hero_chessmaster`), and Violet (`hero_artist`). Exact-name Auto detection and the searchable picker use these entries. HPCRP1 stores hero string keys, so no encoding change is needed. Existing All Except lists do not automatically skip newly added heroes; the web builder catalogue still lacks these six.

Only the resolved effective snapshot enters the root config attribute, `ClientUI_FireOutput` broadcasts and request answers. Changes that leave effective values unchanged do not increment revision or dispatch config. Current exposes All Heroes, Only These, and All Except with a searchable hero picker. Hero presets retain their own override keys and layer on the first All Heroes preset or the hidden canonical Rewrite Default; see Milestone 13.

### Verified in-game

The deployed 2026-08-14 build was user-smoke-tested after restart. Hero scopes, effective-setting transitions, fallback behavior, and the optimized transition-only healthbar telemetry worked without reported regressions.

## Milestone 13: preset records and application

The rewrite-native repository keeps stable baked and user records beside the canonical base and ordered Current scopes. `baked_default` / **Rewrite Default** represents shipped `DEFAULTS`; records retain their settings, scope, selected heroes, conditions, and stable IDs.

The **Presets → Library** page separates snapshot creation, application, and updating. **Create Preset** stores Current plus its scope without applying it. Clicking a preset row (name, scope, or status) applies it; the ▲ ▼, COPY, EDIT, and DELETE/HIDE buttons are separate targets that never apply. **EDIT** applies the preset first (skipped when it is already ACTIVE) so Current carries its values and APPLIES TO scope, then opens the form with the row marked **EDITING**; that row ignores body clicks and has no EDIT button. **SAVE** replaces the record with what is on screen and applies it; when APPLIES TO differs from the saved scope, the scope summary reads `OLD → NEW` and the button reads **SAVE AS ALL HEROES / ONLY THESE / ALL EXCEPT**. **CLOSE** only closes the form; the screen keeps its changes and **UNDO** stays visible on this page to step them back. Applying or editing another row closes or retargets the form so SAVE never writes into the previous target. Baked records are immutable and can only be applied, copied, or hidden.

A row click loads a preset into Current and publishes it immediately, even when hero identity is unknown or differs. Controls edit the Current working copy; the source record stays unchanged until **SAVE**. When no saved preset is ACTIVE (the screen holds values no preset has) or the form holds an unsaved name, a row click or EDIT first swaps that row into a `REPLACE UNSAVED CHANGES?` CONFIRM / CANCEL prompt. ACTIVE marks the first preset equal to what is on screen; without a Current row that includes an All Heroes preset equal to the base, not only Rewrite Default, and selection never hides it. The ACTIVE row carries a green fill and left bar, the EDITING row an amber left bar. Legacy user Global records normalize to All Heroes without applying or publishing.

Automatic routing, only when a hero is known, chooses the first Selected Heroes (Only These) preset listing the hero, otherwise the first **All Except** preset that does not skip the hero, otherwise the first All Heroes preset, otherwise **Rewrite Default**; "first" is library order. An All Except preset stores its skipped hero keys (catalogue-validated, deduplicated, catalogue order); an empty skip list becomes All Heroes, and skipping every hero is valid but never auto-picked. Unknown heroes never match Selected or All Except, and in Hideout an All Except Current falls back like a Selected Current. Routing preserves edited Current while the resolved preset's stable source ID remains the same (or while a Selected/All Except Current still covers the hero and no Selected preset matches), and publishes only when effective values change. Saved-state envelopes use schema 4; schemas 1–3 and the withdrawn schema 5 remain readable and newer unsupported schemas are never overwritten.

Hero presets (Only These and All Except) layer on a Base: the first All Heroes preset in library order, otherwise Rewrite Default. Each hero record keeps its full `values` snapshot plus `own`, the setting keys it changes (contract order); applying or routing to it sets Current to the Base with those keys overridden, and ACTIVE/no-op checks compare against that resolved result. Update/Create of a hero preset stores `own` as the keys where Current differs from the Base; older saves and codes without `own` derive it on load/import. When the Base changes (All Heroes update/create, delete, reorder, import), an unedited hero Current refreshes once without an Undo entry; an edited one is left alone. While Current is hero-scoped, Reset Page returns the tab to Base values; the scope help line and the preset feedback say that only changed settings are saved. `HPCRP1` codes carry `own`; a non-array `own` rejects the import.

Old explicit-`own` hero presets without an All Heroes Base pin the changed frozen fallback keys during migration, so switching the shipped Rewrite Default does not change their look. Layered Reset-to-Base is unchanged; without a Base, RESET uses the new shipped defaults.

## Milestone 14: preset repository management

The repository retains the next user ID, baked display-name overrides, hidden baked IDs, and an inert selected record. Allocation never reuses a deleted `user_####` ID; invalid baked IDs and selected references are discarded during normalization.

User presets can be renamed through the form name field, reordered, copied, and deleted after confirmation; inline row renaming is gone. Baked presets keep fixed identity and order; rename stores a display override, while Hide removes only the visible row. Hidden `baked_default` remains the automatic fallback and can be restored.

Repository-only actions preserve live values and scopes, do not enter Undo or publish configuration, and repair selected references by stable ID. Creating an All Heroes preset automatically hides the redundant Rewrite Default row without removing its fallback.

Focused regressions cover create/edit separation, row-click application, EDIT loading the target scope before the form opens, the unsaved-changes prompt, CLOSE-without-mutation, stable rename identity, baked immutability, delete/hide confirmation, monotonic allocation, routing priority, hidden-default fallback and restore, reference repair, and unchanged configuration during repository-only mutations.

## Milestone 15: Preset Library

The Preset Library lives under its own **PRESETS → LIBRARY** rail entry. A one-line hint (`Click a preset to use it. EDIT loads it so you can change it and SAVE.`) and a collapsed **SHOW HOW PRESETS WORK** guide explain the flow and the routing rule: the first Only These match wins, otherwise a still-fitting Current, then the first All Except, then the top All Heroes preset, otherwise Rewrite Default. The page keeps the create/edit form, scope controls, feedback, hero identity in the library header, preset actions, and a conditional “Rewrite Default is hidden” row. The bottom **SAVED ON THIS PC** strip explains automatic saving and the two-click **CLEAR PC SAVE** action; save status remains only in the header chip. The INFO guide and action guide are gone.

## Milestone 16: preset repository transfer

**Copy Presets** exports the deterministic baked-before-user repository bundle as an `HPCRP1` clipboard code; row-level **COPY** exports one record. **Import Presets** validates the whole code before mutation, preserves names, scopes, hero keys, frozen settings, baked display names, hidden-baked state, selection, and canonical ability conditions, then allocates fresh user IDs. Transfer never applies settings, enters Undo, changes the live revision, or dispatches configuration. The synthetic Current scope row is never exported.

HPCRP1 hero lists may arrive in any order and are normalized to catalogue order on import. Unknown IDs, duplicate IDs, and non-string entries reject the entire bundle without changing the repository.

## Milestone 17: confirmed page reset

**Reset Page** confirms and resets all keys owned by the captured page, including hidden values and conditions. Players pages reset both enemy and ally settings regardless of the selected side; HP Text also resets shared HP text alignment. Confirmation states this explicitly and disables the selector until it closes. General → Basics owns master, Own HUD color and shared thresholds; those thresholds do not reset with Players → Bars. Hero Current still resets to Base. Opening, cancelling and already-default requests remain inert. Confirming creates one Undo entry and publishes only an effective change; Undo does not move the side selector or folds.

The header reports completion or already-default state through a generation-guarded message. Reset Page stays hidden on Presets → Library while Undo remains visible there; both show on settings pages. Escape and the blocking backdrop preserve dialog precedence.

Focused regressions cover captured-tab reset, unrelated-value preservation, one-entry Undo, effective-equal dispatch suppression, keyless Presets, Escape precedence, stale feedback rejection, and footer restoration. Detached tooltips and a grouped two-axis position picker remain intentionally omitted.

## Milestone 18: ability signature-tier conditions

Eligible setting rows expose a compact condition marker and one focused editor for ability slot `1–4`, minimum tier `1–3`, and a typed override value. Shared settings such as the low and high thresholds expose synchronized markers on every rendered settings row rather than only their first control. Clicking another live ability selects it at Tier 1; clicking the selected ability again cycles its requirement through Tier 2, Tier 3, and back to Tier 1. The picker mirrors each live signature ability image and keeps the stock `ability_frame_passive_1` white base ring visible while layering the `ability_frame_passive_2` or `ability_frame_passive_3` tier ornament above it alongside the three-pip requirement row; the unnumbered `_1` spiked ring remains the default Tier 1 frame. Its panel, heading, status message, and actions reuse the same shared dialog theme as Reset and Import/Export. A draft whose typed value or selection matches the current setting reports that it creates no override, keeps Apply disabled, and cannot mutate the rule; a stored rule with that same redundant value remains unlit until it is changed or removed. Rules remain canonical, session-scoped state that travels through scopes, presets, Save, Apply, reset, Undo, and `HPCRP1` transfer. When a synthetic Current scope exists, its condition map is the editor and Undo target; later rule edits must not disappear into the hidden base while that scope remains effective.

The existing lifecycle watcher anchors `#hud_signature`, prefers the live `#hud_abilities > #abilities` slot parent, and falls back to deriving that parent from `#slot_signature_1`. It enumerates exact direct `slot_signature_1` through `slot_signature_4` IDs once, requires only referenced slots to exist, validates their cached parent relationship, and reads `Tier0` through `Tier3` only for referenced slots. It does not depend on `#AbilitiesContainer`, repeatedly scan the full HUD, or ship probe/debug output. Conditional values fall back immediately when a referenced local slot is unavailable and are materialized into the effective snapshot only while their threshold matches, so the healthbar consumer remains unchanged and receives publication only when effective output changes.

Ability polling keeps one observed tier signature per lifecycle identity (`epoch` plus effective hero). It sends the first observation for each identity and every changed tier signature, but skips unchanged observations until either the hero or lifecycle epoch changes. Panel discovery and replacement validation continue at the existing cadence.

Closing the editor cancels editor-only transactions and Undo without stopping the lifecycle/ability watcher or clearing observed tiers. Matched conditions therefore remain active until the referenced tier or lifecycle actually changes.

Focused regressions cover strict import validation, all slots, tier thresholds and loss, live-tree discovery, cached lookup reuse, partial and replacement slot trees, spectating, referenced-slot polling, unchanged observation suppression, typed editors, modal cancellation, markers, scopes, presets, reset, and Undo. The 2026-08-15 in-game pass confirmed the real ability hierarchy and tier timing.

## Milestone 19: enemy stamina shapes

**Indicators → Stamina** offers Arrow (native texture, shipped default), Circle, and Box for the three enemy-player stamina pips, with independent size, position, and custom color. Size/color changes do not force boxes: arrows retain their native image, use color wash, and map stored width/height to `8*(width/110)` × `12*(height/44.8)` CSS px with independent texture stretch per axis; circles and boxes use filled interiors and borders with black depleted interiors. NPCs, buildings, allies, and neutral stamina remain stock.

The stamina and accessory controls use the versioned `hpv2` extension in HPCRP1 records and current HPCR2 settings codes. Old data missing `staminaShape` still derives Box when width differs from `110`, height differs from `44.8`, or custom enemy stamina color is enabled; otherwise it derives Arrow against the frozen baseline. Older HPCRP1 records without the extension use frozen V2 defaults; legacy HPCR2 imports preserve the destination's V2 settings. The user confirmed the shape controls in game on 2026-10-01; the shipped default is now back to Arrow.

## Milestone 20: feedback rendering fixes

Enemy text pulses target the adopted native label and restore captured pulse classes/duration on release. Ally pulse keeps Fixed/Gradient modes and the existing versioned extension.

Hiding the enemy-player level badge collapses only that out-of-flow badge. The stock `InfoHealthContainer` has no flow to recenter, so Rewrite does not shift the bar, ultimate icon, or readout when levels are hidden. Enemy and ally text use the root-level frame's mirrored stock hidden states; adoption leaves other native info panels in place.

Bar and HP-text ranges remain wider than the visible viewport for compatibility. Bar width/height scale the measured primary outer surface around its full X/Y center; runtime never writes engine-owned width/height. Stack, primary, inner, accessory, fill, and marker `actual*` measurements use each panel's per-axis UI scale to get CSS pixels; inline CSS values stay in CSS units. Anchored player indicators preserve their measured gaps only after positive layout dimensions permit original-center capture, including late contexts whose initial bounds were zero. Bar translation uses the native mapping and is never multiplied by scale. Layout Reset explicitly restores the resolved Base or shipped layout values, including zero translation when requested. The existing scan/health pass samples changed outer/inner dimensions and offsets. Production emits no geometry records; the temporary bounded `[HPV2-DIAG]` console probe and budget attributes have been removed.

## Milestone 21: ally HP text

**Players → HP Text → ALLY** exposes native-number visibility, size, font, Bar Color or Custom Fixed/Gradient colors, and bar-relative normal X/Y offsets shown as percentages. It is off by default and never changes enemy text. Enemy normal offsets live on Players → HP Text → ENEMY; enemy pulse modifiers remain on Players → Alerts → ENEMY → Advanced. Ally off restores the same engine label's stock parent, styles and classes. Extension slots for the retired ally format and maximum-team color remain tombstones; carried values are dropped.

## Milestone 22: footer SAVE TO PRESET and retired ghoul opacity

**SAVE TO PRESET** sits in the editor footer between the spacer and EXIT and opens a dialog with one row per saved user preset, in library order: its name, its HEROES summary, a small **CHANGED** tag on the preset the settings on screen came from, and its own **SAVE** button. The row body does nothing. The first **SAVE** click arms only that row (**REPLACE?** and `CLICK AGAIN TO REPLACE <NAME>`, plus ` · ALSO CHANGES HERO PRESETS` on the top All Heroes preset while hero presets exist); a second click on the same button writes the settings and ability conditions on screen into that preset with the `preset_save_to {id}` intent, which keeps the preset's id, name, and HEROES and stores hero presets' `own` keys against the current Base. Arming another row, a four-second timeout (never a save), closing, Escape, or reopening disarms. **+ NEW PRESET (ALL HEROES)** deselects, then calls `preset_save` with `allHeroes: true` to create `PRESET N` for all heroes (N is the next free number, skipping a taken name in any case); `allHeroes` always creates and can never rewrite an existing preset's HEROES.

After either save the dialog closes and the saved preset is applied, so it is ACTIVE, the previous source's CHANGED marker clears, EXIT does not prompt, and a three-second header note reads `SAVED TO <NAME>.` or `SAVED AS <NAME>. SET ITS HEROES ON PRESETS.`. Saving is not undoable; the apply is. The footer button is disabled while the preset name form is open, Escape closes the dialog before anything else, and the button pulses amber only while the preset the settings came from is CHANGED (never for Rewrite Default or settings no preset owns). Nothing saves into a preset automatically; the automatic PC save of the live settings is unchanged. To fit six actions, the footer buttons use compact fixed widths with shrinking labels.

**Ghoul opacity** (`ghoulOpacityEnabled`, `ghoulOpacity`) is retired like the earlier exclusions: no editor controls, no renderer branch, and no published keys. Codec slots 68–69 stay reserved so later slots keep their positions. Old saves, presets, HPCR2 codes, and HPCRP1 codes that carry them, in values, ability rules, or hero-preset `own` keys, still load with them dropped; a rule set that held only ghoul rules loads as no rules. Rules on any other unknown key still reject the import.

## Priority 8 runtime measurement baseline

The 2026-08-15 detect-only diagnostic build recorded 37m35s of live gameplay. Ninety isolated probe contexts emitted 1,291 bounded summaries. They reported zero transient, confirmed, or recovered rewrite-owned style drift; zero duplicate scan or paint schedules; and 83 part replacements. Every context observed zero-width geometry, but 88 of 90 ended at the normal 1.5-second idle paint cadence and the remaining two were in the 0.25-second recent-change window. The only released-style signal was the intentional `visibility: collapse` cleanup on 83 replaced kill-marker panels.

The menu emitted 38 summaries and observed seven lifecycle changes, including three active-match exits. No rewrite script or runtime exceptions occurred. A targeted follow-up recorded an unchanged effective revision and preserved the active `user_0001` preset across one active-to-lobby exit. This predates immediate explicit Apply and is retained only as lifecycle evidence.

The evidence does not justify a style watchdog, an explicit match-reset generation/acknowledgement path, or more clean-state work. The temporary counters were removed after recording the baseline. Repeat this measurement only if new live evidence contradicts it.

## Refactor validation (2026-09-05)

Confirmation requests now use distinct, single-use tokens; a cancelled reset or preset-removal request cannot confirm a later request. Removed unused private state and baseline fields, duplicate scope rendering, and the ancestor helper superseded by the consolidated discovery walk.

`node scripts/measure-hp-colors-rewrite-v2-refactor.js --output <report.json>` measures equal ten-second synthetic windows after a one-second warmup. Set `HP_COLORS_REWRITE_SOURCE_ROOT` to compare a preserved source tree. Scenarios cover stable/active enemies, allies, no bars, replacement, layout reset, width editing, scope editing, and state updates.

The preserved before/after runs reduced renderer parent reads from 550 to 370 per stable/active context, scope-editor class reads from 17,930 to 13,930, and newly frozen objects from 1,500 to 1,100 across 100 state edits. Observable snapshots, callback counts, and style writes were unchanged. Serialization work was unchanged. These are VM operation counts, not native CPU or FPS results; fresh live A/B captures and in-game smoke checks remain required for performance acceptance.

## October 1 audit (c7998a0)

The audit removed unused storage disposal/saved-time bookkeeping, redundant renderer guards/writes, and unreachable menu paths. Whole-bar geometry names now use `bar` rather than `segment`; geometry rebases once per paint tick, the shield label is cached, and repeated unit-fact class reads are deduplicated. Menu synchronization reads one state snapshot and caches missing-control lookups for legacy layouts.

Measured idle paint-tick operation counts fell from 52 to 2 class reads, 15 to 4 parent reads, and 70 to 54 layout reads. Review found no behavior changes. These are synthetic operation counts, not native CPU or FPS results; fresh live checks remain required. Per-line opacity bookkeeping was separately removed when LINE OPACITY moved to the container.

## Release 2.0.3

Native style caching compares unchanged requests against the post-assignment native readback. It avoids repeated writes caused by normalized colors, numbers, and transforms while retaining engine-change and replacement-panel repair. Alias restoration clears the owning base property and reapplies unaffected inline siblings, avoiding rejected null alias assignments. If neither an alias nor its base getter exposes a change, the cache cannot detect it.

Ordinary preset Apply updates existing rows instead of rebuilding their controls. Menu setup remains explicitly retryable after incomplete or failed panel creation. Temporary profiling, benchmark logging, timing switches, and their test fixtures have been removed; actionable boot/dispatch error messages remain.

The normal wrapper builds standalone pak02 by default. Use `build_hp_colors_rewrite_v2.ps1 -ShowRankBarebones` to compose its Escape open/out handlers while preserving HP editor cancellation. This changes only the staged layout; the canonical runtime remains independent of ShowRank. The wrapper verifies the pak89 dependency from `-ShowRankBarebonesPak`, else the installed `pak89_dir.vpk`, else the repository's `showrank_barebones_dir.vpk` from `build_showrank_barebones.ps1`. Players must install that pak89 alongside this pak02.

The QOLLOCK wrapper copies the same canonical runtime, derives packed assets from its package contract, and preserves the pinned QOLLOCK 4.0.3 1 October hotfix `pak03_dir.vpk` (`qollock403_1octoberhotfix.zip`) dependency. It overrides only the Escape menu (QOLLOCK's menu plus the HP COLORS V2 button and editor) and the topbar (QOLLOCK's topbar plus pickup-timer includes); QOLLOCK's own `hud.xml` stays authoritative, so pak02 never ships a stale copy of it. Because pak02 replaces QOLLOCK's whole Escape menu, it must carry every QOLLOCK include and panel from that menu, including the persistence scripts and `#QOLStorageBridge` HTML panel. The build fails if the override is missing any `src`/`id` from the pinned menu. Use `build_hp_colors_rewrite_v2_qollock.ps1 -RefreshFromInstalledQollock -QollockPak <pak03_dir.vpk>` whenever QOLLOCK changes its Escape menu and whenever an HP Colors menu row, slider host or button is added or renamed; point `-QollockPak` at the pinned file in `qollock-source.sha256` (an unrelated addon may occupy the installed pak03). The build also fails if the override lacks any canonical `HPColors*` id, and an editor test boots the shipped QOLLOCK copy: a stale copy stops menu boot, leaves HP COLORS V2 greyed out and never publishes saved settings. Both wrappers accept `-SkipDeploy` for archive-only builds.

Install only one pak02 variant and fully restart Deadlock. The normal archive contains standalone pak02 only; the QOLLOCK archive requires the matching QOLLOCK 4.0.3 1 October hotfix and does not bundle it. QOLLOCK 4.0.3 occupies pak03, so it conflicts with any other pak03, including this repository's abilities pak03. The hotfix changes only QOLLOCK's storage bridge, `hud.xml` and topbar-player layout/CSS; its Escape menu and topbar layout match the 30 September pin. The bridge no longer issues `javascript:` requests, which Deadlock's 2026-10-01 update blocks, so QOLLOCK saving should work again (needs an in-game check). HPv2's own HTTPS saving is independent. Barebones remains an opt-in build option, not an archive payload. The prior roughly 35-minute Barebones live capture had no logged style-write failures, and the user confirmed correct rendering. Automated release checks do not substitute for a fresh in-game check of the final packages.

## Release 2.2.0

- **BAR STYLE** (slot 74, GENERAL → Layout): V1 (default), V2 (stock slanted masks) or OLD (2024-style 100-HP pip grid; see Stock appearance). With OLD and anchoring on, the ultimate icon and level badge center on the pip grid.
- **LIFT NAME ABOVE OLD BOXES** (slot 75) and **NAME TILT** / enemy and ally **TEXT TILT** (slots 78–80, −360…360°, default 0, rotation on `#name` and the adopted `UnitHealthbarValue`, never on the geometry rows).
- **DAMAGE SHAKE** (slot 76, default on) and **SHAKE STRENGTH** (slot 77, 1–10°, default 3 = stock). `#name` sits in the full-canvas `HPV2NameAnchor` wrapper so the shake rotates bar, HP text and name together around the bar pivot; owned `HPColorsRewriteShake<N>`/`HPColorsRewriteShakeOff` root classes swap the keyframes on customized bars only; buildings and bosses never shake, including their HP text.
- BAR WIDTH and BAR HEIGHT accept 60–400%. ULTIMATE SCALE scales the whole ult icon, ready or cooling down.
- Ally HP text shares the enemy anchor gap (33.5px), so equal HORIZONTAL OFFSET values line up at any bar width; ally text sits about 10px right of 2.1.9.
- The Sinner's Sacrifice vault (`neutral_vault`) and neutral-tagged buildings classify as objectives and never take the NEUTRALS camp fill.
- Only hero bars handle topbar ultimate/pickup traffic; stock-left bars go dormant until config, class or canvas size changes; duplicate per-tick name/readout/pip-color passes were removed. These are VM work counts, not FPS evidence.
- Settings, codes and presets that carry slots 74–80 cannot load in 2.1.9 or older. Not yet confirmed in game: OLD grid sizes, tilts, shake strengths and the refreshed QOLLOCK menu.

## Release 2.2.1

- Damage shake animates one full-canvas `HPV2MotionFrame` holding the name anchor, bar, accessories and HP text instead of three wrappers, so the name still shakes with the bar. A compact stock-sized frame was tried and reverted: in game its transform clipped the HP text and level badge.
- Performance round from `docs/2026-10-03-hp-colors-v2-lag-investigation.md`: OLD collapses the native surfaces it replaces and caps its box pool at 128; dormant and hidden bars skip per-tick work behind one 1 s wake check; scans start at a random phase; colour pulse uses `clip`; ultimate rings are predicted locally from a rate and the topbar re-sends only on change, a 15° miss or an 8 s heartbeat; timer loops stop when both timer features are off.
- Fixes: failed pickup relays retry immediately instead of waiting for the 6 s heartbeat; malformed config `values` are rejected; stale retry callbacks keep newer job handles.
- No new settings or slots: 2.2.0 saves, codes and presets load unchanged.

## Release 2.2.2

- SHOW BOUNDS (bottom of the category rail) outlines each customized bar's world-panel canvas with one passive `HPV2CanvasBounds` panel outside `HPV2MotionFrame`. Session-only transient `showBounds` beside snapshot values; never saved, exported or slotted.
- No new settings or slots: 2.2.1 saves, codes and presets load unchanged. Not yet confirmed in game.

## Release 2.2.3

- BAR OUTLINE (slots 84–87 `barOutlineEnabled`/`barOutlineThickness` 0.5–10px/`barOutlineOpacity`/`barOutlineColor`, GENERAL → Layout), on by default with a base-game-colored 1px rim; slots 88 `barOutlineCustomColor` (false) and 89 `allyBarOutlineColor` add custom enemy (slot 87)/ally hero colors. Frozen sparse defaults equal the shipped ones, so untouched saves and codes omit the slots and still load in 2.2.2; only changed outline values need 2.2.3. OLD rims are solid backers under each box (the first in-game look, a bordered overlay, showed fill corners and was replaced).
- OLD layer visibility has one owner (`syncOldOutline`), fixing enemy rims that stayed hidden after a transient collapse during health-only paints.
- Enemy kill marker on OLD: `HPV2PipKillMarker` tick in the pip grid at the threshold HP.
- QOLLOCK variant now targets QOLLOCK 4.0.4 (`qollock_404_3october.zip`, pak03 SHA-256 `a8ea90f5…`). Its Escape menu and topbar match 4.0.3, so only the pin and the composed HP rows changed.
- Not yet confirmed in game: V1/V2 rim draw order (`z-index: -1`), thick rims, OLD backers and kill marker, and QOLLOCK 4.0.4 with this pak02.

## Third Eye compatibility

`build_hp_colors_rewrite_v2_thirdeye.ps1` builds the Rewrite v2 + Third Eye compatibility pak02. It runs `scripts/compose-hp-colors-rewrite-v2-thirdeye.js` with the pinned `hp_colors_rewrite_v2_thirdeye/source_snapshots/` inputs, copies the canonical HPv2 runtime at build time, and emits the extra `hp_colors_thirdeye_bridge.vjs_c`, `hp_colors_thirdeye_window.vjs_c`, and `features/topbar_ult_cooldown/feature.vjs_c` assets. The patched window is generated by `scripts/patch-hp-colors-thirdeye-window.js`; the canonical Rewrite runtime remains unmodified.

Install this compatibility pak02 and the unchanged Third Eye package at a lower priority (the verified package uses `pak47_dir.vpk`; a lower-priority pak03+ slot also works). Do not install an old HPv2 builder pak01: it overrides the ESC layout and disables saving. The package pin is recorded in `hp_colors_rewrite_v2_thirdeye/thirdeye-source-pin.json`. `-ThirdEyePakPath <path>` validates a supplied package's SHA-256 and required Source 2 assets; `-SkipDeploy` can build from the pinned snapshots without an installed Third Eye package.

Use only one pak02 variant. Do not combine Third Eye with ShowRank Barebones or a QOLLOCK/ShowRank triple stack. The compatibility Escape XML preserves HPColorsMenuBoot/HPColorsMenuCancel nested-cancel behavior, composes Third Eye close handling for Escape, backdrop, and EscapeButton, and closes Third Eye before HP COLORS opens. A fresh Deadlock restart is required after replacing any VPK.

The topbar cooldown feature is generated from the pinned Third Eye source with one lookup fallback: HPv2 temporarily moves `UltimateStatus` under `HPV2PickupIndicators` while pickup icons are active. Third Eye must read the native cooldown through that wrapper as well as directly under `StatusRow`. The original feature toggle, polling interval, labels, and CSS visibility rules remain unchanged. The shared pickup renderer centers either supported cooldown label beneath the ultimate and restores its prior alignment when pickups expire.

Run `node --test scripts/validate-hp-colors-rewrite-v2-thirdeye.test.js` for the delayed-hook, nested-cancel, and topbar cooldown reparenting regressions. After rebuilding, copy the generated compatibility Escape XML into the web builder's `public/templates/hpv2_hp_colors_rewrite_thirdeye/panorama/layout/hud_escape_menu.xml`. The browser preset and runtime must use the same merged layout. Before release, restart Deadlock and check both editors, nested dialogs, Escape/backdrop/Resume, preset hydration, and Third Eye's topbar cooldown before, during, and after HPv2 pickup icons; automated checks do not prove live rendering.


## Pickup and ultimate timers

The canonical pak02 includes the combined timer runtime previously tested in `test_hp_colors_v2_showrank/`. **Indicators → Pickups** exposes pickup colors, background darkness, glyph color, size, spacing, and offsets; **Indicators → Ultimate** exposes world cooldown visibility, scale, darkness, and Follow Icon / Fixed / Gradient progress colors. Timer settings and conditions use appended `hpv2` extension slots in HPCRP1 and current HPCR2 exports; legacy codes remain accepted.

Pickup appearance settings also style native healthbar pickup icons on the existing 3-second sampling cadence, restoring captured inline properties on release and preserving engine radial clips. Styling is released for the local player and while the pickup scan gate is closed; a newly shown icon can keep stock styling for up to 3 s. The topbar override refreshes stock listeners (`gDetailView gShopOpen gScoreboardOpen gStreetBrawl gPVE`) and `MidbossTimerLabel`, removing the obsolete announcements stylesheet include.

The event-driven sibling relay, native progress sampling, identity/freshness guards, one-time disabled-pickup clearing, and unchanged ultimate-style suppression are retained. Each world context has one `ClientUI_FireOutput` listener (the renderer's), which hands timer traffic to the timer script. Hero bars re-send a pickup snapshot only when the mask or name changes, the published countdown no longer predicts the native sample (refresh, pause), or the 6 s heartbeat is due. Ultimate snapshots carry the native angle plus a cooldown rate rounded to 0.01 degrees/second. The topbar sends on appearance/disappearance/ready/locked transitions, a prediction error of at least 15 degrees, or an 8 s heartbeat; 12 s receiver expiry leaves 4 s of delivery slack. World…

Dormant non-hero bars retain 1 s classification, lineage and canvas checks but skip cached-part validation, parts retry and hidden gates between every-fifth full resolves. Kind, relation, team, lineage, canvas or configuration changes wake a full reconcile. A replacement of an untracked dormant part can take up to 5 s to discover; active heroes retain their 1 s cached-part and hidden-gate sentinels.

The native ultimate-ready icon takes priority. Snapshot updates and cleanup hide the custom overlay unless the native icon is present and collapsed; the timer no longer hides native ready artwork.

Both normal and QOLLOCK builds include the timers. Do not install the standalone pickup pak04 alongside either pak02. ShowRank remains an optional staged composition, not a canonical dependency. Both wrappers write root `pak02_dir.vpk`, so preserve the normal package before building QOLLOCK.

Use `-SkipDeploy -SkipPanoramaTests` for compile-only builds without mocked Panorama checks. Timer behavior checks and package checks still run. Latest live rendering and lifecycle behavior remain unverified; no FPS improvement is claimed.


## Durable local save

Settings, Current scopes, user presets, conditions, and repository metadata save automatically on this PC and return after a game restart. A hidden `CitadelHTMLPanel` loads [the hosted storage page](https://hantu-raya.github.io/hpv2-store/) once; its localStorage lives in Steam's CEF profile under that HTTPS origin, not on GitHub. Requests use URL fragments (`#` + `encodeURIComponent(JSON)`), each with a unique id; the page handles `hashchange` without reloading and replies through `HPV2S1:` titles. Fragments are never sent to the server. Only `hantu.hpcolors.v2/state` and `hantu.hpcolors.v2/state.prev` are touched; Third Eye and QOLLOCK no longer share this origin.

Deadlock's 2026-10-01 update restricts `CitadelHTMLPanel.SetURL` to case-insensitive `https://` URLs; other schemes become `about:blank`. The September 30 build had no such check. There is no script-execution method, so the former `file://` page and `javascript:` injection cannot work. Its old saves are unreachable from the new origin: the first HTTPS launch starts without a save. `HTMLTitle` and `HTMLURLChanged` still fire.

The bridge requires page protocol version 1 and the exact hosted address; missing or mismatched versions fail closed. Hello is resent every 8 seconds until a trusted page event, with a 30-second readiness deadline. Offline or failed page loading reports SAVE UNAVAILABLE without writing. GitHub Pages serves the page with `max-age=600`, so updates can take up to ten minutes to reach clients. Protocol changes must bump the version and account for older clients and cached pages rather than weakening the version check.

The record codec, keys, read/write gate, previous-record rotation, and retries are unchanged. Saves write schema 4 and read schemas 1–5 (5 from a withdrawn centered-HP test build, read as 4) with one-time HP-text offset migration for schemas 1–3, storing sparse values against the frozen 974128a defaults. They wait 1.5 seconds after changes, flush when the editor closes, skip unchanged state, and retain the previous valid record as backup.

Cold boot keeps healthbars stock until saved state is restored. An unreadable, corrupt, or newer-format record pauses saving for that run rather than overwriting data; failed writes retry automatically. The header chip reports LOADING, SAVING, SAVED, SAVE RETRYING, SAVE CLEARED, SAVE TOO LARGE, SAVE UNAVAILABLE, or OLD PRESET VPK. The Preset Library's bottom **SAVED ON THIS PC** strip holds **CLEAR PC SAVE**; confirm it twice to delete only the two v2 keys while keeping current settings. Automatic routing does not recreate a forgotten save; the next deliberate edit does.

The web-builder pak01 seed is retired. HPCR2/HPCRP1 codes remain the sharing and off-PC backup path; clearing Steam's browser cache, reinstalling Steam, or moving PCs loses the local save.

### Live saving smoke

The HTTPS probe proved 30 KB URLs, one page load, and localStorage persistence across a full restart (`.scratch/hpv2_probe/launch1_console.log` and `launch2_console.log`). Commit `058d51e` removed the temporary probe; `621c7ad` moved production storage to HTTPS. Probe evidence is not a smoke test of the final editor/package.

1. After an authorized pak02 replacement, fully restart Deadlock with network access and no old builder pak01. Open HP COLORS and check that LOADING resolves without errors; on the first HTTPS launch, expect no old `file://` save.
2. Change a setting, create a named preset with a hero scope and ability condition, and wait for SAVED. Close the editor to exercise the flush. Record the header state and console evidence without exposing saved payloads.
3. Fully exit and restart Deadlock. Verify the setting, preset, scope, and condition return, then check resolved rendering after hero identity settles. Separate this evidence from the probe and VM results.
4. Exercise an offline launch without clearing browser data: if the page cannot load, expect SAVE UNAVAILABLE and no overwrite. Restore connectivity and restart; verify the saved state returns.
5. With a disposable save or an HPCR2/HPCRP1 backup, confirm CLEAR PC SAVE twice. Restart and verify it is absent; automatic routing must not recreate it, while the next deliberate edit saves again. In compatibility packages, verify Third Eye/QOLLOCK settings survive.

## October 1 native/layout/editor round

UnitStatus, InfoHealthContainer, and UnitHealthbarsContainer are full-canvas with zero top margin and noclip overflow. Compact healthbar leaves, native values, unit_info_panel, and LevelContainer sit at their stock world coordinates; reversible right-margin compensation preserves native right-aligned values when canvas width differs from 200px. Damage wiggle and stock scaling retain the old frame-center origin. Root-level names/stamina/status/other stock indicators are not rebased twice. The engine draw window remains about 200×210 CSS pixels, not unlimited. The user confirmed stock defaults and no clipping in game on 2026-10-01.

Bar/stamina movement keys keep raw values, with editor display/input raw×0.1 CSS px. Ultimate/level keys keep raw×0.1 CSS pixels at 100% bar size; with anchoring on they are unscaled offsets of a rigid group attached to the visual bar (left edge / vertical center), with anchoring off they scale by the corresponding bar axis; they display/input percentages of the frozen 76×18 editor baseline like normal and pulse HP text. Slider windows retain the prior physical range (±30 px X / ±20 px Y); typing reaches full bounds and an out-of-window value pins the slider without being rewritten. Bar/stamina bounds are ±2000/±2100; ultimate/level bounds are ±3334/±3500; HP-text bounds are ±334/±350. Native HP/name clamp only in rendering; other parts move freely. Name keys occupy extension slots 49–55; health-line colors/opacity and stamina shape occupy slots 56–61. Append-only slots 62–64 hold `readoutOutlineWidth`, `allyReadoutOutlineWidth`, and `nameOutlineWidth`, each with bounds `0–10`, step `0.5`, and default `5`. Slots 65–66 append `hudHealthColorMode` (`off`/`team`/`custom`, default `off`) and `hudHealthColor` (default `#FFFF00`); slot 67 appends `allyPulseReadout` (false), and slot 68 appends `nameAlign` (`left`/`center`/`right`, default `center`), and slot 69 appends `hpTextAlign` (`left`/`center`/`right`, default `left`; each names the growth direction), and slots 70–73 append CRITICAL/ASSASSINATE X/Y offsets, bringing the extension to 74 slots. Builds without these slots reject codes carrying non-default values for them. Current exports use `hpv2` version 2 and durable schema 4 (a withdrawn centered-HP build's v:3 codes and schema-5 saves load as version 2); HPCRP1 is unchanged and the web builder remains incompatible. Retired format, precise-pip, and maximum-team-color values/rules/own entries are dropped; slots stay reserved. Unused contract projections, retired-format enum rows, orphan spacer CSS, and renderer `defaultConfig` were removed. The temporary accessory diagnostic and all probes/budget attributes remain removed.

## Remaining limits and live checks

Anita compatibility and Reset All remain out of scope. The external pak96 builder stays build-time and read-only. Rewrite v2 still needs real-game checks for durable save across restarts, identity discovery, locale behavior, lifecycle transitions, Presets, native color-picker behavior and popup placement, text outlines/restoration, and supported UI scales. Native picker VM coverage is not in-game confirmation.
