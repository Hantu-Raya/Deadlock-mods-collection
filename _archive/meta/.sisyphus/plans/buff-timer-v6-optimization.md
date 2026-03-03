# Buff Timer Virgin v6.0 — Gaming Optimization

## TL;DR

> **Quick Summary**: Optimize buff_timer_virgin (v5.6→v6.0) for low CPU/memory usage by redesigning the dual-label clip system into a single-text + overlay panel approach, reducing BHasClass calls, adding memory cleanup, and applying minor CPU wins — all while preserving timer accuracy and visual fidelity.
> 
> **Deliverables**:
> - Redesigned clip system: 1 Label + 1 Panel overlay per timer (was 2 Labels)
> - Reduced DOM element count (−2 Labels from XML)
> - Optimized player classification (fewer BHasClass calls per scan)
> - Bounded `_playerState` memory growth with periodic cleanup
> - Early-exit guards on `updateClaimProgress()` hot path
> - Updated AGENTS.md documentation
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves after gate
> **Critical Path**: Task 0 (gate) → Task 1 (XML/CSS) → Task 2 (JS clip refactor) → Task 5 (AGENTS.md)

---

## Context

### Original Request
Optimize buff_timer_virgin for gaming — low CPU usage and low memory usage while maintaining accurate info. Match the design (two timer panels above minimap with dark rounded containers, MM:SS monospace font, split-color progress). Make the clip progression work with "one text" (single label instead of dual-label system).

### Interview Summary
**Key Discussions**:
- User chose "Overlay panel + clip" approach: single Label for text + colored Panel overlay with `clip: rect()` for split-color progress
- Design reference: dark semi-transparent rounded containers, icons on outer edges, monospace MM:SS font
- All existing features (rejuv timer, bridge buff, powerup claims, enemy linger, 6-panel glow) must be preserved

**Research Findings**:
- `clip-path: inset()` DOES NOT work in Panorama — must use `style.clip = rect()`
- Panorama has no pseudo-elements or `background-clip: text`
- Current dual-label system costs: 2 extra `.text` syncs + 2 clip string constructions per tick
- `_playerState` object grows unboundedly during a game (never pruned until full reset)
- `updateClaimProgress()` runs every tick even when no claims are active (missing early-exit)

### Metis Review
**Identified Gaps** (addressed):
- **BLOCKING**: `style.clip = rect()` on Panel background-color is unverified in Panorama → Added Gate Task (Task 0)
- **Unbounded growth**: `_playerState` never cleaned during gameplay → Added cleanup task
- **Missing early-exit**: `updateClaimProgress()` runs every tick unconditionally → Added optimization
- **Edge case**: spawnWait state must show "Spawn" text with full overlay coverage → Specified in acceptance criteria
- **Edge case**: Overlay must inherit parent opacity transitions → Specified in CSS
- **Edge case**: `_playerState` cleanup must not conflict with active `_lingerState` references → Coordinated in implementation

---

## Work Objectives

### Core Objective
Reduce CPU and memory overhead of buff_timer_virgin while preserving all timer accuracy and visual fidelity, using a single-text + overlay panel clip approach.

### Concrete Deliverables
- Modified `hud.xml`: Remove `BuffTimeClip` and `RejuvTimeClip` Labels, add `BuffOverlay` and `RejuvOverlay` Panels
- Modified `hud_timer.css`: Styling for overlay panels, remove clip label styles
- Modified `rejuvnbufftimer.js`: Refactored clip system, BHasClass optimization, _playerState cleanup, early-exit guards
- Updated `buff_timer_virgin/AGENTS.md`: Document v6.0 changes

### Definition of Done
- [ ] sr2compiler compiles successfully (exit code 0)
- [ ] Timer countdown accuracy unchanged (same phase durations, same fmt() output)
- [ ] Visual split-color progress effect works via overlay panel
- [ ] `_playerState` object has bounded size (entries pruned on phase transitions)
- [ ] No new features introduced, no existing features removed

### Must Have
- Single Label per timer (no dual-label text sync)
- Split-color progress visualization via overlay Panel + clip
- Bounded `_playerState` growth
- Successful sr2compiler compilation
- All timer phases work correctly (SEQ[0..3], bridge buff cycle, spawn detection)

