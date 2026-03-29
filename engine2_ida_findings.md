# `engine2.dll` IDA Findings

Date: 2026-03-27

## Scope

This note records the first-pass analysis of `G:\SteamLibrary\steamapps\common\Deadlock\game\bin\win64\engine2.dll` through `ida-pro-mcp`.

## What I Found

### ConVar registration path

- `sub_180408A00` is the convar registration helper.
- `sub_1804091D0` flushes queued convars once the registry is live.
- The helper stores registrations until the registry is ready, then replays them.
- It raises `RegisterConVar: Unknown error registering convar "%s"!` on failure.

### ConCommand registration path

- `sub_180409BF0` is the concommand registration helper.
- `sub_180409F00` flushes queued concommands once the registry is live.
- It uses the same delayed-registration pattern as the convar path.
- It raises `RegisterConCommand: Unknown error registering con command "%s"!` on failure.

### Developer convar

- `sub_18000B430` registers the `developer` convar.
- The description string is `Set developer message level.`
- This is the engine-level convar that the shipped Lua bootstrap checks via `Convars:GetBool('developer')`.

### App-system bootstrap

- `sub_1802120F0` is the large app-system bootstrap path.
- It references `VScriptUsage`, `vscript`, `VScriptManager010`, and `-dev` related logic.
- This function is where the engine decides which app systems and script surfaces get loaded.

### Developer / dev-mode related gating

- `sub_180006030` registers `sv_pausable_dev_ds`.
- The description string is `Whether dedicated server is pausable when running -dev and playing solo against bots`.
- This is another engine-side `-dev`-aware setting, separate from the `developer` convar.

## Interpretation

- The convar/command registration logic is normal engine plumbing, not a modder-friendly bypass path.
- The presence of `developer` in `engine2.dll` confirms the dev gate exists at the engine level.
- I did not find a shipped VPK route that replaces this registration flow or bypasses the dev-only check.

## Next Binary To Inspect

Switch away from `engine2.dll` once the registration and bootstrap flow are understood.

Recommended next target:

1. `vscript.dll` for script-side developer gating and debugger behavior.
2. `vconcomm.dll` only if you need to inspect console transport / forwarding plumbing.

## Useful Addresses

- `0x180408A00` - convar registration helper
- `0x1804091D0` - convar queue flush
- `0x180409BF0` - concommand registration helper
- `0x180409F00` - concommand queue flush
- `0x18000B430` - `developer` convar registration
- `0x180006030` - `sv_pausable_dev_ds` convar registration
- `0x1802120F0` - app-system bootstrap
