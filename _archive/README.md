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
- `hp_colors_rewrite_v3/`
  - Archived v3 planning files (moved 2026-11-13); the live lane docs link here.
  - Current examples:
    - `issues/` (implementation tickets; `tools/ticket.js` numbers new tickets after these)
    - `tickets/`
    - `prototypes/`
    - `mocks/`
    - `DEBATE.md`
    - `GRILL.md`
    - `PLAN.md`

## Restore Instructions

Move any archived item back to repository root using the original path mapping:

- `_archive/meta/.sisyphus` -> `.sisyphus`
- `_archive/meta/.opencode` -> `.opencode`
- `_archive/misc/ENDFILE` -> `ENDFILE`
- `_archive/misc/EOF` -> `EOF`
- `_archive/misc/README.txt` -> `README.txt`
- `_archive/hp_colors_rewrite_v3/<name>` -> `hp_colors_rewrite_v3/<name>` (for `issues/`, `tickets/`, `prototypes/`, `mocks/`, `DEBATE.md`, `GRILL.md`, `PLAN.md`)

PowerShell example:

```powershell
Move-Item "_archive\meta\.sisyphus" ".sisyphus"
```
