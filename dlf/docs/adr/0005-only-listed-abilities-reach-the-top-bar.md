# Show only listed abilities on the top bar

Decided by the user 2026-10-14.

The top-bar debuff column draws only statuses of abilities listed in `spectator-status.json`. Item debuffs, Shoulder Charge and unlisted abilities never reach it, even though the spectator VData makes every stun record visible. The list grows by explicit requests (Pocket, Mo & Krill, Sinclair, Viscous 2026-10-16; Billy 2026-10-20; nine abilities and Lady Geist's swap 2026-10-21 from `cl_modifier_dump` output).

This keeps the column readable on a broadcast and bounds the work: `RULES` in `dlf_debuff_world.js` carries one entry per spec ability (`maxSeconds`, `buff`, `minStacks`, `ignore`), and the validator compares it to the spec. An ability that is missing from the spec shows nothing, by design. The table is in [SPEC.md](../../SPEC.md#debuff-column).
