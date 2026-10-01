# HP Colors Rewrite v2

## Scope

`hp_colors_rewrite_v2/` owns the ESC editor, its durable local save, and the live v2 unit-status renderer. Keep its centered whole-bar geometry and `HP_COLORS_V2_CONFIG` transport. Read `FEATURES.md` for feature behavior and manual smoke scenarios; use source and the build wrapper for current implementation details.

Settings, scopes, presets, and conditions persist on this PC through `hp_colors_v2_storage.js`. Do not add Anita compatibility, Reset All, or legacy v99 support. Preserve legacy HPCR2 imports and HPCRP1 preset compatibility; current exports include the `hpv2` v:2 extension for V2 settings and bar-relative HP-text offsets. The web preset builder still accepts only hpv2 v:1 and fewer extension slots: current exports are not compatible with it. ShowRank Barebones support is opt-in build-stage Escape composition; keep canonical runtime code independent.

Package ownership: the Rewrite v2 runtime is pak02 and the generic preset builder is pak96. v2 no longer reads a builder pak01 seed; an installed old pak01 overrides the ESC layout, and the menu reports it as `OLD PRESET VPK`. That legacy layout has only four rail buttons, so it boots without the PRESETS and UNITS pages or new APPEARANCE controls until pak01 is removed.

## Durable save

- A hidden `CitadelHTMLPanel#HPColorsV2Store` opens `file://`; its localStorage lives in Steam's CEF profile. Panorama drives the page with `SetURL("javascript:...")`; the page answers through `HTMLTitle` titles prefixed `HPV2S1:`.
- Keys are data, not configuration: `hantu.hpcolors.v2/state` and `hantu.hpcolors.v2/state.prev`. Never read, write, or delete any other key on the shared origin (Third Eye and QOLLOCK live there).
- Records are `HPV2S1.<fnv1a32>.<base64url envelope>`; envelope schema 4 embeds the body object and marks bar-relative HP-text offsets. Schemas 1–3 still load (schema 1 has a string body); their HP-text offsets migrate once by dividing old offsets by the record's axis bar scale and rounding. The envelope, not a body marker, owns the durable offset version. Classify absent/valid/corrupt/unsupported, including body shape, before normalizing. A corrupt or absent current falls back to `prev`; a newer-schema current never does. A commit rotates the current record into `prev` only when its checksum matches the record this bridge validated or wrote.
- Send no `javascript:` script until `HTMLURLChanged` reports a `file:` document (a script sent while the load is pending can abort it to `http://error/`), inject once per page on its first title (2 s fallback), and accept readiness only from a `file:` hello; the about:blank placeholder answers too. Load `file:///C:/` once, then bare `file://` once if the first ends on `http://error/` (bare `file://` failed three live runs in a row); both share the `file://` storage origin. A lost reply fails its request after 5 s; a timed-out read is asked once more under a fresh id, and the editor's save retry below is the only other retry. A repeated or stale `http://error/` event never loads a third address or replaces a committed page.
- Readiness waits up to 60 s. Until the panel reports a real page URL, the current address is re-sent every 8 s; the surface's own `about:blank` does not count, because an address sent before Steam created the surface can be lost (console.log 2026-10-01 09:10 and 09:16, `+map` launches). The first six URL events are logged, and after giving up the first late URL event is logged once.
- Writes stay closed until a read in this process proves what the store holds. Failed, corrupt, or future-schema reads block saving for the process instead of overwriting with defaults.
- The saved body is `sessionRaw` without `effectiveRevision` and with only values differing from the frozen 974128a sparse baseline, not the new shipped defaults. Preserve that baseline for saves, codes, presets, and missing-stamina-shape derivation so old data keeps its look. Saves throttle at 1.5 s, flush on editor close, skip unchanged bodies, retry failures with backoff (status SAVE RETRYING, then SAVE UNAVAILABLE), and keep one active plus one replaceable pending write. After Forget, only a deliberate edit (not `AUTOMATIC_INTENTS`) creates a save again.
- Root attrs `hp_colors_v2_store_status`, `hp_colors_v2_store_ack`, and `hp_colors_v2_hydration` carry process evidence across ESC layout reloads. Renderers keep bars stock while hydration is `pending`.

## Source ownership

```text
hud_escape_menu.xml
  -> hp_colors_v2_contract.js
  -> hp_colors_v2_state.js
  -> hp_colors_v2_storage.js
  -> hp_colors_v2_menu.js + hp_colors_v2_menu.css

unit_status_overlay_v2.xml
  -> hp_colors_v2_contract.js
  -> unit_status_v2_colors.js + unit_status_v2.css
```

