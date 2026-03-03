# Buff Timer Virgin: Dead Code Removal & Minimal Minification

## Context

### Original Request
Optimize and clean up `buff_timer_virgin/` mod - remove verified dead code, and create a minimal minified version for ease of editing.

### Interview Summary
**Key Discussions**:
- Target files: `rejuvnbufftimer.js` (1435 lines), `buff_claim.css` (522 lines), `hud_timer.css` (379 lines), `hud.xml` (392 lines)
- Goal: Remove verified dead code, clean up unused assets, keep code readable

**Research Findings**:
- AGENTS.md documents "1:1 Slot Pairing" for linger feature but JS uses dynamic `$.CreatePanel` instead
- `LingerOverlay0-5` XML panels are never referenced - JS creates panels dynamically
- `GLOW_CLASSES` array declared but only `GLOW_CLASS_MAP` is used
- Extensive `$.Msg` debug logging throughout (~15 calls)
- CSS has unused `.linger-overlay`, `.linger-question`, `.linger-hidden` selectors

---

## Work Objectives

### Core Objective
Remove verified dead code from JS/CSS/XML and create a clean, minimal version for easier maintenance.

### Concrete Deliverables
- `rejuvnbufftimer.js` - debug logging removed, unused constants removed (~50 lines saved)
- `buff_claim.css` - unused linger selectors removed (~35 lines saved)
- `hud.xml` - unused LingerOverlay panels removed (6 lines saved)
- `AGENTS.md` - updated to reflect actual code state

### Definition of Done
- [ ] All `$.Msg` debug calls removed from JS
- [ ] Unused `GLOW_CLASSES` array removed
- [ ] Unused `_lingerLogTs` and logging logic removed
- [ ] Unused CSS selectors removed (`.linger-overlay`, `.linger-question`, `.linger-hidden`, `lingerPulse`)
- [ ] Unused `LingerOverlay0-5` XML panels removed
- [ ] Mod compiles successfully with sr2compiler
- [ ] All safety patterns preserved

### Must Have
- Remove all debug `$.Msg` logging
- Remove verified dead constants/variables
- Remove unused CSS selectors and keyframes
- Remove unused XML panels
- Preserve all functional behavior

### Must NOT Have (Guardrails)
- DO NOT remove `?.IsValid?.()` safety patterns
- DO NOT remove try-catch wrappers (keep structure, remove only `$.Msg` inside)
- DO NOT remove DOM write guards (`if (t !== _lastRejuvText)` etc.)
- DO NOT remove object pooling (`_posResult`, `_nearResult`, `_pwPos`)
- DO NOT change timing constants or game logic
- DO NOT aggressively minify (keep readable)

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (Source 2 mods, no automated tests)
- **User wants tests**: Manual-only
- **Framework**: sr2compiler for compilation

### Manual QA Procedure
Each task uses sr2compiler verification + in-game visual checks.

---

## Task Flow

```
Task 1 (JS cleanup) ─┐
Task 2 (CSS cleanup) ├→ Task 4 (AGENTS.md) → Task 5 (Final verify)
Task 3 (XML cleanup) ─┘
```

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| A | 1, 2, 3 | Independent file changes |

| Task | Depends On | Reason |
|------|------------|--------|
| 4 | 1, 2, 3 | Needs final code state |
| 5 | 4 | Final verification |

---

## TODOs

