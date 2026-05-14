# Deadlock FPS Follow-up: SteamTracking + OptimizationLock

Date: 2026-05-10

Scope: continue the `fps/` research against the current live file at
`G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\gameinfo.gi`, the
latest SteamTracking `DumpSource2`, and Sqooky/OptimizationLock.

This is research only. Nothing was applied to the live `gameinfo.gi`.

## Inputs Checked

| Input | Result |
| --- | --- |
| SteamTracking `DumpSource2/convars.txt` | Parsed 4,338 current convars. |
| SteamTracking `DumpSource2/commands.txt` | Parsed 1,250 current commands. |
| Live `gameinfo.gi` | Parsed 399 current convar assignments, 396 unique names, plus the `rate` block. |
| OptimizationLock variants | Parsed 1,596 assignments, 497 unique convar names across default, test, Boot, Kaizu, and Piggy configs. |

Sources:

- https://github.com/SteamTracking/GameTracking-Deadlock/blob/master/DumpSource2/convars.txt
- https://github.com/SteamTracking/GameTracking-Deadlock/blob/master/DumpSource2/commands.txt
- https://github.com/Sqooky/OptimizationLock
- https://github.com/Sqooky/OptimizationLock/blob/main/Sqooky%27s%20.gi/base_convars.txt
- https://github.com/Sqooky/OptimizationLock/blob/main/kaizuchaneru%27s%20minimum%20spec/gameinfo.gi

## Current Applied-State Summary

The live `gameinfo.gi` already contains most high-signal OptimizationLock and
prior research items. Do not recommend these as missing:

| Area | Current applied evidence |
| --- | --- |
| Low latency | `engine_low_latency_sleep_after_client_tick "1"` at line 597, `r_low_latency "1"` at line 845. |
| FPS/rate | `fps_max "0"` at lines 599 and 1113, `fps_max_ui "120"` at line 1114, `rate` block default `"786432"` at lines 1042-1047. |
| Network | `cl_interp_ratio "0"` at line 1110, `cl_async_usercmd_send "true"` at line 1111, `cl_updaterate "128"` at line 829. |
| Lighting/shadows | `lb_enable_*` lighting disables at lines 584-588, `r_citadel_gpu_culling_shadows "true"` at line 674, `r_citadel_shadow_quality "0"` at line 675. |
| Texture pressure | Aggressive texture budget/LOD entries exist at lines 613-622, including `r_texture_pool_size "256"`, `r_texture_lod_scale "4"`, and `r_texture_stream_mip_bias "8"`. |
| UI/Panorama | `panorama_max_fps "15"` and `panorama_max_overlay_fps "15"` at lines 600-601, UI effect disables at lines 639-643, render target/cache entries at lines 1059-1062. |
| Particles | `cl_aggregate_particles "true"` at line 1147 and several particle throttling/cable entries around lines 864-880. See stale-dump warning below. |
| Culling/readability-risk knobs | `r_size_cull_threshold "1.6"` at line 604, `sc_fade_distance_scale_override "180"` at line 900, `sc_screen_size_lod_scale_override "0.001"` at line 909. |

## Important Drift Since The April Report

The old repo report said the then-current `gameinfo.gi` already contained:

```text
r_use_memory_budget_model "1"
r_texture_pool_increase_rate "128"
```

The current live file on 2026-05-10 does not contain either line. These are
valid in the current SteamTracking dump, so they are back on the controlled-test
list rather than the already-applied list.

## Worth Testing Next

Test one small group at a time in tools/bot match. Do not batch all of these
into the live config at once.

```text
// Texture memory budget retest.
// Current live file does not contain these, but current SteamTracking confirms
// both names still exist.
"r_use_memory_budget_model" "1"
"r_texture_pool_increase_rate" "128"
```

Why: current config is already very aggressive on texture eviction and pool
size. A faster pool recovery path may reduce post-eviction texture hitching on
systems with enough VRAM. If VRAM is tiny, this may fight the current `256`
pool goal, so benchmark 1% lows and texture pop-in.

```text
// Very speculative texture-streaming pressure test from Kaizu minimum spec.
// Only keep if it improves 1% lows without increasing texture stalls.
"r_texture_stream_throttle_count_over_budget" "0"
```

Why: valid current convar, missing locally, and present in Kaizu. Confidence is
low because the dump has no description and no controlled Deadlock benchmark.

```text
// Particle job scheduling tests from OptimizationLock/Kaizu.
// Validate ult readability and combat effect timing.
"r_late_particle_job_sync" "1"
"r_threaded_particles" "1"
```

Why: both are current convars and missing locally. `r_late_particle_job_sync`
appears repeatedly in OptimizationLock; `r_threaded_particles` appears in Kaizu.
Confidence remains low because comments in the configs themselves are uncertain.

```text
// Parallel client work tests. Replicated/development flags make these risky.
"cl_modifier_parallel_gather_status_effect_updates" "true"
"parallel_perform_invalidate_physics" "true"
"phys_batch_ray_test" "16"
```

Why: OptimizationLock default/test use them and the names are plausible CPU
optimizations. Risk is higher because several are replicated/clientdll/gamedll
or physics-related. Validate health/status effects, hit feel, and menu/gameplay
transitions before keeping.

## Do Not Add / Do Not Re-Recommend

| Candidate | Decision |
| --- | --- |
| `r_citadel_gpu_culling` / `r_citadel_gpu_culling_two_pass` | Current defaults are already `true`; OptimizationLock also conflicts by forcing `two_pass 0` in Kaizu. Do not force unless a controlled benchmark proves a win. |
| `r_farz`, `r_mapextents`, `sc_fade_distance_scale_override`, `sc_screen_size_lod_scale_override` | Already applied aggressively or known to affect buildings, boxes, trooper healthbars, model holes, and blast vent visibility per OptimizationLock FAQ. |
| `r_drawdecals "0"` | Already applied locally, but high readability risk. OptimizationLock FAQ says disabling it can hide Lash ground slam. Do not make more aggressive. |
| `citadel_portrait_world_renderer_off "true"` | OptimizationLock/Kaizu use it, but current local keeps `0`. The FAQ says this can hide shop/end-screen heroes. Low performance priority. |
| `cl_disable_ragdolls "1"` / more aggressive ragdoll disable | OptimizationLock FAQ says Doorman ult indicator can break with ragdoll limits. Keep conservative. |
| `thread_pool_option` | Still hidden and weakly documented. OptimizationLock/Kaizu comments conflict. Leave at default unless reverse-engineered or benchmarked in isolation. |
| Network comments such as `cl_interp`, `cl_interp_ratio`, `cl_smoothtime` | Local config already has low-latency networking. OptimizationLock itself says not to mess with network commands yet. Do not change without packet/server validation. |
| Command-list entries from `commands.txt` | No persistent config command stood out. Use command-list items for measurement/profiling, not as `gameinfo.gi` tuning. |

## Stale / Not In Current SteamTracking Dump

The live `gameinfo.gi` contains 42 perf-like assignments whose names were not
found in the current SteamTracking `convars.txt` or `commands.txt`. These are
likely stale, renamed, hidden outside the dump, or harmless no-ops. They are not
new optimization targets.

Highest-signal examples:

| Current line | Name | Current value | Note |
| --- | --- | --- | --- |
| 632 | `r_particle_max_size_cull` | `1600` | Current dump does not list it. Do not keep tuning this as if it were confirmed-current. |
| 679 | `sc_disable_shadow_materials` | `1` | Earlier validation already flagged this as invalid. Still absent from current dump. |
| 796 | `r_drawmodeldecals` | `0` | Comment already says it does not exist in master convar. |
| 865-880 | Several `r_particle_*` entries | mixed | Many particle commands in the live config are absent from current SteamTracking. Treat as stale/no-op unless verified in VConsole. |
| 1065-1074 | Several `snd_steamaudio_*` entries | mixed | Some Steam Audio names are absent from the current dump despite being in stock-looking config areas. Verify before tuning further. |

Config hygiene idea: keep a separate cleanup pass for stale/no-op entries, but
do not remove them during performance testing unless VConsole confirms they are
unknown and removal does not change behavior.

## OptimizationLock Verdict

OptimizationLock is worth using as a candidate corpus and sanity check, not as a
wholesale replacement. The current live `gameinfo.gi` is already heavily derived
from that ecosystem, including its `rate` block and many comments. Boot/Kaizu
variants are valuable for finding aggressive test ideas, but their own README
and inline comments document real visibility breakage.

## Cross-Game Semantics Pass

Follow-up requested on 2026-05-10: for the commands with uncertain semantics,
search the web for same or similar commands in other games and use that to
understand what they likely do.

Extra sources used:

- https://cs2.poggu.me/dumped-data/convar-list/
- https://www.source2.wiki/Convars
- https://dota2.fandom.com/wiki/List_of_Console_Commands

### Texture Streaming / Budget Commands

| Command | Cross-game evidence | Meaning inferred | Deadlock decision |
| --- | --- | --- | --- |
| `r_use_memory_budget_model` | CS2 Docs and Source2 Wiki both describe this as using a GPU-memory-use model instead of querying the OS. | Changes how Source 2 estimates available GPU memory for dynamic texture budgeting. It is probably about budget stability and texture-pool decisions, not raw FPS by itself. | Still worth a controlled test because the live file has aggressive texture pool settings and no longer contains this line. |
| `r_texture_pool_increase_rate` | CS2 Docs and Source2 Wiki both describe it as the MB/s rate used to increase the texture pool when under budget. | Counterpart to `r_texture_pool_reduce_rate`. Higher values let the pool recover faster after pressure/eviction. | Test `128` only with texture pop-in and 1% lows watched. It may fight the current tiny `r_texture_pool_size "256"` strategy. |
| `r_texture_stream_throttle_count_over_budget` | CS2 Docs and Source2 Wiki list it next to `r_texture_stream_throttle_amount`, `r_texture_stream_throttle_count`, and `r_texture_streamout_unthrottle_ms`, but provide no description. Dota lists the older throttle amount/count pair but not this over-budget variant. | Likely a special, stricter texture-stream operation count used while the texture pool is over budget. Default `1` suggests "do less streaming work when over budget." Setting `0` is ambiguous: it may disable over-budget work or disable the extra throttle. | Lower confidence than before. Do not add until tested alone; use only if texture streaming is the active problem. Revert immediately on more pop-in or stream stalls. |

### Particle Commands

