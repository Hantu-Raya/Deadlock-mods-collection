# HP Colors v3

## Scope and routing

- This lane owns the v3 pak02 ESC editor, world healthbars, preview, storage and timers. v2 remains the release/rollback lane until the parity gate; do not edit v2 for v3 work.
- Read [CONTEXT.md](CONTEXT.md) for terms, [SPEC.md](SPEC.md) for behavior, [MAP.md](MAP.md) for status and [PLAN.md](PLAN.md) for the implementation plan. Decisions live in [docs/adr/](docs/adr/); engine evidence in [ENGINE.md](ENGINE.md), with the machine-readable facts in `tools/lib/engine-facts.json` and their extraction in [research/dll-tooling-findings.md](research/dll-tooling-findings.md); native acceptance in [LIVE-VERIFIED.md](LIVE-VERIFIED.md).

## Required workflow

Use the lane's tools for every change; do not replace them with hand-run steps, ad-hoc scripts or PowerShell. Each tool takes `--project v3|qollock|showrank|all` and `--help`. Commands are listed under [Commands](#commands).

1. **Start of work:** `tools/doctor.js`. Fix every FAIL before editing. A pin-mismatch WARN means the installed game differs from `game-data-pin.json`: say so in the hand-off, and build with `--allow-pin-mismatch` only when the user accepts it.
2. **New ticket:** `tools/ticket.js new` creates the next `issues/NN-*.md` and the MAP/SPEC stubs. Do not number or lay out tickets by hand.
3. **New setting:** `tools/new-setting.js` (try `--dry-run` first). Do not hand-edit slots, `recordVersion` or `slotAdditions`; then work through the checklist it prints. A feature with several settings bumps the record once: pass `--same-version` for every setting after the first.
4. **Before a renderer, preview or menu change:** `tools/budgets.js --save .tmp/budgets-before.json`; afterwards `--compare` it and put the deltas in the ticket. Raise a limit only on purpose, with the reason in the ticket.
5. **While editing:** keep `tools/dev.js` running, or run `tools/test.js` after each change. Write the failing test first, as the test rules below require.
6. **Before hand-off:** `tools/test.js --all`, `node --test scripts/validate-hp-colors-rewrite-v2-storage.test.js`, `tools/engine-facts.js --check`, and the three generator `--check`s (`doctor.js` runs those).
7. **Builds:** only `tools/build.js --project <p> --skip-deploy`. A change to the menu, topbar or shared scripts needs `--project all`. Record each pak with `tools/vpk-check.js hash`, and prove a feature reached the pak with `vpk-check.js has`.
8. **After the user tests in game:** `tools/logscan.js` is the console check (exit 1 means errors). Quote its summary and the installed-pak line in the ticket and the live ledger. Use `tools/timing.js` when a build or the suite gets slower.
9. **Keeping the tools true:** when you add a source file or tool, add its rule to the table in `tools/test.js`. When the game updates, refresh `tools/lib/engine-facts.json` (`engine-facts.js --refresh`) along with the pin. When a tool is missing a step you did by hand twice, add it to the tool, with a test, and document it here.

## Source boundaries

- Edit `settings/schema.json`, `settings/record.json`, `tools/`, handwritten `panorama/scripts/` and `panorama/styles/`, and focused `tests/`. Pinned `vendor/` inputs and their pins change only through an explicit reviewed rebase.
- Regenerate, never hand-edit: `generated/`, `panorama/scripts/hp_colors_v3_settings.js`, `panorama/scripts/hp_colors_v3_world_settings.js`, the four generated `panorama/layout/*.xml` files (`hud_escape_menu`, `unit_status_overlay_v2`, `citadel_hud_top_bar`, `citadel_status_effect`; `hp_colors_v3_relay.xml` is handwritten) and `panorama/styles/unit_status_v2.css`. `OUTPUTS` in `tools/generate.js` lists the exact outputs; `generated/` holds `defaults.json`, `slots.json`, `search-index.json` and `menu-rows.xml` (`ids.json` and `heroes.json` are no longer produced).
- Never edit `.build/`, `.tmp/`, compiled assets, staging trees, VPKs or archives as source. Each project's build owns its lane's `.build/{release,debug}/pak02_dir.vpk`; no wrapper deploys.
- Preserve append-only setting-slot identities and versioned record upgrades. Migration belongs in `hp_colors_v3_from_v2.js`; v3 never writes v2 keys or formats.

