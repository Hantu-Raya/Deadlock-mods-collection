# Deadlock Mods Collection 🔒

![Status](https://img.shields.io/badge/Status-Experimental-orange)
![Game](https://img.shields.io/badge/Game-Deadlock-red)
![Platform](https://img.shields.io/badge/Platform-Windows_&_Linux-blue)

## 📖 Introduction

Welcome to the **Deadlock Mods Collection**. This repository houses a set of custom HUD modifications and gameplay scripts for Valve's _Deadlock_.
These mods were created to experiment with the internal Panorama UI system, unlocking new ways to visualize game data like buff timers, health checking, and rank displays.

Whether you're looking to customize your own HUD or understand how Deadlock's UI works under the hood, this collection serves as a practical resource.

## Repository Structure

For current layout and cleanup conventions, see
[WORKSPACE_STRUCTURE.md](WORKSPACE_STRUCTURE.md).
Archived non-runtime metadata and one-off artifacts are kept in `_archive/`.

## 🛠️ Tech Stack

- **Valve Panorama UI**: The underlying UI framework used by Deadlock (and Dota 2/CS2).
- **JavaScript / XML / CSS**: Core technologies for layout and logic.

## ✨ Features

This collection includes several discrete modules:

### TopBar Rank Barebones (V40D TopBarPlus)

Two mutually exclusive editions replace the former combined design with a clean cutover: the V40D TopBarPlus base plus the ES5 ShowRank Barebones rank surfaces. They preserve native `GameTime`, all TopBarPlus script includes, account-ID authority, duplicate-name/account safety, bounded Escape probing, six/twelve verified-account caching, native Escape behavior, and ranks in profile, context menu, topbar, team average, and player list. They do not use the old canonical ShowRank bridge.

- **Alert edition (`topbar_rank`)** — ranks plus missing labels, portrait darkening, clock polling, notification root, and hero-icon announcements.
- **No-missing edition (`topbar_rank_no_missing`)** — rank-only; it contains none of the alert-only features.

Both editions check in 16 TopBarPlus base assets derived from the supplied `G:\v40d_top_bar_plus.zip`. Archive witnesses: ZIP SHA-256 `9610965fc621c7d2f8fa5054c79c1d31f32ef30bb93dfd2ea2475598ba6bd608`; VPK SHA-256 `986d28a49f06919d84a090e9921929075fb2b9c5a445df58de13b1e06921d10d`. Each source tree packages 22 assets: those 16 base assets, four rank layouts (profile, context menu, Escape, player list), one Barebones runtime, and one Barebones style. The topbar root and player layouts are merged replacements, not additions.

Build from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\build_topbar_rank_barebones.ps1
powershell -ExecutionPolicy Bypass -File .\build_topbar_rank_barebones_no_missing.ps1
```

The artifacts are `topbar_rank_barebones_dir.vpk` and `topbar_rank_barebones_no_missing_dir.vpk`. Either build may use `-KeepStaging`; use `-Install` only to install one edition as `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak89_dir.vpk`. Because both use `pak89_dir.vpk`, install only one at a time.

These TopBar Rank editions are separate from the standalone `showrank_barebones` editions and their release artifacts. Source/build validation verifies inputs and packages; it is not live in-game proof. Smoke-test the installed edition in Deadlock.

### ❤️ Health & Status

- **Custom Health Bars**: Modified health bars (`hp`, `self_hp`) including color-blind friendly options.

### 📊 Utility

- **Recent Purchase Tracker**: Keeps a history of items bought in the current session.
- **Buff Timer (`buff_timer_virgin`)**: Full timer edition with Bridge Buff minimap glows, claim indicators, and enemy-fog linger markers.
- **Buff Timer Minimal (`buff_timer_virgin_minimal`)**: Timers-only edition. It keeps Rejuvenator, Bridge Buff, Rift, Urn, neutral-phase, and team-chat timers without custom minimap glows, claim overlays, or enemy `?` markers.
- **Legacy Target**: Restores targeting indicators to previous styles.

## 🏗️ Building from Source

**Note**: This repository contains the raw source code. before installing, you must compile the mods.

1.  **Compile Source**: Use the **Dota 2 Workshop Tools** to compile the scripts and layout files.
2.  **Create VPK Structure**: After compiling, you need to pack the files into a VPK format or folder structure.
    - _The game requires this format to load the mods correctly._

## 🚀 How to Run

### Prerequisite: Enable Mod Loading

Before mods can work, you must tell the game to look for them.

1.  Navigate to your Deadlock installation directory:
    - Usually: `C:\Program Files (x86)\Steam\steamapps\common\Deadlock\game\citadel`
2.  Open **`gameinfo.gi`** with a text editor (Notepad, VS Code, etc.).
3.  Locate the `SearchPaths` section.
4.  Add the line `Game citadel/addons` **ABOVE** the `Game citadel` line. It should look like this:

    ```text
    SearchPaths
    {
        Game citadel/addons   <-- ADD THIS LINE
        Game citadel
        Game core
        ...
    }
    ```

5.  Save and close the file.

## 🧠 Process & Learnings

_Building this collection involved reverse-engineering the existing HUD XML layouts._

- **Challenge**: Finding the correct parent panels to attach custom elements to was trial-and-error.
- **Learning**: Learned how to hook into game events (like `OnTakeDamage` or `OnBuyItem`) using the Panorama event system.
- **Technique**: Discovered the "CSS Hijack" pattern to override game styles without modifying XML, by creating CSS files with matching names and using `@import` to load the base styles.
- **Improvement**: Future versions could use a centralized loader instead of separate folders for easier management.

## 🎥 Preview

<img width="530" height="280" alt="image" src="https://github.com/user-attachments/assets/8dae2040-129b-4af3-9c08-dde441d0ba22" />
<img width="630" height="991" alt="image" src="https://github.com/user-attachments/assets/1b4d8704-4df8-4bb2-bdcd-c0002bba9266" />
<img width="782" height="516" alt="image" src="https://github.com/user-attachments/assets/8dc2b32e-958b-4af3-9c08-dde441d0ba22" />
<img width="431" height="100" alt="image" src="https://github.com/user-attachments/assets/28a68dcc-3885-469b-92da-2798e964bfde" />
<img width="619" height="348" alt="image" src="https://github.com/user-attachments/assets/5d0c7997-43c7-4211-963c-f5c30ee91149" />

### Shiv Neon Prime Sound Example

[![Shiv Neon Prime Sound](http://img.youtube.com/vi/o2YOa693yLQ/0.jpg)](http://www.youtube.com/watch?v=o2YOa693yLQ)

## License

Unless otherwise noted, original code and original mod source in this repository are licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).

Attribution notices for this project are included in [NOTICE](NOTICE). If you distribute this software or derivative works, preserve the applicable copyright, license, and notice files as required by Apache-2.0.

### Attribution

When distributing this project or derivative works based on its original code, please preserve the included `LICENSE` and `NOTICE` files. This project was created by Hantu-Raya.

### Third-party and game materials

Deadlock, Source 2, Valve, Panorama, and related names, paths, formats, trademarks, and game assets belong to their respective owners. This project is an unofficial fan modification and is not affiliated with Valve.
