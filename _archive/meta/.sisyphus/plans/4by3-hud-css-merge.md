# 4:3 HUD CSS Merge (Post-Game Update)

## TL;DR

> **Quick Summary**: Merge new Deadlock game CSS into 4:3 aspect ratio HUD mod using "new base + 4:3 overlay" strategy. Preserve only the core 4:3 positioning override while taking all new game values.
> 
> **Deliverables**:
> - Updated `4 by 3/panorama/styles/hud.css`
> - Updated `4 by 3/panorama/styles/hud_gold_and_ap_container.css`
> - Updated `4 by 3/panorama/styles/hud_quickbuy.css`
> - Updated `4 by 3/panorama/styles/citadel_hud_hero_shop.css`
> - Compiled `.vcss_c` files in `4 by 3_compiled/`
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: NO - sequential (each file depends on strategy consistency)
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request
Update the 4:3 aspect ratio HUD mod for Deadlock after a game update. Merge new CSS changes from updated game files while preserving 4:3-specific positioning adjustments.

### Interview Summary
**Key Discussions**:
- Strategy: "New base + 4:3 overlay" approach (use new game CSS as base, apply only confirmed 4:3 overrides)
- PRIMARY 4:3 override confirmed: `#health_and_abilities_container { margin-right: 70% }`
- All OTHER differences: Take NEW game values (do not preserve old/stale values)
- Removed selectors: Drop them (HeroStatsContainer, AbilityPanelsContainer, join_team UI)

**Research Findings**:
- 4 CSS files need updating
- New game adds: StreetBrawl mode, ItemDraft, HudTakeover, PlayOfTheGame, CosmeticAbilities selectors
- New game removes: join_team block, HeroStatsContainer, AbilityPanelsContainer
- Font change: `sansMono` → `numericOracle`
- PlayerLevelContainer completely restructured

### Metis Review
**Identified Gaps** (addressed):
- Ambiguity between "4:3 override" vs "stale old value" → User confirmed only margin-right: 70% is intentional
- Removed selectors handling → User confirmed: remove them
- Other value differences → User confirmed: take new game values

---

## Work Objectives

### Core Objective
Update 4 CSS files in the 4:3 HUD mod to match the new game version while preserving the single confirmed 4:3 positioning override.

### Concrete Deliverables
- `4 by 3/panorama/styles/hud.css` - merged with new game CSS
- `4 by 3/panorama/styles/hud_gold_and_ap_container.css` - merged with new game CSS
- `4 by 3/panorama/styles/hud_quickbuy.css` - merged with new game CSS
- `4 by 3/panorama/styles/citadel_hud_hero_shop.css` - merged with new game CSS
- `4 by 3_compiled/panorama/styles/*.vcss_c` - compiled output files

### Definition of Done
- [ ] All 4 CSS files updated with new game content
- [ ] `#health_and_abilities_container` retains `margin-right: 70%` override
- [ ] All new selectors present (StreetBrawl, ItemDraft, HudTakeover, etc.)
- [ ] Deprecated selectors removed (join_team, HeroStatsContainer, AbilityPanelsContainer)
- [ ] Mod compiles without errors

### Must Have
- Preserve `#health_and_abilities_container { margin-right: 70% }` (core 4:3 override)
- All new game selectors added
- Mod compiles successfully

### Must NOT Have (Guardrails)
- **DO NOT** preserve old game values that are NOT 4:3-specific (take new values)
- **DO NOT** add CSS comments explaining changes (files have no comments except header)
- **DO NOT** "clean up" duplicate properties like `margin-bottom: 30px; margin-bottom: 20px;` (intentional Panorama CSS pattern)
- **DO NOT** reformat or change whitespace/indentation
- **DO NOT** merge or split selector groups differently than source files

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (Panorama/Source 2 mods - no npm/eslint/jest)
- **User wants tests**: Manual-only (in-game verification)
- **Framework**: Source 2 ResourceCompiler

### Automated Verification

Each task includes EXECUTABLE verification that agents can run:

**Compilation Check:**
```powershell
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3"
```
Assert: Exit code 0, no error output

**File Existence Check:**
```powershell
Get-ChildItem "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3_compiled\panorama\styles\*.vcss_c"
```
Assert: 4 `.vcss_c` files present

**4:3 Override Preserved:**
```powershell
Select-String -Path "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3\panorama\styles\hud.css" -Pattern "margin-right: 70%"
```
Assert: Match found

**New Selectors Added:**
```powershell
Select-String -Path "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3\panorama\styles\hud.css" -Pattern "StreetBrawlInterstitial|ItemDraft|HudTakeover"
```
Assert: Matches found

---

## Execution Strategy

### Sequential Execution

All tasks must be executed sequentially to maintain consistency:

```
Task 1: Merge hud.css
    ↓
Task 2: Merge hud_gold_and_ap_container.css
    ↓
Task 3: Merge hud_quickbuy.css
    ↓
Task 4: Merge citadel_hud_hero_shop.css
    ↓
Task 5: Final compilation and verification
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 5 | None |
| 2 | None | 5 | None |
| 3 | None | 5 | None |
| 4 | None | 5 | None |
| 5 | 1, 2, 3, 4 | None | None (final) |

---

## TODOs

- [ ] 1. Merge hud.css

  **What to do**:
  - Read `css/hud.css` (new game version) as the BASE
  - Apply the ONLY confirmed 4:3 override:
    - Find `#health_and_abilities_container` selector
    - Replace `margin-right: 1290px` with `margin-right: 70%`
  - Write result to `4 by 3/panorama/styles/hud.css`

  **Must NOT do**:
  - DO NOT preserve other old values from the 4:3 file
  - DO NOT keep removed selectors (join_team block is already gone in new CSS)
  - DO NOT add comments

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file CSS merge with one search-replace
  - **Skills**: []
    - No special skills needed for CSS file manipulation

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Source File (NEW base):**
  - `F:\Users\Shiv\Desktop\Deadlock-mods-collection\css\hud.css` - Use this as the base content

  **Target File:**
  - `F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3\panorama\styles\hud.css` - Write merged result here

  **4:3 Override Pattern:**
  - Find: `#health_and_abilities_container` block (around line 2974 in new CSS)
  - The selector has `margin-right: 1290px;`
  - Change to: `margin-right: 70%;`

  **Acceptance Criteria**:

  ```powershell
  # Verify 4:3 override is present
  Select-String -Path "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3\panorama\styles\hud.css" -Pattern "margin-right: 70%"
  ```
  Assert: Match found in #health_and_abilities_container context

  ```powershell
  # Verify new selectors exist
  Select-String -Path "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3\panorama\styles\hud.css" -Pattern "StreetBrawlInterstitial"
  ```
  Assert: Match found

  ```powershell
  # Verify deprecated selector removed
  Select-String -Path "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3\panorama\styles\hud.css" -Pattern "join_team_play"
  ```
  Assert: No match (this selector should not exist in new CSS)

  **Commit**: NO (group with Task 5)

---

- [ ] 2. Merge hud_gold_and_ap_container.css

  **What to do**:
  - Read `css/hud_gold_and_ap_container.css` (new game version) as the BASE
  - No 4:3 overrides needed for this file - use new CSS as-is
  - Write result to `4 by 3/panorama/styles/hud_gold_and_ap_container.css`

  **Must NOT do**:
  - DO NOT preserve old values from 4:3 file (user confirmed: take new values)
  - DO NOT add comments

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file copy (no modifications needed)
  - **Skills**: []
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (but sequential for safety)
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Source File (NEW base):**
  - `F:\Users\Shiv\Desktop\Deadlock-mods-collection\css\hud_gold_and_ap_container.css` - Copy this entirely

  **Target File:**
  - `F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3\panorama\styles\hud_gold_and_ap_container.css` - Overwrite with new content

  **Key Changes (for awareness):**
  - Font family changes: `sansMono` → `numericOracle`
  - `#PlayerLevelContainer` restructured
  - New `.item_draft_enabled` and `.gamemode_streetbrawl` selectors

  **Acceptance Criteria**:

  ```powershell
  # Verify new font family
  Select-String -Path "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3\panorama\styles\hud_gold_and_ap_container.css" -Pattern "numericOracle"
  ```
  Assert: Match found

  ```powershell
  # Verify new selectors
  Select-String -Path "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3\panorama\styles\hud_gold_and_ap_container.css" -Pattern "item_draft_enabled"
  ```
  Assert: Match found

  **Commit**: NO (group with Task 5)

---

- [ ] 3. Merge hud_quickbuy.css

  **What to do**:
  - Read `css/hud_quickbuy.css` (new game version) as the BASE
  - No 4:3 overrides needed for this file - use new CSS as-is
  - Write result to `4 by 3/panorama/styles/hud_quickbuy.css`

  **Must NOT do**:
  - DO NOT preserve old margin values from 4:3 file
  - DO NOT add comments

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file copy (no modifications needed)
  - **Skills**: []
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (but sequential for safety)
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Source File (NEW base):**
  - `F:\Users\Shiv\Desktop\Deadlock-mods-collection\css\hud_quickbuy.css` - Copy this entirely

  **Target File:**
  - `F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3\panorama\styles\hud_quickbuy.css` - Overwrite with new content

  **Key Changes (for awareness):**
  - New `.viewing_as_player.dead #HudMini` selector
  - New `.item_draft_enabled #QuickbuyShopSummary` selector
  - Margin/height changes in `#QuickbuyShopSummary`

  **Acceptance Criteria**:

  ```powershell
  # Verify new selector
  Select-String -Path "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3\panorama\styles\hud_quickbuy.css" -Pattern "item_draft_enabled"
  ```
  Assert: Match found

  **Commit**: NO (group with Task 5)

