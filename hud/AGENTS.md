# HUD STYLES KNOWLEDGE BASE

**Type:** Panorama Styles Reference
**Generated:** 2026-01-15

## OVERVIEW
Collection of extracted or reference CSS files for Deadlock's HUD. Primarily used as a source for "CSS Hijack" overrides in other mods.
The root `abilities.vdata` and `abilities2.vdata` files in this folder are
reference extracts, not the large processing inputs owned by `../abilities/`.

## STRUCTURE
```
hud/
├── panorama/
│   └── styles/
│       ├── base/       # Core HUD base CSS references
│       └── ...         # Component-specific styles
```

## USAGE
-   **Reference**: Check these files to find ID/Class names for targeting.
-   **Import**: Use `@import` in other mods to pull in base styles before overriding.
-   **Do not treat as a deployable mod by default**: this folder is primarily a
    reference corpus with extracted VData/style files. Compile only if the user
    explicitly asks to build the `hud` folder as a mod.

## BUILD
If a build is explicitly requested:

```powershell
$repo = "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "$repo\sr2compiler\New folder.exe" "$repo\hud"
```

Primary output is `hud_compiled/`.

## KEY FILES
-   `panorama/styles/base/hud.css`: Root base HUD style reference.
-   `panorama/styles/base/citadel_hud_hero_shop.css`: Shop/quickbuy positioning reference.
-   `panorama/styles/base/hud_abilities.css`: Ability bar reference.
-   `panorama/styles/base/hud_ability_icon_passive.css`: Passive ability icon reference.
-   `panorama/styles/hud_health.css` and `panorama/styles/hud_health_container.css`: Health HUD references used by HP-related mods.
-   `panorama/styles/unit_status_icons.css`: Unit status icon reference.

If compiling this folder, first verify XML script includes match existing source
or compiled script names. Current `hud.xml` references `bufftimer.vjs_c` and
`rejuvtimer.vjs_c`, while the source script present here is
`rejuvnbufftimer.js`.
