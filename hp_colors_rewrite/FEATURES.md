# HP Colors Rewrite

## Goal

Rebuild HP Colors behind small, independently verifiable seams. The current rewrite owns the v1 healthbar renderer, a deep send/read Anita state module, ESC editor adapters, live settings transfer, transient hero identity, session-scoped hero settings, and session preset save/application.

The layout overrides are based on current stock files in `SteamDatabase/GameTracking-Deadlock/game/citadel/pak01_dir/panorama/layout`. The rewrite changes them only by adding its script/style includes and owned panels.

## Implemented feature set

### Healthbars and feedback

- Enemy and optional ally fixed/gradient colors with shared thresholds.
- Enemy team-high color plus independent building and boss exclusions.
- Reversible enemy/ally visibility, dimensions, position, healing, damage-delta, bullet-shield, and ultimate-icon coloring.
- Neutral-first classification; neutral and unclassified targets never enter enemy coloring.
- Enemy/ally CSS-driven low-HP pulse and enemy-player-only static kill marker.

### HP readout and stock indicators

- Current/max, percentage, and current-only HP formats.
- Size, bounded placement, stock-derived or custom colors, and optional pulse-specific presentation.
- Health-pip visibility and optional precise 10-HP calculation with manual `gameinfo.gi` copy/reset guidance.
- Enemy-player level visibility and tier styling without writing engine-owned text.

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

- `panorama/layout/unit_status_overlay.xml` preserves the stock v1 healthbar layout and loads the probe.
- `panorama/scripts/healthbar_probe.js` discovers and observes the v1 healthbar inside its overlay context.

### Data path

Each probe reads its local healthbar panels directly. Health samples drive colors, readout, pulse, kill-marker geometry, and local pip/level state. Production does not serialize or emit per-bar pip, width, shield, or health-percentage diagnostics.

Replacement panels increment the local generation and reset cached sampling and presentation state.

### Diagnostic evidence

The final pre-cleanup 2026-08-20 capture contained 1,946 transition-only per-bar data lines and no Rewrite exceptions. Those lines were measurement scaffolding and were removed from production after the health sampling and scan-path comparison.

## Milestone 2: ESC editor lifecycle

Implemented source files:

- `panorama/layout/hud_escape_menu.xml` preserves the stock ESC layout and adds the explicit `HP COLORS` row plus editor panels.
- `panorama/scripts/hp_colors_contract.js` owns the frozen healthbar setting defaults, deterministic key order, types, enum options, numeric bounds, and normalization used by both the ESC state owner and isolated healthbar probes.
- `panorama/scripts/hp_colors_state.js` owns canonical values, effective resolution, scoped presets, repository policy, conditions, Undo, transactions, and runtime settling behind an immutable factory with `send()` and `read()`.
- `panorama/scripts/hp_colors_menu.js` owns open, close, category/tab navigation, hold-to-peek, panel observation, scheduling, rendering, transport, replay, and clipboard adapters.
- `panorama/styles/hp_colors_menu.css` owns the Ritual Stripe presentation.

The user confirmed that the entry, editor navigation, and hold-to-peek behavior work in Deadlock.

## Milestone 3: core healthbar customization

Implemented controls:

- Master customization is enabled by default; bypass preserves configured values.
- Global v1 width and height scaling.
- Enemy and ally enable/visibility controls.
- Fixed or legacy-compatible low/mid/high gradient color modes.
- Shared thresholds: low color holds through the low threshold, mid color is reached at the high threshold, and high color is reached at full health.
- Section reset and session-scoped Undo.

### Settings path

`hp_colors_state.js` owns one versioned same-session state payload and returns declarative same-session replacement, effective publication, and clipboard effects. `hp_colors_menu.js` executes those effects and renders the returned immutable view. Changed controls publish immediately only when resolved effective values differ. While the master switch is enabled, the unchanged cached snapshot replays at 1-second hot, 3-second warm, then 8-second idle intervals because isolated late unit-status contexts cannot read the ESC root attribute. Each `healthbar_probe.js` context accepts a snapshot once, ignores identical replays, and reapplies its local cache when a bar or its parts are discovered or replaced.

The renderer classifies stock relation classes neutral-first, then enemy/friend. When customization yields color ownership, it writes the current base-game `unit_status.css` relation palette directly to the owned inline properties because clearing Panorama inline colors did not reliably trigger stock selector repainting in live Deadlock. The mirrored values cover team1, team2, neutral, enemy, and friend fill/ultimate colors plus stock healing, damage-delta, and bullet-shield colors; JavaScript constants identify their stock origin.


