# Handoff: HP Colors Rewrite v2 editor and segment alignment

## Current v2 design

The editor is session-scoped and defines exactly four settings, version `1`: `{enabled:true, enemyColor:"#FD4949", allyColor:"#FFEFD7", pipsVisible:true}`. There is no persistence or preset store. Reset restores these defaults and publishes immediately.

The protocol uses event `ClientUI_FireOutput`, magic word `HP_COLORS_V2_CONFIG`, and root attribute `hp_colors_v2_config`. The serialized payload is exactly `{magic_word,version,revision,values}`. Every session change publishes immediately.

## Ownership boundaries

- `hp_colors_v2_contract.vjs_c` owns defaults, version, validation, revisioned in-memory state, reset, and publication.
- `hp_colors_v2_menu.vjs_c` owns Escape-menu controls and the shared native HSL picker. It has no persistence, presets, readout, pulse, hero routing, conditions, or browser APIs.
- `unit_status_v2_colors.vjs_c` owns the consumer path: cached color/pip writes plus the custom HP counter. Direct world-space health bindings do not resolve. Live overlays may populate only the pip label's `text` attribute, so the consumer falls back from `panel.text` to `GetAttributeString`. It derives max HP from that pip string and current HP from the live fill/parent width ratio, writes counter text only on change, and owns no geometry or icon visibility.
- `unit_status_v2_segment_align.vjs_c` owns the existing margin interpolation and the segment-specific `#hp_counter_row.style.transform`.
- Layout and stylesheet own panel wiring, the 120px by 750px trial bar, the counter's default segment-1 `translateX(-136.375px) translateY(-180px)`, rectangular bottom stamina pips, the margin-only `-20px` status offset, v1 stock texture styling, ally parity, and removed critical visuals.

Panorama code remains strict IIFEs using `var`, Source 2 `$`, and `$.Schedule` seconds.

## Resume guardrail

Before changing v2 world-space binding, readout, or geometry, follow
`hp_colors_rewrite_v2/AGENTS.md` section `Regression guardrails`. It is the
single source of truth for per-instance lookup, real engine-child replacement
tests, fixed-frame measurements, debug cleanup, and evidence invalidation.

## Geometry and package

The intended production package contains exactly these eight compiled assets:

- `panorama/layout/hud_escape_menu.vxml_c`
- `panorama/layout/unit_status_overlay_v2.vxml_c`
- `panorama/styles/hp_colors_v2_menu.vcss_c`
- `panorama/styles/unit_status_v2.vcss_c`
- `panorama/scripts/hp_colors_v2_contract.vjs_c`
- `panorama/scripts/hp_colors_v2_menu.vjs_c`
- `panorama/scripts/unit_status_v2_colors.vjs_c`
- `panorama/scripts/unit_status_v2_segment_align.vjs_c`

## Current verification status

The focused validator covers per-`UnitStatus` target scoping, real engine-child replacement, stable sibling-counter ownership, segment counter transforms `translateX(-136.375px)`, `translateX(-62.28125px)`, and `translateX(-99.6875px)` with fixed `translateY(-180px)`, segment-1 interpolation from `-53.625px` to `-40.21875px`, segment-2 interpolation from `-40.21875px` to `244.6875px`, `110px` by `44.8px` stamina boxes, and the margin-only `-20px` status offset.

The current exact eight-asset package was built and deployed. The root and deployed VPKs share SHA-256 `DEA3CEEBDF76CB27B96B0A4F7414C414D55EFA2513F7D4EB84F1BAA1E2DF26AF`. No screenshot or live-smoke evidence belongs to this build.

## Prior verified alignment baseline — source values

The four supplied Panorama inspector screenshots were read from:

- `Screenshot 2026-08-29 220141.png`
- `Screenshot 2026-08-29 221225.png`
- `Screenshot 2026-08-29 221347.png`
- `Screenshot 2026-08-29 221606.png`

Confirmed values:

- `#UnitHealthbarsContainer`: `margin-top: 230px`, left aligned, vertically middle, `z-index: 0`, rotation `0deg`, scale `1.1`
- `maxhp_segment_1 bars_1`: `#UnitStatus margin-right: -53.625px`
- `maxhp_segment_2 bars_1`: `#UnitStatus margin-right: -40.21875px`
- `maxhp_segment_3 bars_1`: `#UnitStatus margin-right: 244.6875px`
- `#UnitStatus`: horizontally middle and `margin-top: -700px`

`maxhp_segment_N` and `bars_1` are separate classes.

## Prior verified alignment baseline — implementation

`unit_status_v2_segment_align.js` caches the context, `#UnitStatus`, `#UnitHealthbarsContainer`, the HP counter row, and the pip label. It polls at 0.25 seconds after startup. Segment 1 scales linearly from `-53.625px` at 0 pips to `-40.21875px` at 8 pips. Segment 2 scales linearly from `-40.21875px` at 8 pips to `244.6875px` at 16 pips. Segment 3 remains fixed at `244.6875px`.

Each segment change, plus each pip-count change during segment 1 or 2, prints:

```text
[HPV2-ALIGN] segment=2 class=maxhp_segment_2 bars=bars_1 pipCount=12 pip="''''|''''|''''" margin-right=-25px
```

Unchanged ticks use cached panels and perform no traversal, style write, or print. Invalid destroyed contexts stop.

## Prior verified alignment baseline — verification

Focused validator result:

```text
4 tests, 4 passed, 0 failed
HPV2_V1_STYLE_OK
```

The VM covers segment 1 at 4 and 7 pips and segment 2 at 8, 12, and 16 pips, proves both interpolation paths and the segment-3 endpoint, verifies all three counter transforms, and preserves the prior stable-work and teardown checks.

The validator also rejects `#CriticalIndicator`, `#Citadel_Hud_Critical`, every `.health_critical` selector, the critical text texture, and critical animation names. Both checks failed before removal and pass now.

The CSS check also rejects friend-specific status margins and healthbar transforms. Allies now use the same position, rotation, and segment progression as enemies.

The appearance check requires the v1 stock sliced frame, missing-health plate, fill texture, inset fill shadow, and visible pips without changing v2 geometry.

## Prior verified alignment baseline — live log findings

The new console log contains 12 alignment events and no related JavaScript errors. It records segments 1, 2, and 3 with the requested margins. The pip field is populated with the engine's separator text, so the missing visual was not missing data.

The actual cause was `.verticalHealthbars #unit_healthbar_pip_label { visibility: collapse; }`. A regression check reproduced that failure. The prior baseline set it to `visibility: visible`, and the focused validator passes 4/4.

## Prior deployment record — superseded

The previous alignment-only baseline produced a 41.9 KB VPK and was deployed before the current eight-asset design:

- `panorama/layout/unit_status_overlay_v2.vxml_c`
- `panorama/styles/unit_status_v2.vcss_c`
- `panorama/scripts/unit_status_v2_segment_align.vjs_c`

This record is retained as verified history. Its three-asset package is superseded by the current eight-asset design and does not represent the current source.

Root and deployed SHA-256 (superseded historical hash):

`F1318846FF47F604F4BCC67110AB9173DC8C678079CB7010B86BFE115BD7D58A`

## Prior pending live check — superseded scope

Fully restart Deadlock. Compare an enemy and ally bar with the supplied v1 reference. Confirm the sliced frame, depleted-health plate, inset fill shading, ruler-like pips, and ultimate icon. Then test segment progression, damage, healing, quiet unchanged logs, matching ally/enemy geometry, and no critical-state visuals.
