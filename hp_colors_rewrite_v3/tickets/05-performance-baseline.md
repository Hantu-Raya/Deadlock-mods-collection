# Performance baseline

Type: wayfinder:task (AFK)
Status: Closed
Blocked by: none

## Question

What native-call and wall-time budget per bar must v3 beat?

## Notes

Run `scripts/measure-hp-colors-rewrite-v2-refactor.js` and `scripts/profile-hp-colors-rewrite-v2-reads.js` on current v2 (follow `optimize-measured`). Record calls/s for active, idle and dormant bars of each kind. No game launch.

## Resolution

Measured current v2 in [research/05-performance-baseline.md](../research/05-performance-baseline.md). Both requested scripts completed three runs; the read profiler ran three times in each mode. A read-only stdin supplement reused the existing fixtures to cover enemy/ally heroes, enemy/ally NPCs, neutral camps and enemy/ally objectives with gates on/off and master-off dormant states. Commands, source hashes, call-type rates, three-run wall timings, latency and measurement limits are recorded.

All operation counters had zero run-to-run spread. Uniformly instrumented, settled V2-style fixtures measured 359.9–388.3 counted operations/bar/s active and 257.3–279.7 idle. Closed nonhero gates measured 40.8–46.4 dormant; master-off heroes measured 153.8. Hero color toggles off are not dormant while HP text remains enabled. Idle first-hit response was 100 ms mean / 150 ms sampled maximum; neutral fixed-fill presentation was not measurable through the color observable.

**Proposal for the user to confirm, not a decided ceiling:** V2-style ≤300 active / ≤200 idle, OLD-style ≤450 active / ≤250 idle, and every dormant kind ≤30 counted operations/bar/s; retain sampled idle first-hit mean ≤100 ms and maximum ≤150 ms. Apply per fixture/kind, not an average. No VM wall-time acceptance threshold is proposed.

These are synthetic native-call proxies under the research file's explicit counting rule, not exhaustive native API crossings or an FPS result. Before adopting a full native-call ceiling, instrument omitted APIs and rebaseline v2 with that metric. Additional feature-heavy presets and OLD paths by kind still need baselines. Research is complete; user confirmation of the proposed budgets remains open. No game, deployment, build wrapper, test suite or v2 source edit occurred.

User decision (2026-10-14): ceiling accepted as proposed: 300 active / 200 idle / 30 dormant counted operations per bar per second, measured with the ticket's harness. It becomes a failing test in v3 (PLAN D12).
