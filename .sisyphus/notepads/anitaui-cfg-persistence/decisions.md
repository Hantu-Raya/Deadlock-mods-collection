
## AnitaStorage Architecture (Task 1)
- **Namespace**: All ConVars prefixed with `anitaui_` to avoid collision with game or other mod settings.
- **Serialization**: Used `type:value` format (e.g., `boolean:1`) to ensure type safety when pulling data back from CFG events.
- **Debounce**: Fixed 500ms delay using `$.Schedule` for all pending writes, consolidated into a single `flush()` call.
- **Hydration Guard**: Included `_hydrating` flag to prevent circular writes when loading settings initially.

## Reversible Key Mapping (Task 2)
- **Separator**: Chose '__' (double underscore) as the separator between mod name and setting ID in the ConVar key.
- **Rationale**: Ensures the key is fully reversible. Single underscores are used for spaces in mod names and potentially in setting IDs (e.g., 'x_pos'), which created ambiguity.
- **Listener Order**: Explicitly ordered listener registration before 'exec' command to ensure no events are lost during the sync process.

## Hook Placement & Reset Strategy (Task 3)
- **Hydration Timing**: Placed hydration logic inside 'registerMod' after the duplicate check but before UI tab creation. This ensures settings are ready before the user ever sees the mod tab.
- **Reset Reactivity**: Chose to explicitly call 'emitUpdate' for each setting during reset. This ensures the mod script receives the new (default) values immediately, maintaining visual consistency between the Anita-UI and the mod's own overlays.
- **Immediate Flush**: Forced 'AnitaStorage.flush()' in the reset callback to bypass the 500ms debounce, ensuring the 'host_writeconfig' operation finishes before the re-render triggers any potential new writes.
