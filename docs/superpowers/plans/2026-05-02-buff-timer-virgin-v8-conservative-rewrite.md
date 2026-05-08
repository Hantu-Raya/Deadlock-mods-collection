# buff_timer_virgin Conservative v8 Rewrite Implementation Plan

> **For agentic workers:** Use subagent-driven-development or executing-plans only if the user explicitly approves subagent execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the current `buff_timer_virgin` visuals and gameplay features almost exactly while rewriting internals for lower CPU usage, lower memory churn, and clearer maintainability.

**Architecture:** Keep one Panorama JS entrypoint and the existing XML/CSS shape. Refactor `rejuvnbufftimer.js` into clearly separated subsystems, replace the large adaptive `loop()` with a small scheduler table, keep one shared minimap snapshot pipeline, pool neutral ring panel sets, and remove duplicate/expensive CSS without changing visible behavior.

**Tech Stack:** Source 2 Panorama XML/CSS/JS, existing `sr2compiler` build path, manual Deadlock `-dev -tools` validation.

---

### Task 1: Baseline the current behavior and lock invariants

**Files:**
- Read: `buff_timer_virgin/AGENTS.md`
- Read: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
- Read: `buff_timer_virgin/panorama/layout/hud.xml`
- Read: `buff_timer_virgin/panorama/styles/hud_timer.css`
- Read: `buff_timer_virgin/panorama/styles/buff_claim.css`
- Read: `buff_timer_virgin/panorama/styles/jungle_timer.css`

- [ ] **Step 1: Record the non-negotiable invariants**

Write down the invariants that must not change during the rewrite:

- `_neutralRespawnState` remains a `Map`.
- Neutral ring overlay parent remains `UI.minimapBox`.
- `NEUTRAL_RING_SIZE_PX` remains `24`.
- Neutral rings remain percentage-positioned, not pixel-positioned.
- `jungle_timer.css` remains required for ring visuals.
- Mini card text during neutral override must be computed from canonical timer state, never mirrored from `UI.rLab.text`.
- `scoreboardJustOpened` must continue forcing immediate neutral scan/render behavior.
- Team/map inversion behavior must remain intact.
- Preserve current polling semantics from `AGENTS.md`: not-running `30s`, active countdown `0.1s`, idle `1.0s`, snapshot `250/500/750ms`, neutral scan/render `500/250ms`, invert cache `750ms`, game time cache `200ms`.
- Preserve claim detection invariants: `CLAIM_RADIUS_SQ = 64`, `DEATH_GRACE_MS = 2000`, pretrack behavior, one-pass `computeNearestForTargets`, and ally-closer classification.
- Preserve linger rules: `wasActive && !isActive` shows linger, active again cancels, dead cancels immediately, and do not prune player state that still owns active linger.
- Do not re-add removed panels (`RejuvBuff`, `RejuvTimeBuff`) or stale refs (`UI.rejuvBuff`, `UI.rejuvBuffTime`).
- Do not re-add `jungle_timer.js`; only `rejuvnbufftimer.js` should load.
- Preserve `resolveMinimapReferenceSize` fallback behavior and current cache TTLs.

- [ ] **Step 2: Record the current visual features to preserve**

List the exact visible behaviors that must remain unchanged:

- Rejuv countdown pill and icon behavior.
- Bridge buff countdown pill and icon behavior.
- Neutral override phases and badge behavior.
- Mini rejuv card visibility and text behavior.
- Claim glows, claim boxes, claim timers, and linger labels.
- Neutral respawn rings, centered labels, urgency opacity ramp, and scoreboard-open reveal.
- Chat ping buttons and message behavior.

- [ ] **Step 3: Record the current build and validation commands**

Use these commands as the verification baseline:

```powershell
cd "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "sr2compiler\New folder.exe" "buff_timer_virgin"
```

Manual validation:
- Launch Deadlock with `-dev -tools`.
- Open Panorama debugger (`F7`) or VConsole (`F8`).
- Run `panorama_reload_layout` and verify the features above still behave the same.

---

