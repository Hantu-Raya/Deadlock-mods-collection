# Ticket 23 audit — Astra

**Findings: P0 0 · P1 0 · P2 3 · P3 0.** Reviewed the current untracked implementation against `brief-23.md`, ticket 23's Implementation section, the persisted-source decision, and the v2 reference/actual routing code. Source and tests were not edited.

## P2 — Preserve the hero-scoped fallback when migrating a Current whose preset is gone

**Location:** `panorama/scripts/hp_colors_v3_from_v2.js:277-282`; related validation at `panorama/scripts/hp_colors_v3_codec.js:179`.

The converter records `sourceWasMapped` only when Current's `sourcePresetId` matches a surviving user preset. A valid v2 session can retain a Selected/Except Current after its source preset is deleted: v2's delete handler removes the library row, not Current. Current can also be hero-scoped without a source preset. In both cases migration discards the information needed to leave that hero-scoped look.

**Reproduction:** Load a schema-4 v2 save with no user presets and `scope_current` containing `sourcePresetId: "user_0001"`, `mode: "selected"`, `heroes: ["hero_inferno"]`, and `enemyLow: "#ABCDEF"`. Settle Seven through the real TopBar watcher. V3 keeps `#ABCDEF` and emits neither source metadata field. Running the same session through the v2 state engine and settling Seven produces the built-in default, `#FD4949`.

**Impact:** After migration, a hero-specific appearance persists on unrelated heroes and in the hideout instead of taking v2's built-in fallback. Preserve the scoped-origin flag independently of whether the source id still exists, with a validated representation for a missing source. The relevant v2 behavior is `hp_colors_v2_state.js:1944-1958,2694-2705`.

**Coverage gap:** `tests/hero-routing.test.js:242-250` covers only a Current whose source preset survives.

## P2 — Record source-only explicit Apply operations in Undo

**Location:** `panorama/scripts/hp_colors_v3_menu.js:565-573,611-614`; `panorama/scripts/hp_colors_v3_storage.js:870-879`.

Explicit Apply persists the new source first, then calls `editSettings`, which returns immediately when scalar settings are unchanged. The local source fields change afterward, outside history recording. Consequently, applying another preset with identical settings changes routing behavior but creates no Undo entry.

**Reproduction:** Create A and B with identical settings, map Infernus to A, and start with those settings active. Click Apply A, then Apply B. The real menu/store report source B, but Undo remains disabled; invoking Undo leaves B as the source. This was reproduced through the shipped layout and native button handlers.

**Impact:** The user cannot undo the Apply that changed the same-source guard. Subsequent edits that would survive detection with source A are overwritten when Infernus settles against source B. V2 explicitly treats a different source id as a real Apply even when values match (`hp_colors_v2_state.js:2618-2632`). Snapshot before changing the source and record after settings and source have both been updated; scalar equality alone must not suppress this history entry.

**Coverage gap:** Current Apply/restart tests use a preset whose values differ from the active settings; none applies two equal-valued presets and checks source restoration.

## P2 — Normalize legacy user `off` mode before building migration routes

**Location:** `panorama/scripts/hp_colors_v3_from_v2.js:183-199,243-260`.

The converter accepts a user preset with `mode: "off"`, but retains that mode until route construction, which considers only Selected, Except and All. V2 normalizes user `off` to `all` before `applyAutomaticRoute`; only the baked default retains Off (`hp_colors_v2_state.js:349-365`).

**Reproduction:** Load a valid schema-4 envelope with user preset `user_0001`, `mode: "off"`, `heroes: []`, and `enemyLow: "#112233"`; settle a known hero. V2 normalizes and applies `user_0001`, producing `#112233`. V3 accepts and saves the preset but produces an empty hero map, a null default, and the shipped `#FD4949` appearance. Changing only the input mode to `all` makes v3 route correctly.

**Impact:** Accepted legacy user presets silently lose their automatic/default routing on conversion. Normalize user modes before both base materialization and route selection, while preserving the baked default's Off semantics.

**Coverage gap:** The migration routing case tests Selected/Except/All precedence, but not v2's user-mode normalization.

## Verification and remaining limits

- Ran the focused routing, migration, storage, logging, own-HUD and renderer suites: **675 passed, 0 failed**. The three edge-case reproductions above were additional in-memory VM runs; no regression files were added.
- Both canonical and QOLLOCK generator `--check` commands passed.
- Existing operation checks passed: **164.3 active / 145.7 idle / 6 dormant** counted operations per bar per second; combined HUD/identity watcher **27.6/s** against its 30/s ceiling. Routing remains menu-owned, not per-bar.
- Reviewed generation/epoch guards, retirement/reload, gesture and color-picker deferral, same-source preservation, delete/import/replace reference handling, and whole-metadata-key conflict merging. No additional actionable defect was established in those paths. Existing routing tests assert real published settings, UI state and persisted records rather than source-text checks.
- Release-mode VM logging checks passed, and isolated debug staging exercised detection, clearing, lifecycle and route logs. No pak builds, deployment or game launches were performed; compiled-release and live engine behavior remain unverified.

## Fixes

- All three P2s were reproduced red first in `tests/hero-routing.test.js` and fixed at their shared boundaries.
- Migration now preserves a hero-scoped Current's origin independently of source existence: explicit `sourcePresetId: null` with `sourceWasMapped: true` is valid and survives save/restart, so a known hero takes the built-in fallback.
- Explicit Apply snapshots before changing settings/source and records afterward. A source-only change creates exactly one Undo entry; Undo restores the previous source and its same-source edit protection.
- User Off normalizes to All before materialization/routing for both v2 saves and HPCRP1 imports. The baked default remains Off; regression coverage proves first-All precedence and inherited `own` values.
- Final verification: canonical **1085/1085**, QOLLOCK **24/24**, v2 storage **48/48**; both generator `--check`s current. Per-bar/HUD operation ceilings remain green. No paks built, deployment or game launch.

## Re-audit

**All three original P2 findings are resolved. Open findings: P0 0 · P1 0 · P2 0 · P3 0.**

- Re-ran the original missing-source schema-4 migration reproduction through the real menu/store/TopBar seam: Seven now takes `#FD4949`; entering the hideout also takes the built-in fallback. Reviewed the explicit-null source validation and the new Selected/Except, absent/deleted source, save/restart regression coverage.
- Re-ran equal-settings Apply A → Apply B → Undo: Undo is enabled, restores source A and its mapped-origin flag, and a subsequent `#ABCDEF` edit survives Infernus detection. Reviewed the complete settings/source history transition and the regression asserting exactly one Undo entry.
- Re-ran the original user-Off migration: Infernus now receives `#112233`, and `heroDefault` is `user_0001`. Reviewed normalization before materialization and the save/HPCRP1 regressions for first-All precedence, `own` inheritance and baked-Off exclusion.
- Independently ran routing, migration, storage, menu-actions, codec and logging suites: **460 passed, 0 failed**. Both canonical and QOLLOCK generator `--check`s passed.
- No new actionable defect was found in the fixes or their affected callers. Only this audit section was edited; no source/test changes, pak builds, deployment or game launches. Live and compiled-release verification remain outside this re-audit.
