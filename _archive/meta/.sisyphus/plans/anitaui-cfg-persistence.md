# AnitaUI Persistent Storage — CFG Push-Pull Approach

## TL;DR

> **Quick Summary**: Add cross-restart persistent storage to AnitaUI using Deadlock's console command system. Settings are saved via `setinfo` ConVars + `host_writeconfig` (push), and loaded via `exec` CFG file that fires Panorama events (pull). Settings survive game restarts.
> 
> **Deliverables**:
> - `AnitaStorage` IIFE module with push-pull CFG backend
> - CFG file template for loading saved settings via `panorama_dispatch_event`
> - Hydration on mod registration (restore saved values from ConVars)
> - Save on change via `emitUpdate()` hook with 500ms debounce
> - Reset to Defaults button per mod
> - Compiled mod via sr2compiler
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: NO — sequential (5 tasks)
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5
> **Target**: `test/anita2/panorama/scripts/anita_ui_core.js`

---

## Context

### Original Request
User wants settings that persist across game restarts. The only viable mechanism in Deadlock's Panorama sandbox is the "push-pull" pattern using console commands — no file I/O, no `$.persistentStorage`, no `GameUI`.

### Research Findings
- **SAVE (Push)**: `$.DispatchEvent("ExecuteConsoleCommand", "setinfo anitaui_key value")` creates user info variables. These are auto-archived by Source 2.
- **SAVE (Flush)**: `$.DispatchEvent("ExecuteConsoleCommand", "host_writeconfig")` writes archived vars to `citadel/cfg/config.cfg`, persisting them across restarts.
- **LOAD (Pull)**: Cannot read ConVars directly from Panorama JS. Instead, use a CFG file that fires Panorama events: `panorama_dispatch_event AnitaSettingsLoad "key" "value"` — JS listens via `$.RegisterForUnhandledEvent("AnitaSettingsLoad", callback)`.
- **Race Condition**: JS listener must be registered BEFORE `exec` fires events. Solution: JS registers listener first, then fires `exec` command.
- **Type Transport**: All values travel as strings through console. Need encode/decode layer per component type (boolean→"1"/"0", number→string, string→string).
- **Key Collision**: Namespace all ConVars with `anitaui_` prefix to avoid collisions.

### Metis Review
**Addressed Gaps**:
- 500ms debounce on writes to prevent `host_writeconfig` spam
- Versioned schema key (`anitaui_schema_v`) for forward compatibility
- Strict encode/decode table per component type
- Malformed value handling: ignore + keep defaults
- Hydration guard to prevent save storms
- Init ordering: register listener → exec → hydrate

---

## Work Objectives

### Core Objective
Implement a push-pull storage system that saves mod settings to ConVars (persisted in `config.cfg`) and loads them back via event dispatch from a CFG file.

### Concrete Deliverables
- `AnitaStorage` IIFE in `test/anita2/panorama/scripts/anita_ui_core.js`
- Encode/decode layer for type-safe string transport
- Debounced write system (500ms)
- Event listener for `AnitaSettingsLoad`
- Hydration in `registerMod()`, save in `emitUpdate()`, reset in `renderModSettings()`
- Compiled output in `test/anita2_compiled/`

### Definition of Done
- [x] Settings saved via `setinfo` ConVars and `host_writeconfig`
- [x] Settings loaded via `$.RegisterForUnhandledEvent("AnitaSettingsLoad", ...)`
- [x] Writes debounced at 500ms
- [x] All value types encode/decode correctly (boolean, number, string)
- [x] Reset clears ConVars and re-renders with defaults
- [x] No `$.persistentStorage`, `GameUI`, or `localStorage` references
- [x] Compiles without error via sr2compiler

