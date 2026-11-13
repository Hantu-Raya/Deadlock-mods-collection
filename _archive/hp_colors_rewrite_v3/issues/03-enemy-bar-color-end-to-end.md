# 03: Enemy bar color end to end

**What to build:** Turning on enemy bar colors in the menu changes enemy hero bars to fixed/gradient colors by health; turning it off restores stock exactly.

**Blocked by:** 02

**Status:** done

**Runs on:** gpt-6.1-sol (med). **Review:** code-review + claude-fable-5-1 review.

- [ ] Menu edit publishes HP_COLORS_V3_CONFIG; unit-status context requests config via the sibling relay
- [ ] Renderer facts/plan/apply with captured-inline/CSS ownership release; exports plan/apply without self-start
- [ ] Scheduler active/idle/dormant per SPEC
- [ ] Ops ceiling test: <= 300 active, 200 idle, 30 dormant ops/bar/s
- [ ] VM E2E tests boot the real scripts and pass

## Failure modes (written before code)

- Wrong v2 baseline, ranges or unstable slots produce a different shipped look or corrupt later records.
- Menu edits never reach isolated world contexts; a direct CustomUIConfig read passes mocks but fails in game.
- Missing, malformed or stale config paints bars despite no valid authority.
- Duplicate shield IDs or unknown/ambiguous classification paint shield, ally or NPC bars.
- Health fill is read in the wrong UI scale, or fixed/gradient thresholds interpolate incorrectly.
- Disabled ownership or a recycled hero-to-NPC panel leaves inline colors behind; null clearing does not restore stock.
- Cached carriers outlive their lineage or die and paint the wrong panel.
- Unchanged idle bars write repeatedly, dormant bars walk the tree, or scheduler callbacks outlive destroyed contexts.
- Including the renderer self-starts preview loops; release includes timing/lifecycle logging.
- Packaging omits relay/bootstrap assets or includes extra/raw assets.
- Vacuous tests pass when apply does nothing; operations exceed the active/idle/dormant ceilings.

## Initial implementation and v2 parity evidence

- Source slice: `hp_colors_v2_contract.js:19-25,56-57,384,495,537-540,652-664,700-710`; `hp_colors_v2_state.js:81` consumes the shipped `defaults`, not `codecDefaults` or `sparseDefaults`. Current shipped enemy low is **#FD4949**, not the frozen codec **#E16161**.
- Explicit slots preserve tracer slots 0/1 and append 2-8:

  | v3 row | v2 setting | Shipped default | Range/options | Slot |
  |---|---|---|---|---|
  | enemy barColorEnabled | enemyEnabled | true | boolean | 0 |
  | enemy barColorMode | enemyMode | gradient | fixed, gradient | 2 |
  | enemy barColorLow | enemyLow | #FD4949 | #RRGGBB | 3 |
  | enemy barColorMid | enemyMid | #FF7B00 | #RRGGBB | 4 |
  | enemy barColorHigh | enemyHigh | #00FF00 | #RRGGBB | 5 |
  | enemy barColorTeamHigh | enemyTeamHigh | false | boolean | 6 |
  | shared lowThreshold | lowThreshold | 25 | 0-99%, step 1; below high | 7 |
  | shared highThreshold | highThreshold | 65 | 1-100%, step 1; above low | 8 |

- Fixed means three health bands, not one constant color. Gradient stays low through the low threshold, reaches mid at the high threshold, then high at 100% (`unit_status_v2_colors.js:1281-1306`). Team-high uses Amber #E7B659 / Sapphire #5B79E6 only when team identity is unambiguous.
- `tools/generate.js` produces native menu controls and validation from the table. The interim HP COLORS button opens this small editor; ESC closes it before resuming. Full page redesign, ally rendering, geometry, feedback and persistence remain their later tickets.
- World contexts include settings + sibling bridge + renderer. Backoff requests use 0.5/1/2/4/8 seconds, then 8 seconds until arrival; three consecutive relay failures stop requests. No world CustomUIConfig read or dialog-originated FireOutput.
- Renderer owns only the primary lagging fill's washColor. It preserves captured explicit inline stock on ordinary release; recycled-kind/relation release uses current pinned stock fallbacks. Primary lineage, fills and facts are cached; plans memoize facts signature + config revision. Inclusion exports without starting and shuts down obsolete callbacks on reinclusion.

