# Mastercomfig TF2 Performance Config Analysis

**Repository:** https://github.com/mastercomfig/mastercomfig  
**Version:** 9.100.0 (July 4, 2025)  
**Analysis Date:** 2026-02-05

## Overview
Mastercomfig is the most popular Team Fortress 2 performance configuration. It uses a modular system where presets (low, medium, high, ultra, destitute) set module levels, and each module maps to specific console commands.

---

## Preset Summary

### LOW Preset (config/cfg/presets/low.cfg)
**Target:** Maximum performance on low-end hardware

| Module | Value |
|--------|-------|
| lod | low |
| lighting | low |
| shading | low |
| phong | off |
| shadows | low |
| flashlight | off |
| effects | low |
| tracers | low |
| water | low |
| post_processing | off |
| color_filter | off |
| pyrovision | low |
| romevision | off |
| motion_blur | off |
| anti_aliasing | off |
| characters | very_low |
| decals | off |
| decals_models | off |
| decals_art | off |
| sprays | off |
| gibs | off |
| props | low |
| ragdolls | off |
| 3dsky | off |
| jigglebones | off |
| sheens_speed | slow |
| sheens_tint | high |
| texture_quality | high |
| texture_filter | trilinear |
| ropes | off |
| vsync | off |
| hud_player_model | off |
| hud_panels | low |
| hud_avatars | off |
| killstreaks | low |
| outlines | off |
| sound | low |

**Additional Commands:**
- `tf_quest_map_tuner_wobble_magnitude 0` - Disable red tuner on contracker
- `tf_item_inspect_model_auto_spin 0` - Disable auto-spin in inspect view
- `tf_dashboard_slide_time 0` - Instant transitions

---

### MEDIUM Preset (config/cfg/presets/medium.cfg)
**Target:** Balanced performance and quality

| Module | Value |
|--------|-------|
| lod | medium |
| lighting | medium |
| shading | high |
| phong | rim |
| shadows | medium |
| flashlight | off |
| effects | medium |
| tracers | medium |
| water | medium |
| post_processing | low |
| color_filter | off |
| pyrovision | medium |
| romevision | off |
| motion_blur | off |
| anti_aliasing | msaa_2x |
| characters | medium |
| decals | low |
| decals_models | low |
| decals_art | on |
| sprays | off |
| gibs | low |
| props | low |
| ragdolls | medium |
| 3dsky | off |
| jigglebones | on |
| sheens_speed | slow |
| sheens_tint | high |
| texture_quality | high |
| texture_filter | aniso2x |
| ropes | low |
| vsync | off |
| hud_player_model | on |
| outlines | low |
| sound | high |

---

### HIGH Preset (config/cfg/presets/high.cfg)
**Target:** High quality with good performance

| Module | Value |
|--------|-------|
| lod | high |
| lighting | high |
| shading | high |
| phong | rim |
| shadows | high |
| flashlight | off |
| effects | high |
| tracers | high |
| water | high |
| post_processing | calm |
| color_filter | off |
| pyrovision | high |
| romevision | off |
| motion_blur | off |
| anti_aliasing | msaa_4x |
| characters | high |
| decals | medium |
| decals_models | medium |
| decals_art | on |
| sprays | off |
| gibs | low |
| props | high |
| ragdolls | high |
| 3dsky | on |
| jigglebones | on |
| sheens_speed | slow |
| sheens_tint | high |
| texture_quality | ultra |
| texture_filter | aniso8x |
| ropes | high |
| vsync | off |
| hud_player_model | on |
| outlines | ultra |
| sound | very_high |

---

### ULTRA Preset (config/cfg/presets/ultra.cfg)
**Target:** Maximum visual quality

| Module | Value |
|--------|-------|
| lod | ultra |
| lighting | ultra |
| shading | high |
| phong | rim |
| shadows | ultra |
| flashlight | off |
| effects | ultra |
| tracers | high |
| water | ultra |
| post_processing | calm |
| color_filter | off |
| pyrovision | high |
| romevision | off |
| motion_blur | off |
| anti_aliasing | msaa_8x |
| characters | high |
| decals | ultra |
| decals_models | high |
| decals_art | on |
| sprays | off |
| gibs | high |
| props | ultra |
| ragdolls | high |
| 3dsky | on |
| jigglebones | force_on |
| sheens_speed | slow |
| sheens_tint | high |
| texture_quality | ultra |
| texture_filter | aniso16x |
| ropes | ultra |
| vsync | off |
| hud_player_model | on |
| outlines | ultra |
| sound | ultra |

