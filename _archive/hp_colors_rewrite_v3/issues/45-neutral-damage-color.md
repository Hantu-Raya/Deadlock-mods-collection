# 45: Neutral camps take the enemy damage color

**What to build:** with *Customize neutral camps* on, the neutral bar's damage delta uses the enemy *Damage delta color*. The bar keeps the neutral fill color; nothing else changes.

**Status:** built and VM-tested; installed for testing; not checked in game.

**Origin:** GameBanana report (panicpulsenow, 2026-10-27): "when using a custom neutral health bar it copies everything but the primary color from the enemy team. However, some of the feedback colors don't match/aren't copied from the enemy." Source: the renderer styled only the neutral fill (`plan`, `styles.fill`), so the delta kept the game's neutral `#f24d4d`. User decision (2026-10-28): neutral bars only show the bar and the damage delta, so only the delta follows the enemy side.

## Change

- `hp_colors_v3_renderer.js` `plan`: `styles.delta` is planned for neutral surfaces too, from the enemy side (neutral surfaces already read `config.side.enemy`). Healing, bullet shield and Rat King barrier stay unowned on neutrals. OLD boxes pick the color up through the same `styles.delta`.
- `settings/schema.json` `neutralEnabled` help names the enemy damage color (help text only; no slot, default or record change).

## Evidence

- Mutations killed: taking the delta from the ally side; styling healing on neutrals.

- `tests/renderer.test.js` "units: customized neutral camps take the enemy damage delta color and release it back to stock" (red first: delta `undefined`): enemy default `#FFE55B`, follows an enemy edit, ignores an ally edit, healing untouched, closing the gate restores the stock delta.

- Builds (2026-10-28, with tickets 44-46): normal release `aacba17b`, debug `ce77ca00`, QOLLOCK `a251c7d7`, ShowRank `12e5a542` (md5); staged suites 0 failures. Installed: ShowRank `12e5a542` as `addons/pak02_dir.vpk` (game closed, 6821); the previous tab build `c558d347` is in `addons_disabled/pak02_dir.vpk.showrank-colorblind-tab-c558d347`. Full suites: v3 1364/1364, QOLLOCK + ShowRank + v2 storage 93/93.
