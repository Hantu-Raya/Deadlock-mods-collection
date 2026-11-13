# 22: Styling: SHOW BOUNDS and own-HUD color

**What to build:** SHOW BOUNDS session toggle and own bottom-HUD health color.

**Blocked by:** 21

**Status:** done (VM); in-game look pending ticket 26 **Live:** the user confirmed it works in game (2026-10-17, [ledger](../LIVE-VERIFIED.md)).

**Runs on:** gpt-6.1-sol (med). **Review:** code-review.

- [x] SHOW BOUNDS never enters saves or codes
- [x] Matches SPEC stories 20-21
- [x] VM E2E tests boot the real scripts and pass

## Inventory against v2

- **SHOW BOUNDS** (v2 `hp_colors_v2_menu.js` 1478, 1552, 4148-4155, 5818, 6368-6379, 6536; world `unit_status_v2_colors.js` 3799-3803, 3851; `unit_status_v2.css` 2458).
  - v2 shows `HPV2CanvasBounds`, a 1px `#5fe69e` full-canvas rim outside the motion frame, on every bar with a customized surface (`showBounds && bar.surface`). It is not limited to the open menu: it stays on after closing the editor, in a real match, until toggled off or the game restarts. Uncustomized bars (master off, closed unit kinds, local player) never show it. v2's menu preview has no rim.
  - v3: a SHOW BOUNDS switch sits at the foot of the page rail (`HPColorsShowBoundsToggle`). The menu keeps `showBounds` outside the settings and adds `showBounds: true` to the config message only while it is on, so the default message is the unchanged settings envelope. The toggle bumps the revision without touching the settings, Undo or the store. Like v2's root attribute, the state is kept on the menu's top panel (`hpv3_show_bounds`): a reloaded Escape menu keeps it, and a restarted game does not.
  - World: the overlay patch adds a static, collapsed `HPColorsV3CanvasBounds` before the motion frame (generated, anchor-patched like the other owned panels). `plan(input, config, view)` adds the owned root class `HPColorsV3Bounds` only for eligible, customized bars, and CSS shows the rim. Master off, closed kinds, stop and a later config without the flag all release it.
  - Preview: the ticket asks for it, so the preview canvas gets the same rim (`HPColorsPreviewCanvasBounds`), painted by the same plan rule through `createPainter().paint(classes, config, view)`. This is a small, deliberate addition over v2.
- **Own bottom-HUD health color** (v2 `hp_colors_v2_menu.js` 815-820, 1968-2055, 2463, 2481; `FEATURES.md:35`; `AGENTS.md:69`).
  - Settings: `hudHealthColorMode` (off/team/custom, default `off`, slot 165) and `hudHealthColor` (`#FFFF00`, slot 166), both shared Basic rows in the Bar page's "Your health bar" group (v2: GENERAL → Basics; v3 has no General page, and the Bar page holds the master switch).
  - Painting follows v2 exactly. The decision is from Main, 2026-10-15; the original ticket wording "Off restores stock" was withdrawn. Only the menu writes inline `backgroundImage`, `backgroundColor` and `washColor` on the local `#health_and_abilities_container … #health_bar_Left`, never on unit bars or other HUD layers:
    - **OFF** (default) paints v2's plain white bar while HP Colors is on: the neutral `healthbar_fill_texture_png` texture, a `#FFFFFF` background and a `#FFFFFF` wash. It overrides the team texture and the yellow mid-health tint.
    - **TEAM** uses the same base with team1 `#E7B659` / team2 `#5B79E6`, read from the container's classes.
    - **CUSTOM** uses the same base with `hudHealthColor`.
    - HP Colors off, a load that is still pending, and an unknown or conflicting team in TEAM all release all three properties to the game's look with `null`. That includes leftovers from an earlier menu context, because a new context starts with an empty write cache, exactly like v2.
    - v2's note is kept: writing a wash repaints at once, while clearing it alone waits for the next engine health update. That is why OFF writes white instead of clearing.
  - The help text says plainly: "Off: plain white bar. … Turn HP Colors off to get the game's colors back."
  - Watch: v2 piggybacks on its 1 s in-match identity poll, and v3 has no identity poll yet (ticket 23). The menu therefore runs one named 1 s `hudWatch` only while HP Colors is on and a HUD root exists, or every 5 s while that HUD has no health bar yet.
    - The HUD root is found as the menu's `Hud` ancestor, or by id from the top panel.
    - The bar's parent chain, including the HUD root's own link, is cached and checked each second. Replacement, a move or a detached HUD re-resolves and releases the old bar first.
    - Unchanged values are never rewritten. While off or loading there is no watch once releases have landed; while on, a missing HUD is searched every 5 s (audit 22).
  - No new layout or context was needed: the HUD is engine-owned and reached from the Escape-menu context, as in v2. So nothing was vendored, and the build's required-asset list is unchanged (no new compiled file). `build_hp_colors_rewrite_v3.ps1` was not run.
