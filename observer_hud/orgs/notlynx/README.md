# NotLynx (КиберФестиваль МГУ)

Requested 2026-11-09 by NotLynx_ (Discord `lynxisgone`, tag CCDA), with `HIKASAMI-REGULAR.otf` and `logo.psd`:

1. Change the font to Hikasami Regular.
2. Replace the centre logo (as in Night Shift).
3. Add a third ban slot (if possible).

## What the variant does

- **Font**: Hikasami draws every own label of the top bar (both looks), the status column and the post-game
  board (`org.json` `font.styles`: `oh_band`, `oh_bar`, `oh_debuffs`, `pg_board`; 46 declarations). It ships loose as
  `panorama\fonts\creepster.otf`, a name the stock `fonts.conf` lists that no stock file uses. Pango finds it by its
  internal family name `Hikasami` (Latin and Cyrillic). The Escape-menu editor and the lobby keep the base fonts.
  Stock HUD text (clock, soul totals, card levels) keeps the game's fonts.
- **Centre logo**: `org_logo.png` (208x320, from `logo.psd`) fills Night Desk's centre plate in place of the
  organiser name, with the series digits on either side (`styles/oh_band.css`). It also replaces the organiser name
  in the post-game board's centre column (`styles/pg_board.css`). A logo URL set in the editor still wins. Base
  Game+ Names keeps the organiser name: its centre tab is 26 px high, too short for this tall logo.
- **Bans**: three bans per team were already in 0.3.1 (`Per team` 2 | 3 on the editor's MATCH page and in the lobby).
  This variant defaults to 3 and to the Night Desk look (`org.json` `defaults`). A setup saved on a PC before keeps its
  own values: switch `Per team` to 3 once or press RESET MATCH.

## Files

| Path | What |
|---|---|
| `org.json` | Defaults, font, art (see [../README.md](../README.md)) |
| `styles/oh_band.css`, `styles/pg_board.css` | Appended to the base stylesheets |
| `panorama/images/observer_hud/org_logo.png`, `.vtex` | Generated: `py observer_hud/scripts/make-org-art.py notlynx` |
| `source/` (git-ignored) | `HIKASAMI-REGULAR.otf` (66,684 bytes) and `logo.psd` (690,684 bytes), as attached to the Discord request |
| `shots/` | Live screens, 2026-11-10 |

The Hikasami licence (in the font's name table) allows non-commercial use only and forbids passing the font on to
third parties without the licensor's written permission (design@hikasami.com). The organiser supplied it for their own
observer PCs: send the archive only to them, never publish it.

## Build and status

```powershell
powershell -ExecutionPolicy Bypass -File build_observer_hud.ps1 -Org notlynx -GamePak F:\SteamLibrary\steamapps\common\Deadlock\game\citadel\pak01_dir.vpk
```

2026-11-10, client 6860, base 0.3.1 working tree: pak10 SHA-256 `129450f4`, 53 assets; archive
`dist/Observer_HUD_notlynx_0.3.1_26.11.10.7z` (`95e977ec`, pak10 + `creepster.otf`). Installed on this PC and checked
live on demo 121685912 ([LIVE-VERIFIED.md](../../LIVE-VERIFIED.md)): Hikasami on the band, names, digits and board;
the logo in Night Desk's centre with the series either side; three bans per side in Night Desk and beside the clock in
Base Game+ Names (full teams); RESET MATCH gives `Per team` 3; the board's centre logo. 
Rebuilt the same day with the audit's bug fixes and the release cleanup ([MAP.md](../../MAP.md) changelog), and with
the organiser's second request (2026-11-10): `GAME n` reads `ИГРА n` and `FIRST TO n` reads `ДО n ПОБЕД` (`ДО 1 ПОБЕДЫ`
for a best of 1), set in `org.json` `captions`. pak10 `706fea37`, archive `3dbafa13`. Installed on this PC and seen on demo
134371706, Night Desk's right corner: `ИГРА 3` over `ДО 2 ПОБЕД` in Hikasami (`shots/live/2026-11-10-notlynx-captions-ru.png`).

Rebuilt as 0.3.2 the same day (version label only): pak10 `2aa5170d`, archive `dist/Observer_HUD_notlynx_0.3.2_26.11.10.7z`
(`fdaa5dcd`). Installed on this PC. Not sent to the organiser.
