# Deadlock Mods Collection

![Game](https://img.shields.io/badge/Game-Deadlock-red)
![Platform](https://img.shields.io/badge/Platform-Windows-blue)
![License](https://img.shields.io/badge/License-Apache_2.0-green)

Source for my Deadlock UI mods. Each mod is a folder of Panorama layouts, scripts and styles that compiles into one `pakNN_dir.vpk` for the game's `addons` folder.

Most players should download the released builds from GameBanana instead of building from source.

## Showcase

### HP Colors v3

Restyle Deadlock's health bars from the Escape menu: colors per side, shield bar, HP number, markers, timers, presets and share codes. [Download on GameBanana](https://gamebanana.com/mods/603113).

<img src=".github/readme/hp-colors-1.jpg" width="49%" alt="HP Colors v3: bar styles and the Escape menu editor" /> <img src=".github/readme/hp-colors-2.jpg" width="49%" alt="HP Colors v3: the separate shield bar" />
<img src=".github/readme/hp-colors-3.jpg" width="49%" alt="HP Colors v3: markers on the bar" /> <img src=".github/readme/hp-colors-4.jpg" width="49%" alt="HP Colors v3: settings that follow your ability tiers" />

### Observer HUD

A spectator HUD for community tournaments: two top bar looks, team names, logos, series score, bans and a private-lobby setup page. [Download on GameBanana](https://gamebanana.com/mods/731315).

<img src=".github/readme/observer-hud-1.jpg" width="49%" alt="Observer HUD: match setup from the private lobby" /> <img src=".github/readme/observer-hud-2.jpg" width="49%" alt="Observer HUD: custom top bars for leagues" />

### Detailed Postgame

A stats board on the post-game scoreboard: exact numbers per player, souls by source, final items and graphs.

<img src=".github/readme/detailed-postgame.jpg" width="70%" alt="Detailed Postgame scoreboard" />

### Buff Timer

Customize the minimap: rift and urn timers, mid boss timer, enemy markers and buff colors, with a settings panel at the bottom right.

<img src=".github/readme/buff-timer.png" width="530" alt="Buff Timer: minimap timers and settings panel" />

### Passive Items and Actives Icons

Always shows passive items and active icons on the HUD. [Download on GameBanana](https://gamebanana.com/mods/601444).

<img width="530" height="280" alt="Passive Items and Actives Icons" src="https://github.com/user-attachments/assets/8dae2040-129b-4af3-9c08-dde441d0ba22" />

## Mods

### Maintained

| Mod | Folder | What it does |
|---|---|---|
| HP Colors v3 | [`hp_colors_rewrite_v3`](hp_colors_rewrite_v3) | Health bar editor. Variants for QOLLOCK ([`_qollock`](hp_colors_rewrite_v3_qollock)) and ShowRank ([`_showrank`](hp_colors_rewrite_v3_showrank)). |
| Observer HUD | [`observer_hud`](observer_hud) | Tournament spectator HUD with an Escape-menu editor and lobby setup. |
| DLF Observer | [`dlf`](dlf) | Spectator HUD and broadcast banner for the DLF league. |
| Detailed Postgame | [`detailed_postgame`](detailed_postgame) | Post-game stats board. |
| Buff Timer | [`buff_timer_virgin`](buff_timer_virgin) | Minimap timers (rift, urn, mid boss), enemy markers and buff colors, with a settings panel. |
| ShowRank Barebones | [`showrank_barebones`](showrank_barebones) | Predicted rank on profile cards, the top bar and Escape player rows. |
| Show Rank Merger | [`Show-rank-merger`](Show-rank-merger) | Browser app that merges two GameBanana downloads into one VPK. |
| Feeder Feed | [`feeder_feed`](feeder_feed) | A tab in the damage report that ranks who fed souls to the other team. |
| Mercurial Magnum Notifier | [`mercurial_magnum_notifier`](mercurial_magnum_notifier) | Item-state indicators beside the ammo count. |
| Passive Items and Actives Icons | [`abilities`](abilities) | Always shows passive items and active icons ([GameBanana](https://gamebanana.com/mods/601444)). |
| Old Main Menu | [`old_main_menu`](old_main_menu) | The July 2025 main menu on the current client. |
| Profile Stats | [`profile_stats_community`](profile_stats_community) | Community stats on the profile page. |
| FPS configs | [`fps`](fps) | FPS optimization configs and the benchmarks behind them. |

### Deprecated

These have not been updated for months and may not work on the current game build. The source stays here for reference.

| Mod | Folder | Last change |
|---|---|---|
| HP Colors v2 and v1 | `hp_colors_rewrite_v2*`, `hp_colors_rewrite`, `hp_colors*` | Oct 2026 (replaced by v3) |
| Recent Purchase | `recent_purchase` | Oct 2026 |
| Soul Timer, Jungle Timer, Combined Timer | `soul_timer`, `jungle_timer`, `combined_timer_v2` | Aug 2026 |
| Better Map, old color blind | `bettermapmod`, `old_color_blind` | Aug 2026 |
| Self HP, Shiv sound | `self_hp`, `hp`, `shiv` | May 2026 |
| Early experiments | `radar`, `event*`, `apis`, `api_test`, `obj_damage_top_bar`, `post`, `legacytarget` | Jan 2026 or earlier |

<details>
<summary>Old screenshots (deprecated mods)</summary>

**Recent Purchase (deprecated)**

<img width="315" alt="Recent Purchase (deprecated)" src="https://github.com/user-attachments/assets/1b4d8704-4df8-4bb2-bdcd-c0002bba9266" />

**Soul Timer (deprecated)**

<img width="431" alt="Soul Timer (deprecated)" src="https://github.com/user-attachments/assets/28a68dcc-3885-469b-92da-2798e964bfde" />

**Self HP (deprecated)**

<img width="619" alt="Self HP (deprecated)" src="https://github.com/user-attachments/assets/5d0c7997-43c7-4211-963c-f5c30ee91149" />

**Shiv Neon Prime sound (deprecated)**

[![Shiv Neon Prime Sound](http://img.youtube.com/vi/o2YOa693yLQ/0.jpg)](http://www.youtube.com/watch?v=o2YOa693yLQ)

</details>

## Install

1. Open your Deadlock folder, usually `C:\Program Files (x86)\Steam\steamapps\common\Deadlock\game\citadel`.
2. Open `gameinfo.gi` in a text editor and find `SearchPaths`.
3. Add `Game citadel/addons` above the `Game citadel` line:

    ```text
    SearchPaths
    {
        Game citadel/addons
        Game citadel
        Game core
        ...
    }
    ```

4. Put the mod's `pakNN_dir.vpk` in `game\citadel\addons` (create the folder if it is missing) and restart the game.

## Build from source

The repository holds raw source; the game loads compiled files only.

- **HP Colors v3:** needs Node.js. Run `node hp_colors_rewrite_v3/tools/doctor.js` to check the toolchain, then `node hp_colors_rewrite_v3/tools/build.js --project v3|qollock|showrank|all --skip-deploy`. See [`hp_colors_rewrite_v3/AGENTS.md`](hp_colors_rewrite_v3/AGENTS.md).
- **Other mods:** run the matching `build_<mod>.ps1` in the repository root. Each mod's `AGENTS.md` lists its checks.

Builds never write to the game folder; copy the resulting VPK yourself.

## License

Unless otherwise noted, original code and original mod source in this repository are licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).

Attribution notices for this project are included in [NOTICE](NOTICE). If you distribute this software or derivative works, preserve the applicable copyright, license, and notice files as required by Apache-2.0. This project was created by Hantu-Raya.

### Third-party and game materials

Deadlock, Source 2, Valve, Panorama, and related names, paths, formats, trademarks, and game assets belong to their respective owners. This project is an unofficial fan modification and is not affiliated with Valve.
