# HP Colors import code design

## Goal
Add a paste-and-import flow to the HP Colors web builder that accepts the in-game export code, strictly validates it, and replaces the current form state.

## Scope
- Web builder only.
- Input: exact HP Colors export code from the game UI.
- Output: imported values replace the full current form state.
- Existing build flow stays base_hud-only `pak96_dir.vpk`.

## Non-goals
- No clipboard automation.
- No merge mode.
- No best-effort recovery.
- No changes to the standalone in-game mod export format.

## UX
Add a visible import area near the build preview:
- textarea labeled `Import Code`
- `Import` button
- error/status text below the control when parsing fails

The import action should be explicit and manual: paste code, click import.

## Import format
Accept the exact token/code produced by the game UI for HP Colors.

Parsing steps:
1. Extract the HP Colors token from the pasted text.
2. Decode the token payload.
3. Parse JSON.
4. Verify the namespace matches HP Colors.
5. Verify the payload version is supported.
6. Validate every imported field against the current web schema.

## Validation rules
Strict fail the entire import if any of the following occur:
- token missing or malformed
- namespace mismatch
- base64 decode failure
- JSON parse failure
- unsupported payload version
- unknown field id
- invalid field value for any schema type

If validation fails, no state changes should be applied.

## State flow
On success:
- replace the full form state
- refresh the preview JSON
- update the rendered controls to match the imported state

The import should behave like a full state replacement, not a partial merge.

## Integration points
- `hp_colors_web_builder/src/app.js` owns the import button, status, and state replacement.
- `hp_colors_web_builder/src/hpFormRenderer.js` should expose a state setter / refresh path so imported values update the live controls.
- `hp_colors_web_builder/src/hpSchema.js` / `hpFormModel.js` remain the validation source of truth.
- Existing `buildHpColorsPackage()` behavior remains unchanged.

## Error handling
- Show a concise parse error in the builder status area.
- Do not partially apply imported values.
- Keep the previous form state intact when import fails.

## Tests
Add coverage for:
- successful import from a valid HP Colors export code
- rejection on malformed token/base64/JSON
- rejection on wrong namespace
- rejection on unknown field ids
- full replacement behavior, not merge behavior
- UI state refresh after import

## Success criteria
- A valid HP Colors game export code can be pasted into the web builder and imported.
- Invalid imports fail cleanly without changing the form.
- The current base_hud-only `pak96_dir.vpk` build flow still works.