- `hp_colors_v2_contract.js` owns the 72-key legacy codec, 67 append-only v2 extension slots, shipped and frozen sparse defaults, normalization, bounds, and enum policy. Shipped defaults are width 148%, height 80%, raw positionY -38, enemyLow `#FD4949`, ally low/mid/high `#FFEFD7`, Oracle HP font, stored HP-text offsets 18/14, anchoring on with ult/level raw X 74 and Y 48, enemy pip color enabled with `#000000`, and arrow stamina (also the frozen sparse baseline). `pipOpacity` defaults to 100 (bounds 0–100) and multiplies stock line opacity. Missing stamina shape derives `box` when size or color differs from the frozen baseline, otherwise `arrow`. Append-only slots 62–64 are `readoutOutlineWidth`, `allyReadoutOutlineWidth`, and `nameOutlineWidth`: bounds 0–10, step 0.5, default 5 (stock text-shadow strength). Slots 65–66 are `hudHealthColorMode` (`off`/`team`/`custom`, default `off`) and `hudHealthColor` (default `#FFFF00`). Older runtimes ending at slot 64 reject non-default new slots; `hpv2` stays v:2 and HPCRP1 is unchanged. Retired keys (three color exclusions, ghoul opacity, readoutFormat slot 29, allyReadoutFormat extension slot 30, precisePipsEnabled, readoutMaxTeamColor, and allyReadoutMaxTeamColor) keep tombstone codec slots but have no controls; their values, ability rules, and `own` keys are dropped on load/import. Do not restore unused contract projections or retired-format enum rows.
- `hp_colors_v2_state.js` owns canonical values, effective resolution, scopes, presets, conditions, Undo, import/export, and state transitions through one immutable `send()` and `read()` factory.
- The hero catalog includes prerelease Baba (`hero_baba`), Deadman Danny (`hero_deadpack`), Nurse Harrow (`hero_nurse`), Rat King (`hero_ratking`), Solomon (`hero_chessmaster`), and Violet (`hero_artist`). HPCRP1 stores string hero keys, so these additions require no encoding change. Existing All Except lists do not automatically skip new heroes; the web builder catalog still lacks these six.
- `hp_colors_v2_storage.js` owns the hidden-page bridge, record codec, chunked read/write/delete protocol, and timeouts through `$.HPColorsV2StorageFactory`.
- `hp_colors_v2_menu.js` owns Panorama panels, Escape lifecycle, rendering, the native color-picker bridge, replay, transport, save gating/status/Forget, clipboard effects, and the local bottom-HUD health wash. Only this menu writes inline `washColor` on `#health_and_abilities_container … #health_bar_Left`; never apply it to unit-status bars or other HUD health layers. TEAM uses team1 `#E7B659` / team2 `#5B79E6`. OFF, master off, hydration pending, or unknown/conflicting team releases only the owned inline wash, returning control to stock `hud_health.css` yellow. Reuse generation-guarded identity polling, cached validated panel references, and unchanged-write suppression; do not add a loop.
- `unit_status_v2_colors.js` owns live-bar discovery, role and hero classification, colors, exclusions, feedback controls, dimensions, position, ultimate icons, readouts, pips, levels, pulses, and kill markers, plus independent player-name color/size/clamped position.

The state module and renderer each capture the contract factory and remove it from `$`. The menu consumes `$.HPColorsV2StateFactory`; it does not load the contract directly.

## Initialization

- `hud_escape_menu.xml` calls `$.HPColorsMenuBoot()` on load. Resolve required panels, hydrate, restore state, create dynamic controls, then bind events. Publish and start replay/identity watches only after setup succeeds.
- Cold boot reads the store before creating state; the menu button shows `Loading` until then. Warm boot uses the session attribute and skips the read when process evidence exists.
- Boot is idempotent after success. Failed control creation leaves boot retryable through another explicit call; there is no automatic retry loop. Preserve both missing-panel and thrown-API recovery.
- Hydrate through the state factory with `{sessionRaw, publishedRaw}`. Preserve the published effective snapshot while hero identity settles.
- The renderer registers its config event handler before `scan()`. The first scan reads the root snapshot and discovers live panels, then `paintColors()` starts. Keep one scan loop and one paint loop per context.
- Exercise startup changes in the editor VM validator, including failed setup, successful retry, and repeated boot without duplicate publication or scheduled work.

## Runtime rules

