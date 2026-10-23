# Host the world sampler in `citadel_status_effect.xml`

World healthbars are not under `CitadelHudRoot`, so the HUD host cannot read their status panels. DLF overrides `unit_status_overlay_v2.xml` for this, which HP Colors v2 and v3 and test_hpv2 also replace. This mod instead adds one script include (and a short stun-hiding stylesheet) to the stock `citadel_status_effect.xml`, which `CitadelStatusEffect` loads once per healthbar. Only DLF overrides that file in the repo.

Spike 1b passed on 2026-10-22 (client 6812, demo 121685912): one instance per world healthbar plus two for the HUD's own lists, hero bars distinguishable after a delay, relay messages reaching the HUD host. The fallback (overriding `unit_status_overlay_v2.xml`) was not needed.

Consequences:

- The script decides in one check whether it is on a hero bar and idles otherwise. Never decide at boot: `CLASS_PLAYER` lands after layout load on the world panel above the dialog, and world panels are recycled, so a hero bar re-checks every sample ([ENGINE.md](../../ENGINE.md#world-healthbars-and-the-status-column)).
- Snapshots leave through a sibling relay (`debuff_relay.xml`), because a `ClientUIDialogPanel` consumes its own events.
- A stylesheet or script error in this layout breaks every healthbar. Keep selectors short (a long one crashed the game at start in DLF).
- The `RULES` table must equal `dlf/spectator-status.json`.

Sources: [PLAN.md](../../PLAN.md) "Ability status column" and phase 1b; [decisions/spike-injection.md](../../decisions/spike-injection.md) "Spike 1b" and "v1 live run".
