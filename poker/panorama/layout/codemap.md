# poker/panorama/layout/

## Responsibility
This folder defines the Panorama XML mount points for the Poker ESC-menu module:

- `hud_escape_menu.xml` replaces/extends Deadlock's stock ESC menu layout with the poker window tree and loads `s2r://panorama/scripts/poker_escape_menu.vjs_c` plus `s2r://panorama/styles/poker_escape_menu.vcss_c`.
- `chat.xml` preserves the stock chat layout/snippets while loading `s2r://panorama/scripts/poker_chat_debug.vjs_c`, which is the chat-row bridge used by the poker menu runtime.

These XML files are contract surfaces for the scripts and validators. The source of behavior is JavaScript; XML supplies stable panel IDs, initial classes/text, and `onactivate`/chat input event hooks.

## Design/Patterns

### Stock-layout extension
- Both XML files keep SteamTracking/Deadlock stock shell elements (`CitadelHudEscapeMenu`, friends/players tabs, `CitadelChat`, stock chat snippets) and add poker-specific hooks without introducing custom Panorama component types.
- `hud_escape_menu.xml` includes base/menu styles first, then `poker_escape_menu.vcss_c`; poker classes such as `PokerFloatingWindow`, `PokerHidden`, `PokerPrimaryButton`, and `PokerTableSurface` are interpreted by `poker/panorama/styles/poker_escape_menu.css`.
- `chat.xml` includes only stock chat styles; it acts as an invisible bridge context (`hittest="false"`) rather than a poker UI surface.

### Stable ID contract
`poker_escape_menu.js` mirrors XML IDs in its `IDS` table and resolves them by walking from `$.GetContextPanel()` to the root. The XML IDs below are therefore API, not decoration:

- Entry/root: `PokerMenuButton`, `TableGamePickerWindow`, `TableGamePickerPokerButton`, `TableGamePickerBluffButton`, `BluffDeckWindow`, `PokerAnitaPanel`, `PokerLobbyWindow`, `PokerTableWindow`, `PokerPlayersWindow`, `PokerHistoryWindow`, `PokerActionsWindow`, `PokerCloseButton`.
- Party: `PokerPartyControls`, `PokerHostPartyButton`, `PokerJoinPartyButton`, `PokerPartyStatusLabel`.
- Progress: `PokerProgressControls`, `PokerExportProgressButton`, `PokerImportProgressButton`, `PokerProgressCodeInput`, `PokerProgressCodeLabel`.
- Resume: `PokerResumeControls`, `PokerResumeLeaderButton`, `PokerResumeReadyButton`, `PokerResumeStatusLabel`, `PokerResumeLeaderList`.
- Lobby/ready/start: `PokerReadyChatButton`, `PokerReadyCountLabel`, `PokerSeatsList`, `PokerStartButton`, `PokerStartButtonLabel`, `PokerStatusLabel`.
- Table/game: `PokerTableSurface`, `PokerPhaseLabel`, `PokerPotLabel`, `PokerAnnouncerOverlay`, `PokerAnnouncerTitle`, `PokerAnnouncerBody`, `PokerCommunityCards`, `PokerTableFelt`, `PokerTableSeats`, `PokerPlayersList`, `PokerActionButtons`.
- Match/log: `PokerEndMatchButton`, `PokerLeaveLobbyButton`, `PokerGameLog`.
- Chat bridge / sender: `ChatMessages`, `ChatControls`, `ChatTargetLabel`, `ChatInput`, plus snippet-local `MessageSource`, `MessageContents`, `SenderImage`, `PingLabel`, `HeroImage`, `AvatarImage`.

### XML activation handlers
`hud_escape_menu.xml` binds buttons to globals exported by `poker_escape_menu.js` on both `globalThis` and `$.GetContextPanel()`:

