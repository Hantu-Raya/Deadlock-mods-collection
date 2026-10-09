# Feeder Feed

## Goal

A FEEDER FEED tab beside DAMAGE in the stock damage report (scoreboard or death screen) shows which heroes on either team fed souls to the other and who profited, using only HUD data.

## Implemented feature set

### Tallies

- TOP DONORS: heroes of both teams (plus per-team Unknown rows) with the souls their deaths paid, death count, and soul bags stolen from them.
- GRATEFUL RECIPIENTS: heroes of both teams (and NPCs & mishaps) with kill share, assist share, comeback shares (heroes paid by the comeback bonus without assisting), and stolen bags. The per-team `Assisters (split)` row holds assist souls whose heroes could not be identified.
- The comeback bonus is separated from the bounty and split as the server does (`design.md`). Splits that cannot be proven exact set the footer note "Recipient splits/rankings include estimates".
- The footer shows the team charity total and, when nonzero, the enemy charity total across deaths and stolen bags.

### Contexts

- Playing: relative `friendly`/`enemy` feed classes. Spectating: absolute team classes resolved through the top bar (confirmed live 2026-10-06), and the tallies restart on a home-team switch.
- Reset on every match start (`GameStateInProgress` rising edge) and on spectator perspective flips.

### Display

- Damage-report styling, top 3 per list with Show more / Show less, portraits instead of names, stat chips, a souls box with a gold top row, and enemy team colors.
- Tab switch: DAMAGE hides the feed section and header; FEEDER FEED hides the damage section and time controls. The collapsed Tab display mode hides all Feeder panels.

### Deliberately not modeled

- Mode-hash bounty and comeback variants. Assister order relative to the server (a 1-soul bounty residue can land on another assister). Distinct identities for duplicate-hero bots (their comeback snapshots fail closed).

## Manual smoke scenarios

After `build_feeder_feed.ps1` deploys pak08, fully restart Deadlock.

1. Local bot match (`+map new_player_basics`): die to a bot with and without assists. Each `[FF] CB #` line should be `status=exact`, and `base`/`K`/`A`/`O` should match the server's `Base Bounty` and `Comeback Active` lines in `citadel/console.log`.
2. Open the scoreboard. DAMAGE must show only the stock damage report. FEEDER FEED must show only the two lists and the footer; there must be no overlap at your resolution and the rows must stay inside the report.
3. With more than three rows, Show more (N) expands the list and Show less collapses it. The top row has the gold souls box.
4. Spectate a match. `NEW` lines show `spec=team_…`, our deaths count, and assisted deaths log `ASSIST #n feed <HERO>(<id>)` rather than `ASSIST unresolved`.
5. Start a new match. Both lists clear and the footer reads "No donations yet".

Status: scenarios 1 and 4 (logic, spectating) are confirmed from live logs. Assister portrait reading and the restyled layout (2, 3) are awaiting their first live check.
