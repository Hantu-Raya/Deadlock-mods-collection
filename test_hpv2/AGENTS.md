# Standalone pickup indicators

## Scope and entry points

`test_hpv2/` is a working standalone pickup-buff indicator mod, packaged as pak04. Its name is historical; it does not bundle HP Colors Rewrite V2. Keep `hp_colors_rewrite_v2/` untouched when changing this module.

- `panorama/scripts/test_topbar_pickups.js` runs in world healthbar and topbar contexts. It samples native pickup effects, validates incoming snapshots, and renders indicators beside ultimate status.
- `panorama/scripts/test_event_bridge.js` owns the same-context queue and sibling event relay.
- `panorama/layout/unit_status_overlay_v2.xml` preserves stock engine-fed markup and loads the bridge before the pickup script. Keep that include order and the stock stylesheet.
- `panorama/layout/citadel_hud_top_bar.xml` loads the HUD consumer.
- `panorama/layout/test_event_relay.xml` gives the plain sibling Panel its own script context. It is part of the working transport, not decorative markup.
- `../build_test_hpv2.ps1` owns staging, compilation, the exact compiled-asset allowlist, deployment backup, and hash verification. Consult it for paths and package inventory.

## Deferred V2 integration

When merging pickup indicators into `hp_colors_rewrite_v2/`, read that module's `AGENTS.md` and inspect its current lifecycle handling. Reuse a verified match/lobby transition to clear pickup records, calibration, and row caches; no such integration is implemented or assumed available yet. Keep standalone pak04 independent until then.

Expected live player counts are 12 for standard/ranked and 8 for Street Brawl. Treat these as expectations, not cache-validity or match-transition signals. Preserve slow discovery for partial loading, reconnects, and row replacement; validate cached panel ownership within a match. A confirmed lobby/new-match reset supplements these guards rather than replacing them.

## Transport boundaries

The world script calls `context.HPV2QueuePickup(record)` directly. The queue lazily creates a sibling Panel under `panorama_world_panel_N`, outside the publishing `ClientUIDialogPanel` ancestor chain. After writing its serialized attribute, the publisher dispatches `Activated` to that sibling. The relay layout registers `SetPanelEvent("onactivate", relaySnapshot)` in its own context; that callback reads the snapshot and dispatches `ClientUI_FireOutput`. The HUD validates the event and renders from cached rows. Initialization drains any snapshot queued before callback registration, and the stop hook clears the callback.

Direct dispatch from `ClientUIDialogPanel` was consumed by its native handled callback. The user confirmed the event-driven sibling relay works in-game and updates faster than the previous polling route. Treat this as the working baseline; CPU/FPS gains have not been profiled. For future transport changes, require actual HUD reception rather than treating a successful API call or layout load as delivery evidence. A child Panel alone does not establish an independent script context.

Keep the direct queue handoff and serialize only at the relay boundary. Do not restore the removed world-root snapshot map or extra JSON round trips. The relay has no polling fallback; three-second native sampling, five-second HUD discovery, and the one-second countdown painter remain separate. Event-driven delivery does not establish lower CPU cost without profiling.

## Runtime contracts

The user stopped the rendering investigation and requested diagnostic removal. Checkpoint `63ddeef` preserves the instrumented runtime and investigation notes. Current production source has no profiler, telemetry counters, periodic reports, or debug-only script dependencies; retain operational error logging. Historical measurements in `PERFORMANCE_PLAN.md` are not instructions to restore instrumentation or resume experiments.

Receivers prefilter by role before JSON parsing: world accepts scan-gate/ultimate markers; HUD accepts the pickup-snapshot marker. Escaped strings still parse, and marker matches still require complete message validation. `scripts/validate-message-filter.js` exercises both routes without Panorama mocks.

Topbar discovery walks to `paneltype === "CitadelHudTopBarPlayer"` and searches that subtree once for `UltimateStatus`. Keep the five-second rediscovery and label/ultimate identity checks; a missing ultimate must not bind to another player's row.

Snapshot renders group records only for the current and previous affected names; slow renders still group all names. Every grouping pass still expires all stale/future records before filtering.

