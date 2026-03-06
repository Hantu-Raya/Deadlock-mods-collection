# Deadlock GPU/Rendering Console Commands - Feb 3, 2025

## GPU & Graphics Settings

| Command | Default | Description |
|---------|---------|-------------|
| `gpu_level` | 0 | GPU Level - Default: High |
| `gpu_mem_level` | 2 | Memory Level - Default: High |
| `r_citadel_gpu_culling` | true | Citadel/Graphics/GPU Culling |
| `r_citadel_gpu_culling_shadows` | true | Citadel/Graphics/GPU Cull Shadow Views |
| `r_citadel_gpu_culling_two_pass` | true | Citadel/Graphics/GPU Culling (Two Pass) |
| `r_citadel_gpu_debug_draw` | false | GPU debug drawing |
| `r_allow_onesweep_gpusort` | true | Enable one-sweep GPU sort |

---

## Shadow Rendering

| Command | Default | Description |
|---------|---------|-------------|
| `r_citadel_shadow_caching` | true | Enable shadow caching |
| `r_citadel_shadow_caching_stats` | - | Print information about shadow caching |
| `r_citadel_shadow_quality` | 1 | Shadow Quality |
| `r_citadel_shadowdb` | 2048 | Shadow depth buffer size |
| `r_citadel_gpu_preview_baked_shadows` | true | Preview baked shadows |
| `r_citadel_gpu_preview_denoise_shadow_passes` | 1 | Shadow denoise passes |
| `r_citadel_sun_shadow_slope_scale_depth_bias` | 1 | Sun shadow slope scale depth bias |
| `r_citadel_distancefield_shadows` | true | Enable distance field shadows |
| `mat_depthbias_shadowmap` | 0.0005 | Shadow map depth bias |
| `mat_slopescaledepthbias_shadowmap` | 4 | Shadow map slope scale depth bias |
| `mat_shadowmap_luxels` | false | Visualize shadow map luxels |
| `r_shadows` | false | Enable shadow rendering |
| `r_shadowtile_waveops` | false | Use wave ops for shadow tiles |
| `r_mixed_shadows_fade_in_time` | 0.5 | Mixed shadows fade in time |
| `r_mixed_shadows_fade_out_time` | 0.5 | Mixed shadows fade out time |
| `r_size_cull_threshold_shadow` | 100 | Shadow map size culling threshold |
| `sc_shadow_depth_bias` | 256 | Scene system shadow depth bias |
| `sc_shadow_depth_bias_clamp` | 0 | Shadow depth bias clamp |
| `sc_shadow_slopescale_depth_bias` | 2.13 | Shadow slope scale depth bias |
| `sc_shadow_depth_bias_state_override` | false | Override shadow depth bias state |
| `sc_disable_shadow_fastpath` | false | Disable shadow fast path |
| `sc_disable_spotlight_shadows` | true | Disable spotlight shadows |
| `r_flashlightshadowatten` | 0.35 | Flashlight shadow attenuation |
| `r_hair_shadowtile` | true | Use shadow tiles for hair |
| `r_particle_cables_cast_shadows` | false | Particle cables cast shadows |
| `shadowcachedebugger_showdebugwindow` | false | Citadel/Graphics/Shadow Cache Debugger |

---

## Culling (Frustum, Occlusion, Visibility)

