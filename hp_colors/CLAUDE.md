# hp_colors

Enemy healthbar coloring mod for Deadlock with live in-game configuration via Anita-UI.

## What this mod does

- Colors enemy healthbars by HP percentage (low / mid / high zones)
- Two modes: **Fixed** (solid colors per zone) and **Gradient** (smooth interpolation)
- Low HP threshold is adjusted with a horizontal slider in Anita-UI
- High HP threshold stays fixed internally at the default value
- Color settings use a 2D hue/saturation box popup from the preview swatch, with the draggable node moving inside the square
- Low-HP pulse animation
- Optional team-based high-HP colors (team1 = gold, team2 = blue)
- Level tier CSS classes on enemy panels (`level_tier2` to `level_tier5`)
- HP counter label showing current / max HP with configurable size and 2D position controls
- Healthbar background visibility toggle for enemy bars
- Copy/Import footer actions for the current settings token
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

## Current UI layout

- Main Anita window is fixed wider than the old fit-to-content layout so right-side controls do not clip
- Content rows, footer rows, and import row fill the available width instead of collapsing to child width
- `hp_counter_position` is a two-slider control (`L/R` and `T/B`) stored as `x,y`
- The import row is toggleable and compact; the old Save button has been removed

## Config keys

These live in `healthbar_logic.js` `DEFAULTS`:

| Key | Type | Default |
|---|---|---|
| `hp_enabled` | bool | `true` |
| `hp_mode` | int | `1` |
| `hp_low_threshold` | int | `25` |
| `hp_high_threshold` | int | `65` |
| `hp_bg_visible` | bool | `true` |
| `hp_counter_size` | int | `120` |
| `hp_counter_position` | string | `"20,196"` |
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

Cross-restart persistence is best-effort, with a guaranteed manual backup path:

1. **Auto-save write** (`anita_ui_core.js`)
   - `handleUpdateEvent` debounces 2s then calls `persistConfig`
   - `persistConfig` embeds `[ANITA-v1-hp_colors]:<base64url>` into `deadlock_hero_debuts_seen` via `GameInterfaceAPI.ConsoleCommand`
   - Copy button copies the current token for manual backup; there is no Save button anymore

2. **Bootstrap read** (`anita_persist_loader.js`, escape-menu context)
   - On startup, tries `$.persistentStorage` first
   - Falls back to reading `deadlock_hero_debuts_seen` via `GameInterfaceAPI.GetSettingString`
   - Decodes the token and replays values via `ANITA_UPDATE`
   - If the current Deadlock build does not expose `persistentStorage` or convar readback in this Panorama context, automatic restart restore is unavailable

3. **Session mirror** (both scripts)
   - Root HUD attribute `anita_v1_hp_colors` keeps settings alive across same-session panel reloads

4. **Manual backup** (footer UI)
   - Copy button lets users save the current token
   - Import toggle reveals the code entry and lets users paste a token back in and restore settings

## Known limitations

- Requires a clean game exit for `deadlock_hero_debuts_seen` to be flushed to `cfg/user/game.cfg`
- If `storage available=0` appears in the logs, treat the bridge as storage-less and rely on Export Code / Import Code for reliable backup and restore
- `GameInterfaceAPI` availability in escape-menu context is not independently verified; if `storage available=0` and `convar token not found` both appear on restart, the convar read API may be unavailable in that context
- `GameUI` is **completely undefined** in the `base_hud.xml` Panorama context — all `GameUI.*` paths are dead code in practice
- `Panel.GetCursorPosition()` returns null / does not exist in this context — the 2D color box cannot detect click or drag position; use the hue and saturation sliders instead
- The 2D color box is visual-only in the no-`GameUI` fallback; clicking it logs a `[PickerDiag]` line to confirm what cursor APIs are available but does not change the color
- The polling loop does not terminate drag via idle-tick timeout in no-`GameUI` mode — drag ends only via `onmouseup` / `onmouseout` (box drag is currently disabled in this mode anyway)

## Color picker architecture (no-GameUI fallback)

The picker popup contains:
- A 240×240 2D color box (visual only — cannot read click position without `GameUI`)
- A **Hue slider** (0–359°) — primary interaction for changing hue
- A **Saturation slider** (0–100%) — primary interaction for changing saturation
- The draggable cursor node on the box is updated by `updateBoxCursorVisual` whenever color changes via the sliders

### Fixed bugs (attempt 3)

| Bug | Root cause | Fix |
|---|---|---|
| Cursor locked at top-left corner | `colorBoxPanel.width = "100%"` (JS inline) → `Number("100%") = NaN` → `getPanelBounds` falls back to `width=1` → cursor position always ~0px | `updateBoxCursorVisual` now reads from `colorBoxFrame` (explicit `240px` CSS) with hardcoded 240 fallback |
| Saturation slider shows rainbow gradient | Sat track used `AnitaHueSliderContainer` CSS which has a rainbow hue gradient background | Sat track now uses new `AnitaSatSliderContainer` CSS class (white→gray, overridden at runtime to white→hue) |
| Slider `onvaluechanged` feedback loop | `syncColorVisuals` sets slider values; if `SetValueNoEvents` is unavailable, direct assignment fires `onvaluechanged` → re-entrant `syncColorVisuals` call | `colorPickerSyncing` flag set `true` (try/finally) during slider sync; both handlers return early when flag is set |

## Current debugging signals

Useful log lines:

- `[Anita-UI][Bridge] HP Colors | storage available=...`
- `[Anita-UI][Bridge] HP Colors | bootstrap replay count=...`
- `[Anita-UI][Bridge] HP Colors | persistentStorage write source=...`
- `[Anita-UI][Bridge] HP Colors | convar bootstrap source=convar encoded_len=...`
- `[Anita-UI][Persist] HP Colors | convar write ns=hp_colors ...`
- `[Anita-UI][Persist] HP Colors | color box picker init hue=... sat=... color=...`
- `[Anita-UI][Persist] HP Colors | mouse callback unavailable in this UI context; using panel-local picker drag fallback`

If `storage available=0` appears, treat the bridge as unavailable and use the convar fallback path rather than assuming restart persistence works.
