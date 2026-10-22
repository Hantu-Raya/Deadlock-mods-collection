# HP Colors v3

## Scope and routing

- This lane owns the v3 pak02 ESC editor, world healthbars, preview, storage and timers. v2 remains the release/rollback lane until the parity gate; do not edit v2 for v3 work.
- Read [CONTEXT.md](CONTEXT.md) for terms, [SPEC.md](SPEC.md) for behavior, [MAP.md](MAP.md) for status and [PLAN.md](PLAN.md) for the implementation plan. Decisions live in [docs/adr/](docs/adr/); engine evidence in [ENGINE.md](ENGINE.md); native acceptance in [LIVE-VERIFIED.md](LIVE-VERIFIED.md).

## Source boundaries

- Edit `settings/schema.json`, `settings/record.json`, `tools/`, handwritten `panorama/scripts/` and `panorama/styles/`, and focused `tests/`. Pinned `vendor/` inputs and their pins change only through an explicit reviewed rebase.
- Regenerate, never hand-edit: `generated/`, `panorama/scripts/hp_colors_v3_settings.js`, `panorama/scripts/hp_colors_v3_world_settings.js`, all three `panorama/layout/*.xml` files and `panorama/styles/unit_status_v2.css`. `tools/generate.js` lists the exact outputs.
- Never edit `.build/`, `.tmp/`, compiled assets, staging trees, VPKs or archives as source. Each wrapper owns its lane's `.build/{release,debug}/pak02_dir.vpk`; no wrapper deploys.
- Preserve append-only setting-slot identities and versioned record upgrades. Migration belongs in `hp_colors_v3_from_v2.js`; v3 never writes v2 keys or formats.

## Commands

Run from the repository root; choose the relevant checks, and use the full lane suites before handing off runtime changes.

```powershell
node --test hp_colors_rewrite_v3/tests/*.test.js
node --test hp_colors_rewrite_v3_qollock/tests/*.test.js
node --test hp_colors_rewrite_v3_showrank/tests/*.test.js
node --test scripts/validate-hp-colors-rewrite-v2-storage.test.js
node hp_colors_rewrite_v3/tools/generate.js
node hp_colors_rewrite_v3/tools/generate.js --check
node hp_colors_rewrite_v3_qollock/tools/qollock.js
node hp_colors_rewrite_v3_qollock/tools/qollock.js --check
node hp_colors_rewrite_v3_showrank/tools/showrank.js
node hp_colors_rewrite_v3_showrank/tools/showrank.js --check
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v3.ps1 -SkipDeploy
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v3.ps1 -SkipDeploy -Debug
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v3_qollock.ps1 -SkipDeploy
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v3_qollock.ps1 -SkipDeploy -Debug
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v3_showrank.ps1 -SkipDeploy
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v3_showrank.ps1 -SkipDeploy -Debug
```

