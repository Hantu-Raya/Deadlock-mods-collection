---
description: Compile the Dota 2 mod after making script changes
---

# Compile Dota 2 Mod

After making any changes to the Panorama scripts, you need to compile the mod using the workshop tools.

## Compilation Command

```powershell
"F:\Users\Shiv\Desktop\New folder (3)\New folder.exe" "F:\Users\Shiv\Desktop\New folder (3)\hp"
```

## When to Compile

- After editing any `.js` files in `panorama/scripts/`
- After editing any `.css` files in `panorama/styles/`
- After editing any `.xml` files in `panorama/layout/`
- Before testing changes in-game

## Workflow

1. Edit script files (e.g., `healthbar_logic.js`)
2. Run compilation command
3. Wait for compilation to complete
4. Launch Dota 2 and test the mod

## Notes

- The compilation process validates XML/CSS/JS syntax
- Errors will be shown in the compilation output
- Always compile before testing in-game to see your changes
