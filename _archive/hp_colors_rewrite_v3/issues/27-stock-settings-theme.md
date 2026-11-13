# 27: Stock Settings theme

**What to build:** Re-theme the v3 ESC menu after Deadlock's stock Settings screen and stock popups, as shown in the approved mock `.scratch/hpv3_theme_mock/index.html`. That folder is untracked because it holds extracted game fonts and textures; open it from disk at 1568×882. The mock's CSS comments cite the stock rules it copies. Stock sources are `.scratch/hpv3_live1/stock_preview/popup_settings.css` (S) and `.scratch/stock_6774/panorama/styles/citadel_base_styles.css` (B), plus `popups/{popups_shared,citadel_popup_player_feedback,settings_*}.css`.

**Dependency:** 24. Do this before 26 (release at parity), because 26's screenshots should show the final look.

**Status:** rounds 1–2 are implemented and the canonical debug build is live-checked on 6785. Round 3 is implemented in source; its build/native acceptance remains pending. QOLLOCK and release variants have not been live-checked.

**Runs on:** gpt-6.1-sol (med). **Review:** gpt-6-astra (med). **Plan:** Claude Fable 5.1 + Main, 2026-10-15.

## User decisions (2026-10-15)

- **Full screen like stock:** no bordered 1570×900 shell and no title header. Undo, Close, save status and ResetSave move to a footer.
- **Enemy/Ally pill tabs:** one side visible at a time. The tabs live in each card head, and the preview follows the tab. While searching, both sides are visible.
- **One paper card per settings group.** The sub-nav lists a page's groups. BASIC/ADVANCED folds stay as thin toggles inside the cards.
- **Help text appears as a tooltip only;** the help line under the label is removed.
- **The preview stays a right column on every page,** in a new #59544C plate. The live-verified 284×298 HERO stage and the `preview.js` geometry stay untouched.

## Ground rules that shape the port

