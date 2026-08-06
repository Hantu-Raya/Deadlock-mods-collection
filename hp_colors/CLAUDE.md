# CLAUDE.md

This file is the working context for `hp_colors/`.

## Build command

Run from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

The build is Closure-first:

1. Run focused audits:
   - `node hp_colors/scripts/validate-schema.js`
   - `node hp_colors/scripts/validate-hero-selector.js`
   - `node hp_colors/scripts/validate-runtime-replay.js`
2. Copy `hp_colors/` to `hp_colors_closure/`.
3. Closure ADVANCED-compile the Panorama scripts in `hp_colors_closure/`.
4. Re-run hero selector and runtime replay validators against the Closure output.
5. Compile `hp_colors_closure/` with `sr2compiler/New folder.exe` into `hp_colors_closure_compiled/`.
6. Copy compiled output to `hp_colors_compiled/`.
7. Pack `pak97_dir.vpk` with `vpkeditcli.exe`.
8. Deploy to `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak97_dir.vpk`.

The compiler wrapper may exit nonzero after output exists. The build script treats required compiled files plus successful pack/deploy as the real signal.

`hp_colors_closure/`, `hp_colors_closure_compiled/`, and `hp_colors_compiled/` are generated. Do not edit them directly; regenerate them from `hp_colors/`.

The full build no longer syncs `HPColorsPresetStore` from `pak96_dir.vpk`. It uses source `hp_colors/panorama/layout/base_hud.xml` as-is.

## Runtime files

| File | Context | Purpose |
|---|---|---|
| `panorama/layout/base_hud.xml` | Base HUD | Loads Anita UI style/script and hosts `AnitaUI_Anchor`. |
| `panorama/layout/unit_status_overlay.xml` | Unit status overlay | Hosts healthbar, counter, level, and kill-marker panels. |
| `panorama/layout/hud_escape_menu.xml` | Escape menu | Stock escape menu context; use as layout reference only. |
| `panorama/scripts/anita_ui_core.js` | Anita UI | Settings schema, UI rendering, persistence, preset builder, hero scope, bridge messages, and preset snapshots. |
| `panorama/scripts/healthbar_logic.js` | Runtime overlay | Consumes bridge messages and applies healthbar, HP number, pulse, ally, kill marker, and level visuals. |
| `panorama/styles/anita_ui.css` | Anita UI style | Settings window, controls, preset builder, color picker, import popup, donation button. |
| `panorama/styles/unit_status.css` | Runtime style | Healthbar overrides, HP number, health pips, pulse, level tiers, kill marker. |

The runtime script set is intentionally exactly two JS files:

- `anita_ui_core.js`
- `healthbar_logic.js`

Do not add a third runtime script unless the build/layout contract is deliberately redesigned.

## Anita UI architecture

`anita_ui_core.js` owns the player-facing configuration surface.

Key modules:

- `HPBridgeProtocol` — message-level bridge constants and dispatch/shared-store helpers.
- `HPSettingsContract` — 56 persisted settings, storage namespace/version, aliases, derived IDs/defaults/preset support, and registrar config.
- `HPValueCodecs` — Anita-side value normalization for toggles, cyclers, numeric controls, colors, and position values.
- `HPPresetRepository` — baked/user preset rows, removed rows, and priority order.
- `HPPresetHeroSelection` — hero-scope rules and selected-preset choice.
- `AnitaPersistence` — compact payload encoding/decoding, storage mirror, import/reset persistence, and resolved-value application.
- `AnitaRenderer` / `AnitaComponents` — settings UI, preset builder, color picker, import popup, and controls.

Persistence rules:

- Namespace: `hp_colors`.
- Storage key: `anita_v1_hp_colors`.
- `HPSettingsContract.storageVersion` is currently `99`.
- Compact payloads store only non-default values using aliases.
- `$.persistentStorage` is not used; do not restore it.
- Current values are mirrored to root/Hud attributes and `GameUI.CustomUIConfig().__hpColorsCfgRaw`.

Preset rules:

- Preset rows can be baked or user-created.
- Hero scope modes are `off`, `all`, and `selected`.
- Selected preset selection must preserve priority order and user row identity.
- `COPY ALL` bundles must preserve off/all/selected hero scope tokens.
- Compact-token parsing belongs in Anita/import/preset paths, not in `healthbar_logic.js`.

## Runtime architecture

`healthbar_logic.js` consumes bridge updates and paints many unit-status contexts. Avoid allocations and broad tree scans in scheduled loops.

Key modules/objects:

- `HPBridgeProtocol` — runtime bridge constants, shared config reads/writes, preset snapshot/request handling, and match-reset ack helpers.
- `HPValueCodecs` — runtime value coercion entrypoint; wraps the existing stable boolean/number/string/position helpers.
- `HealthbarContext.snapshot` — enemy target classification and current metrics.
- `ENEMY_PAINT_PLAN` — enemy bar/ult/text color, HP number, health pips, and kill marker plan fields.
- `ENEMY_PULSE_PLAN` — low-HP pulse lifecycle plan.
- `ALLY_SNAPSHOT` / `ALLY_PAINT_PLAN` — ally healthbar metrics, color, pulse, and delay.
- `LEVEL_SNAPSHOT` / `LEVEL_PAINT_PLAN` — level label/container/wrapper, parsed level, tier class, visibility.
- `dc` — derived config cache refreshed after settings changes.

