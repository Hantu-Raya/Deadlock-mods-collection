# HP Colors Rewrite v2

## Scope

`hp_colors_rewrite_v2/` ports every implemented feature from `hp_colors_rewrite/` onto the v2 unit-status layout. It keeps v2's live-bar lineage, segment aligner, stock panel geometry, red-and-cream editor branding, and `HP_COLORS_V2_CONFIG` transport.

The lane is session-scoped. Do not add durable persistence, Anita compatibility, Reset All, legacy v99 support, or ShowRank Barebones integration. HPCR2 settings codes and HPCRP1 preset codes remain byte-compatible with v1.

Package ownership is fixed: the Rewrite builder seed is pak01, the generic preset builder is pak96, and the Rewrite v2 runtime is pak02.

## Source ownership

```text
hud_escape_menu.xml
  -> hp_colors_v2_contract.js
  -> hp_colors_v2_state.js
  -> hp_colors_v2_menu.js + hp_colors_v2_menu.css

unit_status_overlay_v2.xml
  -> hp_colors_v2_contract.js
  -> unit_status_v2_colors.js
  -> unit_status_v2_segment_align.js + unit_status_v2.css
```

- `hp_colors_v2_contract.js` owns the 72-key legacy codec, v2-only extension keys, shipped defaults, normalization, bounds, and enum policy.
- `hp_colors_v2_state.js` owns canonical values, effective resolution, scopes, presets, conditions, Undo, import/export, and state transitions through one immutable `send()` and `read()` factory.
- `hp_colors_v2_menu.js` owns Panorama panels, Escape lifecycle, rendering, HSL controls, replay, transport, builder seed hydration, and clipboard effects.
- `unit_status_v2_colors.js` owns live-bar discovery, role and hero classification, colors, exclusions, feedback controls, dimensions, position, ultimate icons, readouts, pips, levels, pulses, and kill markers.
- `unit_status_v2_segment_align.js` is the only owner of the right margin and base counter transform. User offsets must remain independent.

Both consumers load the contract first, capture it, and remove the temporary factory from `$`.

## Runtime rules

- Keep all state session-scoped.
- Preserve the v2 message magic, root attribute, payload version, and `{magic_word,version,revision,values}` shape.
- Publish every effective change immediately and replay unchanged snapshots for late unit-status contexts.
- Keep neutral-first classification and reject unknown ownership.
- Discover only the live `UnitHealthbarsContainer` lineage. Never style the hidden `old_bar` copy.
- Cache panel references and unchanged writes. Long-lived scheduled work needs stale-generation checks.
- The segment aligner owns segment margin and stock counter alignment. The renderer owns feature offsets and visibility.
- Use Source 2 CSS only. Keep passive overlays `hittest="false"` and hidden panels collapsed.

## Source and generated files

Edit only `hp_colors_rewrite_v2/` source, the focused validators under `scripts/`, and `build_hp_colors_rewrite_v2.ps1` when the package contract changes. Do not edit compiled output, staging trees, VPKs, archives, or the read-only dependency clones.

## Verification

Run:

```powershell
node --test scripts/validate-hp-colors-rewrite-v2-baseline.test.js scripts/validate-hp-colors-rewrite-v2-editor.test.js scripts/validate-hp-colors-rewrite-v2-parity.test.js scripts/validate-hp-colors-rewrite-v2-state.test.js
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite_v2.ps1 -SkipDeploy
```

After deployment, restart Deadlock before the live smoke test. Verify enemy and ally rendering, fixed and gradient thresholds, exclusions, dimensions, position, feedback colors, ultimate icons, all readout modes, pips, levels, pulses, kill marker behavior, hero scopes, ability conditions, presets, HPCR2 settings transfer, HPCRP1 preset transfer, Escape cancel/resume behavior, and supported UI scales. Automated tests cannot prove live panel lineage, rendering, or frame cost.