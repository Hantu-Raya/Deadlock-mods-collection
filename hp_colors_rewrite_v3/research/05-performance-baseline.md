# HP Colors v2 synthetic performance baseline

Measured 2026-10-14 for [ticket 05](../tickets/05-performance-baseline.md). **Evidence level 1: synthetic Panorama VM operation counts, not native execution time, CPU, frame time or FPS.** No game launch, deployment, build wrapper, test suite or source edit occurred.

## Result

- Across all three final runs, every operation counter had **zero run-to-run spread**. Wall time varied; it is diagnostic only.
- The settled, uniformly instrumented V2-style matrix costs **359.9–388.3 counted operations/bar/s active**, **257.3–279.7 idle**, and **40.8–46.4 dormant with nonhero gates closed**. Master-off heroes cost **153.8/bar/s**, versus **36–41.6/bar/s** for nonheroes.
- A hero color toggle is not a whole-bar gate: `enemyEnabled`/`allyEnabled` off leaves a player surface and polling when HP text is enabled. Do not call those bars dormant.
- Idle first-hit color/pip response is **100 ms mean, 150 ms sampled maximum** in every applicable run. This is simulated polling latency, not network latency or time to screen presentation.
- Proposed, **not decided**: V2-style **300 active / 200 idle**, OLD-style **450 active / 250 idle**, and **30 dormant** counted operations/bar/s, with no idle-response regression. These are fixture-scoped proxy budgets for the user to confirm, not a claim that v3 can already meet them.

## Source and exact execution

Repository HEAD was `12e614b6d0b17103e3da39048108086ea95058cf`. Node was `v25.9.0`. All processes ran from the repository root; the child environment explicitly removed `HP_COLORS_REWRITE_SOURCE_ROOT`, so the scripts used current `hp_colors_rewrite_v2/`, not another source tree. Other agents could consume CPU; measurement processes were serial.

The exact argument vectors, repeated in this order for runs 1, 2 and 3:

```text
node scripts/measure-hp-colors-rewrite-v2-refactor.js
node scripts/profile-hp-colors-rewrite-v2-reads.js stable 100000
node scripts/profile-hp-colors-rewrite-v2-reads.js active 100000
```

The measurement script accepts only `--output <file>`; it was omitted and JSON stdout was captured in memory. The profiler accepts `[stable|active] [top]`; `100000` prevents the default top-40 truncation. Thus the measurement script ran three times and the profiler ran three times **per mode** (six invocations). All exited successfully, including the measurement script's built-in scheduler and latency assertions.

The supplemental matrix below was then run via `node -` three times with the exact stdin program in the appendix. It reuses the same fixture and measurement helper without registering their tests. No supplementary script or raw-output files were created; results are retained here.

SHA256 of measured source and harness files:

| File | SHA256 |
|---|---|
| `hp_colors_rewrite_v2/panorama/scripts/hp_colors_v2_contract.js` | `5e9df591c60855b54331ab32f19581ab26363a2cd89f9aa5b4dd8c1dce586bb0` |
| `hp_colors_rewrite_v2/panorama/scripts/hp_colors_v2_state.js` | `fd740ec702748a4ed9b4b437dd679e041886401b897f0e91ac3fbbbf0057ba8f` |
| `hp_colors_rewrite_v2/panorama/scripts/hp_colors_v2_menu.js` | `8915cd81330287c34e81fd951d4732e83e0063c9cbf68d099339aa8216d666e1` |
| `hp_colors_rewrite_v2/panorama/scripts/unit_status_v2_colors.js` | `fb086fc4b7d10d4c3de3c9b95a16bb15dc57db6c96ddd25999901a6212098e25` |
| `scripts/measure-hp-colors-rewrite-v2-refactor.js` | `b03b75c866a1799784413fd9ef917f6a248e56ed095fe50442e3109d11b6cea2` |
| `scripts/profile-hp-colors-rewrite-v2-reads.js` | `b6b003c11c49beaa5cf544a814fc0312d3adc79ea2180b065235aceecae511d5` |
| `scripts/hp-colors-panorama-test-adapter.js` | `b9f756ba694be4a4b33273e31c9e2d183bf54fff091bda91bb5c26d22014ffc1` |
| `scripts/validate-hp-colors-rewrite-v2-baseline.test.js` | `8179f8d66bc0f41ac6475b84bd2bb0c4475fa01726383369a534fb4fdcf66dc0` |
| `scripts/validate-hp-colors-rewrite-v2-style.test.js` | `bc7137de020cb93aeee8098812d718df55a1b83ac196ac4b6132b03aa479fecd` |

