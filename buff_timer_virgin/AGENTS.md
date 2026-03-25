# AGENTS: Buff Timer Virgin (v6.4)

## OVERVIEW
Production-ready Rejuvenator, Bridge Buff, and Jungle Camp Respawn tracker for Deadlock. Core features: claim detection, minimap glows, enemy fog linger, and neutral respawn rings with countdown labels. Runtime is optimized around a shared minimap snapshot pipeline to reduce repeated DOM traversals and allocation churn.

## STRUCTURE
- `panorama/scripts/rejuvnbufftimer.js`: Main logic. Timers, state machine, shared minimap snapshot, one-pass proximity engine, enemy linger, and neutral respawn scan/render split.
- `panorama/scripts/jungle_timer.js`: Neutral camp respawn ring overlay. Independent scan+render loop, adaptive polling, per-frame clip updates.
- `panorama/layout/hud.xml`: Timer/claim/minimap overlay panel tree. Loads both scripts.
- `panorama/styles/hud_timer.css`: Countdown/timer visuals (BuffTimeClip, RejuvTimeClip).
- `panorama/styles/buff_claim.css`: Glow, claim box, linger question labels, and neutral timer label styles.
- `panorama/styles/jungle_timer.css`: Neutral camp ring styles (`.neutral-cooldown-ring`, `.neutral-cooldown-ring-fill`, `.neutral-cooldown-timer-detail`).

## LOGIC
### Shared Minimap Snapshot Pipeline
`collectMinimapSnapshot(nowMs, forceFresh)` in `rejuvnbufftimer.js` performs one `FindChildrenWithClassTraverse("map_button")` sweep and classifies into reusable arrays:
- `_minimapSnapshot.players`
- `_minimapSnapshot.powerupSpawns`
- `_minimapSnapshot.neutralCamps`

`jungle_timer.js` has its own independent snapshot pipeline using the same pattern.

### Claim Detection
Claim attribution remains proximity-based:
1. Pretrack near known spawn points before bridge spawn.
2. Multi-target nearest-distance pass via `computeNearestForTargets(...)`.
3. Dead-player grace handling (`DEATH_GRACE_MS = 2000`) preserved.
4. Final classification unchanged (`CLAIM_RADIUS_SQ = 64`, ally-closer preference).

### LEFT/RIGHT Assignment
- Powerups sort by x-coordinate.
- Lower x → LEFT, higher x → RIGHT.
- Respects minimap inversion (`invert_map`).

### Enemy Linger (CS:GO style)
- `checkEnemyLinger(nowMs, snapshot)` consumes snapshot players instead of rescanning map buttons.
- Transition rules preserved:
  - `wasActive && !isActive` → show linger.
  - `!wasActive && isActive` → cancel linger.
  - dead → cancel linger immediately.
- Dynamic `?` labels remain created via `$.CreatePanel("Label", ...)`.

### Neutral Respawn Rings (jungle_timer.js)
Independent loop with adaptive polling rate. Per-frame clip updates (no CSS transitions).

**Ring visibility rules:**
| Remaining time | Opacity |
|---|---|
| > 60s | 0 (hidden) |
| 60s → 30s | Fades in 0 → 0.85 |
| < 30s | 0.85 |
| Scoreboard open | 1.0 (instant, overrides all time-based rules) |

**Scoreboard detection** — `isScoreboardOpen(mm)` checks `gScoreboardOpen` class on 5 panels in priority order:
1. `hud_minimap` (passed as `mm`) — primary check; confirmed to receive `gScoreboardOpen` + `zoomLevel1` when Tab is held
2. `minimap_persp` (scoreboardRoot)
3. `minimap_container` (minimapBox)
4. `HudMinimapContainer` (minimapContainer)
5. Root panel

When scoreboard opens, `scoreboardJustOpened` triggers a render pass even if no timers are running, so rings appear immediately without waiting for the next poll interval.

**Loop architecture:**
- Scan and render in a single pass each iteration.
- Adaptive interval: 0.25s (scoreboard open), 0.5s (<10s remaining), 1.0s (normal), 2.0s (idle, no timers).
- `map_button` traversal cached 5s TTL.
- `refreshPanels` cached 2s TTL.
- Minimap inversion cached 30s TTL.
- Ring panel IDs precomputed once in `createState()`.

**Panel hierarchy:**
```
minimap_container (UI.minimapBox)
  └─ NeutralCooldownOverlayLayer  (created by JS, position 0 0 0, 100% × 100%)
       └─ NeutralCooldownRing_*_anchor  (.neutral-cooldown-anchor, 100% × 100%)
            ├─ NeutralCooldownRing_*   (.neutral-cooldown-ring, 24px, position X% Y%)
            │    └─ NeutralCooldownRing_*_fill  (.neutral-cooldown-ring-fill)
            └─ NeutralCooldownRing_*_text  (.neutral-cooldown-timer-detail, position X% Y%)
```

