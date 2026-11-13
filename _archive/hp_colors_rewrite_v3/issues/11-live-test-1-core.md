# 11: Live test 1 (core)

**What to build:** With your consent, the debug build is installed and checked in game: core bars, menu, preview, saving, v2 conversion.

**Blocked by:** 05, 06, 09, 10

**Status:** on hold (user, 2026-10-17): the user is releasing first to gather feedback. Only in-game checks remain. The features were built in tickets 03, 07 and 13 plus the [renderer restoration contract](../SPEC.md#renderer-restoration-contract), and pass the automated tests. The "restore v2 after the test" box was removed on 2026-10-17 because the user keeps v3 installed.

**Runs on:** you + main agent. **Review:** n/a.

**Live findings (2026-10-14, debug build, 6779), each fixed:**
- Deadlock 6779's Escape context has no `GameUI`; menu publication now uses `ClientUI_FireOutput` only. Evidence: `.build/evidence/live1-gameui-red.tap`, `.build/evidence/live1-gameui-tests-green.tap`, `.build/evidence/live1-gameui-regression-red.tap`.
- `""` inline writes fail for `textShadow` ("Failed to parse style value"); one failed release rolled back the whole paint every tick. Renderer now clears with `null` and clears margin/font/animation longhands through their shorthand (v2's setStyle). Red: `.build/evidence/live1-textshadow-red.tap`.
- The engine's fill clip is padded with a trailing space (`"rect( 0.0%, 86.622070%, 100.0%, 0.0%) "`); the anchored parser never matched, so every laid bar read 100% health and enemy bars stayed on the team-high colour. Signals are trimmed like v2; the renderer fixture now uses the exact live format. Red: `.build/evidence/live1-clip-trim-red.tap` (11 renderer tests).
- Slider rows: with `flow-children: right` and `fill-parent-flow(1)` the native Slider kept the row and squeezed the value entry to a sliver, hiding the unit. Entry and unit are now right-pinned and the row slider reserves 110px. Not modelled by the VM (native Slider layout); live evidence `.scratch/hpv3_live1/slider_entry_fixed_live.png`.
- Carrier depth: 5 world contexts reported `client_ui_panel` at depth 1; the rest depth 2 as assumed.

- [x] Your go-ahead recorded before install/launch (user, 2026-10-14: "sure")
- [x] Findings recorded in `LIVE-VERIFIED.md` (written 2026-10-15). Every live defect found so far was fixed in its own ticket or audit round, so no new tickets were opened.
- [x] Debug's once-per-carrier `renderer carrier depth=… ancestry=…` observations match the representative depth-2 world-parent assumption (split-stock fixture depth 3); record unexpected deeper chains before making operation-budget claims. **6785 sandbox (2026-10-15, debug `ad6ff1c6`):** 5 `client_ui_panel` at depth 1 and 6 world panels at depth 2; no deeper chains. Real matches are not checked.
- [ ] Native `UnitStatus` and `name` reparenting keeps name/HP engine updates, shake origin, ultimate-badge alignment and original sibling order across master-off/recycle; compare with a never-owned stock panel.
- [ ] Stock numericOracle/offWhite/team-dark macro fallbacks match the current game; check native fades, critical/empty states and the `0.01` hidden-bar keepalive with HP visible.
- [ ] Release-to-stock: customize enemy/ally bars, then disable colors/features and master. Confirm absent inline styles clear (with `null`, see findings) and captured non-empty values restore exactly; compare with a never-owned panel using the same global rectangular/unbacked baseline. Trigger/remove damage, critical, empty-health, HP show/fade, HideName and spectating states after release: native presentation must change immediately, not 1–2.5 s later. Verify default name tilt and enemy HP-off suppression.
