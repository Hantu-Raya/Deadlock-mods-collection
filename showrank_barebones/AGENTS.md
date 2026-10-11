# ShowRank Barebones

## Scope

`showrank_barebones/` owns predicted-rank images on profile cards, dashboard profiles, topbar players, team averages and Escape player rows, plus the early-lane `MISSING` portrait indicator and shared enemy-missing hero announcement. It also ships Stats vs Community, StatLocker, account-copy and Player Profile actions. Read [README.md](README.md) for behavior and [root AGENTS.md](../AGENTS.md) for repository rules.

`../build_showrank_barebones.ps1` creates `showrank_barebones_dir.vpk`; `-Install` replaces `citadel/addons/pak89_dir.vpk`. The sibling `../showrank_barebones_no_missing/` overrides the same resources without missing-lane UI and also claims pak89. Install only one edition; other pak89 variants conflict too.

`../build_hp_colors_rewrite_v2.ps1 -ShowRankBarebones` reads this module's Escape and topbar layouts for composition. HPv2's pak02 overrides `hud_escape_menu.xml` and `citadel_hud_top_bar.xml` and shadows pak89's copies. With HPv2 installed, use this composed pak02 variant, never the plain HPv2 pak02. Otherwise Escape ranks, team averages and the missing toast silently disappear. The composition merges Escape includes and handlers, appends every ShowRank topbar style include HPv2 lacks (including stock `citadel_hud_game_announcements`, which the toast needs), and inserts the notification and team-average layers. The related `../build_topbar_rank_barebones.ps1` and `../build_topbar_rank_barebones_no_missing.ps1` stage their own `topbar_rank/` and `topbar_rank_no_missing/` sources, not these layouts. A rebase here does not automatically update those copies or the no-missing edition.

## Source ownership

- `panorama/layout/` contains seven stock-derived import seams. Preserve engine-fed IDs, hierarchy, bindings, snippets and native handlers; custom classes identify role panels across contexts.
- `panorama/scripts/showrank_barebones.js` is one strict ES5 IIFE, dispatched by context panel type. Profile actions live on the profile panel; Escape actions live on its context-local `$`. The document-root `__showrank_barebones_state_v1` owns Escape sessions, the verified pure `{hero, account}` cache and missing-lane coordination; the notification root owns `__showrank_barebones_missing_toast_state_v2`.
- `panorama/styles/showrank_barebones_topbar.css` owns custom geometry, scoreboard-only average visibility and native-class-driven missing indicators. It also hides the profile page's `ForumButton`.
- Canonical comparison JS/CSS belong to `../profile_stats_community/panorama/`; identity policy belongs to `../scripts/viewed-profile-identity-policy.js`. `../scripts/profile-stats-community-composition.js` resolves the host's `PROFILE_STATS_COMMUNITY_RUNTIME`, `PROFILE_STATS_COMMUNITY_STYLES` and `VIEWED_PROFILE_IDENTITY_POLICY` placeholders exactly once in tests/staging. Do not paste canonical implementations into the host templates.

The stock baseline for each layout is `2d87734c (2026-10-09, build 6774)` in SteamTracking/GameTracking-Deadlock. Between `573a4129` (6728) and `2d87734c`, only `citadel_hud_top_bar_player.xml` changed: `7148202f` (6757) dropped `particleonly="false"` from `KillStreakParticlePanel` (the same commit moved stock `#CriticalIndicator` CSS to `margin-top: 74px`). Earlier, after `58b3529c`, `SoulsValue` began binding `{s:gold}`, and the `HeroHealth` ProgressBar became `HealthBar_Contents`/`HealthBar_Fill`. The table records mod deltas, not stock changes. Below, **JS/CSS** means the module runtime/stylesheet above; **rank test** means `tests/showrank-barebones-runtime.test.js`; **community test** means `tests/profile-stats-community-runtime.test.js`, which delegates to `../scripts/profile-stats-community-runtime-oracle.js`.

