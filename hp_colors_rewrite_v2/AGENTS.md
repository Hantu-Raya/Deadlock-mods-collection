# HP Colors Rewrite v2

## Scope

`hp_colors_rewrite_v2/` owns the ESC editor, its durable local save, and the live v2 unit-status renderer. Keep its centered segment geometry and `HP_COLORS_V2_CONFIG` transport. Read `FEATURES.md` for feature behavior and manual smoke scenarios; use source and the build wrapper for current implementation details.

Settings, scopes, presets, and conditions persist on this PC through `hp_colors_v2_storage.js`. Do not add Anita compatibility, Reset All, or legacy v99 support. Preserve legacy HPCR2 imports and HPCRP1 preset compatibility; current HPCR2 exports include the versioned `hpv2` extension for V2 settings. ShowRank Barebones support is opt-in build-stage Escape composition; keep canonical runtime code independent.

Package ownership: the Rewrite v2 runtime is pak02 and the generic preset builder is pak96. v2 no longer reads a builder pak01 seed; an installed old pak01 overrides the ESC layout, and the menu reports it as `OLD PRESET VPK`. That legacy layout has only four rail buttons, so it boots without the PRESETS and UNITS pages or new APPEARANCE controls until pak01 is removed.

## Durable save

- A hidden `CitadelHTMLPanel#HPColorsV2Store` opens `file://`; its localStorage lives in Steam's CEF profile. Panorama drives the page with `SetURL("javascript:...")`; the page answers through `HTMLTitle` titles prefixed `HPV2S1:`.
- Keys are data, not configuration: `hantu.hpcolors.v2/state` and `hantu.hpcolors.v2/state.prev`. Never read, write, or delete any other key on the shared origin (Third Eye and QOLLOCK live there).
- Records are `HPV2S1.<fnv1a32>.<base64url envelope>`; envelope schema 2 embeds the body object (schema 1 string bodies still load); schema 3 is written when All Except scopes exist and all three schemas load. Classify absent/valid/corrupt/unsupported, including body shape, before normalizing. A corrupt or absent current falls back to `prev`; a newer-schema current never does. A commit rotates the current record into `prev` only when its checksum matches the record this bridge validated or wrote.
- Send no `javascript:` script until `HTMLURLChanged` reports a `file:` document (a script sent while the load is pending can abort it to `http://error/`), inject once per page on its first title (2 s fallback), and accept readiness only from a `file:` hello; the about:blank placeholder answers too. Load `file:///C:/` once, then bare `file://` once if the first ends on `http://error/` (bare `file://` failed three live runs in a row); both share the `file://` storage origin. A lost reply fails its request after 5 s; a timed-out read is asked once more under a fresh id, and the editor's save retry below is the only other retry. A repeated or stale `http://error/` event never loads a third address or replaces a committed page.
- Writes stay closed until a read in this process proves what the store holds. Failed, corrupt, or future-schema reads block saving for the process instead of overwriting with defaults.
- The saved body is `sessionRaw` without `effectiveRevision` and with only non-default values. Saves throttle at 1.5 s, flush on editor close, skip unchanged bodies, retry failures with backoff (status SAVE RETRYING, then SAVE UNAVAILABLE), and keep one active plus one replaceable pending write. After Forget, only a deliberate edit (not `AUTOMATIC_INTENTS`) creates a save again.
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