## Milestone 4: feedback and bullet-shield colors

Implemented controls:

- Separate enemy and ally healing-layer colors.
- Separate enemy and ally recent-damage delta colors.
- Separate enemy and ally bullet-shield colors.

The local renderer uses the already cached v1 panels. It changes healing and delta `washColor` plus bullet-shield `backgroundColor`; the engine remains the sole owner of every layer's live width and timing. Disabled relations, neutral/other roles, and the master bypass clear these inline properties so stock styling resumes.

## Milestone 5: shared HSL color palette

Every color swatch opens one reusable palette with three native horizontal Panorama `Slider` controls: Hue `0–359`, Saturation `0–100`, and Lumen `0–100`. Changes publish to visible bars while dragging and create one session Undo entry when each slider gesture ends. Strict editable `#RRGGBB` fields remain beside each swatch.

The picker uses one modal panel and one active setting key. Closing, Escape, page changes, Peek, or another color closes or reuses the modal without rolling back committed changes.

## Milestone 6: target-aware controls, position, and ultimate icons

Implemented controls:

- Optional stock team color as the enemy high-health endpoint; unknown teams retain the configured high color.
- Independent building/sentry and boss exclusions that restore stock relation colors.
- Horizontal and vertical translation of the complete healthbar stack without moving or scaling unit, ultimate, or level icons.
- One shared ultimate-ready icon rule: Follow Bar uses each customized relation's final bar color; Custom applies one color to enemy and ally icons even when their bar-color toggle is off.

The renderer classifies relation, team, building, sentry, and boss facts from the current overlay ancestry. Neutral classification remains authoritative. Exclusions bypass relation-owned bar, feedback, shield, and ultimate-icon colors while global size and position controls remain active. Ultimate-icon styling owns only inline `washColor`; stock visibility and boss-specific images remain engine-owned. The shared control lives under Health Info → Indicators rather than an enemy-only page.

The 2026-08-12 in-game smoke confirmed fixed low/mid/high threshold stepping, team-high colors, independent exclusions, X/Y positioning, ultimate-icon modes, reversible non-culling visibility, and the existing picker/renderer controls. `console.log` recorded configuration, role, team, building, boss, generation, and health transitions with no HP Colors Rewrite exceptions.

### In-game smoke test

1. Run `powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite.ps1`.
2. Ask the user to restart Deadlock with `-dev -tools`.
3. Require enemy fixed/gradient colors, thresholds, visibility, width, height, healing, damage-delta, and bullet-shield colors to update real bars.
4. Enable ally styling and require only friend bar, healing, damage-delta, and bullet-shield colors to update.
5. Require neutral and unclassified bars to remain stock.
6. Require late/replaced bars to receive the current snapshot.
7. Enable team-high color on both teams; require the stock team color only above the high threshold and the configured high color for unknown-team bars.
8. Toggle building and boss exclusions independently; require sentries, buildings, all boss tiers, and boss barracks to return to stock colors while global size and position remain active.
9. Move Bar X Offset and Bar Y Offset through positive, negative, and zero values; require only the complete bar stack to move while unit, ultimate, and level icons retain stock placement.
10. Test ultimate-icon Follow Bar and Custom modes on enemies and allies; require shared Custom changes to update both relations even when bar coloring is off, while excluded, neutral, unclassified, and bypassed icons return to stock.
11. Drag each native Hue, Saturation, and Lumen slider; require the slider value, canonical hex, and visible bars to update live, then require one Undo to restore the color from before that slider gesture.
12. Exercise Reset Section confirmation, Cancel, already-default feedback, and Undo. Require Reset Section and Undo to stay hidden on Presets, return on settings pages, and Escape to dismiss the reset dialog or palette before closing the editor.
13. Exit and require config/role/data logs with no rewrite exceptions.


## Milestone 7: HP readout

Implemented controls:

