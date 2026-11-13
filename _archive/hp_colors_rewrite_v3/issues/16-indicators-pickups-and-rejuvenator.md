# 16: Indicators: pickups and rejuvenator

**What to build:** Pickup and rejuvenator indicators on hero bars.

**Blocked by:** 15

**Status:** complete (native world part, VM-verified). Timer transport/freshness belongs to ticket 17; no build or live visual claim. **Live:** the user confirmed it works in game (2026-10-17, [ledger](../LIVE-VERIFIED.md)).

**Runs on:** gpt-6.1-sol (med). **Review:** code-review.

- [x] Matches SPEC story 15 (native world part)
- [x] VM E2E tests boot the real scripts and pass
- [x] Native pickups use bright inner colors, off-white progress, dark empty tracks and dark glyphs; size, spacing and offsets match v2
- [x] Rejuvenator offsets, size and tilt match v2; preview uses the same plan/apply
- [x] Flame adoption follows ultimate placement/size and restores parent/order/classes/scale exactly
- [x] Master-off, pickup-off, local/recycled gates, replacement, stop and reinclusion restore stock
- [x] Converter corpus, record upgrade, presets/scopes and restart covered
- [x] Worst-case active/idle/dormant operation ceilings pass

## Carried from Review13 (P2)

Ultimate offsets/size move only the badge. Adopt the native `KillStreakIndicator` flame behind `unit_info_bg` and mirror the ultimate placement and size, as v2 does (`hp_colors_rewrite_v2/design.md:165`). Use ledger-owned adoption that restores parent, order, classes and scale on release. Cover with VM E2E, including `has_killstreak`.

## Source boundary

- v2 world pickup appearance is fed by native `StatusEffects` → `StatusEffectContainer` panels with `gunpower_pickup`, `movement_pickup`, `casting_pickup`, `survival_pickup` (`test_topbar_pickups.js:692–750`). It is **not** snapshot-fed. The renderer styles the native icon, inner, border, empty-track overlay and glyphs on the existing 3s sampling cadence; engine visibility, glyph images and progress-ring radial clips remain untouched.
- v3's pickup look deliberately differs from v2: the inner disc takes the full pickup color, progress stays stock off-white (`#FFEFD7`), and `pickupBackgroundDarkness` controls only the empty track (`mix(#000000, pickupColor, 1 - darkness/100)`). Settings slots and defaults are unchanged. The preview uses the same native disc/ring artwork and renderer washes.
- The [pinned stock icon stylesheet](https://github.com/SteamTracking/GameTracking-Deadlock/blob/0c38f9d31c4905e0fe1a292afe91aa3d01044baf/game/citadel/pak01_dir/panorama/styles/unit_status_icons.css) gives `StatusEffectsBorder` the ring artwork at z-index -2; `StatusEffectCooldownOverlay` has no pickup artwork. The renderer therefore repurposes that blank overlay as a full ring track at -3, ledger-owning its wash, artwork, texture/background size, z-index and full-ring clip. Off switches restore every captured inline value or release back to stock CSS.
- Ticket 17 owns scan-gate/local-name freshness, native clip sampling/publication, snapshot identity/session checks and topbar countdowns. Its integration note also covers the ultimate-timer scale gate for badge/flame. No timer messages are parsed here.
- Rejuvenator tilt belongs here: [v2 design](../../hp_colors_rewrite_v2/design.md#native-kill-streak-and-rejuvenator) assigns all four controls to Indicators → Pickups. `rejuvScale` converts once to `rejuvSize = scale × 0.24` pixels (6–48px, 1.2px steps, shipped 24px) to satisfy SPEC's pixel-size contract. Other pickup/rejuvenator keys map unchanged; no v2-absent settings were added.

## Evidence (2026-10-14)

- Red-first VM regressions observed missing pickup writes, missing flame adoption/preview, unpromoted pending values, missing default flame scale and stale replacement anchor. Release coverage includes captured nonempty inline values, native `has_killstreak`/`has_rejuv`, `KSImage`, pre-existing owned classes, sibling-order fallback after next-sibling removal, replacement, local/ambiguous/NPC recycling, stop and reinclusion.
- Final `node --test tests/*.test.js`: **434/434 pass**; `node tools/generate.js --check`: **11 outputs current**. [Suite](../../.tmp/hpv3-ticket16-tests.txt), [generator](../../.tmp/hpv3-ticket16-generator.txt).
- Record **v6** appends slots **132–146** through the existing version-boundary promotion. [Twelve corpus cases](../tests/fixtures/v2-pickups-rejuvenator-migration.json) cover save schemas 1–5 and HPCR2/HPCRP1 extension versions 1–3. VM load/import, presets/scopes, v1–5 promotion, v6 authority, conditions and restart are covered; mapped pending entries are consumed at upgrade.
- v6 wire diffs flatten redundant pair brackets to `[slot,value,…]`; runtime diffs remain pairs and older paired input is accepted. This preserves the **4096** cap and conservative worst-number-text bound: **3766 characters, 330 margin**. Malformed compact records fail atomically. Oversize migration still retains all presets/settings, dropping largest pending maps first.
- Accepted compatibility limit: pre-v6 development builds protect v6 saves as newer/read-only, but reject v6 share codes. Use a matching reader for the compact wire; no older-save overwrite is allowed.
- Counted ops/bar/s: **183.6 active**, **165 idle**, **6 dormant** (released 11; split-stock released 12). Worst customized all-available arrows + four native pickups + pulse/overlay/HP-number: **189.6 idle**, **269.6 shield/barrier active**, below **200/300**. Stable measured windows have no parent/class/text writes or JSON parses. These are VM operation counts, not FPS.
- Shared VM adapter now models the real `MoveChildAfter` API. Authorized consumer regression run: **568 pass, 1 skip, 0 fail** across 19 test-file consumers; synthetic measure/read-profile scripts exit 0. [Adapter checks](../../.tmp/hpv3-ticket16-adapter-consumer-tests.txt).
- Audit15 corrections folded into this ticket: world pulse selectors outrank native critical fill animation; enemy/ally fractional pulse and color-band thresholds floor to integer percent like v2 (`unit_status_v2_colors.js:1183,1281–1301,3652`). Red VM evidence included `healthCritFlash2` overriding custom pulse and 25.5% selecting the wrong color.
- No builds, deployment, game launch, git mutation or live visual/FPS verification.

### Pickup look inversion (2026-10-14)

- Red-first VM E2E coverage checks all four world and preview pickup kinds, default and edited colors, track-only darkness changes, native progress clip preservation, cached pickup-kind reuse, and exact master/feature-off release including track artwork and clip. The preview's full dark ring sits below the clipped light progress and uses stock disc artwork so the inner disc does not cover the ring.
- `node --test tests/*.test.js`: **514/514 pass**. `node tools/generate.js --check`: **12 outputs current**. No builds, deployment, launches or live visual verification.