| Layout | Stock baseline | Mod delta to retain | Dependent runtime / test |
| --- | --- | --- | --- |
| `profile_card.xml` | `2d87734c (2026-10-09)` | JS/CSS includes; `ShowRankBarebonesProfileCard` class and guarded hover `ShowRankBarebonesRefresh`; `ShowRankBarebonesRankImage` in `CardOverlay`; hidden bound `ShowRankBarebonesAccount` and `ProfileStatsCommunityContextAccount`. | `buildProfileRecord`, `resolveProfileAccount`, panel action exports; rank test covers direct/conflicting identity, refresh and menu actions. |
| `citadel_db_page_profile.xml` | `2d87734c (2026-10-09)` | JS/CSS includes; `ShowRankBarebonesProfilePage` class and guarded hover refresh; `ShowRankBarebonesProfilePageAccount`, `ShowRankBarebonesProfilePageRankHost`/`RankImage`; full `ProfileStatsCommunity*` button, comparison/filter/heading/status/metadata/support/retry/HTML bridge shell and hidden bound Account; `PSCMetric*` triplets and `PSCGroup*Percentile` badges. PoweredBy/Donate activate external URLs. | `buildProfileRecord` and `installProfileStatsCommunity`; canonical `profile_stats_community.js` binds controls/metric IDs; rank test covers dashboard identity, community test covers the composed comparison runtime. |
| `citadel_ui_context_menu_player.xml` | `2d87734c (2026-10-09)` | Populate stock `MenuOptionsPanel` with `ShowRankBarebonesStatlockerRow` and `ShowRankBarebonesCopyAccountRow`; add sibling `ProfileStatsCommunityPlayerProfileRow`. Each keeps stock `MenuRow`/`MenuButton` conventions and calls `#ProfileCard`'s guarded `ShowRankBarebonesOpenStatlocker`, `ShowRankBarebonesCopyAccount` or `ShowRankBarebonesOpenPlayerProfile`. No new includes. | Profile-panel exports and click-time `resolveProfileAccount`; rank test checks exact native dispatches and invalid/conflicting evidence. |
| `citadel_hud_top_bar.xml` | `2d87734c (2026-10-09)` | Add stock announcement CSS and mod CSS, but no JS include; `ShowRankBarebonesNotificationRoot`; `ShowRankBarebonesTeamAverageLayer` containing `ShowRankBarebonesAverageFriendlyImage`/`EnemyImage` with their full classes. | `getMissingNotificationRoot`, toast rendering, team-average writes and CSS; rank test covers shared toast lifecycle and verified team inputs. |
| `citadel_hud_top_bar_player.xml` | `2d87734c (2026-10-09)` | JS/CSS includes; `ShowRankBarebonesTopbarPlayer` class; passive `ShowRankBarebonesTopbarRankImage` in `HeroContents`; passive `ShowRankBarebonesMissingIndicator` with MISSING label in `HeroImageArea`. | `buildTopbarRecord`, roster matching, missing coordinator and CSS; rank test covers hero changes, duplicate evidence, leader replacement and eight-minute expiry. |
| `hud_escape_menu.xml` | `2d87734c (2026-10-09)` | JS include; guarded `$.ShowRankBarebonesEscapeOpen` on load/mouseover and `$.ShowRankBarebonesEscapeOut` on mouseout; retain native cancel/resume. Existing mod copy omits stock `CitadelPrivilegedFeatures#PrivilegedFeatures`. | `startEscapePass`, deferred close/reset and `scheduleEscape`; rank test covers explicit intent, bounded probes, cache replay, cleanup and stale tokens. PrivilegedFeatures omission has no focused test. |
| `players_list_entry.xml` | `2d87734c (2026-10-09)` | CSS include only; `ShowRankBarebonesPlayerRow` class; passive `ShowRankBarebonesPlayerListRankImage` and hidden, collapsed bound `ShowRankBarebonesRowHero` under stock `MainContents`. | `buildRowRecord` and Escape's direct row probing; rank test covers late rows, unique hero mapping and freshness. No row-local JS registration is required. |

## Initialization

- Profile contexts resolve account/image panels, export four `ShowRankBarebones*` panel handlers, and start bounded startup refreshes. Hover refresh increments `refreshToken`; stale callbacks stop. Hideout replacements require stable direct identity samples. Dashboard contexts additionally install the composed comparison runtime.
- Topbar-player contexts register missing records independently of rank-image readiness and perform two startup rank refreshes. One document-scoped missing leader ticks every 0.5 seconds; per-record 1-second backups can replace a dead/stalled leader. Session/leader tokens prevent duplicate chains. The window ends at eight minutes; hideout/invalid clocks suppress it.
- Escape only exports handlers at script load. Native load/hover requests are gated by `Hud.ShowEscapeMenu`; passive topbar evaluation must not preload or probe. An explicit opening activates `PlayersTab`, discovers rows, sequentially activates stock `MainContents` and accepts Direct profile witnesses. One private roster read model owns coverage, matching, freshness and readiness. Complete six- or twelve-player caches replay without row probing; do not assume an eight-player cache is supported.
- Mouseout defers close inspection with `$.Schedule(0, ...)`; an open menu must not cancel the session. Closing/replacing Escape advances `escapeToken`. Every `scheduleEscape` callback checks session identity, token, panel validity, hideout and native open state. Terminal paths dismiss native context menus and drop input focus.

## Runtime rules

