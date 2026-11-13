# 31: Credits button and dialog

**What to build:** A CREDITS button next to the `v3.0.0` version label at the bottom right of the preview pane. Clicking it opens a credits dialog. Requested by the user on 2026-10-17.

**Blocked by:** none (shares preview-pane files with the shake-preview work; run after it)

**Status:** done, live-verified 2026-10-17 on 6785 (debug md5 `a0153add`).

**Runs on:** gpt-6.1-sol (med). **Main:** live check.

## Content (user wording; keep verbatim)

| Name | Hero icon | Credit |
|---|---|---|
| yesdaddy | Solomon (`hero_chessmaster`, id 85, `file://{images}/heroes/chessmaster_sm.psd`) | Taking his own time testing my mods and giving alot of Good suggestions |
| razorrzr | Lash (`hero_lash`, id 31, `file://{images}/heroes/lash_sm.psd`) | Critizing my ui and giving a solid gold |

The hero icon sits beside each name. The user's spelling ("alot", "Critizing") is kept as written.

## Decisions (Main)

- Reuse the existing notice-style dialog chrome from ticket 27 (backdrop, ESC close button, CLOSE, Escape key). Do not add a new dialog style.
- Portraits come from `generated/heroes.json` (pinned heroes.vdata), rendered like the portrait hero picker (circle portrait). Do not hard-code a second copy of the path if the generated data can supply it.
- The dialog is not a setting: no schema slot, no save, no Undo entry. Opening it closes other open dialogs or pickers the same way other dialogs do.
- QOLLOCK gets it through recomposition.

## Acceptance

- [x] The CREDITS button sits beside the version label, bottom right of the preview pane, in both variants.
- [x] The dialog shows both entries with the exact text, each with a Solomon or Lash portrait beside the name. It closes via CLOSE, ESC and the backdrop, consistent with the other dialogs.
- [x] VM tests cover opening and closing, the exact text, the portrait sources and no settings/storage change. Generator `--check`s are current, QOLLOCK is recomposed, and all suites are green.
- [x] Live (Main, 6785): the dialog renders with portraits and no Parsing error/FATAL/Uncaught. Seen: CREDITS beside `v3.0.0`; the dialog shows yesdaddy with a Solomon portrait and razorrzr with a Lash portrait, with the exact text; CLOSE works. The first click right after the menu opened did nothing while it was still fading in, and the second click opened it. `.scratch/hpv3_live_1017/t31_credits_live.png`.

## Implementation (2026-10-17)

- [Menu generator](../tools/menu-layout.js): `HPColorsPreviewFooter` groups `HPColorsPreviewCreditsButton` beside the existing `HPColorsPreviewVersion`. The release still comes only from `settings/record.json`; the removed portrait-renderer toggle and the 3 s shake preview are unchanged.
- `HPColorsCreditsDialog` uses the existing notice helpers, backdrop and layered CLOSE action. `HPColorsCreditsBackdrop`, `HPColorsCreditsCloseButton` and `HPColorsCreditsEscClose` share the close route; keyboard Escape closes only the dialog and focus returns to the opener. Other dialogs/pickers, navigation and editor close cannot leave credits open behind them.
- Entry ids are `HPColorsCreditsYesdaddy{Name,Text,Portrait}` and `HPColorsCreditsRazorrzr{Name,Text,Portrait}`. Runtime portraits resolve `hero_chessmaster` (85) and `hero_lash` (31) through the generated hero catalog, without copied image paths. Circle/portrait classes are the hero picker's existing classes; the two credits retain the exact Content wording.
- No schema/slot, save format, store action or Undo entry was added. Canonical outputs are regenerated and QOLLOCK is recomposed. Four new boot-only event bindings account for four target-validity checks (measured chrome total 223; cap 220 → 224); world/runtime operation ceilings are unchanged.

### Regression tests

Red-first VM runs failed on the missing dialog, overlapping dialogs and missing QOLLOCK composition before their corresponding implementation/recomposition.

- [menu-actions.test.js](../tests/menu-actions.test.js):
  - `ticket 31: credits opens exact user text and data-backed portraits; CLOSE, ESC and backdrop leave settings, storage and Undo untouched`
  - `ticket 31: credits excludes every dialog/picker, cancels stale confirmations and preserves existing Undo`
- [theme.test.js](../tests/theme.test.js): `ticket 31: credits reuses notice chrome and passive hero-picker circles beside readable names and wrapped text`
- [preview-chrome.test.js](../tests/preview-chrome.test.js): existing release-label/source tests also check footer placement beside CREDITS.
- [QOLLOCK qollock.test.js](../../hp_colors_rewrite_v3_qollock/tests/qollock.test.js): `ticket 31 credits (model/pinned): composed footer and dialog keep text, portraits and all close routes without resuming` (one test for each runtime).

### Verification

Ran directly in the shell after regeneration/recomposition:

- `node --test hp_colors_rewrite_v3/tests/*.test.js`: **1248/1248** (baseline 1245; three new tests).
- `node --test hp_colors_rewrite_v3_qollock/tests/*.test.js`: **28/28** (baseline 26; model and pinned credits tests).
- `node --test scripts/validate-hp-colors-rewrite-v2-storage.test.js`: **48/48**.
- `node hp_colors_rewrite_v3/tools/generate.js --check`: **12 outputs current**, stylesheet maximum **10 selectors/rule**.
- `node hp_colors_rewrite_v3_qollock/tools/qollock.js --check`: **2 outputs current**.

All suites reported zero failures/skips. Initial full-run integration failures (the preview-id prefix and boot-only chrome budget) were resolved before the final green gate.

No package build, install or game launch was performed. Rendering, actual portrait loading and console parsing remain Main's live check.
