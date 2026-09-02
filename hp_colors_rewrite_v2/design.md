# HP Colors Rewrite v2 layout contract

## Healthbar geometry

`#UnitStatus` is a fixed `2000px × 2000px` canvas. CSS centers `#UnitHealthbarsContainer` in that canvas. Runtime scales the complete segment container around `50% 50%` and translates it with the configured X/Y offset.

The engine owns `UnitHealthbarContainer.width` and `max-width`. Rewrite never writes them. Max-HP changes can change the live width without changing the preset, so the existing health sample also reads `actuallayoutwidth` and reapplies layout only when that width changes.

Do not derive alignment from pip count, `maxhp_segment_*` classes, fill width, or health percentage. Those values describe health state, not the rendered bar boundary.

## Level and ultimate alignment

The level badge and `#UnitInfoContainer` follow the bar's rendered left edge. They use the same horizontal offset calculation, while their existing CSS keeps their relative spacing:

```text
marginLeft = 422.5 + positionX + (825 - liveBarWidth × scaleX) / 2
scaleX = 1.1 × widthScale / 100
```

At the default `750px` live width, the scaled bar begins at local X `587.5`. The `300px` UnitInfo panel begins at `422.5`, placing its center at `572.5`, or `15px` left of the bar. This gap keeps the ultimate icon off the bar and leaves low-percentage kill markers visible.

Use the measured live bar width for every max-HP segment. Width changes and X offsets move the bar, level badge, and ultimate icon together. Y offsets move the same group vertically. Reset must recompute from the current live width instead of restoring a stale width.

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
