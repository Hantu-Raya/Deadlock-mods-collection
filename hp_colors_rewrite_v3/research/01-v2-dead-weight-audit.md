# V2 dead-weight audit (2026-10-14)

**Result:** repeated schema/menu inventories, compatibility branches, and test/source coupling are real maintenance costs. No current player-facing feature is proven dead or never functional by this audit. Keep full parity; these are flags, not proposed feature cuts.

Scope: read-only over `hp_colors_rewrite_v2/panorama/` and `scripts/validate-hp-colors-rewrite-v2-*`, with `FEATURES.md`/`AGENTS.md` used for reported live evidence. The stopped-run draft was replaced. Applied the Fallow and ponytail-audit workflows within this scope. No source fixes, dependency installation, test-suite execution, builds, deployment, game launch, or benchmarks occurred. Existing modified `hp_colors_rewrite_v2/AGENTS.md` was preserved.

Paths below are repository-relative. In source citations, `panorama/` means `hp_colors_rewrite_v2/panorama/`; `FEATURES.md` and `AGENTS.md` mean the v2 files. Counts are static observations; live statuses are documentary evidence, not a new live verification.

## 1. Player-facing feature footprint

### Method and limits

The measured source inventory is **16,886 JS + 4,677 CSS + 1,611 XML = 23,174 physical lines**, across seven scripts, two stylesheets and four layouts. The eleven named validator files total **20,099 lines**. This is broader than PLAN's approximate headline because it includes contract, storage, relay and topbar assets. `unit_status_v2.css:1-1556` is the retained stock-derived prefix; Rewrite additions begin at `:1557`. Neither the stock prefix nor shared machinery should be mistaken for feature-specific dead weight.

The table uses a reproducible, approximate **tagged-source footprint**, not exclusive ownership:

1. Read each in-scope `.js`, `.css`, `.xml` as physical lines (`splitlines`, UTF-8/BOM-aware). Match the case-insensitive selectors listed below. Count the union of each matching line and its two neighbors on each side, clipped to its file. Deduplicate within each feature/file, then sum by extension. Counts include whitespace/comments and contract/menu declarations, not just renderer statements.
2. For validators, find column-zero `test(` declarations and count through their first subsequent column-zero `});` line, including any whitespace consumed by `^\}\);\s*$`. Attribute the entire block when its title **or body** matches the same selector. This captured 508 declarations / 15,272 block lines. Shared setup outside those blocks is not attributed. Add the entire 757-line standalone timers validator only to the combined timers row; it has no `test(` declarations.
3. Rows **overlap heavily**. A cross-feature regression counts in each feature it mentions; a shared dialog class can count toward sharing and conditions. Generic helpers without feature names are undercounted. A large test number means a broad mentioning footprint, not that all those lines exclusively test that feature, nor that tests passed. Do not sum rows or use these numbers as replacement estimates.

**Live column:** `Yes` means the documents explicitly describe an in-game confirmation, limited to the named version/subcase; `No` means explicit pending/unverified wording; `Unknown` means no direct v2 confirmation for the feature as a whole. Historical Yes is not current-version parity. No does not mean broken.

