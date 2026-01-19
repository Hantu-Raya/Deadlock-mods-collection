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
