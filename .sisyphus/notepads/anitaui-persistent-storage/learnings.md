### 2026-02-14: AnitaStorage Abstraction Added
- Implemented  for unified persistent/in-memory storage.
- Key format: .
- Runtime detection for .
- Build verified with .
### 2026-02-14: AnitaStorage Abstraction Added
- Implemented AnitaStorage for unified persistent/in-memory storage.
- Key format: anitaui_{sanitized_modTitle}_{settingId}.
- Runtime detection for $.persistentStorage.
- Build verified with sr2compiler.
### 2026-02-14: Storage API Corrected
- Fixed $.persistentStorage method names: setItem, getItem, removeItem.
- Added note about enumeration limitations in removeAllForMod.
- Verified build with sr2compiler.
### 2026-02-14: Settings Hydration Implemented
- Added hydrateSettings() to AnitaCore to load settings on mod registration.
- Implemented type-specific validation for toggle (bool), stepper (number/clamped), cycler (bounded index), and colorpicker (hex regex).
- Auto-heal logic: Resets to defaultValue and updates storage if stored value is invalid.
- Validation for stepper includes optional min/max clamping if provided in element config.
### 2026-02-14: Settings Persistence Added
- Updated emitUpdate() to call AnitaStorage.set() after event dispatch.
- This ensures all setting changes are persisted to storage immediately.
- Verified build with sr2compiler.
### 2026-02-14: Reset to Defaults Implemented
- Added a 'Reset to Defaults' button at the bottom of each mod settings page.
- Clicking the button clears storage for the specific mod using .
- It also restores  to  for all elements and broadcasts the updates.
- The UI is automatically re-rendered to show the default states.
### 2026-02-14: Reset to Defaults Implemented
- Added a 'Reset to Defaults' button at the bottom of each mod settings page.
- Clicking the button clears storage for the specific mod using AnitaStorage.removeAllForMod().
- It also restores currentValue to defaultValue for all elements and broadcasts the updates.
- The UI is automatically re-rendered to show the default states.