| Stage / feature from PLAN §5 | JS ~lines | CSS ~lines | XML ~lines | Test ~lines | Reported live evidence |
|---|---:|---:|---:|---:|---|
| Core · enemy/ally enabled/visible bars, fixed/gradient colors, thresholds/team endpoints | 502 | 100 | 179 | 5,508 | **Unknown**: v1 checks explicitly do not prove fresh v2 parity (`FEATURES.md:134-141`; `AGENTS.md:168`). |
| Core · feedback colors: healing, damage delta, bullet shield, Rat King barrier | 174 | 45 | 54 | 672 | **Unknown** as a complete feature; OLD fill/shield bug fix was confirmed (`FEATURES.md:118-122,388-389`). |
| Core · shared size/position and accessory anchoring | 215 | 0 | 48 | 4,450 | **Yes, limited**: stock-default full-canvas/no-clipping geometry on Oct 1; later defaults/extreme ranges remain smoke cases (`FEATURES.md:451-453`; `AGENTS.md:133,168`). |
| Core · adopted native enemy/ally HP text, font/size/color/offset and release | 1,140 | 114 | 215 | 4,446 | **Unknown** end-to-end: locale, restoration and UI-scale checks remain (`FEATURES.md:26-29,457`). |
| Core · player names, CRITICAL and assassinate labels | 303 | 50 | 47 | 1,600 | **Unknown** for the current feature suite (`FEATURES.md:33,43`; `AGENTS.md:110,168`). |
| Core · primary bar outline, stock/custom relation colors | 175 | 50 | 29 | 659 | **Yes, limited**: outline confirmed in game, not every thickness/style/relation (`FEATURES.md:378-384`). |
| Core · ESC pages, side selector/folds, picker, Peek, confirmed page reset | 3,100 | 519 | 230 | 7,633 | **Yes, limited**: restored tabs/controls Oct 1 (`FEATURES.md:91`); native picker explicitly **No** (`:128`; `AGENTS.md:129`). Current side/fold counts are VM/source evidence only (`FEATURES.md:49-51`). |
| Core · Undo / coalesced gestures and modal cancel | 443 | 5 | 5 | 3,003 | **Unknown** as current v2 in-game behavior (`FEATURES.md:52,128,275-279`; `AGENTS.md:168`). |
| Core · settings and preset code sharing/import | 165 | 96 | 97 | 2,001 | **Unknown** for current in-game clipboard round trips (`FEATURES.md:215,269-271`; `AGENTS.md:168`). |
| Core · preset library, create/apply/edit/save-to, order/delete/hide/restore | 2,427 | 379 | 101 | 5,935 | **Unknown** for current library/restart behavior. Historical scope transitions have Yes, but final Presets checks are still listed (`FEATURES.md:237,243-269,457`). |
| Core · durable save, previous-record protection, status/retry, Forget | 902 | 52 | 25 | 4,088 | **No final-editor/package proof**: HTTPS probe persisted across restart, explicitly not final-package smoke (`FEATURES.md:439-447`; `AGENTS.md:22-24`). |
| Core · redesigned menu-wide settings search and renderer-backed preview | 0 | 0 | 0 | 0 | **No — new v3 behavior**, not a v2 parity feature. V2 has hero-picker search and a color swatch preview only (`panorama/layout/hud_escape_menu.xml:1343,1373`; v3 `_archive/hp_colors_rewrite_v3/PLAN.md:66-73`). |
| Indicators · health lines/pips, relation color and line opacity | 255 | 117 | 21 | 1,971 | **Unknown** current live line creation/restoration (`FEATURES.md:29`; `AGENTS.md:115,168`). |
| Indicators · level badge, visibility and offset | 186 | 5 | 24 | 1,347 | **Yes, limited**: stock/default badge placement Oct 1, not all geometry (`FEATURES.md:200`). |
| Indicators · ultimate ready icon, color/offset/scale and world progress | 867 | 66 | 102 | 1,905 | **No** for the latest progress fix and stacking cases (`FEATURES.md:382-384,422`). Includes shared kill-streak terms. |
| Indicators · enemy stamina Arrow/Circle/Box, color/size/position | 471 | 68 | 42 | 1,874 | **Yes, limited**: shape controls Oct 1; later geometry not comprehensively confirmed (`FEATURES.md:295-297`). |
| Indicators · enemy kill marker, including OLD-grid threshold marker | 279 | 20 | 22 | 872 | **Yes, limited**: OLD marker confirmed; legacy native width mapping explicitly unverified (`FEATURES.md:210,380-384`). |
| Indicators · enemy/ally low-HP pulses and native HP-number pulse | 835 | 111 | 113 | 2,463 | **Unknown** fresh v2 smoke (`FEATURES.md:196-200`; `AGENTS.md:168`). |
| Indicators · pickup appearance, colors/glyphs/darkness/size/spacing/offset | 272 | 0 | 70 | 416 | **No** latest live appearance/rendering proof (`FEATURES.md:408-410,422`). Most artwork/styles are created inline, so zero CSS is not absence. |
| Indicators · rejuvenator controls and native kill-streak flame adoption | 189 | 36 | 62 | 610 | **No** latest appearance/stacking confirmation (`FEATURES.md:382-384,412`). |
| Indicators · pickup and ultimate timers, relay/freshness/pause/lifecycle | 1,318 | 55 | 179 | 2,224 | **No** latest live rendering/lifecycle proof (`FEATURES.md:414-422`). Test footprint includes standalone timer validator; overlaps icon/appearance rows. |
| Units · NPC, known neutral and objective gates / stock release | 328 | 265 | 77 | 1,996 | **Unknown** end-to-end; explicit gate-on/off smoke remains (`FEATURES.md:14-22`; `AGENTS.md:90-91,168`). |
| Styling extras · BAR STYLE V2/V1/OLD and OLD fill grid | 222 | 79 | 10 | 1,201 | **Yes, limited**: OLD outline/marker and zero-width/empty-box fix confirmed; all grid sizes not established (`FEATURES.md:362,384,389`). |
| Styling extras · damage shake strength and name/HP-text tilts | 145 | 133 | 37 | 864 | **No** complete new-strength/tilt confirmation. Compact-frame clipping was observed live and reverted (`FEATURES.md:362,366`). |
| Styling extras · name/enemy HP/ally HP text outline widths | 132 | 49 | 23 | 631 | **No** final text-outline/restoration checks (`FEATURES.md:37,457`). |
| Styling extras · name / shared HP-text alignment | 91 | 0 | 20 | 1,027 | **Unknown** latest live alignment/clamp behavior (`AGENTS.md:131,168`). |
| Styling extras · session-only SHOW BOUNDS | 69 | 5 | 5 | 50 | **No** as documented at release 2.2.2 (`FEATURES.md:371-374`). Never a codec/preset setting. |
| Styling extras · local OWN HUD health color OFF/TEAM/CUSTOM | 171 | 0 | 25 | 866 | **No**, explicitly unverified (`AGENTS.md:127,170`; `FEATURES.md:35`). OFF still intentionally owns the neutral texture/white wash while enabled. |
| Scopes · hero discovery, Current scopes and automatic preset routing | 2,034 | 241 | 111 | 7,266 | **Yes, historical only**: deployed Aug 14 scope/effective/fallback smoke (`FEATURES.md:235-237`); current identity/lifecycle/restart checks remain (`:457`). |
| Scopes · ability signature-tier conditions and typed editors | 1,407 | 329 | 131 | 3,928 | **Yes, historical only**: Aug 15 hierarchy/tier timing (`FEATURES.md:281-291`); latest combinations remain smoke cases (`AGENTS.md:168`). |

