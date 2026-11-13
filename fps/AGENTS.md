# DEADLOCK PERFORMANCE CONFIGS

**Project:** Deadlock FPS Optimization Configs  
**Type:** Source 2 Console Commands & CVAR Research  
**Updated:** 2026-10-13

## OVERVIEW

This directory is a research corpus plus current live-state audit material for
Deadlock Source 2 performance settings. Do not treat one config file as the
single source of truth; re-check the latest captured live config and ETW/perf
notes before recommending changes.

## GAMEINFO A/B BENCHMARKS (client 6774, Oct 2026)

Tools and run protocol: `gameinfo_bench/README.md`. Run output, game-file copies and round
reports stay in gitignored `.scratch/gameinfo_opt/` (latest: `r6_20261013/REPORT.md`; per-key audits
`audit_blocks.md` / `audit_convars.md`; 6774 IDA gameinfo-reader inventory `E:\dll\r6_6774\readers.json`).

- **Ask the user before every benchmark set**, even inside a benchmark task, unless they have said to run without
  asking (2026-10-13: allowed while they are away). `harness3.py ab` kills
  `deadlock.exe` and relaunches it repeatedly with `-insecure`; never use that session online.
- A clear win with no visual change may be installed: back up first as
  `<file>.pre-<tag>-<yyyymmdd>.bak`, install, then report the hash. Ask before anything that trades
  CPU, visuals or gameplay readability for FPS.
- Benchmark the **installed** `citadel/gameinfo.gi` + `cfg/perf_r3.cfg`, not old copies. perf_r3.cfg
  re-applies values after auto.cfg and overrides gameinfo for some keys; read live values with
  `--cvars` instead of trusting the .gi.
- Noise is about 1.1 FPS per 300 s run. One pair resolves about 5%, ABBA about 3%, and 1–2% needs 5+ pairs. Don't
  screen many batches with single short pairs. Revert groups of uncertain-sign tweaks, then
  bisect. Visual removals (shadows, lighting, fog, textures) get value-tuning only.
