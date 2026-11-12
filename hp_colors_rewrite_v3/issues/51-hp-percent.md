# 51: HP percent beside the HP number

**What to build:** let the custom HP number show health as a percent of max health, after the number or on its own.

**Request (Discord, FireworkPolymer, 2026-11-09):** "Hello, can you add health percentage to the mod? like the hero has 2000 hp, then 200 would be 200/10%"

**Status:** implemented and VM-verified (3.7.0, record v22). Only the ShowRank release was built (user, 2026-11-12: "only build the show ranks compatible"): `hp_colors_rewrite_v3_showrank/.build/release/pak02_dir.vpk` `cd24ded1` (staged compiled suite 1415 passed, 2 skipped; ShowRank 11/11; 20 compiled, 0 failed), not installed. The compiler needed `DOTNET_ROLL_FORWARD=Major` because this machine now has .NET 8 and 10 but not 9. Not checked in game. The build's installed-version check did not run (the old script looked for Deadlock on `G:`; it is on `F:`): the installed game was 6861 against pin 6828, so this pak was built against 6828 stock files without the mismatch being reported.

## Decisions

- **Setting:** *HP number format* (HP TEXT, first card after *Custom HP number*, basic, per side; slots 216 enemy / 217 ally, record v22): *Number* (default, unchanged look), *Number / percent* (`200 / 10%`), *Percent* (`10%`). It needs *Custom HP number*, like the other HP TEXT rows; the stock-placed number stays stock.
- **Value:** the renderer's health fraction, the same one the bar colors, thresholds and pulse use: the `unit_healthbar_lagging` fill over the bar minus the barrier/armor span past it. Rounded to the nearest whole percent, clamped to 1-100 while alive (never `0%` above 0 health). The client exposes no max-health dialog variable on world bars (only `{d:health}`), so the number itself is not divided by anything.
- **Panel:** an owned label `HPColorsV3HPPercent` inside `HPColorsV3ReadoutRow` (a right-flowing, fit-children row). With a percent shown the adopted `UnitHealthbarValue` goes in before it (renderer `parents.value = {parent: "row", before: "hpPercent"}`), so alignment, offsets and clamping measure both labels as one line. With *Number* the adoption is the same as before (`"row"`, no `before`).
- **Look:** the label copies the number's inline font, size, color (bar band, team or custom), padding and outline every paint, and the low-HP text pulse classes. CSS gives it the stock number's base (bold, `#FFEFD7`, `#10130D` 5.0 outline). In *Number / percent* it sits `0.3 × font size` after the number.
- **Tilt:** with a percent shown, *HP text tilt* turns the whole row (`translate3d(…) rotateZ(…)`) so the two labels stay one line; with *Number* it still turns the label only (ticket 20 behavior unchanged).
- **Visibility:** root classes `HPColorsV3HPPercent` (show the label) and `HPColorsV3HPPercentOnly` (collapse the number). Both wait for a known health fraction; until then the number shows as before. `unkillable` hides the percent like the number.
- **Preview:** the preview row carries `HPColorsPreviewHpPercent`; the sample shows the same text from the slider (`100 / 10%` at 10 % of the 1000 HP sample).
- **NEW tab:** item `hp-percent` (3.7.0) targets both sides' rows. Release raised to **3.7.0** (a user-visible feature).

## Known limits

- The percent comes from the bar. While a barrier pushes the bar past max health, the game stretches the bar total to health + barrier + recent damage, so the percent (and the bar color fraction) reads high, up to 100 %. The number is unaffected.
- The percent is a whole number; 99.6 % shows `100%`.
- Unit bars (neutral camps, objectives) and the stock-placed number never show a percent.

## Data flow and performance

- No new reads: the fraction is already measured each paint. A change writes the label text once per shown percent step and the copied color when the band color moves.
- Ceiling scenarios `…HpPercentIdle` 194.3 ≤ 200 (same as without) and `…HpPercentTiltActive` 223.9 ≤ 300 counted ops/bar/s; the active sweep adds 25 text writes and 21 color writes in 10 s.
- Menu: two more rows (syncAll validity 954 → 964), one more NEW item (bootChrome 266 → 268). The preview finds its percent label from the row (no ancestry walk; preview parent reads 1974 ≤ 2000).
- Save size: a full v2 conversion copy of every setting per scope grows by two slots; the largest synthetic all-keys-changed save that converts under the 192,000 cap drops from 24 to 23 scopes.

## Acceptance

- [x] Renderer: Number shows no percent; Number / percent writes `/ 10%` after the number with the number's look; 100 / 55.4 / 0.3 % read `100%`, `55%`, `1%`; Percent hides the number; unkillable hides the percent; tilt turns the row; Custom HP number off and master off release everything (`tests/renderer.test.js` "ticket 51…").
- [x] Preview sample follows the format and the slider (`tests/preview.test.js` "ticket 51…").
- [x] Codec: a v21 record reads Number on both sides; slots 216/217 are written only when changed and round-trip (`tests/codec.test.js` "record v22…").
- [x] Counted per-bar ceilings hold with the percent on both sides.
- [x] Generators current; QOLLOCK and ShowRank layouts recomposed.
- [x] ShowRank release build `cd24ded1` (packed overlay carries `HPColorsV3HPPercent`).
- [ ] Normal and QOLLOCK release builds (not requested).
- [ ] In game: placement and spacing beside the number for each font, the value against the number on a known max health, and a console check for `Parsing error`, `FATAL` and `Uncaught`.

## Engine research (2026-11-13)

The 6861 `client.dll` sets only `health`, `name` and `player_level` on the world health bar, and Panorama JS cannot read dialog variables ([research/dll-tooling-findings.md](../research/dll-tooling-findings.md), disassembly, not checked in game). No class, attribute or variable carries max HP or barrier, so the barrier limit above has no exact fix. Untested idea: subtract the barrier layer's measured width (`unit_healthbar_bullet_shield`, `actuallayoutwidth`) from the bar geometry before computing the percent.
