# Learnings: Buff Timer Optimization

## Performance Patterns
- **Math.sqrt() Elimination**: Euclidean distance `sqrt(dx^2 + dy^2) < R` can be replaced with `dx^2 + dy^2 < R^2`. This is a major optimization in hot paths like proximity scanning.
- **Object Pooling**: Reusing object literals instead of allocating new ones prevents GC spikes. In Panorama JS, where the environment is somewhat constrained, this is very effective for polling loops.
- **String Formatting**: Concatenating strings for `MM:SS` formatting (e.g., `(m < 10 ? "0" + m : m) + ":" ...`) can be optimized using a pre-computed lookup table `PAD = ["00", "01", ...]`.
- **Glow Removal**: Inlining `RemoveClass` calls for known glow classes is faster than iterating an array of class names, especially if the array is small.

## Panorama Specifics
- **Dead XML Panels**: `hero_pos_debug` was leftover dev junk. Removing it reduces DOM complexity.
- **Snippets**: Snippets that are not instantiated by `$.CreatePanelWithSnippet` are dead weight.
- **Polling Interval**: Increasing the pretrack interval from 750ms to 1000ms reduces wake-ups without sacrificing accuracy.
### XML Cleanup (2026-01-26)
- Removed 6 unused `LingerOverlay` panels and the associated comment from `buff_timer_virgin/panorama/layout/hud.xml`.
- These panels were identified as redundant because the JavaScript implementation uses dynamic panel creation (`$.CreatePanel`) for linger indicators.
- Verified that `MinimapGlow` and `MinimapBuffClaim` panels were preserved as they are still in use.
## 2026-01-26 - Buff Timer Optimization
- Removed dead code (GLOW_CLASSES array) and debug logging ($.Msg calls).
- Streamlined checkEnemyLinger by removing linger log throttle logic (_lingerLogTs).
- Preserved empty catch blocks for error isolation as requested.
- Verified removal of all $.Msg calls via grep.
## v5.6 Documentation Update
- Updated Buff Timer Virgin AGENTS.md to reflect v5.6 architectural changes.
- Documented shift from static XML-defined linger overlays to dynamic $.CreatePanel approach.
- Removed outdated debug tag references as $.Msg calls were purged for production.
- Verified line count update to ~1380 lines reflecting the expanded codebase.
