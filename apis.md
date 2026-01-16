# Deadlock API Research - DLL Analysis

**Date:** 2026-01-15  
**Binaries:** `server.dll`, `client.dll`, `panorama.dll`  
**Tool:** IDA Pro + MCP

---

## Executive Summary

Extensive reverse engineering reveals that **all the data we need exists** (hero IDs, player data, entity handles), but **Panorama JavaScript cannot access it**. The data is networked to the client but the JS sandbox doesn't expose the necessary APIs.

**Final Verdict:** Hero identity detection is NOT POSSIBLE via Panorama JS. The current buff timer implementation using powerup type icons + team colors is the production-ready solution.

---

## 1. Panorama JS API - CONFIRMED STATUS

### In-Game Test Results (api_test mod)

```
[MISSING] Players
[MISSING] Entities
[MISSING] Buffs
[MISSING] Game
[MISSING] GameUI
[MISSING] GameEvents
[MISSING] $.ListenToGameEvent
[OK] $.RegisterEventHandler
[OK] $.DispatchEvent
```

### API Availability Matrix

| API | Dota 2 | Deadlock | Notes |
|-----|--------|----------|-------|
| `Players` | ✅ | ❌ | Player iteration API |
| `Entities` | ✅ | ❌ | Entity query API |
| `Game` | ✅ | ❌ | Game state API |
| `GameUI` | ✅ | ❌ | Game UI API |
| `$.ListenToGameEvent` | ✅ | ❌ | VScript only (server-side) |
| `$.RegisterEventHandler` | ✅ | ✅ | UI events only |
| `$.RegisterForUnhandledEvent` | ✅ | ✅ | UI events only |
| `$.DispatchEvent` | ✅ | ✅ | Works |
| `$.CreatePanel` | ✅ | ✅ | Works |
| `$.Schedule` | ✅ | ✅ | Works |
| `Image.src` getter | ❌ | ❌ | Write-only in both |
| `GetDialogVariable` | ? | ❌ | Only SetDialogVariable* exists |

---

## 2. Client.dll Analysis - Internal Events (NOT Exposed)

### Minimap Events (Found in IDA, NOT accessible from JS)

| Event String | Address | Context |
|--------------|---------|---------|
| `MiniMapEntryMouseOverEvent` | `0x181ef27b0` | C++ internal only |
| `MiniMapEntryMouseOutEvent` | `0x181ef27d0` | C++ internal only |
| `MiniMapUnitSelectEvent` | `0x181ef2798` | C++ internal only |
| `MiniMapFoWUnitSelectEvent` | `0x181ef2778` | C++ internal only |
| `CitadelForceUpdateMinimapEntries` | `0x181ef2810` | C++ internal only |

**Test Result:** Registered via `$.RegisterForUnhandledEvent` - NONE fired.

### Rejuvenator Events (Internal to Music/Stinger Systems)

| Event String | Address | Triggered By |
|--------------|---------|--------------|
| `RejuvinatorAcquired` | `0x181ac0508` | Music Manager |
| `RejuvinatorUsed` | `0x181ac0538` | Music Manager |
| `RejuvinatorExpired` | `0x181ac0550` | Music Manager |
| `EStinger_RejuvinatorClaimed_Friendly` | `0x181acf2d0` | Stinger system |
| `EStinger_RejuvinatorClaimed_Enemy` | `0x181acf2f8` | Stinger system |
| `OnPowerupActiveChanged` | `0x181aa7388` | Powerup spawner |

**Analysis:** These are UserMsg events processed by C++ systems. The decompiled handler at `0x180460A60` shows they go to the music manager, not exposed to Panorama UI.

### Minimap Rendering (C++ Native)

| Structure | Description |
|-----------|-------------|
| `CHudMinimap::PanoramaMinimapEntry_t` | Minimap icons stored in C++ RB-trees |
| `CHudMinimap::SimpleMinimapEntry_t` | Simple entries |
| `HudMinimapRender` | C++ native rendering panel |

**Key Finding:** Hero icons on minimap are rendered by `HudMinimapRender` (C++ native), NOT as Panorama panels. There are no `CitadelHeroImage` panels in the minimap hierarchy.

---

## 3. Server.dll Analysis - Hero Identification System

### Types & Fields

| Symbol | Address | Description |
|--------|---------|-------------|
| `HeroID_t` | `0x181c4c708` | Hero ID type definition |
| `m_HeroID` | `0x181c4a288` | Hero ID field (networked) |
| `m_nHeroID` | `0x181c8a650` | Alternate hero ID field |
| `m_nNoSpawnHeroID` | `0x181c8a740` | No-spawn hero ID |
| `m_nCopiedHeroID` | `0x181e28278` | Copied hero ID |
| `m_hHeroPawn` | `0x181ca9718` | Handle to hero pawn entity |

