Always use the `sequentialthinking` MCP tool for non-trivial reasoning, planning, debugging, and design comparison before taking action.

Skip it only for trivial one-step requests, simple factual lookups, or straightforward command execution where extra decomposition adds no value.

When using `sequentialthinking`, keep thoughts concise, advance them step by step, and revise earlier thoughts explicitly when new evidence changes the plan.
# AGENT GUIDE: Deadlock Mods Collection

Project type: Source 2 Panorama UI mods plus VData processing utilities.
Primary output: compiled assets in sibling `_compiled` folders; some package
flows also emit root-level VPKs or dated archives.
Audience: coding agents operating in this repository.

## Scope and Rule Sources
- This root file defines repo-level workflows and standards.
- Subfolder `AGENTS.md` files may add stricter local rules.
- Cursor rules: none found (`.cursorrules` and `.cursor/rules/` absent).
- Copilot rules: none found (`.github/copilot-instructions.md` absent).
- Current checked-out path used by local build examples:
  `F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection`
- Nested `.worktrees/` directories are separate git worktrees on feature branches.
  Do not bulk-edit their `AGENTS.md` files from the main checkout unless the user
  explicitly asks to refresh those branches too.

## Orientation and Context Hygiene
- For broad repo orientation, prefer the context-mode MCP tools (`ctx_batch_execute`, `ctx_search`, `ctx_execute_file`) over dumping large files into context.
- Use subagents only when the user explicitly asks for parallel/subagent work. Keep delegated scans read-only unless the user asks for edits.
- Treat `.agents/system-prompts/` as a local prompt/reference corpus. Search it before modifying it, and do not install prompt-engineering skills from search results without user approval.
- For `/init`-style instruction updates, use `.agents/system-prompts/skill-init-claudemd-and-skill-setup-new-version.md`: inspect existing `AGENTS.md`/`CLAUDE.md`, make targeted diffs, and keep `CLAUDE.md` concise.
- When the user asks to find, install, or evaluate skills, use `.agents/skills/find-skills/SKILL.md`. Verify skill quality before recommending installs; do not install new skills without user approval.
- Before editing any module, check that module's local `AGENTS.md` if present.
- Preserve dirty worktree changes that you did not make.
- For `hp_colors/` work, default to the narrow workflow stack the user asked for: `sequentialthinking` for reasoning, `ctx_execute_file` / `ctx_search` for file reads and repo scanning, `agentmemory` for milestone logging, and the `karpathy-guidelines` plus `caveman full` skills for response and edit style.
- For `hp_colors_minimal/` work, read `hp_colors_minimal/AGENTS.md` first and preserve the two-VPK contract: web-builder preset `pak96_dir.vpk` owns `base_hud`, while minimal runtime `pak97_dir.vpk` owns only overlay/bootstrap/runtime compatibility assets.
- Log meaningful steps, failures, and successes in agentmemory as the work proceeds. Do not treat that as a substitute for repo verification, but do keep it current enough to reconstruct what changed.

## Agentmemory
- To update agentmemory, prefer the `memory_save` MCP tool for durable facts/architecture/workflow memory and `memory_lesson_save` for lessons.
- If those tools are not exposed directly, use the local agentmemory REST MCP bridge:
  `POST http://127.0.0.1:3111/agentmemory/mcp/call`
  with JSON shaped like `{"name":"memory_save","arguments":{...}}` or
  `{"name":"memory_lesson_save","arguments":{...}}`.
- Verify saves with `memory_recall` when available, or by reading
  `GET http://127.0.0.1:3111/agentmemory/memories?latest=true`.
- The local viewer runs at `http://localhost:3113`; desktop shortcuts start/stop the server via `C:\Users\Administrator\.agentmemory\Start-Agentmemory.ps1` and `C:\Users\Administrator\.agentmemory\Stop-Agentmemory.ps1`.
- Codex uses `C:\Users\Administrator\.agentmemory\codex-agentmemory-mcp-proxy.mjs` as a stdio proxy to the `3111` HTTP bridge. If MCP tools disappear after package updates, check that proxy and `C:\Users\Administrator\.codex\config.toml`.
- Use `POST http://127.0.0.1:3111/agentmemory/graph/extract` only as an optional graph-seeding step after the memory save succeeds; do not treat graph extraction as the source of truth.

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
$repo = "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "$repo\sr2compiler\New folder.exe" "$repo\{mod_name}"
```

### Build: hp_colors
Runs schema audit, minifies to `hp_colors_terser/`, compiles, packs, and deploys
`pak97_dir.vpk`.
```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

### Build: hp_colors_minimal
Builds and deploys the minimal HP Colors runtime as `pak97_dir.vpk`. It must be installed alongside the separate web-builder preset `pak96_dir.vpk`.
```powershell
node hp_colors_minimal\scripts\validate-minimal.js
powershell -ExecutionPolicy Bypass -File build_hp_colors_minimal.ps1
```

### Build: buff_timer_virgin
Minifies from `buff_timer_virgin/`, compiles, packs, and deploys `pak98_dir.vpk`.
```powershell
powershell -ExecutionPolicy Bypass -File build_buff_timer_virgin.ps1
```

### Build: 3d hud
Compiles `3d hud/`, packs, and deploys `pak98_dir.vpk`.
```powershell
powershell -ExecutionPolicy Bypass -File build_hud_3d_heroes.ps1
```

### Build: recent_purchase
Minifies from `recent_purchase/`, compiles, packs, and deploys `pak81_dir.vpk`.
```powershell
powershell -ExecutionPolicy Bypass -File build_recent_purchase.ps1
```

### Build: passive_items_mod (recommended for that module)
Generates `mod_settings_data.js` from `settings.json`, detects game, compiles.
```powershell
F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\passive_items_mod\Apply.bat
```

### Build: passive_items_mod compiler executable (if compiler source changed)
```powershell
cd F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\passive_items_mod\compiler
dotnet build Compiler.csproj -c Release
dotnet publish Compiler.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

### Build: abilities VData scripts
```powershell
cd F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\abilities\scripts
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
The full wrapper writes the durable dated `.7z` archives to the Deadlock addons
folder and cleans temporary stage folders/intermediate VPKs after packaging.

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
- `hp_colors_minimal/AGENTS.md` for the two-VPK minimal HP Colors runtime contract.
- `sr2compiler/AGENTS.md` for legacy compiler behavior.
- `passive_items_mod/Apply.bat` for generated-settings compile flow.
- `buff_timer_virgin/AGENTS.md` for advanced performance optimization patterns.
- `3d hud/AGENTS.md` for the custom local-player health HUD and hero scene rules.
- `recent_purchase/AGENTS.md` for quickbuy queue cost math and pack flow.
- `fps/AGENTS.md` for research-only Source 2 performance/config work; re-parse the live target config before recommending values.
- `hud/AGENTS.md` for HUD CSS/VData reference material, not a default deployable mod.
- `shiv/AGENTS.md` for the Shiv soundevent source; soundevents are not built by `sr2compiler`.

## Modules Without Local AGENTS
- `passive_items_mod/` currently relies on this root guide plus `Apply.bat`.
  Read `settings.json`, generated `panorama/scripts/mod_settings_data.js`, and
  `compiler/` before changing its flow.
- `old_color_blind/` has no local guide in this checkout; deep-scan it like a
  legacy mod before editing.

## Reverse Engineering
- When analyzing shipped binaries or runtime behavior, prefer the `ida-pro` MCP server in Codex if it is available.

