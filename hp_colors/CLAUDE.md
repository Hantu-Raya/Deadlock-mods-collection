# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. BUILD COMMAND

Run:

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

`build_hp_colors.ps1` performs four stages:

1. Minify — copies `hp_colors/` → `hp_colors_terser/` and runs `npx terser` on every JS file (`passes=2`, `keep_fnames=true`, `keep_classnames=true`).
2. Compile — runs `sr2compiler\New folder.exe` against `hp_colors_terser/`, produces `hp_colors_terser_compiled/`, then copies to `hp_colors_compiled/`. Sentinel file: `hp_colors_compiled\panorama\scripts\healthbar_logic.vjs_c`.
3. Pack — runs `passive_items_mod\compiler\vpkeditcli.exe` against `hp_colors_compiled/`, writes `pak96_dir.vpk` at the repo root.
4. Deploy — copies `pak96_dir.vpk` to `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak96_dir.vpk`.

`hp_colors_terser/` and `hp_colors_compiled/` are intermediate build artifacts — do not edit them directly.

## 2. RUNTIME ARCHITECTURE

Script to XML context mapping:

| Script | XML context | What it does |
|---|---|---|
| `anita_ui_core.js` | `panorama/layout/base_hud.xml` | Creates the Anita-UI window, overlay button, event listener, registration handling, persistence helpers, and value replay. |
| `hp_registrar.js` | `panorama/layout/base_hud.xml` | Builds the HP Colors config schema, registers it, listens for handshake, and requests bootstrap. |
| `anita_persist_loader.js` | `panorama/layout/hud.xml` | Captures the config, reads persisted payloads, mirrors session state, and replays stored values. |
| `healthbar_logic.js` | `panorama/layout/unit_status_overlay.xml` | Consumes `ANITA_UPDATE`, bootstraps overlay state, scans panel ancestry, and applies live healthbar/counter styling. |

Event flow:

1. `hp_registrar.js` starts, builds `SCHEMA`, and registers `HP Colors`.
2. Registration enters the system as `ANITA_REGISTER`.
   - Direct path: `root.AnitaUI.Register(config)` in `hp_registrar.js`.
   - Event path: `$.DispatchEvent("ClientUI_FireOutput", { magic_word: "ANITA_REGISTER", config })`.
3. `anita_ui_core.js` listens for `ANITA_REGISTER`, calls `registerMod(config)`, hydrates current values, adds the Anita tab, then dispatches `ANITA_HANDSHAKE` for that mod.
4. `hp_registrar.js` listens for `ANITA_HANDSHAKE` with `mod_title === "HP Colors"`, marks registration complete, and dispatches `ANITA_REQUEST_BOOTSTRAP`.
5. `healthbar_logic.js` also dispatches `ANITA_REQUEST_BOOTSTRAP` during overlay startup, enemy detection, and retry loops when bootstrap has not been satisfied.
6. `anita_ui_core.js` handles `ANITA_REQUEST_BOOTSTRAP` by replaying current registered values through `emitCurrentValues(..., { update_source: "bridge_bootstrap" })`.
7. `anita_persist_loader.js` also handles `ANITA_REQUEST_BOOTSTRAP`; it reads stored payloads and replays each setting as `ANITA_UPDATE` with `update_source: "bridge_bootstrap"`.
8. `healthbar_logic.js` listens for `ANITA_UPDATE`, coerces the value into `cfg`, refreshes derived state, invalidates cached visual state when needed, and treats `bridge_bootstrap`, `ui_resync`, `ui_reset`, `ui_code_apply`, and `core_auto_resync` as bootstrap-satisfying sync sources.

`ANITA_UPDATE` is the runtime settings-application event used by both the overlay and the Anita core.

## 3. DUAL REGISTRATION PATH

`hp_registrar.js` has two registration paths:

1. Direct registration
   - `tryDirectRegister(config)` walks to the root panel.
   - It requires `root.AnitaUI`, `root.AnitaUI.IsReady()` when present, and `root.AnitaUI.Register`.
   - If available, it calls `root.AnitaUI.Register(config)`.
2. Event-dispatch fallback
   - `dispatchRegister(config)` sends `ANITA_REGISTER` over `ClientUI_FireOutput`.

