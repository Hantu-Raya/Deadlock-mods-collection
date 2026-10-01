# HP Colors Rewrite v2 layout contract

## Shipped stock frame

The v2 override is rebased on the static unit-status tree shipped in Deadlock build 6722. The supplied GameTracking master snapshot (`245f2952f9`, byte-identical to the 6711 snapshots) provides its stock XML and CSS. Stock `#UnitStatus` was `100×40`; Rewrite makes it, `#InfoHealthContainer`, and `#UnitHealthbarsContainer` full-canvas and noclip, then places their compact leaves at the original stock coordinates. The primary `#UnitHealthbar.UnitHealthbarContainer` remains `76×18`; its direct `#UnitHealthbarInner` surface remains `69×12`. Stock health layers, line panels, labels, and indicator visibility remain engine-owned, except for owned presentation and the permanent mask and outer-background deletions documented below.

`#UnitHealthbarsContainer` has two sibling branches: primary `#UnitHealthbar` and secondary `#UnitShieldbar`. Both contain an ID `UnitHealthbarInner`, and each has its own `unit_healthbar_bullet_shield`. Always resolve the direct `UnitHealthbar` child and that child's direct inner panel before looking up health layers. Never select the first `.UnitHealthbarContainer` or search the complete stack for a duplicate ID.

Rewrite-owned level, pulse, kill-marker, and ultimate-timer panels are attached only to their local stock owners. Native HP text adopts the engine's existing health label into the stationary counter row attached directly to `WindowRoot`. There are no custom number/max labels. Stock settings previews have no `.WindowRoot`, so late canvas overrides cannot affect them.

Fresh installs ship width 148%, height 80%, raw `positionY = -38`, enemy low `#FD4949`, all ally palette colors `#FFEFD7`, Oracle HP text, and stored enemy HP-text offsets 18/14. Accessory anchoring defaults on, with ultimate and level raw offsets X 74 / Y 48. Enemy pip recoloring defaults on with `#000000`; stamina defaults to `arrow`, matching the frozen baseline. These presentation defaults do not change the stock frame dimensions above.

## Ownership and classification

Unit kind and relation are separate facts. The bounded ancestor walk gathers explicit engine classes, including classes on `WorldUIRoot`; the pure `classifyUnit(facts)` policy applies building → player → NPC precedence. Neutral facts win over enemy/friend, exactly one of enemy/friend sets the relation, and contradictory or unknown ownership stays stock. `team1`/`team2` choose palette endpoints only; they never infer ownership.

`resolveSurface(bar, config)` is the only gate for custom presentation:

| Surface | Eligibility | Owned presentation |
|---|---|---|
| `player` | Classified enemy/friendly player | Relation settings, layout, pulse, readout, pips, and player-only accessories as configured. |
| `unit` | Enemy/friendly NPC or building with its independent opt-in enabled | Relation palette, feedback, visibility, bar size/position, native HP readout, and contained health lines. No pulse, level badge, kill marker, ultimate coloring/timer, or stamina. |
| `fill` | Known neutral NPC with `npcNeutralEnabled` | Fixed `neutralColor` fill, shared bar size/position, enemy HP-text settings, and contained health lines. Neutral feedback, bounty and tier art stay stock; player-only accessories and pulse remain unsupported. |
| stock | Master off, unknown kind/relation, ambiguous relation, disabled category, or unsupported neutral/building kind | Restore native styles and owned classes, including health-line containment. |

Enemy/friendly NPC and building gates default off and are independent of player `enemyEnabled` / `allyEnabled`. The six new settings append to the existing `hpv2` extension. State, presets, conditions, HPCR2, HPCRP1, and the `HP_COLORS_V2_CONFIG` transport use the existing generic contract; settings, scopes, presets, and conditions persist through the canonical durable save bridge.

The hero catalog includes six prerelease entries from game data: Baba (`hero_baba`), Deadman Danny (`hero_deadpack`), Nurse Harrow (`hero_nurse`), Rat King (`hero_ratking`), Solomon (`hero_chessmaster`), and Violet (`hero_artist`). HPCRP1 stores string hero keys, so these additions need no encoding change. Existing All Except lists do not automatically skip newly added heroes. The web preset builder's catalog still lacks these entries.

## Stock appearance ownership

