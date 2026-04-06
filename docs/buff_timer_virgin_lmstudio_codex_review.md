# `buff_timer_virgin` Performance Review

Review target: [buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js)

Date: 2026-04-06

Model used for second opinion:
- LM Studio local server on `http://127.0.0.1:1234`
- Loaded model: `qwopus3.5-27b-v3-i1`

Primary review authority:
- Codex with repo-local constraints from [buff_timer_virgin/AGENTS.md](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\AGENTS.md)

## Summary

This review used two lanes:
- Codex as the repo-aware reviewer, constraint checker, and final arbiter.
- LM Studio as a chunked second-opinion reviewer for hot-path ideas.

The script already contains several safe runtime improvements in the current working tree. The highest-confidence wins are:
- short-TTL caching for `map_button` traversal
- cached neutral ring IDs on state
- reduced repeated helper traversals for scoreboard detection and `TopBar` time lookup
- geometry/write guards in the neutral render path

Static validation passed with:

```powershell
node --check F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js
```

That syntax check was re-run after the latest dead-code cleanup pass.

Build validation status:
- source syntax check passed
- terser build completed successfully into [buff_timer_virgin_terser](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin_terser)
- compile completed successfully into [buff_timer_virgin_terser_compiled](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin_terser_compiled)
- `sr2compiler\New folder.exe` still exits non-zero afterward because of its `Console.ReadKey()` wrapper bug in redirected terminals, but the asset compile itself reported `OK: 5 compiled, 0 failed`
- packed output was promoted to [pak98_dir.vpk](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\pak98_dir.vpk)

## Verified Wins

### 1. Cache `map_button` traversal

Affected hot path:
- `collectMinimapSnapshot`
- minimap collapse path

