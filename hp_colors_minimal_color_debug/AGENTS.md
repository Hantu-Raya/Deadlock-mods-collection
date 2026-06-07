# AGENT GUIDE: hp_colors_minimal_color_debug

Debug-only fork of `hp_colors_minimal/` for investigating first-paint HP bar colors.

## Contract
- Keep `hp_colors_minimal/` untouched while debugging.
- Runtime asset set remains minimal-only:
  - `panorama/layout/unit_status_overlay.xml`
  - `panorama/scripts/anita_ui_core.js`
  - `panorama/scripts/healthbar_logic.js`
  - `panorama/styles/unit_status.css`
  - local validation scripts
- This fork may ship explicit `[HP_COLOR_DEBUG]` console lines.
- Do not copy debug logging back to `hp_colors_minimal/` unless the user explicitly asks.
- Do not add Anita menu/UI assets, registrar/bootstrap/persistence loader files, convars, session mirrors, or runtime builder-store rescanning.

## Debug Output
`healthbar_logic.js` emits capped `[HP_COLOR_DEBUG]` lines for:
- enemy/friend/team classification of the current `unit_healthbar_lagging` panel;
- current panel ancestry/id/class/width path;
- current inline `style.washColor` before writes;
- actual main-bar `sBC()` writes;
- parent-width-zero early returns.

Use this fork to inspect `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\console.log` after an in-game run.

## Build
Run from repo root:

```powershell
node --check hp_colors_minimal_color_debug\panorama\scripts\anita_ui_core.js
node --check hp_colors_minimal_color_debug\panorama\scripts\healthbar_logic.js
node --test hp_colors_minimal_color_debug\scripts\validate-minimal.test.js
node hp_colors_minimal_color_debug\scripts\validate-minimal.js
powershell -ExecutionPolicy Bypass -File build_hp_colors_minimal_color_debug.ps1
```

Default VPK name is `pak97_color_debug_dir.vpk` so it does not overwrite the normal `pak97_dir.vpk`.
Do not leave both normal minimal and this debug fork active if they contain the same Panorama paths; disable/remove the normal runtime VPK while testing the debug fork.
