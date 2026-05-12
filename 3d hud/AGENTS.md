# AGENTS.md

Guidance for agents working inside the `3d hud` Deadlock Panorama addon.

## Scope

- This addon overrides the in-game HUD and packages as `pak98_dir.vpk`.
- Source files live under `panorama/`; the root HUD layout is `panorama/layout/hud.xml`.
- Do not recreate `3d hud/hud.xml`. Do not write `pak98_dir.vpk` inside `3d hud/`; package output belongs at the repo root.
- `build_3d_hud.ps1` was intentionally removed. Use manual compile/package steps or a repo-level build script if one is added later.

## Critical Files

- `panorama/layout/hud.xml`: root HUD override with the static 3D hero scene panels.
- `panorama/layout/hud_health.xml`: custom local player health layout. Keep it self-contained; no hp_colors persistence bridge is included by default.
- `panorama/scripts/3d_hero_dynamic.js`: runtime hero detection, scene switching, and custom HP/deferred/damage/heal clipping.
- `panorama/styles/hud_health.css`: custom HP text, hidden stock health source, and prediction color layers.
- `panorama/styles/hud_health_container.css`: local HUD health container placement, recent damage/heal counters, and status-effect positioning.
- `panorama/styles/3d_hud.css`: 3D HUD scene and stock HUD visibility overrides.

## Health HUD Rules

- Preserve these stock binding ids in `hud_health.xml`: `health_bar`, `current_health`, `max_health`, `pending_incoming_damage`, `pending_incoming_heal`.
- Keep `hp_progress_source` visible-but-transparent. Panorama bindings and stock progress geometry stop updating if the source panels are collapsed or fully removed.
- Preserve the custom text/effect layers: `hp_custom_base`, `hp_custom_fill`, `hp_custom_heal`, `hp_custom_deferred`, `hp_custom_damage`.
- Deferred damage and incoming damage are separate layers. Deferred uses the stock `pending_incoming_damage .ProgressBarMiddle`; incoming damage uses recent HP delta hold.
- Do not replace `hud_health.xml` wholesale with `hp_colors/panorama/layout/hud_health.xml`; that would remove the 3D HUD custom text layers.
- Grey base text should only show while `hp-damaged` is active. Full/current-only HP should not leak grey behind the white text.

## Hero Scene Rules

- Keep the static scene panel approach unless every hero has been tested with a dynamic creation replacement.
- Preserve progress-panel class detection and the `button_hints_container` / ability-id fallback path.
- Preserve hero aliases and all `HERO_DATA` mappings in `3d_hero_dynamic.js`.
- The redundant scene visibility writes in JS are intentional for Panorama reliability; only remove them after in-game testing proves it safe.

## Performance Rules

- Runtime code runs during gameplay; avoid debug tree dumps, per-tick log spam, and repeated style writes.
- Keep health polling conservative. If you change `HEALTH_TICK_SEC`, verify current HP, deferred damage, incoming damage, and incoming heal responsiveness in tools mode.
- Terser handles minification; source cleanup should remove real dead code or hot-path overhead, not just cosmetic lines.

## Verification

- JS syntax check:
  `node --check "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\3d hud\panorama\scripts\3d_hero_dynamic.js"`
- Compile from a minified staging copy when deploying. Required compiled outputs include:
  - `panorama/layout/hud.vxml_c`
  - `panorama/layout/hud_health.vxml_c`
  - `panorama/styles/hud_health.vcss_c`
  - `panorama/scripts/3d_hero_dynamic.vjs_c`
- Pack the compiled addon to repo-root `pak98_dir.vpk`, then deploy to:
  `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk`
- The Source 2 compiler may exit nonzero after producing valid artifacts because of its console shutdown behavior. Treat artifacts as the success signal, not the wrapper exit code alone.

## Manual Runtime Checks

- No Panorama errors in `W.log`.
- Default hero scene loads; alias heroes still resolve, e.g. Geist/Ghost and Abrams/Atlas.
- Hero swap/respawn updates the scene.
- Full HP shows current only with no grey leak or clipped digits.
- Damaged HP shows current plus `/max`.
- Deferred damage, recent incoming damage, incoming healing prediction, and recent damage/heal counters all display simultaneously when applicable.
- Status effects remain positioned through `hud_health_container.css` / status CSS, not by reintroducing a local `hud_health_container.xml` wrapper.
