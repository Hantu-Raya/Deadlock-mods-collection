# Ticket 24 audit — Astra

**Findings: P0 0 · P1 0 · P2 2 · P3 0.** Reviewed the current untracked implementation against `brief-24.md`, ticket 24's Implementation section and the v2 conditions reference. Source and tests were not edited.

## P2 — Convert historical ultimate-size rule percentages before native promotion

**Location:** `panorama/scripts/hp_colors_v3_from_v2.js:178-195`, especially the historical condition adjustments at 183–186; native promotion at 121–127.

Pre-level-ticket records retain `ultimateTimerSize` as a percentage. The pending-settings upgrade converts it with `/ 5`, but the corresponding `v2conditions.ultimateTimerSize.value` receives no conversion. Native rule promotion instead clamps the percentage to the current `ultSize` bounds of 5–40 pixels. Ticket 13 documents the record-v3 transition from 25–200% to 5–40px (`issues/13-indicators-level-and-ultimate.md:21-22`).

**Reproduction:** Load a framed v1 bundle with `v2pending: {ultimateTimerSize: 150}` and `v2conditions: {ultimateTimerSize: {slot: 1, minTier: 2, value: 150}}`. Through the real storage/menu/TopBar seam, give signature slot 1 `Tier3` and advance eight seconds. The authored size correctly becomes **30px**, but the native rule and published effective size become **40px**. The rewritten save also contains the incorrect **40px** rule. Both originally represented 150%, so the condition should resolve to 30px as well.

**Impact:** Existing ultimate-size conditions change appearance during upgrade, and the wrong value replaces their legacy metadata in the durable save. Normalize the historical rule value at its version boundary before native validation; do not re-convert rules already stored in pixels.

**Coverage gap:** The new upgrade test uses v11 width rules already in pixels. Existing pending-ultimate tests check scalar sizes, not historical conditional sizes.

## P2 — Do not gate historical rule-unit upgrades on unrelated pending metadata

**Location:** `panorama/scripts/hp_colors_v3_codec.js:313-330`; `panorama/scripts/hp_colors_v3_from_v2.js:183-186`.

Historical rule-unit repairs live inside `promotePending`, but the codec calls that function only if a bundle/preset has `v2pending` or `v2scopes`. A record containing `v2conditions` alone skips those repairs, then still runs `promoteConditions`. Thus an unrelated empty metadata object changes the resulting rule value. Such records are accepted by the old metadata grammar; pending metadata can also be removed by the converter's oversize fallback while conditions remain (`hp_colors_v3_from_v2.js:327-345`).

**Reproduction:** Load a v5 bundle with no presets and only `b.v2conditions.rejuvScale = {slot: 1, minTier: 2, value: 150}`. Set slot 1 to `Tier3`. The resulting native rule, effective publication and rewritten save all use **48px**, the native maximum. Repeat with the identical record plus `b.v2pending: {}`: all three correctly use **36px**. This is the existing pre-v6 conversion, `150 × 24 / 100`, not a new interpretation of the units.

**Impact:** Equivalent legacy rules migrate differently depending on whether an unrelated metadata field survived. Rule-only older saves or bundle codes can silently acquire larger rejuvenator geometry; the same gate also skips v1 kill-marker rule repair. Run version-specific condition normalization whenever the affected condition metadata exists, independently of scalar pending promotion, and apply it exactly once.

**Coverage gap:** Existing historical rejuvenator and kill-marker condition tests always include `v2pending`, so they do not exercise the skipped branch.

## Verification and reviewed boundaries

- Independently ran the ability-conditions, hero-routing, migration, codec, storage, menu-actions, logging, own-HUD and renderer suites: **723 passed, 0 failed**. A context-mode request timed out; the reported result is from the completed normal-tool fallback run, not that unconfirmed attempt.
- Exercised **all 167 generated setting-cell condition actions** through real menu handlers: choose a different typed value, Apply, inspect the stored rule, and Undo. All passed. Historical migration failures above were additional in-memory VM reproductions through hydration, tier sampling, publication and saving; no test files were added.
- Both canonical and QOLLOCK generator `--check`s passed. Existing operation ceilings passed, including baseline **164.3 active / 145.7 idle / 6 dormant** operations per bar per second and **27.6/s** for the no-rule HUD/identity watcher.
- No additional actionable defect was established in authored/effective separation, settings/bundle rule encoding and caps, newer-code/save handling, referenced-slot-only sampling, spectator rejection, generation/epoch guards, hero/new-slot clearing, dialog/picker draft isolation, shared Undo/page-reset atomicity, effective-change publication or preset/routing rule replacement. The relevant tests observe real menu events, published config, stored records and panel operations rather than asserting source wording.
- Release-mode VM logging checks passed; no pak builds, deployment or game launches. Compiled-release behavior and actual native UI/rendering remain unverified.