The appended `criticalIndicatorVisible` and `playerNamesVisible` booleans default true (stock pass-through); the `hpv2` extension has 67 append-only slots, including pip-color, stamina-shape, text-outline, own-HUD health-color keys and retired tombstones. Slots 62–64 are `readoutOutlineWidth`, `allyReadoutOutlineWidth`, and `nameOutlineWidth`; slots 65–66 are `hudHealthColorMode` (`off`/`team`/`custom`, default `off`) and `hudHealthColor` (default `#FFFF00`). Legacy 72 slots and transport version 2 remain unchanged; new exports use `hpv2.v = 2` to mark bar-relative HP-text offsets. Older runtimes ending at slot 64 reject non-default new slots; HPCRP1 is unchanged and the web builder remains incompatible. Player labels are independent of relation color enablement. Only `player` surfaces receive owned WindowRoot hide classes, with late collapse-only selectors for `#CriticalIndicator` and `#name`; removal defers to stock visibility, including spectator and convar rules.

All unit-status bars are permanently rectangular without an outer background, including players, NPCs, buildings, shields, previews, and master-off or ungated surfaces. Because this stylesheet replaces stock, it deletes the three `opacity-mask` declarations on `.UnitHealthbarContainer`, `#UnitHealthbarInner`, and `#UnitHealthbarLines`, and all eight container background-color declarations. The six relation rules that become empty are removed; the black inner backing and every other stock declaration remain. There is no shape setting, runtime class ownership, or inline mask write.

Master-off, surface loss, classification change, replacement, retirement, and teardown release label owners. Existing paint reconciliation repairs failed label class writes and external class drift without another timer. Missing optional labels/lines never block colors or create retries. Health math and stock critical animations/scaling/wash/margins remain unchanged outside owned presentation. The critical-state convar is never executed, saved, or changed. This is not a full v1 mode.

`CriticalIndicator` is already a direct `WindowRoot` overlay (`ignore-parent-flow: true`, stock top 84px), not a child contributing height to the bar. Stock `healthCritFlash3` scales `UnitHealthbarsContainer` from 1.1 to 1.15 and replaces its transform at 50%; the full-canvas pivot makes this move the rebased compact bar independently of its external native HP text. While `HPColorsRewriteBarLines` owns geometry, CRITICAL retains only that animation's brightness beat and the ordinary player 17px left margin; it cannot replace the custom stack scale/translation. The label's stock art, animation, position and visibility gates stay unchanged. Master off or surface release selects the untouched stock scaling/transform and 20px critical margin again.

OWN HUD HEALTH COLOR is separate from unit-status ownership. NAME & APPEARANCE offers segmented OFF/TEAM/CUSTOM and OWN HUD CUSTOM COLOR, dimmed and inert unless CUSTOM; legacy pak01 layouts boot without either row. The menu script alone paints inline `washColor` on the local bottom-HUD `#health_and_abilities_container … #health_bar_Left`, whose stock `hud_health.css` wash is yellow. TEAM uses team1 `#E7B659` / team2 `#5B79E6`; CUSTOM uses the effective color. OFF, master off, hydration pending, and unknown/conflicting team release only the owned inline wash. Cached validated references, replacement recovery, and unchanged-write suppression piggyback on generation-guarded identity polling without another loop. Existing state machinery supplies scopes, ability conditions, Undo, Reset Page, durable save, and transfer.

## Health sampling and readout

Health percentage uses the minimum available visible-fill signal on primary `unit_healthbar_lagging`: layout width relative to the primary inner width, negative X offset, inline clip rectangle, horizontal transform/pre-transform scale, and inline width. Normalize measured fill width and X offset and the inner denominator to CSS pixels before comparing them; each `actual*` read uses its own panel's axis UI scale. Inline CSS widths, `px` clip lengths, transforms, and percentages already use their own CSS/relative units and must not be divided again. CSS clip lengths compare against normalized fill width. Empty, unparsable, or unavailable signals are ignored. Pulse coverage uses the same fraction. Do not subtract primary bullet shield, ratking armor, deferred damage, or the separate `UnitShieldbar`; those are overlapping stock layers. Never write engine layer widths. Live build 6722 evidence: the engine keeps the fill at full layout width and writes an inline clip such as `rect( 0.0%, 77.710846%, 100.0%, 0.0%)`, whose right edge is the health percentage; `unit_healthbar_delta` is clipped from the new to the old edge. The clip signal is therefore authoritative in practice; the other signals remain defensive fallbacks.

