# 22b: QOLLOCK variant

**What to build:** a v3 pak02 that runs on top of an installed QOLLOCK pak03. The user asked for this before tickets 23-26.

**Blocked by:** none

**Status:** done; live-verified 2026-10-15 (user)

**Runs on:** m1 (Opus 5.5, med). **Review:** m3 (GPT-6-Astra, med) per-ticket audit.

- [x] Pinned input: QOLLOCK 4.0.5 13 October hotfix. Zip `G:/QoLLock_405_13OctoberHotfix.zip`, SHA-256 `e37bcf3a62cd1f8c4a221c09d393729ad3e7fddf2c84357fa4b5ef0cd9758c51`. Its `pak03_dir.vpk` is extracted to `.tmp/qollock-405-13oct/pak03_dir.vpk`, SHA-256 `26fc7d60602e58f42fd5ee90bb3851561eb62f07ec7e3395e8d62d15972baadd`. Both are in `hp_colors_rewrite_v3_qollock/vendor/pin.json`.
- [x] No hand-copied menu (PLAN "Variants", SPEC story 52). The build composes the QOLLOCK Escape menu and topbar from the pinned pak03 plus v3's sources and generated fragment. It fails if any pinned QOLLOCK include or panel is lost, or if any v3 id in `generated/ids.json` is missing.
- [x] QOLLOCK and v3 coexist: the menus, storage bridges, topbar, world healthbars and `unit_status_v2` styles all work together (VM-verified; see Limits).
- [x] VM E2E tests boot the composed QOLLOCK Escape menu and topbar with the real scripts.
- [x] Release and debug QOLLOCK builds come out with the exact asset set. They are never deployed here, because the installed pak03 is not QOLLOCK.

## Pin diff, 6 October to 13 October (`scripts/diff-vpk-entries.py`)

- Unchanged: `hud_escape_menu`, `citadel_hud_top_bar`.
- Changed: `hud.vxml_c` (owned by QOLLOCK), `styles/base/unit_status_v2.vcss_c`, `styles/base/unit_status_icons.vcss_c`, `styles/base/hud.vcss_c`, and other base/feature styles.
- 3 test/validator scripts added.

## Findings: what QOLLOCK touches that v3 also touches

These come from the pinned pak03, decompiled with Source2Viewer-CLI 19.2. Each reviewed entry's hash is in `pin.json` under `observed`, so any QOLLOCK change fails the build and forces a re-review.

1. **Escape menu.** QOLLOCK replaces `hud_escape_menu`. It adds 52 script includes (persistence, `core/ql_storage_bridge`, `ui/window`, `ql_settings`), `ql_settings.vcss_c`, `#SettingsWindow`, a second `SettingsRow` holding `#ModSettingsBtn`, play/watch/guides buttons, `#QOLStorageBridge`, and a background click that closes its window first.
   - **Resolution:** composed, not copied. The composition appends the v3 styles and scripts after QOLLOCK's and puts HP COLORS between QOL LOCK and settings. The v3 resume sits in QOLLOCK's background `else` branch and on `#EscapeButton`. The root gets v3's onload/oncancel, because QOLLOCK's root oncancel was the plain stock one.
   - The stock anchor `<Panel class="SettingsRow">` is ambiguous in QOLLOCK, so the button is anchored on the settings row.
   - A v3 id that collides with a QOLLOCK id fails the lane composition (repeated-id guard).
2. **Two settings windows.** Both QOL LOCK (`$.ToggleSettingsWindow`, 220 ms debounce, 350 ms open guard) and HP COLORS (`$.HPColorsMenuToggle`) can be open at once.
   - **Resolution:** `hp_colors_rewrite_v3_qollock/panorama/scripts/hp_colors_v3_qollock_bridge.js` wraps both toggles. After a toggle leaves its window open, the bridge closes the other. QOL LOCK is closed with `$.ForceCloseModSettings(true)`, which skips its open guard. HP COLORS is closed with its own toggle, a full close.
   - Resume (`CitadelResumePlaying`) still closes QOL LOCK through its own listener.
3. **Own bottom-HUD bar.**
   - `ql_color_warnings` writes `washColor` on the local `hud_health_bars`, `health_bar`, its `FindChild("health_bar_left")` (lower-case l) and the current-HP label, plus topbar `ProgressBarLeft`. Its reset writes `""`.
   - `ql_healthbar` writes ui-scale, opacity and x/y on `health_and_abilities_container`, and the accent wash on `health_bar_frame`/`.healthBacker`.
   - v3 writes only `backgroundImage`/`backgroundColor`/`washColor` on `health_bar_Left`.
   - **Resolution:** the panels and properties are disjoint, so there is no write fight. Parent washes multiply with v3's child wash, so a QOLLOCK warning tints the v3 colour. No code change was needed. A regression test pins it.
