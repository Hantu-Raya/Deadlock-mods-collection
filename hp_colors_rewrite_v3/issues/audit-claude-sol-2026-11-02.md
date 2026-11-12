# HP Colors v3 audit (Claude + GPT-6.1 Sol), 2026-11-02

## Verdict

Requested by the user after the kill-bounty and status-row work: audit the whole v3 lane, refactor, remove dead code and optimize, fixing hidden bugs along the way. Claude audited and integrated; GPT-6.1 Sol audited independently over three rounds and reviewed each round's diff. No P0. Three user-visible bugs fixed, one supported-input regression caught in review and reverted, six measured work reductions. Every fix has a VM test that fails on the pre-audit source (`.scratch/audit_v3/pre_root`) unless noted. No live/in-game evidence yet.

Evidence: `.scratch/audit_v3/m1/` (findings.md, round2.md, round3.md, repro `*.tap`, metrics JSON), `.scratch/audit_v3/round1.diff`.

## Fixed bugs

- **Preset COPY had no clipboard fallback.** `copyPreset()` used `CopyStringToClipboard` alone, which throws in the live Escape menu (6785, 6821). All copy actions now share `copyText(text, entry, refocus)`. Preset COPY uses the Bundle code box as its carrier and says so when a manual copy is needed. Test: menu-actions "preset COPY copies through the bundle code box…".
- **A replaced `#StatusEffects` row lost the whole-row move.** Discovery cached the first row; `reconcilePickups` (3 s) now adopts a replacement and repaints. Test: renderer "a replaced StatusEffects row takes the whole-row move…".
- **A changed Settings IMPORT committed twice.** The store applied and committed it through the menu, then the menu committed the same state again. The store now owns the single commit; an equal import (pre-hydration touches every slot) commits inside the store only when the menu holds exactly the imported settings and conditions, so a refusing (retired) menu commits nothing. Tests: storage "a changed settings-code IMPORT commits once" (red on old source), "a settings import a retired menu refuses commits nothing" (guards the intermediate defect Sol found), existing "audit M3".

## Work removed (no behavior change)

| Change | Measured before → after |
|---|---|
| Hero routing reads `Store.getRoute()` each settled second; the library is fetched only when a different source applies | 6,176,690 JSON chars cloned per 10 s at 128 presets → route only |
| `persistence.change` visits each preset/metadata key once (`keyUnion`) | 512 → 256 preset serializations per scalar commit (128 presets) |
| Codec slot/control lookups use a per-contract index | 2,296,458 predicate calls to encode a 128-preset library → hash lookups |
| World bars that are not active drop ultimate/bounty snapshots before `JSON.parse` | every trooper/camp bar parsed the 1 s bounty snapshot → 0 (test: kill-bounty "…never parse bounty snapshots") |
| Timer fast path seeds the plan memo | two plans per bounty/ultimate step per bar → one |
| Tick re-signs the probe only when a layer's visibility changed | active bar 132 → 70 signatures / 93,008 → 49,322 chars per 10 s; OLD 198 → 136 |

Also: `publishGate` reuses `clockSeconds()` (one clock parser); dead `.HPC3ColumnEmpty` selector removed; the suite-pass cache now keys the blobs `main:index.html` and `$HPV3_STORE_REF:index.html` resolve to (a moved hpv2-store branch no longer reuses a stale pass; no git spawn without the checkout).

## Reverted in review

- `.HPC3ControlsDropdown` looked dead to a literal scan but `tools/menu-layout.js` emits `HPC3Controls${kind}` for enums over four options. Restored with a comment. Lesson: CSS dead-code scans must include generator-built class names.

## Not changed (unverified native risks)

- Separate-shield teardown forgets a restoration that a still-valid ProgressBar refuses (`max = 1`). Reproduced only by injection; no engine evidence of such a refusal.
- A detached but still-valid LocalPlayer card would pin hero routing. Reproduced only by injection; the topbar replaces cards by deletion, which works.
- Persistent ledger indexes in `applyTo()` (~291 Map constructions per bar-second): no GC/native-time evidence, and line replacement can need the same plan reapplied.
- Retired slots and v2 migration paths: compatibility requirements, not dead code.

## Builds

Release builds after the audit (staged suite 1386 passed, 2 release-only skips; QOLLOCK 34 and ShowRank lane 11 passed): ShowRank `3c62592e` (installed as pak02, replacing `4070d76a`; release `4917edde` still in `addons_disabled/`), canonical `425f1790`, QOLLOCK `39d8fb11`. Not yet seen in game.

Superseded the same day by the builds with the ESC update badge and the `status-effects` NEW item: normal `e832a223`, QOLLOCK `a8d367d7`, ShowRank `bfab9991` (installed). See [MAP](../MAP.md#changelog).
