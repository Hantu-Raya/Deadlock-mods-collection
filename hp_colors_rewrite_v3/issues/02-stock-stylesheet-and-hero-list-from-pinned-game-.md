# 02: Stock stylesheet and hero list from pinned game data

**What to build:** The unit-status stock stylesheet prefix and the hero catalog come from pinned SteamTracking files, and the build fails on drift.

**Blocked by:** 01

**Status:** done

**Runs on:** gpt-6.1-sol (med). **Review:** code-review.

- [x] Build reads the pinned stylesheet and hero list (sources per research 09)
- [x] A changed pin or upstream drift fails the build with a clear message
- [x] Hero catalog includes prerelease heroes without hand edits

## Failure modes (written before code)

- F1: Vendored bytes or manifest pins change unnoticed; generation/build must fail before staging with the file, expected hash and actual hash.
- F2: Normal generation/build fetches mutable upstream data; offline generation must use only vendored, hash-verified inputs.
- F3: Hero references or nested records become catalog entries, duplicate ids slip through, or prerelease records disappear; parse top-level KV3 hero objects, validate identity, and deliver the generated catalog to the VM runtime.
- F4: Friendly names are guessed from keys or localization is incomplete; use pinned localization and fail for missing names.
- F5: Stock stylesheet is replaced by a stub or imports target uncompiled assets; generate the override from the full pinned stock text with only explicit compiled-import conversion, then verify the packaged stylesheet asset.
- F6: An explicit drift check compares different upstream commits, hides changed files, or silently refreshes the pin; resolve HEAD once, report per-file hashes and commit, fail on drift, and leave local inputs untouched.
- F7: Stock data or raw vendored inputs leak into the VPK or release/debug differ unexpectedly; enforce the updated exact compiled asset list in both build modes.
- F8: Missing, malformed or unavailable upstream data is reported as no drift; fail clearly rather than falling back to cached/pinned data.
- F9 (scope addition, before layout code): A copied v2 layout preserves historical stock mistakes, or a patch silently applies to the wrong layout; pin both stock layouts, enforce unique handler/include/host anchors, retain stock panel attributes (including `leavequeue`), and compare the generated stock subtree with the pin through the VM layout seam.

## Initial implementation and provenance (superseded by the rebase below)

`game-data-pin.json` records commit `573a4129fe62dd63f75a0f8090a971a5d25c8588` and SHA-256 for five pristine `vendor/` files: the stock stylesheet, `heroes.vdata`, English GC hero names, and both stock layouts. Normal generation/build reads and verifies those local bytes only; it neither fetches upstream nor strips `_include`.

`tools/game-data.js` parses root KV3 hero records and pinned localization. `generated/heroes.json` includes all 67 positive-id heroes, including disabled/development/testing records, with their original flags. Id-zero `hero_base` is an inheritance template and excluded. Names come from the localized hero key; `hero_testhero` has no matching display token, so its actual `m_strHeroSearchName` (`#hero_nano_search`) supplies the name. No names or ids are manually maintained. The generated settings contract carries the catalog and pin commit into the menu's published `HP_COLORS_V3_CONFIG`.

`tools/generate.js` emits the entire pinned stylesheet with only its two imports changed to `.vcss_c`. It generates ESC and overlay layouts directly from their pins with unique, fail-closed patch anchors: compiled stylesheet imports, v3 includes, the v2 resume/cancel handler changes, the collapsed v3 menu host, and renderer onload. Stock panel trees/snippets remain unchanged; `matchmakingLeaveQueue` retains stock `leavequeue`. The copied `tools/escape-menu.xml` template is removed.

Upstream checks are explicit: `node tools/game-data.js --check-upstream` or the wrapper's `-CheckUpstream -SkipDeploy`. They resolve HEAD once, report every source hash, fail on content drift or retrieval errors, and never refresh the pin. `--upstream-base` exists for the local HTTP fixture; normal builds have no upstream requests.

## Commands and observed outputs

Run from the repository root:

```text
node --test --test-reporter=tap hp_colors_rewrite_v3/tests/game-data.test.js hp_colors_rewrite_v3/tests/generator.test.js hp_colors_rewrite_v3/tests/logging.test.js hp_colors_rewrite_v3/tests/menu.test.js hp_colors_rewrite_v3/tests/renderer.test.js hp_colors_rewrite_v3/tests/store-page.test.js
exit 0; # tests 46; # pass 46; # fail 0

node hp_colors_rewrite_v3/tools/generate.js --check
exit 0; HPV3 generator: 10 outputs current

powershell -NoProfile -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v3.ps1 -SkipDeploy
exit 0; tests 18, pass 18, fail 0
Compiler exit=-532462766; summary= OK: 7 compiled, 0 failed, 0 skipped, 0m:00s
Accepted known redirected Console.ReadKey exit after 0 failed and all required outputs.
VPK exact asset set (7)

powershell -NoProfile -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v3.ps1 -Debug -SkipDeploy
exit 0; tests 18, pass 18, fail 0
Compiler exit=-532462766; summary= OK: 7 compiled, 0 failed, 0 skipped, 0m:00s
Accepted known redirected Console.ReadKey exit after 0 failed and all required outputs.
VPK exact asset set (7)
```

Both modes contain exactly:

```text
panorama/layout/hud_escape_menu.vxml_c
panorama/layout/unit_status_overlay_v2.vxml_c
panorama/scripts/hp_colors_v3_menu.vjs_c
panorama/scripts/hp_colors_v3_renderer.vjs_c
panorama/scripts/hp_colors_v3_settings.vjs_c
panorama/styles/hp_colors_v3_menu.vcss_c
panorama/styles/unit_status_v2.vcss_c
```

Release `.build/release/pak02_dir.vpk`: 81,304 bytes, SHA-256 `6aad306d2bcd9d22b15b052a032d5139963fe054ea7bfc98080d3e86bd5a5755`.
Debug `.build/debug/pak02_dir.vpk`: 81,370 bytes, SHA-256 `5dfa8e6fd64a95ddd298871c3e2fe32c96b4c5321f38030bb37d679101d1539c`.

Pin-mismatch build probe: append exactly `\nPIN_MISMATCH_PROBE\n` to `vendor/unit_status_v2.css`, run the normal `-SkipDeploy` command above, then restore original bytes in `finally`. **Exit 1 before staging**:

```text
Game-data pin mismatch: vendor/unit_status_v2.css at 573a4129fe62dd63f75a0f8090a971a5d25c8588 expected=c9c0234a188fb91d95911542abaea3dafd204deb2427d51bf99aff2614277787 actual=cb875ae54419ab919d23329b0a1ce3b7eb7a10dd9861a47fb87487b01ad7c1ba
V3 generation check failed; see pin mismatch/stale-file details above.
```

The original SHA-256 was restored exactly, and the final `generate.js --check` passed.

```text
node hp_colors_rewrite_v3/tools/game-data.js --check-upstream
exit 1 (expected drift)
HPV3 upstream HEAD=130feff271b4ce5689f4d78f6ec0aa21910be6be pinned=573a4129fe62dd63f75a0f8090a971a5d25c8588
DRIFT game/citadel/pak01_dir/panorama/styles/unit_status_v2.css
DRIFT game/citadel/pak01_dir/scripts/heroes.vdata
MATCH game/citadel/resource/localization/citadel_gc_hero_names/citadel_gc_hero_names_english.txt
MATCH game/citadel/pak01_dir/panorama/layout/hud_escape_menu.xml
MATCH game/citadel/pak01_dir/panorama/layout/unit_status_overlay_v2.xml
Upstream game-data drift: vendor/unit_status_v2.css, vendor/heroes.vdata; review/rebase explicitly. Vendored inputs and pin unchanged.

powershell -NoProfile -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v3.ps1 -SkipDeploy -CheckUpstream
exit 1 (expected drift; same HEAD and per-file report)
Upstream v3 game data changed or could not be checked; review the drift report and rebase explicitly.
Existing VPKs unchanged: true
```

Full reports retain the exact expected/actual hashes. CSS HEAD hash is `ed5b478e7beab71479312ca7c667d4c75387211c7aa6bc253102b1984b15a0e4`; heroes HEAD hash is `5b18b9e5d6753afb9698581cc49acea0e073c625971e7f5e062c893b61030a02`. Drift was reported, not rebased.

## Failure-mode → evidence mapping

All paths below are relative to `.build/evidence/`.

