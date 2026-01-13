# BUFF TIMER KNOWLEDGE BASE (buff_timer_virgin)

**Last Updated:** 2026-01-13
**Status:** Operational (v3 - Dead Player Detection + Optimized Timing)

## OVERVIEW
Comprehensive HUD modification for Deadlock that provides countdown timers for Rejuvenator and Bridge Buff spawns. Features advanced powerup claim detection via minimap analysis, dead player handling, and visual glow feedback with curved gradient overlays.

## FILE STRUCTURE
```
buff_timer_virgin/
├── AGENTS.md                           ← This knowledge base
├── panorama/
│   ├── layout/
│   │   └── hud.xml                     ← Layout + 6 glow overlay panels
│   ├── scripts/
│   │   └── rejuvnbufftimer.js          ← Main logic: timers, detection, glow management
│   └── styles/
│       ├── hud.css                     ← Minimap glow overlays (CSS Hijack pattern)
│       ├── hud_timer.css               ← Timer UI styling and animations
│       └── base/
│           ├── hud.css                 ← Reference of original game styles
│           └── hud_minimap.css         ← Reference (legacy)
```

## CORE FEATURES

### 1. Rejuvenator Timer
- **Logic**: Tracks game time to predict Rejuvenator spawns.
- **Phases**: 600s (Initial) → 420s (2nd) → 360s (3rd) → 300s (Repeating).
- **UI**: Displayed near the bottom-left of the HUD.

### 2. Bridge Buff Timer
- **Logic**: 5-minute (300s) fixed cycle for powerup spawns.
- **UI**: Displayed near the bottom-right of the HUD.

### 3. Powerup Claim Detection (v3)
- **Pre-tracking**: Starts 10s before spawn using `knownSpawnPos` cached from previous cycles.
- **Position Detection**: Multi-fallback system (see Position Detection section below).
- **Dead Player Handling**: Hybrid approach using `playerdead` class + 2s grace period + position tracking.
- **Player Caching**: `_playerCache` with 400ms TTL to avoid repeated DOM traversal.
- **Claim Logic**: Monitors `map_button.powerup_spawn.active` panels. When they disappear, compares the minimum distance of allies vs enemies recorded during the spawn period.
- **Default**: If no one is within `CLAIM_RADIUS` (8 units), defaults to ENEMY claim.

