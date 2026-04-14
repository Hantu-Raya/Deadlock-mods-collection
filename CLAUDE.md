# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project
Source 2 Panorama UI mods for Valve's Deadlock. Stack: JavaScript / XML / CSS (Panorama), PowerShell build scripts, Python (VData), C# (passive_items_mod compiler).

## Layout
```
{mod}/panorama/          # Source: .js / .css / .xml
{mod}_compiled/          # Compiled output: .vjs_c / .vcss_c / .vxml_c
abilities/scripts/       # Python VData processors
sr2compiler/             # Source 2 quick compiler wrapper
passive_items_mod/       # Standalone mod + C# compiler flow
test/                    # Archive/experimental mods
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

### passive_items_mod (generates mod_settings_data.js, detects game, compiles)
```powershell
F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\passive_items_mod\Apply.bat
```

### passive_items_mod compiler (only if C# compiler source changed)
```powershell
cd F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\passive_items_mod\compiler
dotnet build Compiler.csproj -c Release
dotnet publish Compiler.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

### Abilities VData
```powershell
cd F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\abilities\scripts
py passive.py abilities2.vdata
py active.py abilities.vdata
py active_no_behavior.py abilities.vdata
```
Batch wrappers: `abilities\scripts\passive.bat`, `active.bat`, `active_no_behavior.bat`.
Pack all three variants with `build_abilities_paks.ps1` for staged VPKs and dated archives.

## Validation (no automated tests/lint)
1. Compile target mod.
2. Launch Deadlock with `-dev -tools`.
3. Open Panorama debugger (`F7`) or VConsole (`F8`).
4. Run `panorama_reload_layout`.
5. Confirm no script errors; check compiled output exists in `{mod}_compiled/panorama/...`.

## JavaScript Conventions
- IIFE + `"use strict"` wrapper on every file.
- 2-space indentation.
- `UPPER_SNAKE_CASE` constants, `camelCase` vars, `_prefix` private state.
- Panel refs grouped: `const UI = { root: null, label: null };`
- Cache panel refs at boot — never call `FindChildTraverse` inside a tick loop.
- Guard panel access: `if (!panel?.IsValid?.()) return;`
- Boot retry pattern: `if (!root?.IsValid?.()) return $.Schedule(0.5, boot);`
- Wrap volatile engine calls in `try/catch`.
- Update DOM only on value change; use adaptive polling (fast in combat, slow idle).
- Prefer squared distance checks over `Math.sqrt` in hot paths.
- Use `transition-property: opacity` for transitions (no layout reflows).
- Debug log tags: `[TAG]` prefix per module (e.g. `[BT-P]`, `[ST-S]`, `[ERR]`).

## CSS/XML Conventions
- `visibility: collapse` for hidden panels.
- `overflow: noclip` for glow effects.
- `pre-transform-scale2d` for scaling (not `scale3d`).
- `hittest="false"` on non-interactive overlays.
- No `box-shadow` glows, no `clip-path` (use `style.clip`), never read `Image.src`.
- Use `s2r://` compiled path style in XML/CSS includes.

## C# Conventions (passive_items_mod compiler)
- TargetFramework: `net9.0`, nullable enabled, sealed data/preference models.
- Single-file self-contained publish; TrimMode `partial` with compression.
- Guard Registry access with `OperatingSystem.IsWindows()`.

## Abilities VData Notes
- `abilities.vdata` / `abilities2.vdata` are ~260k lines each — use string replacement, not full parsers.
- Respect required preprocess/postprocess steps for include blocks.

## Active Mods
| Mod | Purpose |
|---|---|
| `hp_colors` | Custom HP bar colors with convar persistence (storageVersion 2) |
| `anitaui` | Anita UI core — settings panel host |
| `buff_timer_virgin` | Buff timers moved to top bar |
| `soul_timer` | Countdown for unsecured soul drain |
| `showrank` | MMR/rank badge display |
| `self_hp` | Self health bar override |
| `passive_items_mod` | Configurable passive items via generated JS |

## Key References
- `AGENTS.md` — full agent guide (conventions, build, anti-patterns, agentmemory bridge)
- `WORKSPACE_STRUCTURE.md` — archive/cleanup policy
- `apis.md` — Panorama API reference
- `abilities/AGENTS.md` — VData-specific constraints
- `buff_timer_virgin/AGENTS.md` — advanced performance patterns
- `sr2compiler/AGENTS.md` — legacy compiler behavior
- `.agents/system-prompts/skill-init-claudemd-and-skill-setup-new-version.md` — `/init` flow for targeted CLAUDE/skill setup updates
- `.agents/skills/find-skills/SKILL.md` — skill discovery workflow; verify quality before recommending installs

## Agentmemory
When durable repo facts, architecture notes, workflow lessons, or debugging lessons should be saved, use agentmemory.

Preferred tools, when exposed directly:
- `memory_save` for durable facts, architecture, workflows, and decisions. Use comma-separated `concepts` and `files`.
- `memory_lesson_save` for lessons learned. Use comma-separated `tags`, plus `project`, `context`, `confidence`, and `content`.
- Verify with `memory_recall`, or by reading the latest memories if recall is not returning results.

If those MCP tools are not exposed directly, use the local REST MCP bridge:
```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3111/agentmemory/mcp/call" -ContentType "application/json" -Body '{"name":"memory_save","arguments":{"type":"architecture","concepts":"concept one, concept two","files":"path/file.ext","content":"Memory content to save."}}'
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3111/agentmemory/mcp/call" -ContentType "application/json" -Body '{"name":"memory_lesson_save","arguments":{"project":"F:\\Users\\FoxOS_User\\Desktop\\Deadlock-mods-collection","tags":"tag one, tag two","confidence":0.9,"context":"When this lesson applies","content":"Lesson content to save."}}'
```

Verify bridge saves with:
```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3111/agentmemory/mcp/call" -ContentType "application/json" -Body '{"name":"memory_recall","arguments":{"query":"search terms","limit":10}}'
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3111/agentmemory/memories?latest=true"
```

Optional graph seeding uses `POST http://127.0.0.1:3111/agentmemory/graph/extract` after the memory save succeeds. Pass an `observations` array; graph stats are available at `GET http://127.0.0.1:3111/agentmemory/graph/stats`.

Viewer: `http://localhost:3113`. Desktop shortcuts call `C:\Users\Administrator\.agentmemory\Start-Agentmemory.ps1` and `C:\Users\Administrator\.agentmemory\Stop-Agentmemory.ps1`. Codex MCP uses `C:\Users\Administrator\.agentmemory\codex-agentmemory-mcp-proxy.mjs` to reach the `3111` bridge.

## context-mode
This repo uses context-mode MCP. Use `ctx_batch_execute` for any analysis that would produce >20 lines of output. Use `ctx_search` for follow-up queries. Never pipe large outputs into context directly.

## Reasoning
Use the `sequentialthinking` MCP tool for non-trivial planning, debugging, and design decisions before acting. Skip only for trivial one-step requests.
