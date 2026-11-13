# HP Colors v3 spec

Status: approved implementation spec; all feature tickets through 24 are implemented and VM-verified. Ticket 25 supplies the documentation; remaining ticket 11 native checks and ticket 26 parity/release gates are not complete. Sources: `PLAN.md`, `GRILL.md`, `DEBATE.md`, closed decisions in `tickets/`, prototypes in `prototypes/`.

## Problem Statement

Players customise Deadlock's world healthbars with HP Colors v2. It works, but every change is slow and risky to make. v2's runtime is about 21,000 lines; each setting's page ownership is declared in four places; offsets use four unit systems; saves and codes diff against a frozen default set that can never change; the QOLLOCK build ships a hand-copied menu that broke a release; and the agent docs are 868 lines of accumulated rules. Players feel this as a menu where settings are hard to find, where they cannot see a change without closing ESC, and which looks out of place.

## Solution

v3 is a rewrite of the same mod with every player-facing v2 feature. One settings table describes each setting once, and the defaults, share-code format, saved-record format and menu are generated from it. The renderer works out what each bar should look like from what it reads off the panel and the settings, then writes only the differences, restoring stock values exactly on release. The ESC menu is redesigned in Deadlock's own style, organised by part of the bar with enemy and ally side by side, with Basic/Advanced folds, search, and a live preview bar drawn by the real renderer. v2 saves move over silently on first launch and old v2 codes still paste in. v3 replaces v2's pak02 once it reaches parity; v2 is then frozen with its archives kept for rollback.

## User Stories

Bars

1. As a player, I want enemy hero healthbars in my chosen colors, fixed or blended by health, so that I can read enemy health at a glance.
2. As a player, I want ally hero bars to have their own independent settings, so that I can tell allies from enemies.
3. As a player, I want healing, damage-delta, shield, Rat King barrier and deferred-damage colors per side, so that health changes are easy to see. Deferred damage (Shiv's Bloodletting, Nurse Harrow's Vapors) is the engine's `#unit_healthbar_deferred` layer, stock orange rgb(232, 127, 61) on every side; its color applies to hero bars while that side's custom bar colors are on and to objective bars while the side customizes them; neutral camps keep it stock, and the OLD box grid does not draw the layer (Discord request, 2026-11-01).
4. As a player, I want to set bar width, height and position in pixels, so that the bar sits where I want it.
5. As a player, I want the bar outline on by default with stock per-relation colors, and optional custom enemy/ally outline colors, thickness and opacity, so that bars stand out.
6. As a player, I want to hide enemy or ally healthbars while health keeps updating, so that I can declutter.
7. As a player, I want the game's own HP number moved next to the bar with my font, size, colors, offsets and outline, so that I can read exact health.
7a. As a player, I want the custom HP number to show health as a percent of max health too (`200 / 10%`), or the percent alone, per side, so that I can read how hurt a hero is whatever their max health ([ticket 51](issues/51-hp-percent.md)).
8. As a player, I want hero names with my own color, size, offset, outline and alignment, so that names fit my layout.
9. As a player, I want everything I turn off to look exactly like the base game, so that the mod never leaves half-styled bars.

Indicators

10. As a player, I want health lines and pips with custom color and opacity, so that I can count health chunks.
11. As a player, I want a kill marker at a health threshold on enemy bars, so that I know when an enemy is killable.
12. As a player, I want enemy level badges and ultimate icons placed relative to the bar, so that I can track power spikes.
13. As a player, I want enemy and ally stamina as arrows, circles or boxes with custom or team color and size, and a low-stamina color at or below a charge threshold, so that I can see dash availability ([ticket 35](issues/35-team-and-low-stamina-colors.md)).
14. As a player, I want low-HP pulse effects on bars and HP text, so that low enemies catch my eye.
15. As a player, I want pickup and rejuvenator indicators and topbar pickup/ultimate timers, so that I can track objectives and enemy ultimates. Pickups on health bars keep the game's status-effect size and gaps, so they stay one row with the other status effects (*Top bar pickup icon size* and *Top bar pickup spacing* size only the top-bar icons), and the pickup offsets move the whole status-effect row, which also follows the bar offset and never moves above its native place (2026-11-02).
15b. As a player, I want to enlarge single status effect icons above hero health bars, such as Haze's Fixation stacks, each with its own size slider, and see the edited icon in the preview beside the others, so that I can read the stacks that matter to me ([ticket 52](issues/52-status-effect-sizes.md)).
15a. As a player, I want a soul pill on each enemy hero's bar showing what my solo kill on them would pay me, matching the game's kill popup, so that I can pick high-value targets, and I want to move, size and tilt it ([ticket 50](issues/50-kill-bounty.md)).