- `hp_colors_v2_contract.js` owns the 72-key legacy codec, 62 append-only v2 extension slots, shipped defaults, normalization, bounds, and enum policy. The newest slots are enemy/ally pip-color enable and color keys, `pipOpacity` (default 60, bounds 0–100), and `staminaShape` (`arrow` default, `circle`, `box`). Missing shape derives `box` when stamina size or color was customized, otherwise `arrow`. Retired keys (the three color exclusions, ghoul opacity, legacy readoutFormat slot 29 and allyReadoutFormat extension slot 30) keep their codec slots but are not editable; retired values, ability rules, and `own` keys are dropped on load and import instead of rejecting the save or code that carries them.
- `hp_colors_v2_state.js` owns canonical values, effective resolution, scopes, presets, conditions, Undo, import/export, and state transitions through one immutable `send()` and `read()` factory.
- `hp_colors_v2_storage.js` owns the hidden-page bridge, record codec, chunked read/write/delete protocol, and timeouts through `$.HPColorsV2StorageFactory`.
- `hp_colors_v2_menu.js` owns Panorama panels, Escape lifecycle, rendering, HSL controls, replay, transport, save gating/status/Forget, and clipboard effects.
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
- Classify unit kind separately from relation. Neutral-first precedence remains; only known neutral NPCs get the explicit fixed-fill opt-in. Unknown type/relation and conflicting enemy/friend ownership stay stock.
- Discover the live `UnitHealthbarsContainer` → direct `UnitHealthbar.UnitHealthbarContainer` → direct `UnitHealthbarInner` lineage. Never adopt `UnitShieldbar`, its duplicate IDs, or a retired `old_bar` tree.
- Cache panel references and unchanged writes. Long-lived scheduled work needs stale-generation checks; optional panels must not create retry loops.
- For scale, position, readout, level, ultimate, stamina, or marker geometry, read `design.md` and use measured 6722 stock-relative CSS-pixel bounds: normalize every `actual*` layout read by that panel's axis UI scale, not the world panel's or another part's. Defer original accessory-center capture until positive panel/stack/primary layout is available, and retry on the existing reconciliation cadence. Keep `UnitHealthbarValue` native current-only: no percent/custom counter, inferred maximum, parsing or text write. Names use captured style ownership, never text/visibility writes; custom colors keep brightness 0.8 and spectator alpha.
- Use Source 2 CSS only. Keep passive overlays `hittest="false"` and hidden panels collapsed.
- Unit-status bars are always rectangular without the outer background, including shields and previews. The stock CSS prefix intentionally deletes three healthbar masks and eight container background declarations (and six emptied relation rules); retain the black inner backing and all other stock declarations. Do not add a shape toggle or inline mask override.

## Editor and canvas

The editor has 20 tabs on six rails: GENERAL (Master, Layout, Name & Appearance), ENEMY (Bar, Heal & Shield, HP Text, Pulse, Kill Marker), ALLY (Bar, Heal & Shield, HP Text, Pulse), INDICATORS (Pips & Level, Ultimate, Stamina, Pickup Timers), UNITS (NPCs, Neutrals, Buildings), then PRESETS (Library). Every row has a control and is visible unless its feature is off; there is no shared fold or text-only heading row. Layout owns only bar size, position, and accessory anchoring; name, HP text, level, ultimate, stamina, pulse-time text, and pickup offsets stay on their feature pages. Pips & Level owns pip colors and opacity; opacity applies only to a team with custom pip color enabled. Stamina owns shape, size, offsets, and color. RESET PAGE uses captured page keys; hero Current resets to Base. Retired formats and hidden inert max-team/precise-pip keys have no UI/reset home. Saved percent/current formats show a one-time native-number note.

WindowRoot-scoped UnitStatus, InfoHealthContainer, and UnitHealthbarsContainer are full-canvas with noclip. CSS places compact leaves at stock positions; reversible right-margin compensation preserves native labels on non-200px canvas widths. InfoHealthContainer owns damage wiggle/transition, and wiggle/stock scaling origins stay at the old frame center. Stock defaults and unclipped movement were confirmed in game for bf49089; do not claim unlimited engine drawing. Preserve all raw geometry meanings; display the eight legacy movement keys as ×0.1 CSS px, including conditions. Only HP text/names clamp; ult/level/stamina remain free. Tall health dividers and kill marker span the primary bar; minor ticks remain 8px bottom-aligned inside it.

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

After an authorized deployment, restart Deadlock before the live smoke test. Verify enemy and ally rendering, fixed and gradient thresholds, exclusions, dimensions, position, feedback colors, ultimate icons, native HP text and saved-format retirement, pips, levels, pulses, kill marker behavior, hero scopes, ability conditions, presets, HPCR2 settings transfer, HPCRP1 preset transfer, Escape cancel/resume behavior, and supported UI scales. Compare early enemy and ally panels with an Infernus bot spawned after hydration: inspect `WorldUIRoot` classes, level rim and number, stock ready icon versus cooldown overlay, and inline/computed visibility in F7; compare accessory raw and CSS-pixel bounds/margins at 100% and non-100% settings, then confirm a late context with initially zero layout settles without a menu edit. Restore starting user settings. Capture at most the 80 attempted diagnostic records, inspect the console, and remove the temporary probe before release. Automated tests and console records cannot prove live panel lineage, visual success, or frame cost; do not claim live success without the fresh-restart visual check.