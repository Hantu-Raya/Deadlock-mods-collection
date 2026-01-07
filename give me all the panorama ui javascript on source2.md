<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# give me all the panorama ui javascript on source2 apis

Based on my research, here's a comprehensive overview of **Panorama UI JavaScript on Source 2 APIs**:

## 📋 Overview

**Panorama** is Valve's UI framework used in Source 2 games (Dota 2, CS:GO, Half-Life: Alyx). It's built on **HTML5/CSS/JavaScript** and provides a powerful alternative to older Scaleform technology. The framework uses **XML for layouts**, **CSS for styling**, and **JavaScript for dynamic behavior**.

***

## 🎯 Core JavaScript API Categories

### **1. Game Events**

Handle communication between client and server:

```javascript
GameEvents.Subscribe("event_name", callback)
GameEvents.Unsubscribe(callbackHandle)
GameEvents.SendCustomGameEventToServer("event_name", data_object)
GameEvents.SendCustomGameEventToAllClients("event_name", data_object)
GameEvents.SendCustomGameEventToClient("event_name", playerIndex, data_object)
GameEvents.SendEventClientSide("event_name", data_object)
```


### **2. Custom Net Tables**

Sync data between server and clients:

```javascript
CustomNetTables.GetTableValue("table_name", "key_name")
CustomNetTables.GetAllTableValues("table_name")
CustomNetTables.SubscribeNetTableListener(listener_object)
CustomNetTables.UnsubscribeNetTableListener(callbackHandle)
```


### **3. Players API**

Query and manipulate player data:

```javascript
Players.GetLocalPlayer()                          // Get local player ID
Players.GetMaxPlayers()
Players.GetPlayerName(playerID)
Players.GetPlayerHeroEntityIndex(playerID)
Players.GetGold(playerID)
Players.GetKills(playerID)
Players.GetDeaths(playerID)
Players.GetAssists(playerID)
Players.GetLevel(playerID)
Players.GetSelectedEntities(playerID)
Players.CanPlayerBuyback(playerID)
Players.IsSpectator(playerID)
```


### **4. Entities API**

Access game entities (heroes, creeps, items, etc.):

**Position \& State:**

```javascript
Entities.GetAbsOrigin(entityIndex)
Entities.GetAbsAngles(entityIndex)
Entities.IsAlive(entityIndex)
Entities.IsHero(entityIndex)
Entities.IsBuilding(entityIndex)
Entities.GetHealth(entityIndex)
Entities.GetMaxHealth(entityIndex)
Entities.GetHealthPercent(entityIndex)
Entities.GetMana(entityIndex)
Entities.GetMaxMana(entityIndex)
Entities.GetLevel(entityIndex)
```

**Query Methods:**

```javascript
Entities.IsEnemy(entityIndex)
Entities.IsInvisible(entityIndex)
Entities.IsStunned(entityIndex)
Entities.IsMuted(entityIndex)
Entities.IsFrozen(entityIndex)
Entities.GetTeamNumber(entityIndex)
Entities.GetPlayerOwnerID(entityIndex)
```

**Abilities \& Items:**

```javascript
Entities.GetAbilityCount(entityIndex)
Entities.GetAbility(entityIndex, slotIndex)
Entities.GetAbilityByName(entityIndex, "ability_name")
Entities.GetItemInSlot(entityIndex, slotIndex)
Entities.GetNumBuffs(entityIndex)
Entities.GetBuff(entityIndex, buffIndex)
```


### **5. Abilities API**

Control and query abilities:

```javascript
Abilities.GetAbilityName(abilityIndex)
Abilities.GetAbilityTextureName(abilityIndex)
Abilities.GetLevel(abilityIndex)
Abilities.GetManaCost(abilityIndex)
Abilities.GetCastRange(abilityIndex)
Abilities.GetCooldown(abilityIndex)
Abilities.GetCooldownTimeRemaining(abilityIndex)
Abilities.IsCooldownReady(abilityIndex)
Abilities.AbilityReady(abilityIndex)
Abilities.IsPassive(abilityIndex)
Abilities.IsToggle(abilityIndex)
Abilities.IsAutocast(abilityIndex)
Abilities.ExecuteAbility(abilityIndex, casterIndex, isQuickCast)
Abilities.CreateDoubleTapCastOrder(abilityIndex, casterIndex)
Abilities.PingAbility(abilityIndex)
```


