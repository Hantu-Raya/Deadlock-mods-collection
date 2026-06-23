# AGENT GUIDE: hp_colors

Enemy healthbar coloring mod with an Anita UI settings bridge and runtime
Panorama overlay styling.

## Scope
- This guide applies to `hp_colors/`.
- Edit raw source in `hp_colors/panorama/...`.
- Do not edit `hp_colors_closure/`, `hp_colors_compiled/`, or
  `hp_colors_closure_compiled/` directly; those are build artifacts.
- Root repo rules in `../AGENTS.md` still apply.

## Build
Use the module build script from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

The script runs `hp_colors/scripts/validate-schema.js` (currently expecting 49
settings), Closure ADVANCED-compiles `hp_colors/` into `hp_colors_closure/`,
compiles the Closure copy, syncs `hp_colors_compiled/`, packs `pak97_dir.vpk`,
and deploys it to the Deadlock addons folder configured in that script.

## Runtime Files
| File | Context | Purpose |
|---|---|---|
| `panorama/layout/base_hud.xml` | Base HUD | Loads `anita_ui_core.js` and hosts `AnitaUI_Anchor`. |
| `panorama/layout/hud_escape_menu.xml` | Escape menu | Contains stock escape menu; current local changes may also relate to settings UI wiring. |
| `panorama/layout/unit_status_overlay.xml` | Unit status overlay | Loads healthbar behavior for enemy/world unit panels. |
| `panorama/scripts/anita_ui_core.js` | Anita UI core | Defines HP Colors schema, registers the mod, renders settings, emits updates, persists values, and publishes preset/bootstrap snapshots. |
| `panorama/scripts/healthbar_logic.js` | Runtime overlay | Applies enemy HP bar colors/counter settings to unit status panels. |
| `panorama/styles/anita_ui.css` | Anita UI | Settings window, controls, color picker, footer controls. |
| `panorama/styles/unit_status.css` | Unit status | Healthbar and unit status visual overrides. |

## Anita Color Picker Notes
- Do not parent color picker popups directly to `AnitaWindow`; use a separate
  popup/root host so the popup is not clipped, shifted, or coupled to window
  focus/layout behavior.
- Keep popup positioning deterministic. Avoid delayed layout-measure reposition
  loops that first show at one position and then snap to another; if percentage
  positioning is needed, set the final percentage before making the popup
  interactive.
- Do not recompute final color from cursor panel bounds on release. Release
  should only end dragging; the selected hotspot state owns the color truth.
- Store color-box selection as the cursor center/hotspot in full box
  coordinates, not cursor top-left coordinates and not native drag panel bounds.
- Normalize hue/saturation against the full color box size. Do not use
  `maxCursorX` or `maxCursorY` for color math; those are only for rendering the
  cursor top-left.
- Panorama can report actual screen-scaled sizes while CSS uses logical sizes.
  Convert native cursor/panel bounds back to picker logical units before
  updating selection.
- Native Panorama drag can emit a first sample offset from the saved anchor.
  Offset that first native sample back to the press anchor before applying
  drag movement, or later drags can teleport.
- Keep `PICKER_POS_DEBUG` disabled by default. Re-enable only while capturing
  W.log picker traces; otherwise JSON/debug logging adds drag-time overhead.

## Script Flow
1. `anita_ui_core.js` builds the HP Colors schema with `HPSettingsContract.buildRegistrarConfig()`.
2. `anita_ui_core.js` installs `root.AnitaUI`, queues in-core HP Colors registration, creates the tab/UI state, and sends `ANITA_HANDSHAKE`.
3. `anita_ui_core.js` owns persistence/bootstrap replay. It mirrors current or stored settings and answers bootstrap requests as `ANITA_BULK_UPDATE`; single setting changes still use `ANITA_UPDATE`.
4. `healthbar_logic.js` consumes `ANITA_BULK_UPDATE` and `ANITA_UPDATE`, coerces values into runtime config, refreshes derived colors, invalidates cached visual state when needed, and applies styling during its scheduled overlay loop.