HP text always uses the engine's existing `UnitHealthbarValue` `{d:health}` label, preserving panel identity, locale grouping and exact number without reading or writing text. No max or percentage counter exists. Legacy slot 29 (`readoutFormat`) and extension slot 30 (`allyReadoutFormat`) remain decodable but are retired from values, conditions and hero `own` lists. Exports omit them; old saved percent/current formats show a one-time menu notice. `precisePipsEnabled`, `readoutMaxTeamColor`, and `allyReadoutMaxTeamColor` are likewise retired: wire slots remain tombstones, but loaded values, conditions and ownership entries are dropped. Retired-format enum rows and unused contract projections are removed.

Sep 30 client.dll IDA inspection establishes label-local binding: `sub_181CF8FF0` traverses the layout for ID `UnitHealthbarValue` (vtable offset `+400`) and caches its pointer at `this+3624`, beside `UnitHealthbar` at `this+3616`; the shield pair is at `+3728/+3736`. Per-tick `sub_181D0D7B0` calls `sub_18218FDD0(a2[1], {hash, "health"}, v[8]+v[10]+v[12])`, setting the dialog variable on the cached value label, not the root. A second `{d:health}` label would not receive those updates. Reparent the existing label instead; `test_topbar_pickups.js` already uses `SetParent` on the engine-owned `UltimateStatus`. This evidence supports pointer preservation, not a claim of live visual validation.

In native mode, remember the original parent and `SetParent` the same label into this bar's own `hp_counter_row`. Force visibility and opacity `1` and apply its wash color, font, size, and player-only enemy text pulse; translation belongs to `hp_counter_anchor`. Discovery accepts the label as a direct child of either its own `InfoHealthContainer` or its own counter row, never a sibling WindowRoot. Unchanged scans do not re-adopt it. Capture every written inline style and the original pulse classes; restore them before returning it to the remembered parent on release, bypass, role change, replacement, retirement, or teardown. When the original parent has expired, parts replacement uses the new valid info container as the restoration destination. Retired owners release before new owners capture shared baselines.

Opted-in NPC/building bars adopt the same native number and use their relation's HP TEXT font, size, colors, offsets and outline: enemy and neutral use enemy keys, friendly uses ally keys. Enemy-side text remains hidden when **Show Health Text** is off; ally text off returns the native label's parent, inline styles and classes completely to stock. Turning off a non-player UNITS gate releases custom geometry, readout and lines to stock. Boss/building labels retain stock 70% `ui-scale`; stock 180% boss/building and 80% neutral `UnitStatus` scaling compose with custom bar scale. Never modify `UnitShieldbarValue`.

Enemy and ally HP text have independent outline widths, with the enemy width also applying during enemy text pulse. Names have a shared outline width. All three settings range from 0–10 in steps of 0.5 and default to 5, the stock text-shadow strength. At 5 the renderer leaves the native rule untouched or exactly restores the captured inline `textShadow`; other values write `0px 0px 0px <w> #10130D` for HP labels and `0px 0px 0px <w> #10130DEE` for names. Release restores the captured inline shadow with the other owned styles. The editor exposes TEXT OUTLINE rows on ENEMY / HP Text, ALLY / HP Text, and NAME & APPEARANCE.

Owned HP labels reserve `ceil(outline width)` horizontal CSS pixels inside their own label box, with noclip and equal negative left/right margins. The negative margins cancel the added padding in the fit-children row, preserving glyph placement, measured row bounds and edge clamps; the same panel covers enemy pulse text. Names reserve at least their stock 2px horizontal padding, expanding the 170px stock width limit by the added guard so the text content limit and centered position remain unchanged. Padding, margins, overflow and width limits restore from their captured native styles on release. These guards are VM/source-tested; native shadow rasterization and widest-outline/font combinations still require in-game confirmation.

## Measured geometry

`applyBarGeometry()` is the only owner of Rewrite scale and translation. Let `Sx = widthScale / 100`, `Sy = heightScale / 100`, and let measured primary outer bounds relative to the stock stack be `B = (x, y, width, height)`. Every measured stack, primary, inner, indicator, and marker bound/offset in this section is in CSS pixels: divide each `actualxoffset`/`actuallayoutwidth` by **that panel's** finite positive `actualuiscale_x`, and each `actualyoffset`/`actuallayoutheight` by its `actualuiscale_y`; missing/invalid scale falls back to 1. Preserve negative offsets and treat unavailable/nonfinite layout as not ready, not zero. Measure both axes, stack offsets/dimensions, outer bounds, and inner insets in the existing scan/health pass. Do not apply a second scale to CSS margins or to the saved offsets.

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

