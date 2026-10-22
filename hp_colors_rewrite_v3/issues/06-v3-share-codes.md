# 06: v3 share codes

**What to build:** Players copy and paste HPC3 settings and preset codes; a newer-version code imports known settings with a warning.

**Blocked by:** 03

**Status:** implemented and audited; VM/generation verified (321/321, 2026-10-14). Live checks are in ticket 11.

**Runs on:** gpt-6.1-sol (med). **Review:** code-review.

- [ ] Versioned sparse codes round-trip
- [ ] Settings code fits the 4,096-char paste box for shipped settings ranges
- [ ] Newer-version code: known settings applied + warning
- [ ] Oversize bundle export refused with message

## Failure modes (before implementation)

- Sparse slot records must round-trip both sides/shared values without key-order dependence or a second defaults baseline.
- Invalid framing/checksum/UTF-8, duplicate slots, invalid known values and wrong code kinds must not mutate settings.
- Newer versions must import known slots, ignore unknown slots and warn; older versions need an explicit ordered upgrade hook.
- Every shipped-range settings code must fit 4,096 characters; bundles over 32,768 characters or 128 presets must fail visibly and atomically.
- Settings and bundle imports must use validated menu/storage APIs and survive the durable-record boundary; preset imports do not apply the active look.

## Record contract and failure-mode evidence

`panorama/scripts/hp_colors_v3_codec.js` is the sole record codec for both saves and codes. Share framing is `HPC3.<fnv1a32>.<base64url(JSON)>`; durable framing is `HPV2S1.<fnv1a32>.<base64url(JSON)>` to retain the hosted page's protocol. The body is `{v,k,d}` for settings, with `k:"settings"` and sparse `d:[[committedSlot,value],...]`; bundles use `k:"bundle"`, `p:[{id,name,d,...metadata}]` and optional `b` for bundle metadata. Full `{side:{enemy,ally},shared}` settings exist only in memory.

The generated contract's `recordVersion` is 1, supplied by `settings/record.json`. Diffs use generated defaults and committed slots. A default change increments the version, adds an ordered `UPGRADE_STEPS` step preserving absent old values (including presets), and lists its slots in generated `defaultChanges`; every later writer explicitly emits those slots even at their new defaults. No second defaults baseline exists. Newer inputs, including same-version records with unknown slots or future numeric/enum ranges, retain compatible settings and warn “settings may differ”; malformed current inputs still refuse. Caps remain 4,096 / 32,768 characters and 128 presets.

| Failure mode | Observable evidence |
|---|---|
| Sparse slots/settings/bundle round-trip | `tests/codec.test.js`: exact empty sparse body, committed side/shared slot pairs, settings/save round-trip and Unicode/metadata bundle round-trip |
| Malformed input mutates settings | Codec cases cover framing/checksum/UTF-8, duplicate/negative slots, invalid types/thresholds/version/kind. Storage menu tests prove bad and wrong-kind pasted codes leave published settings unchanged; same-version unknown slots classify as future data |
| Future/old versions mishandled | Codec future-code/future-save projection; ordered upgrade hook and missing-step refusal. Storage real-menu future paste keeps warning; newer saves remain read-only |
| Code/preset cap silently truncates | Codec shipped endpoints round-trip under 4,096; oversize 128-preset bundle export visibly refuses at 32,768 and the 129th preset refuses at 128. Real-menu oversize bundle copy shows the error without replacing the existing entry |
| Imports bypass commit or lose durable state | Settings import persists through the menu commit path. Preset imports append with fresh ids, retain their metadata and preserve active settings/root metadata; explicit replacement retains bundle metadata. Early settings imports replace their intended settings scope; early preset imports refuse until hydration |

Focused source verification: **46/46** combined codec/storage cases passed; `.build/evidence/0406-tests.log` retains the output. `tests/storage.test.js` boots the generated menu and real runtime through the shared VM adapter and runs the actual local hosted-page script with disk-backed storage. No source-text behavioral assertions or live-game claim is used.

## Combined acceptance (2026-10-14)

Final all-v3 source suite passed **138/138** and generation check reported **11 outputs current** (exit 0). Logs: `.build/evidence/0406-all-v3-tests.log`, `.build/evidence/0406-generate-check.log`.

The coordinated build-only release/debug pair was run by V3Ticket03 and its retained outputs independently inspected. Release staged checks passed **110/110**; debug had **109 passes, one intentional release-only logging-thrower skip, zero failures**. Both compilers reported **13 compiled, 0 failed**, and both VPKs matched the exact **13-asset** contract with codec/storage present. Logs: `.build/evidence/ticket03-review-release-build.log`, `.build/evidence/ticket03-review-debug-build.log`; exact lists: `.build/release/vpk-listing.txt`, `.build/debug/vpk-listing.txt`. Ticket 04 records the independently confirmed VPK SHA256s.

