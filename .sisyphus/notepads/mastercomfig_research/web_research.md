# Mastercomfig TF2 Performance Commands Research

**Research Date:** February 5, 2026  
**Purpose:** Research mastercomfig documentation to understand high-impact TF2 performance commands for Deadlock (Source 2) cross-reference  
**Researcher:** Sisyphus-Junior

---

## Executive Summary

Mastercomfig is the gold standard for TF2 optimization, providing a modern customization framework based on Source engine code analysis rather than guesswork. This research identifies the highest-impact performance commands from mastercomfig's documentation and presets, with analysis of which may translate to Source 2 / Deadlock.

**Key Finding:** Mastercomfig organizes commands into "modules" with documented CPU/GPU usage levels - this approach should be replicated for Deadlock frame_rate configs.

---

## Official Documentation Sources

### Primary Documentation
- **Website:** https://mastercomfig.com/
- **Docs Portal:** https://docs.comfig.app/latest/
- **GitHub:** https://github.com/mastercomfig/mastercomfig
- **App:** https://comfig.app/app/

### Key Documentation Pages
1. **Modules Documentation:** https://docs.comfig.app/latest/customization/modules/
2. **Launch Options:** https://docs.comfig.app/latest/customization/launch_options/
3. **Console Variables:** https://docs.comfig.app/latest/tf2/cvarlist_win/
4. **Misconceptions:** https://docs.comfig.app/latest/tf2/misconceptions/

---

## Mastercomfig Module System

Mastercomfig uses a "module" system where related commands are grouped with specific quality levels. Each module lists CPU and GPU usage intensity.

### Module Categories

#### 1. Graphics Modules (Highest Impact)

| Module | CPU Usage | GPU Usage | Description |
|--------|-----------|-----------|-------------|
| **lighting** | medium | **high** | Dynamic lights, lightmaps, lightwarps, ambient boost |
| **shading** | low | **high** | Bumpmaps, specular, texture blending |
| **phong** | low | **high** | Phong highlights for shading |
| **shadows** | **high** | medium | Dynamic shadow quality |
| **water** | **high** | **high** | Water reflections quality |
| **effects** | medium | medium | Weapon effects, particles, misc effects |
| **post_processing** | medium | medium | Bloom, HDR, color filters |
| **anti_aliasing** | none | medium | MSAA anti-aliasing |
| **texture_quality** | low | medium | Texture resolution |
| **texture_filter** | none | low | Texture smoothing/filtering |

#### 2. Model/Character Modules

| Module | CPU Usage | GPU Usage | Description |
|--------|-----------|-----------|-------------|
| **lod** (Model Quality) | low | medium | Level of detail for models |
| **characters** | **high** | low | Facial animations, eyes, teeth |
| **props** | **high** | medium | Client-side props, foliage |
| **ragdolls** | **high** | low | Physics simulation for bodies |
| **gibs** | low | medium | Explosion gibs |
| **3dsky** | medium | medium | 3D skybox rendering |

#### 3. Particle/Effect Modules

| Module | CPU Usage | GPU Usage | Description |
|--------|-----------|-----------|-------------|
| **decals** | medium | medium | Bullet holes, blood |
| **decals_models** | medium | medium | Blood on players, prop decals |
| **decals_art** | none | low | Map author decals |
| **sprays** | none | low | Player spray decals |
| **tracers** | low | low | Bullet tracer effects |
| **ropes** | medium | low | Mannpower ropes, map decorations |

#### 4. HUD/UI Modules

| Module | CPU Usage | GPU Usage | Description |
|--------|-----------|-----------|-------------|
| **hud_player_model** | low | medium | 3D player model in corner |
| **match_hud** | **high** | none | Match status HUD |
| **killstreaks** | medium | none | Killstreak banners |
| **hud_panels** | low | none | Health/player info panels |
| **hud_achievement** | low | none | Achievement tracker |

---

## HIGH-IMPACT Performance Commands (10+ frame_rate Potential)

