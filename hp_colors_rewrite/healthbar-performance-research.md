# Healthbar performance research

## Verdict

The capture does not show HP Colors Rewrite JavaScript as the main frame-time problem. It does show two concrete targets: diagnostic output is far too noisy, and `scan` repeats some health geometry work already done by `paintColors`.

I would fix the measurement first, then test one change at a time. The tempting move is to slow the active paint loop. The evidence does not support that. It would make health color, readout, pulse, and kill-marker updates lag during combat.

## What the capture proves

The source capture is `G:\console(16).log`. Its five-second performance reports span 04:57:23 through 05:12:38.

| Measurement | Result |
|---|---:|
| Log size | 15,971 lines, 1,825,375 bytes |
| Five-second probe reports | 2,827 |
| Unique reporting probes | 37 |
| Mean reporting probes alive at once | 15.34 |
| Bars in each report | 1 |
| Rewrite log output | 4,270 lines, 771,440 bytes |
| Performance report output | 2,827 lines, 475,058 bytes |
| Health data output | 1,230 lines, 265,425 bytes |
| Rewrite exceptions | 0 found |

Rewrite messages account for 42.3 percent of the file. The five-second performance reports alone account for 26.0 percent. Health data messages add another 14.5 percent. Cutting these messages has a certain effect on log volume. This capture does not prove the size of any frame-time gain.

The callback counters report entries, not time spent.

| Counter | Total | Median per five seconds | P95 | Maximum |
|---|---:|---:|---:|---:|
| `paintColors` | 13,876 | 3 | 16 | 32 |
| `refreshColor` | 13,876 | 3 | 16 | 32 |
| `applyCustomization` | 2,471 | 0 | 5 | 36 |
| `scan` | 14,086 | 5 | 5 | 5 |

`paintColors` calls `refreshColor` once for each tracked bar, so equal totals are expected when every probe reports one bar. The paint range also matches the configured 0.15-second active, 0.25-second recent, and 1.5-second idle delays. It is not evidence of a runaway scheduler.

The longest useful VProf report covers 44,772 frames and 448 analyzed one-second intervals during the active session.

| VProf value | Result |
|---|---:|
| Average FPS | 101.5 |
| P1 FPS | 63.7 |
| Average frame time | 9.85 ms |
| P99 frame time | 15.70 ms |
| Average `PanoramaUI` time | 1.62 ms |
| P99 `PanoramaUI` time | 3.08 ms |
| Average `Javascript` time across all frames | 0.09 ms |
| Average `Javascript` time on active frames | 0.39 ms |
| P99 `Javascript` time on active frames | 2.28 ms |

During the same 650-second wall-clock span, the Rewrite recorded about 20 paint callbacks, 20 scan callbacks, and 3.6 customization calls per second across all live probes. VProf does not break `PanoramaUI` or `Javascript` down by mod. It cannot assign those times to HP Colors Rewrite.

## What the source does

`scan` still runs once per second, but the authored layout contains one `unit_healthbar_active_parent`. Discovery now uses one direct descendant lookup instead of a JavaScript child-tree walk. Cached parts and ancestry still validate every pass, so late, removed, and replaced panels recover through the same path.

For enabled enemy or ally bars, `paintColors` owns the four health geometry reads. The next scan reuses that sample for local presentation state instead of reading the same widths again. Disabled and unclassified bars retain scan sampling because paint does not own them.

`applyCustomization` remains dirty-gated. Its style, class, and text helpers compare cached and current panel state before writing. Focused validators prove that stable scan and paint passes perform no repeated writes, no scan-owned geometry reads for enabled bars, and no JavaScript child-tree walk.

The per-probe five-second logger and per-bar health data logger were measurement scaffolding. Both were removed after the comparison captures because they produced most Rewrite log lines and added scheduled callbacks, string construction, and console writes to live overlay contexts. Bounded probe, config, role, hero, and lifecycle diagnostics remain.

## What to optimize

### 1. Diagnostic output

Completed after the comparison capture. The runtime no longer schedules or emits per-probe five-second reports. Transition-only diagnostics remain available for behavior checks.

