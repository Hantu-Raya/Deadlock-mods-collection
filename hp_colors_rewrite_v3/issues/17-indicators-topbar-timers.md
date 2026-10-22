# 17: Indicators: topbar timers

**What to build:** Topbar pickup and ultimate timers as an independent module with its own settings section and message hook.

World ultimate progress on the bar badge belongs here too, sharing ultimateTimerEnabled/size/color with the topbar as in v2; reuse ticket 13's pixel `ultSize` for world badge scale.

**Blocked by:** 16

**Status:** complete (VM-verified, including Audit17/AuditWhole-2 fixes). Build/deploy/live visual parity and final assigned reviews remain separate gates. **Live:** the user confirmed it works in game (2026-10-17, [ledger](../LIVE-VERIFIED.md)).

**Runs on:** gpt-6.1-sol (med). **Review:** code-review + claude-fable-5-1 review.

- [x] Renderer never parses timer messages
- [x] Matches SPEC story 15 (topbar part)
- [x] VM E2E tests boot the real scripts and pass
- [x] Native publish → sibling relay → topbar countdown; freshness, expiry, pause and lifecycle
- [x] World ultimate progress and badge/flame scale gates; off/master-off restore stock
- [x] Converter corpus, v7 boundary promotion, settings-code cap and operations ceiling
- [x] Layout includes, timer script and ultimate artwork wired into the build asset contract

## Carried from Audit13 (P3)

Completed: `unit_info_bg` and the adopted flame scale only while `ultimateTimerEnabled` is on, restoring captured scales when off (timer/renderer VM regressions).

## Native world integration from ticket 16

- World pickup icons use native `StatusEffects/StatusEffectContainer` pickup classes, not snapshots. Ticket 16 provides shared `pickupTimersEnabled`, four pickup colors, darkness, glyph color, pixel size/spacing/offsets and ledger-owned native styling. Reuse these settings for topbar timers; do not add duplicate world settings.
- Complete v2's transported scan gate (freshness/session), local-name exclusion, native radial progress sampling/publication and topbar snapshot/countdown identity guards. The independent timer module owns message parsing; pass renderer-facing gate facts through a small hook/interface, never parse timer messages in the renderer. Preserve the 3s native sampling cadence and release pickup styling when the gate closes.
- Gate both `ultBackground` and adopted `killStreak` scale ownership with `ultimateTimerEnabled`, including default 100%/20px size, restoring captured scales when off. Flame adoption/placement remains renderer-ledger-owned and must not gain a second parenting/style owner.

## Evidence (2026-10-14)

- Independent [timer module](../panorama/scripts/hp_colors_v3_timers.js) registers the renderer's opaque-message/state hooks. Only that module parses `HPV3_PICKUP_SNAPSHOT`, `HPV3_PICKUP_SCAN_GATE` and `HPV3_ULTIMATE_SNAPSHOT`; their magic is separate from v2. The renderer consumes gate/progress facts and keeps sole ledger ownership of world styling and flame adoption.
- [Timer VM E2E](../tests/timers.test.js) covers native radial samples and prediction fits, the 3s world cadence, relay dispatch from a sibling, balanced topbar wings (including 15→12→15 and 6→9→15), 6s pickup/2s ultimate heartbeats, 24s pickup/12s ultimate expiry, 15s gate freshness, local-name/session/identity/duplicate/replay guards, pause, native ready state, off/master-off, late config, carrier replacement, teardown, reinclusion and native-name races. Frozen/finished world ultimate prediction sleeps; HUD loops recover and reschedule after native exceptions. Without the hook, timer messages cause **zero renderer JSON parses**, including a name containing the config magic.
- v2 parity clarification: the topbar ultimate remains native and is sampled/published, not replaced by another custom ring. Size/colors/darkness drive world progress. The preview uses the same world artwork/plan. `ultimateTimerEnabled` gates both badge and adopted flame scale, including the default 20px/100% scale; disabling it restores captured scales.
- Record **v7** appends slots **147–151**, reuses `ultSize` and existing pickup settings, and promotes pending timer keys at the boundary. [Eleven legacy corpus cases](../tests/fixtures/v2-timers-migration.json) cover all five save schemas and HPCR2/HPCRP1 extension versions 1–3. The flat wire, future-save guard and **4096** cap remain unchanged. Numeric exports now canonicalize to each setting's step grid; exhaustive grid text widths give **2126 characters**, leaving **1970 characters margin** ([codec evidence](../.tmp/audits-fix-codec-green.tap)).
- Audit16's flame layering and clean converted scales remain. Audit17/AuditWhole-2 fixes read live percent-only clips before optional style signals, query four pickup classes every 3s instead of walking/classifying each effect in JS, and refresh the list immediately before sampling. Pickup class reuse is rechecked each scan; child caches also key panel id. Ordinary effect churn no longer adds native API calls per effect.
- Final `node --test tests/*.test.js`: **489/489 pass** ([suite](../.tmp/audits-followup-suite.tap)); `node tools/generate.js --check`: **12 outputs current** ([check](../.tmp/audits-followup-generator-check.tap)). [Timer observations](../.build/evidence/timers/release/timers-transcript.json) retain VM messages and panel state. These are synthetic operation counts, not FPS.
- [Build wrapper](../../build_hp_colors_rewrite_v3.ps1) requires the topbar layout, timer script and `hpv3/ultimate_progress` texture alongside the generated world include. No build, deployment, game launch or git mutation was performed; native visual parity remains unverified.