- Validate selected-account evidence through the shared identity policy at use time. Passive topbar observations never invent accounts; only Direct witnesses or a verified pure cache may fill a match. Reject duplicate heroes/accounts and stale targets; keep ambiguous ranks hidden.
- Barebones has no topbar spinner/status surface. Preserve spinner-free readiness decisions and bounded retries; keep traversal/writes in adapters rather than duplicating roster policy in callers.
- Guard volatile panel APIs with `isValid` and narrow `try/catch`. Cache within the existing bounded passes and avoid unchanged image/class writes. Keep `$.Schedule` delays in seconds and retain ownership-token checks.
- XML IDs/classes, runtime lookups, CSS, mocks and native-handler exports form one contract. Preserve `HeroName`, `TeamFriendly`/`TeamEnemy`, `GameTime`, `HealthVisible`, `Dead`, `Disconnected`, `PlayersTab`, `MainContents` and `Hud.ShowEscapeMenu`. Never rename stock binding IDs or replace engine-owned state with guesses.
- Closure ADVANCED is authoritative, not readable-source syntax alone. `../build_showrank_barebones.ps1` generates externs from every dotted property name in the composed readable runtime, plus explicit dynamic lookup keys; it asserts those object keys and protocol group IDs survive minification. Extend these checks when adding dynamic keys.
- Keep script-owned object access consistently dotted; do not mix `state.x` with `state["x"]`. Quoted-key access can break when ADVANCED renames the script-owned property, even if unminified mocks pass. Keep external/dynamic protocol keys stable through the wrapper's extern/key contract rather than relying on accidental preservation.
- The wrapper asserts public fragments `ShowRankBarebonesRefresh`, `ShowRankBarebonesOpenStatlocker`, `ShowRankBarebonesOpenPlayerProfile`, `ShowRankBarebonesCopyAccount`, `ShowRankBarebonesEscapeOpen`, `ShowRankBarebonesEscapeOut` and `ShowRankBarebonesMissingWindowExpired`. Synchronize new XML handlers with exports, extern generation and build assertions.
- Use Source 2 CSS and passive `hittest="false"` overlays. Preserve native missing/death/disconnect visibility and scoreboard-only averages; do not add browser DOM or global player/entity traversal.
- The missing toast maps the lowercase `HeroName` text to `MISSING_HERO_ICON_FILES`. Derive each value from stock `scripts/heroes.vdata` `m_strIconImageSmall` plus the hero's English `citadel_gc_hero_names` name. Compiled names keep the source extension, so `hornet_sm.png` becomes `hornet_sm_png.vtex`. Check every new hero after a Deadlock update. Unknown heroes render no icon, and non-English hero names do not match the map.

## Source and generated files

Edit source and focused tests/build contracts only. Never hand-edit `_showrank_barebones_build/`, compiled siblings, VPKs or archives. The wrapper stages composed readable JS, Closure output and compiled assets under `_showrank_barebones_build/`; `-KeepStaging` retains them for inspection. Ignore stale `.worktrees/` checkpoints.

For **rebasing stock layouts after a Deadlock update**:

1. Save the current source diff and obtain exact previous/new stock copies for all seven files. Fetch from `https://raw.githubusercontent.com/SteamTracking/GameTracking-Deadlock/<sha>/game/citadel/pak01_dir/panorama/layout/<file>`; do not reconstruct stock markup from memory.
2. Diff previous stock against new stock separately from `git diff --no-index -w <previous-stock-file> <mod-file>`. Classify each difference as stock behavior, mod delta or dump-format noise before merging.
3. Start from new stock and reapply only the table's mod deltas, including include order, panel parents, bindings and guarded handlers. Keep stock additions and changed attributes/classes. The PrivilegedFeatures omission is an existing delta with unexplained intent, not permission to remove other engine panels.
4. Keep compiled `s2r://...vcss_c` includes. Upstream's `.vcss_c` to `.vcss` rewrite in `58b3529c` is Source 2 Viewer dump-format noise, not a game change; normalize includes without reverting real stock changes.
5. For the September 29 rebase, merge the player root's custom class with new stock `hittest="false"`; remove the old child-level hittest as stock does. Retain `#kill_hype_KillStreak:f`, `PlayerHeroReleaseVote`, topbar `gShopOpen gStreetBrawl gPVE` listeners/`MidbossTimerLabel`, and Escape's `matchmakingLeaveQueue.leavequeue`. Check announcement/rank geometry beside these additions in-game.
6. Update the baseline column to the actual new SHA/date only after all seven are rebased. The `58b3529c` migration's previous file SHAs were: profile page `10bc3fa5`, topbar `0625d48f`, topbar player `4cac0536`, context menu/profile card `cc2b0c96`, Escape `08f3ae66`, player row `a1084d7a`. Compare those old copies before treating existing content as a mod delta.
7. Review the final mod-versus-new-stock diff for only intentional deltas; check sibling/composed consumers within the authorized scope. Run validation, wrapper/package checks and the live smoke below; report source, build, installation and live evidence separately.

