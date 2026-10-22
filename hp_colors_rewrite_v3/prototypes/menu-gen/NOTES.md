# menu-gen prototype (ticket 11)

Question: can one schema table generate the by-part BAR page (Basic/Advanced folds) as Panorama XML that the repo's Source 2 compiler accepts, with stable `HPColors<Key><Role>` ids? **Yes, for compilation.** In-game look and behaviour are unverified.

## Files

| File | Role |
|---|---|
| `generate.js` | Reads `../../mocks/settings.js`, writes `out/panorama/layout/hp_colors_v3_menu_bar.xml`, `out/panorama/styles/hp_colors_v3_menu.css` and `out/ids.json`. It fails on duplicate or malformed ids, an unknown type or side, or any drift between XML ids and `ids.json`. |
| `compile.ps1` | Runs the generator, stages `out/panorama` into `.stage/hpc3_menu_gen/`, and runs `sr2compiler/New folder.exe` directly. Output goes to `.stage/hpc3_menu_gen_compiled/` (git-ignored by `*_compiled/`). stdout goes to `compile.log`. No pack, deploy or launch. |

Run from the repo root with `powershell -File hp_colors_rewrite_v3/prototypes/menu-gen/compile.ps1`.

## Design decisions for Panorama

The audit route is to keep the chosen mock's structure and port its look onto v2's tokens. The palette, fonts (`block` titles, `oracle` labels, `sans` help), 82 px header with a gradient rule, 3 px-accent rail, card rows, 46×24 toggle, bordered segments and 34 px entries all come from `hp_colors_v2_menu.css:31-625`.