### Hero Data System

| Symbol | Address | Description |
|--------|---------|-------------|
| `CCitadelHeroDataSystem` | `0x1827aa520` | Central hero data management class |
| `HeroDataSystem` | `0x181c6eb08` | Game system name string |
| `CCitadelHeroComponent::SetHero` | `0x181c93fc0` | Function to set hero on entity |

### Known Hero Names (Examples)

```
hero_inferno    @ 0x181c7e2a8
hero_kelvin     @ 0x181c7bfb0
```

---

## 4. Player Data Structures

### Core Classes

| Class | Address | Description |
|-------|---------|-------------|
| `CCitadelPlayerPawn` | `0x181beb5f8` | Player pawn entity class |
| `CCitadelPlayerPawnBase` | `0x181c3a4b8` | Base pawn class |
| `CCitadelPlayerController` | `0x181c79dc0` | Player controller class |
| `CBasePlayerController` | `0x181c77880` | Base controller class |
| `CBasePlayerPawn` | `0x181c35c80` | Base pawn class |

### Player Data (Networked)

| Symbol | Address | Description |
|--------|---------|-------------|
| `PlayerDataGlobal_t` | `0x181ca0528` | Global player data struct |
| `m_PlayerDataGlobal` | `0x181caaf88` | Networked player data field |
| `m_nAssignedLane` | `0x181ca9620` | Player's assigned lane |
| `m_vecPlayers` | `0x181c49998` | Player vector |
| `CitadelLobbyPlayerSlot_t` | `0x181c7a700` | Player slot type |

### Player Services

```
CPlayer_WeaponServices      @ 0x181d623d8
CPlayer_ItemServices        @ 0x181d623f8
CPlayer_AutoaimServices     @ 0x181d62410
CPlayer_ObserverServices    @ 0x181d62430
CPlayer_CameraServices      @ 0x181d624b8
CPlayer_MovementServices    @ 0x181d624d8
CPlayer_FlashlightServices  @ 0x181d62488
```

---

## 5. Minimap & Icon System

### Icon Replacement

| Symbol | Address | Description |
|--------|---------|-------------|
| `icon_replacement_hero` | `0x182088750` | Hero icon replacement |
| `icon_replacement_hero_minimap` | `0x182088780` | Minimap-specific hero icon |
| `CIconModifier_Hero` | `0x1827f55f0` | Hero icon modifier class |
| `CIconModifier_HeroMinimap` | `0x1827f5620` | Minimap hero icon modifier |
| `m_strIconHeroCard` | `0x181c6bfb0` | Hero card icon string |

### Minimap Settings

| Symbol | Address | Description |
|--------|---------|-------------|
| `minimap_update_rate_hz` | `0x181c2c130` | Minimap refresh rate |
| `materials\minimap\minimap.vmat` | (precached) | Minimap material |

---

## 6. Game Events

### Death Events

| Event | Address | Parameters |
|-------|---------|------------|
| `player_death` | `0x181c2cfa0` | `userid`, `entityid`, `assister1-5controller` |
| `entity_killed` | `0x181c326b8` | `entindex_attacker`, `entindex_victim`, etc. |

### Item/Pickup Events

| Event | Address | Description |
|-------|---------|-------------|
| `citadel_item_pickup` | `0x181c870a0` | General item pickup |
| `citadel_item_pickup_rejuv` | `0x181c870d8` | Rejuvenator pickup |
| `citadel_item_pickup_idol` | `0x181c90bf0` | Idol pickup |

### Rejuvenator Stingers

| Stinger | Address | When Triggered |
|---------|---------|----------------|
| `EStinger_RejuvinatorDescent` | `0x181c6fe80` | Rejuv dropping |
| `EStinger_RejuvinatorClaimed_Friendly` | `0x181c6fea0` | Ally claimed rejuv |
| `EStinger_RejuvinatorClaimed_Enemy` | `0x181c6fee0` | Enemy claimed rejuv |
| `EStinger_RejuvinatorExpired` | `0x181c6ff08` | Rejuv expired |
| `EStinger_Respawn_Rejuvinator` | `0x181c70058` | Respawn via rejuv |

### Event Parameters (Found in Events)

