# HP Colors Rewrite

## Goal

Rebuild HP Colors behind small, independently verifiable seams. The current rewrite owns the v1 healthbar renderer, ESC editor, live settings transfer, transient hero identity, and session-scoped hero settings.

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

- Categorized ESC editor, immediate application, section reset, session Undo, Peek, native HSL picker, and HPCR2 live settings import/export.
- One canonical global base and one resolved effective snapshot.
- Auto, Manual Override, and Off hero identity with lifecycle settling and stale-callback rejection.
- Off, All Heroes, and Selected Heroes scopes with searchable stable-key selection, global fallback, and changed-effective-only publication.

### Deliberately deferred

- Durable persistence, pending a proven storage backend.
- Preset repository and management.
- Ability signature-tier conditions and remaining editor surfaces.
- Legacy v99 encoding, Anita tokens, aliases, bridge keys, and preset-store VPK compatibility.

## Milestone 1: healthbar observation

Implemented source files:

- `panorama/layout/unit_status_overlay.xml` preserves the stock v1 healthbar layout and loads the probe.
- `panorama/scripts/healthbar_probe.js` discovers and observes the v1 healthbar inside its overlay context.

### Data path

Each probe reads its local healthbar panels directly. It writes one transition-only line when displayed pip text, level text, or the floored calculated health percentage changes. Raw fill-width movement inside the same displayed percentage does not log:

`[HP Colors Rewrite] data id=... generation=N pip="..." level="..." fill=N parent=N shield=N health_parent=N width_percent=N`

Each probe owns its local data and telemetry signature. Replacement panels increment the local generation and reset both.

### Verified in-game

The 2026-08-11 Deadlock session produced 16 probe-ready lines and 21 direct data lines. All parsed widths had positive parents and percentages from 0–100; no probe exceptions were present.

## Milestone 2: ESC editor lifecycle

Implemented source files:

- `panorama/layout/hud_escape_menu.xml` preserves the stock ESC layout and adds the explicit `HP COLORS` row plus editor panels.
- `panorama/scripts/hp_colors_menu.js` owns open, close, category/tab navigation, and hold-to-peek.
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

`hp_colors_menu.js` owns one versioned session snapshot. Changed controls publish immediately. While the master switch is enabled, the unchanged cached snapshot replays at 1-second hot, 3-second warm, then 8-second idle intervals because isolated late unit-status contexts cannot read the ESC root attribute. Each `healthbar_probe.js` context accepts a snapshot once, ignores identical replays, and reapplies its local cache when a bar or its parts are discovered or replaced.

The renderer classifies stock relation classes neutral-first, then enemy/friend. It changes only settings-owned inline styles and clears them when customization is bypassed so stock CSS resumes.


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
- Horizontal and vertical translation of the complete healthbar stack without moving the unit icon.
- Ultimate-ready icon color that follows the final customized bar color or uses one custom color.

The renderer classifies relation, team, building, sentry, and boss facts from the current overlay ancestry. Neutral classification remains authoritative. Exclusions bypass relation-owned bar, feedback, shield, and ultimate-icon colors while global size and position controls remain active. Ultimate-icon styling owns only inline `washColor`; stock visibility and boss-specific images remain engine-owned.

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
9. Move horizontal and vertical position controls through positive, negative, and zero values; require the complete bar stack to move without moving the unit icon.
10. Test ultimate-icon Follow Bar and Custom modes on enemies and customized allies; require excluded, neutral, unclassified, and bypassed icons to return to stock.
11. Drag each native Hue, Saturation, and Lumen slider; require the slider value, canonical hex, and visible bars to update live, then require one Undo to restore the color from before that slider gesture.
12. Exercise Reset Section, Peek, Done, and Escape, including palette dismissal.
13. Exit and require config/role/data logs with no rewrite exceptions.


## Milestone 7: HP readout

Implemented controls:

- Show or hide the enemy HP number.
- Current/max HP, percentage, and current-only formats.
- Font chooser with Default (`Retail Demo, Noto Sans, sans-serif`), Oracle (`VALVEOracle, Reaver, sans-serif`), and Pulp (`VALVEPulp, Noto Sans, sans-serif`). Runtime writes the expanded families because stock `sans`, `oracle`, and `block` are compile-time CSS aliases.
- Text size plus direct horizontal (`-405px…405px`) and portable vertical (`-35px…840px`, default `500px`) offsets.
- Bar-derived or custom low/mid/high text colors. Bar Color inherits the enemy bar's Fixed/Gradient mode and shared thresholds, with those followed controls visible but disabled. Custom enables its own Fixed/Gradient choice and edits the same shared thresholds. The white label is tinted through `washColor`, matching the bar and legacy rendering path instead of assigning a darker flat `color`.

