# SHIV MOD GUIDE

## Scope
- This folder is for Shiv audio mod work.
- The live compile source is `soundevents/hero/shiv.vsndevts`.
- Older notes may mention `og_shiv.vsndevts`, `old_shiv.vsndevts`, or
  `moded soundevents.txt`; those files are not present in this checkout. Treat
  them as external references only if the user supplies or restores them.

## Compile Rules
- Do not treat `AGENTS.md` or absent reference files as compilable assets.
- Soundevents are not part of the normal Panorama `sr2compiler` flow. Use the
  known audio/soundevent compile and manual pack path for this module unless
  the user provides a newer build helper.

## Editing Rules
- Re-read `soundevents/hero/shiv.vsndevts` before editing. Do not assume the current naming from memory.
- When porting a block from an external old/default reference, match the
  namespace used by the live file around that section.
- For dagger events in the live file, prefer the live namespace style such as:
  - `Shiv.Dagger.Cast.*`
  - `Shiv.Dagger.Hit.*`
  - `Shiv.Dagger.Surface.Impact.*`
- If the user asks to make `Shiv.Dagger.Hit` "default on og_shiv", first obtain
  the external/default reference file, then copy the `Shiv.Dagger.Hit` block
  exactly:
  - same public name
  - same file list
  - same duration
  - no added helper layers
- If the user asks for a custom dagger hit mix, keep the public name `Shiv.Dagger.Hit` and hide custom layering behind internal helper events or track layering instead of renaming the public event.
- If custom dagger hit helper events produce runtime hash errors, prefer the repo's proven `track_2` layering pattern before adding more helper event names.
- For ult events, keep the current live public event names aligned unless an
  external reference is explicitly supplied, especially:
  - `Shiv.Flash.Leap`
  - `Shiv.Flash.Slash`
  - `Shiv.Flash.Ready`
- If custom layered ult internals are needed, keep them behind the live public names instead of replacing the public names with `Shiv.Ability.ShivFlash.*`.
  The current live file fans `Shiv.Flash.Slash` into internal
  `Shiv.Ability.ShivFlash.Impact_*` events; do not expose those internal names
  as replacement public events without confirming runtime hash behavior.
- Do not mix backup-only names like `Shiv.ShivDagger.*` into the live file unless the live file already uses that exact namespace for the same event family.
- Before changing one event, compare the surrounding Shiv events so base classes, wrapper types, and child naming stay consistent.

## Reference Intent
- The only live local source currently present is `soundevents/hero/shiv.vsndevts`.
- If the user asks for the "old dagger sound", request or locate the old
  reference first, then port only the needed audio behavior into the live file
  without copying unrelated old namespaces blindly.

## Validation
- After edits, verify the live file still has coherent `soundevent_01`, `soundevent_02`, etc. targets with matching child definitions.
- Watch for invalid-hash failures caused by child event names that do not exist in the compiled live namespace.
- If compiling in a non-interactive session, a trailing `ReadKey()` exception from the wrapper is non-fatal when the compiler reports success.
