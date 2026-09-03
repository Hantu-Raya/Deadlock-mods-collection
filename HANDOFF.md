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

- Derive the segment container's scale origin from the live bar center. Max-HP layouts do not share one fixed origin.
- Leave engine-owned bar `width` and `max-width` untouched.
- Keep level and ultimate panels aligned to bar scale in both modes.
- Apply bar X/Y offsets to those panels only when `accessoryAnchorEnabled` is on.
- Scale independent X offsets with bar width in both modes. Keep independent Y offsets active without scaling them.
- Cancel an active slider gesture when a section reset is confirmed so a late mouse-up cannot restore stale values.
- Keep accessories off the bar so low-percentage kill markers remain visible.
- Ship no geometry logger, recursive diagnostic traversal, or debug state.

## Release state

`GATES.md` is authoritative for automated evidence. The canonical build deployed:

```text
G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak02_dir.vpk
SHA-256: 04e22a85677f0816a8a681e500c8a4d796c26a993bf75940b917e5040a9f22aa
```

The QOLLOCK build still accepts only the pinned pak03 hash `ffa7c340f5c73763047bd359c1569d0ee03a3e08d4254e2e71c089b3922d748e`. The installed pak03 now hashes to `94030d21d8cf4e3a9a86d35d8acf276203db0c32673d2822e42be5b8b7040927` and lacks `panorama/scripts/core/ql_namespace.vjs_c`, so the wrapper rejects it. Do not refresh the QOLLOCK baseline from that file.

After replacing a VPK, restart Deadlock. Check both anchor modes, independent level and ultimate offsets, `800`, `2100`, and `4100` max HP, an `18%` kill marker, section reset, no Rewrite exceptions, and supported UI scales. Automated tests do not prove live rendering or frame cost.