---

- [ ] 4. Merge citadel_hud_hero_shop.css

  **What to do**:
  - Read `css/citadel_hud_hero_shop.css` (new game version) as the BASE
  - No 4:3 overrides needed for this file - use new CSS as-is
  - Write result to `4 by 3/panorama/styles/citadel_hud_hero_shop.css`

  **Must NOT do**:
  - DO NOT preserve old values from 4:3 file
  - DO NOT keep removed selectors (#HeroStatsContainer, #AbilityPanelsContainer)
  - DO NOT add comments

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file copy (no modifications needed)
  - **Skills**: []
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (but sequential for safety)
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Source File (NEW base):**
  - `F:\Users\Shiv\Desktop\Deadlock-mods-collection\css\citadel_hud_hero_shop.css` - Copy this entirely

  **Target File:**
  - `F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3\panorama\styles\citadel_hud_hero_shop.css` - Overwrite with new content

  **Key Changes (for awareness):**
  - New `world-blur: ingameHudBlur` on main panel
  - New `.inCombat` and `.dead` selectors
  - New `#ItemDraft` and `.shopStateItemDraft` selectors
  - Removed: `#HeroStatsContainer`, `#AbilityPanelsContainer`

  **Acceptance Criteria**:

  ```powershell
  # Verify new selector
  Select-String -Path "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3\panorama\styles\citadel_hud_hero_shop.css" -Pattern "ItemDraft"
  ```
  Assert: Match found

  ```powershell
  # Verify removed selector is gone
  Select-String -Path "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3\panorama\styles\citadel_hud_hero_shop.css" -Pattern "HeroStatsContainer"
  ```
  Assert: No match

  **Commit**: NO (group with Task 5)

---

- [ ] 5. Compile mod and final verification

  **What to do**:
  - Run Source 2 ResourceCompiler on the mod
  - Verify all 4 `.vcss_c` files are generated
  - Verify no compilation errors

  **Must NOT do**:
  - DO NOT modify any files in this step (verification only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single compilation command + verification
  - **Skills**: []
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Final (after all merges)
  - **Blocks**: None
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:

  **Compiler:**
  - `F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe` - Source 2 ResourceCompiler

  **Mod Directory:**
  - `F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3` - Input mod folder

  **Output Directory:**
  - `F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3_compiled\panorama\styles\` - Compiled output

  **Acceptance Criteria**:

  ```powershell
  # Compile the mod
  & "F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3"
  ```
  Assert: Exit code 0, no error output

  ```powershell
  # Verify output files exist
  Get-ChildItem "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3_compiled\panorama\styles\*.vcss_c" | Measure-Object
  ```
  Assert: Count = 4 files

  ```powershell
  # Final verification: 4:3 override preserved in source
  Select-String -Path "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3\panorama\styles\hud.css" -Pattern "margin-right: 70%"
  ```
  Assert: Match found

  **Commit**: YES
  - Message: `fix(4by3-hud): merge game update CSS with 4:3 positioning override`
  - Files: 
    - `4 by 3/panorama/styles/hud.css`
    - `4 by 3/panorama/styles/hud_gold_and_ap_container.css`
    - `4 by 3/panorama/styles/hud_quickbuy.css`
    - `4 by 3/panorama/styles/citadel_hud_hero_shop.css`
  - Pre-commit: Compilation must succeed

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 5 | `fix(4by3-hud): merge game update CSS with 4:3 positioning override` | all 4 CSS files | Compilation succeeds |

---

## Success Criteria

### Verification Commands
```powershell
# Compile mod
& "F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3"
# Expected: Exit code 0

# Check output files
(Get-ChildItem "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3_compiled\panorama\styles\*.vcss_c").Count
# Expected: 4

# Verify 4:3 override
Select-String -Path "F:\Users\Shiv\Desktop\Deadlock-mods-collection\4 by 3\panorama\styles\hud.css" -Pattern "margin-right: 70%"
# Expected: Match found
```

### Final Checklist
- [ ] All 4 CSS files updated with new game content
- [ ] `margin-right: 70%` present in hud.css for health_and_abilities_container
- [ ] New selectors present (StreetBrawl, ItemDraft, HudTakeover)
- [ ] Deprecated selectors removed
- [ ] Mod compiles without errors
- [ ] 4 `.vcss_c` files in output directory

### Manual Verification (Recommended)
After automated checks pass, test in-game:
- Launch Deadlock with `-dev -tools`
- Verify HUD elements are centered correctly on 4:3 display
- Check shop UI renders correctly
- Verify new game modes (StreetBrawl) don't cause visual issues
