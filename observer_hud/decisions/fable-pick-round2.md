# Round 2 pick: anthropic/claude-fable-5-1 (effort med, design-taste-frontend skill)

2026-10-22. Read-only review of designs 6-10 (plus -long variants and round-1 d2/d5); not shown the jevify results.
After this review the shared player card was changed in all five designs (its fixes 1, 2 and 5 apply to the
shared card, not only to d9): the ultimate moved to a chip on the portrait corner, names use the full card
width and shrink to 10 px before ellipsis, and a dead player's name is muted. Fixes 3 and 4 are d9-only and
still open. The screenshots it reviewed predate that change. Verbatim reply below.

## Round 2 review

**1. Pick: d9 Two Tier.** It is the only one of the five that is a single solid block: identity, series and event on the 34 px strip, live numbers on the 72 px row, nothing floating underneath. It is also the narrowest (1242 px vs 1780 for d6, 1590 for d10) and the only design where both long team names render in full at 18 px without shrinking or ellipsis. The lacquer/brass strip over compact rows reads like a theatre sign over Deadlock's own centred top bar, so it keeps d2's character while being denser than d5.

**2. Runner-up: d6 Brass Slate.** It lost because it is three stacked pieces (bar, floating soul-lead tab, event caption at y=142), the series score is a 15 px brass "1 – 1" under the clock (least legible series indicator in the set), and long names ellipsize ("THE MIDNIGHT OW…", "BRIDGEPORT BRASS …") despite the shrink pass.

**3. Ratings (1-5)**

| Design | Clean | Legible | Deadlock style | Occlusion (5=least) | Long names | Panorama | Biggest weakness |
|---|---|---|---|---|---|---|---|
| d6 Brass Slate | 3 | 4 | 4 | 3 | 2 | 4 | Floating trend tab + caption make it three pieces; series score is tiny |
| d7 Marquee Lite | 2 | 4 | 4 | 3 | 2 | 4 | Six separate plates (2 team, 2 kills, crest, tab) with gaps; busiest silhouette |
| d8 Hairline | 4 | 3 | 3 | 4 | 2 | 4 | No container: kills demoted to 12 px subtext and the orphan "1" series digits read as a score; relies on a full-width 150 px scrim |
| d9 Two Tier | 5 | 4 | 4 | 4 | 5 | 5 | Ult cooldown number right-aligned in the card reads as a prefix of the next name ("34 Doyle") |
| d10 Brass Rail | 3 | 3 | 4 | 2 | 2 | 4 | Medallion hangs to 136 px and the share meter + caption push to ~200 px; most vertical sprawl |

Notes: the ult-number problem and the "Frostb…"/"Pocket…" truncation are in the shared card (hybrid.css `.hc .row`), so they appear in all five. d8's "least occlusion" is only true of hard pixels; its scrim darkens the whole top band, which is more area than d9's box. No design uses clip-path/filter/box-shadow (grep clean); the ::before/::after rings and tabs become nested panels in the port.

**4. Against round 1**
- vs d2 Deco Marquee: yes — same materials but one block instead of two plates plus a sunburst crest, ~30 px shorter, full team names, and kills/souls at a glance instead of inline in the team cell.
- vs d5 Broadcast Slate: yes — same height and density, but full names instead of NOW/BRS tags, a visible series score, and no floating soul-lead chart or third caption beneath the bar.

**5. Changes before build (d9)**
1. Move the ult indicator out of the name row onto the portrait's bottom-right corner (stock-HUD style). Seen: "Moth 34 Doyle 61 Frostb…" — the right-aligned cooldown sits 6 px from the next card's name and attaches to it.
2. With the row freed, let names use the full 70 px and shrink to ~10 px before ellipsis. Seen: "Frostb…" and "Pocket…" truncate at 12 px even though the row has room once the ult glyph is gone.
3. Raise the second-tier small numbers: souls 12 → 14 px, "NOW +3.3k" 13 → 15 px. Seen: at 1080p the souls figures are the smallest live data on screen, smaller than the static event title.
4. Separate the series boxes from the title: a 1 px brass-dim divider or 10 px gap between the "1" cells and the title text. Seen: "[1] DEADLOCK COMMUNITY CUP … [1]" reads as if the digits bracket the event name rather than belong to the teams.
5. Add a second dead cue besides the 0.68 overlay: mute the name to `--muted` while dead. Seen: Kestrel's naturally dark Haze portrait (alive, 82 % hp) looks as dark as Doyle's dead card; only the "12" and the empty health bar distinguish them.