| Command | Default | Description |
|---------|---------|-------------|
| `r_citadel_depth_prepass_cull_threshold` | 60 | Depth prepass cull threshold |
| `r_citadel_depth_prepass_dynamic_objects` | true | Depth prepass for dynamic objects |
| `r_citadel_distancefield_max_distance` | 2048 | Maximum distance before culling |
| `r_citadel_distancefield_min_screen_space_size` | 0.015 | Minimum screen space size before culling |
| `r_size_cull_threshold` | 1.2 | Screen size percentage culling threshold |
| `r_size_cull_threshold_fade` | 0 | Fade out percentage above cull threshold |
| `r_drawpixelvisibility` | false | Show occlusion proxies |
| `r_dopixelvisibility` | true | Enable pixel visibility |
| `r_pixelvisibility_partial` | true | Partial pixel visibility |
| `r_pixelvisibility_spew` | false | Spew pixel visibility debug |
| `mat_show_distance_field` | 0 | Visualize occlusion (0=Off, 1=Trace, 2=Occlusion, 3=Far trace) |
| `citadel_use_pvs_for_players` | false | Use PVS for players |
| `sc_aggregate_gpu_culling` | true | GPU culling of aggregate meshes |
| `sc_aggregate_gpu_occlusion_culling` | true | GPU occlusion culling |
| `sc_aggregate_gpu_vis_culling` | true | GPU visibility culling |
| `sc_aggregate_gpu_culling_show_culled` | false | Show GPU culled meshes |
| `sc_aggregate_gpu_culling_conservative_bounds` | false | Conservative bounds for GPU culling |
| `sc_no_cull` | false | Disable all culling |
| `sc_no_vis` | false | Disable visibility checks |
| `sc_disable_culling_boxes` | false | Disable culling boxes |
| `r_aoproxy_cull_dist` | 12 | AO proxy cull distance factor |
| `r_aoproxy_min_dist` | 3 | AO proxy minimum distance |
| `r_aoproxy_min_dist_box` | 1 | AO proxy min distance for boxes |
| `r_character_decal_monitor_draw_frustum` | false | Draw decal monitor frustum |
| `cl_globallight_orig_calc_frustum` | true | Use original frustum calc |
| `cl_globallight_use_optimized_calc_frustum` | true | Use optimized frustum calc |
| `r_strip_invisible_during_sceneobject_update` | false | Strip invisible during update |

---

## LOD (Level of Detail)

| Command | Default | Description |
|---------|---------|-------------|
| `sc_allow_dithered_lod` | true | Allow dithered LOD transitions |
| `sc_dithered_lod_transition_amt` | 0.075 | LOD transition dither percentage |
| `sc_force_lod_level` | -1 | Force specific LOD level (-1=off) |
| `sc_screen_size_lod_scale_override` | -1 | Screen size LOD scale override |
| `sc_fade_distance_scale_override` | 180 | Fade distance scale override |
| `sc_instanced_mesh_lod_bias` | 10 | LOD bias for instanced meshes |
| `sc_instanced_mesh_lod_bias_shadow` | 10 | LOD bias for instanced meshes in shadows |
| `r_fallback_texture_lod_scale` | 4 | Fallback texture LOD scale |
| `r_texture_lod_scale` | 2 | Texture LOD scale factor |
| `ai_lod_auto_enabled` | false | Auto LOD for AI |
| `ai_lod_debug_display` | 0 | AI LOD debug display |

---

## Texture Streaming

| Command | Default | Description |
|---------|---------|-------------|
| `r_texture_pool_size` | 800 | Total texture pool size (MB) |
| `r_max_texture_pool_size` | 0 | Upper limit on texture pool (0=unlimited) |
| `r_texture_budget_dynamic` | true | Dynamic texture budget adjustment |
| `r_texture_budget_threshold` | 0.8 | Budget threshold for reduction |
| `r_texture_budget_update_period` | 0.05 | Budget update period (seconds) |
| `r_texture_pool_increase_rate` | 64 | Pool increase rate (MB/s) |
| `r_texture_pool_reduce_rate` | 512 | Pool reduction rate (MB/s) |
| `r_texture_stream_mip_bias` | 2 | Texture stream mip bias |
| `r_texture_stream_max_resolution` | 2147483647 | Max streaming texture resolution |
| `r_texture_stream_resolution_bias` | 1 | Resolution bias |
| `r_texture_stream_resolution_bias_decrease_rate` | 0.1 | Resolution bias decrease rate |
| `r_texture_stream_resolution_bias_increase_rate` | 0.05 | Resolution bias increase rate |
| `r_texture_stream_resolution_bias_min` | 1 | Min resolution bias |
| `r_texture_stream_resolution_bias_update_period` | 0.5 | Update period |
| `r_texture_stream_throttle_amount` | 10 | Stream throttle amount |
| `r_texture_stream_throttle_count` | 3 | Stream throttle count |
| `r_texture_stream_throttle_count_over_budget` | 3 | Over-budget throttle count |
| `r_texture_streaming_timesliced` | true | Time-sliced texture streaming |
| `r_texture_streamout_unthrottle_ms` | 0.2 | Streamout unthrottle time |
| `r_texture_eager_eviction` | false | Eager texture eviction |
| `r_texture_nonstreaming_load` | true | Allow immediate non-streaming load |
| `r_texture_hookup_uses_threadpool` | true | Async texture hookup with threadpool |
| `r_validate_texture_streaming` | false | Dump texture streaming state |
| `r_textures_evict_all` | - | Evict all resident textures |
| `mat_print_textures` | - | Print loaded textures |
| `mat_print_textures_size` | - | Print textures by size |
| `mat_print_textures_size_in_memory` | - | Print textures by memory size |
| `r_citadel_fsr_enable_mip_bias` | true | Apply negative mip bias with FSR |
| `r_citadel_fsr_rcas_sharpness` | 0.25 | RCAS sharpness with FSR |