---

### DESTITUTE Preset (config/cfg/presets/destitute.cfg)
**Target:** Extreme performance - "Negatively affects playability by a lot"

Includes all LOW preset settings PLUS:

| Module | Value |
|--------|-------|
| packet_rate | congestion |
| hud_server_text | off |
| hud_contracts | hide |
| hud_panels | off |
| hud_avatars | off |
| hud_achievement | off |
| match_hud | off |
| messages | off |
| killfeed | off |
| killstreaks | off |
| console | off |
| voice_chat | off |
| logo | off |

**Additional Extreme Commands:**
- `cl_smooth 0` - Skip view smoothing
- `snd_cull_duplicates 1` - Cull duplicate sounds
- `mat_viewportscale .71` - Render at 71% resolution
- `cl_hud_minmode 1` - HUD min mode
- `hud_freezecamhide 1` - Hide HUD during freeze-cam
- `fov_desired 75` - Lower FOV for performance
- `r_drawviewmodel 0` - Hide weapon viewmodel
- `viewmodel_fov 0` - Hide viewmodel effects
- `in_usekeyboardsampletime 0` - Skip keyboard look calculations


---

## Commands by Impact Level

### HIGH IMPACT (Major frame_rate gains)

**Rendering:**
- r_rootlod 2 - Lowest model quality
- r_shadows 0 - Disable shadows
- r_dynamic 0 - Disable dynamic lighting
- mat_viewportscale 0.71 - Render at lower resolution
- r_3dsky 0 - Disable 3D skybox
- cl_ragdoll_physics_enable 0 - Disable ragdoll physics
- props_break_max_pieces 0 - Disable gibs
- r_drawdetailprops 0 - Disable detail props
- cl_phys_props_enable 0 - Disable physics props

**Effects:**
- r_drawflecks 0 - Disable impact flecks
- cl_ejectbrass 0 - Disable shell ejection
- muzzleflash_light 0 - Disable muzzle flash lights
- tf_particles_disable_weather 1 - Disable weather particles
- mat_reduceparticles 1 - Reduce particles

**Characters:**
- r_flex 0 - Disable facial animation
- r_eyes 0 - Disable eye rendering
- r_teeth 0 - Disable teeth rendering

**Water:**
- r_WaterDrawReflection 0 - Disable water reflections
- r_WaterDrawRefraction 0 - Disable water refraction

---

### MEDIUM IMPACT (Moderate frame_rate gains)

**Rendering:**
- mat_bumpmap 0 - Disable bumpmapping
- mat_specular 0 - Disable specular
- mat_phong 0 - Disable phong shading
- mat_antialias 1 - Disable MSAA
- mat_hdr_level 0 - Disable HDR
- mat_colorcorrection 0 - Disable color correction

**Decals:**
- r_decals 1 - Minimum decals
- r_drawmodeldecals 0 - Disable model decals

**Textures:**
- mat_picmip 2 - Low texture quality
- mat_forceaniso 1 - Disable anisotropic filtering
- mat_trilinear 0 - Disable trilinear filtering

**Network:**
- cl_cmdrate 33 - Lower packet rate
- cl_updaterate 33 - Lower update rate

---

### LOW IMPACT (Minor frame_rate gains)

**HUD:**
- cl_hud_playerclass_use_playermodel 0 - Disable player model in HUD
- cl_hud_minmode 1 - Min mode HUD
- hud_freezecamhide 1 - Hide HUD in freeze cam

**Sound:**
- dsp_slow_cpu 1 - Disable enhanced spatialization
- snd_spatialize_roundrobin 3 - Reduce spatialization frequency

**Misc:**
- cl_smooth 0 - Disable view smoothing
- in_usekeyboardsampletime 0 - Skip keyboard calculations
- r_norefresh 1 - Skip unused frame time variable

