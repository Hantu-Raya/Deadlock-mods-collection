# buff_timer_virgin — Agent Guide

## What the mod does

`buff_timer_virgin` ships as `pak98_dir.vpk`. It overrides Deadlock's stock `hud.xml` and adds client-side timers and minimap hints. It only reads stock HUD panels and adds no network authority.

| Feature | Behaviour | Source of truth |
| --- | --- | --- |
| Rejuvenator timer | Counts down the phase sequence 10:00 → 6:50 → 5:50 → 4:50 (`SEQ` d = 600/410/350/290 s; phase 3 repeats), shows `Spawn` when due, and advances when the TopBar gains a `RejuvCount_N` class. `doScan` polls every 250 ms while waiting for a spawn and every 3 s otherwise. | Game clock plus `RejuvenatorCharges` classes |
| Rejuv buff mini-card | 180 s (`REJUV_DUR`) countdown after a detected claim. | Game time at detection |
| Bridge Buff timer | 300 s repeating countdown with a clip/colour progress bar. | `gameTime % 300` |
| Neutral override | Replaces the Rejuv pill at 1:00–2:00 (bot), 4:00–5:00 (medium) and 7:00–8:00 (card/vault). The mini-card continues the Rejuv countdown. | `NEUTRAL_PHASES`, `NEUTRAL_ACTIVE` |
| Powerup claims | Near the Bridge respawn, it tracks ally/enemy distance to both powerup spawns, then shows a minimap glow and a 160 s claim box (ally cyan, enemy red). | Minimap `map_button` snapshot |
| Enemy linger | When an enemy marker leaves vision, shows a `?` for 5 s at its last position. | Minimap snapshot |
| Rift card | First Rift estimate is 12:00 ±1m, and each unobserved interval adds ±1m. `capture_point.koth_warning` switches to the exact 20 s countdown. | Schedule plus warning class |
| Urn card | 10:00, then every 5:00. Every spawn second reads `0:00`, and the final 60 s use an ice-blue pulse. | Schedule |
| Team-chat buttons | Rejuv and Bridge pills post their timers to team chat. The Rift and Urn cards are display-only; their chat actions were removed until they are ready. | `TeamChatIntent` |

Neutral minimap respawn rings were removed for fairness. Do not restore them. Do not add `jungle_timer.js`, `jungle_timer.css`, `RejuvBuff` or `RejuvTimeBuff` back.

## Files

- `panorama/layout/hud.xml` — stock HUD copy and import seam. The `<!-- MOD: -->` blocks load `rejuvnbufftimer.vjs_c`, `hud_timer.vcss_c` and `buff_claim.vcss_c`, and declare every custom panel ID.
- `panorama/scripts/rejuvnbufftimer.js` — the complete runtime as one strict IIFE with no module graph.
- `panorama/styles/hud_timer.css` — styles for the Rejuv, Bridge, mini-card, neutral, Rift, Urn and ping-button UI.
- `panorama/styles/buff_claim.css` — minimap glows and their round `MinimapGlowClip`, claim boxes/rings/timers and linger labels.
- `scripts/validate-runtime-engine.js`, `scripts/validate-team-chat-intent.js` — Node VM validators.
- `../build_buff_timer_virgin.ps1` — authoritative release wrapper.

Generated output that you must not edit: `buff_timer_virgin_compiled/`, `buff_timer_virgin_closure/`, `buff_timer_virgin_closure_compiled/` and `pak98_dir.vpk`. pak98 conflicts with other mods that use the same slot.

## Runtime architecture

