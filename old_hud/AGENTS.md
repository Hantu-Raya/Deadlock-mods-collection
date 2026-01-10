# old_hud/ - Legacy NeonPrime HUD (Archive)

**Type:** Full Panorama (archival reference)
**Status:** No compiled version. Not for deployment.

## OVERVIEW
Largest mod in collection (107+ files). Original NeonPrime HUD implementation. Use as reference for panel structure and styling patterns.

## STRUCTURE
```
old_hud/
├── panorama/
│   ├── layout/        # 27 XML files (comprehensive HUD)
│   ├── styles/        # 56 CSS files (full reskin)
│   ├── scripts/       # neonprimehud.js (shop tab logic)
│   ├── images/        # Scanline animations, masks, custom icons
│   └── custom/        # 14 custom panel definitions
├── materials/         # Texture overrides
├── resource/          # Font/localization
└── _bakeresourcecache/ # Compiled map assets (492 files, ignore)
```

## KEY FILES
| File | Purpose |
|------|---------|
| `panorama/scripts/neonprimehud.js` | Shop tab switching (note: "never needed" comment) |
| `panorama/layout/hud.xml` | Main HUD entry point |
| `panorama/styles/hud_health.css` | Health bar styling reference |
| `panorama/images/scanline_anim*/` | Animated overlay frames |

## TECHNICAL DEBT
- Line 1: `// this was never needed i couldve reused the vanilla navbar commands from the start`
- Line 74: `// unused / doesnt work.` - `NP_add_level_zeros()` function
- `_bakeresourcecache/` contains 492 compiled map files (should be deleted or gitignored)

## USE CASES
1. **Reference**: How panels are structured in Deadlock HUD
2. **CSS Patterns**: Comprehensive styling examples
3. **Asset Templates**: Scanline/mask image formats
4. **DO NOT**: Deploy as-is (outdated, incomplete)

## GOTCHAS
- `_bakeresourcecache/` bloats directory (ignore in searches)
- No compiled version exists (intentionally not maintained)
- Some CSS may reference removed/renamed vanilla panels
