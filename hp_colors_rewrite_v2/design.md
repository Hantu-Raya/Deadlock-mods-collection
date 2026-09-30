# HP Colors Rewrite v2 layout contract

## Shipped stock frame

The v2 override is rebased on the static unit-status tree shipped in Deadlock build 6722. The supplied GameTracking master snapshot (`245f2952f9`, byte-identical to the 6711 snapshots) provides its stock XML and CSS. `#UnitStatus` is `100×40`; the primary `#UnitHealthbar.UnitHealthbarContainer` is `76×18`; its direct `#UnitHealthbarInner` surface is `69×12`. Stock margins, health layers, line panels, labels, and indicator visibility remain engine-owned, except for the permanent mask and outer-background deletions documented below.

`#UnitHealthbarsContainer` has two sibling branches: primary `#UnitHealthbar` and secondary `#UnitShieldbar`. Both contain an ID `UnitHealthbarInner`, and each has its own `unit_healthbar_bullet_shield`. Always resolve the direct `UnitHealthbar` child and that child's direct inner panel before looking up health layers. Never select the first `.UnitHealthbarContainer` or search the complete stack for a duplicate ID.

Rewrite-owned level, pulse, kill-marker, and ultimate-timer panels are attached only to their local stock owners. HP/current readouts temporarily adopt the engine's existing health label into the counter row attached directly to `WindowRoot`; percentage uses the custom counter there. Both readouts stay outside the small `UnitStatus`/`InfoHealthContainer` canvas and both bar branches. The stock settings preview has no `.WindowRoot`, Rewrite scripts, or owned panels; appended overrides that target its stock IDs stay scoped to `.WindowRoot`. The permanent stock stylesheet deletions also apply to the preview.

## Ownership and classification

Unit kind and relation are separate facts. The bounded ancestor walk gathers explicit engine classes, including classes on `WorldUIRoot`; the pure `classifyUnit(facts)` policy applies building → player → NPC precedence. Neutral facts win over enemy/friend, exactly one of enemy/friend sets the relation, and contradictory or unknown ownership stays stock. `team1`/`team2` choose palette endpoints only; they never infer ownership.

`resolveSurface(bar, config)` is the only gate for custom presentation:

| Surface | Eligibility | Owned presentation |
|---|---|---|
| `player` | Classified enemy/friendly player | Relation settings, layout, pulse, readout, pips, and player-only accessories as configured. |
| `unit` | Enemy/friendly NPC or building with its independent opt-in enabled | Relation palette, feedback, pulse, visibility/layout, and enemy pip-line visibility. No HP readout, level badge, kill marker, ultimate coloring/timer, or stamina. |
| `fill` | Known neutral NPC with `npcNeutralEnabled` | Fixed `neutralColor` fill only. Neutral feedback, bounty, tier art, lines, values, and other stock presentation stay stock. |
| stock | Master off, unknown kind/relation, ambiguous relation, disabled category, or unsupported neutral/building kind | Restore native styles and classes. |

Enemy/friendly NPC and building gates default off and are independent of player `enemyEnabled` / `allyEnabled`. The six new settings append to the existing `hpv2` extension. State, presets, conditions, HPCR2, HPCRP1, and the `HP_COLORS_V2_CONFIG` transport use the existing generic contract; settings, scopes, presets, and conditions persist through the canonical durable save bridge.

## Stock appearance ownership

The appended `criticalIndicatorVisible` and `playerNamesVisible` booleans default true (stock pass-through); the `hpv2` extension has 49 slots. Legacy 72 slots, `hpv2.v = 1`, and transport version 2 remain unchanged. Player labels are independent of relation color enablement. Only `player` surfaces receive owned WindowRoot hide classes, with late collapse-only selectors for `#CriticalIndicator` and `#name`; removal defers to stock visibility, including spectator and convar rules.

All unit-status bars are permanently rectangular without an outer background, including players, NPCs, buildings, shields, previews, and master-off or ungated surfaces. Because this stylesheet replaces stock, it deletes the three `opacity-mask` declarations on `.UnitHealthbarContainer`, `#UnitHealthbarInner`, and `#UnitHealthbarLines`, and all eight container background-color declarations. The six relation rules that become empty are removed; the black inner backing and every other stock declaration remain. There is no shape setting, runtime class ownership, or inline mask write.

Master-off, surface loss, classification change, replacement, retirement, and teardown release label owners. Existing paint reconciliation repairs failed label class writes and external class drift without another timer. Missing optional labels/lines never block colors or create retries. Clips, geometry, health math, and stock critical animations/scaling/wash/margins remain unchanged. The critical-state convar is never executed, saved, or changed. This is not a full v1 mode.

