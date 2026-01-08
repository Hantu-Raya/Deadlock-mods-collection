# COMBINED TIMER MOD (Shiv Version)

**Generated:** 2026-01-08
**Components:** `soul_timer` (v4.1) + `buff_timer_virgin`

## OVERVIEW
This mod combines two HUD enhancements into a single package:
1.  **Soul Timer**: An optimized, jitter-free countdown for unsecured soul drainage, positioned above the soul counter.
2.  **Buff/Rejuv Timer**: Tracks Rejuvenator spawn times, buffs, and cooldowns near the minimap/datafeed area.

## FEATURES

### Soul Timer (v4.1 Optimized)
- **Smooth Countdown**: Uses delta-time interpolation for perfectly smooth 60frame_rate updates.
- **Performance**: O(1) drain calculation and split-loop architecture (10Hz render / 0.5Hz logic).
- **Smart Visibility**: Auto-hides when 0 souls or in menus.
- **Color Coding**: White (<500), Yellow (500-1000), Red (>1000).

### Buff Timer
- **Phase Tracking**: Tracks Initial -> Buff -> Cooldown cycles for Rejuvenator.
- **Visuals**: Animated icons (rotate/pulse) on phase changes.
- **Minimap Integration**: Positioned near the minimap for easy glancing.

## STRUCTURE
- `panorama/layout/hud.xml`: Main entry point. Includes both scripts and styles.
- `panorama/layout/hud_gold_and_ap_container.xml`: Defines the Soul Timer overlay.
- `panorama/scripts/soul_timer.js`: Optimized soul timer logic.
- `panorama/scripts/rejuvnbufftimer.js`: Buff timer logic.
- `panorama/styles/`: Contains styles for both components.

## INSTALLATION
1.  Compile using Dota 2 Workshop Tools.
2.  Ensure `gameinfo.gi` includes `Game citadel/addons`.
