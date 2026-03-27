# AGENTS: Buff Timer Virgin (v7.0)

## OVERVIEW
Production-ready Rejuvenator, Bridge Buff, and Jungle Camp Respawn tracker for Deadlock. Core features: claim detection, minimap glows, enemy fog linger, neutral respawn rings with countdown labels, and a mini rejuv card that mirrors the rejuv countdown during neutral override phases or shows buff duration. Runtime is optimized around a shared minimap snapshot pipeline to reduce repeated DOM traversals and allocation churn.

## STRUCTURE
- `panorama/scripts/rejuvnbufftimer.js`: **All logic lives here.** Timers, state machine, shared minimap snapshot, one-pass proximity engine, enemy linger, all three neutral override phases, neutral respawn scan/render, team/inversion detection, and mini rejuv card.
- `panorama/layout/hud.xml`: Timer/claim/minimap overlay panel tree. Loads only `rejuvnbufftimer.js`.
- `panorama/styles/hud_timer.css`: Countdown/timer visuals (BuffTimeClip, RejuvTimeClip, RejuvMiniCard).
- `panorama/styles/buff_claim.css`: Glow, claim box, linger question labels, and neutral timer label styles.
- `panorama/styles/jungle_timer.css`: Neutral camp ring styles (`.neutral-cooldown-ring`, `.neutral-cooldown-ring-fill`, `.neutral-cooldown-timer-detail`). **Do not remove this CSS file** — ring visuals depend on it even though `jungle_timer.js` no longer exists.

> `jungle_timer.js` has been deleted. Its logic is fully merged into `rejuvnbufftimer.js`. The compiled `jungle_timer.vjs_c` is an orphan — it is not loaded by `hud.xml` and can be ignored.

> `RejuvBuff` / `RejuvTimeBuff` panels have been removed from `hud.xml` and `hud_timer.css`. Do not reference `UI.rejuvBuff` or `UI.rejuvBuffTime` — they are gone.

## UI PANEL REFERENCES
All panel refs live in the `UI` object. Boot resolves them once via `FindChildTraverse`. The full expected set:

```
root, hud, minimap, minimapBox, minimapContainer, scoreboardRoot, neutralOverlay
rLab, rLabClip, rNum, rImg, rejuv
buffLab, buffLabClip
rejuvFriendly, rejuvEnemy
glowLeft, glowRight
claimLeft, claimRight, claimIconLeft, claimIconRight
claimRingLeft, claimRingRight, claimTimerLeft, claimTimerRight
spawnBadge       ← NeutralSpawnBadge  (small badge, shown during bot/medium phases)
spawnBadge2      ← NeutralSpawnBadge2 (large badge, shown during card phase)
rejuvMiniCard    ← RejuvMiniCard
rejuvMiniTime    ← RejuvMiniTime
```

**Panel hierarchy for ring overlays (important — do not change the parent chain):**
```
minimap_container  (UI.minimapBox)      ← overlay parent; ring % positions are relative to THIS
  └─ HudMinimapContainer (UI.minimapContainer) ← has XY offset from minimapBox
       └─ hud_minimap (UI.minimap)      ← icon actualxoffset is relative to this
```

`renderNeutralRespawnTimers` creates `NeutralCooldownOverlayLayer` inside `UI.minimapBox`. Ring positions are percentages of `minimapBox`. The `offsetX/Y` in `renderCtx` accounts for the `HudMinimapContainer` and `hud_minimap` offsets. **Do not move the overlay to `minimapContainer` or any other panel** — this breaks the coordinate transform.

When removing a panel from `hud.xml`, also remove it from the `UI` object declaration and from `boot()`. Stale `FindChildTraverse` calls for removed panels return null silently but clutter the code and confuse future agents.

## LOGIC

### Shared Minimap Snapshot Pipeline
`collectMinimapSnapshot(nowMs, forceFresh)` performs one `FindChildrenWithClassTraverse("map_button")` sweep per tick and classifies into reusable arrays:
- `_minimapSnapshot.players`
- `_minimapSnapshot.powerupSpawns`
- `_minimapSnapshot.neutralCamps`

All subsystems (claim, linger, neutral scan) share this snapshot. There is one DOM sweep per tick — not multiple.

**`neutralCamps` must be populated** — do not reset `neutralCamps.length = 0` unconditionally before the loop. The scan branch inside `collectMinimapSnapshot` fills it; if it is zeroed out, `scanNeutralRespawnState` will see an empty array and rings will never appear.

