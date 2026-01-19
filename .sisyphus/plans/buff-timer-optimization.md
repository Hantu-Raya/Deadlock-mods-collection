# Buff Timer Virgin Performance Optimization v2

## Context

### Original Request
Optimize the script `buff_timer_virgin/` for optimal performance on gaming and low CPU usage, and remove verified dead code of the script.

### Interview Summary
**Key Discussions**:
- Script is 428 lines, production-ready v5.1 with proximity-based claim detection
- Already follows "Resilient Panorama" patterns (TTL caching, multi-rate polling, object reuse)
- Intent is surgical REFACTORING - preserve behavior, improve performance

**Research Findings**:
- Existing patterns are solid: `_playerCache` (400ms TTL), `_tCache` (200ms TTL), `_posResult` reuse
- Multi-rate loop with TICK_FAST (0.1s) / TICK_NORM (1s) / TICK_IDLE (3s) is appropriate
- CSS correctly uses `pre-transform-scale2d` (no scale3d anti-pattern)

**NEW Critical Findings (from deep analysis)**:
1. **Math.sqrt() in hot path** - Called for every player (10-20) every 300ms
2. **Object allocation in loops** - Creates new objects every proximity scan
3. **Dead XML panels** - `hero_pos_debug` and unused snippets waste memory
4. **Debug logging** - `$.Msg()` calls in production code

### Gap Analysis
**Gaps Addressed**:
- Verification strategy for "no behavioral changes" → Added explicit before/after verification steps
- Risk of over-optimization → Constrained to measurable improvements only
- Edge case: script reload behavior → Preserve existing reset() mechanism
- NEW: Math.sqrt() elimination → Use squared distance comparison
- NEW: Object pooling → Update in-place instead of recreating

---

## Work Objectives

### Core Objective
Reduce CPU usage during gameplay by optimizing hot paths and removing dead code, while preserving all existing functionality.

### Concrete Deliverables
- Optimized `rejuvnbufftimer.js` with reduced allocations, eliminated sqrt, and improved cache usage
- Cleaned `hud.xml` with unused panels removed
- Removal of verified dead code and debug logging
- No behavioral changes to timer logic or claim detection

### Definition of Done
- [ ] Script compiles without errors via sr2compiler
- [ ] All timer displays work identically (Rejuv countdown, Buff countdown, claim indicators)
- [ ] No new console errors in F7 debug console
- [ ] Dead code removed (CLAIM_DISPLAY_DUR, debug panels, unused snippets)
- [ ] Math.sqrt eliminated from proximity calculations

### Must Have
- Preserve exact timing behavior (REJUV_DUR=240, BRIDGE_DUR=300, phase sequences)
- Preserve proximity claim detection logic (CLAIM_RADIUS=8)
- Preserve TTL caching mechanisms
- Preserve multi-rate polling behavior

### Must NOT Have (Guardrails)
- **NO behavioral changes** - timers must display identical values at identical times
- **NO new dependencies** - no external libraries or additional files
- **NO feature additions** - this is pure optimization
- **NO micro-optimizations with negligible impact** - focus on measurable gains
- **NO removal of try/catch in error-prone areas** - maintain resilience
- **NO changes to claim detection accuracy** - proximity logic must remain identical

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (no test framework in project)
- **User wants tests**: Manual-only (project convention)
- **Framework**: None

### Manual QA Procedure
Each TODO includes detailed verification using the game's debug console (F7) and visual inspection.

**Verification Commands:**
```powershell
# Compile after changes
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
```

**In-Game Verification:**
1. Launch Deadlock with `-dev -tools` flags
2. Open F7 console, filter for `[BT-P]` tags
3. Verify timers display correctly during:
   - Pre-game (hideout detection)
   - First Rejuv spawn (10:00)
   - Subsequent Rejuv spawns
   - Bridge buff cycle (5:00 intervals)
   - Powerup claim detection

---

## Task Flow

```
Task 1 (Dead Code JS) ──┬── Task 2 (Dead Code XML) [PARALLEL]
                        │
                        v
                  Task 3 (Math.sqrt Elimination) [HIGHEST IMPACT]
                        │
                        v
                  Task 4 (Object Pooling)
                        │
                        v
                  Task 5 (String Formatting)
                        │
                        v
                  Task 6 (Loop Frequency)
                        │
                        v
                  Task 7 (Final Verification)
```

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| A | 1, 2 | Independent files (JS vs XML) |

| Task | Depends On | Reason |
|------|------------|--------|
| 3 | 1 | Build on clean JS codebase |
| 4 | 3 | Object pooling builds on distance optimization |
| 5 | 4 | String optimization after core logic |
| 6 | 5 | Frequency tuning after other optimizations |
| 7 | 6 | Final verification requires all changes |

---

## TODOs

