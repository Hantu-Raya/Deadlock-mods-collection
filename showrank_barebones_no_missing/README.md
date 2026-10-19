# ShowRank Barebones — No Missing Alerts

The rank-only edition of [ShowRank Barebones](../showrank_barebones/README.md): every feature of that module except the missing lane (the `MISSING` portrait indicator, portrait darkening, the ENEMY MISSING announcement and the clock polling behind them).

**Do not edit `panorama/` here.** It is generated from `showrank_barebones/panorama` by:

```powershell
node scripts/showrank-barebones-editions.js
```

The generator drops every line range marked `[no-missing: cut begin]` ... `[no-missing: cut end]` in the source module and fails if Show-rank-merger's forbidden no-missing markers remain. The tree is committed because Show-rank-merger downloads it from GitHub.

## Build

From the collection root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_showrank_barebones_no_missing.ps1
```

Add `-Install` to replace `citadel/addons/pak89_dir.vpk` (Deadlock must be closed). The artifact is `showrank_barebones_no_missing_dir.vpk`. The wrapper runs `build_showrank_barebones.ps1 -NoMissing`.

## Validation

```powershell
npm --prefix .\showrank_barebones_no_missing run validate
```

This fails if the generated tree is stale, then runs the shared `showrank_barebones` runtime suite against this edition; the missing-lane scenarios are replaced by checks that no missing-lane callbacks, classes or state exist.
