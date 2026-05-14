# hp/ - Legacy Enemy Health Bar Coloring

Legacy single-source healthbar coloring mod. Older variant folders are not
present in this checkout; the active source is `hp/panorama/...` only.

Prefer `hp_colors/` or `hp_colors_minimal/` for current Anita-backed HP Colors
work unless the user explicitly asks to maintain this legacy module.

## Shared Constants

```javascript
// All variants use:
r=[225,97,97]    // Low HP red
dr=[85,28,28]    // Critical pulse dark
o=[255,123,0]    // Mid HP orange
g=[0,255,0]      // High HP green
n=[91,239,181]   // Neutral (turquoise)
```

## Team-Based Only

```javascript
HIGH1=[255,201,97]  // Team1 amber
HIGH2=[100,133,252] // Team2 blue
```

## Active Files

| File | Purpose |
|------|---------|
| `panorama/scripts/healthbar_logic.js` | Legacy enemy healthbar coloring runtime. |
| `panorama/layout/unit_status_overlay.xml` | Unit-status overlay include point for the runtime script. |
| `panorama/styles/unit_status.css` | Legacy healthbar color/style overrides. |

## Build

```powershell
$repo = "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "$repo\sr2compiler\New folder.exe" "$repo\hp"
```

Primary output is `hp_compiled/`. This folder is a legacy variant set; prefer
`hp_colors/` or `hp_colors_minimal/` for current Anita-backed HP Colors work.
