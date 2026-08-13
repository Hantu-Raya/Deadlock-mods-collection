# HP Colors Rewrite — Remaining Work

This checklist compares the clean rewrite with active behavior in `hp_colors/`. It tracks rewrite-native features only. Legacy aliases, compact v99 encoding, old token formats, and old bridge compatibility are deferred.

## Guardrails

- Preserve one menu-owned canonical snapshot and one local bar registry per unit-status context.
- Preserve immediate config application, bounded one-second discovery, and adaptive `0.15/0.25/1.5s` paint cadence.
- Keep pulse animation CSS-driven.
- Never write engine-owned healthbar widths, pip or level text, icon images, or icon visibility.
- Keep neutral and non-player targets outside enemy-player-only features.
- Add one focused behavior slice at a time, then run the focused suite, build while Deadlock is stopped, compare deployed hashes, restart Deadlock, and smoke-test in game.

## Priority 1 — Rewrite-native persistence

- [ ] Define one versioned rewrite-native storage payload for the canonical settings snapshot.
- [ ] Persist settings across Deadlock restarts without legacy aliases or v99 compact encoding.
- [ ] Normalize every loaded value through the existing setting rules before publication.
- [ ] Restore defaults when storage is absent, malformed, or from an unsupported version.
- [ ] Skip unchanged storage writes and debounce continuous slider/color gestures; commit final values immediately.
- [ ] Hydrate before publishing the first authoritative snapshot.
- [ ] Prevent late unit-status contexts from painting defaults while valid persisted state is still loading.
- [ ] Mirror the hydrated canonical snapshot through the existing rewrite message path for late/replaced contexts.
- [ ] Add **Reset All** for settings while keeping section reset and Undo behavior distinct.
- [ ] Add restart, corruption, unsupported-version, unchanged-write, and late-context regressions.

Legacy evidence: `hp_colors/panorama/scripts/anita_ui_core.js:4108-4506`, `3967-4115`, `10270-10890`; `hp_colors/panorama/scripts/healthbar_logic.js:714-879`, `2258-2305`.

## Priority 2 — Rewrite-native import and export

- [x] Define one readable rewrite-native export format derived from the canonical storage payload.
- [x] Add live settings export to clipboard.
- [x] Add a focused import dialog that validates before replacing live settings.
- [x] Keep invalid imports non-destructive and show a concrete error state.
- [x] Apply valid imports immediately, publish once, and add one Undo entry. Durable persistence remains unavailable after the Phase 0 runtime probe.
- [x] Keep preset import separate from direct live-settings import.
- [x] Add round-trip, invalid-input, partial-input, clipboard-failure, and Undo regressions.

Legacy evidence: `hp_colors/panorama/scripts/anita_ui_core.js:7106-7214`, `9251-9416`, `2434-2447`; `hp_colors/panorama/styles/anita_ui.css:2442-3068`.

## Priority 3 — Hero identity and match lifecycle

- [x] Detect the local hero from current HUD panels and normalize it to a stable `hero_*` key.
- [x] Support **Auto**, **Manual Override**, and **Off** detection modes.
- [x] Expose the detected or overridden hero clearly in the editor.
- [x] Define unknown-hero behavior explicitly; never guess a scoped preset.
- [x] Detect lobby, active-match, hero-change, and post-match transitions.
- [x] Reset detection and effective-selection caches on match/lobby transitions.
- [x] Settle hero detection before exposing effective hero identity to avoid transient wrong presets.
- [x] Use slower polling outside active matches and stop stale scheduled callbacks by generation.
- [x] Add mocked lifecycle regressions.
- [ ] Verify actual panel IDs, locale behavior, and transition timing in game.

Legacy evidence: `hp_colors/panorama/scripts/anita_ui_core.js:2860-3030`, `3724-3970`; `hp_colors/panorama/scripts/healthbar_logic.js:1218-1249`.

## Priority 4 — Hero scopes and effective settings

- [x] Add scope modes **Off**, **All Heroes**, and **Selected Heroes**.
- [x] Store selected heroes as deduplicated stable IDs.
- [x] Normalize Selected-with-no-heroes to Off.
- [x] Keep global settings as the fallback when no scoped entry matches.
- [x] Resolve effective settings deterministically by scope and explicit priority.
- [x] Keep base settings separate from effective hero-scoped settings.
- [x] Publish only when the effective snapshot changes.
- [x] Add independent row-scope editing and a searchable/selectable hero picker.
- [x] Add unknown-hero, global-fallback, duplicate-ID, last-selected removal, and priority regressions.

Legacy evidence: `hp_colors/panorama/scripts/anita_ui_core.js:1229-1567`, `8170-8449`, `3724-3970`.

## Priority 5 — Presets

### Repository and application

- [ ] Define rewrite-native baked and user preset records with stable IDs.
- [ ] Load baked presets deterministically before user presets.
- [ ] Choose and document a default startup preset.
- [ ] Apply a preset through the same canonical normalize/persist/publish path as manual edits.
- [ ] Preserve hero scope metadata in preset records.
- [ ] Wait rather than applying a mismatched selected-hero preset when hero identity is unknown.

### User operations

