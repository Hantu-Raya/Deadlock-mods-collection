# abilities/ - VData Ability Definitions

**Type:** Non-Panorama (VData processing)

## OVERVIEW
Modifies ability visibility flags via VData files. Uses Python scripts to toggle `m_bShowInPassiveItemsArea` property.

## FILES
| File | Purpose |
|------|---------|
| `scripts/abilities.vdata` | Main ability definitions (260k lines) |
| `scripts/abilities2.vdata` | Extended definitions (260k lines) |
| `scripts/active.py` | Removes passive flags (shows in active area) |
| `scripts/active_no_behavior.py` | Removes passive flags without behavior-bit injection |
| `scripts/passive.py` | Adds passive flags (shows in passive area) |
| `scripts/active.bat` | Windows wrapper for active.py |
| `scripts/active_no_behavior.bat` | Windows wrapper for active_no_behavior.py |
| `scripts/passive.bat` | Windows wrapper for passive.py |

## BUILD PROCESS

**Agent Capability:** I can execute these commands directly via bash.

```powershell
# 1. Remove _include block (lines 4-59) from abilities.vdata
# 2. Copy to external working directory
# 3. Run scripts:
py passive.py abilities2.vdata
py active.py abilities.vdata
py active_no_behavior.py abilities.vdata
# Or run build_abilities_paks.ps1 from repo root to produce pak03/pak04/pak05
# 4. Copy processed files back
```

**Warning:** Hardcoded external paths in `.agent/workflows/abilities-compile.md`. Not portable.

## CONVENTIONS
- VData format: Valve's key-value definition format
- Property: `m_bShowInPassiveItemsArea` (boolean)
- Python scripts use simple string replacement (no VData parser)

## GOTCHAS
- Files are ~260k lines each (6MB+). Conventional text editors may struggle; use stream-based processing or high-performance editors.
- Hardcoded external paths in helper scripts/batch files require external working directories. Not fully portable.
- `_include` block must be removed before processing (restored after).
- Scripts in `.gitignore` but tracked from before ignore was added.
