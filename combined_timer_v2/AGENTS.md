# AGENTS: Combined Timer v2 (Soul + Buff)

## OVERVIEW
High-complexity merge of Soul Timer and Buff/Rejuv Timer with claim detection,
enemy linger indicators, and performance optimizations. Treat it as an older
combined variant; verify current behavior against the source before porting
newer `buff_timer_virgin/` assumptions.

## STRUCTURE
```
combined_timer_v2/
├── panorama/
│   ├── layout/
│   │   ├── hud.xml                 # Root layout, Hud target re-parenting
│   │   └── hud_gold_and_ap_container.xml
│   ├── scripts/
│   │   ├── soul_timer.js           # v4.2 logic (drain lookup table)
│   │   └── rejuvnbufftimer.js      # older merged buff/rejuv logic
│   └── styles/
│       ├── soul_timer.css          # Radioactive Breath animations
│       ├── hud_timer.css           # RejuvBuff/RejuvTimeBuff timer visuals
│       └── buff_claim.css          # Minimap indicator styling
```

## BUILD
Compile only from the repo root after Panorama edits:

```powershell
$repo = "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "$repo\sr2compiler\New folder.exe" "$repo\combined_timer_v2"
```

Primary output is `combined_timer_v2_compiled/`. If packaging is needed, use
the repo's `passive_items_mod/compiler/vpkeditcli.exe` and a single-file VPK
name chosen by the user for the current install slot.

## WHERE TO LOOK
- **Claim Logic**: `rejuvnbufftimer.js` -> `monitorPowerups()`. Uses squared distance heuristics (`CLAIM_RADIUS_SQ: 64`) for minimap buttons.
- **Enemy Linger**: `rejuvnbufftimer.js` -> `checkEnemyLinger()`. Last-seen indicators trigger when enemies lose `.active`; current source adds/removes `linger-active` directly on the enemy map button and tracks hide handles in `_lingerState`.
- **Soul Math**: `soul_timer.js` -> `DRAIN_TBL`. Pre-computed drain curves (0.5% + flat growth).
- **Re-parenting**: scripts search for `FindChildTraverse("Hud")` and then re-parent `SoulTimerOverlay` there. If you alter `hud.xml`, confirm the target panel exists or add the expected `id="Hud"`; do not assume the `HudCore` class alone is enough.
- **Legacy buff panels**: this variant still uses `RejuvBuff` /
  `RejuvTimeBuff`. Do not apply `buff_timer_virgin/` mini-card removal rules
  here without changing the XML, CSS, and JS together.
- **Current constants**: `BUTTON_CACHE_TTL = 800`,
  `LINGER_CHECK_INTERVAL = 300`, `CLAIM_RADIUS_SQ = 64`.
- **Performance reality**: this older source has some caching and DOM write
  guards, but it still contains `$.Msg` error logging and more than one
  `FindChildrenWithClassTraverse("map_button")` path. Verify the source before
  promising newer `buff_timer_virgin/` snapshot-pipeline behavior.

## CONVENTIONS
- **Dual-Tick Timing**: `soul_timer.js` uses 150ms for display and 2s for expensive state polling.
- **Minimap Heuristics**: Buff tracking relies on `FindChildrenWithClassTraverse("map_button")` on the minimap panel.
- **Claim Indicators**: Minimap glows (`glow-survival`, etc.) combined with sidebar status panels.
- **Enemy Linger System**:
  - Continuous monitoring every 300ms using shared player cache
  - Adds `.linger-active` to the existing minimap button when enemy enters fog
  - 5-second duration with auto-cleanup
  - Cancels on death, reappearance, hideout, or reset
  - Current reset code still contains legacy `_enemySlots` / `_slotUsed` cleanup references; check those before editing linger reset behavior.
- **Performance Patterns**:
  - Squared distance comparison (`distSq()` + `CLAIM_RADIUS_SQ: 64`) eliminates `Math.sqrt()`
  - DOM write guards on all timer text updates (`_lastRejuvText`, `_lastBuffText`, `_lastRejuvBuffText`, `_lastClaimTimerL`, `_lastClaimTimerR`)
  - Single try-catch wrapper in `panelHas()` instead of nested loops

## ANTI-PATTERNS
- **Engine Root Parenting**: DO NOT use `SetParent(root)`. Use the resolved
  `FindChildTraverse("Hud")` panel so overlays follow the HUD coordinate space.
- **Direct Soul String Parsing**: Use `parseNum()` to handle formatted soul strings safely.
- **Frequent DOM Writes**: Display updates MUST be guarded by string comparison (`lastDisplayText`).
- **Math.sqrt() in hot paths**: Use squared distance comparison instead.
- **Nested try-catch in loops**: Use single wrapper for performance.
- **Assuming this is current `buff_timer_virgin`**: port newer snapshot or
  ping behavior deliberately; this module is a legacy merged variant.