- **Record and converter:** record v11 adds slots 165-166 as a slot addition (`settings/record.json`). Older v3 records promote retained v2 pending through the existing version-boundary step; saves stay sparse and use the flat `[slot,value,…]` wire. The worst-case settings code is 2,342 characters, with 1,754 characters of margin under 4,096. The converter maps both v2 keys explicitly (`hudHealthColorMode`, `hudHealthColor`).
- **Bug found by the new ops scenario and fixed:** the timer-only repaint (`setTimerFacts`) called `plan` without the view, so SHOW BOUNDS flickered on every ultimate-timer update (14-20 class writes per 10 s). It now passes the view.
- **Docs:** `SPEC.md` (Record codec: v11; Transport: the `showBounds` flag).

## Evidence

- `node --test tests/*.test.js`: **787/787 pass**, 0 skipped (`.tmp/t22-suite.log`). That is 741 plus 46 new:
  - 2 renderer tests, 4 ops scenarios and 1 preview test;
  - 7 own-HUD tests;
  - 11 corpus cases plus 21 migration tests.
- The debug-staged suite (`HPV3_DEBUG=1`, staged with `tools/stage-scripts.js --debug`): **786 pass, 1 release-only skip** (`.tmp/t22-debug-suite.log`).
- `node tools/generate.js --check`: **12 outputs current** (`.tmp/t22-generate-check.log`).
- No adapter change was made, so the root `validate-hp-colors-rewrite-*` suites were not rerun.
- World VM E2E (`tests/renderer.test.js`, "ticket 22: …"):
  - The rim is a direct WindowRoot child, outside the motion frame. It is collapsed by default. With the toggle on it is visible, 100%/100%, `1px solid #5fe69e`, z-index 100, while the frame keeps the native wiggle.
  - The message carries `showBounds: true` with an increased revision and byte-identical settings, and no Undo step is added.
  - A closed NPC gate stays stock, and opening the gate outlines it. Master off releases the rim and master on restores it.
  - Toggling off sends exactly `epoch/magic/revision/settings`.
  - Renderer stop releases the rim, and a restart re-requests the session state. A new menu context (game restart) publishes no flag and the world drops the rim. `showBounds` has no schema row.
- Preview VM E2E (`tests/preview.test.js`, "ticket 22: …"):
  - The canvas rim follows the toggle on both sides and is equal to the world plan rule.
  - The Units page with a closed gate shows no rim. Master off releases it, and settings are unchanged.
- Own HUD and session scope (`tests/own-hud.test.js`, 7 tests, real menu + storage bridge + hosted page):
  - Rows, defaults and plain help.
  - OFF white, TEAM team1/team2 at runtime, conflicting/unknown team released, CUSTOM plus a hex edit, then OFF white again. Only the three properties on `health_bar_Left` change; the HUD, container, bars, right fill and a decoy are untouched. The watch makes no rewrites, and Undo restores the previous color.
  - Master off writes exactly `null` ×3 once and stops the watch; master on repaints.
  - A replaced left fill, a moved bar and a detached HUD (the old bar is released) are each found again.
  - A pending load releases an earlier context's leftover wash with no watch. A saved custom color returns after a restart, and a pasted settings code carries it.
  - SHOW BOUNDS: no save, no store write, absent from settings and bundle codes, presets and the bundle, and adds no Undo step (Undo reverts only the color). It survives a menu reload and resets on restart.
  - Cost: **9 counted ops/s in the menu context** while watching (`parentReads` 7, `classReads` 2, 0 writes), plus about a dozen uncounted `IsValid` checks per second (the menu harness does not count them). There is no job while off (see audit 22 for the no-HUD search).