## Match Reset and Fresh Healthbars
- `anita_ui_core.js` owns new-match detection. It publishes
  `GameUI.CustomUIConfig().__hpColorsMatchReset` from an independent monitor
  started when HP Colors registers. Do not make this depend on the scoped hero
  preset watcher.
- Scoped hero preset auto-detection locks after 10 seconds of active match time.
  A locked match must not auto-switch to another preset until lobby/match reset
  or the user changes hero behavior mode. Switching back to AUTO HERO in-match
  opens a fresh 10-second lookup window before locking again.
- Preset hero-scope selection, priority, baked/user row materialization, and
  selected/off/all semantics live behind `HPPresetHeroSelection` in
  `anita_ui_core.js`; keep Panorama row rendering as the adapter.
- The monitor publishes on first active match, `game_time_zero`, and
  `game_time_rollback` when active game time drops from a progressed match back
  near match start. Rollback detection is required because Deadlock can reload a
  tools match without exposing a clean lobby/inactive edge to Panorama.
- The match monitor polls slowly: 1s while early in a match, 5s when idle or
  after the early-match window. It must not scan healthbar panels or use
  `FindChildTraverse` beyond the existing game-time panel lookup.
- `healthbar_logic.js` consumes the shared reset token in its normal enemy/ally
  loops. On a new token it resets only volatile runtime state: panel refs,
  panel-probe timers, scan caches, style skip-write caches, pulse/ally/level
  caches, bootstrap retry state, max-HP pip parsing, and dirty flags. It then
  requests a preset snapshot with reason `match_reset`.
- Duplicate tokens are ignored per overlay. Already-acked stale tokens are
  skipped for later-created overlays so newly spawned healthbar contexts do not
  churn on old match resets.
- Do not ship match-reset verbose log helpers or debug-status bridges in the
  production mod. If temporary W.log tracing is needed, add it only for the
  investigation build and remove it before packing.

`ANITA_UPDATE` is the single-setting runtime event. Keep payload fields stable:
`magic_word`, `mod_title`, `setting_id`, `value`, and optional `update_source`.
`ANITA_BULK_UPDATE` carries `values` plus the same bridge metadata; keep both
paths working.

## Settings Keys
Persisted schema keys:
- General: `hp_enabled`, `hp_bg_visible`, `hp_mode`, `hp_low_threshold`, `hp_high_threshold`, `hp_team_colors`, `hp_skip_buildings`, `hp_info_health_margin_top`, `hp_healthbar_height`
- Enemy Colors: `hp_ult_color_enabled`, `hp_ult_color_custom`, `hp_color_low`, `hp_color_mid`, `hp_color_high`
- Enemy Pulse: `hp_pulse_enabled`, `hp_pulse_threshold`, `hp_pulse_bpm`, `hp_pulse_intensity`, `hp_pulse_color_enabled`, `hp_pulse_color`, `hp_pulse_color_mode`, `hp_pulse_hide_bar`, `hp_pulse_text_enabled`, `hp_pulse_text_scale`, `hp_pulse_text_position`
- Enemy Counter: `hp_counter_visible`, `hp_counter_size`, `hp_counter_position`, `hp_counter_format`, `hp_text_color_mode`, `hp_level_number_visible`, `hp_pip_visible`, `hp_text_color_low`, `hp_text_color_mid`, `hp_text_color_high`
- Ally Bars: `hp_friend_enabled`, `hp_friend_color_low`, `hp_friend_color_mid`, `hp_friend_color_high`, `hp_friend_pulse_enabled`, `hp_friend_pulse_threshold`, `hp_friend_pulse_bpm`, `hp_friend_pulse_intensity`, `hp_friend_pulse_color_enabled`, `hp_friend_pulse_color`
- Kill Marker: `hp_kill_zone_enabled`, `hp_kill_zone_threshold`, `hp_kill_zone_color`, `hp_kill_zone_width`

`hp_pulse_bg_mode` and `hp_npc_poll_slow` are removed. Low-HP pulsing follows the main behavior setting, and polling is automatic/adaptive.