Behavior details:

- `register()` always tries direct registration first.
- If direct registration fails, it falls back to `ANITA_REGISTER`.
- If direct registration succeeds, it still dispatches `ANITA_REGISTER` afterward as a bridge announce.
- Retry loop: `REGISTER_RETRY_DELAY_SEC = 0.25`, `REGISTER_MAX_ATTEMPTS = 24`.
- `ANITA_ALIVE` from `anita_ui_core.js` also triggers `register()`.

## 4. CONFIG KEYS TABLE

These are the keys in `DEFAULTS` inside `healthbar_logic.js`:

| Key | Type | Default |
|---|---|---|
| `hp_enabled` | bool | `true` |
| `hp_mode` | int | `1` |
| `hp_low_threshold` | int | `25` |
| `hp_high_threshold` | int | `65` |
| `hp_bg_visible` | bool | `true` |
| `hp_team_colors` | bool | `false` |
| `hp_color_low` | string | `"#E16161"` |
| `hp_color_mid` | string | `"#FF7B00"` |
| `hp_color_high` | string | `"#00FF00"` |
| `hp_counter_size` | int | `120` |
| `hp_counter_position` | string | `"20,196"` |
| `hp_text_color_mode` | int | `0` |
| `hp_text_color_low` | string | `"#E16161"` |
| `hp_text_color_mid` | string | `"#FF7B00"` |
| `hp_text_color_high` | string | `"#FFFFFF"` |
| `hp_pulse_enabled` | bool | `true` |
| `hp_pulse_threshold` | int | `25` |
| `hp_pulse_bpm` | int | `75` |
| `hp_pulse_intensity` | int | `1` |
| `hp_pulse_hide_bar` | bool | `false` |
| `hp_pulse_text_enabled` | bool | `true` |
| `hp_pulse_text_scale` | int | `120` |
| `hp_pulse_text_position` | string | `"20,196"` |
| `hp_skip_buildings` | bool | `false` |
| `hp_friend_enabled` | bool | `false` |
| `hp_friend_color_low` | string | `"#E16161"` |
| `hp_friend_color_mid` | string | `"#FF7B00"` |
| `hp_friend_color_high` | string | `"#00FF00"` |
| `hp_friend_pulse_enabled` | bool | `false` |
| `hp_friend_pulse_threshold` | int | `25` |
| `hp_friend_pulse_bpm` | int | `75` |
| `hp_friend_pulse_intensity` | int | `1` |
| `hp_friend_pulse_color_enabled` | bool | `false` |
| `hp_friend_pulse_color` | string | `"#FF2222"` |

## 5. PERSISTENCE STACK

Primary storage:

- The namespace is `hp_colors`.
- The storage key is `anita_v1_hp_colors`.
- `anita_ui_core.js`, `anita_persist_loader.js`, and `healthbar_logic.js` all know that key.
- `$.persistentStorage` is deprecated/non-functional in Source 2 Panorama — convar-based persistence is the primary store.

Convar fallback:

- The convar key is `deadlock_hero_debuts_seen`.
- The token prefix is `ANITA-v1-`.
- HP Colors uses `[ANITA-v1-hp_colors]:<base64url>`.
- `anita_ui_core.js` can write via `GameInterfaceAPI.ConsoleCommand`, `GameInterfaceAPI.SetSettingString`, or command events.
- `anita_persist_loader.js` and `healthbar_logic.js` can read the convar token during bootstrap paths.

Session mirror:

- The same encoded payload is mirrored to root and `Hud` attributes under `anita_v1_hp_colors`.
- `anita_ui_core.js` writes that mirror with `writeSessionMirror`.
- `anita_persist_loader.js` writes the same mirror.
- `healthbar_logic.js` reads that mirror first in `readSessionMirrorPayload()`.

Manual Copy/Import:

- Anita footer controls are only created for configs with `storageNamespace`.
- `Copy` copies the current save token to the clipboard.
- `Import` reveals a text entry, extracts a token, decodes it, applies parsed values, persists them, rerenders the UI, and emits updates with `update_source: "ui_code_apply"`.
- `Reset` reapplies defaults, persists them, rerenders, and emits updates with `update_source: "ui_reset"`.

