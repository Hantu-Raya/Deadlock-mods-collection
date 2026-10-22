# Version sparse records instead of freezing a second baseline

Save and share records use sparse setting-slot values interpreted by their record version. A default change requires a versioned upgrade preserving the old meaning of absent values; it must not introduce another permanently frozen default set.

Full records avoid omission semantics but exceed the 4,096-character settings box and make a 128-preset library impractical within the 192,000-character store cap. Versioning accepts explicit upgrade work instead of v2's permanent shipped-versus-frozen-baseline split. Slot identities and upgrade history remain compatibility contracts. See [PLAN D4](../../PLAN.md#d4-versioned-sparse-records), [record metadata](../../settings/record.json) and [codec](../../panorama/scripts/hp_colors_v3_codec.js).
