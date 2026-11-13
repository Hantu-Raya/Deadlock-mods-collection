# 18: Units gates

**What to build:** NPC, neutral and objective gates, off by default; unknown or ambiguous units receive no active customization, but keep the global rectangular/unbacked v2 baseline.

**Blocked by:** 17

**Status:** done — audit findings addressed; VM verification complete **Live:** the user confirmed it works in game (2026-10-17, [ledger](../LIVE-VERIFIED.md)).

**Runs on:** gpt-6.1-sol (med). **Review:** code-review + claude-fable-5-1 review.

- [x] Matches SPEC stories 16-17
- [x] Dormant closed-gate kinds stay under the dormant ceiling
- [x] VM E2E tests boot the real scripts and pass

## Audit fixes

When units become owned, preserve v2's damage-wiggle exclusion for `boss_barracks`, `boss_tier1`, `boss_tier2`, `boss_tier3`, `building`, `CLASS_DESTROYABLE_BUILDING`, `barracks`, `neutral_vault` and `midboss`. Apply the exclusion to the motion frame, not only native UnitStatus; v2 source: `panorama/styles/unit_status_v2.css:1832–1844`. The global rectangular/unbacked outer-bar baseline still applies to closed gates; “stay stock” refers to no active customization, not returning the removed masks/backgrounds.

Current coverage: renderer VM check “closed objective gates never move damage wiggle onto the owned motion frame” exercises all nine kinds above; removing the objective exclusion kills it (`audit0307-red-closed-gates.tap`). This proves today's closed gates only. Ticket 18 owns adding and testing the motion-frame exclusion when these gates can open. `audit0307-red-global-baseline.tap` proves closed gates retain the appended mask/background-removal baseline.

## Implementation

- Units has exactly v2's five opt-ins: enemy/ally NPCs, neutral NPCs, and enemy/ally objectives, plus the fixed neutral fill color. All gates default off. Enabled nonneutral gates use side colors even when player colors are off; neutral NPCs use the fixed fill and enemy geometry/HP settings. Shared contained lines and relation-colored outlines follow v2. Names, levels, ultimate/stamina/kill markers, pickup styling and HP-number pulse/modifiers stay player-only.
- Source correction: v2's actual nonneutral `unit` surface **does** pulse the bar and supports pulse-hide (`unit_status_v2_colors.js:3591–3713`, `syncPulse:3041–3128`), despite the player-only pulse description in v2 AGENTS. The implementation and regression follow source; neutral fill does not pulse.
- v2 kind facts and building precedence are retained. Neutral relation wins before enemy/friend; unknown kinds/relations and conflicting nonneutral ownership receive no active styling. **Deliberate v2 deviations for SPEC story 17:** both `team1` + `team2` and `player` + `midboss` are treated as ambiguous and left uncustomized; v2 accepts the former without a team and gives player precedence in the latter. Release restores captured styles, parents and ordering while retaining the global rectangular/unbacked baseline.
- All nine motion exclusions are covered with gates open, including split carriers. Native `.<kind>.active_damage` CSS selectors also suppress the owned motion frame immediately, before the 1 s classification poll; the owned class remains the fallback for split damage/kind carriers. Eight kinds can own the motion frame. `neutral_vault` is always a neutral **building** in v2 (`classifyUnit`/`resolveSurface:540–595`), so no v2 gate can own it: even with every gate open it remains released, without moving damage wiggle onto the motion frame. No neutral-objective gate was invented.
- Units preview offers NPC, neutral camp and objective samples, uses the real renderer, and returns to a hero on other pages. Its colors, HP adoption, stock release and owned-objective wiggle exclusion are VM-tested.
- Record v8 appends slots 152–157 only; no existing default changes. All six v2 keys map into settings, with schema 1–5 / HPCR2 / HPCRP1 hpv2 1–3 corpus cases and v1–7 pending upgrade cases for session settings, presets and scopes. Three asymmetric patterns distinguish enemy/ally and NPC/objective keys, exercising every gate both on and off. Same-version deliberate v8 values cannot be overwritten by retained pending metadata.
- Closed-side gates are checked before kind/style facts. Eligible heroes skip the four nonneutral NPC facts while NPC and neutral gates are closed. Every fifth dormant check with open unit gates replaces relation probes with kind probes on the cached lineage ancestors; split late kind classes wake within five seconds, with no extra closed-gate calls.

