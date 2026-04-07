# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

Load-order notes:

- `hp_registrar.js` intentionally uses two registration paths: it tries direct `root.AnitaUI.Register(...)` first and still emits `ANITA_REGISTER` as a bridge announce. Recent hp_colors fixes were about surviving HUD init races, so do not collapse this back to a single path.
- HP Colors is no longer a one-shot bootstrap design. `healthbar_logic.js` can recover from shared snapshot state, session mirror state, and direct convar decode, while `anita_ui_core.js` emits extra HP Colors-only replay sources (`bridge_bootstrap`, `ui_resync`, `ui_reset`, `ui_code_apply`, `core_auto_resync`) plus burst / heartbeat resyncs to converge late-loading panels.

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
- Persisted schema is versioned from `hp_registrar.js` (`storageVersion: 5` in the current build). Recent hp_colors history includes explicit storage-version bumps alongside schema refactors, so key changes must stay coordinated across `hp_registrar.js`, `healthbar_logic.js`, `anita_ui_core.js`, and `anita_persist_loader.js`

## Building and deploying

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

Build pipeline (4 steps):
1. Copies `hp_colors/` → `hp_colors_terser/` and minifies all JS via `npx terser` (passes=2, keep_fnames/keep_classnames)
2. Compiles `hp_colors_terser/` → `hp_colors_terser_compiled/` via `sr2compiler\New folder.exe`, then copies to `hp_colors_compiled/`
3. Packs `hp_colors_compiled/` → `pak96_dir.vpk` via `vpkeditcli`
4. Deploys to `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak96_dir.vpk`

`hp_colors_terser/` and `hp_colors_compiled/` are intermediate build artifacts — do not edit them. Edit source files in `hp_colors/` only.

## Registration path

`hp_registrar.js` uses a dual-path registration strategy:
1. **Direct**: tries `root.AnitaUI.Register(config)` if `root.AnitaUI` is already present and ready
2. **Event**: always also dispatches `ANITA_REGISTER` via `ClientUI_FireOutput` as a bridge announce

Both paths fire on startup and on `ANITA_ALIVE`; `didRegister` guards against double-processing. `REGISTER_MAX_ATTEMPTS` (24) × `REGISTER_RETRY_DELAY_SEC` (0.25) gives ~6 s of retry window.

## Persistence status

Cross-restart persistence is best-effort, with a guaranteed manual backup path:

1. Auto-save write
   - `handleUpdateEvent` debounces for 2s and then calls `persistConfig`
   - `persistConfig` embeds `[ANITA-v1-hp_colors]:<base64url>` into `deadlock_hero_debuts_seen` via `GameInterfaceAPI.ConsoleCommand`
   - Copy exposes the current token for manual backup

2. Bootstrap convergence
   - `anita_persist_loader.js` still bridges restart restore from the escape-menu context, trying `$.persistentStorage` first and then `deadlock_hero_debuts_seen`
   - `healthbar_logic.js` does not wait on that bridge alone anymore: it also tries shared snapshot state, session mirror state, direct persistentStorage reads, and direct convar decode during startup, retries, and panel churn
   - `anita_ui_core.js` treats replay-style update sources separately from user edits so resync traffic can restore state without immediately writing it back again

3. Session mirror
   - Root HUD attribute `anita_v1_hp_colors` keeps settings alive across same-session panel reloads

4. Manual backup
   - Copy exports the current token
   - Import reveals the token entry and reapplies settings

## Known limitations

- Requires a clean game exit for `deadlock_hero_debuts_seen` to be flushed to `cfg/user/game.cfg`
- If `storage available=0` appears in the logs, treat the bridge as storage-less and rely on Copy and Import for reliable backup and restore
- `GameInterfaceAPI` availability in the escape-menu context is not independently guaranteed on every build
- Capability probes must stay exception-safe. The latest hp_colors fix was a regression in `hasPersistentStorage()` handling, where a thrown storage probe needed to resolve to `false` immediately instead of falling through
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
- Keep the drag path as a complete bundle. Recent UI regressions came from removing only part of the cursor plumbing; the cursor hit target, drag handlers, and fallback cursor-position probes need to stay aligned or dragging silently stops working

## Compact persistence aliases

`anita_persist_loader.js` stores only non-default values using short aliases to keep tokens small. The alias map (alias → full key):

| Alias | Key |
|---|---|
| `e` | `hp_enabled` |
| `m` | `hp_mode` |
| `l` | `hp_low_threshold` |
| `h` | `hp_high_threshold` |
| `b` | `hp_bg_visible` |
| `t` | `hp_team_colors` |
| `cl` | `hp_color_low` |
| `cm` | `hp_color_mid` |
| `ch` | `hp_color_high` |
| `s` | `hp_counter_size` |
| `p` | `hp_counter_position` |
| `tm` | `hp_text_color_mode` |
| `tl` | `hp_text_color_low` |
| `ti` | `hp_text_color_mid` |
| `th` | `hp_text_color_high` |
| `np` | `hp_npc_poll_slow` |

The stored payload JSON shape: `{ v: <storageVersion>, c: 1, values: { <alias>: <value> } }`. `storageVersion` is currently `6`; `legacyStoragePrefix` is `"hp_mod_"` for migration from old keys.

## Debugging

Per-file debug flags (set to `true` to enable):

| File | Flag |
|---|---|
| `hp_registrar.js` | `DEBUG_LOG` |
| `anita_persist_loader.js` | `PERSISTENCE_DEBUG` |
| `healthbar_logic.js` | `DEV_LOG` |

Useful log lines when the core/bridge debug flags are enabled:

- `[Anita-UI][Bridge] HP Colors | storage available=...`
- `[Anita-UI][Bridge] HP Colors | bootstrap replay count=...`
- `[Anita-UI][Bridge] HP Colors | persistentStorage write source=...`
- `[Anita-UI][Bridge] HP Colors | convar bootstrap source=convar encoded_len=...`
- `[Anita-UI][Persist] HP Colors | convar write ns=hp_colors ...`
- `[Anita-UI][Persist] HP Colors | color box picker init hue=... sat=... color=...`
- `[Anita-UI][Persist] HP Colors | mouse callback unavailable in this UI context; using panel-local picker drag fallback`

If `storage available=0` appears, treat the bridge as unavailable and use the manual token path instead of assuming restart persistence works.