If you add/remove a persisted setting, update all schema/default/alias contract
adapters together:
- `anita_ui_core.js` `HPSettingsContract.SETTINGS`, `HPSettingsContract.ALIASES`, preset support, and UI defaults
- `healthbar_logic.js` `DEFAULTS` and runtime handling
- `scripts/validate-schema.js` audit expectations

Also bump `HPSettingsContract.storageVersion` when compatibility requires it (currently 97).

## Persistence Model
- Storage namespace: `hp_colors`
- Storage key: `anita_v1_hp_colors`
- Runtime healthbars do not read convars. Compact-token parsing and persistence
  belong to Anita/import/preset paths, not `healthbar_logic.js`.
- `$.persistentStorage` is **deprecated/non-functional** in Source 2 Panorama — do not use it.
- Runtime bridge: `GameUI.CustomUIConfig().__hpColorsCfgRaw` plus
  replayed `HP_COLORS_PRESET_SNAPSHOT` events.
- Session mirror: root/Hud attributes under `anita_v1_hp_colors`.
- Manual fallback: Anita UI Copy/Import token controls and preset VPK rows.

The compact persisted payload stores only non-default values using aliases.
Keep compact alias maps deterministic and do not add compact alias parsing back
into `healthbar_logic.js`.

## Obfuscated Name Map (healthbar_logic.js)

Short names are used in `healthbar_logic.js` to reduce file size.
Below is the full mapping so you know what each name actually does.

### Settings & Constants
| Short | Full | Purpose |
|-------|------|---------|
| `cfg` | `config` | Runtime settings object |
| `TITLE` | — | Mod title string `"HP Colors"` |
| `DEFAULTS` | — | Default setting values |
| `TEAM1_HIGH` | — | Team 1 high-HP color `#FFC961` |
| `TEAM2_HIGH` | — | Team 2 high-HP color `#6485FC` |
| `WHITE_WASH` | — | Default white wash color `#ffffff` |
| `LP` | `LOW_PULSE_CLASS` | CSS class `low_hp_pulsing` |
| `PULSE_INTENSITY` | `PULSE_ANIMATIONS` | Keyframe name array `[subtle, medium, intense]` |
| `BOOTSTRAP_NAMESPACE` | — | Bootstrap namespace `"hp_colors"` |

### Panel Cache Variables
| Short | Full | Purpose |
|-------|------|---------|
| `ctx` | `contextPanel` | Root context panel |
| `us` | `unitStatus` | UnitStatus panel |
| `hc` | `hpCounter` | HP counter label panel |
| `bg` | `backgroundBar` | HP background bar panel |
| `pl` | `pipLabel` | Pip label panel (max HP decoder) |
| `lb` | `laggingBar` | Healthbar lagging panel |
| `lbp` | `laggingBarParent` | Parent of lagging bar |
| `rb` | `redBar` | Red/health bar panel (the bar being colored) |
| `cp` | `containerPanel` | Container/parent panel for width math |
| `ui` | `ultIcon` | Ultimate ready icon panel |
| `cached` | `panelCacheReady` | Whether panel refs are cached (0/1) |
| `att` | `cacheAttempts` | Number of cache attempts made |

### Last-Value Cache Variables (skip redundant writes)
| Short | Full | Purpose |
|-------|------|---------|
| `lCol` | `lastBarColor` | Last washColor set on bar |
| `lUlt` | `lastUltColor` | Last washColor set on ult icon |
| `lTxt` | `lastTextColor` | Last washColor set on counter text |
| `lBgVis` | `lastBgVisibility` | Last visibility state of background |
| `lBgOp` | `lastBgOpacity` | Last opacity state of background |
| `lHpSize` | `lastHpFontSize` | Last fontSize set on counter |
| `lSH` | `lastShownCurrentHp` | Last current HP shown in counter |
| `lSM` | `lastShownMaxHp` | Last max HP shown in counter |
| `lVis` | `lastCounterVisibility` | Last visibility state of counter |
| `lW` | `lastBarWidth` | Last measured bar width |
| `lPW` | `lastParentWidth` | Last measured parent width |
| `lHp` | `lastHpPercent` | Last HP percentage |
| `pPct` | `prevHpPercent` | Previous HP percentage (for stable count) |
| `sFC` | `stableFrameCount` | Frames at same HP (for backoff) |
| `lUT` | `lastUpdateTime` | Timestamp of last visual update |
| `lAT` | `lastAncestorTime` | Timestamp of last ancestor scan |