4. **World healthbars.** QOLLOCK ships no `unit_status_overlay_v2` layout.
   - Its `styles/unit_status_v2.vcss_c` imports `base/unit_status_v2`, which is byte-identical in body to `vendor/unit_status_v2.css` (6782 stock), and flattens the `active_damage_wiggle`/`TagGroove1` keyframes.
   - v3's pak02 `unit_status_v2.vcss_c` shadows it. v3 owns world bars, and QOLLOCK's wiggle removal is replaced by v3's DAMAGE SHAKE setting.
   - v3's sheet imports `unit_status_icons.vcss_c`, which is QOLLOCK's. That file is stock (`base/`, identical in body to 6782 stock) plus one rule scoped to `#gameplay_hud`, so world bars are unaffected.
5. **Topbar.** QOLLOCK's topbar adds `BuffHUD`, `RejuvHUD`, `RejuvBuff`, `Buff`, `Rejuv` and `TeamSPMDisplay_*`, and has an empty `<scripts />`.
   - QOLLOCK's `citadel_hud_top_bar_player` keeps the `PlayerName`, `UltimateStatus`, `UltimateStatusBG` and `UltimateCooldownTextShown` that v3 timers read. It adds an `AlwaysPlayerName` label, which v3 ignores.
   - `ql_ult_cooldowns` writes the text of `UltimateCooldownTextShown`, and v3 writes only its `horizontalAlign`.
   - **Resolution:** composed with the v3 timer includes and the `HPColorsV3TimersTopBar` class.
6. **Storage, events and CSS.**
   - `#QOLStorageBridge` loads `https://predi-i.github.io/qollock-updates/bridge.html`, and `#HPColorsV3StorePanel` loads `https://hantu-raya.github.io/hpv2-store/`. They are separate panels and origins with per-panel `HTMLTitle` handlers, so their localStorage is separate.
   - QOLLOCK never uses `ClientUI_FireOutput`, and its globals and `$.` names do not overlap v3's `$.HPColors*`.
   - Every `ql_settings`/`hud_escape_menu` selector is scoped under QOLLOCK ids or classes. The shared tokens (`.Active`, slider internals) appear only under QOLLOCK ancestors.
   - No QOLLOCK code is copied into the pak02.

Shared-source fixes: none were needed. The normal build hashes are unchanged.

## Evidence

- Files: originally inside `hp_colors_rewrite_v3/` (`qollock/`, `vendor/qollock/`, `tools/qollock.js`, `-Qollock`); moved to the `hp_colors_rewrite_v3_qollock/` lane, see "Lane restructure" below.
- Runtimes: each runtime test runs twice.
  - **pinned** boots the real 52 QOLLOCK menu scripts from a verified decompile: `HPV3_QOLLOCK_ROOT` in builds, or decompiled on demand into the lane's `.build/pin`. QOLLOCK builds set `HPV3_QOLLOCK_REQUIRED=1`, so this runtime cannot be skipped there.
  - **model** stands in for `ui/window.js` when the pak03 is absent.
- Red → green:
  - Red with no bridge: 9/31 failing in `qollock`+`timers` (ENOENT).
  - Red with a no-op bridge: 4 failing. "opening one settings window closes the other" failed on "and closes QOL LOCK" in both runtimes, and the store test had a fixture bug, which was fixed.
  - Then green.
- New tests (13):
  - Pin and tamper rejection.
  - The composition keeps every pinned ref, all 872 generated ids, script order (QOLLOCK first, then v3, then the bridge) and nav order.
  - The composition fails closed on lost refs, missing ids, collisions and drifted anchors.
  - The menu boots and publishes, and the QOLLOCK panels and both store panels stay intact (×2 runtimes).
  - One window at a time, including background, ESC and resume (×2).
  - Separate store origins with real saves (×2).
  - Own-HUD disjointness.
  - The bridge stages cleanly in release and debug.
  - The composed topbar runs the v3 pickup and ultimate timers next to the QOLLOCK panels (×2).
- Suite: `node --test hp_colors_rewrite_v3/tests/*.test.js` gives **942/942 pass** (929 before + 13). `node tools/generate.js --check` passes (14 outputs).
- Builds (all with 0 compiler failures and the exact asset set):
  - Normal release `a685801b…5a80` (19 assets) and debug `3ba9aa66…f978` are both **unchanged** from before the ticket.
  - QOLLOCK release `2f93061d3c98d1204e0a2cc3cc866822644618e12b4de86aa4c623af7cb702de` and debug `873b8b4dd01d421b07fe72b805aabbe76eb1049202c9decee9c32ecc6bbb5cf0`, 20 assets each (+ `hp_colors_v3_qollock_bridge.vjs_c`).
  - Staged suites: 941 pass, 1 mode skip, 0 fail.
- Release rule: any v3 menu or topbar change ships in both variants, so rebuild both `build_hp_colors_rewrite_v3.ps1` and `build_hp_colors_rewrite_v3_qollock.ps1`. After `tools/generate.js`, run `node hp_colors_rewrite_v3_qollock/tools/qollock.js`; its `--check` (in the lane build and lane suite) fails while the QOLLOCK layouts are stale.

## Limits (live check needed)

