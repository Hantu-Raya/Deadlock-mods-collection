# HP Colors Rewrite v2

## Goal

The rewrite owns the live v2 healthbar renderer, a send/read state module with durable local save, ESC editor adapters, live settings transfer, transient hero identity, scoped settings, and preset save/application.

The v2 overlay is rebased on the static stock tree shipped in Deadlock build 6722, using the supplied 6711/GameTracking master `245f2952f9` snapshot. It retains every engine-populated stock ID/class and adds only Rewrite-owned panels and script/style includes.

## Implemented feature set

### Healthbars and feedback

- Enemy-player fixed/gradient colors, team-high endpoints, visibility/layout, healing, damage-delta, shield color, and pulse.
- Enemy and friendly NPC gates and enemy/friendly building gates default off and work independently of player color toggles. Opted-in units reuse their relation palette, feedback, layout, pulse, and enemy pip-line settings; player-only extras stay off.
- Known neutral NPCs remain stock unless `npcNeutralEnabled` is on; that gate changes only the fixed fill color. Bounty, tier art, stock labels, and other neutral presentation stay stock.
- Ghoul opacity is retired; legacy codec slots remain reserved and old values/rules are dropped on load and import.
- Unknown type/relation and contradictory enemy/friend ownership remain stock. Neutral facts take precedence over enemy/friend classes; team IDs alone never infer relation.

Surface ownership is kept in one renderer decision: `player` has relation settings and player extras; `unit` has gated non-player bar presentation without HP text or accessories; `fill` has only the neutral fill.

### HP readout and stock indicators

- HP/current formats temporarily move the engine's existing `UnitHealthbarValue` into the WindowRoot-level counter row, preserving the same panel and engine-updated text without parsing, sampling, or text writes. Percentage remains a custom, fill-derived counter; the health denominator is only the primary `UnitHealthbarInner`, never shield, armor, or deferred widths.
- Exact maximum HP is unverified because the supplied tree exposes no max binding. Both `hp` and `current` therefore show the native current-only number; no maximum is inferred from pips or rounded fill.
- Enemy and ally readouts are player-only. Adopted HP/current labels are visible at opacity `1`, regardless of stock damage/Show Health Value gates. Percentage returns the engine label to its original parent and suppresses it; **Show Health Text** off still hides enemy numbers, while ally readout off leaves the native label exactly stock. Inline styles, original pulse classes, and parent restore on release; the secondary shield value is untouched.
- Readout colors, fonts, size, translation, and enemy text pulses use the selected native or percentage path. Player-level badge and enemy kill marker are player-only; health-line visibility can also apply to opted-in enemy NPCs/buildings.

### Stock appearance

OVERVIEW → APPEARANCE shares two stock-pass-through controls between enemy and ally players, independent of player color toggles. CRITICAL LABEL hides only the stock label when off; stock critical flashing, scaling, wash, margins, and Rewrite pulses remain unchanged. PLAYER NAMES hides player names when off; when on, spectator visibility remains game-owned.

All unit-status healthbars are always rectangular without the outer container background (including players, NPCs, buildings, shields, and previews), even with the master toggle off. This intentional stock stylesheet deviation deletes the three healthbar mask declarations and all container background-color declarations from the replacement stylesheet, removing six otherwise-empty relation rules. The black inner backing and all other stock declarations remain. There is no shape setting or inline mask override.

The label controls use existing session settings, scopes, ability conditions, presets, Reset Section, Undo, HPCR2 and HPCRP1. Defaults never force labels visible. Master-off, surface loss, replacement, retirement, and teardown release owned label classes and return label styling to stock. The owned HP readout is straight, at its existing stock right-side placement. `citadel_unit_status_show_critical_state` stays engine-owned.

Ultimate progress art matches the 6722 ready icon: a black disk with an open white eye and progress ring, dimmed beneath the radial-clipped bright fill.

### Editor and settings

- Six ESC rail categories: General (Master, Layout, Appearance), Enemy (Bar, Heal & Shield, HP Text, Pulse, Kill Marker), Ally (Bar, Heal & Shield, HP Text, Pulse), Indicators (Pips & Level, Ultimate, Stamina, Pickup Timers), Presets (Library), and Units (NPCs, Neutrals, Buildings). Every editable setting belongs to one tab; Reset Section resets that tab's keys.
- Immediate application, confirmed section reset with guarded feedback, session Undo, Peek, native HSL picker, and HPCR2 live settings import/export.
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
- `panorama/scripts/unit_status_v2_colors.js` discovers the direct primary inner/fill, classifies unit kind separately from relation, and measures the 100×40 status / 76×18 outer / 69×12 inner frame.

### Data path

The renderer reads each unit's local primary health layers and native current-HP label. Primary inner width drives fill percentage, pulse overlay, and marker math; engine layer widths and secondary shield values remain untouched. Replacement or reparented panels increment the local generation and reset cached sampling/presentation state.

### Diagnostic evidence

The final pre-cleanup 2026-08-20 capture contained 1,946 transition-only per-bar data lines and no Rewrite exceptions. Those lines were measurement scaffolding and were removed from production after the health sampling and scan-path comparison.

## Milestone 2: ESC editor lifecycle

Implemented source files:

- `panorama/layout/hud_escape_menu.xml` preserves the stock ESC layout and adds the explicit `HP COLORS` row plus editor panels.
- `panorama/scripts/hp_colors_v2_contract.js` owns the frozen healthbar setting defaults, deterministic key order, types, enum options, numeric bounds, and normalization used by both the ESC state owner and isolated healthbar renderers.
- `panorama/scripts/hp_colors_v2_state.js` owns canonical values, effective resolution, scoped presets, repository policy, conditions, Undo, transactions, and runtime settling behind an immutable factory with `send()` and `read()`.
- `panorama/scripts/hp_colors_v2_menu.js` owns open, close, category/tab navigation, hold-to-peek, panel observation, scheduling, rendering, transport, replay, and clipboard adapters.
- `panorama/styles/hp_colors_v2_menu.css` owns the Ritual Stripe presentation.

The v1 menu interactions are preserved by source parity. Rewrite v2 still needs a fresh in-game check.

Menu startup resolves panels and creates controls before binding events or publishing settings. Missing controls and thrown creation errors leave startup available for an explicit retry. Repeated boot after success does not republish settings or start duplicate watches.

## Milestone 3: core healthbar customization

Implemented controls:

- Master customization is enabled by default; bypass preserves configured values.
- Shared width and height scaling in the measured native v2 frame.
- Enemy and ally enable/visibility controls.
- Fixed or legacy-compatible low/mid/high gradient color modes.
- Shared thresholds: low color holds through the low threshold, mid color is reached at the high threshold, and high color is reached at full health.
- Section reset and session-scoped Undo.

### Settings path

`hp_colors_v2_state.js` owns one versioned same-session state payload and returns declarative same-session replacement, effective publication, and clipboard effects. `hp_colors_v2_menu.js` executes those effects and renders the returned immutable view. Changed controls publish immediately only when resolved effective values differ. While the master switch is enabled, the unchanged cached snapshot replays at 1-second hot, 3-second warm, then 8-second idle intervals because isolated late unit-status contexts can start after the Escape menu.

The renderer classifies unit kind separately from stock relation classes, with neutral-first relation precedence. When customization releases color ownership, it mirrors the current base-game `unit_status_v2.css` palette into inline properties because clearing inline colors did not reliably trigger stock selector repainting in the pre-port live checks. The constants cover stock fill/ultimate, healing, damage-delta, and primary bullet-shield colors; the 6722 port still needs its own live release check.


## Milestone 4: feedback and shield-indicator colors

Implemented controls:

- Separate enemy and ally healing-layer colors.
- Separate enemy and ally recent-damage delta colors.
- Separate enemy and ally shield-indicator colors.

The renderer uses cached primary-inner v2 panels. It changes healing and delta `washColor` plus primary bullet-shield `backgroundColor`; the engine remains the sole owner of every layer's live width and timing. Disabled color ownership, neutral/other roles, and master bypass restore the mirrored stock colors. The separate shield bar, deferred layer, and ratking armor stay engine-owned.

## Milestone 5: shared HSL color palette

Every color swatch opens one reusable palette with three native horizontal Panorama `Slider` controls: Hue `0–359`, Saturation `0–100`, and Lumen `0–100`. Changes publish to visible bars while dragging and create one session Undo entry when each slider gesture ends. Strict editable `#RRGGBB` fields remain beside each swatch.

The picker uses one modal panel and one active setting key. Closing, Escape, page changes, Peek, or another color closes or reuses the modal without rolling back committed changes.

## Milestone 6: target-aware controls, position, and ultimate icons

Implemented controls:

- Independent stock team-color endpoints for enemy and ally high health; unknown teams retain each relation's configured high color.
- Horizontal and vertical translation of the complete healthbar stack. The unit stays fixed. Level and ultimate indicator gaps follow the measured scaled bar; one shared toggle controls whether they also follow bar translation.
- Independent horizontal and vertical offsets for the level badge and ultimate icon. These offsets apply in both anchor modes.
- One shared ultimate-ready icon rule: Follow Bar uses each customized relation's final bar color; Custom applies one color to enemy and ally icons even when their bar-color toggle is off.

The ancestry pass classifies explicit building, player, and known NPC facts before relation, with neutral facts first. Player-only level/readout/marker/stamina/ultimate behavior is restricted by `kind`; NPC/building palette gates remain independent of player gates. Ghoul opacity has no renderer branch.

The v1 implementation passed its focused automated and in-game checks before this port. Rewrite v2 still requires its own fresh-restart in-game smoke before parity can be claimed.

### In-game smoke test