- Migration:
  - `tests/fixtures/v2-own-hud-migration.json`, generated by `.tmp/t22-make-corpus.js`, covers save schemas 1-5 and HPCR2/HPCRP1 hpv2 v1-3 (11 cases). It uses distinct values (team/`#13579B`, custom/`#ABCDEF`), and both keys are asserted consumed from pending.
  - "ticket 22: vN own-HUD pending promotes at v11" (v1-v10 × load/import: presets, scopes, restart, `saved.v` 11). Current-version defaults beat same-version pending and stay sparse, and a change is one flat `166,"#0A0B0C"` pair.
  - Earlier tests were updated for v11: `saved.v` uses `contract.recordVersion`, the v10 slot list is bounded, and the oversize-fallback fixture needs 26 legacy scopes because two more keys left pending (`.tmp/t22-oversize-probe.test.js`).
- Ops per bar per second (10 s windows):
  - Every existing scenario is unchanged: defaults 164.3 / 145.7 / 6 dormant / 11 released; hero maxima 219.3 / 194.3; OLD 250.6 / 190.4.
  - The new bounds-on scenarios are equal to their counterparts: `boundsActive` **164.3**, `boundsIdle` **145.7**, full stress with bounds, text alignment, shake and tilt **219.3**, churn **194.3**. In all of them `classWrites` is 0.
  - The HUD colour adds nothing to world bars. Nothing is written at default.
- Mutation check (`.tmp/t22-mutations.js`, `.tmp/t22-mutations.log`): **29/30 killed**.
  - The survivor is "stop keeps bounds". It is equivalent: the next accepted config always reassigns `showBounds`, and nothing paints before one arrives. The reset in `stop()` is hygiene only.
  - Killed mutants:
    - plan ignores the view; rim on uncustomized bars; timer repaint drops the view; world keeps a stale flag; preview ignores the view;
    - rim visible without the class; rim never shown; rim inside the motion frame;
    - the flag always sent; the toggle adds Undo; the toggle commits to the store; a reload forgets the toggle; the switch state is not shown;
    - OFF clears instead of painting white; team colours swapped; conflicting team treated as team1; CUSTOM ignores its colour; release writes `""`; master off ignored; a pending load paints; boot leaves leftovers;
    - no watch; chain misses the root link; old bar not released; the watch rewrites values; background not white;
    - two converter swaps; v11 slot additions omitted.
- Honest limits:
  - The tests were written after the code. Their red evidence is the mutation run and the ops scenario that caught the real timer-repaint bug, not a red-first run.
  - The HUD panel ids and structure (`Hud`, `health_and_abilities_container`, `hud_health_bars`, `health_bar`, `health_bar_Left`, team classes) come from v2's source and docs. v2 also marks them as not live-verified. The VM models them; the look, the texture and repaint timing need ticket 26.
  - The SHOW BOUNDS rim and switch placement are VM- and CSS-checked only; their in-game look needs ticket 26.
  - No build, deploy, launch or git action was taken.

## Audit 22 fixes (P2 ×2, P3, coverage)

- **Late or replaced HUD (P2).**
  - The menu now keeps an identity watch while HP Colors is on, like v2's in-match poll (`hp_colors_v2_menu.js` 2446-2482). It runs every 1 s once the bar is known. While the HUD, its bar or a detached HUD's replacement is missing, it searches every 5 s.
  - A late HUD, a detach gap followed by a replacement, and a HUD whose bar arrives late are all painted without an edit.
  - While HP Colors is off or loading, the watch runs only until a refused release lands; after that it schedules nothing.