| Failure mode | Evidence |
|---|---|
| F1 | `ticket02-tests.log`: CLI mismatch checks for every vendored source and invalid/missing metadata. `ticket02-pin-mismatch.log`: real wrapper exit 1 with expected/actual CSS hashes and byte-exact restoration. |
| F2 | `ticket02-tests.log`: generator succeeds with `fetch`, HTTP/HTTPS `request`, and `net.connect` denied; deterministic output hashes and `--check`. `ticket02-build-release.log` / `ticket02-build-debug.log`: offline normal builds. |
| F3 | `ticket02-tests.log`: VM publishes 67 unique ids and six named prerelease records; development/test records retained; nested references ignored; duplicate ids/properties and malformed KV3 fail before output. Both build logs repeat the catalog VM check on the transformed stage scripts. |
| F4 | `ticket02-tests.log`: pinned friendly-name values reach runtime; a root hero without localization fails. |
| F5 | `ticket02-tests.log`: CLI stylesheet output equals the full pinned text with only compiled-import conversion. Both build logs and mode `vpk-listing.txt` files contain `unit_status_v2.vcss_c`. |
| F6 | `ticket02-tests.log`: local same/drift HTTP CLI probes verify a single HEAD resolution, per-source report, nonzero drift exit and unchanged inputs. `ticket02-upstream-drift.log` / `ticket02-build-upstream-drift.log`: actual HEAD drift and unchanged pins/packages. |
| F7 | `ticket02-build-release.log` / `ticket02-build-debug.log`: exact seven compiled/VPK assets and no raw/vendor inputs. |
| F8 | `ticket02-tests.log`: missing files, malformed KV3, invalid metadata and HTTP 404 fail closed. |
| F9 | `ticket02-layout-red.log`: stock retention and anchor regressions failed before layout implementation. `ticket02-tests.log`: all missing/duplicate layout anchors fail before output, ESC stock attributes (`leavequeue`) and overlay stock tree/snippets match pinned layouts; resume routes dispatch and renderer onload boots. |

`ticket02-red.log` retains the seven initial failing game-data checks before implementation. No issue boxes were ticked. No git mutation, install/deploy, game-folder write, game launch or live verification was performed. The existing store-page test reads git history. Compilation/VM evidence does not establish installed-game version equivalence or visual rendering.

## Rebase to the installed game

All five vendor sources are now pinned at `130feff271b4ce5689f4d78f6ec0aa21910be6be`, with ClientVersion **6774** recorded in `game-data-pin.json`. Installed and upstream-pinned `steam.inf` both report 6774 / SourceRevision 11112755 / Oct 09. CSS SHA-256 is `ed5b478e7beab71479312ca7c667d4c75387211c7aa6bc253102b1984b15a0e4`; heroes SHA-256 is `5b18b9e5d6753afb9698581cc49acea0e073c625971e7f5e062c893b61030a02`. Localization and both layout hashes are unchanged. The 67-entry catalog and full stock-derived stylesheet/layouts were regenerated.

To survive checkout line-ending conversion, vendor verification accepts only CRLF→LF equivalence against pristine upstream LF hashes; generated `--check` uses the same line-ending normalization. `.gitattributes` also forces LF for v3 assets. Content edits still fail, as the CRLF/non-EOL mutation CLI regression demonstrates.

The fresh `--check-upstream` run exited **1**, not 0: HEAD advanced to `0c38f9d31c4905e0fe1a292afe91aa3d01044baf` (ClientVersion **6779**, Oct 13). Only `heroes.vdata` drifted (HEAD hash `c020a28f30d23c486c14a4bb4ef2915507d6b496eaf304cb96b56ac17a9c3b0a`); the other four sources matched. Pins remained unchanged. **Decision: keep the 6774 pin because it matches the installed game, and rebase when the installed game updates.**

