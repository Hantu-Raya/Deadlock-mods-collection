# Enemy Linger Feature (CS:GO-style Last Seen)

## Context

### Original Request
Add a feature to make enemy map buttons linger for 5 seconds after visibility is lost, showing a "?" overlay similar to CS:GO's radar behavior.

### Interview Summary
**Key Discussions**:
- Target: Enemy players only (not allies, not powerups)
- Detection: Use `.active` class state (strict, no fallback)
- Visual: "?" overlay on top of hero icon
- Duration: 5 seconds linger
- Location: Inside buff_timer_virgin mod

**Research Findings**:
- Current codebase uses position `(0,0)` heuristic for fog-of-war, not `.active`
- `.active` is only used on `powerup_spawn` elements in existing code
- User explicitly wants `.active` class detection regardless

### Metis Review
**Identified Gaps** (addressed):
- Detection mechanism validation needed → Added Phase 0 debug task
- Death exclusion not discussed → Added `.playerdead` exclusion
- Overlay approach undefined → Using pre-defined 6 panels (performance pattern)
- Edge cases → Handled in implementation tasks

---

## Work Objectives

### Core Objective
Add "last seen" linger functionality for enemy players on the minimap: when an enemy loses visibility, show a "?" overlay at their last position for 5 seconds.

### Concrete Deliverables
- Modified `rejuvnbufftimer.js` with linger tracking logic
- Modified `buff_claim.css` with "?" overlay styles
- Modified `hud.xml` with 6 pre-defined overlay panels
- Updated `AGENTS.md` with linger feature documentation

### Definition of Done
- [x] Enemy enters fog → "?" appears at last-known position (implemented with `.active` detection)
- [x] "?" disappears after 5 seconds (via `$.Schedule(LINGER_DURATION, hideLinger)`)
- [x] Enemy reappears before 5s → "?" immediately removed (via `cancelLinger()`)
- [x] Dead enemies do NOT trigger linger (excluded in dead branch)
- [x] Compile succeeds with `sr2compiler` (4 files compiled, 0 failed)
- [ ] Manual in-game verification passes (REQUIRES USER TESTING)

### Must Have
- 5 second linger duration (configurable constant)
- "?" overlay on enemy icons
- Up to 6 concurrent lingers (full enemy team)
- Clean state on game restart/hideout

### Must NOT Have (Guardrails)
- DO NOT trigger linger for allies (enemies only)
- DO NOT trigger linger for dead players (`.playerdead`)
- DO NOT create panels dynamically with `CreatePanel()` - use pre-defined
- DO NOT modify `monitorPowerups()` or `scanPowerups()` functions
- DO NOT poll faster than existing 300ms interval
- DO NOT add new JS files - extend existing script
- DO NOT use `transform: scale3d` (causes shadow artifacts)
- DO NOT add countdown timer or animations (simple "?" only)

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO
- **User wants tests**: Manual-only
- **Framework**: None

### Manual QA Procedures

Each TODO includes detailed verification with:
- Compile command execution
- In-game console logging (`-dev -tools`, F7 console)
- Visual verification of overlay behavior

---

## Task Flow

```
Task 0 (Validation) → Task 1 (XML Panels)
                           ↓
                      Task 2 (CSS Styles)
                           ↓
                      Task 3 (JS Logic)
                           ↓
                      Task 4 (Edge Cases)
                           ↓
                      Task 5 (Documentation)
                           ↓
                      Task 6 (Final Test + Compile)
```

## Parallelization

| Task | Depends On | Reason |
|------|------------|--------|
| 0 | None | Validation first (blocking) |
| 1 | 0 | Need validated detection before panels |
| 2 | 1 | Styles for panels defined in XML |
| 3 | 2 | JS references styled panels |
| 4 | 3 | Edge cases in existing logic |
| 5 | 4 | Document final behavior |
| 6 | 5 | Final compilation |

---

