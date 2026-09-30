# HP Colors Rewrite v2

## Goal

The rewrite owns the live v2 healthbar renderer, a session-scoped send/read state module, ESC editor adapters, live settings transfer, transient hero identity, scoped settings, and preset save/application.

The v2 overlay is rebased on the static stock tree shipped in Deadlock build 6722, using the supplied 6711/GameTracking master `245f2952f9` snapshot. It retains every engine-populated stock ID/class and adds only Rewrite-owned panels and script/style includes.

## Implemented feature set

### Healthbars and feedback

- Enemy-player fixed/gradient colors, team-high endpoints, visibility/layout, healing, damage-delta, shield color, and pulse.
- Enemy and friendly NPC gates and enemy/friendly building gates default off and work independently of player color toggles. Opted-in units reuse their relation palette, feedback, layout, pulse, and enemy pip-line settings; player-only extras stay off.
- Known neutral NPCs remain stock unless `npcNeutralEnabled` is on; that gate changes only the fixed fill color. Bounty, tier art, stock labels, and other neutral presentation stay stock.
- Ghoul opacity applies to classified creature NPCs even when their NPC color gate is off.
- Unknown type/relation and contradictory enemy/friend ownership remain stock. Neutral facts take precedence over enemy/friend classes; team IDs alone never infer relation.

Surface ownership is kept in one renderer decision: `player` has relation settings and player extras; `unit` has gated non-player bar presentation without HP text or accessories; `fill` has only the neutral fill; `opacity` has only ghoul opacity.

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

- Categorized ESC editor, immediate application, confirmed section reset with guarded feedback, session Undo, Peek, native HSL picker, and HPCR2 live settings import/export.
- One canonical global base and one resolved effective snapshot.
- Auto, Manual Override, and Off hero identity with lifecycle settling and stale-callback rejection.
- All Heroes and Selected Heroes user-preset categories with searchable stable-key selection, a hidden canonical fallback, and changed-effective-only publication.
- A baked-before-user session preset repository with a focused create form, explicit Apply/Cancel, selected-row **Save & Apply**, row-local rename/reorder/delete/hide, baked restoration, and exact Selected → All Heroes → Rewrite Default routing.
- `HPCRP1` single-record and bundle copy/import with atomic validation, fresh monotonic user IDs, canonical typed ability conditions, and no live-setting publication.
- Session-scoped ability signature-tier conditions for serializable settings, with row markers, ability-card tier cycling, typed override editors, base fallback, and changed-effective-only publication.

### Deliberately deferred

- Durable persistence and restart selection, pending a proven writable storage backend.
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
- Full-ghoul-healthbar opacity applies independently of bar colors.
- Horizontal and vertical translation of the complete healthbar stack. The unit stays fixed. Level and ultimate indicator gaps follow the measured scaled bar; one shared toggle controls whether they also follow bar translation.
- Independent horizontal and vertical offsets for the level badge and ultimate icon. These offsets apply in both anchor modes.
- One shared ultimate-ready icon rule: Follow Bar uses each customized relation's final bar color; Custom applies one color to enemy and ally icons even when their bar-color toggle is off.

The ancestry pass classifies explicit building, player, and known NPC facts before relation, with neutral facts first. Player-only level/readout/marker/stamina/ultimate behavior is restricted by `kind`; NPC/building palette gates remain independent of player gates, and ghoul opacity remains independently opt-in.

The v1 implementation passed its focused automated and in-game checks before this port. Rewrite v2 still requires its own fresh-restart in-game smoke before parity can be claimed.

### In-game smoke test

1. Build the source/package with `build_hp_colors_rewrite_v2.ps1 -SkipDeploy`. Deployment and addon replacement are separate actions; after an authorized replacement, fully restart Deadlock.
2. Inspect a player, neutral camp, trooper/trooper boss, midboss, and building. Record actual `WorldUIRoot` kind/relation/team classes and verify the static primary `UnitHealthbar` and separate shield branch.
3. With NPC, neutral, and building gates off, apply extreme player layout/color settings: non-player bars, bounty/tier art, stock indicators, and the secondary shield must remain stock.
4. Enable each NPC/building gate independently and verify only its explicit type/relation changes; it must reuse that relation's palette without player-only accessories. Enable neutral fill and verify bounty, tier art, lines, and values remain stock. Confirm ghoul opacity works with its NPC color gate off.
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