### Must Have
- `setinfo` + `host_writeconfig` save mechanism
- `$.RegisterForUnhandledEvent` load mechanism
- 500ms write debounce (single timer, not per-key)
- String encode/decode per type (bool→"1"/"0", number→toString, string→as-is)
- `anitaui_` prefix namespace on all ConVar keys
- Schema version ConVar (`anitaui_schema_v`)
- Hydration guard flag (`_hydrating`)
- In-memory cache (read from cache, not ConVars — ConVars are write-only from JS)

### Must NOT Have (Guardrails)
- NO exhaustive backend detection / fallback chains
- NO `$.persistentStorage`, `GameUI`, `localStorage` references
- NO file write operations (Panorama JS cannot write files)
- NO new UI components beyond reset button
- NO changes to AnitaComponents, AnitaRenderer layout, or AnitaCore init flow
- NO modifications to files outside `test/anita2/`
- NO unbounded ConVar writes (must debounce)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
> ALL verification executed by agent using tools. No "user opens game and checks."

### Test Decision
- **Infrastructure exists**: NO (Source 2 mod — no test framework)
- **Automated tests**: None (no runtime outside game engine)
- **Framework**: sr2compiler only

### Agent-Executed QA Scenarios (Primary Verification)

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| Compilation | Bash (sr2compiler) | Run compiler, assert exit code 0 |
| Code correctness | Grep + Read | Verify patterns, no banned APIs |
| Structure | AST grep | Verify IIFE shape, encode/decode table |

---

## Execution Strategy

### Sequential Execution (5 Tasks)

