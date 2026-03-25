# Jungle Timer Performance Improvements (Learned from Competitor)

## Context

The competitor's jungle timer is ~64 lines of JS vs your ~1,178 lines. The competitor is simpler because it has **fewer features** (only 2 hardcoded boon locations, plain text labels, no rings/animations, no kill detection). Your mod is more feature-rich (4 camp types, radial ring animations, color coding, smart fading, DPI scaling, map inversion).

The goal is **not** to strip features, but to adopt the competitor's performance patterns and — crucially — **offload the ring sweep animation to CSS transitions** so the game engine renders it smoothly instead of JS calculating clip values every cycle.

---

## Changes (Ranked by Impact)

### 1. CSS-driven ring sweep animation (HIGHEST — the big win)
**Files:** `panorama/styles/jungle_timer.css` + `panorama/scripts/jungle_timer.js`

**Why:** Panorama docs explicitly state `clip` is *"fast and supported for transitions/animations"*. Your CSS already uses `transition` for opacity on `.neutral-cooldown-ring`. Instead of JS setting `ringFill.style.clip` every 250-500ms, let CSS transition the clip smoothly from current to target.

**CSS changes** — add transition on `.neutral-cooldown-ring-fill`:
```css
.neutral-cooldown-ring-fill {
  /* existing properties stay */
  clip: radial(50% 50%, 0deg, 360deg);
  transition-property: clip, opacity;
  transition-timing-function: linear;
  transition-duration: 0.6s;          /* smooth between JS updates */
}
```

**JS changes** — in `scanNeutralRespawnState()` (lines 771-775), when a camp dies:
1. Set `ringFill.style.clip = "radial(50% 50%, 0deg, 360deg)"` (full ring, starting point)
2. Set `transition-duration` to the full respawn duration (e.g. `"290s"`)
3. Then set `ringFill.style.clip = "radial(50% 50%, 0deg, 0deg)"` (target: empty ring)
4. CSS engine smoothly interpolates from 360deg → 0deg over the duration

**JS changes** — in `renderNeutralTimer()` (lines 1050-1056):
- **Remove** the per-cycle clip calculation entirely (`pct * 360`, string building, delta check)
- The render loop no longer needs to touch `clip` at all — CSS handles it
- Keep the text countdown update (still needed: `fmtSeconds` for the label text)
- Keep opacity logic (already CSS-transitioned, just set target value)

**Resync handling** — if game time drifts (lines 1021-1029), recalculate remaining time and reset the transition:
```js
// Only when resync needed (>750ms drift detected)
ringFill.style.transitionDuration = "0s";           // instant jump
ringFill.style.clip = currentClipValue;              // snap to current
// Force layout flush (read a property)
ringFill.style.transitionDuration = remainingSec + "s"; // resume smooth
ringFill.style.clip = "radial(50% 50%, 0deg, 0deg)";   // animate to zero
```

**Impact:** Eliminates the entire render loop's clip calculation. The ring animation becomes GPU-accelerated and buttery smooth regardless of JS polling rate. This is the single biggest architectural win.

### 2. Reduce main loop frequency: 100ms → 1s (HIGH)
**File:** `panorama/scripts/jungle_timer.js` — Line 1174

