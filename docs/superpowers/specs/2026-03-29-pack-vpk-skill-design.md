# Design: pack-vpk Skill

**Date:** 2026-03-29
**Status:** Approved

## Overview

A Claude Code project-level skill that handles the full Deadlock mod build pipeline:
clean → compile (sr2compiler) → pack (vpkeditcli) → deploy to game addons.

## Location

`.claude/skills/pack-vpk/SKILL.md`

## Trigger Phrases

- "pack the vpk"
- "build and deploy"
- "repack"
- Any request to compile a mod and put it in the game

## Key Constants

| Item | Value |
|------|-------|
| Repo root | `F:\Users\Shiv\Desktop\Deadlock-mods-collection` |
| Compiler exe | `<root>\sr2compiler\New folder.exe` |
| Compiler output dir | `<root>\<mod>_compiled\` — compiler always writes here (confirmed from all build scripts) |
| VPK tool exe | `<root>\passive_items_mod\compiler\vpkeditcli.exe` |
| VPK staging path | `<root>\<vpk_name>` (repo root) |
| Addons dir | `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\` |

All inline build commands must run in a **PowerShell** session.

## Known Mod → VPK Name Mapping

| Mod folder | VPK filename |
|------------|-------------|
| `pak96` | `pak96_dir.vpk` |
| `jungle_timer` | `pak98_dir.vpk` |

For any mod not listed: check `build_<mod>.ps1` for `$vpkOut`. If no PS1 exists, ask the user which pak number to use before proceeding.

## Workflow

### Step 1 — Identify mod and resolve VPK name

1a. Identify the mod folder from the user message, session context, or by asking.

1b. Resolve `<vpk_name>`:
- If mod is in the mapping table above, use the listed filename.
- Otherwise look for `build_<mod>.ps1` and read its `$vpkOut` variable.
- If neither exists, ask the user which pak number to assign (e.g. `pak97_dir.vpk`).

### Step 2 — Check for an existing build script

Look for `build_<mod>.ps1` in the repo root.

**If found:** Existing PS1 scripts handle clean, compile, pack, AND deploy in one pass. Run:

```
powershell -ExecutionPolicy Bypass -File "<root>\build_<mod>.ps1"
```

- Any non-zero exit code = hard stop. Report the error output and do not continue.
- On success: skip to **Step 7** (verify + report).

**If not found:** continue to Step 3.

### Step 3 — Clean (PowerShell)

```powershell
if (Test-Path "<root>\<mod>_compiled") { Remove-Item -Recurse -Force "<root>\<mod>_compiled" }
if (Test-Path "<root>\<vpk_name>")     { Remove-Item -Force "<root>\<vpk_name>" }
```

### Step 4 — Compile (PowerShell)

```powershell
$proc = Start-Process -FilePath "<root>\sr2compiler\New folder.exe" `
    -ArgumentList '"<root>\<mod>"' -PassThru -Wait
if ($proc.ExitCode -ne 0) { Write-Error "Compiler failed (exit $($proc.ExitCode))"; exit 1 }
```

Any non-zero exit = hard stop. Do not proceed to pack.

### Step 5 — Pack (PowerShell)

```powershell
$pack = Start-Process -FilePath "<root>\passive_items_mod\compiler\vpkeditcli.exe" `
    -ArgumentList "`"<root>\<mod>_compiled`" -o `"<root>\<vpk_name>`" -s --no-progress" `
    -PassThru -Wait -NoNewWindow
if ($pack.ExitCode -ne 0) { Write-Error "Pack failed (exit $($pack.ExitCode))"; exit 1 }
```

The `-s` flag produces a single-file VPK. `--no-progress` suppresses verbose output (confirmed in repo build scripts). Any non-zero exit = hard stop.

### Step 6 — Deploy (PowerShell)

```powershell
Copy-Item -Path "<root>\<vpk_name>" `
    -Destination "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\<vpk_name>" `
    -Force
```

`-Force` performs unconditional overwrite of the existing live addon file.

### Step 7 — Verify and report

Confirm `<addons_dir>\<vpk_name>` exists and report its size in KB.

- **Success:** "Deployed `<vpk_name>` → addons (`<size> KB`). Launch Deadlock to test."
- **Failure:** name the step that failed and include the error output.

## Design Decisions

- **Prefer PS1 scripts** — they are self-contained (clean + compile + pack + deploy); agent runs them and skips Steps 3–6.
- **Inline fallback** — mirrors the PS1 pattern for mods without a build script.
- **Always clean before build** — prevents stale compiled files from leaking into the VPK.
- **Any non-zero exit = hard stop** — never deploy a partial or corrupt artifact.
- **`-s` flag** — single-file VPK; prevents `_001` chunk fragmentation.
- **`-Force` on deploy** — unconditional overwrite of the live addon file.
- **PowerShell required** — `Start-Process` and `Copy-Item` are PowerShell cmdlets.

## Out of Scope

- Extracting or inspecting existing game VPKs
- Multi-mod batch builds
- Minification/terser pipeline (buff_timer pattern)