## Counting rule

Every renderer scenario contains **one bar and one context**, except `noBars`, which is per-context overhead only. Each measured window is 10 simulated seconds at 100 ms input steps. Rates are counts divided by 10; do not divide by callback count or VM wall time.

The counted-operation proxy sums:

```text
traversal + parentReads + parentWrites + classReads + classWrites
+ styleReads + styleWrites + textReads + textWrites
+ layoutWidthReads + layoutOtherReads
```

`findTraversals` and `childrenReads` are overlapping breakdowns of `traversal`, **not additional calls**; summing them again double counts (`scripts/hp-colors-panorama-test-adapter.js:216-233,322-341`). Callbacks/s are reported separately, not added as native calls. Native-call proxy is the primary metric; it is not an exhaustive count of engine API crossings (see Limits).

The original script warms up for 1 s and excludes final observation reads (`scripts/measure-hp-colors-rewrite-v2-refactor.js:117-154`). Only OLD scenarios install the extra height/offset counters (`:58-70,74-88`). The supplemental matrix installs them uniformly, settles for 5 s plus that 1 s warmup, and subtracts exactly 100 fixture-generated clip writes from each active window. This removes input injection from renderer style writes.

## Requested script results: original scenarios

All totals and every individual counter were identical in runs 1–3. `Lw` is layout-width reads/s; `Lo` is height/x/y-offset reads/s. `—` means **not instrumented**, not zero. `T` is traversal, `P` parent reads, `C` class reads, `S` style reads/writes, `X` text reads. Parent writes/class writes are otherwise zero, except the rows noted below.

| Scenario | Counted ops/s, min–max | T | P | C | S read / write | X | Lw / Lo | Callbacks/s | VM ms, r1 / r2 / r3 | VM ms, min–max |
|---|---:|---:|---:|---:|---|---:|---|---:|---|---|
| stableEnemy | 284.3–284.3 | 24.2 | 46.7 | 114.2 | 79.6 / 0 | 3 | 16.6 / — | 7.7 | 2.069 / 2.087 / 2.757 | 2.069–2.757 |
| activeEnemy | 334–334 | 24.2 | 62.5 | 122.8 | 68.8 / 11.6 | 3 | 41.1 / — | 6 | 3.471 / 3.484 / 3.873 | 3.471–3.873 |
| stableAlly | 277.9–277.9 | 23 | 45.7 | 114.2 | 76.8 / 0 | 3 | 15.2 / — | 7.7 | 1.353 / 1.359 / 1.504 | 1.353–1.504 |
| replacement | 324.3–324.3 | 28.4 | 49.4 | 121.2 | 93.8 / 8 | 3 | 17.4 / — | 7.7 | 2.323 / 2.343 / 2.421 | 2.323–2.421 |
| layoutReset | 295.3–295.3 | 24.2 | 47.2 | 118.6 | 83.8 / 1 | 3 | 17.5 / — | 7.7 | 1.881 / 1.928 / 2.094 | 1.881–2.094 |
| oldStable | 312.7–312.7 | 20.6 | 40.9 | 113.1 | 76.9 / 0 | 3 | 20.7 / 37.5 | 7.4 | 2.272 / 2.351 / 2.436 | 2.272–2.436 |
| oldActive | 561.8–561.8 | 20.6 | 82.1 | 117 | 104.4 / 85.9 | 3 | 50 / 98 | 6 | 4.681 / 4.754 / 5.027 | 4.681–5.027 |
| oldUnlaidActive | 555.8–555.8 | 20.6 | 82.1 | 117 | 104.4 / 85.9 | 3 | 50 / 92 | 6 | 4.035 / 4.149 / 4.736 | 4.035–4.736 |
| noBars (per context) | 7–7 | 6 | 1 | 0 | 0 / 0 | 0 | 0 / — | 1 | 0.073 / 0.068 / 0.069 | 0.068–0.073 |

Additional original counts: replacement has 0.6 parent writes/s and 2.5 class writes/s (including fixture deletion/replacement); OLD active and unlaid have 0.4 parent writes/s and 0.4 class writes/s. No measured text writes occurred. The OLD active totals include **20 fixture clip writes/s**, not renderer writes (`measure...js:90-93`); corrected renderer-proxy totals are **541.8** laid and **535.8** unlaid, with **65.9** style writes/s. The replacement/layout-reset rows are mixed transition windows, not steady-state budgets.

