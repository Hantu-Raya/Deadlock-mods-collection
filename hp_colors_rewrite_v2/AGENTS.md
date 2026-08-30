# HP Colors Rewrite v2 rules

## Scope

`hp_colors_rewrite_v2` is the compact `HP COLORS V2` Escape-menu editor and
unit-status consumer. Keep this lane session-scoped, v1-styled, and limited to
the four settings below.

## Shared contract

The settings schema has exactly four keys. Defaults are exactly:

```json
{
  "enabled": true,
  "enemyColor": "#FD4949",
  "allyColor": "#FFEFD7",
  "pipsVisible": true
}
```

Contract rules:

- Version is `1`; add no settings, persistence, presets, pulses, hero routing,
  or conditions.
- Export `$.HPColorsV2ContractFactory`.
- Publish every edit, including `Reset`, immediately to the current session.
- Use `ClientUI_FireOutput` with magic `HP_COLORS_V2_CONFIG`.
- Mirror the serialized payload in root attribute `hp_colors_v2_config`.
- Keep the serialized shape exactly
  `{magic_word,version,revision,values}`.
- `Reset` restores the defaults and republishes. `Done` and `Escape` close the
  editor without creating durable state.

The menu uses one shared native HSL picker: Hue `0–359`, Saturation `0–100`,
and Lumen `0–100`.

## Geometry and alignment

Hero `#UnitHealthbarContainer` height is exactly `120px`. Preserve:

- `#UnitHealthbarsContainer`: `margin-top: 230px`, left horizontal alignment,
  middle vertical alignment, `z-index: 0`, `pre-transform-rotate2d: 0deg`, and
  `pre-transform-scale2d: 1.1`.
- `#UnitStatus`: `margin-top: -700px` and `margin-right: -53.625px`.
- `#StatusEffects`: keep stock 250px height and `margin-top: -20px`.
- Segment 1 interpolates from `-53.625px` at 0 pips to `-40.21875px` at 8.
- Segment 2 interpolates from `-40.21875px` at 8 pips to `244.6875px` at 16;
  segment 3 remains `244.6875px`.
- Stamina uses the existing `#StaminaContainer` at `margin-top: 800px`.
  Keep each pip rectangular at `110px` by `44.8px`, with a `4px` border and
  `6px` horizontal spacing. Do not add a second stamina renderer.
- Enemies and allies use the same geometry. Do not add friend-specific
  position, margin, or transform overrides.

The segment aligner owns `#UnitStatus.style.marginRight` and
`#hp_counter_row.style.transform`. Segment counter X offsets are `-136.375px`,
`-62.28125px`, and `-99.6875px`; every segment retains `translateY(-180px)`.
The color consumer must not write width, height, position, scale, transform,
or any other geometry.

## V1 styling and consumer ownership

Keep v1 stock frame, missing-health plate, fill texture, and inset shadow:

- `hero_healthbar_bg_psd.vtex`
- `hero_healthbar_missing_psd.vtex`
- `hero_healthbar_fill_center_psd.vtex`
- stock inset shadow on the lagging layer

The color consumer first resolves `#UnitHealthbarsContainer`, then resolves
`#unit_healthbar_active_parent`, `#unit_healthbar_lagging`, and
`#unit_healthbar_pip_label` from that one live lineage. Never resolve those
repeated IDs independently from the overlay root. The static `old_bar` can
exist before the engine creates the live bar and must not capture ownership.
The consumer also caches `#unit_ult_ready_icon`, `#hp_counter`, and
`#hp_counter_max`. For enabled enemy/ally bars it owns cached fill and
ultimate-icon `washColor`, plus pip-label `visibility` (`visible`/`collapse`)
from `pipsVisible`. Disabled, neutral, and unknown contexts clear those owned
inline values so stock styling resumes. It never writes icon visibility or
geometry.

The world-space layout does not expose `{i:health}` or `{i:maxHealth}`. Read
the pip string from `panel.text`, falling back to `GetAttributeString("text",
"")` because live overlays may populate only the attribute. Derive max HP
from that string and current HP from the live fill/parent width ratio. Keep
the counter canvas in a stable full-width `#hp_counter_container` sibling of
`#UnitHealthbarsContainer` under `#InfoHealthContainer`. Never insert custom
panels into the engine-owned `#UnitHealthbarsContainer`; the engine replaces
its children. The stable sibling must share that container's positioning and
scale rules, while its anchor mirrors the live bar's width, height, alignment,
and margins. Render current and maximum HP in separate `#hp_counter` and
`#hp_counter_max` labels, and hide both until the inputs are valid.

## Regression guardrails