- `boot()` climbs to the HUD root and caches panels through `PANEL_IDS` → `UI`. It fills `SIDES[0|1]` with glow/claim panels and publishes the XML `onactivate` handlers on `globalThis` and the context panel. Then it calls `reset(1)` and `startGeneration()`. Missing core labels retry boot after 0.5 s. `resolveRejuvChargePanels` resolves `RejuvenatorFriendly`/`RejuvenatorEnemy` lazily, at most every 5 s. The first scan after rebinding only records `lastFound`, so an existing charge is not counted as a new claim.
- `startGeneration()` is the only way to start a loop. It bumps `_generation` and starts exactly one `loop(gen)` and one `watchdogTick(gen)`. `reset()` cancels the loop handle, the watchdog handle and any in-flight chat intent. The boot, hideout and backward-clock paths all use `reset(1)` followed by `startGeneration()`. The watchdog logs only through `dbgPing` and restarts boot when the loop misses its deadline by 15 s.
- `loop(gen)` is the only main schedule chain.
  - When the gate starts a run, it continues straight into the active lanes. The 30 s gate delay applies only while the run is still inactive, for example in the hideout.
  - During a match, each tick runs three lanes: `runMinimapLane` (shared snapshot), `runTimerLane` (Rejuv, buff, Bridge, mini-card, claims, `doScan`, objectives), then `runMaintenanceLane` (powerup rescans, linger, pretrack, monitor, prune).
  - Per-task cadence uses `isDue(task, nowMs, interval)` with `LAST_TICK`.
  - The next delay is `min(tick, minimapInterval, 500 ms)`; it is 250 ms while the Rift is hot and 100 ms (`TICK_FAST`) near a Rejuv spawn or during neutral overrides.
- The game clock comes from `gTime()`, which parses TopBar `.GameTime` and caches every valid value, including `0:00`, for 200 ms. It returns `-1` when no valid clock is readable.
  - An invalid clock is never treated as a rewind. While running, the loop skips its lanes and reschedules normally. While inactive, it retries after 1 s (`LOOP_INVALID_RETRY_MS`) and does not start a run.
  - A valid clock that jumps backwards, or reads 2 s or less after passing 30 s, triggers `reset(1)` and `startGeneration()`.
  - Below 10 s, a one-shot cleanup clears minimap state.
- `collectMinimapSnapshot()` classifies cached `map_button` panels into players, powerup spawns and the Rift warning.
  - Classification exits early in the order player → `powerup_spawn` → `capture_point`/`koth_warning`. The list comes from the `map_button` query, so the loop does not re-check that class. A panel that throws skips only its own marker.
  - The snapshot reuses its arrays and entry objects. The button query is cached for 800 ms.
  - Snapshot cadence is 250 ms (hot claim work), 500 ms (lingers active) or 750 ms (idle).
  - Claim, linger, pretrack, monitor and objective code consume this one snapshot; do not add another traversal.
- Powerup claims:
  1. Ten seconds before the Bridge respawn, pretrack accumulates the minimum squared ally/enemy distance to each known spawn.
  2. After the respawn, `scanPowerups` refreshes the spawns and starts `monitorPowerups`. A spawn's side comes from its x position (`xPct < 50`), then `invert_map`, never from its list index. If only one spawn is active, the other side keeps its last known position.
  3. When a spawn goes inactive, the nearest team within `CLAIM_RADIUS_SQ = 64` (in minimap percent²) claims it. Ties go to the ally. If no ally is close, the claim is attributed to the enemy.
  4. A dead player's `deadTs` is set only on the alive-to-dead transition. Stationary corpses stop counting after `DEATH_GRACE_MS`.
- Linger: `checkEnemyLinger` sees an enemy marker change from active to inactive and creates `LingerQ_<id>` under `HudMinimapContainer`. It saves the stock marker's hittest, opacity, input and focus state, then restores all of it on removal, death, reappearance, reset or any setup exception.
  - `computeLingerLabelPosition` places the marker inside `hud_minimap` by summing `actualxoffset`/`actualyoffset` along its `GetParent()` chain, mirrors it there for `invert_map` (that box is what gets flipped), then adds the `hud_minimap` offset inside `HudMinimapContainer`. Since 2026-09-29 that offset is the 30px gap between the 420px container and the 360px map. A broken chain falls back to the marker's own offset and the minimap's `actualxoffset`. Without live layout sizes, the marker's minimap fraction maps straight onto the container. The label takes the marker's width/height (container percent) and a font of 0.9 × marker height in layout pixels (via `actualuiscale_y`).
  - `showLinger` gets the minimap through `findMinimap()`. A quoted `UI["minimap"]` read here was undefined in the Closure build and caused the 30px offset seen in game on 2026-09-30.
