# Show no rift estimate; start the rift chip at the minimap warning

Rift times are random and never networked. The server schedules them at 12:00 and every 7:00 after, each within +/-1:00, and no `m_timeNextKothSpawn` NetworkVar exists in either DLL (`server.dll` rva `0xa24ec0`, ClientVersion 6813). A client cannot know a rift time before its warning. The server's early warning starts 60 s before the rift, but a spectator's minimap shows the `koth_warning` marker only 20 s before (live, demo 121685912).

Decision (objective timers, 2026-10-22): the rift chip stays hidden until the minimap marker appears, then counts down 20 s, then shows `LIVE` while `#KothCashInMeter` is visible. The rift cue setting is only off or on.

Consequences:

- No "about 12:00" estimate is shown or implied.
- The countdown is started by the host when it first sees the marker (an exact 20 s, not a read value).
- If the marker class changes in a patch, the rift chip silently never shows; recheck with a demo after each patch ([MAP.md](../../MAP.md#remaining-verification)).

Sources: [decisions/objective-timers.md](../../decisions/objective-timers.md) "Rift (koth)" and "Live test"; [ENGINE.md](../../ENGINE.md#objective-data); [SPEC.md](../../SPEC.md#objective-cues).
