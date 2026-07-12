# poker/panorama/

## Responsibility

Source Panorama surface for the Poker ESC-menu mod. This subtree owns the runtime UI contexts that compile into `poker_compiled/panorama/...`: XML layout hooks, JavaScript runtime/bridge logic, CSS presentation, and source image/VTEX card assets.

## Design/Patterns

- **Two-context Panorama architecture:** `layout/hud_escape_menu.xml` loads the poker menu runtime (`scripts/poker_escape_menu.js`) into the ESC menu context; `layout/chat.xml` loads the chat bridge (`scripts/poker_chat_debug.js`) into the stock chat context.
- **Chat as transport:** no server or direct client API exists. Menu buttons send stock team/party chat; the chat context polls stock rows and replays normalized records through `ClientUI_FireOutput`.
- **State projection:** `poker_escape_menu.js` owns state, rules, reducer, button policy, progress/resume logic, and renderers. Layout supplies stable IDs, CSS supplies class-based visuals, and assets supply logical `.vtex` card images.
- **Source-only tree:** authorable XML/JS/CSS/PNG/VTEX lives here. Compiled `.vxml_c`, `.vjs_c`, `.vcss_c`, `.vtex_c`, VPKs, and staged pak folders are generated outside this source tree.

## Directory Map

| Directory | Responsibility Summary | Detailed Map |
|---|---|---|
| `layout/` | Panorama XML hook points for ESC Poker UI and stock chat bridge; owns contract-critical panel IDs and global activation bindings. | [layout/codemap.md](layout/codemap.md) |
| `scripts/` | Runtime state machine, chat reducer, poker engine, progress/resume protocol, renderer, outbound chat sender, and chat-row polling bridge. | [scripts/codemap.md](scripts/codemap.md) |
| `styles/` | Anita-style visual system and class-driven affordance styling for lobby, table, players, actions, cards, and log. | [styles/codemap.md](styles/codemap.md) |
| `images/` | Source image namespace for poker card masks and VTEX descriptors compiled into packed card textures. | [images/codemap.md](images/codemap.md) |

## Data & Control Flow

1. Deadlock loads the compiled XML contexts from the packed VPK.
2. ESC menu context loads `poker_escape_menu.vjs_c` and `poker_escape_menu.vcss_c`; chat context loads `poker_chat_debug.vjs_c`.
3. User opens Poker with `#PokerMenuButton`; runtime caches panel refs, requests ready/chat snapshots, and renders current state into XML containers.
4. User actions call exported globals such as `PokerEscapeMenuHostParty`, `PokerEscapeMenuJoinParty`, `PokerEscapeMenuStart`, `PokerEscapeMenuImportProgress`, and `PokerEscapeMenuResumeLeader`.
5. Runtime sends stock chat commands through `#ChatInput`; the chat bridge later observes those rows under `#ChatMessages`, normalizes sender/channel/content, and dispatches `PokerChatMessage` bridge payloads.
6. `poker_escape_menu.js` reduces bridge records into party state, ready seats, progress transfers, resume authority, active game state, and action history.
7. `renderGame()` projects that state back into layout text/classes/children; CSS interprets those classes and card assets render through logical `s2r://panorama/images/poker/cards/*.vtex` paths.
8. `build_poker.ps1` compiles the full `poker/` source tree, compiles card VTEX textures, packs `pak01_dir.vpk`, verifies packed assets, and deploys to Deadlock addons.

## Integration Points

- Parent module map: [../codemap.md](../codemap.md).
- Runtime source maps: [scripts/codemap.md](scripts/codemap.md), [layout/codemap.md](layout/codemap.md), [styles/codemap.md](styles/codemap.md), [images/codemap.md](images/codemap.md).
- Validators: `poker/scripts/validate-poker.js`, `poker/scripts/validate-ready-state.js`, and `poker/scripts/validate-poker-game.js` load these Panorama sources into static/VM checks.
- Build wrapper: `../build_poker.ps1` compiles this subtree through `sr2compiler/New folder.exe`, Dota `resourcecompiler.exe`, and `vpkeditcli.exe` via the repo package pipeline.

## Invariants

- Keep XML IDs, JS `IDS`, CSS selectors, and validator expectations synchronized.
- Do not add alternate chat transports; stock chat rows plus `ClientUI_FireOutput` are the integration boundary.
- Do not reference `.vtex_c` from source XML/JS/CSS; runtime uses logical `.vtex`, build output contains compiled `.vtex_c`.
- Keep `hittest="false"` / disabled affordance behavior aligned so overlays do not steal gameplay input or expose non-working controls.
