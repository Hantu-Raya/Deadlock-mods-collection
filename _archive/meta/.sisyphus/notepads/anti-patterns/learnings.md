# ANTI-PATTERNS & FORBIDDEN PATTERNS - Deadlock Panorama UI Modding

**Generated:** 2026-01-16
**Source:** Exhaustive search of codebase comments, documentation, and knowledge bases

---

## 🚫 CRITICAL ANTI-PATTERNS

### JavaScript Performance

| ❌ FORBIDDEN | ✅ CORRECT | WHY |
|-------------|-----------|-----|
| `$.GetContextPanel()` in loops | Cache at boot in `UI.root` | O(N) tree walk vs O(1) lookup |
| `FindChildTraverse()` in render loop | Cache panels during `boot()` | Expensive DOM traversal |
| `FindChildrenWithClassTraverse()` every frame | Cache with TTL (200-400ms) | O(N) tree walk, use sparingly |
| `new Array()` / `new Object()` in render | Pre-allocate outside loops | GC pressure causes micro-stutters |
| Bare `panel.text` access | `try { panel.text } catch {}` | Panels become invalid on HUD reload |
| Trust `panel.visible` alone | Check `visible && actualvisibility !== "collapse"` | Ghost panels retain stale values after reload |

### API Usage

| ❌ FORBIDDEN | ✅ CORRECT | WHY |
|-------------|-----------|-----|
| `Game.GetGameTime()` unwrapped | Wrap in try-catch + fallback chain | Returns 0 in menus/certain contexts |
| No time caching | Cache for 200-500ms with TTL | Reduces API overhead in tight loops |
| Regex/`.split()` for parsing | Manual `charCodeAt()` loops | Zero-GC parsing |

**Example: Mandatory Time Fallback Chain**
```javascript
function gTime() {
  const n = Date.now();
  if (n - _tCacheTs < 200) return _tCache;  // Cache hit
  
  let t = 0;
  try { t = Game.GetGameTime?.() | 0; } catch {}
  if (t > 0) { _tCache = t; _tCacheTs = n; return t; }
  
  try { t = GameUI.GetGameTime?.() | 0; } catch {}
  if (t > 0) { _tCache = t; _tCacheTs = n; return t; }
  
  return uiClockTime();  // Fallback: parse clock text
}
```

---

## 🎨 CSS ANTI-PATTERNS

### Animation & Scaling

| ❌ FORBIDDEN | ✅ CORRECT | WHY |
|-------------|-----------|-----|
| `transform: scale3d()` with `text-shadow` | `pre-transform-scale2d` | Causes clipping/blurring artifacts |
| `font-size` animation for pulsing | `pre-transform-scale2d` | Layout jitter, potential crashes |
| Animate without fixed container | Wrap in fixed-size box (e.g., 100x100px) | Prevents layout shift |
| Glow effects without `overflow: noclip` | Add `overflow: noclip` to parent | Clipping at panel bounds |

**Example: Correct Pulse Animation**
```css
@keyframes 'pulse' {
    0%   { pre-transform-scale2d: 1.0; }  /* NOT scale3d */
    50%  { pre-transform-scale2d: 1.5; }
    100% { pre-transform-scale2d: 1.0; }
}

#AnimatedLabel {
    width: 100px; height: 100px;  /* Fixed box prevents layout shift */
    overflow: noclip;             /* MANDATORY for glows/shadows */
}
```

### Visual Effects

| ❌ DOESN'T WORK | ✅ ALTERNATIVE | NOTES |
|----------------|---------------|-------|
| `box-shadow` | Gradient overlay panels | `box-shadow` has no visual effect in Panorama |
| `clip: rect()` | Separate panels per region | Unreliable/ignored by engine |
| Radial gradients | Multiple linear gradients | Don't render as expected |
| `url("")` in background-image | Cannot layer gradients | Compile error |

**Example: Glow Effect Using Overlay Panels**
```xml
<!-- Instead of box-shadow, use overlay panels -->
<Panel id="MinimapGlowLeft" class="minimap-glow" />
<Panel id="MinimapGlowRight" class="minimap-glow" />
```

```css
.minimap-glow {
    width: 135%;  /* Larger than parent for outward glow */
    height: 135%;
    overflow: noclip;
    background-color: gradient(linear, 0% 50%, 60% 50%, 
        from(rgba(100,255,100,0.9)), 
        color-stop(0.25, rgba(100,255,100,0.3)), 
        to(rgba(100,255,100,0)));
}
```

### Path & Include Errors

| ❌ WRONG | ✅ CORRECT | WHY |
|---------|-----------|-----|
| `file://{resources}/styles/foo.css` | `s2r://panorama/styles/foo.css` | `s2r://` is standard path format |
| `<include src="panorama/styles/...">` | `<include src="s2r://panorama/styles/...">` | Always use full `s2r://` prefix |
| `@keyframes my-animation` | `@keyframes 'my-animation'` | Panorama requires **quoted** keyframe names |
| Missing base CSS in addon | Include base CSS before addon CSS | Overrides won't work without base definitions |

---

## 🐛 KNOWN ENGINE BUGS & WORKAROUNDS