Capture each player indicator's original center once per panel generation, only after its own width/height and the sampled stack and primary dimensions are finite and positive. A zero/unsettled layout does not capture a center: the existing scan/paint reconciliation retries when the accessory alone becomes ready, without a new timer or blocking bar colors. Full-canvas margin fallbacks are explicit stylesheet constants (level badge `27px`/`67.5px`, stock `unit_info_panel` `50px`/`67px` at 200×210). Measured baselines add `(W−200)/2` horizontally and use `85−(panelHeight+14)/2` vertically to preserve stock centers. Both panels are now left/top-aligned, so offset deltas are one-to-one CSS pixels. Opted-in NPC/building and neutral surfaces use shared bar-stack geometry and their own native counter row, but never apply custom indicator offsets. At 100% scale use stock scale/origin baselines; do not add the retired `1.1` multiplier or a discontinuity at 101%. While Rewrite owns layout, write explicit X/Y translation, including zero after reset. Restore captured styles on release. The engine owns primary width/height and `max-width` at all times.

Native HP text uses `hp_counter_container`, a direct `WindowRoot` child outside the full-canvas info branch. XML leaves `UnitHealthbarValue` in `InfoHealthContainer` for engine initialization; native ownership moves that existing panel into the row at runtime, without adding labels. `.WindowRoot #hp_counter_row #UnitHealthbarValue` changes only adopted-label layout: left/top alignment, zero margins and padding, no rotation, nowrap, and noclip. Its two IDs outrank stock relation selectors, and returning the panel removes that selector's effect.

The frame covers the full world-panel canvas (`width: 100%; height: 100%`), centered horizontally and top-aligned with zero top margin, `overflow: noclip`, `ignore-parent-flow: true`, and `z-index: 30`. Its stationary, left/top-aligned `#hp_counter_anchor` is sized to the measured container width W and height H, with a 200×210px CSS fallback and no transform. W, H, rw and rh are CSS pixels: each `actuallayoutwidth/height` is divided by that panel's `actualuiscale_x/y`, because the live 6722 world panel reports window pixels at scale 2 (a 400×420 measurement for the 200×210 canvas). Using raw window pixels pushed late-joined players' text ~65px right. The fit-children row is a direct anchor child with 4px padding; the adopted label has zero padding. Given measured row width rw and height rh, the row is right-aligned and the renderer writes `margin-right = W/2 - edge - x` (edge 40px enemy, 30px ally) and `margin-top = 66 + y`, clamped to `[0, max(0, W-rw)]` and `[0, max(0, H-rh)]`. Right alignment lets engine digit changes grow left in layout immediately, so the text never jumps while the measured row width catches up; the stylesheet defaults (`margin-right: 60px`, ally `70px`, `margin-top: 66px`) equal the zero-offset result on the 200px canvas, so the first frame before measurement is already in place. At zero offsets a fitting row ends at canvas center +40px (ally +30px), top 66px, and grows leftward. The user confirmed stock default positions in game for bf49089; broader size/UI-scale calibration remains separate.

CSS retains stock readout hidden-state gates. Native text uses `x = nativePx(positionX) + offsetX × widthScale/100` and `y = nativePx(positionY) + offsetY × heightScale/100`, with enemy, ally or pulse modifiers. All six HP-text offsets store CSS pixels at 100% bar size; bounds are X ±334 and Y ±350. Fresh enemy offsets are 18/14; ally and pulse offsets remain zero. Only the rendered row saturates at visible edges; stored requests remain unchanged.

The existing paint cadence measures container and row layout, including unchanged-fill passes, so digit grouping, font/size changes, and root resize reflow without reading native text or adding a loop. Cached native-style writes leave unchanged passes write-free and retry rejected writes. Release and part replacement reset geometry ownership. Zero/nonfinite dimensions defer positioning to the next existing pass. Oversized rows pin to the corresponding origin but cannot fit: fonts, supported sizes/digit counts, and UI scales require live calibration; the clamp does not prove arbitrarily long numbers visible. VM geometry checks and package validation do not replace a fresh-restart visual smoke.

