# Buff Timer Virgin: Performance Optimization & Bug Fixes

## TL;DR

> **Quick Summary**: Fix critical dead code bug that breaks the Rejuvenator clip overlay effect, extract shared player cache logic to eliminate code duplication, and add SEQ bounds checking for stability. All optimizations maintain visual fidelity.
>
> **Deliverables**:
> - Fixed RejuvTimeClip overlay (currently broken - never syncs text)
> - Consolidated player cache refresh logic (eliminates ~30 lines of duplication)
> - SEQ array bounds safety check
> - Updated AGENTS.md documentation
>
> **Estimated Effort**: Short (2-3 hours)
> **Parallel Execution**: NO - sequential (each task builds on previous)
> **Critical Path**: Task 1 (bug fix) → Task 2 (consolidation) → Task 3 (bounds check) → Task 4 (docs)

---

## Context

### Original Request
Optimize the `buff_timer_virgin` mod for low CPU usage, GPU efficiency, and memory while maintaining information accuracy and keeping all visual effects. Fix existing bugs.

### Interview Summary
**Key Discussions**:
- Priority: ALL performance aspects equally important (CPU, Memory, GPU)
- Current State: Preventive optimization - no active performance issues
- Visual Constraint: Keep ALL visual effects (no degradation acceptable)
- Testing: Agent-Executed QA only (no unit test framework)

