---
name: deadlock-modding
description: Deadlock Panorama UI modding - compile, conventions, anti-patterns, performance
triggers:
  - deadlock
  - panorama
  - mod
  - compile
  - hud
  - timer
  - health bar
---

# Deadlock Panorama UI Modding Skill

## COMPILE COMMAND (MANDATORY)

After ANY code change, compile before testing:

```powershell
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\{mod_name}"
```

### Examples
```powershell
# buff_timer_virgin
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"

# soul_timer
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\soul_timer"

# hp
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\hp"

# combined_timer
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\combined_timer"

# kaiz_hud
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\kaiz_hud"
```

### Workflow
1. Edit files in `{mod}/panorama/{scripts,styles,layout}/`
2. Run compile command above
3. Output → `{mod}_compiled/`
4. Test in-game (requires `-dev -tools` launch options)

---

## PROJECT STRUCTURE

```
Deadlock-mods-collection/
├── {mod}/                    # Source (JS/CSS/XML)
│   └── panorama/
│       ├── scripts/          # .js (IIFE + strict)
│       ├── styles/           # .css (Source 2 CSS)
│       ├── layout/           # .xml (includes)
│       └── images/           # .svg/.png
├── {mod}_compiled/           # Output (.vjs_c, .vcss_c, .vxml_c)
├── abilities/                # VData (non-Panorama)
├── old_hud/                  # Archive/reference
├── post/                     # Post-processing
└── shiv/                     # Audio mod
```

---

## CONVENTIONS (ENFORCE THESE)

### JavaScript
- **IIFE + strict**: `(()=>{"use strict"; ... })();`
- **Cache panels at boot**: Never `FindChildTraverse` in loops
- **Single-letter vars OK**: Minification-friendly
- **Tick rates**: 0.1s (fast), 1s (normal), 3s (idle)

### CSS
- `wash-color`: For tinting panels
- `overflow: noclip`: For overlays
- `z-index: 99999+`: For HUD overlays
- `visibility: collapse`: Not `display: none`

### XML
- `hittest="false"`: For non-interactive overlays
- `file://{resources}/`: Source paths
- `s2r://`: Compiled paths

---

## ANTI-PATTERNS (BLOCK THESE)

| Pattern | Why Bad | Fix |
|---------|---------|-----|
| `$.GetContextPanel()` in loops | O(N) every call | Cache at boot |
| `new Array/Object` in render | GC pressure | Reuse primitives |
| Trust `visible` alone | Ghost panels | Check `actualvisibility !== "collapse"` |
| Bare panel access | Crash on reload | `try-catch` + `?.IsValid?.()` |
| `Game.GetGameTime()` unwrapped | Returns 0 | Try-catch + fallback chain |
| Regex for number parsing | Slow + allocations | Use `charCodeAt()` |
| `typeof` checks in hot path | String comparison | Cache function refs at boot |
| String concatenation in loops | Allocation per concat | Pre-computed PAD arrays |
| `Math.ceil/floor` in hot path | Function call overhead | Bitwise: `(x+0.5)|0` |
| Division by constants | Slower than multiply | `x * 0.016667` vs `x / 60` |

---

## KNOWN ENGINE BUGS

| Bug | Symptom | Workaround |
|-----|---------|------------|
| Ghost Panel | Stale values | `visible===true && actualvisibility!=="collapse"` + parent chain check |
| Shop Pause | Timer freezes | Watchdog (2s check, 5s stall = restart) |
| GetGameTime=0 | Timers stuck | 4-tier fallback: `Game` → `GetDOTATime` → `GameUI` → parse clock |
| Panel Crash | JS Exception | Wrap ALL panel access in try-catch |
| Script Pause | JS stops on menu | Generation counter pattern (see below) |

---

## PERFORMANCE PATTERNS (CRITICAL)

### 1. Panel Caching with Root Discovery (MANDATORY)
```javascript
const UI = { root: null, hud: null, label: null };
function boot() {
  const ctx = $.GetContextPanel();
  if (!ctx?.IsValid?.()) return $.Schedule(0.5, boot);
  
  UI.root = ctx;
  while (UI.root.GetParent?.()) UI.root = UI.root.GetParent(); // Find true root
  UI.hud = UI.root.FindChildTraverse("Hud") || UI.root;
  UI.label = UI.hud.FindChildTraverse("MyLabel");
  
  if (!UI.label?.IsValid?.()) return $.Schedule(0.5, boot);
  loop();
}
```