1. Build the source/package with `build_hp_colors_rewrite_v2.ps1 -SkipDeploy`. Deployment and addon replacement are separate actions; after an authorized replacement, fully restart Deadlock.
2. Inspect a player, neutral camp, trooper/trooper boss, midboss, and building. Record actual `WorldUIRoot` kind/relation/team classes and verify the static primary `UnitHealthbar` and separate shield branch.
3. With NPC, neutral, and building gates off, apply extreme player layout/color settings: non-player bars, bounty/tier art, stock indicators, and the secondary shield must remain stock.
4. Enable each NPC/building gate independently and verify only its explicit type/relation changes; it must reuse that relation's palette without player-only accessories. Enable neutral fill and verify bounty, tier art, lines, and values remain stock. Confirm imported legacy ghoul opacity values never affect rendering.
5. Compare enemy/ally HP/current native readouts with percentage counters, including `0`, missing/unbound text, same-percent current changes, Show Health Value/damage gates, runtime format switching, bypass, and ally stock visibility. Native locale grouping such as `2,990` stays engine-owned; max HP remains unverified.
6. Check fixed/gradient thresholds, team endpoints, visibility, healing, delta, bullet shield, deferred/lagging damage, armor, pulses, and the new stock critical/assassinate/unkillable/rejuvenator/kill-streak indicators.
7. At width 60/100/230%, height 60/100/160%, position extrema, and supported UI scales, verify measured origins, left-edge gaps, explicit-zero reset, counter/indicator alignment, and an 18% marker clamped to the inner health interval. Check readout `0/0` against the unrotated stock right-edge position for enemy/friend, then exercise X `±200` and Y `±210`, including percentage and enemy pulse modifiers.
8. Verify enemy-player-only level tiers, marker, ultimate wash/timer priority, and stamina. Default stamina must keep native pips; custom boxes must restore texture/depleted behavior. NPC/building opt-ins must not acquire player accessories.
9. Exercise late spawn, death/respawn, shield-only/midboss contexts, reparent/replacement/removal, spectator state, and reused panels. Open the stock healthbar preview and verify no Rewrite geometry, overlays, or palette leaks. Open the editor and test Units HSL/hex controls, scoped reset/Undo, transfer compatibility, and Escape lifecycle.
10. Exercise APPEARANCE on enemy/ally players at normal and critical HP, with the critical-state convar on/off and in-eye spectator names suppressed. Verify always-rectangular low/full-HP edges, pips, and fill on players, NPCs, buildings, shields, and previews, including master-off and supported UI scales. Label defaults must return control to stock; label hiding must preserve critical motion and flashing.
11. Record screenshots/debugger facts and console evidence. Automated tests do not establish visual rendering, exact maximum HP, precise line settings, or frame cost/FPS.

## Milestone 7: HP readout

Implemented controls:

- Show or hide the enemy HP number.
- Current/max HP, percentage, and current-only formats.
- Font chooser with Default (`Retail Demo, Noto Sans, sans-serif`), Oracle (`VALVEOracle, Reaver, sans-serif`), and Pulp (`VALVEPulp, Noto Sans, sans-serif`). Runtime writes the expanded families because stock `sans`, `oracle`, and `block` are compile-time CSS aliases.
- Text size plus horizontal (`-200...200`) and vertical (`-210...210`) readout offsets, both defaulting to `0`. Enemy, ally, and enemy pulse-modifier offsets are plain CSS pixels: +50 moves the text +50px. Text size and bar translation keep their existing renderer calibration candidate.
- Bar-derived or custom low/mid/high text colors. Bar Color inherits the enemy bar's Fixed/Gradient mode and shared thresholds. Custom enables its own Fixed/Gradient choice. The always-editable shared threshold pair lives under Enemy → Bar and also drives ally bars and custom HP text. Labels are tinted through `washColor`, matching the bar and legacy rendering path without replacing their base `color`.
- Optional team coloring targets only maximum HP if a verified maximum source becomes available; current HP and any separator keep the active text color.

Both formats use the direct `WindowRoot` counter frame outside the small `UnitStatus`/`InfoHealthContainer` canvas. HP/current moves the existing engine label into `hp_counter_row`; XML keeps it in its stock position for initialization, and no new bound label is added. Sep 30 client.dll IDA inspection found that `sub_181CF8FF0` caches `UnitHealthbarValue` at `this+3624`, and `sub_181D0D7B0` calls `sub_18218FDD0` to set `health` on that cached label itself, not the root. Reparenting preserves the engine's pointer and updates; see the [layout contract](design.md#health-sampling-and-readout) for binding evidence and restoration rules.

The frame covers 100% of the world-panel width and height, with zero top margin. At offsets `0/0`, the unrotated row matches stock label geometry: its top is 66px and its right edge is canvas center +40px (friend +30px); text grows leftward. The left-aligned half-width anchor provides the center reference, the right-aligned row has 4px padding, and the adopted label has zero margins and padding. Both custom labels stay collapsed without text writes in native mode. Percentage returns the engine label and retains the custom-counter path. Stock damage-wiggle and hidden/pre-game/spectate collapse rules remain. Both formats add plain pixel offsets to the unchanged native-pixel bar translation; no shipped-default subtraction or offset scaling remains.

Known compatibility change: omitted readout slots in old HPCR2/HPCRP1 codes now use zero. Explicit legacy user values, including explicit old defaults (27/500 or -30/434), are clamped and read as CSS pixels; saved session and imported user-preset values follow the same bounds. No general migration or sentinel is added. New zero and in-range offsets round-trip unchanged. Only the canonical `baked_default` record accepts exact historical shipped offsets and resets them to current defaults, preserving old bundles and their user records; all other baked deviations still reject. The web builder was intentionally not updated, so local saves remain untouched. The `±200/±210` limits target the approximately 200×210 canvas suggested by the Sep 30 engine convars (window scale 2.0); exact CSS mapping, supported UI scales, and clipping still require live verification.

