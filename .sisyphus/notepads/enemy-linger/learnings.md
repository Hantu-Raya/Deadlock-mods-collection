# Learnings - Enemy Linger Feature

## 2026-01-20: Implementation Complete

### Successful Approaches
1. **Round-robin panel allocation**: Using `_nextLingerPanel` counter cycling 0-5 prevents panel conflicts
2. **State tracking pattern**: `_lingerState[enemyId] = {panelIdx, hideHandle, x, y}` allows proper cleanup
3. **Dual mapping**: Both `_lingerState` (by enemyId) and `_lingerPanelMap` (by panelIdx) enable bidirectional lookups
4. **Edge case handling in dead branch**: Checking enemy class in dead detection block catches death immediately
5. **Reusing existing reset()**: Adding `clearAllLingers()` to reset() handles hideout/restart automatically

### Technical Decisions
- **Detection method**: Used `.active` class as user specified (not position heuristic)
- **Duration**: 5 seconds via `LINGER_DURATION` constant
- **Panel count**: 6 pre-defined panels (one per enemy team member)
- **Positioning**: Percentage-based `marginLeft`/`marginTop` for resolution independence

### Code Patterns Followed
- Followed existing `_playerState` pattern for state tracking
- Used `$.Schedule()` for delayed execution (consistent with claim indicators)
- Added `wasActive` field to track visibility transitions
- Maintained minified style (no spaces, compact syntax)

### Compilation Notes
- All 4 files compiled successfully (hud.xml, rejuvnbufftimer.js, buff_claim.css, hud_timer.css)
- No LSP errors or warnings
- Output: `buff_timer_virgin_compiled/`
