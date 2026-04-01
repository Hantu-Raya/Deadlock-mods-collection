# hp_colors

Enemy healthbar coloring mod for Deadlock with live in-game configuration via Anita-UI.

## What this mod does

- Colors enemy healthbars by HP percentage using low / mid / high zones
- Supports two modes: `Fixed` and `Gradient`
- Exposes live Anita-UI controls for thresholds, colors, background visibility, team colors, HP counter size, HP counter position, and HP text color behavior
- Supports Copy and Import footer actions for the current settings token
- Packs to `pak96_dir.vpk` for Deadlock addon deployment

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

| Script | Context | Purpose |
|---|---|---|
| `anita_ui_core.js` | `base_hud.xml` | Visible Anita-UI window and controls |
| `hp_registrar.js` | `base_hud.xml` | Registers HP Colors and requests bootstrap |
| `anita_persist_loader.js` | `hud_escape_menu.xml` | Escape-menu persistence bridge |
| `healthbar_logic.js` | `unit_status_overlay.xml` | World-space healthbar coloring consumer |

Event flow:

1. `hp_registrar.js` emits `ANITA_REGISTER`
2. `anita_ui_core.js` registers the config and emits `ANITA_HANDSHAKE`
3. Base HUD and overlay scripts request `ANITA_REQUEST_BOOTSTRAP`
4. `anita_persist_loader.js` replays saved values as `ANITA_UPDATE`
5. `healthbar_logic.js` applies those values live

`ANITA_UPDATE` is the single settings-application event for this mod.

## Current UI layout

- Main Anita window is wider than the old fit-to-content layout so right-side controls do not clip
- HP Colors now uses a split settings shell: a clickable file-tree category list on the left and the selected category's controls on the right
- Categories are currently `Behavior`, `Bar Colors`, and `Counter Text`
- `hp_high_threshold` is exposed in `Behavior` so the user controls both split points directly
- `hp_counter_position` is a stacked two-slider control (`L/R` and `T/B`) stored as `x,y` for the normal bg-visible layout
- `hp_counter_position` now uses the same full-width slider geometry as the other Anita sliders instead of compact mini-bars
- When `HP bg visible` is off, the overlay applies a local counter offset without rewriting the saved position
- HP text color now has two modes: `By HP %` and `Custom`
- When `HP text color` is `Custom`, three extra color pickers appear for low / mid / high text colors
- When `HP text color` is `By HP %`, those three custom text color rows are hidden
- The color popup is a compact anchored column that opens to the right of the clicked swatch
- The footer includes `Copy`, `Reset`, and toggleable `Import`; the old Save button has been removed

## Config keys

These live in `healthbar_logic.js` under `DEFAULTS`:

| Key | Type | Default |
|---|---|---|
| `hp_enabled` | bool | `true` |
| `hp_mode` | int | `1` |
| `hp_low_threshold` | int | `25` |
| `hp_high_threshold` | int | `65` |
| `hp_bg_visible` | bool | `true` |
| `hp_counter_size` | int | `120` |
| `hp_counter_position` | string | `"20,196"` |
| `hp_text_color_mode` | int | `0` |
| `hp_text_color_low` | string | `#E16161` |
| `hp_text_color_mid` | string | `#FF7B00` |
| `hp_text_color_high` | string | `#FFFFFF` |
| `hp_color_low` | string | `#E16161` |
| `hp_color_mid` | string | `#FF7B00` |
| `hp_color_high` | string | `#00FF00` |
| `hp_team_colors` | bool | `false` |

Schema notes:

- Each Anita element in `hp_registrar.js` now includes a `category` field used by the left-hand tree renderer
- Conditional rows such as the custom HP text colors still use `visibleWhen`
- There is no `hp_color_neutral` setting anymore; neutral jungle bars are intentionally ignored

## Building and deploying

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

This rebuilds `hp_colors_compiled/`, packs `pak96_dir.vpk`, and copies it to:

`G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak96_dir.vpk`

Compiled files live in `hp_colors_compiled/`. Do not edit compiled files directly.

## Persistence status

Cross-restart persistence is best-effort, with a guaranteed manual backup path:

1. Auto-save write
   - `handleUpdateEvent` debounces for 2s and then calls `persistConfig`
   - `persistConfig` embeds `[ANITA-v1-hp_colors]:<base64url>` into `deadlock_hero_debuts_seen` via `GameInterfaceAPI.ConsoleCommand`
   - Copy exposes the current token for manual backup

