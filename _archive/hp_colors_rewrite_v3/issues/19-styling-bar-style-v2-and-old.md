# 19: Styling: bar style V2 and OLD

**What to build:** BAR STYLE V1/V2/OLD including the OLD pip grid.

**Blocked by:** 18

**Status:** done — audit 19 findings (four P2) fixed; VM verification complete **Live:** the user confirmed it works in game (2026-10-17, [ledger](../LIVE-VERIFIED.md)).

**Runs on:** gpt-6.1-sol (med). **Review:** code-review.

- [x] Matches SPEC story 18
- [x] VM E2E tests boot the real scripts and pass

## Preview parity requirement

The user requested the V2 opacity mask during ticket 09's live comparison. It remained deferred to this ticket: when BAR STYLE V2 lands, the preview must show the same selected stock masks as world bars, while V1 keeps the rectangular, mask-off default.

Update 2026-10-14: at the user's request the preview bar then always showed the stock mask (primary, inner, lines, outline), regardless of world bar style.

Resolved 2026-10-15 (user decision): the preview **follows the selected style**. The always-on preview masks in `menu.css` are gone; V1 and the uncustomized look are rectangular, V2 adds the masks through the same `HPColorsV3BarMask` root class as world bars, and OLD paints the same pip grid through the renderer's `plan`/`apply`.

## Implementation

