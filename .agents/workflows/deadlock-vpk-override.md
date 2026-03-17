---
description: Build a Deadlock UI mod and package it into a VPK override file in the game's addons directory.
---
# Deadlock VPK Override Workflow

1. Compiles the currently active Deadlock mod (based on workspace context) using the sr2compiler (`New folder.exe`).
// turbo-all
2. Runs `vpkeditcli.exe` to pack the compiled `_compiled` directory into a `.vpk` file.
3. Places the `.vpk` directly into `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak<number>_dir.vpk` (e.g., `pak97_dir.vpk` or `pak99_dir.vpk`) so it overrides the base UI.
