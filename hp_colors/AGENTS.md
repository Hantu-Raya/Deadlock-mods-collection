# AGENT GUIDE: hp_colors

Enemy healthbar coloring mod with an Anita UI settings bridge and runtime
Panorama overlay styling.

## Scope
- This guide applies to `hp_colors/`.
- Edit raw source in `hp_colors/panorama/...`.
- Do not edit `hp_colors_terser/`, `hp_colors_compiled/`, or
  `hp_colors_terser_compiled/` directly; those are build artifacts.
- Root repo rules in `../AGENTS.md` still apply.

## Build
Use the module build script from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

The script minifies `hp_colors/` into `hp_colors_terser/`, compiles the terser
copy, syncs `hp_colors_compiled/`, packs `pak96_dir.vpk`, and deploys it to the
Deadlock addons folder configured in that script.

## Runtime Files
| File | Context | Purpose |
|---|---|---|
| `panorama/layout/base_hud.xml` | Base HUD | Loads `anita_ui_core.js`, `hp_registrar.js`, and hosts `AnitaUI_Anchor`. |
| `panorama/layout/hud.xml` | Full HUD | Loads `anita_persist_loader.js` for persistence/bootstrap bridge. |
| `panorama/layout/hud_escape_menu.xml` | Escape menu | Contains stock escape menu; current local changes may also relate to settings UI wiring. |
| `panorama/layout/unit_status_overlay.xml` | Unit status overlay | Loads healthbar behavior for enemy/world unit panels. |
| `panorama/scripts/anita_ui_core.js` | Anita UI core | Renders the settings window, registers mods, emits updates, persists values. |
| `panorama/scripts/hp_registrar.js` | Anita bridge | Defines HP Colors settings schema and registers it with Anita UI. |
| `panorama/scripts/anita_persist_loader.js` | Persistence bridge | Reads stored values and replays bootstrap updates. |
| `panorama/scripts/healthbar_logic.js` | Runtime overlay | Applies enemy HP bar colors/counter settings to unit status panels. |
| `panorama/styles/anita_ui.css` | Anita UI | Settings window, controls, color picker, footer controls. |
| `panorama/styles/unit_status.css` | Unit status | Healthbar and unit status visual overrides. |

## Script Flow
1. `hp_registrar.js` builds the HP Colors schema and registers it.
2. Registration uses direct `root.AnitaUI.Register(config)` when available, then
   also sends an `ANITA_REGISTER` bridge event.
3. `anita_ui_core.js` handles `ANITA_REGISTER`, creates the tab/UI state, then
   sends `ANITA_HANDSHAKE`.
4. `hp_registrar.js` receives `ANITA_HANDSHAKE` and requests bootstrap with
   `ANITA_REQUEST_BOOTSTRAP`.
5. `anita_persist_loader.js` and `anita_ui_core.js` answer bootstrap by replaying
   current or stored settings as `ANITA_UPDATE`.
6. `healthbar_logic.js` consumes `ANITA_UPDATE`, coerces values into runtime
   config, refreshes derived colors, invalidates cached visual state when needed,
   and applies styling during its scheduled overlay loop.

`ANITA_UPDATE` is the runtime settings event. Keep payload fields stable:
`magic_word`, `mod_title`, `setting_id`, `value`, and optional `update_source`.

## Settings Keys
Persisted schema keys:
- `hp_enabled`
- `hp_mode`
- `hp_low_threshold`
- `hp_high_threshold`
- `hp_bg_visible`
- `hp_team_colors`
- `hp_npc_poll_slow`
- `hp_color_low`
- `hp_color_mid`
- `hp_color_high`
- `hp_counter_size`
- `hp_counter_position`
- `hp_text_color_mode`
- `hp_text_color_low`
- `hp_text_color_mid`
- `hp_text_color_high`

If you add/remove a persisted setting, update all schema/default/alias maps
together in:
- `anita_ui_core.js`
- `anita_persist_loader.js`
- `healthbar_logic.js`
- `hp_registrar.js`

Also bump the registrar `storageVersion` when compatibility requires it.

## Persistence Model
- Storage namespace: `hp_colors`
- Storage key: `anita_v1_hp_colors`
- Primary store: `$.persistentStorage` when available.
- Session mirror: root/Hud attributes under `anita_v1_hp_colors`.
- Convar fallback: `deadlock_hero_debuts_seen` token prefixed with
  `ANITA-v1-`.
- Manual fallback: Anita UI Copy/Import token controls.

The compact persisted payload stores only non-default values using aliases.
Keep alias maps identical across all persistence/runtime files.

## Healthbar Runtime Notes
- `healthbar_logic.js` scans up the panel ancestry to classify unit panels.
- Enemy = `enemy` class and not neutral.
- Neutral units are intentionally ignored by enemy coloring.
- Hero, creature, and building classes affect polling cadence.
- `hp_npc_poll_slow` slows non-hero enemy polling.
- Low HP and gradient mode use faster updates; stable high HP backs off.

Do not add `FindChildTraverse` calls to hot scheduled loops unless guarded by
cache/TTL behavior.

## Editing Rules
- Preserve IIFE + strict mode style in JS.
- Keep settings IDs and compact aliases deterministic and ASCII-safe.
- Guard volatile Panorama/game API calls with validity checks and `try/catch`.
- Guard DOM/style writes; do not write text/style every frame when unchanged.
- Keep generated/minified/compiled folders out of manual edits.
- Before changing persistence, verify bootstrap from fresh load and live UI
  updates through `ANITA_UPDATE`.

## Validation
After behavior edits:
1. Run `powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1`.
2. Launch Deadlock with `-dev -tools`.
3. Open Panorama debugger (`F7`) or VConsole (`F8`).
4. Verify Anita UI registers HP Colors, settings persist, Copy/Import works when
   needed, and enemy healthbars update without script errors.