- `PokerMenuButton` -> `PokerEscapeMenuToggle()`.
- `PokerCloseButton` -> `PokerEscapeMenuClose()`.
- `PokerReadyChatButton` -> `PokerEscapeMenuSendReadyChat()`.
- `PokerStartButton` -> `PokerEscapeMenuStart()`.
- `PokerEndMatchButton` -> `PokerEscapeMenuEndMatch()`.
- `PokerLeaveLobbyButton` -> `PokerEscapeMenuLeaveLobby()`.
- `PokerHostPartyButton` -> `PokerEscapeMenuHostParty()`.
- `PokerJoinPartyButton` -> `PokerEscapeMenuJoinParty()`.
- `PokerExportProgressButton` -> `PokerEscapeMenuCopyProgress()`.
- `PokerImportProgressButton` -> `PokerEscapeMenuImportProgress()`.
- `PokerResumeLeaderButton` -> `PokerEscapeMenuResumeLeader()`.
- `PokerResumeReadyButton` -> `PokerEscapeMenuResumeReady()`.
- `TableGamePickerPokerButton` / `TableGamePickerBluffButton` -> `PokerEscapeMenuSelectTableGame('poker' | 'bluff-deck')`.
- `BluffDeckWindow` controls reuse host/join/leave handlers and bind dedicated Bluff start/end, slot-select, play, and challenge globals.

`poker_escape_menu.js` also imperatively binds the same handlers with `SetPanelEvent` during `boot()`, so the XML `onactivate` attributes and JS binding are redundant by design; this protects against either layout activation path failing.

`chat.xml` binds stock chat input behavior:

- `ChatInput` `oninputsubmit="CitadelChatInputSubmitted();"`.
- `ChatInput` `onblur="CitadelChatInputBlur();"`.

The poker menu sender sets `#ChatInput.text`, dispatches `CitadelChatInputSubmitted`, clears the field, then dispatches `CitadelChatInputBlur`/`DropInputFocus`.

## Data & Control Flow

### Menu/UI flow (`hud_escape_menu.xml`)
1. The ESC context loads `poker_escape_menu.vjs_c`; script export happens before `boot()` unless `globalThis.__PokerTestMode` is set.
2. `boot()` calls `cachePanels()`, resolving the contract IDs listed above, then registers `ClientUI_FireOutput` with `handleBridgeEvent` once required panels exist.
3. Opening Poker through `#PokerMenuButton` toggles `#PokerAnitaPanel` and the floating windows. The script requests fresh ready/chat state, refreshes seats, and calls `renderGame()`.
4. `renderGame()` projects state into the XML containers:
   - party/progress/resume affordances in `#PokerLobbyWindow`;
   - ready seats in `#PokerSeatsList`;
   - game/table state in `#PokerTableSurface`, `#PokerCommunityCards`, `#PokerTableSeats`, and `#PokerPlayersList`;
   - action choices in `#PokerActionButtons` plus the persistent `#PokerStartButton`/`#PokerStartButtonLabel`;
   - history in `#PokerGameLog`.
5. Runtime-created child panels use classes such as `PokerSeatRow`, `PokerPlayerRow`, `PokerTableSeat`, `PokerCard`, and `PokerActionButton`; XML only owns the stable parent containers.

### Chat bridge flow (`chat.xml`)
1. The chat context loads `poker_chat_debug.vjs_c` and stock `CitadelChat` renders rows under `#ChatMessages` from the `ChatMessage` snippet.
2. `poker_chat_debug.js` polls `#ChatMessages` every `0.1s` when rows exist or `0.5s` while idle/missing.
3. For each row, the bridge reads `#MessageSource` and `#MessageContents`, normalizes sender/channel/message, delays authority-sensitive rows while sender is `<unknown>`, and appends accepted records to `GameUI.CustomUIConfig().PokerChatMessages`.
4. Each accepted record is dispatched as JSON through `$.DispatchEvent("ClientUI_FireOutput", ...)` with event `PokerChatMessage`; snapshots use the same event with `action: "snapshot"`.
5. `poker_escape_menu.js` receives those bridge events and routes them through `processChatRecord()` / `CommandReducer.applyRecord()` to update party, ready, progress, resume, and game state.

### Outbound chat flow
Buttons in `hud_escape_menu.xml` never talk to other clients directly. Handlers in `poker_escape_menu.js` build wire strings and call `sendChatMessage()`:

