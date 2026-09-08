# Ultimate performance optimization plan

> Capture-context correction: the user confirms these match captures are **spectating**, not playing as a local hero. Empty local identity is expected in this context. Earlier sections labeling the 120/156 unavailable checks as an identity defect or optimization target are superseded. Do not exclude the spectated player as local, substitute `SpectatorTarget` for `LocalPlayer`, or infer participant-mode behavior from these captures.

## Goal

Remove the cooldown-start frame-time regression while preserving accurate native ultimate progress and the working pickup indicators. Execute the stages below in order. Change one performance variable at a time until the expensive path is identified.

The user reported approximately 500 FPS before the ultimate timer starts and 45 FPS afterward. Treat that observation as established; do not ask them to repeat it merely to confirm it.

## Current deployed state

- Module: `test_hpv2/`; deployment wrapper: `build_test_hpv2.ps1`.
- Keep `hp_colors_rewrite_v2/` and unrelated modules untouched.
- Pickup-only checkpoint: `5b82fd8`. Earlier ultimate experiment checkpoint: `8855b97`.
- The current ultimate code was added after the pickup-only checkpoint. It reuses cached pickup topbar rows, samples native ultimate state once per second, and broadcasts `HPV2_ULTIMATE_SNAPSHOT` through `ClientUI_FireOutput`.
- The world receiver validates session, timestamps, names, and angles. Local/dead/disconnected topbar rows and duplicate topbar names are excluded. Duplicate world names still cannot reliably identify distinct players.
- Native `unit_ult_ready_icon` visibility remains engine-owned. Custom artwork lives in `HPV2UltimateOverlay`, with separate dark and colored artwork panels.
- Dark-layer brightness is `0.01`; colored artwork brightness is `2`.
- The user confirms icon-only radial progress works. The colored fill is a direct Image using the stock ready texture, over a separate dark copy. No explicit composition-layer attribute, diagnostic backing, or percentage label remains.
- Latest deployed package: `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak04_dir.vpk`, 58,563 bytes.
- Deployment SHA256: `A9B51EBA2E6E8C15AFEC71AA2B0CA84A6612A761209A0583639E6A2B1D5EE599`.
- Normal visible artwork remains. HUD now skips irrelevant unescaped messages before JSON parsing, using the shared role-aware prefilter; obsolete ultimate angle tracing is removed. Existing function profiling, guards, sampling rates, transport, and rendering are preserved.

Read `AGENTS.md` and `test_hpv2/AGENTS.md` before editing. Re-read current files; this document records the handoff, not an assertion that later workspace state is unchanged.

## Evidence already collected

Latest inspected log: `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\console.log`, session approximately 13:58:56–14:00:11 on 2026-09-08. Logs may be overwritten by later launches.

VProf summary at 14:00:09, lines 3454–3482 in that snapshot:

- 5,861 analyzed frames and 48 one-second intervals; 1,106 frames excluded.
- Average FPS: 131.8. P1 FPS: 44.9.

| VProf category | All-frame average | All-frame P99 |
| --- | ---: | ---: |
| FrameTotal | 7.59 ms | 22.26 ms |
| Client Rendering | 2.92 ms | 7.99 ms |
| PanoramaUI | 2.30 ms | 7.53 ms |
| Javascript | 0.00 ms rounded | 0.22 ms |

Do not sum category percentiles or interpret rounded zero as no cost. This summary does not identify the expensive individual panel or align frame times with the exact cast.

Four complete custom profiler reports were reassembled from this capture. HUD `ultimateTick` had 32 calls / 11 ms total over 30.294 seconds and 30 calls / 4 ms total over 30.291 seconds. One world report recorded 30 `receiveUltimates` calls / 0 ms rounded over 30.064 seconds. The clock was `Date.now coarse`. No `[test_hpv2][ultimate-error]` entries were present. These measurements do not cover deferred layout, rendering, or GPU work, nor establish the cost of every world context.

Capture caveat: at 13:59:54, `host_timescale` increased from 2 through 10, followed by 890 `full repredict will occur` warnings. The aggregate mixes workloads. This does not disprove the user's cooldown-start observation; it prevents attributing the whole summary to the custom clip.

Confirmed stylesheet warnings at 13:59:08:

- `test_world_ultimate.css`: invalid `wash-color` value `teamColor1`.
- `test_world_ultimate.css`: invalid `wash-color` value `teamColor2`.

Correct these against the current native stylesheet definitions or remove redundant rules after confirming the intended fallback. Do not guess replacements, dismiss the warnings as harmless, or claim they caused the FPS regression. Record the correction separately from the performance comparison.

[INFERENCE] The measured UI/rendering cost makes rendering isolation a higher priority than more JavaScript micro-optimizations. The root cause remains unproven.

### Hidden-overlay capture inspected

On 2026-09-08, the next log ended at 14:12:38. The user confirmed the radial was absent, as intended. VProf at 14:12:37 reported 47,998 analyzed frames, 222 one-second intervals, and 310 excluded frames.

| Metric | Earlier fixed-wedge capture | Hidden-overlay capture |
| --- | ---: | ---: |
| Average FPS | 131.8 | 217.6 |
| P1 FPS | 44.9 | 96.2 |
| FrameTotal average / P99 | 7.59 / 22.26 ms | 4.60 / 10.39 ms |
| PanoramaUI average / P99 | 2.30 / 7.53 ms | 0.83 / 2.18 ms |
| Client Rendering average / P99 | 2.92 / 7.99 ms | 2.19 / 5.26 ms |

Twenty-one complete custom profiler reports were reassembled. HUD `ultimateTick` still ran 30–32 times per roughly 30-second window, taking 3–12 ms total. The reported world receiver ran 29–30 times per window, taking 0–1 ms total with the coarse clock. No ultimate errors or `host_timescale` changes were logged; 37 full-reprediction warnings remained. Absence of a timescale-change line does not establish the effective initial value. Both stylesheet warnings remain.

[INFERENCE] Lower Panorama cost with the overlay hidden and timer/delivery still active supports prioritizing the custom drawing path. Different capture durations, workload, and the earlier timescale ramp prevent treating the numerical difference as a controlled causal measurement. This has not demonstrated recovery to the user's 500-FPS baseline. Next isolate the colored clipped subtree from the dark artwork, retaining the same timer and receiver work; do not resume unrelated micro-optimizations based on these aggregates alone.

### Dark-artwork-only capture inspected

The next log ended at 14:18:50 on 2026-09-08. VProf at 14:18:49 reported 27,399 analyzed frames, 100 one-second intervals, and 444 excluded frames. Average FPS was 277.2; P1 was 136.4. FrameTotal average/P99 was 3.61/7.33 ms; PanoramaUI was 0.70/1.52 ms; Client Rendering was 1.56/2.96 ms.

Ten complete custom profiler reports were reassembled. HUD `ultimateTick` still ran 30–32 times per roughly 30-second window, taking 5–14 ms total. The reported world receiver ran 30 times per window, taking 0–1 ms total with the coarse clock. No ultimate errors or timescale changes were logged; 20 full-reprediction warnings remained. Both stylesheet warnings remain.

[INFERENCE] Dark artwork alone does not reproduce the earlier expensive Panorama aggregate in this capture. It even has lower aggregate cost than the fully hidden capture, demonstrating workload/capture variation rather than evidence that adding a dark layer improves FPS. The colored subtree/partial clip remains the next isolation target, not a confirmed cause. Next show the colored subtree at a fixed full 360-degree clip, keeping timer/delivery and other state unchanged; compare that with a fixed partial clip under matching conditions to distinguish extra artwork from partial clipping.

### Fixed-360-degree capture inspected