Main loop ownership:

- `gL()` handles enemy healthbar runtime: target snapshot, counter/pip plan, pulse lifecycle, color paint, kill marker, and schedule.
- `aL()` handles ally healthbar runtime through `ALLY_SNAPSHOT` and `ALLY_PAINT_PLAN`.
- `lL()` handles enemy level-number styling through `LEVEL_SNAPSHOT` and `LEVEL_PAINT_PLAN`.

Runtime invariants:

- Do not allocate new plan/snapshot objects inside hot loops.
- Reuse existing snapshot/plan objects.
- Guard panel refs with `IsValid()` checks.
- Guard style/text writes with last-value caches.
- Do not call `FindChildTraverse` inside steady hot paths unless guarded by cache/TTL behavior.
- Keep hidden healthbar backgrounds `visibility: visible` with opacity toggles; collapsing the background can stall width updates.
- Enemy pulse remains CSS keyframe-driven. Do not add JS frame animation.

## Bridge and match reset

Shared bridge channel: `ClientUI_FireOutput`.

Shared messages/keys:

- `ANITA_UPDATE`
- `ANITA_BULK_UPDATE`
- `ANITA_REQUEST_BOOTSTRAP`
- `HP_COLORS_PRESET_REQUEST`
- `HP_COLORS_PRESET_SNAPSHOT`
- `GameUI.CustomUIConfig().__hpColorsCfgRaw`
- `GameUI.CustomUIConfig().__hpColorsMatchReset`

`anita_ui_core.js` publishes match-reset tokens from game-time rollback/active-match detection. `healthbar_logic.js` consumes those tokens, clears volatile panel/style/bootstrap caches, writes an ack, and requests a preset snapshot with reason `match_reset`.

Do not ship verbose bridge/debug status helpers in production.

## Settings contract

There are 56 persisted settings. If adding, removing, or renaming one, update these together:

- `anita_ui_core.js` `HPSettingsContract.SETTINGS`
- `anita_ui_core.js` `HPSettingsContract.ALIASES`
- `healthbar_logic.js` `DEFAULTS`
- Runtime handling/coercion when needed
- `hp_colors/scripts/validate-schema.js` audit expectations

`validate-schema.js` now enforces exact Anita default vs runtime default parity. Default drift is a hard error.

Bullet-shield defaults now match the native shield fallback: `hp_bullet_shield_color` (`ebsc`) and `hp_friend_bullet_shield_color` (`fbsc`) both default to `#ffffff`, the native `#unit_healthbar_bullet_shield` layer color. Web-builder and preset-store changes must keep those defaults aligned with the full and minimal runtime/schema contract.

Current setting groups:

- General: `hp_enabled`, `hp_bg_visible`, `hp_mode`, `hp_low_threshold`, `hp_high_threshold`, `hp_team_colors`, `hp_skip_buildings`, `hp_info_health_margin_top`, `hp_healthbar_height`
- Enemy colors: `hp_ult_color_enabled`, `hp_ult_color_custom`, `hp_color_low`, `hp_color_mid`, `hp_color_high`, `hp_heal_color`, `hp_delta_color`, `hp_bullet_shield_color`
- Enemy pulse: `hp_pulse_enabled`, `hp_pulse_threshold`, `hp_pulse_bpm`, `hp_pulse_intensity`, `hp_pulse_color_enabled`, `hp_pulse_color_mode`, `hp_pulse_color`, `hp_pulse_hide_bar`, `hp_pulse_text_enabled`, `hp_pulse_text_scale`, `hp_pulse_text_position`
- Enemy counter: `hp_counter_visible`, `hp_counter_size`, `hp_counter_position`, `hp_counter_format`, `hp_text_color_mode`, `hp_level_number_visible`, `hp_pip_visible`, `hp_text_color_low`, `hp_text_color_mid`, `hp_text_color_high`
- Ally bars: `hp_friend_enabled`, `hp_friend_color_low`, `hp_friend_color_mid`, `hp_friend_color_high`, `hp_friend_heal_color`, `hp_friend_delta_color`, `hp_friend_bullet_shield_color`, `hp_friend_pulse_enabled`, `hp_friend_pulse_threshold`, `hp_friend_pulse_bpm`, `hp_friend_pulse_intensity`, `hp_friend_pulse_color_enabled`, `hp_friend_pulse_color`
- Kill marker: `hp_kill_zone_enabled`, `hp_kill_zone_threshold`, `hp_kill_zone_color`, `hp_kill_zone_width`

## Validation

After any `.js`, `.css`, or `.xml` behavior edit, run:

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

Focused validators:

```powershell
node hp_colors/scripts/validate-schema.js
node hp_colors/scripts/validate-hero-selector.js
node hp_colors/scripts/validate-runtime-replay.js
```

Manual in-game smoke remains required for visual certainty:

- Anita UI registers HP Colors.
- Settings changes reach healthbars.
- Presets import/export and hero scope work.
- Match reset replays selected preset.
- Enemy, ally, HP number, health pips, pulse, kill marker, and level visuals update without VConsole errors.