- [ ] 1. Remove Dead Code from rejuvnbufftimer.js

  **What to do**:
  
  A. **Remove all `$.Msg` debug logging** (~15 calls):
  - Line 458: `$.Msg("[BT-P][ERR] findMinimap: " + e + "\n");`
  - Line 599: `$.Msg("[BT-P][ERR] showClaimIndicator: " + e + "\n");`
  - Line 748: `$.Msg("[BT-P][ERR] getPanelPos: " + e + "\n");`
  - Line 767: `$.Msg("[LINGER] showLinger called for: " + enemyId + "\n");`
  - Line 768: `$.Msg("[LINGER] Already has state, skipping\n");`
  - Line 769: `$.Msg("[LINGER] Invalid btn\n");`
  - Line 773: `$.Msg("[LINGER] No minimapContainer\n");`
  - Line 788: `$.Msg("[LINGER] btn pos: x=" + bx + " y=" + by + " inverted=" + inverted + "\n");`
  - Line 802: `$.Msg("[LINGER] Positioned at " + bx + "px " + by + "px\n");`
  - Line 813: `$.Msg("[LINGER][ERR] showLinger: " + e + "\n");`
  - Line 899: `$.Msg("[LINGER] Enemy " + id + " | active=" + isActive + " wasActive=" + wasActive + " dead=" + isDead + "\n");`
  - Line 913: `$.Msg("[LINGER] TRIGGER: " + id + " went from active to inactive\n");`
  - Line 916: `$.Msg("[LINGER] Enemy " + id + " reappeared, canceling linger\n");`
  - Line 921: `$.Msg("[LINGER] Found " + enemyCount + " enemies this tick\n");`
  - Line 922: `$.Msg("[LINGER][ERR] checkEnemyLinger: " + e + "\n");`
  - Line 1087: `$.Msg("[BT-P][ERR] scanPowerups: " + e + "\n");`

  B. **Remove unused `GLOW_CLASSES` array** (Lines 155-161):
  ```javascript
  const GLOW_CLASSES = [
    "glow-survival",
    "glow-casting",
    "glow-movement",
    "glow-gun",
    "glow-enemy"
  ];
  ```
  Only `GLOW_CLASS_MAP` (Lines 163-168) is actually used.

  C. **Remove `_lingerLogTs` and conditional logging logic**:
  - Line 858: `let _lingerLogTs = 0;`
  - Lines 864-865: `const shouldLog = now - _lingerLogTs > 3000; if (shouldLog) _lingerLogTs = now;`
  - Lines 898-900: `if (shouldLog) { $.Msg(...); }`
  - Line 921: `if (shouldLog) $.Msg(...);`

  D. **Keep empty catch blocks** - they're intentional for error isolation

  **Must NOT do**:
  - Do NOT remove `?.IsValid?.()` safety patterns
  - Do NOT remove try-catch wrappers (keep empty `catch {}`)
  - Do NOT remove DOM write guards
  - Do NOT remove object pooling

  **Parallelizable**: YES (with 2, 3)

  **References**:
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js` - Full source (1435 lines)
  - `buff_timer_virgin/AGENTS.md:Retained Safety Patterns` - Patterns to preserve

  **Acceptance Criteria**:
  - [ ] `Select-String -Path "...\rejuvnbufftimer.js" -Pattern '\$\.Msg'` returns no matches
  - [ ] `Select-String -Path "...\rejuvnbufftimer.js" -Pattern 'GLOW_CLASSES'` returns no matches
  - [ ] `Select-String -Path "...\rejuvnbufftimer.js" -Pattern '_lingerLogTs'` returns no matches
  - [ ] File still contains `?.IsValid?.()` patterns
  - [ ] sr2compiler compiles without error

  **Commit**: YES
  - Message: `refactor(buff_timer): remove debug logging and dead code`
  - Files: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
  - Pre-commit: sr2compiler build

---

- [ ] 2. Clean Up buff_claim.css

  **What to do**:
  
  Remove unused linger-related styles (JS uses `.linger-question-child` via dynamic panel creation, not these static classes):
  
  A. **Remove `.linger-overlay` block** (Lines 459-470):
  ```css
  .linger-overlay {
    position: absolute;
    width: 24px;
    ...
  }
  ```

  B. **Remove `.linger-overlay.active` block** (Lines 472-474):
  ```css
  .linger-overlay.active {
    opacity: 1;
  }
  ```

  C. **Remove `.linger-question` block** (Lines 476-489):
  ```css
  .linger-question {
    position: absolute;
    ...
  }
  ```

  D. **Remove `.linger-hidden` block** (Lines 491-494):
  ```css
  .linger-hidden {
    opacity: 0 !important;
    visibility: collapse;
  }
  ```

  E. **Remove `lingerPulse` keyframe** (Lines 516-520):
  ```css
  @keyframes 'lingerPulse' {
    0% { pre-transform-scale2d: 1.0; }
    50% { pre-transform-scale2d: 1.15; }
    100% { pre-transform-scale2d: 1.0; }
  }
  ```

  F. **KEEP `.linger-question-child` styles** (Lines 496-514) - these ARE used by JS

  **Must NOT do**:
  - Do NOT remove any `.glow-*` classes
  - Do NOT remove `.minimap-claim-box` styles
  - Do NOT remove `.linger-question-child` class

  **Parallelizable**: YES (with 1, 3)

  **References**:
  - `buff_timer_virgin/panorama/styles/buff_claim.css:459-520` - Dead linger styles
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:795` - `$.CreatePanel("Label", container, qId)` with `linger-question-child` class

  **Acceptance Criteria**:
  - [ ] `.linger-overlay` selector no longer in file
  - [ ] `.linger-question` selector (not `.linger-question-child`) no longer in file
  - [ ] `.linger-hidden` selector no longer in file
  - [ ] `lingerPulse` keyframe no longer in file
  - [ ] `.linger-question-child` styles still present
  - [ ] sr2compiler compiles without error

  **Commit**: YES
  - Message: `refactor(buff_timer): remove unused CSS linger selectors`
  - Files: `buff_timer_virgin/panorama/styles/buff_claim.css`
  - Pre-commit: sr2compiler build