Based on mastercomfig documentation, these modules/settings have the highest performance impact:

### Tier 1: Very High Impact (GPU Heavy)

#### 1. Lighting Module (lighting)
**GPU Usage: HIGH**

```
lighting=very_low    // No dynamic lightmaps, skips movable lighting
lighting=low         // No dynamic lightmaps, ambient only
lighting=medium      // No dynamic lightmaps, detailed movable
lighting=high        // 4 dynamic lightmaps
lighting=ultra       // 32 dynamic lightmaps
```

**Underlying Commands:**
- r_dynamic 0 - Disables dynamic lights
- r_lightaverage 0 - Disables light averaging
- r_ambientboost 0 - Disables ambient boost
- mat_disable_lightwarp 1 - Disables lightwarp
- r_worldlights 0 - Disables world lights
- r_maxdlights 0 - Max dynamic lights

#### 2. Shadows Module (shadows)
**CPU Usage: HIGH | GPU Usage: medium**

```
shadows=off          // No dynamic shadows
shadows=low          // Blobby shadows
shadows=medium       // Up to 11 high quality shadows
shadows=high         // Up to 23 high quality shadows
shadows=ultra        // Up to 160 ultra quality shadows
```

#### 3. Water Module (water)
**CPU Usage: HIGH | GPU Usage: HIGH**

```
water=very_low       // Solid water, 32x render resolution
water=low            // Basic water, 128x resolution
water=medium         // Standard water, 256x resolution
water=high           // Standard + all reflections, 1K resolution
water=ultra          // High quality, 2K resolution
```

#### 4. Shading Module (shading)
**GPU Usage: HIGH**

```
shading=low          // Disables bumpmaps and specular
shading=medium       // Disables bumpmaps and specular
shading=high         // Enables bumpmaps and specular
```

**Underlying Commands:**
- Controls normal maps and specular lighting on surfaces

### Tier 2: High Impact

#### 5. Effects Module (effects)
**CPU Usage: medium | GPU Usage: medium**

```
effects=very_low     // Disables impact effects, muzzle flashes, weather
                     // Reduces particle density
                     // Disables monitors
effects=low          // Same as very_low but monitors disabled
effects=medium       // Disables weather, muzzle flashes
effects=high         // Full particle density, 1K monitors
effects=ultra        // Full density + simulation for all particles
```

#### 6. Post-Processing Module (post_processing)
**CPU Usage: medium | GPU Usage: medium**

```
post_processing=off       // No post-processing
post_processing=low       // Bloom only
post_processing=default   // HDR + bloom (Valve style)
post_processing=calm      // HDR + bloom, reduced blowout (recommended)
post_processing=vivid     // HDR + bloom, glowing highlights
```

#### 7. Model Quality / LOD (lod)
**GPU Usage: medium**

```
lod=low              // Low model detail
lod=medium           // Medium model detail
lod=high             // High model detail
lod=ultra            // Forces max detail regardless of distance
```

**Underlying Commands:**
- r_rootlod 2 - Base LOD level (2 = lowest quality)
- r_lod -1 - Allow lower LODs at distance

#### 8. Anti-Aliasing (anti_aliasing)
**GPU Usage: medium**

```
anti_aliasing=off         // No MSAA
anti_aliasing=msaa_2x     // 2x MSAA
anti_aliasing=msaa_4x     // 4x MSAA
anti_aliasing=msaa_8x     // 8x MSAA
```

### Tier 3: Medium Impact

#### 9. Props Module (props)
**CPU Usage: HIGH | GPU Usage: medium**

```
props=low            // Disables client-side props, disables foliage
props=high           // Some client props, foliage at distance
props=ultra          // High client props, foliage everywhere
```

#### 10. Ragdolls Module (ragdolls)
**CPU Usage: HIGH | GPU Usage: low**

```
ragdolls=off         // Disables ragdolls (fast fade)
ragdolls=medium      // Standard physics ragdolls
ragdolls=high        // Ragdolls with collisions, high fade time
```

