# Speedometer Implementation Research
 
**Date:** 2026-01-11
**Purpose:** Research TF2 speedometer HUD mechanics and verify Deadlock Panorama API availability for implementing a speed display mod
 
---
 
## Table of Contents
1. [TF2 Speedometer Architecture (Source 1)](#tf2-speedometer-architecture-source-1)
2. [API Fact-Check: Deadlock](#api-fact-check-deadlock)
3. [Implementation Strategies](#implementation-strategies)
4. [Next Steps](#next-steps)
 
---
 
## TF2 Speedometer Architecture (Source 1)
 
### Overview
TF2 speedometers use **VGUI (Valve Graphical User Interface)**, Source 1's UI framework (precursor to Panorama). Players typically use custom HUD mods that display real-time horizontal movement speed.
 
### Component Breakdown
 
#### 1. HUD Layout Definition (`HudLayout.res`)
```res
"HudSpeedometer"
{
    "fieldName"     "HudSpeedometer"
    "visible"       "1"
    "enabled"       "1"
    "xpos"          "c-50"  // Center horizontal
    "ypos"          "c200"  // Below crosshair
    "wide"          "100"
    "tall"          "20"
}
```
 
#### 2. Data Source Methods
 
**Method A: Client DLL Hook** (requires SourceMod plugin)
- Hooks `CBasePlayer::GetAbsVelocity()` via C++ plugin
- Calculates horizontal speed: `sqrt(vx² + vy²)` (ignores vertical)
- Converts to units/sec or mph/kph
- Updates HUD via `CHudElement::SetDisplayValue()`
- **Accuracy:** High
- **Requirement:** Server/client plugin
 
**Method B: ConVar Tracking** (pure HUD mod)
- Parses output from `cl_showpos 1` console variable
- Reads velocity from developer console buffer
- **Accuracy:** Lower
- **Requirement:** Player must enable `cl_showpos`
 
#### 3. HUD Element Resource Script
```res
"SpeedLabel"
{
    "ControlName"   "CExLabel"
    "fieldName"     "SpeedLabel"
    "font"          "HudFontSmallBold"
    "labelText"     "%speed%"
    "textAlignment" "center"
    "fgcolor"       "255 255 255 255"
}
```
 
#### 4. Animation System (`HudAnimations.txt`)
```
event SpeedFast
{
    Animate SpeedLabel FgColor "255 0 0 255" Linear 0.0 0.1  // Red when fast
}
 
event SpeedSlow
{
    Animate SpeedLabel FgColor "255 255 255 255" Linear 0.0 0.1  // White normal
}
```
 
### Reference File
**Source:** `speedometer.zip` from Dropbox
**Status:** Unable to download due to network restrictions (proxy 403 error)
**URL:** https://www.dropbox.com/s/4m45t5qnayqdt0c/speedometer.zip?dl=1
 
---
 
## API Fact-Check: Deadlock
 
### Current Codebase Analysis
 
**Finding:** Zero usage of velocity/position APIs in the entire repository.
 
**APIs NOT Found in Deadlock-mods-collection:**
- ❌ `Entities.GetVelocity()`
- ❌ `Entities.GetAbsOrigin()` (position)
- ❌ `Entities.GetBaseMoveSpeed()`
- ❌ `Players.*` movement-related methods
- ❌ Any coordinate/position tracking
 
**APIs Actually Used:**
- ✅ `Game.GetGameTime()` - Time tracking
- ✅ `Game.GetDOTATime()` - Legacy time API (fallback)
- ✅ `GameUI.GetGameTime()` - Alternative time source
- ✅ `Entities.GetHealthPercent()` - Mentioned in docs but not used in code
- ✅ UI panel scraping via `FindChildTraverse()`
 
### Dota 2 Panorama API Reference
 
**Source:** [ModDota TypeScript Definitions](https://github.com/ModDota/DotaUI/blob/master/panorama/dota.d.ts)
 
Dota 2's `CScriptBindingPR_Entities` interface includes:
 
#### Position Methods
| Method | Returns | Description |
|--------|---------|-------------|
| `GetAbsOrigin(entityID)` | `[number, number, number]` | World origin coordinates (x, y, z) |
 
#### Movement Speed Methods
| Method | Returns | Description |
|--------|---------|-------------|
| `GetBaseMoveSpeed(entityID)` | `number` | Base movement speed |
| `GetIdealSpeed(entityID)` | `number` | Current effective speed |
| `GetMoveSpeedModifier(entityID, baseSpeed)` | `number` | Speed modifier multiplier |
| `GetHasteFactor(entityID)` | `number` | Haste buff multiplier |
 
#### Movement State Queries
| Method | Returns | Description |
|--------|---------|-------------|
| `IsMoving(entityID)` | `boolean` | Whether entity is moving |
| `HasMovementCapability(entityID)` | `boolean` | Can move at all |
| `HasGroundMovementCapability(entityID)` | `boolean` | Can walk |
| `HasFlyMovementCapability(entityID)` | `boolean` | Can fly |
 
#### Direction Vectors
| Method | Returns | Description |
|--------|---------|-------------|
| `GetForward(entityID)` | `[number, number, number]` | Forward facing vector |
| `GetRight(entityID)` | `[number, number, number]` | Right vector |
| `GetUp(entityID)` | `[number, number, number]` | Up vector |
 
**⚠️ CRITICAL FINDING:** No `GetVelocity()` method exists in Dota 2 Panorama API
 
### Deadlock API Status
 
**Status:** ⚠️ **UNCONFIRMED** - No public documentation available
 
**Likely Scenario:**
- Deadlock uses Source 2 + Panorama (same as Dota 2)
- API surface is likely similar to Dota 2
- `GetAbsOrigin()` and movement speed methods probably exist
- Direct `GetVelocity()` method unlikely
 
**Evidence:**
- No public Deadlock Panorama API documentation found
- No existing speedometer mods in GameBanana community
- Community resources focus on HUD styling, not movement tracking
 
---
 
## Implementation Strategies
 
### Strategy A: Position Delta Tracking
**Requirements:** `Entities.GetAbsOrigin()` + `Game.GetGameTime()`
 
```javascript
(function() {
    'use strict';
 
    const UI = {
        root: $.GetContextPanel(),
        speedValue: null
    };
 
    let lastPos = null;
    let lastTime = 0;
 
    function calculateSpeed() {
        try {
            const player = Players.GetLocalPlayer();
            const entityIdx = Players.GetPlayerHeroEntityIndex(player);
 
            // Get current position and time
            const pos = Entities.GetAbsOrigin(entityIdx); // [x, y, z]
            const time = Game.GetGameTime();
 
            if (lastPos && lastTime && time > lastTime) {
                const dt = time - lastTime;
 
                // Calculate horizontal displacement (ignore Z-axis)
                const dx = pos[0] - lastPos[0];
                const dy = pos[1] - lastPos[1];
 
                // Calculate speed in units/sec
                const speed = Math.sqrt(dx * dx + dy * dy) / dt;
 
                // Update display
                UI.speedValue.text = Math.round(speed).toString();
 
                // Color coding based on speed
                UI.speedValue.SetHasClass('fast', speed > 500);
                UI.speedValue.SetHasClass('very-fast', speed > 750);
            }
 
            // Cache for next frame
            lastPos = pos;
            lastTime = time;
 
        } catch(e) {
            $.Msg('[Speedometer] Error: ' + e);
        }
 
        $.Schedule(0.05, calculateSpeed); // 20 frame_rate polling
    }
 
    function init() {
        UI.speedValue = $('#SpeedValue');
        if (!UI.speedValue) {
            $.Schedule(0.5, init);
            return;
        }
        calculateSpeed();
    }
 
    init();
})();
```
 
**Pros:**
- Accurate real-time velocity
- Works with API similar to Dota 2
- Minimal overhead (vector subtraction)
 
**Cons:**
- Requires 2 frames to calculate (initial frame has no speed)
- Susceptible to teleportation events (needs filtering)
 
---
 
### Strategy B: Direct Speed Getter
**Requirements:** `Entities.GetIdealSpeed()` or `GetBaseMoveSpeed()`
 
```javascript
(function() {
    'use strict';
 
    const UI = {
        root: $.GetContextPanel(),
        speedValue: null
    };
 
    function update() {
        try {
            const player = Players.GetLocalPlayer();
            const entityIdx = Players.GetPlayerHeroEntityIndex(player);
 
            // Direct speed reading
            const baseSpeed = Entities.GetBaseMoveSpeed(entityIdx);
            const idealSpeed = Entities.GetIdealSpeed(entityIdx);
            const modifier = Entities.GetMoveSpeedModifier(entityIdx, baseSpeed);
 
            // Effective speed = base * modifier
            const effectiveSpeed = baseSpeed * modifier;
 
            UI.speedValue.text = Math.round(effectiveSpeed).toString();
 
            // Color based on percentage of base speed
            const speedPercent = (effectiveSpeed / baseSpeed) * 100;
            UI.speedValue.SetHasClass('slowed', speedPercent < 80);
            UI.speedValue.SetHasClass('hasted', speedPercent > 120);
 
        } catch(e) {
            $.Msg('[Speedometer] Error: ' + e);
        }
 
        $.Schedule(0.1, update); // 10 frame_rate
    }
 
    function init() {
        UI.speedValue = $('#SpeedValue');
        if (!UI.speedValue) {
            $.Schedule(0.5, init);
            return;
        }
        update();
    }
 
    init();
})();
```
 
**Pros:**
- Instant, no multi-frame requirement
- Shows "designed" speed including modifiers
- Lower CPU usage
 
**Cons:**
- May not reflect actual movement (e.g., stuck on obstacles)
- Requires multiple API methods for accurate reading
 
---
 
### Strategy C: UI Scraping Fallback
**Requirements:** Debug overlay or HUD element with speed data
 
```javascript
// Similar to TF2 ConVar approach
// Parse from cl_showpos or debug HUD overlay
// NOTE: Likely won't work in Deadlock (no known speed display)
 
function parseSpeedFromDebugOverlay() {
    // Hypothetical - requires finding a panel with speed data
    const debugPanel = $('#ShowPosPanel');
    if (!debugPanel) return 0;
 
    const text = debugPanel.text; // e.g., "vel: 450.23 m/s"
    const match = text.match(/vel:\s*([\d.]+)/);
    return match ? parseFloat(match[1]) : 0;
}
```
 
**Pros:**
- Works without direct API access
 
**Cons:**
- Requires enabled debug ConVar
- Parsing overhead
- Unreliable (format changes break it)
- Likely not viable for Deadlock
 
---
 
## Source 1 vs Panorama Comparison
 
| Feature | Source 1 (TF2) | Panorama (Deadlock) |
|---------|----------------|---------------------|
| **UI Language** | `.res` (KeyValues) + C++ | XML + JavaScript + CSS |
| **Polling** | Native C++ hooks or ConVar | `$.Schedule()` loops |
| **Velocity API** | `GetAbsVelocity()` (C++ side) | `GetAbsOrigin()` (calculate delta) or `GetIdealSpeed()` |
| **Animations** | `HudAnimations.txt` | CSS `@keyframes` or JS |
| **Rendering** | VGUI panels | DOM-like Panorama panels |
| **Performance** | Native refresh | JavaScript event loop |
 
---
 
## Next Steps
 
### 1. Verify API Availability in Deadlock
Run these console commands in Deadlock with `-dev -tools` launch options:
 
```
dump_panorama_js_scopes
```
 
**Alternative commands:**
```
cl_panorama_script_help_2
dump_panorama_events
dump_panorama_css_properties
```
 
**Search output for:**
- `Entities.GetAbsOrigin`
- `Entities.GetIdealSpeed`
- `Entities.GetBaseMoveSpeed`
- `Entities.GetMoveSpeedModifier`
- `Players.GetLocalPlayer`
- `Players.GetPlayerHeroEntityIndex`
 
### 2. Create Test Mod Structure
If APIs are confirmed, scaffold a speedometer mod:
 
```
speedometer/
├── panorama/
│   ├── layout/
│   │   └── speedometer.xml
│   ├── scripts/
│   │   └── speedometer.js
│   └── styles/
│       └── speedometer.css
└── AGENTS.md
```
 
### 3. XML Layout Template
```xml
<root>
    <styles>
        <include src="s2r://panorama/styles/citadel_base_styles.vcss_c" />
        <include src="s2r://panorama/styles/speedometer.css" />
    </styles>
 
    <Panel class="SpeedDisplay" hittest="false">
        <Label id="SpeedValue" text="0" />
        <Label id="SpeedUnit" text="u/s" />
    </Panel>
</root>
```
 
### 4. CSS Styling Template
```css
.SpeedDisplay {
    position: absolute;
    horizontal-align: center;
    vertical-align: bottom;
    margin-bottom: 250px;
    flow-children: right;
    padding: 8px 16px;
    background-color: rgba(0, 0, 0, 0.7);
    border-radius: 4px;
}
 
#SpeedValue {
    font-size: 32px;
    font-weight: bold;
    color: white;
    margin-right: 4px;
    transition: color 0.2s ease;
}
 
#SpeedValue.fast {
    color: #ffcc00; /* Yellow */
}
 
#SpeedValue.very-fast {
    color: #ff3300; /* Red */
    text-shadow: 0px 0px 8px #ff3300;
}
 
#SpeedValue.slowed {
    color: #66ccff; /* Blue */
}
 
#SpeedValue.hasted {
    color: #00ff00; /* Green */
    text-shadow: 0px 0px 8px #00ff00;
}
 
#SpeedUnit {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.7);
    align-self: flex-end;
    margin-bottom: 6px;
}
```
 
### 5. Performance Considerations
Apply patterns from existing mods:
 
- ✅ **Cache panel references** at boot
- ✅ **Use adaptive polling** (0.05s normal, 0.2s when stationary)
- ✅ **Wrap all API calls** in try-catch
- ✅ **Validate entity index** before each call
- ✅ **Add watchdog timer** (detect stalls, restart loop)
- ✅ **Zero allocations** in hot path (no `new Array/Object`)
 
### 6. Integration with Existing Mods
Could combine with:
- `kaiz_hud` - Full HUD redesign
- `combined_timer` - Multi-component display
- `hp/` - Color interpolation patterns
 
---
 
## Research Sources
 
### Official Documentation
- [Dota 2 Panorama JavaScript API](https://developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools/Panorama/Javascript/API)
- [Valve Developer Community - Panorama](https://developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools/Panorama)
- [Strata Source Panorama Wiki](https://wiki.stratasource.org/panorama/overview/getting-started)
 
### Community Resources
- [ModDota TypeScript Definitions](https://github.com/ModDota/DotaUI/blob/master/panorama/dota.d.ts)
- [Deadlock Modding Notes](https://deadlockmodding.pages.dev/)
- [Deadlock Mod Manager](https://deadlockmods.app/)
- [GameBanana Deadlock Mods](https://gamebanana.com/games/20948)
 
### Repository References
- Current repo: `/home/user/Deadlock-mods-collection`
- Workflow docs: `.opencode/workflows/deadlock-modding.md`
- Project knowledge: `AGENTS.md`
- Existing timer implementations: `soul_timer/`, `buff_timer_virgin/`
 
---
 
## Conclusion
 
**TF2 Approach:** Uses native C++ velocity hooks or ConVar scraping via VGUI framework.
 
**Deadlock Status:** API unconfirmed, but likely has position/speed getters similar to Dota 2. No direct `GetVelocity()` method expected.
 
**Recommended Path:**
1. Run `dump_panorama_js_scopes` to verify API
2. Implement Strategy A (position delta) if `GetAbsOrigin` exists
3. Use Strategy B (direct speed) if `GetIdealSpeed` exists
4. Apply repo's performance patterns (caching, adaptive polling, watchdog)
 
**Blockers:**
- Unable to download reference TF2 speedometer.zip (network proxy)
- No public Deadlock Panorama API documentation
- Need in-game console API dump to proceed
 
---
 
**Last Updated:** 2026-01-11
**Next Action:** Run `dump_panorama_js_scopes` in Deadlock console and share output