- **Shell.** The shell is 1560×900 so the rail (210), the two side columns (~470 each) and the preview (330) fit at 1080p. v2's 1120×760 shell only fits one column.
- **Columns.** Enemy and ally columns sit in a `flow-children: right` row, with shared rows full-width below (mock order). In the narrow columns, number rows stack: copy first, then a full-width slider. Toggle, enum and colour rows keep their control on the right. Shared number rows stay horizontal.
- **Folds.** Panorama has no `<details>`. Each fold is a `Button` header (a CSS-border chevron rotated by `transform`) plus a body that is `visibility: collapse` unless the fold has `.Open`. Basic is generated open and Advanced closed. Runtime JS toggles `.Open` through `…FoldToggle`.
- **Fold switch dropped.** The mock's "BASIC / ADVANCED FOLDS" header switch was only for the comparison. Folds were chosen, so the header holds just the search toggle and field.
- **Search.** A toggle button and a field both sit in the header, using the stock Deadlock icon `s2r://panorama/images/control_icons/24px/search.vsvg` (from 6774's `popup_settings.xml:125`). `.SearchOpen` swaps the header rule for the field. Search results reuse the generated rows rather than cloning them:
  - root `.Searching` shows every generated page, hides fold headers and opens fold bodies;
  - non-matching rows get `.SearchMiss`, so edits happen in place;
  - `.NoResults` reveals `HPColorsSearchEmpty`.
- **Controls.**
  - Toggles follow v2: a `Button` with a knob, and state in `.Checked`.
  - Enums are segments, where `HPColors<Key>Option<Value>` carries `.Selected`. This replaces the mock's `<select>`; `barMask` keeps the V1/V2/OLD labels.
  - Colours are a swatch `Button` with an inline default `background-color`, plus a hex `TextEntry`.
  - Numbers are a `<Slider class="HorizontalSlider" direction="horizontal">` declared in XML, as stock Deadlock layouts do, with an entry and a unit label. Bounds and step come from the schema at runtime, not from XML.
- **Defaults shown.** Each row has a `HPColors<Key>Default` meta label. A row with `.Changed` gets a gold left edge and gold meta (mock behaviour). `.Disabled` (opacity 0.35) is for followed rows.
- **Ids.**
  - Setting ids are `HPColors` + PascalCase(key) + role. The roles are `Row`, `Default`, `Toggle`, `Segment`, `Option<Value>`, `Swatch`, `Hex`, `Slider` and `Entry`.
  - Chrome ids use the same scheme: `HPColorsPageBar<Side><Basic|Advanced>Fold[Toggle|Body]`, `HPColorsNav<Page>Button`, `HPColorsSearch*` and `HPColorsPreview*`.
  - Static text (titles, help, units, chevrons) has no id.
- **Classes.** Classes use a new `HPC3` prefix so the v3 sheet cannot restyle v2 panels while both exist during development.
- **Panorama rules.** There are no transitions (the repo allows opacity-only; none are needed), no glow `box-shadow`, no `clip-path` and no grid. Hiding uses `visibility: collapse`, and sizes are in px.

## Mock features that need custom panels or runtime JS

- **Preview.** `HPColorsPreviewSlot` is an empty 200×210 canvas-sized panel. The real renderer must build a fake unit-status tree in it (PLAN D7, ticket 10). The mock's CSS bar drawing, silhouette and "1.3× zoom" tag are not ported.
- **Colour picker.** Swatches must open the stock `CitadelColorPicker` popup, as v2 does. That popup is not generated here.
- **Slider wiring.** Sliders need min, max and increment set from the schema, plus two-way sync with the entry (v2 `bindSlider`).
- **Search index.** The searchable text (names, help and keywords) must ship as generated JS. Panorama cannot cheaply read help text back from Labels.
- **Other pages.** Only BAR is generated. The rail lists all six pages as static chrome, and Presets and hero routing stay runtime-created (D7).
- **Not ported.** The mock's footer, reset button, `outline` focus rings, `:empty`, `calc()` and media queries are not ported. Focus is shown with border and colour changes on `:focus`.

## Compile results (2026-10-14)

`compile.log`, compiler section:

```text
- dota_addons\hpc3_menu_gen\panorama\layout\hp_colors_v3_menu_bar.xml
- dota_addons\hpc3_menu_gen\panorama\styles\hp_colors_v3_menu.css

-----------------------------------------------------------------
 OK: 2 compiled, 0 failed, 0 skipped, 0m:00s
-----------------------------------------------------------------
```

Outputs:

| File | Size | sha256 |
|---|---|---|
| `hp_colors_v3_menu_bar.vxml_c` | 10,466 B | `CE4A8754…0A42707` |
| `hp_colors_v3_menu.vcss_c` | 28,277 B | `CDBBB11C…D4322C1` |

The compiled output was identical across two compile runs. The process exits -532462766 (0xE0434352, the documented trailing `Console.ReadKey()` .NET exception) after the summary.

- **Root id rejected.** The first compile failed with `(7,4): RESOURCE COMPILE ERROR: Found root panel with 'id' attribute, which is not permitted.` The generator now wraps the page in an id-less `HPC3Layout` panel. When the fragment is injected into `hud_escape_menu.xml`, its parent is `CitadelHudEscapeMenu`, so `HPColorsEditorRoot` can keep its id there.
- **What "0 failed" proves.** Negative controls (scratch stage, deleted afterwards) showed the following:
  - The compiler rejects CSS syntax errors: an unclosed brace gives "Unexpected end of token stream".
  - It accepts unknown CSS properties and values (`totally-bogus-prop`, `color: notacolor`).
  - It accepts unknown XML elements and attributes (`<BogusPanelType madeupattr>`).

  So "0 failed" proves XML well-formedness, the root rule and CSS syntax only. It does not prove property validity or the look.
- **Ids survive compilation.** Decompiling the `.vxml_c` with `.tmp/vrf-cli-19.2/Source2Viewer-CLI.exe` gave the same 206 ids, in the same order as `ids.json`.

## Determinism and id list

Running `node generate.js` twice into `out/`, and once into a fresh temp directory, gave byte-identical output. These hashes were taken after the wrapper fix and are what the compiled run used:

```text
4634eaa2e526a7d993d057e778dfafe164821ea668c2a089dc04908860556564  ids.json
204b0bb8e4ef4f8e4950c12675838b6a2fcbb245eacdb9e7521cf1671b45fbbd  panorama/layout/hp_colors_v3_menu_bar.xml
38a3f067512ef145a7d25053141ef6ebf9a458376ef5e3a5ccd38158236dc46c  panorama/styles/hp_colors_v3_menu.css
```

The 40 BAR settings (12 enemy, 12 ally, 16 shared) produce 206 ids.

| Role | Count |
|---|---|
| Row | 40 |
| Default | 40 |
| Toggle | 17 |
| Swatch | 17 |
| Hex | 17 |
| Segment | 5 |
| Option | 12 |
| Slider | 9 settings + preview HP |
| Entry | 9 |

An independent check confirmed the XML holds 206 unique ids, all matching `^HPColors[A-Z][A-Za-z0-9]*$`. None are missing from or extra in `ids.json`.

## Open risks

- The in-game look and layout are unverified: no VPK, no launch, and no Panorama load was performed. CSS property validity is not checked by the compiler.
- 83 generated ids equal v2 escape-menu ids (for example `HPColorsEnemyLowSwatch` and `HPColorsEditorRoot`). This is harmless if v3 replaces v2's pak02, but both menus must never be injected into one layout.
- Unchecked assumptions about stock behaviour:
  - XML-declared `Slider` panels get their range from JS (v2 created them at runtime instead);
  - `TextEntry placeholder` takes a literal string, where stock uses `#loc` tokens;
  - the `wash-color` tint applies to the `.vsvg` icon.
- A 1560×900 shell assumes a 1080p-equivalent Panorama root. Smaller aspect ratios may need scaling.