- **Settings (record v9, slots 158–159, slot additions only).** `barStyle` — shared enum `none`/`original`/`old` labelled V1/V2/OLD, default `none`, Bar page, group Style, Basic (v2 `barMask`, slot 74, GENERAL → Layout). `nameRiseWithPips` — shared boolean, default `true` (v2's shipped value), Name page, Advanced (v2 GENERAL → Names & Labels). No existing default changed; untouched saves and codes stay sparse; worst-case settings code is 2246 characters.
- **Converter.** `barMask → barStyle`, `nameRiseWithPips → nameRiseWithPips`. v2 sparse saves keep v2 semantics (an absent `nameRiseWithPips` is the frozen `false`). v1–v8 records promote pending `barMask`/`nameRiseWithPips` at the v9 boundary; v9 pending never overrides the deliberate default.
- **Which bars.** Like v2's `HPColorsRewriteBarLines` gate: master on and an eligible (customized) surface — heroes and open NPC/neutral/objective gates. Master off, closed gates, unknown/ambiguous units and teardown stay on the rectangular baseline.
- **V2.** One owned root class `HPColorsV3BarMask` restores exactly the three stock masks the generated suffix deletes (`.UnitHealthbarContainer` — primary and shield bar —, `#UnitHealthbarInner`, `#UnitHealthbarLines`; vendor 263/325/351). While outlined, only the primary container drops its mask and the outline backer takes it (v2 1959–2018). Outer backgrounds stay deleted.
- **OLD.** Root classes `HPColorsV3BarOld` (fallback: slate inner `#182123`, engine lines as full-height 250-HP gaps on the 69×12 fill box) and, when a total is known, `HPColorsV3BarPips` (native inner, lines and primary kill marker at opacity 0, deferred layer collapsed, owned `#HPColorsV3PipGrid` visible). The grid and its eight layer containers are generated into the overlay (and preview) layout; boxes are created on first OLD paint.
  - Total = `count·250·width/x_last` from the engine lines, reading the last line's inline percent `position` first (layout as fallback); no lines (below 250 HP or above 50 lines) keeps the fallback; more than 128 boxes also falls back.
  - v2 grid math: 100-HP boxes 8.5% wide, 10 per row, first box bottom-left, rows grow up, box height `80/rows %` of a `min(rows,4)·6px` grid (more than four rows compress). A partial last box keeps its HP width.
  - Health uses the raw fill fraction × line total (fill and layers share it, so shields grow the grid), never the shield-corrected health; HP snaps to 0.1. Shield and Rat King barrier are mirrored under the fill, healing and delta over it, washed with the colors applied to the matching native layers; only boxes a span touches are rewritten.
  - Rims: with the outline on, solid px backers (box ± thickness) under the empty boxes replace the primary-inner backer; color/opacity/thickness follow outline settings; health never rewrites them.
  - Ticket 12 interplay: OLD releases line color and line opacity ownership, keeps the lines laid (HIDE LINES does not apply), hides the primary kill marker and draws the kill marker inside the box holding the threshold HP.
  - Names: with lifting on, player names rise `(rows−1)·6px·barHeight/18` (first row keeps the native spot).
  - Anchored level/ultimate badges follow the grid's vertical centre (v2 `oldGridLift`, `unit_status_v2_colors.js:3202-3207,3325-3381`): lift `(rows·6/2 − primaryHeight/2 + 2.5)·barHeight/18` with rows capped at four; anchoring off ignores it.
  - Structure (audit fix): each layer holds one row panel per 1,000 HP with ten static boxes. Rows carry the row-dependent position/height, so a total change rewrites rows, not every box. Fill and feedback layers clip their rows (like the engine clips its HP layers; stock `#unit_healthbar_lagging` keeps its `.healthbar_border` child inside that clip), so a health change rewrites only rows whose clip moved. Empty-box widths and rim px geometry are written only when they change.
  - Boxes are renderer-created children of the owned grid, so they use write-only caches instead of the ledger. The grid is shown only with the ledger-owned `HPColorsV3PipGridActive` class on the current primary's grid (resolved in `discover`), so a recycled primary's grid is deactivated on reset; removing the root classes still returns every native panel at once. The cache lives on the grid panel and a lost cache deletes old rows before repainting.
- **Cadence.** Like v2's `layoutOld`, the OLD line total and healing/delta spans are read only on full paints (0.15 s active, 1.5 s idle). The 0.15 s idle probe is unchanged (fill, shield, barrier), and every total or feedback change in play also moves the fill or shield. OLD skips V1's per-tick line recount.

## Evidence

- `node --test tests/*.test.js`: **660/660 pass**, 0 skipped (`.tmp/t19-suite.log`). `node tools/generate.js --check`: **12 outputs current** (`.tmp/t19-generate-check.log`). No adapter change, so the root `validate-hp-colors-rewrite-*` suites were not rerun.
- World VM E2E (`tests/renderer.test.js`, “ticket 19 …”): V2 masks/outline/V1/master-off and closed vs open NPC gate; OLD grid at 1000/2350/4246/12000/12749 HP plus 13000/200 HP fallback with an unlaid native inner; shield/delta and Rat King barrier boxes at the line total (live 6753 trace); measured-position fallback and the 128-box cap; line release, hidden-line gaps, grid kill marker and rims; name lift; anchored badge lift (−4.4px at 4,246 HP, +2.8px at one row, none unanchored); recycled primary leaves only the replacement grid visible; runtime V1/V2/OLD switching and master off restore every native panel exactly; reinclusion keeps one pool; deliberate cache loss deletes the previous boxes; world/preview box parity. Geometry is asserted through the structure-agnostic helper `tests/old-grid.js`.
- Preview VM E2E (`tests/preview.test.js`): V1 unmasked, V2 masks, master off; OLD hero/NPC/objective grids with damage and heal play in boxes; anchored badge lift matches the renderer plan. “audit: preview ids mirror…” and “live comparison: missing HP stays black…” assert the V1 rectangular default.
- Migration (`tests/migration.test.js`): `v2-bar-style-migration.json` — save schemas 1–5, HPCR2 and HPCRP1 hpv2 v1–3 (11 cases); v1–v8 bar-style pending promotes at v9 through load and import for bundle, presets and scopes (16 tests); v9 same-version pending does not override; default bar style stays out of the sparse wire. Worst-case settings code 2246 characters.
- Audit 19, red first (`.tmp/t19b-red.tap`): before the fixes the new tests failed with stress OLD **301.1** (12,500 HP) and **304.0** (12,749 HP) > 300, shield-total churn **303.3** > 270, unchanged badge positions in world and preview, and a visible orphan grid. The four mutant-guard tests passed on correct code and fail on their mutants (below).
- Ops per bar per second (10 s windows): V1 hero maxima unchanged — active **219.3**, idle **194.3**, dormant **11**; units **166.4 / 150.6 / 30**. V2 **164.3 / 145.7**. OLD **197.2 / 141.8**; OLD at 50 lines (12,500 HP) **198.4 / 141.8**; full stress OLD at 2,000 / 12,500 / 12,749 HP **248.2 / 249.9 / 250.6** active, **190.4** idle; 600-point shield total alternating every second **216.2**. OLD active scenarios assert ≤270 (30 of margin); class-query walk stays under 1500.
- Mutation check (`.tmp/t19-mutations.js`, `.tmp/t19b-mutations.log`): **17/17 killed** — the earlier ten plus the audit's four survivors (128-box cap, Rat King segments, measured-position fallback, lost-cache cleanup), no badge lift, no active-class gate, and per-paint clip rewrites (killed by the budget tests).
- Honest limits: the row/clip structure relies on Panorama clipping a panel's children with `clip`, which the stock lagging layer and its border child imply but which is not live-verified; CSS is VM/cascade-checked only. The live look of V2 masks, boxes and rims needs the in-game check (ticket 26). No build, deploy, launch or git action.

## Whole-codebase audit 3

- World NPC and objective bars now have their own OLD-grid test ("audit whole 3: a world NPC/objective bar draws OLD boxes…"), which kills the "OLD only for players" mutant. Details in ticket 22.

## Batch close (2026-10-15)

Whole-codebase audit AuditWhole-3 (m2) findings fixed. Final: suite 923/923, generator current, both builds 0 failed (release e7352671, debug 76d9da02). Live 6782: debug build installed, loads with no Panorama parse errors after splitting oversized selector lists (new --check guard), menu/renderer boot logged, own HUD bar shows the OFF white look. Menu, preview and world-bar visuals for this ticket not yet seen in game.

## Live 6782: stock mask stayed on V1/OLD

- **User report (6782 debug build).** In-match bars on V1 and OLD still showed the slanted stock mask; on a TargetDummy with OLD, the top row of boxes was cut on a slant.
- **Cause.** The generated stock sheet kept the three stock `opacity-mask` declarations and appended `opacity-mask: none` overrides. In game, `opacity-mask: none` does not cancel an earlier mask.
- **Fix.**
  - `tools/game-data.js` now builds the stock sheet the way v2 does. It deletes the three masks and the nine outer-container `background-color` declarations, and drops the six relation rules that become empty. Every rule and declaration is an exact anchor, so any drift fails, and the appended suffix is gone. The inner black backing stays.
  - BAR STYLE V2 masks the primary container only through a new owned root class, `HPColorsV3BarMaskPrimary`. It is planned only while V2 is on and the outline is off; the shield container, inner, lines and outline backer use `HPColorsV3BarMask`. The preview uses the same classes.
  - No packed rule declares `opacity-mask: none` any more.
- **Tests.**
  - `tests/style-cascade.js` now models the live fact: a stylesheet `opacity-mask: none` cancels nothing.
  - The existing mask and backer assertions now expect "no declaration". Against the old generator, 10 renderer and preview tests were red (`.tmp/mask-red.log`).
  - Two new generator tests, red first (`.tmp/mask-contract-red.log`):
    - the `--check` contract rejects `opacity-mask: none` in any packed sheet and any mask in the stock sheet;
    - the generated sheet matches v2's deletions exactly.
  - The game-data test now derives the expected stock text with those exact deletions.
- **Mutations.** 7/7 killed (`.tmp/mask-mutations.log`):
  - primary class always on; primary class always off;
  - no inner mask under V2; preview primary rule dropped;
  - mask kept in the stock sheet; a `none` override reintroduced;
  - a container backer kept.
- **Results.** Suite 925/925; `--check` current with 586 rules. The in-game look needs a rebuild.
