# Show no rift time before its warning

Decided 2026-10-24 (the user, picked over a corrected range).

The rift timer (`qollock/ql_feat_urntimer.js`) stays hidden until the rift's minimap marker carries `.koth_warning`, counts that warning's 20 s, shows ACTIVE while the stock `#KothCashInMeter` is visible, and hides after the capture. It no longer shows a range between rifts. Evidence is Observer HUD's: no rift time is networked (server `RandomFloat(-60, 60)` per rift on 12:00, 19:00, 26:00, ...; client and server 6813, RE), and a spectator's minimap shows the warning only 20 s ahead (live, demo 121685912, 2026-10-22). See [observer_hud ADR 0007](../../../observer_hud/docs/adr/0007-no-rift-estimate.md) and its `ENGINE.md` "Objective data".

The QOLLOCK copy showed a ±60 s range centred on 12:20 the whole time and took "open" from the marker's `.active` class, neither of which was checked live.

Cost: casters get no early hint of the next rift; a corrected range (12:00 ±60, then +7:00) was the alternative and was turned down.