Observed output was identical across all three runs, establishing that the scenarios exercised painting: stable hero wash `#fe681b`, active hero wash `#66ca00`; OLD stable showed 43 fill/7 shield boxes, digest `6721a3f04cdcae03`; both OLD active paths showed 39 fill/4 shield boxes, digest `ee51348124afb831`. These are synthetic output checks, not visual parity evidence.

The unrelated menu/state scenarios are reported for completeness, not charged per world bar: 100 editor changes took 100.442 / 101.652 / 102.957 VM ms; scope selections took 90.697 / 92.799 / 94.935 ms. All three state runs counted 601 stringify calls, 1,938,072 serialized characters and 1,100 newly frozen objects for 100 edits. No menu/storage/timer ceiling is inferred from those figures.

## Profiler results: where OLD reads come from

The complete profile output was byte-identical across each mode's three runs. Profiler counts only style/layout/class **reads**, not writes or total operations. Rates below are per bar per simulated second.

| Mode | Style reads/s, min–max | Layout reads/s, min–max | Class reads/s, min–max | Sum of profiled reads/s |
|---|---:|---:|---:|---:|
| stable | 76.9–76.9 | 58.2–58.2 | 81.5–81.5 | 216.6 |
| active | 104.4–104.4 | 148–148 | 85.4–85.4 | 337.8 |

Representative hot reads:

| Mode | Panel/property | Reads/bar/s (all runs) |
|---|---|---:|
| stable | `unit_healthbar_lagging.actuallayoutwidth`, `.actualxoffset` | 8 each |
| stable | `unit_healthbar_lagging.clip`, `.transform`, `.preTransformScale2d`, `.width` | 8 each |
| stable | `unit_healthbar_bullet_shield.clip` | 8 |
| stable | `LevelContainer.margin`, `unit_info_panel.margin` | 2.4 each |
| stable | `InfoHealthContainer.actuallayoutwidth`, `.actuallayoutheight`, `LevelContainer.actuallayoutheight` | 2.1 each |
| active | anonymous stock line `.position`, `.actualxoffset`; `UnitHealthbarLines.actuallayoutwidth` | 9 each |
| active | `InfoHealthContainer.actuallayoutwidth`, `.actuallayoutheight`, `LevelContainer.actuallayoutheight`, `unit_info_panel.actuallayoutheight` | 6 each |
| active | `UnitHealthbarsContainer.actualxoffset`, `.actualyoffset`, `.actuallayoutwidth`; `UnitHealthbar.actualxoffset`, `.actualyoffset` | 6 each |

The profiler wraps `fx.window` and descendants, **not world/root ancestors** (`profile...js:35-48`). Consequently it misses 31.6 ancestor class reads/s compared with the operation adapter: 81.5 versus 113.1 stable, 85.4 versus 117 active. Do not interpret its lower class total as a second performance baseline. Its layout and style totals match the OLD measurement rows.

## Supplemental matrix: kinds, states and gates

The requested scripts contain no active-ally or nonhero gate/dormant scenarios. The appendix fills that coverage gap with the existing ownership fixture (`scripts/validate-hp-colors-rewrite-v2-style.test.js:156-232`).

Setup: gradient hero/NPC/objective colors, HP readouts on for both sides, pips on, V2-style `barMask: 'none'`; 2,000 HP stock lines, 69 px inner width, 50% initial fill. Active input alternates 50%/80% every 100 ms. Unspecified values come from the fixture's `sparseDefaults`, **not an assertion of the entire shipped-default preset**. Each tested gate is isolated: other nonhero gates are off. Classes/gates:

| Kind | Carrier classes | Gate |
|---|---|---|
| Enemy hero | `player enemy` | `enemyEnabled` (color toggle) |
| Ally hero | `player friend` | `allyEnabled` (color toggle) |
| Enemy NPC | `creature enemy` | `npcEnemyEnabled` |
| Ally NPC | `creature friend` | `npcAllyEnabled` |
| Neutral camp | `neutral_weak team_neutral` | `npcNeutralEnabled` |
| Enemy objective | `boss_tier1 enemy` | `buildingEnemyEnabled` |
| Ally objective | `boss_tier1 friend` | `buildingAllyEnabled` |

