# 35: Team colors and low-stamina colors

**What to build:** Players asked for the HP number and the stamina charges to be colored by team (Amber or Sapphire), and for stamina to change color when few charges are left. For example, with the threshold at 1, the charges turn the low color when 1 charge or none is left. Requested by the user on 2026-10-21.

**Status:** implemented and VM-verified (2026-10-21). Release `3.2.0`, record version 14. Built but not installed or live-checked; see [Acceptance](#acceptance).

**Design:** settled with the user in a grilling session on 2026-10-21. Every choice below is the user's answer except where marked *(Main)*.

## Decisions

- **Team means Amber/Sapphire,** the bar's actual `team1`/`team2` class. It is not enemy/ally, which side-aware settings already cover.
- **Two editable team colors,** shared: `teamAmberColor` (`#E7B659`) and `teamSapphireColor` (`#5B79E6`), in a "Team colors" group on the Bar page. The defaults are the game colors, so existing Team high color looks do not change. They drive the bar's Team high color, the HP number and stamina. The level badge rim keeps the game colors.
- **HP number:** `hpTextColorMode` gains a third option, Team colors, which colors the whole number. Own colors gains a `hpTextTeamHigh` toggle that replaces only the high color, like the bar's. Team coloring is players only. An unknown team falls back to the bar colors.
- **Stamina is side-aware now.** The seven existing stamina settings get ally slots with the enemy defaults, so allies start stock.
- **Stamina color source** (`staminaColorMode`: Own color / Team colors) applies only while Custom stamina color is on. An unknown team uses the own stamina color.
- **Low stamina** (`staminaLowThreshold` 0–10, 0 = off; `staminaLowColor` `#FFE55B`) also needs Custom stamina color. At the threshold or fewer charges left, filled charges and the outline take the low color. Charges that are recharging count as empty. The low color wins over the own and team colors.
- ~~**Low color on empty charges**~~ (`staminaLowEmpty`): removed at the user's request after the first live session (2026-10-21, [ticket 36](issues/36-new-tab-and-retired-low-empty.md)). Empty charges keep the stock look; slots 193/194 are retired.
- **Speed:** the low color follows the bar's cadence, as the user asked ("inherit other bars but stay optimized"). That is every 0.15 s tick while the bar is active and every other tick (0.3 s) while it is idle. It reads charge states only while the game shows the charges.
- **Preview:** an AMBER | SAPPHIRE switch next to ENEMY | ALLY. It starts at enemy Sapphire / ally Amber, and a side change restores that side's team. It only lasts for the session: it is not a setting and is not in Undo, codes or presets. It collapses for neutral camps.
- **Release:** 3.2.0 *(user)*, once the in-game check passes. Gate: if ally charges never appear in game, the ally stamina column is dropped before release.
- **Debug logs** (debug build only, added on the user's request for the play session): see [Debug logs](#debug-logs).

## Implementation (2026-10-21)

- **Schema and records:** 19 new slots, 176–194 (193/194 retired by ticket 36, so 17 remain): 2 team colors, 2 HP-number team-high toggles, 7 ally stamina copies, and 8 for the four new stamina settings. Record version 14 is a slot-addition version. The existing enemy stamina slots 104–110 keep their numbers and flat keys. `tools/generate.js` now treats an appended enum option as a widening. That needs a record-version bump but no `defaultChanges`, so defaults stay implicit, and older readers skip a `team` value as newer data. Every bumped version must also have a `slotAdditions` (or `defaultChanges`) entry, so older records keep an upgrade step (review finding 4).
- **Renderer** (`hp_colors_v3_renderer.js`):
  - `teamColor()` maps `team1`/`team2` to the editable colors and returns `""` when the team is unknown, so callers fall back.
  - Stamina helpers take the bar's side. Low stamina needs Custom stamina color.
  - **Counting:** low stamina counts a charge as empty only when its pip has `PipEmpty`. That is the only marker stock draws as empty (`.StaminaPip.PipEmpty`), so one read per pip covers every input and the count matches what the game shows. Without low stamina, arrows and shapes keep the wider six-class rule. The debug cost line prints the first pip's and icon's stamina classes, so a mismatch shows up in the first live session.
  - **Sampling:** the game shows pips only under an ancestor with `.StaminaRecentlyUsed`. `sampleStamina()` looks for it on the container, then the window root, and remembers which one had it. It reads `PipEmpty` on each pip only while the charges show, which is every 0.15 s tick while the bar is active and every other tick while idle. For more than six charges the idle interval stretches so the read rate stays at the six-charge level (10 charges: 0.6 s).
  - **Structure:** with low stamina on, the pip structure walk runs every 3 s (the pickup cadence), not every second. Each read also checks that every pip is still valid, and a missing one triggers the walk on the next tick. Icons and pips are compared by identity, so a pip replaced at the same position is picked up (review finding 2).
- **Preview:** the team segment is generated in `tools/menu-layout.js`. `hp_colors_v3_preview.js` keeps the session team, and the ally preview paints ally stamina through the same plan.
- **ShowRank lane:** `tools/showrank.js` now skips ShowRank's `<!-- [no-missing: cut …] -->` comment lines (added 2026-10-20) between a piece and its anchor. Without that the composition failed, unrelated to this ticket.

### Measured cost

These are counted operations per bar per second, VM only. The worst fixtures have everything on, ultimate churn, shields and pickups.

| Scenario | Before | Low stamina, charges shown | Low stamina, charges hidden |
|---|---:|---:|---:|
| Idle, arrows or boxes, 4 charges | 194.3 | 182.6 | 172.7 |
| Idle, labels, show class on the window root, 6 charges | — | 193.8 | — |
| Idle, the same with 10 charges | — | 190.6 | — |
| Active, arrows, 4 charges | 219.3 | 222.0 | — |
| Active, labels, root, 6 / 10 charges | — | 239.8 / 267.4 | — |

All stay under the 200 idle and 300 active ceilings. Hidden charges cost less than before, because with low stamina on the 1 s check no longer reads charge states. With the threshold at 0 (the default) nothing changes.

### Review (2026-10-21)

A reviewer agent found four defects, all fixed with regression tests:

1. The fast read watched only `PipEmpty` but recounted with six classes, so a change in the other classes went stale while the charges showed. Fixed by counting `PipEmpty` only, the stock marker.
2. A pip replaced at the same position was not detected.
3. Six charges, labels and the show class on the root measured 203.5 idle. It is now 193.8, and 10 charges measure 190.6.
4. An enum-only version bump without a `slotAdditions` entry left older records without an upgrade step.

## Debug logs

All of these lines are in the debug build only. Each starts with `[HPV3]` and is written on change only, except the cost line.

- `team <name> <side> <team1|team2|unknown>`: when a player bar's team is first known or changes.
- `stamina <name> <side> <filled>/<total> threshold <n> <low|high> <shown|hidden>`: when the charges change.
- `colors <name> <side> hp=<bar|own|own+teamhigh|team|bar-fallback|off> stamina=<stock|own|team|own-fallback|low>`: when a color source changes.
- `ally stamina seen <name> pips=<n>` the first time an ally bar shows charges, or `ally stamina none <name> after 60s pips=<n> shown=false`.
- Every 10 s, `stamina cost <name> <side> reads/s=… skipped/s=… ticks/s=… paints=… ms=…`, followed by `gate=<container|root|none> pip0=… icon0=…` while low stamina is on, or `low=off`. The gate is where the show class was last found, and pip0/icon0 list the first pip's and icon's stamina classes. A wrong assumption about the game's classes therefore shows up in one session.

The debug build runs the same staged VM suite and the same operation ceilings as release. So the log lines read the unit name only when they write a line, and they have no side effects on the renderer's cache.

## Acceptance

- [x] VM: editable team colors drive Team high color and the HP number (whole and team-high); unknown team falls back; NPCs and the level rim are unaffected.
- [x] VM: stamina team colors need Custom stamina color and fall back without a team.
- [x] VM: low stamina at, above and below the threshold on arrows, circles and boxes, including zero arrows left; empty charges stay stock (ticket 36); threshold 0 and custom off restore stock.
- [x] VM: charges are not read while hidden, and catch up on the first update after they appear.
- [x] VM: ally stamina has its own settings; enemy settings never touch ally bars.
- [x] VM: preview team switch (session-only, follows the side, collapses for neutral) and ally/low stamina in the preview.
- [x] VM: a v13 code keeps enemy stamina, allies take defaults, team modes round-trip, and defaults stay implicit.
- [x] VM: debug logs for team, stamina, color source, ally charges and the 10 s cost line.
- [ ] Live: bars carry `team1`/`team2` in normal play (not only while spectating). Look for `team … team1/team2` lines. *Sandbox 2026-10-21 (ShowRank debug `0f4b57fb`, game 6796): enemy target dummies logged `team2` and an ally dummy `team1`; a real match is still unchecked.*
- [x] Live (sandbox): the show class sits on the container. Dummy bars logged `gate=container pip0=StaminaPip` while charges showed.
- [ ] Live: ally bars show charges (`ally stamina seen`). The sandbox session had no ally hero bars, so there is no line yet. If they never do, drop the ally stamina column before 3.2.0.
- [ ] Live: the low color appears within about 0.3 s of a dash and the preview team switch fits next to ENEMY | ALLY. *Sandbox: a dummy logged `1/3 threshold 1 low shown` and `stamina=low`; the user then asked to remove the empty-charge shade (ticket 36). No Parsing error, FATAL, Uncaught or JS Exception in that console.log.*