#### 11. Decals Modules (decals, decals_models)
**CPU Usage: medium | GPU Usage: medium**

```
decals=off           // Disables all decals
decals=low           // 9 max decals
decals=medium        // 32 max decals
decals=high          // 80 max decals
decals=ultra         // 2048 max decals

decals_models=off    // Disables model decals
decals_models=low    //
// 1 model decal max
decals_models=medium // 9 model decals
decals_models=high   // 50 model decals
```

#### 12. Texture Quality (texture_quality)
**GPU Usage: medium**

```
texture_quality=low         // Low texture quality
texture_quality=medium      // Medium texture quality
texture_quality=high        // High texture quality
texture_quality=very_high   // Very high texture quality
texture_quality=ultra       // Maximum texture quality
```

---

## Low Preset Configuration (Maximum frame_rate)

From mastercomfig's low preset - the most aggressive performance configuration:

```cfg
// Low preset - Maximum Performance
lod=low
lighting=low
shading=low
phong=off
shadows=low
flashlight=off
effects=low
tracers=low
water=low
post_processing=off
color_filter=off
pyrovision=low
romevision=off
motion_blur=off
anti_aliasing=off
characters=very_low
decals=off
decals_models=off
decals_art=off
sprays=off
gibs=off
props=low
ragdolls=off
3dsky=off
jigglebones=off
sheens_speed=slow
sheens_tint=high
texture_quality=high        // Note: Still high - textures are GPU-cached
texture_filter=trilinear
ropes=off
vsync=off
hud_player_model=off
hud_panels=low
hud_avatars=off
killstreaks=low
outlines=off
sound=low
```

---

## Recommended Launch Options

From mastercomfig documentation:

```
-novid -nojoy -nosteamcontroller -nohltv -particles 1
```

**Explanation:**
- -novid - Disables Valve startup logo (faster startup)
- -nojoy - Stops joystick system (faster startup, less memory)
- -nosteamcontroller - Disables Steam controller system
- -nohltv - Disables SourceTV hosting (less resources)
- -particles 1 - Limits beam count to minimum (512)

### Additional Launch Options

```
-console              // Display console on startup
-nostartupsound       // Disable game music on main menu
-no_texture_stream    // Disable texture streaming (for powerful systems)
-freq x               // Force refresh rate (e.g., -freq 144)
```

---

## Common Misconceptions (What NOT to Use)

Mastercomfig explicitly warns against these commonly-copied commands:

### Bad Launch Options
| Command | Why It's Bad |
|---------|--------------|
| -high | Only for short-lived threads; unbalances resources |
| -threads | Source auto-determines this; caps at 3 due to issues |
| -heapsize | Does not exist; never worked in Source |
| -nod3d9ex | Disables optimizations that improve alt-tab and memory |
| +exec autoexec | autoexec.cfg already runs on startup |
| +map_background | Not needed; TF2 has advanced preload system |

### Bad CVars
| Command | Why It's Bad |
|---------|--------------|
| r_lod 2 | Forces LOD 2; lowest quality is LOD 7. Use r_lod -1 instead |
| mat_max_worldmesh_vertices 512 | Minimum is 1024 |
| mat_forcehardwaresync 0 | Increases input lag |
| cl_forcepreload | Removed; caused massive hitches at surprising times |
| rate 60000 | Lower than default (80000); reduces network performance |
| rope_averagelight 0 | Loops through cubemaps; REDUCES performance |

---

## Source 2 / Deadlock Relevance Analysis

### Commands Likely Applicable to Source 2

Based on engine similarities, these TF2 commands likely have Source 2 equivalents:

| TF2 Command | Source 2 Equivalent | Relevance |
|-------------|---------------------|-----------|
| r_dynamic | Likely exists | HIGH - Dynamic lighting |
| r_shadows | Likely exists | HIGH - Shadow rendering |
| mat_picmip | r_texture_pool_size? | HIGH - Texture quality |
| r_rootlod | Likely exists | MEDIUM - Model LOD |
| r_drawtracers | Likely exists | LOW - Tracer effects |
| muzzleflash_light | Likely exists | LOW - Muzzle flash |
| func_break_max_pieces | Unknown | LOW - Breakable props |

