# AGENTS: Buff Timer Virgin (v5.1)

## OVERVIEW
Production-ready Rejuvenator and Bridge Buff tracker for Deadlock. Implements proximity-based claim detection and a high-fidelity minimap glow system.

## STRUCTURE
- `panorama/scripts/rejuvnbufftimer.js`: Main logic (428 lines). Timers, proximity scan, state machine.
- `panorama/layout/hud.xml`: Defines 6 dedicated glow overlay panels and claim indicators.
- `panorama/styles/hud_timer.css`: CSS-based animations and layout for countdowns.

## LOGIC
### Proximity-Based Claim Detection (v3)
Since Panorama JS cannot read hero identity from image paths, claim detection relies on:
1. **Pre-tracking**: Starts 10s before spawn using `knownSpawnPos` cache.
2. **Proximity Scan**: Euclidean distance calculation (`CLAIM_RADIUS: 8`) between players and powerup panels.
3. **Hybrid Dead Player Handling**: 2s grace period + position change detection allows recently killed players to count for claims.

### Visual Feedback
- **6-Panel Glow**: Curved gradient overlays simulate minimap area illumination.
- **Claim Indicators**: Sidebar boxes showing powerup type + team color border (cyan=ally, red=enemy).

## CONVENTIONS
- **Adaptive Polling**: 0.1s during active monitoring, 1.0s during idle countdown.
- **TTL Caching**: `_playerCache` (400ms) and `_tCache` (200ms) prevent DOM bottleneck.

## ANTI-PATTERNS
- **Engine Hero Detection**: DO NOT attempt to read `Image.src`; it is write-only in the JS sandbox.
- **Box-Shadow Glows**: Panorama ignores `box-shadow`; MUST use gradient panels.
- **Scale3d Animation**: Causes text-shadow artifacts; use `pre-transform-scale2d`.
