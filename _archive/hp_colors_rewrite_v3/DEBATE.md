# Debate log: v3 plan

Participants: Claude (draft author) and `anthropic/claude-fable-5-1` at medium effort (pinned agent `.omp/agents/fable51.md`). Fable wrote an independent proposal before reading the draft. Full transcript: `agent://FableDebate`.

## Where both proposals converged independently

Schema-driven core, renderer split into a pure core and an applier, migrate v2 once at a boundary and never write v2 keys, keep the VM `MockPanel` adapter but not v2's 19k test lines, renderer core shipped as a drop-in pak02 before the editor.

## Round 1: Fable's challenges

| Topic | Draft | Fable | Outcome |
|---|---|---|---|
| Record format | Full canonical records | Sparse diff against the record version's own defaults | **Fable.** Verified: settings paste `maxchars="4096"` (`hud_escape_menu.xml:1313`), store 3,000×64 chars (`hp_colors_v2_storage.js:30-31`), `MAX_PRESET_RECORDS = 128` (`hp_colors_v2_state.js:19`). Fable measured one full record at ~4,950 base64url chars (not re-measured by Claude). The two default sets came from unversioned default changes, not from sparseness. |
| Storage keys | New v3 keys on the same page | Page hard-codes v2 keys; needs a page version bump and publish | **Fable.** Verified at `D:/hpv2-store/index.html:11-12,71-72`. |
| Phase 0 parity corpus | Record v2 style writes | A trap: freezes v2's unit systems and baseline quirks | **Fable.** Corpus covers migration only; visual parity is a few screenshots. |
| Generated menu | Generate menu XML | Agree; ids are runtime API, generate the id list too; write source XML before compile; dynamic rows stay dynamic | Adopted. |
| Renderer plan/apply | Pure plan, ledger apply | Agree; geometry is a feedback loop, so plan takes measured layout and tolerates one settling tick; memoise the plan | Adopted. |
| Missed items | — | Performance gate, pak exclusivity, transport magic rename, rollback, topbar override coupling for timers | Adopted. |

## Round 2: Claude's counterpoints

| Topic | Claude | Fable | Outcome |
|---|---|---|---|
| Dormancy | Fable deleted the 5th-scan heuristics; v2 measured dormant objective scans at ~20% of HPv2 time (`AGENTS.md:102`). Proposed: never scan closed-gate kinds | Panels are recycled across kinds without a generation change, so "never scan" misses building→player reuse. Keep one cheap carrier-class read per scan; the plan memo removes the paint/drift cost | **Fable's amendment.** One rule replaces the counters. |
| Undo | Keep a bounded stack of immutable records | Agree; keep slider gesture coalescing (`hp_colors_v2_state.js:2871-2874`) | Adopted. |
| Page keys | Regex `^hantu\.hpcolors\.v\d+/state(\.prev)?$` so future versions need no page publish | Safe: same-origin pages can already read every key. Anchor the pattern, scope delete to the requested key (`index.html:59-60` deletes both fixed v2 keys), bump `VERSION` | Adopted, except the `VERSION` bump: found later that v2 bridges accept only page version 1 (`hp_colors_v2_storage.js:395`), so a capability flag replaces it (`PLAN.md` D8). |
| Timers | Own module, stay in pak02 | Agree; register a message hook so the renderer never parses timer traffic | Adopted. |
| Scheduler | active / settling / idle-probe / dormant | Cut settling: it is active with a 2 s timer | Adopted: three states. |

## Still open (needs you)

1. ~~Feature cut~~ Settled after the debate: full parity, built in stages (`PLAN.md` section 5).
2. ~~Publishing hosted page v2 before v3~~ Settled: early, on its own (`GRILL.md`).
3. ~~Which build variants keep shipping~~ Settled: normal first, others later (`GRILL.md`).
