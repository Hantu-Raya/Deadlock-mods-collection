# 22c: Preview hero model (Infernus)

**What to build:** in the menu's preview, the HERO kind shows Infernus's 3D player model, with the preview healthbar sitting on top of his head, like a real in-world bar. The user requested this on 2026-10-15, before ticket 23.

**Reference:** `research/assets/22c-hero-model-preview-reference.webp`. It shows Seven's full-body model on a dark background with the name, bar and HP number centred just above his head. Ignore the reference's marker circles and its "Click a marker…" hint; they come from another tool.

**Blocked by:** none

**Status:** done; live-verified (live check 8, Main self-test). Native cost measured live (see Performance)

**Runs on:** m1 (Opus 5.5, med). **Review:** m3 (GPT-6-Astra, med).

- [x] The HERO preview shows the Infernus model (`hero_inferno`) behind the preview bar, with the bar anchored at the top of his head (live check 4 full body; live check 8 bust framing, no spill)
- [x] NPC, neutral and objective previews are unchanged
- [x] The model is collapsed when the menu is closed or the kind is not HERO (CSS state; VM-tested)
- [x] Collapsed model: **no observed model draw while collapsed; the map unloads on menu close** (live, Performance). Zero total hidden cost is not proven: the five-object scene stays loaded while the menu is open on a non-HERO page.
- [x] No setting slot is added, saves and codes are unchanged, and the normal and QOLLOCK menus both get it (`qollock.js --check` stays current)
- [x] VM E2E tests boot the real scripts and pass; the in-game look is checked live (live check 8: render, bust framing, no spill over the controls, bar proportions)

## Starting facts (Main, 2026-10-15; verify)

- Stock `CitadelHeroScenePanelNew` renders a hero model. `client.dll` 6782 strings next to the class name include the attributes `hero` and `heroscenestyle`, and the `EHeroSceneStyle` values `Portrait`, `TeamReveal`, `Profile`, `PostGamePortrait`, plus `Shop` and `HeroReveal` from layouts.
- HUD-context use already exists: `citadel_hud_hero_shop.xml:69` `<CitadelHeroScenePanelNew id="HeroScenePanel" heroscenestyle="Shop" hittest="false" />`. Other usages: `citadel_hero_spotlight.xml:9` (`Portrait` with `rotate`/`yawmin` attributes) and `citadel_db_page_hero_vo_test.xml:66` (`Shop`, `rotate="MouseInteract"`). Stock decompiles are in `.scratch/stock_6774/panorama/layout/`.
- A string `SetHeroID` exists in `client.dll`, near `hero_card` strings, which suggests a JS method for setting the hero.

## Open questions for the builder

1. Does the `hero` attribute take the hero's internal name (`hero_inferno`) or an id? Can it be set statically in XML? Is a JS call needed?
2. Which scene style frames the full body like the reference? How is the head-top screen position found: a fixed offset per style, or something the engine exposes?
3. Does the scene panel render in the Escape-menu context, which is HUD context, with the menu open?
4. How is rendering paused when hidden (`visibility: collapse`, or removing the panel)?
5. What is the cost when the panel is visible? Report it, and keep it lazy.

## Answers (PreviewHeroModel, 2026-10-15)

RE target: installed `client.dll`, ClientVersion 6782, SHA-256 prefix `B7DEB2D934614B2B`. I disassembled it with capstone, using RVAs below. No IDA, debugger or game launch was used.

1. **Hero selection: the attribute is `heroname`, not `hero`.** The class registration at RVA `0x1db4d0` links `CitadelHeroScenePanelNew` to the attribute list built at `0x1da3c0`. That list has three entries: `heroname`, `heroid` and `heroscenestyle`. The setter at `0x1d5a6e0` handles them as follows:
   - `heroname` resolves the hero VData by name (`0x76b4f0`, which returns `CitadelHeroData.m_HeroID` at +0x28) and stores the id at panel +0xf0.
   - `heroid` parses an integer into the same slot.
   - `heroscenestyle` parses `EHeroSceneStyle` into +0xf4.
   - Each one sets the dirty byte at +0x110. Any other attribute falls through to the base scene-panel handler (`0x1d98200`: `rotate`, `rendershadows`, `pitch`, …).
   - The string `hero` that sits next to the class name is a different thing: it is the `host_name` keyvalue for the spawned econ item container (`0x1d64ddf`), not a layout attribute.
   - So static XML `heroname="hero_inferno"` is enough, and no JS is needed. `SetHeroID` is a JS method registered at `0x1d63f40` (handler `0x1d63050`). I did not prove which class owns it, and this ticket does not use it.
   - Prior art: `3d hud/panorama/layout/hud.xml:318-344` shows static Infernus panels in the HUD context. Its `heroid="1"` is the attribute that worked. On this evidence, `hero`, `hero_id` and `unit` do nothing, and `map`/`camera` are overridden (see 2). Its code was not copied.
2. **Style.** The `EHeroSceneStyle` table at `.rdata` `0x2c04740` reads Shop=0, Portrait=1, TeamReveal=2, Profile=3, PostGamePortrait=4, HeroReveal=5. When the panel is dirty, `0x1d64be0` loads the scene from hero VData and ignores any `map`/`camera` attributes:
   - Shop and Profile load `m_strUIShoppingMap` (+0x8d8) with `point_camera`.
   - Portrait and HeroReveal load `m_strUIPortraitMap` (+0x8d0, `maps/ui/hero_prefabs/inferno.vmap`) with `portrait_camera`.
   - TeamReveal loads `m_strUITeamRevealMap` (+0x8e0) with `point_camera`.
   - PostGamePortrait loads `m_strUIPostgamePortraitMap` (+0x8e8) with `portrait_camera`.
   - The offsets come from the schema field tables.

   I chose **Shop**. It is the stock in-HUD style (`citadel_hud_hero_shop.xml:69`). `inferno_shop.vpk` (18 KB) holds only the hero prop (`[PR#]hero_root`, inferno_v4 model), a key light, a rim light, a post-processing volume and `point_camera`. Its precomputed bounds put the hero at z 24–130, with the camera at z 58, about 123 units away, pitch −3.6°.

   I could not decode the camera FOV from the KV3 lump, so the frame is unverified. The engine exposes no head screen position: there is no attribute, JS property or bone query on this class. The anchor is therefore a fixed constant, `HEAD_TOP_Y = 80` stage px in `hp_colors_v3_preview.js` (marked `ponytail:`). I estimated it from the bounds above with a 90° FOV.