## Initial acceptance evidence (superseded by Review fixes below)

These are the pre-review results. Initial source/build test logs remain retained; compiler/package and mutation artifacts have been refreshed by the integrated build described below.

- All eight `tests/*.test.js` paths passed with `node --test`: **79/79**, zero failures. Retained TAP: `.build/evidence/ticket03-all-tests.tap` (PowerShell Tee output is UTF-16LE).
- `node hp_colors_rewrite_v3/tools/generate.js --check`: exit 0, all 10 outputs current.
- `powershell -NoProfile -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v3.ps1 -SkipDeploy`: staged VM **51/51**, compiler **9 compiled / 0 failed**, exact nine compiled and packed assets.
- Same wrapper with `-Debug -SkipDeploy`: staged VM **50 passed / 1 intentionally skipped release-only logging test / 0 failed**, compiler **9 compiled / 0 failed**, same exact assets. Known redirected Console.ReadKey exit was accepted only after successful compiler summary and required outputs.
- Build VM logs: `.build/evidence/ticket03-release-build.log` and `ticket03-debug-build.log`. Compiler summaries and exact listings: `.build/{release,debug}/compile.stdout.log` and `vpk-listing.txt`.
- `node hp_colors_rewrite_v3/tools/check-renderer-mutation.js`: suppressing all apply writes causes **9 behavioral failures**, including menu-to-bar paint and active operations evidence; original runtime remains untouched and mutation staging is removed. Retained `.build/evidence/ticket03-renderer-noop-mutation.tap`.

### Counted operations

Same operation sum and uniform extra layout-axis instrumentation as `research/05-performance-baseline.md`: 6 seconds settling, then 10 simulated seconds; fixture health-input writes subtracted; observation reads excluded. Active input advances through 50-79% every 100 ms so every 150 ms paint sample changes (rather than aliasing an alternating input into idle).

| State | Counted ops/bar/s | Ceiling | Renderer style writes / 10s | Steady traversal |
|---|---:|---:|---:|---:|
| active | 180.8 | 300 | 66 | 0 |
| idle | 174.2 | 200 | 0 | 0 |
| dormant | 13.0 | 30 | 0 | 0 |

These are VM operation counts for the enemy-color slice, not native timings, FPS, or a like-for-like saving against all v2 features.

### Exact asset set (both modes)

```text
panorama/layout/hp_colors_v3_relay.vxml_c
panorama/layout/hud_escape_menu.vxml_c
panorama/layout/unit_status_overlay_v2.vxml_c
panorama/scripts/hp_colors_v3_bridge.vjs_c
panorama/scripts/hp_colors_v3_menu.vjs_c
panorama/scripts/hp_colors_v3_renderer.vjs_c
panorama/scripts/hp_colors_v3_settings.vjs_c
panorama/styles/hp_colors_v3_menu.vcss_c
panorama/styles/unit_status_v2.vcss_c
```

Release pak02 SHA256: `8cd55c06a8ebe5685c119172ad0a81b3f7f4244b4984086ac48bbac1abbb43d0`.
Debug pak02 SHA256: `1e5cf9b6dd300f1219d19db05b295c7884d7799a6e1e8db733242125ba7185b5`.

## Initial failure-mode → evidence mapping

