# abilities/ - VData Ability Definitions

**Type:** Non-Panorama (VData processing)

## OVERVIEW
Processes large ability VData files into active/passive pack variants. Scripts
toggle `m_bShowInPassiveItemsArea`; active variants also adjust selected
behavior bits / targeting metadata for quick-cast-style behavior.

## FILES
| File | Purpose |
|------|---------|
| `scripts/abilities.vdata` | Main ability definitions (260k lines) |
| `scripts/abilities2.vdata` | Extended definitions (260k lines) |
| `scripts/active.py` | Removes passive flags and injects quick-cast behavior bits / targeting location for named abilities. |
| `scripts/active_no_behavior.py` | Imports `active.py` but disables/removes the behavior-bit injection path. |
| `scripts/passive.py` | Adds passive flags (shows in passive area) |
| `scripts/active.bat` | Windows wrapper for active.py |
| `scripts/active_no_behavior.bat` | Windows wrapper for active_no_behavior.py |
| `scripts/passive.bat` | Windows wrapper for passive.py |

## BUILD PROCESS

Preferred full pack flow from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File build_abilities_paks.ps1
```

When refreshing from SteamTracking, update both source baselines in the same run:

```powershell
powershell -ExecutionPolicy Bypass -File build_abilities_paks.ps1 -RefreshFromSteamTracking
```

That wrapper derives the repo root from `$PSScriptRoot`, locates `py.exe` or a
known Python install, requires 7-Zip, transforms each variant in place, compiles
after each transform, stages each compiled output as `scripts/abilities.vdata_c`,
packs `pak03_dir.vpk`/`pak04_dir.vpk`/`pak05_dir.vpk`, writes three dated `.7z`
archives to the Deadlock addons folder, then removes temporary stage folders and
temporary VPKs.

The dated `.7z` archives are the durable packaged outputs from the full flow;
temporary stage folders and intermediate VPKs are intentionally cleaned up.
`-RefreshFromSteamTracking` fetches upstream `scripts/abilities.vdata`, removes
the root `_include` block, and writes the same clean baseline to both
`scripts/abilities.vdata` and `scripts/abilities2.vdata` before transforms so
the passive-only pak cannot lag behind the active paks.

Focused transform commands from `abilities/scripts/`:

```powershell
py passive.py abilities2.vdata
py active.py abilities.vdata
py active_no_behavior.py abilities.vdata
```

Do not update only one VData baseline when pulling upstream data. `abilities.vdata`
feeds the active paks and `abilities2.vdata` feeds the passive-only pak; they must
start from the same stripped upstream source before transforms. Do not resurrect
older hardcoded external-path workflows. Keep helper scripts portable across
checkouts.

## CONVENTIONS
- VData format: Valve's key-value definition format
- Property: `m_bShowInPassiveItemsArea` (boolean)
- Python scripts use simple string replacement (no VData parser)

## GOTCHAS
- Files are ~260k lines each (6MB+). Conventional text editors may struggle; use stream-based processing or high-performance editors.
- If `py` is missing, resolve a real Python install before retrying the build; do not keep rerunning the same failing command.
- The Python transforms mutate their input VData when no output argument is provided. Work from the wrapper flow or a disposable copy if you need to preserve a baseline.
- `_include` block must be removed before processing (restored after).
- Scripts in `.gitignore` but tracked from before ignore was added.