Sep 30 client.dll IDA inspection found `citadel_unit_status_width = 200`, `citadel_unit_status_height = 210`, and `citadel_unit_status_window_scale = 2.0`, registered at `0x1801db782`, `0x1801dab32`, and `0x1801db822` and used by the `unit_status_overlay_v2` spawner `sub_181CF27C0`. The bounds target the approximately 200×210 CSS-pixel world-panel canvas; the exact convar-to-CSS mapping and supported UI scales still need live verification.

Durable saves, HPCR2/HPCRP1 codes and sparse presets retain the frozen `974128a` baseline rather than inheriting new shipped defaults. Fresh installs and no-base RESET use the new defaults; layered Reset-to-Base keeps its existing base-resolution behavior. Old explicit-own presets without an All Heroes base pin frozen fallback keys so missing values cannot acquire the new look.

New exports use `hpv2.v = 2`; durable schema 4 still reads schemas 1–3. Old unmarked codes, `hpv2.v = 1` data and old durable records migrate each HP-text offset once as `round(oldOffset / (axisScale/100))`, using that record's width/height scale. Ultimate/level offsets already scaled and need no migration. The canonical `baked_default` accepts the supported shipped-default variants, including historical offsets, without relaxing validation of arbitrary user records. The web preset builder still accepts only `hpv2.v = 1` and fewer extension slots, so new v2 exports are a known incompatibility; it was not updated in this change.

Names remain straight. Classified enemy/ally players gain independent enabled colors and shared 8–40px size and ±200/±210px offsets, independent of bar-color enablement. Ownership captures/restores color, font size, max-height, height, margins and text shadow; it never accesses engine text or forces visibility. Stock brightness 0.8 remains, and custom spectator colors retain hexadecimal alpha 80. Fitting names clamp to measured canvas bounds; centered horizontal margins use 2× the requested displacement. Zero offsets/14px release inline geometry to stock. Optional replacement/late discovery uses the existing cadence.

The kill marker is a direct child of primary `UnitHealthbar`. Its CSS-pixel X is `innerInsetX + innerWidth × threshold / 100 - markerWidth / 2`, clamped to the primary inner interval. Marker width is `max(1 native pixel, native(enemyKillMarkerWidth))`, further clamped to that interval. At UI scale 2, 69 CSS-pixel inner width and 3.5 CSS-pixel inset with a 50% threshold and 1px marker place its left edge at 37.5px, not at a raw-window-pixel position. It spans 100% of the primary outer bar height at top 0, never follows the secondary shield surface, and never writes stock geometry. Health-line containers likewise span the primary height at top 0 with clipped overflow: tall dividers are full-height; minor ticks retain their 8px bottom-aligned extent.

Pip-line recoloring owns `.line_large` and `.line_small` washes only for matching enemy/ally surfaces, including opted-in NPC/building bars; neutral washes stay stock. `enemyPipColorEnabled` defaults on with `#000000`; `allyPipColorEnabled` defaults off with `#042517`. Shared `pipOpacity` (0–100%, default 100) sets `#UnitHealthbarLines` container opacity to `pipOpacity / 100`, multiplying unchanged stock child opacity (enemy 0.6, ally/neutral 0.8). Engine-created or replaced lines inherit the fade immediately, without per-line opacity bookkeeping. At 100 or on surface release the renderer clears the container override. Disabling custom color restores stock washes; spectator washes remain stock. The reversible `HPColorsRewriteBarLines` root class gates full-height, clipped line containment for eligible surfaces, so gate-off bars retain stock lines.

Enemy-player stamina supports `staminaShape` = `arrow` (fresh and frozen default), `circle`, or `box`. Arrows retain the stock image; custom dimensions, offsets and color apply without forcing boxes, and empty arrows retain stock offBlack wash. Circle/box pips use their owned shape, with black empty interiors; friendly/stock stamina stays untouched. Missing shape keys in old data derive `box` when width differs from frozen 110, height differs from frozen 44.8, or custom stamina color is enabled, otherwise `arrow`, preserving historical customized saves and codes.

## Display-unit calibration candidate

`LEGACY_TO_NATIVE = 0.1` is a renderer-only **candidate**, not a measured conversion. `nativePx()` applies it only at world-healthbar write sites for `positionX/Y`, HP-text size (including pulse and ally variants), stamina dimensions/offsets, level/ultimate offsets, and kill-marker width. HP-text offsets store CSS pixels at 100% bar size without this conversion, then scale with the corresponding bar axis. Percentages, BPM, thresholds, colors, topbar pickup dimensions/offsets, and ultimate cooldown percentage scale are not converted. Re-measure representative presets at supported UI scales before release; do not silently divide the full HUD by ten.