Minimap dimensions use `resolveMinimapReferenceSize(mm)` which returns DPI-aware `{width, height}` with fallback 1512×862. **Do not replace this with `mm.contentwidth || 200`** — that fallback is too small and produces wrong % coordinates.

### Team Detection and Map Inversion
`isAlly(btn)` / `isEnemy(btn)` — classify a single `map_button` by CSS classes (`friend`, `ally`, `team1` / `enemy`, `team2`). Used in `collectMinimapSnapshot` for player classification.

**`client_cone_fov` does NOT reliably identify team.** The class appears on the local player's button but does not change when the player switches team. Do not use it for team detection.

**Map inversion (`updateMinimapInvertCache`, 750ms TTL):**
- Checks `mm.BHasClass("invert_map")` then falls back to `UI.minimapContainer`.
- `_minimapInvertCache` shape: `{ ts, minimap, inverted, teamId }`.
- `themeInfo` returned by this function is passed into `renderNeutralRespawnTimers` → `renderCtx` → `ensureAnchorRoot`, which sets `invert_map`/`theme-inverted`/`theme-standard` CSS classes on the anchor panel. **Do not remove this flow** — without it, rings appear on the wrong side of the map for team 2.

### Neutral Respawn State — CRITICAL: Map not plain object
`_neutralRespawnState` is a **`Map`**. All access must use Map methods:
- Read: `_neutralRespawnState.get(key)`
- Write: `_neutralRespawnState.set(key, st)`
- Delete: `_neutralRespawnState.delete(key)`
- Iterate: `for (const [key, st] of _neutralRespawnState.entries())`
- Clear: `_neutralRespawnState.clear()`
- Size: `_neutralRespawnState.size`

**Never convert this back to a plain object `{}`** — doing so silently breaks `.get/.set/.entries/.delete/.clear` calls and the rings stop working with no error output.

### Neutral Override Phases
Three time-gated phases replace the main rejuv display. All three are called every second from `loop()` and are mutually exclusive at any given game time:

| Function | Flag | Window | Main label shows | Spawn badge |
|---|---|---|---|---|
| `updateNeutralBotPhase` | `_neutralBotOverrideActive` | 1:00–2:00 | Countdown to 2:00 | (none changed) |
| `updateNeutralMediumPhase` | `_neutralMediumOverrideActive` | 5:00–6:00 | Countdown to 6:00 | Medium badge |
| `updateNeutralCardPhase` | `_neutralCardOverrideActive` | 7:00–8:00 | Countdown to 8:00 | Large badge (badge2) |

**While any override is active, the normal `if (!neutralBotActive && !neutralMediumActive && !neutralCardActive)` rejuv countdown block in `loop()` is skipped** — `UI.rLab.text` is NOT updated with the rejuv countdown. The mini rejuv card compensates by computing from `SEQ[idx].d - (now - phaseStart)` directly.

Helper functions owned by the neutral phase system:
- `setSpawnBadgeImage(src)` — sets `UI.spawnBadge` image (NeutralSpawnBadge).
- `setSpawnBadge2Image(src)` — sets `UI.spawnBadge2` image (NeutralSpawnBadge2).
- `exitVaultCardMode(onDone)` — resets badge2 to small, calls `exitNeutralMode`, resets clip color.

### Mini Rejuv Card (`RejuvMiniCard`)
Small panel at `margin-left: 28%` of the main rejuv timer. Two use cases — never both at once:

**1. Neutral override active** (`_neutralBotOverrideActive || _neutralMediumOverrideActive || _neutralCardOverrideActive`):
- `.active` class added → card becomes visible.
- Text = rejuv countdown computed directly: `fmt(Math.max(0, SEQ[safeIdx].d - (now - phaseStart)))`.
- No `.buff-active` class → text color is default `#b0b0b0`.
- Do NOT mirror `UI.rLab.text` — it contains the neutral phase countdown, not the rejuv countdown.

**2. Buff active** (`buffStart > 0`, no neutral override):
- `.active` + `.buff-active` classes added → card visible, text turns `#ffcc00`.
- Text = buff duration countdown: `fmt(Math.max(0, REJUV_DUR - (now - buffStart)))`.
- `startBuff()` sets both classes and writes initial text.
- `endBuff()` removes `.buff-active`; removes `.active` only if no neutral override is currently active (card stays visible and switches back to rejuv countdown seamlessly).

**Deprecated:** `RejuvBuff` (bottom mini card with pop-in/pop-out animation) — removed. Do not re-add.

### Neutral Respawn Rings
`scanNeutralRespawnState(snapshot, nowMs, gameNowSec)` — called every 500ms. Updates `_neutralRespawnState` (Map, keyed by camp identity string).