Topbar discovery excludes native `LocalPlayer` owners before ultimate lookup or name validation and clears any previously rendered local row. Their labels remain separate for duplicate-name protection and scan-gate identity, not rendering. Discovery runs before gate publication. Gates carry `localName` only when exactly one local label has a unique, nonempty name. Matching world contexts skip native effects and repeated publication while the gate is fresh, clear calibration, and send one tombstone if previously published. Unknown or stale world identity fails open. `SpectatorTarget` does not mean `LocalPlayer`; spectating without a local hero is valid.

## Behavior to preserve

- Sample the native `StatusEffectsBorder.style.clip`; derive countdown rate from observations rather than hardcoding pickup duration. `StatusEffectContainer` is created by the native status panel and is not literal in the XML.
- Preserve recalibration on pickup refresh, pause-aware countdowns, death/disconnect clearing, renamed-row cutoffs, and match-clock reset handling. Stale or missing scan gates fail open.
- Retain the last valid game-clock reading across missing readings so a subsequent lower clock still resets the session. This is not a general lobby/new-match detector.
- Preserve source/instance/sequence validation, timestamps, tombstones, and duplicate-name rejection. Duplicate-name and stale-record guards have executed in real gameplay. Zero diagnostic hits do not establish dead code.
- Freshness uses wall time even when the displayed countdown is paused.
- Keep cached panels, change-detected writes, and stop hooks that prevent stale callbacks after reload.
- `row.renderName` is refreshed per render pass; `row.name` remains the previous lifecycle identity until checked. Countdown ticks read names afresh rather than reusing `renderName`.
- Preserve the approved visuals: full-color radial fill using stock `no_mask_png.vtex`, dark same-hue background, and dark glyph above the fill. CSS clip transitions previously made the ring disappear; keep the working JS painter.
- The healthbar ultimate uses a dark artwork copy at brightness `0.01` and a directly clipped Image inside `HPV2UltimateOverlay`. Keep native `unit_ult_ready_icon` visibility engine-owned. The one-second HUD sampler reads cached topbar rows and native `UltimateStatusBG` clips; locked is zero and ready is 360. It sends `HPV2_ULTIMATE_SNAPSHOT` directly to world receivers. No estimated cooldown is used. Reject duplicate topbar names, local/dead/disconnected rows, and stale/session-mismatched data. Missing matches hide the custom overlay, leaving native behavior. Duplicate world names still cannot identify distinct players reliably. The visual baseline is user-confirmed; no clip-freeze experiment was applied.

## Changes and verification

Prefer deletion of redundant state, checks, and data movement over cosmetic line compression. One-liners must retain lifecycle and identity boundaries. The user prioritizes simpler code over speculative performance optimization and has confirmed the current gameplay behavior.

After source changes, run from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File build_test_hpv2.ps1
```

Auto-deploy completed builds unless the user requests otherwise; use `-SkipDeploy` only when deployment is not intended. The wrapper checks runtime JS syntax and pure diagnostic checks, compiles, inspects the exact package inventory with Source 2 Viewer, and verifies deployment hashes. Preserve those gates. Use Source 2 Viewer exclusively for VPK inspection.

Do not add or run mocked Panorama tests for this module. Use focused pure-data checks for changed algorithms and the actual wrapper for packaging. Report live behavior as unverified when it was not exercised; do not repeatedly request another gameplay session for already confirmed behavior. Restart Deadlock after replacing the VPK.

The compiler wrapper may need stopping after producing its outputs. Required compiled outputs and package checks are the evidence, not a claim that the compiler exited cleanly. Keep the existing .NET SHA256 implementation: `Get-FileHash` is unavailable in this PowerShell environment.

For native API research, inspect installed DLLs read-only. Keep binary hashes and binding/handler addresses with findings; distinguish JS exposure, script-domain restrictions, and live delivery from internal strings. Prior investigation artifacts under `../.tmp/hpv2-native-binding/` are disposable historical evidence, not guaranteed current API contracts. Do not patch DLLs or attach to the game for routine transport research. Require profiling before claiming a performance improvement.
