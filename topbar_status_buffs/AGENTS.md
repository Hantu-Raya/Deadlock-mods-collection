# Project Overview

Standalone topbar status-buff mod. Do not edit HP Colors or Topbar Rank source from this module; they are reference-only templates.

# Architecture

- HP-bar publisher layout/script owns `unit_status_overlay.xml`, reads `CitadelStatusEffect#StatusEffects`, publishes compact status snapshots, and starts a 160s (`2:40`) timer when a bridge pickup class appears.
- Shared state lives at `GameUI.CustomUIConfig().__topbarStatusBuffs` and updates are mirrored on `ClientUI_FireOutput` with `TOPBAR_STATUS_BUFFS_UPDATE`.
- Topbar consumer layout/script owns `citadel_hud_top_bar_player.xml`, matches records by normalized player name then hero name, and toggles fixed icon/timer slots.
- CSS imports stock `citadel_hud_top_bar.css`; custom CSS only presents the fixed icon/timer slots.

# Build

```powershell
node topbar_status_buffs\scripts\validate-topbar-status-buffs.js
powershell -ExecutionPolicy Bypass -File topbar_status_buffs\scripts\build-topbar-status-buffs.ps1
```

# Runtime Rules

- Read HP-bar status classes shallowly from `#StatusEffects` and its immediate children only.
- Use `GameUI.CustomUIConfig().__topbarStatusBuffs` as the shared snapshot store.
- Render fixed topbar icon/timer slots with class toggles and guarded label writes only.
- No network, rank API, broad tree scans, frame polling, repeated image writes, or runtime dependency on HP Colors/Topbar Rank.

# QA

Validate, compile, pack `pak89_dir.vpk`, deploy to Deadlock addons, then manually check in game that bridge pickup classes publish masks, matching topbar icons show `2:40` countdowns, clear on status removal, and produce no VConsole errors. Use `$.TopbarStatusBuffsDebugDump()` in Panorama debugger to inspect the shared store.
