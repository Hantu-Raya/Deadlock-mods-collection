# 34: ShowRank variant

**What to build:** a v3 pak02 that runs next to ShowRank barebones' `pak89_dir.vpk`, so HP COLORS and ShowRank's Escape and topbar features work together. Follows SPEC story 52 and PLAN step 8, modelled on [22b](22b-qollock-variant.md).

**Blocked by:** none

**Status:** ready-for-human (built and VM-tested; live acceptance pending)

**Runs on:** you + main agent. **Review:** n/a.

## Why

Lower-numbered paks win. Normal v3 pak02 shadows pak89 for two layouts that ShowRank also overrides, `panorama/layout/hud_escape_menu.xml` and `panorama/layout/citadel_hud_top_bar.xml`. With normal pak02 installed, ShowRank silently loses its Escape and topbar features. If ShowRank's topbar wins instead, v3 topbar timers cannot boot (see [26](26-release-at-parity.md#known-topbar-conflict)).

## What is built

- [x] Lane `hp_colors_rewrite_v3_showrank/` with `tools/showrank.js`, `tests/showrank.test.js` and the composed layouts `panorama/layout/hud_escape_menu.xml` and `citadel_hud_top_bar.xml` (generated, never hand-edited).
- [x] The composed Escape menu is v3's generated layout plus ShowRank barebones' Escape hooks and hidden party bridge. The composed topbar is v3's generated layout plus ShowRank's notification and team-average panels and its style includes. v3's root handlers run first, ShowRank's guarded calls after.
- [x] v3 is consumed one-way through `menuParts()` and the generated layouts. `node hp_colors_rewrite_v3_showrank/tools/showrank.js --check` fails when the composed layouts are stale against v3 or ShowRank sources, and on a missing anchor or duplicate id.
- [x] `build_hp_colors_rewrite_v3_showrank.ps1 -SkipDeploy [-Debug]` writes `hp_colors_rewrite_v3_showrank/.build/{release,debug}/pak02_dir.vpk`. It never deploys.
- [x] Tests: `node --test hp_colors_rewrite_v3_showrank/tests/*.test.js`.
- [ ] Live acceptance below.

## Install arrangement

- `pak02_dir.vpk` is the v3 ShowRank variant build.
- `pak89_dir.vpk` is ShowRank barebones. It still provides the ShowRank runtime, stylesheet and its six other layouts.
- No QOLLOCK `pak03_dir.vpk`. QOLLOCK and ShowRank together are unsupported: QOLLOCK's pak03 also overrides `citadel_hud_top_bar_player`.
- Use the debug build for the first live check, fully restart the game after install, and record the game build and installed pak hashes.

## In-game acceptance

Escape menu:

- [ ] The HP COLORS menu opens and saves.
- [ ] ShowRank ranks, team averages and party stacks fill on the first Escape open and again on reopen.
- [ ] Resume and cancel behave as in normal v3.

Topbar:

- [ ] v3 topbar timers boot.
- [ ] ShowRank team averages show.
- [ ] The missing-enemy announcement shows.

Console:

- [ ] No `Uncaught` or `Parsing error` lines in `console.log`.

## Rollback

Reinstall the normal v3 `pak02_dir.vpk` (from `hp_colors_rewrite_v3/.build/release/`). Leave `pak89_dir.vpk` as is; with normal pak02, ShowRank's Escape and topbar features stay off.

## Rules

- Every menu or topbar change now reaches three variants: normal, QOLLOCK and ShowRank. Regenerate v3, then run both `qollock.js --check` and `showrank.js --check`.
- Do not bump `settings/record.json` for this lane alone.