### **6. Items API**

Manage inventory and item properties:

```javascript
Items.GetCost(itemIndex)
Items.IsPurchasable(itemIndex)
Items.IsSellable(itemIndex)
Items.IsStackable(itemIndex)
Items.GetCurrentCharges(itemIndex)
Items.GetInitialCharges(itemIndex)
Items.LocalPlayerSellItem(itemIndex)
Items.LocalPlayerDisassembleItem(itemIndex)
Items.LocalPlayerDropItemFromStash(itemIndex)
Items.LocalPlayerMoveItemToStash(itemIndex)
Items.LocalPlayerItemAlertAllies(itemIndex)
```


### **7. Game API**

Core game state and utilities:

**Time \& State:**

```javascript
Game.GetGameTime()
Game.GetDOTATime(includePreGame, includeNegativeTime)
Game.IsGamePaused()
Game.IsDayTime()
Game.GetGameWinner()
Game.GetState()
Game.GameStateIs(state)
```

**Screen \& Camera:**

```javascript
Game.GetScreenWidth()
Game.GetScreenHeight()
Game.WorldToScreenX(x, y, z)
Game.WorldToScreenY(x, y, z)
Game.ScreenXYToWorld(screenX, screenY)
Game.GetJoyFocusPanel()
Game.SetJoyFocusPanel(panel)
```

**Player Management:**

```javascript
Game.GetLocalPlayerID()
Game.PlayerJoinTeam(teamID)
Game.AutoAssignPlayersToTeams()
Game.GetAllTeamIDs()
Game.GetAllPlayerIDs()
Game.IsPlayerMuted(playerID)
Game.SetPlayerMuted(playerID, isMuted)
```

**Orders \& Actions:**

```javascript
Game.PrepareUnitOrders(orderObject)
Game.DropItemAtCursor(controlledUnit, itemEntity)
Game.ServerCmd("console_command")
Game.EmitSound("sound_event")
```


### **8. GameUI API**

UI-specific operations:

```javascript
GameUI.SetDefaultUIEnabled(elementType, isVisible)
GameUI.CustomUIConfig(configObject)
GameUI.PingMinimapAtLocation(vector3)
GameUI.SetMouseCallback(callbackFunction)
GameUI.GetCursorPosition()
GameUI.IsShopOpen()
```


### **9. Buffs API**

Query modifier/buff information:

```javascript
Buffs.GetName(entityIndex, buffIndex)
Buffs.GetDuration(entityIndex, buffIndex)
Buffs.GetRemainingTime(entityIndex, buffIndex)
Buffs.GetStackCount(entityIndex, buffIndex)
Buffs.IsDebuff(entityIndex, buffIndex)
Buffs.IsHidden(entityIndex, buffIndex)
```


### **10. Steam Integration**

```javascript
SteamFriends.RequestPersonaName(steamID, callback)
SteamFriends.SetLargeAvatarImage(args)
SteamUtils.GetAppID()
SteamUtils.GetConnectedUniverse()
```


***

## 🖼️ Panel (UI Element) Methods

All Panorama UI elements inherit from the **Panel** base class:

```javascript
// Class Management
panel.AddClass("class_name")
panel.RemoveClass("class_name")
panel.SetHasClass("class_name", hasClass)
panel.FindChild("child_id")
panel.FindChildTraverse("child_id")  // Recursive search
panel.GetChildren()

// Hierarchy
panel.SetParent(parentPanel)
panel.GetParent()
panel.MoveChildAfter(childPanel, afterPanel)

// Content
panel.text = "Label text"  // For Label panels
panel.html = "<html>"      // For HTML panels
panel.SetPanelEvent("onmouseover", callback)

// Layout
panel.style.width = "100px"
panel.style.height = "100px"
panel.style.position = "absolute"
panel.AddClass("visible")
panel.SetVisible(true/false)

// Events
panel.SetPanelEvent("onactivate", function() {})
panel.SetPanelEvent("onmouseover", function() {})
panel.SetPanelEvent("onmouseout", function() {})
panel.DispatchEvent("event_name")
panel.ListenToGameEvent("game_event", callback)
panel.enabled = true/false

// Misc
panel.id = "panel_id"
panel.GetAttributeString("attr_name", "default")
panel.SetAttributeString("attr_name", "value")
panel.BLoadLayoutSnippet("snippet_name")
panel.DeleteAsync(delay)
```


