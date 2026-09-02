# Handoff: HP Colors Rewrite v2

## Current implementation

Rewrite v2 is the canonical session-scoped runtime. It supports the ESC editor, HPCR2 settings, HPCRP1 presets, hero routing, ability conditions, healthbar feedback, stamina controls, and builder-seeded session presets. It does not provide durable in-game persistence, Anita compatibility, Reset All, legacy v99 codes, or ShowRank integration.

The runtime keeps one normalized state owner and one healthbar renderer:

- `hp_colors_v2_contract.js` defines settings, defaults, bounds, and normalization.
- `hp_colors_v2_state.js` owns state transitions, effective resolution, session presets, conditions, and Undo.
- `hp_colors_v2_menu.js` owns Panorama controls, rendering, lifecycle observation, transport, and clipboard effects.
- `unit_status_v2_colors.js` owns live-bar discovery, cached health sampling, classification, visual writes, and cleanup.

The package contains the eight assets listed in `hp_colors_rewrite_v2/design.md`. The deleted `unit_status_v2_segment_align.js` has no replacement process. Centering and accessory alignment now run inside the existing renderer and health-sampling pass.

## Geometry guardrail

Read `hp_colors_rewrite_v2/design.md` before changing bar width, max-HP segments, position, level, ultimate, or kill-marker geometry. Keep these rules:

- Center and scale the complete segment container around `50% 50%`.
- Leave engine-owned bar `width` and `max-width` untouched.
- Align level and ultimate panels from the measured live bar width, not pip count or segment class.
- Recompute alignment when the live width changes, including reset at `100%`.
- Keep accessories off the bar so low-percentage kill markers remain visible.
- Ship no geometry logger, recursive diagnostic traversal, or debug state.

## Release state

`GATES.md` is authoritative for automated evidence. The QOLLOCK build remains blocked until this exact upstream file is restored:

```text
G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak03_dir.vpk
SHA-256: ffa7c340f5c73763047bd359c1569d0ee03a3e08d4254e2e71c089b3922d748e
```

After replacing a VPK, restart Deadlock. Check `800`, `2100`, and `4100` max HP at default and changed widths. Confirm level and ultimate alignment, an `18%` kill marker, section reset, no Rewrite exceptions, and supported UI scales. Automated tests do not prove live rendering or frame cost.
