# Hosted page protocol extension — independent verification

Verified on 2026-10-14 against [PLAN.md D8](../../_archive/hp_colors_rewrite_v3/PLAN.md#d8-storage-same-page-same-protocol-version-new-capability) and [GRILL.md](../../_archive/hp_colors_rewrite_v3/GRILL.md).

**Reviewed commit:** `75e76209f4bdfaada1c79a05d9285c95f8c8c656`, branch `hpcolors-v3-keys`, repository `D:/hpv2-store`. No page defect was found, so no corrective page commit was needed. The assigned test suite had a real assertion gap; it is now strengthened. The store checkout was restored to clean `main`. Publishing still needs the user's go-ahead; nothing was pushed or deployed.

All `D:/hpv2-store` line references below refer to the reviewed feature-branch commit, **not** the restored `main` checkout.

## D8 review

| Requirement | Verified implementation |
|---|---|
| Versioned state keys | `index.html:13,39-40` defines and checks `^hantu\.hpcolors\.v\d+/state(\.prev)?$`. Reads, writes and named deletes validate before accessing storage (`:68-69,81-86,97-98`). |
| Named delete removes exactly its target | `index.html:63-73` calls `removeItem(request.k)` only. Current and previous keys are independent targets. |
| Keyless v2 Forget removes both v2 keys | `index.html:64-66` removes only v2 current and previous. It does not enumerate storage or touch v3/other-mod keys. |
| Wire version remains 1 | `index.html:9-10,59-60` retains `VERSION = 1` and `HPV2S1:`. Ready adds `c: ["vkeys"]`; existing `i`, `o`, `ok`, `v`, `h` and sequenced `q` remain. |
| Writes remain compatible and isolated | Missing `k` defaults to v2 current (`index.html:97`). Chunk staging binds the key (`:104-110`); backup rotation uses that key's `.prev`, while explicit `.prev` writes create no extra backup (`:124-131`). |
| README updated | `README.md:38-54,169-171` documents optional keys, named/keyless delete, the key pattern, version 1 and the required v3 capability. |
| Buff Timer and DLF unchanged | Full `bt/` and `dlf/` Git trees are identical between `main` and the reviewed branch; evidence below. |

The future v3 bridge must check for `vkeys` before any dependent storage operation. This review verifies the page's advertisement, not an implemented v3 bridge. The transport/record envelope remains `HPV2S1.<checksum>.<payload>` even when the settings body is a v3 record.

## Compatibility with actual v2 requests

The unchanged caller is `hp_colors_rewrite_v2/panorama/scripts/hp_colors_v2_storage.js`:

- `:16,389-403`: ready accepts exactly page version 1 and a trusted page address. The added `c` field is ignored by v2.
- `:279-288`: reads send `i`, `r`, `p`, `o: "r"`, and an explicit v2 `k`.
- `:289-296`: chunked writes send `i`, `r`, `p`, `o: "w"`, `n`, `v`, and `e`, **without `k`**. The reviewed page retains the v2 default.
- `:296-297`: Forget sends `o: "d"` without `k`; the page retains both-v2-key deletion.
- `:343-384`: replies still provide the operation, success flag, chunk index/count, read presence/value, and final write acknowledgement expected by the bridge.

The v2 suite loads the actual local inline script (`scripts/validate-hp-colors-rewrite-v2-storage.test.js:43-44,143-167`), rather than a protocol replica. It exercises full real-script restore/save/restart flows, chunked saves, backup safety, Forget and failure paths in synthetic Panorama/CEF contexts. No files under `hp_colors_rewrite_v2/` were edited.

## Test review and regression evidence

The original seven-test draft requested deletion of `V3_PREVIOUS` but never asserted that this key disappeared. An in-memory page mutation that skipped every named `.prev` deletion still passed that original suite (Node exit 0). This was a **test defect**, not an observed page defect.

`../tests/store-page.test.js` now:

- Checks complete resulting storage and exact remove calls for every v2/v3 current/previous named deletion (`:120-133`).
- Checks operation, success/error consistency, chunk index and fresh reply sequence for each exchange (`:59-73`). A response with `ok: false` and `d: 1` can no longer satisfy a write test.
- Records storage access and proves rejected keys cause no read/write/delete access; covers malformed, foreign, missing-read and non-string keys (`:35-47,148-165`).
- Exercises numeric versions `0`, `1`, `10`, `003`, and `999999`, including backup rotation and deletion (`:167-183`). This follows the decided regex rather than inventing a narrower version rule.
- Retains capability/version, v3 isolation, explicit backup writes, keyless Forget and multi-chunk target-binding checks.

Seven independent broken-page mutations were then applied **only in memory**, without changing the checkout. The strengthened suite rejected all seven (each Node process exited 1): `.prev` deletion no-op; version bump; absent capability; keyless delete also erasing v3; removed chunk-key binding; `ok: false` with commit acknowledgement; and invalid-key storage access. These mutation probes were temporary; no instrumentation was added to the page.

## Required suite results

Both commands ran from Deadlock-mods-collection while `D:/hpv2-store` was checked out on the reviewed feature branch. Both exited 0. Exact summary lines:

```text
node --test scripts/validate-hp-colors-rewrite-v2-storage.test.js
ℹ tests 48
ℹ suites 0
ℹ pass 48
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0

node --test hp_colors_rewrite_v3/tests/store-page.test.js
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

The v2 suite retains its normal transcript at `.tmp/hpv2-storage-e2e.json`. These are VM results, not a hosted-page, browser, in-game or persistence-across-real-game-restarts verification.

## Branch and checkout evidence

`git diff main hpcolors-v3-keys --stat`:

```text
 README.md  | 17 +++++++++--------
 index.html | 34 +++++++++++++++++++++++-----------
 2 files changed, 32 insertions(+), 19 deletions(-)
```

`git diff --exit-code main hpcolors-v3-keys -- bt dlf` exited 0 and printed nothing. Full directory tree IDs match (identical tracked paths, modes and blob contents, not merely a single page file):

```text
main:bt                 1aeb5e5a0d95341303f2748788a3390bf9d23e2c
hpcolors-v3-keys:bt      1aeb5e5a0d95341303f2748788a3390bf9d23e2c
main:dlf                7961e9a5f28cf8899192709b48a2b88b5a9e2744
hpcolors-v3-keys:dlf     7961e9a5f28cf8899192709b48a2b88b5a9e2744
```

After `git checkout main`, `git status --short --branch` printed only:

```text
## main...origin/main
```

The reviewed branch is still at `75e76209f4bdfaada1c79a05d9285c95f8c8c656`. No page files changed during verification.

## Publishing still needs the user's go-ahead

`hp_colors_rewrite_v2/AGENTS.md:27-37` distinguishes local tests from the hosted page and says a push publishes immediately. PLAN D8 explicitly keeps version 1 for this backward-compatible extension, superseding the older generic version-bump instruction at `AGENTS.md:32`.

After explicit user approval, publish the reviewed commit through the store's publishing branch. Then compare the live page against **this commit**, not the restored old `main` file, and confirm the latest GitHub Pages build reports `built`. Allow up to 10 minutes for caching. A dependent v3 bridge must require `vkeys` and fail closed against an old cached page. Any subsequent build, deployment or game launch needs its own applicable authorization. None was performed here.
