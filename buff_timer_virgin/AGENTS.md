# AGENTS: Buff Timer Virgin (v6.0)

## OVERVIEW
Production-ready Rejuvenator and Bridge Buff tracker for Deadlock. Implements proximity-based claim detection, high-fidelity minimap glow system, CS:GO-style enemy linger indicators, and optimized overlay panel clip system. Heavily optimized for minimal CPU and memory usage.

## STRUCTURE
- `panorama/scripts/rejuvnbufftimer.js`: Main logic (~1400 lines). Timers, proximity scan, state machine, team caching.
- `panorama/layout/hud.xml`: Defines timer panels with overlay clip system (BuffOverlay, RejuvOverlay), 6 glow panels, claim indicators, and linger overlays.
- `panorama/styles/hud_timer.css`: CSS animations, overlay panel styling, and layout for countdowns.
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

### Architecture (v5.6 - Dynamic Panels)
- **Dynamic Creation**: Uses `$.CreatePanel("Label", container, qId)` with `linger-question-child` class
- **State Tracking**: `_lingerState[enemyId] = {hideHandle, btn, qLabel}`
- **Visibility**: Map button set to 0.5 opacity when lingering, dynamically created "?" label at last position

### Detection Method
- Uses `.active` class on enemy `map_button` panels to detect visibility changes
- When enemy loses `.active` class (enters fog), triggers 5-second linger
- Excludes dead players (`.playerdead` class)

### Constants
- `LINGER_DURATION = 5` (seconds)
- `LINGER_CHECK_INTERVAL = 300` (milliseconds)

### Reset Behavior
- State cleared on fresh game start (10:00 timer / phase 0)
- `clearAllLingers()` resets `_lingerState` and destroys all dynamic panels

## PERFORMANCE OPTIMIZATIONS (v5.6)

## PERFORMANCE OPTIMIZATIONS (v6.0)

### Overlay Panel Clip System
| Aspect | Before (v5.6) | After (v6.0) |
|--------|---------------|--------------|
| DOM Elements | 2 Labels per timer (4 total) | 1 Label + 1 Panel per timer (4 total) |
| Text Sync | 2 writes per tick | 1 write per tick |
| Clip Target | Label text color | Panel background-color |
| CPU Impact | Higher (text layout) | Lower (simpler render) |

**Implementation:**
- `BuffOverlay` and `RejuvOverlay` Panels with `clip: rect()`
- `background-color` for fill instead of text color
- No text synchronization on overlay panels

### Team Classification Caching
| Metric | Before | After |
|--------|--------|-------|
| BHasClass calls per player | 2-3 per iteration | 1 on first sight, 0 thereafter |
| Cache TTL | 800ms | 800ms + team field persistence |
| Estimated reduction | - | ~60-70% fewer classification calls |

**Implementation:**
- `ps.team` field in `_playerState`: 0=unknown, 1=ally, 2=enemy
- Helper functions: `isAlly(btn)`, `isEnemy(btn)`
- Cached across `checkEnemyLinger()` and `getPlayersNearPowerup()`

### Memory Cleanup
| Aspect | Before | After |
|--------|--------|-------|
| `_playerState` growth | Unbounded | Bounded by pruning |
| Pruning trigger | Only on `reset(1)` | Phase transitions + run starts |
| Linger safety | N/A | Preserves active linger entries |

**Implementation:**
- `prunePlayerState()` function removes stale entries
- Called in `startPhase()` and `startRun()`
- Checks `_lingerState` to preserve active lingers

### Early-Exit Guards
| Function | Before | After |
|----------|--------|-------|
| `updateClaimProgress()` | Runs every tick | Returns early when no claims active |
| Estimated CPU savings | - | ~99% of claim checks eliminated |

**Implementation:**
- Early return: `if (_claimStartLeft <= 0 && _claimStartRight <= 0) return;`

### Removed Dead Fallbacks (Telemetry-Verified)
| Removed | Reason |
|---------|--------|
| `actuallayoutwidth` fallback | `contentwidth` always available |
| `|| 200` hardcoded default | Never triggered |
| `style.position` string parsing | Never needed |
| `marginLeft/Top` fallback | Never needed |
| `CitadelHudTopBar` fallback | `TopBar` always found |
| `HeroImage`, `Image` fallbacks | Hero icon extraction not working |
| `GLOW_CLASSES` array | Only `GLOW_CLASS_MAP` used |
| `$.Msg` debug calls | Production cleanup |
| `LingerOverlay0-5` XML | Dynamic panels used instead |
| `.linger-overlay` CSS | `.linger-question-child` used instead |
| `_lingerLogTs` throttle | Debug logging removed |

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
- **Overlay Panel Pattern**: Use `style.backgroundColor` on overlay Panels instead of `style.color` on clip Labels.
- **Team Cache Pattern**: Store `ps.team` (0/1/2) in player state objects to avoid repeated BHasClass calls.
- **Memory Pruning**: Call `prunePlayerState()` on phase transitions to bound memory growth.

## ANTI-PATTERNS
- **Engine Hero Detection**: DO NOT attempt to read `Image.src`; it is write-only in JS sandbox.
- **Box-Shadow Glows**: Panorama ignores `box-shadow`; MUST use gradient panels.
- **Scale3d Animation**: Causes text-shadow artifacts; use `pre-transform-scale2d`.
- **clip-path in JS**: DO NOT use `style.clipPath` or `clip-path: inset()`; use `style.clip` with `rect(top%, right%, bottom%, left%)`.
- **Nested try-catch in loops**: High overhead; use single wrapper.
- **Redundant DOM writes**: Always guard with change detection.
- **Multiple fallbacks in hot path**: Measure with telemetry, remove dead branches.
- **Text on Overlay Panels**: DO NOT write `.text` on overlay Panels (they have no text property).
- **Pruning Active Linger State**: DO NOT prune `_playerState` entries that have active `_lingerState` references.

## DEBUG
Enable `-dev -tools` launch options. Console: F7.
Debug logging removed in v6.0 for production. Re-add `$.Msg` calls if needed for troubleshooting.

## BUILD
```powershell
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
```
