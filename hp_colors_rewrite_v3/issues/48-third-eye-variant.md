# 48: Third Eye variant (plan)

**Request** (user, 2026-10-29): "make a support on G:\thirdeye_3b5cc.zip, plan what could be conflicted and ask suggestions with GPT-6 Astra and debate".

**Status:** plan only; nothing built. Deferred by the user until after 3.4.0 (2026-10-29); the decisions at the end are still open. Debate: GPT-6 Astra (`history://AstraThirdEye`).

## Input
- `G:/thirdeye_3b5cc.zip` (sha256 `9c113258...`) holds one `pak47_dir.vpk` (sha256 `00e64b7e...`, 214 entries), Third Eye **ALPHA-8** (`scripts/core/namespace.js` VERSION). Decompiled with Source2Viewer to `.scratch/thirdeye/dec/panorama/`.
- Prior art: v2 shipped a Third Eye lane for ALPHA-6 (`hp_colors_rewrite_v2_thirdeye/`, pin `thirdeye-source-pin.json`, `scripts/compose-hp-colors-rewrite-v2-thirdeye.js`, `scripts/patch-hp-colors-thirdeye-window.js`, `scripts/validate-hp-colors-rewrite-v2-thirdeye.test.js`; install notes `hp_colors_rewrite_v2/FEATURES.md` "Third Eye compatibility"). ALPHA-6 to ALPHA-8: `hud_escape_menu.xml` 7 diff lines (two manifests gone, `te_ListenButton` added), `ui/window.js` 127 diff lines, `topbar_ult_cooldown/feature.js` unchanged.
- v3 docs already plan Third Eye as a later variant built by injecting the generated menu, never a hand-copied one (`PLAN.md` Variants, `SPEC.md` story 52).

## What Third Eye replaces and how it boots
- Layouts: `hud_escape_menu`, `hud`, `base_hud`, `citadel_hud_top_bar_player`, `hud_health`, `hud_health_container`, `hud_minimap`, `citadel_hud_hero_shop`, `profile_card`, `element_gun`. Stock stylesheets become small wrappers over `styles/base/` copies plus feature sheets.
- Features and storage boot in the HUD from `base_hud.xml` (`core/app.js` boots only the HUD role); the Escape menu carries the settings button, `#ThirdEyeWindow` and the Escape-role scripts. Storage is its own HTTPS page (`eightbitnode.github.io/thirdeye-bridge`), created in the HUD.
- `ui/window.js` re-binds `oncancel` on the Escape menu and `onactivate` on `#EscapeBackground` with `SetPanelEvent` after a delayed boot (0.3 s, then 0.5 s retries); it exports `setOpen/toggle/isOpen`, but its own handlers call internal copies.

