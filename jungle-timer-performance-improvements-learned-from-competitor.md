# Jungle Timer Performance Improvements (Learned from Competitor)

## Context

The competitor's jungle timer is ~64 lines of JS vs your ~1,178 lines. The competitor is simpler because it has **fewer features** (only 2 hardcoded boon locations, plain text labels, no rings/animations, no kill detection). Your mod is more feature-rich (4 camp types, radial ring animations, color coding, smart fading, DPI scaling, map inversion).

The goal is **not** to strip features, but to adopt the competitor's performance patterns where applicable. Your mod's architecture is already solid (IIFE, delta-checked rendering, coordinate caching) — these are targeted optimizations.

---

## Changes (Ranked by Impact)

### 1. Reduce main loop frequency: 100ms → 500ms (HIGH)
**File:** `panorama/scripts/jungle_timer.js` — Line 1174

The loop runs at 100ms (10x/sec), but scan fires at 500ms and render at 250ms. Most iterations just check timestamps and exit. The competitor polls at 1000ms.

**Change:** `$.Schedule(0.1, loop)` → `$.Schedule(0.5, loop)`. Remove `NEUTRAL_RENDER_INTERVAL_MS` and merge render into the scan interval. Countdown timers show whole seconds — 2Hz is plenty. The radial ring moves ~1.2 deg/sec for a 300s timer, imperceptible at 2Hz vs 4Hz.

**Optional adaptive:** When any timer has `remainingMs < 10000`, use `$.Schedule(0.25, loop)` for smoother final countdown.

### 2. Cache `FindChildrenWithClassTraverse("map_button")` (HIGH)
**File:** `panorama/scripts/jungle_timer.js` — Lines 661-663

This DOM traversal runs every 400ms (`MINIMAP_SNAPSHOT_INTERVAL_MS`). Camp panels don't appear/disappear frequently.

**Change:** Cache the result for 5 seconds. Re-query only when cache expires OR when a spot-check (`buttons[0]?.IsValid()`) fails. Add a `_mapButtonCache` and `_mapButtonCacheTs` variable.

### 3. Increase theme/inversion cache TTL: 750ms → 30s (TRIVIAL)
**File:** `panorama/scripts/jungle_timer.js` — Line 9

`MINIMAP_INVERT_CACHE_MS = 750` causes `resolveMinimapTeamContext()` to re-traverse DOM hierarchy ~1.3x/sec. Team side doesn't change mid-match.

**Change:** `750` → `30000`.

### 4. Cache `getNeutralRingId()` on the state object (LOW-MEDIUM)
**File:** `panorama/scripts/jungle_timer.js` — Lines 446-448, 450-487

`getNeutralRingId(key)` runs a regex `key.replace(/[^a-zA-Z0-9_]/g, "_")` and is called 4+ times per camp per render (once in each `ensure*` function).

**Change:** Compute once in `createState()`, store as `st.ringId`. Derive `_fill`, `_text`, `_anchor` suffixes by simple concatenation. Remove all `getNeutralRingId(key)` calls from ensure functions — use `st.ringId` instead.

### 5. Remove `FindChildTraverse` fallback in ensure functions (LOW-MEDIUM)
**File:** `panorama/scripts/jungle_timer.js` — Lines 807, 852, 871, 902

Each `ensure*` function does: check `IsValid()` → `FindChildTraverse()` fallback → `CreatePanel()`. The `FindChildTraverse` fallback is redundant because `clearNeutralRing()` already removes panels via `DeleteAsync(0)`, and `clearNeutralRuntimeCaches()` handles panel reloads.

**Change:** Remove the `FindChildTraverse` fallback. Go directly from `!IsValid()` → `CreatePanel()`.

### 6. Move redundant style assignments to creation-only (LOW-MEDIUM)
**File:** `panorama/scripts/jungle_timer.js`

These run every render cycle but never change after creation:
- Lines 820-823: `ringRoot.style.backgroundColor/borderWidth/borderColor/clip` set to transparent/null
- Lines 858-860: `ringFill.style.position/width/height` set to fixed values
- Lines 911-913: `detailLabel.hittest/hittestchildren/visibility` set each cycle

**Change:** Move all of these into the `CreatePanel` branch (the `if (!panel?.IsValid())` block).

### 7. Simplify `isScoreboardOpen()` — check 2 panels instead of 5 (TRIVIAL)
**File:** `panorama/scripts/jungle_timer.js` — Lines 401-410

Checks 5 panels for `gScoreboardOpen` class. The scoreboard class propagates from `minimap_persp` (your layout XML). Only `UI.scoreboardRoot` and `UI.root` need checking.

**Change:** Remove the 3 middle checks (lines 404-406).

### 8. Cache `refreshPanels()` with 2s TTL (LOW)
**File:** `panorama/scripts/jungle_timer.js` — Lines 234-282

Runs every loop iteration. Checks 6 panels for `IsValid()`. Panels don't become invalid mid-frame.

**Change:** Add a timestamp check. If all panels were valid within the last 2 seconds, return `true` immediately without re-checking.

### 9. Defer string allocation for clip until after delta check (LOW)
**File:** `panorama/scripts/jungle_timer.js` — Lines 1050-1056

Currently builds the clip string before checking if it changed. The competitor avoids unnecessary allocations by checking state first.

**Change:** Compare `sweepDeg` as a number against `st.lastSweepDeg`. Only build the clip string when it differs:
```js
const sweepDeg = +(pct * 360).toFixed(2);
if (sweepDeg !== st.lastSweepDeg) {
  ringFill.style.clip = "radial(50% 50%, " + NEUTRAL_RADIAL_START_DEG + "deg, " + sweepDeg + "deg)";
  st.lastSweepDeg = sweepDeg;
}
```
Same pattern for `textPos` string on line 1058.

### 10. Adaptive scan rate when no active timers (LOW)
**File:** `panorama/scripts/jungle_timer.js` — Lines 1155-1174

When `_neutralRespawnState.size === 0` and game time > 60s, the full scan loop still runs at 500ms.

**Change:** Slow scan to 2 seconds when no active timers. Camp kills followed by 2s detection delay is acceptable for 85-335s respawn timers.

---

## What NOT to Change

- **Kill-event detection** — More accurate than competitor's pure modulo approach. Keep it.
- **Delta-checked rendering** — Competitor doesn't have this; yours is better. Keep it.
- **4 camp types with different respawn times** — Feature advantage. Keep it.
- **Radial ring animation** — Visual advantage. Keep it.
- **Map inversion support** — Robust. Keep it.
- **Coordinate caching** — Already good. Keep it.

## Verification

After changes, test by:
1. Loading into a Deadlock match and verifying timers still appear correctly on minimap
2. Confirming radial ring animations are smooth (especially in final 10s with adaptive scheduling)
3. Checking all 4 camp types display correct respawn times and colors
4. Verifying scoreboard overlay shows timers at full opacity
5. Testing on inverted minimap (opposite team side)
6. Confirming no visual regression on timer text positioning across resolutions

## Files to Modify

- `F:\Users\Shiv\Desktop\Deadlock-mods-collection\jungle_timer\panorama\scripts\jungle_timer.js` — All 10 changes
