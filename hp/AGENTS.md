# hp/ - Enemy Health Bar Coloring

Multiple healthbar logic variants for enemy unit coloring. Choose ONE `healthbar_logic.js` to deploy.

## Variants

| Folder | Behavior | Colors |
|--------|----------|--------|
| `fixed/` | Static thresholds (25/65%) | Red < 25%, Orange 25-65%, Green > 65% |
| `interp/` | Smooth interpolation | Continuous gradient between thresholds |
| `team based fixed/` | Fixed + team colors | Amber (team1), Blue (team2) at high HP |
| `team based interp/` | Interp + team colors | Gradient with team-specific high HP colors |

## File Selection

Copy desired `healthbar_logic.js` to `hp/panorama/scripts/` for compilation.

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

## Other Scripts

| File | Purpose |
|------|---------|
| `citadel_hud_top_bar_health.js` | Top bar player health display |
| `souls_level_display.js` | Souls/level indicator |
| `custom_game/hud_scoreboard_mods.js` | Scoreboard customization |

## Build

See `.agent/workflows/compile.md`