| Failure mode above | Observable evidence |
|---|---|
| Wrong baseline, ranges or unstable slots | Renderer shipped-default/band/threshold test; menu default assertions; generator/review slot insertion, reorder and reuse checks |
| Menu edits never reach isolated world | E2E mounts real relay XML in its own VM, forbids world CustomUIConfig and dialog FireOutput, observes published config and primary fill color |
| Missing/malformed/stale config paints | No-config 30s run; rejected magic, revision, enum/color/bounds/order payloads; same-revision update rejected |
| Shield, ally, NPC or ambiguous unit painted | Shield precedes primary and has duplicate fill ID with unchanged #aabbcc sentinel; six untouched kind/relation fixtures |
| Wrong scale or interpolation | Each axis read uses its own UI scale; measured-width-only 50% fixture; fixed boundary, gradient midpoint and team-high assertions |
| Disabled/recycled ownership stranded | Off restores explicit #FD4949; captured #abcdef remains exact; hero→neutral objective→hero→ally releases to each current stock value; spectator release retries a failed native write |
| Dead/moved carrier cache paints wrong panel | Primary fill replacement paints new fill; recycled carrier releases ownership; invalid context cancels schedules |
| Idle writes/dormant walks/stale scheduler | Idle full-paint cadence 1.5s with no recomputation/style writes; all three ceilings assert zero traversal; stop/restart/reinclusion assert one loop and one listener |
| Inclusion starts loops/release logs | Include asserts no jobs; onload starts explicitly; reinclusion stops obsolete jobs; release logging throwers remain active through timed callbacks; debug timing/carrier logs observed |
| Missing or extra package assets | Both wrapper exact compiled-tree/VPK set checks; nine-entry listings above; raw sources forbidden |
| Vacuous tests or excess operations | No-op apply mutation fails nine behavior checks; active check requires real painting; measured 180.8/174.2/13.0 under ceilings |

No installation, deployment, game launch, G: writes, or git mutation. Live menu appearance, native relay behavior and visual parity were not tested; compiled/VM evidence is not live verification. Acceptance checkboxes remain untouched as requested.

## Review fixes

### Failure cases recorded before fixes

- Released inline stock survives ownership removal and overrides later ally/neutral/spectator stock; stop/restart recaptures our own fallback.
- A primary shield or armor span makes full health look partially empty and changes colors at the wrong thresholds.
- A recreated publisher resets revision while worlds retain a higher revision, freezing subsequent edits.
- Broadcast request bursts produce N×N redundant JSON parses and unnecessarily send hero/menu metadata to every world.
- Engine-created dialog root onload is unproven; relation/player facts on higher ancestors never wake the renderer.
- 0.15s carrier/lineage work consumes idle headroom; moving it to 1s must still repair dead/moved carriers and recycled panels.
- Loading menu contracts in world contexts multiplies catalog/control memory despite only needing settings validation.

### Finding → implementation → observable evidence