Stock default placement was confirmed in game for bf49089. The 21-pixel level badge, 2-pixel rim, ~10-pixel text, custom stamina spacing, and counter/bar overlap still need representative calibration at nondefault settings and supported UI scales.

The level badge starts immediately left of the ultimate icon, with full-canvas fallback margins `27px`/`67.5px`; the icon's `unit_info_panel` falls back to `50px`/`67px`. Measured stock-center baselines preserve this placement at zero level offsets and stock bar scale/position. Only enemy player surfaces with numeric engine-resolved `player_level`, enabled level visibility, and eligible renderer state show the circular `LevelContainer`; its parent owns collapse. The child `unit_level_label` retains its root-provided `{i:player_level}` binding and has no independent inline collapse or renderer text writes.

Tier recoloring writes the complete `border: 2px solid <tier>` rather than only `borderColor`, preserving the rim width/style when crossing level 19 or 27. This addresses the reported solid-disc failure; fresh-restart in-game confirmation remains pending.

## Full-canvas stock-origin rebase

The `.WindowRoot` overrides leave the engine draw window approximately 200×210 CSS pixels; no convars or allocation change. `UnitStatus`, `InfoHealthContainer`, and `UnitHealthbarsContainer` are full-canvas and noclip. Compact leaves are rebased to the old stock origin `((W−100)/2,65)`: the primary remains 76×18 at top 65px, with player margin-left 17 shifting its centered X by 8.5px (at W200, left ≈70.5); secondary shield placement and inner insets retain their stock relationship. Ultimate/level panels use measured left/top stock-center baselines. Native health/shield labels use stock world-coordinate CSS margins, with reversible right-margin compensation when W differs from 200; adopted HP text remains in its independent counter frame. Names, stamina, status effects and other root siblings get no second translation.

Damage wiggle and transition belong to the full-canvas info branch. Its, UnitStatus's, and the stock bar stack's scaling origins preserve the old frame center `(W/2,85)` (CSS fallback `50% 40.48%` at 200×210, measured Y `8500/H%`). Boss/building animation-none gates, midboss and in-eye root collapse, and stock 180% boss/building / 80% neutral scaling remain.

Bar/stamina translation uses raw×0.1; ultimate/level own offsets additionally multiply by the corresponding bar scale. To reach each canvas edge at minimum scale 0.6, symmetric raw reach is ±ceil(200/(0.1×0.6)) = ±3334 X and ±ceil(210/(0.1×0.6)) = ±3500 Y for ultimate/level. Bar/stamina use ±2000/±2100. The editor displays HP-text, pulse-text, ultimate and level offsets as percentages of the stock 76×18 bar: X% = stored CSS px /76×100 and Y% = stored CSS px /18×100, with raw×0.1 first for ultimate/level. Typed percentages, including condition values, round back to stored integers; slider windows preserve their physical ranges. Bar/stamina rows retain raw×0.1 CSS-pixel display; name offsets remain 1:1. Storage and transport keep stored units, and only HP text/name clamp; other parts remain free.

The full-descendant rebase is implemented, not a pending fallback. The user confirmed stock default positions and no clipping in game on 2026-10-01 for bf49089. This live confirmation resolves the former compact-frame clipping gate; mock/CSS tests alone still do not establish native rendering or behavior at every UI scale.

The `c7998a0` audit keeps one geometry rebase per paint tick, caches the native shield label, deduplicates unit fact classes, and names whole-bar geometry caches `bar*` rather than `segment*`. It removes unused storage `dispose`/`savedAt` projections, redundant renderer guards/writes and unreachable menu paths. Menu synchronization reads one state snapshot; missing controls in legacy layouts are cached. In the adapter VM's shipped-default idle paint scenario, class reads fell 52→2, parent reads 15→4 and layout reads 70→54, with unchanged style-write counts. Review found no behavior changes; these operation counts are not live frame-time or FPS evidence.

## Native colour popup

The colour popup embeds `CitadelColorPicker` and includes the stock `citadel_ui_color_picker.vcss_c` stylesheet. It accepts `CitadelColorPickerColorChanged(r,g,b)` only as valid 0–255 RGB channels, without alpha. Opening seeds the native `HexValue` entry through `TextEntryChanged`, suppressing the resulting seed event so opening alone does not edit settings or create Undo history.