Units

16. As a player, I want to opt neutral camps and objectives into custom colors, each gate off by default, so that I can style them only when I want. Customized unit bars keep the game's layout (never moved into the hero motion frame; no size, offset, BAR STYLE, outline, lines, shake or HP TEXT placement): objectives take the side's bar, damage, healing, shield, Rat King barrier and deferred-damage colors and its bar pulse; neutral camps take the neutral fill and enemy damage delta colors; their HP number shows by default (stock) or always, at the stock spot or at its own offset and tilt (record v17 slots 199-203). Other NPC bars are never customized (Customize NPC bars removed 2026-10-29; slots 152/153 and the unreleased 198 retired).
17. As a player, I want unknown or ambiguous units left stock, so that the mod never mislabels a unit.

Styling extras

18. As a player, I want bar styles V1, V2 and OLD (100-HP pip grid), so that I can choose the look I like.
19. As a player, I want damage shake with adjustable strength, and tilt for names, HP text and the rejuvenator, so that I can tune motion and angle.
20. As a player, I want SHOW BOUNDS to outline bar canvases while I edit, so that I can see placement limits.
20a. As a player, I want a COLORBLIND tab (after UNITS) with protanopia, deuteranopia and tritanopia switches that I can mix, so that I can see the whole screen as that color blindness does. Each switch sends the game's `r_colorblindsim_fullscreen_weight_<type>` (client, release-only flags; mode 1 and render method 3 are the game defaults) as `1`/`0` through `CitadelConCommand`. It is never a setting: the game state is kept on the top panel for this game (the game cannot be read back, so a switch shows what was last set here), and the choice is saved as the bundle's personal `colorblind` list (known type names only; never in shared codes or presets; kept by REPLACE ALL). The game resets these convars on every launch, so the first store load in a game sends the saved types again; a choice made in that game before the store loaded wins and is saved ([ticket 44](issues/44-colorblind-view.md)).
21. As a player, I want to color my own bottom-HUD health bar (off, team or custom), so that it matches my healthbars.
21a. As a player, I want the old separate shield bar back on my own HUD, with a white bar and HP number that leave the shield and a Rat King barrier out (the barrier gets the old spirit-shield bar in the Rat King colour), so that my health reads like it did before the September 2026 update ([ticket 38](issues/38-old-shield-bar.md)).

Menu

22. As a player, I want the HP Colors menu inside ESC with pages Bar, HP Text, Name, Indicators, Icons, Units and Presets, so that settings are grouped by what they change.
22a. As a player, I want a NEW tab like the game's, listing what an update added and marking the new settings, so that I can find them ([ticket 36](issues/36-new-tab-and-retired-low-empty.md)).
22b. As a player, I want a "!" beside HP COLORS in the Escape menu while a newer release exists, checked each time I open the Escape menu, so that I notice updates without opening the editor ([ticket 33](issues/33-update-notice.md), 2026-11-02).
23. As a player, I want enemy and ally settings side by side on each page, so that I can compare and match them.
24. As a player, I want Basic settings visible and Advanced ones folded, so that the common settings are easy to find.
25. As a player, I want a search button that shows matching settings from every page and lets me edit them in place, so that I find a setting without knowing its page.
26. As a player, I want search to match setting names, help text and keywords, so that "red" or "number" finds what I mean.
27. As a player, I want a preview bar in the menu that follows the page I am on (hero, neutral camp, objective), so that I see a change without closing ESC.
28. As a player, I want an HP slider and a damage/heal play button on the preview, so that I can check colors at any health and see feedback effects.
29. As a player, I want the menu to look like Deadlock's own ESC menu, so that it feels native.
30. As a player, I want offsets and sizes shown in pixels everywhere, so that numbers mean the same thing on every row.
31. As a player, I want Undo for my edits, with a slider drag counting as one step, so that I can back out of mistakes.
32. As a player, I want to reset a page with a confirmation, so that I can start a section over.
33. As a player, I want the native color picker with hex entry, so that I can pick exact colors.

