Always use the `sequentialthinking` MCP tool for non-trivial reasoning, planning, debugging, and design comparison before taking action.

Skip it only for trivial one-step requests, simple factual lookups, or straightforward command execution where extra decomposition adds no value.

When using `sequentialthinking`, keep thoughts concise, advance them step by step, and revise earlier thoughts explicitly when new evidence changes the plan.
# AGENT GUIDE: Deadlock Mods Collection

Project type: Source 2 Panorama UI mods plus VData processing utilities.
Primary output: compiled assets in sibling `_compiled` folders.
Audience: coding agents operating in this repository.

## Scope and Rule Sources
- This root file defines repo-level workflows and standards.
- Subfolder `AGENTS.md` files may add stricter local rules.
- Cursor rules: none found (`.cursorrules` and `.cursor/rules/` absent).
- Copilot rules: none found (`.github/copilot-instructions.md` absent).

## Repository Layout
```text
./
├── {mod}/panorama/                 # Raw Panorama source (scripts/styles/layout)
├── {mod}_compiled/                 # Compiled outputs (.vjs_c/.vcss_c/.vxml_c)
├── abilities/                      # Large VData files + Python processors
├── sr2compiler/                    # Legacy Source2 quick compiler wrapper
├── passive_items_mod/              # Standalone configurable mod + local compiler
└── test/                           # Archive/experimental mods
```

## Build, Lint, and Test Commands

### Build: Panorama mods (default)
Run after any `.js`, `.css`, or `.xml` edit.
```powershell
"F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe" "F:\Users\Shiv\Desktop\Deadlock-mods-collection\{mod_name}"
```

### Build: passive_items_mod (recommended for that module)
Generates `mod_settings_data.js` from `settings.json`, detects game, compiles.
```powershell
F:\Users\Shiv\Desktop\Deadlock-mods-collection\passive_items_mod\Apply.bat
```

### Build: passive_items_mod compiler executable (if compiler source changed)
```powershell
cd F:\Users\Shiv\Desktop\Deadlock-mods-collection\passive_items_mod\compiler
dotnet build Compiler.csproj -c Release
dotnet publish Compiler.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

### Build: abilities VData scripts
```powershell
cd F:\Users\Shiv\Desktop\Deadlock-mods-collection\abilities\scripts
py passive.py abilities2.vdata
py active.py abilities.vdata
py active_no_behavior.py abilities.vdata
```
Batch wrappers:
```powershell
abilities\scripts\passive.bat
abilities\scripts\active.bat
abilities\scripts\active_no_behavior.bat
```
Pack all three variants with `build_abilities_paks.ps1` when you need the staged VPKs and dated archives.

### Lint/Test status
- No repository-wide lint command is defined.
- No automated unit/integration test runner is defined.
- Validation is manual in Deadlock tools mode.

### Single-test equivalent
There is no formal single test command. Use this focused loop:
1. Compile only the target mod.
2. Launch Deadlock with `-dev -tools`.
3. Open Panorama debugger (`F7`) or VConsole (`F8`).
4. Run `panorama_reload_layout` to validate only changed UI quickly.

## Manual Validation Checklist
- Compiled output exists in `{mod}_compiled/panorama/...`.
- No script errors in Panorama debugger console.
- Target panel is visible and positioned correctly.
- Overlay does not block gameplay input unexpectedly.

## JavaScript (Panorama) Conventions
- Wrap each file in IIFE + strict mode:
  ```javascript
  (() => {
    "use strict";
  })();
  ```
- Indentation: 2 spaces.
- Constants: `UPPER_SNAKE_CASE` near top of file.
- Variables/state: `camelCase`.
- Internal cache/private state: `_prefixed`.
- Group panel refs under one object:
  `const UI = { root: null, label: null, ... };`

## Imports and Asset References
- Use Source 2 compiled path style (`s2r://...`) in XML/CSS includes.
- Keep layout includes minimal and deterministic.
- Do not add unrelated script/style includes to base HUD layouts.

## Naming Conventions
| Type | Convention | Example |
|---|---|---|
| Constants | UPPER_SNAKE_CASE | `TICK_FAST`, `CLAIM_RADIUS_SQ` |
| State vars | camelCase | `lastSec`, `buffStart` |
| Internal/cache | _prefix | `_lastText`, `_tCache` |
| UI refs | UI.field | `UI.container`, `UI.label` |
| Debug tags | [TAG] | `[BT-P]`, `[ST-S]`, `[ERR]` |

## Types and Data Handling
- Coerce and clamp external values defensively (`Number`, range guards).
- Keep generated settings payload deterministic and ASCII-safe.
- For large VData, prefer stream/text transforms over heavy in-memory parsing.

## Error Handling Rules
- Never access panel members before validity checks:
  `if (!panel?.IsValid?.()) return;`
- Wrap volatile engine calls (`Game.*`, `$.*`) in `try/catch` when state can race.
- Use boot retry for delayed panel availability:
  `if (!root?.IsValid?.()) return $.Schedule(0.5, boot);`
- Fail safe in loops; avoid throwing hard exceptions during runtime ticks.

## Performance Rules (Critical)
- Do not call `FindChildTraverse` inside scheduled loops.
- Cache panel references once during boot/init.
- Guard DOM writes; update only on value change.
- Prefer squared distance checks (`distSq`) over `Math.sqrt` in hot paths.
- Use adaptive polling intervals (fast in combat, slow when idle).
- Use `transition-property: opacity` for transitions (no layout reflows).

## CSS and XML Conventions
- Use `visibility: collapse` for hidden Panorama panels.
- Use `overflow: noclip` for glow and overflow visual effects.
- Prefer `pre-transform-scale2d` for cleaner scaling animations.
- Set `hittest="false"` on overlays that should not capture input.
- Use intentional high `z-index` for HUD layers when required.

## Abilities (VData) Notes
- `abilities.vdata` and `abilities2.vdata` are huge (~260k lines each).
- Processing scripts in `abilities/scripts` use string replacement patterns.
- Required preprocess/postprocess steps (for include blocks) must be respected.
- Use string replacement, not full VData parsers.

## C# Compiler Conventions
- TargetFramework: `net9.0`
- Use nullable reference types (`<Nullable>enable</Nullable>`).
- Single-file self-contained publish for distribution.
- TrimMode: `partial` with compression for smaller binaries.
- Sealed classes for preference/data models.
- Registry access guarded with `OperatingSystem.IsWindows()`.

## Anti-Patterns to Avoid
- Repeated `FindChildTraverse` calls in tick loops.
- Unconditional text/style writes each frame.
- Compiling non-asset files as if they were resourcecompiler inputs.
- Assuming automated tests/lints exist when they do not.
- `box-shadow` glows (use pre-transform-scale2d panels instead).
- Reading `Image.src` property (write-only in Panorama).
- `scale3d` (use pre-transform-scale2d only).
- `clip-path` (use style.clip instead).

## Recommended Agent Workflow
1. Identify target module and check local `AGENTS.md` in that folder.
2. Make minimal source edits in `panorama/` or `abilities/scripts`.
3. Run the correct build command for that module.
4. Perform focused manual validation in tools mode.
5. Report what was verified and what remains manual.

## Useful References
- `abilities/AGENTS.md` for VData-specific constraints.
- `sr2compiler/AGENTS.md` for legacy compiler behavior.
- `passive_items_mod/Apply.bat` for generated-settings compile flow.
- `buff_timer_virgin/AGENTS.md` for advanced performance optimization patterns.

## Reverse Engineering
- When analyzing shipped binaries or runtime behavior, prefer the `ida-pro` MCP server in Codex if it is available.

