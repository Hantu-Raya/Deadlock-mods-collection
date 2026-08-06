# AGENT GUIDE: hp_colors_minimal

Production minimal runtime pack for HP Colors. This folder now owns the former first-principles rewrite lane.

## Runtime Contract
- `pak96_dir.vpk` is the separate web-builder preset VPK. It owns `panorama/layout/base_hud.vxml_c` and provides `HPColorsPresetStore`.
- `pak97_dir.vpk` is this minimal runtime VPK. It supplies only:
  - `panorama/layout/unit_status_overlay.xml`
  - `panorama/scripts/anita_ui_core.js`
  - `panorama/scripts/healthbar_logic.js`
  - `panorama/styles/unit_status.css`
  - local validation scripts
- Do not add `base_hud.xml`, menu layouts, Anita UI menu code, registrar/bootstrap/persistence loader files, convars, session mirrors, or runtime builder-store rescanning.
- Preserve the static builder preset bridge:
  - `HP_COLORS_PRESET_REQUEST`
  - `HP_COLORS_PRESET_SNAPSHOT`
  - `GameUI.CustomUIConfig().__hpColorsCfgRaw`
  - root attribute `hp_colors_minimal_cfg_raw`
  - `values_raw` payloads
- Preserve the 56-key runtime schema exactly. Minimal shares the full HP Colors setting set, including precise-pip parsing and heal, delta, and bullet-shield colors for enemy and ally healthbars.
- Preserve hero-scoped preset selection: selected hero wins, global/startup remains fallback, unknown hero waits briefly, bounded late hero probe may correct fallback and then stops.
- Hero-scoped static selection locks after 10 seconds of active match time. After lock, bounded late probing must not swap to another hero preset until the HUD/root/preset context resets.
- Preserve same-raw snapshot repaint wakeups without reparsing unchanged raw JSON.
- Preserve separate enemy, ally, and level runtime loops.
- Preserve Source 2 unit-status IDs/classes used by shipped layout and styles.
- Preserve the healing/delta/bullet-shield layer panel ids `unit_healthbar_healing`, `unit_healthbar_delta`, and `unit_healthbar_bullet_shield`; minimal runtime uses them for the shared layer color settings.
- Bullet-shield defaults now match the native shield fallback: `hp_bullet_shield_color: #ffffff` (`ebsc`) and `hp_friend_bullet_shield_color: #ffffff` (`fbsc`) both align with the native `#unit_healthbar_bullet_shield` CSS fallback. Keep web-builder, preset-store, full runtime, minimal runtime, and validators in lockstep.
- First-paint policy matches the verified `hp_colors_minimal_color_debug/` lane: the bare main bar defaults to `TeamEnemyColor`; `.team_neutral #unit_healthbar_lagging` overrides it for jungle/neutral bars and must stay present. Do not add width-threshold or recent-panel heuristics here.

## Runtime Helper Map
- Loop scheduling is centralized through `requestLoopKick` and `scheduleLoop`; keep the enemy, ally, and level loop tokens separate.
- Enemy pulse state lives in `syncEnemyPulse`; ally pulse state lives in `syncAllyPulse`.
- Ally ownership, style-cache reset, and friendly default wash reset live in `resetAllyState`.
- Healthbar height, pip sizing, and info-health margin writes live in `applyLayoutSettings`.
- Level visibility and tier class sync live in `syncLevelTier`.

## Production Policy
Forbidden in production source:
- Anita menu/UI assets, live update events, convars, session mirrors, runtime builder-store rescanning, bootstrap/registrar/persistence loader files.
- Routine `[PROFILE]`, `[TIMING]`, `[BRIDGE]`, `[CFG]`, `[APPLY]`, or preset publisher spam.
- Default-on capture/debug diagnostics.

Diagnostics policy:
- Hard errors may log.
- Optional diagnostic flags must default to `false`.
- Validation must fail if production capture/debug is enabled.

## Build And Validation
Run from the repo root:

```powershell
node --check hp_colors_minimal\panorama\scripts\anita_ui_core.js
node --check hp_colors_minimal\panorama\scripts\healthbar_logic.js
node --test hp_colors_minimal\scripts\validate-minimal.test.js
node hp_colors_minimal\scripts\validate-minimal.js
powershell -ExecutionPolicy Bypass -File build_hp_colors_minimal.ps1
```

`build_hp_colors_minimal.ps1` accepts `-BuilderPresetVpkPath` and `-PakName`. It warns but continues if the separate builder preset `pak96_dir.vpk` is not found, because in-game validation still requires installing that preset beside this runtime VPK.

Expected outputs:
- `hp_colors_minimal_compiled/panorama/scripts/healthbar_logic.vjs_c`
- `hp_colors_minimal_compiled/panorama/scripts/anita_ui_core.vjs_c`
- `pak97_dir.vpk`
- deployed runtime VPK at `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak97_dir.vpk`

## Cleanup Rules
- Remove dead code only when a scan proves it is unused and the validation/build loop passes.
- Do not remove CSS selectors or runtime branches just because they are not referenced in XML; Source 2 may attach state classes or expect inherited shipped-panel selectors.
- Build scratch directories and VPK outputs are generated/ignored and should not be committed.