Presets and scopes

34. As a player, I want to save, apply, rename, reorder, copy, delete, hide and restore up to 128 presets, so that I can keep several looks.
35. As a player, I want presets routed by hero (a hero-to-preset map plus a default), so that each hero can have its own look.
36. As a player, I want ability signature-tier conditions on settings, so that bars can change with my ability upgrades.
37. As a player, I want hero detection to run automatically, so that hero presets apply without manual switching.

Saving and sharing

38. As a player, I want my settings and presets saved across restarts on this PC, so that I set things up once.
39. As a v2 player, I want my v2 save converted silently on first v3 launch, so that my look carries over.
40. As a player, I want to paste old v2 codes (HPCR2, HPCRP1, hpv2) and have them converted, so that codes posted online still work until v4.
41. As a player, I want to copy and paste v3 settings and preset codes, so that I can share looks.
42. As a player, I want a save from a newer v3 version loaded as far as this version understands and never overwritten, so that downgrading does not destroy my settings.
43. As a player, I want a code from a newer v3 version imported as far as possible with a warning, so that I know some settings were skipped.
44. As a player, I want a clear message when a preset bundle is too big to export or save, so that nothing fails silently.
45. As a player, I want saving to show its status (saving, retrying, unavailable), so that I know whether my changes are kept.
46. As a player going back to v2, I want my v2 save untouched, so that rollback loses nothing.

Maintainer

47. As the maintainer, I want to add a setting through the settings table so that the menu, codes and saves follow automatically; prose documentation is maintained separately.
48. As the maintainer, I want a debug build with boot, save and timing logs, so that I can diagnose live problems; the release build stays silent.
49. As the maintainer, I want the build to fail when pinned game styles, hero data or overridden layouts drift, so that game updates never drift silently.
50. As the maintainer, I want a per-bar operations ceiling enforced by tests, so that performance cannot regress unnoticed.
51. As the maintainer, I want a short agent guide, a glossary, an engine-facts file and a live-verified ledger, so that docs stay readable and never claim untested behavior.
52. As the maintainer, I want QOLLOCK, ShowRank and Third Eye builds by injecting the same generated menu, so that no menu is ever copied by hand. ShowRank is a variant lane (ticket 34, build-only, live acceptance pending): `hp_colors_rewrite_v3_showrank/` (`hp_colors_rewrite_v3/tools/build.js --project showrank`) composes v3's generated Escape menu and topbar with ShowRank barebones' Escape hooks and party bridge and its topbar notification and team-average panels and style includes, and its `showrank.js --check` fails while they are stale. Third Eye remains later. QOLLOCK is done (ticket 22b) as its own lane, `hp_colors_rewrite_v3_qollock/` (`hp_colors_rewrite_v3/tools/build.js --project qollock`): it composes the pinned QOLLOCK Escape menu and topbar with the v3 pieces, its `qollock.js --check` fails while they are stale against a v3 menu change, and only one of QOL LOCK and HP COLORS is open at a time.

## Implementation Decisions

Modules (deep modules, small interfaces):