`renderNeutralRespawnTimers(nowMs, gameNowSec, scoreboardOpen)` — called every 250ms. Reads `_neutralRespawnState` and draws/updates ring panels under `UI.minimapBox`.

Both are called from `loop()` with interval guards using `lastNeutralScanCheck` / `lastNeutralRenderCheck`. The scoreboard-open trigger `scoreboardJustOpened` forces an immediate scan+render when the scoreboard opens. **If these calls are not in `loop()`, the rings never appear regardless of whether the functions are defined.**

**Ring visibility rules (urgency ramp — improves readability when many camps on cooldown simultaneously):**
| Remaining | Opacity |
|---|---|
| > 60s | 0 (hidden) |
| 60s → 30s | Fades 0 → 0.60 |
| 30s → 15s | Ramps 0.60 → 0.85 |
| < 15s | 0.90 (urgent) |
| Scoreboard open | 1.0 (instant, set on first detection tick — no delay) |

**Ring label position:** Centered inside the ring (not below it). Keeps text bound to its camp at high density. Uses `textPosY = anchorPctY + (iconPctH - textPctH) / 2`. Text panel is 48px wide (overflows ring, horizontally centered) and 14px tall.

**Ring arc:** 4px border on `.neutral-cooldown-ring-fill`. Thicker arc improves visibility in clusters.

**Clip animation:** per-frame `ringFill.style.clip = "radial(50% 50%, 0deg, Xdeg)"`. Guarded by `lastClip` diff. Do not use CSS transitions for this — use per-frame JS writes.

**State tracking (Map-based):**
- `_neutralRespawnState.get(key)` — created by `createState(camp, now, token)`.
- Start timer on `wasActive && !isActive`.
- Clear timer on `!wasActive && isActive`.
- Remove at `00:00`.
- Purge stale states after `NEUTRAL_STATE_PURGE_MS = 15000` via `purgeStaleNeutralStates`.

**Ring panel hierarchy:**
```
minimap_container (UI.minimapBox)
  └─ NeutralCooldownOverlayLayer  (created by ensureNeutralOverlay — child of minimapBox)
       └─ NeutralCooldownRing_*_anchor  (.neutral-cooldown-anchor — full 100%×100% panel)
            ├─ NeutralCooldownRing_*   (.neutral-cooldown-ring, 24px, % positioned)
            │    └─ NeutralCooldownRing_*_fill  (.neutral-cooldown-ring-fill)
            └─ NeutralCooldownRing_*_text  (.neutral-cooldown-timer-detail)
```

**Ring size: `NEUTRAL_RING_SIZE_PX = 24`** — matches the game's `.map_button.neutral { width: 24px }`. Do not change to 18 or any other value; it will misalign rings with their camp icons.

### Claim Detection
Proximity-based:
1. Pretrack near known spawn points before bridge spawn.
2. Multi-target nearest-distance pass via `computeNearestForTargets(...)`.
3. Dead-player grace handling (`DEATH_GRACE_MS = 2000`).
4. Final classification: `CLAIM_RADIUS_SQ = 64`, ally-closer preference.

### Enemy Linger
`checkEnemyLinger(nowMs, snapshot)` consumes snapshot players.
- `wasActive && !isActive` → show linger.
- `!wasActive && isActive` → cancel linger.
- dead → cancel immediately.

## LOOP WIRING CHECKLIST
When adding a new subsystem, ALL three steps are required or it silently does nothing:
1. Define the function(s).
2. Add any required UI refs to the `UI` object and resolve them in `boot()`.
3. **Call the function(s) from `loop()`**, with interval guards if needed (`lastXCheck`, `X_INTERVAL_MS`).

Missing step 3 is the most common failure mode — functions exist, panels exist, nothing happens.

## PERFORMANCE OPTIMIZATIONS
- One snapshot sweep per tick, shared by all subsystems.
- One-pass proximity engine (`computeNearestForTargets`).
- Adaptive tick: `tick` set by rejuv logic (0.1s near spawn, 1.0s idle), neutral scan/render use their own independent interval guards.
- **Cached DOM traversals:** `map_button` query (800ms TTL), minimap inversion (750ms TTL).
- **`createState` pre-allocates all guard fields** (`lastClip`, `lastOpacity`, `lastPosX/Y`, etc.) — do not add new per-render guard fields without also initializing them in `createState`.
- **Per-frame clip guard:** write `style.clip` only when value changes (`lastClip` diff).

