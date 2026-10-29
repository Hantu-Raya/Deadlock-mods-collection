# Live verification

Only results seen in the game are recorded here. VM and build evidence never count as live.

| Date | Client | pak11 md5 | Other paks | Result |
|---|---|---|---|---|
| 2026-10-29 | 6821 | 3c4ee7a7 | none (pak11 only) | `citadel_match_details 121685912` from the main menu. Seen on screen: the board draws on the Scoreboard screen (1600x900 windowed) with stock team names, Steam names on the plates, exact stats, souls by source, final items, the MVP/Key Player slips and the soul lead graph with objective markers. In `console.log`: board shown 6v6 at 23:47, scan done in 827 ms with 0 failed steps (40 lead points, 12 souls, 3 lanes, 12 objectives), and no script errors. Evidence: [shots/live/20261029-121685912-scoreboard.png](shots/live/20261029-121685912-scoreboard.png), [live/121685912-pak11-console.log](live/121685912-pak11-console.log). |

Not checked live yet: item hover lift, opening a second match on the reused rows, reopening without an event, the pak01/pak10 install warning.
