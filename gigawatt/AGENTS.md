# GIGAWATT MOD GUIDE

## Scope
- This folder is for Gigawatt audio mod work.
- The live compile source is `soundevents/hero/gigawatt.vsndevts`.
- `soundevents/hero/moded soundevents.txt` is a reference file only and must not be treated as the live asset.
- The local tracked raw source audio currently visible in this folder is `sounds/weapons/gigawatt/buffed_fire/*.mp3`.

## Compile Rules
- Do not treat `moded soundevents.txt` or `AGENTS.md` as compilable assets.
- If the user asks to build Gigawatt normally, compile the `gigawatt` mod only.
- After any `.vsndevts` change, use the repo-standard build flow for this mod:
  ```powershell
  "F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\gigawatt"
  ```
- If the wrapper reports a trailing `ReadKey()` failure after a successful compile, treat that as non-fatal unless the compiler output also reports an asset error.

## File Intent
- `soundevents/hero/gigawatt.vsndevts` is the authoritative live file.
- `soundevents/hero/moded soundevents.txt` is the older layered-reference version for custom fire and powersurge stacking patterns.
- Use the reference file to borrow structure intentionally, not to replace the live file blindly.

## Namespace Rules
- The live file is mixed-namespace on purpose.
- Keep weapon, movement, zoom, reload, melee, and most traversal events under the existing `Seven.*` public names when the live file already uses them, for example:
  - `Seven.Wpn.Fire`
  - `Seven.Wpn.Impact`
  - `Seven.BulletWhizby`
  - `Seven.Wpn.Reload.Start`
  - `Seven.Movement.Long`
  - `Seven.Footstep`
- Keep Gigawatt ability and powersurge-specific events under the existing `Gigawatt.*` public names, for example:
  - `Gigawatt.Wpn.Fire.PowerSurge`
  - `Gigawatt.Wpn.Impact.PowerSurge`
  - `Gigawatt.LightningBall.*`
  - `Gigawatt.StaticCharge.*`
  - `Gigawatt.PowerSurge.*`
  - `Gigawatt.StormCloud.*`
- Do not rename a live public event from `Seven.*` to `Gigawatt.*` or the reverse unless the user explicitly asks for a namespace migration and all related references are updated together.

## Editing Rules
- Re-read `soundevents/hero/gigawatt.vsndevts` before editing. Do not assume names or bases from memory.
- When changing one event, compare the surrounding events so base classes, pitch/volume style, and file path conventions remain consistent.
- Preserve the current public event names unless the user explicitly asks to change external behavior.
- If you port layered behavior from `moded soundevents.txt`, keep the live public name stable and hide layering behind child/internal events rather than renaming the public trigger.
- If you add or restore `citadel_start_multi` layering, verify every `soundevent_0X` target exists and every `use_0X` flag matches the declared children.
- Do not leave orphaned helper events or child references in the live file.

## Weapon-Specific Notes
- The live base weapon fire event is `Seven.Wpn.Fire`.
- The live powersurge weapon fire event is `Gigawatt.Wpn.Fire.PowerSurge`.
- If the user asks for the older layered custom firing behavior, use `moded soundevents.txt` as the structural reference but keep the live public names aligned with `gigawatt.vsndevts`.
- The current reference layering splits fire into `Lyr1` and `Lyr2`; if that pattern is restored, ensure both layers stay valid and balanced instead of muting one accidentally.
- `Seven.Wpn.Fire` currently uses pistol-style base behavior and `Gigawatt.Wpn.Fire.PowerSurge` uses rifle-style base behavior. Preserve those base choices unless the user explicitly asks to change the feel.

## Asset Path Rules
- Do not rewrite live `.vsndevts` entries to `.mp3` paths.
- Keep `vsnd_files` entries in Source 2 `.vsnd` path format.
- Before adding new `vsnd_files`, verify the referenced asset actually exists in the mod or is intentionally relying on an existing game asset path.
- The local `buffed_fire/*.mp3` files are source material, not direct replacements for `vsnd_files` entries in the live event file.

## Ability Coverage
- The live file currently defines these main ability families:
  - `Gigawatt.LightningBall.*`
  - `Gigawatt.StaticCharge.*`
  - `Gigawatt.PowerSurge.*`
  - `Gigawatt.StormCloud.*`
- Keep related cast, loop, hit, detonate, and end events grouped consistently inside their existing family.
- When changing a family, verify all related phases still exist so the game does not lose cast, loop, proc, or end feedback.

## Validation
- After edits, verify the live file still parses as valid KV3-style soundevent data.
- Check that every public event still points to valid children and/or valid `vsnd_files`.
- Watch for invalid hash or missing-event failures caused by renamed child events, missing multi-event targets, or inconsistent namespace changes.
- If you changed powersurge fire behavior, re-check both `Gigawatt.Wpn.Fire.PowerSurge` and the related impact/whizby entries so the powered weapon package stays coherent.