**Research Findings**:
- **Panorama Performance**: Known JS performance issues in Source 2 (CS:GO issue #3972 showed 133ms frame spikes from excessive JS)
- **$.Schedule() Best Practices**: Visual effects need 144Hz, game state 10-30Hz, background 0.5-1Hz
- **Current Mod**: Already uses 100ms/1000ms/30000ms adaptive polling (appropriate)
- **CSS Performance**: Mod correctly avoids expensive box-shadow/blur, uses gradient panels
- **Memory**: Mod has prunePlayerState() for bounded memory growth (good)

### Metis Review
**Identified Gaps** (addressed):
1. **Dead code bug severity underestimated**: `UI.rLabClip.text` is NEVER synchronized - the clip overlay effect is completely broken
2. **Player iteration consolidation risk**: Recommended extracting ONLY cache refresh logic, not full iteration
3. **CSS changes excluded**: Confirmed out of scope to avoid visual regressions
4. **Try-catch tightening excluded**: Current large wrappers are intentional Panorama safety patterns

---

## Work Objectives

### Core Objective
Fix the broken RejuvTimeClip overlay effect and consolidate duplicated player cache logic while maintaining all existing performance optimizations and visual behavior.

### Concrete Deliverables
- `rejuvnbufftimer.js`: Bug fix at lines 274-293, cache extraction, bounds check
- `AGENTS.md`: Updated to reflect changes

### Definition of Done
- [ ] Build command exits with code 0
- [ ] `UI.rLabClip.text = t` appears exactly ONCE inside the guard block
- [ ] `_lastRejuvText = t` appears exactly ONCE in rejuv timer section
- [ ] No duplicate `if (t !== _lastRejuvText)` blocks remain
- [ ] Player cache refresh logic appears in ONE location only

### Must Have
- RejuvTimeClip text synchronization restored (fixes visual clip effect)
- All existing DOM write guards preserved (`_last*` pattern)
- All existing `?.IsValid?.()` safety checks preserved
- Build compiles successfully
- No regression in polling intervals

### Must NOT Have (Guardrails)
- ❌ New features (sound effects, new visual indicators)
- ❌ State machine architecture changes
- ❌ ES6 class/module conversions (Panorama compatibility unknown)
- ❌ Configuration options
- ❌ File splitting (build system doesn't support)
- ❌ Comprehensive logging (was explicitly removed for production)
- ❌ CSS file modifications
- ❌ XML structure changes
- ❌ Polling interval changes
- ❌ Try-catch scope narrowing (intentional safety pattern)

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> This is NOT conditional — it applies to EVERY task, regardless of test strategy.

### Test Decision
- **Infrastructure exists**: NO (Source 2 Panorama - no unit test framework)
- **Automated tests**: None (Agent-Executed QA only)
- **Framework**: Source 2 ResourceCompiler for builds

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| Build Success | Bash | Run compiler, check exit code 0 |
| Code Pattern | Grep/AST | Search for specific patterns, count occurrences |
| File Existence | Bash (ls) | Verify compiled output exists |
| No Regressions | Grep | Count of safety patterns ≥ baseline |

---

## Execution Strategy

### Sequential Execution (No Parallelism)

```
Task 1: Fix Dead Code Bug
    ↓
Task 2: Extract Player Cache Refresh
    ↓
Task 3: Add SEQ Bounds Check
    ↓
Task 4: Update AGENTS.md

Critical Path: All tasks sequential - each depends on previous
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3, 4 | None |
| 2 | 1 | 3, 4 | None |
| 3 | 2 | 4 | None |
| 4 | 3 | None | None |

---

## TODOs

- [ ] 1. Fix RejuvTimeClip Dead Code Bug (Critical)

  **What to do**:
  - Remove duplicate `if (t !== _lastRejuvText)` block at lines 287-293
  - Move `UI.rLabClip.text = t` into the existing guard block at lines 274-277
  - Follow the working buff timer pattern (lines 326-331) as reference
  
  **Current broken code (lines 274-293)**:
  ```javascript
  if (t !== _lastRejuvText) {
    UI.rLab.text = t;
    _lastRejuvText = t;    // ← Sets it here
  }
  
  // ... clip calculation ...
  
  if (t !== _lastRejuvText) {    // ← DEAD CODE - always false!
    UI.rLab.text = t;
    if (UI.rLabClip?.IsValid?.()) {
      UI.rLabClip.text = t;      // ← NEVER EXECUTES
    }
    _lastRejuvText = t;
  }
  ```
  
  **Fixed code should match buff timer pattern (lines 326-331)**:
  ```javascript
  if (t !== _lastRejuvText) {
    UI.rLab.text = t;
    if (UI.rLabClip?.IsValid?.()) {
      UI.rLabClip.text = t;      // ← Synced INSIDE guard
    }
    _lastRejuvText = t;
  }
  ```

  **Must NOT do**:
  - Do not change clip calculation logic (lines 279-285)
  - Do not modify the clip style assignment (lines 295-298)
  - Do not touch any other timer logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-location bug fix with clear before/after pattern
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commit for the fix

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (first task)
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `rejuvnbufftimer.js:326-331` - Working buff timer pattern with correct clip text sync

  **Bug Location**:
  - `rejuvnbufftimer.js:274-298` - Dead code bug location (lines 287-293 are the dead block to remove)

  **Acceptance Criteria**:

  **Static Analysis (grep verification):**
  - [ ] `grep -c "UI.rLabClip.text = t" rejuvnbufftimer.js` returns exactly `1`
  - [ ] `grep -c "_lastRejuvText = t" rejuvnbufftimer.js` returns exactly `1` (in rejuv section, ~2 total with buff)
  - [ ] The dead `if (t !== _lastRejuvText)` block at lines 287-293 no longer exists

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Verify dead code block removed
    Tool: Bash (grep)
    Preconditions: Edit completed
    Steps:
      1. grep -n "if (t !== _lastRejuvText)" rejuvnbufftimer.js
      2. Count occurrences in lines 260-300 range
      3. Assert: exactly 1 occurrence (the fixed guard block)
    Expected Result: Single guard block remains
    Evidence: grep output captured

  Scenario: Verify clip text sync added to guard
    Tool: Bash (grep -A5)
    Preconditions: Edit completed
    Steps:
      1. grep -A5 "if (t !== _lastRejuvText)" rejuvnbufftimer.js | head -20
      2. Assert: "UI.rLabClip.text = t" appears within 5 lines after guard
    Expected Result: Clip text sync inside guard block
    Evidence: grep output captured

  Scenario: Build succeeds after fix
    Tool: Bash
    Preconditions: Edit completed
    Steps:
      1. Run: "F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
      2. Assert: Exit code 0
      3. Assert: File exists: buff_timer_virgin_compiled/panorama/scripts/rejuvnbufftimer.vjs_c
    Expected Result: Compilation successful
    Evidence: Exit code + file existence check
  ```

  **Commit**: YES
  - Message: `fix(buff_timer): restore RejuvTimeClip text sync (dead code removal)`
  - Files: `panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: Build command succeeds

---

- [ ] 2. Extract Shared Player Cache Refresh Logic

  **What to do**:
  - Create a helper function `ensurePlayerCache(rn)` that handles cache TTL check and refresh
  - Replace duplicate cache logic in `checkEnemyLinger()` (lines ~904-910) and `getPlayersNearPowerup()` (lines ~975-981)
  - Keep iteration logic separate in each function (different requirements)

  **Current duplication pattern** (appears in both functions):
  ```javascript
  if (!_playerCache || rn - _playerCacheTs > 800) {
    const mm = findMinimap();
    if (!mm?.IsValid?.()) { _playerCache = []; }
    else {
      try {
        _playerCache = mm.FindChildrenWithClassTraverse("map_button")
          .filter(function(b) { return b?.IsValid?.() && b.BHasClass("player_button"); });
      } catch { _playerCache = []; }
    }
    _playerCacheTs = rn;
  }
  ```

  **Extract to**:
  ```javascript
  function ensurePlayerCache(rn) {
    if (_playerCache && rn - _playerCacheTs <= 800) return;
    const mm = findMinimap();
    if (!mm?.IsValid?.()) { _playerCache = []; _playerCacheTs = rn; return; }
    try {
      _playerCache = mm.FindChildrenWithClassTraverse("map_button")
        .filter(function(b) { return b?.IsValid?.() && b.BHasClass("player_button"); });
    } catch { _playerCache = []; }
    _playerCacheTs = rn;
  }
  ```

  **Then replace in each function**:
  ```javascript
  function checkEnemyLinger(rn) {
    ensurePlayerCache(rn);
    // ... rest of enemy-specific iteration logic (unchanged) ...
  }
  
  function getPlayersNearPowerup(rn, ...) {
    ensurePlayerCache(rn);
    // ... rest of proximity-specific iteration logic (unchanged) ...
  }
  ```

  **Must NOT do**:
  - Do not merge the iteration loops (different requirements)
  - Do not change team classification caching
  - Do not modify player state management
  - Do not change the 800ms TTL value

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward extract-and-replace refactor
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commit for the refactor

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: Task 1

  **References**:

  **Duplication Locations**:
  - `rejuvnbufftimer.js:904-910` - Cache logic in checkEnemyLinger
  - `rejuvnbufftimer.js:975-981` - Cache logic in getPlayersNearPowerup

  **Acceptance Criteria**:

  **Static Analysis:**
  - [ ] `ensurePlayerCache` function exists (grep confirms)
  - [ ] Cache refresh logic appears exactly ONCE (in the new function)
  - [ ] Both `checkEnemyLinger` and `getPlayersNearPowerup` call `ensurePlayerCache(rn)`

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Verify ensurePlayerCache function created
    Tool: Bash (grep)
    Preconditions: Edit completed
    Steps:
      1. grep -n "function ensurePlayerCache" rejuvnbufftimer.js
      2. Assert: exactly 1 match
    Expected Result: Function exists
    Evidence: grep output

  Scenario: Verify duplication removed
    Tool: Bash (grep)
    Preconditions: Edit completed
    Steps:
      1. grep -c "FindChildrenWithClassTraverse.*map_button" rejuvnbufftimer.js
      2. Assert: exactly 1 occurrence (inside ensurePlayerCache only)
    Expected Result: No duplication
    Evidence: grep count

  Scenario: Build succeeds after refactor
    Tool: Bash
    Preconditions: Edit completed
    Steps:
      1. Run build command
      2. Assert: Exit code 0
    Expected Result: Compilation successful
    Evidence: Exit code
  ```

  **Commit**: YES
  - Message: `refactor(buff_timer): extract ensurePlayerCache() to eliminate duplication`
  - Files: `panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: Build command succeeds

---

- [ ] 3. Add SEQ Array Bounds Safety Check

  **What to do**:
  - Add bounds validation before accessing `SEQ[idx]` at line 266
  - Clamp `idx` to valid range to prevent undefined access
  - This is defensive coding against potential corruption

  **Current code (line 266)**:
  ```javascript
  const rem = Math.max(0, SEQ[idx].d - (now - phaseStart));
  ```

  **Add safety check before**:
  ```javascript
  if (idx < 0 || idx >= SEQ.length) idx = 0;  // Safety clamp
  const rem = Math.max(0, SEQ[idx].d - (now - phaseStart));
  ```

  **Must NOT do**:
  - Do not change SEQ array values
  - Do not modify phase transition logic
  - Do not add logging (production code)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line defensive check
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commit

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 4
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Location**:
  - `rejuvnbufftimer.js:266` - SEQ access without bounds check
  - `rejuvnbufftimer.js:~15-18` - SEQ array definition (4 elements, indices 0-3)

  **Acceptance Criteria**:

  **Static Analysis:**
  - [ ] Bounds check exists before SEQ[idx] access
  - [ ] Check clamps to valid range (0 to SEQ.length-1)

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Verify bounds check added
    Tool: Bash (grep)
    Preconditions: Edit completed
    Steps:
      1. grep -B2 "SEQ\[idx\].d" rejuvnbufftimer.js | head -5
      2. Assert: bounds check appears in preceding lines
    Expected Result: Safety check present
    Evidence: grep output

  Scenario: Build succeeds
    Tool: Bash
    Preconditions: Edit completed
    Steps:
      1. Run build command
      2. Assert: Exit code 0
    Expected Result: Compilation successful
    Evidence: Exit code
  ```

  **Commit**: YES
  - Message: `fix(buff_timer): add SEQ bounds check for stability`
  - Files: `panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: Build command succeeds

---

- [ ] 4. Update AGENTS.md Documentation

  **What to do**:
  - Document the `ensurePlayerCache()` function in the caching patterns section
  - Update version note if applicable
  - Remove any outdated references to duplicate cache logic

  **Must NOT do**:
  - Do not change documented behavior
  - Do not add debug instructions
  - Do not modify anti-patterns section

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation update
  - **Skills**: []
    - No special skills needed for markdown

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final task)
  - **Blocks**: None
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Location**:
  - `buff_timer_virgin/AGENTS.md` - Documentation file to update

  **Acceptance Criteria**:

  - [ ] `ensurePlayerCache` mentioned in performance optimizations section
  - [ ] Dead code bug fix noted
  - [ ] No broken markdown formatting

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Verify documentation updated
    Tool: Bash (grep)
    Preconditions: Edit completed
    Steps:
      1. grep "ensurePlayerCache" AGENTS.md
      2. Assert: function documented
    Expected Result: Documentation exists
    Evidence: grep output
  ```

  **Commit**: YES (groups with Task 3 if close together)
  - Message: `docs(buff_timer): update AGENTS.md with cache extraction`
  - Files: `AGENTS.md`
  - Pre-commit: None (markdown)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `fix(buff_timer): restore RejuvTimeClip text sync` | rejuvnbufftimer.js | Build + grep |
| 2 | `refactor(buff_timer): extract ensurePlayerCache()` | rejuvnbufftimer.js | Build + grep |
| 3 | `fix(buff_timer): add SEQ bounds check` | rejuvnbufftimer.js | Build + grep |
| 4 | `docs(buff_timer): update AGENTS.md` | AGENTS.md | grep |

---

## Success Criteria

### Verification Commands
```powershell
# Build succeeds
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
# Expected: Exit code 0

# Dead code removed
grep -c "if (t !== _lastRejuvText)" rejuvnbufftimer.js
# Expected: 1 (in rejuv section) + 1 (in buff section) = 2 total

# Clip sync inside guard
grep -A5 "if (t !== _lastRejuvText)" rejuvnbufftimer.js | grep "rLabClip.text"
# Expected: 1 match

# Cache function exists
grep "function ensurePlayerCache" rejuvnbufftimer.js
# Expected: 1 match

# Bounds check exists  
grep -B1 "SEQ\[idx\].d" rejuvnbufftimer.js | grep -E "(idx.*<|idx.*>=|idx.*SEQ.length)"
# Expected: 1 match
```

### Final Checklist
- [ ] RejuvTimeClip overlay effect restored (text syncs with main label)
- [ ] Player cache refresh logic consolidated (no duplication)
- [ ] SEQ array access is bounds-safe
- [ ] All existing DOM write guards preserved
- [ ] All existing `?.IsValid?.()` checks preserved
- [ ] Build compiles successfully
- [ ] No visual regressions (all effects maintained)
- [ ] AGENTS.md updated