### Task 2: Mechanical re-sectioning only, no scheduler change yet

**Files:**
- Modify: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`

- [ ] **Step 1: Define the target section order**

Use this section order inside the single file:

1. `"use strict"` wrapper and constants
2. UI refs and cache state
3. scheduler/boot helpers
4. game time helpers
5. minimap snapshot helpers
6. rejuv timer subsystem
7. bridge buff subsystem
8. neutral phase subsystem
9. neutral ring subsystem
10. claim subsystem
11. linger subsystem
12. mini card subsystem
13. chat ping subsystem
14. main scheduler loop
15. `boot()`

- [ ] **Step 2: Extract small pure helpers first**

Move reusable helpers near the top without changing behavior:

- `fmt`, `fmtSeconds`, `clampPct`, `safeMapCoord`, `safePanelExtent`
- `isAlly`, `isEnemy`
- `setPanelText`, `setPanelClass`
- `resolveMinimapReferenceSize`
- `hasUsableMapButtonCache`, `getCachedMapButtons`, `clearMapButtonCache`
- `updateMinimapInvertCache`, `clearMinimapInvertCache`

- [ ] **Step 3: Extract subsystem-owned state into grouped blocks**

Group related state variables directly above their subsystem functions:

- Rejuv state block
- Bridge buff state block
- Neutral phase state block
- Neutral ring state block
- Claim state block
- Linger state block
- Mini card state block
- Chat ping state block

- [ ] **Step 4: Replace the large `loop()` with an adaptive scheduler table**

Keep the current adaptive cadence instead of a fixed 100ms heartbeat. Preserve the existing semantics:

- not-running: `30s`
- active countdown: `0.1s`
- idle countdown: `1.0s`

Use a scheduler table for subsystem dispatch, but keep the heartbeat interval adaptive. Map every current unguarded `loop()` behavior to a scheduler task and preserve its effective cadence:

```javascript
const TICKS = [
  { fn: tickRejuv, intervalMs: 1000, last: 0 },
  { fn: tickBridge, intervalMs: 1000, last: 0 },
  { fn: tickPhases, intervalMs: 1000, last: 0 },
  { fn: tickMiniCard, intervalMs: 1000, last: 0 },
  { fn: tickClaim, intervalMs: 100, last: 0 },
  { fn: tickScan, intervalMs: 3000, last: 0 },
  { fn: tickLinger, intervalMs: 300, last: 0 },
  { fn: tickNeutralScan, intervalMs: 500, last: 0 },
  { fn: tickNeutralRender, intervalMs: 250, last: 0 },
  { fn: tickPretrack, intervalMs: 1000, last: 0 },
  { fn: tickMonitor, intervalMs: 300, last: 0 },
];
```

Do not increase idle CPU by locking the heartbeat to 100ms.

- [ ] **Step 5: Keep the shared snapshot pipeline at most once per scheduler cycle when needed**

`collectMinimapSnapshot(nowMs, forceFresh)` must remain the single minimap sweep source for claim, linger, neutral scan, and neutral render, but it should continue to respect TTL/cache semantics rather than forcing a fresh sweep every beat.

- [ ] **Step 6: Verify no behavior changed yet**

Run:

```powershell
cd "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "sr2compiler\New folder.exe" "buff_timer_virgin"
```

Expected: compiled output exists and the mod behaves identically in Deadlock tools mode.

---

### Task 3: Replace the scheduler only after mechanical refactors are verified

**Files:**
- Modify: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`

- [ ] **Step 1: Preserve scheduler parity explicitly**

Map every current `loop()` behavior to a scheduler task and preserve its effective cadence. Do not introduce a fixed 100ms idle heartbeat.

- [ ] **Step 2: Keep adaptive heartbeat semantics**

Preserve not-running `30s`, active countdown `0.1s`, and idle countdown `1.0s`.

- [ ] **Step 3: Verify scheduler parity in-game**

Run:

```powershell
cd "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "sr2compiler\New folder.exe" "buff_timer_virgin"
```

Expected: identical timer fidelity and idle CPU behavior compared to the pre-rewrite build.