- Nothing was deployed or launched. The installed pak03 is not QOLLOCK, so this pak02 has not run in game.
- ~~Panorama may match ids case-insensitively.~~ Resolved by the audit: native lookup is case-sensitive (see "Fixes after audit", item 5).
- ~~Other QOLLOCK open paths do not close HP COLORS.~~ Fixed after the audit (item 2). Any future QOLLOCK open path that bypasses the exported API would still need a re-review.
- The look of the HP COLORS button in QOLLOCK's styled nav, and Escape-menu focus after switching windows, are untested in game.

## Audit (m3)

**2026-10-15 — not accepted yet.** Two runtime defects and one test-skip requirement gap below need fixes. Reviewed PLAN “Variants” and SPEC story 52, the v3 composition/build/runtime/tests, and the v2 reference builder/bridge. No builds, deployments, game launches or git writes were performed.

Evidence root: `D:/temp/hpv3-m3-audit-68FMqr/`. In this section, `QOL/...` means the independently decompiled `panorama/...` beneath that root, from the SHA-256-verified `26fc7d60602e58f42fd5ee90bb3851561eb62f07ec7e3395e8d62d15972baadd` pak03. Source2Viewer-CLI 19.2 exited 0; all 15 pinned decompiled entries matched. The zip hash also matched.

### Blocking findings

1. **P2 — QOLLOCK's delayed background handler bypasses HP COLORS close-before-resume.**
   - Evidence: `tools/qollock.js:75-77` changes only the XML `onactivate`. Real `QOL/scripts/ui/window.js:2194-2214,2236-2241` replaces that handler with `SetPanelEvent` during its scheduled boot. When QOL LOCK is closed, that callback dispatches `CitadelResumePlaying` without consulting HP COLORS.
   - Reproduction: boot the composed menu with all real pinned scripts, run the scheduler for 1,000 ms, open HP COLORS, then invoke `EscapeBackground.events.onactivate()`. Result: **HP COLORS remains open and one resume event is emitted**. This is the actual installed callback, not the XML fallback.
   - The current “background” test misses it: `tests/qollock.test.js:79,123-129` evaluates the saved XML attribute instead of the runtime-bound panel event.
   - Fix: compose the actual background event, including QOLLOCK's delayed replacement, so an open HP COLORS editor consumes the click before resume. Retain a regression that invokes the installed callback after QOLLOCK boot.

2. **P2 — window exclusivity covers only the `$` toggle, not all exported open paths.**
   - Evidence: `qollock/panorama/scripts/hp_colors_v3_qollock_bridge.js:22-32` wraps only `$.HPColorsMenuToggle` and `$.ToggleSettingsWindow`. `QOL/scripts/ui/window.js:1161-1182,2295-2297,2323,2336-2346` also exposes `QOL.ui.window.setOpen`, `toggle`, `toggleSettingsWindow`, and the global `ToggleSettingsWindow`.
   - Reproduction with separate real-runtime boots: open HP COLORS, then call each of `QOL.ui.window.setOpen(true)`, `QOL.ui.window.toggle()`, `QOL.ui.window.toggleSettingsWindow()`, or `ToggleSettingsWindow()`. **Both windows remain open in all four cases.** Calling `$.ToggleSettingsWindow()` correctly closes HP COLORS.
   - This violates SPEC story 52 and PLAN's unqualified one-window rule; listing it under Limits does not satisfy that requirement. No dedicated settings-open hotkey registration was found in the pinned scripts/layouts: a caller using `$` is covered, a caller using the other exports is not.
   - Fix: cover every exported open entry point without losing QOLLOCK debounce/close cleanup, and test those entry points with the pinned runtime. The current bridge adds no scheduler or event subscription, and no bridge-induced loop/leak was found on its covered paths.

3. **P2 — pinned tests also skip when the decompiler is missing, even with pak03 present.**
   - Evidence: `tests/qollock-runtime.js:28-33,48-50` returns an absent runtime for `!viewer`, before checking the pak hash; `tests/qollock.test.js:91` and `tests/timers.test.js:233` convert it into a skip.
   - Reproduction: mask only the two viewer-path existence checks in a temporary Node process, leave pak03 present, and call `pinnedRuntime()` with no required/runtime environment overrides. It exits 0 with `{"name":"pinned","root":null,"reason":"Source2Viewer-CLI absent"}`.
   - Fix: skip only for an absent pak03. If pak03 exists, require a usable decompiler or a verified cache and otherwise fail with an actionable error. `-Qollock` builds already fail closed through `HPV3_QOLLOCK_REQUIRED=1` (`build_hp_colors_rewrite_v3.ps1:104-110`); this gap is in ordinary test execution.

### Non-blocking findings

