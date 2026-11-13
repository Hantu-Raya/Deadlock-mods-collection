# 10: Undo, page reset, color picker, presets

**What to build:** Players undo edits (slider drag = one step), reset a page with confirmation, pick colors natively, and manage up to 128 presets.

**Blocked by:** 04, 08

**Status:** implemented; VM/generation and coordinated release/debug compile/package acceptance verified; live picker/visual checks remain pending.

**Runs on:** gpt-6.1-sol (med). **Review:** code-review + claude-fable-5-1 review.

- [ ] Undo stack of 40 immutable records with gesture coalescing
- [ ] Page reset confirmation names hidden settings and both sides
- [ ] Native picker with hex fallback; Escape restores opening value
- [ ] 128-preset cap; save refuses past store size with message
- [ ] VM E2E tests boot the real scripts and pass

## Failure modes (written before code)

- F1: Undo records alias mutable settings, exceed 40 entries, include no-op edits or hydration, or restore a menu page/fold instead of only settings.
- F2: A slider drag creates one record per native change, loses its final value, or remains active after blur/page change/close; picker sessions must share the same history and cancel without consuming it.
- F3: Reset touches only visible controls or one side, resets the wrong page after navigation, or publishes/saves before confirmation; confirmation must name both sides and hidden Advanced settings.
- F4: Native picker seeding becomes an edit, invalid RGB events corrupt settings, missing native controls block boot, or Escape closes ESC without restoring the opening color. Hex fallback remains usable and picker sessions make one Undo step.
- F5: Preset names lose v2's trimmed 1–48 character validation and PRESET N collision avoidance; baked Rewrite Default is deleted instead of hidden, cannot restore, or is incorrectly reordered with user records.
- F6: Preset operations mutate stored objects, lose metadata/order/hidden state across persistence or bundle export/import, apply without Undo, or delete without confirmation.
- F7: More than 128 user presets are accepted, oversize durable save silently drops data, failed operations change the library, or preset rendering creates every record rather than a bounded page.
- F8: Tests assert source text rather than real script behavior, generated ids drift, release logging leaks, or either build misses compiled assets. VM and compile evidence must not be described as live picker/visual verification.
- F9: Imported generic metadata has a non-array hidden-id list, non-string baked name or unsafe next number; hydration must not crash or turn malformed metadata into an unbounded naming loop.
- F10: Clipboard refusal is reported as success, or a library import/reload replaces a preset behind a pending delete confirmation and the old confirmation deletes the replacement.

## Implementation and v2 parity

`panorama/scripts/hp_colors_v3_menu.js` now owns the 40-entry immutable settings history (serialized snapshots), slider/picker gestures, schema-owned reset confirmation and a runtime-created preset list with eight rows per page. Hydration uses the unchanged non-history `applySettings` path; deliberate whole-settings edits, imports, page resets and preset application use the same Undo stack. Page/fold/search state stays local. Escape cancels the picker before search/editor close; DONE accepts an unsubmitted hex draft.

`tools/menu-layout.js` generates the header Undo button, page-reset control, preset-library chrome and modal panels. `generate.js` includes the stock `citadel_ui_color_picker.vcss_c`; it is a game dependency, not a new packaged asset. The stock picker is optional for boot: missing `HexValue` or a failed native binding leaves hex entry available and displays the fallback message.

V2 facts carried over:

