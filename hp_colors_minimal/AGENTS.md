# AGENT GUIDE: hp_colors_minimal

Standalone minimal runtime pack for HP Colors. This folder intentionally strips the Anita menu, color pickers, import/export UI, escape-menu wiring, and built-in preset authoring.

## Runtime Contract
- `pak96_dir.vpk` is the separate web-builder preset VPK. It owns `panorama/layout/base_hud.vxml_c` and provides `HPColorsPresetStore`.
- `pak97_dir.vpk` is this minimal runtime VPK. It supplies only the overlay, healthbar logic, static preset publisher, and unit status CSS.
- Do not add `panorama/layout/base_hud.xml`, `preset.json`, menu layouts, or Anita UI menu code to this folder.
- `anita_ui.css`, `anita_persist_loader.js`, and `hp_registrar.js` are deprecated and must not be restored.
- Keep `anita_ui_core.js` static: it must read `HPColorsPresetStore`, decode the builder preset, write `GameUI.CustomUIConfig().__hpColorsCfgRaw`, and publish `HP_COLORS_PRESET_SNAPSHOT`.
- Cached snapshots should include `values_raw` so replay receivers can compare against `sharedCfgRaw` without rebuilding JSON every replay tick.
- Do not reintroduce Anita live-update events, Anita request/response bootstrap events, convar persistence, or session-mirror fallback. Settings changes come only from replacing the separate builder preset VPK.
- Preserve the static `HP_COLORS_PRESET_REQUEST` / `HP_COLORS_PRESET_SNAPSHOT` bridge and short publish/read retries. They cover Panorama load-order and base HUD to unit status overlay context boundaries.
- Do not keep scanning `HPColorsPresetStore` after the builder preset is found. The publisher should cache the preset, stop builder-store checks once the shared snapshot is written, and only serve/replay that cached snapshot for late-created overlay contexts.

## Build And Validation
Run from the repo root:

```powershell
node --check hp_colors_minimal\panorama\scripts\anita_ui_core.js
node --check hp_colors_minimal\panorama\scripts\healthbar_logic.js
node --test hp_colors_minimal\scripts\validate-minimal.test.js
node hp_colors_minimal\scripts\validate-minimal.js
powershell -ExecutionPolicy Bypass -File build_hp_colors_minimal.ps1
```

`validate-minimal.js` enforces exactly 45 `DEFAULTS` keys, requires the static
builder-preset snapshot bridge, rejects Anita menu/event markers, and forbids
bringing back legacy convar/session persistence.

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
