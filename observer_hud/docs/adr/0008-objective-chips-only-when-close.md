# Objective cues as small chips that show only while close, centred as a group

The first mock for v2.1 (a permanent four-cell panel) was "too big and jarring". The shipped cues are small icon-over-time chips under the clock that appear only while an objective is close. The user decided on 2026-10-22:

- The mid-boss and rejuvenator chip is the middle one ("it is the mid objective").
- The row is symmetric: chips fill four generic slots in order bridge, urn, rift, the mid-boss chip is inserted in the middle, and the group is centred under the clock.
- The stock rejuvenator progress circle is removed (collapsed while spectating) and the chip text is centred under its icon. The stock team rejuvenator counts stay, so the clock stack starts below their measured rectangle.
- How early each timer shows is a setting (15, 30, 60, 120 s, off or always; the rift only off or on), default 30 s.

Design debated with m1 (design-taste-frontend skill). A pickup first seen after a jump forward shows `HELD` instead of a wrong countdown.

Consequences:

- The chip kinds are classes (`.OHKind*`) on generic slots, so any set of one to four chips stays centred.
- The state carries `cues`; share codes and the local save carry it. RESET PAGE on MATCH resets it.
- Night Desk uses the same 46 px chips (the mockup showed compact 40 px chips; the stylesheet does not shrink them).

Sources: [decisions/objective-timers.md](../../decisions/objective-timers.md) live checks; [PLAN.md](../../PLAN.md) "v2.1 objective cues"; [SPEC.md](../../SPEC.md#objective-cues).
