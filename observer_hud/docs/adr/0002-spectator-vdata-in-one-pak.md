# Ship the spectator VData inside the one HUD pak, observer PCs only

The ability status column needs ability and modifier records that stock data hides from a spectator's world healthbars. The pak ships `scripts/abilities.vdata_c` and `scripts/modifiers.vdata_c`, rebuilt from the installed game on every build with DLF's pipeline and the shared spec `dlf/spectator-status.json` (`dlf/scripts/spectator_status.py`). Whole VData files cannot be injected; overriding them is the only route.

The user decided on 2026-10-22 that the VData ships in the same pak (one pak, pak10), and that the status column is the core feature of the mod. Being observer-only, and the VData that comes with it, is intended.

Consequences:

- Rebuild and re-release after every Deadlock patch that touches abilities or modifiers. A renamed ability fails the build; an old pak on a new game build shows stale VData.
- pak10 loses those two files to any lower-numbered pak that also ships them (the `abilities/` paks, DLF's pak01, Custom Passive). The column then shows only what stock data draws.
- The hook-target class swap means a hooked victim is not pulled on the observer's screen.
- The pak is not for playing matches. The release notes and the GameBanana page must say so plainly.
- The spec is shared with DLF; a change to `dlf/spectator-status.json` changes both. The build verifies the packed VData after packing.

Sources: [PLAN.md](../../PLAN.md) "Ability status column" and "Open decisions"; `build_observer_hud.ps1`; [SPEC.md](../../SPEC.md#ability-status-column).
