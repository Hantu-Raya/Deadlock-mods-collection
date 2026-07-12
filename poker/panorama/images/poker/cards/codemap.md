# panorama/images/poker/cards/

## Responsibility

Card texture source set for the Panorama poker renderer. This folder owns the rank-face and suit-symbol art used inside `PokerCard` panels, plus one `.vtex` descriptor per PNG so the Source 2 texture compiler can produce packed `.vtex_c` outputs.

## Design/Patterns

- **Rank/suit asset split:** numbered cards reuse suit symbols; face cards use dedicated rank face masks. The runtime chooses the asset by card rank/suit rather than composing image filenames in CSS.
- **One-to-one source pairing:** each required `card_*.png` has a matching same-basename `card_*.vtex` descriptor. Each descriptor points back to its PNG through `m_fileName "panorama/images/poker/cards/<name>.png"`.
- **Logical runtime URLs:** `poker_escape_menu.js` returns `<name>.vtex`, then `getCardImageSrc()` prefixes `s2r://panorama/images/poker/cards/`. Compiled `.vtex_c` filenames are build artifacts and are never runtime source references.
- **Tint-by-CSS masks:** PNG art is a white alpha mask over transparent pixels. `PokerCardVtexArt` defaults to black wash (`#111315`); `.PokerCard.RedSuit .PokerCardVtexArt` washes hearts/diamonds red (`#b83f47`).

## Asset Inventory

### Face source assets

| PNG source | VTEX descriptor | Runtime selected for | Notes |
|---|---|---|---|
| `card_face_ace.png` | `card_face_ace.vtex` | rank `A` | 512x512, RGBA, transparent mask |
| `card_face_jack.png` | `card_face_jack.vtex` | rank `J` | 512x512, RGBA, transparent mask |
| `card_face_joker.png` | `card_face_joker.vtex` | fallback/hidden-like art when no rank/suit-specific key matches | 512x512, RGBA, transparent mask |
| `card_face_king.png` | `card_face_king.vtex` | rank `K` | 512x512, RGBA, transparent mask |
| `card_face_queen.png` | `card_face_queen.vtex` | rank `Q` | 512x512, RGBA, transparent mask |

### Suit source assets

| PNG source | VTEX descriptor | Runtime selected for | Notes |
|---|---|---|---|
| `card_suit_club.png` | `card_suit_club.vtex` | suit `C` | 512x512, RGBA, transparent mask |
| `card_suit_diamond.png` | `card_suit_diamond.vtex` | suit `D` | 512x512, RGBA, transparent mask; red wash at runtime |
| `card_suit_heart.png` | `card_suit_heart.vtex` | suit `H` | 512x512, RGBA, transparent mask; red wash at runtime |
| `card_suit_spade.png` | `card_suit_spade.vtex` | suit `S` | 512x512, RGBA, transparent mask |

## Data & Control Flow

1. Game model cards use ranks `2..A` and suits `S,H,D,C` in `poker_escape_menu.js`.
2. `getCardImageKey(card)` maps ranks `A/K/Q/J` to `ace/king/queen/jack`, suits `H/D/S/C` to `heart/diamond/spade/club`, and otherwise falls back to `joker`.
3. `getCardImageAsset(card)` emits either `card_face_<key>.vtex` for face keys or `card_suit_<key>.vtex` for suit keys.
4. `createCardArt(parent, card)` creates a `Panel.PokerCardArt`, adds an art class such as `ArtAce`/`ArtHeart`, creates an `Image.PokerCardVtexArt`, and assigns `s2r://panorama/images/poker/cards/<asset>.vtex`.
5. `build_poker.ps1` requires every basename in `$requiredCardAssets` to have both `.png` and `.vtex`, compiles the descriptors, writes `.vtex_c` into `poker_compiled/panorama/images/poker/cards/`, deletes raw `.png`/`.vtex` from compiled output, packs `pak01_dir.vpk`, and verifies required card `.vtex_c` assets are present.

## Integration Points

- Runtime asset mapping: `poker/panorama/scripts/poker_escape_menu.js` functions `getCardImageKey()`, `getCardImageAsset()`, `getCardImageSrc()`, `getCardArtClass()`, `setImageSource()`, and `createCardArt()`.
- Runtime styling: `poker/panorama/styles/poker_escape_menu.css` selectors `.PokerCard`, `.PokerCard.Small`, `.PokerCardVtexArt`, `.PokerCard.RedSuit .PokerCardVtexArt`, and `.PokerCardArt.Hidden .PokerCardVtexArt`.
- Static validation: `poker/scripts/validate-poker.js` enforces required PNG names, 512x512 dimensions, PNG color type 6/RGBA, and at least one transparent alpha pixel per card image.
- Build/pack validation: `build_poker.ps1` requires compiled outputs for all nine card assets and forbids raw card `.png`/`.vtex` assets in `pak01_dir.vpk`.
- Documentation source of truth: `poker/CONTEXT.md` section `Card Asset Pipeline` mirrors the public contract for expected files and packaging behavior.

## Invariants

- Every source PNG must stay 512x512, PNG color type 6 (RGBA), transparent-background capable, and contain transparent alpha.
- Visible art should remain white alpha-mask artwork so CSS `wash-color` can tint suits without separate colored images.
- Every required PNG must have a matching same-basename `.vtex` descriptor with `m_outputFormat "BGRA8888"`, `m_srcChannels "rgba"`, `m_dstChannels "rgba"`, and `m_bNoLod "1"`.
- Runtime code must reference logical `.vtex` URLs only; source code, XML, and CSS must not reference `.vtex_c` or raw `.png` for cards.
- Packed output must contain exactly the compiled card `.vtex_c` texture assets required by `build_poker.ps1` and no raw card `.png`/`.vtex` files.
- Do not reintroduce center-only rank/suit label rendering as a replacement for `PokerCardVtexArt`; labels remain corner rank/suit text while square texture art carries the center symbol/face.
