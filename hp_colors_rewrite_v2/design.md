# HP Colors Rewrite v2 design

## Decision

Use the engine's `maxhp_segment_1`, `maxhp_segment_2`, and `maxhp_segment_3` classes as the main alignment signal. During segment 2, count the apostrophe pip glyphs in the cached label text. Change only `#UnitStatus.style.marginRight`.

The endpoint mapping comes from the supplied inspector screenshots and captured logs:

- segment 1 uses `-200px`
- segment 2 starts at `-150px` with 8 pips
- segment 2 interpolates linearly to `100px` at 16 pips
- segment 3 uses `100px`

The same endpoints and unrotated container geometry apply to allies. Friend-specific status margins and healthbar transforms would bypass that contract, so production omits them.

The healthbar container uses the supplied `230px` top margin, left alignment, zero rotation, `1.1` scale, and `z-index: 0`.

V1 appearance is restored independently of geometry. The stock sliced background frame, missing-health plate, fill texture, and inset fill shadow are present, while the v2 alignment values remain unchanged.

## Current four-setting contract

The session-scoped settings are exactly `{enabled:true, enemyColor:"#FD4949", allyColor:"#FFEFD7", pipsVisible:true}`. Contract version is `1`. Edits stay in memory; there is no persistence or preset store. Reset restores those defaults and publishes them immediately.

The protocol uses `ClientUI_FireOutput` and the root attribute `hp_colors_v2_config`. The serialized payload shape is exactly `{magic_word,version,revision,values}`, with `magic_word: "HP_COLORS_V2_CONFIG"` and `version: 1`. Every session change publishes immediately.

The Escape-menu editor owns controls and the shared native HSL picker. The contract owns defaults, revisioned state, reset, validation, and publication. The color consumer owns cached fill and ultimate-icon `washColor`, pip-label `visibility`, and the custom HP counter; disabled, neutral, or unknown state clears or hides owned output. It writes no geometry and no icon visibility. The segment aligner owns only the existing margin interpolation.

The Panorama scripts remain strict IIFEs using `var`, Source 2 `$`, and `$.Schedule` seconds. No pulse, hero routing, conditions, browser APIs, persistence, presets, or `GameUI` calls belong in this lane.

The bar remains `height: 120px` and uses a trial `width: 750px`, 50% wider than the original 500px baseline and extending right from the unchanged left margin. Direct `{i:health}` and `{i:maxHealth}` bindings do not resolve in the world-space overlay. The color consumer reads the engine pip string from `panel.text` or its `text` attribute, derives max HP from that string and current HP from the live fill/parent width ratio, and writes a custom counter above the bar only when its text changes. `#StatusEffects` remains shifted upward by 60px. Segment interpolation, ally parity, v1 stock texture styling, and removed critical visuals remain unchanged.

## Alignment runtime cost

The alignment script caches `#UnitStatus`, `#UnitHealthbarsContainer`, and the pip label. A stable 0.25-second tick performs one context identity check, checks at most three segment classes, reads the cached pip text, and counts its characters without allocating an array. It performs no tree search, style write, or console output while segment and relevant pip count are unchanged.

On a segment change, or a pip-count change while segment 2 is active, it computes one margin and writes only when the value changes.

## Alignment boundaries

The script does not read health width, damage, healing, layout bounds, or engine game APIs. It does not write width, scale, transforms, fill layers, or panel position. Damage and healing cannot trigger an alignment write unless the engine changes the max-HP segment or segment-2 pip text.

The layout does not create `#CriticalIndicator`. The stylesheet contains no `.health_critical` selectors, critical text texture, or critical animation keyframes. Low-health state therefore cannot move, recolor, flash, or add text to the bar.

## Package

The intended production package contains exactly these eight compiled assets:

- `panorama/layout/hud_escape_menu.vxml_c`
- `panorama/layout/unit_status_overlay_v2.vxml_c`
- `panorama/styles/hp_colors_v2_menu.vcss_c`
- `panorama/styles/unit_status_v2.vcss_c`
- `panorama/scripts/hp_colors_v2_contract.vjs_c`
- `panorama/scripts/hp_colors_v2_menu.vjs_c`
- `panorama/scripts/unit_status_v2_colors.vjs_c`
- `panorama/scripts/unit_status_v2_segment_align.vjs_c`

## Verification status

The current eight-asset source has not passed validator, build, deployment, or live checks. No current eight-asset VPK or deployed hash is recorded. The former three-asset package and hash remain historical and superseded; see `HANDOFF.md`.

Pending checks:

- `node --test scripts/validate-hp-colors-rewrite-v2-baseline.test.js`
- `powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v2.ps1`
- Verify the fresh VPK contains exactly these eight assets, then verify source and deployed SHA-256 match.
- Fully restart Deadlock and run the live checks in `HANDOFF.md`.

## Prior verified alignment proof

The prior alignment-only VM test covered initial segment 1, eight unchanged ticks, segment 2 at 8, 12, and 16 pips, the segment-3 handoff at the same `100px` margin, cached traversal behavior, and destroyed-context shutdown.