The player name is drawn level (no stock `-4deg` tilt).

The engine renders current HP itself through the native `UnitHealthbarValue` `{d:health}` binding; the renderer no longer parses that text. The supplied tree has no maximum binding, so exact max remains unknown and `hp` format displays current-only until a live exact source is proven. `precisePipsEnabled` remains in the codec for compatibility but has no menu consumer; the old pip string and unverified `gameinfo.gi` instructions are retired.

Focused VM regressions cover native-label ownership and exact restoration, HP/current and percentage switching, no custom text writes in native mode, percentage, visibility/scope, colors, pulse, caching, and replacement replay.

## Milestone 8: health pips, enemy levels, and low-HP effects

Implemented controls:

- Enemy pip-line visibility controls the stock `UnitHealthbarLines` panel for enemy players and opted-in enemy NPCs/buildings. The engine still owns generated line positions and opacity.
- `precisePipsEnabled` remains a wire-compatibility setting only. The static tree has no verified max-HP binding, and current line panels are not a max source; no precise-pip calculation or manual ConVar copy instructions are advertised.
- Enemy-player level visibility with engine-bound level text and custom tier boundaries at levels 11, 19, 27, and 35.
- Enemy low-HP pulse with an inclusive threshold, 30–300 BPM speed, three intensity levels, optional fixed/gradient pulse color, and temporary non-culling bar hiding. Two independent toggles control HP-number pulse animation and pulse-time text modifiers. The modifier toggle enables independent text size plus horizontal and vertical offsets while the pulse is active, restoring normal geometry above the threshold; it does not enable text animation. Normal brightness pulse targets only `unit_healthbar_lagging`; custom Gradient keeps the base fill color and CSS-pulses a custom-color overlay across the live fill width, independent of health depth.
- Ally low-HP pulse with an independent threshold, speed, intensity, and optional fixed color.

Pulse animation is CSS-driven. BPM alone controls duration. Custom-gradient intensity changes both opacity endpoints—Subtle `0.15→0.45`, Medium `0.10→0.75`, and Intense `0→1`—so lower levels no longer converge on full custom-color replacement. The existing paint loop changes namespaced classes, duration, and the owned custom-color overlay only when pulse state, health width, or configuration changes; it does not animate brightness in JavaScript. Bypass, role changes, exclusions, removal, and panel replacement clear rewrite-owned pulse and level state so stock styling resumes. A dirty bar that becomes neutral or otherwise leaves rewrite color ownership executes that cleanup immediately without waiting for another configuration refresh, covering recycled world-panel contexts.

The new stock tree has `UnitHealthbarLines` but no `unit_healthbar_pip_label`, and it has no engine level subtree. Rewrite adds only the minimal circular `LevelContainer` with engine-bound `{i:player_level}` text. Its stock-position baseline is immediately left of the ultimate icon (`margin-left: -23px`, `margin-top: -14px`); zero level offsets preserve that baseline. It never creates the obsolete `healthpips`/`pip_image` path.

## Milestone 9: enemy-player kill marker

Implemented controls:

- Enable or disable the static enemy-player kill marker.
- Place the marker at a canonical `5%–80%` health threshold.
- Set marker width from `1px–100px` and choose an independent color.

The marker is a passive overlay directly under primary `#UnitHealthbar`; the secondary shield branch has no marker. Runtime shows it only on a visible enemy player when the enemy relation gate allows it. Its threshold is clamped within the measured primary inner interval, including the inner X inset; the legacy width uses the unverified native display-unit mapping and is clamped to at least one native pixel.


## Milestone 10: rewrite-native live transfer

The editor copies a compact single-line `HPCR2` code containing legacy `v` value pairs and `c` conditions plus an `hpv2` extension with version `1`, extension `values`, and extension `conditions`. Copy Settings includes every current setting and condition, including stamina, accessory placement, and pickup/ultimate timers. Sparse pairs omit codec defaults; an empty extension still resets a destination's V2 settings to those defaults. Historical array-only and `{v,c}` inputs remain accepted and preserve destination V2 settings and conditions they never contained. Invalid values, duplicate or unknown slots, malformed extensions, and invalid conditions reject the whole import before mutation. Valid imports replace the editable snapshot atomically and remain undoable. New extended codes require the updated V2 runtime or builder; older importers may reject them.

## Milestone 11: hero identity and match lifecycle

The editor owns transient hero identity separately from the canonical healthbar settings snapshot. Detection is automatic: the editor reads the generated `CitadelHudTopBarPlayer.LocalPlayer` card, resolves its `.HeroName` through an exact English retail-name table, and exposes the resulting stable `hero_*` key only after two matching active-match samples. Blank, placeholder, fuzzy, and unmapped names remain unknown. The state module still accepts manual-override and off intents as an API, but the editor exposes no control for them, so a session always runs in Auto.

The lifecycle watcher classifies lobby/pregame, Hideout, active match, post-match, and transitional states from current HUD classes plus a parseable live topbar clock. It clears detected identity and panel caches on lifecycle changes, rediscovers replaced local-player cards and stale clocks, polls at one second while active or transitioning and five seconds in lobby/Hideout/post-match, and rejects stale scheduled callbacks by generation. Identity mode and any manual choice are session-only metadata: they do not alter `DEFAULTS`, HPCR2, Undo, the root settings snapshot, or unit-status publications.

