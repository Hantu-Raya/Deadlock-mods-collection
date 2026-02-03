# Buff Timer v6.0 Optimization Learnings

## Project Context
- Optimizing buff_timer_virgin v5.6 → v6.0
- Goal: Low CPU/memory usage with overlay panel clip system
- Replacing dual-label clip with single-text + overlay panel approach

## Key Files
- `buff_timer_virgin/panorama/layout/hud.xml` - Timer panel structure (lines 193-210)
- `buff_timer_virgin/panorama/styles/hud_timer.css` - Timer styling (lines 137-189)
- `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js` - Main logic (~1380 lines)
- `buff_timer_virgin/panorama/styles/buff_claim.css` - Glow effects (DO NOT MODIFY)

## Current Panel Structure (v5.6)
```xml
<Panel id="BuffTimeWrapper" class="timer-wrapper">
  <Label id="BuffTime" text="0:00" />
  <Label id="BuffTimeClip" text="0:00" hittest="false" />
</Panel>
```

## Target Panel Structure (v6.0)
```xml
<Panel id="BuffTimeWrapper" class="timer-wrapper">
  <Label id="BuffTime" text="0:00" />
  <Panel id="BuffOverlay" class="timer-overlay" hittest="false" />
</Panel>
```

## CSS Conventions (from AGENTS.md)
- Use `clip: rect(top%, right%, bottom%, left%)` NOT `clip-path: inset()`
- Use `overflow: noclip;` for glows/shadows
- Use `visibility: collapse;` NOT `display: none`
- Use `pre-transform-scale2d` for animations (avoids blur)
- z-index: 99999+ for HUD overlays

## Anti-Patterns (DO NOT USE)
- `clip-path: inset()` - doesn't work in Panorama
- `display: none` - use `visibility: collapse`
- `transform: scale3d` + shadow - causes artifacts
- `FindChildTraverse` in loops - cache at boot

## Build Command
```powershell
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
```
## Documentation Updates (v6.0)
- Updated AGENTS.md to document overlay panel clip system, team caching, and memory pruning.
- Documented the shift from dual-label clip system to single-label + overlay panel.
- Added performance optimization metrics for v6.0 changes.
