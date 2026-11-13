# 42: "Error loading escape menu HUD xml" after updating to 3.3.1

**Report** (GameBanana issue 25766, unit3113, 2026-10-24 18:03 UTC): "Updated to 3.3.1, getting an error about loading escape menu HUD xml. Downgrading to 3.3.0 fixes." No edition, game build, exact message or console lines given. No other comment or issue reports it.

**Status:** not reproduced; no cause found in the 3.3.1 files. Needs the exact message (or `console.log` lines) from the reporter, and a live load of the normal edition.

## Evidence (2026-10-25)
- **Uploads are the local builds:** GameBanana md5s of `hp_colors_v330.7z`, `_qollock`, `hp_colors_v331.7z`, `_qollock` (API `_aFiles`) equal `.build/archives/` byte for byte.
- **Same files in both versions:** the VPK entry sets of 3.3.0 and 3.3.1 (normal, QOLLOCK, ShowRank) are identical; only `hud_escape_menu.vxml_c` and `hp_colors_v3_menu.vjs_c` changed size.
- **Layout:** Source2Viewer decompiles of the shipped `hud_escape_menu` (normal and QOLLOCK) differ in one line, the version label `v3.3.0` → `v3.3.1`. The layout's styles are byte-identical. So 3.3.1's XML cannot fail to parse where 3.3.0's loads.
- **Script:** the 3.3.1 menu script change (ticket 40) runs only with *Your shield bar: Separate (old)*, in the 1 s HUD watch, not while the layout loads. Its calls (`FindChildTraverse`, `BAscendantHasClass`, `GetAttributeString`) were already used elsewhere in 3.3.0.
- **Live (client 6819, 2026-10-25 00:52-03:55):** with the 3.3.2 ShowRank pak02 `4600d2d8` (same menu script plus ticket 41, same layout base) the escape menu loaded; `console.log` has no error for it. The only lines naming it are two stock warnings, `Trying to apply missing animation: TagGroove1` (the animation lives in the stock top-bar sheet); these are not version-specific.

## Double check (2026-10-25)
- **No game change between the versions:** GameTracking-Deadlock last changed stock `hud_escape_menu.xml` in 6711 (2026-09-29). The report fell on client 6819 (2026-10-22 23:53 UTC), still the latest; 6812–6819 touched only VData, strings and schemas. 3.3.0 and 3.3.1 share the same stock base (pin 6807), so no newly required child panel can tell them apart.
- **Same archive shape:** both 7z files hold only `pak02_dir.vpk` at the root (normal and QOLLOCK).
- **VPKs sound:** `vpkeditcli --verify-checksums all` passes for all four shipped VPKs.
- **Compiled layout, block by block:** the raw `hud_escape_menu.vxml_c` of 3.3.0 and 3.3.1 have the same header (resource version 12/3) and the same blocks (`RED2` 796 bytes, `LaCo`, `DATA` 6 bytes). `RED2` differs in 4 bytes (the input file's CRC) and `DATA` is that CRC again; `LaCo` decompresses to the same layout apart from the label.
- **Scripts parse:** every shipped script of both versions (12 normal, 13 QOLLOCK), decompiled from the VPK, passes `node --check`.
- **Engine messages** (`panorama.dll`, 6819): `Unable to load layout file '%s'. This may indicate a problem with your local install files…`, `Unable to load layout file '%s'. The addon you're running may reference a non existing file.`, `Unable to find child '%s' in layout file '%s'` and `Error in layout file %s.`. The report fits the first two. Both are raised when the layout cannot be read or names an absent file. Identical layouts and file sets in 3.3.0 and 3.3.1 cannot make that happen in one version only, but a partly replaced or unreadable `pak02_dir.vpk` can.
- **Live session re-checked:** it mounted `addons\pak02.vpk` (the 3.3.2 ShowRank build `4600d2d8`, installed 10-24 19:47, before the 10-25 00:52 launch). The log has no `Unable to load layout`, `Unable to find child`, `Error in layout file`, `FATAL` or `Uncaught` lines. The normal edition of 3.3.1/3.3.2 has not been loaded live.

## Likely causes, unconfirmed
- The VPK swapped while the game was running, or a damaged copy: the engine message ("unable to load layout file … local install") fits a `pak02_dir.vpk` that the game cannot read. Restarting with a reinstalled file (the downgrade) clears it.
- An install mix-up while updating: two v3 builds or editions at once (e.g. normal and QOLLOCK both installed, or the QOLLOCK edition without QOLLOCK's pak03).
- The reporter means the stock `TagGroove1` parsing warning (present with 3.3.0 too).

## Next
1. Ask the reporter: edition (normal or QOLLOCK), the exact message, the `addons` file list, and the `hud_escape_menu` lines from `game/citadel/console.log`.
2. Live: load the normal 3.3.2 release (`b30bd38d`) once on 6819, open Escape, check `console.log` for `hud_escape_menu`, `Uncaught`, `Parsing error`. Needs the user's go-ahead.