Stable Auto observations now avoid state churn without weakening detection. Once a retail name matches the settled hero and no preset is waiting, the state module returns a no-op; repeated unknown samples cap after the required two observations. During active matches the watcher still reads the live label every second, so hero changes retain the same two-sample settling and epoch guards.

The Hideout (`connectedToHideout`) is its own `hideout` phase, polled every five seconds like lobby. Detection deliberately does not identify heroes there; the visible HERO label reads `HERO: UNKNOWN · HIDEOUT`. Entering it releases any held cold-boot snapshot and applies the first All Heroes preset. Without one, a hero-specific Current falls back to Rewrite Default; other Current settings stay unchanged. Pregame lobby keeps the last route. As with a hero swap, unsaved tweaks to a hero-specific Current are replaced; EDIT the preset and SAVE to keep them.

## Milestone 12: hero scopes and effective settings

The menu keeps the canonical global base separate from durable Current scopes and preset records. Scopes support **Off**, **All Heroes**, **Selected Heroes (Only These)**, and **All Except**. Hero keys are catalogue-validated, deduplicated, and ordered; empty Selected becomes Off and empty All Except becomes All Heroes. Automatic routing prefers the first matching Selected preset, a still-fitting Current, the first matching All Except preset, the first All Heroes preset, then Rewrite Default. Unknown identity never selects Selected or All Except.

Only the resolved effective snapshot enters the root config attribute, `ClientUI_FireOutput`, and adaptive replay path. Changes that leave effective values unchanged do not increment revision or dispatch config. Current exposes All Heroes, Only These, and All Except with a searchable hero picker. Hero presets retain their own override keys and layer on the first All Heroes preset or the hidden canonical Rewrite Default; see Milestone 13.

### Verified in-game

The deployed 2026-08-14 build was user-smoke-tested after restart. Hero scopes, effective-setting transitions, fallback behavior, and the optimized transition-only healthbar telemetry worked without reported regressions.

## Milestone 13: preset records and application

The rewrite-native repository keeps stable baked and user records beside the canonical base and ordered Current scopes. `baked_default` / **Rewrite Default** represents shipped `DEFAULTS`; records retain their settings, scope, selected heroes, conditions, and stable IDs.

The **Presets → Library** page separates snapshot creation, application, and updating. **Create Preset** stores Current plus its scope without applying it. Clicking a preset row (name, scope, or status) applies it; the ▲ ▼, COPY, EDIT, and DELETE/HIDE buttons are separate targets that never apply. **EDIT** applies the preset first (skipped when it is already ACTIVE) so Current carries its values and APPLIES TO scope, then opens the form with the row marked **EDITING**; that row ignores body clicks and has no EDIT button. **SAVE** replaces the record with what is on screen and applies it; when APPLIES TO differs from the saved scope, the scope summary reads `OLD → NEW` and the button reads **SAVE AS ALL HEROES / ONLY THESE / ALL EXCEPT**. **CLOSE** only closes the form; the screen keeps its changes and **UNDO** stays visible on this page to step them back. Applying or editing another row closes or retargets the form so SAVE never writes into the previous target. Baked records are immutable and can only be applied, copied, or hidden.

A row click loads a preset into Current and publishes it immediately, even when hero identity is unknown or differs. Controls edit the Current working copy; the source record stays unchanged until **SAVE**. When no saved preset is ACTIVE (the screen holds values no preset has) or the form holds an unsaved name, a row click or EDIT first swaps that row into a `REPLACE UNSAVED CHANGES?` CONFIRM / CANCEL prompt. ACTIVE marks the first preset equal to what is on screen; without a Current row that includes an All Heroes preset equal to the base, not only Rewrite Default, and selection never hides it. The ACTIVE row carries a green fill and left bar, the EDITING row an amber left bar. Legacy user Global records normalize to All Heroes without applying or publishing.

Automatic routing, only when a hero is known, chooses the first Selected Heroes (Only These) preset listing the hero, otherwise the first **All Except** preset that does not skip the hero, otherwise the first All Heroes preset, otherwise **Rewrite Default**; "first" is library order. An All Except preset stores its skipped hero keys (catalogue-validated, deduplicated, catalogue order); an empty skip list becomes All Heroes, and skipping every hero is valid but never auto-picked. Unknown heroes never match Selected or All Except, and in Hideout an All Except Current falls back like a Selected Current. Routing preserves edited Current while the resolved preset's stable source ID remains the same (or while a Selected/All Except Current still covers the hero and no Selected preset matches), and publishes only when effective values change. Saved-state envelopes use schema 3 (same embedded object body as schema 2) only when an All Except preset or Current scope exists, otherwise schema 2, so older builds keep saving for everyone else; schemas 1–3 are read, and older builds treat schema 3 as unsupported and never overwrite it.

