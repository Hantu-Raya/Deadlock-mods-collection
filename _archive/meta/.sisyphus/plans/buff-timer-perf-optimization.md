# Buff Timer Virgin - Performance Optimization & Dead Code Removal

## Context

### Original Request
Optimize the script `buff_timer_virgin/` for optimal performance on gaming and low CPU usage, and remove verified dead code from the script.

### Interview Summary
**Key Discussions**:
- ULTRAWORK mode: Direct execution without interview
- Target file: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js` (428 lines)
- Scope: Performance optimization + dead code removal only

**Research Findings**:
- `soul_timer.js` uses generation counter (`gen`) pattern for loop safety
- `kaiz_hud` uses activity-based polling with `isStatic` check
- Pattern: `txt !== lastDisplayText` guard before DOM writes eliminates redundant updates
- Pattern: Squared distance (`dx*dx + dy*dy`) eliminates expensive `Math.sqrt()`
- Pattern: Pre-computed lookup tables for repeated calculations
- AGENTS.md claims v5.2 optimized out `Math.sqrt` but code still contains it (line 257)

---

## Work Objectives

### Core Objective
Reduce CPU usage and eliminate dead code in the buff timer script while preserving all existing functionality.

### Concrete Deliverables
- Optimized `rejuvnbufftimer.js` with measurably lower CPU footprint
- Updated `AGENTS.md` reflecting actual optimizations implemented
- Zero dead code remaining

### Definition of Done
- [x] All dead code lines removed
- [x] `Math.sqrt()` replaced with squared distance comparison
- [x] DOM write guards implemented (no redundant `.text` updates)
- [ ] No functional regressions (timers still work correctly) - requires in-game test
- [x] Compile succeeds: `sr2compiler\\New folder.exe buff_timer_virgin`

### Must Have
- Remove all verified dead code
- Replace `Math.sqrt()` with squared distance
- Add DOM write guards for `.text` properties
- Cache repeated `Date.now()` calls within same tick
- Preserve all existing timer functionality

### Must NOT Have (Guardrails)
- DO NOT change timer intervals or polling frequencies (already optimized in v5.1)
- DO NOT modify CSS or XML layout files
- DO NOT add new features or visual changes
- DO NOT refactor code structure beyond optimization scope
- DO NOT remove code that appears unused but may be used by game engine callbacks

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (Panorama UI mods have no test framework)
- **User wants tests**: Manual-only
- **Framework**: none

### Manual QA Procedures
Each task includes detailed manual verification:
1. **Compile check**: Run `sr2compiler\New folder.exe buff_timer_virgin`
2. **In-game verification**: Launch Deadlock with mod, verify timers display correctly
3. **Functional regression check**: Rejuv timer counts down, buff timer counts, claim indicators appear

---

## Task Flow

```
Task 1 (Dead Code) → Task 2 (sqrt optimization) → Task 3 (DOM guards) → Task 4 (Date.now cache) → Task 5 (panelHas cleanup) → Task 6 (AGENTS.md update) → Task 7 (Final compile)
```

## Parallelization

| Task | Depends On | Reason |
|------|------------|--------|
| 1 | - | Independent first step |
| 2 | 1 | Modifies same file |
| 3 | 2 | Modifies same file |
| 4 | 3 | Modifies same file |
| 5 | 4 | Modifies same file |
| 6 | 5 | Documents changes made |
| 7 | 6 | Final validation |

---

## TODOs

- [x] 1. Remove Verified Dead Code

  **What to do**:
  - Delete `CLAIM_DISPLAY_DUR=4.0` constant (line 8) - declared but never referenced
  - Remove `claimerBtn` parameter from `showClaimIndicator()` function signature (line 151)
  - Remove `closestAllyBtn` and `closestEnemyBtn` from `getPlayersNearPowerup()` return object (lines 261, 300)
  - Remove tracking of `closestAllyBtn`/`closestEnemyBtn` variables (lines 293-296)
  - Remove `p.closestAllyBtn`/`p.closestEnemyBtn` assignments in `monitorPowerups()` (lines 364-365)
  - Remove `claimerBtn` variable and assignments in claim logic (lines 374-384)
  - Update all `showClaimIndicator()` call sites to remove the unused parameter (line 387)

  **Must NOT do**:
  - Remove any code that appears unused but interfaces with game engine
  - Remove the `allyBtn`/`enemyBtn` from intermediate tracking if still needed for distance comparison

  **Parallelizable**: NO (first task)

  **References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:8` - CLAIM_DISPLAY_DUR declaration
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:151` - showClaimIndicator signature
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:259-301` - getPlayersNearPowerup function
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:348-397` - monitorPowerups function

  **Acceptance Criteria**:
  - [x] `CLAIM_DISPLAY_DUR` no longer exists in file
  - [x] `showClaimIndicator` has 3 parameters instead of 4
  - [x] `getPlayersNearPowerup` returns `{ally, enemy}` only
  - [x] No `closestAllyBtn`/`closestEnemyBtn`/`claimerBtn` variables anywhere
  - [x] Compile: `sr2compiler\\New folder.exe buff_timer_virgin` → SUCCESS

  **Commit**: YES
  - Message: `perf(buff_timer): remove verified dead code (claimerBtn, CLAIM_DISPLAY_DUR)`
  - Files: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: Compile succeeds

---

- [x] 2. Replace Math.sqrt with Squared Distance

  **What to do**:
  - Add constant `CLAIM_RADIUS_SQ = CLAIM_RADIUS * CLAIM_RADIUS` (should be 64)
  - Modify `dist()` function to return squared distance (remove `Math.sqrt()`)
  - Rename function to `distSq()` for clarity
  - Update `monitorPowerups()` comparisons to use `CLAIM_RADIUS_SQ` instead of `CLAIM_RADIUS`
  - Update all distance comparison sites to use squared comparisons

  **Must NOT do**:
  - Change the actual claim detection behavior (8 unit radius)
  - Modify any visual or timing logic

  **Parallelizable**: NO (depends on 1)

  **References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:7` - CLAIM_RADIUS constant (value: 8)
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:257` - dist() function with Math.sqrt
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:370-372` - CLAIM_RADIUS comparisons
  - `soul_timer/panorama/scripts/soul_timer.js` - Reference for squared distance pattern

  **WHY This Matters**:
  - `Math.sqrt()` is computationally expensive (10-20x slower than multiplication)
  - Called in hot path during 300ms monitoring loop for every player
  - With 12 players and 2 powerups, that's up to 24 sqrt calls per 300ms

  **Acceptance Criteria**:
  - [x] `Math.sqrt` no longer appears in file
  - [x] `CLAIM_RADIUS_SQ` constant exists with value 64
  - [x] `distSq()` function returns `dx*dx + dy*dy`
  - [x] All distance comparisons use `< CLAIM_RADIUS_SQ`
  - [x] Compile succeeds

  **Commit**: YES
  - Message: `perf(buff_timer): replace Math.sqrt with squared distance comparison`
  - Files: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: Compile succeeds

