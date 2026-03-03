# Deadlock Performance CVAR Catalog

**Source:** cvarlist_2_3.md (Feb 3, 2026 Build)  
**Total CVARs Analyzed:** 5777  
**Generated:** 2026-02-05

---

## Table of Contents

1. [Core Quality & Performance](#1-core-quality--performance)
2. [Lighting & Shadows](#2-lighting--shadows)
3. [Particles](#3-particles)
4. [Textures & Streaming](#4-textures--streaming)
5. [Network & Interpolation](#5-network--interpolation)
6. [Audio](#6-audio)
7. [Physics & Cloth](#7-physics--cloth)
8. [Ragdolls](#8-ragdolls)
9. [Models & Decals](#9-models--decals)
10. [LOD & Culling](#10-lod--culling)
11. [Scene System (sc_)](#11-scene-system-sc_)
12. [Distance Field](#12-distance-field)
13. [Fog & Atmosphere](#13-fog--atmosphere)
14. [Hair & Grass](#14-hair--grass)
15. [UI & HUD](#15-ui--hud)
16. [AI Optimizations](#16-ai-optimizations)

---

## 1. Core Quality & Performance

### Frame Rate & Timing
| Command | Default | Description |
|---------|---------|-------------|
| `frame_rate_max` | 400 | Frame rate limiter (0=no limit) |
| `frame_rate_max_ui` | 120 | Frame rate limiter while UI displayed |
| `frame_rate_max_tools` | 120 | Frame rate limit in tools mode |
| `cpu_level` | 0 | CPU Level - Default: High |
| `gpu_level` | 0 | GPU Level - Default: High |
| `gpu_mem_level` | 2 | Memory Level - Default: High |

### Rendering Core
| Command | Default | Description |
|---------|---------|-------------|
| `r_drawworld` | true | Render the world |
| `r_drawparticles` | true | Draw Particles |
| `r_drawdecals` | true | Set to render decals |
| `r_drawviewmodel` | true | Render view model |
| `r_drawskybox` | true | Render the 2d skybox |
| `r_draw3dskybox` | false | Render 3D skybox |
| `r_draw_overlays` | true | Draw overlays |
| `r_drawpanorama` | true | Enable Panorama UI rendering |
| `r_drawtracers` | true | Draw bullet tracers |
| `r_drawtracers_firstperson` | true | Toggle first person weapon tracers |
| `r_depth_of_field` | true | Depth of field |
| `r_postprocess_enable` | true | Post-processing |
| `r_effects_bloom` | true | Bloom effects |
| `r_translucent` | true | Enable translucent geometry |
| `r_opaque` | true | Opaque rendering |
| `r_fullscreen_gamma` | 2.2 | Screen Gamma |

### Low Latency
| Command | Default | Description |
|---------|---------|-------------|
| `r_low_latency` | 1 | NVIDIA Low Latency/AMD Anti-Lag 2 (0=off, 1=on, 2=NV+boost) |
| `r_low_latency_trigger_flash` | true | NVIDIA Low Latency Trigger Flash |

---

## 2. Lighting & Shadows

### Shadow Control
| Command | Default | Description |
|---------|---------|-------------|
| `r_shadows` | false | Enable shadows |
| `lb_enable_shadow_casting` | false | Allow lights to cast shadows |
| `lb_enable_stationary_lights` | false | Render stationary/mixed lights |
| `lb_enable_dynamic_lights` | false | Render dynamic lights |
| `lb_enable_sunlight` | true | Enable sunlight |
| `lb_enable_baked_shadows` | true | Enable baked shadows |
| `lb_mixed_shadows` | true | Enable mixed shadows |
| `r_citadel_shadow_quality` | 1 | Shadow Quality |
| `r_citadel_shadow_caching` | true | Shadow caching |
| `r_citadel_shadowdb` | 2048 | Shadow database size |

### Light Binner Settings
| Command | Default | Description |
|---------|---------|-------------|
| `lb_enable_lights` | false | Enable lights |
| `lb_enable_envmaps` | true | Enable EnvMaps |
| `lb_dynamic_shadow_resolution` | true | Dynamic shadow resolution |
| `lb_dynamic_shadow_resolution_base` | 256 | Base resolution for dynamic shadows |
| `lb_max_visible_envmaps_override` | 4 | Max visible envmaps |
| `lb_barnlight_shadowmap_scale` | 0.5 | Barnlight shadowmap scale |
| `lb_shadow_map_culling` | true | Shadow map culling |
| `lb_precomputed_shadowmap_enable` | true | Precomputed shadowmaps |

### CSM (Cascaded Shadow Maps)
| Command | Default | Description |
|---------|---------|-------------|
| `csm_max_num_cascades_override` | -1 | Number of cascades |
| `csm_max_shadow_dist_override` | 0 | Max shadow distance |
| `csm_max_visible_dist` | 7500 | Max visible distance |
| `csm_viewmodel_shadows` | false | Viewmodel shadows |
| `csm_sst_max_visible_dist` | 2000 | SST max visible distance |

---

## 3. Particles

### Particle Simulation
| Command | Default | Description |
|---------|---------|-------------|
| `cl_particle_simulate` | true | Enable particle simulation |
| `cl_particle_sim_fallback_threshold_ms` | 1 | Sim time before fallback |
| `cl_particle_sim_fallback_base_multiplier` | 10 | Fallback aggressiveness |
| `cl_particle_fallback_base` | 5 | Base for fallback |
| `cl_particle_fallback_multiplier` | 10 | Fallback multiplier |
| `cl_particle_max_count` | 0 | Max particle count |
| `r_particle_max_draw_distance` | 700000 | Max draw distance |
| `r_particle_max_detail_level` | 0 | Max detail level |
| `r_particle_timescale` | 1 | Particle time scale |
| `r_particle_multiplier` | 1 | Render N times for testing |

### Particle Rendering
| Command | Default | Description |
|---------|---------|-------------|
| `r_threaded_particles` | true | Threaded particles |
| `r_threaded_particle_creation` | true | Threaded particle creation |
| `r_particle_enable_fastpath` | true | Fast particle path |
| `r_particle_gpu_implicit` | true | GPU implicit particles |
| `r_freezeparticles` | false | Pause particle simulation |
| `r_citadel_screenspace_particles_full_res` | false | Full res screen particles |
| `cl_aggregate_particles` | true | Aggregate particles |

---

## 4. Textures & Streaming

### Texture Quality
| Command | Default | Description |
|---------|---------|-------------|
| `r_texture_lod_scale` | 2 | Texture LOD scale |
| `r_texture_stream_mip_bias` | 2 | Mip bias for streaming |
| `r_texturefilteringquality` | 0 | Filtering: 0=Bilinear, 5=Aniso 16x |
| `r_fallback_texture_lod_scale` | 4 | Fallback LOD scale |

### Texture Pool & Budget
| Command | Default | Description |
|---------|---------|-------------|
| `r_texture_pool_size` | 800 | Texture pool size (MB) |
| `r_max_texture_pool_size` | 0 | Upper limit on pool |
| `r_texture_budget_dynamic` | true | Dynamic budget adjustment |
| `r_texture_budget_threshold` | 0.8 | Budget threshold |
| `r_texture_budget_update_period` | 0.05 | Budget update period |
| `r_texture_pool_increase_rate` | 64 | Pool increase rate (MB/s) |
| `r_texture_pool_reduce_rate` | 512 | Pool reduce rate (MB/s) |

### Streaming Settings
| Command | Default | Description |
|---------|---------|-------------|
| `r_texture_streaming_timesliced` | true | Timesliced streaming |
| `r_texture_stream_max_resolution` | 2147483647 | Max resolution |
| `r_texture_nonstreaming_load` | true | Immediate non-streaming load |
| `r_texture_eager_eviction` | false | Eager texture eviction |
| `r_texture_hookup_uses_threadpool` | true | Use threadpool for hookup |

---

## 5. Network & Interpolation

### Network Core
| Command | Default | Description |
|---------|---------|-------------|
| `rate` | 786432 | Min bytes/sec host can receive |
| `cl_updaterate` | 20 | Packets/sec from server |
| `cl_interp_ratio` | 0 | Interpolation amount |
| `cl_interp` | (read-only) | Effective interpolation |
| `cl_interpolate` | true | Interpolate entities |
| `cl_lagcompensation` | true | Lag compensation |
| `cl_predict` | true | Client-side prediction |

### Interpolation Settings
| Command | Default | Description |
|---------|---------|-------------|
| `cl_interp_parallel` | true | Parallel interpolation |
| `cl_interp_hermite` | true | Hermite interpolation |
| `cl_interp_all` | false | Disable interp optimizations |
| `cl_interp_animationvars` | true | Interpolate anim vars |
| `cl_interp_simulationvars` | true | Interpolate sim vars |
| `cl_interp_threadmodeticks` | 0 | Additional interp ticks |
| `cl_extrapolate` | true | Enable extrapolation |
| `cl_extrapolate_amount` | 0.25 | Extrapolation seconds |

### Clock & Timing
| Command | Default | Description |
|---------|---------|-------------|
| `cl_clock_correction` | true | Clock correction |
| `cl_clock_recvmargin_desired` | 5 | Desired recv margin (ms) |
| `cl_clock_buffer_ticks` | 1 | Additional buffer ticks |
| `cl_c