Current implementation:
- `hasUsableMapButtonCache()` and `getCachedMapButtons()` at [rejuvnbufftimer.js#L938](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L938)
- snapshot use at [rejuvnbufftimer.js#L973](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L973)
- collapse use at [rejuvnbufftimer.js#L1239](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L1239)

Expected benefit:
- fewer expensive `FindChildrenWithClassTraverse("map_button")` calls
- less repeated DOM walking across shared minimap consumers

Constraint check:
- matches the local rule to keep one shared snapshot sweep and cached traversals
- does not remove features or change panel ownership

Manual test:
- verify claim detection, enemy linger, and neutral rings still react correctly after `panorama_reload_layout`

### 2. Cache neutral ring IDs on state

Affected hot path:
- neutral ring creation and render helper chain

Current implementation:
- `ringId` precomputed in `createState()` at [rejuvnbufftimer.js#L1645](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L1645)
- reused by `ensureAnchorRoot`, `ensureRingRoot`, `ensureRingFill`, and `ensureDetailLabel`

Expected benefit:
- less repeated regex/string work in the 250 ms neutral render cycle

Constraint check:
- keeps `_neutralRespawnState` as `Map`
- keeps overlay under `UI.minimapBox`

Manual test:
- kill camps of multiple types and verify ring create/delete/text still behave correctly

### 3. Reduce repeated helper traversals

Affected hot path:
- scoreboard-open detection
- game-time lookup

Current implementation:
- scoreboard-open checks simplified at [rejuvnbufftimer.js#L1350](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L1350)
- cached `TopBar` reuse in `gTime()` at [rejuvnbufftimer.js#L3291](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L3291)

Expected benefit:
- fewer `FindChildTraverse` / `FindChildrenWithClassTraverse` misses in helpers used every loop

Constraint check:
- preserves immediate scoreboard-open trigger behavior
- preserves `GameTime` parsing behavior

Manual test:
- open and close scoreboard repeatedly
- confirm neutral rings still appear immediately when scoreboard opens
- confirm timer text remains correct after HUD reload

### 4. Guard neutral render geometry work

Affected hot path:
- neutral ring render at 250 ms cadence

Current implementation:
- preallocated state fields in `createState()` at [rejuvnbufftimer.js#L1645](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L1645)
- geometry diff checks in `renderNeutralTimer()`

Expected benefit:
- fewer repeated position calculations and style writes when icon geometry is unchanged

Constraint check:
- keeps percent-based positioning
- keeps overlay parent and DPI-aware geometry logic

Manual test:
- verify ring alignment on normal and inverted minimap
- verify text remains centered on camp icons

### 5. Remove dead helpers and dead cache plumbing

Affected hot path:
- startup/reset cache handling
- neutral helper surface area

Current implementation:
- dead neutral coordinate cache plumbing has been removed from [rejuvnbufftimer.js#L797](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L797) and [rejuvnbufftimer.js#L828](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L828)
- optimizer-friendly shared text/class helpers now sit at [rejuvnbufftimer.js#L730](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L730), [rejuvnbufftimer.js#L735](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L735), [rejuvnbufftimer.js#L742](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L742), [rejuvnbufftimer.js#L749](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L749), and [rejuvnbufftimer.js#L755](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L755)

Removed dead symbols:
- `_neutralCoordCache`
- `clearNeutralCoordCache()`
- `getNeutralRingTheme()`
- `neutralPosOnContainer()`
- `getPanelPos()`
- `_posResult`

Expected benefit:
- smaller hot-path surface area
- less cache-reset churn during `reset()` and neutral cleanup
- less ambiguity for future optimization passes

Constraint check:
- no live `Map` behavior changed
- no overlay parent or coordinate-system behavior changed
- no loop cadence changed

Manual test:
- verify `reset()` still clears rings and recovers correctly after `panorama_reload_layout`

### 6. Reuse state containers and scratch arrays

Affected hot path:
- player-state pruning
- enemy linger teardown
- powerup scan / claim tracking

Current implementation:
- null-prototype state maps at [rejuvnbufftimer.js#L201](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L201) and [rejuvnbufftimer.js#L247](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L247)
- no-allocation prune walk at [rejuvnbufftimer.js#L2230](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L2230)
- shared linger teardown at [rejuvnbufftimer.js#L2299](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L2299)
- in-place `trackedPowerups` reuse at [rejuvnbufftimer.js#L2408](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L2408) and [rejuvnbufftimer.js#L2440](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L2440)

Expected benefit:
- less scratch allocation during powerup scans
- less array churn from replacing `trackedPowerups`
- less temporary allocation during prune passes
- smaller duplicate teardown surface in linger logic

Constraint check:
- claim timing and linger timing are unchanged
- no extra traversals were added
- no gameplay-sensitive polling interval changed

Manual test:
- verify powerup claim indicators still show for both sides across multiple buff cycles
- verify linger `?` labels still appear and clear correctly on death, re-entry, and reset

### 7. Remove dead neutral debug scaffolding

Affected hot path:
- source size and maintenance surface, not live runtime behavior

Removed dead symbols from the latest pass:
- `armNeutralAlignWindow()`
- `isNeutralAlignArmed()`
- `consumeAlignLogBudget()`
- `hasAspectTag()`
- `buildNeutralStateDump()`
- `logNeutralAlign()`
- `setNeutralIconDim()`
- unused neutral snapshot debug counters
- unused neutral align budget constants and state fields

Expected benefit:
- less dead code for future optimization passes to reason about
- lower chance that LM Studio or future reviewers chase non-existent debug paths

Constraint check:
- the top-level `DEBUG_NEUTRAL_ALIGN` switch remains, but the unreachable helper budget logic is gone
- no live render, scan, or reset behavior changed

## Build And Pack Results

### Terser stage

Staged minified source:
- [rejuvnbufftimer.js](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin_terser\panorama\scripts\rejuvnbufftimer.js)

Observed result:
- source copy minified from roughly `94 KB` to `38 KB`
- `keep_fnames=true` and `keep_classnames=true` were used to stay compatible with the existing workflow

### Compile stage

Compiled artifacts:
- [rejuvnbufftimer.vjs_c](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin_terser_compiled\panorama\scripts\rejuvnbufftimer.vjs_c)
- [hud.vxml_c](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin_terser_compiled\panorama\layout\hud.vxml_c)

Observed result:
- compiler reported `OK: 5 compiled, 0 failed, 0 skipped`
- warning about `AGENTS.md` was non-fatal and expected
- wrapper process still threw after success because it attempts `Console.ReadKey()` with redirected input

### Pack stage

Packed artifact:
- [pak98_dir.vpk](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\pak98_dir.vpk)

Observed result:
- packed from [buff_timer_virgin_terser_compiled](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin_terser_compiled)
- latest VPK size: `110137` bytes
- backup kept beside it before overwrite

## Dead-Code Checks

### Current findings

The latest file pass found and removed dead code that was no longer referenced by the live neutral render path. The safest removals were symbols with a single definition and no current call sites, plus cache plumbing that no longer fed any live render or scan path.

This matters for `buff_timer_virgin` because dead helpers create false hotspots during review. They also make LM Studio more likely to suggest irrelevant rewrites, which increases clash risk between generic model advice and the actual script.

### Dead-code review rules for this script

Use this sequence before deleting anything:

1. Count references in the current file and compiled call path.
2. Check local AGENTS invariants before treating a helper as dead.
3. Preserve debug-only helpers if they are still reachable through flags or manual diagnostics.
4. Re-run `node --check` after each cleanup pass.

Safe dead-code candidates:
- helper functions with only a definition and no call site
- caches that are written and cleared but never read by a live path
- stale panel lookup helpers left behind after architecture merges
- debug scaffolding that no longer has a call path even when the debug flag exists

Unsafe dead-code candidates:
- anything touched from `loop()`
- anything used during `boot()`, `reset()`, or scoreboard-open neutral refresh
- anything supporting team inversion, neutral overlay parenting, or `Map` state

## Optimizer-Friendly Code Shape

### Accepted direction

These changes improve optimization friendliness without changing gameplay behavior:

- consolidate repeated panel text writes behind shared helpers
- consolidate repeated class toggles behind cached state helpers
- keep cache invalidation explicit on `reset()`, HUD reload, and runtime cleanup paths
- keep per-state render guard fields preallocated in `createState()` at [rejuvnbufftimer.js#L1612](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L1612)
- keep geometry recalculation gated inside [rejuvnbufftimer.js#L1811](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L1811)
- reuse long-lived arrays and object entries instead of swapping in fresh arrays
- use null-prototype maps for hot keyed state where prototype methods are not needed

Why:
- Panorama hot paths benefit more from fewer traversals and fewer writes than from large structural rewrites
- smaller, more explicit helpers are easier for Codex and LM Studio to review without stepping on local invariants

### Good ideas, needs game test

- modestly increase `map_button` cache TTL only if reload/reset invalidation remains reliable
- widen minimap inversion TTL only if team-side and HUD reload tests stay clean
- consider an idle-only neutral render slowdown only when `_neutralRespawnState.size === 0` and scoreboard is closed
- consider applying the same in-place reuse strategy to any future tracked state arrays before introducing new scratch arrays

### Additional research result: no new verified win from the latest Gemma pass

Two narrow follow-up prompts were run against Gemma 4:
- `collectMinimapSnapshot`
- `gTime()`

Result:
- no new repo-safe optimization was found
- the model mostly repeated generic advice about avoiding allocations and keeping the cache check tight

Why this matters:
- `collectMinimapSnapshot` already reuses entry objects and keeps one shared sweep
- `gTime()` already uses a strict `200ms` TTL and only falls back to `FindChildrenWithClassTraverse("GameTime")` when the cached panel is missing or invalid

Accepted conclusion:
- these areas should not be rewritten just because a local model repeats generic optimization heuristics
- further changes here should be driven by measured in-game evidence, not by style-level advice

### Rejected from the latest LM Studio pass

- defer or throttle scoreboard-open neutral refresh
Reason:
This directly conflicts with the repo requirement for immediate scoreboard-open visibility.

- cache pixel positions instead of percent-based ring positions
Reason:
The repo explicitly depends on percent-based placement for DPI-safe behavior.

- replace TTL invalidation with event-driven invalidation
Reason:
Panorama does not provide a clear repo-local event surface here that is more reliable than explicit reset/reload invalidation.

- use `requestAnimationFrame`-style batching
Reason:
Not grounded in this Panorama runtime or the current script structure, and the existing diff guards already target the real write hotspots.

## Good Ideas, Needs Game Test

### Increase minimap inversion cache TTL

Why it is plausible:
- the current TTL is short relative to how rarely team-side inversion changes

Why it is not yet fully verified:
- local rules depend on the inversion/theme flow remaining intact

Guardrails:
- keep the `UI.minimapContainer` fallback
- keep `themeInfo` flow into the anchor root

### Slow neutral cadence only when idle

Why it is plausible:
- neutral scan/render cadence is one of the most active subsystems during normal play

Why it is not yet fully verified:
- this can easily break first-detection timing or scoreboard-open responsiveness

Guardrails:
- do not remove `scoreboardJustOpened`
- do not slow the path while any neutral timer is active or while scoreboard is open

### Remove helper fallback traversals only after reload testing

Why it is plausible:
- repeated `FindChildTraverse` fallback in neutral ensure helpers is likely unnecessary after stable boot

Why it is not yet fully verified:
- Panorama reload/reset behavior can invalidate cached panels

Guardrails:
- only remove fallbacks after repeated `panorama_reload_layout` and `reset()` testing

## Latency-First Research

This section focuses on one requirement: keep the HUD responsive for gameplay while avoiding stale or inaccurate timer information.

### What should stay fast

These paths are gameplay-sensitive and should remain on the aggressive side unless in-game profiling proves otherwise:
- claim detection
- enemy linger transitions
- countdown text updates near critical windows
- neutral ring visual updates while visible
- scoreboard-open immediate neutral refresh trigger

Why:
- these are the parts most likely to feel “laggy” to a player if delayed
- they also carry the highest risk of incorrect tactical information if over-throttled

Code anchors:
- fast loop cadence at [rejuvnbufftimer.js#L11](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L11)
- fast-tick selection in `loop()` at [rejuvnbufftimer.js#L451](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L451)
- scoreboard-open trigger at [rejuvnbufftimer.js#L405](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L405)

### What can be slowed only when idle

These paths are more suitable for idle-only relaxation:
- snapshot refresh when no claim, linger, or monitor activity is active
- neutral scan/render cadence when no neutral timers are active and scoreboard is closed
- helper fallback traversals after stable boot, if reload testing proves they are redundant

Why:
- these subsystems matter less when no event is active
- slowing them only in idle windows preserves correctness during real gameplay transitions

Code anchors:
- snapshot cadence constants at [rejuvnbufftimer.js#L55](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L55)
- `getMinimapWorkInterval()` at [rejuvnbufftimer.js#L870](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L870)
- neutral cadence constants at [rejuvnbufftimer.js#L63](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js#L63)

### Cache freshness split

Additional latency-oriented finding:

Keep tight:
- `TICK_FAST = 0.1`
- scoreboard-open immediate refresh
- `gTime()` cache at `200ms`

May relax only with idle gating:
- snapshot cadence tiers (`250/500/750ms`)
- neutral render cadence (`250ms`)

Do not touch without strong in-game evidence:
- neutral scan cadence (`500ms`)

Reason:
- the fast loop and time cache directly shape perceived HUD freshness
- snapshot and render cadence are better candidates for idle-only CPU savings
- neutral scan is already the first place where over-throttling can cause stale respawn state

### Latency-safe findings

#### Keep event-triggered immediacy

Accepted:
- preserve `scoreboardJustOpened` immediate scan/render behavior
- preserve `TICK_FAST` for spawn/critical countdown windows

Reason:
- these directly affect perceived responsiveness and timer trustworthiness

#### Prefer cache tuning over broad loop changes

Accepted direction:
- increase helper/cache TTLs only where the cached fact is stable
- keep hot event paths aggressive

Reason:
- cache tuning reduces unnecessary work without changing the visible response model

Examples:
- `TopBar` panel caching in `gTime()`
- `map_button` traversal cache
- possible future minimap inversion TTL increase

### Rejected latency ideas

#### Reject: change fast tick from `100ms` to `120ms` for “60fps alignment”

Source:
- LM Studio timing suggestion

Reason:
- not grounded in Panorama or Deadlock-specific behavior
- no evidence that `120ms` improves frame pacing here
- it risks making critical countdown transitions feel slower for no proven benefit

#### Reject: slow scoreboard-open neutral refresh

Source:
- LM Studio “safe to slow” categorization

Reason:
- this conflicts with the repo’s documented requirement for immediate scoreboard-open visibility

#### Reject: align every interval to `250ms` boundaries by default

Source:
- LM Studio timing suggestion

Reason:
- too broad
- would likely damage event responsiveness in claim, linger, and spawn-adjacent states
- should only be considered for idle-only subsystems after in-game testing

### Practical latency test plan

When testing latency-sensitive behavior, measure these separately:

1. Countdown responsiveness
- rejuv countdown near spawn threshold
- neutral override mini-card updates

2. Event reaction time
- powerup claim indication
- enemy linger start/cancel
- camp death to ring appearance

3. Accuracy under UI transitions
- scoreboard open/close
- HUD reload
- minimap inversion / side changes

Pass condition:
- no visible stale state
- no delayed first-frame response on scoreboard open
- no ring/text mismatch during visible neutral cooldown

## Rejected Suggestions

The following ideas came up from LM Studio or generic optimization heuristics and were rejected because they conflict with repo rules or are too risky for the expected gain.

### Reject: replace `Map` neutral state

Reason:
- local AGENTS explicitly requires `_neutralRespawnState` to stay a `Map`

### Reject: move neutral overlay away from `minimapBox`

Reason:
- local AGENTS explicitly documents that ring coordinates are relative to `UI.minimapBox`

### Reject: use CSS clip transitions for ring animation

Reason:
- local AGENTS explicitly forbids this for the radial ring clip path

### Reject: clamp fast loop timing globally

Reason:
- changing the `0.1s` fast loop without in-game proof risks countdown fidelity, pretrack timing, and rapid transition correctness

### Reject: migrate classification from CSS classes to data attributes or typed arrays

Reason:
- too invasive for Panorama UI code
- not supported by repo guidance
- weak evidence of meaningful gain compared with the safer traversal and write-guard wins

## How Codex and LM Studio Should Not Clash

Use a strict split of responsibilities.

### Codex responsibilities

Codex should own:
- repo rule interpretation
- file reading and code truth
- acceptance or rejection of optimization ideas
- any code changes
- final report wording
- validation steps and risk calls

Codex is the final arbiter whenever:
- an LM Studio suggestion conflicts with local AGENTS rules
- a suggestion needs repo-specific context
- a suggestion affects architecture, timing semantics, or panel ownership

### LM Studio responsibilities

LM Studio should only do:
- short, chunked second-opinion reviews
- hotspot ranking
- idea generation
- false-positive spotting
- alternate implementation candidates for a narrow code region

LM Studio should not decide:
- whether a suggestion is acceptable for this repo
- whether to break or relax a local invariant
- final architecture or timing behavior

### Non-clash workflow

1. Codex reads the actual file and local AGENTS rules first.
2. Codex splits the script into narrow review chunks.
3. LM Studio reviews one chunk at a time with tight constraints.
4. Codex filters LM Studio output against repo rules and current code reality.
5. Codex sorts findings into:
   - verified wins
   - good ideas, needs test
   - rejected
6. Only Codex writes or patches code.

### Prompt rules for LM Studio

To avoid conflict, LM Studio prompts should:
- be short and chunk-specific
- state the non-negotiable repo invariants up front
- explicitly forbid known bad ideas
- respect the current `16384` context window
- request only:
  - hotspots
  - recommended changes
  - risks / false positives

### Context-window guidance

Assumed LM Studio context window:
- `16384`

Recommended budget:
- keep the full prompt plus code chunk under roughly `10k-12k` tokens
- reserve the remaining budget for model reasoning and output
- prefer 1 hot path per prompt instead of multi-subsystem dumps

Recommended output cap:
- default review responses: `220-300 words`
- ultra-narrow classification prompts: `120-180 words`
- binary keep-fast / safe-to-slow prompts: `80-120 words`

### Reusable prompt templates for `16384`

These templates are sized for a `16384` context window and assume one hot path per prompt.

#### Template 1: Main loop and timer cadence

```text
Review only the main loop and timer cadence for this Panorama HUD script.

Constraints:
- do not remove features
- do not replace Map state
- do not move the neutral overlay parent
- do not use CSS clip transitions
- preserve low-latency response for gameplay-critical updates
- prefer cached traversals, fewer redundant style writes, and idle-only throttling

Repo priorities:
- claim detection must stay responsive
- scoreboard-open neutral refresh must stay immediate
- visible timer accuracy matters more than raw CPU reduction

Return only:
- HOTSPOTS
- CHANGES
- RISKS

Keep the response under 250 words.
```

#### Template 2: Snapshot collection and classification

```text
Review only the shared minimap snapshot path.

Constraints:
- keep one shared DOM sweep model
- do not remove player, powerup, or neutral classification
- do not propose data-model rewrites that change behavior
- prefer cache tuning, entry reuse, and low-allocation ideas

Repo priorities:
- low-latency HUD response
- accurate minimap-derived state
- no extra traversals in hot paths

Return only:
- HOTSPOTS
- CHANGES
- RISKS

Keep the response under 220 words.
```

#### Template 3: Neutral scan/render

```text
Review only the neutral scan/render path.

Hard constraints:
- `_neutralRespawnState` must remain a Map
- overlay parent must remain `UI.minimapBox`
- ring positions must remain percentage-based
- do not use CSS clip transitions
- preserve immediate scoreboard-open visibility

Optimization goal:
- lower cost without increasing visible latency or timer inaccuracy

Return only:
- HOTSPOTS
- CHANGES
- RISKS

Keep the response under 250 words.
```

#### Template 4: Helper lookups and time parsing

```text
Review only helper lookups and time parsing.

Constraints:
- preserve current timer semantics
- prefer caching panel references over broader timing changes
- avoid adding repeated `FindChildTraverse` / `FindChildrenWithClassTraverse` work

Optimization goal:
- reduce helper overhead without making countdown text stale

Return only:
- HOTSPOTS
- CHANGES
- RISKS

Keep the response under 180 words.
```

#### Template 5: Low-latency split

```text
Classify subsystems for a gaming HUD.

Goal:
- maintain low-latency response
- maintain accurate visible timing

Return only:
- KEEP_FAST
- MAY_RELAX
- DO_NOT_TOUCH

Use bullet points only.
Keep the response under 120 words.
```

Recommended prompt shape:

```text
Review only this hot path.
Constraints:
- do not remove features
- do not replace Map state
- do not move the overlay parent
- do not use CSS clip transitions
- prefer cached traversals, fewer class checks, fewer redundant style writes
Return only:
- HOTSPOTS
- CHANGES
- RISKS
Keep the response under 250 words.
```

### Best operating mode

The cleanest arrangement is:
- Codex = repo-aware primary reviewer
- LM Studio = secondary local critic

Do not let both systems produce competing final recommendations independently. LM Studio should review either:
- a code chunk summary
- or a diff produced by Codex

That prevents “parallel architecture drift”.

## Endpoint Strategy To Prevent Workflow Collisions

LM Studio’s docs make an important distinction between its native API and its OpenAI-compatible endpoints.

### Use native LM Studio chat for plain second-opinion review

Best fit:
- chunked code review
- diff review
- long-running local review sessions
- stateful follow-up prompts

Recommended options:
- `lms chat`
- native `POST /api/v1/chat`

Why:
- LM Studio’s current developer docs expose the local server on `http://localhost:1234` by default and document native v1 chat under the `/api/v1/*` family
- it is the cleaner path when the model is only acting as a reviewer, not a tool orchestrator

### Use OpenAI-compatible endpoints only when you need custom tools

Best fit:
- function-calling style research helpers
- explicit tool invocation from your own code
- external web-search wrappers you control

Recommended options:
- `POST /v1/chat/completions`
- `POST /v1/responses`

Why:
- LM Studio’s docs say custom tools are supported on the OpenAI-compatible endpoints
- the native `/api/v1/chat` endpoint does not support custom tools in the same way

### Non-clash rule for endpoint choice

Do not mix these responsibilities inside one review pass:
- use native chat for “review this code chunk”
- use OpenAI-compatible tool calling for “request external facts through a controlled tool layer”

That separation prevents:
- prompt bloat
- tool-calling failures inside normal review sessions
- ambiguity over whether the local model is reviewing code or driving tools

### Practical no-clash prompt routing

Use this split consistently:

- Codex: reads the real file, picks the hot path, decides what evidence is missing
- LM Studio native chat: reviews only the selected chunk or diff
- Codex plus web verification: checks official docs and current repo invariants
- Codex: writes the markdown or patch

Do not send LM Studio both:
- the full script
- and an instruction to browse or orchestrate tools at the same time

That combination increases prompt noise and makes generic suggestions more likely.

## Tool-Calling Discipline

LM Studio’s tool-use docs describe the tool pattern as:
- the model requests a tool call
- your code executes the tool
- your code sends results back to the model

For this repo, that means:
- LM Studio should never be the direct executor of code changes
- Codex or the human operator should remain the tool executor and patch author
- LM Studio should only consume tool results as evidence

This keeps the control plane stable:
- LM Studio proposes
- Codex filters
- Codex or the user executes

## Benchmarking Hygiene

When doing future in-game performance research, keep the measurement setup clean.

### Panorama debugger

Valve’s Panorama debugger documentation explicitly notes that the debugger is resource-intensive and significantly affects game performance while it is open.

Implication:
- do not use the debugger while judging runtime cost
- use it only for spot inspection, then close it before timing behavior

### Research mode vs benchmark mode

Separate these two modes:
- research mode: debugger open, logs enabled, visual inspection
- benchmark mode: debugger closed, debug logs disabled, normal gameplay path

This matters for `buff_timer_virgin` because the expensive paths are already small enough that debugger overhead can dominate the perceived result.

## Suggested Research Workflow For Future Passes

### Pass 1: Codex grounding

- read local `AGENTS.md`
- inspect the current working tree
- identify hot paths and invariants

### Pass 2: LM Studio chunk review

Recommended chunks:
1. main loop and timer cadence
2. snapshot collection and panel classification
3. neutral scan/render
4. helper lookups and time parsing

Recommended endpoint split:
- use `lms chat` or `/api/v1/chat` for chunks 1-4
- use `/v1/chat/completions` only if you add a controlled external tool layer for latest-facts retrieval

### Pass 3: Codex verification

- compare LM Studio suggestions against actual code
- verify against official docs
- discard conflicting or generic advice

### Pass 4: Patch and validate

- patch only accepted items
- run static checks
- run build if the compiler runtime is available
- perform manual in-game validation

## Gemma 4 Reviewer Notes

Additional local reviewer tested:
- `gemma-4-26b-a4b-it-claude-opus-distill`

Observed local state on 2026-04-06:
- loaded in LM Studio at `12288` context
- `parallel = 1`
- reported size about `14.51 GB`

### Practical behavior in this environment

What worked:
- tiny prompts
- single-idea verdict prompts
- short replies where the model only had to approve or reject one narrow optimization

What failed or degraded:
- a longer settings/research prompt crashed the model process during CLI chat
- output formatting sometimes leaked internal channel-style tokens
- the model drifted toward generic browser/UI advice when the prompt was not tightly constrained

Implication for this repo:
- use Gemma 4 only as a micro-reviewer
- keep prompts narrow, single-purpose, and under roughly `120` output words
- do not use it as the main reviewer for `buff_timer_virgin`

### Snapshot of the latest Gemma review quality

Latest tested prompts:
- narrow verdict on idle-only neutral render slowdown
- narrow review of `collectMinimapSnapshot`
- narrow review of `gTime()`
- narrow review of dead-code cleanup plus in-place state reuse

Observed quality:
- acceptable on the idle render slowdown verdict
- weak on the snapshot/time helpers because it defaulted to generic caching guidance that the code already follows
- acceptable on dead-code cleanup and state-reuse safety checks, where the changes were narrow and explicit

Operational takeaway:
- Gemma 4 is useful for “is this obviously risky?” checks
- it is not reliable for finding the next non-obvious Panorama-specific optimization in this script

### Recommended role split vs `qwopus3.5-27b-v3-i1`

Use Gemma 4 for:
- short yes/no style review checks
- one-idea risk screening
- quick loader/performance sanity checks

Use `qwopus3.5-27b-v3-i1` for:
- chunked code review
- multi-constraint comparison
- hotspot ranking across a larger script region

Reason:
- Gemma 4 was stable here for short prompts, but not for longer review sessions
- `buff_timer_virgin` needs repo-rule-heavy review, which benefits more from the more stable chunk-review flow

## Gemma 4 Loader Guidance

This section is relevant only when Gemma 4 is being used as the local second-opinion model for this workflow.

### Recommended starting settings for ~16 GB VRAM

- context length: `8192` to `12288`
- max concurrent predictions: `1`
- flash attention: `On`
- unified KV cache: `On`
- offload KV cache to GPU memory: `On`
- keep model in memory: `On`
- try `mmap()`: `On`
- number of experts: leave at the model default (`8` in the tested UI)
- force MoE weights to CPU: start at `0`, then raise only if stability requires it

### If you need more context

Try in this order:
1. keep `parallel = 1`
2. keep flash attention enabled
3. enable KV cache quantization before broad offload changes
4. only then push context above `12288`

### Why these settings are the current best fit

Official LM Studio guidance says:
- parallel requests are designed for throughput, and the model loader defaults to `4`
- flash attention is on by default for CUDA in current LM Studio builds
- KV cache quantization lowers cache memory use, and value-cache quantization depends on flash attention
- `numExperts`, `tryMmap`, and load-time context length are all first-class load parameters

Recent community reports suggest:
- Gemma 4 is unusually heavy on VRAM and KV/cache pressure at larger contexts
- some early Gemma 4 GGUF/runtime paths were still being tuned
- interactive use on constrained VRAM is more stable when `parallel` stays at `1`

### Gemma-specific caution for this workflow

Do not treat Gemma 4 as the source of truth for repo optimization advice. In testing here it approved the safe idle render slowdown, but it also suggested an event-driven alternative that is not well-grounded for this Panorama script.

That means:
- use Gemma 4 as a narrow critic
- let Codex decide
- let web-verified docs settle loader/runtime questions

## Validation Checklist

### Static

- `node --check` on [rejuvnbufftimer.js](F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin\panorama\scripts\rejuvnbufftimer.js)
- diff review against local AGENTS constraints
- repeat dead-code scan after any helper removal

### Build

Normal compile command:

```powershell
& "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\buff_timer_virgin"
```

Current note:
- if `sr2compiler\New folder.exe` exits non-zero after printing a successful compile summary, treat the result as valid and verify the compiled files directly

### In-game

- launch with `-dev -tools`
- use Panorama debugger and VConsole sparingly
- verify:
  - rejuv countdown correctness
  - buff countdown correctness
  - claim indicators
  - enemy linger behavior
  - neutral ring alignment
  - scoreboard-open instant visibility
  - no accidental input capture

## References

- [LM Studio local server docs](https://lmstudio.ai/docs/developer/core/server)
- [LM Studio REST quickstart](https://lmstudio.ai/docs/developer/rest/quickstart)
- [LM Studio REST API docs](https://lmstudio.ai/docs/developer/rest)
- [LM Studio OpenAI-compatible endpoints](https://lmstudio.ai/docs/developer/openai-compat)
- [LM Studio tool use docs](https://lmstudio.ai/docs/developer/openai-compat/tools)
- [LM Studio parallel requests docs](https://lmstudio.ai/docs/app/advanced/parallel-requests)
- [LM Studio load config reference](https://lmstudio.ai/docs/typescript/api-reference/llm-load-model-config)
- [LM Studio 0.3.31 changelog](https://lmstudio.ai/changelog/lmstudio-v0.3.31)
- [LM Studio changelog](https://lmstudio.ai/changelog)
- [DuckDuckGo plugin for LM Studio](https://lmstudio.ai/danielsig/duckduckgo)
- [LM Studio model catalog](https://lmstudio.ai/models)
- [Community: 16 GB VRAM local benchmark thread](https://www.reddit.com/r/LocalLLaMA/comments/1s9mkm1/benchmarked_18_models_that_i_can_run_on_my_rtx/)
- [Community: Gemma 4 local runtime discussion](https://www.reddit.com/r/ollama/comments/1savamc/google_drops_open_source_gemma_4_27b_moe_and_its/)
- [Community: LM Studio CPU offload for MoE](https://www.reddit.com/r/LocalLLaMA/comments/1mr7m2r/lm_studio_now_supports_llamacpp_cpu_offload_for/)
- [Community: recent local workflow discussion mentioning Gemma 4 tuning](https://www.reddit.com/r/LocalLLaMA/comments/1scrnzm/local_claude_code_with_qwen35_27b/)
- [Community: large-context VRAM example with Gemma 4](https://www.reddit.com/r/LocalLLM/comments/1sd4ujg/vulkan_is_almost_as_fast_as_cuda_and_uses_less/)
- [Panorama Javascript overview](https://developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools/Panorama/Javascript)
- [Panorama Javascript API](https://developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools/Panorama/Javascript/API)
- [Panorama Debugger](https://developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools/Panorama/Debugger)
