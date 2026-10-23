# Ship two looks and drop v1's Base Game+

Decided on 2026-10-22 after the round 4 design pass (mockups 12, 13, 14; user asked for "a version 2" with stream-bar examples). The user revised 14 (no event title under the stage; each team's bans beside the clock), then picked 12 · Night Desk with design 5's soul lead graph added. v2 ships two looks, picked in the editor: **14 · Base Game+ Names** (default) and **12 · Night Desk** (rev 3c). v1's Base Game+ look is dropped: its portrait aliases and the event title under the stage go, and the plates stay in Base Game+ Names.

Consequences:

- Aliases show only in the band's names row; nothing is added to the portraits. The host removes v1's `OHAliasHost` panels once at boot.
- A look is a state field (`style`), so share codes and the local save carry it. Each look loads a team logo only where it shows it.
- Stream-overlay content in the examples (sub alerts) is not in-game data and is out of scope.
- Design 13 (Slam Rail) was not built.

Sources: [PLAN.md](../../PLAN.md) "v2 design round started"; [README.md](../../README.md); [SPEC.md](../../SPEC.md#looks); design history in `decisions/` and `designs/index.html`.
