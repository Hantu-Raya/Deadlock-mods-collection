# Deadlock Cvarlist Comparison: Jan 28 vs Feb 3, 2026

## Summary
- **Total commands in Jan 28**: 5,755
- **Total commands in Feb 3**: 5,774
- **New commands added**: 31
- **Commands removed**: 11
- **Commands with changed defaults**: 30

---

## NEW COMMANDS ADDED (Feb 3)

### Performance/Graphics Related
| Command | Flags | Description |
|---------|-------|-------------|
| `citadel_only_think_thinkable_abilities` | sv, cl, rep | Default: true - Performance optimization for ability thinking |
| `cl_decal_clear_all_entities` | cl | Clears decals from all entities |
| `cl_decal_clear_world` | cl | Clears world decals |
| `cl_decal_debug` | cl | Toggles client decal debug visualization |
| `cl_decal_shoot` | cl | Shoots a client-side decal |
| `cl_entityreport` | cl | Reports all extant entities |
| `cl_entitysummary` | cl | Summarizes entities by class |
| `cl_sat_volume_debug` | cl | Toggles client sat volume debug visualization |
| `entityreport` | sv | Reports all extant entities (server) |
| `entitysummary` | sv | Summarizes entities by class (server) |
| `r_camerapos` |  | Prints current camera position + orientation |
| `r_citadel_use_exposure_control_in_panorama_scenes` | cl | Default: false - Exposure control in UI scenes |
| `r_cleardecals` | cl | Clears all decals |
| `r_entpos` |  | Moves camera to named entity |
| `r_printdecalinfo` | cl | Prints info about decals in scene |
| `r_setpos` |  | Moves camera to specified position |
| `sv_decal_clear_all_entities` | sv | Clears decals from all entities |
| `sv_decal_clear_from_entity` | sv | Clears decals from targetted entity |
| `sv_decal_clear_world` | sv | Clears world decals |
| `sv_decal_shoot` | sv | Shoots a server-side decal |
| `sv_sat_volume_debug` | sv | Toggles server sat volume debug visualization |

### Gameplay/UI Related
| Command | Flags | Description |
|---------|-------|-------------|
| `citadel_announcement_banned_heroes_display_time` | cl | Default: 10 - Display time for banned heroes announcement |
| `citadel_brawl_hero_roster_banned` | cl, a, release | Comma-separated list of banned brawl roster heroes |
| `citadel_debug_force_property_value_context` | sv, cl, rep | Default: -1 - Force ability property value context |
| `citadel_hero_roster_banned` | cl, a, release | Comma-separated list of banned roster heroes |
| `citadel_necro_skele_use_new_motor` | sv, release | Default: true - New motor for necromancer skeletons |
| `citadel_passthrough_fakewall_combat_lockout_time` | sv, cl, rep | Default: 4 - Combat lockout after passthrough |
| `citadel_show_chat_wheel_time` | cl | Default: 0.23 - Time for chat wheel to appear |
| `citadel_test_banned_heroes_message` | cl | Draws the banned heroes message |
| `citadel_trooper_outline_enabled` | cl, release | Default: false - Trooper outline toggle |
| `sv_enable_lost_lobby` | sv, rep, release | Default: true - Kill switch for lost lobby functionality |

---

## COMMANDS REMOVED (from Jan 28)

| Command | Notes |
|---------|-------|
| `citadel_demo_movie_write_intervals` | Demo recording related |
| `citadel_dev_priority_token_hero` | Dev tool |
| `citadel_dump_scene_panel_state` | Debug tool |
| `map_enable_portrait_worlds` | Portrait rendering |
| `r_Citadel_default_post_process_fade_ui` | Post-processing |
| `r_citadel_allow_particle_only_portraits` | Portrait optimization |
| `r_citadel_highlight_particle_only_portraits` | Portrait rendering |
| `sf_loadout_rotate_drag` | UI rotation |
| `sf_loadout_rotate_frametime_multiplier` | UI rotation |
| `sf_loadout_rotate_grab_scale` | UI rotation |
| `sf_loadout_rotate_scale` | UI rotation |
| `sv_play_stats_CitadelPerfStats_enabled` | Performance stats |

---

## COMMANDS WITH CHANGED DEFAULTS

### HIGH PRIORITY - Performance Optimizations

