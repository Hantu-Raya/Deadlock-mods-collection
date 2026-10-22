# Renderer plan apply prototype

Type: wayfinder:prototype (HITL)
Status: Closed
Blocked by: none

## Question

Does facts -> plan -> apply with a memoised plan and three scheduler states meet the ticket 05 budget for player bars?

## Notes

Throwaway prototype on the VM adapter: one player bar, color + geometry + native HP text. Measure against ticket 05. Candidate for pstack-style `/arena` (two or three attempts).

## Resolution

Resolved for the requested one-enemy-player slice: **facts → memoised plan → ownership-ledger apply holds in the VM, and all three accepted ceilings pass**. This is a throwaway architecture prototype, not v3 parity or a live-performance claim.

Produced [failure modes](../prototypes/renderer/FAILURE-MODES.md) before code, [renderer](../prototypes/renderer/renderer.js), and [E2E tests](../prototypes/renderer/renderer.test.js). The local `index.js` makes the exact directory-form command resolve on Node v25.9.0.

Verification: `node --test hp_colors_rewrite_v3/prototypes/renderer/` passed **14/14 tests, three final serial runs**; every operation counter was identical across those runs.

| Scheduler/fixture | Prototype counted operations/bar/s | Accepted ceiling | Ticket 05 v2 comparison |
|---|---:|---:|---:|
| Active enemy player, alternating 50%/80% HP | **175.0** | 300 | ~360–388 (enemy player: 388.3) |
| Idle enemy player, 50% HP | **159.8** | 200 | ~257–280 (enemy player: 273.3) |
| Dormant enemy objective, gate closed | **11.0** | 30 | ~41–46 (enemy objective: 40.8) |
| Dormant master-off enemy player | **11.0** | 30 | 153.8 |

The [ticket 05 counting rule](../research/05-performance-baseline.md#counting-rule) is unchanged: sum traversal, parent/class/style/text reads and writes, layout width, and uniformly instrumented layout height/x/y-offset reads; divide by ten simulated seconds, not callbacks or wall time. Each fixture settles for 5 s plus 1 s warmup. Active inputs change every 100 ms; exactly 100 injected clip writes are excluded. Observation reads happen after the counter snapshot. Callbacks are 6.6/s active/idle and 1/s dormant, reported separately. All settled windows have zero traversal calls. Test diagnostics reproduce the full per-operation breakdown.

Behavior proven through booted runtime: fixed/gradient paint; CSS-pixel size/position without double UI scaling; original native label identity/adoption/restoration without renderer text writes; explicit captured-stock and pinned-fallback release; master off/on; objective/player recycle with a fresh ledger; replaced/dead/moved lineage; late-child recovery; side-as-data config normalization; config/facts memo invalidation; pure planning; unchanged-style suppression; 1.5 s idle full paint; geometry settling/unlaid recovery; single scheduled loop and stop. Thirty first-hit phases measured **100 ms mean / 150 ms maximum**, matching v2's synthetic response.

Limits: v2's measured fixtures include pips, shields and other features absent here, so the numerical comparison demonstrates budget feasibility for this slice, not equivalent-feature savings. The prototype supports percent-clip spans and normalized width/scale signals; pixel clip and arbitrary transform variants remain outside its verified signal subset. Unverified failure modes from the inventory: native binding/layout/pixel appearance, stock CSS drift/class-specific fallbacks, engine/other-mod overwrites of owned styles or changing stock during ownership, partial native API exceptions, dead original-parent restoration, geometry taking multiple settling ticks, many-bar scaling and boot/release cost ceilings. Ledger-only diffs deliberately do not repair external style overwrites. No Deadlock launch, build wrapper, deployment, VPK installation or FPS measurement occurred.

