# panorama/images/poker/

## Responsibility

Poker-specific Panorama image namespace. It groups the texture sources used by the ESC-menu poker renderer and currently contains the `cards/` atlas-like asset set for rank and suit symbols.

## Design/Patterns

- **Namespace boundary:** every asset below this folder is addressed as `panorama/images/poker/...` in `.vtex` descriptors and `s2r://panorama/images/poker/...` at runtime.
- **Descriptor-paired assets:** concrete renderable images are stored lower in the hierarchy as PNG sources plus matching `.vtex` descriptors, keeping Source 2 compiler metadata adjacent to each source image.
- **Tintable masks:** Poker art is designed as white transparent alpha masks; CSS applies color policy rather than duplicating red/black variants as separate files.

## Data & Control Flow

1. `poker_escape_menu.js` resolves a card object into a filename under `cards/` (`card_face_<name>.vtex` or `card_suit_<name>.vtex`).
2. Panorama `Image` panels load those logical `.vtex` URLs at runtime.
3. `poker_escape_menu.css` applies `wash-color` for suit color state: black/default `#111315`, red suit override `#b83f47`.
4. `build_poker.ps1` compiles the `cards/` `.vtex` descriptors into `.vtex_c` files, removes raw `.png`/`.vtex` from `poker_compiled`, and verifies the packed VPK contains only compiled texture assets.

## Integration Points

- Child map: `cards/codemap.md` documents the face/suit source asset inventory and constraints.
- Runtime source: `poker/panorama/scripts/poker_escape_menu.js` functions `getCardImageKey()`, `getCardImageAsset()`, `getCardImageSrc()`, and `createCardArt()`.
- CSS source: `poker/panorama/styles/poker_escape_menu.css` selectors `.PokerCardVtexArt`, `.PokerCard.RedSuit .PokerCardVtexArt`, and `.PokerCardArt.Hidden .PokerCardVtexArt`.
- Build source: `build_poker.ps1` variables `$cardAssetsSrc`, `$cardAssetsOut`, `$requiredCardAssets`, `$requiredTextureOutputs`, `$requiredPackedAssets`, and `$forbiddenRawCardAssets`.
- Validator source: `poker/scripts/validate-poker.js` constant `CARD_IMAGE_DIR` and `REQUIRED_CARD_IMAGE_NAMES`.

## Invariants

- Keep Poker runtime image assets under this namespace; do not reference repo-local filesystem paths from Panorama code.
- Keep authorable sources here and compiled output in `poker_compiled/`/`pak01_dir.vpk` only.
- Preserve relative `.vtex` descriptor paths such as `panorama/images/poker/cards/card_face_ace.png`; the texture compiler depends on them.
