# 21: Styling: text outline and alignment

**What to build:** Text outline widths and name/HP-text alignment.

**Blocked by:** 20

**Status:** done (VM); in-game look pending ticket 26 **Live:** the user confirmed it works in game (2026-10-17, [ledger](../LIVE-VERIFIED.md)).

**Runs on:** gpt-6.1-sol (med). **Review:** code-review.

- [x] Restores captured stock text-shadow exactly at default
- [x] VM E2E tests boot the real scripts and pass

## Inventory against v2

Ticket 07 already shipped `hpTextOutline`, `nameOutline`, `hpTextAlign` and `nameAlign`. Measured against v2 `unit_status_v2_colors.js` (`applyTextOutline` 1911, `applyReadout` 1615, `positionReadout` 1691, `applyPlayerName` 1925):

- Already at parity, now proven by tests: bounds 0–10, step 0.5, default 5; HP shadow `0px 0px 0px <w> #10130D`, name shadow `… #10130Dee`; width 5 writes nothing, so the stylesheet or the captured inline value stays in charge (v2 skips name ownership at size 14 and outline 5); HP glyph room `ceil(w)` as padding with equal negative margins; name room `max(2, ceil(w))` and max-width `170 + 2·(room − 2)`; HP anchor `bar centre + 33.5 + offset·sx + 2·(q − 1)·4` with native row alignment and canvas clamp; name anchor `canvas centre + offset + (2q − 1)·room` with the oversized-centre rule, tilt after the translate and the OLD lift; enemy pulse HP text uses the same alignment at its own offset. The converter already mapped all five v2 keys.
- Gaps closed:
  - v2 writes `text-align` together with `horizontal-align` on owned names. The plan now writes both (`horizontalAlign`, `textAlign`).
  - v2 `NAME_STOCK_ALIGN`: in game, a null alignment clear left a moved name aligned. When no inline value was captured, the ledger now releases the name's `horizontalAlign` and `textAlign` to an explicit stock `center` instead of null (`EXPLICIT_STOCK` in the renderer). Captured inline values still restore exactly.
  - Help text for the four rows now uses plain words (no "Panorama", "native", "v2's", "stock").
- Kept as is: v3 keeps `nameOutline`, `nameAlign` and `hpTextAlign` per side (ticket 07 schema; v2 values copy to both sides). No settings were added, and the record stays at v10.
- Audit 21 fixes (P2 ×2, docs):
  - Live 6779 opacity-0 panels report width 0, so a fading right-aligned name jumped from x 150 to 200 and the HP row from 172 to 200. Like v2 (`applyPlayerName` 1980-1991, `positionReadout` 1702-1707), `laid()` keeps the last laid name and row size per panel in a WeakMap, so a replaced panel starts empty. A panel never laid defers placement: the name translate and the row transform are omitted. No extra settle polling was added; the 1.5 s geometry sample retries.
  - Name max-width now widens the captured inline baseline, read once per name panel at its first geometry sample, before ownership. It falls back to the stylesheet 170. A new module or carrier always releases before it samples.
  - `SPEC.md` (Renderer) and `PLAN.md` (§ apply) record the narrow explicit-`center` name-alignment release exception.

## Evidence

- `node --test tests/*.test.js`: **741/741 pass**, 0 skipped (`.tmp/t21-suite.log`). That is 714 plus 27 new: 9 renderer, 1 preview, 11 migration and 6 ops scenarios. `node tools/generate.js --check`: **12 outputs current** (`.tmp/t21-generate-check.log`). There was no adapter change, so the root `validate-hp-colors-rewrite-*` suites were not rerun.
- World VM E2E (`tests/renderer.test.js`, “ticket 21: …”):
  - Every width 0–10 in 0.5 steps, on enemy and ally names and HP text: exact shadow string, stylesheet value at 5, padding, margins and widened max-width. Menu entry 12 → 10, −3 → 0, 7.3 → 7.5.
  - Name LEFT/CENTER/RIGHT on both sides, with per-side offsets, shared tilt 15° and the OLD lift: exact x/y, rotation after the translate, `horizontalAlign` = `textAlign`, plus the grow-right far-edge clamp. Master off returns stock −4°, centred.
  - HP LEFT/CENTER/RIGHT on both sides keeps one text point (centre −4, right −8) under offsets that scale per axis, with tilt kept on the label. Clamps at +334 give 0/86/172. The enemy pulse offset moves the point by −20·sx under the same alignment, and release returns the label to its stock parent.
  - Defaults: no `textShadow` write on HP text and no style write at all on names. The captured inline (`1px 2px 3px 4 #ABCDEF`, `… 6 #10130Dee`) or the stock stylesheet (`0px 0px 0px 5.0 offBlack`, `0px 0px 0px 4.0 offBlack&ee`) holds exactly after width → 5, with the name owned by size alone, master off, stop/start, and features off.
  - A Proxy models the live null-clear bug. Released names compute centred for three release paths: CENTER, master off, and name hidden. This test was red before the fix.
