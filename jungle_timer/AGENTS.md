# AGENT GUIDE: jungle_timer

Project type: Source 2 Panorama UI mod.
Primary output: compiled assets in `../jungle_timer_compiled/`.
Audience: coding agents operating in this repository.

## Description
A minimal, standalone mod that displays neutral camp respawn timers (radial ring + countdown) directly on the minimap. It was stripped down from `buff_timer_virgin` to exclude Rejuvenator, Bridge Buff, claim detection, enemy linger overlays, and minimap collapsing functionalities.

## Build Command
```powershell
$repo = "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "$repo\sr2compiler\New folder.exe" "$repo\jungle_timer"
```

`build_jungle_timer.ps1` currently still has a stale hardcoded external
checkout root. Do not use it until that script is made portable; use the
explicit `$repo` commands here or fix the script first.

## Architecture Notes
- All functionality is driven by `panorama/scripts/jungle_timer.js`.
- It continuously polls the minimap using `$.Schedule` loops.
- **CSS-driven ring sweep**: The radial cooldown ring animation is offloaded to CSS transitions (`transition-property: clip` on `.neutral-cooldown-ring-fill`). JS sets the start clip (360deg) and end clip (0deg) with `transition-duration` equal to the remaining respawn time. The GPU interpolates smoothly between frames. JS no longer calculates clip values per cycle.
- **Adaptive loop rate**: The main loop runs at 1.0s by default, 0.5s when any timer has <10s remaining (responsive countdown text), and 2.0s when idle (no active timers and game time >60s). Scan and render happen in a single pass per loop iteration.
- **Caching**: `FindChildrenWithClassTraverse("map_button")` results are cached for 5s with validity spot-check. `refreshPanels()` results are cached for 2s. Minimap inversion theme info is cached for 30s. Ring panel IDs (`ringId`, `fillId`, `textId`, `anchorId`) are precomputed once in `createState()` and stored on the state object, eliminating per-call regex.
- **Minimap snapshot cadence**: neutral icon snapshots are throttled by
  `MINIMAP_SNAPSHOT_INTERVAL_MS = 400`.
- **Creation-only styling**: Redundant per-cycle style assignments (ringRoot background/border, ringFill position/size, detailLabel hittest/visibility) are set only during `CreatePanel()`, not every render.
- **No FindChildTraverse fallback**: Ensure functions go directly from `!IsValid()` → `CreatePanel()`, skipping redundant DOM traversal since `clearNeutralRing()` removes panels via `DeleteAsync(0)`.
- **Resync handling**: If game time drifts >1.5s from the CSS transition's expected position, the transition is reset: snap to current position with `transitionDuration: 0s`, then re-animate to zero with the corrected remaining time.
- The ring and countdown label are always children of the `NeutralCooldownOverlayLayer` (inside `minimap_container` / `UI.minimapBox`), never parented to icon panels.
- Ring size matches the game's neutral icon size (`NEUTRAL_RING_SIZE_PX = 24` CSS pixels).
- Active timers stay at full opacity while visible. Rings are visible in the
  final 60 seconds before respawn, and scoreboard-open renders force visibility
  so the scoreboard/minimap view can inspect timers.
- Styling should stay minimal: small ring, small monospace text, no decorative card around the label.

## Coordinate Space & DPI Scaling (Critical)
The minimap panel hierarchy has different coordinate origins:
```
minimap_container (UI.minimapBox; example 760x760 at 4K)    ← overlay parent
  └─ HudMinimapContainer (UI.minimapContainer; example offset -19,-19, 798x798)
       └─ hud_minimap (UI.minimap; example offset 0,0, 798x798)  ← icon parent
```
- Icon `actualxoffset`/`actualyoffset` is relative to `hud_minimap`, NOT `minimap_container`.
- The overlay lives in `minimap_container`, so icon positions must be translated by adding the intermediate panel offsets (`hud_minimap.actualxoffset + HudMinimapContainer.actualxoffset`).
- **Percentage-based positioning** is used (not pixels) so positions scale across resolutions (1080p, 4K, etc.).
- **DPI scaling**: at 4K (2x DPI), CSS pixel values get DPI-scaled by the engine. A `24px` CSS value renders as 48 actual pixels. `actuallayoutwidth` returns the DPI-scaled value (48). Setting `style.width = "48px"` in JS would render at 96 actual pixels (double-scaled). Always use CSS pixel constants (`NEUTRAL_RING_SIZE_PX`) for sizes, never `actuallayoutwidth`.
- When computing percentage offsets, all values in the division must be in the same unit space (all DPI-scaled or all CSS pixels). The minimap reference size (`mmW`/`mmH`) comes from `actuallayoutwidth` (DPI-scaled), so icon positions (also DPI-scaled) divide correctly. But CSS constants like `NEUTRAL_DETAIL_TEXT_WIDTH_PX` must be multiplied by `dpiScale = iconW / NEUTRAL_RING_SIZE_PX` before dividing by `mmW`.

## Rules specific to this Mod
- **Do not add** Rejuvenator, Mid Boss, or Bridge Buff logic here. This mod must remain solely focused on neutral camp respawn timers.
- Guard all panel access. `panel?.IsValid?.()` check is extremely necessary during tick rendering to prevent UI crashes if elements are destroyed or reloading.
- No player entities or claim logic are tracked. Do not introduce any `.player_icon` tracking unless directly requested.
- Keep CSS lean. Only rings and labels are necessary.
- Prefer CSS for static styling. Avoid moving visual concerns into JS unless they are true positioning or runtime state writes.

## Positioning Pitfalls (Lessons Learned)
- Rings and labels are always overlay-layer children, never parented to icon `map_button` panels (avoids inheriting game transforms like `scaleY(-1) scaleX(-1)` on inverted maps).
- **Never assume icon coordinates map 1:1 to the overlay container.** The icon's `actualxoffset` is relative to `hud_minimap`, which is nested inside `HudMinimapContainer` (offset -19,-19 at 4K). You must walk the parent chain and add offsets to translate into `minimap_container` space.
- **Never use `actuallayoutwidth` for setting CSS sizes.** It returns DPI-scaled values; setting them back via JS double-scales. Use CSS pixel constants instead.
- **VPK packing**: always use the single-file pack flag (`-s` /
  `--single-file`) to produce a single `pak98_dir.vpk`. Multi-part archives
  (`pak98_000.vpk`, etc.) can retain stale data. Delete old pak files before
  packing fresh.
- If placement looks wrong, add debug logging for all panels in the hierarchy (`hud_minimap`, `HudMinimapContainer`, `minimap_container`) to check for coordinate offsets and size mismatches.

## Deploy
```powershell
# Compile
$repo = "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "$repo\sr2compiler\New folder.exe" "$repo\jungle_timer"
# Pack (single-file, delete old first)
Remove-Item "$repo\pak98_dir.vpk" -Force -ErrorAction SilentlyContinue
& "$repo\passive_items_mod\compiler\vpkeditcli.exe" "$repo\jungle_timer_compiled" -o "$repo\pak98_dir.vpk" -s --no-progress
# Target: G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk
```