Actual state is supported by the in-memory bar-state observation and pending callbacks: `probeHealth` for idle, `paintColors` for active; all dormant rows have an empty surface and only `scan` scheduled. Neutral active color stays `#123456`, but HP/readout work still causes the active scheduler path. Gate-off hero colors stay stock (`#FD4949` enemy / `#FFEFD7` ally), yet the surface remains `player`; only master off makes those hero fixtures dormant.

All 35 rows had zero spread in **every counter**, not merely the total. Active callback rates were 6/s, idle 7.6/s (mostly cheap probes), dormant 1/s. Higher idle callback count does not imply more work than active paint.

| Kind | Input / gate | Actual state | Counted ops/bar/s, min–max | VM ms, r1 / r2 / r3 | VM ms, min–max |
|---|---|---|---:|---|---|
| Enemy hero | stable HP / gate on | idle | 273.3–273.3 | 1.785 / 1.761 / 1.782 | 1.761–1.785 |
| Enemy hero | moving HP / gate on | active | 388.3–388.3 | 3.528 / 3.488 / 3.603 | 3.488–3.603 |
| Enemy hero | stable HP / gate off | idle | 273.3–273.3 | 1.211 / 1.221 / 1.224 | 1.211–1.224 |
| Enemy hero | moving HP / gate off | active | 369.7–369.7 | 2.945 / 2.897 / 2.959 | 2.897–2.959 |
| Enemy hero | stable HP / master off, gate on | dormant | 153.8–153.8 | 0.354 / 0.323 / 0.895 | 0.323–0.895 |
| Ally hero | stable HP / gate on | idle | 273.3–273.3 | 1.16 / 1.12 / 1.125 | 1.12–1.16 |
| Ally hero | moving HP / gate on | active | 388.3–388.3 | 2.839 / 2.809 / 2.857 | 2.809–2.857 |
| Ally hero | stable HP / gate off | idle | 273.3–273.3 | 1.266 / 1.26 / 1.289 | 1.26–1.289 |
| Ally hero | moving HP / gate off | active | 369.7–369.7 | 2.931 / 2.802 / 2.929 | 2.802–2.931 |
| Ally hero | stable HP / master off, gate on | dormant | 153.8–153.8 | 0.338 / 0.361 / 0.355 | 0.338–0.361 |
| Enemy NPC | stable HP / gate on | idle | 279.7–279.7 | 1.224 / 1.214 / 1.216 | 1.214–1.224 |
| Enemy NPC | moving HP / gate on | active | 382.3–382.3 | 2.993 / 2.959 / 3.062 | 2.959–3.062 |
| Enemy NPC | stable HP / gate off | dormant | 46.4–46.4 | 0.166 / 0.157 / 0.161 | 0.157–0.166 |
| Enemy NPC | moving HP / gate off | dormant | 46.4–46.4 | 0.175 / 0.174 / 0.168 | 0.168–0.175 |
| Enemy NPC | stable HP / master off, gate on | dormant | 41.6–41.6 | 0.138 / 0.138 / 0.139 | 0.138–0.139 |
| Ally NPC | stable HP / gate on | idle | 279.7–279.7 | 1.151 / 1.163 / 1.166 | 1.151–1.166 |
| Ally NPC | moving HP / gate on | active | 382.3–382.3 | 2.836 / 2.846 / 2.917 | 2.836–2.917 |
| Ally NPC | stable HP / gate off | dormant | 46.4–46.4 | 0.159 / 0.146 / 0.149 | 0.146–0.159 |
| Ally NPC | moving HP / gate off | dormant | 46.4–46.4 | 0.192 / 0.183 / 0.168 | 0.168–0.192 |
| Ally NPC | stable HP / master off, gate on | dormant | 41.6–41.6 | 0.152 / 0.157 / 0.15 | 0.15–0.157 |
| Neutral camp | stable HP / gate on | idle | 274.9–274.9 | 1.089 / 1.089 / 1.112 | 1.089–1.112 |
| Neutral camp | moving HP / gate on | active | 383.7–383.7 | 2.969 / 2.947 / 3.061 | 2.947–3.061 |
| Neutral camp | stable HP / gate off | dormant | 45.2–45.2 | 0.142 / 0.142 / 0.142 | 0.142–0.142 |
| Neutral camp | moving HP / gate off | dormant | 45.2–45.2 | 0.168 / 0.164 / 0.169 | 0.164–0.169 |
| Neutral camp | stable HP / master off, gate on | dormant | 40.4–40.4 | 0.134 / 0.132 / 0.145 | 0.132–0.145 |
| Enemy objective | stable HP / gate on | idle | 257.3–257.3 | 2.345 / 2.304 / 2.13 | 2.13–2.345 |
| Enemy objective | moving HP / gate on | active | 359.9–359.9 | 2.775 / 2.766 / 2.78 | 2.766–2.78 |
| Enemy objective | stable HP / gate off | dormant | 40.8–40.8 | 0.137 / 0.138 / 0.133 | 0.133–0.138 |
| Enemy objective | moving HP / gate off | dormant | 40.8–40.8 | 0.164 / 0.16 / 0.158 | 0.158–0.164 |
| Enemy objective | stable HP / master off, gate on | dormant | 36–36 | 0.131 / 0.129 / 0.129 | 0.129–0.131 |
| Ally objective | stable HP / gate on | idle | 257.3–257.3 | 1.084 / 1.067 / 1.075 | 1.067–1.084 |
| Ally objective | moving HP / gate on | active | 359.9–359.9 | 2.789 / 2.776 / 2.844 | 2.776–2.844 |
| Ally objective | stable HP / gate off | dormant | 40.8–40.8 | 0.142 / 0.136 / 0.142 | 0.136–0.142 |
| Ally objective | moving HP / gate off | dormant | 40.8–40.8 | 0.166 / 0.17 / 0.166 | 0.166–0.17 |
| Ally objective | stable HP / master off, gate on | dormant | 36–36 | 0.134 / 0.133 / 0.128 | 0.128–0.134 |

