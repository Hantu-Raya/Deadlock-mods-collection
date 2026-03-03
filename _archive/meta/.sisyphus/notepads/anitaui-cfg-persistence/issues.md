
## Key Format Change
- Updated 'makeKey' from single '_' to double '__' separator between mod name and setting ID.
- This was necessary because both mod names (with spaces replaced by '_') and setting IDs can contain underscores, making single-underscore keys non-reversible.

## Normalization Mismatch Fix (Task 2 Follow-up)
- **Issue**: 'AnitaStorage' was using raw 'modTitle' (e.g., 'Soul Timer') as cache keys, while the load listener and 'makeKey' used normalized keys (e.g., 'soul_timer'). This caused hydrated settings to be invisible to runtime 'get' calls.
- **Fix**: Introduced 'normalizeModKey' helper inside 'AnitaStorage' and applied it to all cache access points (get, set, remove, getAll, onSettingLoaded). Cache is now consistently indexed by the normalized mod key.

## Task 3 Reset Callback Regression
- **Problem**: The initial implementation of the 'Reset to Defaults' callback included 'emitUpdate' calls for each setting.
- **Consequence**: Since 'emitUpdate' triggers 'AnitaStorage.set', the reset action was immediately re-persisting default values to the CFG backend, preventing a true 'clear' of the storage.
- **Fix**: Removed 'emitUpdate' from the reset callback. The UI state is now restored in-memory by setting 'currentValue = defaultValue' before re-rendering, while the persisted storage is correctly cleared via 'removeAllForMod' and 'flush' without subsequent re-saves.

## ExecuteConsoleCommand Runtime Crash
- **Issue**: Direct use of `$.DispatchEvent("ExecuteConsoleCommand", ...)` caused a runtime crash in Deadlock because the event name is invalid/not exposed in that environment.
- **Fix**: Implemented `runConsoleCommand(cmd)` wrapper that prioritizes `GameInterfaceAPI.ConsoleCommand` and `Game.ConsoleCommand` before falling back to a guarded `$.DispatchEvent`. All call sites in `anita_ui_core.js` (setinfo, host_writeconfig, exec) have been updated to use this helper.

