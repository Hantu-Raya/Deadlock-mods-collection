# panorama/images/

## Responsibility

Static Panorama image source root for the Poker ESC-menu module. This directory currently delegates all runtime poker texture assets to `poker/`, especially the card art pipeline under `poker/cards/`; it is the source tree consumed before `build_poker.ps1` compiles and packs assets into the VPK.

## Design/Patterns

- **Scoped asset namespace:** runtime image URLs are rooted under `s2r://panorama/images/...`; Poker assets live below `panorama/images/poker/` to avoid sharing names with other mods.
- **Source-first layout:** this tree stores authorable image sources (`.png`) and Source 2 texture descriptors (`.vtex`). Compiled outputs (`.vtex_c`) belong in `poker_compiled/` and the packed VPK, not here.
- **Hierarchical maps:** `poker/codemap.md` maps the Poker image namespace; `poker/cards/codemap.md` maps concrete card face/suit assets and texture constraints.

## Data & Control Flow

1. Runtime code in `poker/panorama/scripts/poker_escape_menu.js` builds card image URLs with `s2r://panorama/images/poker/cards/<asset>.vtex`.
2. `build_poker.ps1` reads sources from `poker/panorama/images/poker/cards/`, invokes the texture compiler for matching `.png`/`.vtex` pairs, and writes compiled textures under `poker_compiled/panorama/images/poker/cards/`.
3. VPK packing includes compiled `.vtex_c` outputs and rejects raw card `.png`/`.vtex` files in packaged output.

## Integration Points

- Child namespace: `poker/` for all Poker-specific image assets.
- Runtime consumer: `poker/panorama/scripts/poker_escape_menu.js` via `Image` panels and `s2r://panorama/images/poker/cards/...` paths.
- Style consumer: `poker/panorama/styles/poker_escape_menu.css` tints white alpha-mask card art through `wash-color`.
- Build/deploy consumer: `build_poker.ps1` compiles card VTEX textures and verifies required packed assets.
- Static validator: `poker/scripts/validate-poker.js` checks required card PNGs, dimensions, RGBA color type, and transparent alpha.

## Invariants

- Do not place generated `poker_compiled/` outputs, `.vtex_c` files, or VPK artifacts in this source tree.
- Runtime references logical `.vtex` URLs; code and layout must not reference `.vtex_c` directly.
- Source card images must remain in the `poker/cards/` subtree so build and validation paths stay stable.
