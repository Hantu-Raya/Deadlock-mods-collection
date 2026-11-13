# 04: Saving on v3 keys across restart

**What to build:** Settings survive a restart: v3 saves to the hosted page under v3 keys and loads them on next boot; saving status is visible.

**Blocked by:** 03

**Status:** implemented and audited; VM/generation verified (321/321, 2026-10-14). Live checks are in ticket 11.

**Runs on:** gpt-6.1-sol (med). **Review:** code-review + claude-fable-5-1 review.

- [ ] Bridge requires the vkeys capability and fails closed without it
- [ ] Write gate, prev rotation, chunking, retries as SPEC; status SAVING/RETRYING/UNAVAILABLE
- [ ] Newer-version save loads known settings and is never overwritten
- [ ] Debug build logs save and store events
- [ ] Storage E2E across simulated restarts on the fake page passes

## Failure modes (before implementation)

- Old/cached page without `vkeys`, forged readiness, lost navigation/replies or stale replies must not open the write gate.
- Edits before restore, failed reads, corrupt current data and newer-version records must not overwrite recoverable data or rotate corrupt data into `.prev`.
- Chunked saves, concurrent edits, retries and restarts must preserve the latest acknowledged record; v2 keys must never be written.
- Oversize records must be refused visibly before any write. Save status must distinguish SAVING, RETRYING, UNAVAILABLE and saved.
- Release logs must remain silent; debug save/store events must use `[HPV3]`.

## Implementation and failure-mode evidence

`panorama/scripts/hp_colors_v3_storage.js` ports the v2 fragment/title request queue and uses the shared v3 codec. Reads establish the write gate; unreadable data stays closed until an explicit reset confirmation and fresh re-read, and transient failures use an edit-triggered cooldown probe. Newer current/previous records stay read-only, including an unrecognised future body. Current writes explicitly name `hantu.hpcolors.v3/state`; trusted-checksum rotation owns `.prev`. No delete or v2-write operation is exposed.

`HPColorsV3Persistence.create({panel,onLoad,onStatus})` starts explicitly and accepts `change(bundle,mode)` / `dispose()`. A bundle is `{settings,presets,...metadata}`; presets contain `{id,name,settings,...metadata}`. Ordinary early edits merge touched slots into the restored save; settings imports replace settings and their conversion metadata. Bundle/preset-code imports append after hydration, preserving the current look and library; full replacement is a separate confirmed menu action. Saves debounce for 0.5 seconds and retry at 2/4/8 seconds (four attempts total). Read exchanges retry once, hello/navigation readiness is bounded at 30 seconds. The codec version is independent of the menu publisher epoch.

| Failure mode | Observable evidence in `tests/storage.test.js` |
|---|---|
| Missing capability, wrong version/address, forged hello, offline page | `fails closed with ...` cases and `stale hello ids never open a write gate`: zero writes; no-capability/forged readiness also prove zero reads |
| Load/write gate and early-edit data loss | `write gate waits ...`, `edits during hydration retain ...`, `reverting an early edit ...`, and both `code pasted before hydration ...` cases |
| Corrupt/newer data overwritten or backup damaged | Current-corrupt recovery, both-corrupt refusal, newer current/previous protection and future-body-change cases; original current/previous strings remain unchanged where required |
| Chunk/retry/restart corruption | Disk-backed three-launch restart/rotation; chunked 64-preset bundle/latest edit; dropped read reply; dropped commit acknowledgement; finite quota retries; malformed/stale/negative acknowledgements |
| Namespace leakage | Restart test checks both v2 current/previous values plus unrelated QOLLOCK data unchanged; every write request names the v3 current key |
| Oversize/status failure | `oversize save refuses ...`: zero write requests and visible 192,000-character message. Other cases observe SAVING, RETRYING, UNAVAILABLE and Saved |
| Lost bundle metadata or stale scheduled work | Bundle-import/edit/restart preserves Unicode names, hidden flag and routing; disposed controller cancels its pending save |
| Logging | Restart test checks debug read/write/saved `[HPV3]` events in staged debug mode; release harness throws on any logging invocation. `tests/logging.test.js` also checks boot/lifecycle behavior |

