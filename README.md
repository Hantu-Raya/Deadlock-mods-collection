# Deadlock Mods Collection 🔒

![Status](https://img.shields.io/badge/Status-Experimental-orange)
![Game](https://img.shields.io/badge/Game-Deadlock-red)
![Platform](https://img.shields.io/badge/Platform-Windows_&_Linux-blue)

## 📖 Introduction

Welcome to the **Deadlock Mods Collection**. This repository houses a set of custom HUD modifications and gameplay scripts for Valve's _Deadlock_.
These mods were created to experiment with the internal Panorama UI system, unlocking new ways to visualize game data like buff timers, health checking, and rank displays.

Whether you're looking to customize your own HUD or understand how Deadlock's UI works under the hood, this collection serves as a practical resource.

## 🛠️ Tech Stack

- **Valve Panorama UI**: The underlying UI framework used by Deadlock (and Dota 2/CS2).
- **JavaScript / XML / CSS**: Core technologies for layout and logic.

## ✨ Features

This collection includes several discrete modules:

### 🎮 HUD Enhancements

- **Buff Timer (Top Bar)**: Moves active buff timers to the top bar for better visibility during combat.
- **Radar Tweaks**: Custom modifications to the minimap/radar for clarity.
- **Rank Display (`showrank`)**: A widget to display MMR or rank badges in-game.

### ❤️ Health & Status

- **Custom Health Bars**: Modified health bars (`hp`, `self_hp`) including color-blind friendly options.

### 📊 Utility

- **Recent Purchase Tracker**: Keeps a history of items bought in the current session.
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
- **Improvement**: Future versions could use a centralized loader instead of separate folders for easier management.

## 🎥 Preview

<img width="530" height="280" alt="image" src="https://github.com/user-attachments/assets/8dae2040-129b-4af3-9c08-dde441d0ba22" />
<img width="630" height="991" alt="image" src="https://github.com/user-attachments/assets/1b4d8704-4df8-4bb2-bdcd-c0002bba9266" />
<img width="782" height="516" alt="image" src="https://github.com/user-attachments/assets/5dc2b32e-958b-4e45-ae1c-ec144408def2" />
<img width="431" height="100" alt="image" src="https://github.com/user-attachments/assets/28a68dcc-3885-469b-92da-2798e964bfde" />
<img width="619" height="348" alt="image" src="https://github.com/user-attachments/assets/5d0c7997-43c7-4211-963c-f5c30ee91149" />

**Shiv Neon Prime Sound**
[![Alt text for screen readers](http://img.youtube.com/vi/o2YOa693yLQ/0.jpg)](http://www.youtube.com/watch?v=o2YOa693yLQ)

---

_Disclaimer: This project is a fan modification and is not affiliated with Valve Software._