| Command | Cross-game evidence | Meaning inferred | Deadlock decision |
| --- | --- | --- | --- |
| `r_late_particle_job_sync` | CS2 Docs and Source2 Wiki list it as a Source 2 convar, default `false`, but with no description. It sits beside particle job/duration controls. | Probably moves the wait/join point for particle jobs later in the frame to expose more CPU parallelism. This can help if the render/client thread is blocking early on particle jobs, but it can also shift effect timing. | Keep as a particle-heavy A/B test only. Validate ult readability, projectile/effect timing, and fights with many effects. |
| `r_threaded_particles` | CS2 Docs and Source2 Wiki list it with default `true`; Dota command lists also show it enabled. | Enables threaded particle work. Other Source 2 games consider this normal, but Deadlock's current dump reports default `false`/reference, so Deadlock may have game-specific reasons. | Worth testing, but not a safe default change. Test beside `r_late_particle_job_sync`, then separately if the result is unclear. |
| `r_threaded_particle_creation` | Source2 Wiki lists this with default `true`; Deadlock current config does not use it. | Likely moves particle creation/setup work to a thread, separate from particle simulation/update. | Add to the same experimental bucket as `r_threaded_particles`; do not apply without visual validation. |
| `r_particle_max_size_cull` | Not present in the current Deadlock dump, but CS2 Docs and Source2 Wiki describe it: particle systems larger than this in every dimension skip culling to save CPU and are drawn anyway. | Important correction: smaller values make more large effects skip culling and draw anyway; larger values make fewer huge effects skip culling. `0` effectively means very large effects will always draw, which protects ult readability but can cost GPU. | Treat current live line as stale/unconfirmed for Deadlock. Verify in VConsole before tuning; do not use it as a fresh optimization candidate from SteamTracking. |
| `r_draw_particle_children_with_parents` / `r_drawparticles` | Current Deadlock dump does not list them, but CS2/Source2 lists them. `r_drawparticles` is the broad particle-render toggle; `r_draw_particle_children_with_parents` controls child particles with `-1` meaning use gameinfo. | These are visibility toggles, not subtle optimizers. | Do not change for competitive play. Disabling particles can hide gameplay-critical effects. |

### Physics / Status / Threading Commands

| Command | Cross-game evidence | Meaning inferred | Deadlock decision |
| --- | --- | --- | --- |
| `phys_batch_ray_test` | CS2 Docs and Source2 Wiki list it near physics debug/ray/trace controls, default `0`, no description. | Likely toggles a batched physics ray-test path. Because ray tests are used for traces/collision/visibility, bad behavior could affect hit feel or collision edge cases. | Do not add blind. If tested, isolate in a bot match and check movement, hit registration feel, and ability traces. |
| `parallel_perform_invalidate_physics` | No useful same-name CS2/Dota/Source2 public match found. Deadlock dump says it is developmentonly, gamedll/clientdll, replicated. | Name implies parallelizing a physics invalidation pass: marking/rebuilding physics state after transforms, attachments, or entity changes. Replicated flags make this risky for client-only tuning. | Remove from the main "worth testing" list unless you are explicitly doing a risky physics experiment. |
| `cl_modifier_parallel_gather_status_effect_updates` | No useful same-name public cross-game match found. The `modifier` naming matches Valve MOBA-style gameplay modifiers/status effects, but this exact convar appears Deadlock-specific. | Likely parallelizes gathering status-effect updates for client-side modifier/UI/effect state. This could touch buff/debuff indicators, status bars, and modifier-driven visuals. | Do not add blind. Only test if status-effect update cost is measured, and validate buffs/debuffs/HUD indicators carefully. |
| `thread_pool_option` | CS2 Docs and current Deadlock dump list it only as hidden release with default `-1` and "Thread pool option"; no reliable public value mapping found. Web tuning guides make claims, but they are not grounded enough. | It selects an engine thread-pool policy, but values are not publicly mapped. Wrong values can hurt CPU scheduling or worsen stutter. | Leave at default. Only revisit with reverse engineering or a strict timedemo-style benchmark matrix. |

### Revised Ranking After Cross-Game Search

| Rank | Candidate | Status |
| --- | --- | --- |
| 1 | `r_use_memory_budget_model "1"` + `r_texture_pool_increase_rate "128"` | Best controlled test. Semantics are documented across Source 2/CS2. |
| 2 | `r_late_particle_job_sync "1"` + `r_threaded_particles "1"` | Plausible particle-heavy test. Cross-game defaults support threading, but Deadlock may differ. |
| 3 | `r_texture_stream_throttle_count_over_budget "0"` | Keep speculative. Same-name exists across Source 2/CS2, but value meaning is unclear. |
| 4 | `phys_batch_ray_test "16"` | Risky physics trace experiment, not a default FPS setting. |
| 5 | `cl_modifier_parallel_gather_status_effect_updates` / `parallel_perform_invalidate_physics` | Deadlock-specific or no cross-game evidence. Do not apply without measured need. |
| 6 | `thread_pool_option` | Leave default. Public value claims are too weak. |

Best path from here:

1. A/B the two texture-budget lines first.
2. A/B `r_texture_stream_throttle_count_over_budget "0"` only if texture
   streaming still hitches.
3. A/B particle job settings in ability-heavy fights.
4. Treat parallel physics/status-effect settings as experimental and revert on
   any gameplay or UI oddity.
5. Run a separate stale-command validation pass in VConsole before cleaning
   old no-op entries.

## Performance Update: User-Best Active Set

Follow-up after live testing on 2026-05-10: the user reported the best result
from ranks 1, 2, 3, and 6, with 1% lows increasing after the thread-pool test.

Current live `gameinfo.gi` verification:

| Live line | Command | Current value | Test source |
| --- | --- | --- | --- |
| 600 | `thread_pool_option` | `4` | Rank 6 / thread-pool test |
| 621 | `r_use_memory_budget_model` | `1` | Rank 1 |
| 622 | `r_texture_pool_increase_rate` | `128` | Rank 1 |
| 623 | `r_texture_stream_throttle_count_over_budget` | `0` | Rank 3 |
| 875 | `r_late_particle_job_sync` | `1` | Rank 2 |
| 876 | `r_threaded_particles` | `1` | Rank 2 |

Interpretation:

- Keep `thread_pool_option "4"` as the Ryzen 7 5700X baseline. It has a
  local, user-observed 1% low gain. Public Source 2 dumps still do not explain
  the numeric values, so this result is stronger than generic community claims.
- Keep `r_texture_pool_increase_rate "128"`. Current Source 2/CS2 dumps list
  default `64`, so `128` is a moderate 2x recovery rate rather than an extreme
  jump. There is no stronger evidence for going above `128` yet.
- Keep `r_texture_stream_throttle_count_over_budget "0"` as an active test.
  Current dumps list default `1`; Kaizu's minimum-spec OptimizationLock variant
  is the useful external source for `0`. Because it is still poorly documented,
  revert only if texture pop-in, stalls, or frametime spikes get worse.
- Keep the rank 2 particle pair only if ability-heavy fights have no missing,
  late, or unreadable effects.

## Second Due-Diligence Pass: Number Tuning

Sources checked again:

- Current SteamTracking Deadlock `DumpSource2/convars.txt`
- CS2 Docs convar dump
- Source2 Wiki convar table
- Sqooky/OptimizationLock variants: default, Boot maximum FPS, Kaizu minimum
  spec, and test config

Findings:

| Candidate | Evidence | Decision |
| --- | --- | --- |
| `thread_pool_option "4"` | User observed better 1% lows on Ryzen 7 5700X. CS2 community posts mention `4` as automatic, while official/public dumps only expose default `-1`. | Keep. This is the best current baseline. |
| `thread_pool_option "6"` | Kaizu only has `//thread_pool_option "6"` commented out; no official mapping confirms it is better. | Do not switch yet. Test later only by changing this one value from `4` to `6`. |
| `r_texture_pool_increase_rate "128"` | Source 2 default is `64`; current test uses 2x. No OptimizationLock variant found a stronger value. | Keep `128`; do not raise blind. |
| `r_texture_pool_size "256"` | Boot maximum-FPS config uses `256`; Kaizu says `512-1024` can be adjusted for VRAM/pop-in. | Keep `256` for max FPS. Optional A/B `512` only if texture streaming hitches or pop-in becomes the limiting issue. |
| `r_texture_stream_mip_bias "8"` | Boot maximum-FPS config uses `8`; Kaizu uses `4`; current local config prioritizes FPS over texture clarity. | Keep `8` for the current goal. Lower only for visibility/clarity, not FPS. |
| `r_texture_stream_throttle_count_over_budget "0"` | Default is `1`; Kaizu uses `0`; user included rank 3 in the best set. | Keep as part of the active user-best set. |
| `r_late_particle_job_sync "1"` + `r_threaded_particles "1"` | OptimizationLock and Kaizu both support these as particle/threading candidates; current Deadlock dump lists `r_threaded_particles` as reference-default false. | Keep only if no particle readability regressions appear. |

No live number change is justified by the second pass. The current best-known
baseline is the active set above. The next valid A/B ladder is:

```text
// Only change one line per run.
thread_pool_option "4" -> "6"

// Only if texture hitches/pop-in remain the problem.
r_texture_pool_size "256" -> "512"

// Only if particle readability breaks.
r_late_particle_job_sync "1" -> remove/comment
r_threaded_particles "1" -> remove/comment
```

Do not test `thread_pool_option "6"` and `r_texture_pool_size "512"` in the same
run; that would hide which change helped or hurt 1% lows.

## Latest SteamTracking New-Convar Sweep

Follow-up requested after the user-best set: refresh the latest SteamTracking
`DumpSource2` again, search for missing performance-related convars, and only
change live numbers/settings if the evidence is better than the current
baseline.

Inputs checked:

- Latest `https://github.com/SteamTracking/GameTracking-Deadlock/tree/master/DumpSource2`
- Raw current `DumpSource2/convars.txt` from SteamTracking
- Current live `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\gameinfo.gi`
- CS2 Docs / Source2 Wiki for same-name Source 2 behavior
- Sqooky/OptimizationLock variants again

Current best baseline before this sweep:

```text
thread_pool_option                          "4"
r_use_memory_budget_model                   "1"
r_texture_pool_increase_rate                "128"
r_texture_stream_throttle_count_over_budget "0"
r_late_particle_job_sync                    "1"
r_threaded_particles                        "1"
```

The SteamTracking parse found 4,417 convar names in the current dump. After
filtering missing names by performance keywords and excluding debug/profile/cheat
noise, the highest-signal missing candidates were mostly already-good defaults,
physics-risk knobs, or experimental GPU flush knobs.

### One New Live Test Added

```text
// Particle creation threading test.
// Added 2026-05-10 after the latest SteamTracking sweep.
"r_threaded_particle_creation" "1"
```

Why this one: it directly complements the particle-threading pair that already
tested well. Current Deadlock SteamTracking lists `r_threaded_particle_creation`
as `false (reference)`, while Source 2/CS2 public convar tables list the same
name enabled. Risk is limited to particle spawn timing/readability, so it belongs
next to the rank 2 particle test rather than in the permanent block.

Live placement after apply:

```text
//test
r_late_particle_job_sync                    "1"
r_threaded_particle_creation                "1"
r_threaded_particles                        "1"
```