- **Refused release (P2).**
  - Each HUD bar the menu writes now has its own write cache. A refused write stays owned and is retried every second, including while off.
  - A replaced or moved bar whose release is refused is kept as pending ownership instead of being dropped, and is retried until it lands. If the same bar returns, it keeps its cache.
- **SHOW BOUNDS help (P3).** The rail tool now shows "Outline the area healthbars can use. Stays on until you turn it off or restart." under the switch. It is generated by `tools/menu-layout.js`, with `.HPC3BoundsRow`/`.HPC3BoundsHelp` added to `hp_colors_v3_menu.css` (existing `.HPC3Help` properties).
- **Tests.**
  - 6 new tests, all in `tests/own-hud.test.js`, named "audit 22: …":
    - a late HUD;
    - a detach gap with a replacement;
    - a late bar;
    - a refused `backgroundImage = null` while off;
    - a refused release on a replaced bar;
    - the bounds help text.
  - Red first (`.tmp/audit22-fix-red.log`): 5 were red for the intended reasons. The late-bar test was already green; it closes the auditor's surviving mutant "missing-bar HUD retry removed", which it now kills.
  - The ticket 22 cost test now expects one 5 s watch with no HUD while on, and none while off.
  - `tests/menu.test.js` and `tests/preview.test.js` scheduler counts now exclude the named `hudWatch` job. Those tests count other work.
- **Results.**
  - `node --test tests/*.test.js`: **793/793 pass** (`.tmp/audit22-fix-suite.log`).
  - Debug-staged run: 792 pass, 1 release-only skip.
  - `--check`: **12 outputs current**.
  - Mutations (`.tmp/audit22-fix-mutations.log`): **36/37 killed**. The 7 new mutants were all killed; the survivor is still the equivalent "stop keeps bounds".
- **Cost.**
  - Watching a known bar: 9 counted ops/s in the menu context, unchanged.
  - With no HUD while on: 12 `Hud` searches per minute from the top panel. In the menu-only VM tree that is about 1,900 nodes per search (`.tmp/audit22-fix-nohud-cost.test.js`); v2 searched the same way.
  - World ops per bar are unchanged.
- **Honest limit.** In game the HUD is expected to exist the whole time, so the 5 s search should only run during HUD gaps. That expectation is not live-verified.

## Whole-codebase audit 3 fixes (after tickets 18-22)

- **P2 test-suite memory (harness, `tests/boot-layout.js`).**
  - Cause: each Escape-menu fixture is about 10 MiB of mock panels (1,889 panels at about 4.9 KB each in the shared adapter). Finished fixtures are garbage; between tests the live set is about 10 MiB (measured with a forced GC every 20 tests). V8 deferred collection, so peaks depended on GC timing.
  - The auditor's 3.4 GB `renderer.test.js` peak is reproduced only with their `heap-preload.js`. Its `WeakRef` registry keeps every context alive: with the fix and that probe, the run still showed 312 alive and 3.2 GB. Without the probe, the same file stays at 312 MiB.
  - Fix, v3-local with no change to the shared adapter:
    - each script source compiles once per process as a shared `vm.Script`, run in each context;
    - each layout file is parsed once;
    - a root `afterEach` hook collects finished fixtures (`v8 --expose-gc` via `vm.runInNewContext('gc')`) whenever more than 128 MiB of heap is left after a test.
  - The fix does not use `--max-old-space-size`, and no test behavior changes.
  - New `tests/memory.test.js` boots 120 real menus. Against the old harness it was red (`.tmp/aw3-memory-red.log`: worst start-of-test heap 222 MiB over the 160 MiB limit, and no script reuse); it is green now.
  - Peak RSS per file, plain `node --test tests/*.test.js`, 3 runs (`.tmp/aw3-rss.js`):
    - before (`.tmp/aw3-rss-before.log`): the worst was preview 610 / 325 / 326 MiB, and storage reached up to 529;
    - after (`.tmp/aw3-rss-after.log`): the highest is timers 372 / 395 / 395 MiB, storage 360-364, renderer 312 / 312 / 312. Every file stays under 400 MiB.