- The ESC context already loads `citadel_base_styles.vcss`. B rules (stock slider, `.SecondaryButton`, `.DropDownNew`, `.TickBox`/`.RadioBox`) apply directly. S, `popups_shared` and `settings_*.css` are not loaded, so copy their values into owned `HPC3*` rules as hex literals; the named colour macros do not resolve in owned CSS.
- Lane CSS contract: at most 10 selectors and 1,024 characters per rule, no `opacity-mask: none`, owned transitions animate `opacity` only, hide with `visibility: collapse`, and passive panels use `hittest="false"`. Initial slices substituted static masks/opacity reveals for stock animations; the explicitly user-requested [round-3 exceptions](../ENGINE.md#inherited-stock-control-styles) now permit only the six named stock keyframe copies and active-state scale.
- Every stock texture the mock uses exists in pak01 (6785). S:3028's `masks/rough_edge_02.png` does not exist; use `rough_edge_02_png.vtex`.
- Browser-only effects need Panorama substitutes:
  - `::before`/`::after` → generated child Panels (`HPC3NavBrush`, `HPC3SubBrush`, `HPC3CardBg`, `HPC3RowBg`, `HPC3RowRule`) with `ignore-parent-flow` and `hittest="false"`.
  - CSS `mask` → `opacity-mask` with a static threshold.
  - blend/filter → `wash-color`/`brightness`/`saturation`.
  - text gradient → `color: gradient()` (S:3108).
  - `scrollIntoView` → `ScrollParentToMakePanelFit`.
  - The colour-slider thumb tint is a JS style write on the engine `SliderThumb` child, guarded by `valid()`. If that fails, tint only the swatch.

## Mapping (XML via `tools/menu-layout.js`, CSS `hp_colors_v3_menu.css`, JS `hp_colors_v3_menu.js`)

| Mock | Real |
|---|---|
| Full-screen window + dim | `.HPC3Shell` at 100%, no border or gradient; `.HPC3Backdrop` `#000000c0` |
| Nav rail top row | Permanent `HPColorsSearchBox` (drop the `SearchOpen` collapse; keep `applySearch`), a share square (→ Presets), and a reset-page square (`requestReset`). Stock sizes: 198×40 search, 40×40 squares, radius 6, `#FFEFD70F`/`#FFEFD708` |
| Nav items | `HPColorsNav<Page>Button` + generated `HPC3NavBrush` (paper_tile_1k, wash #5FE69E, brightness 4, nav mask, opacity 0 / .2 hover / 1 `.Selected`) and `HPC3NavDot` (#F1C7FF, `.HasCond` from `config.rules` via new `syncNavDots()`); label oracle 24 `#FFEFD788`, `.Selected` #10130D |
| Sub-nav | `HPColorsSubNav<Page><Group>Button` per schema group, with an `HPC3SubBrush` (paper_tile_1k_01_png, .25/.35), shown only under the selected page. `activateGroup()` → `showPage`, `.Active` on that card, scroll; `onmouseover` of another card clears `.Active` |
| Page title | `.HPC3PageTitle`: oracle 48, letter-spacing 1.5, gradient #5FE69E→#A6FFB5, text-shadow `0 0 12px 0 #5FE69E33`. Drop the kicker and rule |
| Card | `HPC3Card` per group: `HPC3CardBg` (paper_tile_1k_01_psd 1024, rough_edge_02 mask, opacity 0 → 1 on `:hover`/`.Active`), head title 24 bold `#FFEFD7CC`, group reset (opacity on card hover; new `resetGroup()` through `commit`/`record`, undoable), Enemy/Ally pills |
| Side pills | Per card head `HPColors<Page><Level><Group>Side{Enemy,Ally}Button` (`SecondaryButton light` + `fill` when selected). The root class `HPC3SideAlly` collapses the other side's controls; `.Searching` shows both; `preview("setSide")` follows |
| Row | `HPC3RowBg` (#675E4C + paper_tile_1k_01_png @256px 512px, wipe_horizontal_1024x64 mask, brightness 1.75, saturation 1.5, opacity 0→1 on hover), `HPC3RowRule` 1px #00000080 inset 32. Label 280px semi-bold 18 `#FFEFD744`→#FFEFD7 on hover; help via tooltip. Order: label, control, row reset (collapsed unless `.Changed`, opacity on hover), ◆ |
| Toggle | 40×20 `switch_background.vsvg` plus `switch_handle_on/off` children cross-faded by opacity on `.Checked` (no transform transition) |
| Slider | Delete the owned `#SliderTrack*`/`#SliderThumb` overrides so B:3642–3691 applies; `.HPC3Slider` 300×30; static notch child; 88px entry per `settings_slider.css`, `.Changed` #5FE69E |
| Colour | Hue slider (`settings_color_slider.css` gradient track, 20px white thumb with a 3px black border, tinted by JS), 22px swatch, 16px hex; reuse the mock's `ramp()`/`nearest()` as `hueToHex`/`hexToHue` |
| Enum | ≤4 values: segment buttons restyled as stock RadioBox rows (ids and `.Selected` kept); >4: stock `DropDownNew` wrapper around the native DropDown (Border/Background/Arrow siblings) |
| Preview | `HPC3PreviewPlate` (#59544C, radius 10, rough_edge_01 mask) around the unchanged stage. Try `icon_mask03` on the layered `HPColorsPreviewHeroFrame`; the white opacity-brush guard stays. Health row = 100px label + 240px stock slider + value |
| Popups | `.HPC3DialogCard` copies `.PopupPanel` (paper_tile_1k_02_dark cover, no transitions). Title Pulp 32 `#FFEFD788`, sub 18 `#FFEFD744`, desc `#FFEFD744`; buttons `SecondaryButton light [fill]`; new `HPColors<Dialog>EscClose` (opacity .2) wired to the existing cancel handlers; backdrop stays a full-size Button |
| Footer | `HPColorsFooter`: ESC BACK (`setMenuOpen(false)`), Undo (history), save status, ResetSave/Confirm (kept red). Opacity .2, Pulp 20 uppercase, hover brightness 2 |

## Slices

Run this check sequence after every slice: `node tools/generate.js`, the v3 tests, `generate.js --check`, `node ../hp_colors_rewrite_v3_qollock/tools/qollock.js` then `--check`, and both `-SkipDeploy -Debug` builds. After every CSS slice, also do an in-game load and grep console.log for `Parsing error|FATAL|Uncaught`; launching the game needs the user's go-ahead.

1. **Test scaffolding:** `tests/style-cascade.js` honours `:hover`/`:focus`/`.Selected` node states. Today `:hover` rules match unconditionally, so reveal assertions would pass vacuously. Add `tests/theme.test.js` helpers. Proof: the 1101 existing tests still pass.
2. **Shell, footer and nav chrome:** full-screen shell, the rail top row, nav brush and dot, the footer. Tests:
   - nav `.Selected`/hover opacity through the cascade;
   - cancel order (`menu.test.js:331–373`);
   - ResetSave still reachable;
   - search works without `SearchOpen`;
   - rewrite the 5:4/4:3/16:9 width model (`menu.test.js:172`): nav 18% (min 240, max 420), preview 25% (max 484), slider fill (max 300).
3. **Title, cards, sub-nav, group reset:** tests cover the group→card mapping and order (`menu.test.js:692`), the sub-nav setting `.Active` and the page, and a group reset that touches only that group and is undoable.
4. **Side pills:** the other side collapses, search shows both, the preview side follows, and every control remains publishable from its tab.
5. **Rows:** row background, rule, label, tooltip help, ◆ after the control, and row reset only when `.Changed`. Adjust the jargon test (`menu.test.js:701`).
6. **Controls:** toggle, stock slider and notch, entry, radio segments, DropDownNew, hue slider and tint. Tests: every control type still publishes (`menu.test.js:239`), the hue↔hex round trip, dropdown `SetSelected`, and a rewrite of the thumb test (`menu.test.js:187`).
7. **Preview plate and vignette:** stage stays 284×298 and centred; the `preview.test.js:1557–1594` brush guard and `uiScale 142%` are kept. Live gate: if the scene ignores the mask on the frame, use an overlay vignette Panel above the scene, or ship the plate only.
8. **Popups:** card restyle, EscClose, pills; the backdrop Button rule (`menu.test.js:676`); condition slots keep `HPC3AbilitySlot` behaviour.
9. **Release:** both lanes' release and debug builds; QOLLOCK Escape parity rechecked live; LIVE-VERIFIED and this ticket updated after the user's in-game check.

## Risks

- **CSS parse failures:** a runtime parse failure aborts `hud_escape_menu.xml`. `border-image`, `color: gradient()` on owned labels and `opacity-mask` thresholds compile even when wrong, so each slice needs a live console check.
- **Stock transitions:** stock `SecondaryButton`/`DropDownNew` bring their own transitions. That extends the inherited-exception set; record it in ENGINE.md.
- **Opacity masks:** they sit on dozens of row and card backgrounds per page, at unmeasured cost. Any FPS claim needs a separately authorised PresentMon A/B.
- **Narrow screens:** stock widths (280 + 300 + 88 + a 440 plate) do not fit at 5:4 or 4:3; the percentage caps and the width-model test cover this.
- **Boot ids:** `boot()` requires every generated id. New ids (sub-nav, pills, resets, EscClose) must be emitted in every variant, or boot retries forever.
- **QOLLOCK:** it recomposes from v3 on every generator change. Its window exclusivity and background click must be rechecked live.
- **Tests to rewrite:** `menu.test.js` 172/187/239/676/692/701, the `preview.test.js` plate assertions, generator snapshots, and the `menu-audit` id lists.

## Implementation — slices 1–3 (2026-10-15)

- The test cascade now requires node hover/focus/active states and counts pseudo-class specificity; Selected/Checked classes continue to use real panel state. `tests/theme.test.js` adds generated-panel, state, event and publication helpers.
- The shell fills the screen without a bordered frame or title header. The footer owns ESC BACK, Undo, save status and the existing two-step unreadable-save recovery. The rail owns permanent search, share-to-Presets and reset-page squares, stock paper navigation brushes and authored-condition dots.
- The width model covers 5:4, 4:3 and 16:9: an 18% rail (240–420px), 25% preview (484px cap), and sliders capped at 300px. Search fills remaining top-row width up to 198px; on narrow screens it shrinks while both squares stay 40px with 14px gaps (Main decision). No UI scaling was added.
- Each page/schema group has one paper card, with Basic/Advanced folds inside it, one undoable group reset (both sides and levels, including its condition rules), and a matching sub-navigation jump/Active highlight. Ungrouped schema rows form one General-id card, labelled with the page title; group order follows first schema appearance. Another card's hover clears the active highlight.
- Page titles use the stock oracle gradient/shadow. At this checkpoint rows, controls, side-column behavior, dialogs and preview rendering were otherwise unchanged; the preview stage kept its 284px inner camera width as its containing column changed.
- Added behavioural coverage for chrome states, footer recovery, permanent search, nav dots, group/card order and containment, sub-navigation/scroll dispatch, reset isolation/Undo and passive paper panels. Rewrote the affected width, fold, search/focus and group-placement regressions, including QOLLOCK's search-first background cancellation.

Validation: v3 **1,112/1,112 passed** (including 11 new theme tests); QOLLOCK **24/24 passed**, no skips. Canonical generation and `generate.js --check`, then QOLLOCK composition and `qollock.js --check`, all passed. The stylesheet guard checked 644 rules across three files, with a maximum of 10 selectors per rule and the 1,024-character cap enforced. Context-mode's initial check call lost its result at the 30-second RPC timeout; the complete sequence was rerun successfully through the normal execution tool with TAP reporting.

Builds, installation and game launch were outside the slices 1–3 assignment. Native acceptance was still required for owned `color: gradient()`, text shadow, static `opacity-mask-threshold`, paper-mask composition, percentage/fill/max-width allocation and scrolling; VM checks do not prove these parse or render in-game. Main subsequently verified sub-nav click, panel-method scroll and active paper live without `Uncaught`. No performance claim is made.

## Implementation — slices 4–6 (2026-10-16)

- Sided cards now have Enemy/Ally `SecondaryButton light` pills; the selected pill has `fill` and `Selected`. `HPC3SideAlly` selects one side across every card, with the preview following through `preview("setSide")`. Shared-only cards have no pills. Search exposes both matching sides with headings, and clearing it restores the selected side. Empty side columns are no longer generated.
- Setting rows are single lines: 280px dim semi-bold label, control, Changed-only row reset, then ◆. Passive `HPC3RowBg` and `HPC3RowRule` supply the stock paper wipe and inset separator instead of row boxes. Help uses `UIShowTextTooltip`/`UIHideTextTooltip`; DEFAULT labels and their generated ids are removed. Row resets use the ordinary validated edit/history path, retain condition rules and are undoable; number resets use the entry's existing threshold clamp.
- All generated toggles, including SHOW BOUNDS and the condition editor, use the 40×20 stock switch background and fixed on/off handles with opacity-only cross-fades. Number sliders inherit the native stock track/progress/radial thumb, keep a static default notch and reserve room for the 88px entry/unit. Modified entries stay green on hover. Radio-style short enums keep their button ids and Selected behavior; long enums retain the native DropDown inside the stock `DropDownNew` Border/Background/Arrow wrapper.
- Colour rows add the stock hue ramp, a guarded native-thumb tint, 22px swatch and 16px hex entry. Hue-to-hex follows the mock ramp; hex-to-hue projects onto its straight segments for the nearest position. Sync never quantizes arbitrary RGB hex/picker values, and a no-motion gesture does not change them. Hue drags share existing publication throttling, one save and one Undo; swatch clicks still open the existing picker.
- The live-reported missing rail glyphs are replaced by stock share/reset Images, with the requested wash/hover reveal; group and row resets also use the stock reset image. Search already uses `control_icons/24px/search.vsvg`. Main's opaque backdrop, 110px preview top clearance, staged-schema test path and guarded panel-method scrolling are preserved. Preview scene geometry and `preview.js` are untouched.
- Eleven new theme regressions cover side selection/search, every control's reachability/publication, row paper/tooltip/reset/conditions, toggle/radio states, static notches/modified entries, hue round trips/tint/gestures and rail Images. Existing menu, own-HUD and review fixtures now exercise tooltip help, RadioBox-plus-label children and omitted empty side columns. The synthetic long-enum test still enforces `SetSelected(optionId)` and verifies the passive wrapper decorations.

Validation: v3 **1,123/1,123 passed**; QOLLOCK **24/24 passed**, no skips. The final sequence ran canonical generation, the complete v3 suite, `generate.js --check`, QOLLOCK composition, `qollock.js --check` and the complete QOLLOCK suite. The stylesheet guard passed **658 rules / 3 files**, maximum **10 selectors**, with the 1,024-character cap enforced. Context-mode's child Node test invocation returned no test output, so runnable evidence was collected through direct Node execution.

Native acceptance remains with Main; no builds, installation or game launch were run here. The first newly authored CSS property is `saturation: 1.5`. New usages needing a live check are numeric `background-position: 256px 512px`, the row wipe's static mask/negative-margin composition, the notch child's percentage `margin-left` inside a native Slider, the multi-stop hue gradient/native-thumb tint, and narrow-row fill allocation. `SecondaryButton` and `DropDownNew` newly inherit B's stock transitions (including border/background/brightness); no new owned transition animates anything except opacity. Check load/console errors and actual control rendering in both lanes. Preview plate, popups and release/native gates remain slices 7–9; no performance claim is made.

## Implementation — slices 7–8 and live polish (2026-10-16)

- Controls, the row reset and ◆ now share one capped control line. Only that outer line is capped; its flowing control cannot reserve empty space before the actions. The first right-aligned 88px entry did not fix native value/unit spacing. After Main's live feedback, the entry is content-sized (stock 88px maximum) and left-aligned, with the unit flowing immediately after it in one tight right-anchored value group; the condition editor uses the same structure.
- The preview column has no background or dividing border and keeps its 110px top clearance. A passive `HPC3PreviewPlate` uses #59544C, 10px corners and `rough_edge_01_png` around the centred stage. A passive full-plate Image now fills it with stock `temp_preview_panel_subtitles_png` using `stretch-to-cover-preserve-aspect`, drawn below the stage. The transparent 1px stage border preserves the 284×298 HERO inner camera; `HERO_K`, `HERO_MODEL`, `ui-scale: 142%` and the live-proven white opacity-brush clipping guard are unchanged. `icon_mask03` remains only on that already-layered HERO frame, not the backdrop Image.
- Preview side/kind controls are native `SecondaryButton light` pills, with `fill` following `Selected`. The title uses the stock 24px bold #FFEFD7CC subsection style. Health is one row: a 100px label, stock slider capped at 240px and live value; the slider yields on narrow screens. PLAY DAMAGE / HEAL is now a native `SecondaryButton light fill` pill, including its STOP state, without the old green/amber overrides. Status and help use #FFEFD744 at 16px and 14px.
- All six dialog cards (reset page, preset delete, bundle replacement, hero, condition and picker) use rectangular `paper_tile_1k_02_dark_psd` cover, 24/28/16 padding, no mask and no owned transitions. Titles/subtitles/descriptions copy the specified stock typography and colours. The condition title is now simply CONDITION, with a dynamic uppercase setting/side subtitle; its existing description explains signature ability tiers without a redundant heading. Static actions and dynamic condition/hero choices use native `SecondaryButton light` pills; primaries and selected choices have `fill`. The hero list remains paginated and scrolls within a 280px height cap so the larger stock pills leave the close controls reachable.
- Each dialog retains its full-size Button backdrop and existing Cancel/Close button, and adds `HPColors<Dialog>EscClose` with a passive ESC key-cap. The new button calls the same existing cancel function: picker cancellation restores the opening colour and prior Undo, condition cancellation discards the draft, and destructive confirmations are cleared rather than retained. Ability slot art, tier cycling, tooltips and Apply/Remove behavior are unchanged.
- Nine new regressions cover clustered control/action allocation, tight value/unit containment, every dialog's stock chrome and dynamic pill state, all six EscClose routes (including nested picker/condition cancellation and stale confirmations), the stock preview backdrop/layer guard, preview pill selection, Health slider painting, Play/STOP pill styling and the split condition heading. Existing row, width-model and backdrop checks cover the new containment, percentage caps and all six dialogs.
- Review follow-up: hue-originated edits keep their actual ramp position, including the duplicate red at 920 and steps through it. Hex/picker edits, reset, Undo and preset application still reproject RGB onto the ramp. Invalid edits still restore the authored colour.
- Card pills now come from the group's available sides. Single-side groups have no pills and stay visible under either global side; search still collapses nonmatching columns. This covers Kill marker, Level, Stamina and Pulse HP modifier without presenting an empty Ally view.
- The menu-actions store mock now commits authored `config.rules`. A non-empty stored rule is checked across condition EscClose, keyboard Escape, card/preview side selection and menu close, then through the real storage fixture's disk write and restart. The existing nested-cancel regression also starts with an authored rule.
- [ENGINE.md](../ENGINE.md#inherited-stock-control-styles) now lists the inherited `SecondaryButton`/`DropDownNew` transitions and stock dropdown inset shadow. [AGENTS.md](../AGENTS.md#runtime-and-test-rules) distinguishes those exceptions from owned opacity-only transitions and glows.

Validation after live-feedback and review fixes: v3 **1,135/1,135 passed**; QOLLOCK **24/24 passed**, no skips. The final sequence passed canonical generation, the complete v3 suite, `generate.js --check`, QOLLOCK composition, `qollock.js --check` and the complete QOLLOCK suite. The stylesheet guard passed **671 rules / 3 files**, maximum **10 selectors**, with the 1,024-character cap enforced. The 284×298/142% geometry and white-brush clipping guards still pass. Context-mode's earlier run hit its 30-second RPC deadline; runnable evidence was collected through the normal execution tool.

Main's live check of build `a1899e6d` on client 6785 loaded without `Parsing error`, `FATAL` or `Uncaught`; Main confirmed ◆ placement after controls, styled preview pills and PopupPanel dialog styling. The number group, stock preview backdrop, Play/status/help and condition-heading follow-up above still need a fresh native check.

Live gates: load both lanes and check `Parsing error|FATAL|Uncaught`; confirm the stock backdrop and plate rough-edge mask compose with the HERO frame's `icon_mask03`/white opacity-brush without scene spill or altered camera framing. If the frame mask conflicts with clipping, replace only the vignette with a passive overlay above the scene; do not remove the layer-forcing brush. Also check native content-sized entry/unit spacing, party-icon clearance, Play/STOP pills and dim text, the condition subtitle, popup wrapping/list scrolling and close/backdrop behavior, including QOLLOCK Escape parity. This worker ran no builds, installation, launch or performance measurements; slice 9 and native acceptance remain open.

## Slice 9 — builds and live check (Main, 2026-10-16)

- All four builds passed with `-SkipDeploy`, each running the staged suite (v3 1,134; QOLLOCK 24):

  | Build | pak02 SHA-256 prefix |
  |---|---|
  | v3 debug | `59a2a8bf` (installed) |
  | v3 release | `28bf0cf5` |
  | QOLLOCK release | `316ad04f` |
  | QOLLOCK debug | `02fb786c` |

- Live on 6785 (Main self-test, debug builds `1fe65099` → `59a2a8bf`): no `Parsing error`, `FATAL` or `Uncaught` on load, menu open, sub-nav click, page switch, or condition dialog open/close.
  - Seen working: opaque stock backdrop; nav brush; sub-nav scroll with the Active card paper; stock rows with the hover wipe; toggles, radios, hue sliders with tinted thumbs, and number entries; Enemy/Ally pills, with single-side cards (Kill marker) showing none; ◆ after the controls; preview plate with the stock scene image; Play pill; PopupPanel-style condition dialog closed by ESC.
  - Screenshots: `.scratch/hpv3_t27/live_*.png`.
- Fixed live: `$.DispatchEvent("ScrollParentToMakePanelFit")` is invalid in 6785 (Uncaught), so the code now calls the guarded panel method. Before the opaque backdrop, the stock ESC menu and friends list showed through. The engine party icons draw above the menu at top right, so the preview keeps a 110px top clearance.
- Unexplained: a stored enemy `barColorHigh` rule present earlier in the day was absent after a later restart. Review found no ticket-27 path that drops rules except the intentional group reset (undoable until the menu closes). A new restart regression keeps a seeded rule. Recheck if it recurs.
- Not checked live: QOLLOCK Escape parity and both release paks; hue drag through the red stop; the vignette mask on the HERO frame in a hero match; narrow 4:3/5:4 layouts.

## Implementation — Round 2 live feedback (2026-10-16)

Audit scope: the reported `59a2a8bf` captures, the approved mock's relevant CSS, every generated page (Bar, HP Text, Name, Indicators, Units, Presets), both search side columns, every fold and all six dialogs. This was a source/cascade/VM sweep, not a new native visual sweep.

Defects found and fixed:

1. **Missing inner vignette and short hero bust:** `icon_mask03` used to mask only the stage-sized hero frame, leaving the backdrop untouched; that same frame's composition layer cut the bust off above the plate bottom. A passive, plate-inner-sized `HPColorsPreviewSceneWindow` now contains the backdrop and unchanged stage. It owns the icon mask, `overflow: clip` and the live-proven white opacity-brush guard. The plate has an 8px inset; stage and hero frame are unlayered/noclip. Unavailable-preview dimming also moved from stage to scene window so it cannot restore the short clipping boundary. HERO constants, model geometry, 284×298 inner stage and 142% camera are unchanged.
2. **Flat-cut toggle handle:** switches, both handle children, control lines, setting rows and SHOW BOUNDS rows explicitly allow noclip. All generated switches, including the condition dialog, retain their 20px circle and existing cross-fade/interaction behavior.
3. **Missing changed-state navigation:** page and sub-nav buttons now show a passive stock `icons/icon_star_white.vsvg` image, washed #5FE69E with a soft green `img-shadow`. The installed 6785 pak01 directory also contains `icon_star` and `icon_star_outline`; no font-glyph fallback is needed. Markers aggregate authored settings across all sides and levels, update through the existing mutation/replacement/boot sync (including reset, Undo, hydration, presets and hero routes), and avoid redundant class writes. Conditions remain the separate purple dot and do not falsely mark unchanged base values.
4. **Low search text:** removed the browser mock's asymmetric 6px top padding from the native fit-content TextEntry; text box and icon share vertical centring. Permanent search/filter behavior stays intact.
5. **Off-centre Play/STOP and sibling pill labels:** all owned stock-pill labels explicitly centre vertically/horizontally with zero inherited bottom margin, including preview/card pills, static/dynamic dialog actions and preset actions.
6. **Detached numeric values:** number and colour groups now use native right-flow, yielding sliders and a common 16px slider-to-value/swatch gap instead of right-anchored overlays/reserved margins. Number and unit remain tightly grouped; hex follows the swatch by 8px. The condition number editor uses the same fix.
7. **Uneven radio spacing:** content-sized radio choices and labels replace equal fill shares; choices have a consistent 24px gap and centred circles/labels.
8. **Tiny, left-shifted green folds:** fold headers use the row's 32px inset, 32px click height and readable 18px stock block subsection typography, with neutral open-state colour rather than legacy green microtext. Chevron/label children are passive; open/collapse/search bypass behavior is retained.
9. **Tiny supporting text:** page descriptions/no-results copy are 18px; sub-nav, search side headings/counts, preset metadata/status/help/code entries, SHOW BOUNDS copy and preview note are at least 16px. Bounds label gets explicit switch clearance. Long sub-nav labels retain a bounded shrinking width so the star has room.
10. **Leftover old-v3 Presets styling and crowded columns:** static and dynamic actions now use stock `SecondaryButton light` pills rather than tiny green boxes. Default selection uses native `fill` consistently, including Undo. Preset entries fill their cards; action rows are split to at most four buttons, the new-name entry gets its own row, and share-code entries/help use full width above their actions. Legacy preset border boxes become stock paper surfaces. Generated/dynamic action labels and hero metadata are passive.
11. **Dialog clipping and misaligned fields:** all six cards have viewport-relative width/height caps and vertical scrolling, with a smaller but consistent Close gap so enlarged text cannot strand actions offscreen. The condition subtitle wraps instead of shrinking long setting names into tiny text; picker hex and condition switch are centred; condition swatch/hex have explicit separation. Condition tier labels are 16px with 136px slots so the tier line is not clipped.
12. **Fold counts included the hidden side:** folds now carry passive label ids and their row/side membership. Initial counts include the selected side plus shared rows, retain single-side-card visibility, and recount on side/search changes. Search counts both matching sides rather than the hidden tab selection; unchanged labels are not rewritten. The reported Units Basic case now reads **4**, not 6, on Enemy.
13. **Presets top block missed the row inset:** identity, new-name entry, Save/Restore and status share one 32px-inset header; pagination uses the same inset. Existing preset contents and share-code rows retain their 32px inset.
14. **Disabled pills were almost invisible:** disabled owned `SecondaryButton`s use 0.35 opacity, brightness 1, an explicit neutral outline and a readable label. Their disabled behavior and separate footer dimming are unchanged.
15. **Units showed HERO-only help:** the preview note is now generic across all kinds, without a HERO bounds claim or a misleading fixed-team claim for neutrals.

Regression coverage exercises each real setting control's page/group marker and reset, hidden-side/advanced aggregation, Undo/group reset/hydration, condition-dot independence, preset/automatic hero routing, unchanged-sync write suppression, toggle containment in both states, all slider/value groups, radio spacing, folds/search typography and behavior, stock static/dynamic preset actions, DEFAULT selection/Undo, all six dialog bounds and field alignment. Existing preview clipping guards now require the larger scene-window ancestor, disallow stage/frame layers and retain the camera/zoom/lifecycle checks.

Validation: canonical generation, the complete v3 suite (**1,147/1,147 passed**, 12 new tests), `generate.js --check`, QOLLOCK composition, `qollock.js --check` and the complete QOLLOCK suite (**24/24 passed**) all passed, with no skips or cancellations. The stylesheet guard passed **678 rules / 3 files**, maximum **10 selectors**, enforcing the 1,024-character ceiling. The width fixture now resolves percentage max-width against the containing box (rather than treating the new dialog cap as zero); the remaining old direct-stage-parent assertion was updated to the shared scene window. Context-mode's batch exceeded its 30-second RPC deadline; its recovered output exposed those two stale fixture assumptions. After correcting them, the complete required sequence was run successfully through direct Node execution.

Main's subsequent live check of canonical debug `08ff2136` on **6785** reported no `Parsing error`, `FATAL` or `Uncaught`, and confirmed the vignette, longer bust, full switch circles, centred search, glowing stars, readable folds and radio spacing. Captures: `.scratch/hpv3_t27/audit/r2_*.png`. Items 12–15 were found in that check and fixed afterward; their native recount/inset/disabled-pill/help acceptance remains pending.

Follow-up validation: four additional behavioural tests cover side/shared/single-side/search fold recounts (including Units **BASIC · 4**), common Presets insets, readable but still-disabled pills, and generic help across HERO/NPC/neutral/objective switches. The old exact HERO-help assertion was removed while preserving its team-high colour-precedence checks. The complete final sequence passed: canonical generation, v3 **1,151/1,151**, `generate.js --check`, QOLLOCK composition, `qollock.js --check`, QOLLOCK **24/24**; no skips/cancellations. CSS guard: **682 rules / 3 files**, maximum **10 selectors**, 1,024-character limit enforced.

Native gates: Main must build/load both lanes, inspect `Parsing error|FATAL|Uncaught`, and verify icon-mask/white-brush composition and the actual splotchy inner edge, full bust down to the scene bottom without spill, unchanged camera/zoom, full toggle circles, green star/glow visibility against selected/unselected brushes (including long sub-nav labels), native flow/entry/unit columns, search baseline, Play/STOP/pill baselines, radio gaps, folds and supporting text. Repeat the complete page/search/six-dialog sweep at normal and narrow 4:3/5:4 sizes, including scrolling/Close, native picker, hero assignments and QOLLOCK Escape/background parity. No builds, installation, game launch or performance measurements were run by this worker.

## Round 2 builds and live check (Main, 2026-10-16)

| Build | pak02 SHA-256 prefix |
|---|---|
| v3 debug | `879ee0eb` (installed) |
| v3 release | `7c0c962e` |
| QOLLOCK release | `104f20a6` |
| QOLLOCK debug | `a7abf616` |

All four builds passed; each ran its staged suite (v3 1,150; QOLLOCK 24). Live on 6785 with no Parsing error, FATAL or Uncaught, these are seen working: the preview vignette, the hero clipped at the plate edge, full toggle circles, centred search, changed-stars with glow, folds counting the selected side, radio spacing, one inset on Presets, disabled pills, and the generic preview help. Screenshots: `.scratch/hpv3_t27/audit/r2_*.png`, `r3_*.png`. Still not live-checked: QOLLOCK, the release paks, sub-nav stars on a changed group, narrow aspect ratios, and every dialog except the condition dialog.

## Implementation — Round 3 (2026-10-16)

This round supersedes the earlier paginated Presets/Heroes presentation and PopupPanel dialog styling. Preview geometry and `preview.js` are unchanged.

- **Title-row alignment:** group resets and side tabs are vertically centred, with the existing 12px title/reset gap. Removed the side pills' extra top/bottom margins; fold labels/chevrons retain their common centre line.
- **Portrait data and hero selector:** `tools/game-data.js` derives `portrait` directly from `m_strIconImageSmall`, never a hero-key filename. The unchanged 45-hero roster mounts once per dialog open, plus a first gear tile for “Default for unassigned heroes.” Artist/Nurse null portraits use the verified `no_hero_png.vtex` fallback. Multi-select Buttons retain toggle/transfer semantics; the gear changes only `heroDefault`, never explicit mappings. Selected heroes have green circles, visible names/checks and stock pulses; other owners have a corner dot and owner tooltip on hover/focus. Search dims rather than removes tiles, reports matching heroes/no results, and uses the guarded native panel scroll method for the first match.
- **Preset library:** a bounded wrapping grid contains compact labelled rectangles, with the baked gear tile first when visible. Clicking selects for actions only. Selected/check, APPLIED/source and default/star markers are separate. One name editor and eight glyph actions operate on the selected id; rename/reorder/hydration preserve that selection and the existing tile/scroll container. Moves reveal the selected tile without resetting the scroll position on unrelated refreshes. Existing tiles are adopted and callbacks rebound on script reinclusion; removed dynamic tiles are not retained by the tooltip cache. Baked HIDE/RESTORE, export-only COPY, destructive deletion and all routing/storage semantics remain intact. Removed both pagination systems.
- **Glyphs:** APPLY, RENAME, UP/DOWN, COPY, DELETE/HIDE, HEROES and DEFAULT use the specified stock assets. SAVE NEW uses verified `icons/icon_add.vsvg`; RESTORE DEFAULT uses `icons/reset.vsvg`. Settings/bundle COPY and IMPORT use copy/paste symbols; REPLACE ALL remains explicit text. Every glyph has action-name tooltips on hover and focus, with readable dim disabled states and a visible DEFAULT toggle.
- **Six notice dialogs:** reset page, delete preset, bundle replacement, Heroes, Condition and Color now have passive masked paper/shadow siblings and 24px/48px content padding, icon/Oracle headers and centred body text. Confirmations are 640px; picker/condition retain 600px widths, viewport caps and scrolling. Static subtitles are removed; the informative condition subtitle remains. Actions use the native Bottom/Top/Content hierarchy, rounded green CTA primaries, ordinary InputButton secondaries and Warning destructive confirmations. DELETE/REPLACE ALL retain explicit labels and initial Cancel focus. Escape, backdrop absorption, nested picker cancellation, Undo and focus return remain covered.
- **Requested stock motion:** the six prefixed keyframes and `.98` active-state scale are the exact exceptions documented in [AGENTS.md](../AGENTS.md#runtime-and-test-rules) and [ENGINE.md](../ENGINE.md#inherited-stock-control-styles). Landing animation targets the card title, not the card. Rejected import/hex/number commits shake the field while retaining error feedback; intermediate condition keystrokes do not shake. Invalid picker DONE stays open. Owned transitions still animate opacity only.

Files: `tools/{menu-layout,game-data}.js`; `panorama/scripts/hp_colors_v3_menu.js`; `panorama/styles/hp_colors_v3_menu.css`; canonical generated catalog/id/menu/runtime/layout outputs; `tests/{menu-actions,menu-audit,menu,theme,hero-routing,ability-conditions,game-data,storage}.test.js`, `tests/style-cascade.js` and new `tests/preset-controls.js`; `AGENTS.md`, `ENGINE.md` and this ticket. Refreshed QOLLOCK's two composed layouts through `node hp_colors_rewrite_v3_qollock/tools/qollock.js`, without hand-editing that lane.

**Asset evidence:** read-only installed archive listing via `.tmp/vrf-cli-20.0/Source2Viewer-CLI.exe -i G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/pak01_dir.vpk -l`. All **92** distinct menu/static/visible-portrait/CTA references checked against its entries exist, including all 43 visible small portraits and the gear/fallback, notice masks/paper, action glyphs and inherited CTA dependencies. A separate comparison found no missing non-null portrait assets anywhere in the full 67-hero catalog. The additional SAVE NEW asset is `panorama/images/icons/icon_add.vsvg_c`. Artist/Nurse have null small-portrait fields, not unresolved referenced paths. No asset verification gap remains.

**Validation:** canonical generation and `generate.js --check` passed; full v3 **1,162/1,162** (11 new tests), QOLLOCK composition and `qollock.js --check`, and full QOLLOCK **24/24** passed, without skips/cancellations. The CSS guard checked **737 rules / 3 files**, maximum **10 selectors**, enforcing the 1,024-character ceiling and mask restrictions. Regression coverage includes non-applying tile selection, selected glyph actions, identity-preserving rename/reorder/hydration/reinclusion, source/default markers, baked hide, hero transfer/default gear, portraits/fallbacks, dim/count/scroll search, all six dialog chrome/cancel/focus paths and rejected-import shake. Test-only CSS resolution now ignores keyframe stops as selectors and models `:not()` for search dimming. Context-mode's full-suite subprocess exceeded its deadline; complete runnable evidence came from normal Node execution.

All specified source/VM work is implemented. No build, pack, deployment, game launch or performance measurement was run. Main still owns native acceptance: both lanes' load/console check (`Parsing error|FATAL|Uncaught`), actual mask/CTA/keyframe rendering, the 128-preset scroll case, the 45-hero grid and keyboard/tooltips, narrow layouts, every dialog, and QOLLOCK Escape/background parity. VM and installed-path evidence do not prove native appearance or runtime cost.

### Round 3 — audit and live polish

The user/Main live check of debug `2d63b739` on 6785 reported no console errors and confirmed the notice chrome, selected-hero pulse, glyph tooltips and centred card reset. This follow-up implements every required audit fix and the reported visual polish:

- **Atomic selection:** SAVE NEW and RESTORE DEFAULT change selection only after storage accepts. Refused saves leave the existing tile, toolbar and new-name draft intact. REPLACE ALL resyncs APPLIED after assigning the new source id. Hiding the last visible preset produces an explicit empty selection, blank disabled rename entry and disabled glyphs; RESTORE DEFAULT and SAVE NEW remain available.
- **Validation and CSS:** invalid picker hex survives blur, so the native blur-before-DONE order cannot bypass rejection. Owned `offBlack`/`colorEnemy` uses are now `#10130D`/`#FF410D`; the generator rejects unresolved colour macros in owned colour, border, gradient and shadow declarations. Play's active rule targets the real `HPC3PlayButton`.
- **Hero picker:** 80×68 tiles fit five columns inside a 440px grid cap, including padding and scrollbar clearance. The 356px height cap admits roughly five rows; the notice retains its viewport cap and scrolling. Search has the stock search image, centred text, “Search heroes” placeholder and unchanged match count. The sole action is green DONE. All six notice ESC-binding rows collapse; keyboard Escape still uses the existing cancellation routes.
- **Centred art and owned dots:** portraits and the gear are siblings of their circles, sharing both centre alignments instead of inheriting the circle's padded content box. Selected sizes remain 56px/44px. Assignment dots are 8px, anchored 4px from the top-left inside a centred circle-sized passive wrapper above the portrait. The gear never shows another-owner dot; when selected it has the stock green state and the visible name “Default,” with “Default for unassigned heroes” on hover/focus.
- **Glyphs and entries:** preset actions now use 40×40 circular native `InputButtonBorderRadius` Bottom/Top/Content layers, with centred icons; APPLY alone adds `Fill CTA`. The new-name row is `[entry][+][reset]`; code rows are `[entry][copy][import]` plus explicit REPLACE ALL for bundles. The selected-name entry retains a left-aligned wrapping glyph row below it for narrow layouts. HEROES and the dialog header both use the user-requested `main_menu/icons/menu_heroes.vsvg`, with aspect-preserving scaling (Main verified the compiled asset in pak01 6785).
- **Library and focus:** names are centred, uppercase 18px bold Oracle with shrink overflow. Main switched the name from `width: 100%` to `max-width: 100%` plus `horizontal-align: center`, because a full-width label rendered left-aligned in game. APPLIED/check and default/star are small, separate top-right Images. Unselected faces use the stock dark radial gradient and a `#FFEFD711` border; selected faces stay green. `LIBRARY · n/128` counts saved user presets. Returning to a dialog opener uses real focus only. When focus moves away, its focus styling clears, and no Selected/Checked/hover class is left behind.

Tooltip placement is deliberately unchanged: the existing `UIShowTextTooltip` helper exposes no verified placement option, and the stock `TooltipPosition*` classes found in extracted assets belong to tooltip surfaces, not action buttons. The requested fallback applies; hover and keyboard-focus tooltips remain intact rather than guessing an engine API.

Files: `tools/{generate,menu-layout}.js`, `panorama/scripts/hp_colors_v3_menu.js`, `panorama/styles/hp_colors_v3_menu.css`, `tests/{generator,menu-actions,theme}.test.js`, generated menu/id/runtime/layout outputs, this section and [ENGINE.md](../ENGINE.md#inherited-stock-control-styles). QOLLOCK is refreshed only through its composition tool. Preview geometry and `preview.js` remain untouched.

**Polish validation:** canonical generation and `generate.js --check` passed; QOLLOCK composition and `qollock.js --check` passed. The final complete suites passed **v3 1,173/1,173** (11 added regressions) and **QOLLOCK 24/24**, with no failures, skips or cancellations. The CSS guard passed **743 rules / 3 files**, maximum **10 selectors**, with the 1,024-character limit, mask restrictions and new colour-macro guard enforced. Context-mode's full-suite call exceeded its 30-second transport deadline; the complete v3 suite was rerun successfully through the normal execution tool, including the final portrait/glyph changes.

No build, pack, deploy, game launch or performance measurement was run. All required source items are implemented, including the two additional user reports; only the expressly optional top-placement tooltip change uses its allowed fallback. Main still owns fresh native loading/console checks and visual/keyboard acceptance in both lanes, especially five-column scrolling at normal and narrow viewports, portrait/dot centring, circular CTA masks, long library names/markers and QOLLOCK Escape/background parity.


## Round 3 builds and live check (Main, 2026-10-16)

Main applied these fixes after live checks:
- **Hero grid:** the grid is a fixed 356px tall. With only a max-height, the 6785 grid failed to clip its `overflow: noclip` tiles on first open, and the sixth row painted over DONE until the user scrolled. A ScrollToBottom/Top nudge did not help. A solid-white `opacity-brush` on the grid forces a composition layer and fixes the clipping; this is the same rule as the scene-panel clipping in [ENGINE.md](../ENGINE.md). The nudge was removed.
- **Disabled glyphs:** stock collapses `.Top` and sets `.Bottom` to opacity 0.2, so a disabled glyph lost its circle (UP on the first tile). Owned overrides keep the Bottom ring at `#FFEFD744`; the whole button still dims to 0.35.
- **Assignment dot:** the anchor's `z-index: 1` was dropped. Paint order now comes from sibling order, and the test asserts that order instead of the z-index.

**Live check of debug `25f4b8a4` (md5) on 6785.** Fresh launch, `-windowed -res 1600x900`; `console.log` had no Parsing error, FATAL or script errors.
- **Presets page:**
  - Tile names are centred.
  - Glyph row: green APPLY, plus RENAME, UP (disabled but still a circle), DOWN, COPY, DELETE, HEROES (`menu_heroes` glyph) and DEFAULT.
  - Inline `[entry][+][reset]` and `[entry][copy][import]` rows, with REPLACE ALL.
- **Hero picker:**
  - Notice chrome, with the `menu_heroes` header icon.
  - Five columns, with portraits centred in their circles.
  - Assigned heroes (Abrams, Graves) show green with their names.
  - The gear tile comes first and Artist/Nurse use the `no_hero` fallback.
  - The grid clips on first open, with a single green DONE.
  - Searching "ra" gives 7/45 and dims non-matches.
- **Delete dialog:** notice chrome, red DELETE and CANCEL, no ESC row.

Not live-checked: the QOLLOCK variant, the bundle-replace, reset-page, condition and colour dialogs in round-3 chrome, keyboard-only traversal, and the 4:3 aspect.