---

- [x] 3. Add DOM Write Guards

  **What to do**:
  - Add state variables to track last written values:
    - `let _lastRejuvText = ""`
    - `let _lastBuffText = ""`
    - `let _lastRejuvBuffText = ""`
    - `let _lastRejuvNum = ""`
    - `let _lastClaimTimerLeft = ""`
    - `let _lastClaimTimerRight = ""`
  - Wrap all `.text` assignments with change detection:
    ```javascript
    if (txt !== _lastRejuvText) { UI.rLab.text = txt; _lastRejuvText = txt; }
    ```
  - Apply to: line 63 (RejuvTime), line 64 (RejuvTimeBuff), line 65 (BuffTime), line 165 (ClaimTimer), line 198 (ClaimTimerLeft), line 210 (ClaimTimerRight)

  **Must NOT do**:
  - Add guards for properties that are already guarded
  - Modify class toggles (AddClass/RemoveClass already optimized by engine)

  **Parallelizable**: NO (depends on 2)

  **References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:63-65` - Timer text updates in loop()
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:165,198,210` - Claim timer updates
  - `soul_timer/panorama/scripts/soul_timer.js` - Pattern: `if (txt !== lastDisplayText)`

  **WHY This Matters**:
  - Every `.text` assignment triggers Panorama layout recalculation
  - Even setting same value causes layout work
  - In 100ms loop, that's 10 redundant layout passes per second per label

  **Acceptance Criteria**:
  - [x] Six `_last*` tracking variables declared
  - [x] All `.text = ` assignments wrapped with change detection
  - [x] No redundant DOM writes when values unchanged
  - [x] Compile succeeds
  - [ ] In-game: Timer displays still update correctly (requires manual test)

  **Commit**: YES
  - Message: `perf(buff_timer): add DOM write guards to prevent redundant layout recalc`
  - Files: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: Compile succeeds

