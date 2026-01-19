# Buff Timer Virgin Performance Optimization

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
- One verified dead constant: `CLAIM_DISPLAY_DUR` declared but never used

### Metis Review
**Identified Gaps** (addressed):
- Verification strategy for "no behavioral changes" → Added explicit before/after verification steps
- Risk of over-optimization → Constrained to measurable improvements only
- Edge case: script reload behavior → Preserve existing reset() mechanism

---

## Work Objectives

### Core Objective
Reduce CPU usage during gameplay by optimizing hot paths and removing dead code, while preserving all existing functionality.

### Concrete Deliverables
- Optimized `rejuvnbufftimer.js` with reduced allocations and improved cache usage
- Removal of verified dead code
- No behavioral changes to timer logic or claim detection

### Definition of Done
- [ ] Script compiles without errors via sr2compiler
- [ ] All timer displays work identically (Rejuv countdown, Buff countdown, claim indicators)
- [ ] No new console errors in F7 debug console
- [ ] Dead code removed (specifically `CLAIM_DISPLAY_DUR`)

### Must Have
- Preserve exact timing behavior (REJUV_DUR=240, BRIDGE_DUR=300, phase sequences)
- Preserve proximity claim detection logic (CLAIM_RADIUS=8)
- Preserve TTL caching mechanisms
- Preserve multi-rate polling behavior

### Must NOT Have (Guardrails)
- **NO behavioral changes** - timers must display identical values at identical times
- **NO new dependencies** - no external libraries or additional files
- **NO CSS or XML modifications** - scope is JS only
- **NO feature additions** - this is pure optimization
- **NO micro-optimizations with negligible impact** - focus on measurable gains
- **NO removal of try/catch in error-prone areas** - maintain resilience

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
Task 1 (Dead Code) → Task 2 (String Optimization) → Task 3 (Cache Optimization)
                                                          ↓
                                                    Task 4 (Loop Optimization)
                                                          ↓
                                                    Task 5 (Final Verification)
```

## Parallelization

| Task | Depends On | Reason |
|------|------------|--------|
| 1 | None | Independent dead code removal |
| 2 | 1 | Build on clean codebase |
| 3 | 2 | Build on string optimizations |
| 4 | 3 | Build on cache optimizations |
| 5 | 4 | Final verification requires all changes |

---

## TODOs

- [ ] 1. Remove Verified Dead Code

  **What to do**:
  - Delete `CLAIM_DISPLAY_DUR=4.0` constant on line 8 (declared but never referenced)
  - Search entire file for any other unreferenced constants or variables
  - Verify no other code references the removed constant

  **Must NOT do**:
  - Remove any constants that ARE referenced (even if seemingly unused)
  - Remove commented code that serves as documentation

  **Parallelizable**: NO (first task)

  **References**:
  
  **Pattern References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:1-30` - Constants section, verify which are used
  
  **Search Commands**:
  - Search for `CLAIM_DISPLAY_DUR` usage → should return 0 matches (only declaration)

  **Acceptance Criteria**:
  
  **Manual Execution Verification:**
  - [ ] Grep for `CLAIM_DISPLAY_DUR` in file → 0 matches after removal
  - [ ] Compile: `sr2compiler "buff_timer_virgin"` → SUCCESS
  - [ ] No errors in F7 console when loading HUD

  **Commit**: YES
  - Message: `perf(buff_timer): remove unused CLAIM_DISPLAY_DUR constant`
  - Files: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: Compile with sr2compiler

---