Validate in ability-heavy fights. If any effect appears late, missing, blocky,
or less readable, remove only `r_threaded_particle_creation "1"` first and keep
the earlier rank 2 pair for comparison.

### New Candidates Rejected / Not Worth Applying Yet

| Candidate | Current dump evidence | Decision |
| --- | --- | --- |
| `r_texture_hookup_uses_threadpool` | Default is already `true`; description says async texture hookup uses its own threadpool instead of the global pool. | Do not add. It is already the engine default. |
| `r_texture_nonstreaming_load` | Default is already `true`; description says it can save IO and reduce latency by immediately loading possible mips. | Do not add. Already default-beneficial. |
| `phys_step_threaded` | Default is already `true`. | Do not add. Already default-beneficial. |
| `phys_min_motion_controller_count_to_run_in_job` | Default `8`; job threshold, not a clear FPS win. | Do not tune blind. Physics behavior risk is higher than expected gain. |
| `phys_batch_ray_test` | Default `0`; same-name exists in Source2/CS2 but has no useful public description. | Still reject for blind use. Ray/trace behavior is gameplay-risky. |
| `r_pipeline_stats_flush_before_sleeping` | Dump description says it is experimental and flushes GPU pipeline before render thread sleep. | Reject for FPS. GPU flushes are more likely to hurt throughput unless diagnosing latency. |
| `r_pipeline_stats_command_flush` / `r_pipeline_stats_present_flush` | Experimental full GPU pipeline flushes. | Reject. Not an optimization setting for normal play. |
| `r_texture_eager_eviction` | Default `false`; no stronger public description. | Reject for now. Could increase texture churn/hitching with the current tiny pool. |
| `panorama_worldpanel_update_culling` | Default `false`; world-panel culling could affect in-world UI. | Reject until VConsole/manual readability testing proves it safe. |
| `animgraph_parallel_postdataupdate` | Default already `true`. | Do not add. Already default-beneficial. |

### Number Tuning Decision

No existing live number should be changed by this sweep.

Keep:

```text
thread_pool_option                          "4"
r_texture_pool_increase_rate                "128"
r_texture_pool_size                         "256"
r_texture_stream_throttle_count_over_budget "0"
```

Reasoning:

- `thread_pool_option "4"` has a local user-observed 1% low gain on Ryzen 7
  5700X. SteamTracking still does not define the value map; local measurement is
  the best evidence.
- `r_texture_pool_increase_rate "128"` is a moderate 2x over current default
  `64`. No fresh source supports going higher.
- `r_texture_pool_size "256"` matches Boot's maximum-FPS OptimizationLock
  direction. A larger pool can help pop-in but is not automatically faster.
- `r_texture_stream_throttle_count_over_budget "0"` remains backed only by
  Kaizu and the user's best-set observation, so keep it as a test, not a new
  permanent default.

Next A/B order after this sweep:

1. Test current baseline plus `r_threaded_particle_creation "1"`.
2. If better and readable, keep it.
3. If no change or worse, remove only `r_threaded_particle_creation`.
4. Only after that compare `thread_pool_option "4"` -> `"6"`.
5. Only if texture pop-in/hitching remains the main problem compare
   `r_texture_pool_size "256"` -> `"512"`.

## CPU-Bound Follow-up: Low GPU Usage

Follow-up requested on 2026-05-12: user reports the game is CPU-bound, with GPU
usage around 30-40%. This pass focuses on reducing CPU-side work rather than
adding GPU-quality cuts.

Hardware context checked:

```text
CPU: AMD Ryzen 7 5700X, 8 cores / 16 logical processors
```

Live config is already aggressive on CPU:

- `thread_pool_option "4"` is active and user-reported to improve 1% lows.
- Ragdolls are disabled: `cl_disable_ragdolls "1"`, `cl_ragdoll_limit "0"`.
- Particle CPU load is aggressively reduced: fallback base/multiplier `10`,
  sim fallback multiplier `100`, `particle_cluster_nodraw "1"`, max detail `0`,
  and the active threaded particle test.
- Client physics is heavily reduced: `cl_phys_enabled "false"`,
  `cl_simulate_dormant_entities "0"`, `cl_batch_entity_list_ops_during_latch
  "1"`, `phys_multithreading_enabled "1"`, and physics sleep enabled.
- AI/nav is already relaxed: `ai_think_interval "0.3"`,
  `ai_think_interval_lod_low "1"`, `ai_gather_conditions_async "true"`,
  `nav_pathfind_multithread "1"`.
- Panorama/UI is already capped: `panorama_max_fps "15"` and
  `panorama_max_overlay_fps "15"`.
- Audio is already async/reduced: `snd_mix_async "1"`,
  `soundsystem_update_async "1"`, Steam Audio reverb/pathing disabled.

### CPU Test Applied

```text
anim_decode_forcewritealltransforms "false"
```

Why: current live config had this set to `true`, while current Deadlock
SteamTracking and CS2 Docs both list default `false`. The convar description is
explicit: it forces `BatchAnimationDecode` to write transformations for all
bones. That is the wrong direction for a CPU-bound setup, especially when the
goal is reducing animation/bone work.

Live change:

```text
anim_decode_forcewritealltransforms         "false"
```

This is a safer CPU-relief correction than adding more unknown physics or
world-panel culling knobs, because it reverts an expensive forced animation
decode path back to the engine default.

### CPU Candidates Considered But Rejected For Now

| Candidate | Evidence | Decision |
| --- | --- | --- |
| `panorama_worldpanel_update_culling "true"` | OptimizationLock comments it out and says it messes with healthbar rendering. Current dump default is `false`. | Reject for now. Healthbars/world panels are gameplay-critical. |
| `panorama_worldpanel_update_cull_distance` / size threshold | Only useful if world-panel update culling is enabled. | Reject until culling itself is proven safe. |
| `phys_batch_ray_test "16"` | OptimizationLock uses it, but public description is weak and it touches ray/trace behavior. | Reject. Too gameplay-risky for blind CPU relief. |
| `r_update_particles_on_render_only_frames "1"` | Kaizu leaves it commented; current dump default is `false` and has no useful description. | Do not apply until particle test evidence is clearer. |
| `cloth_update "0"` | Kaizu says it can improve FPS; Piggy keeps cloth enabled for model stability. | Optional later A/B only. Visual/model stability risk. |
| `cl_fasttempentcollision` lower from `999999` | Public Source/CS2-family defaults are usually `5`; OptimizationLock/Boot/Kaizu intentionally raise it, with conflicting explanations. | Do not change yet. Mixed evidence. |
| `thread_pool_option "6"` | Still only a future comparison against measured-good `"4"`. | Do not stack with this CPU test. |
| `animgraph_parallel_postdataupdate`, `animgraph_enable_parallel_update`, `animgraph_enable_dirty_netvar_optimization`, `ai_threaded_pathfind`, `navlocal_parallel_trace_path_for_obstacle`, `phys_step_threaded` | Current SteamTracking defaults are already CPU-friendly/parallel. | Do not add. Explicit lines should not change behavior. |
| `snd_soundmixer_update_maximum_frame_rate "10"` | Source2 Wiki default is `10`, but Deadlock gameinfo examples often use `0`; meaning of `0` is not clear enough. | Do not change blind. |

### CPU A/B Order From Here

Run one test at a time:

1. Keep current set plus `anim_decode_forcewritealltransforms "false"`.
2. If CPU frametime improves and animations/readability are fine, keep it.
3. If still CPU-bound, compare only `thread_pool_option "4"` -> `"6"`.
4. If still CPU-bound after thread-pool comparison, test only
   `cloth_update "1"` -> `"0"`.
5. Avoid `panorama_worldpanel_update_culling` unless willing to manually inspect
   healthbars, world panels, status UI, and mod overlays in-game.

Do not combine `thread_pool_option "6"` and `cloth_update "0"` in the same run.
They affect different CPU buckets and need separate 1% low / frametime checks.

## CPU-Bound Missing-Only Continuation

Correction after review: if a convar is already missing from `gameinfo.gi` but
the current SteamTracking default is already the CPU-friendly setting, do not
recommend adding it. Only consider:

1. convars missing from the live file, and
2. convars where changing away from the default plausibly reduces CPU work, and
3. convars whose risk is lower than the expected CPU benefit.

Important distinction: `anim_decode_forcewritealltransforms` was not a missing
new-convar suggestion. The live file had overridden it to `true`; changing it to
`false` removed an existing expensive override and restored the current
SteamTracking default.

### Missing-Only Candidate Applied

```text
//CPU/UI test: longer damage-text batching aggregates more hits into fewer displayed entries.
citadel_damage_text_batching_window_ability    "2.0"
citadel_damage_text_batching_window_bullet     "2.0"
citadel_damage_text_batching_window_cumulative "2.0"
citadel_damage_text_batching_window_pure       "2.0"
```

Why: these four convars were not present in the live file. Current SteamTracking
defaults already batch damage text, but the defaults are tuned for readability
rather than minimum HUD churn:

```text
citadel_damage_text_batching_window_ability    1.05
citadel_damage_text_batching_window_bullet     1.5
citadel_damage_text_batching_window_cumulative 1.5
citadel_damage_text_batching_window_pure       1.05
```

Evidence strength:

- Current SteamTracking confirms all four convars exist and their current
  defaults, but it does not include descriptions for them.
- Older Deadlock command dumps describe the ability/bullet versions directly:
  damage events within the window are added into a single entry.
- A Deadlock forum thread confirms practical behavior for
  `citadel_damage_text_batching_window_ability`: setting it to `-0.1` disables
  the summing behavior and shows separate numbers instead.

So the solid conclusion is: these convars control damage-text aggregation
windows. The CPU conclusion is an inference: a longer aggregation window should
produce fewer displayed damage-text entries and less HUD churn in dense fights.
It is not documented as a guaranteed CPU optimization by Valve.

Setting all four to `2.0` is therefore only a controlled CPU/UI test. The
tradeoff is less granular and possibly delayed damage feedback.

Validation focus:

- Check fights with many bullets/troopers/effects.
- Watch 1% lows and CPU frametime.
- Revert these four lines if damage feedback feels delayed, too merged, or less
  useful.

### Missing-Only Candidates Still Rejected

| Candidate | Why not suggested/applied |
| --- | --- |
| `ai_use_visibility_cache` / `ai_use_visibility_cache_reciprocation` | Missing locally, but current SteamTracking defaults are already `1`/`true`; adding them should not improve CPU. |
| `ai_threaded_pathfind` | Missing locally, but current default is already `true`; no need to add a no-op default-good line. |
| `navlocal_parallel_trace_path_for_obstacle` | Missing locally, but current default is already `true`; no need to add it. |
| `phys_step_threaded` | Missing locally, but current default is already `true`; no need to add it. |
| `animgraph_parallel_postdataupdate` / `animgraph_enable_parallel_update` / `animgraph_enable_dirty_netvar_optimization` / `animgraph2_enable_parallel_update` | Missing locally, but current defaults are already CPU-friendly/parallel/optimized. |
| `panorama_worldpanel_update_culling "true"` | Missing locally and could reduce UI work, but OptimizationLock explicitly comments it out because it can mess with healthbar rendering. Still rejected. |
| `r_update_particles_on_render_only_frames "1"` | Missing locally and default `false`, but there is no useful public description and Kaizu leaves it commented. Keep as a later particle-only A/B candidate, not a current apply. |