Known compatibility change: omitted readout slots in old HPCR2/HPCRP1 codes now use zero. Explicit legacy user values, including explicit old defaults (27/500 or -30/434), are clamped and read as CSS pixels; session and imported builder values follow the same bounds. No general migration or sentinel is added. New zero and in-range offsets round-trip unchanged. Only the canonical `baked_default` record accepts exact historical shipped offsets and resets them to current defaults, preserving old bundles and their user records; all other baked deviations still reject. The web builder was intentionally not updated, so local saves remain untouched. The `±200/±210` limits target the approximately 200×210 canvas suggested by the Sep 30 engine convars (window scale 2.0); exact CSS mapping, supported UI scales, and clipping still require live verification.

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

The editor owns transient hero identity separately from the canonical healthbar settings snapshot. **Auto** reads the generated `CitadelHudTopBarPlayer.LocalPlayer` card, resolves its `.HeroName` through an exact English retail-name table, and exposes the resulting stable `hero_*` key only after two matching active-match samples. Blank, placeholder, fuzzy, and unmapped names remain unknown. **Manual Override** uses one explicitly selected stable key, while **Off** produces no effective hero and skips local-card scans.

The lifecycle watcher classifies lobby/pregame, active match, post-match, and transitional states from current HUD classes plus a parseable live topbar clock. It clears detected identity and panel caches on lifecycle changes, rediscovers replaced local-player cards and stale clocks, polls at one second while active or transitioning and five seconds in lobby/post-match, and rejects stale scheduled callbacks by generation. Identity modes and the manual choice are session-only metadata: they do not alter `DEFAULTS`, HPCR2, Undo, the root settings snapshot, or unit-status publications.

Stable Auto observations now avoid state churn without weakening detection. Once a retail name matches the settled hero and no preset is waiting, the state module returns a no-op; repeated unknown samples cap after the required two observations. The watcher still reads the live label every second, so hero changes retain the same two-sample settling and epoch guards.

## Milestone 12: hero scopes and effective settings

The menu keeps the canonical global base separate from ordered, session-scoped snapshot rows. Each row normalizes to **Off**, **All Heroes**, or **Selected Heroes**; selected hero keys are validated against the stable catalogue, deduplicated, and sorted in catalogue order, while an empty Selected row becomes Off. Resolution checks the first matching Selected row, then the first All Heroes row, then the global base. Unknown identity never selects a hero row, but All Heroes remains an explicit fallback.

Only the resolved effective snapshot enters the existing root config attribute, `ClientUI_FireOutput`, and adaptive replay path. Base edits, scope edits, and hero transitions that leave the effective values unchanged do not increment revision or dispatch config. The Presets page exposes one Current save target with All Heroes and Selected Heroes modes plus a searchable stable-hero picker. The canonical base remains hidden and is represented by baked **Rewrite Default**; user presets cannot replace it. Selecting a mode initializes its scoped snapshot from the canonical base; removing the final selected hero returns Current to All Heroes.

### Verified in-game

The deployed 2026-08-14 build was user-smoke-tested after restart. Hero scopes, effective-setting transitions, fallback behavior, and the optimized transition-only healthbar telemetry worked without reported regressions.

## Milestone 13: session preset records and application

The menu owns a rewrite-native preset repository beside the canonical global base and ordered scope rows. Each record carries a stable ID, baked/session kind, display name, normalized settings snapshot, scope mode, and validated stable hero keys. The baked `baked_default` / **Rewrite Default** record represents shipped `DEFAULTS`. Baked records render before session records; new session records append in deterministic creation order and Milestone 14 may reorder them.

**New Preset** opens a create-only form. **Create Preset** captures the latest Current working values plus the Current scope mode and selected heroes, allocates a monotonic ID, and closes the form without applying settings. Clicking a session row enters an explicit editing state and warns that **Save & Apply** will replace that stable record with the current values, name, conditions, and scope metadata before applying it through the normal resolver. **Cancel** exits editing without mutation. Baked records are immutable and retain **Apply** only. Runtime-created and imported records, plus every in-game edit, remain session-only and reset when Deadlock restarts. On a cold boot with no session cache, an optional builder-generated `pak96_dir.vpk` seeds validated `HPCRP1` user records from the hidden `hud_escape_menu.xml` preset store, creates Current from the builder-selected record, and publishes it before hero or game-mode lifecycle observation. The packaged records remain build-time inputs rather than durable in-game writes.