### DOM Write Guards
| What | Guard var |
|---|---|
| Rejuv label text | `_lastRejuvText` |
| Bridge buff label text | `_lastBuffText` |
| Buff/mini card text | `_lastRejuvBuffText` |
| Claim timer left/right | `_lastClaimTimerL/R` |
| Rejuv clip | `_lastRejuvClip` |
| Rejuv clip color | `_lastRejuvClipColor` |
| Ring position | `lastPosX / lastPosY` threshold (0.05%) |
| Ring opacity | `lastOpacity` |
| Ring track style | `lastTrackBorder / lastTrackBg` |
| Ring text | `lastText / lastTextColor / lastTextOpacity` |
| Ring text position | `lastTextPosX / lastTextPosY` threshold (0.05%) |
| Icon opacity | `lastIconOpacity` (via `setNeutralIconOpacity`) |

## POLLING INTERVALS
| State | Interval | Purpose |
|-------|----------|---------|
| Active countdown loop | 0.1s | High-fidelity countdown near spawn |
| Idle countdown loop | 1.0s | Lower CPU when less time-critical |
| Not running | 30s | Minimal hideout overhead |
| Linger checks | 300ms | Balanced visibility transition accuracy |
| Powerup monitor | 300ms | Balanced claim detection latency |
| Pretrack | 1000ms | Spawn-adjacent history capture |
| Snapshot refresh (hot) | 250ms | During active claim/linger |
| Snapshot refresh (normal) | 500ms | Shared map data reuse |
| Snapshot refresh (idle) | 750ms | Reduced idle scan cost |
| Neutral state scan | 500ms | Camp transition detection |
| Neutral ring render | 250ms | Smooth visible countdown |
| Minimap invert cache TTL | 750ms | Per-team orientation |
| Global time cache | 200ms | Reduce repeated parse of topbar time |

## CONVENTIONS
- Snapshot first: collect once, reuse downstream.
- Keep per-iteration logic branch-light in hot loops.
- Guard all panel access with `?.IsValid?.()`.
- Guard DOM writes on value change.
- Prefer squared distances over `Math.sqrt`.
- Keep try/catch at subsystem boundaries, not deeply nested per item.
- Use `fmt()` for rejuv/buff timer text. Use `fmtSeconds()` for neutral ring countdown labels.

## ANTI-PATTERNS

### Neutral state type
- **Converting `_neutralRespawnState` back to a plain object.** All scan/render/clear functions use Map methods (`.get/.set/.entries/.delete/.clear`). Reverting to `{}` breaks everything silently.
- **Using `Object.keys(_neutralRespawnState)` or `for...in`.** Always use `for (const [key, st] of _neutralRespawnState.entries())`.

### Neutral ring overlay parent
- **Creating the overlay under `UI.minimapContainer` instead of `UI.minimapBox`.** Ring % coordinates are relative to `minimapBox`. Using `minimapContainer` shifts all rings by its XY offset within `minimapBox`, misaligning them with camp icons.
- **Moving `ensureNeutralOverlay` to use any other parent.** The entire coordinate transform in `renderNeutralTimer` (using `offsetX/Y` from `renderCtx`) depends on the overlay living inside `minimapBox`.

### Neutral ring coordinate system
- **Using absolute pixel positions instead of percentage positions.** `renderNeutralTimer` places rings at `ringPosX% ringPosY% 0px`. Switching to `px` positioning breaks DPI scaling (rings double-position at 4K).
- **Computing `mmW/mmH` from `mm.contentwidth`** — use `resolveMinimapReferenceSize(UI.minimapBox)` instead. The fallback 1512×862 matches the game's reference size; `contentwidth` can return 0 or small values at boot.
- **Changing `NEUTRAL_RING_SIZE_PX` from 24** — this constant must match the game's `.map_button.neutral` CSS width. Do not set it to 18.

### Loop wiring
- **Defining functions but not calling them from `loop()`** — the single most common breakage. Neutral scan, render, mini card, and all three phase updaters must all be called from `loop()` with appropriate interval guards. If a feature does nothing in-game, check `loop()` first.
- **Removing the `scoreboardJustOpened` trigger** from the neutral scan/render guards. Without it, rings won't appear immediately when the scoreboard opens.

### Mini card text
- **Mirroring `UI.rLab.text` into the mini card during neutral override.** `UI.rLab` is not updated while any neutral override is active (the entire rejuv countdown block is skipped). Reading `UI.rLab.text` gives stale or neutral-phase text. Always compute from `SEQ[idx].d - (now - phaseStart)` directly.