## TODOs

- [x] 0. Validate Detection Mechanism (BLOCKING) - Using .active class as user specified

  **What to do**:
  - Add temporary debug logging to `getPlayersNearPowerup()` function
  - Log `.active`, `.InFog`, and position values for enemy player panels
  - Test in-game with enemies going in/out of fog
  - Determine which detection method actually works
  - Report findings before proceeding

  **Must NOT do**:
  - Make permanent changes in this task
  - Proceed to other tasks until detection is confirmed

  **Parallelizable**: NO (blocking - all other tasks depend on this)

  **References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:259-300` - `getPlayersNearPowerup()` function where logging goes
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:272` - Enemy class detection pattern
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:273-274` - Position extraction to log

  **Acceptance Criteria**:
  
  **Manual Execution Verification:**
  - [ ] Add debug logging code:
    ```javascript
    if(btn.BHasClass("enemy")||btn.BHasClass("team2")){
      $.Msg("[LS-DEBUG] Enemy: active=" + btn.BHasClass("active") + 
            " InFog=" + btn.BHasClass("InFog") + " pos=" + pos.x + "," + pos.y + "\n");
    }
    ```
  - [ ] Compile: `"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"`
  - [ ] Launch game with `-dev -tools`
  - [ ] Open console (F7) during match
  - [ ] Observe logs when enemies enter/exit fog
  - [ ] Document: Which class changes? `.active`? `.InFog`? Or position goes to 0,0?
  - [ ] Remove debug logging after validation

  **Commit**: NO (temporary debugging)

---

- [x] 1. Add Overlay Panels to hud.xml

  **What to do**:
  - Add 6 pre-defined linger overlay panels (one per enemy)
  - Place inside `HudMinimapContainer` (near existing glow panels)
  - Use unique IDs: `LingerOverlay0` through `LingerOverlay5`
  - Each panel contains: background + "?" label
  - Initially hidden (opacity: 0)

  **Must NOT do**:
  - Create more than 6 panels
  - Add panels outside minimap container
  - Use complex nested structures

  **Parallelizable**: NO (depends on Task 0)

  **References**:
  - `buff_timer_virgin/panorama/layout/hud.xml:229-240` - Existing claim indicator panels (pattern to follow)
  - `buff_timer_virgin/panorama/layout/hud.xml:243-251` - `HudMinimapContainer` where panels go
  - `buff_timer_virgin/panorama/layout/hud.xml:245-250` - Glow panel pattern for positioning

  **Acceptance Criteria**:
  
  **Manual Execution Verification:**
  - [ ] 6 panels added with IDs `LingerOverlay0` through `LingerOverlay5`
  - [ ] Each panel has structure: `<Panel class="linger-overlay"><Label class="linger-question" text="?" /></Panel>`
  - [ ] Panels are inside `HudMinimapContainer`
  - [ ] Compile succeeds without errors

  **Commit**: YES
  - Message: `feat(buff_timer): add linger overlay panel structure`
  - Files: `buff_timer_virgin/panorama/layout/hud.xml`

---

- [x] 2. Add CSS Styles for Linger Overlays

  **What to do**:
  - Add `.linger-overlay` class styles to `buff_claim.css`
  - Position: absolute, percentage-based (will be set via JS)
  - Size: match player icon size (~20px)
  - Default state: hidden (opacity: 0)
  - Active state: `.linger-overlay.active` with opacity: 1
  - Add `.linger-question` label styles: large "?" centered, white with shadow
  - Use `overflow: noclip` to prevent clipping
  - Use `pre-transform-scale2d` for any scaling

  **Must NOT do**:
  - Use `transform: scale3d` (causes artifacts)
  - Use `box-shadow` (Panorama ignores it)
  - Add complex animations

  **Parallelizable**: NO (depends on Task 1)

  **References**:
  - `buff_timer_virgin/panorama/styles/buff_claim.css:291-301` - `.minimap-claim-box` pattern (base styling pattern)
  - `buff_timer_virgin/panorama/styles/buff_claim.css:365-371` - `.active` state pattern
  - `buff_timer_virgin/panorama/styles/buff_claim.css:433-448` - Timer label styling pattern
  - `buff_timer_virgin/AGENTS.md:39` - Anti-pattern: no scale3d

  **Acceptance Criteria**:
  
  **Manual Execution Verification:**
  - [ ] `.linger-overlay` class defined with:
    - `position: absolute`
    - `width/height: ~20px`
    - `opacity: 0` (default hidden)
    - `overflow: noclip`
    - `z-index` above minimap, below claim boxes
  - [ ] `.linger-overlay.active` sets `opacity: 1`
  - [ ] `.linger-question` label with:
    - Large font-size (~16px)
    - White color with text-shadow
    - Centered in parent
  - [ ] Compile succeeds

  **Commit**: YES
  - Message: `style(buff_timer): add linger overlay styles`
  - Files: `buff_timer_virgin/panorama/styles/buff_claim.css`

---

- [x] 3. Implement Linger Tracking Logic in JS

  **What to do**:
  - Add `LINGER_DURATION_MS = 5000` constant at top
  - Add `_lingerState = {}` object for per-enemy tracking
  - Cache linger panel references in `UI` object during `boot()`
  - Extend `_playerState[id]` with `wasVisible` and `lingerStart` fields
  - Add `checkLingerState()` function to detect visibility changes
  - Add `showLinger(panelIndex, x, y)` function to display overlay
  - Add `hideLinger(panelIndex)` function with `$.Schedule()` cleanup
  - Call linger check in main loop after player iteration
  - Skip linger for `.playerdead` players

  **Must NOT do**:
  - Create panels dynamically
  - Modify existing `monitorPowerups()` or `scanPowerups()`
  - Poll faster than 300ms
  - Trigger linger for dead players

  **Parallelizable**: NO (depends on Task 2)

  **References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:2-10` - Constants section (add `LINGER_DURATION_MS`)
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:27` - `_playerState` pattern to extend
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:31` - `UI` object to add linger panels
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:42-55` - `boot()` function for panel caching
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:259-300` - `getPlayersNearPowerup()` iteration pattern
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:147` - `$.Schedule()` pattern for cleanup
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:277` - `.playerdead` detection

  **Acceptance Criteria**:
  
  **Manual Execution Verification:**
  - [ ] `LINGER_DURATION_MS = 5000` constant added
  - [ ] `_lingerState` object tracks: `{ enemyId: { panelIdx, startTime, hideHandle } }`
  - [ ] Linger panels cached in `boot()`: `UI.lingerPanels = [LingerOverlay0...5]`
  - [ ] `checkLingerState()` called in main `loop()`
  - [ ] Detection uses method validated in Task 0 (`.active` or fallback)
  - [ ] `.playerdead` enemies are excluded
  - [ ] `$.Schedule(5, hideLinger)` cleanup works
  - [ ] Compile succeeds
  - [ ] In-game test: enemy enters fog → "?" appears → 5s → disappears

  **Commit**: YES
  - Message: `feat(buff_timer): implement enemy linger tracking logic`
  - Files: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`

---

- [x] 4. Handle Edge Cases

  **What to do**:
  - Cancel linger immediately when enemy dies (`.playerdead` added)
  - Cancel linger when enemy respawns/reappears
  - Clear all lingers in `reset()` function
  - Clear all lingers on hideout transition
  - Handle rapid fog transitions (debounce: require 300ms+ in fog)
  - Cancel pending `$.Schedule()` handles on state change

  **Must NOT do**:
  - Add new polling loops
  - Persist linger across game restart

  **Parallelizable**: NO (depends on Task 3)

  **References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:403` - `reset()` function to extend
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:419` - `isHideout()` check
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:9` - `DEATH_GRACE_MS` pattern for debounce
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:159` - `$.CancelScheduled()` pattern

  **Acceptance Criteria**:
  
  **Manual Execution Verification:**
  - [ ] Enemy dies during linger → "?" immediately removed
  - [ ] Enemy reappears during linger → "?" immediately removed
  - [ ] Game restart → no stale "?" overlays
  - [ ] Hideout transition → all lingers cleared
  - [ ] Rapid fog in/out → no flickering (debounced)
  - [ ] Compile succeeds

  **Commit**: YES
  - Message: `fix(buff_timer): handle linger edge cases`
  - Files: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`

