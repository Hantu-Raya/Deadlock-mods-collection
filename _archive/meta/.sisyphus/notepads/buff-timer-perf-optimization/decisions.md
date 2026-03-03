# Decisions - Buff Timer Performance Optimization

## 2026-01-19 Task: Performance Optimization v5.2 → v5.3

### Decision: Rename `dist()` to `distSq()`
**Rationale:** Function now returns squared distance, not actual distance. Name must reflect behavior to prevent future bugs.
**Alternative considered:** Keep name `dist()` with comment - rejected because it's error-prone.

### Decision: Keep `_last*` variables at module scope
**Rationale:** DOM write guards need persistence across function calls. Module scope is appropriate for caching.
**Alternative considered:** Object property on panel - rejected because it adds panel access overhead.

### Decision: Pass `nowMs` parameter instead of closure
**Rationale:** Explicit parameter passing is clearer than relying on closure scope. Makes data flow visible.
**Alternative considered:** Capture in closure - rejected because it's less explicit and harder to trace.

### Decision: Single try-catch wrapper in `panelHas()`
**Rationale:** Panels can become invalid mid-iteration. Need try-catch for safety, but one wrapper is sufficient.
**Alternative considered:** Remove try-catch entirely - rejected because runtime errors would crash the HUD.

### Decision: Commit after each task (6 commits)
**Rationale:** Atomic commits make it easy to bisect if issues arise. Each optimization is independently revertable.
**Alternative considered:** Single squashed commit - rejected because it obscures history.