- Show or hide the enemy HP number.
- Current/max HP, percentage, and current-only formats.
- Font chooser with Default (`Retail Demo, Noto Sans, sans-serif`), Oracle (`VALVEOracle, Reaver, sans-serif`), and Pulp (`VALVEPulp, Noto Sans, sans-serif`). Runtime writes the expanded families because stock `sans`, `oracle`, and `block` are compile-time CSS aliases.
- Text size plus direct horizontal (`-405px…405px`) and portable vertical (`-35px…840px`, default `500px`) offsets.
- Bar-derived or custom low/mid/high text colors. Bar Color inherits the enemy bar's Fixed/Gradient mode and shared thresholds. Custom enables its own Fixed/Gradient choice. The always-editable shared threshold pair lives under Enemy → Bar and also drives ally bars and custom HP text. The white label is tinted through `washColor`, matching the bar and legacy rendering path instead of assigning a darker flat `color`.

The stock overlay exposes only `unit_healthbar_pip_label`, so the rewrite owns `hp_counter_anchor` and one `hp_counter` label without changing stock fill geometry. Maximum HP comes from the stock pip string and current HP from the existing shield-aware fill ratio; percentage remains available when a maximum cannot be derived. Turning **Enemy Bar Colors** off restores only relation-owned colors; the readout remains governed by **Show HP Number**. Excluded, neutral, ally, unclassified, and master-bypassed paths collapse and clear the owned label. Pip-text changes and replacement counter panels invalidate local caches and reapply through the existing scan and paint loops.

The readout uses the legacy non-displacing layout: a `100%` × `fit-children` `WindowRoot`, a bottom-aligned `fit-children` `UnitStatus`, a `fit-children` × `300px` `InfoHealthContainer`, and an ignored-flow `100%` × `100%` bottom-aligned `hp_counter_anchor`. The anchor is a direct child of `UnitStatus`, outside the finite health container. Live geometry proved that the engine-owned world-panel root is fixed at `2000px × 1000px`; text translated near the lower edge leaves that texture even though Panorama continues to lay it out. The portable VPK does not mutate external game files or run console commands. Precise-pip calculation is session-scoped and shows a gameinfo.gi warning with copyable enable values when turned on and copyable defaults plus a deletion reminder when turned off; the UI never claims it applied or verified them.

The focused VM regression covers all formats, shield-aware values, missing pip data, visibility/scope, size, offsets, fixed/gradient colors, team-high/custom color ownership, unchanged-write caching, and replacement replay.

## Milestone 8: health pips, enemy levels, and low-HP effects

Implemented controls:

- Enemy health-pip visibility while leaving the engine-owned pip text and geometry untouched.
- Optional precise-pip parsing that interprets minor marks as 10 HP after the user configures the copied ConVars block in `gameinfo.gi`; disabling it shows the default values and reminds the user to remove unused custom entries.
- Enemy-player level visibility with engine-bound level text and custom tier boundaries at levels 11, 19, 27, and 35.
- Enemy low-HP pulse with an inclusive threshold, 30–300 BPM speed, three intensity levels, optional fixed/gradient pulse color, and temporary non-culling bar hiding. Two independent toggles control HP-number pulse animation and pulse-time text modifiers. The modifier toggle enables independent text size plus horizontal and vertical offsets while the pulse is active, restoring normal geometry above the threshold; it does not enable text animation. Normal brightness pulse targets only `unit_healthbar_lagging`; custom Gradient keeps the base fill color and CSS-pulses a custom-color overlay across the live fill width, independent of health depth.
- Ally low-HP pulse with an independent threshold, speed, intensity, and optional fixed color.

Pulse animation is CSS-driven. BPM alone controls duration. Custom-gradient intensity changes both opacity endpoints—Subtle `0.15→0.45`, Medium `0.10→0.75`, and Intense `0→1`—so lower levels no longer converge on full custom-color replacement. The existing paint loop changes namespaced classes, duration, and the owned custom-color overlay only when pulse state, health width, or configuration changes; it does not animate brightness in JavaScript. Bypass, role changes, exclusions, removal, and panel replacement clear rewrite-owned pulse and level state so stock styling resumes. A dirty bar that becomes neutral or otherwise leaves rewrite color ownership executes that cleanup immediately without waiting for another configuration refresh, covering recycled world-panel contexts.

The current stock layout retains the engine pip label but no level subtree, while stock CSS still defines `#unit_level_label`. The rewrite therefore adds one minimal circular `LevelContainer` and current engine `{i:player_level}` label to its stock-derived override. It never creates the obsolete `healthpips`/`pip_image` path.

## Milestone 9: enemy-player kill marker

Implemented controls:

- Enable or disable the static enemy-player kill marker.
- Place the marker at a canonical `5%–80%` health threshold.
- Set marker width from `1px–100px` and choose an independent color.

