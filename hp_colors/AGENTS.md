# AGENT GUIDE: hp_colors

Enemy/ally healthbar readability mod with an Anita UI settings surface and a runtime Panorama overlay.

## Scope

- This guide applies to `hp_colors/`.
- Edit raw source in `hp_colors/panorama/...` and validators in `hp_colors/scripts/...`.
- Do not manually edit `hp_colors_closure/`, `hp_colors_closure_compiled/`, or `hp_colors_compiled/`; regenerate them with `build_hp_colors.ps1`.
- Root repo rules in `../AGENTS.md` still apply.

## Build

Run from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

The build:

1. Runs schema, hero selector, and runtime replay validators.
2. Copies source to `hp_colors_closure/`.
3. Closure ADVANCED-compiles the two Panorama scripts.
4. Re-runs hero selector/runtime replay validators against Closure output.
5. Compiles the Closure copy with `sr2compiler/New folder.exe`.
6. Copies output to `hp_colors_compiled/`.
7. Packs `pak97_dir.vpk`.
8. Deploys to `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak97_dir.vpk`.

The script intentionally skips external `pak96_dir.vpk` preset-store sync and uses source `base_hud.xml` as-is.

## Runtime files

| File | Context | Purpose |
|---|---|---|
| `panorama/layout/base_hud.xml` | Base HUD | Loads `anita_ui_core.js` and hosts `AnitaUI_Anchor`. |
| `panorama/layout/unit_status_overlay.xml` | Unit status overlay | Hosts runtime panels for healthbar, HP number, level number, and kill marker. |
| `panorama/layout/hud_escape_menu.xml` | Escape menu | Stock escape menu context; reference only. |
| `panorama/scripts/anita_ui_core.js` | Anita UI core | Settings contract, UI rendering, persistence, preset builder, hero scope, bridge events, and preset snapshots. |
| `panorama/scripts/healthbar_logic.js` | Runtime overlay | Bridge consumer and healthbar visual runtime. |
| `panorama/styles/anita_ui.css` | Anita UI | Settings window, controls, preset builder, color picker, import popup, donation CTA. |
| `panorama/styles/unit_status.css` | Unit status | Healthbar, HP number, health pips, pulse, level tier, kill marker styling. |

The runtime JS contract is exactly two scripts: `anita_ui_core.js` and `healthbar_logic.js`. Do not add a third runtime script without updating layouts, build checks, Closure externs, compile expectations, and validators.

## Core seams

### Anita UI

- `HPBridgeProtocol` owns message-level bridge constants and dispatch/shared-store helpers.
- `HPSettingsContract` owns the 56-setting schema, aliases, storage namespace/version, derived IDs/defaults, preset support, and registrar config.
- Bullet-shield defaults now match the native shield fallback: `hp_bullet_shield_color` (`ebsc`) and `hp_friend_bullet_shield_color` (`fbsc`) both default to `#ffffff`, the native `#unit_healthbar_bullet_shield` CSS fallback. Keep full runtime, minimal runtime, validators, and web-builder exports in lockstep.
- `HPValueCodecs` owns Anita-side value normalization.
- `HPPresetRepository` owns baked/user preset row identity, removed rows, and priority order.
- `HPPresetHeroSelection` owns off/all/selected hero-scope rules and selected-preset choice.
- `AnitaPersistence` owns compact payloads, storage/session mirrors, import/reset, and resolved-value application.
- `AnitaRenderer` and `AnitaComponents` own UI rendering and control plumbing.

### Runtime overlay

- `HPBridgeProtocol` owns runtime bridge constants, shared config reads/writes, preset snapshot/request helpers, and match-reset ack helpers.
- `HPValueCodecs` is the runtime coercion entrypoint and wraps stable boolean/number/string/position helpers.
- `HealthbarContext.snapshot` owns enemy target classification and current metrics.
- `ENEMY_PAINT_PLAN` owns enemy bar/ult/text color, HP number, health pips, and kill marker plan fields.
- `ENEMY_PULSE_PLAN` owns low-HP pulse lifecycle state.
- `ALLY_SNAPSHOT` / `ALLY_PAINT_PLAN` own ally healthbar metrics, color, pulse, and delay.
- `LEVEL_SNAPSHOT` / `LEVEL_PAINT_PLAN` own level label/container/wrapper, parsed level, tier visibility, and tier class.