### 2. Game Time with 4-Tier Fallback (MANDATORY for timers)
```javascript
let _tCache = 0, _tCacheTs = 0;
const TIME_TTL = 200; // 200ms cache

// Cache function refs at boot (avoid typeof in hot path)
const gameTimeFn = (typeof Game !== "undefined" && Game.GetGameTime) || null;
const dotaTimeFn = (typeof Game !== "undefined" && Game.GetDOTATime) || null;
const guiTimeFn = (typeof GameUI !== "undefined" && GameUI.GetGameTime) || null;

function gTime() {
  const n = Date.now();
  if (n - _tCacheTs < TIME_TTL) return _tCache;
  
  let t = 0;
  if (gameTimeFn) try { t = gameTimeFn() | 0; } catch {}
  if (t > 0) { _tCache = t; _tCacheTs = n; return t; }
  
  if (dotaTimeFn) try { t = dotaTimeFn() | 0; } catch {}
  if (t > 0) { _tCache = t; _tCacheTs = n; return t; }
  
  if (guiTimeFn) try { t = guiTimeFn() | 0; } catch {}
  if (t > 0) { _tCache = t; _tCacheTs = n; return t; }
  
  t = parseClockText();
  if (t > 0) { _tCache = t; _tCacheTs = n; }
  return t;
}
```

### 3. Dual-Loop Architecture (60frame_rate + Slow State)
```javascript
const TICK_DISPLAY = 0.1;  // 100ms for smooth UI
const TICK_SLOW = 2.0;     // 2s for expensive ops

let gen = 0, lastTick = 0;
let drainEndTime = 0, cachedValue = 0;

function boot() {
  gen++;
  displayLoop(gen);
  slowLoop(gen);
  watchdog(gen);
}

// FAST: Pure rendering (no DOM queries, no allocations)
function displayLoop(g) {
  if (g !== gen) return; // Killed by reboot
  lastTick = Date.now();
  
  // Interpolate from cached state only
  const remainMs = drainEndTime - lastTick;
  const txt = fmtTime(remainMs > 0 ? remainMs * 0.001 : 0);
  
  if (txt !== lastText) { UI.label.text = txt; lastText = txt; }
  
  $.Schedule(TICK_DISPLAY, () => displayLoop(g));
}

// SLOW: Expensive ops (DOM queries, game API)
function slowLoop(g) {
  if (g !== gen) return;
  
  refreshPanels();  // FindChildTraverse here
  cachedValue = expensiveCalc();
  drainEndTime = Date.now() + cachedValue * 1000;
  
  $.Schedule(TICK_SLOW, () => slowLoop(g));
}
```

### 4. Watchdog Timer (Anti-Pause)
```javascript
const WD_CHECK = 3.0, WD_STALL = 6000;

function watchdog(g) {
  if (g !== gen) return;
  
  if (Date.now() - lastTick > WD_STALL) {
    $.Msg("[WD] Loop stalled, restarting\n");
    displayLoop(g); // Force restart
  }
  
  $.Schedule(WD_CHECK, () => watchdog(g));
}
```

### 5. Zero-Allocation Number Parsing
```javascript
// Pre-computed lookup table for time formatting
const PAD = ["00","01","02","03","04","05","06","07","08","09",
             "10","11","12","13","14","15","16","17","18","19",
             "20","21","22","23","24","25","26","27","28","29",
             "30","31","32","33","34","35","36","37","38","39",
             "40","41","42","43","44","45","46","47","48","49",
             "50","51","52","53","54","55","56","57","58","59"];

function fmtTime(sec) {
  if (sec <= 0) return "0:00";
  const s = sec | 0, m = (s * 0.016667) | 0, ss = s % 60; // Multiply faster than divide
  return m + ":" + PAD[ss];
}

// Zero-allocation integer parsing (350% faster than regex)
function parseNum(s) {
  if (!s) return 0;
  let r = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) r = r * 10 + (c - 48);
  }
  return r;
}

// Time parsing (MM:SS format)
function parseSec(txt) {
  if (!txt) return 0;
  const colonIdx = txt.indexOf(":");
  if (colonIdx < 0) return 0;
  
  let mm = 0, ss = 0, c;
  for (let i = 0; i < colonIdx; i++) {
    c = txt.charCodeAt(i);
    if (c >= 48 && c <= 57) mm = mm * 10 + (c - 48);
  }
  for (let i = colonIdx + 1, cnt = 0; i < txt.length && cnt < 2; i++, cnt++) {
    c = txt.charCodeAt(i);
    if (c >= 48 && c <= 57) ss = ss * 10 + (c - 48);
    else break;
  }
  return mm * 60 + (ss > 59 ? 59 : ss);
}
```

