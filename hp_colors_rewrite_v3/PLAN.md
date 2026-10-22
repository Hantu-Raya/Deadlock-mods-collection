# HP Colors v3: first-principles rewrite plan

Status: approved plan after two debate rounds (`DEBATE.md`) and four grilling rounds (`GRILL.md`). Feature implementation through ticket 24 is VM-verified, including hero routing and ability conditions; ticket 25 documents the contracts. Ticket 11's remaining native checks and ticket 26's parity/release gate are still open. Historical decisions remain in `tickets/`.

## 1. What the mod is for

Players want world healthbars (heroes, optionally NPCs and objectives) to look the way they choose, edited from the ESC menu, kept across restarts, and shareable as a code. Everything else is a means to that.

## 2. Why v2 is hard to work on (measured 2026-10-14)

| Fact | Source |
|---|---|
| Runtime is ~21k lines: menu JS 6,589, renderer 4,512, state 2,918, CSS 4,677, menu XML 1,387, pickups 1,374 | `wc -l hp_colors_rewrite_v2/panorama/*/*` |
| Tests are ~19k lines; three suites hold ~160 `assert.match`/`.includes` source-text checks | `scripts/validate-hp-colors-rewrite-v2-*` |
| 155 settings: 72 legacy codec keys plus 93 append-only extension slots, several of them tombstones | `hp_colors_v2_contract.js`, `design.md` |
| Four offset unit systems: CSS px at 100% bar, raw ×0.1, % of a frozen 76×18 box, 1:1 name px | `design.md:188` |
| Two default sets: shipped defaults, and the frozen `974128a` baseline that saves and codes diff against | `AGENTS.md:24` |
| Page ownership is declared three times in JS (`CATEGORY_DEFS`, `LEGACY_CATEGORY_DEFS`, `ADVANCED_KEYS`) and again in 545 hand-written XML ids | `hp_colors_v2_menu.js:61,351,632` |
| QOLLOCK ships a copied menu that must be refreshed by hand; a stale copy broke 2.2.0 | `AGENTS.md:159` |
| Agent docs total 868 lines, many over 768 characters, history mixed with contract | v2 docs |
| 100 commits to the folder since 2026-09-01 | `git log` |

Root cause: defaults changed without a record version, so a frozen baseline became permanent; each feature then added keys, renderer special cases and a paragraph of rules, and nothing was ever collapsed.

## 3. Engine facts v3 keeps

See [ENGINE.md](ENGINE.md) for build-scoped engine facts and their live, RE or VM evidence.

## 4. Design decisions

### D1. One schema table drives everything
`settings/schema.json` lists each setting once: key, slot, type, bounds and step, default, side-aware or shared, page, basic or advanced, unit, help text, search keywords. `tools/generate.js` generates defaults, validation contracts, codec slots, menu rows and layouts, search index and menu ids; it also derives the pinned stock sheet and hero catalog. Generated id and slot lists are committed so changes review as data; no documentation settings table is currently generated.

### D2. Side is data
Side-aware values live in `settings.side.enemy` and `settings.side.ally`; shared values live in `settings.shared`. Flat setting-cell keys belong to the codec slot table, not the authored settings shape.

### D3. One unit system
All offsets and sizes are CSS px at 100% bar scale, and the menu shows them in pixels everywhere (no percentages). v2's raw ×0.1 and percent offsets are converted once, in migration. Fresh-install defaults reproduce v2's current shipped look.

### D4. Versioned sparse records
Every save and code carries a record version. The body is a sparse diff against that version's defaults. Changing a default later means a new version plus an upgrade step ("version < N and key absent → old default"), never a second baseline. Full records exist only in memory. A save from a newer version loads the settings this version knows and is never overwritten; a newer code imports known settings with a warning. Presets stay capped at 128; export and save refuse oversize bundles with a message.
Why not full records: one full record is ~4,950 base64url chars, over the 4,096-char settings paste limit (`hud_escape_menu.xml:1313`), and 128 presets would need ~634 KB against a 192 KB store (`hp_colors_v2_storage.js:30-31`).
Record v12 adds sparse rule quadruples `[settingSlot, abilitySlot, minTier, value]` beside active/preset diffs; its no-slot history entry upgrades v11 records without changing defaults. Rules share the existing code/save caps and newer-record protection.

