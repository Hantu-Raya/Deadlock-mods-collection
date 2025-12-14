# AGENTS.md - Dota 2 Panorama UI Modding

## Build/Lint/Test Commands
- Build: `"F:\Users\Shiv\Desktop\New folder (3)\New folder.exe" "F:\Users\Shiv\Desktop\New folder (3)\hp"`
- Test: Load mod in Dota 2, verify health bar colors/HP accuracy
- Run single test: Check HP counter display (e.g., "Current / Max" values in-game)

## Code Style Guidelines
- Structure: IIFE `(function(){...})();`, early returns, constants grouped at top
- Naming: camelCase vars/funcs, ALL_CAPS constants, descriptive names
- Declarations: `const` for immutable, `let` for mutable, no `var`
- Functions: Named declarations for logic, anonymous for callbacks
- Imports: None (Panorama JS), use Panorama APIs directly
- Formatting: 2-space indentation, semicolons required, single quotes for strings
- Types: No TypeScript, use JSDoc for complex functions
- Error Handling: Null checks, try-catch blocks, graceful degradation
- Minification: Remove comments, shorten variable names, single-line for production

## Performance Optimization (Zero-Allocation)
### FindChildTraverse Caching
- **NEVER** call `FindChildTraverse` inside update loops (O(N) operation)
- Cache all panels ONCE at init with retry logic
- Use `panel.IsValid()` to revalidate cached panels
- Stop retrying after `MAX_CACHE_ATTEMPTS` (e.g., 10)

### Dirty Checking (The Golden Rule)
- **Bad**: `panel.style.washColor = color;` (triggers layout even if same)
- **Good**: `if (lastColor !== color) { panel.style.washColor = color; lastColor = color; }`
- Apply to ALL DOM writes: `washColor`, `visibility`, `text`, class changes

### GC Avoidance
- Pre-allocate constants: `const EMPTY_STRING = '';`
- No `new Array`, `new Object` in loops
- Move string generation (like `rgb()`) to static lookup tables
- Use `charCodeAt()` instead of `charAt()` for parsing

### Adaptive Scheduling
| Condition | Interval |
|-----------|----------|
| Neutral units | 1.5s |
| Friendly units | 0.4s |
| Idle (2s no change) | 1.0s |
| Active combat | 0.15s |
| Stable values | Exponential backoff |

### CSS Animation for Pulse Effects
- Use CSS `@keyframes` for animations (GPU-accelerated)
- JS toggles classes: `panel.AddClass('low_hp_pulse')` / `panel.RemoveClass('low_hp_pulse')`
- Benefits: No JS polling, no GC, smoother animation

## Panorama Guidelines
- CSS: `@import` base styles, `wash-color` for tinting, `border-image` for scaling
- JS APIs: `$.GetContextPanel()`, `FindChildTraverse()`, `element.style`, `$.Schedule()`
- Global search: `$('#panel_id')` searches from root (useful for panels outside local tree)
- Best Practices: `'use strict'`, test in-game, document integrations, avoid global pollution

## Variable Naming (Minified Code)
| Pattern | Example | Purpose |
|---------|---------|---------|
| `hb` | healthBar | Main panel |
| `cp` | containerPanel | Parent reference |
| `ct`, `cf` | cachedTeam, cachedFlags | State cache |
| `lc`, `luc` | lastColor, lastUiColor | Dirty check |
| `sC`, `sU` | setColor, setUltColor | Setter functions |
| `u` | update | Main loop |

## Max HP Estimation & Display
- **Per-Instance Context**: Scripts attached to repeated XML layouts run in independent scopes
- **Robust Parsing**: Use `charCodeAt()` for counting pipes/quotes, avoid `split()` (GC)
- **Dynamic Calculation**: Always recalculate Max HP from pip label, don't cache stale values
- **Hover Detection**: Use `$.GetContextPanel().BHasHoverStyle()` for reliable hover detection