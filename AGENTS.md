# PROJECT KNOWLEDGE BASE

**Project:** Deadlock Panorama UI Mod Collection  
**Type:** Source 2 Panorama JS/CSS/XML mods  
**Updated:** 2026-01-22

## BUILD COMMANDS

### Compile a Mod (MANDATORY after any change)
```powershell
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\{mod_name}"
```

### Examples
```powershell
# buff_timer_virgin
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"

# soul_timer
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\soul_timer"
```

### Test In-Game
Launch Deadlock with `-dev -tools`. Press F7 for console.

### No Lint/Test Commands
This project uses Source 2 resourcecompiler. No npm/eslint/jest.

## PROJECT STRUCTURE
```
./
├── {mod}/panorama/           # Source files
│   ├── scripts/*.js          # IIFE + "use strict"
│   ├── styles/*.css          # Source 2 CSS
│   ├── layout/*.xml          # Panel definitions
│   └── images/               # .svg/.png assets
├── {mod}_compiled/           # Output (.vjs_c, .vcss_c, .vxml_c)
├── abilities/                # VData definitions (260k lines) + Python scripts
├── sr2compiler/              # Custom Source 2 ResourceCompiler
└── test/                     # Archive/reference mods
```

## CODE STYLE

### JavaScript
- **Wrapper**: `(()=>{"use strict"; ... })();` (IIFE + strict mode)
- **Constants**: `UPPER_SNAKE_CASE` at top of file
- **Variables**: `camelCase` for state, `_prefixed` for internal/cache
- **UI Object**: `const UI = { root: null, label: null, ... };` for panel refs
- **Functions**: `function name() {}` for main logic, `() => {}` for callbacks
- **Indentation**: 2 spaces preferred (some files use 4)

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Constants | UPPER_SNAKE | `TICK_FAST`, `CLAIM_RADIUS_SQ` |
| State vars | camelCase | `buffStart`, `lastSec` |
| Cache/internal | _prefixed | `_tCache`, `_playerState` |
| UI panels | UI.name | `UI.label`, `UI.glowLeft` |
| Debug tags | [TAG] | `[BT-P]`, `[ERR]`, `[WD]` |

### Error Handling
```javascript
// ALWAYS wrap panel access
if (!panel?.IsValid?.()) return;

// Try-catch for engine API calls
try { value = Game.GetGameTime(); } catch {}

// Boot retry pattern
function boot() {
  if (!UI.label?.IsValid?.()) return $.Schedule(0.5, boot);
  loop();
}
```

### CSS
- `overflow: noclip;` for glows/shadows
- `visibility: collapse;` (NOT `display: none`)
- `pre-transform-scale2d` for animations (avoids blur)
- `z-index: 99999+` for HUD overlays
- `wash-color` for tinting panels

### XML
- `hittest="false"` for non-interactive overlays
- Use `s2r://` paths for compiled assets

## ANTI-PATTERNS (DO NOT USE)

| Bad Pattern | Why | Fix |
|-------------|-----|-----|
| `FindChildTraverse` in loops | O(N) every call | Cache at boot in `UI` object |
| `Game.GetGameTime()` unwrapped | Returns 0 in menus | Use `gTime()` with 4-tier fallback |
| `new Array/Object` in render | GC pressure | Reuse objects |
| `Math.sqrt()` in hot path | Expensive | Use squared distance |
| `transform: scale3d` + shadow | Clipping/blur | Use `pre-transform-scale2d` |
| String concat in loops | Allocation per concat | PAD lookup tables |
| Regex for number parsing | Slow + allocations | `charCodeAt()` loops |
| Bare panel access | Crash on reload | `try-catch` + `?.IsValid?.()` |

## PERFORMANCE PATTERNS

### Panel Caching (MANDATORY)
```javascript
const UI = { root: null, hud: null, label: null };
function boot() {
  UI.root = findRoot($.GetContextPanel());
  UI.label = UI.root.FindChildTraverse("MyLabel");
  if (!UI.label?.IsValid?.()) return $.Schedule(0.5, boot);
  loop();
}
```

### Adaptive Polling
```javascript
const TICK_IDLE = 3.0, TICK_NORM = 1.0, TICK_FAST = 0.1;
let tick = inHideout ? TICK_IDLE : (timeRemaining < 10 ? TICK_FAST : TICK_NORM);
$.Schedule(tick, loop);
```

### DOM Write Guards
```javascript
let _lastText = "";
if (newText !== _lastText) { UI.label.text = newText; _lastText = newText; }
```

### Cache with TTL
```javascript
let _cache = null, _cacheTs = 0;
const TTL = 800;
if (!_cache || Date.now() - _cacheTs > TTL) {
  _cache = expensiveSearch();
  _cacheTs = Date.now();
}
```

## SHARED UTILITIES

| Function | Purpose | Location |
|----------|---------|----------|
| `gTime()` | 4-tier game time fallback | Most timer mods |
| `findRoot(p)` | Traverse to engine root | Boot functions |
| `parseSec(txt)` | "MM:SS" → seconds (charCodeAt) | Timer mods |
| `distSq(p1,p2)` | Squared distance (no sqrt) | Proximity detection |
| `fmt(sec)` | Seconds → "MM:SS" string | Timer display |

## DEBUG

| Tag | Module |
|-----|--------|
| `[ST-S]` | Soul Timer |
| `[BT-P]` | Buff Timer Position |
| `[WD]` | Watchdog (loop stalled) |
| `[ERR]` | Exception |
| `[DBG]` | Debug output |

Enable: `-dev -tools` launch options. Console: F7.

## KEY MODS

| Mod | Purpose | Status |
|-----|---------|--------|
| `buff_timer_virgin/` | Rejuv/buff tracker | v5.5 Production |
| `soul_timer/` | Soul drain countdown | v4.2 Optimized |
| `combined_timer_v2/` | Merged soul+buff | Latest |
| `hp/` | Health bar variants | 5 versions |
| `standalone_redesign/` | Ability icon redesign | Production |

### Standalone Redesign CSS Customizations
- **File**: `panorama/styles/base/hud_ability_icon_passive.css`
- **Approach**: Full CSS override with customizations appended at end of file
- **Custom Rules** (lines 1303-1325):
  - `#hud_passive_items #cooldown_mask`: `opacity-mask: status_border_psd.vtex`, `height: 37px`, `background-color: offWhite`, `margin-top: 10%`
  - `.cooling_down #cooldown_mask,.ability_not_ready #cooldown_mask`: Repositioned to end for override priority
  - `.ability_not_ready .ability_image`: `wash-color: #222222aa`

## GOTCHAS

- **VData files are huge**: `abilities.vdata` is 260k lines. Use stream processing.
- **No hero detection**: Panorama JS cannot read `Image.src`. Use proximity scan.
- **Ghost panels**: Check `actualvisibility !== "collapse"` + parent chain.
- **Shop pause bug**: Use watchdog timer (5s stall = restart).