### Must NOT Have (Guardrails)
- DO NOT touch the 6-panel glow system (buff_claim.css gradient panels)
- DO NOT touch claim indicator boxes (ClaimRing, ClaimIcon, ClaimTimer)
- DO NOT change timing constants (TICK_FAST, TICK_NORM, TTLs, intervals, phase durations)
- DO NOT refactor `gTime()` fallback chain
- DO NOT restructure the main `loop()` function — modify individual sections only
- DO NOT touch `scanPowerups()` or `monitorPowerups()` allocation patterns (runs ~3x per 5-min cycle)
- DO NOT add lookup tables, pre-computed arrays, or CSS custom properties
- DO NOT pool linger panels ($.CreatePanel runs at most 6x total per game)
- DO NOT add new UI elements or features

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (Source 2 resourcecompiler only)
- **User wants tests**: NO — Manual verification
- **Framework**: None (Panorama JS has no test framework)

### Automated Verification

**Build Verification (every task):**
```powershell
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
# Assert: Exits successfully, produces .vjs_c, .vcss_c, .vxml_c in buff_timer_virgin_compiled/
```

**Code-Level Verification:**
```bash
# Verify no references to removed panels remain
grep -r "BuffTimeClip\|RejuvTimeClip" buff_timer_virgin/panorama/
# Assert: Only comments or zero matches

# Verify _playerState cleanup exists
grep -n "_playerState" buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js
# Assert: Contains cleanup/prune logic (delete or reassignment)

# Verify early-exit guard exists
grep -n "updateClaimProgress" buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js
# Assert: Contains early return when both _claimStart are 0
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (GATE — Must pass before proceeding):
└── Task 0: Prototype Panel+clip+backgroundColor in Panorama

Wave 1 (After Gate passes):
├── Task 1: XML/CSS restructure (remove clip labels, add overlay panels)
└── Task 3: BHasClass optimization in JS (independent of clip system)

Wave 2 (After Wave 1):
├── Task 2: JS clip refactor (depends on Task 1 for new panel IDs)
└── Task 4: _playerState cleanup + updateClaimProgress early-exit (independent)

Wave 3 (After Wave 2):
└── Task 5: Update AGENTS.md documentation

Critical Path: Task 0 → Task 1 → Task 2 → Task 5
Parallel Speedup: ~30% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 0 | None | 1, 2, 3, 4 | None (gate) |
| 1 | 0 | 2 | 3 |
| 2 | 1 | 5 | 4 |
| 3 | 0 | 5 | 1 |
| 4 | 0 | 5 | 2 |
| 5 | 2, 3, 4 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 0 | 0 | delegate_task(category="quick", load_skills=[], run_in_background=false) |
| 1 | 1, 3 | delegate_task(category="quick", ..., run_in_background=true) × 2 |
| 2 | 2, 4 | delegate_task(category="unspecified-low", ..., run_in_background=true) × 2 |
| 3 | 5 | delegate_task(category="writing", ..., run_in_background=false) |

---

## TODOs

- [ ] 0. **GATE: Verify Panel + clip + backgroundColor in Panorama**

  **What to do**:
  - In `hud.xml`, temporarily add a test Panel inside `#Buff`:
    ```xml
    <Panel id="TestOverlay" style="width:100%; height:100%; background-color: rgba(255,255,255,0.8); clip: rect(0%,50%,100%,0%); z-index: 3;" />
    ```
  - Compile with sr2compiler
  - Launch Deadlock with `-dev -tools`
  - Observe if the TestOverlay Panel renders with the clip applied to its background-color
  - If YES: Gate passes, proceed with remaining tasks
  - If NO: Pivot to CSS class-based approach (5-10 discrete width% classes on a Panel overlay instead of continuous clip). Update Tasks 1-2 accordingly.
  - Remove the TestOverlay Panel after verification

  **Must NOT do**:
  - Change any existing panels or JS logic
  - Leave test panel in place after verification

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file XML edit + compile + verify pattern
  - **Skills**: []
    - No special skills needed — just XML edit and sr2compiler
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not applicable — game verification, not browser
    - `frontend-ui-ux`: Not needed for a prototype test

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Gate (blocks everything)
  - **Blocks**: Tasks 1, 2, 3, 4, 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `buff_timer_virgin/panorama/layout/hud.xml:193-199` — Current #Buff panel structure showing where TestOverlay should be added (inside the Buff panel, after existing children)
  - `buff_timer_virgin/panorama/styles/hud_timer.css:60-77` — Current #Buff CSS showing z-index and positioning context

  **Documentation References**:
  - `buff_timer_virgin/AGENTS.md` — Anti-patterns section: "DO NOT use `clip-path: inset()`; use `style.clip` with `rect(top%, right%, bottom%, left%)`"
  - `.sisyphus/notepads/clip-progress-bar/` — Documents that `clip: rect()` works on Labels; this task tests if it works on Panel `background-color`
  - Root `AGENTS.md` — Build command and CSS conventions

  **WHY Each Reference Matters**:
  - hud.xml:193-199: Shows exact XML insertion point and existing panel hierarchy
  - hud_timer.css:60-77: Shows z-index layering (TestOverlay needs z-index > 2)
  - AGENTS.md anti-patterns: Confirms `rect()` syntax is correct, warns against `clip-path: inset()`

  **Acceptance Criteria**:

  **Automated Verification:**
  ```powershell
  # Compile
  "F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
  # Assert: Exit code 0
  ```

  ```bash
  # Verify TestOverlay is removed after verification
  grep -c "TestOverlay" buff_timer_virgin/panorama/layout/hud.xml
  # Assert: 0 (removed after test)
  ```

  **In-Game Verification Protocol (agent executes via interactive_bash tmux):**
  ```
  1. Launch Deadlock with -dev -tools
  2. Enter a game or sandbox mode
  3. Press F7 for console
  4. Observe the #Buff timer panel area
  5. If a white rectangle with a clipped left edge is visible overlaying the timer → PASS
  6. If no visible clip effect on the Panel background → FAIL (pivot to class-based approach)
  ```

  **Evidence to Capture:**
  - [ ] sr2compiler output showing successful compilation
  - [ ] PASS/FAIL determination for Panel clip rendering

  **Commit**: NO (prototype only, reverted after test)