### Removed panels
- **Keeping `UI.rejuvBuff` / `UI.rejuvBuffTime` references** after removing those panels from `hud.xml`. Stale refs in the UI object and `boot()` silently return null. Remove them from both the `UI` object declaration and `boot()` when the XML panel is removed.
- **Re-adding `RejuvBuff` to XML.** The bottom mini buff card has been replaced by `RejuvMiniCard`. Do not restore it.
- **Re-adding `jungle_timer.js`** as a separate script. Its logic is now in `rejuvnbufftimer.js`. Adding it back creates duplicate DOM sweeps and duplicate ring panels.

### CSS
- **Removing `jungle_timer.css`/`jungle_timer.vcss_c` includes from `hud.xml`.** The ring classes (`.neutral-cooldown-ring`, `.neutral-cooldown-ring-fill`, `.neutral-cooldown-timer-detail`, `.neutral-cooldown-anchor`) are defined there. Without it, rings render as invisible unstyled panels.
- **Using CSS transitions for ring clip animation.** Panorama `radial()` clip transitions are unreliable without a guaranteed layout flush. Use per-frame JS `style.clip` writes with a diff guard instead.
- **Adding a fade delay for scoreboard-triggered opacity.** `targetOpacity = 1` must be set on the first detection tick. Any delay causes the ring to stay invisible on tick 0.
- **Moving ring label back to below-icon position** (`textPosY = anchorPctY + iconPctH + gapPct`). Labels from vertically-adjacent camps will overlap at high camp density. Keep the centered-inside-ring formula: `textPosY = anchorPctY + (iconPctH - textPctH) * 0.5`.

### Other
- Repeated `FindChildrenWithClassTraverse("map_button")` calls across subsystems in the same tick.
- Unconditional `label.text` or `style.position` writes in hot loops.
- Pruning `_playerState` entries that still have active `_lingerState`.
- Leaving `$.Msg` debug logs enabled in production.
- `position: absolute` / `left:` / `top:` in Panorama CSS — use `position: x y z` or set inline via JS.
- `box-shadow` for glows — use `pre-transform-scale2d` panels instead.
- Reading `Image.src` — write-only in Panorama.
- `scale3d` — use `pre-transform-scale2d` only.
- `clip-path` — use `style.clip` instead.

## DEBUG
Launch with `-dev -tools` and use Panorama console (`F7`).

Log prefixes:
- `[BT-NEUTRAL]` — neutral respawn ring logs
- `[BT-MAP]` — minimap collapse logs
- `[BT-PERF]` — performance telemetry
- `[BT-ALIGN]` — neutral ring alignment diagnostics

All disabled by default (`DEBUG_NEUTRAL_TIMERS`, `DEBUG_PERF`, `DEBUG_NEUTRAL_ALIGN`, `DEBUG_MINIMAP_COLLAPSE` all `false`).

## BUILD

### Normal compile (source only, no pack)
```powershell
cd "F:\Users\Shiv\Desktop\Deadlock-mods-collection"
& "sr2compiler\New folder.exe" "buff_timer_virgin"
# Output: buff_timer_virgin_compiled\
```

### Terser build + pack + deploy (recommended for release)
```powershell
cd "F:\Users\Shiv\Desktop\Deadlock-mods-collection"
powershell -ExecutionPolicy Bypass -File "build_buff_timer_virgin_terser.ps1"
powershell -ExecutionPolicy Bypass -File "build_buff_timer_virgin_terser_pack.ps1"
```
Steps performed by these scripts:
1. Copy `buff_timer_virgin` → `buff_timer_virgin_terser`
2. Minify `rejuvnbufftimer.js` in-place with `npx terser -c -m keep_fnames=true,keep_classnames=true`
3. Compile `buff_timer_virgin_terser` → `buff_timer_virgin_terser_compiled\`
4. Pack compiled output → `pak98_dir.vpk` (≈106 KB)
5. Deploy → `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk`

### Manual pack (from already-compiled normal build)
```powershell
cd "F:\Users\Shiv\Desktop\Deadlock-mods-collection"
& "passive_items_mod\compiler\vpkeditcli.exe" "buff_timer_virgin_compiled" -o "pak98_dir.vpk" -s --no-progress
Copy-Item "pak98_dir.vpk" "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk" -Force
```

Build notes:
- Compiler prints a non-asset warning for `AGENTS.md` — expected, not an error.
- Compiler wrapper exits non-zero in redirected terminals due to `Console.ReadKey` — assets still compile when output shows `OK: N compiled, 0 failed`.
- Terser minified script: ~35.7 KB. VPK output: ~106 KB.