## Health sampling and readout

Health percentage uses the minimum available visible-fill signal on primary `unit_healthbar_lagging`: layout width relative to the primary inner width, negative X offset, inline clip rectangle, horizontal transform/pre-transform scale, and inline width. Empty, unparsable, or unavailable signals are ignored. Pulse coverage uses the same fraction. Do not subtract primary bullet shield, ratking armor, deferred damage, or the separate `UnitShieldbar`; those are overlapping stock layers. Never write engine layer widths. Live build 6722 evidence: the engine keeps the fill at full layout width and writes an inline clip such as `rect( 0.0%, 77.710846%, 100.0%, 0.0%)`, whose right edge is the health percentage; `unit_healthbar_delta` is clipped from the new to the old edge. The clip signal is therefore authoritative in practice; the other signals remain defensive fallbacks.

Owned `hp` and `current` formats use the engine's existing `UnitHealthbarValue` `{d:health}` label, preserving its panel identity, exact text, and locale grouping (`2,990` is live-confirmed). Rewrite never parses, samples, rounds, or rewrites that number. Percentage text and gradient colors remain fill-derived and need no parsed HP. No verified maximum-HP source exists, so `hp` remains current-only. Never infer maximum HP from pips, line count, shield arithmetic, or rounded fill ratio. `precisePipsEnabled` remains in the codec for compatibility, but its nonfunctional menu/dialog and unverified ConVar instructions are removed.

Sep 30 client.dll IDA inspection establishes label-local binding: `sub_181CF8FF0` traverses the layout for ID `UnitHealthbarValue` (vtable offset `+400`) and caches its pointer at `this+3624`, beside `UnitHealthbar` at `this+3616`; the shield pair is at `+3728/+3736`. Per-tick `sub_181D0D7B0` calls `sub_18218FDD0(a2[1], {hash, "health"}, v[8]+v[10]+v[12])`, setting the dialog variable on the cached value label, not the root. A second `{d:health}` label would not receive those updates. Reparent the existing label instead; `test_topbar_pickups.js` already uses `SetParent` on the engine-owned `UltimateStatus`. This evidence supports pointer preservation, not a claim of live visual validation.

In native mode, remember the original parent and `SetParent` the same label into this bar's own `hp_counter_row`. Force visibility and opacity `1` and apply its wash color, font, size, and enemy text pulse; translation belongs to `hp_counter_anchor`. Discovery accepts the label as a direct child of either its own `InfoHealthContainer` or its own counter row, never a sibling WindowRoot. Unchanged scans do not re-adopt it. Capture every written inline style and the original pulse classes; restore them before returning it to the remembered parent on release, bypass, role change, percent switch, replacement, retirement, or teardown. When the original parent has expired, parts replacement uses the new valid info container as the restoration destination. Retired owners release before new owners capture shared baselines.

Percentage restores the label to its original location and suppresses it. Enemy players remain hidden when **Show Health Text** is off; ally readout off leaves the native label's text, styles, classes, and parent exactly stock. Never modify `UnitShieldbarValue`.

## Measured geometry

`applyBarGeometry()` is the only owner of Rewrite scale and translation. Let `Sx = widthScale / 100`, `Sy = heightScale / 100`, and let measured primary outer bounds relative to the stock stack be `B = (x, y, width, height)`. Measure both axes, stack offsets/dimensions, outer bounds, and inner insets from `actualxoffset`, `actualyoffset`, `actuallayoutwidth`, and `actuallayoutheight` in the existing scan/health pass.

```text
C = stackOffset + (B.x + B.width / 2, B.y + B.height / 2)
originX = (B.x + B.width / 2) / stackWidth
originY = (B.y + B.height / 2) / stackHeight
scaledLeft = C.x - B.width * Sx / 2

for player indicator i:
  gapX_i = stockBarLeft - originalCenterX_i
  targetCenterX_i = scaledLeft - gapX_i
                   + (anchored ? native(positionX) : 0)
                   + native(indicatorOffsetX_i) * Sx
  gapY_i = stockBarCenterY - originalCenterY_i
  targetCenterY_i = stockBarCenterY - gapY_i * Sy
                   + (anchored ? native(positionY) : 0)
                   + native(indicatorOffsetY_i) * Sy
```

