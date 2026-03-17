# AGENT GUIDE: jungle_timer

Project type: Source 2 Panorama UI mod.
Primary output: compiled assets in `../jungle_timer_compiled/`.
Audience: coding agents operating in this repository.

## Description
A minimal, standalone mod that displays neutral camp respawn timers (radial ring + countdown) directly on the minimap. It was stripped down from `buff_timer_virgin` to exclude Rejuvenator, Bridge Buff, claim detection, enemy linger overlays, and minimap collapsing functionalities.

## Build Command
```powershell
& 'F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe' 'F:\Users\Shiv\Desktop\Deadlock-mods-collection\jungle_timer'
```

## Architecture Notes
- All functionality is driven by `panorama/scripts/jungle_timer.js`.
- It continuously polls the `HudMinimapContainer` using `$.Schedule` loops.
- `NEUTRAL_SCAN_INTERVAL_MS` (500ms): determines how often we read the minimap to check for camp death/respawn via class inspection (e.g., `.neutral_weak.spawned`).
- `NEUTRAL_RENDER_INTERVAL_MS` (250ms): determines how often we redraw the cooldown rings using css `clip` properties based on system time `gTime()`.

## Rules specific to this Mod
- **Do not add** Rejuvenator, Mid Boss, or Bridge Buff logic here. This mod must remain solely focused on neutral camp respawn timers.
- Guard all panel access. `panel?.IsValid?.()` check is extremely necessary during tick rendering to prevent UI crashes if elements are destroyed or reloading.
- No player entities or claim logic are tracked. Do not introduce any `.player_icon` tracking unless directly requested.
- Keep CSS lean. Only rings and labels are necessary.
