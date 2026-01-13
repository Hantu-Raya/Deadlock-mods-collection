# abilities/ - VData Ability Definitions

**Type:** Non-Panorama (VData processing)

## OVERVIEW
Modifies ability visibility flags via VData files. Uses Python scripts to toggle `m_bShowInPassiveItemsArea` property.

## FILES
| File | Purpose |
|------|---------|
| `scripts/abilities.vdata` | Main ability definitions (6.6MB) |
| `scripts/abilities2.vdata` | Extended definitions (6.6MB) |
| `scripts/active.py` | Removes passive flags (shows in active area) |
| `scripts/passive.py` | Adds passive flags (shows in passive area) |
| `scripts/active.bat` | Windows wrapper for active.py |
| `scripts/passive.bat` | Windows wrapper for passive.py |

## BUILD PROCESS

**Agent Capability:** I can execute these commands directly via bash.

```powershell
# 1. Remove _include block (lines 4-59) from abilities.vdata
# 2. Copy to external working directory
# 3. Run scripts:
py passive.py abilities2.vdata
py active.py abilities.vdata
# 4. Copy processed files back
```

**Warning:** Hardcoded external paths in `.agent/workflows/abilities-compile.md`. Not portable.

## CONVENTIONS
- VData format: Valve's key-value definition format
- Property: `m_bShowInPassiveItemsArea` (boolean)
- Python scripts use simple string replacement (no VData parser)

## GOTCHAS
- Files are 6MB+ each. Edit carefully.
- `_include` block must be removed before processing (restored after).
- Scripts in `.gitignore` but tracked from before ignore was added.