---

- [x] 4. Cache Date.now() Within Tick

  **What to do**:
  - In `loop()` function, the value `rn = Date.now()` is already captured (line 58)
  - In `getPlayersNearPowerup()`, line 262 calls `Date.now()` again - use passed parameter instead
  - Modify `getPlayersNearPowerup(mm, pwPos)` to `getPlayersNearPowerup(mm, pwPos, nowMs)`
  - Update all call sites to pass `rn` from loop()
  - Do same for `scanPowerups()` if it calls Date.now() internally

  **Must NOT do**:
  - Break timing accuracy by using stale timestamps across long operations
  - Change the 400ms TTL cache behavior

  **Parallelizable**: NO (depends on 3)

  **References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:58` - `rn = Date.now()` in loop()
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:262` - `const now = Date.now()` in getPlayersNearPowerup
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:108-109` - getPlayersNearPowerup calls in doPretrack
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:362` - getPlayersNearPowerup call in monitorPowerups

  **WHY This Matters**:
  - `Date.now()` is a system call with overhead
  - Called multiple times per tick unnecessarily
  - Single capture and pass-through is cleaner and faster

  **Acceptance Criteria**:
  - [x] Only ONE `Date.now()` call per loop iteration
  - [x] `getPlayersNearPowerup` accepts `nowMs` parameter
  - [x] All call sites pass timestamp from loop
  - [x] Compile succeeds

  **Commit**: YES
  - Message: `perf(buff_timer): cache Date.now() per tick, pass to subfunctions`
  - Files: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: Compile succeeds

---

- [x] 5. Optimize panelHas() Function

  **What to do**:
  - The `panelHas()` function (line 119) has nested try-catch in loops - very inefficient
  - Refactor to single try-catch wrapping entire function body
  - Use early returns instead of nested loops
  - Simplify the class checking logic:
    ```javascript
    function panelHas(p) {
      if (!p) return false;
      try {
        for (let i = 0; i < 4; i++) if (p.BHasClass(REJUV_CLS[i])) return true;
        const k = p.Children();
        if (!k) return false;
        for (let j = 0; j < k.length; j++)
          for (let i = 0; i < 4; i++)
            if (k[j].BHasClass(REJUV_CLS[i])) return true;
      } catch { }
      return false;
    }
    ```

  **Must NOT do**:
  - Change the detection logic (4 rejuv class checks on panel and children)
  - Remove the try-catch entirely (panels can become invalid)

  **Parallelizable**: NO (depends on 4)

  **References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:119` - panelHas function
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:4` - REJUV_CLS array

  **WHY This Matters**:
  - Try-catch blocks have performance overhead
  - Nested try-catch in loops multiplies that overhead
  - Called every 3 seconds via doScan(), but still worth optimizing

  **Acceptance Criteria**:
  - [x] Single try-catch wrapper instead of nested
  - [x] Function still detects RejuvCount_1 through RejuvCount_4 classes
  - [x] Compile succeeds
  - [ ] In-game: Rejuv claim still detected correctly (requires manual test)

  **Commit**: YES
  - Message: `perf(buff_timer): optimize panelHas() - reduce try-catch overhead`
  - Files: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: Compile succeeds

