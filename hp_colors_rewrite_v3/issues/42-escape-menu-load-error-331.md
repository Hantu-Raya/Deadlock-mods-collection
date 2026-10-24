# 42: "Error loading escape menu HUD xml" after updating to 3.3.1

**Report** (GameBanana issue, 2026-10-24/25): "Updated to 3.3.1, getting an error about loading escape menu HUD xml. Downgrading to 3.3.0 fixes." No edition, game build, exact message or console lines given.

**Status:** not reproduced; no cause found in the 3.3.1 files. Needs the exact message (or `console.log` lines) from the reporter, and a live load of the normal edition.

## Evidence (2026-10-25)
- **Uploads are the local builds:** GameBanana md5s of `hp_colors_v330.7z`, `_qollock`, `hp_colors_v331.7z`, `_qollock` (API `_aFiles`) equal `.build/archives/` byte for byte.
- **Same files in both versions:** the VPK entry sets of 3.3.0 and 3.3.1 (normal, QOLLOCK, ShowRank) are identical; only `hud_escape_menu.vxml_c` and `hp_colors_v3_menu.vjs_c` changed size.
- **Layout:** Source2Viewer decompiles of the shipped `hud_escape_menu` (normal and QOLLOCK) differ in one line, the version label `v3.3.0` → `v3.3.1`. The layout's styles are byte-identical. So 3.3.1's XML cannot fail to parse where 3.3.0's loads.
- **Script:** the 3.3.1 menu script change (ticket 40) runs only with *Your shield bar: Separate (old)*, in the 1 s HUD watch, not while the layout loads. Its calls (`FindChildTraverse`, `BAscendantHasClass`, `GetAttributeString`) were already used elsewhere in 3.3.0.
- **Live (client 6819, 2026-10-25 00:52-03:55):** with the 3.3.2 ShowRank pak02 `4600d2d8` (same menu script plus ticket 41, same layout base) the escape menu loaded; `console.log` has no error for it. The only lines naming it are two stock warnings, `Trying to apply missing animation: TagGroove1` (the animation lives in the stock top-bar sheet); these are not version-specific.

## Likely causes, unconfirmed
- An install mix-up while updating: two v3 builds or editions at once (e.g. normal and QOLLOCK both installed, or the QOLLOCK edition without QOLLOCK's pak03), or the VPK replaced while the game was running. Reinstalling 3.3.0 would clear any of these.
- The reporter means the stock `TagGroove1` parsing warning (present with 3.3.0 too).

## Next
1. Ask the reporter: edition (normal or QOLLOCK), the exact message, the `addons` file list, and the `hud_escape_menu` lines from `game/citadel/console.log`.
2. Live: load the normal 3.3.2 release (`b30bd38d`) once on 6819, open Escape, check `console.log` for `hud_escape_menu`, `Uncaught`, `Parsing error`. Needs the user's go-ahead.
