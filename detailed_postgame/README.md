# Detailed Post Scoreboard Menu

A detailed stats board on the post-game **Scoreboard** screen. It appears whenever the stock post-game page opens a match.

- Exact numbers per player: souls, kills, deaths, assists, player damage, objective damage, healing
- Souls by source per player (troopers, neutrals, breakables, team bonus, enemy kills, objectives, urn, assists, denies)
- Final items, hero art, MVP and Key Player slips
- Team net worth, kills, game time and match id in the header
- Soul lead graph with objective markers, both teams' peak leads and the final lead

The board reads everything from the stock post-game page. It makes no web requests.

## Install

Put `pak11_dir.vpk` in `Deadlock\game\citadel\addons`, then restart Deadlock.

Observer HUD (pak10) and DLF (pak01) ship their own versions of this board and override the same post-game page. If either is installed, its board shows instead of this one. Works alongside ShowRank.