Write timing seen in source:

- `anita_ui_core.js` schedules `persistConfig(config, false)` after `2.0` seconds in `handleUpdateEvent`.
- `anita_persist_loader.js` has `PERSIST_DEBOUNCE_SEC = 0.35` for its bridge-side `schedulePersist`.

## 6. COMPACT ALIAS MAP

Payloads are stored as `{ v: <storageVersion>, c: 1, values: { <alias>: <value> } }` with only non-default keys included. All three alias maps (`anita_ui_core.js`, `anita_persist_loader.js`, `healthbar_logic.js`) must stay identical.

| Alias | Key |
|---|---|
| `e` | `hp_enabled` |
| `m` | `hp_mode` |
| `l` | `hp_low_threshold` |
| `h` | `hp_high_threshold` |
| `b` | `hp_bg_visible` |
| `t` | `hp_team_colors` |
| `cl` | `hp_color_low` |
| `cm` | `hp_color_mid` |
| `ch` | `hp_color_high` |
| `s` | `hp_counter_size` |
| `p` | `hp_counter_position` |
| `tm` | `hp_text_color_mode` |
| `tl` | `hp_text_color_low` |
| `ti` | `hp_text_color_mid` |
| `th` | `hp_text_color_high` |
| `pe` | `hp_pulse_enabled` |
| `pt` | `hp_pulse_threshold` |
| `bp` | `hp_pulse_bpm` |
| `pi` | `hp_pulse_intensity` |
| `phb` | `hp_pulse_hide_bar` |
| `pte` | `hp_pulse_text_enabled` |
| `pts` | `hp_pulse_text_scale` |
| `ptp` | `hp_pulse_text_position` |
| `sb` | `hp_skip_buildings` |
| `fe` | `hp_friend_enabled` |
| `fcl` | `hp_friend_color_low` |
| `fcm` | `hp_friend_color_mid` |
| `fch` | `hp_friend_color_high` |
| `fpe` | `hp_friend_pulse_enabled` |
| `fpt` | `hp_friend_pulse_threshold` |
| `fpb` | `hp_friend_pulse_bpm` |
| `fpi` | `hp_friend_pulse_intensity` |
| `fpce` | `hp_friend_pulse_color_enabled` |
| `fpc` | `hp_friend_pulse_color` |

## 7. storageVersion

`hp_registrar.js` sets `storageVersion: 18` in `buildConfig()`. Bump this whenever the schema gains or removes a persisted key, and keep it in sync across all three alias maps.

## 8. POLLING CADENCE TIERS

`healthbar_logic.js` uses these actual schedule values:

| Condition | Next schedule |
|---|---|
| `hp_enabled === false` | loop stops (`gRunning=false`, no reschedule) |
| Root bar not found yet | `0.15` |
| Panel cache not ready yet | `0.15` |
| skip_buildings + `fl & 4` (building/boss) | `0.5` |
| Neutral target (`fl & 2`) | `1.5` |
| Non-enemy target (`!(fl & 1)`) | `0.4` |
| Parent width `<= 0` | `0.18` |
| Width unchanged, no pulse, age > 2000 ms | `1.0` |
| Width unchanged, no pulse, age ≤ 2000 ms | `0.15` |
| Low HP — pulse text enabled | `0.05` |
| Default active cadence | `0.15` |
| Stable above high-HP (`sFC >= 5`) | `min(0.15 × 2^⌊sFC/5⌋, 1.0)` |
| Error recovery path | `0.5` |

Other fixed loops in the same file:

- Bootstrap retry interval: `BOOTSTRAP_RETRY_SEC = 0.5`
- Level-tier loop `lL()`: `0.5`
- Overlay startup bootstrap kick: `0.05`

## 9. ANCESTOR SCAN FLAGS

`healthbar_logic.js` uses `fl` as a bitmask during ancestor scanning (`scan()` walks up to 10 parent levels):

