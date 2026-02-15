# AGENT GUIDE: Deadlock Panorama UI Mod Collection

**Project:** Source 2 Panorama JS/CSS/XML mods for Deadlock  
**Architecture:** Distributed mod folders compiled into binary `_compiled` directories.  
**Agent Role:** Autonomous developer for UI features, performance optimization, and VData processing.

## 🛠 WORKFLOW & COMMANDS

### Compile a Mod (MANDATORY)
After any change to `.js`, `.css`, or `.xml`, you MUST run the compiler. It targets the parent folder of the `panorama/` directory.
```powershell
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\{mod_name}"
```

### Manual Test Workflow
There is NO standard linting or automated test runner. Verification is manual:
1. Compile the mod using the command above.
2. Launch Deadlock with launch options: `-dev -tools`.
3. Open the console with **F7** (Panorama Debugger) or **F8** (VConsole).
4. Use `panorama_reload_layout` or restart the game to see changes.

### VData Processing (Abilities)
Located in `abilities/scripts/`. Used to toggle visibility of items/abilities.
1. Remove `_include` block (lines 4-59) from `abilities.vdata`.
2. Run processing scripts:
   ```powershell
   py passive.py abilities2.vdata
   py active.py abilities.vdata
   ```
3. Restore `_include` block.

## 📂 PROJECT STRUCTURE
```
./
├── {mod}/panorama/           # Source files (scripts/*.js, styles/*.css, layout/*.xml)
├── {mod}_compiled/           # Output (.vjs_c, .vcss_c, .vxml_c)
├── abilities/                # VData definitions (260k lines) + Python scripts
├── sr2compiler/              # Custom Source 2 ResourceCompiler wrapper
└── test/                     # Archive/reference mods
```

## 📏 CODE STYLE & CONVENTIONS

### Rules Status
- **No** `.cursorrules` or `.cursor/rules/`
- **No** `.github/copilot-instructions.md`
- Guidance is centralized in this `AGENTS.md` file.

### JavaScript (Panorama)
- **Wrapper**: ALWAYS use IIFE with strict mode: `(() => { "use strict"; ... })();`
- **Constants**: `UPPER_SNAKE_CASE` at the top of the file.
- **Variables**: `camelCase` for state, `_prefixed` for internal/cached values.
- **UI Object**: `const UI = { root: null, label: null, ... };` for panel refs.
- **Indentation**: 2 spaces.

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Constants | UPPER_SNAKE | `TICK_FAST`, `CLAIM_RADIUS_SQ` |
| State vars | camelCase | `buffStart`, `lastSec` |
| Cache/internal | _prefixed | `_tCache`, `_playerState` |
| UI panels | UI.name | `UI.label`, `UI.glowLeft` |
| Debug tags | [TAG] | `[BT-P]`, `[ERR]` |

### CSS & XML
- **CSS**: Use `overflow: noclip;` for glows. Use `visibility: collapse;` instead of `display: none;`.
- **Animations**: Use `pre-transform-scale2d` to avoid blur during scaling.
- **XML**: Set `hittest="false"` for overlays to prevent blocking mouse input.
- **Assets**: Use `s2r://` prefix for compiled paths in XML/CSS.

## 🛡 ERROR HANDLING & SAFETY
- **Panel Guards**: NEVER access a panel without checking validity.
  ```javascript
  if (!panel?.IsValid?.()) return;
  ```
- **Engine API Guards**: Wrap `Game` or `$.` engine calls in `try-catch` where state is volatile.
- **Boot Retry**: Panels may not be ready at script load. Use a recursive schedule:
  ```javascript
  function boot() {
    UI.root = findRoot($.GetContextPanel());
    if (!UI.root?.IsValid?.()) return $.Schedule(0.5, boot);
    initialize();
  }
  ```

## 🚀 PERFORMANCE PATTERNS

### Panel Caching (CRITICAL)
`FindChildTraverse` is expensive. Cache all references once during `boot()`.
```javascript
const UI = { root: null, label: null };
function initialize() {
  UI.label = UI.root.FindChildTraverse("MyLabel");
}
```

### DOM Write Guards
Prevent layout reflows by only updating properties if the value has changed.
```javascript
let _lastVal = "";
function update(newVal) {
  if (newVal === _lastVal) return;
  UI.label.text = newVal;
  _lastVal = newVal;
}
```

### Adaptive Polling
Scale polling frequency based on game state (e.g., fast during combat, slow otherwise).
```javascript
function loop() {
  const delay = inCombat ? 0.1 : 1.0;
  // ... logic ...
  $.Schedule(delay, loop);
}
```

## 🚫 ANTI-PATTERNS
- **NO** `FindChildTraverse` inside `$.Schedule` loops.
- **NO** `new Array()` or `new Object()` in hot paths; reuse variables.
- **NO** `Math.sqrt()` for distance checks; use squared distance (`distSq`).
- **NO** bare `Game.GetGameTime()`; use the `gTime()` utility wrapper.

## 🔧 SHARED UTILITIES
| Function | Purpose |
|----------|---------|
| `gTime()` | Returns game time with 4-tier fallback for reliability. |
| `findRoot(p)` | Helper to find the engine root panel from a child. |
| `distSq(p1, p2)` | Squared distance calculation (performance optimized). |
| `fmt(sec)` | Formats seconds into "MM:SS" or "SS.m" strings. |
| `parseSec(txt)` | Converts "MM:SS" strings back to numeric seconds. |

## 💡 GOTCHAS & DOMAIN KNOWLEDGE
- **VData Scale**: `abilities.vdata` is >260k lines. Use stream processing.
- **Minimap Mirror**: Game mirrors the Y-axis for certain teams using the `.invert_map` class. Detect this and flip Y coordinates manually in JS.
- **Hero Detection**: Panorama lacks a direct "GetHeroImage" API. Use proximity scans.
- **Z-Index**: Use extremely high values (e.g., `99999`) for HUD overlays.

## 🔍 DEBUG TAGS & MODULES
| Tag | Module | Purpose |
|-----|--------|---------|
| `[BT-P]` | Buff Timer | Position and layout logic for top-bar timers. |
| `[ST-S]` | Soul Timer | State synchronization and countdown logic. |
| `[ERR]` | Core | Caught exceptions or invalid states. |

## 📦 KEY MODS & REFERENCE
- `buff_timer_virgin/`: Top-bar buff tracker with linger support.
- `soul_timer/`: Unsecured soul drainage countdown widget.
- `combined_timer_v2/`: Merged implementation of soul and buff tracking.
- `hp/`: Various health bar redesigns and status indicators.
- `standalone_redesign/`: Production-grade ability icon and HUD overhaul.
