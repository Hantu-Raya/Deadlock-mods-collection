# Place the header band right after `#TopBar`, not as the first child of `.HudCore`

The v2 build put the band first in `.HudCore` and moved `#TopBar` down by the band's height. The live run on 2026-10-22 (demo 121685912, 1920x1080) showed the stock top bar's `#GradientBacker` glow washing the band orange. The band now sits as a sibling right after `#TopBar` in its parent. Stock panels after `#TopBar` (shop, damage report, menus) still draw over it.

The live run fixed two more things in the same step: the left corner starts at `EDGE` after the stock mute icon (which draws over the band; for a while the lacquer itself stopped at the corner icons, and the current source draws it full width as in the mockup), and the band panel is 220 px tall and transparent, because a 56 px band gave the info card under it no room.

Consequences:

- The host re-moves the band after `#TopBar` when it is rebuilt (`MoveChildAfter`) and moves `#TopBar` down with an inline `margin-top` (band height plus the stock 8 px); the margin is cleared when spectating ends.
- Dark panels over the world blur use `world-blur: gaussian(2,2,2)` written out; panels on the band do not blur.

Sources: [PLAN.md](../../PLAN.md) "v2 built"; [ENGINE.md](../../ENGINE.md#top-bar-and-hud-geometry); `shots/live/v2-*.png`.