### Supplemental call-type breakdown

Rates below are per bar per simulated second and are identical in all three runs. Enemy/ally paired types had identical counters; their independent VM timings remain separate above. Parent writes, class writes and text writes are zero in every supplemental row. `Layout other` includes height and x/y offsets. `idleOff`/`activeOff` are input labels; the nonhero actual state is dormant.

| Kind (both sides where equal) | Input / gate | Traversal | Parent reads | Class reads | Style reads | Style writes | Text reads | Layout width | Layout other | Total |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hero | idleOn | 19.4 | 33.7 | 111 | 59.6 | 0 | 3 | 16.5 | 30.1 | 273.3 |
| hero | activeOn | 19.4 | 49.7 | 111 | 62.8 | 12.4 | 3 | 41 | 89 | 388.3 |
| hero | idleOff | 19.4 | 33.7 | 111 | 59.6 | 0 | 3 | 16.5 | 30.1 | 273.3 |
| hero | activeOff | 19.4 | 49.7 | 111 | 53.5 | 3.1 | 3 | 41 | 89 | 369.7 |
| hero | masterOff | 17.2 | 26.6 | 108 | 0 | 0 | 0 | 1 | 1 | 153.8 |
| NPC | idleOn | 19.4 | 33.7 | 125.4 | 51.6 | 0 | 3 | 16.5 | 30.1 | 279.7 |
| NPC | activeOn | 19.4 | 49.7 | 125.4 | 48.6 | 6.2 | 3 | 41 | 89 | 382.3 |
| NPC | idleOff | 7.6 | 9.8 | 26.6 | 0 | 0 | 0 | 1.2 | 1.2 | 46.4 |
| NPC | activeOff | 7.6 | 9.8 | 26.6 | 0 | 0 | 0 | 1.2 | 1.2 | 46.4 |
| NPC | masterOff | 7.6 | 9.8 | 21.8 | 0 | 0 | 0 | 1.2 | 1.2 | 41.6 |
| Neutral camp | idleOn | 19.4 | 33.7 | 120.6 | 51.6 | 0 | 3 | 16.5 | 30.1 | 274.9 |
| Neutral camp | activeOn | 19.4 | 49.7 | 120.6 | 51.7 | 9.3 | 3 | 41 | 89 | 383.7 |
| Neutral camp | idleOff | 7.6 | 9.8 | 25.4 | 0 | 0 | 0 | 1.2 | 1.2 | 45.2 |
| Neutral camp | activeOff | 7.6 | 9.8 | 25.4 | 0 | 0 | 0 | 1.2 | 1.2 | 45.2 |
| Neutral camp | masterOff | 7.6 | 9.8 | 20.6 | 0 | 0 | 0 | 1.2 | 1.2 | 40.4 |
| objective | idleOn | 19.4 | 33.7 | 103 | 51.6 | 0 | 3 | 16.5 | 30.1 | 257.3 |
| objective | activeOn | 19.4 | 49.7 | 103 | 48.6 | 6.2 | 3 | 41 | 89 | 359.9 |
| objective | idleOff | 7.6 | 9.8 | 21 | 0 | 0 | 0 | 1.2 | 1.2 | 40.8 |
| objective | activeOff | 7.6 | 9.8 | 21 | 0 | 0 | 0 | 1.2 | 1.2 | 40.8 |
| objective | masterOff | 7.6 | 9.8 | 16.2 | 0 | 0 | 0 | 1.2 | 1.2 | 36 |