### 6. Ghost Panel Detection (Parent Chain)
```javascript
function validPanel(p) {
  if (!p?.IsValid?.()) return false;
  if (p.visible === false || p.actualvisibility === "collapse") return false;
  
  // Check parent chain (ghost panels can be in hidden containers)
  let c = p.GetParent?.();
  for (let d = 0; d < 10 && c; d++) {
    if (c.visible === false || c.actualvisibility === "collapse") return false;
    c = c.GetParent?.();
  }
  return true;
}
```

### 7. Adaptive Tick Rates
```javascript
const TICK_IDLE = 3.0;   // Hideout/menu
const TICK_NORM = 1.0;   // Normal gameplay
const TICK_FAST = 0.1;   // Critical moments

function loop() {
  let tick = TICK_NORM;
  
  if (inHideout || inMenu) tick = TICK_IDLE;
  else if (timeRemaining < 10 || spawnWaiting) tick = TICK_FAST;
  
  doWork();
  $.Schedule(tick, loop);
}
```

### 8. Lookup Table Optimization
```javascript
// Pre-calculate expensive values at boot (O(N) once, O(1) runtime)
const DRAIN_TBL = [];
(function buildTable() {
  for (let s = 0; s <= 5000; s += 25) {
    let rem = s, t = 0;
    while (rem > 0.5 && t < 600) {
      rem -= (rem * 0.005 + 1.6) * 0.5;
      t += 0.5;
    }
    DRAIN_TBL.push(t);
  }
})();

function calcDrainTime(souls) {
  const idx = (souls * 0.04) | 0; // souls / 25
  if (idx >= DRAIN_TBL.length) return DRAIN_TBL[DRAIN_TBL.length - 1];
  
  // Interpolate between entries for smooth values
  const base = DRAIN_TBL[idx];
  const next = DRAIN_TBL[Math.min(idx + 1, DRAIN_TBL.length - 1)];
  const frac = (souls % 25) * 0.04;
  return base + (next - base) * frac;
}
```

### 9. CSS Animation (Not JS)
```css
/* GPU-accelerated, non-blocking */
@keyframes 'rotate' {
  0% { transform: rotateY(0deg); }
  100% { transform: rotateY(360deg); }
}

.rotating {
  animation-name: rotate;
  animation-duration: 0.8s;
  animation-timing-function: linear;
}
```
```javascript
// Toggle class, auto-remove
UI.img.AddClass("rotating");
$.Schedule(0.8, () => UI.img.RemoveClass("rotating"));
```

### 10. Panel Re-Parenting (Visibility Hack)
```javascript
// Problem: Panel in gold_container hidden when shop closes
// Solution: Move to persistent root container
function stealOverlay() {
  const ov = UI.hud.FindChildTraverse("MyOverlay");
  if (!ov?.IsValid?.()) return;
  
  if (ov.GetParent() !== UI.hud) {
    ov.SetParent(UI.hud); // MOVE to root
    $.Msg("[Mod] Overlay moved to HudPanel\n");
  }
  ov.style.opacity = "1.0";
  ov.style.width = "100%";
}
```

---

## MICRO-OPTIMIZATIONS (ADVANCED)

### Bitwise Operations
```javascript
// Fast floor: (x | 0) instead of Math.floor(x)
const m = (sec / 60) | 0;

// Fast ceil: ((x + 0.999) | 0) for positive numbers
const rounded = (remaining + 0.5) | 0;

// Fast max(0, x): x > 0 ? x : 0 (avoid Math.max)
const positive = remainMs > 0 ? remainMs : 0;

// Multiply instead of divide by constants
const gameMin = seconds * 0.016667; // vs seconds / 60
```

