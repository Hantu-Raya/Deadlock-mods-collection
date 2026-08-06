# Repository Guidelines

## Project Overview

`buff_timer_virgin` is a Deadlock Panorama HUD override for Rejuvenator and Bridge Buff timing. It adds claim detection, minimap glows, short enemy-fog linger markers, team-chat timer buttons, neutral-phase overrides, and Rift/Urn schedule cards. The runtime is intentionally client-side and reads stock HUD/minimap panels; it does not add a network authority layer.

Work only in source under `buff_timer_virgin/`. Treat `buff_timer_virgin_compiled/`, `buff_timer_virgin_terser/`, `buff_timer_virgin_terser_compiled/`, and `pak98_dir.vpk` as generated output. Neutral minimap respawn rings were removed for fairness and must not be restored.

## Architecture & Data Flow

- `panorama/layout/hud.xml` is the entry point. It loads `rejuvnbufftimer.vjs_c`, `hud_timer.vcss_c`, and `buff_claim.vcss_c`, and declares the panel IDs consumed by JavaScript.
- `panorama/scripts/rejuvnbufftimer.js` is one strict IIFE. Module-private variables own runtime state; there is no JavaScript module graph or dependency-injection container.
- `boot()` finds the HUD root, caches panel references in `UI`, registers `handleRejuvPingActivate` and `handleBuffPingActivate`, resets state, then starts the main loop and watchdog.
- `$.Schedule` drives all asynchronous work in **seconds**. The single loop chain is generation-guarded; stale callbacks stop after reset and scheduled handles are cancelled where practical.

Main data flows:

1. `loop()` reads both clocks, runs the minimap, timer, and maintenance lanes in order, then schedules one generation-guarded callback. Normal work caps at 500 ms, Rift-hot objective work uses 250 ms, and the existing near-spawn 100 ms tick remains authoritative.
2. Low game time cleanup is a one-shot transition below 10 seconds; reaching 10 seconds rearms the next low-time cleanup. Invalid or negative game time is ignored.
3. `collectMinimapSnapshot()` reuses player and powerup arrays and classifies cached `map_button` panels. Claim, linger, and objective systems consume this shared snapshot.
4. Rejuvenator charge transitions advance the phase sequence and start the 220-second buff timer. Bridge Buff uses a 300-second repeating schedule.
5. Powerup pretracking and monitoring compare squared ally/enemy distances. `CLAIM_RADIUS_SQ = 64`; ties prefer the ally classification.
6. `checkEnemyLinger()` detects active-to-inactive enemy markers, creates a 5-second `?` under `HudMinimapContainer`, disables the stock marker's input, and restores every prior value on removal or rollback.
7. `updateObjectiveTimers()` combines schedule estimates with the authoritative minimap class `.capture_point.koth_warning`. A plain `capture_point` is present while idle and is not an active-Rift signal.
8. Timer buttons resolve stock chat panels, reject all-chat, sanitize text, issue `say_chat_team`, retry panel races, submit, and release focus.

Important runtime contracts:

- Team detection uses `friend`/`ally`/`team1` versus `enemy`/`team2`; `client_cone_fov` is not a team signal.
- The first Rift is nominally 12:00 ±1 minute. During the uncertain window the card shows `RIFT` with `±1m`; `koth_warning` replaces the estimate with the exact 20-second global-warning countdown.
- `rift-confirmed` is reserved for an accepted authoritative warning at or before its observed spawn anchor; stale marker reappearances must not activate it. Keep estimated Rift states muted/static and the confirmed state to three stock-style cyan pulses.
- Later unobserved Rift intervals accumulate independent ±1-minute uncertainty. Do not replace them with fixed absolute anchors.
- Urn starts at 10:00, repeats every 5 minutes, and uses a slower ice-blue warning pulse during the final 60 seconds so it remains distinct from Rift cyan.
- Neutral override windows are 1:00–2:00, 5:00–6:00, and 7:00–8:00. `updateNeutralOverrides()` owns them through the `NEUTRAL_ACTIVE` map.
- During a neutral override, compute the mini Rejuvenator countdown from phase state; do not mirror the overridden main label.
- Claim overlays stay outside `minimap_persp` so opening the scoreboard does not hide them.

## Key Directories

- `buff_timer_virgin/panorama/layout/` — Panorama panel tree and compiled asset includes.
- `buff_timer_virgin/panorama/scripts/` — the complete production runtime.
- `buff_timer_virgin/panorama/styles/` — timer/objective styles in `hud_timer.css` and minimap/claim/linger styles in `buff_claim.css`.
- `buff_timer_virgin/scripts/` — standalone Node VM validators.
- `scripts/` at repository root — shared Source 2 packaging helpers used by the module build wrapper.
- `sr2compiler/` and `vpk cli/` at repository root — repository-local compiler and VPK tooling candidates.

## Development Commands

Run commands from the repository root:

```powershell
# Runtime/objective/linger contracts
node buff_timer_virgin/scripts/validate-runtime-engine.js

# Team-chat sanitization, gating, and retry contracts
node buff_timer_virgin/scripts/validate-team-chat-intent.js

# Validate, Closure-compile, Source 2-compile, pack, and deploy pak98
powershell -ExecutionPolicy Bypass -File build_buff_timer_virgin.ps1
```

There is no module lint command or package-level test runner. Do not substitute a repo-wide command.

## Code Conventions & Common Patterns