---

## Source 2 / Deadlock Cross-Reference Notes

### Likely Compatible Commands
These Source 1 commands likely exist in Source 2 (Deadlock):

**Network:**
- cl_cmdrate, cl_updaterate - Network rates
- cl_interp, cl_interp_ratio - Interpolation
- rate - Bandwidth limit

**Rendering:**
- mat_viewportscale - Render scale
- mat_antialias - Anti-aliasing
- mat_vsync - VSync
- mat_picmip - Texture quality
- mat_forceaniso - Anisotropic filtering
- mat_trilinear - Trilinear filtering
- mat_hdr_level - HDR level
- mat_colorcorrection - Color correction
- mat_bloom_scalefactor_scalar - Bloom intensity

**Effects:**
- r_drawviewmodel - Viewmodel visibility
- viewmodel_fov - Viewmodel FOV
- fov_desired - Field of view

**Sound:**
- volume - Master volume
- snd_mixahead - Sound mix ahead
- voice_enable - Voice chat

### Likely Changed/Removed
These may have different names or not exist:

- r_rootlod - May be different LOD system
- r_shadows - Shadow system likely changed
- r_dynamic - Dynamic lighting system different
- r_3dsky - Skybox rendering different
- cl_ragdoll_* - Ragdoll system different
- mat_phong - Shader system changed
- mat_bumpmap / mat_specular - Material system different
- tf_* commands - TF2-specific, won't exist

### New Source 2 Commands to Investigate
Need to find Deadlock equivalents for:

- Particle quality control
- Character model quality
- Shadow quality settings
- Lighting quality
- Post-processing effects

---

## File Structure Reference

config/
├── cfg/
│   ├── presets/
│   │   ├── destitute.cfg    # Extreme performance
│   │   ├── low.cfg          # Low quality
│   │   ├── medium.cfg       # Balanced
│   │   ├── high.cfg         # High quality
│   │   └── ultra.cfg        # Maximum quality
│   └── addons/              # Optional addon configs
├── mastercomfig/
│   └── cfg/
│       └── comfig/
│           ├── comfig.cfg           # Main config (all commands)
│           ├── module_levels.cfg    # Module level aliases
│           ├── define_presets.cfg   # Preset definitions
│           └── modules_run.cfg      # Module execution

---

## Recommended Launch Options

From comfig.cfg:
-novid -nojoy -nosteamcontroller -nohltv -particles 1

---

## Summary Statistics

| Category | Command Count |
|----------|----------------|
| Network | 25+ |
| Rendering (Graphics) | 100+ |
| Sound | 40+ |
| HUD | 50+ |
| Effects | 30+ |
| Input | 15+ |
| TOTAL | 260+ |

---

## Key Commands Extracted from All Presets

### Network Performance
net_maxpacketdrop 0
cl_timeout 60
cl_smoothtime .01
cl_pred_optimize 1
net_queued_packet_thread 581304
net_splitrate 16
net_chokeloop 1
cl_localnetworkbackdoor 0
host_limitlocal 1
net_compresspackets 1
net_compresspackets_minsize 200
net_maxcleartime .005

### Rendering Core
mat_viewportscale 1
mat_softwarelighting 0
r_hunkalloclightmaps 0
mat_postprocess_x 1
mat_forcehardwaresync 1
mat_managedtextures 0
mat_queue_mode -1
mat_bufferprimitives 1

### Optimization
threadpool_affinity 0
engine_no_focus_sleep 0
r_fastzreject 0
r_occludeemaxarea 1
r_occluderminarea 1
r_occludermincount 1
r_norefresh 1
fast_fogvolume 1
r_radialfog_force 1
mod_offline_hdr_switch 1
mat_forcemanagedtextureintohardware 0
mat_requires_rt_alloc_first 0

### Sound
snd_mixahead .05
snd_delay_sound_shift .000001
snd_noextraupdate 1
snd_async_fullyasync 1
snd_async_minsize 0
snd_async_spew_blocking 0

### Memory
lzma_persistent_buffer 1
filesystem_max_stdio_read 64

---

*Generated for Deadlock mod research - comparing Source 1 (TF2) to Source 2 performance commands*
