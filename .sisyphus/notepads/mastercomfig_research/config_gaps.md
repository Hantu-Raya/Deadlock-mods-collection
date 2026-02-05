# Deadlock frame_rate Config Gap Analysis

**Analysis Date:** February 5, 2026  
**Analyst:** Sisyphus-Agent  
**Purpose:** Compare current Deadlock frame_rate config against mastercomfig's approach to identify missing optimizations

---

## Executive Summary

The current `frame_ratenew_organized.txt` config is comprehensive for graphics/rendering but has significant gaps in:
1. **Network optimization** (missing competitive netcode settings)
2. **Input/latency** (missing Reflex/Low Latency optimization)
3. **Audio optimization** (minimal audio tuning)
4. **Launch options** (no documented launch flags)
5. **Module organization** (lacks mastercomfig's tiered approach)

---

## 1. MISSING COMMAND CATEGORIES

### 1.1 Network & Netcode (CRITICAL GAP)

**Current State:** Only basic `cl_clock_buffer_ticks`, `cl_interp_parallel`, `net_async_clientconnect`

**Missing from mastercomfig approach:**

| Command | Current | Mastercomfig Equivalent | Recommendation |
|---------|---------|------------------------|----------------|
| `rate` | NOT SET | `rate 196608` (high) or `rate 786432` (max) | **ADD** - Set to max for competitive |
| `cl_updaterate` | NOT SET | `cl_updaterate 66` (TF2) / `cl_updaterate 60` (CS2 max) | **ADD** - Set to 60 (Deadlock max) |
| `cl_interp_ratio` | NOT SET | `cl_interp_ratio 1` (competitive) | **ADD** - Set to 1 for lowest latency |
| `cq_enable` | NOT SET | `cq_enable 1` (Source 2 command queue) | Already default true, document it |
| `cl_tickpacket_send_every_tick` | NOT SET | Source 2 specific | **INVESTIGATE** - Default true, may help |

**Mastercomfig Network Philosophy:**
- **Competitive:** Lowest possible interpolation (cl_interp_ratio 1)
- **Stable:** Slightly higher buffer for packet loss (cl_interp_ratio 2)
- **Rate:** Always maxed for broadband users

**Recommended Addition:**
```
// ================ NETWORK & NETCODE ================
"rate" "786432"                    // Max bandwidth (768 KB/s) - for stable internet
"cl_updaterate" "60"               // Max updates/sec (Deadlock max is 60)
"cl_interp_ratio" "1"              // [ADJUST] 0=Lowest latency | 1=Competitive | 2=Stable for packet loss
"cl_interp" "0"                    // Read-only in Source 2, controlled by ratio
"cl_clock_buffer_ticks" "0"        // Already set, but document as interp replacement
```

---

### 1.2 Input & Latency (HIGH PRIORITY GAP)

**Current State:** Missing entirely

**Missing Commands Found in CVAR List:**

| Command | Default | Purpose | Recommendation |
|---------|---------|---------|----------------|
| `r_low_latency` | `1` | NVIDIA Reflex / AMD Anti-Lag 2 | **ADD** - Set to 1 or 2 |
| `r_low_latency_trigger_flash` | `true` | Reflex Trigger Flash | **ADD** - Keep true |
| `engine_low_latency_sleep_after_client_tick` | `false` | Sleep timing optimization | **INVESTIGATE** - Test true/false |

**Mastercomfig Approach:**
- Mastercomfig doesn't have direct Reflex control (TF2 predates it)
- But mastercomfig emphasizes **input lag reduction** as primary goal
- `cl_smooth 0` is already in config (good!)

**Recommended Addition:**
```
// ================ INPUT & LATENCY ================
"r_low_latency" "1"                // [ADJUST] NVIDIA Reflex/AMD Anti-Lag: 0=Off | 1=On | 2=On+Boost (NV only)
"r_low_latency_trigger_flash" "1"  // Reflex trigger flash indicator
"engine_low_latency_sleep_after_client_tick" "0"  // [TEST] Try 1 if stuttering
```

---

### 1.3 Audio Optimization (MEDIUM PRIORITY GAP)

**Current State:** Minimal - only `audio_enable_vmix_mastering`, `snd_mix_async`, basic threading

**Missing from mastercomfig approach:**

Mastercomfig has extensive audio modules:
- `snd_mixahead` - Mix ahead time (lower = lower latency)
- `snd_pitchquality` - Pitch interpolation quality
- `dsp_enhance_stereo` - Stereo enhancement
- `dsp_slow_cpu` - CPU-optimized DSP

**Deadlock Audio Commands Available:**

| Command | Default | Purpose | Recommendation |
|---------|---------|---------|----------------|
| `snd_mix_async` | `1` | Async mixing | Already set correctly |
| `snd_steamaudio_num_threads` | `1` | Audio threads | Already set to 1 (good) |
| `snd_steamaudio_reverb_update_rate` | `10` | Reverb update Hz | **ADD** - Lower for frame_rate |
| `audio_enclosure_calc_enabled` | `true` | Interior/exterior audio | **ADD** - Disable for frame_rate |
| `snd_delay_sound_ms_shift` | `23` | Sound delay shift | **INVESTIGATE** |

**Recommended Addition:**
```
// ================ AUDIO OPTIMIZATION ================
"snd_steamaudio_reverb_update_rate" "5"     // Lower reverb update rate (Hz) for CPU savings
"audio_enclosure_calc_enabled" "0"          // Disable interior/exterior audio calculations
"snd_async_showmem" "0"                     // Disable async mem stats overhead
```

---

### 1.4 Frame Rate Limits (MISSING ORGANIZATION)

**Current State:** No frame_rate caps defined

**Available Commands:**

| Command | Default | Purpose |
|---------|---------|---------|
| `frame_rate_max` | `400` | General frame_rate limit |
| `frame_rate_max_ui` | `120` | UI/menu frame_rate limit |
| `frame_rate_max_tools` | `120` | Tools mode frame_rate limit |

**Mastercomfig Approach:**
- `frame_rate_max 0` for uncapped in-game
- Separate UI cap to reduce background load

**Recommended Addition:**
```
// ================ FRAME RATE LIMITS ================
"frame_rate_max" "0"                      // [ADJUST] 0=Uncapped | 300=Common cap | 600=High refresh
"frame_rate_max_ui" "60"                  // Limit frame_rate in menus (saves power/heat)
"frame_rate_max_tools" "60"               // Limit frame_rate in tools mode
```

---

### 1.5 Launch Options (COMPLETELY MISSING)

**Current State:** No documentation

**Mastercomfig Launch Options for TF2:**
```
-high -novid -nojoy +frame_rate_max 0
```

**Deadlock-Specific Launch Options to Document:**
```
// ================ RECOMMENDED LAUNCH OPTIONS ================
// Add to Steam: Right-click Deadlock → Properties → Launch Options

-high                    // High CPU priority (Windows)
-novid                   // Skip intro video
-nojoy                   // Disable joystick support (saves memory)
+exec frame_rate_optimized     // Auto-execute config (if renamed)
```

**Source 2 Specific (Investigate):**
- `-dx11` - Force DX11 (if available)
- `-vulkan` - Force Vulkan (if available on Linux)

---

## 2. COMMANDS TO INVESTIGATE (Source 2 Specific)

These commands exist in Deadlock but need testing:

### 2.1 Command Queue (Source 2 Replacement for Interp)
```
cq_enable                       // Already true, but understand it replaces old interp system
cq_buffer_bloat_msecs_max       // Default 120 - lower for lower latency?
cq_dilation_percentage          // Default 5 - speed adjustment percentage
```

### 2.2 Physics Threading
```
phys_threaded_cloth_bone_update     // Already set to 1
phys_threaded_kinematic_bone_update // Already set to 1
phys_threaded_transform_update      // Already set to 1
// All good, but verify they work in Deadlock
```

### 2.3 Animation Graph
```
animgraph_enable_parallel_update    // Default true
animgraph_parallel_postdataupdate   // Default true
// Already optimized by default
```

---

## 3. MASTERCOMFIG APPROACHES WE SHOULD ADOPT

### 3.1 Module-Based Organization

Mastercomfig organizes by **impact level** and **CPU/GPU usage**:

**Current Config Organization:**
- Good categorical organization
- Missing: Impact indicators, CPU vs GPU classification

**Recommended Enhancement:**
Add [TIER] tags like mastercomfig:
```
// ================ LIGHTING & SHADOWS [TIER 1: VERY HIGH GPU IMPACT] ================
// ================ PARTICLES [TIER 2: MEDIUM CPU/GPU IMPACT] ================
// ================ RAGDOLL [TIER 3: HIGH CPU IMPACT] ================
```

### 3.2 Quality Presets

Mastercomfig provides presets: `very_low`, `low`, `medium`, `high`, `ultra`

**Recommended for Deadlock:**
Create preset sections within the config:
```
// PRESET: MAXIMUM frame_rate (Competitive)
// Uncomment this section for tournament play:
// "r_shadows" "0"
// "cloth_update" "0"
// "cl_phys_timescale" "0"
// "r_texture_lod_scale" "4"

// PRESET: BALANCED (Default)
// Current settings are balanced

// PRESET: QUALITY (Screenshots/Casual)
// Uncomment for better visuals:
/
