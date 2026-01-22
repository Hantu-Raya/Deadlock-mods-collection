# Fix: Continuous Enemy Linger Monitoring

## Problem
Linger detection was only running inside `getPlayersNearPowerup()`, which is only called during bridge buff monitoring. This meant the feature only worked near buff spawn times, not continuously.

## Solution
Created separate `checkEnemyLinger()` function that:
- Runs every 300ms continuously (same as powerup monitoring)
- Checks all enemy player buttons independently
- Tracks `.active` class state changes
- Triggers linger when enemy loses `.active`
- Cancels linger when enemy regains `.active` or dies

## Changes Made
1. Added `LINGER_CHECK_INTERVAL=300` constant
2. Added `lastLingerCheck` state variable
3. Created `checkEnemyLinger(nowMs)` function with full enemy scanning
4. Added call in main loop: `if(rn-lastLingerCheck>=LINGER_CHECK_INTERVAL){...}`
5. Removed duplicate linger logic from `getPlayersNearPowerup()`

## Result
Enemy linger now works **from game start** and continuously throughout the match, not just during buff spawn windows.

## Debug Logs
Comprehensive `[LS]` logging shows:
- Enemy state (wasActive → isActive)
- Trigger events (TRIGGER LINGER / CANCEL LINGER)
- Panel positioning and activation
- Hide operations after 5s
