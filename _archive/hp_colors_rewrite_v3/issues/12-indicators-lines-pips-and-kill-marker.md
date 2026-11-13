# 12: Indicators: lines, pips and kill marker

**What to build:** Health lines/pips with color and opacity, and the enemy kill marker at a threshold.

**Blocked by:** 11

**Status:** implemented; VM E2E and generator verified. Build/package and live visual checks remain Main-owned and unverified. **Live:** the user confirmed it works in game (2026-10-17, [ledger](../LIVE-VERIFIED.md)).

**Runs on:** gpt-6.1-sol (med). **Review:** code-review.

- [x] Matches SPEC stories 10-11
- [x] VM E2E tests boot the real scripts and pass
- [x] Ops ceiling holds

## Evidence (2026-10-14)

- Test-first world-line, marker, converter/record-upgrade and engine-line-replacement regressions failed before their implementations. Final `node --test tests/*.test.js`: **338/338 pass**; `node tools/generate.js --check`: **11 outputs current**.
- Independent enemy/ally visibility, per-line color washes, and **container** opacity preserve native child opacity. World and preview use the same plan/apply ledger; feature release, master-off, spectator roles, closed unit gates, line/container replacement and reinclusion restore captured inline values or clear absent overrides.
- Marker follows v2: always visible while enemy custom-color/visible/marker gates pass, independent of current HP, positioned at the configured threshold on the primary inner interval. Width is converted once from v2 raw units, rendered at least 1px, and clamped; height spans the outer bar. `plan.markerWanted` is the ticket-19 OLD-grid routing hook; no OLD variant was built.
- Generated Indicators rows keep toggles/colors Basic and opacity/threshold/width Advanced. Record version **2** appends slots 83–94, retains the guard and default-change history, and upgrades v1 records without changing existing slots or preset metadata.
- Added `tests/fixtures/v2-indicators-migration.json`: **11** save/code cases covering save schemas 1–5 and HPCR2/HPCRP1 extension versions 1–3, through menu hydration/paste and restart. Matching v2 keys are consumed into real v3 settings, not `v2pending`.
- Re-measured counted ops/bar/s with eight engine lines, line opacity and marker enabled, all core features, representative depth-2 ancestry: **172.5 active / 159.3 idle / 6 dormant**; shield+armor active **266.3**, master-released **11**, split-stock released **12**. Ceilings remain 300/200/30. Line-child reconciliation runs only at the existing one-second carrier cadence.
- Shared `scripts/` adapter unchanged. No build, deploy, game launch, git mutation or in-game FPS/visual-parity claim. Native engine-line creation/restoration and visual geometry remain live-unverified.
