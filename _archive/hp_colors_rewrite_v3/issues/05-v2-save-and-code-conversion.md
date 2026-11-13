# 05: v2 save and code conversion

**What to build:** A v2 player's look carries over silently on first launch, and old v2 codes paste in converted.

**Blocked by:** 04

**Status:** implemented and audited; VM/generation verified (321/321, 2026-10-14). Live checks are in ticket 11.

**Runs on:** gpt-6.1-sol (med). **Review:** code-review + claude-fable-5-1 review.

- [ ] Corpus covers v2 save schemas 1-5, HPCR2, HPCRP1, hpv2 v1-3 with expected v3 settings
- [ ] Offsets converted once to pixels
- [ ] v2 keys are read once and never written
- [ ] Each corpus item tested through the menu/storage seam

## Failure modes to retain before implementation

- Every durable schema 1–5 and HPCR2/HPCRP1 with absent/v1/v2/v3 `hpv2` extension must load/paste through the real menu/storage seam and publish expected core settings.
- Envelope schema, not an untrusted body marker, determines old absolute HP offsets. Old offsets divide by their record's bar scale once; schemas 4/5 and extension v2/v3 are already pixels at 100% bar scale. The v2 editor's displayed percentages are not stored percentages. Raw bar offsets multiply by 0.1; name offsets remain 1:1.
- Legacy sparse saves use `sparseDefaults`; wire pairs use `codecDefaults`. Explicit `own` is materialized against the first All Heroes base (or shipped default), not copied as a live layer. Current is flattened to active settings.
- First launch reads legacy keys only if both v3 records are absent. Valid v3 current/previous wins. Migration writes only v3; second launch never reads legacy. Legacy previous recovery, corrupt data, unsupported schema and read failure must not silently create a fresh save.
- Unknown/invalid indices, duplicate pairs/ids, invalid field types/conditions, malformed framing and oversize inputs refuse atomically without a partial import.
- Converted preset metadata survives v3 edits, bundle export/import and restart. `baked_default` imported as a user copy gets a fresh id; no durable user record stores it.
- Main approved one opaque **sparse** `v2pending` map per settings/preset payload, keyed by v2 field name. Values equal to v2's pinned shipped defaults are omitted; known units are already converted. Later slots consume entries and remove them without re-running v2 migration. If conversion still exceeds 192,000 characters, drop only pending maps, largest preset maps first, until it fits; keep every mapped v3 slot and preset, save, and show a short notice. Untouched v2 keys retain the full originals.

## Implementation and evidence

`panorama/scripts/hp_colors_v3_from_v2.js` is the removable compatibility boundary. Its pinned grammar comes from `hp_colors_rewrite_v2/panorama/scripts/hp_colors_v2_contract.js`, SHA256 `5e9df591c60855b54331ab32f19581ab26363a2cd89f9aa5b4dd8c1dce586bb0`: 155 live settings, 72 legacy pairs and 93 extension slots (retired slots are ignored). v3 codec/storage remain the only writers. The generator/wrapper owner added the converter before codec/storage in the menu, not in world contexts.

`tests/fixtures/v2-migration.json` has 13 independently expected core records: all five durable schemas and HPCR2/HPCRP1 each with no extension or `hpv2` v1/v2/v3. `hpv2` is the versioned object embedded in those codes, not another string prefix. `v2-contract.json` pins the input data used by the fixtures.

| Retained regression | Evidence in `tests/migration.test.js` |
|---|---|
| Formats and units | Each corpus entry loads/pastes through real menu scripts + hosted-page VM, checks active settings or appended preset settings as appropriate, writes v3 and restarts with no second conversion |
| Legacy authority | Schemas 1–3 ignore body offset markers; schemas 4/5 and extension v2/v3 stay relative. Bar raw positions become ×0.1 pixels; HP old absolute offsets divide by record scale once; name offsets stay 1:1 |
| Storage isolation | First valid legacy current reads once; successful migration writes only v3. Next launch reads no v2 key. Valid v3 wins; legacy previous recovers corruption; corrupt/future legacy data cannot create a fresh save |
| Legacy read loss | Lost legacy read retries fail closed; later edit-triggered probe migrates while preserving the edit and original v2 data |
| Layer removal | Current overrides root values; selected preset explicit `own` resolves against All Heroes base. No stored live `own` layer |
| Future-stage data | `v2pending`, `v2conditions`, preset `mode`/`heroes`, remaining `v2scopes` and baked visibility/name metadata round-trip through saves/bundle codes. An unextended HPCR2 paste preserves extension fields/conditions |
| Reserved id | Canonical baked HPCRP1 copy becomes a fresh named user preset, persists its id and never stores `baked_default` as a user |
| Caps, approved policy | All 128 sparse presets save with default pending entries omitted. A below-cap legacy fixture whose projection exceeds the cap drops the uniquely largest pending map first, keeps all 128 presets/mapped colors, saves ≤192,000 chars and displays “Saved; v2 extras stayed in v2” |
| Invalid input | Malformed JSON, duplicate pairs, unknown indices, wrong types and unsupported extension versions refuse without changing published state or disk |