Applying All Heroes or Selected Heroes preserves the hidden canonical base and replaces Current with the preset's frozen snapshot plus its stable source ID. Explicit **Apply** publishes that Current snapshot immediately, even if hero identity is unknown or currently different. Controls then edit and publish the Current working copy while the source preset record remains unchanged until **Save & Apply**. Legacy user Global records normalize to All Heroes on load without applying or publishing.

Later settled hero transitions choose the first matching saved Selected record, then the first saved All Heroes record, then **Rewrite Default** when leaving an active Selected scope. Automatic routing preserves edited Current when the resolved preset has the same stable source ID, including hideout-to-testing and repeated same-hero lifecycle transitions. It replaces Current only when routing resolves to a different preset or fallback. Every application and edit passes through the normalize, resolve, and changed-effective publication path, so byte-identical effective values do not increment revision or dispatch.

## Milestone 14: session preset repository management

The session repository now owns a retained next-user-ID counter, baked display-name overrides, hidden baked IDs, and one inert repository selection. Loading derives the counter above every surviving `user_####` suffix while retaining any higher stored value, so deleting the highest record cannot reuse its stable identity. Unknown baked IDs and invalid selected references are discarded during normalization.

Selecting a session row enters a distinct **EDITING** state without applying settings. Baked selection remains inert. **Apply** loads and publishes a record immediately, while **Save & Apply** is exposed only for the session record currently being edited. **ACTIVE** and **EDITING** remain separate states.

User records can be renamed, moved within deterministic session-only bounds, and deleted after confirmation. Baked records keep fixed identity and order; rename stores a display override, while Hide removes only the visible row. Hidden baked records remain canonical, so `baked_default` still serves automatic fallback, and **Restore Baked** returns hidden rows before session records.

Rename, reorder, delete, hide, and restore mutate menu-only repository state. They preserve live values and scopes, do not enter Undo, do not increment revision or dispatch configuration, and repair selected references by stable ID. Focus returns to the nearest surviving selected row after destructive or ordering changes.

Creating an **All Heroes** user preset automatically hides the baked **Rewrite Default** row to remove the redundant visible fallback. The baked record remains canonical and available to automatic routing, and **Restore Baked** makes it visible again.

Focused regressions cover cold-boot builder selection publication before lifecycle observation, create/edit separation, selected-row **Save & Apply**, cancel-without-mutation, explicit application, stable rename identity, baked immutability, delete/hide confirmation, monotonic allocation, deterministic boundaries, routing-priority changes, hidden-baked fallback, restoration order, reference repair, and byte-identical root configuration during repository-only mutations.

## Milestone 15: full-width Preset Library

The former split Hero / Presets dashboard is now one full-width Preset Library. It keeps automatic identity resolution active while hiding transient lifecycle diagnostics. The page explains the lower-commitment session behavior first, then web-builder persistence, then the one-VPK packaging rule. Its routing card says that a hero-specific preset wins first, otherwise All Heroes applies, and the highest matching row wins. Scope help states that Selected Heroes overrides All Heroes for chosen heroes. A compact action guide distinguishes Create Preset, Apply, and Save & Apply before the user edits a record.

## Milestone 16: preset repository transfer

The Preset Library can copy the selected record or a deterministic baked-before-user repository bundle as an `HPCRP1` clipboard code. Bundles include hidden baked state and selection but never include the synthetic Current scope row. Web-builder single and bundle exports explicitly hide baked **Rewrite Default** whenever they contain an All Heroes user preset, and XML first-boot hydration preserves that repository state. Import validates the entire code before mutation, preserves names, All Heroes/Selected Heroes scope, stable hero keys, frozen settings, baked display names, and canonical typed ability conditions, then appends user records with fresh monotonic IDs. Copy and import are repository-only: they never apply settings, enter Undo, increment revision, or dispatch configuration.

HPCRP1 hero lists may arrive in any order and are normalized to catalogue order on import. Unknown IDs, duplicate IDs, and non-string entries reject the entire bundle without changing the repository.

## Milestone 17: confirmed section reset

**Reset Section** now opens a blocking confirmation dialog for the active settings tab. Opening, cancelling, and already-default requests do not mutate menu state, enter Undo, increment revision, or dispatch configuration. Confirming resets the captured tab keys through the canonical replacement path, creates one Undo entry, and relies on effective-value equality to suppress irrelevant publication.

