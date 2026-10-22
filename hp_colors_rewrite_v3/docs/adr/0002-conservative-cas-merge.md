# Preserve touched scalar edits; conservatively merge bundle entities

We chose conservative conflict refusal for preset identities, metadata and preset order while retaining existing local touched-slot precedence for scalar settings. The normative mechanics have one home in the [storage contract](../../SPEC.md#storage-contract).

A heuristic that accepts matching intermediate values or prefers a newer-looking local bundle can silently lose a competing writer's work. The chosen policy trades more visible CONFLICT refusals for preservation of both drafts; complete raw-record commit identity avoids guessing provenance from coincidentally equal fields. The checksum is neither collision-proof nor proof of cross-native-CEF transaction serialization. See [PLAN D8](../../PLAN.md#d8-storage-same-page-same-protocol-version-new-capability), [storage](../../panorama/scripts/hp_colors_v3_storage.js) and the [storage audit](../../issues/audit-full-astra-2026-10-15.md#round-6-audit-m3).