- JavaScript uses two-space indentation, `UPPER_SNAKE_CASE` constants, `camelCase` functions and state, and underscore-prefixed caches/internal bookkeeping.
- Preserve the strict IIFE:

  ```js
  (() => {
    "use strict";
  })();
  ```

- Cache stock panels at boot or discovery. Avoid extra full-tree traversals in scheduled hot paths.
- Collect one reusable minimap snapshot and pass it downstream. The `map_button` query has an 800 ms cache; snapshot refreshes are 250/500/750 ms for hot/normal/idle work.
- Use `WRITE_CACHE` and class-change checks before assigning text, classes, images, or styles.
- Prefer squared distances over `Math.sqrt`; reuse arrays and objects in recurring work.
- Validate volatile panels with `IsValid()` and guard engine/DOM boundaries with narrow `try/catch`. Swallowed failures are acceptable only where the engine can race panel destruction.
- Treat setup that mutates stock panels transactionally: capture prior values, create/position custom UI, apply mutations, and roll back through the normal removal path on failure.
- Keep engine-owned properties such as `"hittest"` and `"hittestchildren"` in quoted bracket notation so Closure ADVANCED does not rename them.
- XML IDs, JavaScript lookups/handlers, CSS selectors, Closure externs, and validator mocks form one contract. Update every side together.
- Panorama CSS is not browser CSS. Follow existing Source 2 patterns such as `pre-transform-scale2d`, `style.clip`, `visibility: collapse`, and `overflow: noclip`.
- Dynamic linger labels must remain under `HudMinimapContainer`; the engine-owned `HudMinimap` renderer does not reliably accept custom children.
- Use DPI-aware minimap geometry. If minimap geometry is missing, use the live container extent rather than desktop-sized fallback dimensions.
- Never leave `$.Msg` diagnostics enabled in production.

## Important Files

- `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js` — runtime entry point and all timer, snapshot, claim, linger, objective, chat, and state logic.
- `buff_timer_virgin/panorama/layout/hud.xml` — engine import seam and panel-ID contract.
- `buff_timer_virgin/panorama/styles/hud_timer.css` — Rejuvenator, Bridge Buff, mini-card, neutral, Rift, and Urn visuals.
- `buff_timer_virgin/panorama/styles/buff_claim.css` — minimap glows, claim boxes, rings, timers, and linger label.
- `buff_timer_virgin/scripts/validate-runtime-engine.js` — objective and linger VM assertions.
- `buff_timer_virgin/scripts/validate-team-chat-intent.js` — team-chat VM assertions.
- `build_buff_timer_virgin.ps1` — authoritative release wrapper.
- `scripts/source2_package_pipeline.ps1` — root-safe cleanup, compiler output checks, VPK packing/tree inspection, and asset assertions.

Removed assets are not extension points: do not reintroduce `jungle_timer.js`, `jungle_timer.css`, `RejuvBuff`, or `RejuvTimeBuff`.

## Runtime/Tooling Preferences

- Production runs in Source 2 Panorama, using engine globals such as `$`, `GameUI`, and `SteamOverlayAPI`.
- Validation uses Node CommonJS built-ins (`assert`, `fs`, `path`, and `vm`). There is no local `package.json`, Jest, Mocha, or Bun requirement.
- The release workflow is Windows PowerShell-first and requires Node/npm, `npx --yes google-closure-compiler`, `sr2compiler/New folder.exe`, and a repository-local `vpkeditcli.exe`.
- Closure uses `ADVANCED` mode with generated externs. The wrapper strips the `TEST_EXPORTS` block only from the staged production copy and checks required runtime fragments.
- The wrapper requires compiled `.vjs_c`, `.vxml_c`, and both `.vcss_c` outputs, inspects the packed VPK, then deploys to `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk`.
- Staging directories retain the historical `_terser` name but the current wrapper uses Closure, not Terser.
- Prefer `build_buff_timer_virgin.ps1`; legacy one-off terser/manual-pack helpers contain stale paths or incomplete release steps.

## Testing & QA

The validators are direct Node scripts using `node:assert/strict` and `vm`, with hand-built Panorama mocks:

- `validate-runtime-engine.js` covers Rift uncertainty and warning transitions, Urn warning timing, hideout card visibility, linger positioning/inversion/clamping, stock-panel restoration, and error rollback.
- `validate-team-chat-intent.js` covers sanitization, team-target gating, cooldowns, missing-panel retries, chat-tree races, and stock-panel fallback.

The runtime exposes deterministic seams inside `// TEST_EXPORTS_BEGIN` / `// TEST_EXPORTS_END`. Keep these markers intact; the build removes that block from the staged shipping source before Closure compilation.

VM validators exercise unminified source logic only. For every deployable JavaScript, XML, or CSS change:

1. Run both Node validators.
2. Run `build_buff_timer_virgin.ps1`.
3. Confirm Closure output, all four compiled assets, packed VPK asset assertions, and deployment success.
4. Restart Deadlock and smoke-test the changed path in a live match or sandbox. Check timer transitions, minimap orientation, scoreboard visibility, chat focus, and panel restoration as applicable.

The compiler wrapper may warn that it produced required output but did not exit, or that it exited nonzero after outputs appeared. Treat this as acceptable only when required compiled outputs exist and the wrapper continues through VPK asset checks and deployment. A missing output, missing packed asset, pack failure, or deployment failure is a real failure.