## Audit-fix evidence (2026-10-14)

- Topbar XML is now vendored at the existing game-data commit, SHA256 `c5e3deda5bae86e08fff887fa18a933c2def480b4d6e3d54122c76266cefa134`. Pin/hash, unique-anchor, generated-currentness and mocked upstream-topbar-drift checks pass. If ShowRank pak89 overrides that layout, missing first-gate authority closes world pickups and ultimate progress without stopping healthbar rendering; compatibility is recorded in [ticket 26](26-release-at-parity.md) and SPEC.
- HUD discovery/ultimate/progress loops retry native exceptions; progress reschedules normally only while rings move, and retries explicitly on error. Completed rings stop polling and wake on new moving models. Pause-panel searches occur only on 5s discovery. Pickups arriving between scans appear within one 3s interval; reparented icons retain wing order.
- Pulse-hide ultimate-background opacity, ultimate gradient blending and custom-ultimate follow tint have rendered-panel assertions. [Latest mutation evidence](../.tmp/audits-followup-mutations.tap): **15/15 retained mutants killed**, including the three previously surviving cases; two mutations of intentionally removed enemy guards were dropped.
- Indicators keep ultimate size with ULTIMATE and one TIMERS group per shared column. Help uses player language; search keywords remain. Identity upgrade steps derive from slot additions while changed-default versions still require explicit steps. Preview/world level geometry shares one CSS rule set. Absent `D:/hpv2-store` skips **9** hosted-page tests with a reason; pinned storage tests still run ([absent-checkout evidence](../.tmp/audits-fix-store-absent-green.tap)).
- Shared adapter class queries count **one native call**, with walked nodes tracked separately (not hidden in COUNTED). Adapter consumers: **730 passed, 1 pre-existing Closure-build skip, 0 failed** ([log](../.tmp/audits-fix-adapter-consumers.tap)). `scripts/measure-hp-colors-rewrite-v2-refactor.js` ran before/after: v2 numeric operation counts, callbacks and observed behavior are **unchanged**; editor exports gain only a zero-valued node counter ([before](../.tmp/audits-v2-before.json), [after](../.tmp/audits-v2-after.json)).
- `StaminaRecentlyUsed` handling and the `killMarkerWidth` **0.3** default are unchanged, as requested. No builds, deployments, launches or git mutations were performed.
- Verification-audit follow-ups are fixed ([red VM evidence](../.tmp/audits-followup-red.tap)): hidden percent-clipped shields/barriers retain `HasHealth` and their live clip in the regression. Visibility is refreshed on each 1.5s full paint or changed fill/layer signature, including the engine's `visible` flag, without restoring idle hot-path reads. Snapped settings receive final validation before export, so threshold collisions fail atomically rather than producing unreadable codes. Pickup help now says the setting restyles the game's icons; every pickup row is searchable as **powerup**.

### Worst measured operations per bar per second

Full ultimate gradient/heartbeat traffic, four pickups, customized arrows, pulse and HP-number settings. Shielded cases include both bullet shield and barrier. COUNTED keeps its original categories; validity, UI-scale reads and native class-query node visits are separate. Fixture engine mutations are excluded from renderer calls.

| Scenario | COUNTED | Validity calls | UI-scale reads | Class-query nodes walked |
|---|---:|---:|---:|---:|
| Active + shields + 12 effects | 219.3 | 240.6 | 47.5 | 180.8 |
| Idle + 12 effects | 179.5 | 240.6 | 47.5 | 180.8 |
| Dormant closed-unit gate | 6 | 4 | 0 | 0 |
| Released / split-stock | 11 / 12 | 42 / 39 | 0 | 0 |
| Idle + shields + 12 effects | 194.3 | 240.6 | 47.5 | 180.8 |
| Idle + shields + 12 new effects every 3s | 194.3 | 240.6 | 47.5 | 46.4 |
| Idle + shields + 24 new effects every 3s | 194.3 | 240.6 | 47.5 | 65.6 |
| Idle + shields + 96 effects (six art children each) | 194.3 | 240.6 | 47.5 | 1256 |

All counted cases remain below **300 active / 200 idle / 30 dormant**. A separate **1500 class-query nodes/bar/s** ceiling is enforced: measured worst case **1256**, headroom **244** (19.4%). Native tree work still grows with tree size; this is not a runtime-time or FPS measurement. [Latest full counters](../.tmp/audits-followup-ops.json); original red evidence: [ops/reuse](../.tmp/audits-fix-ops-red.tap), [canonicalization](../.tmp/audits-fix-codec-red.tap), [pin/boot gate](../.tmp/audits-fix-pin-gate-red.tap), [timer recovery/freshness](../.tmp/audits-fix-timers-red.tap), [menu grouping](../.tmp/audits-fix-menu-red.tap).
