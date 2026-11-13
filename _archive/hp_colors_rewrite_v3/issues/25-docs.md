# 25: Docs

**What to build:** AGENTS.md (<= 100 lines), CONTEXT.md, ENGINE.md, LIVE-VERIFIED.md for v3.

**Dependency:** 24 (implemented and VM-verified; native acceptance remains separate).

**Status:** done — documentation only

**Runs on:** gpt-6.1-sol (med). **Review:** code-review.

- [x] Docs match code; no history in agent docs
- [x] Repo AGENTS.md lane entry updated

## ENGINE.md checklist

- [x] 6782: a rule with a 37-selector/2.9 KB selector list fails to parse at runtime and aborts the Escape-menu load; compiler accepts it; keep ≤10 selectors per rule (guarded by `tools/generate.js --check`, ≤10 selectors and ≤1,024 characters per rule).

## Implementation

- Added [AGENTS.md](../AGENTS.md) (53 lines), the glossary [CONTEXT.md](../CONTEXT.md), build-scoped [ENGINE.md](../ENGINE.md) and six focused [ADRs](../docs/adr/). PLAN §3 now routes to ENGINE.
- Updated MAP, SPEC, PLAN and the root v3 lane entry to match source boundaries, generated outputs, id patterns and the through-24 VM state. The live ledger explicitly marks tickets 23 and 24 **NOT live-verified**; no native acceptance was inferred from tests or builds.
- Spot-checked commands and paths against both wrappers, generators, codec, menu watcher, storage and VM suites. Corrected the old `schema.js`/`fromV2.js` names, the promised-but-absent generated documentation table, the side-value shape and control-id shorthand. Kept scalar touched-slot precedence distinct from preset/metadata/order conflict refusal, and documented existing transform-transition exceptions rather than claiming a blanket engine ban.
- Documentation link/anchor and command-target checks passed; no runtime tests, builds, installation, hosted-page publication or game launch were performed for this docs-only ticket.