- [ ] 2. Optimize String Formatting

  **What to do**:
  - Pre-compute padded minute/second strings in a lookup table (similar to `PAD` pattern in soul_timer)
  - Replace `fmt()` function's string concatenation with array lookup
  - Current: `(m<10?"0"+m:""+m)+":"+(ss<10?"0"+ss:""+ss)` creates 4+ string objects
  - Optimized: `PAD[m]+":"+PAD[ss]` creates 1 string object

  **Implementation**:
  ```javascript
  // Add near top with other constants
  const PAD=[];for(let i=0;i<60;i++)PAD[i]=i<10?"0"+i:""+i;
  
  // Replace fmt() function
  function fmt(s){s=Math.max(0,s|0);return PAD[(s/60)|0]+":"+PAD[s%60];}
  ```

  **Must NOT do**:
  - Change the output format (must remain "MM:SS")
  - Break negative number handling (must clamp to 0)

  **Parallelizable**: NO (depends on Task 1)

  **References**:
  
  **Pattern References**:
  - `soul_timer/panorama/scripts/soul_timer.js` - Look for PAD array pattern if exists
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:424` - Current `fmt()` implementation
  
  **Why This Matters**:
  - `fmt()` is called every loop iteration (0.1s-1s frequency)
  - String concatenation creates garbage for GC
  - Lookup table trades 60 pre-allocated strings for repeated allocation

  **Acceptance Criteria**:
  
  **Manual Execution Verification:**
  - [ ] Compile: `sr2compiler "buff_timer_virgin"` → SUCCESS
  - [ ] In-game: Rejuv timer displays "10:00", "09:59", etc. correctly
  - [ ] In-game: Buff timer displays "05:00", "04:59", etc. correctly
  - [ ] Edge case: Timer at 0 displays "00:00"
  - [ ] Edge case: Timer at 599 (9:59) displays correctly

  **Commit**: YES
  - Message: `perf(buff_timer): use lookup table for time formatting`
  - Files: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: Compile with sr2compiler

---

- [ ] 3. Optimize Cache Patterns

  **What to do**:
  - Move `GLOW_CLASSES` iteration to use direct property access instead of loop
  - Pre-compute glow class set for O(1) lookup in `clearSideGlow()`
  - Reduce redundant `Date.now()` calls in hot paths

  **Implementation Details**:
  
  A. **Consolidate Date.now() calls in loop()**:
  ```javascript
  // Current: Date.now() called multiple times
  const now=gTime(),rn=Date.now();
  // ... later ...
  if(rn-lastPretrackCheck>=PRETRACK_INTERVAL)
  // ... later ...
  if(rn-lastPowerupScan>=200)
  ```
  This is already optimized - `rn` is reused. No change needed here.

  B. **Optimize clearSideGlow()**:
  Current iterates 5-element array every call. Convert to direct method:
  ```javascript
  function clearSideGlow(side){
    const panel=side==="LEFT"?UI.glowLeft:UI.glowRight;
    if(!panel)return;
    try{
      panel.RemoveClass("glow-survival");
      panel.RemoveClass("glow-casting");
      panel.RemoveClass("glow-movement");
      panel.RemoveClass("glow-gun");
      panel.RemoveClass("glow-enemy");
    }catch{}
  }
  ```
  This eliminates loop overhead and array access for a fixed 5-element set.

  **Must NOT do**:
  - Remove any glow classes from the clear operation
  - Break the try/catch error handling

  **Parallelizable**: NO (depends on Task 2)

  **References**:
  
  **Pattern References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:123-127` - Current `clearSideGlow()` implementation
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:40` - `GLOW_CLASSES` constant

  **Acceptance Criteria**:
  
  **Manual Execution Verification:**
  - [ ] Compile: `sr2compiler "buff_timer_virgin"` → SUCCESS
  - [ ] In-game: Glow effects appear on minimap when powerup spawns
  - [ ] In-game: Glow effects clear properly when powerup is claimed
  - [ ] In-game: Enemy claim shows red pulse, then clears

  **Commit**: YES
  - Message: `perf(buff_timer): inline glow class removal for reduced loop overhead`
  - Files: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: Compile with sr2compiler

---

- [ ] 4. Optimize Loop Frequency

  **What to do**:
  - Increase `PRETRACK_INTERVAL` from 750ms to 1000ms (pre-tracking doesn't need sub-second precision)
  - This reduces CPU wake-ups during the 10-second pre-spawn window

  **Implementation**:
  ```javascript
  // Line 7: Change from
  const PRETRACK_INTERVAL=750;
  // To
  const PRETRACK_INTERVAL=1000;
  ```

  **Justification**:
  - Pre-tracking starts 10s before spawn (`POWERUP_CHECK_TH=10`)
  - At 750ms interval: 13-14 checks before spawn
  - At 1000ms interval: 10 checks before spawn
  - Proximity detection accuracy is unchanged (we track min distance, not instantaneous)

  **Must NOT do**:
  - Change `MONITOR_INTERVAL` (300ms) - needed for accurate claim detection
  - Change `BUTTON_CACHE_TTL` (400ms) - already optimized
  - Change main loop tick rates

  **Parallelizable**: NO (depends on Task 3)

  **References**:
  
  **Pattern References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:7` - `PRETRACK_INTERVAL` constant
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:72-75` - Pre-track logic

  **Acceptance Criteria**:
  
  **Manual Execution Verification:**
  - [ ] Compile: `sr2compiler "buff_timer_virgin"` → SUCCESS
  - [ ] In-game: Pre-tracking still detects approaching players correctly
  - [ ] In-game: Claim attribution (ally vs enemy) remains accurate
  - [ ] In-game: No noticeable delay in claim indicator appearance

  **Commit**: YES
  - Message: `perf(buff_timer): reduce pretrack frequency from 750ms to 1000ms`
  - Files: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: Compile with sr2compiler

---

- [ ] 5. Final Verification and Cleanup

  **What to do**:
  - Run full compile
  - Test complete game flow in Deadlock
  - Verify no regressions in functionality
  - Document any edge cases encountered

  **Must NOT do**:
  - Skip any verification step
  - Merge if any timer displays incorrectly

  **Parallelizable**: NO (final task)

  **References**:
  
  **Documentation**:
  - `buff_timer_virgin/AGENTS.md` - Module documentation

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
  - [ ] F7 console shows no `[BT-P][ERR]` messages
  - [ ] No JavaScript exceptions in console

  **Commit**: YES
  - Message: `perf(buff_timer): v5.2 performance optimization complete`
  - Files: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: Full verification above

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `perf(buff_timer): remove unused CLAIM_DISPLAY_DUR constant` | rejuvnbufftimer.js | Compile |
| 2 | `perf(buff_timer): use lookup table for time formatting` | rejuvnbufftimer.js | Compile + timer display |
| 3 | `perf(buff_timer): inline glow class removal for reduced loop overhead` | rejuvnbufftimer.js | Compile + glow test |
| 4 | `perf(buff_timer): reduce pretrack frequency from 750ms to 1000ms` | rejuvnbufftimer.js | Compile + claim test |
| 5 | `perf(buff_timer): v5.2 performance optimization complete` | rejuvnbufftimer.js | Full verification |

---

## Success Criteria

### Verification Commands
```powershell
# Compile the mod
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
# Expected: SUCCESS, output files in buff_timer_virgin_compiled/
```

### Final Checklist
- [ ] All timer displays work identically to before
- [ ] Glow effects appear and clear correctly
- [ ] Claim detection attributes to correct team
- [ ] No console errors
- [ ] Dead code (`CLAIM_DISPLAY_DUR`) removed
- [ ] Script file size reduced (minor, ~50-100 bytes from dead code removal)
