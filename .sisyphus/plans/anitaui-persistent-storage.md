# AnitaUI Persistent Storage for Settings

## TL;DR

> **Quick Summary**: Add `$.persistentStorage`-backed persistence to AnitaUI so user-configured mod settings survive game restarts, with graceful in-memory fallback if the API is unavailable in Deadlock.
> 
> **Deliverables**:
> - Storage abstraction layer in `anita_ui_core.js` with runtime detection
> - Auto-load saved values on mod registration, auto-save on setting change
> - Type-safe hydration with validation/coercion per setting type
> - "Reset to Defaults" mechanism per mod
> - Compile and verify
> 
> **Estimated Effort**: Short (single file, ~100-150 lines added)
> **Parallel Execution**: NO — sequential (single file, each task builds on prior)
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request
Add persistent storage to AnitaUI so configured settings don't reset on game restart.

### Research Findings
- `$.persistentStorage` is a Source 2 Panorama KV store: `setItem(key, value)` / `getItem(key)`
- Confirmed in production use by Momentum Mod (issue #1580)
- Debug commands: `dump_panorama_persistent_storage`, `wipe_panorama_persistent_storage`
- **NOT confirmed in Deadlock** — requires runtime detection with graceful fallback
- Alternative (ConVar) explicitly excluded from this scope

### Metis Review — Gaps Addressed
| Gap | Resolution |
|-----|-----------|
| Type coercion (e.g. `"false"` string as truthy) | Strict parser per type in hydration |
| Schema drift (setting definition changes between versions) | Validate on load, auto-heal to default |
| Reset scope ambiguity | Per-mod reset (clear that mod's keys only) |
| `persist: false` opt-out | Always-on for simplicity; no opt-out this iteration |
| ConVar fallback | Explicitly OUT of scope |
| modTitle uniqueness | Assume stable; sanitize for key safety |
| Storage API intermittent failures | try-catch every get/set/remove call |

---

## Work Objectives

### Core Objective
Persist AnitaUI mod settings across game sessions using `$.persistentStorage` with safe fallback.

### Concrete Deliverables
- Modified `anitaui/panorama/scripts/anita_ui_core.js` with persistence layer
- Compiled output via sr2compiler

### Definition of Done
- [ ] Settings saved on change survive simulated re-registration
- [ ] Invalid/stale persisted data auto-heals to defaults
- [ ] No errors when `$.persistentStorage` is unavailable
- [ ] Compile succeeds with exit code 0

### Must Have
- Runtime detection of `$.persistentStorage`
- Type-safe load/save for all 4 setting types (toggle, stepper, cycler, colorpicker)
- Validation on load with fallback to `defaultValue`
- Reset-to-defaults per mod
- Zero breaking changes to existing registration/event API

### Must NOT Have (Guardrails)
- ❌ ConVar fallback — out of scope
- ❌ Cross-file changes — `anita_ui_core.js` only
- ❌ New UI panels/screens for reset UX — use existing AnitaUI button component
- ❌ Storage versioning/migration framework — over-engineering
- ❌ `persist: false` opt-out per setting — keep simple, always persist
- ❌ Changes to event bus contract or registration API shape
- ❌ New logging/telemetry infrastructure

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (Source 2 Panorama mod, no test framework)
- **Automated tests**: NO
- **Framework**: None — sr2compiler build verification + in-game QA

### Agent-Executed QA Scenarios (PRIMARY verification)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| Build | Bash (sr2compiler) | Run compiler, assert exit code 0 |
| Code correctness | Bash (grep/read) | Verify code patterns, no syntax errors |
| In-game behavior | Manual (user) | Launch with `-dev -tools`, F7 console |

> Note: Panorama JS runs inside Source 2 engine only. Agent verification is limited to build success and code structure validation. In-game verification requires user to test with `-dev -tools`.

---

## Execution Strategy

### Sequential Execution (Single File)

```
Task 1: Storage abstraction layer
  ↓
Task 2: Load on registration (hydration)
  ↓
Task 3: Save on change (persist)
  ↓
Task 4: Reset to defaults
  ↓
Task 5: Compile and verify
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1 | None | 2, 3, 4 |
| 2 | 1 | 3 |
| 3 | 2 | 4 |
| 4 | 3 | 5 |
| 5 | 4 | None (final) |

---

## TODOs

- [ ] 1. Add Storage Abstraction Layer

  **What to do**:
  - Create a `AnitaStorage` object (or similar) inside the main IIFE, after `CONFIG` and before `AnitaComponents`
  - Runtime detection: check `$ && $.persistentStorage && typeof $.persistentStorage.setItem === "function"`
  - Expose methods:
    - `available()` → boolean (is persistence supported)
    - `get(modTitle, settingId)` → raw string or null
    - `set(modTitle, settingId, value)` → void (JSON.stringify before storing)
    - `remove(modTitle, settingId)` → void
    - `removeAllForMod(modTitle)` → void (clear all keys with prefix)
    - `makeKey(modTitle, settingId)` → string (sanitized key: `anitaui_{sanitized_title}_{id}`)
  - Key sanitization: replace non-alphanumeric chars with `_`, lowercase
  - Every `get`/`set`/`remove` wrapped in try-catch (return null/no-op on failure)
  - Log availability on init: `[AnitaUI] Storage: persistent` or `[AnitaUI] Storage: in-memory only`

  **Must NOT do**:
  - Don't add ConVar fallback
  - Don't change any existing code yet — this is additive only

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`
    - No special skills needed — straightforward JS addition to existing file

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `anitaui/panorama/scripts/anita_ui_core.js` lines 93-122 — `CONFIG` object pattern to follow for the new `AnitaStorage` object placement and style
  - `anitaui/panorama/scripts/anita_ui_core.js` lines 1-87 — `AnitaUILogger` IIFE pattern for error handling style

  **API References**:
  - `$.persistentStorage.setItem(key, value)` — Source 2 Panorama KV store (string keys, string values)
  - `$.persistentStorage.getItem(key)` — returns string or null
  - Momentum Mod reference: uses same API in production

  **Acceptance Criteria**:
  - [ ] `AnitaStorage` object exists with `available`, `get`, `set`, `remove`, `removeAllForMod`, `makeKey` methods
  - [ ] Detection probe: `$ && $.persistentStorage && typeof $.persistentStorage.setItem === "function"`
  - [ ] All public methods wrapped in try-catch
  - [ ] Key format: `anitaui_{sanitized_modTitle}_{settingId}`
  - [ ] No syntax errors (verified by sr2compiler in Task 5)

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Verify storage abstraction code structure
    Tool: Bash (grep/read)
    Steps:
      1. Read anita_ui_core.js
      2. Assert: AnitaStorage object defined with all 6 methods
      3. Assert: try-catch wrapping on get/set/remove
      4. Assert: $.persistentStorage detection probe present
      5. Assert: makeKey produces sanitized key format
    Expected Result: All methods present, properly guarded
  ```

  **Commit**: YES
  - Message: `feat(anitaui): add persistent storage abstraction layer`
  - Files: `anitaui/panorama/scripts/anita_ui_core.js`

---

- [ ] 2. Hydrate Settings on Mod Registration

  **What to do**:
  - In `registerMod()` (line ~624), BEFORE pushing to `registeredMods` and rendering:
    - Loop through `config.elements[]`
    - For each element with a `type` and `id`, call `AnitaStorage.get(config.title, element.id)`
    - If value exists, parse and validate by type:
      - **toggle**: `val === "true"` → `true`, `val === "false"` → `false`, else → `defaultValue`
      - **stepper**: `parseFloat(val)`, check `isFinite()`, clamp to `min`/`max` if defined, else → `defaultValue`
      - **cycler**: `parseInt(val, 10)`, check `>= 0 && < options.length`, else → `defaultValue`
      - **colorpicker**: validate hex regex `/^#[0-9A-Fa-f]{6}$/`, normalize to uppercase `#RRGGBB`, else → `defaultValue`
    - Set validated value into `element.currentValue`
    - If loaded value was invalid, overwrite storage with default (auto-heal)
  - If `AnitaStorage.available()` is false, skip entirely (existing behavior preserved)

  **Must NOT do**:
  - Don't change the `registerMod()` function signature
  - Don't change event emission behavior
  - Don't add new parameters to config shape

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `anita_ui_core.js` lines 624-650 — `registerMod()` function where hydration loop should be inserted
  - `anita_ui_core.js` line 154 — Toggle currentValue/defaultValue pattern: `let isOn = (config.currentValue !== undefined) ? config.currentValue : (config.defaultValue || false)`
  - `anita_ui_core.js` line 187 — Stepper pattern
  - `anita_ui_core.js` line 265 — Cycler pattern (index into options array)
  - `anita_ui_core.js` line 300 — Colorpicker pattern

  **Acceptance Criteria**:
  - [ ] Hydration loop exists in `registerMod()` before UI creation
  - [ ] All 4 types have explicit validation: toggle→boolean, stepper→clamped number, cycler→bounded index, color→hex regex
  - [ ] Invalid persisted values auto-heal (overwrite storage with default)
  - [ ] Gracefully skips when `AnitaStorage.available()` is false
  - [ ] No changes to `registerMod()` function signature or return value

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Verify hydration code in registerMod
    Tool: Bash (grep/read)
    Steps:
      1. Read registerMod function
      2. Assert: AnitaStorage.get() called for each element
      3. Assert: Type-specific validation for toggle/stepper/cycler/colorpicker
      4. Assert: Fallback to defaultValue on invalid data
      5. Assert: AnitaStorage.set() called to auto-heal invalid values
    Expected Result: Complete hydration with validation before rendering
  ```

  **Commit**: YES (group with Task 1)
  - Message: `feat(anitaui): hydrate settings from persistent storage on registration`
  - Files: `anitaui/panorama/scripts/anita_ui_core.js`

---

- [ ] 3. Persist Settings on Change

  **What to do**:
  - In `emitUpdate()` (lines 126-134), AFTER setting `config.currentValue` and dispatching event:
    - Call `AnitaStorage.set(modTitle, settingId, value)`
    - Value is already the correct JS type at this point (set by component onChange)
    - `AnitaStorage.set()` handles JSON.stringify internally
  - This is a 1-2 line addition to `emitUpdate()`

  **Must NOT do**:
  - Don't change the event dispatch behavior
  - Don't add debouncing (storage writes are lightweight)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `anita_ui_core.js` lines 126-134 — `emitUpdate()` function, the single mutation point for all setting changes

  **Acceptance Criteria**:
  - [ ] `AnitaStorage.set()` call present in `emitUpdate()`
  - [ ] Called AFTER `config.currentValue` assignment and event dispatch
  - [ ] No change to existing emitUpdate behavior (event still fires)

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Verify save-on-change in emitUpdate
    Tool: Bash (grep/read)
    Steps:
      1. Read emitUpdate function
      2. Assert: AnitaStorage.set(modTitle, settingId, value) call present
      3. Assert: Existing ClientUI_FireOutput dispatch unchanged
    Expected Result: Persistence call added without breaking event flow
  ```

  **Commit**: YES (group with Task 2)
  - Message: `feat(anitaui): persist settings on change via emitUpdate`
  - Files: `anitaui/panorama/scripts/anita_ui_core.js`

---

- [ ] 4. Add Reset to Defaults per Mod

  **What to do**:
  - Add a `resetMod(modTitle)` function to `AnitaCore` or as a standalone:
    - Find the mod in `registeredMods` by title
    - For each element: set `element.currentValue = element.defaultValue`
    - Call `AnitaStorage.removeAllForMod(modTitle)` to clear persisted keys
    - Re-emit update events for each setting so UI refreshes
    - Re-render the mod's content panel
  - In `AnitaRenderer`, when rendering a mod's settings tab, add a "Reset to Defaults" button at the bottom using existing `AnitaComponents` button pattern
    - Button calls `resetMod(modTitle)`
    - Style with existing button classes (no new CSS needed — use existing action button styles)

  **Must NOT do**:
  - No new CSS classes — use existing `AnitaActionBtn` styles
  - No confirmation dialog — keep it simple (instant reset)
  - No global "reset all mods" option — per-mod only

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `anita_ui_core.js` lines 426-574 — `AnitaRenderer` for where to add reset button in tab content
  - `anita_ui_core.js` lines 136-424 — `AnitaComponents` button creation pattern (especially the `button` type around line 230+)
  - `anita_ui_core.js` lines 126-134 — `emitUpdate()` to re-dispatch after reset
  - `anita_ui.css` — existing `AnitaActionBtn` class for button styling

  **Acceptance Criteria**:
  - [ ] `resetMod(modTitle)` function exists
  - [ ] Resets all `element.currentValue` to `element.defaultValue`
  - [ ] Calls `AnitaStorage.removeAllForMod(modTitle)` to clear persisted data
  - [ ] Emits update events for each setting (so consuming mods react)
  - [ ] "Reset to Defaults" button rendered in each mod's settings panel
  - [ ] Button uses existing AnitaUI styling (no new CSS)
  - [ ] Re-renders mod content after reset

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Verify reset function and button
    Tool: Bash (grep/read)
    Steps:
      1. Read resetMod function
      2. Assert: Iterates elements, sets currentValue = defaultValue
      3. Assert: Calls AnitaStorage.removeAllForMod
      4. Assert: Emits update for each setting
      5. Assert: Reset button created in mod content rendering
    Expected Result: Complete reset flow with UI button
  ```

  **Commit**: YES (group with Tasks 1-3)
  - Message: `feat(anitaui): add reset-to-defaults with persistent storage clearing`
  - Files: `anitaui/panorama/scripts/anita_ui_core.js`

---

- [ ] 5. Compile and Final Verification

  **What to do**:
  - Run sr2compiler on the anitaui mod
  - Verify compiled output is generated
  - Final code review pass (grep for syntax issues, unclosed brackets)

  **Must NOT do**:
  - Don't modify code in this task — build only

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: None (final)
  - **Blocked By**: Task 4

  **References**:

  **Build Command**:
  - `"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\anitaui"`

  **Acceptance Criteria**:
  - [ ] sr2compiler exits with code 0
  - [ ] Compiled `.vjs_c` output exists in `anitaui_compiled/` (or equivalent output dir)
  - [ ] No syntax errors in compiler output

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Build succeeds
    Tool: Bash
    Steps:
      1. Run: "F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\anitaui"
      2. Assert: exit code 0
      3. Verify compiled output exists
    Expected Result: Clean build, no errors

  Scenario: No obvious code defects
    Tool: Bash (grep)
    Steps:
      1. Search for common JS issues: unmatched brackets, missing semicolons in critical spots
      2. Verify IIFE wrapper still intact
      3. Verify AnitaStorage object properly closed
    Expected Result: Clean code structure
  ```

  **Commit**: YES
  - Message: `build(anitaui): compile persistent storage changes`
  - Files: `anitaui_compiled/*`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1-4 (grouped) | `feat(anitaui): add persistent storage for settings` | `anita_ui_core.js` | Code review |
| 5 | `build(anitaui): compile persistent storage changes` | `anitaui_compiled/*` | sr2compiler exit 0 |

---

## Success Criteria

### Verification Commands
```powershell
# Build succeeds
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\anitaui"
# Expected: exit code 0, compiled output updated
```

### Final Checklist
- [ ] AnitaStorage abstraction with runtime detection
- [ ] Type-safe hydration for toggle/stepper/cycler/colorpicker
- [ ] Auto-save on emitUpdate()
- [ ] Auto-heal invalid persisted values
- [ ] Reset-to-defaults button per mod
- [ ] Graceful fallback when $.persistentStorage unavailable
- [ ] No changes to event bus contract or registration API
- [ ] No ConVar fallback code
- [ ] No cross-file changes
- [ ] Clean compile