- `hp_colors_v2_state.js:9,2563–2565,2636–2639`: the implicit baked record is `baked_default`, named **Rewrite Default**; manual names trim whitespace and accept 1–48 characters. `hp_colors_v2_menu.js:3978–3991` supplies collision-avoiding **PRESET N** auto names.
- `hp_colors_v2_state.js:2591–2594,2694–2725`: saving an unscoped user preset hides the baked default; user records delete only after confirmation, while the baked record hides and restores without deleting its name override. V3 preserves `hiddenBakedPresetIds`, `bakedPresetNameOverrides` and `nextUserPresetNumber` as bundle metadata. The implicit baked default is not stored among the 128 user records.
- `hp_colors_v2_state.js:2771–2793`: **COPY** copies a code, not a duplicate library record. V3 copies a single-preset HPC3 bundle; the existing bundle-copy action exports the entire library and its metadata.
- `hp_colors_v2_menu.js:5348–5356,5381–5413,6297–6329`: seed native `HexValue` using `TextEntryChanged`, suppress its seed event, validate finite integer RGB channels 0–255, and cancel to the opening color. V3 uses `onblur` for hex commits, consistent with the corrected v3/Panorama event contract.

Presets use the storage owner's `getBundle`, `isHydrated` and atomic `replaceBundle` facade. Mutations wait for a known library and validate the complete durable record against 192,000 characters before changing memory; failures show a message. Settings/bundle export uses the existing codec, including its 32,768-character bundle limit. Imported metadata and preset order remain intact.

## Failure-mode → behavioral evidence

`tests/menu-actions.test.js` boots the real generated menu/scripts through the existing VM adapter. `tests/storage.test.js` additionally runs the actual local hosted-page script against disk-backed profiles.

| Failure mode | Evidence |
|---|---|
| F1 | Forty Undo clicks after 45 edits reach exactly the fifth value; no-op edits, hydration and folds add no records; Undo leaves fold state intact. |
| F2 | Mouse drag/update/up is one step; blur/navigation end gestures; keyboard changes remain separate; return-to-opening drag is a no-op. Picker cancel preserves an older Undo record. |
| F3 | Confirmation lists Advanced setting names and enemy/ally/shared scope; no write before confirm; Escape/navigation cancel it; reset restores every page row and both sides in one Undo step. |
| F4 | Native seeding deliberately fires a spurious RGB event in the VM without editing; invalid RGB is refused; native and missing-native hex sessions share Undo; Escape restores opening settings; DONE commits an unsubmitted hex draft. |
| F5 | Name trimming, 49-character refusal, PRESET N case-insensitive collision avoidance, automatic default hide, manual restore and baked rename are observed. |
| F6 | Apply/Undo, rename, move, clipboard copy and confirmed deletion are driven through menu events. Three actual-page restarts preserve names/order/default hide/name override; a bundle import with unchanged settings still persists the new library. |
| F7 | The 129th save is refused without changing records; 128 presets mount only eight rows, and next-page navigation shows preset nine. A near-full 191,960-character record loads through >60 read chunks; saving refuses atomically with the 192,000-character message and zero writes. |
| F8 | Existing generated layout/id/control tests still execute; the initial eight action tests all failed before implementation (`.build/evidence/ticket10-red.tap`). Both transformed runtimes and the exact 15-asset compile/package contract pass as recorded below. |
| F9 | Malformed hidden-list/name/next-number metadata hydrates safely and produces PRESET 1 without losing the library. |
| F10 | Clipboard false-return shows failure; refreshing the library cancels stale delete confirmation. |

Focused evidence: `.build/evidence/ticket10-menu.tap` reports **23/23** menu checks; `.build/evidence/ticket10-preset-storage.tap` reports **2/2** real-page preset checks. Repeatable profile/request artifacts are under `.build/evidence/storage/ticket10-own/`; `.build/evidence/ticket10-menu-actions.json` records the final observable settings/library/paged-row count.

No install, deploy, game launch, game-folder write or git mutation. The native API pattern is ported, but neither these VM checks nor compilation establishes live picker/visual behavior; v2's own `AGENTS.md:129` also labels native picker verification as VM-only.

## Ticket-10 verification and coordinated acceptance

Original ticket-10 source check, before ticket 07's core expansion:

```text
node --test --test-reporter=tap hp_colors_rewrite_v3/tests/*.test.js
174 tests; 174 pass; 0 fail; exit 0
node hp_colors_rewrite_v3/tools/generate.js --check
HPV3 generator: 11 outputs current; exit 0
```

