# AGENTS: Combined Timer v2 (Soul + Buff)

## OVERVIEW
High-complexity merge of Soul Timer (v4.2) and Buff/Rejuv Timer (v5.3) with production-grade claim detection and performance optimizations.

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
- **Soul Math**: `soul_timer.js` -> `DRAIN_TBL`. Pre-computed drain curves (0.5% + flat growth).
- **Re-parenting**: `hud.xml` defines `HudCore` (ID: `Hud`). Scripts boot by finding this specifically to ensure layout stability.
- **Performance**: v5.3 optimizations applied - squared distance, DOM write guards, timestamp caching, optimized panelHas().

## CONVENTIONS
- **Dual-Tick Timing**: `soul_timer.js` uses 150ms for display and 2s for expensive state polling.
- **Minimap Heuristics**: Buff tracking relies on `FindChildrenWithClassTraverse("map_button")` on the minimap panel.
- **Claim Indicators**: Minimap glows (`glow-survival`, etc.) combined with sidebar status panels.
- **Performance Patterns** (v5.3):
  - Squared distance comparison (`distSq()` + `CLAIM_RADIUS_SQ: 64`) eliminates `Math.sqrt()`
  - DOM write guards on all timer text updates (`_lastRejuvText`, `_lastBuffText`, `_lastRejuvBuffText`, `_lastClaimTimerL`, `_lastClaimTimerR`)
  - Single `Date.now()` per tick, passed to `doPretrack()`, `monitorPowerups()`, `getPlayersNearPowerup()`
  - Single try-catch wrapper in `panelHas()` instead of nested loops

## ANTI-PATTERNS
- **Engine Root Parenting**: DO NOT use `SetParent(root)`. MUST use `HudCore` to prevent UI drift.
- **Direct Soul String Parsing**: Use `parseNum()` to handle formatted soul strings safely.
- **Frequent DOM Writes**: Display updates MUST be guarded by string comparison (`lastDisplayText`).
- **Math.sqrt() in hot paths**: Use squared distance comparison instead.
- **Nested try-catch in loops**: Use single wrapper for performance.
- **Multiple Date.now() calls per tick**: Cache once and pass through.
