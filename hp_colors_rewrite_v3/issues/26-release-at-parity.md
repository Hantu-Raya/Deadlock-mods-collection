# 26: Release at parity

**What to build:** With your consent: live test 2, replace pak02 with v3, archive v2 pak02, publish archive and changelog.

**Blocked by:** 25

**Status:** ready-for-agent

**Runs on:** you + main agent. **Review:** n/a.

- [ ] Your go-ahead recorded before install, launch and publishing
- [ ] 6-8 parity screenshots of representative presets
- [ ] v2 frozen; archives kept
- [ ] Installed pak02 hash matches the build
- [ ] Check topbar override conflicts, especially ShowRank pak89; use the ShowRank variant lane (`hp_colors_rewrite_v3_showrank/`, [ticket 34](34-showrank-variant.md)) or resolve the conflict before installing normal pak02

## Known topbar conflict

ShowRank pak89 also replaces `citadel_hud_top_bar.xml` and `hud_escape_menu.xml`. Lower-numbered paks win, so normal v3 pak02 shadows pak89's copies of those two layouts and silently drops ShowRank's Escape and topbar features; the other six ShowRank layouts, its runtime and its stylesheet still come from pak89. In the reverse arrangement, where pak89's layout wins over pak02, the v3 topbar module never boots: its countdowns disappear, and world pickups/ultimate progress deliberately stay closed until a valid v3 scan gate arrives. Healthbar rendering continues. Normal v3 plus ShowRank is not supported; use the ShowRank variant lane (`build_hp_colors_rewrite_v3_showrank.ps1`, ticket 34) as pak02 instead.