Next CPU A/B order under the missing-only rule:

1. Test `anim_decode_forcewritealltransforms "false"` plus the damage-text
   batching windows.
2. If damage text feels bad, remove only the four
   `citadel_damage_text_batching_window_*` lines.
3. If CPU remains the bottleneck and damage batching is fine, test
   `thread_pool_option "4"` -> `"6"` separately.
4. Only after that, consider `r_update_particles_on_render_only_frames "1"` as
   a particle-only test.

## Worldpanel Culling Test

Follow-up: user wants to test `panorama_worldpanel_update_culling`.

Applied to live `gameinfo.gi`:

```text
//CPU/UI test: world panel update culling baseline. Watch healthbars and world-space UI.
panorama_worldpanel_update_culling             "true"
panorama_worldpanel_update_cull_distance       "3500"
panorama_worldpanel_update_cull_size_threshold "5"
```

Current SteamTracking defaults:

```text
panorama_worldpanel_update_culling             false
panorama_worldpanel_update_cull_distance       1000
panorama_worldpanel_update_cull_size_threshold 5
```

Evidence:

- SteamTracking confirms the three convars exist.
- No useful public description was found beyond the names/defaults.
- OptimizationLock keeps `panorama_worldpanel_update_culling "true"` commented
  out with a warning that it can mess with healthbar rendering.

Interpretation:

- `panorama_worldpanel_update_culling` enables the world-panel update culling
  path.
- `panorama_worldpanel_update_cull_distance` is the distance knob. Current live
  value is `3500`; SteamTracking default is `1000`. The exact aggressiveness
  direction is not documented publicly, so validate visually before tuning it
  further.
- `panorama_worldpanel_update_cull_size_threshold` is the size threshold knob.
  Higher values are likely more aggressive, but this is an inference from the
  name, not documented behavior.

Safe tuning order:

1. Test only the baseline values above.
2. If healthbars/world UI are stable and CPU frametime improves, keep baseline.
3. If baseline is stable but not strong enough, change only one distance value
   next and record whether healthbars update better or worse.
4. If distance is stable, change only size threshold after that:
   `5 -> 8`.
5. Revert immediately if unit healthbars, boss bars, trooper bars, floating
   labels, shop/world panels, or custom HUD overlays stop updating.

### Result: Rejected

User test result on 2026-05-12: healthbars stopped updating at certain long
distances even after trying a much larger cull distance. That means the problem
is not solved by raising `panorama_worldpanel_update_cull_distance`; the enabled
worldpanel update-culling path itself is unsafe for Deadlock healthbar/worldpanel
state.

Live config cleanup:

```text
// Removed from live gameinfo.gi:
panorama_worldpanel_update_culling
panorama_worldpanel_update_cull_distance
panorama_worldpanel_update_cull_size_threshold
```

Do not re-enable this for normal play. The related distance/size threshold
experiments were removed with the main toggle so they cannot be accidentally
reused.

## CPU / 1% Low Follow-up After Worldpanel Rejection

Follow-up on 2026-05-13: user asked to remove
`panorama_worldpanel_update_culling` and similar commands, then continue looking
for CPU-side 1% low candidates.

Verified removed from live config:

```text
panorama_worldpanel_update_culling
panorama_worldpanel_update_cull_distance
panorama_worldpanel_update_cull_size_threshold
```

Fresh scan rules:

- Do not recommend convars already present unless the live value looks like a
  bad override.
- Do not recommend missing convars whose SteamTracking default is already the
  CPU-friendly setting.
- Exclude the `panorama_worldpanel_update_cull*` family because it broke
  long-range HP bar updates.

Applied catch-up simulation test:

```text
//CPU/1% low test: avoid extra catch-up ticks in one frame during low-FPS stalls.
engine_allow_multiple_ticks_per_frame "false"
engine_max_ticks_to_simulate         "2"
```

Evidence:

- SteamTracking describes `engine_allow_multiple_ticks_per_frame` as whether the
  client should run more than one tick per frame when catching up in low frame
  rate situations.
- SteamTracking describes `engine_max_ticks_to_simulate` as the max number of
  ticks to simulate per frame before simulation slows compared to real time.
- Sqooky's current config uses `engine_max_ticks_to_simulate "2"`.
- Live config had `engine_max_ticks_to_simulate "33"`, which is loose enough to
  allow large CPU catch-up bursts.

Tradeoff: this can improve 1% lows by reducing catch-up spikes, but if the
client falls behind badly it may slow simulation instead of catching up
immediately.

Current next A/B candidates:

| Rank | Candidate | Type | Evidence | Risk / decision |
| --- | --- | --- | --- | --- |
| 1 | `r_particle_max_size_cull "1600"` -> `"1200"` or `"999"` | number tweak | Lower values skip CPU culling for more very large particle systems, trading more GPU draw for less CPU culling. Sqooky uses `999`. | Test-only. Watch GPU usage and ult readability. |
| 2 | `cl_fasttempentcollision "999999"` -> `"1000"` | existing convar value | Live value is extreme; Sqooky uses `1000`, while current SteamTracking default is `5`. | Test `1000` first, not `5`; temp-entity collision behavior is unclear. |
| 3 | `snd_occlusion_rays "0"` | missing convar | Missing locally; current dump default is `4`; complements existing `snd_occlusion_bounces "0"`. | Audio occlusion quality risk. Test only if audio CPU still spikes. |
| 4 | `r_update_particles_on_render_only_frames "1"` | missing convar | Missing locally and default is `false`; name suggests fewer particle updates on render-only frames. | Weak docs. Particle readability/timing risk. |
| reject | `cloth_update "0"` | existing convar value | Can reduce cloth CPU work, but user explicitly wants cloth. | Do not apply. Keep `cloth_update "1"`. |
| reject | `thread_pool_option "4"` -> `"-1"` | number tweak | Subagent suggested default A/B, but user-measured `4` already improved 1% lows. | Do not change unless current result regresses. |

The spawned read-only research agent returned and agreed to reject
`panorama_worldpanel_update_culling`. Its strongest additional point was that
`engine_max_ticks_to_simulate "33"` should be tightened to Sqooky's `"2"` for
1% lows, which is now applied.

## PerfView ETW Trace - 2026-05-13

Input trace:

```text
G:\PerfViewData.etl.zip
```

Valve setup check:

- The capture matched Valve's Source 2 PerfView guidance in the important ways:
  machine-wide trace, zip+merge, Thread Time, CPU Samples, and Valve providers
  `*Valve.SteamNetworkingSockets,*Valve.Source,*Valve.Source.Net,*Valve.Source.Client,*Valve.Source.Input,*Valve.Source.Render`.
- Valve's guide says this capture type is best for stutters, hitches, and net
  jitter, not for proving small average-FPS differences.
- Valve also recommends default convars/no autoexec for a submission trace. This
  trace is still useful for our tuned-config A/B work, but it is not a clean
  Valve-support baseline because the game launched with many custom launch
  options and `+exec auto.cfg`.

Trace summary:

```text
Trace window: 2026-05-13 11:24:34 to 11:25:22
Duration:     48.70s
Game PID:     8428
Game image:   launcher.exe
Game CPU:     114,922ms total, about 2.36 CPU cores average
Frame events: 11,025 FrameAccumulateTime events
```

Frame timing from `FrameAccumulateTime`:

| Window | Count | Avg ms | P50 | P95 | P99 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| All | 11025 | 3.92 | 3.46 | 5.45 | 6.73 | 100.00 |
| After first 5s | 10713 | 3.82 | 3.44 | 5.43 | 6.25 | 17.72 |
| 5s to 40s | 9323 | 3.75 | 3.45 | 5.42 | 5.83 | 9.39 |
| After 40s | 1390 | 4.29 | 3.42 | 6.28 | 16.83 | 17.72 |

Interpretation:

- The first 5 seconds contain the worst spike noise: 10 frames hit the 100ms
  capped `FrameTime`, with one `UnfilteredFrameTime` at 1208.8ms. Treat those
  as capture-start/map/setup noise unless the stutter happened exactly there.
- The clean middle window, 5s to 40s, is very strong: P99 5.83ms and max 9.39ms.
- The last seconds show repeated 17ms frames, likely trace-stop/end-window or
  focus/collection disturbance. Do not overfit convars to only the final 3-4s.

Simulation catch-up evidence:

```text
SimulationTicks distribution:
0 ticks: 8319 frames
1 tick:  2692 frames
2 ticks: 14 frames

ClientCommandTicks distribution:
0 ticks: 10949 frames
1 tick:  66 frames
2 ticks: 10 frames
```

This supports keeping the already-applied catch-up cap:

```text
engine_allow_multiple_ticks_per_frame "false"
engine_max_ticks_to_simulate         "2"
```

The trace still had 14 two-simulation-tick frames, but no frames above 2, which
is exactly the intended bound of the current test.

Top game CPU threads:

| Thread | CPU ms | Notes |
| --- | ---: | --- |
| MainThrd | 22541 | Main game thread; hot in `client`, `panorama`, `server`, `vphysics2`, `rendersystemdx11`. |
| unnamed AMD/driver thread | 12867 | Mostly `amdxx64` and kernel. |
| D3D11RenderThread | 11946 | Mostly `amdxx64`, `d3d11`, `rendersystemdx11`. |
| GlobPool/0-6 plus one unnamed worker | ~8000 each | Hot in `scenesystem`, `rendersystemdx11`, `materialsystem2`, `particles`, `client`, `panorama`. |
| AudioMixer | 729 | Too small to prioritize audio before render/scene/particle work. |

Top exclusive sampled modules in the game process:

| Module | Samples |
| --- | ---: |
| `ntoskrnl` | 23426 |
| `amdxx64` | 17840 |
| `rendersystemdx11` | 10352 |
| `client` | 9184 |
| `tier0` | 9105 |
| `scenesystem` | 8579 |
| `materialsystem2` | 6574 |
| `particles` | 5295 |
| `panorama` | 5207 |
| `d3d11` | 3155 |
| `vphysics2` | 2593 |
| `server` | 2290 |
| `animationsystem` | 2081 |
| `soundsystem` | 1531 |
| `networksystem` | 1372 |

Present/render duration summary:

