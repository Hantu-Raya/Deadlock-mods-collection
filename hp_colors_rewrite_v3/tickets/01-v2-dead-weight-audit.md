# V2 dead weight audit

Type: wayfinder:task (AFK)
Status: Closed
Blocked by: none

## Question

What in v2 is dead, duplicated or over-engineered, with line counts per feature?

## Notes

Run `fallow` (cache at `hp_colors_rewrite_v2/.fallow/`) and `ponytail-audit` over `hp_colors_rewrite_v2/panorama/`. Output a table: feature, runtime lines (JS/CSS/XML), test lines, live-verified yes/no. Feeds ticket 02.

## Resolution

Resolved by [the v2 dead-weight audit](../research/01-v2-dead-weight-audit.md) (2026-10-14), replacing the stopped-run draft.

- Inventories every PLAN §5 stage with approximate JS/CSS/XML and test footprints, a reproducible counting method/selectors, and documented Yes/No/Unknown live evidence.
- Records Fallow 2.98.0 read-only runs, checks its nine unused-file findings against Panorama engine entry points, and flags repeated inventories/helpers, UI-inaccessible identity API branches, historical-format compatibility and test/source coupling.
- Separates historical failures, current compatibility traps, deliberate limits and pending live confirmation. No current canonical player-facing feature was proven dead/never functional, and no feature cuts are proposed.
- Runtime and validators stayed read-only; no test suites, builds, game launch, deployment or benchmarks were run. Main-agent acceptance verification remains separate.
