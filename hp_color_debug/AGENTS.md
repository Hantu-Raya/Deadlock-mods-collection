# AGENT GUIDE: hp_color_debug

Debug-only fork of `hp_colors/` for hero preset detection bugs.

## Scope
- Edit this folder only when investigating HP Colors hero detection/preset switching.
- Do not copy debug logging back to `hp_colors/` production.
- Keep behavior identical to `hp_colors/` except sampled `[HP_HERO_DEBUG]` traces. Repeated stable lines are sampled so long hero-swap captures do not stop at the old hard cap.

## Build
From repo root:

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_color_debug.ps1
```

The build deploys `pak97_dir.vpk` so it replaces the active full HP Colors runtime while testing.

## Debug logs
Look in Deadlock `console.log` for:

```text
[HP_HERO_DEBUG]
```

Useful transition to test:
1. Start as Shiv with `HPColorsPreset_002` scoped to `hero_shiv`.
2. Switch to a non-Shiv hero and confirm global `HPColorsPreset_001` applies.
3. Switch back to Shiv and confirm the debug log shows the scoped preset selected again.

Expected logged fields include detected hero, selected preset id/name/source, selection reason, last-applied key/hero, detection mode, scoped/global counts, and emitted preset metadata.

## Runtime architecture

This fork keeps the older four-script layout:

| Script | XML context | What it does |
|---|---|---|
| `anita_ui_core.js` | `panorama/layout/base_hud.xml` | Anita UI window, overlay button, event listener, registration handling, persistence helpers, value replay. |
| `hp_registrar.js` | `panorama/layout/base_hud.xml` | Builds the HP Colors schema, registers it, listens for handshake, requests bootstrap. Owns `storageVersion` in `buildConfig()` (currently `97`). |
| `anita_persist_loader.js` | `panorama/layout/base_hud.xml` | Captures config, reads persisted payloads, mirrors session state, replays stored values (`PERSIST_DEBOUNCE_SEC = 0.35`). |
| `healthbar_logic.js` | `panorama/layout/unit_status_overlay.xml` | Consumes `ANITA_UPDATE`, bootstraps overlay state (`BOOTSTRAP_RETRY_SEC = 0.5`), applies healthbar/counter styling. |

Event flow over `ClientUI_FireOutput`:

1. `hp_registrar.js` registers `HP Colors` (`ANITA_REGISTER`).
2. `anita_ui_core.js` calls `registerMod(config)`, hydrates values, adds the tab, and dispatches `ANITA_HANDSHAKE`.
3. `hp_registrar.js` sees the handshake for `mod_title === "HP Colors"` and dispatches `ANITA_REQUEST_BOOTSTRAP`; `healthbar_logic.js` also requests bootstrap on startup, enemy detection, and retries.
4. `anita_ui_core.js` and `anita_persist_loader.js` answer bootstrap by replaying values as `ANITA_UPDATE` with `update_source: "bridge_bootstrap"`.
5. `healthbar_logic.js` coerces each `ANITA_UPDATE` into `cfg`; `bridge_bootstrap`, `ui_resync`, `ui_reset`, `ui_code_apply`, and `core_auto_resync` satisfy bootstrap.

Dual registration in `hp_registrar.js`: `register()` tries `root.AnitaUI.Register(config)` first (requires `root.AnitaUI`, `IsReady()` when present, and `Register`), then always dispatches `ANITA_REGISTER` as fallback/announce. Retries use `REGISTER_RETRY_DELAY_SEC = 0.25` and `REGISTER_MAX_ATTEMPTS = 24`; `ANITA_ALIVE` also triggers `register()`.