| Task | Count | Avg ms | P95 | P99 | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| `ClientFrameSimulate` | 11024 | 0.48 | 1.04 | 1.15 | 1.63 |
| `ServerSimulate` | 5528 | 0.89 | 1.91 | 2.07 | 3.65 |
| `Present_IDXGISwapChain` | 11025 | 1.27 | 1.63 | 1.80 | 21.75 |
| `Present_Dx11Thread` | 11024 | 1.35 | 1.74 | 1.91 | 21.83 |
| `Present_Wait` | 11025 | 0.22 | 0.03 | 0.17 | 290.76 |
| `ForceHardwareSync` | 11026 | 0.00 | 0.00 | 0.00 | 0.01 |

Decision from ETW:

- The trace is not pointing at audio first; `AudioMixer` is small compared with
  main/render/worker CPU.
- The trace is not pointing at `panorama_worldpanel_update_culling`; that path
  already broke HP bars and stays rejected.
- The best next CPU-side A/B is particle/scene/render worker work because
  `particles`, `scenesystem`, `materialsystem2`, and `rendersystemdx11` appear
  heavily across the global worker pool, while user-reported GPU usage still has
  headroom.

Applied after ETW:

```text
r_particle_max_size_cull "999"
```

Reasoning:

- Public CS2/Source2-family convar references describe
  `r_particle_max_size_cull` as: particle systems larger than this in every
  dimension skip culling to save CPU, and are drawn anyway.
- Current live value was `1600`, above the current public default `1200`. That
  means fewer large particle systems skip CPU culling.
- Lowering to `999` follows Sqooky's tested value and spends some GPU headroom
  to reduce CPU culling work. This is a test value, not a permanent proof.

Next A/B order after this trace:

1. Test only `r_particle_max_size_cull "999"` with the current thread/tick set.
   Watch 1% lows, GPU usage, and whether big ult/effect visibility remains sane.
2. If GPU usage jumps too high or effects feel visually wrong, step back to
   `r_particle_max_size_cull "1200"` instead of reverting all the way to `1600`.
3. If CPU is still the wall after the particle test, next candidate is
   `cl_fasttempentcollision "999999"` -> `"1000"`, because the current value is
   extreme and the trace still shows `vphysics2` on the main thread.
4. Deprioritize `snd_occlusion_rays "0"` for now; audio is not a top bucket in
   this trace.
5. Keep `cloth_update "1"` because user explicitly wants cloth.

## PerfView ETW Trace - 2026-05-13 Run 2

Input trace:

```text
G:\PerfViewData.etl.zip
```

This is a new trace, not the first ETW file:

```text
Zip timestamp: 2026-05-13 11:47:55
ETL size:      192,202,266 bytes
Trace window:  2026-05-13 11:46:36 to 11:47:45
Duration:      68.84s
Events lost:   0
Game PID:      8
Game image:    launcher.exe
Game CPU:      113,367ms total, about 1.65 CPU cores average
Frame events:  15,925 FrameAccumulateTime events
```

The game was still launched through the tuned/custom setup, so this remains an
A/B tuning trace rather than a clean Valve-support trace.

Frame timing:

| Window | Count | Avg ms | P50 | P95 | P99 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| All | 15925 | 4.13 | 3.79 | 5.61 | 16.59 | 93.00 |
| After first 5s | 15208 | 4.02 | 3.77 | 5.55 | 15.69 | 17.76 |
| 5s to 40s | 9099 | 3.85 | 3.66 | 5.50 | 5.94 | 10.09 |
| After 40s | 6109 | 4.27 | 3.94 | 5.63 | 16.67 | 17.76 |

Five-second bins:

| Bin sec | Count | Avg ms | P95 | P99 | Max | SimTicks=2 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 717 | 6.49 | 17.36 | 23.83 | 93.00 | 15 |
| 5 | 1403 | 3.57 | 5.78 | 6.22 | 7.52 | 0 |
| 10 | 1252 | 3.99 | 5.52 | 5.75 | 6.62 | 0 |
| 15 | 1306 | 3.83 | 5.37 | 5.60 | 6.18 | 0 |
| 20 | 1322 | 3.78 | 5.32 | 5.66 | 6.05 | 0 |
| 25 | 1290 | 3.88 | 5.39 | 6.36 | 10.08 | 0 |
| 30 | 1252 | 3.99 | 5.58 | 5.97 | 7.37 | 0 |
| 35 | 1274 | 3.92 | 5.47 | 5.79 | 7.52 | 0 |
| 40 | 1239 | 4.04 | 5.64 | 5.88 | 7.44 | 0 |
| 45 | 1262 | 3.96 | 5.49 | 5.65 | 5.90 | 0 |
| 50 | 1253 | 3.99 | 5.56 | 5.81 | 6.10 | 0 |
| 55 | 1300 | 3.85 | 5.39 | 5.60 | 6.87 | 0 |
| 60 | 991 | 5.04 | 16.66 | 16.95 | 17.76 | 6 |
| 65 | 64 | 16.61 | 17.29 | 17.49 | 17.53 | 4 |

Interpretation:

- The clean middle gameplay window stayed healthy. Run 2's `5s to 40s` P99 was
  `5.94ms`, very close to run 1's `5.83ms`.
- The first bin still contains capture/startup noise, and the final 60s+ bins
  again look like trace-stop/end-window disturbance. Do not tune around those
  end bins unless the stutter was manually observed there.
- The `engine_max_ticks_to_simulate "2"` cap is still behaving as intended:
  there were no frames above 2 simulation ticks.

Simulation catch-up:

```text
SimulationTicks:
0 ticks: 11750 frames
1 tick:   4150 frames
2 ticks:    25 frames

ClientCommandTicks:
0 ticks: 15800 frames
1 tick:   115 frames
2 ticks:   10 frames
```

Thread and module profile:

| Thread | CPU ms | Notes |
| --- | ---: | --- |
| MainThrd | 22254 | Similar to run 1. |
| unnamed AMD/driver thread | 12980 | Similar to run 1. |
| D3D11RenderThread | 11766 | Similar to run 1. |
| GlobPool workers | ~7866-8070 each | Still main worker pool cost. |
| AudioMixer | 734 | Still not a priority target. |

Top exclusive sampled modules:

| Module | Run 2 samples | Run 1 samples | Direction |
| --- | ---: | ---: | --- |
| `ntoskrnl` | 22726 | 23426 | slightly lower |
| `amdxx64` | 18157 | 17840 | similar |
| `rendersystemdx11` | 10261 | 10352 | similar |
| `client` | 8930 | 9184 | slightly lower |
| `tier0` | 8896 | 9105 | slightly lower |
| `scenesystem` | 8756 | 8579 | similar |
| `materialsystem2` | 6720 | 6574 | similar |
| `particles` | 5280 | 5295 | similar absolute samples |
| `panorama` | 5110 | 5207 | slightly lower |
| `vphysics2` | 2353 | 2593 | lower |
| `soundsystem` | 1413 | 1531 | lower |

Because run 2 is longer but has nearly the same absolute CPU sample counts, the
per-second CPU pressure is lower than run 1. That is consistent with, but does
not prove, `r_particle_max_size_cull "999"` being a useful keep-test value.

Run 1 vs run 2:

| Metric | Run 1 | Run 2 | Read |
| --- | ---: | ---: | --- |
| Duration | 48.70s | 68.84s | run 2 longer |
| Game CPU total | 114,922ms | 113,367ms | similar total over longer time |
| Avg game CPU cores | ~2.36 | ~1.65 | lower in run 2 |
| Frame events / sec | ~226.4 | ~231.4 | slightly higher in run 2 |
| Clean 5s-40s P99 | 5.83ms | 5.94ms | basically flat |
| Clean 5s-40s max | 9.39ms | 10.09ms | basically flat |
| Present_Wait avg | 0.22ms | 0.01ms | lower in run 2 |
| AudioMixer CPU | 729ms over 48.7s | 734ms over 68.8s | lower per second in run 2 |

Decision after run 2:

- Keep `r_particle_max_size_cull "999"` for the next playtest. It did not create
  an obvious trace-level regression and may have reduced CPU pressure per
  second.
- Do not add `snd_occlusion_rays "0"` yet. Audio stayed small.
- Do not change `cloth_update`; keep cloth enabled.
- Do not re-enable worldpanel update culling.
- If the next manual playtest still has CPU-limited 1% lows, the next isolated
  A/B candidate remains:

```text
cl_fasttempentcollision "999999" -> "1000"
```

## 2026-05-14 Multi-Command Wave Discovery

Correction: do not use the earlier AI LOD idea. `ai_lod_auto_enabled` and
`ai_think_interval_lod_med` are `gamedll`/server-side candidates, so they are
not suitable for the client `gameinfo.gi` test path.

All waves below avoid prior rejects, already-active commands, worldpanel
culling, `cloth_update "0"`, and default-good no-op settings.

### M01 - Panorama/UI CPU Wave

```text
// M01: Panorama/UI CPU test
panorama_enable_secondary_layout_pass   "0"
panorama_disable_descendant_filtering   "true"
panorama_disable_draw_text_shadow       "1"
```

Revert:

```text
panorama_enable_secondary_layout_pass   "true"
panorama_disable_descendant_filtering   "false"
panorama_disable_draw_text_shadow       "false"
```

Watch `panorama`, `MainThrd`, HUD/shop/minimap/healthbar correctness. Do not add
worldpanel culling to this wave.

### M02 - Audio Occlusion/Mixer Wave

```text
// M02: Audio CPU test
snd_occlusion_rays                      "0"
snd_soundmixer_version                  "1"
snd_disable_mixer_duck                  "1"
```

Revert:

```text
snd_occlusion_rays                      "4"
snd_soundmixer_version                  "2"
snd_disable_mixer_duck                  "false"
```

Live config already has `snd_occlusion_bounces "0"`,
`snd_steamaudio_enable_reverb "0"`, and `snd_use_baked_occlusion "1"`, so those
are not repeated. Watch `AudioMixer`, `soundsystem`, positional audio, and wall
occlusion.

### M03 - Client Animation/Physics Wave

```text
// M03: client animation/physics service test
ik_enable                               "0"
cl_phys_animated_hierarchy              "false"
phys_continuous_kinematic_update        "0"
```

Revert:

```text
ik_enable                               "true"
cl_phys_animated_hierarchy              "true"
phys_continuous_kinematic_update        "1"
```

Watch `vphysics2`, `animationsystem`, `client`, foot/hand placement, ragdoll or
hero animation weirdness.

### M04 - Physics Trace Batching + Camera Wave

```text
// M04: physics trace batching + camera smoothing test
phys_batch_ray_test                     "16"
citadel_camera_parrot_smoothing_rate    "0"
citadel_camera_hard_trace_radius        "32"
```

Revert:

```text
phys_batch_ray_test                     "0"
citadel_camera_parrot_smoothing_rate    "60"
citadel_camera_hard_trace_radius        "16"
```

Watch `vphysics2`, `client`, camera feel near walls, and collision/camera
occlusion behavior.

