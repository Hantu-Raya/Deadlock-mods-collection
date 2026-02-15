# AnitaUI Session Storage — Root Panel Approach

## TL;DR

> **Quick Summary**: Add session-level settings persistence to AnitaUI using root panel property attachment (`root._anitaSettings`). Settings survive panel reloads but reset on game restart.
> 
> **Deliverables**:
> - `AnitaStorage` IIFE module using `root._anitaSettings` backend
> - Hydration on mod registration (restore saved values)
> - Save on change via `emitUpdate()` hook
> - Reset to Defaults button per mod
> - Compiled mod via sr2compiler
> 
> **Estimated Effort**: Short
> **Parallel Execution**: NO — sequential (3 tasks)
> **Critical Path**: Task 1 → Task 2 → Task 3
> **Target**: `test/anita1/panorama/scripts/anita_ui_core.js`

---

## Context

### Original Request
User wants session-level storage for AnitaUI mod settings. Previous attempt used `$.persistentStorage` which is hard-disabled in Deadlock. This plan uses the proven root panel property pattern that AnitaUI already uses for its API (`root.AnitaUI = {...}`).

### Research Findings
- `$.persistentStorage`: Object exists, methods stripped — hard-disabled in Deadlock
- `GameUI.CustomUIConfig()`: Entire `GameUI` object missing in Deadlock (confirmed via apis.md + in-game test)
- `root.AnitaUI`: Already working — root panel properties persist across panel reloads
- Confirmed available APIs: `$.DispatchEvent`, `$.RegisterForUnhandledEvent`, `$.Schedule`, `$.CreatePanel`

### Metis Review
**Addressed Gaps**:
- Hydration guard to prevent save storms during initial value restore
- Schema versioning for forward compatibility
- Silent first-run hydration (no synthetic events)
- Write-through reset (immediate clear of stored values)

---

## Work Objectives

### Core Objective
Replace the broken `AnitaStorage` backend detection with a clean, simple root-panel property store that uses only confirmed-working Panorama APIs.

### Concrete Deliverables
- `AnitaStorage` IIFE in `test/anita1/panorama/scripts/anita_ui_core.js`
- Hydration in `registerMod()`
- Save hook in `emitUpdate()`
- Reset button in `renderModSettings()`
- Compiled output in `test/anita1_compiled/`

### Definition of Done
- [ ] `AnitaStorage.set(mod, key, val)` stores to `root._anitaSettings`
- [ ] `AnitaStorage.get(mod, key)` retrieves from `root._anitaSettings`
- [ ] Settings survive panel rebuild (same game session)
- [ ] Reset clears stored values and re-renders with defaults
- [ ] No `$.persistentStorage`, `GameUI`, or `localStorage` references in code
- [ ] Compiles without error via sr2compiler

### Must Have
- Root panel property backend (`root._anitaSettings`)
- Hydration guard flag to prevent save-during-restore loops
- Type preservation (booleans stay booleans, numbers stay numbers)
- Namespaced keys per mod (`modTitle` as namespace)
- Schema version key for forward compatibility

### Must NOT Have (Guardrails)
- NO exhaustive backend detection / fallback chains
- NO `$.persistentStorage`, `GameUI`, `localStorage` references
- NO file I/O or console command persistence
- NO new UI components beyond reset button
- NO changes to AnitaComponents, AnitaRenderer layout logic, or AnitaCore init flow
- NO modifications to files outside `test/anita1/`

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
> ALL verification executed by agent using tools. No "user opens game and checks."

### Test Decision
- **Infrastructure exists**: NO (Source 2 mod — no test framework)
- **Automated tests**: None (no runtime outside game engine)
- **Framework**: sr2compiler only

### Agent-Executed QA Scenarios (Primary Verification)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| Compilation | Bash (sr2compiler) | Run compiler, assert exit code 0 |
| Code correctness | Grep + Read | Verify patterns, no banned APIs |
| Structure | AST grep | Verify IIFE shape, function signatures |

---

## Execution Strategy

### Sequential Execution (3 Tasks)