### Commands NOT Applicable to Source 2

| TF2 Command | Reason |
|-------------|--------|
| mat_dxlevel | Source 2 uses different rendering pipeline |
| r_3dsky | May be implemented differently |
| r_worldlights | Source 2 uses different lighting system |
| mat_disable_lightwarp | Source 2 doesn't use lightwarps |

### Source 2 Specific Commands (from CS2/Dota 2)

| Command | Description | Impact |
|---------|-------------|--------|
| r_particle_max_draw_distance | Particle cull distance | HIGH |
| r_texture_pool_size | VRAM texture allocation | HIGH |
| panorama_max_frame_rate | UI framerate cap | MEDIUM |
| mat_async_shader_load | Async shader compilation | MEDIUM |
| cloth_update | Cloth physics update rate | LOW-MEDIUM |

---

## Key Insights for Deadlock frame_rate Config

### 1. Module-Based Approach
Mastercomfig's module system is superior to flat command lists. Consider organizing Deadlock commands by:
- Rendering (shadows, lighting, post-processing)
- Models (LOD, textures, characters)
- Effects (particles, tracers, decals)
- Network (interpolation, rate, cmdrate)
- Audio (quality, spatialization)

### 2. Hardware Usage Documentation
Document CPU vs GPU impact for each setting - helps users optimize for their bottleneck.

### 3. Preset System
Provide presets like mastercomfig:
- Ultra - Maximum quality
- High - High quality, some optimizations
- Medium - Balanced
- Low - Performance focused
- Very Low - Maximum frame_rate

### 4. Evidence-Based Values
Mastercomfig values are based on Source code analysis, not guesswork. Deadlock config should similarly:
- Test each command individually
- Measure frame_rate impact scientifically
- Document WHY each value is set

### 5. Version-Specific Notes
Mastercomfig warns about commands that don't exist or were removed. Deadlock config should:
- Remove obsolete commands
- Verify commands exist in current build
- Document game version compatibility

---

## Recommendations for Deadlock Config

### Immediate Actions

1. **Adopt Module Structure**
   - Group related commands
   - Document CPU/GPU impact
   - Provide quality level options

2. **Fix r_particle_max_draw_distance**
   - Current: 700000 (too high)
   - Recommended: 3000-5000
   - Source: Mastercomfig equivalent particle culling

3. **Add Missing High-Impact Commands**
   - r_texture_pool_size (VRAM-specific)
   - panorama_max_frame_rate (UI latency)
   - r_dynamic (dynamic lighting)

4. **Remove/Verify Questionable Commands**
   - cl_smooth - Not in Source 2
   - sc_clutter_enable - Verify existence
   - cloth_update - Test visual impact

### Long-Term

5. **Create Preset System**
   - Low, Medium, High, Ultra presets
   - Document frame_rate expectations
   - Provide screenshots for comparison

6. **Benchmarking**
   - Create standardized benchmark
   - Test each module's frame_rate impact
   - Publish results

---

## Sources

1. Mastercomfig Documentation - https://docs.comfig.app/latest/
2. Mastercomfig Modules - https://docs.comfig.app/latest/customization/modules/
3. Mastercomfig Launch Options - https://docs.comfig.app/latest/customization/launch_options/
4. Mastercomfig Misconceptions - https://docs.comfig.app/latest/tf2/misconceptions/
5. Mastercomfig GitHub - https://github.com/mastercomfig/mastercomfig
6. Mastercomfig Low Preset - https://github.com/mastercomfig/mastercomfig/blob/release/config/cfg/presets/low.cfg
7. Mastercomfig Ultra Preset - https://github.com/mastercomfig/mastercomfig/blob/release/config/cfg/presets/ultra.cfg

---

*Research compiled for Deadlock frame_rate config optimization. Mastercomfig is the authoritative source for Source engine performance optimization.*