Hero presets (Only These and All Except) layer on a Base: the first All Heroes preset in library order, otherwise Rewrite Default. Each hero record keeps its full `values` snapshot plus `own`, the setting keys it changes (contract order); applying or routing to it sets Current to the Base with those keys overridden, and ACTIVE/no-op checks compare against that resolved result. Update/Create of a hero preset stores `own` as the keys where Current differs from the Base; older saves and codes without `own` derive it on load/import. When the Base changes (All Heroes update/create, delete, reorder, import), an unedited hero Current refreshes once without an Undo entry; an edited one is left alone. While Current is hero-scoped, Reset Section returns the tab to Base values; the scope help line and the preset feedback say that only changed settings are saved. `HPCRP1` codes carry `own`; a non-array `own` rejects the import.

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

## Milestone 17: confirmed section reset

**Reset Section** confirms and resets only the active tab's keys. **General → Master** owns `enabled` and the shared low/high thresholds; those thresholds no longer reset with **Enemy → Bar**. Opening, cancelling, and already-default requests remain inert. Confirming creates one Undo entry and publishes only an effective change.

The header reports completion or already-default state through a generation-guarded message. Reset Section stays hidden on Presets → Library while Undo remains visible there; both show on settings pages. Escape and the blocking backdrop preserve dialog precedence.

Focused regressions cover captured-tab reset, unrelated-value preservation, one-entry Undo, effective-equal dispatch suppression, keyless Presets, Escape precedence, stale feedback rejection, and footer restoration. Detached tooltips and a grouped two-axis position picker remain intentionally omitted.

## Milestone 18: ability signature-tier conditions

Eligible setting rows expose a compact condition marker and one focused editor for ability slot `1–4`, minimum tier `1–3`, and a typed override value. Shared settings such as the low and high thresholds expose synchronized markers on every rendered settings row rather than only their first control. Clicking another live ability selects it at Tier 1; clicking the selected ability again cycles its requirement through Tier 2, Tier 3, and back to Tier 1. The picker mirrors each live signature ability image and keeps the stock `ability_frame_passive_1` white base ring visible while layering the `ability_frame_passive_2` or `ability_frame_passive_3` tier ornament above it alongside the three-pip requirement row; the unnumbered `_1` spiked ring remains the default Tier 1 frame. Its panel, heading, status message, and actions reuse the same shared dialog theme as Reset and Import/Export. A draft whose typed value or selection matches the current setting reports that it creates no override, keeps Apply disabled, and cannot mutate the rule; a stored rule with that same redundant value remains unlit until it is changed or removed. Rules remain canonical, session-scoped state that travels through scopes, presets, Save, Apply, reset, Undo, and `HPCRP1` transfer. When a synthetic Current scope exists, its condition map is the editor and Undo target; later rule edits must not disappear into the hidden base while that scope remains effective.

The existing lifecycle watcher anchors `#hud_signature`, prefers the live `#hud_abilities > #abilities` slot parent, and falls back to deriving that parent from `#slot_signature_1`. It enumerates exact direct `slot_signature_1` through `slot_signature_4` IDs once, requires only referenced slots to exist, validates their cached parent relationship, and reads `Tier0` through `Tier3` only for referenced slots. It does not depend on `#AbilitiesContainer`, repeatedly scan the full HUD, or ship probe/debug output. Conditional values fall back immediately when a referenced local slot is unavailable and are materialized into the effective snapshot only while their threshold matches, so the healthbar consumer remains unchanged and receives publication only when effective output changes.

Ability polling keeps one observed tier signature per lifecycle identity (`epoch` plus effective hero). It sends the first observation for each identity and every changed tier signature, but skips unchanged observations until either the hero or lifecycle epoch changes. Panel discovery and replacement validation continue at the existing cadence.

Closing the editor cancels editor-only transactions and Undo without stopping the lifecycle/ability watcher or clearing observed tiers. Matched conditions therefore remain active until the referenced tier or lifecycle actually changes.

Focused regressions cover strict import validation, all slots, tier thresholds and loss, live-tree discovery, cached lookup reuse, partial and replacement slot trees, spectating, referenced-slot polling, unchanged observation suppression, typed editors, modal cancellation, markers, scopes, presets, reset, and Undo. The 2026-08-15 in-game pass confirmed the real ability hierarchy and tier timing.

## Milestone 19: enemy stamina boxes

Rewrite v2 can resize/reposition/recolor the three enemy-player stamina boxes independently of the healthbar. Stored defaults leave stock texture pips untouched; only non-default dimensions or custom color add the Rewrite box class. Custom color applies to filled interiors and borders; empty/depleted interiors stay black. NPCs, buildings, allies, and neutral stamina remain stock.

The stamina and accessory controls use the versioned `hpv2` extension in HPCRP1 records and current HPCR2 settings codes. Older HPCRP1 records without the extension use default V2 settings; legacy HPCR2 imports preserve the destination's V2 settings. A fresh-restart in-game smoke remains required for live Panorama confirmation.

## Milestone 20: feedback rendering fixes

The enemy text pulse targets the adopted engine HP/current label or percentage counter according to the active format, and restores the original label's pulse classes and animation duration when ownership changes. Maximum HP remains unavailable. Ally custom pulse color has the same Fixed and Gradient modes as enemy pulse color; Fixed replaces the active bar color and Gradient animates an overlay over the normal ally color. This V2-only mode remains in the `hpv2` extension for HPCRP1 and HPCR2.

