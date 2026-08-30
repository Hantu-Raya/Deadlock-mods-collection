# HP Colors Rewrite v2

## Shared contract

`HP COLORS V2` is a session-scoped Escape-menu editor. Its settings schema
contains exactly four keys, with these defaults:

```json
{
  "enabled": true,
  "enemyColor": "#FD4949",
  "allyColor": "#FFEFD7",
  "pipsVisible": true
}
```

The contract version is `1`. The menu exports
`$.HPColorsV2ContractFactory`, publishes each edit immediately, and keeps no
persistent state or presets. Publication uses `ClientUI_FireOutput` with magic
`HP_COLORS_V2_CONFIG`, root attribute `hp_colors_v2_config`, and this exact
serialized shape:

```text
{magic_word,version,revision,values}
```

`Reset` restores the defaults and republishes immediately, even if the values
already match the defaults. `Done` and `Escape` close the editor; all values
remain session-only. The editor provides one shared native HSL picker with Hue
`0–359`, Saturation `0–100`, and Lightness `0–100`.

## Runtime consumer

Each overlay context caches `#unit_healthbar_lagging`,
`#unit_healthbar_active_parent`, `#unit_ult_ready_icon`,
`#unit_healthbar_pip_label`, and `#hp_counter`. Enabled enemy bars use
`enemyColor`; enabled ally bars use `allyColor`. The consumer owns:

- cached fill `washColor`;
- ultimate-icon `washColor`;
- pip-label `visibility` (`visible`/`collapse`) from `pipsVisible`;
- split current/max HP text and shared visibility in a static counter canvas.

The world-space layout does not expose direct health bindings. The consumer
reads the engine pip string from the panel text or its `text` attribute,
derives max HP from that string, and derives current HP from the live
fill/parent width ratio. The static `#hp_counter_container` is a stable
sibling of `#UnitHealthbarsContainer` under `#InfoHealthContainer`; custom
panels must not be inserted into the engine container because it replaces its
children. The full-width sibling shares the healthbars positioning and scale
rules, while its inner anchor mirrors the live bar's 750px by 120px geometry
and margins. Its centered current/max row uses 145px inline label typography,
retains `translateY(-180px)`, and uses segment-specific X offsets of
`-136.375px`, `-62.28125px`, and `-99.6875px`. It updates only changed text and
stays hidden until both inputs are valid. The consumer writes no geometry.

## Geometry and segment alignment

`#UnitHealthbarContainer` uses the required `height: 120px`. Preserve the
current base geometry:

- `#UnitHealthbarsContainer`: `margin-top: 230px`, horizontal-align `left`,
  vertical-align `middle`, `z-index: 0`, `pre-transform-rotate2d: 0deg`, and
  `pre-transform-scale2d: 1.1`;
- `#UnitStatus`: `margin-top: -700px`, `margin-right: -53.625px`.

Segment mapping:

| State | Right margin |
| --- | ---: |
| Segment 1, 0 pips | `-53.625px` |
| Segment 1, 4 pips | `-46.92px` |
| Segment 1, 8 pips | `-40.21875px` |
| Segment 2, 8 pips | `-40.21875px` |
| Segment 2, 12 pips | `102.23px` |
| Segment 2, 16 pips | `244.6875px` |
| Segment 3 | `244.6875px` |

Segment 1 interpolates across 0–8 pips; segment 2 interpolates across 8–16
pips. The segment aligner owns `#UnitStatus.style.marginRight` plus
`#hp_counter_row.style.transform`: segment counter X offsets are `-136.375px`,
`-62.28125px`, and `-99.6875px`; all retain `translateY(-180px)`. Enemy and
ally bars share this geometry; the color consumer owns no geometry.

The stamina row uses `margin-top: 800px` beneath the healthbar. Each visible
stamina pip is a `110px` by `44.8px` rectangular box with a `4px` border and
`6px` horizontal spacing. Empty pips retain the stock black fill.

## V1 appearance and removed visuals

Use the v1 stock healthbar treatment:

- `hero_healthbar_bg_psd.vtex` sliced frame;
- `hero_healthbar_missing_psd.vtex` depleted-health plate;
- `hero_healthbar_fill_center_psd.vtex` fill texture;
- stock inset shadow on the lagging layer.

Native damage, healing, delta, shields, pip text, and ultimate-icon image
remain engine-owned. Critical-health visuals are excluded: no
`#CriticalIndicator`, `.health_critical` selectors, critical text, scaling,
recoloring, or flashing.

## Performance and lifecycle

Panorama scripts use strict IIFEs, `var`, Source 2 `$`, and `$.Schedule`
durations in seconds. Unit-status scripts use no `GameUI` or browser APIs.
Panel references stay cached. The color consumer uses bounded `0.25`-second
checks. The segment aligner polls every `0.25` seconds, checks at most three
segment classes plus cached pip text, and avoids tree searches, writes, and
logs while state is unchanged. It writes and logs only for segment or relevant
pip-count changes, and destroyed contexts stop all scheduled callbacks.

This lane excludes persistence, presets, pulses, hero routing, and conditions.

## Production assets

The production package must contain exactly these eight compiled assets:

1. `panorama/layout/hud_escape_menu.vxml_c`
2. `panorama/layout/unit_status_overlay_v2.vxml_c`
3. `panorama/styles/hp_colors_v2_menu.vcss_c`
4. `panorama/styles/unit_status_v2.vcss_c`
5. `panorama/scripts/hp_colors_v2_contract.vjs_c`
6. `panorama/scripts/hp_colors_v2_menu.vjs_c`
7. `panorama/scripts/unit_status_v2_colors.vjs_c`
8. `panorama/scripts/unit_status_v2_segment_align.vjs_c`

## Verification status

Source and contract verification passes 15/15 focused tests. This includes
800/400/800 and 4000 HP readout cases, per-UnitStatus target scoping, the live
load-order case with an empty stock bar, and real replacement of
healthbar-container children. The production build contains exactly eight
compiled assets. The current package was built and deployed. The root and
deployed VPKs share SHA-256
`DEA3CEEBDF76CB27B96B0A4F7414C414D55EFA2513F7D4EB84F1BAA1E2DF26AF`.
The current build has no live-smoke or screenshot evidence.

### Remaining clean-restart smoke

- [x] Build and package exactly the eight assets.
- [x] Deploy, fully exit Deadlock, and launch a clean session.
- [ ] Open `HP COLORS V2`; edit all four settings and observe immediate updates.
- [ ] Exercise `Reset`, `Done`, and `Escape`; check defaults and session-only
      lifetime.
- [ ] Repeat the current/max damage and healing sequence against the current
      hash and compare the outer frame and label centers.
- [ ] Confirm status-effect icons at the requested `-20px` margin do not clip,
      overlap the health values, or hide stack counts.
- [ ] Check enemy/ally parity, 120px height, segment interpolation, v1
      textures, pip visibility, and absent critical visuals.
- [ ] Check disabled/neutral/unknown cleanup and destroyed-context shutdown.