### 2. Record duration and real work

Replace bare entry counts with bounded measurements:

- total and maximum duration for `scan`, `paintColors`, `refreshColor`, and `applyCustomization`
- panels visited and parent walks
- layout-width reads
- attempted, skipped, and applied style, class, and text writes
- diagnostic messages emitted

Keep VProf running. The added counters should flush through one reporter and remain disabled outside a profiling build. Without these numbers, changing scheduler intervals is guesswork.

### 3. Give health sampling one owner

`reportData` samples health during every scan. `refreshColor` may sample the same bar again from the paint loop. Split discovery from health updates:

- let `scan` own panel discovery, replacement detection, role classification, pip text, and level text
- let `paintColors` own health geometry, readout updates, colors, pulse, kill markers, and changed-health telemetry
- retain a slow fallback sample for bars whose color refresh is disabled if health telemetry still needs them

This removes duplicate width reads without slowing active visual updates. It needs regressions for raw parent-width marker changes, shield width, disabled colors, readout updates, recycled panels, and role changes.

### 4. Test a stable scan fast path

Every report in this capture had one bar. Once that bar and its required parts remain valid, `scan` can skip the full discovery walk for most passes. Run a full discovery pass after invalidation and at a slower safety interval.

Do not simply change the one-second scan to five seconds. That would delay late panels and recycled healthbars. First count visited panels and cached-part validation work, then prove the fast path against panel replacement and missing-part recovery.

### 5. Leave cached writes alone for now

`applyCustomization` entered far less often than scan or paint, and its median five-second count was zero. Existing tests prove that stable passes do not repeat writes. The live counters do not justify weakening those guards.

Keep the current `setStyle` check against the panel's actual value. The game can overwrite owned styles, so a cache-only check would fail to repair them.

### 6. Keep the active paint cadence

The 32-call maximum matches the intended 0.15-second active delay. Slowing it would trade combat responsiveness for an unproven saving. Revisit the cadence only if elapsed callback timing or an A/B profile shows paint as a real cost.

## Test plan

Use the same hero, map state, graphics settings, camera path, and capture duration for each run.

1. Capture the current build.
2. Capture a build with periodic diagnostics gated or aggregated.
3. Capture a build with one health-sampling owner.
4. Capture a build with the stable scan fast path.

Collect VProf and fresh ETW or PerfView traces for each run. Compare `PanoramaUI` average and P99, active `Javascript` average and P99, P1 FPS, actual width reads, actual writes, and recovery behavior after a healthbar panel replacement. Keep a change only if repeated captures show a stable improvement and the in-game smoke checks still pass.

## Sources

Valve's [SteamVR Panorama JavaScript API](https://developer.valvesoftware.com/wiki/SteamVR/Environments/Panorama_Javascript_API) and [Dota 2 Panorama JavaScript API](https://developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools/Panorama/Javascript/API) list the relevant scheduler and panel APIs. The site returned an Anubis challenge during this research, so this note does not quote inaccessible page text.

The exact shipped-source mirror for Deadlock shows practical use of scheduled work, cancellation, cached panel references, and transition-based updates:

- [`async.js`](https://github.com/SteamTracking/GameTracking-Deadlock/blob/3ccb3082581f21191198073820616965d0944b81/game/citadel/pak01_dir/panorama/scripts/async.js)
- [`citadel_db_post_game_progress.js`](https://github.com/SteamTracking/GameTracking-Deadlock/blob/3ccb3082581f21191198073820616965d0944b81/game/citadel/pak01_dir/panorama/scripts/citadel_db_post_game_progress.js)
- [`citadel_db_post_game_progress_mvp.js`](https://github.com/SteamTracking/GameTracking-Deadlock/blob/3ccb3082581f21191198073820616965d0944b81/game/citadel/pak01_dir/panorama/scripts/post_game/citadel_db_post_game_progress_mvp.js)

The repository's [Deadlock Panorama API inventory](../docs/2026-06-01-panorama-js-api-inventory.md#L30-L84) records the shipped `$` helpers and panel methods. It is API inventory, not a benchmark.