Capture each player indicator's original center once per panel generation. Margin baselines are explicit stylesheet constants (level badge `-23px`/`-14px`, stock `unit_info_panel` `0px`/`-14px`) because Panorama exposes only inline styles: a zero delta clears the inline margin so the stylesheet applies, and a nonzero delta writes baseline plus delta. Convert target deltas using its alignment: the stock `unit_info_panel` and Rewrite level badge are vertically centered, so their margin-top delta is doubled; a top-aligned panel uses a one-to-one delta. NPC/building `unit` surfaces transform only the bar stack and never write indicator margins. At 100% scale use stock scale/origin baselines; do not add the retired `1.1` multiplier or a discontinuity at 101%. While Rewrite owns layout, write explicit X/Y translation, including zero after reset. Restore captured styles on release. The engine owns primary width/height and `max-width` at all times.

Both readouts use `hp_counter_container`, a direct `WindowRoot` child outside `#UnitStatus` and its 100×40 canvas. XML leaves `UnitHealthbarValue` in `InfoHealthContainer` for engine initialization; native ownership moves that existing panel into the row at runtime, without adding labels. `.WindowRoot #hp_counter_row #UnitHealthbarValue` changes only adopted-label layout: left/top alignment, zero margins and padding, no rotation, nowrap, and noclip. Its two IDs outrank stock relation selectors, and returning the panel removes that selector's effect.

The frame covers the full world-panel canvas (`width: 100%; height: 100%`), centered horizontally and top-aligned with zero top margin, `overflow: noclip`, `ignore-parent-flow: true`, and `z-index: 30`. Its stationary, left/top-aligned `#hp_counter_anchor` is sized to the measured container width W and height H, with a 200×210px CSS fallback and no transform. W, H, rw and rh are CSS pixels: each `actuallayoutwidth/height` is divided by that panel's `actualuiscale_x/y`, because the live 6722 world panel reports window pixels at scale 2 (a 400×420 measurement for the 200×210 canvas). Using raw window pixels pushed late-joined players' text ~65px right. The fit-children row is a direct anchor child with 4px padding; the adopted label has zero padding. Given measured row width rw and height rh, the row is right-aligned and the renderer writes `margin-right = W/2 - edge - x` (edge 40px enemy, 30px ally) and `margin-top = 66 + y`, clamped to `[0, max(0, W-rw)]` and `[0, max(0, H-rh)]`. Right alignment lets engine digit changes grow left in layout immediately, so the text never jumps while the measured row width catches up; the stylesheet defaults (`margin-right: 60px`, ally `70px`, `margin-top: 66px`) equal the zero-offset result on the 200px canvas, so the first frame before measurement is already in place. At zero offsets a fitting row ends at canvas center +40px (ally +30px), top 66px, and grows leftward. This baseline is a calibration target subject to live confirmation, not a verified visual result.

CSS mirrors stock damage wiggle and the `midboss`, `neutral_vault`, `health_hidden`, `GameStatePreGame`, `health_particle_active`, and `beingSpectatedInEye` collapse rules. In HP/current mode both custom labels stay collapsed and receive no text writes. In percentage mode the native label returns to its original parent and collapses. Both paths use desired position `x/y = nativePx(positionX/Y) + readoutOffsetX/Y`, selecting enemy, ally, or pulse-modifier keys. All six offset defaults, including codec defaults, are zero. Offsets are plain CSS pixels (1:1), with X bounds `[-200, 200]` and Y bounds `[-210, 210]`; no default subtraction or conversion applies to readout offsets. Render-only edge saturation keeps fitting rows inside the finite canvas without changing saved/imported values. Size and bar translation retain their existing conversion.

The existing paint cadence measures container and row layout, including unchanged-fill passes, so digit grouping, font/size changes, and root resize reflow without reading native text or adding a loop. Cached native-style writes leave unchanged passes write-free and retry rejected writes. Release, part replacement, and format changes reset geometry ownership. Zero/nonfinite dimensions defer positioning to the next existing pass. Oversized rows pin to the corresponding origin but cannot fit: fonts, supported sizes/digit counts, and UI scales require live calibration; the clamp does not prove arbitrarily long numbers visible. VM geometry checks and package validation do not replace a fresh-restart visual smoke.

Sep 30 client.dll IDA inspection found `citadel_unit_status_width = 200`, `citadel_unit_status_height = 210`, and `citadel_unit_status_window_scale = 2.0`, registered at `0x1801db782`, `0x1801dab32`, and `0x1801db822` and used by the `unit_status_overlay_v2` spawner `sub_181CF27C0`. The bounds target the approximately 200×210 CSS-pixel world-panel canvas; the exact convar-to-CSS mapping and supported UI scales still need live verification.

