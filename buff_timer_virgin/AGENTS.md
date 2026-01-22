# AGENTS: Buff Timer Virgin (v5.5)

## OVERVIEW
Production-ready Rejuvenator and Bridge Buff tracker for Deadlock. Implements proximity-based claim detection, high-fidelity minimap glow system, and CS:GO-style enemy linger indicators. Heavily optimized for minimal CPU usage.

## STRUCTURE
- `panorama/scripts/rejuvnbufftimer.js`: Main logic (569 lines). Timers, proximity scan, state machine.
- `panorama/layout/hud.xml`: Defines 6 dedicated glow overlay panels, claim indicators, and linger overlays.
- `panorama/styles/hud_timer.css`: CSS animations and layout for countdowns.
- `panorama/styles/buff_claim.css`: Glow effects, claim indicators, linger styling.

## LOGIC
### Proximity-Based Claim Detection
Since Panorama JS cannot read hero identity from image paths, claim detection relies on:
1. **Pre-tracking**: Starts 10s before spawn using `knownSpawnPos` cache. (1000ms polling)
2. **Proximity Scan**: Squared distance calculation (`CLAIM_RADIUS_SQ: 64`) between players and powerup panels. Uses `distSq()` instead of `Math.sqrt()`.
3. **Hybrid Dead Player Handling**: 2s grace period + position change detection allows recently killed players to count for claims.
4. **Object Pooling**: Reuses player state objects to eliminate GC pressure during monitoring.

### LEFT/RIGHT Glow Assignment
- Powerups sorted by X coordinate: `powerups.sort((a,b)=>a.x-b.x)`
- Lower X = LEFT, Higher X = RIGHT
- Debug logging available: `[DBG] Powerups sorted:` shows coordinates

### Visual Feedback
- **6-Panel Glow**: Curved gradient overlays simulate minimap area illumination.
- **Claim Indicators**: Sidebar boxes showing powerup type + team color border (cyan=ally, red=enemy).

## ENEMY LINGER FEATURE (v5.4+)
CS:GO-style "last seen" indicator for enemies who enter fog-of-war.

### Architecture (v5.5 - 1:1 Slot Pairing)
- **6 Overlay Panels**: Pre-defined `LingerOverlay0` through `LingerOverlay5` in `hud.xml`
- **1:1 Slot Assignment**: Each enemy gets dedicated slot via `_enemySlots{}` and `_slotUsed[6]`
- **State Tracking**: `_lingerState[enemyId] = {slotIdx, hideHandle, btn, heroSrc}`
- **Visibility**: Map button set to 0.5 opacity when lingering, overlay shows "?" at last position

### Detection Method
- Uses `.active` class on enemy `map_button` panels to detect visibility changes
- When enemy loses `.active` class (enters fog), triggers 5-second linger
- Excludes dead players (`.playerdead` class)

### Constants
- `LINGER_DURATION = 5` (seconds)
- `LINGER_CHECK_INTERVAL = 300` (milliseconds)

### Reset Behavior
- Slots cleared on fresh game start (10:00 timer / phase 0)
- `clearAllLingers()` resets `_enemySlots`, `_slotUsed`, and all overlay panels

## PERFORMANCE OPTIMIZATIONS (v5.5)

### Removed Dead Fallbacks (Telemetry-Verified)
| Removed | Reason |
|---------|--------|
| `actuallayoutwidth` fallback | `contentwidth` always available |
| `|| 200` hardcoded default | Never triggered |
| `style.position` string parsing | Never needed |
| `marginLeft/Top` fallback | Never needed |
| `CitadelHudTopBar` fallback | `TopBar` always found |
| `HeroImage`, `Image` fallbacks | Hero icon extraction not working |

### Retained Safety Patterns
| Pattern | Location | Reason |
|---------|----------|--------|
| `?? true` for `wasActive` | checkEnemyLinger | Init safety for new players |
| `?.IsValid?.()` | All panel access | Panorama panel deletion safety |
| `try-catch` wrappers | getPanelPos, showLinger | Error isolation |

### Polling Intervals
| State | Interval | Purpose |
|-------|----------|---------|
| Active countdown | 0.1s | Precise timing near spawn |
| Idle countdown | 1.0s | CPU-efficient waiting |
| Not running | 30s | Minimal hideout overhead |
| Button cache TTL | 800ms | Reduce DOM traversal |
| Time cache TTL | 200ms | Reduce string parsing |
| Pretrack interval | 1000ms | Balanced accuracy |

### CSS Optimizations
- `transition-property: opacity` instead of `width,height` (no layout reflows)
- `.linger-hidden` class for visibility control

## CONVENTIONS
- **Adaptive Polling**: 0.1s during active monitoring, 1.0s during idle countdown.
- **TTL Caching**: `_playerCache` (800ms) and `_tCache` (200ms) prevent DOM bottleneck.
- **DOM Write Guards**: All `.text` assignments wrapped with change detection.
- **Timestamp Passthrough**: `Date.now()` captured once per tick, passed to subfunctions.
- **Inlined Class Checks**: `panelHas()` uses direct `BHasClass()` calls, no array iteration.

## ANTI-PATTERNS
- **Engine Hero Detection**: DO NOT attempt to read `Image.src`; it is write-only in JS sandbox.
- **Box-Shadow Glows**: Panorama ignores `box-shadow`; MUST use gradient panels.
- **Scale3d Animation**: Causes text-shadow artifacts; use `pre-transform-scale2d`.
- **Nested try-catch in loops**: High overhead; use single wrapper.
- **Redundant DOM writes**: Always guard with change detection.
- **Multiple fallbacks in hot path**: Measure with telemetry, remove dead branches.

## DEBUG
Enable `-dev -tools` launch options. Console: F7.

| Tag | Module |
|-----|--------|
| `[BT-P]` | Buff Timer Position |
| `[DBG]` | Debug output (powerup sorting) |
| `[ERR]` | Exception |

## BUILD
```powershell
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
```