Hiding the enemy-player level badge collapses only that out-of-flow badge. The stock `InfoHealthContainer` has no flow to recenter, so Rewrite does not shift the bar, ultimate icon, or readout when levels are hidden. Both readouts use the root-level frame's mirrored stock hidden states; adoption leaves other native info panels in place.

Bar and HP-text ranges remain wider than the visible viewport for compatibility. Bar width/height scale the measured primary outer surface around its full X/Y center; runtime never writes engine-owned width/height. Anchored player indicators preserve their measured gaps; bar translation uses the candidate native mapping and is never multiplied by scale. Layout Reset writes zero translation explicitly. The existing scan/health pass samples changed outer/inner dimensions and offsets; production emits no geometry records.

## Milestone 21: ally HP text

**Ally → HP TEXT** exposes the enemy HP-text controls for ally bars: visibility, format, size, font, Bar Color or Custom Fixed/Gradient low/mid/high colors, team-colored maximum HP, and horizontal/vertical offsets. Ally text is off by default and never changes enemy text. Bar Color follows the ally bar's colors and mode with the shared thresholds. Enemy pulse text modifiers stay enemy-only.

The twelve `allyReadout*` settings remain appended to the versioned `hpv2` extension, and legacy codes without them use defaults. Ally readout is player-only: HP/current adopts the existing engine label into the root-level counter row, while percentage uses the custom counter. Ally text off restores the label's stock parent, inline styles and classes. Max remains unavailable until a live exact source is established. Fill sampling stays on the paint cadence when relation colors or an enabled player readout require it; neither readout path parses or samples the native number.

## Milestone 21: ally HP text

**Ally → HP TEXT** sits alongside the enemy text page and exposes visibility, format, size, font, Bar Color or Custom Fixed/Gradient low/mid/high colors, team-colored maximum HP, and horizontal/vertical offsets. Ally text is off by default and never changes enemy text. Bar Color follows ally bar colors and mode using the shared thresholds; enemy pulse text modifiers stay enemy-only.

The twelve `allyReadout*` settings append to the versioned `hpv2` extension, so older HPCR2 and HPCRP1 codes keep their defaults. Health sampling stays on the paint cadence whenever relation colors or HP text are visible. Ally's default offsets copy the enemy defaults; ally text alignment still needs an in-game check because ally bars have no level badge.

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

## Release 2.0.3

Native style caching compares unchanged requests against the post-assignment native readback. It avoids repeated writes caused by normalized colors, numbers, and transforms while retaining engine-change and replacement-panel repair. Alias restoration clears the owning base property and reapplies unaffected inline siblings, avoiding rejected null alias assignments. If neither an alias nor its base getter exposes a change, the cache cannot detect it.

Ordinary preset Apply updates existing rows instead of rebuilding their controls. Menu setup remains explicitly retryable after incomplete or failed panel creation. Temporary profiling, benchmark logging, timing switches, and their test fixtures have been removed; actionable boot/dispatch error messages remain.

The normal wrapper builds standalone pak02 by default. With ShowRank Barebones pak89 installed, use `build_hp_colors_rewrite_v2.ps1 -ShowRankBarebones` to compose its Escape open/out handlers while preserving HP editor cancellation. This changes only the staged layout; the canonical runtime remains independent of ShowRank.

The QOLLOCK wrapper copies the same canonical runtime, derives packed assets from its package contract, and preserves the pinned QOLLOCK 4.0.1 release `pak47_dir.vpk` (`qollock-401.zip`) dependency. It overrides only the Escape menu (QOLLOCK's menu plus the HP COLORS V2 button and editor) and the topbar (QOLLOCK's topbar plus pickup-timer includes); QOLLOCK's own `hud.xml` stays authoritative, so pak02 never ships a stale copy of it. Because pak02 replaces QOLLOCK's whole Escape menu, it must carry every QOLLOCK include and panel from that menu: since 4.0.1, QOLLOCK saves settings through `core/ql_storage_bridge.js` and the `#QOLStorageBridge` HTML panel in this layout, and a stale override leaves Save stuck until it times out. The build fails if the override is missing any `src`/`id` from the pinned menu. Use `build_hp_colors_rewrite_v2_qollock.ps1 -RefreshFromInstalledQollock -QollockPak <pakNN_dir.vpk>` whenever QOLLOCK changes its Escape menu. Both wrappers accept `-SkipDeploy` for archive-only builds.

Install only one pak02 variant and fully restart Deadlock. The normal archive contains standalone pak02 only; the QOLLOCK archive requires the matching QOLLOCK 4.0.1 release and does not bundle it. Barebones remains an opt-in build option, not an archive payload. The prior roughly 35-minute Barebones live capture had no logged style-write failures, and the user confirmed correct rendering. Automated release checks do not substitute for a fresh in-game check of the final packages.

## Third Eye compatibility

`build_hp_colors_rewrite_v2_thirdeye.ps1` builds the Rewrite v2 + Third Eye compatibility pak02. It runs `scripts/compose-hp-colors-rewrite-v2-thirdeye.js` with the pinned `hp_colors_rewrite_v2_thirdeye/source_snapshots/` inputs, copies the canonical HPv2 runtime at build time, and emits the extra `hp_colors_thirdeye_bridge.vjs_c`, `hp_colors_thirdeye_window.vjs_c`, and `features/topbar_ult_cooldown/feature.vjs_c` assets. The patched window is generated by `scripts/patch-hp-colors-thirdeye-window.js`; the canonical Rewrite runtime remains unmodified.

