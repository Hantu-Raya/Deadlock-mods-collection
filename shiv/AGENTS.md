# SHIV MOD GUIDE

## Scope
- This folder is for Shiv audio mod work.
- The live compile source is `soundevents/hero/shiv.vsndevts`.
- The files `soundevents/hero/og_shiv.vsndevts`, `soundevents/hero/old_shiv.vsndevts`, and `soundevents/hero/moded soundevents.txt` are reference files only.

## Compile Rules
- Do not treat `og_shiv.vsndevts`, `old_shiv.vsndevts`, `moded soundevents.txt`, or `AGENTS.md` as compilable assets.
- The repo compile/deploy workflow already excludes those files during pack/compile. Keep that behavior intact.
- If the user asks to build Shiv normally, compile the `shiv` mod only.

## Editing Rules
- Re-read `soundevents/hero/shiv.vsndevts` before editing. Do not assume the current naming from memory.
- When porting a block from `old_shiv.vsndevts` or `og_shiv.vsndevts`, match the namespace used by the live file around that section.
- For dagger events in the live file, prefer the live namespace style such as:
  - `Shiv.Dagger.Cast.*`
  - `Shiv.Dagger.Hit.*`
  - `Shiv.Dagger.Surface.Impact.*`
- If the user asks to make `Shiv.Dagger.Hit` "default on og_shiv", copy the `Shiv.Dagger.Hit` block from `og_shiv.vsndevts` exactly:
  - same public name
  - same file list
  - same duration
  - no added helper layers
- If the user asks for a custom dagger hit mix, keep the public name `Shiv.Dagger.Hit` and hide custom layering behind internal helper events or track layering instead of renaming the public event.
- If custom dagger hit helper events produce runtime hash errors, prefer the repo's proven `track_2` layering pattern before adding more helper event names.
- For ult events, keep the public event names aligned with `og_shiv.vsndevts`, especially:
  - `Shiv.Flash.Leap`
  - `Shiv.Flash.Impact`
  - `Shiv.Flash.Impact_Kill`
  - `Shiv.Flash.Slash`
- If custom layered ult internals are needed, keep them behind the live public names instead of replacing the public names with `Shiv.Ability.ShivFlash.*`.
- Do not mix backup-only names like `Shiv.ShivDagger.*` into the live file unless the live file already uses that exact namespace for the same event family.
- Before changing one event, compare the surrounding Shiv events so base classes, wrapper types, and child naming stay consistent.

## Reference Intent
- `og_shiv.vsndevts` is the current/default reference.
- `old_shiv.vsndevts` is the legacy reference for older Shiv dagger behavior and older layered event wiring.
- If the user asks for the "old dagger sound", port the old dagger audio behavior into the live file without copying unrelated old namespaces blindly.

## Validation
- After edits, verify the live file still has coherent `soundevent_01`, `soundevent_02`, etc. targets with matching child definitions.
- Watch for invalid-hash failures caused by child event names that do not exist in the compiled live namespace.
- If compiling in a non-interactive session, a trailing `ReadKey()` exception from the wrapper is non-fatal when the compiler reports success.