---

## Draw Call Optimization & Batching

| Command | Default | Description |
|---------|---------|-------------|
| `sc_aggregate_render_mesh_shader` | true | Use mesh shaders instead of drawcalls |
| `sc_aggregate_indirect_draw_compaction` | true | Use multidrawindirect...count |
| `sc_aggregate_indirect_draw_compaction_threshold` | 8 | Threshold for draw compaction |
| `sc_aggregate_instance_streams` | true | Enable instance streams |
| `sc_allow_dynamic_constant_batching` | true | Dynamic constant batching |
| `sc_batch_layer_cb_updates` | true | Batch layer constant buffer updates |
| `sc_layer_batch_threshold` | 64 | Layer batch threshold |
| `sc_layer_batch_threshold_fullsort` | 80 | Full sort batch threshold |
| `sc_visualize_batches` | 0 | Color per batch (debug) |
| `r_draw_instances` | true | Enable instanced rendering |
| `r_particle_batch_collections` | false | Batch particle collections |
| `sc_force_materials_batchable` | false | Force materials to be batchable |
| `sc_force_single_display_list_per_layer` | false | Single display list per layer |

---

## Instanced Mesh Rendering

| Command | Default | Description |
|---------|---------|-------------|
| `sc_instanced_mesh_enable` | true | Draw instanced meshes |
| `sc_instanced_mesh_mesh_shader` | true | Use mesh shaders for instanced meshes |
| `sc_instanced_mesh_gpu_culling` | true | GPU culling of instanced meshes |
| `sc_instanced_mesh_gpu_density_culling` | true | Density culling for instanced meshes |
| `sc_instanced_mesh_gpu_occlusion_culling` | true | GPU occlusion culling |
| `sc_instanced_mesh_gpu_vis_culling` | true | GPU visibility culling |
| `sc_instanced_mesh_lod_bias` | 10 | LOD bias |
| `sc_instanced_mesh_lod_bias_shadow` | 10 | Shadow LOD bias |
| `sc_instanced_mesh_size_cull_bias` | 10 | Size cull bias |
| `sc_instanced_mesh_size_cull_bias_shadow` | 10 | Shadow size cull bias |
| `sc_instanced_mesh_motion_vectors` | false | Motion vector support |
| `sc_instanced_mesh_opaque_fade` | true | Opaque fade support |
| `sc_instanced_debug_visualizer` | false | Debug visualizer |
| `sc_instanced_gpu_culling_show_culled` | false | Show GPU culled meshlets |
| `sc_instanced_material_solo` | - | Solo specific material |
| `sc_instanced_mesh_solo` | - | Solo specific mesh |

---

## Distance Field Rendering