---

- [x] 6. Update AGENTS.md Documentation

  **What to do**:
  - Update version to v5.3
  - Document actual optimizations implemented:
    - Squared distance (CLAIM_RADIUS_SQ: 64)
    - DOM write guards for text updates
    - Single Date.now() per tick
    - Optimized panelHas() with single try-catch
  - Remove claim about "String Pooling" if not implemented
  - Add dead code that was removed to changelog

  **Must NOT do**:
  - Claim optimizations that weren't actually implemented

  **Parallelizable**: NO (depends on 5)

  **References**:
  - `buff_timer_virgin/AGENTS.md` - Current documentation (claims v5.2)
  - Line 15-16: Claims about squared distance and Math.sqrt optimization
  - Line 26: Claims about String Pooling

  **Acceptance Criteria**:
  - [x] Version updated to v5.3
  - [x] All claimed optimizations are actually in code
  - [x] Dead code removal documented
  - [x] No false claims remain

  **Commit**: YES
  - Message: `docs(buff_timer): update AGENTS.md to v5.3 with actual optimizations`
  - Files: `buff_timer_virgin/AGENTS.md`
  - Pre-commit: N/A

---

- [x] 7. Final Compilation and Verification

  **What to do**:
  - Run full compile: `sr2compiler\New folder.exe buff_timer_virgin`
  - Verify all output files generated in `buff_timer_virgin_compiled/`
  - Document final line count reduction

  **Must NOT do**:
  - Skip compilation step
  - Commit without successful compile

  **Parallelizable**: NO (final step)

  **References**:
  - `sr2compiler/New folder.exe` - Compilation tool
  - `buff_timer_virgin_compiled/` - Output directory

  **Acceptance Criteria**:
  - [x] Compile command exits with success
  - [x] `buff_timer_virgin_compiled/panorama/scripts/rejuvnbufftimer.vjs_c` exists
  - [x] No compilation errors or warnings
  - [x] Report: Original line count vs optimized line count (428 → 423)

  **Manual Verification**:
  - [x] Run: `"sr2compiler\\New folder.exe" buff_timer_virgin`
  - [x] Expected: Compilation success message
  - [x] Verify output file exists

  **Commit**: NO (verification only)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `perf(buff_timer): remove verified dead code` | rejuvnbufftimer.js | Compile |
| 2 | `perf(buff_timer): replace Math.sqrt with squared distance` | rejuvnbufftimer.js | Compile |
| 3 | `perf(buff_timer): add DOM write guards` | rejuvnbufftimer.js | Compile |
| 4 | `perf(buff_timer): cache Date.now() per tick` | rejuvnbufftimer.js | Compile |
| 5 | `perf(buff_timer): optimize panelHas()` | rejuvnbufftimer.js | Compile |
| 6 | `docs(buff_timer): update AGENTS.md to v5.3` | AGENTS.md | N/A |

---

## Success Criteria

### Verification Commands
```powershell
# Compile the mod
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
# Expected: Successful compilation

# Verify output
dir "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin_compiled\panorama\scripts\rejuvnbufftimer.vjs_c"
# Expected: File exists
```

### Final Checklist
- [x] All dead code removed (CLAIM_DISPLAY_DUR, claimerBtn, closestAllyBtn/EnemyBtn)
- [x] Math.sqrt replaced with squared distance
- [x] DOM write guards on all .text assignments
- [x] Date.now() cached per tick
- [x] panelHas() optimized
- [x] AGENTS.md updated to v5.3
- [x] Compilation succeeds
- [ ] No functional regressions (requires in-game manual test)