### Counting selectors

These are the exact case-insensitive regular expressions used in the row order above. They deliberately track named settings/parts and shared feature infrastructure rather than pretend to partition all source lines. For sharing, generic `Copy` was rejected because it matches the presentation-only `HPColorsSettingCopy` class.

```text
Palette: (?:enemy|ally)(?:Enabled|Visible|Mode|Low|Mid|High|TeamHigh)|lowThreshold|highThreshold|gradient|barColor
Feedback: (?:enemy|ally)(?:Healing|Delta|BulletShield|RatkingArmor)|unit_healthbar_(?:delta|heal|ratking_armor|shield)
Dimensions: widthScale|heightScale|position[XY]|HPColors(?:Width|Height|Position)|barGeometry|rebaseGeometry|accessoryAnchor
Native HP: readout|UnitHealthbarValue|hp_counter
Names/labels: nameSize|nameOffset|NameColor|playerNames|criticalIndicator|assassinate|NameAnchor|nameGeometry|syncName
Outline: barOutline|OldOutline|BarOutline|OutlineBacker|outlineBoxes
Editor: CATEGORY_DEFS|categoryIndex|tabIndex|navigation|Advanced|TuningCollapsed|DependentCollapsed|SideCollapsed|selectedSide|picker|ColorPicker|Peek|Reset|reset_
Undo: undo|history|pushHistory|gesture|transaction
Sharing: HPCR2|HPCRP1|clipboard|copy_settings|import_settings|copy_presets|import_presets|serializeSettings|deserializeSettings|HPColors(?:Preset)?Transfer|HPColors(?:CopySettings|CopyPresets|ImportPresets)
Presets: preset|Preset|repository|baked|SAVE TO PRESET
Save: storage|Storage|STORE_|store|Store|persist|Persist|durable|hydration|Hydration|forget|Forget
Lines/pips: pipsVisible|PipColor|pipOpacity|UnitHealthbarLines|BarLines|PipLine
Level: levelOffset|levelsVisible|LevelContainer|levelGeometry|HPColorsLevel|player_level
Ultimate: ultMode|ultCustom|ultOffset|ultimateTimer|Ultimate|ultimate|KillStreak|killStreak
Stamina: stamina|Stamina
Marker: KillMarker|killMarker|kill_marker
Pulse: pulse|Pulse
Pickup appearance: pickup(?:GunColor|MovementColor|SpiritColor|SurvivalColor|BackgroundDarkness|GlyphColor|Size|Spacing|Offset)|NativePickup|nativePickup|PickupAppearance
Rejuvenator/flame: rejuv|Rejuv|flame|Flame|KillStreak|killStreak
Timers: pickup|Pickup|ultimate|Ultimate|relay|Relay
Units: npc|NPC|building|Building|neutral|Neutral|surfaceKind|classif|unitKind
Bar style: barMask|BarMask|BarOld|BarPip|oldPip|OldPip|oldGrid|OldGrid|pipGrid
Shake/tilt: damageShake|Shake|shake|nameTilt|readoutTilt|allyReadoutTilt|MotionFrame|wiggle
Text outline: (?:readout|allyReadout|name)OutlineWidth|textShadow|text-shadow
Align: nameAlign|hpTextAlign|HPColors(?:Name|HpText)Align|readoutAlignment
Bounds: showBounds|ShowBounds|CanvasBounds
Own HUD: hudHealth|HudHealth|HUD_TEAM|OWN HUD|OwnHud
Scopes: hero|Hero|scope|Scope|AutomaticRoute|effectiveHero|Current
Conditions: condition|Condition|ability|Ability|Tier[0-3]|slot_signature
```

