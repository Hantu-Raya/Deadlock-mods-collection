# HP Colors Preset Builder Jade Shadcn Redesign

## Goal
Redesign `D:\web\hp-colors-preset-builder` so the preset builder feels less mouse-distant, uses an Anita-style schema layout, and follows a minimal shadcn Astro preset with a jade dark theme that matches `hp_colors`.

## Scope
- Keep the Astro + single React island architecture.
- Keep preset import, preview, build, and download behavior.
- Keep `pak96_dir.vpk` as the output filename.
- Rework layout to bring schema controls closer to the user.

## Non-goals
- No second island.
- No backend.
- No redesign of the packaging logic.
- No attempt to fully clone Panorama UI behavior.

## Design direction
- Start from `pnpm dlx shadcn@latest init --preset buFywKm --template astro`.
- Customize shadcn so it does not look like stock shadcn.
- Use a dark jade palette based on `hp_colors`:
  - background: `#111315`
  - surface: `#181b1a`
  - raised surface: `#252a27`
  - border: low-opacity white/green tint
  - accent: `#66cc99`

## Layout
- Remove the tall landing-page feel.
- Use a compact app shell with a short command strip at the top.
- Main body uses three zones:
  1. left schema tree
  2. center active schema controls
  3. right preview/status rail
- Bring build, import, and status controls within a short cursor path.
- Keep the active schema group visually close to the current category selection.

## Schema interaction model
- Mirror `hp_colors` category structure:
  - `GENERAL | Core Behavior`
  - `HEALTH BARS | Enemy Colors`
  - `VISUAL EFFECTS | Low HP Pulse`
  - other existing groups unchanged
- Show one active group at a time.
- Left tree controls navigation.
- Active group controls stay in the center pane.
- Use clear active states and counts so the user can switch with minimal pointer travel.

## Component strategy
- Use shadcn for the base primitives:
  - `Button`
  - `Input`
  - `Textarea`
  - `Select`
  - `Slider`
  - `Switch`
  - `Separator`
  - optional `ScrollArea`
- Keep the core domain helpers framework-free.
- Replace the old distant DOM layout with a tighter React-driven composition.

## Data flow
1. React island owns visible UI state.
2. Schema/model helpers still coerce values and manage visibility.
3. Import replaces the full preset state.
4. Build assembles the pack and downloads `pak96_dir.vpk`.

## UX behavior
- Top strip keeps preset name, import entry, and build action close together.
- Preview/status stay visible while editing.
- Mobile collapses to one column with the build action always easy to reach.
- Import errors and build warnings stay inline, not hidden in alerts.

## Risks
- Shadcn defaults may fight the desired jade dark theme unless customized.
- The schema tree could become too wide if labels are not constrained.
- React state can drift from schema helper logic if control ownership is split.

## Acceptance criteria
- UI feels less mouse-distant.
- Schema tree matches `hp_colors` layout style.
- Theme reads as jade dark mode, not generic shadcn.
- Build output remains `pak96_dir.vpk`.
- Tests and Astro build still pass.
