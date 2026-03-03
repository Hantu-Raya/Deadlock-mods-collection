# Archive Directory

This folder stores repository artifacts that are not needed for normal mod
development, compilation, or runtime behavior.

## Why These Files Were Archived

- Keep the repository root focused on active source mods and core tooling.
- Preserve historical notes and agent metadata without deleting them.
- Keep one-off artifacts available for recovery/audit.

## Structure

- `meta/`
  - Archived tooling metadata and session/planning state.
  - Current examples:
    - `.sisyphus/`
    - `.opencode/`
- `misc/`
  - Archived loose root files that are not part of the runtime/build flow.
  - Current examples:
    - `ENDFILE`
    - `EOF`
    - `README.txt`

## Restore Instructions

Move any archived item back to repository root using the original path mapping:

- `_archive/meta/.sisyphus` -> `.sisyphus`
- `_archive/meta/.opencode` -> `.opencode`
- `_archive/misc/ENDFILE` -> `ENDFILE`
- `_archive/misc/EOF` -> `EOF`
- `_archive/misc/README.txt` -> `README.txt`

PowerShell example:

```powershell
Move-Item "_archive\meta\.sisyphus" ".sisyphus"
```
