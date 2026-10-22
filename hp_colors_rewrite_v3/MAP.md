# Map: HP Colors v3

Implementation tickets live in `issues/`; historical wayfinder decisions remain in `tickets/`. Each ticket records its status and blockers.

## Destination

Deliver the approved [SPEC.md](SPEC.md) in stages, preserving v2 behavior and separate VM, build/package and live-release evidence.

## Notes

- Start with [AGENTS.md](AGENTS.md) for rules and commands, [CONTEXT.md](CONTEXT.md) for vocabulary and [SPEC.md](SPEC.md) for behavior. [PLAN.md](PLAN.md) gives the implementation plan; `tickets/`, `DEBATE.md` and `GRILL.md` preserve earlier design work.
- Read [ENGINE.md](ENGINE.md) for native constraints, [docs/adr/](docs/adr/) for durable decisions and [LIVE-VERIFIED.md](LIVE-VERIFIED.md) before making live claims.

## Decisions so far

- [Preview bar](tickets/10-preview-bar.md): the renderer's plan drives a fake bar tree in the menu (hero/NPC/objective, slider, play); 12/12 tests, compiles. Renderer must export apply, not self-start, and keep per-kind stock fallbacks.
- [Record format and migration](tickets/03-record-format-and-migration.md): versioned sparse records; newer saves load read-only, newer codes import with a warning; 128 presets with size checks.
- [Renderer prototype](tickets/06-renderer-plan-apply-prototype.md): facts -> plan -> apply holds for one enemy player bar in the VM; 175 / 160 / 11 ops/bar/s against the 300 / 200 / 30 ceiling (fewer features than v2's fixtures, so not a like-for-like saving). 14/14 tests.
- [Generated menu compile](tickets/11-generated-menu-compile.md): BAR page generated from the settings data compiles with sr2compiler (0 failed); output is deterministic; 206 stable ids. The compiler accepts unknown CSS properties, so a clean compile does not validate styling.
- [Menu mocks](tickets/07-menu-mocks.md): by part of the bar, enemy/ally side by side, with Basic/Advanced folds.
- [V2 dead-weight audit](tickets/01-v2-dead-weight-audit.md): no feature is dead or never worked; duplication and compatibility-only code listed for the rewrite. Feature-cut ticket closed.
- [Hosted page protocol](tickets/04-hosted-page-v2-protocol.md): published 75e7620 (live page verified); v2 suite 48/48, v3 page test 8/8.
- [Performance baseline](tickets/05-performance-baseline.md): v2 measures ~360-388 counted ops/bar/s active, ~257-280 idle, ~41-46 dormant; v3 ceiling 300/200/30 accepted.
- [Game data sources](tickets/09-game-data-sources.md): pinned SteamTracking `unit_status_v2.css` and `heroes.vdata`, with drift checks.
- Scope: full v2 feature parity, built in stages (core first). See `PLAN.md` section 5.
- [Grilling, four rounds](GRILL.md): normal pak02 first; store page published early; silent v2 save conversion; v2 codes converted until v4; redesigned ESC-style menu with search and a real-renderer preview; pixels everywhere; v2's look as defaults; debug build with logs; live tests at core and parity; stage order Indicators → Units → Styling → Scopes.
- [Debate: core architecture](DEBATE.md): schema-driven, side-as-data, one unit system, versioned sparse records, facts → plan → apply renderer with three scheduler states, migration at one boundary.

## Status

Feature tickets through 24 are implemented and VM-verified: Core, Indicators, Units, Styling extras, hero routing and ability conditions. The current source pin is **ClientVersion 6790**. The latest combined gate is **1254/1254 canonical**, **30/30 QOLLOCK** and **48/48 v2 storage**, with both generators current ([ticket 32](issues/32-donate-button-and-supporter-strip.md#implementation-2026-10-17)). Ticket 25 supplies the glossary, engine evidence, ADRs and agent routing. Native acceptance is only the subset in the live ledger, not full parity.

## Rebase 6785 → 6790 (2026-10-17)

- Pinned SteamTracking commit `9b616d3093a7f3e25e852ec93c9b818c5d2c94ed`; replaced only `vendor/unit_status_v2.css`, `vendor/heroes.vdata` and `vendor/abilities.vdata` and their hashes. Hero localization and all three stock layouts are unchanged. The rectangular-stock deletion/import anchors still match without changes.
- Stock `#name` moves its box from 47px to 45px and adds 2px top padding, leaving the text top at 47px. The renderer clamps from 45px, preserves `2px … 0px …` custom padding, and the preview copies the new stock box. The new world/preview contract failed first on the old custom padding and passes after the fix; existing padding/clamp expectations now reflect 6790.
- Catalog remains 67 heroes, with no new/renamed identities or ID changes. Only Violet (`hero_artist`, ID 86) changes consumed data: `inDevelopment` false → true, portrait null → `file://{images}/heroes/artist_sm.psd`, and four null signature images → `artist_livingink.psd`, `artist_brush.psd`, `artist_portrait.psd`, `artist_landscape.psd` under `file://{images}/hud/abilities/artist/`. Disabled/testing flags and all other catalog entries are unchanged.
- Picker policy (user, 2026-10-17): hide only `disabled`, `needsTesting` or `limitedTesting` heroes; `inDevelopment` alone no longer hides a hero, because released Baba and Violet both carry it. This replaces the old `hero_baba` exception. 6790 picker: 45 heroes plus the default gear tile (46 tiles); `hero-routing.test.js` covers Violet/Baba shown and Calico/Generic Person/Kali hidden.
- Regenerated canonical data/assets and recomposed QOLLOCK; its separate pak03 pin is untouched. All three suites pass: 1249 canonical (one new name contract), 28 QOLLOCK, 48 storage. Both generator `--check`s pass; upstream reports no drift and installed `steam.inf` matches 6790. Shell logs are retained in `.scratch/rebase_6790/*.log` at the repository root.
- No build, install or launch. Earlier package hashes and live observations below remain historical 6785 evidence; this source rebase still needs a separately authorized build and native CSS/rendering check.


## Remaining decisions and verification

- [Ticket 11](issues/11-live-test-1-core.md) is **on hold** (user, 2026-10-17: release first for feedback). Only in-game checks remain: native adoption/reparenting and recycle, stock fallbacks and fades/critical/empty states, immediate release-to-stock behavior.
- [Tickets 23](issues/23-hero-detection-and-hero-preset-routing.md) and [24](issues/24-ability-conditions.md) have no v3 live or compiled-pak acceptance. Check local identity, routing transitions and signature-tier conditions in the authorized parity session.
- [Ticket 27](issues/27-stock-settings-theme.md) is implemented through round 3. Round 3 added the stock theme, the preset tile library with glyph toolbar, the portrait hero picker, notice-style dialogs and stock keyframes. Canonical debug `25f4b8a4` is live-checked on 6785. Release paks are built (v3 `1bc8e05a`, QOLLOCK `54046977`) but not live-checked. Also unchecked: the QOLLOCK variant, the non-preset dialogs in the round-3 chrome, keyboard traversal and 4:3.
- [Ticket 26](issues/26-release-at-parity.md) is pending: consent, final normal/QOLLOCK release and debug packages, installed-hash evidence, 6–8 representative parity screenshots, rollback archives and publication. Tickets 12–22 are user-confirmed working in game (2026-10-17).
- [Ticket 28](issues/28-critical-assassinate-unkillable-labels.md) is done: on/off toggles and X/Y offsets for CRITICAL, ASSASSINATE and UNKILLABLE (v13 slots 167–175). The user confirmed it works in game (2026-10-17).
- [Ticket 29](issues/29-live-video-menu-bugs.md) is done: slider Undo (`SliderValueChanged`/`SliderReleased`), Settings/Bundle COPY (the `TextEntryCopyToClipboard` fallback) and the search offset. Main live-checked Undo and COPY; the user confirmed the whole ticket in game (2026-10-17). Gates: 1230/1230 canonical, 24/24 QOLLOCK, 48/48 v2 storage.
- [Ticket 30](issues/30-version-label-and-portrait-renderer-toggle.md) is done: the shipped `v3.0.0` label keeps its single source (`settings/record.json` `release`); the portrait renderer toggle was removed by user decision 2026-10-17 because without the cvar-unhide DLL none of the tested Panorama routes changes `citadel_portrait_world_renderer_off`. Canonical outputs and QOLLOCK are regenerated; removal has no new build/install/live check.
- [Ticket 31](issues/31-credits-dialog.md) is implemented and VM-verified: CREDITS beside the preview version opens the shared notice dialog with exact user text and generated Solomon/Lash circle portraits; CLOSE, ESC and backdrop preserve settings/storage/Undo. Canonical/QOLLOCK outputs are current; gates 1248/1248 canonical, 28/28 QOLLOCK and 48/48 v2 storage. No build/install/launch; Main's live rendering/console check remains open.
- [Ticket 32](issues/32-donate-button-and-supporter-strip.md) is done and live-checked on 6790. The footer has CREDITS and DONATE on the left and `v3.0.0` on the right, with the v3 supporter strip (hosted `supporters-strip-v3`) below it. The DONATE click still needs a real user click to confirm.
- [Ticket 33](issues/33-update-notice.md) is implemented and VM-verified: on editor open, a newer release listed in the hosted `latest.json` shows an UPDATE AVAILABLE notice once per session. The hpv2-store page change is local and unpublished (needs user approval). No build, install or live check yet.
- Release builds (2026-10-17, game 6790, after tickets 30–32 and the Violet picker fix): normal v3 `hp_colors_rewrite_v3/.build/release/pak02_dir.vpk` (md5 `72be90e4`, sha `cbc1f47e`), now installed as addons `pak02_dir.vpk`; QOLLOCK-support `hp_colors_rewrite_v3_qollock/.build/release/pak02_dir.vpk` (md5 `ea4fbd50`, sha `ccb2951c`), not installed, because addons `pak03_dir.vpk` (md5 `07a3ed6f`) is an abilities pak (only `scripts/abilities.vdata_c`). Its 13 Oct QOLLOCK pin also matches QoLLock 4.0.5 16 October for every vendored/observed entry.
- Storage's `cas` page is published at `94cc689` and single-window save/restart is live-verified. Multi-window merges, overlap CONFLICT, handoff and confirmed REPLACE ALL recovery remain VM-only; the [audit](issues/audit-full-astra-2026-10-15.md#publication-and-live-check-main-2026-10-15) also retains the nonblocking “Bundle replaced” wording limitation.
- Timer design uses role-specific [world](panorama/scripts/hp_colors_v3_timers_world.js) and [HUD](panorama/scripts/hp_colors_v3_timers_hud.js) entry points. Normal v3 and ShowRank pak89 are **not** a supported combined topbar; install the ShowRank variant lane `hp_colors_rewrite_v3_showrank/` as pak02 next to pak89 instead ([ticket 34](issues/34-showrank-variant.md), build-only, live check pending). Third Eye remains later work, not part of the normal package.
- `fromV2` imports remain until v4. [ADR 0005](docs/adr/0005-hero-map-and-new-hero-ceiling.md) records the new-hero ceiling of migrated All-Except routing.
- A dedicated v3 verification skill remains a later task; the live ledger and ticket checklists are the current feature-level acceptance record.

## Changelog

Versions follow `settings/record.json` `release` (see [SPEC](SPEC.md#implementation-decisions)): fixes bump the patch, user-visible features the minor. Raise `hpv3` in hpv2-store `latest.json` only once a release can be downloaded.

### 3.3.1 (unreleased)

- **Fixed (QOLLOCK):** *Your shield bar: Separate (old)* did nothing on the QOLLOCK build (GameBanana report, 2026-10-22). The lane skipped every HUD that had QOLLOCK's `#currentHealthOverHearts`, which is part of every QOLLOCK healthbar type. It now runs there as well:
  - QOLLOCK's default healthbar gets the full old look;
  - QOLLOCK's Minimalist, FG, Klutz and Budhud healthbars keep their own layout and colours, while the fill, HP number and ticks are still corrected;
  - QOLLOCK's Minecraft healthbar draws the bars invisible, so the lane stays off there and costs nothing.
  See [ticket 40](issues/40-qollock-separate-shield.md). Not checked in game.
- **Builds (`-SkipDeploy -AllowPinMismatch`: installed 6813, pin 6807; staged suite passed with 0 failures in release and debug, QOLLOCK 34, ShowRank 11; all show v3.3.1):** normal `bbe74733` release / `047de213` debug, QOLLOCK `8c4d7430` / `3c8f0ee6`, ShowRank `76c7da66` / `e5927b63`. Nothing uploaded.
- **Installed (2026-10-22, user request):** QOLLOCK debug pak02 `3c8f0ee6`, next to the user's QOLLOCK pak03 4.0.5 16 Oct (sha256 `547cceee…`). The build is pinned to 13 Oct (`26fc7d60…`). In both pak03s, the 22 entries this build replaces or reads (Escape-menu and topbar layouts, health layouts and styles, `ql_hud`, the settings window and the storage bridge) have the same CRC.

### 3.3.0 (2026-10-22, game 6807; released: GameBanana normal `#FileInfo_1858405`, QOLLOCK `#FileInfo_1858404`; hpv2-store `latest.json` 3.3.0 at `588b97d`)

- **Added:** Name color source (`nameColorMode`: Own color / Team colors), side-aware, slots 196/197, record version 16, on the Name page between Custom name color and Name color. It reuses the stamina pattern: it applies only while Custom name color is on, takes `teamColor()` (the shared Amber/Sapphire colors), keeps the `80` spectator alpha, and uses the own name color when the team is unknown. No new reads, panels or styles: the name already paints from the plan, which already knows the bar's team. NEW tab item `team-name`. A v15 code reads Own color.
- **Tests:** renderer (needs custom on, team color, spectator alpha, unknown-team fallback), codec (v15 code, per-side round-trip), nav order, news, search; record-version pins moved to 16.
- **Live:** the user confirmed Team colors names in game on the ShowRank debug build `308fe7f6` (2026-10-22).
- **Builds (`-SkipDeploy`, pin = installed 6807; suite 1349 release / 1350 debug, QOLLOCK 34, ShowRank 11; all show v3.3.0):** normal `6cdbc62f` release / `3683dbad` debug, QOLLOCK `21d1b3d0` / `f44a6176`, ShowRank `28e4a412` / `308fe7f6`. The ShowRank release is installed.
- **Upload archives** (`.build/archives/`, 7z with `pak02_dir.vpk` at the root, each tested and extracted back to the release md5): `hp_colors_v330.7z` (normal, `e9cf4002`), `hp_colors_v330_qollock.7z` (`2ea4f53d`), `hp_colors_v330_showrank.7z` (`a310c33c`). Patch notes: `docs/changelogs/2026-10-22_hp_colors_v3_3_0.txt` and `_discord.md`. Uploaded: the GameBanana md5s and downloads match the archives, and the 3.2.2 files were replaced. ShowRank is not uploaded yet. `latest.json` 3.3.0 with both links pushed 2026-10-22.

### 3.2.2 (2026-10-21, game 6807; released: GameBanana normal `#FileInfo_1858077`, QOLLOCK `#FileInfo_1858078`; hpv2-store `latest.json` 3.2.2 at `5cf293c`)

- **Fixed:** Nurse Harrow (`hero_nurse`, id 87) showed in the hero picker and the ability-condition slot picker with no portrait and no ability icons. The 6790 game-data pin had her hero record but no art or ability bindings. The pin is rebased to GameTracking `3207c160` (ClientVersion 6807). `heroes.vdata`, `abilities.vdata` and `unit_status_v2.css` changed upstream; the stylesheet change only adds `.boss_tier3 #UnitStatus` to the midboss/chesspiece rule. She was the only hero whose catalog entry changed (67 heroes). Builds no longer need `-AllowPinMismatch` on 6807.
- **Guard:** `tests/game-data.test.js` now requires a portrait and four ability images for every hero the picker shows, so a stale pin fails the suite the next time a hero ships.
- **Builds (`-SkipDeploy`, pin = installed 6807; suite 1347 release / 1348 debug, QOLLOCK 34, ShowRank 11; all show v3.2.2):** normal `7d892d73` release / `5a0879cd` debug, QOLLOCK `4ddd0659` / `6ec1f601`, ShowRank `ad51ee3c` / `41123257`. The normal debug is installed.
- **Upload archives** (`.build/archives/`, 7z with `pak02_dir.vpk` at the root, each tested and extracted back to the release md5): `hp_colors_v322.7z` (normal), `hp_colors_v322_qollock.7z`, `hp_colors_v322_showrank.7z`. Uploaded: the GameBanana md5s match the archives (normal `5b9a5f54`, QOLLOCK `b2d8d24f`), and the 3.2.1 files were replaced. ShowRank is not uploaded yet.

### 3.2.1 (2026-10-21; released: GameBanana normal `#FileInfo_1858043`, QOLLOCK `#FileInfo_1858042`; hpv2-store `latest.json` 3.2.1 at `e3fb4fb`)

3.2.0 never shipped, so 3.2.1 is the first public release with everything under 3.2.0 below, plus these fixes:

- **Fixed:** NEW items whose page had been shown before (Team colors, Low stamina color, Old shield bar) stayed at the page top. The scroll now repeats for the first frames after the click. Checked live on all eight items ([ticket 36, Live fix 2](issues/36-new-tab-and-retired-low-empty.md#live-fix-2-2026-10-21-normal-debug-be606c03-game-6805)).
- **Fixed (QOLLOCK only):** Street Brawl world bars titled with the hero name got no ultimate progress or topbar pickups. QOLLOCK's topbar opts in to hero-name matching; normal and ShowRank are byte-identical in a VM differential ([ticket 39](issues/39-street-brawl-ultimate-progress.md)). Not live-checked.
- **Changed:** the old shield bar's watch runs at most 120 times a second instead of 250 ([ticket 38](issues/38-old-shield-bar.md#cadence-cap-120s-2026-10-21-user-choice)).
- **Fixed (ShowRank):** the update notice's DOWNLOAD opened the normal file in the ShowRank build. Each build now opens its own `latest.json` link (`normal`, `qollock`, `showrank`); a build without a link gets the text-only notice ([ticket 33](issues/33-update-notice.md#per-build-download-2026-10-21)). The hosted page now passes `showrank` on too (hpv2-store `e3fb4fb`, vendored and pinned).
- **Tooling:** the suite-pass cache also keys the repo ignore rules, the hpv2-store checkout and every `HPV3_*` variable the suite reads.
- **Upload builds (`-SkipDeploy -AllowPinMismatch`, suite 1346 release / 1347 debug, QOLLOCK 34, ShowRank 11; all show v3.2.1):** normal `ecc5d101` release / `cd0432de` debug, QOLLOCK `3efca169` / `40fdb262`, ShowRank `51a76f19` / `e1946240` (`<lane>/.build/{release,debug}/pak02_dir.vpk`). The normal debug is installed in `citadel/addons`.
- **Published:** `latest.json` 3.2.1 with the normal and QOLLOCK links, and the page change, pushed on 2026-10-21 (ticket 33). ShowRank has no GameBanana link yet, so its notice has no DOWNLOAD.

### 3.2.0 (2026-10-21, game 6796; never published on its own, shipped as 3.2.1)

- **Added:** team colors and low-stamina colors ([ticket 35](issues/35-team-and-low-stamina-colors.md)). The HP number gets a Team mode and a team-high option, stamina gets a Team mode, an ally copy and a low-charge color with a threshold, and the preview gets an AMBER | SAPPHIRE switch. Record version 14 adds slots 176–192.
- **Added:** a NEW tab like the game's ([ticket 36](issues/36-new-tab-and-retired-low-empty.md)). It lists the 3.2.0 items from `settings/news.json` and marks their rows and tabs. Click an item to open and flash its settings; X or CLEAR ALL dismisses items, and they also leave after 30 days.
- **Added:** *Your shield bar: Separate (old)* ([ticket 38](issues/38-old-shield-bar.md)). It brings back the own-HUD shield bar from before 6711: a separate green shield bar, a white fill at health / max HP and an HP number without the shield. Record version 15 adds slot 195.
- **Changed:** the side nav is restructured ([ticket 37](issues/37-side-nav-restructure.md)). A new ICONS tab holds level, ultimate, pickups and rejuvenator; related settings share a card and each feature's on switch heads its card. BAR goes from 10 cards to 7 and INDICATORS from 12 to 5. Saves and codes are unchanged.
- **Removed (after the first sandbox session):** *Low color on empty charges*. Its slots 193/194 are retired: older records drop them, and the numbers never return.
- **Fixed (ShowRank lane):** composition failed on ShowRank's new `[no-missing: cut …]` comment lines. `tools/showrank.js` now skips them.
- **Gates (after ticket 36):** canonical 1306/1306, QOLLOCK + ShowRank + v2 storage 90/90, all three generators current. Every stock file hash still matches at 6796; only the ClientVersion moved, so builds use `-AllowPinMismatch`.
- **Release gate:** the debug-build play session in ticket 35 (ally charges seen in game). This was still open when the user released 3.2.1, so ally stamina shipped with it unconfirmed.
- **Builds after ticket 36 (`-SkipDeploy -AllowPinMismatch`, staged suites 1304 release / 1305 debug of 1306):** normal md5 `5abd1081` release / `1c052d88` debug, QOLLOCK `c84cdfcc` / `44a872dc`, ShowRank `31187d46` / `82a901ba`. The new debug log lines read the unit name only when they write a line, so the debug build stays inside the same operation ceilings.
- **Install history:** the first ShowRank debug build (`0f4b57fb`) ran the 2026-10-21 sandbox session. Afterwards `citadel/addons` held only pak01 (DLF) while Deadlock ran, and the pak02 backup `pak02_dir.vpk.pre-3.2.0-debug-20261021.bak` (md5 `e66f2b80`) had been removed too. On 2026-10-21 the user asked for the normal variant first: the rebuilt normal **debug** pak02 was installed (`1c052d88`), then replaced the same day by the build with sub-nav marks (`dfcd708a`), then by the build with the Team colors scroll fix and the m1 audit fixes (`8aeaf2dd`), and then by the behavior-preserving refactor build ([ticket 36](issues/36-new-tab-and-retired-low-empty.md#refactor-2026-10-21-debated-with-m1--gpt-6-astra-effort-med)): normal `07f80faa` release / `9475d0a0` debug (installed), QOLLOCK `32d66ee6` / `2f0570c9`, ShowRank `ad664b97` / `6162c49c`. Staged suites 1311 release / 1312 debug, canonical 1313/1313, variants 90/90. Then by the side-nav restructure build ([ticket 37](issues/37-side-nav-restructure.md)): normal `7f3cff76` release / `cb92cecb` debug (installed), QOLLOCK `2d2ec0f0` / `4ed84c88`, ShowRank `ac3bf9cd` / `5540979d`. Staged suites 1316 release / 1317 debug, canonical 1318/1318, variants 90/90. Then by the old shield bar build ([ticket 38](issues/38-old-shield-bar.md), game 6805, client.dll unchanged): normal `68ec1ca0` release / `d4bc3a4c` debug (installed), QOLLOCK `3515510b` / `cd1dcff6`, ShowRank `05405dd9` / `8351e435`. Staged suites 1326 release / 1327 debug, canonical 1328/1328, variants 90/90 as `citadel/addons/pak02_dir.vpk`. There was no pak02 to back up, and addons held only pak01 (DLF) next to it. Without ShowRank's pak89, the normal build is the right variant.

### 2026-10-19: ShowRank variant lane (build-only, live check pending)

- New lane `hp_colors_rewrite_v3_showrank/` (`tools/showrank.js`, `tests/showrank.test.js`) and `build_hp_colors_rewrite_v3_showrank.ps1 -SkipDeploy [-Debug]`, which writes `hp_colors_rewrite_v3_showrank/.build/{release,debug}/pak02_dir.vpk`. It composes v3's generated Escape menu and topbar with ShowRank barebones' Escape hooks and party bridge and its topbar notification and team-average panels and style includes. ShowRank's `pak89_dir.vpk` still provides its runtime, stylesheet and six other layouts.
- Why: pak02 wins over pak89 for the two shared layouts, so normal v3 pak02 dropped ShowRank's Escape and topbar features. See [ticket 34](issues/34-showrank-variant.md).
- No release number change: `settings/record.json` is untouched. Not installed, not live-checked. QOLLOCK and ShowRank together remain unsupported.

### 3.1.1 (built 2026-10-18, game 6793; not installed or live-checked)

Released as 3.1.1 at the user's request (2026-10-18); the 3.1.0 builds were never shipped as final and are superseded. It contains everything below plus the update-notice DOWNLOAD button.

- **Added:** update notice DOWNLOAD opens the per-build GameBanana link from hpv2-store `latest.json` (published `38c7a62`).
- **Builds:** normal pak02 md5 `6e64434d` (sha `0e748ec8`, 812,231 B), QOLLOCK-support md5 `fe0e52fc` (sha `460978f9`, 816,418 B), both with `-AllowPinMismatch`; `--check-upstream` found all seven pinned stock files byte-identical at 6793, only the ClientVersion moved. Compiled-output suites 1269/1270 (one debug-only skip) and QOLLOCK 32/32. Upload zips: `.scratch/upload/hp_colors_v3_3.1.1/HPColors_v3.1.1.zip` and `HPColors_v3.1.1_QOLLOCK.zip`. Superseded 3.1.0 builds: md5 `2684a687`/`9c36c321` (no DOWNLOAD) and `4f0d6935`/`cd3963b5`.
- **Released (2026-10-18):** uploaded to GameBanana; hpv2-store `latest.json` raised to `3.1.1` with links FileInfo_1853290 (normal) and FileInfo_1853291 (QOLLOCK), commit `e4c4ed3` (user-approved), served copy verified.

- **Added:** update notice ([ticket 33](issues/33-update-notice.md)). It needs the hpv2-store page with the `latest` capability; older pages give no notice.
- **Fixed:** a settings code pasted into the bundle box (or a bundle into the settings box) was refused; IMPORT now follows the code ([ticket 29](issues/29-live-video-menu-bugs.md#user-report-code-import-stamina-paint-endless-wobble-2026-10-17)).
- **Fixed:** after importing settings with enemy stamina color on, every preview paint failed ("Preview unavailable") because of an inline `offBlack` colour write; enemy world bars hit the same write.
- **Fixed:** codes copied from chat (labels, backticks, quotes, trailing punctuation, line breaks, zero-width characters) were refused, and HPCR2 codes were routed to the v3 decoder.
- **Tests:** import/paint fuzz, wrapped-code import from both boxes, update-notice E2E against the real page script. Gates (2026-10-18): canonical **1267/1267**, QOLLOCK **30/30**, v2 storage **48/48**; `generate.js --check` 12 outputs and `qollock.js --check` 2 outputs current. No build, install or live check yet.

### 3.0.0 (2026-10-17)

- First v3 release, after tickets 30-32 and the Violet picker fix: normal pak02 md5 `72be90e4`, QOLLOCK-support md5 `ea4fbd50`, on game 6790.

## Out of scope

- Legacy full `hp_colors/`, `hp_colors_minimal/`, Rewrite V1 and the web preset builders (deprecated, `hp_colors_rewrite_v2/AGENTS.md:11`).
- Lane trooper colors (engine-drawn).

## Audit 2026-10-16

- Preserved exportable local drafts when CAS discovers newer saves; fixed retired topbar artwork cleanup, restoration retry/lease handoff, and stale timer callbacks.
- Measured and retained per-paint preview ancestry, topbar structure/progress separation, publish-gated HUD resolution, deduplicated identity checks, glyph queries, hue-thumb caching, search-only tile writes and within-sample renderer reads. Precomputed hero/cell maps remove repeated JS work.
- Removed two unused CSS rules and unread config/renderer metadata, gated release timing accounting, and removed the obsolete source-text assertion. Restored the dynamically emitted dropdown rule after review. Compacted generated menu settings and split timer entry points without changing transport.
- B3 threshold conversion remains withheld for v2 parity; P8 hidden-preview recovery and all build/deploy/game/FPS checks remain outside this audit.
- [Results and before/after artifacts](../.scratch/hpv3_audit/RESULTS.md) distinguish synthetic counts, behavioral regressions and resource bytes from native evidence. Existing counted ceilings remain unchanged.
- Builds:
  - Final debug `b20812d6` (md5); release v3 `40fe37e2` and QOLLOCK `959bed41`; 1198/1198 and 24/24 tests.
  - A pre-review-fix debug `8789f66e` (the timer split and all perf items, without the R1/F1/F2/F4 review fixes) was installed and loaded on 6785. `console.log` showed no Panorama script or CSS parse errors; the store and the split timers booted; preset apply and save worked during user play.
  - Not live-checked: the final debug build, QOLLOCK, and in-match pickup/ultimate rings.

