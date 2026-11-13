# Grilling record (2026-10-14)

Four rounds, your answers verbatim where you added a note. `PLAN.md` reflects them.

| # | Question | Answer |
|---|---|---|
| 1 | Which pak02 builds ship | Normal first; "other mod will support later" |
| 2 | When to publish the new store page | Early, on its own |
| 3 | v2 import | "Convert the codes from v2 to v3 and use the new format" |
| 4 | First launch with a v2 save | Convert silently |
| 5 | Menu layout | Redesign |
| 6 | Offset units in the menu | Pixels everywhere |
| 7 | Live tests | Core stage + parity; "add logs to debug more accurately" |
| 8 | What is wrong with v2's menu | Hard to find settings; can't see the result; looks/style. "Add a search icon to toggle search" |
| 9 | Menu structure | Prototype both (by part of the bar vs by side) |
| 10 | In-menu preview bar | Yes |
| 11 | Basic/Advanced folds | Decide in the prototype |
| 12 | Where logs live | Debug build only |
| 13 | Old-code converter lifetime | Remove in v4 |
| 14 | Fresh-install defaults | v2's current look |
| 15 | Search behavior | Filtered list of matching rows, editable in place |
| 16 | Search matches | Names + help text + keywords |
| 17 | Preview shows | Follows the page (hero, NPC, objective) |
| 18 | Preview health | HP slider + play button for a damage/heal sequence |
| 19 | Menu look | Match Deadlock's ESC style |
| 20 | Where to prototype the menu | Browser mock first, then Panorama |
| 21 | Menu used by the core live test | Redesigned menu with core pages only |
| 22 | v2 after v3 ships | Frozen, archives stay up |
| 23 | How the preview is drawn | Real renderer code |
| 24 | Stage order after core | Indicators → Units → Styling → Scopes |
| 25 | Performance target | Set after measuring the v2 baseline |
| 26 | Reviews | Fable + `code-review` on renderer, storage and menu tickets; `code-review` alone on small ones |
| 27 | Debug log scope | Boot and lifecycle; save and store; timing |
| 28 | Menu structure (after mocks) | By part, with folds |
| 29 | Performance ceiling | 300 active / 200 idle / 30 dormant |
| 30 | Publish store page | Yes (published 75e7620) |
| 31 | Save from a newer v3 | Load known settings, never save over it |
| 32 | Code from a newer v3 | Import known settings + warn |
| 33 | Preset limit | 128 presets + size checks on export and save |

Defaults I picked without asking (say if wrong): version 3.0.0, share-code prefix `HPC3`, debug tag `[HPV3]`.