3. **Escape-menu context (inference).** The menu is HUD context, and stock already renders this class there (the shop). The prior-art HUD panels did too. Rendering inside the Escape menu specifically is still unproven until the live check.
4. **Hidden = collapsed.** `.HPC3PreviewHeroModel` defaults to `visibility: collapse`. Only `.HPC3Open .HPC3PreviewKindHero .HPC3PreviewHeroModel` is visible. `HPC3Open` is the menu's existing open class, and `HPC3PreviewKindHero` is the pane's existing kind class. Stock hides its hero scenes the same way (`dashboard.css` `#HeroScenePanel`, and the shop's `.gBrowsingBuilds`). That collapsed panels are not painted is a Panorama rule. Whether the scene *map load* waits for the first visible layout is not proven: the load runs from the dirty update path at `0x1d64be0`, and I did not prove its caller.
5. **Cost when visible (not measured).** One hero model, two lights and a post-processing volume, rendered into a 284×326 px panel. The panel is static and has no JS, events or per-tick work. The VM test asserts zero style writes and no events on it.

## Design

- **Layout** (`tools/menu-layout.js`): the stage holds `CitadelHeroScenePanelNew#HPColorsPreviewHeroModel` first, so it draws behind. The new `HPColorsPreviewHeadAnchor` wraps the existing scale/canvas tree. The layout attributes are `heroname="hero_inferno" heroscenestyle="Shop" hittest="false"`.
- **CSS:** the HERO stage is 328 px tall. That takes the 48 px the collapsed kind segment frees on the Bar page, so the controls below do not move. The model fills the stage.
- **JS** (`camera()` only):
  - For HERO, the camera region is the head anchor (height `HEAD_TOP_Y`). The bar box (name/pickups above, HP text below) is fitted into it and bottom-aligned 8 px above the head top. The default zoom is now 63% (it was 168%).
  - Unit kinds keep the old centred full-stage camera (anchor height 278 px).
  - The anchor height is written only when it changes.
  - The hero name is now "Infernus" on both sides, to match the model.
- No settings, slots, codecs or saves changed.

## Evidence

- Red first: the three new `ticket 22c` tests in `tests/preview.test.js`, plus the updated camera-fit and names tests, failed 5/5 before the change.
  - The model panel is unique, with `heroname=hero_inferno` and `heroscenestyle=Shop`. It sits in the stage behind the anchor and gets no style writes or events through play, side and page changes.
  - It is visible only for HERO with the menu open. It is collapsed for NPC, neutral and objective, at boot, and after closing.
  - The bar box sits inside the head anchor with its bottom 8 px above the head top, for default, widest and tallest bars. Unit kinds keep a 278 px anchor.
- The camera-number assertions (63% zoom, badge 12.6 px) were updated on purpose.
- v3: `node --test tests/*.test.js`: 932/932 pass. `generate.js --check` is current; 590 rules, max 10 selectors. The renderer ops-ceiling tests are unchanged and pass.
- QOLLOCK: `qollock.js` regenerated, `--check` current, lane tests 24/24.
- Builds (`-SkipDeploy`, SHA-256 of `pak02_dir.vpk`):
  - v3 release `de05688ccddfeafe5f688117dca2ef1e141b0c71336ebed0bc7e6a54697efeab`
  - v3 debug `6d74b9b21d6adaa7ff0badc6a7c7b3104debf3588d68a083828deb0892a828c8`
  - QOLLOCK release `3dcf2b6ed104cd78eb1da0e7412364596293d1e9bf0fde9fadce81a512d11ffc`
  - QOLLOCK debug: pending. The wrapper cannot remove `.build\debug` because the user's terminal (pid 5992) has its working directory there.

## Live check needed

- **Rendering in the Escape menu:** does the Shop scene load and draw at all? Are there console errors?
- **Framing:** is the full body visible in the 284×326 stage, or is it cropped?
- **Head alignment:** retune `HEAD_TOP_Y` (default 80) until the HP text sits on Infernus's head. If the head is very high or low, a CSS `margin-top` on `.HPC3PreviewHeroModel` is the second knob.
- **Cost:** check that the menu stays responsive with the model visible, and that the scene stops while the menu is closed or on the Units page.

## Audit (m3)

**Verdict: blocking — one reproduced camera regression.** Native rendering/head alignment and scene cost still require the already-listed live acceptance check. Audit was read-only except for this appendix; no builds, deployment, game launch or git writes.

### Findings by severity

1. **P2 — valid vertical offsets can move the HERO bar completely outside the clipped preview.** `panorama/scripts/hp_colors_v3_preview.js:179-187` reduces the fitting region to 80 px but retains the 0.4 minimum zoom (`:48`). The supported `barOffsetY` range is -210..210 (`settings/schema.json:19`). Booting the real layout/scripts with the existing layout adapter and setting enemy `barOffsetY=-210` produces zoom 0.4 and canvas margin-top 72.8 px: the default-height bar spans approximately **y=-28.16..-22.40**, entirely above the stage's `overflow: clip` (`panorama/styles/hp_colors_v3_menu.css:246-249`). This is not merely an unverified model-head position. The new tests exercise width/height, not offset extremes (`tests/preview.test.js:850-873,1469-1491`). **Fix:** make fitting feasible for the smaller HERO region (for example, allow its required lower zoom or explicitly handle insufficient headroom without clipping the bar); add real-script regression cases for both offset endpoints, combined with maximum height, and preserve the head-attachment requirement.

2. **P3 — the new visibility test proves CSS state, not scene rendering suspension or zero hidden cost.** `tests/preview.test.js:1451-1466` calls the synthetic `computed(..., 'visibility')` helper; `:1443-1448` proves no model style writes/events, not absence of native scene work. The static panel exists at layout load (`tools/menu-layout.js:178`) and its attributes dirty the native scene. The ticket correctly admits that deferred loading and cost were not established (`:54-57`), but the checked acceptance item at `:15` and “renders only” test title overstate that evidence. **Fix:** describe this as “collapsed when closed/non-HERO,” leave zero-cost acceptance unverified, and measure/trace native scene update/render activity when visible, collapsed, and before first opening. Do not add an unproven JS workaround merely to satisfy the wording.

3. **P3 — the requested blanket CSS policy is not currently true, although 22c's added rules comply.** `panorama/styles/hp_colors_v3_menu.css:464-465` transitions `pre-transform-scale2d, transform`, not only opacity. The generated stock sheet also retains those transitions (`panorama/styles/unit_status_v2.css:40`) and `box-shadow` (`:723,735`); the latter are stock-derived (`vendor/unit_status_v2.css:759,771`), not new model styling. `tools/generate.js:279-319` guards selector limits and masks, but not these properties. **Fix:** resolve the existing stock/play-animation exceptions explicitly, or replace/remove the disallowed declarations in the owned source/generator while preserving animation behavior; then add the corresponding guard. Do not classify these inherited declarations as newly copied 22c code.

### Independent RE verification (ClientVersion 6785)

- Target: installed `game/citadel/bin/win64/client.dll`; `steam.inf` reports 6785, SourceRevision 11132425. SHA-256: `fadaf78301af6d47d286de6199d1fd0aba7053f6ab597afa3de55369f72424c6`. Static byte reads and Capstone disassembly only; every file read closed immediately, the PE object was closed, and no IDA/debugger process or DLL mapping was opened.
- **Confirmed:** `heroname`/`heroid` are the class's hero-selection attributes. Registration at RVA `0x1db4d0` names `CitadelHeroScenePanelNew` and its constructor `0x1d5ca40`; that constructor installs vtable `0x2c061d8`, whose slots 27/57 point to the observed setter/update functions. Attribute storage at `0x3373610/0x3373630/0x3373650` identifies `heroname`, `heroid`, `heroscenestyle`. Setter `0x1d5aea0` resolves the name through `0x76b510`, or parses the ID, into panel +0xf0; style goes into +0xf4, and changes dirty +0x110. Other attributes delegate to the base scene handler. The nearby `hero` string is used as the spawned entity's `host_name` at `0x1d65580-0x1d655ac`, not this class's hero-selection attribute. Thus the static declaration at `tools/menu-layout.js:178` needs no JS setter.
- **Confirmed, with qualification:** given a selected hero, `heroscenestyle` chooses its VData map and the camera; explicit XML map/camera are unnecessary and are replaced on this dirty update path. Enum table `0x2c05740` maps Shop/Portrait/TeamReveal/Profile/PostGamePortrait/HeroReveal to 0..5. Update `0x1d653a0`, switch `0x1d65406-0x1d654a3`, and jump table `0x1d657a0` select Shop/Profile = +0x8d8 + `point_camera`; Portrait/HeroReveal = +0x8d0 + `portrait_camera`; TeamReveal = +0x8e0 + `point_camera`; PostGamePortrait = +0x8e8 + `portrait_camera`. Current schema declarations independently identify those four VData fields. “Style alone” does not mean hero identity is optional, nor does it prove FOV/framing/head position.
- Stock corroboration: `.scratch/stock_6774/panorama/layout/citadel_hud_hero_shop.xml:69` uses `CitadelHeroScenePanelNew` with `heroscenestyle="Shop"` and no map/camera, while `citadel_hero_spotlight.xml:9` uses Portrait. These corroborate engine usage, not successful rendering in this Escape-menu layout. The 6782 RVAs above must not be reused as 6785 addresses.

### Behavior, cost and regression coverage

- **Hidden state passes:** model CSS defaults collapsed and becomes visible only under both open-menu and HERO classes (`panorama/styles/hp_colors_v3_menu.css:256-257`). Real-script tests cover boot, open/close/reopen and all non-HERO kinds. Native offscreen rendering/loading cost remains **inferred/unmeasured**, not a consequence of the VM result.
- **No new per-tick JS:** the model is absent from runtime lookup/binding tables (`panorama/scripts/hp_colors_v3_preview.js:7-29`); it has static XML attributes. Existing preview work remains bounded play steps at 0.45 s and layout-settle jobs, with close/retire cancellation (`:264-310,378-402`). The existing renderer operation ceilings pass; they measure JS/panel operations, not GPU work from the native model.
- **Zoom:** 63% follows mathematically from the 80 px head region minus 16 px padding, divided by the default 101.2 px content box (`panorama/scripts/hp_colors_v3_preview.js:174-181`). It is therefore an intentional framing change rather than an accidental constant replacement. The reference has a small bar above a full-body hero, but the assumed head position and resulting readability have not been validated in-game. The offset-floor regression above is independent of that visual judgment. Unit kinds retain the 278 px camera region.
- **Controls/state:** focused tests pass for HP slider, play/stop, side/kind/page changes and camera fitting in their covered ranges. An additional real-script probe switched sides/kinds, changed HP and completed play: published settings were byte-for-byte unchanged. “Infernus” is preview-only display data (`panorama/scripts/hp_colors_v3_preview.js:32-33,259`; `tools/menu-layout.js:205`), with no new schema/codec/storage slot. Codec and storage tests pass.
- **QOLLOCK:** generated panel/anchor match the canonical structure (`panorama/layout/hud_escape_menu.xml:2233-2234`; `../hp_colors_rewrite_v3_qollock/panorama/layout/hud_escape_menu.xml:2314-2315`). Both lane test files and the stale-layout/composition guards pass.
- **CSS:** generator check reports 3 stylesheets, 590 rules, maximum 10 selectors. No `opacity-mask: none` or `clip-path` declarations were found. New model rules add no transitions or shadows; inherited exceptions are listed above.
- **Test quality:** the new cases boot the actual generated layout and scripts and assert tree/state changes, rather than matching JS source text. The adapter is deliberately not a renderer/font rasterizer (`tests/preview-layout.js:5-6`); the head-fit case restates the assumed bar-box geometry and cannot validate the actual 3D head. Missing offset coverage is the concrete regression hole.
- **No copied implementation found:** compared the model layout/CSS/runtime with `3d hud/panorama/layout/hud.xml:318-344`, `styles/3d_hud.css:1-45`, and `scripts/3d_hero_dynamic.js:1114-1242`. The prior art uses Portrait, redundant identity/map/camera attributes, per-hero static panels, dynamic selection and inline visibility writes; 22c instead uses one Shop panel, `heroname`, and menu/kind CSS gates. No substantive shared consecutive JS or owned-menu CSS blocks were found. A few generic declarations shared by stock-derived styles are not evidence of copying this feature.

### Checks actually run

- `node --test` over v3 `preview`, `renderer`, `generator`, `codec`, `storage` tests plus both QOLLOCK test files: **447 passed, 0 failed**, including operation-ceiling and lane guards.
- `node hp_colors_rewrite_v3/tools/generate.js --check`: **12 outputs current**; stylesheet guard passed.
- `node hp_colors_rewrite_v3_qollock/tools/qollock.js --check`: **2 outputs current**.
- In-memory real-layout/script probes reproduced the negative-offset clipping and unchanged published settings; no regression test file was added under this read-only assignment.
- The context-mode test request timed out at the transport boundary; its completed indexed result was recovered and confirmed exit 0, rather than rerunning or treating the timeout as success. No build results or live-game acceptance are claimed by this audit.

## Fixes after audit

1. **P2 offset clipping: fixed.** I picked the simplest option. `camera()` keeps the head-anchor fit only when the bar box fits above the head at or above `MIN_ZOOM`. Otherwise the HERO preview falls back to the centred full-stage camera that unit kinds use, so the anchor becomes 278 px. Large offsets or heights then leave the head, which is expected because the user moved the bar there. At the default size the head fit holds up to a total box height of about 160 canvas px.
   - Red first: the new test `ticket 22c audit: HERO bar stays inside the clipped stage across the full schema offset range on both axes` boots the real layout and scripts with the layout model. It drives `barOffsetX` to -200 and 200 and `barOffsetY` to -210 and 210; those are the schema bounds, and X is ±200, not ±210.
   - For each value it asserts that the renderer translated the bar by the offset, and that the painted bar rectangle lies inside the 284×326 stage.
   - Before the fix it failed at `Y=-210` (top -28.16, bottom -22.40), which reproduced the audit.
2. **P3 overstated wording: fixed.** The test is renamed to `the model is collapsed when the menu is closed or the kind is not HERO`, and it carries a CSS-state-only comment. The acceptance checkbox is split: "collapsed" is checked, and "no native scene cost while collapsed" stays open as **unverified (live)**.
3. **P3 CSS policy: noted as known exceptions, unchanged.** Both predate 22c, and 22c adds no transitions or shadows:
   - The stock-derived `unit_status_v2.css` transitions (`:40`) and `box-shadow` (`:723,735`, from `vendor/unit_status_v2.css:759,771`).
   - The existing play-animation `transition: pre-transform-scale2d, transform` in `hp_colors_v3_menu.css`.

**Checks after the fixes:**
- v3 `node --test tests/*.test.js`: 933/933 pass.
- `generate.js --check`: current.
- QOLLOCK `qollock.js --check`: current; lane tests 24/24.
- Rebuilt with `-SkipDeploy` (SHA-256 of `pak02_dir.vpk`):
  - v3 release `e7bb39f9dcd74766107ddf66da3844c87dd1dc945fbcd4c83737a9630b0332db`
  - v3 debug `419fd47934b1ed01b48591887983e028b07ba5637fe010a4c40213461287e5d0`
  - QOLLOCK release `73c82a6804259b2f8609bc0300442d349a40be7a8df22cdcb014c8f6951c4535`
  - QOLLOCK debug: skipped, because the user's terminal still holds `.build\debug`.
- No RE was done for these fixes.

## Live check 1 (failed)

**What the user saw (Main, 2026-10-15):**
- The preview showed an empty dark stage with the tiny bar at the top.
- The Panorama debugger showed the panel present and visible: the `.HPC3Open .HPC3PreviewKindHero` rule won.
- The debugger serialized the panel as `camera="default_camera"`, the base scene default.
- `console.log` had no scene, map or resource errors.

**Conclusion:** static `heroname` + `heroscenestyle` alone did not trigger the style-driven map/camera load in this context. Prior art (`3d hud/panorama/layout/hud.xml:318-344`, not copied) sets the base scene's `map` and `camera` explicitly, and it renders.

**Fix: shop pose, user choice.** The panel now carries:
- `heroname="hero_inferno"`
- `heroscenestyle="Shop"`
- `map="maps/ui/hero_shop/inferno_shop.vmap"` (Inferno's `m_strUIShoppingMap`)
- `camera="point_camera"` (the Shop camera; m3's 6785 RE)

The explicit map/camera agree with what the Shop style would load. TeamReveal was not used, by the user's decision.

**`drawbackground`: not added.** No DLL in `game/bin/win64` or `game/citadel/bin/win64` contains that string. The search was a read-only `grep`, and every file was closed afterwards. There is no evidence the attribute exists.

**Debug-only diagnostic.** One `// HPV3_DEBUG` line in `hp_colors_v3_preview.js` `paint()` logs the model's attributes once, the first time the HERO preview paints with the menu open:

`[HPV3] preview model heroname=… heroscenestyle=… map=… camera=…`

It reads them with `GetAttributeString`, and prints `(missing)` if the panel or the method is absent. Release staging strips the line. The next live run shows what the engine saw.

**Tests:**
- `preview.test.js` pins `map` and `camera`.
- New `logging.test.js` case `ticket 22c live 1`: with debug staging, the line is logged exactly once with the expected values, and never while the menu is closed. It failed red before the change.
- v3: 934/934 pass. QOLLOCK lane: 24/24 pass.
- `generate.js --check` and `qollock.js --check` are current, with QOLLOCK regenerated.

**Builds (`-SkipDeploy`, SHA-256 of `pak02_dir.vpk`):**
- v3 release `c2a8bd03cdbaae5a09fce6a182c3546ce7c6aaf1e650496add45f9695ad638c4`
- v3 debug `45af162e7658506f785617947331183dd7785b668aed5f1badfec3e41e43748c`
- QOLLOCK release `96e7a10d60f37d3ad68d72c11a43dcbcd968a506d325a82fbc5b8691a89b5f21`
- QOLLOCK debug: skipped, because the user's terminal still holds `.build\debug`.

**Next live check:** use the debug build.
- Look for the `[HPV3] preview model` line.
- Check whether the model draws, and whether its framing and `HEAD_TOP_Y` are right.
- If the model still does not draw, the next suspects are scene-panel rendering inside the Escape menu, and whether the panel must be hidden at load and shown later, which the prior art does.

## Animation pose `shop_menu_base` (user requirement)

**No code change: the shop map already defaults to it.**
- `maps/ui/hero_shop/inferno_shop.vpk` → `default_ents.vents_c` (KV3, decompressed): the entity string table for the hero `prop_dynamic` has `StartingAnim` followed by `shop_menu_base`. The neighbours are `IdleAnimationLoopMode`, `StartingAnimationLoopMode` and `use_animgraph`. The same lump has `[PR#]hero_root` with model `models/heroes_staging/inferno_v4/inferno.vmdl`.
- The value really is per map, not a shared default:
  - `shop_menu_base`: abrams, chrono, gray_talon, haze, inferno.
  - `primary_stand_idle`: warden, viper and others.
  - `ui_shop`: apollo, necro and others.
- Reading the key/value pairing from string-table order is an inference; it is consistent across 44 shop maps.
- `client.dll` 6785 contains the entity key string `StartingAnim`.

**No static XML attribute for the pose.**
- Checked `client.dll` 6785 and `panorama.dll` for `SetAnimgraphParameter`, `SetActivity`, `GetSequence`, `initial_animation` and `shop_menu_base`. None of them exists as a panel attribute or JS method.
- Stock 6774 layouts and scripts never set a scene pose.

**JS can set the pose but not read it.** The only scene-panel entity hook is `CGame_UI_ScenePanel::FireEntityInput(entity, input, value)`. That makes `CDynamicProp` `SetAnimation*` inputs reachable. There is no getter for the current sequence, so the debug log cannot print the pose. It prints `map`, and that map implies `StartingAnim=shop_menu_base`.

**Fallback, only if live shows a different pose:** make one call when the HERO preview first shows: `FireEntityInput(<hero prop>, "SetAnimationLooping", "shop_menu_base")`. The prop's runtime name is unproven: the lump stores `[PR#]hero_root`, which is prefab-prefixed. Verify it live before using it.

**Files and processes:** the RE was read-only Python reads in `with` blocks, and the buffers were freed. No IDA or debugger was used; the `Source2Viewer.exe` that was already running was left untouched.

## Live check 2 (failed)

**What the user saw (Main, 2026-10-15 11:54-11:55):**
- Debug build `45af162e` still drew no model.
- `console.log` had only `[HPV3] preview model heroname=(unset) heroscenestyle=(unset) map=(unset) camera=(unset)`. The panel consumes these attributes, so `GetAttributeString` cannot read them back and that log carried no information. It has been removed.
- There was no scene, map or `hero_shop` load line, and no errors.

**Next build: a debug-only diagnostic strip.** Release builds are unchanged.

The repo had no debug-only layout mechanism. I added `tools/debug-model-strip.js`, which runs only from `build_hp_colors_rewrite_v3.ps1 -Debug`. It edits the staged copy of `hud_escape_menu.xml`, never the source layout and never the QOLLOCK lane. It inserts four static panels after `HPColorsPreviewHeroModel`, because the `3d hud` notes say static scene panels were more reliable than dynamic ones. They use `HPV3Debug*` ids, which keeps them out of the generated-id contract.

| Variant | id | Size and outline | Attributes | Gate |
|---|---|---|---|---|
| main | `HPColorsPreviewHeroModel` | full stage | `heroname=hero_inferno` `heroscenestyle=Shop` `map=…/hero_shop/inferno_shop.vmap` `camera=point_camera` | collapse until menu open + HERO |
| A | `HPV3DebugModelVariantA` | 60×120 in a 1 px green frame | same as main | collapse |
| B | `HPV3DebugModelVariantB` | 60×120 + frame | same as main | opacity only, never collapsed |
| C | `HPV3DebugModelVariantC` | 60×120 + frame | `heroname` `heroid=1` `heroscenestyle=Portrait` `map=maps/ui/hero_prefabs/inferno.vmap` `camera=portrait_camera` `renderdeferred=true` `antialias=false` `rendershadows=false` `rotate=None` | collapse; the prior art starts collapsed too |
| D | `HPV3DebugModelVariantD` | 60×120 + frame | shop map + `point_camera` + `heroscenestyle=Shop` `heroid=1` + C's render attributes | opacity only |

- The strip and its labels gate on opacity only, at the bottom of the HERO stage.
- **B limitation:** its ancestor `HPC3Root` is collapsed whenever the menu is closed. So B gets layout from the first menu open, not from load. The difference between A and B is only whether the panel itself is collapsed.
- The source and release layouts carry only the CSS classes, never the panels.

**Debug-only API dump.** One `// HPV3_DEBUG` line in `paint()` runs once, the first time the HERO preview is open and laid out. It logs:
- `[HPV3] preview model main=<paneltype> <actuallayoutwidth>x<actuallayoutheight> visible=<IsVisible()>`, plus one `variant A..D=` line each.
- `[HPV3] preview model api N: …`, 40 names per line: the main panel's `for..in` keys and `Object.getOwnPropertyNames` over up to 8 prototype levels, with each step guarded.

This shows whether a JS hero, map or animation setter exists, such as `SetScenePanelToLocalHero`, `FireEntityInput` or `SetHeroID`.

**Tests:**
- A new `logging.test.js` case `ticket 22c live 2` stages debug scripts and injects the strip into a temp copy. It checks:
  - The strip injects once, and the tool refuses a second injection.
  - The source layout stays clean.
  - Each variant has its attributes and gate.
  - The model dump logs nothing while the menu is closed, then exactly one main line, four variant lines and API lines.
  - The attribute read-back is gone.
- `preview.test.js` ignores `HPV3Debug*` panels, so the staged debug suite still passes. I also simulated the debug stage locally: 934 run, 933 pass, 0 fail, 1 skip.

**Checks:**
- Source v3: 934/934 pass. QOLLOCK lane: 24/24 pass.
- `generate.js --check`: current; 600 rules, max 10 selectors.
- `qollock.js --check`: current.

**Build:**
- v3 debug (`-SkipDeploy`) `pak02_dir.vpk` SHA-256 `22c11c900923ea241a6f1c8769ce8acdc36668a92cf343746d482b9d42dfc921`.
- Decompiling its compiled `hud_escape_menu.vxml_c` with Source2Viewer-CLI shows `HPV3DebugModelStrip` and variants A–D. There are four Shop/`point_camera`/shop-map panels (main, A, B, D) and one Portrait/`portrait_camera`/prefab-map panel (C).
- The release vpk has no `HPV3Debug` ids.
- Release and QOLLOCK were not rebuilt; no shipped release content changed apart from the dormant CSS classes.

**What the next live run should report:**
- Which variants draw.
- The `[HPV3] preview model` lines in `console.log`.

## Live check 3

**Evidence:**
- The debug build `22c11c90` log showed real layout for every panel: main 236×271, A–D 50×100 each.
- `IsVisible` printed `?`, so JS does not expose it.
- The API dump listed `heroid` as a JS property, plus `FireEntityInput`, `SetAG2ControlParameter*`, `LerpToCameraEntity`, `RegisterForReadyEvents`, `BReadyForDisplay` and `SetReadyForDisplay`.
- User screenshot `D:\steam\userdata\215334735\760\remote\1422450\screenshots\20261015120758_1.jpg`:
  - **A** (shop, collapse-gated): empty.
  - **B** (shop, opacity-gated): empty.
  - **C** (`3d hud`-style Portrait set): Infernus on an orange portrait backdrop.
  - **D** (shop map + `point_camera` + `heroid="1"` + render attributes): Infernus in the shop pose, darker.
  - The main panel was empty.
- A collapsed-then-shown panel therefore works (C), and the missing piece is in D's extra attributes.

**Fix (static XML, no JS):**
- The main panel now carries D's full set, shop pose (user choice): `heroname="hero_inferno" heroid="1" heroscenestyle="Shop" map="maps/ui/hero_shop/inferno_shop.vmap" camera="point_camera" renderdeferred="true" antialias="false" rendershadows="false" rotate="None" hittest="false"`.
- CSS collapse gating and `HEAD_TOP_Y = 80` are unchanged. The user judges head alignment.
- A JS `heroid = 1` write was drafted, but it was dropped before any build once the XML route was proven.

**Presumed key attribute: `heroid` (inference).**
- `heroname` alone failed. The 6782 setter resolves `heroname` through a VData name lookup that returns 0 on a miss (`0x76b4f0`). `heroid` stores the integer directly into the same slot.
- Not proven: the render attributes may also matter.
- I could not settle this offline without another live look, so the full set stays.

**Debug strip E–H** (replaces A–D; debug builds only):
- Each variant is the main panel's attribute set minus one group. `tools/debug-model-strip.js` reads that set from the generated main line, so the variants cannot drift from it.
- **E** has no `heroid`. **F** has no `renderdeferred`. **G** has no `antialias`/`rendershadows`. **H** has no `rotate`.
- All four are collapse-gated like the main panel, 60×120 in a 1 px frame, and labelled.
- The debug log is trimmed to one line, once, on the first laid-out HERO show: `[HPV3] preview model sizes: main=WxH E=… F=… G=… H=…`. The API dump is gone.

**Tests:**
- `preview.test.js` pins all of D's attributes on the main panel.
- `logging.test.js` `ticket 22c live 3`: each of E–H is exactly the main set minus its group, A–D are gone, the source layout stays clean, and the debug log is exactly one size line.
- v3: 934/934 pass. QOLLOCK lane: 24/24 pass. Both `--check`s are current, with QOLLOCK regenerated.

**Builds (`-SkipDeploy`, SHA-256 of `pak02_dir.vpk`):**
- v3 debug, with the E–H strip: `c70eb8ba9c3fe738c26154744155cabe9538a655c53e3f191dc83cd5b2a8b29f`
- v3 release: `8d162858add69f1eb02b8e798681e741381268dc0297371518c968c80f4a64c1`
- QOLLOCK release: `c8d6a29cd9337851c5ce520dbdb4fb823b3d19f56be1122423ffaa2cfec621d5`

**Next live check:**
- Does the main panel draw Infernus in the shop pose?
- Is the bar over his head (`HEAD_TOP_Y`)?
- Which of E–H stay empty? That identifies the required attribute(s).

## Live check 4 (passed)

**Evidence:**
- User screenshot: `D:\steam\userdata\215334735\760\remote\1422450\screenshots\20261015121847_1.jpg`.
- Crop: `.scratch/hpv3_live1/22c_live4_crop.png`.
- **Main panel:** it renders Infernus in the waving shop pose, with sunglasses, flaming hair and the red hat.
- **Head alignment:** the bar sits just above his head and the HP text lands on the hat, so `HEAD_TOP_Y = 80` was right for the full-body framing.
- **Minus-one-attribute strip:**
  - **E** (no `heroid`): empty.
  - **F** (no `renderdeferred`): renders.
  - **G** (no `antialias`/`rendershadows`): renders.
  - **H** (no `rotate`): renders.

**Conclusion:**
- **`heroid="1"` is the key attribute, proven live.** `heroname` alone does not select the hero in this context.
- The render attributes are individually optional. The main line stays exactly as tested: `antialias`/`rendershadows` off is cheaper, and this combination is the one seen working.

**Cleanup:** the debug-only diagnostics are gone:
- `tools/debug-model-strip.js` and its `-Debug` hook in `build_hp_colors_rewrite_v3.ps1`.
- The strip and variant CSS.
- The live 2/3 logging tests and the `HPV3Debug` test filters.
- The debug size log.

Nothing debug-only remains for 22c. Native scene cost while collapsed stays **unverified**.

## Bust framing

**Request:** user, 2026-10-15: head to shoulders only, cutting everything from below the shoulders down to the toes.

**Status:** **unverified live.**

**Approach: static CSS, no JS, no transform.**
- `.HPC3PreviewHeroModel` is `784×900px`, with `margin-left: -250px` and `margin-top: -79px`. The stage's existing `overflow: clip` crops the rest.
- The camera stays the shop `point_camera`.
- The panel keeps the stage's 284×326 aspect, so the camera image should only scale (×2.76) and not reframe. This is an inference: if the engine adapts its FOV to the panel size, the result will differ.

**Measurement from the live-4 crop (full-body framing):** the hat top sits at about 21% of the panel height and the shoulders at about 45%. With the new geometry:
- 0.45 × 900 − 79 = 326, so the shoulders land on the stage bottom.
- 0.21 × 900 − 79 = 110, the new hat top.
- The figure stays horizontally centred.

**Bar:** `HEAD_TOP_Y` changed from 80 to 110, marked `ponytail:`. The tuning lives in two places, both marked `ponytail:`: the CSS rule (size and margins) and `HEAD_TOP_Y`. The new test ties them together.
- At the default bar size the HERO camera zoom is 93% (was 63%).
- The large-offset fallback to the full-stage camera is unchanged.

**Cost (inference):** the scene renders the whole 784×900 panel, about 7.6× the stage's pixels, while only the stage shows. It is visible only on the HERO preview with the menu open. If this is too heavy, a smaller zoom or a closer camera map would be the alternatives.

**Tests:**
- New `ticket 22c bust`. It checks:
  - The model keeps the stage aspect and is more than 2× wider than the stage.
  - It is centred, and the stage clips it.
  - The shoulders (45%) land at the stage bottom.
  - The hat top (21%) is within 2 px of the head anchor `HEAD_TOP_Y`.
  - It gets no transform and no JS style writes.
- The camera-zoom pins were updated: 93%, badge 18.6 px.
- v3: 934/934 pass. QOLLOCK lane: 24/24 pass. Both `--check`s are current.

**Live check needed:**
- Does the crop show head to shoulders?
- Does the image scale rather than reframe?
- Does the HP text still sit on the hat?
- Retune the CSS rule together with `HEAD_TOP_Y`.

**Builds (`-SkipDeploy`, SHA-256 of `pak02_dir.vpk`):**
- v3 release: `f3f170ca040381526ebb861706c7026c06ddd0cbbbf764ced8039503a58baf89`
- v3 debug: `661ea2fe388e8cceeda28b563bade52a2c23d31fe76eac5b15e85566320f9566`. It contains no `HPV3Debug` strip.
- QOLLOCK release: `e4153b616e78d0e0c1303908c965cebc988ccbed011d92d1355dd94795f87442`

## Live check 5 (overflow)

**Evidence (Main, 2026-10-15):**
- Screenshots: `.scratch/hpv3_live1/22c_live5_bust_overflow.jpg` and the in-game reference `.scratch/hpv3_live1/22c_ingame_reference.jpg`.
- The bust framing inside the stage was about right.
- The oversized 784×900 scene panel drew **outside the stage**: legs and arm over HEALTH, the slider, PLAY and the note, and past the menu's right edge. A scene render ignores its parent's `overflow: clip`, although z-order still works.
- The preview bar was too small: about 1.4 head heights wide, against the reference's 3.3. The reference also has the bar bottom about 1.1 head heights above the hat top, the name above the bar, and the HP number below the bar's right end.

**Camera candidates checked offline:**
- *Closer camera entity: none exists.* `inferno_shop.vpk` `default_ents` has one camera, `point_camera`: origin `104.7 83.3 58.0`, angles `-3.6 220.7 0`. The portrait map `hero_prefabs/inferno.vpk` also has a single `point_camera`, under `[PR#]root`. So `camera="…"` and `LerpToCameraEntity` have nothing closer to switch to. These were file reads.
- *Camera FOV:* `client.dll` 6785 has `CPointCamera_API::ChangeFOV`, so a `FireEntityInput(…, "ChangeFOV", …)` might work. It would zoom about the camera axis, which sits at hip height (z 58, pitch −3.6°, hero z 24–130). It would show the waist, not a bust, so it is ruled out without a camera offset.
- *Scene-panel camera attributes:* none found. Near `LerpToCameraEntity`, the strings are `FireEntityInput`, `PlayEntitySoundEvent`, `SetCustomPostProcessMaterial`, `SetAG2ControlParameter*`, `default_camera` and `start_disabled`. There is no `fov`, `cameraorigin` or `lookat` attribute. This was read-only string scanning; the files were closed, and no IDA or debugger was used.

**Main fix: render to a texture inside a clipped box (best candidate, unverified live).**
- `HPColorsPreviewHeroModel` is stage-sized again (100%) and never moved.
- A new normal panel `HPColorsPreviewHeroBust` sits over it. It has an opaque `#131812` base, `background-image: url("panel://HPColorsPreviewHeroModel")`, `no-repeat`, `background-size: 596px 685px` (×2.1, stage aspect) and `background-position: -156px 12px`.
- A background is drawn inside its own panel box, so nothing can spill. Stock `citadel_hero_spotlight.css` `#HeroScenePanelBlur` uses `url("panel://HeroScenePanel")` the same way.
- The scene now renders only stage-sized pixels; the 7.6× cost is gone.
- Expected drawback: the zoomed render is upscaled ×2.1, so it may look soft.
- Both panels use the same collapse gate.

**Bar proportions:**
- `HEAD_TOP_Y` is now 156, matching the bust's hat top. The head is about 78 px tall (21–32.4% of the 685 px render).
- Outside Indicators, the HERO camera box now tops out at the name (`NAME_ABOVE = 18` canvas px) instead of the pickups/stamina room. The box is centred in the region above the head.
- At the default settings:
  - zoom 168%
  - bar span (level badge to last box) ≈ 3.2 heads
  - bar bottom ≈ 0.9 heads above the hat
  - name inside the stage
  - HP text above the hat
- **Indicators** keeps the full accessory box, so pickups and stamina stay visible (zoom is lower there).
- The tuning lives in `HEAD_TOP_Y` and `NAME_ABOVE` (JS) and the bust background rule (CSS), all marked `ponytail:`.

**Debug-only strip I/J/K** (`tools/debug-model-strip.js`, re-added for this check, `-Debug` builds only). Each variant is a labelled 60×120 cell with the main scene attributes:
- **I clip-rect:** an oversized scene panel cropped by its own CSS `clip: rect(...)`, in a noclip frame.
- **J wrapper:** an oversized scene panel in a frame with `overflow: clip`. This is the control: it is expected to spill, as the stage did.
- **K panel-bg:** a cell-sized scene panel under a panel showing `url("panel://…")` zoomed. This is the main approach at small size.

**Tests:**
- New `ticket 22c live 5` tests cover:
  - Scene panel stage-sized and unmoved.
  - Bust panel order and background.
  - Aspect, centring, shoulders at the stage bottom, and the hat at `HEAD_TOP_Y`.
  - Gating and no JS writes.
  - Reference ratios: span 2.6–3.5 heads, gap 0.7–1.3 heads, name inside, HP text above the hat, badges inside.
  - Indicators keeps pickups in view.
  - The strip variants carry the main attributes.
- Updated pins: the 168% camera, the 33.6 px badge, 200% at master off, the fit test and the centred head box.
- v3: 936/936 pass, and the debug-staged simulation passes 935 with 1 skip. QOLLOCK lane: 24/24 pass. Both `--check`s are current, with QOLLOCK regenerated.

**Live check needed:**
- Does the bust stay inside the stage?
- Which of I/J/K stays clipped?
- How soft is the zoomed render?
- How does the bar sit over the head?

**Builds (`-SkipDeploy`, SHA-256 of `pak02_dir.vpk`):**
- v3 debug, with strip I/J/K: `07fc76438e5a665de48e0c6de5a71a4700388ab5eec447072d9175abaf2f7972`
- v3 release: `5cc2b11929f9fd57abbdb1220618c7a1ecb6526fc51522895a337933fe740e89`
- QOLLOCK release: `90a586aec52f76fc03a3bc7eb72efc918aaec1464add96129dcf68fcaa617d27`

Decompiling the compiled layouts shows that debug has the strip plus `HPColorsPreviewHeroBust`, and release has only the bust panel.

## Live check 6

**What the user saw:** screenshot `.scratch/hpv3_live1/22c_live6_nomodel.jpg`; the user said "no player model or the status effect".
- **No model.** The `url("panel://HPColorsPreviewHeroModel")` background drew nothing, so only the bust panel's opaque `#131812` base showed. The `panel://` approach is live-proven blank and has been removed.
- The I/J/K strip was not visible, probably because the opaque stage-sized bust panel covered it.
- **Status row clipped.** At 168% the status/pickup circles were cut off at the stage top.

**Main fix: variant I, the scene panel crops itself.**
- `HPColorsPreviewHeroModel` keeps the live-proven attribute line. CSS makes it `596×685`, `margin-left -156px`, `margin-top 12px`: the live-5 bust framing, which looked right.
- `clip: rect(0%, 73.83%, 45.84%, 26.17%)` crops it to the 284×326 stage window.
- The bust panel and its CSS are gone. The stale duplicate scene-panel CSS comment is removed.
- Unverified live: whether `clip: rect` crops a scene render. Note that the stage's `overflow: clip` did not.

**Status row: fixed.** The HERO camera keeps the full status/pickup room (`ROOM_ABOVE`) and the name on every page again; `NAME_ABOVE` is gone.
- Default zoom is 138% (was 168%), with `HEAD_TOP_Y` still 156.
- Bar span (badge to last box) ≈ 2.0 head heights, against the reference's 3.3. That is the trade-off for keeping the status row.
- The bar sits ≈ 0.7 heads above the hat, and the HP text stays above the hat.

**Variant M: not added.**
- `client.dll` 6785's scene-panel base attributes next to `rotate` are `yawmin`, `yawmax`, `pitchmin`, `pitchmax`, `yawaxis`, `pitchaxis`, `acceleration` and `rotation_entity_name`, plus `rendershadows`/`pitch` from the handler.
- There is no `fov`, `cameraorigin` or `lookat` scene attribute. `lookat` exists only as an animgraph string.
- This was a read-only string scan; the file was closed.

**Debug strip** (`tools/debug-model-strip.js`, `-Debug` builds only):
- It is appended after the preview note, outside the stage, as the last child of the preview column.
- Four labelled cells, each a 62×62 frame with a 1 px outline. The oversized scene panels are 60×150 and spill only downward, so a spill cannot cover another cell's frame or label.
  - **I clip-rect:** `clip: rect(0, 100%, 40%, 0)` on the scene panel itself.
  - **J wrap-clip:** a wrapper with `overflow: clip`; expected to spill.
  - **L wrap-rect:** `clip: rect` on the wrapper parent.
  - **K2 panel://:** a cell-sized scene panel with a transparent 2× `panel://` copy over it and no opaque base.
- **Reading the result:** a cell that shows only its 62 px frame window is clipped. A cell with Infernus legs below its frame spills. If K2 shows a second, larger head, `panel://` works.

**Tests:**
- `ticket 22c live 6` cases cover:
  - clip-rect geometry: aspect, centring, shoulders at the bottom, hat at `HEAD_TOP_Y`, clip edges matching the stage window, and no transform or JS writes;
  - the status row and name inside the stage on the Bar, HP Text, Name and Indicators pages, with HP text above the hat and the bar ratio in range;
  - the strip placed after the note, with I/J/L/K2 carrying the main attributes.
- Camera pins updated: 138%, 139% at master off, badge 27.6 px.
- v3: 936/936 pass, and the debug-staged simulation passes 935 with 1 skip. QOLLOCK lane: 24/24 pass. Both `--check`s are current, with QOLLOCK regenerated.

**Builds (`-SkipDeploy`, SHA-256 of `pak02_dir.vpk`):**
- v3 debug, with the strip: `a0619b2ff7b9d0f36f6103c14da8c43befaefa8ee88ec1ff26967487cc21054a`
- v3 release: `b8df24c316c831d4f4ae0e5dc2d715d9ec45fc7c5e308e02223fae5a501c2708`
- QOLLOCK release: `558dce99fdbe8d8ba3468594a09c4896df81f8b39dbe647ba9ca853dc4b721f5`
- Decompiled layouts: debug has the strip (I/J/L/K2 + `HPV3DebugModelBustK2`); release has neither the strip nor the bust panel.

## Live check 7

**What Main saw** (debug build `a0619b2f`, screenshot `.scratch/hpv3_live1/22c_live7_self.png`):
- The main panel, with `clip: rect` on the scene panel, still spilled over HEALTH, the slider and PLAY.
- I, J and L all spilled. A scene render ignores `overflow: clip`, and it ignores `clip: rect()` both on itself and on its parent.
- K2 was inconclusive: the cell was too small, and the source sat under the copy.

**Lead (Main, inference):**
- Stock `citadel_hero_spotlight.css:31-93` gives its scene panel `background-color: #00000001`, `opacity-mask` and `opacity-brush`, so scene panels take part in layer compositing.
- Its blur copy uses `url("panel://HeroScenePanel")`, and the layout uses `<Image src="panel://HeroScenePanel">`.
- Hypothesis: `panel://` only has content when the source has its own composition layer, and a layered parent may clip a scene child to its layer bounds.

**Main candidate (unverified live):**
- `HPColorsPreviewHeroModel` now sits inside a new stage-sized `HPColorsPreviewHeroFrame`, which has `overflow: clip`, `background-color: #00000001` and a solid-white `opacity-brush`.
- The scene panel keeps the live-5 bust numbers (596×685, −156/12). Its ignored `clip: rect` is removed.
- No `panel://` on the main panel.
- The status row and 138% zoom are unchanged.

**Debug overlay** (`tools/debug-model-strip.js`, `-Debug` only):
- It is the last child of the editor content column (`HPC3Content`), with `ignore-parent-flow`, `z-index: 100`, a dark backdrop and hittest off.
- It is visible while the menu is open. It covers the settings list in the debug build only.
- Frames are 100×120 with a 1 px outline and a 14 px label. Oversized panels are 200×240, centred, so they spill 50/60 px each way. Cells are 120 px apart, rows 140 px apart.
- **Row 1:**
  - **A1:** `overflow: clip` frame plus `opacity: 0.999`.
  - **A2:** `overflow: clip` frame plus a solid-white `opacity-brush`.
  - **A3:** `overflow: clip` frame plus `background-color: #00000001`.
- **Row 2:**
  - **B1:** an oversized scene panel with its own hard-stop `opacity-brush` (white to 45%, transparent from 45.1%).
  - **C1:** a layered 100×120 source beside an `overflow: clip` frame holding a 2× `<Image src="panel://HPV3DebugModelSourceC1">`.
  - **C2:** a layered source beside a frame with a 2× `background-image: url("panel://HPV3DebugModelSourceC2")` and no base.
- **Reading the result:**
  - A clipped A-cell shows Infernus only inside its frame.
  - B1 working shows only the top 45% of its panel.
  - A working C frame shows a 2× zoomed head and torso next to the full-body source.

**Tests:**
- `ticket 22c live 7`: the frame is stage-sized with clip, the `#00000001` fill and the solid-white brush; the scene panel has no clip and the bust geometry holds; gating; no JS writes.
- `ticket 22c live 7`: the overlay is the last child of `HPC3Content` with hittest off; A1–A3, B1, C1 and C2 have the expected attributes, frame classes and `panel://` sources; the source layout stays clean.
- v3: 936/936 pass, and the debug-staged simulation passes 935 with 1 skip. QOLLOCK lane: 24/24 pass. Both `--check`s are current, with QOLLOCK regenerated.

**Build:**
- v3 debug (`-SkipDeploy`) `pak02_dir.vpk` SHA-256 `2e61b80e55bc94f1baef1d8659aebf85d3aea061b1f9214bc6e89347a32dfa27`.
- The decompiled layout has the overlay (A1–A3, B1, C1 with its Image, C2) and `HPColorsPreviewHeroFrame`.
- v3 release and QOLLOCK release were not rebuilt this round, per Main.

## Live check 8 (passed, Main self-test)

**Run:** Main, on debug build `2e61b80e`. Screenshot `.scratch/hpv3_live1/22c_live8_self.png`.

**Main panel:**
- Infernus stays inside the stage, framed shoulders to head. Nothing spills over HEALTH, the slider or PLAY.
- The status row, arrows, name, bar and HP number all show above the hat.
- The bar is about 2.9 head heights wide and sits about 0.9 head heights above the hat, close to the in-game reference.
- ENEMY, ALLY and the Indicators page (zoomed out) are all fine.

| Variant | Result |
|---|---|
| A1: `overflow: clip` + `opacity: 0.999` | clipped ✓ |
| A2: `overflow: clip` + solid-white `opacity-brush` | clipped ✓ |
| A3: `overflow: clip` + `background-color: #00000001` only | SPILLS ✗ |
| B1: self hard-stop `opacity-brush` | masks ✓ |
| C1: `<Image src="panel://…">` of a layered source | renders ✓ |
| C2: `background-image: url("panel://…")` of a layered source | renders ✓ |

**Learned (Deadlock 6785 Panorama, live 2026-10-15):** a `CitadelHeroScenePanelNew` render ignores scissor clipping: `overflow: clip`, and `clip: rect()` on itself or on a parent. It is clipped only by a parent forced onto its own composition layer, through `opacity` < 1 or an `opacity-brush`; `background-color: #00000001` alone does not force one. Its own `opacity-brush` masks it. `panel://` copies render when the source is layered.

**Finalize:**
- The model wrapper `.HPC3PreviewHeroFrame` keeps `overflow: clip` plus the solid-white `opacity-brush`. `background-color: #00000001` is dropped, because A3 showed it does nothing.
- The CSS comment on that rule records this evidence.
- The debug overlay is removed: `tools/debug-model-strip.js`, its `-Debug` hook in `build_hp_colors_rewrite_v3.ps1`, the overlay CSS and the strip test. Nothing debug-only remains for 22c.
- New guard test `ticket 22c live 8 guard`: the frame's computed style, through the adapter, must keep an `opacity-brush` or `opacity` < 1, plus `overflow: clip`, across kind switches. A mutation check removed the brush, and the guard failed.

**Checks:** v3 936/936 pass. QOLLOCK lane 24/24 pass. Both `--check`s are current, with QOLLOCK regenerated.

**Still unverified:** native scene cost while collapsed.

**Builds (`-SkipDeploy`, SHA-256 of `pak02_dir.vpk`):**
- v3 release: `1d7d8e7420a25a8368bdc906114c085f9ebc0bfbb1aaee5f45598358ead04fc2`
- v3 debug: `92b81f544bbd356a270cc5ded7a5c02aa59458e5f51ed3f35f335cc4ab7d2e3e`
- QOLLOCK release: `8182382a10357a2c3a2909958ea4283dd101565b24aac4cf9be4152830b8b05e`
- QOLLOCK debug: `b1bee44ecd9bc2530763c3fa4fafba082831709a8289942c0a21fd8cb9dc1808`. The terminal lock on its folder has cleared.

None of the four contains `HPV3Debug`.

## Performance (live, Main self-test, 2026-10-15)

**Setup:** installed v3 debug `92b81f54`, `new_player_basics` in hero testing at 1600×900 windowed, uncapped (~400 fps). Raw outputs are in `.scratch/hpv3_perf22c/`.

**Is the scene loaded or drawn?** I captured `sc_listworlds`, `world_dump_loaded_worlds` and `mat_print_materials_last_frame` at each step:

| State | `HPColorsPreviewHeroModel` scene world | `ui\hero_shop\inferno_shop` loaded | `inferno_v4` materials drawn last frame |
|---|---|---|---|
| Boot, menu never opened | 0 objects | no | no |
| Menu open, HERO | 5 objects | yes | yes |
| Menu open, Units page (NPC, model collapsed) | 5 objects | yes | **no** |
| Back to HERO | 5 objects | yes | yes |
| Menu closed after viewing | 0 objects | **no (unloaded)** | no |

So the map loads only on the first HERO show. A collapsed model is not drawn, and closing the menu unloads its map. An empty scene world shell exists from boot.

**Cost while visible:** PresentMon 2.6.0, 15 s windows with 3 s settle, ABBA×2 on the Bar page (HERO). The control was `panorama_disable_render_callbacks true`, which removes only the model (screenshot checked) and leaves the page the same:

| | Frame time avg | GPU time avg | CPU busy avg |
|---|---|---|---|
| Model on | 2.497 ms | 2.091 ms | 2.347 ms |
| Callbacks off | 2.290 ms | 1.762 ms | 2.147 ms |
| Δ | **+0.21 ms** | +0.33 ms | +0.20 ms |

All four pairs have the same sign, and the effect applies only while the Escape menu is open on a HERO preview. At 400 fps that is about 8%. At a typical in-match 110 fps it would be about 2%; that figure is extrapolated, not measured. Bar page against Units page measured +0.38 ms. Subtracting the 0.21 ms model cost leaves about 0.17 ms for the Bar page itself; that split is estimated across the two runs, not measured. No screenshot from the callbacks-off check was kept. Data: `abba_model_on_vs_callbacks_off.json`, `abba_hero_vs_npc.json`.

**Not measured:** the one-off hitch when the map loads on the first HERO show, and memory while it is loaded.

## Audit 2 (m3)

**Verdict: non-blocking for the final 22c model change, with three P3 findings below.** The required hero ID, layered clipping, bust geometry, guard mutation and QOLLOCK parity check out. The camera's vertical fallback works with the final anchor; a combined horizontal extreme still exposes its minimum-zoom limit. No source fixes were made.

**Scope and limits:** reviewed the acceptance list, Live check 8, Performance, layout generator/output, model CSS, preview camera/lifecycle, tests and QOLLOCK composition. Read-only `git diff`, staged diff and scoped `git log` return no comparison: both v3 lanes are entirely untracked. Therefore this is a current-state audit scoped by the ticket, not a verified commit-to-commit diff. Root `AGENTS.md` was read; the requested `hp_colors_rewrite_v3/AGENTS.md` does not exist in this checkout. Tickets 23-26 and pre-22c CSS exceptions were excluded. No build, deployment, game launch, DLL access or git write was performed.

### Findings by severity

1. **P3 — the camera still clips a small part of the bar at combined legal horizontal extremes.** `panorama/scripts/hp_colors_v3_preview.js:184-193` falls back to the full-stage region but still floors zoom at 0.4. A temporary real-script/layout test with enemy width **316**, height **72**, X **200**, Y **210** produces zoom **0.4**, anchor **278px**, and bar bounds **x=163.32..289.72** in the **284px** inner stage: **5.72px** is clipped on the right. These values are legal (`settings/schema.json:16-19`). The existing offset regression test varies offsets at the default width (`tests/preview.test.js:1516-1529`), so it misses this combination. This is a residual minimum-zoom limitation, not evidence that 138% default zoom or the 156px head anchor introduced a regression: a temp-only 80px-anchor control gives the same horizontal failure. That control is not a historical checkout. **Follow-up:** permit fitting below the floor when necessary, or explicitly bound/reposition the camera, and cover combined width/offset extremes. The final vertical fallback itself passed the probes below.

2. **P3 — an active test comment still describes the failed clipping approach.** `tests/preview.test.js:1533-1534` says the oversized scene “now crops itself with clip: rect()” and that a `panel://` background draws nothing. Live check 8 disproved that explanation, and the current test correctly requires *no* scene-panel clip at `:1554`. `panorama/scripts/hp_colors_v3_preview.js:52-53` also still calls out the model's “size/margins/clip.” **Follow-up:** describe the layered parent instead and qualify the old unlayered-copy observation. No obsolete strip assertions or model diagnostics remain; the live-6-named proportions test still checks valid final behavior.

3. **P3 — the acceptance wording claims more native-cost certainty than the retained evidence establishes.** This ticket's `:16` says “No native scene cost while collapsed: verified live.” The snapshots prove no listed Infernus materials drawn in the sampled collapsed frame, and unloading on menu close; they do not measure native update/simulation cost while the NPC page retains the five-object scene (`.scratch/hpv3_perf22c/S2_open_npc.txt:63,233-238`). **Follow-up:** say “no observed model draw while collapsed; map unloads on close,” leaving zero total hidden cost unproven. The **110 fps / ~2%** statement and **~0.17 ms page-only** attribution at `:600` should be labelled extrapolation and cross-run residual estimates, not separately measured results. The JSON arithmetic itself is correct. The callbacks-off screenshot check is reported evidence; no corresponding image is retained in the performance directory.

### Confirmed behavior and evidence

- **Model and clipping:** `tools/menu-layout.js:180-184` and generated XML place one static `CitadelHeroScenePanelNew` under `HPColorsPreviewHeroFrame`, before the bar anchor. `heroid="1"`, `heroname="hero_inferno"`, Shop/map/point-camera and the retained render attributes match the live-proven set. The frame has `overflow: clip` and a solid-white `opacity-brush` (`panorama/styles/hp_colors_v3_menu.css:263-267`); neither the ineffective background fill nor scene-panel scissor clip remains. Model size **596x685**, margins **-156/12**, hat **155.85px** and shoulders **320.25px** agree with the **156px** anchor and 326px inner stage. The retained `.scratch/hpv3_live1/22c_live8_self.png` shows the main bust contained above HEALTH/PLAY and supports the reported layering comparison; this audit did not repeat the live run.
- **Guard mutation:** ran only `ticket 22c live 8 guard` against a temporary panorama copy. Unchanged brush: **1 pass**. Removing its sole brush declaration: **1 expected failure**, specifically `brush=undefined opacity=undefined` at the layer assertion. Replacing it with `opacity: 0.999`: **1 pass**. Source CSS SHA-256 was unchanged and temporary copies were removed. This proves the guard detects loss of the known layer-forcing property, not that the VM renders native scenes.
- **Camera:** default remains **138%**, with a **156px** anchor. A temporary real-script/layout probe checked **27** height/Y combinations, including schema extremes and the fallback threshold; all bar vertical bounds stayed inside the stage. At height **72**, Y **-210/+210**, fallback uses **72% / 278px**, with bar Y bounds **48.672..100.512 / 199.872..251.712**. The same probe then failed intentionally on the combined horizontal case in finding 1; it is not reported as an all-passing test.
- **No model-specific JS loop or style writes:** the model/frame are absent from runtime lookup and binding tables. Existing preview play/settle callbacks remain cancellable; `camera()` caches zoom, margins and anchor height (`panorama/scripts/hp_colors_v3_preview.js:195-198,270-316,379-408`). Model/frame zero-style-write assertions pass through the tested interactions. This is JS evidence, not a native rendering-cost measurement.
- **Cleanup and parity:** scanning **61** source/test/build files found no `HPV3Debug` or `debug-model-strip`; no diagnostic tool or model-strip `-Debug` hook remains. Ordinary release/debug staging and unrelated existing `HPV3_DEBUG` logging are not model-strip residue. Both menus contain the **byte-identical complete v3 fragment**, 155831 bytes, SHA-256 `5f157607ddb39123dde236ef8bde82226c0610cd0e4728bd1471b196acf71860`. The whole Escape layouts intentionally differ because QOLLOCK retains its own panels/includes.
- **Performance arithmetic:** independently averaged all eight samples in each JSON. Model ON/OFF frame times are **2.496893 / 2.290049 ms**, GPU **2.091284 / 1.761809 ms**, CPU busy **2.346959 / 2.147355 ms**: deltas **0.206844 / 0.329475 / 0.199604 ms**. All four adjacent matched pairs have positive deltas for all three metrics. HERO/NPC frame times are **2.505551 / 2.125733 ms**, delta **0.379818 ms**; subtracting the callback delta gives **0.172974 ms**. The ticket's rounded numbers agree.
- **Native snapshots:** all five retained `S*.txt` files match the table: scene objects **0/5/5/5/0**, shop loaded **no/yes/yes/yes/no**, Infernus materials listed **no/yes/no/yes/no**, in boot/HERO/NPC/HERO-again/closed order. These corroborate the observed lifecycle, subject to finding 3.

### Checks actually run

- `node --test hp_colors_rewrite_v3/tests/*.test.js`: **936 passed, 0 failed, 0 skipped**.
- `node --test hp_colors_rewrite_v3_qollock/tests/*.test.js`: **24 passed, 0 failed, 0 skipped**.
- `node hp_colors_rewrite_v3/tools/generate.js --check`: **12 outputs current**, 3 stylesheets, 591 rules, maximum 10 selectors.
- `node hp_colors_rewrite_v3_qollock/tools/qollock.js --check`: **2 outputs current**.
- Temporary guard mutation runs, temporary camera probes, byte-level fragment comparison, diagnostic-residue scan, JSON aggregation, native-snapshot comparison and retained live screenshot inspection as detailed above.
- The context-mode batch hit its 30-second transport timeout; its completed indexed output was recovered, including both test summaries and both generator results. The suites were not rerun or assumed to pass from the timeout. Temporary mutation/probe work used eval/subprocess and left no source changes. Only this appendix was appended.


## Live 1:1 (user 2026-10-15)

**Goal:** the HERO preview stage is the live SHOW BOUNDS box (the 200×210 healthbar canvas), and Infernus sits in it as in live reference #1 (`.scratch/hpv3_live1/22c_ref1_closest.jpg`, closest distance, user choice).

**Stage = canvas.**
- k = 284 / 200 = 1.42 css px per canvas unit. Inner box 284 × round(284 · 210 / 200) = **284 × 298** (canvas 284 × 298.2; the last 0.2 px is clipped).
- `.HPC3PreviewKindHero .HPC3PreviewStage { height: 300px; margin-top: 28px; margin-bottom: 14px; }`: the 1 px border makes 300 px. The stage is centred in the old 48 + 14 + 280 = 342 px slot, so HEALTH, the slider and PLAY do not move.
- `camera()` HERO branch is fixed: `uiScale 142%`, canvas margins `0px`/`0px` (canvas origin = stage origin), for any bar size, offset or master state. Bar size and offsets therefore paint exactly where live puts them inside the bounds; anything outside the canvas is clipped by the stage, as live clips at the bounds.
- Removed as dead: `HEAD_TOP_Y`, the head-fit/fallback branch, `cameraRoof`, the `HPColorsPreviewHeadAnchor` panel and its CSS (the scale wrapper is the stage child again, as before 22c). The hero-only `BAR_CX = 106.5` is gone; unit kinds keep their unchanged fitted camera (`BAR_CX = 100`, `ROOM_*`, 278 px region).
- The preview note now reads "HERO shows the live bounds box 1:1; units zoom out to fit the bar. …".

**SHOW BOUNDS.** The preview already has the outline: `HPColorsPreviewCanvasBounds`, a 100 %×100 % child of the canvas with `border: 1px solid #5fe69e`, shown by the root class `HPColorsV3Bounds` from the same plan rule as the world `#HPColorsV3CanvasBounds` (only customized bars, master on). With the fixed mapping it coincides with the stage inner box (rect 0, 0, 284, 298.2). No new feature.

**Model geometry.** Target from ref #1 in canvas units: hat brim 45.8 wide, hat top 130.6, hat centre x 82.2 → css 65.04, 185.45, 116.72. In-panel fractions from live 8 (596×685): hat top 0.2102 · H, brim 0.1846 · W, centre 0.498 · W; aspect 596:685 kept.
- W = 65.04 / 0.1846 = 352.3 → **352**; H = 352 · 685 / 596 → **405**.
- margin-top = 185.45 − 0.2102 · 405 = **100.3**; margin-left = 116.72 − 0.498 · 352 = **−58.6**.
- Result in canvas units: hat width 45.76, top 130.58, centre 82.18 (box/hat 4.37, top 62.2 %, centre 41.1 %).
- `HPColorsPreviewHeroFrame` is unchanged (100 %×100 % of the stage, `overflow: clip` + solid-white `opacity-brush`), so its clip window is the stage = canvas window.

**Attributes.** `renderdeferred` and `antialias` are dropped (not `CGame_UI_ScenePanel`/`CitadelHeroScenePanelNew` attributes in client.dll 6785, per Main's static RE; the live E–H strip drew without them). The line is now `heroname="hero_inferno" heroid="1" heroscenestyle="Shop" map="maps/ui/hero_shop/inferno_shop.vmap" camera="point_camera" rendershadows="false" rotate="None" hittest="false"`.

**Audit 2 P3-2.** The stale comments in `tests/preview.test.js` (bust block) and `hp_colors_v3_preview.js` (head-anchor block) now describe the layered-parent clip and qualify the unlayered `panel://` observation.

**Tests (red first; 6 failed against the old code before the source change).**
- `ticket 22c live 1:1: the HERO canvas maps 1:1 …`: no head anchor; stage 300 px with inner height = round(284·210/200); 342 px slot kept; for default, max size (316×72), all four (±200, ±210) offset corners and max size + (200, 210): zoom 142 %, canvas origin = stage origin, canvas 284 × 298.2; renderer offset applied; master off and a Units round trip keep 142 %.
- `ticket 22c live 1:1: SHOW BOUNDS rim coincides with the HERO stage inner box`.
- `ticket 22c live 8` (rewritten): frame = stage, layered/clipped, no margins; aspect 596:685; hat width/top/centre within 1 canvas unit of 45.8/130.6/82.2 and the 4.36/62 %/41 % ratios.
- Attribute test: `renderdeferred`/`antialias` absent; `heroid`, `rendershadows`, `rotate`, `hittest` present.
- Pins updated on purpose: 138 %/139 % → 142 %/142 %, canvas ui scale 1.136 (227.2 × 238.56 at base 0.8), ult badge 27.6 → 28.4. The fitted-camera zoom test now runs on the NPC kind. Removed: the head-anchor test, the HERO fallback offset test and the live-6 proportion test (all superseded by the fixed mapping).

**Checks run:** `node --test hp_colors_rewrite_v3/tests/*.test.js` 935/935 pass (936 − 3 removed + 2 added); QOLLOCK lane 24/24; `generate.js --check` 12 outputs current (590 rules, ≤ 10 selectors); `qollock.js --check` 2 outputs current. Both menus have no `renderdeferred` or `HeadAnchor`.

**Builds (`-SkipDeploy`, SHA-256 of `pak02_dir.vpk`); not deployed, not launched:**
- v3 release: `02520ce19985e35422340f4597cb737bc0033d12f73907babb148685735829c6`
- v3 debug: `a32864ea324136560343d4c907e5d9570ca399fc1a33c6c9f78a1c0896576333`
- QOLLOCK release: `fca781646a5980d94eea5016c1633996ac0580c00e3a871e3b3c70bf68ece62c`

**Main live check (Show bounds on, HERO, Bar page):**
- The teal rim sits exactly on the stage border (no gap or offset on any side).
- Box width / hat brim width ≈ **4.36**.
- Hat top at ≈ **62 %** of the box height from its top.
- Hat centre at ≈ **41 %** of the box width from its left.
- The bar, name, status row and HP text sit where ref #1 has them inside the bounds; changing bar width/height/offset moves them without any zoom change.
- HEALTH, the slider and PLAY have not moved; nothing spills outside the stage; the model still renders without `renderdeferred`/`antialias`.
- Units page (NPC/neutral/objective) camera is unchanged.

## Live check 9 (Main self-test, debug `a32864ea`)

Show bounds was on, on the Bar page. Screenshots:
- `.scratch/hpv3_live1/22c_live9_bounds.png` (enemy)
- `.scratch/hpv3_live1/22c_live9_ally_bounds.png` (ally)
- `.scratch/hpv3_live1/22c_live9_vs_ref1.png` and `.scratch/hpv3_live1/22c_live9_ally_vs_ref1.png` (ref #1 bounds box resized to the preview box, side by side)

| Check | Preview | Live ref #1 |
|---|---|---|
| Bounds box (1280 frame px) | 954–1142 × 242–440: 187.4×198, aspect 0.946 | aspect 0.947 |
| Box / hat brim | ≈ 4.16 (hat ≈ 45 px, ±2 px measurement) | 4.36 |
| Hat top | 62% | 62% |
| Hat centre | 41.7% | 41% |

- The outline sits on the stage border. The model renders without `renderdeferred`/`antialias`. The controls have not moved.
- **Ally side compared with ref #1:** the eye icon, name row and bar row land at the same x/y inside the box, and the bar ends at the same x.
- **Differences outside this ticket's geometry:**
  - The live ally shows a level badge (`1`) and an HP number (`830`, full HP). The preview ally sample shows neither.
  - The pose differs slightly: live is the gameplay idle, the preview is the shop pose.

**Result:** 1:1 within measurement error. The model may be up to ~5% large, which is inside the ±2 px hat-width error.

## Zoom-out above 136.7 px

**User requirement (verbatim):** "when increasing the width of the bar the camera of the hero will pan out a bit when more than 136.7px".

**Rule.** `preview.js` has `HERO_ZOOM_WIDTH = 136.7` and computes f = min(1, 136.7 / barWidth). `barWidth` comes from the active side (`settings.side[side]`, the ENEMY/ALLY toggle). If master is off or the sample is not eligible, the bar is stock, so f = 1.
- **f = 1** (width ≤ 136.7, including the 116.92 default): this is exactly the Live 1:1 mapping. `uiScale 142%`, canvas margins `0px`/`0px`, and the model keeps its static CSS geometry (352×405 at −58.6/100.3) with no JS writes.
- **f < 1:** k = round(1.42 · f, 0.001) is written as a one-decimal `uiScale`. The canvas margins and the model geometry are both computed from that written k, so the canvas and the model scale together. Model ↔ canvas stays 1:1 to live, and the bar keeps its 136.7 × 1.42 = 194.1 px on-stage width.
- Unit kinds (NPC/neutral/objective) keep their unchanged fitted camera.

**Anchor:** the 1:1 canvas centre, i.e. canvas (100, 105) = stage (142, 149.1) px, stays fixed.
- Canvas margins (canvas px): left = 142/k − 100, top = 149.1/k − 105.
- Model (stage px): size × g, margin = anchor + (1:1 margin − anchor) · g, where g = k / 1.42.
- The result reads as a camera pulling back: the canvas stays centred, the model shrinks toward the middle, and its lower body comes into the stage. Nothing that was inside the canvas can leave the stage, because the canvas only shrinks about an interior point.

| width | f | uiScale | canvas on stage (x, y, w×h) | model w×h @ left/top |
|---|---|---|---|---|
| ≤ 136.7 | 1 | 142% | 0, 0, 284×298.2 | 352×405 @ −58.6/100.3 (CSS) |
| 200 | 0.6835 | 97.1% | 44.9, 47.1, 194.2×203.9 | 240.7×276.9 @ 4.8/115.7 |
| 316 | 0.4326 | 61.4% | 80.6, 84.6, 122.8×128.9 | 152.2×175.1 @ 55.3/128 (bottom 303, nearly the full body) |

**Scaling method.**
- The scene panel is resized with layout `width`/`height`/`margin-left`/`margin-top` in `heroCamera()`, not with a transform, because no live check has shown what a transform does to a native scene render. These writes are cached on the written zoom text, so they happen only when f changes. An HP slider change, a play step, a repeated `setSettings`, a height edit and a Units round trip all write nothing.
- `HPColorsPreviewHeroFrame` is unchanged: stage-sized, `overflow: clip` plus a solid-white `opacity-brush`, so it still clips at the stage border.
- `retire()` hands a zoomed model back at its 1:1 CSS values, and `resolve()` resets the cache for a new model panel, so a reincluded script starts from the static CSS state.
- SHOW BOUNDS (`HPColorsPreviewCanvasBounds`, 100% of the canvas) follows the scaled canvas.
- `menu.css` only gained a comment on `.HPC3PreviewHeroModel`.

**Tests (red first).** Against the old code, 4 tests failed: the 1:1 test's max-size case (k stayed 1.42), plus the 200/316, write-cache and side tests. The reinclusion test was added together with the `retire()` fix. All pass now. New tests in `tests/preview.test.js`, run through the real layout and scripts:
- ≤ 136.7: at 116.92 and at exactly 136.7, the mapping is `142%` with canvas origin 0/0, the model computes 352/405/−58.6/100.3, and the model has 0 style writes.
- 200 and 316:
  - The canvas k is 1.42 · 136.7/w (±0.001), centred on the anchor (±0.2 px).
  - The model is 352f × 405f (±0.5) with its aspect kept.
  - Hat width, top and centre in canvas units are within 1 of 45.8/130.6/82.2.
  - The bar's on-stage width is 194.1 px, and the SHOW BOUNDS rim is visible at 100% of the canvas.
  - At 316 with default offsets, the bar rect is inside 284×298.
  - Returning to 116.92 restores exact 1:1, and master off at 316 gives 1:1.
- Write cache: going to 200 writes exactly 7 camera properties (uiScale, 2 canvas margins, 4 model properties). Slider, play, repeated settings, a height edit and a Units round trip add 0.
- Sides: enemy at 316 zooms out, ally at default is 1:1, ally at 200 zooms out, and switching back to enemy gives 316 again.
- Reinclusion: the model returns to 1:1 CSS values, and the new instance zooms it again.
- The existing 1:1 test now applies its fixed-k assertions only at ≤ 136.7. Its max-size cases assert the zoom-out instead.

**Checks run:**
- `node --test hp_colors_rewrite_v3/tests/*.test.js`: 940/940 pass (935 + 5).
- QOLLOCK lane: 24/24.
- `generate.js --check`: 12 outputs current (590 rules, ≤ 10 selectors).
- `qollock.js --check`: 2 outputs current (regenerated with `qollock.js`).

**Builds (`-SkipDeploy`, SHA-256 of `pak02_dir.vpk`); not deployed, not launched:**
- v3 release: `027ff9d273d74cb01a30691469e3b8666e02a3f6e7e7c96008ce7789e4670999`
- v3 debug: `ad6ff1c624287de7d0fdd17069e8cb17e650f476765852c0f354fe9976669c4c`
- QOLLOCK release: `e5998045bb4a7229e58d2d2cfddf40f130f7ba061bda8700f280a6b34ef4410c`

**Main live check (HERO, Bar page, Show bounds on):**
- Width 116.92: unchanged from Live check 9. The rim is on the stage border, with the same hat ratios (4.36, 62%, 41%).
- Width 200: the camera pulls back. The rim shrinks to about 194×204, centred in the stage. Infernus shrinks with it, keeping the same hat ratios relative to the rim, and more torso shows below. The bar stays about 194 px wide on screen.
- Width 316: the whole bar is visible inside the stage, and the rim is about 123×129, centred. Most of the body shows down to the stage bottom, and the empty top area has no spill or artifacts. Check that the scene re-renders crisply at the smaller size, without stretching or lag.
- ENEMY/ALLY toggle with only one side widened: the camera follows the active side's width.
- Drag the width slider across 136.7: the camera jumps once per change, and HP slider or PLAY cause no flicker. The Units page camera is unchanged.

## Live check 10 (Main self-test, debug `ad6ff1c6`)

**Zoom-out.** I typed enemy bar widths into the search result field and restored the default 116.92 at the end. Screenshots: `.scratch/hpv3_live1/22c_live10_w200.png`, `22c_live10_w316.png`, `22c_live10_w116.png`.
- **116.92:** unchanged 1:1 framing.
- **200:** the camera pulls back and more torso shows. The bar, flame, name and status row are visible. The level badge (`19`) is not visible.
- **316:** the whole bar is visible and Infernus shows from hat to below the belt. The scene re-renders crisply. The level badge and flame are not visible at this width.
- **Open (Main inference):** the badge and flame may sit outside the 200-unit canvas on wide bars, as they would live. Not checked in a live match.

**Cost with the 352×405 panel.** Default width, Bar page, `fps_max_ui 0` first, PresentMon ABBA×2, 15 s windows. The control was `panorama_disable_render_callbacks true`. Data: `.scratch/hpv3_perf22c/abba_small_panel.json`.

| | Frame time | CPU busy | GPU time |
|---|---|---|---|
| Model on | 2.366 ms | 2.218 ms | 2.014 ms |
| Callbacks off | 2.446 ms | 2.297 ms | 2.084 ms |
| Δ | −0.08 ms | −0.08 ms | −0.07 ms |

The per-pair GPU deltas were −0.159, +0.019, −0.048 and −0.095 ms, so the cost is below run-to-run noise. The 596×685 panel measured +0.21 ms frame time and +0.33 ms GPU. The 1:1 panel renders 2.86× fewer pixels and removed the measurable cost.

## Scene-panel flags (static RE, client.dll 6785; handles closed)

- **Attributes the `CGame_UI_ScenePanel` base parses** (setter vtable slot 26, rva `0x9927a0`):
  - `map`, `camera` and `use_game_map` (bool)
  - `allowsuspendrepaint` (bool, +0x68)
  - `live-mode` (`off`/`on`/`high_end_only`; default `high_end_only`; +0x64)
  - `pin-fov` (`horizontal`/`vertical`)
  - `post-process-material`
  - The hero subclass adds `heroname`, `heroid` and `heroscenestyle`, and the base handler adds the rotate family and `rendershadows`/`pitch`.
- **`IsLive`** (slot 84, `0x992e30`) returns false when `allowsuspendrepaint` is set and a global gate is > 0. Otherwise `off` → false, `on` → true, and `high_end_only` → a global hardware flag.
- **`renderdeferred` and `antialias`** are not scene-panel attributes; they have been removed.
- **`point_camera` client inputs** (`CPointCamera_API`): `ChangeFOV`, `SetOn`/`SetOff`, and `EnableDOF`/`DisableDOF`.
- **Not applied:** `live-mode="off"` would freeze the idle animation into a static render. `allowsuspendrepaint` depends on an unidentified global gate. With the visible cost already below noise, neither change has a measurable target, so neither was built or tested.

## Centre (user 2026-10-15)

- Moved the hat centre from canvas x 82.2 (41%) to 100 (50%). At k = 1.42, margin-left = 100 × 1.42 − 0.498 × 352 = −33.296, rounded to **−33.3 px**: **25.3 px right** from −58.6. Hat width **45.8** and top **130.6** canvas units are unchanged.
- Static CSS and the zoom-out model baseline now share −33.3; the existing centre anchor keeps the hat centred above 136.7 px too (model left 22.1 at width 200, 66.2 at 316). The layered `HPColorsPreviewHeroFrame` clip is unchanged.
- Red first: all six focused live-8/zoom-out tests failed on the old left position. Updated 100/50% pins pass with the full v3 suite **1068/1068**; QOLLOCK lane **24/24**; both `--check`s current (12/2 outputs). QOLLOCK required no regeneration.
- Built only `build_hp_colors_rewrite_v3.ps1 -SkipDeploy -Debug`: compiler **19 compiled, 0 failed**, exact packed asset set **19**. `hp_colors_rewrite_v3/.build/debug/pak02_dir.vpk` SHA-256: `348f2fc27a760b6899187edf89e2d68c67a8baa348f8605e7ed436666d74fee5`.
- Not deployed or launched; live visual confirmation remains with Main.

## Live check 11 (Main self-test, debug `348f2fc2`)

The hat is centred in the bounds box with Show bounds on, at the default width. The right shoulder is now clipped by the box edge, which is expected. No `Parsing error`, `FATAL` or `Uncaught` in the console. Screenshot: `.scratch/hpv3_live1/22c_live11_centre.png`.