---

- [ ] 1. **XML/CSS Restructure: Replace Clip Labels with Overlay Panels**

  **What to do**:
  - In `hud.xml`:
    - Remove `<Label id="BuffTimeClip" .../>` (line 196)
    - Remove `<Label id="RejuvTimeClip" .../>` (line 203)
    - Add `<Panel id="BuffOverlay" class="timer-overlay" hittest="false" />` inside `#BuffTimeWrapper` (after BuffTime label)
    - Add `<Panel id="RejuvOverlay" class="timer-overlay" hittest="false" />` inside `#RejuvTimeWrapper` (after RejuvTime label)
  - In `hud_timer.css`:
    - Remove `#BuffTimeClip, #RejuvTimeClip` rule block (lines 175-189)
    - Add new `.timer-overlay` rule:
      ```css
      .timer-overlay
      {
        position: 0px 0px 0px;
        width: 100%;
        height: 100%;
        z-index: 2;
        clip: rect(0%, 0%, 100%, 0%);
      }
      ```
    - Add `#BuffOverlay` specific rule:
      ```css
      #BuffOverlay
      {
        background-color: #ffffff;
        clip: rect(0%, 100%, 100%, 100%);
      }
      ```
    - Add `#RejuvOverlay` specific rule:
      ```css
      #RejuvOverlay
      {
        background-color: #ffffff;
        clip: rect(0%, 0%, 100%, 0%);
      }
      ```
    - Change `#BuffTime, #RejuvTime` color from `#808080` to the appropriate base color (gray for "depleted" portion)
    - Ensure `.timer-wrapper` has `flow-children: none;` (already present at line 139 — overlay needs absolute positioning over the label)
  - Ensure overlay inherits parent opacity transitions (test: when `#Buff` opacity→0, overlay should also fade)

  **Must NOT do**:
  - Change any glow panels, claim panels, or linger panels in hud.xml
  - Modify buff_claim.css
  - Change any panel IDs used by claim/glow/linger systems
  - Add any new JS logic (this is XML/CSS only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: XML/CSS structural edits with known patterns
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Needed for correct CSS overlay positioning and clip setup
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not browser-based
    - `git-master`: No git operations needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 3)
  - **Blocks**: Task 2
  - **Blocked By**: Task 0

  **References**:

  **Pattern References**:
  - `buff_timer_virgin/panorama/layout/hud.xml:192-210` — Current timer panel XML structure. Lines 194-197 show BuffTimeWrapper with dual labels. Lines 200-204 show RejuvTimeWrapper with dual labels. The clip Labels (BuffTimeClip, RejuvTimeClip) are what gets replaced with overlay Panels.
  - `buff_timer_virgin/panorama/styles/hud_timer.css:137-155` — `.timer-wrapper` rule at L137-145 already has `flow-children: none;` which is needed for absolute positioning of the overlay. #Buff .timer-wrapper (L147) and #Rejuv .timer-wrapper (L152) have margin offsets for icon space.
  - `buff_timer_virgin/panorama/styles/hud_timer.css:157-189` — Current dual-label CSS rules. L158-172 is the base label style (#BuffTime, #RejuvTime). L175-189 is the clip label style (#BuffTimeClip, #RejuvTimeClip) — this entire block gets removed and replaced with `.timer-overlay` rules.

  **API/Type References**:
  - Root `AGENTS.md` — CSS conventions: `overflow: noclip;` for glows, `visibility: collapse;` not `display: none`, `pre-transform-scale2d` for animations

  **Documentation References**:
  - `buff_timer_virgin/AGENTS.md` — CSS Optimizations section: `transition-property: opacity` instead of `width,height` to avoid layout reflows. Apply same principle to overlay.
  - `.sisyphus/notepads/clip-progress-bar/` — Confirms `clip: rect(top%, right%, bottom%, left%)` syntax for Panorama CSS

  **WHY Each Reference Matters**:
  - hud.xml:192-210: Exact insertion/deletion points — executor must know which Labels to remove and where to add Panels
  - hud_timer.css:137-189: Complete CSS context — executor needs to understand the wrapper layout, existing z-index layering, and which rules to delete vs modify
  - AGENTS.md CSS conventions: Prevents executor from using anti-patterns (clip-path, display:none, scale3d)

  **Acceptance Criteria**:

  **Automated Verification:**
  ```powershell
  # Compile
  "F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
  # Assert: Exit code 0
  ```

  ```bash
  # Verify clip labels removed
  grep -c "BuffTimeClip\|RejuvTimeClip" buff_timer_virgin/panorama/layout/hud.xml
  # Assert: 0

  # Verify overlay panels added
  grep -c "BuffOverlay\|RejuvOverlay" buff_timer_virgin/panorama/layout/hud.xml
  # Assert: 2

  # Verify CSS overlay rules exist
  grep -c "timer-overlay" buff_timer_virgin/panorama/styles/hud_timer.css
  # Assert: >= 1

  # Verify old clip CSS removed
  grep -c "BuffTimeClip\|RejuvTimeClip" buff_timer_virgin/panorama/styles/hud_timer.css
  # Assert: 0
  ```

  **Evidence to Capture:**
  - [ ] sr2compiler successful compilation output
  - [ ] grep results confirming panel additions/removals

  **Commit**: YES (groups with Task 1 only)
  - Message: `refactor(buff-timer): replace dual-label clip with overlay panels in XML/CSS`
  - Files: `hud.xml`, `hud_timer.css`
  - Pre-commit: sr2compiler compilation

---

- [ ] 2. **JS Clip Refactor: Wire Overlay Panels Instead of Clip Labels**

  **What to do**:
  - In `rejuvnbufftimer.js`:
    - **Boot function** (lines 170-209):
      - Replace `UI.rLabClip = r.FindChildTraverse("RejuvTimeClip")` → `UI.rOverlay = r.FindChildTraverse("RejuvOverlay")`
      - Replace `UI.buffLabClip = r.FindChildTraverse("BuffTimeClip")` → `UI.buffOverlay = r.FindChildTraverse("BuffOverlay")`
    - **UI object** (lines 117-142):
      - Replace `rLabClip: null` → `rOverlay: null`
      - Replace `buffLabClip: null` → `buffOverlay: null`
    - **Rejuv clip section** (lines 267-279):
      - Remove `UI.rLabClip.text = ...` (no text on overlay Panel)
      - Change `UI.rLabClip.style.clip = rejuvClip` → `UI.rOverlay.style.clip = rejuvClip`
      - Keep the same clip formula: `"rect(0%," + p + "%,100%,0%)"`
      - During `spawnWait`: Set overlay to full coverage `rect(0%,100%,100%,0%)`
    - **Buff clip section** (lines 312-333):
      - Remove `UI.buffLabClip.text = t` (no text on overlay Panel)
      - Change `UI.buffLabClip.style.clip = buffClip` → `UI.buffOverlay.style.clip = buffClip`
      - Keep the same clip formula: `"rect(0%,100%,100%," + p + "%)"`
      - Change color write: `UI.buffLabClip.style.color = newColor` → `UI.buffOverlay.style.backgroundColor = newColor`
      - Change guard variable to reflect backgroundColor
    - **DOM write guard variables** (lines 98-100):
      - `_lastRejuvClip` — keep, still guards clip string
      - `_lastBuffClip` — keep, still guards clip string
      - `_lastBuffClipColor` — keep, now guards backgroundColor
    - **Reset function** (lines 1250-1301):
      - Replace all `UI.rLabClip` → `UI.rOverlay`
      - Replace all `UI.buffLabClip` → `UI.buffOverlay`
      - Remove `.text = ""` calls (Panels have no text property)
      - Reset: `UI.rOverlay.style.clip = "rect(0%,0%,100%,0%)"` (empty)
      - Reset: `UI.buffOverlay.style.clip = "rect(0%,100%,100%,100%)"` (empty)
      - Reset: `UI.buffOverlay.style.backgroundColor = "#ffffff"`
    - **startPhase function** (lines 1143-1158):
      - Replace `UI.rLabClip` → `UI.rOverlay`
      - Remove `.text = ""` call

  **Must NOT do**:
  - Change clip formulas (the math is correct and tested)
  - Change timing logic, phase transitions, or any countdown calculations
  - Modify `gTime()`, `parseSec()`, `fmt()`, or any utility functions
  - Touch glow, claim, or linger code
  - Add new state variables (reuse existing guards)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Systematic find-and-replace with behavioral understanding required
  - **Skills**: []
    - No special skills needed — pure JS refactoring
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not visual design work
    - `git-master`: No git operations in this task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1 (needs new panel IDs in XML)

  **References**:

  **Pattern References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:117-142` — UI object definition. Shows `rLabClip: null` at L125 and `buffLabClip: null` at L129 — these become `rOverlay` and `buffOverlay`.
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:170-209` — Boot function. L178: `UI.rLabClip = r.FindChildTraverse("RejuvTimeClip")` and L179: `UI.buffLabClip = r.FindChildTraverse("BuffTimeClip")` — change panel IDs.
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:267-279` — Rejuv clip update section. L275-278 set clip + text on rLabClip — remove text write, change target to rOverlay.
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:312-333` — Buff clip update section. L320-323 set clip + text on buffLabClip, L326-331 set color — change all to buffOverlay, change `style.color` to `style.backgroundColor`.
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:1250-1301` — Reset function. L1290-1299 reset clip labels — update to overlay pattern.
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:1143-1158` — startPhase function. L1154-1157 reset clip label — update to overlay pattern.

  **Documentation References**:
  - `buff_timer_virgin/AGENTS.md` — DOM write guard pattern: `if (x !== _lastX) { write; _lastX = x; }` — preserve this pattern for all overlay writes
  - `buff_timer_virgin/AGENTS.md` — Safety pattern: `?.IsValid?.()` — apply to all overlay panel access

  **WHY Each Reference Matters**:
  - L117-142: Executor must know the exact property names being renamed in the UI object
  - L170-209: Panel ID strings must match the new XML panel IDs from Task 1
  - L267-279 + L312-333: These are the hot-path clip update sections — the core of the refactor
  - L1250-1301 + L1143-1158: State reset paths that also reference clip labels — must not be missed

  **Acceptance Criteria**:

  **Automated Verification:**
  ```powershell
  # Compile
  "F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
  # Assert: Exit code 0
  ```

  ```bash
  # Verify no references to old clip labels remain in JS
  grep -c "rLabClip\|buffLabClip\|BuffTimeClip\|RejuvTimeClip" buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js
  # Assert: 0

  # Verify new overlay references exist
  grep -c "rOverlay\|buffOverlay\|BuffOverlay\|RejuvOverlay" buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js
  # Assert: >= 6 (UI def + boot + clip update + reset + startPhase)

  # Verify no .text writes to overlay panels
  grep "Overlay\.text" buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js
  # Assert: 0 matches (Panels don't have .text)

  # Verify backgroundColor is used instead of color for buff overlay
  grep "buffOverlay.*backgroundColor" buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js
  # Assert: >= 1
  ```

  **State Verification (expected clip values):**
  ```
  State: buffRem = 150 (50%)
    → UI.buffOverlay.style.clip = "rect(0%,100%,100%,50%)"
    → UI.buffOverlay.style.backgroundColor = "rgb(255,128,128)" (approx)
  
  State: rejuv counter = 300 of 600 (50%)
    → UI.rOverlay.style.clip = "rect(0%,50%,100%,0%)"
  
  State: spawnWait = true
    → UI.rOverlay.style.clip = "rect(0%,100%,100%,0%)" (full)
  
  State: reset(1)
    → UI.rOverlay.style.clip = "rect(0%,0%,100%,0%)" (empty)
    → UI.buffOverlay.style.clip = "rect(0%,100%,100%,100%)" (empty)
    → UI.buffOverlay.style.backgroundColor = "#ffffff"
  ```

  **Evidence to Capture:**
  - [ ] sr2compiler successful compilation output
  - [ ] grep results confirming no old references remain

  **Commit**: YES
  - Message: `refactor(buff-timer): wire overlay panels in JS, eliminate text sync`
  - Files: `rejuvnbufftimer.js`
  - Pre-commit: sr2compiler compilation

---

- [ ] 3. **BHasClass Optimization: Reduce Player Classification Calls**

  **What to do**:
  - In `rejuvnbufftimer.js`, optimize `checkEnemyLinger()` (lines 862-915) and `getPlayersNearPowerup()` (lines 922-986):
    - **Combine ally classification** (L976): Currently checks `btn.BHasClass("friend") || btn.BHasClass("ally") || btn.BHasClass("team1")` — 3 calls per button. Investigate if `team1` alone suffices (log which class is actually present). If uncertain, keep all 3 but extract to a helper:
      ```javascript
      function isAlly(btn) { return btn.BHasClass("team1") || btn.BHasClass("friend") || btn.BHasClass("ally"); }
      function isEnemy(btn) { return btn.BHasClass("team2") || btn.BHasClass("enemy"); }
      ```
    - **Cache classification per button** in the shared `_playerState` object:
      ```javascript
      // In _playerState entries, add a `team` field:
      // ps.team = 0 (unknown), 1 (ally), 2 (enemy)
      // Set on first classification, reuse in subsequent calls within same cache TTL
      if (!ps.team) {
        ps.team = isAlly(btn) ? 1 : isEnemy(btn) ? 2 : 0;
      }
      ```
    - **Deduplicate classification between checkEnemyLinger and getPlayersNearPowerup**: Both iterate `_playerCache` and both call BHasClass for team checks. With `ps.team` cached, the second function skips those calls entirely.
    - **Optimize `isHideout()`** (L1396-1406): Checks 3 casing variants of "connectedToHideout". Test which one the game actually uses. For safety, keep all 3 but order the most likely first.

  **Must NOT do**:
  - Change the classification logic outcome (same ally/enemy determination)
  - Modify timing or scheduling of checkEnemyLinger or getPlayersNearPowerup
  - Touch the linger show/hide/cancel functions
  - Change _playerCache TTL (800ms — tuned through production use)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Focused JS optimization with clear patterns
  - **Skills**: []
    - No special skills needed
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not visual work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 5
  - **Blocked By**: Task 0

  **References**:

  **Pattern References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:862-915` — `checkEnemyLinger()` function. L881-882 check `player` + `enemy`/`team2` classes. L885 checks `playerdead`. L886 checks `active`. These are the BHasClass calls to optimize.
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:922-986` — `getPlayersNearPowerup()` function. L941 checks `player`. L947 checks `playerdead`. L976-979 check 3 ally classes + 2 enemy classes. These calls are the optimization target.
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:889-895` — _playerState creation pattern. Currently creates `{ x, y, deadTs, wasActive }`. Add `team` field here.
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:1396-1406` — `isHideout()` function checking 3 class name variants.

  **WHY Each Reference Matters**:
  - L862-915: Shows exactly which BHasClass calls are made per enemy button — executor needs to count and optimize
  - L922-986: Shows the ally/enemy classification that's most expensive (5 BHasClass calls per button) — primary optimization target
  - L889-895: Shows _playerState structure — executor adds `team` field here
  - L1396-1406: Minor optimization opportunity — runs every 60s so low priority

  **Acceptance Criteria**:

  **Automated Verification:**
  ```powershell
  # Compile
  "F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
  # Assert: Exit code 0
  ```

  ```bash
  # Verify team caching exists in _playerState
  grep "ps\.team" buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js
  # Assert: >= 2 (assignment + usage)

  # Verify classification helper or cached team is used
  grep -c "isAlly\|isEnemy\|ps\.team" buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js
  # Assert: >= 4
  ```

  **Evidence to Capture:**
  - [ ] sr2compiler successful compilation output

  **Commit**: YES
  - Message: `perf(buff-timer): cache team classification, reduce BHasClass calls`
  - Files: `rejuvnbufftimer.js`
  - Pre-commit: sr2compiler compilation

---

- [ ] 4. **Memory Cleanup + Early-Exit Guards**

  **What to do**:
  - **Bound `_playerState` growth**:
    - Add cleanup on phase transitions (`startPhase()` at L1143 and `startRun()` at L1236):
      ```javascript
      // Prune stale _playerState entries not in current _lingerState
      function prunePlayerState() {
        const keys = Object.keys(_playerState);
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          if (!_lingerState[k]) {  // Don't prune if actively lingering
            delete _playerState[k];
          }
        }
      }
      ```
    - Call `prunePlayerState()` in `startPhase()` and `startRun()`
    - Also call in `reset(1)` (already sets `_playerState = {}` at L1274 — coordinate with linger cleanup at L1278)
  
  - **Add early-exit to `updateClaimProgress()`** (L657):
    ```javascript
    function updateClaimProgress(now) {
      if (_claimStartLeft <= 0 && _claimStartRight <= 0) return;  // Early exit
      // ... existing code
    }
    ```
    This prevents the function from running every tick when no claims are active (the common case — claims only exist for 180s after a 5-min cycle).

  - **Reset `_playerState` team cache** when `_playerCache` is refreshed (team class might change if buttons are recycled):
    - In the cache refresh block (when `_playerCacheTs` expires), clear `ps.team` fields:
      ```javascript
      // When button cache refreshes, team classification may be stale
      // Don't clear entire _playerState — just team field
      ```
      Actually, since `_playerCache` refreshes every 800ms and team classification is stable during a game, this is unnecessary. Skip this sub-task.

  **Must NOT do**:
  - Delete `_playerState` entries that have active `_lingerState` references
  - Change the `_playerState = {}` in `reset(1)` — it already clears everything on full reset
  - Modify updateClaimProgress behavior when claims ARE active
  - Change any timing constants

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, surgical JS changes
  - **Skills**: []
    - No special skills needed
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not visual work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 2)
  - **Blocks**: Task 5
  - **Blocked By**: Task 0

  **References**:

  **Pattern References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:657-733` — `updateClaimProgress()` function. Runs every tick. L659 checks `_claimStartLeft > 0`, L697 checks `_claimStartRight > 0`. Adding early-exit at L658 when both are 0 skips the entire function.
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:1143-1158` — `startPhase()` function. Good place to call `prunePlayerState()` since it marks a game phase transition.
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:1236-1248` — `startRun()` function. First run after hideout. Already clears `trackedPowerups` and `monitoringActive` — add `prunePlayerState()` call here.
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:1250-1301` — `reset(1)` function. L1274: `_playerState = {}`. L1278: `clearAllLingers()`. These already coordinate cleanup — no change needed here.
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:810-813` — `_lingerState` structure. Used to check which enemies are actively lingering (must not prune their _playerState entries).

  **WHY Each Reference Matters**:
  - L657-733: Shows the hot-path function that runs every tick but usually does nothing — early-exit is the #1 quick win
  - L1143 + L1236: Phase transition points where cleanup is safe and natural
  - L1250-1301: Shows existing cleanup coordination — executor must understand the reset flow
  - L810-813: Shows _lingerState structure — executor must check this before pruning _playerState

  **Acceptance Criteria**:

  **Automated Verification:**
  ```powershell
  # Compile
  "F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
  # Assert: Exit code 0
  ```

  ```bash
  # Verify early-exit guard exists
  grep -A2 "function updateClaimProgress" buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js
  # Assert: Contains early return when both _claimStart are <= 0

  # Verify prunePlayerState function exists
  grep "prunePlayerState" buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js
  # Assert: >= 3 (definition + 2 call sites)

  # Verify _lingerState check in prunePlayerState
  grep -A5 "prunePlayerState" buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js
  # Assert: Contains _lingerState check
  ```

  **Evidence to Capture:**
  - [ ] sr2compiler successful compilation output
  - [ ] grep results confirming cleanup and early-exit additions

  **Commit**: YES
  - Message: `perf(buff-timer): add _playerState cleanup and updateClaimProgress early-exit`
  - Files: `rejuvnbufftimer.js`
  - Pre-commit: sr2compiler compilation

---

- [ ] 5. **Update AGENTS.md Documentation for v6.0**

  **What to do**:
  - Update `buff_timer_virgin/AGENTS.md`:
    - Change version from v5.6 to v6.0
    - Update OVERVIEW to mention overlay panel clip system
    - Update STRUCTURE section to reflect new panel IDs (BuffOverlay, RejuvOverlay)
    - Add to PERFORMANCE OPTIMIZATIONS table:
      - Dual-label → overlay panel: Eliminated text sync, reduced DOM elements
      - Team classification caching in _playerState
      - _playerState pruning on phase transitions
      - updateClaimProgress early-exit guard
    - Update CONVENTIONS section:
      - New pattern: `style.backgroundColor` on overlay Panels instead of `style.color` on clip Labels
      - New pattern: Team cache (`ps.team`) in player state
    - Add to ANTI-PATTERNS:
      - DO NOT write `.text` on overlay Panels (they have no text)
      - DO NOT prune `_playerState` entries that have active `_lingerState` references
    - Update the Polling Intervals table if any changed (none should)

  **Must NOT do**:
  - Change any code files in this task
  - Add information about features that weren't implemented

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation update requiring accurate technical writing
  - **Skills**: []
    - No special skills needed
  - **Skills Evaluated but Omitted**:
    - All: This is pure documentation

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential, final)
  - **Blocks**: None
  - **Blocked By**: Tasks 2, 3, 4

  **References**:

  **Pattern References**:
  - `buff_timer_virgin/AGENTS.md` — Current v5.6 documentation. Follow the exact same structure, headings, table formats, and tone when updating.
  - Root `AGENTS.md` — Project-level conventions that the mod AGENTS.md should align with.

  **Documentation References**:
  - All completed tasks (1-4) — Their acceptance criteria and implementation details inform what to document.

  **WHY Each Reference Matters**:
  - buff_timer_virgin/AGENTS.md: Template and structure to follow — don't restructure, just update
  - Root AGENTS.md: Ensures mod-level docs stay consistent with project-level conventions

  **Acceptance Criteria**:

  **Automated Verification:**
  ```bash
  # Verify version updated
  grep "v6.0" buff_timer_virgin/AGENTS.md
  # Assert: >= 1

  # Verify overlay panel documentation
  grep -c "BuffOverlay\|RejuvOverlay\|overlay" buff_timer_virgin/AGENTS.md
  # Assert: >= 2

  # Verify new optimization patterns documented
  grep -c "prunePlayerState\|early-exit\|team.*cache\|backgroundColor" buff_timer_virgin/AGENTS.md
  # Assert: >= 2
  ```

  **Evidence to Capture:**
  - [ ] grep results confirming documentation updates

  **Commit**: YES
  - Message: `docs(buff-timer): update AGENTS.md for v6.0 overlay panel and optimization changes`
  - Files: `buff_timer_virgin/AGENTS.md`
  - Pre-commit: None (markdown only)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 0 | No commit (prototype, reverted) | — | sr2compiler exit 0 |
| 1 | `refactor(buff-timer): replace dual-label clip with overlay panels in XML/CSS` | hud.xml, hud_timer.css | sr2compiler exit 0 |
| 2 | `refactor(buff-timer): wire overlay panels in JS, eliminate text sync` | rejuvnbufftimer.js | sr2compiler exit 0 |
| 3 | `perf(buff-timer): cache team classification, reduce BHasClass calls` | rejuvnbufftimer.js | sr2compiler exit 0 |
| 4 | `perf(buff-timer): add _playerState cleanup and updateClaimProgress early-exit` | rejuvnbufftimer.js | sr2compiler exit 0 |
| 5 | `docs(buff-timer): update AGENTS.md for v6.0 overlay panel and optimization changes` | AGENTS.md | grep checks |

---

## Success Criteria

### Verification Commands
```powershell
# Full build
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
# Expected: Exit code 0, compiled files in buff_timer_virgin_compiled/
```

```bash
# No old clip label references remain anywhere
grep -r "BuffTimeClip\|RejuvTimeClip\|rLabClip\|buffLabClip" buff_timer_virgin/panorama/
# Expected: 0 matches

# Overlay panels properly referenced
grep -c "Overlay" buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js
# Expected: >= 8

# Memory cleanup exists
grep -c "prunePlayerState" buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js
# Expected: >= 3

# Early-exit guard exists
grep -B1 -A1 "_claimStartLeft.*_claimStartRight.*return" buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js
# Expected: 1 match
```

### Final Checklist
- [ ] All "Must Have" present (single label, overlay clip, bounded state, compilation)
- [ ] All "Must NOT Have" absent (no glow changes, no timing changes, no new features)
- [ ] sr2compiler compiles successfully
- [ ] AGENTS.md updated to v6.0
- [ ] All 5 commits clean and atomic
