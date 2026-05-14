# Deadlock N Demo ETW Batch - 2026-05-14

Input traces:

```text
G:\N00demo.etl.zip through G:\N05demo.etl.zip
```

Assumed wave map:

| Wave | Candidate |
| ---: | --- |
| N00 | baseline/current |
| N01 | `r_flush_on_pooled_ib_resize "false"` |
| N02 | `parallel_perform_invalidate_physics "true"` |
| N03 | `sc_aggregate_indirect_draw_compaction_threshold "1"` |
| N04 | `panorama_enable_secondary_layout_pass "0"` |
| N05 | `r_citadel_distancefield_max_distance "16"` + `r_citadel_distancefield_min_screen_space_size "99"` |

## Important Limitation

These traces do not contain `FrameAccumulateTime` events, so clean-window P95,
P99, max frametime, and frame events/sec are unavailable.

That means this batch can rank CPU/module pressure, but it cannot prove a 1% low
winner. A keep decision still needs one follow-up ETW capture with Valve.Source
frame events enabled, or the same PerfView setup used for the earlier wave0-wave9
batch.

## CPU / Module Comparison

| Wave | Candidate | Duration | Avg CPU cores | Game CPU ms | MainThrd ms | D3D11RenderThread ms | AudioMixer ms |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| N00 | baseline/current | 176.61s | 1.418 | 250454 | 41531 | 22377 | 17605 |
| N01 | `r_flush_on_pooled_ib_resize "false"` | 170.46s | 1.450 | 247130 | 40716 | 22195 | 17887 |
| N02 | `parallel_perform_invalidate_physics "true"` | 171.18s | 1.451 | 248346 | 40641 | 21651 | 18761 |
| N03 | `sc_aggregate_indirect_draw_compaction_threshold "1"` | 171.87s | 1.435 | 246653 | 39868 | 22001 | 17572 |
| N04 | `panorama_enable_secondary_layout_pass "0"` | 171.60s | 1.438 | 246767 | 40210 | 21651 | 17617 |
| N05 | distancefield culling pair | 173.43s | 1.407 | 244081 | 39741 | 21572 | 17282 |

## Module Rates

Samples per second, lower is generally better for the targeted module.

| Wave | Candidate | particles | render | scene | material | panorama | vphysics2 | soundsystem |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N00 | baseline/current | 208.83 | 121.80 | 121.28 | 49.46 | 79.58 | 40.70 | 103.34 |
| N01 | `r_flush_on_pooled_ib_resize "false"` | 212.78 | 123.75 | 120.55 | 49.38 | 83.47 | 38.46 | 107.65 |
| N02 | `parallel_perform_invalidate_physics "true"` | 212.64 | 121.87 | 123.67 | 48.89 | 83.73 | 37.59 | 107.90 |
| N03 | `sc_aggregate_indirect_draw_compaction_threshold "1"` | 212.04 | 124.12 | 119.76 | 47.82 | 80.23 | 38.24 | 105.47 |
| N04 | `panorama_enable_secondary_layout_pass "0"` | 206.92 | 121.89 | 123.15 | 48.88 | 79.87 | 39.60 | 107.44 |
| N05 | distancefield culling pair | 207.66 | 119.73 | 119.23 | 48.45 | 79.21 | 36.94 | 104.05 |

## Ranking

### Initial CPU Candidate, Rejected After Retest

`N05`: distancefield culling pair

```text
r_citadel_distancefield_max_distance "16"
r_citadel_distancefield_min_screen_space_size "99"
```

Why:

- Lowest average CPU cores: `1.407` vs baseline `1.418`.
- Lowest game CPU total: `244081ms` vs baseline `250454ms`.
- Lowest MainThrd CPU: `39741ms` vs baseline `41531ms`.
- Lowest D3D11RenderThread CPU: `21572ms` vs baseline `22377ms`.
- Lower `rendersystemdx11`, `scenesystem`, `panorama`, `vphysics2`, and
  `soundsystem` sample rates than baseline.

Initial decision before retest: best CPU candidate in this demo batch, but not
proven for 1% lows because frame timing events are missing. The later N05
retest reversed the CPU result, so N05 is rejected for now.

### Retested / Possible Retest

`N03`: `sc_aggregate_indirect_draw_compaction_threshold "1"`

- Lower MainThrd CPU than baseline.
- Lower material and vphysics2 sample rates.
- Average CPU cores are worse than baseline (`1.435` vs `1.418`).

Decision: retested on 2026-05-14 and rejected for now. The retest raised average
CPU cores to `1.459` and worsened particles, client, sound, panorama, and
vphysics2 sample rates versus baseline. Removed from live config.

