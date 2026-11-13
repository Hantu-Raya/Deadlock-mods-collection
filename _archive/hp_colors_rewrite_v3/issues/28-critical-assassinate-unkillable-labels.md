# 28: CRITICAL, ASSASSINATE and UNKILLABLE labels

**What to build:** Settings for the stock world-healthbar status labels CRITICAL, ASSASSINATE and UNKILLABLE, which v3 currently leaves untouched.

**Dependency:** ticket 29's source fixes are integrated; its separate live checks remain open.

**Status:** done. The user confirmed it works in game (2026-10-17). Main had earlier live-checked the CRITICAL toggle on world bars and in the preview (6785, debug `df95686d` md5).

**Runs on:** gpt-6.1-sol (med). **Review:** gpt-6-astra (med).

## Current state (2026-10-16)

- v3's `unit_status_overlay_v2.xml` keeps the stock `#CriticalIndicator`, `#AssassinateIndicator` and `#UnkillableIndicator` panels, and `unit_status_v2.css` keeps their stock rules. Nothing in `hp_colors_v3_world.css` hides or moves them, so in game they behave like stock.
- `settings/schema.json` has no rows for them, so the menu cannot change them.
- v2 had five shared keys (see `mocks/settings.js`, NAMES & LABELS):
  - `criticalIndicatorVisible` (boolean, default on): "Off hides the label only; stock flashing remains."
  - `criticalOffsetX` / `criticalOffsetY` and `assassinateOffsetX` / `assassinateOffsetY` (px, ±200 / ±210, default 0, advanced): "It follows the bar."
  - UNKILLABLE had no v2 setting.
- `hp_colors_v3_from_v2.js` still carries these keys in its v2 data, but v3 has no slots for them, so a v2 import with CRITICAL off or a moved label loses that value. No recorded decision dropped them; they were simply not ported.

## Scope

On 2026-10-17 the user asked Main to "resume" all remaining work except ticket 26. Main chose option 2 because the user had asked about all three labels:

- A visibility toggle for each of the three labels: `criticalIndicatorVisible` (as in v2), plus new `assassinateIndicatorVisible` and `unkillableIndicatorVisible`. All default on and follow the v2 wording: "Off hides the label only."
- X/Y offsets for each label: CRITICAL and ASSASSINATE as in v2 (±200 X, ±210 Y px, default 0, advanced), plus the same for UNKILLABLE.
- Rejected alternatives: v2 parity only (no UNKILLABLE controls), and toggles only (drops the v2 offsets).

## Acceptance

- [x] New rows use append-only slot additions with a record-version bump; the v2 import maps the v2 keys once.
- [x] Hiding a label hides only the label; stock critical flashing and the UNKILLABLE HP-text treatment stay.
- [x] Offsets follow the bar, including bar movement and anchoring, and release to stock exactly when reset or when HP Colors is off.
- [x] The preview shows the labels (it already has `HPColorsPreviewCriticalIndicator`; add the others if needed) and reflects the settings.
- [x] VM E2E tests boot the real scripts and cover show/hide, offsets, release-to-stock and v2 import.
- [x] QOLLOCK Escape-menu copy refreshed; both generator `--check`s current.
- [x] Live check on the debug build: CRITICAL on a low-HP enemy, ASSASSINATE, and UNKILLABLE (for example Kelvin, Seven or a hero with a death-immunity item). User-confirmed 2026-10-17.

## Implementation (2026-10-17)

### Settings and migration

Record **v13** appends nine shared slots in [schema.json](../settings/schema.json) and [record.json](../settings/record.json):

| Slots | Keys |
|---|---|
| 167–169 | `criticalIndicatorVisible`, `criticalOffsetX`, `criticalOffsetY` |
| 170–172 | `assassinateIndicatorVisible`, `assassinateOffsetX`, `assassinateOffsetY` |
| 173–175 | `unkillableIndicatorVisible`, `unkillableOffsetX`, `unkillableOffsetY` |

All toggles default on. Offsets default to zero, use unscaled pixels, and are advanced controls: X ±200, Y ±210, step 1. Rows live in **Indicators → Labels**, following the v2 indicator grouping and wording.

The existing shared-key mapping in [from_v2](../panorama/scripts/hp_colors_v3_from_v2.js) consumes the five v2 label keys without another unit conversion. Earlier v3 records fill missing slots from defaults; pre-v13 `v2pending` label values promote once. Current-version slots, including omitted defaults, beat stale pending values.

These were the last unmapped supported v2 settings. Removed the now-unreachable pending-map dropping fallback and its storage notice branch. Conversion retains every mapped setting and refuses an oversized save without modifying the v2 source. The regression retains 128 presets and 27 full legacy scopes; a legal v2 save whose 30 scopes exceed the v3 limit fails closed.

### Rendering and preview

[Renderer](../panorama/scripts/hp_colors_v3_renderer.js) reuses the rejuvenator's full-canvas anchor and ownership-ledger mechanism. A nonzero label offset adopts the native panel into its passive anchor; the anchor translates by the active side's bar offset plus the label's X/Y pixels. The level/ultimate anchoring toggle and bar scale do not rescale label offsets.

Zero/zero releases positioning to stock even on a moved bar. Master off restores captured inline styles, native parents and sibling order. Default label settings add no label/anchor writes. Label discovery shares one child snapshot on the existing reconciliation cadence.

Hiding owns only the label's visibility; showing releases it to native status CSS. It never changes gameplay state classes, `ShowCriticalState`, critical flashing or native tag animations. A scoped CSS correction also preserves `.unkillable` HP-number hiding after the custom readout adopts that number.

The preview uses the same painter and leases. Added ASSASSINATE and UNKILLABLE replicas; editing any label control shows that label's sample without inventing gameplay state. Native low-health CRITICAL remains health-driven. Page changes clear the synthetic sample.

### Verification

Tests boot the real menu, world scripts, converter and preview. Coverage includes both sides, independent visibility, native state gating, bar movement and anchoring, exact captured-style/parent/order restoration, master off/on, zero default writes, import/save/restart, old records, pending precedence and preview reflection. New label tests were run failing before implementation; the native UNKILLABLE HP-text regression was also reproduced before its CSS fix.

Final commands and results:

| Check | Result |
|---|---|
| `node --test hp_colors_rewrite_v3/tests/*.test.js` | **1219/1219** |
| `node --test hp_colors_rewrite_v3_qollock/tests/*.test.js` | **24/24** |
| `node --test scripts/validate-hp-colors-rewrite-v2-storage.test.js` | **48/48** |
| `node hp_colors_rewrite_v3/tools/generate.js --check` | 12 outputs current; 755 CSS rules, maximum 10 selectors |
| `node hp_colors_rewrite_v3_qollock/tools/qollock.js --check` | 2 outputs current |

All three customized labels in the stressed fixtures measured **223.3 active / 198.3 idle counted operations per bar per second**. Existing 300/200/30 ceilings and the other audit budgets remain unchanged and green. These are VM budgets, not live performance evidence. Canonical outputs were regenerated before QOLLOCK recomposition. Ticket 29's search fix and regression tests were preserved.


### Remaining live acceptance

No paks were built or installed, and no game was launched. In an authorized debug session, check all three actual statuses, independent hiding, offsets after bar moves/scaling, reset/master-off restoration and native animations/HP-number hiding. Check the preview and QOLLOCK menu, then inspect the console for `Parsing error`, `FATAL` and `Uncaught`. The live acceptance box remains open.