## Evidence

- Red first: `units: enemy NPC gate defaults off…` failed on the absent gate; `Units preview follows NPC, neutral camp and objective gates…` failed on the unclassified NPC sample; `units: v2 nonneutral bar pulse…` failed on absent unit pulse. Dormant `otherGate` / `otherSide` and unknown/all-gates-open probes exposed 33 / 38 ops/s before the cheap wake/release fixes.
- `node --test tests/*.test.js`: **602/602 pass**, zero skips/failures. Retained post-audit run: `../.tmp/ticket18-suite.log`; detailed measurements: `../.tmp/ticket18-evidence.json`.
- `node tools/generate.js --check`: **12 outputs current**; `../.tmp/ticket18-generate-check.log`.
- Renderer checks: five `units: … gate defaults off, owns colors/geometry/HP/lines when on and releases exact stock` cases; unknown/ambiguous/neutral-objective exclusion; owned-objective→unknown release; all v2 NPC facts/building precedence; all-nine open-gate and immediate native-class motion exclusions; late kind-only ancestor wake/recycling; unit bar-pulse parity. Preview and migration checks run through real scripts/menu events and the disk-backed storage seam.
- Unit budgets (10-second windows, representative ancestry depth 2, eight health lines): active **132–149.2**, idle **125.4–136**; with both shield layers active **153.8–166.4**, idle **140–150.6** ops/bar/s. Closed/released gates **6**, opposite-side gate open **20.4** (neutral **16.4**), and unknown/ambiguous/all-gates-open at most **30**, including fifth-check kind probes; all within 300/200/30. Unit native class-query walk count is **0** nodes/bar/s.
- Existing hero/timer stress checks return to the pre-Units polling budget: maximum active **219.3**, idle **194.3**, dormant **11** ops/bar/s; maximum class-query walk **1262.4** nodes/bar/s (ceiling 1500). The tightened hero budget assertion failed at idle 198.3 before the wake-list fix.
- Record v8 worst-case settings-code bound is **2210 characters**, below the unchanged 4096 cap; flat sparse wire and all older paired inputs remain covered. Oversize migration fixture still proves real 192,000-character fallback after unit keys leave pending metadata.
- Audit regressions were red before behavior fixes: NPC/neutral/objective late kind-only ancestors remained unowned after 5 s; immediate boss motion still wiggled before the classification poll. All three late-kind cases now wake in **2800 ms** in the retained run (bound **5000 ms**). The preview points to the exact Customize control without “gate”/“stock” wording while a unit opt-in is off.
- Isolated mutation checks kill removal of the unknown-kind guard (**1/1 failed**), swapped NPC enemy/ally mapping (**17/25 failed**) and swapped NPC/objective mappings (**25/25 failed**). Logs: `../.tmp/ticket18-audit-unknown-kind-guard.log`, `../.tmp/ticket18-audit-enemy-ally-converter.log`, `../.tmp/ticket18-audit-npc-objective-converter.log`. Temporary mutant source copies were removed; authored source was never mutated for these checks.
- No adapter edits, package build, deployment, game launch or git actions. Live visual parity remains a separate release gate.

## Whole-codebase audit 3

- `wakeCarriers` no longer re-adds the four nonneutral NPC tags for player carriers when NPC gates open (dead condition). Hero bars with all gates open now measure 194.3 idle and 219.3 active (were 198.3 and 223.3). Details in ticket 22, "Whole-codebase audit 3 fixes".

## Batch close (2026-10-15)

Whole-codebase audit AuditWhole-3 (m2) findings fixed. Final: suite 923/923, generator current, both builds 0 failed (release e7352671, debug 76d9da02). Live 6782: debug build installed, loads with no Panorama parse errors after splitting oversized selector lists (new --check guard), menu/renderer boot logged, own HUD bar shows the OFF white look. Menu, preview and world-bar visuals for this ticket not yet seen in game.
