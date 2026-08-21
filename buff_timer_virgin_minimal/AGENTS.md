# Repository guidelines

## Project overview

`buff_timer_virgin_minimal` is the timers-only edition of `buff_timer_virgin`. It keeps the Rejuvenator, Bridge Buff, Rift, Urn, and neutral-phase timer cards plus the team-chat timer buttons.

This edition intentionally removes every custom minimap visual requested by the full version:

- Bridge Buff availability glows
- Ally and enemy claim boxes, rings, icons, and countdowns
- Enemy-fog `?` linger markers

The runtime remains client-side and reads stock HUD and minimap panels. It does not add a network authority layer.

Work only in source under `buff_timer_virgin_minimal/`. Treat compiled directories, staging directories, VPKs, archives, and generated diagnostics as build output. Do not restore the removed minimap visuals in this edition.

## Architecture and data flow

- `panorama/layout/hud.xml` is the entry point. It loads `rejuvnbufftimer.vjs_c` and `hud_timer.vcss_c`.
- `panorama/scripts/rejuvnbufftimer.js` is one strict IIFE with module-private runtime state.
- `boot()` finds the HUD root, caches panel references, registers the two timer chat handlers, resets state, and starts the guarded loop and watchdog.
- `$.Schedule` uses seconds. The main loop is generation-guarded so stale callbacks stop after reset.
- The minimap snapshot remains because Rift confirmation reads the stock `.capture_point.koth_warning` marker. The minimal loop does not run Bridge Buff claim classification or enemy linger maintenance.

## Features retained

- Rejuvenator phase countdown and activation timer
- Bridge Buff five-minute schedule timer
- Neutral phase overrides and mini Rejuvenator card
- Rift estimate, uncertainty, and authoritative warning countdown
- Urn five-minute schedule and final-minute warning
- Team-chat buttons over the Rejuvenator and Bridge Buff timer pills

## Features removed

- `buff_claim.css`
- `MinimapGlow*` panels
- `ClaimOverlayRoot` and its claim panels
- Runtime calls that pretrack or classify Bridge Buff claims
- Runtime calls that create enemy `?` linger markers

Internal dead helpers may remain in authored source because the full and minimal editions share the same base runtime. The production Closure build strips unreachable helpers after the test export block is removed.

## Important files

- `panorama/layout/hud.xml` defines the timer cards and chat buttons.
- `panorama/scripts/rejuvnbufftimer.js` owns all timer, objective, chat, and state logic.
- `panorama/styles/hud_timer.css` defines the retained timer visuals.
- `scripts/validate-runtime-engine.js` validates objective and timer contracts in a Panorama VM.

## Validation

Run from the repository root:

```powershell
node --check buff_timer_virgin_minimal/panorama/scripts/rejuvnbufftimer.js
node buff_timer_virgin_minimal/scripts/validate-runtime-engine.js
```

Build and deploy the minimal edition with:

```powershell
powershell -ExecutionPolicy Bypass -File build_buff_timer_virgin_minimal.ps1
```

The wrapper compiles this source folder, requires only `hud_timer.vcss_c`, rejects `buff_claim.vcss_c`, inspects the packed VPK, and deploys it as `pak98_dir.vpk`. It replaces the full Buff Timer edition in that slot. Restart Deadlock after replacement, then smoke-test timers, Rift warning detection, chat focus, and the absence of custom minimap visuals.
