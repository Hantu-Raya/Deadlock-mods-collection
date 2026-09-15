# HP Colors Rewrite v2

## Scope

`hp_colors_rewrite_v2/` owns the session-scoped ESC editor and live v2 unit-status renderer. Keep its centered segment geometry and `HP_COLORS_V2_CONFIG` transport. Read `FEATURES.md` for feature behavior and manual smoke scenarios; use source and the build wrapper for current implementation details.

The lane is session-scoped. Do not add durable persistence, Anita compatibility, Reset All, or legacy v99 support. Preserve legacy HPCR2 imports and HPCRP1 preset compatibility; current HPCR2 exports include the versioned `hpv2` extension for V2 settings. ShowRank Barebones support is opt-in build-stage Escape composition; keep canonical runtime code independent.

Package ownership is fixed: the Rewrite builder seed is pak01, the generic preset builder is pak96, and the Rewrite v2 runtime is pak02.

## Source ownership

```text
hud_escape_menu.xml
  -> hp_colors_v2_contract.js
  -> hp_colors_v2_state.js
  -> hp_colors_v2_menu.js + hp_colors_v2_menu.css

unit_status_overlay_v2.xml
  -> hp_colors_v2_contract.js
  -> unit_status_v2_colors.js + unit_status_v2.css
```

- `hp_colors_v2_contract.js` owns the 72-key legacy codec, v2-only extension keys, shipped defaults, normalization, bounds, and enum policy.
- `hp_colors_v2_state.js` owns canonical values, effective resolution, scopes, presets, conditions, Undo, import/export, and state transitions through one immutable `send()` and `read()` factory.
- `hp_colors_v2_menu.js` owns Panorama panels, Escape lifecycle, rendering, HSL controls, replay, transport, builder seed hydration, and clipboard effects.
- `unit_status_v2_colors.js` owns live-bar discovery, role and hero classification, colors, exclusions, feedback controls, dimensions, position, ultimate icons, readouts, pips, levels, pulses, and kill markers.

The state module and renderer each capture the contract factory and remove it from `$`. The menu consumes `$.HPColorsV2StateFactory`; it does not load the contract directly.

## Initialization

- `hud_escape_menu.xml` calls `$.HPColorsMenuBoot()` on load. Resolve required panels, restore state, create dynamic controls, then bind events. Publish and start replay/identity watches only after setup succeeds.
- Boot is idempotent after success. Failed control creation leaves boot retryable through another explicit call; there is no automatic retry loop. Preserve both missing-panel and thrown-API recovery.
- Hydrate through the state factory with `{sessionRaw, publishedRaw, builderPresetRaw}`. Existing session state takes precedence over the optional read-only builder seed. Preserve the published effective snapshot while hero identity settles.
- The renderer registers its config event handler before `scan()`. The first scan reads the root snapshot and discovers live panels, then `paintColors()` starts. Keep one scan loop and one paint loop per context.
- Exercise startup changes in the editor VM validator, including failed setup, successful retry, and repeated boot without duplicate publication or scheduled work.

## Runtime rules

- Keep all state session-scoped.
- Preserve the v2 message magic, root attribute, payload version, and `{magic_word,version,revision,values}` shape.
- Publish every effective change immediately and replay unchanged snapshots for late unit-status contexts.
- Keep neutral-first classification and reject unknown ownership.
- Discover only the live `UnitHealthbarsContainer` lineage. Never style the hidden `old_bar` copy.
- Cache panel references and unchanged writes. Long-lived scheduled work needs stale-generation checks.
- For bar width, max-HP segments, X/Y position, levels, ultimate icons, or kill markers, read `design.md` and preserve its measured left-edge formula.
- Use Source 2 CSS only. Keep passive overlays `hittest="false"` and hidden panels collapsed.

## Source and generated files

Edit only `hp_colors_rewrite_v2/` source, the focused validators under `scripts/`, and `build_hp_colors_rewrite_v2.ps1` when the package contract changes. Do not edit compiled output, staging trees, VPKs, archives, or the read-only dependency clones.

## Verification

Run:

```powershell
node --test scripts/validate-hp-colors-rewrite-v2-baseline.test.js scripts/validate-hp-colors-rewrite-v2-editor.test.js scripts/validate-hp-colors-rewrite-v2-parity.test.js scripts/validate-hp-colors-rewrite-v2-state.test.js scripts/validate-hp-colors-rewrite-v2-style.test.js
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v2.ps1 -SkipDeploy
```

The build wrapper runs these validators again against source and Closure output, checks the compiled asset set and VPK contents, and writes root `pak02_dir.vpk`. `-SkipDeploy` leaves the installed addon untouched.

Release builds contain no temporary profiling collector or timing switches. Preserve native-style readback, alias restoration, and failed-write retry coverage in the style validator. Use `-ShowRankBarebones` only with its required pak89 installed; use the separate QOLLOCK wrapper for pak03 compatibility.

After deployment, restart Deadlock before the live smoke test. Verify enemy and ally rendering, fixed and gradient thresholds, exclusions, dimensions, position, feedback colors, ultimate icons, all readout modes, pips, levels, pulses, kill marker behavior, hero scopes, ability conditions, presets, HPCR2 settings transfer, HPCRP1 preset transfer, Escape cancel/resume behavior, and supported UI scales. Automated tests cannot prove live panel lineage, rendering, or frame cost.