- Persist only through the storage module and only while the write gate is open.
- Preserve the v2 message magic, root attribute, payload version, and `{magic_word,version,revision,values}` shape.
- Publish every effective change immediately and replay unchanged snapshots for late unit-status contexts.
- Classify unit kind separately from relation. Neutral-first precedence remains; only known neutral NPCs get the explicit fixed-fill opt-in. Enabled NPC, neutral, and building UNITS gates also apply shared bar size/position, native HP text, and contained health lines; gate off restores stock. Enemy and neutral HP text uses ENEMY settings, friendly HP text uses ALLY settings, including font, size, colors, offsets, and outline. Kill marker, pulse, level, ultimate, and stamina customization stays player-only. Unknown type/relation and conflicting enemy/friend ownership stay stock.
- Discover the live `UnitHealthbarsContainer` → direct `UnitHealthbar.UnitHealthbarContainer` → direct `UnitHealthbarInner` lineage. Never adopt `UnitShieldbar`, its duplicate IDs, or a retired `old_bar` tree.
- Cache panel references and unchanged writes, including the shield label and legacy-layout missing controls. Rebase whole-bar geometry once per paint tick, deduplicate unit fact classes, and read one state snapshot per menu sync. Keep `bar*` geometry names distinct from health-line segments. Long-lived scheduled work needs stale-generation checks; optional panels must not create retry loops. Do not restore removed storage `dispose`/`savedAt`, redundant renderer guards/writes, or unreachable menu paths.
- For scale, position, readout, level, ultimate, stamina, or marker geometry, read `design.md` and use measured 6722 stock-relative CSS-pixel bounds: normalize every `actual*` layout read by that panel's axis UI scale, not the world panel's or another part's. Defer original accessory-center capture until positive panel/stack/primary layout is available, and retry on the existing reconciliation cadence. Keep `UnitHealthbarValue` native current-only: no percent/custom counter, inferred maximum, parsing or text write. Names use captured style ownership, never text/visibility writes; custom colors keep brightness 0.8 and spectator alpha.
- Boss/building stock labels use 70% UI scale; stock UnitStatus scaling of 180%/80% composes with custom bar scale. Normalize each panel's own axis scale rather than flattening these stock differences.
- Text outlines write `0px 0px 0px <w> #10130D` for enemy/ally HP labels, including the enemy pulse label, and `0px 0px 0px <w> #10130DEE` for player names only when the width differs from 5. Returning to 5 or releasing style ownership restores the exact captured stock `textShadow`; do not replace stock styling with an equivalent-looking hardcoded value.
- Use Source 2 CSS only. Keep passive overlays `hittest="false"` and hidden panels collapsed.
- Unit-status bars are always rectangular without the outer background, including shields and previews. The stock CSS prefix intentionally deletes three healthbar masks and eight container background declarations (and six emptied relation rules); retain the black inner backing and all other stock declarations. Do not add a shape toggle or inline mask override.
- LINE OPACITY writes `pipOpacity / 100` on `#UnitHealthbarLines`, multiplying stock child opacity (0.6/0.8) and covering engine-created lines. Do not restore per-line opacity bookkeeping; custom line color remains per-line wash. Contained-line CSS is gated by the reversible `HPColorsRewriteBarLines` class so disabled UNITS gates retain stock lines.

## Editor and canvas

The editor has 20 tabs on six rails: GENERAL (Master, Layout, Name & Appearance), ENEMY (Bar, Heal & Shield, HP Text, Pulse, Kill Marker), ALLY (Bar, Heal & Shield, HP Text, Pulse), INDICATORS (Pips & Level, Ultimate, Stamina, Pickup Timers), UNITS (NPCs, Neutrals, Buildings), then PRESETS (Library). Every row has a control and is visible unless its feature is off; there is no shared fold or text-only heading row. Layout owns only bar size, position, and accessory anchoring; name, HP text, level, ultimate, stamina, pulse-time text, and pickup offsets stay on their feature pages. Pips & Level owns pip colors and opacity; opacity multiplies stock line opacity for every team with or without custom color. The eight movement sliders retain ±30 px (X) / ±20 px (Y) physical windows; typed values reach full bounds. Stamina owns shape, size, offsets, and color. Preserve layered Reset-to-Base and captured RESET PAGE keys; no-base RESET uses new shipped defaults. Old explicit-own presets without an All Heroes base pin frozen fallback keys. Retired formats and inert max-team/precise-pip keys have no UI/reset home. Saved percent/current formats show a one-time native-number note.

NAME & APPEARANCE also owns OWN HUD HEALTH COLOR (segmented OFF/TEAM/CUSTOM) and OWN HUD CUSTOM COLOR (dimmed and inert unless CUSTOM). These optional rows must not block legacy pak01 layout boot. The settings use existing scopes, conditions, Undo, Reset Page, durable save, and transfer; live bottom-HUD rendering remains unverified.

