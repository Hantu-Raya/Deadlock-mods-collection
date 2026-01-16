# PREDI2 - Mid Boss Timer Alert

## OVERVIEW
Plays a sound alert 10 seconds before each 5-minute mark (4:50, 9:50, 14:50, etc.) to remind players about mid boss spawns.

## FEATURES
- **Timed Alerts**: Sound plays at 4:50, 9:50, 14:50, 19:50, etc.
- **Robust Game Time**: 4-tier fallback chain for reliable time tracking
- **Full HUD Context**: Uses `hud.xml` for proper API access
- **Debug Logging**: Extensive console output when `IS_DEV: 1`

---

## DEVELOPMENT HISTORY: WHAT WENT WRONG & HOW WE FIXED IT

### Problem 1: Sound Not Playing
**Symptom**: Script ran but no sound was heard.

**Root Cause**: Used wrong sound API.
```javascript
// WRONG - This API doesn't exist in Panorama UI context
Game.EmitSound2D("MidTimer.Alarm");
```

**Solution**: Use the correct Panorama event dispatch.
```javascript
// CORRECT - Panorama's sound event system
$.DispatchEvent("PlaySoundEffect", "MinimapReminder.Alarm");
```

**Lesson**: Panorama UI uses `$.DispatchEvent("PlaySoundEffect", soundName)`, not `Game.EmitSound2D()`.

---

### Problem 2: No Console Logs Showing
**Symptom**: No `[Predi2]` logs appeared in console at all.

**Root Cause**: Debug flag was set to 0, AND the script might not be loading.

**Solution**: 
1. Set `IS_DEV: 1` in CONFIG
2. Add immediate boot log: `$.Msg("[Predi2] === SCRIPT LOADED ===\n");`
3. Launch game with `-dev` flag to enable console

**Lesson**: Always add an immediate `$.Msg()` at script start to confirm loading.

---

### Problem 3: GameTime Always 0
**Symptom**: Logs showed `GameTime: 0s | Clock: null`

**Root Cause**: Using `base_hud_and_db_overlay.xml` which runs in an **overlay context** - a separate panel tree from the main HUD.

**What We Tried (Failed)**:
```javascript
// Simple approach - returned 0
function getGameTime() {
    try { return Game.GetGameTime(); } catch (e) {}
    return 0;
}
```

**Why It Failed**: 
- `base_hud_and_db_overlay.xml` creates an overlay panel
- Overlays are **siblings** to `CitadelHud`, not children
- `Game.GetGameTime()` may not be available in overlay context
- Cannot traverse to find clock panel because it's in a different branch

**Panel Hierarchy**:
```
Root (WindowRoot)
├── CitadelHud (main HUD - has Game API access, clock panels)
│   ├── TopBar
│   │   └── GameTime (clock panel)
│   └── ... other HUD elements
├── base_hud_and_db_overlay (our overlay - ISOLATED)
│   ├── CitadelOverlay
│   └── MinimapReminder_Container
└── ... other overlays
```

**Solution**: Rename `base_hud_and_db_overlay.xml` → `hud.xml`

This makes our mod **replace the main HUD** instead of being an overlay, giving us:
- Full `CitadelHud` context
- Access to `Game.GetGameTime()` API
- Ability to find clock panels via `FindChildTraverse()`

---

### Problem 4: Clock Panel Not Found
**Symptom**: `Clock: null` even after switching to `hud.xml`

**Root Cause**: Clock panel has different IDs in different game versions, and panel might not exist at boot time.

**Solution**: Multi-strategy clock discovery with caching.
```javascript
var TIME_IDS = ["HudGameTime", "GameTime", "MainGameTime", "TopBarGameClock"];

function findClock() {
    // Strategy 1: Search by ID
    for (var i = 0; i < TIME_IDS.length; i++) {
        var p = root.FindChildTraverse(TIME_IDS[i]);
        if (p && p.text) return p;
    }
    
    // Strategy 2: Search by class
    var arr = root.FindChildrenWithClassTraverse("GameTime");
    if (arr && arr[0] && arr[0].text) return arr[0];
    
    // Strategy 3: TopBar traversal
    var topBar = root.FindChildTraverse("TopBar");
    if (topBar) {
        var clock = topBar.FindChildTraverse("GameTime");
        if (clock && clock.text) return clock;
    }
    
    return null;
}
```

**Also Added**: 1-second boot delay to let HUD fully load before searching.

---

### Problem 5: Random Interval vs Fixed Game Time
**Symptom**: Original Predi2 played sound every 10-20 seconds randomly.

**Root Cause**: Design was for "minimap reminder" with random intervals, not mid boss timer.

**Original Code**:
```javascript
// Random interval approach
timeLeft = GetWeightedRandomTime(10.0, 20.0);
if (timeLeft <= 0) {
    $.DispatchEvent("PlaySoundEffect", soundName);
    timeLeft = GetWeightedRandomTime(10.0, 20.0);
}
```

**Solution**: Changed to game-time-based alerts.
```javascript
// Fixed game time approach
var FIRST_ALERT = 290;  // 4:50
var INTERVAL = 300;     // 5 minutes

if (currentTime >= FIRST_ALERT) {
    var alertNum = Math.floor((currentTime - FIRST_ALERT) / INTERVAL);
    var alertTime = FIRST_ALERT + (alertNum * INTERVAL);
    
    if (currentTime >= alertTime && 
        currentTime <= alertTime + 3 &&  // 3-sec window
        lastAlertTime < alertTime) {
        $.DispatchEvent("PlaySoundEffect", soundName);
        lastAlertTime = alertTime;
    }
}
```

