# HP Colors Preset Builder Astro Migration

## Goal
Move `hp_colors_web_builder` into a separate repo at `D:\web\hp-colors-preset-builder`, then rebuild it as a minimal Astro site with one React island for preset editing.

## Scope
- Preserve current preset import/build behavior.
- Keep `pak96_dir.vpk` as the output name.
- Make the UI simpler, cleaner, and easier to use for preset edits.

## Non-goals
- No backend.
- No extra framework islands.
- No new build pipeline beyond Astro + React.
- No change to the core package/writer logic unless required by the framework shift.

## Structure
- `src/pages/index.astro`: static shell, metadata, page framing.
- `src/components/PresetBuilderIsland.jsx`: the only hydrated React root.
- Plain JS modules stay framework-free:
  - schema/model/import parsing
  - preset XML injection
  - package/VPK writers
  - download helper
  - build warning gate logic

## UI design
- Minimalist warm monochrome look.
- One main content column with a compact builder surface.
- Clear hierarchy:
  1. preset name and build action
  2. schema navigation and field editing
  3. import area
  4. preview/status area
- Sticky build/status block on desktop.
- Single-column flow on mobile.
- Use restrained spacing; no decorative noise.

## Behavior
- Edits update state immediately.
- Import replaces full preset state.
- Build still compiles the same base HUD output.
- Build warning gate still blocks accidental output until acknowledged.
- Download filename remains `pak96_dir.vpk`.

## Data flow
1. React island owns form state.
2. Island calls pure JS helpers for schema coercion and import parsing.
3. Build action assembles package data through existing writer modules.
4. Browser downloads the generated `pak96_dir.vpk` bytes.

## Risks
- Sync drift between builder UI and `hp_colors` templates.
- Framework code accidentally pulling server-only modules into the client bundle.
- Vendor/WASM assets increasing build fragility.

## Acceptance criteria
- Repo lives in `D:\web\hp-colors-preset-builder`.
- Astro build succeeds.
- Tests still pass.
- Builder still imports presets, previews state, and downloads `pak96_dir.vpk`.
- UI reads as a compact, production-ready preset tool.