## 2. Dead/unreachable, duplicate and compatibility-only code

### Fallow evidence and entry-point check

Ran installed **Fallow 2.98.0** from `hp_colors_rewrite_v2/`, with `--no-cache` to leave the existing `.fallow/` cache untouched:

```text
fallow --version
  exit 0; 2.98.0
fallow dead-code --no-cache --format json --quiet
  exit 1; 9 unused_files; 0 detected entry points; 0 unused exports
  stderr: node_modules directory not found; dependency accuracy warning
fallow dupes --no-cache --format json --quiet --mode semantic --min-tokens 20 --min-lines 3
  exit 0; 7 JS files; 16,886 lines; 0 clone groups / 0 duplicated lines
```

Exit 1 means findings, not invocation failure; the initial sandbox invocation could not locate the npm shim, then the installed `fallow.cmd` was used successfully. No install was made to silence the warning. Zero clones is only this analyzer result, not proof of semantic uniqueness. Fallow does not establish Panorama branch reachability or live rendering, and the clone result covers JS, not CSS/XML.

**All nine unused-file findings are false positives:** the seven JS files and two CSS files have engine consumers. `panorama/layout/hud_escape_menu.xml:4-15` includes contract/state/storage/menu/style and calls `HPColorsMenuBoot`; `unit_status_overlay_v2.xml:4-10` includes renderer/contract/relay/timers/style; `citadel_hud_top_bar.xml:10-11` includes contract/timers; `test_event_relay.xml:3` includes the bridge. The `$` factory/hook graph is documented at `AGENTS.md:51-73`. Files named `test_event_bridge.js` and `test_topbar_pickups.js` are **production runtime**, not discardable tests.