- **Settings table**: `settings/schema.json` declares each setting's key, stable slots, type, bounds and step, default, side, page, basic/advanced level, unit, help and keywords. Generation produces defaults, validation contracts, codec slots, menu rows/layouts, search index and element-id list, not a documentation settings table. Generated id and slot lists are committed so changes review as data.
- **Settings model**: side-aware values live in `settings.side.enemy` and `settings.side.ally`, shared values in `settings.shared`; flat setting-cell keys exist in the codec slot table. One default set, equal to v2's current shipped look.
- **Record codec**: every save and code carries a record version; the body is a sparse diff against that version's defaults. A default change means a new version plus an upgrade step, never a second baseline. Unknown keys from a newer version are ignored on load; slots of a removed setting are listed in `record.json` `retiredSlots`, skipped on load, never written and never reused ([ticket 36](issues/36-new-tab-and-retired-low-empty.md)); a newer save is never overwritten; a newer code imports with a warning. Presets capped at 128; export refuses bundles over the 32,768-character paste box and saving refuses past the 192,000-character store, both with messages. Share-code prefix `HPC3`.
  Wire format from record v6 uses flat `[slot,value,…]` sparse diffs (including preset diffs) to keep the 4096-character settings cap; paired v1–5 input remains accepted. Runtime diffs remain pairs, with the same validation, unknown-slot projection and future-save protection. Record v7 adds timer fields and v8 adds the five unit gates plus neutral fill color, v9 adds bar style and the OLD name lift, v10 adds damage shake, shake strength and the name/HP-text tilts, v11 adds the own-HUD health color mode and color, and v14 adds the Amber/Sapphire team colors, the HP-number team-high toggle, ally stamina and low stamina ([ticket 35](issues/35-team-and-low-stamina-colors.md)), v15 the separate own-HUD shield bar, v16 the name color source, v17 the neutral HP number (retiring slots 152, 153 and 198), v18 the objective HP number, v19 the kill bounty and v20 the deferred damage colors, through boundary promotion without changing this wire. Appending an enum option (HP color source Team colors in v14) needs a record-version bump but no `defaultChanges`: older readers skip the new value as newer data.