- Test time: the v3 suite takes about 1.5 min (CPU-bound on 8 cores; the import fuzz is split into six `import-fuzz-<n>.test.js` shards over `tests/import-fuzz-cases.js`). All three wrappers run the same staged v3 suite through `Invoke-HpV3Suite` (`scripts/hp-colors-v3-pipeline.ps1`), which records a pass under `.build/suite-pass/<key>`. `tools/suite-cache.js` hashes the staged tree, all v3 sources and tests, the shared adapter/pipeline scripts, the v3 wrappers, the repo ignore rules, the local hpv2-store checkout, every HPV3_* variable the suite reads, Node and the mode (not git's global excludes), and a new external input a test reads must be added there, so the QOLLOCK and ShowRank builds reuse the canonical build's pass for the same mode. `HPV3_SUITE_CACHE=0` forces a run. While iterating, run the focused suite plus one debug build; a staged debug or release build already runs the full suite, so a separate unstaged full run is not needed before the builds.
- Regenerate canonical outputs before composing QOLLOCK or ShowRank. Every menu/topbar change must reach all three variants (normal, QOLLOCK, ShowRank); rebuild all release variants before release and the relevant debug variants for their live checks. QOLLOCK consumes v3 one-way and is built to run as pak02 next to QOLLOCK's own pak03. A QOLLOCK-only behavior goes behind a seam that `tools/qollock.js` adds, such as the topbar root class `HPColorsV3TimersHeroNames` (ticket 39), and a VM check that normal and ShowRank are unchanged; never install it over a non-QOLLOCK pak03 without the user's say-so. The ShowRank variant (`hp_colors_rewrite_v3_showrank/`, [ticket 34](issues/34-showrank-variant.md)) also consumes v3 one-way through `menuParts()` and the generated layouts, is built to run as pak02 next to ShowRank's `pak89_dir.vpk`, and its `tools/showrank.js --check` fails while stale. QOLLOCK and ShowRank together are unsupported, because QOLLOCK's pak03 also overrides `citadel_hud_top_bar_player`. User decision 2026-10-17: for sharing, addons holds normal v3 as `pak02_dir.vpk` and the QOLLOCK-support build renamed to `pak03_dir.vpk` (see [ticket 22b](issues/22b-qollock-variant.md#addons-layout-for-sharing-2026-10-17)).

## Runtime and test rules

- CSS contract: at most 10 selectors and 1,024 selector characters per rule; no `opacity-mask: none`; clip scene panels through a layered parent. [ENGINE.md](ENGINE.md) records the evidence. Style release follows the single [renderer restoration contract](SPEC.md#renderer-restoration-contract).
- Owned CSS transitions animate only `opacity`. Preview/play exceptions remain in [ticket 22c](issues/22c-preview-hero-model.md#fixes-after-audit). Ticket 27 round 3 explicitly permits these user-requested stock copies only: `HPC3HeroNoticeBackgroundTransitionOn`, `HPC3SelectedHeroAnim`, `HPC3SelectedHeroNameAnim`, `HPC3SearchResultSelectedAnimation`, `HPC3NegativeShake`, `HPC3GlowSearchInput`, and the stock `.98` active-state scale. [ENGINE.md](ENGINE.md#inherited-stock-control-styles) lists their scope, inherited stock-control transitions (including layered InputButtons) and shadows. Do not add other motion/shadow exceptions. Keep passive panels non-hit-testable and collapse hidden surfaces.
- Reuse the real scripts through the [Panorama VM adapter](../scripts/hp-colors-panorama-test-adapter.js). Assert events, publication, records and panel effects, not source text; only the package asset contract may assert source/asset text.
- Compare MockPanels by identity (`assert.ok(actual === expected)`), never deep/equality assertions that serialize their circular graphs. Do not disable test isolation to hide a runner hang.
- Preserve counted ceilings: 300 active / 200 idle / 30 dormant operations per bar per second, and the existing 30/s no-rule HUD/identity-watch ceiling. These are synthetic budgets, not FPS evidence; deeper carrier chains remain outside the measured fixtures.
- Audit diagnostics keep `boundaryValidityCalls`/`boundaryQueries`, scheduling and MoveChild calls separate from the historical counted budgets. Mock query recursion is internal work, not another script→panel call; use [audit-performance.test.js](tests/audit-performance.test.js) for preview gestures, own HUD, routing, boot, sync and eleven-row fan-out comparisons.
- Preserve publisher epoch/revision rejection, stale-callback guards and renderer ownership/release. Local hero routing and signature-tier conditions belong to the menu watcher, not per-enemy world scans.
- Timer entry points are role-specific: `hp_colors_v3_timers_world.js` samples each world bar and supplies renderer facts; `hp_colors_v3_timers_hud.js` owns topbar discovery, records, artwork and snapshots. Keep their existing message/authority contract; never load HUD artwork code in world contexts. Pending native restoration uses a shared same-context card-lease registry and an independent, identity-guarded cleanup job, even when both timers are off; replacement incarnations wait for complete parent/order/alignment restoration.
- **Release builds compile every staged script with Closure ADVANCED** (`tools/stage-scripts.js --minify`, `google-closure-compiler@20261011.0.0` via npx; debug stays readable). Scripts shrink 697 KB → 497 KB. A filter keeps ADVANCED from breaking the runtime:
  - **Properties are never renamed.** Every identifier-shaped word in a script is declared as an extern property. This keeps engine panel APIs, `$.HPColors*` XML entry points, JSON wire/record keys and cross-file/QOLLOCK APIs intact. Locals are still renamed and dead code is still removed.
  - **Named scheduled callbacks keep `fn.name`** via `Object.defineProperty`, because ADVANCED drops function-expression names. These are `rendererTick`, `hudWatch`, `identityWatch`, `menuRetry`, `previewStep`, `previewSettle` and `retryRetirements`. Tests and stacks find jobs by that name. A new `, function name(` callback is kept automatically.
  - **The output is checked:** it must parse, and every `$.Name` and UPPER_CASE string constant must survive. Both release wrappers then run the full VM suite on the compiled output.
  - **Release stack traces show renamed locals.** Reproduce errors with a debug build.

## Storage and hosted page

- Follow the [storage contract](SPEC.md#storage-contract) for required CAS readiness, fail-closed saving, touched-slot precedence, conflict refusal and complete draft recovery.
- The hosted source is `D:/hpv2-store/index.html`, outside pak02; [vendor/hpv2-store.pin.json](vendor/hpv2-store.pin.json) identifies the pinned script. Keep v2 storage compatibility and the other hosted applications' keys untouched. Never push/publish without explicit user approval; local tests do not prove served bytes or cache eviction.
- Releases bump `settings/record.json` `release` only (fixes: patch; user-visible features: minor) and record it in the [MAP changelog](MAP.md#changelog). Raise `hpv3` in hpv2-store `latest.json` only after that release is downloadable, because every lower version then shows the [update notice](issues/33-update-notice.md). List each build's GameBanana file under `download.hpv3` as `normal`, `qollock` and `showrank`; a missing key hides that build's DOWNLOAD. After pushing a page change, re-pin [vendor/hpv2-store.pin.json](vendor/hpv2-store.pin.json) to the pushed commit with `published: true`, then check the served script hash. The page never writes the title unprompted; keep `lv` request-answered.

## Debug and live acceptance

- Logging and its timing clocks/counters are gated by complete single-line `// HPV3_DEBUG ...;` statements. `tools/stage-scripts.js` removes them in release and enables `[HPV3]` boot/lifecycle, hero/tier, save/store and timing diagnostics in debug; release must contain no logging or timing-accounting work.
- Only the user or an agent with current user consent may install, launch or benchmark Deadlock. Follow [ticket 11](issues/11-live-test-1-core.md) and [ticket 26](issues/26-release-at-parity.md): preserve rollback, use debug, fully restart after an authorized install, and record the game build and installed pak hash.
- Check the actual menu/world behavior and stock restoration, save/restart and affected variants; CSS changes require an in-game load plus a console check for `Parsing error`, `FATAL` and `Uncaught`. Retain representative screenshots and update the live ledger without promoting VM/build evidence to live evidence. FPS claims require a separately authorized PresentMon A/B.
