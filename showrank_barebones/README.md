# ShowRank Barebones

`showrank_barebones` is the full barebones ShowRank edition. It adds predicted-rank images to profile cards, dashboard profile pages, player context menus, top-bar slots, team averages, and the Escape player list. It also provides the early-lane `MISSING` portrait indicator and the shared enemy-missing hero-icon announcement.

The dashboard profile page also includes `Stats vs Community` for the viewed account. The player context menu keeps StatLocker and account-copy actions, and adds `Player Profile` through the same selected-account checks. These features ship in the ShowRank package. No separate Profile Stats VPK is required.

## Build

From the collection root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_showrank_barebones.ps1 -KeepStaging
```

Add `-Install` to replace the active `citadel/addons/pak89_dir.vpk` after validating and packaging the project. Deadlock must be closed during installation.

The build artifact is `showrank_barebones_dir.vpk`.

The builder runs Closure Compiler ADVANCED on the staged JavaScript before Source 2 compilation. The editable runtime remains readable; `-KeepStaging` retains the minified build source for inspection.

## Validation

```powershell
npm --prefix .\showrank_barebones run validate
```



## Editions

| Project | Missing-lane UI | Build artifact |
| --- | --- | --- |
| `showrank_barebones` | `MISSING` portrait indicator and hero-icon announcement | `showrank_barebones_dir.vpk` |
| `showrank_barebones_no_missing` | None | `showrank_barebones_no_missing_dir.vpk` |

The editions override the same Panorama resources and install as `pak89_dir.vpk`. Install only one edition at a time.
