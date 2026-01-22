# Feature: Hero Icons in Linger Overlays

## What Was Added
Each linger overlay now shows the enemy hero's icon behind the "?" marker.

## Changes Made

### 1. XML (hud.xml)
Changed each linger panel from:
```xml
<Panel id="LingerOverlay0" ...><Label class="linger-question" text="?" /></Panel>
```

To:
```xml
<Panel id="LingerOverlay0" ...>
  <CitadelHeroImage class="linger-hero-icon" heroimagestyle="small" />
  <Label class="linger-question" text="?" />
</Panel>
```

### 2. CSS (buff_claim.css)
Added `.linger-hero-icon` styles:
- 70% opacity (dimmed behind the "?")
- z-index: 1 (behind the "?" text)
- Full panel coverage

Updated `.linger-question`:
- z-index: 2 (in front of hero icon)
- position: absolute

### 3. JS (rejuvnbufftimer.js)
Modified `showLinger()` to:
- Accept `btn` (button reference) parameter
- Find `CitadelHeroImage` in the source button
- Copy `heroname` attribute to linger overlay's hero icon
- Log hero name for debugging

## Result
When an enemy enters fog, you'll now see:
- Enemy's hero icon (dimmed, 70% opacity)
- "?" overlay on top (white with red glow)
- Both at the enemy's last-known position
- Fades out after 5 seconds

## Debug Logs
Added `[LS] Found hero: <heroname>` log to verify hero icon copying works.