The stock overlay exposes only `unit_healthbar_pip_label`, so the rewrite owns `hp_counter_anchor` and one `hp_counter` label without changing stock fill geometry. Maximum HP comes from the stock pip string and current HP from the existing shield-aware fill ratio; percentage remains available when a maximum cannot be derived. Enemy-disabled, excluded, neutral, ally, unclassified, and bypassed paths collapse and clear the owned label. Pip-text changes and replacement counter panels invalidate local caches and reapply through the existing scan and paint loops.

The readout uses the legacy non-displacing layout: a `100%` × `fit-children` `WindowRoot`, a bottom-aligned `fit-children` `UnitStatus`, a `fit-children` × `300px` `InfoHealthContainer`, and an ignored-flow `100%` × `100%` bottom-aligned `hp_counter_anchor`. The anchor is a direct child of `UnitStatus`, outside the finite health container. Live geometry proved that the engine-owned world-panel root is fixed at `2000px × 1000px`; text translated near the lower edge leaves that texture even though Panorama continues to lay it out. The portable VPK does not mutate external game files or run console commands. Precise-pip calculation is session-scoped and shows a gameinfo.gi warning with copyable enable values when turned on and copyable defaults plus a deletion reminder when turned off; the UI never claims it applied or verified them.

The focused VM regression covers all formats, shield-aware values, missing pip data, visibility/scope, size, offsets, fixed/gradient colors, team-high/custom color ownership, unchanged-write caching, and replacement replay.

## Milestone 8: health pips, enemy levels, and low-HP effects

Implemented controls:

- Enemy health-pip visibility while leaving the engine-owned pip text and geometry untouched.
- Optional precise-pip parsing that interprets minor marks as 10 HP after the user configures the copied ConVars block in `gameinfo.gi`; disabling it shows the default values and reminds the user to remove unused custom entries.
- Enemy-player level visibility with engine-bound level text and custom tier boundaries at levels 11, 19, 27, and 35.
- Enemy low-HP pulse with an inclusive threshold, 30–300 BPM speed, three intensity levels, optional fixed/gradient pulse color, and temporary non-culling bar hiding. Two independent toggles control HP-number pulse animation and pulse-time text modifiers. The modifier toggle enables independent text size plus horizontal and vertical offsets while the pulse is active, restoring normal geometry above the threshold; it does not enable text animation. Normal brightness pulse targets only `unit_healthbar_lagging`; custom Gradient keeps the base fill color and CSS-pulses a custom-color overlay across the live fill width, independent of health depth.
- Ally low-HP pulse with an independent threshold, speed, intensity, and optional fixed color.

Pulse animation is CSS-driven. The existing paint loop changes namespaced classes, duration, and the owned custom-color overlay only when pulse state, health width, or configuration changes; it does not animate brightness in JavaScript. Bypass, role changes, exclusions, removal, and panel replacement clear rewrite-owned pulse and level state so stock styling resumes.

The current stock layout retains the engine pip label but no level subtree, while stock CSS still defines `#unit_level_label`. The rewrite therefore adds one minimal circular `LevelContainer` and current engine `{i:player_level}` label to its stock-derived override. It never creates the obsolete `healthpips`/`pip_image` path.

## Milestone 9: enemy-player kill marker

Implemented controls:

- Enable or disable the static enemy-player kill marker.
- Place the marker at a canonical `5%–80%` health threshold.
- Set marker width from `1px–100px` and choose an independent color.

The marker is a rewrite-owned, non-interactive overlay directly under `UnitHealthbarContainer`. It never writes engine-owned fill widths. Runtime shows it only for visible enemy panels carrying the stock `player` class; allies, neutrals, non-player units, buildings, sentries, bosses, and boss barracks always remain marker-free. Geometry uses the cached live health-parent width, clamps the effective marker width to that surface, and skips unchanged visibility, position, width, and color writes. Bypass, hidden or pulse-hidden bars, role changes, removal, and panel replacement clear all marker-owned inline state.


