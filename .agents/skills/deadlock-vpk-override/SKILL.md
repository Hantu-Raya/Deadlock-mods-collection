---
name: deadlock-vpk-override
description: Compile any Deadlock mod in this repo, package the compiled output into a VPK using `passive_items_mod/compiler/vpkeditcli.exe`, then deploy by overriding or saving to a chosen destination (including explicit pak index such as pak97). Use this when the user asks to build a mod and override a VPK in the Deadlock addons folder.
---

# Deadlock Vpk Override

## Overview

Execute one deterministic workflow:
1. Compile target mod (`-ModName`).
2. Pack `.vpk` with `vpkeditcli.exe`.
3. Resolve where to override/save VPK.
4. Remember the selected destination for future runs.

## Workflow

1. Confirm target mod + pak index:
   - Repo root: `F:\Users\Shiv\Desktop\Deadlock-mods-collection`
   - Target mod folder: `<RepoRoot>\<ModName>`
   - Pack name: `pak<PakNumber>_dir.vpk`
   - Default deploy directory: `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons`
2. Resolve override/save destination before deployment:
   - If the user gives a directory, deploy as `<directory>\pak<PakNumber>_dir.vpk`.
   - If the user gives a `.vpk` file path, deploy to that exact file.
   - If destination is missing, reuse remembered destination; if none exists, use default deploy directory.
   - For non-interactive execution, pass `-NoPrompt`.
3. Run the automation script:
   - `powershell -ExecutionPolicy Bypass -File ".agents/skills/deadlock-vpk-override/scripts/compile-pack-deploy.ps1"`
   - Explicit example (`buff_timer_virgin`, `pak97`, no prompt):
     `powershell -ExecutionPolicy Bypass -File ".agents/skills/deadlock-vpk-override/scripts/compile-pack-deploy.ps1" -ModName "buff_timer_virgin" -PakNumber 97 -Destination "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak97_dir.vpk" -NoPrompt`
   - Explicit directory deployment:
     `powershell -ExecutionPolicy Bypass -File ".agents/skills/deadlock-vpk-override/scripts/compile-pack-deploy.ps1" -ModName "buff_timer_virgin" -PakNumber 97 -Destination "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons" -NoPrompt`
4. Report:
   - Whether compile succeeded.
   - The produced VPK path.
   - The final deployed path.

## Behavior Rules

- Use this exact VPK packer executable:
  `F:\Users\Shiv\Desktop\Deadlock-mods-collection\passive_items_mod\compiler\vpkeditcli.exe`
- Pack from:
  `F:\Users\Shiv\Desktop\Deadlock-mods-collection\<ModName>_compiled`
- Output packed VPK as:
  `F:\Users\Shiv\Desktop\Deadlock-mods-collection\pak<PakNumber>_dir.vpk`
- Persist the latest chosen destination in:
  `.agents/skills/deadlock-vpk-override/scripts/deploy-config.json`
- Override existing target files with `-Force`.
- If `<ModName>\Apply.bat` exists, use it to compile. Otherwise use:
  `F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe "<RepoRoot>\<ModName>"`