`N04`: `panorama_enable_secondary_layout_pass "0"`

- Lower MainThrd and D3D11RenderThread CPU than baseline.
- Panorama sample rate is only basically flat, not clearly better.
- Average CPU cores worse than baseline.

Decision: not enough evidence. Retest only if UI/Panorama is a top ETW bucket in
a full frame-event trace.

### Reject From This Demo Batch

`N01`: `r_flush_on_pooled_ib_resize "false"`

- Average CPU cores worse than baseline.
- Render sample rate not improved.
- Panorama/sound rates worsen.

Decision: reject for now.

`N02`: `parallel_perform_invalidate_physics "true"`

- VPhysics sample rate improves, but average CPU cores and audio CPU worsen.
- No frametime evidence.

Decision: reject for now unless a physics-specific stutter trace points at
`vphysics2`.

## Current State

Reject N03 and N05 for now. Keep the current requested particle test active:

```text
r_update_particles_on_render_only_frames "1"
```

Use the same PerfView setup that produced `FrameAccumulateTime` in the earlier
wave0-wave9 batch before accepting any new N-wave candidate for 1% lows.

## N05 Retest - 2026-05-14

Input trace:

```text
G:\N05demo.etl.zip
```

This was a new file versus the first N05 demo:

```text
Zip timestamp: 2026-05-14 01:56:29
ETL size:      166,496,462 bytes
```

Result: still no `FrameAccumulateTime` events. P95/P99/max frametime are still
unavailable, so this cannot validate 1% lows.

CPU comparison:

| Run | Duration | Avg CPU cores | Game CPU ms | MainThrd ms | D3D11RenderThread ms | AudioMixer ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| N00 baseline | 176.61s | 1.418 | 250454 | 41531 | 22377 | 17605 |
| N05 first demo | 173.43s | 1.407 | 244081 | 39741 | 21572 | 17282 |
| N05 retest | 173.36s | 1.472 | 255223 | 42922 | 22892 | 17725 |

Module-rate comparison, samples per second:

| Run | particles | client | render | scene | panorama | vphysics2 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| N00 baseline | 208.83 | 172.03 | 121.80 | 121.28 | 79.58 | 40.70 |
| N05 first demo | 207.67 | 169.74 | 119.73 | 119.23 | 79.21 | 36.94 |
| N05 retest | 215.18 | 180.23 | 124.86 | 123.90 | 82.32 | 40.49 |

Decision after retest:

- Reject N05 for now.
- The first N05 demo looked CPU-positive, but the retest reversed that result.
- Because both traces lack frame events, neither can prove a 1% low gain.
- Removed these from live config:

```text
r_citadel_distancefield_max_distance "16"
r_citadel_distancefield_min_screen_space_size "99"
```

Keep the current requested particle test:

```text
r_update_particles_on_render_only_frames "1"
```

## N03 Retest - 2026-05-14

Input trace:

```text
G:\N03demo.etl.zip
```

This was a new file versus the first N03 demo:

```text
Zip timestamp: 2026-05-14 02:13:44
ETL size:      170,099,065 bytes
```

Result: still no `FrameAccumulateTime` events. P95/P99/max frametime are still
unavailable, so this cannot validate 1% lows.

CPU comparison:

| Run | Duration | Avg CPU cores | Game CPU ms | MainThrd ms | D3D11RenderThread ms | AudioMixer ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| N00 baseline | 176.61s | 1.418 | 250454 | 41531 | 22377 | 17605 |
| N03 first demo | 171.87s | 1.435 | 246653 | 39868 | 22001 | 17572 |
| N03 retest | 170.29s | 1.459 | 248483 | 41857 | 22051 | 17610 |

Module-rate comparison, samples per second:

| Run | particles | client | render | scene | panorama | vphysics2 | soundsystem |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N00 baseline | 208.83 | 172.03 | 121.80 | 121.29 | 79.58 | 40.70 | 103.34 |
| N03 first demo | 212.05 | 174.62 | 124.11 | 119.77 | 80.23 | 38.24 | 105.47 |
| N03 retest | 218.82 | 182.55 | 119.75 | 121.24 | 80.54 | 40.84 | 106.22 |

Decision after retest:

- Reject N03 for now.
- The only strong CPU positives left are lower render and material rates, but
  average CPU cores, MainThrd CPU, particles, client, sound, panorama, and
  vphysics2 are worse than baseline.
- Because the trace lacks frame events, it cannot prove a 1% low gain.
- Removed this from live config:

```text
sc_aggregate_indirect_draw_compaction_threshold "1"
```
