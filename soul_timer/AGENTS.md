# SOUL TIMER KNOWLEDGE BASE

## OVERVIEW
Displays a countdown timer for unsecured soul drainage above the soul counter. Handles Shop/Escape menu visibility via re-parenting.

## LOGIC (`soul_timer.js`)
- **Drain table**: `DRAIN_TBL` is built in 25-soul steps using
  `PCT_DRAIN = 0.005`, `BASE_FLAT = 1.6`, `FLAT_GROWTH = 0.08`,
  `SIM_STEP = 0.5`, and `MAX_SIM = 600`.
- **Runtime estimate**: lookup interpolates between adjacent `DRAIN_TBL`
  entries, then applies the game-time dampener `interp * (1 - gameMin * 0.008)`.
- **Time/cache guards**: `TIME_TTL = 500`; watchdog uses `WD_CHECK = 3.0` and
  `WD_STALL = 6000`. `Game.GetGameTime()` is the primary game-time source with
  text parsing fallback.
- **Steal & Re-parent**: 
  - UI defined in `hud_gold_and_ap_container.xml` (for organization).
  - Script moves it to `CitadelHud` (Root) on boot to avoid being hidden when Shop closes the gold container.
- **Escape Menu**: explicitly hides if `root.BHasClass("ShowEscapeMenu")`.
- **Color States**: White (<500), Yellow (500-1000), Red (>=1000). Managed via CSS classes.

## STRUCTURE
- **XML**: `hud_gold_and_ap_container.xml` defines `<Panel id="SoulTimerOverlay">`.
- **Script**: `hud.xml` includes `soul_timer.js` (runs in persistent context).
- **CSS**: `soul_timer.css` handles positioning and layout box.

## BUILD
Compile only from the repo root after Panorama edits:

```powershell
$repo = "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "$repo\sr2compiler\New folder.exe" "$repo\soul_timer"
```

Primary output is `soul_timer_compiled/`.

## CSS LAYOUT (v3.2)
```css
#SoulTimerLabel {
    width: 100px;
    height: 100px;
    text-align: center;
    padding-top: 25%;
    margin-bottom: 12.2%;
    margin-left: 9.4%;  /* 16:9 default */
}

.AspectRatio16x10 #SoulTimerLabel { margin-left: 10.7%; }
.AspectRatio16x9 #SoulTimerLabel { margin-left: 9.4%; }
```

Fixed 100x100px box allows `pre-transform-scale2d` animation (in warning addon) without layout shift.
The 21:9 CSS override is intentionally empty in this checkout.

## GOTCHAS
- **Layout Shift**: Overlay must be at the BOTTOM of XML and `width:0` initially to avoid pushing HUD elements.
- **Visibility**: Script resets `opacity` and `width` after re-parenting.
- **Aspect Ratios**: Margins differ per aspect ratio. Test on 16:9 and 16:10.

## ADDON SUPPORT
`soul_timer_warning_addon/` extends this mod with pulse animation on `.red` state. Base mod provides the label and classes; addon overrides `.red` styling.