---

### Task 4: Refactor DOM write helpers and reduce style/text churn

**Files:**
- Modify: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`

- [ ] **Step 1: Centralize guarded text writes**

Replace repeated guarded label writes with a helper like:

```javascript
function setTextIfChanged(label, cache, nextText) {
  if (!label?.IsValid?.()) return cache;
  if (cache === nextText) return cache;
  label.text = nextText;
  return nextText;
}
```

- [ ] **Step 2: Centralize guarded class toggles**

Replace repeated class toggles with a helper like:

```javascript
function setClass(panel, cls, on) {
  if (!panel?.IsValid?.()) return;
  if (on) panel.AddClass(cls);
  else panel.RemoveClass(cls);
}
```

- [ ] **Step 3: Centralize guarded style writes**

Replace repeated guarded style writes with a helper like:

```javascript
function setStyleIfChanged(panel, prop, cache, next) {
  if (!panel?.IsValid?.()) return cache;
  if (cache === next) return cache;
  panel.style[prop] = next;
  return next;
}
```

- [ ] **Step 4: Apply the helpers to rejuv, buff, mini card, claim, and ring updates**

Do not change the visual result. Only change how the writes are performed.

- [ ] **Step 5: Verify compiled output and visible behavior remain unchanged**

Run:

```powershell
cd "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "sr2compiler\New folder.exe" "buff_timer_virgin"
```

Expected: identical visuals and timings in Deadlock tools mode.

---

### Task 5: Refactor neutral ring lifecycle to use a panel pool

**Files:**
- Modify: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
- Verify: `buff_timer_virgin/panorama/layout/hud.xml`
- Verify: `buff_timer_virgin/panorama/styles/jungle_timer.css`

- [ ] **Step 1: Create a fixed ring pool under the existing overlay parent**

Pre-create a fixed pool of ring panel sets under `NeutralCooldownOverlayLayer` inside `UI.minimapBox`. The pool size must cover the maximum number of simultaneous neutral cooldowns observed in normal matches plus a small margin. Use `visibility: collapse` for inactive sets instead of destroying panels. Preserve the required hierarchy: `anchor -> ring -> fill + label`.

- [ ] **Step 2: Map camp keys to pooled panel sets**

Maintain a lookup from neutral camp key to pooled ring set. When a camp enters cooldown, acquire a set. When it expires, release the set back to the pool. On release, reset all cached style/text/opacity/clip fields, clear neutral icon opacity, and restore the set to a clean reusable state.

Also define safe exhaustion behavior: if all pooled sets are in use, either reuse the least-urgent expired set or skip rendering new rings without throwing. Any cleanup helper like `clearNeutralRespawnTimers()` must release/collapse pooled sets, not delete the pool itself.

- [ ] **Step 3: Keep coordinate math and sizing identical**

Preserve:

- `NEUTRAL_RING_SIZE_PX = 24`
- percentage positioning relative to `UI.minimapBox`
- centered label formula
- scoreboard-open instant reveal behavior

- [ ] **Step 4: Remove runtime `$.CreatePanel` calls from the render path**

All ring panels should come from the pool. No new panel creation should occur during normal gameplay once the pool is initialized.

- [ ] **Step 5: Verify ring accuracy and performance**

Run:

```powershell
cd "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "sr2compiler\New folder.exe" "buff_timer_virgin"
```

Expected: rings still appear, track camps correctly, invert correctly for team 2, and reveal instantly when the scoreboard opens.

---

### Task 6: Refactor neutral state lookup to avoid repeated scans

**Files:**
- Modify: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`

- [ ] **Step 1: Keep `_neutralRespawnState` as a `Map`**

Do not convert it to a plain object.

- [ ] **Step 2: Add reverse indexes where useful**

Add lightweight indexes such as:

- panel → camp key
- camp key → pooled ring set
- last known position/cache for geometry

- [ ] **Step 3: Reduce repeated full-map scans**

Use the indexes first, and only fall back to broader matching when necessary.

- [ ] **Step 4: Preserve existing transition rules**