Pending unit contract: bar/level/ultimate/stamina raw offsets, legacy stamina dimensions and HP/pulse font sizes use ×0.1. Width/height conditional values use the native 79×18 baseline. HP offsets are stored directly after the one-time old-absolute conversion. Name/pickup/rejuvenator offsets already use pixels. Component ratios with no future slot definition retain their legacy meaning. Future feature tickets map pending names/conditions onto new slots and remove consumed entries; missing pending entries mean the pinned shipped look, not the older wire baseline.

Checks actually run:

- Pre-converter seam run: **16 failures / 18 cases**, `.build/evidence/05-red-tests.log`.
- Focused codec/storage/migration: **98/98 passed**, `.build/evidence/05-focused-tests.log`.
- All source suites: **216/216 passed**, `.build/evidence/05-all-tests.log`.
- Generation: **11 outputs current**, `.build/evidence/05-generate-check.log`.
- Actual-page disk profiles/transcripts: `.build/evidence/storage/migration/` and `migration-all/`; shared `tests/storage-fixture.js` uses process-specific profile names to avoid concurrent test-worker collisions.

No build/deploy/game launch from this owner. Main owns final release/debug builds and visual checks. Source evidence is not live CEF or visual-parity evidence; issue boxes remain untouched.

## Audit fixes

| Finding | Fix and retained regression evidence |
|---|---|
| HPCRP1 paste replaces the library/current look | The shared append API gives each incoming preset a fresh id and preserves current settings/root metadata. HPCRP1 corpus cases now assert appended preset settings, not an unintended auto-apply. `audit-storage.test.js`: `HPC3 and HPCRP1...`; mutants `append-current-preservation` and `append-identity` fail. |
| HPCR2 metadata disappears across hydration | Pending settings-mode imports include `v2pending` and `v2conditions`; restore/restart regression and failing `prehydrate-metadata` mutant are retained with ticket 04. |
| Applying/saving presets uses the wrong pending map | `applyPreset` replaces or clears both metadata maps; Save as new copies both maps from the active bundle. Menu owner V3Fix10-2 verified the `audit metadata...` VM case in **45/45** focused checks (`ticket10-audit-completion-focused.tap`). Isolated mutants `metadata-apply`, `metadata-new` and `metadata-default` each fail; see `ticket10-audit-completion-mutations.json` and corresponding TAP files. |
| Corpus does not assert ally HP/name offsets or preset values | All 13 fixture `expected` blocks include ally HP-text offsets and both name offsets; save/HPCRP1 fixtures have `expectedPresets`. The menu/page/restart loop checks each preset before and after restart. Mutants `corpus-ally-offsets`, `corpus-name-offsets` and `corpus-preset-settings` each fail all five save-schema cases. |
| Valid v2 conversion failure offers destructive reset | A readable envelope whose conversion fails returns `conversion_error`, not corruption. Status includes the conversion error; reset remains unavailable and no v3 write occurs. `valid legacy converter failure...` proves this; mutant `converter-failure` fails. |
| Pending-map cap fallback repeatedly encodes | Conversion encodes once, then adjusts the exact ASCII-member byte cost as maps are removed. The oversize 128-preset regression counts one encode and separately verifies the final actual encoded size fits; mutant `conversion-single-encode` fails. |

Focused codec/storage/migration/store-page/generator checks: **145/145 passed**, `.build/evidence/0406-audit-focused.log`. Mutation proof: `.build/evidence/0406-audit-mutations.json` and `0406-audit-mutant-*.tap`. Storage profiles now use an automatically cleaned temporary directory; retained request/reply transcripts remain under `.build/evidence/storage/`.

No live game/CEF or visual-parity claim; Main owns package/live verification.

Final audit-round all-v3 check: **296/301 passed**, with five renderer/preview failures owned by **V3Fix03-2**, not migration/storage. `.build/evidence/0406-audit-all.log` records the exact cases. The subsequent generator check passed, **11 outputs current** (`0406-audit-generate-check.log`).
