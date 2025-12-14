# Deadlock Mods Collection 🔒

![Status](https://img.shields.io/badge/Status-Experimental-orange)
![Game](https://img.shields.io/badge/Game-Deadlock-red)
![Platform](https://img.shields.io/badge/Platform-Windows-blue)

## 📖 Introduction
Welcome to the **Deadlock Mods Collection**. This repository houses a set of custom HUD modifications and gameplay scripts for Valve's *Deadlock*. 
These mods were created to experiment with the internal Panorama UI system, unlocking new ways to visualize game data like buff timers, health checking, and rank displays.

Whether you're looking to customize your own HUD or understand how Deadlock's UI works under the hood, this collection serves as a practical resource.

## 🛠️ Tech Stack
- **Valve Panorama UI**: The underlying UI framework used by Deadlock (and Dota 2/CS2).
- **JavaScript / XML / CSS**: Core technologies for layout and logic.
- **VScript (Lua)**: Server-side logic integration (where applicable).

## ✨ Features
This collection includes several discrete modules:

### 🎮 HUD Enhancements
- **Buff Timer (Top Bar)**: Moves active buff timers to the top bar for better visibility during combat.
- **Radar Tweaks**: Custom modifications to the minimap/radar for clarity.
- **Rank Display (`showrank`)**: A widget to display MMR or rank badges in-game.
- **Unlock Progress**: Visualizes the progression of unlocks directly on the HUD.

### ❤️ Health & Status
- **Custom Health Bars**: Modified health bars (`hp`, `self_hp`) including color-blind friendly options.
- **Soma Passive**: Dedicated indicator for Soma's passive ability state.

### 📊 Utility
- **Recent Purchase Tracker**: Keeps a history of items bought in the current session.
- **Legacy Target**: Restores targeting indicators to previous styles.

## 🚀 How to Run
1. **Locate Game Directory**: Navigate to your Deadlock game installation (e.g., `steamapps\common\Deadlock\game\citadel\addons`).
2. **Copy Modules**: Copy the folder of the mod you want (e.g., `buff_timer_top_bar`) into the `addons` directory.
3. **Launch Game**: Run Deadlock. The scripts should load automatically or require a console command (e.g., `reload_mods`) depending on the mod type.

> [!NOTE]
> Ensure you have `cl_panorama_script_debug_mode` enabled if you are developing or testing actively.

## 🧠 Process & Learnings
*Building this collection involved reverse-engineering the existing HUD XML layouts.*

- **Challenge**: Finding the correct parent panels to attach custom elements to was trial-and-error.
- **Learning**: Learned how to hook into game events (like `OnTakeDamage` or `OnBuyItem`) using the Panorama event system.
- **Improvement**: Future versions could use a centralized loader instead of separate folders for easier management.

## 🎥 Preview
<!-- Insert a GIF or Screenshot of the mods in action here -->
> *[Place a screenshot of your custom HUD here]*

---
*Disclaimer: This project is a fan modification and is not affiliated with Valve Software.*
