# AGENT GUIDE: hp_colors

Enemy healthbar coloring mod with an Anita UI settings bridge and runtime
Panorama overlay styling.

## Scope
- This guide applies to `hp_colors/`.
- Edit raw source in `hp_colors/panorama/...`.
- Do not edit `hp_colors_terser/`, `hp_colors_compiled/`, or
  `hp_colors_terser_compiled/` directly; those are build artifacts.
- Root repo rules in `../AGENTS.md` still apply.

## Required Workflow
- Use `sequentialthinking` before non-trivial reasoning, debugging, or design comparison.
- Use the `karpathy-guidelines` skill and keep changes surgical.
- Use the `caveman full` skill for terse communication when responding about this module, including reasoning summaries.
- Use context-mode file readers/search tools for repo inspection instead of ad hoc shell reads when possible.
- Log each meaningful step, failure, and success to agentmemory so the work can be reconstructed later.
- Treat those tools as the default workflow for this folder, not optional extras.

## Build
Use the module build script from the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

The script minifies `hp_colors/` into `hp_colors_terser/`, compiles the terser
copy, syncs `hp_colors_compiled/`, packs `pak96_dir.vpk`, and deploys it to the
Deadlock addons folder configured in that script.

## Runtime Files
| File | Context | Purpose |
|---|---|---|
| `panorama/layout/base_hud.xml` | Base HUD | Loads `anita_ui_core.js`, `hp_registrar.js`, and hosts `AnitaUI_Anchor`. |
| `panorama/layout/hud.xml` | Full HUD | Loads `anita_persist_loader.js` for persistence/bootstrap bridge. |
| `panorama/layout/hud_escape_menu.xml` | Escape menu | Contains stock escape menu; current local changes may also relate to settings UI wiring. |
| `panorama/layout/unit_status_overlay.xml` | Unit status overlay | Loads healthbar behavior for enemy/world unit panels. |
| `panorama/scripts/anita_ui_core.js` | Anita UI core | Renders the settings window, registers mods, emits updates, persists values. |
| `panorama/scripts/hp_registrar.js` | Anita bridge | Defines HP Colors settings schema and registers it with Anita UI. |
| `panorama/scripts/anita_persist_loader.js` | Persistence bridge | Reads stored values and replays bootstrap updates. |
| `panorama/scripts/healthbar_logic.js` | Runtime overlay | Applies enemy HP bar colors/counter settings to unit status panels. |
| `panorama/styles/anita_ui.css` | Anita UI | Settings window, controls, color picker, footer controls. |
| `panorama/styles/unit_status.css` | Unit status | Healthbar and unit status visual overrides. |

## Script Flow
1. `hp_registrar.js` builds the HP Colors schema and registers it.
2. Registration uses direct `root.AnitaUI.Register(config)` when available, then
   also sends an `ANITA_REGISTER` bridge event.
3. `anita_ui_core.js` handles `ANITA_REGISTER`, creates the tab/UI state, then
   sends `ANITA_HANDSHAKE`.
4. `hp_registrar.js` receives `ANITA_HANDSHAKE` and requests bootstrap with
   `ANITA_REQUEST_BOOTSTRAP`.
5. `anita_persist_loader.js` and `anita_ui_core.js` answer bootstrap by replaying
   current or stored settings as `ANITA_UPDATE`.
6. `healthbar_logic.js` consumes `ANITA_UPDATE`, coerces values into runtime
   config, refreshes derived colors, invalidates cached visual state when needed,
   and applies styling during its scheduled overlay loop.

`ANITA_UPDATE` is the runtime settings event. Keep payload fields stable:
`magic_word`, `mod_title`, `setting_id`, `value`, and optional `update_source`.

## Settings Keys
Persisted schema keys:
- General: `hp_enabled`, `hp_mode`, `hp_low_threshold`, `hp_high_threshold`, `hp_bg_visible`, `hp_team_colors`
- Enemy Colors: `hp_color_low`, `hp_color_mid`, `hp_color_high`, `hp_skip_buildings`
- Enemy Pulse: `hp_pulse_enabled`, `hp_pulse_threshold`, `hp_pulse_bpm`, `hp_pulse_intensity`, `hp_pulse_hide_bar`, `hp_pulse_text_enabled`, `hp_pulse_text_scale`, `hp_pulse_text_position`
- Enemy Counter: `hp_counter_size`, `hp_counter_position`, `hp_text_color_mode`, `hp_text_color_low`, `hp_text_color_mid`, `hp_text_color_high`
- Ally Bars: `hp_friend_enabled`, `hp_friend_color_low`, `hp_friend_color_mid`, `hp_friend_color_high`, `hp_friend_pulse_enabled`, `hp_friend_pulse_threshold`, `hp_friend_pulse_bpm`, `hp_friend_pulse_intensity`, `hp_friend_pulse_color_enabled`, `hp_friend_pulse_color`

`hp_pulse_bg_mode` and `hp_npc_poll_slow` are removed. Low-HP pulsing follows the main behavior setting, and polling is automatic/adaptive.

