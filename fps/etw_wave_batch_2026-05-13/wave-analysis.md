# Deadlock ETW Wave Batch - 2026-05-13

Input traces:

```text
G:\wave0.etl.zip through G:\wave9.etl.zip
```

Assumed wave map:

| Wave | Candidate |
| ---: | --- |
| 0 | current baseline |
| 1 | `r_particle_max_size_cull "1200"` |
| 2 | `r_particle_max_size_cull "1600"` |
| 3 | `cl_fasttempentcollision "1000"` |
| 4 | `props_break_max_pieces_perframe "0"` |
| 5 | `r_update_particles_on_render_only_frames "1"` |
| 6 | `thread_pool_option "6"` |
| 7 | `r_particle_max_size_cull "800"` |
| 8 | `r_texture_pool_size "512"` |
| 9 | `snd_ui_positional "false"` |

Wave 10 was skipped.

## Main Comparison

Lower frame time in milliseconds is better. `P99FPS` is `1000 / P99ms`, so
higher is better there.

| Wave | Candidate | P95 ms | P99 ms | P99 FPS | Clean max ms | Avg CPU cores | Frame events/sec | SimTicks=2 |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | current baseline | 5.388 | 5.823 | 171.7 | 10.444 | 1.130 | 260.95 | 0 |
| 1 | `r_particle_max_size_cull "1200"` | 5.475 | 5.942 | 168.3 | 9.990 | 1.138 | 252.63 | 2 |
| 2 | `r_particle_max_size_cull "1600"` | 5.338 | 5.827 | 171.6 | 9.869 | 1.105 | 261.22 | 0 |
| 3 | `cl_fasttempentcollision "1000"` | 5.469 | 5.834 | 171.4 | 9.861 | 1.126 | 249.36 | 6 |
| 4 | `props_break_max_pieces_perframe "0"` | 5.606 | 6.078 | 164.5 | 9.295 | 1.117 | 246.77 | 6 |
| 5 | `r_update_particles_on_render_only_frames "1"` | 5.292 | 5.888 | 169.8 | 10.198 | 1.126 | 262.24 | 3 |
| 6 | `thread_pool_option "6"` | 6.087 | 6.679 | 149.7 | 11.338 | 0.872 | 217.14 | 1 |
| 7 | `r_particle_max_size_cull "800"` | 6.028 | 6.703 | 149.2 | 9.747 | 0.845 | 214.26 | 11 |
| 8 | `r_texture_pool_size "512"` | 6.064 | 6.738 | 148.4 | 14.978 | 0.837 | 218.28 | 3 |
| 9 | `snd_ui_positional "false"` | 6.062 | 6.577 | 152.0 | 12.979 | 0.855 | 216.17 | 1 |

## Interpretation

### Best / Keep Candidate

`wave2`: `r_particle_max_size_cull "1600"`

- Strict P99 is effectively tied with baseline: `5.827ms` vs baseline
  `5.823ms`.
- P95 improves: `5.338ms` vs baseline `5.388ms`.
- Clean max improves: `9.869ms` vs baseline `10.444ms`.
- Average CPU cores improve: `1.105` vs baseline `1.130`.
- Frame events/sec stay slightly higher: `261.22` vs baseline `260.95`.
- `SimulationTicks=2` stays at `0`.

Decision: this is the best balanced wave in this batch. Because the P99
difference is tiny, call it a practical tie on P99 and a win on P95/max/CPU.

### Baseline Also Valid

`wave0`: current baseline

- Best strict P99 by only `0.004ms` over wave2, which is below meaningful noise.
- Clean max is worse than wave2.
- CPU cores are slightly higher than wave2.

Decision: acceptable, but wave2 is the better balanced candidate.

### Mixed / Retest Only If Needed

`wave3`: `cl_fasttempentcollision "1000"`

- P99 is basically tied with baseline: `5.834ms`.
- Clean max improves: `9.861ms`.
- Frame events/sec drops from `260.95` to `249.36`.
- `SimulationTicks=2` rises to `6`.

Decision: not a keep from this pass. Retest only after the particle threshold is
decided, because it may still reduce isolated physics spikes but this run does
not show a clean 1% low win.

`wave5`: `r_update_particles_on_render_only_frames "1"`

- Best P95: `5.292ms`.
- Highest frame events/sec: `262.24`.
- P99 worsens to `5.888ms`.
- Clean max worsens vs wave2/baseline.

Decision: mixed. Do not keep yet. It may deserve a retest only if ability-heavy
particle fights feel better manually.

### Reject

`wave1`: `r_particle_max_size_cull "1200"`

- P99 worsens to `5.942ms`.
- P95 worsens.
- CPU cores rise slightly.

Decision: reject. It did not beat `999` or `1600`.

`wave4`: `props_break_max_pieces_perframe "0"`

- Clean max improves, but P99 worsens to `6.078ms`.
- Frame events/sec drops.

Decision: reject for 1% lows.

`wave6`: `thread_pool_option "6"`

- P99 worsens hard: `6.679ms`.
- P99 FPS equivalent drops to about `149.7`.
- Frame events/sec drops to `217.14`.

Decision: reject. Stay on `thread_pool_option "4"`.

`wave7`: `r_particle_max_size_cull "800"`

- P99 worsens to `6.703ms`.
- Frame events/sec drops to `214.26`.
- `SimulationTicks=2` rises to `11`.

Decision: reject. Also treat as possibly contaminated if wave6 was not fully
removed first.

`wave8`: `r_texture_pool_size "512"`

- Worst P99: `6.738ms`.
- Worst clean max: `14.978ms`.
- Frame events/sec remains low.

Decision: reject for this batch. Only revisit if texture pop-in or streaming
hitches are the visible problem.

`wave9`: `snd_ui_positional "false"`

- P99 worsens to `6.577ms`.
- Clean max worsens to `12.979ms`.
- Audio was not a top bottleneck in previous traces.

Decision: reject.

## Contamination Warning

Waves 6 through 9 all show the same pattern:

- average CPU cores much lower,
- frame events/sec much lower,
- P99 much worse.

That is not a CPU optimization win. It looks like either `thread_pool_option "6"`
hurt frame production, or wave6 remained active into later captures. If wave7,
wave8, and wave9 were not run after fully removing wave6, do not treat them as
independent tests.

## Recommended Config Decision

Set:

```text
r_particle_max_size_cull "1600"
thread_pool_option "4"
```

Keep:

```text
engine_allow_multiple_ticks_per_frame "false"
engine_max_ticks_to_simulate "2"
cloth_update "1"
```

Do not keep from this batch:

```text
r_particle_max_size_cull "1200"
r_particle_max_size_cull "800"
thread_pool_option "6"
props_break_max_pieces_perframe "0"
r_texture_pool_size "512"
snd_ui_positional "false"
```

Retest later only if needed:

```text
cl_fasttempentcollision "1000"
r_update_particles_on_render_only_frames "1"
```