**Clip animation:** per-frame `ringFill.style.clip = "radial(50% 50%, 0deg, Xdeg)"` based on `remainingMs / durationMs`. Guarded by `lastClip` diff check to avoid redundant writes.

**State tracking:**
- `_neutralRespawnState` Map with `sweepToken` marking.
- Start timer on `wasActive && !isActive`.
- Clear timer on `!wasActive && isActive`.
- Remove at `00:00`.
- Purge stale non-running states after `NEUTRAL_STATE_PURGE_MS = 15000`.

## PERFORMANCE OPTIMIZATIONS
### Hot-Path Architecture
- Shared snapshot reused by loop subsystems.
- One-pass proximity engine for multiple targets.
- **Adaptive neutral loop**: 0.25s scoreboard / 1s normal / 0.5s near-expiry / 2s idle.
- **Cached DOM traversals**: `map_button` query (5s TTL), `refreshPanels` (2s TTL), minimap inversion (30s TTL).
- **Precomputed panel IDs**: `ringId`/`fillId`/`textId`/`anchorId` stored on state — no regex per render.
- **Per-frame clip guard**: only writes `style.clip` when value changes (`lastClip` diff).
- **Creation-only styling**: Style properties that never change are set only in `CreatePanel()` branches.

### DOM Write Guards
- Timer label text: guarded by `lastText`.
- Ring position: guarded by `lastPosX/lastPosY` threshold.
- Ring opacity: guarded by `lastOpacity`.
- Ring border/background: guarded by `lastTrackBorder/lastTrackBg`.

### Memory Controls
- Reused arrays/objects for snapshot and nearest-target passes.
- `_playerState` pruned on phase/run transitions, preserving active linger entries.
- Reset path clears snapshot buffers, neutral sweep metadata, and perf counters.

### Debug Gating
Production defaults (rejuvnbufftimer.js):
- `DEBUG_MINIMAP_COLLAPSE = false`
- `DEBUG_NEUTRAL_TIMERS = false`
- `DEBUG_PERF = false`
- `DEBUG_NEUTRAL_ALIGN = false`

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
| Neutral loop (scoreboard open) | 0.25s | Responsive while scoreboard held |
| Neutral loop (normal) | 1.0s | Single-pass scan+render |
| Neutral loop (<10s remaining) | 0.5s | Responsive countdown text near expiry |
| Neutral loop (idle, no timers) | 2.0s | Minimal overhead when nothing active |
| map_button cache TTL | 5.0s | Avoid repeated DOM traversal |
| refreshPanels cache TTL | 2.0s | Avoid repeated panel validation |
| Minimap invert cache TTL | 30s | Team side doesn't change mid-match |
| Global time cache | 200ms | Reduce repeated parse of topbar time |

## CONVENTIONS
- Snapshot first: collect once, reuse downstream.
- Keep per-iteration logic branch-light in hot loops.
- Guard all panel access with `?.IsValid?.()`.
- Guard DOM writes on value change.
- Prefer squared distances over `Math.sqrt`.
- Keep try/catch at subsystem boundaries, not deeply nested per item.

## ANTI-PATTERNS
- Repeated `FindChildrenWithClassTraverse("map_button")` from multiple subsystems in the same tick window.
- Recomputing proximity via separate full player scans for each target.
- Unconditional `label.text` and `style.position` writes in frequent render paths.
- Pruning `_playerState` entries that still have active `_lingerState`.
- Leaving debug logs enabled (`$.Msg`) in production builds.
- Using CSS transitions for ring clip animation (unreliable in Panorama without guaranteed layout flush — use per-frame JS writes instead).
- Adding a fade delay to scoreboard-triggered opacity changes — `targetOpacity = 1` must be set on the first detection tick; any delay based on `scoreboardAge` causes opacity=0 on tick 0 and the ring stays invisible.
- Setting `position: absolute` or `left`/`top` in Panorama CSS (invalid — use `position: x y z` format or set inline via JS).

## DEBUG
Launch with `-dev -tools` and use Panorama console (`F7`).

When enabled:
- Neutral logs: `[BT-NEUTRAL] ...`
- Minimap collapse logs: `[BT-MAP] ...`
- Perf logs: `[BT-PERF] ...`

Default production state keeps these logs disabled.

## BUILD
```powershell
# Compile
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"

# Pack
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\passive_items_mod\compiler\vpkeditcli.exe" "buff_timer_virgin_compiled" -o "pak98_dir.vpk" -s --no-progress

# Deploy
Copy-Item "pak98_dir.vpk" "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk" -Force
```

Build notes:
- Compiler prints a non-asset warning for `AGENTS.md` — expected, not an error.
- Wrapper exits non-zero in redirected terminals due to `Console.ReadKey` — assets still compile successfully when output shows `OK: N compiled, 0 failed`.