---

- [ ] 3. Clean Up hud.xml

  **What to do**:
  
  Remove unused `LingerOverlay0-5` panels (Lines 236-241). The linger system uses dynamic `$.CreatePanel` instead of these pre-defined slots.

  Remove these 6 lines:
  ```xml
  <Panel id="LingerOverlay0" class="linger-overlay" hittest="false"><Label class="linger-question" text="?" /></Panel>
  <Panel id="LingerOverlay1" class="linger-overlay" hittest="false"><Label class="linger-question" text="?" /></Panel>
  <Panel id="LingerOverlay2" class="linger-overlay" hittest="false"><Label class="linger-question" text="?" /></Panel>
  <Panel id="LingerOverlay3" class="linger-overlay" hittest="false"><Label class="linger-question" text="?" /></Panel>
  <Panel id="LingerOverlay4" class="linger-overlay" hittest="false"><Label class="linger-question" text="?" /></Panel>
  <Panel id="LingerOverlay5" class="linger-overlay" hittest="false"><Label class="linger-question" text="?" /></Panel>
  ```

  **Must NOT do**:
  - Do NOT remove `MinimapGlowLeft/Right` panels
  - Do NOT remove `MinimapBuffClaimLeft/Right` panels
  - Do NOT remove `HudMinimapContainer`

  **Parallelizable**: YES (with 1, 2)

  **References**:
  - `buff_timer_virgin/panorama/layout/hud.xml:236-241` - Unused panels
  - `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:792-801` - Dynamic panel creation

  **Acceptance Criteria**:
  - [ ] `Select-String -Path "...\hud.xml" -Pattern 'LingerOverlay'` returns no matches
  - [ ] `MinimapGlowLeft` still present in file
  - [ ] `MinimapBuffClaimLeft` still present in file
  - [ ] sr2compiler compiles without error

  **Commit**: YES
  - Message: `refactor(buff_timer): remove unused LingerOverlay XML panels`
  - Files: `buff_timer_virgin/panorama/layout/hud.xml`
  - Pre-commit: sr2compiler build

---