- [x] 1. Remove Verified Dead Code (JavaScript)

  **What to do**:
  - Delete `CLAIM_DISPLAY_DUR=4.0` constant on line 8 (declared but never referenced)
  - Remove or conditionalize debug `$.Msg()` calls (lines 121, 171, 251, 345)
  - Option A: Remove entirely (production mode)
  - Option B: Wrap in `if(DEBUG)` flag (development flexibility)
  - Search entire file for any other unreferenced constants or variables

  **Must NOT do**:
  - Remove any constants that ARE referenced
  - Remove commented code that serves as documentation
  - Break error handling paths

  **Parallelizable**: YES (with Task 2)

  **References**:
  
  **Pattern References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:1-30` - Constants section
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:121` - findMinimap error log
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:171` - showClaimIndicator error log
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:251` - getPanelPos error log
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:345` - scanPowerups error log
  
  **Search Commands**:
  - Search for `CLAIM_DISPLAY_DUR` usage → should return 0 matches (only declaration)
  - Search for `$.Msg` → should find 4 occurrences to evaluate

  **Acceptance Criteria**:
  
  **Manual Execution Verification:**
  - [ ] Grep for `CLAIM_DISPLAY_DUR` in file → 0 matches after removal
  - [ ] Compile: `sr2compiler "buff_timer_virgin"` → SUCCESS
  - [ ] No errors in F7 console when loading HUD
  - [ ] Script still handles edge cases gracefully (no silent failures)

  **Commit**: YES
  - Message: `perf(buff_timer): remove unused CLAIM_DISPLAY_DUR and debug logging`
  - Files: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: Compile with sr2compiler

---

- [x] 2. Remove Dead XML Panels (SKIPPED - snippets used by engine)

  **What to do**:
  - Remove `hero_pos_debug` panel block (lines 106-116 in hud.xml)
  - Remove unused snippets section (lines 15-55):
    - `OffscreenEnemySnippet`
    - `OffscreenPingSnippet`
    - `SeasonalKillToast`
  - These are copied from game files but never used by this mod

  **Must NOT do**:
  - Remove any panels referenced by the JavaScript
  - Break the XML structure or hierarchy
  - Remove panels that are part of the game's base HUD (only remove additions)

  **Parallelizable**: YES (with Task 1)

  **References**:
  
  **Pattern References**:
  - `buff_timer_virgin/panorama/layout/hud.xml:15-55` - Unused snippets block
  - `buff_timer_virgin/panorama/layout/hud.xml:106-116` - hero_pos_debug panel
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:31-50` - UI object to verify which panels ARE used

  **WHY Each Reference Matters**:
  - The UI object in JS shows exactly which panel IDs are required
  - Snippets are never instantiated by the script
  - hero_pos_debug was likely for development and never removed

  **Acceptance Criteria**:
  
  **Manual Execution Verification:**
  - [ ] Grep for `hero_pos_debug` in JS → 0 matches (confirms unused)
  - [ ] Grep for `OffscreenEnemySnippet` in JS → 0 matches
  - [ ] Compile: `sr2compiler "buff_timer_virgin"` → SUCCESS
  - [ ] In-game: HUD loads without errors
  - [ ] In-game: All timer/glow/claim panels still work

  **Commit**: YES
  - Message: `perf(buff_timer): remove unused XML panels and snippets`
  - Files: `buff_timer_virgin/panorama/layout/hud.xml`
  - Pre-commit: Compile with sr2compiler

---

- [x] 3. Eliminate Math.sqrt() in Distance Calculation [HIGHEST IMPACT]

  **What to do**:
  - Replace `dist()` function with squared distance comparison
  - Add pre-computed squared radius constant
  - Update all distance comparisons to use squared values

  **Current Code (Line 257)**:
  ```javascript
  function dist(p1,p2){const dx=p1.x-p2.x,dy=p1.y-p2.y;return Math.sqrt(dx*dx+dy*dy);}
  ```

  **Optimized Code**:
  ```javascript
  const CLAIM_RADIUS_SQ=CLAIM_RADIUS*CLAIM_RADIUS; // Add near line 7
  function distSq(p1,p2){const dx=p1.x-p2.x,dy=p1.y-p2.y;return dx*dx+dy*dy;}
  ```

  **Update Comparisons**:
  - Line 291: `const d=dist(pos,pwPos);` → `const dSq=distSq(pos,pwPos);`
  - Line 370: `p.minAllyDist<=CLAIM_RADIUS` → `p.minAllyDistSq<=CLAIM_RADIUS_SQ`
  - Line 371: `p.minEnemyDist<=CLAIM_RADIUS` → `p.minEnemyDistSq<=CLAIM_RADIUS_SQ`
  - All distance comparisons must use squared values

  **Impact Analysis**:
  - `Math.sqrt()` is called for 10-20 players every 300ms during monitoring
  - That's 33-66 sqrt calls per second during active powerup phase
  - Squared comparison is ~10x faster than sqrt

  **Must NOT do**:
  - Change the effective claim radius (8 units must remain 8 units)
  - Break the "closer ally vs enemy" comparison logic
  - Mix squared and non-squared distances in comparisons

  **Parallelizable**: NO (depends on Task 1)

  **References**:
  
  **Pattern References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:257` - Current dist() function
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:291` - Distance calculation in getPlayersNearPowerup
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:370-372` - CLAIM_RADIUS comparisons
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:7` - CLAIM_RADIUS constant definition

  **Mathematical Correctness**:
  - If `sqrt(dx²+dy²) < R` then `dx²+dy² < R²`
  - For R=8: R²=64, so `distSq < 64` is equivalent to `dist < 8`

  **Acceptance Criteria**:
  
  **Manual Execution Verification:**
  - [ ] Compile: `sr2compiler "buff_timer_virgin"` → SUCCESS
  - [ ] In-game: Stand near powerup spawn point when it spawns
  - [ ] Verify: Claim detection still triggers at ~8 unit radius
  - [ ] Verify: Ally/Enemy distinction still works correctly
  - [ ] Verify: Pre-tracking min distance still updates correctly

  **Commit**: YES
  - Message: `perf(buff_timer): eliminate Math.sqrt with squared distance comparison`
  - Files: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: Compile with sr2compiler