A read-only identifier scan found no single-reference named-function candidate except `paintColors`; inspection showed that it is a **named callback passed directly to `$.Schedule`** (`panorama/scripts/unit_status_v2_colors.js:4472-4477`). This eliminates that particular false candidate, not all possible dead statements or branches. No definitively unused runtime file/private function was established.

### Ranked maintenance flags (ponytail categories, not cut recommendations)

1. **`shrink` — duplicated setting inventories (largest clear maintenance footprint).** Page/reset ownership is a 289-line `CATEGORY_DEFS` (`panorama/scripts/hp_colors_v2_menu.js:61-349`), repeated for the 258-line legacy table (`:351-608`), plus 66 lines of `ADVANCED_KEYS` (`:632-697`), slider definitions (`:984-1238`), 158 lines of setting row IDs (`:1287-1444`), contract slots/types/bounds, and handwritten Escape controls. These are different projections of the same settings, not unused features. The v3 single-schema decision addresses the shared cause; parity still needs reset ownership, disabled followers, conditions and both sides.
2. **`shrink` / compatibility — two baselines plus layered Current/preset ownership.** Current editing and Base resolution (`panorama/scripts/hp_colors_v2_state.js:1230-1277`), frozen restoration/`pinFrozenFallback` (`:639-663,1098-1115`) and save sparsification (`panorama/scripts/hp_colors_v2_menu.js:4214-4265`) exist because shipped defaults and frozen omitted-key defaults differ (`AGENTS.md:24`). This is functioning compatibility, not evidence of dead code. `own`/Current layering and fallback pinning are explicitly replaced by v3's versioned-record/migration design (`_archive/hp_colors_rewrite_v3/PLAN.md:52-57,115`); old looks must survive migration first.
3. **Compatibility-only — old pak01 four-rail navigation.** `LEGACY_CATEGORY_DEFS` and `legacyCategories` (`panorama/scripts/hp_colors_v2_menu.js:351-617`), four legacy button IDs (`:626-631`), setup forks (`:6201-6231`) and missing-store/legacy warning (`:4267-4284,4494-4497`) remain reachable when an old preset pak overrides Escape XML. The fallback intentionally lacks current controls and saving (`AGENTS.md:9`). This is not unused in v2's supported degraded boot; v3's explicit exclusion of that deprecated menu is a decided design boundary, not an audit recommendation to drop player settings.
4. **`yagni` candidate — manual/off hero-mode branches inaccessible through the shipped editor.** Initial identity always sets Auto (`panorama/scripts/hp_colors_v2_state.js:1206-1217`); menu has no `hero_mode`/`hero_manual` sender, and documentation explicitly says there are no mode controls (`FEATURES.md:219`). Alternate effective-identity branches (`state.js:1872-1895`), handlers (`:2304-2333`), dispatch cases (`:2879-2880`) and menu display branches (`menu.js:2394-2402`) therefore have no ordinary user route in the canonical UI. They are **not globally unreachable**: validators deliberately call manual/off (`scripts/validate-hp-colors-rewrite-v2-state.test.js:2170-2179,2208-2221`). Preserve needed test seams/authorized caller contracts; do not confuse them with a working player-facing mode selector.
5. **Compatibility-only — retired settings and multiple input formats.** Tombstones for exclusions, ghoul opacity, precise pips, HP formats and max-team-color live in `panorama/scripts/hp_colors_v2_contract.js:344-377`; state drops retired rules (`hp_colors_v2_state.js:291-314`), accepts extension versions 1–3 (`:664-718`) and historical HPCR2 shapes (`:747-820`). Storage writes schema 4 but reads 1–5, treating withdrawn schema 5 as 4 (`hp_colors_v2_storage.js:22-26,145-184`). These branches protect existing user data and frozen slot numbering. Reserved slots are not editable features; migration must consume them without resurrecting retired settings.
6. **`shrink` — duplicated small helpers with concrete source matches.** `scopeUsesHeroes` is identical in state (`panorama/scripts/hp_colors_v2_state.js:175-177`) and menu (`hp_colors_v2_menu.js:2503-2505`). `isValid` matches between renderer (`unit_status_v2_colors.js:310-316`) and menu (`menu.js:1750-1755`); storage uses a stricter callable check (`storage.js:49-54`), so it is not the same contract. Bounded `absoluteRoot` walkers repeat in renderer (`unit_status_v2_colors.js:338-352`) and menu (`menu.js:1793-1807`). Color normalization repeats the trim/uppercase/#/six-digit policy (`contract.js:615-618`; `menu.js:4119-4123`). Sharing cannot assume factories remain available: consumers remove the contract factory from `$` (`AGENTS.md:73`). Small repeated primitives do not justify a new runtime framework.
7. **`shrink` — source-coupled test seams, not redundant behavioral coverage.** Baseline/editor/style validators contain 161 combined syntactic `assert.match(` / `.includes(` occurrences (51/61/49 respectively); not every occurrence is a source assertion. Two direct examples of structural coupling are `scripts/validate-hp-colors-rewrite-v2-style.test.js:18-34` (string replacement injects private style helpers) and `scripts/validate-hp-colors-rewrite-v2-diag.test.js:18-30` (rewrites baseline suite source to import a fixture without registering tests). V3 behavioral seams can avoid this coupling, but restoration, failed boot, stale callbacks, import validation and data-loss protections remain required checks.
8. **Compatibility/test inventory boundary — variant tests are not canonical runtime LOC.** `scripts/validate-hp-colors-rewrite-v2-lite.test.js:13-20,67-86` references a separate static CSS/build lane; diag (`:10-11`) references a separate probe; Third Eye has its own 509-line validator. All eleven requested validators were included in the test footprint, but their external runtime trees were not audited. QOLLOCK/ShowRank/Third Eye composed packages cannot be judged from canonical source alone.
9. **`native` / `stdlib` non-finding — do not call platform workarounds dead weight.** Native HP-label adoption, explicit style restoration, the sibling message relay, polling and the HTTPS store bridge solve documented engine constraints (`FEATURES.md:26,109-111,429`; `AGENTS.md:16-24,88,101-110`). No verified writable native persistence API, world-health event stream, or stdlib substitute was found within this audit. `WeakMap` is already native-facing menu cache infrastructure (`panorama/scripts/hp_colors_v2_menu.js:1809-1812`).

