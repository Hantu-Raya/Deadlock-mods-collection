# Swap the hook target's client class in the spectator VData

Accepted 2026-10-16 (the user, after seeing the cost live).

The client class `CCitadel_Modifier_HookTarget` always reports itself hidden, so a hooked enemy never gets a status panel and the top bar cannot show the pull. The spectator VData therefore gives `modifier_citadel_hooktarget` the client class `modifier_citadel_link`, which decodes the same network payload, keeps the chain effect and uses the VData hidden check, plus `m_AG2BaseAction lifted` to restore the pose. The evidence is in [ENGINE.md](../../ENGINE.md#bebops-hook-and-its-client-class).

The cost is on the observer's screen only: HookTarget's client motion controller is gone, so the victim stays in place instead of being pulled. The server, the players and the outcome are unaffected. This was seen live on 2026-10-16, reverted, then re-added at the user's request. Without the swap, showing the pull would need a native bridge to the hook victim that Panorama does not expose. The swap is the `classSwaps` entry of `spectator-status.json`; the build verifies it in the packed VData. Observer HUD shares the spec and so shares this cost ([its ADR](../../../observer_hud/docs/adr/0002-spectator-vdata-in-one-pak.md)).