The header reports completion or already-default state through a generation-guarded transient message. Reset Section and Undo collapse on the Presets page, where neither action has a meaningful target, and return on settings pages. The reset backdrop intercepts outside clicks so the confirmation cannot coexist with underlying editor actions.

Focused regressions cover inert request/cancel behavior, captured-tab reset, unrelated-value preservation, single-entry Undo, effective-equal dispatch suppression, keyless Presets behavior, Escape precedence, stale feedback rejection, and footer-action restoration. Detached tooltips and a grouped two-axis position picker are intentionally omitted; concise inline help and the existing bounded X/Y sliders and numeric entries remain authoritative.

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

Install the generated HPv2 preset-builder pak01, this compatibility pak02, and the unchanged Third Eye package at a lower priority (the verified package uses `pak47_dir.vpk`; a lower-priority pak03+ slot also works). The package pin is recorded in `hp_colors_rewrite_v2_thirdeye/thirdeye-source-pin.json`. `-ThirdEyePakPath <path>` validates a supplied package's SHA-256 and required Source 2 assets; `-SkipDeploy` can build from the pinned snapshots without an installed Third Eye package.

Use only one pak02 variant. Do not combine Third Eye with ShowRank Barebones or a QOLLOCK/ShowRank triple stack. The compatibility Escape XML preserves HPColorsMenuBoot/HPColorsMenuCancel nested-cancel behavior, composes Third Eye close handling for Escape, backdrop, and EscapeButton, and closes Third Eye before HP COLORS opens. A fresh Deadlock restart is required after replacing any VPK.

The topbar cooldown feature is generated from the pinned Third Eye source with one lookup fallback: HPv2 temporarily moves `UltimateStatus` under `HPV2PickupIndicators` while pickup icons are active. Third Eye must read the native cooldown through that wrapper as well as directly under `StatusRow`. The original feature toggle, polling interval, labels, and CSS visibility rules remain unchanged. The shared pickup renderer centers either supported cooldown label beneath the ultimate and restores its prior alignment when pickups expire.

Run `node --test scripts/validate-hp-colors-rewrite-v2-thirdeye.test.js` for the delayed-hook, nested-cancel, and topbar cooldown reparenting regressions. After rebuilding, copy the generated compatibility Escape XML into the web builder's `public/templates/hpv2_hp_colors_rewrite_thirdeye/panorama/layout/hud_escape_menu.xml`. The browser preset and runtime must use the same merged layout. Before release, restart Deadlock and check both editors, nested dialogs, Escape/backdrop/Resume, preset hydration, and Third Eye's topbar cooldown before, during, and after HPv2 pickup icons; automated checks do not prove live rendering.


## Pickup and ultimate timers

The canonical pak02 now includes the combined timer runtime previously tested in `test_hp_colors_v2_showrank/`. HUD Details exposes pickup colors, background darkness, glyph color, size, spacing, and offsets, plus world ultimate cooldown visibility, scale, darkness, and Follow Icon / Fixed / Gradient progress colors. Timer settings and conditions use appended `hpv2` extension slots in both HPCRP1 and current HPCR2 exports; legacy codes remain accepted.

The event-driven sibling relay, native progress sampling, identity/freshness guards, one-time disabled-pickup clearing, and unchanged ultimate-style suppression are retained. Ultimate scaling includes the backing background. The ultimate texture uses lossless PNG passthrough with one mip and no LOD.

The native ultimate-ready icon takes priority. Snapshot updates and cleanup hide the custom overlay unless the native icon is present and collapsed; the timer no longer hides native ready artwork.

Both normal and QOLLOCK builds include the timers. Do not install the standalone pickup pak04 alongside either pak02. ShowRank remains an optional staged composition, not a canonical dependency. Both wrappers write root `pak02_dir.vpk`, so preserve the normal package before building QOLLOCK.

Use `-SkipDeploy -SkipPanoramaTests` for compile-only builds without mocked Panorama checks. Timer behavior checks and package checks still run. Latest live rendering and lifecycle behavior remain unverified; no FPS improvement is claimed.


## Remaining limits and live checks

Settings, scopes, user presets, and ability conditions remain session-scoped because the Phase 0 runtime probe found no writable native `$.persistentStorage` interface. Durable persistence, restart selection, Anita compatibility, and Reset All remain out of scope. The external pak96 builder stays build-time and read-only. Rewrite v2 still needs real-game checks for identity discovery, locale behavior, lifecycle transitions, Presets, popup placement, and supported UI scales.