4. **P3 — guards protect references, not the complete panel/class/order contract.**
   - Evidence: `tools/qollock.js:51-63,131-137` reduces layouts to sets of `src`/`id` attributes. Temporary copies that removed the QOL LOCK row's `SettingsRow` class, deleted an anonymous `<Panel class="MenuIcon" />`, or swapped the first two QOLLOCK scripts were all accepted by `guard`.
   - The current generated layouts do preserve these things. Direct generated-file edits are also caught by `generate.js --check`, and `tests/qollock.test.js:42-48` separately checks source script order; this is not a claim that those hand edits pass the complete build.
   - Fix: add structural preservation checks for anonymous panels/classes and ordered includes to the composition/post-pack checks, with negative mutations. Alternatively narrow the “every panel” claim to the reference-only contract actually enforced.

5. **P3 — the own-HUD coexistence test suppresses the very collision it claims to exclude.**
   - Evidence: `tests/qollock.test.js:175-180` manually imitates QOLLOCK and writes the lower-case lookup only when `lower !== left`. If lookup semantics changed to return the v3 panel, the test would deliberately skip QOLLOCK's write and still pass.
   - Fix: run the real pinned color-warning manifest on the shared HUD fixture, or at minimum apply its write whenever the lookup returns a panel. Keep lookup semantics grounded in native evidence rather than this exclusion. The current native implementation supports the disjoint-panel conclusion below, so this is a regression-test weakness, not a demonstrated live wash conflict.

### Checks and resolved questions

- **Composition and source derivation:** independent XML inspection found all 126 pinned Escape-menu nodes and all 91 pinned topbar nodes in order, with pinned panel ids/classes/attributes intact except the intentional root/button/background hooks and compiled stylesheet suffixes. All **872 generated ids** survive. The original 52 QOLLOCK script includes precede the seven shared v3 scripts and final bridge. `tools/generate.js:235-245,260-263` builds both variants from the same menu fragment; there is no hand-maintained second v3 menu.
- **Negative checks:** deleting the storage include, `QOLStorageBridge` id, or `HPColorsMenuHost` id from temporary files made `guard` throw. A tampered temporary pak made `verifyInputs` throw. Independently changing each normal/QOLLOCK Escape-menu/topbar output in a temporary output tree made `generate.js --check --output-root <temp>` exit 1 naming precisely that stale file. The repository was not mutated for these probes.
- **Native id case matching:** the current standard Panorama panel lookup is **case-sensitive**, not case-insensitive. In `panoramauiclient.dll` SHA-256 `fab432a665c56c15640474262bd0b2fa5f428d8e1da15e91a452d4bb0c282fdd`, the `FindChild`/`FindChildTraverse` registration maps to RVAs `0xbbc80`/`0xbbce0`, dispatching panel vtable slots `0x168`/`0x178`. In `panorama.dll` SHA-256 `8453bc51dd56c00fc4318cd253b7e194d19262aa7579e793b83d6634c62c400f`, `CUIPanel` vtable RVA `0x4cb288` maps these to `0xf8490`/`0xf85d0`. Both compare raw id bytes, with no case fold; `FindChild` assembly at `0xf84d4-0xf84e5` explicitly loads/subtracts the two bytes. The id getter at `0x112be0` returns the stored string unchanged. Evidence: `native/result.txt:230-231`, `native/functions.txt:13-22,36-45`, `native/panel.txt:236-272,319-344`, `native/compare-asm.txt:56-70,244-248`.
  - Thus QOLLOCK's `FindChild("health_bar_left")` (`QOL/scripts/manifests/ql_color_warnings/manifest.js:318-323`) does not alias v3's `health_bar_Left` (`panorama/scripts/hp_colors_v3_menu.js:228-232`) through the standard implementation. This is static native evidence, not an in-game observation. IDA's native tool was unavailable; the installed IDA CLI analyzed temporary copies. An older supplied IDB had a different hash and was not used as current evidence.
- **Other overlaps:** searched all 134 decompiled QOLLOCK scripts for world/unit-status names, `health_bar_*`, `HPColors*`, shared config/events and schedules. The only `UnitStatus` hits are unused cache-field declarations in `QOL/scripts/ql_state.js:257-260`; no world `unit_status_overlay_v2` layout exists. No production QOLLOCK `GameUI.CustomUIConfig`, `HPColors*`, or `ClientUI_FireOutput` use was found; v3's current 11 scripts also do not use `CustomUIConfig`. The one QOLLOCK config hit is its standalone smoke-test stub.
  - The real overlapping HUD loops target different properties/panels: color warnings write local parent washes and lower-case child lookup at `QOL/scripts/manifests/ql_color_warnings/manifest.js:407-415` and run at 0.16 s (`:760-789`); healthbar variants poll the local HUD (`QOL/scripts/manifests/ql_healthbar/manifest.js:90-154`); ultimate cooldowns update text, while v3 owns alignment. No additional world-bar writer was found. Parent-wash visual multiplication remains a rendering inference requiring the live check, not a VM-proven appearance.