- Audit 21 VM E2E (`tests/renderer.test.js`, “audit 21: …”, all three red first):
  - A fading name (NameFaded, width 0) keeps x 150, and recovery at 90 px gives 110. A replaced unmeasured name gets no translate (not the old size); once measured at 40 px it gets 160.
  - A never-laid HP row is not placed, and its first laid sample gives [-33.36, 73.4]. An unlaid row keeps 172, and recovery at 40 px gives 160.
  - A captured 210 px name max-width gives 226 at outline 10, 210 at 0 and 222 at 7.5. It restores to 210 on master off and is 222 after stop and reinclusion.
  - A pending max-width lease (release rejected across stop and reinclusion until config arrives) keeps the 210 base.
  - The preview test “late/unlaid row measurement …” now expects the last laid width (36) while unlaid, with retries still bounded (≤5).
- Preview VM E2E (`tests/preview.test.js`, “ticket 21: …”):
  - Default stock outlines are untouched.
  - Widths 0/2.5/10 on both sides, and all three alignments with offsets, equal the renderer plan for name transform, row transform and alignment.
  - Width 5 and master off return the stock outlines, and the name stays centred.
- Migration (`tests/fixtures/v2-text-outline-align-migration.json`, generated by `.tmp/t21-make-corpus.js`): save schemas 1–5 and HPCR2/HPCRP1 hpv2 v1–3, 11 cases. Two distinct value sets: HP 2.5/8 with name 9.5, right/center; and HP 0/10 with name 3, left/right. The five keys are asserted consumed from pending.
- Ops per bar per second (10 s windows, new `textAlign*` scenarios use both alignments, offsets and widths 0/10): `textAlignActive` **164.3**, `textAlignIdle` **145.7**, full stress with shake and tilt **219.3** active, churn **194.3** idle; OLD **197.2 / 141.8**. These match the defaults (164.3 / 145.7 / 6 dormant / 11 released) and the maxima: hero 219.3 / 194.3 / 11, OLD 250.6 / 190.4. The feature adds no per-tick cost; values are plan-memoised and nothing is written at default.
- Mutation check (`.tmp/t21-mutations.js`, `.tmp/t21-mutations.log`): **22/22 killed** (15 ticket mutants plus 7 audit-fix mutants: laid size never cached, cache shared across panels, cache keyed globally, unlaid row placed, unlaid name placed, captured max-width ignored, base re-read every sample). The mutants were: name `textAlign` dropped; null release of name alignment; name shadow without `ee`; HP or name shadow written at 5; name outline not owning the name; name room minimum 2 dropped; max-width not widened; HP room floored; HP row padding term dropped; row alignment inverted; name room ignored by the anchor; and three converter swaps. `Math.round` for the HP room is an equivalent mutant on 0.5-step widths, so `floor` was used instead.
- Honest limits:
  - Only the textAlign and null-release tests were red first. The width, HP-alignment, default-restore, preview and migration tests passed against the existing ticket 07 code, so their evidence is the mutation run.
  - Explicit-centre release relies on v2's in-game finding and is VM-modelled only. Outline thickness and alignment need the in-game look (ticket 26).
  - No build, deploy, launch or git action was taken.

## Whole-codebase audit 3

- Name, HP-text and outline help text was rewritten in plain words, and a menu test now scans every row for internal terms. Details in ticket 22.

## Batch close (2026-10-15)

Whole-codebase audit AuditWhole-3 (m2) findings fixed. Final: suite 923/923, generator current, both builds 0 failed (release e7352671, debug 76d9da02). Live 6782: debug build installed, loads with no Panorama parse errors after splitting oversized selector lists (new --check guard), menu/renderer boot logged, own HUD bar shows the OFF white look. Menu, preview and world-bar visuals for this ticket not yet seen in game.
