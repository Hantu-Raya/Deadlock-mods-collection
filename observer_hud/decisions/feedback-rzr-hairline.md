# RzR feedback on 8 · Hairline (2026-10-22)

RzR likes 8 · Hairline. Discord, relayed by hanturaya101:

> wtf are these icons
> grand finals should be above and the title should be below or viseversa
> (asked about the border) Grandfinal, then in small letters bo3. 2nd one is good enough for border

Two lines were ambiguous. One jevify `judge` call with the design 8 screenshot and the chat (rubric written before judging):

| Question | Verdict | p |
|---|---|---|
| "these icons" | the placeholder team emblems beside the team names | 0.73 (ultimate dots 0.24) |
| "2nd one … for border" | keep only the second (inner) frame line | 0.74 (design 2's border 0.16) |

Changes in v2 (old render kept as `designs/shots/d8-hairline-v1.png`):

- Team logo slots show a monogram of the team tag instead of the stock Hidden King / Archmother emblems. An organiser logo (`team.customLogo`) replaces the monogram. This is in the shared kit, so 6-10 all changed.
- ~~The ready ultimate showed as "ULT" text~~ (the 0.24 reading of "these icons"). Reverted the same day at the user's request ("leave the ult as default"): designs 6-10 use the stock ultimate glyph again.
- The frame top reads "GRAND FINAL" with "BO3" in small letters under it. The event title stands alone below the frame.
- The frame has one line, the former inner line, instead of two.

If "2nd one" meant design 2's border, or "these icons" meant something else, the change is one rule in `d8-hairline.html` / `shared/hybrid.css`.
