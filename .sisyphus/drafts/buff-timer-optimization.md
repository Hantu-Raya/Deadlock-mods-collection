# Draft: Buff Timer Virgin Optimization

## Requirements (confirmed)
- Optimize `rejuvnbufftimer.js` for gaming performance and low CPU usage
- Remove verified dead code from the script
- Intent: REFACTORING (performance-focused)

## Current State Analysis

### Script Overview (428 lines)
- **Location**: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
- **Purpose**: Rejuvenator + Bridge Buff tracker with proximity-based claim detection
- **Architecture**: IIFE with multi-rate polling (0.1s/1s/3s), TTL caching, state machine

### Existing Performance Patterns (GOOD)
1. **TTL Caching**: `_playerCache` (400ms), `_tCache` (200ms) - already optimized
2. **Multi-rate Polling**: TICK_FAST (0.1s), TICK_NORM (1s), TICK_IDLE (3s) - adaptive
3. **Object Reuse**: `_posResult` object for `getPanelPos()` - prevents GC churn
4. **Panel Caching**: `UI` object populated at boot - avoids repeated traversals
5. **`pre-transform-scale2d`**: Used correctly in CSS (no scale3d anti-pattern)

### Identified Optimizations

#### 1. Dead Code Candidates
- `CLAIM_DISPLAY_DUR` (line 8): Declared but never used
- `findMinimap()` caching incomplete: Checks `IsValid()` but still does FindChildTraverse frequently
- Multiple `try/catch` wrappers that may be overly defensive in hot paths

#### 2. CPU Optimization Opportunities
- **`parseSec()`** (line 422): Uses char-by-char parsing - could use regex with negligible perf difference at 0.2s intervals
- **`getPlayersNearPowerup()`**: Called twice per side during pretrack - could batch
- **`clearGlows()`**: Iterates GLOW_CLASSES array every call - minor but optimizable
- **Inline string concatenation**: `fmt()` creates new strings every call

#### 3. Loop Frequency Analysis
| Loop | Current Rate | Justification | Optimization |
|------|--------------|---------------|--------------|
| Main loop | 0.1s-3s | Adaptive | OK |
| doScan | 3s | Rejuv detection | OK |
| doPretrack | 750ms | Pre-spawn tracking | Could increase to 1s |
| monitorPowerups | 300ms | Claim detection | OK during active phase |

## Technical Decisions
- **Approach**: Surgical optimization, preserve existing architecture
- **Risk Level**: LOW (no behavioral changes, only perf improvements)
- **Test Strategy**: Manual verification (no test infra in project)

## Verified Dead Code (TO REMOVE)
1. `CLAIM_DISPLAY_DUR = 4.0` (line 8) - declared, never used
2. Debug scaffolding if any (none found in current version)

## Optimization Targets
1. Reduce object allocation in hot paths
2. Batch DOM queries where possible
3. Pre-compute static values
4. Reduce try/catch overhead in tight loops

## Open Questions
- None - requirements are clear

## Scope Boundaries
- INCLUDE: JS optimizations, dead code removal
- EXCLUDE: CSS changes, XML changes, feature additions
