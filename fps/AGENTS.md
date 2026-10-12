# DEADLOCK PERFORMANCE CONFIGS

**Project:** Deadlock FPS Optimization Configs  
**Type:** Source 2 Console Commands & CVAR Research  
**Updated:** 2026-10-12

## OVERVIEW

This directory is a research corpus plus current live-state audit material for
Deadlock Source 2 performance settings. Do not treat one config file as the
single source of truth; re-check the latest captured live config and ETW/perf
notes before recommending changes.

## GAMEINFO A/B BENCHMARKS (client 6774, Oct 2026)

Tools and run protocol: `gameinfo_bench/README.md`. Run output, game-file copies and round
reports stay in gitignored `.scratch/gameinfo_opt/` (latest: `r5_3way_20261012/ablate/REPORT.md`).

- **Ask the user before every benchmark set**, even inside a benchmark task. `harness3.py ab` kills
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
- FPS is the FrameTotal profiler count; 6774 has no Present row. Watch `frame_to_present_ratio`.
- Static RE notes: `E:\dll\ablation_debate_re_notes_20261012.md`. Put new DLL dumps and IDBs under `E:\dll`.

Hard limits from the user: `r_size_cull_threshold` ≤ 0.9 (breakables and golden statues vanish
above it); never `cloth_update false`; keep the particle timestep effectively 0 (the user's
`r_particle_min_timestep 0.0015`, not 0.008333 or higher); no Vulkan; no fps cap or render-scale
changes; no `-tools` launch; never hide unit-status names (breaks HP Colors v2). Thread pool: the user
keeps 7 workers.

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
