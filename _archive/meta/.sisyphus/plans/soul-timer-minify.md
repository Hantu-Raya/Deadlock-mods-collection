# Soul Timer Light Minification

## Context

### Original Request
User requested a light minified version of the soul_timer script for performance and reduced file size.

### Interview Summary
**Key Discussions**:
- Light minification: Remove comments/whitespace only, keep readable variable names
- Test workflow: Create `min_soul_timer/` folder first to verify the script works
- If working: Replace the main `soul_timer/panorama/scripts/soul_timer.js` with minified version
- Cleanup: Delete test folder after successful migration

**Research Findings**:
- Current file: 317 lines, ~10KB
- File already has performance optimizations (v4.2)
- Build command: `sr2compiler "path\to\mod"`

---

## Work Objectives

### Core Objective
Create a light-minified version of `soul_timer.js` that removes comments and whitespace while preserving readability, then migrate it to production after verification.

### Concrete Deliverables
- `min_soul_timer/` test folder with minified script
- Verified working minified script in main `soul_timer/` folder
- Test folder cleaned up

### Definition of Done
- [x] `soul_timer.js` in main folder is minified (no comments, no empty lines, minimal whitespace)
- [x] Compiled output works in-game (timer displays correctly)
- [x] `min_soul_timer/` folder is deleted

### Must Have
- All functionality preserved (drain calculation, color states, watchdog, etc.)
- Variable names remain readable (no mangling)
- File compiles without errors

### Must NOT Have (Guardrails)
- Do NOT mangle/shorten variable names
- Do NOT change logic or functionality
- Do NOT remove the IIFE wrapper `(()=>{...})()`
- Do NOT remove string literals or template parts

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (manual verification via in-game testing)
- **User wants tests**: Manual-only
- **Framework**: None

### Manual QA

Each TODO includes verification via:
- Compile check (sr2compiler runs without error)
- In-game verification (timer displays and functions correctly)

---

## Task Flow

```
Task 1 (Create test folder) → Task 2 (Minify script) → Task 3 (Compile & Test) → Task 4 (Migrate to main) → Task 5 (Cleanup)
```

## Parallelization

All tasks are sequential (each depends on previous).

---

## TODOs

- [x] 1. Create test folder structure

  **What to do**:
  - Create `min_soul_timer/` directory
  - Copy the entire `soul_timer/` structure to `min_soul_timer/`
  - This includes: `panorama/scripts/`, `panorama/styles/`, `panorama/layout/`

  **Must NOT do**:
  - Do not modify any files yet, just copy

  **Parallelizable**: NO (first task)

  **References**:
  - `soul_timer/` - Source folder structure to copy

  **Acceptance Criteria**:
  - [ ] `min_soul_timer/panorama/scripts/soul_timer.js` exists and matches original
  - [ ] All other files from `soul_timer/` are present in `min_soul_timer/`

  **Commit**: NO (temporary test folder)

---

- [x] 2. Apply light minification to the script

  **What to do**:
  - Edit `min_soul_timer/panorama/scripts/soul_timer.js`
  - Remove all single-line comments (`// ...`)
  - Remove all multi-line comments (`/* ... */`) except license if present
  - Remove all empty lines
  - Remove trailing whitespace
  - Collapse multiple spaces to single space where safe
  - Keep variable names intact (no mangling)
  - Keep the IIFE wrapper and "use strict"

  **Must NOT do**:
  - Do NOT rename variables
  - Do NOT change any logic
  - Do NOT remove the version comment header (first comment block) - actually, user wants light minification so remove comments, but preserve the IIFE structure

  **Parallelizable**: NO (depends on 1)

  **References**:
  - `soul_timer/panorama/scripts/soul_timer.js:1-317` - Original script with comments to remove

  **Pattern to follow**:
  ```javascript
  // BEFORE (with comments):
  const PCT_DRAIN = 0.005; // percentage
  
  // AFTER (minified):
  const PCT_DRAIN = 0.005;
  ```

  **Acceptance Criteria**:
  - [ ] No `//` comments remain in file (except inside strings)
  - [ ] No `/* */` comments remain in file
  - [ ] No empty lines remain
  - [ ] File size reduced by ~30-40%
  - [ ] All variable names unchanged
  - [ ] IIFE wrapper preserved: `(()=>{"use strict";...})()`

  **Commit**: NO (temporary test folder)