Logs: `.build/evidence/ticket10-all-tests.tap`, `.build/evidence/ticket10-generation.log`. The fixture repairs keep their behavioral assertions while deriving free codec slots and full defaults from the expanded schema; unitless numeric strengths are now legal, but a missing unit field still fails. The publisher-lifecycle test excludes storage because its scheduler count concerns only publisher jobs; actual storage reloads remain covered by fake-page tests.

Independent transformed-runtime checks used fresh temporary Panorama copies, `tools/stage-scripts.js` in release/debug mode, and the real `menu-actions`, `menu` and `storage` suites with `HPV3_SOURCE_ROOT`, `HPV3_DEBUG` and separate storage artifact directories. Both passed **71/71**, zero failures: `.build/evidence/ticket10-isolated-release.tap`, `.build/evidence/ticket10-isolated-debug.tap`; profiles under `storage/ticket10-isolated-{release,debug}/`. Temporary stages were removed. This is runtime transformation/VM evidence, **not compilation**.

**Coordinated acceptance, 2026-10-14:** ticket 07 cleared the source-stability prerequisite and serially ran the integrated build pair. The final all-v3 source run passed **225/225**, and `generate --check` reported **11 outputs current**, both exit 0.

```text
powershell -NoProfile -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v3.ps1 -SkipDeploy
exit 0; staged VM 197/197 pass; 15 compiled, 0 failed; exact 15 packed assets
powershell -NoProfile -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v3.ps1 -Debug -SkipDeploy
exit 0; staged VM 196 pass, 0 fail, 1 intentional release-only logging-check skip;
15 compiled, 0 failed; exact 15 packed assets
```

The final contract includes `hp_colors_v3_world.vcss_c` and `hp_colors_v3_from_v2.vjs_c`; both builds boot `menu-actions.test.js` and `migration.test.js` against their exact staged scripts. Both accept only the known post-success redirected `Console.ReadKey` exception after the zero-failure summary and required-output checks. Raw sources and extra/missing VPK assets are rejected.

Integrated evidence: `.build/evidence/ticket07-all-tests.tap`, `ticket07-generation.log`, `ticket07-release-build.log`, `ticket07-debug-build.log`, `ticket07-result.json`; exact listings under `.build/{release,debug}/vpk-listing.txt`. Packages remain under `.build/{release,debug}/pak02_dir.vpk`; neither was installed. This clears compile/package acceptance, not live native-picker or visual verification. Acceptance boxes remain untouched.

## Audit fixes

Failure cases recorded before this round's changes:

- A1: COPY fills the bundle box, and importing a one-preset/default code replaces and loses the receiver's library; preset imports must append fresh identities, and a separate full replacement needs confirmation.
- A2: Pre-hydration Undo or picker snapshots overwrite restored settings. Disk hydration must reset history/gestures and discard the picker without restoring; editor close clears session history.
- A3/A4: Native focus moves fire slider blur after picker creation, splitting its gesture and losing the opening color; slider blur must match its own key, picker opening color must be independent, and only the root handles Escape.
- A5: Reset wording claims shared rows where none exist and grows without bounds; list distinct hidden settings and actual sides, with a bounded message.
- A6: Code import mutates the library before settings validation; decode/stage first and leave settings/library untouched on refusal.
- A7: New ESC contexts must defer publication until restore/error/timeout; only same-context reincludes can carry validated settings from the retired instance. Live 6779 has no Escape-context `GameUI` or cross-context process cache.
- A8: Every slider tick publishes and fully encodes/saves the library; throttle gesture publication to one per 50 ms and save only at gesture end, with the final value immediate. A return-to-opening drag must still publish its final value, even though it creates no Undo/save record.
- A9: Dynamic name-entry `maxchars` is unverified native behavior; JavaScript 1–48-character validation remains authoritative.

Implemented audit coverage in `tests/menu-audit.test.js` (real scripts; disk-backed hosted-page profiles where persistence matters):