With clip animation offloaded to CSS (change #1), the JS loop only needs to:
- Scan for camp kill events (`.active` class transitions)
- Update countdown text (whole seconds)
- Set opacity targets (CSS-transitioned already)

None of these need sub-second updates. The competitor runs at 1Hz.

**Change:** `$.Schedule(0.1, loop)` → `$.Schedule(1.0, loop)`. Remove both `NEUTRAL_SCAN_INTERVAL_MS` and `NEUTRAL_RENDER_INTERVAL_MS` constants — everything runs once per second in a single pass.

**Adaptive:** When any timer has `remainingMs < 10000`, use `$.Schedule(0.5, loop)` so the final countdown text updates more responsively.

**Impact:** Reduces function invocations from 10/sec to 1/sec (90% reduction). Combined with change #1, the JS hot path is nearly eliminated.

### 3. Cache `FindChildrenWithClassTraverse("map_button")` (HIGH)
**File:** `panorama/scripts/jungle_timer.js` — Lines 661-663

This DOM traversal runs every scan cycle. Camp panels don't appear/disappear frequently.

**Change:** Cache the result for 5 seconds. Re-query only when cache expires OR when a spot-check (`buttons[0]?.IsValid()`) fails. Add `_mapButtonCache` and `_mapButtonCacheTs` variables.

### 4. Increase theme/inversion cache TTL: 750ms → 30s (TRIVIAL)
**File:** `panorama/scripts/jungle_timer.js` — Line 9

`MINIMAP_INVERT_CACHE_MS = 750` causes `resolveMinimapTeamContext()` to re-traverse DOM hierarchy every 750ms. Team side doesn't change mid-match.

**Change:** `750` → `30000`.

### 5. Cache `getNeutralRingId()` on the state object (LOW-MEDIUM)
**File:** `panorama/scripts/jungle_timer.js` — Lines 446-448, 450-487

`getNeutralRingId(key)` runs a regex and is called 4+ times per camp per render cycle.

**Change:** Compute once in `createState()`, store as `st.ringId`. Derive `_fill`, `_text`, `_anchor` by concatenation. Remove regex calls from ensure functions.

### 6. Remove `FindChildTraverse` fallback in ensure functions (LOW-MEDIUM)
**File:** `panorama/scripts/jungle_timer.js` — Lines 807, 852, 871, 902

Each `ensure*` function tries `FindChildTraverse()` before `CreatePanel()`. Redundant since `clearNeutralRing()` removes panels via `DeleteAsync(0)`.

**Change:** Go directly from `!IsValid()` → `CreatePanel()`.

### 7. Move redundant style assignments to creation-only (LOW-MEDIUM)
**File:** `panorama/scripts/jungle_timer.js`

These run every render cycle but never change after creation:
- Lines 820-823: `ringRoot.style.backgroundColor/borderWidth/borderColor/clip` → transparent/null
- Lines 858-860: `ringFill.style.position/width/height` → fixed values
- Lines 911-913: `detailLabel.hittest/hittestchildren/visibility`

**Change:** Move into the `CreatePanel` branch only.

### 8. Simplify `isScoreboardOpen()` — 2 panels instead of 5 (TRIVIAL)
**File:** `panorama/scripts/jungle_timer.js` — Lines 401-410

**Change:** Keep only `UI.scoreboardRoot` and `UI.root` checks. Remove 3 middle checks.

### 9. Cache `refreshPanels()` with 2s TTL (LOW)
**File:** `panorama/scripts/jungle_timer.js` — Lines 234-282

**Change:** If all panels were valid within last 2 seconds, return `true` immediately.

### 10. Adaptive scan rate when idle (LOW)
**File:** `panorama/scripts/jungle_timer.js` — Lines 1155-1174

**Change:** When `_neutralRespawnState.size === 0` and game time > 60s, slow loop to 2 seconds.

---

## What NOT to Change

- **Kill-event detection** — More accurate than competitor's pure modulo. Keep it.
- **Delta-checked rendering** (for non-clip properties) — Still needed for position, text, colors.
- **4 camp types with different respawn times** — Feature advantage. Keep it.
- **Map inversion support** — Robust. Keep it.
- **Coordinate caching** — Already good. Keep it.
- **Opacity fade logic** — Keep the >60s/30-60s/\<30s tiers, just set target and let CSS transition.

## Verification

After changes, test by:
1. Loading into a Deadlock match — verify ring sweep animates smoothly (should be smoother than before since it's CSS-driven)
2. Kill a camp and confirm the ring starts from full (360deg) and sweeps down to 0 over the respawn duration
3. Open scoreboard mid-timer — verify opacity snaps to 1.0 and ring continues animating
4. Check all 4 camp types show correct respawn times, ring speeds, and colors
5. Test on inverted minimap (opposite team side) — text should remain readable
6. Verify countdown text updates correctly (whole seconds, MM:SS format)
7. Pause/unpause or lag the game — verify resync logic corrects the ring position
8. Confirm no visual regression across resolutions (1080p, 1440p, 4K)

## Files to Modify

- **`F:\Users\Shiv\Desktop\Deadlock-mods-collection\jungle_timer\panorama\styles\jungle_timer.css`** — Add `transition-property: clip, opacity` to `.neutral-cooldown-ring-fill`
- **`F:\Users\Shiv\Desktop\Deadlock-mods-collection\jungle_timer\panorama\scripts\jungle_timer.js`** — All 10 changes (CSS transition setup in scan, remove clip calc from render, reduce loop frequency, caching improvements)