| Command | Default | Description |
|---------|---------|-------------|
| `r_distancefield_enable` | true | Enable Distance Field rendering |
| `r_citadel_distancefield_ao_quality` | 0 | Distance Field AO quality |
| `r_citadel_distancefield_blur` | true | Enable distance field blur |
| `r_citadel_distancefield_blur_depth_threshold` | 1 | Blur depth threshold |
| `r_citadel_distancefield_down_sample` | 1 | Down sample factor |
| `r_citadel_distancefield_farfield_enable` | false | Far field enable |
| `r_citadel_distancefield_farfield_occlusion_length` | 192 | Far field occlusion length |
| `r_citadel_distancefield_farfield_occlusion_start_offset` | 16 | Far field start offset |
| `r_citadel_distancefield_farfield_resolution` | 192 | Far field resolution |
| `r_citadel_distancefield_farfield_size` | 2048 | Far field size |
| `r_citadel_distancefield_max_distance` | 2048 | Maximum distance |
| `r_citadel_distancefield_min_screen_space_size` | 0.015 | Min screen space size |
| `r_citadel_distancefield_occlusion_length` | 48 | Occlusion length |
| `r_citadel_distancefield_ray_origin_bias_max` | 3 | Ray origin bias max |
| `r_citadel_distancefield_ray_origin_bias_min` | 0.25 | Ray origin bias min |
| `r_citadel_distancefield_shadows` | true | Distance field shadows |

---

## SSAO & Ambient Occlusion

| Command | Default | Description |
|---------|---------|-------------|
| `r_citadel_ssao_quality` | 0 | SSAO quality |
| `r_citadel_ssao_thin_occluder_compensation` | 0 | Thin occluder compensation |
| `r_ssao` | false | Screen-space ambient occlusion |
| `r_ssao_bias` | 0.5 | SSAO bias |
| `r_ssao_blur` | true | SSAO blur |
| `r_ssao_radius` | 30 | SSAO radius |
| `r_ssao_strength` | 1.2 | SSAO strength |

---

## Async & Parallel Processing

| Command | Default | Description |
|---------|---------|-------------|
| `mat_async_shader_load` | true | Async shader loading |
| `r_async_compute_fog` | false | Async compute for fog |
| `r_async_shader_compile_notify_frequency` | 10 | Shader compile notify frequency |
| `r_threaded_particles` | true | Threaded particle simulation |
| `r_threaded_particle_creation` | true | Threaded particle creation |
| `r_threaded_scene_object_update` | true | Threaded scene object update |
| `r_texture_hookup_uses_threadpool` | true | Async texture hookup with threadpool |
| `sc_disableThreading` | false | Disable scene system threading |
| `r_particle_model_per_thread_count` | 32 | Particles per thread |
| `r_pipeline_stats_flush_before_sleeping` | false | GPU pipeline flush before sleeping |
| `r_pipeline_stats_command_flush` | false | Flush after each command list |
| `r_pipeline_stats_present_flush` | false | Flush after each present |

---

## Particle System Optimization

| Command | Default | Description |
|---------|---------|-------------|
| `r_particle_enable_fastpath` | true | Enable particle fast path |
| `r_particle_gpu_implicit` | true | GPU implicit particles |
| `r_particle_gpu_implicit_cull_columns` | true | Cull columns for GPU implicit |
| `r_particle_gpu_implicit_lds_cache` | true | LDS cache for GPU implicit |
| `r_particle_max_detail_level` | 0 | Max particle detail level |
| `r_particle_max_draw_distance` | 700000 | Max particle draw distance |
| `r_particle_max_size_cull` | 800 | Max size for culling |
| `r_particle_mixed_resolution_viewstart` | 800 | Mixed resolution view start |
| `r_particle_cables_culling` | 1 | Particle cables culling |
| `r_particle_cables_culling_bounds_scale` | 1.2 | Culling bounds scale |
| `r_cl_max_particle_pvs_aabb_edge_length` | 50 | Max particle PVS AABB edge |
| `r_late_particle_job_sync` | false | Late particle job sync |
| `r_limit_particle_job_duration` | false | Limit particle job duration |
| `r_update_particles_on_render_only_frames` | false | Update on render-only frames |
| `r_particle_skip_postsim` | false | Skip particle post-simulation |
| `r_particle_timescale` | 1 | Particle time scale |

