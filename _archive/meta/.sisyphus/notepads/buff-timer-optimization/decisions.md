# Decisions: Buff Timer Optimization

## Decision 1: Squared Distance
- **Choice**: Replace `dist()` with `distSq()` and use `CLAIM_RADIUS_SQ`.
- **Rationale**: `Math.sqrt` is expensive. Comparisons are preserved mathematically.

## Decision 2: Object Pooling in _playerState
- **Choice**: Check for existence of `_playerState[id]` and update properties in-place.
- **Rationale**: 10-20 player objects were being re-allocated every 300ms.

## Decision 3: Remove Dead XML
- **Choice**: Delete `hero_pos_debug` and all unused snippets.
- **Rationale**: Verified they are not referenced in JS.