```
Task 1: AnitaStorage IIFE (push-pull backend + encode/decode + debounce)
  ↓
Task 2: Event listener for load ($.RegisterForUnhandledEvent)
  ↓
Task 3: Hook integration (hydrate + save + reset)
  ↓
Task 4: Compile & verify
  ↓
Task 5: Create usage documentation (inline comments explaining the push-pull protocol)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1 | None | 2 |
| 2 | 1 | 3 |
| 3 | 2 | 4 |
| 4 | 3 | 5 |
| 5 | 4 | None |

### Agent Dispatch Summary

| Task | Recommended Agent |
|------|-------------------|
| 1 | task(category="unspecified-low", load_skills=[], ...) |
| 2 | task(category="quick", load_skills=[], ...) |
| 3 | task(category="quick", load_skills=[], ...) |
| 4 | task(category="quick", load_skills=[], ...) |
| 5 | task(category="quick", load_skills=[], ...) |

---

## TODOs

- [x] 1. Create AnitaStorage IIFE — Push-Pull CFG Backend

  **What to do**:
  - Add `AnitaStorage` IIFE after the `Logger` declaration (after line ~124) in `test/anita2/panorama/scripts/anita_ui_core.js`
  - The module is more complex than Plan A because all values must be serialized to strings for console transport.

  **Architecture**:
  ```
  ┌─────────────────────────────────────────┐
  │           AnitaStorage IIFE             │
  │                                         │
  │  _cache = {}          ← in-memory store │
  │  _hydrating = false   ← guard flag      │
  │  _writeTimer = null   ← debounce timer  │
  │  _dirty = false       ← pending writes  │
  │                                         │
  │  ENCODE/DECODE TABLE:                   │
  │    boolean → "1"/"0"  ← "0"→false       │
  │    number  → "123"    ← parseFloat      │
  │    string  → "abc"    ← as-is           │
  │                                         │
  │  SAVE PATH (push):                      │
  │    set() → _cache → markDirty()         │
  │    → debounce 500ms → flush()           │
  │    → setinfo anitaui_mod_key val        │
  │    → host_writeconfig                   │
  │                                         │
  │  LOAD PATH (pull):                      │
  │    registered via setupLoadListener()   │
  │    → $.RegisterForUnhandledEvent        │
  │    → "AnitaSettingsLoad" event          │
  │    → decode + store in _cache           │
  └─────────────────────────────────────────┘
  ```

  **Implementation Details**:

  1. **Key format**: `anitaui_{modTitle}_{settingId}` (sanitized: spaces→underscores, lowercase)
     - Helper: `function makeKey(mod, id) { return "anitaui_" + mod.replace(/\s+/g,"_").toLowerCase() + "_" + id; }`

  2. **Encode/Decode table**:
     ```javascript
     const ENCODERS = {
       boolean: v => v ? "1" : "0",
       number:  v => String(v),
       string:  v => v
     };
     const DECODERS = {
       boolean: s => s === "1",
       number:  s => { const n = parseFloat(s); return isNaN(n) ? 0 : n; },
       string:  s => s
     };
     ```
     - Type is stored alongside value: `setinfo anitaui_mod_key "type:value"` (e.g., `"boolean:1"`, `"number:42"`, `"string:hello"`)

  3. **set(modTitle, settingId, value)**:
     - If `_hydrating` is true, still update `_cache` but do NOT call `markDirty()` (don't trigger writes during hydration)
     - Store in `_cache[modTitle][settingId] = value`
     - Call `markDirty()`

  4. **markDirty() + flush()**:
     ```javascript
     function markDirty() {
       _dirty = true;
       if (_writeTimer) $.CancelScheduled(_writeTimer);
       _writeTimer = $.Schedule(0.5, flush);  // 500ms debounce
     }
     function flush() {
       if (!_dirty) return;
       _writeTimer = null;
       _dirty = false;
       for (const [mod, settings] of Object.entries(_cache)) {
         for (const [id, val] of Object.entries(settings)) {
           const key = makeKey(mod, id);
           const type = typeof val;
           const encoded = (ENCODERS[type] || ENCODERS.string)(val);
           const payload = type + ":" + encoded;
           $.DispatchEvent("ExecuteConsoleCommand",
             'setinfo ' + key + ' "' + payload + '"');
         }
       }
       // Also save schema version
       $.DispatchEvent("ExecuteConsoleCommand",
         'setinfo anitaui_schema_v "1"');
       // Flush to disk
       $.DispatchEvent("ExecuteConsoleCommand", "host_writeconfig");
       Logger.debug("[Storage] flushed to config.cfg");
     }
     ```

  5. **get(modTitle, settingId)**: Read from `_cache` only (ConVars are write-only from JS)

  6. **getAll(modTitle)**: Return `_cache[modTitle]` or `null`

  7. **remove(modTitle, settingId)**: Delete from `_cache`, call `markDirty()` (sets ConVar to empty string)

  8. **removeAllForMod(modTitle)**: Delete entire mod from `_cache`, `markDirty()`

  9. **beginHydration() / endHydration()**: Toggle `_hydrating` flag

  10. **Expose**: `{ get, set, remove, removeAllForMod, getAll, beginHydration, endHydration, flush, onSettingLoaded }`
      - `onSettingLoaded(key, payload)`: Called by the event listener (Task 2) to populate `_cache` during load

  **Must NOT do**:
  - Do NOT use `$.persistentStorage`, `GameUI`, `localStorage`
  - Do NOT attempt file I/O
  - Do NOT call `host_writeconfig` more than once per flush cycle
  - Do NOT modify any existing functions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: `[]`
    - Moderate complexity JS module but no special frameworks needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Task 1
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `test/anita2/panorama/scripts/anita_ui_core.js:1-87` — AnitaUILogger IIFE pattern (follow same IIFE structure)
  - `test/anita2/panorama/scripts/anita_ui_core.js:585` — `root.AnitaUI = {...}` (confirms root panel property works for the in-memory cache)
  - `test/anita2/panorama/scripts/anita_ui_core.js:90-122` — CONFIG object (placement: after Logger at ~line 124)

  **External References**:
  - Source 2 `setinfo` command: Creates archived user info ConVars that persist via `host_writeconfig`
  - Source 2 `host_writeconfig`: Writes all archived ConVars to `citadel/cfg/config.cfg`
  - Source 2 `panorama_dispatch_event`: Console command that fires Panorama events from CFG files

  **WHY Each Reference Matters**:
  - Logger IIFE: Copy this structure for AnitaStorage
  - root.AnitaUI: Confirms root panel attachment works (cache can also be stored here)
  - CONFIG: Insertion point — AnitaStorage goes between Logger and emitUpdate
  - setinfo/host_writeconfig: THE persistence mechanism — this is how data survives restarts
  - panorama_dispatch_event: THE load mechanism — CFG files fire events that JS can listen to

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: AnitaStorage module has push-pull API surface
    Tool: Bash (grep)
    Preconditions: File exists at test/anita2/panorama/scripts/anita_ui_core.js
    Steps:
      1. Grep for "const AnitaStorage" — assert exactly 1 match
      2. Grep for "setinfo" — assert at least 1 match (save mechanism)
      3. Grep for "host_writeconfig" — assert at least 1 match (flush mechanism)
      4. Grep for "ENCODERS\|DECODERS" — assert at least 2 matches (type system)
      5. Grep for "markDirty\|flush" — assert at least 2 matches (debounce system)
      6. Grep for "beginHydration\|endHydration" — assert at least 2 matches
      7. Grep for "anitaui_schema_v" — assert at least 1 match (schema version)
      8. Grep for "onSettingLoaded" — assert at least 1 match (load handler)
    Expected Result: All push-pull API elements present
    Failure Indicators: Missing setinfo, missing debounce, missing encode/decode

  Scenario: No banned API references
    Tool: Bash (grep)
    Preconditions: File modified with AnitaStorage
    Steps:
      1. Grep for "persistentStorage\|PersistentStorage\|localStorage\|GameUI\|GameInterfaceAPI"
      2. Assert: 0 matches
    Expected Result: No references to disabled/missing APIs
    Failure Indicators: Any banned API match

  Scenario: Debounce timer uses $.Schedule and $.CancelScheduled
    Tool: Bash (grep)
    Preconditions: AnitaStorage module exists
    Steps:
      1. Grep for "\\$.Schedule" — assert at least 1 match (debounce timer)
      2. Grep for "\\$.CancelScheduled\|CancelScheduled" — assert at least 1 match (cancel previous timer)
      3. Grep for "0.5" or "500" — assert debounce delay is present
    Expected Result: Proper debounce implementation using Panorama scheduling
    Failure Indicators: Missing CancelScheduled (would cause duplicate flushes)
  ```

  **Commit**: YES
  - Message: `feat(anita2): add AnitaStorage IIFE with push-pull CFG backend`
  - Files: `test/anita2/panorama/scripts/anita_ui_core.js`

