# HUD STYLES KNOWLEDGE BASE

**Type:** Panorama Styles Reference
**Generated:** 2026-01-15

## OVERVIEW
Collection of extracted or reference CSS files for Deadlock's HUD. Primarily used as a source for "CSS Hijack" overrides in other mods.

## STRUCTURE
```
hud/
├── panorama/
│   └── styles/
│       ├── base/       # Core styles (original.vcss_c references)
│       └── ...         # Component-specific styles
```

## USAGE
-   **Reference**: Check these files to find ID/Class names for targeting.
-   **Import**: Use `@import` in other mods to pull in base styles before overriding.

## KEY FILES
-   `styles/base/original.vcss_c`: The root style file often hijacked.
-   `styles/hud_minimap.css`: Minimap styling reference.