***

## 🛠️ Utility Functions (\$)

```javascript
$.Msg("message")              // Log to console
$.Warning("warning")          // Log warning
$.Localize("#token")          // Get localized string
$.Schedule(delay, callback)   // Execute after delay
$.CreatePanel(type, parent, id)  // Create UI element
$.GetContextPanel()           // Get current XML panel
$.DispatchEvent("event", data)
$.RegisterEventHandler("event", panel, callback)
$.UnregisterEventHandler("event", panel, callback)
```


***

## 📝 XML Layout Example

```xml
<root>
  <scripts>
    <include src="file://{resources}/scripts/custom_game/my_script.js" />
  </scripts>
  
  <style>
    #MyPanel {
      width: 300px;
      background-color: #000000;
    }
  </style>
  
  <Panel id="MyPanel">
    <Label text="Hello World" />
    <Button id="MyButton">Click Me</Button>
  </Panel>
  
  <script>
    // Inline JavaScript
    $.Msg("Panel loaded!");
  </script>
</root>
```


***

## 💡 Common Use Cases

**Subscribe to Game Event:**

```javascript
GameEvents.Subscribe("dota_player_used_ability", function(event) {
    $.Msg("Player " + event.PlayerID + " used ability: " + event.abilityname);
});
```

**Get Hero Health:**

```javascript
let heroIndex = Players.GetPlayerHeroEntityIndex(Players.GetLocalPlayer());
let health = Entities.GetHealth(heroIndex);
let maxHealth = Entities.GetMaxHealth(heroIndex);
```

**Send Data to Server:**

```javascript
GameEvents.SendCustomGameEventToServer("my_event", {
    player_id: Players.GetLocalPlayer(),
    data: "custom_data"
});
```

**Update UI Panel:**

```javascript
let panel = $.GetContextPanel();
let child = panel.FindChild("label_name");
child.text = "Updated Text";
```


***

## 📚 Resources

- **Official Wiki**: [Valve Developer Community - Panorama](https://developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools/Panorama)
- **API Docs**: [Panorama JavaScript API](https://developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools/Panorama/Javascript/API)
- **Last Updated**: September 2, 2025

This API is **comprehensive** and provides full access to game state, UI rendering, event handling, and player interactions within Source 2 games using JavaScript.
<span style="display:none">[^1][^10][^11][^12][^13][^14][^15][^16][^17][^18][^19][^2][^20][^3][^4][^5][^6][^7][^8][^9]</span>

<div align="center">⁂</div>

[^1]: https://developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools/Panorama/Javascript

[^2]: https://support.yuja.com/hc/en-us/articles/14883576641559-Panorama-API

[^3]: https://www.reddit.com/r/GlobalOffensive/comments/96y512/are_the_panorama_ui_and_other_elements_on_source/

[^4]: https://developer.valvesoftware.com/wiki/Panorama

[^5]: https://developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools/Panorama/Javascript/API

[^6]: https://github.com/StrataSource/p2ce-panorama-ui

[^7]: https://developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools/Panorama

[^8]: https://github.com/ValveResourceFormat/ValveResourceFormat

[^9]: https://hackerone.com/reports/631956

[^10]: https://www.reddit.com/r/GlobalOffensive/comments/8shiug/explore_panorama_ui_source_code_xml_css_javascript/

[^11]: https://docs.paloaltonetworks.com/pan-os/10-1/pan-os-panorama-api/pan-os-xml-api-use-cases/query-a-firewall-from-panorama-api

[^12]: https://github.com/sapdragon/panorama_reverse

[^13]: https://moddota.com/panorama/introduction-to-panorama-ui-with-typescript/

[^14]: https://ggnome.com/doc/pano2vr/workspace/properties/panorama/

[^15]: https://steamcommunity.com/app/440/discussions/0/1711816348628399756/

[^16]: https://sbox.game/news/panorama-experiments

[^17]: https://wiki.stratasource.org/panorama/overview/getting-started

[^18]: https://js.devexpress.com/jQuery/Documentation/17_2/ApiReference/UI_Widgets/dxPanorama/

[^19]: https://github.com/momentum-mod/panorama

[^20]: https://x.com/ThourCS2/status/1801570223142703578?lang=en