## Commands

Run from the repository root; choose the relevant checks, and use the full lane suites (`tools/test.js --all`) before handing off runtime changes.

```powershell
# checks before a build
node hp_colors_rewrite_v3/tools/doctor.js                      # toolchain, game install vs pin, generators (--project, --only, --json, --fix-hints)
node hp_colors_rewrite_v3/tools/test.js                        # tests for the files you changed (--files a,b  --grep <name>  --list  --list-unmapped  --all)
node hp_colors_rewrite_v3/tools/dev.js                         # watch loop: regenerate, cheap checks, mapped tests (--once, --build, --no-write)
node hp_colors_rewrite_v3/tools/budgets.js                     # every counted budget with limit and headroom (--save f, --compare f, --from tap)
node hp_colors_rewrite_v3/tools/engine-facts.js --check        # every CSS property, style key, $ function, panel method and event the mod uses exists in the engine

# generators
node hp_colors_rewrite_v3/tools/generate.js [--check]
node hp_colors_rewrite_v3_qollock/tools/qollock.js [--check]
node hp_colors_rewrite_v3_showrank/tools/showrank.js [--check]

# builds (build-only; nothing is ever deployed)
node hp_colors_rewrite_v3/tools/build.js --project v3|qollock|showrank|all --skip-deploy [--debug] [--allow-pin-mismatch]

# after a build or a game session
node hp_colors_rewrite_v3/tools/vpk-check.js list|has|diff|hash <vpk> | --project <p>   # e.g. has --project showrank HPColorsV3HPPercent
node hp_colors_rewrite_v3/tools/logscan.js                     # game console.log: errors mapped to source, [HPV3] lines, timings (--follow, --only, --file)
node hp_colors_rewrite_v3/tools/timing.js                      # where build time went, slowest test files

# scaffolds
node hp_colors_rewrite_v3/tools/new-setting.js --key k --name "Name" --type enum --side side-aware --page "HP Text" --after <key> ... [--dry-run]
node hp_colors_rewrite_v3/tools/ticket.js new --title "..." [--project p] [--map] [--spec-after N]

# full suites (what test.js --all runs, plus v2 storage)
node --test hp_colors_rewrite_v3/tests/*.test.js
node --test hp_colors_rewrite_v3_qollock/tests/*.test.js
node --test hp_colors_rewrite_v3_showrank/tests/*.test.js
node --test scripts/validate-hp-colors-rewrite-v2-storage.test.js

# repo hygiene (repo root tool; report only unless --apply)
node tools/clean.js > .scratch/clean-report.md
```