## Milestone 10: rewrite-native live transfer

The editor copies a compact single-line code with the exact grammar `HPCR2` followed by a JSON array of `[settingIndex, value]` pairs. Export orders pairs by ascending index and omits values equal to shipped defaults. Indexes use the closed, append-only `DEFAULTS` order; unknown indexes are rejected, and any reorder or meaning change requires a new `HPCR` schema prefix. Imports may list valid indexes in any order, but duplicate indexes, malformed pairs, foreign prefixes, and wrong known value types are rejected before normalization. Codes contain no revision, aliases, Base64, presets, or persistence data. Opening the transfer dialog performs no clipboard action; the user explicitly chooses **COPY CURRENT** or **IMPORT & APPLY**. Import requests the stock `TextEntryInsertFromClipboard` event only after that action, and the visible single-line field remains the fallback when automatic insertion is unavailable. Invalid codes preserve live state and Undo history. A valid changed import publishes one wildcard snapshot and creates one Undo entry.

## Milestone 11: hero identity and match lifecycle

The editor owns transient hero identity separately from the canonical healthbar settings snapshot. **Auto** reads the generated `CitadelHudTopBarPlayer.LocalPlayer` card, resolves its `.HeroName` through an exact English retail-name table, and exposes the resulting stable `hero_*` key only after two matching active-match samples. Blank, placeholder, fuzzy, and unmapped names remain unknown. **Manual Override** uses one explicitly selected stable key, while **Off** produces no effective hero and skips local-card scans.

The lifecycle watcher classifies lobby/pregame, active match, post-match, and transitional states from current HUD classes plus a parseable live topbar clock. It clears detected identity and panel caches on lifecycle changes, rediscovers replaced local-player cards and stale clocks, polls at one second while active or transitioning and five seconds in lobby/post-match, and rejects stale scheduled callbacks by generation. Identity modes and the manual choice are session-only metadata: they do not alter `DEFAULTS`, HPCR2, Undo, the root settings snapshot, or unit-status publications.

## Milestone 12: hero scopes and effective settings

The menu keeps the canonical global base separate from ordered, session-scoped snapshot rows. Each row normalizes to **Off**, **All Heroes**, or **Selected Heroes**; selected hero keys are validated against the stable catalogue, deduplicated, and sorted in catalogue order, while an empty Selected row becomes Off. Resolution checks the first matching Selected row, then the first All Heroes row, then the global base. Unknown identity never selects a hero row, but All Heroes remains an explicit fallback.

Only the resolved effective snapshot enters the existing root config attribute, `ClientUI_FireOutput`, and adaptive replay path. Base edits, scope edits, and hero transitions that leave the effective values unchanged do not increment the revision or dispatch config. The Overview / Hero page owns one **Current Settings Scope** row: **Capture Current** freezes the global base into that row, and a searchable multi-select picker assigns stable heroes. Scope metadata remains outside `DEFAULTS`, HPCR2, Undo, and unit-status payloads.

### Verified in-game

The deployed 2026-08-14 build was user-smoke-tested after restart. Hero scopes, effective-setting transitions, fallback behavior, and the optimized transition-only healthbar telemetry worked without reported regressions.

## Next implementation: Milestone 13 preset records and application

The next focused slice is a rewrite-native, session-only preset repository built on the proven effective-settings resolver:

1. Define baked and user preset records with stable IDs, normalized values, scope mode, and selected stable hero keys.
2. Load baked records before session user records in deterministic order.
3. Document one default startup preset.
4. Apply through the existing normalize → resolve → changed-effective publish path; do not add another settings authority.
5. Wait when a Selected Heroes preset requires identity that is still unknown; never guess a hero.
6. Add only enough UI to create and apply a session preset for live hero-preset testing.

Rename, delete/hide, reorder, copy, bundles, import, and durable persistence remain later preset-management slices. Legacy preset formats remain excluded.

## Not implemented yet

Settings, scopes, and the next preset slice remain session-scoped because the Phase 0 runtime probe found no native `$.persistentStorage` interface. Durable persistence, full preset management, remaining editor surfaces, signature-tier conditions, and measured runtime hardening remain unimplemented. See `to-do.md` for the checklist and explicitly deferred compatibility work.