TEXT OUTLINE rows belong to ENEMY HP Text, ALLY HP Text, and Name & Appearance. The color popup embeds the stock `CitadelColorPicker` and includes its stock stylesheet; custom HSL sliders are removed. Accept only valid 0–255 RGB channels from `CitadelColorPickerColorChanged(r,g,b)`. Seed the picker through `HexValue` plus `TextEntryChanged` with the seed event suppressed. Keep one Undo entry per picker session, restore the opening value on Escape, and isolate condition drafts from live settings. If the native panel is unavailable, retain hex-only entry and emit one warning. Native picker behavior is VM-tested only and still needs in-game confirmation.

WindowRoot-scoped UnitStatus, InfoHealthContainer, and UnitHealthbarsContainer are full-canvas with noclip. CSS places compact leaves at stock positions; reversible right-margin compensation preserves native labels on non-200px canvas widths. InfoHealthContainer owns damage wiggle/transition, and wiggle/stock scaling origins stay at the old frame center. Stock defaults and unclipped movement were confirmed in game for bf49089, not the new defaults; do not claim unlimited engine drawing. HP text and pulse-time text store CSS px at 100% bar size; ult/level store raw ×0.1 CSS px at 100%. All scale with bar width on X and height on Y; display and accept offsets as percentages of the stock 76×18 bar, including conditions. Other legacy movement keys retain ×0.1 CSS-pixel display. HP-text bounds are X ±334 and Y ±350 stored units. Pre-v:2 codes and old presets migrate HP-text offsets once using their bar scale; ult/level already scaled and are not migrated. Only HP text/names clamp; ult/level/stamina remain free. Tall health dividers and kill marker span the primary bar; minor ticks remain 8px bottom-aligned inside it. Level tier recoloring writes the full `border: 2px solid <tier>` rim; the level ≥19/≥27 solid-disc fix still needs in-game confirmation.

## Source and generated files

Edit only `hp_colors_rewrite_v2/` source, the focused validators under `scripts/`, and `build_hp_colors_rewrite_v2.ps1` when the package contract changes. Do not edit compiled output, staging trees, VPKs, archives, or the read-only dependency clones.

## Verification

Run:

```powershell
node --test scripts/validate-hp-colors-rewrite-v2-*.test.js
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v2.ps1 -SkipDeploy
```

The build wrapper runs these validators again against source and Closure output, checks the compiled asset set and VPK contents, and writes root `pak02_dir.vpk`. `-SkipDeploy` leaves the installed addon untouched.

The storage suite is end-to-end: it boots the real menu, storage, and renderer against a disk-backed fake Steam page across simulated restarts and writes `.tmp/hpv2-storage-e2e.json`.

Production renderer contains no profiling collector, accessory diagnostic, timing switches, diagnostic state or root-budget attributes. Retain the blanket no-diagnostic validator.

The c7998a0 audit measured idle paint-tick class reads 52→2, parent reads 15→4, and layout reads 70→54 with no behavior changes found by review. These are synthetic work counts, not live FPS evidence.

After an authorized deployment, restart Deadlock before the live smoke test. Verify enemy and ally rendering, fixed and gradient thresholds, exclusions, dimensions, position, feedback colors, ultimate icons, native HP text and saved-format retirement, pips, levels, pulses, kill marker behavior, hero scopes (including the six prerelease additions), ability conditions, presets, HPCR2 settings transfer, HPCRP1 preset transfer, Escape cancel/resume behavior, and supported UI scales. Check NPC, neutral, and building gates both on and off: shared bar geometry, relation-specific native HP text, contained lines, and stock restoration. Check LINE OPACITY on lines created after the setting changes, with and without custom color. Compare early enemy and ally panels with an Infernus bot spawned after hydration: inspect `WorldUIRoot` classes, level rim and number, stock ready icon versus cooldown overlay, and inline/computed visibility in F7; compare accessory raw and CSS-pixel bounds/margins at 100% and non-100% settings, then confirm a late context with initially zero layout settles without a menu edit. Restore starting user settings. Capture at most the 80 attempted diagnostic records, inspect the console, and remove the temporary probe before release. Automated tests and console records cannot prove live panel lineage, visual success, or frame cost; do not claim live success without the fresh-restart visual check.

Check OWN HUD HEALTH COLOR in OFF, TEAM on both teams, and CUSTOM, with custom input inert outside CUSTOM. Verify only the local bottom-HUD left health fill changes, and OFF/master off/hydration pending/unknown or conflicting team releases its owned wash. Exercise HUD replacement, hero scopes, ability conditions, Undo, page reset, save/restart, and HPCR2/HPCRP1 round trips; legacy pak01 must boot without these rows. This feature has no live-test confirmation yet.