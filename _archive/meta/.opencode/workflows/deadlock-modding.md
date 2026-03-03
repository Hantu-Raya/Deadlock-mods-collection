---
description: Advanced Deadlock Modding - Performance Optimization & API Best Practices
---

# Deadlock Modding & Optimization Skill

This skill provides guidelines and templates for building high-performance Deadlock Panorama UI mods. Focus is on reducing latency, minimizing DOM reflows, and efficient API usage.

## 🚀 Performance Optimization Rules

### 1. Polling Strategies
**A. Adaptive Polling (Single Loop)**
Best for simple status checks (e.g., Health, Buffs).
*Reference: `buff_timer_virgin/.../rejuvnbufftimer.js`*
- **Idle (3.0s):** Menu/Hideout detection.
- **Normal (1.0s):** Standard countdowns.
- **Fast (0.1s):** Active spawn windows or animations.

```javascript
// Dynamic Tick Example
let tick = 1.0;
if (isHideout) tick = 3.0;
else if (timeRemaining < 10) tick = 0.1;
$.Schedule(tick, loop);
```

**B. Dual-Loop Architecture (Complex Logic)**
Best for mods that need smooth animations but expensive data scraping (e.g., Soul Timer).
*Reference: `soul_timer/.../soul_timer.js`*
- **Fast Loop (0.1s):** Pure UI updates (interpolation, text assignment).
- **Slow Loop (2.0s):** expensive `FindChildTraverse`, logic calculations, and caching.

### 2. Cache UI References (Critical)
**Problem**: `FindChildTraverse` and especially `FindChildrenWithClassTraverse` are $O(N)$ operations that walk the entire panel tree. Calling these inside `update()` or `waitFor()` loops causes massive frame drops.
**Solution**: 
- Find all necessary panels **once** during `init()` or `boot()`.
- Store them in a `UI` object.
- If a panel might not exist yet, use the **Slow Loop** to check for it, never the Fast Loop.

### 3. Efficient Data Handling (Zero-GC)
**Problem**: Creating `new Array()`, `new Object()` in loops triggers Garbage Collection (micro-stutters).
**Solution**:
- **Manual Parsing**: Use `charCodeAt()` loops instead of `Regex` or `.split()` for parsing numbers from text.
- **Time Caching**: Cache `Game.GetGameTime()` for 200ms to avoid API overhead in tight loops.
- **Pre-allocation**: Define lookup tables (Arrays) outside loops.

---

## 🛠️ Mod Management Commands

### Compile a Mod (REQUIRED after code changes)
**Command:**
```powershell
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\{mod_name}"
```

**Examples:**
```powershell
# Compile buff_timer_virgin
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"

# Compile soul_timer
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\soul_timer"

# Compile hp
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\hp"
```

**Protocol:** 
1. Make code changes in `{mod}/panorama/` 
2. Run compile command above
3. Output goes to `{mod}_compiled/`
4. Test in-game

### Scaffold New Mod
**Usage:** `Scaffold <new_mod_name>`
Generates a optimized boilerplate:
- IIFE with strict mode.
- Cached UI references.
- Adaptive polling loop.
- `hittest="false"` XML to prevent click-blocking.

---

## ⛔ DO NOT (Critical Anti-Patterns)

### CSS/XML Mistakes
| ❌ Wrong | ✅ Correct | Why |
|----------|-----------|-----|
| `file://{resources}/styles/foo.css` | `s2r://panorama/styles/foo.css` | `s2r://` is the standard path format for all includes |
| `@keyframes my-animation` | `@keyframes 'my-animation'` | Panorama requires **quoted** keyframe names |
| Missing base CSS in addon | Include base CSS before addon CSS | Addon CSS overrides won't work without base definitions |
| `<include src="panorama/styles/...">` | `<include src="s2r://panorama/styles/...">` | Always use full `s2r://` prefix |

### CSS Include Order (Addons)
When creating addon mods that override base mod styles:
```xml
<styles>
    <!-- Game base styles first -->
    <include src="s2r://panorama/styles/citadel_base_styles.vcss_c" />
    <include src="s2r://panorama/styles/hud_common.vcss_c" />
    <!-- Base mod CSS (REQUIRED) -->
    <include src="s2r://panorama/styles/soul_timer.css" />
    <!-- Addon CSS last (overrides base) -->
    <include src="s2r://panorama/styles/soul_timer_warning.css" />
</styles>
```

### JavaScript Mistakes
| ❌ Wrong | ✅ Correct | Why |
|----------|-----------|-----|
| `$.GetContextPanel()` in loops | Cache in `UI.root` at boot | Performance - O(1) vs O(N) |
| `new Array()` / `new Object()` in render | Pre-allocate outside loops | GC pressure causes micro-stutters |
| Bare `panel.text` access | `try { panel.text } catch {}` | Panels can become invalid on HUD reload |
| Trust `panel.visible` alone | Check `visible && actualvisibility !== "collapse"` | Ghost panels retain stale values |
| `Game.GetGameTime()` unwrapped | Wrap in try-catch + fallback | Returns 0 in certain contexts |

### Build Mistakes
| ❌ Wrong | ✅ Correct | Why |
|----------|-----------|-----|
| Test without compiling | Always compile before testing | Game loads compiled `.vcss_c` / `.vjs_c` files |
| Edit files in `{mod}_compiled/` | Edit source in `{mod}/panorama/` | Compiled folder is OUTPUT, gets overwritten |
| Forget to include dependencies | Check all CSS/JS includes exist | Missing includes = silent failures |

---

## 📡 API Best Practices

| Category | Preferred API | Instead of... |
|----------|---------------|---------------|
| **Health** | `Entities.GetHealthPercent(idx)` | Scraping text from health labels |
| **Time** | `Game.GetDOTATime(false, false)` | `parseTime($("#Clock").text)` |
| **Visibility**| `panel.SetHasClass("hidden", bool)` | `panel.style.visibility = "collapse"` |
| **Buffs** | `Buffs.GetRemainingTime(e, b)` | Manual countdown timers |
| **Events** | `GameEvents.Subscribe` | Polling for state changes |

*Note: `Game.GetGameTime()` can be unreliable; implement a fallback chain (API -> Cache -> Text Scrape) as seen in `rejuvnbufftimer.js`.*

---

## 📁 Project Structure
- `{mod}/`: Source code (JS/CSS/XML).
- `{mod}_compiled/`: Production-ready VPK assets.
- `hp/`: Complex logic for health visualization.
- `soul_timer/`: Reference for **Dual-Loop** architecture.
- `buff_timer_virgin/`: Reference for **Adaptive Polling** & **Time Caching**.
- `soul_timer_warning_addon/`: Reference for **CSS-only addon** pattern (keyframes, style overrides).

---

## 🔧 Agent Protocol: Compile After Changes

**MANDATORY:** After creating or modifying any mod files, run the compile command:

```powershell
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\{mod_name}"
```

The agent MUST:
1. Run this command after writing/editing files
2. Verify compile succeeds (no errors in output)
3. Report compile status to user
