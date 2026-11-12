# 44: COLORBLIND tab

**What to build:** a COLORBLIND tab after UNITS with three switch rows (Protanopia, Deuteranopia, Tritanopia) that turn on the game's full-screen color blindness view. They mix, because each switch sets its own weight.

**Round 2 (2026-10-28):** the first build put the switches at the foot of the side rail, above SHOW BOUNDS. The user found that cluttered ("make that on a new tab… make it clean"), so they moved to their own tab, styled as normal setting rows in one untitled card, and the rail went back to SHOW BOUNDS only (its CSS is byte-identical to before ticket 44). The tab has no reset (nothing on it is a setting) and hides while searching, like every page without a matching setting.

**Round 3 (2026-10-29):** the user asked for the choice to apply again after a game restart. The convars are not archived and start at 0 every launch, so the menu now saves the choice as the bundle's personal `colorblind` list (lowercase type names; like `newsDismissed` it stays out of shared bundle codes and presets, REPLACE ALL keeps it, and an older 3.4.0 client keeps the unknown metadata key when it re-saves). The first store load in a game (top-panel `hpv3_colorblind_session` unset) sends `... 1` for each saved type; a refused command leaves that switch off. A game that already has a choice (made before the store loaded, or restored earlier) keeps it, and saves it on the next frame if it differs (the load itself refuses bundle writes). The COLORBLIND description now says the choice is saved and comes back after a restart. Tests (red first): `tests/colorblind-view.test.js` restart restore, once per game, off stays off, all off saves nothing, pre-load choice wins and is saved, REPLACE ALL keeps it, malformed lists ignored, refused restore. Not checked in game: when the store loads relative to the first frame of a new game (the view turns on once the HP Colors store answers).

**Status:** round 2 built and VM-tested. Live: the rail version was confirmed by the user (2026-10-28, ShowRank release `c1a78d13`, [ledger](../LIVE-VERIFIED.md)); the tab version is not yet checked in game.

**Origin:** GameBanana report (panicpulsenow, 2026-10-27: colorblind, asks for trooper healthbar colors). User decision (2026-10-28): add the game's full-screen colorblind convars as switches that mix. The user was told first that these convars simulate color blindness for people with normal vision (their help text says "simulation weight") and do not correct colors; the game has no correction filter (no `daltoni*` string in the 6821 DLLs).

## Engine facts (client 6821, static)

- `r_colorblindsim_fullscreen_weight_protanopia`, `_deuteranopia`, `_tritanopia`: flags `0x80000` (`FCVAR_RELEASE` only: not cheat, not developer-only, not archived), default `0`.
- `r_colorblindsim_mode` default `1` (fullscreen) and `r_colorblindsim_rendermethod` default `3` (game ui service) (`.scratch/gameinfo_opt/cvarlist.md`, 6745–6785 dumps), so only the weights are sent.
- `CitadelConCommand` reaches ordinary release convars from the Escape menu (ticket 30, live 6785). There is no read-back API.

## Implementation

- `tools/menu-layout.js`: page `Colorblind` (title COLORBLIND, after Units) whose description carries the help; `colorblindPage()` emits `HPColorsColorblindCard` (an `HPC3Card` with an empty head) and rows `HPColorsColorblind{Type}Row` (`HPC3Row HPC3TypeBoolean`, titles "Protanopia (red-weak)" etc.) holding `HPColorsColorblind{Type}Toggle`. No reset or condition buttons, no search entry. Tests that counted every card/row as a schema setting now exempt these explicitly (`menu.test.js`, `theme.test.js`), and the page-order tests list COLORBLIND.
- `hp_colors_v3_menu.js`: a click dispatches `CitadelConCommand` with `r_colorblindsim_fullscreen_weight_<type> 1|0`; only after the dispatch returns are the state, the top-panel attribute `hpv3_colorblind_<type>` and `Checked` updated. A reloaded menu reads the attributes and sends nothing; an old panel's handler is ignored. No publication, record, code, preset or Undo entry.
- QOLLOCK and ShowRank get it through the regenerated menu.

## Evidence

- Suites (2026-10-28): v3 1362/1362; QOLLOCK + ShowRank + v2 storage 93/93. `generate.js --check` 12 current; `qollock.js --check` and `showrank.js --check` current.
- Builds (`-SkipDeploy -AllowPinMismatch`, installed 6821, pin 6807; staged suites 0 failures; 0 compile failures): normal release `f6333542`, debug `1e0f6b16`; QOLLOCK release `81e9c0f1`; ShowRank release `c1a78d13`. The decompiled layouts of all three releases carry the three switch ids; the normal release script keeps `r_colorblindsim_fullscreen_weight_` and `CitadelConCommand` after Closure.
- `tests/colorblind-view.test.js` (red first: the switches did not exist): commands per click and mixing; a refused dispatch leaves the switch off; no save/store write/publication/code/preset/Undo; survives menu reload and script reinclusion without sending; resets on restart; plain labels and help. Mutations killed: removing the stale-panel guard, painting before the dispatch, not reading the attributes back.
- Round 2 (tab): suites v3 1362/1362, QOLLOCK + ShowRank + v2 storage 93/93; generators current. Builds: normal release `8466b7d8`, debug `387cefc4`, QOLLOCK `b65cfaca`, ShowRank `c558d347` (md5); all three release layouts carry the COLORBLIND nav tab and three switches and no rail block. Installed 2026-10-28 (game closed, 6821): ShowRank `c558d347` as `addons/pak02_dir.vpk`; the rail build `c1a78d13` is in `addons_disabled/pak02_dir.vpk.showrank-colorblind-rail-c1a78d13`. Not yet checked in game.
- Installed (2026-10-28, game closed, client 6821): ShowRank release `c1a78d13` as `citadel/addons/pak02_dir.vpk`, next to ShowRank barebones `pak89` `3e7d754a`. The previous ShowRank 3.3.2 `b94a00ee` is in `citadel/addons_disabled/pak02_dir.vpk.showrank-v332-b94a00ee`. Not yet launched.

## Live check (user, 2026-10-28: "all works"; items below were the checklist)

- Each switch changes the screen; two or three on mix; off restores; values confirmed in VConsole.
- The rail at 1600×900 and 1920×1080: nav list still scrolls, nothing overlaps; no `Parsing error`, `FATAL` or `Uncaught`.
