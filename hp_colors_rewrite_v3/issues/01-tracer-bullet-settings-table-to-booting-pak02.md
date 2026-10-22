# 01: Tracer bullet: settings table to booting pak02

**What to build:** A one-row settings table goes through the generator into a compiled pak02 whose ESC menu and unit-status renderer both boot (empty) without script errors.

**Blocked by:** None (can start immediately)

**Status:** done

**Runs on:** gpt-6.1-sol (med). **Review:** code-review + claude-fable-5-1 review.

- [x] Settings table format supports every column in SPEC (key, type, bounds, step, default, side, page, basic/advanced, unit, help, keywords)
- [x] Generator output (defaults, slot table, menu rows, id list, search index) is byte-identical across two runs; id list and slot table committed
- [x] Build wrapper builds normal pak02 with -SkipDeploy; -Debug adds [HPV3] boot logs; release build has no logging
- [x] Package check asserts the exact compiled asset set and no raw sources
- [x] VM E2E tests boot the real scripts and pass for boot of menu and renderer

## Failure modes (written before code)

1. Generator output differs between runs (key order, timestamps, CRLF/LF, absolute paths).
2. A malformed table row (missing column, unknown type/side/page, default outside bounds, duplicate key) generates output instead of failing.
3. Committed generated files go stale against the table and nothing notices.
4. The page root gets an id and the compiler rejects it.
5. Stale compiled outputs from an earlier run count as success, or the known nonzero compiler exit is treated as failure (or any nonzero exit as success).
6. The pak misses a compiled asset, packs raw `.js`/`.xml`/`.css`, or packs v2 assets.
7. Debug logging leaks into the release build.
8. The ESC override drops stock menu content, so ESC breaks in game.
9. The renderer self-starts on include, or crashes when the config never arrives.
10. A menu script boots before its panels exist and throws.
11. `-SkipDeploy` still writes to the game folder, or the build touches v2 sources or outputs, or cleanup deletes outside its root.
12. Tests pass vacuously: they still pass when a script does nothing.

## Review-fix failure modes (written before code)

- R1/A: The baseline is an older game revision; re-vendor all five files at the verified 6774 commit, retain version provenance, and explicitly check HEAD.
- R1/B1: CRLF checkout conversion makes unchanged generated/vendor text look stale; compare LF-normalized text, pin the original upstream LF content, force v3 asset LF in `.gitattributes`, and exercise CRLF fixtures without permitting other edits.
- R1/B2: Row insertion/reordering renumbers codec slots, or an existing key/slot is repurposed; require explicit per-side slots and compare every existing flat-key/slot pair with the committed generated slot contract before writing.
- R1/B4: Missing controls block config publication or leave an infinite hot retry; publish once independently, initialize available controls, back off/cap retries, report missing ids in debug, and stop safely on dead contexts.
- R1/B5/B6: Enemy-only rows gain ally state, unsupported units/options/groups pass, or shared keys collide with side-prefixed codec keys; validate the full schema and generated flat keys, and inspect defaults/menu/config through CLI and VM.
- R1/B8: Nested scripts retain logs, multiline debug markers leave executable fragments, or scheduled logs bypass release tests; recurse the stage transform, fail before compilation for multiline markers, and install logging throwers at every v3 VM-harness creation.
- R1/B9: A renderer tick writes diagnostic panel attributes forever; expose scheduler state through the script API, leave live panel attributes untouched on ticks, and observe repeated scheduler execution.

## Review fixes

Rebased all five vendor inputs to `130feff271b4ce5689f4d78f6ec0aa21910be6be`; `game-data-pin.json` records ClientVersion **6774**. Installed `steam.inf` and the pinned upstream `steam.inf` both report 6774, SourceRevision 11112755, Oct 09. Pin checks accept only checkout CRLF→LF equivalence and otherwise retain the SHA-256 of original upstream LF bytes; v3-local `.gitattributes` also forces LF.

Schema slots are explicit (`{enemy, ally}` for side-aware, a number for shared/enemy-only). Generation validates unique flat keys/slots and preserves every existing `(key, slot)` in `generated/slots.json` before writing. Enemy-only rows, number units (`px`, `%`, `deg`, `s`), labeled enum options (`{value, label}`) and optional subgroup names now reach generated menu/config data.

Menu config publishes without waiting for controls; available controls initialize independently, retries back off from 0.1 s and stop after six schedules, and debug reports missing ids. Renderer scheduler state lives in `$.HPColorsV3Renderer.status`, not per-tick panel attributes. `tools/stage-scripts.js` recursively validates/transforms all staged JS, rejects multiline debug markers before any writes, and release VM factories trap logging throughout scheduled execution.

Exact verification commands and results:

