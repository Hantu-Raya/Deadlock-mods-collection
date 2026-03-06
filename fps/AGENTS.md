# DEADLOCK PERFORMANCE CONFIGS

**Project:** Deadlock FPS Optimization Configs  
**Type:** Source 2 Console Commands & CVAR Research  
**Updated:** 2026-02-04

## OVERVIEW

This directory contains comprehensive research and configuration files for optimizing Deadlock (Valve's Source 2 hero shooter) performance through console commands.

## KEY FILES

| File | Purpose | Size |
|------|---------|------|
| `fpsnew_organized.txt` | **MAIN CONFIG** - Production-ready FPS config with comments | 10KB |
| `fps.txt` | Legacy config (older version) | 7KB |
| `fpsnew.txt` | Intermediate version before organization | 9KB |
| `cvarlist_1_28.md` | Full CVAR dump from Jan 28, 2026 build | 506KB |
| `cvarlist_2_3.md` | Full CVAR dump from Feb 3, 2026 build | 508KB |
| `cvarlist_comparison_report.md` | Diff analysis between builds | 9KB |
| `gpu_rendering_commands_feb3.md` | GPU/Rendering commands reference | 21KB |

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

// Physics - Disable cosmetic cloth
cloth_update "0"
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
| `cloth_update "1"` | Cosmetic physics waste | Set to "0" |

## COMMANDS TO AVOID

These commands don't exist in Deadlock (Source 2):
- ❌ `r_drawothermodels` (CS:GO only)
- ❌ `mat_specular` (not in Source 2)
- ❌ `mat_bumpmap` (not in Source 2)
- ❌ `r_dynamic` (not in Source 2)

## USAGE

1. Copy `fpsnew_organized.txt` contents
2. Paste into Deadlock launch options or autoexec
3. Adjust [ADJUST] tagged values to preference
4. Test FPS impact with `cl_showfps "1"`

## NOTES

- All configs optimized for **competitive gameplay** (max FPS, min latency)
- Comments use tags: `[ADJUST]`, `[FPS IMPACT]`, `[WARNING]`
- Feb 3, 2026 build introduced significant performance improvements
- Threading commands now enabled by default in newer builds