VProf at 14:25:43 on 2026-09-08 reported 6,383 analyzed frames, 72 one-second intervals, and 75 excluded frames. Average FPS was 88.0; P1 was 44.3. FrameTotal average/P99 was 11.36/22.58 ms; PanoramaUI was 3.97/9.65 ms; Client Rendering was 4.27/9.32 ms. JavaScript average/P99 was 0.01/0.25 ms.

Six complete custom profiler reports were reassembled. HUD `ultimateTick` ran 30–32 times per roughly 30-second window, taking 5–11 ms total. Reported world `receiveUltimates` ran 30 times per window, taking 0 ms at coarse-clock precision, not proof of zero cost. No ultimate errors or timescale changes were logged. Three full-reprediction warnings and both stylesheet warnings remained.

[INFERENCE] High UI/rendering cost persists with a stationary full colored layer. A changing clip or partial wedge is not necessary for this capture's slowdown. This does not isolate radial clipping itself: a 360-degree radial declaration still exists and may retain a clipping/rendering path. Next keep both artwork layers visible but disable radial clipping entirely, including the receiver's clip write, to distinguish clipping from the extra artwork/brightness/compositing path. Different capture conditions still prevent treating cross-run differences as controlled causal measurements.

### Rendering research against the installed engine

Research requested after the fixed-360 capture. Runtime and deployed package were not changed during this research.

Primary evidence:

- Freshly read `G:/SteamLibrary/steamapps/common/Deadlock/game/bin/win64/panorama.dll`, SHA256 `294d17d96a79e7cfec1740dd1dff1823b1747281fc7d5d2c0c8c66b0c4c836ac`. Exact strings and file offsets are saved in [native-render-evidence.json](../.tmp/hpv2-render-research/native-render-evidence.json). At file offset `0x464c80`, its clip help says contents are clipped at render time, clipping has no layout impact, and is "fast and supported for transitions/animations." This contradicts an explanation based on ordinary layout reflow. It does not guarantee cheap GPU rendering in this hierarchy.
- At file offset `0x4673e0`, brightness help says it applies to the panel and its children "during composition." The binary also contains `panorama_allow_texture_composition_layer_fast_path`, `panorama_hsbc_through_fast_path`, and composition-layer/cache property names. Their presence does not prove which path this overlay uses or establish safe cache-setting changes. Do not add undocumented cache attributes or change global convars as a guessed fix.
- Source 2 Viewer freshly extracted current stock styles from the installed `citadel/pak01_dir.vpk` into `../.tmp/hpv2-render-research/panorama/styles/`. `unit_status_v2.css:195-202` places the same ultimate texture, 100% dimensions, and brightness `2` directly on `#unit_ult_ready_icon`. `unit_status_icons.css:170-179` places status-border artwork directly on `#StatusEffectsBorder`. These are native direct-background patterns, not evidence of an exact performance guarantee.
- Current custom XML `panorama/layout/unit_status_overlay_v2.xml:26-30` instead clips `#HPV2UltimateFill`, which has no artwork of its own, around a child `.HPV2UltimateArtwork`. The dark artwork is already a direct leaf. Both use the same texture; brightness and nesting differ. Therefore the dark/full comparison does not isolate only clipping.
- Current stock `unit_status_v2.css:225-247` uses `team1Color` and `team2Color`, not the custom stylesheet's `teamColor1` and `teamColor2`. This explains the two parsing warnings. Correct them separately from the performance comparison; there is no evidence they cause the FPS collapse.