```text
node --test --test-reporter=tap hp_colors_rewrite_v3/tests/game-data.test.js hp_colors_rewrite_v3/tests/generator.test.js hp_colors_rewrite_v3/tests/logging.test.js hp_colors_rewrite_v3/tests/menu.test.js hp_colors_rewrite_v3/tests/renderer.test.js hp_colors_rewrite_v3/tests/review-fixes.test.js hp_colors_rewrite_v3/tests/stage-scripts.test.js hp_colors_rewrite_v3/tests/store-page.test.js
exit 0; tests 66; pass 66; fail 0; skipped 0
node hp_colors_rewrite_v3/tools/generate.js --check
exit 0; HPV3 generator: 10 outputs current
powershell -NoProfile -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v3.ps1 -SkipDeploy
exit 0; staged tests 38/38; 7 compiled, 0 failed; exact 7-asset VPK
powershell -NoProfile -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v3.ps1 -Debug -SkipDeploy
exit 0; staged tests 37 passed, 1 explicitly skipped release-only logging guard; 0 failed; exact 7-asset VPK
node hp_colors_rewrite_v3/tools/game-data.js --check-upstream
exit 1; HEAD=0c38f9d31c4905e0fe1a292afe91aa3d01044baf; only heroes.vdata DRIFT; other four MATCH; pins unchanged
```

Upstream advanced during verification to ClientVersion **6779** (Oct 13; SourceRevision 11123977). Its heroes hash is `c020a28f30d23c486c14a4bb4ef2915507d6b496eaf304cb96b56ac17a9c3b0a`, versus the 6774 pin `5b18b9e5d6753afb9698581cc49acea0e073c625971e7f5e062c893b61030a02`. **Decision: retain the installed-game 6774 pin; rebase when the installed game updates.** The expected no-drift result is superseded by this observed, correctly reported drift, not bypassed.

Finding → evidence (logs under `.build/evidence/`):

| Finding | Evidence |
|---|---|
| A | `review01-upstream-check.log`: exact HEAD/pin and five per-file hashes; `game-data.test.js` checks runtime commit/6774 and all 67 hero identities. |
| B1 | `review01-tests.log`: CRLF copies of every generated/vendor file pass; a non-EOL mutation still fails the pin. |
| B2 | Same log: inserting/reordering rows preserves slots 0/1; changed, renamed, missing or repurposed committed pairs fail generation and `--check` before output. |
| B4 | Same log and both build logs: missing control still publishes config and initializes other controls; six bounded retries with backoff; dead root is safe; debug missing-id diagnostic asserted. |
| B5/B6 | Same log: enemy-only numeric and labeled enum/group fixture boots real VM rows/defaults, no ally leakage; unsupported units, malformed enums/groups/slots and flat-key collisions fail. |
| B8 | Same log and both build logs: nested release/debug scripts executed through VM; multiline marker rejects before transforming any file; scheduled Msg/Warning/console logs throw in every release harness. |
| B9 | Same log: 30 s of renderer ticks writes zero panel attributes; script-level status tracks dormant/stopped. |

`review01-red.log` retains the pre-fix run (15 failures); `review01-generate-check.log`, `review01-build-release.log` and `review01-build-debug.log` retain full output. No boxes ticked, no git mutations, no install/deploy/game launch. The existing store-page test's read-only `git show` dependency was explicitly permitted. No live rendering or installed-resource byte equivalence is claimed.

## Audit fixes

The current 6779 pin, 11 generated outputs and 16-asset wrapper contract supersede this ticket's historical 6774/10-output/7-asset descriptions. See [ticket 02's Audit fixes](02-stock-stylesheet-and-hero-list-from-pinned-game-.md#audit-fixes) for the finding-to-evidence mapping and exact remaining limits.

- AuditWhole D / Audit0102 A: native preflight regressions cover installed-version mismatch and `-AllowPinMismatch` before any build work; dynamic staged discovery executes an added future suite. Root build output is ignored, obsolete `esc` is removed, and both VM/debug boot contexts expose 3.0.0. Ten isolated negative proofs are retained under `.build/evidence/audit02-red-*.log`.
- Record-guard integration: review-fixes and menu scratch-schema fixtures explicitly declare newly added slots in temporary bumped record contracts; production enforcement was not weakened. `audit02-red-review-fixtures.log` proves the original fixture failures; `audit02-recovery-focused.log` records **79/79** focused passes, including every review-fixes check.
- Final ordered full-suite/freshness evidence: **282/301**, with 19 preview/renderer failures owned by V3Fix03-2; `generate.js --check` passes with **11** outputs. Logs: `audit02-recovery-all.log` and `audit02-recovery-generate-check.log`. No compilation, deployment, game launch or git mutation during this recovery.