### M05 - Shadow/Light Visual-Risk Wave

```text
// M05: shadow/light render-thread visual-risk test
lb_shadow_texture_width_override        "16"
lb_shadow_texture_height_override       "16"
mat_depthbias_shadowmap                 "0"
mat_slopescaledepthbias_shadowmap       "0"
```

Revert:

```text
lb_shadow_texture_width_override        "-1"
lb_shadow_texture_height_override       "-1"
mat_depthbias_shadowmap                 "0.0005"
mat_slopescaledepthbias_shadowmap       "4"
```

This is more render-thread/GPU-facing than pure CPU, but it is client-side and
not already active. Watch `rendersystemdx11`, `materialsystem2`, shadow acne,
missing/ugly shadows, and visibility/readability.

### M06 - Panorama Cache Wave

```text
// M06: Panorama cache/service test
panorama_comp_layer_lru_lifetime             "2"
panorama_min_comp_layer_cache_cost           "2048"
panorama_render_target_cache_max_size        "67108864"
panorama_cache_command_list_size_threshold   "256"
```

Revert:

```text
panorama_comp_layer_lru_lifetime             "1"
panorama_min_comp_layer_cache_cost           "4096"
panorama_render_target_cache_max_size        "31457280"
panorama_cache_command_list_size_threshold   "384"
```

Watch `panorama`, `rendersystemdx11`, UI repaint correctness, memory use, and
frame P95/P99. Risk is stale/late UI repaint or higher UI cache memory.

### M07 - Panorama Paint-Prune Wave

```text
// M07: Panorama paint prune test
panorama_disable_draw_text_shadow                    "true"
panorama_max_text_shadow_strength                    "0"
panorama_skip_composition_layer_content_paint_tint   "true"
panorama_disallow_hover_styles                       "true"
```

Revert:

```text
panorama_disable_draw_text_shadow                    "false"
panorama_max_text_shadow_strength                    "10"
panorama_skip_composition_layer_content_paint_tint   "false"
panorama_disallow_hover_styles                       "false"
```

Watch `panorama`, text readability, hover/menu behavior, shop, minimap, and
ability HUD.

### M08 - Audio Pathing/Occlusion Wave

```text
// M08: sharper audio pathing/occlusion test
snd_occlusion_rays                         "0"
snd_occlusion_min_wall_thickness           "8"
snd_occlusion_override                     "0"
snd_diffusor_simd                          "true"
snd_steamaudio_dynamicpathing_max_samples  "8"
```

Revert:

```text
snd_occlusion_rays                         "4"
snd_occlusion_min_wall_thickness           "4"
snd_occlusion_override                     "-1"
snd_diffusor_simd                          "false"
snd_steamaudio_dynamicpathing_max_samples  "16"
```

This is sharper than M02. Watch `AudioMixer`, `soundsystem`, SteamAudio stacks,
positional audio, and wall/height occlusion.

### M09 - Footlock/Status Update Wave

```text
// M09: animation footlock/status update test
animgraph_footlock_trace_ground_enabled            "false"
animgraph_footlock_auto_ledge_detection            "false"
animgraph_footlock_auto_stair_detection            "false"
animgraph_footlock_calculate_tilt                  "false"
cl_modifier_parallel_gather_status_effect_updates  "true"
```

Revert:

```text
animgraph_footlock_trace_ground_enabled            "true"
animgraph_footlock_auto_ledge_detection            "true"
animgraph_footlock_auto_stair_detection            "true"
animgraph_footlock_calculate_tilt                  "true"
cl_modifier_parallel_gather_status_effect_updates  "false"
```

Watch `animationsystem`, `client`, `vphysics2`, foot placement, ledges/stairs,
and movement readability.

### M10 - Visibility/Decal Service Wave

```text
// M10: visibility/decal service test
r_dopixelvisibility                         "false"
r_pixelvisibility_partial                   "false"
cl_enable_eye_occlusion                     "false"
r_impacts_decal_grazing_incidence_cutoff    "1"
r_impacts_decal_grazing_incidence_variance  "0"
```

Revert:

```text
r_dopixelvisibility                         "true"
r_pixelvisibility_partial                   "true"
cl_enable_eye_occlusion                     "true"
r_impacts_decal_grazing_incidence_cutoff    "0.55"
r_impacts_decal_grazing_incidence_variance  "0.1"
```

Watch `rendersystemdx11`, `scenesystem`, `client`, visibility-dependent effects,
eye occlusion visuals, and impact decals.

### M11 - Texture Streaming Service Wave

```text
// M11: texture streaming service test
r_texture_stream_throttle_count                  "2"
r_texture_stream_throttle_amount                 "5"
r_texture_stream_resolution_bias_update_period   "1"
r_texture_streamout_unthrottle_ms                "0.1"
```

Revert:

```text
r_texture_stream_throttle_count                  "3"
r_texture_stream_throttle_amount                 "10"
r_texture_stream_resolution_bias_update_period   "0.5"
r_texture_streamout_unthrottle_ms                "0.2"
```

Watch `resourcesystem`, `filesystem_stdio`, `rendersystemdx11`, texture pop-in,
streaming blur, disk IO, and render-thread sleeps/wakes.

### Current User Exclusions

Do not test these wave families for now:

- Panorama text shadow / paint-prune / composition-cache changes: the UI visual
  cost is not acceptable.
- Audio occlusion/mixer/pathing changes: audio clarity is gameplay-important.
- Server-only or pure `gamedll` candidates such as AI LOD.

That removes M01 text-shadow usage, M02, M06, M07, and M08 from the active queue.
Remaining test families, if still needed, are M03, M04, M05, M09, M10, and M11,
with M05/M10 kept late because they can hurt visual readability.

## 2026-05-14 Latest M-Wave ETW Parse

Input traces:

```text
G:\wave1.etl.zip
G:\wave4.etl.zip
G:\wave5.etl.zip
G:\wave6.etl.zip
```

Parsed as:

```text
fps/etw_waves_2026-05-13/results/Mwave1_2026-05-14
fps/etw_waves_2026-05-13/results/Mwave4_2026-05-14
fps/etw_waves_2026-05-13/results/Mwave5_2026-05-14
fps/etw_waves_2026-05-13/results/Mwave6_2026-05-14
```

All four traces again have `FrameEvents=0`, so P95/P99/max frametime and true
1% lows are unavailable. This is a CPU/module-only read.

CPU/module comparison against the same no-frame-event N00 demo baseline:

| Run | Avg CPU cores | Game CPU ms | MainThrd ms | D3D11RenderThread ms | particles/s | client/s | render/s | panorama/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N00 baseline | 1.418 | 250454 | 41531 | 22377 | 208.83 | 172.03 | 121.80 | 79.58 |
| wave1 latest | 1.483 | 252895 | 42143 | 22481 | 222.60 | 187.00 | 121.01 | 80.77 |
| wave4 latest | 1.448 | 248098 | 40413 | 21984 | 214.88 | 174.10 | 123.75 | 83.01 |
| wave5 latest | 1.432 | 245266 | 40233 | 22028 | 212.75 | 171.77 | 126.63 | 81.41 |
| wave6 latest | 1.439 | 245947 | 40315 | 21824 | 212.00 | 172.84 | 122.84 | 82.14 |

Decision:

- `wave1`: reject. It is worse on average CPU cores, MainThrd, particles, and
  client rate.
- `wave5`: best of this four-run batch, but not proven better than N00 because
  average CPU cores are still higher and there are no frame events.
- `wave6`: close to wave5 and has the lowest D3D11RenderThread/vphysics2 among
  this set, but it is not a clean keep without frame events.
- `wave4`: mixed; lower MainThrd than N00 but worse average CPU cores and worse
  panorama/render rates.

Cleanup done after parse: removed extracted `.etl`, `.etlx`, `LogFile.txt`, and
symbol payloads under `fps/etw_waves_2026-05-13/results`, freeing roughly
`3.63GB`. Original `G:\*.etl.zip` source captures were left intact.

## 2026-05-14 Applied C56 Test

Applied to live `gameinfo.gi`:

```text
// Visibility/Decal Service
r_dopixelvisibility                         "false"
r_pixelvisibility_partial                   "false"
cl_enable_eye_occlusion                     "false"
r_impacts_decal_grazing_incidence_cutoff    "1"
r_impacts_decal_grazing_incidence_variance  "0"

// Texture Streaming Service
r_texture_stream_throttle_count                  "2"
r_texture_stream_throttle_amount                 "5"
r_texture_stream_resolution_bias_update_period   "1"
r_texture_streamout_unthrottle_ms                "0.1"
```

Preserved:

```text
cloth_update                                "1"
r_update_particles_on_render_only_frames    "1"
```

No audio wave, AI LOD wave, or worldpanel culling was added.

## 2026-05-14 Applied C456 Addition

Added Client Anim/Footlock on top of the C56 test:

```text
animgraph_footlock_trace_ground_enabled            "false"
animgraph_footlock_auto_ledge_detection            "false"
animgraph_footlock_auto_stair_detection            "false"
animgraph_footlock_calculate_tilt                  "false"
cl_modifier_parallel_gather_status_effect_updates  "true"
```

Current stacked test is now Visibility/Decal Service + Texture Streaming Service
+ Client Anim/Footlock. Audio, AI LOD, worldpanel culling, and `cloth_update
"0"` remain excluded.

## 2026-05-14 C56 vs C456 ETW Parse

Input traces:

```text
G:\c56.etl.zip
G:\c456.etl.zip
```

Parsed as:

```text
fps/etw_waves_2026-05-13/results/C56_2026-05-14
fps/etw_waves_2026-05-13/results/C456_2026-05-14
```

Both traces still have `FrameEvents=0`, so P95/P99/max frametime and true 1%
lows are unavailable. This is a CPU/module-only read.

Comparison:

| Run | Avg CPU cores | Game CPU ms | MainThrd ms | D3D11RenderThread ms | AudioMixer ms | particles/s | client/s | render/s | scene/s | panorama/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N00 baseline | 1.418 | 250454 | 41531 | 22377 | 17605 | 208.83 | 172.03 | 121.80 | 121.29 | 79.58 |
| Mwave5 latest | 1.432 | 245266 | 40233 | 22028 | 17533 | 212.75 | 171.77 | 126.63 | 119.43 | 81.41 |
| Mwave6 latest | 1.439 | 245947 | 40315 | 21824 | 17746 | 212.00 | 172.84 | 122.84 | 120.86 | 82.14 |
| C56 | 1.356 | 241843 | 42761 | 21514 | 16692 | 197.66 | 161.42 | 113.10 | 108.34 | 74.22 |
| C456 | 1.433 | 246285 | 40134 | 22063 | 17462 | 210.77 | 173.46 | 122.12 | 120.68 | 82.29 |

Decision:

- C56 is the strongest CPU-only candidate in this no-frame-event batch. It has
  the lowest average CPU cores, lower game CPU total despite a longer run, and
  lower particles/client/render/scene/audio/panorama rates.
- C456 loses most of the C56 gain. The Client Anim/Footlock layer should be
  rejected for now unless manual feel strongly says otherwise.
- Because frame events are still missing, C56 is not yet proven as a 1% low win.
  It needs a full frame-event trace before becoming permanent.

Cleanup done after parse: removed extracted `.etl`, `.etlx`, `LogFile.txt`, and
symbol payloads under `fps/etw_waves_2026-05-13/results`, freeing roughly
`1.82GB`. Original `G:\c56.etl.zip` and `G:\c456.etl.zip` were left intact.

## 2026-05-14 C56 vs C456 Retest With Frame Events

The `G:\c56.etl.zip` and `G:\c456.etl.zip` files were replaced with newer
captures:

```text
G:\c456.etl.zip  2026-05-14 05:36:50
G:\c56.etl.zip   2026-05-14 05:40:51
```

Parsed as:

```text
fps/etw_waves_2026-05-13/results/C456_retest_2026-05-14
fps/etw_waves_2026-05-13/results/C56_retest_2026-05-14
```

These retests do contain frame events. They are not comparable to the old
`wave0/wave2` frame-event baseline because frame rate/event rate is much lower
here (`~100/s` vs `~261/s`), but C456 and C56 are comparable to each other.

Frame-window comparison:

| Run | Frame events/s | Avg CPU cores | Clean avg | Clean P95 | Clean P99 | Clean max | Late P99 | Late max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| C456 retest | 101.62 | 1.402 | 8.990 | 11.585 | 12.831 | 22.826 | 14.523 | 41.294 |
| C56 retest | 99.75 | 1.462 | 9.273 | 11.804 | 12.928 | 16.248 | 14.716 | 18.962 |

Module-rate comparison:

| Run | particles/s | client/s | render/s | scene/s | soundsystem/s | panorama/s | vphysics2/s | animationsystem/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| C456 retest | 206.64 | 170.57 | 118.47 | 117.74 | 102.64 | 78.91 | 39.16 | 18.06 |
| C56 retest | 215.77 | 180.93 | 123.16 | 123.20 | 108.37 | 82.27 | 40.02 | 19.03 |

Revised decision:

- C456 is better than C56 in the latest retest on average CPU cores, clean avg,
  clean P95, clean P99, and nearly every hot module rate.
- C56 has lower max spikes, so C456 still needs a manual feel check for rare
  hitching or footlock/animation visual issues.
- If manual visuals/feel are OK, keep C456 over C56 for the next confirm.
- If there are visible foot placement/animation issues or rare hitch complaints,
  revert the Client Anim/Footlock layer and fall back to C56.

Cleanup done after parse: removed extracted `.etl`, `.etlx`, `LogFile.txt`, and
symbol payloads under `fps/etw_waves_2026-05-13/results`, freeing roughly
`1.97GB`. Source `G:\c56.etl.zip` and `G:\c456.etl.zip` were left intact.

## ETW Wave Batch Results - 2026-05-13

Parsed:

```text
G:\wave0.etl.zip through G:\wave9.etl.zip
```

Wave 10 was skipped. Full comparison:

```text
fps/etw_wave_batch_2026-05-13/wave-analysis.md
```

Best balanced wave: `wave2`, `r_particle_max_size_cull "1600"`.

Why:

- P99 is essentially tied with baseline: `5.827ms` vs `5.823ms`.
- P95 improves: `5.338ms` vs `5.388ms`.
- Clean max improves: `9.869ms` vs `10.444ms`.
- Average game CPU cores improve: `1.105` vs `1.130`.
- Frame events/sec stays slightly higher: `261.22` vs `260.95`.
- `SimulationTicks=2` stays at `0`.

Reject from this batch:

```text
r_particle_max_size_cull "1200"
r_particle_max_size_cull "800"
thread_pool_option "6"
props_break_max_pieces_perframe "0"
r_texture_pool_size "512"
snd_ui_positional "false"
```

Retest only if needed:

```text
cl_fasttempentcollision "1000"
r_update_particles_on_render_only_frames "1"
```

Important warning: waves 6 through 9 all show lower CPU cores but also lower
frame events/sec and worse P99. That is not a win. It likely means
`thread_pool_option "6"` hurt frame production or contaminated later waves if it
was not fully removed before wave7-wave9.

Live config updated after the batch:

```text
thread_pool_option                  "4"
r_particle_max_size_cull            "1600"
cl_fasttempentcollision             "999999"
props_break_max_pieces_perframe     "0.5"
r_texture_pool_size                 "256"
snd_ui_positional                   "1"
cloth_update                        "1"
```

Removed the wave-only `r_update_particles_on_render_only_frames "1"` line from
live config.

## 2026-05-14 Missing-Convar Discovery

User asked to keep:

```text
r_update_particles_on_render_only_frames "1"
```

Live config updated to keep it as an ETW retest line:

```text
r_update_particles_on_render_only_frames "1"
```

Discovery inputs:

```text
SteamTracking GameTracking-Deadlock DumpSource2/convars.txt
SteamTracking GameTracking-Deadlock DumpSource2/commands.txt
Sqooky/OptimizationLock README
Sqooky/OptimizationLock Sqooky's .gi/gameinfo.gi
Sqooky/OptimizationLock Sqooky's .gi/base_convars.txt
Sqooky/OptimizationLock boot's maxium fps config/gameinfo.gi
Sqooky/OptimizationLock kaizuchaneru's minimum spec/gameinfo.gi
Sqooky/OptimizationLock test_cfg/gameinfo.gi
```

Current live inventory has 607 convar assignments. The discovery pass excluded:

- commands already present in live `gameinfo.gi`;
- default-good parallel/async settings that should already be active;
- `cloth_update "0"` because cloth must stay enabled;
- `panorama_worldpanel_update_cull*` because it broke long-range HP/worldpanel
  updates;
- obvious debug/profile/spew/visualization commands.

High-signal missing candidates:

| Rank | Candidate | Evidence | Risk / decision |
| ---: | --- | --- | --- |
| 1 | `r_flush_on_pooled_ib_resize "false"` | Current SteamTracking default `true`, flag `release`; Kaizu uses `false`. Could avoid a render-thread flush on pooled index-buffer resize. | Tested in N01 demo; reject for now because average CPU cores and UI/sound rates worsened. |
| 2 | `parallel_perform_invalidate_physics "true"` | Current SteamTracking default `false`; Sqooky/SqookyBase/TestCfg use `true`. Name targets physics invalidation parallelism. | Tested in N02 demo; reject for now unless a physics-specific stutter trace points at `vphysics2`. |
| 3 | `sc_aggregate_indirect_draw_compaction_threshold "1"` | Current SteamTracking default `8`, flag `release`, description: threshold of indirect draws when compaction happens. TestCfg uses `1`. | Tested in N03 demo and 2026-05-14 retest; reject for now because average CPU cores, MainThrd, particles/client/sound/panorama/vphysics2 worsened. |
| 4 | `panorama_enable_secondary_layout_pass "0"` | Current SteamTracking default `true`; Kaizu says disabling skips secondary CSS layout check and reduces UI calculation time. | UI-risk A/B. Do not combine with worldpanel culling. Watch `panorama` samples and UI correctness. |
| 5 | `r_citadel_distancefield_max_distance "16"` + `r_citadel_distancefield_min_screen_space_size "99"` | Current defaults `2048` and `0.015`; Sqooky/SqookyBase/TestCfg use `16` and `99`; descriptions say max distance/min screen size before culling. | Tested in N05 demo and retest; reject for now because the retest reversed the CPU gain. |
| 6 | `snd_occlusion_rays "0"` | Current default `4`; Sqooky/SqookyBase/TestCfg use `0`. | Only if audio becomes hot. Prior traces did not make audio a priority. |

Historical plain-text waves used for the N demo batch. Do not reapply N03 or
N05 without a new reason:

```text
// ETW N01: render flush resize test
r_flush_on_pooled_ib_resize "false"
```

```text
// ETW N02: physics invalidation parallelism test
parallel_perform_invalidate_physics "true"
```

```text
// ETW N03: scene indirect draw compaction threshold
sc_aggregate_indirect_draw_compaction_threshold "1"
```

```text
// ETW N04: Panorama secondary layout pass
panorama_enable_secondary_layout_pass "0"
```

```text
// ETW N05: distancefield culling pair
r_citadel_distancefield_max_distance "16"
r_citadel_distancefield_min_screen_space_size "99"
```

```text
// ETW N07: audio occlusion rays, only if audio is hot
snd_occlusion_rays "0"
```

Still rejected / do not test now:

| Candidate | Reason |
| --- | --- |
| `skeleton_instance_lod_optimization "1"` | Conflicting OptimizationLock values and SteamTracking description is not clearly beneficial. |
| `phys_batch_ray_test "16"` | Ray/trace behavior risk; still too gameplay-sensitive. |
| `r_citadel_gpu_culling_two_pass "0"` | Default is already `true`; disabling a default GPU culling pass is not a CPU-safe assumption. |
| `sc_aggregate_render_mesh_shader "false"` | Disables mesh shader path; more likely a compatibility workaround than a CPU improvement. |
| `sc_force_single_display_list_per_layer "1"` | Weak evidence and no useful description. Keep as later-only if scene/render remains hot after better candidates. |

## 2026-05-14 N Demo ETW Batch

Parsed:

```text
G:\N00demo.etl.zip through G:\N05demo.etl.zip
```

Full report:

```text
fps/etw_Ndemo_batch_2026-05-14/ndemo-analysis.md
```

Important limitation: these demo traces did not contain `FrameAccumulateTime`
events, so P95/P99/max frametime are unavailable. This batch can compare CPU and
module pressure only; it cannot prove a 1% low winner.

Initial CPU candidate, later rejected after retest:

```text
r_citadel_distancefield_max_distance "16"
r_citadel_distancefield_min_screen_space_size "99"
```

N05 vs N00 baseline:

```text
Avg CPU cores:       1.407 vs 1.418
Game CPU total:      244081ms vs 250454ms
MainThrd CPU:        39741ms vs 41531ms
D3D11RenderThread:   21572ms vs 22377ms
vphysics2 rate:      36.94/s vs 40.70/s
rendersystemdx11:    119.73/s vs 121.80/s
scenesystem:         119.23/s vs 121.28/s
```

Initial decision: N05 was the best CPU candidate in the first demo batch, but it
needed a full frame-event ETW confirm before being called a 1% low win. The N05
retest later reversed the CPU result, so N05 is rejected for now.

Reject from this demo batch:

```text
r_flush_on_pooled_ib_resize "false"
parallel_perform_invalidate_physics "true"
```

Retest-only candidates from the first pass:

```text
sc_aggregate_indirect_draw_compaction_threshold "1"
panorama_enable_secondary_layout_pass "0"
```