No install, game launch, page write, game-folder write or git mutation; live clipboard/Steam CEF behavior remains unverified. Acceptance boxes remain untouched for the integration owner.

## Review fixes

Additional failure modes identified by the code/Fable reviews, recorded before fixes:

- Versions that change defaults must explicitly emit those slots forever, even at the new defaults; sparse omission must not project the wrong old value on downgrade.
- Newer records must retain other known valid values when one known slot is incompatible; warnings must say settings may differ.
- Invalid UTF-8/JSON/non-string input needs player-facing errors, and lone UTF-16 surrogates in preset names must remain round-trippable on older JSON engines.
- Size proof must bound the longest textual value per slot, including fractional mid-range numbers, rather than only testing range endpoints.
- Preset facade mutations must validate atomically and preserve bundle metadata through storage handoff.

Implemented review changes and evidence:

- `defaultChanges:[{version,slots}]` is generated metadata with no historical default values. Codec tests simulate v2/v3 default changes and prove explicit slots in settings and preset diffs project correctly into the older reader.
- Shared generated `validateValue` rejects incompatible future values individually. Compatible root/preset values remain loaded; old cross-field rules retain a safe compatible subset.
- UTF-8/JSON/non-string failures map to player-facing messages. Old JSON engines' lone surrogates are escaped losslessly before encoding; the legacy-engine test round-trips the name.
- Size evidence computes a per-slot wire-size upper bound (including a conservative 32-byte finite-number representation) and proves a fractional mid-range value can be longer than its bound endpoints.
- `baked_default` remains the implicit preset's reserved id. Imports of one-preset/full bundles generate fresh noncolliding user ids, keep names and ordinary ids unchanged, and durable encoding refuses any remaining reserved user id. Real-menu imports/restarts prove no such id is written; normalized foreign data is not re-rotated into `.prev`.

Focused codec/storage review suite: **74/74 passed**, `.build/evidence/0406-review-tests.log`. Generation: **11 outputs current**, `.build/evidence/0406-review-generate-check.log`. The latest all-source check had **176/179 passing**, with three ticket-07 renderer failures outside this codec/storage change; `.build/evidence/0406-review-all-tests.log`. Main owns the final combined build after ticket 07 settles; earlier build/hash evidence is the pre-review checkpoint. Live behavior remains unverified; boxes remain untouched.

## Audit fixes

| Finding | Fix and retained regression evidence |
|---|---|
| Shared preset/bundle paste destroys the library | `importBundleCode` appends atomically with fresh ids, preserving existing presets/current settings. Full replacement uses the menu owner's separate confirmed action. `HPC3 and HPCRP1...` verifies paste/save/restart; mutants `append-current-preservation` and `append-identity` fail. |
| Append bypasses preset/durable caps | The combined candidate must fit 128 presets and 192,000 durable characters before assignment. Both `append cap refusal...` and `append durable size refusal...` preserve library, metadata, disk and active draft; mutants `append-count-cap` and `append-size-cap` fail. |
| Import changes loading/unreadable/newer libraries | Shared preset edit gate refuses all three states atomically; three `append import refuses...` cases fail under mutant `import-readonly-gate`. |
| Schema changes silently retain version 1 | Generator compares slot type/side/setting, defaults, bounds/step/options and additions with committed data. Changes require a bumped `settings/record.json` version plus covering `defaultChanges`. Existing `generator.test.js` cases all pass; original **6/6 failed** proof is `audit-generator-red.log`. Same-version checksum-valid future data is projected read-only rather than destroyed (`same-version newer schema...`; failing `future-schema` mutant). |
| Menu validation needs a non-mutating API | `decodeSettingsCode` / `decodeBundleCode` expose validation without committing or staging an import. Menu preflight/hydration/confirmation regressions and mutation proof are owned by V3Fix10-2; see ticket 10's Audit fixes. |

Focused codec/storage/migration/store-page/generator checks: **145/145 passed**, `.build/evidence/0406-audit-focused.log`. The isolated regression-removal runner caught **17/17 mutants**; `.build/evidence/0406-audit-mutations.json` and `0406-audit-mutant-*.tap` retain the expected failures without altering production sources.

No build/deploy/live clipboard or CEF verification performed in this audit-fix round.

Final audit-round all-v3 check: **296/301 passed**, with five renderer/preview failures owned by **V3Fix03-2**; all codec/storage/migration/generator/menu cases passed. `.build/evidence/0406-audit-all.log` names the cases. The subsequent generator check passed, **11 outputs current** (`0406-audit-generate-check.log`).