### D5. Migration at one boundary
`panorama/scripts/hp_colors_v3_from_v2.js` reads every v2 save schema (1–5) and code format (HPCR2, HPCRP1, hpv2 v1–3) and converts them to v3 records. Pasted v2 codes are converted on import; exports are v3 only (`HPC3`). On first launch the v2 save is converted silently. v3 never writes v2 formats or v2 keys, so rolling back to the v2 pak loses nothing. The converter is removed in v4.
Ability conditions use the LOCAL player's own signature tiers (v2 parity), never enemy upgrades; legacy unit-converted `v2conditions` are mapped once to native setting-cell rules and removed.

### D6. Renderer: facts → plan → apply
- `facts(panel)`: classes, lineage and measured layout. Impure and cached.
- `plan(facts, settings)`: pure; returns the owned styles and classes per part. Memoised on `(factsSignature, configRevision)`. Takes measured layout as input and tolerates one tick of settling after geometry writes.
- `apply(plan)` reconciles panel/property ownership through a ledger; the authoritative release rules, including alias exceptions, are in the [renderer restoration contract](SPEC.md#renderer-restoration-contract).
- The renderer module exports `plan` and `apply` and starts no loop when included; the world-bar context starts it explicitly, so the menu preview reuses the same code without a stray scheduler (preview prototype finding).

Scheduler, three states: **active** (paint every 0.15 s), **idle** (0.15 s fill-signature probe; full paint on change or every 1.5 s), **dormant** (1 s carrier-class check: could this panel now be a player or a kind with an open gate?). A full walk runs only when carriers die or lineage changes. This replaces v2's 5th-scan counters and sleeper rules. v2's measured cost of dormant objective scans (~20% of HPv2 time, `AGENTS.md:102`) is the number v3 must beat.
Ticket 07 audit amendment: ledger validity, ownership classification and lineage are checked at 1 s; released class-driven presentation follows CSS immediately, including stock-only ancestors. No 2.5 s retained-stock refresh remains. A zero-width bar retains its laid geometry and percent-clip fallback on the 0.15 s cadence. Pending native API failures retry without losing leases.
Ticket 18 audit amendment: ordinary dormant wakes probe relation facts on cached ancestry. Every fifth dormant check with an open unit gate instead probes that gate's kind facts, so a late kind class on a relation-free ancestor wakes within five seconds, without a subtree walk or extra calls when all gates are closed. Native boss/building damage classes also suppress the motion-frame wiggle immediately in CSS.

Deliberate v2 deviations for SPEC story 17: v3 rejects units carrying both `team1` and `team2`, and rejects `player` plus `midboss` as ambiguous. v2 accepts the former with no resolved team and gives player precedence in the latter; v3 leaves both uncustomized rather than guessing.



### D7. Menu redesigned, generated, variants composed later
The menu is redesigned in Deadlock's own ESC style. Your three problems with v2's menu: settings are hard to find, you can't see the result, and it looks off.

- **Structure**: by part of the bar (Bar, HP Text, Name, Indicators, Units, Presets), enemy and ally side by side, with Basic/Advanced folds. The by-part mock (`mocks/by-part.html`) is implemented in Panorama.
- **Search**: a search icon toggles a field; typing replaces the page with matching rows from every page, editable in place. Matches names, help text and schema keywords.
- **Preview**: one bar in the menu that follows the current page (hero, NPC, objective). Drawn by the real renderer code on a fake bar tree, so it matches the game. An HP slider sets health; a play button runs a damage/heal sequence. Stock settings previews stay untouched.
- **Generation**: static rows are generated into the checked-in source layouts before staging. Ordinary setting controls follow `HPColors<Key><Enemy|Ally><Role>` (shared controls omit the side); condition actions follow `HPColorsCondition<Key><Enemy|Ally|Shared>`. Dynamic preset and hero-picker rows stay runtime-created; both lists are paged eight rows at a time.
- **Variants**: v3 ships the normal pak02 first. QOLLOCK and ShowRank are variant lanes by the same injection (ShowRank build-only, live acceptance pending); Third Eye comes later. No copied menus.
  - **QOLLOCK** (ticket 22b, done) lives in its own lane, `hp_colors_rewrite_v3_qollock/`, like v2's `hp_colors_rewrite_v2_qollock/`. `build_hp_colors_rewrite_v3_qollock.ps1 -SkipDeploy [-Debug]` writes `hp_colors_rewrite_v3_qollock/.build/{release,debug}`. QOLLOCK's pak03 keeps `hud.xml`; this pak02 overrides only the Escape menu and the topbar.
  - Dependency direction: the lane consumes v3 (its sources, `tools/generate.js` `menuParts()`, the committed generated menu fragment and test seams); this v3 lane never depends on the QOLLOCK lane, and `build_hp_colors_rewrite_v3.ps1` stages nothing from it.
  - Inputs are pinned in `hp_colors_rewrite_v3_qollock/vendor/pin.json`: the pak03 and zip SHA-256, the two decompiled layouts, and hashes of the reviewed QOLLOCK entries. The lane build checks the pak03 (and the zip when present), re-decompiles it, and fails on any drift.
  - `hp_colors_rewrite_v3_qollock/tools/qollock.js` composes `panorama/layout/{hud_escape_menu,citadel_hud_top_bar}.xml` from the pinned layouts plus the same v3 includes, button, fragment and timer hooks as the normal menu. It fails if any pinned QOLLOCK node (ids, anonymous panels, classes, attributes, include order) is lost or reordered, any `generated/ids.json` id is missing, or an id repeats. `panorama/scripts/hp_colors_v3_qollock_bridge.js` keeps one settings window open at a time.
  - Release and recomposition requirements have one home: [AGENTS.md commands and release rule](AGENTS.md#commands).

### D8. Storage: same page, same protocol version, new capability
Versioned keys (`75e7620`) and compare-at-commit (`94cc689`, published 2026-10-15) extend the same hosted page without changing v2's protocol version. The [publication/live record](issues/audit-full-astra-2026-10-15.md#publication-and-live-check-main-2026-10-15) records served-byte and restart evidence; the [round-2 checklist](issues/audit-full-astra-2026-10-15.md#fixes-round-2-storagefix4) records rollback.

The normative [storage contract](SPEC.md#storage-contract) owns readiness, keys, CAS, reconciliation, retries and recovery. [ADR 0002](docs/adr/0002-conservative-cas-merge.md) explains conservative merge trade-offs; [ADR 0003](docs/adr/0003-fail-closed-without-cas.md) explains the pre-CAS boundary.

### D9. Transport renamed
Magic becomes `HP_COLORS_V3_CONFIG`, so a stale v2 topbar or Third Eye script never parses v3 payloads.

### D10. Undo
A bounded stack of immutable records (v2 uses 40) with gesture coalescing for sliders (`gesture_begin/update/end`). Picker sessions, hero-map/default edits and condition edits use the same stack instead of their own special cases. Authored settings, ability rules, routing metadata and active preset source restore together; automatic hero routing adds no history.

### D11. Timers stay in pak02 as an independent module
Pickup and ultimate timers keep their own schema section and register a message hook; the renderer never parses timer messages. A separate pak would add another slot conflict (02, 03, 89, 96–98 are already contested).
The audit split this module into world-only and HUD-only entry points; generated layouts select the role rather than parsing both branches in every context. The message and authority contract is unchanged; [AGENTS.md](AGENTS.md#runtime-and-test-rules) owns the source-boundary rule.

### D12. Tests prove behavior; performance has a ceiling
The authoritative behavioral-test seam, package-contract exception and counted-operation ceilings are in [AGENTS.md](AGENTS.md#runtime-and-test-rules). [Ticket 05](tickets/05-performance-baseline.md) records the measured v2 baseline; the [live acceptance rules](AGENTS.md#debug-and-live-acceptance) govern native and FPS claims.

Reviews: renderer, storage and menu tickets get a claude-fable-5-1 review plus `code-review`; small tickets get `code-review` alone.

### D13. Build-time guards for game drift
The generated stock stylesheet preserves the pinned SteamTracking body, adapts the two compiled imports, and deletes the three stock masks and nine outer-container backers like v2 (live 6782: an appended `opacity-mask: none` does not cancel a mask). Pin/hash and generated-currentness guards catch drift; VM tests compare the remaining renderer geometry/team-color constants with parsed vendored CSS. The hero catalog is generated from pinned game data, not hand-added.
Escape, unit-status overlay and topbar layouts are also vendored and hashed. Unique-anchor patches generate their compiled includes; local pin/currentness checks run before staging, and opt-in `-CheckUpstream` covers remote topbar drift too.

### D14. Docs
`AGENTS.md` (rules, ≤100 lines), `CONTEXT.md` (glossary), `ENGINE.md` (evidence), `docs/adr/` (decisions), and a `LIVE-VERIFIED.md` ledger so unverified features are never described as done. Release history stays in changelogs and git.

### D15. Debug build
`build_hp_colors_rewrite_v3.ps1 -Debug` adds `[HPV3]` console logs for boot and lifecycle (menu/renderer start, layout reloads, hero detection), save and store (page readiness, reads, writes, retries) and timing (scan/paint cost summaries every few seconds). The release pak has no logging. Live tests use the debug build.

## 5. Scope: full parity, built in stages

v3 keeps every player-facing v2 feature. Nothing is cut. Features arrive in stages: a basic core first, the rest added one at a time on top of the schema. v2 stays the shipped pak02 until v3 has all of them.

Order of arrival:

| Stage | Features |
|---|---|
| Core | Enemy/ally player bars: colors (fixed/gradient), feedback colors, size and position, native HP text, names, outline. Redesigned menu with core pages, search and preview; Undo, presets, durable save, code sharing. |
| Indicators | Lines and pips, level, ultimate, stamina, kill marker, pulse, pickups and rejuvenator, timers. |
| Units | NPC, neutral and objective gates. |
| Styling extras | BAR STYLE V2/OLD, damage shake, tilts, text outline widths, name/HP-text align, SHOW BOUNDS, OWN HUD health color. |
| Scopes | Hero preset routing and ability signature-tier conditions. |

Removed only because versioned records make them unnecessary (no player-visible change): Current/`own` layering, `pinFrozenFallback`, tombstone slots. HPCR2 and HPCRP1 codes are converted on import until v4. The legacy pak01 four-rail menu is dropped; it exists only for a deprecated preset pak. Third Eye joins QOLLOCK and ShowRank as a later variant; lite and diag are replaced by the debug build (D15).

A feature leaves v3 only if the dead-weight audit (ticket 01) shows it never works or nobody uses it, and you agree.

## 6. Phases

Each phase ends in a state that can be checked.

0. **Decisions**: resolve the remaining wayfinder tickets in `tickets/`.
1. **Migration corpus**: every v2 save schema and code format, with expected v3 records. Not a v2 style-write corpus: that would freeze the four unit systems and baseline quirks v3 drops. Visual parity is 6–8 in-game screenshots of representative presets.
2. **Schema, codec, `fromV2`**: corpus round-trips.
3. **Hosted page v2** published early (your go-ahead at push time), v2 paks still saving.
4. **Menu mocks**: done; by part with folds chosen.
5. **Core stage**, build-only pak02: player bars, the redesigned menu with core pages, search, preview, Undo, presets, durable save. Call-count ceiling green. **Live test 1** with the debug build, with your consent.
6. **Remaining stages** in order Indicators → Units → Styling extras → Scopes, one feature per ticket. Each adds its schema rows, renderer plan rules, menu page content and an E2E test.
7. **Release at parity**: build normal pak02 `-SkipDeploy`, archive v2's pak02 for rollback, **live test 2** with your consent, then replace pak02. v2 is frozen; its archives stay up.
8. **Variants**: QOLLOCK is done (ticket 22b, build-only, lane `hp_colors_rewrite_v3_qollock/`). ShowRank is now a variant lane too (ticket 34, build-only, live acceptance pending; lane `hp_colors_rewrite_v3_showrank/`). Third Eye follows later by fragment injection.
