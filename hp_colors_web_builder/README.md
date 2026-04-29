# HP Colors Web Builder

Browser-only Route A spike for building a small `pak97_dir.vpk` preset override.

## What works now

- Injects an encoded preset store into `base_hud.xml`.
- Compiles only the override `base_hud.vxml_c` as a simple DATA-only Source 2 `_c` container.
- Packs a VPK v2 `_dir.vpk` with embedded file data.
- Downloads `pak97_dir.vpk`.

## Current limits

- The base HP Colors pack must include the generic Preset reader in `anita_ui_core.js` and Preset tab registration in `hp_registrar.js`.
- Generated DATA-only XML still needs Deadlock validation after engine updates.

## Run

Use any static web server from this folder:

```powershell
cd hp_colors_web_builder
python -m http.server 5177
```

Open:

```text
http://127.0.0.1:5177/
```

## Verify core writers

```powershell
npm test
```
