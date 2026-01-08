# Troubleshooting & Known Issues - Soul & Rejuv Timer Mods

## 🛑 Resolved Critical Issues

### 1. The "Stale Value" Bug (Ghost Panels)
- **Symptom**: Logs show `s=399` but your screen shows `606`. Timer is based on the wrong number.
- **Cause**: Deadlock keeps old, invisible HUD instances in memory (e.g., from previous heroes or menu sessions). The script was attaching to the first `hudDealthGoldLabel` it found, often a hidden one.
- **Fix**: Implemented `findActive()`. This function now iterates through all matching panels and selects **only** the one where `visible === true` and `actualvisibility !== "collapse"`.

### 2. The "Shop Pause" / Frozen Timer
- **Symptom**: Soul timer stops counting down when you close the shop or scoreboard. Resumes only when you reopen it.
- **Cause**: The game engine aggressively pauses JS execution for `hud_gold_and_ap_container` when it's not the primary focus (optimization).
- **Fix**: Added a **Watchdog Timer**. A secondary, independent loop runs every 2 seconds. if it detects the main loop hasn't "ticked" in 5 seconds, it forces a restart of the calculation logic.

### 3. The "30-Second Delay" (Rejuv Timer)
- **Symptom**: After reloading the HUD (`reload_panorama`), the Rejuv timer stays blank or stuck for ~30 seconds before appearing.
- **Cause**: Legacy logic in `rejuvnbufftimer.js` had a 30-second throttle on checking if the player had left the "Hideout" (training map).
- **Fix**: Reduced this check interval from **30s to 2s**. The script now detects match entry almost instantly.

### 4. Game Time Returning 0
- **Symptom**: Timer stuck at calculated max value or `0:00`.
- **Cause**: `Game.GetGameTime()` native API returns `0` in certain HUD contexts or during replays.
- **Fix**: Re-implemented `uiTime()` fallback. If the native API fails, the script parses the text string (e.g., "10:45") directly from the top-bar game clock.

### 5. Script Crashes on Reload
- **Symptom**: "JS Exception! Skipping rest of script" or script stops working entirely after one error.
- **Cause**: Accessing properties like `.text` on a panel handle that became invalid (destroyed) after a HUD reload.
- **Fix**: Added comprehensive `try-catch` blocks and `.IsValid()` checks before every single DOM access. If a panel is missing, it now waits and retries instead of crashing.

---

## ⚠️ Potential Edge Cases (Monitor These)

### A. Multiple HUD Instances
- While `findActive()` is robust, if Valve changes how they hide panels (e.g., setting opacity to 0 instead of collapsing), the script might pick the wrong one again.
- **Debugging**: Look for `[DEBUG] New unsec label found at: ...` logs to see exactly which panel path is being used.

### B. "Collapse" vs "Visible"
- The game uses both `visible` (boolean) and `actualvisibility` (string "collapse"/"visible") properties.
- We check both, but inconsistent engine behavior could theoretically lead to a "race condition" where no panel seems active for a split second during a reload. The Watchdog handles this by retrying.

### C. Performance
- **Watchdog Overhead**: Running a secondary timer adds a tiny amount of CPU overhead. It is negligible (ms), but necessary for the fix.
- **DOM Traversal**: `FindChildrenWithClassTraverse` is expensive if called every frame. We only call it during `boot` or when the active label is lost (re-cache), so runtime performance remains high (60frame_rate+).

---

## 📝 Debugging Guide

If issues persist, check the console for these tags:

| Tag | Module | Meaning |
|-----|--------|---------|
| `[ST-S]` | Soul Timer | Standard logic logs for the Soul Timer mod. |
| `[ST-B]` | Buff Timer | Standard logic logs for the Rejuv/Buff timer mod. |
| `[WD]` | Watchdog | Indicates the loop stalled and was auto-restarted. |
| `[ERR]` | Error | Script caught an exception (usually missing UI) and is recovering. |
| `[DEBUG]` | System | Shows exactly which UI panel path was selected as "Active". |

**To enable logs**: Add `-dev -tools` to Deadlock launch options.