Focused source verification: `node --test hp_colors_rewrite_v3/tests/codec.test.js hp_colors_rewrite_v3/tests/storage.test.js` passed **46/46**. Repeatable fake-page disk profiles and full request/reply transcript: `.build/evidence/storage/`; run log: `.build/evidence/0406-tests.log`. These are VM/actual-local-page results, not live Steam CEF/game-restart verification. No installation, game launch or hosted-page change was performed.

Isolated staged-debug runtime verification also passed **46/46**, using `tools/stage-scripts.js --debug` on a separate evidence-stage copy and the same focused VM suites with `HPV3_SOURCE_ROOT` / `HPV3_DEBUG=1`. Log: `.build/evidence/0406-debug-tests.log`; fake-page profiles/transcript: `.build/evidence/storage/isolated-debug/`. This verifies activated debug save/store events, not compilation or live rendering. Default artifacts are retained separately under `storage/release/` and `storage/debug/`; `HPV3_STORAGE_ARTIFACT_ROOT` can isolate another repeatable run.

## Combined acceptance (2026-10-14)

- Final all-v3 source suite: **138/138**, zero skipped/failed; `.build/evidence/0406-all-v3-tests.log`. The final disk-backed run is retained under `.build/evidence/storage/final-0406/`.
- `node hp_colors_rewrite_v3/tools/generate.js --check`: **11 outputs current**, exit 0; `.build/evidence/0406-generate-check.log`.
- V3Ticket03 owned the coordinated serial `build_hp_colors_rewrite_v3.ps1 -SkipDeploy` release/debug pair. Retained logs and outputs independently inspected: `.build/evidence/ticket03-review-release-build.log` (**110/110**) and `ticket03-review-debug-build.log` (**109 passed, one intentional release-only logging-thrower skip, zero failed**).
- Both compilers reported **13 compiled, 0 failed**; the wrapper accepted only its known redirected `Console.ReadKey` exit after required-output/success-summary checks. Both compiled/package sets matched the exact **13-asset** contract, including codec and storage. Listings: `.build/release/vpk-listing.txt`, `.build/debug/vpk-listing.txt`.
- Independently hashed VPKs: release `26b97fbe11b0f961a937198615ad1fcc654d61f21e9bb6b7fd980f51846a60e2`; debug `e4041aed92ef1256f34f1d7e4596591469232c88e3e501627880ea0cd4b7e740`.

Remaining limit: live Steam CEF persistence/rendering is not tested. All checks were build-only/VM; no deployment, game launch, hosted-page write, game-folder write or git mutation. Acceptance boxes remain untouched for the integration owner.

## Review fixes

Additional failure modes identified by the code/Fable reviews, recorded before fixes:

- Bundle replacement must survive a later settings-only import during hydration.
- Rebinding a recreated menu root during debounce, an in-flight write or retry must transfer the pending bundle/import scope, not restore stale disk data over it.
- Both-unreadable records need an explicitly confirmed reset; readable/newer or failed-read states must never receive that reset.
- Transient outages must be re-probed on a later edit after a cooldown, with fresh request identities and the write gate re-established.
- Boot reads must say LOADING, not SAVING. Encoding failure must retain the previous pending valid bundle and show a player-facing error.
- In-flight replacement, page reload mid-write and lost acknowledgement followed by another edit need realistic-latency E2E checks.

Implemented review changes and evidence:

| Finding | Fix and regression |
|---|---|
| Import scope loss | Full bundle scope remains sticky after settings-only imports; direct hydration and recreated-root cases retain presets/routing |
| Root recreation loses edits | `snapshot()` transfers pending/in-flight bundle, scope, touched slots and hydration state before disposal. Debounce, in-flight and retry root-handoff cases all persist the latest bundle |
| Corrupt state cannot recover | Two-click menu confirmation calls `resetUnreadableSave(true)`. A fresh handshake/read allows overwrite only if data is still unreadable/absent; newer/readable repairs cancel the reset. Previous garbage is not rotated |
| Transient outage stays closed | Later valid edits trigger a fresh probe after the eight-second cooldown; edits inside it schedule that probe at expiry. New bridge prefixes reject stale replies |
| Loading/error behavior | Boot reports LOADING. Invalid encoding preserves the previous pending valid bundle. Player-facing codec messages replace JSON/URI errors |
| Unrealistic concurrency coverage | 300ms reply latency proves in-flight supersession; real-page staging loss retries after reload; lost ack followed by a different edit preserves valid `.prev` |
| Preset facade | `getBundle`, `replaceBundle`, `isHydrated`, `canEditPresets` and optional `refreshPresets` integrate ticket 10. Mutations validate/cap before assignment and refuse readonly/corrupt/loading state atomically |
| Reserved user id | Both one-preset/full-bundle imports canonicalize `baked_default` to fresh unique user ids with names kept. Durable writes reject reserved ids; a canonicalized foreign current record is not rotated into `.prev` |