| Bug | Symptom | Workaround |
|-----|---------|------------|
| **Ghost Panel** | Stale values after HUD reload | Check `visible === true && actualvisibility !== "collapse"` |
| **Shop Pause** | Timer freezes when shop opens | Watchdog pattern: 2s check interval, 5s stall = restart |
| **GetGameTime=0** | Returns 0 in menus/hideout | 4-tier fallback chain (see gTime() above) |
| **Panel Crash** | Exception on reload/invalid panel | Wrap ALL panel access in try-catch + `?.IsValid?.()` |
| **Scale3d + shadow** | Text-shadow clipped/blurred | Use `pre-transform-scale2d` instead |

---

## 📋 BUILD & WORKFLOW ANTI-PATTERNS

| ❌ WRONG | ✅ CORRECT | WHY |
|---------|-----------|-----|
| Test without compiling | **Always compile before testing** | Game loads compiled `.vcss_c` / `.vjs_c` files |
| Edit files in `{mod}_compiled/` | Edit source in `{mod}/panorama/` | Compiled folder is OUTPUT, gets overwritten |
| Forget to include dependencies | Check all CSS/JS includes exist | Missing includes = silent failures |
| Duplicate base mod CSS in addon | Only include addon CSS file | Reference base CSS via `s2r://` in XML |

**Mandatory Compile Command:**
```powershell
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\{mod_name}"
```

---

## 🎯 POLLING STRATEGIES

### Adaptive Polling (Single Loop)
Best for simple status checks (e.g., Health, Buffs).

```javascript
let tick = 1.0;
if (isHideout) tick = 3.0;           // Idle: 3.0s
else if (timeRemaining < 10) tick = 0.1;  // Fast: 0.1s
$.Schedule(tick, loop);
```

### Dual-Loop Architecture (Complex Logic)
Best for mods with smooth animations + expensive data scraping.

- **Fast Loop (0.1s):** Pure UI updates (interpolation, text assignment)
- **Slow Loop (2.0s):** Expensive `FindChildTraverse`, logic calculations, caching

**Reference:** `soul_timer/panorama/scripts/soul_timer.js`

---

## 🔍 SPECIFIC PATTERN VIOLATIONS FOUND

### From `.opencode/workflows/deadlock-modding.md`

**DO NOT:**
- Use `<include src="panorama/styles/...">` → Always use `s2r://` prefix
- Test without compiling → Always compile before testing

### From `soul_timer_warning_addon/AGENTS.md`

**DO NOT:**
1. Use `transform: scale3d` with `text-shadow` → causes clipping/blurring
2. Use `font-size` animation for pulsing → causes layout jitter and crashes
3. Duplicate base mod CSS files in addon → only include addon CSS
4. Flash between high-contrast colors → destroys readability

### From `AGENTS.md` (Project Root)

**ANTI-PATTERNS TABLE:**
- `$.GetContextPanel()` in loops → Performance killer
- `new Array/Object` in render → GC pressure
- Trust `visible` alone → Ghost panels
- Bare panel access → Crash on reload
- `Game.GetGameTime()` unwrapped → Returns 0
- `transform: scale3d` + text-shadow → Clipping
- `font-size` animation → Jitter/crash
- `box-shadow` → Doesn't render
- Radial gradients → Unreliable
- `clip: rect()` → Ignored

---

## 📚 REFERENCE IMPLEMENTATIONS

| Pattern | Reference File |
|---------|---------------|
| Time caching with fallback | `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js` (line 24, 380) |
| Panel caching at boot | `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js` (line 40-48) |
| Dual-loop architecture | `soul_timer/panorama/scripts/soul_timer.js` |
| CSS Hijack pattern | `soul_timer_warning_addon/panorama/styles/hud_gold_and_ap_container.css` |
| Gradient overlay glows | `buff_timer_virgin/panorama/styles/hud.css` |
| Pre-transform-scale2d animation | `soul_timer_warning_addon/panorama/styles/soul_timer_warning.css` |

---

## 🎓 LESSONS LEARNED

### Performance
- **Cache panels at boot**: Never `FindChildTraverse` in loops
- **Cache with TTL**: For expensive operations (200-400ms)
- **Zero-GC parsing**: Use `charCodeAt()` instead of Regex
- **Pre-allocate**: Define lookup tables outside loops

### Reliability
- **Always wrap panel access**: `try-catch` + `?.IsValid?.()`
- **Ghost panel detection**: Check both `visible` and `actualvisibility`
- **API fallback chains**: Never trust single API call
- **Watchdog patterns**: Detect and recover from engine bugs

### CSS
- **Fixed containers**: Prevent layout shift during animations
- **Overflow noclip**: Required for effects beyond bounds
- **Pre-transform-scale2d**: Only safe way to scale text with shadows
- **Gradient overlays**: Replace unsupported `box-shadow`
- **Quote keyframes**: `@keyframes 'name'` not `@keyframes name`

### Build
- **Always compile**: Game doesn't load source files
- **Edit source only**: Never edit `_compiled/` folders
- **Include order matters**: Base CSS before addon CSS
- **Use s2r:// paths**: Standard format for all includes

---

## 🚨 DEPRECATED FEATURES

From `apis/api.html`:
- `$.CreatePanelWithProperties()` → Use `$.CreatePanel()` (same signature + properties)
- `$.Localize()` old signature → Use new signature with pluralization support

---

**END OF ANTI-PATTERNS DOCUMENTATION**