| Finding from both reviews / Main | Fix | Evidence in `tests/renderer.test.js` |
|---|---|---|
| 1. Released stock outlives discarded ownership | `hp_colors_v3_renderer.js:171-207,299-306`: released records remain in the root's stock ledger; signature changes rewrite current stock, and start/reinclusion reuse records instead of capturing our own writes. Original explicit inline values remain exact in their original relation. | Enemy→off→ally→neutral; stop/restart on ally; spectating ends; off→on→off; captured #abcdef and palette-colored #FFEFD7; failed native release retries; renderer reinclusion retains restorations. |
| 2. Shield/armor allocation understates HP | `hp_colors_v3_renderer.js:90-144`: primary shield and armor presence, visibility, clip, transform, width and measured axes enter the probe signature; apply v2's corrected fraction from `unit_status_v2_colors.js:1123-1129,1156-1160`. | Each visible primary layer at 100% extent corrects a 66⅔% HP share to full green; layer-only changes invalidate idle facts; collapse removes correction; duplicate fill in separate UnitShieldbar remains #aabbcc. Unclipped geometry verifies independent UI scales and transform changes. |
| 3. Recreated menu revision resets freeze worlds | `hp_colors_v3_menu.js:338-346` creates a new publisher epoch per root boot; `hp_colors_v3_renderer.js:258-266` accepts a different epoch, otherwise requires a greater revision; memo key includes epoch. | Recreate only the menu after revision ≥2; new epoch/revision 0 and its next edit paint surviving worlds; same-epoch stale revision is rejected. |
| 4. Broadcast fan-out and unnecessary payload | `hp_colors_v3_menu.js:34-59` sends only magic/epoch/revision/settings and coalesces answers to one per 0.5s; bridge request magic is `HPV3_CONFIG_REQUEST`, disjoint from config magic; renderer compares exact raw before parsing. | Twelve real-script world VMs share one broadcast bus; a twelve-request burst emits ≤1 answer and zero additional world JSON parses for duplicate config/requests. Wire has exactly four fields, without hero or menu metadata. World JSON parses are now counted in every ops ceiling. |
| 5. Unproven world onload and immediate-parent assumptions | Generated overlay includes `hp_colors_v3_world_boot.js` after the non-self-starting renderer; the boot module starts at inclusion, not onload. Renderer walks at most 12 ancestors initially and caches contributing carriers/parent links. | Fixture never calls world onload; paints CLASS_PLAYER on one ancestor and enemy relation on the next. Renderer-only includes schedule nothing; reinclusion stops old scope and leaves one loop/listener. |
| 6. Idle headroom | `hp_colors_v3_renderer.js:210-239`: carrier/lineage refresh runs on the one-second cadence, while 0.15s ticks read cached fill/layer signatures. Full idle paint still occurs on changes or 1.5s. | Memoized idle facts and dead fill recovery; no steady traversal; ceilings below, including off/released hero and simultaneously visible shield+armor. |
| 7. Full contract loaded in every world | `tools/generate.js:169-174` emits a validation-only world module from the same validation source and slim schema fields. The menu alone loads heroes/controls/search. | Booted world has no HPColorsV3Settings; exposes HPColorsV3WorldSettings.validate; valid/invalid settings checks exercise it through transport. Generation and package checks include the lightweight module. |

### Reviewed acceptance evidence

- **138/138** source tests passed, zero failures/skips: `.build/evidence/ticket03-review-all-tests.tap` (UTF-8). This includes the simultaneously integrated codec/storage/menu tickets.
- `generate.js --check`: exit 0, **11 generated outputs current**; retained `.build/evidence/ticket03-review-generation.log`.
- No-op apply mutation: **16 behavioral failures**, including menu paint and active operations evidence. Original source untouched; temporary staging removed. Retained `.build/evidence/ticket03-renderer-noop-mutation.tap` and `ticket03-review-mutation.log`.
- Release `-SkipDeploy`: **110/110 staged tests**, compiler **13 compiled / 0 failed**, exact **13 assets**, wrapper exit 0.
- Debug `-Debug -SkipDeploy`: **109 passed / 1 intentional release-only logging skip / 0 failed**, compiler **13 compiled / 0 failed**, identical exact **13 assets**, wrapper exit 0.
- Full UTF-8 build transcripts: `.build/evidence/ticket03-review-release-build.log` and `ticket03-review-debug-build.log`; current compiler logs and exact listings remain in `.build/{release,debug}/`.
- The first staged attempt exposed two menu-test metadata reads outside staged Panorama; ticket 08 corrected those checks to inspect the booted staged contract, without adding raw metadata to the package. Final normal wrapper invocations passed. PowerShell all-stream redirection was abandoned after a NativeCommandError during capture; external process capture preserves actual wrapper exits and full output.

### Reviewed operation counts

Seven seconds warmup then ten simulated seconds, same native-panel operation sum and layout instrumentation as the baseline, plus **world JSON parse calls**. Fixture clip inputs are subtracted, observation reads excluded; active fills change every 100ms so every 150ms sample changes. Values match both release/debug staged runs.