**Net authorized cuts: 0 lines, 0 dependencies.** This is a full-parity inventory, not a deletion plan. No usage telemetry or player census was collected, so no feature can be classified as “nobody uses it.” A global savings estimate would be speculation.

## 3. Apparently broken, never-functional, retired or unproven features

| Classification | Evidence and current interpretation |
|---|---|
| **Confirmed historical failure: stale QOLLOCK copied menu** | `AGENTS.md:159` says release 2.2.0 booted with a grey HP COLORS button and default settings because the Escape copy lacked new IDs. The guard and boot regression are now documented. This proves an integration failure, not that canonical editor features never worked; current pin also still lacks live confirmation (`FEATURES.md:391`). |
| **Current documented compatibility trap: old builder pak01** | Old pak01 overrides the Escape layout, removes current controls and disables saving (`AGENTS.md:9`; `FEATURES.md:397`). Runtime detects it and shows `OLD PRESET VPK` (`panorama/scripts/hp_colors_v2_menu.js:4267-4284,4494-4497`). A user in this layout can genuinely lose access to features; canonical pak02 functionality is a separate question. |
| **Confirmed historical ultimate-progress regression; source fix present, live result pending** | Player-reported sparse-send bug left first rate zero and new/hidden bars waiting for a heartbeat (`FEATURES.md:383-384`). Source now sends when zero rate becomes positive and has a **2 s** heartbeat (`panorama/scripts/test_topbar_pickups.js:353-379`), so “never worked” is unsupported. `AGENTS.md:89` and `FEATURES.md:414` still describe 8 s sends: documentation drift, not evidence that the 2 s source branch is missing. |
| **Confirmed historical OLD outline flicker and empty new bars** | `FEATURES.md:379` identifies missing grid-marker part resolution / deleting id-named outline boxes; `:389` says fill-clip sampling fixed zero-width/empty-grid bars and was confirmed in game. These are known prior failures with reported corrections, not current dead feature evidence. |
| **Observed rejected implementation: compact shake frame** | A transformed compact frame clipped HP text and level in game and was reverted (`FEATURES.md:366`). The full-canvas frame remains an engine constraint; the observation does not prove adjustable shake/tilt works at every setting (`:362`). |
| **Inaccessible by design, not currently offered player features** | Manual/off hero mode is a tested state API without menu controls (`FEATURES.md:219`; source evidence in §2). Retired ghoul opacity, exclusions, percent/current formats, precise pips and max-team color are omitted from editable keys and dropped on import (`contract.js:344-377`; `FEATURES.md:16,26-27,317`). Do not claim they never worked historically or restore them merely because their slots decode. |
| **Known abandoned integration, not a current save regression** | Game's HTTPS-only gate makes former `file://` / `javascript:` storage unusable, and old-origin saves unreachable (`FEATURES.md:429`). Production now uses HTTPS. Current code exports are also unsupported by the deprecated web preset builder (`AGENTS.md:7,11`). Both are documented boundaries, not proof that current durable saves/code imports never functioned. |
| **Never implemented in v2: v3 menu-wide search and bar preview** | V2's `HPColorsScopeSearch` searches heroes and `HPColorsPickerPreview` is a color preview (`panorama/layout/hud_escape_menu.xml:1343,1373`). The requested settings-wide search, live bar preview, HP slider and damage/heal play button are new v3 UX (`_archive/hp_colors_rewrite_v3/PLAN.md:69-71`). No parity cut is implied by their zero v2 footprint. |
| **Unproven live, not proven broken** | Native picker (`FEATURES.md:128`), OWN HUD wash (`AGENTS.md:170`), SHOW BOUNDS (`FEATURES.md:374`), rejuvenator/flame controls and latest timers (`:384,412,422`), and final production save/restart/Forget (`:441-447`) explicitly lack final live confirmation. Current presets, identity/lifecycle, locale, text-outline restoration and UI scales remain listed for smoke (`:457`). Automated source/VM evidence cannot settle these. |
| **Deliberate limits/fail-closed behavior** | Native pickup appearance can lag by 3 s (`FEATURES.md:410`); dormant untracked-part replacement by 5 s (`:416`); lane troopers are engine-drawn/out of scope (`:22`). Ultimate publication excludes ambiguous repeated names rather than guessing (`panorama/scripts/test_topbar_pickups.js:313-345`), and receiver validation rejects duplicate names (`:100-116`). Saving unavailable offline/on protocol mismatch, and blocked writes after unreadable data, are protections (`AGENTS.md:20,23`), not grounds to weaken parity. |

**Disposition for ticket 02:** preserve all agreed player-facing features. Carry the documented partial/pending live statuses into the v3 ledger, preserve old-input semantics at migration, and distinguish canonical source from composed-package failures. This audit establishes no currently broken canonical feature requiring a scope decision, and no basis for a “never used” claim. The main agent owns acceptance verification of this research and ticket update.