- **P2 world test gaps (`tests/renderer.test.js`).**
  - "audit whole 3: a world NPC/objective bar draws OLD boxes and tilts its HP text, and releases both" checks the OLD grid on world unit bars, `rotateZ(23deg)` on unit HP text, the restore to the captured `rotateZ(1deg)` at tilt 0, and gate-off release.
  - "audit whole 3: damage shake off keeps its class with BAR STYLE OLD" covers a hero bar.
  - The `shakeOffTiltOldActive` ops scenario now asserts `HPColorsV3ShakeOff`.
  - The auditor's `mutations.js` kills all three targeted mutants (`.tmp/aw3-mutations-after-tests.log`: OLD only for players, HP tilt ignored on units, shake off ignored under OLD).
  - "unit lines: neutral NPC gets side line wash" survives and is equivalent in the world: neutral bars collect no line children (`reconcileLines`). The preview has no matching assertion; that is not in scope here.
- **P3 dead `!npcOpen`.** `wakeCarriers` now always leaves the four nonneutral NPC tags out of the wake list for player carriers.
  - New ops scenarios with every unit gate open on a hero bar (`…UnitGatesIdle`, `…UnitGatesActive`) were red against the old code: 198.3 idle, above the 194.3 closed-gate guard, and 223.3 active.
  - After the change they measure **194.3 idle** and **219.3 active**. All other scenarios are unchanged (hero 219.3 / 194.3, defaults 164.3 / 145.7 / 6 / 11, OLD 250.6 / 190.4).
- **P3 help text.** 24 rows were rewritten in plain words: the 18 listed rows plus healing, damage delta, Rat King barrier, outline on, HP color source and HP custom color mode. In addition, the HP Text toggle is now named "Custom HP number", and the option labels "Custom bands" and "Fixed health bands" are now "Own colors" and "Fixed colors".
  - Keywords are unchanged.
  - The new menu test "every setting row speaks plain player words" boots the real menu and scans names, help, options and the SHOW BOUNDS tool.
- **P3 docs.** `SPEC.md` and `PLAN.md` status now say "through ticket 22". `SPEC.md` now gives 74 ids equal to v2 (measured: 74 of 872), says the preview follows BAR STYLE, shake, tilts and SHOW BOUNDS, and records the own-HUD OFF = plain white bar decision.
- **P3 Bar page order.** The `enabled` row moved first under the heading "HP Colors", and the thresholds now sit under "Health thresholds". This changes display order and search text only.
  - `settings/record.json` and `generated/slots.json` are byte-identical to before.
  - Codes exported before the change decode identically and re-export to the same string (`.tmp/aw3-order-proof.test.js` and `.tmp/aw3-order-proof.log`; settings code 173 characters, bundle code 180).
  - Menu test "audit whole 3: the Bar page shared column starts with the master switch…" was red first.
- **Totals.**
  - `node --test tests/*.test.js`: **922/922** (`.tmp/aw3-suite.log`). That is 793 plus 129 new: 122 memory tests (120 of them are fixture steps), 5 renderer tests (3 tests and 2 ops scenarios) and 2 menu tests.
  - Debug-staged run: 921 pass, 1 release-only skip.
  - `--check`: 12 outputs current.
  - Mutations (`.tmp/aw3-mutations.js`): **5/5 killed**. They cover the harness collection, the shared scripts, the old npc wake, jargon reinserted, and the master heading dropped.
  - The adapter was not changed, so the root v2 validators were not rerun.

## Live 6782 load failure guard

- **Live finding (Main, Deadlock 6782).** The first in-game load of the 18-22 build failed with `Parsing error on panorama\styles\hp_colors_v3_world.css(1): Failed to parse selector`. The Escape menu could not include the stylesheet and the game aborted.
  - The cause was long selector lists: the objective-exclusion rule had 37 selectors (2,891 characters) and the pip-panel rule had 14. The compiler accepted both.
  - Main split them into rules of 10 or fewer selectors (`world.css` ~241-290 and ~732). The game then loaded cleanly (live-verified by Main).