- **Tooling (2026-11-13).** The build is Node only: `tools/build.js` replaced the three PowerShell wrappers and `scripts/hp-colors-v3-pipeline.ps1` after producing a byte-identical ShowRank pak (`cd24ded1`). Every tool takes `--project v3|qollock|showrank|all` from one lane table, `LANES` in `tools/lib/projects.js` (one `lane()` row per lane); shared toolchain code (compiler run, .NET roll-forward, Deadlock install discovery, pin-mismatch message) is in `tools/lib/toolchain.js`.
  - **Adding a lane:** add one `lane()` row to `tools/lib/projects.js` (folder, labels, composer tool, pak02 contracts) and write the lane's own tool. A test checks that every tool header lists the lanes, so update those headers too. `test.js --list-unmapped` lists source files that no rule in the table covers.
  - **Edit loop:** run `dev.js` while editing, or `test.js` for a one-off; both map changed files to tests through the rule table in `tools/test.js`. Add a rule there when you add a tool or a source file that no test names, or changes to it fall back to the full suites.
  - **Before a build:** `doctor.js`. The build refuses when the installed game's `ClientVersion` differs from `game-data-pin.json`; rebase the pin or pass `--allow-pin-mismatch` and record that in MAP.md. The compiler targets .NET 9; when only a newer runtime is installed the build sets `DOTNET_ROLL_FORWARD=Major` for the compiler process alone.
  - **Adding a setting:** `new-setting.js` validates through the schema (a bad row fails the same way as in the generator) and writes the schema row, slots, record version and NEW item, regenerates all three projects and prints every test pin to update (record version, card order, release list, budgets, largest-convertible scopes). `budgets.js --save` before and `--compare` after shows what the change cost.
  - **After a CSS or layout change in game:** `logscan.js` is the console check; it exits 1 on `Parsing error`, `FATAL`, `Uncaught` or a JS exception and names the source line. It only reads the log; it never launches or writes to the game.
  - **Engine facts:** `tools/lib/engine-facts.json` holds what the 6861 DLLs register (140 CSS properties, at-rules, combinators, limits, 28 `$` functions, panel members, 1,121 events), each with its evidence; [research/dll-tooling-findings.md](research/dll-tooling-findings.md) explains how it was extracted. `tools/lib/stylesheets.js` fails the generator on the engine limits (selector list 2,047 bytes including comments, one selector 256 characters, value 4,095 bytes, `@define`/`@keyframes`/`@import` text 1,023 bytes), unknown properties, unsupported at-rules and `+`/`~` combinators; 10 selectors / 1,024 characters remains as the stricter project ceiling. The test adapter throws when test code calls a `$` function, panel method or dispatched event that is not in the facts file (`HPV3_ADAPTER_STRICT=0` turns it off, `=full` also checks registered event names). Refresh the facts after a game update that changes Panorama (`engine-facts.js --refresh --from <Deadlock folder>` prints the extraction steps).
  - **Generator layout:** `generate.js` and `menu-layout.js` are entry points over `tools/lib/` (table below). Outputs must stay byte-identical when moving code between them. The generator throws for an enum with more than four options (the menu has no dropdown control).
    - **Tool plumbing:** `cli.js` (flag loop, project choices, `localDate`; each tool keeps its own flag spec), `tap.js` (TAP parsing, failure summary), `run.js` (runs `node --test`, asks git what changed, lists test files), `projects.js` (the lane table and the per-lane contracts), `toolchain.js` (compiler, VPK, 7-Zip, Deadlock discovery), `pin.js` (the one reader of `game-data-pin.json` and the QOLLOCK `vendor/pin.json`, and of `ClientVersion`), `output.js` (`writeOrCheck`, `isStale`, `staleFiles` for generator outputs).
    - **Generator inputs and checks:** `schema.js` (settings table), `slot-contract.js` (slot rules against the committed outputs), `news.js` (`settings/news.json`), `settings-scripts.js` (the two generated settings scripts), `stylesheets.js` (engine limits for every `.css`), `engine-facts.json` (engine facts).
    - **Layouts:** `stock-layouts.js` (patches to the stock Escape menu, overlay, topbar and status-effect layouts, as data), `layout-compose.js` (mechanics shared by v3, QOLLOCK and ShowRank composers), `menu-markup.js`, `menu-rows.js`, `menu-buttons.js`, `menu-dialogs.js` (one table row per dialog), `menu-presets.js`, `menu-news.js`, `menu-preview.js` (the menu parts that `tools/menu-layout.js` assembles).

- **Script structure (read this before a renderer, menu, preview or storage change):**
  - **Renderer** (`hp_colors_v3_renderer.js`): a named-constants block of plain locals at the top (tuning, schema defaults, stock sizes, lease keys) and a PART REGISTRY data table. The published `parts`, `statusScales`, `pickupKinds` and `defaults` are getters built on first read (menu preview and tests only), so they cost nothing in a world bar. `facts` no longer carry `relation`, `team1` or `team2`, and `apply` is no longer exported. `status.plansComputed` is a debug and test counter.
  - **Bridge** (`hp_colors_v3_bridge.js`): `send`, `subscribe` and `emit`. The magic strings are plain wire strings; size caps live with each consumer. Two guards in the renderer's `onConfig` and config request stay because the menu context loads the renderer without the bridge.
  - **Menu** (`hp_colors_v3_menu.js`): `CONTROL_TYPES` holds one `ids(row)` per control type and `BASE_TYPE` the defaults; an unknown type throws at boot. `ROW_PICKER` and `CONDITION_PICKER` are the opener objects for the colour picker. `$.HPColorsMenuIsOpen()` is the open check the QOLLOCK bridge calls. Shared helpers: `abandonGesture`, `applyThroughStore`, `hideBakedDefault`.
  - **Preview** (`hp_colors_v3_preview.js`): `setSettings(settings, {showBounds, shake})` replaced `setTeam`, `setUnitKind` and `shakeOnEdit`; `writeSampleMarks()` holds the class writes.
  - **Do not undo the optimisation pass (be2a0cd):** world settings rows are a flat 7-value table (key, side code, type code, low, high, step, options joined by `|`) emitted by `tools/lib/settings-scripts.js`, and the world validator is incremental (it re-checks only changed fields), so a new field type needs a type code in the generator. The renderer's `apply()` skips `applyTo` while `stateVersion` and the plan are unchanged: bump `stateVersion` at every cache panel write and ledger mutation (a new cache field that `applyTo` reads must bump it). Menu caches for nav dots and row classes are cleared where `panels` is replaced. Benchmarks are scratch, not shipped: `.scratch/untangle/opt/{renderer,timers,menu}/`.
  - **Storage** (`hp_colors_v3_storage.js`, codec): `encodeWithinCap` is the one save-size check, and the codec owns the `SAVE_TOO_LARGE` text. Storage takes no partial menu API and no injected schedule or log options. The codec throws on a contradictory contract.
  - **World boot** (`hp_colors_v3_world_boot.js`): reports a clear error when a required script is missing.
  - `tools/dev.js` treats `relay.xml` as source; `tools/test.js` also selects the legacy-shield suite when `menu.js` changes.