## Verification

Run from the repository root:

```powershell
npm --prefix .\showrank_barebones run validate
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_showrank_barebones.ps1 -KeepStaging
# Only when installation is intended and Deadlock is closed:
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_showrank_barebones.ps1 -KeepStaging -Install
```

`package.json` runs both runtime tests plus `node --check`. The wrapper repeats source validation, composes placeholders, runs ADVANCED and both tests against its minified runtime via `SHOWRANK_BAREBONES_RUNTIME`, then compiles and asserts exact source/compiled/VPK asset sets. The package must contain exactly seven compiled layouts, one runtime and one stylesheet. Source 2 Viewer inspects the VPK; installation checks Deadlock is closed and verifies the temporary copy's hash/asset set before replacement.

After installation, restart Deadlock for live smoke. Check profile card/dashboard rank identity, all three context actions, comparison filters/retry/navigation, Escape first-open population and close/reopen caching, player/team ranks and scoreboard visibility, early enemy-missing indicators/announcement and eight-minute cleanup. Exercise hideout-to-match transitions and stock queue/resume, kill-streak, midboss and hero-vote surfaces affected by the rebase at supported UI scales. Check Panorama/VConsole for script errors. VM tests do not load the XML or prove engine bindings, live rendering, load order or frame cost; never claim that smoke passed unless it was actually performed.

## Diagnostics (profiling) build

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_showrank_barebones.ps1 -Diagnostics -KeepStaging
# Explicit install only, Deadlock closed; reinstall the normal build afterwards:
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_showrank_barebones.ps1 -Diagnostics -Install
node scripts\showrank-barebones-diag.js report "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\console.log"
```

`-Diagnostics` writes `showrank_barebones_dir.diag.vpk` and never touches the source tree. `../scripts/showrank-barebones-diag.js instrument` changes only a private copy of the host template under `_showrank_barebones_build/diag_host`, before composition and ADVANCED:

- Every 4-space top-level host function counts its calls.
- Every `schedule`/`scheduleEscape` site labels its callback with the scheduling function. `scheduleEscape` keeps its caller's label. Every other `$.Schedule` call in the context is labelled `unattributed@<delay>`: Profile Stats Community on the profile page, or any other script sharing the layout context.
- The context-local `$.Schedule`, `$.CancelScheduled`, `$.CreatePanel` and `$.DispatchEvent` are wrapped. The exported native handlers are timed as `on:<name>`. In the composed HPv2 Escape layout, `unattributed@0/1/5` rows are the HPv2 menu identity poll (`identityPollDelay`), and most engine `CreatePanel` calls are HPv2 menu construction, not ShowRank.
- Two spans split the per-row Escape cost: `activate` times ShowRank's row `$.DispatchEvent("Activated", record.mainContents, "mouse")` in `probeNextRow`, and `cardScan` times both profile-card `scanRecords` calls (`snapshotProfiles`, `changedProfileAccount`). The instrumenter fails unless it finds exactly one and two anchors.

The instrumenter fails if any schedule site is not a line-start statement or an anchor is missing. The probe makes no panel calls of its own and adds no schedules.

Each context prints one `[SRBDIAG] v1 {json}` line of at most 900 characters. It prints after 60 s while callbacks are pending, or after at least 10 s once the context goes idle. A line holds the kind (`card`, `page`, `topbar` or `escape`), callback rows `[label, n, total ms, max ms, >=4 ms]`, the top 16 functions, engine `[CreatePanel, DispatchEvent]` counts, optional span rows `sp = [name, n, total ms, max ms, >=1 ms]` (already included in the enclosing callback totals) and, from the current missing leader only, `ms = [records, running, checks]`. Timing uses `Date.now`, so sub-millisecond callbacks read 0. Rely on call counts and rates rather than averages. Short-lived profile cards may never report.

The wrapper runs both full test suites against the minified instrumented runtime, so instrumentation cannot change behavior. `SHOWRANK_BAREBONES_DIAG=1` also runs the gated end-to-end scenario at the end of the rank test, which writes `.tmp/showrank-barebones-diag/harness-report.txt`. The wrapper fails if that artifact is missing.

With HPv2 installed, the diagnostics pak89 pairs with `build_hp_colors_rewrite_v2.ps1 -ShowRankBarebones`. Install pak89 first, because that build verifies the installed pak89. The composed Escape and topbar then load the instrumented runtime from pak89.
