# SOUL TIMER KNOWLEDGE BASE

## OVERVIEW
Displays a countdown timer for unsecured soul drainage above the soul counter. Handles Shop/Escape menu visibility via re-parenting.

## LOGIC (`soul_timer.js`)
- **Formula**: `0.5% * remaining + 1.6 * (1 + 0.08 * gameMinutes)`
- **Steal & Re-parent**: 
  - UI defined in `hud_gold_and_ap_container.xml` (for organization).
  - Script moves it to `CitadelHud` (Root) on boot to avoid being hidden when Shop closes the gold container.
- **Escape Menu**: explicitly hides if `root.BHasClass("ShowEscapeMenu")`.

## STRUCTURE
- **XML**: `hud_gold_and_ap_container.xml` defines `<Panel id="SoulTimerOverlay">`.
- **Script**: `hud.xml` includes `soul_timer.js` (runs in persistent context).
- **CSS**: `soul_timer.css` handles positioning (10.5% left margin for 16:9).

## GOTCHAS
- **Layout Shift**: Overlay must be at the BOTTOM of XML and `width:0` initially to avoid pushing HUD elements.
- **Visibility**: Script resets `opacity` and `width` after re-parenting.