---

- [x] 3. Compile and test the minified script

  **What to do**:
  - Run sr2compiler on `min_soul_timer/` folder
  - Verify compilation succeeds (no errors)
  - Launch Deadlock with the test mod
  - Verify timer displays correctly in-game

  **Must NOT do**:
  - Do NOT proceed to task 4 if compilation fails or timer doesn't work

  **Parallelizable**: NO (depends on 2)

  **References**:
  - `sr2compiler/New folder.exe` - Compiler executable
  - Build command: `"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\min_soul_timer"`

  **Acceptance Criteria**:
  - [ ] Compile command: `"sr2compiler/New folder.exe" "path\to\min_soul_timer"`
  - [ ] Expected: Compilation completes without errors
  - [ ] In-game: Soul timer label appears when you have unsecured souls
  - [ ] In-game: Timer counts down correctly
  - [ ] In-game: Color changes work (white < 500, yellow 500-1000, red >= 1000)

  **Commit**: NO (temporary test folder)

---

- [x] 4. Migrate minified script to main folder

  **What to do**:
  - Copy `min_soul_timer/panorama/scripts/soul_timer.js` to `soul_timer/panorama/scripts/soul_timer.js`
  - This overwrites the original with the minified version
  - Recompile the main `soul_timer/` folder

  **Must NOT do**:
  - Do NOT skip this if task 3 verification failed

  **Parallelizable**: NO (depends on 3 success)

  **References**:
  - `min_soul_timer/panorama/scripts/soul_timer.js` - Source (minified)
  - `soul_timer/panorama/scripts/soul_timer.js` - Destination (to overwrite)

  **Acceptance Criteria**:
  - [ ] `soul_timer/panorama/scripts/soul_timer.js` is now the minified version
  - [ ] `sr2compiler` runs on `soul_timer/` without errors
  - [ ] Quick in-game smoke test confirms it still works

  **Commit**: YES
  - Message: `perf(soul_timer): minify script to reduce file size`
  - Files: `soul_timer/panorama/scripts/soul_timer.js`
  - Pre-commit: `sr2compiler "soul_timer"` completes without error

---

- [x] 5. Delete test folder

  **What to do**:
  - Remove `min_soul_timer/` directory and all contents
  - Remove `min_soul_timer_compiled/` if it exists

  **Must NOT do**:
  - Do NOT delete before task 4 is verified working

  **Parallelizable**: NO (depends on 4)

  **References**:
  - `min_soul_timer/` - Test folder to delete
  - `min_soul_timer_compiled/` - Compiled output to delete

  **Acceptance Criteria**:
  - [ ] `min_soul_timer/` folder no longer exists
  - [ ] `min_soul_timer_compiled/` folder no longer exists (if it was created)
  - [ ] Only `soul_timer/` and `soul_timer_compiled/` remain

  **Commit**: NO (cleanup, nothing to commit)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 4 | `perf(soul_timer): minify script to reduce file size` | `soul_timer/panorama/scripts/soul_timer.js` | sr2compiler success |

---

## Success Criteria

### Verification Commands
```powershell
# Compile check
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\soul_timer"
# Expected: No errors, compiled files in soul_timer_compiled/
```

### Final Checklist
- [x] `soul_timer.js` is minified (no comments, no empty lines)
- [x] Variable names are still readable
- [x] File compiles without errors
- [x] Timer works correctly in-game
- [x] Test folder `min_soul_timer/` is deleted
