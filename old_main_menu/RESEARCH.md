# Old Main Menu: research notes

Goal: the Deadlock main menu as it was in July 2025, running on the current client (6842), with as little script as possible. It ships as pak04 and is forked from the user's recreation (`C:\Users\Administrator\Desktop\work\pak04_dir.vpk`, md5 `9f3f64b6`).

## Sources

| What | Where | Notes |
|---|---|---|
| Jul 2025 layouts, CSS, soundevents, `pak01_dir.txt` | SteamTracking/GameTracking-Deadlock `1aac1d6` (2025-07-31, ClientVersion 5712). Local clone: `E:\jundeadlock\GameTracking-Deadlock` | `dashboard.xml`/`.css` are the same from 5679 (2025-06-24) through 5723. They first changed in 5747 (2025-08-18). |
| Current client | GameTracking `fc53d8b` (6842) plus the installed `client.dll` | The validator reads the installed DLL, localization and pak01. |
| User's recreation | pak04 decompiled to `.scratch/old_main_menu/pak04_decomp` | It uses the 6842 dashboard with the old left stripe, a hand-built play list, a 205 KB heroes script (a hard-coded data table) and a 30 MB replacement music file. |
| Project8Staging | `G:\Project8Staging\game\citadel` (ClientVersion 5433, May 2024; `addons` is a "primelock" private-server pak) | Older than Jul 2025. Its `dl_v1_png.vtex_c` has the same bytes as 5712 (crc `b4dc1319`, 22643 bytes). |
| Menu movies | `game\citadel\panorama\videos\main_menu\*.webm` | Still shipped today in depot 1422451 (GameTracking 6842 manifest, same sha1 as the installed copies). The installed files date from 2025-03-29, before Jul 2025, so I'm assuming they're unchanged since then. Intro is 10.219 s, loop is 16.642 s, both VP9 1080p. They're packed anyway, because no current stock layout uses them. |
| Manifest IDs | GameTracking only tracks `manifests/` from 2026-10-04 (6745) onward. Automated access to SteamDB is blocked. | The pak01 images are in depot **1422456**; 1422452 holds `game\bin\win64` and 1422451 the loose panorama files. Build 5712 is GameTracking `1aac1d6`, 2025-07-31 17:16:09 UTC; the depot 1422452 manifest seen at 17:15:12 that day is `2088559435827575733`. The menu images are the same from 5554 through 5723, so any depot 1422456 manifest from 2025-06-24 to 2025-08-17 works. |

## What the current client removed (static check: strings in client.dll 6842 compared with client_strings 5712)

- Panel classes: `CitadelPlayMenu`, `CitadelAnnouncementList`, `CitadelHeroPage`, `CitadelHeroDetailsPage`, `DBPlayerList`.
- Events: `CitadelPlayMenuMatchmaking/BotMatchPopup/HeroTesting/CustomMatchPopup/HeroLab`, `CitadelExploreMap`, `CitadelShowRosterConfirmPage`, `CitadelToggleViewAnnouncements`, `CitadelShowLatestPatchNotes`, `CitadelPartyClearMode`. The primary tab `TopBarHeroes` is gone too; only `TopBarHome` remains.
- Engine behaviour: nothing clears `introMovieActive` or starts the loop movie any more, and `Music.MainMenu` is no longer played by client.dll. The event is still defined in `music.vsndevts` and `music_menu_lp.vsnd_c` still ships.
- Images: the seven `menu_images/menu_play_*_psd` cards, `dl_v1_png` and `news_shop_rework_png` are not in pak01 any more. The menu icons are still there.
- Text: some tokens kept their key but have new wording (`menu_play_normal` "Play Deadlock" became "Deadlock", `menu_sandbox` "Hero Testing" became "Sandbox Mode", `menu_explore_map` "Explore Map" became "Explore NYC", `menu_botmatchmaking` "Play Bot Match" became "Bot Match"), and `menu_roster_detail2` was removed. For those labels the mod writes the Jul 2025 English text directly, so they are English-only.
- The current client runs a party hideout (`connectedToHideout`). The dashboard only shows over it when the home page is open. Solo players get the dashboard as before. In console.log, the hideout lobby stays `Invalid`.

## How each Jul 2025 piece is rebuilt

