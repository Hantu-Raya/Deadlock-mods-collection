---
description: Build a Deadlock UI mod and package it into a VPK override file in the game's addons directory.
---
# Deadlock VPK Override Workflow

// turbo-all
1. Compile the target mod:
   `& 'F:\Users\Shiv\Desktop\Deadlock-mods-collection\sr2compiler\New folder.exe' 'F:\Users\Shiv\Desktop\Deadlock-mods-collection\{mod_name}'`
2. Pack the compiled output into an addon VPK:
   `& 'F:\Users\Shiv\Desktop\Deadlock-mods-collection\passive_items_mod\compiler\vpkeditcli.exe' 'F:\Users\Shiv\Desktop\Deadlock-mods-collection\{mod_name}_compiled' -o 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak97_dir.vpk' -s`
   *(Update pak97 to pak98/pak99 if needed for higher override priority)*