Keep the same rules for:

- start timer on `wasActive && !isActive`
- clear timer on `!wasActive && isActive`
- remove at `00:00`
- purge stale states after `NEUTRAL_STATE_PURGE_MS`

- [ ] **Step 5: Verify neutral ring correctness across phases**

Run:

```powershell
cd "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "sr2compiler\New folder.exe" "buff_timer_virgin"
```

Expected: neutral override phases and respawn rings remain visually identical.

---

### Task 7: Clean duplicate/expensive CSS without changing visuals

**Files:**
- Modify: `buff_timer_virgin/panorama/styles/buff_claim.css`
- Verify: `buff_timer_virgin/panorama/styles/jungle_timer.css`
- Verify: `buff_timer_virgin/panorama/styles/hud_timer.css`

- [ ] **Step 1: Treat duplicate neutral ring class definitions as conservative-only cleanup**

Keep the authoritative definitions in `jungle_timer.css`, but do not remove fallback neutral ring definitions from `buff_claim.css` unless compiled cascade and in-game visuals prove identical.

- [ ] **Step 2: Audit `world-blur` usage conservatively**

Do not remove `world-blur` unless the user explicitly accepts a potential visual change. If removal is attempted, verify in-game before claiming parity.

- [ ] **Step 3: Keep existing glow, claim box, and linger styling unless clearly redundant**

Do not redesign the HUD. Only remove duplication and obvious waste.

- [ ] **Step 4: Verify compiled CSS still applies correctly**

Run:

```powershell
cd "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "sr2compiler\New folder.exe" "buff_timer_virgin"
```

Expected: ring visuals, glows, claim boxes, and timer pills look the same as before.

---

### Task 8: Add resilience for Panorama pause/reload edge cases

**Files:**
- Modify: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`

- [ ] **Step 1: Keep existing game-restart detection**

Preserve the current logic that detects backward time jumps and restarts the loop.

- [ ] **Step 2: Add a lightweight generation counter or watchdog if needed**

If the rewrite consolidates multiple loops, add a generation counter or watchdog so menu/pause/reload states do not leave timers stuck.

- [ ] **Step 3: Keep behavior identical in normal gameplay**

The watchdog should only improve recovery, not change visible timer behavior.

- [ ] **Step 4: Verify recovery after scoreboard/shop/menu interactions**

Run:

```powershell
cd "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "sr2compiler\New folder.exe" "buff_timer_virgin"
```

Expected: timers resume correctly after Panorama pause states.

---

### Task 9: Final verification and regression check

**Files:**
- Verify: `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js`
- Verify: `buff_timer_virgin/panorama/layout/hud.xml`
- Verify: `buff_timer_virgin/panorama/styles/hud_timer.css`
- Verify: `buff_timer_virgin/panorama/styles/buff_claim.css`
- Verify: `buff_timer_virgin/panorama/styles/jungle_timer.css`

- [ ] **Step 1: Compile the mod**

Run:

```powershell
cd "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "sr2compiler\New folder.exe" "buff_timer_virgin"
```

- [ ] **Step 2: Run the full manual validation checklist**

Check:

- Rejuv countdown and clip behavior
- Bridge buff countdown and clip behavior
- Neutral override phases and badges
- Mini rejuv card behavior
- Claim glows, boxes, timers, and linger labels
- Neutral rings, centered labels, urgency opacity, scoreboard reveal
- Team 2 inversion
- Chat ping buttons
- All neutral windows: `1:00–2:00`, `5:00–6:00`, `7:00–8:00`
- 4K/DPI minimap alignment
- Scoreboard-open first-tick reveal
- Pause/menu/reload recovery
- No accidental hot-loop `FindChildTraverse` or duplicate `FindChildrenWithClassTraverse("map_button")`

- [ ] **Step 3: Confirm no new warnings or errors appear in Panorama debugger**

Open `F7` and check for script errors.

- [ ] **Step 4: Confirm the rewrite preserved visuals while improving internals**

The final result should feel identical to the current mod, but the source should be cleaner, cheaper, and easier to maintain.