| Parameter | Address | Used In |
|-----------|---------|---------|
| `caster_hero_name` | `0x181c2b448` | Ability events |
| `enemy_hero_name` | `0x181c464e8` | Combat events |
| `ally_hero_name` | `0x181c464f8` | Team events |
| `pinged_hero_name` | `0x181c352f0` | Ping events |
| `entindex_player` | `0x181b16250` | Player events |
| `entindex_caster` | `0x181bed828` | Ability events |
| `entindex_attacker` | `0x181c32bc0` | Damage events |
| `entindex_victim` | `0x181c32bd8` | Damage events |
| `entindex_healed` | `0x181c32b80` | Heal events |
| `entindex_healer` | `0x181c32b90` | Heal events |
| `entindex_killed` | `0x181c32c98` | Death events |
| `entindex_ability` | `0x181c32cb8` | Ability events |
| `target_entindex` | `0x181beed48` | Target events |
| `caster_is_enemy` | (dynamic) | Boolean flag |

---

## 7. Game State & Rules

### Game States

| State | Address |
|-------|---------|
| `EGameState_Invalid` | `0x181c92130` |
| `EGameState_Init` | `0x181c92148` |
| `EGameState_WaitingForPlayersToJoin` | `0x181c92158` |
| `EGameState_HeroSelection` | `0x181c92180` |
| `EGameState_PreGameWait` | `0x181c921a0` |
| `EGameState_GameInProgress` | `0x181c921b8` |
| `EGameState_PostGame` | `0x181c921d8` |
| `EGameState_Abandoned` | `0x181c921f0` |
| `EGameState_End` | `0x181c92208` |

### Game Rules

| Symbol | Address | Description |
|--------|---------|-------------|
| `CCitadelGameRules` | `0x181c7a6e0` | Main game rules class |
| `m_eGameState` | `0x181c93068` | Current game state |
| `m_pGameRules` | `0x181c8b148` | Game rules pointer |

---

## 8. Powerup/Buff System

### Powerup Spawners

| Symbol | Address | Description |
|--------|---------|-------------|
| `CCitadel_PickupItemSpawner` | `0x181c360e0` | Pickup spawner class |
| `CCitadel_PickupItemSpawnerVData` | `0x181c35fb0` | Spawner VData |
| `CCitadel_PickupItemSpawnerAPI` | `0x181c37b60` | API class |
| `CCitadel_PickupItemSpawnerAPI::DropPowerup` | `0x181c37bf8` | Drop powerup function |
| `citadel_item_powerup_spawner` | `0x181c43ce0` | Entity class name |

### Rejuvenator System

| Symbol | Address | Description |
|--------|---------|-------------|
| `CCitadelItemPickupRejuv` | `0x181c90868` | Rejuv pickup class |
| `RejuvinatorParams_t` | `0x181c8d100` | Rejuv parameters |
| `ERejuvenatorRespawnMechanic` | `0x181bdbe30` | Respawn mechanic enum |
| `m_flRejuvinatorBuffDuration` | `0x181c90728` | Buff duration |
| `m_flRejuvinatorDropHeight` | `0x181c90748` | Drop height |
| `m_flRejuvinatorDropDuration` | `0x181c90768` | Drop duration |
| `m_flRejuvinatorRebirthDuration` | `0x181c90788` | Rebirth duration |
| `m_flRejuvinatorExpirationWarningTiming` | `0x181c90700` | Expiration warning |

### Modifiers

```
modifier_item_pickup_timer          @ 0x181c8b920
modifier_item_pickup_aura           @ 0x181c8ca90
modifier_item_pickup_aura_target    @ 0x181c8c298
modifier_held_item_pickup_aura      @ 0x181c8d0d0
modifier_item_punchable_rejuv       @ 0x181c8dec8
```

---

## 9. Script/Event System

### VScript Functions

| Function | Address | Description |
|----------|---------|-------------|
| `ListenToGameEvent` | `0x181d5ce90` | Subscribe to game events |
| `ScriptListenToGameEvent` | `0x181d5cea8` | Script wrapper |
| `StopListeningToGameEvent` | `0x181d5cef0` | Unsubscribe |
| `FireGameEvent` | `0x181d5cfd0` | Fire event |
| `FireGameEventLocal` | `0x181d5d030` | Fire local event |

### Custom Game Events

| Symbol | Address | Description |
|--------|---------|-------------|
| `CustomGameEventManager` | `0x181d47548` | Custom event manager |
| `CCustomGameEventManager` | `0x181d4cfb8` | Manager class |
| `CUserMsg_CustomGameEvent_t` | `0x181d47560` | Custom event message |

### Protobuf Messages