---

## Hair Rendering

| Command | Default | Description |
|---------|---------|-------------|
| `r_hair_meshshader` | 0 | Use mesh shaders for hair |
| `r_hair_shadowtile` | true | Use shadow tiles for hair |
| `r_hair_voxels` | -1 | Hair voxel rendering |
| `r_hair_ao` | false | Hair ambient occlusion |
| `r_hair_indirect_transmittance` | true | Hair indirect transmittance |
| `r_haircull_percent` | -1 | Hair cull percentage |
| `r_hairsort` | true | Hair sorting |
| `r_force_thick_hair` | false | Force thick hair |
| `r_hair_debug_guides` | 0 | Debug guide hairs |
| `r_hair_wind_global_scale` | 0.3 | Wind global scale |
| `r_hair_wind_min_noise_speed` | 20 | Min wind noise speed |
| `r_hair_wind_motion_scale` | 0.07 | Wind motion scale |
| `r_hair_wind_noise` | 0.2 | Wind noise |
| `r_hair_wind_noise_occlusion` | 1 | Wind noise occlusion |
| `r_hair_wind_noise_size` | 10 | Wind noise size |
| `r_hair_wind_occlusion` | 2 | Wind occlusion |
| `r_render_hair` | true | Render hair |

---

## Mesh Shaders & Meshlets

| Command | Default | Description |
|---------|---------|-------------|
| `sc_aggregate_render_mesh_shader` | true | Use mesh shaders for aggregates |
| `sc_instanced_mesh_mesh_shader` | true | Use mesh shaders for instanced |
| `sc_aggregate_debug_draw_meshlets` | 0 | Visualize meshlets |
| `sc_aggregate_debug_draw_meshlets_bounds` | false | Visualize meshlet bounds |
| `r_hair_meshshader` | 0 | Use mesh shaders for hair |

---

## Upscaling (FSR/DLSS)

| Command | Default | Description |
|---------|---------|-------------|
| `r_citadel_upscaling` | 4 | Upscaling mode |
| `r_citadel_fsr2_sharpness` | 0.5 | FSR2 sharpness |
| `r_citadel_fsr3_min_reactiveness` | 0.1 | FSR3 min reactiveness |
| `r_citadel_fsr_enable_mip_bias` | true | Apply negative mip bias with FSR |
| `r_citadel_fsr_rcas_sharpness` | 0.25 | RCAS sharpness |
| `r_citadel_dlss_settings_mode` | 0 | DLSS settings mode |
| `r_dlss_preset` | 5 | DLSS preset |

---

## Visibility & PVS

| Command | Default | Description |
|---------|---------|-------------|
| `citadel_use_pvs_for_players` | false | Use PVS for players |
| `sc_allow_precomputed_vismembers` | true | Allow precomputed vis members |
| `sc_barnlight_enable_precomputed_vis` | true | Precomputed vis for lights |
| `cl_generate_postdataupdatepreserved` | true | PostDataUpdate for PVS entities |
| `pvs_debugentity` | -1 | Verbose spew for PVS entity |
| `pvs_flowtype` | 0 | PVS flow type |
| `sv_debug_client_not_in_pvs` | false | Debug failed PVS checks |
| `sv_force_transmit_ents` | false | Force transmit all entities |
| `sv_hide_ent_in_pvs` | -1 | Hide entity in PVS |
| `sv_outofpvsentityupdates` | false | Out of PVS entity updates |

---

## Material & Shader Commands

