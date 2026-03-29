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
- "compile and overwrite"
- "repack"
- Any request to compile a mod and put it in the game

## Workflow

1. **Identify the mod in scope** — from the user message or current working context (e.g. "pak96", "jungle_timer").
2. **Find an existing build script** — look for `build_<mod>.ps1` in the repo root. If found, read it to confirm paths and run it via `powershell -ExecutionPolicy Bypass -File`.
3. **No script found — construct inline** — use the repo's known constants:
   - Compiler: `sr2compiler\New folder.exe`
   - Packer: `passive_items_mod\compiler\vpkeditcli.exe` (flags: `-o <out> -s --no-progress`)
   - Deploy target: `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\`
   - Clean compiled dir and old VPK before each run
4. **Verify output** — confirm the VPK file exists at the deploy destination and report its size.
5. **Report result** — success with file size, or error with the failing step.

## Key Constants (repo-wide)

| Item | Path |
|------|------|
| Compiler | `<root>\sr2compiler\New folder.exe` |
| VPK tool | `<root>\passive_items_mod\compiler\vpkeditcli.exe` |
| Addons dir | `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\` |
| Source pattern | `<root>\<mod>\` |
| Compiled output | `<root>\<mod>_compiled\` |
| VPK output | `<root>\<mod_paknum>_dir.vpk` |

## Design Decisions

- **Prefer existing PS1 scripts** — keeps build logic in one place; the skill orchestrates rather than duplicates.
- **Inline fallback** — allows the skill to work for mods that don't yet have a PS1.
- **No persistence/state** — stateless per invocation; always clean rebuild.
- **Single VPK output** — always use `-s` (single-file) flag to prevent `_001` chunk fragmentation.

## Out of Scope

- Extracting or inspecting existing game VPKs (separate concern)
- Multi-mod batch builds
- Minification/terser pipeline (buff_timer pattern — separate skill if needed)