- Judge on PresentMon (`pm_fps`, `pm_low1_fps`, `pm_display_latency_avg_ms`; harness3 default, exe at
  `E:\tools\presentmon\`). The VProfLite FrameTotal `fps` undercounts when `frame_to_present_ratio` ≠ 1.
  Detailed runs need the addons cvar-unhide proxy installed; a gameinfo arm must
  contain **no `gameinfo_cannot_override` ConVars** (harness3 refuses them; put them in a cfg).
  `--remove-addon-dll` measures the DLL-free case with the end-of-demo FPS summary instead.
- Static RE notes: `E:\dll\ablation_debate_re_notes_20261012.md`. Put new DLL dumps and IDBs under `E:\dll`.
- Public comparison targets: Sqooky's .gi and kaizuchanerus minimum spec (Sqooky/OptimizationLock).
  CompyLock is deprecated (dropped in r6). r6 PresentMon results: ours ran 13% faster than Sqooky and tied kaizu, but kaizu
  breaks the hard limits (`r_size_cull_threshold 1.6`, `r_farz 4500`).
- `MeshSystem { UseIndexBufferPool 1  UseVertexBufferPool 1 }` is installed (r6: +1.7%, 4/4 pairs). Without it
  meshes skip the RenderSystem IB/VB pools. No gain in r6, re-confirmed with PresentMon (ABBA on the mesh-pool config,
  runs `runs-20261013_144117`…`155316`): LightCookie granularity revert −0.9%, `SceneSystem/GpuLightBinner 0` +0.3%,
  `r_frame_sync_enable 0` −0.7%, `engine_low_latency_sleep_after_client_tick 1` +1.7% (noise: `auto.cfg` already sets it
  true in every run, so both arms were identical). No latency change from any of them. Installed at the user's request
  (2026-10-13): `engine_low_latency_sleep_after_client_tick 1` in gameinfo (md5 7053ce4e; arm `r6_20261013/arms/ours_current.gi`).
  **Never use `SceneSystem/GpuLightBinner 0`**: null light binner, the map renders dark (user-reported live 2026-10-13); removed.
- Game updates overwrite `citadel/gameinfo.gi` with stock. Reapply by 3-way merge (`git merge-file ours old_stock new_stock`),
  then check that every added key still appears in the bin DLLs (`SearchPaths` path IDs are free-form and won't). 6779
  (2026-10-14): Valve's only change was `ResourceCompiler { ForceVulkanForMapBuild 1 }` (map builds only); merged cleanly,
  installed md5 adfda8ca, stock backup `gameinfo.gi.pre-reapply-6779-20261014.bak`, inputs in `.scratch/gameinfo_opt/g6779/`.
  6785 (2026-10-16): stock gameinfo unchanged upstream (SteamTracking's last gameinfo commit is 6779), but the file had been
  rewritten on 2026-10-15 (LF, addon SearchPaths kept, all tuning gone). Merge was clean and identical to the 6779 result (md5 adfda8ca);
  backup `gameinfo.gi.pre-reapply-6785-20261016.bak`, inputs in `.scratch/gameinfo_opt/g6785/`.
- `harness3.py --no-auto-cfg` moves `cfg/auto.cfg` aside for a set and restores it hash-checked. If a harness is force-killed,
  restore by hand from the run folder (`original-*`, `auto.cfg.recovery`, `gameinfo.gi.pre-r3-<stamp>.bak`).
- `dead.bat` (so every harness run) launches with `+exec auto.cfg`, which runs after the gameinfo. Its 112 settings override
  9 of our gameinfo ConVars, 9 of Sqooky's and 5 of kaizu's. Head-to-head re-run without it (2026-10-13, PresentMon ABBA,
  `runs-20261013_163516` / `165900`, read-back proved it absent): ours 111.8 / Sqooky 99.5 (+12.3%) / kaizu 110.4 (+1.4%, tie);
  ours lowest latency (18.9 vs 19.0 / 19.3 ms). Same picture as with it. Benchmark public configs with `--no-auto-cfg`.
- Evening 2026-10-13 leads (PresentMon ABBA, no auto.cfg, `runs-20261013_173932` / `180309` / `182747`), all noise:
  dropping `-favor_consistent_framerate` −0.8% (keep it), `Particles/DisableSorting 1` −0.1%,
  `sc_aggregate_indirect_draw_compaction_threshold` 4 → 16 +0.4% (stock 8 stays). `SceneSystem/RenderMeshlets 1` breaks DX11
  (`CreateBuffer E_INVALIDARG`, "VB Failed to allocate"); never use.
- `dead.bat` launch options: 13 no-op Source 1 flags removed (no string and no MurmurHash2 seed 0x31415926 hash in any 6774 DLL;
  backup `Desktop/dead.bat.pre-noop-opts-20261013.bak`). `-drop OPT` omits one built-in option for a launch
  (harness: `--b-args "-drop -favor_consistent_framerate"`). The game prints `[CommandLine]` as several lines, so grep the block.
- DLL-free shadows/lighting: the blocked switches (`r_shadows`, `r_directlighting`, `lb_enable_*`) have no durable
  route. A `+r_shadows 0` launch option is reset by engine2's cheat revert on remote connect, and the `lb_enable_*`
  ConVars are devonly. The overridable substitutes are already in the gameinfo.

Hard limits from the user: `r_size_cull_threshold` ≤ 0.9 (breakables and golden statues vanish
above it); never `cloth_update false`; keep the particle timestep effectively 0 (the user's
`r_particle_min_timestep 0.0015`, not 0.008333 or higher); no Vulkan; no fps cap or render-scale
changes; never hide unit-status names (breaks HP Colors v2). Thread pool: the user
keeps 7 workers. `-tools` launches are allowed since 2026-10-13 (goal: a DLL-free alternative to the
addons cvar-unhide proxy for end users).

## KEY FILES

| File | Purpose | Size |
|------|---------|------|
| `current-live-convars-2026-05-14.txt` | Current live convar capture for exclusion/diff checks | large |
| `source_refresh_2026-05-14/` | Latest source refresh / live-state audit material | dir |
| `2026-05-10-deadlock-optimizationlock-followup.md` | OptimizationLock follow-up and applied-setting notes | doc |
| `fpsnew_organized.txt` | Older organized FPS config with comments | 10KB |
| `fps.txt` | Legacy config (older version) | 7KB |
| `fpsnew.txt` | Intermediate version before organization | 9KB |
| `cvarlist_1_28.md` | Full CVAR dump from Jan 28, 2026 build | 506KB |
| `cvarlist_2_3.md` | Full CVAR dump from Feb 3, 2026 build | 508KB |
| `cvarlist_comparison_report.md` | Diff analysis between builds | 9KB |
| `gpu_rendering_commands_feb3.md` | GPU/Rendering commands reference | 21KB |
| `gameinfo_bench/` | Tracked A/B harness, variant builder and published-page generator | dir |

## MAIN CONFIG SECTIONS

```
fpsnew_organized.txt
├── CORE QUALITY          # gpu_level, cpu_level, shader quality
├── FOV                   # Aspect ratio / FOV control
├── LIGHTING & SHADOWS    # Shadow disabling, SSAO, lighting
├── SPARSE SHADOW TREE    # SST optimization
├── DISTANCE FIELD        # Distance field rendering
├── FOG & ATMOSPHERE      # Fog disabling
├── SKY & ENVIRONMENT     # Skybox, wind, water
├── SSAO                  # Ambient occlusion
├── PARTICLE SYSTEM       # Particle optimization
├── PHYSICS & CLOTH       # Cloth physics, threading
├── RAGDOLL               # Ragdoll limits
├── MODEL & DECAL         # Decals, hair, models
├── LOD & CULLING         # Level of detail, clutter
├── ROPE PHYSICS          # Rope simulation
├── TERRAIN & FOLIAGE     # Grass quality
├── UI & HUD              # Panorama, HUD elements
├── NETWORK & PREDICTION  # Interpolation, buffering
├── AI OPTIMIZATIONS      # AI LOD
├── AUDIO                 # Audio threading
├── TEXTURE STREAMING     # Texture pool, LOD bias
├── MEMORY BUDGET         # Dynamic budget
└── SHADER & RENDERING    # Async loading, HDR
```

## CRITICAL PERFORMANCE COMMANDS

### Maximum FPS (Competitive)
```c
// Shadows - DISABLE for max FPS
r_shadows "0"
lb_enable_shadow_casting "0"

// Particles - Aggressive fallback
cl_particle_sim_fallback_threshold_ms "1"
r_particle_max_draw_distance "3000"  // NOT 700000!

// Physics - current ETW notes favor keeping cloth enabled
cloth_update "1"
cl_phys_timescale "0"

// Textures - Lower quality
r_texture_lod_scale "4"
r_texture_stream_mip_bias "4"

// Hair - Disable
r_render_hair "0"

// Clutter - Remove debris
sc_clutter_enable "0"
```

### Quality vs Performance Trade-offs

| Setting | Low (Max FPS) | Medium | High (Quality) |
|---------|--------------|--------|----------------|
| `r_texture_lod_scale` | 4 | 2 | 0 |
| `sc_instanced_mesh_lod_bias` | 20 | 10 | 0 |
| `r_decals` | 0 | 16 | 256 |
| `panorama_max_fps` | 30 | 60 | 0 |
| `cl_interp_ratio` | 0 | 1 | 2 |

## RESEARCH METHODOLOGY

1. **Extracted** full CVAR lists from game builds (Jan 28 & Feb 3, 2026)
2. **Compared** versions to find new commands and changed defaults
3. **Categorized** 200+ performance-related commands
4. **Tested** values to find optimal performance settings
5. **Documented** with [ADJUST], [FPS IMPACT], [WARNING] tags
6. **Refreshed live-state audits** in May 2026; always check
   `current-live-convars-2026-05-14.txt`, `source_refresh_2026-05-14/`, the
   OptimizationLock follow-up, and ETW wave reports before suggesting values.

## CHANGED DEFAULTS (Feb 3 Update)

Key changes from Jan 28 to Feb 3 build:
- `r_texture_pool_size`: 1600 → 800 (50% VRAM reduction)
- `mat_async_shader_load`: false → true (async by default)
- `cl_async_usercmd_send`: false → true (lower latency)
- `lb_enable_stationary_lights`: true → false (major FPS boost)
- `sc_clutter_enable`: true → false (no debris)

## FILE RELATIONSHIPS

```
cvarlist_1_28.md + cvarlist_2_3.md
        ↓
cvarlist_comparison_report.md
        ↓
gpu_rendering_commands_feb3.md
        ↓
[Analysis & Testing]
        ↓
fpsnew_organized.txt (final config)
```

## ANTI-PATTERNS (DO NOT USE)

| Bad Setting | Why | Fix |
|-------------|-----|-----|
| `r_particle_max_draw_distance "700000"` | Renders particles across entire map | Use "3000" or lower |
| `mat_async_shader_load "0"` | Causes stutter | Set to "1" |
| `cl_particle_sim_fallback_threshold_ms "0"` | No particle fallback | Use "1" or "5" |
| `cloth_update "0"` | Conflicts with newer ETW rules for this setup | Keep "1" unless fresh evidence says otherwise |
| `thread_pool_option "6"` / `max_threads` | 2026-10-12: 15 workers, +2.8% FPS but +39% CPU (5.5 → 7.7 cores); user keeps 7 workers. Every other mode, stock included, is already 7 on a 5700X | Don't install without asking |
| `r_texture_pool_size` low values | It is a minimum floor, not a cap (RE). On 16 GB VRAM 256 or 512 changes nothing | Treat textures as a visual lever only |
| `iv_parallel_restore "0"`, `animgraph_parallel_postdataupdate "false"`, `cl_interp_parallel "0"` | 2026-10-12: cost 3.3% / 2.8% / 2.4% FPS (≈8% together); serialize client work | Keep stock (1 / true / 1) |
| `engine_accurate_input_processing_delta_time "true"` + `engine_max_ticks_to_simulate "2"` (Sqooky) | 2026-10-13 PresentMon: no average-FPS cost (+1.0% without them, noise), but 1% low −3 FPS and display latency +0.4 ms. They also break the game's frame counter (FrameTotal undercounts; profiler-based "−9%" was an artifact) | Leave both at stock |
| `snd_mixahead "0.05"` (Sqooky) | Stock is 0.001; 0.05 adds audio buffering, not lower latency | Leave at stock |
| `panorama_worldpanel_update_cull*` | Rejected/unsafe in recent retests | Do not re-recommend without new evidence |

## COMMANDS TO AVOID

These commands don't exist in Deadlock (Source 2):
- ❌ `r_drawothermodels` (CS:GO only)
- ❌ `mat_specular` (not in Source 2)
- ❌ `mat_bumpmap` (not in Source 2)
- ❌ `r_dynamic` (not in Source 2)

## USAGE

1. Parse the current target config first.
2. Exclude commands already present before recommending anything.
3. Check latest live captures and ETW reports for rejected candidates.
4. Provide paste-ready blocks only for settings that survive that exclusion pass.

## NOTES

- All configs optimized for **competitive gameplay** (max FPS, min latency)
- Comments use tags: `[ADJUST]`, `[FPS IMPACT]`, `[WARNING]`
- Feb 3, 2026 build introduced significant performance improvements
- Threading commands now enabled by default in newer builds
- Before new recommendations, re-parse the current target config and exclude
  commands already present. Keep output paste-ready when the user asks for a
  snippet.
- Do not recommend N03/N05 retest candidates, `panorama_worldpanel_update_cull*` or
  `cloth_update "0"` unless a newer local test overturns the May 2026 evidence. The Oct 2026
  benchmark section above supersedes older thread-pool and texture-pool advice.
