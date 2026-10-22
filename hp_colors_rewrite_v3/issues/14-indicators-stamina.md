# 14: Indicators: stamina

**What to build:** Enemy stamina as arrows, circles or boxes with color and size.

**Blocked by:** 13

**Status:** complete (VM-verified). Build/package and live visual verification remain out of scope. **Live:** the user confirmed it works in game (2026-10-17, [ledger](../LIVE-VERIFIED.md)).

**Runs on:** gpt-6.1-sol (med). **Review:** code-review.

- [x] Matches SPEC story 13
- [x] VM E2E tests boot the real scripts and pass
- [x] Each shape preserves native count/state and supports color, size and position
- [x] Customization-off and master-off restore stock
- [x] Converter corpus and generic pending-promotion upgrade covered
- [x] Ops ceiling holds

## Evidence (2026-10-14)

- Red-first world/preview regressions exposed missing stamina controls and preview parts. The renderer now styles the engine's `StaminaContainer` / `.StaminaPipIcon` tree; it never creates world pips, writes their visibility, or infers count from an unrelated data source. `PipEmpty`, `StaminaRecentlyUsed` and `StaminaRecentlyDepleted` on either icon or parent determine depletion, as in v2.
- Enemy eligible-player gate only; allies, local/ambiguous/neutral/objective carriers, optional-part disappearance, native replacement, script reinclusion and master-off release exact captured inline values/classes. Customization remains independent of bar-color/visibility settings. Returning arrow, dimensions 11/4.48px, zero offsets and custom-color off returns stamina to stock; **v2 has no stamina visibility/enable toggle**, so none was added.
- Arrow dimensions retain v2's 8×12px texture mapping and independent stretch; circle/box dimensions use converted CSS pixels, 1px rims, white/custom filled interiors and black depleted interiors. Stock-equal dimension values intentionally release to native 8×12 geometry even for shapes, preserving v2's behavior. Offsets are unscaled and independent of bar motion.
- Seven enemy Indicators controls come solely from `settings/schema.json`; record **v4**, append-only slots **104–110**, with the slot/history guard intact. The preview's two-available/one-empty sample is painted by the same facts→plan→apply and ownership ledger, not a second stamina renderer.
- [Twelve converter corpus cases](../tests/fixtures/v2-stamina-migration.json) cover save schemas 1–5, HPCR2/HPCRP1 extension versions 1–3, all shapes, legacy missing-shape box derivation, hydration/paste and restart. Generic promotion covers v1/v2/v3 records, active settings, presets and retained scopes without converting CSS pixels twice.
- Review13 P1 is fixed at the shared promotion boundary: default-valued explicit slots no longer suppress pending values. Nondefault v3 choices remain authoritative; conflicting/ambiguous pending metadata is retained, not discarded. A red-first real VM codec v1 hydration → ticket-12-format default-emitting save → current page hydration/restart regression covers lines/washes/markers plus stamina; default-emitting stamina-slot conflicts are covered separately.
- Final `node --test tests/*.test.js`: **377/377 pass**. `node tools/generate.js --check`: **11 outputs current**. [Retained full transcript](../../.tmp/hpv3-ticket14-tests.txt); migration page traffic is retained by the existing storage evidence harness.
- Counted ops/bar/s with eight engine lines and four native stamina pips: **209.5 active / 198.7 idle / 6 dormant**; shield+armor active **285.5**, master-released **11**, split-stock released **12**. Idle and shielded scenarios use all four pips available (worst-case six state-class checks per icon), with no idle writes. Existing cadence and **300/200/30** ceilings are unchanged.
- Budget fixes remove redundant stamina parent reads, test the common small health-line class first, read each adopted name/value parent once, and skip layer extent reads only when the existing percentage-clip path does not consume them. [Initial budget failure](../../.tmp/hpv3-ticket14-focused.txt), [full-pip baseline](../../.tmp/hpv3-ticket14-full-stamina-before.txt) and [final renderer evidence](../../.tmp/hpv3-ticket14-renderer.txt) retain the measurements. VM counts are not FPS evidence.
- No builds, deploys, game launches or git mutations; no claim of native visual parity or measured FPS.
- **Ticket-15 follow-up:** [Pulse/headroom evidence](15-indicators-pulse.md) supersedes the promotion heuristic in line 25: version-boundary promotion now consumes mapped conflicts and preserves deliberate v3+ defaults, with a v1/v2 dev-format exception. Shaped depletion is native-class CSS-owned; custom-color off restores the native container wash. Shared preview indicator CSS and the 9px native stamina origin are fixed. The 377-test/count transcript above remains the historical ticket-14 boundary.
