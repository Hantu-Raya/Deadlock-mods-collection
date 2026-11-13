# Record format and migration

Type: wayfinder:grilling (HITL)
Status: Closed
Blocked by: none

## Question

Exact v3 record envelope, version upgrade steps, and how long v2 import (HPCR2, HPCRP1, hpv2 v1-3, save schemas 1-5) stays.

## Notes

Direction is decided (`PLAN.md` D4-D5). Settle: code prefix name, whether import is permanent, behavior on unknown future versions, preset bundle size cap.

## Resolution (grilling 2026-10-14)

v2 codes are converted on import, exports are v3 only, the v2 save converts silently on first launch, the converter is removed in v4 (`GRILL.md` 3, 4, 13). Still open: behavior on unknown future record versions and the preset bundle size cap.

## Remaining items settled (2026-10-14)

- Save from a newer v3 version: load the settings this version knows, ignore unknown ones, never save over it; menu shows "Save from a newer version".
- Pasted code from a newer v3 version: import known settings and warn that some were skipped.
- Presets: keep the 128-preset limit. Export refuses a bundle longer than the 32,768-character paste box and tells the player to export fewer; saving refuses past the store size (3,000 x 64 = 192,000 characters) with a clear message instead of failing silently.
