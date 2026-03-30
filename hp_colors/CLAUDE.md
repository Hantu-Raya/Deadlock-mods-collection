# hp_colors

Enemy healthbar coloring mod for Deadlock with live in-game configuration via Anita-UI.

## What this mod does

- Colors enemy healthbars by HP percentage (low / mid / high zones)
- Two modes: **Fixed** (solid colors per zone) and **Gradient** (smooth color interpolation)
- Low-HP pulse animation (CSS or JS depending on mode)
- Optional team-based high-HP colors (team1 = gold, team2 = blue)
- Level tier CSS classes on enemy panels (level_tier2–5)
- HP counter label showing current / max HP
- All settings configurable live in-game via the Anita-UI settings panel

## File layout

```
hp_colors/panorama/
  layout/
    base_hud.xml          — Overrides base_hud to inject anita_ui_core + hp_registrar
    unit_status_overlay.xml — Overrides world-space overlay to inject healthbar_logic
  scripts/
    anita_ui_core.js      — Anita-UI core (settings panel framework, do not edit)
    hp_registrar.js       — Registers HP Colors settings with Anita-UI (runs in HUD context)
    healthbar_logic.js    — Main HP coloring + level tier logic (runs in world-space context)
  styles/
    anita_ui.css          — Anita-UI panel styles
    unit_status.css       — HP counter + level tier CSS classes
```

## Architecture

Two separate execution contexts:

| Script | Context | Purpose |
|--------|---------|---------|
| `anita_ui_core.js` | `base_hud.xml` (WindowRoot) | Settings UI panel |
| `hp_registrar.js` | `base_hud.xml` (WindowRoot) | Registers with Anita-UI, listens for ANITA_ALIVE |
| `healthbar_logic.js` | `unit_status_overlay.xml` (world-space) | Reads cfg, colors bars, runs poll loops |

`hp_registrar.js` must run in the HUD context (not world-space) so its `ClientUI_FireOutput` events reach `anita_ui_core.js`. Settings changes flow back to `healthbar_logic.js` via `ANITA_UPDATE` events which are delivered globally.

## Config keys (in `healthbar_logic.js` `DEFAULTS` object)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `hp_enabled` | bool | true | Enable/disable all coloring |
| `hp_mode` | int | 1 | 0 = Fixed, 1 = Gradient |
| `hp_low_threshold` | int | 25 | HP% below which "low" zone applies |
| `hp_high_threshold` | int | 65 | HP% above which "high" zone applies |
| `hp_color_low` | string | `#E16161` | Low zone color |
| `hp_color_mid` | string | `#FF7B00` | Mid zone color |
| `hp_color_high` | string | `#00FF00` | High zone color |
| `hp_color_neutral` | string | `#5BEFB5` | Neutral/non-enemy unit color |
| `hp_team_colors` | bool | false | Use team colors instead of hp_color_high |

## Building and deploying

```powershell
# From repo root:
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

This cleans `hp_colors_compiled/`, recompiles, packs to `pak96_dir.vpk`, and copies to:
`G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak96_dir.vpk`

Or use the `/pack-vpk` Claude Code skill.

## VPK load priority

Output VPK is `pak96_dir.vpk`. Higher pak number = higher priority (overrides lower).
The compiled folder is `hp_colors_compiled/` — do not edit compiled files directly.

## Known limitations

- `$.persistentStorage` is unavailable in Deadlock Panorama — settings reset to defaults on game restart
- No cross-restart persistence until Valve enables the storage API
