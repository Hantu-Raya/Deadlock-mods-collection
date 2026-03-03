# Clip Progress Bar for Buff Timer Virgin

## Context

### Original Request
Add CSS clip-based progress bars to RejuvTime and BuffTime labels in the buff_timer_virgin mod, similar to Deadlock's native ability HUD progress text effect (like the "BURROW" channeling bar).

### Interview Summary
**Key Discussions**:
- RejuvTime: Grey (#808080) base text, white fill, left-to-right, thick bold shadow
- BuffTime: Grey (#808080) base text, white→red (#ff474d) interpolated fill, right-to-left, black thick shadow
- Both timers: Empty→Full toward spawn (0% at start of countdown, 100% at spawn)
- During "Spawn" text: Progress stays at 100% filled
- On phase change: Progress resets to 0%
- Basic implementation only - no animations or urgency effects

**Research Findings**:
- Native `src="panel://..."` pattern is ENGINE-ONLY, not available in mods
- Alternative: Two overlapping Label panels with CSS `clip-path: inset()` applied via JS
- `clip: rect()` is deprecated - must use `clip-path: inset(top, right, bottom, left)`
- Example folder shows `SplitLabelProgressBar` pattern with thick shadow: `text-shadow: 0px 0px 0px 8 black`

### Metis Review
**Identified Gaps** (addressed):
- Progress direction: Confirmed empty→full toward spawn
- Color values: Confirmed #808080 grey, #ffffff white, #ff474d red
- Spawn text behavior: Confirmed 100% filled during "Spawn"
- Phase reset: Confirmed reset to 0% on phase change
- clip-path syntax: Use `inset()` not deprecated `rect()`

---

## Work Objectives

### Core Objective
Add text-fill progress effect to RejuvTime (left-to-right) and BuffTime (right-to-left) timers using CSS clip-path applied dynamically via JavaScript.

### Concrete Deliverables
- Modified `hud.xml` with overlay Label elements
- Modified `hud_timer.css` with base and clip styling
- Modified `rejuvnbufftimer.js` with progress calculation and DOM updates
- Compiled mod ready for in-game testing

### Definition of Done
- [ ] RejuvTime shows grey base with white overlay filling L→R as spawn approaches
- [ ] BuffTime shows grey base with white→red overlay filling R→L as spawn approaches
- [ ] Progress is 0% at countdown start, 100% at spawn/0:00
- [ ] "Spawn" text displays with 100% progress (fully filled)
- [ ] Phase transitions reset progress to 0%
- [ ] No visible frame drops during normal gameplay
- [ ] Mod compiles successfully with sr2compiler

### Must Have
- Overlay labels positioned identically to base labels
- DOM write guards for clip values (performance)
- UI object caching for overlay panels at boot
- Thick text shadows matching user specification

### Must NOT Have (Guardrails)
- DO NOT use `src="panel://..."` - engine-only feature
- DO NOT use deprecated `clip: rect()` - use `clip-path: inset()`
- DO NOT add animations or transitions - basic implementation only
- DO NOT add urgency/pulse effects - explicitly excluded
- DO NOT modify RejuvTimeBuff or claim indicator timers - out of scope
- DO NOT create new polling loops - integrate into existing `loop()`
- DO NOT add new state variables beyond `_lastRejuvClip`, `_lastBuffClip`
- DO NOT abstract into utility classes - inline the logic

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (Source 2 mod, no npm/jest)
- **User wants tests**: Manual-only
- **Framework**: None - in-game verification with `-dev -tools`

### Manual QA Procedures

**For each TODO, verification includes:**
1. Compile mod using sr2compiler
2. Launch Deadlock with `-dev -tools`
3. Enter sandbox mode or wait for game timer
4. Observe visual behavior matches specification
5. Check F7 console for errors

---

## Task Flow

```
Task 1 (XML) → Task 2 (CSS) → Task 3 (JS) → Task 4 (Compile & Test)
```

## Parallelization

| Task | Depends On | Reason |
|------|------------|--------|
| 1 | None | XML structure first |
| 2 | 1 | CSS needs XML elements to target |
| 3 | 2 | JS needs CSS classes to apply |
| 4 | 3 | Compile needs all changes done |

---

## TODOs

- [x] 1. Add Overlay Labels in XML

  **What to do**:
  - Add `RejuvTimeClip` label as sibling to `RejuvTime` inside `#Rejuv` panel
  - Add `BuffTimeClip` label as sibling to `BuffTime` inside `#Buff` panel
  - Both overlay labels need `hittest="false"` to not block input
  - Both need identical `text=""` attribute (will be set by JS)

  **Must NOT do**:
  - Do not use `src="panel://..."` pattern
  - Do not modify existing label IDs
  - Do not change panel hierarchy

  **Parallelizable**: NO (first task)

  **References**:
  
  **Pattern References**:
  - `buff_timer_virgin/panorama/layout/hud.xml:197-201` - Existing RejuvTime structure to extend
  - `buff_timer_virgin/panorama/layout/hud.xml:193-196` - Existing BuffTime structure to extend
  
  **External References**:
  - `example/panorama/layout/ability_hud_elements/element_progress_bar_text.xml:11-14` - SplitLabel pattern (for concept, not direct copy)

  **Acceptance Criteria**:

  **Manual Verification:**
  - [ ] Open `hud.xml` and verify `RejuvTimeClip` exists inside `#Rejuv` panel
  - [ ] Open `hud.xml` and verify `BuffTimeClip` exists inside `#Buff` panel
  - [ ] Both labels have `hittest="false"` attribute

  **Commit**: NO (groups with 2, 3)

---

- [x] 2. Add CSS Styling for Base and Overlay Labels

  **What to do**:
  - Modify `#RejuvTime` styling: change color to `#808080` (grey), add thick bold text-shadow
  - Add `#RejuvTimeClip` styling: same as RejuvTime but color `#ffffff` (white), add `clip-path: inset(0% 100% 0% 0%)` (starts fully clipped), position absolutely over base
  - Modify `#BuffTime` styling: change color to `#808080` (grey), add thick black text-shadow  
  - Add `#BuffTimeClip` styling: same as BuffTime but color `#ffffff` (white), add `clip-path: inset(0% 0% 0% 100%)` (starts fully clipped for R→L), position absolutely over base
  - Ensure `z-index` on clip labels is higher than base labels

  **CSS Patterns**:
  ```css
  /* Base label - grey */
  #RejuvTime {
    color: #808080;
    text-shadow: 0px 0px 0px 6 black;
  }
  /* Overlay - white, clipped from right (for L→R fill) */
  #RejuvTimeClip {
    color: #ffffff;
    text-shadow: 0px 0px 0px 6 black;
    clip-path: inset(0% 100% 0% 0%);
    position: 0px 0px 0px;
    z-index: 1000000;
  }
  ```

  **Must NOT do**:
  - Do not use deprecated `clip: rect()`
  - Do not add animation/transition properties
  - Do not change existing margins/positioning of base labels

  **Parallelizable**: NO (depends on 1)

  **References**:
  
  **Pattern References**:
  - `buff_timer_virgin/panorama/styles/hud_timer.css:153-167` - Existing RejuvTime styling to extend
  - `buff_timer_virgin/panorama/styles/hud_timer.css:137-151` - Existing BuffTime styling to extend
  - `example/panorama/styles/ability_hud_elements/element_progress_bar_text.css:83-99` - Shadow and clip styling pattern

  **Acceptance Criteria**:

  **Manual Verification:**
  - [ ] Open `hud_timer.css` and verify `#RejuvTime` has `color: #808080` and thick shadow
  - [ ] Open `hud_timer.css` and verify `#RejuvTimeClip` has `color: #ffffff` and `clip-path: inset(...)`
  - [ ] Open `hud_timer.css` and verify `#BuffTime` has `color: #808080` and black thick shadow
  - [ ] Open `hud_timer.css` and verify `#BuffTimeClip` has `color: #ffffff` and `clip-path: inset(...)`

  **Commit**: NO (groups with 1, 3)

---

- [x] 3. Add JavaScript Progress Logic

  **What to do**:
  - Add `rLabClip` and `buffLabClip` to UI object (line 40)
  - Cache overlay panels at boot (after line 55)
  - Add `_lastRejuvClip` and `_lastBuffClip` DOM write guard variables (near line 30)
  - In main loop (around line 75), calculate progress percentages:
    - `rejuvPct = spawnWait ? 100 : Math.floor((1 - counter / SEQ[idx].d) * 100)`
    - `buffPct = Math.floor((1 - buffRem / BRIDGE_DUR) * 100)`
  - Apply clip-path with write guards:
    - RejuvTime (L→R): `clip-path: inset(0% ${100-pct}% 0% 0%)`
    - BuffTime (R→L): `clip-path: inset(0% 0% 0% ${100-pct}%)`
  - Apply color interpolation for BuffTime:
    - `const g = Math.floor(255 * (1 - buffPct/100))`
    - `rgb(255, ${g}, ${g})` for white→red transition
  - Sync overlay text with base label text
  - Reset clip to 0% in `startPhase()` and `reset()` functions

  **Must NOT do**:
  - Do not create new polling/scheduling loops
  - Do not add more than 2 new state variables
  - Do not add animation/transition logic
  - Do not abstract into utility functions

  **Parallelizable**: NO (depends on 2)

  **References**:
  
  **Pattern References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:40` - UI object pattern for caching panels
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:54-62` - Boot panel caching pattern
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:30` - DOM write guard variables location
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:75-77` - Main loop where timer text is updated (integrate here)
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:216-217` - Style manipulation pattern for clip-path
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:469` - startPhase function (add clip reset)
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:477` - reset function (add clip reset)

  **Acceptance Criteria**:

  **Manual Verification:**
  - [ ] `UI.rLabClip` and `UI.buffLabClip` exist in UI object
  - [ ] `_lastRejuvClip` and `_lastBuffClip` variables declared
  - [ ] Progress calculation uses `counter / SEQ[idx].d` for rejuv
  - [ ] Progress calculation uses `buffRem / BRIDGE_DUR` for buff
  - [ ] clip-path applied with write guards (only update when value changes)
  - [ ] BuffTime color interpolates from white to red
  - [ ] Overlay text synced with base label text
  - [ ] `startPhase()` resets clip to 0%
  - [ ] `reset()` resets clip to 0%

  **Commit**: NO (groups with 1, 2)

---

- [x] 4. Compile and Test In-Game

  **What to do**:
  - Run sr2compiler to compile the modified mod
  - Launch Deadlock with `-dev -tools`
  - Enter sandbox mode or play until game timer is visible
  - Verify RejuvTime progress bar behavior
  - Verify BuffTime progress bar behavior
  - Check F7 console for any errors
  - Test phase transitions (rejuv spawn → next countdown)

  **Compile Command**:
  ```powershell
  "F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
  ```

  **Must NOT do**:
  - Do not skip compilation step
  - Do not test without `-dev` flag (need console access)

  **Parallelizable**: NO (final task)

  **References**:
  
  **Documentation References**:
  - `AGENTS.md:Build Commands` - Compile command pattern
  - `README.md:How to Run` - Launch and testing instructions

  **Acceptance Criteria**:

  **Manual Verification (in-game):**
  - [ ] Compile succeeds with no errors
  - [ ] Launch Deadlock with `-dev -tools`
  - [ ] Enter sandbox mode
  - [ ] RejuvTime shows grey base text with thick shadow
  - [ ] RejuvTime white overlay fills left-to-right as countdown approaches 0
  - [ ] At "Spawn" text, RejuvTime overlay is 100% visible (all white)
  - [ ] After spawn claimed, RejuvTime resets to 0% for next phase
  - [ ] BuffTime shows grey base text with black thick shadow
  - [ ] BuffTime overlay fills right-to-left as buff spawn approaches
  - [ ] BuffTime overlay color transitions from white to red as it fills
  - [ ] At 0:00, BuffTime overlay is 100% visible and red
  - [ ] F7 console shows no `[ERR]` messages related to clip-path
  - [ ] No visible frame drops or stuttering

  **Evidence Required:**
  - [ ] Screenshot of RejuvTime at ~50% progress (partial fill)
  - [ ] Screenshot of RejuvTime at "Spawn" (100% fill)
  - [ ] Screenshot of BuffTime at ~50% progress (partial fill, orange-ish)
  - [ ] Screenshot of BuffTime at 0:00 (100% fill, red)

  **Commit**: YES
  - Message: `feat(buff_timer): add clip progress bars to rejuv and buff timers`
  - Files: `panorama/layout/hud.xml`, `panorama/styles/hud_timer.css`, `panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: Compile must succeed

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 4 | `feat(buff_timer): add clip progress bars to rejuv and buff timers` | hud.xml, hud_timer.css, rejuvnbufftimer.js | Compile + in-game test |

---

## Success Criteria

### Verification Commands
```powershell
# Compile the mod
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
# Expected: Compilation completes without errors
```

### Final Checklist
- [ ] RejuvTime has grey base + white L→R fill progress bar
- [ ] BuffTime has grey base + white→red R→L fill progress bar
- [ ] Progress is 0% at countdown start, 100% at spawn
- [ ] "Spawn" text shows 100% progress (all white)
- [ ] Phase transitions reset progress to 0%
- [ ] No frame drops during gameplay
- [ ] No console errors
- [ ] All "Must NOT Have" guardrails respected
