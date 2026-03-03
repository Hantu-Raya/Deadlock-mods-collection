# AGENTS: Buff Timer Virgin (v6.2)

## OVERVIEW
Production-ready Rejuvenator and Bridge Buff tracker for Deadlock with balanced-performance architecture. Core features: claim detection, minimap glows, enemy fog linger, and neutral respawn labels. Runtime is optimized around a shared minimap snapshot pipeline to reduce repeated DOM traversals and allocation churn.

## STRUCTURE
- `panorama/scripts/rejuvnbufftimer.js`: Main logic (~1700 lines). Timers, state machine, shared minimap snapshot, one-pass proximity engine, enemy linger, and neutral respawn scan/render split.
- `panorama/layout/hud.xml`: Timer/claim/minimap overlay panel tree.
- `panorama/styles/hud_timer.css`: Countdown/timer visuals.
- `panorama/styles/buff_claim.css`: Glow, claim box, linger question labels, and neutral timer label styles.

## LOGIC
### Shared Minimap Snapshot Pipeline (v6.2)
`collectMinimapSnapshot(nowMs, forceFresh)` performs one `FindChildrenWithClassTraverse("map_button")` sweep and classifies into reusable arrays:
- `_minimapSnapshot.players`
- `_minimapSnapshot.powerupSpawns`
- `_minimapSnapshot.neutralCamps`

Each entry precomputes:
- `id`, `panel`, `isActive`, `isDead`, `team`
- `xPct`, `yPct`, `actualX`, `actualY`

Snapshot reuse intervals:
- Active state: `MINIMAP_SNAPSHOT_INTERVAL_ACTIVE_MS = 300`
- Idle state: `MINIMAP_SNAPSHOT_INTERVAL_IDLE_MS = 500`

### Claim Detection
Claim attribution remains proximity-based:
1. Pretrack near known spawn points before bridge spawn.
2. Multi-target nearest-distance pass via `computeNearestForTargets(...)`.
3. Dead-player grace handling (`DEATH_GRACE_MS = 2000`) preserved.
4. Final classification unchanged (`CLAIM_RADIUS_SQ = 64`, ally-closer preference).

### LEFT/RIGHT Assignment
- Powerups sort by x-coordinate.
- Lower x -> LEFT, higher x -> RIGHT.
- Respects minimap inversion (`invert_map`).

### Enemy Linger (CS:GO style)
- `checkEnemyLinger(nowMs, snapshot)` consumes snapshot players instead of rescanning map buttons.
- Transition rules preserved:
  - `wasActive && !isActive` -> show linger.
  - `!wasActive && isActive` -> cancel linger.
  - dead -> cancel linger immediately.
- Dynamic `?` labels remain created via `$.CreatePanel("Label", ...)`.

### Neutral Respawn Timers (v6.2)
Neutral logic is split for lower CPU:
- `scanNeutralRespawnState(snapshot, nowMs)` every `500ms` (state transitions only).
- `renderNeutralRespawnTimers(nowMs)` every `250ms` (UI render only).

Behavior rules preserved:
- Start timer on `wasActive && !isActive`.
- Clear timer on `!wasActive && isActive`.
- Remove at `00:00`.
- Purge stale non-running states after `NEUTRAL_STATE_PURGE_MS`.

State tracking:
- `_neutralRespawnState[key]` with `sweepToken` marking instead of per-tick `seen` map allocations.
- Matching by explicit id when available, otherwise nearest same-type state by map percentage.

## PERFORMANCE OPTIMIZATIONS (v6.2)
### Hot-Path Architecture
- Shared snapshot reused by loop subsystems (`pretrack`, `monitorPowerups`, `checkEnemyLinger`, neutral scan).
- One-pass proximity engine for multiple targets (`computeNearestForTargets`).
- Reduced repeated `FindChildrenWithClassTraverse` calls across subsystems.

### DOM Write Guards
- Existing text guards remain for timer labels and claim timers.
- Neutral timer position now writes only when changed (`lastPosX/lastPosY` threshold guard).

### Memory Controls
- Reused arrays/objects for snapshot and nearest-target passes.
- `_playerState` pruned on phase/run transitions, preserving active linger entries.
- Reset path clears snapshot buffers, neutral sweep metadata, and perf counters.

### Debug Gating
Production defaults:
- `DEBUG_MINIMAP_COLLAPSE = false`
- `DEBUG_NEUTRAL_TIMERS = false`
- `DEBUG_PERF = false`

Optional perf telemetry (`DEBUG_PERF = true`) logs:
- snapshot sweeps
- linger checks
- neutral scans
- proximity passes

## POLLING INTERVALS
| State | Interval | Purpose |
|-------|----------|---------|
| Active countdown loop | 0.1s | High-fidelity countdown near spawn |
| Idle countdown loop | 1.0s | Lower CPU when less time-critical |
| Not running | 30s | Minimal hideout overhead |
| Linger checks | 300ms | Balanced visibility transition accuracy |
| Powerup monitor | 300ms | Balanced claim detection latency |
| Pretrack | 1000ms | Spawn-adjacent history capture |
| Snapshot refresh (active) | 300ms | Shared map data reuse |
| Snapshot refresh (idle) | 500ms | Reduced idle scan cost |
| Neutral state scan | 500ms | Transition detection |
| Neutral timer render | 250ms | Smooth visible countdown |
| Global time cache | 200ms | Reduce repeated parse of topbar time |

## CONVENTIONS
- Snapshot first: collect once, reuse downstream.
- Keep per-iteration logic branch-light in hot loops.
- Guard all panel access with `?.IsValid?.()`.
- Guard DOM writes on value change.
- Prefer squared distances over `Math.sqrt`.
- Keep try/catch at subsystem boundaries, not deeply nested per item, unless engine safety requires localized protection.

## ANTI-PATTERNS
- Repeated `FindChildrenWithClassTraverse("map_button")` from multiple subsystems in the same tick window.
- Recomputing proximity via separate full player scans for each target.
- Unconditional `label.text` and `style.position` writes in frequent render paths.
- Pruning `_playerState` entries that still have active `_lingerState`.
- Enabling debug logs by default in production gameplay sessions.

## DEBUG
Launch with `-dev -tools` and use Panorama console (`F7`).

When enabled:
- Neutral logs: `[BT-NEUTRAL] ...`
- Minimap collapse logs: `[BT-MAP] ...`
- Perf logs: `[BT-PERF] ...`

Default production state keeps these logs disabled.

## BUILD
```powershell
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
```

Build note:
- Compiler may print a non-asset warning for `AGENTS.md`.
- Wrapper may exit non-zero in redirected terminals because of `Console.ReadKey`, even when assets compile successfully.
