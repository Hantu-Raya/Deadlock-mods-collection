# Enemy Linger Feature - Implementation Summary

## Status: COMPLETE (Awaiting User Testing)

### What Was Built
CS:GO-style "last seen" indicator for enemies on the minimap. When an enemy enters fog-of-war (loses `.active` class), a "?" overlay appears at their last-known position for 5 seconds.

### Files Modified
1. **hud.xml** - Added 6 pre-defined `LingerOverlay` panels (lines 251-256)
2. **buff_claim.css** - Added `.linger-overlay` and `.linger-question` styles (lines 455-485)
3. **rejuvnbufftimer.js** - Added linger tracking logic:
   - Constants: `LINGER_DURATION=5`
   - State: `_lingerState`, `_lingerPanelMap`, `_nextLingerPanel`
   - Functions: `showLinger()`, `hideLinger()`, `cancelLinger()`, `clearAllLingers()`
   - Detection: Tracks `.active` class changes in enemy detection block
   - Edge cases: Death cancellation, reappearance cancellation, reset cleanup
4. **AGENTS.md** - Documented feature (v5.4)

### Key Features Implemented
- ✅ 6 concurrent linger overlays (round-robin allocation)
- ✅ 5-second duration with auto-cleanup
- ✅ Percentage-based positioning (resolution independent)
- ✅ Dead player exclusion
- ✅ Reappearance cancellation
- ✅ Hideout/reset cleanup

### Compilation
- **Status**: ✅ SUCCESS
- **Files compiled**: 4 (hud.xml, rejuvnbufftimer.js, buff_claim.css, hud_timer.css)
- **Errors**: 0
- **Output**: `buff_timer_virgin_compiled/`

### User Testing Required
The implementation is complete and compiles successfully. User needs to:
1. Copy compiled mod to Deadlock addons folder
2. Launch game and test in a match
3. Verify:
   - "?" appears when enemies enter fog
   - "?" disappears after 5 seconds
   - "?" cancels when enemy reappears
   - No console errors
   - No performance issues

### Detection Method Note
Implemented using `.active` class detection as user specified. If this doesn't work in-game (if `.active` isn't used for player visibility), fallback to position (0,0) heuristic can be implemented.