Install this compatibility pak02 and the unchanged Third Eye package at a lower priority (the verified package uses `pak47_dir.vpk`; a lower-priority pak03+ slot also works). Do not install an old HPv2 builder pak01: it overrides the ESC layout and disables saving. The package pin is recorded in `hp_colors_rewrite_v2_thirdeye/thirdeye-source-pin.json`. `-ThirdEyePakPath <path>` validates a supplied package's SHA-256 and required Source 2 assets; `-SkipDeploy` can build from the pinned snapshots without an installed Third Eye package.

Use only one pak02 variant. Do not combine Third Eye with ShowRank Barebones or a QOLLOCK/ShowRank triple stack. The compatibility Escape XML preserves HPColorsMenuBoot/HPColorsMenuCancel nested-cancel behavior, composes Third Eye close handling for Escape, backdrop, and EscapeButton, and closes Third Eye before HP COLORS opens. A fresh Deadlock restart is required after replacing any VPK.

The topbar cooldown feature is generated from the pinned Third Eye source with one lookup fallback: HPv2 temporarily moves `UltimateStatus` under `HPV2PickupIndicators` while pickup icons are active. Third Eye must read the native cooldown through that wrapper as well as directly under `StatusRow`. The original feature toggle, polling interval, labels, and CSS visibility rules remain unchanged. The shared pickup renderer centers either supported cooldown label beneath the ultimate and restores its prior alignment when pickups expire.

Run `node --test scripts/validate-hp-colors-rewrite-v2-thirdeye.test.js` for the delayed-hook, nested-cancel, and topbar cooldown reparenting regressions. After rebuilding, copy the generated compatibility Escape XML into the web builder's `public/templates/hpv2_hp_colors_rewrite_thirdeye/panorama/layout/hud_escape_menu.xml`. The browser preset and runtime must use the same merged layout. Before release, restart Deadlock and check both editors, nested dialogs, Escape/backdrop/Resume, preset hydration, and Third Eye's topbar cooldown before, during, and after HPv2 pickup icons; automated checks do not prove live rendering.


## Pickup and ultimate timers

The canonical pak02 includes the combined timer runtime previously tested in `test_hp_colors_v2_showrank/`. **Indicators → Pickup Timers** exposes pickup colors, background darkness, glyph color, size, spacing, and offsets; **Indicators → Ultimate** exposes world cooldown visibility, scale, darkness, and Follow Icon / Fixed / Gradient progress colors. Timer settings and conditions use appended `hpv2` extension slots in HPCRP1 and current HPCR2 exports; legacy codes remain accepted.

The event-driven sibling relay, native progress sampling, identity/freshness guards, one-time disabled-pickup clearing, and unchanged ultimate-style suppression are retained. Ultimate scaling includes the backing background. The ultimate texture uses lossless PNG passthrough with one mip and no LOD.

The native ultimate-ready icon takes priority. Snapshot updates and cleanup hide the custom overlay unless the native icon is present and collapsed; the timer no longer hides native ready artwork.

Both normal and QOLLOCK builds include the timers. Do not install the standalone pickup pak04 alongside either pak02. ShowRank remains an optional staged composition, not a canonical dependency. Both wrappers write root `pak02_dir.vpk`, so preserve the normal package before building QOLLOCK.

Use `-SkipDeploy -SkipPanoramaTests` for compile-only builds without mocked Panorama checks. Timer behavior checks and package checks still run. Latest live rendering and lifecycle behavior remain unverified; no FPS improvement is claimed.


## Durable local save

Settings, Current scopes, user presets, conditions, and repository metadata save automatically on this PC and return after a game restart. A hidden `CitadelHTMLPanel` opens `file://`; its localStorage lives in Steam's CEF profile. Only `hantu.hpcolors.v2/state` and `hantu.hpcolors.v2/state.prev` are touched, so Third Eye and QOLLOCK saves on the same origin are unaffected. Saves store non-default values, wait 1.5 seconds after changes, flush when the editor closes, skip unchanged state, and retain the previous valid record as backup.

Cold boot keeps healthbars stock until saved state is restored. An unreadable, corrupt, or newer-format record pauses saving for that run rather than overwriting data; failed writes retry automatically. The header chip reports LOADING, SAVING, SAVED, SAVE RETRYING, SAVE CLEARED, SAVE TOO LARGE, SAVE UNAVAILABLE, or OLD PRESET VPK. The Preset Library's bottom **SAVED ON THIS PC** strip holds **CLEAR PC SAVE**; confirm it twice to delete only the two v2 keys while keeping current settings. Automatic routing does not recreate a forgotten save; the next deliberate edit does.

The web-builder pak01 seed is retired. HPCR2/HPCRP1 codes remain the sharing and off-PC backup path; clearing Steam's browser cache, reinstalling Steam, or moving PCs loses the local save.

## Remaining limits and live checks

Anita compatibility and Reset All remain out of scope. The external pak96 builder stays build-time and read-only. Rewrite v2 still needs real-game checks for durable save across restarts, identity discovery, locale behavior, lifecycle transitions, Presets, popup placement, and supported UI scales.