---

## SUMMARY: KEY LESSONS LEARNED

| Problem | Wrong Approach | Correct Approach |
|---------|---------------|------------------|
| Sound API | `Game.EmitSound2D()` | `$.DispatchEvent("PlaySoundEffect", name)` |
| Game Time | Bare `Game.GetGameTime()` | 4-tier fallback + UI clock parsing |
| XML Entry | `base_hud_and_db_overlay.xml` | `hud.xml` (full HUD context) |
| Clock Panel | Single ID search | Multiple IDs + class + TopBar fallback |
| Boot Timing | Immediate execution | 1s delay + retry logic |
| Debugging | No logs | `$.Msg()` with `[Tag]` prefix + `\n` |

---

## STRUCTURE
```
test/Predi2/
├── panorama/
│   ├── layout/
│   │   └── hud.xml                    # Full HUD replacement (main entry)
│   ├── scripts/
│   │   └── minimap_reminder.js        # Timer logic with gTime() fallback
│   └── styles/
│       └── minimap_reminder.css       # (Currently unused)
├── soundevents/
│   └── world_ambient_emitters.vsndevts # Defines MinimapReminder.Alarm
├── sounds/
│   └── mods/
│       └── timer_alarm.wav            # Alert sound file
└── README.txt
```

## LOGIC (`minimap_reminder.js`)

### Configuration
```javascript
var CONFIG = {
    FIRST_ALERT: 290,      // 4:50 (5 min - 10 sec)
    INTERVAL: 300,         // 5 minutes
    SOUND_NAME: "MinimapReminder.Alarm",
    TICK_RATE: 1.0,        // Check every 1 second
    TIME_CACHE_TTL: 500,   // Cache game time for 500ms
    IS_DEV: 1              // Debug logging enabled
};
```

### Game Time Fallback Chain
The mod uses a robust 4-tier fallback for getting game time:

1. `Game.GetGameTime()` - Primary Panorama API
2. `GameUI.GetGameTime()` - Alternative API
3. `Game.GetDOTATime()` - Legacy DOTA 2 API
4. **UI Clock Parsing** - Parse clock text from HUD panels

```javascript
function gTime() {
    // Try Game.GetGameTime
    try { t = Game.GetGameTime(); } catch (e) {}
    if (t > 0) return t;
    
    // Try GameUI.GetGameTime
    try { t = GameUI.GetGameTime(); } catch (e) {}
    if (t > 0) return t;
    
    // Try Game.GetDOTATime (legacy)
    try { t = Game.GetDOTATime(false, false); } catch (e) {}
    if (t > 0) return t;
    
    // Fallback to UI clock parsing
    return clockTime();
}
```

### Clock Panel Discovery
Searches for clock panel by multiple IDs and class:
- `HudGameTime`, `GameTime`, `MainGameTime`, `TopBarGameClock`
- Class search: `FindChildrenWithClassTraverse("GameTime")`
- TopBar fallback: `TopBar > GameTime`

### Alert Logic
```javascript
// Plays at 290s, 590s, 890s, 1190s, etc.
if (currentTime >= CONFIG.FIRST_ALERT) {
    var alertNum = Math.floor((currentTime - CONFIG.FIRST_ALERT) / CONFIG.INTERVAL);
    var alertTime = CONFIG.FIRST_ALERT + (alertNum * CONFIG.INTERVAL);
    
    // 3-second trigger window
    if (currentTime >= alertTime && 
        currentTime <= alertTime + 3 && 
        lastAlertTime < alertTime) {
        $.DispatchEvent("PlaySoundEffect", CONFIG.SOUND_NAME);
        lastAlertTime = alertTime;
    }
}
```

## SOUND EVENT
```kv3
MinimapReminder.Alarm = 
{
    base = "Base.UI"
    volume = 1.000000
    pitch = 1.000000
    delay = 0.000000
    vsnd_files = "sounds/mods/timer_alarm.vsnd"
    vsnd_duration = 0.519002
}
```

## DEBUG OUTPUT
When `IS_DEV: 1`, console shows:
```
[Predi2] === SCRIPT LOADED ===
[Predi2] Boot attempt #1
[Predi2] Traversed 3 levels to root. Root ID: CitadelHud
[Predi2] Found HUD panel: CitadelHud
[Predi2] Found clock by ID: GameTime = '5:23'
[Predi2] Boot complete. Clock: found
[Predi2] APIs: Game=true, GameUI=true
[Predi2] Game.GetGameTime() = 323
[Predi2] Tick #10 | GameTime: 333s
[Predi2] !!! ALERT at 590s (target: 590s) !!!
```

## BUILD

**Agent Capability:** I can execute this command directly via bash.

```powershell
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\test\Predi2"
```

## INSTALLATION
1. Compile the mod
2. Copy `test\Predi2_compiled\` to `<Deadlock>\game\citadel\addons\`
3. Ensure `gameinfo.gi` has `Game citadel/addons` in SearchPaths
4. Launch with `-dev` to see console logs

## TIMELINE
| Game Time | Event |
|-----------|-------|
| 4:50 (290s) | First alert |
| 9:50 (590s) | Second alert |
| 14:50 (890s) | Third alert |
| 19:50 (1190s) | Fourth alert |
| ... | Every 5 minutes |

## KNOWN ISSUES
- `Game.GetGameTime()` may return 0 during shop/menu - fallback chain handles this
- Clock panel not found if HUD not fully loaded - 1s boot delay helps