```
Task 1: AnitaStorage IIFE (root panel backend)
  ↓
Task 2: Hook integration (hydrate + save + reset)
  ↓
Task 3: Compile & verify
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1 | None | 2 |
| 2 | 1 | 3 |
| 3 | 2 | None |

### Agent Dispatch Summary

| Task | Recommended Agent |
|------|-------------------|
| 1 | task(category="quick", load_skills=[], ...) |
| 2 | task(category="quick", load_skills=[], ...) |
| 3 | task(category="quick", load_skills=[], ...) |

---

## TODOs

- [ ] 1. Create AnitaStorage IIFE — Root Panel Backend

  **What to do**:
  - Add `AnitaStorage` IIFE after the `Logger` declaration (after line ~124) in `test/anita1/panorama/scripts/anita_ui_core.js`
  - The module must:
    - Use `root._anitaSettings = root._anitaSettings || {}` as the backing store
    - `root` is obtained via `findRoot($.GetContextPanel())` — the same function AnitaCore uses
    - Expose: `get(modTitle, settingId)`, `set(modTitle, settingId, value)`, `remove(modTitle, settingId)`, `removeAllForMod(modTitle)`, `getAll(modTitle)`
    - Namespace: `root._anitaSettings[modTitle][settingId] = value`
    - Include `_SCHEMA_VERSION = 1` constant for future migration
    - Include `_hydrating` flag (boolean) — when true, `set()` is a no-op (prevents save storms during hydration)
    - Include `beginHydration()` and `endHydration()` methods to toggle the flag
    - Type preservation: store values as-is (no serialization needed — root panel properties keep JS types)
    - Add `findRoot()` helper inline if not accessible from this scope, or reference the existing one from AnitaCore
  - IIFE pattern: `const AnitaStorage = (()=>{ ... return { get, set, remove, removeAllForMod, getAll, beginHydration, endHydration }; })();`
  - Add debug logging: `Logger.debug("[Storage] set", modTitle, settingId, value)` on writes

  **Must NOT do**:
  - Do NOT add any backend detection or fallback logic
  - Do NOT reference `$.persistentStorage`, `GameUI`, or `localStorage`
  - Do NOT add serialization/deserialization (root panel keeps native JS types)
  - Do NOT modify any existing functions

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`
    - Simple JS module insertion — no special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Task 1
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `test/anita1/panorama/scripts/anita_ui_core.js:1-87` — AnitaUILogger IIFE pattern (follow same IIFE structure)
  - `test/anita1/panorama/scripts/anita_ui_core.js:585` — `root.AnitaUI = {...}` (confirms root panel property attachment works)
  - `test/anita1/panorama/scripts/anita_ui_core.js:90-122` — CONFIG object structure (place new module after Logger at ~line 124)

  **WHY Each Reference Matters**:
  - Logger IIFE: Copy this exact IIFE pattern for AnitaStorage — same `const X = (()=>{...})();` shape
  - root.AnitaUI: Proves root panel property pattern works for persistent-across-reload data
  - CONFIG: Establishes insertion point — AnitaStorage goes between Logger and emitUpdate

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: AnitaStorage module exists with correct API surface
    Tool: Bash (grep)
    Preconditions: File exists at test/anita1/panorama/scripts/anita_ui_core.js
    Steps:
      1. Grep for "const AnitaStorage" in test/anita1/panorama/scripts/anita_ui_core.js
      2. Assert: exactly 1 match found
      3. Grep for "root._anitaSettings" in same file
      4. Assert: at least 1 match found
      5. Grep for "_SCHEMA_VERSION" in same file
      6. Assert: exactly 1 match found
      7. Grep for "beginHydration\|endHydration" in same file
      8. Assert: at least 2 matches found (both functions)
    Expected Result: All API surface elements present
    Failure Indicators: Missing function definitions, missing root property reference

  Scenario: No banned API references exist
    Tool: Bash (grep)
    Preconditions: File modified with AnitaStorage
    Steps:
      1. Grep for "persistentStorage\|PersistentStorage\|localStorage\|GameUI\|GameInterfaceAPI" in file
      2. Assert: 0 matches found
    Expected Result: No references to disabled/missing APIs
    Failure Indicators: Any match for banned API names
  ```

  **Commit**: YES
  - Message: `feat(anita1): add AnitaStorage IIFE with root panel backend`
  - Files: `test/anita1/panorama/scripts/anita_ui_core.js`

---

- [ ] 2. Hook Integration — Hydrate, Save, Reset

  **What to do**:
  - Modify THREE existing functions in `test/anita1/panorama/scripts/anita_ui_core.js`:

  **A. `emitUpdate()` — Add save-on-change** (~line 126-134):
  - After the existing `$.DispatchEvent` call, add: `AnitaStorage.set(modTitle, settingId, newValue);`
  - This is a single line addition inside the existing function

  **B. `registerMod()` — Add hydration** (~line 624):
  - After the mod config is pushed to `_mods` array and tab is added, call hydration:
    ```javascript
    AnitaStorage.beginHydration();
    const saved = AnitaStorage.getAll(config.title);
    if (saved) {
      for (const [settingId, value] of Object.entries(saved)) {
        const setting = config.settings.find(s => s.id === settingId);
        if (setting) setting.value = value;
      }
    }
    AnitaStorage.endHydration();
    ```
  - This restores saved values by overwriting default `setting.value` before any UI renders
  - The `beginHydration()`/`endHydration()` guards prevent the value changes from triggering saves

  **C. `renderModSettings()` — Add reset button** (~line 516):
  - After the settings are rendered (end of the settings loop), add a "Reset to Defaults" button:
    ```javascript
    const resetBtn = AnitaComponents.createButton(container, {
      label: "Reset to Defaults",
      callback: () => {
        AnitaStorage.removeAllForMod(mod.title);
        // Re-render with original defaults from mod config
        renderModSettings(mod);
      }
    });
    ```
  - The reset button must: clear stored values, then re-render the mod settings panel so UI reflects defaults
  - Position: at the bottom of the settings list, after all setting controls

  **Must NOT do**:
  - Do NOT modify AnitaComponents (createToggle/createStepper/etc.)
  - Do NOT change the event dispatch in emitUpdate (keep `$.DispatchEvent` call intact)
  - Do NOT add new events or event listeners
  - Do NOT restructure the existing function signatures
  - Do NOT add throttling/debouncing (not needed for in-memory root panel writes)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Task 2
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `test/anita1/panorama/scripts/anita_ui_core.js:126-134` — `emitUpdate()` function (add AnitaStorage.set call after $.DispatchEvent)
  - `test/anita1/panorama/scripts/anita_ui_core.js:624` — `registerMod()` function (add hydration after config push)
  - `test/anita1/panorama/scripts/anita_ui_core.js:516` — `renderModSettings()` function (add reset button at end)
  - `test/anita1/panorama/scripts/anita_ui_core.js:370-380` — `AnitaComponents.createButton()` (use this for reset button)

  **WHY Each Reference Matters**:
  - emitUpdate: This is THE save hook — every setting change flows through here
  - registerMod: This is THE hydration point — mods register once, hydrate once
  - renderModSettings: This builds the settings UI — add reset button here
  - createButton: Use the existing button component API, don't create custom DOM

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: emitUpdate calls AnitaStorage.set
    Tool: Bash (grep)
    Preconditions: Task 1 complete, AnitaStorage exists
    Steps:
      1. Read the emitUpdate function body
      2. Assert: contains "AnitaStorage.set" call after "$.DispatchEvent"
      3. Assert: AnitaStorage.set receives (modTitle, settingId, newValue) parameters
    Expected Result: Save hook integrated into emitUpdate
    Failure Indicators: Missing AnitaStorage.set call, wrong parameter order

  Scenario: registerMod hydrates settings with guard
    Tool: Bash (grep)
    Preconditions: Task 1 complete
    Steps:
      1. Read the registerMod function body
      2. Assert: contains "AnitaStorage.beginHydration()" call
      3. Assert: contains "AnitaStorage.getAll(" call
      4. Assert: contains "AnitaStorage.endHydration()" call
      5. Assert: beginHydration appears BEFORE getAll
      6. Assert: endHydration appears AFTER the hydration loop
    Expected Result: Hydration wrapped in guard flags
    Failure Indicators: Missing guards, wrong order, missing getAll

  Scenario: Reset button exists in renderModSettings
    Tool: Bash (grep)
    Preconditions: Task 1 complete
    Steps:
      1. Grep for "Reset to Defaults" in the file
      2. Assert: at least 1 match found
      3. Grep for "removeAllForMod" in the file
      4. Assert: at least 1 match found
      5. Verify removeAllForMod is called inside a button callback
    Expected Result: Reset button renders and calls storage clear
    Failure Indicators: Missing button, missing removeAllForMod call
  ```

  **Commit**: YES
  - Message: `feat(anita1): integrate storage hooks — hydrate, save, reset`
  - Files: `test/anita1/panorama/scripts/anita_ui_core.js`