- **Storage:** QOLLOCK uses `qollock_settings` on `https://predi-i.github.io` (`QOL/scripts/core/ql_storage_bridge.js:21-23`); v3 uses `hantu.hpcolors.v3/state` and `.prev` on `https://hantu-raya.github.io` (`panorama/scripts/hp_colors_v3_storage.js:4-8`). HTMLTitle handlers are panel-scoped (`QOL/.../ql_storage_bridge.js:324-326,516-518`; v3 `:314-318`). In the real-script composed VM, v3 reached Saved, a QOL `QOL_BRIDGE_READY:frag1` title made only its own panel ready, and another v3 save completed while QOL remained ready. This checks handshake isolation; it does not claim a real-browser QOL persistence round trip. The existing storage test exercises the real v3 hosted-page script but only records QOL navigation.
- **Build/package checks without rebuilding:** all four existing VPK hashes match the ticket's reported hashes, including normal `a685801bb63849ac0f2c2649aa616647ada544c9e21bb594721cc9048bdb5a80` and `3ba9aa668f2c0a3ecee70aa7986d89fc11a27f7511172f55385e6b40300cf978`. Independent VPK-directory parsing found exactly **19/19/20/20** expected assets for normal release/debug and QOLLOCK release/debug. Fresh decompiles of both existing QOLLOCK pak02s passed `checkPacked` for both layouts. `build_hp_colors_rewrite_v3.ps1:78-84,168-190` fails on pin/decompile drift or wrong asset sets; the variant adds only its bridge and overlays its two layouts. `.gitattributes:1-2` is unchanged (`* text=auto`); LF-normalized pin hashes and generation comparisons handle CRLF checkouts.
- **Focused checks actually run:** `node --test --test-reporter=tap hp_colors_rewrite_v3/tests/qollock.test.js` **11/11 pass**; the single `timers.test.js` file **21/21 pass**, both with the independently decompiled runtime required and **zero skips**. `node hp_colors_rewrite_v3/tools/generate.js --check` passes with **14 current outputs**. These green checks do not negate the runtime reproductions above. Full-suite/build/live results remain the builder's reported evidence, not audit reruns.

### Re-audit (m3)

**2026-10-15 — REJECT: runtime fixes pass, but the structural/post-pack guard acceptance is incomplete.** No current runtime defect was reproduced. The remaining findings below are P3 validation gaps, not evidence that the existing packages have broken layouts. Paths beginning `tools/`, `tests/` or `panorama/` in this subsection are relative to `hp_colors_rewrite_v3_qollock/`.

**Remaining findings**

1. **P3 — the “exact” post-pack comparison ignores the critical hooks too.** `tools/qollock.js:73-83` removes `HOOKS` attributes from both signatures even when `exact=true`; `checkPacked` uses that comparison at `:172-180`. Independent read-only substitutions of the packed layout each passed `checkPacked` (returned `2`) after (a) deleting the menu root's `onload="$.HPColorsMenuBoot()"`, (b) emptying its `oncancel`, or (c) deleting the topbar's `HPColorsV3TimersTopBar` class. A compiler/package regression dropping initialization, cancel handling or the timer class would therefore pass the promised node-for-node check. Keep the intentional hook exceptions only for pinned-to-composed comparison; compare all composed-to-packed attributes. Add these negative cases to `tests/qollock.test.js:331-343`, which currently tests only node deletion/addition.
2. **P3 — depth/order do not preserve parentage.** `tools/qollock.js:57-90` records depth but no parent/ancestor identity. In-memory replacement of `<Button id="ModSettingsBtn"` with `</Panel><Panel id="AuditWrongParent"><Button id="ModSettingsBtn"` passed `guard('menu', pinned.menu, changed, [])`. This leaves the original `SettingsRow` empty and puts QOL LOCK's button under a different parent lacking that class, without losing any pinned node or changing its depth/order. The moved-panel test at `tests/qollock.test.js:86` changes depth, so misses this case. Preserve pinned ancestry as well as order/depth, or narrow the claimed structural contract; retain this same-depth reparenting mutation.

**Five original findings re-run**

- **Delayed background / all open paths:** the real pinned scripts and model both pass the installed-callback test after 1,000 ms, including a non-writable `SetPanelEvent`, search-first/editor-second consumption and resume only when closed (`tests/qollock.test.js:132-209`; bridge `panorama/scripts/hp_colors_v3_qollock_bridge.js:32-73`). All five exports plus the XML button enforce exclusivity. Independent pinned-runtime stress repeated 20 switches per export: one force-close and one call each to tooltip/preview/side-modal/arcade cleanup per switch, no accidental resume or reopening, and another 10 seconds of scheduled work completed. Optional cleanup APIs were instrumented in memory. The 220 ms debounce and 350 ms unforced-close guard tests pass; no bridge-induced loop/double-close found.
- **Skip policy:** absent pak03 skips, required+absent throws, and present pak03 with bad hash, missing viewer or failed decompile throws (`tests/qollock-runtime.js:24-58`; tests `:272-286`). The original missing-viewer reproduction now fails rather than skips.
- **Structural mutations:** the original lost `SettingsRow`, deleted anonymous `MenuIcon` and reordered scripts now throw, as do the additional changed-attribute/depth/topbar mutations (`tests/qollock.test.js:76-90`). The two remaining guard gaps above were found with additional independent mutations.
- **Own HUD:** the real pinned HUD scripts enable `ql_color_warnings` through ConfigStore/FeatureRegistry, tint the parents, leave the v3 child triple/write count unchanged, and clear only their own washes on disable (`tests/qollock.test.js:292-328`). The model no longer excludes an aliased lookup (`:249-250`). Native case-sensitivity evidence remains the prior audit's static evidence, not a fresh live test.

