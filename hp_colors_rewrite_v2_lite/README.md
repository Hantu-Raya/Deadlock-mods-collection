# HP Colors Rewrite v2 Lite

Optional CSS-only alternative, not a companion to the full HPv2 pak02. Ships exactly `panorama/styles/unit_status_v2.vcss_c`: no world-healthbar layout, scripts, menu, settings, transport or persistence. The base is the unchanged 2026-10-01 stock stylesheet (Deadlock 6728); builds do not read `.tmp`.

Keeps a static enemy hero high fill (`#00FF00`) and engine `health_critical` low fill (`#FD4949`), matching HPv2 palette endpoints, plus default enemy healing, damage-delta, white bullet-shield and black health-line colors. The ready-ultimate icon and native HP label follow the same two-state palette; the native enemy HP label uses Oracle. Ally fill stays stock cream (`#FFEFD7`), matching all three HPv2 ally defaults; ally customization is off by default. NPCs, neutrals, buildings, shields' geometry, labels and visibility remain stock.

Damage wiggle is deliberately retained only on stock's compact 100×40 `#UnitStatus`, with stock objective exclusions. This preserves the default 3-degree feedback without animating a full-canvas branch. No animations are added; stock critical flashes remain.

Loses HPv2 bar size/position, rectangular masks, custom accessory/readout positioning, always-visible enemy HP text, custom level badges, pickup/ultimate countdowns and health-percentage pulse. Static CSS cannot sample HP, reproduce the 25%/65% thresholds or interpolate the orange middle palette value: `health_critical` is an engine-owned state, not a promise of HPv2's low threshold. Hero scopes, ability conditions and interactive overrides likewise require scripts. Native names, stamina, critical indicators, health text visibility and stock spectator behavior are not replaced by HPv2 runtime logic. This is a deliberately reduced look, not visual parity or a measured FPS improvement.

Build (no deployment by default):

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v2_lite.ps1
```

Output: repository-root `hp_colors_rewrite_v2_lite_pak02_dir.vpk`. Add `-Deploy` only to deliberately replace installed `citadel/addons/pak02_dir.vpk` (previous file is backed up). Never install the descriptive output filename alongside full HPv2; Lite and full HPv2 are mutually exclusive pak02 alternatives. Fully restart Deadlock after replacement. Compiler/package and fresh-restart in-game checks are still required before release.
