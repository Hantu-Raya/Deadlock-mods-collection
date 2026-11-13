# Hosted page v2 protocol

Type: wayfinder:task (HITL)
Status: Closed (published)
Blocked by: none

## Question

Hosted page v2: key regex, scoped delete, version bump. Approve publishing it ahead of v3?

## Notes

Draft the change to `D:/hpv2-store/index.html` and its README; run the v2 storage suite against it to prove v2 paks still save. Publishing to `Hantu-Raya/hpv2-store` needs the user's go-ahead (`hp_colors_rewrite_v2/AGENTS.md:37`). Buff Timer's `bt/` page must stay byte-identical.

## Resolution

Independently verified PLAN D8 on `D:/hpv2-store` branch `hpcolors-v3-keys`, commit `75e76209f4bdfaada1c79a05d9285c95f8c8c656`. No page defect was found and no corrective page commit was needed. The key regex, exact-target named delete, two-v2-key keyless delete, protocol version 1, `vkeys` ready capability and README all match the decided contract and actual v2 request shapes. Full `bt/` and `dlf/` trees are byte-identical to `main`.

Fixed a real test gap: the previous-key delete test could pass when deletion was a no-op. Strengthened storage/reply assertions and numeric-version coverage; seven in-memory broken-page mutations are now rejected. On the reviewed branch, `node --test scripts/validate-hp-colors-rewrite-v2-storage.test.js` reported `ℹ tests 48`, `ℹ pass 48`, `ℹ fail 0`; `node --test hp_colors_rewrite_v3/tests/store-page.test.js` reported `ℹ tests 8`, `ℹ pass 8`, `ℹ fail 0`. Both exited 0.

Checkout restored to clean `main` (`git status --short --branch`: only `## main...origin/main`). Detailed review, exact suite summaries, tree IDs and limits: [verification evidence](../research/04-hosted-page.md). No push, deployment or game launch. Publishing still needs the user's go-ahead; local VM tests do not establish live-page or in-game behavior.

Main-agent check: the test now reads the page with `git show hpcolors-v3-keys:index.html` (override `HPV3_STORE_REF`), so it passes while D:/hpv2-store stays on `main`: 8/8 against the branch, 1/8 against the current live page (proves it detects the change).

Published 2026-10-14 with the user's go-ahead: `main` fast-forwarded to 75e7620 and pushed. Before the push, v2 storage suite 48/48 and v3 page test 8/8 on `main`. After: GitHub Pages latest build `built` at 75e7620, and `curl https://hantu-raya.github.io/hpv2-store/` matches `D:/hpv2-store/index.html` byte-for-byte (trailing CR ignored). The v3 test now reads `main` by default. Live in-game v2 saving against the new page was not re-checked.