| Message | Address | Description |
|---------|---------|-------------|
| `citadel_gameevents.proto` | `0x181f48342` | Game events proto |
| `CMsgFireBullets` | (in proto) | Bullet fire message |
| `CMsgBulletImpact` | (in proto) | Bullet impact message |
| `CMsgPlayerAnimEvent` | (in proto) | Player animation event |
| `CCitadelUserMsg_HeroKilled` | (in code) | Hero killed message |

---

## 10. Entity System

### Entity Handles

| Type | Description |
|------|-------------|
| `CEntityIndex` | Entity index type |
| `CHandle<T>` | Handle to entity of type T |
| `CHandle<CCitadelPlayerPawn>` | Player pawn handle |
| `CHandle<CBasePlayerController>` | Controller handle |

### Entity Classes

```
CLASS_ITEM_PICKUP               @ 0x181d43508
citadel_item_pickup             @ 0x181c870a0
citadel_item_pickup_rejuv       @ 0x181c870d8
citadel_item_powerup_spawner    @ 0x181c43ce0
citadel_projectile              @ (precached)
```

---

## 11. What's NOT Accessible from Panorama JS

Based on our testing with `api_test` mod and DLL analysis:

### Missing APIs (Confirmed)

| API | Status | Notes |
|-----|--------|-------|
| `GetLocalPlayerPawn()` | Missing | String exists at `0x181d5aec0` but not exposed |
| `GetLocalPlayerController()` | Missing | String exists at `0x181d5af00` but not exposed |
| `Players` | Missing | No player iteration API |
| `Entities` | Missing | No entity query API |
| `Game` | Missing | No game state API |
| `GameUI` | Missing | No game UI API |
| `Image.src` getter | Missing | Write-only property |

### The Core Problem

```
SERVER.DLL                          CLIENT.DLL                      PANORAMA JS
   |                                    |                               |
   | -- NetworkVar (m_nHeroID) -------> | -- ??? ---------------------->| NO ACCESS
   | -- GameEvent (player_death) -----> | -- ??? ---------------------->| MAYBE?
   |                                    |                               |
   
Data flows from server to client, but Panorama JS sandbox blocks access.
```

---

## 12. Potential Workarounds

### Option 1: Game Event Listeners (Untested)

```javascript
// If $.ListenToGameEvent exists in Deadlock Panorama:
$.ListenToGameEvent("player_death", function(data) {
    // data.userid, data.entityid, etc.
});
```

**Status:** Needs in-game testing. May or may not be exposed.

### Option 2: Custom NetTables (Untested)

```javascript
// If CustomNetTableManager is exposed:
CustomNetTableManager.SubscribeNetTableListener("player_data", callback);
```

**Status:** Needs in-game testing. Likely not available.

### Option 3: C++ Plugin (Not Recommended)

Would require:
- DLL injection or `-insecure` mode
- Custom plugin to expose missing APIs
- Wouldn't work in matchmaking
- Weeks of development

---

## 13. Related Files

| File | Purpose |
|------|---------|
| `panorama.dll` | Panorama UI engine (analyzed previously) |
| `panoramauiclient.dll` | Game-specific Panorama panels |
| `client.dll` | Game client logic |
| `server.dll` | Game server logic (this analysis) |

---

## 14. Conclusions

1. **Hero identification data exists** - `HeroID_t`, `m_nHeroID`, hero names are all present
2. **Networked to client** - `NetworkVar_m_*` wrappers confirm data sync
3. **Game events fire** - `player_death`, `entity_killed`, pickup events exist
4. **Panorama is sandboxed** - JS cannot access entity/player APIs
5. **Image.src is write-only** - Cannot read hero icons from minimap panels

### For the Buff Timer Mod

The current implementation using **powerup type icons** (gun/survival/casting/movement) with **team color borders** (cyan/red) is the best achievable solution without engine-level access.

---

## Appendix: Search Patterns Used

```
# Hero identification
hero.*icon|icon.*hero
GetHero|SetHero|GetPlayerHero
m_nHeroID|m_HeroID|HeroID_t

# Player data
CCitadelPlayer|CBasePlayer
PlayerDataGlobal|m_PlayerDataGlobal
m_vecPlayers|PlayerList

# Events
GameEvent|FireEvent|DispatchEvent
player_death|entity_killed
powerup_pickup|buff_pickup|rejuv

# Minimap
minimap.*player|icon_replacement
CMsgMinimapEvent|MinimapIcon

# Entity system
entindex|EntityIndex|CEntityIndex
CHandle|GetEntIndex
```