### Avoid Redundant DOM Writes
```javascript
let lastText = "";
function updateLabel(newText) {
  if (newText !== lastText) {
    UI.label.text = newText;
    lastText = newText;
  }
}
```

### Cache Style Changes
```javascript
let lastColor = null;
function setBarColor(c) {
  if (lastColor !== c) {
    if (UI.bar) UI.bar.style.washColor = c;
    lastColor = c;
  }
}
```

### Throttled Panel Searches
```javascript
const SEARCH_TTL = 3000;
let lastSearchTs = 0, cachedPanel = null;

function findPanel() {
  if (cachedPanel?.IsValid?.()) return cachedPanel;
  
  const now = Date.now();
  if (now - lastSearchTs < SEARCH_TTL) return null;
  
  lastSearchTs = now;
  cachedPanel = expensiveSearch();
  return cachedPanel;
}
```

---

## BENCHMARK RESULTS (Commit d7c96f8)

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Lines of Code | 629 | 310 | -50.7% |
| Tick Rate (Idle) | 1.0s | 3.0s | -66% CPU |
| DOM Queries/sec | ~8 | ~0.5 | -93.75% |
| String Allocations | ~10/tick | 0 | -100% GC |
| Time Parse Speed | Regex | charCodeAt | +350% |

---

## MOD REFERENCE

| Mod | Purpose | Key Pattern |
|-----|---------|-------------|
| `soul_timer/` | Soul drain countdown | Dual-loop, watchdog, re-parenting, lookup table |
| `buff_timer_*/` | Rejuv/buff tracking | Adaptive polling, phase state, zero-alloc |
| `hp/` | Health bar coloring | 5 variants, pip counting, color interpolation |
| `combined_timer/` | Soul + Buff merged | Multi-component integration |
| `kaiz_hud/` | Full HUD redesign | Health interpolation, adaptive tick |
| `self_hp/` | Revitalizer tracker | Cooldown interruption, BFS search |

---

## DEBUG

Enable: Add `-dev -tools` to Deadlock launch options.

| Tag | Module | Meaning |
|-----|--------|---------|
| `[ST-S]` | Soul Timer | Standard logic |
| `[ST-B]` | Buff Timer | Standard logic |
| `[WD]` | Watchdog | Loop stalled, auto-restarted |
| `[ERR]` | Error | Exception caught, recovering |

See `PROBLEM.md` for troubleshooting known issues.

---

## QUICK REFERENCE

### Production Boilerplate (60frame_rate Ready)
```javascript
(()=>{"use strict";
const TICK_FAST = 0.1, TICK_SLOW = 2.0, WD_CHECK = 3.0, WD_STALL = 6000;
const UI = { root: null, hud: null, label: null };
let gen = 0, lastTick = 0, lastText = "";

function boot() {
  const ctx = $.GetContextPanel();
  if (!ctx?.IsValid?.()) return $.Schedule(0.5, boot);
  
  UI.root = ctx;
  while (UI.root.GetParent?.()) UI.root = UI.root.GetParent();
  UI.hud = UI.root.FindChildTraverse("Hud") || UI.root;
  UI.label = UI.hud.FindChildTraverse("MyLabel");
  
  if (!UI.label?.IsValid?.()) return $.Schedule(0.5, boot);
  
  gen++;
  displayLoop(gen);
  slowLoop(gen);
  watchdog(gen);
}

function displayLoop(g) {
  if (g !== gen) return;
  lastTick = Date.now();
  
  try {
    const txt = calculateDisplay();
    if (txt !== lastText) { UI.label.text = txt; lastText = txt; }
  } catch (e) { $.Msg("[ERR]", e, "\n"); }
  
  $.Schedule(TICK_FAST, () => displayLoop(g));
}

function slowLoop(g) {
  if (g !== gen) return;
  try { refreshExpensiveState(); } catch {}
  $.Schedule(TICK_SLOW, () => slowLoop(g));
}

function watchdog(g) {
  if (g !== gen) return;
  if (Date.now() - lastTick > WD_STALL) { $.Msg("[WD] Restart\n"); displayLoop(g); }
  $.Schedule(WD_CHECK, () => watchdog(g));
}

boot();
})();
```

### Compile After Changes
```powershell
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\{mod_name}"
```
