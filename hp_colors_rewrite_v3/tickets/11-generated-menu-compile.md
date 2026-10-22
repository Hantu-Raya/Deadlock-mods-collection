# Generated menu compile

Type: wayfinder:prototype (AFK)
Status: Closed
Blocked by: none

## Question

Can one schema table generate a by-part menu page (with Basic/Advanced folds) as Panorama XML that compiles with the repo's Source 2 compiler, with stable `HPColors<Key><Role>` ids?

## Notes

Follow-up to ticket 07 (by part, with folds). Use `mocks/settings.js` as the sample schema and Fable's Panorama portability notes in `mocks/README.md`. Compile only; no VPK install, no game launch.

## Resolution

Answer: **yes for compilation.** One schema table generates the BAR page, the compiler accepts it, and the generated ids survive compilation. The in-game look and behaviour are **unverified**.

- **Produced** (in `prototypes/menu-gen/`):
  - `generate.js` reads `mocks/settings.js` and writes the layout XML, CSS and `ids.json` to `out/`.
  - `compile.ps1` stages `out/panorama` like the v2 wrapper and runs `sr2compiler/New folder.exe` directly, logging to `compile.log`. It does no pack, deploy or launch.
  - `NOTES.md` records the Panorama design decisions, which features need custom panels, and the evidence below.
- **Page content.**
  - Enemy and ally columns sit side by side, with shared rows below.
  - Each column has a Basic fold (open) and an Advanced fold (closed).
  - The header holds the search toggle and field, using the stock `control_icons/24px/search.vsvg`.
  - A `HPColorsPreviewSlot` is reserved for the real renderer.
  - Styling uses v2's menu tokens with `HPC3` classes.
- **Compile.** The run reported `OK: 2 compiled, 0 failed, 0 skipped`:
  - `hp_colors_v3_menu_bar.vxml_c`: 10,466 B, sha256 `CE4A8754…`.
  - `hp_colors_v3_menu.vcss_c`: 28,277 B, sha256 `CDBBB11C…`.
  - The exit code is -532462766, from the documented `ReadKey` crash after the summary.
- **Root id rejected.** The first attempt failed with `Found root panel with 'id' attribute, which is not permitted`. The page now sits under an id-less wrapper. When injected into `hud_escape_menu.xml`, its parent is `CitadelHudEscapeMenu`.
- **Determinism.** Two runs into `out/` and one into a fresh temp directory were byte-identical:
  - XML `204b0bb8…`
  - CSS `38a3f067…`
  - `ids.json` `4634eaa2…`
  
  Two compile runs also gave identical `.vxml_c`/`.vcss_c` hashes.
- **Id list.**
  - The 40 BAR settings produce 206 unique ids, all matching `^HPColors[A-Z][A-Za-z0-9]*$`.
  - `ids.json` equals the XML id list, in order. The generator enforces this, and an independent check confirmed it.
  - Decompiling the `.vxml_c` with Source2Viewer-CLI gave the same 206 ids in the same order.
- **What the compiler checks.** Negative controls showed it rejects CSS syntax errors. It accepts unknown CSS properties and values, and unknown XML elements and attributes. So "0 failed" does not validate the styling.

Open risks:
- Not loaded in Panorama or in game, so the look, scrolling and fold and search behaviour are unverified.
- There is no runtime JS. Fold toggling, the search filter and index, slider bounds from the schema, the colour picker and the preview renderer remain to be built.
- 83 ids collide with v2's escape-menu ids. The v3 and v2 menus must never be injected into the same layout.
- Unverified stock assumptions:
  - XML-declared `Slider` panels (v2 created them at runtime);
  - a literal `placeholder` string on `TextEntry`;
  - `wash-color` on `.vsvg` icons;
  - a 1560×900 shell, which assumes a 1080p-equivalent root.
