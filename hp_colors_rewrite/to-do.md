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

- [x] Define rewrite-native baked and user preset records with stable IDs.
- [x] Load baked presets deterministically before user presets.
- [x] Choose and document a default startup preset.
- [x] Apply a preset through the same canonical normalize/persist/publish path as manual edits.
- [x] Preserve hero scope metadata in preset records.
- [x] Wait rather than applying a mismatched selected-hero preset when hero identity is unknown.

### User operations

- [x] Separate creation from updates: New Preset opens a create-only form, while clicking a session row exposes an explicit overwrite warning and Save & Apply without changing its stable ID.
- [x] Expose only All Heroes and Selected Heroes user-preset categories; keep the canonical base hidden behind baked Rewrite Default.
- [x] Migrate legacy user Global records to All Heroes without applying, publishing, or replacing the hidden base.
- [x] Rename user presets and display-name override baked presets without changing stable identity.
- [x] Delete user presets and hide baked presets without corrupting priority order.
- [x] Reorder movable presets with deterministic boundary behavior.
- [x] Preserve monotonic user preset IDs after deletion; never reuse a retired stable ID.
- [x] Repair pending and selected repository references after rename, delete/hide, or reorder without applying or publishing a preset.
- [x] Copy one selected preset as an HPCRP1 repository code.
- [x] Copy all baked and user presets as a deterministic bundle, excluding the synthetic Current scope row.
- [x] Import a preset or bundle into the repository without applying it to live settings.
- [x] Keep each preset’s scope, selected heroes, conditional metadata, and name intact through copy/import.
- [ ] Persist user presets, ordering, hidden baked IDs, names, scopes, and selection across restarts. Blocked: the verified Deadlock runtime exposes no writable `$.persistentStorage`; panel attributes and `GameUI.CustomUIConfig()` are session-only, while the pak96 preset store is build-time/read-only.
- [x] Add repository, ordering, rename, delete/hide, monotonic-ID, no-publication, reference-repair, copy, bundle, inert-import, metadata, and atomic-rejection regressions.
- [ ] Add restart and durable-selection regressions after a verified writable Panorama persistence seam exists.
- [x] Replace the split Hero / Presets dashboard with one full-width Presets workspace, compact automatic-routing context, a collapsed create/edit form, and no visible identity-debug card.
- [x] Keep repository management row-local; distinguish Apply, Save & Apply, Cancel, ACTIVE, EDITING, and WAITING without conflating selection with live application.
- [x] Auto-hide baked Rewrite Default when Save creates an All Heroes user preset while retaining the baked record as the canonical fallback.
- [x] Make web-builder single and bundle exports hide baked Rewrite Default when they contain an All Heroes user preset, and preserve that hidden state during XML first-boot hydration.
- [x] Verify the redesigned Presets workspace under the currently used in-game UI scale.
- [ ] Verify the redesigned Presets workspace under every other supported UI scale.

Legacy evidence: `hp_colors/panorama/scripts/anita_ui_core.js:1293-2493`, `3374-3970`, `7620-8723`; `hp_colors/panorama/styles/anita_ui.css:660-1551`.

## Priority 6 — Remaining editor surfaces

- [x] Omit detached tooltips by user decision; retain concise inline helper text.
- [x] Omit tooltip scroll repositioning because the detached tooltip surface is not being added.
- [x] Omit the dedicated two-axis position picker by user decision; retain the existing bounded X/Y sliders and numeric entries.
- [x] Omit position-specific drag throttling with the picker; do not change the existing generic slider path without measured need.
- [x] Add explicit Reset Section confirmation and guarded feedback where destructive scope is not obvious; hide Reset Section and Undo on the Presets page.
- [x] Omit the external preset-builder link because the available builder targets the deferred legacy preset/VPK lane.
- [x] Omit the optional donation link because it is unrelated to editor or healthbar behavior.
- [ ] Verify popup placement under UI scaling and scrolling in game.

Legacy evidence: `hp_colors/panorama/scripts/anita_ui_core.js:6540-6828`, `7346-7518`, `9016-9473`; `hp_colors/panorama/styles/anita_ui.css:539-657`, `1998-2006`, `2442-3068`.

## Priority 7 — Ability signature-tier conditions

- [x] Define a conditional rule as setting ID, ability slot `1–4`, minimum tier, and typed override value.
- [x] Restrict rules to serializable canonical settings with a supported value editor.
- [x] Add a row-level condition indicator and focused rule editor where another ability selects Tier 1 and repeated clicks cycle Tier 1 → 2 → 3 → 1.
- [x] Read current ability-slot tier classes from the live local-hero HUD.
- [x] Fall back to the base setting when the slot panel or tier is unavailable.
- [x] Re-scan after hero changes, match resets, and ability-panel replacement.
- [x] Keep conditional base values and effective values separate.
- [x] Publish only changed effective values and clear stale overrides when conditions stop matching.
- [x] Add all four slots, tier boundaries, panel replacement, hero change, unavailable-panel, typed-value, and stale-rule regressions.
- [x] Validate the real ability hierarchy and tier timing in game before considering the slice complete.

Legacy evidence: `hp_colors/panorama/scripts/anita_ui_core.js:9549-10317`; `hp_colors/panorama/styles/anita_ui.css:2007-2441`.

## Priority 8 — Runtime hardening after persistence/scopes

These are reliability behaviors, not new visual controls. Add them only with measured evidence and without increasing the active paint cost.

- [ ] Add a bounded first-paint hydration gate once durable persistence exists.
- [x] Omit an explicit match-reset generation/acknowledgement path because two live sessions found no stale scoped state across four active-match exits. The targeted exit preserved `user_0001` with an unchanged revision. Reopen only with contrary live evidence.
- [x] Measure whether stock Panorama overwrites rewrite-owned inline styles during idle periods. A 2026-08-15 run captured 37m35s across 90 probe contexts and 1,291 summaries with zero transient, confirmed, or recovered drift.
- [x] Omit the watchdog because live evidence found no style drift; do not add clean-state reads without new contrary evidence.
- [x] Verify local ownership, replacement handling, zero-width idle cadence, and single-flight scheduling under counters. The run captured 83 part replacements, zero duplicate scan/paint schedules, and zero-width samples in all 90 contexts; 88 contexts ended at the 1.5-second idle paint cadence and two were still in the 0.25-second recent-change window. All 83 released-style signals were the intentional collapsed kill-marker visibility state, not leaked visible styling.
- [x] Record the drift and scheduling baseline operation counters. The same run exposed 1,921 hero observations and 1,912 unchanged state intents; settled hero samples now no-op and unchanged ability tiers send only once per lifecycle identity. Focused regressions preserve hero settling, tier changes, and epoch resets.

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
