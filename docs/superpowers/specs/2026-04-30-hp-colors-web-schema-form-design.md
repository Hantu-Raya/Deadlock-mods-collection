# HP Colors web schema form design

## Goal
Make the web builder expose every persisted `hp_colors` setting one-to-one in the browser UI, grouped like the registrar and honoring conditional visibility.

## Scope
- Web UI only.
- Mirror the 45 persisted settings in `hp_colors/panorama/scripts/hp_registrar.js`.
- Keep the build target as `pak96_dir.vpk` and the current base_hud-only pack flow.
- Preserve the current random preset preview/build behavior.

## Non-goals
- No changes to the standalone `hp_colors` mod pack scope.
- No new game-side behavior.
- No extra settings beyond what the registrar exposes.

## Data model
Use the schema as the single source of truth for:
- control type: boolean, number, color, button
- default value
- numeric bounds
- UI category path
- conditional visibility

Planned metadata shape:
- `category`: string like `GENERAL|Core Behavior`
- `visibleWhen`: `{ id, equals }` for dependent controls
- `uiLabel`: optional display label override if needed

## UI structure
Generate the form from schema metadata instead of hardcoding inputs.

Required sections:
- grouped category panels matching registrar categories
- controls in registrar order
- conditional controls hidden when their `visibleWhen` parent does not match
- preset preview panel remains on the page

## Build/data flow
1. Load the schema metadata.
2. Build a randomized preset from all persisted fields.
3. Render the UI from the same schema.
4. On build, validate/coerce values from the form.
5. Inject the preset store into `base_hud.xml`.
6. Compile only `base_hud.vxml_c`.
7. Pack and download `pak96_dir.vpk`.

## Validation
- Schema coverage test: every persisted registrar setting has a matching web schema entry.
- UI coverage test: the rendered form includes all persisted settings and excludes the action button.
- Visibility test: dependent controls hide/show based on the parent setting.
- Existing pack tests stay green.

## Implementation notes
- Keep `hpSchema.js` as the source for values/bounds and extend it with UI metadata.
- Derive random preset generation from the same schema object.
- Keep the preset apply path using per-setting `ANITA_UPDATE` events.

## Risks
- Category/visibility drift if metadata is duplicated in multiple places.
- A missing schema entry would silently drop a setting unless the coverage test stays strict.

## Success criteria
- All persisted `hp_colors` settings are editable in the web UI.
- The controls match the registrar categories and conditional visibility.
- The builder still produces a working base_hud-only `pak96_dir.vpk`.