- **v2 converter**: reads v2 save schemas 1-5 and codes HPCR2, HPCRP1 and hpv2 v1-3, converting units once (raw x0.1 and percent offsets become pixels). Runs silently on the first v3 launch for the v2 save and on paste for codes. Never writes v2 formats or keys. Removed in v4.
- **Storage bridge**: connects the editor to the hosted page under the [storage contract](#storage-contract); publication history is in [PLAN D8](PLAN.md#d8-storage-same-page-same-protocol-version-new-capability).
- **Renderer**: `facts(panel)` reads classes, lineage and measured layout (impure, cached); `plan(facts, settings)` is pure and memoised on (facts signature, config revision); `apply(plan)` reconciles an ownership ledger under the [renderer restoration contract](#renderer-restoration-contract). The module exports `plan` and `apply` and starts no loop when included; the world-bar context starts its scheduler explicitly. Scheduler states (VM-proven):

  ```text
  active   paint every 0.15 s
  idle     0.15 s fill-signature probe; full paint on change or every 1.5 s
  dormant  1 s cheap player/open-gate wake and existing-carrier role check
           ledger validity and ownership lineage checked at the same 1 s cadence
  full walk only when carriers die or lineage changes
  ```
  Audit correction: released visibility, fades, animation, critical scaling and empty-health opacity follow the native stylesheet immediately, without polling stock fallbacks. Ownership classification can still take up to the next 1 s check; failed native setters retain pending leases until retry. Zero-width bars keep the last laid geometry and percent-clip health fallback without dropping ownership or slowing the 0.15 s cadence.

- **Menu**: grouped by part of the bar (Bar, HP Text, Name, Indicators, Icons, Units, Presets; [ticket 37](issues/37-side-nav-restructure.md) sets the card order), after a first NEW tab; the menu opens on Bar. NEW lists `settings/news.json` items, marks their target rows and tabs with the game's `notification_alert` icon, opens and flashes a target on click (the scroll repeats over the first frames, because a page shown before keeps stale row heights while collapsed), and drops an item after 30 days or when dismissed (X, CLEAR ALL). Dismissals are saved in the bundle's `newsDismissed` list: not a setting, not in Undo, not in shared codes, kept by REPLACE ALL. Enemy and ally columns sit side by side with shared settings below, with Basic/Advanced folds, a search toggle in the header (filtered, editable rows) and a preview pane. Static rows are generated into source layouts before staging; the page root has no id (the compiler rejects one).
  - **Presets page** ([ticket 27 round 3](issues/27-stock-settings-theme.md#implementation--round-3-2026-10-16)):
    - The library is a wrapping grid of runtime-created preset tiles in a bounded scroll, with no pagination. The baked default tile comes first.
    - Clicking a tile *selects* it for actions; it never applies. Selected, applied (source) and hero-default markers stay distinct. Selection follows the preset id across rename, reorder and hydration. An empty visible library has an explicit no-selection state with the toolbar disabled.
    - One row of stock round glyph buttons acts on the selected preset: APPLY (the only green CTA), RENAME, UP, DOWN, COPY (export code), DELETE or HIDE/RESTORE for the baked default, HEROES and DEFAULT.
  - **Hero picker:** a five-column grid of stock portrait circles (VData `m_strIconImageSmall`, with `no_hero` as the fallback) in a fixed-height, layered scroll area.
    - A gear tile (hero default) comes first.
    - Heroes assigned to this preset are green and named. A hero assigned elsewhere shows a corner dot, and clicking it transfers the assignment.
    - Search dims non-matches and shows a match count.
  - **Dialogs:** all dialogs use the stock `PopupHeroSettingsNotice` chrome with native `InputButtonBorderRadius`/`InputButton` actions, and show no ESC hint row.
  - **IDs:** ordinary setting controls follow `HPColors<Key><Enemy|Ally><Role>` (shared controls omit the side); condition actions follow `HPColorsCondition<Key><Enemy|Ally|Shared>`. Generated ids include v2 collisions, so v2 and v3 menus must never share a layout.
- **Hero routing** (stories 35, 37): one local-player TopBar watcher settles or clears identity after two samples, polls at 1 s in play/transition and 5 s in lobby/hideout/postgame, and keeps running with the menu closed. Bundle metadata holds `heroPresets`, `heroDefault` and the active `sourcePresetId`/`sourceWasMapped`; none travels to world bars or settings-only codes. A route fires once per hero, lifecycle phase or route target, so a preset applied by hand (Default included) stays until one of those changes (a phase round trip routes the same hero again; a script reload inherits the route key); SAVE NEW makes the new preset the applied one; same-source routes preserve edits; other routes apply without Undo and wait for slider/picker/condition sessions to finish. The route decision is session state: after a restart the first settled hero routes again. Every committed edit is also written into the applied custom preset (`sourcePresetId`), so applying it again or routing back to it restores the edited values; the baked Default never changes (user, 2026-11-02). Hideout uses the default, pregame and unknown heroes preserve the active settings. Watch generations and lifecycle epochs reject old callbacks.
- **Ability conditions** (story 36): one `{slot: 1–4, minTier: 1–3, value}` rule per generated setting cell, eligible on every live setting. Saves, presets, codes, Undo and editable menu values retain authored settings plus rules. Publication and preview overlay matched values then normalize; unchanged effective settings do not bump revisions. The menu's hero watcher samples only referenced LOCAL `hud_signature` → `abilities` → direct `slot_signature_1`…`4` panels, taking the highest `Tier3`…`Tier0` class or −1. Spectator mode rejects tiers; hero/epoch changes and newly referenced slots clear stale tiers. Each row/search result opens an isolated typed draft with cycling slot/tier buttons and Apply/Remove/Cancel; colour drafts reuse the native picker. Preset application replaces rules, and page reset removes its rules in one Undo entry. Debug tier/match logs occur only on change; release has no logging.
- **Preview**: a fake bar tree mirroring the real unit-status lineage, with `HPColorsPreview`-prefixed ids, painted by the renderer's `plan` and `apply`. It follows every world-bar style decision, including BAR STYLE (V2 masks and OLD boxes), shake, tilts and SHOW BOUNDS (tickets 19-22). Kind follows the page; HP slider; play runs a 9-step damage/heal sequence at 0.45 s per step. Close, page switch, side switch and slider input cancel both the independently guarded play schedule and layout-settle schedule.
- **Own HUD health colour** (story 21): the menu, not the renderer, owns three inline properties on the local bottom-HUD left health fill. As in v2, OFF (the default) paints a plain white bar while HP Colors is on; TEAM and CUSTOM add their colour to that white base. Turning HP Colors off (or a load still pending, or an unknown team in TEAM) restores the game look exactly (ticket 22).
- **Transport**: config message magic `HP_COLORS_V3_CONFIG`, routed by its publisher's canonical envelope header. Unit-status contexts request config through the sibling relay; the menu answers. While SHOW BOUNDS is on, the menu adds `showBounds: true` beside the settings (session-only view state kept on the top panel like v2; never in the record, codes, presets or Undo). Timers stay in pak02 as an independent module with a Timers settings section and registered opaque-message/state hooks; the renderer never parses timer messages. The timer hook owns `HPV3_PICKUP_SNAPSHOT`, `HPV3_PICKUP_SCAN_GATE`, `HPV3_ULTIMATE_SNAPSHOT` and `HPV3_BOUNTY_SNAPSHOT` (ticket 50: topbar-computed solo-kill bounty per card, `[player, souls, hero?]`, on change plus a 5 s heartbeat, 12 s expiry) and supplies only derived pickup-gate/ultimate-progress/bounty facts to the renderer's ledger.
- **Undo**: bounded stack of immutable records (40), slider gestures coalesced; picker sessions, hero-map/default edits and condition edits use the same stack. Authored settings, rules, routing map and active source restore together; automatic routing adds no history.
- **Game data**: stock unit-status stylesheet, hero catalog, Escape menu, unit-status overlay and topbar layouts come from pinned SteamTracking files. Hash and unique-anchor patches fail closed; generated-currentness is checked before building. `-CheckUpstream` also fails on remote drift, including the topbar.
- **Build**: one wrapper for the normal pak02 with `-SkipDeploy` and `-Debug` (`[HPV3]` logs for boot and lifecycle, save and store, and timing). Release build has no logging.
- **Dependent rows**: a row's `requires` lists what must hold for it to change anything; otherwise the menu greys it, disables its controls and its tooltip says what to turn on. A row is greyed only when it changes no customized bar (`tests/row-requirements-effect.test.js` checks every greyed row against the renderer plan for hero, objective and neutral camp bars). Rows that act only through Player bar colors (feedback colors, Show healthbar, the bar pulse color and Hide bar during pulse) grey with them per side unless objective bars, neutral camps (damage delta) or the HP number in Bar colors mode still use them; the health line rows grey under BAR STYLE OLD (user, 2026-11-02).
- **Version**: `settings/record.json` `release` is the only release source (currently 3.7.0, in development; 3.6.0 is the latest release). It feeds the preview label and the contract's `release`; the contract's `version` (`3.0.0`) is the wire version and does not change with releases. Bump the patch for a fixes-only release and the minor for any user-visible feature. Release history is in the [MAP changelog](MAP.md#changelog).
- **Dropped**: Current/`own` layering, the frozen-baseline fallback, tombstone slots, legacy pak01 four-rail menu, HPCR2 export, Third Eye/lite/diag variants for now.

### Renderer restoration contract

- Restore captured nonempty inline values exactly. With no captured inline value, clear absent styles with `null`; clear shorthand-backed margin/font/animation longhands and `borderColor` through their base shorthand.
- Explicit stock-alignment exceptions when no inline value was captured: restore the hero name's `horizontalAlign` and `textAlign` to `center`, and the HP readout row's `horizontalAlign` to `right`. Do not replace these explicit restoration values with `null`. The topbar cooldown label independently restores captured alignment, or `left` when absent.
- Release owned root classes so dynamic native presentation returns to CSS rather than a polled stock snapshot. [ENGINE.md](ENGINE.md#css-and-compilation) records the native failures behind these rules.

### Storage contract

- Accept readiness only from `https://hantu-raya.github.io/hpv2-store/`, protocol version 1 and both `vkeys` and `cas`. Pre-CAS pages remain UNAVAILABLE/session-only. Read before writing; preserve newer saves read-only. v3 writes only `hantu.hpcolors.v3/state` and `.prev`; v2 is read only through the converter.
- The shared page accepts keys matching `^hantu\.hpcolors\.v\d+/state(\.prev)?$`. v2's keyless Forget retains deletion of both v2 keys, and a keyed delete of a v2 key removes only that key. **Guard** ([save-security audit 2026-11-02](issues/audit-save-security-2026-11-02.md)): any page opened in Steam's browser or overlay shares this storage and can navigate the page with its own request, so every hpcolors key except v2's refuses deletes (`readonly`), direct `.prev` writes (`readonly_backup`) and writes without `m` (`needs_cas`); a failed request clears only its own logical read or write. The v3 bridge never deletes, never writes `.prev` and always sends `m`, so it is unaffected; v2 keys keep the old behaviour because v2 clients cannot change.
- CAS writes carry `m`, the checksum of the last-observed entire raw current record, or `none`; the page refuses a changed expectation at commit. v2 writes without `m` retain their unconditional behavior. Checksum/native-page guarantee limits and the rejected heuristic merge are explained in [ADR 0002](docs/adr/0002-conservative-cas-merge.md).
- Update check ([ticket 33](issues/33-update-notice.md)): the editor asks 0.5 s after it opens (dialog once per session per version), and since 2026-11-02 the menu also asks each time the Escape menu opens (`#Hud` class `ShowEscapeMenu`, read on each identity-watch sample: 1 s in play, 5 s in lobby/hideout/postgame) to show the `HPC3UpdateAvailable` "!" badge on `#HPColorsMenuButton`; nothing is asked while the Escape menu stays closed. Only when the ready reply lists `latest`, the bridge may queue `lv` (`a: "hpv3"`) like any request. The page answers at once from its own same-origin `latest.json` copy and never writes the title unprompted. A missing capability, a failed fetch or a malformed version is silent and never affects saving. The reply's `d` may list per-build download pages; the menu opens one with `ExternalBrowserGoToURL` only from DOWNLOAD, only for its own build (`qollock` when the composed menu has `QOLStorageBridge`, `showrank` when it has `ShowRankBarebonesPartyBridge`, else `normal`), and only for an `https://gamebanana.com/` link it has validated itself. A build with no link gets the notice without DOWNLOAD; it never falls back to another build's file.
- After load, handoff or bridge renewal, reconcile only outstanding edits against the newly observed bundle. Hydration and acknowledged writes advance the baseline; acknowledgements clear only included edit tokens, retaining edits made in flight. Scalar settings use touched-slot precedence, not replacement of the whole stale object. A pre-hydration settings import explicitly supplies every slot, preserves presets and reports “settings import replaced all saved settings.”
- Preset identities, top-level metadata keys (including rules) and relative preset order have independent edit tokens. Merge their local changes only if the touched entity is unchanged remotely from the acknowledged baseline; membership changes alone are not reorders. Any overlap refuses the entire write, preserves remote bytes and the complete exportable local draft, names the overlapping ids/keys/order in CONFLICT, and stops automatic retry. Independent remote edits survive; preset/record capacity overflow also refuses the merge without writing.
- Only a complete raw-record match to an own possibly committed final-chunk write can acknowledge it; matching intermediate fields are not commit provenance. Preserve last-observed identity, tokened pending edits, conflict provenance, unacknowledged final-chunk writes and confirmed-reset expectations through bridge retirement/renewal. Readable repaired data cancels a pending reset; unchanged corrupt bytes retain its confirmation.
- For a pending UNAVAILABLE draft, renew the bridge after 60 seconds; new edits use the existing 8-second cooldown. Load/reconcile before saving. Renewal does not guarantee CEF cache eviction, and publication does not guarantee immediate recovery. A draft is not durable until acknowledged; export it before closing the session.
- Pasted bundle codes (IMPORT and REPLACE ALL) keep only the fields the build reads: preset `id`, `name` (1-48 characters, trimmed), `settings`, `rules`, a boolean `hidden` and the v2-migration fields; bundle `heroPresets`, `heroDefault`, `sourcePresetId`, `sourceWasMapped`, the baked default's hidden state and name override, `nextUserPresetNumber` and the v2-migration fields. The player's own save is read as-is. The update DOWNLOAD opens only `https://gamebanana.com/mods/download/603113` (optionally `#FileInfo_<n>`).
- Full recovery is **Bundle COPY → preserve/paste the code into the Bundle box → confirmed REPLACE ALL**. Confirmation names active settings/rules and metadata restoration and replacement of the saved preset library, including presets another window added. Cancel changes nothing; normal CAS and conservative overlap checks still apply. Ordinary Bundle IMPORT appends fresh-id preset copies only, reports active settings/metadata unchanged, and refuses empty preset bundles with recovery guidance.

## Testing Decisions

- The normative VM seam, source-text/package-contract exception and operation ceilings are in [AGENTS.md](AGENTS.md#runtime-and-test-rules). The v2 converter is exercised through that same seam by pasting or loading corpus records and observing published configuration.
- Migration corpus: every v2 save schema and code format with the expected v3 settings. Not a corpus of v2 style writes.
- Performance evidence: v2 measured about 360–388 active, 257–280 idle and 41–46 dormant counted operations per bar per second. The [agent test policy](AGENTS.md#runtime-and-test-rules) owns the failing ceilings. Ticket 07's representative fixtures use ancestry depth 2 and a split-stock-contributor depth-3 case, not every chain up to the 12-level discovery guard; deeper chains remain supported but unmeasured.

- Package seam: the build asserts the exact compiled asset set in the VPK and that no raw sources are packed.
- Native acceptance follows the [live rules](AGENTS.md#debug-and-live-acceptance), [ticket 11](issues/11-live-test-1-core.md) and [ticket 26](issues/26-release-at-parity.md).
- Prior art: the v2 storage end-to-end suite (disk-backed fake page across simulated restarts), the v3 store-page test, the renderer and preview prototype suites, the v2 measurement harness.

## Out of Scope

- Legacy full HP Colors, the minimal lane, Rewrite V1 and the web preset builders.
- Lane trooper colors (engine-drawn).
- A Third Eye variant (a later compatibility effort). The normal pak02 topbar conflicts with ShowRank pak89; the normal package ships no combined topbar. The QOLLOCK variant was pulled forward as ticket 22b and the ShowRank variant lane as ticket 34 (build-only, live acceptance pending). QOLLOCK and ShowRank together stay unsupported.
- Any in-game FPS claim without a separate PresentMon A/B approved by the user.

## Further Notes

- The store page is already live; v2 players keep saving because it still reports protocol version 1 and keyless deletes still remove both v2 keys.
- If ShowRank pak89 wins the topbar override, v3 topbar timers cannot boot; the ShowRank variant lane (ticket 34) avoids this by shipping a v3 pak02 that already carries ShowRank's topbar pieces. World pickup customization/publication and ultimate progress stay closed until a first valid v3 scan gate arrives; healthbar rendering continues.
- Timers match a world bar to its topbar card by the bar's title. In the normal and ShowRank builds that title must be the card's player name. QOLLOCK's composed topbar root also carries `HPColorsV3TimersHeroNames`, so cards there also answer to their stock `HeroName` label (Street Brawl, `citadel_unit_status_hero_name_mode` 1; [ticket 39](issues/39-street-brawl-ultimate-progress.md)). Title mode 2 (none) leaves nothing to match. After a known boot, stale-gate fallback still matches v2. See [ticket 26](issues/26-release-at-parity.md) before any parity release.
- *Your shield bar: Separate (old)* (21a) treats a HUD as QOLLOCK's when it has `#currentHealthOverHearts`. The check looks at the HUD, not the build, so it behaves the same in every build. On QOLLOCK's default healthbar it shows the full old look. Under QOLLOCK's Minimalist, FG, Klutz and Budhud healthbars it skips the old layout and colour so the theme keeps its own, and still corrects the fill, number and ticks. Under QOLLOCK's Minecraft healthbar, which draws the bars at opacity 0.0001, it stays off ([ticket 40](issues/40-qollock-separate-shield.md)).
- The Source 2 compiler accepts unknown CSS properties and XML elements, so a clean compile proves syntax only; styling needs the in-game look.
- Reviews: renderer, storage and menu tickets get a claude-fable-5-1 review plus `code-review`; small tickets get `code-review` alone. Engineering tickets run on gpt-6.1-sol (med); design tickets on Claude Opus 5.5 (med) with `design-taste-frontend`.