- [ ] 4. Update AGENTS.md Documentation

  **What to do**:
  
  A. **Update STRUCTURE section**: Line count will be reduced (~1380 lines after cleanup)
  
  B. **Update ENEMY LINGER FEATURE section**: Remove outdated "1:1 Slot Pairing" architecture:
  - Remove "6 Overlay Panels" description
  - Remove "_enemySlots" and "_slotUsed" references (don't exist in code)
  - Document actual dynamic panel creation: `$.CreatePanel("Label", container, qId)` with `linger-question-child` class
  
  C. **Add entry to "Removed Dead Fallbacks" table**:
  ```markdown
  | `GLOW_CLASSES` array | Only `GLOW_CLASS_MAP` used |
  | `$.Msg` debug calls | Production cleanup |
  | `LingerOverlay0-5` XML | Dynamic panels used |
  | `.linger-overlay` CSS | `.linger-question-child` used |
  ```

  **Must NOT do**:
  - Do NOT change performance tuning values
  - Do NOT change polling interval documentation

  **Parallelizable**: NO (depends on 1, 2, 3)

  **References**:
  - `buff_timer_virgin/AGENTS.md` - Current documentation
  - Final code state after Tasks 1-3

  **Acceptance Criteria**:
  - [ ] Line count updated in STRUCTURE section
  - [ ] ENEMY LINGER section describes dynamic `$.CreatePanel` approach
  - [ ] No references to `LingerOverlay0-5` or slot pairing

  **Commit**: YES
  - Message: `docs(buff_timer): update AGENTS.md for v5.6 cleanup`
  - Files: `buff_timer_virgin/AGENTS.md`
  - Pre-commit: None

---

- [ ] 5. Final Compilation & Verification

  **What to do**:
  - Run sr2compiler on full mod directory
  - Verify all compiled outputs exist
  - Launch Deadlock with `-dev -tools` and verify functionality

  **Must NOT do**:
  - Do NOT skip any verification step

  **Parallelizable**: NO (depends on 1, 2, 3, 4)

  **References**:
  - Build: `"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"`

  **Acceptance Criteria**:
  
  **Compilation:**
  - [ ] sr2compiler exits successfully
  - [ ] `buff_timer_virgin_compiled/panorama/scripts/rejuvnbufftimer.vjs_c` exists
  - [ ] `buff_timer_virgin_compiled/panorama/styles/buff_claim.vcss_c` exists
  - [ ] `buff_timer_virgin_compiled/panorama/layout/hud.vxml_c` exists
  
  **In-Game (launch with `-dev -tools`):**
  - [ ] Rejuv timer displays countdown correctly
  - [ ] Buff timer displays countdown correctly
  - [ ] Minimap glows appear when powerups spawn
  - [ ] Claim indicators appear when powerups claimed
  - [ ] Linger "?" appears when enemies enter fog (uses dynamic panels)
  - [ ] F7 console shows NO `[BT-P]` or `[LINGER]` debug messages

  **Commit**: NO (verification only)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `refactor(buff_timer): remove debug logging and dead code` | rejuvnbufftimer.js | sr2compiler |
| 2 | `refactor(buff_timer): remove unused CSS linger selectors` | buff_claim.css | sr2compiler |
| 3 | `refactor(buff_timer): remove unused LingerOverlay XML panels` | hud.xml | sr2compiler |
| 4 | `docs(buff_timer): update AGENTS.md for v5.6 cleanup` | AGENTS.md | None |

---

## Success Criteria

### Verification Commands
```powershell
# Compile mod
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"

# Verify no debug logging
Select-String -Path "buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js" -Pattern '\$\.Msg'
# Expected: No matches

# Verify unused code removed
Select-String -Path "buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js" -Pattern 'GLOW_CLASSES'
# Expected: No matches

Select-String -Path "buff_timer_virgin\panorama\layout\hud.xml" -Pattern 'LingerOverlay'
# Expected: No matches

Select-String -Path "buff_timer_virgin\panorama\styles\buff_claim.css" -Pattern '\.linger-overlay[^-]'
# Expected: No matches (but .linger-question-child should exist)
```

### Final Checklist
- [ ] All `$.Msg` debug calls removed
- [ ] `GLOW_CLASSES` array removed
- [ ] `LingerOverlay0-5` panels removed from XML
- [ ] Unused CSS linger selectors removed
- [ ] `.linger-question-child` CSS preserved (still used)
- [ ] All safety patterns preserved (`?.IsValid?.()`, try-catch, DOM guards)
- [ ] Mod compiles and runs correctly
- [ ] AGENTS.md accurately documents current code