If you add/remove a persisted setting, update all schema/default/alias maps
together in:
- `anita_ui_core.js`
- `anita_persist_loader.js`
- `healthbar_logic.js`
- `hp_registrar.js`

Also bump the registrar `storageVersion` when compatibility requires it (currently 21).

## Persistence Model
- Storage namespace: `hp_colors`
- Storage key: `anita_v1_hp_colors`
- **Primary store: convar-based** via `GameInterfaceAPI.GetSettingString`/`SetSettingString`
  on `deadlock_hero_debuts_seen` with token prefix `[ANITA-v1-hp_colors]:`.
- `$.persistentStorage` is **deprecated/non-functional** in Source 2 Panorama — do not use it.
- Session mirror: root/Hud attributes under `anita_v1_hp_colors`.
- Manual fallback: Anita UI Copy/Import token controls.

The compact persisted payload stores only non-default values using aliases.
Keep alias maps identical across all persistence/runtime files.

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
| `PULSE_INTENSITY` | `PULSE_ANIMATIONS` | Keyframe name array `[subtle, none, intense]` |
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
| `lHpPos` | `lastHpMarginTop` | Last marginTop set on counter |
| `lHpMarginLeft` | `lastHpMarginLeft` | Last marginLeft set on counter |
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
| `lTS` | `lastPulseTextScale` | Last written preTransformScale2d string for pulse text (cache skip) |
| `applyPulseAnim()` | — | Apply animation-duration and animation-name to pulse panels |
| `applyPulseTextState()` | — | Apply/remove pulse text classes and preTransformScale2d based on cfg.hp_pulse_text_enabled |
| `setPulseTextScale(enabled)` | — | Set preTransformScale2d on counter for pulse text expansion |
| `startPulse()` | — | Add pulse class, apply animation, start pulse |
| `clearPulse()` | — | Remove class, clear animation props, reset brightness |

### Counter Helpers
| Short | Full | Purpose |
|-------|------|---------|
| `lTx` | `lastPipLabelText` | Last pip label text (for pMax cache) |
| `cMax` | `cachedMaxHp` | Cached max HP decoded from pips |
| `lCounterText` | — | Last counter text string shown |
| `lCounterLowMode` | — | Whether counter is in low-HP enlarged mode |
| `lCounterAutoPos` | — | Last auto-positioned counter position string |

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
| `fRB()` | `findRedBar()` | Find the health bar panel (tries 3 names) |
| `tryCache()` | `tryCachePanelRefs()` | Cache all panel references, returns 0/1 |
| `scan(p)` | `scanAncestorFlags(panel)` | Walk ancestors to detect team/enemy/neutral |
| `sBC(c)` | `setBarColor(color)` | Set washColor on bar, skip if unchanged |
| `sUC(c)` | `setUltColor(color)` | Set washColor on ult icon, skip if unchanged |
| `sTC(c)` | `setTextColor(color)` | Set washColor on counter text, skip if unchanged |
| `sHBV(v)` | `setHealthBarVisibility(visible)` | Set BG visibility with opacity 0.01 fix |
| `sHCS(low,text)` | `setHpCounterStyle(lowMode,textHint)` | Set counter font size, position, margin |
| `pMax(t)` | `parseMaxHp(pipText)` | Decode max HP from pip label string |
| `uHT(cu,mx,low)` | `updateHpText(currentHp,maxHp,lowMode)` | Update counter text and style |
| `pLv(t)` | `parseLevel(text)` | Extract numeric level from label text |
| `fER(p)` | `findEnemyRoot(panel)` | Walk up to find enemy wrapper |
| `cLU()` | `cacheLevelUnits()` | Cache level-related panel refs |
| `uLT()` | `updateLevelTier()` | Apply level tier CSS class based on level |
| `gL()` | `gameLoop()` | Main poll loop (scheduled recurrently) |
| `lL()` | `levelLoop()` | Level tier poll loop (scheduled recurrently) |
| `ip(c1,c2,t)` | `interpolateColor(c1,c2,t)` | Linear RGB interpolation between two colors |
| `getHighColor()` | — | Get high HP color (respects team colors setting) |
| `getTextColor(hp,low,high)` | — | Get fixed text color based on HP zone |
| `getGradientTextColor(hp,low,high)` | — | Get interpolated text color (respects hp_text_color_mode) |

## Healthbar Runtime Notes
- `healthbar_logic.js` scans up the panel ancestry to classify unit panels.
- Enemy = `enemy` class and not neutral.
- Neutral units are intentionally colored green (`#5BEFB5`).
- `hp_skip_buildings` only affects enemy buildings/bosses; allied buildings short-circuit and keep their current visual state.
- Ally toggle changes now refresh dependent rows immediately.
- Polling is automatic and adaptive: fast for heroes, backs off for stable HP.
- Low HP uses CSS keyframe pulse animation; polling follows normal 0.15s cadence. No JS timer needed for pulse — GPU handles it.
- Pulse text uses inline `preTransformScale2d` (not CSS font-size/margin changes) to avoid layout shift during pulse animation.
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
