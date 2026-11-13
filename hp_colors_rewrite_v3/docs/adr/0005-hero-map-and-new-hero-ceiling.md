# Use an explicit hero map and one fallback preset

A bundle maps known heroes to preset identities and optionally selects one hero default, rather than retaining Selected/Except/All modes on every preset. The active source identity is retained separately so automatic routing to the same preset does not discard edits, including after restart.

v2 migration resolves first Selected → first matching Except → first All over the current hero catalog. This removes competing per-preset routing modes, but intentionally has a ceiling: heroes added to a later catalog fall to `heroDefault`, not an older All-Except preset. Reintroducing dynamic per-preset exclusions would change the persisted routing model and migration meaning. See [ticket 23](../../../_archive/hp_colors_rewrite_v3/issues/23-hero-detection-and-hero-preset-routing.md), [converter](../../panorama/scripts/hp_colors_v3_from_v2.js) and [routing tests](../../tests/hero-routing.test.js).