## Conflicts (ranked)
| # | Conflict | Evidence | Severity | Plan |
|---|---|---|---|---|
| 1 | Both ship `hud_escape_menu.xml`; lower pak number wins, so v3 pak02 hides Third Eye's settings button and window (its HUD features keep running on saved settings, unconfigurable). | `issues/34-showrank-variant.md` (lower-numbered paks win); Third Eye `layout/hud_escape_menu.xml` | Blocker | New lane `hp_colors_rewrite_v3_thirdeye/` composing pak02's Escape menu = pinned Third Eye menu + `menuParts()`, like QOLLOCK. |
| 2 | Third Eye's delayed `SetPanelEvent` rebinding replaces Escape/backdrop handlers, so Escape or a backdrop click would resume or close Third Eye while an HP COLORS dialog is open. | TE `ui/window.js` ~731-760 | High | Runtime bridge `hp_colors_v3_thirdeye_bridge.js` (QOLLOCK bridge pattern): intercept `SetPanelEvent` on the Escape menu and `#EscapeBackground` before Third Eye binds, wrap exported `setOpen/toggle`, one window open at a time, nested-cancel priority to HP. If interception fails, fall back to a pinned generated patch of `window.js` (v2 approach), never a timing poll. |
| 3 | v3 pickup timers reparent `UltimateStatus` into `HPColorsV3PickupIndicators`; Third Eye's ult cooldown looks it up as a direct child of `StatusRow`, so its cooldown can vanish when pickups show. | v3 `hp_colors_v3_timers_hud.js` 156-163; TE `features/topbar_ult_cooldown/feature.js` 85-118 | High | Ship a pinned, generated copy of that feature with one lookup fallback through the v3 wrapper (v2 compose did this). Not reparenting in v3 is a possible later change for all variants, out of scope here. |
| 4 | Own health bar fill: both write `washColor` on the local fill. Third Eye does so only for BudHUD + gradient bar color. v3's *Your health bar color: Off* still paints white, so it never hands the fill back. | v3 `hp_colors_v3_menu.js` ~502-506, 545-579; TE `healthbar_style/feature.js` 281-287, 381-385 | High | User decision (below). Needs a real release/reacquire path in v3 for the chosen owner. |
| 5 | *Your shield bar: Separate (old)* and the heal/damage counter offsets assume the stock health container; Third Eye's BudHUD/minimalist themes restyle it. v3's theme guard only knows QOLLOCK (`currentHealthOverHearts` + QOLLOCK classes). | v3 menu.js 760-775; TE theme classes `te_healthbar_style_*` | High | Separate predicate for Third Eye themes that suspends the old layout under them (as QOLLOCK themes do). |
| 6 | QOLLOCK pak03 + Third Eye + HP Colors: QOLLOCK owns `hud.xml` and its own `ui/window` script; a three-way merge is a different project. | `hp_colors_rewrite_v3_qollock/tools/qollock.js` 3-7 | Unsupported | Document as unsupported, as v2 did. |
| 7 | ShowRank variant + Third Eye: both add to top-bar cards; crowding unverified. | v3 ShowRank `tools/showrank.js`; TE `citadel_hud_top_bar_player.xml` | Medium | First release: Third Eye variant only, ShowRank combination unsupported until checked live. |
| 8 | Browser panels: v3 store + supporter strip in Escape, Third Eye storage in the HUD (ShowRank adds one more). No event/name collisions found. | v3 `hud_escape_menu.xml` (two CitadelHTMLPanels); TE `core/storage_bridge.js` | Medium, unmeasured | Keep non-focusable panels; measure later, no FPS claims. |

## Proposed lane (mirrors QOLLOCK)
- `hp_colors_rewrite_v3_thirdeye/`: `vendor/pin.json` (zip + pak sha256, decompiled Escape layout, window.js, ult cooldown feature, hashes of the reviewed entries, required/absent paths); `tools/thirdeye.js` composes `panorama/layout/hud_escape_menu.xml` (fails if any pinned Third Eye node, include or id is lost, or a v3 id is missing/duplicated) and the patched ult cooldown feature; `--check` for drift.
- `panorama/scripts/hp_colors_v3_thirdeye_bridge.js` (conflict 2) plus v3 seams for conflicts 4-5 that are inert without Third Eye, with VM checks that normal, QOLLOCK and ShowRank are unchanged.
- `build_hp_colors_rewrite_v3_thirdeye.ps1 -SkipDeploy [-Debug] [-ThirdEyePakPath <pak47>]`; install as pak02 with Third Eye's pak47 unchanged. One pak02 variant at a time.
- Updates: a new Third Eye pak is a candidate for review, not an automatic input. Re-pin deliberately; fast review when only unrelated assets changed.

## Live gates (with the user's go)
Restart and preset hydration; Escape, backdrop and Resume with each window and with nested HP dialogs; opening one window closes the other; Third Eye settings save and survive restart; BudHUD/minimalist themes with and without *Your health bar color* and *Separate (old)*; pickups appearing before and after Third Eye's ult cooldown; world bars and timers; reconnect.

## Decisions for the user
1. Scope: Third Eye variant only for the first release (no QOLLOCK or ShowRank combination)?
2. Health fill owner under Third Eye BudHUD gradient: Third Eye wins (HP releases its own-HUD bar color while that theme is on), or HP wins?
3. Under Third Eye health themes, automatically suspend *Separate (old)* shield layout and counter offsets (as with QOLLOCK themes)?
4. Ship with 3.4.0, or a later release?
