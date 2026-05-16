# AGENTS: Buff Timer Virgin (v8.0)

## GENERATED STAGING COPY
`buff_timer_virgin_terser/` is regenerated from `buff_timer_virgin/` by the
repo-root build scripts. Do not make source fixes here unless the user is
explicitly inspecting generated/minified output. Patch `../buff_timer_virgin/`
and rebuild with:

```powershell
powershell -ExecutionPolicy Bypass -File build_buff_timer_virgin.ps1
```

## OVERVIEW
Production-ready Rejuvenator, Bridge Buff, and powerup claim tracker for Deadlock. Core features: claim detection, minimap glows, enemy fog linger, timer-to-team-chat ping buttons, neutral spawn override countdowns with badges, and a mini rejuv card that mirrors the rejuv countdown during neutral override phases or shows buff duration. Neutral minimap respawn rings were removed for fairness/moderation compliance. Runtime is optimized around a shared minimap snapshot pipeline to reduce repeated DOM traversals and allocation churn.

## STRUCTURE
- `panorama/scripts/rejuvnbufftimer.js`: **All logic lives here.** Timers, state machine, shared minimap snapshot, one-pass proximity engine, enemy linger, all three neutral override phases, team/inversion detection, and mini rejuv card.
- `panorama/layout/hud.xml`: Timer/claim/minimap overlay panel tree. Loads only `rejuvnbufftimer.js`.
- `panorama/styles/hud_timer.css`: Countdown/timer visuals (BuffTimeClip, RejuvTimeClip, RejuvMiniCard).
- `panorama/styles/buff_claim.css`: Glow, claim box, linger question labels, and neutral timer label styles.

> `jungle_timer.js` has been deleted. Its logic was merged into `rejuvnbufftimer.js` but the neutral respawn ring subsystem has been removed for fairness compliance. The compiled `jungle_timer.vjs_c` is an orphan — it is not loaded by `hud.xml` and can be ignored.

> `jungle_timer.css` has been deleted. The `jungle_timer.vcss_c` include has been removed from `hud.xml`.

> `RejuvBuff` / `RejuvTimeBuff` panels have been removed from `hud.xml` and `hud_timer.css`. Do not reference `UI.rejuvBuff` or `UI.rejuvBuffTime` — they are gone.

## UI PANEL REFERENCES
All panel refs live in the `UI` object. Boot resolves them once via `FindChildTraverse`. The full expected set:

```
root, hud, topBar, chat, scoreboardPanel, minimap, minimapBox, minimapContainer, scoreboardRoot
rLab, rLabClip, rNum, rImg, rejuv
buffLab, buffLabClip
chatInput, chatTargetLabel
rejuvFriendly, rejuvEnemy
glowLeft, glowRight
claimLeft, claimRight, claimIconLeft, claimIconRight
claimRingLeft, claimRingRight, claimTimerLeft, claimTimerRight
spawnBadge       ← NeutralSpawnBadge  (small badge, shown during bot/medium phases)
spawnBadge2      ← NeutralSpawnBadge2 (large badge, shown during card phase)
rejuvMiniCard    ← RejuvMiniCard
rejuvMiniTime    ← RejuvMiniTime
```

When removing a panel from `hud.xml`, also remove it from the `UI` object declaration and from `boot()`. Stale `FindChildTraverse` calls for removed panels return null silently but clutter the code and confuse future agents.

`RejuvPingButton` and `BuffPingButton` are invisible hittest buttons in
`hud.xml`. They call `handleRejuvPingActivate()` / `handleBuffPingActivate()`
and rely on global/context handler registration during `boot()`.

## LOGIC

### Shared Minimap Snapshot Pipeline
`collectMinimapSnapshot(nowMs, forceFresh)` performs one `FindChildrenWithClassTraverse("map_button")` sweep per tick and classifies into reusable arrays:
- `_minimapSnapshot.players`
- `_minimapSnapshot.powerupSpawns`

All subsystems (claim, linger) share this snapshot. There is one DOM sweep per tick — not multiple.

Minimap dimensions use `resolveMinimapReferenceSize(mm)` which returns DPI-aware `{width, height}` with fallback 1512×862. **Do not replace this with `mm.contentwidth || 200`** — that fallback is too small and produces wrong % coordinates.

### Team Detection and Map Inversion
`isAlly(btn)` / `isEnemy(btn)` — classify a single `map_button` by CSS classes (`friend`, `ally`, `team1` / `enemy`, `team2`). Used in `collectMinimapSnapshot` for player classification.

**`client_cone_fov` does NOT reliably identify team.** The class appears on the local player's button but does not change when the player switches team. Do not use it for team detection.

### Neutral Override Phases
One unified helper, `updateNeutralPhase()`, handles the time-gated neutral override display. It is called every second from `loop()` and switches behavior based on the current game time:

| Function | Flag | Window | Main label shows | Spawn badge |
|---|---|---|---|---|
| `updateNeutralPhase()` | `_neutralBotOverrideActive` | 1:00–2:00 | Countdown to 2:00 | (none changed) |
| `updateNeutralPhase()` | `_neutralMediumOverrideActive` | 5:00–6:00 | Countdown to 6:00 | Medium badge |
| `updateNeutralPhase()` | `_neutralCardOverrideActive` | 7:00–8:00 | Countdown to 8:00 | Large badge (badge2) |

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

### Timer Ping / Team Chat
`handleRejuvPingActivate()` and `handleBuffPingActivate()` build short timer
messages such as `Rejuv 1:23` or `Bridge 0:42`, open team chat with
`say_chat_team`, verify the target label is not all-chat, submit via
`CitadelChatInputSubmitted`, and then blur/drop focus. Keep
`CHAT_RETRY_DELAYS`, `CHAT_SEND_COOLDOWN_MS`, `chatInput`, and
`chatTargetLabel` together when editing this path.

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
- Adaptive tick: `tick` set by rejuv logic (0.1s near spawn, 1.0s idle).
- **Cached DOM traversals:** `map_button` query (800ms TTL), minimap inversion (750ms TTL).

### DOM Write Guards
| What | Guard var |
|---|---|
| Rejuv label text | `_lastRejuvText` |
| Bridge buff label text | `_lastBuffText` |
| Buff/mini card text | `_lastRejuvBuffText` |
| Claim timer left/right | `_lastClaimTimerL/R` |
| Rejuv clip | `_lastRejuvClip` |
| Rejuv clip color | `_lastRejuvClipColor` |

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
| Minimap invert cache TTL | 750ms | Per-team orientation |
| Global time cache | 200ms | Reduce repeated parse of topbar time |

## CONVENTIONS
- Snapshot first: collect once, reuse downstream.
- Keep per-iteration logic branch-light in hot loops.
- Guard all panel access with `?.IsValid?.()`.
- Guard DOM writes on value change.
- Prefer squared distances over `Math.sqrt`.
- Keep try/catch at subsystem boundaries, not deeply nested per item.
- Use `fmt()` for rejuv/buff timer text.

## ANTI-PATTERNS

### Loop wiring
- **Defining functions but not calling them from `loop()`** — the single most common breakage. Mini card and all three phase updaters must all be called from `loop()` with appropriate interval guards. If a feature does nothing in-game, check `loop()` first.

### Mini card text
- **Mirroring `UI.rLab.text` into the mini card during neutral override.** `UI.rLab` is not updated while any neutral override is active (the entire rejuv countdown block is skipped). Reading `UI.rLab.text` gives stale or neutral-phase text. Always compute from `SEQ[idx].d - (now - phaseStart)` directly.

### Removed panels
- **Keeping `UI.rejuvBuff` / `UI.rejuvBuffTime` references** after removing those panels from `hud.xml`. Stale refs in the UI object and `boot()` silently return null. Remove them from both the `UI` object declaration and `boot()` when the XML panel is removed.
- **Re-adding `RejuvBuff` to XML.** The bottom mini buff card has been replaced by `RejuvMiniCard`. Do not restore it.

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
- `[BT-PERF]` — performance telemetry

## BUILD

### Normal compile (source only, no pack)
```powershell
$repo = "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "$repo\sr2compiler\New folder.exe" "$repo\buff_timer_virgin_terser"
# Output: buff_timer_virgin_terser_compiled\
```

### Release build + pack + deploy (recommended)
```powershell
powershell -ExecutionPolicy Bypass -File "build_buff_timer_virgin.ps1"
```
Steps performed by this script:
1. Copy `buff_timer_virgin` → `buff_timer_virgin_terser`
2. Minify `rejuvnbufftimer.js` with `npx terser` using `passes=3`, `keep_fnames=true`, and `keep_classnames=true`
3. Compile `buff_timer_virgin_terser` → `buff_timer_virgin_terser_compiled\`
4. Copy `buff_timer_virgin_terser_compiled\` back to `buff_timer_virgin_compiled\`
5. Pack `buff_timer_virgin_compiled\` → `pak98_dir.vpk`
6. Deploy → `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk`

`build_buff_timer_virgin_terser.ps1` is a legacy terser-only helper with a stale
hardcoded path. Prefer `build_buff_timer_virgin.ps1` unless the helper is fixed.
`_tmp_pack_buff_timer_virgin.ps1` is also stale/hardcoded and packs the
unminified normal build; do not use it for the release path.

### Manual pack (from already-compiled staging build)
```powershell
$repo = "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "$repo\passive_items_mod\compiler\vpkeditcli.exe" "$repo\buff_timer_virgin_terser_compiled" -o "$repo\pak98_dir.vpk" -s --no-progress
Copy-Item "$repo\pak98_dir.vpk" "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk" -Force
```

Build notes:
- Compiler prints a non-asset warning for `AGENTS.md` — expected, not an error.
- Compiler wrapper exits non-zero in redirected terminals due to `Console.ReadKey` — assets still compile when output shows `OK: N compiled, 0 failed`.
- Re-check minified script and VPK sizes after each build; older size notes are
  not stable enough to use as validation.