---

- [ ] 3. Compile & Verify

  **What to do**:
  - Run the Source 2 resource compiler against `test/anita1/`:
    ```powershell
    & "F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\test\anita1"
    ```
  - Verify compiled output exists in `test/anita1_compiled/`
  - Verify no compilation errors in output
  - Do a final code review: grep for banned APIs, verify IIFE structure is intact

  **Must NOT do**:
  - Do NOT modify source files during this task
  - Do NOT compile any other mod directories

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Task 3 (final)
  - **Blocks**: None
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `AGENTS.md: BUILD COMMANDS` — Compile command format with sr2compiler path

  **WHY Each Reference Matters**:
  - Build command: Exact path to compiler and expected invocation pattern

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Compilation succeeds
    Tool: Bash (powershell)
    Preconditions: Tasks 1-2 complete, source files modified
    Steps:
      1. Run: & "F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\test\anita1"
      2. Assert: exit code 0
      3. Assert: compiled output directory exists (test/anita1_compiled/)
      4. Assert: .vjs_c file exists in compiled output
    Expected Result: Clean compilation with no errors
    Failure Indicators: Non-zero exit code, missing compiled files, error messages in output

  Scenario: Final code review — no banned APIs
    Tool: Bash (grep)
    Preconditions: Compilation passed
    Steps:
      1. Grep for "persistentStorage\|PersistentStorage\|localStorage\|GameUI\|GameInterfaceAPI" in test/anita1/panorama/scripts/anita_ui_core.js
      2. Assert: 0 matches
      3. Grep for "AnitaStorage" in same file
      4. Assert: at least 5 matches (module def + get/set/remove calls)
      5. Grep for "root._anitaSettings" in same file
      6. Assert: at least 1 match
    Expected Result: Clean code with only root panel storage, no legacy references
    Failure Indicators: Any banned API reference found
  ```

  **Commit**: YES
  - Message: `build(anita1): compile session storage mod`
  - Files: `test/anita1_compiled/`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(anita1): add AnitaStorage IIFE with root panel backend` | `test/anita1/panorama/scripts/anita_ui_core.js` | grep for API surface |
| 2 | `feat(anita1): integrate storage hooks — hydrate, save, reset` | `test/anita1/panorama/scripts/anita_ui_core.js` | grep for hook integration |
| 3 | `build(anita1): compile session storage mod` | `test/anita1_compiled/` | compiler exit code 0 |

---

## Success Criteria

### Verification Commands
```powershell
# Compile
& "F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\test\anita1"
# Expected: exit code 0, compiled files in test/anita1_compiled/

# No banned APIs
Select-String -Path "test\anita1\panorama\scripts\anita_ui_core.js" -Pattern "persistentStorage|PersistentStorage|localStorage|GameUI|GameInterfaceAPI"
# Expected: no matches

# Storage module present
Select-String -Path "test\anita1\panorama\scripts\anita_ui_core.js" -Pattern "AnitaStorage"
# Expected: 5+ matches
```

### Final Checklist
- [ ] AnitaStorage IIFE with root._anitaSettings backend
- [ ] Hydration guard (beginHydration/endHydration)
- [ ] Save on emitUpdate
- [ ] Reset button in renderModSettings
- [ ] Schema version constant
- [ ] No banned API references
- [ ] Compiles cleanly