2. Bootstrap read
   - `anita_persist_loader.js` tries `$.persistentStorage` first
   - Falls back to reading `deadlock_hero_debuts_seen` via `GameInterfaceAPI.GetSettingString`
   - Decodes the token and replays values via `ANITA_UPDATE`

3. Session mirror
   - Root HUD attribute `anita_v1_hp_colors` keeps settings alive across same-session panel reloads

4. Manual backup
   - Copy exports the current token
   - Import reveals the token entry and reapplies settings

## Known limitations

- Requires a clean game exit for `deadlock_hero_debuts_seen` to be flushed to `cfg/user/game.cfg`
- If `storage available=0` appears in the logs, treat the bridge as storage-less and rely on Copy and Import for reliable backup and restore
- `GameInterfaceAPI` availability in the escape-menu context is not independently guaranteed on every build
- Neutral units are ignored for HP bar customization: they hide the HP counter and skip the enemy HP-ratio loop entirely
- Color-box dragging still has multiple input paths (`GameUI`, panel-local cursor APIs, dragged cursor panel position), so behavior can vary by Panorama context
- The picker still polls while the color cursor is being dragged; future optimization should focus on reducing redundant drag-source probes and style writes

## Color picker architecture

The picker popup contains:

- A `240x240` 2D color box
- A draggable cursor node that updates hue and saturation when drag input is available
- A Hue slider (`0-359`)
- A Saturation slider (`0-100`)
- Metadata and preview labels that mirror the current color state
- Popup positioning is computed from the clicked preview swatch and anchored with `align = "left top"`

## Recent UI fixes

| Issue | Root cause | Fix |
|---|---|---|
| Cursor locked at top-left corner | Width reads could collapse to `1` when inline `"100%"` values were coerced numerically | Cursor metrics now read from `colorBoxFrame` with stable fallback sizing |
| Saturation slider showed a rainbow gradient | Sat track reused the hue-track styling | Sat track now uses its own `AnitaSatSliderContainer` styling |
| Slider `onvaluechanged` feedback loop | Sync code could update sliders and re-enter handlers | `colorPickerSyncing` gates slider write-back |
| Color cursor was not draggable | The `6a44e9d` UI rewrite removed hit testing, `SetDraggable(true)`, drag handlers, and mouse callback hookup | Drag plumbing was restored and simplified so the cursor is again a draggable `Button` |
| Counter-position sliders looked undersized | The position picker hardcoded `100px` mini-bars with tiny labels/readouts | The control now uses shared full-width slider sizing with dedicated axis/readout classes |
| Color popup looked sparse and misaligned | Popup width stayed much larger than its control stack | Popup width and alignment were tightened into a compact centered column |
| HP text color was fixed to runtime defaults | The counter text had no separate config surface from the bar-color logic | Added `By HP %` and `Custom` text color modes, with conditional low / mid / high custom text color pickers |
| Neutral units still used too much hot-loop work | Neutral handling lived close to the enemy update cadence and still had a dedicated tint path | Neutral bars are now ignored for customization and skip both counter text and neutral-specific color handling |
| Settings list was too flat and dense | All controls rendered as one long form with weak grouping | Replaced it with a left file-tree category pane and a filtered detail panel on the right |
| Color popup appeared below the trigger instead of beside it | The popup still used center-based alignment while JS fed it swatch-relative coordinates | Popup anchoring now uses the clicked swatch bounds with top-left alignment |

## Current debugging signals

Useful log lines when the core/bridge debug flags are enabled:

- `[Anita-UI][Bridge] HP Colors | storage available=...`
- `[Anita-UI][Bridge] HP Colors | bootstrap replay count=...`
- `[Anita-UI][Bridge] HP Colors | persistentStorage write source=...`
- `[Anita-UI][Bridge] HP Colors | convar bootstrap source=convar encoded_len=...`
- `[Anita-UI][Persist] HP Colors | convar write ns=hp_colors ...`
- `[Anita-UI][Persist] HP Colors | color box picker init hue=... sat=... color=...`
- `[Anita-UI][Persist] HP Colors | mouse callback unavailable in this UI context; using panel-local picker drag fallback`

If `storage available=0` appears, treat the bridge as unavailable and use the manual token path instead of assuming restart persistence works.

## Review focus for next pass

- `anita_ui_core.js` color-picker drag path: look for remaining redundant source probing or style writes during drag
- `healthbar_logic.js` steady-state polling cadence and style writes: verify enemy-bar updates back off as aggressively as possible without visible lag, and confirm neutral bars do not retain stale enemy text on reused panels
- `anita_ui.css`: check whether general slider rules and popup-specific slider rules can be deduplicated without losing clarity
