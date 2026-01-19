# AGENTS: Buff Timer Virgin (v5.3)

## OVERVIEW
Production-ready Rejuvenator and Bridge Buff tracker for Deadlock. Implements proximity-based claim detection and a high-fidelity minimap glow system. Optimized for low CPU usage in v5.3.

## STRUCTURE
- `panorama/scripts/rejuvnbufftimer.js`: Main logic. Timers, proximity scan, state machine.
- `panorama/layout/hud.xml`: Defines 6 dedicated glow overlay panels and claim indicators.
- `panorama/styles/hud_timer.css`: CSS-based animations and layout for countdowns.

## LOGIC
### Proximity-Based Claim Detection (v4)
Since Panorama JS cannot read hero identity from image paths, claim detection relies on:
1. **Pre-tracking**: Starts 10s before spawn using `knownSpawnPos` cache. (Optimized to 750ms polling)
2. **Proximity Scan**: Squared distance calculation (`CLAIM_RADIUS_SQ: 64`) between players and powerup panels. Uses `distSq()` instead of `Math.sqrt()`.
3. **Hybrid Dead Player Handling**: 2s grace period + position change detection allows recently killed players to count for claims.
4. **Object Pooling**: Reuses player state objects to eliminate GC pressure during monitoring.

### Visual Feedback
- **6-Panel Glow**: Curved gradient overlays simulate minimap area illumination.
- **Claim Indicators**: Sidebar boxes showing powerup type + team color border (cyan=ally, red=enemy).

## CONVENTIONS
- **Adaptive Polling**: 0.1s during active monitoring, 1.0s during idle countdown.
- **TTL Caching**: `_playerCache` (400ms) and `_tCache` (200ms) prevent DOM bottleneck.
- **DOM Write Guards**: All `.text` assignments wrapped with change detection to prevent redundant layout recalc.
- **Timestamp Passthrough**: `Date.now()` captured once per tick, passed to subfunctions.

## v5.3 OPTIMIZATIONS
- Removed dead code: `CLAIM_DISPLAY_DUR`, `claimerBtn` parameter, `closestAllyBtn`/`closestEnemyBtn` tracking
- Replaced `Math.sqrt()` with squared distance comparison (`distSq()` + `CLAIM_RADIUS_SQ`)
- Added DOM write guards for all timer text updates (`_lastRejuvText`, `_lastBuffText`, etc.)
- Cached `Date.now()` per tick and passed to `doPretrack()`, `monitorPowerups()`, `getPlayersNearPowerup()`
- Optimized `panelHas()` with single try-catch wrapper instead of nested try-catch in loops

## ANTI-PATTERNS
- **Engine Hero Detection**: DO NOT attempt to read `Image.src`; it is write-only in the JS sandbox.
- **Box-Shadow Glows**: Panorama ignores `box-shadow`; MUST use gradient panels.
- **Scale3d Animation**: Causes text-shadow artifacts; use `pre-transform-scale2d`.
- **Nested try-catch in loops**: High overhead; use single wrapper.
- **Redundant DOM writes**: Always guard with change detection.