## Idle first-hit latency

A first hit was injected after 5 s unchanged, at 30 phases 50 ms apart across a 1.5 s window. Observation advances by 10 simulated ms; no op count is taken in the latency loop (`measure...js:199-236`).

| Scenario | Observable | Mean ms, r1 / r2 / r3 | Max ms, r1 / r2 / r3 | Mean/max run spread |
|---|---|---|---|---|
| Original gradient enemy | wash color | 100 / 100 / 100 | 150 / 150 / 150 | 0 / 0 |
| Original OLD enemy | visible fill-box count | 100 / 100 / 100 | 150 / 150 / 150 | 0 / 0 |
| Supplemental enemy/ally heroes | wash color | 100 / 100 / 100 | 150 / 150 / 150 | 0 / 0 |
| Supplemental enemy/ally NPCs | wash color | 100 / 100 / 100 | 150 / 150 / 150 | 0 / 0 |
| Supplemental enemy/ally objectives | wash color | 100 / 100 / 100 | 150 / 150 / 150 | 0 / 0 |
| Neutral camp | fixed custom fill has no hit-driven color change | not measured | not measured | N/A |
| Dormant/gate-off bars | no custom color response is expected | not applicable | not applicable | N/A |

Supplemental responding scenarios had 50 ms sampled minimum in each run. Sampling is not an exhaustive phase sweep and can overstate the true callback latency by less than 10 ms. Native bound HP-text changes, neutral first-hit presentation, engine layout settling, dormant wake/enable latency and display presentation latency remain unmeasured.

## Proposed v3 ceiling — awaiting user confirmation

Use a failing **synthetic, fixture-scoped** regression check, not a wall-time gate. Proposed budgets use the counting rule above, uniformly instrument all layout axes, exclude input/observation operations, and preserve current fixture feature behavior. Apply separately to every kind/side and both closed-gate HP-input patterns, never average a cheap kind with an expensive one.

| Fixture/state | Proposed maximum counted operations/bar/s | Measured comparison |
|---|---:|---|
| V2-style active | 300 | 359.9–388.3; requires at least 16.6% reduction |
| V2-style idle | 200 | 257.3–279.7; requires at least 22.3% reduction |
| OLD-style active (laid and unlaid) | 450 | corrected 535.8–541.8; requires at least 16% reduction |
| OLD-style idle | 250 | 312.7; requires 20% reduction |
| Dormant, all kinds | 30 | closed nonhero gates 40.8–46.4; master off 36–153.8 |
| Idle first-hit response, responding fixtures | sampled max ≤150 ms; mean ≤100 ms | current sampled max 150 / mean 100 |