| Scenario | Counted ops/bar/s | Ceiling | Style writes / 10s | Steady traversal | World JSON parses / 10s |
|---|---:|---:|---:|---:|---:|
| active | 117.9 | 300 | 66 | 0 | 0 |
| idle | 111.3 | 200 | 0 | 0 | 0 |
| dormant nonhero | 6.0 | 30 | 0 | 0 | 0 |
| off/released hero | 25.0 | 30 | 0 | 0 | 0 |
| active, visible primary shield + armor | 211.7 | 300 | 66 | 0 | 0 |

These remain synthetic counted operations, not native execution time, FPS, or visual parity.

### Current exact asset set (release/debug)

```text
panorama/layout/hp_colors_v3_relay.vxml_c
panorama/layout/hud_escape_menu.vxml_c
panorama/layout/unit_status_overlay_v2.vxml_c
panorama/scripts/hp_colors_v3_bridge.vjs_c
panorama/scripts/hp_colors_v3_codec.vjs_c
panorama/scripts/hp_colors_v3_menu.vjs_c
panorama/scripts/hp_colors_v3_renderer.vjs_c
panorama/scripts/hp_colors_v3_settings.vjs_c
panorama/scripts/hp_colors_v3_storage.vjs_c
panorama/scripts/hp_colors_v3_world_boot.vjs_c
panorama/scripts/hp_colors_v3_world_settings.vjs_c
panorama/styles/hp_colors_v3_menu.vcss_c
panorama/styles/unit_status_v2.vcss_c
```

Release pak02 SHA256: `26b97fbe11b0f961a937198615ad1fcc654d61f21e9bb6b7fd980f51846a60e2`.
Debug pak02 SHA256: `e4041aed92ef1256f34f1d7e4596591469232c88e3e501627880ea0cd4b7e740`.

No deploy, installation, game launch, git mutation or game-folder writes. v3 native startup/relay/visual parity remains unverified live. All acceptance checkboxes remain untouched.

## Audit fixes

The release/scheduler design in earlier evidence is superseded: unit bars restore captured non-empty inline values exactly, otherwise clear with `""`; CSS owns native dynamic states and static geometry. The own-HUD white-wash exception does not apply.

| Finding | Fix and retained evidence |
|---|---|
| Audit0307-1 high release defect | Remove inline native fallback snapshots and the 2.5 s refresh; class-driven presentation releases immediately. `renderer.test.js` “released class-driven presentation” and exact-inline/sibling restoration; red mutants `release-css`, `captured-inline`. |
| Audit0307 maintenance | Panel/property Maps replace wanted/ledger scans; ledger panels are validated once at the 1 s carrier check. “stable feedback leases” fails with per-paint validity restored (`validity-cadence` mutant). |
| AuditWhole-A4 | Delete the unused fallback table; compare remaining geometry/team-color/HP-origin/name/outline constants with parsed vendor CSS in a VM plan test (`stock-drift` mutant). |
| AuditWhole-B4 | Debug renderer boot includes generated world-contract version; generator/logging evidence belongs to ticket 02. |

Full audit item mapping and re-measured ceilings are in ticket 07's **Audit fixes** section. This round is Node-only; earlier compiled/package hashes are historical until Main rebuilds. Native release-to-stock remains a ticket-11 live check.

Default-runner verification: focused renderer/preview **78/78**, all v3 **305/305**, then generator check **11 outputs current**, zero failures/skips. Logs: `.build/evidence/audit0307-focused.tap`, `audit0307-all.tap`, `audit0307-generation.log`. Fourteen no-fix VM mutations fail as intended (`audit0307-red-proof.json`); the giant-panel assertion serialization stall is fixed in the red test, not bypassed with a different runner.

Re-measured counted operations/bar/s: active **156.5/300**, idle **143.3/200**, dormant **6/30**, released **11/30**, split-stock released **12/30**, shield+armor active **250.3/300**. Ticket 07 records the separately measured `IsValid`/UI-scale calls excluded from these ceilings. No live performance claim.