1. `sendChatMessage()` opens team chat via `CitadelConCommand say_chat_team`.
2. `resolveChatPanels()` finds `Chat`, `ChatControls`, `ChatTargetLabel`, and `ChatInput` from the root created by `chat.xml`.
3. The sender waits until `#ChatTargetLabel` is a usable team/party target, writes to `#ChatInput`, dispatches `CitadelChatInputSubmitted`, then blurs/closes input.
4. The same message later appears as a chat row under `#ChatMessages`; `poker_chat_debug.js` ingests it and loops it back to the menu reducer with `isSelf` set as observed from the row.

Contract-critical commands carried through this path include `[party leader]`, `[party join]`, `[party leave]`, `poker start ... roster ...`, `[progress offer]`, `[progress chunk]`, `[resume leader]`, `[resume ready]`, and `poker resume ...`.

## Integration Points

### `hud_escape_menu.xml` -> `poker_escape_menu.js`
- Loads `poker_escape_menu.vjs_c` and supplies all containers used by `State` panel refs.
- `CitadelHudEscapeMenu oncancel` and `#EscapeBackground` still call `CitadelResumePlaying()`; Poker does not replace stock ESC cancellation behavior.
- `#PokerAnitaPanel` starts as `PokerHidden` and `hittest="false"`; menu open/close policy is script-controlled.
- Floating windows have fixed roles: lobby controls (`#PokerLobbyWindow`), table/felt (`#PokerTableWindow`), player list and leave/end controls (`#PokerPlayersWindow`), log (`#PokerHistoryWindow`), and action/start/status controls (`#PokerActionsWindow`).
- `#PokerTableSeats` and `#PokerPlayersList` are both required: the former is the compact table-edge in-hand view, the latter is the full player list. Do not collapse one into the other.

### `chat.xml` -> `poker_chat_debug.js`
- Loads `poker_chat_debug.vjs_c` into the chat context.
- `#ChatMessages` is the bridge's primary polling root; removing/renaming it breaks all chat-driven synchronization.
- The `ChatMessage` snippet must keep `#MessageSource` and `#MessageContents`; the bridge's row reader depends on those IDs to extract sender and text.
- `#ChatInput` and `#ChatTargetLabel` are also consumed from the menu script for outbound messages, so they are shared between inbound bridge and outbound sender flows.

### Shared bridge contracts
Both scripts use the same bridge/event/config names:

- Event bus: `ClientUI_FireOutput`.
- Events: `PokerReadySeatsChanged`, `PokerReadySeatsRequest`, `PokerReadySeatsClearRequest`, `PokerChatMessage`, `PokerChatSnapshotRequest`.
- `GameUI.CustomUIConfig()` keys: `PokerReadySeats`, `PokerReadyRevision`, `PokerChatMessages`, `PokerChatSequence`, `PokerLastReadyEvent`, `PokerLocalPlayerKey`, `PokerLocalPlayerName`, `PokerPendingSelfAction`, `PokerPartyState`, `PokerProgressState`.
- Test hooks exposed by the loaded scripts: `globalThis.__PokerEscapeMenuTestHooks` and `globalThis.__PokerChatDebugTestHooks`.

## Invariants
- Do not rename contract-critical IDs without updating `poker_escape_menu.js`, `poker_chat_debug.js`, CSS, and validators together.
- Do not remove `ChatInput` stock submit/blur handlers; poker outbound chat relies on the stock Deadlock submit path rather than a custom network API.
- Do not add alternate chat handlers or direct client-to-client channels. Poker synchronization is chat-row driven through `#ChatMessages` and `ClientUI_FireOutput`.
- Keep initial `PokerHidden` classes on optional/match-only containers (`PokerAnitaPanel`, `PokerTableSeats`, `PokerPlayersList`, `PokerEndMatchButton`, `PokerLeaveLobbyButton`, `PokerActionButtons`) so first render starts from a safe lobby state.
- Keep the stock ESC menu/friends/players/chat structure around the poker additions; the poker hooks are overlays/bridge points, not standalone replacement UIs.
