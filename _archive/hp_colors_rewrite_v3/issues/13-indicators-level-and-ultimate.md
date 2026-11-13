# 13: Indicators: level and ultimate

**What to build:** Enemy level badge and ultimate icon placed relative to the bar.

**Blocked by:** 12

**Status:** implemented; VM E2E and generator verified. Build/package, review and live alignment remain Main-owned and unverified. **Live:** the user confirmed it works in game (2026-10-17, [ledger](../LIVE-VERIFIED.md)).

**Runs on:** gpt-6.1-sol (med). **Review:** code-review.

- [x] Matches SPEC story 12
- [x] VM E2E tests boot the real scripts and pass
- [x] Ops ceiling holds

## Evidence (2026-10-14)

- Red-first VM regressions proved missing level binding, missing ultimate placement/color/scale, missing preview wiring, lost pending upgrades and accessory replacement before implementation. Final `node --test tests/*.test.js`: **358/358 pass**; `node tools/generate.js --check`: **11 outputs current**. Full run: [retained transcript](../../.tmp/hpv3-ticket13-tests.txt).
- Enemy-only level badge uses v2's `{i:player_level}` binding, 21×21px geometry, 27px/67.5px stock origin, level 11/19/27 tier rims and team fallback. Text remains engine-owned; unresolved/zero level and feature-off collapse the added badge. Ultimate readiness remains stock `has_ultimate` CSS, never a renderer visibility write.
- Stock-relative accessory extents use each panel's own axis UI scale, capture only after positive panel/stack/primary layout, and retry on the existing cadence. Anchored gaps/offsets stay unscaled and follow bar motion; unanchored offsets scale per axis and do not follow bar translation, as in v2. Missing, unlaid, replaced, recycled ally/objective and master-off cases restore exact inline styles or clear absent leases.
- The existing preview ready badge is driven by the same facts→plan→apply as the world; no duplicate badge. Generated Indicators rows add enemy level controls and shared ultimate follow/custom color, pixel offsets/size and anchoring. Stock-equal ultimate geometry/size and color-gated follow mode do not retain native inline ownership.
- Record version **3** appends slots **95–103**, preserving the slot guard and prior default-change history. Converter maps level, anchoring, ultimate mode/color/offset keys once; `ultimateTimerSize` 25–200% becomes `ultSize` 5–40px. [Eleven new corpus cases](../tests/fixtures/v2-level-ultimate-migration.json) cover save schemas 1–5 and HPCR2/HPCRP1 extension versions 1–3 through hydration/paste and restart.
- Main's ticket-12 P1 is fixed generically: old-record upgrades promote newly mapped `v2pending` into active settings, presets and retained scopes, remove only consumed entries, retain unrelated metadata, and respect explicit v3 slots. Already-converted pixel offsets/marker widths are not converted twice; historical pending ultimate size alone converts from its retained percentage. Four v1/v2 load/import/restart regressions pass; Review12 inspected the promotion source.
- Re-measured counted ops/bar/s with eight engine lines, marker, nonstock ultimate size/offset, level tier and all core features: **177.5 active / 157.7 idle / 6 dormant**; shield+armor active **269.9**, master-released **11**, split-stock released **12**. All stay within **300/200/30**. Level sampling and accessory reconciliation use the existing one-second carrier cadence; no new timers.
- Per Main's D11 boundary decision, world ultimate progress belongs to [ticket 17](17-indicators-topbar-timers.md), sharing timer enable/size/colors and its independent snapshot hook; no timer parsing or publishing was added here. The badge-origin rule remains in `hp_colors_v3_world.css`; [ticket 11](11-live-test-1-core.md) still must confirm ultimate alignment after `UnitStatus` reparenting.
- No builds, deploys, game launches, git mutations or live visual/FPS claims.
