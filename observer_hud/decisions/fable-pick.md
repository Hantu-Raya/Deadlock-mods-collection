# Design pick: anthropic/claude-fable-5-1 (effort med, design-taste-frontend skill)

2026-10-22. Read-only review of the five screenshots and sources; it was not shown the jevify scores.
Verbatim reply below. One correction: Panorama does have `saturation` and `wash-color` style
properties, so the duotone and dead-player greyscale are possible without CSS `filter` (not yet
checked in game).

## 1. Pick: **d2 Deco Marquee**

It is the only design that gives organisers a real event identity (stepped marquee crest, sunburst, clock) while staying inside Deadlock's own language: black lacquer, brass hairlines, Reaver/Retail Demo/Oracle, amber and sapphire kept for team data only. The arched portrait windows and the crest read as art deco at a glance, and every piece of it maps to Panorama primitives (gradients, borders, radii, one baked sunburst texture). Its faults are all tunable sizes and one occlusion decision, not structural.

## 2. Runner-up: **d1 Patron Ledger**

Safest match to the base game (stock masks, stock backers, stock paper plate) and the most legible bar of the five, but it reads as the stock top bar with a cream box stuck in the middle. The cream plate, black "NOW +3.3k" chip and the 190 px full-width scrim are three competing surfaces, the 228 px nowrap ident box clips any long team name, and nothing says "tournament". It is the fallback if occlusion from d2 cannot be brought down.

## 3. Ratings (1–5, 5 = best)

| Design | Theme fit | 1080p legibility | Occlusion (5 = least) | Organiser fit | Panorama feasibility | Biggest weakness |
|---|---|---|---|---|---|---|
| d1 Patron Ledger | 4 | 5 | 3 | 3 | 5 | Looks like the stock bar; no event presence, fixed-width ident clips long names |
| d2 Deco Marquee | 5 | 4 | 2 | 4 | 4 | Solid 1840×124 band plus 166 px crest is the heaviest occluder of the set |
| d3 Pulp Broadsheet | 3 | 4 | 1 | 4 | 2 | Sepia/grayscale portraits (a `filter`, unavailable in Panorama) destroy instant hero recognition; bright paper across the whole top fights the dark HUD |
| d4 Ritual Sigil | 3 | 2 | 5 | 2 | 3 | No backing plate: cream text straight over the game fails on bright map areas; event line pushed down to ~y175 into gameplay; series shown only as 8 px dots |
| d5 Broadcast Slate | 1 | 4 | 4 | 3 | 2 | Generic esports slate; team names reduced to 3-letter tags; soul-lead sparkline is runtime SVG |

Notes behind the numbers: all five use `filter: grayscale` for dead players (must become a dark overlay panel); d2's `repeating-conic-gradient` and d4's `conic-gradient` rings need a baked texture / radial clip arc; d3's torn edge and d1's SVG backers need PNG exports (trivial).

## 4. Changes before building d2

1. **Cut the occlusion.** In the shot the band is one opaque strip from x≈40 to x≈1880, 124 px tall, plus the crest to 166 px. Replace it with two side plates sized to their content (ident + 6 cards ≈ 760 px each) and the crest, leaving the gaps transparent; drop plate height to ~104 px, crest to ≤150 px, fill to ~0.85 alpha. That returns the zipline and the upper window band to the viewer.
2. **Series score is unreadable.** It is two 10 px diamonds next to "48.2k souls". Make it a 24 px VALVE Oracle `1 – 1` under the clock in the crest (replacing "NOW +3.3k", which moves to the side rows) or raise the diamonds to ≥16 px with a 2 px border. Keep "GAME III · BO3" on the stage line.
3. **Player names are 11 px letterspaced caps**; "POCKETW…" already truncates in a 68 px card. Go to 12–13 px, letter-spacing 0.04em, card width 74 px, keep ellipsis. Health bar from 4 px to 6 px (stock height) and ult diamond from 7 px to 10 px, or use the stock ult icon; at stream compression these are the first things lost.
4. **Long team names overflow.** "BRASS SAINTS" (12 chars, 21 px Reaver, nowrap) already fills the 180 px ident; anything longer runs under the logo. Allow a two-line wrap at 18 px, or Panorama `text-overflow: shrink` with a 15 px floor, and give the logo a fixed 48×48 slot with reserved margin plus a neutral placeholder so arbitrary organiser logos (any aspect) never collide.
5. **Dead state.** Replace `filter: grayscale(1) brightness(0.4)` with an overlay panel (rgba(0,0,0,0.65) + optional sapphire/amber tint) under the respawn number; keep the 28 px respawn digit, which is good. Add a low-health colour state on the arch border, not just the 4 px bar, since the bar is the only HP read in the bar.
6. **Bake the sunburst and colour the lead.** Ship the `repeating-conic-gradient` rays as one 520×520 PNG behind the clock (the source comment already assumes this). Colour the "NOW +3.3k" lead text amber or sapphire by leading team instead of fixed amber, so the lead is readable without parsing the tag.
