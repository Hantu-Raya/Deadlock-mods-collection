# hp_colors

Enemy healthbar coloring mod for Deadlock with live in-game configuration via Anita-UI.

## What this mod does

- Colors enemy healthbars by HP percentage (low / mid / high zones)
- Two modes: **Fixed** (solid colors per zone) and **Gradient** (smooth interpolation)
- Low-HP pulse animation
- Optional team-based high-HP colors (team1 = gold, team2 = blue)
- Level tier CSS classes on enemy panels (`level_tier2` to `level_tier5`)
- HP counter label showing current / max HP
- All settings configurable live in-game via Anita-UI

## File layout

```text
hp_colors/panorama/
  layout/
    base_hud.xml
    hud_escape_menu.xml
    unit_status_overlay.xml
  scripts/
    anita_ui_core.js
    anita_persist_loader.js
    hp_registrar.js
    healthbar_logic.js
  styles/
    anita_ui.css
    unit_status.css
```

## Runtime architecture

Three relevant Panorama contexts:

| Script | Context | Purpose |
|---|---|---|
| `anita_ui_core.js` | `base_hud.xml` | Visible Anita-UI window and controls |
| `hp_registrar.js` | `base_hud.xml` | Registers HP Colors and requests bootstrap |
| `anita_persist_loader.js` | `hud_escape_menu.xml` | Escape-menu persistence bridge |
| `healthbar_logic.js` | `unit_status_overlay.xml` | World-space healthbar coloring consumer |

Event flow:

1. `hp_registrar.js` announces `ANITA_REGISTER`
2. `anita_ui_core.js` registers the config and sends `ANITA_HANDSHAKE`
3. Base HUD and overlay scripts request `ANITA_REQUEST_BOOTSTRAP`
4. `anita_persist_loader.js` answers by replaying saved values as `ANITA_UPDATE`
5. `healthbar_logic.js` applies those updates live

`ANITA_UPDATE` is the only settings-application event. Do not add custom Panorama event types for this mod unless there is no alternative.

## Config keys

These live in `healthbar_logic.js` `DEFAULTS`:

| Key | Type | Default |
|---|---|---|
| `hp_enabled` | bool | `true` |
| `hp_mode` | int | `1` |
| `hp_low_threshold` | int | `25` |
| `hp_high_threshold` | int | `65` |
| `hp_color_low` | string | `#E16161` |
| `hp_color_mid` | string | `#FF7B00` |
| `hp_color_high` | string | `#00FF00` |
| `hp_color_neutral` | string | `#5BEFB5` |
| `hp_team_colors` | bool | `false` |

## Building and deploying

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

This rebuilds `hp_colors_compiled/`, packs `pak96_dir.vpk`, and copies it to:

`G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak96_dir.vpk`

Compiled files live in `hp_colors_compiled/`. Do not edit compiled files directly.

## Persistence status

Cross-restart persistence uses two coordinated layers:

1. **Auto-save write** (`anita_ui_core.js`)
   - `handleUpdateEvent` debounces 2s then calls `persistConfig`
   - `persistConfig` embeds `[ANITA-v1-hp_colors]:<base64url>` into `deadlock_hero_debuts_seen` via `GameInterfaceAPI.ConsoleCommand`
   - Save button in the footer triggers an immediate force-write

2. **Bootstrap read** (`anita_persist_loader.js`, escape-menu context)
   - On startup, tries `$.persistentStorage` first
   - Falls back to reading `deadlock_hero_debuts_seen` via `GameInterfaceAPI.GetSettingString`
   - Decodes the token and replays values via `ANITA_UPDATE`

3. **Session mirror** (both scripts)
   - Root HUD attribute `anita_v1_hp_colors` keeps settings alive across same-session panel reloads

4. **Manual backup** (footer UI)
   - Copy/Paste token buttons let users export and restore settings manually

## Known limitations

- Requires a clean game exit for `deadlock_hero_debuts_seen` to be flushed to `cfg/user/game.cfg`
- `GameInterfaceAPI` availability in escape-menu context is not independently verified; if `storage available=0` and `convar token not found` both appear on restart, the convar read API may be unavailable in that context

## Current debugging signals

Useful log lines:

- `[Anita-UI][Bridge] HP Colors | storage available=...`
- `[Anita-UI][Bridge] HP Colors | bootstrap replay count=...`
- `[Anita-UI][Bridge] HP Colors | persistentStorage write source=...`
- `[Anita-UI][Bridge] HP Colors | convar bootstrap source=convar encoded_len=...`
- `[Anita-UI][Persist] HP Colors | convar write ns=hp_colors ...`

If `storage available=0` appears, treat the bridge as unavailable and use the convar fallback path rather than assuming restart persistence works.