- [ ] Save current settings as a named user preset.
- [ ] Rename user presets and display-name override baked presets without changing stable identity.
- [ ] Delete user presets and hide baked presets without corrupting priority order.
- [ ] Reorder movable presets with deterministic boundary behavior.
- [ ] Copy one preset.
- [ ] Copy all presets as a bundle, excluding the synthetic Current row.
- [ ] Import a preset or bundle into the repository without applying it to live settings.
- [ ] Keep each preset’s scope, selected heroes, conditional rules, and name intact through copy/import.
- [ ] Persist user presets, ordering, hidden baked IDs, names, scopes, and selection across restarts.
- [ ] Add repository, ordering, rename, delete, copy, bundle, import, restart, and selection-repair regressions.

Legacy evidence: `hp_colors/panorama/scripts/anita_ui_core.js:1293-2493`, `3374-3970`, `7620-8723`; `hp_colors/panorama/styles/anita_ui.css:660-1551`.

## Priority 6 — Remaining editor surfaces

- [ ] Add detached, edge-clamped tooltips for controls that need detailed explanations.
- [ ] Reposition an open tooltip when its owning settings list scrolls.
- [ ] Add a dedicated two-axis position picker while retaining bounded numeric entry.
- [ ] Keep position writes throttled during drag and immediate on release.
- [ ] Add explicit reset confirmation/feedback where destructive scope is not obvious.
- [ ] Decide whether to retain the external preset-builder link; omit it if the in-game preset editor fully replaces it.
- [ ] Decide whether to add the donation link; it is not required for healthbar behavior.
- [ ] Verify popup placement under UI scaling and scrolling in game.

Legacy evidence: `hp_colors/panorama/scripts/anita_ui_core.js:6540-6828`, `7346-7518`, `9016-9473`; `hp_colors/panorama/styles/anita_ui.css:539-657`, `1998-2006`, `2442-3068`.

## Priority 7 — Ability signature-tier conditions

- [ ] Define a conditional rule as setting ID, ability slot `1–4`, minimum tier, and typed override value.
- [ ] Restrict rules to persisted settings with a supported value editor.
- [ ] Add a row-level condition indicator and focused rule editor.
- [ ] Read current ability-slot tier classes from the live local-hero HUD.
- [ ] Fall back to the base setting when the slot panel or tier is unavailable.
- [ ] Re-scan after hero changes, match resets, and ability-panel replacement.
- [ ] Keep conditional base values and effective values separate.
- [ ] Publish only changed effective values and clear stale overrides when conditions stop matching.
- [ ] Add all four slots, tier boundaries, panel replacement, hero change, unavailable-panel, typed-value, and stale-rule regressions.
- [ ] Validate the real ability hierarchy and tier timing in game before considering the slice complete.

Legacy evidence: `hp_colors/panorama/scripts/anita_ui_core.js:9549-10317`; `hp_colors/panorama/styles/anita_ui.css:2007-2441`.

## Priority 8 — Runtime hardening after persistence/scopes

These are reliability behaviors, not new visual controls. Add them only with measured evidence and without increasing the active paint cost.

- [ ] Add a bounded first-paint hydration gate once durable persistence exists.
- [ ] Add an explicit match-reset generation/acknowledgement path for scoped state.
- [ ] Measure whether stock Panorama overwrites rewrite-owned inline styles during idle periods.
- [ ] If live evidence confirms drift, add a slow watchdog that validates only owned properties and backs off when clean.
- [ ] Preserve local ownership, replacement cleanup, zero-width backoff, and single-flight scheduling.
- [ ] Record operation counters before and after each hardening change.

Legacy evidence: `hp_colors/panorama/scripts/healthbar_logic.js:714-879`, `983-1043`, `1218-1249`, `2258-2305`, `3604-3759`.

## Explicitly deferred compatibility

Do not implement these until rewrite-native features are complete and compatibility is requested:

- [ ] Legacy compact v99 payload encoding.
- [ ] Legacy setting aliases and `kzs` migration.
- [ ] Legacy versions `1/97/98/99` import acceptance.
- [ ] Legacy Anita token and bundle formats.
- [ ] Legacy bridge event names and shared-state keys.
- [ ] Legacy preset-store VPK interchange.

Legacy evidence: `hp_colors/panorama/scripts/anita_ui_core.js:849-1055`, `3028-3367`, `3967-4115`.

## Do not port

- Direct reads from stale engine setting paths such as `GetSettingString` or `deadlock_hero_debuts_seen`.
- Old mouse/context-menu debug routing for conditional controls.
- Generated Closure output, compiled assets, staging trees, VPKs, or archives.
- Unsupported engine-setting controls or external game-file mutation.
- A second settings authority, overlay-to-menu request graph, per-frame tree scan, or JavaScript pulse animation loop.

## Already implemented

The rewrite already owns the ESC editor lifecycle, immediate session snapshot publication, section reset, Undo, native HSL picker, rewrite-native live settings import/export, transient Auto/Manual/Off hero identity and match lifecycle, enemy/ally bar colors and visibility, gradients and thresholds, feedback/shield colors, dimensions and position, team-high color, building/boss exclusions, ultimate-icon color, HP readout formats/fonts/colors/placement, pips, optional precise-pip calculation with manual gameinfo.gi copy warnings, enemy levels, enemy/ally CSS pulse, and enemy-player-only kill marker. Do not reopen these slices without a reproduced defect or measured performance regression.