| Item | Fix and regression evidence |
|---|---|
| A1 | COPY leaves the import draft alone; default COPY contains one preset. IMPORT appends fresh identities through storage; REPLACE ALL has a separate cancelable confirmation. Existing `ticket10-audit-mutant-A1-*.tap` files prove all four regressions. |
| A2 | `hydrateSettings` discards history, gesture and picker without restoring old drafts; editor close commits its final edit then clears session history. Slow disk-load hex/slider/picker tests and `ticket10-audit-mutant-A2-*.tap` cover this. |
| A3/A4 | Slider blur matches its own key; picker keeps `openingColor` separately; the card has no cancel binding. Focus-order and independent-opening tests fail in `ticket10-audit-mutant-A3-*.tap` and `ticket10-audit-mutant-A4-root-cancel.tap`. |
| A5 | Reset names actual scopes and deduplicated hidden settings; long lists are summarized under 600 characters. A name exceeding the entire list budget is not falsely described as absent. Existing scope/bound mutants and `ticket10-audit-completion-red.tap` prove the regressions. |
| A6 | Import requires a nonmutating decoder and validates its candidate before any importer runs; missing decoder fails closed. Invalid and missing-decoder VM tests cover both settings and bundles; original preflight mutant and completion red log prove failure without the guards. |
| A7 | Fresh ESC contexts wait for hydration, unavailable status or a 30-second fallback; same-context reincludes use validated inherited settings. Retirement cancels the fallback. Fresh-context no-GameUI, cold/timeout and reinclude VM tests cover these paths. |
| A8 | During a gesture, publishes are spaced by approximately 50 ms; storage commit happens only at gesture end. Final publication is immediate even for a return-to-opening no-op drag. `ticket10-audit-gesture.json` records dispatch times; the throttle mutant fails the 1 kHz VM test. |
| A9 | Dynamic `entry.maxchars = 48` is an unverified native hint, not a safety boundary (also noted beside the assignment). Runtime `presetName` enforces trimmed 1–48-character names; the dynamic-rename VM test bypasses maxchars and proves atomic 49-character refusal and 48-character acceptance. |

The metadata regression also covers pending v2 settings/conditions following Apply, SAVE NEW, and default Apply; existing `ticket10-audit-mutant-metadata-*.tap` files prove replacement/copy/clear behavior.

Completion verification (2026-10-14):

- Focused `menu-actions`, `menu-audit` and `menu` suites: **45/45 pass**, exit 0 (`.build/evidence/ticket10-audit-completion-focused.tap`). The px/DropDown scratch record-contract fixture was repaired by V3Fix02-2.
- Fresh isolated-source proof: **22/22 mutants fail their expected VM regression**, with source untouched. `.build/evidence/ticket10-audit-completion-mutations.json` pins menu/storage SHA256 and records every mutation; matching `ticket10-audit-completion-mutant-*.tap` logs include A1–A9, timeout, final no-op publication, and all metadata paths. The repeatable runner is `ticket10-audit-completion-mutants.js`.
- Required `node --test hp_colors_rewrite_v3/tests/*.test.js` run: **280/301 pass; 21 fail**, exit 1 (`.build/evidence/ticket10-audit-completion-all.tap`). Peer-owned remaining failures are 19 preview/renderer stock-release/cadence checks (**V3Fix03-2**, renderer changes still in progress) and two isolated record-contract fixtures in `review-fixes.test.js` (**V3Fix02-2**). No menu tests fail.
- Subsequent `node hp_colors_rewrite_v3/tools/generate.js --check`: **11 outputs current**, exit 0 (`.build/evidence/ticket10-audit-completion-generation.log`). This replacement did not change `menu-layout.js`; its already-generated confirmation layout is current.
- `ticket10-audit-completion-red.tap` captures both remaining guard/wording failures before this replacement's fixes. Native picker/focus/maxchars behavior remains live-unverified; no build, deploy, game launch or git mutation was performed.