| Command | Jan 28 | Feb 3 | Impact |
|---------|--------|-------|--------|
| `cl_async_usercmd_send` | false | **true** | **MAJOR**: Async user command sending - reduces input latency |
| `cl_max_particle_pvs_aabb_edge_length` | 100 | **50** | Reduces particle PVS culling distance |
| `cl_parallel_readpacketentities_threshold` | 4 | **2** | More aggressive parallel entity reading |
| `cl_particle_fallback_multiplier` | 5 | **10** | Higher particle fallback threshold |
| `cl_particle_sim_fallback_base_multiplier` | 5 | **10** | Higher particle sim fallback |
| `cl_particle_sim_fallback_threshold_ms` | 0 | **1** | Particle sim fallback now enabled |
| `mat_async_shader_load` | false | **true** | **MAJOR**: Async shader loading - reduces stutter |
| `phys_threaded_cloth_bone_update` | false | **true** | Threaded cloth physics |
| `phys_threaded_kinematic_bone_update` | false | **true** | Threaded kinematic bone updates |
| `phys_threaded_transform_update` | false | **true** | Threaded physics transform updates |
| `ragdoll_parallel_pose_control` | false | **true** | Parallel ragdoll pose computation |

### MEDIUM PRIORITY - Rendering/Graphics Changes

| Command | Jan 28 | Feb 3 | Impact |
|---------|--------|-------|--------|
| `lb_enable_stationary_lights` | true | **false** | Disables stationary lights - performance gain |
| `lb_max_visible_envmaps_override` | -1 | **4** | Limits visible envmaps to 4 |
| `r_citadel_distancefield_farfield_enable` | true | **false** | Disables distance field farfield |
| `r_fallback_texture_lod_scale` | 2 | **4** | More aggressive texture LOD fallback |
| `r_multiscattering` | true | **false** | Disables multiscattering (lighting quality) |
| `r_renderdoc_auto_shader_pdbs` | true | **false** | Disables auto shader PDB generation |
| `r_texture_budget_threshold` | 0.9 | **0.8** | Lower texture budget threshold |
| `r_texture_budget_update_period` | 0.1 | **0.05** | More frequent texture budget updates |
| `r_texture_lod_scale` | 1 | **2** | More aggressive texture LOD |
| `r_texture_pool_reduce_rate` | 256 | **512** | Faster texture pool reduction |
| `r_texture_pool_size` | 1600 | **800** | **MAJOR**: Reduced texture pool size (MB) |
| `r_texture_stream_mip_bias` | 0 | **2** | Higher mip bias = lower res textures |
| `sc_aggregate_bvh_threshold` | 128 | **64** | Lower BVH aggregation threshold |
| `sc_clutter_enable` | true | **false** | Disables clutter rendering |
| `sc_layer_batch_threshold` | 128 | **64** | Lower layer batch threshold |

### LOW PRIORITY - Audio/Other Changes

| Command | Jan 28 | Feb 3 | Impact |
|---------|--------|-------|--------|
| `snd_steamaudio_num_threads` | 2 | **1** | Reduced audio threads |
| `citadel_trooper_health_model_scale` | 1.3 | **1.2** | Trooper health scaling |
| `citadel_trooper_new_movement` | false | **true** | New trooper movement system |
| `street_brawl_healing_multiplier` | 0.6 | **1** | Street brawl healing rebalance |

---

## KEY PERFORMANCE-RELATED FINDINGS

### Major Optimizations Enabled by Default
1. **Async User Command Sending** (`cl_async_usercmd_send` = true) - Reduces input latency
2. **Async Shader Loading** (`mat_async_shader_load` = true) - Reduces stuttering during gameplay
3. **Threaded Physics Updates** - Multiple physics systems now threaded by default

### Memory Optimizations
1. **Texture Pool Reduced** from 1600MB to 800MB (50% reduction)
2. **Texture LOD More Aggressive** - Higher bias values for lower resolution textures
3. **Stationary Lights Disabled** - Significant GPU performance gain
4. **Clutter Rendering Disabled** - Removes environmental clutter

### Particle System Changes
1. **Particle Fallback Thresholds Increased** - Particles will fall back to simpler versions sooner
2. **Particle PVS Culling Reduced** - Smaller culling distance (100→50)

### Potential Quality Reductions
1. **Multiscattering Disabled** - Lighting quality reduction
2. **Distance Field Farfield Disabled** - May affect ambient occlusion quality
3. **Envmaps Limited** - Max 4 visible environment maps
4. **Clutter Disabled** - Less environmental detail

---

## RECOMMENDATIONS FOR PERFORMANCE TESTING

### High Impact Commands to Test
```
cl_async_usercmd_send 1          # Already default true
mat_async_shader_load 1          # Already default true
r_texture_pool_size 800          # Already default (was 1600)
r_texture_stream_mip_bias 2      # Already default (was 0)
lb_enable_stationary_lights 0    # Already default (was 1)
```

### Commands to Revert for Quality (if performance is acceptable)
```
r_multiscattering 1              # Restore lighting quality
sc_clutter_enable 1              # Restore environmental clutter
r_citadel_distancefield_farfield_enable 1  # Restore AO quality
```

### New Debug Commands Available
```
cl_decal_debug                   # Debug decal rendering
cl_entityreport                  # Monitor entity count
cl_entitysummary                 # Entity performance analysis
r_printdecalinfo                 # Decal memory usage
```
