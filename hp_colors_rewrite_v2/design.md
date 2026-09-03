# HP Colors Rewrite v2 layout contract

## Healthbar geometry

`#UnitStatus` is a fixed `2000px × 2000px` canvas. CSS centers `#UnitHealthbarsContainer` in that canvas. Runtime reads the live segment stack and bar geometry, then places the scale origin at the visible bar center. Do not replace this with a fixed percentage because max-HP layouts change the bar's position inside the stack.

The engine owns `UnitHealthbarContainer.width` and `max-width`. Rewrite never writes them. Max-HP changes can change the live width without changing the preset, so the existing health sample also reads `actuallayoutwidth` and reapplies layout only when that width changes.

Do not derive alignment from pip count, `maxhp_segment_*` classes, fill width, or health percentage. Those values describe health state, not the rendered bar boundary.

## HP readout stacking

`#hp_counter_container` and `#UnitStatus` are root siblings. The counter container appears first in XML, so its own `z-index: 30` raises both HP labels above the later stock panel. Keep the stacking value on the sibling container. A child label or `#hp_counter_anchor` cannot reliably escape its parent's sibling layer.

## Level and ultimate alignment

The level badge and `#UnitInfoContainer` have independent X/Y offsets. Width scaling always preserves their relation to the rendered bar edge. Anchoring additionally follows bar translation:

```text
scaleOffsetX = (825 - liveBarWidth × scaleX) / 2
anchorOffsetX = scaleOffsetX + (anchored ? positionX × scaleX : 0)
levelMarginLeft = 422.5 + anchorOffsetX + levelOffsetX × widthScale / 100
ultimateMarginLeft = 422.5 + anchorOffsetX + ultOffsetX × widthScale / 100
scaleX = 1.1 × widthScale / 100
```

The renderer measures the live bar center and each indicator's original center. It also applies vertical scale compensation, so both indicators visibly move as bar height changes. When anchoring is enabled, it converts the center difference into Panorama's centered-margin coordinates, then adds `positionY × 2` and the indicator's own Y offset. When anchoring is disabled, it ignores bar translation but still follows bar scale.

At the default `750px` live width, the scaled bar begins at local X `587.5`. The `300px` UnitInfo panel begins at `422.5`, placing its center at `572.5`, or `15px` left of the bar. This gap keeps the ultimate icon off the bar and leaves low-percentage kill markers visible.

With anchoring disabled, bar X/Y offsets do not move the indicators. Width scaling still preserves their bar-edge relationship and scales each indicator's X offset by `widthScale / 100`. Their Y offsets remain independent. Reset enables anchoring and restores every accessory offset to zero.

## Kill marker

The kill marker remains a child of `UnitHealthbarContainer`. Its threshold uses the health-parent width and its configured percentage. Accessory alignment must not cover the marker. Do not compensate by changing marker percentage or width.

## Runtime cost

Bar width is sampled in the existing health pass. A changed width marks that bar dirty; cached style writes suppress unchanged assignments. Production contains no geometry traversal, geometry formatter, or `[DEBUG-HPV2-CENTER]` output.

## Package

The production package contains exactly these eight compiled assets:

- `panorama/layout/hud_escape_menu.vxml_c`
- `panorama/layout/unit_status_overlay_v2.vxml_c`
- `panorama/styles/hp_colors_v2_menu.vcss_c`
- `panorama/styles/unit_status_v2.vcss_c`
- `panorama/scripts/hp_colors_v2_contract.vjs_c`
- `panorama/scripts/hp_colors_v2_state.vjs_c`
- `panorama/scripts/hp_colors_v2_menu.vjs_c`
- `panorama/scripts/unit_status_v2_colors.vjs_c`

## Release check

Run the Rewrite v2 validators and build with `-SkipDeploy`. After deployment, restart Deadlock and check `800`, `2100`, and `4100` max HP at default and changed widths. The level badge and ultimate icon must keep their left-edge gap, an `18%` kill marker must remain visible, reset must use the current max-HP width, and the console must contain no Rewrite exceptions.
