# PROJECT KNOWLEDGE BASE

**Project:** Deadlock Panorama UI Mod Collection  
**Type:** Source 2 Panorama JS/CSS/XML mods  
**Updated:** 2026-01-23

## BUILD COMMANDS

### Compile a Mod (MANDATORY after any change)
```powershell
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\{mod_name}"
```

### Test In-Game
Launch Deadlock with `-dev -tools`. Press F7 for console.

### No Lint/Test Commands
This project uses Source 2 resourcecompiler. No npm/eslint/jest.

## PROJECT STRUCTURE
```
./
├── {mod}/panorama/           # Source files (scripts/*.js, styles/*.css, layout/*.xml)
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
- **Indentation**: 2 spaces preferred

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Constants | UPPER_SNAKE | `TICK_FAST`, `CLAIM_RADIUS_SQ` |
| State vars | camelCase | `buffStart`, `lastSec` |
| Cache/internal | _prefixed | `_tCache`, `_playerState` |
| UI panels | UI.name | `UI.label`, `UI.glowLeft` |
| Debug tags | [TAG] | `[BT-P]`, `[ERR]` |

### Error Handling
```javascript
if (!panel?.IsValid?.()) return;           // ALWAYS wrap panel access
try { value = Game.GetGameTime(); } catch {} // Try-catch engine APIs
function boot() {                           // Boot retry pattern
  if (!UI.label?.IsValid?.()) return $.Schedule(0.5, boot);
  loop();
}
```

### CSS
- `overflow: noclip;` for glows/shadows
- `visibility: collapse;` (NOT `display: none`)
- `pre-transform-scale2d` for animations (avoids blur)
- `z-index: 99999+` for HUD overlays

### XML
- `hittest="false"` for non-interactive overlays
- Use `s2r://` paths for compiled assets

## ANTI-PATTERNS (DO NOT USE)

| Bad Pattern | Fix |
|-------------|-----|
| `FindChildTraverse` in loops | Cache at boot in `UI` object |
| `Game.GetGameTime()` unwrapped | Use `gTime()` with fallback |
| `new Array/Object` in hot path | Reuse pooled objects |
| `Math.sqrt()` in hot path | Use `distSq()` squared distance |
| `transform: scale3d` + shadow | Use `pre-transform-scale2d` |
| Bare panel access | `try-catch` + `?.IsValid?.()` |

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
const TICK_NORM = 1.0, TICK_FAST = 0.1;
$.Schedule(timeRemaining < 10 ? TICK_FAST : TICK_NORM, loop);
```

### DOM Write Guards
```javascript
let _lastText = "";
if (newText !== _lastText) { UI.label.text = newText; _lastText = newText; }
```

### Cache with TTL
```javascript
let _cache = null, _cacheTs = 0;
if (!_cache || Date.now() - _cacheTs > 800) { _cache = search(); _cacheTs = Date.now(); }
```

### Minimap Y-Axis Inversion
```javascript
// Game applies .invert_map class for team-based mirroring
if (mm?.BHasClass?.("invert_map")) { by = mm.contentheight - by - bh; }
```

## SHARED UTILITIES

| Function | Purpose |
|----------|---------|
| `gTime()` | 4-tier game time fallback |
| `findRoot(p)` | Traverse to engine root |
| `parseSec(txt)` | "MM:SS" → seconds (charCodeAt) |
| `distSq(p1,p2)` | Squared distance (no sqrt) |
| `fmt(sec)` | Seconds → "MM:SS" string |

## DEBUG

| Tag | Module |
|-----|--------|
| `[ST-S]` | Soul Timer |
| `[BT-P]` | Buff Timer Position |
| `[ERR]` | Exception |

Enable: `-dev -tools` launch options. Console: F7.

## KEY MODS

| Mod | Purpose | Version |
|-----|---------|---------|
| `buff_timer_virgin/` | Rejuv/buff tracker + linger | v5.6 |
| `soul_timer/` | Soul drain countdown | v4.2 |
| `combined_timer_v2/` | Merged soul+buff | Latest |
| `hp/` | Health bar variants | 5 versions |
| `standalone_redesign/` | Ability icon redesign | Production |

## GOTCHAS

- **VData files are huge**: `abilities.vdata` is 260k lines. Use stream processing.
- **No hero detection**: Panorama JS cannot read `Image.src`. Use proximity scan.
- **Ghost panels**: Check `actualvisibility !== "collapse"` + parent chain.
- **Minimap mirror**: Game uses `.invert_map` class with `scaleY(-1)`. Detect and flip Y coords.
- **Panel positioning**: Use `style.position = "Xpx Ypx 0px"` for absolute placement on minimap.