Current evidence is in `.build/evidence/review01-*.log` and [ticket 01's Review fixes](01-tracer-bullet-settings-table-to-booting-pak02.md#review-fixes): 66/66 tests, 10 generated outputs current, release/debug builds successful with the same exact seven assets. The earlier `ticket02-*.log` files above remain historical evidence for the initial pin; they were not overwritten.

## Review

code-review found one defect: two game-data tests built CRLF expectations while generation normalises to LF. Fixed in `tests/game-data.test.js` (expected stylesheet, anchor originals, drift fixture now normalised). Checked: 9/9 in the repo and 9/9 in an isolated copy with every vendor file converted to CRLF.

## Audit fixes

This section supersedes the earlier 6774 pin decision and historical build/output counts. The current pin is `0c38f9d31c4905e0fe1a292afe91aa3d01044baf`, ClientVersion **6779**; five vendor hashes remain verified. Current generation emits **11** outputs, and the wrapper's exact asset contract contains **16** assets. The renderer boots on script inclusion, not an overlay `onload`.

Failure modes identified before recovery edits: wrapper wiring could bypass its CLI mismatch guard or omit the override; a hard-coded staged test list could omit future suites; version assertions could pass in release while debug output remained unversioned; scratch-schema tests could bypass or conflict with the new record contract.

| Finding | Fix and retained regression evidence |
|---|---|
| Audit0102 A: stale installed-game pin | Rebased to 6779. Offline installed-version preflight precedes tool resolution, stage cleanup and compilation; mismatch fails with installed/pinned values. `-AllowPinMismatch` explicitly forwards the override; malformed metadata still fails. `audit02-installed.log`, `game-data.test.js`, and native preflight-only `audit-tooling.test.js` (no build actions). |
| Audit0102 A: upstream version hidden | Explicit `--check-upstream` resolves HEAD once, fetches `steam.inf`, prints upstream/pinned ClientVersion, and treats version drift as failure without editing inputs. Local HTTP fixture in `game-data.test.js`; `audit02-upstream.log` retains the predecessor's actual network check. |
| Audit0102 2: duplicate Calico names | Localization fallback appends the original hero key (`Calico (hero_testhero)`); duplicate display names fail closed. Both checked-in and freshly CLI-generated catalogs reach the real menu VM with unique names. |
| Audit0102 B / AuditWhole B1: build artifacts accidentally committed | Root `.gitignore` contains `hp_colors_rewrite_v3/.build/`; `audit-tooling.test.js` checks the rule and native read-only `git check-ignore`. No staging/commit was authorized; the untracked-source integration decision remains Main's. |
| AuditWhole D: hard-coded staged tests | Wrapper discovers sorted `tests/*.test.js` paths. Native isolated discovery regression adds a future suite and a helper, proving both suites execute and the helper does not. |
| AuditWhole D: unused `esc` | Removed from `tools/generate.js`; source-hygiene invariant rejects reintroduction. This is deletion evidence, not a Panorama runtime behavior. |
| AuditWhole B4: missing 3.0.0 | Both generated contracts expose `version: 3.0.0`; menu and renderer debug boot markers include that contract version. `logging.test.js` checks both real VM contexts and an isolated debug script stage without compiling. Renderer marker was completed by V3Fix03-2. |
| AuditWhole D / logging maintenance | Disk-backed test profiles use temporary roots and teardown; alias/bracket logging forms fail release staging. Existing profile-hygiene/stage-scripts regressions and historical `audit02-red.log` retained. `HPV3_DEBUG=1` requires debug-transformed scripts, not untransformed source. |
| AuditWhole A4 / rectangular stock baseline | Existing `STOCK_OVERRIDES` preserves the requested global mask/background removal, including master-off. Offline CLI regression checks the full pinned prefix plus exact suffix. Renderer fallback parity remains V3Fix03-2's ownership. |

Recovery focused run: `node --test --test-reporter=tap` over audit-tooling, game-data, generator, logging, stage-scripts, profile-hygiene, menu and review-fixes: **79/79 pass**, recorded in `.build/evidence/audit02-recovery-focused.log`. The menu and review scratch-schema fixtures now declare their added slots in temporary bumped record contracts; production contract enforcement is unchanged. `audit02-red-review-fixtures.log` records their pre-fix slot-83/83–84 failures.

`.build/evidence/audit02-mutations.js` reverts individual fixes only in child-process file reads (no production file edits). Its `audit02-red-*.log` files retain negative regression evidence. Tooling behavior uses native PowerShell preflight/discovery and Git ignore checks; Panorama behavior uses the shared VM adapter. No builds, deployment, game launch or git mutation were performed in this recovery.

All **10** isolated fix reversals were detected: `audit02-red-wrapper-guard.log`, `audit02-red-wrapper-override.log`, `audit02-red-upstream-version-output.log`, `audit02-red-fallback-display-name.log`, `audit02-red-build-ignore.log`, `audit02-red-future-test-discovery.log`, `audit02-red-obsolete-escape-helper.log`, `audit02-red-contract-version.log`, `audit02-red-renderer-debug-version.log`, and `audit02-red-menu-debug-version.log`. Each selected regression exits 1 without its fix; the unmutated focused suite exits 0.

Required final sequence after focused checks:

```text
node --test --test-reporter=tap hp_colors_rewrite_v3/tests/*.test.js
exit 1; tests 301; pass 282; fail 19
node hp_colors_rewrite_v3/tools/generate.js --check
exit 0; HPV3 generator: 11 outputs current
```

Full-run evidence: `.build/evidence/audit02-recovery-all.log`; freshness evidence: `.build/evidence/audit02-recovery-generate-check.log`. The 19 remaining failures are in `preview.test.js` (2) and `renderer.test.js` (17), owned by **V3Fix03-2** and reported to that owner. They include updated stock/inline-release expectations, zero-layout state and color normalization. No game-data, wrapper, generator, logging, profile-hygiene, stage-script, menu or review-fixture failures remain. Live rendering remains ticket 11 / Main; no build or live validation is claimed.