| Command | Description |
|---------|-------------|
| `mat_reloadshaders` | Reload all shaders |
| `mat_forcereloadshaders` | Force reload shaders (skip MD5) |
| `mat_clearshadercache` | Clear shader cache |
| `mat_reinitmaterials` | Reinitialize all materials |
| `mat_print_materials` | Print loaded materials |
| `mat_print_shaders` | Print loaded shaders |
| `mat_print_textures` | Print loaded textures |
| `mat_print_material_info` | Print material info |
| `mat_print_shader_info` | Print shader info |
| `mat_print_error_materials` | Print error materials |
| `mat_print_expensive_materials` | Print expensive materials |
| `mat_print_dead_materials` | Print dead materials |
| `mat_reset_material_costs` | Reset material costs |
| `mat_set_shader_quality` | Force shader quality (0 or 1) |
| `mat_shader_cache` | true | Enable shader cache |
| `mat_async_shader_load` | true | Async shader loading |
| `mat_cache_renderablepasses` | true | Cache renderable passes |
| `mat_cache_and_skip_commandbuffers` | true | Cache command buffers |
| `mat_execute_skipbuffers` | true | Execute skip buffers |
| `mat_skip_static_const_eval` | true | Skip static const eval |

---

## Debug & Visualization Commands

| Command | Default | Description |
|---------|---------|-------------|
| `mat_fullbright` | 0 | Debug rendering modes |
| `mat_wireframe` | 0 | Wireframe mode (0=Off, 1=Surface, 2=Transparent) |
| `mat_overdraw` | 0 | Visualize overdraw |
| `mat_shading_complexity` | false | Visualize shading complexity |
| `r_showdebugoverlays` | false | Render debug overlays |
| `r_showdebugrendertarget` | false | Show debug render target |
| `r_showsceneobjectbounds` | false | Show scene object bounds |
| `r_showsunshadowdebugrendertargets` | false | Show sun shadow render targets |
| `r_showsunshadowdebugsplitvis` | false | Show sun shadow split vis |
| `sc_show_gpu_profiler` | false | SceneSystem/GPU Profiler |
| `sc_show_view_profiler` | false | SceneSystem/View Profiler |
| `sc_show_cs_skinning_stats` | false | Compute Skinning Stats |
| `sc_show_texture_visualizer` | false | Texture Visualizer |
| `sc_visualize_sceneobjects` | SCENEOBJECT_VIS_NONE | Visualize SceneObject Mode |
| `sc_aggregate_debug_visualizer` | false | Aggregates Debug Visualizer |
| `sc_instanced_debug_visualizer` | false | Instanced Debug Visualizer |
| `sc_particle_debug_visualizer` | false | Particles Debug Visualizer |
| `sc_rendergraph_debug_visualizer` | false | RenderGraph Visualizer |
| `r_citadel_gpu_debug_draw` | false | GPU debug drawing |
| `mat_debug` | - | Set mat_fullbright debug mode |

---

## Summary of Key New Optimizations (Feb 2025)

### GPU Culling System
- `r_citadel_gpu_culling` - Main GPU culling toggle
- `r_citadel_gpu_culling_shadows` - GPU culling for shadow views
- `r_citadel_gpu_culling_two_pass` - Two-pass GPU culling

### Shadow Improvements
- `r_citadel_shadow_caching` - Shadow caching system
- `r_citadel_shadow_quality` - Configurable shadow quality
- `r_citadel_gpu_preview_denoise_shadow_passes` - Shadow denoising

### Distance Field Enhancements
- `r_citadel_distancefield_farfield_enable` - Far field distance fields
- `r_citadel_distancefield_shadows` - Distance field shadows
- `r_citadel_distancefield_ao_quality` - DF AO quality settings

### Instanced Rendering
- `sc_instanced_mesh_mesh_shader` - Mesh shader support
- `sc_instanced_mesh_gpu_culling` - GPU culling for instanced
- `sc_instanced_mesh_gpu_occlusion_culling` - GPU occlusion

### Texture Streaming
- `r_texture_budget_dynamic` - Dynamic budget adjustment
- `r_texture_streaming_timesliced` - Time-sliced streaming
- `r_texture_nonstreaming_load` - Immediate load optimization

### Upscaling Support
- `r_citadel_upscaling` - Multi-mode upscaling (FSR/DLSS)
- `r_citadel_fsr3_min_reactiveness` - FSR3 frame generation
- `r_citadel_dlss_settings_mode` - DLSS integration
