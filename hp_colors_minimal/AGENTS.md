# AGENT GUIDE: hp_colors_minimal

Standalone minimal runtime pack for HP Colors. This folder intentionally strips the Anita menu, color pickers, import/export UI, escape-menu wiring, and built-in preset authoring.

## Runtime Contract
- `pak96_dir.vpk` is the separate web-builder preset VPK. It owns `panorama/layout/base_hud.vxml_c` and provides `HPColorsPresetStore`.
- `pak97_dir.vpk` is this minimal runtime VPK. It supplies the overlay, healthbar logic, bootstrap shim, and compatibility paths referenced by the builder preset.
- Do not add `panorama/layout/base_hud.xml`, `preset.json`, menu layouts, or Anita UI menu code to this folder.
- Keep the compatibility files even if they look empty: `anita_persist_loader.js`, `hp_registrar.js`, and `anita_ui.css` satisfy compiled paths included by the builder VPK.
- Keep `anita_ui_core.js` minimal but functional: it must read `HPColorsPresetStore`, write `GameUI.CustomUIConfig().__hpColorsCfgRaw`, dispatch `ANITA_BULK_UPDATE`, dispatch per-setting `ANITA_UPDATE`, answer `ANITA_REQUEST_BOOTSTRAP`, and preserve `force_emit`.
- Preserve `bridge_bootstrap` and `core_auto_resync` retries. They cover Panorama load-order races between base HUD and unit status overlay.

## Build And Validation
Run from the repo root:

```powershell
node --check hp_colors_minimal\panorama\scripts\anita_ui_core.js
node --check hp_colors_minimal\panorama\scripts\healthbar_logic.js
node --test hp_colors_minimal\scripts\validate-minimal.test.js
node hp_colors_minimal\scripts\validate-minimal.js
powershell -ExecutionPolicy Bypass -File build_hp_colors_minimal.ps1
```

`validate-minimal.js` enforces exactly 45 `DEFAULTS` keys, rejects Anita menu
markers, and forbids bringing back `panorama/layout/hud_health.xml` or
`scripts/validate-schema.js`.

`build_hp_colors_minimal.ps1` accepts `-BuilderPresetVpkPath` and `-PakName`.
It warns but continues if the separate builder preset `pak96_dir.vpk` is not
found, because in-game validation still requires installing that preset beside
this runtime VPK.

Expected outputs:
- `hp_colors_minimal_compiled/panorama/scripts/healthbar_logic.vjs_c`
- `hp_colors_minimal_compiled/panorama/scripts/anita_ui_core.vjs_c`
- `pak97_dir.vpk`
- deployed runtime VPK at `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak97_dir.vpk`

## Cleanup Rules
- Remove dead code only when a scan proves it is unused and the validation/build loop still passes.
- Do not remove CSS selectors or runtime branches just because they are not referenced in the XML; Source 2 may attach state classes or expect inherited shipped-panel selectors.
- Build scratch directories and VPK outputs are generated/ignored and should not be committed.