N05 retest result:

- New `G:\N05demo.etl.zip` timestamp `2026-05-14 01:56:29`.
- Still no `FrameAccumulateTime`; P95/P99/max unavailable.
- CPU regressed versus both N00 and the first N05 demo:
  `1.472` avg cores vs N00 `1.418` and first N05 `1.407`.
- MainThrd also regressed: `42922ms` vs N00 `41531ms`.

Decision: reject N05 for now and remove the distancefield pair from live config.

Removed:

```text
r_citadel_distancefield_max_distance "16"
r_citadel_distancefield_min_screen_space_size "99"
```

Still kept:

```text
r_update_particles_on_render_only_frames "1"
```

N03 retest result:

- New `G:\N03demo.etl.zip` timestamp `2026-05-14 02:13:44`.
- Still no `FrameAccumulateTime`; P95/P99/max unavailable.
- CPU regressed versus both N00 and the first N03 demo:
  `1.459` avg cores vs N00 `1.418` and first N03 `1.435`.
- MainThrd also regressed versus N00: `41857ms` vs `41531ms`.
- Particles/client/sound/panorama/vphysics2 rates worsened versus baseline.

Decision: reject N03 for now and remove it from live config.

Removed:

```text
sc_aggregate_indirect_draw_compaction_threshold "1"
```

## ETW Wave Harness - 2026-05-13

Created a repeatable wave harness:

```text
fps/etw_waves_2026-05-13/
```

Contents:

- `waves.json`: ranked wave metadata.
- `cfg/etw_W*.cfg`: runtime stickiness probes copied to the Deadlock `cfg`
  folder.
- `gameinfo-snippets/W*.kv`: paste-ready convar snippets.
- `Apply-EtwWave.ps1`: inserts or clears one managed wave block in
  `gameinfo.gi`; it backs up before editing.
- `Analyze-EtwWave.ps1`: extracts `G:\PerfViewData.etl.zip` and writes
  `summary.json` plus `summary.md` for each wave.

The live `gameinfo.gi` was not switched to a new wave during setup. Current
live values remain:

```text
thread_pool_option             "4"
r_particle_max_size_cull       "999"
cl_fasttempentcollision        "999999"
cloth_update                   "1"
engine_max_ticks_to_simulate   "2"
```

Probe cfgs were installed into:

```text
G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\cfg\etw_W*.cfg
```

Smoke checks:

- `Apply-EtwWave.ps1 -List` successfully listed all waves.
- `Apply-EtwWave.ps1 -InstallCfgOnly` copied the probe cfg files.
- `Apply-EtwWave.ps1 -Wave W01_particle_threshold_1200` was tested on a temp
  `gameinfo.gi` copy and inserted the managed block before `Memory`.
- `Apply-EtwWave.ps1 -Clear` removed that managed block from the temp copy.
- `Analyze-EtwWave.ps1 -RunId script_smoke_latest` parsed the latest trace and
  wrote a summary. It reproduced run 3: clean 5s-40s P99 `5.998ms`, max
  `9.101ms`, average game CPU cores `1.128`.

Wave set:

| Wave | Candidate | Reason |
| --- | --- | --- |
| `W00_current_baseline` | clear managed wave block | Control run. |
| `W01_particle_threshold_1200` | `r_particle_max_size_cull "1200"` | Strict P99 comparison against current `999`. |
| `W02_particle_threshold_1600` | `r_particle_max_size_cull "1600"` | Prior live value, for 999/1200/1600 triangle. |
| `W03_tempent_collision_1000` | `cl_fasttempentcollision "1000"` | Strongest helper-agent CPU A/B; current live `999999` is extreme. |
| `W04_break_pieces_zero` | `props_break_max_pieces_perframe "0"` | Breakable-prop spike test. |
| `W05_particles_render_only_frames` | `r_update_particles_on_render_only_frames "1"` | Particle worker/timing test, weak docs. |
| `W06_ui_audio_nonpositional` | `snd_ui_positional "false"` | Only if audio becomes hot. |
| `W07_audio_occlusion_rays_zero` | `snd_occlusion_rays "0"` | Only if audio becomes hot. |
| `W08_thread_pool_option_6` | `thread_pool_option "6"` | Compare against user-measured-good `4`. |
| `W09_particle_threshold_800` | `r_particle_max_size_cull "800"` | More aggressive GPU-headroom particle test. |
| `W10_texture_pool_512` | `r_texture_pool_size "512"` | Texture/stream hitch test, not direct CPU relief. |

Recommended first sequence:

1. `W00_current_baseline` if the latest run is not comparable.
2. `W01_particle_threshold_1200` because P99 slightly rose with `999`.
3. If `1200` is worse or flat, return to `999`; if mixed, run
   `W02_particle_threshold_1600`.
4. Once particle threshold is decided, run `W03_tempent_collision_1000`.
5. Only then consider `W04`, `W05`, and the optional helper-agent waves.

## PerfView ETW Trace - 2026-05-13 Run 3

Input trace:

```text
G:\PerfViewData.etl.zip
```

This is the third trace:

```text
Zip timestamp: 2026-05-13 11:57:44
ETL size:      203,882,224 bytes
Trace window:  2026-05-13 11:55:56 to 11:57:36
Duration:      100.34s
Events lost:   0
Game PID:      8200
Game image:    launcher.exe
Game CPU:      113,176ms total, about 1.13 CPU cores average
Frame events:  25,257 FrameAccumulateTime events
```

Frame timing:

| Window | Count | Avg ms | P50 | P95 | P99 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| All | 25257 | 3.85 | 3.52 | 5.47 | 6.06 | 106.00 |
| After first 5s | 23935 | 3.87 | 3.60 | 5.47 | 5.98 | 23.10 |
| 5s to 40s | 9213 | 3.80 | 3.52 | 5.42 | 6.00 | 9.10 |
| After 40s | 14722 | 3.91 | 3.69 | 5.49 | 5.96 | 23.10 |

Five-second bins:

| Bin sec | Count | Avg ms | P95 | P99 | Max | SimTicks=2 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 1322 | 3.59 | 5.75 | 11.62 | 106.00 | 2 |
| 5 | 1228 | 4.07 | 6.01 | 6.63 | 9.10 | 0 |
| 10 | 1281 | 3.90 | 5.46 | 5.99 | 8.22 | 0 |
| 15 | 1350 | 3.70 | 5.29 | 5.50 | 5.89 | 0 |
| 20 | 1343 | 3.72 | 5.29 | 5.64 | 7.71 | 0 |
| 25 | 1347 | 3.71 | 5.29 | 5.54 | 6.96 | 0 |
| 30 | 1322 | 3.78 | 5.43 | 5.89 | 7.63 | 0 |
| 35 | 1342 | 3.73 | 5.34 | 5.60 | 5.93 | 0 |
| 40 | 1276 | 3.92 | 5.49 | 6.13 | 8.48 | 0 |
| 45 | 1281 | 3.90 | 5.49 | 5.82 | 6.47 | 0 |
| 50 | 1286 | 3.89 | 5.50 | 5.91 | 6.72 | 0 |
| 55 | 1320 | 3.79 | 5.36 | 5.58 | 5.97 | 0 |
| 60 | 1308 | 3.82 | 5.42 | 5.75 | 6.46 | 0 |
| 65 | 1312 | 3.81 | 5.43 | 5.66 | 6.26 | 0 |
| 70 | 1284 | 3.89 | 5.51 | 5.88 | 7.33 | 0 |
| 75 | 1309 | 3.82 | 5.41 | 5.71 | 8.45 | 0 |
| 80 | 1248 | 4.01 | 5.67 | 5.93 | 9.09 | 0 |
| 85 | 1289 | 3.88 | 5.46 | 5.71 | 6.22 | 0 |
| 90 | 1314 | 3.80 | 5.40 | 6.07 | 23.10 | 0 |
| 95 | 495 | 5.26 | 16.69 | 16.83 | 17.36 | 5 |

Interpretation:

- Run 3 is the best evidence so far that `r_particle_max_size_cull "999"` is a
  safe keep-test value. It ran for 100s with no lost ETW events and did not show
  a clean-window frametime regression.
- The 5s-40s P99 is `6.00ms`, basically flat against run 1 `5.83ms` and run 2
  `5.94ms`.
- The after-40s window is also stable at P99 `5.96ms`. The only notable late
  issue is the final 95s stop bin, which again looks like collection-stop noise.
- Game CPU total stayed near the earlier runs despite a much longer trace, so
  average game CPU cores continued to drop.

Run comparison:

| Metric | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| Duration | 48.70s | 68.84s | 100.34s |
| Game CPU total | 114,922ms | 113,367ms | 113,176ms |
| Avg game CPU cores | ~2.36 | ~1.65 | ~1.13 |
| Frame events / sec | ~226.4 | ~231.4 | ~251.7 |
| Clean 5s-40s P99 | 5.83ms | 5.94ms | 6.00ms |
| Clean 5s-40s max | 9.39ms | 10.09ms | 9.10ms |

Simulation catch-up:

```text
SimulationTicks:
0 ticks: 19038 frames
1 tick:   6212 frames
2 ticks:     7 frames

ClientCommandTicks:
0 ticks: 25149 frames
1 tick:   106 frames
2 ticks:    2 frames
```

The tick cap is still working. No frame exceeded 2 simulation ticks.

Top exclusive sampled modules:

| Module | Run 3 samples | Run 2 samples | Run 1 samples |
| --- | ---: | ---: | ---: |
| `ntoskrnl` | 23176 | 22726 | 23426 |
| `amdxx64` | 17780 | 18157 | 17840 |
| `rendersystemdx11` | 10116 | 10261 | 10352 |
| `tier0` | 8756 | 8896 | 9105 |
| `client` | 8736 | 8930 | 9184 |
| `scenesystem` | 8540 | 8756 | 8579 |
| `materialsystem2` | 6480 | 6720 | 6574 |
| `panorama` | 5553 | 5110 | 5207 |
| `particles` | 5256 | 5280 | 5295 |
| `vphysics2` | 2472 | 2353 | 2593 |
| `soundsystem` | 1586 | 1413 | 1531 |

Decision after run 3:

- Keep `r_particle_max_size_cull "999"`.
- Do not add another convar yet if the in-game feel is already good. The trace
  improvement is mostly CPU-pressure reduction while clean frametime stayed
  stable; stacking a physics/temp-entity change now would muddy the result.
- Keep `engine_max_ticks_to_simulate "2"` and
  `engine_allow_multiple_ticks_per_frame "false"`.
- Keep `cloth_update "1"`.
- Keep all `panorama_worldpanel_update_cull*` settings removed.
- Keep audio occlusion tweaks on hold because audio is still not the bottleneck.
- Next isolated A/B only if manual 1% lows are still bad:

```text
cl_fasttempentcollision "999999" -> "1000"
```