Known compatibility change: old HPCR2/HPCRP1 codes with omitted offset slots now decode to zero, preserving the default position. Explicit legacy user offset values, including explicit old defaults such as 27/500 or -30/434, are clamped to the new bounds and interpreted directly as CSS pixels. Existing saved sessions and imported user presets use the same normalization. There is no general migration, sentinel, wire-version change, or remapping of explicit user values. New zero, 27, and other in-range pixel offsets round-trip unchanged.

The canonical `baked_default` record alone accepts current zero offsets or exact historical shipped offsets for these six keys, then normalizes them to current defaults; every other deviation from the shipped baked values still rejects the bundle. Raw offsets are checked before clamping so arbitrary out-of-range values cannot impersonate historical defaults. This keeps older HPCRP1 bundles usable without changing user records. The web builder was intentionally not updated; existing local saves remain untouched.

The player name (`#name`) is unrotated: a Rewrite-owned `.WindowRoot #name { transform: none; }` rule overrides the stock `rotateZ(-4deg)` without editing the stock prefix.

The kill marker is a direct child of primary `UnitHealthbar`. Its X is `innerInsetX + innerWidth × threshold / 100 - markerWidth / 2`, clamped to the primary inner interval. Marker width is `max(1 native pixel, native(enemyKillMarkerWidth))`, further clamped to that interval. It never follows the secondary shield surface or writes stock geometry.

## Display-unit calibration candidate

`LEGACY_TO_NATIVE = 0.1` is a renderer-only **candidate**, not a measured conversion. `nativePx()` applies it only at world-healthbar write sites for `positionX/Y`, HP-text size (including pulse and ally variants), stamina dimensions/offsets, level/ultimate offsets, and kill-marker width. Readout offsets are the zero-based 1:1 CSS-pixel exception documented above. Percentages, BPM, thresholds, colors, topbar pickup dimensions/offsets, and ultimate cooldown percentage scale are not converted. Re-measure representative presets at supported UI scales before release; do not silently divide the full HUD by ten.

The 21-pixel level badge, 2-pixel rim, ~10-pixel text, small-box stamina spacing, native current-number placement, and counter/bar overlap are likewise unverified live calibration values.

The level badge starts immediately left of the ultimate icon, with `margin-left: -23px` and the icon's `margin-top: -14px`. These CSS margins are the captured geometry baseline: zero level offsets at stock bar scale/position preserve them.

## Package

The normal production package contains the wrapper's exact 13 compiled assets:

- `panorama/layout/hud_escape_menu.vxml_c`
- `panorama/layout/unit_status_overlay_v2.vxml_c`
- `panorama/styles/hp_colors_v2_menu.vcss_c`
- `panorama/styles/unit_status_v2.vcss_c`
- `panorama/scripts/hp_colors_v2_contract.vjs_c`
- `panorama/scripts/hp_colors_v2_state.vjs_c`
- `panorama/scripts/hp_colors_v2_menu.vjs_c`
- `panorama/scripts/unit_status_v2_colors.vjs_c`
- `panorama/layout/citadel_hud_top_bar.vxml_c`
- `panorama/layout/test_event_relay.vxml_c`
- `panorama/scripts/test_event_bridge.vjs_c`
- `panorama/scripts/test_topbar_pickups.vjs_c`
- `panorama/images/hpv2/ultimate_progress.vtex_c`

Do not package the settings preview, legacy unit-status override, stock icon CSS override, or scratch snapshots. Keep the user's timer includes and assets.

## Verification and live-only limits

Run all `scripts/validate-hp-colors-rewrite-v2-*.test.js` validators and `build_hp_colors_rewrite_v2.ps1 -SkipDeploy`; this leaves the installed addon untouched. Source/VM and compiler/package checks do not establish live rendering, data parity, or performance.

A fresh-restart in-game smoke is still required for actual `WorldUIRoot` classes and lineage on players, neutral camps, troopers/bosses, and buildings; current-label locale/lag behavior and exact max HP; shield/armor/deferred overlap; accessory, counter, and marker alignment; `LEGACY_TO_NATIVE`, supported UI scales, player stamina depletion; native ultimate-ready/cooldown priority; stock preview isolation; late/reused unit panels; menu focus and height; and actual frame cost. Do not claim exact current/max readout, precise-line support, FPS, or visual success from synthetic tests or logs alone.