- Rift:
  - `observeRiftMarker` accepts a `koth_warning` edge only once per interval and sets `_riftObservedSpawn = now + 20`.
  - `computeRiftState` returns text, sub, `inWindow`, `warning` and `confirmed`.
- Team chat:
  1. `TeamChatIntent.send` sanitises the message, applies a 300 ms cooldown and allows one in-flight intent at a time. The intent has its own token and expires after 2 s.
  2. It dispatches `say_chat_team`, then retries through `CHAT_RETRY_DELAYS` until `ChatInput` and a non-ALL `ChatTargetLabel` read ready twice in a row.
  3. `submitWithMinimalFocus` checks the token, the generation, the input and the team target again immediately before submitting. It refuses to overwrite a non-empty user draft. On every exit path it clears only the text it wrote and releases focus.

## Invariants

- Team signals are `friend`/`ally`/`team1` → 1 and `enemy`/`team2` → 2. `client_cone_fov` is not a team signal.
- The cached `hud_minimap` panel's `invert_map` class is the only authority for orientation. It drives powerup sides and linger inversion. Do not fall back to `Players`, `Game` or a guessed default.
- A plain `capture_point` is present while idle. Only `.capture_point.koth_warning` means a Rift warning.
- Reserve `rift-confirmed` for an accepted warning at or before its observed spawn. A reappearing stale marker must not reactivate it. Keep estimated states muted, and limit the confirmed pulse to three stock-style cyan pulses.
- Rift uncertainty compounds by ±1m per unobserved interval. Do not replace it with fixed absolute anchors.
- During a neutral override, compute the mini-card Rejuv countdown from phase state. Do not mirror the overridden main label.
- Claim overlays stay in `ClaimOverlayRoot`, outside `minimap_persp`, so the scoreboard does not hide them. Linger labels stay under `HudMinimapContainer` because `HudMinimap` does not reliably accept custom children.
- Timer pills, cards and ping buttons stay inside `TimerOverlayFrame`, a bottom-anchored 440×440 box in `minimap_persp`. Their percentage positions assume that box. Stock `minimap_persp` has been 440×520 since the 2026-09-29 update.
- Side glows stay inside `MinimapGlowClip`, a round 400px clip matching `minimap_frame`. Stock `minimap_container` has been a square clip with no radius since the 2026-09-29 update, so glows placed directly in `HudMinimapContainer` spill past the frame.
- Minimap geometry is DPI-aware. When it is missing, use the live container extent, not desktop-sized constants.
- Reject all-chat targets. Chat must never gain authority beyond local UI.

## Coding conventions