Use the absolute root only for the shared config attribute. Resolve repeated
unit-status IDs from the current `UnitStatus` context. A binding regression
must create two sibling unit-status trees with the same IDs and prove that
each consumer changes only its own tree.

An engine-replacement regression must remove the live children of
`#UnitHealthbarsContainer`, install a new live bar, run the scheduled update,
and prove all of these outcomes:

- the old lineage no longer owns color or readout state;
- the consumer binds the new active parent, fill, and pip label;
- the sibling `#hp_counter_container` and its labels remain valid;
- the new fill receives the configured color;
- the counter reads the new bar's HP.

Measure stability from the outer frame or pip row. The active fill edge moves
with HP and cannot prove anchor movement. Exercise the exact
`800/800 -> 400/800 -> 800/800` sequence and compare the frame and label
centers at every state.

The engine world-panel texture is a hard outer boundary; Panorama
`overflow: noclip` does not enlarge it. Keep stock `CitadelStatusEffect` and
`.statusEffect` at `250px`, with no local `#StatusEffects` height override.
Keep `overflow: noclip` on `.WindowRoot`, `#StatusEffects`, and
`.statusEffect` so Panorama adds no tighter boundary.

The status row uses the requested margin-only `margin-top: -20px`. Do not use a
transform. Keep stock `CitadelStatusEffect` and `.statusEffect` height at
`250px`, and retain `overflow: noclip` on `.WindowRoot`, `#StatusEffects`, and
`.statusEffect`. The focused CSS regression must enforce stock height
ownership, all three overflow declarations, the absence of a transform, and
the exact `-20px` margin.

Verification is ordered evidence: focused validator, review, final source
edit, focused validator again, production build, deployment hash comparison,
fresh Deadlock restart, then live smoke. Any later JS, XML, CSS, or build-input
change invalidates the build, hash, and live evidence after it.

Keep diagnostic probes and paint markers in the debug package. Before the
production build, prove the production source contains no diagnostic logger,
probe panel, forced background, or debug asset.

Critical-health visuals stay removed: no `#CriticalIndicator`, `.health_critical`
selectors, critical text, scaling, recoloring, or flashing.

## Performance and lifecycle

- Panorama scripts use strict IIFEs, `var`, Source 2 `$`, and `$.Schedule`
  durations in seconds. Unit-status scripts do not use `GameUI` or browser
  APIs.
- Cache panel references. The color consumer uses bounded `0.25`-second checks.
  The segment aligner polls at `0.25` seconds, checks at most three segment
  classes plus cached pip text, and performs no tree search, style write, or
  log on unchanged state.
- Write and log only on segment or relevant pip-count changes. Destroyed
  contexts stop all scheduled callbacks and release their owned references.

## Production assets

The production package contains exactly these eight compiled assets:

1. `panorama/layout/hud_escape_menu.vxml_c`
2. `panorama/layout/unit_status_overlay_v2.vxml_c`
3. `panorama/styles/hp_colors_v2_menu.vcss_c`
4. `panorama/styles/unit_status_v2.vcss_c`
5. `panorama/scripts/hp_colors_v2_contract.vjs_c`
6. `panorama/scripts/hp_colors_v2_menu.vjs_c`
7. `panorama/scripts/unit_status_v2_colors.vjs_c`
8. `panorama/scripts/unit_status_v2_segment_align.vjs_c`

## Verification status

The focused validator passes 15/15, including per-`UnitStatus` target scoping,
real healthbar-child replacement, segment-specific HP counter transforms,
interpolated segment margins, `110px` by `44.8px` stamina pips, stock 250px status-canvas
ownership, and the margin-only `-20px` status offset. The exact eight-asset
package was built and deployed. The root and deployed VPKs share SHA-256
`DEA3CEEBDF76CB27B96B0A4F7414C414D55EFA2513F7D4EB84F1BAA1E2DF26AF`.
The current build has no live-smoke or screenshot evidence.

### Remaining clean-restart smoke

- [x] Build and package exactly the eight assets above.
- [x] Deploy the package, fully exit Deadlock, and launch a clean session.
- [ ] Open `HP COLORS V2`; edit both colors, `enabled`, and `pipsVisible`;
      observe immediate session updates.
- [ ] Exercise `Reset`, `Done`, and `Escape`; confirm defaults and session
      lifetime.
- [ ] Repeat the current/max damage and healing sequence against the current
      hash and compare the outer frame and label centers.
- [x] Confirm multiple status-effect circles and a stack count render without
      clipping or overlapping the HP readout.
- [ ] Check enemy/ally parity, 120px height, segment endpoints/interpolation,
      v1 textures, pip visibility, and removed critical visuals.
- [ ] Check disabled/neutral/unknown cleanup and destroyed-context shutdown.