| Bit | Value | Class detected | Meaning |
|---|---|---|---|
| FLAG_ENEMY | `1` | `enemy` | Unit is on the enemy team |
| FLAG_NEUTRAL | `2` | `team_neutral` or `neutral` | Neutral/jungle unit |
| FLAG_BUILDING | `4` | `building`, `boss_tier1`, `boss_tier2`, `boss_barracks` | Building or boss — triggers skip_buildings logic |
| FLAG_FRIEND | `8` | `friend` | Friendly unit — enables early scan break |

Confirmed Deadlock class names from in-game inspection:
- Neutral trooper: `"alive creature WorldUIRoot team_neutral trooper_neutral"`
- Boss: `"alive creature team2 enemy WorldUIRoot boss_tier2"`
- Building/Tower: `"alive creature team2 enemy WorldUIRoot building"`

Derived flags:
- `isEnemy = !!(fl & 1) && !(fl & 2)`
- `isBuilding = !!(fl & 4)` — checked as `if (cfg.hp_skip_buildings && (fl & 4))`

Early-break rules: scan breaks when team ID is set AND any of bits `1|2|4|8` confirmed — `if (t && (f & (1|2|4|8))) break`. The `player` class is NOT scanned by `scan()`; the ally loop `aL()` has its own inline scan checking `friend` (bit 1) and `player` (bit 2) in separate vars `f2`/`aScanF2`.

## 10. SCAN CACHE

- Ancestor scan max depth: `10` levels
- `scan()` (used by `gL()`) runs every tick — no TTL cache
- Ally scan TTL (inline in `aL()`): `2000` ms — friend+player class hierarchy is stable mid-game; uses `aScanF2`/`aScanT2`/`aScanAt`
- `resetScanCache()` clears `scanNextAt` back to `0` and nulls the cached ancestor array

`ensureScanState(now)` rescans when the cached ancestor chain changes or the TTL expires.

## 11. DEBUG FLAG NAMES PER FILE

| File | Debug flags actually present |
|---|---|
| `healthbar_logic.js` | None |
| `hp_registrar.js` | None |
| `anita_ui_core.js` | No debug flags in production build |
| `anita_persist_loader.js` | No debug flags in production build |
| `anita_ui.css` | None |
| `unit_status.css` | None |
| `base_hud.xml` | None |
| `hud_escape_menu.xml` | None |
| `unit_status_overlay.xml` | None |
| `build_hp_colors.ps1` | None |

## 12. KNOWN LIMITATIONS

- `deadlock_hero_debuts_seen` persistence still depends on a clean game exit reaching `cfg/user/game.cfg`.
- If bridge logs show `storage available=0`, restart persistence is not reliable; Copy/Import is the safe manual fallback.
- `GameInterfaceAPI` availability is checked defensively and is not guaranteed in every Panorama context.
- Neutral units are intentionally ignored by the enemy coloring path; the overlay hides the HP counter and skips the enemy HP-ratio loop for neutral targets.
- The color-box drag path still has multiple input sources in the codebase and can vary by Panorama context.
- The picker still polls while drag is active.
- `build_hp_colors.ps1` hardcodes the Deadlock addon destination to `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\` — update this path if your Steam library is on a different drive.

## 13. COLOR PICKER ARCHITECTURE

`anita_ui_core.js` renders color-picker rows inside Anita settings and uses Anita footer/UI refresh plumbing to keep picker state, saved values, and emitted `ANITA_UPDATE` events aligned. `anita_ui.css` defines the picker shell and popup visuals.

The picker structure visible in source is:

- A preview swatch button (`AnitaColorPickerPreview`)
- A popup container (`AnitaColorPopup`)
- A `240x240` framed color box (`AnitaColorBoxFrame`) with hue and saturation layers plus a draggable cursor (`AnitaColorBoxCursor`)
- A hue slider group and a separate saturation slider style (`AnitaHueSliderContainer`, `AnitaSatSliderContainer`)
- Preview/meta/hex labels (`AnitaColorPopupPreview`, `AnitaColorPopupHex`, `AnitaColorPopupMeta`)
- Popup footer buttons (`AnitaColorPopupFooter`, `AnitaColorPopupBtn`)

The existing module documentation and current CSS both indicate the popup is opened from the clicked swatch and presented as a compact anchored panel rather than a full-screen picker.