- Use two-space indentation, `UPPER_SNAKE_CASE` constants, `camelCase` state and functions, and `_prefixed` caches. Keep the strict IIFE.
- Cache panels at boot or first discovery, and validate them with `?.IsValid?.()`/`panelValid()` before use. Wrap engine calls in narrow `try/catch`.
- Every recurring write goes through `WRITE_CACHE`: `writeText`, `writePanelStyle`, `setObjectiveCardClass` or `setMiniCardState`. Do not reassign unchanged text, classes, images or styles.
- In recurring work, reuse arrays and objects, compare squared distances, and avoid new full-tree traversals.
- Every `$.Schedule` handle that can outlive state must be cancellable or generation-checked.
- Mutations of stock panels are transactional: capture, apply, then roll back through the normal removal path.
- Engine-owned properties (`"hittest"`, `"hittestchildren"`, `"BAcceptsInput"`, `btn["id"]`, …) use quoted bracket access so Closure ADVANCED does not rename them. New `onactivate` handlers need four synchronised updates: `globalThis` plus context-panel export in `boot()`, an extern line, and a required fragment in the build wrapper.
- Script-owned caches (`UI.*`, `State`-style objects) are the opposite: always dotted, never quoted. Closure renames dotted names, so mixing `UI.x` and `UI["x"]` reads `undefined` only in the shipped build, where the unminified validators cannot see it. `validate-runtime-engine.js` rejects any `UI["…"]` access.
- The XML IDs, `PANEL_IDS`, CSS selectors, Closure externs and validator mocks are one contract. Change them together.
- Panorama CSS is not browser CSS. Use `visibility: collapse`, `overflow: noclip`, `pre-transform-scale2d` and `style.clip`. Animate opacity only; do not use `box-shadow` or `clip-path`.
- Production must not log. Debug output goes through `dbgPing` behind `DEBUG_PING_TIMER = false`. Closure ADVANCED checks call arity, so optional parameters need a JSDoc `{type=}` annotation. The build must finish with 0 Closure warnings.

## Commands

Run from the repository root:

```powershell
node buff_timer_virgin/scripts/validate-runtime-engine.js
node buff_timer_virgin/scripts/validate-team-chat-intent.js
powershell -ExecutionPolicy Bypass -File build_buff_timer_virgin.ps1              # build + deploy
powershell -ExecutionPolicy Bypass -File build_buff_timer_virgin.ps1 -SkipDeploy  # stop after VPK assertions
```

The wrapper runs these steps:

1. Run both validators.
2. Stage `panorama/` in `buff_timer_virgin_closure/` and strip the `// TEST_EXPORTS_BEGIN` … `// TEST_EXPORTS_END` block. The markers are required, and the build fails if they are missing.
3. Run `npx --yes google-closure-compiler` in ADVANCED mode with generated externs, and assert the handler names and key IDs survive.
4. Compile the four assets with `sr2compiler/New folder.exe`.
5. Pack pak98 with `vpkeditcli.exe`, then assert that the required assets are present and the validator scripts are not.
6. Deploy to `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk`, unless `-SkipDeploy` is passed.

The compiler may exit nonzero after producing output. The wrapper's required-output check decides success. There is no lint step and no package runner.

## Testing

- Both validators use a fake scheduler that runs callbacks in due-time order, cancels for real and advances `Date.now`. Lifecycle tests run real timed sequences instead of calling callbacks by hand.
- `validate-runtime-engine.js` covers:
  - Rift uncertainty and warning edges, and that the Rift and Urn cards have no chat actions.
  - Urn timing and every spawn boundary.
  - Hideout card visibility and adaptive loop delay.
  - Boot reaching an active tick without the 30 s gate.
  - Exactly one watchdog per generation after a reset.
  - Invalid-clock tolerance and caching of a valid `0:00`.
  - Low-time cleanup.
  - `doScan` detecting a claim within 250 ms and lazy rebinding of charge panels.
  - Snapshot classification and per-marker failure isolation.
  - Powerup side mapping for one or two spawns, including an inverted map.
  - Corpse grace despite linger checks.
  - Glow side inversion.
  - Linger positioning, inversion, clamping, restore and rollback.
- `validate-team-chat-intent.js` covers sanitising, team-target gating, cooldown, the single in-flight guard and its expiry, a target change before submit, missing-panel retries, chat-tree races and focus release. Draft preservation has no test yet.
- Validators exercise unminified source in VM mocks only. For any deployable JS, XML or CSS change:
  1. Run both validators.
  2. Run the wrapper.
  3. Confirm the Closure, compile, pack and deploy steps.
  4. Restart Deadlock and smoke-test the changed path in a match or sandbox, including timer transitions, minimap orientation, scoreboard visibility, chat focus and panel restoration.