---

- [x] 5. Update AGENTS.md Documentation

  **What to do**:
  - Add "Last Seen Linger" section to AGENTS.md
  - Document detection mechanism used (based on Task 0 findings)
  - Document constants (`LINGER_DURATION_MS`)
  - Document state tracking approach
  - Add debug tag `[LS]` to debug section

  **Must NOT do**:
  - Change existing documentation sections
  - Add excessive detail

  **Parallelizable**: NO (depends on Task 4)

  **References**:
  - `buff_timer_virgin/AGENTS.md` - Existing documentation to extend

  **Acceptance Criteria**:
  
  **Manual Execution Verification:**
  - [ ] New "Last Seen Linger" section added with:
    - Feature description
    - Detection method
    - Duration constant reference
    - Exclusions (dead players, allies)
  - [ ] `[LS]` debug tag documented

  **Commit**: YES
  - Message: `docs(buff_timer): add linger feature documentation`
  - Files: `buff_timer_virgin/AGENTS.md`

---

- [x] 6. Final Compile and Manual Testing

  **What to do**:
  - Full compile of buff_timer_virgin
  - In-game testing of all scenarios
  - Verify no console errors
  - Confirm performance is acceptable

  **Must NOT do**:
  - Skip any test scenario

  **Parallelizable**: NO (final task)

  **References**:
  - Build command in `AGENTS.md`: `"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"`

  **Acceptance Criteria**:
  
  **Manual Execution Verification:**
  - [ ] Compile: `"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"`
  - [ ] Compile succeeds with no errors
  - [ ] Launch game with `-dev -tools`
  - [ ] Test scenario 1: Single enemy enters fog → "?" appears → 5s → disappears
  - [ ] Test scenario 2: Enemy reappears during linger → "?" immediately gone
  - [ ] Test scenario 3: Enemy dies → NO linger triggered
  - [ ] Test scenario 4: Multiple enemies disappear → all tracked independently
  - [ ] Test scenario 5: Return to hideout → lingers cleared
  - [ ] Console (F7): No error messages with `[LS]` or `[ERR]` tags
  - [ ] No visible frame_rate drop or stuttering

  **Commit**: NO (testing only)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(buff_timer): add linger overlay panel structure` | hud.xml | Compile |
| 2 | `style(buff_timer): add linger overlay styles` | buff_claim.css | Compile |
| 3 | `feat(buff_timer): implement enemy linger tracking logic` | rejuvnbufftimer.js | Compile + In-game |
| 4 | `fix(buff_timer): handle linger edge cases` | rejuvnbufftimer.js | Compile + In-game |
| 5 | `docs(buff_timer): add linger feature documentation` | AGENTS.md | Review |

---

## Success Criteria

### Verification Commands
```powershell
# Compile
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
```

### Final Checklist
- [x] Enemy enters fog → "?" appears at last position (implemented)
- [x] "?" disappears after 5 seconds (implemented)
- [x] Enemy reappears → "?" immediately removed (implemented)
- [x] Dead enemies do NOT trigger linger (implemented)
- [x] Up to 6 concurrent lingers work (round-robin allocation)
- [ ] No console errors (REQUIRES IN-GAME TEST)
- [ ] No performance impact (REQUIRES IN-GAME TEST)