| Jul 2025 | Current replacement |
|---|---|
| `dashboard.xml`: left stripe, logo, menu, footer, friends, survey | The 5712 layout. It adds the current `lobbyleave` button (hidden unless needed) and the achievement toast snippet, and drops the announcements list and its toggle. Patch Notes opens `CitadelShowNewsPage()` and Edit Roster opens `CitadelEditMatchmakingRoster()`. These are kept from the forked pak04: the profile avatar button, the party panel (`CitadelParty`, top right), the new-player panel and the queued-hero scene. |
| `dashboard.css` | Built from 5712 by `tools/derive_from_5712.py`. Each named, asserted patch adds the hideout rule, the tutorial class rename, the lobbyleave rules, the seasonal tooltip id and the glyph precache, and lets pages open in the hideout. |
| Intro and loop movies; engine cleared `introMovieActive` | `old_main_menu.js` sets both movies with `SetMovie`. The resource compiler rejects `file://` webm references, which matches `observer_hud/ENGINE.md`. The script adds `introMovieActive` and clears it when `MoviePlayerPlaybackEnded` fires, with a 10.5 s fallback. Both webm files are packed. |
| `Music.MainMenu` played by the engine | `old_main_menu.js` plays it with `PlayUISoundEvent` and stops it while `connectedToGame`. The stock event and sound are used, so no 30 MB replacement is needed. |
| Play menu: `<CitadelPlayMenu id="PlayMenu"/>` on the dashboard, sliding in over the left stripe on `.showPlayMenu` | The 5712 `citadel_db_play_menu.xml` cards are inlined into `dashboard.xml` as `Panel#PlayMenu`. `CitadelNavigateToPlayPage` still sets `.showPlayMenu` (the forked pak04 relied on this live), and Esc or starting a mode calls `CitadelClosePlayPage`. Play Deadlock runs `CitadelStartUnrankedMatch`. Play Bot Match (co-op) runs `CitadelStartBotMatch(false, Normal, Easy)`. Bot practice opens the stock private-bots popup with `CitadelShowBotMatchPopup()`; that popup is still the Jul 2025 one, with Street Brawl added. Hero Testing runs `CitadelStartHeroTesting(false)`, Explore Map `CitadelStartExploreMap` and Custom Match `CitadelStartCustomMatch`. Hero Labs is locked with no action. Ranked and Street Brawl are an extra row; `-Strict` builds leave them out. The CSS is 5712's `citadel_db_play_menu.css`, derived. The stock play page is left alone. |
| Home page | The 5712 home page without the queue roster ScenePanel (the forked pak04's dashboard hero scene stands in) and without `DBPlayerList` (replaced by the dashboard party panel). The news card stays hidden until `news_shop_rework_png` is recovered. |
| Heroes page and hero details page | The forked pak04's Heroes page as-is: the layout, both scripts, `citadel_db_page_heroes.css`, and the global `citadel_hero_card.css` / `citadel_hero_grid.css` overrides. The dashboard script provides its two hooks: `RestoreMenu_OpenHeroes(showAll)` (right-click or Shift+click lists every hero) and picking the hero after Hero Sandbox loads. Training is the forked pak04's page (no shop card). |

Script budget (checked by the validator, per file): the dashboard script is 4.6 KB and replaces `dashboard_restoremenu.js`; the 30 MB replacement music is gone. The Heroes page scripts are unchanged at 205 KB, and 162 KB of that is the `g_HeroesPageAbilityData` table, a snapshot of abilities.vdata. Removing it means switching the ability hover to the engine's ability tooltip, which has to be checked live first.

## Old images still missing

The build looks for each image in `assets.json` → `imageSources`. The first source is `E:\jundeadlock\depot_1422456_*` (a Jul 2025 depot download made with `E:\jundeadlock\get_jul2025_menu_assets.ps1`). A file is only used if it matches the 5712 crc and size. If it isn't found, the CSS points at current art and the build prints `NOW`, or the news card is hidden and the build prints `HIDE`. To fill these in, get a depot 1422456 manifest dated 2025-07-31 to 2025-08-17, run the download script (it asks for the Steam login itself), then rebuild.

## Not verified yet

These need a live client:

- `CitadelShowBotMatchPopup()` with no arguments opens the private-bots popup.
- The Jul 2025 card menu lays out inside the dashboard: its CSS was written for the old `CitadelPlayMenu` panel.
- XML `onactivate="RestoreMenu_OpenHeroes()"` reaches a function the IIFE script assigns to `globalThis`. The forked pak04 declared it at top level instead.
- `MoviePlayerPlaybackEnded` fires.
- `PlayUISoundEvent` / `StopUISoundEvent` behave as globals.
- Movies load from inside the VPK. This machine also has the loose copies, so a local run can't tell the two apart.
