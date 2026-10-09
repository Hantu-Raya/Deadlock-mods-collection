# Feeder Feed design contract

Evidence comes from Deadlock ClientVersion 6753: `server.dll` SHA-256 `df75c14d…` (decomp in `.scratch/gold_split/`) and `client.dll` SHA-256 `678aec94…`. Check RVAs again after a game update before trusting them. Live confirmations quote the server's own `console.log` lines from local bot matches.

## Hero kill payout (feed total)

The killer's feed entry shows `T = S + bonus + paid` (server rva 9d30a0:521-523).

- Base bounty `B = trunc(f32(200 + 2000 * clamp(t / 2400, 0, 1)))`, where `t` is server game seconds. The defaults come from `citadel_player_gold_reward_min/max/time` (initializers 0xb53a0, 0xb52f0, 0xb5450). Live: labels 1:26 and 0:39 gave the server's 271 and 232.
- Participant scaling `S = ceil(f32(f32(B * frac[k-1]) * k))`, where `k` = (hero killer ? 1 : 0) + assisters and `frac` = `generic_data.vdata m_flHeroKillGoldShareFrac` `[1.25, 0.575, 0.283, 0.175, 0.11, 0.083]` (rva 9d36fb-9d3753; when `k` is outside 1–6 the bounty is 0). Live: ×1.15 for k=2 (271 → 312) and ×1.25 for k=1 (217 → 272). k ≥ 3 is unconfirmed live. `S` is both the paid bounty and the comeback base.
- First-kill bonus 125 (`citadel_player_gold_reward_first_kill_bonus`) is added unscaled. Live sandbox kills paid it with the killer's KDA past one, so always evaluate both 125 and 0; KDA only orders ties.
- Bounty split (rva 9de590): a hero killer keeps `total - floor((1 - 2.2 / (n + 2.2)) * total)` of `S + bonus` (`citadel_player_gold_killer_to_assist_ratio` 2.2), and the assisters split the rest. With no credited hero, the assisters take it all.

## Comeback (rva 9dd0e0)

- Team multiplier when `victimTeam - killerTeam > 1500`: `2.268 * (victimTeam / killerTeam - 1) + 1`. Difficulty multiplier when `victim > avg` and `avg > 1250` (avg = floor(killerTeam / killers)): `2.484 * (victim / avg - 1) + 1`. Multiply them, cap at 5 or at 7 once `floor(seconds / 60) >= citadel_trooper_laning_gold_rules_end_time` (default 8.0, initializer 0xb8810), then add 0.15 if the result is above 1, was not capped, and the winning side was not poor.
- Nominal `N = trunc(f32((trunc(f32(S * mult)) - S) * 0.4))`. Killer `K = trunc(0.3 * N)` (hero killer only); rest `R = N - K`; `W = 1.5 * assisters + others`; per assister `trunc(1.5 / W * R)`, per non-assister `trunc(R / W)`. `paid` sums the integer shares and is never `N`. Non-assisters are the other killer-team heroes. Live: S 312 → K 149, A 350, O 233 (with no non-assisters present, O is unpaid).
- Mode-hash branches (gamerules+10312: ×1.15/×0.85 after minute 10, +150 min/+450 max, scale 0.2, no team multiplier) are not visible from Panorama and are not modeled.

## Recovering the split

- The clock label shows whole seconds and trails the server: label 0:20 paid the 21 s bounty, and 1:13 paid the 74 s bounty. Candidate bases are `S(s)`, `S(s+1)`, `S(s+2)`.
- For each base × bonus, `paid = T - base - bonus` must satisfy `0 <= paid <= paid(N at cap + 0.15)`, and a nominal in `[paid, paid + recipients + 3]` must reproduce `paid` exactly.
- Choose the no-comeback candidate (`paid == 0`). Otherwise choose the candidate whose paid equals the frozen souls estimate. Candidates with identical shares need no choice. Anything else is `ambiguous-clock-candidates`, and the souls fallback marks the result as an estimate.
- Souls fallback: solve for the integer base within ±3 of `(T - bonus) / (1 + 0.4 * (mult - 1))` whose own paid reproduces `T`. Without a clock the cap is assumed to be 5.
- Top-bar souls are `{g:citadel_thousands:gold}`: plain below 1k, `1.2k`, and whole `49k` above 10k (about ±500 per hero). Accept only full, comma-grouped, or `k/m` numbers; markup is stripped. Anything else is unknown. Frozen values can already include the payout, so souls only gate or cross-check.

## Client facts (client.dll 6753; 6759 sha256 b48636d0… where noted)

- Feed side classes come from the relation function at rva 92a180 and the class table at 1d39530: 1 `neutral`, 2 `friendly`, 3 `enemy`, 4 `team_1` (Amber, game team 2), 5 `team_2` (Sapphire, game team 3). Spectators (local team 0/1) get 4/5. Live spectating logs show `spec=team_2>team_1`.
- Assister portraits are hero images named `PlayerAssist%i` (6759 rva 1d53ca8) with `SetHeroID` (1cf9c90) called with the same hero id. `CitadelHeroImage` (`CCitadel_UI_HeroImage`, JS registration at vtable +0x140, rva 1cfab80) adds only the `SetHeroID` method to `CImagePanel`, so `heroid` reads undefined on assister, killer and victim portraits. The `heroid` getter belongs to `CitadelHeroBadge`/`HeroBadgeBase` (top bar) and `HeroLogo`.
- Hero-kill entries (`CitadelHudInfoFeed`, 6759 ctor rva 1d4fcb0) set `killer_name`/`victim_name` with rva 8687a0, the same function the top bar uses for `player_name` (rva 1b5b1e9): the hero name when a global flag or the player's flag bit is set, else a Steam friend nickname, else the player name. Names therefore match between feed and top bar.
- The top bar team panels in the stock layout are `TeamFriendly team="2"` (Amber) / `TeamEnemy team="3"` (Sapphire); no top-bar code compares the local team (no `+0x3ef` reads in rva 1b55f40-1b5a500). HUD class `localPlayerTeam1`/`localPlayerTeam2` means local team 2/3 (rva 1b1edb4/1b1edd3). A Sapphire player therefore sees the enemy in `TeamFriendly` (live 2026-10-07). Spectators have neither class; the runtime treats Amber as home.

## Package

pak08 holds exactly `panorama/layout/hud_damage_report.vxml_c`, `panorama/scripts/feeder_feed.vjs_c` and `panorama/styles/feeder_feed.vcss_c`. The script ships Closure ADVANCED output; required surviving fragments are `FeederFeedStop`, `ff_entry`, `FeederRow` and `CitadelHudInfoFeed`. Use default parameters for optional arguments, since Closure warns on call-arity mismatches.