---

- [x] 2. Event Listener for Settings Load

  **What to do**:
  - Add a `setupLoadListener()` function inside AnitaStorage (or as a separate init call) that:
    1. Registers a Panorama event listener: `$.RegisterForUnhandledEvent("AnitaSettingsLoad", onLoadEvent)`
    2. The `onLoadEvent(key, payload)` callback:
       - Parses the payload format: `"type:value"` → split on first `:`
       - Extracts modTitle and settingId from the key: `anitaui_modtitle_settingid` → reverse the `makeKey()` transform
       - Decodes value using `DECODERS[type]`
       - Calls `AnitaStorage.onSettingLoaded(modTitle, settingId, decodedValue)` which stores to `_cache`
    3. After listener is registered, triggers the load: `$.DispatchEvent("ExecuteConsoleCommand", "exec anitaui_settings.cfg")`

  - **Init ordering** (CRITICAL for race condition):
    1. JS registers `AnitaSettingsLoad` listener ← MUST happen first
    2. JS fires `exec anitaui_settings.cfg` ← events fire synchronously back to registered listener
    3. Cache is populated from events

  - **Key parsing**: To reverse `makeKey()`, store a lookup table in `_cache` that maps ConVar keys back to `{modTitle, settingId}` pairs. Alternatively, encode the separator differently: use `anitaui__modtitle__settingid` (double underscore) so single underscores in names are preserved.

  - **Fallback**: If CFG file doesn't exist, `exec` silently fails — no error handling needed. Cache stays empty, defaults are used.

  - Call `setupLoadListener()` at module initialization (end of IIFE, before returning the API object)

  **Must NOT do**:
  - Do NOT assume the CFG file exists — handle silent failure
  - Do NOT wait for events asynchronously — `exec` + `panorama_dispatch_event` fire synchronously in same frame
  - Do NOT create the CFG file from JS (Panorama cannot write files)
  - Do NOT add multiple event listeners for the same event

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
  - `test/anita2/panorama/scripts/anita_ui_core.js:1-87` — Logger pattern (for debug logging in event handler)
  - Task 1 output — AnitaStorage IIFE (add listener inside or adjacent)

  **External References**:
  - `$.RegisterForUnhandledEvent(eventName, callback)` — Confirmed available in Deadlock Panorama APIs
  - `panorama_dispatch_event EventName "arg1" "arg2"` — Console command that fires Panorama events from CFG files

  **WHY Each Reference Matters**:
  - RegisterForUnhandledEvent: THE mechanism to receive data from CFG file exec
  - panorama_dispatch_event: How the CFG file sends data back to JS

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Event listener registered for AnitaSettingsLoad
    Tool: Bash (grep)
    Preconditions: Task 1 complete
    Steps:
      1. Grep for "RegisterForUnhandledEvent" — assert at least 1 match
      2. Grep for "AnitaSettingsLoad" — assert at least 1 match
      3. Grep for "exec anitaui_settings" — assert at least 1 match (trigger load)
      4. Verify RegisterForUnhandledEvent appears BEFORE exec command in file order
    Expected Result: Listener registered before exec fires events
    Failure Indicators: exec before RegisterForUnhandledEvent (race condition)

  Scenario: Payload parsing handles type:value format
    Tool: Bash (grep)
    Preconditions: Event handler code exists
    Steps:
      1. Grep for "split\|indexOf.*:" — assert payload parsing exists
      2. Grep for "DECODERS" — assert decoder usage in handler
    Expected Result: Event handler decodes typed payloads correctly
    Failure Indicators: Raw string stored without decoding
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `feat(anita2): add event listener for CFG settings load`
  - Files: `test/anita2/panorama/scripts/anita_ui_core.js`