The [Valve Panorama CSS reference](https://developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools/Panorama/CSS_Properties) was blocked by its access challenge during research. Installed-binary help above supplies the primary CSS semantics. No authoritative direct-leaf/subtree performance specification or proof of this overlay's GPU bottleneck was found.

Ranked hypotheses and predictions:

1. **Clipped-parent composition overhead.** If this hierarchy is responsible, retaining visible artwork while removing the clip should lower cost; subsequently putting the artwork directly on the clipped leaf should avoid the regression while restoring progress.
2. **Artwork/brightness composition independent of clipping.** If removing the clip leaves cost high, test the colored artwork's brightness/composition independently before changing timer work. Native brightness `2` exists, so brightness alone is not established as erroneous.
3. **World-panel workload/invalidation differences across captures.** If neither isolated change produces a repeatable difference, compare actual rendered panel counts and rendering work under matching scenes. Do not infer on-screen eligibility from an element's `visible` property alone.

Smallest candidate correction, not yet applied or proven: move `class="HPV2UltimateArtwork"` onto `#HPV2UltimateFill` and delete its single nested artwork panel. Preserve the overlay container, custom dark artwork at `0.01`, native ready-icon ownership, dimensions, tint, and all identity/lifecycle guards. This follows the direct-background pattern without replacing the dark artwork with the non-equivalent native base.

Next causal check remains the visible, entirely unclipped comparison. A full 360-degree radial declaration is not proof that clipping is bypassed. If that check implicates clipping, evaluate the one-panel flattening above, then restore native progress and verify the original cast. Research is complete; the performance fix remains unverified.

### Unclipped-artwork capture inspected

VProf at 14:37:56 on 2026-09-08 reported 10,825 analyzed frames, 191 one-second intervals, and 676 excluded frames. Average FPS was 56.6; P1 was 26.0. FrameTotal average/P99 was 17.67/38.46 ms; PanoramaUI was 6.75/16.20 ms; Client Rendering was 7.34/16.35 ms. JavaScript average/P99 was 0.01/0.27 ms.

Nineteen complete custom profiler reports were reassembled. HUD `ultimateTick` ran 29–32 times per roughly 30-second window, taking 3–9 ms total. Reported world `receiveUltimates` ran 29–30 times per window, taking 0–1 ms total at coarse-clock precision. No ultimate errors or timescale changes were logged. Twenty full-reprediction warnings and both stylesheet warnings remained.

[INFERENCE] Removing the custom ultimate clip did not eliminate high UI/rendering cost. Radial clipping is not necessary for this capture's slowdown, so it is no longer the leading standalone explanation. Do not claim that removing clipping caused the worse aggregate: this capture covers 191 intervals versus 72 in the fixed-360 capture, and workload equivalence has not been established. The visible colored artwork/hierarchy remains suspect; low JavaScript time still does not measure deferred rendering.

Next single-variable comparison: flatten `#HPV2UltimateFill` into the artwork-bearing panel by moving the artwork class onto it and removing only its nested child. Keep clipping absent, brightness unchanged, the dark artwork intact, and timer/eligibility logic unchanged. This tests hierarchy without assuming that clipping caused the regression. If high cost persists, isolate colored brightness/composition next rather than restoring progress as a claimed fix.

### Flattened, unclipped-artwork capture inspected

VProf at 14:43:12 on 2026-09-08 reported 37,523 analyzed frames, 82 one-second intervals, and 620 excluded frames. Average FPS was 457.6; P1 was 193.7. FrameTotal average/P99 was 2.19/5.16 ms; PanoramaUI was 0.36/0.75 ms; Client Rendering was 0.90/1.58 ms.

Seven complete custom profiler reports were reassembled. HUD `ultimateTick` ran 30–32 times per roughly 30-second window, taking 5–10 ms total. Reported world `receiveUltimates` ran 30 times per window, taking 0 ms at coarse-clock precision. No ultimate errors or timescale changes were logged. Thirty-nine full-reprediction warnings and both stylesheet warnings remained.

[INFERENCE] This is the strongest result so far for retaining the direct-artwork hierarchy: UI cost is low with sampling and delivery active, and only the world layout asset changed from the previous diagnostic. The aggregate does not prove an exact GPU/cache mechanism or a controlled speedup; the previous capture covered 191 intervals versus 82 here, and visible workload equivalence has not been independently established. Receiving snapshots is not itself proof of visible matching artwork.

Next restore actual native cooldown clipping directly on the artwork-bearing `HPV2UltimateFill`, retaining change-detected writes and the dark sibling. Keep brightness, transport, cadence, and native ready-icon ownership unchanged. Verify post-cast partial fill and performance together before declaring the original bug fixed. The deployed diagnostic still intentionally stays full; no restoration has been deployed yet.

### Restored-clipping capture and stalled progress

The user reports that the radial moves only slightly and then stops. Treat this as a real functional failure, not the former always-full diagnostic.

VProf at 14:49:23 on 2026-09-08 reported 39,877 analyzed frames, 94 one-second intervals, and 1,081 excluded frames. Average FPS was 434.3; P1 was 199.9. FrameTotal average/P99 was 2.30/5.00 ms; PanoramaUI was 0.37/0.81 ms; Client Rendering was 0.94/1.64 ms. No ultimate errors or timescale changes appeared in the searched capture; both stylesheet warnings remained. Three reported HUD windows had 30–32 ultimate ticks and 7–12 ms total work each; three world windows had 30 receiver calls and 1–2 ms total each.

Low UI cost persists in this capture with clipping restored, but the progress bug is not resolved. Existing logs contain no raw ultimate angles, so they cannot establish whether the native value freezes, validation/identity stops accepted updates, or the renderer stops displaying changed clips. Do not invent a cooldown duration or force repaint blindly.

The new bounded trace records HUD row ID, angle, native clip and unlocked/ready flags; world source ID, message timestamp, received/previous angle, clip readback and local visibility properties; active-overlay clears and validation rejections. Readback is not pixel evidence, and local `visible` does not prove on-screen rendering. Match timestamps to trace source → receiver → clip assignment. Frozen HUD values direct investigation upstream; advancing HUD values without world paint require validation/identity tracing; advancing world angles/readback with stalled pixels implicate rendering. Capture the cast before the 120-record context budget is exhausted, then remove this temporary instrumentation once diagnosed.

### Progress trace confirms advancing clip values

The user reports missing radial progress and a full ready image remaining after casting. The trace contains 84 HUD samples and 84 world paint records. The post-cast angle advances from 1.361833 to 155.042755 degrees; all recorded world clip readbacks match their received angle within 0.00001 degrees. No world clear/rejection events were recorded. HUD readiness becomes false after casting. These observations establish advancing data and clip assignment in this capture, not correct pixels or the native world's own icon state.

VProf at 14:56:16 on 2026-09-08 reports 432.1 average FPS, P1 215.5, and Panorama average/P99 0.39/0.76 ms. Timing work is not the current correction target.

[INFERENCE] Remaining candidates are overlapping native/background artwork and a stale or ineffective render mask. The first scoped intervention masks the native ready image only while custom data owns the display, without changing its engine-controlled visibility. If the full artwork remains, this candidate failed to isolate the visible source; inspect remaining layers/rendering rather than modifying transport or hardcoding durations. The trace remains bounded and temporary.

### Scoped mask did not resolve the visual stall

The user supplied a screenshot and again reports that progress moves slightly then stops. Latest world trace values still advance from 1.125004 to 146.871719 degrees with matching displayed clip strings and no clear/rejection records. The latest capture at 15:01:38 on 2026-09-08 reports 481.2 average FPS, P1 214.8, and Panorama average/P99 0.34/0.75 ms. Scoped masking is not a confirmed solution; do not blame sampling or delivery for the advancing trace.

Read-only analysis of the installed Panorama binary verified more than the property-name string. The `require-composition-layer` name is stored at VA `0x180560f30`; the setter path at `0x1800e39d6` parses its value and sets bit 0 at panel offset `0x117`. Rendering reads that bit at `0x1800e8b01` and passes it onward at `0x1800e8bb9`. Binary identity, disassembly, and limits are saved in [required-layer-evidence.json](../.tmp/hpv2-render-research/required-layer-evidence.json). These facts establish an implemented per-panel control, not the active GPU path or a guarantee that it fixes clipping.

The single-attribute experiment requests that layer on the colored artwork leaf only. No wrapper/child subtree, global convar, forced per-frame repaint, timer change, or duration estimate was added. Keep both correctness and frame cost as acceptance gates: the earlier expensive hierarchy shows why visual success alone is insufficient. If this fails, do not present successive speculative cache controls as established fixes.

### Explicit composition layer also failed

The user reports the same slight movement and stall. The 15:09:22 capture records world angles advancing from 7.194071 to 124.815804 degrees with matching clip readbacks and no clear/rejection events. VProf reports average FPS 451.8, P1 211.7, and Panorama average/P99 0.37/0.77 ms. This does not establish a rendering fix.

Fresh Source 2 Viewer extraction of `hero_info_panel_ultready_bg_psd.vtex_c` shows centered artwork inside a square texture. The extracted PNG is under `.tmp/hpv2-render-research/panorama/images/hud/world_space/`. Simple off-center artwork is not supported by that evidence.

The next diagnostic removes the failed explicit-layer attribute and adds two visible probes to the existing overlay: an unclipped percentage label driven by the accepted angle, and a translucent solid background on the existing clipped artwork panel. No timer or transport change. The backing deliberately exposes the wedge outside the texture's transparent areas.

Interpretation for the same cast:

- Percentage and backing advance, artwork does not: investigate texture-specific clipping/composition.
- Percentage advances, backing and artwork stall: investigate the fill panel's clipping path.
- Percentage also stalls while logs advance: investigate visible-instance ownership or an ancestor's stale rendering rather than trusting cached-panel readback.

These are temporary diagnostic visuals, not the approved appearance or a confirmed correction. Remove both after diagnosis. A screenshot or clip comparing the visible percentage, backing wedge, and native topbar is the next acceptance input; parser/build checks cannot provide it.

Diagnostic build verification: all six pure-data checks, JS syntax checks, required compiled assets, exact Source 2 Viewer inventory, and deployment hash comparison passed. The compiler wrapper required its documented stop after producing output. Deployed pak04 is 59,953 bytes, SHA256 `A782C36F0EB0B7CA9430B09DBC408539980450FC23D8BE4C8E4731DA93506646`. Live probe behavior is not yet observed.

### Live probes advance with the native topbar

The user confirms that the percentage is visible and the backing wedge expands like the topbar ultimate. The 15:18:30 capture records accepted world angles from 3.878281 to 229.588806 degrees with matching readbacks and no clear/rejection events. VProf reports average FPS 435.5, P1 211.7, and Panorama average/P99 0.39/0.66 ms.

This establishes visible update delivery and an advancing clip on the backing, not just JS readback. It narrows the remaining reported artwork problem to the image drawing path or overlapping artwork; it does not identify a native cache bug.

The next targeted comparison changes only the colored fill from a Panel CSS background to an Image with the same stock texture as its `src`. The dark layer keeps its CSS background. Preserve the direct-leaf hierarchy, dimensions, tint, brightness, clip writes, and both temporary probes. Existing pickup glyphs use Image content, but that does not prove ultimate clipping will work. Check whether the actual eye artwork now follows the backing wedge before accepting this as a correction.

Image-content comparison build: all six pure-data checks, syntax checks, required outputs, exact Source 2 Viewer inventory, and deployment hash comparison passed. The compiler wrapper needed its documented stop. Deployed pak04 is 60,026 bytes, SHA256 `1952F1447908FF4547D0B650C0CCA6D5DA02887BCE62AAE2122DE6E2B7617DB9`. Script CRC is unchanged from the preceding probe build. Live image-content clipping remains unverified.

### Remove the visible diagnostic backing

The user reports that the whole border is being colored radially and clarifies that only the ultimate-ready icon should be clipped. The translucent `background-color` intentionally painted the fill panel outside the texture alpha; retaining it obscured the requested appearance. Remove that backing and the temporary percentage label, including its cached reference and writes. Keep the clipped Image source and dark artwork copy unchanged. This removes the known broad diagnostic sector; actual icon-only progression still requires live confirmation.

Icon-only build verification: all six pure-data checks, syntax checks, compiled-output checks, exact Source 2 Viewer inventory, and deployment hashes passed. The compiler wrapper required its documented stop. Deployed pak04 is 59,368 bytes, SHA256 `C5E3593E8694E1B861EC56E728CCF4329D53E584F2C6AC76790A3B73D58A7A49`. The visible probes and their runtime references are removed; bounded angle logging remains until the artwork issue is resolved. Live icon-only rendering is not yet verified.

The user confirms that the icon-only build now works and will test it in a live game. Treat functional clipping as live-confirmed. No additional telemetry is needed for that first capture: existing wrappers time `ultimateTick` and `receiveUltimates`, with 30-second reports capped at 240 per context. Reports include only the top timing/call rows, so a missing row is not proof of zero work. The bounded angle trace remains limited to 120 records per context. Preserve this deployed build for the first live baseline; collect engine frame/render timings alongside JS reports because wrapper timings do not measure completed rendering or GPU cost.

### Gameplay-loop research after the live match

Scope: find avoidable ultimate sampling/receiver/render work without worsening cast detection, panel recovery, or stale-state clearing. Research only; preserve the working deployed package.

#### Measured limits

The unchanged console capture has SHA256 `b2061e6f2e2d1661aba0945de6b77ae74780bcf2ebf0afe8937002ffa93ab414`. Its 15:36:44–15:47:19 live VProf span includes 84,262 frames and 630 one-second intervals. FrameTotal average/P99 is 7.50/11.79 ms; Panorama is 1.62/3.00 ms; Client Rendering is 3.45/5.59 ms. These categories do not isolate this mod.

Reassembly recovered 506 complete profiler reports with no missing or malformed chunks. Of these, 499 reset windows fit wholly inside the live span. Deduplicate `topSelf` and `topCalls` by label inside each report. The clock is `Date.now coarse`; missing top-list entries are not zero work. Cross-context synchronous callbacks can be included in their caller's timing, so do not add the HUD and world totals as independent CPU cost.

- HUD `ultimateTick`: 598 calls, 453 ms self, 486 ms inclusive, 2 ms maximum, across 600.471 seconds of complete HUD windows. That is about **0.754 ms self per second**, not per frame.
- World `receiveUltimates`: 7,248 calls, 190 ms self, 215 ms inclusive, 1 ms maximum across sampled world windows. Coverage is per context, not one continuous process-wide trace.
- Local identity: 120 unavailable gate checks and zero ready checks in complete live HUD windows. The cause still requires native-identity evidence; do not substitute a guessed local class or player name.
- Bounded world angle traces contain 1,434 paints, including **679 unchanged angles, 47.35%**. Those already avoid clip assignments through the existing angle cache. There is no additional 47% clip-write saving to claim.
- All **144 observed batches with at least six world paint records** contain a changed angle. A whole-snapshot equality gate would not suppress those batches. These receiver observations are not complete publisher payloads, and bounded logging prevents full-match traffic-savings estimates.
- Whole-log diagnostic text includes 447,415 bytes of angle traces and 1,204,612 bytes of profiler chunks, including prefixes and CRLF. This measures emitted text, not its runtime cost.

Measured artifact: [live-gameplay-loop-evidence.json](../.tmp/hpv2-render-research/live-gameplay-loop-evidence.json). Primary runtime sources: [ultimate validation, receipt, and publication](panorama/scripts/test_topbar_pickups.js#L78-L192), [local discovery](panorama/scripts/test_topbar_pickups.js#L500-L532), [scan-gate identity](panorama/scripts/test_topbar_pickups.js#L736-L764), and [profiler activation/reporting](panorama/scripts/test_pickup_profile.js#L5-L98).

#### Best next target: ineligible world-panel work

The current receiver validates the whole player array and reads the world name before checking `CLASS_PLAYER` and `LocalPlayer`. Every world script registers the event listener. World profiling starts only after `sampleUnit` finds a player ancestor, so the measured player-context costs do **not** establish the cost of all non-player listeners. See [receiver ordering](panorama/scripts/test_topbar_pickups.js#L110-L126), [player-only profiler activation](panorama/scripts/test_topbar_pickups.js#L313-L326), and [listener registration](panorama/scripts/test_topbar_pickups.js#L841-L848).

The smallest source-backed candidate is to reject an ultimate message for a currently ineligible world context before player-array validation and name lookup. Keep the scan-gate route untouched, retain full validation before applying eligible data, clear any previously owned visual on eligibility loss, and re-evaluate eligibility on each existing message rather than permanently disabling the listener. Do not move a naive raw-string filter ahead of escaped scan-gate parsing. This is a candidate reduction in unnecessary JS work, not a proven large FPS gain.

Native CSS also collapses `#InfoHealthContainer` for `health_hidden` and `GameStatePreGame`, and `#UnitStatus` for `beingSpectatedInEye`: [extracted native rules](../.tmp/hpv2-render-research/panorama/styles/unit_status_v2.css#L114-L132). The ultimate receiver does not inspect these classes before writing a changed clip. A hidden-paint optimization must retain the latest validated state, invalidate the painted-angle cache while hidden, and paint current state before showing a recovered/rebuilt panel. Skipping data processing entirely can strand an icon. Source CSS proves those selectors hide content; it does not prove which classes occur on the live context's ancestry or how much rendering the engine already skips.

The overlay is currently authored in a shared native snippet. Creating its three custom nodes only when a confirmed nonlocal player first needs them could reduce irrelevant allocations, but instance counts, native snippet load order, sibling draw order, and recovery need an actual runtime probe. Do not promise a saving from an unmeasured non-player panel count.

#### Latency and lazy-work boundaries

- Keep the one-second native sampler for the first optimization. Existing rows detect a cast on the next sample, approximately 0–1 second plus scheduling delay. Slow ready/locked polling increases that delay.
- Keep five-second discovery for loading/replacement recovery unless a native wake signal is verified. Existing-row update latency and new-row discovery latency are separate.
- A longer unchanged-state heartbeat can delay a newly created world receiver and approach the four-second freshness limit. It buys little while any player cooldown changes each second, as the sampled batches demonstrate.
- Ready and locked states already avoid normal cooldown parsing, and unchanged values already avoid clip writes. Do not add a second cache for the same work.
- Remove bounded angle tracing in a separate cleanup build now that clipping is functional. Keep profiling identical during the targeted before/after comparison, then measure with diagnostic profiling removed before a production performance claim.
- Preserve name/session/order checks, death/disconnect exclusion, tombstones, pickup calibration and its event-driven relay. No speculative events, estimated ultimate durations, global convars, cache flags, or per-frame polling.
- Do not turn `clearUltimate` into `if (!ultimateName) return`. Overlay reacquisition clears that name before an acquisition failure can call cleanup; the unconditional owned-class removal still repairs that state. A redundant-looking write is not automatically removable.

The largest measured headroom remains engine UI/rendering, not the sub-millisecond-per-second sampled HUD loop. Attribute that cost with a controlled scene or fresh ETW/render evidence before claiming this mod can recover it. No game FPS or input-latency improvement has been measured by this research.

#### Local identity result and implementation order

`LocalPlayer` is still the canonical topbar class. Freshly extracted native CSS contains `CitadelHudTopBarPlayer.LocalPlayer` selectors: [native topbar CSS](../.tmp/hpv2-render-research/panorama/styles/citadel_hud_top_bar.css#L598-L629). Renaming the check to a guessed lowercase or similar class is unsupported. The current discovery checks the direct `CitadelHudTopBarPlayer` owner; the gate additionally requires exactly one nonempty, unique local name. The 120 unavailable results do not distinguish a missing runtime class, a traversal mismatch, or name ambiguity.

A bounded probe on the existing five-second discovery should count local direct-owner matches, local ancestor matches, number of native `LocalPlayer` panels with the expected panel type, empty local labels, and duplicate-name rejection. Log counts only, not names or raw class dumps. This identifies the missing condition without adding a new timer. Fixing one local row cannot be sold as a 12-player-wide optimization; it removes that row's work plus any local world work actually being performed. No alternate Game/Players API was live-verified for this context.

Recommended sequence:

1. **First implementation candidate:** early ultimate-only eligibility rejection, with existing publication cadence and gameplay guards unchanged. Keep full eligible-message validation; never block scan-gate initialization. Measure non-player receiver work explicitly because the current player-only profiler misses it.
2. **Potentially larger rendering reduction:** lazy creation of the custom overlay only for eligible players, then hidden-paint gating with state recovery. Require actual instance counts and hidden-to-visible/rebuild checks before choosing this over the simpler guard. Existing native hidden rendering may already remove much of the GPU work.
3. **Independent correctness probe:** resolve why canonical local identity is unavailable, then apply only the verified correction.
4. **Separate cleanup comparison:** remove obsolete angle traces; later remove the temporary profiler. Do not combine logger removal with the first runtime optimization if the goal is causal attribution.

For the eligibility/lazy-render candidate, live acceptance is: non-player contexts perform no ultimate array validation, lookup, or paint after rejection; scan gates still establish sessions; a later eligible context accepts the next current snapshot; hidden/rebuilt players paint the newest valid angle on recovery; stale/wrong-session data never wakes an overlay; the approved icon and pickup visuals remain intact. Actual ultimate clip-write/create/skip counters are needed for that experiment. The existing `clipWrites` counter belongs to pickup `paintProgress`, not ultimate painting, so its count of 592 cannot measure ultimate work.

Research completion: primary runtime/native-style constraints inspected, captured observations reassembled and measured, input/package hashes checked, and candidates ranked with recovery requirements. The working package is unchanged. No performance gain is claimed and no new runtime loop, counter, or guard has been deployed.

## 1. Separate rendering cost from timer cost

Status: the user confirms icon-only clipping works. Live-match performance is the next gate; existing instrumentation remains unchanged for the first capture.

Use the same repeatable cast, camera, scene, bot count, graphics settings, and constant timescale. Keep profiler settings identical across comparisons. Restart Deadlock after every VPK replacement. Avoid leaving the Panorama inspector open in only one variant.

| Variant | Purpose |
| --- | --- |
| Pickup-only checkpoint, same cast | Separate native ability effects from the ultimate feature |
| Ultimate sampling/delivery running, custom overlay collapsed | Isolate timer, parsing, and event-delivery work without custom drawing |
| Dark artwork visible, colored fill collapsed | Separate unclipped dark artwork from the colored clipped subtree |
| Colored subtree visible at fixed 360 degrees | Measure extra colored artwork with no partial wedge |
| Both artwork layers visible, no clip declaration or writes | Separate radial clipping from artwork and hierarchy cost |
| Direct artwork on fill panel, still unclipped | Isolate the extra artwork child while preserving other rendering settings |
| Fixed partial wedge | Measure persistent partial-clip rendering without changing the wedge |
| Live native radial progress | Measure the additional effect of changing the clip |

**Current controlled change:** restore native-angle radial clipping directly on the flattened artwork-bearing fill, with an initial zero clip and change-detected writes. Clearing the overlay or acquiring a replacement fill invalidates the angle cache. Preserve hierarchy, dark sibling, brightness, eligibility, sampling, delivery, validation, and pickup behavior. Unlike the preceding diagnostics, this build should show actual cooldown progress rather than intentionally staying full after casting.

Collect fresh frame-time and CPU/render-thread evidence. Use GPU timing where available. VProf aggregates provide context; fresh ETW/PerfView captures with valid frame events are required for defensible before/after FPS claims. Keep original captures and distinguish CPU-only traces from frame-pacing evidence.

Interpretation:

- If collapsing the overlay recovers performance, investigate the custom drawing path.
- If a fixed partial wedge is expensive, investigate clipping/compositing, texture layers, and world-panel surface size rather than update frequency alone.
- If only changing the wedge is expensive, investigate invalidation and clip-write cost.
- If the hidden overlay still lags, compare against pickup-only and inspect event fan-out, native ability effects, and other game work.

Completion: a controlled comparison identifies which path adds cost. Do not claim a diagnosis from the current mixed-timescale summary.

## 2. Stop work for ineligible and hidden panels

Status: approved direction; implementation waits for stage 1 evidence so changes do not obscure causality.

- Create custom layers only for confirmed eligible player healthbars. The current layers are authored inside a shared native snippet; investigate how broadly they are instantiated before claiming a panel count.
- Reject confirmed non-player contexts before parsing ultimate messages. Preserve scan-gate handling and load-order recovery needed by the pickup runtime.
- Suppress clip writes while the healthbar is genuinely hidden. Synchronize current validated state before showing it again.
- Establish which native ancestor visibility/offscreen signals are reliable. `panel.visible` alone is not proof of on-screen visibility.
- Do not use the custom overlay's initially collapsed state as an eligibility gate; that creates a wake-up deadlock.
- Collapse only owned panels, never a parent containing stock HUD content.
- Keep panel references cached, but validate ownership when native panels are rebuilt or reused.

Completion: hidden/ineligible contexts avoid unnecessary custom allocation and painting, and visible/rebuilt healthbars resume correctly without stale progress.

## 3. Match work to the gameplay lifecycle

Status: approved direction; not implemented.

| State | Intended work |
| --- | --- |
| Lobby/disconnected | Stop ultimate sampling and clear session-owned state; retain a proven wake-up path |
| Locked/ready | Skip unnecessary cooldown-clip reads and unchanged writes; retain lightweight cast detection |
| Cooling down | Sample native progress for eligible rows at the justified cadence |
| Paused | Suppress unchanged publication/painting while retaining lifecycle detection |
| Hidden world healthbar | Avoid drawing; synchronize before re-entry |
| Death, rename, reconnect, new match | Invalidate stale state and cached ownership as required |

- Use verified lifecycle signals, not guessed events or unverified engine APIs.
- Do not reuse the pickup five-minute scan gate for ultimates.
- Do not treat a hidden topbar or Escape-menu transition as proof that world healthbars are irrelevant.
- A reduced idle cadence can delay cast detection. Keep a lightweight check unless a reliable native event can wake the sampler; make any latency tradeoff explicit.
- Preserve the existing pickup relay, pause accounting, calibration, expiry, duplicate-name protection, and session guards.

Completion: idle work is reduced without missed casts, broken pause/resume, stuck icons, or failed session recovery.

## 4. Reduce broadcast work without breaking recovery

Status: approved direction; not implemented.

The current ultimate sampler serializes and broadcasts a complete snapshot once per second even when all published state is unchanged.

- Publish changed state, with a bounded heartbeat for freshness and newly created healthbars.
- Keep heartbeat timing compatible with receiver expiry; the current ultimate freshness boundary is four seconds.
- Preserve explicit clearing when a player disappears or becomes ineligible. Silence must not leave an old indicator alive indefinitely.
- Reuse cached rows and panels. Avoid adding a second discovery loop or duplicate serialization merely to detect unchanged payloads.
- Preserve ordering, session, local-player, duplicate-name, and invalid-data guards.
- Keep the live-proven event-driven pickup relay. Do not replace it with a speculative network API or restore relay polling.
- Measure temporary profiler overhead separately, then remove temporary diagnostics after verification.

Completion: unchanged-state traffic decreases while active cooldowns, new receivers, tombstones, and recovery remain correct.

## Final acceptance and verification

- The same ultimate cast no longer produces the reported severe frame-time collapse.
- Compare average/median and tail frame times, including P95/P99 where the capture provides them. Do not accept lower CPU with worse frame pacing as an unconditional improvement.
- Restore actual native radial progress; remove the fixed-90-degree diagnostic and any later isolation switches before treating the package as production behavior.
- Preserve dark brightness `0.01`, local-player exclusion, native icon visibility ownership, and working pickup behavior.
- Resolve the confirmed stylesheet warnings and verify in the actual Panorama runtime. Successful compilation alone does not prove supported runtime CSS.
- Run `powershell -NoProfile -ExecutionPolicy Bypass -File build_test_hpv2.ps1`. Preserve exact compiled-asset checks and deployment hashes; use Source 2 Viewer exclusively for VPK inspection.
- Do not add or run mocked Panorama tests. Pure-data boundary checks and actual builds are permitted, but cannot prove frame-time improvements.
- Keep build/package evidence separate from live rendering and performance evidence. State missing evidence explicitly instead of reporting an unfinished performance fix as done.

## Minimal eligibility implementation

The user resumed implementation and requested YAGNI and one-line changes where practical. Only `test_topbar_pickups.js` runtime code changed: `receiveUltimates` now rejects a non-`CLASS_PLAYER` or native `LocalPlayer` context before full snapshot validation and name lookup. It clears previously owned state if the tracked name or owned active class exists, including class cleanup after overlay churn. Eligibility is rechecked on every ultimate event, so later eligibility can recover through the unchanged one-second snapshots. The old later class checks were removed; the local-name exclusion remains.

This guard runs **after JSON parsing**, inside the ultimate-specific receiver. The shared scan-gate route is unchanged. It saves array validation, name lookup, and redundant visual cleanup in ineligible contexts, not event delivery, JSON parsing, static allocations, or GPU work. Eligible messages retain all existing session/order/freshness/duplicate-name validation.

Three counters use the existing profiler, without new helpers, timers, report loops, or diagnostics objects:

- `ultimateIneligibleSkips`: early eligibility returns.
- `ultimateClipWrites`: successful changed-angle clip assignments.
- `ultimateUnchangedSkips`: valid fill updates whose angle is already painted.

Counter coverage is deliberately unchanged: they appear only in active profiler contexts, within the existing 30-second reset windows and 240-report cap. A context that never qualified as a player never starts world profiling, so its early skips remain uncounted. Do not interpret absent skip counts as no non-player saving or claim these counters measure all world contexts.

Verification: the wrapper passed all six pure-data checks, JS syntax, required compiled outputs, exact Source 2 Viewer inventory, and matching deployment hashes. The compiler wrapper required its documented stop after producing output. Only the runtime script CRC changed; XML, CSS, relay, and profiler assets are unchanged. No Panorama mocks were added or run.

Remaining live check: after restart, confirm normal icon progress, local/ineligible clearing, and recovery when a player panel becomes eligible or is rebuilt; collect VProf and profiler reports with the same workload. The pure validators do not exercise native class transitions, and the build cannot establish a FPS or latency gain. Hidden-paint gates, lazy creation, local-identity probing, cadence changes, and diagnostic removal were not bundled into this comparison.

### Eligibility-build live capture

The next VProf span, 16:15:35–16:29:28 on 2026-09-08, contains 107,470 frames and 829 one-second intervals. Average/P1 FPS is 129.2/80.4 versus 133.4/84.8 in the earlier 630-interval live capture. FrameTotal average/P99 is 7.74/12.43 ms versus 7.50/11.79. Panorama average/P99 is 1.62/2.76 ms versus 1.62/3.00; P95 of one-second Panorama maxima is 7.53 ms versus 7.09. Different live workloads and durations prevent attributing either direction to the guard. There is no demonstrated overall performance gain.

All chunks reassembled without missing or malformed reports; 674 complete reset windows fit wholly inside this live span. Active world contexts report 3,182 ultimate clip writes and 4,971 unchanged skips, 60.97% of those two update paths. This confirms the existing change detector skips redundant writes; it is not an improvement caused by the new eligibility guard. `ultimateIneligibleSkips` is absent from these reports. Never-player contexts remain unprofiled, so absence cannot establish zero early returns or quantify non-player savings. HUD reports 156 unavailable local-identity checks and no ready checks; the independent identity issue remains.

HUD ultimate sampling records 777 calls, 562 ms self across 780.696 seconds, about 0.720 ms per second, with 2 ms maximum. World ultimate receipt records 9,696 calls, 224 ms self, and 1 ms maximum across its per-context windows. No tagged ultimate, pickup-clip, or pickup-receive errors occur. Coarse clocks, partial top lists, and synchronous cross-context timing overlap still apply. Successful setter counts do not prove visible transition recovery or input latency.

Evidence: [eligibility-live-evidence.json](../.tmp/hpv2-render-research/eligibility-live-evidence.json). Keep rendering attribution and the unresolved local-identity path ahead of further sampler micro-optimization. No source/package change was made while analyzing this capture.

## Local-identity reason counters

The user approved a bounded diagnostic on the existing five-second discovery/gate pass. Identity decisions, ultimate cadence, and visuals are unchanged; only the runtime script asset changed. Existing profiler reports remain on 30-second reset windows, capped at 240 reports per HUD context. No names, raw payloads, new timers, diagnostic objects, or helper functions were added.

- `identityInvalidLabels` / `identityMissingOwners`: invalid labels or labels whose ancestor walk cannot reach a native topbar player.
- `identityAncestorOnly`: a nonlocal-classed row owner has `LocalPlayer` somewhere in its ancestry.
- `identityLocalClassPanels`: when discovery retains no local labels, a diagnostic class search counts native `LocalPlayer` descendants anywhere under the topbar. This is a sum across passes, not unique players, and does not include the topbar root itself.
- `localIdentityNoLabel` / `localIdentityMultipleLabels`: zero or multiple retained local labels.
- `localIdentityEmptyName` / `localIdentityDuplicateName` / `localIdentityLongName`: the unique local label fails name readiness, uniqueness, or length checks.

Together with `topbarLabels`, `localPlayerRowSkips`, and ready/unavailable counts, these separate absent classes, traversal problems, and name rejection without guessing an alternate identity API. The additional descendant class search runs only when no local label is retained. Reports are capped by the existing profiler; the diagnostic scan follows discovery until this instrumentation is removed, even after reporting stops. Remove the extra scan and reason counters after the missing condition is identified; do not treat this instrumented build as a clean performance baseline.

Verification: six pure-data validators, JS syntax, required compiled output, exact Source 2 Viewer inventory, and deployment hash matching passed. The compiler wrapper needed its documented stop. Deployed pak04 is 60,222 bytes with the hash recorded above. Native class observations require the next actual live log; no Panorama mocks were used.

The user then clarified that the game is being spectated. No local hero row is expected; the unavailable counts were misclassified as a defect. The diagnostic reason counters and extra class traversal were removed without changing identity rules, cadence, or spectator eligibility. Retain the original aggregate identity counters for participant-mode observations, but do not treat unavailable identity alone as an error. The current evidence does not establish an identity bug.

The user requested keeping both `SpectatorTarget` and `LocalPlayer`. Discovery now counts direct native `SpectatorTarget` row matches as `spectatorTargetRows`, alongside the existing `localPlayerRowSkips` counter. These remain distinct roles; a spectator target is not excluded merely because it is being viewed. This adds one class check per discovered row on the existing five-second pass and no new traversal, timer, identity fallback, or report loop. Counts are summed row observations within profiler windows, not unique players.

Separate-role build verification: all six pure-data checks, syntax checks, required outputs, exact Source 2 Viewer inventory, and matching deployment hashes passed. The compiler wrapper needed its documented stop. Only the runtime script asset changed. Live `SpectatorTarget` observations remain uncollected; no gameplay exclusion or performance improvement is claimed.

## Session continuation

Current focus is Panorama/JavaScript work, not FPS. Native VProf gives a qualified lead toward steady painting cost and layout spikes. The agent has now inspected the second-monitor debugger directly and captured healthbar/custom-fill and TopBar activity. Both branches repaint; neither is established as the expensive owner. This inspection is hero-testing, not the earlier spectator workload. Next identify the initiating style/layout invalidation before selecting a rendering change. No panel properties, runtime source, or pak04 were changed.

## Visible A baseline and hidden B comparison

The user supplied the current visible-build log. The spectator VProf span at 16:46:02–16:48:31 on 2026-09-08 includes 19,654 frames and 147 one-second intervals. Average/P1 FPS is 133.6/78.6. FrameTotal average/P99 is 7.48/12.72 ms; Panorama is 1.60/3.02 ms; Client Rendering is 3.42/5.90 ms. P95 of one-second Panorama maxima is 7.40 ms.

Ninety-two complete profiler windows fit wholly inside the span, with no incomplete chunks. HUD discovery reports 24 `spectatorTargetRows` and 24 unavailable local identities across four windows, consistent with the user-confirmed spectator context. These are repeated observations, not 24 distinct targets. World reports contain 660 ultimate clip writes and 551 unchanged skips. HUD ultimate sampling has 120 calls/127 ms self over 120.452 seconds; world receipt has 1,320 calls/55 ms self across its contexts. No tagged ultimate, pickup-clip, or pickup-receive errors occur.

The entire raw baseline was preserved before another game launch could overwrite it: [A console](../.tmp/hpv2-render-research/ab-visible-console.log), [A metrics and hashes](../.tmp/hpv2-render-research/ab-visible-evidence.json). Prior A package SHA256 is `649C4CCF6BE5B1E3C098BCB5FBB0A70507909C0FC545D3D86A13B745B5206ECE`.

B changes only `ultimateOverlay.style.visibility = "visible"` to `"collapse"` when activating the owned overlay. It retains native ready-icon masking while custom state is active, so native drawing does not replace the hidden custom artwork. The existing stock base and all pickup indicators remain untouched. No nodes, timers, counters, tracing, brightness, transport, eligibility, or clip writes were removed. This isolates the drawing of the custom overlay, not its allocation cost.

The B wrapper passed all six pure-data checks, JS syntax, compiled-output checks, exact Source 2 Viewer inventory, and matching deployment hashes. It required the documented compiler stop. Only the runtime script CRC changed. B is 59,758 bytes, SHA256 `A3723E35281E5C3EBE3E101E870AD671799CDC78AC959A50A97D7265BCD8086B`. Actual hidden appearance and matched-workload performance remain unverified.

Next: restart, use the same spectator replay segment and camera/settings, confirm the custom dark/colored ultimate artwork is absent, and collect B. A different live match or different time segment is only contextual evidence, not a controlled causal comparison. Restore the normal visibility assignment after the comparison; never ship the hidden diagnostic as the feature.

### Hidden B result and normal artwork restoration

B at 16:54:32–16:55:49 on 2026-09-08 contains 9,004 frames and 76 analyzed one-second intervals, versus A's 147. Its average/P1 FPS is 118.7/85.5 versus A's 133.6/78.6. FrameTotal average/P99 is 8.43/11.69 ms versus 7.48/12.72; Panorama is 1.71/2.77 ms versus 1.60/3.02; Client Rendering is 3.85/5.30 ms versus 3.42/5.90. P95 of one-second Panorama maxima is 7.19 ms versus 7.40.

No clear average rendering gain appears. Some tails improve while averages worsen. The capture is shorter, exact replay/camera equivalence is unverified, and recorded pickup activity differs, so this neither proves the icon is costly nor proves it is free.

All profiler chunks reassembled, with 22 complete windows wholly inside B's span. World windows contain 165 ultimate clip writes and 104 unchanged skips. All 411 recorded world paints have `overlayVisible: false`, with none true; this establishes the hidden readback while sampling/painting continues, not independent pixel verification. HUD reports 13 spectator-target observations and 13 unavailable local identities, expected for the user-confirmed spectator context. No tagged ultimate/pickup-clip/pickup-receive errors occur.

Preserved [B console](../.tmp/hpv2-render-research/ab-hidden-console.log) and [B evidence](../.tmp/hpv2-render-research/ab-hidden-evidence.json) alongside A. The diagnostic visibility assignment was restored to `visible`. The wrapper passed all six pure-data checks, syntax, required compiled outputs, exact Source 2 Viewer inventory, and deployment hash matching; the compiler needed its documented stop. Restored pak04 is 59,693 bytes and SHA256 `649C4CCF6BE5B1E3C098BCB5FBB0A70507909C0FC545D3D86A13B745B5206ECE`, exactly matching A. No hidden diagnostic remains deployed.

### Restored A capture

The next spectator capture at 16:58:45–17:00:42 on 2026-09-08 contains 15,136 frames and 114 analyzed intervals. Average/P1 FPS is 132.5/83.8; FrameTotal average/P99 is 7.55/11.94 ms; Panorama is 1.70/3.01 ms; Client Rendering is 3.40/5.17 ms. P95 of one-second Panorama maxima is 7.36 ms. Hidden B was 1.71 ms average Panorama, so restoring the icon shows no clear average UI penalty in these captures. Different workload, duration, and missing GPU attribution still prevent declaring the icon free or estimating its causal cost.

Seventy-one complete profiler windows fit wholly inside the span, with no incomplete chunks. World windows report 665 ultimate writes and 315 unchanged skips. All 1,219 recorded world paints have visible overlay readback, with none hidden; this checks runtime state, not pixels. HUD records 18 spectator-target observations and 18 unavailable local identities. No tagged ultimate/pickup-clip/pickup-receive errors occur. Preserved [restored console](../.tmp/hpv2-render-research/ab-restored-console.log) and [restored evidence](../.tmp/hpv2-render-research/ab-restored-evidence.json).

The package remains the restored normal build. These results do not justify more changes to the working radial or a slower sampler. Any further performance work should first isolate diagnostic overhead or identify expensive native/other Panorama work rather than repeat unmatched hidden-icon comparisons.

### Panorama and JavaScript optimization

The user requested continuing optimization around Panorama and JavaScript rather than FPS. Reused the world-side prefilter as `mayContainSnapshot(raw, isHud)`: the HUD now rejects unescaped gate/ultimate/irrelevant messages before `JSON.parse`, while world routing is unchanged. Escapes and marker lookalikes still reach parsing and full validation. Existing profiling gains `hudMessagesSkipped`/`hudCharsSkipped`; no timer, cache, transport, layout, style, or lifecycle change was added.

Removed obsolete angle trace calls, record allocations, JSON serialization, diagnostic native clip/visibility/class reads, and the trace budget. This trace was bounded to the first 120 records per context, so its cost was not a constant session-wide baseline. Function profiling and ultimate write/skip counters remain for the next comparison.

Before-change restored capture: three complete HUD windows span 90.094 seconds. `ultimateTick` records 90 calls / 91 ms self; `receiveSnapshot` records 284 calls / 7 ms self, with 284 parsed messages / 74,072 characters. World windows record 1,020 `receiveUltimates` calls / 41 ms self over 1,020.913 aggregate context-seconds. These coarse-clock values and reported top-row coverage are not completed Panorama/GPU costs. Compare parsing counts and per-call/covered-time costs within each role, rather than sums across different capture lengths/context counts.

Verification passed: both predicate routes preserve reordered/escaped/duplicate-key/nested-marker boundaries; a throwaway pure message-stream smoke retained identical relevant decoded messages while the HUD parsed two of four inputs instead of all four. All six wrapper checks, JS syntax, exact Source 2 Viewer inventory, and deployment hashes passed. Compiler output required the documented wrapper stop. The new 58,563-byte package has the SHA256 recorded above; only the runtime script's compiled asset changed. No new-build live JS/Panorama savings or visual regression result is claimed.

### First JavaScript-optimized live capture

The 17:12:11 to 17:13:39 capture on 2026-09-08 has 83 analyzed VProf intervals. Panorama average/P99 is 1.70/2.74 ms, versus 1.70/3.01 previously; P95 of one-second Panorama maxima is 7.25 ms versus 7.36. Average Panorama has not improved. FPS is outside this comparison.

Thirty complete profiler windows fit wholly inside the capture, with no incomplete chunks. Two HUD windows cover 60.240 seconds: 150 receiver calls, 72 messages and 19,657 characters skipped, 78 messages and 20,176 characters parsed. The prefilter avoided 48% of HUD JSON parses and 49.3% of input characters in these windows. No ultimate angle trace remains and no tagged runtime error occurs.

HUD `ultimateTick` records 60 calls / 43 ms self, or 0.72 ms per call, versus 1.01 previously. HUD `receiveSnapshot` records 150 calls / 2 ms self, versus 284 / 7 previously. These coarse-clock observations are not a controlled speedup: world ultimate activity is much more static, with 81 writes / 334 unchanged skips, versus 665 / 315 previously. Context coverage also differs. The next optimization decision should use native/UI attribution, not assume more JS microchanges will reduce the unchanged Panorama average.

Preserved [console](../.tmp/hpv2-render-research/js-optimized-console.log) and [evidence](../.tmp/hpv2-render-research/js-optimized-evidence.json). Runtime and deployed package are unchanged.

### Native layout and paint attribution

Installed `panorama.dll` has `CUIEngine::PaintWindows`, `CTopLevelWindow::PerformLayout`, and `CTopLevelWindow::PaintIfNeeded paint` scopes calling tier0's `VProfScopeHelper::EnterScopeInternalBudgetFlags`. Installed `engine2.dll` registers `vprof_on`, `vprof_off`, `vprof_reset`, and `vprof_generate_report_hierarchy`; their callbacks toggle profiling or queue reset/report work. Binary hashes, addresses, and limits are in [native profiling evidence](../.tmp/hpv2-render-research/native-profile-evidence.json).

In the same spectator scene, run `vprof_reset; vprof_on`, close the console/debugger, and watch for 30 seconds. Then run `vprof_off; vprof_generate_report_hierarchy`. Wait for the report before quitting because reporting is deferred. Preserve `console.log`. These development-only registrations still need live availability/output confirmation. If rejected, preserve the error rather than unlocking commands or changing gameplay settings.

Accept useful attribution only when the report exposes native layout/paint costs beneath Panorama. A flat aggregate is insufficient, and generic scopes may not identify individual XML panel IDs. Detailed profiling adds overhead, so its numbers should not be compared directly with the previous VProfLite-only baseline. No rendering changes, DLL patches, game attachment, capture config files, or package rebuild were needed.

The `panorama_stats_log_time` and `panorama_spew_layout_invalidates` candidates were not selected: a narrow RIP-relative reference scan found only initialization/teardown references, not a working reporting path. This is not an exhaustive proof that no consumers exist. Valve's debugging documentation was blocked by an anti-bot page; no unavailable web content is cited as evidence.

### Native hierarchy capture result

The 2026-09-08 log confirms `vprof_on` at 17:28:44, `vprof_off` at 17:30:17, and a complete hierarchy at 17:30:20. The report covers 11,699 frames and explicitly warns: `total wall clock time was 93.64 seconds, results may be invalid`. Preserve that qualification. Some repeated-name branches also show self totals larger than their inclusive totals; do not sum their self columns.

Reported inclusive average per frame / peak: `PaintWindows` 1.03/21.33 ms; its painting child 0.76/1.89 ms, layout child 0.13/20.56 ms, and style-application child 0.10/4.84 ms. `CUIEngine::RunFrame` separately reports 0.39/3.98 ms. Painting is the largest reported steady component; layout has the standout spike. Peaks have no timestamps, so the layout and PaintWindows peaks cannot be assumed to describe the same frame.

This distinguishes native stages but not individual XML panels. No hierarchy scope names HPV2. The next attribution target is the window/subtree triggering layout or repaint, not a slower JS sampler. No tagged mod runtime errors occur. The accompanying VProfLite window differs and detailed profiling adds overhead, so its 1.85 ms Panorama average is not evidence of a regression against the previous 1.70 ms capture.

Preserved [console](../.tmp/hpv2-render-research/native-hierarchy-console.log) and [evidence](../.tmp/hpv2-render-research/native-hierarchy-evidence.json). No runtime or package change was made.

### Stock debugger per-panel activity

Source 2 Viewer extraction of the installed core package confirms `debugger.xml` has a `PaintInfo` toolbar button. Its stylesheet shows `.ShowPaintInfo` enables each tree row's performance display. Native `panoramauiclient.dll` contains matching style/layout/secondary-layout/paint/render invalidation indicators and builds the computed `Paint Performance:` fields: `Has Cached Command List`, `Command List Bytes Size`, and `Repaint Rate`. Binary hash, field references, and extracted asset paths are in [debugger paint evidence](../.tmp/hpv2-render-research/debugger-paint-evidence.json).

Use the existing debugger instead of adding a mod polling loop. Enable Paint Info, inspect the healthbar ancestry and TopBar, and capture 5–10 seconds with the relevant tree visible. Select a repeatedly dirty panel so its computed paint fields are visible. The useful evidence is the named ancestor/child generating repeated layout or paint activity and whether it uses a cached command list.

These are activity indicators, not a per-panel CPU timer. Frequent repaint is not by itself proof of expensive or unnecessary work. The one-second flash animation does not measure operation duration, and the open debugger adds its own rendering work. The subsequent live inspection below exercises this interface but does not establish an expensive panel owner.

### Direct debugger inspection

The agent operated the existing native debugger on monitor two without executing console JavaScript or editing panel properties. The live HUD has `connectedToHeroTesting`; the selected world branch is `panorama_world_panel_18`, with `CLASS_PLAYER`, `hero_inferno`, and `playerIsBot`. Do not compare this capture numerically with the earlier spectator matches.

| Selected panel | Actual render dimensions | Cached command list | Command-list bytes | Displayed Repaint Rate |
|---|---|---|---|---|
| `UnitStatus` | 1000 x 1000 | false | 2344 | 1.00 |
| `HPV2UltimateOverlay` | 300 x 300 | false | 1032 | 1.00 |
| `HPV2UltimateFill` | 300 x 300 | false | 448 | 1.00 |
| `TopBar` | 1400 x 1080 | false | 1120 | 1.00 |
| `TopBarPlayer5`, marked `Empty` | 88 x 230 | false | 200 | 0.40 |

Preserved six screenshots across approximately five seconds for each of the custom fill and TopBar, plus selected-panel screenshots and [live evidence](../.tmp/hpv2-render-research/live-paint-inspection.json). The fill and TopBar still display `1.00` in their final observed frames. Style/layout/paint indicators recur through the healthbar ancestry and custom artwork branch; native HUD branches also show activity.

The rate's units and averaging window remain unverified. These values are not milliseconds, dimensions are not measured GPU allocation, and uncached command lists do not establish avoidable work. Navigation and hover can themselves invalidate styles. No cooldown-start transition or controlled cost comparison was captured. The initiating invalidation source and cause of the reported slowdown remain unresolved. The debugger is left on TopBar's computed paint fields; runtime and package are unchanged.
