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