Live changes share one Undo gesture per picker session; Escape restores the opening value. Condition colours remain isolated in the condition draft until that draft is applied. If the native panel or its `HexValue` entry is unavailable, the popup falls back to hex-only entry and logs one warning. The custom HSL Hue/Saturation/Lumen sliders are removed.

Native picker event handling, seeding, Undo, cancellation, draft isolation and fallback are VM-tested only; native rendering and interaction still require in-game confirmation.

## Durable save transport

Deadlock's 2026-10-01 update restricts `CitadelHTMLPanel.SetURL` (client.dll RVA `0x2228950`) to case-insensitive `https://` URLs; other schemes become `about:blank`. The Sep 30 build had no such check. No script-execution method exists, although `HTMLTitle` and `HTMLURLChanged` still fire. The former `file://` localStorage page and `javascript:` injection no longer work.

The hidden panel loads [the hosted storage page](https://hantu-raya.github.io/hpv2-store/) once. Each request uses `#` + `encodeURIComponent(JSON.stringify(request))` with a unique id; the page handles `hashchange` without reloading. Fragments are not sent to the server. Replies remain `HPV2S1:` titles. Readiness requires the expected HTTPS page and page protocol version 1; missing or mismatched versions fail closed. Hello is resent every 8 seconds within a 30-second readiness deadline; an offline page leaves saving unavailable.

Storage remains localStorage in Steam's CEF profile, not a cloud save. The keys `hantu.hpcolors.v2/state` and `hantu.hpcolors.v2/state.prev`, record codec, schemas, validated-read write gate, checksum-guarded previous-record rotation, and request/save retries are unchanged. Pre-update `file://` saves are unreachable from the new origin, so the first HTTPS launch starts with no save. Third Eye and QOLLOCK keys no longer share this origin.

The page source is `D:/hpv2-store/index.html` in `Hantu-Raya/hpv2-store`, outside the VPK. GitHub Pages serves it with `max-age=600`, so updates can take up to 10 minutes to reach clients. Protocol changes must bump the version, fail closed on mismatch, and account for older cached pages and runtimes.

Live probes demonstrated 30 KB request URLs, one page load, and localStorage persistence across restart (`.scratch/hpv2_probe/launch1_console.log` and `launch2_console.log`). The temporary probe was removed in `058d51e`; `621c7ad` replaces the production transport. This evidence does not establish every menu save/recovery scenario.

## Package

The normal production package contains the wrapper's exact 14 compiled assets:

- `panorama/layout/hud_escape_menu.vxml_c`
- `panorama/layout/unit_status_overlay_v2.vxml_c`
- `panorama/styles/hp_colors_v2_menu.vcss_c`
- `panorama/styles/unit_status_v2.vcss_c`
- `panorama/scripts/hp_colors_v2_contract.vjs_c`
- `panorama/scripts/hp_colors_v2_state.vjs_c`
- `panorama/scripts/hp_colors_v2_storage.vjs_c`
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

A fresh-restart in-game smoke is still required for actual `WorldUIRoot` classes and lineage on players, neutral camps, troopers/bosses, and buildings; all five non-player UNITS gates, relation HP-text styling, stock label scaling and exact gate-off restoration; current-label locale/lag behavior; shield/armor/deferred overlap; accessory, counter, and marker alignment, including early versus late zero-layout recovery at non-100% settings; engine-created health lines inheriting opacity and reversible containment; `LEGACY_TO_NATIVE`, supported UI scales, player stamina depletion; native ultimate-ready/cooldown priority and engine-resolved numeric level text; stock preview isolation; late/reused unit panels; menu focus and height; native colour picker rendering, seeding, RGB changes, one-session Undo and Escape cancellation; HP/name outline rendering and exact stock restoration; and actual frame cost. Do not claim max-HP support, precise-line support, FPS, or visual success from synthetic tests or logs alone.

Own-HUD health wash still needs live confirmation: OFF/TEAM on both teams/CUSTOM, dimmed and inert custom input outside CUSTOM, exact owned-wash release under master off, hydration pending and unknown/conflicting teams, HUD replacement, and no changes to other health layers or unit-status bars. Exercise scopes, conditions, Undo/reset, save/restart and both transfer formats; verify legacy pak01 boot without the rows.