**Lane and build review**

- Grep of canonical `hp_colors_rewrite_v3/tools`, `tests` and `build_hp_colors_rewrite_v3.ps1` found no QOLLOCK lane dependency: only the explanatory `generate.js:269` comment and unrelated-storage-key assertions in `tests/storage.test.js:10,19`. The lane calls canonical `menuParts()` (`tools/qollock.js:187-192`; canonical generator `:272-276`), with no second maintained v3 menu.
- Renaming a schema row makes the lane CLI's actual `--check` branch exit **1** for stale canonical output; substituting regenerated canonical outputs then makes it exit **1** for stale QOLLOCK Escape-menu output. These independent CLI probes changed only in-memory reads. The retained lane test also proves regeneration/recomposition recovery (`tests/qollock.test.js:347-366`). The wrapper runs both checks and throws before staging (`build_hp_colors_rewrite_v3_qollock.ps1:45-52`); no build was run for the probe.
- The new wrapper fails on wrong pak/zip, failed decompile or reviewed-entry drift (`:54-62`), transforms both staged trees and runs both suites with `HPV3_QOLLOCK_REQUIRED=1` (`:64-93`), overlays only after tests (`:95-100`), and requires post-pack decompile/check success (`:101-105`, subject to finding 1). The shared pipeline retains compiler timeout/exit/zero-failure checks and exact compiled/packed sets (`scripts/hp-colors-v3-pipeline.ps1:44-102`). The canonical wrapper retains version/upstream/generation checks, isolated staging, transformed-script tests and its normal asset contract (`build_hp_colors_rewrite_v3.ps1:18-72`).
- Rehashed existing normal release/debug: **a685801bb63849ac0f2c2649aa616647ada544c9e21bb594721cc9048bdb5a80** / **3ba9aa668f2c0a3ecee70aa7986d89fc11a27f7511172f55385e6b40300cf978**, unchanged. Independent VPK-directory parsing matches the shared pipeline's exact **19** normal assets. Existing lane packages match **c951ffde…ecdc04c** / **26c3653a…48d8394**, exact **20** assets. Both existing lane `packed-check` trees pass against current source; these were reused, not freshly decompiled.

**Checks actually run:** canonical suite **929/929**, lane source suite **24/24**, and lane suite against each existing release/debug staged tree **24/24**; all zero failures/skips. Pinned runs explicitly used `HPV3_QOLLOCK_ROOT=D:/temp/hpv3-m3-audit-68FMqr` and `HPV3_QOLLOCK_REQUIRED=1`; all 15 reviewed decompiled entries and both input hashes were reverified. `generate.js --check` passes with **12** current outputs; `qollock.js --check` passes with **2**. The context-mode batch response timed out during the canonical suite, but its indexed final result was recovered (929 pass, 0 fail, 0 skipped). No builds, deploys, launches or git writes; only this ticket was edited. Native handler override/fallback timing, appearance and focus still require the live check already listed above.



## Fixes after audit

All five m3 findings are fixed. Except where noted, each test was written first and seen red with the real pinned runtime and with the model runtime.

