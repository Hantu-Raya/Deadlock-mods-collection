# Deadlock engine evidence

Evidence is scoped to the named build and observation. **Live** means observed in the game; **RE** means static binary inspection; **VM** means a synthetic regression or inherited engine assumption, not native verification. The current source pin is ClientVersion **6790** ([pin](game-data-pin.json)). Consult [LIVE-VERIFIED.md](LIVE-VERIFIED.md) before claiming native acceptance.

## World healthbars

| Fact | Build and evidence | Confidence boundary |
|---|---|---|
| Primary lineage is `UnitHealthbarsContainer` → direct `UnitHealthbar.UnitHealthbarContainer` → direct `UnitHealthbarInner`. `UnitShieldbar` contains duplicate ids and is not the primary bar. | 6790-pinned fixtures: [renderer suite](tests/renderer.test.js); inherited [v2 guidance](../hp_colors_rewrite_v2/AGENTS.md#runtime-rules). | VM / v2 carry-forward; the original native observation's build is not recorded here. v3 recycle/reparent acceptance remains open. |
| The logical world canvas is about 200×210 CSS px (`citadel_unit_status_width/height`, observed window scale 2.0). Full-canvas noclip rebasing works; a transformed compact frame clips its noclip children. | v2 live commit `bf49089`, game build unrecorded: [v2 canvas evidence](../hp_colors_rewrite_v2/AGENTS.md#editor-and-canvas). 6790-pinned [renderer geometry fixtures](tests/renderer.test.js). | Prior v2 live / v3 VM; not proof of unlimited engine drawing. |
| `UnitHealthbarValue` has a pointer-bound native health binding. Reparenting with `SetParent` preserves that binding; a second `{d:health}` label does not update. | Prior v2 evidence, original build unrecorded: [v2 guidance](../hp_colors_rewrite_v2/AGENTS.md#runtime-rules); 6790-pinned [renderer fixtures](tests/renderer.test.js). | V2 carry-forward / VM; v3 native adoption, release and recycle are still owed in [ticket 11](issues/11-live-test-1-core.md). |
| Health fraction is available through `unit_healthbar_lagging` fill signals. Each `actual*` geometry read must be divided by that panel's own axis UI scale, not another panel's scale. | 6790-pinned [renderer fixtures](tests/renderer.test.js); prior v2 geometry evidence (6726) in [v2 guidance](../hp_colors_rewrite_v2/AGENTS.md#runtime-rules). | VM / inherited geometry evidence; not a fresh v3 live scale matrix. |
| The native fill clip can include trailing whitespace, e.g. `rect( 0.0%, 86.622070%, 100.0%, 0.0%) `. | **6779, live 2026-10-14**: [ticket 11 findings](issues/11-live-test-1-core.md). | Live; a parser must tolerate padding. |
| World contexts can have shallow fact carriers: five `client_ui_panel` at depth 1 and six other world panels at depth 2 were observed. | **6785, live 2026-10-15**, debug `ad6ff1c6`: [ledger](LIVE-VERIFIED.md), [ticket 11](issues/11-live-test-1-core.md). | Live sandbox only; deeper chains and real-match distributions were not measured. |
| World panels may be recycled between unit kinds without a generation change. There are no health/layout change events used by this flow; polling is needed. Lane trooper healthbars are engine-drawn, not customizable Panorama bars. | 6790-pinned [renderer recycle tests](tests/renderer.test.js); inherited [v2 runtime evidence](../hp_colors_rewrite_v2/AGENTS.md#runtime-rules), original native build unrecorded. | VM / v2 carry-forward, not newly live-verified in v3. |

### Native health-layer lifetime

- **6782, RE:** full-width layers share a percent-clip cursor, in order: lagging, deferred, healing, `bullet_shield` (barrier), `ratking_armor`, delta. A zeroed layer loses `HasHealth` but retains a stale clip. The displayed total is `max(max HP, HP + barrier + delta)`; the `client.dll` line builder at RVA **`0x1bf1590`** deletes surplus `UnitHealthbarLines` children as that total drops. Source: the 6782 binary RE originally recorded in PLAN §3, relocated here; regression coverage is in the [renderer tests](tests/renderer.test.js).
- **6782/6785, live 2026-10-15:** a native setter on a deleted line panel throws **“Underlying panel is deleted!”** during Celeste barrier changes. The user verified that the corrected debug bar stays styled; screenshots `20261015170130_1.jpg` and `20261015170138_1.jpg` are recorded in the [ledger](LIVE-VERIFIED.md). Layer arithmetic and every deletion path are RE/VM evidence, not all independently live-proven.

## CSS and compilation

| Fact | Build and source | Evidence level |
|---|---|---|
| A **37-selector / ~2.9 KB** selector list compiles but fails at runtime with **“Failed to parse selector”**, aborting Escape-menu layout loading. The generator's conservative guard is a project ceiling, not a discovered exact engine threshold; its normative limits are in the [CSS contract](AGENTS.md#runtime-and-test-rules). | **6782, live 2026-10-15**: [ticket 22](issues/22-styling-show-bounds-and-own-hud-color.md). Guard: [generate.js](tools/generate.js). | Live failure; VM/build guard prevents recurrence. |
| `opacity-mask: none` does **not** cancel an earlier mask declaration; the successful correction removed the original declarations. | **6782, user live observation 2026-10-15**: [ticket 19 live report](issues/19-styling-bar-style-v2-and-old.md#live-6782-stock-mask-stayed-on-v1old), [cascade regression](tests/style-cascade.js), [generator guard](tools/generate.js). | Live; compile success alone did not detect it. |
| Empty-string inline clears can throw **“Failed to parse style value”**, including `textShadow`. Native clearing/restoration behavior is captured by the [restoration contract](SPEC.md#renderer-restoration-contract). | **6779, live 2026-10-14**: [ticket 11](issues/11-live-test-1-core.md); [renderer tests](tests/renderer.test.js). | Live text-shadow failure; shorthand behavior retained from v2 and modeled in VM. |
| `horizontalAlign` is a style alias; clearing it can throw **“Cannot set a property alias to undefined, only a base property”**. The repaired paths used explicit stylesheet alignment. | **6782, live finding**: [ticket 22](issues/22-styling-show-bounds-and-own-hud-color.md); [renderer regression](tests/renderer.test.js). | Live alias failure; other alias guards are VM coverage. |
| `backgroundSize` is a layer alias of `backgroundImage` (panorama.dll describes the image as “combined with background-position, background-size, background-texture-size and background-repeat”). Clearing it alone throws the alias error; reading `backgroundImage` back from a panel with inline layer longhands returns the whole layer (`url( … )  / 100.0% 100.0% unset unset`), and writing that back throws **“Invalid value for property 'background-image'”**. The renderer clears the layer through `backgroundImage = null` and strips the suffix when capturing stock values. Before the fix, HERO → UNITS released the pickup tracks, the throw left the UNITS preview at “Preview unavailable” and it stopped following its toggles. | **6785, live 2026-10-16** (debug console `preview paint failed`; user report 2026-10-15): [renderer](panorama/scripts/hp_colors_v3_renderer.js) `writeStyle`/`claim`; VM model in [boot-layout.js](tests/boot-layout.js). | Live failure and live fix; layer grouping of the other longhands is modelled, not live-proven. |
| A content-sized (`fit-children`) `TextEntry` draws its text from its own left edge whatever its padding, and `text-align: center` has no effect; a fixed-width entry honours padding but still left-aligns. Row values therefore sit in a padded `.HPC3EntryBox` around a bare content-sized entry. | **6785, live 2026-10-16** screenshots during the entry-centring fix (`.scratch/hpv3_issues_1015/`). | Live. |
| Source 2 compilation accepts unknown CSS properties and XML elements; a clean compile does not establish visual correctness. | 6790-pinned [generator tests](tests/generator.test.js); earlier compiler experiment in [ticket 11 prototype](tickets/11-generated-menu-compile.md), game build not recorded for that experiment. | Compiler/test evidence only. |

Owned colour declarations use hex literals (or the checked native colour/function keywords), not the base sheet's colour macros. `generate.js --check` rejects unresolved identifiers in owned colour, border and shadow values, including gradients; the generated stock sheet keeps its own pinned definitions. [Generator regressions](tests/generator.test.js) enforce this asset contract.

### Inherited stock control styles

[Ticket 27](issues/27-stock-settings-theme.md) reuses these base-sheet styles; they are exceptions to the owned opacity-only transition rule:

- `SecondaryButton`: background colour, wash colour and border; its Label transitions colour and wash colour.
- `DropDownNew`: brightness on its Border, Label and Arrow. Its Background also retains the stock inset shadow, not an owned glow.
- Notice action buttons use the native `InputButtonBorderRadius Fill CTA` / `Warning` or `InputButton Fill` Bottom/Top/Content hierarchy. The rounded control inherits border-radius, opacity and opacity-mask transitions on its layers and paper backgrounds (B:912–1003, 1351–1366); the ordinary InputButton retains its native layer styles.
- Preset glyphs use the same rounded Bottom/Top/Content layers, with fixed 40×40 circular radii (including hover) and zero Content padding; only APPLY adds `Fill CTA`. The stock layer mask/opacity transitions remain inherited; no new owned transition is introduced. Both notice actions and glyphs neutralize the inherited active transform so it does not multiply the owned `.98` active scale.
- **6785, live 2026-10-16:** a disabled stock `InputButtonBorderRadius` collapses `.Top` and dims `.Bottom` to 0.2 (B:1381–1430), so a disabled glyph lost its circle. Owned overrides keep the `.Bottom` ring at `#FFEFD744` and the Image visible, and the whole button dims to 0.35. Source: [ticket 27 round 3 live check](issues/27-stock-settings-theme.md#round-3-builds-and-live-check-main-2026-10-16).

Source: `.scratch/stock_6774/panorama/styles/citadel_base_styles.css` (B), lines 912–1003, 1351–1366, 1640–1667 and 2815–2895. Existing preview/play exceptions remain in [ticket 22c](issues/22c-preview-hero-model.md#fixes-after-audit). Owned transitions remain opacity-only.

**User-requested round-3 keyframe exceptions** (VM/source evidence, not native acceptance): `hp_colors_v3_menu.css` owns only these prefixed copies, with stock colour macros replaced by hex:

- `HPC3HeroNoticeBackgroundTransitionOn`: notice card/background/shadow mask threshold 100%→2%, 0.25s once. Source: `.scratch/stock_6774/panorama/styles/popups/popup_hero_settings_notice.css`:14–16, 146–158.
- `HPC3SelectedHeroAnim` and `HPC3SelectedHeroNameAnim`: selected hero circles/preset faces and their names, 2s infinite brightness/box-shadow and text-shadow pulses. Only open menu/page/dialog surfaces animate; nonmatching hero search tiles suppress the animations. Source: `.scratch/hpv3_live1/stock_preview/popup_settings.css` (S):278–315, 360–386. The stock selected-circle and assignment-dot shadows are part of this selector treatment, not a general glow permission.
- `HPC3SearchResultSelectedAnimation`: landed card title only, 0.5s twice after 0.1s; retrigger through guarded `TriggerClass` or next-frame remove/add. Source: S:122–143, 1706–1737.
- `HPC3NegativeShake`: rejected hex/number commits and failed code imports only, ±2px at 0.06s four times; never intermediate keystrokes. Source: S:1798–1803, 3848–3867.
- `HPC3GlowSearchInput`: focused menu search only, 1s alternating box-shadow/border pulse after 0.1s. Source: S:233–245, 858–865.

The requested `.98` active-state scale is a state rule, not a transform transition (S:1516–1519; B:1369–1373). These exact user-approved copies supersede ticket 27's initial static-animation restriction; they do not authorize other owned transitions, animations or glows. Native loading, animation appearance and portrait-grid cost remain unmeasured.

## Scene panels

### Attributes and scene choice

- **6782, RE:** `CitadelHeroScenePanelNew` registration at RVA **`0x1db4d0`** points to the attribute list at **`0x1da3c0`**. Setter **`0x1d5a6e0`** handles `heroname`, `heroid`, `heroscenestyle`; hero id is stored at panel `+0xf0`, style at `+0xf4`, dirty flag at `+0x110`. The nearby `hero` string belongs to a spawned entity's `host_name`, not the hero-selection attribute. Source: [ticket 22c RE](issues/22c-preview-hero-model.md#answers-previewheromodel-2026-10-15).
- **6785, independently RE-confirmed:** registration **`0x1db4d0`**, setter **`0x1d5aea0`**, update **`0x1d653a0`**, enum table **`0x2c05740`**. Shop/Profile select VData `+0x8d8` and `point_camera`; Portrait/HeroReveal select `+0x8d0` and `portrait_camera`; TeamReveal uses `+0x8e0`/`point_camera`; PostGamePortrait uses `+0x8e8`/`portrait_camera`. Explicit map/camera are replaced on that dirty-update path. These addresses are build-specific. Source: [independent RE](issues/22c-preview-hero-model.md#independent-re-verification-clientversion-6785).
- **6785, live 2026-10-15:** **`heroid="1"` is required for the tested Infernus preview**; `heroname="hero_inferno"` alone renders nothing in this context, despite the earlier RE inference. The minus-one strip rendered without `renderdeferred`, antialias/shadow attributes or `rotate`. Source: [ticket 22c](issues/22c-preview-hero-model.md), live checks 2–4. The tested Shop combination retains `heroname`, `heroid`, style, map and camera; their presence is not proof that every attribute is required.
- **6785, RE plus live strip:** `renderdeferred` and `antialias` are not scene-panel attributes; the hero subclass adds the three attributes above, and the base supports the rotate family and `rendershadows`/`pitch`. Source: [ticket 22c](issues/22c-preview-hero-model.md), “Camera/scene attribute RE” and live checks 3–4.

### Clipping and lifetime

- **6785, live 2026-10-15:** scene renders ignore ordinary scissor clipping: `overflow: clip` and `clip: rect()` on the scene or an unlayered parent did not contain the render. A parent with `overflow: clip` plus **`opacity: 0.999`** or a solid-white **`opacity-brush`** did. `background-color: #00000001` alone failed. A self hard-stop opacity brush masked the scene; `panel://` image/background copies rendered when the source was layered. Source: [live check 8](issues/22c-preview-hero-model.md#live-check-8-passed-main-self-test).
- **6785, live 2026-10-16:** the same layering also fixes ordinary scroll panels.
  - **Symptom:** the hero-picker grid (`overflow: squish scroll`, `max-height` only) did not clip its `overflow: noclip` portrait tiles on first open. The sixth row painted over DONE until the user scrolled.
  - **No effect:** a `ScrollToBottom`/`ScrollToTop` nudge after opening.
  - **Fix:** a fixed `height` plus a solid-white `opacity-brush` on the grid.
  - Source: [ticket 27 round 3 live check](issues/27-stock-settings-theme.md#round-3-builds-and-live-check-main-2026-10-16).
- **6785, live 2026-10-15**, debug `92b81f54`: native world/material snapshots showed no model draw while collapsed on a non-HERO page; the five-object scene stayed loaded there, and the shop map unloaded when the menu closed. Boot before first show had an empty scene shell. **Zero total hidden update/simulation cost is not proven.** Source: [Performance](issues/22c-preview-hero-model.md#performance-live-main-self-test-2026-10-15), [ledger](LIVE-VERIFIED.md).
- **6785, live measurement 2026-10-15:** the earlier 596×685 preview added about **0.21 ms** average frame time in its recorded PresentMon ABBA against render callbacks off. The later 352×405 panel's effect was below that run's noise. Neither result generalizes to all resolutions or in-match FPS. Source: [ticket 22c performance and live check 10](issues/22c-preview-hero-model.md), retained `.scratch/hpv3_perf22c/` artifacts.

## Local-player HUD paths

These paths are inherited from v2, implemented and VM-tested against **6790-pinned v3 fixtures**. They are **NOT re-verified live in v3**; no original v2 live build is established by these sources.

| Observation used by the watcher | Source and evidence |
|---|---|
| `#TopBar` → descendant `.LocalPlayer` card → `#PlayerNameNWContainer` → descendant `.HeroName` label supplies the local hero's display name or localization token. `.LocalPlayer` and `.HeroName` are classes, not ids. | [v2 menu](../hp_colors_rewrite_v2/panorama/scripts/hp_colors_v2_menu.js), [v3 menu](panorama/scripts/hp_colors_v3_menu.js), [ticket 23](issues/23-hero-detection-and-hero-preset-routing.md), [routing VM tests](tests/hero-routing.test.js). |
| Local `#hud_signature` → `#abilities` → direct `#slot_signature_1` … `#slot_signature_4` supplies signature tiers through `Tier0` … `Tier3` classes. The highest present class is used; absent/invalid is −1, and spectator mode is not a valid local tier source. | [v2 menu](../hp_colors_rewrite_v2/panorama/scripts/hp_colors_v2_menu.js), [v3 menu](panorama/scripts/hp_colors_v3_menu.js), [ticket 24](issues/24-ability-conditions.md), [conditions VM tests](tests/ability-conditions.test.js). |

## Context communication and HTML storage

- **6779, live 2026-10-14:** the Escape context has no `GameUI`; `ClientUI_FireOutput` publication works there. Source: [ticket 11 findings](issues/11-live-test-1-core.md), [ledger](LIVE-VERIFIED.md).
- **6790-pinned VM / v2 carry-forward:** a unit-status `ClientUIDialogPanel` cannot be treated as the same output surface; configuration requests use a sibling relay. Source: [v2 runtime rules](../hp_colors_rewrite_v2/AGENTS.md#runtime-rules), [v3 relay layout](panorama/layout/unit_status_overlay_v2.xml), [renderer VM tests](tests/renderer.test.js). Original native build is unrecorded; this is not new v3 live acceptance.
- **2026-10-01 gate, initial build unrecorded:** `CitadelHTMLPanel.SetURL` accepts case-insensitive **`https://`** URLs; other schemes become `about:blank`. The native panel has no script-execution method; `HTMLTitle`/`HTMLURLChanged` remain usable. Source: [v2 storage evidence](../hp_colors_rewrite_v2/AGENTS.md#durable-save). **6785, live 2026-10-15** confirms the positive HTTPS page path and save/restart on debug `6295843a` ([ledger](LIVE-VERIFIED.md)); it does not separately retest every rejected scheme.

## VM audit mechanisms (2026-10-16)

These are implementation constraints and synthetic evidence, not new native-engine findings:

- Preview ancestry is memoized only within one paint. Renderer validity and per-axis UI scale are shared only within one measurement; neither may survive into the next sample.
- Unrelated menu publications skip own-HUD resolution. The independent one-second watch still checks the complete ancestry, including the HUD root's link.
- Topbar structure/configuration reconciliation is separate from ring progress. Artwork recreation clears its style/structure caches. Retirement and stop share a same-context card-lease registry; independent cleanup retries failed parent/order/alignment restoration even while both timers are disabled, and blocks overlapping ownership across reincarnations.
- Generated layouts load only their timer role: world sampling at three seconds (optional one-second ultimate prediction), HUD discovery at five seconds and moving-ring/ultimate updates at one second. Wire messages, publisher epochs and replay rejection are unchanged.
- The shared adapter counts explicit validity/query boundaries separately from recursive mock traversal, and records schedules and child-order calls. Historical 300/200/30 and HUD-watch ceilings are unchanged; supplemental counts must not be added to the old metric or presented as FPS.
- Renderer timing clocks and accumulation use the same debug markers as timing logs. Release stripping removes all of that accounting; staged debug tests still observe timing summaries.

Retained before/after observations and limits: [audit results](../.scratch/hpv3_audit/RESULTS.md). Native CSS loading, packages and frame time were not checked by this audit.