### Team/Flag Scan
| Short | Full | Purpose |
|-------|------|---------|
| `tid` | `teamId` | Detected team (1 or 2) |
| `fl` | `flags` | Bit flags: 1=enemy, 2=neutral, 4=building/boss, 8=friend |

### Pulse & Gradient
| Short | Full | Purpose |
|-------|------|---------|
| `pulse` | `isPulsing` | Whether CSS keyframe pulse is active |
| `lPD` | `lastPulseDuration` | Last written animation-duration string (cache skip) |
| `lPI` | `lastPulseIntensity` | Last written animation-name index (cache skip) |
| `PULSE_INTENSITY` | `PULSE_ANIMATIONS` | Keyframe name array: [subtle, medium, intense] - used for pulse intensity class names |
| `lTB` | `lastPulseTextBrightness` | Last inline brightness value for pulse text |
| `syncEnemyPulse(shouldPulse,now)` | — | Starts/stops enemy pulse, syncs duration/intensity, and updates pulse-text brightness |
| `syncAllyPulse(panel,shouldPulse)` | — | Starts/stops ally pulse class, intensity, and duration |
| `clearPulse()` | — | Remove enemy pulse class, clear animation props, reset brightness |

### Counter Helpers
| Short | Full | Purpose |
|-------|------|---------|
| `lTx` | `lastPipLabelText` | Last pip label text (for pMax cache) |
| `cMax` | `cachedMaxHp` | Cached max HP decoded from pips |
| `lCounterLowMode` | — | Whether counter is in low-HP enlarged mode |

### Level Tier
| Short | Full | Purpose |
|-------|------|---------|
| `LT_` | `LEVEL_THRESHOLDS` | Level thresholds `[11, 19, 27, 35]` |
| `LC_` | `LEVEL_CLASSES` | CSS class names per tier |
| `ll` | `levelLabel` | Level label panel ref |
| `lc` | `levelContainer` | Level container panel ref |
| `wr` | `wrapperPanel` | Enemy wrapper for class toggling |
| `lLv` | `lastLevel` | Last level value applied |

### Functions
| Short | Full | Purpose |
|-------|------|---------|
| `fRB()` | `findRedBar()` | Find the verified `unit_healthbar_lagging` panel |
| `tryCache()` | `tryCachePanelRefs()` | Cache verified panel references, returns 0/1 |
| `scan(p)` | `scanAncestorFlags(panel)` | Walk ancestors to detect team/enemy/neutral |
| `sBC(c)` | `setBarColor(color)` | Set washColor on bar, skip if unchanged |
| `sUC(c)` | `setUltColor(color)` | Set washColor on ult icon, skip if unchanged |
| `sTC(c)` | `setTextColor(color)` | Set washColor on counter text, skip if unchanged |
| `sHBV(v)` | `setHealthBarVisibility(visible)` | Set BG visibility with opacity 0.01 fix |
| `sHCS(low)` | `setHpCounterStyle(lowMode)` | Set counter font size, height, and anchor transform |
| `pMax(t)` | `parseMaxHp(pipText)` | Decode max HP from pip label string |
| `uHT(cu,mx,low)` | `updateHpText(currentHp,maxHp,lowMode)` | Update counter text and style |
| `syncLevelTier()` | — | Cache level refs, toggle enemy level visibility, and apply tier classes |
| `applyLayoutSettings()` | — | Apply info-health margin, healthbar height, and pip sizing |
| `resetAllyState(panel,resetColor)` | — | Clear ally caches/pulse and optionally restore confirmed ally bar color |
| `applyEnemyHealthColors()` | — | Paint enemy bar/ult/text colors, including gated pulse color |
| `gL()` | `gameLoop()` | Main poll loop (scheduled recurrently) |
| `lL()` | `levelLoop()` | Level tier poll loop (scheduled recurrently) |
| `ipHex(c1,c2,t)` | `interpolateColor(c1,c2,t)` | Linear RGB interpolation between two hex colors |
| `getHighColor()` | — | Get high HP color (respects team colors setting) |
| `getTextColor(hp,low,high)` | — | Get fixed text color based on HP zone |
| `getGradientTextColor(hp,low,high)` | — | Get interpolated text color (respects hp_text_color_mode) |

