# BUFF TIMER KNOWLEDGE BASE

## OVERVIEW
Moves Rejuvenator and Buff timers to the top bar or custom location. Handles phase tracking (Spawn -> Buff -> Cooldown).

## LOGIC (`rejuvnbufftimer.js`)
- **Sequencing**: Uses `SEQ` array for match phases (Initial -> Buff 1 -> CD 1 ...).
- **Detection**: Checks `HasRejuvenator` modifier on players.
- **Mid Boss**: Checks `mid_boss` entity class state.

## STRUCTURE
- **XML**: `hud.xml` includes the script and `hud_timer.css`.
- **CSS**: `hud_timer.css` defines animations (`rotating`, `buff` classes).

## PERFORMANCE
- **Polling**: Checks state every 1s (tick) or 3s (idle).
- **Caching**: `findUIRoot` and `FindChildTraverse` results are cached.
