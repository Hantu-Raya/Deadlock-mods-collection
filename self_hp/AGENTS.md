# PROJECT KNOWLEDGE BASE: self_hp

## OVERVIEW
High-complexity Revitalizer tracker and health bar modification. Monitors health percentage drops to trigger a custom 12s cooldown overlay when damage is detected, specifically tuned for the Revitalizer item's utility.

## LOGIC

### Damage Detection & Recovery
- **`detectDamage(currentPct)`**: Core logic that triggers the cooldown. It compares the current smoothed health against a baseline (`prevHealthPct`).
- **Thresholds**: Triggers if a drop >= 0.1% occurs. Resets damage detection state if a recovery (healing) of > 0.7% is detected.
- **Interrupts**: If health drops by > 0.5% *during* an active cooldown, the timer is reset/interrupted to reflect fresh damage.

### Alpha Smoothing
- **`smoothHealth(rawPct)`**: Implements a simple Low-Pass Filter (LPF) to reduce UI jitter.
- **Formula**: `smoothed = (0.3 * raw) + (0.7 * smoothed_prev)`.
- This ensures that minor UI layout shifts don't trigger false damage detection.

### UI Tree Scanning
- **`findRevitalizer()`**: Recursively scans the `LowerLeft` panel tree for any element with the `.revitalizer` class.
- **Caching**: Uses a 3000ms TTL cache (`SEARCH_CACHE_TTL`) to avoid expensive recursive searches on every frame (0.05s-0.1s polling).

## KEY FILES
| File | Role |
|------|------|
| `health_bar_left.js` | Main logic (410 lines). Handles LPF, damage detection, and CD timing. |
| `hud_health.xml` | Layout definition for the custom health bar and cooldown labels. |
| `hud_health.css` | Styling, including `.revitalizer` targeting and wash colors. |

## GOTCHAS
- **CRITICAL**: `const DEBUG = true` is currently enabled in `health_bar_left.js`. This MUST be set to `false` in production to avoid console spam.
- **Layout Dependency**: Relies on `actuallayoutheight`. If the parent panel is collapsed or has 0 height, logic will fail-safe to a 1s retry loop.
- **Class Matching**: Damage detection only runs if a panel with the `.revitalizer` class is found in the UI tree.