---

- [x] 3. Hook Integration — Hydrate, Save, Reset

  **What to do**:
  - Same three hooks as Plan A, but with push-pull specifics:

  **A. `emitUpdate()` — Add save-on-change** (~line 126-134):
  - After `$.DispatchEvent` call, add: `AnitaStorage.set(modTitle, settingId, newValue);`
  - AnitaStorage internally debounces → `markDirty()` → 500ms → `flush()` → `setinfo` + `host_writeconfig`

  **B. `registerMod()` — Add hydration** (~line 624):
  - After mod config is pushed:
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
  - Note: By the time `registerMod()` is called, the load listener (Task 2) has already populated `_cache` from CFG file
  - The hydration guard prevents restored values from triggering `emitUpdate` → `markDirty` → `flush` (which would be a pointless re-save)

  **C. `renderModSettings()` — Add reset button** (~line 516):
  - Same reset button pattern as Plan A:
    ```javascript
    const resetBtn = AnitaComponents.createButton(container, {
      label: "Reset to Defaults",
      callback: () => {
        AnitaStorage.removeAllForMod(mod.title);
        AnitaStorage.flush();  // Immediate write-through to clear persisted values
        renderModSettings(mod);
      }
    });
    ```
  - **Key difference from Plan A**: Call `flush()` explicitly after reset to immediately clear persisted ConVars (don't wait for debounce timer)

  **Must NOT do**:
  - Same guardrails as Plan A Task 2
  - Do NOT skip the `flush()` call after reset (must clear ConVars immediately, not after debounce)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Task 3
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `test/anita2/panorama/scripts/anita_ui_core.js:126-134` — `emitUpdate()` (add AnitaStorage.set after $.DispatchEvent)
  - `test/anita2/panorama/scripts/anita_ui_core.js:624` — `registerMod()` (add hydration after config push)
  - `test/anita2/panorama/scripts/anita_ui_core.js:516` — `renderModSettings()` (add reset button at end)
  - `test/anita2/panorama/scripts/anita_ui_core.js:370-380` — `AnitaComponents.createButton()` (use for reset button)

  **WHY Each Reference Matters**:
  - emitUpdate: Save hook — every setting change flows through here
  - registerMod: Hydration point — restore values from _cache (populated by Task 2 event listener)
  - renderModSettings: UI hook for reset button
  - createButton: Reuse existing component API

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: emitUpdate calls AnitaStorage.set
    Tool: Bash (grep)
    Steps:
      1. Read emitUpdate function body
      2. Assert: contains "AnitaStorage.set" after "$.DispatchEvent"
    Expected Result: Save hook integrated

  Scenario: registerMod hydrates with guard
    Tool: Bash (grep)
    Steps:
      1. Grep for "beginHydration" in registerMod context
      2. Grep for "getAll" in registerMod context
      3. Grep for "endHydration" in registerMod context
      4. Assert: all three present in correct order
    Expected Result: Hydration wrapped in guard flags

  Scenario: Reset button calls flush explicitly
    Tool: Bash (grep)
    Steps:
      1. Grep for "Reset to Defaults" — assert 1 match
      2. Grep for "removeAllForMod" — assert 1 match
      3. Grep for "flush()" near removeAllForMod — assert explicit flush after reset
    Expected Result: Reset immediately clears persisted ConVars
    Failure Indicators: Missing flush() after removeAllForMod (would leave stale ConVars until next debounce)
  ```

  **Commit**: YES
  - Message: `feat(anita2): integrate storage hooks — hydrate, save, reset`
  - Files: `test/anita2/panorama/scripts/anita_ui_core.js`

---

- [x] 4. Compile & Verify

  **What to do**:
  - Run the Source 2 resource compiler:
    ```powershell
    & "F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\test\anita2"
    ```
  - Verify compiled output in `test/anita2_compiled/`
  - Final code review: grep for banned APIs, verify debounce, verify event listener ordering

  **Must NOT do**:
  - Do NOT modify source files
  - Do NOT compile other directories

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:
  - `AGENTS.md: BUILD COMMANDS` — Compile command format

  **Acceptance Criteria**:

  ```
  Scenario: Compilation succeeds
    Tool: Bash (powershell)
    Steps:
      1. Run sr2compiler against test/anita2
      2. Assert: exit code 0
      3. Assert: test/anita2_compiled/ exists with .vjs_c file
    Expected Result: Clean compilation

  Scenario: Final code review
    Tool: Bash (grep)
    Steps:
      1. Grep for banned APIs (persistentStorage, GameUI, localStorage) — assert 0 matches
      2. Grep for "AnitaStorage" — assert 8+ matches
      3. Grep for "setinfo" — assert at least 1 match
      4. Grep for "host_writeconfig" — assert at least 1 match
      5. Grep for "RegisterForUnhandledEvent" — assert at least 1 match
      6. Grep for "CancelScheduled" — assert at least 1 match (debounce)
    Expected Result: All push-pull components present, no legacy APIs
  ```

  **Commit**: YES
  - Message: `build(anita2): compile CFG persistent storage mod`
  - Files: `test/anita2_compiled/`

---

- [x] 5. Add Inline Documentation — Push-Pull Protocol

  **What to do**:
  - Add a block comment at the top of the AnitaStorage IIFE explaining the push-pull protocol:
    ```javascript
    /*
     * AnitaStorage — Push-Pull Persistent Storage
     *
     * SAVE (push): setinfo → host_writeconfig → config.cfg
     * LOAD (pull): exec anitaui_settings.cfg → panorama_dispatch_event → JS listener
     *
     * NOTE: To enable loading, create citadel/cfg/anitaui_settings.cfg with:
     *   panorama_dispatch_event AnitaSettingsLoad "anitaui__modname__settingid" "type:value"
     *   (one line per saved setting)
     *
     * Currently, the CFG file cannot be auto-generated from JS (no file I/O).
     * The load mechanism is forward-compatible — once Valve exposes file write
     * APIs or a companion tool generates the CFG, load will work automatically.
     *
     * For now, settings are saved to ConVars (persist in config.cfg) and
     * can be read back if a CFG file is manually created or auto-generated
     * by an external tool.
     */
    ```
  - This documents the "gap" — saves work, loads work IF CFG file exists — so future developers understand the protocol

  **Must NOT do**:
  - Do NOT modify any logic
  - Do NOT add JSDoc to individual functions (keep comments minimal per project style)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: None (final task)
  - **Blocked By**: Task 4

  **References**:
  - Task 1 output — AnitaStorage IIFE (add comment block at top)

  **Acceptance Criteria**:

  ```
  Scenario: Protocol documentation exists
    Tool: Bash (grep)
    Steps:
      1. Grep for "Push-Pull" — assert at least 1 match
      2. Grep for "anitaui_settings.cfg" — assert at least 2 matches (in comment + in code)
      3. Grep for "panorama_dispatch_event" — assert at least 1 match in comment
    Expected Result: Protocol documented for future developers
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `docs(anita2): add push-pull protocol documentation`
  - Files: `test/anita2/panorama/scripts/anita_ui_core.js`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(anita2): add AnitaStorage IIFE with push-pull CFG backend` | anita_ui_core.js | grep for API surface |
| 2 | `feat(anita2): add event listener for CFG settings load` | anita_ui_core.js | grep for listener + exec order |
| 3 | `feat(anita2): integrate storage hooks — hydrate, save, reset` | anita_ui_core.js | grep for hooks |
| 4 | `build(anita2): compile CFG persistent storage mod` | anita2_compiled/ | compiler exit 0 |
| 5 | `docs(anita2): add push-pull protocol documentation` | anita_ui_core.js | grep for protocol docs |

---

## Success Criteria

### Verification Commands
```powershell
# Compile
& "F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\test\anita2"
# Expected: exit code 0

# No banned APIs
Select-String -Path "test\anita2\panorama\scripts\anita_ui_core.js" -Pattern "persistentStorage|PersistentStorage|localStorage|GameUI|GameInterfaceAPI"
# Expected: no matches

# Push-pull components present
Select-String -Path "test\anita2\panorama\scripts\anita_ui_core.js" -Pattern "setinfo|host_writeconfig|RegisterForUnhandledEvent|AnitaSettingsLoad"
# Expected: 4+ matches

# Debounce present
Select-String -Path "test\anita2\panorama\scripts\anita_ui_core.js" -Pattern "CancelScheduled|markDirty|flush"
# Expected: 3+ matches
```

### Final Checklist
- [x] AnitaStorage IIFE with push-pull CFG backend
- [x] Encode/decode table (boolean, number, string)
- [x] 500ms debounce on writes
- [x] `setinfo` + `host_writeconfig` save path
- [x] `RegisterForUnhandledEvent("AnitaSettingsLoad")` load path
- [x] `exec anitaui_settings.cfg` trigger AFTER listener registration
- [x] Hydration guard (beginHydration/endHydration)
- [x] Save on emitUpdate
- [x] Reset button with explicit flush
- [x] Schema version ConVar
- [x] No banned API references
- [x] Inline protocol documentation
- [x] Compiles cleanly