- **Guard.** `tools/generate.js --check`, which the build wrapper already runs before staging, now fails closed unless every rule in every packed stylesheet has 10 or fewer comma-separated selectors and 1,024 or fewer selector characters. It checks `panorama/styles/*.css`: world, menu and the generated stock sheet. `--styles-root` points the check at a fixture directory.
  - The check prints `HPV3 stylesheets: 3 files, 596 rules, max 10 selectors per rule`.
  - Test "CSS contract: --check fails closed on a 37-selector rule and passes the shipped stylesheets" (`tests/generator.test.js`) was red first (`.tmp/css-contract-red.log`). It covers the 37-selector fixture, a selector list over 1,024 characters, a 10-selector rule with keyframes that passes, and the shipped files.
  - The guard found one more rule over the limit, the 12-selector stamina box/circle depletion rule at `world.css:599`. It is now two 6-selector rules with the same body, so specificity and order do not change.
- **Pin.** The game-data pin was rebased to SteamTracking `a9e0c695` / ClientVersion 6782; all six vendored files are byte-identical upstream (rebase by Main).
- **Docs.** The engine fact is recorded in `PLAN.md` (live-engine notes) and in ticket 25's ENGINE.md checklist.

## Batch close (2026-10-15)

Whole-codebase audit AuditWhole-3 (m2) findings fixed. Final: suite 923/923, generator current, both builds 0 failed (release e7352671, debug 76d9da02). Live 6782: debug build installed, loads with no Panorama parse errors after splitting oversized selector lists (new --check guard), menu/renderer boot logged, own HUD bar shows the OFF white look. Menu, preview and world-bar visuals for this ticket not yet seen in game.

## Live 6782: preview text position and ALLY "Preview unavailable"

- **Report.** On the ALLY side the preview showed "Preview unavailable" with the HP number at the left under the level badge. The live log repeated `[HPV3] preview paint failed: … unset of alias alone (horizontalAlign="")`.
  - `horizontalAlign` is a style alias in game, so releasing the HP row alignment with ""/null throws. That aborted every preview paint, and in the world it left pending leases on master off or alignment changes.
- **Fix.**
  - `EXPLICIT_STOCK` adds `row: { horizontalAlign: "right" }`, the stylesheet value of both `#HPColorsV3ReadoutRow` and `.HPC3PreviewReadoutLine`, as v2 does at 1687-1688.
  - Audit of every other alignment write:
    - Name `horizontalAlign`/`textAlign` were already explicit.
    - The topbar timer released `UltimateCooldownTextShown` alignment with `null`. It now uses the captured value or v2's `"left"`.
    - Panels the timers create are never cleared. There are no `verticalAlign` releases.
- **Harness model.** `tests/boot-layout.js` now wraps every mock panel's style bag. Assigning ""/null/undefined to `horizontalAlign`, `verticalAlign`, margin/font/animation longhands or `borderColor` throws the live error. `textAlign` is left off the list because there is no evidence it is an alias.
  - Before the fix, 27 tests went red (`.tmp/alias-red.log`):
    - preview: units, indicators, kind, live comparison ×3, ticket 20 tilts and ticket 22 SHOW BOUNDS;
    - world: HP-off origin, HP adoption, name alignment, kill marker, line/role recycling, unit routing and wake, ticket 19 V1/V2/OLD switching and OLD caches, audit 21 name cases, deeper ancestry, cached facts, pickups, and SHOW BOUNDS restart.
  - All pass after the fix (`.tmp/alias-green.log`).
- **Parity E2E.** New test "live 6782 parity: preview HP number and name positions equal the world bar…" (`tests/renderer.test.js`, layout model moved to `tests/preview-layout.js`).
  - Setup: an enemy and an ally world bar plus the menu preview, with matching text extents and different per-side offsets.
  - It runs V1/V2/OLD × three per-side alignment pairs, each over ENEMY→ALLY→ENEMY switches (27 comparisons). In each, the name and HP-row `transform`/`horizontalAlign` (and name `textAlign`) are equal, and the preview stays painted. Master off returns both rows to `right`.
  - It is red without the row fix and green with it. Nothing else differed.
