# SOUL TIMER WARNING ADDON

## OVERVIEW
CSS-only addon that adds a "Radioactive Breath" animation to the Soul Timer when unsecured souls reach the "red" threshold (>=1000). Designed for competitive play - attracts peripheral attention without destroying readability.

**Requires:** `soul_timer` base mod installed.

## VERSION HISTORY
- **v3.3**: Implemented "CSS Hijack" strategy. Removed custom XML to improve compatibility.
- **v3.2**: Tuned Layout (100x100px box), reduced bloom (12px), slower pulse (2s), static scale on danger levels.
- **v3.1**: Structural Update - using `pre-transform-scale2d` instead of `transform` (fixes clipping).
- **v2.1**: Font-size pulse (18px -> 20px) + glow bloom + threat floor (1.2s cycle).
- **v2.0**: "Radioactive Breath" - glow bloom + scale3d pulse (had text-shadow clipping issues).
- **v1.0**: Yellow<->red color flash (0.8s cycle).

## HOW IT WORKS
1. Base `soul_timer` mod applies `.red` class when souls >=1000.
2. This addon overrides `#SoulTimerLabel.red` with the animation.
3. Animation features:
   - **Glow bloom**: 4px -> 12px red `text-shadow`.
   - **Scale pulse**: 1.0 -> 1.55 via `pre-transform-scale2d` (avoids text-shadow clipping).
   - **Duration**: 2s cycle (slow, ominous).
   - **Static Danger Levels**: `hud_gold_and_ap_container` danger levels 3 & 4 scaled to 1.3x.

## DESIGN PRINCIPLES
- **Pre-transform-scale2d**: Used for pulsing text with shadows. Standard `transform: scale3d` causes clipping/rendering artifacts with `text-shadow`.
- **Luminance bloom**: Attracts peripheral vision.
- **Slower rhythm (2s)**: Feels ominous, not frantic.
- **Fixed Layout Box**: 100x100px centered box ensures scaling doesn't shift layout.

---

## LESSONS LEARNED: DO NOT

### 1. Don't use `transform: scale3d` with `text-shadow`
WRONG: `transform: scale3d(1.1, 1.1, 1.0)` - causes text-shadow clipping/blurring artifacts.
CORRECT: Use `pre-transform-scale2d` for clean scaling of text with shadows.

### 2. Don't use `font-size` animation for pulsing
WRONG: `font-size: 14px` -> `18px` in keyframes causes layout jitter and potential crashes.
CORRECT: Use `pre-transform-scale2d`.

### 3. Don't duplicate base mod CSS files in addon
WRONG: Copy `soul_timer.css` into addon's `styles/` folder.
CORRECT: Only include addon CSS file. Reference base CSS via `s2r://` in XML.

### 4. Don't flash between high-contrast colors
WRONG: Yellow <-> Red rapid flashing (destroys readability).
CORRECT: Subtle color transitions (pale red -> white) with glow bloom.

---

## LESSONS LEARNED: DO

### 1. Use the "CSS Hijack" Pattern (Implemented)
To override game CSS without modifying XML structure:
1. Create a CSS file with the same name as the game's file (e.g., `hud_gold_and_ap_container.css`).
2. `@import` the original game CSS: `@import url("s2r://panorama/styles/base/hud_gold_and_ap_container.vcss_c");`.
3. Add your overrides after the import (including `@import` for your custom CSS).

### 2. Use `overflow: noclip`
Essential when animating text shadows or scaling elements to prevent bounding box clipping.

---

## FILES
| File | Purpose |
|------|---------|
| `soul_timer_warning.css` | `@keyframes 'soul-critical-breath'` + `.red` override |
| `hud_gold_and_ap_container.css` | Hijacks base CSS to import warning styles + overrides |

## DEPENDENCY
- **Base mod:** `soul_timer/` must be installed (provides `soul_timer.vcss_c` + `soul_timer.js`)
- **Installation:** Install BOTH mods - base mod first, then this addon

## INSTALLATION
1. Compile `soul_timer` base mod first.
2. Compile `soul_timer_warning_addon`.
3. Install BOTH mods.

## BUILD

**Agent Capability:** I can execute this command directly via bash.

```powershell
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\soul_timer_warning_addon"
```
