# Repo Planning - Deadlock Mods Collection

## Project
Source 2 Panorama UI mods for Valve's Deadlock. Stack: JavaScript / XML / CSS (Panorama), PowerShell build scripts, Python (VData), C# (passive_items_mod compiler).

## Layout
```
{mod}/panorama/          # Source: .js / .css / .xml
{mod}_compiled/          # Compiled output: .vjs_c / .vcss_c / .vxml_c
abilities/scripts/       # Python VData processors
sr2compiler/             # Source 2 quick compiler wrapper
passive_items_mod/       # Standalone mod + C# compiler flow
_archive/                # Non-runtime artifacts (do not edit)
_tmp_* / .tmp/           # Transient build artifacts (ignore)
```

## Build Commands

### Panorama mod (after any .js/.css/.xml edit)
```powershell
"F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\{mod_name}"
```
Or use the `/pack-vpk` skill for full build+deploy.

### HP Colors
```powershell
F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\build_hp_colors.ps1
```

### passive_items_mod
```powershell
F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\passive_items_mod\Apply.bat
```

### Abilities VData
```powershell
cd F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\abilities\scripts
py passive.py abilities2.vdata
py active.py abilities.vdata
```
Or use `build_abilities_paks.ps1` for staged VPKs.

## No automated tests/lint. Validate manually:
1. Compile target mod.
2. Launch Deadlock with `-dev -tools`.
3. Open Panorama debugger (`F7`) or VConsole (`F8`).
4. Run `panorama_reload_layout`.

## JavaScript Conventions
- IIFE + `"use strict"` wrapper on every file.
- 2-space indentation.
- `UPPER_SNAKE_CASE` constants, `camelCase` vars, `_prefix` private state.
- Panel refs grouped: `const UI = { root: null, label: null };`
- Cache panel refs at boot - never call `FindChildTraverse` inside a tick loop.
- Guard panel access: `if (!panel?.IsValid?.()) return;`
- Boot retry pattern: `if (!root?.IsValid?.()) return $.Schedule(0.5, boot);`
- Wrap volatile engine calls in `try/catch`.
- Update DOM only on value change; use adaptive polling (fast in combat, slow idle).

## CSS/XML Conventions
- `visibility: collapse` for hidden panels.
- `overflow: noclip` for glow effects.
- `pre-transform-scale2d` for scaling (not `scale3d`).
- `hittest="false"` on non-interactive overlays.
- No `box-shadow` glows, no `clip-path` (use `style.clip`), never read `Image.src`.

## Active Mods (key ones)
| Mod | Purpose |
|---|---|
| `hp_colors` | Custom HP bar colors with convar persistence (storageVersion 2) |
| `anitaui` | Anita UI core - settings panel host |
| `buff_timer_virgin` | Buff timers moved to top bar |
| `soul_timer` | Countdown for unsecured soul drain |
| `showrank` | MMR/rank badge display |
| `self_hp` | Self health bar override |
| `passive_items_mod` | Configurable passive items via generated JS |

## Key Files
- `AGENTS.md` - full agent guide (conventions, build, anti-patterns)
- `WORKSPACE_STRUCTURE.md` - archive/cleanup policy
- `apis.md` - Panorama API reference
- `build_hp_colors.ps1` - HP colors build pipeline
- `build_abilities_paks.ps1` - abilities VPK staging

## context-mode
This repo uses context-mode MCP. Use `ctx_batch_execute` for any analysis that would produce >20 lines of output. Use `ctx_search` for follow-up queries. Never pipe large outputs into context directly.