## Runtime performance rules

- Do not allocate new plan/snapshot objects in scheduled loops.
- Reuse existing plan/snapshot objects.
- Guard panel refs with `IsValid()` and `try/catch` around volatile Panorama APIs.
- Guard style/text writes with last-value caches.
- Do not call `FindChildTraverse` inside steady hot paths unless protected by cache/TTL behavior.
- Keep hidden healthbar backgrounds `visibility: visible` with opacity toggles; collapsing them can stall width updates.
- Enemy pulse remains CSS keyframe-driven. Do not add JS frame animation.
- Keep neutral units out of the enemy coloring path.

## Bridge and match reset

Shared bridge channel: `ClientUI_FireOutput`.

Shared message/key contract:

- `ANITA_UPDATE`
- `ANITA_BULK_UPDATE`
- `ANITA_REQUEST_BOOTSTRAP`
- `HP_COLORS_PRESET_REQUEST`
- `HP_COLORS_PRESET_SNAPSHOT`
- `GameUI.CustomUIConfig().__hpColorsCfgRaw`
- `GameUI.CustomUIConfig().__hpColorsMatchReset`

`anita_ui_core.js` publishes match-reset tokens when a new match or game-time rollback is detected. `healthbar_logic.js` consumes the token, clears volatile runtime caches, writes an ack, and requests a preset snapshot with reason `match_reset`.

Do not ship verbose match-reset logs, debug bridges, `console.log`, or `$.Msg` in production runtime files.

## Settings and persistence

- Persisted schema count: 56 settings.
- Storage namespace: `hp_colors`.
- Storage key: `anita_v1_hp_colors`.
- Current storage version: `99`.
- `$.persistentStorage` is not used and must not be restored.
- Runtime does not parse compact aliases; compact-token parsing belongs to Anita/import/preset paths.

If you add, remove, or rename a persisted setting, update these together:

- `anita_ui_core.js` `HPSettingsContract.SETTINGS`
- `anita_ui_core.js` `HPSettingsContract.ALIASES`
- `healthbar_logic.js` `DEFAULTS`
- Runtime handling/coercion when needed
- `hp_colors/scripts/validate-schema.js`

`validate-schema.js` enforces exact Anita schema default vs runtime `DEFAULTS` parity.

## Preset and hero-scope rules

- Presets can be baked or user-created.
- Hero scope modes are `off`, `all`, and `selected`.
- `HPPresetRepository` owns row identity, priority, removed rows, and materialized runtime preset rows.
- `HPPresetHeroSelection` owns scope matching and selected-preset choice.
- Preserve `COPY ALL` tokens for off/all/selected hero scope.
- Preserve stable preset IDs over baked row indexes.
- Do not let row rendering own preset selection rules.

## Anita color picker notes

- Do not parent color picker popups directly to `AnitaWindow`; use popup/root host behavior so popups are not clipped or shifted.
- Keep popup positioning deterministic.
- Do not recompute final color from cursor panel bounds on release; selected hotspot state owns color truth.
- Store color-box selection as cursor center/hotspot in full box coordinates.
- Normalize hue/saturation against the full color box size, not cursor travel bounds.
- Keep picker debug flags/logging out of production.

## Validation

Focused validators:

```powershell
node hp_colors/scripts/validate-schema.js
node hp_colors/scripts/validate-hero-selector.js
node hp_colors/scripts/validate-runtime-replay.js
```

Required after behavior edits:

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

Manual smoke for runtime certainty:

1. Launch Deadlock with `-dev -tools`.
2. Open Panorama debugger (`F7`) or VConsole (`F8`).
3. Reload Panorama if needed.
4. Verify Anita UI registers HP Colors.
5. Verify live settings, preset replay, match reset replay, hero scope, enemy/ally bars, HP number, health pips, low-HP pulse, kill marker, and level tiers.