The marker is a rewrite-owned, non-interactive overlay directly under `UnitHealthbarContainer`. It never writes engine-owned fill widths. Runtime shows it only for visible enemy panels carrying the stock `player` class; allies, neutrals, non-player units, buildings, sentries, bosses, and boss barracks always remain marker-free. Geometry uses the cached live health-parent width, clamps the effective marker width to that surface, and skips unchanged visibility, position, width, and color writes. Bypass, hidden or pulse-hidden bars, role changes, removal, and panel replacement clear all marker-owned inline state.


## Milestone 10: rewrite-native live transfer

The editor copies a compact single-line code prefixed with `HPCR2`. Current exports always use `{"v":[...],"c":{...}}`: `v` contains sparse `[settingIndex, value]` pairs and `c` contains the complete typed ability-condition map, including `{}` when no conditions exist. Historical array-only `HPCR2[...]` inputs remain accepted as complete snapshots with zero conditions, so importing a nonconditional code clears conditions instead of inheriting them from the current hero scope. Export orders pairs by ascending index and omits values equal to shipped defaults. Indexes use the closed, append-only `DEFAULTS` order; unknown indexes, duplicate indexes, malformed values, invalid condition keys, ineligible settings, invalid slots or tiers, and mismatched condition value types reject the whole import before mutation. A valid import replaces the current editable values and conditions atomically, publishes once only when effective values change, and creates one Undo entry.

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

The former split Hero / Presets dashboard is now one full-width Preset Library. It keeps automatic identity resolution active while hiding transient lifecycle diagnostics, and surfaces only the active hero plus the Selected → All Heroes → Rewrite Default routing rule. The collapsed preset editor opens only for **New Preset** or a clicked session row. Create and edit use different primary labels, editing shows the overwrite warning, and Cancel closes the form without mutation. The expanded repository viewport keeps management local to each record: click a session row to edit, click the name to rename, use row-local Copy and Apply/Cancel, move user records with valid Up/Down controls, and confirm Delete/Hide in place. **Restore Baked** remains a repository-level header action.

## Milestone 16: preset repository transfer

The Preset Library can copy the selected record or a deterministic baked-before-user repository bundle as an `HPCRP1` clipboard code. Bundles include hidden baked state and selection but never include the synthetic Current scope row. Web-builder single and bundle exports explicitly hide baked **Rewrite Default** whenever they contain an All Heroes user preset, and XML first-boot hydration preserves that repository state. Import validates the entire code before mutation, preserves names, All Heroes/Selected Heroes scope, stable hero keys, frozen settings, baked display names, and canonical typed ability conditions, then appends user records with fresh monotonic IDs. Copy and import are repository-only: they never apply settings, enter Undo, increment revision, or dispatch configuration.

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

## Priority 8 runtime measurement baseline

The 2026-08-15 detect-only diagnostic build recorded 37m35s of live gameplay. Ninety isolated probe contexts emitted 1,291 bounded summaries. They reported zero transient, confirmed, or recovered rewrite-owned style drift; zero duplicate scan or paint schedules; and 83 part replacements. Every context observed zero-width geometry, but 88 of 90 ended at the normal 1.5-second idle paint cadence and the remaining two were in the 0.25-second recent-change window. The only released-style signal was the intentional `visibility: collapse` cleanup on 83 replaced kill-marker panels.

The menu emitted 38 summaries and observed seven lifecycle changes, including three active-match exits. No rewrite script or runtime exceptions occurred. A targeted follow-up recorded an unchanged effective revision and preserved the active `user_0001` preset across one active-to-lobby exit. This predates immediate explicit Apply and is retained only as lifecycle evidence.

The evidence does not justify a style watchdog, an explicit match-reset generation/acknowledgement path, or more clean-state work. The temporary counters were removed after recording the baseline. Repeat this measurement only if new live evidence contradicts it.

## Not implemented yet

Settings, scopes, user presets, and ability conditions remain session-scoped because the Phase 0 runtime probe found no writable native `$.persistentStorage` interface. Durable persistence, restart selection, and Reset All therefore remain blocked; panel attributes and `GameUI.CustomUIConfig()` are session-only, while the pak96 preset store is build-time/read-only. The persistence-dependent first-paint gate remains blocked. Clean live measurement rejected both a style watchdog and an explicit match-reset path. Remaining real-game identity panel, locale, and lifecycle verification plus Presets and popup verification at every other supported UI scale also remain open. See `to-do.md` for the checklist and explicitly deferred compatibility work.
