# AGENTS.md - Deadlock/Dota 2 Panorama UI Modding

## Build/Lint/Test Commands

- Build: Use Dota 2 Workshop Tools to compile, then pack to VPK
- Repo: `F:\Users\Shiv\Desktop\Deadlock-mods-collection`
- Test: Load mod in Deadlock, verify HUD elements display correctly

## Code Style Guidelines

- Structure: IIFE `(()=>{"use strict";...})();`, early returns, constants grouped at top
- Naming: camelCase vars/funcs, ALL_CAPS constants, descriptive names
- Declarations: `const` for immutable, `let` for mutable, no `var`
- Functions: Named declarations for logic, anonymous for callbacks
- Imports: None (Panorama JS), use Panorama APIs directly
- Formatting: 2-space indentation, semicolons required
- Error Handling: Null checks, try-catch blocks, graceful degradation
- Compacting: Remove blank lines, merge declarations, inline small helpers

## Performance Optimization (Zero-Allocation)

### FindChildTraverse Caching

- **NEVER** call `FindChildTraverse` inside update loops (O(N) operation)
- Cache all panels ONCE at boot with retry logic
- Use `panel?.IsValid?.()` for optional chaining safety

### Hard DOM Caching Pattern

```javascript
const UI = { root: null, hud: null, myPanel: null };
function boot() {
  const r = findRoot($.GetContextPanel());
  UI.root = r;
  UI.hud = r.FindChildTraverse("Hud");
  UI.myPanel = r.FindChildTraverse("MyPanel");
  if (!UI.myPanel) return $.Schedule(0.5, boot); // Retry
  loop();
}
```

### Game Time Retrieval (Deadlock)

- Native APIs may not exist, always have UI fallback
- Cache parsed time with TTL (200ms recommended)

```javascript
let _tCache = 0,
  _tCacheTs = 0;
function gTime() {
  const n = Date.now();
  if (n - _tCacheTs < 200) return _tCache;
  let t = 0;
  try {
    t = Game.GetGameTime?.() | 0;
  } catch {}
  if (t > 0) {
    _tCache = t;
    _tCacheTs = n;
    return t;
  }
  t = uiTime(); // Fallback to parsing HUD label
  _tCache = t;
  _tCacheTs = n;
  return t;
}
```

### Zero-Alloc String Parsing (No Regex)

```javascript
function parseSec(t) {
  if (!t) return 0;
  const s = String(t),
    ci = s.indexOf(":");
  if (ci < 0) return 0;
  let mm = 0,
    ss = 0,
    c;
  for (let i = 0; i < ci; i++) {
    c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) mm = mm * 10 + (c - 48);
  }
  for (let i = ci + 1, n = 0; i < s.length && n < 2; i++, n++) {
    c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) ss = ss * 10 + (c - 48);
    else break;
  }
  return mm * 60 + (ss > 59 ? ss % 60 : ss);
}
```

### Dirty Checking

- **Bad**: `panel.style.washColor = color;` (triggers layout even if same)
- **Good**: `if(lastColor!==color){panel.style.washColor=color;lastColor=color;}`

### GC Avoidance

- Pre-allocate constants: `const EMPTY_STRING = '';`
- No `new Array`, `new Object` in loops
- Use `charCodeAt()` instead of regex for parsing

### Adaptive Scheduling

| Condition         | Interval |
| ----------------- | -------- |
| Hideout / Idle    | 3.0s     |
| Normal countdown  | 1.0s     |
| Near spawn (≤10s) | 0.1s     |
| Active combat     | 0.15s    |

### BHasClass Priority

- Always use `panel.BHasClass("className")` instead of `className.indexOf()`
- Native C++ binding, faster and no string allocation

## Panorama Guidelines

- CSS: `@import` base styles, `wash-color` for tinting
- JS APIs: `$.GetContextPanel()`, `FindChildTraverse()`, `$.Schedule()`
- Best Practices: `'use strict'`, test in-game, avoid global pollution

## Variable Naming (Compacted Code)

| Pattern      | Example      | Purpose        |
| ------------ | ------------ | -------------- |
| `r`, `tb`    | root, topBar | DOM references |
| `hnd`        | handle       | Timer handle   |
| `idx`, `cnt` | index, count | Loop state     |
| `_tCache`    | timeCache    | Cached values  |
| `UI`         | UICache      | All DOM refs   |