Review regression command (`codec.test.js` + `storage.test.js`): **74/74 passed**; `.build/evidence/0406-review-tests.log`, disk profiles/transcript `.build/evidence/storage/review/`. The targeted pre-fix run demonstrated **11 failures / 14 cases** (`0406-review-red.log`); the three already-working concurrency cases were retained.

All-source review check ran **179 cases: 176 passed, three failures only in the concurrently changing ticket-07 renderer suite** (release→ally, reinclusion and cached-idle facts); `.build/evidence/0406-review-all-tests.log`. Generation remains **11 outputs current** (`0406-review-generate-check.log`). Main owns final combined tests/builds after ticket 07 releases its source lock. The 138-test / 13-asset build checkpoint above predates these review changes, not proof of the current package. No live/Steam CEF claim or issue-box tick.

## Audit fixes

The audit round supersedes the earlier bundle-import replacement behavior and its old test expectations. Existing root-handoff, multi-chunk and backup regressions now use explicit replacement where replacement is the behavior under test.

| Finding | Fix and retained regression evidence |
|---|---|
| Same-version future schema destroyed | Checksum-valid unknown slots or compatible-type future range/enum values classify as `newer`. Known values load; current/previous stay read-only. `audit-storage.test.js`: both `same-version newer schema...` cases; mutant `future-schema` fails both. |
| Import changes an unsaveable library | Append API refuses loading, unreadable and read-only states before mutation. `append import refuses...` covers all three; mutant `import-readonly-gate` fails all three. |
| Early HPCR2 loses conversion metadata | Settings-mode hydration merges `v2pending` and `v2conditions` with settings. `pre-hydration HPCR2...` verifies restore/save/restart; mutant `prehydrate-metadata` fails. |
| Every slider tick encodes the whole library; replacement encodes twice | Settings edits validate settings without encoding; flush encodes once. Preset mutations perform one size/codec check and pass its validation to the controller. `settings edits never encode...` counts calls before/after flush; mutants `settings-encode-timing` and `double-preset-encode` fail. |
| Re-probes accumulate HTML handlers | One router per event/panel retargets the current bridge; disposal disconnects it. `connection recreation...` counts handlers across repeated recreation; mutant `handler-pileup` fails. |
| Hidden hosted-page checkout dependency | Storage VM uses the SHA256-pinned vendored page script (`vendor/hpv2-store.pin.json`, commit `75e7620`). Modified bytes fail closed. The separate live-ref comparison reports the exact missing `D:/hpv2-store` prerequisite. `vendored hosted fixture...` exercises both failures; mutants `vendor-pin-guard` and `missing-store-message` fail. |

Focused codec/storage/migration/store-page/generator checks: **145/145 passed**, `.build/evidence/0406-audit-focused.log`. Negative proof: `.build/evidence/0406-audit-mutations.json` and `0406-audit-mutant-*.tap`; the retained runner creates isolated temporary source copies and removes them after each run. Original pre-fix evidence is also retained in `audit-040506-red.log` (**9/9 failed**).

No build, deployment, game launch, hosted-page mutation or git mutation. VM/subprocess checks do not prove live Steam CEF behavior.

Final audit-round all-v3 command (`node --test hp_colors_rewrite_v3/tests/*.test.js`): **296/301 passed**, five failures exclusively in peer-owned `tests/preview.test.js` (stock release expectations) and `tests/renderer.test.js` (native font macros/stock release). Owner **V3Fix03-2** was notified; no codec/storage/migration/generator/menu test failed. Full log: `.build/evidence/0406-audit-all.log`. Subsequent `generate.js --check` passed, **11 outputs current** (`0406-audit-generate-check.log`). No regeneration was needed for this owner's test/documentation changes.
