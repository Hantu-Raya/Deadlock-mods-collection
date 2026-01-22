# AGENTS: Combined Timer v2 (Soul + Buff)

## OVERVIEW
High-complexity merge of Soul Timer (v4.2) and Buff/Rejuv Timer (v5.4 - Production Ready) with production-grade claim detection, enemy linger indicators, and performance optimizations.

## STRUCTURE
```
combined_timer_v2/
├── panorama/
│   ├── layout/
│   │   ├── hud.xml                 # Root layout, HudCore re-parenting
│   │   └── hud_gold_and_ap_container.xml
│   ├── scripts/
│   │   ├── soul_timer.js           # v4.2 logic (drain lookup table)
│   │   └── rejuvnbufftimer.js      # v5.1 logic (minimap claim detection)
│   └── styles/
│       ├── soul_timer.css          # Radioactive Breath animations
│       └── buff_claim.css          # Minimap indicator styling
```

## WHERE TO LOOK
- **Claim Logic**: `rejuvnbufftimer.js` -> `monitorPowerups()`. Uses squared distance heuristics (`CLAIM_RADIUS_SQ: 64`) for minimap buttons.
- **Enemy Linger**: `rejuvnbufftimer.js` -> `checkEnemyLinger()`. CS:GO-style last-seen indicators triggered when enemies lose `.active` class. 6-panel round-robin system with 5s duration.
- **Soul Math**: `soul_timer.js` -> `DRAIN_TBL`. Pre-computed drain curves (0.5% + flat growth).
- **Re-parenting**: `hud.xml` defines `HudCore` (ID: `Hud`). Scripts boot by finding this specifically to ensure layout stability.
- **Performance**: v5.4 optimizations applied - squared distance, DOM write guards, timestamp caching, optimized panelHas(), production-ready linger with no debug overhead.

## CONVENTIONS
- **Dual-Tick Timing**: `soul_timer.js` uses 150ms for display and 2s for expensive state polling.
- **Minimap Heuristics**: Buff tracking relies on `FindChildrenWithClassTraverse("map_button")` on the minimap panel.
- **Claim Indicators**: Minimap glows (`glow-survival`, etc.) combined with sidebar status panels.
- **Enemy Linger System** (v5.4):
  - Continuous monitoring every 300ms using shared player cache
  - 6 pre-defined overlay panels (round-robin allocation)
  - Map button opacity set to 0.5 when enemy enters fog
  - "?" overlay displayed at last known position
  - 5-second duration with auto-cleanup
  - Cancels on death, reappearance, hideout, or reset
- **Performance Patterns** (v5.4):
  - Squared distance comparison (`distSq()` + `CLAIM_RADIUS_SQ: 64`) eliminates `Math.sqrt()`
  - DOM write guards on all timer text updates (`_lastRejuvText`, `_lastBuffText`, `_lastRejuvBuffText`, `_lastClaimTimerL`, `_lastClaimTimerR`)
  - Single `Date.now()` per tick, passed to `doPretrack()`, `monitorPowerups()`, `getPlayersNearPowerup()`, `checkEnemyLinger()`
  - Single try-catch wrapper in `panelHas()` instead of nested loops
  - No debug logging in production build

## ANTI-PATTERNS
- **Engine Root Parenting**: DO NOT use `SetParent(root)`. MUST use `HudCore` to prevent UI drift.
- **Direct Soul String Parsing**: Use `parseNum()` to handle formatted soul strings safely.
- **Frequent DOM Writes**: Display updates MUST be guarded by string comparison (`lastDisplayText`).
- **Math.sqrt() in hot paths**: Use squared distance comparison instead.
- **Nested try-catch in loops**: Use single wrapper for performance.
- **Multiple Date.now() calls per tick**: Cache once and pass through.
