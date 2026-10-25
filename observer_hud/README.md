# Observer HUD (community edition)

A spectator top bar that community organisers can use for their own Deadlock tournaments. It is separate from `dlf/`, which carries one league's branding. This one should look like part of the base game and carry the organiser's event name, stage, team names, logos and series score.

## Status

**0.1.0 is published** ([GameBanana](https://gamebanana.com/mods/731315)): two looks picked in the editor, Base Game+ Names (default) and Night Desk (with the soul lead graph), objective cues, the ability status column and purchase notices, as pak10. **0.2.0** adds the Night Shift post-game board (exact stats, souls by source, final items, the soul lead line with objectives, torn-paper header), aliases by Steam account, and team cards tied to the match id through the store v2 page. Read `AGENTS.md` for the runtime, build and verification; `MAP.md` for status and the changelog; `PLAN.md` for the design history (publishing needs the user's go-ahead).

```powershell
node observer_hud/scripts/validate-observer-hud.js
powershell -ExecutionPolicy Bypass -File build_observer_hud.ps1 -Install
```

The pak is for observer PCs only: it ships spectator ability/modifier VData, so rebuild it after every Deadlock patch and do not play matches with it installed.

Design history: round 1 (designs 1-5), round 2 (6-10, hybrids of 2 and 5), RzR's feedback on 8 · Hairline, then round 3, 11 · Base Game+, the stock top bar plus the tournament additions (`decisions/`, `designs/index.html`).

## Layout

```text
panorama/               the mod (layouts, scripts, styles); see AGENTS.md
stock/                  pinned GameTracking layouts for the validator
scripts/                validate-observer-hud.js, verify-postgame-live.js, refresh-stock.py, make-torn-masks.py
shots/live/             in-game screens
spike/                  throwaway injection spike (not shipped)
designs/
  index.html            picker page (screenshots, tradeoffs, recommendations)
  d1-…d5-*.html         round 1, one mockup each; same mock match from shared/data.js
  d6-…d10-*.html        round 2 (2 x 5 hybrids) on shared/hybrid.css + hybrid.js
  shared/base.css       stage, palette, Panorama-safe CSS rules
  shots/                1920x1080 renders (round 2 also as *-long.png)
  assets/               generated, git-ignored: game art, fonts and masks
decisions/
  asset-triage.json     jevify triage of 2,786 pak01 panorama images
  design-scoring.json   round 1 jevify scores and head-to-head results
  design-scoring-round2.json   round 2 head-to-head, with 2 and 5 as anchors
  fable-pick.md, fable-pick-round2.md   Fable's reviews
tools/
  extract_design_assets.py
  render_shots.mjs      node observer_hud/tools/render_shots.mjs [--long] <design ids>; fails on page errors
```

## Rebuild the preview assets

```powershell
py observer_hud/tools/extract_design_assets.py
```

The script extracts the chosen images from the installed game's `pak01_dir.vpk` with `.tmp/source2viewer-cli/Source2Viewer-CLI.exe`, copies the mock roster, builds the backdrop from a real match frame (`.scratch/qollock_sb/shot.jpg`), and writes `designs/assets/generated.css`. That file holds the game fonts and SVG masks as data URIs, because Chrome refuses `file://` fonts and masks. The assets belong to Valve and are only used for local previews. In game the mod uses the same files by their `s2r://` paths, and Reaver, Retail Demo and VALVE Oracle already ship with Deadlock, so unlike DLF there are no fonts to install.

## Mockup rules

The mockup CSS is limited to what Panorama can draw: gradients, images, borders, radii, opacity, transforms, masks (`opacity-mask`) and text-shadow. The known exceptions to port are listed below:

- the dead-player greyscale uses CSS `filter`; in game it becomes `saturation` or a dark overlay panel;
- the conic gradients in designs 2 and 4 become a baked texture (2) or the radial clip arc (4);
- the trend graph in design 5 has no runtime SVG and needs a scripted panel.