1. **Background handler (P2).**
   - The bridge wraps `#EscapeBackground.SetPanelEvent`, so QOLLOCK's delayed `hookEscapeMenu` callback is installed as `if (QOL LOCK is closed and $.HPColorsMenuCancel()) consume; else run QOLLOCK's callback`. HP COLORS closes its search first, then the editor, before any resume. QOL LOCK's own close and resume are unchanged.
   - If a native panel refuses the property override, a fallback rebinds the same behaviour at 0.25 s and 1 s, after QOLLOCK's 0.2 s boot (its shell is static, so the first attempt binds).
   - Test "QOLLOCK's delayed background handler…" runs the scheduler for 1,000 ms and invokes the installed `events.onactivate`, not the XML attribute. It covers both the wrapped path and a non-writable `SetPanelEvent` (the fallback). It was red in both runtimes before the fix.
   - The existing one-window test now also uses the installed callback.
2. **Every open path (P2).**
   - The bridge wraps `QOL.ui.window.setOpen`, `toggle` and `toggleSettingsWindow`, the global `ToggleSettingsWindow`, and `$.ToggleSettingsWindow`. Each runs unchanged, so QOLLOCK's debounce, guards and cleanup stay intact. If QOL LOCK is then open, HP COLORS closes through its own toggle.
   - `$.HPColorsMenuToggle` closes QOL LOCK through `$.ForceCloseModSettings(true)`, QOLLOCK's full close.
   - Closes call the unwrapped originals and check both windows first, so there are no loops. Wrapping both a delegate and its target is idempotent.
   - The test covers all five exported paths plus the XML button in separate boots. In each, HP COLORS closes, and reopening HP COLORS closes QOL LOCK exactly once with `forceCloseModSettings(true)`. A second test checks that the 220 ms debounce and the 350 ms unforced-close guard survive.
   - It was red (`setOpen(true)` left both windows open). The model now mirrors the `window.js` export wiring.
3. **Test skips (P2).**
   - `tests/qollock-runtime.js` `resolvePinned` skips only when the pak03 is absent, and fails when `HPV3_QOLLOCK_REQUIRED=1`.
   - If the pak03 is present, it fails on a hash drift, a missing Source2Viewer-CLI, or a failed decompile, with the install path and the `HPV3_QOLLOCK_ROOT` alternative. A verified `.build/qollock-pin` cache is accepted.
   - Test "skips only for an absent pak03…" was written after the code. The pre-fix runtime returned a skip for a missing viewer (audit reproduction), and the new test asserts the throw.
4. **Guards (P3).**
   - `guard` now also requires every pinned node, including anonymous panels, classes, all attributes and ordered includes, to appear in the composed layout in the same order and at the same depth. Only the four hook attributes may differ (root `onload`/`oncancel`, `EscapeBackground`/`EscapeButton` `onactivate`, topbar root `class`), and v3 nodes may only be inserted.
   - The post-pack check requires the decompiled pak02 layouts to match the composed sources node for node.
   - Seven negative mutations throw: a lost `SettingsRow` class, a deleted `MenuIcon`, swapped first scripts, a changed attribute, a moved panel, a lost topbar class, and a lost topbar attribute. The guard test was red before the change. The post-pack mutation test (a deleted node and an extra node) is new coverage.
5. **Own-HUD test (P3).**
   - The model test now applies QOLLOCK's write to whatever `FindChild("health_bar_left")` returns, with no exclusion.
   - A new pinned test boots all 80 real QOLLOCK `hud.xml` scripts on the shared HUD fixture and enables the real `ql_color_warnings` through `ConfigStore`/`FeatureRegistry`. QOLLOCK tints `hud_health_bars`/`health_bar`, v3's `health_bar_Left` triple and its write count stay unchanged, and QOLLOCK's disable clears only its own washes.
   - The test passed on first run; no defect was expected.
   - Lookup semantics come from native evidence (audit m3): `panorama.dll` (SHA-256 `8453bc51…400f`) `CUIPanel::FindChild` compares raw id bytes with no case fold (rva `0xf84d4-0xf84e5`; `FindChildTraverse` `0xf85d0`).
- Checks:
  - `node --test hp_colors_rewrite_v3/tests/*.test.js` gives **952/952 pass, 0 skipped**. `generate.js --check` passes (14 outputs).
  - Staged suites in all four builds: 951 pass, 1 mode skip (the existing release/debug-only test), 0 fail.
- Builds (`-SkipDeploy`, 0 compiler failures, exact asset set):
  - Normal release `a685801b…5a80` and debug `3ba9aa66…f978` are **unchanged**.
  - QOLLOCK release `c951ffde3c36e0c9da769a828f1511cb91880fab474bed0bf3f777b12ecdc04c` and debug `26c3653a388e2302f01c7fe3bed748b08cf4488b620949414e06063a448d8394`. Only the bridge changed; both passed the node-for-node post-pack check.
- Still needs a live check: whether native panels accept the `SetPanelEvent` override (the fallback covers a refusal), the button look, and focus after switching windows. Nothing was deployed or launched.

## Lane restructure

User decision (via Main): the QOLLOCK variant lives in its own lane, like v2's `hp_colors_rewrite_v2_qollock/`.

- Moved into `hp_colors_rewrite_v3_qollock/`:
  - `panorama/` (the composed layouts and the window bridge);
  - `vendor/{pin.json,hud_escape_menu.xml,citadel_hud_top_bar.xml}`;
  - `tools/qollock.js`, which now also writes the layouts and has `--check`;
  - `tests/{qollock.test.js,qollock-runtime.js,timers.test.js,fixtures/qollock-window-model.js}`;
  - build output in `.build/{release,debug}`, with the pinned decompile cache in `.build/pin`.
- The old paths and the old `hp_colors_rewrite_v3/.build/qollock-*` dirs are deleted.
- Dependency direction: v3 does not reference the lane.
  - `tools/generate.js` no longer composes QOLLOCK layouts or reserves QOLLOCK ids. It publishes `menuParts()` (the injected v3 menu and topbar pieces plus its files).
  - Generic test seams stay in v3: the `boot-layout` `resolveScript` option, the `storage-fixture` `boot` option, and the new `tests/timers-fixture.js` extracted from `timers.test.js`.
  - The lane consumes these seams. v3 back to 12 generated outputs.
- Staleness: `node hp_colors_rewrite_v3_qollock/tools/qollock.js --check` composes from v3's current sources. It refuses a stale v3 checkout, and fails while the lane layouts differ.
  - A lane test copies both lanes, renames a schema row and shows both failures, then recomposes to current.
  - The lane build runs both `--check`s.
- Builds:
  - `build_hp_colors_rewrite_v3.ps1` lost `-Qollock` and all QOLLOCK staging.
  - The new `build_hp_colors_rewrite_v3_qollock.ps1 -SkipDeploy [-Debug]`:
    - verifies the pin and the decompile;
    - stages the v3 and lane trees and transforms both;
    - runs both suites on the staged trees, with the real pinned runtime required;
    - overlays the lane, compiles, asserts the exact 20-asset set, and runs the node-for-node post-pack check.
  - The compile and pack steps are shared through `scripts/hp-colors-v3-pipeline.ps1`.
- Checks:
  - `node --test hp_colors_rewrite_v3/tests/*.test.js` gives **929/929 pass, 0 skipped**. This is the canonical suite without the 23 QOLLOCK tests.
  - `node --test hp_colors_rewrite_v3_qollock/tests/*.test.js` gives **24/24 pass, 0 skipped** (23 moved plus the lane staleness test).
  - `generate.js --check` passes (12 outputs) and `qollock.js --check` passes (2 outputs).
  - The staged suites in the lane builds give v3 928 + 1 mode skip and lane 24/24.
- Hashes:
  - Normal release `a685801b…5a80` and debug `3ba9aa66…f978` are **unchanged**, with an identical 19-asset set.
  - QOLLOCK release `c951ffde3c36e0c9da769a828f1511cb91880fab474bed0bf3f777b12ecdc04c` and debug `26c3653a388e2302f01c7fe3bed748b08cf4488b620949414e06063a448d8394`, from the new wrapper. They are byte-identical to the post-audit builds, with 20 assets and 0 compiler failures.

## Fixes after re-audit

Both m3 re-audit P3 findings are fixed in `hp_colors_rewrite_v3_qollock/tools/qollock.js`. These are validation-only changes, with red tests first.

1. **Exact post-pack check.**
   - The hook exceptions (root `onload`/`oncancel`, background and resume `onactivate`, topbar root `class`) now apply only to the pinned-to-composed `guard`. `checkPacked` compares every attribute, composed to packed.
   - New negative tests: a dropped root `onload`, an emptied root `oncancel` and a dropped `HPColorsV3TimersTopBar` class. Before the fix they did not throw (red on `onload`); now they throw.
2. **Parentage.**
   - Each node records its parent. A pinned node must now match a composed node whose parent is the counterpart of its pinned parent, so order, depth and ancestry are all preserved.
   - The same-depth reparenting mutation (`ModSettingsBtn` under a new sibling `Panel id="AuditWrongParent"`) did not throw before; now it throws.

Checks:
- The lane suite passes 24/24 with 0 skipped. `generate.js --check` (12) and `qollock.js --check` (2) both pass.
- Both existing `packed-check` trees pass the stricter check.
- The lane builds' staged suites give v3 928 + 1 mode skip and lane 24/24.
- The lane release/debug rebuilds are byte-identical: `c951ffde3c36e0c9da769a828f1511cb91880fab474bed0bf3f777b12ecdc04c` / `26c3653a388e2302f01c7fe3bed748b08cf4488b620949414e06063a448d8394`. Normal `a685801b…` / `3ba9aa66…` are untouched.

## Live check (2026-10-15)

The user installed QOLLOCK v3 debug pak02 `26c3653a` with the pinned QOLLOCK pak03 `26fc7d60` and reported that everything works: window exclusivity, background click, button look, focus, and both saves.

## Addons layout for sharing (2026-10-17)

The user asked for both release builds in `addons`: normal v3 as pak02, and the QOLLOCK-support build as pak03, "so I can send easily". Main rebuilt both from current source and copied them in (refreshed after tickets 30–32 on 6790; on 2026-10-17 05:05 another build occupied pak03 and the game was running, so these were left in their build folders):

| addons file | Build | md5 | SHA-256 prefix |
|---|---|---|---|
| `pak02_dir.vpk` | v3 release (`hp_colors_rewrite_v3/.build/release`) | `72be90e4` | `cbc1f47e` |
| `pak03_dir.vpk` | v3 QOLLOCK release (`hp_colors_rewrite_v3_qollock/.build/release/pak02_dir.vpk`, renamed) | `ea4fbd50` | `ccb2951c` |

- The rename does not change the file contents. The QOLLOCK build still expects QOLLOCK's own pak03 (`26fc7d60`) for `hud.xml` and QOLLOCK's scripts, and both v3 files override the same Escape-menu, top-bar and healthbar layouts.
- While both sit in one game's `addons`, the two builds override each other, so this layout is for sharing, not for play-testing. Recipients use one file: the normal pak02 on its own, or the QOLLOCK build next to QOLLOCK. A QOLLOCK user must not let it replace QOLLOCK's own pak03; give it a free slot instead (for example pak02).
- Nothing was launched. This layout is not live-checked, and the QOLLOCK release build has not been live-checked at all (only the debug `26c3653a` on 2026-10-15).