## Fixes

- Both P2 findings were reproduced red first in two VM-seam regressions in `tests/ability-conditions.test.js`: historical ultimate rules produced 40px instead of 30px, and rule-only v1 kill-marker metadata produced 10px instead of 5px.
- Historical rule-unit normalization now belongs to `promoteConditions(item, fromVersion)`, independently of scalar pending promotion. Ultimate size converts percentages before v3; v1 kill-marker width divides by ten; rejuvenator size converts percentages before v6. Native mapping then validates the repaired value and removes the legacy metadata, preventing repeat conversion.
- The regressions cover 22 save/bundle-code scenarios: old and already-pixel version boundaries, pending metadata absent versus empty, ultimate rules in active settings/presets/scopes, effective publication, rewritten durable records and restart. Rule-only rejuvenator metadata now resolves to 36px with or without `v2pending`.
- Final verification: canonical **1096/1096**, QOLLOCK **24/24**, v2 storage **48/48**; both generator `--check`s current. Existing operation ceilings remain green. No pak builds, deployment or game launches; `LIVE-VERIFIED.md` unchanged.

## Re-audit

**Both original P2 findings are resolved. Open findings: P0 0 · P1 0 · P2 0 · P3 0.**

- Re-ran the original v1 ultimate-size reproduction through hydration, signature-tier sampling, publication and durable saving: authored size, native rule, effective size and saved rule now all equal **30px**.
- Re-ran the original v5 rejuvenator records with `v2pending` absent and empty: both now produce **36px** in the native rule, effective publication and rewritten save.
- Reviewed the shared normalization fix and its callers: historical repairs receive the original record version, current v2 imports do not repeat their unit conversion, already-pixel versions skip repairs, and legacy metadata is removed after promotion. The new regression helper checks actual rules, effective publication, rewritten saves and restart across the documented 22 scenarios.
- Independently ran ability-conditions, migration, codec and storage suites: **441 passed, 0 failed**; both generator `--check`s passed. Context-mode timed out again; these results came from the completed normal-tool fallback run.
- No new actionable defect was found in the fixes or affected paths. Only this audit section was edited; no source/test changes, pak builds, deployment or game launches. Compiled-release and live behavior remain unverified.

## Ability icon rework

**Findings: P0 0 · P1 0 · P2 0 · P3 0.** No actionable defect found against `.scratch/hpv3_abil/brief-abilities.md`.

- **Generation and pinning:** `tools/game-data.js:71-89,153-184` validates the newly vendored abilities file through the same manifest/hash checks as heroes, resolves each exact signature binding to its root ability image, and strips KV3 typed-string wrappers in the parser. Both inputs share commit `c9e648071661aaaa794507bb304cf52679eb2a10`. Independent derivation produced 67 four-entry arrays, 13 null fallbacks and no malformed/non-image paths. The generated catalog and runtime contract are covered by deterministic generation and stale-output checks; upstream ability-only drift has a negative fixture.
- **Dialog state:** `hp_colors_v3_menu.js:328-335,373-403,533-556,591-620` uses only the detected identity and generated catalog. Opening, hero changes, lifecycle clearing and tier changes refresh the owned panels. Image writes are cached by panel identity and path; unknown/missing images hide the previous glyph through `HasIcon` and expose the number fallback. Source inspection found no `Image.src` reads. Slot/tier clicks remain isolated drafts, unavailable slots remain selectable, and both native tooltip events remain bound.
- **CSS:** The added slot styles use round off-white discs, dark glyphs/badges, selected rings and tier labels, without forbidden masks, shadows, clipping or new transitions. The complete generated stylesheet check passed: 625 rules, maximum 10 selectors per rule. Native visual appearance is not established by these static/VM checks.
- **Test strength and execution:** Independently ran `game-data.test.js`, `generator.test.js` and `ability-conditions.test.js`: **59 passed, 0 failed**. Tests assert literal Infernus/Seven paths through actual `SetImage` calls, throw on `src` access, count unchanged-path writes, exercise open-dialog hero switching and null/unknown fallback, and check selection, tier labels, tooltip dispatch and draft isolation. Pin-corruption/drift fixtures fail the real CLI; determinism tests regenerate and corrupt every output rather than comparing two aliases of the same catalog. Both canonical and QOLLOCK `--check`s passed.
- Only this audit section was changed. No source/test edits, pak builds, deployment or launches; full-suite results in the implementation note were not independently rerun for this quick review.