The dormant proposal is intentionally strongest for master-off heroes: v2 still performs normal player classification/parts work, whereas [PLAN D6](../PLAN.md#d6-renderer-facts--plan--apply) calls for the same cheap dormant carrier check for all kinds. Replacing the periodic full walks is a plausible optimization hypothesis, **not a measured v3 win**. Dormant objective 40.8 → 30 is a proposed 26.5% reduction in this proxy, not a measured percentage of whole-game or whole-HPv2 CPU time.

No VM wall-time ceiling is proposed: it depends on machine, competing agents, Node/JIT, GC and mock implementation. Retain VM timings for diagnostics only. Before treating this as an exhaustive native-call ceiling, extend the adapter to count omitted engine APIs and take a new v2 baseline with that exact metric; do not silently compare new full coverage to the partial figures here. Additional feature-heavy presets and OLD nonhero/ally paths need their own baseline fixtures before a parity-wide ceiling can be claimed.

## Limits and evidence boundaries

1. **No real native calls or FPS were measured.** The VM proxies stand in for style/layout/class access. Real binding costs, allocation/GC, CSS invalidation, painting, C++/GPU work and engine-bound labels are absent. A constant counter is stronger evidence of repeated mock work than a small wall-time difference, not evidence of an FPS gain.
2. **Counter coverage is partial.** `IsValid`, `actualuiscale_x/y`, attributes, `.visible`, `GetContextPanel`, event dispatch, scheduling/cancellation and other native methods are not operation-counted. Executed callbacks are separate. Recursive mock `FindChildTraverse` counts each recursion whereas the engine exposes one traversal API crossing; native work inside a traversal is unknown. Some composed mock methods similarly expand into other counted mock calls. These totals are a stable proxy, not exact native crossings (`adapter.js:196,331-341,473-486,507-553`).
3. **Original scripts have uneven coverage.** Standard hero scenarios miss non-width layout reads; OLD scenarios instrument them. Original active OLD style writes include injected inputs. The profiler misses ancestor class reads, does not count writes, and instruments only panels existing when it wraps the tree. Do not sum the profiler with the adapter or compare differently covered totals as a speedup.
4. **State and setup matter.** Original stable windows include post-boot settling after only 1 s. Supplementary windows are settled at 6 s and have a different fixture tree, readouts and line setup. Neither is a universal preset average. A side color toggle off is not a player-surface release (`unit_status_v2_colors.js:573-594,4321-4330,4466-4469`).
5. **The matrix is representative, not every engine class.** NPC uses `creature`; objective uses `boss_tier1`; neutral uses `neutral_weak`. Other class combinations, neutral objectives, unknown/ambiguous units, occlusion, panel recycling, dead carriers/lineage changes, LocalPlayer exclusions, many-bar scaling and open-sibling-gate dormant cases were not exercised. Closed gates do not have a realizable active owned state; changing their HP inputs correctly leaves them dormant. Lane troopers remain out of scope.
6. **Features outside renderer scope are not covered.** Menu preview/search, real storage/network, timers, pulse conditions, pickups, stamina/name-heavy presets, all style options and full OLD coverage by kind are not measured. The fixture supplies defaults from `sparseDefaults` (`style.test.js:21-22,212-214`); current source alone does not mean a fresh-install shipped-look benchmark.
7. **Latency is scheduling evidence only.** It observes mock color or pip changes, not engine-native HP text, damage arrival, actual clipping or displayed pixels. A 150 ms sampled maximum is not a real-world upper bound. The source's 0.15 s active/probe, 1.5 s idle and 1 s scan constants support the observed order of magnitude (`unit_status_v2_colors.js:4-10,4435-4462`), not live latency proof.
8. **No equivalence or visual-parity claim.** The original script's observed outputs were stable across repeats; no source was changed. No validator suites, build wrappers or live tests were run. A later v3 performance comparison must retain behavioral checks rather than achieve a budget by dropping required work.

## Reproduction appendix: supplemental stdin program

The exact program below was supplied as UTF-8 stdin to `node -` three times, serially, from the repository root with `HP_COLORS_REWRITE_SOURCE_ROOT` absent. It emits JSON with per-run operations, VM timing, observed state and latency. The helper loads test fixture declarations but replaces `node:test` registrations with no-ops. Its only renderer hook is an in-memory state reader; there are no disk mutations.

```javascript
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const root = process.cwd();
const filename = path.join(root, 'scripts/measure-hp-colors-rewrite-v2-refactor.js');
const text = fs.readFileSync(filename, 'utf8');
const seam = 'const scripts = scriptNames.map';
assert.equal(text.split(seam).length, 2);
const m = new Module(filename, module);
m.filename = filename;
m.paths = Module._nodeModulePaths(path.dirname(filename));
m._compile(text.slice(0, text.indexOf(seam)) + '\nmodule.exports = { makeOwnershipFixture, setEngineLines, countLayoutReads, measure };', filename);
const { makeOwnershipFixture, setEngineLines, countLayoutReads, measure } = m.exports;
let source = fs.readFileSync(path.join(root, 'hp_colors_rewrite_v2/panorama/scripts/unit_status_v2_colors.js'), 'utf8');
source = source.trimEnd();
assert.ok(source.endsWith('})();'));
// Observe state only; source on disk is never changed.
source = source.slice(0, -5) + '$.__baselineState = function () { return bars.map(function (b) { return {kind:b.kind,role:b.role,surface:b.surface,dormant:b.dormant}; }); };\n})();\n';
const kinds = [
  ['heroEnemy', ['player','enemy'], 'enemyEnabled'],
  ['heroAlly', ['player','friend'], 'allyEnabled'],
  ['npcEnemy', ['creature','enemy'], 'npcEnemyEnabled'],
  ['npcAlly', ['creature','friend'], 'npcAllyEnabled'],
  ['neutral', ['neutral_weak','team_neutral'], 'npcNeutralEnabled'],
  ['objectiveEnemy', ['boss_tier1','enemy'], 'buildingEnemyEnabled'],
  ['objectiveAlly', ['boss_tier1','friend'], 'buildingAllyEnabled'],
];
const modes = ['idleOn','activeOn','idleOff','activeOff','masterOff'];
function values(gate, mode) {
  return { enabled: mode !== 'masterOff', enemyEnabled: true, allyEnabled: true,
    npcEnemyEnabled:false, npcAllyEnabled:false, npcNeutralEnabled:false,
    buildingEnemyEnabled:false, buildingAllyEnabled:false,
    enemyMode:'gradient', allyMode:'gradient',
    enemyLow:'#FD4949',enemyMid:'#FF7B00',enemyHigh:'#00FF00',
    allyLow:'#FD4949',allyMid:'#FF7B00',allyHigh:'#00FF00',neutralColor:'#123456',
    readoutVisible:true,allyReadoutVisible:true,pipsVisible:true,barMask:'none',
    [gate]: mode.endsWith('On') || mode === 'masterOff' };
}
function fixture(classes, config) {
  return makeOwnershipFixture(classes, config, ({ primary, inner, fill }) => {
    setEngineLines(primary.FindChildTraverse('UnitHealthbarLines'), 2000, 2);
    inner.actuallayoutwidth = 69;
    fill.actuallayoutwidth = 34.5;
    fill.style.clip = 'rect( 0.0%, 50%, 100.0%, 0.0%)';
  }, null, source);
}
const rows = [];
for (const [name,classes,gate] of kinds) for (const mode of modes) {
  const fx = fixture(classes, values(gate,mode));
  countLayoutReads(fx.window, fx.harness.operationCounts);
  fx.harness.scheduler.runFor(5000,1000);
  let inputStyleWrites = 0;
  const result = measure(fx.harness, elapsed => {
    if (!mode.startsWith('active')) return;
    const percent = elapsed % 200 ? 80 : 50;
    fx.fill.actuallayoutwidth = 69 * percent / 100;
    fx.fill.style.clip = `rect( 0.0%, ${percent}%, 100.0%, 0.0%)`;
    inputStyleWrites++;
  }, () => ({color:fx.fill.style.washColor || '', state:fx.context.$.__baselineState(),
    jobs:fx.harness.scheduler.jobs.map(j=>[j.fn.name,Math.round(j.due-fx.harness.now)])}));
  result.operations.styleWrites -= inputStyleWrites;
  assert.ok(result.operations.styleWrites >= 0);
  rows.push({name,gate,mode,...result});
}
const latency = [];
for (const [name,classes,gate] of kinds) {
  if (name === 'neutral') {latency.push({name,reason:'fixed fill; no color change to observe'});continue;}
  const samples = [];
  for (let phase = 0; phase < 1500; phase += 50) {
    const fx = fixture(classes,values(gate,'idleOn'));
    fx.harness.scheduler.runFor(5000+phase,1000);
    const before = fx.fill.style.washColor;
    fx.fill.actuallayoutwidth = 20;
    fx.fill.style.clip = 'rect( 0.0%, 28.985507%, 100.0%, 0.0%)';
    let delay = null;
    for (let elapsed=10; elapsed<=3000; elapsed+=10) {
      fx.harness.scheduler.runFor(10,1000);
      if (fx.fill.style.washColor !== before) { delay=elapsed; break; }
    }
    assert.notEqual(delay,null);
    samples.push(delay);
  }
  latency.push({name,min:Math.min(...samples),mean:Math.round(samples.reduce((s,n)=>s+n,0)/samples.length),max:Math.max(...samples)});
}
console.log(JSON.stringify({rows,latency}));
```

Execution note: an initial context-mode invocation failed before running scripts because the tool expanded a string's escaped newline in generated code; retry used a newline character constructor. An initial supplemental suffix guard rejected CRLF before any scenario ran; it was replaced with `trimEnd()`. A preliminary matrix used invalid enum `barMask: 'v2'` (normalized to `none`); the final matrix above was rerun three times with the explicit valid value `none`. None of those attempts changed repository source, and preliminary timings are not mixed into the final matrix.