## Healthbar Runtime Notes
- `healthbar_logic.js` scans up the panel ancestry to classify unit panels.
- Enemy = `enemy` class and not neutral.
- Neutral units are intentionally colored green (`#5BEFB5`).
- First-paint policy matches the verified `hp_colors_minimal_color_debug/` lane: the bare main bar defaults to `TeamEnemyColor`; `.team_neutral #unit_healthbar_lagging` overrides it for jungle/neutral bars and must stay present. Do not add width-threshold or recent-panel heuristics here.
- `hp_skip_buildings` skips all building/boss bars before preset coloring; enemy buildings keep the enemy default, friendly buildings reset to white, and neutral buildings keep neutral green.
- Ally toggle changes now refresh dependent rows immediately.
- Polling is automatic and adaptive: fast for heroes, backs off for stable HP.
- Low HP uses CSS keyframe pulse animation; polling follows normal adaptive cadence. No JS animation timer is added.
- Pulse text uses larger inline font size, counter height, anchor transform, and brightness while pulsing; it does not use a separate CSS class or JS animation timer.
- Enemy pulse has hard gates. When `hp_pulse_enabled` is false or `shouldPulse`
  is false, do not run pulse color math, pulse text brightness work, or
  hide-bar behavior. `hp_pulse_threshold` controls pulse start independently of
  `hp_low_threshold`.
- Custom enemy pulse color is also hard gated. `hp_pulse_color_enabled=false`
  must preserve the normal bar/ult color path exactly. Fixed mode uses
  `hp_pulse_color` only while pulsing. Gradient mode blends the already computed
  normal bar color toward `hp_pulse_color` by HP depth inside
  `hp_pulse_threshold`; do not add time-based JS animation for this.
- Changing `hp_pulse_color_enabled`, `hp_pulse_color`, or
  `hp_pulse_color_mode` must invalidate cached bar/ult color state and force a
  quick enemy visual reapply without starting a new repeating loop.
- BG visibility always uses `visibility: visible` with opacity toggle (0.01/1.0)
  to prevent HP bar width updates from stalling. Never use `visibility: collapse`.

## Text Color Behavior
- Mode 0 (By HP %): Text color mirrors the bar color — low HP = bar low color,
  mid HP = bar mid color, high HP = bar high color or team color. Gradient mode
  interpolates text colors just like bar colors.
- Mode 1 (Custom): Text color uses `hp_text_color_low/mid/high` settings. Gradient
  mode interpolates between custom text colors; fixed mode uses stepped colors.

Do not add `FindChildTraverse` calls to hot scheduled loops unless guarded by
cache/TTL behavior.

## Editing Rules
- Preserve IIFE + strict mode style in JS.
- Keep settings IDs and compact aliases deterministic and ASCII-safe.
- Guard volatile Panorama/game API calls with validity checks and `try/catch`.
- Guard DOM/style writes; do not write text/style every frame when unchanged.
- Keep generated/minified/compiled folders out of manual edits.
- Before changing persistence, verify bootstrap from fresh load and live UI
  updates through `ANITA_UPDATE`.

## Validation
After behavior edits:
1. Run `powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1`.
2. Launch Deadlock with `-dev -tools`.
3. Open Panorama debugger (`F7`) or VConsole (`F8`).
4. Verify Anita UI registers HP Colors, settings persist, Copy/Import works when
   needed, and enemy healthbars update without script errors.