### 4. Visual Feedback (Minimap Glows) - V2
- **Architecture**: 6 dedicated overlay panels (not classes on `hud_minimap`)
- **Panels**: `MinimapGlowLeft`, `MinimapGlowLeftTop`, `MinimapGlowLeftBot`, `MinimapGlowRight`, `MinimapGlowRightTop`, `MinimapGlowRightBot`
- **Sizing**: 135% (main) / 120% (corners) of minimap, centered
- **Curved Effect**: Diagonal gradients on corner panels simulate arc curvature
- **Colors**:
  - `survival`: Green (#64FF64)
  - `casting`: Purple (#B464FF)
  - `movement`: Blue (#64C8FF)
  - `gun`: Orange (#FFB450)
  - `enemy`: Red (#FF3232)
- **Animation**: `glowPulse` (2s, 5% scale + opacity) / `enemyPulse` (0.5s, 8% scale, 6 iterations)

## TECHNICAL SPECIFICATIONS

### Dead Player Detection (v3 - Hybrid Approach)
```javascript
const DEATH_GRACE_MS = 2000;  // 2s eligibility window after death
let _playerState = {};         // {id: {x, y, deadTs}}

// For each player in detection loop:
if (isDead) {
  const posChanged = position moved >0.5% since last read
  const diedRecently = now - deathTime < 2000ms
  
  if (!posChanged && !diedRecently) continue;  // Skip stale dead player
  // Otherwise: still eligible (died on powerup OR respawned)
}
```

| Scenario | Handled? |
|----------|----------|
| Player dies ON powerup | ✅ Within 2s grace period |
| Player respawns after 3s, claims | ✅ Position changed = eligible |
| Dead player, no movement, >2s | ❌ Excluded (correct) |
| Player killed by enemy claiming | ✅ Their last position still counted |

### Position Detection (Multi-Fallback)
```javascript
// Priority order:
1. style.position "X% Y%" parsing (primary)
2. style.marginLeft/marginTop percentage parsing
3. Pixel offset → percentage conversion using minimap dimensions
```

### Player Detection Optimizations
- Cache `FindChildrenWithClassTraverse("map_button")` results for 400ms
- Track per-player state: `{x, y, deadTs}` for death handling
- Skip panels with (0,0) position (invalid data)
- Check `IsValid()` before accessing panel properties
- Detect allies via: `friend`, `ally`, `team1` classes
- Detect enemies via: `enemy`, `team2` classes
- Detect dead players via: `playerdead` class

### State Machine
```
                     buffRem <= 10s (and knownSpawnPos exists)
                              │
                              ▼
                       ┌─────────────┐
                       │ PRE-TRACK   │  ← Track player distances to cached spawn positions
                       │ (10s→0s)    │     750ms polling interval
                       └─────────────┘
                              │
                     Timer resets (0:01 → 5:00)
                              │
                              ▼
IDLE ──(timer reset)──► SCANNING ──(found powerups)──► MONITORING ──(powerup gone)──► CHECKING
          │                 │                               │                              │
          │                 v (1.5s timeout)                v (all claimed)               v
          │               IDLE                            IDLE                          IDLE
          │               (fallback scan at 3s)
          │
          └── Cache powerup positions to knownSpawnPos for next cycle's PRE-TRACK
```

### Key Constants (`rejuvnbufftimer.js`)
| Constant | Value | Description |
|----------|-------|-------------|
| `BRIDGE_DUR` | 300 | 5-minute powerup cycle duration |
| `CLAIM_RADIUS` | 8 | Distance threshold (percentage units) for valid claim |
| `POWERUP_LINGER` | 1500 | Window (ms) to scan for powerup panels after timer reset |
| `MONITOR_INTERVAL` | 300 | Frequency of position checks during monitoring |
| `PRETRACK_INTERVAL` | 750 | Frequency of position checks during pre-tracking |
| `BUTTON_CACHE_TTL` | 400 | Cache duration for map_button traversal results |
| `DEATH_GRACE_MS` | 2000 | Time window where dead player is still eligible |

### UI Panel References (cached in `UI` object)
| Key | Panel ID | Purpose |
|-----|----------|---------|
| `glowLeft` | MinimapGlowLeft | Main left glow overlay |
| `glowRight` | MinimapGlowRight | Main right glow overlay |
| `minimap` | hud_minimap | Reference for dimension calculations |

## PANORAMA CSS LEARNINGS (CRITICAL)

### What DOES NOT Work
| Feature | Symptom | Alternative |
|---------|---------|-------------|
| `box-shadow` | No visual effect | Use gradient overlays |
| `clip: rect()` | Unreliable/ignored | Use separate panels per region |
| Radial gradients | Don't render as expected | Use multiple linear gradients |
| `url("")` in background-image | Compile error | Cannot layer gradients this way |
| `transform: scale3d` | Clipping with text-shadow | Use `pre-transform-scale2d` |

### What DOES Work
| Feature | Usage |
|---------|-------|
| Linear gradients | `gradient(linear, startX startY, endX endY, from(), color-stop(), to())` |
| `overflow: noclip` | Required on parent for glow to extend beyond bounds |
| `pre-transform-scale2d` | Animation scaling without clipping issues |
| `border-radius: 50%` | Circular panels |
| Multiple overlay panels | Layering effects by stacking panels in XML |

### Curved Glow Pattern (Using Linear Gradients)
```css
/* Main horizontal glow */
.glow-left.glow-survival {
    background-color: gradient(linear, 0% 50%, 60% 50%, from(rgba(100,255,100,0.9)), color-stop(0.25, rgba(100,255,100,0.3)), to(rgba(100,255,100,0)));
}

/* Top-left diagonal for curve */
.glow-left-top.glow-survival {
    background-color: gradient(linear, 8% 8%, 55% 55%, from(rgba(100,255,100,0.7)), color-stop(0.3, rgba(100,255,100,0)), to(rgba(100,255,100,0)));
}

/* Bottom-left diagonal for curve */
.glow-left-bot.glow-survival {
    background-color: gradient(linear, 8% 92%, 55% 45%, from(rgba(100,255,100,0.7)), color-stop(0.3, rgba(100,255,100,0)), to(rgba(100,255,100,0)));
}
```

## DEBUGGING

### Debug Tags (`[BT-P]`)
- `[BT-P] PRE-TRACK started`: Entered 10s pre-spawn window.
- `[BT-P] RESET DETECTED`: Timer reset from 0 to 300.
- `[BT-P] LOCKED LEFT/RIGHT`: Powerup panel identified and position stored.
- `[BT-P] ... GONE`: Powerup disappeared, triggering claim check.
- `[BT-P] ALLY/ENEMY claimed`: Final result of claim detection.
- `[BT-P] Applied glow: ...`: Glow class added to overlay panel.

### Common Issues & Fixes
| Issue | Cause | Resolution |
|-------|-------|------------|
| Distance is Infinity | Panel properties (`actualxoffset`) return 0 | Multi-fallback position parsing. |
| Enemy not detected | Active class filter was too strict | Removed `.active` requirement. |
| Stale glows | `clearGlows` not called | Ensure `clearGlows()` runs on reset and after all claims. |
| Glow inside minimap | `box-shadow` doesn't work | Use gradient overlay panels at 135% size. |
| Glow clipped | Parent has `overflow: clip` | Add `#HudMinimapContainer { overflow: noclip; }` |
| Position (0,0) spam | Invalid panel data | Skip panels with zero position in detection loop. |
| Dead player counted | No death detection | Check `playerdead` class + 2s grace period. |

## BUILD COMMAND
```powershell
"F:\Users\Shiv\Desktop\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\buff_timer_virgin"
```

## CHANGELOG

### 2026-01-13: v3 - Dead Player Detection + Timing Optimization
- Added `playerdead` class detection for dead players
- Hybrid eligibility: 2s grace period OR position changed after death
- Per-player state tracking: `_playerState = {id: {x, y, deadTs}}`
- Reduced `POWERUP_LINGER` from 5000ms to 1500ms (faster lock-on)
- Reduced `MONITOR_INTERVAL` from 500ms to 300ms (faster claim detection)
- Increased `PRETRACK_INTERVAL` from 500ms to 750ms (can be slower pre-spawn)
- Increased `BUTTON_CACHE_TTL` from 200ms to 400ms (less traversal)
- Added fallback scan at 3s if no powerups found during LINGER window
- Cache clearing in `reset()` function for `_playerCache` and `_playerState`

### 2026-01-12: Glow System v2
- Replaced `box-shadow` approach with gradient overlay panels
- Added 6 glow panels (main + corners for curved effect)
- 135%/120% sizing for outward glow appearance
- Diagonal gradients simulate arc curvature

### 2026-01-12: Position Detection Improvements
- Added `_playerCache` with TTL
- Multi-fallback position parsing (style.position → margin → pixel conversion)
- Skip invalid (0,0) positions
- Added `ally` class to friend detection
