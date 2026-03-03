# TF2 Source 1 to Deadlock Source 2 Command Cross-Reference

Generated: February 5, 2026

## Executive Summary

Cross-reference of TF2 Source 1 commands to Deadlock Source 2 equivalents.

## 1. EXACT MATCHES

Command | TF2 Default | Deadlock Default
--------|-------------|------------------
r_shadows | 1 | false
r_decals | 0 | 16
cl_interp | 0.015 | read-only
cl_interp_ratio | 2 | 0
cl_updaterate | 66 | 20
rate | 262144 | 786432
snd_mixahead | 0.05 | 0.001
frame_rate_max | 300 | -
cl_showframe_rate | 0 | -

## 2. SIMILAR COMMANDS

TF2 Command | Deadlock Equivalent
------------|---------------------
mat_picmip | r_texture_lod_scale
mat_trilinear | r_texturefilteringquality
r_rootlod | sc_force_lod_level
r_shadowmaxrendered | r_citadel_shadowdb
cl_cmdrate | cl_tickpacket_send_every_tick
volume | snd_gamevolume
cl_ragdoll_physics_enable | cl_disable_ragdolls
cl_phys_props_enable | sc_clutter_enable

## 3. MISSING COMMANDS

mat_bumpmap, mat_specular, mat_phong
r_dynamic, r_maxdlights, r_worldlights
r_WaterDrawReflection, r_WaterDrawRefraction
All tf_* commands

## 4. NEW IN SOURCE 2

sc_force_lod_level, sc_clutter_enable
r_citadel_*, r_ssao
panorama_max_frame_rate
snd_steamaudio_*

## 5. PERFORMANCE RECOMMENDATIONS

Maximum frame_rate settings:
r_shadows 0
cl_particle_sim_fallback_threshold_ms 1
r_particle_max_draw_distance 3000
cloth_update 0
sc_clutter_enable 0
r_texture_lod_scale 4

## 6. OBSOLETE COMMANDS

These TF2 commands have NO equivalent in Source 2:

### Material System
- mat_bumpmap, mat_specular, mat_phong
- mat_hdr_level, mat_colorcorrection
- mat_reducefillrate, mat_disable_fancy_blending
- mat_antialias, mat_aaquality, mat_alphacoverage
- mat_motion_blur_enabled and variants
- mat_triplebuffered

### Lighting
- r_dynamic, r_maxdlights, r_worldlights
- r_lightaverage, r_worldlightmin
- r_lightcache_zbuffercache
- r_lightmap_bicubic (renamed to r_lightmap_bicubic_filtering)
- r_pixelvisibility_partial
- r_hunkalloclightmaps

### Water
- r_WaterDrawReflection, r_WaterDrawRefraction
- r_waterforceexpensive, r_waterforcereflectentities
- r_cheapwaterstart, r_cheapwaterend

### TF2-Specific
- All tf_* prefixed commands
- hud_escort_interp
- cl_blobbyshadows
- nb_shadow_dist

### Effects
- cl_show_splashes
- tf_impactwatertimeenable
- fx_drawimpactdebris, fx_drawimpactdust, fx_drawmetalspark
- r_drawflecks
- cl_ejectbrass
- cl_muzzleflash_dlight_1st, muzzleflash_light
- cl_fasttempentcollision
- tf_particles_disable_weather
- cl_drawmonitors, tf_monitor_resolution
- tracer_extra