---

- [x] 4. Implement Object Pooling for Player State
- [x] 5. Optimize String Formatting with Lookup Table
- [x] 6. Optimize Loop Frequency and Inline Glow Removal
- [x] 7. Final Verification and Cleanup

  **What to do**:
  - Run full compile
  - Test complete game flow in Deadlock
  - Verify no regressions in functionality
  - Update AGENTS.md to reflect v5.2

  **Must NOT do**:
  - Skip any verification step
  - Merge if any timer displays incorrectly

  **Parallelizable**: NO (final task)

  **References**:
  
  **Documentation**:
  - `buff_timer_virgin/AGENTS.md` - Module documentation to update

  **Acceptance Criteria**:
  
  **Compilation Verification:**
  - [ ] `sr2compiler "buff_timer_virgin"` → SUCCESS, no warnings
  
  **In-Game Full Flow Test:**
  - [ ] Start new match, wait in hideout
  - [ ] Observe hideout detection works (timer doesn't run prematurely)
  - [ ] First Rejuv spawn at 10:00 - timer shows "Spawn" state
  - [ ] Claim Rejuv - buff timer appears, shows 4:00 countdown
  - [ ] Bridge buff cycle at 5:00 intervals - timer accurate
  - [ ] Powerup spawn - glow appears on correct minimap side
  - [ ] Claim powerup - glow clears, claim indicator appears
  - [ ] Enemy claims powerup - red pulse, then indicator
  
  **Console Verification:**
  - [ ] F7 console shows no `[BT-P][ERR]` messages (or none if removed)
  - [ ] No JavaScript exceptions in console

  **Commit**: YES
  - Message: `perf(buff_timer): v5.2 performance optimization complete`
  - Files: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`, `buff_timer_virgin/AGENTS.md`
  - Pre-commit: Full verification above

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `perf(buff_timer): remove unused CLAIM_DISPLAY_DUR and debug logging` | rejuvnbufftimer.js | Compile |
| 2 | `perf(buff_timer): remove unused XML panels and snippets` | hud.xml | Compile |
| 3 | `perf(buff_timer): eliminate Math.sqrt with squared distance comparison` | rejuvnbufftimer.js | Compile + claim test |
| 4 | `perf(buff_timer): use object pooling for player state tracking` | rejuvnbufftimer.js | Compile + dead player test |
| 5 | `perf(buff_timer): use lookup table for time formatting` | rejuvnbufftimer.js | Compile + timer display |
| 6 | `perf(buff_timer): optimize loop frequency and inline glow removal` | rejuvnbufftimer.js | Compile + glow test |
| 7 | `perf(buff_timer): v5.2 performance optimization complete` | rejuvnbufftimer.js, AGENTS.md | Full verification |

---

## Success Criteria

### Verification Commands
```powershell
# Compile the mod
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
# Expected: SUCCESS, output files in buff_timer_virgin_compiled/
```

### Performance Improvements Expected
| Optimization | Impact | Frequency |
|--------------|--------|-----------|
| Math.sqrt elimination | ~10x faster distance calc | 33-66 calls/sec during monitor |
| Object pooling | Eliminates 40-80 allocs/sec | Every proximity scan |
| String lookup table | Reduces string allocs | Every loop iteration |
| Pretrack interval | 25% fewer wake-ups | Pre-spawn window |
| Dead code removal | Cleaner codebase | One-time |

### Final Checklist
- [ ] All timer displays work identically to before
- [ ] Glow effects appear and clear correctly
- [ ] Claim detection attributes to correct team
- [ ] Dead player grace period still works
- [ ] No console errors
- [ ] Dead code removed (CLAIM_DISPLAY_DUR, debug panels, snippets)
- [ ] Math.sqrt eliminated from hot path
- [ ] Object pooling implemented
- [ ] Script file size reduced
