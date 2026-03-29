---
name: compile-overwrite
description: Compile a chosen source artifact with a repo build script or staged command, then back up and overwrite the user-selected target file safely. Use when the user wants a build or repack step that replaces one specific file in place.
---

# Compile Overwrite

## Overview

Use this skill when a user wants to compile, repack, or regenerate one artifact and replace one specific target file with the result.
Prefer an existing repo `.ps1` build script when one exists. Keep the workflow narrow: build first, verify second, overwrite last.

## Workflow

1. Confirm the exact source, target, and compile command.
2. Prefer a repo-native `.ps1` build script or local AGENTS instructions before inventing a new command.
3. If the repo has a build script, read it first and follow its staging, pack, and deploy pattern.
4. Compile into a temporary staging location, not directly into the live target.
5. Verify the staged output is the intended file and that it is complete.
6. Back up the current target if it exists.
7. Overwrite only the requested target file with the staged artifact.
8. Re-check the target path, size, and expected contents after replacement.

## PowerShell Build Pattern

The repo's build scripts usually do this in order:

1. Remove stale compiled output or old pack artifacts.
2. Run the compiler or packer.
3. Verify the expected output file exists.
4. Copy or promote the output into the live addon target.

See `references/powershell-build-patterns.md` for the concrete patterns from this repo.

## Guardrails

- Do not overwrite anything other than the user-selected target.
- Do not treat compiled output as source input.
- If the compile step produces multiple artifacts, only promote the one the user asked for.
- If the target lives inside a packed archive or VPK, validate the archive contents before replacing it.
- Keep a backup next to the target when feasible.

## Trigger Examples

Use this skill for requests like:

- "compile this and overwrite the file"
- "repack the output into the live target"
- "build and replace the chosen artifact"
- "back up the old file and overwrite it with the compiled one"
