# Keep pre-CAS store pages session-only

We chose session-only editing rather than unconditional writes when a cached store page lacks v3's write-protection capability. The exact readiness and retry requirements belong to the [storage contract](../../SPEC.md#storage-contract).

Keeping protocol version 1 preserves existing v2 clients; capability negotiation adds v3's stronger write contract without breaking them. The trade-off is temporary unavailability and responsibility for preserving unacknowledged drafts when Pages/CEF serves old bytes; publication and bridge renewal do not guarantee cache eviction. Weakening the gate would exchange visible unavailability for possible data loss. See [PLAN D8](../../PLAN.md#d8-storage-same-page-same-protocol-version-new-capability), [page pin](../../vendor/hpv2-store.pin.json) and [bridge](../../panorama/scripts/hp_colors_v3_storage.js).
