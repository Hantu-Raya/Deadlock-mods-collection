# Source 1 to Source 2 Engine Command Changes Research

**Research Date:** February 5, 2026  
**Purpose:** Document Source 1 to Source 2 console command differences for Deadlock (Source 2) config development

---

## Executive Summary

Source 2 engine represents a fundamental architectural change from Source 1. Many console commands from CS:GO/TF2 (Source 1) have been **removed**, **renamed**, or **locked behind sv_cheats/development flags**. CS2 (Counter-Strike 2) is the primary reference for modern Source 2 command availability.

---

## Major Command Categories Affected

### 1. REMOVED Commands (CS:GO → CS2)

Based on community reports and documentation analysis:

| Command | Status in CS2 | Notes |
|---------|---------------|-------|
| `cl_showpos` | **REMOVED** | Previously showed player position/velocity. Removed to prevent lineup exploits |
| `cl_bob_lower_amt` | **REMOVED** | Old bob system removed entirely - new bob system only |
| `cl_bobamt_lat` | **REMOVED** | Part of old weapon bob system |
| `cl_bobamt_vert` | **REMOVED** | Part of old weapon bob system |
| `cl_bobcycle` | **REMOVED** | Part of old weapon bob system |
| `net_graph 1` | **CHANGED** | Still exists but works differently - less detailed info |
| `exit` | **REMOVED** | Use `quit` instead (still works) |
| `cl_righthand 0` | **REMOVED** | Left-hand viewmodel no longer available |
| `status` | **CHANGED** | Behavior modified |
| `exec` | **LIMITED** | Restricted functionality - can't execute external files like SLAM |

### 2. NEW Source 2 Commands

CS2 introduced over **1,000 new console commands** not present in CS:GO:

| Command | Purpose |
|---------|---------|
| `cl_clock_buffer_ticks` | Clock sync margin for packet loss (replaces cl_interp_ratio) |
| `cl_clock_recvmargin_desired` | Network timing margin |
| `cl_clock_correction` | Enable/disable clock correction |
| `r_fullscreen_gamma` | Gamma control (2.8 recommended) |
| `cl_crosshair_recoil` | Crosshair follows recoil |
| `cl_crosshair_t` | T-style crosshair |
| `voice_positional` | Positional voice chat |
| `cl_removedecals` | Remove blood/bullet holes (use `r_cleardecals` instead) |

### 3. CHANGED/LIMITED Commands

| CS:GO Command | CS2 Equivalent | Change |
|---------------|----------------|--------|
| `cl_interp_ratio` + `cl_interp` | `cl_clock_buffer_ticks` | New clock sync system |
| `net_graph` | `net_graph` + `cl_showframe_rate` | Simplified display |
| `mat_queue_mode` | N/A | Multi-threading handled automatically |
| `frame_rate_max` | `frame_rate_max` | Still works but may behave differently |

---

## Source 2 Command Flag System

Source 2 uses an extensive flag system for commands (from CS2 Docs):

### Key Flags:
- **developmentonly** - Only available in dev builds
- **defensive** - Requires `DefensiveConCommands 0` in gameinfo.gi
- **cheat** - Requires sv_cheats 1
- **hidden** - Hidden from normal command listing
- **protected** - Cannot be changed by user
- **clientdll** - Client-side only
- **gamedll** - Server-side only
- **replicated** - Synced between client and server

### Important Note:
As of March 30, 2023 update, many commands received `devonly + defensive` flags. To use these:
1. Set `DefensiveConCommands "0"` in `csgo_core/gameinfo.gi`
2. Commands without defensive flag cannot be used even with this setting

---

## CS2 Competitive Config Patterns

Based on analysis of CS2 autoexec guides and pro configs:

### Essential CS2 Commands for Performance:
```
// frame_rate and Performance
frame_rate_max 0                    // Uncap frame_rate
cl_showframe_rate 1                 // Show frame_rate counter

// Viewmodel
viewmodel_fov 68
viewmodel_offset_x 1.5
viewmodel_offset_y 2
viewmodel_offset_z -2

// Crosshair (new CS2 commands)
cl_crosshair_drawoutline 1
cl_crosshair_outlinethickness 1
cl_crosshair_recoil true
cl_crosshair_t false

// Audio
voice_positional 0           // Disable positional voice

// Network (Source 2 new system)
cl_clock_buffer_ticks 0
cl_clock_correction true
```

### Launch Options Pattern:
```
-high -novid -nojoy +frame_rate_max 0
```

---

## Dota 2 Source 2 Commands (Reference)

Dota 2 was the first Source 2 game (Reborn update, 2015). Key observations:
- Uses same Panorama UI system as Deadlock
- Console command structure similar to CS2
- Many `@panorama_*` commands for UI debugging
- Extensive convar list (4,873+ commands as of 7.21D)

### Relevant Dota 2 Command Patterns:
```
@panorama_max_frame_rate 120
@panorama_show_frame_rate 0
cl_dota_alt_unit_movetodirection 0
```

---

## Implications for Deadlock Config

### Critical Findings:

1. **DO NOT assume Source 1 commands work** - Many TF2/CS:GO commands simply don't exist in Source 2

2. **Command availability varies by game** - CS2, Dota 2, and Deadlock may have different command sets despite all using Source 2

3. **Defensive flags restrict access** - Many performance-related commands may be locked

4. **New clock sync system** - `cl_interp_ratio` concept replaced with `cl_clock_*` commands

5. **Panorama UI commands** - Deadlock uses Panorama (like Dota 2), so `@panorama_*` commands may be relevant

### Commands to Investigate for Deadlock:
- `cl_clock_buffer_ticks` - Network interpolation replacement
- `r_fullscreen_gamma` - Gamma adjustment
- `@panorama_max_frame_rate` - UI framerate cap
- `frame_rate_max` - General framerate cap
- `cl_showframe_rate` - frame_rate display

---

## Sources

1. **CS2 Docs (cs2.poggu.me)** - Complete convar/command dumps
2. **Total CS (totalcsgo.com)** - CS2 command database (1,000+ new commands)
3. **CSDB (csdb.gg)** - CS2 command reference
4. **Dota 2 Wiki** - Source 2 console commands (4,873 commands)
5. **Steam Community Discussions** - Community reports of removed commands
6. **Beebom/CharlieIntel** - CS2 feature comparison articles
7. **AdvancedFX Wiki** - Source 2 HLAE commands

---

## Key Takeaways

| Aspect | Source 1 (TF2/CS:GO) | Source 2 (CS2/Deadlock) |
|--------|---------------------|------------------------|
| Network | `cl_interp`, `cl_interp_ratio` | `cl_clock_buffer_ticks`, `cl_clock_recvmargin_*` |
| Weapon Bob | `cl_bobamt_*`, `cl_bobcycle`, `cl_bob_lower_amt` | **REMOVED** - New bob system only |
| Position Display | `cl_showpos` | **REMOVED** (sv_cheats only) |
| Viewmodel Hand | `cl_righthand 0` | **REMOVED** |
| Net Graph | `net_graph 1` | Simplified version |
| Command Count | ~2,000 | ~3,000+ (1,000+ new) |

---

## Recommendations

1. **Test commands in-game** - Don't assume commands work based on CS:GO knowledge
2. **Use `differences` command** - Lists all convars not at default values
3. **Check command flags** - Many commands may be `developmentonly` or `cheat` flagged
4. **Focus on CS2/Dota 2 docs** - More relevant than Source 1 documentation
5. **Verify Deadlock-specific commands** - Some commands may be game-specific

