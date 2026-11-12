# 46: OLD style on unit bars: one full-width bar, no half-empty box rows

**What to build:** under BAR STYLE OLD, NPC, neutral and objective bars always use the full-width OLD bar (slate inner, 250-HP line gaps, native fill). Only hero bars draw the 100-HP box grid.

**Status:** built and VM-tested; not checked in game. Cause matched from game data and reproduced in the VM; the reporter's bar style is not confirmed.

**Origin:** GameBanana report (panicpulsenow, 2026-10-27), edit 2: "a lot of the neutral health bars … discrepancy on what kind of bar they use, along with the max health being completely wrong so more than half of the health bar is just empty at all times."

## Cause

- OLD boxes are 100 HP each, 10 per row (one row = 1000 HP), and the total comes from the engine's 250-HP lines (`oldFacts`: `count·250·width/x_last`).
- 6821 `npc_units.vdata` neutral max health: weak 129, normal 322, strong 1133 (base values).
- A normal camp (322 HP, one line) drew 4 boxes in a 10-slot row: more than half the row empty at full health. A weak camp (129 HP, no line) had no total and fell back to the plain OLD bar. Strong camps drew one full row plus two boxes. So neutral bars showed different kinds of bar, and some looked mostly empty.
- The game's own Custom UI colors option does not touch neutral bars (relationship "neutral" clears its inline colors; static RE of 6821 `client.dll`), so it is not the cause.

## Change

- `hp_colors_v3_renderer.js` `plan`: the OLD line total is used only for player (hero) bars; unit bars plan no box grid and keep `HPColorsV3BarOld` (the full-width OLD bar). Hero bars are unchanged. This drops v2 parity for unit pips (ticket 19 had copied v2's behaviour).

## Evidence

- Mutation: restoring unit boxes (both the plan guard and the sampling guard) fails the test; either guard alone keeps it green (they are redundant on purpose: the sampling guard also saves the per-tick line reads).

- `tests/renderer.test.js` "units: OLD gives every NPC, neutral and objective bar the same full-width bar; heroes keep the boxes" (red first: `neutral_weak 322 HP: no box grid` was `true`): neutral weak/normal/strong, NPC and objective at 129, 322, 1133 and 4246 HP all show the OLD bar without the grid and with the native fill visible; a 322 HP hero keeps the boxes.

- Builds (2026-10-28, with tickets 44-46): normal release `aacba17b`, debug `ce77ca00`, QOLLOCK `a251c7d7`, ShowRank `12e5a542` (md5); staged suites 0 failures. Installed: ShowRank `12e5a542` as `addons/pak02_dir.vpk` (game closed, 6821); the previous tab build `c558d347` is in `addons_disabled/pak02_dir.vpk.showrank-colorblind-tab-c558d347`. Full suites: v3 1364/1364, QOLLOCK + ShowRank + v2 storage 93/93.
