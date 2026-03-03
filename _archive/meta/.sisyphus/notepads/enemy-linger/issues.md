# Issues - Enemy Linger Feature

## 2026-01-20: Debug Logging Added

### User Report
Feature not working as expected. Need to verify:
1. Is `.active` class actually changing on enemy panels?
2. Are the linger panels being positioned correctly?
3. Is the CSS `.active` class being applied?

### Debug Logging Added
Added comprehensive `[LS]` prefix logs to track:
- Enemy visibility state changes (wasActive → isActive transitions)
- Linger trigger conditions
- Panel positioning and activation
- Hide/cleanup operations

### Next Steps
User needs to:
1. Launch game with `-dev -tools`
2. Open console (F7)
3. Watch for `[LS]` messages
4. Report what logs appear when enemies enter/exit fog

This will help determine if:
- `.active` class detection is working
- Panels are being created and positioned
- CSS transitions are applying correctly