- Test time: the v3 suite takes about 1.5 min (CPU-bound on 8 cores; the import fuzz is split into six `import-fuzz-<n>.test.js` shards over `tests/import-fuzz-cases.js`). All three projects build through `tools/build.js`, which runs the same staged v3 suite (`runV3Suite`), which records a pass under `.build/suite-pass/<key>`. `tools/suite-cache.js` hashes the staged tree, all v3 sources and tests, the shared adapter/pipeline scripts, the v3 wrappers, the repo ignore rules, the local hpv2-store checkout, every HPV3_* variable the suite reads, Node and the mode (not git's global excludes), and a new external input a test reads must be added there, so the QOLLOCK and ShowRank builds reuse the canonical build's pass for the same mode. `HPV3_SUITE_CACHE=0` forces a run. While iterating, run the focused suite plus one debug build; a staged debug or release build already runs the full suite, so a separate unstaged full run is not needed before the builds.
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
  - **The output is checked:** it must parse, and every `$.Name` and UPPER_CASE string constant must survive. Both release builds then run the full VM suite on the compiled output.
  - **Release stack traces show renamed locals.** Reproduce errors with a debug build.

## Storage and hosted page

- Follow the [storage contract](SPEC.md#storage-contract) for required CAS readiness, fail-closed saving, touched-slot precedence, conflict refusal and complete draft recovery.
- The hosted source is `D:/hpv2-store/index.html`, outside pak02; [vendor/hpv2-store.pin.json](vendor/hpv2-store.pin.json) identifies the pinned script. Keep v2 storage compatibility and the other hosted applications' keys untouched. Never push/publish without explicit user approval; local tests do not prove served bytes or cache eviction.
- Releases bump `settings/record.json` `release` only (fixes: patch; user-visible features: minor) and record it in the [MAP changelog](MAP.md#changelog). Raise `hpv3` in hpv2-store `latest.json` only after that release is downloadable, because every lower version then shows the [update notice](issues/33-update-notice.md). List each build's GameBanana file under `download.hpv3` as `normal`, `qollock` and `showrank`; a missing key hides that build's DOWNLOAD. After pushing a page change, re-pin [vendor/hpv2-store.pin.json](vendor/hpv2-store.pin.json) to the pushed commit with `published: true`, then check the served script hash. The page never writes the title unprompted; keep `lv` request-answered.

## Debug and live acceptance

- Logging and its timing clocks/counters are gated by complete single-line `// HPV3_DEBUG ...;` statements. `tools/stage-scripts.js` removes them in release and enables `[HPV3]` boot/lifecycle, hero/tier, save/store and timing diagnostics in debug; release must contain no logging or timing-accounting work.
- Only the user or an agent with current user consent may install, launch or benchmark Deadlock. Follow [ticket 11](issues/11-live-test-1-core.md) and [ticket 26](issues/26-release-at-parity.md): preserve rollback, use debug, fully restart after an authorized install, and record the game build and installed pak hash.
- Check the actual menu/world behavior and stock restoration, save/restart and affected variants; CSS changes require an in-game load plus a console check: run `node hp_colors_rewrite_v3/tools/logscan.js` after the session (it reports `Parsing error`, `FATAL`, `Uncaught`, JS exceptions and selector-buffer errors with their source lines, and exits 1 on any). Retain representative screenshots and update the live ledger without promoting VM/build evidence to live evidence. FPS claims require a separately authorized PresentMon A/B.
