# 15: Indicators: pulse

**What to build:** Low-HP pulse on bars and HP text.

**Blocked by:** 14

**Status:** complete (VM-verified). Build/package and native visual verification remain out of scope. **Live:** the user confirmed it works in game (2026-10-17, [ledger](../LIVE-VERIFIED.md)).

**Runs on:** gpt-6.1-sol (med). **Review:** code-review.

- [x] Matches SPEC story 14
- [x] VM E2E tests boot the real scripts and pass
- [x] Headroom measured before pulse; existing idle ≤160 and active ≤220 probes pass
- [x] Enemy/ally thresholds, colors, rate, intensity and native HP-number gates match v2
- [x] Pulse-off and master-off restore captured native animation, label styles and parents
- [x] Converter corpus, version-boundary upgrade, presets/scopes and restart covered
- [x] Pulse-active budgets include shield/barrier and worst-case customized arrows

## Evidence (2026-10-14)

- Red-first [headroom](../../.tmp/hpv3-ticket15-headroom-red.txt), [pulse world/preview](../../.tmp/hpv3-ticket15-pulse-red.txt), [upgrade/default-authority](../../.tmp/hpv3-ticket15-upgrade-red.txt) and [addition-history guard](../../.tmp/hpv3-ticket15-history-red.txt) regressions failed before their fixes. Final `node --test tests/*.test.js`: **405/405 pass**; `node tools/generate.js --check`: **11 outputs current**. [Full suite](../../.tmp/hpv3-ticket15-tests.txt), [generator check](../../.tmp/hpv3-ticket15-generator.txt).
- Pulse follows v2's inclusive low-health threshold, default enemy on/ally off, 25% threshold, 75 BPM and intensity 1. BPM means an alternate animation leg of `60 / BPM` seconds. Per Main's clarification, the shipped v2 **brightness** keyframes remain on fills/native numbers (subtle 1.15→0.85, medium 1.5→0.5, intense 2→0.25); the gradient color overlay uses v2's **opacity** ranges. CSS classes drive paint-only animation; no layout animation or per-frame JS writes.
- Custom bar colors gate the fill pulse; adopted native HP text has its independent readout pulse gate. Enemy pulse-time font size/offsets apply independently of HP animation. HP text keeps its configured bands rather than the fixed pulse wash, including `0px 0px 0px <w> #10130D`; strength 5 and release restore captured stock rather than substituting a hardcoded outline. Zero HP, threshold crossing, fixed/gradient modes, all three intensities, bar-colors-off, HP-off and master-off are VM-covered.
- Enemy pulse hide-bar preserves bound data at opacity `0.01`, also hides the kill marker and ultimate background, and restores on exit. The follow-mode ultimate uses the fixed pulse color; custom ultimate color stays independent. Overlay clipping follows actual fill coverage, while activation uses shield/barrier-corrected health.
- World and preview share facts→plan→apply and the ownership ledger. The preview HP slider starts/stops the same pulse, including the passive overlay and native label outline. The menu now includes the shared world indicator stylesheet rather than maintaining duplicate shape/pulse rules; the VM cascade uses only each layout's included sheets. Preview stamina's native origin is corrected to **9px** and computed arrow/circle/box presentation is covered.

### Counted ops/bar/second

Same ten-second existing harness, eight engine lines, four native stamina pips, all core features, nonstock ultimate size/offset and marker. These are deterministic synthetic counts, **not FPS**. [Before](../../.tmp/hpv3-ticket15-before.txt); [pre-pulse headroom](../../.tmp/hpv3-ticket15-pulse-red.txt); [final scenarios](../../.tmp/hpv3-ticket15-tests.txt).

| Scenario | Ticket 14 before | After headroom, no pulse | Pulse + overlay + native number |
|---|---:|---:|---:|
| Active, customized shapes | 209.5 | 179.2 | 186.2 |
| Idle, customized shapes | 198.7 | 159.4 | 159.4 |
| Shield + barrier active, shapes | 285.5 | 246.2 | 253.2 |
| Dormant closed unit | 6 | 6 | — |
| Master released / split-stock released | 11 / 12 | 11 / 12 | — |

- Idle cost profile: native class reads **100.4→54.4**, layout **47.5→47.5**, style reads **26.8→26.8**, parent reads **16→16**, text reads **1→1**, traversals **7→13.7**, writes/parses **0**. The added traversal cost buys a cheap **0.15s native line-count check**, so new engine lines are washed on the next probe instead of waiting a second.
- Headroom comes from caching native line/icon identity classifications against live child lists, moving shape depletion to native-class CSS, and skipping critical-outline flags when a custom/disabled outline does not consume them. Child replacement/count, mutable depletion classes, role recycling and stock return remain covered. Fill/layer signal freshness, one-second ownership/level checks and 1.5-second geometry cadence are unchanged.
- Customized all-available **arrow** pulse cases remain **183.4 idle / 277.2 shielded active**, inside the **200/300** contract. The stricter headroom target is reached by the existing customized-shape harness, not by every arrow preset. **Arrow depletion may lag up to 1s; accepted at v2 parity to preserve exact `offBlack` color rather than tint it through a custom parent wash.**

### Records and review corrections

- Record **v5** appends pulse slots **111–131** from `settings/schema.json`; no settings absent from v2 were added. [Twelve pulse corpus cases](../tests/fixtures/v2-pulse-migration.json) cover save schemas 1–5, HPCR2/HPCRP1 extension versions 1–3, legacy offsets, hydration/import and restart.
- Slot introductions now have immutable `slotAdditions` history, separate from actual `defaultChanges`. New slots still require a version bump; existing semantic/default changes still require their own covered bump. Existing slots cannot be relabelled as additions. Default settings save/export sparsely again instead of forever emitting indicator defaults.
- Pending promotion uses the record's **version boundary**, never a default-value heuristic: v1/v2 use boundary 1 for ticket-12 dev compatibility; v3+ use their own version. Only subsequently introduced slots take pending values. Each mapped entry is then consumed even when an existing v3 choice wins; unmapped features remain pending. Deliberate defaults, active settings, presets, scopes, repeated save/restart and no conflict resurrection are VM-covered.
- Accepted Audit15 compatibility limitation: boundary 1 may override edits made in the unreleased, dev-only v2 record format; this preserves its pre-promotion retained values by explicit version policy.
- v1's retained raw `enemyKillMarkerWidth` and its condition value divide by 10 exactly once: **10→1px, 50→5px** through real store hydration, presets/scopes and restart. Already-converted offsets stay unchanged; pending historical ultimate size retains its percentage-to-pixel conversion.
- Review corrections include the missing **level-35 `#8b0000` rim**, a consistent **68px** unplaced/placed ultimate origin, native custom-color-off stamina wash, immediate shaped depletion, and the preview stylesheet/origin fixes above. Prior ticket-13/14 counts and heuristic evidence are historical; this ticket supersedes them.
- No builds, deployments, game launches or git mutations; no native visual parity or measured FPS claim.

## Audit15 follow-up in ticket 16

- World-only ID-specific pulse selectors now outrank stock critical fill animation, retaining the generic preview/HP-number rules. VM enemy/ally cases cover both critical classes, all intensities and stock release.
- Pulse thresholds and color bands now floor `fraction × 100` like v2: 25.5% belongs to threshold 25; 0.9% pulses at threshold 0. Red-first regressions and final **434/434** suite evidence are recorded in [ticket 16](16-indicators-pickups-and-rejuvenator.md#evidence-2026-10-14).
